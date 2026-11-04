import assert from 'node:assert/strict'
import test from 'node:test'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { subtreeOf, childrenIndex } from '../src/graph/projection.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { renderUserGraph, stepsServedBy, userCompletionItems, userGraphOf, userReleaseItems, type UserGraph, type UserPage, type WalkRecord } from '../src/graph/user-graph.ts'
import { statusText, visibleGraph } from '../ui/src/graph/model.ts'
import { added, edit, libraryGraph, loaded, status, WALKED_AT, when } from './graph-user-helpers.ts'

function read(graph: LoadedGraph = libraryGraph()): UserGraph {
  assert.deepEqual(graph.issues, [], 'the fixture copy loads without issues')
  return userGraphOf(graph, graph.nodes.get('goal-1')!)
}

/** A node of the graph a user graph was read from; the test fails when it is missing. */
function nodeOf(ug: UserGraph, id: string): GraphNode {
  const node = ug.graph.nodes.get(id)
  assert.ok(node !== undefined, `no node ${id}`)
  return node
}

const done = (title: string): string => `${title}〔${title}成功〕`

const CONFIRM = [
  '用户怎么用',
  '读者',
  ` 登录：1 ${done('打开登录页')}→ 2 ${done('输入账号密码')}→（密码对）3；（密码错）4。3 ${done('进入首页')}。4 ${done('看到错误提示')}→ 2`,
  ` 搜书：1 ${done('在搜索框输入')}→ 2 ${done('看到结果列表')}→（没搜到）1；（搜到了）3。3 ${done('打开一本看详情')}`,
  ` 借书：1 ${done('在书的详情页点「借阅」')}→（已交押金）2；（没交押金）4。2 ${done('确认借阅')}→ 3 ${done('看到应还日期')}。4 ${done('交押金')}→ 2`,
  ` 还书：1 ${done('打开我的借阅')}→ 2 ${done('选一本点「归还」')}→ 3 ${done('看到归还成功')}`,
  '管理员',
  ` 录入新书：1 ${done('用管理员账号登录')}→ 2 ${done('填写书目信息')}→ 3 ${done('保存')}→ 4 ${done('在搜索里搜到')}`,
  ` 处理逾期：1 ${done('打开逾期列表')}→ 2 ${done('选一条')}→ 3 ${done('发提醒或登记赔偿')}→ 4 ${done('状态变为已处理')}`,
].join('\n')

const STATE_HEADING = '截至给你看的时刻（这一段只是给你看现状，不是你要同意的内容，之后会变）'

test('confirm: the sample lists roles, flows and steps in display order with conditions and what each step looks like done; no state (§3.6, §5.1)', () => {
  const page: UserPage = renderUserGraph(read(), 'confirm')
  assert.equal(page.stable, CONFIRM)
  assert.equal(page.state, '')
  assert.deepEqual(renderUserGraph(read(), 'confirm'), page, 'the same graph renders the same bytes')
})

test('serves on the big-loop page: each flow\'s owners by the servers\' nearest feature, unchanged by progress or by more work of the same module (§5.2, §1.4 item 29)', () => {
  const page = renderUserGraph(read(), 'serves')
  assert.equal(page.stable, [
    '每条流程由谁负责',
    ' 读者 › 登录：账号',
    ' 读者 › 搜书：书目',
    ' 读者 › 借书：借阅',
    ' 读者 › 还书：借阅',
    ' 管理员 › 录入新书：账号、书目',
    ' 管理员 › 处理逾期：逾期与通知',
  ].join('\n'))
  assert.equal(page.state, '')
  // Another module's task moves on, and 借阅 takes a new task linked to 交押金: who owns which flow is the same.
  const moved = read(libraryGraph((nodes) => {
    edit(nodes, 'task-12', { status: 'doing' }, status('10-31 17:00', 'approved', 'doing'))
    nodes.set('task-20', added({ id: 'task-20', type: 'task', title: '押金接口', parent: 'feat-lending', edges: [{ type: 'serves', to: 'step-11' }] }))
  }))
  assert.equal(renderUserGraph(moved, 'serves').stable, page.stable)
  assert.equal(renderUserGraph(moved, 'walks').stable, renderUserGraph(read(), 'walks').stable)
  // A step's title, or the module that owns a flow, changes what the person agreed to.
  const renamed = read(libraryGraph(nodes => edit(nodes, 'step-9', { title: '确认借出' })))
  assert.notEqual(renderUserGraph(renamed, 'confirm').stable, CONFIRM)
  const rehomed = read(libraryGraph(nodes => edit(nodes, 'feat-overdue', { edges: [] })))
  assert.match(renderUserGraph(rehomed, 'serves').stable, / 管理员 › 处理逾期：还没人负责$/u)
})

