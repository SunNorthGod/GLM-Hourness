/**
 * Notices that do not wake an agent, put before its next step without going
 * through the agent's inbox (docs/DESIGN.md §6, docs/ORCHESTRATION.md §18.10;
 * .agents/tasks/inject-via-prestep/design.md). rc.3's desktop host counts a
 * loaded agent whose `inbox.nextStep` or `inbox.nextTurn` is not empty as an
 * active task and asks before it quits (apps/desktop-host/src/update-tasks.ts:16–19;
 * rc.3 dsh-desktop-host lib/index.js:101), and a host that shuts down clears
 * the inbox (`outcome: canceled`, agent-loop index.ts:518): an `agent.inject`
 * into an idle session made quitting need a click and was never read.
 *
 * A mailbox keeps the notices of each agent in this process's memory and, in
 * the agent's own `agent/pre-step` listener, puts every one the step does not
 * already carry before the step's messages, where `inject`'s claimed messages
 * stand (inbox.ts `claim`). A notice is delivered once the step appends it to
 * the session log: the agent loop appends each admitted message as
 * `user/message` (agent.ts:456–470) and the session dispatches `session/event`
 * synchronously while it appends (session index.ts:899–906), which the agent
 * scope can listen to as the agent loop itself does (agent.ts:357; rc.3
 * dsh-agent-loop lib/index.js:976). Until then it is offered again at every
 * step: a step cancelled between the pre-step and the append leaves it
 * waiting, a step that already carries it (the goal driver put the step's
 * other messages back into the inbox, goal-round-driver index.ts:135–143)
 * does not get it twice.
 *
 * What waits is lost when the agent is released, the row unloads or the
 * process ends; the state each notice tells about is kept elsewhere (design
 * §3, §4). The listeners are installed on the first post to an agent and go
 * with the agent's scope (agent runtime-types.ts:202–203) or with dispose().
 */
import type { LiveAgentLike, SessionEventLike, UserNotice } from './dsh-min.ts'

/** Where a posted notice went: before the next step, into the inbox (the host has no agent scope to listen on), or nowhere. */
type MailboxPost =
  | { readonly via: 'step' }
  | { readonly via: 'inbox', readonly reason: string }
  | { readonly via: 'none', readonly reason: string }

export interface StepMailbox {
  /** Put a notice before the agent's next step without waking it. Never throws. */
  post(agent: LiveAgentLike, notice: UserNotice): MailboxPost
  /** How many notices of the agent are not in its session yet. */
  pendingCount(agent: LiveAgentLike): number
  /** Unregister every listener this mailbox installed and drop what waits. */
  dispose(): void
}

/** How many notices one agent keeps; the oldest goes first. */
const ROOM = 32

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 160)

const idOf = (message: unknown): unknown => typeof message === 'object' && message !== null ? (message as { readonly id?: unknown }).id : undefined

/**
 * One mailbox per row.
 * @param row - the row named in the warnings, after `dsh-glm-hourness/`.
 */
export function createStepMailbox(row: string): StepMailbox {
  const pending = new WeakMap<LiveAgentLike, UserNotice[]>()
  // The agents with listeners, weakly: an agent that is released takes its entry and its listeners with it.
  const installed = new WeakMap<LiveAgentLike, () => void>()
  const known = new Set<WeakRef<LiveAgentLike>>()
  const warned = new Set<string>()
  let disposed = false

  const warn = (key: string, text: string): void => {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`dsh-glm-hourness/${row}: ${text}`)
  }

  /** The waiting notices of the agent, installing its two listeners first; the reason when they cannot be installed. */
  function install(agent: LiveAgentLike): UserNotice[] | string {
    const own = pending.get(agent)
    if (own !== undefined) return own
    const scope = agent.ctx
    if (typeof scope?.on !== 'function') return 'the agent has no scoped context'
    const undo: Array<() => void> = []
    try {
      // Both listeners or neither: a notice is only kept once the step can deliver it and the log can say it was delivered.
      undo.push(scope.on('agent/pre-step', async (payload, next) => {
        const decision = await next()
        const waiting = pending.get(agent)
        if (disposed || waiting === undefined || waiting.length === 0) return decision
        if (decision.kind === 'reject' || payload.signal.aborted) return decision
        try {
          // installModelSelection's guard: an empty decision never turns into a step.
          if (decision.messages.length === 0 && (payload.step === 1 || payload.messages.length > 0)) return decision
          const carried = new Set(decision.messages.map(idOf))
          const add = waiting.filter(notice => !carried.has(notice.id))
          return add.length === 0 ? decision : { ...decision, messages: [...add, ...decision.messages] }
        }
        catch (error) {
          warn('skipped', `step notices skipped: ${messageOf(error)}`)
          return decision
        }
      }))
      undo.push(scope.on('session/event', (session, event: SessionEventLike) => {
        if (session.id !== agent.session.id || event.type !== 'user/message') return
        const id = idOf(event.data)
        const waiting = pending.get(agent)
        const at = waiting === undefined ? -1 : waiting.findIndex(notice => notice.id === id)
        if (at >= 0) waiting?.splice(at, 1)
      }))
    }
    catch (error) {
      for (const withdraw of undo.splice(0).reverse()) withdraw()
      return messageOf(error)
    }
    const waiting: UserNotice[] = []
    pending.set(agent, waiting)
    installed.set(agent, () => { for (const withdraw of undo.splice(0).reverse()) withdraw() })
    for (const ref of known) if (ref.deref() === undefined) known.delete(ref)
    known.add(new WeakRef(agent))
    return waiting
  }

  return {
    post(agent, notice) {
      if (disposed) return { via: 'none', reason: 'the row is unloading' }
      if (typeof notice.id !== 'string') return { via: 'none', reason: 'notice without id' }
      const waiting = install(agent)
      if (typeof waiting === 'string') {
        // Today's way, said once: the notice goes into the inbox the step claims.
        try {
          agent.inject(notice)
        }
        catch (error) {
          return { via: 'none', reason: `${waiting}; inject: ${messageOf(error)}` }
        }
        warn('inbox', `notices go through the inbox: ${waiting}`)
        return { via: 'inbox', reason: waiting }
      }
      if (waiting.some(entry => entry.id === notice.id)) return { via: 'step' }
      waiting.push(notice)
      if (waiting.length > ROOM) {
        waiting.shift()
        warn('room', `an agent had more than ${ROOM} step notices waiting; the oldest was dropped`)
      }
      return { via: 'step' }
    },
    pendingCount: agent => pending.get(agent)?.length ?? 0,
    dispose() {
      disposed = true
      for (const ref of known) {
        const agent = ref.deref()
        if (agent === undefined) continue
        installed.get(agent)?.()
        installed.delete(agent)
        pending.delete(agent)
      }
      known.clear()
    },
  }
}
