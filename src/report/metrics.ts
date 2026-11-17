/**
 * The four delivery numbers (M7 design 0.6 §3.13, m7-9): the weekly deploy
 * count, the median time from a task's first dispatch to its landing, the
 * change failure rate, and the time to restore — computed from the harness's
 * own records (advances.jsonl, checks.jsonl) and the project graph, never
 * from a model's words. "Deployment" here means one verified forward move of
 * the trunk (§3.13's reading of 部署).
 *
 * The numbers go into the metrics journal as one `operate.dora` event per
 * weekly report call (`doraBody`); they never enter the report text — the
 * person decided ratios stay off the model context
 * (`d-metrics-ratios-person-only`, metrics design 0.7 §14 M7 ③), and the
 * board and CLI grow their readers from the journal. The restore half of
 * §3.13 (a failed batch L4 to its fix landing) has no durable record yet and
 * is not invented here; the trunk-check half is the number below.
 *
 * Pure like the other reports: the window bounds come in with the input, and
 * the event body leaves a field out when its cohort is empty or its source
 * (the graph) is unreadable — an absent optional field is "not computed",
 * never a fabricated zero.
 */
import type { AdvanceRecord } from '../execute/advance.ts'
import { parseDispatchComment } from '../execute/attempts.ts'
import type { VerifiedCheck } from '../execute/check.ts'
import { median } from '../metrics/calc.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import type { OperateBodies } from '../shared/metrics.ts'

/** How long after a landing a reopen, a sourced fix task or a trunk breakage still counts as its failure (§3.13). */
const FAILURE_WINDOW_MS = 14 * 86_400_000

export interface DoraInput {
  /** The moment the numbers are made, epoch milliseconds (the window's exclusive end). */
  readonly nowMs: number
  /** The window's inclusive start, epoch milliseconds; undefined reads the whole history. */
  readonly sinceMs: number | undefined
  /** The project's `advances.jsonl` records, in journal order. */
  readonly advances: readonly AdvanceRecord[]
  /** The project's verified `checks.jsonl` records. */
  readonly checks: readonly VerifiedCheck[]
  /** The project graph; undefined when it could not be read (the dispatch-derived numbers are left out). */
  readonly graph: LoadedGraph | undefined
}

/** The four numbers; the optional members are absent when their cohort is empty or the graph is unreadable. */
export interface DoraNumbers {
  /** 交付频率, and the change failure rate's denominator: verified forward moves of the trunk in the window. */
  readonly deploys: number
  /** 变更前置时间: the tasks in the window's lead-time cohort. */
  readonly leadTasks: number
  /** 变更前置时间: the median lead in milliseconds, absent without a cohort. */
  readonly leadMs?: number | undefined
  /** 变更失败率: the window's deployments a failure marker names in the 14 days after them, absent when the graph is unreadable. */
  readonly failed?: number | undefined
  /** 恢复时长: the trunk-check failures of the window that have a later pass. */
  readonly restoreN: number
  /** 恢复时长: the median restore in milliseconds, absent without a resolved incident. */
  readonly restoreMs?: number | undefined
}

/** One verified forward move of the trunk. */
interface Deploy {
  readonly at: number
  /** The commit the trunk moved to. */
  readonly to: string
  /** The tasks the advance's `Hourness-Task` trailers named. */
  readonly tasks: readonly string[]
  /** The first commit after this one (the next local record's `to`), or undefined while it is the newest on the trunk. */
  readonly successor: string | undefined
}

/** The moment of one journal instant, NaN when absent or not a date. */
const momentOf = (at: string | undefined): number => at === undefined ? Number.NaN : Date.parse(at)

/** The dispatch comments of one node (第 N 次派发), oldest first, as their moments. */
function dispatchMoments(node: GraphNode): number[] {
  return node.history
    .flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined && parseDispatchComment(entry.text) !== undefined ? [momentOf(entry.at)] : [])
    .filter(moment => !Number.isNaN(moment))
}

/** The reopens of one node (done back to doing), as their moments. */
function reopenMoments(node: GraphNode): number[] {
  return node.history
    .flatMap(entry => entry.op === 'status' && entry.from === 'done' && entry.to === 'doing' ? [momentOf(entry.at)] : [])
    .filter(moment => !Number.isNaN(moment))
}

/** The moments the tasks appeared that name `task` as their source (`source` edge to it), unsorted; shared with the floor proposals' rework look (m7-8). */
export function sourcedMoments(graph: LoadedGraph, task: string): number[] {
  const moments: number[] = []
  for (const node of graph.nodes.values()) {
    if (!(node.edges ?? []).some(edge => edge.type === 'source' && edge.to === task)) continue
    const at = momentOf(node.history[0]?.at)
    if (!Number.isNaN(at)) moments.push(at)
  }
  return moments
}

