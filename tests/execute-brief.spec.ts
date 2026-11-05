import assert from 'node:assert/strict'
import test from 'node:test'
import type { Attempt } from '../src/execute/attempts.ts'
import { BRIEF_LIMIT, briefGate, parseDispatchArgs, renderAcceptanceBrief, renderBrief, type BriefContext, type BriefInput, type GateResult } from '../src/execute/brief.ts'
import { digest12 } from '../src/execute/digest.ts'
import { releaseOf } from '../src/graph/execute-stage.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { comment, freeContext, getNode as get, graphOf, must, node, refusalOf as refused, withNode } from './execute-helpers.ts'

const WORK = { kind: 'implement' as const, acceptance: ['feed lists the 20 newest posts', 'every item has a title'], worktree: true }

/** One released goal with a feature, three write tasks and a review task. */
function plain(): LoadedGraph {
  return graphOf([
    node({ id: 'goal-1', type: 'goal', title: 'Static blog', acceptance: ['the blog builds'], nonGoals: ['no comments'] }),
    node({ id: 'feature-1', type: 'feature', parent: 'goal-1', title: 'Feeds', nonGoals: ['no podcast feed'] }),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1', title: 'RSS before Atom', verification: 'unverified' }),
    node({ id: 'question-1', type: 'question', parent: 'goal-1', title: 'Feed length', status: 'done', decision: 'B', options: [{ key: 'A', label: '10 posts' }, { key: 'B', label: '20 posts' }] }),
    node({ id: 'task-1', type: 'task', parent: 'feature-1', title: 'Write the feed', writeScope: ['site/feed/'], nonGoals: ['no Atom feed'], edges: [{ type: 'source', to: 'decision-1' }, { type: 'source', to: 'question-1' }], ...WORK }),
    node({ id: 'task-2', type: 'task', parent: 'feature-1', title: 'Write the index', writeScope: ['site/index/'], ...WORK }),
    node({ id: 'task-3', type: 'task', parent: 'feature-1', title: 'Deep feed file', writeScope: ['site/feed/deep/'], ...WORK }),
    node({ id: 'review-1', type: 'task', parent: 'feature-1', title: 'Review the feed', kind: 'review', writeScope: [], acceptance: ['the feed matches its acceptance'] }),
  ])
}

function gate(graph: LoadedGraph, id: string, extra: Partial<BriefContext> = {}, args: Record<string, unknown> = {}): GateResult {
  const target = get(graph, id)
  return briefGate(graph, target, { ...freeContext(graph, target, args), ...extra })
}

const attempt = (overrides: Partial<Attempt>): Attempt => ({ childId: 'hz-x-a1-000000', role: 'worker', node: 'x', attempt: 1, provider: 'p', model: 'example-model-large', why: 'w', plan: 'required', pins: 'pins: x@000000000000', ...overrides })

test('parseDispatchArgs: a call with the required arguments parses; unknown names do not', () => {
  const ok = parseDispatchArgs({ id: 'task-12', model: 'example-model-large', why: 'touches one directory', review: { depth: 'light', why: 'adds one new file' }, context: 'reuse the date helper' })
  assert.deepEqual(ok, { ok: true, args: { id: 'task-12', model: 'example-model-large', why: 'touches one directory', review: { depth: 'light', why: 'adds one new file' }, context: 'reuse the date helper' } })
  const odd = parseDispatchArgs({ id: 'task-12', model: 'm', why: 'w', tier: 'hard', extra: 1 })
  assert.deepEqual(odd, { ok: false, message: 'unknown arguments: tier, extra' })
  assert.deepEqual(parseDispatchArgs({ id: 'task-12', model: 'm', why: 'w', tier: 'hard' }), { ok: false, message: 'unknown argument: tier' })
  assert.deepEqual(parseDispatchArgs('x'), { ok: false, message: 'the arguments must be an object' })
  assert.deepEqual(parseDispatchArgs([]), { ok: false, message: 'the arguments must be an object' })
})

