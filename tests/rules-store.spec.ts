/**
 * The rules board's storage (docs/ORCHESTRATION.md §16; design §7.4, §7.5,
 * §15 R2 for the peak level): the journal and the snapshot in the project's
 * `.llm/rules/`, the rules file in the repository, and what a read does when
 * the files disagree. Real files in temporary directories: the failures it
 * checks are what a blue screen or a git switch leaves behind, so a fake
 * file system would hide them. The file also serves as the writer process of
 * the concurrency test (`--writer`).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { acquireLock, LOCK_WAIT_MS, STALE_LOCK_MS } from '../src/data/lock.ts'
import { openRulesBoard, type RulesBoard } from '../src/rules/engine.ts'
import { effectivePeakMode, emptyState, repoJson, type JournalRecord, type PeakLevel, type PeakModeSetting, type ProjectState } from '../src/rules/model.ts'
import { gitOperationIn, readProject, settleProject } from '../src/rules/repo.ts'
import { applyRecord, loadState, rulesPaths, stateDigest, textDigest, type RulesPaths, type StoreIo } from '../src/rules/store.ts'
import { impatientLock, projectTest, quickIo } from './rules-helpers.ts'

const WRITER = '--writer'

if (process.argv[2] === WRITER) {
  // The writer of the concurrency test: one board over the project, `count` writes, a retry when the lock is busy.
  const [root = '', count = '0', ...levels] = process.argv.slice(3)
  const board = openRulesBoard({ projectRoot: root })
  let changed = 0
  for (let index = 0; index < Number(count); index++) {
    for (;;) {
      const result = await board.apply('human', { op: 'peak-mode-set', level: levels[index % levels.length] })
      if (result.ok) {
        if (result.changed) changed++
        break
      }
      if (result.error.code !== 'busy') throw new Error(JSON.stringify(result.error))
    }
  }
  console.log(JSON.stringify({ changed }))
  process.exit(0)
}

const CHOSEN: PeakModeSetting = { level: 'stop', at: '2026-10-30T01:00:00.000Z', origin: { actor: 'human' } }

async function set(board: RulesBoard, level: PeakLevel): Promise<{ readonly changed: boolean, readonly file: string }> {
  const result = await board.apply('human', { op: 'peak-mode-set', level })
  assert.ok(result.ok, JSON.stringify(result))
  return { changed: result.changed, file: result.file }
}

async function lines(paths: RulesPaths): Promise<JournalRecord[]> {
  return (await readFile(paths.journal, 'utf8')).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalRecord)
}

const names = (dir: string): Promise<string[]> => readdir(dir)

/** A line that looks like the board's own record, as a script or an editor could append it. */
function forged(seq: number, snapshot?: string): string {
  return JSON.stringify({ seq, at: '2026-10-30T02:00:00.000Z', actor: 'human', op: 'peak-mode-set', changes: [{ path: ['peakMode'], value: { level: 'inform', at: '2026-10-30T02:00:00.000Z', origin: { actor: 'human' } } }], ...(snapshot === undefined ? {} : { snapshot }) })
}

const settled = async (paths: RulesPaths, io: StoreIo = quickIo()): Promise<void> => {
  const read = await settleProject(paths, io)
  assert.notEqual(read, 'busy')
}

