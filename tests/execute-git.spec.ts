/**
 * The git executor (src/execute/git.ts, M7 step E3) on real repositories in
 * temporary directories: the work happens in git, so the cases run git. The
 * process wrapper is run against `node -e` for exit codes, timeouts and a
 * missing program. Global git configuration is replaced by a fixed one
 * (a user, no autocrlf, no signing; the sandbox of tests/execute-repo.ts)
 * so the cases do not depend on the machine.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test, { describe, it, type TestContext } from 'node:test'
import {
  createGit, DEFAULT_WATCHED, execRunner, parseNameStatus, parseTaskTrailers, parseWorktrees, realGitRunner, reflogKind, watchedDigest,
  type Git, type GitResult, type GitRunner, type Outcome, type Refusal, type SnapshotSaver,
} from '../src/execute/git.ts'
import { sandbox } from './execute-repo.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const sameFile = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** Run git in `cwd` and return its trimmed output; throws when git fails. */
function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

interface Repo {
  readonly dir: string
  git: (...args: string[]) => string
  /** Write (a string) or delete (null) files, commit them all, and return the new commit. */
  commit: (files: Record<string, string | null>, message: string) => string
  /** A bare repository next to the work tree, added as `origin`, with `main` pushed to it. */
  withRemote: () => string
}

let counter = 0
/** The cases that need a repository; each has its own directory, so the suite at the end of the file runs them side by side. */
const repositoryCases: (readonly [string, (t: TestContext) => Promise<void>])[] = []

function withRepo(name: string, body: (repo: Repo, git: Git, t: TestContext) => Promise<void>): void {
  repositoryCases.push([name, async (t) => {
    const root = join(sandbox, `r${++counter}`)
    const dir = join(root, 'work')
    mkdirSync(dir, { recursive: true })
    sh(dir, 'init', '--quiet', '-b', 'main')
    const repo: Repo = {
      dir,
      git: (...args) => sh(dir, ...args),
      commit(files, message) {
        for (const [path, content] of Object.entries(files)) {
          const target = join(dir, path)
          if (content === null) rmSync(target, { force: true })
          else {
            mkdirSync(dirname(target), { recursive: true })
            writeFileSync(target, content)
          }
        }
        sh(dir, 'add', '--all')
        sh(dir, 'commit', '--quiet', '--allow-empty', '-m', message)
        return sh(dir, 'rev-parse', 'HEAD')
      },
      withRemote() {
        const remote = join(root, 'remote.git')
        sh(root, 'init', '--quiet', '--bare', '-b', 'main', remote)
        sh(dir, 'remote', 'add', 'origin', remote)
        sh(dir, 'push', '--quiet', '--set-upstream', 'origin', 'main')
        return remote
      },
    }
    try {
      await body(repo, createGit(), t)
    }
    finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }])
}

/** The value of an outcome that must have succeeded. */
function good<T>(outcome: Outcome<T>): T {
  if (!outcome.ok) assert.fail(`expected success, got: ${outcome.reason}`)
  return outcome.value
}

/** The refusal of a result that must be one. */
function refused<C extends string>(result: { readonly ok: true } | Refusal<C>): Refusal<C> {
  if (result.ok) assert.fail(`expected a refusal, got: ${JSON.stringify(result)}`)
  return result
}

/** The success of a result that must be one. */
function succeeded<T extends { readonly ok: true }>(result: T | Refusal<string>): T {
  if (!result.ok) assert.fail(`expected success, got ${result.code}: ${result.reason}`)
  return result
}

function recording(inner: GitRunner = realGitRunner): { readonly runner: GitRunner, readonly calls: string[][] } {
  const calls: string[][] = []
  return { calls, runner: (cwd, args, timeoutMs) => { calls.push([...args]); return inner(cwd, args, timeoutMs) } }
}

const lines = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
const okSaver: SnapshotSaver = () => Promise.resolve({ ok: true })

/** The subcommand of a recorded git call: the first word after the global options the executor puts in front of it. */
function subcommandOf(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '-c') index++
    else if (args[index] !== '--no-replace-objects' && args[index] !== '--literal-pathspecs') return args[index]
  }
  return undefined
}

/** A runner that runs git, except that a call `fails` picks comes back as git's exit 128; every call is recorded. */
function failing(fails: (cwd: string, args: readonly string[]) => boolean): { readonly runner: GitRunner, readonly calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: (cwd, args, timeoutMs) => {
      calls.push([...args])
      return fails(cwd, args) ? Promise.resolve({ code: 128, stdout: '', stderr: 'fatal: injected failure' }) : realGitRunner(cwd, args, timeoutMs)
    },
  }
}

// ---------------------------------------------------------------------------
// The process wrapper and what a failing git looks like

test('execRunner reports exit code and output, a timeout, a missing program and a missing directory without throwing', async () => {
  const node = execRunner(process.execPath)
  assert.deepEqual(await node(sandbox, ['-e', 'console.log("out"); console.error("err"); process.exit(3)'], 10_000), { code: 3, stdout: 'out\n', stderr: 'err\n' })
  assert.equal((await node(sandbox, ['-e', ''], 10_000)).code, 0)
  const started = Date.now()
  const slow = await node(sandbox, ['-e', 'setTimeout(() => {}, 30000)'], 300)
  assert.deepEqual([slow.code, slow.problem], [undefined, 'timeout'])
  assert.ok(Date.now() - started < 10_000, 'the process was ended at the timeout')
  assert.equal((await execRunner('no-such-program-for-execute-git')(sandbox, [], 1000)).problem, 'missing')
  assert.equal((await node(join(sandbox, 'no-such-directory'), ['-e', ''], 1000)).problem, 'missing')
})

test('a git that fails, hangs or is missing is an outcome with a reason, never a throw', async () => {
  const answer = (result: GitResult): Git => createGit(() => Promise.resolve(result))
  const exited = await answer({ code: 128, stdout: '', stderr: 'fatal: bad object\nmore\n' }).changedFiles(sandbox, 'a', 'b')
  assert.deepEqual(exited, { ok: false, reason: 'git diff exited 128: fatal: bad object | more' })
  const timedOut = await answer({ code: undefined, stdout: '', stderr: '', problem: 'timeout' }).changedFiles(sandbox, 'a', 'b')
  assert.deepEqual(timedOut, { ok: false, reason: 'git diff timed out' })
  const missing = await answer({ code: undefined, stdout: '', stderr: '', problem: 'missing' }).lsRemote(sandbox, 'origin', 'main')
  assert.equal(missing.ok, false)
  assert.match(missing.ok ? '' : missing.reason, /could not be started/)
  assert.equal(await answer({ code: 128, stdout: '', stderr: 'fatal' }).toplevel(sandbox), undefined)
})

test('the executor is a closed set of named operations: no entry point takes git arguments from the caller (E3 review, E3-3)', () => {
  assert.deepEqual(Object.keys(createGit()).sort(), [
    'branchTip', 'changedFiles', 'commitsBetween', 'currentBranch', 'discardWorktree', 'ensureWorktree', 'entryAt', 'isAncestor', 'lastTaskCommit', 'listWorktrees', 'lsRemote', 'mergeBase',
    'prepareGateWorktree', 'reflogSubject', 'remoteHeadBranch', 'remoteUrl', 'removeWorktree', 'resolveCommit', 'sameContent', 'stagedPaths', 'taskTrailers', 'toplevel', 'treeOf', 'trunkRefs', 'trunkUpstream',
  ], 'a new operation is added here on purpose, with its argument checks, after review')
})