test('parseDispatchArgs: id, review, depth, depthWhy, context, quick follow §6.4', () => {
  const fail = (extra: Record<string, unknown>): string => {
    const result = parseDispatchArgs({ id: 'task-1', model: 'm', why: 'w', ...extra })
    assert.equal(result.ok, false, JSON.stringify(extra))
    return result.ok ? '' : result.message
  }
  assert.equal(parseDispatchArgs({ model: 'm', why: 'w' }).ok, false)
  assert.equal(parseDispatchArgs({ id: 'Task 1', model: 'm', why: 'w' }).ok, false)
  assert.match(fail({ review: { depth: 'maybe' } }), /^review\.depth must be/)
  assert.match(fail({ review: { depth: 'light' } }), /^review\.why is required when the depth is light/)
  assert.match(fail({ review: { depth: 'skip', why: '  ' } }), /^review\.why must be one line/)
  assert.match(fail({ review: { depth: 'full', why: 'x'.repeat(301) } }), /^review\.why must be one line of 1-300/)
  assert.match(fail({ review: { depth: 'full', extra: 1 } }), /^review must be/)
  assert.match(fail({ review: 'full' }), /^review must be/)
  assert.match(fail({ depth: 'skip' }), /^depth must be full or light/)
  assert.match(fail({ depthWhy: 'because' }), /^depthWhy goes with depth/)
  assert.match(fail({ depth: 'light', depthWhy: 'x'.repeat(301) }), /^depthWhy must be one line/)
  assert.match(fail({ context: 'x'.repeat(4001) }), /^context must be a string of at most 4000/)
  assert.match(fail({ context: 3 }), /^context must be/)
  assert.match(fail({ quick: 'yes' }), /^quick must be true or false/)
  assert.deepEqual(parseDispatchArgs({ id: 'task-1', model: 'm', why: 'w', review: { depth: 'full' }, depth: 'light', depthWhy: 'a light round', context: 'x'.repeat(4000), quick: false }), {
    ok: true, args: { id: 'task-1', model: 'm', why: 'w', review: { depth: 'full' }, depth: 'light', depthWhy: 'a light round', context: 'x'.repeat(4000), quick: false },
  })
  assert.equal(parseDispatchArgs({ id: 'task-1', model: 'm', why: 'w', review: { depth: 'skip', why: 'docs only' } }).ok, true)
})

test('briefGate: a free write task passes and the gate hands back the parsed arguments and the subject', () => {
  const graph = plain()
  const result = gate(graph, 'task-1')
  assert.ok(result.ok)
  assert.equal(result.subject, 'write')
  assert.equal(result.args.model, 'example-model-large')
})

test('row 1, invalid: bad arguments, with the catalog in the hint; arguments that do not fit the node', () => {
  const graph = plain()
  const missing = refused(gate(graph, 'task-1', { args: { id: 'task-1', why: 'w' }, catalog: [{ id: 'model-a' }, { id: 'model-b' }] }))
  assert.equal(missing.code, 'invalid')
  assert.match(missing.message, /^model is required/)
  assert.match(missing.hint, /Models on this provider: model-a, model-b$/)
  assert.equal(refused(gate(graph, 'task-1', {}, { depth: 'light' })).code, 'invalid')
  assert.equal(refused(gate(graph, 'review-1', { reviewTarget: { handedBack: true, stale: false } }, { review: { depth: 'full' } })).code, 'invalid')
  assert.equal(refused(gate(graph, 'review-1', { reviewTarget: { handedBack: true, stale: false } }, { quick: true })).code, 'invalid')
  assert.equal(refused(gate(graph, 'goal-1', {}, { review: { depth: 'full' } })).code, 'invalid')
  assert.match(refused(gate(graph, 'goal-1', {}, { depth: 'light' })).message, /its review is always full/)
  // Quick needs at most two files.
  assert.match(refused(gate(graph, 'task-1', {}, { quick: true })).message, /^quick needs a write scope of at most 2 files and no directory; this task has site\/feed\/$/)
  const files = withNode(graph, node({ id: 'task-1', type: 'task', parent: 'feature-1', writeScope: ['site/a.mjs', 'site/b.mjs'], ...WORK }))
  assert.equal(gate(files, 'task-1', {}, { quick: true }).ok, true)
  const three = withNode(graph, node({ id: 'task-1', type: 'task', parent: 'feature-1', writeScope: ['a.mjs', 'b.mjs', 'c.mjs'], ...WORK }))
  assert.equal(refused(gate(three, 'task-1', {}, { quick: true })).code, 'invalid')
  assert.equal(gate(plain(), 'task-1', {}, { quick: false }).ok, true)
})

test('row 2, bad_task: only approved or doing nodes, with a hint that fits the status', () => {
  const graph = plain()
  const done = withNode(graph, { ...get(graph, 'task-1'), status: 'done' })
  assert.deepEqual(refused(gate(done, 'task-1')), { ok: false, code: 'bad_task', message: 'Node task-1 is done.', hint: 'Reopen a finished task first.' })
  const proposed = withNode(graph, { ...get(graph, 'task-1'), status: 'proposed' })
  assert.match(refused(gate(proposed, 'task-1')).hint, /approved when the person releases the design/)
  assert.equal(refused(gate(withNode(graph, { ...get(graph, 'task-1'), status: 'dropped' }), 'task-1')).code, 'bad_task')
  assert.equal(gate(withNode(graph, { ...get(graph, 'task-1'), status: 'doing' }), 'task-1').ok, true)
  assert.equal(refused(gate(graph, 'decision-1')).code, 'bad_task')
  assert.equal(refused(gate(graph, 'feature-1')).code, 'bad_task', 'a feature that is no module is not dispatched')
  assert.equal(refused(gate(withNode(graph, { ...get(graph, 'goal-1'), status: 'done' }), 'goal-1')).code, 'bad_task')
})

