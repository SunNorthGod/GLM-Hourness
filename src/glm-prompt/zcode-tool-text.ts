/**
 * ZCode 3.17.1 tool texts (Read, Write, Edit, Glob, Grep, TodoWrite, Bash),
 * input schemas and result texts, mirrored from the release bundle
 * (reference/zcode-3.17.1/zcode.cjs). Bundle names in the comments are the
 * 3.16.3 ones where the text did not change between the two releases.
 * Verbatim mirror file: every string and template-literal chunk below must
 * occur in the reference, which scripts/check-verbatim.mjs enforces chunk by
 * chunk. Keep this file free of
 * regex literals and division: the gate's scanner does not parse them. Logic
 * and localized compositions live in read-alias.ts, search-alias.ts and
 * aliases.ts (docs/DESIGN.md §5.4).
 *
 * Descriptions are the tool entries' `metadata.description` (bundle `Hbo`,
 * `rba`, `Nba`, `$Ta`, `HTa`, `HEo`, `NIn`; source core/src/tool/handlers/
 * read.ts, write.ts, edit.ts, glob.ts, grep.ts, todo.ts, bash-prompt.ts).
 * Read's model contract adds a PDF line and a `pages` parameter only for
 * models that declare PDF input (resolveReadProviderDescription,
 * resolveReadInputSchema); GLM declares none, so the base forms apply.
 *
 * Schemas are what ZCode sends as each tool's input schema: toToolJsonSchema
 * (bundle `ms`) over the contract zod objects (bundle `_Rr`, `git`, `_it`,
 * `vit`, `bit`, `Iit`, `lMe`), i.e. zod-to-json-schema 3.25.2 with target
 * jsonSchema7 and effect strategy input, normalized, then `$schema` set to
 * 2020-12. Key order follows that output: type, constraints, default,
 * description; `$schema` last.
 */
import type { JsonRecord } from '../shared/json.ts'

/** Read's default line window (contracts READ_DEFAULT_MAX_LINES, bundle `TG`). */
export const READ_DEFAULT_MAX_LINES = 2000

/** The `$schema` toToolJsonSchema stamps (bundle `Fsn`). */
const TOOL_JSON_SCHEMA_VERSION = 'https://json-schema.org/draft/2020-12/schema'

/** Read description line about images. */
export const READ_IMAGE_LINE = '- Reads images (PNG, JPG, \u2026) and presents them visually.'

/** Read description line about videos. */
export const READ_VIDEO_LINE = "- Reads videos (MP4, MOV, WEBM, \u2026) and presents them as video input (subject to ZCode's video input limit)."

/** Read description lines; the handler joins them with newlines (3.17.1 bundle `kIo`). */
export const READ_DESCRIPTION_LINES: readonly string[] = [
  'Reads a file from the local filesystem.',
  '',
  '- `file_path` must be an absolute path.',
  `- Reads up to ${READ_DEFAULT_MAX_LINES} lines by default.`,
  '- When you already know which part of the file you need, only read that part. This can be important for larger files.',
  '- Results are returned using cat -n format, with line numbers starting at 1',
  READ_IMAGE_LINE,
  READ_VIDEO_LINE,
  '- Reading a directory, a missing file, or an empty file returns an error or system reminder rather than content.',
  '- Do NOT re-read a file you just edited to verify \u2014 Edit/Write would have errored if the change failed, and the harness tracks file state for you.',
]

/** Read input schema (toToolJsonSchema of bundle `_Rr`, ReadInputJsonSchema). */
export const READ_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'The absolute path to the file to read' },
    offset: {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description: 'The line number to start reading from. Only provide if the file is too large to read at once',
    },
    limit: {
      type: 'integer',
      exclusiveMinimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description: 'The number of lines to read. Only provide if the file is too large to read at once.',
    },
  },
  required: ['file_path'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}

/** Write description (bundle `rba`). */
export const WRITE_DESCRIPTION = [
  'Writes a file to the local filesystem, overwriting if one exists.',
  '',
  "When to use: creating a new file, or fully replacing one you've already Read. Overwriting an existing file you haven't Read will fail. For partial changes, use Edit instead.",
].join('\n')

