/**
 * The rules board's entries that live in code (docs/ORCHESTRATION.md §16,
 * design §3.1, §3.6, §10.1): the default rule and its four peak-level
 * entries, which of them each level enables, what they do to a call, and the
 * catalog of the rules that other rows implement.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { builtinRulesFor, CATALOG, GLM_PEAK_PRICING, GLM_PEAK_REDUCE, GLM_PEAK_STOP, GLM_PEAK_STOP_DISPATCH, GLM_PEAK_STOP_SCRIPTS } from '../src/rules/builtin.ts'
import { gateEvents, stepEvent } from '../src/rules/events.ts'
import { judge, judgeInput } from '../src/rules/judge.ts'
import { validateRule } from '../src/rules/model.ts'
import { GUARD_RULES } from '../src/guard/catalog.ts'
import { MAIN_AGENT_RULES } from '../src/guard/main-agent-rules.ts'
import { HOURNESS_ROWS } from '../src/shared/health.ts'
import type { PeakLevel } from '../src/shared/peak-mode.ts'
import { RULES_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { contextOf, GLM_MODEL, inputOf, NOW, OTHER_MODEL, peak, PROJECT, type CallParts } from './rules-fixtures.ts'

const LEVELS: readonly PeakLevel[] = ['inform', 'reduce', 'stop']
const GLM_SUBAGENT = { role: 'subagent', model: GLM_MODEL } as const
const PRICING = 'builtin:glm-peak-pricing'

function verdict(level: PeakLevel, call: CallParts, signals = [peak(true)]) {
  return judge(inputOf(call, signals), builtinRulesFor(level))
}

const summary = (level: PeakLevel, call: CallParts, signals = [peak(true)]) => {
  const result = verdict(level, call, signals)
  return [result.effect, result.hits.map(entry => entry.rule)]
}

test('the default rule is one entry; reduce adds one, stop adds three, and each is partOf the default rule', () => {
  assert.deepEqual(builtinRulesFor('inform').map(rule => rule.id), [PRICING])
  assert.deepEqual(builtinRulesFor('reduce').map(rule => rule.id), [PRICING, 'builtin:glm-peak-reduce'])
  assert.deepEqual(builtinRulesFor('stop').map(rule => rule.id), [PRICING, 'builtin:glm-peak-stop', 'builtin:glm-peak-stop-dispatch', 'builtin:glm-peak-stop-scripts'])
  assert.deepEqual([GLM_PEAK_PRICING, GLM_PEAK_REDUCE, GLM_PEAK_STOP, GLM_PEAK_STOP_DISPATCH, GLM_PEAK_STOP_SCRIPTS].map(rule => rule.partOf), [undefined, PRICING, PRICING, PRICING, PRICING])
  assert.deepEqual([GLM_PEAK_PRICING, GLM_PEAK_REDUCE, GLM_PEAK_STOP, GLM_PEAK_STOP_DISPATCH, GLM_PEAK_STOP_SCRIPTS].map(rule => rule.enabledBy), [undefined, ['reduce'], ['stop'], ['stop'], ['stop']])
  assert.deepEqual([GLM_PEAK_PRICING, GLM_PEAK_STOP].map(rule => rule.ticketPerSession), [undefined, true], 'only the stop entry that holds a whole session has one ticket per session')
  assert.equal(GLM_PEAK_PRICING.toldBy, 'glm-prompt')
  assert.ok([GLM_PEAK_REDUCE, GLM_PEAK_STOP, GLM_PEAK_STOP_DISPATCH, GLM_PEAK_STOP_SCRIPTS].every(rule => rule.toldBy === undefined))
})

test('every entry is a rule of the 0.9 shape for the code: builtin scope, until lifted, a condition that skips when glm-peak cannot be read', () => {
  const context = contextOf({ code: true })
  for (const rule of builtinRulesFor('stop').concat(GLM_PEAK_REDUCE)) {
    assert.deepEqual(validateRule(rule, context), [], rule.id)
    assert.equal(rule.scope, 'builtin')
    assert.deepEqual(rule.lifetime, { kind: 'until-lifted' })
    assert.deepEqual(rule.condition, { signal: 'glm-peak', is: true })
    assert.equal(rule.onUnknown, 'skip', `${rule.id}: nothing is held back when the peak cannot be read`)
    assert.equal(rule.source, 'rules')
  }
  assert.deepEqual(GLM_PEAK_PRICING.when, { kind: 'event', events: ['rules.step'] })
  assert.deepEqual(GLM_PEAK_PRICING.action, { kind: 'inform' })
  assert.deepEqual(GLM_PEAK_PRICING.filter, { model: { matches: '^[^/]*/glm' } })
  assert.deepEqual(builtinRulesFor('stop').slice(1).map(rule => rule.action), [{ kind: 'queue' }, { kind: 'queue' }, { kind: 'queue' }])
  const asPerson = (rule: object): string[] => validateRule(rule, contextOf()).map(issue => issue.path)
  assert.ok(asPerson(GLM_PEAK_STOP_SCRIPTS).includes('filter.glmSpend'), 'a person\'s rule cannot filter on what a script reports')
  assert.ok(asPerson(GLM_PEAK_STOP).includes('ticketPerSession'), 'a person\'s rule cannot hold a whole session')
  assert.ok(asPerson(GLM_PEAK_PRICING).includes('scope'), 'builtin is not a scope a person can write')
})

