/**
 * The git executor of M7 (design .agents/tasks/m7/design.md 0.6 §3.8, §3.1.2
 * step 4, §6.3): every git process the harness runs for itself. Task
 * worktrees and their branches, the gate worktree, the change list between
 * two commits, the comparison of one file's content in two commits, the
 * `Hourness-Task` trailers, the trunk and its remote-tracking reference, and
 * `ls-remote`. It runs git with `execFile`, never through a shell, so a
 * branch name or a path is one argument and is never re-parsed.
 *
 * Two rules hold for every call:
 * - Each call carries `--no-replace-objects` first. `git replace` can make a
 *   commit or tree read as another one; the harness decides from what is
 *   really in the repository, so replacement refs must not change what it
 *   sees. (The one call that takes a file path as a pathspec, `ls-tree`,
 *   adds `--literal-pathspecs` so the path is never read as `:(magic)`;
 *   `check-ignore` refuses that option, which is why it is not global.)
 * - A revision, branch or remote that reaches git from outside is checked
 *   first: it may not start with `-` (git would read an option) or hold
 *   whitespace or control characters.
 *
 * Nothing here throws for a git failure. A step that can fail returns an
 * `Outcome` with the reason, or a refusal with a code from the design, and
 * the caller (the check, the dispatch, the trunk-advance check) decides what
 * a failure means; where it matters, failing closed is the caller's rule
 * (design §3.8.5: a change list that cannot be read counts as a hit).
 *
 * The runner is injected: tests run real git in temporary repositories, and
 * run the process wrapper itself against `node -e` for exit codes and
 * timeouts. M3's `takeSnapshot` is not in the repository yet; the gate guard
 * takes it as `SnapshotSaver`, which step E7 binds to the real function.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { ensureIgnored, projectOf } from '../data/project-root.ts'
import { ID_PATTERN } from '../graph/schema.ts'
import { digest12 } from './digest.ts'

// ---------------------------------------------------------------------------
// The process wrapper

export interface GitResult {
  /** The exit code; `undefined` when the process did not run to its end (see `problem`). */
  readonly code: number | undefined
  readonly stdout: string
  readonly stderr: string
  readonly problem?: 'missing' | 'timeout' | 'overflow' | 'failed'
}

/** Runs a program in a directory and reports how it ended; never throws. */
export type GitRunner = (cwd: string, args: readonly string[], timeoutMs: number) => Promise<GitResult>

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
/** Output that does not change with the machine's language; no prompt for a password. */
const PROCESS_ENVIRONMENT = { LC_ALL: 'C', LANGUAGE: 'C', GIT_TERMINAL_PROMPT: '0' }

/** A runner for `program`; the real one is `execRunner('git')`, tests also use it on `node`. */
export function execRunner(program: string): GitRunner {
  return (cwd, args, timeoutMs) => new Promise((done) => {
    execFile(program, [...args], {
      cwd, timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true, encoding: 'utf8', env: { ...process.env, ...PROCESS_ENVIRONMENT },
    }, (error, stdout, stderr) => {
      if (error === null) return done({ code: 0, stdout, stderr })
      if (typeof error.code === 'number') return done({ code: error.code, stdout, stderr })
      const problem = error.code === 'ENOENT' ? 'missing' : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'overflow' : error.killed === true ? 'timeout' : 'failed'
      done({ code: undefined, stdout, stderr: stderr === '' ? error.message : stderr, problem })
    })
  })
}

export const realGitRunner: GitRunner = execRunner('git')

// ---------------------------------------------------------------------------
// Results

export type Outcome<T> = { readonly ok: true, readonly value: T } | { readonly ok: false, readonly reason: string }

const succeeded = <T>(value: T): Outcome<T> => ({ ok: true, value })
const failed = (reason: string): { readonly ok: false, readonly reason: string } => ({ ok: false, reason })

export interface Refusal<Code extends string> {
  readonly ok: false
  readonly code: Code
  readonly reason: string
  /** Files that explain the refusal (the unclean ones, for `worktree_dirty`). */
  readonly files?: readonly string[]
}

const refuse = <Code extends string>(code: Code, reason: string, files?: readonly string[]): Refusal<Code> => ({ ok: false, code, reason, ...(files === undefined ? {} : { files }) })

/** Why a git call did not succeed, in one line the caller can show. */
function describe(args: readonly string[], result: GitResult): string {
  const subcommand = args.find(arg => !arg.startsWith('-')) ?? 'git'
  switch (result.problem) {
    case 'missing': return 'git could not be started (it is not installed, or the working directory is gone)'
    case 'timeout': return `git ${subcommand} timed out`
    case 'overflow': return `git ${subcommand} printed more than ${MAX_OUTPUT_BYTES / 1024 / 1024} MiB`
    case 'failed': return `git ${subcommand} could not run: ${result.stderr.trim()}`
  }
  const detail = result.stderr.trim().split(/\r?\n/).slice(-3).join(' | ')
  return `git ${subcommand} exited ${result.code}${detail === '' ? '' : `: ${detail}`}`
}