/** Write input schema (toToolJsonSchema of bundle `git`, WriteInputJsonSchema). */
export const WRITE_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'The absolute path to the file to write (must be absolute, not relative)' },
    content: { type: 'string', description: 'The content to write to the file' },
  },
  required: ['file_path', 'content'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}

/** Edit description (bundle `Nba`). */
export const EDIT_DESCRIPTION = [
  'Performs exact string replacement in a file.',
  '',
  '- You must Read the file in this conversation before editing, or the call will fail.',
  '- `old_string` must match the file exactly, including indentation, and be unique \u2014 the edit fails otherwise. Strip the Read line prefix (line number + tab) before matching.',
  '- `replace_all: true` replaces every occurrence instead.',
].join('\n')

/** Edit input schema (toToolJsonSchema of bundle `_it`, EditInputJsonSchema; `replace_all` is a defaulted semantic boolean). */
export const EDIT_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'The absolute path to the file to modify' },
    old_string: { type: 'string', description: 'The text to replace' },
    new_string: { type: 'string', description: 'The text to replace it with (must be different from old_string)' },
    replace_all: { type: 'boolean', default: false, description: 'Replace all occurrences of old_string (default false)' },
  },
  required: ['file_path', 'old_string', 'new_string'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}

/** Spellings Edit's semantic boolean accepts after trim and lower-casing (contracts edit.ts, bundle `H_s` / `G_s`). */
export const SEMANTIC_TRUE: readonly string[] = ['true', '1', 'yes', 'y', 'on']
export const SEMANTIC_FALSE: readonly string[] = ['false', '0', 'no', 'n', 'off']

/** Extensions Read presents as images (inferImageMimeFromPath). */
export const READ_IMAGE_EXTENSIONS: readonly string[] = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

/** Extensions Read presents as video (VIDEO_INPUT_MIME_BY_EXTENSION). */
export const READ_VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi']

/** Extensions Read refuses as binary (contracts read.ts UNSUPPORTED_BINARY_EXTENSIONS, bundle `I_s`). */
export const READ_BINARY_EXTENSIONS: readonly string[] = [
  '.7z', '.a', '.bin', '.bz2', '.class', '.dll', '.dmg', '.dylib', '.exe', '.gz',
  '.jar', '.o', '.pyc', '.rar', '.so', '.tar', '.tgz', '.wasm', '.zip',
]

/** Read's refusal for a binary extension (validateReadPathSemantics). */
export function readBinaryFileMessage(extension: string): string {
  return `This tool cannot read binary files. The file appears to be a binary ${extension} file. Please use appropriate tools for binary file analysis.`
}

/** Read result warning envelope (bundle `Lwn`, formatReadToolResultWarning). */
export function readToolResultWarning(body: string): string {
  return `<system-reminder>${body}</system-reminder>`
}

/** Read warning for an empty file (bundle `ila`). */
export const READ_EMPTY_FILE_WARNING = 'Warning: the file exists but the contents are empty.'

/** Opening of the partial-view notice (3.17.1 bundle `sSo`). */
const READ_PARTIAL_VIEW_PREFIX = '[Truncated: PARTIAL view \u2014 '

/** The tools the partial-view notice names (bundle `aSo`, `cSo`). */
const READ_TOOL_NAME = 'Read'
const GREP_TOOL_NAME = 'Grep'

/**
 * Line-paged partial-view notice (3.17.1 createTokenCapPartialView `E0a`):
 * `lineCount` lines from `startLine` to `endLine` of `totalLines` are
 * shown, the next page starts after `endLine`. ZCode puts its token count
 * and cap, ` (<N> tokens, cap 25000)`, between `total` and `. Call`; the
 * caller supplies that clause or none (`tokenClause`).
 */
