/**
 * Reading and checking the journal (metrics design §5.4, §7.1) on real
 * files: the window and the basis of `readLog`, dedupe by writer and
 * sequence, the problems of lines that cannot enter, and every finding of
 * `checkLog` — missing lines a `gap` may or may not cover, a broken chain,
 * a writer that never stopped, instants that went backwards, duplicates, a
 * day file the manifest remembers that the disk forgot, a command-line
 * writer that wrote host-only kinds.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { checkLog, readLog, type ChainBreak, type ClockRollback, type Forgery, type LogFindings, type MissingRange, type ReadProblemReason, type WriterNoStop } from '../src/metrics/read.ts'

const DAY = '2026-11-04'

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'metrics-read-'))
}

/** One valid line, chained onto `prevH`; the body fields are checked against the table. */
function line(w: string, n: number, prevH: string, body: Record<string, unknown>, at = '2026-11-04T12:00:00.000Z'): string {
  const { k, ...fields } = body
  const core = JSON.stringify({ s: 1, k, at, w, n, v: '0.3.0+abc1234', by: 'host', body: fields })
  const h = createHash('sha256').update(`${prevH}${core}`, 'utf8').digest('hex').slice(0, 12)
  return `${core.slice(0, -1)},"h":"${h}"}`
}

const TALLY = (n: number): Record<string, unknown> => ({ k: 'count', what: `w${n}`, value: n })

/** A writer of three clean lines; returns the lines and its final digest. */
function writer(w: string): { readonly lines: string[], readonly h: string } {
  const a = line(w, 1, '', { k: 'start', host: 'headless', pid: 1, node: 'v22' })
  const b = line(w, 2, hOf(a), TALLY(1))
  const c = line(w, 3, hOf(b), TALLY(2))
  return { lines: [a, b, c], h: hOf(c) }
}

/** The digest of an already-built line: the `h` member at its end. */
function hOf(lineText: string): string {
  return /"h":"([0-9a-f]{12})"\}$/.exec(lineText)![1]
}

function write(root: string, name: string, lines: readonly string[]): void {
  mkdirSync(join(root, '.llm', 'metrics'), { recursive: true })
  writeFileSync(join(root, '.llm', 'metrics', name), `${lines.join('\n')}\n`)
}

