/**
 * `checkCall` and the rules command line (docs/ORCHESTRATION.md §16.10;
 * design §9.4, §10.5, §15 R3): a hypothetical call is judged against a
 * project's rules by the same `gateEvents`, `judgeInput` and `judge` the
 * tool-call gate uses, with the signals taken from the caller or from the
 * heartbeat of a live host. Nothing is written to the project. Real files in a
 * temporary git project; the clock is injected; the heartbeats are files in
 * the form the host will write.
 *
 * No process is started by the library: a rule with a script is judged as one
 * whose script is not approved (nothing can approve one yet).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { builtinRulesFor, GLM_PEAK_REDUCE } from '../src/rules/builtin.ts'
import { checkCall, HOST_SIGNALS, RulesCheckError, type CheckOptions, type CheckResult } from '../src/rules/check.ts'
import { runCli } from '../src/rules/cli.ts'
import { conditionPhrase, denialText } from '../src/rules/denial.ts'
import { gateEvents } from '../src/rules/events.ts'
import { HEARTBEAT_FRESH_MS, hostPeak, liveHeartbeats, type HostHeartbeat } from '../src/rules/heartbeat.ts'
import { judge, judgeInput } from '../src/rules/judge.ts'
import type { RulesMetricEvent } from '../src/rules/metrics.ts'
import { repoJson, type RepoRules } from '../src/rules/model.ts'
import { showText } from '../src/rules/show.ts'
import { GLM_MODEL, ruleOf, scriptRef } from './rules-fixtures.ts'
import { clockedTest, treeOf, writeHeartbeat, type ClockedProject } from './rules-helpers.ts'

/** Wednesday 15:00 in UTC+8, inside GLM's peak hours. */
const START = '2026-11-04T07:00:00.000Z'
const NOW = Date.parse(START)
const HOST_A = { pid: 4100, startedAt: 1_000 }
const HOST_B = { pid: 4200, startedAt: 2_000 }
const NO_HOST = '没有活的宿主，命令行读不到计价服务'
const NO_PRICING = '没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）'

const DEPLOY = { tool: 'pwsh', args: { command: 'npm run deploy' } }

/** A queue rule on `glm-peak is true` with no subject, acting on the command text. */
const PEAK_QUEUE = ruleOf({
  id: 'r-peak-queue',
  title: 'Hold deploys in the GLM peak',
  filter: { command: { matches: 'deploy' } },
  condition: { signal: 'glm-peak', is: true },
  action: { kind: 'queue' },
})

/** A file that decides nothing about the peak level or the rules, so the project never chose a level. */
const SWITCH_ONLY: RepoRules = { version: 2, signals: { 'code-freeze': { type: { kind: 'boolean' } } } }

/** `YYYY-MM-DD HH:MM` on the wall clock of this machine, by another route than the code takes (the Swedish format is year-first and 24-hour). */
const localMinute = (iso: string): string => new Date(iso).toLocaleString('sv-SE').slice(0, 16)
const localHm = (iso: string): string => localMinute(iso).slice(11)
const isoAt = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString()

/** The project starts from a rules file, as a clone does. */
async function startFrom(project: ClockedProject, file: RepoRules): Promise<void> {
  await mkdir(project.paths.rulesDir, { recursive: true })
  await writeFile(project.paths.rulesFile, repoJson(file))
  assert.notEqual(await project.board.settle(), 'busy')
}

/** A host's heartbeat, written `ageMs` before the moment of the check, with its reading of the GLM peak. */
async function beat(project: ClockedProject, host: { readonly pid: number, readonly startedAt: number }, ageMs: number, glmPeak: HostHeartbeat['computed']['glmPeak']): Promise<void> {
  await writeHeartbeat(project.paths, host, isoAt(-ageMs), { computed: { glmPeak }, catalog: [] })
}

interface Ran {
  readonly result: CheckResult
  readonly events: readonly RulesMetricEvent[]
}

/** One `checkCall` on the clock of the test, with the metrics exit recording what it is given. */
async function run(project: ClockedProject, call: { readonly tool: string, readonly args: unknown } = DEPLOY, over: Partial<CheckOptions> = {}): Promise<Ran> {
  const events: RulesMetricEvent[] = []
  const result = await checkCall(call, { project: project.root, now: NOW, metrics: (event) => { events.push(event) }, ...over })
  return { result, events }
}

/** Signals as a caller of JavaScript may give them: any name, any value; `checkCall` says which are wrong. */
const signalsOf = (values: Record<string, unknown>): CheckOptions['signals'] => values

async function usageError(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(() => undefined, (caught: unknown) => caught)
  assert.ok(error instanceof RulesCheckError, `a usage error, got ${String(error)}`)
  assert.equal(error.code, 'usage')
  return error.message
}

const reading = (result: CheckResult, name: string): CheckResult['signals'][number] => {
  const found = result.signals.find(signal => signal.name === name)
  assert.ok(found, `the result reads ${name}`)
  return found
}

// ------------------------------------------------------- the host's heartbeats

function heartbeatOf(pid: number, at: string, glmPeak: HostHeartbeat['computed']['glmPeak']): HostHeartbeat {
  return { host: { pid, startedAt: 1 }, at, sessions: [], runner: false, computed: { glmPeak }, catalog: [] }
}

test('liveHeartbeats keeps what was written within 45 seconds and lists the newest first', () => {
  assert.equal(HEARTBEAT_FRESH_MS, 45_000)
  const heartbeats = [
    heartbeatOf(1, isoAt(-20_000), { value: true }),
    heartbeatOf(2, isoAt(-45_000), { value: true }),
    heartbeatOf(3, isoAt(-45_001), { value: true }),
    heartbeatOf(4, isoAt(-5_000), { value: false }),
    heartbeatOf(5, 'not a time', { value: true }),
  ]
  assert.deepEqual(liveHeartbeats(heartbeats, NOW).map(heartbeat => heartbeat.host.pid), [4, 1, 2])
  assert.deepEqual(liveHeartbeats([], NOW), [])
})

test('hostPeak takes the first reading that has a value, newest first, and turns it over once its next change has passed', () => {
  const unknown = { unknown: NO_PRICING }
  assert.deepEqual(hostPeak([], NOW), { unknown: NO_HOST })
  assert.deepEqual(hostPeak([heartbeatOf(7, isoAt(-1_000), unknown), heartbeatOf(8, isoAt(-2_000), unknown)], NOW), { unknown: NO_PRICING, host: 7 })
  assert.deepEqual(hostPeak([heartbeatOf(7, isoAt(-1_000), unknown), heartbeatOf(8, isoAt(-2_000), { value: true })], NOW), { value: true, host: 8 })
  const until = isoAt(3_600_000)
  assert.deepEqual(hostPeak([heartbeatOf(9, isoAt(-1_000), { value: true, nextChangeAt: until })], NOW), { value: true, host: 9, until })
  assert.deepEqual(hostPeak([heartbeatOf(9, isoAt(-1_000), { value: true, nextChangeAt: isoAt(-1) })], NOW), { value: false, host: 9 })
  assert.deepEqual(hostPeak([heartbeatOf(9, isoAt(-1_000), { value: false, nextChangeAt: isoAt(0) })], NOW), { value: true, host: 9 })
  assert.deepEqual(hostPeak([heartbeatOf(9, isoAt(-1_000), { value: true, nextChangeAt: 'someday' })], NOW), { value: true, host: 9 })
})

