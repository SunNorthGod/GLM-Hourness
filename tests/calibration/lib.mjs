/**
 * Shared parts of the calibration acceptance checkers (docs/ORCHESTRATION.md
 * §10.5). The runner (scripts/calibrate/run-calibrate.mjs) starts a task's
 * checker as its own process after the model has finished:
 *
 *   node check.mjs --workspace <run copy> --fixture <pristine fixture> --scratch <empty dir> --home <the run's row-data home>
 *
 * The checker imports and runs workspace code in its own process (the runner
 * bounds the process time), prints one JSON object { pass, checks } (an
 * interview task adds `metrics`) and exits 0 when every check holds, 1
 * otherwise.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspect, isDeepStrictEqual, parseArgs } from 'node:util'

/** The three directories every checker receives, plus the run's row-data home when the runner passed one (`--home`, where the rows keep the journals the batch's data redirect moved out of the workspace). */
export function checkerArgs() {
  const { values } = parseArgs({ options: { workspace: { type: 'string' }, fixture: { type: 'string' }, scratch: { type: 'string' }, home: { type: 'string' } } })
  if (values.workspace === undefined || values.fixture === undefined || values.scratch === undefined) {
    throw new Error('usage: check.mjs --workspace <dir> --fixture <dir> --scratch <dir> [--home <dir>]')
  }
  return values
}

/** Import one module of a workspace; the namespace, or the error message. */
export function importFrom(dir, file) {
  return import(pathToFileURL(join(dir, file)).href).then(
    namespace => ({ namespace }),
    error => ({ namespace: {}, error: error instanceof Error ? error.message : String(error) }),
  )
}

/** Run `node --test` in `dir`: whether every test passed, and the runner's summary counts. */
export function runTests(dir) {
  const result = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  const summary = (result.stdout ?? '').split('\n').filter(line => /^# (tests|pass|fail) /.test(line)).join(', ')
  return { ok: result.status === 0, detail: result.error?.message ?? (summary || `exit ${result.status}`) }
}

const isGitPath = path => path.split(/[\\/]/).includes('.git')
const isTestFile = path => /[.\-_]test\.[cm]?js$/.test(basename(path)) || path.split(/[\\/]/).slice(0, -1).some(part => part === 'test' || part === 'tests')

/** The source of every JavaScript test file in `dir` (the files `node --test` picks by default), joined. */
export function testSources(dir) {
  return readdirSync(dir, { recursive: true })
    .filter(path => /\.[cm]?js$/.test(path) && !isGitPath(path) && !path.split(/[\\/]/).includes('node_modules') && isTestFile(path))
    .map(path => readFileSync(join(dir, path), 'utf8'))
    .join('\n')
}

/** Number of test() and it() calls in the test files of `dir`. */
export const countTests = dir => testSources(dir).match(/\b(?:test|it)\s*\(/g)?.length ?? 0

/** A file of `dir` as text; empty when it does not exist. */
export const textOf = (dir, file) => existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : ''

/** Copy a workspace without its git directory. */
const copyWorkspace = (from, to) => cpSync(from, to, { recursive: true, filter: source => !isGitPath(source.slice(from.length)) })

/** The two checks of a bug fix's test: the workspace has more tests than the fixture, and they fail when the fixture's original src/ is put back (the test reproduces the bug). */
export const reproducingTestChecks = (workspace, fixture, scratch) => [
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
]

/** Compare a value with the expectation; the detail shows what came back. */
export const same = (actual, expected) => ({ ok: isDeepStrictEqual(actual, expected), detail: inspect(actual, { depth: 4 }) })

/** The inputs function `fn` accepts without throwing an instance of `type` (a missing function fails, not passes). */
export function notRejected(fn, inputs, type) {
  if (typeof fn !== 'function') return { ok: false, detail: 'not a function' }
  const accepted = inputs.filter((input) => {
    try {
      fn(input)
    }
    catch (error) {
      return !(error instanceof type)
    }
    return true
  })
  return { ok: accepted.length === 0, detail: accepted.length === 0 ? undefined : `not rejected with ${type.name}: ${inspect(accepted)}` }
}

/** Run named checks in order and print the verdict; a throwing check fails with its message. `extra` is added to the printed object as it is (the numbers of an interview run, which are not checks). */
export async function report(checks, extra = {}) {
  const results = []
  for (const [name, run] of checks) {
    try {
      const { ok, detail } = await run()
      results.push({ name, ok, ...(detail === undefined ? {} : { detail }) })
    }
    catch (error) {
      results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
  }
  const pass = results.every(result => result.ok)
  console.log(JSON.stringify({ pass, checks: results, ...extra }))
  process.exitCode = pass ? 0 : 1
}