withRepo('every git process the executor starts begins with --no-replace-objects and runs with the repository\'s hooks and fsmonitor off', async (repo) => {
  const { runner, calls } = recording()
  const git = createGit(runner)
  const base = repo.commit({ 'a.txt': 'one\n' }, 'first\n\nHourness-Task: task-1')
  const tip = repo.commit({ 'a.txt': 'two\n' }, 'second')
  repo.withRemote()
  await git.toplevel(repo.dir)
  await git.currentBranch(repo.dir)
  await git.resolveCommit(repo.dir, 'HEAD')
  await git.branchTip(repo.dir, 'main')
  await git.mergeBase(repo.dir, base, tip)
  await git.isAncestor(repo.dir, base, tip)
  await git.changedFiles(repo.dir, base, tip)
  await git.entryAt(repo.dir, tip, 'a.txt')
  await git.sameContent(repo.dir, base, tip, 'a.txt')
  await git.taskTrailers(repo.dir, base, tip)
  await git.lastTaskCommit(repo.dir, tip, 'task-1')
  await git.listWorktrees(repo.dir)
  const made = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  await git.removeWorktree(repo.dir, made.path)
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: tip, saveSnapshot: okSaver }))
  await git.trunkUpstream(repo.dir, 'main')
  await git.trunkRefs(repo.dir, 'main', 'origin')
  await git.reflogSubject(repo.dir, 'refs/remotes/origin/main')
  await git.lsRemote(repo.dir, 'origin', 'main')
  // E7's five operations (M7 design §3.8.3, §3.8.4, §3.11.1).
  await git.treeOf(repo.dir, tip)
  await git.remoteUrl(repo.dir, 'origin')
  await git.remoteHeadBranch(repo.dir, 'origin')
  await git.stagedPaths(repo.dir, true)
  await git.commitsBetween(repo.dir, base, tip)
  assert.ok(calls.length >= 30, `the cases ran ${calls.length} git processes`)
  assert.deepEqual(calls.filter(args => args[0] !== '--no-replace-objects'), [])
  // Behind it, the options that keep programs the repository's configuration names out of the executor's calls (E3 review, E3-6; E3 follow-up review, FU-4):
  // the hooks directory and the fsmonitor command, then the hooks defined in configuration for the three events these calls start.
  // The cases further down run real hooks and a real fsmonitor to show that these values do switch them off on this platform.
  assert.deepEqual(
    calls.filter(args => args[1] !== '-c' || args[2]?.startsWith('core.hooksPath=') !== true || args[3] !== '-c' || args[4] !== 'core.fsmonitor=false'),
    [],
  )
  assert.deepEqual(
    calls.filter(args => args.slice(5, 11).join(' ') !== '-c hook.post-checkout.enabled=false -c hook.reference-transaction.enabled=false -c hook.post-index-change.enabled=false'),
    [],
  )
  // update-ref is the executor's only way to write a reference with that command; it writes the gate worktree's record, never a branch, a tag or a tracking reference.
  // (ensureWorktree also creates and renames its own hz/<task> branches, with worktree add -b and branch --move.)
  const refWrites = calls.filter(args => subcommandOf(args) === 'update-ref')
  assert.ok(refWrites.length > 0)
  assert.ok(refWrites.every(args => args.includes('refs/hourness/gate-head')), JSON.stringify(refWrites))
  assert.deepEqual(calls.filter(args => ['push', 'fetch', 'pull', 'merge', 'tag'].includes(subcommandOf(args) ?? '')), [])
})

withRepo('git replace cannot change what the executor sees', async (repo, git) => {
  const first = repo.commit({ 'x.txt': 'one\n' }, 'first')
  const second = repo.commit({ 'x.txt': 'two\n' }, 'second')
  const realBlob = repo.git('--no-replace-objects', 'rev-parse', `${second}:x.txt`)
  // The second commit's tree is replaced by the first commit's tree: a plain git now shows no change and the old content.
  repo.git('replace', repo.git('--no-replace-objects', 'rev-parse', `${second}^{tree}`), repo.git('--no-replace-objects', 'rev-parse', `${first}^{tree}`))
  assert.equal(repo.git('diff', '--name-status', first, second), '', 'a plain git diff is blind to the change')
  assert.notEqual(repo.git('rev-parse', `${second}:x.txt`), realBlob, 'a plain git reads the replacement')
  assert.deepEqual(good(await git.changedFiles(repo.dir, first, second)), [{ status: 'M', path: 'x.txt' }])
  assert.equal(good(await git.entryAt(repo.dir, second, 'x.txt'))?.id, realBlob)
  assert.equal(good(await git.sameContent(repo.dir, first, second, 'x.txt')), false)
})

withRepo('a revision, branch or remote that starts with a dash never reaches git', async (repo) => {
  const { runner, calls } = recording()
  const git = createGit(runner)
  repo.commit({ 'a.txt': '1' }, 'first')
  assert.equal(await git.resolveCommit(repo.dir, '--output=oops'), undefined)
  assert.equal(await git.resolveCommit(repo.dir, 'HEAD HEAD'), undefined)
  assert.equal((await git.changedFiles(repo.dir, '-x', 'HEAD')).ok, false)
  assert.equal((await git.taskTrailers(repo.dir, 'HEAD', '--all')).ok, false)
  assert.equal((await git.lastTaskCommit(repo.dir, 'HEAD', '--all')).ok, false)
  assert.equal((await git.entryAt(repo.dir, 'HEAD', 'dir/')).ok, false)
  assert.equal((await git.lsRemote(repo.dir, '--upload-pack=x', 'main')).ok, false)
  assert.equal((await git.lsRemote(repo.dir, 'ext::sh', 'main')).ok, false, 'a URL is not a remote name')
  assert.equal((await git.lsRemote(repo.dir, 'https://example.invalid/r.git', 'main')).ok, false)
  assert.equal((await git.trunkRefs(repo.dir, 'main*', undefined)).ok, false)
  assert.equal((await git.reflogSubject(repo.dir, '-g')).ok, false)
  assert.equal(await git.branchTip(repo.dir, '-b'), undefined)
  assert.equal(calls.length, 0)
  const ensured = refused(await git.ensureWorktree(repo.dir, '-rf'))
  assert.equal(ensured.code, 'bad_task')
  assert.equal(calls.length, 0)
})

// ---------------------------------------------------------------------------
// The change list and the content of one file

withRepo('the change list treats a rename as a delete and an add, whatever diff.renames says, and reads odd file names raw', async (repo, git) => {
  const body = Array.from({ length: 30 }, (_, index) => `line ${index}\n`).join('')
  const first = repo.commit({ 'old.txt': body, 'keep.txt': 'k\n', 'drop.txt': 'd\n', '空 格/a b.txt': 'x\n' }, 'first')
  repo.git('config', 'diff.renames', 'copies')
  repo.git('mv', 'old.txt', 'new.txt')
  const second = repo.commit({ 'keep.txt': 'k2\n', 'drop.txt': null, 'added.txt': 'a\n', '空 格/a b.txt': 'y\n' }, 'second')
  assert.match(repo.git('diff', '--name-status', first, second), /^R\d+\s+old\.txt\s+new\.txt$/m, 'a plain git reports a rename')
  const files = good(await git.changedFiles(repo.dir, first, second))
  const sorted = [...files].sort((a, b) => a.path < b.path ? -1 : 1)
  assert.deepEqual(sorted, [
    { status: 'A', path: 'added.txt' },
    { status: 'D', path: 'drop.txt' },
    { status: 'M', path: 'keep.txt' },
    { status: 'A', path: 'new.txt' },
    { status: 'D', path: 'old.txt' },
    { status: 'M', path: '空 格/a b.txt' },
  ])
  assert.deepEqual(good(await git.changedFiles(repo.dir, second, second)), [])
  const bad = await git.changedFiles(repo.dir, first, 'no-such-revision')
  assert.equal(bad.ok, false)
  assert.match(bad.ok ? '' : bad.reason, /git diff exited 128/)
})

test('parseNameStatus reads status and path pairs and rejects anything else', () => {
  assert.deepEqual(parseNameStatus('A\0a b.txt\0D\0c\0'), [{ status: 'A', path: 'a b.txt' }, { status: 'D', path: 'c' }])
  assert.deepEqual(parseNameStatus(''), [])
  assert.equal(parseNameStatus('A\0a.txt\0D\0'), undefined)
})

withRepo('a file is the same after a squash or a rebase and not after a conflict was resolved in it', async (repo, git) => {
  const base = repo.commit({ 'f.txt': 'a\n', 'g.txt': 'g\n', 'h.txt': 'h\n' }, 'base')
  repo.git('checkout', '--quiet', '-b', 'topic')
  repo.commit({ 'f.txt': 'b\n' }, 't1')
  const reviewed = repo.commit({ 'f.txt': 'c\n' }, 't2')
  repo.git('checkout', '--quiet', 'main')

  // Squash: one new commit carries the final content of the branch.
  repo.git('merge', '--quiet', '--squash', 'topic')
  repo.git('commit', '--quiet', '-m', 'squash')
  const squashed = repo.git('rev-parse', 'HEAD')
  assert.equal(good(await git.sameContent(repo.dir, reviewed, squashed, 'f.txt')), true)
  assert.equal(good(await git.sameContent(repo.dir, reviewed, squashed, 'g.txt')), true)
  assert.equal(good(await git.sameContent(repo.dir, reviewed, squashed, 'missing.txt')), true, 'a file missing from both is the same')

  // Rebase: the commits are new, the file is not.
  repo.git('reset', '--quiet', '--hard', base)
  repo.commit({ 'h.txt': 'h2\n' }, 'main moves')
  repo.git('checkout', '--quiet', 'topic')
  repo.git('rebase', '--quiet', 'main')
  const rebased = repo.git('rev-parse', 'HEAD')
  assert.notEqual(rebased, reviewed)
  assert.equal(good(await git.sameContent(repo.dir, reviewed, rebased, 'f.txt')), true)
  assert.equal(good(await git.sameContent(repo.dir, reviewed, rebased, 'h.txt')), false, 'h.txt came from the trunk, not from the reviewed commit')

  // A merge whose conflict was resolved by hand: the resolved content was never reviewed.
  repo.git('checkout', '--quiet', 'main')
  repo.commit({ 'f.txt': 'x\n' }, 'main edits f')
  assert.throws(() => repo.git('merge', '--quiet', 'topic'))
  writeFileSync(join(repo.dir, 'f.txt'), 'resolved\n')
  repo.git('add', 'f.txt')
  repo.git('commit', '--quiet', '--no-edit')
  const merged = repo.git('rev-parse', 'HEAD')
  assert.equal(good(await git.sameContent(repo.dir, reviewed, merged, 'f.txt')), false)
  assert.equal(good(await git.sameContent(repo.dir, reviewed, merged, 'g.txt')), true)

  // Present in one commit and not the other, and a mode change.
  repo.commit({ 'g.txt': null }, 'delete g')
  assert.equal(good(await git.sameContent(repo.dir, merged, 'HEAD', 'g.txt')), false)
  assert.equal(good(await git.entryAt(repo.dir, 'HEAD', 'g.txt')), undefined)
  repo.git('update-index', '--chmod=+x', 'h.txt')
  repo.git('commit', '--quiet', '-m', 'make h executable')
  assert.equal(good(await git.sameContent(repo.dir, 'HEAD~1', 'HEAD', 'h.txt')), false, 'the mode is part of the content')
  assert.equal(good(await git.entryAt(repo.dir, 'HEAD', 'h.txt'))?.mode, '100755')
  assert.equal((await git.sameContent(repo.dir, 'HEAD', 'no-such-revision', 'h.txt')).ok, false, 'a revision that does not exist is a failure, not "the same"')
})

