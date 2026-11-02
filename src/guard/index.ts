/**
 * dsh-glm-guard — execution-boundary guard row.
 *
 * Seam (verified): the `tools/pre-execute` waterfall receives the pending
 * call and returns a PreToolDecision; returning a deny decision with reason
 * text blocks the call before execution. The four-part corrective message is
 * the reason — deny stays hard, teaching rides along. The judgement, the
 * journal and the lifts are the gate's (src/guard/gate.ts): every denial is
 * journaled in the project of the calling session
 * (`<project root>/.llm/audit/violations.jsonl`, src/data/project-home.ts;
 * docs/DESIGN.md §2.4), and a write that failed is named on the row health
 * and on the journal's next gap line instead of vanishing. Each root call
 * reports the row health of its session (src/shared/health.ts).
 *
 * Declaration (告知, docs/ORCHESTRATION.md §6.1): on every route the active
 * rules are declared in one system prompt section, appended after the
 * agent-scoped assembly (`glm:guard`; the runtime renders section text, not
 * names); with the graph row active the section also declares its
 * graph-files-only. A rule the human lifted (src/guard/lift.ts) neither
 * judges nor declares. Rules only change with the session directory, which
 * is immutable, and with the graph row loading, so the prompt stays stable
 * step to step.
 *
 * Scope (ORCHESTRATION.md §6.2): every root call, on every route and model,
 * while this row is loaded. The route of a tool call is the session's
 * latest request header (src/shared/route.ts `sessionRoute`): the model that
 * issued the call. It decides nothing about enforcement: it names the tools
 * in corrections (below) and tags each journal record with its origin
 * (src/guard/origin.ts). Nested transport calls (`parent`) pass.
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
import { declarationOf, fileToolsOnly, NATIVE_FACE, workspaceContainment, type GuardRule, type ToolFace } from './rules.ts'
import { installRuleGate, cwdOf } from './gate.ts'
import { DECLARATION_SECTION } from './sections.ts'
import { shadowFallback } from './shadow.ts'
import { originOf } from './origin.ts'
import { liftedRules } from './lift.ts'
import { projectJournal, type AuditFs } from '../memory/audit.ts'
import { ensureLlmIgnored, type LlmIgnoreOutcome } from '../data/llm-ignore.ts'
import { projectHomeFor, projectRootOf } from '../data/project-home.ts'
import { dialectNames, dialectService, dialectWarner, type DialectProblem } from '../shared/dialect.ts'
import { GRAPH_FILES_DECLARATION, graphService } from '../graph/service.ts'
import { LOOPS_DECLARATION } from '../loops/service.ts'
import { rulesService } from '../rules/service.ts'
import { activationState, provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { assemblyRoute, sessionRoute } from '../shared/route.ts'
import type { AgentLike, AssembledSection, PluginContext, PreExecuteHost, ProvideHost, ServiceLookup, SessionEventHost, WorkingDirectoryService } from '../shared/dsh-min.ts'

export type { GuardRecord, RecordedCall, ViolationRecord } from './records.ts'
export type { ShadowRecord } from './shadow.ts'

export interface GuardConfig {
  /** Workspace roots writes are confined to; defaults to the calling agent's session directory. */
  readonly workspaceRoots?: readonly string[] | undefined
  /** Extra rules beyond the shipped ones. */
  readonly rules?: readonly GuardRule[] | undefined
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the calling session's project. */
  readonly home?: string | undefined
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs | undefined
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
 * judge, where denials go, the workspace-change fallback, whether the
 * dialect service was unusable for the call (malformed, or a method threw),
 * and whether the project's `.llm/` failed to stay out of git.
 */
export function guardHealth(roots: readonly string[] | undefined, projectHome: string | undefined, shadow = false, dialectUnusable = false, ignore?: string): [HealthState, string] {
  const scope = roots === undefined ? '门禁生效（file-tools-only）' : `门禁生效（file-tools-only，圈禁根 ${roots.join('、')}）`
  const gaps = [
    ...(roots === undefined ? ['会话没有工作目录，圈禁规则跳过'] : []),
    ...(projectHome === undefined ? ['无项目目录，违规不落盘'] : []),
    ...(dialectUnusable ? ['方言服务不可用：工具名按静态别名表换算，纠偏用原生名'] : []),
    ...(ignore === undefined ? [] : [`项目的 .llm/ 没有被 git 忽略：${ignore}`]),
  ]
  const fallback = shadow ? '影子兜底：工作区变更记录' : '影子兜底未启用（组合里没有 workspace-changes）'
  return gaps.length === 0 ? ['active', `${scope}；违规记入 ${projectHome}；${fallback}`] : ['degraded', `${scope}；${gaps.join('；')}；${fallback}`]
}