projectTest('a write is in the journal, the snapshot and the repository file, and a read of it is direct', async ({ root, board }) => {
  const { paths } = board
  assert.equal(paths.runtimeDir, join(root, '.llm', 'rules'))
  assert.equal(paths.rulesFile, join(root, 'docs', 'rules', 'rules.json'))
  const result = await board.apply('human', { op: 'peak-mode-set', level: 'stop' })
  assert.ok(result.ok)
  assert.deepEqual([result.changed, result.file], [true, 'written'])
  const load = loadState(paths)
  assert.deepEqual([load.source, load.plan, load.reasons], ['snapshot', undefined, []])
  assert.equal(load.state.seq, 1)
  assert.equal(load.state.peakMode?.level, 'stop')
  assert.deepEqual(effectivePeakMode(load.state), { level: 'stop', origin: 'human', at: load.state.peakMode?.at })
  const [record, ...rest] = await lines(paths)
  assert.equal(rest.length, 0)
  assert.deepEqual([record?.seq, record?.actor, record?.op, record?.target, record?.from, record?.to], [1, 'human', 'peak-mode-set', 'peakMode', 'reduce', 'stop'])
  assert.equal(record?.snapshot, stateDigest(load.state))
  assert.equal(stateDigest(applyRecord({ version: 2, seq: 0, repo: { digest: null } }, record)), record?.snapshot, 'the record alone makes the state')
  const file = await readFile(paths.rulesFile, 'utf8')
  assert.equal(file, repoJson({ version: 2, peakMode: load.state.peakMode }))
  assert.equal(load.state.repo.digest, textDigest(file))
  assert.deepEqual(JSON.parse(await readFile(paths.repoWritten, 'utf8')) as { digest: string }, { digest: textDigest(file), at: (JSON.parse(await readFile(paths.repoWritten, 'utf8')) as { at: string }).at })
  assert.deepEqual((await names(paths.runtimeDir)).sort(), ['journal.jsonl', 'repo-written.json', 'state.json'])
  assert.equal(readProject(paths).repo.kind, 'in-sync')
})

projectTest('a project nobody wrote to is read without creating a file or a directory, and is at the factory level', async ({ root, board }) => {
  const read = readProject(board.paths)
  assert.deepEqual([read.load.source, read.load.fresh, read.repo.kind], ['empty', true, 'in-sync'])
  assert.deepEqual(effectivePeakMode(read.state), { level: 'reduce', origin: 'default' })
  assert.deepEqual(await names(root), ['.git'])
  assert.equal(await settleProject(board.paths, quickIo()).then(result => result === 'busy' ? result : result.load.source), 'empty')
  assert.deepEqual(await names(root), ['.git'], 'settling nothing creates nothing either')
})

projectTest('a repeated choice writes nothing', async ({ board }) => {
  assert.equal((await set(board, 'stop')).changed, true)
  const before = await readFile(board.paths.journal, 'utf8')
  assert.deepEqual(await set(board, 'stop'), { changed: false, file: 'unchanged' })
  assert.equal(await readFile(board.paths.journal, 'utf8'), before)
  assert.equal((await set(board, 'inform')).changed, true)
})

projectTest('a snapshot that was zeroed, cut, garbled or deleted is rebuilt from the journal to the same state, and the rebuild is recorded', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  await set(board, 'inform')
  const damages: ReadonlyArray<readonly [string, () => Promise<void>]> = [
    ['zeroed', () => writeFile(paths.state, '')],
    ['cut', async () => { await writeFile(paths.state, (await readFile(paths.state, 'utf8')).slice(0, 20)) }],
    ['garbled', () => writeFile(paths.state, 'not a snapshot')],
    ['deleted', () => unlink(paths.state)],
  ]
  for (const [name, damage] of damages) {
    const expected = loadState(paths).state
    await damage()
    const load = loadState(paths)
    assert.equal(load.source, 'replay', name)
    assert.equal(load.reasons.at(-1), 'snapshot-corrupt', name)
    assert.equal(stateDigest(load.state), stateDigest(expected), `${name}: the state is the one before the damage`)
    assert.equal(load.plan?.recovered?.skipped.length, 0, name)
    const seq = (await lines(paths)).length
    await settled(paths)
    const after = loadState(paths)
    assert.deepEqual([after.source, after.plan, after.state.recovered?.reason, after.state.seq], ['snapshot', undefined, 'snapshot-corrupt', expected.seq + 1], name)
    assert.equal((await lines(paths)).length, seq + 1, `${name}: one recovered record`)
    assert.equal('unresolved' in after.state, false, `${name}: nothing unresolved, so the collection is absent`)
  }
})

