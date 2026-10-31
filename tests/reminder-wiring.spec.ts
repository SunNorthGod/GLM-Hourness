import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/glm-prompt/index.ts'
import { PEAK_REMINDER_SOURCE, PEAK_REMINDER_TEXT, peakReminderText, peakWindowToAnnounce, readPeakMode } from '../src/glm-prompt/peak-reminder.ts'
import type { DerivedMessage, PreStepDecision, UserNotice } from '../src/shared/dsh-min.ts'
import { PEAK_MODE_SERVICE, peakModeState, type PeakLevel, type PeakModeService, type PeakModeState } from '../src/shared/peak-mode.ts'
import { fakeRuntime, NATIVE_NAMES } from './fake-rc3.ts'

/** A Wednesday morning (UTC+8), outside peak hours: the default clock of these tests. */
const OFF_PEAK = Date.parse('2026-10-28T10:00:00+08:00')

let ids = 0
/** One assistant message (rc.3 shape) and its tool results. */
function turn(calls: ReadonlyArray<{ name: string, args?: unknown }> = [{ name: 'Read' }], model = 'glm-5.3'): DerivedMessage[] {
  const blocks = calls.map(call => ({ type: 'tool-call', id: `call-${++ids}`, name: call.name, arguments: JSON.stringify(call.args ?? {}) }))
  return [
    { role: 'assistant', content: blocks, source: { kind: 'model', provider: 'glm-zcode', model } },
    ...blocks.map(block => ({ role: 'tool', toolCallId: block.id, isError: false, content: [{ type: 'text', text: 'ok' }] })),
  ]
}
const turns = (count: number, calls?: Parameters<typeof turn>[0], model?: string): DerivedMessage[] => Array.from({ length: count }, () => turn(calls, model)).flat()
const userInput = { id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }

const sourced = (decision: PreStepDecision, kind: string): UserNotice[] =>
  decision.kind === 'enter' ? decision.messages.filter((message): message is UserNotice => (message as UserNotice).source?.kind === kind) : []
const reminders = (decision: PreStepDecision): UserNotice[] => sourced(decision, 'glm-todo-reminder')

/** The dialect row applied, the agent created, and one step assembled on `model` over `history`; `clock` reads the wall clock (default off-peak). */
async function step(model: string, history: readonly DerivedMessage[], options: { natives?: readonly string[], toolSearchMode?: 'local' | 'off', messages?: readonly unknown[], stepNo?: number, clock?: () => number, peakModeService?: unknown } = {}) {
  const rt = fakeRuntime(options.natives === undefined ? {} : { natives: options.natives })
  if (options.peakModeService !== undefined) rt.services.set(PEAK_MODE_SERVICE, options.peakModeService) // the rules row's service, as cordis `get` finds it
  apply(rt.ctx, options.toolSearchMode === undefined ? {} : { toolSearchMode: options.toolSearchMode }, options.clock ?? (() => OFF_PEAK))
  await rt.create()
  rt.history.push(...history)
  await rt.assemble({ model }) // rc.3: the step's route reaches the row through the assembly
  const decision = await rt.preStep({ step: options.stepNo ?? 2, ...(options.messages === undefined ? {} : { messages: options.messages }) })
  return { rt, decision }
}

test('a GLM step after 10 multi-call turns gets one wrapped reminder notice with the todo echo', async () => {
  const history = [
    ...turn([{ name: 'TodoWrite', args: { todos: [{ content: 'a', status: 'in_progress', priority: 'high' }] } }]),
    ...turns(10, [{ name: 'Read' }, { name: 'Grep' }]),
  ]
  const { decision } = await step('glm-5.3', history)
  const [notice, extra] = reminders(decision)
  assert.ok(notice !== undefined && extra === undefined)
  const text = notice.content[0]!.text
  assert.ok(text.startsWith("<system-reminder>\nThe TodoWrite tool hasn't been used recently."))
  assert.ok(text.endsWith('Here are the existing contents of your todo list:\n\n[1. [in_progress] a]\n</system-reminder>'))
  // The createUserMessage identity the inbox keys on.
  assert.equal(notice.role, 'user')
  assert.equal(typeof notice.id, 'string')
  assert.ok(Object.isFrozen(notice) && Object.isFrozen(notice.content[0]))
})

