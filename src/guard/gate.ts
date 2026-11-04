/**
 * The one installation function of the guard framework (m4-gate G1, design
 * §3.1): every row that judges calls at `tools/pre-execute` — the guard row,
 * the graph row's graph-files-only, the loop board's two gates, later the
 * metrics row's — mounts the same listener through it, and `evaluate` is
 * gone. For each root call it maps the tool name to the DSH native, asks the
 * row for the rules of this call, removes the rules the human lifted
 * (src/guard/lift.ts), judges every rule and keeps every denial
 * (src/guard/rules.ts judge), journals one violation record per denial with
 * what the call touched (src/guard/records.ts subjectOf), and denies with
 * the first correction. A journal write that failed counts against the
 * session and is named on the row health with `note`, so a lost record is
 * never silent; a call is denied whether or not its record landed. A rule
 * whose detector threw fails open, and the row health names it. The
 * follow-up recorder (src/guard/followup.ts, G2) settles the agent's pending
 * follow-up as the listener's first step, notes every denial, and writes the
 * settled records through this row's journal; the request grants hook in
 * with G4.
 */
import type { JsonValue } from '../shared/json.ts'
import { dialectService, toNativeTool } from '../shared/dialect.ts'
import type { Route } from '../shared/route.ts'
import type { PreExecuteHost, PreExecuteListener, ServiceLookup, SessionEventHost, SessionEventLike, SessionLike, ToolExecutionPayload } from '../shared/dsh-min.ts'
import { sessionIdOf, type RowHealth } from '../shared/health.ts'
import { projectRootOf } from '../data/project-home.ts'
import type { RouteScope } from './origin.ts'
import { liftedRules } from './lift.ts'
import { judge, renderCorrection, type GuardRule, type RuleDeny, type ToolCall, type ToolFace } from './rules.ts'
import { keyOf as recordKeyOf, subjectOf, type FollowupRecord, type GrantRecord, type GrantVoidRecord, type GuardRecord, type ViolationRecord } from './records.ts'
import type { GrantEntry } from './request.ts'
import * as followup from './followup.ts'
import { emitGuardMetric } from './metrics.ts'

/** The rules for one root call, and the face and origin they judge under. */
interface GateRules {
  readonly rules: readonly GuardRule[]
  readonly face: ToolFace
  /** Where the call ran (src/guard/origin.ts); every record carries it. */
  readonly origin: { readonly scope: RouteScope, readonly route?: Route | undefined }
}

/** What the grants hook made of a denied call's matching grant (design §5.6). */
type GrantsOutcome =
  | {
    /** A grant matched and survived the use-time check and backup: that rule's denial is removed. */
    readonly kind: 'carried'
    readonly rule: string
    /** The matched grant (the row's books keep it). */
    readonly grant: GrantEntry
    /** Called before `next()`: one process must not run two identical granted calls in parallel. */
    markInUse(): void
    /** Called after `next()` allowed: the grant is spent; returns the backup path for the GrantRecord. */
    consume(): string | undefined
    /** Called when `next()` did not allow (another listener denied): back to unused. */
    release(): void
  }
  | { /** The use-time check failed: the grant is voided, the call is denied anew. */
    readonly kind: 'void', readonly rule: string, readonly ref: string, readonly reason: string }
  | { /** The backup failed: the call is denied, the grant stays. */
    readonly kind: 'backup-failed', readonly rule: string, readonly ref: string, readonly target: string, readonly reason: string }

