/**
 * Execution stage of a goal or module, read from the graph (M7 design
 * .agents/tasks/m7/design.md 0.6 §2.4, §3.9.3): M7 writes no stage, it
 * derives what it needs. Pure functions over a loaded graph; no file system
 * and no Node built-ins, so the host rows and the DSH client import the same
 * rules.
 *
 * This file holds what the dispatch gate, the write gate, the pins, the
 * derived stage and the completion gate need:
 * - `releaseOf` (is the module and the goal a task lives in released),
 *   `releaseAtOf`, `sentBack`;
 * - `scopedTasks` (the tasks a goal or module is judged by) and
 *   `isDesignReview` (a module's design-review task);
 * - `derivedStage` (the stage a goal or module is really in once the design
 *   loop has let go) and `goalCompletion` (the gate behind
 *   `update_goal complete`).
 *
 * Module readers: the design reads the module structure through M3's
 * src/graph/modules.ts (addendum 0.5 §3.14.1), which is on main since the M3
 * merge; the STAND-IN block E1a carried is gone. `ModuleReaders` stays as the
 * injection type, so a test can hand a reader that throws (R5-F3, the
 * fail-closed case).
 */
import { directionsOf, isReleased, isSplit, moduleCandidatesOf, moduleOf, modulesOf } from './modules.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf, childrenIndex, subtreeOf } from './projection.ts'
import { STAGES, type GraphNode, type Stage } from './schema.ts'
import { effectiveStage, goalOf } from './stage.ts'

export { directionsOf }

/** The readers `releaseOf` and its neighbours call; tests inject a throwing one. */
export interface ModuleReaders {
  readonly modulesOf: (graph: LoadedGraph, goal: GraphNode) => readonly GraphNode[]
  readonly moduleCandidatesOf: (graph: LoadedGraph, goal: GraphNode) => readonly GraphNode[]
  readonly moduleOf: (graph: LoadedGraph, node: GraphNode) => GraphNode | undefined
  readonly isReleased: (module: GraphNode) => boolean
  readonly isSplit: (graph: LoadedGraph, goal: GraphNode) => boolean
}

export const MODULE_READERS: ModuleReaders = { modulesOf, moduleCandidatesOf, moduleOf, isReleased, isSplit }

/** Whether a stage value is `release` or one of the stages after it. */
export function isPostRelease(stage: unknown): boolean {
  return typeof stage === 'string' && STAGES.indexOf(stage as Stage) >= STAGES.indexOf('release')
}

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
 * state now (not approved, doing or done, or its stage is before `release`)
 * or has no stage. A node no entry moved into the released state was
 * released from its creation: its first history entry's `at` (§3.9.7's
 * failure table), null when it has no history. A module sent back to design
 * and released again gets a new time, which is what makes work dispatched
 * before the return stale (§3.5.3).
 */
export function releaseAtOf(node: GraphNode): string | null {
  const now = node.status === 'approved' || node.status === 'doing' || node.status === 'done'
  if (!now || !isPostRelease(node.stage)) return null
  for (let index = node.history.length - 1; index >= 0; index--) {
    const entry = node.history[index]
    const change = entry.changes?.stage
    if (change !== undefined && entersRelease(change)) return entry.at
  }
  return node.history.at(0)?.at ?? null
}

/** Whether a stage write moved the node from `release` or later back to `design` (the second and third tier, §3.9.7). */
export function sentBack(node: GraphNode): boolean {
  return node.history.some(entry => {
    const change = entry.changes?.stage
    return change !== undefined && change.to === 'design' && isPostRelease(change.from)
  })
}

const GONE: ReadonlySet<string> = new Set(['dropped', 'superseded'])

