import assert from 'node:assert/strict'
import test from 'node:test'
import { briefGate, parseDispatchArgs } from '../src/execute/brief.ts'
import { DISPATCH_EXAMPLE, dispatchDescription, EXAMPLE_CALL, EXAMPLE_LIMIT, EXAMPLE_TASK, EXAMPLE_WHY_NOTE } from '../src/execute/examples.ts'
import { checkModelChoice, type CatalogEntry } from '../src/execute/models.ts'
import { floorHits, parseFloor, type FloorCall } from '../src/execute/floor.ts'
import { planStatusOf } from '../src/execute/plan.ts'
import type { DispatchSummary } from '../src/execute/attempts.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { freeContext, graphOf, node, stageEdit } from './execute-helpers.ts'

/** The example's call and its returned summary, read back out of the text so a drift between the constant and the JSON fails here. */
const call = JSON.parse(/^dispatch_task (.+)$/m.exec(DISPATCH_EXAMPLE)![1]) as Record<string, unknown>
const returns = JSON.parse(/^Returns (.+)$/m.exec(DISPATCH_EXAMPLE)![1]) as Record<string, unknown>

/** The released goal the example names, with task-12 exactly as the example describes it. */
function exampleGraph(): LoadedGraph {
  const task: Partial<GraphNode> = {
    id: EXAMPLE_TASK.id,
    type: 'task',
    parent: 'goal-1',
    title: 'Add the subscription feed',
    kind: EXAMPLE_TASK.kind,
    writeScope: [...EXAMPLE_TASK.writeScope],
    acceptance: [...EXAMPLE_TASK.acceptance],
    nonGoals: [...EXAMPLE_TASK.nonGoals],
    worktree: true,
  }
  return graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release', acceptance: ['the blog builds'] }, 0, 'human', [stageEdit(1, 'design', 'release')]),
    node(task as never),
  ])
}

test('the example passes the gate on a preset graph (§3.1.5 check 1)', () => {
  const graph = exampleGraph()
  const task = graph.nodes.get(EXAMPLE_TASK.id)!
  const verdict = briefGate(graph, task, { ...freeContext(graph, task, call), args: call })
  assert.ok(verdict.ok, `the example's own call was refused: ${verdict.ok ? '' : `${verdict.code}: ${verdict.message}`}`)
})

test('the example passes checkModelChoice with a catalog that carries the made-up id (§3.1.5 check 2)', () => {
  const catalog: CatalogEntry[] = [{ id: 'example-model-large' }, { id: 'example-model-small' }]
  const checked = checkModelChoice({ provider: 'example', model: EXAMPLE_CALL.model }, catalog, undefined)
  assert.ok(checked.ok)
})

test('the call arguments pass §6.4 field by field, and the reason texts pass plainWordsIn (§3.1.5 check 3)', () => {
  const parsed = parseDispatchArgs(call)
  assert.ok(parsed.ok, `the example's call does not parse: ${parsed.ok ? '' : parsed.message}`)
  assert.deepEqual(call.review, { depth: 'light', why: EXAMPLE_CALL.review.why })
  assert.ok((EXAMPLE_CALL.review.why?.length ?? 0) > 0 && (EXAMPLE_CALL.review.why?.length ?? 0) <= 300)
  assert.ok(typeof call.context === 'string' && call.context.length <= 4000)
  assert.ok(!('quick' in call) && !('depth' in call) && !('depthWhy' in call))
  for (const text of [EXAMPLE_CALL.why, EXAMPLE_CALL.review.why, EXAMPLE_CALL.context]) {
    assert.deepEqual(plainWordsIn(text), [], `"${text}" carries a word the plain-words list avoids`)
  }
})

test('the returned summary has exactly the keys of the dispatch type, a sound childId, a 12-digit brief and plan required (§3.1.5 check 4)', () => {
  const sample: DispatchSummary = {
    task: 'task-12',
    attempt: 1,
    childId: 'hz-task-12-a1-k3x9ab',
    role: 'worker',
    worktree: '.worktrees/hz-task-12',
    branch: 'hz/task-12',
    provider: 'example',
    model: EXAMPLE_CALL.model,
    review: 'light',
    brief: '3fa91c0b2d44',
    plan: 'required',
  }
  assert.deepEqual(Object.keys(returns).sort(), Object.keys(sample).sort())
  assert.match(String(returns.childId), /^hz-task-12-a1-[0-9a-z]{6}$/)
  assert.match(String(returns.brief), /^[0-9a-f]{12}$/)
  const graph = exampleGraph()
  assert.equal(planStatusOf(graph.nodes.get(EXAMPLE_TASK.id)!, undefined), 'required', 'a directory write scope without quick needs a plan')
})

test('the declared light survives a floor with forms and no hit, and becomes full when a line has no form (§3.1.5 check 5, R5-F2)', () => {
  const change = { paths: ['site/feed/rss.xml', 'site/feed/index.js'], deleted: [] }
  const calls: FloorCall[] = [{ tool: 'pwsh', words: [['node', 'build.mjs']], git: [], paths: [], writes: false, shell: true }]
  const withForm = parseFloor(node({ id: 'norm-review-floor', type: 'norm', acceptance: ['拦截与权限的改动要全审：`files src/guarded/`'] }))
  assert.deepEqual(floorHits(withForm, change, calls, '/repo/.worktrees/hz-task-12'), [], 'the example declares light; nothing of this change may hit the floor')
  const withUnparsed = parseFloor(node({
    id: 'norm-review-floor',
    type: 'norm',
    acceptance: ['拦截与权限的改动要全审：`files src/guarded/`', '不该悄悄消失的东西要全审'],
  }))
  const hits = floorHits(withUnparsed, change, calls, '/repo/.worktrees/hz-task-12')
  assert.ok(hits.some(hit => hit.reason === 'unparsed'), 'an entry without a form makes every change hit, so the effective depth is full')
})

test('the tool description is built from the constant, example within the cap, note beside it (§3.1.5 check 6)', () => {
  const description = dispatchDescription()
  assert.ok(description.endsWith(DISPATCH_EXAMPLE), 'the description must end with the example block')
  assert.ok(description.includes(EXAMPLE_WHY_NOTE), 'the note about the reason stands beside the example')
  assert.ok([...DISPATCH_EXAMPLE].length <= EXAMPLE_LIMIT, `example ${[...DISPATCH_EXAMPLE].length} over ${EXAMPLE_LIMIT}`)
  assert.ok(description.includes('dispatch_task'), 'the description names the tool')
})
