/**
 * ZCode 3.16.3 Read, Write and Edit texts, input schemas and result texts,
 * mirrored from the release bundle (resources/glm/zcode.cjs). Verbatim mirror
 * file: every string and template-literal chunk below must occur in a ZCode
 * reference, which scripts/check-verbatim.mjs enforces chunk by chunk. Keep
 * this file free of regex literals and division: the gate's scanner does not
 * parse them. Logic and localized compositions live in read-alias.ts and
 * aliases.ts (docs/DESIGN.md §5.4).
 *
 * Descriptions are the tool entries' `metadata.description` (bundle `Hbo`,
 * `rba`, `Nba`; source core/src/tool/handlers/read.ts, write.ts, edit.ts).
 * Read's model contract adds a PDF line and a `pages` parameter only for
 * models that declare PDF input (resolveReadProviderDescription,
 * resolveReadInputSchema); GLM declares none, so the base forms apply.
 *
 * Schemas are what ZCode sends as each tool's input schema: toToolJsonSchema
 * (bundle `ms`) over the contract zod objects (bundle `_Rr`, `git`, `_it`),
 * i.e. zod-to-json-schema 3.25.2 with target jsonSchema7 and effect strategy
 * input, normalized, then `$schema` set to 2020-12. Key order follows that
 * output: type, constraints, default, description; `$schema` last.
 */
import type { JsonRecord } from './json.ts'

/** Read's default line window (contracts READ_DEFAULT_MAX_LINES, bundle `TG`). */
export const READ_DEFAULT_MAX_LINES = 2000

/** The `$schema` toToolJsonSchema stamps (bundle `Fsn`). */
const TOOL_JSON_SCHEMA_VERSION = 'https://json-schema.org/draft/2020-12/schema'

/** Read description line about images. */
export const READ_IMAGE_LINE = '- Reads images (PNG, JPG, \u2026) and presents them visually.'

/** Read description line about videos. */
export const READ_VIDEO_LINE = "- Reads videos (MP4, MOV, WEBM, \u2026) and presents them as video input (subject to ZCode's video input limit)."

/** Read description lines; the handler joins them with newlines (bundle `Hbo`). */
export const READ_DESCRIPTION_LINES: readonly string[] = [
  'Reads a file from the local filesystem.',
  '',
  '- `file_path` must be an absolute path.',
  `- Reads up to ${READ_DEFAULT_MAX_LINES} lines by default.`,
  "- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters",
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

/** Partial-view notice, window sentence (bundle `ula`, createTokenCapPartialView). */
export function readPartialViewRange(startLine: number, endLine: number, totalLines: number): string {
  return `Showing a partial view of lines ${startLine}-${endLine} of ${totalLines}.`
}

/** Partial-view notice, continuation sentence (bundle `ula`). */
export function readPartialViewContinue(nextOffset: number): string {
  return `Use Read with offset ${nextOffset} and limit ${READ_DEFAULT_MAX_LINES} to continue, or use a search tool to find a specific section.`
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
