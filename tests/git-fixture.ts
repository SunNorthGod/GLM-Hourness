/**
 * Real git repositories in a temporary directory for the tests of the git
 * snapshot (src/guard/git-snapshot.ts) and of the main agent's rules that
 * use it. Importing this file points git at a global configuration of its
 * own (a fixed identity, branch `main`, no line-ending conversion, no
 * signing) and ignores the machine's system configuration; the directory is
 * removed when the process exits.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { guardGit, realSnapshotEnvironment, type GuardGitResult, type SnapshotEntry, type SnapshotEnvironment } from '../src/guard/git-snapshot.ts'

const sandbox = mkdtempSync(join(tmpdir(), 'git-fixture-'))
const globalConfig = join(sandbox, 'gitconfig')
const SETTINGS = [['user', 'name = Test'], ['user', 'email = test@example.invalid'], ['init', 'defaultBranch = main'], ['core', 'autocrlf = false'], ['commit', 'gpgsign = false']] as const
writeFileSync(globalConfig, SETTINGS.map(([section, setting]) => `[${section}]\n\t${setting}\n`).join(''))
Object.assign(process.env, { GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' })
process.on('exit', () => rmSync(sandbox, { recursive: true, force: true, maxRetries: 3 }))

/** Run git in `cwd` and return its trimmed output; throws when git fails. */
export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Like `sh`, but the exit code and the output come back instead of a throw. */
export function tryGit(cwd: string, ...args: string[]): { readonly code: number, readonly out: string } {
  try {
    return { code: 0, out: sh(cwd, ...args) }
  }
  catch (error) {
    const failure = error as { status?: number, stdout?: Buffer | string, stderr?: Buffer | string }
    return { code: failure.status ?? -1, out: `${String(failure.stdout ?? '')}${String(failure.stderr ?? '')}`.trim() }
  }
}

export interface Repo {
  /** The directory holding the work tree and, beside it, anything a case adds (a remote, a second work tree). */
  readonly root: string
  readonly dir: string
  git: (...args: string[]) => string
  /** Write (a string) or delete (null) files, commit them all, and return the new commit. */
  commit: (files: Record<string, string | null>, message: string) => string
  /** A bare repository next to the work tree, added as `origin`, with `main` pushed to it. */
  withRemote: () => string
  /** Write files without committing them. */
  write: (files: Record<string, string>) => void
}

let counter = 0

/** A new repository on branch `main`, with no commit. */
export function makeRepo(): Repo {
  const root = join(sandbox, `r${++counter}`)
  const dir = join(root, 'work')
  mkdirSync(dir, { recursive: true })
  sh(dir, 'init', '--quiet', '-b', 'main')
  const write = (files: Record<string, string>): void => {
    for (const [path, content] of Object.entries(files)) {
      const target = join(dir, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
  }
  return {
    root,
    dir,
    git: (...args) => sh(dir, ...args),
    write,
    commit(files, message) {
      const entries = Object.entries(files)
      for (const [path, content] of entries) if (content !== null) write({ [path]: content })
      for (const [path, content] of entries) if (content === null) rmSync(join(dir, path), { force: true })
      sh(dir, 'add', '-A')
      sh(dir, 'commit', '-q', '--allow-empty', '-m', message)
      return sh(dir, 'rev-parse', 'HEAD')
    },
    withRemote() {
      const remote = join(root, 'remote.git')
      sh(root, 'init', '--bare', '-q', '-b', 'main', remote)
      sh(dir, 'remote', 'add', 'origin', remote)
      sh(dir, 'push', '-q', '-u', 'origin', 'main')
      return remote
    },
  }
}

// ---------------------------------------------------------------- what the snapshot tests share

export interface RunOptions {
  readonly env?: Partial<SnapshotEnvironment>
  readonly base?: string
  readonly dialect?: 'posix' | 'pwsh'
}

/** One shell call of the main agent, judged and snapshotted the way the rules do. */
export function run(repo: Repo, command: string, options: RunOptions = {}): Promise<GuardGitResult> {
  return guardGit({ command, dialects: [options.dialect ?? 'posix'], base: options.base ?? repo.dir, sessionId: 'S1', agentId: 'A1' }, { ...realSnapshotEnvironment, ...options.env })
}

export function allowed(result: GuardGitResult): Extract<GuardGitResult, { kind: 'allow' }> {
  assert.equal(result.kind, 'allow', result.kind === 'refuse' ? `${result.refusal.code}: ${result.refusal.reason}` : '')
  return result
}

export function refusal(result: GuardGitResult): Extract<GuardGitResult, { kind: 'refuse' }>['refusal'] {
  assert.equal(result.kind, 'refuse', 'the call is refused')
  if (result.kind !== 'refuse') throw new Error('unreachable')
  return result.refusal
}

/** The journal of the project root of `repo` (`.llm/snapshots.jsonl`). */
export function journal(repo: Repo): SnapshotEntry[] {
  const file = join(repo.dir, '.llm', 'snapshots.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as SnapshotEntry) : []
}

export const refs = (repo: Repo, pattern = 'refs/hourness/snapshots'): string[] => repo.git('for-each-ref', '--format=%(refname)', pattern).split('\n').filter(line => line !== '')

/** The one snapshot ref a call made, and the journal line for it. */
export function theSnapshot(repo: Repo): { readonly ref: string, readonly entry: SnapshotEntry } {
  const [ref, ...more] = refs(repo).filter(name => !name.includes('/remote/'))
  assert.ok(ref !== undefined && more.length === 0, `one snapshot ref, got ${refs(repo).join(', ')}`)
  const entry = journal(repo).at(-1)
  assert.ok(entry !== undefined && entry.ref === ref, 'the last journal line is for that ref')
  return { ref, entry }
}

/** A repository with `a.txt` committed twice, so `HEAD~1` exists. */
export function twoCommitRepo(): Repo {
  const repo = makeRepo()
  repo.commit({ 'a.txt': 'one\n', '.gitignore': 'node_modules/\n.env\n' }, 'first')
  repo.commit({ 'a.txt': 'two\n' }, 'second')
  return repo
}

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
/** A file name git would read as a pathspec pattern. `*` cannot be a file name on Windows, so a character class stands for it there. */
export const GLOB = process.platform === 'win32' ? 'with [x] and (parens)' : 'with star* and [x]'

export const noSnapshot = (repo: Repo): void => {
  assert.deepEqual(refs(repo), [])
  assert.deepEqual(refs(repo, 'refs/tags/hourness-snapshot'), [])
  assert.deepEqual(journal(repo), [])
}
