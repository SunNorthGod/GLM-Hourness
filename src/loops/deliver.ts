/**
 * Telling the main agent (docs/ORCHESTRATION.md §18.10; loop board design 0.6
 * §6.4): a message of the board is a synthetic user notice with the board's own
 * source, so the model reads it as a reminder of the harness and not as
 * something the person said (an unsourced `followup` or `steer` counts as the
 * person's word, tool-goal:44–52, and the board must not be able to authorize
 * anything that way). Several messages for one session inside two seconds
 * travel as one, each part under its own first line.
 *
 * Who gets it, and how (design §6.4, the same wake table as the rules board's):
 *
 * - the holder state decides whether anybody can be told at all. `ok`, and
 *   `unknown` when only the archive set could not be read, deliver; every other
 *   state holds the message with the reason, at most 50 for a project and at
 *   most 24 hours, and the page says which state it is waiting on;
 * - a live agent is steered while it is running, injected while it is idle with
 *   a goal in the active phase (a followup would count as competing input and
 *   void the goal driver's reservation, goal-round-driver:249) and followed up
 *   otherwise. A message that does not wake the session is always injected;
 * - a cold session is revived through `sessionController.resolveAgent`, the
 *   same call the host's own schedule delivery makes (schedule:1576), and only
 *   for a message that wakes. Its two expected errors are not failures:
 *   `session/not-found` makes the holder state `not-found` until the person
 *   names a new main agent, and `session/writer-held` means another DSH process
 *   has the session open, so the message waits for the run lock to go there
 *   (api-session-controller:237, 243);
 * - the delivery is made inside `agents.withoutInitiator`, as the host's is
 *   (agent:414; schedule:1531), and is only done once `sessions.flush` says the
 *   session took it (session:1950). A flush that says no, or a host call that
 *   throws, is retried after 1, 5 and 15 minutes, reading the holder state
 *   again each time, before the run is a failure.
 *
 * The result of a run of an entry whose answer goes to the session the event
 * came from is injected into that session when it is live here, and otherwise
 * goes to the main agent with a line that says which session it was for.
 */
import { agentsOf, wayTo as wakeWay } from '../rules/wake.ts'
import { createUserNotice, type MessageableAgentLike, type ServiceLookup, type SessionLike, type UserNotice } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { canDeliver, type HolderMemory, type HolderReason, type HolderState } from './holder.ts'
import type { HeldMessage, RuntimeState } from './inbox.ts'

/** One message the board has for the main agent, or for the session an event came from. */
export interface DeliverRequest {
  readonly project: string
  readonly entry: string
  readonly run: string
  readonly title: string
  readonly text: string
  readonly wake: boolean
  /** The session the result goes to, when it is not the main agent's (design §6.4 last paragraph). */
  readonly session?: string
}

/** Why a message waits (design §6.4): the holder state's reason, or one of the ways this process cannot reach the session now. Codes of the run reasons (records.ts). */
type HeldReason = HolderReason | 'session-cold' | 'no-session-controller' | 'row-unloaded'

export type DeliverResult =
  | { readonly kind: 'delivered', readonly how: 'steer' | 'inject' | 'followup', readonly messageId?: string }
  /** Nobody can be told now; the message is kept and told later, with the reason the design names (design §6.4). */
  | { readonly kind: 'held', readonly reason: HeldReason }
  /** The host did not take it; `reason` is the words for the row's health. */
  | { readonly kind: 'failed', readonly reason: string }

export type Deliver = (request: DeliverRequest) => Promise<DeliverResult>

/** The source kind of every message of the board; the execute row's fallback executor uses the same one, so the model cannot tell the two apart and does not need to (design §6.4). */
export const LOOP_NOTICE_SOURCE = 'glm-hourness-loop'

/** How long messages for one main agent are gathered before they travel as one (design §6.4 item 1). */
export const BATCH_MS = 2_000
/** How many messages one project keeps while nobody can be told (design §6.4). */
export const HELD_ROOM = 50
/** How long a message waits before it is dropped (design §6.4). */
export const HELD_MS = 24 * 3_600_000
/** The waits before the second, third and last try of a delivery the host did not acknowledge (design §6.4 item 4). */
export const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000]

