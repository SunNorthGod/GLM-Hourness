/**
 * The git snapshot of the files a command would delete or overwrite, the
 * project journal it is written into, and the commands it refuses because
 * no snapshot keeps what they delete (docs/ORCHESTRATION.md §6.1; decision
 * d-main-agent-shell). Real git in temporary repositories.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { realSnapshotEnvironment, snapshotCorrection, type SnapshotEnvironment } from '../src/guard/git-snapshot.ts'
import { allowed, journal, makeRepo, noSnapshot, refs, refusal, run, sh, theSnapshot, tryGit, twoCommitRepo, type Repo } from './git-fixture.ts'

const slashes = (path: string): string => path.replaceAll('\\', '/')

/** `main` without x.txt, `other` with it tracked, and an untracked x.txt of the person's on `main`. */
function withUntrackedInTheWay(ignored = false): Repo {
  const repo = makeRepo()
  repo.commit({ 'a.txt': 'one\n', '.gitignore': ignored ? 'x.txt\nnode_modules/\n' : 'node_modules/\n' }, 'first')
  repo.git('switch', '-q', '-c', 'other')
  repo.write({ 'x.txt': 'tracked on other\n' })
  repo.git('add', '--force', 'x.txt')
  repo.git('commit', '-q', '-m', 'other adds x')
  repo.git('switch', '-q', 'main')
  repo.write({ 'x.txt': 'mine\n' })
  return repo
}

// ---------------------------------------------------------------- the untracked file a write-out command overwrites

for (const [locale, setting] of [['LANG=zh_CN.UTF-8, LC_ALL unset', { LANG: 'zh_CN.UTF-8', LC_ALL: undefined }], ['LC_ALL=C', { LANG: undefined, LC_ALL: 'C' }]] as const) {
  for (const command of ['git reset --hard other', 'git checkout -f other', 'git switch --discard-changes other', 'git restore --source=other -- x.txt', 'git checkout other -- x.txt']) {
    test(`${command} overwrites an untracked file: it is saved (${locale})`, async () => {
      const before = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL }
      for (const [key, value] of Object.entries(setting)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      try {
        const repo = withUntrackedInTheWay()
        const result = allowed(await run(repo, command))
        const { ref, entry } = theSnapshot(repo)
        assert.equal(entry.files?.inTheWay, 1)
        assert.ok((result.notices[0] ?? '').includes(`git restore --source=${ref} --worktree`))
        // git 2.55 switch --discard-changes still refuses to overwrite an untracked file: the snapshot is taken for nothing, which does no harm.
        const ran = tryGit(repo.dir, ...command.split(' ').slice(1))
        assert.equal(ran.code === 0, !command.startsWith('git switch'), ran.out)
        repo.git('restore', `--source=${ref}`, '--worktree', '--', 'x.txt')
        assert.equal(readFileSync(join(repo.dir, 'x.txt'), 'utf8'), 'mine\n')
      }
      finally {
        for (const [key, value] of Object.entries(before)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })
  }
}

test('a plain checkout of a branch, or a merge, is left to git: it refuses by itself when a file is in the way', async () => {
  const repo = withUntrackedInTheWay()
  for (const command of ['git checkout other', 'git switch other', 'git merge other', 'git pull', 'git stash pop']) {
    assert.deepEqual(allowed(await run(repo, command)).notices, [], command)
  }
  noSnapshot(repo)
})

test('an ignored file in the way refuses the command, names the file, and the file stays', async () => {
  const repo = withUntrackedInTheWay(true)
  for (const command of ['git reset --hard other', 'git checkout -f other']) {
    const blocked = refusal(await run(repo, command))
    assert.equal(blocked.code, 'ignored-in-way')
    assert.deepEqual(blocked.paths, ['x.txt'])
    assert.equal(snapshotCorrection(command, blocked).rightPath, 'Tell the human which ignored files are in the way: x.txt; they can move them')
    assert.equal(snapshotCorrection(command, blocked).fact, `The harness could not save a snapshot before "${command}": ignored files in the way.`)
  }
  assert.equal(readFileSync(join(repo.dir, 'x.txt'), 'utf8'), 'mine\n')
  noSnapshot(repo)
})

test('a reset whose target cannot be read from the text saves every untracked file', async () => {
  const repo = withUntrackedInTheWay()
  allowed(await run(repo, 'git reset --hard $TARGET'))
  const { entry } = theSnapshot(repo)
  assert.equal(entry.files?.inTheWay, 1)
})

// ---------------------------------------------------------------- git clean

test('git clean flags that delete what no snapshot keeps are refused and the files stay', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'new.txt': 'n\n', '.env': 'S=1\n', 'node_modules/p.js': 'm\n', 'nested/a.txt': 'a\n' })
  sh(join(repo.dir, 'nested'), 'init', '--quiet', '-b', 'main')
  for (const [command, code] of [
    ['git clean -fdx', 'ignored-files'], ['git clean -fx', 'ignored-files'], ['git clean -fdX', 'ignored-files'], ['git clean -f -x', 'ignored-files'],
    ['git clean -ffd', 'nested-repos'], ['git clean -f -f -d', 'nested-repos'], ['git clean --force --force', 'nested-repos'], ['git clean -fd --force', 'nested-repos'],
  ] as const) {
    assert.equal(refusal(await run(repo, command)).code, code, command)
  }
  for (const name of ['new.txt', '.env', 'node_modules/p.js', 'nested/.git']) assert.equal(existsSync(join(repo.dir, name)), true, name)
  assert.equal(snapshotCorrection('git clean -fdx', refusal(await run(repo, 'git clean -fdx'))).rightPath, 'Run git clean without -x or -X; ignored files stay.')
  assert.equal(snapshotCorrection('git clean -ffd', refusal(await run(repo, 'git clean -ffd'))).rightPath, 'Run git clean with a single -f; nested repositories stay.')
  assert.equal(snapshotCorrection('git clean -ffd', refusal(await run(repo, 'git clean -ffd'))).fact, '"git clean -ffd" would delete nested repositories.')
  // A dry run deletes nothing, and a single -f leaves the nested repository alone.
  for (const command of ['git clean -n', 'git clean -ndx', 'git clean --dry-run -ffd']) assert.deepEqual(allowed(await run(repo, command)).notices, [], command)
  allowed(await run(repo, 'git clean -fd'))
  assert.equal(journal(repo).at(-1)?.files?.cleaned, 1, 'only new.txt; the nested repository is skipped')
})

