import assert from 'node:assert/strict'
import test from 'node:test'
import { LIVE_KEY, foldLive, initialLive, liveProjection, liveView, type LiveEvent, type LiveState } from '../src/graph/live.ts'
import { apply } from '../src/graph/panel-row.ts'
import { fakeInjector } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'

let seq = 0
function event(type: string, data: unknown, time = 1000 + seq): LiveEvent {
  return { type, seq: seq++, time, data }
}

function fold(events: readonly LiveEvent[], from: LiveState = initialLive(0)): LiveState {
  return events.reduce(foldLive, from)
}

const call = (callId: string, name: string, args: unknown = '{}'): LiveEvent => event('tool/call', { turn: 1, step: 1, callId, name, arguments: args })
const result = (callId: string, isError = false): LiveEvent => event('tool/result', { turn: 1, step: 1, message: { role: 'tool', isError, source: { callId } } })

test('a turn: steps count, the running tool shows until its result, results land in recent', () => {
  seq = 0
  const started = fold([event('turn/start', { turn: 1 }, 5000), event('step/start', { turn: 1, step: 1 }), call('c1', 'Read', '{"file_path":"a"}')])
  assert.deepEqual([started.turnSince, started.steps, started.tool?.name], [5000, 1, 'Read'])
  const done = fold([result('c1'), event('step/start', { turn: 1, step: 2 })], started)
  assert.equal(done.tool, null)
  assert.equal(done.steps, 2)
  assert.deepEqual(done.recent.map(entry => [entry.name, entry.ok]), [['Read', true]])
  const ended = foldLive(done, event('turn/end', { turn: 1 }))
  assert.deepEqual([ended.turnSince, ended.tool], [null, null])
  assert.equal(ended.recent.length, 1, 'recent outlives the turn')
})

test('graph_focus moves the focus when its result succeeds, not when it fails', () => {
  seq = 0
  const focused = fold([call('f1', 'graph_focus', '{"id":"m2-8"}'), result('f1')])
  assert.equal(focused.focus, 'm2-8')
  const refused = fold([call('f2', 'graph_focus', '{"id":"nope"}'), result('f2', true)], focused)
  assert.equal(refused.focus, 'm2-8')
  assert.deepEqual(refused.recent.map(entry => entry.ok), [true, false])
  assert.equal(fold([call('f3', 'graph_focus', { id: 'm2-9' }), result('f3')], refused).focus, 'm2-9', 'arguments may arrive parsed')
  assert.equal(fold([call('f4', 'graph_focus', 'not json'), result('f4')], refused).focus, 'm2-8')
})

test('parallel calls: the latest pending call shows; recent keeps the last six', () => {
  seq = 0
  const both = fold([call('a', 'Read'), call('b', 'Grep')])
  assert.equal(both.tool?.name, 'Grep')
  assert.equal(foldLive(both, result('b')).tool?.name, 'Read')
  const many = fold(Array.from({ length: 8 }, (_, index) => [call(`x${index}`, `T${index}`), result(`x${index}`)]).flat())
  assert.deepEqual(many.recent.map(entry => entry.name), ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'])
})

test('a DeferredToolCall shows the deferred tool it runs; a malformed wrapper keeps its own name', () => {
  seq = 0
  const wrapped = fold([call('d1', 'DeferredToolCall', '{"name":"TodoWrite","input":{"todos":[]}}')])
  assert.equal(wrapped.tool?.name, 'TodoWrite')
  assert.deepEqual(foldLive(wrapped, result('d1')).recent.map(entry => entry.name), ['TodoWrite'])
  assert.equal(fold([call('d2', 'DeferredToolCall', '{"input":{}}')]).tool?.name, 'DeferredToolCall')
})

test('the model comes from request/header; the same model again keeps the state', () => {
  seq = 0
  const header = (model: string): LiveEvent => event('request/header', { header: { config: { provider: 'glm-zcode', model } }, reason: 'initial' })
  const state = fold([header('glm-5.3')])
  assert.equal(state.model, 'glm-5.3')
  assert.equal(foldLive(state, header('glm-5.3')), state)
  assert.equal(foldLive(state, header('glm-5.3-flash')).model, 'glm-5.3-flash')
})

test('events the view does not depend on, and inherited fork events, keep the same state', () => {
  seq = 0
  const state = initialLive(3)
  assert.equal(foldLive(state, event('turn/start', { turn: 1 })), state, 'seq 0 is inherited')
  seq = 5
  const own = initialLive(0)
  for (const type of ['user/message', 'assistant/message', 'todo/write', 'step/end', 'subagent/catalog']) assert.equal(foldLive(own, event(type, {})), own, type)
  assert.equal(foldLive(own, result('unknown')), own, 'a result without its call')
  assert.equal(foldLive(own, event('request/header', { header: { config: {} } })), own, 'no model, no change')
  assert.equal(foldLive(own, event('tool/call', { callId: 'c' })), own, 'a call without a name')
})

test('the unit: schemas accept its own states and views and refuse others', () => {
  seq = 0
  const state = fold([event('turn/start', { turn: 1 }), call('c1', 'Read'), result('c1')])
  assert.equal(liveProjection.key, LIVE_KEY)
  assert.equal(liveProjection.stateSchema.parse(JSON.parse(JSON.stringify(state))).steps, 0)
  const view = liveView(state)
  assert.equal('pending' in view || 'inherited' in view, false, 'the wire view leaves the bookkeeping out')
  assert.deepEqual(liveProjection.wire.viewSchema.parse(view), view)
  assert.throws(() => liveProjection.wire.viewSchema.parse({ ...view, recent: [{ name: 'x' }] }), /recent/)
  assert.throws(() => liveProjection.stateSchema.parse({ ...state, inherited: 'x' }), /inherited/)
})

test('the panel row registers the unit when the registry arrives, and survives without it', async () => {
  const registered: string[] = []
  const commands = { register: () => () => {} }
  const snapshot = () => ({ values: {} })
  apply({ commands, inject: fakeInjector({ sessionProjections: { register: definition => { registered.push(definition.key); return () => {} }, snapshot } }).inject })
  assert.deepEqual(registered, [LIVE_KEY])
  const failing = await captureWarnings(() => apply({ commands, inject: fakeInjector({ sessionProjections: { register: () => { throw new Error('incompatible stateVersion') }, snapshot } }).inject }))
  assert.match(failing.warnings.join('\n'), /the live projection is off: incompatible stateVersion/)
  assert.equal(typeof apply({ commands }), 'function', 'no inject: the command still registers')
})
