/**
 * What another component hands the main agent to put to the human, and takes
 * back once they agreed (docs/ORCHESTRATION.md §3.5; the orchestrator's
 * seam ruling "attach"): a proposal the rules board or the loops board
 * recorded, named by `attach` on propose_to_human, shown as the question's
 * last paragraph and handed back to its board by record_human_answer after
 * the human agreed. Each board adds one row to ATTACH_BOARDS when it is
 * merged and imports only its own service module; M3 imports nothing else of
 * a board. Until then the table is empty and every attach is refused with
 * the reason.
 */
import { createHash } from 'node:crypto'
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { normalizeTalk } from './talk.ts'

/** The original text of a proposal that runs something, as the board gives it for the human to read before agreeing. */
export interface AttachDetail {
  /** Shown to the human as the last paragraph of the question: 1 to 6000 code points. */
  readonly markdown: string
  /** Pieces of it the human must have seen, each 1 to 4000 code points, at most 8. */
  readonly mustShow: readonly string[]
}

/** What a board says about one of its proposals before it is put to the human or agreed to. */
export type Attachable = { readonly ok: true, readonly detail?: AttachDetail } | { readonly ok: false, readonly message: string }

/** The members of a board's service M3 calls. */
export interface AttachService {
  attachable(input: { readonly cwd: string | undefined, readonly proposal: string }): Attachable | Promise<Attachable>
  /** The last line of the question's body that ties it to the proposal. */
  proposalLine(id: string): string
  /** Called once the human agreed; resolves to the line the main agent is told (it does not reject). */
  acceptProposal(input: { readonly questionId: string, readonly graphDir: string, readonly cwd: string | undefined, readonly by: { readonly actor: 'llm', readonly relay: string } }): Promise<string>
}

/** One row of the table: how a board's proposals are named, found and reached. */
export interface AttachBoard {
  /** `rules:` or `loops:`. */
  readonly prefix: string
  /** The whole `attach` argument, prefix included. */
  readonly format: RegExp
  /** What the board is called in a message, for example "the rules board". */
  readonly board: string
  /** The board's service in the cordis store; undefined when the board is not running. */
  service(lookup: ServiceLookup): AttachService | undefined
  /** The id of the proposal a question body ends with; undefined when it ends with none of this board's. */
  idOf(body: string): string | undefined
}

/** The boards that take `attach`; a board adds its row when it merges. */
export const ATTACH_BOARDS: readonly AttachBoard[] = []

const MARKDOWN_LIMIT = 6000
const MUST_SHOW_PIECES = 8
const PIECE_LIMIT = 4000

const size = (text: string): number => [...text].length

/** The detail a board gave, or why it is not acceptable (a detail outside the limits is the board's fault, not the model's). */
function detailOf(detail: unknown): AttachDetail | undefined | string {
  if (detail === undefined) return undefined
  if (typeof detail !== 'object' || detail === null) return 'its detail is not {markdown, mustShow}'
  const { markdown, mustShow }: { markdown?: unknown, mustShow?: unknown } = detail
  if (typeof markdown !== 'string' || !Array.isArray(mustShow)) return 'its detail is not {markdown, mustShow}'
  if (size(markdown) < 1 || size(markdown) > MARKDOWN_LIMIT) return `its detail text is not 1 to ${MARKDOWN_LIMIT} characters`
  if (mustShow.length < 1 || mustShow.length > MUST_SHOW_PIECES) return `its detail must show 1 to ${MUST_SHOW_PIECES} pieces`
  if (mustShow.some(piece => typeof piece !== 'string' || size(piece) < 1 || size(piece) > PIECE_LIMIT)) return `each piece its detail must show is 1 to ${PIECE_LIMIT} characters`
  return { markdown, mustShow: mustShow as string[] }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A board's answer to attachable, with the detail checked; a throw, a
 * malformed answer and a detail outside the limits are `ok: false`. Asked
 * before the proposal is put to the human, again when it is shown once more,
 * and again before the human's agreement is recorded.
 */
export async function askBoard(service: AttachService, cwd: string | undefined, id: string): Promise<Attachable> {
  let answer: Attachable
  try {
    answer = await service.attachable({ cwd, proposal: id })
  }
  catch (error) {
    return { ok: false, message: `it could not be asked: ${reasonOf(error)}` }
  }
  if (typeof answer !== 'object' || answer === null || typeof answer.ok !== 'boolean') return { ok: false, message: 'it gave an answer that is not {ok, detail?}' }
  if (!answer.ok) return { ok: false, message: typeof answer.message === 'string' ? answer.message : 'it refused' }
  const detail = detailOf(answer.detail)
  return typeof detail === 'string' ? { ok: false, message: detail } : detail === undefined ? { ok: true } : { ok: true, detail }
}

/** The board and proposal an `attach` argument names, and its detail; or why it cannot be put to the human. */
export type Attachment =
  | { readonly ok: true, readonly board: AttachBoard, readonly service: AttachService, readonly id: string, readonly line: string, readonly detail?: AttachDetail }
  | { readonly ok: false, readonly message: string }

/** Resolve an `attach` argument: the board by its prefix, the service, and what the board says about the proposal (it must be attachable). */
export async function resolveAttach(boards: readonly AttachBoard[], lookup: ServiceLookup, attach: string, cwd: string | undefined): Promise<Attachment> {
  const prefix = /^[a-z]+:/.exec(attach)?.[0] ?? attach
  const board = boards.find(entry => entry.prefix === prefix)
  if (board === undefined) return { ok: false, message: `no component in this composition takes attach ${prefix}` }
  if (!board.format.test(attach)) return { ok: false, message: `attach for ${board.board} must match ${board.format.source}` }
  const service = board.service(lookup)
  if (service === undefined) return { ok: false, message: `${board.board} is not running here` }
  const id = attach.slice(board.prefix.length)
  const answer = await askBoard(service, cwd, id)
  if (!answer.ok) return { ok: false, message: `${board.board} refused it: ${answer.message}` }
  return { ok: true, board, service, id, line: service.proposalLine(id), ...answer.detail === undefined ? {} : { detail: answer.detail } }
}

/** The body of a question that carries a board's proposal: its original text when it has one, then the line that ties the question to the proposal. */
export function attachBody(attachment: Extract<Attachment, { ok: true }>): string {
  return attachment.detail === undefined ? attachment.line : `${attachment.detail.markdown}\n\n${attachment.line}`
}

/** The board whose proposal a question body ends with, and the proposal's id. */
export function boardOfBody(boards: readonly AttachBoard[], body: string | undefined): { readonly board: AttachBoard, readonly id: string } | undefined {
  if (body === undefined) return undefined
  for (const board of boards) {
    const id = board.idOf(body)
    if (id !== undefined) return { board, id }
  }
  return undefined
}

/** A short digest of a detail, written on the decision so that the text the human agreed to can be told. */
export function attachDigest(detail: AttachDetail): string {
  return createHash('sha256').update(`${detail.markdown}\n${detail.mustShow.join('\n')}`).digest('hex').slice(0, 12)
}

/** The pieces of the detail that are not in what the main agent said after showing it: all of them must be, as the human reads them. */
export function piecesNotShown(detail: AttachDetail, said: string): readonly string[] {
  const text = normalizeTalk(said)
  return detail.mustShow.filter(piece => !text.includes(normalizeTalk(piece)))
}
