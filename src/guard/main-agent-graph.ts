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
 * - main-agent-graph-stage, every session: a goal moves forward only when the
 *   human agrees to the requirement or the design the main agent put to them,
 *   which record_human_answer records and which does not go through the graph
 *   tools. Five graph tool calls are denied whoever makes them, with or
 *   without `relay` (judgeGraphStage). A delegated or an ordinary session
 *   that tries one is also reported; the main agent only gets the denial.
 *   A module of a goal split into modules moves the same way: its stage goes
 *   forward only with the human's agreement to its release, nothing under a
 *   module that is not released is approved, and the module list is settled
 *   when the framework is released. Sending a module back to design is the
 *   main agent's alone.
 * - main-agent-graph-cli, every session: the graph's command line writes as
 *   the llm with whatever `relay` it is given and checks nothing, so inside a
 *   session only its reading commands run (graphCliWrite).
 *
 * An ordinary session's `relay` is not checked. Nested calls (they carry
 * `parent`) never reach these rules, like the other rules of the main agent.
 */
import { isReleased, modulesOf, moduleOf } from '../graph/modules.ts'
import { deciderOf } from '../graph/projection.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { CARD_FIELDS, STAGES, type GraphNode, type Stage } from '../graph/schema.ts'
import type { GraphFocusService } from '../graph/service.ts'
import { effectiveStage, goalOf } from '../graph/stage.ts'
import { loadGraph } from '../graph/store.ts'
import { DELEGATIONS_ID } from '../shared/answer-marks.ts'
import type { AgentLike } from '../shared/dsh-min.ts'
import { GRAPH_TOOL_NAMES } from '../shared/tool-names.ts'
import { GRAPH_STAGE_RULE } from './main-agent-rules.ts'
import type { Correction, ToolCall } from './rules.ts'
import { commandName, simpleCommands, type ShellDialect } from './shell.ts'

/** What the design row says about the quotes of a relay: whether the human said them; undefined when the session's messages cannot be read. */
type RelayCheck = { readonly ok: true } | { readonly ok: false, readonly reason: string, readonly offBoundary: boolean }

export interface GraphRuleDeps {
  readonly graph: () => GraphFocusService | undefined
  readonly checkRelay: (agent: Pick<AgentLike, 'id' | 'session'>, quotes: readonly string[], afterMs: number) => RelayCheck | undefined
}

/** A judged graph call: denied with the correction, or let through (with what could not be judged, for the row health). */
export type GraphVerdict =
  | { readonly kind: 'deny', readonly rule: string, readonly correction: Correction, readonly node?: string, readonly goal?: string, readonly stageFrom?: string, readonly stageTo?: string, readonly degraded?: string }
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

/** Which kind of session made the call, for the words of the correction and for whether the attempt is reported. */
export type SessionKind = 'main-agent' | 'subagent' | 'ordinary'

/** The stages in the design loop: a goal in one of them has not been released to be built. */
function inDesignLoop(stage: Stage | null): stage is 'wish' | 'interview' | 'design' {
  return stage === 'wish' || stage === 'interview' || stage === 'design'
}

const isStage = (value: unknown): value is Stage => typeof value === 'string' && (STAGES as readonly string[]).includes(value)
const laterThan = (stage: Stage, other: Stage): boolean => STAGES.indexOf(stage) > STAGES.indexOf(other)

/** What a graph call that would move work on tried to do: in the words of the correction (`fact`) and of the human (`what`), with the goal and node it is about. */
export interface StageAttempt {
  readonly fact: string
  readonly what: string
  readonly goal?: string | undefined
  readonly node?: string | undefined
  readonly stageFrom?: Stage | undefined
  readonly stageTo?: Stage | undefined
  /** The module the attempt is about, when it is about one: the correction then names its release. */
  readonly module?: string | undefined
  /** Only the main agent may do it: sending a module back to design is its decision. */
  readonly mainAgentOnly?: boolean | undefined
}

const quoted = (title: string): string => `"${title}"`

