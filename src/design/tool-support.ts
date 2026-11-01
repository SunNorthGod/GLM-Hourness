/**
 * What the two tools of the design row (propose.ts, record.ts) share: the
 * refusal in the shape of the graph tools' (a tool error whose text is
 * `{code, message, field?, hint}`), the JSON result text, and the reading of
 * the project graph for one call.
 */
import type { ApplyResult } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { isClosed, stageStatus } from '../graph/stage.ts'
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
 * wish or interview, the 8 items of its requirement card are filled and no
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
