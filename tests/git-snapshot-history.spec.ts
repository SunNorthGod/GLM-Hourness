/**
 * The git snapshot of a command that moves refs, and what the harness will
 * not let a push carry off the machine (docs/ORCHESTRATION.md §6.1;
 * decision d-main-agent-shell): the remote's old commit fetched before a
 * force push, the checks on what a push sends, aliases, `-C` and `cd`,
 * and a merge left unresolved. Real git in temporary repositories.
 */
import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { GIT_MISSING, realSnapshotEnvironment, snapshotCorrection, type SnapshotEnvironment, type SnapshotRunner } from '../src/guard/git-snapshot.ts'
import { allowed, journal, refs, refusal, run, sh, theSnapshot, tryGit, twoCommitRepo, type Repo } from './git-fixture.ts'

const slashes = (path: string): string => path.replaceAll('\\', '/')

/** The environment with one git call answered by `answer` instead of git. */
function replacing(matches: (args: readonly string[]) => boolean, answer: Awaited<ReturnType<SnapshotRunner>>): Partial<SnapshotEnvironment> {
  return { run: (cwd, args, options) => matches(args) ? Promise.resolve(answer) : realSnapshotEnvironment.run(cwd, args, options) }
}

/** A repository with a remote that has `main`, and a snapshot of a reset that dropped a local commit. */
async function withSnapshot(): Promise<{ readonly repo: Repo, readonly remote: string, readonly id: string, readonly ref: string, readonly tag: string, readonly commit: string }> {
  const repo = twoCommitRepo()
  const remote = repo.withRemote()
  repo.commit({ 'local.txt': 'local\n' }, 'local only')
  allowed(await run(repo, 'git reset --hard HEAD~1'))
  const { ref, entry } = theSnapshot(repo)
  assert.ok(entry.tag !== undefined)
  return { repo, remote, id: entry.id, ref, tag: entry.tag, commit: repo.git('rev-parse', ref) }
}

// ---------------------------------------------------------------- a push that rewrites the remote

test('git push --force: the remote\'s old commit is fetched into the snapshot, and the rewritten published commit is tagged', async () => {
  const repo = twoCommitRepo()
  repo.withRemote()
  const published = repo.git('rev-parse', 'HEAD')
  repo.git('reset', '--hard', 'HEAD~1')
  repo.commit({ 'b.txt': 'b\n' }, 'diverged')
  const result = allowed(await run(repo, 'git push --force origin main'))
  const { ref, entry } = theSnapshot(repo)
  // Git has no ref that is also a directory: with the remote's copies under <id>/remote/, the snapshot commit is <id>/commit.
  const copy = `refs/hourness/snapshots/${entry.id}/remote/main`
  assert.equal(ref, `refs/hourness/snapshots/${entry.id}/commit`)
  assert.deepEqual(entry.remote, [{ remote: 'origin', branch: 'main', ref: copy }])
  assert.equal(repo.git('rev-parse', copy), published)
  assert.ok(entry.tag !== undefined, 'a published commit is rewritten')
  assert.ok((result.notices[0] ?? '').includes(`git push --force-with-lease origin ${copy}:main`))
  // The command that puts the remote back is not itself held up by the check on what a push sends.
  allowed(await run(repo, `git push --force-with-lease origin ${copy}:main`))
})

test('a force push of a branch the remote does not have saves nothing from the remote; an unreachable remote refuses', async () => {
  const repo = twoCommitRepo()
  repo.withRemote()
  repo.git('branch', 'fresh')
  const fresh = allowed(await run(repo, 'git push --force origin fresh'))
  assert.deepEqual(fresh.degraded, [])
  assert.deepEqual(journal(repo).flatMap(entry => entry.remote ?? []), [])
  repo.git('remote', 'set-url', 'origin', join(repo.root, 'gone.git'))
  const gone = refusal(await run(repo, 'git push --force origin main'))
  assert.equal(gone.code, 'remote-unreachable')
  assert.equal(snapshotCorrection('git push --force origin main', gone).rightPath, 'Retry when the remote is reachable')
  assert.deepEqual(refs(repo), [], 'a snapshot that could not be completed leaves no ref behind')
})

test('git push --delete and a ref deleted with a leading colon save the remote branch', async () => {
  const repo = twoCommitRepo()
  repo.withRemote()
  repo.git('push', '--quiet', 'origin', 'main:old')
  allowed(await run(repo, 'git push origin --delete old'))
  allowed(await run(repo, 'git push origin :old'))
  const lines = journal(repo)
  assert.deepEqual(lines.map(entry => entry.remote?.[0]?.branch), ['old', 'old'])
})

// ---------------------------------------------------------------- what a push may not send

