/**
 * The words that open a person's reply in the chat as it is written on the
 * project graph (M3 design addendum §3.5): agreement opens the `reason` of
 * the decide, approve or edit it caused; adding and rejecting open the text
 * of a comment. The words live only here, so the module that writes them and
 * the ones that read them cannot drift apart. The learning pipeline of the
 * memory row (src/memory/signals.ts) reads them to tell a person's "no" and
 * "also" from the agent's own comments, and an agreed edit from a correction.
 */

export const ANSWER_MARKS = { agree: '人在对话里同意', add: '人在对话里补充：', reject: '人在对话里否掉：' } as const
type AnswerKind = keyof typeof ANSWER_MARKS

/** Whether a history entry is the person's reply in the chat, and which one: by the start of the `reason` (decide, approve, edit) or the `text` (comment). */
export function answerKindOf(entry: { readonly op: string, readonly reason?: string, readonly text?: string }): AnswerKind | undefined {
  const said = entry.op === 'comment' ? entry.text : entry.reason
  if (said === undefined) return undefined
  const kinds = entry.op === 'comment' ? ['add', 'reject'] as const : ['agree'] as const
  return kinds.find(kind => said.startsWith(ANSWER_MARKS[kind]))
}
