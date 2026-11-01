/**
 * The rules board's per-step reminder (docs/ORCHESTRATION.md §16.12; design
 * §6.4): an `agent/pre-step` notice, through the shared step-notice seam, that
 * tells an agent the two things the harness does not carry out for it: the
 * rules of the person that only inform and apply to it, and its own waiting
 * tickets. Rules that block, queue or record are not in it, since the harness
 * carries them out and tells the agent in the refusal; the default rule of
 * GLM's prices is not in it, since the GLM package's reminder tells that.
 *
 * Like the graph's step projection, it reads the request-visible history and
 * adds a notice only when that history does not show the current text: the
 * first time, when the text changed, after a compaction took the earlier
 * notice out of what the model sees, and on a goal round. Nothing in the
 * reminder, after there was something, is said once.
 */
import { createHash } from 'node:crypto'
import { projectOf } from '../data/project-root.ts'
import { CHECKPOINT_SOURCE, GOAL_ROUND_SOURCE } from '../graph/reminder.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type ServiceLookup, type SessionLike } from '../shared/dsh-min.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { callerOf } from './caller.ts'
import { localClock } from './denial.ts'
import { stepEvent } from './events.ts'
import { judge, judgeInput } from './judge.ts'
import { openTickets } from './listing.ts'
import { effectivePeakMode, type Ticket } from './model.ts'
import type { PeakReading, ProjectView } from './peak.ts'
import { clockReadings, tableOf } from './table.ts'

/** Source kind of the persisted reminder notice. */
const REMINDER_SOURCE = 'hourness-rules'

const HEADING = 'Rules board: for your information only; the harness does not check these.'
const NOTHING = 'No rules board item applies to you now.'
const HANDED_OVER_ADVICE = 'Do not dispatch these tasks again before their tickets clear.'
/** At most this many lines of items; the rest is counted. */
const MAX_ITEMS = 12

const REASONS = ['compaction', 'goal-round', 'first', 'changed'] as const
type Reason = typeof REASONS[number]

/** Facts persisted in the notice source; later steps tell from them what the model was shown. */
interface Facts {
  /** First 12 hex digits of the SHA-256 of the text. */
  readonly digest: string
  /** compactionId of the latest checkpoint visible when the notice was added. */
  readonly anchor?: string
  readonly reason: Reason
}

interface History {
  readonly notice?: Facts & { readonly index: number }
  readonly checkpoint?: { readonly index: number, readonly id?: string }
}

