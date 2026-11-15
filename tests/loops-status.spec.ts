/**
 * The loop board's two weekly lists (docs/ORCHESTRATION.md §18.4; loop board
 * design 0.6 §3.1, §6.11, acceptance 34): what `staleEntries` and
 * `timeoutEntries` list and leave out. Three layers, each pinned apart: the
 * selectors' table (pure), the run facts read back from the metrics journal
 * (records.ts `runEvents`, metrics F33), and the two members on the row's
 * service with their gate (a project this process does not run is
 * undefined). The words the weekly report sees ride the status hub;
 * tests/weekly.spec.ts holds that side.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { appendEvents } from '../src/metrics/library.ts'
import { runEvents, type EntryRunEvent } from '../src/loops/records.ts'
import { loopsService } from '../src/loops/service.ts'
import { LIST_CAP, staleEntriesOf, staleItems, TIMEOUT_FLOOR, timeoutEntriesOf, timeoutItems, type StaleCandidate } from '../src/loops/status.ts'
import { momentText } from '../src/loops/view.ts'
import { openLoopStore } from '../src/loops/store.ts'
import type { EmittedEvent } from '../src/shared/metrics.ts'
import { NOW, quickIo, seedAgreed, tellEntry } from './loops-helpers.ts'
import { withLoopsRow } from './loops-host.ts'

const DAY = 86_400_000
const A = 'u-0a1b2c3d'
const B = 'u-4e5f6a7b'
const C = 'u-8c9d0e1f'
const D = 'u-1a2b3c4d'
const E = 'u-5e6f7a8b'
const PLUGIN = 'loops.remind-waiting'

const iso = (ms: number): string => new Date(ms).toISOString()
const ago = (days: number): string => iso(NOW - days * DAY)
const person = (id: string, days: number): StaleCandidate => ({ id, title: `条目 ${id}`, addedAt: ago(days) })
const fired = (at: string): EntryRunEvent => ({ kind: 'fired', at })
const done = (at: string, outcome: string): EntryRunEvent => ({ kind: 'done', at, outcome })
const runsOf = (id: string, ...events: EntryRunEvent[]): ReadonlyMap<string, readonly EntryRunEvent[]> => new Map([[id, events]])

// ------------------------------------------------------------------ selectors

test('staleEntriesOf holds acceptance 34: four weeks old with no result in the window lists, a recent result, a plugin source and a young entry do not', () => {
  // 30 days ago added, the window's runs all skipped/suppressed/failed/refused: listed, why no-result.
  const stale = staleEntriesOf({
    entries: [person(A, 30)],
    runs: runsOf(A, fired(ago(20)), done(ago(20), 'skipped'), fired(ago(10)), done(ago(10), 'suppressed'), fired(ago(5)), done(ago(5), 'failed'), done(ago(3), 'refused')),
    nowMs: NOW,
  })
  assert.deepEqual(stale.map(entry => [entry.id, entry.why, entry.runs28d]), [[A, 'no-result', 3]])
  assert.equal(stale[0]?.lastResultAt, undefined, 'no run ever reached a result')
  assert.equal(stale[0]?.title, `条目 ${A}`)
  // 10 days ago one ran: not listed.
  assert.deepEqual(staleEntriesOf({ entries: [person(A, 30)], runs: runsOf(A, done(ago(10), 'ran')), nowMs: NOW }), [])
  // delivered counts as a result too.
  assert.deepEqual(staleEntriesOf({ entries: [person(A, 30)], runs: runsOf(A, done(ago(27), 'delivered')), nowMs: NOW }), [])
  // added 20 days ago: not listed, however empty its window.
  assert.deepEqual(staleEntriesOf({ entries: [person(A, 20)], runs: new Map(), nowMs: NOW }), [])
  // the window boundary itself: a result 28 days ago to the millisecond keeps the entry off.
  assert.deepEqual(staleEntriesOf({ entries: [person(A, 30)], runs: runsOf(A, done(ago(28), 'reported')), nowMs: NOW }), [])
})

test('staleEntriesOf: never-triggered against no-result, the latest result ever is kept, and the age comes from the change record alone', () => {
  // No run in four weeks at all: never-triggered, no lastResultAt.
  const never = staleEntriesOf({ entries: [person(A, 40)], runs: new Map(), nowMs: NOW })
  assert.deepEqual(never.map(entry => [entry.id, entry.why, entry.runs28d]), [[A, 'never-triggered', 0]])
  assert.equal('lastResultAt' in never[0], false)
  // A result 40 days ago (outside the window) with runs since: no-result, and the old result is the lastResultAt.
  const old = staleEntriesOf({ entries: [person(A, 40)], runs: runsOf(A, done(ago(40), 'ran'), fired(ago(3))), nowMs: NOW })
  assert.deepEqual(old.map(entry => [entry.why, entry.runs28d]), [['no-result', 1]])
  assert.equal(old[0]?.lastResultAt, ago(40))
  // An entry the change record never added cannot prove its age: not listed.
  assert.deepEqual(staleEntriesOf({ entries: [{ id: A, title: 'x', addedAt: undefined }], runs: new Map(), nowMs: NOW }), [])
  // A window with only firings (runs that never ended): listed, runs counted.
  const unfinished = staleEntriesOf({ entries: [person(A, 30)], runs: runsOf(A, fired(ago(2))), nowMs: NOW })
  assert.deepEqual(unfinished.map(entry => [entry.why, entry.runs28d]), [['no-result', 1]])
})

test('staleEntriesOf lists at most three, the stalest first: no result ever first, then by the last result, equals by the day added', () => {
  const entries = [person(A, 40), person(B, 32), person(C, 45), person(D, 50), person(E, 40)]
  const runs = new Map<string, readonly EntryRunEvent[]>([
    // A: a result 35 days ago (added 40 days ago). B: a result 10 days ago — inside the window, so not stale at all.
    // C: a result 30 days ago. D and E: no result ever; D is the older add.
    [A, [done(ago(35), 'ran')]],
    [B, [done(ago(10), 'ran')]],
    [C, [done(ago(30), 'ran')]],
    [D, []],
    [E, []],
  ])
  const list = staleEntriesOf({ entries, runs, nowMs: NOW })
  assert.deepEqual(list.map(entry => entry.id), [D, E, A], 'no result ever first (oldest add first), then the older last result')
  assert.equal(list.length, 3, `at most ${LIST_CAP}`)
  // C (the newest last result) is the fourth stale one: cut by the cap.
  assert.ok(!list.some(entry => entry.id === C))
  assert.ok(!list.some(entry => entry.id === B), 'B has a result in the window and is not stale at all')
})

test(`timeoutEntriesOf: ${TIMEOUT_FLOOR} unfinished in seven days lists, person and plugin alike, most timeouts first`, () => {
  const candidates = [
    { id: A, title: '人的' },
    { id: PLUGIN, title: '插件的' },
  ]
  // Three unfinished in the window: listed with the latest instant.
  const three = timeoutEntriesOf({
    entries: candidates,
    runs: runsOf(A, done(ago(6), 'unfinished'), done(ago(5), 'unfinished'), done(ago(1), 'unfinished')),
    nowMs: NOW,
  })
  assert.deepEqual(three, [{ id: A, title: '人的', timeouts7d: 3, lastTimeoutAt: ago(1) }])
  // Two are not enough; an unfinished 8 days back does not count; other outcomes never do.
  assert.deepEqual(timeoutEntriesOf({
    entries: candidates,
    runs: runsOf(A, done(ago(8), 'unfinished'), done(ago(6), 'unfinished'), done(ago(1), 'failed'), fired(ago(1))),
    nowMs: NOW,
  }), [])
  // The window boundary: the seventh day to the millisecond counts.
  assert.equal(timeoutEntriesOf({
    entries: candidates,
    runs: runsOf(A, done(ago(7), 'unfinished'), done(ago(6), 'unfinished'), done(ago(5), 'unfinished')),
    nowMs: NOW,
  }).length, 1)
  // Both kinds are candidates; the most timeouts first, equals by the earliest last timeout.
  const both = timeoutEntriesOf({
    entries: candidates,
    runs: new Map<string, readonly EntryRunEvent[]>([
      [A, [done(ago(6), 'unfinished'), done(ago(5), 'unfinished'), done(ago(1), 'unfinished'), done(ago(1), 'unfinished')]],
      [PLUGIN, [done(ago(4), 'unfinished'), done(ago(3), 'unfinished'), done(ago(2), 'unfinished')]],
    ]),
    nowMs: NOW,
  })
  assert.deepEqual(both.map(entry => [entry.id, entry.timeouts7d]), [[A, 4], [PLUGIN, 3]])
  assert.equal(both.length <= LIST_CAP, true)
})

// ------------------------------------------------------------------ the hub entries

test('staleItems and timeoutItems word the lists into the hub entries: one text line, the entries as detail, a plugin says who fixes it', () => {
  const stale = staleItems([
    { id: A, title: '旧的', addedAt: ago(40), runs28d: 2, why: 'no-result' },
    { id: B, title: '从没跑过的', addedAt: ago(35), runs28d: 0, why: 'never-triggered' },
  ], 'p/.llm/loops', NOW)
  assert.deepEqual(stale.map(item => item.id), ['loops/stale'])
  assert.equal(stale[0]?.owner, 'loops')
  assert.equal(stale[0]?.audience, 'agent')
  assert.equal(stale[0]?.asOf, iso(NOW))
  assert.equal(stale[0]?.source, 'p/.llm/loops')
  assert.deepEqual(stale[0]?.fields, { entries: 2 })
  assert.equal(stale[0]?.text, '4 周没跑出过结果的、你加的循环板条目 2 件')
  assert.deepEqual(stale[0]?.detail, [
    `- 「旧的」：${momentText(ago(40))} 加的，最近 28 天跑过 2 次，都没有结果`,
    `- 「从没跑过的」：${momentText(ago(35))} 加的，最近 28 天一次都没触发过`,
  ])
  // An entry whose result is outside the window names it.
  const withOld = staleItems([{ id: A, title: '旧的', addedAt: ago(40), runs28d: 1, why: 'no-result', lastResultAt: ago(39) }], 's', NOW)
  assert.deepEqual(withOld[0]?.detail, [`- 「旧的」：${momentText(ago(40))} 加的，最近 28 天跑过 1 次，都没有结果；上一次有结果是 ${momentText(ago(39))}`])

  const timeouts = timeoutItems([
    { id: A, title: '人的', timeouts7d: 3, lastTimeoutAt: ago(1) },
    { id: PLUGIN, title: '插件的', timeouts7d: 4, lastTimeoutAt: ago(2) },
  ], 's', NOW)
  assert.deepEqual(timeouts.map(item => item.id), ['loops/timeouts'])
  assert.equal(timeouts[0]?.text, '最近 7 天反复超时的循环板条目 2 件')
  assert.deepEqual(timeouts[0]?.fields, { entries: 2, timeouts: 7 })
  assert.deepEqual(timeouts[0]?.detail, [
    `- 「人的」：最近 7 天没跑完 3 次，最近一次 ${momentText(ago(1))}`,
    `- 「插件的」：最近 7 天没跑完 4 次，最近一次 ${momentText(ago(2))}；请插件的作者修`,
  ])
  // Empty lists make no entry, so the weekly report omits its section.
  assert.deepEqual(staleItems([], 's', NOW), [])
  assert.deepEqual(timeoutItems([], 's', NOW), [])
})

// ------------------------------------------------------------------ run facts

test('runEvents reads the run pairs back from the project journal, in order, and an unreadable journal is empty', async () => {
  const root = mkdtempSync(join(tmpdir(), 'loops-status-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  try {
    const middle = ago(10)
    const events: EmittedEvent[] = [
      { k: 'loop-fired', by: 'loops', at: middle, body: { entry: A, run: 'run-000000000001', source: 'person', trigger: { kind: 'daily' }, events: 1 } },
      { k: 'loop-done', by: 'loops', at: iso(Date.parse(middle) + 500), body: { entry: A, run: 'run-000000000001', outcome: 'ran' } },
      { k: 'loop-done', by: 'loops', at: iso(Date.parse(middle) + 1000), body: { entry: A, run: 'run-000000000002', outcome: 'skipped' } },
      { k: 'loop-holder', by: 'loops', at: middle, body: { state: 'ok' } },
    ]
    const written = await appendEvents(root, events, 'cli', { randomId: () => 'bf0a1b2c', now: () => Date.parse(middle) })
    assert.equal(written.rejected, 0)
    const facts = await runEvents(root, ago(40), NOW)
    assert.deepEqual(facts.get(A), [
      { kind: 'fired', at: middle },
      { kind: 'done', at: iso(Date.parse(middle) + 500), outcome: 'ran' },
      { kind: 'done', at: iso(Date.parse(middle) + 1000), outcome: 'skipped' },
    ], 'only the run pairs, in journal order')
    assert.equal(facts.has('loops'), false, 'start and stop name no entry')
    // A window that starts after the events holds none.
    const later = await runEvents(root, ago(5), NOW)
    assert.equal(later.get(A), undefined)
    // A directory without a journal of its own reads as empty, not as a failure.
    const quiet = mkdtempSync(join(tmpdir(), 'loops-quiet-'))
    assert.deepEqual([...(await runEvents(quiet, ago(40), NOW))], [])
  }
  finally {
    await import('node:fs/promises').then(fs => fs.rm(root, { recursive: true, force: true }))
  }
})

// ------------------------------------------------------------------ the service

test('the service hands the two lists out for a project it runs, computed from the journal and the change record, and undefined for one it does not', async () => {
  await withLoopsRow(async (fixture) => {
    const service = loopsService(fixture.runtime.ctx)
    assert.notEqual(service, undefined)
    // A project this process does not run is undefined, whatever its files hold.
    assert.equal(service?.staleEntries(join(fixture.root, 'elsewhere'), new Date(NOW)), undefined)
    assert.equal(service?.timeoutEntries(join(fixture.root, 'elsewhere'), new Date(NOW)), undefined)

    // A person's entry agreed 30 days ago; its window holds three skipped runs. The row's clock is the fixture's NOW.
    const store = openLoopStore(fixture.root, { io: quickIo() })
    await seedAgreed({ root: fixture.root, store }, tellEntry(A), { at: ago(30) })
    const run = (n: number): string => `run-${String(n).padStart(12, '0')}`
    const events: EmittedEvent[] = []
    for (let index = 0; index < 3; index++) {
      const at = iso(NOW - 2 * DAY + index * 1000)
      events.push({ k: 'loop-fired', by: 'loops', at, body: { entry: A, run: run(index), source: 'person', trigger: { kind: 'daily' }, events: 1 } })
      events.push({ k: 'loop-done', by: 'loops', at: iso(Date.parse(at) + 400), body: { entry: A, run: run(index), outcome: 'skipped' } })
    }
    // A plugin entry (the row's own defaults) with three unfinished in the window.
    for (let index = 0; index < 3; index++) {
      events.push({ k: 'loop-done', by: 'loops', at: iso(NOW - DAY + index * 1000), body: { entry: PLUGIN, run: run(10 + index), outcome: 'unfinished' } })
    }
    const written = await appendEvents(fixture.root, events, 'cli', { randomId: () => 'bf0c3d4e', now: () => NOW - 3 * DAY })
    assert.equal(written.rejected, 0)

    // The board meets the project: /loops settles, writes the view and starts running it.
    await fixture.run('/loops')
    const stale = service?.staleEntries(fixture.root, new Date(NOW))
    assert.deepEqual(stale?.map(entry => [entry.id, entry.why, entry.runs28d]), [[A, 'no-result', 3]])
    const timeouts = service?.timeoutEntries(fixture.root, new Date(NOW))
    assert.deepEqual(timeouts?.map(entry => entry.id), [PLUGIN], 'the person entry has no unfinished run; the plugin entry has three')
  })
})

test('without the session controller the row provides no service, so there is nothing to read the lists from', async () => {
  await withLoopsRow((fixture) => {
    fixture.controller(false)
    assert.equal(loopsService(fixture.runtime.ctx), undefined)
  })
})