// ------------------------------------------------------ where glm-peak comes from

clockedTest('a heartbeat written within 45 seconds supplies glm-peak, and the result names the host', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_A, 30_000, { value: true })
  const { result } = await run(project)
  assert.equal(result.effect, 'queue')
  assert.equal(result.exitCode, 5)
  const peak = reading(result, 'glm-peak')
  assert.deepEqual([peak.source, peak.host, peak.value], ['heartbeat', HOST_A.pid, true])
  assert.deepEqual(result.rules.map(rule => [rule.id, rule.effect, rule.when]), [['r-peak-queue', 'queue', 'true']])
}, { start: START })

clockedTest('a heartbeat older than 45 seconds is no host: glm-peak cannot be read and the call goes through', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_A, 46_000, { value: true })
  const { result } = await run(project)
  assert.equal(result.effect, 'allow')
  assert.equal(result.exitCode, 0)
  assert.equal(result.text, undefined)
  const peak = reading(result, 'glm-peak')
  assert.deepEqual([peak.source, peak.value, peak.unknown], ['none', undefined, NO_HOST])
  assert.deepEqual(result.rules.map(rule => [rule.id, rule.when]), [['r-peak-queue', 'unknown']])
}, { start: START })

clockedTest('with two live heartbeats and the newer one unable to read, the one that has a value is used', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_B, 5_000, { unknown: NO_PRICING })
  await beat(project, HOST_A, 20_000, { value: true })
  const { result } = await run(project)
  assert.equal(result.exitCode, 5)
  const peak = reading(result, 'glm-peak')
  assert.deepEqual([peak.source, peak.host, peak.value], ['heartbeat', HOST_A.pid, true])
}, { start: START })

clockedTest('when no live heartbeat can read it, the reason is the newest one\'s', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_B, 5_000, { unknown: NO_PRICING })
  await beat(project, HOST_A, 20_000, { unknown: 'older reason' })
  const { result } = await run(project)
  assert.equal(result.exitCode, 0)
  const peak = reading(result, 'glm-peak')
  assert.deepEqual([peak.source, peak.host, peak.value, peak.unknown], ['heartbeat', HOST_B.pid, undefined, NO_PRICING])
}, { start: START })

clockedTest('a next change that has already passed turns the host\'s reading over', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_A, 10_000, { value: true, nextChangeAt: isoAt(-1_000) })
  const { result } = await run(project)
  assert.equal(result.effect, 'allow')
  assert.equal(reading(result, 'glm-peak').value, false)
  assert.equal(reading(result, 'glm-peak').host, HOST_A.pid)
}, { start: START })

clockedTest('a value from the caller is used without a heartbeat, and it goes over a heartbeat that says otherwise', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  const given = await run(project, DEPLOY, { signals: { 'glm-peak': true } })
  assert.equal(given.result.exitCode, 5)
  assert.deepEqual([reading(given.result, 'glm-peak').source, reading(given.result, 'glm-peak').host], ['caller', undefined])
  await beat(project, HOST_A, 10_000, { value: true })
  const over = await run(project, DEPLOY, { signals: { 'glm-peak': false } })
  assert.equal(over.result.effect, 'allow')
  assert.equal(over.result.exitCode, 0)
  assert.deepEqual([reading(over.result, 'glm-peak').source, reading(over.result, 'glm-peak').value], ['caller', false])
}, { start: START })

clockedTest('a heartbeat file that cannot be read is left out and said so', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_A, 10_000, { value: true })
  await writeFile(join(project.paths.runtimeDir, 'hosts', '9-9.json'), '{ not json')
  await writeFile(join(project.paths.runtimeDir, 'hosts', '8-8.json.tmp'), '{ half written')
  const { result } = await run(project)
  assert.equal(result.exitCode, 5)
  assert.ok(result.notes.some(note => note.includes('9-9.json')), result.notes.join(' | '))
  assert.ok(!result.notes.some(note => note.includes('8-8')), 'a temporary file is not a heartbeat')
}, { start: START })

// ---------------------------------------------------------------- usage errors

clockedTest('an option that does not fit is a usage error that says which one and why', async (project) => {
  await startFrom(project, { version: 2, signals: { 'code-freeze': { type: { kind: 'boolean' } } } })
  assert.deepEqual(HOST_SIGNALS, ['glm-peak'])
  const stateSignal = await usageError(run(project, DEPLOY, { signals: signalsOf({ 'code-freeze': true }) }))
  const unknownSignal = await usageError(run(project, DEPLOY, { signals: signalsOf({ foo: 1 }) }))
  assert.match(stateSignal, /code-freeze 存在项目状态里，命令行不能给它值/)
  assert.match(stateSignal, /\/rules on/)
  assert.match(unknownSignal, /foo.*没有这个宿主信号/)
  assert.notEqual(stateSignal, unknownSignal)
  assert.match(await usageError(run(project, DEPLOY, { signals: signalsOf({ constructor: true }) })), /constructor.*没有这个宿主信号/, 'a name every object inherits is not a signal of the project')
  assert.match(await usageError(run(project, DEPLOY, { signals: signalsOf({ 'glm-peak': 'yes' }) })), /glm-peak.*true.*false/)
  assert.match(await usageError(run(project, { tool: '', args: {} })), /tool/)
  assert.match(await usageError(run(project, { tool: 'x'.repeat(65), args: {} })), /tool/)
  assert.match(await usageError(run(project, DEPLOY, { role: 'janitor' as never })), /role/)
  assert.match(await usageError(run(project, DEPLOY, { stage: 'dreaming' })), /stage/)
  assert.match(await usageError(run(project, DEPLOY, { model: 'deepseek' })), /model/)
  assert.match(await usageError(run(project, DEPLOY, { model: '/chat' })), /model/)
  assert.match(await usageError(run(project, DEPLOY, { session: '' })), /session/)
  assert.match(await usageError(run(project, DEPLOY, { session: 's'.repeat(129) })), /session/)
  assert.match(await usageError(run(project, DEPLOY, { glmSpend: 'plenty' as never })), /glm-spend/)
  assert.match(await usageError(run(project, DEPLOY, { waitedMs: -1 })), /waited-ms/)
  assert.match(await usageError(run(project, DEPLOY, { waitedMs: 1.5 })), /waited-ms/)
  assert.match(await usageError(run(project, DEPLOY, { peakUntil: isoAt(3_600_000) })), /peak-until/)
  assert.match(await usageError(run(project, DEPLOY, { signals: { 'glm-peak': true }, peakUntil: 'six o\'clock' })), /peak-until/)
  const ran = await run(project, DEPLOY, { signals: { 'glm-peak': true }, peakUntil: isoAt(3_600_000), waitedMs: 0 })
  assert.equal(ran.events.length, 1)
}, { start: START })

