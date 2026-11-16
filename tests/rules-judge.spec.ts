/**
 * The rules board's pure judgement (docs/ORCHESTRATION.md §16, design §2.3,
 * §2.4, §6.2, §6.7): the four events and the payload of a call, the
 * effective value of a signal, the three-valued condition, which rules apply
 * to a call, the strongest-wins combination, and a script that has not been
 * approved.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { GATE_EVENTS, gateEvents, modelId, RULES_EVENT_TABLE, stepEvent } from '../src/rules/events.ts'
import { combine, evaluateCondition, judge, judgeInput, type RuleHit } from '../src/rules/judge.ts'
import type { Condition } from '../src/rules/model.ts'
import { effectiveSignal } from '../src/rules/signals.ts'
import { isGlmModel } from '../src/shared/route.ts'
import { callOf, GLM_MODEL, inputOf, NOW, OTHER_MODEL, peak, PROJECT, ruleOf, SHA, type CallParts } from './rules-fixtures.ts'

// ------------------------------------------------------------------- events

test('the rules board declares four events; only trunk-advance fails closed, and every field a rule can filter names its comparison', () => {
  assert.deepEqual([...RULES_EVENT_TABLE.keys()], ['gate.tool-call', 'gate.dispatch', 'gate.trunk-advance', 'rules.step'])
  assert.deepEqual(GATE_EVENTS, ['gate.tool-call', 'gate.dispatch', 'gate.trunk-advance'])
  assert.deepEqual([...RULES_EVENT_TABLE.values()].map(event => event.gateOnErrorDefault), [undefined, undefined, 'block', undefined])
  assert.ok([...RULES_EVENT_TABLE.values()].every(event => event.personSelectable))
  const fields = (id: string): Record<string, string | undefined> => Object.fromEntries((RULES_EVENT_TABLE.get(id)?.fields ?? []).map(field => [field.name, field.filter]))
  assert.deepEqual(fields('gate.tool-call'), { tool: 'in', command: 'in', writes: 'paths', role: 'in', model: 'in', session: 'in', nested: 'is', glmSpend: 'in', cwd: undefined, argsTruncated: undefined })
  assert.deepEqual(fields('gate.dispatch'), { tool: 'in', role: 'in', model: 'in', session: 'in', targetModel: 'in', task: 'in' })
  assert.deepEqual(fields('gate.trunk-advance'), { branch: 'in', from: undefined, to: undefined, command: 'in', role: 'in', model: 'in', session: 'in' })
  assert.deepEqual(fields('rules.step'), { role: 'in', model: 'in', session: 'in' })
})

test('one gating call gives gate.tool-call; a dispatch adds gate.dispatch and a trunk advance gate.trunk-advance, all built in one place', () => {
  const call = callOf({ cwd: 'C:/work/app/sub', args: { command: 'npm test' }, writes: ['src/a.ts'] })
  assert.deepEqual(gateEvents(call), [{
    event: 'gate.tool-call',
    at: NOW.toISOString(),
    project: PROJECT,
    session: 's-1',
    payload: { tool: 'pwsh', command: 'npm test', writes: ['src/a.ts'], role: 'root', model: GLM_MODEL, session: 's-1', nested: false, cwd: 'C:/work/app/sub', args: { command: 'npm test' } },
  }])
  const dispatch = gateEvents(callOf({ tool: 'subagent', dispatch: { targetModel: OTHER_MODEL, task: 't-1' } }))
  assert.deepEqual(dispatch.map(record => record.event), ['gate.tool-call', 'gate.dispatch'])
  assert.deepEqual(dispatch[1]?.payload, { tool: 'subagent', role: 'root', model: GLM_MODEL, session: 's-1', targetModel: OTHER_MODEL, task: 't-1' })
  assert.deepEqual(gateEvents(callOf({ tool: 'subagent', dispatch: {} }))[1]?.payload, { tool: 'subagent', role: 'root', model: GLM_MODEL, session: 's-1', targetModel: '', task: '' }, 'a dispatch without a model or a task says so with empty strings')
  const trunk = gateEvents(callOf({ trunkAdvance: { branch: 'main', from: 'a1', to: 'b2' } }))
  assert.deepEqual(trunk.map(record => record.event), ['gate.tool-call', 'gate.trunk-advance'])
  assert.deepEqual(trunk[1]?.payload, { branch: 'main', from: 'a1', to: 'b2', command: 'npm test', role: 'root', model: GLM_MODEL, session: 's-1' })
  assert.deepEqual(gateEvents(callOf({ tool: 'subagent', dispatch: {}, trunkAdvance: { branch: 'main', from: 'a', to: 'b' } })).map(record => record.event), ['gate.tool-call', 'gate.dispatch', 'gate.trunk-advance'])
})

test('what is not known about a call is left out of the payload, and the payload is bounded', () => {
  const bare = gateEvents({ at: NOW.toISOString(), project: PROJECT, tool: 'read' })[0]
  assert.deepEqual(bare?.payload, { tool: 'read', nested: false })
  assert.equal(bare?.session, undefined)
  assert.equal(gateEvents(callOf({ nested: true }))[0]?.payload.nested, true)
  assert.equal(gateEvents(callOf({ glmSpend: 'optional', caller: 'cli' }))[0]?.payload.glmSpend, 'optional')
  assert.equal(gateEvents(callOf({ caller: 'library' }))[0]?.payload.caller, 'library')
  assert.equal((gateEvents(callOf({ command: 'x'.repeat(9000) }))[0]?.payload.command as string).length, 8192, 'only the first 8 KiB of a command is read')
  const args = { text: 'y'.repeat(70_000) }
  const big = gateEvents(callOf({ args }))[0]?.payload
  assert.equal(big?.argsTruncated, true)
  assert.equal((big?.args as string).length, 65_536)
  const small = { text: 'z' }
  const copy = gateEvents(callOf({ args: small }))[0]?.payload.args
  assert.deepEqual(copy, small)
  assert.notEqual(copy, small, 'the payload holds a copy')
  const circular: Record<string, unknown> = {}
  circular.self = circular
  assert.equal('args' in (gateEvents(callOf({ args: circular }))[0]?.payload ?? {}), false, 'arguments that do not serialize are left out')
})

test('a step event carries who is about to step; a model id is provider/model, with an empty provider when the header has none', () => {
  assert.deepEqual(stepEvent({ at: NOW.toISOString(), project: PROJECT, role: 'main-agent', model: GLM_MODEL, session: 's-1' }), {
    event: 'rules.step', at: NOW.toISOString(), project: PROJECT, session: 's-1', payload: { role: 'main-agent', model: GLM_MODEL, session: 's-1' },
  })
  assert.deepEqual(stepEvent({ at: NOW.toISOString(), project: PROJECT }).payload, {})
  assert.equal(modelId({ provider: 'zai', model: 'glm-4.6' }), 'zai/glm-4.6')
  assert.equal(modelId({ model: 'glm-4.6' }), '/glm-4.6')
  assert.equal(modelId({ provider: 'zai' }), undefined)
  assert.equal(modelId({}), undefined)
})

test('the model pattern ^[^/]*/glm names the GLM family as isGlmModel does, also for ids that hold a slash', () => {
  const pattern = /^[^/]*\/glm/i
  const routes = [
    { provider: 'zai', model: 'glm-4.6' }, { provider: 'zai', model: 'GLM-5' }, { provider: 'openrouter', model: 'z-ai/glm-4.6' },
    { provider: 'deepseek', model: 'deepseek-chat' }, { provider: 'zai', model: 'my-glm' }, { provider: 'x', model: 'glmish' },
    { model: 'glm-4.6' }, { provider: 'glm-zcode', model: 'claude' }, { provider: 'zai', model: '' },
  ]
  for (const route of routes) {
    const id = modelId(route)
    assert.equal(id !== undefined && pattern.test(id), isGlmModel(route.model), `${route.provider ?? ''}/${route.model ?? ''}`)
  }
  assert.equal(pattern.test('openrouter/z-ai/glm-4.6'), false)
  assert.equal(pattern.test('zai/glm-4.6'), true)
  assert.equal(/^[^/]*\/z-ai\/glm/i.test('openrouter/z-ai/glm-4.6'), true, 'a provider that serves another family\'s ids can be named in full')
})

