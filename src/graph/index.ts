/**
 * glm-hourness/graph row entry (docs/ORCHESTRATION.md §2.5, §2.7, §2.10):
 * registers the project graph tools (tools.ts) globally, so every agent on
 * every route has the right path; installs the guard rule that denies
 * direct writes into the graph directory (src/guard/graph-files.ts), which
 * points at those tools, and journals its denials in the violation journal
 * of the project directory (the row's home, else the data service's); and
 * at agent creation installs the step projection (reminder.ts) for the
 * focus node an agent sets with graph_focus. It hands the loop board its
 * third-rework entry (loop-entry.ts, m4 design §6.8) and reports the
 * questions filed under it to the board. The estimates the graph tools
 * write on the check lines of a tool node under env go to the timing journal
 * of the caller's project (src/env/timeout.ts, m4 design §6.3.1). It provides its row health
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
import { projectJournal, type AuditFs } from '../memory/audit.ts'
import { projectHomeFor, projectRootOf } from '../data/project-home.ts'
import { ensureLlmIgnored } from '../data/llm-ignore.ts'
import { appendTiming } from '../env/timeout.ts'
import type { AgentLike, DerivedMessage, PreExecuteListener, ProvideHost, ServiceLookup, SessionEventLike, SessionLike, ToolDefinitionLike, ToolExecutionContext, ToolsLike } from '../shared/dsh-min.ts'
import { GRAPH_SERVICE, type GraphFocusService, type GraphService } from './service.ts'
import { provideRowHealth, sessionIdOf, type RowHealth } from '../shared/health.ts'
import { focusFromHistory, installProjection } from './reminder.ts'
import { graphHealth, readGraph } from './row-health.ts'
import { installLoopEntry } from './loop-entry.ts'
import { loopsService, type LoopsService } from '../loops/service.ts'
import { DEFAULT_GRAPH_DIR, graphTools, resolveGraphDir, type EstimateSink, type FocusMemory } from './tools.ts'

export interface GraphConfig {
  /** Graph directory: absolute, or relative to the session working directory. Default docs/graph. */
  readonly dir?: string
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the data service's. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs
}

/** The row's context: the injected tools service, the agent lifecycle event, the session observers, the tool-call gate and service provision. */
export interface GraphContext extends ServiceLookup, Partial<ProvideHost> {
  readonly tools: Pick<ToolsLike, 'register'>
  /**
   * cordis inject, when the host has it. The loop board's service is
   * package-provided, so the row reaches it by name, not through the host's
   * typed service table (m4 design §6.8).
   */
  inject?(names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void): unknown
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
  /** The gate's row journal flushes on a disposed session (m4-gate G1); the follow-up recorder hooks the other observer with G2. */
  on(event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void
  on(event: 'session/disposed', listener: (session: SessionLike) => void): () => void
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

function provideService(ctx: GraphContext, dir: string, names: ReadonlySet<string>, focuses: FocusMemory): () => void {
  if (typeof ctx.provide !== 'function') return () => {}
  const service: GraphService & GraphFocusService = Object.freeze({
    dirFor: (cwd: string | undefined) => resolveGraphDir(dir, cwd),
    isGraphTool: (tool: string) => names.has(tool),
    focusOf: (session: SessionLike) => focusFromHistory(session.deriveMessages() as readonly DerivedMessage[]) ?? focuses.get(session.id),
  })
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
  const where = isAbsolute(dir) ? dir : `${dir}（按会话工作目录解析）`
  const toldBoard = new Set<string>()
  /** Warn once and keep it on the row health: the board refuses, or a run could not be recorded. Asking goes on either way (m4 design §6.8). */
  const boardProblem = (message: string, sessionId?: string): void => {
    console.warn(`${name}: ${message}`)
    if (sessionId === undefined) health.reactivate('degraded', message)
    else health.note(sessionId, 'graph-loop-entry', message)
  }
  /** The loop board's service by name, read per use; a wrong shape is a board problem, not a graph one. */
  const loops = (): LoopsService | undefined => loopsService(ctx, message => {
    if (toldBoard.has(message)) return
    toldBoard.add(message)
    boardProblem(message)
  })
  /**
   * The estimates a propose or edit of a tool node under env wrote go to the timing journal of the caller's project, the
   * one the env row reads (m4 design §6.3.1; not the row's `home`, so both rows keep one journal). A failed write is a
   * row-health note of the session; the tool result does not wait for it.
   */
  const estimates: EstimateSink = (line, cwd) => {
    void (async () => {
      const home = projectHomeFor(ctx, undefined, cwd)
      if (home === undefined) throw new Error('这个会话没有项目目录')
      const root = projectRootOf(cwd)
      if (root !== undefined) await ensureLlmIgnored(root)
      await appendTiming(home, line)
    })().catch((error: unknown) => {
      const message = `检查的估计没记下：${error instanceof Error ? error.message : String(error)}`
      console.warn(`${name}: ${message}`)
      health.note(line.session, 'graph-timing', message)
    })
  }
  const tools = graphTools(dir, focuses, { loops, problem: boardProblem }, estimates)
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
  // The violation journal of the calling session's project (m4-gate G1, design §2.4).
  const journal = projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd), config.fs)
  disposers.push(installGraphFileGuard(ctx, cwd => resolveGraphDir(dir, cwd), (record, cwd) => journal.violation(record, cwd), health))
  disposers.push(provideService(ctx, dir, new Set(tools.map(tool => tool.name)), focuses))
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
  // The third-rework entry on the loop board (m4 design §6.8): through inject when the host has it, else per agent/created — after the projection's listener, which stays the first.
  disposers.push(installLoopEntry(ctx, boardProblem))
  return dispose
}