clockedTest('a usage error judges nothing and sends no event', async (project) => {
  const events: RulesMetricEvent[] = []
  await assert.rejects(checkCall(DEPLOY, { project: project.root, now: NOW, role: 'janitor' as never, metrics: (event) => { events.push(event) } }), RulesCheckError)
  assert.deepEqual(events, [])
}, { start: START })

// ---------------------------------------------------- who and what the call is

clockedTest('a rule about who acts does not apply to a call that does not say who, and the result says why', async (project) => {
  const subagentOnly = ruleOf({ id: 'r-subagent-block', title: 'No deploys by subagents', filter: { role: { in: ['subagent'] } }, action: { kind: 'block' } })
  await startFrom(project, { version: 2, rules: { 'r-subagent-block': subagentOnly } })
  const unsaid = await run(project)
  assert.equal(unsaid.result.effect, 'allow')
  assert.equal(unsaid.result.exitCode, 0)
  assert.equal(unsaid.result.subjects.length, 1)
  assert.deepEqual([unsaid.result.subjects[0]?.rule, unsaid.result.subjects[0]?.item], ['r-subagent-block', 'role'])
  assert.match(unsaid.result.subjects[0]?.unknown ?? '', /role/)
  const said = await run(project, DEPLOY, { role: 'subagent' })
  assert.equal(said.result.effect, 'block')
  assert.equal(said.result.exitCode, 4)
  assert.deepEqual(said.result.subjects, [])
  const other = await run(project, DEPLOY, { role: 'root' })
  assert.equal(other.result.exitCode, 0)
}, { start: START })

clockedTest('a rule about the stage follows its failure setting when no stage is given, and judges the stage when it is', async (project) => {
  const skip = ruleOf({ id: 'r-design-skip', title: 'Nothing in design', condition: { stage: ['design'] }, action: { kind: 'block' } })
  const apply = ruleOf({ id: 'r-design-apply', title: 'Nothing in design, whatever the stage', condition: { stage: ['design'] }, onUnknown: 'apply', action: { kind: 'queue' } })
  await startFrom(project, { version: 2, rules: { 'r-design-skip': skip, 'r-design-apply': apply } })
  const none = await run(project)
  assert.equal(none.result.effect, 'queue', 'only the rule that applies when it cannot be read')
  assert.deepEqual(none.result.rules.map(rule => [rule.id, rule.when]), [['r-design-apply', 'unknown'], ['r-design-skip', 'unknown']])
  const design = await run(project, DEPLOY, { stage: 'design' })
  assert.equal(design.result.effect, 'block')
  assert.equal(design.result.exitCode, 4)
  const execute = await run(project, DEPLOY, { stage: 'execute' })
  assert.equal(execute.result.effect, 'allow')
  assert.deepEqual(execute.result.rules.map(rule => rule.when), ['false', 'false'])
}, { start: START })

clockedTest('a rule on what a call writes judges the file tools and the redirections of a shell command', async (project) => {
  const readOnly = ruleOf({ id: 'r-docs-readonly', title: 'The docs are read only', filter: { writes: { paths: ['docs/'] } }, action: { kind: 'block' } })
  await startFrom(project, { version: 2, rules: { 'r-docs-readonly': readOnly } })
  const edit = await run(project, { tool: 'edit', args: { file_path: 'docs/readme.md', old_string: 'a', new_string: 'b' } })
  assert.equal(edit.result.exitCode, 4)
  assert.match(edit.result.text ?? '', /^You tried to write "docs\/readme\.md"\./)
  assert.equal((await run(project, { tool: 'edit', args: { file_path: 'src/readme.md' } })).result.exitCode, 0)
  assert.equal((await run(project, { tool: 'write', args: { file_path: join(project.root, 'docs', 'a.md'), content: '' } })).result.exitCode, 4)
  assert.equal((await run(project, { tool: 'str_replace_editor', args: { command: 'view', path: 'docs/a.md' } })).result.exitCode, 0)
  assert.equal((await run(project, { tool: 'str_replace_editor', args: { command: 'create', path: 'docs/a.md' } })).result.exitCode, 4)
  assert.equal((await run(project, { tool: 'pwsh', args: { command: 'echo hi > docs/out.txt' } })).result.exitCode, 4)
  assert.equal((await run(project, { tool: 'pwsh', args: { command: 'cat docs/out.txt' } })).result.exitCode, 0)
}, { start: START })

// -------------------------------------------------- the gate and checkCall agree

clockedTest('the gate\'s way of judging and checkCall give the same verdict, and the same words for a block', async (project) => {
  const freeze = ruleOf({ id: 'r-freeze', title: 'No deploy during the freeze', filter: { command: { matches: 'deploy' } }, condition: { signal: 'code-freeze', is: true }, action: { kind: 'block' } })
  const hold = ruleOf({ id: 'r-hold', title: 'Hold deploys in the peak', filter: { command: { matches: 'deploy' } }, condition: { signal: 'glm-peak', is: true }, action: { kind: 'queue' } })
  await startFrom(project, { version: 2, rules: { 'r-freeze': freeze, 'r-hold': hold }, signals: { 'code-freeze': { type: { kind: 'boolean' } } } })
  assert.ok((await project.board.apply('human', { op: 'signal-manual', name: 'code-freeze', value: true })).ok)
  const call = { at: START, project: project.root, tool: 'pwsh', command: 'npm run deploy', args: DEPLOY.args, role: 'root' as const, model: GLM_MODEL, session: 's-1' }
  for (const peak of [true, false]) {
    const gateInput = judgeInput({
      now: new Date(NOW),
      project: project.root,
      events: gateEvents(call),
      signals: [
        { name: 'glm-peak', source: 'clock', value: peak },
        { name: 'code-freeze', source: 'manual', value: true },
      ],
    })
    const gate = judge(gateInput, [freeze, hold, ...builtinRulesFor('reduce')])
    const { result } = await run(project, DEPLOY, { role: 'root', model: GLM_MODEL, session: 's-1', signals: { 'glm-peak': peak } })
    assert.equal(result.effect, gate.effect)
    assert.deepEqual(result.rules.map(rule => [rule.id, rule.when]), gate.evaluated.map(rule => [rule.rule, rule.when]))
    const strongest = gate.strongest.map(hit => ({ hit, rule: hit.rule === 'r-freeze' ? freeze : hold }))
    const words = denialText({ attempt: 'You tried to run "npm run deploy".', effect: 'block', rules: strongest, peak: { level: 'reduce', origin: 'default' } })
    assert.equal(result.text, words, 'the same text from the same hits')
  }
}, { start: START })

