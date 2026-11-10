/**
 * The repository scripts' self-check before they start (scripts/rules-gate.mjs; M6 design §7.2 item 2 and §1.4 items
 * 15, 16, 17, 22, 24 and 26; docs/ORCHESTRATION.md §11.4). `gateOnRules` ends its process with the exit code of the
 * verdict, so it runs in a child: a driver placed at scripts/calibrate/run-calibrate.mjs of a temporary git project
 * (its command text is then the calibration's) calls it with the test's clock, sleep and reading of the GLM peak and,
 * where a case says so, the test's journal appender, and prints `STARTED <its arguments>` when the gate lets it go on.
 * The rules library is the build output under packages/hourness/dist (as the scripts use it), the same build output
 * with a recorder of its metrics events, or a fake that records each call and answers from a list. The expected
 * refusal is computed in this process by src/rules/check.ts with the same options.
 *
 * Reads the build output: run `npm run build` first.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { classifyRecord, type GuardRecord } from '../src/guard/records.ts'
import { checkCall, type CheckResult } from '../src/rules/check.ts'
import { openRulesBoard } from '../src/rules/engine.ts'
import { repoJson, type RepoRules, type Rule } from '../src/rules/model.ts'
import { prepareProposal } from '../src/rules/proposal.ts'
import type { ScriptResult } from '../src/loops/script.ts'
import { loadState } from '../src/rules/store.ts'
import { nextPeakChange } from '../src/shared/pricing.ts'
import { morningReport } from '../src/workflow/morning-report.ts'
import { OFFPEAK_CREDIT_RUNS } from './rules-fixtures.ts'
import { quickIo } from './rules-helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const GATE_SOURCE = join(REPO, 'scripts', 'rules-gate.mjs')
const BUILT = {
  check: join(REPO, 'packages', 'hourness', 'dist', 'rules', 'check.js'),
  engine: join(REPO, 'packages', 'hourness', 'dist', 'rules', 'engine.js'),
  credits: join(REPO, 'packages', 'glm', 'dist', 'glm-llm', 'credits.js'),
}
for (const path of Object.values(BUILT)) {
  if (!existsSync(path)) throw new Error(`先运行 npm run build：本文件跑编译产物，${path} 不在`)
}
const href = (path: string): string => pathToFileURL(path).href

/** Wednesday 2026-10-28 in UTC+8: 15:00 is in GLM's peak, 19:00 is not; on Saturday 15:00 there is no peak. */
const WED_1500 = '2026-10-28T07:00:00.000Z'
const WED_1900 = '2026-10-28T11:00:00.000Z'
const SAT_1500 = '2026-10-31T07:00:00.000Z'
const WED_175830 = '2026-10-28T09:58:30.000Z'
const PEAK_END = '2026-10-28T10:00:00.000Z'
/** The moment the human set the level or the switch of a fixture (the board's clock). */
const SET_AT = '2026-10-27T01:00:00.000Z'
/** The command text of the driver when no npm script started it. */
const COMMAND = 'node scripts/calibrate/run-calibrate.mjs'

/** `YYYY-MM-DD HH:MM` and `HH:MM` on the wall clock of this machine, by another route than the code takes. */
const localMinute = (iso: string): string => new Date(iso).toLocaleString('sv-SE').slice(0, 16)
const hm = (iso: string): string => localMinute(iso).slice(11)

// ------------------------------------------------------------- the child side

/** The script whose start the gate checks; `GATE_TEST` (JSON) says how. */
const DRIVER = `import { appendFileSync } from 'node:fs'
import { gateOnRules } from ${JSON.stringify(href(GATE_SOURCE))}
const config = JSON.parse(process.env.GATE_TEST)
const log = entry => appendFileSync(config.log, JSON.stringify(entry) + '\\n')
let at = Date.parse(config.start)
let slept = 0
globalThis.gateTestNow = () => at
const { creditPricing } = await import(${JSON.stringify(href(BUILT.credits))})
const peaks = {
  credits: ms => creditPricing.peak(ms),
  throws: () => { throw new Error('no peak clock in this test') },
  text: () => 'yes',
}
await gateOnRules({
  glmSpend: config.glmSpend,
  peakAt: peaks[config.peak],
  now: () => at,
  sleep: async (ms) => {
    log({ sleep: ms })
    at += ms
    slept += 1
    if (slept !== config.freezeOffAfter) return
    const { openRulesBoard } = await import(${JSON.stringify(href(BUILT.engine))})
    const done = await openRulesBoard({ projectRoot: config.projectRoot }).apply('human', { op: 'signal-manual', name: 'code-freeze', value: false })
    if (!done.ok) throw new Error(JSON.stringify(done.error))
  },
  projectRoot: config.projectRoot,
  ...(config.checkModule === undefined ? {} : { checkModule: config.checkModule }),
  ...(config.append === undefined ? {} : {
    appendLine: async (path, line) => {
      log({ append: { path, line } })
      if (config.append === 'throws') throw new Error('disk full in this test')
    },
  }),
})
process.stdout.write('STARTED ' + JSON.stringify(process.argv.slice(2)) + '\\n')
`

/** A rules library that records each call with the driver's clock and answers from a list (the last answer repeats). */
const FAKE = `import { appendFileSync } from 'node:fs'
const config = JSON.parse(process.env.GATE_TEST)
let calls = 0
class RulesCheckError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RulesCheckError'
    this.code = code
  }
}
export async function checkCall(call, options) {
  const answer = config.answers[Math.min(calls, config.answers.length - 1)]
  calls += 1
  appendFileSync(config.log, JSON.stringify({ call: { call, options, at: globalThis.gateTestNow() } }) + '\\n')
  if (answer.throws !== undefined) throw new RulesCheckError(answer.throws, 'the state of the project cannot be read in this test')
  const signals = Object.entries(options.signals ?? {}).map(([name, value]) => ({ name, source: 'caller', value }))
  return { effect: 'allow', exitCode: 0, rules: [], signals, subjects: [], scripts: [], peakMode: 'inform', notes: [], ...answer }
}
`

