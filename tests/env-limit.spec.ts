/**
 * check_limit and the ceiling of one check (src/env/limit-tool.ts; M4 design
 * §6.3.1 「调高上限」, §14.2 decision three ⑥, F12, N9, N10, N16, P13-01,
 * F20): the order of the checks and their codes, a raise and a reset in
 * limits.jsonl (the setting is a check's last line there), when a check is
 * held at its ceiling (for a raise, and for the main agent's notice line,
 * word for word), the description and its example, and the process slots of
 * the raised checks (N17 ③). Each case has its own project directory in a
 * temporary folder.
 */
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CHECK_LIMIT_DESCRIPTION, CHECK_LIMIT_EXAMPLE, CHECK_LIMIT_HELD_MS, checkLimit, heldAtCeiling, heldForRaise, heldSentence, limitSetting, parseLimits, readLimits,
  type CheckLimitDeps, type LimitBook,
} from '../src/env/limit-tool.ts'
import { CHECK_RAISED_SLOTS, CHECK_SLOTS, createCheckSlots } from '../src/env/runner.ts'
import { CHECK_TIMEOUT_CAP_MS, nextValue, type TimingLine } from '../src/env/timeout.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { ScriptResult } from '../src/loops/script.ts'
import type { AgentLike } from '../src/shared/dsh-min.ts'

const NOW = Date.parse('2026-11-05T06:00:00Z')
const at = (minutes: number): string => new Date(NOW + minutes * 60_000).toISOString()
const KEY = 'tool-3/eslint'
const ARGV = 'abcd1234'
const NONE: LimitBook = { lines: [], bad: 0 }

const value = (minutes: number, limitMs: number, wantedMs?: number, check = KEY): TimingLine => ({
  kind: 'value', at: at(minutes), check, argv: ARGV, limitMs, cap: { by: 'default' },
  ...(wantedMs === undefined ? {} : { capped: { wantedMs } }),
  source: { by: 'estimate', node: check.split('/')[0] ?? '', rev: 'r', estimateS: 25 },
})
const stop = (minutes: number, limitMs: number): TimingLine => ({ kind: 'timeout', at: at(minutes), check: KEY, argv: ARGV, limitMs, elapsedMs: limitMs + 10, outcome: 'not-finished' })

const agentOf = (subagent = false): AgentLike => ({
  id: 'a1',
  session: { id: 'session-1', header: { id: 'session-1', cwd: 'x', ...(subagent ? { origin: 'subagent' } : {}) }, deriveMessages: () => [] },
}) as unknown as AgentLike

/** The result of a call, or the `{code, message, hint}` it threw. */
async function outcomeOf(call: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    return await call as Record<string, unknown>
  }
  catch (error) {
    return JSON.parse((error as Error).message) as Record<string, unknown>
  }
}

interface Home {
  readonly home: string
  readonly timing: string
  readonly limits: string
  /** One check_limit call as the root agent at `now` (minutes after NOW), with the checks of the project. */
  readonly call: (args: unknown, over?: Partial<CheckLimitDeps> & { readonly minutes?: number }) => Promise<Record<string, unknown>>
  readonly limitLines: () => Promise<readonly Record<string, unknown>[]>
}

async function withHome(timing: readonly TimingLine[], body: (home: Home) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'env-limit-'))
  const timingFile = join(home, 'env-checks', 'timing.jsonl')
  const limitsFile = join(home, 'env-checks', 'limits.jsonl')
  try {
    await mkdir(join(home, 'env-checks'), { recursive: true })
    await writeFile(timingFile, timing.map(line => `${JSON.stringify(line)}\n`).join(''))
    await body({
      home,
      timing: timingFile,
      limits: limitsFile,
      call: (args, over = {}) => outcomeOf(checkLimit(args, {
        agent: agentOf(),
        home,
        checks: () => Promise.resolve([KEY, 'tool-3/tsc']),
        now: () => new Date(NOW + (over.minutes ?? 0) * 60_000),
        ...over,
      })),
      limitLines: async () => (await readFile(limitsFile, 'utf8').catch(() => '')).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>),
    })
  }
  finally {
    await rm(home, { recursive: true, force: true })
  }
}

const REASON = '整个项目跑带类型信息的规则，在这台机器上要 40 秒左右'
const raise = (seconds: number, check = KEY): Record<string, unknown> => ({ check, seconds, reason: REASON })

