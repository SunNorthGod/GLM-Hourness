/**
 * The execute row's service contract (M7 design 0.6 §2.5 item 2, §3.2.2):
 * the cordis service `glmHournessExecute` the row provides, read here by the
 * design row's guard rules, which cannot import src/execute/ — the same
 * arrangement as src/shared/peak-mode.ts, whose reader serves the rows that
 * read the rules board.
 *
 * Only the member M3's rules judge with is listed here; the row adds its
 * loop-board action runner at step E8 without this contract changing.
 */
import type { ServiceLookup } from './dsh-min.ts'

/** The cordis service name the execute row provides. */
export const EXECUTE_SERVICE = 'glmHournessExecute'

/** What the execute row hands the other rows: who may write in a dispatch chain. */
export interface ExecuteService {
  /**
   * Whether the agent id names a dispatch this process started that is still
   * a live agent (§3.1.4): a registered worker or reviewer. Write permission
   * comes from this and the row's own rules, never from the child id's shape.
   */
  isWorker(agentId: string): boolean
}

/** The reader: undefined while the execute row is off; undefined with a `problem` report when the member has the wrong type. */
export function executeService(ctx: ServiceLookup, problem?: (message: string) => void): ExecuteService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(EXECUTE_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const service = value as Partial<Record<keyof ExecuteService, unknown>>
  if (typeof service.isWorker === 'function') return value as ExecuteService
  problem?.(`${EXECUTE_SERVICE} has the wrong shape; the dispatch chain reads as ungated`)
  return undefined
}