export interface ReminderDeps {
  readonly ctx: ServiceLookup
  readonly now: () => number
  /** The project of a working directory, as the row reads it; it throws when the files cannot be read. */
  readonly project: (cwd: string) => ProjectView | undefined
  readonly peak: () => PeakReading
  /** Told what went wrong with a step's reminder; the step goes on without it. */
  readonly warn: (message: string) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function factsOf(value: unknown): Facts | undefined {
  if (!isRecord(value)) return undefined
  const { digest, anchor, reason } = value
  if (typeof digest !== 'string' || !REASONS.includes(reason as Reason) || (anchor !== undefined && typeof anchor !== 'string')) return undefined
  return { digest, ...(anchor === undefined ? {} : { anchor }), reason: reason as Reason }
}

/** The latest notice of the board and the latest compaction checkpoint in what the model sees. */
function scan(history: readonly DerivedMessage[]): History {
  let notice: History['notice']
  let checkpoint: History['checkpoint']
  for (let index = history.length - 1; index >= 0 && (notice === undefined || checkpoint === undefined); index--) {
    const message = history[index]
    const kind = message?.source?.kind
    if (kind === CHECKPOINT_SOURCE) {
      const id = message?.source?.compactionId
      checkpoint ??= typeof id === 'string' ? { index, id } : { index }
    }
    else if (message?.role === 'user' && kind === REMINDER_SOURCE) {
      const facts = factsOf(message.source?.rulesReminder)
      if (facts !== undefined) notice ??= { ...facts, index }
    }
  }
  return { ...(notice === undefined ? {} : { notice }), ...(checkpoint === undefined ? {} : { checkpoint }) }
}

/** Why this step needs a notice, or undefined when what the model sees already says it. An empty reminder is said only after a reminder that was not empty. */
function reasonFor(seen: History, digest: string, goalRound: boolean, empty: boolean): Reason | undefined {
  const { notice, checkpoint } = seen
  if (empty) return notice !== undefined && notice.digest !== digest ? 'changed' : undefined
  if (checkpoint !== undefined && (notice === undefined || notice.index < checkpoint.index || notice.anchor !== checkpoint.id)) return 'compaction'
  if (goalRound) return 'goal-round'
  if (notice === undefined) return 'first'
  return notice.digest === digest ? undefined : 'changed'
}

const isGoalRound = (message: unknown): boolean => isRecord(message) && isRecord(message.source) && message.source.kind === GOAL_ROUND_SOURCE

function ticketItem(ticket: Ticket, subagent: boolean): string {
  const call = `${ticket.tool} "${ticket.summary}"`
  if (ticket.handedFrom !== undefined && !subagent) {
    return `${ticket.id} handed over from subagent "${ticket.handedFrom.agentLabel}": ${call}${ticket.state === 'cleared' ? ' (cleared, dispatch it again or run it)' : ''}`
  }
  return ticket.state === 'cleared'
    ? `${ticket.id} ${call} (cleared at ${localClock(ticket.clearedAt ?? ticket.since)}, run it again)`
    : `${ticket.id} ${call} (deferred since ${localClock(ticket.since)})`
}

/**
 * The text of the reminder for one agent: empty when nothing applies to it;
 * undefined when its session is not in a project the board can read.
 */
function textFor(deps: ReminderDeps, agent: AgentLike, session: SessionLike): string | undefined {
  const cwd = session.header.cwd
  const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
  const view = project === undefined || cwd === undefined ? undefined : deps.project(cwd)
  if (project === undefined || view === undefined) return undefined
  const { state } = view.read
  const caller = callerOf(deps.ctx, agent)
  const now = new Date(deps.now())
  const { readings } = clockReadings(state, deps.peak(), now)
  const table = tableOf(state, effectivePeakMode(state).level)
  const why = (item: 'role' | 'model' | 'session'): string => caller.unknown[item] ?? `the ${item} of this step is not known`
  const input = judgeInput({
    now,
    project: project.root,
    events: [stepEvent({ at: now.toISOString(), project: project.root, ...(caller.role === undefined ? {} : { role: caller.role }), ...(caller.model === undefined ? {} : { model: caller.model }), session: session.id })],
    signals: [...readings.values()],
    unreadable: { role: why('role'), model: why('model'), session: why('session') },
  })
  const byId = new Map(table.map(rule => [rule.id, rule]))
  const informing = judge(input, table).hits.flatMap((hit) => {
    const rule = byId.get(hit.rule)
    return hit.effect === 'inform' && rule !== undefined && rule.scope !== 'builtin' ? [rule] : []
  })
  const tickets = openTickets(state).filter(ticket => ticket.sessionId === session.id)
  const subagent = session.header.origin === 'subagent'
  // A line of tickets is worth more than a line of rules: it keeps its place when the rules are cut.
  const room = MAX_ITEMS - (tickets.length > 0 ? 1 : 0)
  const rules = informing.slice(0, room).map(rule => `- [inform, not checked] ${rule.id}: "${rule.title}" (set by ${rule.origin.actor === 'human' ? 'the human' : 'an agent, with the human\'s agreement'})`)
  const more = informing.length - rules.length
  const handedOver = tickets.some(ticket => ticket.handedFrom !== undefined && !subagent)
  const ticketLine = tickets.length === 0 ? [] : [`Your open tickets: ${tickets.map(ticket => ticketItem(ticket, subagent)).join('; ')}.${handedOver ? ` ${HANDED_OVER_ADVICE}` : ''}`]
  const items = [...rules, ...(more > 0 ? [`and ${more} more: call rules_show`] : []), ...ticketLine]
  return items.length === 0 ? '' : [...(informing.length > 0 ? [HEADING] : []), ...items].join('\n')
}

/**
 * Install the reminder on one agent through the shared step-notice seam. A
 * reminder that fails to build warns and leaves the step as it was. Returns
 * undefined, installing nothing, when the agent has no session history.
 */
export function installReminder(agent: AgentLike, deps: ReminderDeps): (() => void) | undefined {
  return installStepNotice(agent, 'rules reminder', () => true, (history, { admitted, session }) => {
    try {
      const body = textFor(deps, agent, session)
      if (body === undefined) return undefined
      const text = body === '' ? NOTHING : body
      const digest = createHash('sha256').update(text).digest('hex').slice(0, 12)
      const seen = scan(history)
      const reason = reasonFor(seen, digest, admitted.some(isGoalRound), body === '')
      if (reason === undefined) return undefined
      const anchor = seen.checkpoint?.id
      const facts: Facts = { digest, ...(anchor === undefined ? {} : { anchor }), reason }
      return createUserNotice(REMINDER_SOURCE, `rules board reminder (${reason})`, wrapSystemReminder(text), { rulesReminder: facts })
    }
    catch (error) {
      deps.warn(`the reminder of the rules board was skipped for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }, 'rules')
}