test('the default rule only informs: a GLM step in a peak is told, nothing else is, and no call changes its verdict', () => {
  const step = (model: string | undefined, signals = [peak(true)]) => judge(
    judgeInput({ now: NOW, project: PROJECT, events: [stepEvent({ at: NOW.toISOString(), project: PROJECT, role: 'root', session: 's-1', ...(model === undefined ? {} : { model }) })], signals }),
    [GLM_PEAK_PRICING],
  )
  const told = step(GLM_MODEL)
  assert.deepEqual([told.effect, told.hits.map(entry => entry.rule)], ['inform', [PRICING]])
  assert.deepEqual([step(OTHER_MODEL).effect, step('openrouter/z-ai/glm-4.6').effect, step(GLM_MODEL, [peak(false)]).effect, step(GLM_MODEL, [peak(undefined)]).effect], ['allow', 'allow', 'allow', 'allow'])
  assert.deepEqual(step(undefined).subjects.map(subject => subject.item), ['model'], 'a step with no request header yet is not told')
  const calls = [
    {}, { tool: 'write', writes: ['src/a.ts'] }, GLM_SUBAGENT, { role: 'main-agent' }, { tool: 'subagent', dispatch: { targetModel: GLM_MODEL } },
    { glmSpend: 'optional' }, { glmSpend: 'necessary' }, { trunkAdvance: { branch: 'main', from: 'a', to: 'b' } }, { nested: true },
  ] as const
  for (const call of calls) {
    const results = [peak(true), peak(false), peak(undefined)].map(reading => judge(inputOf(call, [reading]), builtinRulesFor('inform')))
    assert.deepEqual(results[0], results[1], JSON.stringify(call))
    assert.deepEqual(results[0], results[2], JSON.stringify(call))
    assert.equal(results[0]?.effect, 'allow')
  }
})

test('reduce holds back only a script that says it spends GLM credit and could wait, and only in a peak', () => {
  assert.deepEqual(summary('reduce', { glmSpend: 'optional' }), ['queue', ['builtin:glm-peak-reduce']])
  assert.deepEqual(summary('reduce', { glmSpend: 'necessary' }), ['allow', []])
  assert.deepEqual(summary('reduce', {}), ['allow', []])
  assert.deepEqual(summary('reduce', GLM_SUBAGENT), ['allow', []], 'the other calls of a GLM subagent go through')
  assert.deepEqual(summary('reduce', { role: 'main-agent', tool: 'subagent', dispatch: { targetModel: GLM_MODEL } }), ['allow', []], 'the cap on workers is the dispatcher\'s, not the gate\'s')
  for (const reading of [peak(false), peak(undefined)]) assert.deepEqual(summary('reduce', { glmSpend: 'optional' }, [reading]), ['allow', []])
  const script = judge(judgeInput({ now: NOW, project: PROJECT, events: gateEvents({ at: NOW.toISOString(), project: PROJECT, tool: 'pwsh', glmSpend: 'optional' }), signals: [peak(true)] }), builtinRulesFor('reduce'))
  assert.deepEqual([script.effect, script.subjects], ['queue', []], 'a script is not an agent: it has no role, model or session')
})

