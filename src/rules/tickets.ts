/**
 * Waiting tickets (docs/ORCHESTRATION.md §16.12; design §6.3): a call a rule of
 * the person queues is refused once and gets a ticket; the same call again is
 * the same ticket; the host that owns the ticket judges it again every five
 * seconds and, when no rule holds the call any more, tells the agent that
 * made it, once. A ticket of a subagent whose session ends goes to the agent
 * that dispatched it, or is cancelled when there is none; a ticket of a
 * session of the person is cancelled with the session. The board decides when
 * a ticket expires in the planning step of a write (plan.ts); this host adds
 * the decisions only it can make (a ticket that stood for a day, an agent that
 * did not come back) and tells the agent when its own ticket was expired
 * because the heartbeat of this host was late.
 *
 * Every call into the host (the registry of live agents, the goal service,
 * sending a message) is wrapped: a throw degrades the row's health with the
 * reason and never leaves the gate, the timer or an event listener.
 *
 * The stop level (docs/ORCHESTRATION.md §16.13) uses the same tickets in two
 * ways. Dispatching a GLM subagent is an ordinary ticket, on the agent that
 * dispatches, which is told it can dispatch again. The tool calls of a GLM
 * subagent are one ticket for the whole session, `any:builtin:glm-peak-stop`,
 * and the subagent's active goal is paused with it: the ticket records the
 * goal and the revision the pause made, and when the ticket ends (the peak is
 * over, the level changed, the person let the session work) the goal is
 * resumed first and the subagent is told to carry on. A goal is resumed only
 * if it is still as the board left it. The main agent is never held. Because a
 * paused goal outlives the host, a host takes over the stop tickets of a
 * session that appears on it (`adopt`), and an unloading row resumes the goals
 * it paused (`release`).
 */
