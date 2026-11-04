/**
 * liveOf (design 0.4.1 §2.5): a node is live when its status is neither
 * dropped nor superseded and no ancestor up to the goal is either. The
 * engine does not cascade (reject and status write one node), so every
 * derivation reads liveness instead of single statuses: state, counts,
 * gaps, release sets, the open-items filter and the panel's waiting
 * proposals. proposed, approved, doing and done are all live, so work in
 * progress and finished work serve their steps alike; the same function
 * reads steps, flows, features and tasks.
 *
 * Its own file, not engine.ts and not user-graph.ts, so the engine's write
 * rules, the pure derivations, the tools and the panel can share it without
 * importing each other. Not named live.ts: that name is taken on main by
 * the panel's live projection (src/graph/live.ts).
 */
import type { LoadedGraph } from './parse.ts'
import type { GraphNode } from './schema.ts'

export function liveOf(graph: LoadedGraph, node: GraphNode): boolean {
  const gone = (entry: GraphNode): boolean => entry.status === 'dropped' || entry.status === 'superseded'
  if (gone(node)) return false
  const seen = new Set<string>([node.id])
  let parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  while (parent !== undefined && !seen.has(parent.id)) {
    if (gone(parent)) return false
    seen.add(parent.id)
    parent = parent.parent === undefined ? undefined : graph.nodes.get(parent.parent)
  }
  return true
}