test('git clean whose list the harness cannot match with git\'s own dry run is refused', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'new.txt': 'n\n' })
  const lying: Partial<SnapshotEnvironment> = {
    run: async (cwd, args, options) => {
      const real = await realSnapshotEnvironment.run(cwd, args, options)
      return args.includes('clean') && args.includes('-n') ? { ...real, stdout: `${real.stdout}Would remove ghost.txt\n` } : real
    },
  }
  const blocked = refusal(await run(repo, 'git clean -fd', { env: lying }))
  assert.equal(blocked.code, 'list-mismatch')
  assert.equal(snapshotCorrection('git clean -fd', blocked).fact.startsWith('The harness could not save a snapshot before "git clean -fd": git clean would remove ghost.txt'), true)
  assert.equal(existsSync(join(repo.dir, 'new.txt')), true)
})

test('a git without --pathspec-from-file (before 2.25) gets the paths after -- instead, and the snapshot is the same', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'one.txt': '1\n', 'two words.txt': '2\n' })
  const old: Partial<SnapshotEnvironment> = {
    run: (cwd, args, options) => args.includes('--pathspec-from-file=-')
      ? Promise.resolve({ code: 129, stdout: '', stderr: 'error: unknown option `pathspec-from-file=-\'', problem: undefined })
      : realSnapshotEnvironment.run(cwd, args, options),
  }
  allowed(await run(repo, 'git clean -fd', { env: old }))
  const { entry } = theSnapshot(repo)
  assert.deepEqual(repo.git('ls-tree', '-r', '--name-only', entry.files?.tree ?? '').split('\n').sort(), ['one.txt', 'two words.txt'])
})

test('git clean with a path and an exclude saves only what it deletes', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'keep.log': 'k\n', 'drop.txt': 'd\n', 'sub/drop2.txt': 'd2\n', 'other/x.txt': 'x\n' })
  allowed(await run(repo, 'git clean -fd -e "*.log" -- drop.txt sub'))
  const { entry } = theSnapshot(repo)
  assert.equal(entry.files?.cleaned, 2)
  assert.deepEqual(repo.git('ls-tree', '-r', '--name-only', entry.files?.tree ?? '').split('\n').sort(), ['drop.txt', 'sub/drop2.txt'])
})

// ---------------------------------------------------------------- a removed work tree