import { createHash } from 'node:crypto'
import { projectOf } from '../data/project-root.ts'
import type { MessageableAgentLike, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import type { RowHealth } from '../shared/health.ts'
import { sessionRoute } from '../shared/route.ts'
import { PEAK_STOP_SIGNATURE } from './builtin.ts'
import type { DescribedCall } from './call.ts'
import type { Caller } from './caller.ts'
import { denialText, ticketLimitText, type DenialInput, type PeakSetting } from './denial.ts'
import { openRulesBoard, type RulesBoard } from './engine.ts'
import { gateEvents, modelId, type RulesEventRecord } from './events.ts'
import { pauseGoal, resumeGoal, type Pause, type Resume } from './goal.ts'
import type { HeartbeatWriter } from './heartbeat.ts'
import { judge, judgeInput, type JudgeParts, type RuleHit } from './judge.ts'
import { openTickets } from './listing.ts'
import { canonicalJson, effectivePeakMode, type BuiltinRule, type ProjectState, type Rule, type Ticket } from './model.ts'
import type { PeakReading, ProjectView } from './peak.ts'
import type { HostRef } from './request.ts'
import type { StoreIo } from './store.ts'
import { clockReadings, tableOf } from './table.ts'
import { agentsOf, clearedBecause, deliver, heartbeatLostText, isStopTicket, stopWakeText, wakeNotice, wakeText } from './wake.ts'

/** A session has at most this many open tickets (design §6.3). */
const MAX_OPEN = 20
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const NOT_RETRIED_MS = 30 * MINUTE_MS
/** The whole of what the row does on its way out to put the goals right (design §6.3). */
const UNLOAD_MS = 2_000
/** The model of a stop ticket whose session is not the one that was held (the ticket went to the agent that dispatched it, or the session has made no request since the restart): the entry that holds it asks for a GLM model, which the ticket was opened for. */
const HELD_MODEL = 'glm/glm'

/** A queued call the gate hands over: all that is needed to refuse it with a ticket and to judge it again later. */
interface DeferredCall {
  readonly session: SessionLike
  readonly caller: Caller
  readonly view: ProjectView
  /** The project root, and a working directory to read it by. */
  readonly root: string
  readonly cwd: string
  /** The native tool name and its arguments. */
  readonly tool: string
  readonly args: unknown
  readonly described: DescribedCall
  readonly events: readonly RulesEventRecord[]
  /** Why each field of the caller that a rule may ask about is not known, as the judgement of the call had it. */
  readonly unreadable: NonNullable<JudgeParts['unreadable']>
  /** The call is one of a `run_code` program. */
  readonly nested: boolean
  /** The rules of the person that defer it. */
  readonly rules: ReadonlyArray<{ readonly hit: RuleHit, readonly rule: Rule | BuiltinRule }>
  readonly peak: PeakSetting & { readonly until?: string }
}

/** What the gate does with a queued call: refuse it (with the ticket, when one was opened), or let it through because the person let it. */
type Deferral = { readonly kind: 'deny', readonly reason: string, readonly ticket?: string } | { readonly kind: 'let' }

/** A call the gate let run, for the tickets that wait for it. */
type PassedCall = Pick<DeferredCall, 'session' | 'view' | 'root' | 'cwd' | 'tool' | 'args'>

export interface TicketDesk {
  /** A call a rule queues: refuse it with a ticket, or let it through when the person let it. Never throws. */
  defer(call: DeferredCall): Promise<Deferral>
  /** A call that ran: the cleared ticket it answers is done. Never throws. */
  passed(call: PassedCall): Promise<void>
  /** The 5-second period: judge this host's tickets again. Never throws. */
  reconcile(): Promise<void>
  /** A session ended: its tickets go to the agent that dispatched it, or are cancelled. Never throws. */
  ended(session: SessionLike): Promise<void>
  /** An agent appeared on this host: the stop tickets of its session that a host that is gone left are taken over, and judged now. Never throws. */
  adopt(agent: { readonly id: string, readonly session?: SessionLike }): Promise<void>
  /** The same for every agent that is live when the row starts. Never throws. */
  adoptLive(): Promise<void>
  /**
   * The row is going: resume the goal of every stop ticket of this host that
   * has one paused. The resumes are made before this returns; the returned
   * promise ends when they are written down, or after two seconds. Undefined
   * when there was nothing to resume. Never throws.
   */
  release(): Promise<void> | undefined
  stop(): void
}

export interface DeskDeps {
  readonly ctx: ServiceLookup
  readonly rulesDir: string | undefined
  readonly now: () => number
  readonly io: StoreIo | undefined
  readonly host: HostRef
  /** The project of a working directory, as the row reads it; it throws when the files cannot be read. */
  readonly project: (cwd: string) => ProjectView | undefined
  readonly peak: () => PeakReading
  readonly health: RowHealth
  readonly heartbeat: HeartbeatWriter
  /** Told what went wrong; the caller says it once. */
  readonly warn: (message: string) => void
}

/** Who has a ticket now: the session, and for a subagent the session that started it. */
interface Holder {
  readonly sessionId: string
  readonly origin: 'subagent' | undefined
  readonly parentSession: string | undefined
}

/** What this host keeps of a ticket in memory only: the call as it was judged, to judge it again, and who has it. A ticket this process did not open has none and is not judged again. */
interface Held {
  readonly root: string
  readonly cwd: string
  events: readonly RulesEventRecord[]
  unreadable: NonNullable<JudgeParts['unreadable']>
  holder: Holder
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 80)
const isOpen = (ticket: Ticket): boolean => ticket.state === 'deferred' || ticket.state === 'cleared'
/** What the board calls an agent: its session id, cut to the last 8 characters when it is a long one (a UUID, or a prefix and a UUID, whose head says nothing). There is no task name to use until the graph can tell which node a subagent works on. */
const labelOf = (sessionId: string): string => (sessionId.length <= 12 ? sessionId : sessionId.slice(-8))
const holderOf = (session: SessionLike): Holder => ({ sessionId: session.id, origin: session.header.origin, parentSession: session.header.parentSession })

/** The first 12 hex digits of the SHA-256 of the native tool name and the arguments in their canonical form: the same call asks the same question (design §6.2 step 6). */
function signatureOf(tool: string, args: unknown): string {
  return createHash('sha256').update(`${tool}\n${canonicalJson(args ?? null)}`).digest('hex').slice(0, 12)
}

/** What a ticket says the call was: the shell text, the file written, else the arguments. */
function summaryOf(call: DeferredCall): string {
  if (call.described.command !== undefined) return call.described.command
  const target = call.described.writes?.[0]
  if (target !== undefined) return target
  try {
    return JSON.stringify(call.args) ?? ''
  }
  catch {
    return ''
  }
}

/** The tickets of this host for the row: opened here, judged here, told about here. */
export function createTicketDesk(deps: DeskDeps): TicketDesk {
  const held = new Map<string, Held>()
  const boards = new Map<string, RulesBoard>()
  /** Tickets this process has told the agent about for the late heartbeat of this host. */
  const told = new Set<string>()
  let stopped = false
  let running = false
  /** The calls of the gate go one after the other: two calls of one signature at once (parallel tool calls) must not both open a ticket. */
  let gateWork: Promise<unknown> = Promise.resolve()
  const inTurn = <Result>(work: () => Promise<Result>): Promise<Result> => {
    const next = gateWork.then(work, work)
    gateWork = next.catch(() => undefined)
    return next
  }

  const report = (sessionId: string | undefined, why: string): void => {
    deps.warn(why)
    deps.health.report(sessionId, 'degraded', why)
  }
  const sameHost = (host: HostRef): boolean => host.pid === deps.host.pid && host.startedAt === deps.host.startedAt

  function boardOf(root: string): RulesBoard {
    let board = boards.get(root)
    if (board === undefined) {
      board = openRulesBoard({ projectRoot: root, ...(deps.rulesDir === undefined ? {} : { rulesDir: deps.rulesDir }), ...(deps.io === undefined ? {} : { io: deps.io }) })
      boards.set(root, board)
    }
    return board
  }
  const write = (root: string, request: Record<string, unknown>): ReturnType<RulesBoard['apply']> => boardOf(root).apply('harness', request)

  /** Change a ticket; false when the board did not take it (the reason is reported unless the ticket was closed by someone in the meantime). */
  async function update(root: string, ticket: Ticket, change: Record<string, unknown>, reason: string): Promise<Ticket | undefined> {
    const result = await write(root, { op: 'ticket-update', id: ticket.id, ...change, reason })
    if (result.ok) return result.state.tickets?.[ticket.id]
    if (result.error.code !== 'conflict') report(ticket.sessionId, `等待单 ${ticket.id} 没能改：${result.error.message}`)
    return undefined
  }
  const close = (root: string, ticket: Ticket, reason: string): Promise<Ticket | undefined> => update(root, ticket, { state: 'done' }, reason)
  const cancel = (root: string, ticket: Ticket, reason: string): Promise<Ticket | undefined> => update(root, ticket, { state: 'cancelled' }, reason)

  // ------------------------------------------------------------ the registry

  /** The live agent of a session; undefined when it is not live, `unknown` when the registry cannot be asked (the reason is reported). */
  function liveAgent(sessionId: string): MessageableAgentLike | undefined | 'unknown' {
    const agents = agentsOf(deps.ctx)
    if (agents === undefined) {
      report(sessionId, '宿主没有 agents 服务，等待单的会话什么时候结束看不到，唤醒也发不出')
      return 'unknown'
    }
    try {
      return agents.get(sessionId)
    }
    catch (error) {
      report(sessionId, `读不出宿主的 agents 登记（${message(error)}），等待单的会话什么时候结束暂时看不到`)
      return 'unknown'
    }
  }

  /** The agent that dispatched the work: the first live agent up the chain of parents that is not a subagent. Undefined when there is none, `unknown` when the registry cannot be asked. */
  function dispatchRoot(parentSession: string | undefined): MessageableAgentLike | undefined | 'unknown' {
    const seen = new Set<string>()
    for (let id = parentSession; id !== undefined && !seen.has(id);) {
      seen.add(id)
      const agent = liveAgent(id)
      if (agent === 'unknown' || agent === undefined || agent.session.header.origin !== 'subagent') return agent
      id = agent.session.header.parentSession
    }
    return undefined
  }

  // ----------------------------------------------------------- the judgement

  /** Judge a held call again against the state as it is now: the rules of the person that still defer it, and why it stopped waiting if none does. */
  function rejudge(state: ProjectState, ticket: Ticket, hold: Held): { readonly queued: readonly string[], readonly because: string } {
    const now = new Date(deps.now())
    const { readings } = clockReadings(state, deps.peak(), now)
    const table = tableOf(state, effectivePeakMode(state).level)
    const verdict = judge(judgeInput({ now, project: hold.root, events: hold.events, signals: [...readings.values()], unreadable: hold.unreadable }), table)
    const queued = verdict.effect === 'queue' ? verdict.strongest.map(hit => hit.rule) : []
    const blocking = verdict.effect === 'block' ? verdict.strongest.map(hit => hit.rule) : []
    return { queued, because: clearedBecause(ticket, state, readings, now, blocking) }
  }

  // --------------------------------------------------------------- the gate

  const letHolds = (ticket: Ticket): boolean => ticket.letOnceUntil !== undefined && Date.parse(ticket.letOnceUntil) > deps.now()

  /** A subagent making a call a subagent of the same root was deferred on, and that went to the root when the subagent ended: it takes the ticket over instead of opening another. */
  async function takeOver(call: DeferredCall, signature: string, open: readonly Ticket[]): Promise<Ticket | undefined> {
    const root = dispatchRoot(call.session.header.parentSession)
    if (root === 'unknown' || root === undefined) return undefined
    const orphan = open.find(ticket => ticket.state === 'deferred' && ticket.signature === signature && ticket.sessionId === root.id && ticket.handedFrom !== undefined && sameHost(ticket.host))
    if (orphan === undefined) return undefined
    const moved = await write(call.root, { op: 'ticket-handover', id: orphan.id, sessionId: call.session.id, agentLabel: labelOf(call.session.id), reason: `新的子 agent ${labelOf(call.session.id)} 做了同一个调用，等待单 ${orphan.id} 交给它` })
    if (!moved.ok) {
      report(call.session.id, `等待单 ${orphan.id} 没能交给新的子 agent：${moved.error.message}`)
      return orphan
    }
    const hold = held.get(orphan.id)
    if (hold !== undefined) {
      hold.holder = holderOf(call.session)
      hold.events = call.events
      hold.unreadable = call.unreadable
    }
    return moved.state.tickets?.[orphan.id] ?? orphan
  }

  // ------------------------------------------------------------- the goals

  /** The live agent of a session, when the registry can be asked and has it. */
  function liveOrNone(sessionId: string): MessageableAgentLike | undefined {
    const agent = liveAgent(sessionId)
    return agent === 'unknown' ? undefined : agent
  }

  /** Pause the active goal of the subagent a stop ticket holds; the refusal of the host is reported, since the goal then keeps starting rounds that are refused. */
  function pauseOf(sessionId: string): Pause {
    const agent = liveOrNone(sessionId)
    const paused = agent === undefined ? { kind: 'none' as const } : pauseGoal(deps.ctx, agent)
    if (paused.kind === 'failed') report(sessionId, `高峰不做：goal 没暂停（${paused.why}），每一轮仍会花一步`)
    return paused
  }

  /** Resume the goal a stop ticket paused; a refusal is reported with what the person can do. */
  function resumeOf(sessionId: string, paused: NonNullable<Ticket['pausedGoal']>): Resume {
    const resumed = resumeGoal(deps.ctx, liveOrNone(sessionId), paused)
    if (resumed.kind === 'failed') report(sessionId, `高峰不做：goal 没能恢复（${resumed.why}），要在目标条上或用 /goal resume 恢复`)
    return resumed
  }

  /** A pause that was made and could not be written down: put the goal back, since nothing would. */
  function undoPause(sessionId: string, paused: Pause): void {
    if (paused.kind === 'paused') resumeOf(sessionId, paused.goal)
  }

  const goalWord = (ticket: Pick<Ticket, 'pausedGoal' | 'pauseFailed'>): DenialInput['goal'] => (ticket.pausedGoal !== undefined ? 'paused' : ticket.pauseFailed !== undefined ? 'not-paused' : undefined)
  const pauseFields = (paused: Pause): { readonly pausedGoal?: NonNullable<Ticket['pausedGoal']>, readonly pauseFailed?: string } => (paused.kind === 'paused' ? { pausedGoal: paused.goal } : paused.kind === 'failed' ? { pauseFailed: paused.why } : {})

  /** A stop ticket that has no goal paused and has not tried yet (the goal came after the first call): try now. */
  async function pauseLate(call: DeferredCall, ticket: Ticket): Promise<Ticket> {
    if (ticket.pausedGoal !== undefined || ticket.pauseFailed !== undefined) return ticket
    const paused = pauseOf(call.session.id)
    if (paused.kind === 'none') return ticket
    const updated = await update(call.root, ticket, pauseFields(paused), `等待单 ${ticket.id} 的会话有了 goal，已暂停`)
    if (updated === undefined) undoPause(call.session.id, paused)
    return updated ?? ticket
  }

  async function defer(call: DeferredCall): Promise<Deferral> {
    const sessionId = call.session.id
    await deps.heartbeat.join(sessionId, call.cwd)
    // The view the gate judged on may be older than the call before this one in the queue.
    const state = (readView(call.cwd) ?? call.view).read.state
    // An entry that holds a whole session is one wait for every call of it.
    const perSession = call.rules.find(entry => entry.hit.ticketPerSession === true)
    const signature = perSession === undefined ? signatureOf(call.tool, call.args) : `any:${perSession.rule.id}`
    const stopping = signature === PEAK_STOP_SIGNATURE
    const text = (ticket: string | undefined, unrecorded = false, goal?: DenialInput['goal']): string => denialText({
      attempt: call.described.attempt,
      effect: 'queue',
      rules: call.rules,
      ...(ticket === undefined ? {} : { ticket }),
      ...(unrecorded ? { unrecorded: true as const } : {}),
      ...(call.nested ? { nested: true as const } : {}),
      ...(call.session.header.origin === 'subagent' ? { subagent: true as const } : {}),
      ...(goal === undefined ? {} : { goal }),
      peak: call.peak,
    })
    // A ticket of another host (one that is gone, and not yet expired by a write) is nobody's to reuse here.
    const open = openTickets(state).filter(ticket => sameHost(ticket.host))
    let mine = open.filter(ticket => ticket.sessionId === sessionId)
    let ticket = mine.find(item => item.signature === signature)
    if (ticket?.state === 'cleared') {
      // The agent came back, and the rule holds again: that ticket is answered, and this call is a new wait.
      await close(call.root, ticket, `等待单 ${ticket.id} 的 agent 回来重试，规则又成立了：这张单结束，另开新单`)
      mine = mine.filter(item => item.id !== ticket?.id)
      ticket = undefined
    }
    if (ticket === undefined && call.session.header.origin === 'subagent') ticket = await takeOver(call, signature, open)
    if (ticket !== undefined) {
      if (!letHolds(ticket)) {
        if (stopping) ticket = await pauseLate(call, ticket)
        return { kind: 'deny', reason: text(ticket.id, false, goalWord(ticket)), ticket: ticket.id }
      }
      // The person let the session work through this peak: its ticket stays until the let ends, the calls pass meanwhile.
      if (!stopping) await close(call.root, ticket, `人放行的等待单 ${ticket.id} 用掉了`)
      return { kind: 'let' }
    }
    if (mine.length >= MAX_OPEN) return { kind: 'deny', reason: ticketLimitText(call.described.attempt, mine.map(item => item.id)) }
    // The goal is paused before the ticket is written, so that the record has the revision the pause made; a ticket that cannot be written puts the goal back.
    const paused: Pause = stopping ? pauseOf(sessionId) : { kind: 'none' }
    const opened = await write(call.root, {
      op: 'ticket-open',
      sessionId,
      agentLabel: labelOf(sessionId),
      host: { pid: deps.host.pid, startedAt: deps.host.startedAt },
      signature,
      tool: call.tool,
      summary: summaryOf(call),
      rules: call.rules.map(entry => entry.rule.id),
      ...(call.nested ? { nested: true } : {}),
      ...pauseFields(paused),
    })
    if (!opened.ok || opened.target === undefined) {
      undoPause(sessionId, paused)
      report(sessionId, `等待单没记下：${opened.ok ? '没有拿到单号' : opened.error.message}。这次调用照样拒绝，agent 要等规则不再成立后自己重试`)
      return { kind: 'deny', reason: text(undefined, true) }
    }
    held.set(opened.target, { root: call.root, cwd: call.cwd, events: call.events, unreadable: call.unreadable, holder: holderOf(call.session) })
    return { kind: 'deny', reason: text(opened.target, false, goalWord(pauseFields(paused))), ticket: opened.target }
  }

  async function passed(call: PassedCall): Promise<void> {
    const state = (readView(call.cwd) ?? call.view).read.state
    if (state.tickets === undefined) return
    const cleared = openTickets(state).filter(ticket => ticket.state === 'cleared' && sameHost(ticket.host))
    if (cleared.length === 0) return
    const signature = signatureOf(call.tool, call.args)
    // A subagent also answers what its predecessor was deferred on, which went to the agent that dispatched it.
    const root = call.session.header.origin === 'subagent' ? dispatchRoot(call.session.header.parentSession) : undefined
    for (const ticket of cleared) {
      if (ticket.signature !== signature) continue
      const answered = ticket.sessionId === call.session.id || (typeof root === 'object' && ticket.sessionId === root.id && ticket.handedFrom !== undefined)
      if (answered) await close(call.root, ticket, `等待单 ${ticket.id} 等的调用又做了，单结束`)
    }
  }

  // ------------------------------------------------------------ the wake-up

  /** The ticket moves to the agent that dispatched the subagent; undefined when the board did not take it. */
  async function handOver(root: string, ticket: Ticket, hold: Held, target: MessageableAgentLike, reason: string): Promise<Ticket | undefined> {
    const moved = await write(root, { op: 'ticket-handover', id: ticket.id, sessionId: target.id, agentLabel: labelOf(target.id), reason })
    if (!moved.ok) {
      report(ticket.sessionId, `等待单 ${ticket.id} 没能转给派发它的 agent：${moved.error.message}`)
      return undefined
    }
    hold.holder = holderOf(target.session)
    return moved.state.tickets?.[ticket.id]
  }

  /** The agent that held the ticket cannot be reached: a subagent's ticket goes to the agent that dispatched it and it is told there; any other is cancelled. */
  async function unreachable(root: string, ticket: Ticket, hold: Held, because: string, cause: string): Promise<void> {
    if (hold.holder.origin === 'subagent') {
      const target = dispatchRoot(hold.holder.parentSession)
      if (target === 'unknown') return
      const label = labelOf(hold.holder.sessionId)
      const moved = target === undefined ? undefined : await handOver(root, ticket, hold, target, `子 agent ${label} 收不到唤醒（${cause}），等待单 ${ticket.id} 转给派发它的 agent`)
      if (moved !== undefined) {
        await tell(root, moved, hold, because)
        return
      }
    }
    await cancel(root, ticket, `唤醒发不出（${cause}），等待单 ${ticket.id} 取消`)
  }

  /** Tell the agent that holds the ticket that it cleared. A message that cannot be sent is the agent's loss. */
  async function tell(root: string, ticket: Ticket, hold: Held, because: string): Promise<void> {
    const handedOver = ticket.handedFrom !== undefined && hold.holder.origin !== 'subagent'
    const sent = deliver(deps.ctx, hold.holder.sessionId, wakeNotice(ticket, wakeText(ticket, because, handedOver)))
    if (sent.kind === 'sent') return
    if (sent.kind === 'unavailable') {
      report(hold.holder.sessionId, '宿主没有 agents 服务，等待单的会话什么时候结束看不到，唤醒也发不出')
      return
    }
    if (sent.kind === 'failed') report(hold.holder.sessionId, `唤醒发不出（${sent.why}）`)
    await unreachable(root, ticket, hold, because, sent.kind === 'gone' ? 'agent 已释放' : sent.why)
  }

  /** The session that holds a ticket has ended; `via` is how the host found out, which the record keeps. */
  async function holderGone(state: ProjectState, ticket: Ticket, hold: Held, via: 'event' | 'registry'): Promise<void> {
    const { root } = hold
    const how = via === 'event' ? '（会话结束的事件）' : '（宿主的登记里已经找不到它）'
    if (hold.holder.origin !== 'subagent') {
      await cancel(root, ticket, `会话 ${hold.holder.sessionId} 已结束，人关掉了会话，不再替它排队${how}`)
      return
    }
    const target = dispatchRoot(hold.holder.parentSession)
    if (target === 'unknown') return
    const label = labelOf(hold.holder.sessionId)
    if (target === undefined) {
      await cancel(root, ticket, `子 agent ${label} 已结束，派发它的 agent 也不在${how}`)
      return
    }
    const moved = await handOver(root, ticket, hold, target, `子 agent ${label} 已结束，等待单 ${ticket.id} 转给派发它的 agent${how}`)
    // A ticket that had cleared was told to the subagent, which never ran the call: the agent that dispatched it is told now.
    if (moved?.state === 'cleared') await tell(root, moved, hold, rejudge(state, moved, hold).because)
  }

  // ------------------------------------------------------------ the 5 seconds

  /** Why a ticket of this host has run out of time by this host's clock, if it has. */
  function runOut(ticket: Ticket): NonNullable<Ticket['expiredWhy']> | undefined {
    const now = deps.now()
    if (ticket.state === 'cleared' && now - Date.parse(ticket.clearedAt ?? ticket.since) >= NOT_RETRIED_MS) return 'not-retried'
    return now - Date.parse(ticket.since) >= DAY_MS ? 'age' : undefined
  }

  /** The stop ticket's goal is resumed the moment the person lets the session work; the ticket stays, and says the board is done with the goal. Returns the ticket as it is after. */
  async function resumeForLet(ticket: Ticket, hold: Held): Promise<Ticket> {
    if (ticket.pausedGoal === undefined || ticket.resumedAt !== undefined) return ticket
    const resumed = resumeOf(ticket.sessionId, ticket.pausedGoal)
    if (resumed.kind !== 'resumed' && resumed.kind !== 'changed') return ticket
    return await update(hold.root, ticket, { resumed: true }, `人放行了等待单 ${ticket.id}，goal 已恢复`) ?? ticket
  }

  /**
   * A stop ticket ends: the peak is over, or the person changed the level.
   * The goal is resumed first (only if it is still the one the board paused),
   * then the ticket is done, then the subagent is told to carry on. A session
   * the person let work through the peak is told nothing: it has been working.
   * A goal that cannot be resumed is the person's to resume, and the wake says so.
   */
  async function releaseStop(ticket: Ticket, hold: Held, because: string): Promise<void> {
    const letting = letHolds(ticket)
    const goal: Resume = ticket.pausedGoal !== undefined && ticket.resumedAt === undefined ? resumeOf(ticket.sessionId, ticket.pausedGoal) : { kind: 'none' }
    const stamp = goal.kind === 'resumed' || goal.kind === 'changed'
    const closed = await update(hold.root, ticket, { state: 'done', ...(stamp ? { resumed: true as const } : {}) }, `等待单 ${ticket.id} 的高峰不做结束了（高峰过去或档位改了）${goal.kind === 'resumed' ? '，goal 已恢复' : ''}`)
    if (closed === undefined || letting) return
    const handedOver = ticket.handedFrom !== undefined && hold.holder.origin !== 'subagent'
    const sent = deliver(deps.ctx, hold.holder.sessionId, wakeNotice(ticket, stopWakeText(ticket, because, handedOver, goal)))
    if (sent.kind === 'failed') report(hold.holder.sessionId, `唤醒发不出（${sent.why}）`)
    else if (sent.kind === 'unavailable') report(hold.holder.sessionId, '宿主没有 agents 服务，等待单的会话什么时候结束看不到，唤醒也发不出')
  }

  async function reconcileOpen(state: ProjectState, ticket: Ticket, hold: Held): Promise<void> {
    if (liveAgent(hold.holder.sessionId) === undefined) {
      await holderGone(state, ticket, hold, 'registry')
      return
    }
    const why = runOut(ticket)
    if (why !== undefined) {
      await update(hold.root, ticket, { state: 'expired', expiredWhy: why }, why === 'age' ? `等待单 ${ticket.id} 开了一天还没解除，过期` : `等待单 ${ticket.id} 已解除，agent 30 分钟没回来，过期`)
      return
    }
    if (ticket.state !== 'deferred') return
    const stopping = isStopTicket(ticket)
    let current = ticket
    if (stopping && current.letOnceUntil !== undefined) {
      if (!letHolds(current)) {
        await close(hold.root, current, `人放行的时间到了，等待单 ${current.id} 结束`)
        return
      }
      current = await resumeForLet(current, hold)
    }
    const judged = rejudge(state, current, hold)
    if (judged.queued.length > 0) {
      if (judged.queued.join() !== current.rules.join()) await update(hold.root, current, { rules: judged.queued }, `等待单 ${current.id} 现在是规则 ${judged.queued.join('、')} 挡着`)
      return
    }
    if (stopping) {
      await releaseStop(current, hold, judged.because)
      return
    }
    const cleared = await update(hold.root, current, { state: 'cleared' }, `等待单 ${current.id} 的规则不再挡住这次调用，已解除`)
    if (cleared !== undefined) await tell(hold.root, cleared, hold, judged.because)
  }

  /** A ticket of this host that other hosts' writes expired because its heartbeat was late, while the host and the session are alive: tell the agent once. */
  function tellExpired(ticket: Ticket): void {
    if (told.has(ticket.id)) return
    const agent = liveAgent(ticket.sessionId)
    if (agent === undefined || agent === 'unknown') return
    told.add(ticket.id)
    const sent = deliver(deps.ctx, ticket.sessionId, wakeNotice(ticket, heartbeatLostText(ticket)))
    if (sent.kind === 'failed') deps.warn(`the agent of expired ticket ${ticket.id} could not be told: ${sent.why}`)
    report(ticket.sessionId, `等待单 ${ticket.id} 因本宿主心跳超时被过期，规则可能仍然成立；agent 再调用会重新排队`)
  }

  function readView(cwd: string): ProjectView | undefined {
    try {
      return deps.project(cwd)
    }
    catch (error) {
      report(undefined, `读规则板的状态失败（重判等待单）：${message(error)}`)
      return undefined
    }
  }

  async function reconcileProject(root: string, cwd: string): Promise<void> {
    const view = readView(cwd)
    if (view === undefined) return
    const { state } = view.read
    const own = Object.values(state.tickets ?? {}).filter(ticket => sameHost(ticket.host)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    /** Sessions whose stop ticket was expired under this live host while its goal is still paused. */
    const stranded = new Set<string>()
    for (const ticket of own) {
      const hold = held.get(ticket.id)
      if (isOpen(ticket)) {
        if (hold !== undefined) await reconcileOpen(state, ticket, hold)
      }
      else {
        held.delete(ticket.id)
        if (isStopTicket(ticket) && lost(ticket) && ticket.pausedGoal !== undefined) stranded.add(ticket.sessionId)
        else if (ticket.state === 'expired' && ticket.expiredWhy === 'host-gone') tellExpired(ticket)
      }
    }
    // A late heartbeat expired the ticket that holds a paused goal: nobody would resume it. This host takes it back, as after a restart, once its heartbeat is fresh again.
    if (stranded.size > 0) await deps.heartbeat.beat()
    for (const sessionId of stranded) {
      const agent = liveOrNone(sessionId)
      if (agent !== undefined) await adopt(agent)
    }
    for (const [id, hold] of held) {
      if (hold.root === root && (state.tickets === undefined || !Object.hasOwn(state.tickets, id))) held.delete(id)
    }
  }

  async function reconcile(): Promise<void> {
    if (stopped || running) return
    running = true
    try {
      const projects = new Map(deps.heartbeat.live().map(entry => [entry.root, entry.cwd] as const))
      for (const hold of held.values()) if (!projects.has(hold.root)) projects.set(hold.root, hold.cwd)
      for (const [root, cwd] of projects) await reconcileProject(root, cwd)
    }
    catch (error) {
      report(undefined, `重判等待单出错：${message(error)}`)
    }
    finally {
      running = false
    }
  }

  async function ended(session: SessionLike): Promise<void> {
    if (stopped) return
    try {
      for (const [id, hold] of [...held]) {
        if (hold.holder.sessionId !== session.id) continue
        const view = readView(hold.cwd)
        if (view === undefined) continue
        const { tickets } = view.read.state
        const ticket = tickets !== undefined && Object.hasOwn(tickets, id) ? tickets[id] : undefined
        if (ticket === undefined || !isOpen(ticket)) held.delete(id)
        else await holderGone(view.read.state, ticket, hold, 'event')
      }
    }
    catch (error) {
      report(session.id, `等待单随会话结束的处理出错：${message(error)}`)
    }
  }

  // --------------------------------------------- a host that is new, a row that goes

  /** The stop ticket a host that is gone left, which nobody judges and whose goal may still be paused. */
  const lost = (ticket: Ticket): boolean => ticket.state === 'expired' && ticket.expiredWhy === 'host-gone' && ticket.resumedAt === undefined

  /** What a stop ticket this process did not open is judged against: a tool call of a subagent on the model its session is on, else a GLM model, which is what the entry that holds it asks for. */
  function standIn(root: string, cwd: string, ticket: Ticket, session: SessionLike): Pick<Held, 'events' | 'unreadable'> {
    const route = session.header.origin === 'subagent' ? sessionRoute(session) : undefined
    const model = (route === undefined ? undefined : modelId(route)) ?? HELD_MODEL
    return { events: gateEvents({ at: new Date(deps.now()).toISOString(), project: root, cwd, tool: ticket.tool, role: 'subagent', model, session: ticket.handedFrom?.sessionId ?? ticket.sessionId }), unreadable: {} }
  }

  async function adopt(agent: { readonly id: string, readonly session?: SessionLike }): Promise<void> {
    if (stopped) return
    try {
      const session = agent.session
      const cwd = session?.header.cwd
      const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
      if (session === undefined || cwd === undefined || project === undefined) return
      const view = readView(cwd)
      if (view === undefined) return
      const theirs = Object.values(view.read.state.tickets ?? {}).filter(ticket => isStopTicket(ticket) && ticket.sessionId === agent.id && (isOpen(ticket) || lost(ticket)) && !held.has(ticket.id))
      if (theirs.length === 0) return
      // A host owns a ticket only while its heartbeat says it is there.
      await deps.heartbeat.join(agent.id, cwd)
      for (const ticket of theirs) {
        if (!sameHost(ticket.host) || lost(ticket)) {
          const taken = await write(project.root, { op: 'ticket-adopt', id: ticket.id, host: { pid: deps.host.pid, startedAt: deps.host.startedAt }, reason: `宿主 ${deps.host.pid} 接手了等待单 ${ticket.id}：它的会话 ${agent.id} 出现在了这台宿主上` })
          if (!taken.ok) {
            report(agent.id, `等待单 ${ticket.id} 没能接手：${taken.error.message}`)
            continue
          }
        }
        held.set(ticket.id, { root: project.root, cwd, ...standIn(project.root, cwd, ticket, session), holder: holderOf(session) })
      }
      // Taken over, it is judged now: a peak that ended while the host was away ends the ticket at once.
      await reconcile()
    }
    catch (error) {
      report(agent.id, `接手等待单出错：${message(error)}`)
    }
  }

  async function adoptLive(): Promise<void> {
    if (stopped) return
    const agents = agentsOf(deps.ctx)
    if (agents === undefined || typeof agents.list !== 'function') return
    try {
      for (const agent of agents.list()) await adopt(agent)
    }
    catch (error) {
      report(undefined, `接手本宿主上已有会话的等待单出错：${message(error)}`)
    }
  }

  /** A promise that ends when the work does or after `ms`, whichever is first. The work never rejects. */
  function within(work: Promise<void>, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      timer.unref()
      void work.then(() => { clearTimeout(timer); resolve() })
    })
  }

  function release(): Promise<void> | undefined {
    if (stopped) return undefined
    const resumed: Array<{ readonly root: string, readonly ticket: Ticket }> = []
    try {
      const projects = new Map(deps.heartbeat.live().map(entry => [entry.root, entry.cwd] as const))
      for (const hold of held.values()) if (!projects.has(hold.root)) projects.set(hold.root, hold.cwd)
      for (const [root, cwd] of projects) {
        for (const ticket of Object.values(readView(cwd)?.read.state.tickets ?? {})) {
          if (!sameHost(ticket.host) || !isStopTicket(ticket) || !isOpen(ticket) || ticket.pausedGoal === undefined || ticket.resumedAt !== undefined) continue
          const goal = resumeOf(ticket.sessionId, ticket.pausedGoal)
          if (goal.kind === 'resumed' || goal.kind === 'changed') resumed.push({ root, ticket })
        }
      }
    }
    catch (error) {
      deps.warn(`the goals of the stop tickets were not all put right on the way out: ${message(error)}`)
    }
    if (resumed.length === 0) return undefined
    // The goals are resumed above, in one go; writing it down needs the board's lock, which may be someone else's for a while.
    const written = (async (): Promise<void> => {
      for (const { root, ticket } of resumed) {
        const result = await write(root, { op: 'ticket-update', id: ticket.id, resumed: true, reason: '规则行卸载，goal 已恢复' })
        if (!result.ok) deps.warn(`the goal of ticket ${ticket.id} was resumed on the way out and could not be written down: ${result.error.message}`)
      }
    })().catch((error: unknown) => { deps.warn(`the goals resumed on the way out were not written down: ${message(error)}`) })
    return within(written, UNLOAD_MS)
  }

  /** Every entry point turns a throw into a report: the gate, the timer and the event listener never see one. */
  const safe = <Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>, fallback: (error: unknown, ...args: Args) => Result) => async (...args: Args): Promise<Result> => {
    try {
      return await run(...args)
    }
    catch (error) {
      return fallback(error, ...args)
    }
  }

  return {
    defer: call => inTurn(() => safe(defer, (error, deferred) => {
      report(deferred.session.id, `等待单没记下：${message(error)}。这次调用照样拒绝，agent 要等规则不再成立后自己重试`)
      return { kind: 'deny' as const, reason: denialText({ attempt: deferred.described.attempt, effect: 'queue', rules: deferred.rules, unrecorded: true, peak: deferred.peak }) }
    })(call)),
    passed: call => inTurn(() => safe(passed, (error, answered) => { report(answered.session.id, `等待单随调用放行的处理出错：${message(error)}`) })(call)),
    reconcile,
    ended,
    adopt,
    adoptLive,
    release,
    stop() {
      stopped = true
      held.clear()
      boards.clear()
    },
  }
}
