/**
 * What the two tools of the design row (propose.ts, record.ts) share: the
 * refusal in the shape of the graph tools' (a tool error whose text is
 * `{code, message, field?, hint}`), the JSON result text, and the reading of
 * the project graph for one call.
 */
import type { ApplyResult } from '../graph/engine.ts'
import { directionsOf, isReleased, isSplit, modulesOf } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { pageRefusal } from '../graph/proposal.ts'
import type { GraphNode } from '../graph/schema.ts'
import { bigLoopSet, isClosed, moduleReleaseGate, moduleSet, releaseGate, releaseSet, stageStatus, type GateItem } from '../graph/stage.ts'
import { hasErrors, loadGraph } from '../graph/store.ts'
import type { AgentLike, ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'

/** Throw a refusal: the model reads the structured error after "Error: ". */
export function refuse(code: string, message: string, hint: string, field?: string): never {
  throw new Error(JSON.stringify(field === undefined ? { code, message, hint } : { code, message, field, hint }))
}

/** Throw the engine's own refusal as it is. */
export function refuseWith(result: Extract<ApplyResult, { ok: false }>): never {
  throw new Error(JSON.stringify(result.error))
}

const render: ToolDefinitionLike['output']['render'] = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The goal a call of kind confirm or release names: it exists, it is a goal, and it is not closed. */
export function openGoal(graph: LoadedGraph, id: string): GraphNode {
  const goal = graph.nodes.get(id)
  if (goal === undefined) refuse('not_found', `no node "${id}"`, 'pass the id of the goal; graph_open lists the open work', 'goal')
  if (goal.type !== 'goal') refuse('invalid', `"${id}" is a ${goal.type}, not a goal`, 'pass the id of the goal', 'goal')
  if (isClosed(goal)) refuse('invalid', `"${id}" is ${goal.status}`, 'a closed goal is not put to the human; graph_focus an open goal', 'goal')
  return goal
}

/**
 * The gate of the confirmation (docs/ORCHESTRATION.md §4.8): the goal is in
 * wish or interview, the 9 items of its requirement card are filled and no
 * edge supersedes a node. The goal when it passes; `invalid` for a goal past
 * the interview, `gate_unmet` with what is missing and where to write it
 * otherwise.
 */
export function confirmGate(graph: LoadedGraph, goal: GraphNode): GraphNode {
  const status = stageStatus(graph, goal)
  if (status.stage !== 'wish' && status.stage !== 'interview') {
    refuse('invalid', `"${goal.id}" is ${status.stage === null ? 'outside the design loop' : `in ${status.stage}`}, so its requirement is not put to the human`, status.stage === null ? 'a goal with no stage does not run the design loop' : 'kind confirm is for a goal in wish or interview; a design is put to the human with kind release', 'goal')
  }
  const missing = status.items.filter(item => !item.ok)
  if (missing.length > 0) refuse('gate_unmet', `the requirement card of "${goal.id}" is not complete; missing: ${missing.map(item => item.label).join('、')}`, missing.map(item => `${item.label}: ${item.hint}`).join('; '))
  return goal
}

/** The gate items that do not hold, as the refusal of a release: what is missing and where to write it. */
function releaseUnmet(label: string, items: readonly GateItem[]): never {
  const missing = items.filter(item => !item.ok)
  return refuse('gate_unmet', `${label} is not complete; missing: ${missing.map(item => item.label).join('、')}`, missing.map(item => `${item.label}: ${item.hint}`).join('; '))
}

/** The module of a goal a call names: one of its modules (not a candidate) that is not released yet. `not_found` for a node that is not there. */
export function moduleOfGoal(graph: LoadedGraph, goal: GraphNode, id: string): GraphNode {
  const node = graph.nodes.get(id)
  if (node === undefined) refuse('not_found', `no node "${id}"`, 'pass the id of a module of the goal; the reminder of the stage lists them', 'module')
  const module = modulesOf(graph, goal).find(entry => entry.id === id)
  if (module === undefined) refuse('invalid', `"${id}" is not a module of "${goal.id}"`, 'a module is a feature directly under the goal that the release of the framework approved; leave module out to release the framework itself', 'module')
  if (isReleased(module)) refuse('invalid', `module "${id}" is released already`, 'this module is already released', 'module')
  if (module.status !== 'approved' && module.status !== 'doing') refuse('invalid', `module "${id}" is ${module.status}`, 'only a module that is approved or in progress is released', 'module')
  return module
}

/** What a release will approve: the proposals of the goal (or of the module) at this moment, and whether the goal is released in two levels. */
export interface ReleaseReady {
  readonly set: readonly GraphNode[]
  readonly split: boolean
}

/**
 * The gate of a release (docs/ORCHESTRATION.md §4.8, §4.9). Without a module,
 * the design of the goal: the goal is in design and its release gate holds
 * (for a goal split into modules, that of the framework, the module list and
 * the directions); with a module, the release of that module: its goal has
 * released the framework and the module gate holds. `invalid` for a goal that
 * is not in the stage the release leaves, `gate_unmet` with what is missing
 * and where to write it otherwise.
 */
export function releaseReady(graph: LoadedGraph, goal: GraphNode, module: GraphNode | undefined): ReleaseReady {
  if (module !== undefined) {
    const gate = moduleReleaseGate(graph, goal, module)
    if (gate.some(item => !item.ok)) releaseUnmet(`the design of module "${module.id}"`, gate)
    return { set: moduleSet(graph, module), split: true }
  }
  const { stage } = stageStatus(graph, goal)
  if (stage !== 'design') {
    const hint = stage === 'wish' || stage === 'interview'
      ? 'the design is put to the human once the requirement is confirmed: kind confirm first'
      : stage === null ? 'a goal with no stage does not run the design loop' : 'the design of this goal is released already; for a goal split into modules, release a module of it with module'
    refuse('invalid', `"${goal.id}" is ${stage === null ? 'outside the design loop' : `in ${stage}`}, so its design is not put to the human`, hint, 'goal')
  }
  const gate = releaseGate(graph, goal)
  if (gate.some(item => !item.ok)) releaseUnmet(`the design of "${goal.id}"`, gate)
  return isSplit(graph, goal) ? { set: bigLoopSet(graph, goal), split: true } : { set: releaseSet(graph, goal), split: false }
}

/**
 * The one-page release note of a release (docs/ORCHESTRATION.md §4.9): none for
 * a goal that is not split; for the others, a page that names what would let
 * the human overlook a part of what they release: each module candidate and
 * framework decision of the set and every direction word for word (the framework
 * release), or the module (a module release). `invalid` with the first text
 * that is missing.
 */
export function releasePage(graph: LoadedGraph, goal: GraphNode, module: GraphNode | undefined, ready: ReleaseReady, page: string | undefined): void {
  if (!ready.split) {
    if (page !== undefined) refuse('invalid', `"${goal.id}" is not split into modules, so it takes no page`, 'this goal is not split into modules: leave page out; the design itself is in your report before the question', 'page')
    return
  }
  if (page === undefined) refuse('invalid', 'page is required: the one-page release note', 'write one page in plain words of what the human will see, what it does by itself, when it asks them and which directions it settled, and pass it as page', 'page')
  const named = (node: GraphNode, what: string): { readonly text: string, readonly label: string } => ({ text: node.title, label: `${what} "${node.title}"` })
  const wanted = module !== undefined
    ? [named(module, 'the module')]
    : [
      ...ready.set.filter(node => node.type === 'feature' && node.parent === goal.id).map(node => named(node, 'the module')),
      ...ready.set.filter(node => node.type === 'decision' && node.parent === goal.id).map(node => named(node, 'the framework decision')),
      ...(directionsOf(graph)?.acceptance ?? []).map(text => ({ text, label: `the direction "${text}"` })),
    ]
  const bad = pageRefusal(page, wanted)
  if (bad !== undefined) refuse('invalid', bad.message, bad.hint, 'page')
}

/** The graph as it is now; refused with `graph_invalid` while the node files have errors (every write is refused then). */
export async function readGraph(dir: string): Promise<LoadedGraph> {
  const graph = await loadGraph(dir)
  if (hasErrors(graph)) {
    const first = graph.issues.find(issue => issue.severity === 'error')
    refuse('graph_invalid', `the project graph has validation errors; first: ${first === undefined ? 'unknown' : `${first.file} ${first.message}`}`, 'every write is refused until the node files are fixed or restored with git; tell the human')
  }
  return graph
}

/** The parts of a tool definition the two design tools share: name, description, the schemas of the arguments and of the result, and the render of the result as JSON text. */
export function toolShell(name: string, description: string, parameters: Record<string, unknown>, schema: Record<string, unknown>): Omit<ToolDefinitionLike, 'execute'> {
  return { name, description, parameters, output: { schema, render } }
}

/** The call and the agent that made it, when that is the main agent; anyone else is refused, and so is a role that cannot be read. */
export function mainAgentCall(isMainAgent: (agent: AgentLike) => boolean, exec: unknown, forbidden: { readonly message: string, readonly hint: string }): { readonly context: ToolExecutionContext, readonly agent: AgentLike } {
  const context = exec as ToolExecutionContext
  const { agent } = context
  let main = false
  try {
    main = agent !== undefined && isMainAgent(agent)
  }
  catch {
    // A role that cannot be read is no role.
  }
  if (agent === undefined || !main) refuse('forbidden', forbidden.message, forbidden.hint)
  return { context, agent }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
