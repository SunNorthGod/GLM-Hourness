/**
 * The takeover's service contract (takeover design 0.6 §7.4): the service
 * name, the `attach` of the questions the takeover hands the main agent to
 * put to the human, the last body line that ties a question to it, and the
 * reader M3's attach table uses (src/design/attach.ts). Constants and pure
 * functions only, so M3 imports nothing else of the takeover; the service
 * itself is built in src/bootstrap/runtime.ts.
 *
 * M3 hands a board the part of `attach` after its prefix, so the members
 * here take `tk-<8>:cost` and `tk-<8>:touch`. The list rounds
 * (`list-<n>`) join with bootstrap_review.
 */
import type { AttachService } from '../design/attach.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

export const BOOTSTRAP_SERVICE = 'glmHournessBootstrap'

/** The prefix of every takeover attach, as M3's attach table names it. */
export const TAKEOVER_ATTACH_PREFIX = 'bootstrap:'

/** A whole takeover attach: the two things only the human can say (§5.4). */
export const ATTACH_PATTERN = /^bootstrap:tk-[0-9a-z]{8}:(cost|touch)$/

const ATTACH_LINE = /^接管提议 `([^`\s]+)`$/

/** The line M3 writes last into the body of a question that carries `attach`; the inverse of takeoverAttachOf. */
export function takeoverAttachLine(attach: string): string {
  return `接管提议 \`${attach}\``
}

/** The takeover attach a question body ends with (`bootstrap:tk-…:cost`); undefined when it ends with none. */
export function takeoverAttachOf(body: string | undefined): string | undefined {
  const last = (body ?? '').trimEnd().split(/\r?\n/).at(-1)?.trim() ?? ''
  const found = ATTACH_LINE.exec(last)?.[1]
  return found !== undefined && ATTACH_PATTERN.test(found) ? found : undefined
}

/** The takeover service as M3 calls it; undefined while the takeover row is off, or when a member is missing. */
export function bootstrapService(ctx: ServiceLookup): AttachService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(BOOTSTRAP_SERVICE) : undefined
  if (typeof value !== 'object' || value === null) return undefined
  const members = value as Partial<Record<keyof AttachService, unknown>>
  return typeof members.attachable === 'function' && typeof members.proposalLine === 'function' && typeof members.acceptProposal === 'function' ? value as AttachService : undefined
}