/** Every verified forward move of the trunk that carries a moment, in journal order, each with the first non-rollback trunk commit after it. */
function deploymentsOf(advances: readonly AdvanceRecord[]): Deploy[] {
  const landed: { readonly at: number, readonly to: string, readonly tasks: readonly string[], readonly index: number }[] = []
  for (let index = 0; index < advances.length; index++) {
    const line = advances[index]
    if (line === undefined || line.ref !== 'local' || line.ok !== true || line.rollback === true) continue
    const at = momentOf(line.at)
    if (Number.isNaN(at)) continue
    landed.push({ at, to: line.to, tasks: line.tasks ?? [], index })
  }
  return landed.map(({ at, to, tasks, index }) => ({
    at,
    to,
    tasks,
    successor: advances.find((line, later) => later > index && line.ref === 'local' && line.rollback !== true && line.from === to)?.to,
  }))
}

/** The lead of one (deployment, task) pair: the deployment's moment minus the journey's first dispatch, undefined when the journey cannot be read. The journey starts after the previous landing of the same task, so a rework's second landing measures its own dispatches (口径 in the lane progress). */
function leadOf(deploy: Deploy, task: string, graph: LoadedGraph, boundary: number): number | undefined {
  const node = graph.nodes.get(task)
  if (node === undefined) return undefined
  const start = dispatchMoments(node).find(moment => moment > boundary)
  if (start === undefined || start > deploy.at) return undefined
  return deploy.at - start
}

/** The window's deployments, each marked when §3.13's three failure conditions name it within the 14 days after it. */
function failureMarks(deployList: readonly Deploy[], checks: readonly VerifiedCheck[], graph: LoadedGraph): boolean[] {
  return deployList.map((deploy) => {
    const until = deploy.at + FAILURE_WINDOW_MS
    const inWindow = (moment: number): boolean => moment > deploy.at && moment <= until
    const reopened = deploy.tasks.some((task) => {
      const node = graph.nodes.get(task)
      return node !== undefined && reopenMoments(node).some(inWindow)
    })
    const fixed = !reopened && deploy.tasks.some(task => sourcedMoments(graph, task).some(inWindow))
    const broke = deploy.successor !== undefined
      && checks.some(record => record.kind === 'trunk' && record.passed === false && record.commit === deploy.successor && inWindow(momentOf(record.at)))
    return reopened || fixed || broke
  })
}

/** The resolved restore incidents: each trunk failure of the window to the first later passing trunk record, whatever commit it ran on. */
function restoreOf(checks: readonly VerifiedCheck[], sinceMs: number, nowMs: number): number[] {
  const trunk = checks.filter(record => record.kind === 'trunk')
    .map(record => ({ passed: record.passed, at: momentOf(record.at) }))
    .filter(record => !Number.isNaN(record.at))
    .sort((a, b) => a.at - b.at)
  const durations: number[] = []
  for (let index = 0; index < trunk.length; index++) {
    const failed = trunk[index]
    if (failed === undefined || failed.passed || failed.at < sinceMs || failed.at >= nowMs) continue
    const restored = trunk.find((record, later) => later > index && record.passed)
    if (restored !== undefined) durations.push(restored.at - failed.at)
  }
  return durations
}

/** Compute the four numbers (§3.13). The window is `[sinceMs, nowMs)`; undefined `sinceMs` reads the whole history. */
export function dora(input: DoraInput): DoraNumbers {
  const sinceMs = input.sinceMs ?? Number.NEGATIVE_INFINITY
  const landed = deploymentsOf(input.advances)
  const deployList = landed.filter(deploy => deploy.at >= sinceMs && deploy.at < input.nowMs)
  const leads: number[] = []
  if (input.graph !== undefined) {
    for (const deploy of deployList) {
      for (const task of deploy.tasks) {
        // The journey's boundary is the task's previous landing wherever it fell — the whole journal,
        // not only the window's deployments, or a rework's second landing would measure from its first
        // dispatch ever.
        const boundary = landed.reduce((latest, earlier) => earlier.at < deploy.at && earlier.tasks.includes(task) && earlier.at > latest ? earlier.at : latest, Number.NEGATIVE_INFINITY)
        const lead = leadOf(deploy, task, input.graph, boundary)
        if (lead !== undefined) leads.push(lead)
      }
    }
  }
  const restores = restoreOf(input.checks, sinceMs, input.nowMs)
  return {
    deploys: deployList.length,
    leadTasks: leads.length,
    leadMs: median(leads),
    ...(input.graph === undefined ? {} : { failed: failureMarks(deployList, input.checks, input.graph).filter(mark => mark).length }),
    restoreN: restores.length,
    restoreMs: median(restores),
  }
}

/** The event body the weekly report call emits (`operate.dora`): counts and medians only, the ratios a reader divides. */
export function doraBody(numbers: DoraNumbers): OperateBodies['operate.dora'] {
  return {
    deploys: numbers.deploys,
    leadTasks: numbers.leadTasks,
    ...(numbers.leadMs === undefined ? {} : { leadMs: numbers.leadMs }),
    ...(numbers.failed === undefined ? {} : { failed: numbers.failed }),
    restoreN: numbers.restoreN,
    ...(numbers.restoreMs === undefined ? {} : { restoreMs: numbers.restoreMs }),
  }
}
