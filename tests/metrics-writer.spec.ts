/**
 * The writer (metrics design §5.1) with its filesystem seams injected on
 * top of real temporary directories: the `start` line and the manifest line
 * on a destination's and a day file's first write, the half-line a crash
 * left, sequence and chain in enqueue order, the reject of an event that
 * breaks its table, the queue that drops the earliest line after its head
 * when a write fails long enough, the `gap` that speaks of it once writing
 * recovers, and `close` queueing `stop` with a budget. Reading back goes
 * through src/metrics/read.ts, like production does.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { nodeMetricsFs, openWriter, type MetricsDest, type MetricsFs, type WriterDestStatus } from '../src/metrics/writer.ts'
import type { QueuedEvent } from '../src/shared/metrics.ts'
import { readLog, checkLog } from '../src/metrics/read.ts'

const AT = '2026-11-04T12:00:00.000Z'
const DAY = 'events-2026-11-04.jsonl'
const TICK = (n: number): QueuedEvent => ({ k: 'count', by: 'guard', at: AT, body: { what: `w${n}`, value: n } })

/** The real filesystem, with one write seam failing until released. */
function failingAppend(code: string | undefined): { readonly fs: MetricsFs, readonly release: () => void } {
  let failing = code !== undefined
  const fs: MetricsFs = { ...nodeMetricsFs, appendFile: async (path, data) => {
    if (failing) throw Object.assign(new Error(code), { code })
    return nodeMetricsFs.appendFile(path, data)
  } }
  return { fs, release: () => { failing = false } }
}

/** The journal lines of the one day file a test writes, in write order. */
function journalLines(root: string): string[] {
  return readFileSync(join(root, '.llm', 'metrics', DAY), 'utf8').split('\n').filter(line => line !== '')
}

