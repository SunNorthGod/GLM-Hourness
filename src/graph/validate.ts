/**
 * Graph-wide checks (docs/ORCHESTRATION.md §2.6): parents and edge targets
 * exist, decomposition and dependencies have no cycles. Per-node rules live
 * in format.ts.
 */
import { compareText, nodeFile, type GraphIssue } from './format.ts'
import type { GraphNode } from './schema.ts'

/** Rotate a cycle so it starts at its smallest id, then close it: a -> b -> a. */
function describeCycle(cycle: readonly string[]): { readonly start: string, readonly text: string } {
  const start = [...cycle].sort(compareText)[0]!
  const offset = cycle.indexOf(start)
  const rotated = [...cycle.slice(offset), ...cycle.slice(0, offset), start]
  return { start, text: rotated.join(' -> ') }
}

export function validateGraph(nodes: ReadonlyMap<string, GraphNode>): GraphIssue[] {
  const issues: GraphIssue[] = []
  const ids = [...nodes.keys()].sort(compareText)

  for (const id of ids) {
    const node = nodes.get(id)!
    const file = nodeFile(id)
    if (node.parent !== undefined && !nodes.has(node.parent)) {
      issues.push({ severity: 'error', file, field: 'parent', message: `unknown node "${node.parent}"` })
    }
    node.edges?.forEach((edge, index) => {
      const field = `edges[${index}].to`
      if (edge.to === id) issues.push({ severity: 'error', file, field, message: 'an edge cannot point at its own node' })
      else if (!nodes.has(edge.to)) issues.push({ severity: 'error', file, field, message: `unknown node "${edge.to}"` })
    })
  }

  // Decomposition: follow each parent chain until it leaves the graph or reaches a settled node.
  const settled = new Set<string>()
  for (const start of ids) {
    const path: string[] = []
    const position = new Map<string, number>()
    let current: string | undefined = start
    while (current !== undefined && nodes.has(current) && !settled.has(current)) {
      const seen = position.get(current)
      if (seen !== undefined) {
        const cycle = describeCycle(path.slice(seen))
        issues.push({ severity: 'error', file: nodeFile(cycle.start), field: 'parent', message: `decomposition cycle: ${cycle.text}` })
        break
      }
      position.set(current, path.length)
      path.push(current)
      current = nodes.get(current)!.parent
    }
    for (const id of path) settled.add(id)
  }

  // Dependencies: depth-first search; an edge back into the active stack closes a cycle.
  const state = new Map<string, 'active' | 'done'>()
  const stack: string[] = []
  const visit = (id: string): void => {
    state.set(id, 'active')
    stack.push(id)
    for (const edge of nodes.get(id)!.edges ?? []) {
      if (edge.type !== 'depends' || edge.to === id || !nodes.has(edge.to)) continue
      const next = state.get(edge.to)
      if (next === 'active') {
        const cycle = describeCycle(stack.slice(stack.indexOf(edge.to)))
        issues.push({ severity: 'error', file: nodeFile(cycle.start), field: 'edges', message: `dependency cycle: ${cycle.text}` })
      }
      else if (next === undefined) {
        visit(edge.to)
      }
    }
    stack.pop()
    state.set(id, 'done')
  }
  for (const id of ids) {
    if (!state.has(id)) visit(id)
  }
  return issues
}
