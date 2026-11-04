/**
 * 用户怎么用 (user graph design 0.4.1 §6, acceptance §1.4 items 41 to 43):
 * the panel's view model (ui/src/graph/user-view.ts) over the library
 * fixture of §2.9 — the overview band, the user view's rows, the
 * development view's 服务 n 步 and orphan marks, the highlight both ways,
 * the two layouts, the home line, the empty and unreadable states, 谁在做它
 * on a step's page — and the graph view drawing no user node.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutGraph } from '../src/graph/layout.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { FILTER_LABELS, visibleGraph, type GraphFilter } from '../ui/src/graph/model.ts'
import { hasUserPage, homeFlowLine, userViewOf, whoBuilds, type DevRow, type FlowRow, type StepRow, type UserView } from '../ui/src/graph/user-view.ts'
import { added, edit, libraryGraph, loaded } from './graph-user-helpers.ts'

type Ready = Extract<UserView, { readonly kind: 'ready' }>

/** The view of the library goal; the test fails unless the user graph reads. */
function ready(graph: LoadedGraph = libraryGraph(), selected?: string, width = 800): Ready {
  assert.deepEqual(graph.issues, [], 'the fixture copy loads without issues')
  const view = userViewOf(graph, 'goal-1', selected, width)
  assert.equal(view.kind, 'ready')
  return view
}

function flowOf(view: Ready, id: string): FlowRow {
  const flow = view.roles.flatMap(role => role.flows).find(entry => entry.id === id)
  assert.ok(flow !== undefined, `no flow ${id}`)
  return flow
}

const stepsOf = (view: Ready): StepRow[] => view.roles.flatMap(role => role.flows.flatMap(flow => flow.rows))
const devOf = (view: Ready, id: string): DevRow | undefined => view.dev.find(row => row.id === id)
const marked = (rows: readonly { readonly id: string, readonly mark: string }[], mark: string): string[] => rows.filter(row => row.mark === mark).map(row => row.id)

test('the overview band and the home line: the flow progress of §6.1; the flow to look at first and the band\'s first three gaps in the order 走不通, 没人负责, 做完了要重走, the rest (§6.2)', () => {
  const view = ready()
  const progress = '6 条流程：1 走通 · 1 走不通 · 2 做完了 · 1 没人负责 · 1 排上了'
  assert.equal(view.progress, progress)
  const graph = libraryGraph()
  assert.equal(homeFlowLine(graph, graph.nodes.get('goal-1')!), progress)
  assert.deepEqual(view.gaps, [
    { text: '「发提醒或登记赔偿」上次走不通：登记赔偿后状态没变', node: 'step-21' },
    { text: '「借书」的第 4 步「交押金」没人负责', node: 'step-11' },
    { text: '「导出年度报表」不服务任何步骤', node: 'feat-export' },
  ])
  assert.equal(view.more, 2, 'the two flow:no-test gaps of 搜书 and 还书')
  assert.equal(view.focus, 'flow-6', '走不通 comes first')
  const repaired = ready(libraryGraph(nodes => edit(nodes, 'step-21', { status: 'dropped' })))
  assert.equal(repaired.focus, 'flow-3', 'then 没人负责')
  // Dropping step-21 leaves step-22 unreachable in a flow that now passes: it ranks with the rest, after the orphan in §2.6's order.
  assert.deepEqual(repaired.gaps.map(gap => gap.node), ['step-11', 'feat-export', 'step-22'])
})

