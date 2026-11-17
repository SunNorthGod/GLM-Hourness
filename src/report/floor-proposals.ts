/**
 * The must-review floor proposals of the weekly report (M7 design 0.6
 * §3.12.3, m7-8): when the rework after reviewed-down work keeps
 * concentrating on one kind of change, propose adding that kind to the
 * `norm-review-floor` list. The person alone widens the list
 * (`d-rules-human-only`); the harness only carries the numbers and the
 * four-line draft (`askDraft('floor-add')`), and relaxing the list is never
 * proposed — the person asks for that.
 *
 * The demoted cohort (§3.12.3): write tasks whose effective review depth was
 * light or skip — the handback comment's 「有效深浅」 line when the review
 * ran (it names 全审 when the floor raised it, which takes the task out of
 * the cohort), the dispatch's declared depth otherwise, with a declared 不审
 * standing as skip — that landed within the window. Reworked: the task was
 * reopened, or a task naming it as `source` appeared, within fourteen days
 * of a landing. The proposal fires for a top-level directory whose reworked
 * count reaches two inside twenty-eight days and whose path no `files` entry
 * of the floor already covers.
 *
 * The changed paths come from the handback comment's 改动 line (2026-11-17,
 * branch hback-paths): the done handback records the file list its own git
 * diff against the dispatch base read, and `floorTasks` reads the latest
 * comment that carries the line. Comments written before the line existed
 * record none — such a task contributes no group rather than a made-up one.
 * Like every report this is pure: the clock comes in with the input.
 */
import { parseDispatchComment, parseHandbackComment } from '../execute/attempts.ts'
import { sourcedMoments } from './metrics.ts'
import { floorPathIn, type ParsedFloor } from '../execute/floor.ts'
import { askDraft, type Ask } from '../execute/asks.ts'
import { reopensAfter } from '../graph/reopen.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'

/** How long after a landing a reopen or a sourced fix task still counts as its rework (§3.12.3 「进主干后 14 天内」). */
const REWORK_WINDOW_MS = 14 * 86_400_000
/** How far back the proposal looks for the demoted cohort and its rework (§3.12.3 「近 28 天」). */
const LOOKBACK_MS = 28 * 86_400_000
/** Reworked pieces in one group that point at a floor addition (§3.12.3 「不少于 2 件」). */
const GROUP_REWORKED = 2

/** One demoted task the floor proposals read, with the moments its rework happened. */
export interface FloorTaskFact {
  /** The task node's id. */
  readonly task: string
  /** The effective review depth: light, or skip (never dispatched to review). */
  readonly depth: 'light' | 'skip'
  /** The moments the task landed on the trunk, oldest first (the 「进主干」 evidence comments). */
  readonly landings: readonly number[]
  /** The rework moments within fourteen days of a landing: reopens and sourced fix tasks. */
  readonly reworkMs: readonly number[]
  /** The paths the task changed, as the handback comment's 改动 line carries them; empty on comments written before the line existed (the count-only fallback). */
  readonly paths: readonly string[]
}

export interface FloorInput {
  /** The moment the proposals are made, epoch milliseconds (the window's exclusive end). */
  readonly nowMs: number
  /** The demoted tasks with their rework moments (`floorTasks`). */
  readonly tasks: readonly FloorTaskFact[]
  /** The floor parsed from the `norm-review-floor` node (`parseFloor`). */
  readonly floor: ParsedFloor
}

/** One kind of change the numbers say to add to the floor, with the facts and the draft that carry it. */
export interface FloorGroupProposal {
  /** The directory prefix to add, one path. */
  readonly paths: readonly string[]
  /** The demoted tasks of the group that landed in the window. */
  readonly declared: number
  /** Of those, the ones that came back. */
  readonly reworked: number
  /** The matter for the main agent: facts and the four-line draft (`askDraft('floor-add')`). */
  readonly ask: Ask
}

/** The top-level bucket a changed path counts under: its first segment (a directory bucket) or the root file itself, paired with the path `floorPathIn` probes. */
function bucketOf(path: string): { readonly name: string, readonly probe: string } {
  const slash = path.indexOf('/')
  if (slash < 0) return { name: path, probe: path }
  const dir = path.slice(0, slash)
  return { name: dir, probe: `${dir}/` }
}

/** Every `files` path the floor names, for the already-covered check. */
function floorFilePaths(floor: ParsedFloor): readonly string[] {
  return floor.entries.flatMap(entry => entry.tests.flatMap(test => test.form === 'files' ? test.paths : []))
}

