/**
 * Dispatches and their register (M7 design 0.6 §3.1.2 steps 5 and 10,
 * §3.1.4): the child id of a dispatch, the record of one running dispatch,
 * the queries the gates make over a list of the running ones, the dispatch
 * comment written on the task, and the register itself — the module-level
 * map filled when `startActivation` succeeds. The child id and the comment
 * are pure functions; the register is the one piece of state in the layer
 * that a process keeps.
 *
 * A child id names the task and the attempt and ends in a random suffix.
 * Decoding it is for display and diagnostics only: write permission comes
 * from the register, never from a child id (§3.1.4).
 */
import { isGlmModel } from '../shared/route.ts'
import type { GraphNode } from '../graph/schema.ts'

type AttemptRole = 'worker' | 'review' | 'acceptance-review' | 'check'

/** What `dispatch_task` reports about the plan of a worker. */
export type PlanStatus = 'required' | 'approved' | 'skipped' | 'none'

/** One running dispatch in the register. */
export interface Attempt {
  readonly childId: string
  readonly role: AttemptRole
  /** The task, or the goal for the review of the whole goal. */
  readonly node: string
  readonly attempt: number
  /** Absolute path of the worktree; workers only. */
  readonly worktree?: string
  readonly branch?: string
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  readonly why: string
  readonly plan: PlanStatus
  /** The approved plan's paths union (§3.2.1), carried from the task's approved plan at dispatch; present only while `plan` is `approved`. */
  readonly planPaths?: readonly string[]
  /** The `pins:` line written on the dispatch comment. */
  readonly pins: string
}

const SUFFIX_LENGTH = 6
const SUFFIX_RANGE = 36 ** SUFFIX_LENGTH
const ID = '[a-z][a-z0-9-]{0,47}'
const WORK_PATTERN = new RegExp(`^hz-(${ID})-a(\\d+)-([0-9a-z]{${SUFFIX_LENGTH}})$`)
const ACCEPTANCE_PATTERN = new RegExp(`^hz-(${ID})-acc-a(\\d+)-([0-9a-z]{${SUFFIX_LENGTH}})$`)

/**
 * `hz-<task id>-a<attempt>-<6 base36 characters>`; the review of a whole goal
 * is `hz-<goal id>-acc-a<round>-<6 base36 characters>` (§3.9.4). The suffix
 * comes from the injected `random` (a function returning [0, 1)), which keeps
 * the id unique when the same task is dispatched again (DUPLICATE_CHILD,
 * subagent:1430–1437). Every character is in `[A-Za-z0-9._-]`
 * (session-persistence-jsonl:866).
 */
export function makeChildId(node: string, attempt: number, random: () => number, acceptance = false): string {
  const suffix = Math.floor(random() * SUFFIX_RANGE).toString(36).padStart(SUFFIX_LENGTH, '0')
  return `hz-${node}${acceptance ? '-acc' : ''}-a${attempt}-${suffix}`
}

export interface ChildIdParts {
  readonly node: string
  readonly attempt: number
  /** True for the review of a whole goal. A task whose own id ends in `-acc` reads the same; the register's role says which it is. */
  readonly acceptance: boolean
}

/** The parts of a child id, or undefined when the text is not one. */
export function parseChildId(childId: string): ChildIdParts | undefined {
  const acceptance = ACCEPTANCE_PATTERN.exec(childId)
  if (acceptance !== null) return { node: acceptance[1], attempt: Number(acceptance[2]), acceptance: true }
  const work = WORK_PATTERN.exec(childId)
  return work === null ? undefined : { node: work[1], attempt: Number(work[2]), acceptance: false }
}

/** The running dispatches that hold a node: any role, because a check of a task is work on it too. */
export function runningOn(running: readonly Attempt[], node: string): Attempt[] {
  return running.filter(attempt => attempt.node === node)
}

/** The running write tasks. */
export function runningWorkers(running: readonly Attempt[]): Attempt[] {
  return running.filter(attempt => attempt.role === 'worker')
}

/** The running dispatches on a GLM model that count against the peak cap: workers and reviews; a check runs no model (§3.1.2 step 3). */
export function runningGlm(running: readonly Attempt[]): Attempt[] {
  return running.filter(attempt => attempt.role !== 'check' && isGlmModel(attempt.model))
}

const DEPTH_WORDS = { full: '全审', light: '轻审', skip: '不审' } as const