clockedTest('a queue by checkCall reads as the gate\'s with the ticket sentences swapped for the ones that need no ticket', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  const { result } = await run(project, DEPLOY, { signals: { 'glm-peak': true } })
  const hit = { rule: 'r-peak-queue', title: PEAK_QUEUE.title, effect: 'queue' as const }
  const gateText = denialText({ attempt: 'You tried to run "npm run deploy".', effect: 'queue', rules: [{ hit, rule: PEAK_QUEUE }], ticket: 'q-12', peak: { level: 'reduce', origin: 'default' } })
  assert.match(gateText, /^You tried to run "npm run deploy"\.\nBoundary: Deferred as ticket q-12\. Rule r-peak-queue "Hold deploys in the GLM peak" \(set by the human at /)
  assert.match(gateText, /Right path: The call did not run\. Continue with other planned work; the harness sends you a message when q-12 clears, then run the same call again\. Running it again before that returns this message and does not queue it twice\./)
  assert.match(gateText, /Exception: The human can let it through once \(\/rules let q-12\), or change the rule\.$/)
  const asCheck = gateText
    .replace('Deferred as ticket q-12.', 'Would be deferred; the command line opens no ticket.')
    .replace('the harness sends you a message when q-12 clears, then run the same call again.', 'Run it again when the condition no longer holds.')
    .replace('The human can let it through once (/rules let q-12), or change the rule.', 'The human can change the rule.')
  assert.equal(result.text, asCheck)
  assert.match(result.text ?? '', /defers it while glm-peak is on\./)
}, { start: START })

// ------------------------------------------- the end of the peak (M6 design §7.2)

const PEAK_UNTIL = '2026-11-04T10:00:00.000Z'
const untilWords = (iso: string): RegExp => new RegExp(`defers it while glm-peak is true until ${localHm(iso)}\\.`)

clockedTest('a queue on glm-peak true says until when the peak lasts, from the peakUntil the caller gives or from the heartbeat of a live host', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  const given = await run(project, DEPLOY, { signals: { 'glm-peak': true }, peakUntil: PEAK_UNTIL })
  assert.equal(given.result.exitCode, 5)
  assert.match(given.result.text ?? '', untilWords(PEAK_UNTIL))
  await beat(project, HOST_A, 5_000, { value: true, nextChangeAt: PEAK_UNTIL })
  const heard = await run(project)
  assert.equal(heard.result.exitCode, 5)
  assert.match(heard.result.text ?? '', untilWords(PEAK_UNTIL))
}, { start: START })

clockedTest('a block on glm-peak true says until when the peak lasts', async (project) => {
  const block = ruleOf({ id: 'r-peak-block', title: 'No deploy in the GLM peak', filter: { command: { matches: 'deploy' } }, condition: { signal: 'glm-peak', is: true }, action: { kind: 'block' } })
  await startFrom(project, { version: 2, rules: { 'r-peak-block': block } })
  const { result } = await run(project, DEPLOY, { signals: { 'glm-peak': true }, peakUntil: PEAK_UNTIL })
  assert.equal(result.exitCode, 4)
  assert.match(result.text ?? '', new RegExp(`blocks it now: glm-peak is true until ${localHm(PEAK_UNTIL)}\\.`))
}, { start: START })

clockedTest('glm-peak true inside all says until when, beside the other items as they are', async (project) => {
  const both = ruleOf({ id: 'r-peak-freeze', title: 'Hold deploys in the peak of a freeze', filter: { command: { matches: 'deploy' } }, condition: { all: [{ signal: 'glm-peak', is: true }, { signal: 'code-freeze', is: true }] }, action: { kind: 'queue' } })
  await startFrom(project, { version: 2, rules: { 'r-peak-freeze': both }, signals: { 'code-freeze': { type: { kind: 'boolean' } } } })
  assert.ok((await project.board.apply('human', { op: 'signal-manual', name: 'code-freeze', value: true })).ok)
  const { result } = await run(project, DEPLOY, { signals: { 'glm-peak': true }, peakUntil: PEAK_UNTIL })
  assert.equal(result.exitCode, 5)
  assert.ok((result.text ?? '').includes(`defers it while (glm-peak is true until ${localHm(PEAK_UNTIL)}) and (code-freeze is on).`), result.text)
}, { start: START })

clockedTest('when glm-peak cannot be read the words have no time in them', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': { ...PEAK_QUEUE, onUnknown: 'apply' } } })
  const { result } = await run(project)
  assert.equal(result.exitCode, 5)
  assert.match(result.text ?? '', /defers it while glm-peak is on\./)
  assert.doesNotMatch(result.text ?? '', /glm-peak is true until/)
}, { start: START })

test('conditionPhrase writes the end of the peak only for glm-peak true outside a not', () => {
  assert.equal(conditionPhrase({ signal: 'glm-peak', is: true }, PEAK_UNTIL), `glm-peak is true until ${localHm(PEAK_UNTIL)}`)
  assert.equal(conditionPhrase({ signal: 'glm-peak', is: true }), 'glm-peak is on')
  assert.equal(conditionPhrase({ signal: 'glm-peak', is: false }, PEAK_UNTIL), 'glm-peak is off')
  assert.equal(conditionPhrase({ not: { signal: 'glm-peak', is: true } }, PEAK_UNTIL), 'it is not so that glm-peak is on')
  assert.equal(conditionPhrase({ signal: 'code-freeze', is: true }, PEAK_UNTIL), 'code-freeze is on')
  assert.equal(conditionPhrase({ any: [{ signal: 'glm-peak', is: true }, { signal: 'code-freeze', is: true }] }, PEAK_UNTIL), `(glm-peak is true until ${localHm(PEAK_UNTIL)}) or (code-freeze is on)`)
})

