import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { serializeNode } from '../src/graph/format.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { needsOf } from '../src/graph/plain-view.ts'
import { projectNode, type NodeRef } from '../src/graph/projection.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { graphTools } from '../src/graph/tools.ts'
import { userGraphOf, type FlowState, type FlowView, type Gap, type GapKey, type RoleView, type StepState, type StepView, type UserGraph } from '../src/graph/user-graph.ts'
import { added, edit, libraryGraph, libraryNodes, status, when } from './graph-user-helpers.ts'

/** The user graph of the fixture's goal. */
function read(graph: LoadedGraph = libraryGraph()): UserGraph {
  assert.deepEqual(graph.issues, [], 'the fixture copy loads without issues')
  return userGraphOf(graph, graph.nodes.get('goal-1')!)
}

function flowsOf(ug: UserGraph): FlowView[] {
  return ug.roles.flatMap(role => role.flows)
}

function flowOf(ug: UserGraph, id: string): FlowView {
  const flow = flowsOf(ug).find(view => view.flow.id === id)
  assert.ok(flow !== undefined, `no live flow ${id}`)
  return flow
}

function stepOf(ug: UserGraph, id: string): StepView {
  const step = flowsOf(ug).flatMap(flow => flow.steps).find(view => view.step.id === id)
  assert.ok(step !== undefined, `no live step ${id}`)
  return step
}

/** Every flow with its state and its steps in display order: id, state, outdated. */
function rows(ug: UserGraph): readonly (readonly [string, FlowState, readonly (readonly [string, StepState, boolean])[]])[] {
  return flowsOf(ug).map(flow => [flow.flow.id, flow.state, flow.steps.map(view => [view.step.id, view.state, view.outdated] as const)] as const)
}

function gaps(ug: UserGraph, key?: GapKey): readonly (readonly [GapKey, readonly string[]])[] {
  return ug.gaps.filter(gap => key === undefined || gap.key === key).map(gap => [gap.key, gap.nodes] as const)
}

function gapOf(ug: UserGraph, key: GapKey, node: string): Gap {
  const gap = ug.gaps.find(entry => entry.key === key && entry.nodes.includes(node))
  assert.ok(gap !== undefined, `no ${key} gap on ${node}`)
  return gap
}

const ids = (nodes: readonly { readonly id: string }[]): string[] => nodes.map(node => node.id).sort()

test('the library fixture of §2.9 loads without issues', () => {
  assert.deepEqual(libraryGraph().issues, [])
  assert.equal(libraryNodes().length, 54)
})

test('§2.9: the steps, flows and roles of the library come out as the expected table, in display order (§1.4 item 16)', () => {
  const ug = read()
  assert.equal(ug.present, true)
  assert.deepEqual(rows(ug), [
    ['flow-1', 'walked', [['step-1', 'walked', false], ['step-2', 'walked', false], ['step-3', 'walked', false], ['step-4', 'walked', false]]],
    ['flow-2', 'built', [['step-5', 'built', false], ['step-6', 'built', false], ['step-7', 'built', false]]],
    ['flow-3', 'unserved', [['step-8', 'building', false], ['step-9', 'planned', false], ['step-10', 'planned', false], ['step-11', 'unserved', false]]],
    ['flow-4', 'planned', [['step-12', 'planned', false], ['step-13', 'planned', false], ['step-14', 'planned', false]]],
    ['flow-5', 'built', [['step-15', 'built', true], ['step-16', 'built', true], ['step-17', 'built', true], ['step-18', 'built', true]]],
    ['flow-6', 'failed', [['step-19', 'walked', false], ['step-20', 'walked', false], ['step-21', 'failed', false], ['step-22', 'walked', false]]],
  ])
  const counted = (id: string): [string, number][] => Object.entries(flowOf(ug, id).counts).filter(([, count]) => count > 0)
  assert.deepEqual(counted('flow-1'), [['walked', 4]])
  assert.deepEqual(counted('flow-2'), [['built', 3]])
  assert.deepEqual(counted('flow-3'), [['unserved', 1], ['planned', 2], ['building', 1]])
  assert.deepEqual(counted('flow-4'), [['planned', 3]])
  assert.deepEqual(counted('flow-5'), [['built', 4]])
  assert.deepEqual(counted('flow-6'), [['walked', 3], ['failed', 1]])
  assert.deepEqual(ug.roles.map((role: RoleView) => [role.role.id, role.state, role.flows.map(flow => flow.flow.id)]), [
    ['role-1', 'unserved', ['flow-1', 'flow-2', 'flow-3', 'flow-4']],
    ['role-2', 'failed', ['flow-5', 'flow-6']],
  ])
  // The goal's flow counts (§2.9 汇总): 6 flows, 1 walked, 1 failed, 2 built (1 of them to walk again), 1 unserved, 1 planned.
  const tally = new Map<FlowState, number>()
  for (const flow of flowsOf(ug)) tally.set(flow.state, (tally.get(flow.state) ?? 0) + 1)
  assert.deepEqual([...tally].sort(), [['built', 2], ['failed', 1], ['planned', 1], ['unserved', 1], ['walked', 1]])
  assert.deepEqual(flowsOf(ug).filter(flow => flow.steps.some(view => view.outdated)).map(flow => flow.flow.id), ['flow-5'])
  // Entries and the reach of each flow: the loop back to the entry (没搜到 › step-5) leaves the entry where it is.
  assert.deepEqual(flowsOf(ug).map(flow => [flow.flow.id, flow.entry?.id, flow.unreachable.length]), [
    ['flow-1', 'step-1', 0], ['flow-2', 'step-5', 0], ['flow-3', 'step-8', 0], ['flow-4', 'step-12', 0], ['flow-5', 'step-15', 0], ['flow-6', 'step-19', 0],
  ])
  assert.deepEqual(flowOf(ug, 'flow-3').steps.map(view => view.step.title), ['在书的详情页点「借阅」', '确认借阅', '看到应还日期', '交押金'])
})

