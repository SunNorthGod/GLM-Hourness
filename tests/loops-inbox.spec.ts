/**
 * The project inbox (src/loops/inbox.ts; loop board design 0.6 §6.3, §6.7): what
 * `emit` accepts, what it writes, and what the board decides before an entry
 * runs. The cases of design §1.4 that belong to the inbox: one key runs once in
 * seven days, a fourth arrival of one key inside 24 hours is told, a debounce
 * merges, an hourly limit does not lose an event, an event a run of the entry
 * itself brought in does not trigger it again, two processes appending at once
 * lose no line and tear none, and events left by a stopped host are run after
 * the start.
 *
 * Run with `--writer` the file is the second process of the concurrency case.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { LOOP_EVENT_TABLE } from '../src/loops/events.ts'
import { keyFaultOf, openInbox, payloadFaultOf, quietUntil, SELF_LOOP_MS, type EmitInput, type Inbox, type RunBatch, type RunnableEntry } from '../src/loops/inbox.ts'
import type { DuplicateRecord, LoopRecord } from '../src/loops/records.ts'
import { ensureRuntimeDir, loopsPaths, openLoopStore, type LoopsPaths } from '../src/loops/store.ts'
import { appendLine } from '../src/rules/store.ts'
import type { LoopEntryDefinition } from '../src/loops/model.ts'
import type { LoopEventDeclaration } from '../src/loops/trigger.ts'
import { gitProjectTest, heldTimers, quickIo } from './loops-helpers.ts'

const WRITER = '--writer'

/** One event the execute row would hand over, declared the way design §4.2 writes it. */
const HANDBACK: LoopEventDeclaration = {
  id: 'hourness.handback',
  title: '一件活交回了',
  fields: [
    { name: 'task', type: 'string', title: '任务', filter: 'in' },
    { name: 'attempt', type: 'number', title: '第几次', filter: 'atLeast' },
  ],
  personSelectable: true,
}

const TABLE = new Map([...LOOP_EVENT_TABLE, [HANDBACK.id, HANDBACK]])

if (process.argv[2] === WRITER) {
  // The second process of the concurrency case: `count` events through the real write lock, each with its own key.
  const [root = '', tag = '', count = '0'] = process.argv.slice(3)
  const store = openLoopStore(root)
  const inbox = openInbox({
    paths: store.paths,
    io: { rename: (await import('node:fs/promises')).rename, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), now: () => Date.now() },
    now: () => Date.now(),
    table: () => TABLE,
    entries: () => [],
    running: () => false,
    locked: body => store.locked(body),
    start: () => Promise.resolve(),
    record: () => {},
    report: () => {},
    delay: () => () => {},
  })
  let written = 0
  for (let index = 0; index < Number(count); index++) {
    const result = await inbox.emit({ event: HANDBACK.id, project: root, key: `handback:t-${tag}:${index}`, payload: { task: `t-${tag}`, attempt: index }, from: 'glm-hourness/execute' })
    if (result.ok) written++
    else throw new Error(`${result.code}: ${result.message}`)
  }
  console.log(JSON.stringify({ written }))
  process.exit(0)
}

/** An entry that hears one event and only tells the main agent. */
function hears(id: string, event: string, over: Partial<LoopEntryDefinition> = {}): RunnableEntry {
  return {
    entry: {
      id,
      title: `听 ${event} 的一项`,
      when: { kind: 'event', events: [event] },
      action: { kind: 'tell-main', text: 'Say what happened.', wake: true },
      ...over,
    },
    source: 'plugin',
    plugin: 'dsh-hourness',
    row: 'glm-hourness/execute',
  }
}

interface Harness {
  readonly inbox: Inbox
  readonly records: LoopRecord[]
  readonly batches: RunBatch[]
  readonly told: Array<{ text: string, level: 'info' | 'degraded' }>
  readonly timers: Array<{ ms: number, run: () => void }>
  /** Move the clock and fire every timer whose time has come. */
  readonly advance: (ms: number) => Promise<void>
  readonly now: () => number
  readonly paths: LoopsPaths
}

interface HarnessOptions {
  readonly entries?: () => readonly RunnableEntry[]
  readonly running?: () => boolean
  readonly locked?: <T>(body: () => Promise<T>) => Promise<T | 'busy'>
  readonly start?: (batch: RunBatch) => Promise<void>
  readonly slept?: number[]
}

