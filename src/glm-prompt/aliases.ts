/**
 * Alias surface: ZCode-facing tools over the rc.3 natives they stand in for
 * on GLM requests, with argument mapping. Read (two natives) lives in
 * read-alias.ts, the Glob and Grep shims in search-alias.ts, and TodoWrite in
 * todowrite.ts; tool search (LocalToolSearch, DeferredToolCall) lives in
 * src/toolsearch/.
 *
 * Every alias carries the ZCode 3.16.3 description and schema
 * (zcode-tool-text.ts) and the shims honor what those promise
 * (docs/DESIGN.md §5.4). Grep and Bash are localized compositions: their
 * verbatim pieces live in the mirror file, and the parts the natives cannot
 * honor are dropped or rewritten here and in search-alias.ts.
 */
import type { JsonRecord, JsonValue } from '../shared/json.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import { buildReadAlias, READ_IMAGE_NATIVE, READ_NATIVE } from './read-alias.ts'
import { globResultText, GREP_DESCRIPTION, GREP_SCHEMA, grepNativeCalls, grepResultText, runGrep } from './search-alias.ts'
import {
  BASH_BACKGROUND_LINE,
  BASH_COMMAND_OUTPUT_LINE,
  BASH_DESCRIPTION_LINES,
  BASH_INPUT_SCHEMA,
  BASH_SHELL_LINE,
  BASH_WORKDIR_LINE,
  EDIT_DESCRIPTION,
  EDIT_INPUT_SCHEMA,
  editResultText,
  GLOB_DESCRIPTION,
  GLOB_INPUT_SCHEMA,
  SEMANTIC_FALSE,
  SEMANTIC_TRUE,
  WRITE_DESCRIPTION,
  WRITE_INPUT_SCHEMA,
  writeResultText,
} from './zcode-tool-text.ts'

type Mapper = (args: JsonRecord) => JsonRecord

export interface AliasSpec {
  readonly zcodeName: string
  /** The description GLM sees; a function when it depends on what the native declares. */
  readonly description: string | ((native: ToolDefinitionLike) => string)
  /** The input schema GLM sees; a function when it depends on what the native declares. */
  readonly schema: JsonRecord | ((native: ToolDefinitionLike) => JsonRecord)
  /**
   * The description and schema are localized compositions, not verbatim
   * claims; the mirror file holds their verbatim pieces, which the verbatim
   * gate checks instead (scripts/check-verbatim.mjs).
   */
  readonly localized?: true
  /** Native DSH tool name whose definition serves this alias. */
  readonly nativeName: string
  /** Map ZCode-facing args to native args; identity when shapes coincide. */
  readonly map?: Mapper
  /**
   * The native's sandbox escalation fields join the schema and pass through
   * when the native declares them (rc.3 write, edit and pwsh under a
   * confining executor).
   */
  readonly escalation?: true
  /** How the alias calls its native, from the model's own arguments; default: once with the mapped arguments. */
  readonly run?: (native: ToolDefinitionLike, args: JsonRecord, exec: unknown) => Promise<unknown>
  /** ZCode's result text from the model's own arguments and the native value; undefined falls back to the native render. */
  readonly resultText?: (args: JsonRecord, value: unknown) => string | undefined
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
const isString = (value: JsonValue): value is string => typeof value === 'string'

/** Whether the native declares a parameter (rc.3 natives declare optional capabilities only when the composition offers them). */
const declares = (native: ToolDefinitionLike, field: string): boolean => {
  const properties = native.parameters.properties
  return isRecord(properties) && isRecord(properties[field])
}

/**
 * DSH sandbox escalation (dsh-tool-fs FsSandboxController.schemaFields,
 * dsh-tool-pwsh): a sandbox denial tells the model to retry with these
 * fields, so an alias over a native that declares them must declare and
 * forward them too.
 */
const ESCALATION_FIELDS = ['sandbox_permissions', 'justification']

/** ZCode's semantic boolean (contracts edit.ts and bash.ts `semanticBoolean`); other values pass through for the native to reject. */
export function semanticBoolean(value: JsonValue): JsonValue {
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : value
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase()
  if (SEMANTIC_TRUE.includes(normalized)) return true
  if (SEMANTIC_FALSE.includes(normalized)) return false
  return value
}

/** ZCode's semantic number (contracts bash.ts `semanticNumber`): a numeric string becomes its number; other values pass through. */
export function semanticNumber(value: JsonValue): JsonValue {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed.length === 0) return value
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : value
}

/** The file path ZCode's results name: the model's own `file_path` (Write/Edit output `filePath`). */
const resultPath = (args: JsonRecord, value: JsonRecord): string | undefined =>
  typeof args.file_path === 'string' ? args.file_path : typeof value.path === 'string' ? value.path : undefined

/**
 * Bash lines the DSH pwsh executor makes untrue, with their localized
 * rewrites: the shell is PowerShell, and every call runs
 * `pwsh -NoProfile` as a fresh process in the session working directory
 * (dsh-tool-pwsh, dsh-pwsh-local), so neither `cd` nor the user's profile
 * carries over.
 */
const BASH_LOCALIZED_LINES: ReadonlyMap<string, string> = new Map([
  [BASH_SHELL_LINE, 'Executes a PowerShell command and returns its output.'],
  [BASH_WORKDIR_LINE, "- Working directory does not persist between calls: each call starts a fresh process in the session working directory, so prefer absolute paths. Shell state (env vars, functions) does not persist; the shell starts without the user's profile."],
])