test('§2.9: the gaps are exactly 交押金 unserved, 导出年度报表 serving nothing, 发提醒或登记赔偿 failed, and no test task for 搜书 and 还书 (§1.4 item 16)', () => {
  const ug = read()
  assert.deepEqual(gaps(ug), [
    ['step:unserved', ['step-11']],
    ['work:orphan', ['feat-export']],
    ['step:failed', ['step-21']],
    ['flow:no-test', ['flow-2']],
    ['flow:no-test', ['flow-4']],
  ])
  assert.equal(gapOf(ug, 'step:unserved', 'step-11').text, '「借书」的第 4 步「交押金」没人负责')
  assert.equal(gapOf(ug, 'step:failed', 'step-21').text, '「发提醒或登记赔偿」上次走不通：登记赔偿后状态没变')
  const orphan = gapOf(ug, 'work:orphan', 'feat-export')
  assert.deepEqual([orphan.text, orphan.reason], ['「导出年度报表」不服务任何步骤', 'never-served'])
  assert.match(orphan.hint, /^connect it to the step it builds with graph_link type serves/)
  assert.equal(gapOf(ug, 'flow:no-test', 'flow-2').text, '「搜书」每一步都拆成了任务，还没有人写走一遍要跑的测试')
  // Finding 3: the hint names both ways, the module that owns the steps and a serves link to the steps it covers.
  assert.match(gapOf(ug, 'flow:no-test', 'flow-4').hint, /put it in the module that owns these steps, or link it with serves to the steps it covers/)
})

test('§2.9: the nodes that are not live change no row of the output; were they live, 确认借阅, 看到应还日期 and 选一本点「归还」 would be in progress (§1.4 items 16, 19)', () => {
  const summary = (ug: UserGraph): string => JSON.stringify([rows(ug), ug.gaps])
  const without = libraryGraph((nodes) => {
    for (const id of ['feat-legacy', 'task-15', 'task-16']) nodes.delete(id)
    edit(nodes, 'task-9', { edges: [{ type: 'serves', to: 'step-13' }, { type: 'serves', to: 'step-14' }] })
  })
  assert.equal(summary(read()), summary(read(without)))
  const revived = read(libraryGraph((nodes) => {
    edit(nodes, 'feat-legacy', { status: 'approved' })
    edit(nodes, 'task-16', { status: 'done' })
    edit(nodes, 'task-9', { edges: [{ type: 'serves', to: 'step-13' }, { type: 'serves', to: 'step-14' }] })
  }))
  assert.deepEqual(['step-9', 'step-10', 'step-13'].map(id => stepOf(revived, id).state), ['building', 'building', 'building'])
})

