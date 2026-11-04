/**
 * The metrics contract between the two packages (metrics design §6.2): the
 * service the metrics row provides, the helper every sender row calls, and
 * the one place the event vocabulary is typed. Only types, constants and
 * pure functions live here; the runtime field tables that validate the same
 * names are in src/metrics/kinds/<namespace>.ts, and each of them asserts at
 * compile time that its derived types equal the bodies declared here.
 *
 * The vocabulary is closed (metrics design §4.2): the kinds this design
 * named (host kinds, `timeout.*`, `progress.*`, `lift`), plus the ones the
 * sibling designs already fixed — rules board 0.10 §10.5, loop board 0.6
 * §6.10, M7 0.6 §3.16, M6 0.6 §14.2, M3 addendum 0.6 §3.12 and the takeover
 * 0.6 trial. Value lists that a sibling design owns stay there: such fields
 * are typed `string` (id) and only the names are fixed here.
 */
import type { ServiceLookup } from './dsh-min.ts'
import { buildStamp } from './build-info.ts'

/** The cordis service name the metrics row provides. */
export const METRICS_SERVICE = 'glmHournessMetrics'

/** A key-to-count map (`map` in the field grammar): id keys, integer, boolean or id values. */
export type MetricsMap = Readonly<Record<string, number | boolean | string>>

/** Who handed an event in: the metrics row, or the row that emitted it through the service (§4.1 `by`). */
export type MetricsBy = 'host' | 'graph' | 'guard' | 'rules' | 'loops' | 'execute' | 'operate' | 'glm' | 'design' | 'bootstrap' | 'env'

/** Where a timeout value's limit comes from (`d-timeout-measured`, §4.2). */
type TimeoutSource = 'estimate' | 'measured' | 'default' | 'ceiling' | 'fixed'

/**
 * The kinds the metrics row itself observes on the host seams (§5.4's
 * forgery check: a writer that started as `cli` and writes one of these is
 * reporting something only a host process sees).
 */
export const HOST_ONLY_KINDS: readonly string[] = ['llm', 'tool', 'turn', 'approval', 'command', 'said']