test('row 2, bad_task: a role, flow or step of the user graph is never dispatched (user graph design 0.4.1 §3.7)', () => {
  const graph = graphOf([
    ...plain().nodes.values(),
    node({ id: 'role-1', type: 'role', parent: 'goal-1', title: 'Reader' }),
    node({ id: 'flow-1', type: 'flow', parent: 'role-1', title: 'Read a post', body: '走法：命令 · 预计 30 秒' }),
    node({ id: 'step-1', type: 'step', parent: 'flow-1', title: 'Open the feed', acceptance: ['the newest post is first'] }),
  ])
  for (const id of ['role-1', 'flow-1', 'step-1']) {
    const refusal = refused(gate(graph, id))
    assert.equal(refusal.code, 'bad_task', id)
    assert.match(refusal.message, /cannot be dispatched/, id)
  }
})

test('row 3, not_released: the goal in design stops everything; the first failing row wins over later ones', () => {
  const inDesign = withNode(plain(), node({ id: 'goal-1', type: 'goal', stage: 'design', acceptance: ['the blog builds'] }))
  const result = refused(gate(inDesign, 'task-1'))
  assert.equal(result.code, 'not_released')
  assert.equal(result.message, 'Goal goal-1 is not released (stage design).')
  assert.equal(result.hint, 'The design is not released: put it to the person with propose_to_human (kind release).')
  const both = withNode(inDesign, { ...get(inDesign, 'task-1'), status: 'done' })
  assert.equal(refused(gate(both, 'task-1')).code, 'bad_task', 'bad_task comes before not_released')
  assert.equal(refused(gate(inDesign, 'goal-1')).code, 'not_released', 'the review of the whole goal meets the goal layer')
})

test('row 4, bad_attributes: a kind, a write scope that is not empty, a worktree that is not refused', () => {
  const graph = plain()
  const changed = (change: Partial<GraphNode>) => withNode(graph, { ...get(graph, 'task-1'), ...change })
  const lacking = (field: 'kind' | 'writeScope' | 'worktree') => {
    const { [field]: _removed, ...rest } = get(graph, 'task-1')
    return withNode(graph, rest)
  }
  assert.equal(refused(gate(lacking('kind'), 'task-1')).code, 'bad_attributes')
  assert.equal(refused(gate(changed({ writeScope: [] }), 'task-1')).code, 'bad_attributes')
  assert.equal(refused(gate(lacking('writeScope'), 'task-1')).code, 'bad_attributes')
  assert.equal(refused(gate(changed({ worktree: false }), 'task-1')).code, 'bad_attributes')
  assert.equal(gate(lacking('worktree'), 'task-1').ok, true)
})

