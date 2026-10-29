/**
 * Localization ledger for the coding-plan tier (docs/DESIGN.md §5.3, nine
 * points): ZCode behavior text stays verbatim; host-fact assertions are
 * rewritten to match actual DSH behavior, keeping the original phrasing
 * shape. Each constant names its ledger entry. The start-plan tier never
 * uses these (byte-identical mirror there).
 */
import {
  HARNESS_HEADING,
  HARNESS_PERMISSION_LINE,
  HARNESS_REFERENCE_LINE,
  HARNESS_TOOLS_LINE,
  harnessSystemTurnLine,
} from './zcode-harness-text.ts'

/**
 * ① Harness block: the 3.17.1 bullets (zcode-harness-text.ts) with the
 * display bullet rewritten for DSH (terminal → Web GUI). The system-turn
 * bullet takes 3.17.1's `<system-reminder>` branch: this channel delivers
 * every harness notice as a `<system-reminder>` user turn and never sends a
 * mid-conversation system turn (docs/DESIGN.md §5.5).
 */
export const HARNESS_BLOCK_DSH = [
  HARNESS_HEADING,
  ' - Text you output outside of tool use is displayed to the user as GitHub-flavored markdown in the DeepSeek Harness Web GUI.',
  HARNESS_PERMISSION_LINE,
  harnessSystemTurnLine(false),
  HARNESS_TOOLS_LINE,
  HARNESS_REFERENCE_LINE,
].join('\n')

/** ② Session guidance, skill rule rewritten for the DSH skill seam. */
export const SESSION_GUIDANCE_DSH = [
  '# Session-specific guidance',
  '- When a skill\'s content appears in the conversation, follow it for that task; do not call the skill loader again for the same skill.',
].join('\n')

/** ⑤ Skills availability note (appended to session guidance when skills exist). */
export const SKILLS_NOTE_DSH = '- Skills available to this session are listed by the skill loader; only use skills it lists \u2014 don\'t guess.'

/** ③ EnvInfo section, ZCode skeleton with DSH-resolved facts. */
export function buildEnvInfoSection(env: {
  cwd: string
  platform: string
  shell: string
  osVersion: string
  isGitRepository: boolean
  additionalDirectories?: readonly string[]
  modelLine?: string
}): string {
  const lines: string[] = [
    '# Environment',
    'You have been invoked in the following environment:',
    `- Primary working directory: ${env.cwd}`,
    ...(env.additionalDirectories && env.additionalDirectories.length > 0
      ? ['- Additional directories:', ...env.additionalDirectories.map(path => `  - ${path}`)]
      : []),
    `- Is a git repository: ${env.isGitRepository ? 'yes' : 'no'}`,
    `- Platform: ${env.platform}`,
    `- Shell: ${env.shell}`,
    `- OS Version: ${env.osVersion}`,
    ...(env.modelLine === undefined ? [] : [env.modelLine]),
  ]
  return lines.join('\n')
}

/** ⑦ Context management section, ZCode text verbatim (promises match DSH compaction). */
export const CONTEXT_MANAGEMENT_DSH = [
  '# Context management',
  'When the conversation grows long, some or all of the current context is summarized; the summary, along with any remaining unsummarized context, is provided in the next context window so work can continue \u2014 you don\'t need to wrap up early or hand off mid-task.',
  '',
  'When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue. If you are weighing a choice, give a recommendation, not an exhaustive survey',
  '',
  'You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking \'Want me to\u2026?\' or \'Shall I\u2026?\' will block the work. For reversible actions that follow from the original request, proceed without asking. Stop only for destructive actions or genuine scope changes the user must decide. Offering follow-ups after the task is done is fine; asking permission before doing the work is not.',
  '',
  'Exception: when the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don\'t apply a fix until they ask for one.',
  '',
  'Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done (\'I\'ll\u2026\', \'let me know when\u2026\'), do that work now with tool calls. That includes retrying after errors and gathering missing information yourself. Do not stop because the context or session is long. End your turn only when the task is complete or you are blocked on input only the user can provide.',
  '',
  'Before running a command that changes system state \u2014 restarts, deletes, config edits \u2014 check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have a different cause.',
].join('\n')

/**
 * ⑧ Memory section: ZCode skeleton, write discipline rewritten for the
 * memory_store/memory_query tool family and the `.llm` home (not ~/.zcode).
 */
export const MEMORY_SECTION_DSH = [
  '# Memory',
  '',
  'You have a persistent memory in this workspace (`.llm/memory.json`, served by the memory_store / memory_query / memory_forget tools). Store durable facts: who the user is, guidance the user has given on how you should work (with the why), ongoing goals not derivable from the code or git history, and pointers to external resources.',
  '',
  'Do not save what the repository already records (code structure, past fixes, git history, project docs) — memory_store refuses such entries. Don\'t save what only matters to this conversation.',
  '',
  'Before saving, query for an existing entry covering it — updating beats duplicating; delete memories that turn out to be wrong (memory_forget).',
  '',
  'Memories decay: each entry weakens over time unless a later store of the same id re-confirms it. Recall (memory_query) ranks by relevance times strength, so stale unconfirmed facts naturally fall away.',
].join('\n')