/** The real checkCall of the build output, its metrics events recorded. */
const RECORDED = `import { appendFileSync } from 'node:fs'
import { checkCall as judge } from ${JSON.stringify(href(BUILT.check))}
const config = JSON.parse(process.env.GATE_TEST)
export const checkCall = (call, options) => judge(call, { ...options, metrics: (event) => { appendFileSync(config.log, JSON.stringify({ event }) + '\\n') } })
`

/** The real checkCall of the build output with the executor replaced by a stand-in that answers from a list (the last answer repeats) and records each run; its metrics events are recorded too. */
const WITH_RUNNER = `import { appendFileSync } from 'node:fs'
import { checkCall as judge } from ${JSON.stringify(href(BUILT.check))}
const config = JSON.parse(process.env.GATE_TEST)
let runs = 0
const runScript = async (request) => {
  const answer = config.runner[Math.min(runs, config.runner.length - 1)]
  runs += 1
  appendFileSync(config.log, JSON.stringify({ run: { entry: request.envelope.entry, purpose: request.purpose, timeoutMs: request.timeoutMs } }) + '\\n')
  return answer
}
export const checkCall = (call, options) => judge(call, { ...options, runScript, metrics: (event) => { appendFileSync(config.log, JSON.stringify({ event }) + '\\n') } })
`

type Spend = 'optional' | 'necessary'
/** A fake verdict: the fields of a CheckResult it answers with over an allow that echoes the signals it was given, or `throws` with the code of a RulesCheckError. */
type Answer = Readonly<Record<string, unknown>>

interface GateRun {
  readonly root: string
  /** The driver's clock at the start. */
  readonly start: string
  readonly glmSpend?: Spend
  /** `peakAt`: creditPricing.peak of the build output, one that throws, or one that answers a string. */
  readonly peak?: 'credits' | 'throws' | 'text'
  readonly args?: readonly string[]
  readonly npmScript?: string
  /** The rules library: the build output (default), the build output with its events recorded, a module without checkCall, a file that is not there, or a fake. */
  readonly check?: 'built' | 'recorded' | 'no-export' | 'missing' | { readonly answers: readonly Answer[] } | { readonly runner: readonly Answer[] }
  /** Inject an appender that records each line, or one that also throws. */
  readonly append?: 'records' | 'throws'
  /** Turn the switch code-freeze off as the human after this many sleeps. */
  readonly freezeOffAfter?: number
}

interface Call {
  readonly call: { readonly tool: string, readonly args: { readonly command: string } }
  readonly options: Readonly<Record<string, unknown>>
  /** The driver's clock when the board was asked. */
  readonly at: number
}

interface Appended {
  readonly path: string
  readonly line: string
}

interface LogEntry {
  readonly call?: Call
  readonly sleep?: number
  readonly append?: Appended
  readonly event?: { readonly event: string, readonly exitCode: number, readonly waitedMs?: number }
  readonly run?: { readonly entry: string, readonly purpose: string, readonly timeoutMs?: number }
}

interface Ran {
  readonly status: number | null
  readonly stderr: string
  /** The arguments the script saw after the gate; absent when it did not start. */
  readonly started?: readonly string[]
  readonly calls: readonly Call[]
  readonly sleeps: readonly number[]
  readonly appends: readonly Appended[]
  readonly events: ReadonlyArray<NonNullable<LogEntry['event']>>
  /** The scripts the stand-in executor was asked to run. */
  readonly runs: ReadonlyArray<NonNullable<LogEntry['run']>>
}

/** Put the driver where the calibration runner sits. */
async function placeDriver(root: string): Promise<void> {
  await mkdir(join(root, 'scripts', 'calibrate'), { recursive: true })
  await writeFile(join(root, 'scripts', 'calibrate', 'run-calibrate.mjs'), DRIVER)
}

/** Run the driver once in a child with no npm variables of this process. */
async function runGate(run: GateRun): Promise<Ran> {
  const scratch = await mkdtemp(join(tmpdir(), 'script-gate-run-'))
  try {
    const log = join(scratch, 'log.jsonl')
    await writeFile(log, '')
    const check = run.check ?? 'built'
    let checkModule: string | undefined
    if (check === 'missing') checkModule = join(scratch, 'no-such-check.js')
    else if (check !== 'built') {
      checkModule = join(scratch, 'check.mjs')
      await writeFile(checkModule, check === 'recorded' ? RECORDED : check === 'no-export' ? 'export const judge = 1\n' : 'runner' in check ? WITH_RUNNER : FAKE)
    }
    const config = {
      log,
      start: run.start,
      glmSpend: run.glmSpend ?? 'optional',
      peak: run.peak ?? 'credits',
      projectRoot: run.root,
      ...(checkModule === undefined ? {} : { checkModule }),
      ...(typeof check === 'object' && 'answers' in check ? { answers: check.answers } : {}),
      ...(typeof check === 'object' && 'runner' in check ? { runner: check.runner } : {}),
      ...(run.append === undefined ? {} : { append: run.append }),
      ...(run.freezeOffAfter === undefined ? {} : { freezeOffAfter: run.freezeOffAfter }),
    }
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toLowerCase().startsWith('npm_')))
    const env = { ...inherited, GATE_TEST: JSON.stringify(config), ...(run.npmScript === undefined ? {} : { npm_lifecycle_event: run.npmScript }) }
    const driver = join(run.root, 'scripts', 'calibrate', 'run-calibrate.mjs')
    const { status, stdout, stderr } = await new Promise<{ status: number | null, stdout: string, stderr: string }>((done, fail) => {
      const child = spawn(process.execPath, [driver, ...(run.args ?? [])], { cwd: run.root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk })
      child.on('error', fail)
      child.on('close', (code) => { done({ status: code, stdout: out, stderr: err }) })
    })
    const entries = (await readFile(log, 'utf8')).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as LogEntry)
    const started = stdout.split('\n').find(line => line.startsWith('STARTED '))
    return {
      status,
      stderr,
      ...(started === undefined ? {} : { started: JSON.parse(started.slice('STARTED '.length)) as string[] }),
      calls: entries.flatMap(entry => (entry.call === undefined ? [] : [entry.call])),
      sleeps: entries.flatMap(entry => (entry.sleep === undefined ? [] : [entry.sleep])),
      appends: entries.flatMap(entry => (entry.append === undefined ? [] : [entry.append])),
      events: entries.flatMap(entry => (entry.event === undefined ? [] : [entry.event])),
      runs: entries.flatMap(entry => (entry.run === undefined ? [] : [entry.run])),
    }
  }
  finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

