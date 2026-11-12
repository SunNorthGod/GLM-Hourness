/**
 * Command candidates read out of a project's own files (takeover design 0.6
 * §3.3, "抽取"). Pure functions: the input is a file's text and its
 * repository-relative path, the output is the commands it names, each with
 * the file and line it came from. Nothing here runs or loads a project file.
 *
 * JSON is read with `JSON.parse`; TOML and YAML are not parsed as a whole,
 * only line by line for the few shapes a command sits in (a `run:` or
 * `script:` value, a list item under one, a `[table]` key with a string
 * value). A block scalar (`|`, `>`) is a multi-line script: the candidate
 * keeps its first line as `text`, its first and last line numbers, and is
 * judged for danger over every line; it is never tried out (§6.1
 * condition 4). A file that cannot be read this way is reported, not
 * guessed at.
 */
import { createHash } from 'node:crypto'
import { dangerOf, longRunningOf } from './danger.ts'

/** Where a candidate was read from (§3.3). */
type CandidateOrigin = 'manifest' | 'ci' | 'task-file' | 'hook-tool'

/** What a candidate does, by its name (§3.3). */
type CandidateKind = 'setup' | 'build' | 'test' | 'lint' | 'typecheck' | 'format-check' | 'other'

interface CandidateSource {
  readonly file: string
  /** 1-based. */
  readonly line: number
  /** The last line of a multi-line script. */
  readonly endLine?: number
}

/**
 * One command a project names (§3.3). `text` is the line to run, verbatim
 * from the file (npm-style scripts become `<package manager> run <name>`,
 * `test` becomes `<package manager> test`); `id` is the first 12 hex
 * digits of its SHA-256. `name` is the script, target or hook name when
 * there is one, `expanded` the script bodies it reaches (§3.3: used for the
 * danger and cost judgements, never run). `danger` is what marks it as
 * publishing or deploying, null when nothing does.
 */
export interface CommandCandidate {
  readonly id: string
  readonly text: string
  readonly source: CandidateSource
  readonly origin: CandidateOrigin
  readonly kind: CandidateKind
  readonly multiline: boolean
  readonly danger: string | null
  readonly longRunning: boolean
  readonly name?: string
  readonly expanded?: readonly string[]
}

/** The longest candidate text kept (§12); longer ones, and ones with a NUL, are left out. */
const CANDIDATE_TEXT_LIMIT = 500
/** How deep the npm-style script expansion follows `npm run x` (§3.3). */
const EXPANSION_DEPTH = 4

/** A file that did not read as its kind of file. */
export interface Unreadable {
  readonly file: string
  readonly reason: string
}

export interface Extracted {
  readonly candidates: readonly CommandCandidate[]
  readonly unreadable?: Unreadable
}

const idOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12)

function tokensOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 0)
}

/** The kind of a command by its name, or by its text when it has none (§3.3). */
export function kindOf(name: string): CandidateKind {
  const lower = name.toLowerCase()
  const tokens = tokensOf(name)
  const has = (...words: string[]): boolean => tokens.some(token => words.includes(token))
  const starts = (...words: string[]): boolean => tokens.some(token => words.some(word => token.startsWith(word)))
  if ((starts('format', 'fmt') || lower.includes('prettier')) && (has('check') || lower.includes('--check'))) return 'format-check'
  if (has('typecheck', 'tsc', 'mypy', 'pyright') || (starts('type') && has('check'))) return 'typecheck'
  if (starts('lint', 'eslint', 'stylelint') || has('clippy', 'vet', 'ruff', 'flake8', 'pylint', 'golangci', 'shellcheck')) return 'lint'
  if (starts('test') || has('pytest', 'jest', 'vitest', 'mocha', 'ctest', 'e2e', 'spec')) return 'test'
  if (has('build', 'compile', 'bundle')) return 'build'
  if (has('install', 'ci', 'sync', 'fetch', 'download')) return 'setup'
  return 'other'
}

interface Draft {
  readonly text: string
  readonly line: number
  readonly endLine?: number
  readonly name?: string
  readonly expanded?: readonly string[]
  /** Every line of a multi-line script, for the danger judgement. */
  readonly lines?: readonly string[]
}

