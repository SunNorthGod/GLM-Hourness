/**
 * Which project a working directory belongs to (docs/ORCHESTRATION.md §16;
 * design §7.3): the repository root found by reading files only, no git
 * process. A git work tree has a `.git` file that names its git directory;
 * that directory's `commondir` leads to the main checkout's `.git`, so the
 * main checkout and every work tree of it are one project and read the same
 * rules file and runtime state.
 *
 * Outside a git repository only a directory that already has a `.llm`
 * counts as a project, and the user's home directory and a drive root never
 * do, so nothing is written into folders that are not projects.
 */
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'

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

/** The git directory of a project root (`.git` itself, or the directory a `.git` file names); undefined without one. */
export function gitDirOf(root: string): string | undefined {
  const entry = gitEntry(root)
  if (entry === undefined) return undefined
  return entry.kind === 'dir' ? join(root, '.git') : namedGitDir(root, entry.text)
}
