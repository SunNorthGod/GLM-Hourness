/**
 * How a proposal to the human is laid out in the chat (docs/ORCHESTRATION.md
 * §3.5; the person fixed the layout on 2026-10-30): the title as one
 * paragraph, then 背景, 推荐, 疑问 and 不做 each as its own paragraph with the
 * label unbolded, a blank line between paragraphs. The text of a proposal is
 * five short strings; this module renders them and nothing else yet. The
 * line rules, the bold split and the engine's proposal shape arrive with the
 * propose_to_human tool. No Node built-ins: the engine, the tool, the example
 * in the identity section and the panel share it.
 */

/** The five strings of one proposal. */
export interface ProposalText {
  readonly title: string
  readonly background: string
  readonly proposal: string
  readonly doubt: string
  readonly notTaken: string
}

const LINES = [['背景', 'background'], ['推荐', 'proposal'], ['疑问', 'doubt'], ['不做', 'notTaken']] as const

const CIRCLED = ['①', '②', '③'] as const

/** The proposal as the person reads it: the numbered title, then the four labelled lines, each its own paragraph. */
export function renderProposal(text: ProposalText, number: 1 | 2 | 3): string {
  return [`${CIRCLED[number - 1]} ${text.title}`, ...LINES.map(([label, field]) => `${label}：${text[field]}`)].join('\n\n')
}
