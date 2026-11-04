/**
 * The library fixture of user graph design 0.4.1 §2.9 (review 5 finding 2:
 * one builder the user-graph specs share): the explicit node table, built
 * straight into node files, serialized and parsed back so the fixture is
 * held to the same file rules as the repository's graph. The first history
 * entry of each node is a proposal on 10-26 in the morning (minute = its
 * position in the table) and the approval follows an hour later; the later
 * history is the table's. Evaluation time 2026-10-31T18:00:00Z.
 */
import { serializeNode } from '../src/graph/format.ts'
import { parseGraph, type LoadedGraph } from '../src/graph/parse.ts'
import type { Evidence, GraphEdge, GraphNode, HistoryEntry, Status } from '../src/graph/schema.ts'

/** A fixture time, `MM-DD HH:MM` of 2026 in UTC. */
export function when(at: string): string {
  const [day, time] = at.split(' ')
  return `2026-${day}T${time}:00Z`
}

/** The commit every walk of the fixture ran at. */
export const WALKED_AT = '3f2a91c'

const COMMIT: Evidence = { kind: 'commit', ref: 'a1b2c3d' }

/** A status change; a change to done carries a commit. */
export function status(at: string, from: Status, to: Status, actor: HistoryEntry['actor'] = 'llm'): HistoryEntry {
  return { at: when(at), actor, op: 'status', reason: '夹具', from, to, ...(to === 'done' ? { evidence: [COMMIT] } : {}) }
}

/** The walk evidence of one step: a passing or a failing result line after the commit and the report digest. */
function walkEvidence(flow: string, exit: number, result: string): Evidence {
  return { kind: 'walk', ref: `command:npm run e2e -- --flow ${flow}`, exit, note: `@${WALKED_AT} sha256:9bd1c0e2 ${result}` }
}

/** A walk the harness recorded. */
function walked(at: string, evidence: Evidence): HistoryEntry {
  return { at: when(at), actor: 'harness', op: 'walk', reason: `job-1 流程走一遍`, evidence: [evidence] }
}

interface Row {
  readonly id: string
  readonly type: GraphNode['type']
  readonly title: string
  readonly parent?: string
  readonly status?: Status
  readonly edges?: readonly GraphEdge[]
  readonly later?: readonly HistoryEntry[]
  readonly fields?: Partial<GraphNode>
}

const serves = (...steps: readonly number[]): GraphEdge[] => steps.map(step => ({ type: 'serves', to: `step-${step}` }))
const next = (to: number, condition?: string): GraphEdge => ({ type: 'next', to: `step-${to}`, ...(condition === undefined ? {} : { when: condition }) })
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, offset) => from + offset)

const STEP_TITLES: Readonly<Record<number, string>> = {
  1: '打开登录页', 2: '输入账号密码', 3: '进入首页', 4: '看到错误提示',
  5: '在搜索框输入', 6: '看到结果列表', 7: '打开一本看详情',
  8: '在书的详情页点「借阅」', 9: '确认借阅', 10: '看到应还日期', 11: '交押金',
  12: '打开我的借阅', 13: '选一本点「归还」', 14: '看到归还成功',
  15: '用管理员账号登录', 16: '填写书目信息', 17: '保存', 18: '在搜索里搜到',
  19: '打开逾期列表', 20: '选一条', 21: '发提醒或登记赔偿', 22: '状态变为已处理',
}

const STEP_FLOWS: Readonly<Record<number, string>> = Object.fromEntries(range(1, 22).map(step => [
  step, step <= 4 ? 'flow-1' : step <= 7 ? 'flow-2' : step <= 11 ? 'flow-3' : step <= 14 ? 'flow-4' : step <= 18 ? 'flow-5' : 'flow-6',
]))

const STEP_NEXT: Readonly<Partial<Record<number, readonly GraphEdge[]>>> = {
  1: [next(2)], 2: [next(3, '密码对'), next(4, '密码错')], 4: [next(2)],
  5: [next(6)], 6: [next(7, '搜到了'), next(5, '没搜到')],
  8: [next(9, '已交押金'), next(11, '没交押金')], 9: [next(10)], 11: [next(9)],
  12: [next(13)], 13: [next(14)],
  15: [next(16)], 16: [next(17)], 17: [next(18)],
  19: [next(20)], 20: [next(21)], 21: [next(22)],
}

/** The later history of the steps: the walks of 登录, 录入新书 and 处理逾期, and the relink that put 交押金 in. */
function stepLater(step: number): HistoryEntry[] {
  if (step <= 4) return [walked('10-30 09:00', walkEvidence('flow-1', 0, '通过'))]
  if (step >= 15 && step <= 18) return [walked('10-29 09:00', walkEvidence('flow-5', 0, '通过'))]
  if (step >= 19) return [walked('10-31 10:00', step === 21 ? walkEvidence('flow-6', 1, '登记赔偿后状态没变') : walkEvidence('flow-6', 0, '通过'))]
  if (step === 8) {
    const at = when('10-31 16:00')
    const relink = { at, actor: 'llm' as const, reason: '没交押金的先去交押金', relay: '借书前要先交押金' }
    return [
      { ...relink, op: 'unlink', edge: next(9) },
      { ...relink, op: 'link', edge: next(9, '已交押金') },
      { ...relink, op: 'link', edge: next(11, '没交押金') },
    ]
  }
  return []
}