/** Types a call with the human's words may propose under a goal in the design loop: what is asked of the human, and what could go wrong. */
const OPEN_WITH_WORDS: ReadonlySet<unknown> = new Set(['question', 'risk', 'retro'])

/** Whether a goal has released its framework and has modules: its stage is release or later and a module exists, so its module list is settled. */
function hasSettledModules(graph: LoadedGraph, goal: GraphNode): boolean {
  const stage = effectiveStage(goal)
  return stage !== null && !inDesignLoop(stage) && modulesOf(graph, goal).length > 0
}

/** Whether the node is a module of its goal: a feature directly under a goal that carries a stage and is approved, doing or done. */
function moduleNode(graph: LoadedGraph, node: GraphNode): boolean {
  const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  return node.type === 'feature' && parent?.type === 'goal' && modulesOf(graph, parent).some(module => module.id === node.id)
}

/**
 * a: an edit that takes a goal or a feature out of the design loop or on from
 * it. Three shapes: its stage set forward out of wish, interview or design;
 * its stage cleared while it is in one of them (it then runs no loop, and the
 * gates read a goal with no stage as one the human did not put through it);
 * a goal that has no stage given one after the interview (the same, from the
 * other side). Of a feature: a stage given to one that has none (that makes
 * it a module, or releases it), and the stage of a module cleared at any
 * time (a released module would lose the record of its release). e: a module
 * sent back to design, which only the main agent may do (judgeGraphStage).
 */
function editAttempt(graph: LoadedGraph, args: Record<string, unknown> | undefined): StageAttempt | undefined {
  const id = args?.id
  const to = recordOf(args?.set)?.stage
  const node = typeof id === 'string' ? graph.nodes.get(id) : undefined
  if (node === undefined || (node.type !== 'goal' && node.type !== 'feature')) return undefined
  const from = effectiveStage(node)
  const goal = goalOf(graph, node.id)?.id
  const module = moduleNode(graph, node)
  if (to === null) {
    // A clear that changes nothing is left to the tool to refuse.
    if (node.stage === undefined) return undefined
    if (inDesignLoop(from)) return { fact: `You tried to clear the stage of ${quoted(node.title)} while it is in ${from}.`, what: `清掉「${node.title}」的阶段`, goal, node: node.id, stageFrom: from }
    return module ? { fact: `You tried to clear the stage of the module ${quoted(node.title)}.`, what: `清掉模块「${node.title}」的阶段`, goal, node: node.id, ...from === null ? {} : { stageFrom: from }, module: node.id } : undefined
  }
  if (!isStage(to)) return undefined
  if (from === null) {
    if (node.type === 'feature') return { fact: `You tried to give the feature ${quoted(node.title)} the stage ${to}, which would make it a module of its goal.`, what: `给特性「${node.title}」写上阶段 ${to}`, goal, node: node.id, stageTo: to }
    return laterThan(to, 'interview')
      ? { fact: `You tried to set the stage of ${quoted(node.title)} to ${to} while it runs no design loop.`, what: `把「${node.title}」推到 ${to}`, goal, node: node.id, stageTo: to }
      : undefined
  }
  if (module && to === 'design' && from !== 'design' && laterThan(from, 'design')) {
    return { fact: `You tried to send the module ${quoted(node.title)} back to design.`, what: `把模块「${node.title}」退回设计`, goal, node: node.id, stageFrom: from, stageTo: to, module: node.id, mainAgentOnly: true }
  }
  const forward = from === 'wish' || from === 'interview' ? laterThan(to, 'interview') : from === 'design' && laterThan(to, 'design')
  return forward
    ? { fact: `You tried to set the stage of ${quoted(node.title)} to ${to} while it is in ${from}.`, what: `把「${node.title}」推到 ${to}`, goal, node: node.id, stageFrom: from, stageTo: to, ...module ? { module: node.id } : {} }
    : undefined
}

/**
 * b and c: an approval of a goal that is in wish or interview (the requirement
 * is confirmed), of a node under a goal that is in wish, interview or design
 * (the design is released), of a node below a module that is not released (the
 * module is released), and of a feature directly under a goal whose module
 * list is settled (a new module).
 */