type GuardHost = PreExecuteHost & SessionEventHost & Pick<PluginContext, 'on'> & ServiceLookup & Partial<ProvideHost>

/** Why a project's `.llm/` is still visible to git, as the last ensure run for its root came out. */
function ignoreProblem(ignored: ReadonlyMap<string, LlmIgnoreOutcome>, root: string | undefined): string | undefined {
  if (root === undefined) return undefined
  const outcome = ignored.get(root)
  return outcome?.kind === 'visible' || outcome?.kind === 'unwritable' ? outcome.reason : undefined
}

/** cordis plugin entry. */
export function apply(ctx: GuardHost, config: GuardConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'guard', 'active', config.workspaceRoots === undefined ? '已加载，圈禁根取会话目录' : '已加载，圈禁根取配置')
  const journals = projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd), config.fs)
  const ignored = new Map<string, LlmIgnoreOutcome>()
  const shadow = shadowFallback(ctx, (record, cwd) => { void journals.violation(record, cwd) })
  const warn = dialectWarner('guard')
  const rulesWarn = dialectWarner('guard')
  const installed = new WeakSet<AgentLike>()
  const disposers: Array<() => void> = [() => health.dispose()]

  disposers.push(installRuleGate(ctx, {
    row: 'guard',
    prepend: false,
    rules: (payload, _call) => {
      // Every route and model (ORCHESTRATION.md §6.2): the route only picks the
      // tool names of the correction and tags the record.
      const route = sessionRoute(payload.agent?.session)
      let dialectUnusable = false
      const problem: DialectProblem = (message) => {
        dialectUnusable = true
        warn(message)
      }
      const dialect = dialectService(ctx, problem)
      const names = dialectNames(dialect, payload.agent, route, problem)
      const cwd = cwdOf(payload)
      const roots = rootsFor(payload.agent, config)
      const root = projectRootOf(cwd)
      health.report(sessionIdOf(payload.agent), ...guardHealth(roots, projectHomeFor(ctx, config.home, cwd), shadow.available(), dialectUnusable, ignoreProblem(ignored, root)))
      return {
        rules: activeRules({ ...config, workspaceRoots: roots, base: baseFor(ctx, payload.agent) }),
        face: names ?? NATIVE_FACE,
        origin: originOf(names !== undefined, route),
      }
    },
    journal: async (record, payload) => {
      const cwd = cwdOf(payload)
      const root = projectRootOf(cwd)
      if (root !== undefined) ignored.set(root, await ensureLlmIgnored(root))
      return journals.violation(record, cwd)
    },
    allowed: (payload, origin) => shadow.observe(payload, origin),
    health,
    flush: () => journals.flush(),
  }))

  disposers.push(ctx.on('session/event', (session, event) => shadow.event(session, event)))
  disposers.push(ctx.on('session/disposed', session => shadow.disposed(session)))

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      // Prepend, like the dialect row: post-`next()` sees the route the
      // model selection injected, which picks the tool names. Every route
      // gets the section, appended last either way, whichever of the two
      // listeners is outermost.
      disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const assembled = await next()
        const route = assemblyRoute(assembled)
        const cwd = typeof agent.session?.header.cwd === 'string' && agent.session.header.cwd.length > 0 ? agent.session.header.cwd : undefined
        const root = projectRootOf(cwd)
        const lifted = root === undefined ? undefined : liftedRules(root)
        const rules = activeRules({ ...config, workspaceRoots: rootsFor(agent, config) })
        const own = lifted === undefined || lifted.size === 0 ? rules : rules.filter(rule => !lifted.has(rule.id))
        // graph-files-only is the graph row's rule, and the gates of the rules board and the loop board are their rows'; declared here so the model reads every rule in one place. A lifted rule stops declaring too.
        const board = rulesService(ctx, rulesWarn)
        // The loop board's gate is in every host process, while its service is only in the one that can reach a session (loops design §6.1), so the line follows the row, not the service.
        const loops = activationState(ctx, 'loops')
        const graphDeclares = graphService(ctx) !== undefined && lifted?.has('graph-files-only') !== true
        const others = [...(graphDeclares ? [GRAPH_FILES_DECLARATION] : []), ...(board === undefined ? [] : [board.declaration]), ...(loops === 'absent' || loops === 'inactive' ? [] : [LOOPS_DECLARATION])]
        const face = dialectNames(dialectService(ctx, warn), agent, route, warn) ?? NATIVE_FACE
        return { ...assembled, sections: [...assembled.sections, declarationSection(own, others, face)] }
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
