/**
 * Pure helpers of the project graph panel: revisions with Web Crypto, the
 * node filters of the graph view, and the labels the views show. No DOM
 * and no DSH service, so the specs run them under Node.
 */
import { compareText } from '../../../src/graph/format.ts'
import { ACTOR_LABELS, OP_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from '../../../src/graph/labels.ts'
import { revisionInput, type LoadedGraph } from '../../../src/graph/parse.ts'
import { OPEN_STATUSES, deciderOf, waitsForHuman, type DecisionRecord } from '../../../src/graph/projection.ts'
import { EDITABLE_FIELDS, type EdgeType, type EditableField, type GraphNode, type HistoryEntry } from '../../../src/graph/schema.ts'

/**
 * First 12 hex digits of the SHA-256 of some bytes: the revision store.ts
 * computes with node:crypto. Web Crypto takes only ArrayBuffer-backed views,
 * and the remote's bytes may sit on any buffer, so the digest reads a copy.
 */
export async function revisionOfBytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
  let hex = ''
  for (const byte of digest.subarray(0, 6)) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** The graph revision of node file revisions, as store.ts graphRevision computes it. */
export async function graphRevisionOf(revisions: ReadonlyMap<string, string>): Promise<string> {
  return revisionOfBytes(new TextEncoder().encode(revisionInput(revisions)))
}

/** Last path segment of a host path with either separator. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(segment => segment.length > 0).at(-1) ?? ''
}

/**
 * The order the lists show nodes in: the order the graph view draws
 * siblings in (layout.ts buildTree), creation time (the first history
 * entry), then id. The projection lists come in file-name order, which
 * puts m1-10 before m1-2 and m1-parity before m1.
 */
export function byCreation(graph: LoadedGraph): (a: { readonly id: string }, b: { readonly id: string }) => number {
  const created = (id: string): string => graph.nodes.get(id)?.history[0]?.at ?? ''
  return (a, b) => compareText(created(a.id), created(b.id)) || compareText(a.id, b.id)
}

/** Which nodes the graph view draws. */
export type GraphFilter = 'open' | 'all' | 'mine'

export const FILTER_LABELS: Readonly<Record<GraphFilter, string>> = {
  open: '没做完的',
  all: '全部',
  mine: '只看等你的',
}

/** The human has to act on it: a proposal, or a question the human decides. */
export function needsHuman(node: GraphNode): boolean {
  return node.status === 'proposed' || waitsForHuman(node)
}

/** The dot of a child row: a proposal (dashed) before what waits for the human (red), else the status colour. */
export function dotTone(node: GraphNode): string {
  if (node.status === 'proposed') return 'proposed'
  return waitsForHuman(node) ? 'wait' : node.status
}

export interface VisibleGraph {
  readonly nodes: ReadonlyMap<string, GraphNode>
  /** Per drawn node, how many of its direct children the filter hid because they are closed. */
  readonly hiddenClosed: ReadonlyMap<string, number>
}

function childrenOf(nodes: ReadonlyMap<string, GraphNode>): Map<string, GraphNode[]> {
  const index = new Map<string, GraphNode[]>()
  for (const node of nodes.values()) {
    if (node.parent === undefined) continue
    const list = index.get(node.parent) ?? []
    list.push(node)
    index.set(node.parent, list)
  }
  return index
}

/** Add every ancestor of the kept nodes, so the decomposition tree stays connected. */
function withAncestors(nodes: ReadonlyMap<string, GraphNode>, kept: Set<string>): void {
  for (const id of [...kept]) {
    let parent = nodes.get(id)?.parent
    const seen = new Set([id])
    while (parent !== undefined && !seen.has(parent)) {
      seen.add(parent)
      kept.add(parent)
      parent = nodes.get(parent)?.parent
    }
  }
}

/**
 * The nodes one filter draws. open: nodes that are open or have an open
 * descendant, and the goals; mine: what waits for the human and its
 * ancestors; all: everything. Closed children a filter hides are counted
 * on their parent.
 */
export function visibleGraph(graph: LoadedGraph, filter: GraphFilter): VisibleGraph {
  const { nodes } = graph
  if (filter === 'all') return { nodes, hiddenClosed: new Map() }
  const kept = new Set<string>()
  if (filter === 'open') {
    const index = childrenOf(nodes)
    const openBelow = new Map<string, boolean>()
    const open = (node: GraphNode, seen: Set<string>): boolean => {
      const known = openBelow.get(node.id)
      if (known !== undefined) return known
      if (seen.has(node.id)) return false
      seen.add(node.id)
      const result = OPEN_STATUSES.has(node.status) || (index.get(node.id) ?? []).some(child => open(child, seen))
      openBelow.set(node.id, result)
      return result
    }
    for (const node of nodes.values()) {
      if (node.type === 'goal' || open(node, new Set())) kept.add(node.id)
    }
  }
  else {
    for (const node of nodes.values()) if (needsHuman(node)) kept.add(node.id)
  }
  withAncestors(nodes, kept)
  const visible = new Map([...nodes].filter(([id]) => kept.has(id)))
  const hiddenClosed = new Map<string, number>()
  for (const node of nodes.values()) {
    if (kept.has(node.id) || node.parent === undefined || !kept.has(node.parent) || OPEN_STATUSES.has(node.status)) continue
    hiddenClosed.set(node.parent, (hiddenClosed.get(node.parent) ?? 0) + 1)
  }
  return { nodes: visible, hiddenClosed }
}

/** The status line of a node in the graph and the lists: what it is waiting for, or how it ended. */
export function statusText(node: GraphNode): string {
  if (node.type === 'question') {
    if (node.status === 'done') {
      const chosen = node.options?.find(entry => entry.key === node.decision)
      return chosen === undefined ? '已拍板' : `选了 ${chosen.key} ${chosen.label}`
    }
    if (OPEN_STATUSES.has(node.status) && node.status !== 'proposed') return deciderOf(node) === 'agent' ? 'agent 来定' : '等你拍板'
  }
  if (node.status === 'proposed') return '等你批准'
  if (node.status === 'approved') return APPROVED_LABELS[node.type] ?? '未开始'
  return STATUS_LABELS[node.status]
}

/** What an approved node is, by type: approved work has not started, an approved decision or norm is in force. */
const APPROVED_LABELS: Readonly<Partial<Record<GraphNode['type'], string>>> = {
  decision: '已采纳',
  norm: '生效中',
  tool: '可用',
  risk: '在盯着',
}

/** Who made a decision, as the agent-decided view groups it. */
export type DecidedBy = 'agent' | 'relay' | 'human'

export function decidedBy(record: Pick<DecisionRecord, 'decidedBy' | 'relay'>): DecidedBy {
  if (record.decidedBy === 'human') return 'human'
  return record.relay === undefined ? 'agent' : 'relay'
}

export const DECIDED_BY_LABELS: Readonly<Record<DecidedBy, string>> = {
  agent: 'agent 定的',
  relay: '你在对话里说的',
  human: '你拍的',
}

/** Child types that are work: a node's progress counts these only. */
const WORK_TYPES: ReadonlySet<GraphNode['type']> = new Set(['task', 'feature'])

export interface Progress {
  /** Done and total work children (tasks and features). */
  readonly done: number
  readonly total: number
  /** Decided and total questions among the children. */
  readonly decided: number
  readonly questions: number
}

/**
 * Progress of a node over its direct children, leaving out dropped and
 * superseded ones. Work (tasks and features) is counted apart from
 * questions: a decided question is not work done, so a task whose only
 * children are decided questions has no work progress at all. Decisions,
 * norms, risks, tools and retros count for neither.
 */
export function progressOf(graph: LoadedGraph, id: string): Progress {
  let done = 0
  let total = 0
  let decided = 0
  let questions = 0
  for (const node of graph.nodes.values()) {
    if (node.parent !== id || node.status === 'dropped' || node.status === 'superseded') continue
    if (WORK_TYPES.has(node.type)) {
      total++
      if (node.status === 'done') done++
    }
    else if (node.type === 'question') {
      questions++
      if (node.status === 'done') decided++
    }
  }
  return { done, total, decided, questions }
}

/** The progress a row or a title states: work, then questions; each left out when the node has none. */
export function progressText(progress: Progress): { readonly work: string | undefined, readonly questions: string | undefined } {
  return {
    work: progress.total === 0 ? undefined : `工作完成 ${progress.done}/${progress.total}`,
    questions: progress.questions === 0 ? undefined : `待决已定 ${progress.decided}/${progress.questions}`,
  }
}

/**
 * Where an agent stands, as 现场 says it: a running agent is at its focus
 * now; one that stopped stays on it while the node is open, and on a node
 * that is closed it only worked there last.
 */
export function placeText(title: string, status: GraphNode['status'], running: boolean): string {
  if (running) return `在「${title}」`
  return OPEN_STATUSES.has(status) ? `停在「${title}」` : `上次在「${title}」`
}

/**
 * The note of 现场 when no agent of the session runs. Tasks in progress
 * may be worked on where the panel cannot see; features in progress only
 * contain work, so they are not counted.
 */
export function nobodyRunningText(tasks: number): string {
  const none = '这个会话里没有 agent 在跑。'
  return tasks === 0 ? none : `${none}进行中的 ${tasks} 个任务可能在别的会话或 DSH 之外推进。`
}

/** The second line of that note: what 现场 can see. */
export const LIVE_SCOPE_TEXT = '现场只看得见本会话的主 Agent 和它派出的子 agent。'

/**
 * The goals the panel names in its header: every goal that is not closed,
 * in id order; when all are closed, the first goal; none when the graph has
 * no goal. Which goal comes first never decides which one is shown.
 */
export function headlineGoals(graph: LoadedGraph): readonly GraphNode[] {
  const goals = [...graph.nodes.values()].filter(node => node.type === 'goal').sort((a, b) => compareText(a.id, b.id))
  const open = goals.filter(node => OPEN_STATUSES.has(node.status))
  return open.length > 0 ? open : goals.slice(0, 1)
}

/** Display names of the fields an edit changes (docs/ORCHESTRATION.md §2.6 field table). */
const FIELD_LABELS: Readonly<Record<EditableField, string>> = {
  title: '标题',
  parent: '父节点',
  slope: '坡向',
  stage: '阶段',
  kind: '派发种类',
  tier: '档位',
  worktree: '工作树',
  outputSchema: '交回结构',
  body: '正文',
  acceptance: '验收条件',
  nonGoals: '非目标',
  writeScope: '写入范围',
  options: '选项',
  dimension: '对比列',
  recommend: '推荐项',
  crux: '取决于',
  verdict: '结论行',
  weight: '可逆性',
  decider: '决定者',
}

/** A relayed reason that opens by naming the human repeats the 你（经对话） label; the display drops it, the stored entry keeps it. */
const RELAY_PREFIX = /^用户说?\s*[：:]\s*/

const EDGE_LABELS: Readonly<Record<EdgeType, string>> = {
  depends: '依赖',
  source: '来源',
  supersedes: '取代',
}

/** What one history entry did, with its result where the entry carries one. */
function actionText(entry: HistoryEntry): string {
  const label = (labels: Readonly<Record<string, string>>, key: string | undefined): string | undefined => key === undefined ? undefined : labels[key]
  const status = label(STATUS_LABELS, entry.to)
  if (entry.op === 'status' && status !== undefined) return `改为「${status}」`
  const verification = label(VERIFICATION_LABELS, entry.to)
  if (entry.op === 'verify' && verification !== undefined) return `验证为「${verification}」`
  if ((entry.op === 'link' || entry.op === 'unlink') && entry.edge !== undefined) return `${OP_LABELS[entry.op]} ${EDGE_LABELS[entry.edge.type]} → ${entry.edge.to}`
  if (entry.op === 'supersede' && entry.by !== undefined) return `被 ${entry.by} 取代`
  if (entry.op === 'supersede' && entry.edge !== undefined) return `取代 ${entry.edge.to}`
  const { changes } = entry
  const fields = changes === undefined ? '' : EDITABLE_FIELDS.filter(field => changes[field] !== undefined).map(field => FIELD_LABELS[field]).join('、')
  return `${OP_LABELS[entry.op]}${fields}${entry.option === undefined ? '' : ` ${entry.option}`}`
}

/**
 * One history entry as the detail view says it: who wrote it, and what
 * happened with the reason. A status change and a verify say the new
 * state, a link names the edge, a supersede the other node; an edit names
 * the fields it changed, in write order. The relay itself is shown apart,
 * as a quote.
 */
export function historyText(entry: HistoryEntry): { readonly who: string, readonly what: string } {
  const who = entry.relay !== undefined ? '你（经对话）' : entry.actor === 'human' ? '你' : entry.actor === 'llm' ? 'agent' : ACTOR_LABELS[entry.actor]
  if (entry.op === 'comment') return { who, what: `批注：${entry.text ?? ''}` }
  const action = actionText(entry)
  const reason = entry.relay === undefined ? entry.reason : entry.reason?.replace(RELAY_PREFIX, '')
  return { who, what: reason === undefined || reason.length === 0 ? action : `${action}：${reason}` }
}

/**
 * Who works on a task, as its run controls say it. The panel sees only the
 * agents of its own session (the main agent and its subagents), so an
 * empty list means nobody in this DSH session; a task marked in progress
 * may be worked on elsewhere. A done task needs no such line.
 */
export function presenceText(status: GraphNode['status'], names: readonly string[]): string | undefined {
  if (names.length > 0) return `在这里干活：${names.join('、')}`
  if (status === 'done') return undefined
  const none = '这个 DSH 会话里没有 agent 在做它'
  return status === 'doing' ? `${none}；状态是进行中，活可能在别的会话或 DSH 之外` : none
}

/** A token count the way DSH's composer stats write it (dsh-client-ui-chat formatTokens): 517, 12.2K, 517K, 1.2M; the caller adds tok. */
export function tokensText(value: number): string {
  const scaled = (count: number): string => count >= 100 ? String(Math.round(count)) : String(Math.round(count * 10) / 10)
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${scaled(value / 1000)}K`
  return `${scaled(value / 1_000_000)}M`
}

/** What 现场 lists, given the session's agents (main first). */
export interface LiveGroups<T> {
  readonly running: readonly T[]
  /** One quiet line each: the idle main agent always, stopped children while nothing runs. */
  readonly quiet: readonly T[]
  /** Behind one toggle: stopped children while something runs, and children from before this app start. */
  readonly folded: readonly T[]
}

/**
 * Group 现场's agents. The idle main agent is never folded: with background
 * dispatch it is the normal state while a child runs, and it is the agent
 * waiting for the human. Children without a live view ran before this
 * start of the app and carry no data.
 */
export function liveGroups<T extends { readonly main: boolean, readonly running: boolean, readonly view: unknown }>(agents: readonly T[]): LiveGroups<T> {
  const running = agents.filter(agent => agent.running)
  const idleMain = agents.filter(agent => agent.main && !agent.running && agent.view !== undefined)
  const stopped = agents.filter(agent => !agent.main && !agent.running && agent.view !== undefined)
  const earlier = agents.filter(agent => !agent.main && agent.view === undefined)
  return running.length > 0
    ? { running, quiet: idleMain, folded: [...stopped, ...earlier] }
    : { running, quiet: [...idleMain, ...stopped], folded: earlier }
}

/** The local date and minute of an ISO timestamp, for the tooltip of a relative time. */
export function absoluteTime(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "3 分钟前" style time for the lists; absolute date beyond a week. */
export function timeAgo(at: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000))
  if (seconds < 60) return '刚刚'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} 天前`
  return at.slice(0, 10)
}
