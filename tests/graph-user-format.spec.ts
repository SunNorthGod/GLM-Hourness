import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkNode, serializeNode, type GraphIssue } from '../src/graph/format.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { loadGraph } from '../src/graph/store.ts'
import {
  USER_LIMITS,
  USER_STATUSES,
  WALK_NOTE_PATTERN,
  isPassingEvidence,
  type Evidence,
  type GraphEdge,
  type GraphNode,
  type HistoryEntry,
} from '../src/graph/schema.ts'
import { liveOf } from '../src/graph/user-live.ts'
import { WALK_KINDS, WALK_SECONDS_LIMIT, parseWalkLine, walkCommandsOf, type WalkKind } from '../src/graph/walk-spec.ts'
import { validateGraph } from '../src/graph/validate.ts'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AT = '2026-10-28T08:00:00.000Z'
const born: HistoryEntry = { at: AT, actor: 'human', op: 'propose', reason: '建图', to: 'approved' }

function goal(id = 'goal-1'): GraphNode {
  return { id, type: 'goal', title: '图书管理系统', status: 'approved', acceptance: ['读者能借到书'], history: [born] }
}

/** A node under the base goal, or under the given parent. */
function node(id: string, type: GraphNode['type'], extra: Partial<GraphNode> = {}, parent?: string): GraphNode {
  return {
    id,
    type,
    title: `${id} 标题`,
    status: 'approved',
    parent: parent ?? (type === 'goal' ? undefined : type === 'feature' || type === 'role' ? 'goal-1' : undefined),
    history: [born],
    ...extra,
  }
}

/** The shapes shared by the edge and evidence tests: a goal with two roles' flows, a question and a decision. */
function libraryGraph(): Map<string, GraphNode> {
  return new Map<string, GraphNode>([
    ['goal-1', goal()],
    ['role-1', node('role-1', 'role')],
    ['flow-1', node('flow-1', 'flow', {}, 'role-1')],
    ['flow-2', node('flow-2', 'flow', {}, 'role-1')],
    ['step-1', node('step-1', 'step', {}, 'flow-1')],
    ['step-2', node('step-2', 'step', {}, 'flow-1')],
    ['step-3', node('step-3', 'step', {}, 'flow-2')],
    ['feat-1', node('feat-1', 'feature')],
    ['question-1', { ...node('question-1', 'question', {}, 'goal-1'), ask: '借书前要交押金吗？', form: 'recommend' as const, proposal: '加一步交押金', reason: '人的原话' }],
    ['decision-1', node('decision-1', 'decision', { verification: 'unverified' as const }, 'goal-1')],
  ])
}

/** A copy of the graph with one node's edges replaced. */
function withEdges(graph: Map<string, GraphNode>, id: string, edges: readonly GraphEdge[]): Map<string, GraphNode> {
  const next = new Map(graph)
  next.set(id, { ...next.get(id)!, edges })
  return next
}

function errorIssues(value: Record<string, unknown>): GraphIssue[] {
  const issues: GraphIssue[] = []
  checkNode(value, 'nodes/test.json', issues)
  return issues.filter(issue => issue.severity === 'error')
}

test('the committed project graph still reads clean and serializes byte-identical (golden, design 0.4.1 §1.4 item 1)', async () => {
  const dir = join(repository, 'docs', 'graph')
  const graph = await loadGraph(dir)
  assert.ok(graph.nodes.size > 100, 'docs/graph/nodes holds the project graph')
  assert.deepEqual(graph.issues.filter(issue => issue.severity === 'error'), [], 'no validation errors added to the existing graph')
  for (const node of graph.nodes.values()) {
    const bytes = await readFile(join(dir, 'nodes', `${node.id}.json`), 'utf8')
    assert.equal(serializeNode(node), bytes, node.id)
  }
})

test('a role, a flow and a step read clean; V1 puts each under its parent type (design §1.4 item 2)', () => {
  const good = libraryGraph()
  good.set('step-1', { ...good.get('step-1')!, parent: 'flow-1' })
  assert.deepEqual(validateGraph(good).filter(issue => issue.severity === 'error'), [])
  const wrongParents: readonly (readonly [GraphNode['type'], GraphNode['type']])[] = [
    ['role', 'feature'], ['flow', 'goal'], ['flow', 'feature'], ['step', 'role'], ['step', 'goal'],
  ]
  for (const [type, parent] of wrongParents) {
    const graph = libraryGraph()
    graph.delete('goal-1')
    graph.set('goal-1', goal())
    graph.set(`p-${type}`, node(`p-${type}`, parent))
    graph.set(`${type}-x`, node(`${type}-x`, type, {}, `p-${type}`))
    const issues = validateGraph(graph).filter(issue => issue.severity === 'error')
    assert.equal(issues.length, 1, `${type} under ${parent}: ${JSON.stringify(issues)}`)
    assert.equal(issues[0].field, 'parent', `${type} under ${parent}`)
  }
})

