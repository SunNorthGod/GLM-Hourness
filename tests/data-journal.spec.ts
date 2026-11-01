/**
 * The append-only journal of memory and lessons (M5 design §5.2, §5.3) on real
 * files in temporary directories: the fold with its bad lines, the half last
 * line, the repeated `seq`, the cache, the lock options M5 passes, the order
 * of a write, and two processes writing one journal. The lock's own behavior
 * (`wx`, the token, the take-over) is tested with the lock (tests/rules-engine.spec.ts,
 * tests/execute-gate-lock.spec.ts); here only what the journal asks of it.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { open } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { appendJournal, parseRecord, readJournal, readJournalSync, type AppendOptions, type Fold, type JournalRecord, type NewRecord } from '../src/data/journal.ts'
import type { LockEnvironment } from '../src/data/lock.ts'

const run = promisify(execFile)

/** The ids of the records that held, in order; a record with the op `refuse` does not hold. */
const idsFold: Fold<readonly string[]> = {
  empty: () => [],
  apply: (state, record) => record.op === 'refuse' ? { bad: 'the fold refuses this record' } : { state: [...state, record.id] },
}

const scratch = (): string => mkdtempSync(join(tmpdir(), 'journal-'))
const OPTIONS: AppendOptions = { directory: 'user', row: 'test' }
const tick = (id: string, extra: Partial<NewRecord> = {}): NewRecord => ({ actor: 'harness', op: 'tick', id, ...extra })
const add = (...records: NewRecord[]) => () => ({ records })
const linesOf = (file: string): string[] => readFileSync(file, 'utf8').split('\n').filter(line => line !== '')
const recordAt = (seq: number, id = `r${seq}`): string => JSON.stringify({ v: 1, seq, at: '2026-11-01T00:00:00.000Z', actor: 'harness', op: 'tick', id })

const START = Date.parse('2026-11-01T00:00:00Z')
const BOOT = START - 3_600_000

/** A lock environment on a clock that only `sleep` moves, for a process id that is "alive". */
function clockEnvironment(): LockEnvironment {
  let clock = START
  return { now: () => clock, sleep: (ms) => { clock += ms; return Promise.resolve() }, pid: 4242, isAlive: () => true, bootTime: () => BOOT }
}

const foreignLock = (file: string, content: { readonly at: number, readonly boot?: number }): void => {
  writeFileSync(`${file}.lock`, JSON.stringify({ pid: 999_999, startedAt: content.at, at: content.at, token: 'someone-else', ...(content.boot === undefined ? {} : { boot: content.boot }) }))
}

test('parseRecord accepts a record and says why a line is not one', () => {
  const full = { v: 1, seq: 3, at: '2026-11-01T00:00:00.000Z', actor: 'llm', relay: 'say it', by: { session: 's-1', tool: 'memory_store' }, op: 'store', id: 'x', reason: 'because', evidence: ['commit:cae6ddf'], data: { a: [1, null] } }
  assert.deepEqual(parseRecord(JSON.stringify(full)), full)
  const broken: ReadonlyArray<readonly [string, string]> = [
    ['{nope', 'not JSON'],
    ['[1]', 'not a record'],
    [JSON.stringify({ ...full, v: 2 }), 'v is not 1'],
    [JSON.stringify({ ...full, seq: 0 }), 'seq is not a positive integer'],
    [JSON.stringify({ ...full, seq: 1.5 }), 'seq is not a positive integer'],
    [JSON.stringify({ ...full, at: 'yesterday' }), 'at is not a time'],
    [JSON.stringify({ ...full, actor: 'robot' }), 'actor is not human, llm or harness'],
    [JSON.stringify({ ...full, op: '' }), 'op is empty'],
    [JSON.stringify({ ...full, id: '' }), 'id is empty'],
    [JSON.stringify({ ...full, relay: 'x'.repeat(501) }), 'relay is not text of at most 500 characters'],
    [JSON.stringify({ ...full, reason: 'x'.repeat(301) }), 'reason is not text of at most 300 characters'],
    [JSON.stringify({ ...full, evidence: 'commit:cae6ddf' }), 'evidence is not a list of text'],
    [JSON.stringify({ ...full, by: { session: 1 } }), 'by is not an origin'],
    [JSON.stringify({ ...full, by: { colour: 'red' } }), 'by is not an origin'],
  ]
  for (const [line, reason] of broken) assert.equal(parseRecord(line), reason, line)
})

