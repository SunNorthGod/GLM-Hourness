/**
 * Plain words for the human (docs/ORCHESTRATION.md §3.5; decision
 * d-plain-questions): the words the person has not learned and what to say
 * instead, the worked example of a proposal and the guide that carries both
 * into the main agent's system prompt and the tool description of
 * propose_to_human. Defined once; the graph panel's wording check reads
 * PLAIN_WORDS from here. Pure text and pure functions, no Node built-ins.
 *
 * The example's matter is a settled decision (d-peak-mode,
 * d-main-agent-peak-exempt): how work dispatched during a GLM peak is lined
 * up. Its subject is the dispatched work, never the main agent, who answers
 * as usual on every level; the guide says the example only shows the layout.
 */
import { renderProposal, type ProposalText } from './proposal.ts'

/** One word the person does not use, and what to say in its place. */
export interface PlainWord {
  /** The forms to avoid: Chinese by substring, English by whole word, case-insensitive. */
  readonly avoid: readonly string[]
  readonly say: string
}

export const PLAIN_WORDS: readonly PlainWord[] = [
  { avoid: ['验收', 'acceptance'], say: '怎样算做完' },
  { avoid: ['标定', 'calibration'], say: '练习题' },
  { avoid: ['门禁', 'gate'], say: '合入前的检查' },
  { avoid: ['投影', 'projection'], say: '每一步给 agent 的项目摘要' },
  { avoid: ['补遗', '附录', 'addendum'], say: '说清它是什么' },
]

/** The worked example of a proposal, one short line each with a few bold key words. */
export const PLAIN_QUESTION_EXAMPLE: ProposalText = {
  title: '高峰时段派出去的活怎么排',
  background: '高峰时 GLM **更费积分**，系统每步都会提醒',
  proposal: '默认**少做**：少派几个，不派重活',
  doubt: '要是**赶工期**，你可以改成无影响',
  notTaken: '**派活全排队**，高峰后再开；主 Agent 照常回你话',
}

/** The words of PLAIN_WORDS that `text` uses. */
export function plainWordsIn(text: string): string[] {
  return PLAIN_WORDS.flatMap(({ avoid }) => avoid).filter(word => /^[\x20-\x7e]+$/.test(word)
    ? new RegExp(`(?<![A-Za-z0-9_])${word}(?![A-Za-z0-9_])`, 'i').test(text)
    : text.includes(word))
}

const GUIDE_INTRO = 'Whatever you say to the human is in plain words. A proposal from propose_to_human reads like this (the example only shows the layout; its matter is already settled), each line its own paragraph and a few key words of each line in bold:'

const GUIDE_WORDS = 'Plain words for the human: 怎样算做完 (for a goal: 怎样算做成), not 验收 or acceptance; 练习题, not 标定 or calibration (fixed small projects the system runs by itself to check nothing broke); 合入前的检查, not 门禁 or gate; 每一步给 agent 的项目摘要, not 投影 or projection; never 补遗, 附录 or addendum: say what the document is.'

/** The guide: the example as renderProposal prints it (a blank line between its paragraphs) between the layout sentence and the word list. */
export const PLAIN_QUESTION_GUIDE = [GUIDE_INTRO, renderProposal(PLAIN_QUESTION_EXAMPLE, 1), GUIDE_WORDS].join('\n')