test('V2: a user node stores proposed, approved, dropped or superseded only (design §1.4 item 6, read side)', () => {
  const closed: readonly GraphNode['status'][] = ['doing', 'done']
  for (const status of closed) {
    const issues = errorIssues(node('step-2', 'step', { status }, 'flow-x'))
    assert.ok(issues.some(issue => issue.field === 'status'), status)
  }
  for (const status of USER_STATUSES) {
    assert.ok(!errorIssues(node('step-2', 'step', { status }, 'flow-x')).some(issue => issue.field === 'status'), status)
  }
})

test('V3: serves sits on a feature or task, points at a step of the same goal (design §1.4 item 3)', () => {
  const ok = libraryGraph()
  ok.set('feat-1', { ...ok.get('feat-1')!, edges: [{ type: 'serves', to: 'step-1' }] })
  assert.deepEqual(validateGraph(ok).filter(issue => issue.severity === 'error'), [], 'a feature serving a step of its own goal')
  assert.ok(errorIssues({ ...goal(), edges: [{ type: 'serves', to: 'step-1' }] }).some(issue => issue.field === 'edges[0].type'), 'a goal carries no serves edge')
  const cross = libraryGraph()
  cross.set('goal-2', goal('goal-2'))
  cross.set('feat-1', { ...cross.get('feat-1')!, parent: 'goal-2', edges: [{ type: 'serves', to: 'step-1' }] })
  assert.ok(validateGraph(cross).some(issue => issue.message.includes('different goals')), 'a serves edge may not cross goals')
  const wrongTarget = withEdges(libraryGraph(), 'feat-1', [{ type: 'serves', to: 'flow-1' }])
  assert.ok(validateGraph(wrongTarget).some(issue => issue.message.includes('not a step')), 'serves points at a step')
})

test('V4 and V5: next stays in its flow, a when only on a step branch and within its limit (design §1.4 item 4)', () => {
  assert.deepEqual(validateGraph(withEdges(libraryGraph(), 'step-1', [{ type: 'next', to: 'step-2', when: '密码错' }])).filter(issue => issue.severity === 'error'), [], 'a branch with a when')
  assert.deepEqual(validateGraph(withEdges(libraryGraph(), 'flow-1', [{ type: 'next', to: 'step-1' }])).filter(issue => issue.severity === 'error'), [], 'the entry of a flow')
  assert.ok(validateGraph(withEdges(libraryGraph(), 'step-1', [{ type: 'next', to: 'step-3' }])).some(issue => issue.field === 'edges[0].to'), 'a step branches inside its flow')
  assert.ok(validateGraph(withEdges(libraryGraph(), 'flow-1', [{ type: 'next', to: 'step-3' }])).some(issue => issue.field === 'edges[0].to'), 'a flow enters at its own step')
  const when = '没'.repeat(USER_LIMITS.when + 1)
  assert.ok(errorIssues({ ...node('flow-2', 'flow', {}, 'role-x'), edges: [{ type: 'next', to: 'step-1', when: '密码错' }] }).some(issue => issue.field === 'edges[0].when'), 'a flow entry has no when')
  assert.ok(errorIssues({ ...node('step-2', 'step', {}, 'flow-x'), edges: [{ type: 'next', to: 'step-3', when }] }).some(issue => issue.field === 'edges[0].when'), 'a when over the limit')
  assert.deepEqual(errorIssues({ ...node('step-2', 'step', {}, 'flow-x'), edges: [{ type: 'next', to: 'step-3', when: '密码错' }] }), [])
})

test('V6: depends and source keep off the user nodes; a user node grows from a question only (design §1.4 item 5)', () => {
  assert.deepEqual(validateGraph(withEdges(libraryGraph(), 'step-1', [{ type: 'source', to: 'question-1' }])).filter(issue => issue.severity === 'error'), [], 'a step may grow from a question')
  assert.ok(errorIssues({ ...node('step-2', 'step', {}, 'flow-x'), edges: [{ type: 'depends', to: 'feat-1' }] }).some(issue => issue.field === 'edges[0].type'), 'a step carries no depends edge')
  const cases: readonly (readonly [GraphNode['id'], GraphEdge, string])[] = [
    ['feat-1', { type: 'depends', to: 'step-1' }, 'depends edge cannot point at a step'],
    ['feat-1', { type: 'source', to: 'step-1' }, 'source edge cannot point at a step'],
    ['step-1', { type: 'source', to: 'decision-1' }, 'because of a question'],
  ]
  for (const [on, edge, message] of cases) {
    assert.ok(validateGraph(withEdges(libraryGraph(), on, [edge])).some(issue => issue.message.includes(message)), message)
  }
})

