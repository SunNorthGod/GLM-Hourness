/**
 * ZCode Glob and Grep over the rc.3 natives `glob` and `grep`
 * (reference/dsh-desktop-0.2.1-rc.3/dsh-tool-fs-search). Texts and schemas
 * come from the 3.16.3 mirror (zcode-tool-text.ts); this module keeps them
 * true on DSH (docs/DESIGN.md §5.3 ⑥, §5.4):
 * - both results render in ZCode's form: workdir-relative paths with `/`
 *   separators (toDisplayPath), Glob newest first (the native lists oldest
 *   first, `rg --sort=modified`) capped at ZCode's 100 paths, Grep through
 *   ZCode's output modes and `head_limit` / `offset` pagination over the
 *   native's complete match list;
 * - Grep's `-i` becomes ripgrep's inline `(?i)` flag on the pattern, and
 *   `glob` / `type` become the native `include` the way ZCode turns them into
 *   `--glob` filters (whitespace and comma lists, ZCode's file-type table),
 *   one native call per filter with the matches merged, as one ripgrep run
 *   with several positive globs matches a file any of them matches;
 * - the native passes no context, only-matching or multiline flags to
 *   ripgrep, so `-A`, `-B`, `-C`, `context`, `-o` and `multiline` leave the
 *   schema, the multiline line leaves the description, and the
 *   `output_mode` description drops its context clause.
 */
import { isAbsolute, sep } from 'node:path'
import type { JsonRecord } from '../shared/json.ts'
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import {
  GLOB_MAX_RESULTS,
  globModelContent,
  GREP_DEFAULT_HEAD_LIMIT,
  GREP_DESCRIPTION_LINES,
  GREP_INPUT_SCHEMA,
  GREP_MULTILINE_LINE,
  grepModelContent,
} from './zcode-tool-text.ts'

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

/** ZCode's display path (core glob.ts / grep.ts toDisplayPath): a workdir-relative path with `/` separators; an absolute one unchanged. */
export function zcodeDisplayPath(path: string): string {
  return isAbsolute(path) ? path : path.split(sep).join('/')
}

/** ZCode's Glob result over the native path list (oldest first): newest first, at most GLOB_MAX_RESULTS. */
export function globResultText(paths: readonly string[]): string {
  const newestFirst = [...paths].reverse()
  return globModelContent(newestFirst.slice(0, GLOB_MAX_RESULTS).map(zcodeDisplayPath), newestFirst.length > GLOB_MAX_RESULTS)
}

/** Grep parameters the native cannot honor: they need ripgrep flags the native never passes. */
const GREP_UNSUPPORTED: ReadonlySet<string> = new Set(['-B', '-A', '-C', 'context', '-o', 'multiline'])

/** The `output_mode` description without the context flags it cannot offer (localized rewrite). */
const GREP_OUTPUT_MODE_DESCRIPTION = 'Output mode: "content" shows matching lines (supports -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".'

/** The Grep description GLM sees: the 3.16.3 lines without the multiline line. */
export const GREP_DESCRIPTION = GREP_DESCRIPTION_LINES.filter(line => line !== GREP_MULTILINE_LINE).join('\n')

/** The Grep schema GLM sees: the 3.16.3 schema without the parameters the native cannot honor. */
export const GREP_SCHEMA: JsonRecord = (() => {
  const properties: JsonRecord = {}
  for (const [key, value] of Object.entries(GREP_INPUT_SCHEMA.properties as JsonRecord)) {
    if (GREP_UNSUPPORTED.has(key)) continue
    properties[key] = key === 'output_mode' && isRecord(value) ? { ...value, description: GREP_OUTPUT_MODE_DESCRIPTION } : value
  }
  return { ...GREP_INPUT_SCHEMA, properties }
})()

/** File types ZCode maps to extensions (adapters fs TYPE_EXTENSION_MAP, bundle `e4r`). */
const TYPE_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  c: ['.c', '.h'],
  cpp: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'],
  csharp: ['.cs'],
  css: ['.css'],
  go: ['.go'],
  html: ['.html', '.htm'],
  java: ['.java'],
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  json: ['.json', '.jsonc'],
  markdown: ['.md', '.markdown'],
  md: ['.md', '.markdown'],
  py: ['.py'],
  python: ['.py'],
  rs: ['.rs'],
  rust: ['.rs'],
  sh: ['.sh', '.bash', '.zsh'],
  ts: ['.ts', '.tsx', '.mts', '.cts'],
  tsx: ['.tsx'],
  txt: ['.txt'],
  yaml: ['.yaml', '.yml'],
}

/** ZCode's `glob` list (adapters fs splitRipgrepGlobPatterns): split on whitespace, then on commas unless the piece has braces. */
export function splitGlobPatterns(glob: string): string[] {
  const patterns: string[] = []
  for (const piece of glob.split(/\s+/)) {
    if (piece.includes('{') && piece.includes('}')) patterns.push(piece)
    else patterns.push(...piece.split(','))
  }
  return patterns.map(pattern => pattern.trim()).filter(pattern => pattern.length > 0)
}

