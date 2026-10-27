/**
 * dsh-glm-guard — execution-boundary guard row (S1 subset).
 *
 * Seam (verified): the `tools/pre-execute` waterfall receives the pending
 * call and returns a PreToolDecision; returning a deny decision with reason
 * text blocks the call before execution. The four-part corrective message is
 * the reason — deny stays hard, teaching rides along. Every denial is
 * journaled in the project directory (`<home>/audit/violations.jsonl`; the
 * row's own home, else the data service's, docs/DESIGN.md §2.4). Each
 * root call reports the row health of its session (src/shared/health.ts).
 *
 * Declaration (告知, docs/ORCHESTRATION.md §6.1): on a GLM route the active
 * rules are declared in one system prompt section, appended after the
 * agent-scoped assembly (`glm:guard`). Rules only change with the session
 * directory, which is immutable, so the prompt stays stable step to step.
 *
 * Shadow fallback (§6.5): file-tools-only also compares each turn's
 * workspace-changes summary with the turn's file-tool targets and records,
 * never blocks, files a shell call changed unseen (src/guard/shadow.ts).
 *
 * Containment roots come from config, else the calling Agent's immutable
 * session directory (session.header.cwd), else the containment rule is
 * skipped for that call — never the plugin process cwd, which is the harness
 * install directory, not the workspace, and never a throw at activation.
 */
import { evaluate, fileToolsOnly, renderCorrection, workspaceContainment, type GuardRule, type ToolCall } from './rules.ts'
import { shadowFallback, type ShadowRecord } from './shadow.ts'
import { rowJournal, type AuditFs } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { assemblyRoute, isGlmModel } from '../shared/route.ts'
import type { JsonValue } from '../glm-prompt/json.ts'
import type { AgentLike, AssembledSection, PluginContext, PreExecuteHost, ProvideHost, ServiceLookup, SessionEventHost } from '../shared/dsh-min.ts'

/** One audit record (JSONL line) for a denied call. */
export interface ViolationRecord {
  readonly at: string
  readonly rule: string
  readonly tool: string
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  readonly correction: string
}

/** A line of the violation journal: an enforced denial or a shadow record. */
export type GuardRecord = ViolationRecord | ShadowRecord

export interface GuardConfig {
  /** Workspace roots writes are confined to; defaults to the calling agent's session directory. */
  readonly workspaceRoots?: readonly string[] | undefined
  /** Extra rules beyond the two shipped ones. */
  readonly rules?: readonly GuardRule[]
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the data service's. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs
}

/** All active rules (shipped two first so user rules cannot weaken them). */
export function activeRules(config: GuardConfig & { workspaceRoots: readonly string[] | undefined }): readonly GuardRule[] {
  return [...(config.workspaceRoots === undefined ? [] : [workspaceContainment(config.workspaceRoots)]), fileToolsOnly, ...(config.rules ?? [])]
}

/** Containment roots for one agent: config wins, else the agent's session directory. */
export function rootsFor(agent: AgentLike | undefined, config: GuardConfig): readonly string[] | undefined {
  if (config.workspaceRoots !== undefined) return config.workspaceRoots
  const cwd = agent?.session?.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? [cwd] : undefined
}

/** The name of the system prompt section that declares the active rules. */
export const DECLARATION_SECTION = 'glm:guard'

/** The rule declaration section: one line per rule that declares itself. */
export function declarationSection(rules: readonly GuardRule[]): AssembledSection {
  return {
    name: DECLARATION_SECTION,
    text: [
      '# Workspace rules',
      'The harness checks every tool call against these rules before it runs; a call that breaks one is denied with the reason and the right way to proceed.',
      ...rules.filter(rule => rule.declare.length > 0).map(rule => `- ${rule.declare}`),
    ].join('\n'),
    // Declarations are literal text; a rule may mention `{{` without meaning a prompt variable.
    interpolate: false,
  }
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/guard'

/** The guard's status for one call's session (row health): which rules can judge, where denials go, and the shadow fallback. */
export function guardHealth(roots: readonly string[] | undefined, projectHome: string | undefined, shadow = false): [HealthState, string] {
  const scope = roots === undefined ? '门禁生效（file-tools-only）' : `门禁生效（file-tools-only，圈禁根 ${roots.join('、')}）`
  const gaps = [
    ...(roots === undefined ? ['会话没有工作目录，圈禁规则跳过'] : []),
    ...(projectHome === undefined ? ['无项目目录，违规不落盘'] : []),
  ]
  const fallback = shadow ? '影子兜底：工作区变更记录' : '影子兜底未启用（组合里没有 workspace-changes）'
  return gaps.length === 0 ? ['active', `${scope}；违规记入 ${projectHome}；${fallback}`] : ['degraded', `${scope}；${gaps.join('；')}；${fallback}`]
}

type GuardHost = PreExecuteHost & SessionEventHost & Pick<PluginContext, 'on'> & ServiceLookup & Partial<ProvideHost>

/** cordis plugin entry. */
export function apply(ctx: GuardHost, config: GuardConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'guard', 'active', config.workspaceRoots === undefined ? '已加载，圈禁根取会话目录' : '已加载，圈禁根取配置')
  const journal = rowJournal(name, () => dataHomes(ctx, config.home), config.fs)
  const shadow = shadowFallback(ctx, record => void journal.violation(record))
  const installed = new WeakSet<AgentLike>()
  const disposers: Array<() => void> = [() => health.dispose()]

  disposers.push(ctx.on('tools/pre-execute', async (payload, next) => {
    if (payload.parent !== undefined) return next()
    const call: ToolCall = { name: payload.name, arguments: (payload.arguments ?? {}) as JsonValue }
    const roots = rootsFor(payload.agent, config)
    health.report(sessionIdOf(payload.agent), ...guardHealth(roots, dataHomes(ctx, config.home).projectHome, shadow.available()))
    const rules = activeRules({ ...config, workspaceRoots: roots })
    const verdict = evaluate(rules, call)
    if (verdict.kind === 'deny') {
      // rc.3 executions carry the calling agent, not its ids (dsh-tools createExecution).
      void journal.violation({
        at: new Date().toISOString(),
        rule: verdict.rule,
        tool: payload.name,
        agentId: payload.agent?.id,
        sessionId: payload.agent?.session?.id,
        correction: renderCorrection(verdict.correction),
      })
      return { kind: 'deny', reason: renderCorrection(verdict.correction) }
    }
    const decision = await next()
    if (decision.kind === 'allow') shadow.observe(payload)
    return decision
  }))

  disposers.push(ctx.on('session/event', (session, event) => shadow.event(session, event)))
  disposers.push(ctx.on('session/disposed', session => shadow.disposed(session)))

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      // Prepend, like the dialect row: post-`next()` sees the route the
      // model selection injected. Appended last either way, whichever of
      // the two listeners is outermost.
      disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const assembled = await next()
        if (!isGlmModel(assemblyRoute(assembled).model)) return assembled
        const rules = activeRules({ ...config, workspaceRoots: rootsFor(agent, config) })
        return { ...assembled, sections: [...assembled.sections, declarationSection(rules)] }
      }, { prepend: true }))
    }
    catch (error) {
      // Agent creation must never fail on the declaration; the gate still holds.
      console.warn(`${name}: rule declaration not installed for agent ${agent.id}: ${(error as Error).message}`)
    }
  }))

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
