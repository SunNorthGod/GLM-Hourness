import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openEngine, type ApplyResult, type GraphEngine } from '../src/graph/engine.ts'
import { serializeNode } from '../src/graph/format.ts'
import type { Actor, GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { fixtureTest } from './graph-helpers.ts'

type Success = Extract<ApplyResult, { ok: true }>

interface Fixture {
  readonly dir: string
  readonly engine: GraphEngine
  rev(id: string): Promise<string>
  node(id: string): Promise<GraphNode>
  run(actor: Actor, mutation: Record<string, unknown>): Promise<Success>
  /** Apply a mutation with the current rev of mutation.id filled in. */
  act(actor: Actor, mutation: Record<string, unknown>): Promise<ApplyResult>
}

function must(result: ApplyResult): Success {
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`)
  return result
}

function refused(result: ApplyResult, code: string, field?: string): void {
  assert.equal(result.ok, false, `expected ${code}, got success`)
  const { error } = result
  assert.equal(error.code, code, JSON.stringify(error))
  if (field !== undefined) assert.equal(error.field, field, JSON.stringify(error))
  assert.ok(error.hint.length > 0, 'every refusal names the way forward')
}

/**
 * goal-1 (stage design, acceptance, non-goals)
 *   feature-1 approved
 *     task-1 approved, with acceptance
 *     task-2 approved, without acceptance
 */
async function fixture(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), 'graph-engine-'))
  let tick = 0
  const engine = openEngine(dir, { now: () => new Date(Date.UTC(2026, 9, 28, 8, 0, tick++)) })
  const rev = async (id: string): Promise<string> => (await loadGraph(dir)).revisions.get(id)!
  const node = async (id: string): Promise<GraphNode> => (await loadGraph(dir)).nodes.get(id)!
  const run = async (actor: Actor, mutation: Record<string, unknown>): Promise<Success> => must(await engine.apply(actor, mutation))
  const act = async (actor: Actor, mutation: Record<string, unknown>): Promise<ApplyResult> =>
    engine.apply(actor, { ...mutation, rev: await rev(mutation.id as string) })
  await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '项目图引擎', stage: 'design', acceptance: ['人能看，LLM 能读写'], nonGoals: ['不接 DSH 运行时'] } })
  await run('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '引擎', parent: 'goal-1' } })
  await run('human', { op: 'propose', reason: '拆分', node: { type: 'task', title: '存储', parent: 'feature-1', acceptance: ['往返逐字节一致'] } })
  await run('human', { op: 'propose', reason: '拆分', node: { type: 'task', title: '投影', parent: 'feature-1' } })
  return { dir, engine, rev, node, run, act }
}

const graphTest = fixtureTest(fixture)

const QUESTION = {
  type: 'question',
  title: '存储格式',
  parent: 'feature-1',
  // The recommended option comes last (ORCHESTRATION.md §2.6).
  options: [{ key: 'B', label: 'Markdown', consequence: '正文更好读' }, { key: 'A', label: 'JSON', consequence: '不新增解析器' }],
  recommend: 'A',
}

// propose

graphTest('propose by a human: approved at once, generated id, history records actor, time and reason', async g => {
  const goal = await g.node('goal-1')
  assert.equal(goal.status, 'approved')
  assert.deepEqual(goal.history, [{ at: '2026-10-28T08:00:00.000Z', actor: 'human', op: 'propose', reason: '立项', to: 'approved' }])
  const created = await g.run('human', { op: 'propose', reason: '补一项', node: { type: 'task', title: '渲染', parent: 'feature-1' } })
  assert.equal(created.id, 'task-3')
  assert.deepEqual(created.changed, ['task-3'])
  assert.equal(created.rev, await g.rev('task-3'))
  assert.equal(created.revision, (await loadGraph(g.dir)).revision)
  assert.equal(created.node.status, 'approved')
})

graphTest('propose picks the smallest unused id of the type and refuses an id that exists', async g => {
  await g.run('human', { op: 'propose', reason: '指定 id', node: { id: 'task-9', type: 'task', title: '九', parent: 'feature-1' } })
  assert.equal((await g.run('human', { op: 'propose', reason: '补', node: { type: 'task', title: '三', parent: 'feature-1' } })).id, 'task-3')
  refused(await g.engine.apply('human', { op: 'propose', reason: '重复', node: { id: 'task-9', type: 'task', title: '九', parent: 'feature-1' } }), 'conflict', 'node.id')
})

graphTest('propose by the llm: tasks under open work and risks under open nodes are plan-internal', async g => {
  assert.equal((await g.run('llm', { op: 'propose', reason: '计划内', node: { type: 'task', title: '子任务', parent: 'task-1' } })).node.status, 'approved')
  assert.equal((await g.run('llm', { op: 'propose', reason: '风险', node: { type: 'risk', title: '风险', parent: 'feature-1' } })).node.status, 'approved')
  assert.equal((await g.run('llm', { op: 'propose', reason: '问人', node: QUESTION })).node.status, 'approved')
  const history = (await g.node('task-3')).history
  assert.deepEqual(history[0], { at: history[0].at, actor: 'llm', op: 'propose', reason: '计划内', to: 'approved' })
})

graphTest('propose by the llm: new branches, decisions, goals and supersessions wait as proposals', async g => {
  assert.equal((await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })).node.status, 'proposed')
  assert.equal((await g.run('llm', { op: 'propose', reason: '直挂目标', node: { type: 'task', title: '杂项', parent: 'goal-1' } })).node.status, 'proposed')
  assert.equal((await g.run('llm', { op: 'propose', reason: '挂在提议下', node: { type: 'task', title: '面板', parent: 'feature-2' } })).node.status, 'proposed')
  const decision = await g.run('llm', { op: 'propose', reason: '定格式', node: { type: 'decision', title: '用 JSON', parent: 'feature-1' } })
  assert.equal(decision.node.status, 'proposed')
  assert.equal(decision.node.verification, 'unverified')
  assert.equal((await g.run('llm', { op: 'propose', reason: '新目标', node: { type: 'goal', title: '另一个目标' } })).node.status, 'proposed')
  const replacing = await g.run('llm', { op: 'propose', reason: '取代', node: { type: 'task', title: '新存储', parent: 'feature-1', edges: [{ type: 'supersedes', to: 'task-1' }] } })
  assert.equal(replacing.node.status, 'proposed')
  assert.deepEqual(replacing.changed, [replacing.id], 'the superseded node is untouched until a human approves')
  assert.equal((await g.node('task-1')).status, 'approved')
})

graphTest('propose by the llm under a closed node waits as a proposal', async g => {
  await g.act('human', { op: 'status', id: 'task-2', to: 'done', reason: '完成', evidence: [{ kind: 'commit', ref: 'e1c4c15' }] })
  assert.equal((await g.run('llm', { op: 'propose', reason: '迟到的风险', node: { type: 'risk', title: '回归', parent: 'task-2' } })).node.status, 'proposed')
})

graphTest('propose refuses malformed nodes with the request field', async g => {
  refused(await g.engine.apply('human', { op: 'propose', reason: '缺父', node: { type: 'task', title: '孤儿' } }), 'invalid', 'node.parent')
  refused(await g.engine.apply('human', { op: 'propose', reason: '父不存在', node: { type: 'task', title: '孤儿', parent: 'feature-9' } }), 'invalid', 'node.parent')
  refused(await g.engine.apply('human', { op: 'propose', reason: '自带状态', node: { type: 'task', title: '跳过', parent: 'feature-1', status: 'done' } }), 'invalid', 'node.status')
  refused(await g.engine.apply('human', { op: 'propose', reason: '一个选项', node: { ...QUESTION, options: [QUESTION.options[0]] } }), 'invalid', 'node.options')
  refused(await g.engine.apply('human', { op: 'propose', reason: '两行标题', node: { type: 'task', title: '一\n二', parent: 'feature-1' } }), 'invalid', 'node.title')
  refused(await g.engine.apply('human', { op: 'propose', reason: '未知类型', node: { type: 'epic', title: 'x', parent: 'feature-1' } }), 'invalid', 'node.type')
  refused(await g.engine.apply('human', { op: 'propose', reason: '依赖不存在', node: { type: 'task', title: 'x', parent: 'feature-1', edges: [{ type: 'depends', to: 'task-9' }] } }), 'invalid', 'node.edges[0].to')
  assert.equal((await loadGraph(g.dir)).nodes.size, 4, 'refused proposals write nothing')
})

graphTest('propose refuses a question whose recommended option is not the last one, for every actor', async g => {
  const first = { ...QUESTION, options: [...QUESTION.options].reverse() }
  for (const actor of ['human', 'llm', 'harness'] as const) {
    const result = await g.engine.apply(actor, { op: 'propose', reason: '推荐在前', node: first })
    refused(result, 'invalid', 'node.options')
    const { error } = result as Extract<ApplyResult, { ok: false }>
    assert.match(error.message, /recommended option "A" .* is not its last option \("B"\)/)
    assert.match(error.hint, /recommended option last in options/)
  }
  refused(await g.engine.apply('llm', { op: 'propose', reason: '自己定也一样', node: { ...first, decider: 'agent' } }), 'invalid', 'node.options')
  assert.equal((await loadGraph(g.dir)).nodes.size, 4, 'refused proposals write nothing')
  assert.equal((await g.run('llm', { op: 'propose', reason: '推荐在后', node: QUESTION })).node.recommend, 'A')
})

// approve and reject

graphTest('approve: a human turns a proposal into an approved node', async g => {
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  const approved = must(await g.act('human', { op: 'approve', id: proposal.id, reason: '同意' }))
  assert.equal(approved.node.status, 'approved')
  assert.deepEqual(approved.node.history.at(-1), { at: approved.node.history.at(-1)!.at, actor: 'human', op: 'approve', reason: '同意', from: 'proposed', to: 'approved' })
})

graphTest('approve and reject are refused to the llm, including for its own proposal', async g => {
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  refused(await g.act('llm', { op: 'approve', id: proposal.id, reason: '自批' }), 'forbidden')
  refused(await g.act('harness', { op: 'approve', id: proposal.id, reason: '自批' }), 'forbidden')
  refused(await g.act('llm', { op: 'reject', id: proposal.id, reason: '撤回' }), 'forbidden')
  assert.equal((await g.node(proposal.id)).status, 'proposed')
})

graphTest('reject: a proposal becomes dropped; only proposals can be approved or rejected', async g => {
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  const rejected = must(await g.act('human', { op: 'reject', id: proposal.id, reason: '不做' }))
  assert.equal(rejected.node.status, 'dropped')
  assert.deepEqual(rejected.node.history.at(-1)!.to, 'dropped')
  refused(await g.act('human', { op: 'approve', id: 'task-1', reason: '已批准' }), 'bad_transition')
})

graphTest('approving a proposal with a supersedes edge supersedes its targets, decisions included', async g => {
  const old = await g.run('human', { op: 'propose', reason: '旧决策', node: { type: 'decision', title: 'Markdown', parent: 'feature-1' } })
  const proposal = await g.run('llm', { op: 'propose', reason: '改主意', node: { type: 'decision', title: 'JSON', parent: 'feature-1', edges: [{ type: 'supersedes', to: old.id }] } })
  const approved = must(await g.act('human', { op: 'approve', id: proposal.id, reason: '同意取代' }))
  assert.deepEqual(approved.changed, [proposal.id, old.id])
  const superseded = await g.node(old.id)
  assert.equal(superseded.status, 'superseded')
  assert.equal(superseded.verification, 'superseded')
  assert.deepEqual(superseded.history.at(-1), { at: superseded.history.at(-1)!.at, actor: 'human', op: 'supersede', reason: '同意取代', from: 'approved', to: 'superseded', by: proposal.id })
})

graphTest('a human proposal with a supersedes edge takes effect at once', async g => {
  const created = await g.run('human', { op: 'propose', reason: '重写', node: { type: 'task', title: '新存储', parent: 'feature-1', edges: [{ type: 'supersedes', to: 'task-1' }] } })
  assert.deepEqual(created.changed, [created.id, 'task-1'])
  assert.equal((await g.node('task-1')).status, 'superseded')
})

// status

graphTest('done requires passing evidence in the same write', async g => {
  refused(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '做完了' }), 'evidence_required', 'evidence')
  refused(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '做完了', evidence: [{ kind: 'test', ref: 'npm test', exit: 1 }] }), 'evidence_required', 'evidence')
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'done', reason: '做完了', evidence: [] }), 'evidence_required', 'evidence')
  assert.equal((await g.node('task-1')).status, 'approved')
  const done = must(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '测试通过', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }, { kind: 'commit', ref: '17b8e3f' }] }))
  assert.equal(done.node.status, 'done')
  assert.deepEqual(done.node.evidence, [{ kind: 'test', ref: 'npm test', exit: 0 }, { kind: 'commit', ref: '17b8e3f' }])
  assert.deepEqual(done.node.history.at(-1), {
    at: done.node.history.at(-1)!.at, actor: 'llm', op: 'status', reason: '测试通过', from: 'approved', to: 'done',
    evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }, { kind: 'commit', ref: '17b8e3f' }],
  })
})

graphTest('reopen and close again needs new evidence; dropped nodes can be restored', async g => {
  await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '完成', evidence: [{ kind: 'commit', ref: '17b8e3f' }] })
  assert.equal(must(await g.act('llm', { op: 'status', id: 'task-1', to: 'doing', reason: '返工' })).node.status, 'doing')
  refused(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '再关' }), 'evidence_required')
  must(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '再关', evidence: [{ kind: 'commit', ref: 'abcdef1' }] }))
  assert.deepEqual((await g.node('task-1')).evidence!.map(entry => entry.ref), ['17b8e3f', 'abcdef1'])
  must(await g.act('llm', { op: 'status', id: 'task-2', to: 'dropped', reason: '不需要' }))
  assert.equal(must(await g.act('llm', { op: 'status', id: 'task-2', to: 'approved', reason: '又需要了' })).node.status, 'approved')
})

graphTest('status refuses transitions outside the table', async g => {
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  refused(await g.act('human', { op: 'status', id: proposal.id, to: 'doing', reason: '直接开工' }), 'bad_transition')
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'superseded', reason: '换掉' }), 'bad_transition', 'to')
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'proposed', reason: '退回' }), 'bad_transition', 'to')
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'approved', reason: '原样' }), 'bad_transition', 'to')
  await g.act('human', { op: 'status', id: 'task-1', to: 'doing', reason: '开工' })
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'approved', reason: '退回' }), 'bad_transition', 'to')
})

graphTest('questions close only through decide; the llm cannot drop them', async g => {
  const question = await g.run('llm', { op: 'propose', reason: '问人', node: QUESTION })
  refused(await g.act('human', { op: 'status', id: question.id, to: 'done', reason: '定了', evidence: [{ kind: 'commit', ref: '17b8e3f' }] }), 'bad_transition', 'to')
  refused(await g.act('llm', { op: 'status', id: question.id, to: 'dropped', reason: '不问了' }), 'forbidden')
  assert.equal(must(await g.act('human', { op: 'status', id: question.id, to: 'dropped', reason: '不问了' })).node.status, 'dropped')
})

graphTest('the llm cannot drop or restore the goal or a feature', async g => {
  refused(await g.act('llm', { op: 'status', id: 'feature-1', to: 'dropped', reason: '砍掉' }), 'forbidden')
  refused(await g.act('harness', { op: 'status', id: 'goal-1', to: 'dropped', reason: '砍掉' }), 'forbidden')
  must(await g.act('human', { op: 'status', id: 'feature-1', to: 'dropped', reason: '砍掉' }))
  refused(await g.act('llm', { op: 'status', id: 'feature-1', to: 'approved', reason: '恢复' }), 'forbidden')
})

graphTest('decision evidence cannot be attached by hand', async g => {
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'doing', reason: 'x', evidence: [{ kind: 'decision', ref: 'A' }] }), 'invalid', 'evidence[0].kind')
  refused(await g.act('human', { op: 'status', id: 'task-1', to: 'done', reason: 'x', evidence: [{ kind: 'commit', ref: 'HEAD' }] }), 'invalid', 'evidence[0].ref')
})

// edit

graphTest('edit by a human: goal acceptance and non-goals, with from and to in history', async g => {
  const edited = must(await g.act('human', { op: 'edit', id: 'goal-1', reason: '说清楚', set: { acceptance: ['人能看', 'LLM 能读写'], nonGoals: null } }))
  assert.deepEqual(edited.node.acceptance, ['人能看', 'LLM 能读写'])
  assert.equal(edited.node.nonGoals, undefined)
  assert.deepEqual(edited.node.history.at(-1), {
    at: edited.node.history.at(-1)!.at, actor: 'human', op: 'edit', reason: '说清楚',
    changes: { acceptance: { from: ['人能看，LLM 能读写'], to: ['人能看', 'LLM 能读写'] }, nonGoals: { from: ['不接 DSH 运行时'], to: null } },
  })
})

graphTest('edit by the llm: the goal, acceptance criteria and non-goals are refused', async g => {
  refused(await g.act('llm', { op: 'edit', id: 'goal-1', reason: '改目标', set: { title: '新目标' } }), 'forbidden')
  refused(await g.act('llm', { op: 'edit', id: 'goal-1', reason: '改验收', set: { acceptance: ['更宽松'] } }), 'forbidden')
  refused(await g.act('llm', { op: 'edit', id: 'task-1', reason: '改验收', set: { acceptance: ['更宽松'] } }), 'forbidden', 'set.acceptance')
  refused(await g.act('harness', { op: 'edit', id: 'feature-1', reason: '改非目标', set: { nonGoals: ['不做测试'] } }), 'forbidden', 'set.nonGoals')
  refused(await g.act('llm', { op: 'edit', id: 'task-1', reason: '挪走', set: { parent: 'goal-1' } }), 'forbidden', 'set.parent')
  assert.deepEqual((await g.node('task-1')).acceptance, ['往返逐字节一致'])
})

graphTest('edit by the llm: every field of a goal it proposed while the goal waits; adopted goals, other actors and goal edges stay refused', async g => {
  const goal = await g.run('llm', { op: 'propose', reason: '许愿', node: { type: 'goal', title: '记账小工具', stage: 'wish', body: '需求：每天记一下花了多少钱' } })
  assert.equal(goal.node.status, 'proposed')
  const edited = must(await g.act('llm', { op: 'edit', id: goal.id, reason: '访谈', set: { acceptance: ['月底能看出钱花在哪'], nonGoals: ['不做多人共享'], stage: 'interview' } }))
  assert.deepEqual([edited.node.acceptance, edited.node.nonGoals, edited.node.stage], [['月底能看出钱花在哪'], ['不做多人共享'], 'interview'])
  assert.deepEqual(edited.node.history.at(-1), {
    at: edited.node.history.at(-1)!.at, actor: 'llm', op: 'edit', reason: '访谈',
    changes: { stage: { from: 'wish', to: 'interview' }, acceptance: { from: null, to: ['月底能看出钱花在哪'] }, nonGoals: { from: null, to: ['不做多人共享'] } },
  })
  // Another actor's proposal is not its draft.
  refused(await g.act('harness', { op: 'edit', id: goal.id, reason: '改', set: { title: '别的' } }), 'forbidden')
  // Edges of a goal stay the human's, even on the llm's own proposal.
  refused(await g.act('llm', { op: 'link', id: goal.id, type: 'source', to: 'goal-1', reason: '连' }), 'forbidden')
  must(await g.act('human', { op: 'approve', id: goal.id, reason: '确认' }))
  refused(await g.act('llm', { op: 'edit', id: goal.id, reason: '再改', set: { acceptance: ['更宽松'] } }), 'forbidden')
  refused(await g.act('llm', { op: 'edit', id: goal.id, reason: '再改', set: { title: '新名字' } }), 'forbidden')
  assert.deepEqual((await g.node(goal.id)).acceptance, ['月底能看出钱花在哪'])
})

graphTest('edit by the llm: title, body, slope and dispatch attributes; every field of its own open proposal', async g => {
  const edited = must(await g.act('llm', { op: 'edit', id: 'task-1', reason: '补正文', set: { title: '图存储', body: '读写节点文件', slope: 'downhill' } }))
  assert.equal(edited.node.title, '图存储')
  const dispatch = must(await g.act('llm', {
    op: 'edit', id: 'task-1', reason: '派发前补齐',
    set: { writeScope: ['src/graph/'], outputSchema: 'handback-implement', worktree: true, tier: 'hard', kind: 'implement' },
  }))
  assert.deepEqual(dispatch.node.history.at(-1)!.changes, {
    kind: { from: null, to: 'implement' },
    tier: { from: null, to: 'hard' },
    worktree: { from: null, to: true },
    outputSchema: { from: null, to: 'handback-implement' },
    writeScope: { from: null, to: ['src/graph/'] },
  })
  assert.deepEqual(Object.keys(dispatch.node.history.at(-1)!.changes!), ['kind', 'tier', 'worktree', 'outputSchema', 'writeScope'], 'changes follow the field write order')
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  must(await g.act('llm', { op: 'edit', id: proposal.id, reason: '补验收', set: { acceptance: ['能点开节点'], stage: 'design' } }))
  const human = await g.run('human', { op: 'propose', reason: '人提的', node: { type: 'feature', title: '报告', parent: 'goal-1' } })
  refused(await g.act('llm', { op: 'edit', id: human.id, reason: '改验收', set: { acceptance: ['x'] } }), 'forbidden', 'set.acceptance')
})

graphTest('edit refuses no-op, non-editable and rule-breaking changes', async g => {
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: '原样', set: { title: '存储' } }), 'invalid', 'set')
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: '改状态', set: { status: 'done' } }), 'invalid', 'set.status')
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: '空', set: {} }), 'invalid', 'set')
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: '删标题', set: { title: null } }), 'invalid', 'set.title')
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: '任务带阶段', set: { stage: 'design' } }), 'invalid', 'set.stage')
  refused(await g.act('human', { op: 'edit', id: 'goal-1', reason: '目标挂父', set: { parent: 'feature-1' } }), 'invalid', 'set.parent')
  await g.run('human', { op: 'propose', reason: '子任务', node: { type: 'task', title: '子', parent: 'task-1' } })
  const cycle = await g.act('human', { op: 'edit', id: 'task-1', reason: '成环', set: { parent: 'task-3' } })
  refused(cycle, 'invalid')
  assert.match((cycle as Extract<ApplyResult, { ok: false }>).error.message, /decomposition cycle/)
  assert.equal((await g.node('task-1')).parent, 'feature-1')
})

graphTest('edit of options or recommend keeps the recommended option last; a question written before the rule still loads and takes other edits', async g => {
  const asked = await g.run('human', { op: 'propose', reason: '问人', node: QUESTION })
  refused(await g.act('human', { op: 'edit', id: asked.id, reason: '换推荐', set: { recommend: 'B' } }), 'invalid', 'set.recommend')
  refused(await g.act('human', { op: 'edit', id: asked.id, reason: '换顺序', set: { options: [...QUESTION.options].reverse() } }), 'invalid', 'set.options')
  const both = must(await g.act('human', { op: 'edit', id: asked.id, reason: '换推荐并放到最后', set: { options: [...QUESTION.options].reverse(), recommend: 'B' } }))
  assert.deepEqual([both.node.options!.at(-1)!.key, both.node.recommend], ['B', 'B'])
  // A question from before the rule: its recommended option comes first.
  const old: GraphNode = {
    id: 'question-old', type: 'question', title: '旧待决', status: 'approved', parent: 'feature-1',
    options: [...QUESTION.options].reverse(), recommend: 'A',
    history: [{ at: '2026-10-28T07:00:00.000Z', actor: 'llm', op: 'propose', reason: '规则之前', to: 'approved' }],
  }
  await writeFile(join(g.dir, 'nodes', 'question-old.json'), serializeNode(old))
  assert.deepEqual((await loadGraph(g.dir)).issues, [], 'the rule is not a file rule')
  must(await g.act('human', { op: 'edit', id: 'question-old', reason: '改标题', set: { title: '旧待决（改名）' } }))
  must(await g.act('llm', { op: 'edit', id: 'question-old', reason: '交给人', set: { decider: 'human' } }))
  refused(await g.act('human', { op: 'edit', id: 'question-old', reason: '改说法', set: { options: [{ ...old.options![0], label: 'MD' }, old.options![1]] } }), 'invalid', 'set.options')
  assert.equal(must(await g.act('human', { op: 'decide', id: 'question-old', option: 'A', reason: '定了' })).node.decision, 'A')
})

graphTest('edit by a human can move a node to another parent', async g => {
  await g.run('human', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '渲染', parent: 'goal-1' } })
  const moved = must(await g.act('human', { op: 'edit', id: 'task-2', reason: '归到渲染', set: { parent: 'feature-2' } }))
  assert.equal(moved.node.parent, 'feature-2')
  assert.deepEqual(moved.node.history.at(-1)!.changes, { parent: { from: 'feature-1', to: 'feature-2' } })
})

// task dispatch attributes

graphTest('dispatch attributes: proposed with a task, shown in its projection, refused elsewhere', async g => {
  const task = await g.run('llm', {
    op: 'propose', reason: '拆出可派发的叶子',
    node: { type: 'task', title: '命令行', parent: 'feature-1', kind: 'implement', tier: 'standard', writeScope: ['src/graph/cli.ts', 'tests/'], worktree: true, outputSchema: 'handback-implement', acceptance: ['被拒的变更返回结构化错误'] },
  })
  assert.equal(task.node.status, 'approved')
  const result = await g.engine.projection(task.id)
  assert.ok(result.ok)
  const { node } = result.projection
  assert.deepEqual([node.kind, node.tier, node.writeScope, node.worktree, node.outputSchema], ['implement', 'standard', ['src/graph/cli.ts', 'tests/'], true, 'handback-implement'])
  assert.equal('owner' in node, false)
  refused(await g.engine.apply('human', { op: 'propose', reason: '特性不派发', node: { type: 'feature', title: '查看器', parent: 'goal-1', kind: 'implement' } }), 'invalid', 'node.kind')
  refused(await g.engine.apply('llm', { op: 'propose', reason: '审查带写入', node: { type: 'task', title: '审查', parent: 'feature-1', kind: 'review', writeScope: ['src/'] } }), 'invalid', 'node.writeScope')
  refused(await g.engine.apply('llm', { op: 'propose', reason: '越界', node: { type: 'task', title: '越界', parent: 'feature-1', writeScope: ['../outside'] } }), 'invalid', 'node.writeScope[0]')
  refused(await g.engine.apply('llm', { op: 'propose', reason: '旧字段', node: { type: 'task', title: '旧', parent: 'feature-1', owner: '实现' } }), 'invalid', 'node.owner')
  refused(await g.act('llm', { op: 'edit', id: task.id, reason: '放宽验收', set: { acceptance: ['能跑就行'] } }), 'forbidden', 'set.acceptance')
  const review = must(await g.act('human', { op: 'edit', id: task.id, reason: '改成审查', set: { kind: 'review', writeScope: null, worktree: null } }))
  assert.deepEqual([review.node.kind, review.node.writeScope, review.node.worktree], ['review', undefined, undefined])
})

// link and unlink

graphTest('link and unlink depends and source edges, with the edge in history', async g => {
  const linked = must(await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: '先存储' }))
  assert.deepEqual(linked.node.edges, [{ type: 'depends', to: 'task-1' }])
  assert.deepEqual(linked.node.history.at(-1), { at: linked.node.history.at(-1)!.at, actor: 'llm', op: 'link', reason: '先存储', edge: { type: 'depends', to: 'task-1' } })
  must(await g.act('llm', { op: 'link', id: 'task-2', type: 'source', to: 'feature-1', reason: '来源' }))
  refused(await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: '重复' }), 'conflict')
  const unlinked = must(await g.act('llm', { op: 'unlink', id: 'task-2', type: 'depends', to: 'task-1', reason: '不再依赖' }))
  assert.deepEqual(unlinked.node.edges, [{ type: 'source', to: 'feature-1' }])
  refused(await g.act('llm', { op: 'unlink', id: 'task-2', type: 'depends', to: 'task-1', reason: '再删' }), 'not_found', 'to')
})

graphTest('link refuses unknown targets, cycles, supersedes edges and llm edits of the goal', async g => {
  refused(await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-9', reason: 'x' }), 'not_found', 'to')
  must(await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: 'x' }))
  const cycle = await g.act('llm', { op: 'link', id: 'task-1', type: 'depends', to: 'task-2', reason: '成环' })
  refused(cycle, 'invalid', 'to')
  assert.match((cycle as Extract<ApplyResult, { ok: false }>).error.message, /dependency cycle/)
  refused(await g.act('human', { op: 'link', id: 'task-2', type: 'supersedes', to: 'task-1', reason: 'x' }), 'invalid', 'type')
  refused(await g.act('llm', { op: 'link', id: 'goal-1', type: 'source', to: 'feature-1', reason: 'x' }), 'forbidden')
  refused(await g.act('llm', { op: 'link', id: 'task-1', type: 'depends', to: 'task-1', reason: '自己' }), 'invalid')
})

// comment

graphTest('comment: any actor, no rev or reason, text in history', async g => {
  const commented = must(await g.engine.apply('llm', { op: 'comment', id: 'task-1', text: '卡在编码上' }))
  assert.deepEqual(commented.node.history.at(-1), { at: commented.node.history.at(-1)!.at, actor: 'llm', op: 'comment', text: '卡在编码上' })
  must(await g.engine.apply('human', { op: 'comment', id: 'goal-1', text: '先做存储' }))
  refused(await g.engine.apply('human', { op: 'comment', id: 'goal-1', text: '  ' }), 'invalid', 'text')
  refused(await g.engine.apply('human', { op: 'comment', id: 'goal-1', text: 'x', reason: '多余' }), 'invalid', 'reason')
  refused(await g.engine.apply('human', { op: 'comment', id: 'task-9', text: 'x' }), 'not_found', 'id')
})

// decide

graphTest('decide: a human picks an option, the question is done with decision evidence', async g => {
  const question = await g.run('llm', { op: 'propose', reason: '问人', node: QUESTION })
  refused(await g.act('llm', { op: 'decide', id: question.id, option: 'A', reason: '自己定' }), 'forbidden')
  refused(await g.act('human', { op: 'decide', id: question.id, option: 'C', reason: '没这项' }), 'invalid', 'option')
  const decided = must(await g.act('human', { op: 'decide', id: question.id, option: 'B', reason: '正文好读' }))
  assert.equal(decided.node.status, 'done')
  assert.equal(decided.node.decision, 'B')
  assert.deepEqual(decided.node.evidence, [{ kind: 'decision', ref: 'B' }])
  assert.deepEqual(decided.node.history.at(-1), {
    at: decided.node.history.at(-1)!.at, actor: 'human', op: 'decide', reason: '正文好读', from: 'approved', to: 'done', option: 'B', evidence: [{ kind: 'decision', ref: 'B' }],
  })
  refused(await g.act('human', { op: 'decide', id: question.id, option: 'B', reason: '再定' }), 'bad_transition', 'option')
  const overturned = must(await g.act('human', { op: 'decide', id: question.id, option: 'A', reason: '还是不加解析器' }))
  assert.equal(overturned.node.decision, 'A')
  assert.deepEqual(overturned.node.evidence, [{ kind: 'decision', ref: 'B' }, { kind: 'decision', ref: 'A' }])
  assert.deepEqual([overturned.node.history.at(-1)?.from, overturned.node.history.at(-1)?.to], ['done', 'done'], 'a done question is decided again in place')
})

graphTest('decide applies to approved questions only', async g => {
  refused(await g.act('human', { op: 'decide', id: 'task-1', option: 'A', reason: 'x' }), 'invalid', 'id')
  await g.act('human', { op: 'status', id: 'task-2', to: 'done', reason: '完成', evidence: [{ kind: 'commit', ref: 'e1c4c15' }] })
  const proposal = await g.run('llm', { op: 'propose', reason: '问人', node: { ...QUESTION, parent: 'task-2' } })
  assert.equal(proposal.node.status, 'proposed')
  refused(await g.act('human', { op: 'decide', id: proposal.id, option: 'A', reason: 'x' }), 'bad_transition')
})

// verify

graphTest('verify: sandbox or device needs passing test or check evidence; any actor', async g => {
  const decision = await g.run('human', { op: 'propose', reason: '定格式', node: { type: 'decision', title: '用 JSON', parent: 'feature-1' } })
  refused(await g.act('llm', { op: 'verify', id: decision.id, to: 'sandbox', reason: '试过了' }), 'evidence_required', 'evidence')
  refused(await g.act('llm', { op: 'verify', id: decision.id, to: 'sandbox', reason: '试过了', evidence: [{ kind: 'test', ref: 'npm test', exit: 1 }] }), 'evidence_required')
  refused(await g.act('llm', { op: 'verify', id: decision.id, to: 'sandbox', reason: '试过了', evidence: [{ kind: 'commit', ref: 'e1c4c15' }] }), 'evidence_required')
  const verified = must(await g.act('llm', { op: 'verify', id: decision.id, to: 'sandbox', reason: '沙盒通过', evidence: [{ kind: 'check', ref: 'npm run preflight', exit: 0 }] }))
  assert.equal(verified.node.verification, 'sandbox')
  assert.deepEqual(verified.node.history.at(-1), {
    at: verified.node.history.at(-1)!.at, actor: 'llm', op: 'verify', reason: '沙盒通过', from: 'unverified', to: 'sandbox', evidence: [{ kind: 'check', ref: 'npm run preflight', exit: 0 }],
  })
  assert.equal(must(await g.act('human', { op: 'verify', id: decision.id, to: 'overturned', reason: '真机不行' })).node.verification, 'overturned')
  refused(await g.act('human', { op: 'verify', id: decision.id, to: 'superseded', reason: 'x' }), 'bad_transition', 'to')
  refused(await g.act('human', { op: 'verify', id: decision.id, to: 'overturned', reason: 'x' }), 'bad_transition', 'to')
  refused(await g.act('human', { op: 'verify', id: 'task-1', to: 'sandbox', reason: 'x', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] }), 'invalid', 'id')
})

// supersede

graphTest('supersede: a human replaces a node; the new node gets the edge, the old one the by', async g => {
  const replacement = await g.run('human', { op: 'propose', reason: '重写', node: { type: 'task', title: '新存储', parent: 'feature-1' } })
  refused(await g.act('llm', { op: 'supersede', id: 'task-1', by: replacement.id, reason: '换掉' }), 'forbidden')
  const done = must(await g.act('human', { op: 'supersede', id: 'task-1', by: replacement.id, reason: '换掉' }))
  assert.deepEqual(done.changed, ['task-1', replacement.id])
  assert.equal(done.node.status, 'superseded')
  assert.deepEqual(done.node.history.at(-1), { at: done.node.history.at(-1)!.at, actor: 'human', op: 'supersede', reason: '换掉', from: 'approved', to: 'superseded', by: replacement.id })
  const fresh = await g.node(replacement.id)
  assert.deepEqual(fresh.edges, [{ type: 'supersedes', to: 'task-1' }])
  assert.deepEqual(fresh.history.at(-1), { at: fresh.history.at(-1)!.at, actor: 'human', op: 'supersede', reason: '换掉', edge: { type: 'supersedes', to: 'task-1' } })
  refused(await g.act('human', { op: 'supersede', id: 'task-1', by: replacement.id, reason: '再换' }), 'bad_transition')
})

graphTest('supersede refuses unknown, proposed or identical replacements', async g => {
  refused(await g.act('human', { op: 'supersede', id: 'task-1', by: 'task-9', reason: 'x' }), 'not_found', 'by')
  refused(await g.act('human', { op: 'supersede', id: 'task-1', by: 'task-1', reason: 'x' }), 'invalid', 'by')
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  refused(await g.act('human', { op: 'supersede', id: 'feature-1', by: proposal.id, reason: 'x' }), 'bad_transition', 'by')
  refused(await g.act('human', { op: 'supersede', id: proposal.id, by: 'feature-1', reason: 'x' }), 'bad_transition')
})

// revisions and concurrency

graphTest('a stale rev is refused, and so is a rev from before an edit by another client', async g => {
  const rev = await g.rev('task-1')
  must(await g.engine.apply('human', { op: 'edit', id: 'task-1', rev, reason: '第一次', set: { title: '甲' } }))
  refused(await g.engine.apply('llm', { op: 'edit', id: 'task-1', rev, reason: '第二次', set: { title: '乙' } }), 'stale_revision', 'rev')
  const current = await g.rev('task-1')
  const handEdited: GraphNode = { ...await g.node('task-1'), body: '手改' }
  await writeFile(join(g.dir, 'nodes', 'task-1.json'), serializeNode(handEdited))
  refused(await g.engine.apply('llm', { op: 'status', id: 'task-1', rev: current, to: 'doing', reason: '开工' }), 'stale_revision', 'rev')
  assert.equal((await g.node('task-1')).body, '手改')
})

graphTest('concurrent writes in one process are serialized, across engine instances too', async g => {
  const rev = await g.rev('task-1')
  const other = openEngine(g.dir)
  const results = await Promise.all([
    g.engine.apply('human', { op: 'edit', id: 'task-1', rev, reason: '甲', set: { title: '甲' } }),
    other.apply('llm', { op: 'edit', id: 'task-1', rev, reason: '乙', set: { title: '乙' } }),
    g.engine.apply('llm', { op: 'comment', id: 'task-1', text: '并发批注' }),
  ])
  assert.deepEqual(results.map(result => result.ok), [true, false, true])
  refused(results[1], 'stale_revision')
  const node = await g.node('task-1')
  assert.equal(node.title, '甲')
  assert.deepEqual(node.history.slice(-2).map(entry => entry.op), ['edit', 'comment'])
})

graphTest('a graph with validation errors stays readable and refuses every write', async g => {
  await writeFile(join(g.dir, 'nodes', 'task-7.json'), '{ "id": ')
  const result = await g.engine.apply('human', { op: 'comment', id: 'task-1', text: 'x' })
  refused(result, 'graph_invalid')
  assert.match((result as Extract<ApplyResult, { ok: false }>).error.message, /nodes\/task-7\.json/)
  assert.equal((await g.engine.projection('task-1')).ok, true)
  assert.equal((await g.engine.openItems()).ready.length, 2)
})

graphTest('every write leaves canonical files that load without issues', async g => {
  await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: 'x' })
  await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: 'x', evidence: [{ kind: 'test', ref: 'npm test', exit: 0, note: '全绿' }] })
  await g.act('human', { op: 'edit', id: 'goal-1', reason: 'x', set: { body: '第一行\n第二行' } })
  const graph = await loadGraph(g.dir)
  assert.deepEqual(graph.issues, [])
  for (const [id, node] of graph.nodes) assert.equal(await readFile(join(g.dir, 'nodes', `${id}.json`), 'utf8'), serializeNode(node))
})

// request shape

graphTest('malformed requests are refused before the graph is touched', async g => {
  refused(await g.engine.apply('human', 'approve'), 'invalid')
  refused(await g.engine.apply('human', { op: 'delete', id: 'task-1' }), 'invalid', 'op')
  refused(await g.engine.apply('human', { op: 'approve', id: 'task-1', reason: 'x' }), 'invalid', 'rev')
  refused(await g.engine.apply('human', { op: 'approve', id: 'task-1', rev: 'x' }), 'invalid', 'reason')
  refused(await g.engine.apply('human', { op: 'approve', id: 'task-1', rev: 'x', reason: '' }), 'invalid', 'reason')
  refused(await g.engine.apply('human', { op: 'approve', id: '../task-1', rev: 'x', reason: 'x' }), 'invalid', 'id')
  refused(await g.engine.apply('human', { op: 'approve', id: 'task-1', rev: 'x', reason: 'x', actor: 'human' }), 'invalid', 'actor')
  refused(await g.engine.apply('human', { op: 'status', id: 'task-1', rev: 'x', reason: 'x', to: 'finished' }), 'invalid', 'to')
  refused(await g.engine.apply('human', { op: 'propose', reason: 'x', node: { title: 'x', parent: 'feature-1' } }), 'invalid', 'node.type')
  refused(await g.engine.apply('human', { op: 'status', id: 'task-9', rev: 'x', reason: 'x', to: 'doing' }), 'not_found', 'id')
})

// projections

graphTest('projection: node, ancestor chain to the goal with acceptance and non-goals, neighbors, stage', async g => {
  await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: '先存储' })
  await g.act('llm', { op: 'link', id: 'task-2', type: 'source', to: 'feature-1', reason: '来源' })
  await g.run('human', { op: 'propose', reason: '子任务', node: { type: 'task', title: '索引', parent: 'task-2' } })
  const result = await g.engine.projection('task-2')
  assert.ok(result.ok)
  const { projection } = result
  const graph = await loadGraph(g.dir)
  assert.equal(projection.revision, graph.revision)
  assert.equal(projection.node.id, 'task-2')
  assert.equal(projection.node.rev, graph.revisions.get('task-2'))
  assert.equal('history' in projection.node, false)
  assert.equal(projection.historyCount, 3)
  assert.deepEqual(projection.ancestors.map(entry => entry.id), ['feature-1', 'goal-1'])
  assert.deepEqual(projection.ancestors[1], {
    id: 'goal-1', type: 'goal', title: '项目图引擎', status: 'approved', rev: graph.revisions.get('goal-1'),
    acceptance: ['人能看，LLM 能读写'], nonGoals: ['不接 DSH 运行时'],
  })
  assert.equal('acceptance' in projection.ancestors[0], false)
  assert.deepEqual(projection.children.map(entry => entry.id), ['task-3'])
  assert.deepEqual(projection.dependsOn.map(entry => entry.id), ['task-1'])
  assert.deepEqual(projection.sources.map(entry => entry.id), ['feature-1'])
  assert.equal(projection.stage, 'design')
  const upstream = await g.engine.projection('task-1')
  assert.ok(upstream.ok)
  assert.deepEqual(upstream.projection.dependents.map(entry => entry.id), ['task-2'])
  const feature = await g.engine.projection('feature-1')
  assert.ok(feature.ok)
  assert.deepEqual(feature.projection.sourceOf.map(entry => entry.id), ['task-2'])
})

graphTest('projection gates: dependencies, approval, questions, acceptance, children, verification', async g => {
  await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: 'x' })
  const question = await g.run('llm', { op: 'propose', reason: '问人', node: { ...QUESTION, parent: 'task-2' } })
  const task2 = await g.engine.projection('task-2')
  assert.ok(task2.ok)
  assert.deepEqual(task2.projection.gates.map(gate => [gate.kind, gate.ids]), [
    ['dependencies', ['task-1']],
    ['questions', [question.id]],
    ['acceptance', ['task-2']],
    ['children', [question.id]],
  ])
  const task1 = await g.engine.projection('task-1')
  assert.ok(task1.ok)
  assert.deepEqual(task1.projection.gates, [])
  const decision = await g.run('llm', { op: 'propose', reason: '定格式', node: { type: 'decision', title: '用 JSON', parent: 'feature-1' } })
  const proposed = await g.engine.projection(decision.id)
  assert.ok(proposed.ok)
  assert.deepEqual(proposed.projection.gates.map(gate => gate.kind), ['approval', 'verification'])
})

graphTest('projection keeps the recent history only and refuses unknown nodes', async g => {
  for (let index = 0; index < 7; index++) await g.engine.apply('human', { op: 'comment', id: 'task-1', text: `第 ${index} 条` })
  const result = await g.engine.projection('task-1')
  assert.ok(result.ok)
  assert.equal(result.projection.historyCount, 8)
  assert.deepEqual(result.projection.recentHistory.map(entry => entry.text), ['第 2 条', '第 3 条', '第 4 条', '第 5 条', '第 6 条'])
  const missing = await g.engine.projection('task-9')
  assert.equal(missing.ok, false)
  assert.equal(!missing.ok && missing.error.code, 'not_found')
})

graphTest('open items: proposals, questions, doing, ready leaves and verification debt', async g => {
  await g.act('llm', { op: 'link', id: 'task-2', type: 'depends', to: 'task-1', reason: 'x' })
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  const question = await g.run('llm', { op: 'propose', reason: '问人', node: QUESTION })
  const decision = await g.run('human', { op: 'propose', reason: '定格式', node: { type: 'decision', title: '用 JSON', parent: 'feature-1' } })
  let items = await g.engine.openItems()
  assert.equal(items.revision, (await loadGraph(g.dir)).revision)
  assert.deepEqual(items.proposals.map(entry => entry.id), [proposal.id])
  assert.deepEqual(items.questions.map(entry => entry.id), [question.id])
  assert.deepEqual(items.ready.map(entry => entry.id), ['task-1'])
  assert.deepEqual(items.verificationDebt.map(entry => entry.id), [decision.id])
  assert.deepEqual(items.doing, [])

  await g.act('llm', { op: 'status', id: 'task-1', to: 'doing', reason: '开工' })
  items = await g.engine.openItems()
  assert.deepEqual(items.doing.map(entry => entry.id), ['task-1'])
  assert.deepEqual(items.ready, [])
  await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '完成', evidence: [{ kind: 'commit', ref: '17b8e3f' }] })
  items = await g.engine.openItems()
  assert.deepEqual(items.ready.map(entry => entry.id), ['task-2'])
  assert.equal(items.ready[0].rev, await g.rev('task-2'))
})

graphTest('decision queue: oldest first with options and the raising node; a human decides, the llm sees it', async g => {
  const later = { ...QUESTION, title: '渲染方案', parent: 'task-2' }
  const first = await g.run('llm', { op: 'propose', reason: '先问格式', node: { ...QUESTION, id: 'question-b', body: '推荐 JSON：不新增解析器', edges: [{ type: 'source', to: 'task-1' }] } })
  const second = await g.run('harness', { op: 'propose', reason: '再问渲染', node: { ...later, id: 'question-a' } })
  const queue = (await g.engine.openItems()).questions
  assert.deepEqual(queue.map(entry => entry.id), [first.id, second.id], 'oldest first, not id order')
  assert.deepEqual(queue[0], {
    id: 'question-b', type: 'question', title: '存储格式', status: 'approved', rev: await g.rev('question-b'),
    body: '推荐 JSON：不新增解析器',
    options: QUESTION.options,
    recommend: 'A',
    decider: 'human',
    raisedBy: { id: 'feature-1', type: 'feature', title: '引擎', status: 'approved', rev: await g.rev('feature-1') },
    sources: [{ id: 'task-1', type: 'task', title: '存储', status: 'approved', rev: await g.rev('task-1') }],
    askedAt: first.node.history[0].at,
    askedBy: 'llm',
  })
  assert.equal(queue[1].askedBy, 'harness')
  assert.equal(queue[1].raisedBy?.id, 'task-2')

  refused(await g.act('llm', { op: 'decide', id: 'question-b', option: 'A', reason: '自己定' }), 'forbidden')
  must(await g.act('human', { op: 'decide', id: 'question-b', option: 'B', reason: '正文好读更要紧' }))
  assert.deepEqual((await g.engine.openItems()).questions.map(entry => entry.id), ['question-a'])

  const parent = await g.engine.projection('feature-1')
  assert.ok(parent.ok)
  const card = parent.projection.children.find(entry => entry.id === 'question-b')
  assert.deepEqual([card?.status, card?.decision], ['done', 'B'])
  const decided = await g.engine.projection('question-b')
  assert.ok(decided.ok)
  assert.equal(decided.projection.node.decision, 'B')
  assert.deepEqual(decided.projection.recentHistory.at(-1)!, {
    at: decided.projection.recentHistory.at(-1)!.at, actor: 'human', op: 'decide', reason: '正文好读更要紧', from: 'approved', to: 'done', option: 'B', evidence: [{ kind: 'decision', ref: 'B' }],
  })
  const source = await g.engine.projection('task-1')
  assert.ok(source.ok)
  assert.deepEqual(source.projection.sourceOf.map(entry => [entry.id, entry.decision]), [['question-b', 'B']])
})

// decision tiers and relay (§2.9)

const AGENT_QUESTION = { ...QUESTION, title: '缓存目录名', decider: 'agent' }

graphTest('an agent question: the llm decides it itself, it stays out of the human queue, the human overturns it', async g => {
  const question = await g.run('llm', { op: 'propose', reason: '自己定的细节', node: AGENT_QUESTION })
  assert.equal(question.node.status, 'approved')
  let items = await g.engine.openItems()
  assert.deepEqual(items.questions, [], 'the human queue holds only the human\'s questions')
  assert.deepEqual(items.agentQueue.map(entry => [entry.id, entry.decider]), [[question.id, 'agent']])

  const decided = must(await g.act('llm', { op: 'decide', id: question.id, option: 'A', reason: '按原型' }))
  assert.equal(decided.node.decision, 'A')
  assert.equal(decided.node.history.at(-1)?.actor, 'llm')
  items = await g.engine.openItems()
  assert.deepEqual(items.agentQueue, [])
  assert.deepEqual(items.recentDecisions.map(entry => [entry.id, entry.decision, entry.label, entry.decidedBy, entry.decider, entry.rounds]), [[question.id, 'A', 'JSON', 'llm', 'agent', 1]])
  assert.equal(items.recentDecisions[0].raisedBy?.id, 'feature-1')
  assert.equal('relay' in items.recentDecisions[0], false)

  must(await g.act('llm', { op: 'decide', id: question.id, option: 'B', reason: '改主意' }))
  must(await g.act('human', { op: 'decide', id: question.id, option: 'A', reason: '推翻：不加解析器' }))
  const latest = (await g.engine.openItems()).recentDecisions[0]
  assert.deepEqual([latest.decision, latest.decidedBy, latest.rounds, latest.reason], ['A', 'human', 3, '推翻：不加解析器'])
  refused(await g.act('llm', { op: 'decide', id: question.id, option: 'B', reason: '再改回来' }), 'forbidden')
  await g.act('llm', { op: 'status', id: question.id, to: 'doing', reason: '重开' })
  refused(await g.act('llm', { op: 'decide', id: question.id, option: 'B', reason: '重开后再定' }), 'forbidden')
})

graphTest('the llm refusal to decide a human question comes before the rev check', async g => {
  const question = await g.run('llm', { op: 'propose', reason: '问人', node: QUESTION })
  refused(await g.engine.apply('llm', { op: 'decide', id: question.id, rev: 'stale', option: 'A', reason: '自己定' }), 'forbidden')
})

graphTest('relay: an llm write carrying the human\'s words has the human\'s permissions and records the words', async g => {
  const said = '都同意，你来干'
  const proposal = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })
  const approved = must(await g.act('llm', { op: 'approve', id: proposal.id, reason: '人在对话里同意', relay: said }))
  assert.equal(approved.node.status, 'approved')
  assert.deepEqual(approved.node.history.at(-1), { at: approved.node.history.at(-1)!.at, actor: 'llm', op: 'approve', reason: '人在对话里同意', relay: said, from: 'proposed', to: 'approved' })

  const question = await g.run('llm', { op: 'propose', reason: '问人', node: QUESTION })
  must(await g.act('llm', { op: 'decide', id: question.id, option: 'B', reason: '人选了 B', relay: '选 B' }))
  const record = (await g.engine.openItems()).recentDecisions[0]
  assert.deepEqual([record.decidedBy, record.relay, record.decider], ['llm', '选 B', 'human'])
  refused(await g.act('llm', { op: 'decide', id: question.id, option: 'A', reason: '自己改' }), 'forbidden')

  const branch = await g.run('llm', { op: 'propose', reason: '人要的分支', relay: '加一个渲染分支', node: { type: 'feature', title: '渲染', parent: 'goal-1' } })
  assert.equal(branch.node.status, 'approved', 'a relayed proposal is approved at once')
  must(await g.act('llm', { op: 'edit', id: 'task-1', reason: '人改验收', relay: '验收加上中文不乱码', set: { acceptance: ['往返逐字节一致', '中文不乱码'] } }))
  must(await g.act('llm', { op: 'edit', id: 'goal-1', reason: '人改非目标', relay: '非目标去掉 DSH 那条', set: { nonGoals: null } }))
  must(await g.act('llm', { op: 'status', id: branch.id, to: 'dropped', reason: '人不要了', relay: '渲染分支先不做了' }))
  const rejected = await g.run('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '导出', parent: 'goal-1' } })
  assert.equal(must(await g.act('llm', { op: 'reject', id: rejected.id, reason: '人否了', relay: '导出不要' })).node.status, 'dropped')
  const replacement = await g.run('llm', { op: 'propose', reason: '换掉', relay: '存储重写', node: { type: 'task', title: '新存储', parent: 'feature-1', edges: [{ type: 'supersedes', to: 'task-1' }] } })
  assert.deepEqual(replacement.changed, [replacement.id, 'task-1'])
  assert.equal((await g.node('task-1')).history.at(-1)?.relay, '存储重写', 'cascaded entries carry the relay too')
  assert.deepEqual((await loadGraph(g.dir)).issues, [])
})

graphTest('relay is the llm\'s alone, must be text and is not a field of comment', async g => {
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: 'x', relay: '我说的', set: { title: '甲' } }), 'invalid', 'relay')
  refused(await g.act('harness', { op: 'edit', id: 'task-1', reason: 'x', relay: '人说的', set: { title: '甲' } }), 'invalid', 'relay')
  refused(await g.act('llm', { op: 'edit', id: 'task-1', reason: 'x', relay: '', set: { title: '甲' } }), 'invalid', 'relay')
  refused(await g.act('llm', { op: 'edit', id: 'task-1', reason: 'x', relay: '长'.repeat(2001), set: { title: '甲' } }), 'invalid', 'relay')
  refused(await g.engine.apply('llm', { op: 'comment', id: 'task-1', text: 'x', relay: '人说的' }), 'invalid', 'relay')
})

graphTest('decider: the llm hands a question to the human at will and takes one only with a relay', async g => {
  const agent = await g.run('llm', { op: 'propose', reason: '自己定', node: AGENT_QUESTION })
  must(await g.act('llm', { op: 'edit', id: agent.id, reason: '这条该人定', set: { decider: 'human' } }))
  assert.deepEqual((await g.engine.openItems()).questions.map(entry => entry.id), [agent.id])
  refused(await g.act('llm', { op: 'edit', id: agent.id, reason: '还是我来', set: { decider: 'agent' } }), 'forbidden', 'set.decider')
  must(await g.act('llm', { op: 'edit', id: agent.id, reason: '人让我定', relay: '这个你自己定', set: { decider: 'agent' } }))
  assert.deepEqual((await g.engine.openItems()).agentQueue.map(entry => entry.id), [agent.id])
  must(await g.act('llm', { op: 'edit', id: agent.id, reason: '去掉字段即归人', set: { decider: null } }))
  assert.equal((await g.node(agent.id)).decider, undefined)
  refused(await g.act('human', { op: 'edit', id: 'task-1', reason: 'x', set: { decider: 'agent' } }), 'invalid', 'set.decider')
})

graphTest('an agent question in a subtree opens a decisions gate, not the human questions gate', async g => {
  const question = await g.run('llm', { op: 'propose', reason: '自己定', node: { ...AGENT_QUESTION, parent: 'task-2' } })
  const task2 = await g.engine.projection('task-2')
  assert.ok(task2.ok)
  assert.deepEqual(task2.projection.gates.map(gate => [gate.kind, gate.ids]), [['decisions', [question.id]], ['acceptance', ['task-2']], ['children', [question.id]]])
})
