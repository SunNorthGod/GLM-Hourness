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
 * agent-scoped assembly (`glm:guard`); with the graph row active the
 * section also declares its graph-files-only. Rules only change with the
 * session directory, which is immutable, and with the graph row loading,
 * so the prompt stays stable step to step.
 *
 * Shadow fallback (§6.5): file-tools-only also compares each turn's
 * workspace-changes summary with the turn's file-tool targets and records,
 * never blocks, files a shell call changed unseen (src/guard/shadow.ts).
 *
 * Scope (ORCHESTRATION.md §6.2): GLM calls only. The route of a tool call is
 * the session's latest request header (src/shared/route.ts `sessionRoute`):
 * the model that issued the call. Other models' calls, and calls without an
 * agent, pass untouched. The two model-family checks (the call scope here
 * and the declaration scope below) are the orchestration rows' only ones.
 *
 * Tool names (ORCHESTRATION.md §6.1): the rules know DSH native names only.
 * A call name maps to its native through the dialect service, else the
 * static ZCode alias table (src/shared/dialect.ts toNativeTool), so a GLM
 * `Bash` is judged as `pwsh` with or without the service. Corrections and
 * the declaration name tools as the model sees them: the dialect's names
 * where it claims the agent and route, the natives' own elsewhere. Journal
 * records keep the name the model called.
 *
 * Containment roots come from config, else the calling Agent's immutable
 * session directory (session.header.cwd), else the containment rule is
 * skipped for that call — never the plugin process cwd, which is the harness
 * install directory, not the workspace, and never a throw at activation.
 * Relative targets resolve against the session's working directory, as the
 * file tools resolve them.
 */
import { declarationOf, evaluate, fileToolsOnly, NATIVE_FACE, renderCorrection, workspaceContainment, type GuardRule, type ToolCall, type ToolFace } from './rules.ts'
import { shadowFallback, type ShadowRecord } from './shadow.ts'
import { rowJournal, type AuditFs } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import { dialectNames, dialectService, dialectWarner, toNativeTool, type DialectProblem } from '../shared/dialect.ts'
import { GRAPH_FILES_DECLARATION, graphService } from '../graph/service.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { assemblyRoute, isGlmModel, sessionRoute, type Route } from '../shared/route.ts'
import type { JsonValue } from '../shared/json.ts'
import type { AgentLike, AssembledSection, PluginContext, PreExecuteHost, ProvideHost, ServiceLookup, SessionEventHost, WorkingDirectoryService } from '../shared/dsh-min.ts'

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

/** All active rules (shipped two first so user rules cannot weaken them); `base` is where relative write targets resolve. */
export function activeRules(config: GuardConfig & { workspaceRoots: readonly string[] | undefined, base?: string | undefined }): readonly GuardRule[] {
  return [...(config.workspaceRoots === undefined ? [] : [workspaceContainment(config.workspaceRoots, config.base)]), fileToolsOnly, ...(config.rules ?? [])]
}

/** Containment roots for one agent: config wins, else the agent's session directory. */
export function rootsFor(agent: AgentLike | undefined, config: GuardConfig): readonly string[] | undefined {
  if (config.workspaceRoots !== undefined) return config.workspaceRoots
  const cwd = agent?.session?.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? [cwd] : undefined
}

function workingDirectoryService(ctx: ServiceLookup): WorkingDirectoryService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
  return typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function' ? value as WorkingDirectoryService : undefined
}

/**
 * Where one agent's relative write targets resolve: the session's effective
 * working directory (the file tools resolve against it, and `cd` moves it),
 * else the recorded session directory; undefined leaves the default (the
 * first containment root).
 */