test('a journal that does not exist reads as empty, with the existence and size said', async () => {
  const file = join(scratch(), 'none.jsonl')
  const reading = await readJournal(file, idsFold)
  assert.deepEqual(reading, { state: [], bad: [], seqAnomalies: 0, lastSeq: 0, exists: false, size: 0 })
  assert.deepEqual(readJournalSync(file, idsFold), reading)
})

test('reading folds the records in file order and counts the lines that do not hold, with their numbers', async () => {
  const file = join(scratch(), 'j.jsonl')
  writeFileSync(file, [
    recordAt(1),
    '{broken',
    '',
    JSON.stringify({ v: 1, seq: 2, at: '2026-11-01T00:00:00.000Z', actor: 'harness', op: 'refuse', id: 'nope' }),
    recordAt(3),
    '',
  ].join('\n'))
  for (const reading of [await readJournal(file, idsFold), readJournalSync(file, idsFold)]) {
    assert.deepEqual(reading.state, ['r1', 'r3'])
    assert.deepEqual(reading.bad, [{ line: 2, reason: 'not JSON' }, { line: 4, reason: 'the fold refuses this record' }])
    assert.equal(reading.lastSeq, 3)
    assert.equal(reading.seqAnomalies, 0)
    assert.equal(reading.exists, true)
  }
})

test('a last line without a newline is ignored by a reader; CRLF endings are read', async () => {
  const file = join(scratch(), 'j.jsonl')
  writeFileSync(file, `${recordAt(1)}\n${recordAt(2).slice(0, 30)}`)
  assert.deepEqual((await readJournal(file, idsFold)).state, ['r1'])
  assert.deepEqual((await readJournal(file, idsFold)).bad, [])
  writeFileSync(file, `${recordAt(1)}\r\n${recordAt(2)}\r\n`)
  assert.deepEqual(readJournalSync(file, idsFold).state, ['r1', 'r2'])
})

test('a repeated or smaller seq is applied and counted, not dropped', async () => {
  const file = join(scratch(), 'j.jsonl')
  writeFileSync(file, [recordAt(1, 'a'), recordAt(2, 'b'), recordAt(2, 'c'), recordAt(1, 'd'), recordAt(5, 'e')].map(line => `${line}\n`).join(''))
  const reading = await readJournal(file, idsFold)
  assert.deepEqual(reading.state, ['a', 'b', 'c', 'd', 'e'])
  assert.equal(reading.seqAnomalies, 2)
  assert.equal(reading.lastSeq, 5)
})

test('both readers share one cache on the size and modification time: the same reading while the file is unchanged, a new one after a write', async () => {
  const file = join(scratch(), 'j.jsonl')
  assert.equal((await appendJournal(file, idsFold, add(tick('a')), OPTIONS)).status, 'ok')
  const first = await readJournal(file, idsFold)
  assert.equal(readJournalSync(file, idsFold), first)
  assert.equal(await readJournal(file, idsFold), first)
  assert.equal((await appendJournal(file, idsFold, add(tick('b')), OPTIONS)).status, 'ok')
  const second = readJournalSync(file, idsFold)
  assert.notEqual(second, first)
  assert.deepEqual(second.state, ['a', 'b'])
  const other: Fold<number> = { empty: () => 0, apply: state => ({ state: state + 1 }) }
  assert.equal((await readJournal(file, other)).state, 2, 'another fold does not get the first fold\'s cached state')
})

