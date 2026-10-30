/**
 * Execution stage of a goal or module, read from the graph (M7 design
 * .agents/tasks/m7/design.md 0.6 §2.4): M7 writes no stage, it derives what
 * it needs. Pure functions over a loaded graph; no file system and no Node
 * built-ins, so the host rows and the DSH client import the same rules.
 *
 * This file holds what the dispatch gate, the write gate and the pins need:
 * `releaseOf` (is the module and the goal a task lives in released),
 * `releaseAtOf`, `scopedTasks`, `isDesignReview`, `sentBack`. The derived
 * stage and the completion gate come with step E1b.
 *
 * Module readers: the design reads the module structure through M3's
 * src/graph/modules.ts (addendum 0.5 §3.14.1). That file is not on main yet,
 * so the block marked STAND-IN below implements the same signatures from
 * the addendum. When M3's file lands, delete the block, import the five
 * readers (and `directionsOf`, `DIRECTIONS_ID`) from './modules.ts', and
 * keep `ModuleReaders` as the injection type; the contract test of that
 * change pins the two to each other.
 */
import { compareText } from './format.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf, childrenIndex, subtreeOf } from './projection.ts'
import { STAGES, type GraphNode, type Stage } from './schema.ts'
import { effectiveStage, goalOf } from './stage.ts'

// ---- STAND-IN for M3's src/graph/modules.ts (addendum 0.5 §3.14.1) ----

const DIRECTIONS_ID = 'norm-directions'

const GONE: ReadonlySet<string> = new Set(['dropped', 'superseded'])
const CLOSED: ReadonlySet<string> = new Set(['done', 'dropped', 'superseded'])

/** Whether a stage value is `release` or one of the stages after it. */
export function isPostRelease(stage: unknown): boolean {
  return typeof stage === 'string' && STAGES.indexOf(stage as Stage) >= STAGES.indexOf('release')
}

function byFirstHistory(a: GraphNode, b: GraphNode): number {
  return compareText(a.history[0]?.at ?? '', b.history[0]?.at ?? '') || compareText(a.id, b.id)
}

function featureChildren(graph: LoadedGraph, goal: GraphNode): GraphNode[] {
  return [...graph.nodes.values()].filter(node => node.parent === goal.id && node.type === 'feature')
}

/** Modules: direct feature children of the goal that carry a stage and are approved, doing or done. */
function modulesOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return featureChildren(graph, goal)
    .filter(node => node.stage !== undefined && (node.status === 'approved' || node.status === 'doing' || node.status === 'done'))
    .sort(byFirstHistory)
}

/** Module candidates: direct feature children of the goal that are still proposals, with or without a stage. */
function moduleCandidatesOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return featureChildren(graph, goal).filter(node => node.status === 'proposed').sort(byFirstHistory)
}

/** The node itself or its nearest ancestor that is a module or module candidate of its goal. */
function moduleOf(graph: LoadedGraph, node: GraphNode): GraphNode | undefined {
  const goal = goalOf(graph, node.id)
  if (goal === undefined) return undefined
  const ids = new Set([...modulesOf(graph, goal), ...moduleCandidatesOf(graph, goal)].map(module => module.id))
  return [node, ...ancestorsOf(graph, node)].find(entry => ids.has(entry.id))
}

/** Approved, doing or done, and the module's own stage is `release` or later; candidates and modules in design are not. */
function isReleased(module: GraphNode): boolean {
  return (module.status === 'approved' || module.status === 'doing' || module.status === 'done') && isPostRelease(module.stage)
}

/** A goal with modules or module candidates runs the two-level loop. */
function isSplit(graph: LoadedGraph, goal: GraphNode): boolean {
  return modulesOf(graph, goal).length > 0 || moduleCandidatesOf(graph, goal).length > 0
}

/** The direction list: the `norm-directions` norm while it is not done, dropped or superseded. */
export function directionsOf(graph: LoadedGraph): GraphNode | undefined {
  const node = graph.nodes.get(DIRECTIONS_ID)
  return node !== undefined && node.type === 'norm' && !CLOSED.has(node.status) ? node : undefined
}