export function baseFor(ctx: ServiceLookup, agent: AgentLike | undefined): string | undefined {
  const session = agent?.session
  if (session === undefined) return undefined
  try {
    const current = workingDirectoryService(ctx)?.get(session)
    if (typeof current === 'string' && current.length > 0) return current
  }
  catch {
    // An unreadable projection falls back to the recorded directory.
  }
  const cwd = session.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/** The row health of a call the guard leaves alone: a non-GLM route, or no route to judge. */
export function outOfScopeHealth(route: Route | undefined): [HealthState, string] {
  if (route?.model === undefined) return ['inactive', '路由未知（调用没有 agent，或会话还没有请求头），门禁不介入']
  return ['inactive', `非 GLM 路由 ${route.provider ?? '?'}/${route.model}，门禁不介入`]
}

/** The name of the system prompt section that declares the active rules. */
export const DECLARATION_SECTION = 'glm:guard'

/**
 * The rule declaration section: one line per rule that declares itself,
 * then the lines of rules other rows enforce (graph-files-only, when the
 * graph row is active). Tool names in the lines come from `face`.
 */
export function declarationSection(rules: readonly GuardRule[], others: readonly string[] = [], face: ToolFace = NATIVE_FACE): AssembledSection {
  return {
    name: DECLARATION_SECTION,
    text: [
      '# Workspace rules',
      'The harness checks every tool call against these rules before it runs; a call that breaks one is denied with the reason and the right way to proceed.',
      ...[...rules.map(rule => declarationOf(rule, face)), ...others].filter(line => line.length > 0).map(line => `- ${line}`),
    ].join('\n'),
    // Declarations are literal text; a rule may mention `{{` without meaning a prompt variable.
    interpolate: false,
  }
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/guard'

/**
 * The guard's status for one call's session (row health): which rules can
 * judge, where denials go, the shadow fallback, and whether the dialect
 * service was unusable for the call (malformed, or a method threw).
 */
export function guardHealth(roots: readonly string[] | undefined, projectHome: string | undefined, shadow = false, dialectUnusable = false): [HealthState, string] {
  const scope = roots === undefined ? '门禁生效（file-tools-only）' : `门禁生效（file-tools-only，圈禁根 ${roots.join('、')}）`
  const gaps = [
    ...(roots === undefined ? ['会话没有工作目录，圈禁规则跳过'] : []),
    ...(projectHome === undefined ? ['无项目目录，违规不落盘'] : []),
    ...(dialectUnusable ? ['方言服务不可用：工具名按静态别名表换算，纠偏用原生名'] : []),
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
  const warn = dialectWarner('guard')
  const installed = new WeakSet<AgentLike>()
  const disposers: Array<() => void> = [() => health.dispose()]

  disposers.push(ctx.on('tools/pre-execute', async (payload, next) => {
    if (payload.parent !== undefined) return next()
    // GLM-only (ORCHESTRATION.md §6.2): the rules discipline GLM's habits;
    // other models' calls, and calls with no route to judge, pass untouched
    // and leave no shadow notes.
    const route = sessionRoute(payload.agent?.session)
    if (!isGlmModel(route?.model)) {
      health.report(sessionIdOf(payload.agent), ...outOfScopeHealth(route))
      return next()
    }
    let dialectUnusable = false
    const problem: DialectProblem = (message) => {
      dialectUnusable = true
      warn(message)
    }
    const dialect = dialectService(ctx, problem)
    const call: ToolCall = { name: toNativeTool(dialect, payload.name, problem), arguments: (payload.arguments ?? {}) as JsonValue }
    const face = dialectNames(dialect, payload.agent, route, problem) ?? NATIVE_FACE
    const roots = rootsFor(payload.agent, config)
    const rules = activeRules({ ...config, workspaceRoots: roots, base: baseFor(ctx, payload.agent) })
    const verdict = evaluate(rules, call, face)
    health.report(sessionIdOf(payload.agent), ...guardHealth(roots, dataHomes(ctx, config.home).projectHome, shadow.available(), dialectUnusable))
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
        const route = assemblyRoute(assembled)
        if (!isGlmModel(route.model)) return assembled
        const rules = activeRules({ ...config, workspaceRoots: rootsFor(agent, config) })
        // graph-files-only is the graph row's rule; declared here so GLM reads every rule in one place.
        const others = graphService(ctx) === undefined ? [] : [GRAPH_FILES_DECLARATION]
        const face = dialectNames(dialectService(ctx, warn), agent, route, warn) ?? NATIVE_FACE
        return { ...assembled, sections: [...assembled.sections, declarationSection(rules, others, face)] }
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