test('row 5, no_acceptance: tasks and goals need acceptance, a review task does not', () => {
  const graph = plain()
  const no = (id: string) => withNode(graph, { ...get(graph, id), acceptance: [] })
  assert.equal(refused(gate(no('task-1'), 'task-1')).code, 'no_acceptance')
  assert.equal(refused(gate(no('goal-1'), 'goal-1')).code, 'no_acceptance')
  assert.match(refused(gate(no('task-1'), 'task-1')).hint, /changing the acceptance of an existing task is the human's/)
  assert.equal(gate(no('review-1'), 'review-1', { reviewTarget: { handedBack: true, stale: false } }).ok, true)
})

test('row 6, deps_open: every dependency must be done', () => {
  const graph = plain()
  const dependent = withNode(graph, { ...get(graph, 'task-1'), edges: [{ type: 'depends', to: 'task-2' }, { type: 'depends', to: 'task-3' }] })
  const result = refused(gate(dependent, 'task-1'))
  assert.equal(result.code, 'deps_open')
  assert.equal(result.hint, 'Unfinished: task-2, task-3.')
  const finished = withNode(withNode(dependent, { ...get(graph, 'task-2'), status: 'done' }), { ...get(graph, 'task-3'), status: 'done' })
  assert.equal(gate(finished, 'task-1').ok, true)
  const dangling = withNode(graph, { ...get(graph, 'task-1'), edges: [{ type: 'depends', to: 'gone-1' }] })
  assert.equal(refused(gate(dangling, 'task-1')).code, 'deps_open', 'a dependency that is not in the graph is not done')
})

test('row 7, waiting_human: open questions the person decides, stop marks without a later answer, and the stop the line remembers', () => {
  const graph = plain()
  const ask = (id: string, extra: Partial<GraphNode> = {}) => node({ id, type: 'question', parent: 'task-1', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }], ...extra }, 20)
  const proposalForm = (id: string) => node({ id, type: 'question', parent: 'task-1' }, 20)
  const withQuestion = graphOf([...graph.nodes.values(), ask('question-9')])
  const waiting = refused(gate(withQuestion, 'task-1'))
  assert.equal(waiting.code, 'waiting_human')
  assert.match(waiting.hint, /^open questions for the person: question-9; the person has not answered yet: put it to them in the chat with propose_to_human\.$/)
  // A question the agent decides is not the person's to answer.
  assert.equal(gate(graphOf([...graph.nodes.values(), ask('question-9', { decider: 'agent' })]), 'task-1').ok, true)
  // A proposal (no options) the person has not answered counts too.
  assert.equal(refused(gate(graphOf([...graph.nodes.values(), proposalForm('question-9')]), 'task-1')).code, 'waiting_human')
  // A question that is done does not.
  assert.equal(gate(graphOf([...graph.nodes.values(), ask('question-9', { status: 'done', decision: 'A' })]), 'task-1').ok, true)
  // A stop mark on the review task under the task holds the task.
  const stopped = graphOf([...graph.nodes.values(), node({ id: 'review-9', type: 'task', parent: 'task-1', kind: 'review', writeScope: [] }, 21, 'harness', [comment(30, '第 3 轮：挡路 2，不挡路 1 · 全审 · hz-review-9-a3-000000 · 停下')])])
  const mark = refused(gate(stopped, 'task-1'))
  assert.equal(mark.code, 'waiting_human')
  assert.match(mark.hint, /^stopped, no answer since: review-9;/)
  // The person answers after the mark: the human entry, or the model's write that carries the person's words.
  const human = graphOf([...stopped.nodes.values(), node({ id: 'note-1', type: 'risk', parent: 'task-1' }, 40, 'human')])
  assert.equal(gate(human, 'task-1').ok, true)
  const relay = graphOf([...stopped.nodes.values(), node({ id: 'note-1', type: 'risk', parent: 'task-1' }, 40, 'llm', [{ at: '2026-10-30T08:00:45.000Z', actor: 'llm', op: 'comment', text: 'recorded', relay: 'go on' }])])
  assert.equal(gate(relay, 'task-1').ok, true)
  // A human entry before the mark does not clear it.
  const before = graphOf([...stopped.nodes.values(), node({ id: 'note-1', type: 'risk', parent: 'task-1' }, 5, 'human')])
  assert.equal(refused(gate(before, 'task-1')).code, 'waiting_human')
  // The execution line's own memory.
  const remembered = refused(gate(graph, 'task-1', { stopped: true }))
  assert.equal(remembered.code, 'waiting_human')
  assert.match(remembered.hint, /^stopped in this process;/)
  // Questions elsewhere in the goal do not hold this task.
  assert.equal(gate(graphOf([...graph.nodes.values(), node({ id: 'question-8', type: 'question', parent: 'task-2', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }] })]), 'task-1').ok, true)
})

test('row 8, busy: a node with a running dispatch is not dispatched again, whatever the role', () => {
  const graph = plain()
  const result = refused(gate(graph, 'task-1', { running: [attempt({ node: 'task-1', childId: 'hz-task-1-a1-aaaaaa' })] }))
  assert.equal(result.code, 'busy')
  assert.equal(result.hint, 'Running: hz-task-1-a1-aaaaaa.')
  assert.equal(refused(gate(graph, 'task-1', { running: [attempt({ node: 'task-1', role: 'check' })] })).code, 'busy')
  assert.equal(gate(graph, 'task-1', { running: [attempt({ node: 'task-2' })] }).ok, true)
})

test('row 9, scope_busy: a write scope that meets a running write task\'s current scope, named in the hint', () => {
  const graph = plain()
  const running = [attempt({ node: 'task-3', childId: 'hz-task-3-a1-bbbbbb' })]
  const result = refused(gate(graph, 'task-1', { running }))
  assert.equal(result.code, 'scope_busy')
  assert.equal(result.message, 'Task task-1 writes where task-3 is writing.')
  assert.match(result.hint, /^task-3 holds site\/feed\/deep\/\./)
  assert.equal(gate(graph, 'task-2', { running }).ok, true)
  // The scope is the graph's now, not what it was at dispatch: after task-3 shrank elsewhere they no longer meet.
  const moved = withNode(graph, { ...get(graph, 'task-3'), writeScope: ['site/elsewhere/'] })
  assert.equal(gate(moved, 'task-1', { running }).ok, true)
  // Only write tasks hold scope: a review of task-3 running does not.
  assert.equal(gate(graph, 'task-1', { running: [attempt({ node: 'task-3', role: 'review' })] }).ok, true)
})