/** The inbox of a project on a clock the test moves, with the records and the runs it asked for. */
async function harnessOf(root: string, at: number, options: HarnessOptions = {}): Promise<Harness> {
  const paths = loopsPaths(root)
  await ensureRuntimeDir(paths)
  const store = openLoopStore(root, { io: quickIo({ now: () => clock }) })
  let clock = at
  const records: LoopRecord[] = []
  const batches: RunBatch[] = []
  const told: Harness['told'] = []
  const { timers, delay } = heldTimers()
  const inbox = openInbox({
    paths,
    io: { rename: quickIo().rename, sleep: (ms) => { options.slept?.push(ms); clock += ms; return Promise.resolve() }, now: () => clock },
    now: () => clock,
    table: () => TABLE,
    entries: options.entries ?? ((): readonly RunnableEntry[] => []),
    running: options.running ?? ((): boolean => true),
    locked: options.locked ?? (body => store.locked(body)),
    start: options.start ?? ((batch) => { batches.push(batch); return Promise.resolve() }),
    record: (record) => { records.push(record) },
    report: (text, level) => { told.push({ text, level }) },
    delay,
  })
  return {
    inbox,
    records,
    batches,
    told,
    timers,
    now: () => clock,
    paths,
    advance: async (ms) => {
      clock += ms
      for (const timer of timers.splice(0)) timer.run()
      await inbox.beat()
    },
  }
}

const AT = Date.parse('2026-11-02T03:00:00.000Z')

test('the dedupe key says one occurrence: three parts, the first the event name, and the payload only what the event declares', () => {
  assert.equal(keyFaultOf('hourness.handback', 'handback:t-1:c-9'), undefined)
  assert.match(keyFaultOf('hourness.handback', 'handback:t-1') ?? '', /one occurrence/)
  assert.match(keyFaultOf('hourness.handback', 'handback::c-9') ?? '', /one occurrence/)
  assert.match(keyFaultOf('hourness.handback', 'handed:t-1:c-9') ?? '', /must start with handback/)
  assert.match(keyFaultOf('hourness.handback', `handback:t:${'x'.repeat(200)}`) ?? '', /1 to 200/)
  assert.equal(payloadFaultOf(HANDBACK, { task: 't-1', attempt: 2 }), undefined)
  assert.match(payloadFaultOf(HANDBACK, { task: 't-1', depth: 'full' }) ?? '', /no field depth/)
  assert.match(payloadFaultOf(HANDBACK, { attempt: 'two' }) ?? '', /must be number/)
})

test('quiet hours: a message due inside them waits for their end, over midnight too', () => {
  const inside = new Date(2026, 10, 2, 23, 30).getTime()
  const until = quietUntil({ from: '22:00', to: '08:00' }, inside)
  assert.equal(new Date(until ?? 0).getHours(), 8)
  assert.ok((until ?? 0) > inside)
  assert.equal(quietUntil({ from: '22:00', to: '08:00' }, new Date(2026, 10, 2, 9, 0).getTime()), undefined)
  assert.equal(quietUntil(undefined, inside), undefined)
  assert.equal(quietUntil({ from: '22:00', to: '22:00' }, inside), undefined)
})

gitProjectTest('emit refuses an event nobody declares, a gating event, a key that does not name one occurrence and a payload the event does not declare', async ({ root }) => {
  const harness = await harnessOf(root, AT, { entries: () => [hears('e-1', HANDBACK.id)] })
  const bad = async (over: Partial<EmitInput>): Promise<{ code?: string, message?: string }> => {
    const result = await harness.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute', ...over })
    return result.ok ? {} : { code: result.code, message: result.message }
  }
  assert.equal((await bad({ event: 'hourness.nobody' })).code, 'unknown-event')
  assert.match((await bad({ event: 'gate.tool-call' })).message ?? '', /rules board/)
  assert.equal((await bad({ key: 'handback:t-1' })).code, 'invalid')
  assert.equal((await bad({ payload: { nothing: 1 } })).code, 'invalid')
  assert.equal(await readFile(harness.paths.events, 'utf8').catch(() => ''), '', 'nothing refused reaches the inbox')
})