test('the user view: roles and flows with their states in words, each flow\'s steps in display order with branches, loops, the walk line and the walk spec (§6.2)', () => {
  const view = ready()
  assert.deepEqual(view.roles.map(role => [role.title, role.state, role.flows.map(flow => `${flow.title} ${flow.state} · ${flow.steps} 步`)]), [
    ['读者', '没人负责', ['登录 走通 · 4 步', '搜书 做完了，等走一遍 · 3 步', '借书 没人负责 · 4 步', '还书 排上了 · 3 步']],
    ['管理员', '走不通', ['录入新书 做完了，要重走 · 4 步', '处理逾期 走不通 · 4 步']],
  ])
  const lending = flowOf(view, 'flow-3')
  assert.deepEqual(lending.rows.map(row => [row.number, row.title, row.state, row.servers, row.next]), [
    [1, '在书的详情页点「借阅」', '在做', 1, '已交押金 › 到第 2 步；没交押金 › 到第 4 步'],
    [2, '确认借阅', '排上了', 1, undefined],
    [3, '看到应还日期', '排上了', 1, undefined],
    [4, '交押金', '没人负责', 0, '回到第 2 步'],
  ])
  assert.equal(lending.spec, '走法：命令 · 预计 40 秒 · 超时上限 120 秒（预计的 3 倍，还没有跑过）')
  assert.equal(lending.walk, undefined)
  assert.equal(flowOf(view, 'flow-2').rows[1].next, '没搜到 › 回到第 1 步；搜到了 › 到第 3 步')
  assert.deepEqual(flowOf(view, 'flow-1').walk, { at: '2026-10-30T09:00:00Z', text: '命令 · 4/4 通过' })
  assert.deepEqual(flowOf(view, 'flow-6').walk, { at: '2026-10-31T10:00:00Z', text: '命令 · 3/4 通过 · 「发提醒或登记赔偿」走不通：登记赔偿后状态没变' })
  assert.ok(stepsOf(view).every(row => !row.nextDropped && !row.unreachable))
  // A step pointing at a dropped step says so; a flow without an entry lists its steps as unreachable.
  const dropped = ready(libraryGraph((nodes) => {
    edit(nodes, 'step-18', { status: 'dropped' })
    edit(nodes, 'flow-4', { edges: [] })
  }))
  assert.deepEqual(flowOf(dropped, 'flow-5').rows.map(row => [row.id, row.nextDropped]), [['step-15', false], ['step-16', false], ['step-17', true]])
  assert.deepEqual(flowOf(dropped, 'flow-4').rows.map(row => row.unreachable), [true, true, true])
  // 你来走 and a 走法 line that does not parse read in words too.
  const kinds = ready(libraryGraph((nodes) => {
    edit(nodes, 'flow-2', { body: '走法：你来走' })
    edit(nodes, 'flow-4', { body: '前提：已借书' })
  }))
  assert.equal(flowOf(kinds, 'flow-2').spec, '走法：你来走（没法自动测，做完时请你亲自走一遍）')
  assert.equal(flowOf(kinds, 'flow-4').spec, '还没写好怎么走一遍（正文没有「走法：」一行）')
})

test('the development view: the live features and tasks as a tree, 服务 n 步 by their own and their descendants\' serves; nodes that are not live are not listed (§6.2, §2.9)', () => {
  const view = ready()
  assert.deepEqual(view.dev.map(row => [row.id, row.depth, row.serves]), [
    ['feat-account', 0, 5], ['task-1', 1, 0], ['task-2', 1, 0], ['task-3', 1, 0], ['task-13', 1, 0],
    ['feat-catalog', 0, 6], ['task-4', 1, 0], ['task-5', 1, 1], ['task-6', 1, 2],
    ['feat-lending', 0, 6], ['task-7', 1, 1], ['task-8', 1, 3], ['task-9', 1, 2],
    ['feat-overdue', 0, 4], ['task-10', 1, 0], ['task-11', 1, 0], ['task-14', 1, 0],
    ['feat-export', 0, 0], ['task-12', 1, 0],
  ])
  assert.deepEqual(['feat-account', 'feat-lending', 'task-8'].map(id => devOf(view, id)?.status), ['完成', '进行中', '未开始'])
})

test('不服务任何步骤 is the work:orphan gap only: tasks without serves under a serving feature carry no mark, a task whose steps were all dropped does (§1.4 item 42)', () => {
  const view = ready()
  assert.deepEqual(view.dev.filter(row => row.orphan !== undefined).map(row => [row.id, row.orphan]), [['feat-export', '不服务任何步骤']], 'task-12 sits under the orphan feature and is not marked on its own')
  const dropped = ready(libraryGraph(nodes => edit(nodes, 'step-18', { status: 'dropped' })))
  assert.deepEqual(dropped.dev.filter(row => row.orphan !== undefined).map(row => [row.id, row.orphan]), [['task-5', '服务的步骤都不要了'], ['feat-export', '不服务任何步骤']])
  assert.equal(devOf(dropped, 'feat-catalog')?.orphan, undefined, 'its feature still serves 搜书')
  assert.equal(devOf(dropped, 'task-4')?.orphan, undefined, 'a task without serves under a serving feature')
})