// ------------------------------------------------------------------ signals

test('the effective value of a signal: a person\'s value first, then a live detector, otherwise unknown with a reason', () => {
  const type = { kind: 'boolean' } as const
  const later = new Date(NOW.getTime() + 1000).toISOString()
  const earlier = new Date(NOW.getTime() - 1000).toISOString()
  const reading = effectiveSignal('code-freeze', undefined, NOW)
  assert.deepEqual([reading.name, reading.source, 'value' in reading], ['code-freeze', 'none', false])
  assert.match(reading.unknown ?? '', /not defined/)
  const none = effectiveSignal('code-freeze', { type }, NOW)
  assert.equal(none.source, 'none')
  assert.match(none.unknown ?? '', /no value/)
  assert.deepEqual(effectiveSignal('code-freeze', { type, manual: { value: true, at: earlier } }, NOW), { name: 'code-freeze', source: 'manual', value: true })
  assert.deepEqual(effectiveSignal('code-freeze', { type, manual: { value: false, at: earlier, expiresAt: later } }, NOW), { name: 'code-freeze', source: 'manual', value: false })
  assert.equal(effectiveSignal('code-freeze', { type, manual: { value: true, at: earlier, expiresAt: NOW.toISOString() } }, NOW).unknown !== undefined, true, 'a value expires at its time, not after')
  const detected = { type, detector: 'd-errors', detected: { value: true, since: earlier } }
  assert.deepEqual(effectiveSignal('errors', detected, NOW, { live: true }), { name: 'errors', source: 'detector', value: true })
  const stale = effectiveSignal('errors', detected, NOW, { live: false, reason: 'the host that runs the detector has gone' })
  assert.equal(stale.unknown, 'the host that runs the detector has gone', 'a detector that is not live is never read as no')
  assert.match(effectiveSignal('errors', detected, NOW).unknown ?? '', /detector/)
  assert.match(effectiveSignal('errors', { type, detector: 'd-errors' }, NOW, { live: true }).unknown ?? '', /detector/, 'a detector that has produced nothing')
  assert.deepEqual(effectiveSignal('errors', { ...detected, manual: { value: false, at: earlier } }, NOW, { live: true }), { name: 'errors', source: 'manual', value: false }, 'a person always overrides the detector')
  assert.deepEqual(effectiveSignal('errors', { ...detected, manual: { value: false, at: earlier, expiresAt: earlier } }, NOW, { live: true }), { name: 'errors', source: 'detector', value: true }, 'an expired value gives way to the detector')
})

