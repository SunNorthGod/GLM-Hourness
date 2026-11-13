/**
 * The panel's plain-language view model (src/graph/plain-view.ts, plain-ui
 * 1.3 §5.4): progress, the plan and its dependency order, the status
 * phrases, the needs list, the changes rows, the module readings and the
 * live line — over graphs built in memory (tests/graph-memory.ts), where a
 * test says exactly the state it reads. The template words check (the
 * design's acceptance 2) runs over everything the templates write with
 * clean fixture titles: no route numbers, node ids, type words or engine
 * status words.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { AwaitingEntry } from '../src/graph/live.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { blockersOf } from '../src/graph/projection.ts'
import {
  agoText, askLines, changesSince, frameworkChanging, liveLine, moduleRowText, moduleStateOf, modulesView,
  needsOf, planOf, progressLine, questionView, quote, remainingOf, shortTitle, statusPhrase, toolWords, whyOf,
  type ModulesGoalView, type NeedEntry, type Plan,
} from '../src/graph/plain-view.ts'
import { DIRECTIONS_ID } from '../src/graph/modules.ts'
import { plainIssues } from '../src/graph/plain.ts'
import type { GraphNode, HistoryEntry } from '../src/graph/schema.ts'
import { at } from './execute-helpers.ts'
import { graphOf, node } from './graph-memory.ts'

const NOW = Date.parse(at(10_000))

/**
 * The words a template writes on its own pass the writing check
 * (src/graph/plain.ts, plain-ui 1.3 §5.3) as generated text; the titles it
 * quotes are someone else's words and are taken out first (§5.4 quote).
 */
const clean = (text: string, graph: LoadedGraph): void => {
  const own = text.replace(/「[^」]*」/gu, '「」')
  assert.deepEqual(plainIssues(own, 'generated', new Set(graph.nodes.keys())), [], text)
}

/** A depends edge on a node. */
const depends = (to: string) => ({ type: 'depends' as const, to })

/** A decide entry with the answer mark of record_human_answer (src/shared/answer-marks.ts). */
const agree = (n: number, conclusion: string, callId?: string): HistoryEntry => ({
  at: at(n), actor: 'llm', op: 'decide', reason: `人在对话里同意${callId === undefined ? '' : `（record_human_answer ${callId}）`}`, conclusion,
})
const edit = (n: number, changes: HistoryEntry['changes'], extra: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({ at: at(n), actor: 'llm', op: 'edit', reason: '测试', changes, ...extra }) as HistoryEntry

/** A small project: a goal in design, one decision, a doing task, an approved task, one blocked by the other, and one unsplit feature. */
function project(): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'approved', stage: 'design' }, 0, 'human'),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1', verification: 'unverified' }, 1),
    node({ id: 'task-doing', type: 'task', parent: 'goal-1', status: 'doing' }, 2),
    node({ id: 'task-ready', type: 'task', parent: 'goal-1' }, 3),
    node({ id: 'task-wait', type: 'task', parent: 'goal-1', edges: [depends('task-ready')] }, 4),
    node({ id: 'feature-unsplit', type: 'feature', parent: 'goal-1' }, 5),
    node({ id: 'task-done', type: 'task', parent: 'goal-1', status: 'done' }, 6),
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

test('whyOf: the node\'s why; a goal without one reads the 问题 section of its body; otherwise nothing', () => {
  assert.equal(whyOf(node({ id: 'task-1', type: 'task', parent: 'goal-1', why: '月底能看出钱花在哪' })), '月底能看出钱花在哪')
  const goal = node({ id: 'goal-1', type: 'goal', body: '需求：记账\n问题：月底不知道钱花在哪\n给谁：本人' })
  assert.equal(whyOf(goal), '月底不知道钱花在哪', 'the section ends at the next label of the card')
  assert.equal(whyOf({ ...goal, why: '自己写的一句' }), '自己写的一句')
  assert.equal(whyOf(node({ id: 'goal-2', type: 'goal', body: '没有标签的正文' })), undefined)
  assert.equal(whyOf(node({ id: 'task-2', type: 'task', parent: 'goal-1', body: '问题：任务正文里的问题不算' })), undefined)
})