test('serves on a module page: the steps the module or its work serves, renumbered per flow; as of the showing their state, the other modules, its orphans (§5.3, §1.4 item 30)', () => {
  const ug = read()
  const lending = nodeOf(ug, 'feat-lending')
  const page = renderUserGraph(ug, 'serves', lending)
  assert.equal(page.stable, [
    '这个模块服务哪几步',
    ` 借书：1 ${done('在书的详情页点「借阅」')}→（已交押金）2。2 ${done('确认借阅')}→ 3 ${done('看到应还日期')}`,
    ` 还书：1 ${done('打开我的借阅')}→ 2 ${done('选一本点「归还」')}→ 3 ${done('看到归还成功')}`,
  ].join('\n'))
  assert.equal(page.state, `${STATE_HEADING}\n 这 6 步现在：「在书的详情页点「借阅」」在做、「确认借阅」排上了、「看到应还日期」排上了、「打开我的借阅」排上了、「选一本点「归还」」排上了、「看到归还成功」排上了；这些步骤没有别的模块在做；模块里不服务任何步骤的任务：0 个`)
  // Its own tasks and other modules moving on change the state only; another step served changes the stable part.
  const progressed = read(libraryGraph(nodes => edit(nodes, 'task-8', { status: 'doing' }, status('10-31 17:00', 'approved', 'doing'))))
  assert.equal(renderUserGraph(progressed, 'serves', lending).stable, page.stable)
  assert.notEqual(renderUserGraph(progressed, 'serves', lending).state, page.state)
  const deposit = read(libraryGraph(nodes => nodes.set('task-20', added({ id: 'task-20', type: 'task', title: '押金接口', parent: 'feat-lending', edges: [{ type: 'serves', to: 'step-11' }] }))))
  assert.notEqual(renderUserGraph(deposit, 'serves', lending).stable, page.stable)
  // A step another module serves too is named in the state; a module that says it serves no step shows its reason.
  const shared = read(libraryGraph(nodes => edit(nodes, 'feat-account', { edges: [1, 2, 3, 4, 15, 16].map(step => ({ type: 'serves' as const, to: `step-${step}` })) })))
  assert.match(renderUserGraph(ug, 'serves', nodeOf(ug, 'feat-catalog')).state, /；这些步骤没有别的模块在做；/u)
  assert.match(renderUserGraph(shared, 'serves', nodeOf(shared, 'feat-catalog')).state, /；这些步骤还有别的模块也在做：账号；/u)
  const skeleton = read(libraryGraph(nodes => nodes.set('feat-skeleton', added({ id: 'feat-skeleton', type: 'feature', title: '搭建项目骨架', parent: 'goal-1', stage: 'release', body: '服务：无，搭建项目骨架与持续集成' }))))
  assert.equal(renderUserGraph(skeleton, 'serves', nodeOf(skeleton, 'feat-skeleton')).stable, '这个模块服务哪几步\n 不服务任何步骤（正文写明的原因：搭建项目骨架与持续集成）')
  assert.match(renderUserGraph(skeleton, 'serves').stable, /\n不服务任何步骤的模块：搭建项目骨架（正文写明的原因：搭建项目骨架与持续集成）$/u)
})

