/**
 * The execute row's service contract (M7 design 0.6 §2.5 item 2, §3.2.2):
 * the cordis service `glmHournessExecute` the row provides, read here by the
 * design row's guard rules, which cannot import src/execute/ — the same
 * arrangement as src/shared/peak-mode.ts, whose reader serves the rows that
 * read the rules board.
 *
 * Three members: the one M3's rules judge with; the trunk advance a running
 * call was allowed to make, which the rules board's gate is to read for
 * `gate.trunk-advance` (R4-F4, §18.2; src/rules/gate.ts does not read it
 * yet); and `runAction`, the loop board's `run` for the row's harness
 * actions (§2.5 point 2, src/execute/loop-link.ts), with the loop board's
 * record and result types (src/shared/loop-records.ts).
 */
import type { ServiceLookup } from './dsh-min.ts'
import type { HarnessResult, LoopEventRecord } from './loop-records.ts'

/** The cordis service name the execute row provides. */
export const EXECUTE_SERVICE = 'glmHournessExecute'

/** What the execute row hands the other rows: who may write in a dispatch chain, which call is moving the trunk, and the runner of its harness actions. */
export interface ExecuteService {
  /**
   * Whether the agent id names a dispatch this process started that is still
   * a live agent (§3.1.4): a registered worker or reviewer. Write permission
   * comes from this and the row's own rules, never from the child id's shape.
   */
  isWorker(agentId: string): boolean
  /**
   * The local trunk advance the call `callId` was allowed to make (§3.8.4):
   * `advanceOk` held and the result is known before the call runs. Recorded
   * before the inner pre-execute listeners run and dropped in post-execute
   * or after 60 seconds; `undefined` for a refused call, a move the table
   * cannot predict (a script) and every other call.
   */
  trunkAdvanceFor(callId: string): { readonly branch: string, readonly from: string, readonly to: string } | undefined
  /**
   * Run one of the row's harness actions for a loop-board event (§2.5 point
   * 2). Never throws and the promise is never rejected: an unknown action, a
   * project that is not a git repository's root and a graph that does not
   * load are `failed` with the reason; an action already done is `skipped`.
   */
  runAction(action: string, record: LoopEventRecord): Promise<HarnessResult>
}

/** The reader: undefined while the execute row is off; undefined with a `problem` report when a member has the wrong type. */
export function executeService(ctx: ServiceLookup, problem?: (message: string) => void): ExecuteService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(EXECUTE_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const service = value as Partial<Record<keyof ExecuteService, unknown>>
  if (typeof service.isWorker === 'function' && typeof service.trunkAdvanceFor === 'function' && typeof service.runAction === 'function') return value as ExecuteService
  problem?.(`${EXECUTE_SERVICE} has the wrong shape; the dispatch chain reads as ungated`)
  return undefined
}
