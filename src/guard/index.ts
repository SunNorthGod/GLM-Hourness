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
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { stat, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { MAIN_AGENT_KEY } from '../graph/main-agent.ts'
import { loadGraph } from '../graph/store.ts'
import { GRAPH_FILES_DECLARATION, graphFocus, graphService } from '../graph/service.ts'
import { declarationOf, fileToolTargetOf, fileToolsOnly, NATIVE_FACE, workspaceContainment, type GuardRule, type ToolCall, type ToolFace } from './rules.ts'
import { installRuleGate, cwdOf } from './gate.ts'
import { DECLARATION_SECTION } from './sections.ts'
import { takeCorrection, workspaceFallback } from './fallback.ts'
import { originOf } from './origin.ts'
import { guardLift, liftedRules, liftedRulesOf, liftRecordPath } from './lift.ts'
import { LIFT_SERVICE, liftServiceOver } from './lift-service.ts'
import { checkerConfigOnly } from './checker-config.ts'
import { prepareContext, type RuleContext } from './context.ts'
import { liftFilesOnly } from './lift-files.ts'
import { scratchOnly } from './scratch.ts'
import { suppressionOnly } from './suppression.ts'
import { dispatchRoot } from './design-release.ts'
import { metricEventOf } from './metrics.ts'
import { REQUESTABLE, REQUEST_DESCRIPTION, signatureOf, exceptionOf, GrantBook, RefusalBook, type RefusalVia } from './request.ts'
import { REQUESTS_SERVICE, createRequestDesk, type RequestDesk, type RequestDeskFs } from './request-service.ts'
import { guardStatusItems } from './status.ts'
import { classifyRecord, journalEarliest, journalRecords, type GuardRecord, type LiftRecord } from './records.ts'
import { projectJournal, auditPaths, type AuditFs } from '../memory/audit.ts'
import { ensureLlmIgnored, type LlmIgnoreOutcome } from '../data/llm-ignore.ts'
import { projectHomeFor, projectRootOf } from '../data/project-home.ts'
import { dialectNames, dialectService, dialectWarner, type DialectProblem } from '../shared/dialect.ts'
import { LOOPS_DECLARATION } from '../loops/service.ts'
import { rulesService } from '../rules/service.ts'
import { activationState, provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { provideRowStatus } from '../shared/status-host.ts'
import { assemblyRoute, sessionRoute } from '../shared/route.ts'
import { createUserNotice, type AgentsService, type ToolExecutionContext } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { emitMetric } from '../shared/metrics.ts'
import type { AgentLike, AssembledSection, PluginContext, PreExecuteHost, ProvideHost, ServiceLookup, SessionEventHost, SessionProjectionsService, WorkingDirectoryService } from '../shared/dsh-min.ts'

export type { FollowupRecord, GuardRecord, RecordedCall, ViolationRecord } from './records.ts'
export type { ShadowRecord } from './fallback.ts'

/** The source kind of the guard row's post-hoc correction notice (design §3.4). */
export const GUARD_CORRECTION_SOURCE = 'hourness-guard'

/** The declaration's head line for root agents only (design §3.1): what to call when the human asks to stop enforcing a rule. */
export const GUARD_LIFT_LINE = 'If the human asks you to stop enforcing one of these rules, call guard_lift with the rule id and the human\'s own words (the tool may be deferred: look it up first).'

export interface GuardConfig {
  /** Workspace roots writes are confined to; defaults to the calling agent's session directory. */
  readonly workspaceRoots?: readonly string[] | undefined
  /** Extra rules beyond the shipped ones. */
  readonly rules?: readonly GuardRule[] | undefined
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the calling session's project. */
  readonly home?: string | undefined
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs | undefined
  /** Reads one file's text for the status entries' journals (the status view is synchronous); tests inject it, the host reads from disk. */
  readonly readFile?: ((path: string) => string) | undefined
  /** The clock the entries' asOf are stamped with; default the wall clock. */
  readonly now?: (() => Date) | undefined
}

/**
 * All active rules (shipped ones first so user rules cannot weaken them);
 * `base` is where relative write targets resolve. The judgment context is
 * prepared per call by the row (`prepareContext`); the no-context form here
 * answers for the static callers (the declaration, the contracts test),
 * where every fact is unknown and the fact-needing rules would pass — the
 * ids are what those callers read.
 */
export function activeRules(config: GuardConfig & { workspaceRoots: readonly string[] | undefined, base?: string | undefined }, per?: { readonly context?: RuleContext, readonly ref?: string, readonly cwd?: string | undefined, readonly ask?: { readonly exception: string, readonly ref: string } }): readonly GuardRule[] {
  const context = per?.context ?? {}
  const ref = per?.ref ?? ''
  return [
    // The per-call exception sentence and ref (design §5.2): the requestable reading of the rule. Without them (the declaration, the static callers) the rule keeps its not-requestable form.
    ...(config.workspaceRoots === undefined ? [] : [workspaceContainment(config.workspaceRoots, config.base, per?.ask?.exception, per?.ask?.ref)]),
    fileToolsOnly,
    suppressionOnly(context),
    checkerConfigOnly(context, ref),
    scratchOnly(config.workspaceRoots ?? [], context, ref),
    liftFilesOnly(per?.cwd),
    ...(config.rules ?? []),
  ]
}

/** The request ref one call's denials carry (design §5.2): `r-` plus eight base36 characters, generated per call, registered when denied (the book is G4's). */
function refOf(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  let ref = 'r-'
  for (const byte of randomBytes(8)) ref += alphabet[byte % 36]
  return ref
}

/** Who is being denied, as the exception sentence and the refusal record read it (design §5.2); the M7 worker's sentence arrives through outsideDenial, not from here. */
const viaOf = (agent: AgentLike | undefined): RefusalVia => agent?.session?.header.origin === 'subagent' ? 'subagent' : 'root'

/** Where one file-tool write target resolves absolutely: the way containment reads a relative spelling. */
function absoluteTargetOf(call: ToolCall, base: string | undefined, roots: readonly string[] | undefined): string | undefined {
  const target = fileToolTargetOf(call)
  if (target === undefined) return undefined
  if (isAbsolute(target)) return target
  const from = base ?? roots?.[0]
  return from === undefined ? undefined : resolve(from, target)
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
 * Whether the session is in main-agent mode by the projection the design row
 * registers (src/graph/main-agent.ts): its identity section then holds the
 * boundary, and the file-tools-only line would tell it to use the Write/Edit
 * tools it does not have (review finding S4-4). Anything unreadable counts
 * as not, which declares the rules as before.
 */
function mainAgentMode(ctx: ServiceLookup, agent: AgentLike | undefined): boolean {
  const service: unknown = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined
  const stateOf = typeof service === 'object' && service !== null ? (service as { stateOf?: SessionProjectionsService['stateOf'] }).stateOf : undefined
  if (stateOf === undefined || agent?.session === undefined) return false
  try {
    const state = stateOf(agent.session, MAIN_AGENT_KEY)
    return typeof state === 'object' && state !== null && (state as { active?: unknown }).active === true
  }
  catch {
    return false
  }
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
 * The rule declaration section: the head (the guard_lift line for a root
 * agent, design §3.1), one line per rule that declares itself, then the
 * lines of rules other rows enforce (graph-files-only, when the graph row is
 * active). Tool names in the lines come from `face`.
 */
export function declarationSection(rules: readonly GuardRule[], others: readonly string[] = [], face: ToolFace = NATIVE_FACE, root = false): AssembledSection {
  return {
    name: DECLARATION_SECTION,
    text: [
      '# Workspace rules',
      'The harness checks every tool call against these rules before it runs; a call that breaks one is denied with the reason and the right way to proceed.',
      ...(root ? [GUARD_LIFT_LINE] : []),
      ...[...rules.map(rule => declarationOf(rule, face)), ...others].filter(line => line.length > 0).map(line => `- ${line}`),
    ].join('\n'),
    // Declarations are literal text; a rule may mention `{{` without meaning a prompt variable.
    interpolate: false,
  }
}

/** cordis plugin identity: the tools service, for guard_lift's registration. */
export const name = 'dsh-glm-hourness/guard'
export const inject = ['tools']

/**
 * The guard's status for one call's session (row health): which rules can
 * judge, where denials go, the workspace-change correction (design §3.4),
 * whether the dialect service was unusable for the call (malformed, or a
 * method threw), whether the project's `.llm/` failed to stay out of git,
 * and how many lines of the project's lift record cannot be read (design
 * §3.5).
 */
export function guardHealth(roots: readonly string[] | undefined, projectHome: string | undefined, correction = false, dialectUnusable = false, ignore?: string, liftsUnreadable = 0): [HealthState, string] {
  const scope = roots === undefined ? '门禁生效（file-tools-only）' : `门禁生效（file-tools-only，圈禁根 ${roots.join('、')}）`
  const gaps = [
    ...(roots === undefined ? ['会话没有工作目录，圈禁规则跳过'] : []),
    ...(projectHome === undefined ? ['无项目目录，违规不落盘'] : []),
    ...(dialectUnusable ? ['方言服务不可用：工具名按静态别名表换算，纠偏用原生名'] : []),
    ...(ignore === undefined ? [] : [`项目的 .llm/ 没有被 git 忽略：${ignore}`]),
    ...(liftsUnreadable > 0 ? [`lifts.jsonl 有 ${liftsUnreadable} 行读不懂`] : []),
  ]
  const fallback = correction ? '事后纠正启用：工作区变更记录' : '事后纠正未启用（组合里没有 workspace-changes）'
  return gaps.length === 0 ? ['active', `${scope}；违规记入 ${projectHome}；${fallback}`] : ['degraded', `${scope}；${gaps.join('；')}；${fallback}`]
}

type GuardHost = PreExecuteHost & SessionEventHost & Pick<PluginContext, 'on' | 'tools'> & ServiceLookup & Partial<ProvideHost>

/** Why a project's `.llm/` is still visible to git, as the last ensure run for its root came out. */
function ignoreProblem(ignored: ReadonlyMap<string, LlmIgnoreOutcome>, root: string | undefined): string | undefined {
  if (root === undefined) return undefined
  const outcome = ignored.get(root)
  return outcome?.kind === 'visible' || outcome?.kind === 'unwritable' ? outcome.reason : undefined
}

/** The description the model reads for guard_lift (design §3.5, verbatim). */
const GUARD_LIFT_DESCRIPTION = 'Lift or restore one of the harness\'s code rules because the human asked for it in their latest message. Pass the rule id and the clause where the human asks for it, copied exactly. One human message lifts at most one rule. Do not call it on your own: a rule that blocks you is a reason to use its right path or to ask the human, not to lift it. The result says what to tell the human. Example: guard_lift {"rule": "scratch-only", "words": "新建脚本那条先别拦了"}'

/** The parameters of guard_lift (design §3.5): exactly the three fields, strict. */
const GUARD_LIFT_PARAMETERS = {
  type: 'object',
  properties: {
    rule: { type: 'string', description: 'The id of the rule to lift or restore, one of the workspace rules the system prompt lists.' },
    words: { type: 'string', description: 'The clause of the human\'s latest message that asks for it, copied exactly.' },
    action: { type: 'string', enum: ['lift', 'restore'], description: 'lift (the default) stops enforcing the rule; restore enforces it again.' },
  },
  required: ['rule', 'words'],
  additionalProperties: false,
} as const

/** cordis plugin entry. */
export function apply(ctx: GuardHost, config: GuardConfig = {}): () => void {
  const health = provideRowHealth(ctx, 'guard', 'active', config.workspaceRoots === undefined ? '已加载，圈禁根取会话目录' : '已加载，圈禁根取配置')
  const journals = projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd), config.fs)
  // The metrics journal rides along at the one write every record passes
  // (metrics design §6.2, m4 §3.11): the gate's denials and follow-ups, the
  // fallback's late denial, both lift paths and the request desk. The event
  // is a pure mapping of the record; a metrics row that is absent or
  // throwing changes nothing.
  const violation = (record: GuardRecord, cwd: string | undefined): ReturnType<typeof journals.violation> => {
    const outcome = journals.violation(record, cwd)
    const event = metricEventOf(record)
    if (event !== undefined) {
      const sessionId = 'sessionId' in record && typeof record.sessionId === 'string' ? record.sessionId : undefined
      emitMetric(ctx, event, { ...(sessionId === undefined ? {} : { sessionId }), ...(cwd === undefined ? {} : { dir: cwd }) })
    }
    return outcome
  }
  const ignored = new Map<string, LlmIgnoreOutcome>()
  const fallback = workspaceFallback(ctx, (record, cwd) => { void violation(record, cwd) })
  const warn = dialectWarner('guard')
  const rulesWarn = dialectWarner('guard')
  const installed = new WeakSet<AgentLike>()
  const disposers: Array<() => void> = [() => health.dispose()]

  // The request channel's memory and desk (m4-request-card, design §5): the
  // refusal and grant books are this process's memory; everything else reads
  // the row's own seams (the agents walk, the graph focus, the journals).
  const refusals = new RefusalBook()
  const grants = new GrantBook()
  const agentsOf = (): Pick<AgentsService, 'get'> | undefined => {
    try {
      const service: unknown = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
      return typeof service === 'object' && service !== null && typeof (service as { get?: unknown }).get === 'function' ? service as Pick<AgentsService, 'get'> : undefined
    }
    catch {
      return undefined
    }
  }
  const dispatchRootOf = (agent: AgentLike | undefined): string | undefined => {
    if (agent?.session === undefined) return undefined
    const agents = agentsOf()
    if (agents === undefined) return undefined
    const lookup = dispatchRoot(agents, { id: agent.id, session: agent.session })
    return lookup.kind === 'self' ? agent.id : lookup.kind === 'root' ? lookup.root.id : undefined
  }
  const focusTitleOf = async (agent: AgentLike | undefined): Promise<string | undefined> => {
    try {
      const focus = graphFocus(ctx)
      const cwd = typeof agent?.session?.header.cwd === 'string' && agent.session.header.cwd.length > 0 ? agent.session.header.cwd : undefined
      const dir = focus === undefined || agent?.session === undefined ? undefined : focus.dirFor(cwd)
      const id = focus === undefined || agent?.session === undefined ? undefined : focus.focusOf(agent.session)
      if (dir === undefined || id === undefined) return undefined
      return (await loadGraph(dir)).nodes.get(id)?.title
    }
    catch {
      return undefined
    }
  }
  const requestFs: RequestDeskFs = { stat, mkdir, copyFile, writeFile }
  const desk: RequestDesk = createRequestDesk({
    refusals,
    grants,
    now: () => new Date(),
    journal: (record, cwd) => { void violation(record, cwd) },
    dispatchRootOf,
    projectHomeOf: cwd => projectHomeFor(ctx, config.home, cwd),
    rootsOf: agent => rootsFor(agent, config),
    focusTitleOf,
    wake: (agent, notice) => {
      if (agent.session === undefined) return
      try {
        agentsOf()?.get(agent.session.id)?.followup(notice)
      }
      catch {
        // The live agent may be gone; the expired record is written either way.
      }
    },
    note: (sessionId, key, text) => health.note(sessionId, key, text),
    warn: message => { console.warn(`${name}: ${message}`) },
    fs: requestFs,
  })
  disposers.push(() => desk.dispose())

  // The row's status view (status hub design 0.3 §3.2, §12 M4 row): the per-rule denial counts and
  // the lift status as the entries `rules/denials` and `rules/lifts`, computed when the collector
  // asks over the WHOLE journal — a lift is the project's decision whose day does not matter (M4
  // design §3.10, review finish2 round 2 F16). The session's project is the working directory the
  // row saw at agent creation; a session the row does not know, or one outside a project, has no
  // entries. A journal that is not there yet is no entry, not an error; one that cannot be read
  // is, and the collector takes the placeholder. The entries name no uncommitted-file line: that
  // needs a git call and the view is synchronous (the report keeps computing it).
  const readFile = config.readFile ?? ((path: string) => readFileSync(path, 'utf8'))
  const clock = config.now ?? (() => new Date())
  const sessions = new Map<string, string>()
  const status = provideRowStatus(ctx, 'guard', (sessionId) => {
    const cwd = sessionId === undefined ? undefined : sessions.get(sessionId)
    const root = projectRootOf(cwd)
    const home = projectHomeFor(ctx, config.home, cwd)
    if (cwd === undefined || root === undefined || home === undefined) return []
    const violationsPath = auditPaths({ projectHome: home }).violations
    if (violationsPath === undefined) return []
    let raw: string
    try {
      raw = readFile(violationsPath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') raw = ''
      else throw error
    }
    const violations = journalRecords(raw)
    const liftRecords = violations.flatMap(record => classifyRecord(record as unknown as Readonly<Record<string, unknown>>) === 'lift' ? [record as unknown as LiftRecord] : [])
    const earliest = journalEarliest(violations)
    let file: { readonly text: string } | { readonly error: string }
    try {
      file = { text: readFile(liftRecordPath(root)) }
    }
    catch (error) {
      file = { error: (error as NodeJS.ErrnoException).code ?? 'error' }
    }
    return guardStatusItems({
      violations,
      lifts: { records: liftRecords, ...(earliest === undefined ? {} : { earliest }), file },
      source: violationsPath,
      liftsSource: liftRecordPath(root),
    }, clock().getTime())
  })
  disposers.push(() => { status.dispose() })

  disposers.push(installRuleGate(ctx, {
    row: 'guard',
    prepend: false,
    rules: async (payload, call) => {
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
      const lifts = root === undefined ? undefined : liftedRulesOf(root)
      health.report(sessionIdOf(payload.agent), ...guardHealth(roots, projectHomeFor(ctx, config.home, cwd), fallback.available(), dialectUnusable, ignoreProblem(ignored, root), lifts?.unreadable ?? 0))
      // The judgment context (design §4.1): only a file-tool write prepares facts. The ref is pre-generated
      // per file-tool call (design §5.2) and rides on the requestable denials; registered only when denied.
      const base = baseFor(ctx, payload.agent)
      const ref = refOf()
      const target = absoluteTargetOf(call, base, roots)
      const context = await prepareContext(target, cwd)
      const via = viaOf(payload.agent)
      return {
        rules: activeRules({ ...config, workspaceRoots: roots, base }, { context, ref, cwd, ask: { exception: exceptionOf(via, ref), ref } }),
        face: names ?? NATIVE_FACE,
        origin: originOf(names !== undefined, route),
      }
    },
    registerRequestableDenial: ({ payload, call, deny }) => {
      if (deny.ref === undefined) return
      const base = baseFor(ctx, payload.agent)
      const target = absoluteTargetOf(call, base, rootsFor(payload.agent, config))
      if (target === undefined) return
      desk.registerDenied({ agent: payload.agent, call, base, target, rule: deny.rule, via: viaOf(payload.agent), ref: deny.ref })
    },
    grants: async ({ payload, call, denies }) => {
      const deny = denies.find(candidate => candidate.ref !== undefined && REQUESTABLE.has(candidate.rule))
      if (deny === undefined || deny.ref === undefined) return undefined
      const base = baseFor(ctx, payload.agent)
      const root = dispatchRootOf(payload.agent)
      if (root === undefined || root === '') return undefined
      const grant = grants.find(signatureOf(call.name, call.arguments, base), root)
      if (grant === undefined) return undefined
      const target = absoluteTargetOf(call, base, rootsFor(payload.agent, config))
      if (target === undefined) return undefined
      const preparation = await desk.prepareGrant(call, base, grant, cwdOf(payload))
      if (preparation.kind === 'void') return { kind: 'void', rule: deny.rule, ref: grant.ref, reason: preparation.reason }
      if (preparation.kind === 'backup-failed') return { kind: 'backup-failed', rule: deny.rule, ref: grant.ref, target, reason: preparation.reason }
      return {
        kind: 'carried',
        rule: deny.rule,
        grant,
        markInUse: () => grants.markInUse(grant.ref),
        consume: () => {
          grants.consume(grant.ref)
          return grant.backupPath
        },
        release: () => grants.release(grant.ref),
      }
    },
    journal: async (record, payload) => {
      const cwd = cwdOf(payload)
      const root = projectRootOf(cwd)
      if (root !== undefined) ignored.set(root, await ensureLlmIgnored(root))
      return violation(record, cwd)
    },
    allowed: (payload, origin) => fallback.observe(payload, origin),
    health,
    flush: () => journals.flush(),
  }))

  disposers.push(ctx.on('session/event', (session, event) => fallback.event(session, event)))
  disposers.push(ctx.on('session/disposed', session => fallback.disposed(session)))

  // The lift service (design §3.5): the rules board's `/rules lift` calls it once that side is wired (a seam request after dogfood).
  if (ctx.provide !== undefined) {
    const withdraw = ctx.provide(LIFT_SERVICE, liftServiceOver({
      rootOf: cwd => projectRootOf(cwd),
      record: (record, cwd) => violation(record, cwd),
      now: () => new Date(),
    }))
    if (withdraw !== undefined) disposers.push(withdraw)
    // The requests service (design §5.9): M7's outer gates read a ref and the grants through it; M3's propose_to_human reads openRequests.
    const requests = ctx.provide(REQUESTS_SERVICE, desk.service)
    if (requests !== undefined) disposers.push(requests)
  }

  // The lift tool (design §3.5): the main agent's way to stop enforcing a rule because the human said so.
  if (ctx.tools !== undefined) {
    disposers.push(ctx.tools.register({
      name: 'guard_lift',
      description: GUARD_LIFT_DESCRIPTION,
      parameters: GUARD_LIFT_PARAMETERS,
      output: { schema: { type: 'object', properties: { outcome: { type: 'string' }, rule: { type: 'string' }, title: { type: 'string' }, blocks: { type: 'string' }, message: { type: 'string' } } }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
      execute: (args, exec) => {
        const { agent } = (exec ?? {}) as ToolExecutionContext
        const cwd = typeof agent?.session?.header.cwd === 'string' && agent.session.header.cwd.length > 0 ? agent.session.header.cwd : undefined
        return guardLift(args as Parameters<typeof guardLift>[0], {
          agent,
          root: projectRootOf(cwd),
          record: record => violation(record, cwd),
          now: () => new Date(),
        })
      },
    }))
  }

  // The request tool (design §5.3): global registration, every route and
  // agent; deferred on GLM like guard_lift. Its body answers with the plan
  // text, or with the {code, message, hint} JSON of the failed check.
  if (ctx.tools !== undefined) {
    disposers.push(ctx.tools.register({
      name: 'request_exception',
      description: REQUEST_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'The reference a denial named, r- plus eight lowercase letters or digits.' },
          purpose: { type: 'string', description: 'Why the call is needed, one short sentence, at most 80 characters.' },
          reversibility: { type: 'string', description: 'Whether it can be undone and what else it touches, one short sentence, at most 60 characters.' },
          alternatives: { type: 'string', description: 'What you tried instead, one short sentence, at most 60 characters; `none` is allowed.' },
        },
        required: ['ref', 'purpose', 'reversibility', 'alternatives'],
        additionalProperties: false,
      } as const,
      output: { schema: { type: 'object', properties: { outcome: { type: 'string' }, ref: { type: 'string' }, text: { type: 'string' }, lines: { type: 'object' }, tool: { type: 'string' }, arguments: { type: 'object' }, expires: { type: 'string' }, message: { type: 'string' } } }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
      execute: (args, exec) => {
        const { agent } = (exec ?? {}) as ToolExecutionContext
        return desk.requestException(args as Record<string, unknown>, agent, typeof agent?.session?.header.cwd === 'string' && agent.session.header.cwd.length > 0 ? agent.session.header.cwd : undefined)
      },
    }))
  }

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    const isRoot = agent.session?.header.origin !== 'subagent'
    // The status view resolves the session's project through the directory seen here (the view is synchronous; the gate's per-call payload cannot serve it).
    const seenSession = sessionIdOf(agent)
    const seenCwd = agent.session?.header.cwd
    if (seenSession !== undefined && typeof seenCwd === 'string' && seenCwd.length > 0) sessions.set(seenSession, seenCwd)
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
        // The main agent reads its boundary in the identity section the design row assembles: the file-tools-only line would name the Write/Edit tools it does not have (S4-4).
        const declared = mainAgentMode(ctx, agent) ? own.map(rule => rule === fileToolsOnly ? { ...rule, declare: '' } : rule) : own
        // graph-files-only is the graph row's rule, and the gates of the rules board and the loop board are their rows'; declared here so the model reads every rule in one place. A lifted rule stops declaring too.
        const board = rulesService(ctx, rulesWarn)
        // The loop board's gate is in every host process, while its service is only in the one that can reach a session (loops design §6.1), so the line follows the row, not the service.
        const loops = activationState(ctx, 'loops')
        const graphDeclares = graphService(ctx) !== undefined && lifted?.has('graph-files-only') !== true
        const others = [...(graphDeclares ? [GRAPH_FILES_DECLARATION] : []), ...(board === undefined ? [] : [board.declaration]), ...(loops === 'absent' || loops === 'inactive' ? [] : [LOOPS_DECLARATION])]
        const face = dialectNames(dialectService(ctx, warn), agent, route, warn) ?? NATIVE_FACE
        return { ...assembled, sections: [...assembled.sections, declarationSection(declared, others, face, isRoot)] }
      }, { prepend: true }))
    }
    catch (error) {
      // Agent creation must never fail on the declaration; the gate still holds.
      console.warn(`${name}: rule declaration not installed for agent ${agent.id}: ${(error as Error).message}`)
    }
    try {
      // The post-hoc correction of the workspace-change fallback (design §3.4):
      // the second step notice of a root agent delivers one queued correction
      // before the agent's next step. A subagent gets none: reminders are for
      // the top-level conversation.
      if (isRoot) {
        const notice = installStepNotice(agent, 'workspace-change correction', () => true, (_history, { session }) => {
          const correction = takeCorrection(session.id)
          return correction === undefined ? undefined : createUserNotice(GUARD_CORRECTION_SOURCE, 'workspace-change correction', wrapSystemReminder(correction))
        }, 'guard')
        if (notice !== undefined) disposers.push(notice)
      }
    }
    catch (error) {
      console.warn(`${name}: correction notice not installed for agent ${agent.id}: ${(error as Error).message}`)
    }
    try {
      // The request channel's reply reading (m4-request-card, design §5.5):
      // every step of a root agent reads what the step admitted against the
      // open request, and the first install names the asks a restart lapsed.
      // A subagent files no request, so it reads none.
      if (isRoot) {
        const notice = installStepNotice(agent, 'request replies', () => true, async (history, { admitted, session, step }) => {
          const lapsed = desk.lapseOrphans(agent, history)
          const reply = await desk.readReply({ history, admitted, step, session, agent })
          return reply ?? lapsed
        }, 'guard')
        if (notice !== undefined) disposers.push(notice)
      }
    }
    catch (error) {
      console.warn(`${name}: request notice not installed for agent ${agent.id}: ${(error as Error).message}`)
    }
  }))

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