// ---- end of the STAND-IN ----

/** The readers `releaseOf` and its neighbours call; tests inject a throwing one. */
export interface ModuleReaders {
  readonly modulesOf: (graph: LoadedGraph, goal: GraphNode) => readonly GraphNode[]
  readonly moduleCandidatesOf: (graph: LoadedGraph, goal: GraphNode) => readonly GraphNode[]
  readonly moduleOf: (graph: LoadedGraph, node: GraphNode) => GraphNode | undefined
  readonly isReleased: (module: GraphNode) => boolean
  readonly isSplit: (graph: LoadedGraph, goal: GraphNode) => boolean
}

export const MODULE_READERS: ModuleReaders = { modulesOf, moduleCandidatesOf, moduleOf, isReleased, isSplit }

/** A released node and when it last entered the released state (null when no history entry says). */
interface Released {
  readonly id: string
  readonly at: string | null
}

export type ReleaseResult =
  | { readonly ok: true, readonly goal: Released, readonly module?: Released }
  | { readonly ok: false, readonly level: 'module' | 'goal', readonly node: string, readonly stage: Stage | null, readonly reason?: undefined }
  /** The module structure could not be read while the goal is split: dispatch and writes are refused (R5-F3). */
  | { readonly ok: false, readonly level: 'module', readonly reason: 'unreadable' }

/** Whether a stage change moves the node into the released state, from a stage before `release` or from none. */
function entersRelease(change: { readonly from: unknown, readonly to: unknown }): boolean {
  return isPostRelease(change.to) && !isPostRelease(change.from)
}

/**
 * When the node last entered the released state: the `at` of the latest
 * history entry that changed its `stage` from before `release` (or from
 * none) to `release` or later. Null when the node is not in the released
 * state now (not approved, doing or done, or its stage is before `release`),
 * has no stage, or no entry says when. A module sent back to design and
 * released again gets a new time, which is what makes work dispatched before
 * the return stale (§3.5.3).
 */
export function releaseAtOf(node: GraphNode): string | null {
  const now = node.status === 'approved' || node.status === 'doing' || node.status === 'done'
  if (!now || !isPostRelease(node.stage)) return null
  for (let index = node.history.length - 1; index >= 0; index--) {
    const entry = node.history[index]
    const change = entry.changes?.stage
    if (change !== undefined && entersRelease(change)) return entry.at
  }
  return null
}

/** Whether a stage write moved the node from `release` or later back to `design` (the second and third tier, §3.9.7). */
export function sentBack(node: GraphNode): boolean {
  return node.history.some(entry => {
    const change = entry.changes?.stage
    return change !== undefined && change.to === 'design' && isPostRelease(change.from)
  })
}

/** Whether the goal itself has a feature child with a stage that is not dropped or superseded: read from the raw graph, never through the readers. */
function hasStagedFeatures(graph: LoadedGraph, goal: GraphNode): boolean {
  return featureChildren(graph, goal).some(node => node.stage !== undefined && !GONE.has(node.status))
}

/** The goal layer of the release check: approved or doing, and no stage or `release` and later. */
export function goalLayer(goal: GraphNode): ReleaseResult {
  const stage = effectiveStage(goal)
  const open = goal.status === 'approved' || goal.status === 'doing'
  if (!open || (stage !== null && !isPostRelease(stage))) return { ok: false, level: 'goal', node: goal.id, stage }
  return { ok: true, goal: { id: goal.id, at: releaseAtOf(goal) } }
}

/**
 * Whether the module and the goal a task lives in are released (§2.4). The
 * module layer is checked first: the nearest module of the task, if any,
 * must satisfy `isReleased`; a task outside every module skips it. Then the
 * goal layer. When `task` is the goal itself (the review of the whole goal),
 * only the goal layer is checked.
 *
 * Fail-closed (R5-F3): if the module readers throw and the goal has a direct
 * feature child with a stage (read from the raw graph), the result is the
 * `unreadable` failure. A goal without such a feature has no modules to
 * misread, so a throwing reader is ignored and only the goal layer counts.
 */
