import assert from 'node:assert/strict'
import test from 'node:test'
import { briefGate } from '../src/execute/brief.ts'
import {
  DESIGN_REVIEW_ACCEPTANCE,
  MODULE_READERS,
  acceptanceRounds,
  directionsOf,
  derivedStage,
  goalCompletion,
  goalLayer,
  isDesignReview,
  releaseAtOf,
  releaseOf,
  scopedTasks,
  sentBack,
  type CompletionFacts,
  type ModuleReaders,
} from '../src/graph/execute-stage.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode, HistoryEntry } from '../src/graph/schema.ts'
import { at, comment, designReviewTask, freeContext, getNode as get, graphOf, node, refusalOf as refusal, splitGraph, stageEdit, throwingReaders, withNode } from './execute-helpers.ts'
import { GOAL } from './execute-repo.ts'
import { goalNow, setStage, startedRig, withRig } from './execute-drive-rig.ts'

/** Readers whose module reads throw, the strict side for the stage and the gate (R5-F3). */
const unreadable: ModuleReaders = {
  ...MODULE_READERS,
  isSplit: () => { throw new TypeError('isSplit is not a function') },
  modulesOf: () => { throw new TypeError('modulesOf is not a function') },
}

test('releaseAtOf: the time the node last entered the released state, null when it is not in it', () => {
  const graph = splitGraph()
  assert.equal(releaseAtOf(get(graph, 'module-a')), at(10))
  assert.equal(releaseAtOf(get(graph, 'goal-1')), at(5))
  assert.equal(releaseAtOf(get(graph, 'module-b')), null)
  // A goal that never ran the design loop has no stage and no time.
  assert.equal(releaseAtOf(node({ id: 'goal-2', type: 'goal' })), null)
  // Released, then sent back: not in the released state now.
  const back = node({ id: 'module-a', type: 'feature', stage: 'design' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design')])
  assert.equal(releaseAtOf(back), null)
  // Released again: the later time, which is what stales earlier dispatches.
  const again = node({ id: 'module-a', type: 'feature', stage: 'release' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design'), stageEdit(30, 'design', 'release')])
  assert.equal(releaseAtOf(again), at(30))
  // A move between stages after release is not a new release.
  const moved = node({ id: 'module-a', type: 'feature', stage: 'execute' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(15, 'release', 'execute')])
  assert.equal(releaseAtOf(moved), at(10))
  // Released from its creation (no entry moves the stage into release): the first history entry's time (§3.9.7's failure table).
  assert.equal(releaseAtOf(node({ id: 'goal-3', type: 'goal', stage: 'release' }, 4)), at(4))
  // Proposed nodes are never in the released state.
  assert.equal(releaseAtOf(node({ id: 'm', type: 'feature', stage: 'release', status: 'proposed' }, 0, 'llm', [stageEdit(1, 'design', 'release')])), null)
})

test('sentBack: a write that moved the node from release or later back to design', () => {
  assert.equal(sentBack(node({ id: 'm', type: 'feature', stage: 'design' }, 0, 'llm', [stageEdit(1, 'design', 'release'), stageEdit(2, 'release', 'design')])), true)
  assert.equal(sentBack(node({ id: 'm', type: 'feature', stage: 'design' }, 0, 'llm', [stageEdit(2, 'execute', 'design')])), true)
  assert.equal(sentBack(node({ id: 'm', type: 'feature', stage: 'release' }, 0, 'llm', [stageEdit(1, 'design', 'release')])), false)
  assert.equal(sentBack(node({ id: 'm', type: 'feature', stage: 'design' }, 0, 'llm', [stageEdit(1, 'interview', 'design')])), false)
})

test('releaseOf: the module layer first, then the goal; a task outside every module only meets the goal', () => {
  const graph = splitGraph()
  assert.deepEqual(releaseOf(graph, get(graph, 'task-a1')), { ok: true, goal: { id: 'goal-1', at: at(5) }, module: { id: 'module-a', at: at(10) } })
  assert.deepEqual(releaseOf(graph, get(graph, 'task-b1')), { ok: false, level: 'module', node: 'module-b', stage: 'design' })
  assert.deepEqual(releaseOf(graph, get(graph, 'task-top')), { ok: true, goal: { id: 'goal-1', at: at(5) } })
  assert.deepEqual(releaseOf(graph, get(graph, 'goal-1')), { ok: true, goal: { id: 'goal-1', at: at(5) } })
  // A module is its own nearest module: its design review meets the module layer first.
  assert.deepEqual(releaseOf(graph, get(graph, 'module-b')), { ok: false, level: 'module', node: 'module-b', stage: 'design' })
})

test('releaseOf: a goal without stage is released once approved; a proposed goal or a goal in design is not', () => {
  const plain = graphOf([node({ id: 'goal-1', type: 'goal' }), node({ id: 'task-1', type: 'task', parent: 'goal-1' })])
  assert.deepEqual(releaseOf(plain, get(plain, 'task-1')), { ok: true, goal: { id: 'goal-1', at: null } })
  const inDesign = graphOf([node({ id: 'goal-1', type: 'goal', stage: 'design' }), node({ id: 'task-1', type: 'task', parent: 'goal-1' })])
  assert.deepEqual(releaseOf(inDesign, get(inDesign, 'task-1')), { ok: false, level: 'goal', node: 'goal-1', stage: 'design' })
  const proposed = graphOf([node({ id: 'goal-1', type: 'goal', status: 'proposed' }), node({ id: 'task-1', type: 'task', parent: 'goal-1' })])
  assert.deepEqual(releaseOf(proposed, get(proposed, 'task-1')), { ok: false, level: 'goal', node: 'goal-1', stage: 'wish' })
  const detached = graphOf([node({ id: 'task-1', type: 'task' })])
  assert.deepEqual(releaseOf(detached, get(detached, 'task-1')), { ok: false, level: 'goal', node: 'task-1', stage: null })
})

test('tier 2 and tier 3 on the release check: a module sent back stops its tasks and spares the others; the goal sent back stops all', () => {
  const graph = splitGraph()
  const sentModuleBack = withNode(graph, node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design')]))
  assert.deepEqual(releaseOf(sentModuleBack, get(sentModuleBack, 'task-a1')), { ok: false, level: 'module', node: 'module-a', stage: 'design' })
  assert.equal(releaseOf(sentModuleBack, get(sentModuleBack, 'task-top')).ok, true)
  // Released again: the module's time moves, which changes every pin that carries it.
  const releasedAgain = withNode(graph, node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design'), stageEdit(30, 'design', 'release')]))
  assert.deepEqual(releaseOf(releasedAgain, get(releasedAgain, 'task-a1')), { ok: true, goal: { id: 'goal-1', at: at(5) }, module: { id: 'module-a', at: at(30) } })
  const goalBack = withNode(graph, node({ id: 'goal-1', type: 'goal', stage: 'design' }, 0, 'human', [stageEdit(5, 'design', 'release'), stageEdit(25, 'release', 'design', { actor: 'human' })]))
  assert.deepEqual(releaseOf(goalBack, get(goalBack, 'task-a1')), { ok: false, level: 'goal', node: 'goal-1', stage: 'design' })
  assert.deepEqual(releaseOf(goalBack, get(goalBack, 'task-b1')), { ok: false, level: 'module', node: 'module-b', stage: 'design' })
  assert.deepEqual(releaseOf(goalBack, get(goalBack, 'task-top')), { ok: false, level: 'goal', node: 'goal-1', stage: 'design' })
})

test('releaseOf (R5-F3): readers that throw refuse a split goal and leave a goal without modules alone, and recover', () => {
  const graph = splitGraph()
  const unreadable = { ok: false, level: 'module', reason: 'unreadable' }
  assert.deepEqual(releaseOf(graph, get(graph, 'task-a1'), throwingReaders), unreadable)
  assert.deepEqual(releaseOf(graph, get(graph, 'task-top'), throwingReaders), unreadable)
  // isReleased can be the reader that fails.
  assert.deepEqual(releaseOf(graph, get(graph, 'task-a1'), { ...MODULE_READERS, isReleased: () => { throw new Error('boom') } }), unreadable)
  // The goal itself only has its own layer: no reader is called.
  assert.equal(releaseOf(graph, get(graph, 'goal-1'), throwingReaders).ok, true)
  const plain = graphOf([node({ id: 'goal-1', type: 'goal' }), node({ id: 'feature-1', type: 'feature', parent: 'goal-1' }), node({ id: 'task-1', type: 'task', parent: 'feature-1' })])
  assert.equal(releaseOf(plain, get(plain, 'task-1'), throwingReaders).ok, true, 'a feature without a stage is no module')
  const onlyDroppedModule = graphOf([node({ id: 'goal-1', type: 'goal' }), node({ id: 'feature-1', type: 'feature', parent: 'goal-1', stage: 'design', status: 'dropped' }), node({ id: 'task-1', type: 'task', parent: 'goal-1' })])
  assert.equal(releaseOf(onlyDroppedModule, get(onlyDroppedModule, 'task-1'), throwingReaders).ok, true, 'a dropped module does not make the goal split')
  const candidate = graphOf([node({ id: 'goal-1', type: 'goal' }), node({ id: 'feature-1', type: 'feature', parent: 'goal-1', stage: 'design', status: 'proposed' }), node({ id: 'task-1', type: 'task', parent: 'goal-1' })])
  assert.deepEqual(releaseOf(candidate, get(candidate, 'task-1'), throwingReaders), unreadable, 'a staged candidate is a module to come')
  // The readers are back: the same graph is judged by module again.
  assert.deepEqual(releaseOf(graph, get(graph, 'task-b1')), { ok: false, level: 'module', node: 'module-b', stage: 'design' })
})

test('the gate turns an unreadable module structure into not_released, for tasks and for a module design review, and spares a goal without modules', () => {
  const graph = withNode(splitGraph(), designReviewTask())
  for (const id of ['task-a1', 'task-top', 'review-b']) {
    const target = get(graph, id)
    const result = refusal(briefGate(graph, target, freeContext(graph, target, {}, throwingReaders)))
    assert.equal(result.code, 'not_released', id)
    assert.equal(result.hint, 'The module structure could not be read; the harness refuses dispatch until it can.', id)
  }
  const plain = graphOf([node({ id: 'goal-1', type: 'goal' }), node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], acceptance: ['a'], worktree: true })])
  const target = get(plain, 'task-1')
  assert.equal(briefGate(plain, target, freeContext(plain, target, {}, throwingReaders)).ok, true)
})

test('isDesignReview: a harness-proposed review task with no write scope whose sources are decisions under a module', () => {
  const graph = withNode(splitGraph(), designReviewTask())
  assert.equal(isDesignReview(graph, get(graph, 'review-b')), true)
  const variant = (change: Partial<ReturnType<typeof designReviewTask>>, actor: 'harness' | 'llm' = 'harness') => withNode(splitGraph(), { ...designReviewTask(change), history: designReviewTask().history.map(entry => ({ ...entry, actor })) })
  assert.equal(isDesignReview(variant({}, 'llm'), get(variant({}, 'llm'), 'review-b')), false, 'proposed by the model: an ordinary review that cites a decision')
  assert.equal(isDesignReview(variant({ kind: 'implement' }), get(variant({ kind: 'implement' }), 'review-b')), false)
  assert.equal(isDesignReview(variant({ writeScope: ['src/b/'] }), get(variant({ writeScope: ['src/b/'] }), 'review-b')), false)
  assert.equal(isDesignReview(variant({ edges: [] }), get(variant({ edges: [] }), 'review-b')), false)
  assert.equal(isDesignReview(variant({ edges: [{ type: 'depends', to: 'decision-b' }] }), get(variant({ edges: [{ type: 'depends', to: 'decision-b' }] }), 'review-b')), false)
  // A framework decision sits under the goal, not under a module.
  const framework = variant({ edges: [{ type: 'source', to: 'decision-fw' }] })
  assert.equal(isDesignReview(framework, get(framework, 'review-b')), false)
  const mixed = variant({ edges: [{ type: 'source', to: 'decision-b' }, { type: 'source', to: 'decision-fw' }] })
  assert.equal(isDesignReview(mixed, get(mixed, 'review-b')), false)
  assert.equal(isDesignReview(graph, get(graph, 'review-b'), throwingReaders), false, 'readers that throw take the stricter answer')
  assert.equal(isDesignReview(graph, get(graph, 'task-a1')), false)
  assert.equal(DESIGN_REVIEW_ACCEPTANCE, get(graph, 'review-b').acceptance?.[0])
})

test('scopedTasks: the tasks of a goal or module, without design reviews, and for a goal without the tasks of modules in design', () => {
  const graph = withNode(splitGraph(), designReviewTask())
  assert.deepEqual(scopedTasks(graph, get(graph, 'goal-1')).map(task => task.id).sort(), ['task-a1', 'task-top'])
  assert.deepEqual(scopedTasks(graph, get(graph, 'module-b')).map(task => task.id), ['task-b1'])
  assert.deepEqual(scopedTasks(graph, get(graph, 'module-a')).map(task => task.id), ['task-a1'])
  // A module sent back to design drops out of the goal's tasks, so the goal does not look in development.
  const back = withNode(graph, node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design')]))
  assert.deepEqual(scopedTasks(back, get(back, 'goal-1')).map(task => task.id), ['task-top'])
})

test('goalLayer: approved or doing, with no stage or release and later', () => {
  assert.equal(goalLayer(get(splitGraph(), 'goal-1')).ok, true)
  assert.deepEqual(goalLayer(node({ id: 'goal-1', type: 'goal', status: 'done' })), { ok: false, level: 'goal', node: 'goal-1', stage: null })
  assert.deepEqual(goalLayer(node({ id: 'goal-1', type: 'goal', stage: 'interview', status: 'proposed' })), { ok: false, level: 'goal', node: 'goal-1', stage: 'interview' })
})

test('directionsOf: the norm-directions node while it is open', () => {
  const graph = splitGraph()
  assert.equal(directionsOf(graph)?.id, 'norm-directions')
  assert.equal(directionsOf(withNode(graph, node({ id: 'norm-directions', type: 'norm', status: 'done' }))), undefined)
  assert.equal(directionsOf(graphOf([node({ id: 'goal-1', type: 'goal' })])), undefined)
})

// ---- the gate on the two-module graph (design §6.6 (a), (b), (c), (g); §3.7.5) ----

test('(a) a task under a module in design is not_released, the one under the released module is dispatched', () => {
  const graph = splitGraph()
  const blocked = refusal(briefGate(graph, get(graph, 'task-b1'), freeContext(graph, get(graph, 'task-b1'))))
  assert.equal(blocked.code, 'not_released')
  assert.match(blocked.hint, /^This module's design is not released: .*kind release, module module-b\)\.$/)
  assert.equal(briefGate(graph, get(graph, 'task-a1'), freeContext(graph, get(graph, 'task-a1'))).ok, true)
  assert.equal(briefGate(graph, get(graph, 'task-top'), freeContext(graph, get(graph, 'task-top'))).ok, true)
})

test('(b) a module sent back says so in the hint, and the others are not affected', () => {
  const graph = withNode(splitGraph(), node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design')]))
  const result = refusal(briefGate(graph, get(graph, 'task-a1'), freeContext(graph, get(graph, 'task-a1'))))
  assert.equal(result.code, 'not_released')
  assert.match(result.hint, /It was sent back to design; wait for the person to release it again\.$/)
  assert.equal(briefGate(graph, get(graph, 'task-top'), freeContext(graph, get(graph, 'task-top'))).ok, true)
})

test('(c) the goal sent back stops everything and says so', () => {
  const graph = withNode(splitGraph(), node({ id: 'goal-1', type: 'goal', stage: 'design' }, 0, 'human', [stageEdit(5, 'design', 'release'), stageEdit(25, 'release', 'design', { actor: 'human' })]))
  const result = refusal(briefGate(graph, get(graph, 'task-top'), freeContext(graph, get(graph, 'task-top'))))
  assert.equal(result.code, 'not_released')
  assert.match(result.hint, /^The design is not released: put it to the person with propose_to_human \(kind release\)\. It was sent back to design/)
})

test('§3.7.5 a module in design: its design review is dispatched with the module id, ordinary tasks of that module are not', () => {
  const graph = splitGraph()
  const module = get(graph, 'module-b')
  const result = briefGate(graph, module, freeContext(graph, module, { id: 'module-b' }))
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.subject, 'module')
  // The harness's proposed review task passes bad_task although it is a proposal.
  const withReview = withNode(graph, designReviewTask())
  const review = get(withReview, 'review-b')
  const task = briefGate(withReview, review, freeContext(withReview, review))
  assert.equal(task.ok, true)
  assert.equal(task.ok && task.subject, 'design-review')
  assert.equal(refusal(briefGate(withReview, get(withReview, 'task-b1'), freeContext(withReview, get(withReview, 'task-b1')))).code, 'not_released')
  // The same shape proposed by the model is an ordinary review task of an unreleased module and stays refused.
  const forged = withNode(graph, { ...designReviewTask(), history: designReviewTask().history.map(entry => ({ ...entry, actor: 'llm' as const })) })
  assert.equal(refusal(briefGate(forged, get(forged, 'review-b'), freeContext(forged, get(forged, 'review-b')))).code, 'bad_task')
})

test('§3.7.5 the goal layer still applies to a module design review', () => {
  const graph = withNode(splitGraph(), node({ id: 'goal-1', type: 'goal', stage: 'design' }, 0, 'human', [stageEdit(5, 'design', 'release'), stageEdit(25, 'release', 'design', { actor: 'human' })]))
  const module = get(graph, 'module-b')
  const result = refusal(briefGate(graph, module, freeContext(graph, module, { id: 'module-b' })))
  assert.equal(result.code, 'not_released')
  assert.match(result.hint, /^The design is not released/)
})

test('§3.7.5 nothing_to_review and no_directions', () => {
  const graph = splitGraph()
  const dispatch = (g: typeof graph, id = 'module-b') => briefGate(g, get(g, id), freeContext(g, get(g, id), { id }))
  // The module is released: the person has seen its page.
  assert.equal(refusal(dispatch(graph, 'module-a')).code, 'nothing_to_review')
  // No design decision under the module.
  const noDecision = graphOf([...graph.nodes.values()].filter(entry => entry.id !== 'decision-b'))
  assert.equal(refusal(dispatch(noDecision)).code, 'nothing_to_review')
  // Every decision dropped.
  const dropped = withNode(graph, node({ id: 'decision-b', type: 'decision', parent: 'module-b', status: 'dropped', verification: 'unverified' }))
  assert.equal(refusal(dispatch(dropped)).code, 'nothing_to_review')
  // No direction list.
  const noDirections = graphOf([...graph.nodes.values()].filter(entry => entry.id !== 'norm-directions'))
  const missing = refusal(dispatch(noDirections))
  assert.equal(missing.code, 'no_directions')
  assert.equal(missing.hint, 'The goal has no direction list (norm-directions); the big loop writes it before any module design is reviewed.')
  const closed = withNode(graph, node({ id: 'norm-directions', type: 'norm', status: 'done' }))
  assert.equal(refusal(dispatch(closed)).code, 'no_directions')
  // The same checks hold for the task form of the review.
  const taskForm = withNode(noDirections, designReviewTask())
  assert.equal(refusal(briefGate(taskForm, get(taskForm, 'review-b'), freeContext(taskForm, get(taskForm, 'review-b')))).code, 'no_directions')
})

test('§3.7.5 a design review waits on its own subtree only; a running review makes the module busy; the GLM cap counts it', () => {
  const graph = withNode(splitGraph(), designReviewTask())
  // An open question elsewhere in module B does not hold the review...
  const elsewhere = graphOf([...graph.nodes.values(), node({ id: 'question-1', type: 'question', parent: 'module-b', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }] })])
  assert.equal(briefGate(elsewhere, get(elsewhere, 'module-b'), freeContext(elsewhere, get(elsewhere, 'module-b'), { id: 'module-b' })).ok, true)
  // ...a running review of the module does.
  const running = [{ childId: 'hz-review-b-a1-abcdef', role: 'review' as const, node: 'review-b', attempt: 1, provider: 'p', model: 'glm-5.3', why: 'w', plan: 'none' as const, pins: 'pins: x@000000000000' }]
  const busy = refusal(briefGate(graph, get(graph, 'module-b'), { ...freeContext(graph, get(graph, 'module-b'), { id: 'module-b', model: 'other-model' }), running }))
  assert.equal(busy.code, 'busy')
  // The cap: a GLM review is refused when the cap is full, and the review's model is a GLM one.
  const capped = refusal(briefGate(graph, get(graph, 'module-b'), { ...freeContext(graph, get(graph, 'module-b'), { id: 'module-b', model: 'glm-5.3' }), running: [{ ...running[0], node: 'task-a1', role: 'worker' }], glmWorkerCap: { cap: 1, until: '18:00' } }))
  assert.equal(capped.code, 'slots_full')
  assert.match(capped.message, /^GLM peak, reduce: at most 1 GLM subagent at a time until 18:00\.$/)
})

test('a design review does not make the released module look busy, and the proposed review is not a task to merge', () => {
  const graph = withNode(splitGraph(), designReviewTask())
  assert.deepEqual(scopedTasks(graph, get(graph, 'module-b')).map(task => task.id), ['task-b1'])
  assert.equal(scopedTasks(graph, get(graph, 'module-b')).some(task => task.id === 'review-b'), false)
})

// ---- derived stage (§2.4) ----

test('derivedStage: done is operate, a pre-release stage passes through, a split goal with nothing released stays at release', () => {
  const graph = splitGraph()
  // A module still in design reads its own stage, whatever its tasks say.
  assert.equal(derivedStage(graph, get(graph, 'module-b')), 'design')
  // task-a1 is approved with no children and no unmet dependencies: ready, so execute.
  assert.equal(derivedStage(graph, get(graph, 'module-a')), 'execute')
  assert.equal(derivedStage(graph, get(graph, 'goal-1')), 'execute')
  // Done wins over everything.
  const done = withNode(graph, { ...get(graph, 'goal-1'), status: 'done' })
  assert.equal(derivedStage(done, get(done, 'goal-1')), 'operate')
  // The big loop released the goal, but no module's work has begun: still at release.
  const unreleased = graphOf([...graph.nodes.values()].map(entry => entry.id === 'module-a'
    ? node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design', acceptance: ['module a works'] }, 1)
    : entry))
  assert.equal(derivedStage(unreleased, get(unreleased, 'goal-1')), 'release')
  // Readers that throw read as split with nothing released (R5-F3, the strict side).
  assert.equal(derivedStage(graph, get(graph, 'goal-1'), unreadable), 'release')
})

test('derivedStage: doing and ready are execute, closed or waiting for its review is merge, nothing dispatchable is decompose', () => {
  const graph = splitGraph()
  // A task in progress: execute.
  const doing = withNode(graph, { ...get(graph, 'task-a1'), status: 'doing' })
  assert.equal(derivedStage(doing, get(doing, 'module-a')), 'execute')
  // All of the goal's in-scope tasks closed: merge. task-b1 is doing, but its module
  // is in design, so it is not the goal's work; module-b itself reads execute.
  const closed = graphOf([...graph.nodes.values()].map(entry => {
    if (entry.id === 'task-a1' || entry.id === 'task-top') return { ...entry, status: 'done' as const }
    if (entry.id === 'task-b1') return { ...entry, status: 'doing' as const }
    return entry
  }))
  assert.equal(derivedStage(closed, get(closed, 'goal-1')), 'merge')
  assert.equal(derivedStage(closed, get(closed, 'module-a')), 'merge')
  // module-b itself is still in design and reads its own stage, whatever its task says.
  assert.equal(derivedStage(closed, get(closed, 'module-b')), 'design')
  // A task handed back and waiting for its review is merge; the review of work in
  // scope is the waiting itself, not work (an open review alone is not execute).
  const handedBack = graphOf([...graph.nodes.values(), node({ id: 'review-a1', type: 'task', parent: 'task-a1', kind: 'review', writeScope: [], edges: [{ type: 'source', to: 'task-a1' }], status: 'doing' }, 20, 'harness')])
  assert.equal(derivedStage(handedBack, get(handedBack, 'module-a')), 'merge')
  // No tasks at all: decompose.
  const empty = graphOf([node({ id: 'goal-2', type: 'goal', stage: 'release', acceptance: ['g'] }, 0, 'human', [stageEdit(5, 'design', 'release')])])
  assert.equal(derivedStage(empty, get(empty, 'goal-2')), 'decompose')
  // Tasks exist but none can start and none is closed: decompose.
  const planned = graphOf([
    node({ id: 'goal-3', type: 'goal', stage: 'release', acceptance: ['g'] }, 0, 'human', [stageEdit(5, 'design', 'release')]),
    node({ id: 'module-a', type: 'feature', parent: 'goal-3', stage: 'release', acceptance: ['m'] }, 1, 'llm', [stageEdit(10, 'design', 'release')]),
    node({ id: 'task-a1', type: 'task', parent: 'module-a', writeScope: ['src/a/'], kind: 'implement', acceptance: ['x'], edges: [{ type: 'depends', to: 'task-a2' }] }),
    node({ id: 'task-a2', type: 'task', parent: 'module-a', writeScope: ['src/a/'], kind: 'implement', acceptance: ['y'], status: 'proposed' }),
  ])
  assert.equal(derivedStage(planned, get(planned, 'module-a')), 'decompose')
  // A goal that never ran the design loop (no stage) runs the same table once approved.
  const noStage = graphOf([
    node({ id: 'goal-4', type: 'goal', acceptance: ['g'] }),
    node({ id: 't1', type: 'task', parent: 'goal-4', writeScope: ['src/'], kind: 'implement', acceptance: ['x'] }),
  ])
  assert.equal(derivedStage(noStage, get(noStage, 'goal-4')), 'execute')
})

// ---- completion gate (§3.9.3) ----

const ACCEPTANCE = '验收审查第 1 轮：APPROVED · 挡路 0 · hz-goal-1-acc-aaaaaa · @acc1234567 · pins: goal-1@0123456789ab'

/** A goal whose every item holds: one done write task with harness commit evidence on the trunk, acceptance passed. */
const completeGoal = (goalExtra: readonly HistoryEntry[] = [], task: GraphNode = doneWriteTask()): LoadedGraph => graphOf([
  node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'] }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(30, ACCEPTANCE), ...goalExtra]),
  task,
])

function doneWriteTask(extra: readonly HistoryEntry[] = []): GraphNode {
  return node(
    { id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], worktree: true, acceptance: ['works'], status: 'done', evidence: [{ kind: 'commit', ref: 'c1' }] },
    1, 'llm', [{ at: at(10), actor: 'harness', op: 'edit', reason: '合入主干', evidence: [{ kind: 'commit', ref: 'c1' }] }, ...extra],
  )
}

const facts: CompletionFacts = {
  onTrunk: (ref: string): boolean => ref === 'c1' || ref === 'acc1234567',
  isAncestor: (older: string, newer: string): boolean => older === 'c1' && newer === 'acc1234567',
  running: new Set<string>(),
  runningChecks: [],
  pinsFresh: (): string | undefined => undefined,
}

test('goalCompletion: the gate passes when every item holds', () => {
  assert.deepEqual(goalCompletion(completeGoal(), get(completeGoal(), 'goal-1'), facts), { ok: true, gaps: [] })
})

test('goalCompletion: open tasks, and harness commit evidence on the trunk for done write tasks', () => {
  // A task that is not closed.
  const open = completeGoal([], node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], worktree: true, acceptance: ['works'] }, 1))
  assert.deepEqual(goalCompletion(open, get(open, 'goal-1'), facts).gaps, ['task task-1 is approved; close it, or drop or supersede it'])
  // A done write task whose evidence the harness did not write.
  const unrecorded = completeGoal([], node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], worktree: true, acceptance: ['works'], status: 'done', evidence: [{ kind: 'commit', ref: 'c1' }] }, 1))
  assert.deepEqual(goalCompletion(unrecorded, get(unrecorded, 'goal-1'), facts).gaps, ['task task-1 has no harness commit evidence on the trunk: run check_commit on the commit, fast-forward the trunk to it, and let the harness record it'])
  // Evidence there, but the commit is not on the trunk — and, the acceptance review
  // being passed, also not inside the reviewed trunk commit.
  const offTrunk = completeGoal([], node(
    { id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], worktree: true, acceptance: ['works'], status: 'done', evidence: [{ kind: 'commit', ref: 'c2' }] },
    1, 'llm', [{ at: at(10), actor: 'harness', op: 'edit', reason: '合入主干', evidence: [{ kind: 'commit', ref: 'c2' }] }],
  ))
  assert.deepEqual(goalCompletion(offTrunk, get(offTrunk, 'goal-1'), facts).gaps, [
    'task task-1 has no harness commit evidence on the trunk: run check_commit on the commit, fast-forward the trunk to it, and let the harness record it',
    "task task-1's trunk commit c2 is not in the reviewed trunk commit acc1234567",
  ])
  // A read-only task (empty write scope) needs no commit evidence.
  const readOnly = completeGoal([], node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'review', writeScope: [], acceptance: ['checked'], status: 'done' }, 1))
  assert.deepEqual(goalCompletion(readOnly, get(readOnly, 'goal-1'), facts), { ok: true, gaps: [] })
  // A task under a closed ancestor is skipped, its open review child with it (0.2 评审 F22).
  const droppedAncestor = graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'] }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(30, ACCEPTANCE)]),
    node({ id: 'task-1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], worktree: true, acceptance: ['works'], status: 'dropped' }, 1),
    node({ id: 'review-1', type: 'task', parent: 'task-1', kind: 'review', writeScope: [], edges: [{ type: 'source', to: 'task-1' }] }, 2, 'harness'),
  ])
  assert.deepEqual(goalCompletion(droppedAncestor, get(droppedAncestor, 'goal-1'), facts), { ok: true, gaps: [] })
})

