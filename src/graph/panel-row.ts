/**
 * glm-hourness/graph-panel row entry (docs/ORCHESTRATION.md §2.10, §13):
 * the write path of the project graph panel in the DSH right sidebar. The
 * panel (ui/src) reads the node files through remote.workspaceFiles and
 * writes through this row's /graph-apply command, which applies one
 * mutation with actor human: a slash command only ever comes from the
 * human (the panel, or the composer), never from the model. The graph is
 * the configured dir (default docs/graph) under the invoking session's
 * working directory, resolved per call like the graph tools.
 *
 * The command's input is the mutation JSON. command/run does not record it
 * (recordInput false): the node history already keeps the change, and the
 * conversation shows the readable outcome line instead of raw JSON. The
 * row registers nothing model-facing. It also registers the session
 * projection the panel's live view reads (live.ts) and provides its row
 * health, fixed at activation. Activation never throws.
 */
import type { CommandInvocationLike, CommandResultLike, CommandsHost, InjectHost, ProvideHost } from '../shared/dsh-min.ts'
import { provideRowHealth } from '../shared/health.ts'
import { openEngine } from './engine.ts'
import { STATUS_LABELS } from './labels.ts'
import { LIVE_KEY, liveProjection } from './live.ts'
import type { EngineError, Mutation } from './mutation.ts'
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

/** A refusal as one readable line: what failed and the way forward (CHARTER.md §6). */
export function refusalText(error: Pick<EngineError, 'code' | 'message' | 'hint'>): string {
  return `图没有写入（${error.code}）：${error.message}。${error.hint}`
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

/**
 * Register the live projection (live.ts) once the session projection
 * registry is present; without it the panel shows no live state and the
 * write path still works. `settled` hears why the projection is off, or
 * undefined once it registered; cordis may run the callback after
 * activation, when the registry arrives.
 */
function installLive(ctx: Partial<InjectHost>, settled: (problem: string | undefined) => void): void {
  if (typeof ctx.inject !== 'function') {
    settled('宿主没有 inject，现场投影未注册')
    return
  }
  const off = (error: unknown): void => {
    console.warn(`${name}: the live projection is off: ${error instanceof Error ? error.message : String(error)}`)
    settled(`现场投影未注册：${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    ctx.inject(['sessionProjections'], projectionCtx => {
      try {
        projectionCtx.sessionProjections.register(liveProjection)
        settled(undefined)
      }
      catch (error) {
        off(error)
      }
    })
  }
  catch (error) {
    off(error)
  }
}

/** The command's activation problem, if any; the dir is the configured one or the default. */
function registerCommand(ctx: CommandsHost, config: GraphPanelConfig): { readonly unregister: () => void, readonly problem?: string } {
  const dir: unknown = config.dir ?? DEFAULT_GRAPH_DIR
  if (typeof dir !== 'string' || dir.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; /${APPLY_COMMAND} stays off`)
    return { unregister: () => {}, problem: `config.dir 不是非空路径，/${APPLY_COMMAND} 未注册` }
  }
  try {
    return {
      unregister: ctx.commands.register({
        definitionId: name,
        name: APPLY_COMMAND,
        description: 'Apply one project graph change as the human (sent by the graph panel)',
        recordInput: false,
        handler: invocation => applyFromCommand(invocation, dir),
      }),
    }
  }
  catch (error) {
    console.warn(`${name}: registering /${APPLY_COMMAND} failed, the row stays off: ${error instanceof Error ? error.message : String(error)}`)
    return { unregister: () => {}, problem: `/${APPLY_COMMAND} 注册失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * cordis plugin entry: register /graph-apply and the live projection. The
 * row health is an activation status (the command acts for the human, not
 * for a session's agent); it changes once when the live projection settles.
 */
export function apply(ctx: CommandsHost & Partial<InjectHost> & Partial<ProvideHost>, config: GraphPanelConfig = {}): () => void {
  const command = registerCommand(ctx, config)
  const status = (live: string | undefined): ['active' | 'degraded' | 'inactive', string] => [
    command.problem !== undefined ? 'inactive' : live === undefined ? 'active' : 'degraded',
    [command.problem ?? `命令 /${APPLY_COMMAND} 已注册`, live ?? `现场投影 ${LIVE_KEY} 已注册`].join('；'),
  ]
  const health = provideRowHealth(ctx, 'graph-panel', ...status('现场投影等 sessionProjections 服务'))
  installLive(ctx, live => { health.reactivate(...status(live)) })
  return () => {
    health.dispose()
    command.unregister()
  }
}