test('quote and shortTitle', () => {
  assert.equal(quote('记账'), '「记账」')
  assert.equal(shortTitle('规则：你定下的规矩，agent 每一步都照做'), '规则：你定下的规矩，agent 每一步都照做', 'a head shorter than four code points keeps the whole title')
  assert.equal(shortTitle('规则板块：你定下的规矩都在这里'), '规则板块')
  assert.equal(shortTitle('没有冒号的标题'), '没有冒号的标题')
})

test('remainingOf: leaves only, done and left, unsplit; design-review tasks do not count', () => {
  const { graph } = project()
  const progress = remainingOf(graph, 'goal-1')
  assert.deepEqual(progress, { done: 1, left: 4, unsplit: 1 }, 'doing 1 + approved 3; the feature without dependencies is unsplit')
  const nested = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing', stage: 'execute' }, 0, 'human'),
    node({ id: 'module-b', type: 'feature', parent: 'goal-1', stage: 'release', status: 'doing' }, 1),
    node({ id: 'task-1', type: 'task', parent: 'module-b', status: 'done' }, 2),
    node({ id: 'task-2', type: 'task', parent: 'module-b' }, 3),
    node({ id: 'task-drop', type: 'task', parent: 'module-b', status: 'dropped' }, 4),
    node({ id: 'decision-x', type: 'decision', parent: 'module-b' }, 5),
    node({ id: 'review-1', type: 'task', parent: 'module-b', kind: 'review', writeScope: [], edges: [{ type: 'source', to: 'decision-x' }] }, 5, 'harness'),
  ])
  assert.deepEqual(remainingOf(nested, 'module-b'), { done: 1, left: 1, unsplit: 0 }, 'the module is no leaf; the dropped task and the design-review task count for neither')
})

test('progressLine: counts, the unsplit suffix and the stalled blocks', () => {
  const { graph } = project()
  assert.equal(progressLine(graph, 'goal-1'), '做完 1 件，还剩 4 件；其中 1 块还没细分成小步')
  const finished = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing' }, 0, 'human'),
    node({ id: 'task-1', type: 'task', parent: 'goal-1', status: 'done' }, 1),
    node({ id: 'block-1', type: 'feature', parent: 'goal-1', title: '收尾这一块', status: 'doing' }, 2),
    node({ id: 'task-in-block', type: 'task', parent: 'block-1', status: 'done' }, 3),
  ])
  assert.equal(progressLine(finished, 'goal-1'), '做完 2 件，没有剩下的；还开着的：「收尾这一块」', 'a doing block whose work is done is no leaf')
})

test('blockersOf: a dependency of an ancestor blocks too, in near-to-far order', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing', edges: [depends('gate-1')] }, 0, 'human'),
    node({ id: 'gate-1', type: 'task', status: 'doing' }, 1),
    node({ id: 'feature-1', type: 'feature', parent: 'goal-1' }, 2),
    node({ id: 'task-1', type: 'task', parent: 'feature-1' }, 3),
    node({ id: 'done-1', type: 'task', parent: 'goal-1', status: 'done' }, 4),
    node({ id: 'goal-2', type: 'goal', status: 'doing', edges: [depends('done-1')] }, 5, 'human'),
    node({ id: 'free-1', type: 'task', parent: 'goal-2' }, 6),
  ])
  assert.deepEqual(blockersOf(graph, 'task-1').map(entry => entry.id), ['gate-1'], 'the goal\'s dependency reaches the leaf')
  assert.deepEqual(blockersOf(graph, 'free-1'), [], 'a done dependency does not block')
})

test('planOf: the four groups, numbering, the focus first, and the waiting order', () => {
  const { graph } = project()
  const plan: Plan = planOf(graph, NOW, 'task-doing')
  assert.deepEqual(plan.doing.map(item => item.node.id), ['task-doing'])
  assert.equal(plan.doing[0]?.status, '在做 · 主 Agent 在这里')
  assert.deepEqual(plan.ready.map(item => item.node.id), ['task-ready'])
  assert.deepEqual(plan.unsplit.map(item => item.node.id), ['feature-unsplit'])
  assert.deepEqual(plan.waiting.map(item => item.node.id), ['task-wait'])
  assert.equal(plan.waiting[0]?.status, '等第 2 件', 'the ready task is number 2 on the page')
  assert.deepEqual([plan.doing[0]?.number, plan.ready[0]?.number, plan.waiting[0]?.number, plan.unsplit[0]?.number], [1, 2, 3, 4], 'the page numbers run through the groups in display order')
  assert.equal(plan.total, 4)
  assert.deepEqual(plan.goals, ['goal-1'])
  clean(plan.doing[0]?.status ?? '', graph)
  clean(plan.waiting[0]?.status ?? '', graph)
})

