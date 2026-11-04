/**
 * Graph-wide checks (docs/ORCHESTRATION.md §2.6; user-graph rules V1, V3,
 * V4 and the target-side halves of V6 from design 0.4.1 §3.3): parents and
 * edge targets exist, decomposition and dependencies have no cycles, user
 * nodes hang in their hierarchy and their edges stay inside it. Per-node
 * rules live in format.ts.
 */
import { compareText, nodeFile, type GraphIssue } from './format.ts'
import { type GraphNode, type NodeType } from './schema.ts'

/** The parent type a user node hangs under (design 0.4.1 §3.3 V1): a role under a goal, a flow under a role, a step under a flow. */
const USER_PARENTS: Readonly<Record<'role' | 'flow' | 'step', NodeType>> = { role: 'goal', flow: 'role', step: 'flow' }

/** The root id of the parent chain, cut at a loop or a missing node (the decomposition cycle check reports the loop). */
function rootOf(nodes: ReadonlyMap<string, GraphNode>, id: string): string {
  let current: string | undefined = id
  const seen = new Set<string>()
  let last = id
  while (current !== undefined && nodes.has(current) && !seen.has(current)) {
    seen.add(current)
    last = current
    current = nodes.get(current)!.parent
  }
  return last
}

/** Rotate a cycle so it starts at its smallest id, then close it: a -> b -> a. */
function describeCycle(cycle: readonly string[]): { readonly start: string, readonly text: string } {
  const start = [...cycle].sort(compareText)[0]
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
    else if (node.parent !== undefined && node.type === 'role' && nodes.get(node.parent)!.type !== USER_PARENTS.role) {
      issues.push({ severity: 'error', file, field: 'parent', message: `a role hangs under a goal, not a ${nodes.get(node.parent)!.type}` })
    }
    else if (node.parent !== undefined && node.type === 'flow' && nodes.get(node.parent)!.type !== USER_PARENTS.flow) {
      issues.push({ severity: 'error', file, field: 'parent', message: `a flow hangs under a role, not a ${nodes.get(node.parent)!.type}` })
    }
    else if (node.parent !== undefined && node.type === 'step' && nodes.get(node.parent)!.type !== USER_PARENTS.step) {
      issues.push({ severity: 'error', file, field: 'parent', message: `a step hangs under a flow, not a ${nodes.get(node.parent)!.type}` })
    }
    node.edges?.forEach((edge, index) => {
      const field = `edges[${index}].to`
      if (edge.to === id) issues.push({ severity: 'error', file, field, message: 'an edge cannot point at its own node' })
      else if (!nodes.has(edge.to)) issues.push({ severity: 'error', file, field, message: `unknown node "${edge.to}"` })
      else {
        const target = nodes.get(edge.to)!
        // V6, target side: a user node is never a dependency and never the reason a node exists, except a question it grew from.
        if (edge.type === 'depends' && (target.type === 'role' || target.type === 'flow' || target.type === 'step')) {
          issues.push({ severity: 'error', file, field, message: `a depends edge cannot point at a ${target.type}` })
        }
        if (edge.type === 'source' && (target.type === 'role' || target.type === 'flow' || target.type === 'step')) {
          issues.push({ severity: 'error', file, field, message: `a source edge cannot point at a ${target.type}` })
        }
        if (edge.type === 'source' && (node.type === 'role' || node.type === 'flow' || node.type === 'step') && target.type !== 'question') {
          issues.push({ severity: 'error', file, field, message: `a ${node.type} exists because of a question, not a ${target.type}` })
        }
        // V3, target side: serves points at a step of the same goal.
        if (edge.type === 'serves' && target.type !== 'step') {
          issues.push({ severity: 'error', file, field, message: `a serves edge points at a ${target.type}, not a step` })
        }
        if (edge.type === 'serves' && target.type === 'step' && rootOf(nodes, id) !== rootOf(nodes, edge.to)) {
          issues.push({ severity: 'error', file, field, message: `a serves edge may not cross goals: "${id}" and "${edge.to}" sit under different goals` })
        }
        // V4, target side: next points at a step of the same flow; a flow's entry is a step of its own.
        if (edge.type === 'next' && target.type !== 'step') {
          issues.push({ severity: 'error', file, field, message: `a next edge points at a ${target.type}, not a step` })
        }
        if (edge.type === 'next' && target.type === 'step') {
          if (node.type === 'step' && target.parent !== node.parent) {
            issues.push({ severity: 'error', file, field, message: `a step's next edge stays inside its flow: "${edge.to}" hangs under "${target.parent ?? 'nothing'}", not "${node.parent ?? 'nothing'}"` })
          }
          if (node.type === 'flow' && target.parent !== node.id) {
            issues.push({ severity: 'error', file, field, message: `a flow's entry is one of its own steps: "${edge.to}" hangs under "${target.parent ?? 'nothing'}"` })
          }
        }
      }
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
