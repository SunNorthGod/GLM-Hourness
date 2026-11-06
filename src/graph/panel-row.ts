/**
 * glm-hourness/graph-panel row entry (docs/ORCHESTRATION.md §2.10, §13):
 * the human's commands for the project graph panel in the DSH right
 * sidebar. The panel (ui/src) reads the node files through
 * remote.workspaceFiles and writes nothing; a slash command only ever comes
 * from the human (the composer), never from the model. The graph is the
 * configured dir (default docs/graph) under the invoking session's working
 * directory, resolved per call like the graph tools.
 *
 * /graph-run starts, stops or redoes the work on a task node
 * (run-control.ts); it sends the main agent a message, so it reaches the
 * model. Its input (`start task-3`) is short and is what the human typed,
 * so command/run records it. The panel carries no write command since
 * plain-ui (the panel only looks, d-ui-look-not-operate): /graph-apply had
 * no caller left and is gone.
 *
 * The row also registers the session projections the panel reads (live.ts;
 * hournessProject, which hands the client the main agent holder record's
 * absolute path so it can read it through remote.workspaceFiles, plain-ui
 * 1.3 §4.9), and takes the services the run controls read optionally:
 * sessionProjections (with the projections), agents and subagents
 * (stopping a child). Its row health is an activation status that changes
 * as those arrive or leave. Activation never throws.
 */
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandsHost, InjectableServices, InjectHost, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'
import { provideRowHealth } from '../shared/health.ts'
import { createStepMailbox } from '../shared/step-mailbox.ts'
import { LIVE_KEY, liveProjection } from './live.ts'
import { holderFileOf, holderHome } from './main-agent-holder.ts'
import { runFromCommand, type RunServices } from './run-control.ts'
import { RUN_COMMAND } from './run.ts'
import { graphService } from './service.ts'
import { DEFAULT_GRAPH_DIR } from './tools.ts'

export interface GraphPanelConfig {
  /** Graph directory: absolute, or relative to the session working directory. Default docs/graph. */
  readonly dir?: string
}

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/graph-panel'
export const inject = ['commands']

const COMMANDS = `/${RUN_COMMAND}`

const WAITING_LIVE = '现场投影等 sessionProjections 服务'
const WAITING_CHILDREN = '停子 agent 等 agents、subagents 服务'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Session projection key that names the main agent holder record's file. */
export const PROJECT_KEY = 'hournessProject'

/** The projection's wire view: where the record is, or why there is no path. */
export interface ProjectView {
  readonly holderFile: string | null
  readonly reason?: string
}