test('walks: each flow\'s kind, the merge gate\'s command for it and the estimate, the timeout rule; as of the showing the caps (§5.2, §2.7)', () => {
  const page = renderUserGraph(read(), 'walks')
  const command = (role: string, flow: string, id: string, seconds: number): string => ` ${role} › ${flow}：命令 · npm run e2e -- --flow ${id} · 预计 ${seconds} 秒`
  assert.equal(page.stable, [
    '每条流程怎么走一遍（命令来自合入前检查清单，放行之后执行的就是这些）',
    command('读者', '登录', 'flow-1', 30),
    command('读者', '搜书', 'flow-2', 30),
    command('读者', '借书', 'flow-3', 40),
    command('读者', '还书', 'flow-4', 30),
    command('管理员', '录入新书', 'flow-5', 40),
    command('管理员', '处理逾期', 'flow-6', 40),
    '超时是预计秒数的 3 倍，跑过几次之后按最近三次里最慢的一次的 3 倍，不低于 10 秒、不高于 30 分钟。写着「你来走」的流程不跑命令，这里写「没法自动测，做完时请你亲自走一遍」。',
  ].join('\n'))
  assert.equal(page.state, `${STATE_HEADING}\n 超时上限：登录 90 秒、搜书 90 秒、借书 120 秒、还书 90 秒、录入新书 120 秒、处理逾期 120 秒，都是预计的 3 倍，还没有跑过`)
  // 你来走 runs no command; a line that does not parse says why; the cap stays within 10 seconds and 30 minutes.
  const mixed = read(libraryGraph((nodes) => {
    edit(nodes, 'flow-2', { body: '走法：你来走' })
    edit(nodes, 'flow-3', { body: '走法：截图 · 预计 60 秒' })
    edit(nodes, 'flow-4', { body: '走法：命令 · 预计 1 秒' })
    edit(nodes, 'flow-5', { body: '走法：命令 · 预计 1800 秒' })
  }))
  const lines = renderUserGraph(mixed, 'walks')
  assert.match(lines.stable, / 读者 › 搜书：没法自动测，做完时请你亲自走一遍\n/u)
  assert.match(lines.stable, / 读者 › 借书：还没写好怎么走一遍（合入前检查清单里没有「截图」这一种走法的 walk 行）\n/u)
  assert.match(lines.state, /登录 90 秒、还书 10 秒、录入新书 1800 秒、处理逾期 120 秒，/u)
})

test('a goal without a user graph: confirm shows the one line of no end user when the body gives a reason; every other page is empty (§3.6, §1.4 item 28)', () => {
  const lone = (body?: string): UserGraph => read(loaded([{
    id: 'goal-1', type: 'goal', title: '重构存储层', status: 'approved', ...(body === undefined ? {} : { body }),
    history: [{ at: when('10-26 08:00'), actor: 'human', op: 'propose', reason: '立项', to: 'approved' }],
  }]))
  const internal = lone('需求：换掉存储层\n用户流程：无，这是内部重构，用户看不到变化')
  assert.equal(internal.present, false)
  assert.deepEqual(renderUserGraph(internal, 'confirm'), { stable: '这个目标没有终端用户：这是内部重构，用户看不到变化', state: '' })
  assert.deepEqual(renderUserGraph(internal, 'serves'), { stable: '', state: '' })
  assert.deepEqual(renderUserGraph(internal, 'walks'), { stable: '', state: '' })
  assert.deepEqual(renderUserGraph(lone('用户流程：无'), 'confirm'), { stable: '', state: '' }, 'no reason, no line')
  assert.deepEqual(renderUserGraph(lone(), 'confirm'), { stable: '', state: '' })
  assert.deepEqual([userReleaseItems(internal.graph, internal.goal), userCompletionItems(internal.graph, internal.goal, () => true)], [[], []])
})

