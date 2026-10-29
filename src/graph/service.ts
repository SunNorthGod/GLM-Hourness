/**
 * What the glm-hourness/graph row tells other rows about the project graph
 * (docs/ORCHESTRATION.md §2.7, §6.4), as the cordis service
 * `glmHournessGraph` it provides while it is active. The guard row reads it
 * through `ctx.get`: the shadow fallback counts graph tool writes as known
 * changes, and the GLM rule section declares graph-files-only. No load
 * order and no shared module instance are needed, and the service leaves
 * with the graph row's fiber.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'

export const GRAPH_SERVICE = 'glmHournessGraph'

/** The declaration line of graph-files-only, in the guard's GLM rule section and on the rule itself. */
export const GRAPH_FILES_DECLARATION = 'Change the project graph only with the graph tools; never write its files directly.'

export interface GraphService {
  /** The graph directory for a session working directory; undefined when there is none to resolve against. */
  dirFor(cwd: string | undefined): string | undefined
  /** Whether a tool is one of the graph tools. */
  isGraphTool(name: string): boolean
}

/** The graph row's service, when the row is active. */
export function graphService(ctx: ServiceLookup): GraphService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(GRAPH_SERVICE) : undefined
  if (typeof value !== 'object' || value === null) return undefined
  const service = value as Partial<GraphService>
  return typeof service.dirFor === 'function' && typeof service.isGraphTool === 'function' ? value as GraphService : undefined
}
