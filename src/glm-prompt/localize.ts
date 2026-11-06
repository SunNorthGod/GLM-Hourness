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
import { ZCODE_MEMORY_LINES } from './zcode-memory-text.ts'

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
 * Replace the one occurrence of `from` in `text`. Any other count means the
 * mirrored line no longer has the shape the rewrite expects, so it throws
 * instead of passing a half-localized sentence on.
 */
export function replaceOnce(text: string, from: string, to: string): string {
  const found = text.split(from).length - 1
  if (found !== 1) throw new Error(`replaceOnce: "${from}" found ${found} times, expected once`)
  return text.replace(from, () => to)
}

/** ⑧ Memory section, Z2: the ZCode opening names a directory and the Write tool; DSH has the three memory tools. */
export const MEMORY_Z2_LOCAL = 'You have a persistent memory that the harness keeps for you; write it with memory_store, read it with memory_query, delete with memory_forget. Each memory holds one fact, stored with these fields:'
/** ⑧ Memory section, Z6: the ZCode index pointer names `MEMORY.md`; the harness keeps the index and `memory_query` reads one memory in full. */
export const MEMORY_Z6_LOCAL = 'The memory index is loaded into context each session \u2014 one line per memory (name, type, description); read a memory in full with memory_query.'
/** ⑧ Memory section, L1: preferences carry the person's own words (`relay`); a project memory points at its source. */
export const MEMORY_L1 = 'When the user tells you how to work, pass their own words in relay. A project memory names where the fact lives in source (a project graph node id, a doc section, a commit or a URL); that source stays the authority.'
/** ⑧ Memory section, L3 (m5-habit-rule): a guessed habit is asked with memory_habit, which the memory row registers with the three memory tools, and never on a question card (rule habit-ask-first). */
export const MEMORY_L3 = 'A habit you only guessed from how the user works is asked with memory_habit (ask, then confirm or decline on their words), never on a question card; after a no, the same habit is not asked again for 28 days.'
/** ⑧ Memory section, L2: pitfalls and their fixes belong to the lessons board; only said when the request has `lessons_query`. */
export const MEMORY_L2 = 'Pitfalls you hit and how you fixed them go on the lessons board; look them up with lessons_query.'
/** ⑧ Memory section: the body line of the frontmatter block is a tool argument, `body`. */
export const MEMORY_BODY_PREFIX = 'body: '

const [ZCODE_HEADING, ZCODE_FENCE_OPEN, ZCODE_NAME, ZCODE_DESCRIPTION, ZCODE_TYPE, ZCODE_BODY, ZCODE_FENCE_CLOSE, ZCODE_LINKS, ZCODE_KINDS, ZCODE_SAVING] = ZCODE_MEMORY_LINES

/** ⑧ Memory section, Z7 to Z9 (one line in ZCode): the sentences about files talk about memories here. */
const MEMORY_SAVING_DSH = replaceOnce(replaceOnce(ZCODE_SAVING, 'existing file', 'existing memory'), 'Update that file', 'Update that memory')

/**
 * ⑧ Memory section: the ZCode 3.17.1 sentences (zcode-memory-text.ts) around
 * the rewrites above. The frontmatter block becomes the tool's fields (no
 * `---` rules or `metadata:`, a flat `type:` line, `body:` on the body line).
 * `withLessons` adds L2 for a request whose tools include `lessons_query`.
 * Lines are joined by one `\n`; an empty string is an empty line.
 */
export function buildMemorySectionDsh(withLessons: boolean): string {
  return [
    ZCODE_HEADING, '',
    MEMORY_Z2_LOCAL, '',
    ZCODE_FENCE_OPEN, ZCODE_NAME, ZCODE_DESCRIPTION, ZCODE_TYPE.trimStart(), `${MEMORY_BODY_PREFIX}${ZCODE_BODY}`, ZCODE_FENCE_CLOSE, '',
    ZCODE_LINKS, '',
    ZCODE_KINDS, '',
    MEMORY_Z6_LOCAL, '',
    MEMORY_SAVING_DSH, '',
    MEMORY_L1, '',
    MEMORY_L3,
    ...withLessons ? ['', MEMORY_L2] : [],
  ].join('\n')
}
