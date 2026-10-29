/**
 * glm-hourness/graph row entry (docs/ORCHESTRATION.md §2.5, §2.7, §2.10):
 * registers the project graph tools (tools.ts) globally, so every agent on
 * every route has the right path; installs the guard rule that denies
 * direct writes into the graph directory (src/guard/graph-files.ts), which
 * points at those tools, and journals its denials in the violation journal
 * of the project directory (the row's home, else the data service's); and
 * at agent creation installs the step projection (reminder.ts) for the
 * focus node an agent sets with graph_focus. It provides its row health
 * (row-health.ts, reported after every graph tool call and projection
 * read) and the service other rows read (src/graph/service.ts: the
 * guard's shadow fallback and rule declaration). Activation never throws:
 * a bad config or a failed registration warns and leaves the row a no-op
 * (no tools, no guard rule, no projection) with its health inactive; a
 * configured absolute directory that does not exist yet warns, and the
 * tools and the projection report it until it exists.
 */
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { installGraphFileGuard } from '../guard/graph-files.ts'
import { rowJournal, type AuditFs } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentLike, PreExecuteListener, ProvideHost, ServiceLookup, ToolDefinitionLike, ToolExecutionContext, ToolsLike } from '../shared/dsh-min.ts'
import { GRAPH_SERVICE, type GraphService } from './service.ts'
import { provideRowHealth, sessionIdOf, type RowHealth } from '../shared/health.ts'
import { installProjection } from './reminder.ts'
import { graphHealth, readGraph } from './row-health.ts'
import { DEFAULT_GRAPH_DIR, graphTools, resolveGraphDir, type FocusMemory } from './tools.ts'

export interface GraphConfig {
  /** Graph directory: absolute, or relative to the session working directory. Default docs/graph. */
  readonly dir?: string
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the data service's. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs
}

/** The row's context: the injected tools service, the agent lifecycle event, the tool-call gate and service provision. */
export interface GraphContext extends ServiceLookup, Partial<ProvideHost> {
  readonly tools: Pick<ToolsLike, 'register'>
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
}

/** cordis plugin identity: needs the tools service. */
export const name = 'dsh-glm-hourness/graph'
export const inject = ['tools']

/** A graph tool that reports the row health of the caller's session after every call, failed ones too. */
function reporting(tool: ToolDefinitionLike, dir: string, focuses: FocusMemory, health: RowHealth): ToolDefinitionLike {
  return {
    ...tool,
    async execute(args, exec) {
      try {
        return await tool.execute(args, exec)
      }
      finally {
        const agent = (exec as ToolExecutionContext | undefined)?.agent
        const sessionId = sessionIdOf(agent)
        if (sessionId !== undefined) {
          try {
            health.report(sessionId, ...graphHealth(await readGraph(dir, agent?.session?.header.cwd), focuses.get(sessionId)))
          }
          catch (error) {
            health.report(sessionId, 'degraded', `读图失败：${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
    },
  }
}

function provideService(ctx: GraphContext, dir: string, names: ReadonlySet<string>): () => void {
  if (typeof ctx.provide !== 'function') return () => {}
  const service: GraphService = Object.freeze({ dirFor: (cwd: string | undefined) => resolveGraphDir(dir, cwd), isGraphTool: (tool: string) => names.has(tool) })
  try {
    return ctx.provide(GRAPH_SERVICE, service)
  }
  catch (error) {
    console.warn(`${name}: the graph service is not provided (the guard counts graph writes as unknown): ${error instanceof Error ? error.message : String(error)}`)
    return () => {}
  }
}

/** cordis plugin entry. */
export function apply(ctx: GraphContext, config: GraphConfig = {}): () => void {
  const dir: unknown = config.dir ?? DEFAULT_GRAPH_DIR
  if (typeof dir !== 'string' || dir.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; the graph tools stay off`)
    const off = provideRowHealth(ctx, 'graph', 'inactive', 'config.dir 不是非空路径，图工具未注册')
    return () => { off.dispose() }
  }
  const missing = isAbsolute(dir) && !existsSync(dir)
  if (missing) {
    console.warn(`${name}: the graph directory ${dir} does not exist; the graph tools report it until it does`)
  }
  const disposers: Array<() => void> = []
  const dispose = (): void => {
    for (const disposer of disposers.splice(0).reverse()) disposer()
  }
  const focuses: FocusMemory = new Map()
  const tools = graphTools(dir, focuses)
  const where = isAbsolute(dir) ? dir : `${dir}（按会话工作目录解析）`
  const health = provideRowHealth(ctx, 'graph', missing ? 'degraded' : 'active', missing ? `图工具已注册（${tools.length} 个）；图目录 ${dir} 还不存在` : `图工具已注册（${tools.length} 个）；图目录 ${where}`)
  disposers.push(() => { health.dispose() })
  try {
    for (const tool of tools) disposers.push(ctx.tools.register(reporting(tool, dir, focuses, health)))
  }
  catch (error) {
    dispose()
    console.warn(`${name}: registering the graph tools failed, the row stays off: ${error instanceof Error ? error.message : String(error)}`)
    const off = provideRowHealth(ctx, 'graph', 'inactive', `图工具注册失败：${error instanceof Error ? error.message : String(error)}`)
    return () => { off.dispose() }
  }
  const journal = rowJournal(name, () => dataHomes(ctx, config.home), config.fs)
  disposers.push(installGraphFileGuard(ctx, cwd => resolveGraphDir(dir, cwd), record => { void journal.violation(record) }))
  disposers.push(provideService(ctx, dir, new Set(tools.map(tool => tool.name))))
  const installed = new WeakSet<AgentLike>()
  disposers.push(ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    installed.add(agent)
    try {
      const uninstall = installProjection(agent, dir, focuses, (sessionId, read, focus) => { health.report(sessionId, ...graphHealth(read, focus)) })
      if (uninstall !== undefined) disposers.push(uninstall)
    }
    catch (error) {
      // One agent's projection must never break agent creation; its tools still work.
      console.warn(`${name}: step projection not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }))
  return dispose
}
