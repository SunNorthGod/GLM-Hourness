/**
 * Acceptance for bugfix-shell-redirect (prompt.md; the guard incident of
 * 2026-10-27 in docs/DEVELOPMENT.md §7, where `=>` inside a quoted command
 * was read as a redirection): the reported command writes no file, the rest
 * of the README's quote convention holds too (a fix for `=>` alone does not
 * pass), the other conventions are unchanged, the workspace suite passes
 * with an added test, and the added tests fail when the fixture's original
 * src/ is put back. Usage: see tests/calibration/lib.mjs.
 */
import { checkerArgs, importFrom, report, reproducingTestChecks, runTests, same } from '../lib.mjs'

const { workspace, fixture, scratch } = checkerArgs()
const { namespace: scan, error } = await importFrom(workspace, 'src/redirect.js')

const REPORTED = ['node -e "const id = x => x; console.log(id(1))"', []]
const QUOTED = [
  ['git commit -m \'a > b\'', []],
  ['git commit -m "fix: a >> b" > log.txt', ['log.txt']],
  ['echo "x > y" 2> err.txt', ['err.txt']],
  ['rg "a > b" src > hits.txt', ['hits.txt']],
  ['echo "a > b', []],
  ['node -e \'console.log(1 > 0)\'', []],
]
const UNCHANGED = [
  ['echo hi > out.txt', ['out.txt']],
  ['echo hi >> log.txt', ['log.txt']],
  ['npm test 2> err.txt', ['err.txt']],
  ['npm test *> all.txt', ['all.txt']],
  ['npm test 2>&1', []],
  ['npm test > out.txt 2>&1', ['out.txt']],
  ['npm test > NUL', []],
  ['npm test > /dev/null', []],
  ['echo hi > "out file.txt"', ['out file.txt']],
  ['echo hi > \'a b.txt\'', ['a b.txt']],
  ['echo hi >out.txt', ['out.txt']],
  ['a > x.txt 2> y.txt', ['x.txt', 'y.txt']],
  ['x=>y', []],
  ['git status', []],
]

await report([
  ['src/redirect.js loads and exports redirectTargets and writesFiles', () => ({ ok: error === undefined && typeof scan.redirectTargets === 'function' && typeof scan.writesFiles === 'function', detail: error })],
  ['the reported command writes no file', () => same(scan.redirectTargets(REPORTED[0]), REPORTED[1])],
  ['other quoted text is data, an unclosed quote included', () => same(QUOTED.map(([command]) => scan.redirectTargets(command)), QUOTED.map(([, targets]) => targets))],
  ['the other README conventions are unchanged', () => same(
    [...UNCHANGED.map(([command]) => scan.redirectTargets(command)), scan.writesFiles('git status'), scan.writesFiles('git status > s.txt')],
    [...UNCHANGED.map(([, targets]) => targets), false, true],
  )],
  ['a command that is not a string throws a TypeError', () => {
    try {
      scan.redirectTargets(42)
    }
    catch (thrown) {
      return { ok: thrown instanceof TypeError, detail: String(thrown) }
    }
    return { ok: false, detail: 'no error' }
  }],
  ['the workspace test suite passes', () => runTests(workspace)],
  ...reproducingTestChecks(workspace, fixture, scratch),
])
