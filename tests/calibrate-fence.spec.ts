/**
 * The read fence of a calibration run (scripts/calibrate/fence.mjs, risk
 * `risk-calib-read`): which paths a call names, and which of them the model
 * under test may not use. The repository, the temporary root and the other
 * calibration directories are fenced; the run's own workspace is not, and
 * file contents are not read for paths.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error The script is plain JavaScript without a declaration file.
import { fenceOf, fencedPathOf, pathsOf } from '../scripts/calibrate/fence.mjs'

interface Places { readonly workspace: string, readonly fenced: readonly string[], readonly tmp: string, readonly env?: Record<string, string> }
const paths = pathsOf as (args: unknown, places: Places) => string[]
const why = fenceOf as (path: string, places: Places) => string | undefined
const hit = fencedPathOf as (args: unknown, places: Places) => { path: string, why: string } | undefined

const TMP = process.platform === 'win32' ? 'C:\\Temp\\calib' : '/tmp/calib'
const REPO = process.platform === 'win32' ? 'C:\\Work\\GLM-Hourness' : '/work/GLM-Hourness'
const WS = join(TMP, 'glm-hourness-calib-run-abc', 'ws')
const places: Places = { workspace: WS, fenced: [REPO], tmp: TMP, env: { TEMP: TMP, HOME_X: REPO } }
const CHECKER = join(REPO, 'tests', 'calibration', 'bugfix-csv-quotes', 'check.mjs')

test('files of the workspace pass, relative or absolute', () => {
  assert.equal(hit({ file_path: join(WS, 'src', 'csv.js') }, places), undefined)
  assert.equal(hit({ file_path: 'src/csv.js' }, places), undefined)
  assert.equal(hit({ command: 'node --test', cwd: WS }, places), undefined)
  assert.equal(hit({ command: 'git status; npm test 2>&1' }, places), undefined)
})

test('the checker of the task is fenced by an absolute path, in a file tool and in the shell', () => {
  assert.equal(hit({ file_path: CHECKER }, places)?.why, 'fenced')
  assert.equal(hit({ command: `Get-Content "${CHECKER}"` }, places)?.why, 'fenced')
  assert.equal(hit({ pattern: '*.mjs', path: REPO }, places)?.why, 'fenced')
})

test('walking out of the workspace with .. is fenced when it reaches the temporary root or another run', () => {
  assert.equal(hit({ command: 'Get-ChildItem ..\\..' }, places)?.why, 'temporary-root')
  assert.equal(hit({ command: 'ls ../../glm-hourness-calib-run-other/ws' }, places)?.why, 'calibration')
  assert.equal(hit({ file_path: '../../glm-hourness-calib-batch-x/results.json' }, places)?.why, 'calibration')
})

test('environment references are expanded before the judgment', () => {
  assert.equal(hit({ command: 'Get-ChildItem $env:TEMP' }, places)?.why, 'temporary-root')
  assert.equal(hit({ command: 'dir %TEMP%' }, places)?.why, 'temporary-root')
  assert.equal(hit({ command: 'ls ${HOME_X}/tests' }, places)?.why, 'fenced')
  assert.equal(hit({ command: '[IO.Path]::GetTempPath()' }, places)?.why, 'temporary-root')
})

test('an ancestor of a fenced root and a drive root are fenced; a directory beside the temporary root is not', () => {
  assert.equal(why(join(REPO, '..'), places), 'fenced')
  // The drive root is an ancestor of the repository and of the temporary root: denied, whichever reason comes first.
  assert.notEqual(why(process.platform === 'win32' ? 'C:\\' : '/', places), undefined)
  // A drive root that holds nothing fenced is still denied.
  assert.equal(why(process.platform === 'win32' ? 'D:\\' : '/', { ...places, fenced: [] }), 'temporary-root')
  assert.equal(why(join(TMP, 'unrelated', 'file.txt'), places), undefined)
})

test('file contents are not read for paths', () => {
  assert.deepEqual(paths({ file_path: 'README.md', content: `see ${CHECKER}`, old_string: '../../x', new_string: REPO }, places), [join(WS, 'README.md')])
  assert.equal(hit({ file_path: 'test/x.test.js', content: `import '${CHECKER}'` }, places), undefined)
})

test('a lone slash in a script is not a path', () => {
  assert.equal(hit({ command: 'node -e "console.log(4 / 2)"' }, places), undefined)
})
