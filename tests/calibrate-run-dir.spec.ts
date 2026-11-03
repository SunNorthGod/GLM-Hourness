/**
 * Where the calibration runs live while they run (scripts/calibrate/run-dir.mjs;
 * docs/ORCHESTRATION.md §10.5.1, risk `risk-calib-read`): outside the repository
 * and outside each other, copied back whole when the batch is done, and the
 * temporary directories deleted only after every file was compared, and only
 * those the record names that are direct children of the temporary root with
 * the module's prefix. The repository and the temporary root are temporary
 * directories of the test.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
// @ts-expect-error The script is plain JavaScript without a declaration file.
import { closeBatch, collectBatch, openBatch, openRun } from '../scripts/calibrate/run-dir.mjs'

interface Batch {
  readonly repo: string
  readonly stamp: string
  readonly tmp: string
  readonly target: string
  readonly root: string
}
interface Collected {
  readonly ok: boolean
  readonly kept: string[]
  readonly message: string
}
const open = openBatch as (repo: string, stamp: string, tmp?: string) => Batch
const run = openRun as (batch: Batch, name: string) => string
const close = closeBatch as (batch: Batch) => Collected
const collect = collectBatch as (repo: string, stamp: string, tmp?: string) => Collected

const STAMP = '2026-11-01T08-00-00-000Z'

/** A repository and a temporary root, both empty and apart. */
function places(): { readonly repo: string, readonly tmp: string } {
  const base = mkdtempSync(join(tmpdir(), 'calibrate-run-dir-'))
  const repo = join(base, 'repo')
  const tmp = join(base, 'tmp')
  mkdirSync(repo)
  mkdirSync(tmp)
  return { repo, tmp }
}