clockedTest('a block says what was tried, which rule, who set it, and how to change it', async (project) => {
  const rule = ruleOf({ id: 'r-no-push', title: 'No push at night', filter: { command: { matches: '^git push' } }, condition: { not: { clock: { from: '09:00', to: '21:00', tz: '+08:00' } } }, action: { kind: 'block' }, origin: { actor: 'human', at: '2026-11-01T01:05:00.000Z' } })
  await startFrom(project, { version: 2, rules: { 'r-no-push': rule } })
  const { result } = await run(project, { tool: 'pwsh', args: { command: 'git push origin main' } }, { now: Date.parse('2026-11-04T14:00:00.000Z') })
  assert.equal(result.exitCode, 4)
  const lines = (result.text ?? '').split('\n')
  assert.equal(lines.length, 4)
  assert.equal(lines[0], 'You tried to run "git push origin main".')
  assert.equal(lines[1], `Boundary: Rule r-no-push "No push at night" (set by the human at ${localMinute('2026-11-01T01:05:00.000Z')}, until lifted) blocks it now: the clock is outside 09:00-21:00 +08:00.`)
  assert.match(lines[2] ?? '', /^Right path: /)
  assert.equal(lines[3], 'Exception: Only the human can change or lift rules (/rules lift r-no-push). If the task really needs this now, tell the human what you need and why; you may propose a change with rules_propose, and it takes effect only when the human agrees.')
}, { start: START })

clockedTest('when several rules are the strongest, every one is listed, by id', async (project) => {
  const b = ruleOf({ id: 'r-b', title: 'Second', filter: { command: { matches: 'deploy' } }, action: { kind: 'block' } })
  const a = ruleOf({ id: 'r-a', title: 'First', filter: { command: { matches: 'deploy' } }, action: { kind: 'block' } })
  const q = ruleOf({ id: 'r-q', title: 'Weaker', filter: { command: { matches: 'deploy' } }, action: { kind: 'queue' } })
  await startFrom(project, { version: 2, rules: { 'r-a': a, 'r-b': b, 'r-q': q } })
  const { result } = await run(project)
  const boundary = (result.text ?? '').split('\n')[1] ?? ''
  assert.ok(boundary.indexOf('r-a') > 0 && boundary.indexOf('r-a') < boundary.indexOf('r-b'), boundary)
  assert.ok(!boundary.includes('r-q'), boundary)
  assert.ok((result.text ?? '').includes('/rules lift r-a'))
  assert.ok((result.text ?? '').includes('/rules lift r-b'))
}, { start: START })

// ------------------------------------------------------------------ peak mode

clockedTest('the stop level queues a script that reports GLM spending, necessary or not; reduce queues only the one that could wait', async (project) => {
  assert.ok((await project.board.apply('human', { op: 'peak-mode-set', level: 'stop' })).ok)
  const peak = { signals: { 'glm-peak': true } }
  assert.equal((await run(project, DEPLOY, { ...peak, glmSpend: 'necessary' })).result.exitCode, 5)
  assert.equal((await run(project, DEPLOY, { ...peak, glmSpend: 'optional' })).result.exitCode, 5)
  assert.equal((await run(project, DEPLOY, { ...peak })).result.exitCode, 0, 'a script that reports nothing is not touched')
  assert.ok((await project.board.apply('human', { op: 'peak-mode-set', level: 'reduce' })).ok)
  assert.equal((await run(project, DEPLOY, { ...peak, glmSpend: 'necessary' })).result.exitCode, 0)
  assert.equal((await run(project, DEPLOY, { ...peak, glmSpend: 'optional' })).result.exitCode, 5)
  assert.equal((await run(project, DEPLOY, { signals: { 'glm-peak': false }, glmSpend: 'optional' })).result.exitCode, 0, 'outside the peak nothing is deferred')
  assert.ok((await project.board.apply('human', { op: 'peak-mode-set', level: 'inform' })).ok)
  assert.equal((await run(project, DEPLOY, { ...peak, glmSpend: 'optional' })).result.exitCode, 0)
}, { start: START })

for (const where of ['no state directory at all', 'a state that never chose a level']) {
  clockedTest(`a project with ${where} is judged at the default level: reduce, as the factory leaves it`, async (project) => {
    if (where !== 'no state directory at all') await startFrom(project, SWITCH_ONLY)
    const until = isoAt(3 * 3_600_000)
    const given = await run(project, DEPLOY, { signals: { 'glm-peak': true }, glmSpend: 'optional', peakUntil: until })
    assert.equal(given.result.exitCode, 5)
    assert.equal(given.result.peakMode, 'reduce')
    const lines = (given.result.text ?? '').split('\n')
    assert.equal(lines[0], 'You tried to run "npm run deploy".')
    assert.ok(lines[1]?.startsWith('Boundary: Would be deferred; the command line opens no ticket. '), lines[1])
    assert.ok(lines[1]?.includes(`GLM peak hours now until ${localHm(until)}. Peak mode: reduce (the default; the human can change it). `), lines[1])
    assert.ok(lines[1]?.endsWith('Rule builtin:glm-peak-reduce defers scripts that report optional GLM spending until peak ends.'), lines[1])
    assert.equal(lines[2], `Right path: Run it again after ${localHm(until)}.`)
    assert.equal(lines[3], 'Exception: The human can change the peak mode (/rules peak).')
    const bare = await run(project, DEPLOY, { signals: { 'glm-peak': true }, glmSpend: 'optional' })
    const bareLines = (bare.result.text ?? '').split('\n')
    assert.ok(bareLines[1]?.includes('GLM peak hours now. Peak mode: reduce (the default; the human can change it). '), bareLines[1])
    assert.equal(bareLines[2], 'Right path: Run it again after peak ends.')
    const necessary = await run(project, DEPLOY, { signals: { 'glm-peak': true }, glmSpend: 'necessary' })
    assert.equal(necessary.result.exitCode, 0)
  }, { start: START })
}

clockedTest('the end of the peak comes from the host\'s next change when the caller gives none', async (project) => {
  const until = isoAt(2 * 3_600_000)
  await beat(project, HOST_A, 5_000, { value: true, nextChangeAt: until })
  const { result } = await run(project, DEPLOY, { glmSpend: 'optional' })
  assert.equal(result.exitCode, 5)
  assert.ok((result.text ?? '').includes(`GLM peak hours now until ${localHm(until)}.`))
  assert.ok((result.text ?? '').includes(`Right path: Run it again after ${localHm(until)}.`))
}, { start: START })

clockedTest('a level a person chose says when, and the stop level names its own entry', async (project) => {
  const chosen = await project.board.apply('human', { op: 'peak-mode-set', level: 'stop' })
  assert.ok(chosen.ok)
  const at = chosen.state.peakMode?.at
  assert.ok(at)
  const { result } = await run(project, DEPLOY, { signals: { 'glm-peak': true }, glmSpend: 'necessary' })
  assert.equal(result.exitCode, 5)
  assert.equal(result.peakMode, 'stop')
  assert.ok((result.text ?? '').includes(`Peak mode set by the human at ${localMinute(at)}: stop.`), result.text)
  assert.ok((result.text ?? '').includes('builtin:glm-peak-stop-scripts'))
  assert.ok((result.text ?? '').includes('defers scripts that report GLM spending until peak ends.'))
  const subagent = await run(project, DEPLOY, { signals: { 'glm-peak': true }, role: 'subagent', model: GLM_MODEL })
  assert.equal(subagent.result.exitCode, 5)
  assert.ok((subagent.result.text ?? '').includes('builtin:glm-peak-stop '))
}, { start: START })