// ------------------------------------------------------------ the parent side

interface Fixture {
  readonly rules?: Readonly<Record<string, Rule>>
  readonly level?: 'inform' | 'reduce' | 'stop'
  /** The switch code-freeze, set by the human. */
  readonly freeze?: boolean
}

/** A git project at `<base>/<name>` with the driver; the rules, the switch and the level are written by the board's engine as the human. */
async function makeProject(base: string, name: string, fixture: Fixture = {}): Promise<string> {
  const root = join(base, name)
  await mkdir(join(root, '.git'), { recursive: true })
  await placeDriver(root)
  const board = openRulesBoard({ projectRoot: root, io: quickIo({ now: () => Date.parse(SET_AT) }) })
  if (fixture.rules !== undefined || fixture.freeze !== undefined) {
    const file: RepoRules = {
      version: 2,
      ...(fixture.rules === undefined ? {} : { rules: fixture.rules }),
      ...(fixture.freeze === undefined ? {} : { signals: { 'code-freeze': { type: { kind: 'boolean' } } } }),
    }
    await mkdir(board.paths.rulesDir, { recursive: true })
    await writeFile(board.paths.rulesFile, repoJson(file))
    assert.notEqual(await board.settle(), 'busy')
  }
  if (fixture.freeze !== undefined) assert.ok((await board.apply('human', { op: 'signal-manual', name: 'code-freeze', value: fixture.freeze })).ok)
  if (fixture.level !== undefined) assert.ok((await board.apply('human', { op: 'peak-mode-set', level: fixture.level })).ok)
  return root
}

/** A temporary directory for one test, removed afterwards. */
function gateTest(name: string, body: (base: string) => Promise<void>): void {
  test(name, async () => {
    const base = await mkdtemp(join(tmpdir(), 'script-gate-'))
    try {
      await body(base)
    }
    finally {
      await rm(base, { recursive: true, force: true })
    }
  })
}

/** What src/rules/check.ts answers for the same command with the signals the gate computes at `at`. */
async function expectedOf(root: string, at: string, glmSpend: Spend, command: string, extra: Partial<Parameters<typeof checkCall>[1]> = {}): Promise<CheckResult> {
  const ms = Date.parse(at)
  const peak = creditPricing.peak(ms)
  const end = peak ? nextPeakChange(atMs => creditPricing.peak(atMs), ms) : undefined
  return checkCall({ tool: 'pwsh', args: { command } }, { project: root, glmSpend, signals: { 'glm-peak': peak }, ...(end === undefined ? {} : { peakUntil: new Date(end).toISOString() }), ...extra })
}

const linesOf = (text: string): string[] => text.split('\n').filter(line => line !== '')
const recordOf = (appended: Appended | undefined): Readonly<Record<string, unknown>> => JSON.parse(appended?.line ?? assert.fail('a line was appended')) as Record<string, unknown>

const { condition: _peakCondition, ...CREDIT_RUNS } = OFFPEAK_CREDIT_RUNS
/** Defers the credit runs while the switch code-freeze is on: a rule that does not read glm-peak. */
const FREEZE_CREDIT_RUNS: Rule = { ...CREDIT_RUNS, id: 'r-freeze-credit-runs', title: 'Hold the credit runs in a code freeze', condition: { signal: 'code-freeze', is: true } }
/** Blocks the calibration, with no condition. */
const NO_CALIBRATE: Rule = { ...CREDIT_RUNS, id: 'r-no-calibrate', title: 'No calibration in this project', action: { kind: 'block' }, reason: 'The calibration runs on the other machine.' }

const hit = (id: string, effect: string, when = 'true'): Answer => ({ id, title: id, effect, when })
const BLOCK_TEXT = 'Blocked by the fake.'
const QUEUE_TEXT = 'Deferred by the fake.'
const blockOf = (...rules: Answer[]): Answer => ({ effect: 'block', exitCode: 4, rules, text: BLOCK_TEXT, peakMode: 'reduce' })
const queueOf = (...rules: Answer[]): Answer => ({ effect: 'queue', exitCode: 5, rules, text: QUEUE_TEXT, peakMode: 'reduce' })
const ALLOW: Answer = {}

// ---------------------------------------------------------------- item 15

const SCRIPTS = [
  { npmScript: 'calibrate', glmSpend: 'optional' },
  { npmScript: 'smoke:authorized', glmSpend: 'necessary' },
] as const