test('append writes records with v, seq and at, one line each, numbered from 1; the plan sees the file as it is', async () => {
  const file = join(scratch(), 'sub', 'j.jsonl')
  const environment = clockEnvironment()
  const seen: Array<readonly string[]> = []
  const plan = (id: string) => (reading: { readonly state: readonly string[] }) => {
    seen.push(reading.state)
    return { records: [tick(id, { relay: 'in my words', by: { session: 's-1', callId: 'call_1' }, reason: 'why', evidence: ['commit:cae6ddf'], data: { n: 1 } })] }
  }
  const first = await appendJournal(file, idsFold, plan('a'), { ...OPTIONS, lock: environment })
  assert.equal(first.status, 'ok')
  const second = await appendJournal(file, idsFold, add(tick('b'), tick('c')), { ...OPTIONS, lock: environment })
  assert.equal(second.status, 'ok')
  assert.deepEqual(seen, [[]])
  const lines = linesOf(file).map(line => parseRecord(line) as JournalRecord)
  assert.deepEqual(lines.map(record => [record.seq, record.id]), [[1, 'a'], [2, 'b'], [3, 'c']])
  assert.deepEqual(lines[0], { v: 1, seq: 1, at: new Date(START).toISOString(), actor: 'harness', relay: 'in my words', by: { session: 's-1', callId: 'call_1' }, op: 'tick', id: 'a', reason: 'why', evidence: ['commit:cae6ddf'], data: { n: 1 } })
  assert.deepEqual(first.status === 'ok' && first.records, [lines[0]])
  assert.ok(!existsSync(`${file}.lock`), 'the lock is released')
})

test('origin fields that are not host ids are left out; the others are written', async () => {
  const file = join(scratch(), 'j.jsonl')
  await appendJournal(file, idsFold, add(tick('a', { by: { session: 'has space', tool: 'memory_store', agent: 'x'.repeat(129) } }), tick('b', { by: { session: 'bad id' } })), OPTIONS)
  const [a, b] = linesOf(file).map(line => parseRecord(line) as JournalRecord)
  assert.deepEqual(a.by, { tool: 'memory_store' })
  assert.equal(b.by, undefined)
})

test('a plan can refuse: nothing is written, the refusal comes back, the lock is released', async () => {
  const file = join(scratch(), 'j.jsonl')
  await appendJournal(file, idsFold, add(tick('a')), OPTIONS)
  const before = readFileSync(file, 'utf8')
  const refused = await appendJournal(file, idsFold, reading => reading.state.includes('a') ? { refused: { code: 'similar', with: 'a' } } : { records: [tick('b')] }, OPTIONS)
  assert.deepEqual(refused, { status: 'refused', refused: { code: 'similar', with: 'a' } })
  assert.equal(readFileSync(file, 'utf8'), before)
  assert.ok(!existsSync(`${file}.lock`))
  const empty = await appendJournal(file, idsFold, add(), OPTIONS)
  assert.deepEqual(empty, { status: 'ok', records: [] })
  assert.equal(readFileSync(file, 'utf8'), before)
})

test('a plan that throws rejects the append and still releases the lock', async () => {
  const file = join(scratch(), 'j.jsonl')
  await assert.rejects(appendJournal(file, idsFold, () => { throw new Error('plan failed') }, OPTIONS), /plan failed/)
  assert.ok(!existsSync(`${file}.lock`))
  assert.equal((await appendJournal(file, idsFold, add(tick('a')), OPTIONS)).status, 'ok', 'the queue goes on')
})

test('a record that is not a valid record is not written', async () => {
  const file = join(scratch(), 'j.jsonl')
  const result = await appendJournal(file, idsFold, add(tick('a'), tick('b', { reason: 'x'.repeat(301) })), OPTIONS)
  assert.deepEqual(result, { status: 'invalid', message: 'record tick b: reason is not text of at most 300 characters' })
  assert.ok(!existsSync(file) || readFileSync(file, 'utf8') === '')
})

