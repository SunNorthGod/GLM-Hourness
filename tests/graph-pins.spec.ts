import assert from 'node:assert/strict'
import test from 'node:test'
import { MODULE_READERS } from '../src/graph/execute-stage.ts'
import { parsePins, pinsOf, renderPins, staleness } from '../src/graph/pins.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { graphOf, must, node, sha256, splitGraph, stageEdit, throwingReaders, withNode } from './execute-helpers.ts'

/** A task with a source decision and a source question, under a feature under a goal: every pinned role in one graph. */
function chain() {
  return graphOf([
    node({ id: 'goal-1', type: 'goal', acceptance: ['goal done'], nonGoals: ['no extras'] }),
    node({ id: 'feature-1', type: 'feature', parent: 'goal-1', acceptance: ['feature done'] }),
    node({ id: 'task-1', type: 'task', parent: 'feature-1', kind: 'implement', acceptance: ['works'], nonGoals: ['no ui'], writeScope: ['src/'], edges: [{ type: 'source', to: 'decision-1' }, { type: 'source', to: 'question-1' }, { type: 'source', to: 'gone-1' }] }),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1', verification: 'unverified' }),
    node({ id: 'question-1', type: 'question', parent: 'goal-1', status: 'done', decision: 'A', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }] }),
  ])
}

const pinsFor = (graph: LoadedGraph, id = 'task-1') => pinsOf(graph, must(graph.nodes.get(id)), sha256)
const digestsOf = (graph: LoadedGraph, id = 'task-1') => Object.fromEntries(pinsFor(graph, id).map(pin => [pin.id, pin.digest]))

test('pinsOf: the task, its ancestors from the parent up, then each source once; a dangling source is left out', () => {
  assert.deepEqual(pinsFor(chain()).map(pin => pin.id), ['task-1', 'feature-1', 'goal-1', 'decision-1', 'question-1'])
  const twice = withNode(chain(), node({ id: 'task-1', type: 'task', parent: 'feature-1', edges: [{ type: 'source', to: 'goal-1' }, { type: 'source', to: 'decision-1' }, { type: 'source', to: 'decision-1' }] }))
  assert.deepEqual(pinsFor(twice).map(pin => pin.id), ['task-1', 'feature-1', 'goal-1', 'decision-1'])
  for (const pin of pinsFor(chain())) assert.match(pin.digest, /^[0-9a-f]{12}$/)
})

test('pinsOf: the digest function is the caller\'s and its first 12 digits are used', () => {
  const graph = chain()
  const pins = pinsOf(graph, must(graph.nodes.get('task-1')), () => 'abcdef0123456789'.repeat(4))
  assert.ok(pins.every(pin => pin.digest === 'abcdef012345'))
})

test('a digest covers only what changes intent: titles, bodies, history and the write scope do not move it', () => {
  const before = digestsOf(chain())
  const graph = chain()
  const retitled = withNode(graph, { ...must(graph.nodes.get('task-1')), title: 'another title', body: 'a long body', slope: 'uphill', writeScope: ['lib/'], history: [...must(graph.nodes.get('task-1')).history, { at: '2026-10-30T09:00:00.000Z', actor: 'llm', op: 'comment', text: 'hello' }] })
  const retitledAncestor = withNode(retitled, { ...must(graph.nodes.get('feature-1')), title: 'renamed feature', body: 'text' })
  assert.deepEqual(digestsOf(retitledAncestor), before)
})

test('a digest of a task moves with acceptance, non-goals, kind and being dropped or superseded', () => {
  const graph = chain()
  const base = must(graph.nodes.get('task-1'))
  const before = digestsOf(graph)['task-1']
  for (const change of [{ acceptance: ['works', 'more'] }, { nonGoals: [] }, { kind: 'test' as const }, { status: 'dropped' as const }, { status: 'superseded' as const }] as Partial<GraphNode>[]) {
    assert.notEqual(digestsOf(withNode(graph, { ...base, ...change }))['task-1'], before, JSON.stringify(change))
  }
  // Doing instead of approved is not a change of intent.
  assert.equal(digestsOf(withNode(graph, { ...base, status: 'doing' }))['task-1'], before)
})

test('a digest of an ancestor moves with acceptance, non-goals and being dropped', () => {
  const graph = chain()
  const feature = must(graph.nodes.get('feature-1'))
  const before = digestsOf(graph)
  for (const change of [{ acceptance: ['feature done', 'and more'] }, { nonGoals: ['new'] }, { status: 'dropped' as const }] as Partial<GraphNode>[]) {
    const now = digestsOf(withNode(graph, { ...feature, ...change }))
    assert.notEqual(now['feature-1'], before['feature-1'], JSON.stringify(change))
    assert.equal(now['goal-1'], before['goal-1'])
  }
})

test('a digest of a decision moves with overturned or superseded verification and with its status; a sandbox verification does not', () => {
  const graph = chain()
  const decision = must(graph.nodes.get('decision-1'))
  const before = digestsOf(graph)['decision-1']
  assert.equal(digestsOf(withNode(graph, { ...decision, verification: 'sandbox' }))['decision-1'], before)
  assert.notEqual(digestsOf(withNode(graph, { ...decision, verification: 'overturned' }))['decision-1'], before)
  assert.notEqual(digestsOf(withNode(graph, { ...decision, verification: 'superseded' }))['decision-1'], before)
  assert.notEqual(digestsOf(withNode(graph, { ...decision, status: 'dropped' }))['decision-1'], before)
})

