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
import { staleness } from '../graph/pins.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { repoRelative, within } from './scope.ts'

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
  /** The project graph directory the dispatch was made against (§3.3.2's request and §3.6.2's processing read it). */
  readonly graphDir: string
  /** Absolute path of the worktree: a worker's own, a task reviewer's reviewed task's, the main checkout for an acceptance review. */
  readonly worktree?: string
  readonly branch?: string
  /** The commit the worktree was cut from, 40 hex digits (§3.6.2's change reads the diff from here); for an acceptance review, the trunk commit it reviews (§3.9.4). */
  readonly baseSha?: string
  /** The declared review depth of a write task (§3.1.1, default full). */
  readonly review?: 'full' | 'light' | 'skip'
  /** The depth of a review dispatch (§3.7.1). */
  readonly depth?: 'full' | 'light'
  /** The session id of the main agent that made the dispatch; the parent a re-dispatched review round attaches to. */
  readonly parentSession?: string
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

// ---- the communication counters (§3.4.4) ----

/** What the harness saw of one dispatch's conversation with the main agent: its own request register for the asks and the plans, and the allowed `send_message` deliveries for the main agent's directions. */
export interface Communication {
  readonly asked: number
  readonly answered: number
  readonly timeouts: number
  /** The `send_message` calls the main agent made to this dispatch that the rules allowed (§3.4.4 counts them from the worker's log; the register's count is what the harness saw). */
  readonly incoming: number
  readonly plans: number
}

const ZERO: Communication = { asked: 0, answered: 0, timeouts: 0, incoming: 0, plans: 0 }

const communication = new Map<string, Communication>()

/** One communication fact of a dispatch (§3.4.4). */
export type CommunicationKind = 'asked' | 'answered' | 'timeout' | 'incoming' | 'plan'

/** Count one communication fact of a dispatch (§3.4.4); unknown dispatches count from zero. */
export function recordCommunication(childId: string, kind: CommunicationKind): void {
  const current = communication.get(childId) ?? ZERO
  const next: Communication = {
    asked: current.asked + (kind === 'asked' ? 1 : 0),
    answered: current.answered + (kind === 'answered' ? 1 : 0),
    timeouts: current.timeouts + (kind === 'timeout' ? 1 : 0),
    incoming: current.incoming + (kind === 'incoming' ? 1 : 0),
    plans: current.plans + (kind === 'plan' ? 1 : 0),
  }
  communication.set(childId, next)
}

