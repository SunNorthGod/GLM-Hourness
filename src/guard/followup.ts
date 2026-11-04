/**
 * The follow-up recorder (m4-gate G2, design §3.3): after a denial it
 * settles, on the agent's next model-issued call, whether the model went the
 * rule's right path, retried the same call verbatim, did something else, or
 * ended the turn without a next call. One module-level recorder serves every
 * gate that hooks into it — the rows installed through installRuleGate (the
 * gate calls observe as the first step of its listener and notes every
 * denial) and the listeners that do not use the gate (the rules board's tool
 * gate; M3's git snapshot gate adds its two calls in its own alignment
 * round). The orchestration package is emitted file by file, so the rows
 * import one module instance and the maps below are shared; the probe
 * scenario `guard-followup` checks a record written across two rows.
 *
 * Only model-issued calls settle: a call settles when its session log holds
 * a `tool/call` event for it, which the agent loop appends before the
 * pre-execute waterfall runs (agent-loop:578–582, session:1574–1593). A
 * call another plugin issues through `tools.execute` has no event and is
 * never settled or counted: the measure is what the model did after reading
 * the denial. A `DeferredToolCall` wrapper is the model's call and has an
 * event; its target runs as `<callId>:deferred` without one, so its turn and
 * step are read off the wrapper's event and the wrapper's observe marks both
 * ids settled (F9).
 *
 * A settled record is written through the journal one of the gates handed
 * over for the session (hookJournal): the row's project journal, so a lost
 * record lands in the journal's gap (design §3.2). The gate's hook also
 * emits the metric (design §3.11). Memory is bounded: at most one pending
 * denial per agent, 256 pending denials, 512 settled call ids, 512 call
 * events per session across 64 sessions, 64 journal hooks — the oldest
 * leaves first. Everything not yet settled is lost on a process restart;
 * the journal then holds fewer follow-ups, nothing else changes.
 */
import type { AgentLike, ServiceLookup, SessionEventLike, SessionLike } from '../shared/dsh-min.ts'
import { unwrapDeferredCall } from '../shared/deferred-call.ts'
import { dialectService, toNativeTool } from '../shared/dialect.ts'
import type { CallOrigin } from './origin.ts'
import type { FollowupRecord } from './records.ts'
import type { GuardRule, ToolCall } from './rules.ts'

/** What the noting gate hands over for one denial (design §3.3). */
export interface PendingDenial {
  readonly rule: string
  /** The denied call as it will be compared: the DSH native, a `DeferredToolCall` wrapper unwrapped. */
  readonly call: ToolCall
  /** The recordKey of the denial's journal line. */
  readonly key: string
  readonly rightPath?: GuardRule['rightPath']
  readonly origin: CallOrigin
}

/** How a gate lets the recorder write a settled follow-up: its row's project journal (the gate's hook emits the metric with it). */
export type FollowupWrite = (record: FollowupRecord) => void

/** What one settlement came to: right-path, repeat or other for a next call, none when the turn or the session ended first. */
export type SettledOutcome = Exclude<FollowupRecord['outcome'], 'none'>

/** At most one pending denial per agent, and at most this many in the table (design §3.3). */
const PENDING_LIMIT = 256
/** Settled call ids remembered, so a call is settled once however many gates see it. */
const SETTLED_LIMIT = 512
/** Call events kept per session: the turn and step of each model-issued call. */
const EVENT_LIMIT = 512
/** Sessions the call events and the journal hooks track; the oldest leaves first. */
const SESSION_LIMIT = 64

/** The id suffix of a `DeferredToolCall` target (src/toolsearch/index.ts:168). */
const DEFERRED_SUFFIX = ':deferred'

interface PendingEntry {
  readonly denial: PendingDenial
  readonly agentId: string
  readonly sessionId: string
  /** The turn and step the denied call ran in, off its `tool/call` event; a call without an event never compares equal to one with. */
  readonly turn?: number
  readonly step?: number
}

const pending = new Map<string, PendingEntry>()
const settled = new Set<string>()
const events = new Map<string, Map<string, { readonly turn: number, readonly step: number }>>()
const journals = new Map<string, FollowupWrite>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The id the call's event is logged under: a `DeferredToolCall` target runs under the wrapper's id with a suffix. */
const eventKeyOf = (callId: string): string =>
  callId.endsWith(DEFERRED_SUFFIX) ? callId.slice(0, callId.length - DEFERRED_SUFFIX.length) : callId

const eventOf = (sessionId: string, callId: string): { readonly turn: number, readonly step: number } | undefined =>
  events.get(sessionId)?.get(eventKeyOf(callId))

const markSettled = (callId: string): void => {
  settled.add(callId)
  if (settled.size > SETTLED_LIMIT) settled.delete(settled.keys().next().value as string)
}

const rememberEvent = (sessionId: string, callId: string, at: { readonly turn: number, readonly step: number }): void => {
  if (!events.has(sessionId) && events.size >= SESSION_LIMIT) {
    events.delete(events.keys().next().value as string)
  }
  const byCall = events.get(sessionId) ?? new Map<string, { readonly turn: number, readonly step: number }>()
  events.set(sessionId, byCall)
  byCall.set(callId, at)
  if (byCall.size > EVENT_LIMIT) byCall.delete(byCall.keys().next().value as string)
}

/**
 * A stable digest of one call's arguments for the verbatim-retry comparison:
 * object keys sorted, so the same arguments compare equal whatever order the
 * model spelled them in. Values JSON cannot hold fall back to their string.
 */