test('concurrent appends in one process run one after the other, in the order they were asked', async () => {
  const file = join(scratch(), 'j.jsonl')
  const results = await Promise.all(['a', 'b', 'c', 'd'].map(id => appendJournal(file, idsFold, add(tick(id)), OPTIONS)))
  assert.deepEqual(results.map(result => result.status), ['ok', 'ok', 'ok', 'ok'])
  assert.deepEqual(linesOf(file).map(line => (parseRecord(line) as JournalRecord).seq), [1, 2, 3, 4])
  assert.deepEqual((await readJournal(file, idsFold)).state, ['a', 'b', 'c', 'd'])
})

test('a half line left by a crash is ignored by readers, sealed by the next writer, and stays a bad line', async () => {
  const file = join(scratch(), 'j.jsonl')
  writeFileSync(file, `${recordAt(1)}\n${recordAt(2).slice(0, 25)}`)
  assert.deepEqual((await readJournal(file, idsFold)).state, ['r1'])
  const result = await appendJournal(file, idsFold, add(tick('c')), OPTIONS)
  assert.equal(result.status, 'ok')
  const text = readFileSync(file, 'utf8')
  assert.ok(text.endsWith('\n'))
  const reading = await readJournal(file, idsFold)
  assert.deepEqual(reading.state, ['r1', 'c'])
  assert.deepEqual(reading.bad, [{ line: 2, reason: 'not JSON' }])
  assert.equal(reading.lastSeq, 2, 'the new record follows the last record that was whole')
  assert.equal(text.split('\n').length, 4, 'the half line has a line of its own, and so has the new record')
})

test('M5\'s lock options: a lock older than 30 seconds is taken over and kept as .stale-, a younger one is waited for for 2 seconds', async () => {
  const dir = scratch()
  const old = join(dir, 'old.jsonl')
  foreignLock(old, { at: START - 31_000 })
  assert.equal((await appendJournal(old, idsFold, add(tick('a')), { ...OPTIONS, lock: clockEnvironment() })).status, 'ok')
  assert.ok(readdirSync(dir).some(name => name.startsWith('old.jsonl.lock.stale-')), 'the old lock is kept')

  const young = join(dir, 'young.jsonl')
  foreignLock(young, { at: START - 1_000 })
  const waiting = clockEnvironment()
  assert.deepEqual(await appendJournal(young, idsFold, add(tick('a')), { ...OPTIONS, lock: waiting }), { status: 'busy', lockLost: false })
  assert.ok(waiting.now() - START >= 2_000 && waiting.now() - START < 2_200, `waited ${waiting.now() - START} ms`)
  assert.ok(!existsSync(young), 'nothing was written')

  // 29 seconds old when the wait starts: it turns 30 seconds old after one more second of waiting, and is taken over then.
  const nearly = join(dir, 'nearly.jsonl')
  foreignLock(nearly, { at: START - 29_000 })
  const crossing = clockEnvironment()
  assert.equal((await appendJournal(nearly, idsFold, add(tick('a')), { ...OPTIONS, lock: crossing })).status, 'ok')
  assert.ok(crossing.now() - START >= 1_000 && crossing.now() - START < 1_200, `taken over after ${crossing.now() - START} ms`)
})

test('M5\'s lock options: a lock written in another boot is taken over only when the boot times differ by more than 120 seconds', async () => {
  const dir = scratch()
  const near = join(dir, 'near.jsonl')
  foreignLock(near, { at: START, boot: BOOT - 60_000 })
  assert.equal((await appendJournal(near, idsFold, add(tick('a')), { ...OPTIONS, lock: clockEnvironment() })).status, 'busy')

  const far = join(dir, 'far.jsonl')
  foreignLock(far, { at: START, boot: BOOT - 121_000 })
  assert.equal((await appendJournal(far, idsFold, add(tick('a')), { ...OPTIONS, lock: clockEnvironment() })).status, 'ok')
  assert.ok(readdirSync(dir).some(name => name.startsWith('far.jsonl.lock.stale-')))
})