gateTest('by level (item 15): the factory and the human reduce defer only the optional run in the peak, stop defers both, nothing outside it', async (base) => {
  for (const level of ['inform', 'default', 'reduce', 'stop'] as const) {
    const root = await makeProject(base, level, level === 'default' ? {} : { level })
    const runs = SCRIPTS.flatMap(script => [WED_1500, WED_1900, SAT_1500].map(start => ({ script, start })))
    const results = await Promise.all(runs.map(async ({ script, start }) => ({
      script,
      start,
      ran: await runGate({ root, start, glmSpend: script.glmSpend, npmScript: script.npmScript }),
      expected: await expectedOf(root, start, script.glmSpend, `npm run ${script.npmScript}`),
    })))
    for (const { script, start, ran, expected } of results) {
      const where = `${level}, npm run ${script.npmScript}, ${start}: ${ran.stderr}`
      const deferred = start === WED_1500 && (level === 'stop' || (level !== 'inform' && script.glmSpend === 'optional'))
      assert.equal(ran.status, deferred ? 5 : 0, where)
      assert.equal(expected.exitCode, ran.status, where)
      if (!deferred) {
        assert.equal(ran.stderr, '', where)
        assert.deepEqual(ran.started, [], where)
        continue
      }
      assert.equal(ran.started, undefined, where)
      const text = expected.text ?? assert.fail(where)
      const ids = expected.rules.filter(rule => rule.effect === 'queue' && rule.when !== 'false').map(rule => rule.id)
      assert.equal(ran.stderr, `${text}\nrules gate: ${ids.join(', ')} queues this run; GLM peak ends at ${hm(PEAK_END)}. Rerun with --wait to wait.\n`, where)
      assert.ok(text.includes(`until ${hm(PEAK_END)}`), where)
      assert.ok(text.includes(level === 'stop' ? 'builtin:glm-peak-stop-scripts' : 'builtin:glm-peak-reduce'), where)
      assert.ok(text.includes(level === 'default' ? 'Peak mode: reduce (the default; the human can change it).' : `Peak mode set by the human at ${localMinute(SET_AT)}: ${level}.`), where)
    }
  }
})

gateTest('by level (item 15): when the gate cannot tell the peak and no host is alive, every level lets both runs start with one line saying why', async (base) => {
  for (const level of ['inform', 'default', 'stop'] as const) {
    const root = await makeProject(base, level, level === 'default' ? {} : { level })
    for (const script of SCRIPTS) {
      const ran = await runGate({ root, start: WED_1500, peak: 'throws', glmSpend: script.glmSpend, npmScript: script.npmScript })
      const where = `${level}, npm run ${script.npmScript}: ${ran.stderr}`
      assert.equal(ran.status, 0, where)
      assert.deepEqual(ran.started, [], where)
      const board = await checkCall({ tool: 'pwsh', args: { command: `npm run ${script.npmScript}` } }, { project: root, glmSpend: script.glmSpend })
      const unknown = board.signals.find(signal => signal.name === 'glm-peak')?.unknown
      assert.equal(ran.stderr, `rules gate: glm-peak not computed here (no peak clock in this test)${unknown === undefined ? '' : `; ${unknown}`}\n`, where)
      if (level === 'stop') assert.ok(unknown !== undefined, 'the stop level reads glm-peak for both runs, and no host can tell it')
    }
  }
})

// ---------------------------------------------------------------- item 16

gateTest('output and waiting (item 16): a person\'s rule on glm-peak defers the run naming the end of the peak, and --wait sleeps to a second after it', async (base) => {
  const root = await makeProject(base, 'offpeak', { rules: { [OFFPEAK_CREDIT_RUNS.id]: OFFPEAK_CREDIT_RUNS }, level: 'inform' })
  const text = (await expectedOf(root, WED_1500, 'optional', COMMAND)).text ?? assert.fail('the rule defers the run')
  assert.ok(text.includes(`defers it while glm-peak is true until ${hm(PEAK_END)}`), text)
  const plain = await runGate({ root, start: WED_1500 })
  assert.equal(plain.status, 5, plain.stderr)
  assert.equal(plain.stderr, `${text}\nrules gate: r-offpeak-credit-runs queues this run; GLM peak ends at ${hm(PEAK_END)}. Rerun with --wait to wait.\n`)
  assert.equal(plain.started, undefined)

  const waiting = await runGate({ root, start: WED_1500, args: ['--tasks', 'a', '--wait'] })
  assert.equal(waiting.status, 0, waiting.stderr)
  assert.deepEqual(waiting.sleeps, [10_801_000], 'to 18:00:01')
  assert.deepEqual(waiting.started, ['--tasks', 'a'], 'the script never sees --wait')
  const waitedText = (await expectedOf(root, WED_1500, 'optional', `${COMMAND} --tasks a`)).text ?? assert.fail('the rule defers the run')
  assert.equal(waiting.stderr, `${waitedText}\nrules gate: waiting until ${hm(PEAK_END)}\n`)
})

gateTest('output and waiting (item 16): a rule that does not read glm-peak names no time, and --wait checks again every 60 s, recomputing the signals, for up to 8 h', async (base) => {
  const root = await makeProject(base, 'freeze', { rules: { [FREEZE_CREDIT_RUNS.id]: FREEZE_CREDIT_RUNS }, freeze: true, level: 'inform' })
  const text = (await expectedOf(root, WED_1500, 'optional', COMMAND)).text ?? assert.fail('the rule defers the run')
  const plain = await runGate({ root, start: WED_1500 })
  assert.equal(plain.status, 5, plain.stderr)
  assert.equal(plain.stderr, `${text}\nrules gate: r-freeze-credit-runs queues this run. Rerun with --wait to wait.\n`)

  const frozen = { ...queueOf(hit('r-freeze-credit-runs', 'queue')), signals: [{ name: 'code-freeze', source: 'manual', value: true }] }
  const long = await runGate({ root, start: WED_1500, args: ['--wait'], check: { answers: [frozen] }, append: 'records' })
  assert.equal(long.status, 5, long.stderr)
  assert.equal(long.calls.length, 481)
  assert.deepEqual(long.sleeps, Array.from({ length: 480 }, () => 60_000))
  assert.deepEqual(long.calls.map(call => call.options.waitedMs), [undefined, ...Array.from({ length: 480 }, (_, index) => (index + 1) * 60_000)])
  // 15:00 to 17:59 is the peak, so the first 180 checks say so with its end; from 18:00 on it is not.
  assert.deepEqual(long.calls.map(call => call.options.signals), Array.from({ length: 481 }, (_, index) => ({ 'glm-peak': index < 180 })))
  assert.deepEqual(long.calls.map(call => call.options.peakUntil), Array.from({ length: 481 }, (_, index) => (index < 180 ? PEAK_END : undefined)))
  assert.equal(long.stderr, `${QUEUE_TEXT}\nrules gate: re-checking every 60 s for up to 8 h\n${QUEUE_TEXT}\nrules gate: r-freeze-credit-runs queues this run. Rerun with --wait to wait.\n`)
  assert.equal(long.appends.length, 1, 'one line for the rule, however many checks')
})