export function readPartialViewNotice(filePath: string, startLine: number, endLine: number, totalLines: number, lineCount: number, tokenClause: string): string {
  return [
    `${READ_PARTIAL_VIEW_PREFIX}${filePath}: showing lines ${startLine}-${endLine} of ${totalLines} total`,
    tokenClause,
    `. Call ${READ_TOOL_NAME} with offset=${endLine + 1} limit=${lineCount} for the next page, or ${GREP_TOOL_NAME} to find a specific section. Do NOT answer from this page alone if the answer may be further in the file.]`,
  ].join('')
}

/** Suffix of a successful Write or Edit result (bundle `oba` / `Uba`). */
export const FILE_STATE_CURRENT_SUFFIX = ' (file state is current in your context \u2014 no need to Read it back)'

/** Write result without user modification (formatWriteModelContent, bundle `cba`). */
export function writeResultText(filePath: string, created: boolean): string {
  return created
    ? `File created successfully at: ${filePath}${FILE_STATE_CURRENT_SUFFIX}`
    : `The file ${filePath} has been updated successfully.${FILE_STATE_CURRENT_SUFFIX}`
}

/** Edit result without user modification (formatEditModelContent, bundle `zba`); pieces keep the bundle's interpolation points. */
export function editResultText(filePath: string, replaceAll: boolean): string {
  return replaceAll
    ? [`The file ${filePath} has been updated`, '. All occurrences were successfully replaced.', FILE_STATE_CURRENT_SUFFIX].join('')
    : [`The file ${filePath} has been updated successfully`, '.', FILE_STATE_CURRENT_SUFFIX].join('')
}

/** Glob description (bundle `$Ta`). */
export const GLOB_DESCRIPTION = 'Fast file pattern matching. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted by modification time.'

/** Glob input schema (toToolJsonSchema of bundle `vit`, GlobInputJsonSchema). */
export const GLOB_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'The glob pattern to match files against' },
    path: {
      type: 'string',
      description: 'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
    },
  },
  required: ['pattern'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}

/** Paths one Glob call returns (core glob.ts MAX_GLOB_RESULTS, bundle `zTa`). */
export const GLOB_MAX_RESULTS = 100

/** Glob result text over the returned display paths (formatGlobModelContent, bundle `WTa`). */
export function globModelContent(filenames: readonly string[], truncated: boolean): string {
  if (filenames.length === 0) return 'No files found'
  const lines = [...filenames]
  if (truncated) lines.push('(Results are truncated. Consider using a more specific path or pattern.)')
  return lines.join('\n')
}

/** Grep description line about multiline patterns. */
export const GREP_MULTILINE_LINE = '- `multiline: true` for patterns that span lines.'

/** Grep description lines (bundle `HTa`). */
export const GREP_DESCRIPTION_LINES: readonly string[] = [
  'Content search built on ripgrep. Prefer this over `grep`/`rg` via Bash \u2014 results integrate with the permission UI and file links.',
  '',
  '- Full regex syntax (e.g. "log.*Error", "function\\s+\\w+"). Ripgrep, not grep \u2014 escape literal braces (`interface\\{\\}`).',
  '- Filter with `glob` (e.g. "**/*.tsx") or `type` (e.g. "js", "py", "rust").',
  '- `output_mode`: "content" (matching lines), "files_with_matches" (paths only, default), or "count".',
  GREP_MULTILINE_LINE,
]

/** Grep input schema (toToolJsonSchema of bundle `bit`, GrepInputJsonSchema). */
export const GREP_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    'pattern': { type: 'string', description: 'The regular expression pattern to search for in file contents' },
    'path': { type: 'string', description: 'File or directory to search in (rg PATH). Defaults to current working directory.' },
    'glob': { type: 'string', description: 'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob' },
    'output_mode': {
      type: 'string',
      enum: ['content', 'files_with_matches', 'count'],
      description: 'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".',
    },
    '-B': { type: 'number', description: 'Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.' },
    '-A': { type: 'number', description: 'Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.' },
    '-C': { type: 'number', description: 'Alias for context.' },
    'context': { type: 'number', description: 'Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.' },
    '-n': { type: 'boolean', description: 'Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise. Defaults to true.' },
    '-i': { type: 'boolean', description: 'Case insensitive search (rg -i)' },
    '-o': {
      type: 'boolean',
      description: 'Print only the matched (non-empty) parts of each matching line, one match per output line (rg -o / --only-matching). Requires output_mode: "content", ignored otherwise. Defaults to false.',
    },
    'type': { type: 'string', description: 'File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.' },
    'head_limit': {
      type: 'number',
      description: 'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 250 when unspecified. Pass 0 for unlimited (use sparingly \u2014 large result sets waste context).',
    },
    'offset': { type: 'number', description: 'Skip first N lines/entries before applying head_limit, equivalent to "| tail -n +N | head -N". Works across all output modes. Defaults to 0.' },
    'multiline': { type: 'boolean', description: 'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.' },
  },
  required: ['pattern'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}