// --------------------------------------------------------------- scripts, state

clockedTest('a rule with a script is judged as one whose script is not approved, and no process is started', async (project) => {
  const blocking = ruleOf({ id: 'r-script-block', title: 'Lint gate', action: { kind: 'script', script: scriptRef('r-script-block'), onError: 'block' } })
  const allowing = ruleOf({ id: 'r-script-allow', title: 'Advisory gate', action: { kind: 'script', script: scriptRef('r-script-allow'), onError: 'allow' } })
  await startFrom(project, { version: 2, rules: { 'r-script-block': blocking, 'r-script-allow': allowing }, scripts: { 'r-script-block': scriptRef('r-script-block'), 'r-script-allow': scriptRef('r-script-allow') } })
  const { result } = await run(project)
  assert.equal(result.effect, 'block')
  assert.equal(result.exitCode, 4)
  assert.deepEqual(result.scripts.map(script => [script.rule, script.outcome]), [['r-script-allow', 'refused'], ['r-script-block', 'refused']])
  assert.ok(result.notes.some(note => note.includes('r-script-block') && note.includes('not approved')), result.notes.join(' | '))
  assert.ok(result.notes.some(note => note.includes('r-script-allow') && note.includes('lets the call through')), result.notes.join(' | '))
  assert.match(result.text ?? '', /Rule r-script-block "Lint gate" \(set by the human at .*\) blocks it now\. The script of rule r-script-block is not approved on this machine, so it was not run\./)
  assert.deepEqual(result.rules.map(rule => [rule.id, rule.effect]), [['r-script-allow', 'script'], ['r-script-block', 'block']])
}, { start: START })

test('the library starts no process, and the check imports neither the write entry nor the lock', async () => {
  const dir = new URL('../src/rules/', import.meta.url)
  for (const name of (await readdir(dir)).filter(file => file.endsWith('.ts'))) {
    const text = await readFile(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /['"](?:node:)?child_process['"]/, `${name} must not start a process`)
  }
  const check = await readFile(new URL('check.ts', dir), 'utf8')
  assert.doesNotMatch(check, /from '\.\/engine\.ts'/)
  assert.doesNotMatch(check, /data\/lock\.ts/)
})

clockedTest('a snapshot that was zeroed is rebuilt from the journal in memory, and no byte of the project changes', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  assert.ok((await project.board.apply('human', { op: 'peak-mode-set', level: 'stop' })).ok)
  await beat(project, HOST_A, 5_000, { value: true })
  await writeFile(project.paths.state, '')
  const before = await treeOf(project.root)
  const { result } = await run(project)
  assert.equal(result.exitCode, 5, 'the rules came from the journal')
  assert.equal(result.peakMode, 'stop')
  assert.ok(result.notes.includes('状态要重建，已在内存里按变更记录重放，没有写文件'), result.notes.join(' | '))
  assert.deepEqual(await treeOf(project.root), before)
}, { start: START })

clockedTest('a project with no state directory is judged as empty and nothing is created', async (project) => {
  const before = await treeOf(project.root)
  const { result } = await run(project)
  assert.equal(result.effect, 'allow')
  assert.deepEqual(result.rules, [])
  assert.ok(result.notes.includes('这个项目还没有规则板的状态'), result.notes.join(' | '))
  assert.deepEqual(await treeOf(project.root), before)
  assert.deepEqual(before, {})
}, { start: START })

clockedTest('a rules file with no state of its own beside it is read in memory, not adopted', async (project) => {
  await mkdir(project.paths.rulesDir, { recursive: true })
  await writeFile(project.paths.rulesFile, repoJson({ version: 2, peakMode: { level: 'stop', at: '2026-11-01T00:00:00.000Z', origin: { actor: 'human' } }, rules: { 'r-peak-queue': PEAK_QUEUE } }))
  const before = await treeOf(project.root)
  const { result } = await run(project, DEPLOY, { signals: { 'glm-peak': true } })
  assert.equal(result.exitCode, 5)
  assert.equal(result.peakMode, 'stop')
  assert.ok(result.notes.some(note => note.includes('仓库里的规则文件') && note.includes('在内存里')), result.notes.join(' | '))
  assert.deepEqual(await treeOf(project.root), before)
}, { start: START })

clockedTest('a rules file changed from outside is not followed: the journal is, and the result says so', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await writeFile(project.paths.rulesFile, repoJson({ version: 2, signals: { 'code-freeze': { type: { kind: 'boolean' } } } }))
  const before = await treeOf(project.root)
  const { result } = await run(project, DEPLOY, { signals: { 'glm-peak': true } })
  assert.equal(result.exitCode, 5, 'the rule is still in force')
  assert.ok(result.notes.includes('仓库里的规则文件被规则板以外改过，按变更记录判'), result.notes.join(' | '))
  assert.deepEqual(await treeOf(project.root), before)
}, { start: START })

test('a directory that is not in a git repository is judged as having no rules, and said so', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rules-nowhere-'))
  try {
    const result = await checkCall(DEPLOY, { project: dir, now: NOW })
    assert.equal(result.effect, 'allow')
    assert.ok(result.notes.some(note => note.includes('不在 git 仓库里')), result.notes.join(' | '))
    assert.deepEqual(await readdir(dir), [], 'nothing is created in it')
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// --------------------------------------------------------------- the event

clockedTest('every judgement sends exactly one rules.check event, with no command text', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  await beat(project, HOST_A, 5_000, { value: true })
  const queued = await run(project, DEPLOY, { glmSpend: 'optional', waitedMs: 2_500, caller: 'library' })
  assert.deepEqual(queued.events, [{
    event: 'rules.check',
    effect: 'queue',
    exitCode: 5,
    rules: ['builtin:glm-peak-reduce', 'r-peak-queue'],
    peakMode: { level: 'reduce', origin: 'default' },
    glmSpend: 'optional',
    glmPeakSource: 'heartbeat',
    unknownSignals: [],
    waitedMs: 2_500,
    caller: 'library',
  }])
  assert.ok(!JSON.stringify(queued.events).includes('npm run deploy'), 'the command is not in the event')
  const allowed = await run(project, { tool: 'pwsh', args: { command: 'npm test' } }, { signals: { 'glm-peak': false } })
  assert.deepEqual(allowed.events, [{
    event: 'rules.check',
    effect: 'allow',
    exitCode: 0,
    rules: [],
    peakMode: { level: 'reduce', origin: 'default' },
    glmPeakSource: 'caller',
    unknownSignals: [],
    caller: 'library',
  }])
  await rm(join(project.paths.runtimeDir, 'hosts'), { recursive: true, force: true })
  const blind = await run(project, DEPLOY)
  assert.equal(blind.events.length, 1)
  assert.deepEqual(blind.events[0]?.unknownSignals, ['glm-peak'])
  assert.equal(blind.events[0]?.glmPeakSource, 'none')
}, { start: START })

clockedTest('a metrics exit that throws changes neither the verdict nor the text, and writes nothing', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  const plain = await run(project, DEPLOY, { signals: { 'glm-peak': true } })
  const before = await treeOf(project.root)
  const broken = await checkCall(DEPLOY, { project: project.root, now: NOW, signals: { 'glm-peak': true }, metrics: () => { throw new Error('the stream is gone') } })
  assert.deepEqual(broken, plain.result)
  const rejected = await checkCall(DEPLOY, { project: project.root, now: NOW, signals: { 'glm-peak': true }, metrics: () => Promise.reject(new Error('the stream is gone')) })
  assert.deepEqual(rejected, plain.result)
  assert.deepEqual(await treeOf(project.root), before)
}, { start: START })

