/**
 * The per-step notice seam shared by the todo reminder, the peak-hour
 * reminder and the project graph's step projection: an `agent/pre-step`
 * listener (after the step's assembly, before its request; ZCode's
 * attachment collection) that, on an eligible step, reads the
 * request-visible history and appends the notice `build` returns after the
 * step's admitted messages. The notice persists in the session, so later
 * steps derive their state from it. The history readers below are shared
 * by those derivations.
 */
import type { AgentLike, DerivedMessage, SessionLike, UserNotice } from './dsh-min.ts'

/** What a builder may read besides the history: the messages this step admits, the agent's session, and the step and turn numbers. */
interface StepInput {
  readonly admitted: readonly DerivedMessage[]
  readonly session: SessionLike
  /** 1 is the turn's first step (the request channel's still-waits reminder rides it, m4-request-card §5.5). */
  readonly step: number
  /** The turn the step belongs to; absent when the host's payload has none (the env row keys its events by turn and step, m4 design §6.2). */
  readonly turn?: number
}

type StepNoticeBuilder = (history: readonly DerivedMessage[], step: StepInput) => UserNotice | undefined | Promise<UserNotice | undefined>

/**
 * Install one step notice on an agent. `eligible()` reads what this step's
 * assembly decided. Returns undefined, installing nothing, when the agent has
 * no session history to derive state from.
 * @param row - the row named in the warning, after `dsh-glm-hourness/`; the
 *   shared library names no row of either package by default.
 */
export function installStepNotice(agent: AgentLike, what: string, eligible: () => boolean, build: StepNoticeBuilder, row: string): (() => void) | undefined {
  const session = agent.session
  if (typeof session?.deriveMessages !== 'function') {
    console.warn(`dsh-glm-hourness/${row}: ${what} not installed for agent ${agent.id}: no session history`)
    return undefined
  }
  return agent.ctx.on('agent/pre-step', async (payload, next) => {
    const { messages, signal, step } = payload
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || !eligible()) return decision
    // installModelSelection's guard: an empty decision never turns into a step.
    if (decision.messages.length === 0 && (step === 1 || messages.length > 0)) return decision
    // The payload type says the turn is there; another host version may not carry it.
    const turn: unknown = (payload as { readonly turn?: unknown }).turn
    const notice = await build(session.deriveMessages() as readonly DerivedMessage[], { admitted: decision.messages as readonly DerivedMessage[], session, step, ...(typeof turn === 'number' ? { turn } : {}) })
    return notice === undefined ? decision : { ...decision, messages: [...decision.messages, notice] }
  })
}

type Block = NonNullable<DerivedMessage['content']>[number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A tool-call block's arguments as an object (rc.3 stores the provider's JSON text). */
export function toolCallArguments(block: Block): Record<string, unknown> | undefined {
  const raw = block.arguments
  if (isRecord(raw)) return raw
  if (typeof raw !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : undefined
  }
  catch {
    return undefined
  }
}

/** The tool calls the history has a result for, and those whose result is an error. */
export function toolCallOutcomes(history: readonly DerivedMessage[]): { readonly answered: ReadonlySet<string>, readonly failed: ReadonlySet<string> } {
  const answered = new Set<string>()
  const failed = new Set<string>()
  for (const message of history) {
    if (message.role !== 'tool' || message.toolCallId === undefined) continue
    answered.add(message.toolCallId)
    if (message.isError === true) failed.add(message.toolCallId)
  }
  return { answered, failed }
}