/** Compute the floor proposals of the window (§3.12.3), groups in first-seen order. */
export function floorProposals(input: FloorInput): readonly FloorGroupProposal[] {
  const sinceMs = input.nowMs - LOOKBACK_MS
  const covered = floorFilePaths(input.floor)
  const groups = new Map<string, { declared: Set<string>, reworked: Set<string> }>()
  for (const task of input.tasks) {
    if (!task.landings.some(landing => landing >= sinceMs && landing < input.nowMs)) continue
    const cameBack = task.reworkMs.some(moment => moment >= sinceMs && moment < input.nowMs)
    for (const path of task.paths) {
      const { name, probe } = bucketOf(path)
      if (floorPathIn(covered, probe)) continue
      const group = groups.get(name) ?? { declared: new Set<string>(), reworked: new Set<string>() }
      if (!groups.has(name)) groups.set(name, group)
      group.declared.add(task.task)
      if (cameBack) group.reworked.add(task.task)
    }
  }
  const proposals: FloorGroupProposal[] = []
  for (const [dir, group] of groups) {
    if (group.reworked.size < GROUP_REWORKED) continue
    proposals.push({
      paths: [dir],
      declared: group.declared.size,
      reworked: group.reworked.size,
      ask: askDraft('floor-add', { paths: [dir], reworked: group.reworked.size, declared: group.declared.size }),
    })
  }
  return proposals
}

/** The dispatch comments of one node, oldest first, with their declared review depth (write tasks only). */
function declaredDepths(node: GraphNode): readonly ('full' | 'light' | 'skip')[] {
  return node.history
    .flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseDispatchComment(entry.text)] : [])
    .flatMap(record => record?.review === undefined ? [] : [record.review])
}

/** The effective depths the handback comments name: 全审 when the floor raised it, 轻审 when the review ran light. */
function effectiveDepths(node: GraphNode): readonly ('全审' | '轻审')[] {
  return node.history
    .flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseHandbackComment(entry.text)] : [])
    .flatMap(record => record?.depth === undefined ? [] : [record.depth])
}

/** The moments the trunk-landing evidence comments were written, oldest first. */
function landingMoments(node: GraphNode): number[] {
  return node.history
    .flatMap(entry => entry.op === 'comment' && entry.text !== undefined && entry.text.startsWith('进主干 ') ? [Date.parse(entry.at)] : [])
    .filter(moment => !Number.isNaN(moment))
}

/** The rework moments of one task within fourteen days of any landing: reopens plus sourced fix tasks. */
function reworkMoments(graph: LoadedGraph, node: GraphNode, landings: readonly number[]): number[] {
  const moments: number[] = []
  for (const landing of landings) {
    const until = landing + REWORK_WINDOW_MS
    for (const reopen of reopensAfter(node, new Date(landing).toISOString())) {
      const at = Date.parse(reopen.at)
      if (!Number.isNaN(at) && at <= until) moments.push(at)
    }
    for (const at of sourcedMoments(graph, node.id)) {
      if (at > landing && at <= until) moments.push(at)
    }
  }
  return moments.sort((a, b) => a - b)
}

/** The changed paths the task's handback comments record: the latest comment that carries the 改动 line, none when no comment does (comments written before the line existed). */
function recordedPaths(node: GraphNode): readonly string[] {
  return node.history
    .flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseHandbackComment(entry.text)] : [])
    .flatMap(record => record?.paths === undefined ? [] : [record.paths])
    .at(-1) ?? []
}

/**
 * The demoted cohort the project graph holds (§3.12.3): landed write tasks
 * whose effective review depth was light or skip, each with its landing and
 * rework moments. The latest dispatch's declaration stands when no handback
 * names an effective depth; a handback naming 全审 (the floor raised it)
 * takes the task out. Tasks without a landing evidence comment have not
 * landed and are not cohort. The paths are the handback comment's 改动
 * record, empty when no comment carries it.
 */
export function floorTasks(graph: LoadedGraph): readonly FloorTaskFact[] {
  const facts: FloorTaskFact[] = []
  for (const node of graph.nodes.values()) {
    if (node.type !== 'task') continue
    const effective = effectiveDepths(node).at(-1)
    if (effective === '全审') continue
    const declared = declaredDepths(node).at(-1)
    const depth = effective === '轻审' ? 'light' : declared === 'light' ? 'light' : declared === 'skip' ? 'skip' : undefined
    if (depth === undefined) continue
    const landings = landingMoments(node)
    if (landings.length === 0) continue
    facts.push({ task: node.id, depth, landings, reworkMs: reworkMoments(graph, node, landings), paths: recordedPaths(node) })
  }
  return facts
}
