/**
 * How a session may write the project graph (docs/ORCHESTRATION.md §6.7;
 * decisions d-chat-not-cards and d-one-main-agent): the graph tools are
 * registered for every agent, and a write that carries `relay` has the
 * human's authority (src/graph/engine.ts). So whether the words are the
 * human's is checked here, before the tool runs, by kind of session:
 *
 * - main-agent-graph-relay, main agent: every quote of `relay` must be a
 *   whole phrase of a message the human sent after the node last changed
 *   (src/design/talk.ts personSaid, handed in as `checkRelay`). When the
 *   session's messages cannot be read the call is denied: letting the words
 *   through would hand the human's authority to text nobody checked.
 * - main-agent-graph-relay, delegated session: `relay` is refused whatever
 *   it says. A subagent does not talk with the human; the words it could
 *   quote are its parent's task. The attempt is also reported (a notice to
 *   the main agent, the row health).
 * - main-agent-graph-options, main agent: no question with options for the
 *   human to pick from; a matter for the human goes through propose_to_human.
 *   This one lets the call through when the graph cannot be read.
 * - main-agent-graph-delegations, every session: a graph write that points at
 *   norm-delegations is denied, with or without `relay` (writesDelegations).
 *   Only record_human_answer (kind delegation) writes that node, after it
 *   has checked the human's words.
 *
 * An ordinary session's `relay` is not checked. Nested calls (they carry
 * `parent`) never reach these rules, like the other rules of the main agent.
 */
import { deciderOf } from '../graph/projection.ts'
import { CARD_FIELDS } from '../graph/schema.ts'
import type { GraphFocusService } from '../graph/service.ts'
import { goalOf } from '../graph/stage.ts'
import { loadGraph } from '../graph/store.ts'
import { DELEGATIONS_ID } from '../shared/answer-marks.ts'
import type { AgentLike } from '../shared/dsh-min.ts'
import { GRAPH_TOOL_NAMES } from '../shared/tool-names.ts'
import type { Correction, ToolCall } from './rules.ts'

/** What the design row says about the quotes of a relay: whether the human said them; undefined when the session's messages cannot be read. */
type RelayCheck = { readonly ok: true } | { readonly ok: false, readonly reason: string, readonly offBoundary: boolean }

export interface GraphRuleDeps {
  readonly graph: () => GraphFocusService | undefined
  readonly checkRelay: (agent: Pick<AgentLike, 'id' | 'session'>, quotes: readonly string[], afterMs: number) => RelayCheck | undefined
}

/** A judged graph call: denied with the correction, or let through (with what could not be judged, for the row health). */
export type GraphVerdict =
  | { readonly kind: 'deny', readonly rule: string, readonly correction: Correction, readonly node?: string, readonly degraded?: string }
  | { readonly kind: 'allow', readonly degraded?: string }

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** The `relay` argument of a graph tool call when it is a string. */
export function relayOf(call: ToolCall): string | undefined {
  const relay = recordOf(call.arguments)?.relay
  return typeof relay === 'string' ? relay : undefined
}

const NO_ONE = 'none'

/** The correction for a delegated session that sent `relay`. */
export const SUBAGENT_RELAY_CORRECTION: Correction = {
  fact: 'Subagents do not relay the human\'s words.',
  violation: 'Only the main agent talks with the human, and only it records their words.',
  rightPath: 'Report back; the main agent records the human\'s words.',
  exception: NO_ONE,
}

const UNREADABLE_CORRECTION: Correction = {
  fact: 'The harness cannot read this session\'s messages, so it cannot check the words you relayed.',
  violation: 'Only the human\'s own words carry their authority.',
  rightPath: 'Try again; if it fails again, tell the human the reason.',
  exception: NO_ONE,
}

function notSaidCorrection(where: string, offBoundary: boolean): Correction {
  return {
    fact: `The words you relayed are not in a message the human sent ${where}.`,
    violation: 'Only the human\'s own words carry their authority.',
    rightPath: `Quote them exactly from their message, or ask them and wait; to record an answer to a proposal, use record_human_answer.${offBoundary ? ' Quote whole phrases, from one punctuation mark or line break to the next.' : ''}`,
    exception: NO_ONE,
  }
}

