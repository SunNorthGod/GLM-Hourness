/**
 * The host half of the run controls (docs/ORCHESTRATION.md §2.10 运行控制,
 * m2-9): the handler of `/graph-run <start|stop|redo> <node id>`, which the
 * graph-panel row registers next to /graph-apply and the panel sends
 * through remote.commands.execute. It acts on the invoking session's live
 * agent (invocation.agent) and, for a direct child, through the subagents
 * service:
 *
 * - start: `followup` a message that names the node and asks for
 *   graph_focus on it; an idle agent starts a turn, a running one takes it
 *   after the current turn.
 * - stop: cancel the main agent's turn (`keepInbox`) when it stands on the
 *   node, `inject` a message that the human paused the node and it must not
 *   be re-dispatched, then interrupt each direct child that stands on it.
 *   The message goes in before the interrupts: a child that stops sends its
 *   settlement notice, which wakes the main agent (subagent:2048–2058), and
 *   the step that reads the notice reads the message with it (the first
 *   step of a turn claims the next-step messages first, agent-loop:103–107).
 * - redo: reopen a done task, cancel what stands on the node, then
 *   `followup` a message with the acceptance before and after; in that
 *   order the message starts a turn as soon as the cancelled one ends.
 *
 * Who stands on a node is computed at call time from the live projections,
 * with the rule the panel places agents by (live.ts placeOf); the panel's
 * view may be a moment old. Only running agents count.
 *
 * Every control leaves three records: the command's flow node in the
 * conversation (command/run keeps the raw input, the few words the human's
 * click sent; command/done the outcome line), one history entry on the
 * node with actor human, and the message the agent gets (createUserNotice,
 * source glm-graph-run with the facts `graphRun`). A refusal writes nothing
 * and sends nothing: the history entry is written before anything acts.
 */
import { createUserNotice, type AgentCommandInvocationLike, type AgentsService, type CommandResultLike, type LiveAgentLike, type SessionProjectionsService, type SubagentsService, type UserNotice } from '../shared/dsh-min.ts'
import { openEngine, type GraphEngine } from './engine.ts'
import { STATUS_LABELS, refusalText } from './labels.ts'
import { FOCUS_TOOL, LIVE_KEY, placeOf } from './live.ts'
import type { LoadedGraph } from './parse.ts'
import { RUN_COMMAND, RUN_LABELS, acceptanceChange, isRunAction, nodeRefusal, runNote, type RunAction } from './run.ts'
import type { FieldChange, GraphNode } from './schema.ts'
import { locateGraph } from './tools.ts'

/** Source kind of the message a control sends the main agent. */
export const RUN_SOURCE = 'glm-graph-run'

/** DSH's direct-child catalog projection (rc.3 dsh-subagent, subagent:703–803): `{id, createdAt, mode, label?}` per child. */
const CATALOG_KEY = 'subagentCatalog'

/** The optional services the controls read at call time; the row's inject callbacks set and clear them. */
export interface RunServices {
  projections: SessionProjectionsService | undefined
  children: { readonly agents: AgentsService, readonly subagents: SubagentsService } | undefined
}

/** A direct child that runs on the node, and how to stop it. */
interface Child {
  readonly id: string
  readonly label: string
  stop(): void
}

/** The running agents on one node. */
interface Standing {
  readonly main: boolean
  readonly children: readonly Child[]
}

function refused(action: RunAction, reason: string): CommandResultLike {
  return { kind: 'error', text: `「${RUN_LABELS[action]}」没有执行：${reason}` }
}

function parseInput(raw: string): { readonly action: RunAction, readonly id: string } | undefined {
  const [action, id, ...rest] = raw.trim().split(/\s+/)
  if (action === undefined || id === undefined || rest.length > 0 || !isRunAction(action)) return undefined
  return { action, id }
}

function focusIn(values: Readonly<Record<string, unknown>>): string | null {
  const view = values[LIVE_KEY]
  const focus = typeof view === 'object' && view !== null ? (view as { readonly focus?: unknown }).focus : undefined
  return typeof focus === 'string' ? focus : null
}