test('userReleaseItems: five items on a goal not split into modules, flows:modules on a split one, flows:page by the size of the three sections (§5.2, §1.4 item 29)', () => {
  const graph = libraryGraph()
  const items = userReleaseItems(graph, graph.nodes.get('goal-1')!)
  assert.deepEqual(items.map(item => [item.key, item.ok]), [['flows:shape', true], ['flows:expect', true], ['flows:served', false], ['flows:walk', true], ['flows:page', true]])
  assert.equal(items[2].hint, 'connect step-11 to the module or task that builds it, with graph_link type serves')
  assert.equal(items[4].label, '放行页里的用户图部分放得下一页（合计不超过 8,000 字）')
  // Split into modules: a candidate that serves nothing fails flows:modules until it serves a step or says why not.
  const split = (body?: string) => libraryGraph(nodes => nodes.set('feat-ops', added({ id: 'feat-ops', type: 'feature', title: '运维', parent: 'goal-1', status: 'proposed', ...(body === undefined ? {} : { body }) })))
  const modules = (graphOf: LoadedGraph): readonly (readonly [string, boolean])[] => userReleaseItems(graphOf, graphOf.nodes.get('goal-1')!).filter(item => item.key === 'flows:modules').map(item => [item.hint, item.ok] as const)
  assert.deepEqual(modules(split()), [['connect the module or its tasks to a step with serves, or add a line "服务：无，<reason>" to its body (feat-ops)', false]])
  assert.deepEqual(modules(split('服务：无，部署与监控')).map(([, ok]) => ok), [true])
  // The shape item quotes the first shape gap's hint; the walk item names the flow.
  const broken = libraryGraph((nodes) => {
    edit(nodes, 'flow-2', { edges: [] })
    edit(nodes, 'flow-4', { body: '前提：已借书' })
  })
  const failing = userReleaseItems(broken, broken.nodes.get('goal-1')!).filter(item => !item.ok)
  assert.deepEqual(failing.map(item => item.key), ['flows:shape', 'flows:served', 'flows:walk'])
  assert.equal(failing[0].hint, 'fix the shape gaps first: the flow\'s own next edge is its entry: graph_relink flow-2 to its first step')
  assert.match(failing[2].hint, /\(flow-4\)$/u)
  // flows:page: a few dozen flows fit, a few hundred do not.
  const many = (count: number): LoadedGraph => {
    const at = when('10-26 08:00')
    const node = (fields: Omit<GraphNode, 'history' | 'status'>): GraphNode => ({ status: 'approved', ...fields, history: [{ at, actor: 'human', op: 'propose', reason: '夹具', to: 'approved' }] })
    return loaded([
      node({ id: 'goal-1', type: 'goal', title: '大系统' }),
      node({ id: 'norm-merge-gate', type: 'norm', title: '合入前检查', parent: 'goal-1', acceptance: ['`walk 命令 $ npm run e2e -- --flow {flow}`'] }),
      node({ id: 'role-1', type: 'role', title: '读者', parent: 'goal-1' }),
      ...Array.from({ length: count }, (_, index) => node({ id: `flow-${index + 1}`, type: 'flow', title: `流程 ${index + 1}`, parent: 'role-1', body: '走法：命令 · 预计 30 秒' })),
    ])
  }
  const page = (graphOf: LoadedGraph): boolean | undefined => userReleaseItems(graphOf, graphOf.nodes.get('goal-1')!).find(item => item.key === 'flows:page')?.ok
  assert.deepEqual([page(many(20)), page(many(200))], [true, false])
})