/**
 * ZCode's filter for a file type (adapters fs fileTypeGlobPatterns): the
 * table's extensions, else the type itself as one; a malformed type selects
 * nothing. ZCode passes a basename glob and an any-depth glob per extension;
 * a slash-free ripgrep glob already matches at any depth, so one basename
 * glob with brace alternation selects the same files.
 */
export function typeGlobPattern(type: string): string | undefined {
  const normalized = type.toLowerCase().replace(/^\./, '')
  if (!/^[a-z0-9_+-]+$/i.test(normalized)) return undefined
  const extensions = TYPE_EXTENSIONS[normalized] ?? [`.${normalized}`]
  return extensions.length === 1 ? `*${extensions[0]}` : `*{${extensions.join(',')}}`
}

/**
 * The native `grep` calls one ZCode Grep stands for: the pattern trimmed
 * (ZCode searches `pattern.trim()`), `-i` as ripgrep's inline flag, and one
 * call per include filter (none without `glob` and `type`).
 */
export function grepNativeCalls(args: JsonRecord): JsonRecord[] {
  const base: JsonRecord = {}
  const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : args.pattern
  if (pattern !== undefined) base.pattern = args['-i'] === true && typeof pattern === 'string' && pattern.length > 0 ? `(?i)${pattern}` : pattern
  if (args.path !== undefined) base.path = args.path
  const typePattern = typeof args.type === 'string' ? typeGlobPattern(args.type) : undefined
  const includes = [...(typeof args.glob === 'string' ? splitGlobPatterns(args.glob) : []), ...(typePattern === undefined ? [] : [typePattern])]
  return includes.length === 0 ? [base] : includes.map(include => ({ ...base, include }))
}

/** One native grep match (the `grep` output value's `matches` items). */
interface GrepMatch {
  readonly path: string
  readonly lineNumber: number
  readonly line: string
}

const isGrepMatch = (value: unknown): value is GrepMatch =>
  isRecord(value) && typeof value.path === 'string' && typeof value.lineNumber === 'number' && typeof value.line === 'string'
function grepMatches(value: unknown): GrepMatch[] | undefined {
  const matches: unknown = isRecord(value) ? value.matches : undefined
  return Array.isArray(matches) && matches.every(isGrepMatch) ? matches : undefined
}

/**
 * Run the native calls and merge their matches (first seen wins, keyed by
 * path and line). A single call returns the native value unchanged.
 */
export async function runGrep(native: ToolDefinitionLike, args: JsonRecord, exec: unknown): Promise<unknown> {
  const calls = grepNativeCalls(args)
  if (calls.length === 1) return native.execute(calls[0], exec)
  const seen = new Set<string>()
  const matches: GrepMatch[] = []
  for (const call of calls) {
    for (const match of grepMatches(await native.execute(call, exec)) ?? []) {
      const key = `${match.path}\n${match.lineNumber}`
      if (seen.has(key)) continue
      seen.add(key)
      matches.push(match)
    }
  }
  return { matches }
}

/** ZCode's pagination (adapters fs applyHeadLimit): `head_limit` 0 is unlimited, unspecified is 250; the limit is reported only when it cut. */
function applyHeadLimit<T>(items: readonly T[], headLimit: number | undefined, offset = 0): { items: T[], appliedLimit?: number, appliedOffset?: number } {
  const applied = offset > 0 ? { appliedOffset: offset } : {}
  if (headLimit === 0) return { items: items.slice(offset), ...applied }
  const limit = headLimit ?? GREP_DEFAULT_HEAD_LIMIT
  return { items: items.slice(offset, offset + limit), ...(items.length - offset > limit ? { appliedLimit: limit } : {}), ...applied }
}

/** ZCode's Grep result over the native matches, or undefined for a value of another shape. */
export function grepResultText(args: JsonRecord, value: unknown): string | undefined {
  const found = grepMatches(value)
  if (found === undefined) return undefined
  const matches = found.map(match => ({ ...match, path: zcodeDisplayPath(match.path) }))
  const files = [...new Set(matches.map(match => match.path))]
  const headLimit = typeof args.head_limit === 'number' ? args.head_limit : undefined
  const offset = typeof args.offset === 'number' ? args.offset : undefined
  const mode = args.output_mode === 'content' || args.output_mode === 'count' ? args.output_mode : 'files_with_matches'
  if (mode === 'files_with_matches') {
    const { items, ...applied } = applyHeadLimit(files, headLimit, offset)
    return grepModelContent({ mode, numFiles: items.length, filenames: items, numMatches: matches.length, ...applied })
  }
  if (mode === 'count') {
    const counts = new Map<string, number>()
    for (const match of matches) counts.set(match.path, (counts.get(match.path) ?? 0) + 1)
    const { items, ...applied } = applyHeadLimit([...counts], headLimit, offset)
    return grepModelContent({ mode, numFiles: files.length, filenames: [], content: items.map(([path, count]) => `${path}:${count}`).join('\n'), numMatches: matches.length, ...applied })
  }
  const lineNumbers = args['-n'] !== false
  const { items, ...applied } = applyHeadLimit(matches, headLimit, offset)
  const content = items.map(match => lineNumbers ? `${match.path}:${match.lineNumber}:${match.line}` : `${match.path}:${match.line}`).join('\n')
  return grepModelContent({ mode, numFiles: files.length, filenames: [], content, numMatches: matches.length, ...applied })
}