/** A second work tree of `repo` with a modified tracked file, an untracked file and `count` ignored files. */
function workTreeWith(repo: Repo, count: number): string {
  const dir = join(repo.root, 'wt')
  repo.git('worktree', 'add', '-q', dir, '-b', 'wt')
  writeFileSync(join(dir, 'a.txt'), 'edited in the work tree\n')
  writeFileSync(join(dir, 'scratch.txt'), 's\n')
  mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true })
  for (let at = 0; at < count; at++) writeFileSync(join(dir, 'node_modules', 'pkg', `f${at}.js`), 'x')
  return dir
}

test('git worktree remove --force: the edit and the untracked file are saved, the ignored files are only counted', async () => {
  const repo = twoCommitRepo()
  const dir = workTreeWith(repo, 30)
  const result = allowed(await run(repo, `git worktree remove --force "${slashes(dir)}"`))
  const { ref, entry } = theSnapshot(repo)
  assert.ok(entry.stash !== undefined)
  assert.equal(entry.files?.worktree, 1)
  assert.deepEqual(repo.git('ls-tree', '-r', '--name-only', entry.files?.tree ?? '').split('\n'), ['scratch.txt'])
  assert.equal(entry.ignored?.count, 1, 'node_modules/ is one item')
  assert.equal(entry.ignored?.paths[0], 'node_modules/')
  assert.equal(entry.ignored?.bytes, 30)
  assert.ok((result.notices[0] ?? '').includes('被忽略的文件不在快照里，删掉之后不恢复：1 项、30 字节，例如 node_modules/'))
  sh(repo.dir, 'worktree', 'remove', '--force', dir)
  assert.equal(existsSync(dir), false)
  repo.git('worktree', 'add', '-q', dir, 'wt')
  repo.git('stash', 'apply', entry.stash ?? '', '--index')
  assert.ok(ref.length > 0)
})

test('a work tree with more ignored files than the limit on what is saved is still removed, and what was ignored is written down', async () => {
  const repo = twoCommitRepo()
  const dir = join(repo.root, 'wt')
  repo.git('worktree', 'add', '-q', dir, '-b', 'wt')
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  const count = 25_000
  for (let at = 0; at < count; at++) writeFileSync(join(dir, 'node_modules', `f${at}`), '')
  const result = allowed(await run(repo, `git worktree remove "${slashes(dir)}"`))
  const [line] = journal(repo)
  assert.equal(line?.skipped, 'nothing-to-keep')
  assert.equal(line?.ref, undefined)
  assert.equal(line?.ignored?.count, 1)
  assert.ok(line?.ignored?.bytes === 0 || line?.ignored?.bytesAtLeast === 0)
  assert.deepEqual(refs(repo), [])
  assert.match(result.notices[0] ?? '', /被忽略的文件不在快照里/)
})

test('a clean work tree with no ignored files is removed without a line', async () => {
  const repo = twoCommitRepo()
  const dir = join(repo.root, 'wt')
  repo.git('worktree', 'add', '-q', dir, '-b', 'wt')
  assert.deepEqual(allowed(await run(repo, `git worktree remove "${slashes(dir)}"`)).notices, [])
  noSnapshot(repo)
})

// ---------------------------------------------------------------- where the journal goes

test('the main checkout and a work tree under it share one journal; the session is where the project is', async () => {
  const repo = twoCommitRepo()
  const inner = join(repo.dir, '.worktrees', 'x')
  repo.git('worktree', 'add', '-q', inner, '-b', 'x')
  repo.write({ 'a.txt': 'main edit\n' })
  writeFileSync(join(inner, 'a.txt'), 'inner edit\n')
  allowed(await run(repo, 'git checkout -- a.txt'))
  allowed(await run(repo, 'git checkout -- a.txt', { base: inner }))
  const lines = journal(repo)
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map(line => line.rootFrom), ['session', 'session'])
  assert.equal(slashes(lines[0]?.repo ?? '').toLowerCase(), slashes(lines[1]?.repo ?? '').toLowerCase())
  assert.equal(existsSync(join(inner, '.llm')), false)
})