/** The children of a catalog value the controls can stop: every mode but external (a stopped external child is gone for good). */
function catalogChildren(values: Readonly<Record<string, unknown>>): Array<{ readonly id: string, readonly label: string }> {
  const entries = values[CATALOG_KEY]
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry: unknown) => {
    const { id, mode, label } = (typeof entry === 'object' && entry !== null ? entry : {}) as { readonly id?: unknown, readonly mode?: unknown, readonly label?: unknown }
    return typeof id === 'string' && mode !== 'external' ? [{ id, label: typeof label === 'string' ? label : id }] : []
  })
}

/** The running agents on the node, or why they cannot be told. */
function standingOn(agent: LiveAgentLike, id: string, services: RunServices): Standing | string {
  const projections = services.projections
  if (projections === undefined) return `现场投影 ${LIVE_KEY} 不在，看不出谁在这个节点上`
  const own = projections.snapshot(agent.session, [LIVE_KEY, CATALOG_KEY]).values
  const mainFocus = focusIn(own)
  const main = agent.status === 'running' && mainFocus === id
  const candidates = catalogChildren(own)
  if (candidates.length === 0) return { main, children: [] }
  const control = services.children
  if (control === undefined) return '宿主没有 agents、subagents 服务，看不出也停不了子 agent'
  const children = candidates.flatMap((child): Child[] => {
    const live = control.agents.get(child.id)
    if (live?.status !== 'running') return []
    if (placeOf(focusIn(projections.snapshot(live.session, [LIVE_KEY]).values), mainFocus, false) !== id) return []
    return [{ ...child, stop: () => { control.subagents.interrupt(child.id, { kind: 'user', parentSessionId: agent.id }) } }]
  })
  return { main, children }
}

function whoText(standing: Standing): string {
  return [...standing.main ? ['主 Agent'] : [], ...standing.children.map(child => `子 agent ${child.label}`)].join('、')
}

/** Stop the children; the ones that refused, as outcome text. */
function stopChildren(children: readonly Child[]): string[] {
  return children.flatMap(child => {
    try {
      child.stop()
      return []
    }
    catch (error) {
      return [`子 agent ${child.label} 没停下：${error instanceof Error ? error.message : String(error)}`]
    }
  })
}

/** Write the control's history entry as the human: a comment, or for a reopened task the status change with the note as its reason. */
async function record(engine: GraphEngine, graph: LoadedGraph, node: GraphNode, note: string, reopen: boolean): Promise<string | undefined> {
  const result = reopen
    ? await engine.apply('human', { op: 'status', id: node.id, rev: graph.revisions.get(node.id), to: 'doing', reason: note })
    : await engine.apply('human', { op: 'comment', id: node.id, text: note })
  return result.ok ? undefined : refusalText(result.error)
}

function message(invocation: AgentCommandInvocationLike, action: RunAction, node: GraphNode, summary: string, lines: readonly string[], stopped?: readonly string[]): UserNotice {
  const graphRun = { action, node: node.id, commandId: invocation.commandId, ...(stopped === undefined ? {} : { stopped }) }
  return createUserNotice(RUN_SOURCE, summary, lines.join('\n'), { graphRun })
}

function header(action: RunAction, node: GraphNode): string {
  return `[项目图] 人在面板上点了「${RUN_LABELS[action]}」：任务 ${node.id}「${node.title}」（${STATUS_LABELS[node.status]}）。`
}

function focusStep(node: GraphNode): string {
  return `先调用 ${FOCUS_TOOL} {"id":"${node.id}"} 把焦点设到这个节点，之后每一步都会带上它的验收条件和到目标的路径。`
}