withRepo('a file name that looks like pathspec magic is read as the name it is', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo.dir, input: 'hello', encoding: 'utf8' }).trim()
  // Windows git refuses such a name unless told not to; other systems have repositories with them.
  repo.git('-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', `100644,${blob},:(top)x.txt`)
  repo.git('commit', '--quiet', '-m', 'odd name')
  assert.equal(good(await git.entryAt(repo.dir, 'HEAD', ':(top)x.txt'))?.id, blob, 'read as a plain pathspec it would be taken for x.txt and found absent')
  assert.equal(good(await git.entryAt(repo.dir, 'HEAD', 'x.txt')), undefined)
})

// ---------------------------------------------------------------------------
// Trailers

test('parseTaskTrailers keeps commits with a task, splits and de-duplicates the values', () => {
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  const c = 'c'.repeat(40)
  assert.deepEqual(parseTaskTrailers(`${a}\0m7-1,m7-2\n${b}\0\n${c}\0 m7-3 , m7-3\r\nnot a commit\0m7-4\n`), [
    { commit: a, tasks: ['m7-1', 'm7-2'] },
    { commit: c, tasks: ['m7-3'] },
  ])
})

withRepo('trailers: the trailer block decides, a mention in prose does not, and an id is not a prefix match', async (repo, git) => {
  const base = repo.commit({ 'a.txt': '0' }, 'base')
  const one = repo.commit({ 'a.txt': '1' }, 'one\n\nHourness-Task: task-1')
  repo.commit({ 'a.txt': '2' }, 'no trailer')
  const two = repo.commit({ 'a.txt': '3' }, 'two\n\nHourness-Task: task-2\nHourness-Task: task-3')
  repo.commit({ 'a.txt': '4' }, 'prose\n\nHourness-Task: task-9 is only mentioned here.\n\nThe rest is prose and has no trailers.')
  const ten = repo.commit({ 'a.txt': '5' }, 'ten\n\nHourness-Task: task-10')

  assert.deepEqual(good(await git.taskTrailers(repo.dir, base, 'HEAD')), [
    { commit: ten, tasks: ['task-10'] },
    { commit: two, tasks: ['task-2', 'task-3'] },
    { commit: one, tasks: ['task-1'] },
  ])
  assert.deepEqual(good(await git.taskTrailers(repo.dir, 'HEAD', 'HEAD')), [])
  assert.equal(good(await git.lastTaskCommit(repo.dir, 'HEAD', 'task-1')), one, 'task-10 is a different task')
  assert.equal(good(await git.lastTaskCommit(repo.dir, 'HEAD', 'task-3')), two)
  assert.equal(good(await git.lastTaskCommit(repo.dir, 'HEAD', 'task-10')), ten)
  assert.equal(good(await git.lastTaskCommit(repo.dir, 'HEAD', 'task-9')), undefined)
  assert.equal(good(await git.lastTaskCommit(repo.dir, 'HEAD', 'task')), undefined)
  assert.equal(good(await git.lastTaskCommit(repo.dir, base, 'task-1')), undefined, 'only commits reachable from the base count')
})

// ---------------------------------------------------------------------------
// Worktrees

test('parseWorktrees reads attached, detached and CRLF output', () => {
  const text = 'worktree C:/p/work\nHEAD aaa\nbranch refs/heads/main\n\nworktree C:/p/work/.worktrees/hz-gate\r\nHEAD bbb\r\ndetached\r\n\r\nworktree C:/p/work/.worktrees/hz-x\nHEAD ccc\nbranch refs/heads/hz/x\n'
  assert.deepEqual(parseWorktrees(text), [
    { path: 'C:/p/work', head: 'aaa', branch: 'main', detached: false },
    { path: 'C:/p/work/.worktrees/hz-gate', head: 'bbb', branch: undefined, detached: true },
    { path: 'C:/p/work/.worktrees/hz-x', head: 'ccc', branch: 'hz/x', detached: false },
  ])
})

withRepo('a task worktree is made once, on its own branch, and the directory stays out of git', async (repo, git) => {
  const tip = repo.commit({ 'a.txt': '1' }, 'first')
  const made = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.ok(sameFile(made.path, join(repo.dir, '.worktrees', 'hz-task-1')))
  assert.deepEqual([made.branch, made.base, made.baseSha, made.created, made.renamedFrom], ['hz/task-1', 'main', tip, true, undefined])
  assert.ok(existsSync(join(made.path, 'a.txt')))
  assert.equal(sh(made.path, 'symbolic-ref', '--short', 'HEAD'), 'hz/task-1')
  assert.equal(repo.git('status', '--porcelain'), '', '.worktrees/ is ignored in the main checkout')

  const exclude = lines(readFileSync(join(repo.dir, '.git', 'info', 'exclude'), 'utf8'))
  assert.equal(exclude.filter(line => line === '.worktrees/').length, 1)
  assert.equal(exclude.filter(line => line === '.hourness/').length, 1)

  const again = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([again.path, again.created, again.renamedFrom], [made.path, false, undefined])
  const second = succeeded(await git.ensureWorktree(repo.dir, 'task-2'))
  assert.equal(second.created, true)
  const exclude2 = lines(readFileSync(join(repo.dir, '.git', 'info', 'exclude'), 'utf8'))
  assert.deepEqual(exclude2, exclude, 'info/exclude is not written twice')
  assert.equal(good(await git.listWorktrees(repo.dir)).length, 3)
})

withRepo('an ignore rule the project already has is enough: info/exclude is left alone', async (repo, git) => {
  repo.commit({ '.gitignore': '.worktrees/\n.hourness/\n', 'a.txt': '1' }, 'first')
  const infoExclude = join(repo.dir, '.git', 'info', 'exclude')
  const before = readFileSync(infoExclude, 'utf8')
  succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.equal(readFileSync(infoExclude, 'utf8'), before)
})

withRepo('asked from a linked worktree, the ignore lines go to the main checkout\'s info/exclude, which every worktree reads', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const linked = join(dirname(repo.dir), 'linked')
  repo.git('worktree', 'add', '--quiet', '-b', 'side', linked)
  const made = succeeded(await git.ensureWorktree(linked, 'task-1'))
  assert.equal(made.base, 'side')
  assert.ok(sameFile(made.path, join(linked, '.worktrees', 'hz-task-1')))
  assert.equal(sh(linked, 'status', '--porcelain'), '', 'the linked worktree ignores the new directory too')
  assert.ok(lines(readFileSync(join(repo.dir, '.git', 'info', 'exclude'), 'utf8')).includes('.worktrees/'))
})

