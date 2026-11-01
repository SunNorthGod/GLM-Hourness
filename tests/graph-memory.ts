/**
 * Graphs built in memory for the specs of the pure graph readers (stage,
 * modules) and of what is built on them (the stage reminder, the
 * design-before-release rule): nodes with a history written by hand, no
 * engine and no files, so a test says exactly the state it reads.
 */
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { Actor, GraphNode, HistoryEntry } from '../src/graph/schema.ts'
import type { GateItem } from '../src/graph/stage.ts'
import { at, graphOf, node } from './execute-helpers.ts'

export { graphOf, node } from './execute-helpers.ts'

export function decide(actor: Actor, n: number, option: string, relay?: string): HistoryEntry {
  return { at: at(n), actor, op: 'decide', reason: '定', from: 'approved', to: 'done', option, evidence: [{ kind: 'decision', ref: option }], ...(relay === undefined ? {} : { relay }) }
}

const OPTIONS = [{ key: 'A', label: '甲', consequence: '快' }, { key: 'B', label: '乙', consequence: '稳' }]

export function question(id: string, parent: string, fields: Partial<GraphNode> = {}, extra: readonly HistoryEntry[] = []): GraphNode {
  return node({ id, type: 'question', parent, options: OPTIONS, recommend: 'B', ...fields }, 1, 'llm', extra)
}

export const GOAL_BODY = '需求：我想要一个命令行小工具，每天记一下花了多少钱\n问题：月底不知道钱花在哪\n给谁：本人\n约束：无'

/** A goal in the interview whose requirement card is complete: body labels, acceptance, non-goals, a risk and a choice the human made. */
export function interview(goal: Partial<GraphNode> = {}, others: readonly GraphNode[] = []): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const root = node({ id: 'goal-1', type: 'goal', status: 'proposed', stage: 'interview', body: GOAL_BODY, acceptance: ['月底能看出钱花在哪'], nonGoals: ['不做多人共享'], ...goal })
  const graph = graphOf([
    root,
    node({ id: 'risk-1', type: 'risk', parent: 'goal-1' }),
    question('question-1', 'goal-1', { status: 'done', decision: 'B' }, [decide('human', 5, 'B')]),
    ...others,
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

/** A goal in design with one complete design decision, its plan (a task directly under the goal: a small project is released once, without modules) and a decided fork. */
export function design(decision: Partial<GraphNode> = {}, others: readonly GraphNode[] = []): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'approved', stage: 'design', body: GOAL_BODY, acceptance: ['a'], nonGoals: ['n'] }, 0, 'human'),
    question('question-1', 'goal-1', { status: 'done', decision: 'B' }, [decide('human', 2, 'B')]),
    node({
      id: 'decision-1', type: 'decision', status: 'proposed', parent: 'goal-1', verification: 'unverified',
      body: '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重',
      acceptance: ['月底出一张分类表'], nonGoals: ['不做同步'], edges: [{ type: 'source', to: 'question-1' }], ...decision,
    }, 3),
    node({ id: 'task-1', type: 'task', status: 'proposed', parent: 'goal-1', acceptance: ['记一条能读回'], edges: [{ type: 'source', to: 'decision-1' }] }, 5),
    ...others,
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

/** The columns, acceptance and non-goals of a design decision, as the gate reads them. */
const COLUMNS = { body: '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重', acceptance: ['月底出一张分类表'], nonGoals: ['不做同步'] } as const

/**
 * A goal in design split into two module candidates, `module-a` and `module-b`
 * (proposals, each pointing at the framework), with the framework decision
 * `decision-fw`, the list of directions `norm-directions`, and below each
 * candidate its own decision and task: everything is a proposal. `others` are
 * added to the graph.
 */
export function splitDesign(others: readonly GraphNode[] = []): { readonly graph: LoadedGraph, readonly goal: GraphNode } {
  const below = (key: 'a' | 'b', n: number): GraphNode[] => [
    node({ id: `decision-${key}`, type: 'decision', status: 'proposed', parent: `module-${key}`, verification: 'unverified', ...COLUMNS }, n),
    node({ id: `task-${key}`, type: 'task', status: 'proposed', parent: `module-${key}`, acceptance: ['能用'], edges: [{ type: 'source', to: `decision-${key}` }] }, n + 1),
  ]
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', status: 'approved', stage: 'design', body: GOAL_BODY, acceptance: ['a'], nonGoals: ['n'] }, 0, 'human'),
    node({ id: 'decision-fw', type: 'decision', status: 'proposed', parent: 'goal-1', verification: 'unverified', title: '用本地文件存账', ...COLUMNS }, 1),
    node({ id: 'norm-directions', type: 'norm', status: 'proposed', parent: 'goal-1', acceptance: ['数据只存在本机', '先记账再汇总'] }, 2),
    node({ id: 'module-a', type: 'feature', status: 'proposed', parent: 'goal-1', title: '记账', edges: [{ type: 'source', to: 'decision-fw' }] }, 3),
    node({ id: 'module-b', type: 'feature', status: 'proposed', parent: 'goal-1', title: '月底汇总', edges: [{ type: 'source', to: 'decision-fw' }] }, 4),
    ...below('a', 5),
    ...below('b', 7),
    ...others,
  ])
  return { graph, goal: graph.nodes.get('goal-1')! }
}

export function failing(items: readonly GateItem[]): string[] {
  return items.filter(item => !item.ok).map(item => item.key)
}