// --------------------------------------------------------------- conditions

const READINGS = [
  peak(true),
  { name: 'code-freeze', source: 'manual', value: false },
  { name: 'level', source: 'detector', value: 3 },
  { name: 'phase', source: 'manual', value: 'ship' },
  { name: 'ghost', source: 'none', unknown: 'the detector failed' },
] as const

function truth(condition: Condition, extra: Partial<Parameters<typeof judgeInput>[0]> = {}): string {
  return evaluateCondition(condition, inputOf({}, READINGS, { stage: { stage: 'design' }, ...extra }))
}

const T: Condition = { signal: 'glm-peak', is: true }
const F: Condition = { signal: 'glm-peak', is: false }
const U: Condition = { signal: 'ghost', is: true }

test('a signal condition: is, in, above, below and known; an unreadable signal is unknown, never no', () => {
  assert.deepEqual([T, F, { signal: 'code-freeze', is: false }, { signal: 'phase', is: 'ship' }, { signal: 'phase', is: 'build' }].map(condition => truth(condition)), ['true', 'false', 'true', 'true', 'false'])
  assert.deepEqual([{ signal: 'level', in: [3, 4] }, { signal: 'level', in: [1] }, { signal: 'phase', in: ['build', 'ship'] }].map(condition => truth(condition)), ['true', 'false', 'true'])
  assert.deepEqual([{ signal: 'level', above: 2 }, { signal: 'level', above: 3 }, { signal: 'level', below: 4 }, { signal: 'level', below: 3 }].map(condition => truth(condition)), ['true', 'false', 'true', 'false'])
  assert.equal(truth({ signal: 'phase', above: 1 }), 'unknown', 'a value that is not a number cannot be compared')
  assert.deepEqual([U, { signal: 'ghost', in: [1] }, { signal: 'ghost', above: 1 }, { signal: 'absent', is: true }].map(condition => truth(condition)), ['unknown', 'unknown', 'unknown', 'unknown'])
  const known: Condition[] = [{ signal: 'glm-peak', known: true }, { signal: 'ghost', known: true }, { signal: 'absent', known: true }]
  assert.deepEqual(known.map(condition => truth(condition)), ['true', 'false', 'false'], 'known asks whether it can be read: the answer is yes or no')
  assert.equal(truth({ signal: 'glm-peak', is: true }, { signals: [peak(undefined)] }), 'unknown')
})