withRepo('a rework after a squash merge moves the merged branch aside, a rework after a fast-forward does not', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const first = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  sh(first.path, 'commit', '--quiet', '--allow-empty', '-m', 'work 1')
  writeFileSync(join(first.path, 'w.txt'), 'w1\n')
  sh(first.path, 'add', 'w.txt')
  sh(first.path, 'commit', '--quiet', '-m', 'work 2\n\nHourness-Task: task-1')
  const workerTip = sh(first.path, 'rev-parse', 'HEAD')

  // The main agent squashes the branch into the trunk; the trailer is on the squash commit.
  repo.git('merge', '--quiet', '--squash', 'hz/task-1')
  repo.git('commit', '--quiet', '-m', 'task-1 squashed\n\nHourness-Task: task-1')
  const squash = repo.git('rev-parse', 'HEAD')

  // A rework: the merged branch is not an ancestor of the squash commit's line, so it is set aside.
  const rework = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([rework.created, rework.renamedFrom, rework.baseSha], [true, 'hz/task-1@1', squash])
  assert.ok(sameFile(rework.path, first.path))
  assert.equal(repo.git('rev-parse', 'refs/heads/hz/task-1@1'), workerTip, 'the old branch keeps every commit')
  assert.equal(repo.git('rev-parse', 'refs/heads/hz/task-1'), squash, 'the new branch starts from the trunk')
  assert.equal(sh(rework.path, 'symbolic-ref', '--short', 'HEAD'), 'hz/task-1')
  assert.equal(readFileSync(join(rework.path, 'w.txt'), 'utf8'), 'w1\n', 'the new worktree has the merged work')

  // Another dispatch inside the same rework (the review failed, fix it) reuses the new branch.
  const next = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([next.created, next.renamedFrom], [false, undefined])
  sh(next.path, 'commit', '--quiet', '--allow-empty', '-m', 'fix')
  const reused = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([reused.created, reused.renamedFrom], [false, undefined], 'a commit on the new branch does not make it look merged')
  assert.deepEqual(lines(repo.git('branch', '--list', 'hz/task-1*', '--format=%(refname:short)')).sort(), ['hz/task-1', 'hz/task-1@1'])

  // The second rework gets the next free name.
  sh(next.path, 'commit', '--quiet', '--allow-empty', '-m', 'rework\n\nHourness-Task: task-1')
  repo.git('merge', '--quiet', '--squash', 'hz/task-1')
  repo.git('commit', '--quiet', '--allow-empty', '-m', 'task-1 squashed again\n\nHourness-Task: task-1')
  const third = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([third.created, third.renamedFrom], [true, 'hz/task-1@2'])

  // A fast-forward keeps the commits: the trailer commit is the branch's own history, so the branch is reused.
  const other = succeeded(await git.ensureWorktree(repo.dir, 'task-2'))
  sh(other.path, 'commit', '--quiet', '--allow-empty', '-m', 'done\n\nHourness-Task: task-2')
  repo.git('merge', '--quiet', '--ff-only', 'hz/task-2')
  const kept = succeeded(await git.ensureWorktree(repo.dir, 'task-2'))
  assert.deepEqual([kept.created, kept.renamedFrom], [false, undefined])
})

withRepo('a tag named like the trunk does not hide the branch: the base is read from the full reference everywhere (E3 review, E3-4)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'first')
  repo.git('tag', 'main', c1)
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'second\n\nHourness-Task: task-1')
  assert.equal(repo.git('rev-parse', 'main'), c1, 'the bare name now resolves to the tag')
  assert.equal(await git.currentBranch(repo.dir), 'main', '--short would print heads/main')

  // The old branch of task-1 is not an ancestor of the trailer commit on the trunk, so this is a rework: it is moved aside
  // and the new branch starts from the trunk branch. A walk from the bare name "main" would start at the tag and find no trailer.
  repo.git('branch', 'hz/task-1', c1)
  const rework = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([rework.base, rework.baseSha, rework.created, rework.renamedFrom], ['main', c2, true, 'hz/task-1@1'])
  assert.equal(sh(rework.path, 'rev-parse', 'HEAD'), c2, 'the worktree starts from the branch, not from the tag')

  const fresh = succeeded(await git.ensureWorktree(repo.dir, 'task-2'))
  assert.deepEqual([fresh.baseSha, fresh.created], [c2, true])
  assert.equal(sh(fresh.path, 'rev-parse', 'HEAD'), c2)
  assert.equal(succeeded(await git.ensureWorktree(repo.dir, 'task-2')).created, false, 'and again on the next call')
})

withRepo('a rework with an unclean old worktree refuses and changes nothing', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const made = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  sh(made.path, 'commit', '--quiet', '--allow-empty', '-m', 'work')
  repo.git('merge', '--quiet', '--squash', 'hz/task-1')
  repo.git('commit', '--quiet', '--allow-empty', '-m', 'squashed\n\nHourness-Task: task-1')
  writeFileSync(join(made.path, 'a.txt'), 'edited\n')
  writeFileSync(join(made.path, 'untracked.txt'), 'u\n')
  const tipBefore = repo.git('rev-parse', 'refs/heads/hz/task-1')

  const result = refused(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.equal(result.code, 'worktree_dirty')
  assert.deepEqual([...(result.files ?? [])].sort(), ['a.txt', 'untracked.txt'])
  assert.ok(existsSync(join(made.path, 'untracked.txt')), 'nothing was removed')
  assert.equal(repo.git('rev-parse', 'refs/heads/hz/task-1'), tipBefore, 'the branch was not renamed')
  assert.equal(repo.git('branch', '--list', 'hz/task-1@*'), '')

  // git itself refuses to remove it without --force.
  const removal = await git.removeWorktree(repo.dir, made.path)
  assert.equal(removal.ok, false)
  assert.ok(existsSync(made.path))
  writeFileSync(join(made.path, 'a.txt'), '1')
  rmSync(join(made.path, 'untracked.txt'))
  assert.equal((await git.removeWorktree(repo.dir, made.path)).ok, true)
  assert.ok(!existsSync(made.path))
})

withRepo('a branch whose worktree is gone gets a new worktree, and the broken states are refused with the reason', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const made = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  sh(made.path, 'commit', '--quiet', '--allow-empty', '-m', 'work')
  const tip = sh(made.path, 'rev-parse', 'HEAD')
  assert.equal((await git.removeWorktree(repo.dir, made.path)).ok, true)
  const back = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.deepEqual([back.created, back.renamedFrom], [true, undefined])
  assert.equal(sh(back.path, 'rev-parse', 'HEAD'), tip, 'the branch kept its commits')

  rmSync(back.path, { recursive: true, force: true })
  const gone = refused(await git.ensureWorktree(repo.dir, 'task-1'))
  assert.equal(gone.code, 'worktree_failed')
  assert.match(gone.reason, /registered as a worktree but is gone/)

  mkdirSync(join(repo.dir, '.worktrees', 'hz-task-3'), { recursive: true })
  writeFileSync(join(repo.dir, '.worktrees', 'hz-task-3', 'stray.txt'), 's')
  const stray = refused(await git.ensureWorktree(repo.dir, 'task-3'))
  assert.equal(stray.code, 'worktree_failed')
  assert.match(stray.reason, /not a worktree of this repository/)

  const wrong = succeeded(await git.ensureWorktree(repo.dir, 'task-4'))
  sh(wrong.path, 'checkout', '--quiet', '-b', 'other')
  assert.match(refused(await git.ensureWorktree(repo.dir, 'task-4')).reason, /is on other, not on hz\/task-4/)
})

// git finds a repository by walking up from the folder: with the temporary directory inside one, a folder made under it is not outside git.
test('no worktree outside a repository', { skip: skipIfTempInsideGit() }, async () => {
  const nowhere = join(sandbox, 'not-a-repository')
  mkdirSync(nowhere, { recursive: true })
  assert.equal(refused(await createGit().ensureWorktree(nowhere, 'task-1')).code, 'not_git')
})

withRepo('no worktree from a detached main checkout, and a bad task id is refused first', async (repo, git) => {
  const first = repo.commit({ 'a.txt': '1' }, 'first')
  assert.equal(refused(await git.ensureWorktree(repo.dir, 'Task 1')).code, 'bad_task')
  assert.equal(refused(await git.ensureWorktree(repo.dir, '../escape')).code, 'bad_task')
  assert.equal(refused(await git.ensureWorktree(repo.dir, 'gate')).code, 'bad_task', 'hz-gate is the gate worktree\'s directory')
  repo.git('checkout', '--quiet', '--detach', first)
  assert.equal(refused(await git.ensureWorktree(repo.dir, 'task-1')).code, 'no_base_branch')
  assert.ok(!existsSync(join(repo.dir, '.worktrees')))
})

// ---------------------------------------------------------------------------
// The gate worktree

interface SnapshotCall {
  readonly repo: string
  readonly sub: string
  readonly args: readonly string[]
  readonly risk: string
}

function snapshotSaver(calls: SnapshotCall[], answer: 'ok' | 'fail' | 'throw' = 'ok', during?: () => void): SnapshotSaver {
  return (repo, invocation, risk) => {
    calls.push({ repo, sub: invocation.sub, args: [...invocation.args], risk })
    during?.()
    if (answer === 'throw') return Promise.reject(new Error('the snapshot code crashed'))
    return Promise.resolve(answer === 'ok' ? { ok: true } : { ok: false, reason: 'disk full' })
  }
}

/** Replace a worktree's `.git` file; on Windows git marks it hidden, which refuses a plain overwrite, so it is deleted first. */
function rewriteGitFile(worktree: string, text: string): void {
  rmSync(join(worktree, '.git'), { force: true })
  writeFileSync(join(worktree, '.git'), text)
}