test('planOf: a waiting item held by an off-page blocker names it; three quiet days read as such', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing' }, 0, 'human'),
    node({ id: 'gate', type: 'task', status: 'doing' }, 1),
    node({ id: 'gate-sub', type: 'task', parent: 'gate' }, 2),
    node({ id: 'gate-2', type: 'task', status: 'doing' }, 3),
    node({ id: 'gate-2b', type: 'task', parent: 'gate-2' }, 4),
    node({ id: 'task-1', type: 'task', parent: 'goal-1', edges: [depends('gate'), depends('gate-2')] }, 5),
    node({ id: 'quiet', type: 'task', parent: 'goal-1', status: 'doing' }, 6, 'llm', [{
      at: at(9_000), actor: 'llm', op: 'status', reason: '测试', from: 'approved', to: 'doing',
    }]),
  ])
  const plan = planOf(graph, NOW)
  const waiting = plan.waiting[0]
  assert.equal(waiting?.node.id, 'task-1')
  assert.equal(waiting?.status, '等「gate」等 1 件', 'both blockers are parents with their own work: none is on the page, the nearest names the wait')
  const doingQuiet = plan.doing.find(item => item.node.id === 'quiet')
  assert.equal(doingQuiet?.status, '在做 · 17 分钟前有进展', 'the plan clock is the test clock')
  const old = planOf(graph, NOW + 4 * 24 * 60 * 60 * 1000)
  assert.equal(old.doing.find(item => item.node.id === 'quiet')?.status, '在做 · 3 天没有动静')
})

test('planOf: two waiting items held by each other keep their key order; a dropped blocker says the main agent handles it', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing' }, 0, 'human'),
    node({ id: 'a', type: 'task', parent: 'goal-1', edges: [depends('b')] }, 1),
    node({ id: 'b', type: 'task', parent: 'goal-1', edges: [depends('a')] }, 2),
    node({ id: 'c', type: 'task', parent: 'goal-1', edges: [depends('gone')] }, 3),
    node({ id: 'gone', type: 'task', status: 'dropped' }, 4),
  ])
  const plan = planOf(graph, NOW)
  assert.deepEqual(plan.waiting.map(item => item.node.id), ['c', 'a', 'b'], 'the free item numbers first, the cycle is appended by key and creation time')
  assert.equal(plan.waiting.find(item => item.node.id === 'c')?.status, '等「gone」（它不做了，主 Agent 会处理）')
})

test('statusPhrase: proposals, modules, questions, work and decisions', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'approved', stage: 'design' }, 0, 'human'),
    node({ id: 'proposal-1', type: 'decision', status: 'proposed', parent: 'goal-1' }, 1),
    node({ id: 'module-1', type: 'feature', parent: 'goal-1', stage: 'design', title: '借阅' }, 2),
    node({ id: 'task-1', type: 'task', parent: 'module-1' }, 3),
    node({ id: 'question-1', type: 'question', parent: 'goal-1', status: 'doing', options: [{ key: 'A', label: '甲', consequence: '' }] }, 4),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1', verification: 'sandbox' }, 5),
    node({ id: 'norm-1', type: 'norm', parent: 'goal-1' }, 6),
    node({ id: 'task-superseded', type: 'task', parent: 'goal-1', status: 'superseded' }, 7),
  ])
  assert.equal(statusPhrase(graph.nodes.get('proposal-1')!, graph), '随方案一起定')
  assert.equal(statusPhrase(graph.nodes.get('module-1')!, graph), '设计中')
  assert.equal(statusPhrase(graph.nodes.get('task-1')!, graph), '可以开工')
  assert.equal(statusPhrase(graph.nodes.get('question-1')!, graph), '等你回话')
  assert.equal(statusPhrase(graph.nodes.get('decision-1')!, graph), '在沙盒里验过')
  assert.equal(statusPhrase(graph.nodes.get('norm-1')!, graph), '生效中')
  assert.equal(statusPhrase(graph.nodes.get('task-superseded')!, graph), '被取代了')
})