gateTest('the command text is the npm script that started the run, else node and the script under the repository, without --wait', async (base) => {
  const root = await makeProject(base, 'command')
  const npm = await runGate({ root, start: WED_1900, npmScript: 'calibrate', args: ['--tasks', 'x', '--wait'], check: { answers: [ALLOW] } })
  assert.deepEqual(npm.calls.map(call => call.call), [{ tool: 'pwsh', args: { command: 'npm run calibrate --tasks x' } }])
  const odd = await runGate({ root, start: WED_1900, npmScript: 'Not A Script', args: ['--tasks', 'x'], check: { answers: [ALLOW] } })
  assert.deepEqual(odd.calls.map(call => call.call.args.command), [`${COMMAND} --tasks x`])
})

// ---------------------------------------------------------------- item 17

gateTest('a board that cannot be loaded or fails lets the script start, with one line (item 17)', async (base) => {
  const root = await makeProject(base, 'broken')
  for (const check of ['missing', 'no-export'] as const) {
    const ran = await runGate({ root, start: WED_1500, check })
    assert.equal(ran.status, 0, ran.stderr)
    assert.deepEqual(ran.started, [])
    const lines = linesOf(ran.stderr)
    assert.equal(lines.length, 1, ran.stderr)
    assert.ok(lines[0]?.startsWith('rules gate: rules board not available ('), ran.stderr)
    assert.ok(lines[0]?.endsWith('); starting without the check'), ran.stderr)
  }
  const failing = await runGate({ root, start: WED_1500, check: { answers: [{ throws: 'io' }] } })
  assert.equal(failing.status, 0, failing.stderr)
  assert.deepEqual(failing.started, [])
  assert.equal(failing.stderr, 'rules gate: rules board not available (io: the state of the project cannot be read in this test); starting without the check\n')
})

gateTest('glmSpend is the call site\'s (item 17): --glm-spend on the command line changes nothing and is left to the script\'s own parser', async (base) => {
  const root = await makeProject(base, 'spend')
  const ran = await runGate({ root, start: WED_1500, glmSpend: 'optional', args: ['--glm-spend', 'necessary'], check: { answers: [ALLOW] } })
  assert.deepEqual(ran.calls.map(call => call.options.glmSpend), ['optional'])
  assert.deepEqual(ran.started, ['--glm-spend', 'necessary'])
  const calibrate = await readFile(join(REPO, 'scripts', 'calibrate', 'run-calibrate.mjs'), 'utf8')
  const parse = calibrate.indexOf('parseArgs({')
  const options = calibrate.slice(parse, calibrate.indexOf('\n})', parse))
  assert.ok(parse > 0 && options.includes("'collect'"), 'the parser of the calibration runner')
  assert.ok(!options.includes('glm-spend'), 'the runner does not read --glm-spend')
  assert.ok(!calibrate.includes('strict: false'), 'an unknown argument stays an error')
})

gateTest('the two call sites ask before anything else, the calibration as optional and the smoke as necessary', async () => {
  const calibrate = await readFile(join(REPO, 'scripts', 'calibrate', 'run-calibrate.mjs'), 'utf8')
  const smoke = await readFile(join(REPO, 'scripts', 'smoke-zcode-authorized.mjs'), 'utf8')
  const gate = (text: string): number => text.indexOf('await gateOnRules(')
  assert.ok(gate(calibrate) > 0 && gate(calibrate) < calibrate.indexOf('parseArgs('), 'before the arguments')
  assert.ok(calibrate.includes("await gateOnRules({ glmSpend: 'optional', peakAt: at => creditPricing.peak(at) })"))
  assert.ok(gate(smoke) > 0 && gate(smoke) < smoke.indexOf('credentialHome(undefined)') && gate(smoke) < smoke.indexOf('new ZcodeAdapter('), 'before the credentials and the adapter')
  assert.ok(smoke.includes("await gateOnRules({ glmSpend: 'necessary', peakAt: at => creditPricing.peak(at) })"))
})

// ---------------------------------------------------------------- item 22

gateTest('the options the board is given (item 22): with --wait from 17:58:30 it is asked at 17:58:30, 18:00:01 and 18:01:01', async (base) => {
  const root = await makeProject(base, 'options')
  const queue = queueOf(hit('r-hold', 'queue'))
  const ran = await runGate({ root, start: WED_175830, args: ['--wait'], check: { answers: [queue, queue, ALLOW] }, append: 'records' })
  assert.equal(ran.status, 0, ran.stderr)
  assert.deepEqual(ran.started, [])
  assert.deepEqual(ran.calls.map(call => new Date(call.at).toISOString()), ['2026-10-28T09:58:30.000Z', '2026-10-28T10:00:01.000Z', '2026-10-28T10:01:01.000Z'])
  assert.deepEqual(ran.calls.map(call => call.options), [
    { project: root, glmSpend: 'optional', signals: { 'glm-peak': true }, peakUntil: PEAK_END },
    { project: root, glmSpend: 'optional', signals: { 'glm-peak': false }, waitedMs: 91_000 },
    { project: root, glmSpend: 'optional', signals: { 'glm-peak': false }, waitedMs: 151_000 },
  ])
  assert.deepEqual(ran.sleeps, [91_000, 60_000])
  assert.equal(ran.appends.length, 1, 'item 26: deferred, deferred, allowed is one line')

  for (const [peak, reason] of [['throws', 'no peak clock in this test'], ['text', 'peakAt gave string, not true or false']] as const) {
    const blind = await runGate({ root, start: WED_1500, peak, check: { answers: [ALLOW] } })
    assert.deepEqual(blind.calls.map(call => call.options), [{ project: root, glmSpend: 'optional' }], 'neither signals nor peakUntil')
    assert.equal(blind.stderr, `rules gate: glm-peak not computed here (${reason})\n`)
    assert.deepEqual(blind.started, [])
  }
})

