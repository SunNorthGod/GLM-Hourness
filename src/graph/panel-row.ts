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
 * The row also registers the session projection the panel's live view
 * reads (live.ts), and takes the services the run controls read
 * optionally: sessionProjections (with the projection), agents and
 * subagents (stopping a child). Its row health is an activation status
 * that changes as those arrive or leave. Activation never throws.
 */
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandsHost, InjectHost, ProvideHost } from '../shared/dsh-min.ts'
import { provideRowHealth } from '../shared/health.ts'
import { LIVE_KEY, liveProjection } from './live.ts'
import { runFromCommand, type RunServices } from './run-control.ts'
import { RUN_COMMAND } from './run.ts'
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

/**
 * Register the live projection (live.ts) once the session projection
 * registry is present, and keep the registry for the run controls; without
 * it the panel shows no live state, stop and redo refuse, and the rest
 * works. `settled` hears why the projection is off, or undefined once it
 * registered; cordis may run the callback after activation, when the
 * registry arrives, and its disposer when the registry leaves.
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
      services.projections = projectionCtx.sessionProjections
      settled(undefined)
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
  const services: RunServices = { projections: undefined, children: undefined }
  const commands = registerCommands(ctx, config, services)
  let live: string | undefined = WAITING_LIVE
  let children: string | undefined = WAITING_CHILDREN
  const status = (): ['active' | 'degraded' | 'inactive', string] => [
    commands.problem !== undefined ? 'inactive' : live === undefined && children === undefined ? 'active' : 'degraded',
    [commands.problem ?? `命令 ${COMMANDS} 已注册`, live ?? `现场投影 ${LIVE_KEY} 已注册`, children ?? '能停子 agent'].join('；'),
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
  }
}