test('per-turn counting: nine multi-call turns are not enough', async () => {
  const { decision } = await step('glm-5.3', turns(9, [{ name: 'Read' }, { name: 'Read' }, { name: 'Bash' }]))
  assert.deepEqual(reminders(decision), [])
})

test('a delivered reminder persists in history and restarts the interval', async () => {
  const first = await step('glm-5.3', turns(10))
  const [notice] = reminders(first.decision)
  assert.ok(notice !== undefined)
  first.rt.history.push(notice, ...turns(9))
  await first.rt.assemble({ model: 'glm-5.3' })
  assert.deepEqual(reminders(await first.rt.preStep({ step: 3 })), [])
  first.rt.history.push(...turns(1))
  await first.rt.assemble({ model: 'glm-5.3' })
  assert.equal(reminders(await first.rt.preStep({ step: 4 })).length, 1)
})

test('a TodoWrite through DeferredToolCall resets the count', async () => {
  const nested = turn([{ name: 'DeferredToolCall', args: { name: 'TodoWrite', input: { todos: [{ content: 'n', status: 'pending', priority: 'low' }] } } }])
  const { decision } = await step('glm-5.3', [...turns(12), ...nested, ...turns(9)])
  assert.deepEqual(reminders(decision), [])
})

test('non-GLM routes never get the reminder', async () => {
  const { decision } = await step('deepseek-flash', turns(15))
  assert.deepEqual(reminders(decision), [])
  const switched = await step('glm-5.3', turns(15, undefined, 'deepseek-flash'))
  assert.deepEqual(reminders(switched.decision), []) // non-GLM turns do not count either
})

test('no reminder without TodoWrite on the face, or on an empty first step', async () => {
  const noTodo = await step('glm-5.3', turns(12), { natives: NATIVE_NAMES.filter(name => name !== 'todo_write') })
  assert.deepEqual(reminders(noTodo.decision), [])
  const empty = await step('glm-5.3', turns(12), { stepNo: 1 })
  assert.deepEqual(reminders(empty.decision), [])
})

test('the reminder precedes the deferred-tools announcement, in ZCode collection order', async () => {
  const { decision } = await step('glm-5.3', turns(10), { messages: [userInput] })
  assert.ok(decision.kind === 'enter')
  const kinds = decision.messages.map(message => (message as UserNotice).source.kind)
  assert.deepEqual(kinds, ['user', 'glm-todo-reminder', 'glm-tool-search'])
})

test('with tool search off the reminder still fires (TodoWrite stays on the face)', async () => {
  const { decision } = await step('glm-5.3', turns(10), { toolSearchMode: 'off' })
  assert.equal(reminders(decision).length, 1)
})

// --- peak-hour reminder (docs/ORCHESTRATION.md §11.4) ---

const peakNotices = (decision: PreStepDecision): UserNotice[] => sourced(decision, PEAK_REMINDER_SOURCE)