export interface DeliverDeps {
  readonly ctx: ServiceLookup
  readonly project: string
  readonly now: () => number
  readonly state: () => RuntimeState
  /** The holder state, read again for every delivery and every retry (design §6.4). */
  readonly holder: () => HolderState
  readonly memory: () => HolderMemory
  readonly report: (text: string, level: 'info' | 'degraded') => void
  /** A timer that runs once; the row's timers never hold the host open. */
  readonly delay: (run: () => void, ms: number) => () => void
  /** Gather messages for this long before sending them as one; 0 sends at once. */
  readonly batchMs?: number
}

export interface LoopDelivery {
  /** Deliver one message, or say that it waits. Never throws. */
  readonly deliver: Deliver
  /** Try the messages that are waiting, oldest first, and drop the ones that waited a day (design §6.4). */
  flush(): Promise<void>
  /** How many messages wait, for the page and the row's health. */
  heldCount(): number
  /** Cancel the gathering timer and the retries; the row is unloading. */
  dispose(): void
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 120)

/** The notice one message travels as; the text is wrapped the way every harness notice of this package is. */
function loopNotice(parts: readonly { readonly entry: string, readonly run: string, readonly title: string, readonly text: string }[]): UserNotice {
  const first = parts[0]
  const body = parts.map(part => `Loop board · ${part.title} (run ${part.run})\n${part.text}`).join('\n\n')
  return createUserNotice(LOOP_NOTICE_SOURCE, parts.length === 1 ? `loop board: ${first.title}` : `loop board: ${parts.length} loops`, wrapSystemReminder(body), {
    hournessLoop: parts.length === 1 ? { entry: first.entry, run: first.run } : { entries: parts.map(part => part.entry), runs: parts.map(part => part.run) },
  })
}

/**
 * The way to reach an agent (design §6.4 item 3): the rules board's wake table,
 * which both boards share, except that a message which does not wake the
 * session is only put before its next step.
 */
export function wayTo(ctx: ServiceLookup, agent: MessageableAgentLike, wake: boolean): 'steer' | 'inject' | 'followup' {
  return wake ? wakeWay(ctx, agent) : 'inject'
}

/** The session controller, when this process has one (design §3.1): only there can a cold session be revived. */
function controllerOf(ctx: ServiceLookup): { resolveAgent(sessionId: string): Promise<{ readonly agent?: unknown, readonly error?: { readonly code: string, readonly message?: string } }> } | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get('sessionController') : undefined
  return typeof (value as { resolveAgent?: unknown } | undefined)?.resolveAgent === 'function' ? value as ReturnType<typeof controllerOf> : undefined
}

/** What a revival came to: the live agent, a reason to wait (neither of the two expected answers is a failure), or a failure. */
export type Revival =
  | { readonly agent: MessageableAgentLike }
  /** `holder-not-found`: the person must name a new main agent. `writer-held`: another DSH process has the session, so the run lock must go there. `no-session-controller`: this process cannot reach a session at all. */
  | { readonly wait: 'holder-not-found' | 'writer-held' | 'no-session-controller' }
  | { readonly failed: string }

/**
 * Revive a cold session through `sessionController.resolveAgent`, the call the
 * host's own schedule delivery makes (schedule:1576; api-session-controller:3037–3039).
 * Its two expected errors are not failures and are remembered, so the holder
 * state reads `not-found` or `elsewhere` afterwards
 * (api-session-controller:237, 243; design §6.4 item 2). Never throws.
 *
 * The delivery and the end of a peak (peak.ts) both revive this way, so the
 * memory and the error codes are read in one place.
 */
export async function reviveSession(ctx: ServiceLookup, session: string, memory: HolderMemory, at: string): Promise<Revival> {
  const controller = controllerOf(ctx)
  if (controller === undefined) return { wait: 'no-session-controller' }
  let answer: { readonly agent?: unknown, readonly error?: { readonly code: string, readonly message?: string } }
  try {
    answer = await controller.resolveAgent(session)
  }
  catch (error) {
    return { failed: message(error) }
  }
  const code = answer.error?.code
  if (code === 'session/not-found') {
    memory.notFound = { session, at }
    return { wait: 'holder-not-found' }
  }
  if (code === 'session/writer-held') {
    memory.writerHeld = { session, at }
    return { wait: 'writer-held' }
  }
  if (code !== undefined) return { failed: `${code}${answer.error?.message === undefined ? '' : `：${answer.error.message}`}` }
  const revived = answer.agent as MessageableAgentLike | undefined
  if (revived === undefined || typeof revived.followup !== 'function') return { failed: 'resolveAgent 没有给出会话的 agent' }
  // A session this process revived is in the registry now; the live agent of the registry is the one the wake table judges.
  return { agent: agentsOf(ctx)?.get(session) ?? revived }
}