/**
 * The time after which the human's words count for a call: the node's last
 * change that is not a comment, 0 for a new node. Undefined when the call
 * names no node that exists (the tool refuses it by itself) or the graph
 * cannot be read (the engine cannot write then either).
 */
async function startOf(deps: GraphRuleDeps, agent: Pick<AgentLike, 'session'>, call: ToolCall): Promise<number | undefined> {
  if (call.name === 'graph_propose') return 0
  const id = recordOf(call.arguments)?.id
  const graph = deps.graph()
  const dir = graph?.dirFor(agent.session?.header.cwd)
  if (typeof id !== 'string' || dir === undefined) return undefined
  try {
    const node = (await loadGraph(dir)).nodes.get(id)
    const last = node?.history.filter(entry => entry.op !== 'comment').at(-1)
    return last === undefined ? undefined : Date.parse(last.at)
  }
  catch {
    return undefined
  }
}

/** main-agent-graph-relay for the main agent. */
async function judgeRelay(deps: GraphRuleDeps, agent: Pick<AgentLike, 'id' | 'session'>, call: ToolCall, relay: string): Promise<GraphVerdict> {
  const start = await startOf(deps, agent, call)
  if (start === undefined) return { kind: 'allow' }
  const checked = deps.checkRelay(agent, relay.split('\n'), start)
  if (checked === undefined) {
    return { kind: 'deny', rule: 'main-agent-graph-relay', correction: UNREADABLE_CORRECTION, degraded: '读不到会话里人的消息，带转述的图写入一律被拒' }
  }
  if (checked.ok) return { kind: 'allow' }
  const id = recordOf(call.arguments)?.id
  const where = call.name === 'graph_propose' || typeof id !== 'string' ? 'in this session' : `after ${id} last changed`
  return { kind: 'deny', rule: 'main-agent-graph-relay', correction: notSaidCorrection(where, checked.offBoundary), ...typeof id === 'string' ? { node: id } : {} }
}

/** main-agent-graph-options: a question for the human with options, proposed or edited into. The title of the question or its id when it is found. */
async function optionsViolation(deps: GraphRuleDeps, agent: Pick<AgentLike, 'session'>, call: ToolCall): Promise<string | undefined> {
  const args = recordOf(call.arguments)
  if (call.name === 'graph_propose') {
    const node = recordOf(args?.node)
    return node?.type === 'question' && node.decider !== 'agent' && node.options !== undefined ? (typeof node.title === 'string' ? node.title : 'a question') : undefined
  }
  const set = recordOf(args?.set)
  const id = args?.id
  if (set === undefined || typeof id !== 'string' || !CARD_FIELDS.some(field => set[field] !== undefined && set[field] !== null)) return undefined
  const dir = deps.graph()?.dirFor(agent.session?.header.cwd)
  if (dir === undefined) return undefined
  const node = (await loadGraph(dir)).nodes.get(id)
  const decider = set.decider === 'agent' || set.decider === 'human' ? set.decider : node === undefined ? 'agent' : deciderOf(node)
  return node?.type === 'question' && decider !== 'agent' ? node.title : undefined
}

function optionsCorrection(title: string): Correction {
  return {
    fact: `You tried to put an option table for the human on the graph for "${title}".`,
    violation: 'As the main agent you put a matter to the human with propose_to_human; the graph keeps no table of options for them to pick from.',
    rightPath: 'Put the matter with propose_to_human (form choose lists two or three ways when a real trade-off exists). A question you decide yourself takes decider agent.',
    exception: NO_ONE,
  }
}

/** The correction for a graph write that points at norm-delegations. */
export const DELEGATIONS_CORRECTION: Correction = {
  fact: `You tried to change ${DELEGATIONS_ID} with a graph tool.`,
  violation: 'It holds what the human handed over to you for good, so only the harness writes it, after checking the human\'s own words.',
  rightPath: 'When the human says 这类你定, call record_human_answer with kind delegation, the kind in scope and their exact words (undo: true takes one back).',
  exception: NO_ONE,
}