function approveAttempt(graph: LoadedGraph, args: Record<string, unknown> | undefined): StageAttempt | undefined {
  const id = args?.id
  const node = typeof id === 'string' ? graph.nodes.get(id) : undefined
  if (node === undefined) return undefined
  const goal = goalOf(graph, node.id)
  if (goal === undefined) return undefined
  const stage = effectiveStage(goal)
  if (inDesignLoop(stage)) {
    if (goal.id === node.id) {
      return stage === 'design'
        ? undefined
        : { fact: `You tried to approve the goal ${quoted(node.title)} while its requirement has not been confirmed (it is in ${stage}).`, what: `批准「${node.title}」`, goal: goal.id, node: node.id, stageFrom: stage }
    }
    return { fact: `You tried to approve ${quoted(node.title)} under the goal ${quoted(goal.title)}, which is in ${stage}.`, what: `批准「${node.title}」`, goal: goal.id, node: node.id, stageFrom: stage }
  }
  const module = moduleOf(graph, node)
  if (module !== undefined && module.id !== node.id && !isReleased(module)) {
    return { fact: `You tried to approve ${quoted(node.title)} under the module ${quoted(module.title)}, which is not released.`, what: `批准「${node.title}」`, goal: goal.id, node: node.id, module: module.id }
  }
  if (node.type === 'feature' && node.parent === goal.id && hasSettledModules(graph, goal)) {
    return { fact: `You tried to approve the feature ${quoted(node.title)} directly under the goal ${quoted(goal.title)}, whose modules were settled when its framework was released.`, what: `批准新模块「${node.title}」`, goal: goal.id, node: node.id }
  }
  return undefined
}

/**
 * d: a proposal that carries the human's words and so is approved at once: a
 * goal with no stage or past the interview, a feature that names a stage, a
 * node of a kind that is built from under a goal still in the design loop or
 * under a module that is not released, or a feature directly under a goal whose
 * module list is settled.
 */
function proposeAttempt(graph: LoadedGraph, args: Record<string, unknown> | undefined): StageAttempt | undefined {
  const node = recordOf(args?.node)
  const title = typeof node?.title === 'string' ? node.title : '一个节点'
  if (node === undefined) return undefined
  const { type, stage, parent } = node
  if (type === 'goal' && !isStage(stage)) {
    return { fact: `You tried to propose the goal ${quoted(title)} with the human's words and no stage.`, what: `提议不走设计循环的目标「${title}」` }
  }
  if (type === 'goal' && isStage(stage) && laterThan(stage, 'interview')) {
    return { fact: `You tried to propose the goal ${quoted(title)} with the human's words at stage ${stage}.`, what: `提议已在 ${stage} 的目标「${title}」`, stageTo: stage }
  }
  if (type === 'feature' && isStage(stage)) {
    return { fact: `You tried to propose the feature ${quoted(title)} with the human's words at stage ${stage}.`, what: `提议已在 ${stage} 的特性「${title}」`, stageTo: stage }
  }
  const under = typeof parent === 'string' ? graph.nodes.get(parent) : undefined
  const goal = typeof parent === 'string' ? goalOf(graph, parent) : undefined
  const at = goal === undefined ? null : effectiveStage(goal)
  if (goal !== undefined && inDesignLoop(at) && !OPEN_WITH_WORDS.has(type)) {
    return { fact: `You tried to propose ${quoted(title)} with the human's words under the goal ${quoted(goal.title)}, which is in ${at}.`, what: `用转述的话在「${goal.title}」下提议「${title}」`, goal: goal.id, stageFrom: at }
  }
  if (goal === undefined || under === undefined || OPEN_WITH_WORDS.has(type)) return undefined
  const module = moduleOf(graph, under)
  if (module !== undefined && !isReleased(module)) {
    return { fact: `You tried to propose ${quoted(title)} with the human's words under the module ${quoted(module.title)}, which is not released.`, what: `用转述的话在模块「${module.title}」下提议「${title}」`, goal: goal.id, module: module.id }
  }
  if (type === 'feature' && under.id === goal.id && hasSettledModules(graph, goal)) {
    return { fact: `You tried to propose the feature ${quoted(title)} with the human's words directly under the goal ${quoted(goal.title)}, whose modules were settled when its framework was released.`, what: `用转述的话在「${goal.title}」下提议新模块「${title}」`, goal: goal.id }
  }
  return undefined
}
/**
 * Whether a call could move a goal on, looked at without the graph: an edit
 * that sets or clears a stage, an approval, a proposal that carries `relay`.
 * Only these are read against the graph.
 */