test('selecting a step lights up its servers and leaves on the development side and fades the rest; selecting a feature or task lights up the steps it serves (§1.4 item 41)', () => {
  const plain = ready()
  assert.deepEqual([...new Set([...stepsOf(plain), ...plain.dev].map(row => row.mark))], ['plain'], 'nothing selected when the page opens')
  const step = ready(libraryGraph(), 'step-8')
  assert.equal(step.side, 'user')
  assert.deepEqual(marked(step.dev, 'linked'), ['task-7'])
  assert.equal(marked(step.dev, 'faded').length, step.dev.length - 1)
  assert.deepEqual(marked(stepsOf(step), 'selected'), ['step-8'])
  assert.deepEqual(marked(stepsOf(step), 'faded'), [], 'its own side does not fade')
  assert.equal(step.linked, 1)
  assert.deepEqual(step.roles.flatMap(role => role.flows).filter(flow => flow.open).map(flow => flow.id), ['flow-3'], 'the selected step\'s flow shows its steps')
  // A module-level server brings its leaves along.
  assert.deepEqual(marked(ready(libraryGraph(), 'step-1').dev, 'linked'), ['feat-account', 'task-1', 'task-2', 'task-3', 'task-13'])
  const task = ready(libraryGraph(), 'task-8')
  assert.equal(task.side, 'dev')
  assert.deepEqual(marked(stepsOf(task), 'linked'), ['step-9', 'step-10', 'step-12'])
  assert.deepEqual(task.roles.flatMap(role => role.flows).filter(flow => flow.open).map(flow => flow.id), ['flow-3', 'flow-4'])
  assert.deepEqual(marked(task.dev, 'selected'), ['task-8'])
  assert.deepEqual(marked(task.dev, 'faded'), [])
  assert.deepEqual(marked(stepsOf(ready(libraryGraph(), 'feat-catalog')), 'linked'), ['step-5', 'step-6', 'step-7', 'step-16', 'step-17', 'step-18'])
  assert.deepEqual(marked(stepsOf(ready(libraryGraph(), 'task-1')), 'linked'), ['step-1', 'step-2', 'step-3', 'step-4', 'step-15'], 'a task under a module-level server is a leaf of its steps')
  // A flow picked from a gap lights up the work of all its steps; a node in neither view selects nothing.
  assert.deepEqual(marked(ready(libraryGraph(), 'flow-4').dev, 'linked'), ['task-8', 'task-9'])
  const elsewhere = ready(libraryGraph(), 'norm-merge-gate')
  assert.equal(elsewhere.side, undefined)
  assert.deepEqual([...new Set(elsewhere.dev.map(row => row.mark))], ['plain'])
})

test('side by side from 760 px of container width, one column below it (§6.2)', () => {
  assert.deepEqual([760, 759, 0].map(width => ready(libraryGraph(), undefined, width).layout), ['split', 'single', 'single'])
})