test('live servers and leaves: done and doing work serves, dropped and superseded work does not (§1.4 items 19, 20)', () => {
  const ug = read()
  // 账号 is a done feature serving step-1 by module-level links: its leaves are its done tasks, the test task included.
  assert.deepEqual(ids(stepOf(ug, 'step-1').servers), ['feat-account'])
  assert.deepEqual(ids(stepOf(ug, 'step-1').leaves), ['task-1', 'task-13', 'task-2', 'task-3'])
  // 借阅 is doing, with task-level links: each step reads only the tasks linked to it.
  assert.deepEqual([ids(stepOf(ug, 'step-8').servers), ids(stepOf(ug, 'step-8').leaves)], [['task-7'], ['task-7']])
  assert.deepEqual([ids(stepOf(ug, 'step-9').servers), ids(stepOf(ug, 'step-9').leaves)], [['task-8'], ['task-8']], 'the dropped feat-legacy and its doing task-15 are not servers')
  assert.deepEqual(ids(stepOf(ug, 'step-13').servers), ['task-9'], 'the superseded task-16 is not a server')
  // A feature server whose own tasks serve the step contributes only those tasks.
  const narrowed = read(libraryGraph(nodes => edit(nodes, 'feat-catalog', { edges: [5, 6, 7, 16].map(step => ({ type: 'serves' as const, to: `step-${step}` })) })))
  assert.deepEqual([ids(stepOf(narrowed, 'step-16').servers), ids(stepOf(narrowed, 'step-16').leaves)], [['feat-catalog', 'task-6'], ['task-6']])
  // A feature without live work below is its own leaf; a review task is never a leaf, and adding one does not stale a walk.
  const lone = read(libraryGraph((nodes) => {
    nodes.set('feat-deposit', added({ id: 'feat-deposit', type: 'feature', title: '押金', parent: 'goal-1', edges: [{ type: 'serves', to: 'step-11' }] }))
    nodes.set('review-1', added({ id: 'review-1', type: 'task', title: '审查账号', parent: 'feat-account', kind: 'review' }))
  }))
  assert.deepEqual([ids(stepOf(lone, 'step-11').leaves), stepOf(lone, 'step-11').state], [['feat-deposit'], 'planned'])
  assert.deepEqual([ids(stepOf(lone, 'step-1').leaves), stepOf(lone, 'step-1').state], [['task-1', 'task-13', 'task-2', 'task-3'], 'walked'])
})

test('the seven step states, each in one case, and the order they are read in (§1.4 item 17)', () => {
  const ug = read(libraryGraph(nodes => nodes.set('step-30', added({ id: 'step-30', type: 'step', title: '看到搜索历史', parent: 'flow-2', status: 'proposed', acceptance: ['看到搜过的词'] }))))
  assert.deepEqual(['step-30', 'step-11', 'step-9', 'step-8', 'step-5', 'step-1', 'step-21'].map(id => stepOf(ug, id).state), ['proposed', 'unserved', 'planned', 'building', 'built', 'walked', 'failed'])
  // Proposed comes before unserved; a proposed step is counted, the flow's state reads its approved steps only.
  assert.deepEqual([flowOf(ug, 'flow-2').counts.proposed, flowOf(ug, 'flow-2').state], [1, 'built'])
  // Everything done, a walk passed, then a task reopened: in progress, not walked.
  const reopened = read(libraryGraph(nodes => edit(nodes, 'task-2', { status: 'doing' }, status('10-31 17:00', 'done', 'doing'))))
  assert.deepEqual(flowOf(reopened, 'flow-1').steps.map(view => view.state), ['building', 'building', 'building', 'building'])
  // A failed walk followed by moved work is built and outdated, and the failed gap mirrors the state.
  const redone = read(libraryGraph(nodes => edit(nodes, 'task-11', {}, status('10-31 17:00', 'done', 'doing'), status('10-31 17:30', 'doing', 'done'))))
  assert.deepEqual([stepOf(redone, 'step-21').state, stepOf(redone, 'step-21').outdated], ['built', true])
  assert.deepEqual(gaps(redone, 'step:failed'), [])
  assert.equal(flowOf(redone, 'flow-6').state, 'built')
})