/** Entries Grep returns when `head_limit` is unspecified (adapters fs DEFAULT_GREP_HEAD_LIMIT). */
export const GREP_DEFAULT_HEAD_LIMIT = 250

/** The GrepOutput fields formatGrepModelContent reads. */
export interface GrepModelOutput {
  readonly mode: 'content' | 'files_with_matches' | 'count'
  readonly numFiles: number
  readonly filenames: readonly string[]
  readonly content?: string
  readonly numMatches?: number
  readonly appliedLimit?: number
  readonly appliedOffset?: number
}

/** `noun` or its plural (core grep.ts plural, bundle `FCn`). */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}

/** Pagination facts (core grep.ts formatLimitInfo, bundle `KTa`). */
function grepLimitInfo(appliedLimit: number | undefined, appliedOffset: number | undefined): string {
  const parts: string[] = []
  if (appliedLimit !== undefined) parts.push(`limit: ${appliedLimit}`)
  if (appliedOffset !== undefined) parts.push(`offset: ${appliedOffset}`)
  return parts.join(', ')
}

/** Grep result text (formatGrepModelContent, bundle `JTa`; 3.16.3 joins with one newline where the 3.16.2 source has two). */
export function grepModelContent(result: GrepModelOutput): string {
  const limitInfo = grepLimitInfo(result.appliedLimit, result.appliedOffset)
  if (result.mode === 'content') {
    const content = result.content || 'No matches found'
    return limitInfo ? `${content}\n[Showing results with pagination = ${limitInfo}]` : content
  }
  if (result.mode === 'count') {
    const content = result.content || 'No matches found'
    const matches = result.numMatches ?? 0
    const files = result.numFiles
    const summary = `Found ${matches} total ${plural(matches, 'occurrence')} across ${files} ${plural(files, 'file')}.`
    return `${content}\n${summary}${limitInfo ? ` with pagination = ${limitInfo}` : ''}`
  }
  if (result.numFiles === 0) return 'No files found'
  return `Found ${result.numFiles} ${plural(result.numFiles, 'file')}${limitInfo ? ` ${limitInfo}` : ''}\n${result.filenames.join('\n')}`
}

/** TodoWrite description (bundle `HEo`). */
export const TODO_WRITE_DESCRIPTION = [
  'Create and update a task list for the current session. The list is rendered to the user as your working plan.',
  '',
  '- Each todo has `content`, `status` ("pending" | "in_progress" | "completed"), and `priority` ("high" | "medium" | "low").',
  '- Send the full list each call; it replaces the previous one.',
  '- Keep one item `in_progress` at a time and mark it `completed` when done.',
].join('\n')

/** TodoWrite input schema (toToolJsonSchema of bundle `Iit`, TodoWriteInputJsonSchema). */
export const TODO_WRITE_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', minLength: 1, description: 'Brief description of the task' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Current status of the task' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level of the task' },
        },
        required: ['content', 'status', 'priority'],
        additionalProperties: false,
      },
      description: 'The complete updated todo list. At most one item may be in_progress at a time.',
    },
  },
  required: ['todos'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}

/** Bash default and maximum timeout (core bash-timeout-policy.ts DEFAULT_BASH_TIMEOUT_POLICY, bundle `L8`). */
export const BASH_DEFAULT_TIMEOUT_MS = 120000
export const BASH_MAX_TIMEOUT_MS = 600000

