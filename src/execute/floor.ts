/**
 * The must-review floor (M7 design 0.6 §3.8.5): the judgement forms of the
 * `norm-review-floor` norm, and whether one change hits one of them. Pure
 * functions; the change and the worker's command records arrive as data —
 * the harness reads both itself, never from what an agent reports.
 *
 * Each acceptance line of the norm is one class of change in the person's
 * words, and its judgement forms are the backtick segments joined to the end
 * of the line (separated by nothing but whitespace). A segment starts with
 * one of the four forms below and must be well-formed; a line whose segments
 * are malformed, unknown, or missing entirely is unparsed — and the whole
 * list is then strict (§3.8.5, the third way): every write task is fully
 * reviewed, and `floorHits` answers one unparsed hit for every change.
 *
 * Paths are repository-relative, no `..`, no wildcards, list never empty; a
 * trailing `/` is a directory prefix compared by segments. The comparison is
 * case-insensitive: Windows and macOS treat the two spellings as one file,
 * and over-matching sends work to a full review, under-matching would not.
 */
import type { GraphNode } from '../graph/schema.ts'

/** The four judgement forms a backtick segment may take. */
export const FLOOR_FORMS = ['files', 'deletes', 'commands', 'outside'] as const

type FloorTest =
  | { readonly form: 'files', readonly paths: readonly string[] }
  | { readonly form: 'deletes' }
  | { readonly form: 'commands', readonly words: readonly (readonly string[])[] }
  | { readonly form: 'outside' }

interface FloorEntry {
  /** The acceptance line's index. */
  readonly index: number
  /** The line as the person wrote it, for hints and the rules board. */
  readonly text: string
  readonly tests: readonly FloorTest[]
}

export interface ParsedFloor {
  readonly entries: readonly FloorEntry[]
  /** The indexes of the lines no form could be read from. */
  readonly unparsed: readonly number[]
}

