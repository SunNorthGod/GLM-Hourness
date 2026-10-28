/**
 * Pure helpers of the project graph panel: revisions with Web Crypto, the
 * node filters of the graph view, and the labels the views show. No DOM
 * and no DSH service, so the specs run them under Node.
 */
import { compareText } from '../../../src/graph/format.ts'
import { STATUS_LABELS } from '../../../src/graph/labels.ts'
import { revisionInput, type LoadedGraph } from '../../../src/graph/parse.ts'
import { OPEN_STATUSES, deciderOf, waitsForHuman, type DecisionRecord } from '../../../src/graph/projection.ts'
import type { GraphNode } from '../../../src/graph/schema.ts'

/** First 12 hex digits of the SHA-256 of some bytes: the revision store.ts computes with node:crypto. */
export async function revisionOfBytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
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
  return STATUS_LABELS[node.status]
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

/** Closed and total direct children of a node. */
export function progressOf(graph: LoadedGraph, id: string): { readonly done: number, readonly total: number } {
  let done = 0
  let total = 0
  for (const node of graph.nodes.values()) {
    if (node.parent !== id || node.status === 'dropped' || node.status === 'superseded') continue
    total++
    if (node.status === 'done') done++
  }
  return { done, total }
}

/** The goal the panel names in its header: the first goal by id that is not closed, else the first goal. */
export function headlineGoal(graph: LoadedGraph): GraphNode | undefined {
  const goals = [...graph.nodes.values()].filter(node => node.type === 'goal').sort((a, b) => compareText(a.id, b.id))
  return goals.find(node => OPEN_STATUSES.has(node.status)) ?? goals[0]
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