test('all, any and not are three-valued: no wins over unknown for all, yes over unknown for any, not keeps unknown', () => {
  assert.deepEqual([[T, T], [T, F], [T, U], [F, U], [U, U], [T, T, F]].map(items => truth({ all: items })), ['true', 'false', 'unknown', 'false', 'unknown', 'false'])
  assert.deepEqual([[T, F], [F, F], [F, U], [T, U], [U, U]].map(items => truth({ any: items })), ['true', 'false', 'unknown', 'true', 'unknown'])
  assert.deepEqual([T, F, U].map(item => truth({ not: item })), ['false', 'true', 'unknown'])
  assert.equal(truth({ not: { all: [T, { any: [F, { not: U }] }] } }), 'unknown', 'unknown passes up through every level that cannot decide')
  assert.equal(truth({ all: [T, { any: [F, U] }] }), 'unknown')
  assert.equal(truth({ all: [T, { any: [F, { not: F }] }] }), 'true')
})

test('a clock condition reads the moment of the judgement in its own zone: from is in, to is out, days count from 1 = Monday', () => {
  const at = (from: string, to: string, extra: Record<string, unknown> = {}): Condition => ({ clock: { from, to, tz: '+08:00', ...extra } })
  // NOW is Wednesday 15:00 in UTC+8.
  assert.deepEqual([at('14:00', '18:00'), at('18:00', '23:00'), at('15:00', '16:00'), at('09:00', '15:00')].map(condition => truth(condition)), ['true', 'false', 'true', 'false'])
  assert.deepEqual([at('14:00', '18:00', { days: [1, 2, 3, 4, 5] }), at('14:00', '18:00', { days: [1, 2] }), at('14:00', '18:00', { days: [3] }), at('14:00', '18:00', { days: [6, 7] })].map(condition => truth(condition)), ['true', 'false', 'true', 'false'])
  assert.equal(truth({ clock: { from: '06:00', to: '08:00', tz: '+00:00' } }), 'true', '07:00 UTC')
  assert.equal(truth({ clock: { from: '06:00', to: '08:00', tz: '-05:30' } }), 'false', '01:30 at UTC-05:30')
  assert.equal(truth({ clock: { from: '01:00', to: '02:00', tz: '-05:30' } }), 'true')
  // Thursday 00:30 in UTC+8: inside a window that began Wednesday 22:00.
  const night = new Date('2026-11-04T16:30:00.000Z')
  const overnight = (days?: readonly number[]): Condition => at('22:00', '06:00', days === undefined ? {} : { days })
  assert.deepEqual([overnight(), overnight([3]), overnight([4]), overnight([3, 4])].map(condition => truth(condition, { now: night })), ['true', 'true', 'false', 'true'], 'a window across midnight belongs to the day it began')
  assert.equal(truth(overnight(), { now: NOW }), 'false', '15:00 is outside 22:00-06:00')
  assert.equal(truth(at('22:00', '06:00'), { now: new Date('2026-11-04T14:00:00.000Z') }), 'true', '22:00 itself is in')
  assert.equal(truth(at('22:00', '06:00'), { now: new Date('2026-11-04T22:00:00.000Z') }), 'false', '06:00 itself is out')
  assert.equal(truth(at('00:00', '23:59')), 'true')
})

test('a clock without a zone, or with local, reads the zone of this process', () => {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const clockAt = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const hour = 3_600_000
  const window = { from: clockAt(new Date(NOW.getTime() - hour)), to: clockAt(new Date(NOW.getTime() + hour)) }
  const elsewhere: Condition = { clock: { from: clockAt(new Date(NOW.getTime() + hour)), to: clockAt(new Date(NOW.getTime() + 2 * hour)) } }
  assert.deepEqual([truth({ clock: { ...window, tz: 'local' } }), truth({ clock: window }), truth(elsewhere)], ['true', 'true', 'false'])
  const weekday = NOW.getDay() === 0 ? 7 : NOW.getDay()
  assert.deepEqual([truth({ clock: { ...window, days: [weekday] } }), truth({ clock: { ...window, days: [weekday % 7 + 1] } })], ['true', 'false'], 'the day is the local day')
})