test('a push that would carry the snapshots off the machine is refused, and the remote has none of them', async () => {
  const { repo, remote, id, ref, tag, commit } = await withSnapshot()
  const stash = journal(repo)[0]?.stash
  for (const command of [
    'git push --mirror',
    'git push --mirror origin',
    'git push --tags',
    `git push origin ${ref}:refs/heads/x`,
    `git push origin refs/tags/${tag}`,
    `git push origin ${tag}`,
    `git push origin ${commit}:refs/heads/y`,
    `git push origin ${sh(repo.dir, 'rev-parse', `${tag}`)}:refs/heads/z`,
    'git push origin refs/*:refs/*',
    'git push origin refs/hourness/*:refs/hourness/*',
    'git push origin refs/tags/*:refs/tags/*',
    'git push origin tag ' + tag,
    ...stash === undefined ? [] : [`git push origin ${stash}:refs/heads/s`],
  ]) {
    const refused = refusal(await run(repo, command))
    assert.equal(refused.code, 'snapshots-off-machine', command)
  }
  assert.equal(tryGit(remote, 'for-each-ref', 'refs/hourness').out, '')
  assert.equal(tryGit(remote, 'for-each-ref', 'refs/tags').out, '')
  assert.equal(snapshotCorrection('git push --mirror', { code: 'snapshots-off-machine', reason: 'x' }).fact, '"git push --mirror" would push the harness\'s snapshots off this machine.')
  assert.equal(snapshotCorrection('git push --mirror', { code: 'snapshots-off-machine', reason: 'x' }).rightPath, 'Push branches and tags by name; snapshot refs stay on this machine.')
  assert.ok(id.length > 0)
})

test('a push with no refspec follows remote.<name>.mirror and remote.<name>.push', async () => {
  const { repo } = await withSnapshot()
  repo.git('config', 'remote.origin.mirror', 'true')
  assert.equal(refusal(await run(repo, 'git push')).code, 'snapshots-off-machine')
  repo.git('config', '--unset', 'remote.origin.mirror')
  repo.git('config', 'remote.origin.push', 'refs/*:refs/*')
  assert.equal(refusal(await run(repo, 'git push')).code, 'snapshots-off-machine')
  repo.git('config', '--unset-all', 'remote.origin.push')
  allowed(await run(repo, 'git push'))
})

test('pushing by name is fine, and --tags is fine while there is no snapshot tag', async () => {
  const repo = twoCommitRepo()
  repo.withRemote()
  repo.git('tag', 'v1')
  for (const command of ['git push origin main', 'git push origin v1', 'git push --tags', 'git push --follow-tags', 'git push origin HEAD', 'git push --set-upstream origin main']) {
    allowed(await run(repo, command))
  }
  const { repo: withTag } = await withSnapshot()
  allowed(await run(withTag, 'git push origin main'))
  allowed(await run(withTag, 'git push --follow-tags origin main'))
  assert.equal(refusal(await run(withTag, 'git push --tags')).code, 'snapshots-off-machine')
})

test('a push whose remote or refspec is hidden behind a variable cannot be checked and is refused', async () => {
  const repo = twoCommitRepo()
  repo.withRemote()
  const hidden = refusal(await run(repo, 'git push origin $BRANCH'))
  assert.equal(hidden.code, 'unreadable')
  assert.equal(snapshotCorrection('git push origin $BRANCH', hidden).rightPath, 'Write the remote, branch and tag names out in the command, without variables.')
})

// ---------------------------------------------------------------- aliases, -C, cd, missing git, failing steps

test('an alias is judged by what it runs: a shell alias is both, a plain one is its expansion, a harmless one saves nothing', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'a.txt': 'unsaved\n' })
  repo.git('config', 'alias.wipe', '!git checkout -- . ; echo done')
  repo.git('config', 'alias.co', 'checkout')
  repo.git('config', 'alias.st', 'status -s')
  allowed(await run(repo, 'git st'))
  assert.deepEqual(refs(repo), [])
  const wipe = allowed(await run(repo, 'git wipe'))
  assert.equal(wipe.notices.length, 1)
  assert.equal(journal(repo).at(-1)?.risk, 'both')
  const co = allowed(await run(repo, 'git co -- a.txt'))
  assert.equal(co.notices.length, 1)
  assert.equal(journal(repo).at(-1)?.risk, 'discard')
  assert.equal(journal(repo).at(-1)?.subcommand, 'checkout')
})

test('git -C <other repository>: the snapshot is of that repository, in this project\'s journal', async () => {
  const here = twoCommitRepo()
  const other = twoCommitRepo()
  other.write({ 'a.txt': 'there\n' })
  allowed(await run(here, `git -C "${slashes(other.dir)}" checkout -- a.txt`))
  assert.deepEqual(refs(here), [])
  assert.equal(refs(other).length, 1)
  const [line] = journal(here)
  assert.equal(slashes(line?.repo ?? '').toLowerCase(), slashes(join(other.dir, '.git')).toLowerCase())
  assert.equal(line?.rootFrom, 'session')
})

test('git -C sub inside the project saves in sub', async () => {
  const repo = twoCommitRepo()
  const sub = join(repo.dir, 'sub')
  mkdirSync(sub)
  sh(sub, 'init', '--quiet', '-b', 'main')
  sh(sub, 'commit', '--quiet', '--allow-empty', '-m', 'sub first')
  const tip = sh(sub, 'rev-parse', 'HEAD')
  sh(sub, 'commit', '--quiet', '--allow-empty', '-m', 'sub second')
  allowed(await run(repo, 'git -C sub reset --hard HEAD~1'))
  assert.equal(tryGit(sub, 'for-each-ref', 'refs/hourness/snapshots').out.split('\n').length, 1)
  assert.deepEqual(refs(repo), [])
  assert.equal(journal(repo)[0]?.refs[0]?.sha !== tip, true)
})