test('statusPhrase: a candidate under a released split goal with directions waits for the next framework round', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing', stage: 'execute' }, 0, 'human'),
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release' }, 1),
    node({ id: 'fresh', type: 'feature', parent: 'goal-1', status: 'proposed', title: '新的一块' }, 2),
    node({ id: DIRECTIONS_ID, type: 'norm', acceptance: ['方向'] }, 3),
    node({ id: 'goal-2', type: 'goal', status: 'doing', stage: 'execute' }, 4, 'human'),
    node({ id: 'plain', type: 'feature', parent: 'goal-2', status: 'proposed', title: '普通提议' }, 5),
  ])
  assert.equal(statusPhrase(graph.nodes.get('fresh')!, graph), '等下一次定框架时一起定')
  assert.equal(statusPhrase(graph.nodes.get('plain')!, graph), '等下一次定框架时一起定', 'the proposal itself makes the goal split, so it waits for the framework too')
  const bare = graphOf([...graph.nodes.values()].filter(entry => entry.id !== DIRECTIONS_ID))
  assert.equal(statusPhrase(bare.nodes.get('plain')!, bare), '等你批准', 'no directions on the graph: the ordinary proposal')
})

test('needsOf: questions, proposals and awaiting, oldest first; the stages filter the awaiting', () => {
  const graph = graphOf([
    node({ id: 'goal-open', type: 'goal', status: 'doing', stage: 'interview' }, 0, 'human'),
    node({ id: 'question-1', type: 'question', parent: 'goal-open', status: 'doing' }, 1),
    node({ id: 'goal-exec', type: 'goal', status: 'doing', stage: 'execute' }, 2, 'human'),
    node({ id: 'proposal-1', type: 'decision', status: 'proposed', parent: 'goal-exec' }, 3),
    node({ id: 'hidden-1', type: 'task', status: 'proposed', parent: 'proposal-1', title: '藏在下面的' }, 4),
    node({ id: 'goal-design', type: 'goal', status: 'approved', stage: 'design' }, 5, 'human'),
    node({ id: 'in-design', type: 'decision', status: 'proposed', parent: 'goal-design', title: '还在设计里的' }, 6),
  ])
  const matters: readonly AwaitingEntry[] = [
    { kind: 'confirm', goal: 'goal-open', module: '', at: 1 },
    { kind: 'release', goal: 'goal-open', module: '', at: 2 },
    { kind: 'release', goal: 'goal-design', module: 'module-x', at: 3 },
  ]
  const needs: readonly NeedEntry[] = needsOf(graph, matters)
  assert.deepEqual(needs.map(entry => entry.kind), ['awaiting', 'question', 'proposal'], 'oldest first')
  assert.equal(needs[0]?.matter?.goal, 'goal-open')
  assert.equal(needs[1]?.node?.id, 'question-1')
  assert.equal(needs[2]?.node?.id, 'proposal-1')
  assert.equal(needs[2]?.includes, 1, 'the proposal under it is counted along')
  assert.equal(needs.some(entry => entry.node?.id === 'hidden-1'), false, 'a proposal under a proposal is not listed twice')
  assert.equal(needs.some(entry => entry.node?.id === 'in-design'), false, 'a proposal inside a design-phase goal waits with the release')
  const inDesign = needsOf(graph, [{ kind: 'release', goal: 'goal-design', module: '', at: Date.parse(at(6)) }])
  assert.deepEqual(inDesign.map(entry => entry.kind), ['question', 'proposal', 'awaiting'], 'a release waits in design — the goal is there')
  const lateConfirm = needsOf(graph, [{ kind: 'confirm', goal: 'goal-design', module: '', at: Date.parse(at(6)) }])
  assert.deepEqual(lateConfirm.map(entry => entry.kind), ['question', 'proposal'], 'a confirm past the interview does not list')
})