gateTest('the options the board is given (item 22), once with the real checkCall: three checks are three rules.check events', async (base) => {
  const root = await makeProject(base, 'recorded', { rules: { [FREEZE_CREDIT_RUNS.id]: FREEZE_CREDIT_RUNS }, freeze: true, level: 'inform' })
  const ran = await runGate({ root, start: WED_1900, args: ['--wait'], check: 'recorded', freezeOffAfter: 2 })
  assert.equal(ran.status, 0, ran.stderr)
  assert.deepEqual(ran.started, [])
  assert.deepEqual(ran.events.map(event => event.event), ['rules.check', 'rules.check', 'rules.check'])
  assert.deepEqual(ran.events.map(event => event.exitCode), [5, 5, 0])
  assert.deepEqual(ran.events.map(event => event.waitedMs), [undefined, 60_000, 120_000])
  assert.deepEqual(ran.sleeps, [60_000, 60_000])
})

// ---------------------------------------------------------------- item 24

gateTest('the gate runs nothing and records no judgement (item 24): no child process, no metrics exit, one timer, and a script\'s block is the board\'s refusal alone', async (base) => {
  const source = await readFile(GATE_SOURCE, 'utf8')
  assert.ok(!source.includes('child_process'), 'scripts run only inside checkCall')
  assert.ok(!source.includes('metrics'), 'no metrics exit is imported')
  assert.ok(!source.includes('rules.check'), 'the judgement event is the board\'s')
  assert.equal(source.match(/setTimeout/g)?.length, 1, 'the one timer is the default sleep')
  assert.ok(source.includes('options.sleep ?? (ms => new Promise(done => setTimeout(done, ms)))'))
  assert.ok(!/setInterval|AbortSignal/.test(source), 'no timeout of its own')

  const root = await makeProject(base, 'script')
  const text = [
    `You tried to run "${COMMAND}".`,
    'Boundary: Rule r-lint-gate ran its script docs/rules/scripts/r-lint-gate.mjs and it blocked the call: lint fails.',
    'Right path: Fix the lint first.',
    'Exception: The human can lift the rule (/rules lift r-lint-gate).',
  ].join('\n')
  const blocked = { ...blockOf(hit('r-lint-gate', 'block')), text, scripts: [{ rule: 'r-lint-gate', outcome: 'block', ms: 1_200 }] }
  const ran = await runGate({ root, start: WED_1500, check: { answers: [blocked] }, append: 'records' })
  assert.equal(ran.status, 4, ran.stderr)
  assert.equal(ran.stderr, `${text}\n`)
  assert.equal(ran.started, undefined)
})

// ------------------------------------------------- item 24, with the real checkCall

const BY_THE_BOARD = { kind: 'exited' as const, stdout: '', durationMs: 5, truncated: false }
const exits = (exitCode: number, stderr = ''): ScriptResult => ({ ...BY_THE_BOARD, exitCode, stderr })
const TIMED_OUT: ScriptResult = { kind: 'timeout', stdout: '', stderr: '', durationMs: 10_000 }
/** The stand-in executor of a case, in this process, for the expected refusal. */
const standIn = (...answers: readonly ScriptResult[]): NonNullable<Parameters<typeof checkCall>[1]['runScript']> => {
  let runs = 0
  return () => Promise.resolve(answers[Math.min(runs++, answers.length - 1)])
}

/** A rule that runs a script before the calibration, approved the way the human approves: the agent proposes it, the person's word makes it so. */
async function approveGateScript(root: string, id: string, action: Record<string, unknown> = {}): Promise<void> {
  const board = openRulesBoard({ projectRoot: root, io: quickIo({ now: () => Date.parse(SET_AT) }) })
  const proposal = `p-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')}`
  const body = {
    id,
    title: 'Lint before the calibration',
    scope: 'project',
    when: { kind: 'event', events: ['gate.tool-call'] },
    filter: { command: { matches: 'run-calibrate' } },
    action: { kind: 'script', lang: 'node', text: 'process.exit(0)\n', timeoutSeconds: 10, ...action },
    lifetime: { kind: 'until-lifted' },
  }
  const made = prepareProposal({ kind: 'rule', body, reason: 'the human asked for a lint before the calibration' }, { state: loadState(board.paths).state, rulesDirFromRoot: 'docs/rules', now: new Date(Date.parse(SET_AT)), via: 'graph', proposedBy: { sessionId: 's-main', agentId: 'agent-main' }, id: proposal, readScript: () => undefined })
  assert.ok(made.ok, JSON.stringify(made))
  assert.ok((await board.apply('llm', { op: 'propose', proposal: made.proposal })).ok)
  assert.ok((await board.apply('human', { op: 'proposal-accept', id: proposal, by: 'llm', relay: '可以', question: 'question-1' })).ok)
}

