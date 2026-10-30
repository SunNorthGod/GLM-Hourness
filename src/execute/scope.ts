/**
 * Write scopes (M7 design .agents/tasks/m7/design.md 0.6 §3.2.1, §3.3.2,
 * §3.5.1): what a task's `writeScope` entries name, whether a path lies
 * inside them, whether two scopes meet, and how a path a tool call names
 * becomes a repository-relative path. Pure functions; no file system.
 *
 * An entry is a repository-relative path with `/` separators; a trailing `/`
 * marks a directory (the rule the graph format enforces, src/graph/format.ts
 * `scopePath`). Comparison is by whole path segments: `src/` contains
 * `src/a.ts` and does not contain `src2/a.ts`; a file entry contains only
 * itself. A directory entry also contains itself, so removing or creating
 * the scope's own directory is inside it. Containment compares segments
 * exactly, case included, so it never accepts a path the entry does not
 * name on any file system; the price is that a differently-cased spelling of
 * an allowed path is refused on a case-insensitive one. `overlaps` errs the
 * other way and ignores case: two scopes that may be the same files on
 * Windows or macOS must not run in parallel.
 *
 * Untrusted text (a plan's `paths`, a tool call's target) meets these
 * functions: anything with an empty, `.` or `..` segment, a backslash, a
 * colon, a glob character or a control character is no path at all, so it is
 * never inside a scope.
 */
import path from 'node:path'

/** The part of node:path the resolution below uses; tests pass `path.posix` and `path.win32`. */
export type PathApi = Pick<typeof path, 'resolve' | 'relative' | 'isAbsolute' | 'sep'>

interface ScopeEntry {
  readonly segments: readonly string[]
  readonly directory: boolean
}

/** Characters that make a path absolute, a glob or unusable on Windows (the graph format's rule). */
const NOT_IN_PATHS = /[\\:*?"<>|]/

function parseEntry(text: string): ScopeEntry | undefined {
  if (NOT_IN_PATHS.test(text) || [...text].some(char => char.charCodeAt(0) < 0x20)) return undefined
  const segments = text.split('/')
  const directory = segments.length > 1 && segments.at(-1) === ''
  if (directory) segments.pop()
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return undefined
  return { segments, directory }
}

/** Whether the text is a repository-relative path in the scope notation (a directory may end with `/`). */
export function isScopePath(text: string): boolean {
  return parseEntry(text) !== undefined
}

/** Whether `entry` contains `target`, segment by segment, with `fold` applied to every segment. */
function contains(entry: ScopeEntry, target: ScopeEntry, fold: (segment: string) => string): boolean {
  if (entry.segments.length > target.segments.length) return false
  if (!entry.segments.every((segment, index) => fold(segment) === fold(target.segments[index]))) return false
  return entry.directory || (entry.segments.length === target.segments.length && !target.directory)
}

const exact = (segment: string): string => segment
const folded = (segment: string): string => segment.toLowerCase()

/** Whether some entry of the scope contains the path; the path may itself be a directory (a trailing `/`). An empty scope contains nothing. */
export function within(scope: readonly string[], target: string): boolean {
  const parsed = parseEntry(target)
  if (parsed === undefined) return false
  return scope.some(text => {
    const entry = parseEntry(text)
    return entry !== undefined && contains(entry, parsed, exact)
  })
}

/**
 * Whether two scopes name files that may be the same: some entry of one
 * contains an entry of the other, ignoring case. A scope with no entries
 * (a review) overlaps nothing; an entry that is no path counts as
 * overlapping everything else, so a malformed scope serializes the work.
 */
export function overlaps(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const left = a.map(parseEntry)
  const right = b.map(parseEntry)
  if (left.includes(undefined) || right.includes(undefined)) return true
  return left.some(x => right.some(y => contains(x!, y!, folded) || contains(y!, x!, folded)))
}

/** Whether a path segment names the repository's own `.git`: Windows ignores case and trailing dots and spaces. */
function isGitSegment(segment: string): boolean {
  return segment.replace(/[. ]+$/, '').toLowerCase() === '.git'
}

/**
 * The path a tool call names, relative to the worktree root `root` and in
 * scope notation, or undefined when it lies outside the root or inside the
 * root's `.git`. `target` is resolved against `cwd` (the caller's working
 * directory) the way the tool would. The root itself is the empty string.
 * Segments keep the spelling of `target`; only the root part is compared by
 * the platform's own rules.
 */
export function repoRelative(root: string, cwd: string, target: string, api: PathApi = path): string | undefined {
  const relative = api.relative(api.resolve(root), api.resolve(cwd, target))
  if (relative === '') return ''
  if (api.isAbsolute(relative)) return undefined
  const segments = relative.split(api.sep)
  if (segments[0] === '..' || isGitSegment(segments[0])) return undefined
  return segments.join('/')
}