test('changesSince: the answer rows, the merged approvals, the block-done rows and the merges', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing', stage: 'design' }, 0, 'human', [
      edit(2, { stage: { from: 'interview', to: 'design' } }, { reason: '人在对话里同意（record_human_answer c1）' }),
    ]),
    node({ id: 'question-1', type: 'question', parent: 'goal-1', status: 'done', conclusion: '用本地文件' }, 1, 'llm', [
      agree(3, '用本地文件', 'c2'),
    ]),
    node({ id: 'task-1', type: 'task', parent: 'goal-1' }, 4, 'llm', [
      { at: at(5), actor: 'llm', op: 'approve', reason: '人在对话里同意（record_human_answer c1）' },
    ]),
    node({ id: 'block-1', type: 'feature', parent: 'goal-1', title: '借阅这一块', status: 'done' }, 6, 'llm', [
      { at: at(7), actor: 'llm', op: 'status', reason: '测试', from: 'doing', to: 'done' },
    ]),
    node({ id: 'task-2', type: 'task', parent: 'goal-1', status: 'done' }, 8, 'llm', [
      { at: at(9), actor: 'llm', op: 'status', reason: '测试', from: 'doing', to: 'done' },
    ]),
    node({ id: 'task-3', type: 'task', parent: 'goal-1', status: 'doing' }, 10, 'llm', [
      { at: at(11), actor: 'llm', op: 'status', reason: '测试', from: 'approved', to: 'doing' },
    ]),
    node({ id: 'task-4', type: 'task', parent: 'goal-1', status: 'doing' }, 12, 'llm', [
      { at: at(12), actor: 'llm', op: 'status', reason: '测试', from: 'approved', to: 'doing' },
    ]),
    node({ id: 'question-2', type: 'question', parent: 'goal-1', status: 'doing' }, 13, 'llm', [
      { at: at(14), actor: 'llm', op: 'comment', text: '人在对话里补充：还差一个导出' },
    ]),
    node({ id: 'task-5', type: 'task', parent: 'goal-1' }, 15, 'llm', [
      { at: at(16), actor: 'llm', op: 'comment', text: '一条普通批注' },
    ]),
    node({ id: 'task-6', type: 'task', parent: 'goal-1', status: 'doing' }, 17, 'human', [
      { at: at(18), actor: 'human', op: 'status', reason: '面板', from: 'approved', to: 'doing' },
    ]),
  ])
  const rows = changesSince(graph, at(0), new Set())
  const texts = rows.map(row => row.text)
  assert.ok(texts.includes('你在对话里确认了「goal-1」要做成什么'))
  assert.equal(rows.find(row => row.text.startsWith('你在对话里确认了'))?.note, '连同 1 件', 'the approve of the same call joins the confirm row')
  assert.ok(texts.includes('你在对话里同意了「question-1」：用本地文件'), 'the question\'s own answer is its row')
  assert.ok(texts.includes('「借阅这一块」这一块做完了'))
  assert.ok(texts.includes('开始做「task-3」等 2 件'), 'the two doing statuses of one window merge')
  assert.ok(texts.includes('做完了「task-2」'))
  assert.ok(texts.includes('你在对话里补充了「question-2」，主 Agent 会改了再问你'))
  assert.ok(texts.includes('「task-5」有 1 条新进展'))
  assert.equal(texts.some(text => text.includes('task-6')), false, 'the human\'s own operation is not listed')
  assert.equal(texts.some(text => text.includes('goal-1') && text.includes('开始做')), false)
  const quiet = changesSince(graph, at(0), new Set(["question-1"]))
  assert.equal(quiet.some(row => row.text.includes('question-1')), false, 'a node in 需要你 keeps its changes invisible')
})

test('changesSince: module release and back-to-design rows, and a goal done row', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing', stage: 'execute' }, 0, 'human'),
    node({ id: 'module-1', type: 'feature', parent: 'goal-1', stage: 'release', title: '借阅' }, 1, 'llm', [
      edit(2, { stage: { from: 'design', to: 'release' } }, { reason: '人在对话里同意（record_human_answer c2）' }),
    ]),
    node({ id: 'module-2', type: 'feature', parent: 'goal-1', stage: 'design', title: '汇总' }, 3, 'llm', [
      edit(4, { stage: { from: 'release', to: 'design' } }, { reason: '按 probe: the direction of the module has to change' }),
    ]),
    node({ id: 'goal-2', type: 'goal', status: 'done' }, 5, 'human', [
      { at: at(6), actor: 'llm', op: 'status', reason: '测试', from: 'doing', to: 'done' },
    ]),
  ])
  const texts = changesSince(graph, at(0), new Set()).map(row => row.text)
  assert.ok(texts.includes('你在对话里放行了「借阅」这一块的设计'))
  assert.ok(texts.includes('「汇总」回到设计，主 Agent 改好设计会再交给你放行'))
  assert.ok(texts.includes('「goal-2」做完了，整体审查的结论在它的节点页'))
})