// A line with a digest counts toward the next sequence number (it parses as a record); one without does not.
for (const [name, line, finalSeq] of [['with a made-up digest', forged(50, '0123456789abcdef'), 52], ['without one', forged(51), 3]] as const) {
  projectTest(`a record appended from outside the board, ${name}, does not take effect, is listed, and later records still do`, async ({ board }) => {
    const { paths } = board
    await set(board, 'stop')
    await appendFile(paths.journal, `${line}\n`)
    const load = loadState(paths)
    assert.equal(load.state.peakMode?.level, 'stop')
    assert.equal(load.reasons.at(-1), 'journal-not-engine')
    assert.deepEqual(load.plan?.recovered?.skipped.map(entry => [entry.why, entry.actor, entry.op]), [['digest-mismatch', 'human', 'peak-mode-set']])
    await settled(paths)
    const after = loadState(paths)
    assert.equal(after.state.recovered?.reason, 'journal-not-engine')
    const [entry, ...others] = Object.values(after.state.unresolved ?? {})
    assert.equal(others.length, 0)
    assert.equal(entry?.label, `${after.state.seq}-1`)
    assert.equal(after.state.peakMode?.level, 'stop', 'the forged inform never applied')
    await set(board, 'reduce')
    const expected = loadState(paths).state
    assert.deepEqual([expected.peakMode?.level, expected.seq], ['reduce', finalSeq])
    // The rebuild from the first line reaches the same state: the forged line is skipped again, its entry is not reported twice.
    await unlink(paths.state)
    const rebuilt = loadState(paths)
    assert.equal(stateDigest(rebuilt.state), stateDigest(expected))
    assert.deepEqual(rebuilt.plan?.recovered?.skipped, [])
  })
}

projectTest('an unfinished last line is cut off and kept; a finished line with fields missing is not cut', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  const whole = await readFile(paths.journal, 'utf8')
  await appendFile(paths.journal, '{"seq":2,"at":"2026-10-30T0')
  const load = loadState(paths)
  assert.deepEqual([load.state.peakMode?.level, load.reasons, load.plan?.recovered?.tail], ['stop', ['journal-tail'], '{"seq":2,"at":"2026-10-30T0'])
  await settled(paths)
  assert.equal((await readFile(paths.journal, 'utf8')).startsWith(whole), true)
  const kept = (await names(paths.runtimeDir)).filter(name => name.startsWith('.journal.corrupt-'))
  assert.equal(kept.length, 1)
  assert.equal(await readFile(join(paths.runtimeDir, kept[0]), 'utf8'), '{"seq":2,"at":"2026-10-30T0')
  const after = loadState(paths)
  assert.deepEqual([after.source, after.plan, after.state.recovered?.reason, after.state.seq], ['snapshot', undefined, 'journal-tail', 2])
  // A line that ends with a newline but lacks what every record has is a record nobody wrote: it is skipped, not cut.
  await appendFile(paths.journal, '{"seq":9}\n')
  const finished = loadState(paths)
  assert.equal(finished.plan?.recovered?.tail, '')
  assert.equal(finished.reasons.at(-1), 'journal-not-engine')
})

projectTest('a snapshot that does not match its record is replaced, and the old one is kept', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  const original = await readFile(paths.state, 'utf8')
  const edited = (JSON.parse(original) as { peakMode: { level: string } })
  edited.peakMode.level = 'inform'
  await writeFile(paths.state, JSON.stringify(edited))
  const load = loadState(paths)
  assert.deepEqual([load.state.peakMode?.level, load.reasons.at(-1), load.plan?.recovered?.replaceSnapshot], ['stop', 'snapshot-modified', true])
  await settled(paths)
  const after = loadState(paths)
  assert.equal(after.state.recovered?.reason, 'snapshot-modified')
  const copy = after.state.recovered?.replaced
  assert.ok(copy !== undefined && copy.startsWith(join(paths.runtimeDir, '.state.json.replaced-')))
  assert.equal(await readFile(copy, 'utf8'), JSON.stringify(edited))
})

projectTest('a journal shorter than its snapshot is rebuilt as far as it goes, and the longer snapshot is kept', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  await set(board, 'inform')
  await set(board, 'reduce')
  const [first] = (await readFile(paths.journal, 'utf8')).split('\n')
  await writeFile(paths.journal, `${first}\n`)
  const load = loadState(paths)
  assert.deepEqual([load.state.peakMode?.level, load.state.seq, load.reasons.at(-1)], ['stop', 1, 'journal-shorter'])
  await settled(paths)
  const after = loadState(paths)
  assert.equal(after.state.recovered?.reason, 'journal-shorter')
  assert.equal((JSON.parse(await readFile(after.state.recovered.replaced!, 'utf8')) as { seq: number }).seq, 3)
})