test('the peak reminder fires once when a GLM session crosses into peak hours, and again in the next window', async () => {
  let now = Date.parse('2026-10-28T13:59:00+08:00')
  const { rt, decision } = await step('glm-5.3', turns(1), { clock: () => now })
  assert.deepEqual(peakNotices(decision), []) // previous step off-peak
  const next = async (iso: string, stepNo: number) => {
    now = Date.parse(iso)
    rt.history.push(...turns(1))
    await rt.assemble({ model: 'glm-5.3' })
    return rt.preStep({ step: stepNo })
  }
  const [notice, extra] = peakNotices(await next('2026-10-28T14:00:00+08:00', 3))
  assert.ok(notice !== undefined && extra === undefined)
  assert.deepEqual(notice.content, [{ type: 'text', text: `<system-reminder>\n${PEAK_REMINDER_TEXT}\n</system-reminder>` }])
  assert.equal(notice.source.peakWindow, '2026-10-28')
  assert.ok(Object.isFrozen(notice))
  rt.history.push(notice) // the notice persists in the session
  assert.deepEqual(peakNotices(await next('2026-10-28T14:30:00+08:00', 4)), [])
  assert.deepEqual(peakNotices(await next('2026-10-28T17:59:00+08:00', 5)), [])
  assert.deepEqual(peakNotices(await next('2026-10-28T19:00:00+08:00', 6)), [])
  assert.equal(peakNotices(await next('2026-10-29T14:05:00+08:00', 7)).length, 1) // Thursday's window
})

test('a GLM session that starts inside peak hours is told at its first step', async () => {
  const { decision } = await step('glm-5.3', [], { messages: [userInput], stepNo: 1, clock: () => Date.parse('2026-10-28T15:00:00+08:00') })
  assert.equal(peakNotices(decision).length, 1)
})

test('no peak reminder on non-GLM routes, at weekends, on an empty first step, or when the history already has this window', async () => {
  const inPeak = () => Date.parse('2026-10-28T15:00:00+08:00')
  assert.deepEqual(peakNotices((await step('deepseek-flash', turns(1), { clock: inPeak })).decision), [])
  assert.deepEqual(peakNotices((await step('glm-5.3', turns(1), { clock: () => Date.parse('2026-10-31T15:00:00+08:00') })).decision), [])
  assert.deepEqual(peakNotices((await step('glm-5.3', turns(1), { stepNo: 1, clock: inPeak })).decision), [])
  const told: DerivedMessage = { role: 'user', content: [{ type: 'text', text: 'told' }], source: { kind: PEAK_REMINDER_SOURCE, form: 'notice', peakWindow: '2026-10-28' } }
  assert.deepEqual(peakNotices((await step('glm-5.3', [told, ...turns(1)], { clock: inPeak })).decision), []) // resumed session
  assert.equal(peakWindowToAnnounce([told], Date.parse('2026-10-29T15:00:00+08:00')), '2026-10-29')
})

test('the peak reminder precedes the ZCode notices of the same step', async () => {
  const { decision } = await step('glm-5.3', turns(10), { messages: [userInput], clock: () => Date.parse('2026-10-28T15:00:00+08:00') })
  assert.ok(decision.kind === 'enter')
  const kinds = decision.messages.map(message => (message as UserNotice).source.kind)
  assert.deepEqual(kinds, ['user', PEAK_REMINDER_SOURCE, 'glm-todo-reminder', 'glm-tool-search'])
})

// --- peak reminder by peak mode (docs/ORCHESTRATION.md §11.4, acceptance 13) ---

/** The reminder body as persisted on 480e264 (src/glm-prompt/peak-reminder.ts:28). */
const TODAYS_TEXT = 'Peak hours have started (weekdays 14:00-18:00 UTC+8). Until 18:00, GLM usage is charged at the full credit rate; outside peak hours it costs half. This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.'
const FIRST_TWO = 'Peak hours have started (weekdays 14:00-18:00 UTC+8). Until 18:00, GLM usage is charged at the full credit rate; outside peak hours it costs half.'
const CLOSING = 'Do not switch models or plans unless the user asks.'
const DEFAULT_LEVEL = (level: string): string => `Peak mode: ${level} (the default; the human can change it).`
const HUMAN_LEVEL = (level: string): string => `Peak mode set by the human: ${level}.`
/** The reduce row of the section 3.4 table; `cap` is the optional "run at most N GLM subagent(s) at a time and " half. */
const reduceText = (levelSentence: string, cap = ''): string => `${FIRST_TWO} ${levelSentence} Until 18:00, ${cap}do not start optional work that spends many GLM credits (calibration runs, ablations, large reviews); the main agent moves such work to after peak, including work it dispatches. Necessary work, and a task you were dispatched for, go on. ${CLOSING}`
/** The stop row of the section 3.4 table. */
const stopText = (levelSentence: string): string => `${FIRST_TWO} ${levelSentence} Until 18:00, do not dispatch a GLM subagent and do not start a script that spends GLM credits; a GLM subagent whose call comes back deferred stops and reports where it stopped. The main agent is not held on any level: it keeps answering the human and working. ${CLOSING}`
const FORBIDDEN = ['information only', 'keep working', 'pause', 'postpone', 'defers the tool calls', 'tells you when to continue']
const PEAK_WEDNESDAY = () => Date.parse('2026-10-28T15:00:00+08:00')
const PEAK_UNTIL = '2026-10-28T10:00:00.000Z'