test('the first destination line is `start`, every event follows with its sequence and chain, and the day file enters the manifest', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  try {
    const dest: MetricsDest = root
    const writer = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse(AT), randomId: () => '0123abcd' })
    writer.record(dest, TICK(1))
    writer.record(root, TICK(2))
    await writer.flush()
    const lines = journalLines(root)
    assert.equal(lines.length, 3)
    assert.match(lines[0], /"k":"start"/)
    assert.match(lines[0], /"host":"headless"/)
    assert.match(lines[1], /"k":"count"/)
    assert.match(lines[1], /"n":2/)
    assert.equal(readFileSync(join(root, '.llm', 'metrics', '.gitignore'), 'utf8'), '*\n')
    const manifest = readFileSync(join(root, '.llm', 'metrics-manifest.jsonl'), 'utf8')
    const manifestEntry = manifest.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { readonly file: string, readonly w: string, readonly firstN: number, readonly at: string })[0]
    assert.deepEqual(manifestEntry, { file: DAY, w: '0123abcd', firstN: 1, at: AT })
    const reading = await readLog(root)
    assert.deepEqual(reading.problems, [])
    assert.equal(reading.events.length, 3)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a second writer on a project that already has the guard file prepares fine: losing the wx race is not an error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  try {
    const dest: MetricsDest = root
    const first = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse(AT), randomId: () => 'aaaa1111' })
    first.record(dest, TICK(1))
    await first.flush()
    await first.close()
    const second = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse(AT), randomId: () => 'bbbb2222' })
    second.record(dest, TICK(2))
    await second.flush()
    await second.close()
    const lines = journalLines(root)
    assert.equal(lines.length, 6, 'start, count and stop per writer')
    assert.ok(lines.some(line => line.includes('"w":"bbbb2222"') && line.includes('"k":"count"')))
    const reading = await readLog(root)
    assert.deepEqual(reading.problems, [])
    const findings = await checkLog(root)
    assert.deepEqual(findings.missing, [])
    assert.equal(findings.chainBreaks.length, 0)
    assert.equal(findings.noStop.length, 0)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a day file that ends mid-line is continued on a fresh line', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  try {
    mkdirSync(join(root, '.llm', 'metrics'), { recursive: true })
    const file = join(root, '.llm', 'metrics', DAY)
    writeFileSync(file, '{"s":1,"k":"cou')
    const writer = openWriter({ host: 'cli', fs: nodeMetricsFs, now: () => Date.parse(AT) })
    writer.record(root, TICK(1))
    await writer.flush()
    const text = readFileSync(file, 'utf8')
    assert.ok(text.startsWith('{"s":1,"k":"cou\n'), 'a newline was written before the first line')
    const lines = text.split('\n').filter(line => line !== '')
    assert.match(lines[1], /"k":"start"/)
    assert.match(lines[2], /"k":"count"/)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an event that breaks its field table is rejected: the caller never writes, a `reject` line does', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  try {
    const writer = openWriter({ host: 'cli', fs: nodeMetricsFs, now: () => Date.parse(AT) })
    writer.record(root, { k: 'no-such-kind', by: 'host', body: {} } as unknown as QueuedEvent)
    writer.record(root, { k: 'said', by: 'host', at: AT, body: { units: 'many', attachments: 0, source: 'user' } } as unknown as QueuedEvent)
    await writer.flush()
    const status: WriterDestStatus | undefined = (writer.status()).get(root)
    assert.equal(status?.rejected, 2)
    assert.equal(status?.written, 3, 'start and the two reject lines were written')
    const rejects = journalLines(root).filter(line => line.includes('"k":"reject"'))
    assert.equal(rejects.length, 2)
    assert.match(rejects[0], /"of":"no-such-kind","field":"k"/)
    assert.match(rejects[1], /"of":"said","field":"units"/)
    const reading = await readLog(root)
    assert.ok(reading.events.every(event => event.k !== 'said'), 'the rejected event itself never entered')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failing write keeps the destination queued and drops the earliest line after its head when the queue fills', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  const { fs } = failingAppend('EACCES')
  try {
    const writer = openWriter({ host: 'cli', fs, now: () => Date.parse(AT), randomId: () => '0123abcd' })
    writer.record(root, TICK(0))
    for (let n = 1; n <= 2010; n++) writer.record(root, TICK(n))
    await writer.flush()
    const status = writer.status().get(root)
    assert.equal(status?.error, 'EACCES')
    assert.equal(status?.queued, 2000, 'the queue holds at most 2000 lines')
    assert.equal(status?.dropped, 12, 'start + head + 2010 events were 2012 lines; the 12 earliest after the head were dropped')
    assert.ok(!existsSync(join(root, '.llm', 'metrics', DAY)), 'nothing was written while the disk failed')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a recovered queue writes in sequence order and closes with a `gap` and a `stop`', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  const clock = { at: Date.parse(AT) }
  const { fs, release } = failingAppend('EACCES')
  try {
    const writer = openWriter({ host: 'cli', fs, now: () => clock.at, randomId: () => '0123abcd' })
    writer.record(root, TICK(0))
    for (let n = 1; n <= 2005; n++) writer.record(root, TICK(n))
    release()
    clock.at += 60_000
    await writer.close()
    const reading = await readLog(root)
    const kinds = reading.events.map(event => event.k)
    assert.equal(kinds[0], 'start')
    assert.equal(kinds[1], 'count', 'the head was kept')
    assert.equal(kinds.filter(kind => kind === 'gap').length, 1)
    assert.equal(kinds[kinds.length - 1], 'gap', 'the gap lands at the queue tail, after the stop that was queued first')
    const gap = reading.events.find(event => event.k === 'gap')
    assert.ok(gap !== undefined)
    const gapBody = gap.body as { readonly lost: number, readonly from: number, readonly to: number }
    assert.equal(gapBody.lost, 8, '2008 lines were enqueued over the run and the close, the queue holds 2000, so 8 were dropped')
    assert.equal(gapBody.from, 2, 'the dropped range starts at the first dropped sequence number')
    assert.equal(gapBody.to, 9)
    const stop = reading.events.find(event => event.k === 'stop')
    const stopBody = stop?.body as { readonly written: number, readonly dropped: number } | undefined
    assert.ok(stopBody !== undefined && stopBody.dropped === 7, 'the stop snapshots the counters when it was built, before the close-time overflow')
    assert.equal(stopBody?.written, 0, 'nothing had been written when the stop line was built')
    const findings = await checkLog(root)
    assert.deepEqual(findings.missing, [], 'the gap covers the dropped range')
    assert.deepEqual(findings.chainBreaks, [], 'the chain resumes from the gap line')
    assert.deepEqual(findings.noStop, [], 'the writer closed cleanly')
    assert.equal(findings.duplicates, 0)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failing prepare (the ignore line) writes nothing and reports through the status', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  try {
    const writer = openWriter({
      host: 'cli', fs: nodeMetricsFs, now: () => Date.parse(AT),
      ensureIgnored: () => Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })),
    })
    writer.record(root, TICK(1))
    await writer.flush()
    assert.equal(writer.status().get(root)?.error, 'EACCES')
    assert.equal(writer.status().get(root)?.queued, 2, 'start and the event stay queued')
    assert.ok(!existsSync(join(root, '.llm')), 'no directory was created')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failing mkdir writes nothing either; the metrics directory stays away until it works', async () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-writer-'))
  const fs: MetricsFs = { ...nodeMetricsFs, mkdir: () => Promise.reject(Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' })) }
  try {
    const writer = openWriter({ host: 'cli', fs, now: () => Date.parse(AT) })
    writer.record(root, TICK(1))
    await writer.flush()
    assert.equal(writer.status().get(root)?.error, 'ENOTDIR')
    assert.ok(!existsSync(join(root, '.llm')))
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a destination that was never written to gets no stop and no entry', async () => {
  const writer = openWriter({ host: 'cli', fs: nodeMetricsFs, now: () => Date.parse(AT) })
  await writer.close()
  assert.deepEqual([...writer.status().keys()], [])
})