const GRAPH_READS: ReadonlySet<string> = new Set(['graph_show', 'graph_open', 'graph_focus'])

/**
 * main-agent-graph-delegations, every session: a graph write that points at
 * norm-delegations, whether or not it carries `relay`. A proposal names it by
 * its node id or an edge, a link names it at either end, any other write by
 * `id`. Reads pass. No graph is read.
 */
export function writesDelegations(call: ToolCall): boolean {
  if (!GRAPH_TOOL_NAMES.includes(call.name) || GRAPH_READS.has(call.name)) return false
  const args = recordOf(call.arguments)
  if (call.name === 'graph_propose') {
    const node = recordOf(args?.node)
    const edges: unknown[] = Array.isArray(node?.edges) ? node.edges : []
    return node?.id === DELEGATIONS_ID || edges.some(edge => recordOf(edge)?.to === DELEGATIONS_ID)
  }
  if (call.name === 'graph_link' || call.name === 'graph_unlink') return args?.id === DELEGATIONS_ID || args?.to === DELEGATIONS_ID
  return args?.id === DELEGATIONS_ID
}

/**
 * Judge a graph tool call of the main agent: the relay rule when the call
 * carries `relay`, the options rule for a proposal or an edit of a question.
 * Never throws: what cannot be judged is let through and reported, except
 * the relay of a session whose messages cannot be read.
 */
export async function judgeMainAgentGraph(deps: GraphRuleDeps, agent: Pick<AgentLike, 'id' | 'session'>, call: ToolCall): Promise<GraphVerdict> {
  const relay = relayOf(call)
  try {
    if (relay !== undefined) {
      const verdict = await judgeRelay(deps, agent, call, relay)
      if (verdict.kind === 'deny') return verdict
    }
  }
  catch (error) {
    return { kind: 'deny', rule: 'main-agent-graph-relay', correction: UNREADABLE_CORRECTION, degraded: `核对转述的人话时出错（${error instanceof Error ? error.message : String(error)}），这次写入被拒` }
  }
  if (call.name !== 'graph_propose' && call.name !== 'graph_edit') return { kind: 'allow' }
  try {
    const title = await optionsViolation(deps, agent, call)
    return title === undefined ? { kind: 'allow' } : { kind: 'deny', rule: 'main-agent-graph-options', correction: optionsCorrection(title) }
  }
  catch (error) {
    return { kind: 'allow', degraded: `没能查这次图写入是不是给人列选项（${error instanceof Error ? error.message : String(error)}），放行了` }
  }
}

/** What a blocked attempt of a delegated session was at, for the notice and the row health: an edit that sets a stage, an approval, or any other write. */
export async function attemptOf(deps: GraphRuleDeps, agent: Pick<AgentLike, 'session'>, call: ToolCall): Promise<{ readonly what: string, readonly goal?: string, readonly node?: string }> {
  const args = recordOf(call.arguments)
  const id = typeof args?.id === 'string' ? args.id : undefined
  let title = id
  let goal: string | undefined
  try {
    const dir = deps.graph()?.dirFor(agent.session?.header.cwd)
    const graph = dir === undefined || id === undefined ? undefined : await loadGraph(dir)
    const node = id === undefined ? undefined : graph?.nodes.get(id)
    if (node !== undefined) title = node.title
    goal = graph === undefined || id === undefined ? undefined : goalOf(graph, id)?.id
  }
  catch {
    // The ids are enough to say what was tried.
  }
  const stage = recordOf(args?.set)?.stage
  const what = call.name === 'graph_approve' ? `批准「${title ?? '一个节点'}」`
    : call.name === 'graph_edit' && typeof stage === 'string' ? `把「${title ?? '一个节点'}」推到 ${stage}`
      : `用转述的话改「${title ?? '一个节点'}」（${call.name}）`
  return { what, ...goal === undefined ? {} : { goal }, ...id === undefined ? {} : { node: id } }
}