projectTest('a line nothing can read breaks the chain; records after it do not take effect until an anchor restores the state', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  await set(board, 'inform')
  await set(board, 'reduce')
  const text = (await readFile(paths.journal, 'utf8')).split('\n')
  await writeFile(paths.journal, `${text[0]}\n{"seq":2, this is not json\n${text[2]}\n`)
  await unlink(paths.state)
  const load = loadState(paths)
  assert.equal(load.state.peakMode?.level, 'stop', 'the state as of the line before the break')
  assert.deepEqual(load.plan?.recovered?.skipped.map(entry => [entry.why, entry.seq]), [['unreadable', undefined], ['after-unreadable', 3]])
  assert.deepEqual([load.plan?.recovered?.lost, load.plan?.recovered?.copyJournal, load.reasons.at(-1)], [true, true, 'journal-unreadable'])
  await settled(paths)
  const after = loadState(paths)
  assert.deepEqual(Object.values(after.state.unresolved ?? {}).map(entry => entry.why).sort(), ['after-unreadable', 'unreadable'])
  assert.deepEqual([after.state.recovered?.lost, after.state.peakMode?.level], [true, 'stop'])
  assert.ok((await names(paths.runtimeDir)).some(name => name.startsWith('.journal.corrupt-')), 'the journal is copied whole, not rewritten')
})

projectTest('records behind an unreadable line are covered when a later record holds the whole state', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  await set(board, 'inform')
  await appendFile(paths.journal, `${forged(40, 'fedcba9876543210')}\n`)
  await settled(paths) // a recovered record registers the forged line and holds the whole state
  const anchor = (await lines(paths)).find(record => record.op === 'recovered')?.seq
  assert.equal(anchor, 41, 'it is numbered after the highest sequence number that parses, the forged 40')
  await set(board, 'reduce')
  const expected = loadState(paths).state
  assert.deepEqual([expected.seq, expected.peakMode?.level, expected.recovered?.reason], [42, 'reduce', 'journal-not-engine'])
  const text = (await readFile(paths.journal, 'utf8')).split('\n')
  await writeFile(paths.journal, ['{"first line is broken', ...text.slice(1)].join('\n'))
  await unlink(paths.state)
  const load = loadState(paths)
  assert.equal(stateDigest(load.state), stateDigest(expected), 'the anchor and the record after it give the state back')
  const skipped = load.plan?.recovered?.skipped ?? []
  assert.deepEqual(skipped.map(entry => [entry.why, entry.coveredBy]), [['unreadable', undefined], ['covered-by-anchor', anchor]])
  assert.equal(load.plan?.recovered?.lost, false)
})

projectTest('a snapshot a failed rename left behind is adopted by the next read, without a record', async ({ root }) => {
  const failing = quickIo({
    rename: async (from, to) => {
      if (to.endsWith('state.json')) throw Object.assign(new Error('the file is open'), { code: 'EPERM' })
      await rename(from, to)
    },
  })
  const board = openRulesBoard({ projectRoot: root, io: failing })
  await set(board, 'stop')
  const { paths } = board
  assert.deepEqual((await names(paths.runtimeDir)).sort(), ['.state.json.pending', 'journal.jsonl', 'repo-written.json'])
  const load = loadState(paths)
  assert.deepEqual([load.source, load.reasons, load.plan?.adoptPending, load.state.peakMode?.level], ['pending', [], true, 'stop'])
  await settled(paths, quickIo())
  assert.deepEqual((await names(paths.runtimeDir)).sort(), ['journal.jsonl', 'repo-written.json', 'state.json'])
  assert.equal((await lines(paths)).length, 1, 'adopting a snapshot writes no record')
  assert.equal(loadState(paths).source, 'snapshot')
})

projectTest('a reader between the append and the rename sees the new state, and the catch-up writes no record', async ({ root }) => {
  const paths = rulesPaths(root)
  let seen: ReturnType<typeof loadState> | undefined
  let armed = false
  const board = openRulesBoard({
    projectRoot: root,
    io: quickIo({
      rename: async (from, to) => {
        if (armed && to.endsWith('state.json')) seen = loadState(paths)
        await rename(from, to)
      },
    }),
  })
  await set(board, 'stop')
  armed = true
  await set(board, 'inform')
  assert.deepEqual([seen?.source, seen?.state.peakMode?.level, seen?.reasons, seen?.plan?.rewriteSnapshot, seen?.plan?.recovered], ['replay', 'inform', ['snapshot-behind'], true, undefined])
  assert.equal((await lines(paths)).length, 2)
  await settled(paths)
  assert.equal((await lines(paths)).length, 2)
})