test('a walked flow goes back to built and outdated on any history of its connected work but comments and another flow\'s serves (§1.4 item 18)', () => {
  const after = (change: (nodes: Map<string, GraphNode>) => void): readonly (readonly [StepState, boolean])[] => {
    const ug = read(libraryGraph(change))
    return flowOf(ug, 'flow-1').steps.map(view => [view.state, view.outdated] as const)
  }
  const outdated = [['built', true], ['built', true], ['built', true], ['built', true]]
  const walkedRows = [['walked', false], ['walked', false], ['walked', false], ['walked', false]]
  const at = when('10-31 17:00')
  // A status change with its evidence, on a leaf.
  assert.deepEqual(after(nodes => edit(nodes, 'task-3', {}, status('10-31 17:00', 'done', 'doing'), status('10-31 17:10', 'doing', 'done'))), outdated)
  // A field change, on the server.
  assert.deepEqual(after(nodes => edit(nodes, 'feat-account', { title: '账号与登录' }, { at, actor: 'llm', op: 'edit', reason: '改名', changes: { title: { from: '账号', to: '账号与登录' } } })), outdated)
  // An edge added and an edge removed: a depends link on a leaf, the flow's own steps relinked.
  assert.deepEqual(after(nodes => edit(nodes, 'task-1', { edges: [{ type: 'depends', to: 'task-2' }] }, { at, actor: 'llm', op: 'link', reason: '先有页面', edge: { type: 'depends', to: 'task-2' } })), outdated)
  assert.deepEqual(after(nodes => edit(nodes, 'step-4', { edges: [] }, { at, actor: 'human', op: 'unlink', reason: '不回去了', edge: { type: 'next', to: 'step-2' } })), outdated)
  // A serves link to a step of this flow counts; one to another flow's step does not, nor does a comment.
  assert.deepEqual(after(nodes => edit(nodes, 'task-1', { edges: [{ type: 'serves', to: 'step-2' }] }, { at, actor: 'llm', op: 'link', reason: '登记', edge: { type: 'serves', to: 'step-2' } })), outdated)
  assert.deepEqual(after(nodes => edit(nodes, 'feat-account', { edges: [1, 2, 3, 4, 5, 15].map(step => ({ type: 'serves' as const, to: `step-${step}` })) }, { at, actor: 'llm', op: 'link', reason: '也管搜书', edge: { type: 'serves', to: 'step-5' } })), walkedRows)
  assert.deepEqual(after(nodes => edit(nodes, 'task-2', {}, { at, actor: 'human', op: 'comment', text: '页面可以再好看点' })), walkedRows)
  // Equal times count as moved.
  assert.deepEqual(after(nodes => edit(nodes, 'flow-1', { body: '前提：已有账号\n走法：命令 · 预计 30 秒' }, { at: when('10-30 09:00'), actor: 'llm', op: 'edit', reason: '补前提', changes: { body: { from: '走法：命令 · 预计 30 秒', to: '前提：已有账号\n走法：命令 · 预计 30 秒' } } })), outdated)
})

test('dropping a flow, a role or a step takes its steps out of states and gaps; a next edge to a dropped step is ignored for the shape (§1.4 item 19)', () => {
  const noSearch = read(libraryGraph(nodes => edit(nodes, 'flow-2', { status: 'dropped' })))
  assert.deepEqual(flowsOf(noSearch).map(flow => flow.flow.id), ['flow-1', 'flow-3', 'flow-4', 'flow-5', 'flow-6'])
  assert.deepEqual(gaps(noSearch, 'flow:no-test'), [['flow:no-test', ['flow-4']]])
  const noAdmin = read(libraryGraph(nodes => edit(nodes, 'role-2', { status: 'dropped' })))
  assert.deepEqual([noAdmin.roles.map(role => role.role.id), gaps(noAdmin, 'step:failed')], [['role-1'], []])
  // The middle step of 还书 dropped, its neighbour not relinked: the next step is unreachable, the step before points at a dropped step.
  const middle = read(libraryGraph(nodes => edit(nodes, 'step-13', { status: 'dropped' })))
  assert.deepEqual(flowOf(middle, 'flow-4').steps.map(view => view.step.id), ['step-12', 'step-14'])
  assert.deepEqual([gaps(middle, 'flow:unreachable'), gaps(middle, 'step:next-dropped')], [[['flow:unreachable', ['step-14']]], [['step:next-dropped', ['step-12']]]])
  // A dropped step under a live flow is no longer unserved.
  const noDeposit = read(libraryGraph(nodes => edit(nodes, 'step-11', { status: 'dropped' })))
  assert.deepEqual([gaps(noDeposit, 'step:unserved'), gaps(noDeposit, 'step:next-dropped')], [[], [['step:next-dropped', ['step-8']]]])
  assert.equal(flowOf(noDeposit, 'flow-3').state, 'planned')
})

