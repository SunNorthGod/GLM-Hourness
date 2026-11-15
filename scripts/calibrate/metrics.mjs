/**
 * The `metrics` section of a calibration run's result.json (metrics design
 * §12 step 8). The run's workspace is a fresh git repository, so the
 * metrics row's journal under `<workspace>/.llm/metrics/` holds exactly
 * this run's events; it is read with the pipeline's reader (readLog,
 * checkLog) and computed with the pipeline's formulas (runTotals in
 * src/metrics/calc.ts — the same filters the score table renders), never a
 * second copy of them. The section carries the basis line naming its
 * inputs (F8) and the three totals the acceptance checks against the
 * runner's own scoring (§13): steps, tool calls, credits.
 *
 * compareMetrics names the differences. The runner warns on stderr and
 * goes on: a mismatch is a finding about the pipeline (a killed run loses
 * its tail, a retried request is one more `llm` than the harness's steps),
 * not the model's result.
 */
import { runTotals } from '../../src/metrics/calc.ts'
import { checkLog, readLog } from '../../src/metrics/read.ts'

/** The zone the report lines render their day names in (the command line's default). */
const TZ = '+08:00'

/**
 * The section over the run's workspace journal. An empty journal — the row
 * absent, or a run that never reached the model — still yields a section,
 * with the basis naming no files and all three totals zero: result.json
 * then documents the pipeline's absence instead of hiding it.
 */
export async function metricsSection(ws) {
  const { events, basis } = await readLog(ws)
  const from = events[0]?.at ?? '1970-01-01T00:00:00.000Z'
  const to = new Date(Date.parse(events.at(-1)?.at ?? from) + 1).toISOString()
  const findings = await checkLog(ws, { from, to })
  return runTotals({ events, basis, from, to, tz: TZ, findings })
}

/**
 * The acceptance differences (§13): steps and tool calls compare exactly;
 * credits within a cent, since the two sides round differently (the
 * journal sums four-decimal per-call credits, the runner rounds the raw
 * sum to two). Empty when they agree.
 */
export function compareMetrics(section, own) {
  if (section.steps === 0 && section.toolCalls === 0 && section.credits === 0) {
    return [`journal has no events (runner counted steps ${own.steps}, calls ${own.toolCalls}, credits ${own.credits})`]
  }
  const diffs = []
  if (section.steps !== own.steps) diffs.push(`steps ${section.steps} != ${own.steps}`)
  if (section.toolCalls !== own.toolCalls) diffs.push(`tool calls ${section.toolCalls} != ${own.toolCalls}`)
  if (Math.abs(section.credits - own.credits) > 0.01) diffs.push(`credits ${section.credits} != ${own.credits}`)
  return diffs
}