test('V7: walk evidence is a step\'s, with its ref, exit and note shapes (design §1.4 item 7)', () => {
  const good: Evidence = { kind: 'walk', ref: 'command:npm run e2e -- --flow flow-1', exit: 0, note: '@3f2a91c sha256:9bd1c0e2 通过' }
  assert.deepEqual(errorIssues({ ...node('step-4', 'step', {}, 'flow-x'), evidence: [good] }), [], 'a good walk record')
  assert.ok(errorIssues({ ...node('task-1', 'task', {}, 'feat-1'), evidence: [good] }).some(issue => issue.field === 'evidence[0].kind'), 'walk evidence belongs to steps')
  const bad: readonly (readonly [Evidence, string])[] = [
    [{ ...good, ref: 'walked it' }, 'evidence[0].ref'],
    [{ ...good, ref: `command:${'a'.repeat(USER_LIMITS.ref)}` }, 'evidence[0].ref'],
    [{ ...good, exit: undefined }, 'evidence[0].exit'],
    [{ ...good, note: undefined }, 'evidence[0].note'],
    [{ ...good, note: '两行\n的note' }, 'evidence[0].note'],
    [{ ...good, note: `@3f2a91c ${'长'.repeat(USER_LIMITS.note)}` }, 'evidence[0].note'],
  ]
  for (const [evidence, field] of bad) {
    assert.ok(errorIssues({ ...node('step-4', 'step', {}, 'flow-x'), evidence: [evidence] }).some(issue => issue.field === field), `${field} of ${JSON.stringify(evidence)}`)
  }
  assert.deepEqual(errorIssues({ ...node('step-4', 'step', {}, 'flow-x'), evidence: [{ ...good, note: '没有提交号' }] }), [], 'the @commit shape is a write rule, not a read rule')
})

test('the note pattern is the write rule the engine will hold (design §2.7)', () => {
  assert.ok(WALK_NOTE_PATTERN.test('@3f2a91c 通过'), 'a short commit and a result')
  assert.ok(WALK_NOTE_PATTERN.test(`@${'a'.repeat(40)} 通过`), 'a full commit hash')
  assert.ok(!WALK_NOTE_PATTERN.test('没有提交号'), 'no @commit')
  assert.ok(!WALK_NOTE_PATTERN.test('@3F2A91C 通过'), 'uppercase is not a commit')
  assert.ok(!WALK_NOTE_PATTERN.test('@3f2a91c'), 'no result after the commit')
})

test('edges with when and steps with walk evidence round-trip byte-identical (design §1.4 item 7)', () => {
  const step = {
    ...node('step-5', 'step', {}, 'flow-x'),
    edges: [{ type: 'next' as const, to: 'step-6', when: '没交押金' }, { type: 'source' as const, to: 'question-1' }],
    evidence: [{ kind: 'walk' as const, ref: 'person:conversation', exit: 0, note: '@3f2a91c 人说走通了' }],
  }
  const text = serializeNode(step)
  const issues: GraphIssue[] = []
  const parsed = checkNode(JSON.parse(text), 'nodes/step-5.json', issues)
  assert.deepEqual(issues.filter(issue => issue.severity === 'error'), [])
  assert.equal(serializeNode(parsed!), text)
  // No when: the canonical bytes of a plain edge carry no when key (design §7.1).
  const plainText = serializeNode({ ...node('step-6', 'step', {}, 'flow-x'), edges: [{ type: 'next' as const, to: 'step-5' }] })
  assert.ok(plainText.includes('"edges"') && !plainText.includes('"when"'), `no when key on a plain edge:\n${plainText}`)
})