const put = (file: string, content: string | Buffer): void => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** What a finished run leaves: its workspace with a git directory, its own data directories and a result. */
function leave(dir: string, mark: string): void {
  put(join(dir, 'ws', '.git', 'HEAD'), 'ref: refs/heads/master\n')
  put(join(dir, 'ws', '.git', 'objects', 'ab', 'cdef'), Buffer.from([0, 1, 2, 255, 254, 0, 7]))
  put(join(dir, 'ws', 'docs', 'graph', 'nodes', 'goal-1.json'), `{"id":"goal-1","mark":"${mark}"}\n`)
  put(join(dir, 'home', 'audit', 'violations.jsonl'), `{"rule":"x","mark":"${mark}"}\n`)
  put(join(dir, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'), '')
  put(join(dir, 'human.jsonl'), `{"kind":"reply","mark":"${mark}"}\n`)
  put(join(dir, 'result.json'), `{"mark":"${mark}"}\n`)
}

/** A batch of two finished runs and its results, not closed yet, in places of their own. */
function twoRuns(results: string): { readonly repo: string, readonly tmp: string, readonly batch: Batch, readonly first: string, readonly second: string } {
  const { repo, tmp } = places()
  const batch = open(repo, STAMP, tmp)
  const first = run(batch, 'task--glm-5.3')
  const second = run(batch, 'task--glm-5.3-flash')
  put(join(batch.root, 'results.json'), results)
  leave(first, 'one')
  leave(second, 'two')
  return { repo, tmp, batch, first, second }
}

const inside = (parent: string, child: string): boolean => !relative(parent, child).startsWith('..') && relative(parent, child) !== ''
const entriesOf = (dir: string): string[] => readdirSync(dir).sort()

test('the batch directory and each run get a directory of their own in the temporary root: none in the repository, none inside another, and all of them on the record before a run starts', () => {
  const { repo, tmp } = places()
  const batch = open(repo, STAMP, tmp)
  const first = run(batch, 'interview-expense-log--glm-5.3--1')
  const second = run(batch, 'interview-expense-log--glm-5.3--2')
  const dirs = [batch.root, first, second]
  assert.equal(new Set(dirs).size, 3)
  for (const dir of dirs) {
    assert.equal(dirname(dir), tmp, 'a direct child of the temporary root')
    assert.ok(/^glm-hourness-calib-(batch|run)-/.test(dir.slice(tmp.length + 1)))
    assert.equal(inside(repo, dir), false, 'not in the repository')
    for (const other of dirs) if (other !== dir) assert.equal(inside(other, dir), false, 'not inside another')
  }
  assert.equal(batch.target, join(repo, '.llm', 'calibration-runs', STAMP))
  assert.deepEqual(entriesOf(batch.target), ['pending.json'], 'the repository side holds the record only')
  assert.deepEqual(JSON.parse(readFileSync(join(batch.target, 'pending.json'), 'utf8')), {
    root: batch.root,
    runs: [{ name: 'interview-expense-log--glm-5.3--1', dir: first }, { name: 'interview-expense-log--glm-5.3--2', dir: second }],
  })
  assert.throws(() => run(batch, '../escape'), /not a name for a run directory/)
  assert.throws(() => run(batch, 'a/b'), /not a name for a run directory/)
})

test('closing the batch copies every file of the batch and of each run, the git directory of a workspace and binary files included, byte for byte, and then deletes the temporary directories and the record', () => {
  const { tmp, batch } = twoRuns('{"runs":2}\n')
  const closed = close(batch)
  assert.deepEqual([closed.ok, closed.kept, closed.message], [true, [], ''])
  assert.deepEqual(entriesOf(batch.target), ['results.json', 'task--glm-5.3', 'task--glm-5.3-flash'])
  assert.equal(readFileSync(join(batch.target, 'results.json'), 'utf8'), '{"runs":2}\n')
  for (const [name, mark] of [['task--glm-5.3', 'one'], ['task--glm-5.3-flash', 'two']] as const) {
    const copy = join(batch.target, name)
    assert.equal(readFileSync(join(copy, 'ws', '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/master\n')
    assert.deepEqual([...readFileSync(join(copy, 'ws', '.git', 'objects', 'ab', 'cdef'))], [0, 1, 2, 255, 254, 0, 7])
    assert.equal(readFileSync(join(copy, 'ws', 'docs', 'graph', 'nodes', 'goal-1.json'), 'utf8'), `{"id":"goal-1","mark":"${mark}"}\n`)
    assert.equal(readFileSync(join(copy, 'home', 'audit', 'violations.jsonl'), 'utf8'), `{"rule":"x","mark":"${mark}"}\n`)
    assert.equal(readFileSync(join(copy, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'), 'utf8'), '', 'an empty file is copied too')
  }
  assert.deepEqual(readdirSync(tmp), [], 'every temporary directory is gone')
  assert.equal(existsSync(join(batch.target, 'pending.json')), false)
})

test('a copy that cannot be made leaves the temporary directories and the record where they were, names the directories and the command that finishes it, and finishes when the cause is gone', () => {
  const { repo, tmp, batch, first, second } = twoRuns('{}\n')
  // A file of the same name is there already in the place the second run goes to.
  put(join(batch.target, 'task--glm-5.3-flash', 'ws', 'docs', 'old.txt'), 'older\n')
  const closed = close(batch)
  assert.equal(closed.ok, false)
  assert.deepEqual(closed.kept, [batch.root, first, second])
  assert.ok(closed.message.startsWith(`拷回没有完成：临时目录 ${batch.root}、${first}、${second} 保留（`), closed.message)
  assert.ok(closed.message.endsWith(`；修好后运行 npm run calibrate -- --collect ${STAMP}`), closed.message)
  for (const dir of [batch.root, first, second]) assert.ok(existsSync(dir), dir)
  assert.ok(existsSync(join(batch.target, 'pending.json')))
  assert.equal(existsSync(join(batch.target, 'results.json')), false, 'what was copied before it stopped is taken away again')
  assert.equal(existsSync(join(batch.target, 'task--glm-5.3')), false)
  // The person removes the older copy; the same command as the message says finishes the batch.
  rmSync(join(batch.target, 'task--glm-5.3-flash'), { recursive: true })
  const finished = collect(repo, STAMP, tmp)
  assert.deepEqual([finished.ok, finished.kept], [true, []])
  assert.deepEqual(entriesOf(batch.target), ['results.json', 'task--glm-5.3', 'task--glm-5.3-flash'])
  assert.deepEqual(readdirSync(tmp), [])
})

test('a batch that was never closed, because the runner stopped, is copied back and cleared by collecting it from the record alone', () => {
  const { repo, tmp } = places()
  const batch = open(repo, STAMP, tmp)
  const dir = run(batch, 'task--glm-5.3')
  put(join(batch.root, 'results.json'), '{"partial":true}\n')
  leave(dir, 'crash')
  const collected = collect(repo, STAMP, tmp)
  assert.deepEqual([collected.ok, collected.kept], [true, []])
  assert.equal(readFileSync(join(batch.target, 'task--glm-5.3', 'result.json'), 'utf8'), '{"mark":"crash"}\n')
  assert.equal(readFileSync(join(batch.target, 'results.json'), 'utf8'), '{"partial":true}\n')
  assert.deepEqual(readdirSync(tmp), [])
  // A stamp with no record is a message, not a crash.
  const none = collect(repo, 'no-such-batch', tmp)
  assert.equal(none.ok, false)
  assert.match(none.message, /^拷回没有完成：读不到 /)
})

test('only a path of the record that is a direct child of the temporary root with the prefix is deleted: a path in the repository, one without the prefix, one deeper down and one elsewhere are kept and reported', () => {
  const { repo, tmp } = places()
  const batch = open(repo, STAMP, tmp)
  const good = run(batch, 'good')
  leave(good, 'good')
  const inRepo = join(repo, 'src')
  const noPrefix = join(tmp, 'other-work')
  const deeper = join(noPrefix, 'glm-hourness-calib-run-deep')
  const elsewhere = mkdtempSync(join(dirname(tmp), 'glm-hourness-calib-run-'))
  for (const [dir, file] of [[inRepo, 'index.ts'], [noPrefix, 'notes.txt'], [deeper, 'a.txt'], [elsewhere, 'b.txt']] as const) put(join(dir, file), 'keep me\n')
  writeFileSync(join(batch.target, 'pending.json'), JSON.stringify({
    root: batch.root,
    runs: [{ name: 'good', dir: good }, { name: 'repo', dir: inRepo }, { name: 'plain', dir: noPrefix }, { name: 'deep', dir: deeper }, { name: 'away', dir: elsewhere }],
  }))
  const collected = collect(repo, STAMP, tmp)
  assert.equal(collected.ok, true, collected.message)
  assert.deepEqual([...collected.kept].sort(), [deeper, elsewhere, inRepo, noPrefix].sort())
  assert.match(collected.message, /^没有删除这些目录/)
  for (const dir of [inRepo, noPrefix, deeper, elsewhere]) assert.ok(existsSync(dir), `${dir} is still there`)
  assert.equal(existsSync(good), false)
  assert.equal(existsSync(batch.root), false)
  assert.equal(existsSync(join(batch.target, 'pending.json')), false)
  // A record whose names would leave the batch's directory, or that is not a record at all, copies nothing.
  const forged = open(repo, 'forged', tmp)
  writeFileSync(join(forged.target, 'pending.json'), JSON.stringify({ root: forged.root, runs: [{ name: '../escape', dir: forged.root }] }))
  const refused = collect(repo, 'forged', tmp)
  assert.equal(refused.ok, false)
  assert.match(refused.message, /is not a record of this module/)
  assert.equal(existsSync(join(repo, '.llm', 'calibration-runs', 'escape')), false)
  assert.ok(existsSync(forged.root))
})