withRepo('the gate worktree is made detached on the commit and moved from commit to commit', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n', 'b.txt': 'b\n' }, 'c2')
  const calls: SnapshotCall[] = []

  const created = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  assert.ok(sameFile(created.path, join(repo.dir, '.worktrees', 'hz-gate')))
  assert.deepEqual([created.created, created.snapshots], [true, 0])
  assert.equal(sh(created.path, 'rev-parse', 'HEAD'), c1)
  assert.equal(await git.currentBranch(created.path), undefined, 'the gate worktree has a detached head')

  const moved = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
  assert.deepEqual([moved.created, moved.snapshots, moved.path], [false, 0, created.path])
  assert.equal(sh(moved.path, 'rev-parse', 'HEAD'), c2)
  assert.equal(readFileSync(join(moved.path, 'b.txt'), 'utf8'), 'b\n')
  assert.equal(calls.length, 0, 'a clean gate worktree is moved without a snapshot')
  assert.equal(repo.git('status', '--porcelain'), '', 'the main checkout does not see the gate worktree')
})

withRepo('changes in the gate worktree are saved first, then discarded; ignored files stay', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n', '.gitignore': 'node_modules/\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const calls: SnapshotCall[] = []
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  mkdirSync(join(gate.path, 'node_modules', 'pkg'), { recursive: true })
  writeFileSync(join(gate.path, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1\n')

  // Only an ignored file differs: nothing to save, nothing discarded.
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(calls.length, 0)
  assert.ok(existsSync(join(gate.path, 'node_modules', 'pkg', 'index.js')))

  // A tracked file edited and a new file: both are still there when the saver runs.
  writeFileSync(join(gate.path, 'a.txt'), 'edited by someone\n')
  writeFileSync(join(gate.path, 'new.txt'), 'n\n')
  const atSave: boolean[] = []
  const reset = succeeded(await git.prepareGateWorktree({
    root: repo.dir,
    commit: c1,
    saveSnapshot: snapshotSaver(calls, 'ok', () => atSave.push(readFileSync(join(gate.path, 'a.txt'), 'utf8') === 'edited by someone\n' && existsSync(join(gate.path, 'new.txt')))),
  }))
  assert.deepEqual(atSave, [true, true], 'the snapshots are taken before anything is discarded')
  assert.deepEqual(calls.map(call => [call.sub, call.args, call.risk]), [['reset', ['--hard'], 'discard'], ['clean', ['-fd'], 'discard']])
  assert.ok(calls.every(call => sameFile(call.repo, gate.path)))
  assert.equal(reset.snapshots, 2)
  assert.equal(readFileSync(join(gate.path, 'a.txt'), 'utf8'), '1\n')
  assert.ok(!existsSync(join(gate.path, 'new.txt')))
  assert.ok(existsSync(join(gate.path, 'node_modules', 'pkg', 'index.js')), 'ignored files stay')
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c1)

  // Untracked only: just the clean snapshot. Tracked only: just the reset snapshot.
  calls.length = 0
  writeFileSync(join(gate.path, 'new.txt'), 'n\n')
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
  assert.deepEqual(calls.map(call => call.sub), ['clean'])
  calls.length = 0
  writeFileSync(join(gate.path, 'a.txt'), 'edited again\n')
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  assert.deepEqual(calls.map(call => call.sub), ['reset'])
})

withRepo('a snapshot that cannot be saved stops the reset and discards nothing', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
  writeFileSync(join(gate.path, 'a.txt'), 'precious\n')
  writeFileSync(join(gate.path, 'new.txt'), 'precious\n')
  for (const answer of ['fail', 'throw'] as const) {
    const calls: SnapshotCall[] = []
    const result = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls, answer) }))
    assert.equal(result.code, 'gate_snapshot_failed')
    assert.match(result.reason, answer === 'fail' ? /disk full/ : /the snapshot code crashed/)
    assert.equal(calls.length, 1, 'it stops at the first snapshot that fails')
    assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c1, 'the gate worktree did not move')
    assert.equal(readFileSync(join(gate.path, 'a.txt'), 'utf8'), 'precious\n')
    assert.equal(readFileSync(join(gate.path, 'new.txt'), 'utf8'), 'precious\n')
  }
})

withRepo('a gate worktree the harness did not leave as it made it is refused and nothing in it is reset', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const calls: SnapshotCall[] = []
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))

  // The main agent put a branch on it.
  sh(gate.path, 'checkout', '--quiet', '-b', 'oops')
  writeFileSync(join(gate.path, 'a.txt'), 'work in progress\n')
  const onBranch = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(onBranch.code, 'gate_worktree_invalid')
  assert.match(onBranch.reason, /on oops/)
  assert.equal(readFileSync(join(gate.path, 'a.txt'), 'utf8'), 'work in progress\n')
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c1)
  assert.equal(calls.length, 0)

  // The directory lost its .git file: git would find the main checkout above it, and the reset would land there.
  sh(gate.path, 'checkout', '--quiet', '--detach')
  writeFileSync(join(repo.dir, 'a.txt'), 'edit in the main checkout\n')
  const gitFile = readFileSync(join(gate.path, '.git'), 'utf8')
  rmSync(join(gate.path, '.git'))
  const lost = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(lost.code, 'gate_worktree_invalid')
  assert.match(lost.reason, /work tree of its own/)
  assert.equal(readFileSync(join(repo.dir, 'a.txt'), 'utf8'), 'edit in the main checkout\n', 'the main checkout was not touched')
  assert.equal(repo.git('rev-parse', 'HEAD'), c2)
  assert.equal(calls.length, 0)
  writeFileSync(join(gate.path, '.git'), gitFile)
  repo.git('checkout', '--quiet', '--', 'a.txt')

  // The directory is gone but git still lists it.
  sh(gate.path, 'checkout', '--quiet', '--detach')
  rmSync(gate.path, { recursive: true, force: true })
  assert.match(refused(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: okSaver })).reason, /listed as a worktree but is gone/)
  repo.git('worktree', 'prune')

  // A directory of that name that git does not know.
  mkdirSync(gate.path, { recursive: true })
  writeFileSync(join(gate.path, 'stray.txt'), 's')
  const stray = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: okSaver }))
  assert.equal(stray.code, 'gate_worktree_invalid')
  assert.ok(existsSync(join(gate.path, 'stray.txt')))
  rmSync(gate.path, { recursive: true, force: true })

  assert.equal(refused(await git.prepareGateWorktree({ root: repo.dir, commit: 'no-such-commit', saveSnapshot: okSaver })).code, 'gate_worktree_invalid')
  assert.equal(succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: okSaver })).created, true, 'once the leftovers are gone the harness makes a new one')
})

withRepo('a gate worktree whose .git file names another git directory is refused, whichever one it names, and nothing is reset (E3 review, E3-1)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const calls: SnapshotCall[] = []
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  const task = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  const foreign = join(dirname(repo.dir), 'foreign')
  mkdirSync(foreign)
  sh(foreign, 'init', '--quiet', '-b', 'main')
  sh(foreign, 'commit', '--quiet', '--allow-empty', '-m', 'other repository')
  const gitFile = readFileSync(join(gate.path, '.git'), 'utf8')
  // Work the person has not saved, in the checkout a redirected reset would land on.
  writeFileSync(join(repo.dir, 'a.txt'), 'unsaved work in the main checkout\n')
  writeFileSync(join(repo.dir, 'unsaved.txt'), 'u\n')
  const taskHead = sh(task.path, 'rev-parse', 'HEAD')

  const redirects: readonly (readonly [string, string])[] = [
    ['the main checkout\'s git directory', join(repo.dir, '.git')],
    ['the record of a task worktree', join(repo.dir, '.git', 'worktrees', 'hz-task-1')],
    ['another repository', join(foreign, '.git')],
  ]
  for (const [label, target] of redirects) {
    rewriteGitFile(gate.path, `gitdir: ${target.replaceAll('\\', '/')}\n`)
    const result = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
    assert.equal(result.code, 'gate_worktree_invalid', label)
    assert.equal(calls.length, 0, `${label}: no snapshot was asked for`)
    assert.equal(repo.git('symbolic-ref', 'HEAD'), 'refs/heads/main', `${label}: the main checkout stays on its branch`)
    assert.equal(readFileSync(join(repo.dir, 'a.txt'), 'utf8'), 'unsaved work in the main checkout\n', `${label}: the main checkout's edit is still there`)
    assert.ok(existsSync(join(repo.dir, 'unsaved.txt')), `${label}: the main checkout's new file is still there`)
    assert.equal(sh(task.path, 'symbolic-ref', '--short', 'HEAD'), 'hz/task-1', `${label}: the task worktree stays on its branch`)
    assert.equal(sh(task.path, 'rev-parse', 'HEAD'), taskHead)
  }

  rewriteGitFile(gate.path, gitFile)
  assert.equal(succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: okSaver })).created, false, 'with its own .git file back the gate worktree is usable')
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c2)
})