test('a stage condition asks the focused goal\'s stage; without a focus it is unknown', () => {
  assert.deepEqual([{ stage: ['interview', 'design'] }, { stage: ['execute'] }].map(condition => truth(condition)), ['true', 'false'])
  assert.equal(evaluateCondition({ stage: ['design'] }, inputOf({}, [])), 'unknown')
  assert.equal(truth({ stage: ['design'] }, { stage: { unknown: 'the command line has no focus' } }), 'unknown')
})

// -------------------------------------------------------------------- judge

const rulesFor = (...rules: ReturnType<typeof ruleOf>[]) => rules
const verdictOf = (call: CallParts, rules: readonly ReturnType<typeof ruleOf>[], signals = [peak(true)]) => judge(inputOf(call, signals), rules)

test('a rule applies to a call when its event, its filter and its condition all hold; the first two are decided by the call, the last by the signals', () => {
  const write = ruleOf({ id: 'r-write', filter: { tool: { in: ['write', 'edit'] } } })
  assert.equal(verdictOf({ tool: 'pwsh' }, [write]).effect, 'allow')
  assert.deepEqual(verdictOf({ tool: 'write' }, [write]).hits.map(hit => [hit.rule, hit.effect]), [['r-write', 'block']])
  const push = ruleOf({ id: 'r-push', filter: { command: { matches: '^\\s*git\\s+push\\b' } } })
  assert.equal(verdictOf({ command: '  GIT push origin' }, [push]).effect, 'block', 'a pattern ignores case')
  assert.equal(verdictOf({ command: 'git status' }, [push]).effect, 'allow')
  const migrations = ruleOf({ id: 'r-mig', filter: { writes: { paths: ['migrations/**'] } } })
  assert.equal(verdictOf({ tool: 'write', writes: ['migrations/2026/0042.sql'] }, [migrations]).effect, 'block')
  assert.equal(verdictOf({ tool: 'write', writes: ['src/a.ts'] }, [migrations]).effect, 'allow')
  assert.equal(verdictOf({ tool: 'pwsh' }, [migrations]).effect, 'allow', 'a call with no write targets does not match a filter on them')
  const nested = ruleOf({ id: 'r-nested', filter: { nested: { is: true } } })
  assert.deepEqual([verdictOf({ nested: true }, [nested]).effect, verdictOf({}, [nested]).effect], ['block', 'allow'])
  const frozen = ruleOf({ id: 'r-frozen', condition: { signal: 'code-freeze', is: true } })
  const withFreeze = (value: boolean): ReturnType<typeof peak> => ({ name: 'code-freeze', source: 'manual', value })
  assert.deepEqual([true, false].map(value => verdictOf({}, [frozen], [withFreeze(value)]).effect), ['block', 'allow'])
})

test('events decide where a rule looks: a dispatch is also a tool call, a rule on one event does not see the other', () => {
  const onDispatch = ruleOf({ id: 'r-dispatch', when: { kind: 'event', events: ['gate.dispatch'] }, filter: { targetModel: { matches: '^[^/]*/glm' } }, action: { kind: 'queue' } })
  const onCall = ruleOf({ id: 'r-call', filter: { tool: { in: ['subagent'] } }, action: { kind: 'record' } })
  const both = ruleOf({ id: 'r-both', when: { kind: 'event', events: ['gate.tool-call', 'gate.dispatch'] }, filter: { role: { in: ['root'] } }, action: { kind: 'record' } })
  const dispatch = { tool: 'subagent', dispatch: { targetModel: GLM_MODEL } }
  assert.deepEqual(verdictOf(dispatch, [onDispatch, onCall, both]).hits.map(hit => [hit.rule, hit.effect]), [['r-dispatch', 'queue'], ['r-both', 'record'], ['r-call', 'record']], 'a rule on both events counts once')
  assert.equal(verdictOf({ tool: 'subagent' }, [onDispatch]).effect, 'allow', 'a plain tool call is not a dispatch')
  assert.equal(verdictOf({ ...dispatch, dispatch: { targetModel: OTHER_MODEL } }, [onDispatch]).effect, 'allow')
  const trunk = ruleOf({ id: 'r-trunk', when: { kind: 'event', events: ['gate.trunk-advance'] }, filter: { branch: { in: ['main'] } } })
  assert.equal(verdictOf({ trunkAdvance: { branch: 'main', from: 'a', to: 'b' } }, [trunk]).effect, 'block')
  assert.equal(verdictOf({ trunkAdvance: { branch: 'dev', from: 'a', to: 'b' } }, [trunk]).effect, 'allow')
  assert.equal(verdictOf({}, [trunk]).effect, 'allow')
})