test('goalCompletion: no open question or proposal, and the acceptance review items', () => {
  // The acceptance comment reads back as one round with its verdict, commit and pins.
  const base = completeGoal()
  assert.deepEqual(acceptanceRounds(get(base, 'goal-1')), [{
    k: 1, verdict: 'APPROVED', blocking: 0, childId: 'hz-goal-1-acc-aaaaaa', commit: 'acc1234567',
    pins: 'pins: goal-1@0123456789ab', stopped: false, at: at(30),
  }])
  // An undecided question and an undecided proposal (a node left in proposed).
  const withQuestion = withNode(base, node({ id: 'q-1', type: 'question', parent: 'goal-1', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }] }))
  const undecided = withNode(withQuestion, node({ id: 'q-2', type: 'question', parent: 'goal-1', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }], status: 'proposed' }, 5, 'llm'))
  assert.deepEqual(goalCompletion(undecided, get(undecided, 'goal-1'), facts).gaps, ['question q-1 is still open', 'proposal q-2 is not decided yet'])
  // The acceptance review missing, stopped, or not approved.
  const noReview = completeGoal()
  const bare = graphOf([...noReview.nodes.values()].map(entry => entry.id === 'goal-1'
    ? node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'] }, 0, 'human', [stageEdit(5, 'design', 'release')])
    : entry))
  assert.deepEqual(goalCompletion(bare, get(bare, 'goal-1'), facts).gaps, ["the goal's acceptance review has not passed: dispatch_task goal-1 with a model and why"])
  const stopped = graphOf([...noReview.nodes.values()].map(entry => entry.id === 'goal-1'
    ? node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'] }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(30, `${ACCEPTANCE} · 停下`)])
    : entry))
  assert.deepEqual(goalCompletion(stopped, get(stopped, 'goal-1'), facts).gaps, ['the acceptance review was stopped: the person has not answered yet'])
  const changes = graphOf([...noReview.nodes.values()].map(entry => entry.id === 'goal-1'
    ? node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the goal'] }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(30, '验收审查第 2 轮：CHANGES_REQUESTED · 挡路 2 · hz-goal-1-acc-bbbbbb · @acc1234567 · pins: goal-1@0123456789ab')])
    : entry))
  assert.deepEqual(goalCompletion(changes, get(changes, 'goal-1'), facts).gaps, ["the goal's acceptance review has not passed: round 2 is CHANGES_REQUESTED with 2 blocking"])
  // Stale pins.
  const stale = goalCompletion(completeGoal(), get(completeGoal(), 'goal-1'), { ...facts, pinsFresh: () => 'goal-1 released again' })
  assert.deepEqual(stale.gaps, ["the acceptance review's pins are stale (goal-1 released again); review the goal again"])
  // A trunk commit the reviewed commit does not contain.
  const notAncestor = goalCompletion(completeGoal(), get(completeGoal(), 'goal-1'), { ...facts, isAncestor: () => false })
  assert.deepEqual(notAncestor.gaps, ["task task-1's trunk commit c1 is not in the reviewed trunk commit acc1234567"])
})