test('the order of the checks: a subagent first, then the arguments, the check, whether it is held, the write (design §6.3.1, ⑥, F12)', async () => {
  await withHome([value(-10, 60_000, 75_000)], async ({ call, limits }) => {
    assert.deepEqual(await call({ ...raise(120), force: true }, { agent: agentOf(true) }), { code: 'forbidden', message: 'a subagent cannot change check limits', hint: 'a subagent cannot change check limits: report to the main agent' }, 'a subagent is refused before its arguments are read')
    assert.equal((await call({ ...raise(120), force: true })).code, 'invalid', 'no field beyond the table')
    for (const seconds of [60, 601, 120.5, '120']) {
      const refused = await call(raise(seconds as number))
      assert.deepEqual([refused.code, refused.hint], ['invalid', 'seconds is a whole number from 61 to 600, above the ceiling in force now (60 s)'], String(seconds))
    }
    assert.equal((await call({ check: KEY, seconds: 120 })).code, 'invalid', 'a raise needs a reason')
    assert.equal((await call({ check: KEY, seconds: 120, reason: 'x'.repeat(301) })).code, 'invalid')
    const plain = await call({ check: KEY, seconds: 120, reason: '门禁里要跑整个项目' })
    assert.deepEqual([plain.code, plain.hint], ['invalid', 'say "合入前的检查" instead of "门禁"'], 'the human reads the reason: plain words only')
    assert.equal((await call({ check: KEY, action: 'up' })).code, 'invalid')
    assert.equal((await call({ ...raise(120, 'tool-9/x'), seconds: 1 })).code, 'invalid', 'the arguments before the check')
    assert.deepEqual(await call(raise(120, 'tool-9/x')), { code: 'unknown_check', message: 'no approved check line tool-9/x runs after edits in this project', hint: 'the checks: tool-3/eslint, tool-3/tsc' })
    assert.equal((await call(raise(120), { checks: () => Promise.resolve(undefined) })).code, 'unknown_check', 'a graph that cannot be read knows no check')
    assert.equal((await call(raise(120, 'tool-3/tsc'))).code, 'not_held', 'a check that is not held has nothing to raise')
    await mkdir(limits, { recursive: true })
    const unwritable = await call(raise(120))
    assert.equal(unwritable.code, 'unavailable')
    assert.match(String(unwritable.hint), /^tell the human the limit could not be changed \(E\w+\); you can try again or narrow the check$/)
  })
})

test('raise, the ceiling in force, and reset; a raise must be earned again at the new ceiling (⑥, N9, P13-01)', async () => {
  await withHome([value(-10, 60_000, 75_000)], async ({ call, timing, limitLines }) => {
    const journal = await readFile(timing, 'utf8')
    assert.deepEqual(await call(raise(120)), { outcome: 'raised', check: KEY, capS: 120, previousCapS: 60, message: `The ceiling of check ${KEY} is now 120 s (it was 60 s); its next run takes its limit under it. The human sees the raise and your reason on the loop board and in the morning report: mention it in your reply. To undo it, call check_limit with action "reset".` })
    assert.deepEqual(await limitLines(), [{ at: at(0), check: KEY, action: 'raise', capS: 120, previousCapS: 60, reason: REASON, session: 'session-1' }])
    assert.equal(await readFile(timing, 'utf8'), journal, 'check_limit writes no timing line')
    const setting = limitSetting(parseLimits(`${JSON.stringify((await limitLines())[0])}\n`), KEY)
    assert.deepEqual(setting, { capS: 120, at: at(0), reason: REASON })
    const next = nextValue({ lines: [value(-10, 60_000, 75_000)], bad: 0 }, { check: KEY, argv: ARGV, estimateS: 25, ...(setting === undefined ? {} : { setting }) }, new Date(NOW))
    assert.deepEqual([next.timeout.limitMs, next.timeout.capped, next.line?.cap], [75_000, undefined, { by: 'setting', capS: 120, at: at(0), reason: REASON }], 'the setting is the next run\'s ceiling, and the value line says so')
    assert.deepEqual([(await call(raise(200), { minutes: 1 })).code, (await call(raise(200), { minutes: 1 })).hint], ['not_held', 'raise a check only while the environment notice says it is held at its ceiling, or within 7 days after it was stopped there'], 'the stop under the old ceiling does not count after the raise')
    await writeFile(timing, `${journal}${JSON.stringify(stop(2, 120_000))}\n`)
    assert.equal((await call(raise(120), { minutes: 3 })).code, 'invalid', 'seconds must be above the ceiling in force now')
    assert.equal((await call(raise(200), { minutes: 3 })).outcome, 'raised', 'stopped at the new ceiling: it may be raised again')
    assert.deepEqual(await call({ check: KEY, action: 'reset' }, { minutes: 4 }), { outcome: 'reset', check: KEY, capS: 60, previousCapS: 200, message: `The ceiling of check ${KEY} is back to 60 s (it was 200 s). Mention it in your reply.` })
    assert.equal((await call(raise(120), { minutes: 5 })).code, 'not_held', 'after a reset the old stops do not count')
    const lines = (await limitLines()).length
    assert.deepEqual(await call({ check: KEY, action: 'reset' }, { minutes: 6 }), { outcome: 'noop', check: KEY, capS: 60, previousCapS: 60, message: `Check ${KEY} has no raised ceiling; nothing was written.` })
    assert.equal((await limitLines()).length, lines)
  })
})

