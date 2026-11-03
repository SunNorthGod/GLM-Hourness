/**
 * The main agent's git (docs/ORCHESTRATION.md §6.1; decision
 * d-main-agent-shell): a command that can lose uncommitted work or rewrite
 * history runs after a snapshot the harness can restore, and a command that
 * would send the snapshots off the machine or delete what they do not keep
 * is refused. Real git in temporary repositories; the snapshot's own git
 * calls run through the real runner unless a case replaces it to make one
 * step fail.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { gitInvocations, gitRisk, snapshotCorrection } from '../src/guard/git-snapshot.ts'
import { allowed, EMPTY_TREE, GLOB, journal, noSnapshot, refusal, run, sh, theSnapshot, tryGit, twoCommitRepo } from './git-fixture.ts'

// ---------------------------------------------------------------- recognition

test('gitRisk: what each command can lose, by its text', () => {
  const risk = (line: string): string | undefined => {
    const [sub = '', ...args] = line.split(' ')
    return gitRisk(sub, args)
  }
  for (const line of ['status', 'log --oneline', 'diff', 'show HEAD', 'commit -m x', 'fetch', 'branch x', 'branch', 'add -A', 'stash', 'stash pop', 'merge other', 'pull', 'tag v1', 'worktree add ../w', 'rm a.txt', 'clean -n', 'clean --dry-run -fd', 'push', 'push origin main', 'reflog', 'gc', 'remote -v', 'config user.name x']) {
    assert.equal(risk(line), undefined, line)
  }
  assert.equal(risk('checkout -- a.txt'), 'discard')
  assert.equal(risk('checkout main'), 'discard')
  assert.equal(risk('switch other'), 'discard')
  assert.equal(risk('restore a.txt'), 'discard')
  assert.equal(risk('reset --hard'), 'both')
  assert.equal(risk('reset --merge'), 'both')
  assert.equal(risk('reset --keep HEAD~1'), 'both')
  assert.equal(risk('reset --soft HEAD~1'), 'history')
  assert.equal(risk('reset HEAD~1'), 'history')
  assert.equal(risk('clean -fd'), 'discard')
  assert.equal(risk('stash drop'), 'both')
  assert.equal(risk('stash clear'), 'both')
  assert.equal(risk('rm -f a.txt'), 'discard')
  assert.equal(risk('merge --abort'), 'discard')
  assert.equal(risk('rebase --abort'), 'discard')
  assert.equal(risk('rebase main'), 'history')
  assert.equal(risk('cherry-pick --abort'), 'discard')
  assert.equal(risk('read-tree -u HEAD'), 'discard')
  assert.equal(risk('worktree remove ../w'), 'discard')
  assert.equal(risk('commit --amend'), 'history')
  assert.equal(risk('branch -D x'), 'history')
  assert.equal(risk('branch -d x'), 'history')
  assert.equal(risk('branch -m old new'), 'history')
  assert.equal(risk('branch -f x HEAD~1'), 'history')
  assert.equal(risk('tag -d v1'), 'history')
  assert.equal(risk('tag -f v1'), 'history')
  assert.equal(risk('update-ref -d refs/heads/x'), 'history')
  assert.equal(risk('push --force origin main'), 'history')
  assert.equal(risk('push -f'), 'history')
  assert.equal(risk('push --force-with-lease'), 'history')
  assert.equal(risk('push origin +main'), 'history')
  assert.equal(risk('push origin :old'), 'history')
  assert.equal(risk('push --delete origin old'), 'history')
  assert.equal(risk('push --prune origin'), 'history')
  assert.equal(risk('filter-branch --all'), 'history')
  assert.equal(risk('reflog expire --all'), 'history')
  assert.equal(risk('gc --prune=now'), 'history')
  assert.equal(risk('prune'), 'history')
  assert.equal(risk('remote remove origin'), 'history')
  // A word that hides an option makes the call as risky as its subcommand can be; a subcommand that is hidden makes it both.
  assert.equal(risk('reset $ARGS'), 'both')
  assert.equal(risk('checkout $REF'), 'discard')
  assert.equal(risk('$SUB --hard'), 'both')
  assert.equal(risk('log --format=%H'), undefined)
})

test('gitInvocations: global options, -C and cd, quoted text is not a command', () => {
  const [one] = gitInvocations('git -C sub -c core.x=1 --no-pager reset --hard HEAD~1', 'posix', '/work')
  assert.equal(one?.sub, 'reset')
  assert.deepEqual(one?.args, ['--hard', 'HEAD~1'])
  assert.equal(one?.dir?.replaceAll('\\', '/').endsWith('/work/sub'), true)
  assert.deepEqual(one?.configs, ['core.x=1'])
  assert.deepEqual(gitInvocations('echo "git reset --hard"', 'posix', '/work'), [])
  assert.deepEqual(gitInvocations('FOO=1 sudo git status && git log', 'posix', '/work').map(call => call.sub), ['status', 'log'])
  assert.equal(gitInvocations('bash -c "git clean -fd"', 'posix', '/work')[0]?.sub, 'clean')
  assert.equal(gitInvocations('cd /elsewhere && git reset --hard', 'posix', '/work')[0]?.dir?.replaceAll('\\', '/').endsWith('/elsewhere'), true)
  assert.equal(gitInvocations('cd $X; git reset --hard', 'posix', '/work')[0]?.dir, undefined)
  assert.equal(gitInvocations('Set-Location C:\\proj; git status', 'pwsh', '/work')[0]?.sub, 'status')
  assert.equal(gitInvocations('git --exec-path=/x status', 'posix', '/work')[0]?.unknownGlobal, true)
})

// ---------------------------------------------------------------- what needs no snapshot

test('commands that lose nothing save nothing', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'a.txt': 'edited\n' })
  repo.withRemote()
  for (const command of ['git status', 'git log', 'git diff', 'git commit -am x', 'git fetch', 'git branch x', 'git add -A', 'git stash list', 'git merge x', 'git push', 'git rev-parse HEAD', 'echo "git reset --hard"']) {
    const result = allowed(await run(repo, command))
    assert.deepEqual(result.notices, [], command)
    assert.deepEqual(result.degraded, [], command)
  }
  noSnapshot(repo)
})

test('a directory that is not a repository, and a command that is not git', async () => {
  const dir = join(tmpdir(), `not-a-repo-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    const result = allowed(await run(twoCommitRepo(), 'git reset --hard', { base: dir }))
    assert.deepEqual([result.notices, result.degraded], [[], []])
    assert.equal(existsSync(join(dir, '.llm')), false)
    assert.deepEqual(allowed(await run(twoCommitRepo(), 'npm test')).notices, [])
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------- discard

test('git checkout -- a.txt: the edit is saved, restorable, and written down in the project .llm', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'a.txt': 'precious\n' })
  const result = allowed(await run(repo, 'git checkout -- a.txt'))
  const { ref, entry } = theSnapshot(repo)
  assert.match(ref, /^refs\/hourness\/snapshots\/\d{8}T\d{6}Z[0-9a-f]{4}$/)
  assert.ok(entry.stash !== undefined, 'the edit is a stash commit')
  assert.equal(entry.risk, 'discard')
  assert.equal(entry.rootFrom, 'session')
  assert.equal(entry.sessionId, 'S1')
  assert.equal(entry.command, 'git checkout -- a.txt')
  assert.equal(entry.subcommand, 'checkout')
  assert.equal(entry.repo.replaceAll('\\', '/').toLowerCase(), join(repo.dir, '.git').replaceAll('\\', '/').toLowerCase())
  assert.equal(entry.tag, undefined)
  assert.ok(entry.restore.some(line => line.includes(`git stash apply ${entry.stash}`)))
  assert.equal(result.notices.length, 1)
  assert.match(result.notices[0] ?? '', new RegExp(`^\\[git 快照\\] 执行「git checkout -- a\\.txt」之前存了快照 ${entry.id}（${ref.replaceAll('/', '\\/')}）。要撤回：`))
  assert.ok((result.notices[0] ?? '').includes(`git stash apply ${entry.stash}`))
  // The command goes through (here, run by the test), and the saved edit comes back.
  sh(repo.dir, 'checkout', '--', 'a.txt')
  assert.equal(readFileSync(join(repo.dir, 'a.txt'), 'utf8'), 'two\n')
  repo.git('stash', 'apply', entry.stash ?? '')
  assert.equal(readFileSync(join(repo.dir, 'a.txt'), 'utf8'), 'precious\n')
  // Nothing was written into the git directory but the refs; the journal is not there.
  assert.equal(existsSync(join(repo.dir, '.git', 'hourness')), false)
  assert.deepEqual(readdirSync(join(repo.dir, '.git')).filter(name => name.startsWith('tmp-index')), [])
})

test('a clean work tree: checkout, switch and restore make no ref, no notice, no line', async () => {
  const repo = twoCommitRepo()
  repo.git('branch', 'other')
  for (const command of ['git checkout main', 'git checkout other', 'git switch main', 'git restore a.txt', 'git checkout -- a.txt']) {
    assert.deepEqual(allowed(await run(repo, command)).notices, [], command)
  }
  noSnapshot(repo)
})

test('git reset --hard HEAD~1: the edit and the dropped local commit are both kept, and the tag leads to the old commit', async () => {
  const repo = twoCommitRepo()
  const dropped = repo.git('rev-parse', 'HEAD')
  repo.write({ 'a.txt': 'unsaved\n' })
  const result = allowed(await run(repo, 'git reset --hard HEAD~1'))
  const { entry } = theSnapshot(repo)
  assert.equal(entry.risk, 'both')
  assert.ok(entry.stash !== undefined)
  assert.ok(entry.tag !== undefined && entry.history !== undefined)
  assert.equal(entry.tag, `hourness-snapshot/${entry.id}`)
  assert.deepEqual(entry.moved, ['refs/heads/main'])
  assert.deepEqual(entry.refs, [{ name: 'refs/heads/main', sha: dropped }])
  // The tag commit has an empty tree and the old commit as its only parent: no edit, no file in it.
  assert.equal(repo.git('rev-parse', `${entry.history}^{tree}`), EMPTY_TREE)
  assert.equal(repo.git('rev-list', '--parents', '-n', '1', entry.history ?? '').split(' ').slice(1).join(' '), dropped)
  assert.notEqual(repo.git('rev-parse', `${entry.history}^1`), entry.stash)
  assert.ok((result.notices[0] ?? '').includes('标签 hourness-snapshot/'))
  sh(repo.dir, 'reset', '--hard', 'HEAD~1')
  assert.equal(tryGit(repo.dir, 'merge-base', '--is-ancestor', dropped, 'HEAD').code, 1)
  assert.equal(tryGit(repo.dir, 'merge-base', '--is-ancestor', dropped, `refs/tags/${entry.tag}`).code, 0)
  repo.git('branch', 'recovered', dropped)
  assert.equal(readFileSync(join(repo.dir, 'a.txt'), 'utf8'), 'one\n')
})

test('a reset that loses no commit does not tag: to the same commit, to a commit the other branch still has', async () => {
  const repo = twoCommitRepo()
  repo.git('branch', 'keeper')
  allowed(await run(repo, 'git reset --soft HEAD~1'))
  const history = journal(repo)
  assert.deepEqual(history.map(entry => entry.tag), [undefined], 'the other branch still holds the old commit')
  const lonely = twoCommitRepo()
  allowed(await run(lonely, 'git reset --soft HEAD'))
  assert.deepEqual(journal(lonely).map(entry => entry.tag), [undefined])
})

test('git branch -D: the branch comes back from the journal line, and a merged branch deleted with -d is not tagged', async () => {
  const repo = twoCommitRepo()
  repo.git('switch', '-q', '-c', 'work')
  const tip = repo.commit({ 'w.txt': 'w\n' }, 'work only')
  repo.git('switch', '-q', 'main')
  allowed(await run(repo, 'git branch -D work'))
  const { entry } = theSnapshot(repo)
  assert.equal(entry.risk, 'history')
  assert.deepEqual(entry.refs, [{ name: 'refs/heads/work', sha: tip }])
  assert.ok(entry.tag !== undefined, 'only this branch reached the commit')
  sh(repo.dir, 'branch', '-D', 'work')
  repo.git('branch', 'work', tip)
  assert.equal(repo.git('rev-parse', 'work'), tip)
  // A merged branch: the commit stays reachable from main.
  const merged = twoCommitRepo()
  merged.git('branch', 'done')
  allowed(await run(merged, 'git branch -d done'))
  assert.deepEqual(journal(merged).map(line => line.tag), [undefined])
})

test('git clean -fd: untracked files and directories are saved and restorable; ignored ones stay and are not in the snapshot', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'new.txt': 'n\n', 'dir/deep/x.txt': 'x\n', '记账.txt': '账\n', [`sp ace/${GLOB}.txt`]: 's\n', '.env': 'SECRET=1\n', 'node_modules/pkg/index.js': 'm\n' })
  const result = allowed(await run(repo, 'git clean -fd'))
  const { ref, entry } = theSnapshot(repo)
  assert.equal(entry.files?.cleaned, 4)
  assert.equal(entry.files?.count, 4)
  const saved = repo.git('-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', entry.files?.tree ?? '').split('\n').sort()
  assert.deepEqual(saved, ['dir/deep/x.txt', 'new.txt', `sp ace/${GLOB}.txt`, '记账.txt'])
  assert.ok((result.notices[0] ?? '').includes(`git restore --source=${ref} --worktree`))
  sh(repo.dir, 'clean', '-fd')
  assert.equal(existsSync(join(repo.dir, 'new.txt')), false)
  assert.equal(existsSync(join(repo.dir, '.env')), true, 'git clean -fd keeps ignored files')
  repo.git('restore', `--source=${ref}`, '--worktree', '--', '.')
  assert.equal(readFileSync(join(repo.dir, 'new.txt'), 'utf8'), 'n\n')
  assert.equal(readFileSync(join(repo.dir, '记账.txt'), 'utf8'), '账\n')
  assert.equal(readFileSync(join(repo.dir, 'sp ace', `${GLOB}.txt`), 'utf8'), 's\n')
  assert.equal(readFileSync(join(repo.dir, 'dir', 'deep', 'x.txt'), 'utf8'), 'x\n')
  // The ignored secret is in no object of the snapshot.
  assert.equal(repo.git('ls-tree', '-r', '--name-only', ref).includes('.env'), false)
})

test('git clean over the limit is refused and the files stay', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'one.txt': '1\n', 'two.txt': '2\n', 'three.txt': '3\n' })
  const tooMany = refusal(await run(repo, 'git clean -fd', { env: { maxFiles: 2 } }))
  assert.equal(tooMany.code, 'too-big')
  const tooBig = refusal(await run(repo, 'git clean -fd', { env: { maxBytes: 4 } }))
  assert.equal(tooBig.code, 'too-big')
  assert.equal(existsSync(join(repo.dir, 'one.txt')), true)
  noSnapshot(repo)
  assert.match(snapshotCorrection('git clean -fd', tooMany, { maxBytes: 200 * 1024 * 1024, maxFiles: 20_000 }).rightPath, /^Narrow the command \(fewer paths\) so it removes less than 200 MB and 20,000 files$/)
})
