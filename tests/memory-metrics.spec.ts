/**
 * The memory row's two counts in the metrics journal (project graph node
 * m5-index-truncation-alarm, ORCHESTRATION §8.3, §10.6): the session index
 * cut at its line or character cap hands one `memory.index-truncated`, an
 * index that fits hands none; a `memory_query` that finds nothing hands one
 * `memory.query-empty`, one that finds something hands none. Every event
 * passes the journal's own validator as handed in, and none carries a
 * memory's text or the words of the query. Without the metrics service
 * nothing is handed and nothing is said; a service that throws leaves the
 * index and the answer as they were.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import type { JournalRecord } from '../src/data/journal.ts'
import { METRICS_KINDS } from '../src/metrics/kinds/index.ts'
import { checkEvent, FORMAT_VERSION } from '../src/metrics/schema.ts'
import { storeRecord, type MemoryEntry } from '../src/memory/model.ts'
import { INDEX_MAX_CHARS, INDEX_MAX_LINES, renderIndex } from '../src/memory/recall.ts'
import { journalFile } from '../src/memory/storage.ts'
import { METRICS_SERVICE, type EmittedEvent, type MetricsWhere, type QueuedEvent } from '../src/shared/metrics.ts'
import { captureWarnings } from './graph-helpers.ts'
import { MAIN, withFixture } from './memory-helpers.ts'
import { withRow, type Row } from './memory-row-host.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const NOW = '2026-11-01T08:00:00.000Z'
const skip = skipIfTempInsideGit()

/** Whether the journal takes the event as handed in: the envelope the writer adds, the body untouched. */
function takes(event: EmittedEvent): void {
  const stored = { s: FORMAT_VERSION, k: event.k, at: NOW, w: '0123abcd', n: 1, h: '000000000000', v: 'spec', by: event.by, body: event.body }
  const check = checkEvent(stored, METRICS_KINDS)
  assert.ok(check.ok, check.ok ? '' : `${event.k}: ${check.field} ${check.reason} ${JSON.stringify(event.body)}`)
}

const userEntry = (index: number, description: string): MemoryEntry => ({
  name: `habit-${String(index).padStart(3, '0')}`,
  scope: 'all',
  type: 'user',
  description,
  body: 'Body.',
  source: [],
  kind: 'preference',
  created: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
  lastReviewed: NOW,
  reviews: 0,
  origin: { actor: 'human' },
  status: 'active',
})

test('renderIndex names the cap that stopped the list, how many were eligible and the characters the listed lines take', () => {
  const byLines = renderIndex(Array.from({ length: 250 }, (_, index) => userEntry(index, `About ${index}`)), NOW)
  assert.ok(byLines !== undefined)
  assert.deepEqual([byLines.cap, byLines.eligible, byLines.listed], ['lines', 250, INDEX_MAX_LINES])
  const byChars = renderIndex(Array.from({ length: 150 }, (_, index) => userEntry(index, 'd'.repeat(200))), NOW)
  assert.ok(byChars !== undefined)
  assert.equal(byChars.cap, 'chars')
  assert.equal(byChars.eligible, 150)
  assert.ok(byChars.listed < 150 && byChars.chars <= INDEX_MAX_CHARS, `${byChars.listed} lines, ${byChars.chars} characters`)
  const fits = renderIndex([userEntry(0, 'Short'), userEntry(1, 'Also short')], NOW)
  assert.ok(fits !== undefined)
  assert.deepEqual([fits.cap, fits.eligible, fits.listed, fits.truncated], [undefined, 2, 2, false])
  assert.equal(fits.chars, '- habit-000 (user) — Short\n- habit-001 (user) — Also short'.length)
})

/** Write `count` user preferences straight into the user-level journal, each description carrying a marker that must not leak. */
function seed(row: Row, count: number): void {
  mkdirSync(row.userDir, { recursive: true })
  const lines = Array.from({ length: count }, (_, index): JournalRecord => ({
    v: 1,
    seq: index + 1,
    at: NOW,
    ...storeRecord({ name: `habit-${String(index).padStart(3, '0')}`, type: 'user', scope: 'all', description: `secret-marker-${index}`, body: 'Body.', source: [], confirmNew: false }, { actor: 'human' }),
  }))
  writeFileSync(journalFile(row.userDir), `${lines.map(line => JSON.stringify(line)).join('\n')}\n`)
}

interface Handed { readonly event: QueuedEvent, readonly where: MetricsWhere }

function metricsOn(row: Row): Handed[] {
  const handed: Handed[] = []
  row.runtime.services.set(METRICS_SERVICE, { emit: (event: QueuedEvent, where: MetricsWhere) => { handed.push({ event, where }) } })
  return handed
}