test('applyRecord is a pure function of the state and the record: it reads no clock, and a path outside the state throws', () => {
  const state = { version: 2 as const, seq: 4, repo: { digest: null } }
  const record = { seq: 5, changes: [{ path: ['peakMode'] as const, value: CHOSEN }] }
  const now = Date.now
  Date.now = () => { throw new Error('the clock was read') }
  try {
    const next = applyRecord(state, record)
    assert.deepEqual(next, { ...state, seq: 5, peakMode: CHOSEN })
    assert.equal(applyRecord(next, { seq: 6, changes: [{ path: ['peakMode'] }] }).peakMode, undefined, 'no value deletes the field')
  }
  finally {
    Date.now = now
  }
  assert.equal(state.seq, 4, 'the input is not changed')
  const entry = { key: 'aaaaaaaaaaaa', label: '5-1', afterSeq: 4, why: 'unreadable' as const }
  const listed = applyRecord(state, { seq: 5, changes: [{ path: ['unresolved', entry.key], value: entry }] })
  assert.deepEqual(listed.unresolved, { [entry.key]: entry })
  assert.equal('unresolved' in applyRecord(listed, { seq: 6, changes: [{ path: ['unresolved', entry.key] }] }), false, 'deleting the last entry leaves no empty collection behind')
  assert.throws(() => applyRecord(state, { seq: 5, changes: [{ path: ['rules', 'r-x'], value: {} }] }), /not a path of the state/)
  assert.throws(() => applyRecord(state, { seq: 5, changes: [{ path: ['root'], value: 'C:/x' }] }), /not a path/)
  assert.throws(() => applyRecord(state, { seq: 5, changes: [{ path: ['repo'] }] }), /cannot be deleted/)
  assert.throws(() => applyRecord(state, { seq: 5, changes: [null as never] }), /needs a path/)
})

// The collections the full board adds to the state (rules design §7.2), empty: what a state of the full board has before anyone uses them.
const FULL_BOARD_COLLECTIONS = { rules: {}, proposals: {}, signals: {}, detectors: {}, tickets: {}, scripts: {}, notices: {}, unresolved: {} }

projectTest('a collection that is empty is absent from what is stored, so a state extended with empty collections digests like the slice state and a journal the slice wrote replays under it', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  await set(board, 'inform')
  await set(board, 'reduce')
  assert.deepEqual(Object.keys(JSON.parse(await readFile(paths.state, 'utf8')) as object).sort(), ['peakMode', 'repo', 'seq', 'version'], 'the snapshot has no empty collection')
  assert.deepEqual(Object.keys(JSON.parse(await readFile(paths.rulesFile, 'utf8')) as object).sort(), ['peakMode', 'version'], 'nor has the rules file')
  const records = await lines(paths)
  assert.equal(records.length, 3)
  const extend = (state: ProjectState): ProjectState => ({ ...state, ...FULL_BOARD_COLLECTIONS })
  const slice = loadState(paths).state
  assert.equal(stateDigest(extend(slice)), stateDigest(slice), 'the same digest')
  assert.notEqual(stateDigest({ ...slice, rules: { 'r-1': {} } } as unknown as ProjectState), stateDigest(slice), 'a collection with an entry is part of the digest')
  let extended = extend(emptyState())
  for (const record of records) {
    extended = extend(applyRecord(extended, record))
    assert.equal(stateDigest(extended), record.snapshot, `record ${record.seq} verifies under the extended shape`)
  }
  assert.equal(stateDigest(extended), stateDigest(slice))
})