/**
 * The Bash description GLM sees over pwsh; the background line only when
 * the native offers background runs. The 3.17.1 line saying command output
 * reaches the model, not reliably the user, is left out: the DSH Web GUI
 * shows every tool result to the user (docs/DESIGN.md §5.4).
 */
export function bashDescription(background: boolean): string {
  return BASH_DESCRIPTION_LINES
    .filter(line => line !== BASH_COMMAND_OUTPUT_LINE && (background || line !== BASH_BACKGROUND_LINE))
    .map(line => BASH_LOCALIZED_LINES.get(line) ?? line)
    .join('\n')
}

/**
 * The Bash schema GLM sees over pwsh: ZCode's, without
 * `dangerouslyDisableSandbox` (DSH widens the sandbox only through the
 * native's approval-gated escalation fields, appended when declared) and,
 * when the native offers no background runs, without `run_in_background`.
 */
export function bashSchema(background: boolean): JsonRecord {
  const properties: JsonRecord = {}
  for (const [key, value] of Object.entries(BASH_INPUT_SCHEMA.properties as JsonRecord)) {
    if (key === 'dangerouslyDisableSandbox' || (key === 'run_in_background' && !background)) continue
    properties[key] = value
  }
  return { ...BASH_INPUT_SCHEMA, properties }
}

/** Map ZCode Bash arguments to the native `pwsh` arguments. */
function mapBashArgs(args: JsonRecord): JsonRecord {
  const out = pick(args, ['command', 'description'])
  // ZCode's `description` is optional; the DSH pwsh executor rejects a
  // missing or blank one, so the shim derives it from the command.
  if (typeof out.description !== 'string' || out.description.trim().length === 0) {
    const firstLine = typeof args.command === 'string' ? args.command.trim().split('\n')[0] ?? '' : ''
    out.description = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine || 'Run command'
  }
  // ZCode runs `timeout || default` capped at the maximum
  // (resolveBashTimeoutMs). The executor applies the same default and cap
  // to an omitted or larger timeoutMs but rejects 0, so 0 is omitted.
  if (args.timeout !== undefined) {
    const timeout = semanticNumber(args.timeout)
    if (timeout !== 0) out.timeoutMs = timeout
  }
  if (args.run_in_background !== undefined) out.run_in_background = semanticBoolean(args.run_in_background)
  return out
}

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
      if (!isRecord(value)) return undefined
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
      const path = isRecord(value) ? resultPath(args, value) : undefined
      return path === undefined ? undefined : editResultText(path, args.replace_all !== undefined && semanticBoolean(args.replace_all) === true)
    },
  },
  {
    zcodeName: 'Glob',
    nativeName: 'glob',
    description: GLOB_DESCRIPTION,
    schema: GLOB_INPUT_SCHEMA,
    // ZCode trims the pattern before matching (adapters fs searchFiles).
    map: (args) => {
      const out = pick(args, ['pattern', 'path'])
      if (typeof out.pattern === 'string') out.pattern = out.pattern.trim()
      return out
    },
    resultText: (_args, value) => {
      const paths = isRecord(value) ? value.paths : undefined
      return Array.isArray(paths) && paths.every(isString) ? globResultText(paths) : undefined
    },
  },
  {
    zcodeName: 'Grep',
    nativeName: 'grep',
    localized: true,
    description: GREP_DESCRIPTION,
    schema: GREP_SCHEMA,
    // Projections and the fallback render see the first native call.
    map: args => grepNativeCalls(args)[0] ?? {},
    run: runGrep,
    resultText: grepResultText,
  },
  {
    zcodeName: 'Bash',
    nativeName: 'pwsh',
    localized: true,
    description: native => bashDescription(declares(native, 'run_in_background')),
    schema: native => bashSchema(declares(native, 'run_in_background')),
    map: mapBashArgs,
    escalation: true,
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
 * native arguments, so they see the mapped call, while ZCode's result text
 * reads the model's own arguments.
 */
export function buildAlias(spec: AliasSpec, native: ToolDefinitionLike): ToolDefinitionLike {
  const escalation = spec.escalation === true ? escalationProperties(native) : {}
  const escalationKeys = Object.keys(escalation)
  const map = spec.map ?? identity
  const input = (args: unknown): JsonRecord => isRecord(args) ? args : {}
  const mapped = (args: unknown): JsonRecord => ({ ...map(input(args)), ...pick(input(args), escalationKeys) })
  const output = native.output
  const presentationMeta = output.presentationMeta
  const { resultText, run } = spec
  return {
    name: spec.zcodeName,
    description: typeof spec.description === 'string' ? spec.description : spec.description(native),
    parameters: withEscalation(typeof spec.schema === 'function' ? spec.schema(native) : spec.schema, escalation),
    output: {
      schema: output.schema,
      render(args, value) {
        const text = resultText?.(input(args), value)
        return text === undefined ? output.render(mapped(args), value) : [{ type: 'text', text }]
      },
      ...(presentationMeta === undefined ? {} : { presentationMeta: (args: unknown, value: unknown) => presentationMeta.call(output, mapped(args), value) }),
    },
    async execute(args, exec) {
      return run === undefined ? native.execute(mapped(args), exec) : run(native, input(args), exec)
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
