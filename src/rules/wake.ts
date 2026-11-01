/**
 * The messages the board puts in front of an agent about a ticket
 * (docs/ORCHESTRATION.md §16.12; design §6.3, §6.4): what the message says
 * when a ticket clears, when the agent that opened it is gone and the ticket
 * went to the agent that dispatched it, and when a ticket was expired by the
 * heartbeat of a host that was alive; and the way it is sent, chosen by what
 * the agent is doing. The text is for the model, so it is English. Pure
 * except `deliver`, which calls the host and never throws.
 */
import { createUserNotice, type GoalsService, type MessageableAgentLike, type MessageableAgentsService, type ServiceLookup, type UserNotice } from '../shared/dsh-min.ts'
import { localClock } from './denial.ts'
import { ended, judgeInput } from './judge.ts'
import type { ProjectState, Ticket } from './model.ts'
import type { SignalReading } from './signals.ts'
import { signalsRead } from './table.ts'

/** Source kind of every wake message, and of the notice of a ticket that was expired under a live host. */
const WAKE_SOURCE = 'hourness-rules-wake'

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 80)

/** The registry of live agents, when the host has one of the shape rc.3 gives (agent:596; the three ways to send are agent-loop:790–821). */
export function agentsOf(ctx: ServiceLookup): MessageableAgentsService | undefined {
  const agents: unknown = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  return typeof (agents as MessageableAgentsService | undefined)?.get === 'function' ? agents as MessageableAgentsService : undefined
}

/**
 * The way to reach an agent so that it takes the message: a running one is
 * steered (its next step reads it); an idle one with a goal in the active
 * phase gets it injected (a followup would count as competing input and void
 * the goal driver's reservation of the next round, goal-round-driver:249); any
 * other idle agent gets a followup, which opens a turn. A goal service that is
 * absent, or throws because the agent is not its live instance (dsh-goal
 * `assertLive`, goal:611–614), means no goal.
 */
function wayTo(ctx: ServiceLookup, agent: MessageableAgentLike): 'steer' | 'inject' | 'followup' {
  if (agent.status === 'running') return 'steer'
  const goals: unknown = typeof ctx.get === 'function' ? ctx.get('goals') : undefined
  if (typeof (goals as GoalsService | undefined)?.get !== 'function') return 'followup'
  try {
    return (goals as GoalsService).get(agent)?.phase === 'active' ? 'inject' : 'followup'
  }
  catch {
    return 'followup'
  }
}

/** What became of a message: sent in a way, the agent is not live any more, there is no registry to ask, or the host threw. */
export type Delivery =
  | { readonly kind: 'sent', readonly how: 'steer' | 'inject' | 'followup' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed', readonly why: string }

/** Put a notice in front of the agent of a session. Never throws. */
export function deliver(ctx: ServiceLookup, sessionId: string, notice: UserNotice): Delivery {
  const agents = agentsOf(ctx)
  if (agents === undefined) return { kind: 'unavailable' }
  try {
    const agent = agents.get(sessionId)
    if (agent === undefined) return { kind: 'gone' }
    const how = wayTo(ctx, agent)
    agent[how](notice)
    return { kind: 'sent', how }
  }
  catch (error) {
    return { kind: 'failed', why: message(error) }
  }
}

/** The notice a wake is sent as. */
export function wakeNotice(ticket: Ticket, text: string): UserNotice {
  return createUserNotice(WAKE_SOURCE, `ticket ${ticket.id}`, text, { ticket: ticket.id })
}

const callOf = (ticket: Ticket): string => `${ticket.tool} "${ticket.summary}"`

/**
 * A ticket cleared. `because` says why (`clearedBecause`). A ticket that sits
 * with the agent that dispatched the subagent it was opened by says the
 * subagent has ended; any other tells the agent it may run the call again, and
 * from where when the call was made by a `run_code` program.
 */
export function wakeText(ticket: Ticket, because: string, handedOver: boolean): string {
  const head = `[rules board] Ticket ${ticket.id} cleared: ${because}.`
  if (handedOver && ticket.handedFrom !== undefined) {
    return `${head} Subagent "${ticket.handedFrom.agentLabel}" was deferred on ${callOf(ticket)} and has ended. Dispatch the task again or run the call yourself; a new dispatch of the same call reuses ${ticket.id}.`
  }
  return `${head} You may run the deferred call again${ticket.nested === true ? ' from a run_code program' : ''}: ${callOf(ticket)}.`
}

/** A ticket expired because its host's heartbeat did not get written in 45 seconds, though the host is alive: the rule may still hold. */
export function heartbeatLostText(ticket: Ticket): string {
  return `[rules board] Ticket ${ticket.id} was expired after a heartbeat timeout of this host; ${ticket.rules.length === 1 ? 'rule' : 'rules'} ${ticket.rules.join(', ')} may still hold. Running ${callOf(ticket)} again queues it again if it does.`
}

function signalNow(name: string, reading: SignalReading | undefined, state: ProjectState): string {
  if (reading === undefined) return `${name} cannot be read now`
  if (reading.value === undefined) return reading.unknown
  const value = typeof reading.value === 'boolean' ? (reading.value ? 'on' : 'off') : String(reading.value)
  const at = reading.source === 'manual' ? state.signals?.[name]?.manual?.at : undefined
  return `${name} is ${value} now${at === undefined ? '' : ` (set by the human at ${localClock(at)})`}`
}

function whyEnded(id: string, state: ProjectState, readings: ReadonlyMap<string, SignalReading>, now: Date): string {
  const rule = state.rules !== undefined && Object.hasOwn(state.rules, id) ? state.rules[id] : undefined
  if (rule === undefined) return `rule ${id} was deleted`
  if (rule.status === 'lifted') return `rule ${id} was lifted by the human`
  if (rule.status === 'expired' || ended(rule, judgeInput({ now, project: '', events: [], signals: [...readings.values()] }))) return `rule ${id} has expired`
  const names = signalsRead(rule)
  return names.length === 0 ? `the condition of rule ${id} no longer holds` : names.map(name => signalNow(name, readings.get(name), state)).join(', ')
}

/**
 * Why a ticket stopped waiting: what the rules that held it say now. A rule
 * that is lifted, deleted or out of time says so; one whose condition no
 * longer holds names the signals it reads, with their value and who set it. A
 * stronger rule that blocks the call now is named instead.
 */
export function clearedBecause(ticket: Ticket, state: ProjectState, readings: ReadonlyMap<string, SignalReading>, now: Date, blocking: readonly string[]): string {
  if (blocking.length > 0) return `${blocking.length === 1 ? 'rule' : 'rules'} ${blocking.join(', ')} ${blocking.length === 1 ? 'blocks' : 'block'} the call now`
  return [...new Set(ticket.rules.map(id => whyEnded(id, state, readings, now)))].join('; ')
}