export function stageCandidate(call: ToolCall): boolean {
  if (call.name === 'graph_approve') return true
  if (call.name === 'graph_propose') return relayOf(call) !== undefined
  if (call.name !== 'graph_edit') return false
  const stage = recordOf(recordOf(call.arguments)?.set)?.stage
  return typeof stage === 'string' || stage === null
}

const MOVES_FORWARD_FACT = 'Only the main agent moves a goal forward, by recording the human\'s agreement to its proposal.'

function stageCorrection(who: SessionKind, attempt: StageAttempt): Correction {
  if (attempt.mainAgentOnly === true) {
    return { fact: 'Only the main agent sends a module back to design.', violation: attempt.fact, rightPath: who === 'subagent' ? 'Report back to the main agent.' : 'Ask the main agent in its conversation.', exception: NO_ONE }
  }
  if (who === 'main-agent') {
    return {
      fact: attempt.fact,
      violation: attempt.module === undefined
        ? 'A goal moves forward only when the human agrees to the requirement or the design you put to them, and the graph tools do not carry that agreement.'
        : 'A module moves forward only when the human agrees to the design you put to them, and the graph tools do not carry that agreement.',
      rightPath: attempt.module === undefined
        ? 'Put it to the human with propose_to_human (kind confirm or release) and record their answer with record_human_answer; the harness checks the requirement or the design first.'
        : `Put the module to the human with propose_to_human (kind release, module ${attempt.module}, page) and record their answer with record_human_answer; the harness checks the module's design first.`,
      exception: NO_ONE,
    }
  }
  return {
    fact: MOVES_FORWARD_FACT,
    violation: attempt.fact,
    rightPath: who === 'subagent' ? 'Report back to the main agent.' : 'The human agrees in the main agent\'s conversation; /wish in this session shows where it is.',
    exception: NO_ONE,
  }
}

const UNREADABLE_GRAPH_CORRECTION: Correction = {
  fact: 'The harness could not read the project graph to judge this call.',
  violation: 'A write that can move a goal forward is not let through unchecked.',
  rightPath: 'Retry; if it fails again, tell the human the reason.',
  exception: NO_ONE,
}

/** A graph call of a session, judged by main-agent-graph-stage: allowed, or denied with the correction and what it tried (for the journal and the report). */
export type StageVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny', readonly correction: Correction, readonly attempt?: StageAttempt, readonly degraded?: string }

/**
 * main-agent-graph-stage for one call, for any session. Only the five calls
 * that could move a goal on are looked at (stageCandidate) and only those
 * read the graph. A graph that cannot be read denies the call: letting it
 * through would be a release nobody checked. A call that names no node that
 * exists is left to the tool to refuse. Never throws.
 */
export async function judgeGraphStage(deps: GraphRuleDeps, agent: Pick<AgentLike, 'session'>, call: ToolCall, who: SessionKind): Promise<StageVerdict> {
  if (!stageCandidate(call)) return { kind: 'allow' }
  try {
    const dir = deps.graph()?.dirFor(agent.session?.header.cwd)
    if (dir === undefined) return { kind: 'allow' }
    const graph = await loadGraph(dir)
    const args = recordOf(call.arguments)
    const attempt = call.name === 'graph_edit' ? editAttempt(graph, args) : call.name === 'graph_approve' ? approveAttempt(graph, args) : proposeAttempt(graph, args)
    // Sending a module back to design is the main agent's own decision (the engine asks no words of it); for anyone else it is refused like the rest.
    return attempt === undefined || (attempt.mainAgentOnly === true && who === 'main-agent') ? { kind: 'allow' } : { kind: 'deny', correction: stageCorrection(who, attempt), attempt }
  }
  catch (error) {
    return { kind: 'deny', correction: UNREADABLE_GRAPH_CORRECTION, degraded: `读不到项目图，没法判断这次图写入会不会不经人的同意把目标推向前，已拒绝（${error instanceof Error ? error.message : String(error)}）` }
  }
}

