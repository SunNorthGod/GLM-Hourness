/**
 * Test double of an agent's scoped context as far as the step mailbox
 * (src/shared/step-mailbox.ts) reads it, with the order in which rc.3 runs a
 * step: the `agent/pre-step` waterfall over the claimed messages, the abort
 * check after it (agent-loop agent.ts:290–300), then one `user/message`
 * append per admitted message (agent.ts:456–470), each dispatched to the
 * scope's `session/event` listeners while it is appended (session
 * index.ts:899–906). A listener registered later is inside the earlier ones,
 * as in a cordis waterfall. Nothing the runtime does not do.
 */
import type { PluginContext, PreStepDecision, PreStepPayload, SessionEventLike, SessionLike } from '../src/shared/dsh-min.ts'

type PreStepListener = (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>

/** The `agent/pre-step` waterfall over listeners, outermost first; the innermost decision enters the claimed messages (agent-loop agent.ts:290). */
export function preStepWaterfall(listeners: readonly PreStepListener[], payload: PreStepPayload): Promise<PreStepDecision> {
  const chain = listeners.reduceRight<() => Promise<PreStepDecision>>(
    (next, listener) => () => listener(payload, next),
    () => Promise.resolve({ kind: 'enter', messages: payload.messages }),
  )
  return chain()
}

type SessionListener = (session: SessionLike, event: SessionEventLike) => void

export interface StepScope {
  /** The scoped context: `agent/pre-step` and `session/event` only; any other event throws. */
  readonly ctx: PluginContext
  /** Every `user/message` the steps appended, in order. */
  readonly appended: unknown[]
  /** How many listeners are registered now. */
  listeners(): number
  /** Make the next registration of this event throw, as a released scope does (runtime-types.ts:202). */
  refuse(event: 'agent/pre-step' | 'session/event'): void
  /**
   * Run one step of the agent's session: `messages` are the claimed ones,
   * `step` the step number (2 by default), `abort` stops the step after the
   * pre-step and before anything is appended. Returns the decision.
   */
  step(session: SessionLike, options?: { readonly messages?: readonly unknown[], readonly step?: number, readonly abort?: boolean }): Promise<PreStepDecision>
}

export function stepScope(): StepScope {
  const preSteps: PreStepListener[] = []
  const events: SessionListener[] = []
  const appended: unknown[] = []
  const refused = new Set<string>()
  let seq = 0
  const add = <T>(list: T[], listener: T): () => void => {
    list.push(listener)
    return () => {
      const at = list.indexOf(listener)
      if (at >= 0) list.splice(at, 1)
    }
  }
  const ctx = {
    on: (event: string, listener: never) => {
      if (refused.delete(event)) throw new Error(`the scope of this agent is disposed: ${event}`)
      if (event === 'agent/pre-step') return add(preSteps, listener as PreStepListener)
      if (event === 'session/event') return add(events, listener as SessionListener)
      throw new Error(`the step scope does not model ${event}`)
    },
  } as unknown as PluginContext
  return {
    ctx,
    appended,
    listeners: () => preSteps.length + events.length,
    refuse: (event) => { refused.add(event) },
    async step(session, options = {}) {
      const messages = options.messages ?? []
      const controller = new AbortController()
      const payload = { messages, signal: controller.signal, turn: 1, step: options.step ?? 2 } as unknown as PreStepPayload
      const decision = await preStepWaterfall(preSteps, payload)
      if (options.abort === true || decision.kind !== 'enter') return decision
      for (const message of decision.messages) {
        appended.push(message)
        const event: SessionEventLike = { type: 'user/message', seq: seq++, time: Date.now(), data: message }
        for (const listener of [...events]) listener(session, event)
      }
      return decision
    },
  }
}
