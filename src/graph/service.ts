/**
 * What the glm-hourness/graph row tells other rows about the project graph
 * (docs/ORCHESTRATION.md §2.7, §6.4), as the cordis service
 * `glmHournessGraph` it provides while it is active. The guard row reads it
 * through `ctx.get`: the shadow fallback counts graph tool writes as known
 * changes, and the GLM rule section declares graph-files-only. The design row
 * reads the focus of a session through it. Each reader checks only the
 * members it calls. No load order and no shared module instance are needed,
 * and the service leaves with the graph row's fiber.
 */
import type { ServiceLookup, SessionLike } from '../shared/dsh-min.ts'

export const GRAPH_SERVICE = 'glmHournessGraph'

/** The members the guard row and the design row's /wish read. */
export interface GraphService {
  /** The graph directory for a session working directory; undefined when there is none to resolve against. */
  dirFor(cwd: string | undefined): string | undefined
  /** Whether a tool is one of the graph tools. */
  isGraphTool(name: string): boolean
}

/** The members a reader of a session's focus calls. */
export interface GraphFocusService {
  dirFor(cwd: string | undefined): string | undefined
  /**
   * The node a session has in focus, read the way the step projection reads
   * it: the latest successful graph_focus call or projection notice in the
   * session's visible history, else the focus graph_focus kept in memory.
   * It only reads: the memory is written by the tool and the projection.
   */
  focusOf(session: SessionLike): string | undefined
}

function serviceOf(ctx: ServiceLookup): Record<string, unknown> | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(GRAPH_SERVICE) : undefined
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

/** The graph row's service, when the row is active. */
export function graphService(ctx: ServiceLookup): GraphService | undefined {
  const service = serviceOf(ctx)
  return typeof service?.dirFor === 'function' && typeof service.isGraphTool === 'function' ? service as unknown as GraphService : undefined
}

/** The graph row's service for a reader of focus, when the row is active and provides `focusOf`. */
export function graphFocus(ctx: ServiceLookup): GraphFocusService | undefined {
  const service = serviceOf(ctx)
  return typeof service?.dirFor === 'function' && typeof service.focusOf === 'function' ? service as unknown as GraphFocusService : undefined
}