const ROWS: readonly Row[] = [
  { id: 'goal-1', type: 'goal', title: '图书管理系统', fields: { acceptance: ['读者能借到书'] } },
  { id: 'norm-merge-gate', type: 'norm', title: '合入前检查', parent: 'goal-1', fields: { acceptance: ['`npm test` 通过', '`walk 命令 $ npm run e2e -- --flow {flow}`'] } },
  { id: 'role-1', type: 'role', title: '读者', parent: 'goal-1' },
  { id: 'role-2', type: 'role', title: '管理员', parent: 'goal-1' },
  { id: 'flow-1', type: 'flow', title: '登录', parent: 'role-1', edges: [next(1)], fields: { body: '走法：命令 · 预计 30 秒' } },
  { id: 'flow-2', type: 'flow', title: '搜书', parent: 'role-1', edges: [next(5)], fields: { body: '走法：命令 · 预计 30 秒' } },
  { id: 'flow-3', type: 'flow', title: '借书', parent: 'role-1', edges: [next(8)], fields: { body: '前提：读者已登录，馆里已有这本书\n走法：命令 · 预计 40 秒' } },
  { id: 'flow-4', type: 'flow', title: '还书', parent: 'role-1', edges: [next(12)], fields: { body: '走法：命令 · 预计 30 秒' } },
  { id: 'flow-5', type: 'flow', title: '录入新书', parent: 'role-2', edges: [next(15)], fields: { body: '走法：命令 · 预计 40 秒' } },
  { id: 'flow-6', type: 'flow', title: '处理逾期', parent: 'role-2', edges: [next(19)], fields: { body: '走法：命令 · 预计 40 秒' } },
  ...range(1, 22).filter(step => step !== 11).map((step): Row => ({
    id: `step-${step}`, type: 'step', title: STEP_TITLES[step], parent: STEP_FLOWS[step], edges: STEP_NEXT[step] ?? [], later: stepLater(step),
  })),
  { id: 'feat-account', type: 'feature', title: '账号', parent: 'goal-1', status: 'done', edges: serves(1, 2, 3, 4, 15), later: [status('10-27 16:30', 'approved', 'done')] },
  { id: 'task-1', type: 'task', title: '登录接口', parent: 'feat-account', status: 'done', later: [status('10-27 10:00', 'approved', 'done')] },
  { id: 'task-2', type: 'task', title: '登录页', parent: 'feat-account', status: 'done', later: [status('10-27 15:00', 'approved', 'done')] },
  { id: 'task-3', type: 'task', title: '管理员权限', parent: 'feat-account', status: 'done', later: [status('10-27 16:00', 'approved', 'done')] },
  { id: 'task-13', type: 'task', title: '端到端测试：登录与录入新书', parent: 'feat-account', status: 'done', fields: { kind: 'test' }, later: [status('10-27 16:20', 'approved', 'done')] },
  { id: 'feat-catalog', type: 'feature', title: '书目', parent: 'goal-1', status: 'done', edges: serves(5, 6, 7), later: [status('10-28 15:00', 'approved', 'done')] },
  { id: 'task-4', type: 'task', title: '书目存取', parent: 'feat-catalog', status: 'done', later: [status('10-28 09:00', 'approved', 'done')] },
  { id: 'task-5', type: 'task', title: '搜索接口', parent: 'feat-catalog', status: 'done', edges: serves(18), later: [status('10-28 11:00', 'approved', 'done')] },
  {
    id: 'task-6', type: 'task', title: '录入页', parent: 'feat-catalog', status: 'done', edges: serves(16, 17),
    later: [status('10-28 14:00', 'approved', 'done'), status('10-31 09:00', 'done', 'doing'), status('10-31 11:00', 'doing', 'done')],
  },
  { id: 'feat-lending', type: 'feature', title: '借阅', parent: 'goal-1', status: 'doing', later: [status('10-31 13:00', 'approved', 'doing')] },
  { id: 'task-7', type: 'task', title: '借阅接口', parent: 'feat-lending', status: 'doing', edges: serves(8), later: [status('10-31 13:00', 'approved', 'doing')] },
  { id: 'task-8', type: 'task', title: '借阅页面', parent: 'feat-lending', edges: serves(9, 10, 12) },
  { id: 'task-9', type: 'task', title: '归还接口', parent: 'feat-lending', edges: [...serves(13, 14), { type: 'supersedes', to: 'task-16' }] },
  {
    id: 'task-16', type: 'task', title: '旧归还接口', parent: 'feat-lending', status: 'superseded', edges: serves(13),
    later: [status('10-29 16:00', 'approved', 'done'), { at: when('10-30 11:00'), actor: 'human', op: 'supersede', reason: '换成新接口', from: 'done', to: 'superseded', by: 'task-9' }],
  },
  { id: 'feat-legacy', type: 'feature', title: '旧借阅方案', parent: 'goal-1', status: 'dropped', edges: serves(9, 10), later: [status('10-31 12:30', 'approved', 'dropped', 'human')] },
  { id: 'task-15', type: 'task', title: '旧借阅页面', parent: 'feat-legacy', status: 'doing', edges: serves(9), later: [status('10-31 12:00', 'approved', 'doing')] },
  { id: 'feat-overdue', type: 'feature', title: '逾期与通知', parent: 'goal-1', status: 'done', edges: serves(19, 20, 21, 22), later: [status('10-30 18:00', 'approved', 'done')] },
  { id: 'task-10', type: 'task', title: '逾期列表', parent: 'feat-overdue', status: 'done', later: [status('10-30 10:00', 'approved', 'done')] },
  { id: 'task-11', type: 'task', title: '提醒与赔偿', parent: 'feat-overdue', status: 'done', later: [status('10-30 16:00', 'approved', 'done')] },
  { id: 'task-14', type: 'task', title: '端到端测试：处理逾期', parent: 'feat-overdue', status: 'done', fields: { kind: 'test' }, later: [status('10-30 12:00', 'approved', 'done')] },
  { id: 'feat-export', type: 'feature', title: '导出年度报表', parent: 'goal-1' },
  { id: 'task-12', type: 'task', title: '报表导出', parent: 'feat-export' },
]

