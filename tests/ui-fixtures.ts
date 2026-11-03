/**
 * Shared pieces of the client model specs (flow-bar, wish-entry): graph nodes
 * and the snapshot the panel's graph source would hold for them.
 */
import type { LoadedGraph } from '../src/graph/parse.ts'
import { listOpenItems } from '../src/graph/projection.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { GraphSnapshot } from '../ui/src/graph/source.ts'

/** A node of the given type, approved unless the fields say otherwise; its one history entry is the proposal. */
export function node(id: string, type: GraphNode['type'], fields: Partial<GraphNode> = {}): GraphNode {
  const status = fields.status ?? 'approved'
  return { id, type, title: id, status, history: [{ at: '2026-10-30T08:00:00.000Z', actor: 'llm', op: 'propose', reason: 'fixture', to: status }], ...fields }
}

/** The ready snapshot of a graph made of these nodes. */
export function readySnapshot(...nodes: readonly GraphNode[]): Extract<GraphSnapshot, { status: 'ready' }> {
  const graph: LoadedGraph = {
    nodes: new Map(nodes.map(entry => [entry.id, entry])),
    revisions: new Map(nodes.map(entry => [entry.id, 'rev'])),
    revision: 'rev',
    issues: [],
  }
  return { status: 'ready', graph, items: listOpenItems(graph), live: false, unreadable: [] }
}