test('goalCompletion: nothing of the goal still running, no module left in design, readable structure', () => {
  // A live dispatch named in the goal's or a task's comments.
  const live = completeGoal([comment(31, '派发 hz-goal-1-w-bbbbbb 的简报记下了模型与理由')])
  assert.deepEqual(
    goalCompletion(live, get(live, 'goal-1'), { ...facts, running: new Set(['hz-goal-1-w-bbbbbb']) }).gaps,
    ['dispatch hz-goal-1-w-bbbbbb is still running'],
  )
  // A dispatch of another goal that happens to be alive does not count.
  assert.deepEqual(
    goalCompletion(live, get(live, 'goal-1'), { ...facts, running: new Set(['hz-goal-9-w-zzzzzz']) }),
    { ok: true, gaps: [] },
  )
  // A merge check still running on a task of the goal is a gap (§3.9.3 point 6); one of another goal's task is not.
  assert.deepEqual(goalCompletion(completeGoal(), get(completeGoal(), 'goal-1'), { ...facts, runningChecks: ['task-1', 'task-9'] }).gaps, ['a merge check of task task-1 is still running'])
  // A split goal: the module in design is a gap; its design review does not count
  // (R5-F4), but a real task of that module does.
  const split = withNode(splitGraph(), designReviewTask())
  const splitDone = graphOf([...split.nodes.values()].map(entry => {
    if (entry.id === 'task-a1' || entry.id === 'task-top') {
      return { ...entry, status: 'done' as const, evidence: [{ kind: 'commit' as const, ref: 'c1' }], history: [...entry.history, { at: at(15), actor: 'harness' as const, op: 'edit', reason: '合入主干', evidence: [{ kind: 'commit' as const, ref: 'c1' }] }] }
    }
    if (entry.id === 'goal-1') {
      return { ...entry, history: [...entry.history, comment(30, ACCEPTANCE)] }
    }
    return entry
  }))
  assert.deepEqual(goalCompletion(splitDone, get(splitDone, 'goal-1'), facts).gaps, [
    'task task-b1 is approved; close it, or drop or supersede it',
    'module module-b has not been released: put its design to the person with propose_to_human (kind release, module module-b), or drop the module',
  ])
  // Readers that throw: the gate waits until the structure can be read.
  const gate = goalCompletion(completeGoal(), get(completeGoal(), 'goal-1'), facts, unreadable)
  assert.deepEqual(gate.gaps, ['the module structure could not be read; the completion gate waits until it can'])
})