test('row 10, slots_full: as many running write tasks as slots', () => {
  const graph = plain()
  const running = [attempt({ node: 'task-2', childId: 'hz-task-2-a1-cccccc' }), attempt({ node: 'other-1', childId: 'hz-other-1-a1-dddddd' })]
  const result = refused(gate(graph, 'task-1', { running, slots: 2 }))
  assert.equal(result.code, 'slots_full')
  assert.equal(result.message, 'All 2 write slots are in use.')
  assert.match(result.hint, /^Running write tasks: task-2 \(hz-task-2-a1-cccccc, example-model-large\); other-1/)
  assert.equal(gate(graph, 'task-1', { running, slots: 3 }).ok, true)
  assert.equal(gate(graph, 'task-1', { running: [attempt({ node: 'task-2', role: 'review' }), attempt({ node: 'task-3', role: 'check' })], slots: 1 }).ok, true, 'reviews and checks take no slot')
  assert.equal(gate(graph, 'review-1', { running, slots: 1, reviewTarget: { handedBack: true, stale: false } }).ok, true, 'a review does not take a write slot')
})

test('row 11, slots_full again: the GLM peak cap, for GLM models only, counting workers and reviews but not checks', () => {
  const graph = plain()
  const glm = [attempt({ node: 'task-2', model: 'glm-5.3-flash', childId: 'hz-task-2-a1-eeeeee' })]
  const cap = { cap: 1, until: '18:00' }
  const result = refused(gate(graph, 'task-1', { running: glm, glmWorkerCap: cap }, { model: 'glm-5.3' }))
  assert.equal(result.code, 'slots_full')
  assert.equal(result.message, 'GLM peak, reduce: at most 1 GLM subagent at a time until 18:00.')
  assert.equal(result.hint, 'Running GLM subagents: task-2 (hz-task-2-a1-eeeeee, glm-5.3-flash). A non-GLM model is not limited.')
  assert.equal(gate(graph, 'task-1', { running: glm, glmWorkerCap: cap }, { model: 'example-model-large' }).ok, true, 'a non-GLM model is not limited')
  assert.equal(gate(graph, 'task-1', { running: glm }, { model: 'glm-5.3' }).ok, true, 'no cap given')
  assert.equal(gate(graph, 'task-1', { running: [attempt({ node: 'task-2', role: 'check', model: 'glm-5.3' })], glmWorkerCap: cap }, { model: 'glm-5.3' }).ok, true, 'a check runs no model')
  assert.equal(gate(graph, 'task-1', { running: [], glmWorkerCap: cap }, { model: 'glm-5.3' }).ok, true)
  assert.match(refused(gate(graph, 'task-1', { running: [...glm, attempt({ node: 'review-x', role: 'review', model: 'glm-5.3', childId: 'hz-review-x-a1-ffffff' })], glmWorkerCap: { cap: 2 } }, { model: 'glm-5.3' })).message, /^GLM peak, reduce: at most 2 GLM subagents at a time\.$/)
  // The cap applies to reviews and to the goal's review as well.
  assert.equal(refused(gate(graph, 'goal-1', { running: glm, glmWorkerCap: cap }, { model: 'glm-5.3' })).code, 'slots_full')
})

test('row 12, bad_schema: the output schema must resolve', () => {
  const result = refused(gate(plain(), 'task-1', { outputSchemaOk: false }))
  assert.equal(result.code, 'bad_schema')
  assert.equal(gate(plain(), 'review-1', { outputSchemaOk: false, reviewTarget: { handedBack: true, stale: false } }).ok, true, 'write tasks only')
})

test('row 13, nothing_to_review: a review task needs a current finished handback of the task it reviews', () => {
  const graph = plain()
  assert.equal(refused(gate(graph, 'review-1')).code, 'nothing_to_review')
  assert.equal(refused(gate(graph, 'review-1', { reviewTarget: { handedBack: false, stale: false } })).code, 'nothing_to_review')
  assert.equal(refused(gate(graph, 'review-1', { reviewTarget: { handedBack: true, stale: true } })).code, 'nothing_to_review')
  const ok = gate(graph, 'review-1', { reviewTarget: { handedBack: true, stale: false } })
  assert.ok(ok.ok)
  assert.equal(ok.subject, 'review')
  const withDepth = gate(graph, 'review-1', { reviewTarget: { handedBack: true, stale: false } }, { depth: 'light', depthWhy: 'only a rename' })
  assert.ok(withDepth.ok)
  assert.equal(withDepth.args.depth, 'light')
})