// ---------------------------------------------------------------------------
// Parsing what git prints (pure)

export interface WorktreeEntry {
  /** As git prints it: absolute, with `/` separators also on Windows. */
  readonly path: string
  readonly head: string
  /** Short branch name; `undefined` for a detached head. */
  readonly branch: string | undefined
  readonly detached: boolean
}

/** `git worktree list --porcelain`. */
export function parseWorktrees(text: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    let path: string | undefined
    let head = ''
    let branch: string | undefined
    let detached = false
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
      else if (line === 'detached') detached = true
    }
    if (path !== undefined) entries.push({ path, head, branch, detached })
  }
  return entries
}

export interface ChangedFile {
  /** `A` added, `M` modified, `D` deleted, `T` type changed. */
  readonly status: string
  readonly path: string
}

/** `git diff --name-status -z`: status and path alternate, each ended by NUL. `undefined` when the output is not pairs. */
export function parseNameStatus(text: string): ChangedFile[] | undefined {
  const tokens = text.split('\0')
  if (tokens.at(-1) === '') tokens.pop()
  if (tokens.length % 2 !== 0) return undefined
  const files: ChangedFile[] = []
  for (let index = 0; index < tokens.length; index += 2) files.push({ status: tokens[index], path: tokens[index + 1] })
  return files
}

export interface TrailerCommit {
  readonly commit: string
  /** The `Hourness-Task` values of the commit message, one entry per task id. */
  readonly tasks: readonly string[]
}

/** The format that `parseTaskTrailers` reads: the commit, a NUL, the task values joined by commas. */
const TRAILER_FORMAT = '--format=%H%x00%(trailers:key=Hourness-Task,valueonly,unfold,separator=%x2C)'

/** Commits that carry at least one `Hourness-Task` trailer, from `git log` in `TRAILER_FORMAT`. */
export function parseTaskTrailers(text: string): TrailerCommit[] {
  const found: TrailerCommit[] = []
  for (const line of text.split('\n')) {
    const [commit = '', values = ''] = line.replace(/\r$/, '').split('\0')
    const tasks = [...new Set(values.split(',').map(value => value.trim()).filter(value => value !== ''))]
    if (/^[0-9a-f]{40,64}$/.test(commit) && tasks.length > 0) found.push({ commit, tasks })
  }
  return found
}

/** `git status --porcelain -z --no-renames`: tracked files with changes, and untracked files that are not ignored. */
function parseStatus(text: string): { readonly tracked: readonly string[], readonly untracked: readonly string[] } {
  const tracked: string[] = []
  const untracked: string[] = []
  for (const token of text.split('\0')) {
    if (token.length < 4) continue
    const files = token.startsWith('??') ? untracked : tracked
    files.push(token.slice(3))
  }
  return { tracked, untracked }
}

export interface TreeEntry {
  readonly mode: string
  readonly type: string
  readonly id: string
}

/** The entry `git ls-tree -z` printed for exactly this path. */
function findTreeEntry(text: string, path: string): TreeEntry | undefined {
  for (const record of text.split('\0')) {
    const tab = record.indexOf('\t')
    if (tab < 0 || record.slice(tab + 1) !== path) continue
    const [mode = '', type = '', id = ''] = record.slice(0, tab).split(' ')
    return { mode, type, id }
  }
  return undefined
}