test('a digest of a question moves with the chosen option, the conclusion of a proposal and the status', () => {
  const graph = chain()
  const question = must(graph.nodes.get('question-1'))
  const before = digestsOf(graph)['question-1']
  assert.notEqual(digestsOf(withNode(graph, { ...question, decision: 'B' }))['question-1'], before)
  assert.notEqual(digestsOf(withNode(graph, { ...question, status: 'doing' }))['question-1'], before)
  const proposal = (conclusion: string) => withNode(graph, { ...question, decision: undefined, conclusion } as unknown as GraphNode)
  assert.notEqual(digestsOf(proposal('use the cache'))['question-1'], digestsOf(proposal('skip the cache'))['question-1'])
})

test('releaseAt: a module and a goal carry the time they entered the released state, a plain feature does not (R4-F2)', () => {
  const graph = splitGraph()
  const before = digestsOf(graph, 'task-a1')
  // The module released again at a later time: the pin of the module moves, so does nothing else.
  const again = withNode(graph, node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release', acceptance: ['module a works'] }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design'), stageEdit(30, 'design', 'release')]))
  const after = digestsOf(again, 'task-a1')
  assert.notEqual(after['module-a'], before['module-a'])
  assert.equal(after['task-a1'], before['task-a1'])
  assert.equal(after['goal-1'], before['goal-1'])
  // Sent back and not yet released again: also different (the boolean "released" would come back to the old value; the time does not).
  const back = withNode(graph, node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design', acceptance: ['module a works'] }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design')]))
  assert.notEqual(digestsOf(back, 'task-a1')['module-a'], before['module-a'])
  assert.notEqual(digestsOf(back, 'task-a1')['module-a'], after['module-a'])
  // The goal sent back and released again moves the goal's pin.
  const goal = must(graph.nodes.get('goal-1'))
  const goalAgain = withNode(graph, { ...goal, history: [...goal.history, stageEdit(40, 'release', 'design'), stageEdit(50, 'design', 'release')] })
  assert.notEqual(digestsOf(goalAgain, 'task-a1')['goal-1'], before['goal-1'])
  // A feature that is no module (no stage) ignores its history.
  const plain = chain()
  const feature = must(plain.nodes.get('feature-1'))
  const plainBefore = digestsOf(plain)['feature-1']
  assert.equal(digestsOf(withNode(plain, { ...feature, history: [...feature.history, stageEdit(5, 'design', 'release')] }))['feature-1'], plainBefore)
})

test('pins line: render and parse round-trip, also from the end of a longer comment', () => {
  const pins = pinsFor(chain())
  const line = renderPins(pins)
  assert.match(line, /^pins: task-1@[0-9a-f]{12} feature-1@[0-9a-f]{12} goal-1@/)
  assert.deepEqual(parsePins(line), pins)
  assert.deepEqual(parsePins(`第 1 次派发 · hz-task-1-a1-abcdef · 简报 abc\n${line}`), pins)
  assert.deepEqual(parsePins(`${line}\r\n`), pins)
  assert.equal(parsePins('pins: '), undefined)
  assert.equal(parsePins('no pins here'), undefined)
  assert.equal(parsePins('pins: task-1@xyz'), undefined)
  assert.equal(parsePins('pins: Task-1@abcdef012345'), undefined)
  assert.equal(parsePins('pins: task-1@abcdef012345 broken'), undefined)
})

test('staleness: nothing for a fresh task; the changed and the missing nodes otherwise; an unreadable line is never fresh', () => {
  const graph = chain()
  const line = renderPins(pinsFor(graph))
  assert.deepEqual(staleness(graph, line, sha256), [])
  const task = must(graph.nodes.get('task-1'))
  const edited = withNode(graph, { ...task, acceptance: ['works differently'] })
  const changes = staleness(edited, line, sha256)
  assert.equal(changes.length, 1)
  assert.equal(changes[0]?.id, 'task-1')
  assert.equal(changes[0]?.change, 'changed')
  assert.match(changes[0]?.from ?? '', /^[0-9a-f]{12}$/)
  assert.match(changes[0]?.to ?? '', /^[0-9a-f]{12}$/)
  const withoutDecision = graphOf([...graph.nodes.values()].filter(entry => entry.id !== 'decision-1'))
  assert.deepEqual(staleness(withoutDecision, line, sha256).map(change => [change.id, change.change]), [['decision-1', 'missing']])
  assert.deepEqual(staleness(graph, 'garbage', sha256), [{ id: '(pins)', change: 'missing', from: '' }])
})

test('staleness: a task is stale after its module was sent back and released again, and when the module structure turns unreadable', () => {
  const graph = splitGraph()
  const line = renderPins(pinsOf(graph, must(graph.nodes.get('task-a1')), sha256))
  assert.deepEqual(staleness(graph, line, sha256, MODULE_READERS), [])
  const again = withNode(graph, node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release', acceptance: ['module a works'] }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design'), stageEdit(30, 'design', 'release')]))
  assert.deepEqual(staleness(again, line, sha256).map(change => change.id), ['module-a'])
  assert.deepEqual(staleness(graph, line, sha256, throwingReaders).map(change => change.id), ['module-a'])
})
