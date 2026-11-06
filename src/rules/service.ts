/**
 * The service the rules row provides for the rows that ask whether a rules
 * board is there (docs/ORCHESTRATION.md §16.2, §16.11, §16.15; design §7.2):
 * types, constants and the reader only, so the guard row and the design row
 * import it without importing the rules row. The guard adds `declaration` to
 * its `glm:guard` prompt section when it reads the service, and adds nothing
 * while the rules row is off, so the model is told about the board only when
 * there is one. The design row (M3) takes the other three members for
 * `attach: 'rules:<proposal>'` (src/design/attach.ts): `attachable` before a
 * proposal is put to the human, `proposalLine` for the last line of the
 * question, `acceptProposal` once the human agreed.
 *
 * The reader checks the members that exist and takes a service that has more.
 */
import type { AttachService } from '../shared/attach.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** The cordis service name the rules row provides. */
export const RULES_SERVICE = 'glmHournessRules'

/** The line the guard's `glm:guard` section ends with while the rules board is on. It does not change with the rules, so it does not change the prompt cache. */
export const RULES_DECLARATION = 'A rules board set by the human may block or defer tool calls: a blocked or deferred call returns the reason, a deferred one also a ticket, and you get a message when the ticket clears.'

export interface RulesService {
  /** The line for the guard's prompt section. */
  readonly declaration: string
}

/** What the rules row provides: the line for the guard and the three members the design row takes for `attach: 'rules:<proposal>'` (src/shared/attach.ts). */
export interface RulesBoardService extends RulesService, AttachService {}

/** The last line of the question that carries a proposal: names the proposal and nothing else (design §9.3 step 2). */
export function proposalLine(id: string): string {
  return `规则板提议 \`${id}\``
}

const LINE_PATTERN = /规则板提议 `(p-[0-9a-f]{8})`\s*$/

/** The proposal a question body ends with; undefined when it ends with none of this board's. The inverse of `proposalLine`. */
export function proposalIdOf(body: string): string | undefined {
  return LINE_PATTERN.exec(body)?.[1]
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

/** The service with the members of the path of agreement, or undefined while the rules row is off or does not have them. */
export function rulesBoardService(ctx: ServiceLookup): RulesBoardService | undefined {
  const value = rulesService(ctx)
  const members = value as Partial<Record<keyof RulesBoardService, unknown>> | undefined
  return typeof members?.attachable === 'function' && typeof members.proposalLine === 'function' && typeof members.acceptProposal === 'function' ? value as RulesBoardService : undefined
}
