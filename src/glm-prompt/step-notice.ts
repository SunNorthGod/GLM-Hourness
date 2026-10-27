/**
 * The per-step notice seam shared by the todo reminder and the peak-hour
 * reminder: an `agent/pre-step` listener (after the step's assembly, before
 * its request; ZCode's attachment collection) that, on an eligible step,
 * reads the request-visible history and appends the notice `build` returns
 * after the step's admitted messages. The notice persists in the session,
 * so later steps derive their state from it.
 */
import type { AgentLike, DerivedMessage, UserNotice } from '../shared/dsh-min.ts'

/**
 * Install one step notice on an agent. `eligible()` reads what this step's
 * assembly decided. Returns undefined, installing nothing, when the agent has
 * no session history to derive state from.
 */
export function installStepNotice(agent: AgentLike, what: string, eligible: () => boolean, build: (history: readonly DerivedMessage[]) => UserNotice | undefined): (() => void) | undefined {
  const session = agent.session
  if (typeof session?.deriveMessages !== 'function') {
    console.warn(`dsh-glm-hourness/glm-prompt: ${what} not installed for agent ${agent.id}: no session history`)
    return undefined
  }
  return agent.ctx.on('agent/pre-step', async ({ messages, signal, step }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || !eligible()) return decision
    // installModelSelection's guard: an empty decision never turns into a step.
    if (decision.messages.length === 0 && (step === 1 || messages.length > 0)) return decision
    const notice = build(session.deriveMessages() as readonly DerivedMessage[])
    return notice === undefined ? decision : { ...decision, messages: [...decision.messages, notice] }
  })
}
