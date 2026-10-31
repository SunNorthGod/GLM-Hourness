/**
 * The rules file in the repository against real git repositories (rules design
 * §7.5, the table that ends the section; docs/ORCHESTRATION.md §16): a clone
 * that has the file and no state, a file git or a hand changed, a checkout of
 * an old version, git in the middle of a merge, and the two ways out of an
 * outside change (adopt the file, restore the board's own). Every test makes
 * its repository with `git init`, commits with `git`, and reads the board's
 * files as they are on disk; the whole file is skipped, with the reason
 * stated, when git is not installed.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireLock, realLockEnvironment } from '../src/data/lock.ts'
import { openRulesBoard, type RulesBoard } from '../src/rules/engine.ts'
import { effectivePeakMode, repoJson, repoPart, unapprovedScripts, type Change, type JournalRecord } from '../src/rules/model.ts'
import { adoptRepoLocked, readProject, restoreRepoLocked, settleLocked, type ProjectRead } from '../src/rules/repo.ts'
import { appendRecord, applyRecord, ensureRuntimeDir, loadState, stateDigest, textDigest, writeSnapshot, type RulesPaths } from '../src/rules/store.ts'
import { FULL_RULES_FILE, scriptRef, SHA_OTHER } from './rules-fixtures.ts'
import { quickIo } from './rules-helpers.ts'

const SKIP = spawnSync('git', ['--version']).status === 0 ? false : 'git is not installed on this machine'

/** Run git in a directory with no configuration of the machine or the user in the way. */
function git(cwd: string, ...args: string[]): string {
  const run = spawnSync('git', ['-c', 'user.name=Rules Test', '-c', 'user.email=rules@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout
}

interface Repository {
  readonly root: string
  readonly board: RulesBoard
  readonly paths: RulesPaths
  /** Commit the rules directory. */
  readonly commit: (message: string) => void
}

const RULES_FILE = 'docs/rules/rules.json'

/** A git repository in a fresh temporary directory, with a board on it; removed afterwards. */
function gitTest(name: string, body: (repository: Repository) => Promise<void>): void {
  test(name, { skip: SKIP }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rules-git-'))
    try {
      git(root, 'init', '-q')
      const board = openRulesBoard({ projectRoot: root, io: quickIo() })
      await body({ root, board, paths: board.paths, commit: (message) => { git(root, 'add', 'docs'); git(root, 'commit', '-q', '-m', message) } })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

const io = quickIo()
const journal = async (paths: RulesPaths): Promise<JournalRecord[]> => (await readFile(paths.journal, 'utf8')).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalRecord)
const outsideCopies = async (paths: RulesPaths): Promise<string[]> => (await readdir(paths.runtimeDir)).filter(name => name.startsWith('.rules.json.outside-')).sort()
const fileText = (paths: RulesPaths): Promise<string> => readFile(paths.rulesFile, 'utf8')
const repoWritten = async (paths: RulesPaths): Promise<string> => (JSON.parse(await readFile(paths.repoWritten, 'utf8')) as { digest: string }).digest

/** The parts of the file a hand edit reaches, as loose records. */
interface HandFile {
  rules: Record<string, Record<string, unknown>>
  scripts: Record<string, unknown>
  peakMode: Record<string, unknown>
}

/** The same file with a change made to its parsed content and written as a hand would leave it (other layout, same meaning). */
async function handEdit(paths: RulesPaths, change: (file: HandFile) => void): Promise<string> {
  const file = JSON.parse(await fileText(paths)) as HandFile
  change(file)
  const text = `${JSON.stringify(file)}\n`
  await writeFile(paths.rulesFile, text)
  return text
}

/** The project as a clone of a repository with the full file: the file committed, the board started from it. */
async function startFromFullFile({ root, paths, board, commit }: Repository): Promise<void> {
  await mkdir(paths.rulesDir, { recursive: true })
  await writeFile(paths.rulesFile, repoJson(FULL_RULES_FILE))
  commit('rules')
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(git(root, 'status', '--porcelain'), '', 'starting from the file leaves the working tree as it was')
}

/** Settle, then run `body` under the write lock, as the engine does for the operations that use the file. */
async function locked<T>(paths: RulesPaths, body: (read: ProjectRead) => Promise<T>): Promise<T> {
  await ensureRuntimeDir(paths)
  const lock = await acquireLock(paths.lock, realLockEnvironment)
  if (lock === 'busy') throw new Error('the write lock is held by somebody else')
  try {
    return await body(await settleLocked(paths, io))
  }
  finally {
    await lock.release()
  }
}

/** A write the board itself would make, put straight into the journal and the snapshot (the operations that make it come in a later step). */
async function inject(paths: RulesPaths, op: string, changes: readonly Change[]): Promise<void> {
  const load = loadState(paths)
  const next = applyRecord(load.state, { seq: load.nextSeq, changes })
  await appendRecord(paths, { seq: load.nextSeq, at: '2026-11-04T09:00:00.000Z', actor: 'harness', op, changes, snapshot: stateDigest(next) })
  await writeSnapshot(paths, next, io)
}

gitTest('a fresh clone starts from the file git brought: a base record, everything decided, no script approved, and git sees no new file', async (repository) => {
  const { root, paths, commit } = repository
  await mkdir(paths.rulesDir, { recursive: true })
  await writeFile(paths.rulesFile, repoJson(FULL_RULES_FILE))
  commit('rules')
  const origin = root
  const cloneRoot = await mkdtemp(join(tmpdir(), 'rules-clone-'))
  try {
    git(tmpdir(), 'clone', '-q', origin, cloneRoot)
    const clone = openRulesBoard({ projectRoot: cloneRoot, io })
    await assert.rejects(readdir(clone.paths.runtimeDir), { code: 'ENOENT' }, 'a clone has no state of its own')
    const read = readProject(clone.paths)
    assert.equal(read.repo.kind, 'fresh-start')
    assert.deepEqual(Object.keys(read.state.rules ?? {}).sort(), ['r-lint-gate', 'r-no-evening-push'])
    assert.notEqual(await clone.settle(), 'busy')
    const [base, ...rest] = await journal(clone.paths)
    assert.equal(rest.length, 0)
    assert.deepEqual([base?.op, base?.actor, base?.seq, base?.changes], ['base', 'harness', 1, []])
    assert.match(base?.evidence ?? '', /从仓库里的规则文件读入/)
    assert.equal(base?.snapshot, stateDigest(base.state!))
    const state = loadState(clone.paths).state
    assert.deepEqual(repoPart(state), FULL_RULES_FILE)
    assert.deepEqual(unapprovedScripts(state).map(entry => [entry.id, entry.standing]), [['d-server-errors', 'not-approved'], ['r-lint-gate', 'not-approved']], 'the scripts came with git, not with a person\'s reading of them')
    for (const pin of Object.values(state.scripts ?? {})) assert.equal('approvedAt' in pin, false)
    assert.equal(state.repo.digest, textDigest(repoJson(FULL_RULES_FILE)))
    assert.equal(git(cloneRoot, 'status', '--porcelain'), '', 'the runtime directory is ignored before the first record')
    assert.equal(await repoWritten(clone.paths), state.repo.digest)
    assert.equal(readProject(clone.paths).repo.kind, 'in-sync')
  }
  finally {
    await rm(cloneRoot, { recursive: true, force: true })
  }
})

gitTest('a file with a script nobody approved on this machine is read in, listed, and gives no approval for the script to run', async (repository) => {
  await startFromFullFile(repository)
  const state = loadState(repository.paths).state
  assert.equal(effectivePeakMode(state).level, 'stop')
  assert.equal(state.rules?.['r-lint-gate']?.action.kind, 'script')
  assert.deepEqual(unapprovedScripts(state).map(entry => entry.id), ['d-server-errors', 'r-lint-gate'])
  // A person's later choice writes the file from the state; the pins keep their (absent) approval and go to git without one.
  const result = await repository.board.apply('human', { op: 'peak-mode-set', level: 'reduce' })
  assert.ok(result.ok)
  assert.equal(Object.values((JSON.parse(await fileText(repository.paths)) as { scripts: Record<string, object> }).scripts).some(pin => 'approvedAt' in pin), false)
  assert.deepEqual(unapprovedScripts(loadState(repository.paths).state).map(entry => entry.id), ['d-server-errors', 'r-lint-gate'])
})

gitTest('git checkout of an old version of the file does not take effect: one record and one copy per different file, and the mark goes when the file is back', async (repository) => {
  const { root, paths, board, commit } = repository
  assert.ok((await board.apply('human', { op: 'peak-mode-set', level: 'stop' })).ok)
  commit('v1')
  const v1 = await fileText(paths)
  assert.ok((await board.apply('human', { op: 'peak-mode-set', level: 'inform' })).ok)
  commit('v2')
  const v2 = await fileText(paths)

  git(root, 'checkout', 'HEAD~1', '--', RULES_FILE)
  assert.equal(await fileText(paths), v1)
  const read = readProject(paths)
  assert.equal(read.repo.kind, 'outside')
  assert.equal(effectivePeakMode(read.state).level, 'inform', 'the journal decides, not the file')
  assert.notEqual(await board.settle(), 'busy')
  const outside = loadState(paths).state.repo.outside
  assert.deepEqual([(await journal(paths)).at(-1)?.op, outside?.digest, outside?.diff], ['repo-outside', textDigest(v1), [{ path: ['peakMode'], change: 'changed', fields: ['at', 'level'] }]])
  assert.equal(await readFile(outside!.copy, 'utf8'), v1, 'the copy is the file as it was found')
  assert.equal((await outsideCopies(paths)).length, 1)
  const recorded = (await journal(paths)).length
  assert.notEqual(await board.settle(), 'busy')
  assert.equal((await journal(paths)).length, recorded, 'the same file is recorded once')

  // A different file is a different change; going back to the first one is recorded again only because it was cleared in between.
  const edited = await handEdit(paths, (file) => { file.peakMode.level = 'reduce' })
  assert.equal(readProject(paths).repo.kind, 'outside')
  assert.notEqual(await board.settle(), 'busy')
  assert.deepEqual([loadState(paths).state.repo.outside?.digest, (await journal(paths)).length], [textDigest(edited), recorded + 1])
  assert.equal((await outsideCopies(paths)).length, 2, 'each file that was found is kept')

  git(root, 'checkout', 'HEAD', '--', RULES_FILE)
  assert.equal(await fileText(paths), v2)
  assert.equal(readProject(paths).repo.kind, 'cleared')
  assert.notEqual(await board.settle(), 'busy')
  assert.deepEqual([(await journal(paths)).at(-1)?.op, loadState(paths).state.repo.outside, readProject(paths).repo.kind], ['repo-outside-cleared', undefined, 'in-sync'])
  assert.equal((await outsideCopies(paths)).length, 2, 'the copies stay for the person to look at')
  assert.equal(git(root, 'status', '--porcelain'), '')
})

gitTest('a hand edit of a rule is named in the difference, and the rule in force is still the one in the journal', async (repository) => {
  const { paths, board } = repository
  await startFromFullFile(repository)
  assert.ok((await board.apply('human', { op: 'peak-mode-set', level: 'reduce' })).ok, 'the first write of the board puts the file in its own layout')
  const original = await fileText(paths)
  await handEdit(paths, (file) => { file.rules['r-no-evening-push'].reason = 'Edited by hand.'; delete file.rules['r-lint-gate'] })
  const read = readProject(paths)
  assert.equal(read.repo.kind, 'outside')
  assert.equal(read.state.rules?.['r-no-evening-push']?.reason, 'Evening pushes broke the nightly build twice.', 'the rule the journal holds is the one that judges')
  assert.notEqual(await board.settle(), 'busy')
  assert.deepEqual(loadState(paths).state.repo.outside?.diff, [
    { path: ['rules', 'r-lint-gate'], change: 'removed' },
    { path: ['rules', 'r-no-evening-push'], change: 'changed', fields: ['reason'] },
  ])
  await writeFile(paths.rulesFile, original)
  assert.equal(readProject(paths).repo.kind, 'cleared', 'put back as it was, the mark goes without a command')
})

gitTest('while git is merging only the journal and the snapshot are written; repo-written.json and the file wait until the mark is gone', async (repository) => {
  const { root, paths, board } = repository
  await startFromFullFile(repository)
  const fileBefore = await fileText(paths)
  const writtenBefore = await repoWritten(paths)
  await writeFile(join(root, '.git', 'MERGE_HEAD'), `${git(root, 'rev-parse', 'HEAD').trim()}\n`)
  const result = await board.apply('human', { op: 'peak-mode-set', level: 'reduce' })
  assert.ok(result.ok)
  assert.equal(result.file, 'deferred')
  const head = (await journal(paths)).at(-1)
  assert.deepEqual([head?.op, head?.seq, loadState(paths).state.seq, loadState(paths).state.peakMode?.level], ['peak-mode-set', 2, 2, 'reduce'], 'the choice stands at once')
  assert.equal(await fileText(paths), fileBefore, 'the file is not touched during the merge')
  assert.equal(await repoWritten(paths), writtenBefore, 'repo-written.json still names the file that is there')
  assert.equal(readProject(paths).repo.kind, 'owed')
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(await fileText(paths), fileBefore, 'git is still merging')
  await unlink(join(root, '.git', 'MERGE_HEAD'))
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(await fileText(paths), repoJson(repoPart(loadState(paths).state)!))
  assert.equal(await repoWritten(paths), loadState(paths).state.repo.digest)
  assert.equal((await journal(paths)).length, 2, 'writing the file that was owed is not a record')
  assert.equal(readProject(paths).repo.kind, 'in-sync')
})

gitTest('repo-adopt writes the file\'s decisions into the state as one record of the person; a script that changed or is new waits for approval, one that did not keeps it', async (repository) => {
  const { paths, board } = repository
  await startFromFullFile(repository)
  await inject(paths, 'script-approved', [{ path: ['scripts', 'd-server-errors'], value: { ...scriptRef('d-server-errors', SHA_OTHER), approvedAt: '2026-11-04T09:00:00.000Z' } }, { path: ['scripts', 'r-lint-gate'], value: { ...scriptRef('r-lint-gate'), approvedAt: '2026-11-04T09:00:00.000Z' } }])
  assert.deepEqual(unapprovedScripts(loadState(paths).state), [], 'both scripts were approved here')

  const text = await handEdit(paths, (file) => {
    file.rules['r-no-evening-push'].reason = 'Edited by hand.'
    file.rules['r-lint-gate'].action = { kind: 'script', script: scriptRef('r-lint-gate', 'c'.repeat(64)), onError: 'block' }
    file.scripts['r-lint-gate'] = scriptRef('r-lint-gate', 'c'.repeat(64))
  })
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(readProject(paths).repo.kind, 'outside-known')
  const before = (await journal(paths)).length

  const adopted = await locked(paths, read => adoptRepoLocked(paths, read, io))
  assert.ok(adopted.ok)
  assert.deepEqual([adopted.changed, adopted.needsRepin], [true, ['r-lint-gate']])
  const records = await journal(paths)
  const record = records.at(-1)!
  assert.equal(records.length, before + 1, 'one record')
  assert.deepEqual([record.op, record.actor, record.target, record.reason], ['repo-adopt', 'human', 'rules.json', '人照仓库里的规则文件改了'])
  assert.deepEqual(record.changes.map(change => (change.path as string[]).join('/')), ['repo', 'rules/r-lint-gate', 'rules/r-no-evening-push', 'scripts/r-lint-gate'])
  const state = loadState(paths).state
  assert.equal(state.rules?.['r-no-evening-push']?.reason, 'Edited by hand.')
  assert.equal(state.rules?.['r-no-evening-push']?.origin.at, FULL_RULES_FILE.rules?.['r-no-evening-push']?.origin.at, 'the rule keeps its own origin; the record says who adopted')
  assert.equal(state.scripts?.['d-server-errors']?.approvedAt, '2026-11-04T09:00:00.000Z', 'the script that did not change keeps its approval')
  assert.equal('approvedAt' in (state.scripts?.['r-lint-gate'] ?? {}), false, 'the script that changed does not')
  assert.deepEqual(unapprovedScripts(state).map(entry => [entry.id, entry.standing]), [['r-lint-gate', 'not-approved']])
  assert.deepEqual([state.repo.outside, state.repo.digest, await repoWritten(paths), await fileText(paths)], [undefined, textDigest(text), textDigest(text), text], 'the file stays as the person left it and is the board\'s again')
  assert.equal(readProject(paths).repo.kind, 'in-sync')
  assert.equal((await outsideCopies(paths)).length, 1, 'the copy is kept')

  await copyFile(paths.state, `${paths.state}.kept`)
  await unlink(paths.state)
  assert.equal(stateDigest(loadState(paths).state), record.snapshot, 'a replay of the journal gives the state the adoption left')
  assert.equal(loadState(paths).plan?.recovered?.skipped.length, 0)
  await copyFile(`${paths.state}.kept`, paths.state)

  const again = await locked(paths, read => adoptRepoLocked(paths, read, io))
  assert.ok(again.ok)
  assert.deepEqual([again.changed, (await journal(paths)).length], [false, before + 1], 'nothing left to adopt, nothing written')
})

gitTest('repo-adopt refuses a file it cannot read or one that is gone, and writes nothing', async (repository) => {
  const { paths } = repository
  await startFromFullFile(repository)
  const refuse = async (): Promise<string> => {
    const result = await locked(paths, read => adoptRepoLocked(paths, read, io))
    assert.equal(result.ok, false)
    return result.ok ? '' : result.reason
  }
  await writeFile(paths.rulesFile, '{ "version": 2, "rules": ')
  const count = (await journal(paths)).length + 1
  assert.match(await refuse(), /不是 JSON/)
  assert.equal((await journal(paths)).length, count, 'only the record of the outside change')
  await writeFile(paths.rulesFile, repoJson({ version: 2, rules: { 'r-x': { ...FULL_RULES_FILE.rules!['r-no-evening-push'], id: 'r-x', action: { kind: 'explode' } as never } } }))
  assert.match(await refuse(), /r-x\.action/)
  await unlink(paths.rulesFile)
  assert.match(await refuse(), /没有规则文件/)
  assert.equal((await journal(paths)).length, count + 2, 'each different file was recorded once, nothing was adopted')
  assert.equal(effectivePeakMode(loadState(paths).state).level, 'stop')
  assert.equal(unapprovedScripts(loadState(paths).state).length, 2)
})

gitTest('repo-restore writes the board\'s own file back over a changed or deleted one, clears the mark, and waits for git when git is merging', async (repository) => {
  const { root, paths, board, commit } = repository
  await startFromFullFile(repository)
  assert.ok((await board.apply('human', { op: 'peak-mode-set', level: 'reduce' })).ok)
  commit('board layout')
  const own = await fileText(paths)

  await handEdit(paths, (file) => { delete file.rules['r-lint-gate'] })
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(readProject(paths).repo.kind, 'outside-known')
  const restored = await locked(paths, read => restoreRepoLocked(paths, read, io))
  assert.ok(restored.ok)
  assert.deepEqual([restored.changed, restored.file], [true, 'written'])
  const record = (await journal(paths)).at(-1)!
  assert.deepEqual([record.op, record.actor, record.reason], ['repo-restore', 'human', '人让规则板按自己的存档写回了仓库里的规则文件'])
  assert.deepEqual([await fileText(paths), loadState(paths).state.repo, await repoWritten(paths), readProject(paths).repo.kind], [own, { digest: textDigest(own) }, textDigest(own), 'in-sync'])
  assert.equal(git(root, 'status', '--porcelain'), '', 'git sees the file as it was committed')

  await unlink(paths.rulesFile)
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(loadState(paths).state.repo.outside?.copy, '', 'a file that is gone has no copy')
  const afterDelete = await locked(paths, read => restoreRepoLocked(paths, read, io))
  assert.ok(afterDelete.ok && afterDelete.changed)
  assert.equal(await fileText(paths), own)

  await writeFile(join(root, '.git', 'MERGE_HEAD'), `${git(root, 'rev-parse', 'HEAD').trim()}\n`)
  await handEdit(paths, (file) => { delete file.rules['r-lint-gate'] })
  assert.notEqual(await board.settle(), 'busy')
  const during = await locked(paths, read => restoreRepoLocked(paths, read, io))
  assert.ok(during.ok)
  assert.deepEqual([during.changed, during.file], [true, 'deferred'])
  assert.notEqual(await fileText(paths), own, 'the file is not written while git is merging')
  assert.equal(loadState(paths).state.repo.outside, undefined, 'the choice is recorded now')
  await unlink(join(root, '.git', 'MERGE_HEAD'))
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(await fileText(paths), own, 'written when git is done')
  assert.equal(readProject(paths).repo.kind, 'in-sync')

  const nothing = await locked(paths, read => restoreRepoLocked(paths, read, io))
  assert.ok(nothing.ok)
  assert.deepEqual([nothing.changed, nothing.file], [false, 'unchanged'])
})

gitTest('repo-restore on a project where nothing is decided removes a file somebody added, after the board kept a copy', async (repository) => {
  const { paths, board } = repository
  await ensureRuntimeDir(paths)
  await inject(paths, 'note', [{ path: ['recovered'], value: { at: '2026-11-04T09:00:00.000Z', reason: 'snapshot-corrupt', lost: false } }])
  await mkdir(paths.rulesDir, { recursive: true })
  await writeFile(paths.rulesFile, repoJson(FULL_RULES_FILE))
  assert.notEqual(await board.settle(), 'busy')
  assert.equal(loadState(paths).state.repo.outside?.digest, textDigest(repoJson(FULL_RULES_FILE)))
  const restored = await locked(paths, read => restoreRepoLocked(paths, read, io))
  assert.ok(restored.ok)
  assert.deepEqual([restored.changed, restored.file], [true, 'removed'])
  await assert.rejects(fileText(paths), { code: 'ENOENT' })
  assert.deepEqual([loadState(paths).state.repo, readProject(paths).repo.kind], [{ digest: null }, 'in-sync'])
  assert.equal(await readFile(join(paths.runtimeDir, (await outsideCopies(paths))[0]), 'utf8'), repoJson(FULL_RULES_FILE))
})

gitTest('a crash between the journal and the snapshot of an adoption leaves a state the next read completes, with no recovered record', async (repository) => {
  const { paths, board } = repository
  await startFromFullFile(repository)
  await handEdit(paths, (file) => { file.rules['r-no-evening-push'].reason = 'Edited by hand.' })
  assert.notEqual(await board.settle(), 'busy')
  await copyFile(paths.state, `${paths.state}.before`)
  const adopted = await locked(paths, read => adoptRepoLocked(paths, read, io))
  assert.ok(adopted.ok && adopted.changed)
  const snapshot = (await journal(paths)).at(-1)!.snapshot
  await copyFile(`${paths.state}.before`, paths.state)
  const load = loadState(paths)
  assert.deepEqual([load.source, stateDigest(load.state), load.plan?.rewriteSnapshot, load.plan?.recovered], ['replay', snapshot, true, undefined])
  assert.equal(load.state.rules?.['r-no-evening-push']?.reason, 'Edited by hand.')
  assert.notEqual(await board.settle(), 'busy')
  assert.equal((await journal(paths)).at(-1)?.op, 'repo-adopt', 'catching the snapshot up writes no record')
})
