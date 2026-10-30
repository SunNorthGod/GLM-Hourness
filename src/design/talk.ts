/**
 * How the main agent talks with the human, defined in one place (docs/
 * ORCHESTRATION.md §3.5; decision d-chat-not-cards): the guide that goes
 * into its system prompt, and the question tools hidden from it. Pure
 * values with no imports of the design row, so the host and the simulated
 * human can both read them. The names of the two tools in the guide are
 * literal here; the tools themselves are registered later.
 */

/**
 * The guide to talking with the human, English instructions with the
 * person's words and labels in Chinese. Followed in the system prompt by
 * PLAIN_QUESTION_GUIDE (src/graph/plain-question.ts).
 */
export const TALK_GUIDE = [
  'Talk with the human about at most three matters in one reply, and never give them options or letters to pick from.',
  'To learn what they want, ask one or two open questions in plain words, with your guess when you have one.',
  'Put every matter that needs their answer to them with propose_to_human: one plan in four short lines (背景, 推荐, 疑问, 不做), shown as given, then one question at the end.',
  'They agree, add or reject in their own words.',
  'Restate a loose answer in one line ("那我记成：…") and wait; then record it with record_human_answer and their exact words.',
  'Decide reversible details yourself and say so in one line.',
  'Ask at the project-manager level, never about code, and never ask what you can look up.',
].join(' ')

/**
 * What a proposal to the human is for: a matter only they can decide
 * (`question`), the requirement card to confirm (`confirm`), or the design
 * to release (`release`). The tools that put proposals to them, and the
 * checks on what they said back, are keyed by it.
 */
export type ProposalKind = 'question' | 'confirm' | 'release'

/**
 * Question tools the main agent does not get: the human is asked in plain
 * chat, never through option cards. Compared by DSH native name, so a dialect
 * alias of the same tool is hidden too.
 */
export const HIDDEN_FROM_MAIN_AGENT: readonly string[] = ['ask_user_question']