export interface RuleGateOptions {
  /** Row name for health and console warnings. */
  readonly row: string
  /** Outermost (cordis prepend) or in registration order. */
  readonly prepend: boolean
  /** The rules for one root call; undefined: this row has nothing to judge here (the call still settles a follow-up from G2 on). */
  rules(payload: ToolExecutionPayload, call: ToolCall): Promise<GateRules | undefined> | GateRules | undefined
  /**
   * Writes one violation record (design §3.2); the payload tells the row
   * which session, hence which project. A journal that returns a promise
   * reports 'failed' writes to the gate, which counts them per session; a
   * rejected promise counts as 'failed' too. One that returns nothing is not
   * counted, and neither is 'no-home' (nothing was attempted; the row health
   * says so).
   */
  readonly journal: (record: GuardRecord, payload: ToolExecutionPayload) => Promise<'written' | 'failed' | 'no-home'> | void
  /** The row's health; the gate attaches its two lasting problems with `note` (design §3.1). */
  readonly health?: Pick<RowHealth, 'note'>
  /** Writes the journal's pending gap record on its own; the gate calls it on `session/disposed`. Absent: nothing is flushed. */
  readonly flush?: () => Promise<void> | void
  /** The calls that ran, where they ran: the guard row feeds its workspace-change fallback (design §3.4). */
  allowed?(payload: ToolExecutionPayload, origin: GateRules['origin']): void
  /**
   * Judge calls that carry `parent` (a `run_code` program's tool call) like
   * direct ones. Default false: a transport sub-call passes without reaching
   * the rules (design §3.1 step 1). The loop board's files gate judges them
   * (ORCHESTRATION.md §18.8), so it sets this.
   */
  readonly judgeChildren?: boolean | undefined
  /**
   * A requestable rule denied with a ref (m4-request-card, design §5.1 step
   * 1): the row files the refusal in its memory (the later `request_exception`
   * cites it). Called once per such denial, before the record is journaled.
   */
  registerRequestableDenial?(input: { readonly payload: ToolExecutionPayload, readonly call: ToolCall, readonly deny: RuleDeny }): void
  /**
   * The request grants hook (design §5.6): a requestable rule denied, the row
   * matches a human grant by signature and dispatch root and runs the use-time
   * check and backup. `carried` removes that rule's denial (the call passes
   * once); `void` and `backup-failed` deny with their own sentences instead of
   * the rule's correction.
   */
  grants?(input: { readonly payload: ToolExecutionPayload, readonly call: ToolCall, readonly denies: readonly RuleDeny[], readonly origin: GateRules['origin'] }): Promise<GrantsOutcome | undefined> | GrantsOutcome | undefined
}

/** The row's context: pre-execute, service lookup, and the two session observers the follow-up recorder needs (design §3.3). */
export type GateHost = PreExecuteHost & ServiceLookup & SessionEventHost

/** Whether this listener was installed by installRuleGate; the contracts test counts listeners by it (design §3.8). */
export function isGateListener(listener: unknown): boolean {
  return typeof listener === 'function' && (listener as { mark?: unknown }).mark === true
}

/** The working directory of the session a call belongs to, when it has one. */
export function cwdOf(payload: ToolExecutionPayload): string | undefined {
  const header = payload.agent?.session?.header.cwd
  return typeof header === 'string' && header.length > 0 ? header : undefined
}

/** Sessions whose rule detector errors were already warned about, per row: a rule warns once per session. */
const ruleWarned = new Map<string, Set<string>>()

/** Records a session lost so far, per row; a recovered write never resets the count (design §3.1 step 7). */
const lostRecords = new Map<string, number>()

/** How many code rules to name in the health note before it says 等. */
const NAMED_RULES_LIMIT = 3
/** How many code points of one note the row health keeps. */
const NOTE_LIMIT = 80

const cut = (text: string): string => Array.from(text).slice(0, NOTE_LIMIT).join('')

/**
 * Install the gate for one row: the `tools/pre-execute` listener (outermost
 * or in registration order, as the row registers today) and the session
 * observers — `session/event` feeds the follow-up recorder's map of call
 * events, `session/disposed` settles its pending denial and flushes the row
 * journal. The returned function unsubscribes all three.
 */