test('the last step dropped: the step before is marked step:next-dropped with the way forward, and writes that keep the edge leave the gap (§1.4 items 11.2, 19)', () => {
  const drop18 = (nodes: Map<string, GraphNode>): void => edit(nodes, 'step-18', { status: 'dropped' }, status('10-31 17:00', 'approved', 'dropped', 'human'))
  const ug = read(libraryGraph(drop18))
  assert.deepEqual([gaps(ug, 'step:next-dropped'), gaps(ug, 'flow:unreachable')], [[['step:next-dropped', ['step-17']]], []])
  const gap = gapOf(ug, 'step:next-dropped', 'step-17')
  assert.equal(gap.text, '「保存」后面接的那一步已经不要了')
  assert.equal(gap.hint, 'step step-17 still points at step-18, which was dropped or replaced: graph_relink it to the step that replaced it, or to nothing when it is now the last step')
  const kept = read(libraryGraph((nodes) => {
    drop18(nodes)
    const at = when('10-31 17:30')
    edit(nodes, 'step-17', { body: '保存按钮在页面底部', edges: [{ type: 'next', to: 'step-16', when: '保存失败' }, { type: 'next', to: 'step-18', when: '保存成功' }] },
      { at, actor: 'human', op: 'edit', reason: '补说明', changes: { body: { from: null, to: '保存按钮在页面底部' } } },
      { at, actor: 'human', op: 'unlink', reason: '加分支', edge: { type: 'next', to: 'step-18' } },
      { at, actor: 'human', op: 'link', reason: '加分支', edge: { type: 'next', to: 'step-16', when: '保存失败' } },
      { at, actor: 'human', op: 'link', reason: '加分支', edge: { type: 'next', to: 'step-18', when: '保存成功' } })
  }))
  assert.deepEqual(gaps(kept, 'step:next-dropped'), [['step:next-dropped', ['step-17']]])
  assert.deepEqual(gaps(kept, 'step:branch'), [], 'the one live branch left needs no condition check')
})

test('work:orphan, rules 1 to 3: own live serves, a descendant\'s or a dependent\'s use, and serves that all point at dropped steps (§1.4 item 21)', () => {
  const drop = (...steps: readonly number[]) => (nodes: Map<string, GraphNode>): void => {
    for (const step of steps) edit(nodes, `step-${step}`, { status: 'dropped' })
  }
  // 1. A work serving a live step and a dropped one is used.
  assert.deepEqual(gaps(read(libraryGraph(drop(17))), 'work:orphan'), [['work:orphan', ['feat-export']]])
  // 3. task-5 (done) only served the dropped step-18: an orphan whose steps were dropped, though feat-catalog serves step-5 to step-7.
  const dropped = read(libraryGraph(drop(18)))
  assert.deepEqual(gaps(dropped, 'work:orphan'), [['work:orphan', ['feat-export']], ['work:orphan', ['task-5']]])
  const task5 = gapOf(dropped, 'work:orphan', 'task-5')
  assert.deepEqual([task5.text, task5.reason], ['「搜索接口」服务的步骤都不要了', 'steps-dropped'])
  assert.equal(task5.hint, 'this work only serves steps that were dropped: graph_unlink those serves and graph_link it to the step that replaced them, or drop it if it is not needed (a done work cannot be dropped: its serves links can still be changed)')
  // 3, the layout of §1.4 item 11.1: a doing task under a module that serves live steps, its own serves all on a dropped step.
  const doing = read(libraryGraph((nodes) => {
    drop(18)(nodes)
    nodes.set('task-20', added({ id: 'task-20', type: 'task', title: '逾期提醒短信', parent: 'feat-overdue', status: 'doing', edges: [{ type: 'serves', to: 'step-18' }] }))
  }))
  assert.equal(gapOf(doing, 'work:orphan', 'task-20').reason, 'steps-dropped')
  // 2. Its own serves are dead, but a descendant serves a live step, or a used work depends on it: used.
  const descendant = read(libraryGraph((nodes) => {
    drop(18)(nodes)
    nodes.set('task-21', added({ id: 'task-21', type: 'task', title: '搜索分词', parent: 'task-5', edges: [{ type: 'serves', to: 'step-16' }] }))
  }))
  assert.deepEqual(gaps(descendant, 'work:orphan'), [['work:orphan', ['feat-export']]])
  const dependent = read(libraryGraph((nodes) => {
    drop(18)(nodes)
    edit(nodes, 'task-6', { edges: [{ type: 'depends', to: 'task-5' }, { type: 'serves', to: 'step-16' }, { type: 'serves', to: 'step-17' }] })
  }))
  assert.deepEqual(gaps(dependent, 'work:orphan'), [['work:orphan', ['feat-export']]])
  // The fixed point runs along depends to the end: task-12 is used through task-22, which a used task depends on.
  const chain = read(libraryGraph((nodes) => {
    nodes.set('task-22', added({ id: 'task-22', type: 'task', title: '报表模板', parent: 'feat-export', edges: [{ type: 'depends', to: 'task-12' }] }))
    edit(nodes, 'task-7', { edges: [{ type: 'depends', to: 'task-22' }, { type: 'serves', to: 'step-8' }] })
  }))
  assert.deepEqual(gaps(chain, 'work:orphan'), [['work:orphan', ['feat-export']]], 'the tasks are used; the feature itself still serves nothing')
})