test('a field the call cannot tell means the rule does not apply to it, and the result says which and why', () => {
  const roleRule = ruleOf({ id: 'r-role', filter: { role: { in: ['subagent'] } } })
  const bare = (parts: Partial<Parameters<typeof judgeInput>[0]> = {}) => judgeInput({ now: NOW, project: PROJECT, events: gateEvents({ at: NOW.toISOString(), project: PROJECT, tool: 'pwsh' }), signals: [peak(true)], ...parts })
  const result = judge(bare({ unreadable: { role: 'the command line was not given --role' } }), [roleRule])
  assert.equal(result.effect, 'allow')
  assert.deepEqual(result.subjects, [{ rule: 'r-role', item: 'role', unknown: 'the command line was not given --role' }])
  assert.match(judge(bare(), [roleRule]).subjects[0]?.unknown ?? '', /role/, 'a reason is always given')
  const several = ruleOf({ id: 'r-several', filter: { model: { in: ['zai/glm-4.6'] }, session: { in: ['s-1'] } } })
  assert.deepEqual(judge(bare(), [several]).subjects.map(subject => subject.item), ['model', 'session'])
  const plain = ruleOf({ id: 'r-plain', filter: { tool: { in: ['pwsh'] } } })
  const unfiltered = judge(bare(), [plain, ruleOf({ id: 'r-open' })])
  assert.deepEqual([unfiltered.effect, unfiltered.subjects, unfiltered.hits.map(hit => hit.rule)], ['block', [], ['r-open', 'r-plain']], 'a rule that does not ask about the subject does not need it')
  const dispatching = judge(judgeInput({ now: NOW, project: PROJECT, events: gateEvents(callOf({ tool: 'subagent', dispatch: {} })), signals: [peak(true)] }), [ruleOf({ id: 'r-target', when: { kind: 'event', events: ['gate.dispatch'] }, filter: { targetModel: { matches: 'glm' } }, action: { kind: 'queue' } })])
  assert.deepEqual([dispatching.effect, dispatching.subjects.map(subject => subject.item)], ['allow', ['targetModel']], 'a dispatch that names no model leaves targetModel unreadable')
  const elsewhere = ruleOf({ id: 'r-other-event', when: { kind: 'event', events: ['gate.dispatch'] }, filter: { role: { in: ['subagent'] } } })
  assert.deepEqual(judge(bare(), [elsewhere]).subjects, [], 'a rule on an event that did not happen has nothing to ask')
})

test('a rule that is lifted, expired, past its time, ended by its condition or meant for another session does not apply', () => {
  const day = 86_400_000
  const at = (offset: number): string => new Date(NOW.getTime() + offset).toISOString()
  const rules = rulesFor(
    ruleOf({ id: 'r-lifted', status: 'lifted' }),
    ruleOf({ id: 'r-expired', status: 'expired' }),
    ruleOf({ id: 'r-ttl-past', lifetime: { kind: 'ttl', expiresAt: at(-1) } }),
    ruleOf({ id: 'r-ttl-now', lifetime: { kind: 'ttl', expiresAt: at(0) } }),
    ruleOf({ id: 'r-until-met', lifetime: { kind: 'until', condition: { signal: 'glm-peak', is: true } } }),
    ruleOf({ id: 'r-other-session', scope: 'session', sessionId: 's-9', lifetime: { kind: 'session' } }),
  )
  assert.deepEqual(verdictOf({}, rules).hits, [])
  const live = rulesFor(
    ruleOf({ id: 'r-ttl-live', lifetime: { kind: 'ttl', expiresAt: at(day) } }),
    ruleOf({ id: 'r-until-open', lifetime: { kind: 'until', condition: { signal: 'glm-peak', is: false } } }),
    ruleOf({ id: 'r-until-unknown', lifetime: { kind: 'until', condition: { signal: 'ghost', is: true } } }),
    ruleOf({ id: 'r-this-session', scope: 'session', sessionId: 's-1', lifetime: { kind: 'session' } }),
  )
  assert.deepEqual(verdictOf({}, live, [peak(true), { name: 'ghost', source: 'none', unknown: 'gone' }]).hits.map(hit => hit.rule), ['r-this-session', 'r-ttl-live', 'r-until-open', 'r-until-unknown'], 'a condition that cannot be read does not end a rule')
})