/** Whether the goal itself has a feature child with a stage that is not dropped or superseded: read from the raw graph, never through the readers. */
function hasStagedFeatures(graph: LoadedGraph, goal: GraphNode): boolean {
  return [...graph.nodes.values()].some(node => node.parent === goal.id && node.type === 'feature' && node.stage !== undefined && !GONE.has(node.status))
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

/**
 * The modules and module candidates of the goal that are still in design:
 * an effective stage before `release`, not dropped or superseded. A reader
 * that throws reads every feature child as in design — the strict side the
 * two-level loop asks for on every unreadable read (§3.9.7 failure table).
 */
function modulesInDesign(graph: LoadedGraph, goal: GraphNode, readers: ModuleReaders): ReadonlySet<string> {
  const inDesign = (module: GraphNode): boolean => {
    const stage = effectiveStage(module)
    return !GONE.has(module.status) && stage !== null && !isPostRelease(stage)
  }
  try {
    return new Set([...readers.modulesOf(graph, goal), ...readers.moduleCandidatesOf(graph, goal)].filter(inDesign).map(module => module.id))
  }
  catch {
    return new Set([...graph.nodes.values()].filter(node => node.parent === goal.id && node.type === 'feature').map(node => node.id))
  }
}

/**
 * The tasks a goal or module is judged by (§2.4): the task nodes of its
 * subtree, without module design reviews (they are not work to merge, and
 * would keep a released module looking busy). For a goal, also without the
 * tasks under a module still in design, so a module sent back to design
 * does not make the goal look in development. A reader that throws keeps the
 * tasks but reads every module as in design, so a split goal does not look
 * executable while its modules are unreadable.
 */
export function scopedTasks(graph: LoadedGraph, node: GraphNode, readers: ModuleReaders = MODULE_READERS): GraphNode[] {
  const tasks = subtreeOf(childrenIndex(graph), node).filter(entry => entry.type === 'task' && !isDesignReview(graph, entry, readers))
  if (node.type !== 'goal') return tasks
  const inDesign = modulesInDesign(graph, node, readers)
  return tasks.filter(task => {
    try {
      const module = readers.moduleOf(graph, task)
      return module === undefined || !inDesign.has(module.id)
    }
    catch {
      return true
    }
  })
}

// ---- derived stage (§2.4) ----

const CLOSED: ReadonlySet<string> = new Set(['done', 'dropped', 'superseded'])

/** Whether a task can start now, with the definition of `openItems` (src/graph/projection.ts). */
function isReady(graph: LoadedGraph, task: GraphNode): boolean {
  if (task.status !== 'approved') return false
  const children = childrenIndex(graph).get(task.id) ?? []
  if (!children.every(child => child.status === 'dropped' || child.status === 'superseded')) return false
  return (task.edges ?? []).every(edge => {
    if (edge.type !== 'depends') return true
    const target = graph.nodes.get(edge.to)
    return target !== undefined && target.status === 'done'
  })
}

/**
 * Whether the task is the review of a work task in scope (§3.7.1 puts it
 * under the task it reviews, with a `source` edge to it). The design's
 * stage table counts the work: a review task is the waiting itself, not
 * work — its being open is what makes its task wait (the next function).
 */
function isWorkReview(graph: LoadedGraph, task: GraphNode, inScope: ReadonlySet<string>): boolean {
  if (task.type !== 'task' || task.kind !== 'review' || (task.writeScope ?? []).length > 0) return false
  return (task.edges ?? []).some(edge => edge.type === 'source' && inScope.has(edge.to) && graph.nodes.get(edge.to)?.type === 'task')
}

/**
 * Whether a task's work waits for its review: the task is open and a review
 * task of its own is not closed — the review task exists only once the
 * harness processed a finished handback (§3.7.1), and it closes when the
 * review passes (§3.7.3).
 */
function waitsForReview(graph: LoadedGraph, task: GraphNode): boolean {
  if (CLOSED.has(task.status)) return false
  return subtreeOf(childrenIndex(graph), task).some(entry =>
    entry.id !== task.id && entry.type === 'task' && entry.kind === 'review' && !CLOSED.has(entry.status) && (entry.edges ?? []).some(edge => edge.type === 'source' && edge.to === task.id))
}

/**
 * The stage a goal or module is really in (§2.4). While the stage it names
 * is before `release` the design loop still runs it, and that stage is the
 * answer (a module in design reads `design`). Past it, the table, taken
 * over the work tasks (a review of work in scope is not work to do):
 * `operate` when done; a split goal no module of which is released or done
 * is still in `release` (the big loop let go, no module's work has); a task
 * doing or ready puts it in `execute`; every task closed, or closed or
 * waiting for its review, puts it in `merge`; nothing dispatchable is
 * `decompose`. A goal without a stage (it did not run the design loop) runs
 * the same table once approved. `node` is a goal or a module; another node
 * derives from its own subtree the same way.
 */
export function derivedStage(graph: LoadedGraph, node: GraphNode, readers: ModuleReaders = MODULE_READERS): Stage {
  if (node.status === 'done') return 'operate'
  const stage = effectiveStage(node)
  if (stage !== null && !isPostRelease(stage)) return stage
  if (node.type === 'goal') {
    let split: boolean
    let releasedOrDone: readonly GraphNode[] = []
    try {
      split = readers.isSplit(graph, node)
      releasedOrDone = readers.modulesOf(graph, node).filter(module => readers.isReleased(module) || module.status === 'done')
    }
    catch {
      // An unreadable module structure reads as split with nothing released:
      // the stage stays at release, the strict side (R5-F3).
      split = hasStagedFeatures(graph, node)
    }
    if (split && releasedOrDone.length === 0) return 'release'
  }
  const tasks = scopedTasks(graph, node, readers)
  const ids = new Set(tasks.map(task => task.id))
  const work = tasks.filter(task => !isWorkReview(graph, task, ids))
  if (work.some(task => task.status === 'doing' || isReady(graph, task))) return 'execute'
  if (work.length > 0 && work.every(task => CLOSED.has(task.status) || waitsForReview(graph, task))) return 'merge'
  return 'decompose'
}

// ---- completion gate (§3.9.3) ----

/** The git facts and the live dispatches `goalCompletion` judges by; the caller reads them. */
export interface CompletionFacts {
  /** Whether the commit's content is on the trunk now: an ancestor, or its task trailer on some trunk commit. */
  readonly onTrunk: (commit: string) => boolean
  /** Whether `older` is an ancestor of `newer` (both commit ids), or the same commit. */
  readonly isAncestor: (older: string, newer: string) => boolean
  /** The childIds of dispatches alive in this process: workers, reviews, acceptance reviews, checks. */
  readonly running: ReadonlySet<string>
  /** The task ids a merge check that is still running covers (the check backend's jobs, §3.9.3 point 6). */
  readonly runningChecks: readonly string[]
  /**
   * The pins line of the acceptance review, checked against the goal now;
   * the reason it is stale, or undefined when it is fresh. The caller runs
   * `staleness` from src/graph/pins.ts, which imports this file.
   */
  readonly pinsFresh: (pinsLine: string) => string | undefined
}

const ACCEPTANCE_ROUND = /^验收审查第 (\d+) 轮：(APPROVED|CHANGES_REQUESTED) · 挡路 (\d+) · (\S+) · @([0-9a-f]{7,40}) · (pins: .+?)(?: · 停下)?$/

/** One acceptance-review round comment on a goal (§3.9.4). */
export interface AcceptanceRound {
  readonly k: number
  readonly verdict: 'APPROVED' | 'CHANGES_REQUESTED'
  readonly blocking: number
  readonly childId: string
  readonly commit: string
  readonly pins: string
  readonly stopped: boolean
  readonly at: string
}

/** The goal's acceptance-review round comments, oldest first (§3.9.4). */
export function acceptanceRounds(goal: GraphNode): readonly AcceptanceRound[] {
  const rounds: AcceptanceRound[] = []
  for (const entry of goal.history) {
    if (entry.op !== 'comment' || typeof entry.text !== 'string') continue
    const match = ACCEPTANCE_ROUND.exec(entry.text)
    if (match !== null) {
      rounds.push({
        k: Number(match[1]),
        verdict: match[2] as 'APPROVED' | 'CHANGES_REQUESTED',
        blocking: Number(match[3]),
        childId: match[4] ?? '',
        commit: match[5] ?? '',
        pins: match[6] ?? '',
        stopped: entry.text.endsWith('· 停下'),
        at: entry.at,
      })
    }
  }
  return rounds
}

/** The childIds a node's history names in dispatch and review comments (`hz-…`). */
function dispatchedChildren(node: GraphNode): readonly string[] {
  const ids: string[] = []
  for (const entry of node.history) {
    if (entry.op !== 'comment' || typeof entry.text !== 'string') continue
    for (const match of entry.text.matchAll(/hz-[A-Za-z0-9._-]+/g)) ids.push(match[0])
  }
  return ids
}

/** Whether a commit-evidence item was written by the harness: a history entry of its own carries it (§3.8.4 writes it that way). */
function harnessCommitted(node: GraphNode, ref: string): boolean {
  return node.history.some(entry => entry.actor === 'harness' && (entry.evidence ?? []).some(item => item.kind === 'commit' && item.ref === ref))
}

/**
 * The completion gate behind `update_goal complete` (§3.9.3), as one verdict
 * with every gap that keeps it: each task of the subtree closed (a task
 * under a closed ancestor is skipped, a module design review never counts),
 * done write tasks carry the harness's commit evidence and their content is
 * on the trunk, no question or proposal open, the goal's acceptance review
 * passed with fresh pins, every trunk commit inside the reviewed one, no
 * stop marker on it, nothing of this goal still running, and — for a split
 * goal — no module left in design. `gaps` holds the failing items in the
 * gate's order; the caller shows the first ten.
 */
export function goalCompletion(graph: LoadedGraph, goal: GraphNode, facts: CompletionFacts, readers: ModuleReaders = MODULE_READERS): { readonly ok: boolean, readonly gaps: readonly string[] } {
  const gaps: string[] = []
  const all = subtreeOf(childrenIndex(graph), goal).slice(1)
  // The nodes the gate counts: not under a closed task (0.2 评审 F22: its open
  // review children need not be closed) and no module design review (R5-F4).
  const counted = all.filter(node =>
    !ancestorsOf(graph, node).some(entry => entry.type === 'task' && CLOSED.has(entry.status)) && !isDesignReview(graph, node, readers))
  for (const node of counted) {
    if (node.type !== 'task') continue
    if (!CLOSED.has(node.status)) gaps.push(`task ${node.id} is ${node.status}; close it, or drop or supersede it`)
    if (node.status === 'done' && (node.writeScope ?? []).length > 0) {
      const commit = node.evidence?.find(entry => entry.kind === 'commit' && harnessCommitted(node, entry.ref) && facts.onTrunk(entry.ref))
      if (commit === undefined) {
        gaps.push(`task ${node.id} has no harness commit evidence on the trunk: run check_commit on the commit, fast-forward the trunk to it, and let the harness record it`)
      }
    }
  }
  for (const node of counted) {
    if (node.type === 'question' && (node.status === 'approved' || node.status === 'doing')) gaps.push(`question ${node.id} is still open`)
    if (node.status === 'proposed') gaps.push(`proposal ${node.id} is not decided yet`)
  }
  const latest = acceptanceRounds(goal).at(-1)
  if (latest === undefined) {
    gaps.push(`the goal's acceptance review has not passed: dispatch_task ${goal.id} with a model and why`)
  }
  else if (latest.stopped) {
    gaps.push('the acceptance review was stopped: the person has not answered yet')
  }
  else if (latest.verdict !== 'APPROVED' || latest.blocking !== 0) {
    gaps.push(`the goal's acceptance review has not passed: round ${latest.k} is ${latest.verdict} with ${latest.blocking} blocking`)
  }
  else {
    const stale = facts.pinsFresh(latest.pins)
    if (stale !== undefined) gaps.push(`the acceptance review's pins are stale (${stale}); review the goal again`)
    for (const node of counted) {
      if (node.type !== 'task' || node.status !== 'done') continue
      const commit = node.evidence?.find(entry => entry.kind === 'commit' && harnessCommitted(node, entry.ref))
      if (commit !== undefined && !facts.isAncestor(commit.ref, latest.commit)) {
        gaps.push(`task ${node.id}'s trunk commit ${commit.ref} is not in the reviewed trunk commit ${latest.commit}`)
      }
    }
  }
  const running = new Set([...all.filter(node => node.type === 'task').flatMap(dispatchedChildren), ...dispatchedChildren(goal)].filter(childId => facts.running.has(childId)))
  for (const childId of [...running].slice(0, 10)) gaps.push(`dispatch ${childId} is still running`)
  const ids = new Set(all.map(node => node.id))
  for (const task of [...new Set(facts.runningChecks)].filter(id => ids.has(id)).slice(0, 10)) gaps.push(`a merge check of task ${task} is still running`)
  try {
    if (readers.isSplit(graph, goal)) {
      for (const module of modulesInDesign(graph, goal, readers)) {
        gaps.push(`module ${module} has not been released: put its design to the person with propose_to_human (kind release, module ${module}), or drop the module`)
      }
    }
  }
  catch {
    gaps.push('the module structure could not be read; the completion gate waits until it can')
  }
  return { ok: gaps.length === 0, gaps }
}
