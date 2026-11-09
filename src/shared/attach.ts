/**
 * What a board hands the main agent to put to the human and takes back once they
 * agreed (docs/ORCHESTRATION.md §3.5): the types of the contract between the design
 * row (M3, src/design/attach.ts), which asks and records, and a board's service
 * (src/rules/service.ts), which answers. Types only, so neither side imports the other.
 */

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