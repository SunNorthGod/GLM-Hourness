/**
 * The service the rules row provides for the rows that ask whether a rules
 * board is there (docs/ORCHESTRATION.md §16.2, §16.11, §16.15; design §7.2):
 * types and the reader only, so the design row imports it without importing
 * the rules row. Until the ablation arm A2 (DESIGN.md §5.2a, adopted
 * 2026-11-10) the guard row also read it to add a board line to its
 * `glm:guard` prompt section; the section is one fixed sentence now and the
 * design row (M3) takes the three members for `attach: 'rules:<proposal>'`
 * (src/design/attach.ts): `attachable` before a proposal is put to the
 * human, `proposalLine` for the last line of the question, `acceptProposal`
 * once the human agreed.
 */
import type { AttachService } from '../shared/attach.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** The cordis service name the rules row provides. */
export const RULES_SERVICE = 'glmHournessRules'

/** The last line of the question that carries a proposal: names the proposal and nothing else (design §9.3 step 2). */
export function proposalLine(id: string): string {
  return `规则板提议 \`${id}\``
}

const LINE_PATTERN = /规则板提议 `(p-[0-9a-f]{8})`\s*$/

/** The proposal a question body ends with; undefined when it ends with none of this board's. The inverse of `proposalLine`. */
export function proposalIdOf(body: string): string | undefined {
  return LINE_PATTERN.exec(body)?.[1]
}

/** The service with the members of the path of agreement, or undefined while the rules row is off or does not have them. */
export function rulesBoardService(ctx: ServiceLookup): AttachService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(RULES_SERVICE) : undefined
  const members = value as Partial<Record<keyof AttachService, unknown>> | undefined
  return typeof members?.attachable === 'function' && typeof members.proposalLine === 'function' && typeof members.acceptProposal === 'function' ? value as AttachService : undefined
}
