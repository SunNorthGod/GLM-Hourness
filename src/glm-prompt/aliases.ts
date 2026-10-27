/**
 * Alias surface: ZCode-facing tools over the rc.3 natives they stand in for
 * on GLM requests, with argument mapping. Read (two natives) lives in
 * read-alias.ts and TodoWrite in todowrite.ts; tool search (LocalToolSearch,
 * DeferredToolCall) lives in src/toolsearch/.
 *
 * Write and Edit carry the ZCode 3.16.3 descriptions, schemas and result
 * texts (zcode-tool-text.ts); the shims honor what those promise
 * (docs/DESIGN.md §5.4). Glob, Grep and Bash still carry the texts taken from
 * docs/reference/zcode-tool-schemas.md, pending their rebuild (§5.9).
 */
import type { JsonRecord, JsonValue } from './json.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import { buildReadAlias, READ_IMAGE_NATIVE, READ_NATIVE } from './read-alias.ts'
import {
  EDIT_DESCRIPTION,
  EDIT_INPUT_SCHEMA,
  editResultText,
  SEMANTIC_FALSE,
  SEMANTIC_TRUE,
  WRITE_DESCRIPTION,
  WRITE_INPUT_SCHEMA,
  writeResultText,
} from './zcode-tool-text.ts'

type Mapper = (args: JsonRecord) => JsonRecord

export interface AliasSpec {
  readonly zcodeName: string
  readonly description: string
  readonly schema: JsonRecord
  /** Native DSH tool name whose definition serves this alias. */
  readonly nativeName: string
  /** Map ZCode-facing args to native args; identity when shapes coincide. */
  readonly map?: Mapper
  /**
   * The native's sandbox escalation fields join the schema and pass through
   * when the native declares them (rc.3 write and edit under a confining
   * filesystem).
   */
  readonly escalation?: true
  /** ZCode's result text for a native value of the expected shape; otherwise the native render. */
  readonly resultText?: (args: JsonRecord, value: JsonRecord) => string | undefined
}

/** One alias and the natives it stands in for (hidden from GLM requests). */
export interface BuiltAlias {
  readonly tool: ToolDefinitionLike
  readonly covers: readonly string[]
}

const identity: Mapper = args => args
const pick = (args: JsonRecord, keys: readonly string[]): JsonRecord => {
  const out: JsonRecord = {}
  for (const key of keys) if (args[key] !== undefined) out[key] = args[key]
  return out
}
const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * DSH sandbox escalation (dsh-tool-fs FsSandboxController.schemaFields): a
 * sandbox denial tells the model to retry with these fields, so an alias over
 * a native that declares them must declare and forward them too.
 */
const ESCALATION_FIELDS = ['sandbox_permissions', 'justification']

/** ZCode's semantic boolean (contracts edit.ts `semanticBoolean`); other values pass through for the native to reject. */
export function semanticBoolean(value: JsonValue): JsonValue {
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : value
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase()
  if (SEMANTIC_TRUE.includes(normalized)) return true
  if (SEMANTIC_FALSE.includes(normalized)) return false
  return value
}

/** The file path ZCode's results name: the model's own `file_path` (Write/Edit output `filePath`). */
const resultPath = (args: JsonRecord, value: JsonRecord): string | undefined =>
  typeof args.file_path === 'string' ? args.file_path : typeof value.path === 'string' ? value.path : undefined

export const aliasSpecs: readonly AliasSpec[] = [
  {
    zcodeName: 'Write',
    nativeName: 'write',
    description: WRITE_DESCRIPTION,
    schema: WRITE_INPUT_SCHEMA,
    // "Overwriting an existing file you haven't Read will fail" holds under
    // the default fs-observation-policy: an unseen target writes as
    // create-if-absent and the provider refuses an existing file.
    map: args => pick(args, ['file_path', 'content']),
    escalation: true,
    resultText: (args, value) => {
      const path = resultPath(args, value)
      return path === undefined || (value.operation !== 'create' && value.operation !== 'update') ? undefined : writeResultText(path, value.operation === 'create')
    },
  },
  {
    zcodeName: 'Edit',
    nativeName: 'edit',
    description: EDIT_DESCRIPTION,
    schema: EDIT_INPUT_SCHEMA,
    // The native takes a strict boolean and, like ZCode, defaults to false.
    map: (args) => {
      const out = pick(args, ['file_path', 'old_string', 'new_string'])
      if (args.replace_all !== undefined) out.replace_all = semanticBoolean(args.replace_all)
      return out
    },
    escalation: true,
    resultText: (args, value) => {
      const path = resultPath(args, value)
      return path === undefined ? undefined : editResultText(path, args.replace_all === true)
    },
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

/** The native's escalation property schemas, in declaration order (empty when it declares none). */
function escalationProperties(native: ToolDefinitionLike): JsonRecord {
  const properties = native.parameters.properties
  const out: JsonRecord = {}
  if (!isRecord(properties)) return out
  for (const field of ESCALATION_FIELDS) if (isRecord(properties[field])) out[field] = properties[field]
  return out
}

/** The ZCode schema with the native's escalation fields appended to its properties. */
function withEscalation(schema: JsonRecord, extra: JsonRecord): JsonRecord {
  if (Object.keys(extra).length === 0 || !isRecord(schema.properties)) return schema
  return { ...schema, properties: { ...schema.properties, ...extra } }
}

/**
 * Build a ZCode-facing alias over one native definition. The native's output
 * contract validates the value the native returns; its projections expect
 * native arguments, so they see the mapped call.
 */
export function buildAlias(spec: AliasSpec, native: ToolDefinitionLike): ToolDefinitionLike {
  const escalation = spec.escalation === true ? escalationProperties(native) : {}
  const escalationKeys = Object.keys(escalation)
  const map = spec.map ?? identity
  const mapped = (args: unknown): JsonRecord => {
    const input = isRecord(args) ? args : {}
    return { ...map(input), ...pick(input, escalationKeys) }
  }
  const output = native.output
  const presentationMeta = output.presentationMeta
  const resultText = spec.resultText
  return {
    name: spec.zcodeName,
    description: spec.description,
    parameters: withEscalation(spec.schema, escalation),
    output: {
      schema: output.schema,
      render(args, value) {
        const text = resultText !== undefined && isRecord(value) ? resultText(mapped(args), value) : undefined
        return text === undefined ? output.render(mapped(args), value) : [{ type: 'text', text }]
      },
      ...(presentationMeta === undefined ? {} : { presentationMeta: (args: unknown, value: unknown) => presentationMeta.call(output, mapped(args), value) }),
    },
    async execute(args, exec) {
      return native.execute(mapped(args), exec)
    },
  }
}

/**
 * Build the ZCode-facing aliases over the natives a scope resolves. An alias
 * whose native is absent in this composition is skipped and covers nothing;
 * Read covers `read_image` only when it was built over it.
 */
export function buildAliases(lookup: (name: string) => ToolDefinitionLike | undefined): BuiltAlias[] {
  const aliases: BuiltAlias[] = []
  const read = lookup(READ_NATIVE)
  if (read !== undefined) {
    const readImage = lookup(READ_IMAGE_NATIVE)
    aliases.push({ tool: buildReadAlias(read, readImage), covers: readImage === undefined ? [READ_NATIVE] : [READ_NATIVE, READ_IMAGE_NATIVE] })
  }
  for (const spec of aliasSpecs) {
    const native = lookup(spec.nativeName)
    if (native !== undefined) aliases.push({ tool: buildAlias(spec, native), covers: [spec.nativeName] })
  }
  return aliases
}