test('a session outside any repository: the journal goes to the project of the repository, and says so', async () => {
  const repo = twoCommitRepo()
  const outside = join(tmpdir(), `outside-${process.pid}-${Date.now()}`)
  mkdirSync(outside, { recursive: true })
  try {
    repo.git('switch', '-q', '-c', 'work')
    repo.commit({ 'w.txt': 'w\n' }, 'work only')
    const result = allowed(await run(repo, `git -C "${slashes(repo.dir)}" reset --hard HEAD~1`, { base: outside }))
    assert.equal(result.notices.length, 1)
    assert.equal(journal(repo).at(-1)?.rootFrom, 'repo')
    assert.equal(existsSync(join(outside, '.llm')), false)
  }
  finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('with no .git to put the journal under, the command goes through, the snapshot ref exists, and no .llm is made anywhere', async () => {
  const repo = twoCommitRepo()
  const bare = join(tmpdir(), `bare-tree-${process.pid}-${Date.now()}`)
  const outside = join(tmpdir(), `outside2-${process.pid}-${Date.now()}`)
  mkdirSync(bare, { recursive: true })
  mkdirSync(outside, { recursive: true })
  try {
    // The work tree is a plain directory (no .git in it or above it); the git directory is the repository's.
    const result = allowed(await run(repo, `git --git-dir="${slashes(join(repo.dir, '.git'))}" --work-tree="${slashes(bare)}" checkout -- a.txt`, { base: outside }))
    assert.equal(result.degraded.length, 1)
    assert.match(result.degraded[0] ?? '', /^快照 \d{8}T\d{6}Z[0-9a-f]{4} 已存，记录没写上：/)
    assert.equal(refs(repo).length, 1)
    assert.equal(existsSync(join(bare, '.llm')), false)
    assert.equal(existsSync(join(outside, '.llm')), false)
    assert.deepEqual(journal(repo), [])
  }
  finally {
    rmSync(bare, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('the .llm directory: made with a .gitignore of * on the first write, completed when it exists without one, left alone when it has one', async () => {
  const fresh = twoCommitRepo()
  fresh.write({ 'a.txt': 'edit\n' })
  allowed(await run(fresh, 'git checkout -- a.txt'))
  assert.equal(readFileSync(join(fresh.dir, '.llm', '.gitignore'), 'utf8'), '*\n')
  assert.equal(fresh.git('status', '--porcelain').includes('.llm'), false, 'git does not see the directory')

  const bare = twoCommitRepo()
  mkdirSync(join(bare.dir, '.llm'))
  bare.write({ 'a.txt': 'edit\n' })
  allowed(await run(bare, 'git checkout -- a.txt'))
  assert.equal(readFileSync(join(bare.dir, '.llm', '.gitignore'), 'utf8'), '*\n')

  const own = twoCommitRepo()
  mkdirSync(join(own.dir, '.llm'))
  writeFileSync(join(own.dir, '.llm', '.gitignore'), 'metrics/\n')
  own.write({ 'a.txt': 'edit\n' })
  allowed(await run(own, 'git checkout -- a.txt'))
  assert.equal(readFileSync(join(own.dir, '.llm', '.gitignore'), 'utf8'), 'metrics/\n')
})

test('git clean -fd does not delete the journal and does not save it', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'a.txt': 'edit\n' })
  allowed(await run(repo, 'git checkout -- a.txt'))
  assert.equal(journal(repo).length, 1)
  repo.write({ 'new.txt': 'n\n' })
  allowed(await run(repo, 'git clean -fd'))
  sh(repo.dir, 'clean', '-fd')
  assert.equal(journal(repo).length, 2, 'the journal is still there')
  const last = journal(repo).at(-1)
  assert.deepEqual(repo.git('ls-tree', '-r', '--name-only', last?.files?.tree ?? '').split('\n'), ['new.txt'])
})

test('a .llm that is a regular file: the command goes through and the snapshot stays restorable', async () => {
  const repo = twoCommitRepo()
  writeFileSync(join(repo.dir, '.llm'), 'in the way')
  repo.write({ 'a.txt': 'edit\n' })
  const result = allowed(await run(repo, 'git checkout -- a.txt'))
  assert.equal(refs(repo).length, 1)
  assert.equal(result.notices.length, 1)
  assert.match(result.degraded[0] ?? '', /^快照 \d{8}T\d{6}Z[0-9a-f]{4} 已存，记录没写上：/)
})

test('without the journal the refs still list every snapshot', async () => {
  const repo = twoCommitRepo()
  repo.write({ 'a.txt': 'edit\n' })
  allowed(await run(repo, 'git checkout -- a.txt'))
  rmSync(join(repo.dir, '.llm'), { recursive: true, force: true })
  assert.equal(refs(repo).length, 1)
})
