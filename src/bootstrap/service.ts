/**
 * The takeover's service contract (takeover design 0.6 §3.1, §7.4): the
 * service name, the members M3's `/wish` and stage reminder call (`wants`,
 * `prepare`, `holds`), the `attach` of the questions the takeover hands the
 * main agent to put to the human, the last body line that ties a question to
 * it, and the readers M3 uses (src/design/mode.ts, src/design/stage-notice.ts,
 * src/design/attach.ts). Types, constants and pure functions only, so M3
 * imports nothing else of the takeover; the service itself is built in
 * src/bootstrap/runtime.ts.
 *
 * M3 hands a board the part of `attach` after its prefix, so the members
 * here take `tk-<8>:cost`, `tk-<8>:touch` and `tk-<8>:list-<n>`; the list
 * rounds join with bootstrap_review (§7.2–§7.4).
 */
import type { AttachService } from '../shared/attach.ts'
import type { DesignInvocationLike, ServiceLookup, UserNotice } from '../shared/dsh-min.ts'

export const BOOTSTRAP_SERVICE = 'glmHournessBootstrap'

/** The prefix of every takeover attach, as M3's attach table names it. */
export const TAKEOVER_ATTACH_PREFIX = 'bootstrap:'

/** A whole takeover attach: the two things only the human can say (§5.4), and a list round of bootstrap_review (§7.2). */
export const ATTACH_PATTERN = /^bootstrap:tk-[0-9a-z]{8}:(cost|touch|list-[1-9][0-9]{0,3})$/

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

/**
 * How a takeover is asked for: `/wish` (`wish` is the person's words, left
 * out when there are none) or `/hourness-init` (`path` is the path the
 * person chose, when they gave one).
 */
export interface PrepareRequest {
  readonly trigger: 'wish' | 'init'
  readonly wish?: string
  readonly path?: 'new' | 'existing'
}

export type PrepareResult =
  | { readonly ok: false, readonly text: string }
  | {
    readonly ok: true
    /** The path decision, what was done and the next step, for the command result (Chinese). */
    readonly text: string
    /** The wish is the takeover's to keep and hand back, not M3's interview step 1 (an existing project or the gaps of a graph). */
    readonly holdWish: boolean
    /** The takeover-start notice; none on the new-project path. */
    readonly notice?: UserNotice
  }

/**
 * The members M3 calls (§3.1): `/wish` asks `wants`, then `prepare` once the
 * session is going to be the project's main agent; the stage reminder asks
 * `holds` about the goal in focus. `holds` reads memory only and never throws.
 */
export interface WishSeam {
  /** The takeover row and the graph row are on, and the project has no project graph or an open takeover. */
  wants(cwd: string): Promise<boolean>
  /** Open the takeover (or hand back the open one) after the deterministic part; never rejects. */
  prepare(invocation: DesignInvocationLike, request: PrepareRequest): Promise<PrepareResult>
  /** The goal belongs to the open takeover of an existing project or of the gaps, so M3's stage reminder leaves the interview to the takeover. */
  holds(cwd: string, goalId: string): boolean
}

/** The service object in the store, whatever it has; undefined while the takeover row is off. */
function serviceObject(ctx: ServiceLookup): object | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(BOOTSTRAP_SERVICE) : undefined
  return typeof value === 'object' && value !== null ? value : undefined
}

/** The takeover service as M3's attach table calls it; undefined while the takeover row is off, or when a member is missing. */
export function bootstrapService(ctx: ServiceLookup): AttachService | undefined {
  const members = serviceObject(ctx) as Partial<Record<keyof AttachService, unknown>> | undefined
  return typeof members?.attachable === 'function' && typeof members.proposalLine === 'function' && typeof members.acceptProposal === 'function' ? members as AttachService : undefined
}

/** The takeover service as M3's `/wish` and stage reminder call it; undefined while the takeover row is off, or when a member is missing. */
export function bootstrapWishSeam(ctx: ServiceLookup): WishSeam | undefined {
  const members = serviceObject(ctx) as Partial<Record<keyof WishSeam, unknown>> | undefined
  return typeof members?.wants === 'function' && typeof members.prepare === 'function' && typeof members.holds === 'function' ? members as WishSeam : undefined
}