// ---- the drive on a two-module goal (design §6.6 (a), (c); src/execute/drive.ts) ----

const MODULE_A = { type: 'feature', id: 'module-a', parent: 'goal-1', title: 'Feed', stage: 'release', acceptance: ['the feed works'] }
const MODULE_B = { type: 'feature', id: 'module-b', parent: 'goal-1', title: 'Search', stage: 'design', acceptance: ['search works'] }
const TASK_A = { type: 'task', id: 'task-a1', parent: 'module-a', title: 'Add the feed', kind: 'implement', writeScope: ['src/feed/'], acceptance: ['the feed builds'], worktree: true }
const splitRig = (): ReturnType<typeof startedRig> => startedRig({ nodes: [GOAL, MODULE_A, MODULE_B, TASK_A] })

test('(a) drive: module A\'s release creates the one goal; B\'s later release hands over design-released with module B and its own key, and start-drive only comments', () => withRig(splitRig, async (rig) => {
  const releasedA = rig.emitted.filter(event => event.event === 'hourness.design-released')
  const atA = releaseAtOf(await rig.node('module-a'))
  assert.deepEqual(releasedA.map(event => [event.key, event.payload.module]), [[`design-released:module-a:${atA}`, 'module-a']])
  const goal = goalNow(rig)
  assert.match(goal.objective, /The work is split into modules and the person releases each module on its own; .* call await_human\.$/)
  assert.ok((await rig.comments('goal-1')).includes(`自动推进已开始 · 放行 ${atA} · 模块 module-a · goal ${goal.id} · 会话 main-1 · 主干 main`))
  assert.ok(rig.live.woken.some(entry => entry.text.includes('Module module-a "Feed" of goal goal-1 is released and the drive has started. Decompose it into tasks with dispatch attributes under the module')))
  await setStage(rig, 'module-b', 'release')
  await rig.step()
  const atB = releaseAtOf(await rig.node('module-b'))
  assert.deepEqual(rig.emitted.filter(event => event.event === 'hourness.design-released').map(event => [event.key, event.payload.module]), [[`design-released:module-a:${atA}`, 'module-a'], [`design-released:module-b:${atB}`, 'module-b']])
  assert.ok((await rig.comments('goal-1')).includes(`模块 module-b 已放行 · 放行 ${atB}`))
  assert.ok(rig.live.woken.some(entry => entry.text.includes('Module module-b "Search" of goal goal-1 is released. Decompose it')), 'no "and the drive has started" for a later module')
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'create').length, 1, 'one goal for the whole goal')
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'module-released' && event.module === 'module-b'))
}))