withRepo('a commit made in the gate worktree is not abandoned: the move is refused until a reference holds it (E3 review, E3-2)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const calls: SnapshotCall[] = []
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  writeFileSync(join(gate.path, 'made.txt'), 'made in the gate worktree\n')
  sh(gate.path, 'add', 'made.txt')
  sh(gate.path, 'commit', '--quiet', '-m', 'made in the gate worktree')
  const made = sh(gate.path, 'rev-parse', 'HEAD')
  assert.equal(repo.git('for-each-ref', '--contains', made), '', 'no reference holds the commit, only the gate worktree\'s HEAD')

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
    assert.equal(result.code, 'gate_worktree_invalid')
    assert.match(result.reason, /no branch, tag or other reference holds/)
    assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), made, 'the gate worktree did not move')
    assert.equal(readFileSync(join(gate.path, 'made.txt'), 'utf8'), 'made in the gate worktree\n')
    assert.equal(calls.length, 0, 'nothing was snapshotted or discarded')
  }

  // Once a branch holds the commit, moving away loses nothing.
  repo.git('branch', 'keep', made)
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c2)
  assert.equal(repo.git('rev-parse', 'keep'), made)
})

withRepo('the commit the harness left the gate worktree on is held by a reference of its own, so it stays movable after its branch is gone', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  repo.git('checkout', '--quiet', '-b', 'topic')
  const t1 = repo.commit({ 'a.txt': '1\n', 't.txt': 't\n' }, 't1')
  repo.git('checkout', '--quiet', 'main')
  const calls: SnapshotCall[] = []
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: t1, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(repo.git('rev-parse', 'refs/hourness/gate-head'), t1, 'the record is made when the worktree is created')

  // The branch is rebased or amended away: nothing but the record holds t1 now. The next check must still be able to start.
  repo.git('branch', '-D', 'topic')
  assert.equal(repo.git('for-each-ref', '--format=%(refname)', '--contains', t1), 'refs/hourness/gate-head')
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c1)
  assert.equal(repo.git('rev-parse', 'refs/hourness/gate-head'), c1, 'the record follows the gate worktree')

  // A commit made on top of the left one is still caught: the record names the left commit, not the new one.
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: t1, saveSnapshot: snapshotSaver(calls) }))
  sh(gate.path, 'commit', '--quiet', '--allow-empty', '-m', 'made after the harness left')
  const refusal = refused(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: snapshotSaver(calls) }))
  assert.equal(refusal.code, 'gate_worktree_invalid')
  assert.equal(calls.length, 0)

  // The record is the only reference the executor writes with update-ref, and the only one under refs/hourness.
  assert.equal(lines(repo.git('for-each-ref', '--format=%(refname)', 'refs/hourness')).join(), 'refs/hourness/gate-head')
})

interface InjectedFailure {
  readonly label: string
  readonly fails: (cwd: string, args: readonly string[]) => boolean
}

withRepo('a git failure while the gate guard reads or records state refuses the move, and neither reset nor clean starts (E3 follow-up review, FU-3)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
  const inGate = (cwd: string): boolean => sameFile(cwd, gate.path)
  const beforeMove: readonly InjectedFailure[] = [
    { label: 'the gate worktree\'s git directory', fails: (cwd, args) => inGate(cwd) && args.includes('--absolute-git-dir') },
    { label: 'the gate worktree\'s common git directory', fails: (cwd, args) => inGate(cwd) && args.includes('--git-common-dir') },
    { label: 'the main checkout\'s common git directory', fails: (cwd, args) => !inGate(cwd) && args.includes('--git-common-dir') },
    { label: 'the references that hold the commit it is on', fails: (_cwd, args) => subcommandOf(args) === 'for-each-ref' && args.includes('--contains') },
  ]
  for (const { label, fails } of beforeMove) {
    writeFileSync(join(gate.path, 'a.txt'), 'precious\n')
    const saved: SnapshotCall[] = []
    const { runner, calls } = failing(fails)
    const result = refused(await createGit(runner).prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(saved) }))
    assert.equal(result.code, 'gate_worktree_invalid', label)
    assert.deepEqual(calls.map(subcommandOf).filter(sub => ['checkout', 'reset', 'clean'].includes(sub ?? '')), [], `${label}: nothing that moves or discards was started`)
    assert.equal(saved.length, 0, `${label}: no snapshot was asked for`)
    assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c1, `${label}: the gate worktree did not move`)
    assert.equal(readFileSync(join(gate.path, 'a.txt'), 'utf8'), 'precious\n', `${label}: the edit is still there`)
    // The refusal is for that call only: with git answering again the same worktree is usable.
    succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
    assert.equal(readFileSync(join(gate.path, 'a.txt'), 'utf8'), '1\n', `${label}: and the next call moves and cleans it`)
  }

  // Recording the commit it is left on fails after the checkout: the snapshot is already saved, reset and clean do not start.
  writeFileSync(join(gate.path, 'a.txt'), 'precious\n')
  const saved: SnapshotCall[] = []
  const { runner, calls } = failing((_cwd, args) => subcommandOf(args) === 'update-ref')
  const recorded = refused(await createGit(runner).prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: snapshotSaver(saved) }))
  assert.equal(recorded.code, 'gate_worktree_invalid')
  assert.deepEqual(saved.map(call => call.sub), ['reset'], 'what the checkout discards was saved first')
  assert.deepEqual(calls.map(subcommandOf).filter(sub => ['reset', 'clean'].includes(sub ?? '')), [], 'neither reset nor clean was started')
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c1)
})

withRepo('a git failure while the new gate worktree\'s commit is recorded is a refusal, and the next call finds a usable worktree (E3 follow-up review, FU-3)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const { runner, calls } = failing((_cwd, args) => subcommandOf(args) === 'update-ref')
  const result = refused(await createGit(runner).prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
  assert.equal(result.code, 'gate_worktree_invalid')
  assert.deepEqual(calls.map(subcommandOf).filter(sub => ['reset', 'clean'].includes(sub ?? '')), [])
  assert.equal(succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver })).created, false)
})

// ---------------------------------------------------------------------------
// The repository's own programs stay out of the executor's calls (E3 review, E3-6)

/** An executable script that appends its own name to `marker` each time git runs it; returns its path with `/` separators. */
function writeProgram(directory: string, name: string, marker: string): string {
  mkdirSync(directory, { recursive: true })
  const file = join(directory, name)
  writeFileSync(file, `#!/bin/sh\necho ${name} >> '${marker.replaceAll('\\', '/')}'\n`, { mode: 0o755 })
  return file.replaceAll('\\', '/')
}

/** The names the programs left in `marker`, in the order they ran. */
const ranPrograms = (marker: string): string[] => existsSync(marker) ? lines(readFileSync(marker, 'utf8')) : []

/**
 * The same git work with plain git, to show that a program configured for it runs on this machine: a worktree added, moved with
 * `checkout --detach --force` and `reset --hard`, and a reference written. Cleans up after itself.
 */
function plainCheckoutsAndRefWrites(repo: Repo, c1: string, c2: string, options: readonly string[] = []): void {
  const control = join(dirname(repo.dir), 'control')
  sh(repo.dir, ...options, 'worktree', 'add', '--quiet', '--detach', control, c1)
  sh(control, ...options, 'checkout', '--quiet', '--detach', '--force', c2)
  sh(control, ...options, 'reset', '--quiet', '--hard', c2)
  sh(repo.dir, ...options, 'update-ref', 'refs/control/x', c1)
  sh(repo.dir, ...options, 'worktree', 'remove', '--force', control)
  sh(repo.dir, ...options, 'update-ref', '-d', 'refs/control/x')
}

/**
 * Every executor call that checks out or writes a reference: a task worktree made (a new branch and a checkout), then found again,
 * the gate worktree made (worktree add, update-ref) and moved with changes in it (checkout, update-ref, reset, clean), a worktree removed.
 */
async function executorCheckoutsAndRefWrites(repo: Repo, git: Git, c1: string, c2: string): Promise<void> {
  const task = succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  succeeded(await git.ensureWorktree(repo.dir, 'task-1'))
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
  writeFileSync(join(gate.path, 'a.txt'), 'edited\n')
  writeFileSync(join(gate.path, 'new.txt'), 'n\n')
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: okSaver }))
  good(await git.removeWorktree(repo.dir, task.path))
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c2, 'the calls did their work')
  assert.equal(repo.git('rev-parse', 'refs/hourness/gate-head'), c2)
}