function listLines(value: FieldChange['to']): string[] {
  return Array.isArray(value) && value.length > 0 ? value.map(item => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`) : ['（没有）']
}

function startLines(node: GraphNode): string[] {
  return [
    header('start', node),
    `${focusStep(node)}${node.status === 'approved' ? `开工时用 graph_status 把它标为 doing。` : ''}按验收条件推进，标完成要带证据。`,
  ]
}

function redoLines(node: GraphNode, change: FieldChange | undefined, reopened: boolean, stopped: readonly Child[]): string[] {
  return [
    `${header('redo', node)}${reopened ? '它已从完成改回进行中。' : ''}`,
    ...change === undefined
      ? ['验收条件（上次开始之后没有改过）：', ...listLines(node.acceptance ?? null)]
      : ['验收条件原来是：', ...listLines(change.from), '现在是：', ...listLines(change.to)],
    `${focusStep(node)}按现在的验收条件核对已有的改动，不满足的重做；标完成要带证据。`,
    ...stopped.length === 0 ? [] : [`${stopped.map(child => `子 agent ${child.label}`).join('、')} 已被停下；需要的话按新条件重新派发。`],
  ]
}

/** One control from a command invocation; see the file comment for what each does. */
export async function runFromCommand(invocation: AgentCommandInvocationLike, configured: string, services: RunServices): Promise<CommandResultLike> {
  const input = parseInput(invocation.rawInput)
  if (input === undefined) return { kind: 'error', text: `/${RUN_COMMAND} 没有执行：用法是 /${RUN_COMMAND} start|stop|redo <节点 id>` }
  const { action, id } = input
  const agent = invocation.agent
  const dir = await locateGraph(configured, agent.session.header.cwd)
  if (typeof dir !== 'string') return refused(action, refusalText(dir.error))
  const engine = openEngine(dir)
  const graph = await engine.load()
  const node = graph.nodes.get(id)
  if (node === undefined) return refused(action, `图里没有节点 ${id}`)
  const refusal = nodeRefusal(node, action)
  if (refusal !== undefined) return refused(action, refusal)
  const busy = agent.status === 'running' ? '（它正忙，这一轮做完就接着做）' : ''

  if (action === 'start') {
    const problem = await record(engine, graph, node, runNote('start'), false)
    if (problem !== undefined) return refused(action, problem)
    agent.followup(message(invocation, action, node, `从「${node.title}」开始做`, startLines(node)))
    return { kind: 'success', text: `已让主 Agent 从「${node.title}」开始做${busy}` }
  }

  const standing = standingOn(agent, id, services)
  if (typeof standing === 'string') return refused(action, standing)
  const who = whoText(standing)
  const stopped = [...standing.main ? [agent.id] : [], ...standing.children.map(child => child.id)]

  if (action === 'stop') {
    if (stopped.length === 0) return refused(action, `「${node.title}」上现在没有在跑的 agent`)
    const problem = await record(engine, graph, node, `${runNote('stop')}：停下了${who}`, false)
    if (problem !== undefined) return refused(action, problem)
    if (standing.main) agent.cancel({ kind: 'user' }, { keepInbox: true })
    agent.inject(message(invocation, action, node, `暂停了「${node.title}」`, [
      `[项目图] 人在面板上暂停了任务 ${node.id}「${node.title}」上的工作，停下了${who}。`,
      `不要接着做这个节点，也不要重新派发它；等人再点「${RUN_LABELS.start}」，或在对话里说继续。`,
    ], stopped))
    const failures = stopChildren(standing.children)
    return { kind: failures.length === 0 ? 'success' : 'error', text: [`已暂停「${node.title}」：停下了${who}`, ...failures].join('；') }
  }

  const change = acceptanceChange(node)
  const reopen = node.status === 'done'
  const problem = await record(engine, graph, node, `${runNote('redo')}${stopped.length === 0 ? '' : `：先停下了${who}`}`, reopen)
  if (problem !== undefined) return refused(action, problem)
  if (standing.main) agent.cancel({ kind: 'user' }, { keepInbox: true })
  const failures = stopChildren(standing.children)
  agent.followup(message(invocation, action, node, `按新的验收条件重做「${node.title}」`, redoLines(node, change, reopen, standing.children), stopped.length === 0 ? undefined : stopped))
  const outcome = `已让主 Agent 按新的验收条件重做「${node.title}」${stopped.length === 0 ? busy : `（先停下了${who}）`}`
  return { kind: failures.length === 0 ? 'success' : 'error', text: [outcome, ...failures].join('；') }
}