test('changesSince: the user graph rows - a flow walked through, a flow failed with its step, a new step nobody serves', () => {
  const walk = (n: number, exit: number, result: string): HistoryEntry => ({
    at: at(n), actor: 'harness', op: 'walk', reason: '作业走一遍',
    evidence: [{ kind: 'walk', ref: 'command:npm run e2e', exit, note: `@abc1234 sha256:- ${result}` }],
  })
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'doing', stage: 'execute' }, 0, 'human'),
    node({ id: 'role-1', type: 'role', parent: 'goal-1', title: '读者' }, 1, 'human'),
    node({ id: 'flow-ok', type: 'flow', parent: 'role-1', title: '登录', body: '走法：命令 · 预计 30 秒', edges: [{ type: 'next', to: 's-1' }] }, 2, 'human'),
    node({ id: 's-1', type: 'step', parent: 'flow-ok', title: '打开登录页', acceptance: ['看到了'], edges: [{ type: 'next', to: 's-2' }] }, 3, 'human', [walk(20, 0, '通过')]),
    node({ id: 's-2', type: 'step', parent: 'flow-ok', title: '进入首页', acceptance: ['进去了'] }, 4, 'human', [walk(21, 0, '通过')]),
    node({ id: 'feat-ok', type: 'feature', parent: 'goal-1', title: '账号', status: 'done', edges: [{ type: 'serves', to: 's-1' }, { type: 'serves', to: 's-2' }, { type: 'serves', to: 'step-served' }] }, 5, 'human', [
      { at: at(8), actor: 'human', op: 'status', reason: '夹具', from: 'doing', to: 'done' },
    ]),
    node({ id: 'task-ok', type: 'task', parent: 'feat-ok', title: '登录接口', status: 'done' }, 6, 'human', [
      { at: at(7), actor: 'human', op: 'status', reason: '夹具', from: 'doing', to: 'done' },
    ]),
    node({ id: 'flow-bad', type: 'flow', parent: 'role-1', title: '还书', body: '走法：命令 · 预计 30 秒', edges: [{ type: 'next', to: 's-3' }] }, 3, 'human'),
    node({ id: 's-3', type: 'step', parent: 'flow-bad', title: '看到归还成功', acceptance: ['看到了'] }, 4, 'human', [walk(22, 1, '登记赔偿后状态没变')]),
    node({ id: 'feat-bad', type: 'feature', parent: 'goal-1', title: '归还', status: 'done', edges: [{ type: 'serves', to: 's-3' }] }, 5, 'human', [
      { at: at(8), actor: 'human', op: 'status', reason: '夹具', from: 'doing', to: 'done' },
    ]),
    node({ id: 'task-bad', type: 'task', parent: 'feat-bad', title: '归还接口', status: 'done' }, 6, 'human', [
      { at: at(7), actor: 'human', op: 'status', reason: '夹具', from: 'doing', to: 'done' },
    ]),
    node({ id: 'flow-new', type: 'flow', parent: 'role-1', title: '预约', body: '走法：你来走' }, 3, 'human'),
    node({ id: 'step-new', type: 'step', parent: 'flow-new', title: '交押金', acceptance: ['交上了'] }, 30),
    node({ id: 'step-served', type: 'step', parent: 'flow-new', title: '看到应还日期', acceptance: ['看到了'] }, 31),
  ])
  const texts = changesSince(graph, at(10), new Set()).map(row => row.text)
  assert.ok(texts.includes('「登录」走通了'), 'both steps walked in the window and the flow reads walked now')
  assert.ok(texts.includes('「还书」走不通：「看到归还成功」'), 'the failing walk names the flow and the step')
  assert.ok(texts.includes('新加一步「交押金」，还没人负责'), 'a user step without a server reads its own row')
  assert.ok(texts.includes('新加了一件「看到应还日期」'), 'a served step folds with the rest of the progress')
  assert.equal(texts.filter(text => text === '「登录」走通了').length, 1, 'one row per flow')
})