test('the goal\'s review: a goal with acceptance and a free model is dispatched; a round at the current trunk commit, or a running one, makes it busy (§3.9.4)', () => {
  const ok = gate(plain(), 'goal-1')
  assert.ok(ok.ok)
  assert.equal(ok.subject, 'goal')
  const reviewed = refused(gate(plain(), 'goal-1', { acceptedAtTrunk: true }))
  assert.equal(reviewed.code, 'busy')
  assert.match(reviewed.message, /already has an acceptance review at the current trunk commit/)
  const running = refused(gate(plain(), 'goal-1', { running: [attempt({ node: 'goal-1', role: 'acceptance-review', childId: 'hz-goal-1-acc-a1-000000' })] }))
  assert.equal(running.code, 'busy')
  assert.match(running.hint, /hz-goal-1-acc-a1-000000/)
})

test('renderAcceptanceBrief: the goal line names the trunk commit, done-when is the goal\'s acceptance as acceptance:<i>, checked needs each item with its evidence, the reviewer writes only its report', () => {
  const graph = withNode(plain(), node({ id: 'task-2', type: 'task', parent: 'feature-1', title: 'Write the index', writeScope: ['site/index/'], ...WORK, status: 'done', evidence: [{ kind: 'commit', ref: 'c0ffee1234567890' }] }))
  const goal = withNode(graph, { ...get(graph, 'goal-1'), acceptance: ['the blog builds', 'the feed validates'] })
  const brief = renderAcceptanceBrief({ graph: goal, goal: get(goal, 'goal-1'), childId: 'hz-goal-1-acc-a1-abcdef', trunk: { branch: 'main', sha: 'abcdef0123456789abcdef0123456789abcdef01' }, gateCommands: ['npm test'] })
  const lines = brief.text.split('\n')
  assert.equal(lines[0], '# Acceptance review of goal goal-1: Static blog')
  assert.ok(lines.includes('Review goal goal-1 at commit abcdef012345 against its acceptance.'))
  assert.ok(lines.includes('- acceptance:0 the blog builds'))
  assert.ok(lines.includes('- acceptance:1 the feed validates'))
  assert.ok(lines.some(line => line.includes('task-2 "Write the index" (done, trunk commit c0ffee123456)')), 'the work of the goal is listed with its trunk commit')
  assert.ok(lines.includes('- A finding blocks only when its criterion is acceptance:<i>, the item of the goal it shows unmet. Everything else is not blocking.'))
  assert.ok(lines.some(line => line.startsWith('- checked must hold one entry per item below, written "acceptance:<i> <evidence>"')))
  assert.ok(lines.includes('- You write nothing except your report ".hourness/hz-goal-1-acc-a1-abcdef.md" in your working directory.'))
  assert.ok(lines.includes('- Not in scope: no comments.'))
  assert.match(brief.text, /verdict \(verdict, commit abcdef012345, findings, checked, lessons\)/)
  assert.equal(brief.digest, digest12(brief.text.slice(0, brief.text.lastIndexOf('\n\nbrief '))))
  assert.ok(brief.text.endsWith(`brief ${brief.digest} · graph ${goal.revision}`))
})

test('the release check reads the context, not a stage: an unreleased result in the context refuses a node the graph shows as released', () => {
  const graph = plain()
  const target = get(graph, 'task-1')
  const released = freeContext(graph, target)
  assert.equal(released.release.ok, true)
  const refusedContext: BriefContext = { ...released, release: { ok: false, level: 'module', node: 'feature-1', stage: 'design' } }
  assert.equal(refused(briefGate(graph, target, refusedContext)).code, 'not_released')
  assert.deepEqual(releaseOf(graph, target), released.release)
})

// ---- the brief ----

function briefInput(overrides: Partial<BriefInput> = {}): BriefInput {
  const graph = plain()
  return {
    graph,
    task: get(graph, 'task-1'),
    childId: 'hz-task-1-a1-k3x9ab',
    parent: 'agent-main',
    worktree: 'C:/ws/.worktrees/hz-task-1',
    branch: 'hz/task-1',
    base: { branch: 'main', sha: 'abc1234' },
    earlier: [],
    quick: false,
    gateCommands: ['npm run build', 'npm test'],
    ...overrides,
  }
}

