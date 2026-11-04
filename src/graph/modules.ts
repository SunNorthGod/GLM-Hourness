/**
 * Modules of a goal, as pure readers over a loaded graph (docs/ORCHESTRATION.md
 * §4.9; decision d-design-onepage, the two-level loop). A goal that is split
 * into modules is designed twice: the framework, the module list and the
 * directions are released once for the goal, then each module has its own
 * design and its own release. The graph has no node type or field for this;
 * the readings below say what a node is. No file system and no Node built-ins,
 * so the host rows and the DSH client import the same functions.
 *
 * - A module is a direct child of a goal, of type feature, that carries a
 *   stage and is approved, doing or done. A feature below a module that
 *   carries a stage is an ordinary feature.
 * - A candidate is a direct child feature of a goal that is still proposed,
 *   with or without a stage: the module list is decided in one release, which
 *   approves the candidates.
 * - The framework is the approved or done decisions directly under the goal.
 * - The directions are the acceptance items of the one norm node norm-directions.
 */
import { compareText } from './format.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf } from './projection.ts'
import { STAGES, type GraphNode, type Status } from './schema.ts'

/** Id of the norm node whose acceptance items are the directions the human decided. */
export const DIRECTIONS_ID = 'norm-directions'

const MODULE_STATUSES: ReadonlySet<Status> = new Set(['approved', 'doing', 'done'])
const FRAMEWORK_STATUSES: ReadonlySet<Status> = new Set(['approved', 'done'])
const CLOSED_STATUSES: ReadonlySet<Status> = new Set(['done', 'dropped', 'superseded'])
const RELEASED_FROM = STAGES.indexOf('release')

function created(node: GraphNode): string {
  return node.history[0]?.at ?? ''
}

/** Creation order (first history entry), then id: the order of module lists, and of a goal's roles, flows and steps (user-graph.ts). */
export function byCreation(a: GraphNode, b: GraphNode): number {
  return compareText(created(a), created(b)) || compareText(a.id, b.id)
}

/** The direct children of a goal that satisfy a test, in creation order, then id. */
function childrenWhere(graph: LoadedGraph, goal: GraphNode, test: (node: GraphNode) => boolean): readonly GraphNode[] {
  return [...graph.nodes.values()].filter(node => node.parent === goal.id && test(node)).sort(byCreation)
}

const isModule = (node: GraphNode): boolean => node.type === 'feature' && node.stage !== undefined && MODULE_STATUSES.has(node.status)
const isCandidate = (node: GraphNode): boolean => node.type === 'feature' && node.status === 'proposed'

/** The norm node that holds the directions; undefined when it is missing or closed. */
export function directionsOf(graph: LoadedGraph): GraphNode | undefined {
  const node = graph.nodes.get(DIRECTIONS_ID)
  return node !== undefined && node.type === 'norm' && !CLOSED_STATUSES.has(node.status) ? node : undefined
}

/** The decisions that are the framework of a split goal: its direct decision children that are approved or done. */
export function frameworkOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return childrenWhere(graph, goal, node => node.type === 'decision' && FRAMEWORK_STATUSES.has(node.status))
}

/** The modules of a goal: direct feature children with a stage that are approved, doing or done. */
export function modulesOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return childrenWhere(graph, goal, isModule)
}

/** The module candidates of a goal: direct feature children that are still proposed. */
export function moduleCandidatesOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return childrenWhere(graph, goal, isCandidate)
}

/**
 * The module or candidate a node belongs to: the node itself, else its
 * nearest ancestor that is one directly under a goal. Undefined when none
 * holds it. A candidate is returned too; `isReleased` tells it from a
 * released module.
 */
export function moduleOf(graph: LoadedGraph, node: GraphNode): GraphNode | undefined {
  return [node, ...ancestorsOf(graph, node)].find((entry) => {
    const parent = entry.parent === undefined ? undefined : graph.nodes.get(entry.parent)
    return parent?.type === 'goal' && (isModule(entry) || isCandidate(entry))
  })
}

/**
 * Whether a module is released: approved, doing or done, and at stage
 * release or later. A candidate and a module still in design are not. A done
 * module counts, so a task reopened under it for rework is not stopped.
 */
export function isReleased(module: GraphNode): boolean {
  return MODULE_STATUSES.has(module.status) && module.stage !== undefined && STAGES.indexOf(module.stage) >= RELEASED_FROM
}

/** Whether the goal is split into modules: it has a module or a candidate. */
export function isSplit(graph: LoadedGraph, goal: GraphNode): boolean {
  return [...graph.nodes.values()].some(node => node.parent === goal.id && (isModule(node) || isCandidate(node)))
}
