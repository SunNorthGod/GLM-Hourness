/**
 * Acceptance for bugfix-csv-quotes (prompt.md): the reported line and other
 * escaped quotes parse, unrelated behavior is unchanged, the workspace suite
 * passes with an added test, and the added tests fail when the fixture's
 * original src/ is put back (the test reproduces the bug). Usage: see
 * tests/calibration/lib.mjs.
 */
import { join } from 'node:path'
import { checkerArgs, copyWorkspace, countTests, importFrom, report, runTests, same } from '../lib.mjs'

const { workspace, fixture, scratch } = checkerArgs()
const { namespace: csv, error } = await importFrom(workspace, 'src/csv.js')

const REPORTED = ['"x"",y",z', ['x",y', 'z']]
const ESCAPED = [
  ['"a ""b"" c",d', ['a "b" c', 'd']],
  ['""""', ['"']],
  ['"a""",b', ['a"', 'b']],
  ['"",x', ['', 'x']],
]
const UNCHANGED = [
  ['a,b,c', ['a', 'b', 'c']],
  ['a,,b,', ['a', '', 'b', '']],
  ['"a,b",c', ['a,b', 'c']],
  ['a"b,c', ['a"b', 'c']],
]

await report([
  ['src/csv.js loads and exports parseLine and parse', () => ({ ok: error === undefined && typeof csv.parseLine === 'function' && typeof csv.parse === 'function', detail: error })],
  ['the reported line parses as expected', () => same(csv.parseLine(REPORTED[0]), REPORTED[1])],
  ['other escaped quotes parse', () => same(ESCAPED.map(([line]) => csv.parseLine(line)), ESCAPED.map(([, fields]) => fields))],
  ['unrelated behavior is unchanged', () => same(
    [...UNCHANGED.map(([line]) => csv.parseLine(line)), csv.parseLine('a;"b;c"', { delimiter: ';' }), csv.parse('a,b\r\nc,d\n')],
    [...UNCHANGED.map(([, fields]) => fields), ['a', 'b;c'], [['a', 'b'], ['c', 'd']]],
  )],
  ['the workspace test suite passes', () => runTests(workspace)],
  ['a test was added', () => {
    const before = countTests(fixture)
    const after = countTests(workspace)
    return { ok: after > before, detail: `${before} -> ${after} test(s)` }
  }],
  ['the workspace tests fail on the original code', () => {
    const original = join(scratch, 'original-src')
    copyWorkspace(workspace, original)
    copyWorkspace(join(fixture, 'src'), join(original, 'src'))
    const run = runTests(original)
    return { ok: !run.ok, detail: run.detail }
  }],
])