withRepo('the repository\'s hooks do not run inside the executor\'s git calls: post-checkout and reference-transaction (E3 review, E3-6)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const outside = dirname(repo.dir)
  const marker = join(outside, 'hooks-ran.txt')
  for (const hook of ['post-checkout', 'reference-transaction']) writeProgram(join(outside, 'hooks'), hook, marker)
  repo.git('config', 'core.hooksPath', join(outside, 'hooks').replaceAll('\\', '/'))

  // Control: plain git runs both hooks on this machine, so an empty marker after the executor's calls says something.
  plainCheckoutsAndRefWrites(repo, c1, c2)
  assert.deepEqual([...new Set(ranPrograms(marker))].sort(), ['post-checkout', 'reference-transaction'], 'plain git runs the hooks here')
  rmSync(marker)

  await executorCheckoutsAndRefWrites(repo, git, c1, c2)
  assert.deepEqual(ranPrograms(marker), [], 'no hook ran')
})

/** The hook events a configuration can name (`hook.<name>.event`) that this repository's local work could start; the first three are the ones the executor's calls do start. */
const CONFIG_HOOK_EVENTS = [
  'post-checkout', 'reference-transaction', 'post-index-change',
  'applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit',
  'pre-rebase', 'post-merge', 'pre-push', 'pre-auto-gc', 'post-rewrite', 'push-to-checkout',
] as const

withRepo('hooks defined in git configuration do not run inside the executor\'s git calls (E3 follow-up review, FU-4)', async (repo, git, t) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const outside = dirname(repo.dir)
  const marker = join(outside, 'config-hooks-ran.txt')
  // A hook in configuration runs in addition to the hooks directory, so `core.hooksPath` cannot switch it off. Its friendly name may not be an event name.
  for (const event of CONFIG_HOOK_EVENTS) {
    repo.git('config', `hook.watch-${event}.command`, writeProgram(join(outside, 'config-hooks'), event, marker))
    repo.git('config', `hook.watch-${event}.event`, event)
  }

  // Controls. Plain git runs the three hooks the executor's calls start. A git that does not read hooks from configuration (before 2.54) runs
  // none of them, and a git that reads them but has no switch per event (2.54: only `hook.<name>.enabled`; `hook.<event>.enabled` is from 2.55)
  // runs them with the executor's options too. In both cases the case has nothing to show and is skipped with that reason, not passed vacuously.
  const version = sh(repo.dir, 'version')
  plainCheckoutsAndRefWrites(repo, c1, c2)
  const control = new Set(ranPrograms(marker))
  if (control.size === 0) {
    t.skip(`${version} does not run hooks defined in configuration (hook.<name>.event)`)
    return
  }
  for (const event of ['post-checkout', 'reference-transaction', 'post-index-change']) assert.ok(control.has(event), `plain git runs the ${event} hook defined in configuration here`)
  rmSync(marker)
  plainCheckoutsAndRefWrites(repo, c1, c2, ['-c', 'hook.post-checkout.enabled=false', '-c', 'hook.reference-transaction.enabled=false', '-c', 'hook.post-index-change.enabled=false'])
  if (ranPrograms(marker).length > 0) {
    t.skip(`${version} has no hook.<event>.enabled switch to turn the hooks defined in configuration off by event`)
    return
  }

  await executorCheckoutsAndRefWrites(repo, git, c1, c2)
  assert.deepEqual(ranPrograms(marker), [], 'no hook defined in configuration ran')
})

withRepo('a configured fsmonitor command does not run inside the executor\'s git calls (E3 review, E3-6)', async (repo, git) => {
  const c1 = repo.commit({ 'a.txt': '1\n' }, 'c1')
  const c2 = repo.commit({ 'a.txt': '2\n' }, 'c2')
  const outside = dirname(repo.dir)
  const marker = join(outside, 'fsmonitor-ran.txt')
  const gate = succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c1, saveSnapshot: okSaver }))
  repo.git('config', 'core.fsmonitor', writeProgram(outside, 'fsmonitor.sh', marker))

  // Control: plain git status runs the command here.
  sh(gate.path, 'status', '--porcelain')
  assert.ok(ranPrograms(marker).includes('fsmonitor.sh'), 'plain git runs the fsmonitor command here')
  rmSync(marker)

  // status, checkout, reset and clean all read or refresh the index in the gate worktree, and an untracked file is found by status.
  writeFileSync(join(gate.path, 'a.txt'), 'edited\n')
  writeFileSync(join(gate.path, 'new.txt'), 'n\n')
  succeeded(await git.prepareGateWorktree({ root: repo.dir, commit: c2, saveSnapshot: okSaver }))
  assert.equal(sh(gate.path, 'rev-parse', 'HEAD'), c2)
  assert.deepEqual(ranPrograms(marker), [], 'the fsmonitor command did not run')
})

// ---------------------------------------------------------------------------
// Watched files

test('watchedDigest changes with a watched file and with nothing else', async () => {
  const dir = join(sandbox, 'watched')
  mkdirSync(dir)
  const empty = await watchedDigest(dir)
  assert.match(empty, /^[0-9a-f]{12}$/)
  assert.equal(await watchedDigest(dir), empty)
  writeFileSync(join(dir, 'unrelated.txt'), 'x')
  assert.equal(await watchedDigest(dir), empty, 'a file nobody watches')
  writeFileSync(join(dir, 'package.json'), '{"name":"a"}')
  const first = await watchedDigest(dir)
  assert.notEqual(first, empty)
  assert.equal(await watchedDigest(dir), first)
  writeFileSync(join(dir, 'package.json'), '{"name":"b"}')
  const second = await watchedDigest(dir)
  assert.notEqual(second, first)
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lock')
  assert.notEqual(await watchedDigest(dir), second, 'a lock file appearing')
  assert.equal(await watchedDigest(dir, [...DEFAULT_WATCHED].reverse()), await watchedDigest(dir), 'the order of the list does not matter')
  assert.equal(await watchedDigest(dir, ['package.json', 'package.json']), await watchedDigest(dir, ['package.json']))
  assert.notEqual(await watchedDigest(dir, ['package.json']), await watchedDigest(dir, ['package.json', 'unrelated.txt']), 'a path named by the norm is watched')
})

// ---------------------------------------------------------------------------
// The trunk, its remote-tracking reference and the remote

test('reflogKind: fetch and pull write fetch, a push writes update by push, anything else is unknown', () => {
  assert.equal(reflogKind('fetch origin: fast-forward'), 'fetch')
  assert.equal(reflogKind('fetch --prune origin: storing head'), 'fetch')
  assert.equal(reflogKind('fetch . x:refs/remotes/origin/main: fast-forward'), 'fetch')
  assert.equal(reflogKind('pull: Fast-forward'), 'fetch')
  assert.equal(reflogKind('pull origin main: fast-forward'), 'fetch')
  assert.equal(reflogKind('update by push'), 'push')
  assert.equal(reflogKind(''), 'unknown')
  assert.equal(reflogKind('fetching things'), 'unknown')
  assert.equal(reflogKind('branch: Created from HEAD'), 'unknown')
})

withRepo('the trunk\'s remote is its configured upstream, else origin, and none without a remote', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  assert.equal(good(await git.trunkUpstream(repo.dir, 'main')), undefined, 'a repository without a remote has only the local trunk')
  const remote = repo.withRemote()
  assert.deepEqual(good(await git.trunkUpstream(repo.dir, 'main')), { remote: 'origin', tracking: 'refs/remotes/origin/main' })
  repo.git('remote', 'add', 'mirror', remote)
  repo.git('branch', '--set-upstream-to=origin/main', 'main')
  assert.equal(good(await git.trunkUpstream(repo.dir, 'main'))?.remote, 'origin')
  repo.git('fetch', '--quiet', 'mirror')
  repo.git('config', 'branch.main.remote', 'mirror')
  repo.git('config', 'branch.main.merge', 'refs/heads/main')
  assert.deepEqual(good(await git.trunkUpstream(repo.dir, 'main')), { remote: 'mirror', tracking: 'refs/remotes/mirror/main' })
  assert.equal(good(await git.trunkUpstream(repo.dir, 'other'))?.remote, 'origin', 'a branch with no upstream falls back to origin')
  assert.equal((await git.trunkUpstream(repo.dir, 'bad*')).ok, false)
})

withRepo('a repository whose only remote has another name publishes the trunk there, not to a remote that does not exist (E3 review, E3-7)', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const remote = repo.withRemote()
  repo.git('remote', 'rename', 'origin', 'upstream')
  repo.git('config', '--unset', 'branch.main.remote')
  repo.git('config', '--unset', 'branch.main.merge')
  assert.equal(repo.git('for-each-ref', '--format=%(upstream:remotename)', 'refs/heads/main'), '', 'no upstream is configured for the trunk')
  const upstream = good(await git.trunkUpstream(repo.dir, 'main'))
  assert.deepEqual(upstream, { remote: 'upstream', tracking: 'refs/remotes/upstream/main' })
  const refs = good(await git.trunkRefs(repo.dir, 'main', upstream?.remote))
  assert.notEqual(refs.remote, undefined, 'the tracking reference exists, so a push to it can be seen')

  // Several remotes and nothing configured: the design's origin stays the answer.
  repo.git('remote', 'add', 'mirror', remote)
  assert.equal(good(await git.trunkUpstream(repo.dir, 'main'))?.remote, 'origin')
})

