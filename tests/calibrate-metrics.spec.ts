/**
 * The `metrics` section of a calibration run's result.json (metrics design
 * §12 step 8, scripts/calibrate/metrics.mjs): a run's journal — written the
 * way the metrics row writes it, host `headless` — read with the pipeline's
 * reader, computed with its formulas, and the acceptance comparison (§13)
 * against the runner's own counting: steps and tool calls exactly, credits
 * within a cent (the two sides round differently).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
// Plain JavaScript, but allowJs infers its types (no directive needed).
import { compareMetrics, metricsSection } from '../scripts/calibrate/metrics.mjs'
import { nodeMetricsFs, openWriter } from '../src/metrics/writer.ts'

const step = (at: string, n: number, credits: number) => ({
  k: 'llm', by: 'host', at, sid: 's-main',
  body: { turn: 1, step: n, provider: 'glm-zcode', model: 'glm-5.3', input: 100, output: 20, total: 120, ms: 9000, ttft: 1200, fin: 'tool-calls', calls: 1, text: 0, credits, peak: true },
})
const purposeCall = (at: string) => ({
  k: 'llm', by: 'host', at, sid: 's-main',
  body: { provider: 'glm-zcode', model: 'glm-5.3', purpose: 'summarize', input: 10, output: 5, total: 15, ms: 800, ttft: 300, fin: 'stop', calls: 0, text: 5, credits: 0.5, peak: false },
})
const tool = (at: string, call: string) => ({
  k: 'tool', by: 'host', at, sid: 's-main',
  body: { turn: 1, step: 1, call, name: 'Read', cat: 'read', out: 'ok', ms: 12, chars: 51, target: '17f4600d8dce' },
})

async function journal(ws: string, events: readonly { readonly k: string, readonly at: string }[]): Promise<void> {
  const writer = openWriter({ host: 'headless', fs: nodeMetricsFs, now: () => Date.parse(events[0]?.at ?? '2026-11-04T01:00:00.000Z'), randomId: () => 'aaaa1111' })
  for (const event of events) writer.record(ws, event as never)
  await writer.flush()
  await writer.close()
}

test('the section reads a run journal: steps without purpose calls, every tool call, the summed credits, the basis naming the file (§12 step 8)', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'calibrate-metrics-'))
  try {
    await journal(ws, [
      step('2026-11-04T01:00:00.000Z', 1, 2.5),
      tool('2026-11-04T01:00:05.000Z', 'c-1'),
      tool('2026-11-04T01:00:06.000Z', 'c-2'),
      step('2026-11-04T01:01:00.000Z', 2, 0.125),
      purposeCall('2026-11-04T01:01:30.000Z'),
      tool('2026-11-04T01:02:00.000Z', 'c-3'),
    ])
    const section = await metricsSection(ws)
    assert.equal(section.steps, 2)
    assert.equal(section.toolCalls, 3)
    // The session-title call's credits are money the run spent: they count (§13).
    assert.equal(section.credits, 3.125)
    assert.ok(section.basis.startsWith('依据：'), section.basis)
    assert.ok(/events-\d{4}-\d{2}-\d{2}\.jsonl 1–\d+ 行/.test(section.basis), section.basis)
    // The acceptance comparison (§13): the runner's own counting agrees, credits within a cent.
    assert.deepEqual(compareMetrics(section, { steps: 2, toolCalls: 3, credits: 3.13 }), [])
  }
  finally {
    rmSync(ws, { recursive: true, force: true })
  }
})

test('the comparison names each difference: steps, calls, credits beyond a cent; an empty journal says so once (§13)', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'calibrate-metrics-'))
  try {
    const section = await metricsSection(empty)
    assert.equal(section.steps, 0)
    assert.equal(section.toolCalls, 0)
    assert.equal(section.credits, 0)
    assert.ok(section.basis.startsWith('依据：（空）'), section.basis)
    assert.equal(compareMetrics(section, { steps: 12, toolCalls: 30, credits: 1.5 }).length, 1)
    assert.match(compareMetrics(section, { steps: 12, toolCalls: 30, credits: 1.5 })[0] ?? '', /journal has no events/)
  }
  finally {
    rmSync(empty, { recursive: true, force: true })
  }
  const diffs = compareMetrics({ basis: '', steps: 2, toolCalls: 3, credits: 2.625 }, { steps: 3, toolCalls: 5, credits: 4 })
  assert.deepEqual(diffs, ['steps 2 != 3', 'tool calls 3 != 5', 'credits 2.625 != 4'])
  // A rounding-step difference is no difference.
  assert.deepEqual(compareMetrics({ basis: '', steps: 2, toolCalls: 3, credits: 2.625 }, { steps: 2, toolCalls: 3, credits: 2.63 }), [])
})