/** A state the rules row would hand out in the peak, built by the contract's own function; `extra` overrides members the way a bad service would. */
const modeState = (level: PeakLevel, origin: 'default' | 'human', extra: Record<string, unknown> = {}): PeakModeState =>
  ({ ...peakModeState({ level, origin, ...(origin === 'human' ? { at: '2026-10-28T09:00:00.000Z' } : {}), peak: true, until: PEAK_UNTIL }), ...extra })
/** A fake glmHournessPeakMode service over `state`, counting the sessions `stateFor` was asked about. */
function modeService(state: (sessionId: string) => unknown): { readonly service: PeakModeService, readonly calls: string[] } {
  const calls: string[] = []
  const service: PeakModeService = {
    stateFor: (sessionId) => { calls.push(sessionId); return state(sessionId) as PeakModeState | undefined },
    stateForProject: () => undefined,
    peakHoldFor: () => undefined,
  }
  return { service, calls }
}
const bodyOf = (notice: UserNotice): string => notice.content[0].text.replace(/^<system-reminder>\n/, '').replace(/\n<\/system-reminder>$/, '')
/** The one peak notice a GLM session gets at its first step inside peak hours, under a service value (undefined: the rules row is not there). */
async function peakNoticeUnder(service: unknown): Promise<UserNotice> {
  const { decision } = await step('glm-5.3', [], { messages: [userInput], stepNo: 1, clock: PEAK_WEDNESDAY, ...(service === undefined ? {} : { peakModeService: service }) })
  const notices = peakNotices(decision)
  assert.equal(notices.length, 1)
  return notices[0]
}

test('PEAK_REMINDER_TEXT is the text of 480e264, assembled from the time-span constants', () => {
  assert.equal(PEAK_REMINDER_TEXT, TODAYS_TEXT)
  assert.equal(peakReminderText(), TODAYS_TEXT)
  assert.equal(peakReminderText({ level: 'inform', origin: 'human' }), TODAYS_TEXT)
  assert.equal(peakReminderText({ level: 'inform', origin: 'default', glmWorkerCap: 3 }), TODAYS_TEXT)
})

test('the reduce and stop texts equal the section 3.4 table, by origin and cap', () => {
  assert.equal(peakReminderText({ level: 'reduce', origin: 'default', glmWorkerCap: 1 }), reduceText(DEFAULT_LEVEL('reduce'), 'run at most 1 GLM subagent at a time and '))
  assert.equal(peakReminderText({ level: 'reduce', origin: 'human', glmWorkerCap: 1 }), reduceText(HUMAN_LEVEL('reduce'), 'run at most 1 GLM subagent at a time and '))
  assert.equal(peakReminderText({ level: 'reduce', origin: 'default', glmWorkerCap: 2 }), reduceText(DEFAULT_LEVEL('reduce'), 'run at most 2 GLM subagents at a time and '))
  assert.equal(peakReminderText({ level: 'reduce', origin: 'human' }), reduceText(HUMAN_LEVEL('reduce')))
  assert.equal(peakReminderText({ level: 'stop', origin: 'human' }), stopText(HUMAN_LEVEL('stop')))
  assert.equal(peakReminderText({ level: 'stop', origin: 'default', glmWorkerCap: 2 }), stopText(DEFAULT_LEVEL('stop')))
  // The cost the design states: the text from the third sentence on is 152 characters today, 400 under the factory reduce, 345 under the person's stop.
  const fromThird = (text: string): number => text.length - FIRST_TWO.length - 1
  assert.deepEqual([fromThird(PEAK_REMINDER_TEXT), fromThird(peakReminderText({ level: 'reduce', origin: 'default', glmWorkerCap: 1 })), fromThird(peakReminderText({ level: 'stop', origin: 'human' }))], [152, 400, 345])
})

