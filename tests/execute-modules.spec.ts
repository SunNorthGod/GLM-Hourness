import assert from 'node:assert/strict'
import test from 'node:test'
import { briefGate } from '../src/execute/brief.ts'
import {
  DESIGN_REVIEW_ACCEPTANCE,
  MODULE_READERS,
  directionsOf,
  goalLayer,
  isDesignReview,
  releaseAtOf,
  releaseOf,
  scopedTasks,
  sentBack,
} from '../src/graph/execute-stage.ts'
import { at, designReviewTask, freeContext, getNode as get, graphOf, node, refusalOf as refusal, splitGraph, stageEdit, throwingReaders, withNode } from './execute-helpers.ts'

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