test('a stop at the ceiling counts for seven days, and only at the ceiling in force (N9)', () => {
  const eightDays = -8 * 24 * 60
  assert.equal(heldForRaise([stop(eightDays, 60_000)], NONE, KEY, NOW), false, 'a stop a week and a day ago')
  assert.equal(heldForRaise([stop(-6 * 24 * 60, 60_000)], NONE, KEY, NOW), true)
  assert.equal(heldForRaise([stop(-10, 30_000)], NONE, KEY, NOW), false, 'a stop under a limit lower than the ceiling')
  assert.equal(heldForRaise([value(-10, 60_000, 75_000)], NONE, KEY, NOW), true)
  assert.equal(heldForRaise([value(-20, 60_000, 75_000), value(-10, 15_000)], NONE, KEY, NOW), false, 'the latest value is what counts')
  assert.equal(CHECK_LIMIT_HELD_MS, 7 * 24 * 3600 * 1000)
})

test('limits.jsonl: a check\'s last line is its setting, a bad line is skipped, a file that cannot be read is no setting (P13-01)', async () => {
  const raised = { at: at(0), check: KEY, action: 'raise', capS: 120, previousCapS: 60, reason: REASON }
  const reset = { at: at(5), check: KEY, action: 'reset', capS: 60, previousCapS: 120, reason: '' }
  const other = { ...raised, check: 'tool-3/tsc', capS: 90 }
  const book = parseLimits([JSON.stringify(raised), '{"check":', JSON.stringify(other), ''].join('\n'))
  assert.deepEqual([book.lines.length, book.bad], [2, 1])
  assert.deepEqual(limitSetting(book, KEY), { capS: 120, at: at(0), reason: REASON }, 'a bad last line leaves the line before it')
  assert.equal(limitSetting(parseLimits([raised, reset].map(line => JSON.stringify(line)).join('\n')), KEY), undefined, 'a reset is no setting')
  assert.equal(limitSetting(book, 'tool-3/tsc')?.capS, 90, 'each check has its own')
  const home = await mkdtemp(join(tmpdir(), 'env-limit-read-'))
  try {
    assert.deepEqual(await readLimits(home), NONE, 'no file is no setting')
    await mkdir(join(home, 'env-checks', 'limits.jsonl'), { recursive: true })
    assert.ok('error' in await readLimits(home), 'a file that cannot be read says why')
  }
  finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('held at its ceiling: the main agent\'s line word for word, from the estimate or the runs, and its key is one check_limit takes (N10, N16)', async () => {
  const fromEstimate = heldAtCeiling([value(-10, 60_000, 75_000)], NONE, { key: KEY, name: 'eslint', argv: ARGV, estimateS: 25 }, NOW)
  assert.ok(fromEstimate !== undefined)
  const line = heldSentence(fromEstimate)
  assert.equal(line, 'Check eslint is held at its ceiling of 60 s: three times your estimate (25 s) would be 75 s. Raising this check\'s ceiling is your decision and needs no approval from the human: call check_limit with check "tool-3/eslint", seconds (61 to 600) and a reason. Making the check cheaper or narrower means changing its check line, which is a tool-node change and needs the human\'s approval as usual.')
  assert.ok(!/without asking|no need to ask/i.test(line), 'nothing says the check line may change without the human')
  const run = (ms: number): TimingLine => ({ kind: 'run', at: at(-5), check: KEY, argv: ARGV, ms })
  const harness: TimingLine = { kind: 'value', at: at(-4), check: KEY, argv: ARGV, limitMs: 60_000, cap: { by: 'default' }, capped: { wantedMs: 72_000 }, source: { by: 'harness', runs: [24_000], factor: 3, floorMs: 5_000 } }
  const fromRuns = heldAtCeiling([run(24_000), harness], NONE, { key: KEY, name: 'eslint', argv: ARGV, estimateS: 25 }, NOW)
  assert.ok(fromRuns !== undefined)
  assert.ok(heldSentence(fromRuns).startsWith('Check eslint is held at its ceiling of 60 s: three times its slowest recent run (24 s) would be 72 s. '), heldSentence(fromRuns))
  assert.equal(heldAtCeiling([value(-10, 15_000)], NONE, { key: KEY, name: 'eslint', argv: ARGV, estimateS: 5 }, NOW), undefined, 'a value under the ceiling is not held')
  const afterRaise = parseLimits(JSON.stringify({ at: at(-1), check: KEY, action: 'raise', capS: 120, previousCapS: 60, reason: REASON }))
  assert.equal(heldAtCeiling([value(-10, 60_000, 75_000)], afterRaise, { key: KEY, name: 'eslint', argv: ARGV, estimateS: 25 }, NOW), undefined, 'a raise takes the line away at once')
  // Two tool nodes, each with a check called lint: two keys, and each one the tool takes as written.
  const keys = ['tool-1/lint', 'tool-2/lint']
  const lines = keys.map(key => heldSentence(heldAtCeiling([value(-10, 60_000, 75_000, key)], NONE, { key, name: 'lint', argv: ARGV, estimateS: 25 }, NOW) ?? assert.fail(key)))
  assert.notEqual(lines[0], lines[1])
  await withHome(keys.map(key => value(-10, 60_000, 75_000, key)), async ({ call }) => {
    for (const text of lines) {
      const check = /call check_limit with check "([^"]+)"/.exec(text)?.[1]
      assert.equal((await call({ check, seconds: 120, reason: REASON }, { checks: () => Promise.resolve(keys) })).outcome, 'raised', text)
    }
  })
})