withRepo('the local trunk and its remote-tracking reference are read together', async (repo, git) => {
  const first = repo.commit({ 'a.txt': '1' }, 'first')
  assert.deepEqual(good(await git.trunkRefs(repo.dir, 'main', undefined)), { local: first, remote: undefined })
  assert.deepEqual(good(await git.trunkRefs(repo.dir, 'main', 'origin')), { local: first, remote: undefined }, 'no tracking reference yet')
  repo.withRemote()
  assert.deepEqual(good(await git.trunkRefs(repo.dir, 'main', 'origin')), { local: first, remote: first })
  const second = repo.commit({ 'a.txt': '2' }, 'second')
  assert.deepEqual(good(await git.trunkRefs(repo.dir, 'main', 'origin')), { local: second, remote: first })
  assert.deepEqual(good(await git.trunkRefs(repo.dir, 'nothing', 'origin')), { local: undefined, remote: undefined })
})

withRepo('the reflog of the tracking reference says whether a push or a fetch moved it, and a local fetch reads as a fetch', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  const remote = repo.withRemote()
  const subject = async (): Promise<string> => good(await git.reflogSubject(repo.dir, 'refs/remotes/origin/main')) ?? ''

  // Pushing a commit moves the tracking reference with the message "update by push".
  repo.commit({ 'a.txt': '2' }, 'second')
  repo.git('push', '--quiet', 'origin', 'main')
  assert.equal(await subject(), 'update by push')
  assert.equal(reflogKind(await subject()), 'push')

  // Someone else pushes to the remote; our fetch moves the reference with a fetch message.
  const other = join(dirname(repo.dir), 'other')
  sh(dirname(repo.dir), 'clone', '--quiet', remote, other)
  writeFileSync(join(other, 'b.txt'), 'b')
  sh(other, 'add', 'b.txt')
  sh(other, 'commit', '--quiet', '-m', 'elsewhere')
  sh(other, 'push', '--quiet', 'origin', 'main')
  repo.git('fetch', '--quiet', 'origin')
  assert.match(await subject(), /^fetch .*origin/)
  assert.equal(reflogKind(await subject()), 'fetch')

  // A fetch from the repository itself into the tracking reference writes the same words:
  // the message alone does not prove the commits came from the remote (design §3.8.4).
  const ahead = repo.commit({ 'a.txt': '3' }, 'local only')
  repo.git('branch', 'x')
  repo.git('fetch', '--quiet', '.', '+x:refs/remotes/origin/main')
  assert.equal(good(await git.trunkRefs(repo.dir, 'main', 'origin')).remote, ahead)
  assert.equal(reflogKind(await subject()), 'fetch')

  // update-ref without a message leaves none; a message can be forged.
  const another = repo.commit({ 'a.txt': '4' }, 'another local')
  repo.git('update-ref', 'refs/remotes/origin/main', another)
  assert.equal(reflogKind(await subject()), 'unknown')
  repo.git('update-ref', '-m', 'fetch origin: forged', 'refs/remotes/origin/main', ahead)
  assert.equal(reflogKind(await subject()), 'fetch')

  assert.equal((await git.reflogSubject(repo.dir, 'refs/heads/no-such-branch')).ok, false)
})

withRepo('ls-remote asks the remote itself where its trunk is', async (repo, git) => {
  const first = repo.commit({ 'a.txt': '1' }, 'first')
  const remote = repo.withRemote()
  assert.equal(good(await git.lsRemote(repo.dir, 'origin', 'main')), first)
  assert.equal(good(await git.lsRemote(repo.dir, 'origin', 'no-such-branch')), undefined, 'reachable, no such branch')
  const second = repo.commit({ 'a.txt': '2' }, 'second')
  assert.equal(good(await git.lsRemote(repo.dir, 'origin', 'main')), first, 'the remote has not seen the new commit')
  repo.git('push', '--quiet', 'origin', 'main')
  assert.equal(good(await git.lsRemote(repo.dir, 'origin', 'main')), second)

  repo.git('remote', 'add', 'ghost', join(dirname(remote), 'nowhere.git'))
  const unreachable = await git.lsRemote(repo.dir, 'ghost', 'main')
  assert.equal(unreachable.ok, false)
  assert.match(unreachable.ok ? '' : unreachable.reason, /git ls-remote exited/)
})

withRepo('the tree of a commit is the same for two commits with the same content and changes with the content (§3.11.1)', async (repo, git) => {
  const first = repo.commit({ 'a.txt': '1' }, 'first')
  const empty = repo.commit({}, 'nothing changed')
  const second = repo.commit({ 'a.txt': '2' }, 'second')
  const tree = good(await git.treeOf(repo.dir, first))
  assert.match(tree ?? '', /^[0-9a-f]{40,64}$/)
  assert.equal(tree, repo.git('rev-parse', `${first}^{tree}`))
  assert.equal(good(await git.treeOf(repo.dir, empty)), tree, 'an empty commit keeps the tree')
  assert.notEqual(good(await git.treeOf(repo.dir, second)), tree)
  assert.equal(good(await git.treeOf(repo.dir, 'no-such-branch')), undefined)
  assert.equal((await git.treeOf(repo.dir, '--all')).ok, false)
})

withRepo('a remote\'s URL is read by its name, and a missing remote has none', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  assert.equal(good(await git.remoteUrl(repo.dir, 'origin')), undefined, 'no remote yet')
  const remote = repo.withRemote()
  assert.ok(sameFile(good(await git.remoteUrl(repo.dir, 'origin')) ?? '', remote), 'the URL remote add stored')
  assert.equal((await git.remoteUrl(repo.dir, 'ext::sh')).ok, false, 'a URL is not a remote name')
  assert.equal((await git.remoteUrl(repo.dir, '--push')).ok, false)
})

withRepo('the remote\'s default branch is the branch refs/remotes/<remote>/HEAD names', async (repo, git) => {
  repo.commit({ 'a.txt': '1' }, 'first')
  assert.equal(good(await git.remoteHeadBranch(repo.dir, 'origin')), undefined, 'no remote, no default branch')
  repo.withRemote()
  repo.git('branch', 'trunk')
  repo.git('push', '--quiet', 'origin', 'trunk')
  repo.git('remote', 'set-head', 'origin', 'trunk')
  assert.equal(good(await git.remoteHeadBranch(repo.dir, 'origin')), 'trunk')
  repo.git('remote', 'set-head', 'origin', '--delete')
  assert.equal(good(await git.remoteHeadBranch(repo.dir, 'origin')), undefined)
  assert.equal((await git.remoteHeadBranch(repo.dir, '-x')).ok, false)
})

withRepo('the paths a commit would record: the staged ones, with -a also the changed tracked files, a rename as both paths', async (repo, git) => {
  repo.commit({ 'a.txt': '1', 'b.txt': '1', 'old.txt': 'kept\n' }, 'first')
  assert.deepEqual(good(await git.stagedPaths(repo.dir, false)), [])
  writeFileSync(join(repo.dir, 'a.txt'), '2')
  writeFileSync(join(repo.dir, 'b.txt'), '2')
  writeFileSync(join(repo.dir, 'untracked.txt'), 'new')
  repo.git('add', 'a.txt')
  repo.git('mv', 'old.txt', 'new.txt')
  assert.deepEqual(good(await git.stagedPaths(repo.dir, false)).sort(), ['a.txt', 'new.txt', 'old.txt'])
  assert.deepEqual(good(await git.stagedPaths(repo.dir, true)).sort(), ['a.txt', 'b.txt', 'new.txt', 'old.txt'], 'commit -a takes the changed tracked file, never the untracked one')
})

withRepo('the commits between two revisions come newest first, and none from a commit to itself', async (repo, git) => {
  const first = repo.commit({ 'a.txt': '1' }, 'first')
  const second = repo.commit({ 'a.txt': '2' }, 'second')
  const third = repo.commit({ 'a.txt': '3' }, 'third')
  assert.deepEqual(good(await git.commitsBetween(repo.dir, first, third)), [third, second])
  assert.deepEqual(good(await git.commitsBetween(repo.dir, third, third)), [])
  assert.deepEqual(good(await git.commitsBetween(repo.dir, third, first)), [], 'backwards brings nothing in')
  assert.equal((await git.commitsBetween(repo.dir, '-x', third)).ok, false)
  assert.equal((await git.commitsBetween(repo.dir, first, 'no-such-branch')).ok, false)
})

describe('git executor on real repositories', { concurrency: 8 }, () => {
  for (const [name, run] of repositoryCases) it(name, run)
})