test('a goal without a user graph: no home line; the page says why, or that the goal has no end user (§6.4, §1.4 item 43)', () => {
  const goal = (body?: string): GraphNode => added({ id: 'goal-1', type: 'goal', title: '重构存储层', ...(body === undefined ? {} : { body }) })
  const view = (nodes: readonly GraphNode[]): UserView => userViewOf(loaded(nodes), 'goal-1', undefined, 800)
  const internal = loaded([goal('用户流程：无，这是内部重构，用户看不到变化')])
  assert.equal(homeFlowLine(internal, internal.nodes.get('goal-1')!), null, 'the home shows the goal as before')
  assert.equal(hasUserPage(internal, internal.nodes.get('goal-1')!), true, 'its node page leads to the page that says so')
  assert.deepEqual(userViewOf(internal, 'goal-1', undefined, 800), { kind: 'none', text: '这个目标没有终端用户：这是内部重构，用户看不到变化' })
  const bare = loaded([goal()])
  assert.deepEqual([homeFlowLine(bare, bare.nodes.get('goal-1')!), hasUserPage(bare, bare.nodes.get('goal-1')!)], [null, false], 'no line, no entry')
  assert.deepEqual(view([goal()]), { kind: 'none', text: '这个目标还没有用户图' })
  assert.deepEqual(userViewOf(libraryGraph(), 'goal-9', undefined, 800), { kind: 'none', text: '这个目标已经不在图里了' })
  // Roles without flows: the band says the flows are still to be drawn.
  const roleOnly = loaded([goal(), added({ id: 'role-1', type: 'role', title: '读者', parent: 'goal-1' })])
  const drawn = userViewOf(roleOnly, 'goal-1', undefined, 800)
  assert.equal(drawn.kind === 'ready' && drawn.progress, '还没画流程，主 Agent 会在对话里和你一起画')
  assert.equal(homeFlowLine(roleOnly, roleOnly.nodes.get('goal-1')!), '还没画流程，主 Agent 会在对话里和你一起画')
})

test('a user graph that cannot be read says why, on the page and in the home line; the development view stays (§6.3)', () => {
  const graph = libraryGraph()
  const nodes = new Map(graph.nodes)
  const flow = { ...nodes.get('flow-1')! }
  Object.defineProperty(flow, 'body', { get: () => { throw new Error('正文读不出') } })
  nodes.set('flow-1', flow)
  const broken: LoadedGraph = { ...graph, nodes }
  assert.equal(homeFlowLine(broken, graph.nodes.get('goal-1')!), '读不出用户图：正文读不出')
  assert.equal(hasUserPage(broken, graph.nodes.get('goal-1')!), true)
  const view = userViewOf(broken, 'goal-1', undefined, 800)
  assert.equal(view.kind, 'failed')
  assert.equal(view.kind === 'failed' && view.text, '读不出用户图：正文读不出')
  assert.deepEqual(view.kind === 'failed' && view.dev.map(row => row.id), ready().dev.map(row => row.id))
})

test('谁在做它 on a step\'s page: its live servers; none for a step nobody serves or that was dropped (§3.7)', () => {
  const graph = libraryGraph()
  const builders = (id: string, of: LoadedGraph = graph): string[] => whoBuilds(of, of.nodes.get(id)!).map(node => node.id)
  assert.deepEqual([builders('step-9'), builders('step-1'), builders('step-13'), builders('step-11')], [['task-8'], ['feat-account'], ['task-9'], []])
  const dropped = libraryGraph(nodes => edit(nodes, 'step-18', { status: 'dropped' }))
  assert.deepEqual(builders('step-18', dropped), [])
})

test('the words a person reads on the page carry none of the replaced words (§6.5)', () => {
  const view = ready(libraryGraph(nodes => edit(nodes, 'step-18', { status: 'dropped' })))
  const texts = [
    view.progress,
    ...view.gaps.map(gap => gap.text),
    ...view.roles.flatMap(role => [role.title, role.state, ...role.flows.flatMap(flow => [flow.state, flow.spec, flow.walk?.text ?? '', ...flow.rows.flatMap(row => [row.state, row.next ?? ''])])]),
    ...view.dev.flatMap(row => [row.status, row.orphan ?? '']),
  ]
  assert.deepEqual(texts.flatMap(text => plainWordsIn(text)), [])
})

test('the graph view draws no user node and no serves or next edge, under every filter (§3.7, §3.8)', () => {
  const graph = libraryGraph()
  for (const filter of Object.keys(FILTER_LABELS) as GraphFilter[]) {
    const result = layoutGraph(visibleGraph(graph, filter).nodes)
    assert.ok(result.ok, filter)
    assert.deepEqual(result.layout.nodes.filter(box => ['role', 'flow', 'step'].includes(box.node.type)).map(box => box.node.id), [], filter)
    assert.deepEqual(result.layout.edges.filter(edge => edge.type === 'parent' && ['role', 'flow', 'step'].includes(graph.nodes.get(edge.node)?.type ?? '')), [], filter)
  }
})
