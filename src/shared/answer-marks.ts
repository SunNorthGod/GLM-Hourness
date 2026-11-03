/**
 * The three things a person says back to a proposal, as they are written
 * on the graph (docs/ORCHESTRATION.md §3.5; decision d-chat-not-cards):
 * record_human_answer (src/design/record.ts) writes them, the panel's changes
 * view and the metrics read them. Agreement opens the `reason` of the
 * decide, approve or edit it caused; adding and rejecting open the text of a
 * comment. Every write of one call also carries
 * "（record_human_answer <callId>）", so the writes of one reply can be joined.
 * The words live only here.
 */

export const ANSWER_MARKS = { agree: '人在对话里同意', add: '人在对话里补充：', reject: '人在对话里否掉：' } as const
export type AnswerKind = keyof typeof ANSWER_MARKS

/** Whether a history entry is the person's reply in the chat, and which one: by the start of the `reason` (decide, approve, edit) or the `text` (comment). */
export function answerKindOf(entry: { readonly op: string, readonly reason?: string, readonly text?: string }): AnswerKind | undefined {
  const said = entry.op === 'comment' ? entry.text : entry.reason
  if (said === undefined) return undefined
  const kinds = entry.op === 'comment' ? ['add', 'reject'] as const : ['agree'] as const
  return kinds.find(kind => said.startsWith(ANSWER_MARKS[kind]))
}

/** The start of `recordedAs` when the human handed this one matter to the main agent ("你定"): the answer is the main agent's own decision, and it is counted apart from following a recommendation. */
export const DELEGATED = '交给主 Agent 定：'

/** The start of the reason of the write that records "这类你定": not an agreement to a proposal, so `answerKindOf` does not read it as one. */
export const DELEGATION_REASON = '人在对话里把这一类交给主 Agent 定：'

/** The one norm node that holds the kinds of matter the human handed to the main agent for good; only the harness writes it (record_human_answer, kind delegation). */
export const DELEGATIONS_ID = 'norm-delegations'
/** What every acceptance item of that node ends with: the kind, then this. */
export const DELEGATION_SUFFIX = '：主 Agent 定，只告知'
/** Most kinds the node holds. */
export const DELEGATION_LIMIT = 20
/** The kind an acceptance item of that node stands for: the item without its ending. */
export function delegationKindOf(item: string): string {
  return item.endsWith(DELEGATION_SUFFIX) ? item.slice(0, -DELEGATION_SUFFIX.length) : item
}
/**
 * The short answers that plainly say yes. A short answer to a matter that
 * cannot be taken back is restated before it is recorded unless it is one of
 * these (or, for a choice between ways, "第 N 条"); the main agent's guide and
 * the check of the calibration run read this one list.
 */
export const AGREE_WORDS: readonly string[] = ['可以', '好', '好的', '行', '就这样', '就推荐的']

const NTH_WAY = /^第\s*[0-9一二三四五六七八九十]+\s*条$/u

/** Whether the whole answer, without the white space and punctuation around it, is one of AGREE_WORDS or "第 N 条". */
export function isPlainYes(text: string): boolean {
  const bare = text.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
  return AGREE_WORDS.includes(bare) || NTH_WAY.test(bare)
}

const CALL_MARK = /（record_human_answer ([^）\s]+)）/

/** The call that wrote a history entry: the id in "（record_human_answer <callId>）" of its `reason` or `text`; undefined when it has none. */
export function answerCallOf(entry: { readonly reason?: string, readonly text?: string }): string | undefined {
  return CALL_MARK.exec(entry.reason ?? entry.text ?? '')?.[1]
}

/** The mark that ends a reason or a comment and names the call. */
export function answerCallMark(callId: string): string {
  return `（record_human_answer ${callId}）`
}