/** The counters of a dispatch, zeros when this process saw none. */
export function communicationOf(childId: string): Communication {
  return communication.get(childId) ?? ZERO
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
const DISPATCH_BASE = /^基线 (\S+)@([0-9a-f]{7,40})$/
const DISPATCH_MODEL = /^模型 ([^/\s]+)\/(\S+?)(?: (\S+))?，理由：(.*)$/
const DISPATCH_REVIEW = /^审查：(全审|轻审|不审)/
const DEPTH_OF_WORD: Readonly<Record<string, keyof typeof DEPTH_WORDS>> = { 全审: 'full', 轻审: 'light', 不审: 'skip' }

/**
 * What a dispatch comment says that later steps need: the attempt, the child
 * id and the pins line; the base, the model choice and the declared review
 * depth when the comment carries them, from which the reconcile rebuilds a
 * dispatch the register lost with the host (§3.9.6).
 */
export interface DispatchRecord {
  readonly attempt: number
  readonly childId: string
  readonly pins: string
  /** Branch and short commit the work was cut from (a worker), or the trunk commit an acceptance review reviews. */
  readonly base?: { readonly branch: string, readonly sha: string }
  readonly provider?: string
  readonly model?: string
  readonly reasoningEffort?: string
  readonly why?: string
  readonly review?: keyof typeof DEPTH_WORDS
}

/** Reads a dispatch comment; undefined when the text is not one. */
export function parseDispatchComment(commentText: string): DispatchRecord | undefined {
  const lines = commentText.split(/\r?\n/)
  const start = DISPATCH_START.exec(lines[0] ?? '')
  const pins = lines.at(-1)
  if (start === null || lines.length < 2 || pins === undefined || !pins.startsWith('pins: ')) return undefined
  const parts = (lines[0] ?? '').split(' · ').slice(2)
  const base = parts.map(part => DISPATCH_BASE.exec(part)).find(match => match !== null)
  const model = parts.map(part => DISPATCH_MODEL.exec(part)).find(match => match !== null)
  const review = parts.map(part => DISPATCH_REVIEW.exec(part)).find(match => match !== null)
  return {
    attempt: Number(start[1]),
    childId: start[2],
    pins,
    ...(base === undefined ? {} : { base: { branch: base[1], sha: base[2] } }),
    ...(model === undefined ? {} : { provider: model[1], model: model[2], ...(model[3] === undefined ? {} : { reasoningEffort: model[3] }), why: model[4] }),
    ...(review === undefined ? {} : { review: DEPTH_OF_WORD[review[1]] }),
  }
}

/** The comment of a dispatch the host lost before it handed back (§3.9.6 step 4); the child id makes it the dispatch's processing mark. */
export function renderLostComment(attempt: number, childId: string): string {
  return `第 ${attempt} 次在宿主重启时丢失 · ${childId}`
}

const LOST = /^第 (\d+) 次在宿主重启时丢失 · (\S+)$/

/** The child id a lost comment names, or undefined when the text is not one. */
export function lostChildOf(text: string): string | undefined {
  return LOST.exec(text)?.[2]
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
  communication.delete(childId)
}

/**
 * Replace a register entry's plan facts (§3.3.4): the main agent's approval
 * marks the dispatch's plan approved and gives it the approved plan's path
 * union, which the write gate reads from then on. Undefined when this
 * process has no such dispatch (it may have handed back already).
 */
export function updateAttempt(childId: string, patch: Readonly<Partial<Pick<Attempt, 'plan' | 'planPaths'>>>): Attempt | undefined {
  const current = register.get(childId)
  if (current === undefined) return undefined
  const updated: Attempt = { ...current, ...patch }
  register.set(childId, updated)
  return updated
}

/** The dispatch a child id names, or undefined when this process did not start it (or it is gone). */
export function registeredAttempt(childId: string): Attempt | undefined {
  return register.get(childId)
}

/** Every dispatch in the register, for the running counts the gates and the health read. */
export function registeredDispatches(): readonly Attempt[] {
  return [...register.values()]
}

/**
 * Whether a dispatch's write of the absolute path `target` is a file its
 * approved plan puts in place (§3.2.1, the scratch-only exemption): the
 * dispatch is a worker whose plan is approved, the target lies in its
 * worktree (not the root itself, not its `.git`) and inside the approved
 * plan's paths or the task's write scope `scope`. Pure; the liveness check
 * is the caller's.
 */
export function writesPlannedFile(attempt: Attempt, scope: readonly string[], target: string): boolean {
  if (attempt.role !== 'worker' || attempt.plan !== 'approved' || attempt.worktree === undefined) return false
  const relative = repoRelative(attempt.worktree, attempt.worktree, target)
  if (relative === undefined || relative === '') return false
  return within(attempt.planPaths ?? [], relative) || within(scope, relative)
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

// ---- the handback comment (§3.6.2 step 4) and the review-task shapes ----

/** The acceptance of the review task a done handback must have under it (§3.7.1); only the person changes acceptance, so the depth is not in it. */
export const REVIEW_TASK_ACCEPTANCE = 'verdict APPROVED under the docs/DEVELOPMENT.md §1.1 standard, at the depth recorded in the latest dispatch'

/** The facts a worker's handback comment carries; the comment is the idempotency mark of the processing (§3.6.2). */
export interface HandbackComment {
  readonly attempt: number
  readonly status: string
  readonly childId: string
  /** The commits of this handback and the latest one, short forms; empty for a handback with no commits. */
  readonly commits: number
  readonly head?: string
  readonly files: number
  readonly base?: string
  readonly report?: string
  readonly questions: number
  readonly assumptions: number
  readonly asked: number
  readonly answered: number
  readonly timeouts: number
  readonly plans: number
  readonly incoming: number
  readonly lessons: number
  readonly lessonsRejected?: number
  readonly depth?: '全审' | '轻审'
  /** The floor hit that made the depth full, one line. */
  readonly floorHit?: string
  /** The component-doc lines (docs-at-hand design 0.3 §6.2): the worker's own `docs` line verbatim, then one sentence per gap. Rendered each with the `Docs: ` prefix. */
  readonly docs?: readonly string[]
  /** The semantic-validation problems, one line each. */
  readonly problems: readonly string[]
}

export function renderHandbackComment(entry: HandbackComment): string {
  const lines = [
    `第 ${entry.attempt} 次交回 · ${entry.status} · ${entry.childId}`,
    `提交 ${entry.commits} 个${entry.head === undefined ? '' : `（最新 ${entry.head}）`} · 文件 ${entry.files} 个 · 报告 ${entry.report ?? '无'}${entry.base === undefined ? '' : ` · 基线 ${entry.base}`}`,
    `问题 ${entry.questions} · 假设 ${entry.assumptions} · 问了 ${entry.asked} 次（答 ${entry.answered}、超时 ${entry.timeouts}）· 计划 ${entry.plans} 版 · 主 Agent 发来 ${entry.incoming} 条 · 候选经验 ${entry.lessons} 条${entry.lessonsRejected === undefined ? '' : `（拒 ${entry.lessonsRejected}）`}`,
    ...(entry.depth === undefined ? [] : [`有效深浅 ${entry.depth}${entry.floorHit === undefined ? '' : `（${entry.floorHit}）`}`]),
    ...(entry.docs ?? []).map(line => `Docs: ${line}`),
    ...entry.problems.map(problem => `校验不过：${problem}`),
  ]
  return lines.join('\n')
}

const HANDBACK_HEAD = /^第 (\d+) 次交回 · (\S+) · (\S+)$/
const HANDBACK_COMMITS = /^提交 (\d+) 个(?:（最新 ([0-9a-f]+)）)? · 文件 (\d+) 个 · 报告 (\S+)(?: · 基线 ([0-9a-f]+))?/
const HANDBACK_COUNTS = /^问题 (\d+) · 假设 (\d+) · 问了 (\d+) 次（答 (\d+)、超时 (\d+)）· 计划 (\d+) 版 · 主 Agent 发来 (\d+) 条 · 候选经验 (\d+) 条(?:（拒 (\d+)）)?/
const HANDBACK_DEPTH = /^有效深浅 (全审|轻审)(?:（(.+)）)?/

/** Reads a worker's handback comment; undefined when the text is not one. */
export function parseHandbackComment(text: string): HandbackComment | undefined {
  const lines = text.split(/\r?\n/)
  const head = HANDBACK_HEAD.exec(lines[0] ?? '')
  if (head === null) return undefined
  const commits = HANDBACK_COMMITS.exec(lines[1] ?? '')
  const counts = HANDBACK_COUNTS.exec(lines[2] ?? '')
  if (commits === null || counts === null) return undefined
  const depth = lines.length > 3 ? HANDBACK_DEPTH.exec(lines[3]) : null
  const tail = lines.slice(depth === null ? 3 : 4)
  const docs = tail.filter(line => line.startsWith('Docs: ')).map(line => line.slice('Docs: '.length))
  return {
    attempt: Number(head[1]),
    status: head[2],
    childId: head[3],
    commits: Number(commits[1]),
    ...(commits[2] === undefined ? {} : { head: commits[2] }),
    files: Number(commits[3]),
    ...(commits[4] !== undefined && commits[4] !== '无' ? { report: commits[4] } : {}),
    ...(commits[5] === undefined ? {} : { base: commits[5] }),
    questions: Number(counts[1]),
    assumptions: Number(counts[2]),
    asked: Number(counts[3]),
    answered: Number(counts[4]),
    timeouts: Number(counts[5]),
    plans: Number(counts[6]),
    incoming: Number(counts[7]),
    lessons: Number(counts[8]),
    ...(counts[9] === undefined ? {} : { lessonsRejected: Number(counts[9]) }),
    ...(depth === null || depth === undefined ? {} : { depth: depth[1] as '全审' | '轻审', ...(depth[2] === undefined ? {} : { floorHit: depth[2] }) }),
    ...(docs.length > 0 ? { docs } : {}),
    problems: tail.filter(line => line.startsWith('校验不过：')).map(line => line.slice('校验不过：'.length)),
  }
}

/** The open review task of a reviewed task, by shape; undefined when there is none (§3.7.1: one implementation task, one review task). */
export function taskReviewOf(graph: LoadedGraph, reviewedId: string): GraphNode | undefined {
  return [...graph.nodes.values()].find(entry => entry.parent === reviewedId && entry.kind === 'review' && (entry.edges ?? []).some(edge => edge.type === 'source' && edge.to === reviewedId) && entry.status !== 'dropped' && entry.status !== 'superseded')
}

/**
 * Whether the reviewed task of a review task has a current finished handback
 * (§3.5.1's `nothing_to_review` row): the latest handback comment says done,
 * and the pins of its latest dispatch are still fresh. `sha256` is injected
 * the way the pins module takes it.
 */
export function reviewTargetOf(graph: LoadedGraph, reviewTask: GraphNode, sha256: (text: string) => string): { readonly handedBack: boolean, readonly stale: boolean } {
  const reviewed = reviewTask.parent === undefined ? undefined : graph.nodes.get(reviewTask.parent)
  if (reviewed === undefined) return { handedBack: false, stale: false }
  const handback = reviewed.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseHandbackComment(entry.text)] : []).filter(entry => entry !== undefined).at(-1)
  if (handback === undefined || handback.status !== 'done') return { handedBack: false, stale: false }
  const pins = latestDispatch(reviewed)?.pins
  const stale = pins === undefined || staleness(graph, pins, sha256).length > 0
  return { handedBack: true, stale }
}