test('the lock file names the writer m5:<row>', async () => {
  const file = join(scratch(), 'j.jsonl')
  let holder: unknown
  await appendJournal(file, idsFold, () => {
    holder = (JSON.parse(readFileSync(`${file}.lock`, 'utf8')) as { holder?: string }).holder
    return { records: [] }
  }, { ...OPTIONS, row: 'lessons' })
  assert.equal(holder, 'm5:lessons')
})

test('a lock taken over from this writer before its append makes it give up: busy with lockLost, nothing written, one console warning', async () => {
  const file = join(scratch(), 'j.jsonl')
  await appendJournal(file, idsFold, add(tick('a')), OPTIONS)
  const before = readFileSync(file, 'utf8')
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (text: string) => { warnings.push(text) }
  try {
    const steal = () => {
      writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid, startedAt: 1, at: Date.now(), token: 'the-taker' }))
      return { records: [tick('b')] }
    }
    assert.deepEqual(await appendJournal(file, idsFold, steal, OPTIONS), { status: 'busy', lockLost: true })
    rmSync(`${file}.lock`)
    assert.deepEqual(await appendJournal(file, idsFold, steal, OPTIONS), { status: 'busy', lockLost: true })
  }
  finally {
    console.warn = warn
  }
  assert.equal(readFileSync(file, 'utf8'), before)
  assert.equal(warnings.length, 1, 'the warning is given once per process')
  assert.equal((JSON.parse(readFileSync(`${file}.lock`, 'utf8')) as { token?: string }).token, 'the-taker', 'the taker\'s lock is not removed by the writer that lost it')
})

test('a failing flush is io at the write stage', async () => {
  const file = join(scratch(), 'j.jsonl')
  const result = await appendJournal(file, idsFold, add(tick('a')), { ...OPTIONS, sync: () => Promise.reject(new Error('fsync refused')) })
  assert.deepEqual(result, { status: 'io', stage: 'write', message: 'fsync refused' })
  assert.ok(!existsSync(`${file}.lock`), 'the lock is released')
})

