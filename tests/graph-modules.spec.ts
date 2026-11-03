/**
 * The module readers of a split goal (src/graph/modules.ts; docs/
 * ORCHESTRATION.md §4.9): what is a module, a candidate, the framework and the
 * directions, which module a deep node belongs to, and when a module is
 * released. Graphs are built in memory (tests/graph-memory.ts).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { DIRECTIONS_ID, directionsOf, frameworkOf, isReleased, isSplit, moduleCandidatesOf, moduleOf, modulesOf } from '../src/graph/modules.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { graphOf, node } from './graph-memory.ts'

const ids = (nodes: readonly GraphNode[]): string[] => nodes.map(entry => entry.id)

/**
 * goal-1 (release)
 *   decision-1, decision-2 (framework)
 *   module-b (feature, stage design, approved)   created second
 *     task-b1 -> task-b2 (a feature without a stage, below the module) -> task-deep
 *     sub-feature (feature with a stage, below a module: an ordinary feature)
 *   module-a (feature, stage release, approved)  created first
 *     task-a1
 *   candidate-c (feature, proposed, no stage)
 *     task-c1
 *   task-loose (a task directly under the goal)
 * norm-directions
 */
function split(extra: readonly GraphNode[] = []): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human'),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1' }, 1),
    node({ id: 'decision-2', type: 'decision', parent: 'goal-1', status: 'done' }, 2),
    node({ id: 'module-b', type: 'feature', parent: 'goal-1', stage: 'design' }, 4),
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release' }, 3),
    node({ id: 'task-b1', type: 'task', parent: 'module-b' }, 5),
    node({ id: 'feature-b2', type: 'feature', parent: 'module-b' }, 5),
    node({ id: 'task-deep', type: 'task', parent: 'feature-b2' }, 6),
    node({ id: 'sub-feature', type: 'feature', parent: 'module-b', stage: 'design' }, 6),
    node({ id: 'task-a1', type: 'task', parent: 'module-a' }, 5),
    node({ id: 'candidate-c', type: 'feature', parent: 'goal-1', status: 'proposed' }, 7),
    node({ id: 'task-c1', type: 'task', parent: 'candidate-c', status: 'proposed' }, 8),
    node({ id: 'task-loose', type: 'task', parent: 'goal-1' }, 9),
    node({ id: DIRECTIONS_ID, type: 'norm', acceptance: ['one direction'] }, 10),
    ...extra,
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

test('modulesOf: the goal\'s direct features that carry a stage and are approved, doing or done, by creation time and id; nothing deeper', () => {
  const { graph, goal } = split()
  assert.deepEqual(ids(modulesOf(graph, goal)), ['module-a', 'module-b'])
  const more = split([
    node({ id: 'module-d', type: 'feature', parent: 'goal-1', stage: 'design', status: 'doing' }, 3),
    node({ id: 'module-e', type: 'feature', parent: 'goal-1', stage: 'release', status: 'done' }, 3),
    node({ id: 'module-f', type: 'feature', parent: 'goal-1', stage: 'design', status: 'dropped' }, 3),
    node({ id: 'module-g', type: 'feature', parent: 'goal-1', stage: 'design', status: 'superseded' }, 3),
    node({ id: 'feature-plain', type: 'feature', parent: 'goal-1' }, 3),
  ])
  assert.deepEqual(ids(modulesOf(more.graph, more.goal)), ['module-a', 'module-d', 'module-e', 'module-b'], 'ties in time go by id; dropped, superseded and stageless features are not listed')
  assert.ok(!ids(modulesOf(graph, goal)).includes('sub-feature'), 'a feature with a stage below a module is an ordinary feature')
})

test('moduleCandidatesOf: the direct features still proposed, with or without a stage; dropped and superseded ones are not listed', () => {
  const { graph, goal } = split([
    node({ id: 'candidate-d', type: 'feature', parent: 'goal-1', status: 'proposed', stage: 'design' }, 6),
    node({ id: 'candidate-e', type: 'feature', parent: 'goal-1', status: 'dropped' }, 6),
    node({ id: 'candidate-f', type: 'feature', parent: 'goal-1', status: 'superseded' }, 6),
    node({ id: 'task-p', type: 'task', parent: 'goal-1', status: 'proposed' }, 6),
  ])
  assert.deepEqual(ids(moduleCandidatesOf(graph, goal)), ['candidate-d', 'candidate-c'])
  assert.ok(!ids(modulesOf(graph, goal)).includes('candidate-c'), 'a candidate is not a module')
})

