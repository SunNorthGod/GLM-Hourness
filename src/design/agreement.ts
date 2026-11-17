/**
 * The person's word on the graph, read back (docs/ORCHESTRATION.md §16.15,
 * §18.14; both boards' end of the agreement in the chat, src/rules/accept.ts
 * and src/loops/accept.ts): whether a question's last decision is the human's
 * own, or the main agent's carrying the human's words — the marks
 * `record_human_answer` writes (src/shared/answer-marks.ts) — and the one
 * settling step an open proposal runs against its question in both boards'
 * reconciliations. This reads only what the graph says; the board's own
 * checks stay inside its `apply`.
 */
import type { GraphNode } from '../graph/schema.ts'
import { ANSWER_MARKS } from '../shared/answer-marks.ts'

/** How long a proposal nobody put to the human lapses. */
const EXPIRES_AFTER_MS = 7 * 24 * 3_600_000

/** The start of the mark in a decision's reason that says the human was shown the text of what runs. */
export const SEEN_MARK = '已给人看原文 '

/** How the human agreed on the graph, or why what the graph says is not their agreement. */
export type Agreement = { readonly ok: true, readonly by: 'human' | 'llm', readonly relay?: string, readonly reason: string } | { readonly ok: false, readonly message: string }

/**
 * The agreement a question holds: it is `done` and its last decision is the human's own, or the main agent's with the
 * human's words as `relay` and a reason that starts as a recorded agreement does (`ANSWER_MARKS.agree`). Nothing else
 * is an agreement, whatever the question's text says.
 */
export function agreementOf(node: GraphNode): Agreement {
  if (node.status !== 'done') return { ok: false, message: `the question ${node.id} is ${node.status}, not decided` }
  const decision = [...node.history].reverse().find(entry => entry.op === 'decide')
  if (decision === undefined) return { ok: false, message: `the question ${node.id} has no decision` }
  const reason = decision.reason ?? ''
  if (decision.actor === 'human') return { ok: true, by: 'human', ...(decision.relay === undefined ? {} : { relay: decision.relay }), reason }
  if (decision.actor === 'llm' && decision.relay !== undefined && decision.relay.trim() !== '' && reason.startsWith(ANSWER_MARKS.agree)) return { ok: true, by: 'llm', relay: decision.relay, reason }
  return { ok: false, message: `the decision on ${node.id} is not the human's: it carries no words of theirs` }
}

/** The writes a reconciliation makes on a board, as both boards' stores take them. */
export type SettleMutation =
  | { readonly op: 'proposal-expire', readonly id: string }
  | { readonly op: 'proposal-reject', readonly id: string, readonly by: 'human' | 'llm', readonly relay?: string }
  | { readonly op: 'proposal-accept', readonly id: string, readonly by: 'human' | 'llm', readonly relay?: string, readonly question: string }

/** What the settling did with the proposal: accepted, rejected, expired, or nothing was due. */
export type Settled = 'accepted' | 'rejected' | 'expired' | undefined

/**
 * One open proposal settled against its question (design §9.3 step 5, loop
 * board design 0.6 §7.1 step 5): no question has named it for
 * `EXPIRES_AFTER_MS`, so it lapses; the human let its question drop, so it is
 * rejected as the dropping decision says; or the question holds the human's
 * agreement with the mark that they were shown the text (`seen`), so it is
 * accepted as their word. The board applies each write itself, with its own
 * checks; a write that does not take leaves the proposal open.
 */
export async function settleQuestion(input: {
  readonly id: string
  readonly at: string
  readonly node: GraphNode | undefined
  readonly now: number
  readonly seen: (reason: string) => boolean
  readonly apply: (mutation: SettleMutation) => Promise<{ readonly ok: boolean, readonly changed?: boolean }>
}): Promise<Settled> {
  const { id, node } = input
  if (node === undefined) {
    if (input.now - Date.parse(input.at) > EXPIRES_AFTER_MS && (await input.apply({ op: 'proposal-expire', id })).ok) return 'expired'
    return undefined
  }
  if (node.status === 'dropped') {
    const dropping = [...node.history].reverse().find(entry => entry.to === 'dropped')
    const relay = dropping?.relay
    if ((await input.apply({ op: 'proposal-reject', id, by: dropping?.actor === 'human' ? 'human' : 'llm', ...(relay === undefined ? {} : { relay }) })).ok) return 'rejected'
    return undefined
  }
  const agreement = agreementOf(node)
  if (!agreement.ok || !input.seen(agreement.reason)) return undefined
  const result = await input.apply({ op: 'proposal-accept', id, by: agreement.by, ...(agreement.relay === undefined ? {} : { relay: agreement.relay }), question: node.id })
  return result.ok && result.changed === true ? 'accepted' : undefined
}