const WILDCARD = /[*?[]/

/** A path of the `files` form: repository-relative, no `..` or empty segment, no wildcard, no Windows absolute or backslash form; a trailing `/` marks a directory prefix. */
export function isFloorPath(value: string): boolean {
  if (value.length === 0 || value.includes('\\') || /^[A-Za-z]:/.test(value) || WILDCARD.test(value)) return false
  const segments = (value.endsWith('/') ? value.slice(0, -1) : value).split('/')
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

function parsePaths(value: string): readonly string[] | undefined {
  const paths = value.split(',').map(path => path.trim()).filter(path => path.length > 0)
  if (paths.length === 0) return undefined
  return paths.every(isFloorPath) ? paths : undefined
}

/** One judgement form read from a segment's text; undefined when the segment is not a form. */
function parseSegment(segment: string): FloorTest | undefined {
  if (segment === 'deletes' || segment === 'outside') return { form: segment }
  if (segment.startsWith('files ')) {
    const paths = parsePaths(segment.slice('files '.length))
    return paths === undefined ? undefined : { form: 'files', paths }
  }
  if (segment.startsWith('commands ')) {
    const words = segment.slice('commands '.length).split(',').map(line => line.trim().split(/\s+/).filter(word => word.length > 0)).filter(line => line.length > 0)
    return words.length === 0 ? undefined : { form: 'commands', words }
  }
  return undefined
}

/**
 * The floor of a `norm-review-floor` node (§3.8.5). A line without any
 * trailing backtick segment is unparsed too — the person has not given it a
 * form the harness can judge, which is what the repo's own four lines are
 * like today. An undefined node is a floor with nothing in it: this project
 * has no floor, and the declared depth stands.
 */
export function parseFloor(node: GraphNode | undefined): ParsedFloor {
  const acceptance = node?.acceptance ?? []
  const entries: FloorEntry[] = []
  const unparsed: number[] = []
  acceptance.forEach((text, index) => {
    const segments = trailingSegments(text)
    const tests: FloorTest[] = []
    for (const segment of segments) {
      const test = parseSegment(segment)
      if (test === undefined) {
        unparsed.push(index)
        return
      }
      tests.push(test)
    }
    if (tests.length === 0) {
      unparsed.push(index)
      return
    }
    entries.push({ index, text, tests })
  })
  return { entries, unparsed }
}

/** The backtick segments joined to the end of a line, without the backticks; `~/.dsh` mid-sentence is not one. */
function trailingSegments(text: string): readonly string[] {
  const segments: string[] = []
  let rest = text.replace(/\s+$/, '')
  while (rest.endsWith('`') && rest.length >= 2) {
    const closing = rest.length - 1
    const opening = rest.lastIndexOf('`', closing - 1)
    if (opening < 0) break
    segments.unshift(rest.slice(opening + 1, closing))
    rest = rest.slice(0, opening).replace(/\s+$/, '')
  }
  return segments
}

/** One change as the harness reads it from git (§3.8.5's two inputs, the first). */
export interface FloorChange {
  /** Every path the change touches, repository-relative: added, modified, deleted, type-changed (`--no-renames`: a rename is a delete plus an add). */
  readonly paths: readonly string[]
  /** The paths the change deletes. */
  readonly deleted: readonly string[]
}

/**
 * One command or file-tool call the worker's side made, as `worker-scope` and
 * `worker-git` record it (§3.8.5's second input; the records also carry the
 * verdict — refused calls count the same way). `words` are the simple
 * commands, one word list each, lower-case and without `.exe`-style
 * suffixes; `null` when there is a shell text and it could not be split,
 * which is a hit for every `commands` entry, and `undefined` for a file-tool
 * call, which has no shell text to split. `git` is each git call as
 * `git <sub> <args…>`. `paths` are the call's resolved absolute targets;
 * `writes` says the call writes; `shell` says it is a shell call, where
 * reading and writing cannot be told apart.
 */
export interface FloorCall {
  readonly tool: string
  readonly words: readonly (readonly string[])[] | null | undefined
  readonly git: readonly { readonly sub: string, readonly args: readonly string[] }[]
  readonly paths: readonly string[]
  readonly writes: boolean
  readonly shell: boolean
}

export interface FloorHit {
  /** The line's index, or the unparsed indexes joined by commas. */
  readonly index: string
  /** What hit: the path, the command, the deletion, the write outside, or `unparsed`. */
  readonly reason: string
}

/** Whether a repository-relative path sits under a directory prefix or equals a file path, by segments, case-insensitively. */
export function floorPathIn(prefixes: readonly string[], path: string): boolean {
  return prefixes.some(prefix => {
    const a = prefix.toLowerCase().replace(/\/$/, '').split('/')
    const b = path.toLowerCase().split('/')
    return prefix.endsWith('/') ? a.every((segment, index) => b[index] === segment) : a.length === b.length && a.every((segment, index) => b[index] === segment)
  })
}

const HOME_LIKE = /^~|^%USERPROFILE%|^\$HOME|^\$env:USERPROFILE/i

/**
 * What one change hits (§3.8.5): a touched path under a `files` path, a
 * deletion for `deletes`, a recorded command that starts with a `commands`
 * line's words (refused ones too; an unsplitable record hits every
 * `commands` line), a write outside the worktree — or any absolute path in a
 * shell call — for `outside`. When the floor has unparsed lines the answer
 * is one `unparsed` hit naming them, whatever the change is. `worktree` is
 * the worker's root as an absolute path; paths under it are inside, and a
 * path that names the home directory never is.
 */
export function floorHits(floor: ParsedFloor, change: FloorChange, calls: readonly FloorCall[], worktree: string): readonly FloorHit[] {
  if (floor.unparsed.length > 0) return [{ index: floor.unparsed.join(','), reason: 'unparsed' }]
  const hits: FloorHit[] = []
  const outside = (path: string): boolean => HOME_LIKE.test(path) || !path.startsWith(worktree)
  for (const entry of floor.entries) {
    for (const test of entry.tests) {
      if (test.form === 'files') {
        const touched = change.paths.find(path => floorPathIn(test.paths, path))
        if (touched !== undefined) {
          hits.push({ index: String(entry.index), reason: touched })
          break
        }
      }
      else if (test.form === 'deletes') {
        if (change.deleted.length > 0) {
          hits.push({ index: String(entry.index), reason: `deleted ${change.deleted[0]}` })
          break
        }
      }
      else if (test.form === 'commands') {
        if (calls.some(call => call.words === null)) {
          hits.push({ index: String(entry.index), reason: '1 command unreadable' })
          break
        }
        const started = calls.some(call =>
          (call.words ?? []).some(words => test.words.some(wanted => startsWith(words, wanted)))
          || call.git.some(({ sub, args }) => test.words.some(wanted => startsWith(['git', sub, ...args], wanted))))
        if (started) {
          hits.push({ index: String(entry.index), reason: test.words.map(wanted => wanted.join(' ')).join(', ') })
          break
        }
      }
      else {
        const outsideHit = calls.some(call =>
          call.paths.some(path => outside(path)) && (call.writes || call.shell))
        if (outsideHit) {
          hits.push({ index: String(entry.index), reason: 'a write outside the worktree' })
          break
        }
      }
    }
  }
  return hits
}

/** Whether `words` starts with `wanted`, word for word. */
function startsWith(words: readonly string[], wanted: readonly string[]): boolean {
  return wanted.length <= words.length && wanted.every((word, index) => words[index] === word)
}