gitProjectTest('emit writes nothing when no entry that could run hears the event, and hands it over when the project runs elsewhere', async ({ root }) => {
  const deaf = await harnessOf(root, AT, { entries: () => [hears('e-1', 'loops.host-restarted')] })
  const unheard = await deaf.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  assert.deepEqual(unheard, { ok: true, duplicate: false, unheard: true })
  assert.equal(await readFile(deaf.paths.events, 'utf8').catch(() => ''), '')
  const away = await harnessOf(root, AT, { entries: () => [hears('e-1', 'loops.host-restarted')], running: () => false })
  const handed = await away.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  assert.equal(handed.ok && 'id' in handed, true, 'whoever holds the lock judges it')
  assert.equal((await readFile(away.paths.events, 'utf8')).trim().split('\n').length, 1)
})

gitProjectTest('a write that cannot be made is retried three times inside ten seconds, and then reported once', async ({ root }) => {
  const slept: number[] = []
  const busy = await harnessOf(root, AT, { entries: () => [hears('e-1', HANDBACK.id)], locked: () => Promise.resolve('busy' as const), slept })
  const result = await busy.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false && result.code, 'busy')
  assert.deepEqual(slept, [1_000, 3_000, 6_000], 'three retries inside ten seconds')
  assert.equal(busy.told.filter(line => line.level === 'degraded').length, 1)
  let attempt = 0
  const once = await harnessOf(root, AT, {
    entries: () => [hears('e-1', HANDBACK.id)],
    locked: async <T>(body: () => Promise<T>): Promise<T | 'busy'> => (attempt++ === 0 ? 'busy' : body()),
  })
  const second = await once.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-2', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  assert.equal(second.ok, true, 'the second attempt wrote it')
})

gitProjectTest('one key runs once in seven days: the next arrival is a loop-duplicate, and a fourth arrival inside 24 hours degrades the row', async ({ root }) => {
  const harness = await harnessOf(root, AT, { entries: () => [hears('e-1', HANDBACK.id)] })
  const emit = (): Promise<unknown> => harness.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  await emit()
  const again = await harness.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  assert.equal(again.ok && 'duplicate' in again && again.duplicate, true)
  const duplicates = harness.records.filter((record): record is DuplicateRecord => record.kind === 'loop-duplicate')
  assert.equal(duplicates.length, 1)
  assert.deepEqual([duplicates[0]?.from, duplicates[0]?.key], ['glm-hourness/execute', 'handback:t-1:c-1'])
  await emit()
  assert.equal(harness.told.filter(line => line.level === 'degraded').length, 0, 'two or three arrivals are a replay, not a fault')
  await emit()
  assert.match(harness.told.find(line => line.level === 'degraded')?.text ?? '', /同一个去重键反复出现/)
  await harness.advance(5_000)
  assert.equal(harness.batches.length, 1, 'the occurrence ran once')
})

gitProjectTest('a debounce merges what arrives while it waits into one run, and the hourly limit keeps the rest for the next hour', async ({ root }) => {
  const entry = hears('e-1', HANDBACK.id, { limits: { debounceSeconds: 5, maxPerHour: 2 } })
  const harness = await harnessOf(root, AT, { entries: () => [entry] })
  const emit = (index: number): Promise<unknown> => harness.inbox.emit({ event: HANDBACK.id, project: root, key: `handback:t-1:c-${index}`, payload: { task: 't-1', attempt: index }, from: 'glm-hourness/execute' })
  await emit(1)
  await emit(2)
  assert.equal(harness.batches.length, 0, 'nothing runs before the debounce is over')
  await harness.advance(5_000)
  assert.equal(harness.batches.length, 1)
  assert.equal(harness.batches[0]?.record.merged.length, 1, 'both events are in the one run')
  await emit(3)
  await harness.advance(5_000)
  assert.equal(harness.batches.length, 2)
  await emit(4)
  await harness.advance(5_000)
  assert.equal(harness.batches.length, 2, 'over the limit, the fourth does not start a run')
  const suppressed = harness.records.filter(record => record.kind === 'loop-done' && record.outcome === 'suppressed')
  assert.equal(suppressed.length, 1)
  assert.equal(suppressed[0]?.kind === 'loop-done' && suppressed[0].reason, 'rate')
  assert.equal(harness.records.filter(record => record.kind === 'loop-fired').length, 1, 'the suppressed run is a pair of records of its own')
  await harness.advance(3_600_000)
  assert.equal(harness.batches.length, 3, 'the hour turned and the event that waited ran')
  assert.deepEqual(harness.batches[2]?.record.payload.attempt, 4, 'the event over the limit was not lost')
})

