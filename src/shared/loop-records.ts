/**
 * The two types a loop-board harness action is called with and answers
 * (loop board design 0.6 §3.1, §6.5): the event record the board hands to a
 * row's `run`, and the result the row gives back. They live here because two
 * services carry them, the loop row's `glmHournessLoops` (src/loops/
 * service.ts re-exports them under the same names) and the execute row's
 * `glmHournessExecute.runAction` (src/shared/execute-service.ts), and
 * src/shared/ imports no package directory.
 */

/** One event of the inbox, with what was merged into the same run by the debounce. */
export interface LoopEventRecord {
  /** ev-<16 hex digits> */
  readonly id: string
  readonly event: string
  readonly at: string
  /** The absolute path of the project root. */
  readonly project: string
  readonly session?: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly merged: readonly { readonly id: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }[]
}

export type HarnessResult =
  | { readonly outcome: 'done', readonly tell?: string }
  | { readonly outcome: 'skipped', readonly reason: string }
  | { readonly outcome: 'failed', readonly reason: string, readonly tell?: string }