test('moduleStateOf and modulesView: the states, the awaiting release, and nothing without the directions', () => {
  const base = (): { readonly graph: LoadedGraph, readonly goal: GraphNode } => {
    const graph = graphOf([
      node({ id: 'goal-1', type: 'goal', status: 'doing', stage: 'execute' }, 0, 'human'),
      node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design', title: '借阅' }, 1),
      node({ id: 'module-b', type: 'feature', parent: 'goal-1', stage: 'release', status: 'doing', title: '汇总' }, 2),
      node({ id: 'module-c', type: 'feature', parent: 'goal-1', stage: 'release', status: 'done', title: '检索' }, 3),
      node({ id: 'fresh-1', type: 'feature', parent: 'goal-1', status: 'proposed', title: '新的一块' }, 4),
      node({ id: 'decision-fw', type: 'decision', parent: 'goal-1' }, 5),
      node({ id: DIRECTIONS_ID, type: 'norm', acceptance: ['方向一', '方向二'] }, 6),
    ])
    return { graph, goal: graph.nodes.get('goal-1')! }
  }
  const { graph, goal } = base()
  const awaiting: readonly AwaitingEntry[] = [{ kind: 'release', goal: 'goal-1', module: 'module-a', at: 1 }]
  const view = modulesView(graph, awaiting)
  assert.ok(view !== null)
  assert.deepEqual(view.directions, ['方向一', '方向二'])
  assert.equal(view.goals.length, 1)
  const section: ModulesGoalView = view.goals[0]
  assert.deepEqual(section.modules.map(line => line.state), ['awaiting-release', 'released', 'done'])
  assert.deepEqual(section.fresh.map(node => node.id), ['fresh-1'])
  assert.equal(section.changing, false)
  assert.equal(moduleRowText(graph, goal, awaiting), '3 个模块：1 个等你放行 · 1 个放行了 · 1 个做完了')
  const backToDesign = graphOf([...graph.nodes.values()].map(entry =>
    entry.id === 'goal-1' ? { ...entry, stage: 'design' as const } : entry))
  assert.equal(frameworkChanging(backToDesign, backToDesign.nodes.get('goal-1')!), true)
  assert.equal(moduleRowText(backToDesign, backToDesign.nodes.get('goal-1')!, awaiting), '框架在改 · 3 个模块：1 个放行了 · 1 个设计中 · 1 个做完了', 'with the framework changing, the module in design reads 设计中 again')
  assert.equal(moduleStateOf(backToDesign, backToDesign.nodes.get('module-b')!, awaiting), 'released', 'a released module keeps its state while the framework changes')
  assert.equal(moduleRowText(graph, goal, [{ kind: 'release', goal: 'goal-1', module: 'module-x', at: 2 }]),
    '3 个模块：1 个放行了 · 1 个设计中 · 1 个做完了', 'no awaiting for module-a: it reads 设计中')
  const noDirections = graphOf([...graph.nodes.values()].filter(entry => entry.id !== DIRECTIONS_ID))
  assert.equal(modulesView(noDirections, []), null, 'without the directions nothing of the two-level loop shows')
  assert.equal(moduleRowText(noDirections, goal, []), null)
})

