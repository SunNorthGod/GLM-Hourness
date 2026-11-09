/**
 * The two-level loop's judgements and the drive's decision table (M7 design
 * 0.6 §3.9.7, §3.9.1, §3.9.5). Pure functions over the graph and the facts
 * the caller read; the runtime wiring of the consequences is E8's (the drive
 * imports from here). Nothing reads a clock, a file or the peak service: the
 * restart-pause fact, the peak hold and the answer to "are the waited
 * questions decided" arrive as data — a goal that is `paused` is always the
 * person's (or a cancelled round), never the peak's
 * (`d-main-agent-peak-exempt`).
 *
 * - `returnsOf` — the stage writes that sent a module or the goal back to
 *   design (tiers two and three) and are not acknowledged yet.
 * - `pendingReport` — what the agent decided on its own since its last batch
 *   to the person (tier one: told, not asked).
 * - `batchOf` — the three matters that go out now, the rest to the next
 *   batch, in the fixed priority.
 * - `pendingRelease` — a release the drive has not started on yet (the
 *   goal's own, or one released module's), by the graph alone.
 * - `driveDecision` — the table §3.9.1 judges each step with, on the goal's
 *   view, the release, the session and the blocked reason.
 * - `nextCounters` — the two counters of an unproductive stretch: three idle
 *   rounds block `hourness-idle-rounds`; two rounds held by the peak block
 *   `hourness-peak-wait`.
 */
import { isReleased, modulesOf } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { childrenIndex, deciderOf, subtreeOf } from '../graph/projection.ts'
import type { GraphNode } from '../graph/schema.ts'
import { effectiveStage } from '../graph/stage.ts'
import { goalLayer, isPostRelease, releaseAtOf, type ModuleReaders, MODULE_READERS } from '../graph/execute-stage.ts'

// ---- returns (tiers two and three, §3.9.7) ----

/** One stage write that sent the node back to design and waits for its acknowledgement. */
export interface TierReturn {
  readonly node: string
  /** 2: a module sent back. 3: the goal's framework sent back. */
  readonly tier: 2 | 3
  /** The `at` of the write — the acknowledgement comment's key, and the time that makes the running work stale. */
  readonly at: string
}

const RETURN_ACK = '退回设计 · '

/**
 * The unacknowledged returns (§3.9.7): every write that moved a module or
 * the goal from `release` or later back to `design`, when the node carries
 * no comment naming it (`退回设计 · <at>`). The goal's own returns are tier
 * 3, a module's are tier 2. A return and its re-release inside one step
 * still show here, so the acknowledgement is written after the fact.
 */
export function returnsOf(graph: LoadedGraph, readers: ModuleReaders = MODULE_READERS): readonly TierReturn[] {
  const returns: TierReturn[] = []
  for (const node of graph.nodes.values()) {
    if (node.type !== 'goal' && node.type !== 'feature') continue
    for (const entry of node.history) {
      const change = entry.changes?.stage
      if (change === undefined || change.to !== 'design' || !isPostRelease(change.from)) continue
      if (node.type === 'feature') {
        try {
          if (readers.moduleOf(graph, node)?.id !== node.id) continue
        }
        catch {
          continue
        }
      }
      if (node.history.some(other => other.op === 'comment' && other.text?.startsWith(`${RETURN_ACK}${entry.at}`))) continue
      returns.push({ node: node.id, tier: node.type === 'goal' ? 3 : 2, at: entry.at })
    }
  }
  return returns
}

// ---- tier one: what the agent decided on its own (§3.9.7) ----

/** One question the agent decided itself, for the report that tells the person. */
export interface PendingItem {
  readonly id: string
  readonly title: string
  readonly at: string
}

/** The `at` the pending report counts from: the latest batch mark on the goal, else the drive's start comment (§3.9.7). */
export function batchSince(goal: GraphNode): string | undefined {
  const comments = goal.history.filter(entry => entry.op === 'comment' && typeof entry.text === 'string')
  const batch = comments.filter(entry => /^批次 \d+ · /.test(entry.text ?? '')).at(-1)
  if (batch !== undefined) return batch.at
  return comments.filter(entry => entry.text?.startsWith(DRIVE_START_MARK)).at(-1)?.at
}

/**
 * The agent's own decisions since `since` (§3.9.7): the decided questions
 * under the goal whose decider is the agent and whose latest decide came
 * after `since`, oldest first. `since` is `batchSince`'s answer; without a
 * drive start there is no since, and nothing is reported.
 */