/** Commands the Bash description steers to dedicated tools when embedded search is off (bash-prompt.ts). */
const BASH_AVOID_COMMANDS = '`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`'

/** Bash description line naming the shell. */
export const BASH_SHELL_LINE = 'Executes a bash command and returns its output.'

/** Bash description line about the working directory and shell state. */
export const BASH_WORKDIR_LINE = "- Working directory persists between calls, but prefer absolute paths \u2014 `cd` in a compound command can trigger a permission prompt. Shell state (env vars, functions) does not persist; the shell is initialized from the user's profile."

/** Bash description line about background commands. */
export const BASH_BACKGROUND_LINE = '- `run_in_background` runs the command detached: it keeps running across turns and re-invokes you when it exits. No `&` needed.'

/** Bash description line about where command output shows. */
export const BASH_COMMAND_OUTPUT_LINE = '- Command output is displayed to you, not reliably to the user.'

/** Bash description lines (createBashProviderDescription, 3.17.1 bundle `EAn`, with the default timeout policy and embedded search off). */
export const BASH_DESCRIPTION_LINES: readonly string[] = [
  BASH_SHELL_LINE,
  '',
  BASH_WORKDIR_LINE,
  `- IMPORTANT: Avoid using this tool to run ${BASH_AVOID_COMMANDS} commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user.`,
  BASH_COMMAND_OUTPUT_LINE,
  `- \`timeout\` is in milliseconds: default ${BASH_DEFAULT_TIMEOUT_MS}, max ${BASH_MAX_TIMEOUT_MS} for a foreground command.`,
  BASH_BACKGROUND_LINE,
  '',
  '# Git',
  '- Interactive flags (`-i`, e.g. `git rebase -i`, `git add -i`) are not supported in this environment.',
  '- Use the `gh` CLI for GitHub operations (PRs, issues, API).',
  '- Commit or push only when the user asks. If on the default branch, branch first.',
]

/** Bash `description` field prompt (contracts bash.ts BASH_DESCRIPTION_FIELD_PROMPT, 3.17.1 bundle `CTs`). */
const BASH_DESCRIPTION_FIELD_PROMPT = [
  'Clear, concise description of what this command does in active voice. Never use words like "complex" or "risk" in the description - just describe what it does.',
  '',
  'Say what the command does in plain words: do not echo the command\'s text, its flags, or file paths - the user reads this description, often without seeing the command.',
  '',
  'For simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):',
  '- ls \u2192 "List files in current directory"',
  '- git status \u2192 "Show working tree status"',
  '- npm install \u2192 "Install package dependencies"',
  '',
  'For commands that are harder to parse at a glance (piped commands, obscure flags, etc.), add enough context to clarify what it does:',
  '- find . -name "*.tmp" -exec rm {} \\; \u2192 "Find and delete all .tmp files recursively"',
  '- git reset --hard origin/main \u2192 "Discard all local changes and match remote main"',
  "- curl -s url | jq '.data[]' \u2192 \"Fetch JSON from URL and extract data array elements\"",
].join('\n')

/** Bash input schema (toToolJsonSchema of 3.17.1 bundle `SNe` as `iPa` stamps the timeout policy, BashInputJsonSchema; the semantic number and booleans convert as their input types). */
export const BASH_INPUT_SCHEMA: JsonRecord = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'The command to execute' },
    timeout: { type: 'number', description: `Optional timeout in milliseconds (max ${BASH_MAX_TIMEOUT_MS} for a foreground command)` },
    description: { type: 'string', description: BASH_DESCRIPTION_FIELD_PROMPT },
    run_in_background: { type: 'boolean', description: 'Set to true to run this command in the background.' },
    dangerouslyDisableSandbox: { type: 'boolean', description: 'Set this to true to dangerously override sandbox mode and run commands without sandboxing.' },
  },
  required: ['command'],
  additionalProperties: false,
  $schema: TOOL_JSON_SCHEMA_VERSION,
}