/** `agents.withoutInitiator(op)` when the host has it (agent:414), else the operation itself: a message of the board is nobody's turn. */
function withoutInitiator<T>(ctx: ServiceLookup, op: () => T): T {
  const agents: unknown = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  const run = (agents as { withoutInitiator?: unknown } | undefined)?.withoutInitiator
  return typeof run === 'function' ? (run as (body: () => T) => T).call(agents, op) : op()
}

/** Whether the session took the message (session:1950; the host's own delivery checks the same, schedule:1597). A host without the service is taken at its word. */
async function flushed(ctx: ServiceLookup, session: SessionLike): Promise<boolean> {
  const sessions: unknown = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
  const flush = (sessions as { flush?: unknown } | undefined)?.flush
  if (typeof flush !== 'function') return true
  return await (flush as (session: SessionLike) => Promise<boolean>).call(sessions, session) !== false
}

export function createDelivery(deps: DeliverDeps): LoopDelivery {
  const batchMs = deps.batchMs ?? BATCH_MS
  /** The requests gathered for one target, with the promises that wait for them. */
  const batches = new Map<string, { readonly parts: DeliverRequest[], readonly settle: Array<(result: DeliverResult) => void>, cancel: () => void }>()
  const retries = new Set<() => void>()
  let disposed = false

  const iso = (): string => new Date(deps.now()).toISOString()

  /** Put one notice in front of a live agent of this process. */
  function toLive(agent: MessageableAgentLike, notice: UserNotice, wake: boolean): DeliverResult {
    const how = wayTo(deps.ctx, agent, wake)
    try {
      withoutInitiator(deps.ctx, () => { agent[how](notice) })
    }
    catch (error) {
      return { kind: 'failed', reason: message(error) }
    }
    return { kind: 'delivered', how, messageId: notice.id }
  }

  /** The live agent of a session, reviving a cold one when the message wakes it; `held` with the reason when it cannot be reached (design §6.4 item 2). */
  async function reach(session: string, wake: boolean): Promise<{ readonly agent: MessageableAgentLike } | DeliverResult> {
    const live = agentsOf(deps.ctx)?.get(session)
    if (live !== undefined) return { agent: live }
    if (!wake) return { kind: 'held', reason: 'session-cold' }
    const revival = await reviveSession(deps.ctx, session, deps.memory(), iso())
    if ('agent' in revival) return revival
    return 'wait' in revival ? { kind: 'held', reason: revival.wait } : { kind: 'failed', reason: revival.failed }
  }

  /** Where one batch goes: the session of the event when it is live here, else the main agent. */
  async function send(target: string | undefined, parts: readonly DeliverRequest[]): Promise<DeliverResult> {
    const wake = parts.some(part => part.wake)
    const holder = deps.holder()
    if (target !== undefined && target !== holder.session) {
      const live = agentsOf(deps.ctx)?.get(target)
      // A subagent that has stopped is not woken: a finished child has no use for the answer (design §6.4 last paragraph).
      if (live !== undefined && live.status === 'running') return toLive(live, loopNotice(parts), false)
      const forOther = parts.map(part => ({ ...part, text: `${part.text}\nFor session ${target}, which is not running now.` }))
      return await toHolder(forOther, wake)
    }
    return await toHolder(parts, wake)
  }

  async function toHolder(parts: readonly DeliverRequest[], wake: boolean): Promise<DeliverResult> {
    const holder = deps.holder()
    // holderStateOf gives every state that cannot be told its reason; one without is a holder this process cannot read.
    if (!canDeliver(holder)) return { kind: 'held', reason: holder.reason ?? 'holder-unreadable' }
    if (holder.session === undefined) return { kind: 'held', reason: 'no-record' }
    const reached = await reach(holder.session, wake)
    if (!('agent' in reached)) return reached
    const notice = loopNotice(parts)
    const sent = toLive(reached.agent, notice, wake)
    if (sent.kind !== 'delivered') return sent
    try {
      if (!await flushed(deps.ctx, reached.agent.session)) return { kind: 'failed', reason: '会话没有确认收下这条消息' }
    }
    catch (error) {
      return { kind: 'failed', reason: message(error) }
    }
    return sent
  }

  /** Keep a message that nobody can be told now (design §6.4). */
  function hold(request: DeliverRequest, reason: HeldReason): void {
    const state = deps.state()
    const held: HeldMessage = { at: iso(), entry: request.entry, run: request.run, title: request.title, text: request.text, wake: request.wake, reason, ...(request.session === undefined ? {} : { session: request.session }) }
    state.held.push(held)
    while (state.held.length > HELD_ROOM) {
      const dropped = state.held.shift()
      if (dropped !== undefined) deps.report(`存着的消息满了，「${dropped.title}」没能交给主 Agent`, 'info')
    }
  }

  /** One batch is due: send it and answer everybody who is waiting for it. */
  async function run(key: string): Promise<void> {
    const batch = batches.get(key)
    if (batch === undefined) return
    batches.delete(key)
    const target = key === '' ? undefined : key
    let result: DeliverResult
    try {
      result = await send(target, batch.parts)
    }
    catch (error) {
      result = { kind: 'failed', reason: message(error) }
    }
    if (result.kind === 'held') for (const part of batch.parts) hold(part, result.reason)
    if (result.kind === 'failed') retry(target, batch.parts, 0)
    for (const settle of batch.settle) settle(result)
  }

  /**
   * A delivery the host did not acknowledge is tried again after 1, 5 and 15
   * minutes; the holder state is read again each time, so a main agent that
   * moved meanwhile gets it and an archived one holds it.
   */
  function retry(target: string | undefined, parts: readonly DeliverRequest[], attempt: number): void {
    if (disposed || attempt >= RETRY_MS.length) {
      deps.report(`没能把「${parts[0]?.title ?? ''}」交给主 Agent：重试三次都没成`, 'degraded')
      return
    }
    const cancel = deps.delay(() => {
      retries.delete(cancel)
      void (async () => {
        const result = await send(target, parts).catch((error: unknown): DeliverResult => ({ kind: 'failed', reason: message(error) }))
        if (result.kind === 'held') for (const part of parts) hold(part, result.reason)
        else if (result.kind === 'failed') retry(target, parts, attempt + 1)
      })()
    }, RETRY_MS[attempt] ?? 0)
    retries.add(cancel)
  }

  const deliver: Deliver = (request) => {
    if (disposed) return Promise.resolve({ kind: 'held', reason: 'row-unloaded' })
    const key = request.session ?? ''
    const known = batches.get(key)
    if (known !== undefined) {
      known.parts.push(request)
      return new Promise<DeliverResult>((resolve) => { known.settle.push(resolve) })
    }
    const batch: { parts: DeliverRequest[], settle: Array<(result: DeliverResult) => void>, cancel: () => void } = { parts: [request], settle: [], cancel: () => {} }
    batches.set(key, batch)
    const waiting = new Promise<DeliverResult>((resolve) => { batch.settle.push(resolve) })
    if (batchMs <= 0) void run(key)
    else batch.cancel = deps.delay(() => { void run(key) }, batchMs)
    return waiting
  }

  return {
    deliver,
    heldCount: () => deps.state().held.length,
    async flush() {
      const state = deps.state()
      if (state.held.length === 0) return
      const fresh = state.held.filter((held) => {
        // A judgement that waits here is not a message: the runner makes it again and expires it (design §6.9 item 4 row 2).
        if (held.rerun !== undefined) return true
        if (deps.now() - Date.parse(held.at) < HELD_MS) return true
        deps.report(`「${held.title}」存了一天还没交给主 Agent，作废`, 'info')
        return false
      })
      state.held = fresh
      if (!canDeliver(deps.holder())) return
      // Oldest first, and one at a time: a state that turns while the queue runs stops the rest.
      while (canDeliver(deps.holder())) {
        const at = state.held.findIndex(held => held.rerun === undefined)
        if (at < 0) return
        const next = state.held[at]
        const result = await send(next.session, [{ project: deps.project, entry: next.entry, run: next.run, title: next.title, text: next.text, wake: next.wake, ...(next.session === undefined ? {} : { session: next.session }) }])
          .catch((error: unknown): DeliverResult => ({ kind: 'failed', reason: message(error) }))
        if (result.kind === 'held') return
        state.held.splice(at, 1)
        if (result.kind === 'failed') deps.report(`没能把存着的「${next.title}」交给主 Agent：${result.reason}`, 'degraded')
      }
    },
    dispose() {
      disposed = true
      for (const batch of batches.values()) batch.cancel()
      batches.clear()
      for (const cancel of retries) cancel()
      retries.clear()
    },
  }
}