export function pendingReport(graph: LoadedGraph, goal: GraphNode, since: string | undefined): readonly PendingItem[] {
  if (since === undefined) return []
  return subtreeOf(childrenIndex(graph), goal)
    .filter(node => node.type === 'question' && node.status === 'done' && deciderOf(node) === 'agent')
    .flatMap(node => {
      const decided = node.history.filter(entry => entry.op === 'decide').at(-1)
      return decided !== undefined && decided.at > since ? [{ id: node.id, title: node.title, at: decided.at }] : []
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

// ---- the batch (§3.9.7) ----

/** What waits to go to the person, in the kinds the priority reads. */
export type BatchItem =
  | { readonly kind: 'framework', readonly id: string, readonly title: string }
  | { readonly kind: 'module-release', readonly id: string, readonly title: string }
  | { readonly kind: 'stopped', readonly id: string, readonly title: string }
  | { readonly kind: 'report', readonly id: string, readonly title: string }

const PRIORITY: Readonly<Record<BatchItem['kind'], number>> = { framework: 0, 'module-release': 1, stopped: 2, report: 3 }

/**
 * The three matters that go out now, the rest to the next batch (§3.9.7):
 * the framework first (tier three asks the person), then a module's release
 * page, then what stopped, then the reports' proposals. What the agent
 * decided on its own (tier one) is not here — those are told, not asked.
 */
export function batchOf(items: readonly BatchItem[]): { readonly now: readonly BatchItem[], readonly later: readonly BatchItem[] } {
  const ordered = [...items].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.id.localeCompare(b.id))
  return { now: ordered.slice(0, 3), later: ordered.slice(3) }
}

// ---- the release the drive waits to start (§3.9.1) ----

/** One release the drive has not started on: whose, and the write that released it. */
export interface PendingRelease {
  /** Empty for the goal's own release (a goal that is not split). */
  readonly module: string
  readonly release: string
}

/** The comment word the drive's acknowledgements carry: the release time names this occurrence. */
export const RELEASE_MARK = '放行 '

/**
 * A release the drive has not processed (§3.9.1): for a goal that is not
 * split, the goal's own latest release, when no comment on the goal names
 * it; for a split goal, the first released module whose release no comment
 * names — the big loop's own release is not one (no module is workable
 * then). The comments live on the goal, so a moved session sees the same
 * marks. A goal without a stage never starts the drive on its own.
 */
export function pendingRelease(graph: LoadedGraph, goal: GraphNode, readers: ModuleReaders = MODULE_READERS): PendingRelease | undefined {
  if (goal.status !== 'approved' && goal.status !== 'doing') return undefined
  const acknowledged = (at: string | null): boolean => at === null || goal.history.some(entry => entry.op === 'comment' && entry.text?.includes(`${RELEASE_MARK}${at}`))
  let split: boolean
  try {
    split = readers.isSplit(graph, goal)
  }
  catch {
    return undefined
  }
  if (!split) {
    const at = releaseAtOf(goal)
    return acknowledged(at) ? undefined : { module: '', release: at ?? '' }
  }
  for (const module of modulesOf(graph, goal)) {
    if (!isReleased(module) && module.status !== 'done') continue
    const at = releaseAtOf(module)
    if (!acknowledged(at)) return { module: module.id, release: at ?? '' }
  }
  return undefined
}

// ---- the drive's decision table (§3.9.1) ----

/** The goal as the DSH goals service shows it, as far as the table reads it. */
export interface GoalView {
  readonly phase: 'none' | 'active' | 'paused' | 'blocked' | 'complete'
  /** An `active` goal that is not armed waits for its first round (the host disarms on session restore). */
  readonly armed: boolean
  /** Why a `blocked` goal is blocked: the reason code the row blocked it with. */
  readonly blockedCode?: string
}

/** The facts of one step the table judges. */
export interface DriveInput {
  readonly graph: LoadedGraph
  readonly goal: GraphNode
  readonly view: GoalView
  /** The holder session the drive would serve now. */
  readonly session: string
  /** Whether the pause hugged a host exit, by drive.jsonl (§3.9.1); only read when paused. */
  readonly restartPause: boolean
  /** What the peak mode holds back now, or undefined (§3.9.5). */
  readonly peakHold: { readonly level: 'reduce' | 'stop', readonly until: string } | undefined
  /** Whether the peak end a `hourness-peak-wait` block recorded has passed (the caller read the clock). */
  readonly peakOver: boolean
  /** Whether every question the `hourness-waiting-human` reason names is decided or gone. */
  readonly waitingDecided: boolean
}

/** What the table says to do this step. */
export type DriveDecision =
  | { readonly action: 'none' }
  | { readonly action: 'release', readonly module: string, readonly release: string }
  | { readonly action: 'move', readonly release: string }
  | { readonly action: 'resume', readonly reason: 'disarmed' | 'restart-pause' | 'waiting-decided' | 'peak-over' | 'design-released' }
  | { readonly action: 'design-wait' }
  | { readonly action: 'hold', readonly why: 'human-paused' | 'cleared' | 'peak-waiting' | 'waiting-human' | 'blocked' | 'in-design' }

/** The comment the drive starts with; it names the release and the session it serves (§3.9.1). */
export const DRIVE_START_MARK = '自动推进已开始'

/** Whether one of the goal's comments names this holder session as the drive's. */
function namesSession(goal: GraphNode, session: string): boolean {
  return goal.history.some(entry => {
    if (entry.op !== 'comment' || typeof entry.text !== 'string') return false
    const at = entry.text.indexOf(`会话 ${session}`)
    if (at < 0) return false
    const after = entry.text.charAt(at + `会话 ${session}`.length)
    return after === '' || after === ' ' || after === '·'
  })
}

/**
 * The decision table of §3.9.1, in its order: an unprocessed release first —
 * a split goal answers for each module whatever the goal's state is, a goal
 * that is not split only when no goal stands or the last one completed;
 * then the move to the holder session of now; then, on an active goal, the
 * framework sent back to design, then the unarmed resume; the pause rows —
 * a pause that hugged a host exit resumes, the person's does not; the
 * cleared goal; the blocked rows — the waited questions decided, the peak
 * over, the framework released again, anything else holds. `none` when
 * nothing applies.
 */
export function driveDecision(input: DriveInput, readers: ModuleReaders = MODULE_READERS): DriveDecision {
  const { graph, goal, view, session } = input
  const release = pendingRelease(graph, goal, readers)
  if (release !== undefined) {
    // A split goal answers for each module whatever the goal's state is; a
    // goal that is not split (the release names the goal itself) only when
    // no goal stands or the last one completed.
    if (release.module !== '' || view.phase === 'none' || view.phase === 'complete') {
      return { action: 'release', module: release.module, release: release.release }
    }
  }
  const comments = goal.history.filter(entry => entry.op === 'comment' && typeof entry.text === 'string').map(entry => entry.text ?? '')
  const started = comments.some(text => text.includes(DRIVE_START_MARK))
  if (started && !namesSession(goal, session)) {
    const own = comments.find(text => text.includes(DRIVE_START_MARK) && text.includes(RELEASE_MARK))
    return { action: 'move', release: /放行 (\S+)/.exec(own ?? '')?.[1] ?? '' }
  }
  if (view.phase === 'active') {
    const stage = effectiveStage(goal)
    if (stage !== null && !isPostRelease(stage)) return { action: 'design-wait' }
    if (!view.armed) return { action: 'resume', reason: 'disarmed' }
    return { action: 'none' }
  }
  if (view.phase === 'paused') {
    return input.restartPause ? { action: 'resume', reason: 'restart-pause' } : { action: 'hold', why: 'human-paused' }
  }
  if (view.phase === 'blocked') {
    if (view.blockedCode === 'hourness-waiting-human') return input.waitingDecided ? { action: 'resume', reason: 'waiting-decided' } : { action: 'hold', why: 'waiting-human' }
    if (view.blockedCode === 'hourness-peak-wait') return input.peakOver ? { action: 'resume', reason: 'peak-over' } : { action: 'hold', why: 'peak-waiting' }
    if (view.blockedCode === 'hourness-design-wait') return goalLayer(goal).ok ? { action: 'resume', reason: 'design-released' } : { action: 'hold', why: 'in-design' }
    return { action: 'hold', why: 'blocked' }
  }
  if (view.phase === 'none') return started ? { action: 'hold', why: 'cleared' } : { action: 'none' }
  return { action: 'none' }
}

// ---- the two counters (§3.9.5) ----

export interface DriveCounters {
  readonly idle: number
  readonly peak: number
}

/** The block a stretch of unproductive rounds ends in, if any. */
export type CounterBlock = 'hourness-idle-rounds' | 'hourness-peak-wait' | undefined

/**
 * The counters after one round (§3.9.5): progress resets both. A round the
 * peak holds does not count as idle and adds to the peak's own count — two
 * in a row block `hourness-peak-wait`; three unproductive rounds without
 * the peak block `hourness-idle-rounds`. A resume clears both; the caller
 * writes `{idle: 0, peak: 0}` for that.
 */
export function nextCounters(counters: DriveCounters, progressed: boolean, held: boolean): DriveCounters & { readonly block: CounterBlock } {
  if (progressed) return { idle: 0, peak: 0, block: undefined }
  if (held) {
    const peak = counters.peak + 1
    return { idle: counters.idle, peak, block: peak >= 2 ? 'hourness-peak-wait' : undefined }
  }
  const idle = counters.idle + 1
  return { idle, peak: 0, block: idle >= 3 ? 'hourness-idle-rounds' : undefined }
}