clockedTest('a check leaves the rules directory and the runtime directory byte for byte as they were', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  assert.ok((await project.board.apply('human', { op: 'peak-mode-set', level: 'stop' })).ok)
  await beat(project, HOST_A, 5_000, { value: true, nextChangeAt: isoAt(3_600_000) })
  const before = await treeOf(project.root)
  for (const call of [DEPLOY, { tool: 'pwsh', args: { command: 'npm test' } }, { tool: 'edit', args: { file_path: 'docs/rules/rules.json' } }]) {
    await run(project, call)
    await run(project, call, { signals: { 'glm-peak': true }, glmSpend: 'optional', role: 'subagent', model: GLM_MODEL, session: 's', stage: 'design' })
  }
  assert.deepEqual(await treeOf(project.root), before)
}, { start: START })

// ----------------------------------------------------------------- the show

test('showText lists the peak mode, the rules in force, the waiting calls and the signals with where each came from', () => {
  const text = showText({
    project: 'C:/work/app',
    peak: { level: 'reduce', origin: 'default' },
    glmPeak: { name: 'glm-peak', source: 'heartbeat', host: 4100, value: true },
    until: '2026-11-04T10:00:00.000Z',
    rules: [
      { rule: PEAK_QUEUE },
      { rule: GLM_PEAK_REDUCE },
      { rule: ruleOf({ id: 'r-script', title: 'Lint gate', action: { kind: 'script', script: scriptRef('r-script') } }), note: 'The script is not approved on this machine, so it is not run.' },
    ],
    tickets: [{
      id: 'q-12',
      state: 'deferred',
      rules: ['r-peak-queue'],
      sessionId: 's-1',
      agentLabel: 'main',
      host: { pid: 1, startedAt: 1 },
      signature: 'abc',
      tool: 'pwsh',
      summary: 'npm run deploy',
      since: '2026-11-04T06:50:00.000Z',
    }],
    signals: [
      { name: 'code-freeze', source: 'manual', value: true },
      { name: 'server-errors-5m', source: 'detector', unknown: 'the detector d-server-errors has no live host reporting on it' },
    ],
    notes: ['这个项目还没有规则板的状态'],
  })
  const lines = text.split('\n')
  assert.equal(lines[0], 'Rules board of app.')
  assert.ok(lines.includes('Peak mode: reduce (the default; the human can change it).'), text)
  assert.ok(lines.includes(`GLM peak: now, until ${localHm('2026-11-04T10:00:00.000Z')} (read from the heartbeat of host 4100).`), text)
  assert.ok(lines.some(line => line.startsWith('- [queue] r-peak-queue: Hold deploys in the GLM peak (set by the human at ')), text)
  assert.ok(lines.includes('- [queue] builtin:glm-peak-reduce: Defers scripts that report optional GLM spending until peak ends. Applies while glm-peak is on.'), text)
  assert.ok(lines.some(line => line.includes('r-script') && line.includes('The script is not approved on this machine, so it is not run.')), text)
  assert.ok(lines.some(line => line.startsWith('- q-12: pwsh "npm run deploy" is deferred since ') && line.includes('by rule r-peak-queue')), text)
  assert.ok(lines.includes('- code-freeze: on (source manual)'), text)
  assert.ok(lines.includes('- server-errors-5m: unknown (the detector d-server-errors has no live host reporting on it)'), text)
  assert.ok(lines.includes('这个项目还没有规则板的状态'), text)
  assert.ok(!text.includes('undefined'), text)
})

test('showText says so when there is nothing to list and when the peak cannot be read', () => {
  const text = showText({
    project: 'C:/work/app',
    peak: { level: 'stop', origin: 'human', at: '2026-11-03T09:05:00.000Z' },
    glmPeak: { name: 'glm-peak', source: 'none', unknown: NO_HOST },
    rules: [],
    tickets: [],
    signals: [],
    notes: [],
  })
  const lines = text.split('\n')
  assert.ok(lines.includes(`Peak mode set by the human at ${localMinute('2026-11-03T09:05:00.000Z')}: stop.`), text)
  assert.ok(lines.includes(`GLM peak: unknown (${NO_HOST}).`), text)
  assert.ok(lines.includes('Rules in force: none.'), text)
  assert.ok(lines.includes('Waiting calls: none.'), text)
  assert.ok(lines.includes('Signals: none.'), text)
})

// ----------------------------------------------------------- the command line

const CLI = fileURLToPath(new URL('../scripts/rules/cli.mjs', import.meta.url))

/** The command line as a separate process, as `npm run -s rules --` starts it. */
function spawnCli(args: readonly string[]): { readonly status: number | null, readonly stdout: string, readonly stderr: string } {
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, ...args], { encoding: 'utf8' })
  return { status: child.status, stdout: child.stdout, stderr: child.stderr }
}

clockedTest('rules show, in its own process, prints the project as one document and exits 0 without writing', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  const before = await treeOf(project.root)
  const shown = spawnCli(['show', '--project', project.root])
  assert.equal(shown.status, 0, shown.stderr)
  const document = JSON.parse(shown.stdout) as { ok: boolean, text: string, peakMode: { level: string, origin: string }, signals: Array<{ name: string }>, notes: string[] }
  assert.equal(document.ok, true)
  assert.equal(document.peakMode.level, 'reduce')
  assert.equal(document.peakMode.origin, 'default')
  assert.ok(document.signals.some(signal => signal.name === 'glm-peak'))
  assert.ok(document.text.startsWith(`Rules board of ${basename(project.root)}.\n`), document.text)
  assert.ok(document.text.includes('r-peak-queue'))
  assert.deepEqual(await treeOf(project.root), before)
}, { start: START })