test('frameworkOf: only the direct decision children of the goal that are approved or done', () => {
  const { graph, goal } = split([
    node({ id: 'decision-3', type: 'decision', parent: 'goal-1', status: 'proposed' }, 3),
    node({ id: 'decision-4', type: 'decision', parent: 'goal-1', status: 'dropped' }, 3),
    node({ id: 'decision-5', type: 'decision', parent: 'module-a' }, 3),
  ])
  assert.deepEqual(ids(frameworkOf(graph, goal)), ['decision-1', 'decision-2'])
})

test('moduleOf: a deep task finds its module, the module and a candidate find themselves, a node outside every module finds none', () => {
  const { graph } = split()
  const of = (id: string): string | undefined => moduleOf(graph, graph.nodes.get(id)!)?.id
  assert.equal(of('task-deep'), 'module-b')
  assert.equal(of('task-b1'), 'module-b')
  assert.equal(of('module-b'), 'module-b')
  assert.equal(of('sub-feature'), 'module-b', 'the walk goes past a feature with a stage that is not a module')
  assert.equal(of('task-a1'), 'module-a')
  assert.equal(of('candidate-c'), 'candidate-c')
  assert.equal(of('task-c1'), 'candidate-c', 'the descendants of a candidate belong to it')
  assert.equal(of('task-loose'), undefined)
  assert.equal(of('decision-1'), undefined)
  assert.equal(of('goal-1'), undefined)
  assert.equal(of(DIRECTIONS_ID), undefined)
})

test('isReleased: approved, doing or done at stage release or later; a candidate and a module in design are not', () => {
  const { graph } = split([
    node({ id: 'module-d', type: 'feature', parent: 'goal-1', stage: 'execute', status: 'doing' }, 3),
    node({ id: 'module-e', type: 'feature', parent: 'goal-1', stage: 'design', status: 'done' }, 3),
    node({ id: 'module-f', type: 'feature', parent: 'goal-1', stage: 'release', status: 'done' }, 3),
    node({ id: 'candidate-r', type: 'feature', parent: 'goal-1', status: 'proposed', stage: 'release' }, 3),
  ])
  const released = (id: string): boolean => isReleased(graph.nodes.get(id)!)
  assert.deepEqual(['module-a', 'module-b', 'module-d', 'module-e', 'module-f', 'candidate-c', 'candidate-r'].map(released), [true, false, true, false, true, false, false])
})

test('isSplit: a module or a candidate makes a split goal; tasks alone do not', () => {
  const { graph, goal } = split()
  assert.equal(isSplit(graph, goal), true)
  const small = graphOf([node({ id: 'goal-1', type: 'goal' }, 0, 'human'), node({ id: 'task-1', type: 'task', parent: 'goal-1' }), node({ id: 'decision-1', type: 'decision', parent: 'goal-1' })])
  assert.equal(isSplit(small, small.nodes.get('goal-1')!), false)
  const onlyCandidate = graphOf([node({ id: 'goal-1', type: 'goal' }, 0, 'human'), node({ id: 'feature-1', type: 'feature', parent: 'goal-1', status: 'proposed' })])
  assert.equal(isSplit(onlyCandidate, onlyCandidate.nodes.get('goal-1')!), true, 'a candidate is enough: a release that stopped half way is read the same')
  const stageless = graphOf([node({ id: 'goal-1', type: 'goal' }, 0, 'human'), node({ id: 'feature-1', type: 'feature', parent: 'goal-1' })])
  assert.equal(isSplit(stageless, stageless.nodes.get('goal-1')!), false, 'an approved feature without a stage is not a module')
})

test('directionsOf: the norm-directions node while it is open; none once it is done, dropped or superseded, or when it is not a norm', () => {
  const { graph } = split()
  assert.equal(directionsOf(graph)?.id, DIRECTIONS_ID)
  for (const status of ['done', 'dropped', 'superseded'] as const) {
    const closed = graphOf([...graph.nodes.values()].map(entry => entry.id === DIRECTIONS_ID ? { ...entry, status } : entry))
    assert.equal(directionsOf(closed), undefined, status)
  }
  const wrongType = graphOf([...graph.nodes.values()].map(entry => entry.id === DIRECTIONS_ID ? { ...entry, type: 'decision' as const } : entry))
  assert.equal(directionsOf(wrongType), undefined)
  assert.equal(directionsOf(graphOf([node({ id: 'goal-1', type: 'goal' })])), undefined)
})

test('the readers cut a parent loop instead of looping', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', parent: 'task-1' }),
    node({ id: 'task-1', type: 'task', parent: 'goal-1' }),
  ])
  assert.equal(moduleOf(graph, graph.nodes.get('task-1')!), undefined)
})