test('reduce and stop never say information only, keep working, pause, postpone, or that the main agent is deferred; both end with the plans sentence', () => {
  const texts = [
    peakReminderText({ level: 'reduce', origin: 'default', glmWorkerCap: 1 }),
    peakReminderText({ level: 'reduce', origin: 'human', glmWorkerCap: 2 }),
    peakReminderText({ level: 'reduce', origin: 'human' }),
    peakReminderText({ level: 'stop', origin: 'human' }),
    peakReminderText({ level: 'stop', origin: 'default' }),
  ]
  for (const text of texts) {
    for (const fragment of FORBIDDEN) assert.ok(!text.includes(fragment), `"${fragment}" in: ${text}`)
    assert.ok(text.endsWith(CLOSING))
    assert.ok(text.startsWith(FIRST_TWO))
  }
  assert.ok(texts[3].includes('The main agent is not held on any level: it keeps answering the human and working.'))
})

test('five unreadable cases send today\'s text, each with its peakModeNote and no peakMode level', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ['no-service', undefined],
    ['no-state', modeService(() => undefined).service],
    ['not-peak', modeService(() => modeState('reduce', 'default', { peak: false })).service],
    ['peak-unknown', modeService(() => modeState('reduce', 'default', { peak: undefined })).service],
    ['invalid', modeService(() => modeState('reduce', 'default', { level: 'pause' })).service],
    ['invalid', modeService(() => modeState('reduce', 'default', { origin: 'robot' })).service],
    ['invalid', modeService(() => 'reduce').service],
    ['invalid', modeService(() => modeState('reduce', 'default', { peak: 'yes' })).service],
    ['invalid', modeService(() => { throw new Error('rules row broke') }).service],
    ['invalid', { stateFor: () => modeState('stop', 'human') }], // a service of the wrong shape
  ]
  for (const [note, service] of cases) {
    const notice = await peakNoticeUnder(service)
    assert.equal(bodyOf(notice), TODAYS_TEXT, note)
    assert.equal(notice.source.peakModeNote, note)
    assert.equal(notice.source.peakMode, 'none')
    assert.ok(!('peakModeOrigin' in notice.source) && !('peakWorkerCap' in notice.source))
    assert.equal(notice.source.peakWindow, '2026-10-28')
  }
})

test('the service is asked about the id of the session the agent runs', async () => {
  const { service, calls } = modeService(() => undefined)
  await peakNoticeUnder(service)
  assert.deepEqual(calls, ['agent-1'])
})