function canonical(value: unknown): string {
  try {
    if (Array.isArray(value)) return `[${value.map(entry => canonical(entry)).join(',')}]`
    if (isRecord(value)) {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
  }
  catch {
    return String(value)
  }
}

/**
 * What `next` did about `denied` (design §3.3): a verbatim retry of the same
 * native call with the same arguments (both sides unwrapped), or the rule's
 * right path, or something else. The turn's end settles to `none` elsewhere
 * (sessionEvent, sessionDisposed) — there is no next call to compare.
 */
export function followupOf(denied: ToolCall, next: ToolCall, rightPath?: GuardRule['rightPath']): SettledOutcome {
  if (next.name === denied.name && canonical(next.arguments) === canonical(denied.arguments)) return 'repeat'
  if (rightPath?.(next, denied) === true) return 'right-path'
  return 'other'
}

/**
 * Register (or replace) the journal of one session: the gates do it for
 * every root call they see, so the recorder writes a settled follow-up into
 * the row's project journal even when the settling call came from a
 * different listener. Without a hook for the session a settlement writes
 * nothing.
 */
export function hookJournal(sessionId: string, write: FollowupWrite): void {
  if (!journals.has(sessionId) && journals.size >= SESSION_LIMIT) {
    journals.delete(journals.keys().next().value as string)
  }
  journals.set(sessionId, write)
}

/**
 * First thing every gate listener does for a root call: settles the agent's
 * pending follow-up once per model call, whoever denies or allows the call
 * after (F5). A `DeferredToolCall` wrapper settles with the target's
 * identity and marks both ids settled, so the target's own observe (its id
 * is `<callId>:deferred`) does nothing. A call in the same turn and step as
 * the denied one does not settle: the model had not read the denial yet
 * (N16).
 */
export function observe(agent: AgentLike | undefined, call: ToolCall, callId: string): void {
  const sessionId = agent?.session?.id
  if (agent === undefined || sessionId === undefined || callId.length === 0 || settled.has(callId)) return
  markSettled(callId)
  const target = unwrapDeferredCall(call.name, call.arguments)
  if (target !== undefined) markSettled(`${callId}${DEFERRED_SUFFIX}`)
  const settledCall: ToolCall = target === undefined
    ? call
    // The wrapper's target maps through the dialect as any model call would; an agent context reads services like the host's.
    : { name: toNativeTool(dialectService(agent.ctx as unknown as ServiceLookup), target.name), arguments: target.arguments }
  const entry = pending.get(agent.id)
  if (entry === undefined) return
  const at = eventOf(sessionId, callId)
  if (at === undefined) return // not model-issued: the loop logged no tool/call for it
  if (entry.turn !== undefined && entry.step !== undefined && at.turn === entry.turn && at.step === entry.step) return
  pending.delete(agent.id)
  write(sessionId, {
    at: new Date().toISOString(),
    rule: entry.denial.rule,
    tool: settledCall.name,
    agentId: entry.agentId,
    sessionId: entry.sessionId,
    ...entry.denial.origin,
    kind: 'followup',
    denial: entry.denial.key,
    outcome: followupOf(entry.denial.call, settledCall, entry.denial.rightPath),
  })
}

/**
 * The noting gate records one denial as the agent's pending follow-up (design
 * §3.3 step 7): the next model-issued call of this agent settles it. The
 * denied execution's id is `<id>:deferred` for a wrapped call; the record
 * key is the one the denial's journal line carries.
 */
export function noteDenial(agent: AgentLike, callId: string, denial: PendingDenial): void {
  const sessionId = agent.session?.id
  if (sessionId === undefined) return
  if (!pending.has(agent.id) && pending.size >= PENDING_LIMIT) {
    pending.delete(pending.keys().next().value as string)
  }
  const at = eventOf(sessionId, callId)
  pending.set(agent.id, {
    denial,
    agentId: agent.id,
    sessionId,
    ...(at === undefined ? {} : { turn: at.turn, step: at.step }),
  })
}

/**
 * A session log event: `tool/call` maps a call id to its turn and step (the
 * agent loop appends it before the call is gated), `turn/end` settles the
 * session's pending denial as `none` — the turn ended with no next call
 * (N15). Every other event does nothing.
 */
export function sessionEvent(session: SessionLike, event: SessionEventLike): void {
  if (event.type === 'tool/call') {
    const data = isRecord(event.data) ? event.data : undefined
    const callId = typeof data?.callId === 'string' ? data.callId : undefined
    const turn = typeof data?.turn === 'number' ? data.turn : undefined
    const step = typeof data?.step === 'number' ? data.step : undefined
    if (callId !== undefined && callId.length > 0 && turn !== undefined && step !== undefined) {
      rememberEvent(session.id, callId, { turn, step })
    }
    return
  }
  if (event.type === 'turn/end') settleSession(session.id)
}

/**
 * A disposed session: the pending denial settles as `none` like a turn's
 * end, and the session's maps leave the recorder.
 */
export function sessionDisposed(session: SessionLike): void {
  settleSession(session.id)
  events.delete(session.id)
  journals.delete(session.id)
}

/** Settle every pending denial of one session as `none`: no next call came (N15). */
function settleSession(sessionId: string): void {
  for (const [agentId, entry] of [...pending]) {
    if (entry.sessionId !== sessionId) continue
    pending.delete(agentId)
    write(sessionId, {
      at: new Date().toISOString(),
      rule: entry.denial.rule,
      // No call settled it: the record names the denied call's tool, the identity the follow-up is about.
      tool: entry.denial.call.name,
      agentId: entry.agentId,
      sessionId: entry.sessionId,
      ...entry.denial.origin,
      kind: 'followup',
      denial: entry.denial.key,
      outcome: 'none',
    })
  }
}

/** Write one settled record through the session's journal hook, when a gate registered one. */
function write(sessionId: string, record: FollowupRecord): void {
  journals.get(sessionId)?.(record)
}