export function installRuleGate(ctx: GateHost, options: RuleGateOptions): () => void {
  const listener: PreExecuteListener = async (payload, next) => {
    if (payload.parent !== undefined && options.judgeChildren !== true) return next()
    const call: ToolCall = { name: toNativeTool(dialectService(ctx), payload.name), arguments: (payload.arguments ?? {}) as JsonValue }
    const sessionId = sessionIdOf(payload.agent)
    const callId = typeof payload.callId === 'string' ? payload.callId : undefined
    // The follow-up recorder first (design §3.1 step 3): this call settles the agent's pending follow-up,
    // whoever denies or allows it after; its journal hook carries the settled record to this row's journal.
    followup.observe(payload.agent, call, callId ?? '')
    if (sessionId !== undefined && callId !== undefined) {
      followup.hookJournal(sessionId, record => { writeFollowup(record, payload, ctx, options, sessionId) })
    }
    let gate: GateRules | undefined
    try {
      gate = await options.rules(payload, call)
    }
    catch (error) {
      console.warn(`dsh-glm-hourness/${options.row}: the rules could not be prepared for a call: ${(error as Error).message}`)
      return next()
    }
    if (gate === undefined) return next()
    const root = projectRootOf(cwdOf(payload))
    const lifted = root === undefined ? undefined : liftedRules(root)
    const active = lifted === undefined || lifted.size === 0 ? gate.rules : gate.rules.filter(rule => !lifted.has(rule.id))
    const { denies, errors } = judge(active, call, gate.face)
    if (errors.length > 0) noteRuleErrors(options, sessionId, errors)
    let denialList = denies
    // The request channel (m4-request-card, design §5.1 step 1, §5.6): the row
    // files a requestable denial's refusal, and a matching human grant removes
    // that one denial — spent once, checked and backed up at use time, voided
    // or denied when the check or the backup fails.
    if (denialList.length > 0 && denialList.some(deny => deny.ref !== undefined)) {
      for (const deny of denialList) {
        if (deny.ref !== undefined) options.registerRequestableDenial?.({ payload, call, deny })
      }
      if (options.grants !== undefined) {
        const outcome = await options.grants({ payload, call, denies: denialList, origin: gate.origin })
        if (outcome !== undefined) {
          if (outcome.kind === 'carried') {
            const rest = denialList.filter(deny => deny.rule !== outcome.rule)
            if (rest.length === 0) {
              outcome.markInUse()
              const decision = await next()
              if (decision.kind === 'allow') {
                const backup = outcome.consume()
                const record: GrantRecord = {
                  kind: 'grant',
                  ...recordOrigin(payload, gate.origin, outcome.rule),
                  ref: outcome.grant.ref,
                  signature: outcome.grant.signature,
                  call: subjectOf(call),
                  ...(backup === undefined ? {} : { backup }),
                }
                writeJournaled(record, payload, options, sessionId)
                return decision
              }
              outcome.release()
              return decision
            }
            denialList = rest
          }
          else if (outcome.kind === 'void') {
            const record: GrantVoidRecord = {
              kind: 'grant-void',
              ...recordOrigin(payload, gate.origin, outcome.rule),
              ref: outcome.ref,
              reason: outcome.reason,
            }
            writeJournaled(record, payload, options, sessionId)
            return { kind: 'deny', reason: `The target changed since the human approved (${outcome.reason}); call request_exception again.` }
          }
          else {
            options.health?.note(sessionId, 'grant-backup', cut(`放行的备份失败：${outcome.target}`))
            return { kind: 'deny', reason: `Error: the approved write was not run: backing up ${outcome.target} failed (${outcome.reason}); resubmit the call or ask the human` }
          }
        }
      }
    }
    if (denialList.length > 0) {
      const reason = renderCorrection(denialList[0].correction)
      for (const deny of denialList) {
        const record: ViolationRecord = {
          ...recordOrigin(payload, gate.origin, deny.rule),
          correction: renderCorrection(deny.correction),
          call: subjectOf(call),
          ...(deny.ref === undefined ? {} : { ref: deny.ref }),
        }
        if (payload.agent !== undefined && callId !== undefined) {
          const rule = active.find(candidate => candidate.id === deny.rule)
          const rightPath = rule?.rightPath
          followup.noteDenial(payload.agent, callId, {
            rule: deny.rule,
            call,
            key: recordKeyOf(record),
            // The recorder calls the rule's right path with the two calls; a rule object carries no `this`.
            ...(rightPath === undefined ? {} : { rightPath: (next: ToolCall, denied: ToolCall) => rightPath(next, denied) }),
            origin: gate.origin,
          })
        }
        // The denial returns at once; the write is counted when the journal settles: an outcome of 'failed'
        // or a rejected promise (design §3.1 step 7). 'no-home' and a journal that returns nothing are not counted.
        void (async () => {
          emitGuardMetric(ctx, {
            kind: 'denial',
            rule: record.rule,
            ...(record.scope === undefined ? {} : { scope: record.scope }),
            ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
          })
          const outcome = await options.journal(record, payload)
          if (outcome === 'failed') lose(options.row, sessionId, options.health)
        })().catch(() => lose(options.row, sessionId, options.health))
      }
      return { kind: 'deny', reason }
    }
    const decision = await next()
    if (decision.kind === 'allow') options.allowed?.(payload, gate.origin)
    return decision
  }
  // The gate marks every listener it installs (design §3.1); the contracts test counts pre-execute listeners by it.
  ;(listener as { mark?: boolean }).mark = true
  const dispose = (session: SessionLike): void => {
    if (session !== undefined) followup.sessionDisposed(session)
    void options.flush?.()
  }
  ;(dispose as { mark?: boolean }).mark = true
  const onEvent = (session: SessionLike, event: SessionEventLike): void => followup.sessionEvent(session, event)
  ;(onEvent as { mark?: boolean }).mark = true
  const uninstallListener = ctx.on('tools/pre-execute', listener, { prepend: options.prepend })
  const uninstallEvents = ctx.on('session/event', onEvent)
  const uninstallDispose = ctx.on('session/disposed', dispose)
  return () => {
    uninstallDispose()
    uninstallEvents()
    uninstallListener()
  }
}

