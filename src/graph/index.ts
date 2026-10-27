/**
 * glm-hourness/graph row entry (docs/ORCHESTRATION.md §2.10): registers the
 * project graph tools (tools.ts) globally, so every agent on every route
 * has the right path that the graph guard points to. Ships disabled in
 * cordis.patch.yml until the sandbox run (L3). Activation never throws: a
 * bad config or a failed registration warns and leaves the row a no-op; a
 * configured absolute directory that does not exist yet warns, and the
 * tools report it on every call until it exists.
 */
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { ToolsLike } from '../shared/dsh-min.ts'
import { DEFAULT_GRAPH_DIR, graphTools } from './tools.ts'

export interface GraphConfig {
  /** Graph directory: absolute, or relative to the session working directory. Default docs/graph. */
  readonly dir?: string
}

/** The row's context: the injected tools service. */
export interface GraphContext {
  readonly tools: Pick<ToolsLike, 'register'>
}

/** cordis plugin identity: needs the tools service. */
export const name = 'dsh-glm-hourness/graph'
export const inject = ['tools']

/** cordis plugin entry. */
export function apply(ctx: GraphContext, config: GraphConfig = {}): () => void {
  const dir: unknown = config.dir ?? DEFAULT_GRAPH_DIR
  if (typeof dir !== 'string' || dir.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; the graph tools stay off`)
    return () => {}
  }
  if (isAbsolute(dir) && !existsSync(dir)) {
    console.warn(`${name}: the graph directory ${dir} does not exist; the graph tools report it until it does`)
  }
  const disposers: Array<() => void> = []
  const dispose = (): void => {
    for (const disposer of disposers.splice(0).reverse()) disposer()
  }
  try {
    for (const tool of graphTools(dir)) disposers.push(ctx.tools.register(tool))
  }
  catch (error) {
    dispose()
    console.warn(`${name}: registering the graph tools failed, the row stays off: ${error instanceof Error ? error.message : String(error)}`)
    return () => {}
  }
  return dispose
}