test('readLog takes the window by file date, honors a basis, dedupes by writer and sequence, orders by instant', async () => {
  const root = scratch()
  const otherDay = '2026-11-03'
  try {
    const a = writer('0123abcd')
    write(root, `events-${DAY}.jsonl`, a.lines)
    const b = writer('ffffffff')
    write(root, `events-${otherDay}.jsonl`, b.lines)
    write(root, 'notes.txt', ['not a journal'])
    const window = await readLog(root, { from: DAY, to: '2026-11-05' })
    assert.deepEqual(window.problems, [])
    assert.deepEqual([...window.basis.keys()], [`events-${DAY}.jsonl`])
    assert.equal(window.events.length, 3)
    const whole = await readLog(root)
    assert.equal(whole.events.length, 6)
    assert.deepEqual([...whole.basis.keys()], [`events-${otherDay}.jsonl`, `events-${DAY}.jsonl`])
    const limited = await readLog(root, { basis: new Map([[`events-${DAY}.jsonl`, 2]]) })
    assert.deepEqual([...limited.basis.keys()], [`events-${DAY}.jsonl`])
    assert.deepEqual(limited.basis.get(`events-${DAY}.jsonl`), 2)
    assert.equal(limited.events.length, 2)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('lines that cannot enter are counted with their file and line: not JSON, a NUL byte, an unknown kind, a newer format', async () => {
  const root = scratch()
  const a = writer('0123abcd')
  try {
    write(root, `events-${DAY}.jsonl`, [
      a.lines[0],
      '{broken',
      `${a.lines[1].slice(0, 20)}\u0000`,
      JSON.stringify({ ...JSON.parse(a.lines[2]), k: 'mystery' }).replace(/"h":"[0-9a-f]+"/, '"h":"000000000000"'),
      JSON.stringify({ ...JSON.parse(a.lines[2]), s: 2 }),
      a.lines[2],
    ])
    const reading = await readLog(root)
    assert.deepEqual(reading.problems, [
      { file: `events-${DAY}.jsonl`, line: 2, reason: 'not-json' },
      { file: `events-${DAY}.jsonl`, line: 3, reason: 'nul' },
      { file: `events-${DAY}.jsonl`, line: 4, reason: 'unknown-kind' },
      { file: `events-${DAY}.jsonl`, line: 5, reason: 'newer-version' },
    ])
    const reasons: readonly ReadProblemReason[] = reading.problems.map(problem => problem.reason)
    assert.deepEqual(reasons, ['not-json', 'nul', 'unknown-kind', 'newer-version'])
    assert.equal(reading.events.length, 2)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkLog finds missing lines, and a gap covers the range and hands the chain its digest back', async () => {
  const hole = scratch()
  const covered = scratch()
  try {
    const a = writer('0123abcd')
    write(hole, `events-${DAY}.jsonl`, [a.lines[0], a.lines[2]])
    const found = await checkLog(hole, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    const missing: readonly MissingRange[] = found.missing
    assert.deepEqual(missing, [{ w: '0123abcd', from: 2, to: 2 }])
    assert.deepEqual(found.chainBreaks, [{ w: '0123abcd', n: 3 }], 'without a gap the reader cannot know the dropped line, so the next digest does not recompute')
    // The same writer with a gap line speaking of the hole: no finding, chain resumes from the gap's lastH.
    const gap = line('0123abcd', 4, a.h, { k: 'gap', lost: 1, from: 2, to: 2, lastH: hOf(a.lines[1]) })
    write(covered, `events-${DAY}.jsonl`, [a.lines[0], a.lines[2], gap])
    const clean = await checkLog(covered, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    assert.deepEqual(clean.missing, [])
    assert.deepEqual(clean.chainBreaks, [])
  }
  finally {
    rmSync(hole, { recursive: true, force: true })
    rmSync(covered, { recursive: true, force: true })
  }
})

test('checkLog finds a chain that does not recompute, a writer that never stopped, an instant that went back, and duplicates', async () => {
  const root = scratch()
  try {
    const a = writer('0123abcd')
    const tampered = a.lines[2].replace('"value":2', '"value":999')
    const duplicate = line('ffffffff', 1, '', { k: 'start', host: 'desktop', pid: 2, node: 'v22' })
    const again = line('ffffffff', 1, '', { k: 'start', host: 'desktop', pid: 2, node: 'v22' })
    const rollback = line('ffffffff', 2, hOf(duplicate), { k: 'count', what: 'early', value: 0 }, '2026-11-04T11:00:00.000Z')
    write(root, `events-${DAY}.jsonl`, [
      ...a.lines.slice(0, 2),
      tampered,
      duplicate,
      again,
      rollback,
    ])
    const found: LogFindings = await checkLog(root, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    const breaks: readonly ChainBreak[] = found.chainBreaks
    assert.deepEqual(breaks, [{ w: '0123abcd', n: 3 }], 'the tampered value does not recompute')
    const idle: readonly WriterNoStop[] = found.noStop
    assert.deepEqual(idle.map(entry => entry.w).sort(), ['0123abcd', 'ffffffff'], 'both writers are quiet for over ten minutes and never wrote stop')
    const rollbacks: readonly ClockRollback[] = found.clockRollbacks
    assert.deepEqual(rollbacks, [{ w: 'ffffffff', n: 2, at: '2026-11-04T11:00:00.000Z' }])
    assert.equal(found.duplicates, 1)
    assert.equal(found.events, 5, 'the duplicate is counted apart, not as an event')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a fresh writer is not reported as not having stopped', async () => {
  const root = scratch()
  try {
    const a = writer('0123abcd')
    write(root, `events-${DAY}.jsonl`, a.lines)
    const found = await checkLog(root, { now: () => Date.parse('2026-11-04T12:05:00.000Z') })
    assert.deepEqual(found.noStop, [])
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a day file the manifest lists, the disk lacks, and no prune covers is reported as lost', async () => {
  const root = scratch()
  const covered = scratch()
  try {
    const a = writer('0123abcd')
    write(root, `events-${DAY}.jsonl`, a.lines)
    mkdirSync(join(root, '.llm'), { recursive: true })
    writeFileSync(join(root, '.llm', 'metrics-manifest.jsonl'), `${JSON.stringify({ file: `events-${DAY}.jsonl`, w: '0123abcd', firstN: 1, at: '2026-11-04T12:00:00.000Z' })}\n${JSON.stringify({ file: 'events-2026-11-03.jsonl', w: '0123abcd', firstN: 1, at: '2026-11-03T12:00:00.000Z' })}\n`)
    const found = await checkLog(root, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    assert.deepEqual(found.lostFiles, ['events-2026-11-03.jsonl'])
    // A prune covering the older day silences the finding.
    const b = writer('0123abcd')
    const prune = line('0123abcd', 4, b.h, { k: 'prune', before: '2026-11-04', files: 1, lines: 3 })
    write(covered, `events-${DAY}.jsonl`, [...b.lines, prune])
    mkdirSync(join(covered, '.llm'), { recursive: true })
    writeFileSync(join(covered, '.llm', 'metrics-manifest.jsonl'), `${JSON.stringify({ file: 'events-2026-11-03.jsonl', w: '0123abcd', firstN: 1, at: '2026-11-03T12:00:00.000Z' })}\n`)
    const clean = await checkLog(covered, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    assert.deepEqual(clean.lostFiles, [])
  }
  finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(covered, { recursive: true, force: true })
  }
})

test('a writer that started on the command line and wrote a host-only kind is a forgery', async () => {
  const root = scratch()
  try {
    const start = line('0123abcd', 1, '', { k: 'start', host: 'cli', pid: 3, node: 'v22' })
    const said = line('0123abcd', 2, hOf(start), { k: 'tool', turn: 1, step: 1, call: 'c1', name: 'pwsh', cat: 'shell', out: 'ok', ms: 5 })
    const counted = line('0123abcd', 3, hOf(said), TALLY(1))
    write(root, `events-${DAY}.jsonl`, [start, said, counted])
    const found = await checkLog(root, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    const forgeries: readonly Forgery[] = found.forgeries
    assert.deepEqual(forgeries, [{ w: '0123abcd', kind: 'tool' }])
    assert.equal(found.events, 3)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty or missing journal reads as clean and empty', async () => {
  const root = scratch()
  try {
    const found = await checkLog(root, { now: () => Date.parse('2026-11-04T13:00:00.000Z') })
    assert.equal(found.events, 0)
    assert.deepEqual(found.unreadable, [])
    assert.deepEqual(found.lostFiles, [])
    assert.equal(found.bytes, 0)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