/**
 * Write one settled follow-up record through the row's journal with the
 * payload of the call that registered the hook (the same session, so the
 * same project), counting a failed write against the session like any lost
 * record (design §3.2) and emitting the metric with the outcome (design
 * §3.11).
 */
function writeFollowup(record: FollowupRecord, payload: ToolExecutionPayload, ctx: ServiceLookup, options: RuleGateOptions, sessionId: string | undefined): void {
  emitGuardMetric(ctx, {
    kind: 'followup',
    rule: record.rule,
    outcome: record.outcome,
    ...(record.scope === undefined ? {} : { scope: record.scope }),
    ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
  })
  writeJournaled(record, payload, options, sessionId)
}

/** The origin fields every journal record carries (design §3.2): when, which rule and tool, who and where. */
function recordOrigin(payload: ToolExecutionPayload, origin: GateRules['origin'], rule: string): { readonly at: string, readonly rule: string, readonly tool: string } & GateRules['origin'] {
  return {
    at: new Date().toISOString(),
    rule,
    tool: payload.name,
    ...(payload.agent?.id === undefined ? {} : { agentId: payload.agent.id }),
    ...(payload.agent?.session?.id === undefined ? {} : { sessionId: payload.agent.session.id }),
    ...origin,
  }
}

/** Write one record through the row's journal with the call's payload; a failed write counts against the session (design §3.1 step 7). */
function writeJournaled(record: GuardRecord, payload: ToolExecutionPayload, options: RuleGateOptions, sessionId: string | undefined): void {
  void (async () => {
    const written = await options.journal(record, payload)
    if (written === 'failed') lose(options.row, sessionId, options.health)
  })().catch(() => lose(options.row, sessionId, options.health))
}

/** Name the rules whose detector threw on the row health and warn once per rule and session (design §3.1 step 5). */
function noteRuleErrors(options: RuleGateOptions, sessionId: string | undefined, errors: readonly string[]): void {
  const named = errors.slice(0, NAMED_RULES_LIMIT).join('、')
  options.health?.note(sessionId, 'rule-errors', cut(`规则 ${named}${errors.length > NAMED_RULES_LIMIT ? ' 等' : ''} 判定出错`))
  const warned = ruleWarned.get(keyOf(options.row, sessionId)) ?? new Set<string>()
  ruleWarned.set(keyOf(options.row, sessionId), warned)
  for (const rule of errors) {
    if (warned.has(rule)) continue
    warned.add(rule)
    console.warn(`dsh-glm-hourness/${options.row}: rule ${rule} could not judge a call; it fails open and is named on the row health`)
  }
}

/** Count one lost record against the session and name it on the row health (design §3.1 step 7); the count survives a recovered write. */
function lose(row: string, sessionId: string | undefined, health: RuleGateOptions['health']): void {
  const lost = (lostRecords.get(keyOf(row, sessionId)) ?? 0) + 1
  lostRecords.set(keyOf(row, sessionId), lost)
  health?.note(sessionId, 'violations-lost', cut(`${lost} 条违规没有落盘`))
}

const keyOf = (row: string, sessionId: string | undefined): string => `${row}:${sessionId ?? ''}`