test('work:orphan, rules 4 and 5, reviews, and a module that says it serves no step (§1.4 item 21, review 5 finding 5)', () => {
  // 4. task-1 to task-3 have no serves and are vouched for by 账号; 导出年度报表 has none above it; 5. task-12 is not listed apart.
  const ug = read()
  assert.deepEqual(gaps(ug, 'work:orphan'), [['work:orphan', ['feat-export']]])
  // A review task is no work: neither listed nor vouching.
  const reviewed = read(libraryGraph(nodes => nodes.set('review-2', added({ id: 'review-2', type: 'task', title: '整体审查', parent: 'goal-1', kind: 'review' }))))
  assert.deepEqual(gaps(reviewed, 'work:orphan'), [['work:orphan', ['feat-export']]])
  // A module with a proper 服务：无 line is no gap, nor is the work without serves below it; work below it with dead serves still is.
  const skeleton = (body: string) => (nodes: Map<string, GraphNode>): void => {
    nodes.set('feat-skeleton', added({ id: 'feat-skeleton', type: 'feature', title: '搭建项目骨架', parent: 'goal-1', stage: 'release', body }))
    nodes.set('task-23', added({ id: 'task-23', type: 'task', title: '持续集成', parent: 'feat-skeleton' }))
    nodes.set('task-24', added({ id: 'task-24', type: 'task', title: '旧的导入脚本', parent: 'feat-skeleton', status: 'doing', edges: [{ type: 'serves', to: 'step-18' }] }))
    edit(nodes, 'step-18', { status: 'dropped' })
  }
  const declared = read(libraryGraph(skeleton('服务：无，搭建项目骨架与持续集成')))
  assert.deepEqual(gaps(declared, 'work:orphan'), [['work:orphan', ['feat-export']], ['work:orphan', ['task-5']], ['work:orphan', ['task-24']]])
  const undeclared = read(libraryGraph(skeleton('服务：无')))
  assert.deepEqual(gaps(undeclared, 'work:orphan'), [['work:orphan', ['feat-export']], ['work:orphan', ['feat-skeleton']], ['work:orphan', ['task-5']]], 'a 服务：无 without its reason does not count; the orphan module stands for its tasks')
})

test('flow:no-test: only when every step has task leaves and none of them is a test task, for automatic walks only (§1.4 item 16)', () => {
  const testOf = (graph: LoadedGraph): readonly string[] => gaps(read(graph), 'flow:no-test').map(([, nodes]) => nodes[0])
  assert.deepEqual(testOf(libraryGraph()), ['flow-2', 'flow-4'])
  // A step whose leaf is a feature without tasks: no gap.
  assert.deepEqual(testOf(libraryGraph((nodes) => {
    edit(nodes, 'task-8', { edges: [{ type: 'serves', to: 'step-9' }, { type: 'serves', to: 'step-10' }] })
    nodes.set('feat-return', added({ id: 'feat-return', type: 'feature', title: '归还', parent: 'goal-1', edges: [{ type: 'serves', to: 'step-12' }] }))
  })), ['flow-2'])
  // 你来走 and an unreadable walk line are not automatic walks.
  assert.deepEqual(testOf(libraryGraph(nodes => edit(nodes, 'flow-2', { body: '走法：你来走' }))), ['flow-4'])
  const unparsed = read(libraryGraph(nodes => edit(nodes, 'flow-2', { body: '前提：馆里有书' })))
  assert.deepEqual([gaps(unparsed, 'flow:no-test'), gaps(unparsed, 'flow:no-walk')], [[['flow:no-test', ['flow-4']]], [['flow:no-walk', ['flow-2']]]])
  // (a) 还书 has task-level links on every step; a test task linked to step-12 only: step-12's leaves take it, step-13's do not.
  const linked = read(libraryGraph(nodes => nodes.set('task-25', added({ id: 'task-25', type: 'task', title: '端到端测试：还书', parent: 'feat-lending', kind: 'test', status: 'doing', edges: [{ type: 'serves', to: 'step-12' }] }))))
  assert.deepEqual(gaps(linked, 'flow:no-test'), [['flow:no-test', ['flow-2']]])
  assert.deepEqual([ids(stepOf(linked, 'step-12').leaves), stepOf(linked, 'step-12').state], [['task-25', 'task-8'], 'building'])
  assert.deepEqual([ids(stepOf(linked, 'step-13').leaves), stepOf(linked, 'step-13').state], [['task-9'], 'planned'])
  // (b) 搜书 has only module-level links: a test task in the module without serves is a leaf of every step already (like task-13 in 登录).
  const inModule = (nodes: Map<string, GraphNode>): void => {
    nodes.set('task-26', added({ id: 'task-26', type: 'task', title: '端到端测试：搜书', parent: 'feat-catalog', kind: 'test' }))
  }
  const covered = read(libraryGraph(inModule))
  assert.deepEqual(gaps(covered, 'flow:no-test'), [['flow:no-test', ['flow-4']]])
  assert.deepEqual(ids(stepOf(covered, 'step-5').leaves), ['task-26', 'task-4', 'task-5', 'task-6'])
  // Linking another test task of the module to step-5 narrows step-5's leaves to it; step-6 and step-7 keep the module's leaves.
  const narrowed = read(libraryGraph((nodes) => {
    inModule(nodes)
    nodes.set('task-27', added({ id: 'task-27', type: 'task', title: '端到端测试：搜索框', parent: 'feat-catalog', kind: 'test', edges: [{ type: 'serves', to: 'step-5' }] }))
  }))
  assert.deepEqual(ids(stepOf(narrowed, 'step-5').leaves), ['task-27'])
  assert.deepEqual(ids(stepOf(narrowed, 'step-6').leaves), ['task-26', 'task-27', 'task-4', 'task-5', 'task-6'])
  // Review 5 finding 3: a test task outside the module linked to a module-only step adds itself and narrows nothing.
  const outside = read(libraryGraph(nodes => nodes.set('task-28', added({ id: 'task-28', type: 'task', title: '端到端测试：搜书全程', parent: 'feat-overdue', kind: 'test', edges: [{ type: 'serves', to: 'step-5' }] }))))
  assert.deepEqual(ids(stepOf(outside, 'step-5').leaves), ['task-28', 'task-4', 'task-5', 'task-6'])
  assert.deepEqual(gaps(outside, 'flow:no-test'), [['flow:no-test', ['flow-4']]])
})