test('a cd to something that is not written out cannot be followed and refuses a call that could lose work', async () => {
  const repo = twoCommitRepo()
  const refused = refusal(await run(repo, 'cd $X; git reset --hard'))
  assert.equal(refused.code, 'cd-unknown')
  assert.equal(snapshotCorrection('cd $X; git reset --hard', refused).rightPath, 'Run git with -C <literal path>')
  // A harmless call after such a cd needs no directory.
  allowed(await run(repo, 'cd $X; git status'))
  // A literal cd is followed.
  const other = twoCommitRepo()
  other.write({ 'a.txt': 'there\n' })
  allowed(await run(repo, `cd "${slashes(other.dir)}" && git checkout -- a.txt`))
  assert.equal(refs(other).length, 1)
  assert.deepEqual(refs(repo), [])
})

test('git missing lets the command through and says so', async () => {
  const repo = twoCommitRepo()
  const result = allowed(await run(repo, 'git reset --hard', { env: replacing(() => true, { code: undefined, stdout: '', stderr: 'spawn git ENOENT', problem: 'missing' }) }))
  assert.deepEqual([result.notices, result.degraded], [[], [GIT_MISSING]])
})

test('a step that fails refuses the command with the snapshot\'s four-part correction, and leaves no ref', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'a.txt': 'unsaved\n' })
  const broken = refusal(await run(repo, 'git checkout -- a.txt', { env: replacing(args => args.includes('commit-tree'), { code: 1, stdout: '', stderr: 'boom', problem: undefined }) }))
  assert.equal(broken.code, 'git-failed')
  const correction = snapshotCorrection('git checkout -- a.txt', broken)
  assert.equal(correction.fact, 'The harness could not save a snapshot before "git checkout -- a.txt": git commit-tree exited 1: boom.')
  assert.equal(correction.violation, 'Git commands that can lose uncommitted work or rewrite history run after the harness has saved a copy it can restore; the copies stay on this machine.')
  assert.equal(correction.rightPath, 'Retry; if it fails again, tell the human the reason')
  assert.equal(correction.exception, 'The human can run the command in their own terminal.')
  assert.deepEqual(refs(repo), [])
  const slow = refusal(await run(repo, 'git checkout -- a.txt', { env: { deadlineMs: 0 } }))
  assert.equal(slow.code, 'timeout')
})

test('an unresolved merge is saved from the working tree, and git merge --abort is not held up', async () => {
  const repo = twoCommitRepo()
  repo.git('switch', '-q', '-c', 'theirs')
  repo.commit({ 'a.txt': 'theirs\n' }, 'theirs')
  repo.git('switch', '-q', 'main')
  repo.commit({ 'a.txt': 'ours\n' }, 'ours')
  assert.equal(tryGit(repo.dir, 'merge', 'theirs').code, 1)
  const result = allowed(await run(repo, 'git merge --abort'))
  const { entry } = theSnapshot(repo)
  assert.equal(entry.stash, undefined)
  assert.ok(entry.worktree !== undefined)
  assert.match(repo.git('show', `${entry.worktree}:a.txt`), /<<<<<<<[\s\S]*ours[\s\S]*theirs[\s\S]*>>>>>>>/)
  assert.ok((result.notices[0] ?? '').includes(`git restore --source=${entry.worktree} --worktree -- <path>`))
})

test('the temporary index lives in the system temporary directory and is gone afterwards, whether the snapshot succeeded or failed', async () => {
  const repo = twoCommitRepo()
  const scratch = join(tmpdir(), `snap-index-${process.pid}-${Date.now()}`)
  mkdirSync(scratch, { recursive: true })
  const used = new Set<string>()
  const watching: Partial<SnapshotEnvironment> = {
    tempRoot: () => scratch,
    run: (cwd, args, options) => {
      const index = options.env?.GIT_INDEX_FILE
      if (index !== undefined) used.add(index)
      return realSnapshotEnvironment.run(cwd, args, options)
    },
  }
  try {
    repo.write({ 'new.txt': 'n\n' })
    allowed(await run(repo, 'git clean -fd', { env: watching }))
    assert.ok([...used].every(file => file.startsWith(scratch) && file.includes('glm-hourness-snap-index-')), [...used].join(', '))
    assert.ok(used.size > 0)
    assert.equal(readdirSync(scratch).length, 0)
    refusal(await run(repo, 'git clean -fd', { env: { ...watching, ...replacing(args => args.includes('write-tree'), { code: 1, stdout: '', stderr: 'no', problem: undefined }) } }))
    assert.equal(readdirSync(scratch).length, 0)
    assert.equal(readdirSync(join(repo.dir, '.git')).some(name => name.startsWith('tmp-index') || name === 'hourness'), false)
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