test('renderBrief: the structure of §3.5.2, built from the graph', () => {
  const brief = renderBrief(briefInput({ context: 'reuse the date helper in site/build.mjs' }))
  const lines = brief.text.split('\n')
  assert.equal(lines[0], '# Task task-1: Write the feed')
  assert.equal(lines[1], 'You are a worker dispatched by the main agent (agent id "agent-main") for exactly one task of the project graph.')
  assert.ok(lines.includes('## Goal'))
  assert.ok(lines.includes('Write the feed. Why it exists: "Static blog" > "Feeds" > this task.'))
  assert.ok(lines.includes('Decisions it follows: decision-1 "RSS before Atom"; question-1 "Feed length" -> 20 posts.'))
  assert.ok(lines.includes('- From the main agent: reuse the date helper in site/build.mjs'))
  assert.ok(lines.includes('- Workspace: your worktree "C:/ws/.worktrees/hz-task-1" on branch "hz/task-1", created from "main" at abc1234. Paths below are relative to it.'))
  assert.ok(lines.includes('- Project graph: read with graph_show / graph_open; graph_focus "task-1" first so the panel shows you on this task. You may only graph_comment.'))
  assert.ok(lines.includes('- Write only inside: site/feed/. Writes elsewhere are refused.'))
  assert.ok(lines.includes('- Before writing, submit a plan with submit_plan and wait for approval.'))
  assert.ok(lines.includes('- Commit on your branch; start every commit message with "task-1: ". Do not push, and do not touch other branches or worktrees; the main agent integrates your branch.'))
  assert.ok(lines.includes('- Not in scope: no Atom feed; no podcast feed; no comments'))
  assert.ok(lines.includes('1. feed lists the 20 newest posts'))
  assert.ok(lines.includes('2. every item has a title'))
  assert.ok(lines.includes('- Run the project checks in your worktree before handing back: npm run build ; npm test.'))
  assert.ok(lines.some(line => line.endsWith('Write long reports to ".hourness/hz-task-1-a1-k3x9ab.md" in your worktree and give the path in "report".')))
  assert.ok(lines.indexOf('## Goal') < lines.indexOf('## Context') && lines.indexOf('## Context') < lines.indexOf('## Constraints') && lines.indexOf('## Constraints') < lines.indexOf('## Done when'))
  assert.ok(!brief.text.includes('Lessons'), 'no lessons section without lessons')
  assert.ok(!brief.text.includes('Rules in effect'))
  assert.ok(!brief.text.includes('Earlier attempts'))
  assert.deepEqual(brief.truncated, [])
})

test('renderBrief: the footer carries the digest of everything above it and the graph revision; the same input gives the same text', () => {
  const brief = renderBrief(briefInput())
  const [body, footer] = brief.text.split('\n\nbrief ')
  assert.equal(footer, `${brief.digest} · graph rev0`)
  assert.equal(brief.digest, digest12(must(body)))
  assert.match(brief.digest, /^[0-9a-f]{12}$/)
  assert.equal(renderBrief(briefInput()).text, brief.text)
  assert.notEqual(renderBrief(briefInput({ context: 'more' })).digest, brief.digest)
})

test('renderBrief: a quick task and a carried plan change the constraint, earlier attempts and lessons appear, rules appear', () => {
  assert.ok(renderBrief(briefInput({ quick: true })).text.includes('- Quick task: no plan needed.'))
  const carried = renderBrief(briefInput({ plan: { version: 2, steps: '1. Write the builder\n   路径：site/feed/ · 验证：L2' } })).text
  assert.ok(carried.includes('- Approved plan (version 2):\n  1. Write the builder\n     路径：site/feed/ · 验证：L2'))
  assert.ok(carried.includes('- Your plan (version 2) is already approved: write inside it.'))
  assert.ok(!carried.includes('submit a plan with submit_plan and wait'))
  const full = renderBrief(briefInput({
    earlier: [{ outcome: 'review round 1: 2 blocking findings', details: ['finding 1: the feed is not sorted', 'finding 2: no date'] }],
    lessons: ['L-1: when X -> Y -> Z', 'L-2: a', 'L-3: b', 'L-4: c', 'L-5: d', 'L-6: e'],
    rules: ['writes go to the worktree', 'no pushes'],
  })).text
  assert.ok(full.includes('- Earlier attempts:\n  - attempt 1: review round 1: 2 blocking findings\n    finding 1: the feed is not sorted\n    finding 2: no date'))
  assert.ok(full.includes('- Lessons that match this task:\n  - L-1: when X -> Y -> Z'))
  assert.ok(full.includes('  - L-5: d') && !full.includes('L-6'), 'at most five lessons')
  assert.ok(full.includes('- Rules in effect: writes go to the worktree; no pushes'))
})

