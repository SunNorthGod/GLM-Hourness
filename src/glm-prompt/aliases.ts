/**
 * Alias surface: ZCode-facing schemas (taken from docs/reference/zcode-tool-schemas.md,
 * pending the source rebuild, DESIGN.md §5.9) plus argument mapping onto
 * captured native DSH executors. Tool search (LocalToolSearch,
 * DeferredToolCall) lives in src/toolsearch/.
 */
import type { JsonRecord } from './json.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'

type Mapper = (args: JsonRecord) => JsonRecord

export interface AliasSpec {
  readonly zcodeName: string
  readonly description: string
  readonly schema: JsonRecord
  /** Native DSH tool name whose captured executor serves this alias. */
  readonly nativeName: string
  /** Map ZCode-facing args to native args; identity when shapes coincide. */
  readonly map?: Mapper
}

const identity: Mapper = args => args
const pick = (args: JsonRecord, keys: readonly string[]): JsonRecord => {
  const out: JsonRecord = {}
  for (const key of keys) if (args[key] !== undefined) out[key] = args[key]
  return out
}

export const aliasSpecs: readonly AliasSpec[] = [
  {
    zcodeName: 'Read',
    nativeName: 'read',
    description: 'Reads a file from the local filesystem. Supports reading text files, images (PNG, JPG, GIF, WebP), PDFs, and DOCX files. Can read up to 5 files at once. Files larger than 2000 lines will be paginated. Auto-detects images by extension and returns them as image content blocks.',
    schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to read' },
        offset: { type: 'number', description: 'Starting line number (1-based, for pagination)' },
        limit: { type: 'number', description: 'Number of lines to read' },
      },
      required: ['file_path'],
    },
    map: args => pick(args, ['file_path', 'offset', 'limit']),
  },
  {
    zcodeName: 'Write',
    nativeName: 'write',
    description: 'Writes a file to the local filesystem. Reads the file first if it exists to check for conflicts. VERY IMPORTANT: You MUST provide the complete final content without any placeholders or omissions. You can write multiple files in a single operation. When writing to files, use UTF-8 encoding without a BOM unless explicitly requested otherwise.',
    schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'The absolute path to the file to write' },
        content: { type: 'string', description: 'The content to write to the file' },
      },
      required: ['file_path', 'content'],
    },
    map: identity,
  },
  {
    zcodeName: 'Edit',
    nativeName: 'edit',
    description: 'Edits a file by replacing text. You must provide the exact text to replace (old_string) and the new text (new_string). The old_string must match exactly one location in the file unless replace_all is true. Prefer this tool for targeted edits over rewriting whole files.',
    schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to edit' },
        old_string: { type: 'string', description: 'Text to replace (must be unique unless replace_all)' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
        expected_replacements: { type: 'number', description: 'Expected number of replacements (for validation)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    map: args => pick(args, ['file_path', 'old_string', 'new_string', 'replace_all']),
  },
  {
    zcodeName: 'Glob',
    nativeName: 'glob',
    description: 'Fast file pattern matching tool. Supports glob patterns like `**/*.js` to find files by name patterns. Also matches file content by putting the pattern in /pattern/ format (e.g. `**/*.js:/TODO/` matches .js files containing TODO). Returns matching file paths sorted by modification time. Supports the `ip` (ignored paths) parameter to exclude directories like .git, node_modules, and build directories.',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The glob pattern to match files against' },
        ip: { type: 'string', description: 'Comma-separated directory names to exclude (default: .git, node_modules, dist, build)' },
      },
      required: ['pattern'],
    },
    // The ZCode-facing schema declares `ip` (ignored paths); the native DSH
    // glob has no such parameter, so only the shared `pattern` maps through.
    map: args => pick(args, ['pattern']),
  },
  {
    zcodeName: 'Grep',
    nativeName: 'grep',
    description: 'Search file contents using regular expressions. Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+"). Searches across files in the working directory. Returns matching lines with file paths and line numbers. Can filter results with path pattern. Maximum 200 results.',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The regular expression pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in (default: working directory)' },
        include: { type: 'string', description: 'Glob pattern to filter files (eg. "*.ts")' },
      },
      required: ['pattern'],
    },
    map: args => pick(args, ['pattern', 'path', 'include']),
  },
  {
    zcodeName: 'Bash',
    nativeName: 'pwsh',
    description: 'Executes a PowerShell command in a fresh pwsh process per call; state does NOT persist between calls, so pass working_dir explicitly and set environment variables in the same command that uses them. Commands have a default timeout of 300 seconds (configurable). Use this tool for running tests, installs, builds, git operations, and other shell tasks. For read/write/file operations prefer dedicated tools. You can run commands in the background using the run_in_background parameter; for those commands, stdout and stderr are captured and available when you check their output.',
    schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The PowerShell command to execute' },
        description: { type: 'string', description: 'Description of what this command does (for logging)' },
        timeout: { type: 'number', description: 'Optional timeout in seconds (max 600)' },
        run_in_background: { type: 'boolean', description: 'Run command in background (default false)' },
        working_dir: { type: 'string', description: 'Working directory for the command (state does not persist; pass it every time)' },
      },
      required: ['command'],
    },
    // Localized fact (ledger ⑥): the host shell is always pwsh, so the ZCode
    // `shell` parameter is dropped from the schema; `timeout` seconds become
    // timeoutMs, `working_dir` becomes workdir.
    map: (args) => {
      const out = pick(args, ['command', 'description', 'run_in_background'])
      // ZCode's `description` is optional; the DSH pwsh executor rejects a
      // missing or blank one, so the shim derives it from the command.
      if (typeof out.description !== 'string' || out.description.trim().length === 0) {
        const firstLine = typeof args.command === 'string' ? args.command.trim().split('\n')[0] ?? '' : ''
        out.description = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine || 'Run command'
      }
      if (typeof args.working_dir === 'string') out.workdir = args.working_dir
      if (typeof args.timeout === 'number') out.timeoutMs = args.timeout * 1000
      return out
    },
  },
]

/** Native names the dialect hides once aliases cover them. */
export const hiddenNatives: readonly string[] = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'todo_write']

/** Build a ZCode-facing alias tool delegating to a captured native executor. */
export function buildAlias(spec: AliasSpec, nativeExecute: (args: JsonRecord, exec: unknown) => Promise<unknown>, nativeOutput?: ToolDefinitionLike['output']): ToolDefinitionLike {
  return {
    name: spec.zcodeName,
    description: spec.description,
    parameters: spec.schema,
    // Reuse the captured native's output contract so pass-through results
    // validate against the same schema the native itself would answer to.
    output: nativeOutput ?? { schema: { type: 'object' }, render: () => [{ type: 'text', text: `${spec.zcodeName} ok` }] },
    async execute(args, exec) {
      const mapped = spec.map === undefined ? args as JsonRecord : spec.map(args as JsonRecord)
      return nativeExecute(mapped, exec)
    },
  }
}
