/**
 * glm-hourness/graph-panel row entry (docs/ORCHESTRATION.md §2.10, §13):
 * the write path of the project graph panel in the DSH right sidebar. The
 * panel (ui/src) reads the node files through remote.workspaceFiles and
 * writes through this row's commands; a slash command only ever comes from
 * the human (the panel, or the composer), never from the model, so both act
 * as the human. The graph is the configured dir (default docs/graph) under
 * the invoking session's working directory, resolved per call like the
 * graph tools.
 *
 * /graph-apply applies one mutation with actor human. Its input is the
 * mutation JSON, which command/run does not record (recordInput false): the
 * node history already keeps the change, and the conversation shows the
 * readable outcome line instead of raw JSON.
 *
 * /graph-run starts, stops or redoes the work on a task node
 * (run-control.ts). It sends the main agent a message, so unlike
 * /graph-apply it reaches the model. Its input (`start task-3`) is short
 * and is what the human clicked, so command/run records it.
 *
 * The row also registers the session projection the panel's live view
 * reads (live.ts), and takes the services the run controls read
 * optionally: sessionProjections (with the projection), agents and
 * subagents (stopping a child). Its row health is an activation status
 * that changes as those arrive or leave. Activation never throws.
 */
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandInvocationLike, CommandResultLike, CommandsHost, InjectHost, ProvideHost } from '../shared/dsh-min.ts'
import { provideRowHealth } from '../shared/health.ts'
import { openEngine } from './engine.ts'
import { STATUS_LABELS, refusalText } from './labels.ts'
import { LIVE_KEY, liveProjection } from './live.ts'
import type { Mutation } from './mutation.ts'
import { runFromCommand, type RunServices } from './run-control.ts'
import { RUN_COMMAND } from './run.ts'
import type { GraphNode } from './schema.ts'
import { DEFAULT_GRAPH_DIR, locateGraph } from './tools.ts'

export interface GraphPanelConfig {
  /** Graph directory: absolute, or relative to the session working directory. Default docs/graph. */
  readonly dir?: string
}

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/graph-panel'
export const inject = ['commands']

/** The command the panel sends its writes through. */
export const APPLY_COMMAND = 'graph-apply'

const COMMANDS = `/${APPLY_COMMAND}、/${RUN_COMMAND}`

/** One-line outcome of a write, shown as the command result in the conversation. */
function outcomeText(mutation: Mutation, node: GraphNode): string {
  const title = `「${node.title}」`
  switch (mutation.op) {
    case 'decide': {
      const label = node.options?.find(entry => entry.key === node.decision)?.label
      return `已拍板${title}：${node.decision ?? mutation.option}${label === undefined ? '' : ` ${label}`}`
    }
    case 'approve':
      return `已批准${title}`
    case 'reject':
      return `已否决${title}`
    case 'comment':
      return `已批注${title}`
    case 'status':
      return `${title}改为${STATUS_LABELS[node.status]}`
    case 'propose':
      return `已新建${title}`
    default:
      return `已更新${title}`
  }
}

/** Apply one mutation from a command invocation as the human. */
export async function applyFromCommand(invocation: CommandInvocationLike, configured: string): Promise<CommandResultLike> {
  let mutation: unknown
  try {
    mutation = JSON.parse(invocation.rawInput)
  }
  catch (error) {
    return { kind: 'error', text: refusalText({ code: 'invalid', message: `the input is not JSON: ${(error as Error).message}`, hint: `send one mutation object after /${APPLY_COMMAND}` }) }
  }
  const dir = await locateGraph(configured, invocation.agent.session?.header?.cwd)
  if (typeof dir !== 'string') return { kind: 'error', text: refusalText(dir.error) }
  const result = await openEngine(dir).apply('human', mutation)
  if (!result.ok) return { kind: 'error', text: refusalText(result.error) }
  return { kind: 'success', text: outcomeText(mutation as Mutation, result.node) }
}

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
      definitionId: name,
      name: APPLY_COMMAND,
      description: 'Apply one project graph change as the human (sent by the graph panel)',
      recordInput: false,
      handler: invocation => applyFromCommand(invocation, dir),
    },
    {
      definitionId: 'dsh-glm-hourness/graph-run',
      name: RUN_COMMAND,
      description: 'Start, stop or redo the work on a project graph task as the human (sent by the graph panel)',
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
 * cordis plugin entry: register /graph-apply, /graph-run and the live
 * projection. The row health is an activation status (the commands act for
 * the human, not for a session's agent); it follows the optional services.
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
