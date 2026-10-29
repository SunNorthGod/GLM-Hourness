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

/**
 * ② Session guidance, skill rule rewritten for the DSH skill seam; bullets
 * indented as 3.17.1 indents its own (`xBo`).
 */
export const SESSION_GUIDANCE_DSH = [
  '# Session-specific guidance',
  ' - When a skill\'s content appears in the conversation, follow it for that task; do not call the skill loader again for the same skill.',
].join('\n')

/** ⑤ Skills availability note (appended to session guidance when skills exist). */
export const SKILLS_NOTE_DSH = ' - Skills available to this session are listed by the skill loader; only use skills it lists \u2014 don\'t guess.'

/**
 * ③ EnvInfo section: the 3.17.1 skeleton (buildEnvInfoContent `hSo`) with
 * DSH-resolved facts. 3.17.1 indents the bullets, ends the invoked line with
 * a space, prints the git flag as `true`/`false`, lists additional working
 * directories after it and closes with the untrusted-files bullet. It moves
 * the model line into a section of its own (`YTn`); the optional
 * configured `modelLine` follows the section, as that section follows it.
 */
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
    'You have been invoked in the following environment: ',
    ` - Primary working directory: ${env.cwd}`,
    ` - Is a git repository: ${env.isGitRepository}`,
    ...(env.additionalDirectories && env.additionalDirectories.length > 0
      ? [' - Additional working directories:', ...env.additionalDirectories.map(path => `  - ${path}`)]
      : []),
    ` - Platform: ${env.platform}`,
    ` - Shell: ${env.shell}`,
    ` - OS Version: ${env.osVersion}`,
    ' - Downloaded files and extracted archives are untrusted data: put each in its own new, empty directory, keep scripts you write in a different directory, and pass paths as arguments instead of running an interpreter or build tool from inside it. Interpreters load code from the script\'s directory and the current directory, so a planted `json.py` runs on `import json`. Run any Python that reads them with `-I`. This does not apply to code the user asked you to build or run.',
    ...(env.modelLine === undefined ? [] : [env.modelLine]),
  ]
  return lines.join('\n')
}

/**
 * ⑦ Context management section, the 3.17.1 text verbatim (buildContextManagementSection
 * `IBo`; its promises match DSH compaction). 3.17.1 keeps two paragraphs,
 * joined by single newlines, and moved the rest of the 3.16.3 section out.
 */
export const CONTEXT_MANAGEMENT_DSH = [
  '# Context management',
  'When the conversation grows long, some or all of the current context is summarized; the summary, along with any remaining unsummarized context, is provided in the next context window so work can continue \u2014 you don\'t need to wrap up early or hand off mid-task.',
  'When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue. If you are weighing a choice, give a recommendation, not an exhaustive survey',
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