test('parseWalkLine reads the four shapes and refuses the rest (design §1.4 item 8)', () => {
  const seconds: Readonly<Record<WalkKind, number | undefined>> = { 命令: 40, 截图: 90, 终端: 20, 你来走: undefined }
  for (const kind of WALK_KINDS) {
    const line = kind === '你来走' ? '走法：你来走' : `走法：${kind} · 预计 ${seconds[kind]} 秒`
    assert.deepEqual(parseWalkLine(line), seconds[kind] === undefined ? { kind } : { kind, seconds: seconds[kind] }, kind)
  }
  assert.deepEqual(parseWalkLine(`走法：终端 · 预计 ${WALK_SECONDS_LIMIT} 秒`), { kind: '终端', seconds: WALK_SECONDS_LIMIT }, 'the estimate may reach the limit')
  const unparsed: readonly (readonly [string | undefined, string])[] = [
    ['前提：读者已登录', 'missing'],
    ['走法：跑一圈 · 预计 40 秒', 'kind'],
    ['走法：命令 · 预计 0 秒', 'seconds'],
    ['走法：命令 · 预计 1801 秒', 'seconds'],
    ['走法：你来走 · 预计 5 秒', 'trailing'],
    ['走法：你来走，慢慢来', 'trailing'],
    ['走法：命令 · 预计 4.5 秒', 'seconds'],
    ['走法：命令 · 预计 40 秒\n走法：终端 · 预计 20 秒', 'duplicate'],
  ]
  for (const [body, why] of unparsed) {
    assert.ok('unparsed' in parseWalkLine(body), `${why}: ${JSON.stringify(parseWalkLine(body))}`)
  }
  assert.ok('unparsed' in parseWalkLine(undefined), 'no body at all')
})

test('walkCommandsOf reads the walk rows of a merge gate (design §1.4 item 8)', () => {
  const good = walkCommandsOf([
    '`walk 命令 $ npm run e2e -- --flow {flow}`',
    '`walk 终端 $ npm run walk:cli -- {flow}`',
    '成功（怎样算做成）',
  ])
  assert.deepEqual(good.commands, { 命令: 'npm run e2e -- --flow {flow}', 终端: 'npm run walk:cli -- {flow}' })
  assert.deepEqual(good.skipped, [])
  const skip = walkCommandsOf(['`walk 截图 $ npm run shots`', '`walk 逛一圈 $ npm run e2e -- --flow {flow}`'])
  assert.deepEqual(skip.commands, {})
  assert.equal(skip.skipped.length, 2)
  assert.ok(skip.skipped.some(reason => reason.includes('{flow}')))
  assert.ok(skip.skipped.some(reason => reason.includes('逛一圈')))
})

test('isPassingEvidence: a walk never closes a node (design §1.4 item 7)', () => {
  assert.equal(isPassingEvidence({ kind: 'walk', ref: 'person:conversation', exit: 0, note: '@3f2a91c 通过' }), false)
  assert.equal(isPassingEvidence({ kind: 'commit', ref: '3f2a91c' }), true)
  assert.equal(isPassingEvidence({ kind: 'decision', ref: 'A' }), true)
  assert.equal(isPassingEvidence({ kind: 'test', ref: 'npm test', exit: 0 }), true)
  assert.equal(isPassingEvidence({ kind: 'test', ref: 'npm test', exit: 1 }), false)
  assert.equal(isPassingEvidence({ kind: 'check', ref: 'lint', exit: 0 }), true)
})

test('liveOf: dropped and superseded, here and above, take a node out (design §1.4 item 19, unit half)', () => {
  const nodes = new Map<string, GraphNode>([
    ['goal-1', goal()],
    ['role-1', node('role-1', 'role')],
    ['flow-1', node('flow-1', 'flow', {}, 'role-1')],
    ['flow-2', node('flow-2', 'flow', { status: 'dropped' }, 'role-1')],
    ['step-1', node('step-1', 'step', {}, 'flow-1')],
    ['step-2', node('step-2', 'step', {}, 'flow-2')],
    ['step-3', node('step-3', 'step', { status: 'superseded' }, 'flow-1')],
    ['step-4', node('step-4', 'step', { status: 'proposed' }, 'flow-1')],
    ['feat-1', node('feat-1', 'feature', { status: 'done' })],
    ['feat-2', node('feat-2', 'feature', { status: 'dropped' })],
    ['task-1', node('task-1', 'task', { status: 'doing' }, 'feat-1')],
    ['task-2', node('task-2', 'task', { status: 'doing' }, 'feat-2')],
  ])
  const graph = { nodes } as unknown as LoadedGraph
  const live = (id: string): boolean => liveOf(graph, nodes.get(id)!)
  assert.equal(live('step-1'), true)
  assert.equal(live('step-4'), true, 'proposed is live')
  assert.equal(live('step-2'), false, 'the flow above is dropped')
  assert.equal(live('step-3'), false, 'superseded itself')
  assert.equal(live('feat-1'), true, 'done work is live')
  assert.equal(live('task-1'), true, 'doing work under a done feature is live')
  assert.equal(live('task-2'), false, 'doing work under a dropped feature is not')
})

test('readdir sees no user node in the committed graph yet (design §7.5: the engine lands before any writer)', async () => {
  const nodes = await readdir(join(repository, 'docs', 'graph', 'nodes'))
  assert.ok(nodes.every(name => !name.startsWith('role-') && !name.startsWith('flow-') && !name.startsWith('step-')), 'no user node files exist on the graph')
})