/** This design's own kinds, plus the four the 2026-10-31 decisions needed (§4.2 first two tables). */
export interface HostBodies {
  /** This writer's first line into a journal. */
  start: { readonly host: 'desktop' | 'headless' | 'cli', readonly pid: number, readonly node: string, readonly electron?: string }
  /** The writer's last line, best effort before unload or exit. */
  stop: { readonly written: number, readonly dropped: number, readonly rejected: number }
  /** Written after events were lost to a full queue, on the first successful write afterwards. */
  gap: { readonly lost: number, readonly from: number, readonly to: number, readonly lastH: string }
  /** A rejected event: the kind and the first offending field (`other` when the name is not in a table). */
  reject: { readonly of: string, readonly field: string }
  /** Written before a human deletes old day files (only `prune` may, §5.3). */
  prune: { readonly before: string, readonly files: number, readonly lines: number }
  /** First sight of a session in this process. */
  session: { readonly parent?: string, readonly origin?: 'subagent', readonly depth?: number }
  /** A turn's start and end. */
  turn: { readonly turn: number, readonly phase: 'start' | 'end', readonly end?: string }
  /** One model call, from `llm/stream` to the stream's end. */
  llm: {
    readonly turn?: number
    readonly step?: number
    readonly provider: string
    readonly model: string
    readonly purpose?: string
    readonly input?: number
    readonly output?: number
    readonly cacheRead?: number
    readonly cacheWrite?: number
    readonly reasoning?: number
    readonly total?: number
    readonly ms: number
    readonly ttft?: number
    readonly fin: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error' | 'none' | 'other'
    readonly calls: number
    readonly text: number
    readonly retries?: number
    readonly credits?: number
    readonly peak?: boolean
  }
  /** One tool call the model made, with its result. */
  tool: {
    readonly turn: number
    readonly step: number
    readonly call: string
    readonly name: string
    readonly cat: 'read' | 'write' | 'search' | 'shell' | 'graph' | 'dispatch' | 'memory' | 'web' | 'todo' | 'question' | 'mcp' | 'other'
    readonly out: 'ok' | 'error' | 'denied' | 'declined' | 'none'
    readonly ms?: number
    readonly chars?: number
    readonly target?: string
    readonly cmd?: string
  }
  /** A code rule of the guard framework denied a call, or saw the violation late. */
  rule: { readonly call?: string, readonly rule: string, readonly effect: 'deny' | 'late', readonly ref?: string }
  /** What the model did after a denial (M4's follow-up recorder). */
  followup: { readonly rule: string, readonly denial: string, readonly outcome: 'right-path' | 'repeat' | 'other' | 'none' }
  /** One step of M4's declaration channel. */
  request: { readonly rule: string, readonly ref: string, readonly step: string }
  /** A human lifted or restored a code rule; M4 hands one over per LiftRecord (`d-one-lift-path`). */
  lift: { readonly rule: string, readonly action: 'lift' | 'restore', readonly via: string, readonly units: number, readonly ref?: string }
  /** A DSH approval, asked and decided. */
  approval: { readonly id: string, readonly phase: 'asked' | 'decided', readonly tool?: string, readonly call?: string, readonly outcome?: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' }
  /** A human slash command, started and finished. */
  command: { readonly cid: string, readonly name: string, readonly phase: 'run' | 'done', readonly result?: 'success' | 'error' }
  /** A DSH native question request, opened. */
  ask: { readonly q: string, readonly qs: number, readonly opts: number, readonly units: number, readonly ref?: string }
  /** That question request settled. */
  answer: { readonly q: string, readonly ms: number, readonly end: 'answered' | 'aborted' | 'no-provider' | 'timed-out' | 'error', readonly pick?: string }
  /** A message the human sent to a session: counts only, never its text. */
  said: { readonly units: number, readonly attachments: number, readonly source: string }
  /** One history entry a successful graph write appended. */
  graph: {
    readonly node: string
    readonly type: string
    readonly op: string
    readonly hi: number
    readonly actor: 'human' | 'llm' | 'harness'
    /** The node's revision after the write; the backfilled entries have none (F23). */
    readonly rev?: string
    readonly relay?: boolean
    readonly from?: string
    readonly to?: string
    readonly src?: string
  }
  /** One graph write that failed: the failure code, no history number and no revision exist (F23). */
  'graph-fail': { readonly actor: 'human' | 'llm' | 'harness', readonly err: string, readonly op?: string, readonly node?: string, readonly field?: string }
  /** One /hourness report (the base hourness row; M7 reports use `operate.report`). */
  report: { readonly kind: 'status', readonly units: number, readonly ms: number }
  /** A daily count (M4's suppression notes are the first sender). */
  count: { readonly what: string, readonly value: number, readonly byKey?: MetricsMap }
}

/** The kinds the 2026-10-31 timeout decision named (`d-timeout-measured`); the `by` is the board that hands them in. */
export interface TimeoutBodies {
  'timeout.set': {
    readonly entry: string
    readonly kind: string
    readonly limitMs: number
    readonly prevMs?: number
    readonly source: TimeoutSource
    readonly estMs?: number
    readonly estSession?: string
    readonly floored?: boolean
    readonly runs?: number
    readonly runIds?: readonly string[]
    readonly slowestMs?: number
    readonly wantedMs?: number
    readonly told?: boolean
  }
  'timeout.hit': {
    readonly entry: string
    readonly kind: string
    readonly limitMs: number
    readonly elapsedMs: number
    readonly outcome: string
    readonly source: TimeoutSource
    readonly told: boolean
    readonly run?: string
  }
}

/** The kinds the 2026-10-31 handover decision named (plugin usage flow G18); M7 sends them. */
export interface ProgressBodies {
  'progress.due': { readonly goal: string, readonly part?: string, readonly scope: 'part' | 'goal', readonly away: boolean }
  'progress.handover': { readonly n: number, readonly waitedMs: number, readonly goalDone: boolean }
}

/** The rules board's kinds, field names verbatim from rules board 0.10 §10.5 (§4.5). */
export interface RulesBodies {
  'rules.judged': { readonly rule: string, readonly how: string, readonly tool: string, readonly ticket?: string, readonly sub: boolean, readonly signals: MetricsMap, readonly unread?: readonly string[], readonly ms: number }
  'rules.session-summary': { readonly judged: number, readonly allowed: number, readonly medianMs: number, readonly maxMs: number }
  'rules.ticket': { readonly ticket: string, readonly rule: string, readonly state: string, readonly why?: string, readonly ms: number, readonly goalOk?: boolean }
  'rules.wake': { readonly ticket: string, readonly via: string, readonly sent: boolean, readonly ms?: number }
  'rules.write': { readonly seq: number, readonly op: string, readonly actor: string, readonly target: string }
  'rules.proposal': { readonly proposal: string, readonly pending?: string, readonly kind: string, readonly result?: string, readonly actor?: string, readonly ms?: number }
  'rules.peak-mode': { readonly level: string, readonly by: string, readonly held?: number }
  'rules.recovery': { readonly why: string, readonly dropped: number, readonly kept: boolean }
  'rules.detector-run': { readonly detector: string, readonly ok: boolean, readonly ms: number }
  'rules.check': {
    readonly effect: string
    readonly exitCode: number
    readonly rules: readonly string[]
    readonly peakMode: { readonly level: string, readonly origin: string }
    readonly glmSpend?: string
    readonly glmPeakSource: string
    readonly unknownSignals: readonly string[]
    readonly waitedMs?: number
    readonly caller: string
  }
  'rules.health': { readonly code: string }
  'rules.script': { readonly rule: string, readonly event: string, readonly result: string, readonly ms: number, readonly inCheck: boolean }
  'rules.late-verdict': { readonly rule: string, readonly sig: string, readonly result: string, readonly afterMs: number, readonly told: boolean }
  'rules.repo': { readonly kind: string, readonly digest: string, readonly diffs: number }
  'rules.stale': { readonly listed: number, readonly proposed: number, readonly detectors: number }
}

/** The loop board's kinds, field names verbatim from loop board 0.6 §6.10 minus `at` and `project` (§4.5). */
export interface LoopBodies {
  'loop-fired': { readonly entry: string, readonly run: string, readonly source: string, readonly plugin?: string, readonly row?: string, readonly trigger: { readonly kind: string, readonly event?: string, readonly occurrenceAt?: string }, readonly events: number, readonly cause?: string, readonly late?: boolean }
  'loop-done': { readonly entry: string, readonly run: string, readonly outcome: string, readonly reason?: string, readonly exits?: readonly number[], readonly durationMs?: number, readonly outputBytes?: number, readonly delivery?: string, readonly messageId?: string }
  'loop-entry': { readonly entry: string, readonly op: string, readonly actor: string, readonly via: string, readonly question?: string, readonly sha256?: string }
  'loop-drift': { readonly entry: string, readonly what: string }
  'loop-note': { readonly entry: string, readonly run?: string, readonly chars: number }
  'loop-read': { readonly entry: string, readonly ok: boolean, readonly ms: number, readonly hit: boolean }
  'loop-contribution': { readonly plugin: string, readonly row: string, readonly op: string, readonly accepted: number, readonly dropped: number }
  'loop-duplicate': { readonly event: string, readonly key: string, readonly from: string, readonly firstSeen: string }
  'loop-holder': { readonly session?: string, readonly state: string, readonly reason?: string }
  'loop-handover': { readonly op: string, readonly pid: number, readonly session?: string }
  'loop-task-delete': { readonly entry?: string, readonly scheduleId: string, readonly why: string, readonly deleted: boolean }
}

/** The execution row's kinds, field names from M7 0.6 §3.16 (§4.5). */
export interface ExecuteBodies {
  'execute.dispatch': { readonly role: string, readonly target: string, readonly n: number, readonly child: string, readonly provider: string, readonly model: string, readonly think: string, readonly sameAsMain: boolean, readonly sameAsWorker?: boolean, readonly depth?: string, readonly whyRef: { readonly node: string, readonly hi: number } }
  'execute.dispatch-refused': { readonly code: string }
  'execute.plan': { readonly task: string, readonly version: number, readonly result: string, readonly steps: number, readonly waitedMs: number }
  'execute.ask': { readonly task: string, readonly waitedMs: number, readonly result: string }
  'execute.handback': { readonly task: string, readonly n: number, readonly status: string, readonly stopReason: string, readonly commits: number, readonly files: number, readonly ms: number, readonly outside: number }
  'execute.review-depth': { readonly task: string, readonly declared: string, readonly effective: string, readonly floors: readonly string[], readonly unparsed: boolean }
  'execute.review': { readonly task: string, readonly round: number, readonly depth: string, readonly model: string, readonly blocking: number, readonly nonBlocking: number, readonly downgraded: number }
  'execute.stop': { readonly node: string, readonly kind: string, readonly rounds: number }
  'execute.check': { readonly commit: string, readonly task?: string, readonly ok: boolean, readonly kind: string, readonly cmds: readonly number[], readonly exits: readonly number[], readonly ms: readonly number[], readonly setup: boolean, readonly lockMs: number }
  'execute.advance': { readonly ref: string, readonly how: string, readonly from: string, readonly to: string, readonly task?: string, readonly by: string, readonly checkAfter: boolean, readonly reviewPending: readonly string[], readonly incomingFloor: number, readonly external?: boolean }
  'execute.advance-refused': { readonly missing: string }
  'execute.unchecked-advance': { readonly ref: string, readonly from: string, readonly to: string, readonly missing: string }
  'execute.goal': { readonly goal: string, readonly module?: string, readonly op: string, readonly code?: string, readonly resumeWhy?: string }
  'execute.tier': { readonly tier: number, readonly node: string, readonly running: number, readonly stale: number, readonly told: number, readonly handed: number }
  'execute.completion-gate': { readonly goal: string, readonly ok: boolean, readonly gaps: number }
  'execute.acceptance-review': { readonly goal: string, readonly round: number, readonly model: string, readonly verdict: string, readonly blocking: number }
  'execute.reconcile': { readonly lost: number, readonly redone: number, readonly evidence: number }
  'execute.loop-entry': { readonly entry: string, readonly key: string, readonly sent: boolean, readonly deferred?: string }
  'execute.loop-fallback': { readonly entry: string, readonly key: string, readonly why: string, readonly waitedS: number }
  'execute.loop-contribute': { readonly row: string, readonly accepted: readonly string[], readonly dropped: readonly string[], readonly reasons: readonly string[] }
  'execute.peak-cap': { readonly model: string, readonly cap: number, readonly running: number }
}

/** The operations row's kinds (M7 0.6 §3.16). */
export interface OperateBodies {
  'operate.report': { readonly kind: string, readonly lines: number, readonly units: number }
  'operate.patrol': { readonly found: MetricsMap, readonly did: readonly string[], readonly trunk: string }
}

/** The GLM channel's kinds, field names from M6 0.6 §14.2 (§4.5). */
export interface GlmBodies {
  'glm.quota-read': { readonly ok: boolean, readonly why?: string, readonly ms: number, readonly by: string, readonly windows: MetricsMap, readonly dropped: number }
  'glm.upstream-limit': { readonly code: string, readonly hasReset: boolean }
  'glm.login-rejected': { readonly path: string, readonly status?: number, readonly code?: string }
  'glm.peak-reminder': { readonly window: string, readonly mode: string, readonly note?: string, readonly cap?: number }
}

/** The design row's and git snapshot's kinds, field names from M3 addendum 0.6 §3.12 (§4.5; the 0.5 fields are all here, the 0.6 additions optional). */
export interface DesignBodies {
  'design.proposal-shown': { readonly kind: string, readonly form?: string, readonly number: number, readonly goal: string, readonly module?: string, readonly pending: string, readonly attach?: string, readonly units: number, readonly points?: number, readonly sample?: boolean, readonly again: boolean }
  'design.answer-recorded': { readonly kind: string, readonly form?: string, readonly answer: string, readonly outcome: string, readonly goal: string, readonly module?: string, readonly pending: string, readonly ms: number, readonly units: number, readonly noted: boolean, readonly delegated?: boolean, readonly pickedRecommended?: boolean }
  'design.delegation': { readonly action: string, readonly count: number, readonly scopeUnits: number, readonly where: string }
  'design.proposal-refused': { readonly kind: string, readonly form?: string, readonly code: string, readonly field?: string, readonly within?: string, readonly attach?: string }
  'design.answer-refused': { readonly kind: string, readonly code: string }
  'design.holder-moved': { readonly how: string, readonly from?: string, readonly to?: string }
  'design.rule-denied': { readonly rule: string, readonly tool: string, readonly sessionKind: string }
  'design.bypass-refused': { readonly rule: string, readonly sessionKind: string, readonly goal: string, readonly from: string, readonly to: string }
  'git.snapshot': { readonly class: string, readonly saved: MetricsMap, readonly tagged: boolean, readonly ignored: number, readonly ignoredBytes: number, readonly ms: number }
  'git.snapshot-refused': { readonly code: string }
}

/** The takeover's trial kind, fields one to one with its trial-run record (takeover 0.6, §4.5). */
export interface BootstrapBodies {
  'bootstrap.trial': { readonly commandId: string, readonly round: number, readonly outcome: string, readonly limitMs: number, readonly limitSource: string, readonly ms?: number, readonly envKey: string }
}

/**
 * One kind's event as a caller hands it in: the kind, the submitter and
 * optionally its own instant at the envelope level, the body's fields under
 * `body` — the same two layers the line stores (§4; two sibling kinds
 * declare a body field named `by`, so the layers are kept apart everywhere).
 */
type EventsOf<B> = { [K in keyof B & string]: { readonly k: K, readonly by: MetricsBy, readonly at?: string, readonly body: B[K] } }[keyof B & string]

/** Every event the journal accepts from a caller, with the submitter declared (it varies inside one package: guard and graph both send `rule`). */
export type EmittedEvent =
  | EventsOf<HostBodies>
  | EventsOf<TimeoutBodies>
  | EventsOf<ProgressBodies>
  | EventsOf<RulesBodies>
  | EventsOf<LoopBodies>
  | EventsOf<ExecuteBodies>
  | EventsOf<OperateBodies>
  | EventsOf<GlmBodies>
  | EventsOf<DesignBodies>
  | EventsOf<BootstrapBodies>

/** What the service takes: an emitted event plus the build stamp `emitMetric` added and the session id the service adds. */
export type QueuedEvent = EmittedEvent & { readonly v?: string, readonly sid?: string }

/** Where an event belongs: the session it happened in, or any directory of its project; an event with neither resolvable to a project is counted, not written (§3.5). */
export interface MetricsWhere {
  readonly sessionId?: string
  readonly dir?: string
}

/** The process-local state the /hourness coverage line reads (metrics design §7.3): what this host's writer dropped, the last background self-check's finding, and the events no project could take. */
export interface MetricsCoverage {
  /** Events queued for the project and dropped by the writer (the queue cap and failed writes). */
  readonly dropped: number
  /** The writer's last error code, when writes are failing. */
  readonly reason: string | undefined
  /** The last background self-check in words: 还没跑, 干净, or 有发现：<发现>. */
  readonly selfcheck: string
  /** Events with no project, counted since activation. */
  readonly noProject: number
}

export interface MetricsService {
  /** Record one event for the project of a session or directory. Never throws. */
  emit(event: QueuedEvent, where: MetricsWhere): void
  /** The coverage state for one project root, or undefined when the row has nothing for it. Optional: rows before the report step do not carry it. */
  coverage?(root: string): MetricsCoverage | undefined
}

/** Read the service; undefined while the metrics row is not active, or when `emit` is not a function. */
export function metricsOf(ctx: ServiceLookup): MetricsService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(METRICS_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  if (typeof (value as Partial<Record<keyof MetricsService, unknown>>).emit === 'function') return value as MetricsService
  return undefined
}

/**
 * Emit through the service when it is present, adding `v`, this package's
 * own build stamp (the shared library is compiled into each package's
 * dist/, and src/shared/build-info.ts reads that package's copy; `by` stays
 * on the event, it varies per kind). Never throws: the journal is not the
 * caller's to repair, the caller's fact stands without it.
 */
export function emitMetric(ctx: ServiceLookup, event: EmittedEvent, where: MetricsWhere): void {
  try {
    metricsOf(ctx)?.emit({ ...event, v: buildStamp() }, where)
  }
  catch {
    // The metrics row counts its own failures; nothing to rethrow here.
  }
}