gateTest('item 24 with the real checkCall: a script a person approved that exits 2 blocks the run, exit code 4, the refusal on standard error and nothing else, one journal line with the rule id', async (base) => {
  const root = await makeProject(base, 'script-block')
  await approveGateScript(root, 'r-lint-gate')
  const answer = exits(2, 'lint fails')
  const expected = await expectedOf(root, WED_1900, 'optional', COMMAND, { runScript: standIn(answer) })
  assert.equal(expected.exitCode, 4)
  assert.match(expected.text ?? '', /ran its script docs\/rules\/scripts\/r-lint-gate\.mjs, which blocked the call: "lint fails"\./)
  const ran = await runGate({ root, start: WED_1900, check: { runner: [answer] }, append: 'records' })
  assert.equal(ran.status, 4, ran.stderr)
  assert.equal(ran.stderr, `${expected.text ?? ''}\n`, 'the refusal of the board and no line besides it')
  assert.equal(ran.started, undefined)
  assert.deepEqual(ran.runs, [{ entry: 'r-lint-gate', purpose: 'gate', timeoutMs: 10_000 }])
  assert.deepEqual(ran.events.map(event => [event.event, event.exitCode]), [['rules.check', 4]], 'one judgement, one rules.check')
  const [line, ...rest] = ran.appends
  assert.equal(rest.length, 0)
  const record = recordOf(line)
  assert.deepEqual([record.rule, record.mode, record.effect, record.correction], ['rules:r-lint-gate', 'enforce', 'block', expected.text])
})

gateTest('item 24 with the real checkCall: exit 3 defers the run, exit code 5, and --wait asks again every 60 s without a glm-peak rule, each time running the script again', async (base) => {
  const root = await makeProject(base, 'script-queue')
  await approveGateScript(root, 'r-lint-gate')
  const deferred = await runGate({ root, start: WED_1900, check: { runner: [exits(3, 'build running')] } })
  assert.equal(deferred.status, 5, deferred.stderr)
  assert.match(deferred.stderr, /ran its script docs\/rules\/scripts\/r-lint-gate\.mjs, which deferred the call: "build running"\./)
  assert.equal(deferred.runs.length, 1)
  const waited = await runGate({ root, start: WED_1900, args: ['--wait'], check: { runner: [exits(3, 'build running'), exits(3, 'build running'), exits(0)] } })
  assert.equal(waited.status, 0, waited.stderr)
  assert.deepEqual(waited.sleeps, [60_000, 60_000], 'a rule that does not read glm-peak is judged again every 60 s')
  assert.equal(waited.runs.length, 3, 'one run of the script for each judgement')
  assert.deepEqual(waited.events.map(event => [event.event, event.exitCode]), [['rules.check', 5], ['rules.check', 5], ['rules.check', 0]])
  assert.deepEqual(waited.started, [], 'the script went on, and its own parser never saw the gate\'s flag')
})

gateTest('item 24 with the real checkCall: a script that does not answer in time goes by the rule\'s failure setting, and the gate sets no timeout of its own', async (base) => {
  const lenient = await makeProject(base, 'script-timeout-allow')
  await approveGateScript(lenient, 'r-lint-gate')
  const allowed = await runGate({ root: lenient, start: WED_1900, check: { runner: [TIMED_OUT] } })
  assert.equal(allowed.status, 0, allowed.stderr)
  assert.deepEqual(allowed.started, [], 'the script went on')
  assert.deepEqual(allowed.runs.map(run => run.timeoutMs), [10_000], 'the rule\'s timeout is what the executor is given')
  const strict = await makeProject(base, 'script-timeout-block')
  await approveGateScript(strict, 'r-lint-gate', { onError: 'block' })
  const blocked = await runGate({ root: strict, start: WED_1900, check: { runner: [TIMED_OUT] } })
  assert.equal(blocked.status, 4, blocked.stderr)
  assert.match(blocked.stderr, /ran its script docs\/rules\/scripts\/r-lint-gate\.mjs, which did not finish within 10 s, and the rule says to block when its script fails\./)
  assert.equal(blocked.started, undefined)
})
// ---------------------------------------------------------------- item 26

gateTest('the journal line of a refusal (item 26): one per hit rule, with the rule id, the command, the level, the signals and the refusal', async (base) => {
  const root = await makeProject(base, 'journal')
  const journal = join(root, '.llm', 'audit', 'violations.jsonl')
  const blocked = { ...blockOf(hit('builtin:glm-peak-reduce', 'block')), signals: [{ name: 'glm-peak', source: 'caller', value: true }, { name: 'code-freeze', source: 'none', unknown: 'not declared' }] }
  const one = await runGate({ root, start: WED_1500, check: { answers: [blocked] }, append: 'records' })
  assert.equal(one.status, 4, one.stderr)
  assert.equal(one.stderr, `${BLOCK_TEXT}\n`)
  assert.equal(one.appends.length, 1)
  assert.equal(resolve(one.appends[0]?.path ?? ''), journal)
  const record = recordOf(one.appends[0])
  assert.deepEqual(record, { at: WED_1500, rule: 'rules:builtin:glm-peak-reduce', mode: 'enforce', effect: 'block', tool: 'pwsh', command: COMMAND, peakMode: 'reduce', signals: { 'glm-peak': true }, correction: BLOCK_TEXT })
  assert.equal(record.command, one.calls[0]?.call.args.command)
  assert.equal(classifyRecord(record), 'denial')

  const two = await runGate({ root, start: WED_1500, check: { answers: [blockOf(hit('r-a', 'block'), hit('r-b', 'block', 'unknown'), hit('r-c', 'block', 'false'), hit('r-d', 'queue'))] }, append: 'records' })
  assert.deepEqual(two.appends.map(appended => recordOf(appended).rule), ['rules:r-a', 'rules:r-b'], 'a rule whose condition is false and one of another effect are not hits')

  const deferred = await runGate({ root, start: WED_1500, check: { answers: [queueOf(hit('r-a', 'queue'))] }, append: 'records' })
  assert.equal(deferred.status, 5)
  const queued = recordOf(deferred.appends[0])
  assert.deepEqual([queued.effect, queued.mode, queued.signals, queued.correction], ['queue', 'enforce', { 'glm-peak': true }, QUEUE_TEXT])
  assert.equal(classifyRecord(queued), 'deferral')

  const allowed = await runGate({ root, start: WED_1500, check: { answers: [ALLOW] }, append: 'records' })
  assert.equal(allowed.status, 0)
  assert.deepEqual(allowed.appends, [])
})

