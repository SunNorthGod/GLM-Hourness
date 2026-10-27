/**
 * Acceptance for feature-parse-duration (prompt.md): parseDuration parses
 * the request's examples, round-trips every formatDuration output, rejects
 * the listed invalid inputs with TypeError, formatDuration is unchanged, the
 * workspace suite passes with new parseDuration tests, and the README
 * documents it. Usage: see tests/calibration/lib.mjs.
 */
import { checkerArgs, countTests, importFrom, notRejected, report, runTests, same, testSources, textOf } from '../lib.mjs'

const { workspace, fixture } = checkerArgs()
const { namespace: duration, error } = await importFrom(workspace, 'src/duration.js')

const EXAMPLES = [
  ['1h 30m', 5_400_000],
  ['45s', 45_000],
  ['2h 5s', 7_205_000],
  ['250ms', 250],
  ['0ms', 0],
  ['1h  2m', 3_720_000],
  ['1m 1ms', 60_001],
  ['3s 4ms', 3_004],
]
const ROUND_TRIP = [0, 1, 999, 1_000, 59_999, 60_000, 3_600_005, 3_723_004, 86_400_000, 123_456_789]
// Empty, unknown unit, fraction, negative, no space between segments, wrong
// order, repeated unit, unit without a number, number without a unit, and
// values that are not strings.
const INVALID = ['', '5x', '1.5h', '-5s', '1h2m', '1m 1h', '1h 1h', 'h', '5', 5, null, undefined]
const FORMATTED = [[3_723_004, '1h 2m 3s 4ms'], [3_600_005, '1h 5ms'], [90_000, '1m 30s'], [0, '0ms']]

await report([
  ['src/duration.js loads and exports formatDuration and parseDuration', () => ({ ok: error === undefined && typeof duration.formatDuration === 'function' && typeof duration.parseDuration === 'function', detail: error })],
  ['parses the examples of the request', () => same(EXAMPLES.map(([text]) => duration.parseDuration(text)), EXAMPLES.map(([, ms]) => ms))],
  ['restores every formatDuration output', () => same(ROUND_TRIP.map(ms => duration.parseDuration(duration.formatDuration(ms))), ROUND_TRIP)],
  ['rejects invalid input with TypeError', () => notRejected(duration.parseDuration, INVALID, TypeError)],
  ['formatDuration is unchanged', () => same(FORMATTED.map(([ms]) => duration.formatDuration(ms)), FORMATTED.map(([, text]) => text))],
  ['the workspace test suite passes', () => runTests(workspace)],
  ['tests for parseDuration were added', () => {
    const before = countTests(fixture)
    const after = countTests(workspace)
    return { ok: after > before && testSources(workspace).includes('parseDuration'), detail: `${before} -> ${after} test(s)` }
  }],
  ['the README documents parseDuration', () => ({ ok: textOf(workspace, 'README.md').includes('parseDuration') })],
])