test('a condition that cannot be read leaves a rule alone unless the rule says to apply; the result lists each condition\'s value', () => {
  const skip = ruleOf({ id: 'r-skip', condition: { signal: 'glm-peak', is: true } })
  const apply = ruleOf({ id: 'r-apply', condition: { signal: 'glm-peak', is: true }, onUnknown: 'apply' })
  const none = ruleOf({ id: 'r-none' })
  const unreadable = verdictOf({}, [skip, apply, none], [peak(undefined)])
  assert.deepEqual(unreadable.hits.map(hit => hit.rule), ['r-apply', 'r-none'])
  assert.deepEqual(unreadable.evaluated, [{ rule: 'r-skip', when: 'unknown' }, { rule: 'r-apply', when: 'unknown' }, { rule: 'r-none', when: 'true' }])
  const off = verdictOf({}, [skip, apply, none], [peak(false)])
  assert.deepEqual(off.hits.map(hit => hit.rule), ['r-none'])
  assert.deepEqual(off.evaluated.map(entry => entry.when), ['false', 'false', 'true'])
  assert.deepEqual(verdictOf({}, [skip, apply, none], [peak(true)]).hits.map(hit => hit.rule), ['r-apply', 'r-none', 'r-skip'])
})

// ------------------------------------------------------------------ combine

const hit = (rule: string, effect: RuleHit['effect']): RuleHit => ({ rule, title: rule, effect })

test('the strongest effect wins: block over queue over record over inform; equals are listed by id', () => {
  assert.deepEqual(combine([]), { effect: 'allow', hits: [], strongest: [] })
  assert.equal(combine([hit('r-a', 'inform')]).effect, 'inform')
  assert.equal(combine([hit('r-a', 'inform'), hit('r-b', 'record')]).effect, 'record')
  assert.equal(combine([hit('r-a', 'record'), hit('r-b', 'queue'), hit('r-c', 'inform')]).effect, 'queue')
  const mixed = combine([hit('r-d', 'queue'), hit('r-b', 'block'), hit('r-c', 'record'), hit('r-a', 'block')])
  assert.equal(mixed.effect, 'block')
  assert.deepEqual(mixed.strongest.map(entry => entry.rule), ['r-a', 'r-b'])
  assert.deepEqual(mixed.hits.map(entry => entry.rule), ['r-a', 'r-b', 'r-d', 'r-c'], 'strongest first, then by id')
  assert.deepEqual(combine([hit('r-b', 'queue'), hit('r-a', 'queue')]).strongest.map(entry => entry.rule), ['r-a', 'r-b'])
})

test('one more rule never loosens a verdict', () => {
  const base = [ruleOf({ id: 'r-q', action: { kind: 'queue' } })]
  const more = [...base, ruleOf({ id: 'r-r', action: { kind: 'record' } }), ruleOf({ id: 'r-b' })]
  const order = ['allow', 'inform', 'record', 'queue', 'block']
  assert.ok(order.indexOf(verdictOf({}, more).effect) >= order.indexOf(verdictOf({}, base).effect))
  assert.equal(verdictOf({}, base).effect, 'queue')
  assert.equal(verdictOf({}, more).effect, 'block')
})

test('a rules.step event carries only informing rules; they come out as inform', () => {
  const note = ruleOf({ id: 'r-friday', when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } })
  const input = judgeInput({ now: NOW, project: PROJECT, events: [stepEvent({ at: NOW.toISOString(), project: PROJECT, role: 'root', model: GLM_MODEL, session: 's-1' })], signals: [] })
  const result = judge(input, [note, ruleOf({ id: 'r-gate' })])
  assert.deepEqual([result.effect, result.hits.map(entry => entry.rule)], ['inform', ['r-friday']])
})

// ------------------------------------------------- a script not approved here

const scripted = (over: Partial<ReturnType<typeof ruleOf>> = {}): ReturnType<typeof ruleOf> =>
  ruleOf({ id: 'r-script', action: { kind: 'script', script: { file: 'docs/rules/scripts/r-script.mjs', sha256: SHA, lang: 'node' } }, ...over })