export function releaseOf(graph: LoadedGraph, task: GraphNode, readers: ModuleReaders = MODULE_READERS): ReleaseResult {
  const goal = goalOf(graph, task.id)
  if (goal === undefined) return { ok: false, level: 'goal', node: task.id, stage: null }
  let module: GraphNode | undefined
  if (task.type !== 'goal') {
    try {
      module = readers.moduleOf(graph, task)
      if (module !== undefined && !readers.isReleased(module)) return { ok: false, level: 'module', node: module.id, stage: effectiveStage(module) }
    }
    catch {
      if (hasStagedFeatures(graph, goal)) return { ok: false, level: 'module', reason: 'unreadable' }
      module = undefined
    }
  }
  const layer = goalLayer(goal)
  if (!layer.ok) return layer
  return { ok: true, goal: layer.goal, ...(module === undefined ? {} : { module: { id: module.id, at: releaseAtOf(module) } }) }
}

/**
 * The fixed acceptance of a module's design-review task. Only a person can
 * change acceptance, so a design review never carries a depth of its own:
 * it is always a full review (§3.7.5).
 */
export const DESIGN_REVIEW_ACCEPTANCE = 'verdict APPROVED against every item of norm-directions and every acceptance item of the module'

/**
 * A module's design-review task (§3.7.5): `kind: review`, no write scope,
 * `source` edges that all point at decisions under a module. The harness
 * proposes it, so the first history entry must be the harness's own propose:
 * an ordinary review task cites decisions too, and without this check one
 * that sits under an unreleased module would pass for a design review.
 * A reader that throws makes the answer false (the stricter side: the task
 * then goes through the module-layer check like any other).
 */
export function isDesignReview(graph: LoadedGraph, task: GraphNode, readers: ModuleReaders = MODULE_READERS): boolean {
  if (task.type !== 'task' || task.kind !== 'review' || (task.writeScope ?? []).length > 0) return false
  if (task.history[0]?.actor !== 'harness') return false
  const sources = (task.edges ?? []).filter(edge => edge.type === 'source')
  if (sources.length === 0) return false
  try {
    return sources.every(edge => {
      const target = graph.nodes.get(edge.to)
      return target !== undefined && target.type === 'decision' && readers.moduleOf(graph, target) !== undefined
    })
  }
  catch {
    return false
  }
}

/** Modules and module candidates of the goal that are still in design: an effective stage before `release`, not dropped or superseded. */
function modulesInDesign(graph: LoadedGraph, goal: GraphNode, readers: ModuleReaders): ReadonlySet<string> {
  const inDesign = (module: GraphNode): boolean => {
    const stage = effectiveStage(module)
    return !GONE.has(module.status) && stage !== null && !isPostRelease(stage)
  }
  return new Set([...readers.modulesOf(graph, goal), ...readers.moduleCandidatesOf(graph, goal)].filter(inDesign).map(module => module.id))
}

/**
 * The tasks a goal or module is judged by (§2.4): the task nodes of its
 * subtree, without module design reviews (they are not work to merge, and
 * would keep a released module looking busy). For a goal, also without the
 * tasks under a module still in design, so a module sent back to design
 * does not make the goal look in development.
 */
export function scopedTasks(graph: LoadedGraph, node: GraphNode, readers: ModuleReaders = MODULE_READERS): GraphNode[] {
  const tasks = subtreeOf(childrenIndex(graph), node).filter(entry => entry.type === 'task' && !isDesignReview(graph, entry, readers))
  if (node.type !== 'goal') return tasks
  const inDesign = modulesInDesign(graph, node, readers)
  return tasks.filter(task => {
    const module = readers.moduleOf(graph, task)
    return module === undefined || !inDesign.has(module.id)
  })
}