test('the description and its example: the example passes the parameter checks, in plain words and with no word of the exercises (F12, F20)', async () => {
  assert.equal(CHECK_LIMIT_DESCRIPTION, 'Raise or reset the time limit of one check that runs after your edits, when that check is held at its ceiling (the environment notice tells you when). Pass the check as <tool node id>/<check name>, the new limit in seconds (61 to 600) and why. The reason is shown to the human on the loop board and in the morning report, so write it in the human\'s language and in plain words. It works only on a check that is held at its current ceiling now, or was stopped at it within the last 7 days. A subagent cannot call it. To undo it, call it again with action "reset". Example: check_limit {"check": "tool-3/eslint", "seconds": 120, "reason": "整个项目跑带类型信息的规则，在这台机器上要 40 秒左右"}')
  assert.deepEqual(plainWordsIn(CHECK_LIMIT_EXAMPLE.reason), [])
  // The exercises' domains (tests/calibration): CSV quoting, durations, an expense log.
  const exercises = readdirSync(join(import.meta.dirname, 'calibration'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  assert.ok(exercises.length > 0)
  for (const word of ['csv', 'quote', 'duration', 'expense', '记账', '引号', '时长', '花了']) assert.ok(!CHECK_LIMIT_EXAMPLE.reason.toLowerCase().includes(word), word)
  await withHome([value(-10, 60_000, 75_000)], async ({ call }) => {
    assert.equal((await call({ ...CHECK_LIMIT_EXAMPLE })).outcome, 'raised', 'the example is a call the tool takes')
  })
})

test('raised checks share one process slot: a second one keeps its place, a check with the default ceiling behind it starts (N17 ③)', async () => {
  assert.deepEqual([CHECK_SLOTS, CHECK_RAISED_SLOTS, CHECK_TIMEOUT_CAP_MS], [2, 1, 60_000])
  const slots = createCheckSlots(CHECK_SLOTS, Date.now, CHECK_RAISED_SLOTS)
  const stuck = (): Promise<ScriptResult> => new Promise<ScriptResult>(() => {})
  let release: (result: ScriptResult) => void = () => {}
  const first = slots.enter(stuck, 60_000, true)
  const second = slots.enter(stuck, 60_000, true)
  const plain = slots.enter(() => new Promise<ScriptResult>(resolve => { release = resolve }), 60_000)
  assert.deepEqual([first.started(), second.started(), plain.started(), slots.running()], [true, false, true, 2], 'the second raised check waits; the plain one behind it does not')
  release({ kind: 'exited', exitCode: 0, stdout: '', stderr: '', durationMs: 1, truncated: false })
  await plain.done
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual([second.started(), slots.running()], [false, 1], 'a free slot is not the raised slot')
  const next = slots.enter(stuck, 60_000)
  assert.equal(next.started(), true, 'the next plain check starts at once')
})