test('entries and loops: no entry or two entries is flow:entry; a loop back to the entry is fine; next cycles end (§1.4 item 22)', () => {
  const none = read(libraryGraph(nodes => edit(nodes, 'flow-2', { edges: [] })))
  assert.deepEqual(gaps(none, 'flow:entry'), [['flow:entry', ['flow-2']]])
  assert.deepEqual([flowOf(none, 'flow-2').entry, flowOf(none, 'flow-2').unreachable.map(step => step.id)], [undefined, ['step-5', 'step-6', 'step-7']])
  assert.deepEqual(gaps(none, 'flow:unreachable'), [], 'without one entry, reach is not judged')
  const two = read(libraryGraph(nodes => edit(nodes, 'flow-2', { edges: [{ type: 'next', to: 'step-5' }, { type: 'next', to: 'step-6' }] })))
  assert.deepEqual(gaps(two, 'flow:entry'), [['flow:entry', ['flow-2']]])
  // The entry pointing at a dropped step is flow:entry, not step:next-dropped.
  const gone = read(libraryGraph(nodes => edit(nodes, 'step-5', { status: 'dropped' })))
  assert.deepEqual([gaps(gone, 'flow:entry'), gaps(gone, 'step:next-dropped')], [[['flow:entry', ['flow-2']]], [['step:next-dropped', ['step-6']]]])
  // A loop over every step of a flow: states, order and reach end, the display order is depth first from the entry.
  const loop = read(libraryGraph((nodes) => {
    edit(nodes, 'step-14', { edges: [{ type: 'next', to: 'step-12' }] })
    edit(nodes, 'step-12', { edges: [{ type: 'next', to: 'step-13', when: '还一本' }, { type: 'next', to: 'step-14', when: '都还了' }] })
  }))
  assert.deepEqual(flowOf(loop, 'flow-4').steps.map(view => view.step.id), ['step-12', 'step-13', 'step-14'])
  assert.deepEqual(gaps(loop, 'flow:unreachable'), [])
  // Branches without a condition, or with the same one twice.
  const bare = read(libraryGraph(nodes => edit(nodes, 'step-6', { edges: [{ type: 'next', to: 'step-7' }, { type: 'next', to: 'step-5', when: '没搜到' }] })))
  assert.deepEqual(gaps(bare, 'step:branch'), [['step:branch', ['step-6']]])
  const twice = read(libraryGraph(nodes => edit(nodes, 'step-6', { edges: [{ type: 'next', to: 'step-7', when: '没搜到' }, { type: 'next', to: 'step-5', when: '没搜到' }] })))
  assert.deepEqual(gaps(twice, 'step:branch'), [['step:branch', ['step-6']]])
})