function parseProjectView(value: unknown): ProjectView {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${PROJECT_KEY} must be an object`)
  const view = value as Record<string, unknown>
  if (view.holderFile !== null && typeof view.holderFile !== 'string') throw new TypeError(`${PROJECT_KEY}.holderFile must be a path or null`)
  if (view.reason !== undefined && typeof view.reason !== 'string') throw new TypeError(`${PROJECT_KEY}.reason must be a string`)
  return { holderFile: view.holderFile, ...(typeof view.reason === 'string' ? { reason: view.reason } : {}) }
}

/**
 * The holder record's absolute path for one project (plain-ui 1.3 §4.9,
 * step 1): the one place the panel's code learns the path from, so the
 * module that locates the record can move with the project's `.llm/`
 * without the projection, the client or the tests changing. It wraps M3's
 * locator, which today names the project by its graph directory; the
 * working directory is already here for the day the locator takes the
 * project root instead (M3 附录 §10).
 */
export function holderPathOf(ctx: ServiceLookup, dir: string, cwd: string | undefined): string {
  void cwd
  return holderFileOf(holderHome(ctx), dir)
}

/** The projection that hands the client the record's path; its state does not change after the session is created. */
function projectProjection(lookup: ServiceLookup): Parameters<InjectableServices['sessionProjections']['register']>[0] {
  return {
    key: PROJECT_KEY,
    stateVersion: 1,
    stateSchema: { parse: parseProjectView },
    init: (header: unknown): ProjectView => {
      const cwd = (header as { readonly cwd?: unknown } | null)?.cwd
      const dir = graphService(lookup)?.dirFor(typeof cwd === 'string' ? cwd : undefined)
      if (dir === undefined) return { holderFile: null, reason: '图行服务不在，或这个工作区没有图目录' }
      return { holderFile: holderPathOf(lookup, dir, typeof cwd === 'string' ? cwd : undefined) }
    },
    apply: (state: ProjectView): ProjectView => state,
    wire: { viewSchema: { parse: parseProjectView }, view: (state: ProjectView): ProjectView => state },
  }
}

/**
 * Register the live projection (live.ts) and the project projection once
 * the session projection registry is present, and keep the registry for
 * the run controls; without it the panel shows no live state, stop and
 * redo refuse, and the rest works. `settled` hears why a projection is
 * off, or undefined once both registered; cordis may run the callback
 * after activation, when the registry arrives, and its disposer when the
 * registry leaves. A live projection that fails to register turns the
 * whole seam off; the project projection failing only says so in the
 * health, and the rest stays on.
 */
function installLive(ctx: Partial<InjectHost>, services: RunServices, settled: (problem: string | undefined) => void): void {
  if (typeof ctx.inject !== 'function') {
    settled('宿主没有 inject，现场投影未注册')
    return
  }
  const off = (error: unknown): void => {
    console.warn(`${name}: the live projection is off: ${message(error)}`)
    settled(`现场投影未注册：${message(error)}`)
  }
  try {
    ctx.inject(['sessionProjections'], projectionCtx => {
      try {
        projectionCtx.sessionProjections.register(liveProjection)
      }
      catch (error) {
        off(error)
        return undefined
      }
      let projectProblem: string | undefined
      try {
        projectionCtx.sessionProjections.register(projectProjection(projectionCtx))
      }
      catch (error) {
        console.warn(`${name}: the project projection is off: ${message(error)}`)
        projectProblem = `位置投影 ${PROJECT_KEY} 未注册：${message(error)}`
      }
      services.projections = projectionCtx.sessionProjections
      settled(projectProblem)
      return () => {
        services.projections = undefined
        settled(WAITING_LIVE)
      }
    })
  }
  catch (error) {
    off(error)
  }
}

/** Keep agents and subagents for stopping a child once both are present; `settled` as in installLive. */
function installChildren(ctx: Partial<InjectHost>, services: RunServices, settled: (problem: string | undefined) => void): void {
  if (typeof ctx.inject !== 'function') {
    settled('宿主没有 inject，停不了子 agent')
    return
  }
  try {
    ctx.inject(['agents', 'subagents'], childCtx => {
      services.children = { agents: childCtx.agents, subagents: childCtx.subagents }
      settled(undefined)
      return () => {
        services.children = undefined
        settled(WAITING_CHILDREN)
      }
    })
  }
  catch (error) {
    console.warn(`${name}: stopping subagents is off: ${message(error)}`)
    settled(`停不了子 agent：${message(error)}`)
  }
}

/** Register both commands, or neither; the problem names what kept them off. The dir is the configured one or the default. */
function registerCommands(ctx: CommandsHost<AgentCommandInvocationLike>, config: GraphPanelConfig, services: RunServices): { readonly unregister: () => void, readonly problem?: string } {
  const dir: unknown = config.dir ?? DEFAULT_GRAPH_DIR
  if (typeof dir !== 'string' || dir.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; ${COMMANDS} stay off`)
    return { unregister: () => {}, problem: `config.dir 不是非空路径，${COMMANDS} 未注册` }
  }
  const definitions: Array<CommandDefinitionLike<AgentCommandInvocationLike>> = [
    {
      definitionId: 'dsh-glm-hourness/graph-run',
      name: RUN_COMMAND,
      description: '开始、暂停或重做一个任务（人用）',
      input: { hint: 'start|stop|redo <节点 id>' },
      handler: invocation => runFromCommand(invocation, dir, services),
    },
  ]
  const disposers: Array<() => void> = []
  const unregister = (): void => { for (const dispose of disposers.splice(0).reverse()) dispose() }
  for (const definition of definitions) {
    try {
      disposers.push(ctx.commands.register(definition))
    }
    catch (error) {
      unregister()
      console.warn(`${name}: registering /${definition.name} failed, the row stays off: ${message(error)}`)
      return { unregister: () => {}, problem: `/${definition.name} 注册失败：${message(error)}` }
    }
  }
  return { unregister }
}

/**
 * cordis plugin entry: register /graph-run and the live projection. The
 * row health is an activation status (the command acts for the human, not
 * for a session's agent); it follows the optional services.
 */
export function apply(ctx: CommandsHost<AgentCommandInvocationLike> & Partial<InjectHost> & Partial<ProvideHost>, config: GraphPanelConfig = {}): () => void {
  const services: RunServices = { projections: undefined, children: undefined, mailbox: createStepMailbox('graph-panel') }
  const commands = registerCommands(ctx, config, services)
  let live: string | undefined = WAITING_LIVE
  let children: string | undefined = WAITING_CHILDREN
  const status = (): ['active' | 'degraded' | 'inactive', string] => [
    commands.problem !== undefined ? 'inactive' : live === undefined && children === undefined ? 'active' : 'degraded',
    [commands.problem ?? `命令 ${COMMANDS} 已注册`, live ?? `现场投影 ${LIVE_KEY} 与位置投影 ${PROJECT_KEY} 已注册`, children ?? '能停子 agent'].join('；'),
  ]
  const health = provideRowHealth(ctx, 'graph-panel', ...status())
  installLive(ctx, services, problem => {
    live = problem
    health.reactivate(...status())
  })
  installChildren(ctx, services, problem => {
    children = problem
    health.reactivate(...status())
  })
  return () => {
    health.dispose()
    commands.unregister()
    services.mailbox.dispose()
  }
}