test('stop queues every call of a GLM subagent in a peak except looking at the rules, one ticket for the whole session', () => {
  for (const tool of ['pwsh', 'write', 'read', 'subagent', 'graph_show']) assert.deepEqual(summary('stop', { ...GLM_SUBAGENT, tool }), ['queue', ['builtin:glm-peak-stop']], tool)
  assert.deepEqual(RULES_TOOL_NAMES, ['rules_show', 'rules_propose'])
  for (const tool of RULES_TOOL_NAMES) assert.deepEqual(summary('stop', { ...GLM_SUBAGENT, tool }), ['allow', []], `${tool} stays readable while the agent is held`)
  const hit = verdict('stop', GLM_SUBAGENT).hits[0]
  assert.equal(hit?.ticketPerSession, true)
  assert.deepEqual(summary('stop', { ...GLM_SUBAGENT, nested: true }), ['queue', ['builtin:glm-peak-stop']], 'a call from a run_code program counts as a call')
  assert.deepEqual(summary('stop', { role: 'subagent', model: OTHER_MODEL }), ['allow', []], 'a subagent of another model family is not held')
  assert.deepEqual(summary('stop', { role: 'subagent', model: 'openrouter/z-ai/glm-4.6' }), ['allow', []], 'the family is decided as isGlmModel decides it')
  assert.deepEqual(summary('stop', { role: 'root', model: GLM_MODEL }), ['allow', []])
  for (const reading of [peak(false), peak(undefined)]) assert.deepEqual(summary('stop', GLM_SUBAGENT, [reading]), ['allow', []], 'outside a peak, or when the peak cannot be read, nothing is held')
})

test('stop queues the dispatch of a GLM subagent, whoever dispatches, and a dispatch that names no model is not guessed at', () => {
  const dispatch = (targetModel: string | undefined, caller: CallParts = { role: 'main-agent' }) => summary('stop', { ...caller, tool: 'subagent', dispatch: targetModel === undefined ? {} : { targetModel } })
  assert.deepEqual(dispatch(GLM_MODEL), ['queue', ['builtin:glm-peak-stop-dispatch']], 'the one call of the main agent that stop touches: it is the subagent that is held back')
  assert.deepEqual(dispatch(OTHER_MODEL), ['allow', []])
  assert.deepEqual(dispatch(undefined), ['allow', []])
  assert.deepEqual(dispatch(GLM_MODEL, { role: 'root', model: OTHER_MODEL }), ['queue', ['builtin:glm-peak-stop-dispatch']])
  assert.deepEqual(dispatch(GLM_MODEL, GLM_SUBAGENT), ['queue', ['builtin:glm-peak-stop', 'builtin:glm-peak-stop-dispatch']], 'a held subagent that dispatches is held for both')
  const nameless = verdict('stop', { role: 'main-agent', tool: 'subagent', dispatch: {} })
  assert.deepEqual(nameless.subjects, [{ rule: 'builtin:glm-peak-stop-dispatch', item: 'targetModel', unknown: nameless.subjects[0]?.unknown ?? '' }])
  assert.notEqual(nameless.subjects[0]?.unknown, '')
})

test('stop queues a script that says it spends GLM credit, optional or necessary, and a script is not an agent', () => {
  assert.deepEqual(summary('stop', { glmSpend: 'optional' }), ['queue', ['builtin:glm-peak-stop-scripts']])
  assert.deepEqual(summary('stop', { glmSpend: 'necessary' }), ['queue', ['builtin:glm-peak-stop-scripts']])
  assert.deepEqual(summary('stop', {}), ['allow', []], 'a script that says nothing is not held')
  assert.deepEqual(summary('stop', { glmSpend: 'optional', role: 'main-agent', model: GLM_MODEL }), ['queue', ['builtin:glm-peak-stop-scripts']], 'what a caller reports about a script counts wherever it comes from')
})