test('(c) drive: the goal sent back to design blocks hourness-design-wait without asking; its re-release resumes and zeroes both counters', () => withRig(splitRig, async (rig) => {
  await rig.round()
  await rig.round()
  await rig.round()
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 2, peak: 0 })
  await setStage(rig, 'goal-1', 'design')
  await rig.step()
  assert.deepEqual(goalNow(rig).blockedReason, { code: 'hourness-design-wait', message: 'The framework of goal goal-1 is being changed with the person (the goal went back to design). Nothing is dispatched until it is released again.' })
  assert.ok((await rig.lines()).some(line => line.op === 'design-wait'))
  assert.ok((await rig.comments('goal-1')).some(text => text.startsWith('退回设计 · ')))
  assert.equal(rig.drive.status('main-1').returns[0]?.tier, 3)
  await setStage(rig, 'goal-1', 'release')
  await rig.step()
  assert.deepEqual([goalNow(rig).phase, goalNow(rig).activation], ['active', 'armed'])
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 0, peak: 0 })
  assert.equal(rig.drive.status('main-1').state, 'The goal was released again. Tasks that were running when it went back are stale: dispatch them again with the new design.')
  assert.ok((await rig.lines()).some(line => line.op === 'resume' && line.reason === 'design-released'))
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'create').length, 1)
}))