test('a glmWorkerCap that is not a positive safe integer drops the cap half only; inform and stop never write it', async () => {
  const sentence = DEFAULT_LEVEL('reduce')
  for (const cap of [undefined, 0, -1, 1.5, '2', Number.NaN, Number.MAX_SAFE_INTEGER + 2, null]) {
    const notice = await peakNoticeUnder(modeService(() => modeState('reduce', 'default', { glmWorkerCap: cap })).service)
    assert.equal(bodyOf(notice), reduceText(sentence), String(cap))
    assert.ok(!('peakWorkerCap' in notice.source) && !('peakModeNote' in notice.source))
    assert.equal(notice.source.peakMode, 'reduce')
  }
  const capped = await peakNoticeUnder(modeService(() => modeState('reduce', 'default', { glmWorkerCap: 2 })).service)
  assert.equal(bodyOf(capped), reduceText(sentence, 'run at most 2 GLM subagents at a time and '))
  assert.equal(capped.source.peakWorkerCap, 2)
  const inform = await peakNoticeUnder(modeService(() => modeState('inform', 'human', { glmWorkerCap: 2 })).service)
  assert.equal(bodyOf(inform), TODAYS_TEXT)
  assert.ok(!('peakWorkerCap' in inform.source))
  const stop = await peakNoticeUnder(modeService(() => modeState('stop', 'human', { glmWorkerCap: 2 })).service)
  assert.equal(bodyOf(stop), stopText(HUMAN_LEVEL('stop')))
  assert.ok(!('peakWorkerCap' in stop.source))
})

test('the notice under each readable level carries peakMode, peakModeOrigin and peakWorkerCap, and its body is peakReminderText of them', async () => {
  const factory = await peakNoticeUnder(modeService(() => modeState('reduce', 'default')).service) // peakModeState gives the cap 1
  assert.equal(bodyOf(factory), reduceText(DEFAULT_LEVEL('reduce'), 'run at most 1 GLM subagent at a time and '))
  assert.deepEqual([factory.source.peakMode, factory.source.peakModeOrigin, factory.source.peakWorkerCap, factory.source.peakWindow], ['reduce', 'default', 1, '2026-10-28'])
  assert.ok(factory.source.form === 'notice' && factory.source.kind === PEAK_REMINDER_SOURCE && !('peakModeNote' in factory.source))
  const chosen = await peakNoticeUnder(modeService(() => modeState('reduce', 'human')).service)
  assert.equal(bodyOf(chosen), reduceText(HUMAN_LEVEL('reduce'), 'run at most 1 GLM subagent at a time and '))
  assert.deepEqual([chosen.source.peakMode, chosen.source.peakModeOrigin], ['reduce', 'human'])
  const stop = await peakNoticeUnder(modeService(() => modeState('stop', 'human')).service)
  assert.equal(bodyOf(stop), stopText(HUMAN_LEVEL('stop')))
  assert.deepEqual([stop.source.peakMode, stop.source.peakModeOrigin], ['stop', 'human'])
  const inform = await peakNoticeUnder(modeService(() => modeState('inform', 'human')).service)
  assert.equal(bodyOf(inform), TODAYS_TEXT)
  assert.deepEqual([inform.source.peakMode, inform.source.peakModeOrigin], ['inform', 'human'])
  assert.ok(!('peakModeNote' in inform.source))
  for (const notice of [factory, chosen, stop, inform]) {
    assert.equal(bodyOf(notice), peakReminderText({ level: notice.source.peakMode as PeakLevel, origin: notice.source.peakModeOrigin as 'default' | 'human', ...(notice.source.peakWorkerCap === undefined ? {} : { glmWorkerCap: notice.source.peakWorkerCap as number }) }))
  }
})

test('the service is read once per notice sent: not on later steps of the window, again when a compaction makes the notice go out again', async () => {
  let level: PeakLevel = 'reduce'
  const { service, calls } = modeService(() => modeState(level, 'human'))
  const { rt, decision } = await step('glm-5.3', [], { messages: [userInput], stepNo: 1, clock: PEAK_WEDNESDAY, peakModeService: service })
  const [first] = peakNotices(decision)
  assert.ok(first !== undefined)
  assert.equal(bodyOf(first), reduceText(HUMAN_LEVEL('reduce'), 'run at most 1 GLM subagent at a time and '))
  assert.equal(calls.length, 1)
  rt.history.push(first)
  level = 'stop' // the person changes the level in the same window: no new notice, no read
  for (const stepNo of [2, 3]) {
    rt.history.push(...turns(1))
    await rt.assemble({ model: 'glm-5.3' })
    assert.deepEqual(peakNotices(await rt.preStep({ step: stepNo })), [])
  }
  assert.equal(calls.length, 1)
  rt.history.length = 0 // a compaction removes the notice from the request-visible history
  rt.history.push(...turns(1))
  await rt.assemble({ model: 'glm-5.3' })
  const [again] = peakNotices(await rt.preStep({ step: 4 }))
  assert.ok(again !== undefined)
  assert.equal(bodyOf(again), stopText(HUMAN_LEVEL('stop')))
  assert.equal(again.source.peakMode, 'stop')
  assert.equal(calls.length, 2)
})