const sameEntry = (a: TreeEntry | undefined, b: TreeEntry | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.mode === b.mode && a.type === b.type && a.id === b.id

/** What a remote-tracking reference's reflog message says about how the reference moved. */
export type ReflogKind = 'fetch' | 'push' | 'unknown'

/**
 * `fetch ...` and `pull ...` are written by a fetch (or by a command that
 * only claims to be one: `git fetch . X:refs/remotes/...` writes the same
 * words, which is why the design counts the message as a hint and checks the
 * commands of the call too); `update by push` is written when a push
 * succeeds. The trunk-advance check treats everything but `fetch` as a push.
 */
export function reflogKind(subject: string): ReflogKind {
  if (/^(fetch|pull)(\s|:|$)/.test(subject)) return 'fetch'
  return subject.startsWith('update by push') ? 'push' : 'unknown'
}

// ---------------------------------------------------------------------------
// Checking what comes from outside

const hasBlank = (text: string): boolean => [...text].some(char => char.charCodeAt(0) <= 0x20 || char.charCodeAt(0) === 0x7f)

/** A revision expression git can take as one argument: not an option, no blanks or control characters. */
const isRev = (text: string): boolean => text !== '' && !text.startsWith('-') && !hasBlank(text)

/** A branch or remote name used to build a ref name: a revision without glob characters. */
const isRefPart = (text: string): boolean => isRev(text) && !/[*?[\\]/.test(text)

/** A repository-relative file path as `git diff` prints it: no NUL, not absolute, not a directory. */
const isRepoFile = (text: string): boolean => text !== '' && !text.includes('\0') && !text.startsWith('/') && !text.endsWith('/')

const FOLD_CASE = process.platform === 'win32' || process.platform === 'darwin'
const pathKey = (path: string): string => FOLD_CASE ? resolve(path).toLowerCase() : resolve(path)
const samePath = (a: string, b: string): boolean => pathKey(a) === pathKey(b)

const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const GLOBAL_OPTIONS = ['--no-replace-objects'] as const
const READ_TIMEOUT_MS = 60_000
/** Checkouts, resets and cleans on a large tree. */
const WRITE_TIMEOUT_MS = 10 * 60_000
const REMOTE_TIMEOUT_MS = 30_000
const MAX_LISTED_FILES = 20

// ---------------------------------------------------------------------------
// Worktrees and the gate worktree

/** The directory, relative to the project root, that holds every worktree the harness creates. */
const WORKTREES_DIR = '.worktrees'
/** The gate worktree is `hz-gate`; a task of that id would share its directory. */
const GATE_NAME = 'gate'
/**
 * The commit the harness last left the gate worktree on. The one reference
 * the executor writes: it keeps that commit reachable after the branch it
 * came from was rebased or deleted, and it is how a commit made in the gate
 * worktree afterwards (which no reference holds) is told from the one the
 * harness put there.
 */
const GATE_HEAD_REF = 'refs/hourness/gate-head'

export type WorktreeCode = 'not_git' | 'no_base_branch' | 'bad_task' | 'worktree_dirty' | 'worktree_failed'

export interface TaskWorktree {
  readonly ok: true
  /** Absolute path of the worktree. */
  readonly path: string
  readonly branch: string
  /** The branch the main checkout was on. */
  readonly base: string
  readonly baseSha: string
  /** The worktree was made by this call; a created worktree needs its setup commands. */
  readonly created: boolean
  /** The branch the task's earlier work was moved to, when this call renamed it (§3.1.2 step 4). */
  readonly renamedFrom?: string
}

export type GateCode = 'gate_worktree_invalid' | 'gate_snapshot_failed'

export interface GateWorktree {
  readonly ok: true
  readonly path: string
  /** The gate worktree was made by this call; a created one needs its setup commands. */
  readonly created: boolean
  /** How many snapshots were saved before the destructive commands (0 for a clean worktree). */
  readonly snapshots: number
}

/**
 * M3's `takeSnapshot(repo, invocation, risk)` as this module needs it: the
 * snapshot of what `git <sub> <args>` would discard, resolved once it is
 * saved. Step E7 wraps the real function in it.
 */
export type SnapshotSaver = (repo: string, invocation: { readonly sub: string, readonly args: readonly string[] }, risk: 'discard') => Promise<{ readonly ok: true } | { readonly ok: false, readonly reason: string }>

export interface TrunkRefs {
  /** The commit `refs/heads/<trunk>` points at; `undefined` when the branch does not exist. */
  readonly local: string | undefined
  /** The commit the remote-tracking reference points at; `undefined` when it does not exist or there is no remote. */
  readonly remote: string | undefined
}

export interface TrunkUpstream {
  readonly remote: string
  /** `refs/remotes/<remote>/<trunk>`, the reference the harness reads as the published trunk. */
  readonly tracking: string
}

export function createGit(runner: GitRunner = realGitRunner) {
  const run = (cwd: string, args: readonly string[], timeoutMs = READ_TIMEOUT_MS): Promise<GitResult> => runner(cwd, [...GLOBAL_OPTIONS, ...args], timeoutMs)

  async function read(cwd: string, args: readonly string[], timeoutMs = READ_TIMEOUT_MS): Promise<Outcome<string>> {
    const result = await run(cwd, args, timeoutMs)
    return result.code === 0 ? succeeded(result.stdout) : failed(describe(args, result))
  }

  /** Exit 0 is yes and exit 1 is no, the shape of `merge-base --is-ancestor` and `check-ignore`; anything else is a failure. */
  async function ask(cwd: string, args: readonly string[]): Promise<Outcome<boolean>> {
    const result = await run(cwd, args)
    return result.code === 0 || result.code === 1 ? succeeded(result.code === 0) : failed(describe(args, result))
  }

  async function firstLine(cwd: string, args: readonly string[]): Promise<string | undefined> {
    const result = await read(cwd, args)
    return result.ok && result.value.trim() !== '' ? result.value.trim().split(/\r?\n/)[0] : undefined
  }

  // --- facts about a repository

  /** The top of the work tree `cwd` is in; `undefined` outside a repository. */
  async function toplevel(cwd: string): Promise<string | undefined> {
    const top = await firstLine(cwd, ['rev-parse', '--show-toplevel'])
    return top === undefined ? undefined : resolve(top)
  }

  /** The branch HEAD is on; `undefined` for a detached head or outside a repository. */
  async function currentBranch(cwd: string): Promise<string | undefined> {
    return firstLine(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  }

  /** The full id of the commit a revision names; `undefined` when it names none. */
  async function resolveCommit(cwd: string, rev: string): Promise<string | undefined> {
    return isRev(rev) ? firstLine(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]) : undefined
  }

  /** The commit a local branch points at; `undefined` when there is no such branch. */
  async function branchTip(cwd: string, branch: string): Promise<string | undefined> {
    return isRefPart(branch) ? resolveCommit(cwd, `refs/heads/${branch}`) : undefined
  }

  async function mergeBase(cwd: string, a: string, b: string): Promise<Outcome<string | undefined>> {
    if (!isRev(a) || !isRev(b)) return failed('not a revision')
    const result = await run(cwd, ['merge-base', a, b])
    if (result.code === 0) return succeeded(result.stdout.trim() || undefined)
    return result.code === 1 ? succeeded(undefined) : failed(describe(['merge-base'], result))
  }

  /** Whether `ancestor` is reachable from `descendant`; a commit is its own ancestor. */
  async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<Outcome<boolean>> {
    return isRev(ancestor) && isRev(descendant) ? ask(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]) : failed('not a revision')
  }

  // --- the change list, the content of one file, the trailers

  /**
   * The files that differ between two commits. Renames are not detected
   * (`--no-renames`): a renamed file is a deleted path and an added path,
   * which is the stricter reading for the must-review list (§3.8.5), and a
   * `diff.renames` setting cannot change it. Submodule changes are listed.
   */
  async function changedFiles(cwd: string, from: string, to: string): Promise<Outcome<ChangedFile[]>> {
    if (!isRev(from) || !isRev(to)) return failed('not a revision')
    const result = await read(cwd, ['diff', '--no-renames', '--ignore-submodules=none', '--name-status', '-z', from, to, '--'])
    if (!result.ok) return result
    const files = parseNameStatus(result.value)
    return files === undefined ? failed('git diff printed a list that is not status and path pairs') : succeeded(files)
  }

  /** The tree entry (mode, type, object id) of a file in a commit; `undefined` when the commit has no such file. */
  async function entryAt(cwd: string, rev: string, path: string): Promise<Outcome<TreeEntry | undefined>> {
    if (!isRev(rev) || !isRepoFile(path)) return failed('not a revision or not a repository file path')
    const result = await read(cwd, ['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', rev, '--', path])
    return result.ok ? succeeded(findTreeEntry(result.value, path)) : result
  }

  /**
   * Whether a file is the same in two commits: same object id, same mode,
   * same kind. A file missing from both counts as the same (deleted in
   * both); a file in one and not the other does not. This is the comparison
   * of §3.8.4: squashing, rebasing or merging the commits around a file does
   * not change it, resolving a conflict in it does.
   */
  async function sameContent(cwd: string, a: string, b: string, path: string): Promise<Outcome<boolean>> {
    const [left, right] = await Promise.all([entryAt(cwd, a, path), entryAt(cwd, b, path)])
    if (!left.ok) return left
    if (!right.ok) return right
    return succeeded(sameEntry(left.value, right.value))
  }

  /** The commits in `from..to` that carry `Hourness-Task` trailers, newest first. */
  async function taskTrailers(cwd: string, from: string, to: string): Promise<Outcome<TrailerCommit[]>> {
    if (!isRev(from) || !isRev(to)) return failed('not a revision')
    const result = await read(cwd, ['log', TRAILER_FORMAT, `${from}..${to}`, '--'])
    return result.ok ? succeeded(parseTaskTrailers(result.value)) : result
  }

  /** The newest commit reachable from `base` whose trailers name the task (`M` of §3.1.2 step 4); `undefined` when the task never went in. */
  async function lastTaskCommit(cwd: string, base: string, task: string): Promise<Outcome<string | undefined>> {
    if (!isRev(base) || task === '' || task.startsWith('-')) return failed('not a revision or not a task id')
    // The grep only narrows the walk; the trailers decide, so `m7-1` does not match a commit of `m7-10`.
    const result = await read(cwd, ['log', TRAILER_FORMAT, '--fixed-strings', `--grep=${task}`, base, '--'])
    return result.ok ? succeeded(parseTaskTrailers(result.value).find(entry => entry.tasks.includes(task))?.commit) : result
  }

  // --- worktrees

  async function listWorktrees(cwd: string): Promise<Outcome<WorktreeEntry[]>> {
    const result = await read(cwd, ['worktree', 'list', '--porcelain'])
    return result.ok ? succeeded(parseWorktrees(result.value)) : result
  }

  /** The unclean files of a worktree: tracked files with changes and untracked files that are not ignored. */
  async function uncleanFiles(cwd: string): Promise<Outcome<{ readonly tracked: readonly string[], readonly untracked: readonly string[] }>> {
    const result = await read(cwd, ['status', '--porcelain', '-z', '--untracked-files=normal', '--no-renames'])
    return result.ok ? succeeded(parseStatus(result.value)) : result
  }

  /**
   * Make git ignore `.worktrees/` and `.hourness/` in every worktree of the
   * repository (§3.1.2 step 4), through the shared `ensureIgnored`, which
   * writes `info/exclude` of the main checkout and never repeats a line.
   * Nothing is written when a `.gitignore` already ignores the directory.
   * The line it writes is `.worktrees/`, which also covers the root-level
   * directory the design names as `/.worktrees/`. Returns the reason when
   * the file cannot be written.
   */
  async function ensureExcluded(top: string): Promise<string | undefined> {
    const root = projectOf(top)?.root ?? top
    for (const directory of [WORKTREES_DIR, '.hourness']) {
      const ignored = await ask(top, ['check-ignore', '--quiet', '--', `${directory}/x`])
      if (ignored.ok && ignored.value) continue
      try {
        await ensureIgnored(root, directory)
      }
      catch (error) {
        return `cannot write info/exclude for ${directory}/: ${(error as Error).message}`
      }
    }
    return undefined
  }

  /** `git worktree remove` without `--force`: git itself refuses an unclean worktree. */
  async function removeWorktree(cwd: string, path: string): Promise<Outcome<undefined>> {
    const result = await read(cwd, ['worktree', 'remove', '--', path], WRITE_TIMEOUT_MS)
    return result.ok ? succeeded(undefined) : result
  }

  /** `hz/<task>@<n>` for the first `n` from 1 that is no branch yet. */
  async function freeArchiveName(cwd: string, branch: string): Promise<string> {
    for (let n = 1; ; n++) {
      if (await branchTip(cwd, `${branch}@${n}`) === undefined) return `${branch}@${n}`
    }
  }

  /**
   * The task's worktree `.worktrees/hz-<task>` on branch `hz/<task>`
   * (§3.1.2 step 4). A branch that already went into the trunk is judged by
   * ancestry, not by name: `M`, the newest trunk commit with the task's
   * trailer, being an ancestor of the branch means the branch was made or
   * rebased after the merge, so it is reused; otherwise the branch is the
   * one that was merged, and a rework starts a new one: the old worktree is
   * removed (not forced; an unclean one refuses with `worktree_dirty` and
   * its files), the old branch is renamed to the first free `hz/<task>@<n>`
   * and a new branch and worktree start from the base. Nothing is deleted
   * but the clean worktree. Setup commands are the caller's, and they run
   * when `created` is true.
   */
  async function ensureWorktree(cwd: string, task: string): Promise<TaskWorktree | Refusal<WorktreeCode>> {
    if (!ID_PATTERN.test(task)) return refuse('bad_task', `"${task}" is not a node id`)
    if (task === GATE_NAME) return refuse('bad_task', `"${GATE_NAME}" names the gate worktree, not a task`)
    const top = await toplevel(cwd)
    if (top === undefined) return refuse('not_git', `${cwd} is not inside a git repository`)
    const base = await currentBranch(top)
    if (base === undefined) return refuse('no_base_branch', 'the main checkout has a detached head; check out the branch the work is based on')
    const excluded = await ensureExcluded(top)
    if (excluded !== undefined) return refuse('worktree_failed', excluded)

    const path = join(top, WORKTREES_DIR, `hz-${task}`)
    const branch = `hz/${task}`
    const listed = await listWorktrees(top)
    if (!listed.ok) return refuse('worktree_failed', listed.reason)
    let here = listed.value.find(entry => samePath(entry.path, path))
    const onDisk = await stat(path).then(() => true, () => false)
    if (here !== undefined && !onDisk) return refuse('worktree_failed', `${path} is registered as a worktree but is gone; git worktree prune clears the record`)
    if (here === undefined && onDisk) return refuse('worktree_failed', `${path} exists but is not a worktree of this repository`)
    let tip = await branchTip(top, branch)
    let renamedFrom: string | undefined

    if (tip !== undefined) {
      const merged = await lastTaskCommit(top, base, task)
      if (!merged.ok) return refuse('worktree_failed', merged.reason)
      const ancestry = merged.value === undefined ? undefined : await isAncestor(top, merged.value, `refs/heads/${branch}`)
      if (ancestry !== undefined && !ancestry.ok) return refuse('worktree_failed', ancestry.reason)
      if (ancestry?.value === false) {
        if (here !== undefined) {
          const unclean = await uncleanFiles(path)
          if (!unclean.ok) return refuse('worktree_failed', unclean.reason)
          const files = [...unclean.value.tracked, ...unclean.value.untracked]
          if (files.length > 0) return refuse('worktree_dirty', `the worktree of ${branch} has ${files.length} unclean file(s); commit or discard them before the rework starts`, files.slice(0, MAX_LISTED_FILES))
          const removed = await removeWorktree(top, path)
          if (!removed.ok) return refuse('worktree_failed', removed.reason)
          here = undefined
        }
        renamedFrom = await freeArchiveName(top, branch)
        const renamed = await read(top, ['branch', '--move', '--', branch, renamedFrom])
        if (!renamed.ok) return refuse('worktree_failed', renamed.reason)
        tip = undefined
      }
    }

    let created = false
    if (here !== undefined) {
      if (here.branch !== branch) return refuse('worktree_failed', `the worktree at ${path} is on ${here.branch ?? 'a detached head'}, not on ${branch}`)
    }
    else {
      const added = await read(top, tip === undefined ? ['worktree', 'add', '--quiet', '-b', branch, '--', path, base] : ['worktree', 'add', '--quiet', '--', path, branch], WRITE_TIMEOUT_MS)
      if (!added.ok) return refuse('worktree_failed', added.reason)
      created = true
    }
    const baseSha = await resolveCommit(top, `refs/heads/${base}`)
    if (baseSha === undefined) return refuse('worktree_failed', `cannot read the tip of ${base}`)
    return { ok: true, path, branch, base, baseSha, created, ...(renamedFrom === undefined ? {} : { renamedFrom }) }
  }

  /**
   * Why git does not run in `path` as the linked work tree the repository
   * registered for that directory; `undefined` when it does. A work tree's
   * `.git` file names its git directory, `<common>/worktrees/<name>`, and
   * that directory's `gitdir` file names the `.git` file back. A `.git` file
   * rewritten to name the repository's own git directory, another work
   * tree's record or another repository still makes `rev-parse
   * --show-toplevel` answer with `path`, and every command run there then
   * lands on the checkout or the work tree the file names.
   */
  async function foreignGitDir(root: string, path: string): Promise<string | undefined> {
    const [own, shared, expected] = await Promise.all([
      firstLine(path, ['rev-parse', '--absolute-git-dir']),
      firstLine(path, ['rev-parse', '--git-common-dir']),
      firstLine(root, ['rev-parse', '--git-common-dir']),
    ])
    if (own === undefined || shared === undefined || expected === undefined) return 'git does not report its git directory'
    const gitDir = resolve(own)
    const common = resolve(path, shared)
    if (!samePath(common, resolve(root, expected))) return `its .git file names a git directory of another repository (${gitDir})`
    if (!samePath(dirname(gitDir), join(common, 'worktrees'))) return `its .git file names ${gitDir}, which is not a work tree record of this repository`
    const back = await readFile(join(gitDir, 'gitdir'), 'utf8').then(text => text.trim(), () => undefined)
    if (back === undefined || !samePath(resolve(gitDir, back), join(path, '.git'))) return `its .git file names the work tree record ${gitDir}, which belongs to ${back === undefined ? 'no work tree' : back}`
    return undefined
  }

  /** Whether some reference (a branch, a tag, the stash, the gate's own record) holds the commit, so that moving a work tree off it abandons nothing. */
  async function isHeld(cwd: string, commit: string): Promise<Outcome<boolean>> {
    const result = await read(cwd, ['for-each-ref', '--count=1', '--format=%(refname)', '--contains', commit])
    return result.ok ? succeeded(result.value.trim() !== '') : result
  }

  /** Record `commit` as the one the harness left the gate worktree on, in the one reference the executor writes. */
  async function holdGateHead(root: string, commit: string): Promise<Outcome<undefined>> {
    const result = await read(root, ['update-ref', '-m', 'the harness left the gate worktree here', GATE_HEAD_REF, commit])
    return result.ok ? succeeded(undefined) : result
  }

  /**
   * Put the gate worktree `.worktrees/hz-gate` on `commit`, clean (§3.8.3
   * step 5). The destructive commands (`checkout --detach --force`, `reset
   * --hard`, `clean -fd`) run only here, in a directory the harness made
   * and nobody else is meant to use, so first the guard checks that it is
   * what the harness made: listed by `git worktree list`, present on disk,
   * on a detached head, and a work tree of its own for git. A directory that
   * lost its `.git` file would resolve to the main checkout above it, and a
   * `.git` file that names another git directory (`foreignGitDir`) would
   * send the commands there; either way the reset would land on work that
   * is not the gate's. A commit made in the directory since the harness
   * left it (no reference holds it, and the move would abandon it) is
   * refused too: the harness records the commit it leaves the worktree on
   * in `GATE_HEAD_REF`, so the commit it put there always has a holder and
   * only work done there since does not. Anything else (the main agent put
   * a branch on it, deleted it, replaced it) is refused and nothing is reset.
   *
   * Changes in it are saved before they are discarded, with the saver
   * standing for M3's `takeSnapshot`: once for `reset --hard` when tracked
   * files have changes, and once for `clean -fd` when untracked files that
   * are not ignored exist. (The design names only the `reset --hard` one;
   * that snapshot keeps untracked files only when they are in the way of the
   * reset, and `clean -fd` deletes the others.) A snapshot that cannot be
   * saved refuses with `gate_snapshot_failed` and discards nothing. Ignored
   * files (`node_modules`, build output) are kept. A gate worktree that does
   * not exist yet is created at the commit; the caller then runs setup.
   */
  async function prepareGateWorktree(request: { readonly root: string, readonly commit: string, readonly saveSnapshot: SnapshotSaver }): Promise<GateWorktree | Refusal<GateCode>> {
    const { root, commit, saveSnapshot } = request
    const invalid = (reason: string): Refusal<GateCode> => refuse('gate_worktree_invalid', reason)
    const path = join(root, WORKTREES_DIR, `hz-${GATE_NAME}`)
    const target = await resolveCommit(root, commit)
    if (target === undefined) return invalid(`${commit} is not a commit`)
    const listed = await listWorktrees(root)
    if (!listed.ok) return invalid(listed.reason)
    const entry = listed.value.find(item => samePath(item.path, path))
    const onDisk = await stat(path).then(() => true, () => false)

    if (entry === undefined) {
      if (onDisk) return invalid(`${path} exists but git does not list it as a worktree; remove it so the harness can make a new one`)
      const excluded = await ensureExcluded(root)
      if (excluded !== undefined) return invalid(excluded)
      const added = await read(root, ['worktree', 'add', '--quiet', '--detach', '--', path, target], WRITE_TIMEOUT_MS)
      if (!added.ok) return invalid(added.reason)
      const recorded = await holdGateHead(root, target)
      return recorded.ok ? { ok: true, path, created: true, snapshots: 0 } : invalid(recorded.reason)
    }
    if (!onDisk) return invalid(`${path} is listed as a worktree but is gone; git worktree prune clears the record`)
    if (!entry.detached) return invalid(`${path} is on ${entry.branch ?? 'a branch'}; the gate worktree must stay on a detached head`)
    // Without its own `.git` file the directory belongs, for git, to the repository above it: the main checkout.
    const top = await toplevel(path)
    if (top === undefined || !samePath(top, path)) return invalid(`git does not treat ${path} as a work tree of its own (it resolves to ${top ?? 'nothing'}); nothing was reset`)
    const foreign = await foreignGitDir(root, path)
    if (foreign !== undefined) return invalid(`${path} is not the work tree git registered for it: ${foreign}; nothing was reset`)
    const left = await resolveCommit(path, 'HEAD')
    if (left === undefined) return invalid(`${path} has no commit checked out; nothing was reset`)
    const kept = await isHeld(path, left)
    if (!kept.ok) return invalid(kept.reason)
    if (!kept.value) {
      const short = left.slice(0, 12)
      return invalid(`${path} is on ${short}, which no branch, tag or other reference holds (a commit made there after the harness left it, or the harness's record ${GATE_HEAD_REF} is gone); moving it would abandon that commit, so nothing was reset. Keep it with git branch <name> ${short}, or remove the worktree`)
    }

    const unclean = await uncleanFiles(path)
    if (!unclean.ok) return invalid(unclean.reason)
    const wanted: { readonly sub: string, readonly args: readonly string[] }[] = [
      ...(unclean.value.tracked.length > 0 ? [{ sub: 'reset', args: ['--hard'] }] : []),
      ...(unclean.value.untracked.length > 0 ? [{ sub: 'clean', args: ['-fd'] }] : []),
    ]
    for (const invocation of wanted) {
      const saved = await Promise.resolve().then(() => saveSnapshot(path, invocation, 'discard')).catch((error: unknown) => ({ ok: false as const, reason: (error as Error).message }))
      if (!saved.ok) return refuse('gate_snapshot_failed', `the snapshot before git ${invocation.sub} ${invocation.args.join(' ')} could not be saved: ${saved.reason}`)
    }
    const moved = await read(path, ['checkout', '--detach', '--force', target], WRITE_TIMEOUT_MS)
    if (!moved.ok) return invalid(moved.reason)
    // Recorded before the slow commands, so a crash after this point leaves a commit that has a holder.
    const recorded = await holdGateHead(root, target)
    if (!recorded.ok) return invalid(recorded.reason)
    for (const args of [['reset', '--hard'], ['clean', '-fd']]) {
      const result = await read(path, args, WRITE_TIMEOUT_MS)
      if (!result.ok) return invalid(result.reason)
    }
    const head = await resolveCommit(path, 'HEAD')
    if (head !== target) return invalid(`the gate worktree is on ${head ?? 'no commit'} after the reset, not on ${target}`)
    return { ok: true, path, created: false, snapshots: wanted.length }
  }

  // --- the trunk, its remote-tracking reference, the remote

  /**
   * The remote the trunk is published to and the reference that tracks it
   * (§3.8.4): the remote of the trunk's configured upstream, else `origin`;
   * `undefined` when the repository has no remote at all.
   */
  async function trunkUpstream(cwd: string, trunk: string): Promise<Outcome<TrunkUpstream | undefined>> {
    if (!isRefPart(trunk)) return failed('not a branch name')
    const remotes = await read(cwd, ['remote'])
    if (!remotes.ok) return remotes
    const names = remotes.value.split(/\r?\n/).map(name => name.trim()).filter(name => name !== '')
    if (names.length === 0) return succeeded(undefined)
    const configured = await firstLine(cwd, ['for-each-ref', '--format=%(upstream:remotename)', `refs/heads/${trunk}`])
    const remote = configured !== undefined && names.includes(configured) ? configured : 'origin'
    return succeeded({ remote, tracking: `refs/remotes/${remote}/${trunk}` })
  }

  /** The local trunk `L` and the remote-tracking reference `T`, read in one call. */
  async function trunkRefs(cwd: string, trunk: string, remote: string | undefined): Promise<Outcome<TrunkRefs>> {
    if (!isRefPart(trunk) || (remote !== undefined && !isRefPart(remote))) return failed('not a branch or remote name')
    const local = `refs/heads/${trunk}`
    const tracking = remote === undefined ? undefined : `refs/remotes/${remote}/${trunk}`
    const result = await read(cwd, ['for-each-ref', '--format=%(refname)%00%(objectname)', local, ...(tracking === undefined ? [] : [tracking])])
    if (!result.ok) return result
    const ids = new Map(result.value.split('\n').map((line) => { const [name = '', id = ''] = line.trim().split('\0'); return [name, id] as const }))
    return succeeded({ local: ids.get(local), remote: tracking === undefined ? undefined : ids.get(tracking) })
  }

  /** The message of the newest reflog entry of a reference, e.g. `update by push`; `undefined` when it has no reflog. */
  async function reflogSubject(cwd: string, ref: string): Promise<Outcome<string | undefined>> {
    if (!isRev(ref)) return failed('not a reference')
    const result = await read(cwd, ['reflog', 'show', '--format=%gs', '-n', '1', ref, '--'])
    return result.ok ? succeeded(result.value.split(/\r?\n/)[0]?.trim() || undefined) : result
  }

  /** Where the remote's trunk really is, asked of the remote itself; `undefined` when it has no such branch, a failure when it cannot be reached. */
  async function lsRemote(cwd: string, remote: string, trunk: string): Promise<Outcome<string | undefined>> {
    // A configured remote's name, never a URL: git would open whatever transport a URL names.
    if (!REMOTE_NAME.test(remote) || !isRefPart(trunk)) return failed('not a remote name or a branch name')
    const ref = `refs/heads/${trunk}`
    const result = await read(cwd, ['ls-remote', '--', remote, ref], REMOTE_TIMEOUT_MS)
    if (!result.ok) return result
    const line = result.value.split(/\r?\n/).map(text => text.split('\t')).find(([, name]) => name === ref)
    return succeeded(line?.[0])
  }

  // `run` stays inside: it takes any arguments, so exporting it would let a caller start merge, push or update-ref past every check below.
  return {
    toplevel, currentBranch, resolveCommit, branchTip, mergeBase, isAncestor,
    changedFiles, entryAt, sameContent, taskTrailers, lastTaskCommit,
    listWorktrees, ensureWorktree, removeWorktree, prepareGateWorktree,
    trunkUpstream, trunkRefs, reflogSubject, lsRemote,
  }
}

export type Git = ReturnType<typeof createGit>

// ---------------------------------------------------------------------------
// The watched files of the setup commands

/** What the setup commands watch when the norm's line names no paths (§3.8.1). */
export const DEFAULT_WATCHED = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'] as const

/**
 * A 12-digit digest of the watched files of a worktree (§3.8.1, §3.8.3 step
 * 6): the setup commands run again when it differs from the digest recorded
 * after the last run. It covers the content of each file, and whether it
 * exists, in a fixed order, so the list's order does not matter. A watched
 * path is a file: one that is a directory or cannot be read gets a fixed
 * marker and so reports no change of its own.
 */
export async function watchedDigest(directory: string, files: readonly string[] = DEFAULT_WATCHED): Promise<string> {
  const parts: string[] = []
  for (const name of [...new Set(files)].sort()) {
    const state = await readFile(join(directory, name)).then(
      bytes => createHash('sha256').update(bytes).digest('hex'),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? 'absent' : `unreadable:${error.code ?? 'unknown'}`,
    )
    parts.push(`${name}\0${state}`)
  }
  return digest12(parts.join('\n'))
}