gitProjectTest('an event brought in by the entry\'s own run does not trigger it again inside the self-loop window', async ({ root }) => {
  const entry = hears('e-1', HANDBACK.id, { limits: { debounceSeconds: 0, maxPerHour: 30 } })
  const harness = await harnessOf(root, AT, { entries: () => [entry] })
  // The runner marks a run of this entry as going on: an event it brings in carries the run as its cause.
  harness.inbox.state().causes['run-aaaaaaaaaaaa'] = { entry: 'e-1', at: new Date(harness.now()).toISOString() }
  const own: EmitInput = { event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute', cause: 'run-aaaaaaaaaaaa' }
  await harness.inbox.emit(own)
  await harness.advance(1_000)
  assert.equal(harness.batches.length, 0)
  const suppressed = harness.records.filter(record => record.kind === 'loop-done')
  assert.equal(suppressed[0]?.kind === 'loop-done' && suppressed[0].reason, 'self-loop')
  await harness.advance(SELF_LOOP_MS)
  await harness.inbox.emit({ ...own, key: 'handback:t-1:c-2' })
  await harness.advance(1_000)
  assert.equal(harness.batches.length, 1, 'after ten minutes the chain is nobody\'s doing')
})

gitProjectTest('two processes handing events over at once leave every line whole, and the board reads each of them once', async ({ root }) => {
  const script = fileURLToPath(import.meta.url)
  const run = (tag: string): Promise<number> => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', script, WRITER, root, tag, '200'], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve((JSON.parse(out) as { written: number }).written) : reject(new Error(`writer exited ${String(code)}`)))
  })
  const written = await Promise.all([run('a'), run('b')])
  assert.deepEqual(written, [200, 200])
  const text = await readFile(loopsPaths(root).events, 'utf8')
  const lines = text.split('\n').filter(line => line !== '')
  assert.equal(lines.length, 400, 'no line is lost')
  const keys = new Set(lines.map(line => (JSON.parse(line) as { key: string }).key))
  assert.equal(keys.size, 400, 'no line is torn: each parses and carries its own key')
  const harness = await harnessOf(root, AT + 60_000, { entries: () => [hears('e-1', HANDBACK.id, { limits: { debounceSeconds: 0, maxPerHour: 1000 } })] })
  await harness.inbox.beat()
  await harness.advance(0)
  assert.equal(harness.batches.length + harness.batches.reduce((all, batch) => all + batch.record.merged.length, 0), 400, 'every event handed over while this process did not run is run once')
  await harness.inbox.beat()
  assert.equal(harness.batches.length + harness.batches.reduce((all, batch) => all + batch.record.merged.length, 0), 400, 'a second reading starts where the first stopped')
})

gitProjectTest('events a stopped host left in the inbox are run after the start, and one left longer than seven days is not run', async ({ root }) => {
  const away = await harnessOf(root, AT, { entries: () => [hears('e-1', HANDBACK.id)], running: () => false })
  await away.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  await away.inbox.emit({ event: HANDBACK.id, project: root, key: 'handback:t-1:c-2', payload: { task: 't-1' }, from: 'glm-hourness/execute' })
  const back = await harnessOf(root, AT + 3 * 60_000, { entries: () => [hears('e-1', HANDBACK.id, { limits: { debounceSeconds: 5, maxPerHour: 30 } })] })
  await back.inbox.beat()
  assert.equal(back.batches.length, 0, 'what the stopped host left still waits out the debounce')
  await back.advance(5_000)
  assert.equal(back.batches.length, 1)
  assert.equal(back.batches[0]?.record.merged.length, 1, 'both of them are in the one run')
  assert.equal(back.batches[0]?.late, true, 'the run says the event waited')
  await back.inbox.beat()
  assert.equal(back.batches.length, 1, 'the position of the reading is remembered, so nothing is read twice')
  const old = new Date(AT - 8 * 24 * 3_600_000).toISOString()
  await appendLine(back.paths.events, { id: 'ev-0000000000000001', at: old, event: HANDBACK.id, key: 'handback:t-9:old', payload: { task: 't-9' }, from: 'glm-hourness/execute' })
  const stale = await harnessOf(root, AT + 4 * 60_000, { entries: () => [hears('e-1', HANDBACK.id)] })
  await stale.advance(5_000)
  assert.equal(stale.batches.length, 0)
  const expired = stale.records.filter(record => record.kind === 'loop-done' && record.outcome === 'expired')
  assert.equal(expired.length, 1, 'an event that waited longer than seven days is not run')
})
