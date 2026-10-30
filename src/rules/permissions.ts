/**
 * Who may write what (docs/ORCHESTRATION.md §16; design §2.5): the first
 * check of every write. The identity comes from the entry that calls, never
 * from the request: a slash command is the person's, a tool or the command
 * line is `llm`, the host's own code is `harness`. In the full board this
 * table grows one row per operation; today it has the one operation the
 * board writes for a caller.
 */
import type { RulesActor } from './model.ts'

/** The operations a caller can ask for. */
export type WriteOp = 'peak-mode-set'

const WRITERS: Readonly<Record<WriteOp, readonly RulesActor[]>> = {
  // Only the person changes the peak mode; an agent can propose it and the person's word makes it so (the proposal path joins with the full board).
  'peak-mode-set': ['human'],
}

export interface Refusal {
  readonly message: string
  /** How the person does it. */
  readonly hint: string
}

/** Why the actor may not do the operation, or undefined when it may. */
export function refusalFor(actor: RulesActor, op: WriteOp): Refusal | undefined {
  if (WRITERS[op].includes(actor)) return undefined
  return {
    message: `只有人能改高峰模式（身份 ${actor} 不行）`,
    hint: '在输入框打 /rules peak 无影响|少做|不做',
  }
}