test('the service is not read off-peak, on non-GLM routes or when the window is already announced', async () => {
  const { service, calls } = modeService(() => modeState('reduce', 'default'))
  await step('glm-5.3', turns(1), { clock: () => OFF_PEAK, peakModeService: service })
  await step('deepseek-flash', turns(1), { clock: PEAK_WEDNESDAY, peakModeService: service })
  const told: DerivedMessage = { role: 'user', content: [{ type: 'text', text: 'told' }], source: { kind: PEAK_REMINDER_SOURCE, form: 'notice', peakWindow: '2026-10-28' } }
  await step('glm-5.3', [told, ...turns(1)], { clock: PEAK_WEDNESDAY, peakModeService: service })
  assert.deepEqual(calls, [])
})

test('readPeakMode never throws, names the unreadable case, and reports a bad read once per reason', () => {
  const problems: string[] = []
  const problem = (message: string): void => { problems.push(message) }
  assert.deepEqual(readPeakMode(undefined, false, 's1', problem), { note: 'no-service' })
  assert.deepEqual(readPeakMode(undefined, true, 's1', problem), { note: 'invalid' })
  assert.deepEqual(readPeakMode(undefined, true, 's1', problem), { note: 'invalid' })
  assert.equal(problems.length, 1, 'a wrong-shaped service is reported once')
  const asked: string[] = []
  const quiet: PeakModeService = { stateFor: (id) => { asked.push(id); return undefined }, stateForProject: () => undefined, peakHoldFor: () => undefined }
  assert.deepEqual(readPeakMode(quiet, false, undefined, problem), { note: 'no-state' })
  assert.deepEqual(asked, [], 'no session id, no read')
  assert.deepEqual(readPeakMode(quiet, false, 's1', problem), { note: 'no-state' })
  assert.deepEqual(asked, ['s1'])
  const throwing: PeakModeService = { ...quiet, stateFor: () => { throw new Error('boom') } }
  assert.deepEqual(readPeakMode(throwing, false, 's1', problem), { note: 'invalid' })
  assert.deepEqual(readPeakMode(throwing, false, 's2', problem), { note: 'invalid' })
  assert.equal(problems.length, 2, 'a throwing read is another reason, also once')
  const levelBad: PeakModeService = { ...quiet, stateFor: () => ({ level: 'pause', origin: 'human', peak: true }) as unknown as PeakModeState }
  assert.deepEqual(readPeakMode(levelBad, false, 's1', problem), { note: 'invalid' })
  assert.equal(problems.length, 3)
  const reduce: PeakModeService = { ...quiet, stateFor: () => modeState('reduce', 'default') }
  assert.deepEqual(readPeakMode(reduce, false, 's1'), { mode: { level: 'reduce', origin: 'default', glmWorkerCap: 1 } })
  const odd: PeakModeService = { ...quiet, stateFor: () => modeState('reduce', 'human', { glmWorkerCap: 1.5 }) }
  assert.deepEqual(readPeakMode(odd, false, 's1'), { mode: { level: 'reduce', origin: 'human' } })
  assert.deepEqual(readPeakMode(throwing, false, 's1'), { note: 'invalid' }, 'a missing problem callback is fine')
})