test('the write lock: a dead holder and an old lock are taken over, a live fresh one is waited for and then reported busy, and a lock taken over is no longer held', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rules-lock-'))
  try {
    const file = join(dir, 'rules.lock')
    const fake = impatientLock()
    const child = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => child.on('exit', resolve))
    await writeFile(file, JSON.stringify({ pid: child.pid, startedAt: fake.now(), at: fake.now(), token: 'dead' }))
    const first = await acquireLock(file, fake)
    assert.notEqual(first, 'busy', 'the holder is gone')
    assert.equal(await (first as Exclude<typeof first, 'busy'>).held(), true)

    const started = fake.now()
    assert.equal(await acquireLock(file, fake), 'busy', 'this very process holds it')
    assert.ok(fake.now() - started >= LOCK_WAIT_MS, 'it waited the whole time first')

    await unlink(file)
    await writeFile(file, JSON.stringify({ pid: process.pid, startedAt: 0, at: fake.now() - STALE_LOCK_MS - 1, token: 'old' }))
    const second = await acquireLock(file, fake)
    assert.notEqual(second, 'busy', 'an old lock is taken over even when its holder lives')
    await unlink(file)
    await writeFile(file, 'garbage')
    const third = await acquireLock(file, fake)
    assert.notEqual(third, 'busy', 'a lock nobody can read is taken over')

    const held = third as Exclude<typeof third, 'busy'>
    await writeFile(file, JSON.stringify({ pid: process.pid, startedAt: 1, at: fake.now(), token: 'someone else' }))
    assert.equal(await held.held(), false, 'a writer that was taken over sees it before it appends')
    await held.release()
    assert.equal((JSON.parse(await readFile(file, 'utf8')) as { token: string }).token, 'someone else', 'and does not delete the lock of the one that took over')
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

projectTest('two processes writing at once leave a journal with every record once, in order, and a snapshot that matches', async ({ root, board }) => {
  const script = fileURLToPath(import.meta.url)
  const run = (levels: readonly string[]): Promise<number> => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', script, WRITER, root, '30', ...levels], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve((JSON.parse(out) as { changed: number }).changed) : reject(new Error(`writer exited ${String(code)}`)))
  })
  const counts = await Promise.all([run(['stop', 'inform']), run(['reduce', 'inform', 'stop'])])
  const records = await lines(board.paths)
  assert.equal(records.length, counts[0] + counts[1])
  assert.deepEqual(records.map(record => record.seq), records.map((_, index) => index + 1))
  const load = loadState(board.paths)
  assert.deepEqual([load.source, load.plan, load.state.seq], ['snapshot', undefined, records.length])
  assert.equal(records.at(-1)?.snapshot, stateDigest(load.state))
  assert.deepEqual(await names(board.paths.runtimeDir).then(files => files.filter(name => name.endsWith('.tmp') || name === 'rules.lock')), [], 'no temporary file or lock is left')
})

// The property test of design §15 R2: a long random life of writes, damage and repair, then three rebuilds that must agree.
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

for (const seed of [11, 23, 37, 41, 59]) {
  let clock = Date.parse('2026-10-30T00:00:00Z') + seed * 1000
  const io = quickIo({ now: () => (clock += 1000) })
  projectTest(`property (seed ${seed}): after random writes and damage, three rebuilds from the journal give one state`, async ({ board }) => {
    const { paths } = board
    const next = random(seed)
    const levels: readonly PeakLevel[] = ['inform', 'reduce', 'stop']
    for (let step = 0; step < 60; step++) {
      const roll = next()
      const where = `seed ${seed}, step ${step}`
      await mkdir(paths.runtimeDir, { recursive: true })
      if (roll < 0.7) await set(board, levels[Math.floor(next() * 3)])
      else if (roll < 0.8) {
        await appendFile(paths.journal, `${next() < 0.5 ? forged(1000 + step, 'aaaaaaaaaaaaaaaa') : forged(1000 + step)}\n`)
        await settled(paths, io)
      }
      else if (roll < 0.9) {
        await appendFile(paths.journal, '{"seq":')
        await settled(paths, io)
      }
      else {
        await (next() < 0.5 ? writeFile(paths.state, '') : unlink(paths.state).catch(() => {}))
        await settled(paths, io)
      }
      const load = loadState(paths)
      assert.equal(load.plan, undefined, `${where}: nothing is left to persist`)
    }
    await set(board, 'stop')
    await set(board, 'reduce')
    const before = loadState(paths).state
    // (a) a zeroed snapshot: the replay gives the state before it, names nothing unresolved that was not, and records itself as a snapshot rebuild
    await writeFile(paths.state, '')
    const first = loadState(paths)
    assert.equal(stateDigest(first.state), stateDigest(before), `seed ${seed}: (a) the rebuilt state is the state before`)
    assert.deepEqual([first.plan?.recovered?.skipped, first.reasons.at(-1)], [[], 'snapshot-corrupt'], `seed ${seed}: (a)`)
    await settled(paths, io)
    const afterA = loadState(paths).state
    assert.deepEqual([afterA.recovered?.reason, afterA.seq, afterA.unresolved], ['snapshot-corrupt', before.seq + 1, before.unresolved], `seed ${seed}: (a) one recovered record that registers nothing`)
    // (b) again
    await writeFile(paths.state, '')
    assert.equal(stateDigest(loadState(paths).state), stateDigest(afterA), `seed ${seed}: (b)`)
    await settled(paths, io)
    const afterB = loadState(paths).state
    assert.equal(afterB.seq, afterA.seq + 1, `seed ${seed}: (b)`)
    // (c) a replay from nothing over the whole journal
    await unlink(paths.state)
    assert.equal(stateDigest(loadState(paths).state), stateDigest(afterB), `seed ${seed}: (c)`)
  }, { io })
}