/** 交押金 (step-11) came last: proposed on 10-31 16:00 with the person's words, so approved at once. */
const DEPOSIT: GraphNode = {
  id: 'step-11',
  type: 'step',
  title: STEP_TITLES[11],
  status: 'approved',
  parent: 'flow-3',
  acceptance: [`${STEP_TITLES[11]}成功`],
  edges: [next(9)],
  history: [{ at: when('10-31 16:00'), actor: 'llm', op: 'propose', reason: '借书前要先交押金', relay: '借书前要先交押金', to: 'approved' }],
}

function nodeOf(row: Row, position: number): GraphNode {
  const minute = String(position).padStart(2, '0')
  const edges = row.edges ?? []
  const evidence = (row.later ?? []).flatMap(entry => entry.evidence ?? [])
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status ?? 'approved',
    ...(row.parent === undefined ? {} : { parent: row.parent }),
    ...(row.type === 'step' ? { acceptance: [`${row.title}成功`] } : {}),
    ...(edges.length === 0 ? {} : { edges }),
    ...(evidence.length === 0 ? {} : { evidence }),
    ...row.fields,
    history: [
      { at: `2026-10-26T08:${minute}:00Z`, actor: 'llm', op: 'propose', reason: '夹具', to: 'proposed' },
      { at: `2026-10-26T09:${minute}:00Z`, actor: 'human', op: 'approve', reason: '夹具', from: 'proposed', to: 'approved' },
      ...row.later ?? [],
    ],
  }
}

/** The fixture's nodes, a fresh copy each call. */
export function libraryNodes(): GraphNode[] {
  return [...ROWS.map(nodeOf), DEPOSIT].map(node => structuredClone(node))
}

/** Nodes as a loaded graph: serialized and parsed, so the file rules apply (the caller checks `issues`). */
export function loaded(nodes: readonly GraphNode[]): LoadedGraph {
  return parseGraph(nodes.map(node => ({ name: `${node.id}.json`, text: serializeNode(node), revision: 'r0' })), 'rev-library')
}

/** The library graph; `change` edits a copy of its nodes first (the design's 「夹具副本」). */
export function libraryGraph(change: (nodes: Map<string, GraphNode>) => void = () => {}): LoadedGraph {
  const nodes = new Map(libraryNodes().map(node => [node.id, node]))
  change(nodes)
  return loaded([...nodes.values()])
}

/** Replace one node of a fixture copy with some fields changed and history entries appended. */
export function edit(nodes: Map<string, GraphNode>, id: string, fields: Partial<GraphNode>, ...later: readonly HistoryEntry[]): void {
  const node = nodes.get(id)
  if (node === undefined) throw new Error(`the fixture has no ${id}`)
  nodes.set(id, { ...node, ...fields, history: [...node.history, ...later] })
}

/** A fixture copy's new node, proposed and approved at `at` by the person. */
export function added(fields: Omit<GraphNode, 'history' | 'status'> & { readonly status?: Status }, at = '10-31 17:00'): GraphNode {
  return {
    status: 'approved',
    ...fields,
    history: [{ at: when(at), actor: 'human', op: 'propose', reason: '夹具副本', to: fields.status ?? 'approved' }],
  }
}
