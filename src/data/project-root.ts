/**
 * Which project a working directory belongs to (docs/ORCHESTRATION.md §16.3;
 * rules design §7.3): the repository root found by reading files only, no
 * git process. A git work tree has a `.git` file that names its git
 * directory; that directory's `commondir` leads to the main checkout's
 * `.git`, so the main checkout and every work tree of it are one project and
 * read the same rules file and runtime state.
 *
 * Outside a git repository only a directory that already has a `.llm`
 * counts as a project, and the user's home directory and a drive root never
 * do, so nothing is written into folders that are not projects.
 *
 * Not rules-specific: this is the one project-root module of the
 * repository. The rules row uses it today; the data directory service (M5)
 * and the other boards reuse it instead of writing a second one. Finding the
 * project writes nothing; `ensureIgnored` and `ensureProjectDir` (which
 * calls it) are the functions here that do, and only when a board is about
 * to create its runtime directory.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, parse, resolve } from 'node:path'

export interface ProjectLocation {
  /** The project root: the main checkout of the repository, or the directory itself outside one. */
  readonly root: string
  /** Whether a `.git` was found above the working directory. */
  readonly git: boolean
}

type GitEntry = { readonly kind: 'dir' } | { readonly kind: 'file', readonly text: string }

function gitEntry(dir: string): GitEntry | undefined {
  const path = join(dir, '.git')
  try {
    const info = statSync(path)
    if (info.isDirectory()) return { kind: 'dir' }
    return info.isFile() ? { kind: 'file', text: readFileSync(path, 'utf8') } : undefined
  }
  catch {
    return undefined
  }
}

/** The git directory a `.git` file names, resolved against the directory holding the file. */
function namedGitDir(dir: string, text: string): string | undefined {
  const named = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1]
  return named === undefined ? undefined : resolve(dir, named)
}

/** The root of the repository a work tree belongs to; the work tree's own directory when its git directory has no `commondir` (a submodule). */
function rootOfWorkTree(dir: string, text: string): string {
  const gitDir = namedGitDir(dir, text)
  if (gitDir === undefined) return dir
  try {
    return dirname(resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()))
  }
  catch {
    return dir
  }
}

const located = new Map<string, ProjectLocation>()

function locate(cwd: string): ProjectLocation {
  const start = resolve(cwd)
  const known = located.get(start)
  if (known !== undefined) return known
  let found: ProjectLocation = { root: start, git: false }
  for (let dir = start; ; dir = dirname(dir)) {
    const entry = gitEntry(dir)
    if (entry !== undefined) {
      found = { root: entry.kind === 'dir' ? dir : rootOfWorkTree(dir, entry.text), git: true }
      break
    }
    if (dirname(dir) === dir) break
  }
  if (found.git) located.set(start, found)
  return found
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  }
  catch {
    return false
  }
}

const sameDir = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** The project of a working directory; undefined when there is none (the home directory, a drive root, a folder outside git without a `.llm`). */
export function projectOf(cwd: string, home: string = homedir()): ProjectLocation | undefined {
  const location = locate(cwd)
  if (sameDir(location.root, home) || parse(location.root).root === location.root) return undefined
  if (!location.git && !isDirectory(join(location.root, '.llm'))) return undefined
  return location
}

/**
 * The runtime directory of the project of a working directory
 * (`<root>/.llm`); undefined when there is no project. Only a path: nothing
 * is created and `info/exclude` is not touched (`ensureProjectDir` does
 * that, just before the first write).
 */
export function projectDirOf(cwd: string, home?: string): string | undefined {
  const project = projectOf(cwd, home)
  return project === undefined ? undefined : join(project.root, '.llm')
}

/** The git directory of a project root (`.git` itself, or the directory a `.git` file names); undefined without one. */
export function gitDirOf(root: string): string | undefined {
  const entry = gitEntry(root)
  if (entry === undefined) return undefined
  return entry.kind === 'dir' ? join(root, '.git') : namedGitDir(root, entry.text)
}

/**
 * The directories of a repository's work trees, as `git worktree list` gives
 * them, read from the git directory without a process: the project root (the
 * main checkout) first, then the work tree each `worktrees/<name>/gitdir` file
 * of the git directory names, in the order of the names. An entry whose file is
 * missing or empty is not a work tree (git prunes such an entry). Only a main
 * checkout has the list: a directory whose `.git` is a file, or that has none,
 * gives an empty one.
 */
export function worktreesOf(root: string): readonly string[] {
  if (gitEntry(root)?.kind !== 'dir') return []
  const registry = join(root, '.git', 'worktrees')
  let names: string[]
  try {
    names = readdirSync(registry).sort()
  }
  catch {
    return [root]
  }
  const trees = names.flatMap((name) => {
    try {
      const pointer = readFileSync(join(registry, name, 'gitdir'), 'utf8').trim()
      return pointer === '' ? [] : [dirname(resolve(registry, name, pointer))]
    }
    catch {
      return []
    }
  })
  return [root, ...trees]
}

/** How long the list of a repository's work trees is kept. */
const WORK_TREES_FRESH_MS = 60_000

/** `worktreesOf`, read at most once a minute for each project root: the gates that keep a board's files to the board ask on every tool call. */
export function cachedWorktrees(now: () => number): (root: string) => readonly string[] {
  const kept = new Map<string, { readonly at: number, readonly trees: readonly string[] }>()
  return (root) => {
    const known = kept.get(root)
    if (known !== undefined && now() - known.at < WORK_TREES_FRESH_MS) return known.trees
    const trees = worktreesOf(root)
    kept.set(root, { at: now(), trees })
    return trees
  }
}

/**
 * Make git ignore a top-level directory of the project (`directory` is its
 * name, `.llm`) without touching a tracked file: the line `<directory>/` is
 * appended to the repository's `info/exclude`, which belongs to the clone and
 * is never committed. Nothing happens outside a git repository, and a line
 * that already ignores the directory (`.llm`, `.llm/`, `/.llm`, `/.llm/`) is
 * not repeated. Throws when the file cannot be written; the caller then does
 * not create the directory. Resolves to true when a line was appended, false
 * when the directory was already ignored (or there is no git directory).
 */
export async function ensureIgnored(root: string, directory: string): Promise<boolean> {
  const gitDir = gitDirOf(root)
  if (gitDir === undefined || !isDirectory(gitDir)) return false
  const file = join(gitDir, 'info', 'exclude')
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const present = [directory, `${directory}/`, `/${directory}`, `/${directory}/`]
  if (text.split(/\r?\n/).some(line => present.includes(line.trim()))) return false
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${text === '' || text.endsWith('\n') ? '' : '\n'}${directory}/\n`)
  return true
}

/**
 * Make a data directory of a project ready to be written: a directory named
 * `.llm` is first made ignored by git (`ensureIgnored` on its parent) and
 * then created, so a project that does not ignore `.llm/` never shows an
 * unknown folder in `git status`. When the ignore line cannot be written the
 * error is thrown and the directory is not created. Any other directory (the
 * explicit one a probe or a test points at, outside a repository) is only
 * created.
 */
export async function ensureProjectDir(dir: string): Promise<void> {
  if (basename(dir) === '.llm') await ensureIgnored(dirname(dir), '.llm')
  await mkdir(dir, { recursive: true })
}
