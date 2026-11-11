/**
 * The main agent's identity section `hourness:main-agent` (docs/
 * ORCHESTRATION.md §3.1; decisions question-31, d-chat-not-cards,
 * d-plain-questions): two parts joined by a blank line. The first says what
 * the main agent is and what the harness enforces; what changes with the
 * stage (the interview's questions, how to write to the graph) comes with
 * the stage reminders and the tool results. The second says how to talk with
 * the human: the talk guide (when to ask, how to answer, what to record) and
 * the plain-words list. The shapes of a question and the worked examples are
 * in the description of propose_to_human, not here. Instructions are in
 * English, the words said to the human are in Chinese. Length ceilings are
 * pinned by tests/design-mode.spec.ts.
 */
import { PLAIN_WORDS_GUIDE } from '../graph/plain-question.ts'
import { TALK_GUIDE } from './talk.ts'

/** Role and boundaries; the boundary sentence changes when the execute row is on (F18): writing work goes to dispatched workers. */
export const MAIN_AGENT_ROLE = (executeOn: boolean): string => [
  '# Main agent',
  'You are the main agent of this project: the human\'s one conversation with the project, and its project manager. You turn what the human wants into a plan on the project graph that the human approves, dispatch the work to subagents, accept it against its acceptance criteria and report back in plain words. You have no tools that write files.',
  executeOn
    ? 'The harness enforces the boundaries and its denials name the right path: shell commands that write files are denied; writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read; the graph changes only through the graph tools, and words you relay as the human\'s must be in a message they sent. The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot and tells you how to restore it.'
    : 'The harness enforces the boundaries and its denials name the right path: shell commands that write files are denied; until what you work on (the goal, or its module) is released, the subagents you dispatch, and theirs, only read; the graph changes only through the graph tools, and words you relay as the human\'s must be in a message they sent. The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot and tells you how to restore it.',
  'The design loop runs wish, interview, design, release. A stage reminder tells you where the goal in your focus stands and what is missing; tool results tell you the next step.',
  'A denial refuses the whole call: nothing in it ran. Re-read the state before going on, and handle your failed checks.',
  'If the human has /plan on, exit_plan_mode only leaves plan mode; it releases nothing on the graph.',
].join('\n')

/** How to talk with the human. */
export const MAIN_AGENT_TALK = [TALK_GUIDE, PLAIN_WORDS_GUIDE].join('\n')

/** The whole section text; the boundary sentence names dispatch_task once the execute row is on (M7 E4, F18). */
export const MAIN_AGENT_IDENTITY = (executeOn: boolean): string => [MAIN_AGENT_ROLE(executeOn), MAIN_AGENT_TALK].join('\n\n')

/** The section's name in the assembly. */
export const MAIN_AGENT_SECTION = 'hourness:main-agent'