test('liveLine: the running and idle sentences, the children line, and another conversation', () => {
  const { graph } = project()
  const running = liveLine([{ main: true, running: true, view: { focus: 'task-doing', tool: { name: 'Bash', since: NOW - 80_000 }, turnSince: NOW - 120_000 } }], graph, NOW, true)
  assert.equal(running.line, '主 Agent 在「task-doing」上 · 在跑命令 · 1 分 20 秒')
  const idle = liveLine([{ main: true, running: false, view: { focus: 'task-ready', tool: null, turnSince: null } }], graph, NOW, true)
  assert.equal(idle.line, '主 Agent 空闲，等你说话 · 上次在「task-ready」')
  const withChildren = liveLine([
    { main: true, running: false, view: { focus: null, tool: null, turnSince: null } },
    { main: false, running: true, view: { focus: 'task-ready', tool: { name: 'Read', since: NOW }, turnSince: NOW } },
  ], graph, NOW, true)
  assert.equal(withChildren.sub, '另有 1 个子 agent 在跑')
  const other = liveLine([{ main: true, running: false, view: { focus: null, tool: null, turnSince: null } }], graph, NOW, false)
  assert.equal(other.line, '这个对话里没有 agent 在跑；在做的 1 件可能在主 Agent 的对话或 DSH 之外推进')
  assert.equal(toolWords('graph_edit'), '在写项目图')
  assert.equal(toolWords('propose_to_human'), '在把一件事交给你')
  assert.equal(toolWords('Whatever'), '在用工具')
})

test('questionView: the ask fields as they are, no option keys, and the decision', () => {
  const graph = graphOf([
    node({ id: 'q-1', type: 'question', parent: 'goal-1', ask: '这几条需求就这样定，可以吗？', form: 'recommend', proposal: '照推荐来', reason: '最省', cost: '慢一点', ways: ['甲', '乙'], notTaken: '乙', status: 'doing' }, 1),
    node({ id: 'q-2', type: 'question', parent: 'goal-1', status: 'done', conclusion: '就这样', options: [{ key: 'A', label: '甲', consequence: '' }], decision: 'A' }, 2, 'llm', [
      { at: at(3), actor: 'llm', op: 'decide', reason: '定', relay: '可以', option: 'A' },
    ]),
    node({ id: 'goal-1', type: 'goal', status: 'doing' }, 0, 'human'),
  ])
  const open = questionView(graph.nodes.get('q-1')!)
  assert.equal(open.legacy, false)
  assert.equal(open.ask, '这几条需求就这样定，可以吗？')
  assert.deepEqual(open.ways, ['甲', '乙'])
  assert.equal(open.decided, null)
  const closed = questionView(graph.nodes.get('q-2')!)
  assert.equal(closed.legacy, true)
  assert.equal(closed.decided?.label, '甲')
  assert.equal(closed.decided?.words, '可以')
})

test('askLines: by way of asking, in the order of done condition 6, as far as set; none for a legacy card', () => {
  const ask = (fields: Partial<GraphNode>): GraphNode => node({ id: 'q-1', type: 'question', parent: 'goal-1', ask: '可以吗？', ...fields })
  const graph = graphOf([node({ id: 'goal-1', type: 'goal' })])
  const recommend = askLines(ask({ form: 'recommend', proposal: '先不收押金', reason: '要对账', cost: '丢了难追', notTaken: '先收押金' }))
  assert.deepEqual(recommend, [{ label: '推荐', text: '先不收押金' }, { label: '理由', text: '要对账' }, { label: '代价', text: '丢了难追' }, { label: '不选的那种', text: '先收押金' }])
  assert.deepEqual(askLines(ask({ form: 'choose', proposal: '发邮件', reason: '不常登录', ways: ['标红', '发邮件'] })),
    [{ label: '推荐', text: '发邮件' }, { label: '理由', text: '不常登录' }, { text: '1. 标红' }, { text: '2. 发邮件' }])
  assert.deepEqual(askLines(ask({ form: 'want', proposal: '一次导入一批' })), [{ label: '猜测', text: '一次导入一批' }])
  assert.deepEqual(askLines(ask({ form: 'look', proposal: '借书页草图' })), [{ label: '给你看的', text: '借书页草图' }])
  assert.deepEqual(askLines(ask({ ask: undefined, options: [{ key: 'A', label: '甲', consequence: '' }] })), [])
  for (const line of recommend) clean(line.label ?? '', graph)
  for (const label of ['猜测', '给你看的']) clean(label, graph)
})

test('agoText', () => {
  assert.equal(agoText(at(10_000 - 30), NOW), '刚刚')
  assert.equal(agoText(at(10_000 - 120), NOW), '2 分钟前')
  assert.equal(agoText(at(10_000 - 3 * 3600), NOW), '3 小时前')
  assert.equal(agoText(at(10_000 - 2 * 24 * 3600), NOW), '2 天前')
})
