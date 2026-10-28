/**
 * Row health of glm-hourness/graph in one session (docs/DESIGN.md §2.5):
 * whether the graph directory was found, whether the graph has validation
 * errors, and whether the session set a focus node. The row reports it
 * after every graph tool call and every step projection read
 * (src/shared/health.ts).
 */
import type { HealthState } from '../shared/health.ts'
import type { Failure } from './mutation.ts'
import type { LoadedGraph } from './parse.ts'
import { loadGraph } from './store.ts'
import { locateGraph } from './tools.ts'

/** What one read of the graph found: the directory and the graph, or why there is none. */
export type GraphRead = { readonly dir: string, readonly graph: LoadedGraph } | { readonly failure: Failure }

export function graphHealth(read: GraphRead, focus: string | undefined): [HealthState, string] {
  if ('failure' in read) return ['degraded', `图目录找不到：${read.failure.error.message}；图工具报 not_found`]
  const errors = read.graph.issues.filter(issue => issue.severity === 'error').length
  const where = `图 ${read.dir}，${read.graph.nodes.size} 个节点`
  const focused = focus === undefined ? '还没设焦点（graph_focus）' : `焦点 ${focus}${read.graph.nodes.has(focus) ? '' : '（不在图里）'}`
  if (errors > 0) return ['degraded', `${where}；${errors} 处校验错误，写入一律被拒；${focused}`]
  return ['active', `${where}；${focused}`]
}

/** Locate and load the graph of a session working directory. */
export async function readGraph(configured: string, cwd: string | undefined): Promise<GraphRead> {
  const located = await locateGraph(configured, cwd)
  if (typeof located !== 'string') return { failure: located }
  return { dir: located, graph: await loadGraph(located) }
}