test('a script that has no approval on this machine is not run and is judged by its failure setting: allow by default, block on a trunk advance', () => {
  const plain = verdictOf({}, [scripted()])
  assert.deepEqual([plain.effect, plain.hits, plain.pending], ['allow', [], []])
  assert.equal(plain.refused.length, 1)
  assert.deepEqual([plain.refused[0]?.rule, plain.refused[0]?.event, plain.refused[0]?.onError], ['r-script', 'gate.tool-call', 'allow'])
  assert.match(plain.refused[0]?.reason ?? '', /not approved on this machine/)
  const blocking = verdictOf({}, [scripted({ action: { kind: 'script', script: { file: 'docs/rules/scripts/r-script.mjs', sha256: SHA, lang: 'node' }, onError: 'block' } })])
  assert.equal(blocking.effect, 'block')
  assert.match(blocking.hits[0]?.reason ?? '', /not approved on this machine/)
  assert.match(blocking.hits[0]?.reason ?? '', /r-script/)
  const trunk = scripted({ when: { kind: 'event', events: ['gate.trunk-advance'] } })
  const advance = { trunkAdvance: { branch: 'main', from: 'a', to: 'b' } }
  assert.equal(verdictOf(advance, [trunk]).effect, 'block', 'the default on a trunk advance is to block')
  const allowed = scripted({ when: { kind: 'event', events: ['gate.trunk-advance'] }, action: { kind: 'script', script: { file: 'docs/rules/scripts/r-script.mjs', sha256: SHA, lang: 'node' }, onError: 'allow' } })
  assert.equal(verdictOf(advance, [allowed]).effect, 'allow', 'what the entry says wins over the default')
  const bothEvents = scripted({ when: { kind: 'event', events: ['gate.tool-call', 'gate.trunk-advance'] } })
  assert.deepEqual([verdictOf({}, [bothEvents]).effect, verdictOf(advance, [bothEvents]).effect], ['allow', 'block'], 'each event has its own default')
  assert.equal(verdictOf({}, [scripted({ filter: { tool: { in: ['write'] } } })]).refused.length, 0, 'a script is judged only where its filter holds')
})

test('an approved script is handed back to be run with its timing, and only when no rule has already blocked the call', () => {
  const approved = { approved: new Set(['r-script']) }
  const run = judge(inputOf({}, [peak(true)]), [scripted()], approved)
  assert.deepEqual([run.effect, run.hits, run.refused], ['allow', [], []])
  assert.deepEqual(run.pending, [{ rule: 'r-script', event: 'gate.tool-call', script: { file: 'docs/rules/scripts/r-script.mjs', sha256: SHA, lang: 'node' }, timeoutSeconds: 30, onError: 'allow' }])
  const timed = judge(inputOf({}, [peak(true)]), [scripted({ action: { kind: 'script', script: { file: 'docs/rules/scripts/r-script.mjs', sha256: SHA, lang: 'node' }, timeoutSeconds: 5, onError: 'block' } })], approved)
  assert.deepEqual([timed.pending[0]?.timeoutSeconds, timed.pending[0]?.onError], [5, 'block'])
  const trunk = judge(inputOf({ trunkAdvance: { branch: 'main', from: 'a', to: 'b' } }, [peak(true)]), [scripted({ when: { kind: 'event', events: ['gate.trunk-advance'] } })], approved)
  assert.deepEqual([trunk.pending[0]?.event, trunk.pending[0]?.onError], ['gate.trunk-advance', 'block'])
  const blocked = judge(inputOf({}, [peak(true)]), [scripted(), ruleOf({ id: 'r-block' })], approved)
  assert.deepEqual([blocked.effect, blocked.pending], ['block', []], 'a block that needs no script means the script is not run')
  const queued = judge(inputOf({}, [peak(true)]), [scripted(), ruleOf({ id: 'r-queue', action: { kind: 'queue' } })], approved)
  assert.equal(queued.pending.length, 1, 'a script may still turn a queue into a block')
  const other = judge(inputOf({}, [peak(true)]), [scripted({ id: 'r-other-script' })], approved)
  assert.equal(other.pending.length, 0, 'approval belongs to the rule')
  assert.equal(other.refused.length, 1)
})

test('a stored script whose timing is out of range is not run either', () => {
  const broken = scripted({ action: { kind: 'script', script: { file: 'docs/rules/scripts/r-script.mjs', sha256: SHA, lang: 'node' }, timeoutSeconds: 99 } })
  const result = judge(inputOf({}, [peak(true)]), [broken], { approved: new Set(['r-script']) })
  assert.deepEqual([result.effect, result.pending], ['allow', []])
  assert.match(result.refused[0]?.reason ?? '', /timing/)
})