projectTest('a clone that has the rules file and no state of its own starts from the file, in a base record', async ({ root, board }) => {
  const { paths } = board
  const text = repoJson({ version: 2, peakMode: CHOSEN })
  await mkdir(paths.rulesDir, { recursive: true })
  await writeFile(paths.rulesFile, text)
  const read = readProject(paths)
  assert.equal(read.repo.kind, 'fresh-start')
  assert.deepEqual(effectivePeakMode(read.state), { level: 'stop', origin: 'human', at: CHOSEN.at })
  assert.deepEqual(await names(root).then(files => files.sort()), ['.git', 'docs'], 'the read wrote nothing')
  const result = await board.settle()
  assert.notEqual(result, 'busy')
  const [base, ...rest] = await lines(paths)
  assert.equal(rest.length, 0)
  assert.deepEqual([base?.op, base?.actor, base?.seq, base?.changes], ['base', 'harness', 1, []])
  assert.equal(base?.snapshot, stateDigest(base.state!))
  const after = readProject(paths)
  assert.deepEqual([after.load.source, after.repo.kind, after.state.peakMode?.level, after.state.repo.digest], ['snapshot', 'in-sync', 'stop', textDigest(text)])
  assert.equal(await readFile(paths.rulesFile, 'utf8'), text, 'the file is untouched')
  assert.equal((JSON.parse(await readFile(paths.repoWritten, 'utf8')) as { digest: string }).digest, textDigest(text))
  await unlink(paths.state)
  const rebuilt = loadState(paths)
  assert.equal(stateDigest(rebuilt.state), stateDigest(base.state!), 'a replay restarts from the base record')
})

projectTest('a rules file nobody can read is not a start: the project stays at the factory level and the file is kept when the person chooses', async ({ board }) => {
  const { paths } = board
  await mkdir(paths.rulesDir, { recursive: true })
  await writeFile(paths.rulesFile, '{ "version": 2, "peakMode": ')
  const read = readProject(paths)
  assert.deepEqual([read.repo.kind, effectivePeakMode(read.state).origin], ['unreadable', 'default'])
  assert.equal(await settleProject(paths, quickIo()).then(result => result === 'busy' ? result : result.repo.kind), 'unreadable')
  assert.deepEqual(await names(board.paths.projectRoot).then(files => files.sort()), ['.git', 'docs'], 'settling wrote no state')
  await set(board, 'inform')
  assert.equal((await readFile(paths.rulesFile, 'utf8')).includes('"level": "inform"'), true)
  const kept = (await names(paths.runtimeDir)).filter(name => name.startsWith('.rules.json.outside-'))
  assert.equal(kept.length, 1)
  assert.equal(await readFile(join(paths.runtimeDir, kept[0]), 'utf8'), '{ "version": 2, "peakMode": ')
})

