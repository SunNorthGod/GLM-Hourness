/**
 * What a takeover reads from the project graph (takeover design 0.6 §4.2,
 * §5.8, §7.1), all pure: the anchor goal the norms hang under, what an
 * existing graph lacks, and the nodes proposed since the takeover opened.
 * The checker gap of §5.8 (a top code extension no check line covers) needs
 * M4's check line parser and joins with it.
 */
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode, NodeType } from '../graph/schema.ts'
import { NORM_TEMPLATES } from './templates.ts'

const MERGE_GATE_ID = 'norm-merge-gate'
const FLOOR_ID = 'norm-review-floor'
const ENV_ID = 'env'

/** One thing an existing graph lacks, and the type its fixed id must have. */
interface Gap {
  readonly id: string
  readonly type: NodeType
  /** Who fills it: the harness proposes the norm templates, the main agent the rest. */
  readonly by: 'harness' | 'agent'
}

const FIXED: readonly Gap[] = [
  ...NORM_TEMPLATES.map(template => ({ id: template.id, type: 'norm' as const, by: 'harness' as const })),
  { id: MERGE_GATE_ID, type: 'norm', by: 'agent' },
  { id: ENV_ID, type: 'feature', by: 'agent' },
  { id: FLOOR_ID, type: 'norm', by: 'agent' },
]

export interface Gaps {
  readonly missing: readonly Gap[]
  /** Fixed ids the human dropped or that were superseded: not a gap (proposing again conflicts), named in the result. */
  readonly rejected: readonly { readonly id: string, readonly title: string }[]
  /** Fixed ids of another type: left alone, named in the result. */
  readonly wrongType: readonly { readonly id: string, readonly type: NodeType }[]
}

/** What an existing graph lacks of the fixed nodes (§5.8). */
export function gapsOf(graph: LoadedGraph): Gaps {
  const missing: Gap[] = []
  const rejected: Array<{ id: string, title: string }> = []
  const wrongType: Array<{ id: string, type: NodeType }> = []
  for (const gap of FIXED) {
    const node = graph.nodes.get(gap.id)
    if (node === undefined) missing.push(gap)
    else if (node.type !== gap.type) wrongType.push({ id: gap.id, type: node.type })
    else if (node.status === 'dropped' || node.status === 'superseded') rejected.push({ id: gap.id, title: node.title })
  }
  return { missing, rejected, wrongType }
}

/** When a node was first proposed: its first history entry, when that is a `propose`. */
function proposedAt(node: GraphNode): string | undefined {
  const first = node.history[0]
  return first?.op === 'propose' ? first.at : undefined
}

/** The goal a node is under (itself for a goal); undefined when its parent chain has none. */
function goalOf(graph: LoadedGraph, node: GraphNode): string | undefined {
  const seen = new Set<string>()
  for (let current: GraphNode | undefined = node; current !== undefined && !seen.has(current.id); current = current.parent === undefined ? undefined : graph.nodes.get(current.parent)) {
    if (current.type === 'goal') return current.id
    seen.add(current.id)
  }
  return undefined
}

/**
 * The anchor goal (§4.2): the goal of a fixed norm already on the graph;
 * otherwise the goal first proposed since the takeover opened (ties by id);
 * otherwise none yet.
 */
export function anchorOf(graph: LoadedGraph, openedAt: string): string | undefined {
  for (const template of NORM_TEMPLATES) {
    const node = graph.nodes.get(template.id)
    if (node !== undefined) return goalOf(graph, node)
  }
  const goals = [...graph.nodes.values()]
    .filter(node => node.type === 'goal')
    .map(node => ({ id: node.id, at: proposedAt(node) }))
    .filter((goal): goal is { id: string, at: string } => goal.at !== undefined && goal.at >= openedAt)
    .sort((a, b) => a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at))
  return goals[0]?.id
}

/** Whether a goal was first proposed at or after `openedAt`. */
export function proposedSinceOpen(graph: LoadedGraph, goalId: string, openedAt: string): boolean {
  const node = graph.nodes.get(goalId)
  const at = node === undefined ? undefined : proposedAt(node)
  return at !== undefined && at >= openedAt
}

/** The nodes still proposed that were first proposed since the takeover opened, counted by type (§7.1's set, without its order and duplicates). */
export function proposedSince(graph: LoadedGraph, openedAt: string): { readonly total: number, readonly byType: Readonly<Record<string, number>> } {
  const byType: Record<string, number> = {}
  let total = 0
  for (const node of graph.nodes.values()) {
    const at = proposedAt(node)
    if (node.status !== 'proposed' || at === undefined || at < openedAt) continue
    byType[node.type] = (byType[node.type] ?? 0) + 1
    total += 1
  }
  return { total, byType }
}