/** The correction for a shell call that runs the graph's command line to write. */
export const GRAPH_CLI_CORRECTION: Correction = {
  fact: 'Inside DSH the project graph changes through the graph tools.',
  violation: 'The graph tools check whose words a relay carries; the command line does not.',
  rightPath: 'Use the graph tools (graph_propose, graph_edit, graph_decide, …).',
  exception: 'The orchestrator runs the command line outside DSH.',
}

const PACKAGE_RUNNERS: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn'])
const READING_SUBCOMMANDS: ReadonlySet<string> = new Set(['show', 'open'])
const CLI_PATH = 'scripts/graph/cli.ts'

/** The words after the graph command line in one simple command, or undefined when it is not that command line: `npm|pnpm|yarn [run] [-s|--silent] graph …`, or `node … scripts/graph/cli.ts …` (`\` and `/` alike). */
function graphCliArgs(words: readonly string[]): readonly string[] | undefined {
  const name = commandName(words[0] ?? '').replace(/\.cmd$/u, '')
  if (PACKAGE_RUNNERS.has(name)) {
    let at = 1
    while (words[at] === 'run' || words[at] === '-s' || words[at] === '--silent') at += 1
    return words[at] === 'graph' ? words.slice(at + 1) : undefined
  }
  if (name !== 'node') return undefined
  const at = words.findIndex((word, index) => index > 0 && word.replaceAll('\\', '/').endsWith(CLI_PATH))
  return at < 0 ? undefined : words.slice(at + 1)
}

/** The command of the graph's command line, after its own option `--dir` and the `--` npm passes on; undefined when none is given. */
function subcommandOf(args: readonly string[]): string | undefined {
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at]
    if (word === '--dir') at += 1
    else if (word !== '--' && !word.startsWith('-')) return word
  }
  return undefined
}

/**
 * main-agent-graph-cli: the graph subcommand a shell call runs when it is
 * one that writes (anything but `show` and `open`, so a call with no
 * subcommand counts too: its `''`); undefined when no simple command of it is
 * the graph's command line, or all of them only read. Quoted text is no
 * command (`simpleCommands`). Other ways to open the graph engine from a
 * script are not recognised.
 */
export function graphCliWrite(command: string, dialects: readonly ShellDialect[]): string | undefined {
  for (const dialect of dialects) {
    for (const words of simpleCommands(command, dialect)) {
      const args = graphCliArgs(words)
      if (args === undefined) continue
      const subcommand = subcommandOf(args)
      if (subcommand === undefined || !READING_SUBCOMMANDS.has(subcommand)) return subcommand ?? ''
    }
  }
  return undefined
}

/**
 * Judge a graph tool call of the main agent: the relay rule when the call
 * carries `relay`, the stage rule for the calls that could move a goal on,
 * the options rule for a proposal or an edit of a question.
 * Never throws: what cannot be judged is let through and reported, except
 * the relay of a session whose messages cannot be read and the calls the
 * stage rule cannot read the graph for.
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
  const stage = await judgeGraphStage(deps, agent, call, 'main-agent')
  if (stage.kind === 'deny') {
    const { attempt } = stage
    return {
      kind: 'deny',
      rule: GRAPH_STAGE_RULE,
      correction: stage.correction,
      ...attempt?.node === undefined ? {} : { node: attempt.node },
      ...attempt?.goal === undefined ? {} : { goal: attempt.goal },
      ...attempt?.stageFrom === undefined ? {} : { stageFrom: attempt.stageFrom },
      ...attempt?.stageTo === undefined ? {} : { stageTo: attempt.stageTo },
      ...stage.degraded === undefined ? {} : { degraded: stage.degraded },
    }
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
