import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/glm-prompt/index.ts'
import { PEAK_REMINDER_SOURCE, PEAK_REMINDER_TEXT, peakWindowToAnnounce } from '../src/glm-prompt/peak-reminder.ts'
import type { DerivedMessage, PreStepDecision, UserNotice } from '../src/shared/dsh-min.ts'
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
async function step(model: string, history: readonly DerivedMessage[], options: { natives?: readonly string[], toolSearchMode?: 'local' | 'off', messages?: readonly unknown[], stepNo?: number, clock?: () => number } = {}) {
  const rt = fakeRuntime(options.natives === undefined ? {} : { natives: options.natives })
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