function candidateOf(file: string, origin: CandidateOrigin, draft: Draft): CommandCandidate | undefined {
  const text = draft.text.trim()
  if (text.length === 0 || text.length > CANDIDATE_TEXT_LIMIT || text.includes('\0') || /[\r\n]/.test(text)) return undefined
  const multiline = draft.lines !== undefined
  const expanded = draft.expanded ?? draft.lines
  const context = {
    ...(draft.name === undefined ? {} : { name: draft.name }),
    ...(expanded === undefined ? {} : { expanded }),
  }
  return {
    id: idOf(text),
    text,
    source: { file, line: draft.line, ...(draft.endLine === undefined ? {} : { endLine: draft.endLine }) },
    origin,
    kind: kindOf(draft.name ?? text),
    multiline,
    danger: dangerOf(text, context) ?? null,
    longRunning: longRunningOf(text, context),
    ...(draft.name === undefined ? {} : { name: draft.name }),
    ...(draft.expanded === undefined ? {} : { expanded: draft.expanded }),
  }
}

function collect(file: string, origin: CandidateOrigin, drafts: readonly Draft[]): CommandCandidate[] {
  const seen = new Set<string>()
  const out: CommandCandidate[] = []
  for (const draft of drafts) {
    const candidate = candidateOf(file, origin, draft)
    if (candidate === undefined) continue
    const key = `${candidate.id}:${candidate.source.line}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(candidate)
  }
  return out
}

// ---------------------------------------------------------------- JSON manifests

/** The package managers whose scripts are run as `<manager> run <name>`. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The 1-based line of the key `key` inside the object that starts at the key `container`; the container's line when not found (one-line JSON). */
function keyLine(lines: readonly string[], container: string, key: string): number {
  const start = lines.findIndex(line => line.includes(`"${container}"`))
  if (start < 0) return 1
  const quoted = JSON.stringify(key)
  for (let index = start; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trimStart()
    if (trimmed.startsWith(quoted) && /^\s*:/.test(trimmed.slice(quoted.length))) return index + 1
  }
  return start + 1
}

/** The scripts a script body runs by name (`npm run x`, `pnpm x`, `yarn x`, `bun run x`). */
function referencedScripts(body: string, scripts: Readonly<Record<string, string>>): string[] {
  const names: string[] = []
  for (const match of body.matchAll(/\b(?:npm\s+run(?:-script)?|pnpm(?:\s+run)?|yarn(?:\s+run)?|bun\s+run)\s+([A-Za-z0-9_:.@/-]+)/g)) {
    const name = match[1] ?? ''
    if (name in scripts) names.push(name)
  }
  return names
}

/** The bodies a script reaches: its own, its `pre`/`post` scripts, and the scripts they run by name, at most four levels (§3.3). */
function expansionOf(name: string, scripts: Readonly<Record<string, string>>): string[] {
  const bodies: string[] = []
  const visited = new Set<string>()
  let level = [name]
  for (let depth = 0; depth < EXPANSION_DEPTH && level.length > 0; depth += 1) {
    const next: string[] = []
    for (const current of level) {
      for (const each of [`pre${current}`, current, `post${current}`]) {
        if (visited.has(each) || !(each in scripts)) continue
        visited.add(each)
        const body = scripts[each] ?? ''
        bodies.push(body)
        next.push(...referencedScripts(body, scripts))
      }
    }
    level = next
  }
  return bodies
}

function stringEntries(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/**
 * The scripts of a `package.json` as candidates, and its package manager
 * (`packageManager` first, then the lock file the caller saw). `bun test`
 * is bun's own test runner, not the `test` script, so bun's `test` stays
 * `bun run test`.
 */
export function packageJsonCandidates(text: string, file: string, manager: PackageManager): Extracted {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { candidates: [], unreadable: { file, reason: '读不懂：不是合法的 JSON' } }
  }
  if (!isRecord(parsed)) return { candidates: [], unreadable: { file, reason: '读不懂：不是一个 JSON 对象' } }
  const scripts = stringEntries(parsed.scripts)
  const lines = text.split(/\r?\n/)
  const drafts = Object.keys(scripts).map((name): Draft => ({
    text: name === 'test' && manager !== 'bun' ? `${manager} test` : `${manager} run ${name}`,
    line: keyLine(lines, 'scripts', name),
    name,
    expanded: expansionOf(name, scripts),
  }))
  return { candidates: collect(file, 'manifest', drafts) }
}

/** The package manager a `package.json` names in `packageManager`, else the one its lock file belongs to, else npm. */
export function packageManagerOf(packageJson: string | undefined, lockFiles: readonly string[]): PackageManager {
  try {
    const parsed: unknown = packageJson === undefined ? undefined : JSON.parse(packageJson)
    const named = isRecord(parsed) && typeof parsed.packageManager === 'string' ? parsed.packageManager.split('@')[0] : undefined
    if (named === 'pnpm' || named === 'yarn' || named === 'bun' || named === 'npm') return named
  }
  catch {
    // An unreadable package.json is reported by packageJsonCandidates; the lock file decides here.
  }
  if (lockFiles.includes('pnpm-lock.yaml')) return 'pnpm'
  if (lockFiles.includes('yarn.lock')) return 'yarn'
  if (lockFiles.includes('bun.lockb') || lockFiles.includes('bun.lock')) return 'bun'
  return 'npm'
}

/** The directory patterns a `package.json` declares as workspaces (`["packages/*"]` or `{packages: [...]}`). */
export function packageWorkspaces(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) return []
    const field = parsed.workspaces
    const list: unknown = isRecord(field) ? field.packages : field
    return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : []
  }
  catch {
    return []
  }
}

/** The tasks of a `deno.json` as `deno task <name>`. */
export function denoCandidates(text: string, file: string): Extracted {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { candidates: [], unreadable: { file, reason: '读不懂：不是合法的 JSON' } }
  }
  const tasks = isRecord(parsed) ? stringEntries(parsed.tasks) : {}
  const lines = text.split(/\r?\n/)
  const drafts = Object.entries(tasks).map(([name, body]): Draft => ({ text: `deno task ${name}`, line: keyLine(lines, 'tasks', name), name, expanded: [body] }))
  return { candidates: collect(file, 'manifest', drafts) }
}

// ---------------------------------------------------------------- line-based TOML

/** A TOML string value on one line: basic (`"…"`, with `\"` and `\\`) or literal (`'…'`). */
function tomlString(value: string): string | undefined {
  const basic = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(value)
  if (basic !== null) return (basic[1] ?? '').replace(/\\(["\\])/g, '$1')
  const literal = /^'([^']*)'\s*(?:#.*)?$/.exec(value)
  return literal === null ? undefined : literal[1]
}

/** The `[table]` headers of a TOML text, in order, without the brackets. */
export function tomlTables(text: string): string[] {
  return [...text.matchAll(/^\s*\[(?!\[)\s*([^\]]+?)\s*\]\s*(?:#.*)?$/gm)].map(match => match[1] ?? '')
}

/** How a pyproject task table runs one of its keys. */
function pyprojectRunner(table: string): ((name: string) => string) | undefined {
  if (table === 'tool.poe.tasks') return name => `poe ${name}`
  if (table === 'tool.pdm.scripts') return name => `pdm run ${name}`
  if (table === 'tool.taskipy.tasks') return name => `task ${name}`
  const hatch = /^tool\.hatch\.envs\.([A-Za-z0-9_-]+)\.scripts$/.exec(table)
  if (hatch !== null) return name => (hatch[1] === 'default' ? `hatch run ${name}` : `hatch run ${hatch[1]}:${name}`)
  return undefined
}

/**
 * The tasks of a `pyproject.toml` (poethepoet, PDM, taskipy, Hatch): a key
 * with a string value in a task table, or a `[<task table>.<name>]` table
 * with a `cmd` or `shell` string.
 */
export function pyprojectCandidates(text: string, file: string): Extracted {
  const drafts: Draft[] = []
  let table = ''
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const header = /^\s*\[(?!\[)\s*([^\]]+?)\s*\]/.exec(raw)
    if (header !== null) {
      table = header[1] ?? ''
      continue
    }
    const pair = /^\s*("?)([A-Za-z0-9_.-]+)\1\s*=\s*(.+)$/.exec(raw)
    if (pair === null) continue
    const value = tomlString((pair[3] ?? '').trim())
    if (value === undefined) continue
    const key = pair[2] ?? ''
    const direct = pyprojectRunner(table)
    if (direct !== undefined) {
      drafts.push({ text: direct(key), line: index + 1, name: key, expanded: [value] })
      continue
    }
    const nested = /^(.*)\.([A-Za-z0-9_-]+)$/.exec(table)
    const runner = nested === null ? undefined : pyprojectRunner(nested[1] ?? '')
    if (runner !== undefined && (key === 'cmd' || key === 'shell')) drafts.push({ text: runner(nested?.[2] ?? ''), line: index + 1, name: nested?.[2] ?? '', expanded: [value] })
  }
  return { candidates: collect(file, 'manifest', drafts) }
}

/** The members a Cargo workspace lists on one line (`members = ["a", "b/*"]`). */
export function cargoMembers(text: string): string[] {
  const line = /^\s*members\s*=\s*\[([^\]]*)\]/m.exec(text)
  return line === null ? [] : [...(line[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1] ?? '')
}

// ---------------------------------------------------------------- line-based YAML

const indentOf = (line: string): number => /^\s*/.exec(line)?.[0].length ?? 0
const blankOrComment = (line: string): boolean => /^\s*(?:#.*)?$/.test(line)

/** A one-line YAML scalar without its quotes and trailing comment; undefined for flow collections and empty values. */
function yamlScalar(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.startsWith('[') || trimmed.startsWith('{')) return undefined
  const single = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(trimmed)
  if (single !== null) return (single[1] ?? '').replace(/''/g, '\'')
  const double = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(trimmed)
  if (double !== null) return (double[1] ?? '').replace(/\\(["\\])/g, '$1').replace(/\\t/g, '\t')
  if (trimmed.startsWith('\'') || trimmed.startsWith('"')) return undefined
  return trimmed.replace(/\s+#.*$/, '')
}

const BLOCK = /^[|>][+-]?[1-9]?[+-]?\s*(?:#.*)?$/

/** The lines of a block scalar that starts after line `start`, deeper than `indent`: their 0-based indexes. */
function blockLines(lines: readonly string[], start: number, indent: number): number[] {
  const indexes: number[] = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim().length === 0) continue
    if (indentOf(line) <= indent) break
    indexes.push(index)
  }
  return indexes
}

function blockDraft(lines: readonly string[], indexes: readonly number[]): Draft | undefined {
  const first = indexes[0]
  const last = indexes.at(-1)
  if (first === undefined || last === undefined) return undefined
  const body = indexes.map(index => (lines[index] ?? '').trim())
  return { text: body[0] ?? '', line: first + 1, endLine: last + 1, lines: body }
}

/** The YAML keys whose value is a command. */
const RUN_KEYS = /^(\s*)(?:-\s+)?(run|script|before_script|after_script)\s*:(?:\s+(.*))?\s*$/

/**
 * The commands of a CI or hook-tool YAML file: a `run:` or `script:` value
 * on its line, every list item under an empty one, and block scalars as
 * multi-line scripts.
 */
export function yamlCandidates(text: string, file: string, origin: CandidateOrigin): Extracted {
  const lines = text.split(/\r?\n/)
  const drafts: Draft[] = []
  for (const [index, line] of lines.entries()) {
    const match = RUN_KEYS.exec(line)
    if (match === null) continue
    const indent = (match[1] ?? '').length
    const value = (match[3] ?? '').trim()
    if (value.length > 0 && !value.startsWith('#')) {
      if (BLOCK.test(value)) {
        const draft = blockDraft(lines, blockLines(lines, index, indent))
        if (draft !== undefined) drafts.push(draft)
        continue
      }
      const scalar = yamlScalar(value)
      if (scalar !== undefined) drafts.push({ text: scalar, line: index + 1 })
      continue
    }
    for (let next = index + 1; next < lines.length; next += 1) {
      const item = lines[next] ?? ''
      if (blankOrComment(item)) continue
      const listItem = /^(\s*)-\s+(.*)$/.exec(item)
      const itemIndent = indentOf(item)
      if (listItem === null || itemIndent < indent || (itemIndent === indent && !/^\s*-/.test(item))) break
      const itemValue = (listItem[2] ?? '').trim()
      if (BLOCK.test(itemValue)) {
        const draft = blockDraft(lines, blockLines(lines, next, itemIndent))
        if (draft !== undefined) drafts.push(draft)
        continue
      }
      const scalar = yamlScalar(itemValue)
      if (scalar !== undefined && !/^[A-Za-z_][\w-]*:\s/.test(scalar)) drafts.push({ text: scalar, line: next + 1 })
    }
  }
  return { candidates: collect(file, origin, drafts) }
}

/** The packages a `pnpm-workspace.yaml` lists under `packages:`. */
export function pnpmWorkspaces(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^packages\s*:\s*$/.test(line))
  if (start < 0) return []
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (blankOrComment(line)) continue
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item === null) break
    const value = yamlScalar(item[1] ?? '')
    if (value !== undefined) out.push(value)
  }
  return out
}

/** The hook ids of a `.pre-commit-config.yaml`, each as `pre-commit run <id> --all-files`. */
export function preCommitCandidates(text: string, file: string): Extracted {
  const drafts: Draft[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^\s*-?\s*id\s*:\s*(.+)$/.exec(line)
    const id = match === null ? undefined : yamlScalar(match[1] ?? '')
    if (id !== undefined && /^[A-Za-z0-9_.-]+$/.test(id)) drafts.push({ text: `pre-commit run ${id} --all-files`, line: index + 1, name: id })
  }
  return { candidates: collect(file, 'hook-tool', drafts) }
}

/** The command lines of a husky hook script (comments, the shebang and husky's own loader line left out). */
export function huskyCandidates(text: string, file: string): Extracted {
  const drafts: Draft[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.includes('husky.sh')) continue
    drafts.push({ text: trimmed, line: index + 1 })
  }
  return { candidates: collect(file, 'hook-tool', drafts) }
}

// ---------------------------------------------------------------- task files

/** The targets of a Makefile (a target at the start of a line, without `%` or `$`; dot targets left out) as `make <target>`. */
export function makefileCandidates(text: string, file: string): Extracted {
  const drafts: Draft[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^([^\s:#=%$][^:#=%$]*?)\s*::?(?!=)/.exec(line)
    if (match === null) continue
    for (const target of (match[1] ?? '').split(/\s+/)) {
      if (target.length > 0 && !target.startsWith('.') && /^[A-Za-z0-9_./-]+$/.test(target)) drafts.push({ text: `make ${target}`, line: index + 1, name: target })
    }
  }
  return { candidates: collect(file, 'task-file', drafts) }
}

/** The recipes of a justfile (a name at the start of a line, optional parameters, then `:`) as `just <name>`. */
export function justfileCandidates(text: string, file: string): Extracted {
  const drafts: Draft[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^@?([A-Za-z_][A-Za-z0-9_-]*)(?:\s+[^:=]*)?:(?!=)/.exec(line)
    if (match !== null && !['set', 'alias', 'export', 'import', 'mod'].includes(match[1] ?? '')) drafts.push({ text: `just ${match[1] ?? ''}`, line: index + 1, name: match[1] ?? '' })
  }
  return { candidates: collect(file, 'task-file', drafts) }
}

/** The keys one level under `tasks:` in a Taskfile, as `task <name>`. */
export function taskfileCandidates(text: string, file: string): Extracted {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^tasks\s*:\s*(?:#.*)?$/.test(line))
  const drafts: Draft[] = []
  if (start >= 0) {
    let childIndent: number | undefined
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      if (blankOrComment(line)) continue
      const indent = indentOf(line)
      if (indent === 0) break
      childIndent ??= indent
      const key = /^\s*([A-Za-z0-9_:.-]+)\s*:/.exec(line)
      if (indent === childIndent && key !== null) drafts.push({ text: `task ${key[1] ?? ''}`, line: index + 1, name: key[1] ?? '' })
    }
  }
  return { candidates: collect(file, 'task-file', drafts) }
}

/** The environments of a `tox.ini` (`[testenv:<name>]` sections and the `envlist` line) as `tox -e <name>`. */
export function toxCandidates(text: string, file: string): Extracted {
  const drafts: Draft[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const section = /^\s*\[testenv:([A-Za-z0-9_.-]+)\]/.exec(line)
    if (section !== null) drafts.push({ text: `tox -e ${section[1] ?? ''}`, line: index + 1, name: section[1] ?? '' })
    const list = /^\s*env_?list\s*=\s*(.+)$/.exec(line)
    for (const name of (list?.[1] ?? '').split(/[,\s]+/)) {
      if (/^[A-Za-z0-9_.-]+$/.test(name)) drafts.push({ text: `tox -e ${name}`, line: index + 1, name })
    }
  }
  return { candidates: collect(file, 'task-file', drafts) }
}

/** The sessions of a `noxfile.py` (a `def` after `@nox.session`, or the `name=` it gives) as `nox -s <name>`. Only the names, nothing of the file runs. */
export function noxCandidates(text: string, file: string): Extracted {
  const lines = text.split(/\r?\n/)
  const drafts: Draft[] = []
  for (const [index, line] of lines.entries()) {
    if (!/^\s*@nox\.session\b/.test(line)) continue
    const named = /name\s*=\s*["']([A-Za-z0-9_.-]+)["']/.exec(line)
    const def = lines.slice(index + 1, index + 6).map(next => /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(next)).find(match => match !== null)
    const name = named?.[1] ?? def?.[1]
    if (name !== undefined) drafts.push({ text: `nox -s ${name}`, line: index + 1, name })
  }
  return { candidates: collect(file, 'task-file', drafts) }
}