gateTest('the journal line while waiting (item 26): a new rule or a block after a deferral adds a line, the same rule and effect does not', async (base) => {
  const root = await makeProject(base, 'waiting')
  const rules = (ran: Ran): unknown[] => ran.appends.map(appended => [recordOf(appended).rule, recordOf(appended).effect])
  const other = await runGate({ root, start: WED_1500, args: ['--wait'], check: { answers: [queueOf(hit('r-a', 'queue')), queueOf(hit('r-b', 'queue')), ALLOW] }, append: 'records' })
  assert.equal(other.status, 0, other.stderr)
  assert.deepEqual(rules(other), [['rules:r-a', 'queue'], ['rules:r-b', 'queue']])
  const worse = await runGate({ root, start: WED_1500, args: ['--wait'], check: { answers: [queueOf(hit('r-a', 'queue')), queueOf(hit('r-a', 'queue')), blockOf(hit('r-a', 'block'))] }, append: 'records' })
  assert.equal(worse.status, 4, worse.stderr)
  assert.deepEqual(rules(worse), [['rules:r-a', 'queue'], ['rules:r-a', 'block']])
  assert.equal(worse.stderr, `${QUEUE_TEXT}\nrules gate: waiting until ${hm(PEAK_END)}\n${BLOCK_TEXT}\n`)
})

gateTest('a journal that cannot be written (item 26) changes no exit code and is said once a process; a folder that is no project gets no line', async (base) => {
  const root = await makeProject(base, 'failing')
  const WARNING = 'rules gate: violation journal not written (disk full in this test)'
  const once = await runGate({ root, start: WED_1500, check: { answers: [blockOf(hit('r-a', 'block'))] }, append: 'throws' })
  assert.equal(once.status, 4)
  assert.equal(once.stderr, `${BLOCK_TEXT}\n${WARNING}\n`)
  const twice = await runGate({ root, start: WED_1500, args: ['--wait'], check: { answers: [queueOf(hit('r-a', 'queue')), blockOf(hit('r-a', 'block'))] }, append: 'throws' })
  assert.equal(twice.status, 4)
  assert.equal(twice.appends.length, 2, 'both lines were tried')
  assert.equal(linesOf(twice.stderr).filter(line => line === WARNING).length, 1, twice.stderr)

  const plain = join(base, 'plain')
  await placeDriver(plain)
  const nowhere = await runGate({ root: plain, start: WED_1500, check: { answers: [queueOf(hit('r-a', 'queue'))] }, append: 'records' })
  assert.equal(nowhere.status, 5)
  assert.deepEqual(nowhere.appends, [])
  const warnings = linesOf(nowhere.stderr).filter(line => line.startsWith('rules gate: violation journal not written ('))
  assert.equal(warnings.length, 1, nowhere.stderr)
})

gateTest('the journal of a work tree (item 26) is the main checkout\'s, the project root checkCall reads the rules of', async (base) => {
  const main = join(base, 'main')
  await mkdir(join(main, '.git', 'worktrees', 'wt'), { recursive: true })
  await writeFile(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n')
  const tree = join(base, 'wt')
  await placeDriver(tree)
  await writeFile(join(tree, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n`)
  const ran = await runGate({ root: tree, start: WED_1500, check: { answers: [blockOf(hit('r-a', 'block'))] }, append: 'records' })
  assert.equal(ran.status, 4, ran.stderr)
  assert.deepEqual(ran.appends.map(appended => resolve(appended.path)), [join(main, '.llm', 'audit', 'violations.jsonl')])
})

gateTest('the journal on disk (item 26, item 16): a block of the real checkCall says only the refusal, writes one line, ignores .llm, and the morning report counts it', async (base) => {
  const root = join(base, 'disk')
  await mkdir(join(root, '.git'), { recursive: true })
  await placeDriver(root)
  await mkdir(join(root, 'docs', 'rules'), { recursive: true })
  await writeFile(join(root, 'docs', 'rules', 'rules.json'), repoJson({ version: 2, rules: { [NO_CALIBRATE.id]: NO_CALIBRATE } }))
  assert.ok(!existsSync(join(root, '.llm')))
  const text = (await expectedOf(root, WED_1500, 'optional', COMMAND)).text ?? assert.fail('the rule blocks the run')
  const journal = join(root, '.llm', 'audit', 'violations.jsonl')

  const first = await runGate({ root, start: WED_1500 })
  assert.equal(first.status, 4, first.stderr)
  assert.equal(first.stderr, `${text}\n`, 'a block says the refusal and nothing else')
  const once = linesOf(await readFile(journal, 'utf8'))
  assert.equal(once.length, 1)
  assert.equal((JSON.parse(once[0] ?? '') as { rule: string }).rule, 'rules:r-no-calibrate')
  assert.ok(linesOf(await readFile(join(root, '.git', 'info', 'exclude'), 'utf8')).includes('.llm/'))

  const second = await runGate({ root, start: WED_1900 })
  assert.equal(second.status, 4, second.stderr)
  const twice = linesOf(await readFile(journal, 'utf8'))
  assert.equal(twice.length, 2)
  assert.equal(twice[0], once[0])

  const report = morningReport({
    decisions: [],
    violations: twice.map(line => JSON.parse(line) as GuardRecord),
    usage: [],
    period: '2026-10-28',
    asks: { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } },
  })
  assert.ok(report.includes('- 违规 rules:r-no-calibrate × 2'), report)
  assert.ok(report.includes('- 拦下 rules:r-no-calibrate × 2'), report)
  assert.ok(!report.includes('读不懂'), report)
})