test('renderBrief: over 9000 characters, lessons go first, then the details of earlier attempts, then the main agent\'s context', () => {
  const room = BRIEF_LIMIT - renderBrief(briefInput()).text.length
  const quarter = Math.floor(room / 4)
  const input = (sizes: { lessons: number, details: number, context: number }) => briefInput({
    lessons: [`l ${'x'.repeat(sizes.lessons)}`],
    earlier: [{ outcome: 'blocked', details: [`d ${'y'.repeat(sizes.details)}`] }],
    context: `c ${'z'.repeat(sizes.context)}`,
  })
  const fits = renderBrief(input({ lessons: quarter, details: quarter, context: quarter }))
  assert.deepEqual(fits.truncated, [])
  assert.ok(fits.text.includes('x'.repeat(quarter)) && fits.text.includes('y'.repeat(quarter)) && fits.text.includes('z'.repeat(quarter)))
  const lessonsOnly = renderBrief(input({ lessons: room, details: quarter, context: quarter }))
  assert.deepEqual(lessonsOnly.truncated, ['lessons'])
  assert.ok(lessonsOnly.text.includes('- Lessons that match this task: (truncated)'))
  assert.ok(lessonsOnly.text.includes('y'.repeat(quarter)) && lessonsOnly.text.includes('z'.repeat(quarter)))
  assert.ok(lessonsOnly.text.length <= BRIEF_LIMIT + 80, 'the footer is added after the limit is met')
  const andEarlier = renderBrief(input({ lessons: room, details: room, context: quarter }))
  assert.deepEqual(andEarlier.truncated, ['lessons', 'earlier'])
  assert.ok(andEarlier.text.includes('  - attempt 1: blocked (details truncated)'))
  assert.ok(andEarlier.text.includes('z'.repeat(quarter)))
  const all = renderBrief(input({ lessons: room, details: room, context: room }))
  assert.deepEqual(all.truncated, ['lessons', 'earlier', 'context'])
  assert.ok(all.text.includes('- From the main agent: (truncated)'))
  assert.ok(all.text.length <= BRIEF_LIMIT + 80)
})
test('renderBrief: nothing is reported as truncated that was not there to cut', () => {
  const huge = graphOf([...plain().nodes.values()].map(entry => entry.id === 'task-1' ? { ...entry, acceptance: ['a'.repeat(9500)] } : entry))
  const brief = renderBrief(briefInput({ graph: huge, task: must(huge.nodes.get('task-1')) }))
  assert.deepEqual(brief.truncated, [], 'no lessons, no earlier details, no context: nothing to cut')
  assert.ok(brief.text.length > BRIEF_LIMIT)
})

test('renderBrief: the Context names the user steps the task serves as flow › step, live steps only, in edge order (user graph design 0.4.1 §5.4)', () => {
  const base = plain()
  const task = get(base, 'task-1')
  const graph = graphOf([
    ...[...base.nodes.values()].filter(entry => entry.id !== 'task-1'),
    node({ id: 'role-1', type: 'role', parent: 'goal-1', title: 'Reader' }),
    node({ id: 'flow-1', type: 'flow', parent: 'role-1', title: 'Read a post' }),
    node({ id: 'step-1', type: 'step', parent: 'flow-1', title: 'Open the feed' }),
    node({ id: 'step-2', type: 'step', parent: 'flow-1', title: 'Open a post', status: 'dropped' }),
    node({ id: 'flow-2', type: 'flow', parent: 'role-1', title: 'Subscribe' }),
    node({ id: 'step-3', type: 'step', parent: 'flow-2', title: 'Copy the feed address' }),
    node({ id: 'flow-3', type: 'flow', parent: 'role-1', title: 'Old archive', status: 'dropped' }),
    node({ id: 'step-4', type: 'step', parent: 'flow-3', title: 'Open the archive' }),
    { ...task, edges: [...task.edges ?? [], ...['step-3', 'step-2', 'step-1', 'step-4'].map(to => ({ type: 'serves' as const, to }))] },
  ])
  const lines = renderBrief(briefInput({ graph, task: get(graph, 'task-1') })).text.split('\n')
  const line = '- User steps this task serves (flow › step): Subscribe › Copy the feed address; Read a post › Open the feed. This is how the user meets what you build.'
  assert.ok(lines.includes(line), 'the dropped step and the step under the dropped flow are left out')
  assert.ok(lines.indexOf('## Context') < lines.indexOf(line) && lines.indexOf(line) < lines.indexOf('## Constraints'))
  assert.ok(!renderBrief(briefInput({ graph, task: get(graph, 'task-2') })).text.includes('User steps'), 'a task that serves no step has no such line')
})

test('renderBrief: a task with no source decisions, no non-goals and no write scope says so in words', () => {
  const graph = graphOf([node({ id: 'goal-1', type: 'goal' }), node({ id: 'task-1', type: 'task', parent: 'goal-1', title: 'Bare', kind: 'docs', acceptance: ['done'] })])
  const text = renderBrief(briefInput({ graph, task: must(graph.nodes.get('task-1')) })).text
  assert.ok(text.includes('Decisions it follows: none recorded.'))
  assert.ok(text.includes('- Not in scope: nothing recorded'))
  assert.ok(text.includes('- Write only inside: nothing. Writes elsewhere are refused.'))
  assert.ok(text.includes('Why it exists: "goal-1" > this task.'))
})