test('graph_show projects a work\'s serves, a step\'s servers, next and previous steps, a flow\'s entry, and the serving gates (§1.4 items 23, 24)', () => {
  const graph = libraryGraph()
  const project = (id: string) => {
    const result = projectNode(graph, id)
    assert.ok(result.ok)
    return result.projection
  }
  const refs = (list: readonly NodeRef[] | undefined): string[] => (list ?? []).map(ref => ref.id)
  assert.deepEqual(refs(project('task-8').serves), ['step-10', 'step-12', 'step-9'])
  assert.equal(project('task-8').serves?.[0]?.rev, graph.revisions.get('step-10'))
  assert.deepEqual(refs(project('feat-legacy').serves), ['step-10', 'step-9'], 'a work\'s own edges, whatever their state')
  const step9 = project('step-9')
  assert.deepEqual([refs(step9.servedBy), step9.next?.map(edge => edge.to.id), refs(step9.previous)], [['task-8'], ['step-10'], ['step-11', 'step-8']])
  assert.deepEqual(project('step-8').next?.map(edge => [edge.to.id, edge.when]), [['step-11', '没交押金'], ['step-9', '已交押金']])
  assert.deepEqual(project('flow-3').next?.map(edge => edge.to.id), ['step-8'])
  assert.equal(project('goal-1').serves, undefined, 'a goal carries none of the four')
  // Gates: an unserved step reports serving, the goal lists its unserved steps, and user nodes never keep a parent's children open.
  assert.deepEqual(project('step-11').gates.map(gate => [gate.kind, gate.ids]), [['serving', ['step-11']]])
  assert.deepEqual(project('step-9').gates, [])
  const goal = project('goal-1').gates
  assert.deepEqual(goal.find(gate => gate.kind === 'steps')?.ids, ['step-11'])
  assert.deepEqual(goal.find(gate => gate.kind === 'children')?.ids, ['feat-export', 'feat-lending', 'norm-merge-gate'])
  assert.deepEqual(project('role-1').gates, [], 'approved flows are no open children')
})

/** A proposed flow the person rejected and an approved flow dropped later, each with a proposed step below, and one live proposed step. */
function withProposals(nodes: Map<string, GraphNode>): void {
  nodes.set('flow-7', added({ id: 'flow-7', type: 'flow', title: '预约', parent: 'role-1', status: 'dropped', body: '走法：你来走' }))
  nodes.set('step-31', added({ id: 'step-31', type: 'step', title: '点预约', parent: 'flow-7', status: 'proposed', acceptance: ['提示预约成功'] }))
  nodes.set('flow-8', added({ id: 'flow-8', type: 'flow', title: '续借', parent: 'role-1', status: 'dropped', body: '走法：你来走' }))
  nodes.set('step-32', added({ id: 'step-32', type: 'step', title: '点续借', parent: 'flow-8', status: 'proposed', acceptance: ['提示续借成功'] }))
  nodes.set('step-33', added({ id: 'step-33', type: 'step', title: '看到搜索历史', parent: 'flow-2', status: 'proposed', acceptance: ['看到搜过的词'] }))
  nodes.set('risk-1', added({ id: 'risk-1', type: 'risk', title: '押金退不回去', parent: 'goal-1', status: 'proposed' }))
}

test('the panel\'s needs and graph_open leave out proposed user nodes whose flow was rejected or dropped; other proposals stay (§1.4 item 26)', async () => {
  const graph = libraryGraph(withProposals)
  assert.deepEqual(graph.issues, [])
  assert.deepEqual(needsOf(graph, []).filter(need => need.kind === 'proposal').map(need => need.node?.id).sort(), ['risk-1', 'step-33'])
  const dir = await mkdtemp(join(tmpdir(), 'graph-user-state-'))
  try {
    await mkdir(join(dir, 'nodes'))
    for (const node of graph.nodes.values()) await writeFile(join(dir, 'nodes', `${node.id}.json`), serializeNode(node))
    const open = graphTools(dir, new Map()).find(tool => tool.name === 'graph_open')!
    const result = await open.execute({}, { agent: { session: { header: { cwd: dir }, id: 's' } } }) as { readonly items: { readonly proposals: readonly NodeRef[] } }
    assert.deepEqual(result.items.proposals.map(ref => ref.id).sort(), ['risk-1', 'step-33'])
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})