clockedTest('rules check, in its own process, exits 0, 4 or 5 as the verdict is allow, block or queue, and prints the result', async (project) => {
  const block = ruleOf({ id: 'r-no-deploy', title: 'No deploy', filter: { command: { matches: 'deploy' } }, action: { kind: 'block' } })
  await startFrom(project, { version: 2, rules: { 'r-no-deploy': block } })
  const args = join(project.root, 'call.json')
  await writeFile(args, JSON.stringify({ command: 'npm run deploy' }))
  const blocked = spawnCli(['check', '--project', project.root, '--tool', 'pwsh', '--args', args])
  assert.equal(blocked.status, 4, blocked.stderr)
  const result = JSON.parse(blocked.stdout) as CheckResult
  assert.equal(result.effect, 'block')
  assert.equal(result.exitCode, 4)
  await writeFile(args, JSON.stringify({ command: 'npm test' }))
  assert.equal(spawnCli(['check', '--project', project.root, '--tool', 'pwsh', '--args', args]).status, 0)
  const other = join(project.root, 'other')
  await mkdir(join(other, '.git'), { recursive: true })
  await writeFile(args, JSON.stringify({ command: 'npm run calibrate' }))
  const queued = spawnCli(['check', '--project', other, '--tool', 'pwsh', '--args', args, '--signal', 'glm-peak=true', '--glm-spend', 'optional'])
  assert.equal(queued.status, 5, queued.stderr)
  assert.ok((JSON.parse(queued.stdout) as CheckResult).text?.includes('builtin:glm-peak-reduce'))
  const usage = spawnCli(['check', '--project', other, '--tool', 'pwsh', '--args', args, '--signal', 'foo=1'])
  assert.equal(usage.status, 2)
  assert.equal(usage.stdout, '')
  assert.match(usage.stderr, /foo/)
}, { start: START })

clockedTest('a command line that does not fit exits 2 with one line on the standard error that says which part', async (project) => {
  await startFrom(project, { version: 2, signals: { 'code-freeze': { type: { kind: 'boolean' } } } })
  const args = join(project.root, 'call.json')
  await writeFile(args, JSON.stringify({ command: 'npm test' }))
  await writeFile(join(project.root, 'list.json'), '[1]')
  await writeFile(join(project.root, 'broken.json'), '{')
  const base = ['check', '--project', project.root, '--tool', 'pwsh', '--args', args]
  const cases: ReadonlyArray<readonly [string, readonly string[], RegExp]> = [
    ['a switch of the project', [...base, '--signal', 'code-freeze=true'], /code-freeze 存在项目状态里/],
    ['a name that is no signal', [...base, '--signal', 'foo=1'], /foo.*没有这个宿主信号/],
    ['a value that is no boolean', [...base, '--signal', 'glm-peak=yes'], /glm-peak.*true.*false/],
    ['a signal given twice', [...base, '--signal', 'glm-peak=true', '--signal', 'glm-peak=false'], /glm-peak.*一次/],
    ['a signal with no value', [...base, '--signal', 'glm-peak'], /glm-peak/],
    ['a negative wait', [...base, '--waited-ms', '-5'], /waited-ms/],
    ['a wait that is no number', [...base, '--waited-ms', 'soon'], /waited-ms/],
    ['a peak end without the peak', [...base, '--peak-until', isoAt(3_600_000)], /peak-until.*glm-peak/],
    ['a role that is none', [...base, '--role', 'janitor'], /role/],
    ['no tool', ['check', '--project', project.root, '--args', args], /--tool/],
    ['no arguments file', ['check', '--project', project.root, '--tool', 'pwsh'], /--args/],
    ['an arguments file that is not there', ['check', '--project', project.root, '--tool', 'pwsh', '--args', join(project.root, 'none.json')], /--args/],
    ['an arguments file that is a list', ['check', '--project', project.root, '--tool', 'pwsh', '--args', join(project.root, 'list.json')], /--args.*对象/],
    ['an arguments file that is not JSON', ['check', '--project', project.root, '--tool', 'pwsh', '--args', join(project.root, 'broken.json')], /--args.*JSON/],
    ['an option nobody knows', [...base, '--force'], /force/],
    ['a command nobody knows', ['propose', '--project', project.root], /propose/],
    ['no command', [], /show.*check/],
  ]
  const seen = new Set<string>()
  for (const [what, argv, pattern] of cases) {
    const done = await runCli(argv, { cwd: project.root, now: () => NOW })
    assert.equal(done.exitCode, 2, `${what}: ${done.stderr}`)
    assert.equal(done.stdout, '', what)
    assert.match(done.stderr, pattern, what)
    assert.equal(done.stderr.trim().split('\n').length, 1, `${what}: one line`)
    seen.add(done.stderr)
  }
  assert.equal(seen.size, cases.length, 'every refusal has its own words')
}, { start: START })

clockedTest('the command line is the caller \'cli\' and sends the event; the library says \'library\' unless told', async (project) => {
  await startFrom(project, { version: 2, rules: { 'r-peak-queue': PEAK_QUEUE } })
  const args = join(project.root, 'call.json')
  await writeFile(args, JSON.stringify({ command: 'npm run deploy' }))
  const events: RulesMetricEvent[] = []
  const done = await runCli(['check', '--project', project.root, '--tool', 'pwsh', '--args', args, '--signal', 'glm-peak=true', '--waited-ms', '1200'], { cwd: project.root, now: () => NOW, metrics: (event) => { events.push(event) } })
  assert.equal(done.exitCode, 5)
  assert.equal(done.stderr, '')
  assert.equal(events.length, 1)
  assert.deepEqual([events[0]?.caller, events[0]?.effect, events[0]?.exitCode, events[0]?.waitedMs, events[0]?.glmPeakSource], ['cli', 'queue', 5, 1200, 'caller'])
  const library = await run(project, DEPLOY, { signals: { 'glm-peak': true } })
  assert.equal(library.events[0]?.caller, 'library')
}, { start: START })

clockedTest('a project that cannot be read is exit 1 on the command line, not a usage error', async (project) => {
  await mkdir(join(project.root, '.llm', 'rules', 'journal.jsonl'), { recursive: true })
  const args = join(project.root, 'call.json')
  await writeFile(args, JSON.stringify({ command: 'npm test' }))
  const done = await runCli(['check', '--project', project.root, '--tool', 'pwsh', '--args', args], { cwd: project.root, now: () => NOW })
  assert.equal(done.exitCode, 1)
  assert.equal(done.stdout, '')
  assert.equal(done.stderr.trim().split('\n').length, 1)
}, { start: START })

test('the project defaults to the working directory of the caller', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rules-cwd-'))
  try {
    await mkdir(join(root, '.git'))
    const done = await runCli(['show'], { cwd: root, now: () => NOW })
    assert.equal(done.exitCode, 0, done.stderr)
    assert.ok((JSON.parse(done.stdout) as { text: string }).text.startsWith(`Rules board of ${basename(root)}.`))
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