const memoryEvents = (handed: readonly Handed[]): Handed[] => handed.filter(entry => entry.event.k.startsWith('memory.'))

test('an index cut at the line cap hands one memory.index-truncated with counts only, and again after a compaction', { skip }, async () => {
  await withRow(async (row) => {
    seed(row, 250)
    const handed = metricsOn(row)
    assert.equal((await row.step()).length, 1)
    const [first, ...more] = memoryEvents(handed)
    assert.equal(more.length, 0)
    assert.ok(first !== undefined)
    takes(first.event)
    assert.equal(first.event.by, 'memory')
    assert.deepEqual(first.event.body, { eligible: 250, shown: 200, dropped: 50, chars: (first.event.body as { chars: number }).chars, cap: 'lines', again: false })
    assert.equal(first.where.sessionId, row.runtime.agent.id)
    assert.equal(typeof first.where.dir, 'string')
    assert.ok(!JSON.stringify(first.event).includes('secret-marker') && !JSON.stringify(first.event).includes('habit-'), 'no entry text in the event')
    assert.deepEqual(await row.step(), [], 'the index is in the history')
    assert.equal(memoryEvents(handed).length, 1, 'no index, no event')
    row.runtime.history.length = 0 // a compaction replaced the history
    assert.equal((await row.step()).length, 1)
    const after = memoryEvents(handed)
    assert.equal(after.length, 2)
    assert.equal((after[1]?.event.body as { again: boolean }).again, true)
  })
})

test('an index that fits hands no event', { skip }, async () => {
  await withRow(async (row) => {
    seed(row, 3)
    const handed = metricsOn(row)
    assert.equal((await row.step()).length, 1)
    assert.deepEqual(memoryEvents(handed), [])
  })
})

test('without the metrics service the cut index is given and nothing is said; a service that throws leaves the index as it was', { skip }, async () => {
  await withRow(async (row) => {
    seed(row, 250)
    const { result, warnings } = await captureWarnings(() => row.step())
    assert.equal(result.length, 1)
    assert.deepEqual(warnings, [])
    row.runtime.history.length = 0
    row.runtime.services.set(METRICS_SERVICE, { emit: () => { throw new Error('journal down') } })
    const thrown = await captureWarnings(() => row.step())
    assert.equal(thrown.result.length, 1)
    assert.ok(thrown.result[0]?.content[0].text.includes('Only part of it was loaded'))
    assert.deepEqual(thrown.warnings, [])
  })
})

const PREFERENCE = {
  name: 'lead-with-the-answer',
  type: 'feedback',
  scope: 'all',
  description: 'Start every reply with the answer',
  body: 'Answer first.\n**Why:** the user reads on a phone.',
  relay: 'Start with the answer.',
}

test('a memory_query that finds nothing hands one count-only memory.query-empty; one that finds something hands none', async () => {
  const handed: Array<{ event: EmittedEvent, where: MetricsWhere }> = []
  await withFixture(async (memory) => {
    assert.equal((await memory.call('memory_store', PREFERENCE)).stored, true)
    const found = await memory.call('memory_query', { focus: 'answer' })
    assert.equal((found.matches as unknown[]).length, 1)
    assert.deepEqual(handed, [])
    await memory.call('memory_query', { focus: 'zebra-words-nobody-wrote', type: 'feedback' })
    await memory.call('memory_query', { name: 'no-such-memory' })
    assert.deepEqual(handed.map(({ event }) => event), [
      { k: 'memory.query-empty', by: 'memory', body: { mode: 'focus', type: 'feedback', searched: 1 } },
      { k: 'memory.query-empty', by: 'memory', body: { mode: 'name', searched: 1 } },
    ])
    for (const { event, where } of handed) {
      takes(event)
      assert.deepEqual(where, { sessionId: MAIN.session?.id, dir: 'C:/work/project' })
      assert.ok(!JSON.stringify(event).includes('zebra') && !JSON.stringify(event).includes('no-such-memory'), 'no query words in the event')
    }
  }, { emit: (event, where) => { handed.push({ event, where }) } })
})

test('on the row, a memory_query that finds nothing answers as before when the metrics service throws or is absent', { skip }, async () => {
  await withRow(async (row) => {
    const { result, warnings } = await captureWarnings(() => row.tool('memory_query', { focus: 'nothing' }))
    assert.deepEqual(result.matches, [])
    assert.deepEqual(warnings, [])
    row.runtime.services.set(METRICS_SERVICE, { emit: () => { throw new Error('journal down') } })
    assert.deepEqual((await row.tool('memory_query', { focus: 'nothing' })).matches, [])
  })
})
