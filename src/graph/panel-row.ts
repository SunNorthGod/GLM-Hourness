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
 * row registers nothing model-facing. Activation never throws.
 */
import type { CommandInvocationLike, CommandResultLike, CommandsHost } from '../shared/dsh-min.ts'
import { openEngine } from './engine.ts'
import { STATUS_LABELS } from './labels.ts'
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

/** cordis plugin entry: register /graph-apply. */
export function apply(ctx: CommandsHost, config: GraphPanelConfig = {}): () => void {
  const dir: unknown = config.dir ?? DEFAULT_GRAPH_DIR
  if (typeof dir !== 'string' || dir.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; /${APPLY_COMMAND} stays off`)
    return () => {}
  }
  try {
    return ctx.commands.register({
      definitionId: name,
      name: APPLY_COMMAND,
      description: 'Apply one project graph change as the human (sent by the graph panel)',
      recordInput: false,
      handler: invocation => applyFromCommand(invocation, dir),
    })
  }
  catch (error) {
    console.warn(`${name}: registering /${APPLY_COMMAND} failed, the row stays off: ${error instanceof Error ? error.message : String(error)}`)
    return () => {}
  }
}