test('userCompletionItems: every live approved step walked, and each last passing walk covered by the reviewed commit (§5.5)', () => {
  const graph = libraryGraph()
  const goal = graph.nodes.get('goal-1')!
  const seen: string[] = []
  const items = userCompletionItems(graph, goal, (commit) => {
    seen.push(commit)
    return true
  })
  assert.deepEqual(items.map(item => [item.key, item.ok]), [['flows:walked', false], ['flows:fresh', true]])
  assert.equal(items[0].hint, 'walk the flows again with dispatch_task on the goal; steps that are not walked: step-5, step-6, step-7, step-8, step-9, step-10, step-11, step-12, step-13, step-14, step-15, step-16, step-17, step-18, step-21')
  assert.deepEqual([...new Set(seen)], [WALKED_AT])
  assert.equal(userCompletionItems(graph, goal, () => false)[1].ok, false)
  // A walk whose note names no commit is not covered.
  const bare = libraryGraph((nodes) => {
    const step = nodes.get('step-1')!
    nodes.set('step-1', { ...step, history: step.history.map(entry => entry.op === 'walk' ? { ...entry, evidence: [{ kind: 'walk', ref: 'command:npm run e2e -- --flow flow-1', exit: 0, note: '手改的，没有提交' }] } : entry) })
  })
  const lastWalk: WalkRecord | undefined = userGraphOf(bare, bare.nodes.get('goal-1')!).roles[0].flows[0].steps[0].lastWalk
  assert.equal(lastWalk?.commit, undefined)
  assert.equal(userCompletionItems(bare, bare.nodes.get('goal-1')!, () => true)[1].ok, false)
})

test('stepsServedBy: the live steps a work serves by its own links; a feature with its work serves the steps of §2.9\'s table', () => {
  const graph = libraryGraph()
  const index = childrenIndex(graph)
  const served = (id: string): number => new Set(subtreeOf(index, graph.nodes.get(id)!).flatMap(node => stepsServedBy(graph, node).map(step => step.id))).size
  assert.deepEqual(['feat-account', 'feat-catalog', 'feat-lending', 'feat-overdue', 'feat-export'].map(served), [5, 6, 6, 4, 0])
  assert.deepEqual(stepsServedBy(graph, graph.nodes.get('task-8')!).map(step => step.title), ['看到应还日期', '打开我的借阅', '确认借阅'])
  const dropped = libraryGraph(nodes => edit(nodes, 'step-18', { status: 'dropped' }))
  assert.deepEqual(stepsServedBy(dropped, dropped.nodes.get('task-5')!), [])
})

test('the words a person reads carry none of the replaced words (§6.5)', () => {
  const ug = read(libraryGraph(nodes => edit(nodes, 'step-18', { status: 'dropped' })))
  const texts = [
    ...ug.gaps.map(gap => gap.text),
    ...[renderUserGraph(ug, 'confirm'), renderUserGraph(ug, 'serves'), renderUserGraph(ug, 'walks'), renderUserGraph(ug, 'serves', nodeOf(ug, 'feat-lending'))].flatMap(page => [page.stable, page.state]),
  ]
  assert.deepEqual(texts.flatMap(text => plainWordsIn(text)), [])
})

test('the panel: a user node\'s status is its derived state; the graph view keeps no user node open or counted (§3.7, §6.5)', () => {
  const graph = libraryGraph((nodes) => {
    nodes.set('step-30', added({ id: 'step-30', type: 'step', title: '看到搜索历史', parent: 'flow-2', status: 'proposed', acceptance: ['看到搜过的词'] }))
    edit(nodes, 'flow-6', { status: 'dropped' })
  })
  const text = (id: string): string => statusText(graph.nodes.get(id)!, graph)
  assert.deepEqual(['step-1', 'step-15', 'step-11', 'flow-3', 'role-1', 'step-30', 'step-21', 'flow-6', 'task-7'].map(text), [
    '走通', '做完了，要重走', '没人负责', '没人负责', '没人负责', '待你定', '废弃', '废弃', '进行中',
  ])
  assert.equal(statusText(graph.nodes.get('step-30')!), '等你批准', 'without the graph, a proposal reads like any other')
  const open = visibleGraph(graph, 'open')
  assert.deepEqual([...open.nodes.values()].filter(node => node.type === 'role' || node.type === 'flow' || node.type === 'step'), [])
  assert.equal(open.hiddenClosed.get('goal-1'), 3, 'the three done features, not the roles')
  assert.deepEqual([...visibleGraph(graph, 'mine').nodes.keys()], [])
  assert.equal(visibleGraph(graph, 'all').nodes.size, graph.nodes.size)
})