projectTest('a rules file someone else changed does not take effect, is kept aside and recorded, and is the board\'s again when it matches', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  const original = await readFile(paths.rulesFile, 'utf8')
  const changed = repoJson({ version: 2, peakMode: { ...CHOSEN, level: 'inform' } })
  await writeFile(paths.rulesFile, changed)
  const read = readProject(paths)
  assert.equal(effectivePeakMode(read.state).level, 'stop', 'the journal decides')
  assert.deepEqual(read.repo.kind === 'outside' ? read.repo.diff : undefined, [{ path: ['peakMode'], change: 'changed', fields: ['level', 'at'] }])
  await settled(paths)
  const records = await lines(paths)
  assert.deepEqual([records.at(-1)?.op, records.at(-1)?.actor], ['repo-outside', 'harness'])
  const outside = loadState(paths).state.repo.outside
  assert.equal(outside?.digest, textDigest(changed))
  assert.equal(await readFile(outside.copy, 'utf8'), changed)
  assert.equal(readProject(paths).repo.kind, 'outside-known')
  await settled(paths)
  assert.equal((await lines(paths)).length, records.length, 'the same change is recorded once')

  await writeFile(paths.rulesFile, original)
  assert.equal(readProject(paths).repo.kind, 'cleared')
  await settled(paths)
  assert.equal((await lines(paths)).at(-1)?.op, 'repo-outside-cleared')
  assert.deepEqual([loadState(paths).state.repo.outside, readProject(paths).repo.kind], [undefined, 'in-sync'])

  // The person's own choice writes the file again from the state, whatever someone put there.
  await writeFile(paths.rulesFile, changed)
  await set(board, 'reduce')
  assert.equal(await readFile(paths.rulesFile, 'utf8'), repoJson({ version: 2, peakMode: loadState(paths).state.peakMode! }))
  assert.deepEqual([loadState(paths).state.repo.outside, readProject(paths).repo.kind], [undefined, 'in-sync'])
})

projectTest('a rules file that is gone is a change to record, not a file to write back', async ({ board }) => {
  const { paths } = board
  await set(board, 'stop')
  await unlink(paths.rulesFile)
  const read = readProject(paths)
  assert.deepEqual(read.repo.kind === 'outside' ? [read.repo.digest, read.repo.copyFrom, read.repo.diff] : undefined, ['missing', undefined, [{ path: ['rules.json'], change: 'removed' }]])
  await settled(paths)
  assert.equal(loadState(paths).state.repo.outside?.copy, '')
  await assert.rejects(readFile(paths.rulesFile), { code: 'ENOENT' })
})

projectTest('while git merges, the rules file waits and the choice already stands; when git is done, the file is written', async ({ root, board }) => {
  const { paths } = board
  await writeFile(join(root, '.git', 'MERGE_HEAD'), 'abc')
  const result = await board.apply('human', { op: 'peak-mode-set', level: 'stop' })
  assert.ok(result.ok)
  assert.equal(result.file, 'deferred')
  assert.equal(effectivePeakMode(readProject(paths).state).level, 'stop')
  await assert.rejects(readFile(paths.rulesFile), { code: 'ENOENT' })
  assert.equal(readProject(paths).repo.kind, 'owed')
  await settled(paths)
  await assert.rejects(readFile(paths.rulesFile), { code: 'ENOENT' }, 'git is still merging')
  await unlink(join(root, '.git', 'MERGE_HEAD'))
  await settled(paths)
  assert.equal(await readFile(paths.rulesFile, 'utf8'), repoJson({ version: 2, peakMode: loadState(paths).state.peakMode! }))
  assert.equal(readProject(paths).repo.kind, 'in-sync')
  assert.equal((await lines(paths)).length, 1, 'writing the file owed is not a new record')
})

projectTest('every sign of an unfinished git operation holds the rules file back', async ({ root }) => {
  assert.equal(gitOperationIn(root), undefined)
  for (const marker of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'BISECT_LOG', 'index.lock']) {
    await writeFile(join(root, '.git', marker), '')
    assert.equal(gitOperationIn(root), marker)
    await unlink(join(root, '.git', marker))
  }
  for (const marker of ['rebase-merge', 'rebase-apply']) {
    await mkdir(join(root, '.git', marker))
    assert.equal(gitOperationIn(root), marker)
    await rm(join(root, '.git', marker), { recursive: true })
  }
  assert.equal(gitOperationIn(join(root, 'docs')), undefined, 'a folder that is not a project root has no git directory')
})
