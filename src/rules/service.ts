/**
 * The service the rules row provides for the rows that ask whether a rules
 * board is there (docs/ORCHESTRATION.md §16.2, §16.11; design §7.2): types,
 * constants and the reader only, so the guard row imports it without importing
 * the rules row. The guard adds `declaration` to its `glm:guard` prompt section
 * when it reads the service, and adds nothing while the rules row is off, so
 * the model is told about the board only when there is one.
 *
 * `RulesService` has the one member the guard reads. The members for the path
 * of a person's agreement (`attachable`, `acceptProposal`, `staleEntries`)
 * arrive with that path, which is not built yet; the reader checks the members
 * that exist and takes a service that has more.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** The cordis service name the rules row provides. */
export const RULES_SERVICE = 'glmHournessRules'

/** The line the guard's `glm:guard` section ends with while the rules board is on. It does not change with the rules, so it does not change the prompt cache. */
export const RULES_DECLARATION = 'A rules board set by the human may block or defer tool calls: a blocked or deferred call returns the reason, a deferred one also a ticket, and you get a message when the ticket clears.'

export interface RulesService {
  /** The line for the guard's prompt section. */
  readonly declaration: string
}

/** Read the service; undefined while the rules row is off, or when a member has the wrong type (reported to `problem`). */
export function rulesService(ctx: ServiceLookup, problem?: (message: string) => void): RulesService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(RULES_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const declaration = (value as Partial<Record<keyof RulesService, unknown>>).declaration
  if (typeof declaration === 'string' && declaration.length > 0) return value as RulesService
  problem?.(`${RULES_SERVICE} has the wrong shape; the guard declares no rules board`)
  return undefined
}