test('the main agent is never held at any level: every call but a GLM dispatch gets the verdict it gets with the mode off', () => {
  const calls = [
    { tool: 'pwsh' }, { tool: 'write', writes: ['src/a.ts'] }, { tool: 'read' }, { tool: 'rules_show' }, { tool: 'propose_to_human' }, { tool: 'record_human_answer' },
    { tool: 'subagent' }, { tool: 'subagent', dispatch: { targetModel: OTHER_MODEL } }, { tool: 'subagent', dispatch: {} }, { nested: true }, { trunkAdvance: { branch: 'main', from: 'a', to: 'b' } },
  ] as const
  for (const model of [GLM_MODEL, OTHER_MODEL, 'openrouter/z-ai/glm-4.6']) {
    for (const call of calls) {
      const off = verdict('inform', { ...call, role: 'main-agent', model })
      for (const level of LEVELS) {
        for (const reading of [peak(true), peak(false), peak(undefined)]) {
          const held = judge(inputOf({ ...call, role: 'main-agent', model }, [reading]), builtinRulesFor(level))
          assert.deepEqual([held.effect, held.hits], [off.effect, off.hits], `${level} ${model} ${JSON.stringify(call)}`)
        }
      }
    }
  }
})

test('the catalog lists the guard framework\'s rules, the main agent\'s, the rules board\'s own gate and the default rule with its entries, each as <row>:<id>', () => {
  assert.deepEqual(CATALOG.map(entry => entry.id), [
    'guard:workspace-containment', 'guard:file-tools-only', 'guard:suppression-reason', 'guard:checker-config', 'guard:scratch-only', 'guard:lift-files-only',
    'graph:graph-files-only', 'loops:files-only', 'loops:schedule-tools', 'metrics:metrics-files-only', 'memory:habit-ask-first',
    ...MAIN_AGENT_RULES.map(rule => `design:${rule.id}`),
    'rules:files-only',
    'builtin:glm-peak-pricing', 'builtin:glm-peak-reduce', 'builtin:glm-peak-stop', 'builtin:glm-peak-stop-dispatch', 'builtin:glm-peak-stop-scripts',
  ])
  for (const rule of GUARD_RULES) {
    const entry = CATALOG.find(candidate => candidate.id === `${rule.row}:${rule.id}`)
    assert.deepEqual([entry?.title, entry?.row, entry?.effect], [rule.title, rule.row, 'block'], rule.id)
  }
  for (const rule of MAIN_AGENT_RULES) {
    const entry = CATALOG.find(candidate => candidate.id === `design:${rule.id}`)
    assert.deepEqual([entry?.title, entry?.row, entry?.effect], [rule.title, 'design', 'block'], rule.id)
  }
  const byId = (id: string) => CATALOG.find(entry => entry.id === id)
  assert.deepEqual([byId('rules:files-only')?.row, byId('rules:files-only')?.effect], ['rules', 'block'])
  assert.deepEqual([byId(PRICING)?.row, byId(PRICING)?.effect, byId(PRICING)?.toldBy], ['rules', 'inform', 'glm-prompt'])
  for (const rule of [GLM_PEAK_REDUCE, GLM_PEAK_STOP, GLM_PEAK_STOP_DISPATCH, GLM_PEAK_STOP_SCRIPTS]) {
    assert.deepEqual([byId(rule.id)?.row, byId(rule.id)?.effect, byId(rule.id)?.title], ['rules', 'queue', rule.title], rule.id)
  }
  assert.ok(CATALOG.every(entry => entry.plugin === 'dsh-hourness'), 'the rows are all in the orchestration package')
  assert.ok(CATALOG.every(entry => (HOURNESS_ROWS as readonly string[]).includes(entry.row)))
  assert.ok(CATALOG.every(entry => entry.title.length > 0 && !entry.title.includes('\n')))
  assert.equal(new Set(CATALOG.map(entry => entry.id)).size, CATALOG.length)
  assert.ok(CATALOG.every(entry => entry.toldBy === undefined || entry.id === PRICING))
})