export interface DispatchComment {
  readonly attempt: number
  readonly childId: string
  /** Branch and short commit the worktree was cut from; absent for dispatches without a worktree. */
  readonly base?: { readonly branch: string, readonly sha: string }
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  readonly why: string
  /** The declared review depth and its reason; write tasks only. */
  readonly review?: { readonly depth: keyof typeof DEPTH_WORDS, readonly why?: string }
  /** The brief digest. */
  readonly brief: string
  /** Appended to the first line, for example the note that the model catalog was not checked. */
  readonly note?: string
  /** The `pins:` line. */
  readonly pins: string
}

/**
 * The comment the harness writes on the task when it dispatches it
 * (§3.1.2 step 10): one line of facts, then the pins line.
 */
export function renderDispatchComment(entry: DispatchComment): string {
  const parts = [
    `第 ${entry.attempt} 次派发`,
    entry.childId,
    ...(entry.base === undefined ? [] : [`基线 ${entry.base.branch}@${entry.base.sha}`]),
    `模型 ${entry.provider}/${entry.model}${entry.reasoningEffort === undefined ? '' : ` ${entry.reasoningEffort}`}，理由：${entry.why}`,
    ...(entry.review === undefined ? [] : [`审查：${DEPTH_WORDS[entry.review.depth]}${entry.review.why === undefined ? '' : `，理由：${entry.review.why}`}`]),
    `简报 ${entry.brief}`,
    ...(entry.note === undefined ? [] : [entry.note]),
  ]
  return `${parts.join(' · ')}\n${entry.pins}`
}

const DISPATCH_START = /^第 (\d+) 次派发 · (\S+) · /

/** What a dispatch comment says that later steps need: the attempt, the child id and the pins line. */
export interface DispatchRecord {
  readonly attempt: number
  readonly childId: string
  readonly pins: string
}

/** Reads a dispatch comment; undefined when the text is not one. */
export function parseDispatchComment(commentText: string): DispatchRecord | undefined {
  const lines = commentText.split(/\r?\n/)
  const start = DISPATCH_START.exec(lines[0] ?? '')
  const pins = lines.at(-1)
  if (start === null || lines.length < 2 || pins === undefined || !pins.startsWith('pins: ')) return undefined
  return { attempt: Number(start[1]), childId: start[2], pins }
}

function dispatchRecords(node: GraphNode): DispatchRecord[] {
  return node.history.flatMap(entry => {
    const record = entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? parseDispatchComment(entry.text) : undefined
    return record === undefined ? [] : [record]
  })
}

/** The number of the next dispatch of a task: the dispatch comments it already carries, plus one (§3.1.2 step 5). */
export function nextAttempt(node: GraphNode): number {
  return dispatchRecords(node).length + 1
}

/** The latest dispatch comment of a task, or undefined when it was never dispatched. */
export function latestDispatch(node: GraphNode): DispatchRecord | undefined {
  return dispatchRecords(node).at(-1)
}

// ---- the register (§3.1.4) ----

/**
 * The dispatches this process started that have not finished their handback
 * processing. Module-level on purpose: the register survives the row being
 * disabled and enabled again in the same process, and is emptied only when
 * the module itself is re-imported — then every still-alive worker reads as
 * "not in the register" (read-only, listed as lost in the dispatch notice),
 * never as a writer (§3.1.4). The activation is written here only after
 * `startActivation` succeeded, and is kept until the handback processing is
 * done; the live check (`agents.get(id)`) is the callers'.
 */
const register = new Map<string, Attempt>()

/** Enter a started dispatch. */
export function registerAttempt(attempt: Attempt): void {
  register.set(attempt.childId, attempt)
}

/** Drop a dispatch whose handback processing is done. */
export function forgetAttempt(childId: string): void {
  register.delete(childId)
}

/** The dispatch a child id names, or undefined when this process did not start it (or it is gone). */
export function registeredAttempt(childId: string): Attempt | undefined {
  return register.get(childId)
}

/** Every dispatch in the register, for the running counts the gates and the health read. */
export function registeredDispatches(): readonly Attempt[] {
  return [...register.values()]
}

/** What `dispatch_task` returns (§3.1.1): the dispatch's facts and the brief digest, the plan as words. */
export interface DispatchSummary {
  readonly task: string
  readonly attempt: number
  readonly childId: string
  readonly role: AttemptRole
  /** Absolute path and branch of the worktree; workers only. */
  readonly worktree?: string
  readonly branch?: string
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  /** The declared review depth; write tasks only. */
  readonly review?: 'full' | 'light' | 'skip'
  /** 12 hex digits of the brief. */
  readonly brief: string
  readonly plan: PlanStatus
}