test('a project directory is made ignored before it is created, and made again when it was removed after the first write', async () => {
  const root = scratch()
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  const dir = join(root, '.llm')
  const file = join(dir, 'memory.jsonl')
  const options: AppendOptions = { directory: 'project', row: 'memory' }
  assert.equal((await appendJournal(file, idsFold, add(tick('a')), options)).status, 'ok')
  assert.match(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8'), /^\.llm\/$/m)
  // The person removes .llm/ (or git clean does); the process still believes it is prepared.
  rmSync(dir, { recursive: true })
  assert.equal((await appendJournal(file, idsFold, add(tick('b')), options)).status, 'ok')
  assert.deepEqual((await readJournal(file, idsFold)).state, ['b'])
})

test('when the ignore line cannot be written the directory is not created and the write is io at the directory stage', async () => {
  const root = scratch()
  mkdirSync(join(root, '.git', 'info', 'exclude'), { recursive: true }) // a directory where the file should be
  const file = join(root, '.llm', 'memory.jsonl')
  const result = await appendJournal(file, idsFold, add(tick('a')), { directory: 'project', row: 'memory' })
  assert.equal(result.status, 'io')
  assert.equal(result.status === 'io' && result.stage, 'directory')
  assert.ok(!existsSync(join(root, '.llm')), '.llm/ was not created')
})

type FsPromises = { open: typeof open }
const fsPromises = createRequire(import.meta.url)('node:fs/promises') as FsPromises

/** Make creating a lock file fail with EPERM `times` times (what Windows reports when another process is deleting or has just replaced the name), then behave as before; `restore` puts the real `open` back. */
function failLockCreation(times: number): { readonly restore: () => void, readonly failed: () => number } {
  const real = fsPromises.open
  let failed = 0
  fsPromises.open = ((path: Parameters<typeof open>[0], flags?: Parameters<typeof open>[1], mode?: Parameters<typeof open>[2]) => {
    if (typeof path === 'string' && path.endsWith('.lock') && flags === 'wx' && failed < times) {
      failed += 1
      return Promise.reject(Object.assign(new Error(`EPERM: operation not permitted, open '${path}'`), { code: 'EPERM' }))
    }
    return real(path, flags, mode)
  })
  syncBuiltinESMExports()
  return { restore: () => { fsPromises.open = real; syncBuiltinESMExports() }, failed: () => failed }
}

test('creating the lock file failing with EPERM a few times (Windows, another process deleting it) is waited out, not reported as an I/O error', async () => {
  const file = join(scratch(), 'j.jsonl')
  const injected = failLockCreation(3)
  try {
    const result = await appendJournal(file, idsFold, add(tick('a')), OPTIONS)
    assert.equal(result.status, 'ok', JSON.stringify(result))
    assert.equal(injected.failed(), 3, 'the injected failures were hit')
  }
  finally {
    injected.restore()
  }
  assert.equal(linesOf(file).length, 1)
  assert.deepEqual(readdirSync(join(file, '..')).filter(name => name.includes('.lock')), [], 'no lock is left behind')
})

test('an EPERM that lasts the whole wait is io at the lock stage, with the system message', async () => {
  const file = join(scratch(), 'j.jsonl')
  const injected = failLockCreation(Number.POSITIVE_INFINITY)
  try {
    const result = await appendJournal(file, idsFold, add(tick('a')), { ...OPTIONS, lock: clockEnvironment() })
    assert.equal(result.status, 'io')
    assert.equal(result.status === 'io' && result.stage, 'lock')
    assert.match(result.status === 'io' ? result.message : '', /EPERM/)
    assert.ok(injected.failed() > 10, `it tried again meanwhile (${injected.failed()} attempts)`)
  }
  finally {
    injected.restore()
  }
  assert.ok(!existsSync(file), 'nothing was written')
})
test('two processes appending 200 records each to one journal leave seq 1 to 400 without a gap or a repeat', { timeout: 120_000 }, async () => {
  const file = join(scratch(), 'shared', 'j.jsonl')
  const journal = pathToFileURL(resolve(import.meta.dirname, '..', 'src', 'data', 'journal.ts')).href
  const script = `
    const { appendJournal } = await import(${JSON.stringify(journal)})
    const fold = { empty: () => 0, apply: state => ({ state: state + 1 }) }
    const [file, tag] = process.argv.slice(1)
    for (let i = 0; i < 200; i++) {
      for (;;) {
        const result = await appendJournal(file, fold, () => ({ records: [{ actor: 'harness', op: 'tick', id: tag + '-' + i }] }), { directory: 'user', row: 'child' })
        if (result.status === 'ok') break
        if (result.status !== 'busy') { console.error(JSON.stringify(result)); process.exit(2) }
      }
    }`
  await Promise.all(['p', 'q'].map(tag => run(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script, file, tag])))
  const records = linesOf(file).map(line => parseRecord(line) as JournalRecord)
  assert.equal(records.length, 400)
  assert.deepEqual(records.map(record => record.seq), Array.from({ length: 400 }, (_, index) => index + 1))
  for (const tag of ['p', 'q']) assert.deepEqual(records.filter(record => record.id.startsWith(`${tag}-`)).map(record => record.id), Array.from({ length: 200 }, (_, index) => `${tag}-${index}`), 'each process\'s records are all there, in its own order')
  const reading = await readJournal(file, { empty: () => 0, apply: state => ({ state: state + 1 }) })
  assert.deepEqual([reading.state, reading.bad.length, reading.seqAnomalies, reading.lastSeq], [400, 0, 0, 400])
  assert.deepEqual(readdirSync(join(file, '..')).filter(name => name.includes('.lock')), [], 'no lock is left behind')
})
