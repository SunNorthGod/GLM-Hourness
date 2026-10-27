/**
 * glm-hourness/graph row entry (docs/ORCHESTRATION.md §2.5, §2.7, §2.10):
 * registers the project graph tools (tools.ts) globally, so every agent on
 * every route has the right path; installs the guard rule that denies
 * direct writes into the graph directory (src/guard/graph-files.ts), which
 * points at those tools; and at agent creation installs the step
 * projection (reminder.ts) for the focus node an agent sets with
 * graph_focus. Ships disabled in cordis.patch.yml until the sandbox run
 * (L3). Activation never throws: a bad config or a failed registration
 * warns and leaves the row a no-op (no tools, no guard rule, no
 * projection); a configured absolute directory that does not exist yet
 * warns, and the tools and the projection report it until it exists.
 */
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { installGraphFileGuard } from '../guard/graph-files.ts'
import type { AgentLike, PreExecuteListener, ToolsLike } from '../shared/dsh-min.ts'
import { installProjection } from './reminder.ts'
import { DEFAULT_GRAPH_DIR, graphTools, resolveGraphDir, type FocusMemory } from './tools.ts'

export interface GraphConfig {
  /** Graph directory: absolute, or relative to the session working directory. Default docs/graph. */
  readonly dir?: string
}

/** The row's context: the injected tools service, the agent lifecycle event and the tool-call gate. */
export interface GraphContext {
  readonly tools: Pick<ToolsLike, 'register'>
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
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
  const focuses: FocusMemory = new Map()
  try {
    for (const tool of graphTools(dir, focuses)) disposers.push(ctx.tools.register(tool))
  }
  catch (error) {
    dispose()
    console.warn(`${name}: registering the graph tools failed, the row stays off: ${error instanceof Error ? error.message : String(error)}`)
    return () => {}
  }
  disposers.push(installGraphFileGuard(ctx, cwd => resolveGraphDir(dir, cwd)))
  const installed = new WeakSet<AgentLike>()
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      const uninstall = installProjection(agent, dir, focuses)
      if (uninstall !== undefined) disposers.push(uninstall)
    }
    catch (error) {
      // One agent's projection must never break agent creation; its tools still work.
      console.warn(`${name}: step projection not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
  return dispose
}
