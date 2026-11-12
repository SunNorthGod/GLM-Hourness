/**
 * The handback processing (M7 design 0.6 §3.6, §3.7): what the harness does
 * when a dispatched activation settles. A worker's structured handback is
 * semantically validated (commits on the branch, files repository-relative),
 * its long report is copied out of the worktree, its summary lands as one
 * idempotent comment on the task with the communication counts (§3.4.4) and
 * the candidate lessons (§3.5.5: through the lessons service when the row is
 * on, as the fallback comment with secret-shaped fields elided when not), a
 * `done` handback reads the change and the dispatch's command record against
 * the must-review floor (§3.7.1) for the effective depth and makes sure the
 * task has its review task. A reviewer's verdict is normalized (§3.7.2:
 * findings that name no accepted criterion stop blocking), a full review is
 * checked for coverage (a round that misses an item is voided and
 * re-dispatched once with the same model and reason), one round comment is
 * written per round (§3.7.3) and the convergence table decides pass, stop
 * (the marker the brief gate reads, and `hourness.stopped`, whose
 * `execute.stop-draft` action words the draft to the person, §3.7.4, D11)
 * or a factual notice. A done handback, a review that is skipped and a pass
 * hand `hourness.handback`, `hourness.review-skipped` and
 * `hourness.review-passed` to the loop board (§2.5). A pass on a task whose current attempt
 * already reached the trunk completes the task with the evidence of that
 * advance and removes its clean worktree (§3.8.4: the trunk-advance check
 * left it in progress while the review was pending).
 * A module's design review writes the record
 * the module release gate reads (§3.7.5); a goal's acceptance review writes
 * its findings and its round comment on the goal, the completion gate's
 * fifth item, and stops the way a task review does (§3.9.4). Every step checks the graph for
 * the same childId first, so a restart's reconciliation can rerun it
 * (§3.6.2).
 *
 * Processing runs in the host, outside any session; it never throws into
 * the runtime. The activation result of `delivery: 'caller'` is
 * `{output, stopReason, structured?}` (subagent:1098–1117); the caller
 * (`dispatch.ts`, through the row's `onHandback` hook) hands it here.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { openEngine } from '../graph/engine.ts'
import { DIRECTIONS_ID } from '../graph/modules.ts'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import { staleness } from '../graph/pins.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { Evidence, GraphNode } from '../graph/schema.ts'
import { errorText, isRecord } from '../design/tool-support.ts'
import type { ServiceLookup, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { deliver } from '../rules/wake.ts'
import { looksSecret } from '../data/secret-shape.ts'
import { LESSONS_SERVICE } from '../lessons/service.ts'
import { docsGaps, docsLines } from '../lessons/docs.ts'
import { projectOf } from '../data/project-root.ts'
import type { Attempt, HandbackComment } from './attempts.ts'
import type { LoopEmit } from './loop-link.ts'
import { communicationOf, forgetAttempt, parseDispatchComment, parseHandbackComment, renderHandbackComment, REVIEW_TASK_ACCEPTANCE, taskReviewOf } from './attempts.ts'
import type { CommandRunner, GraphCache } from './dispatch.ts'
import { sha256Hex } from './digest.ts'
import { floorHits, parseFloor, type FloorCall, type FloorChange } from './floor.ts'
import type { RulesRead } from './policy-digest.ts'
import { rulesPaths } from '../rules/store.ts'
import { emitMetric } from './metrics.ts'
import { acceptanceRounds, isDesignReview } from '../graph/execute-stage.ts'
import { converge, normalizeVerdict, renderAcceptanceComment, renderRoundComment, roundsOf, roundsSinceHuman, latestHumanAt, type Round } from './review.ts'
import { handbackProblems, reviewProblems } from './schemas.ts'
import { writeWithRetry } from './retry.ts'
import type { Git } from './git.ts'

/** How an activation settled (subagent:1098–1117); the structured result is the schema-validated handback or review verdict. */
export interface Settlement {
  readonly output?: readonly unknown[]
  readonly stopReason?: string
  readonly structured?: unknown
}

/** What the processing needs from the row — the seams the dispatch tool reads, plus git and the lessons service's lookup. */
export interface HandbackDeps {
  readonly lookup: ServiceLookup
  /** The row's revision-keyed graph cache; a load is the fresh read of a step. */
  readonly cache: GraphCache
  /** `<proj>/.llm/execute` of a project root: the reports and the command records live under it. */
  readonly execDir: (projectRoot: string) => string
  /** Report the row health of a session. */
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** The git operations of the reviewed change; the worktree is the cwd. */
  readonly git: Git
  /** A shell runner for the git calls the Git object does not carry (branch --contains, patch-id). */
  readonly runCommand: CommandRunner
  /** The clock of history timestamps and journal lines; tests pin it. */
  readonly now?: () => Date
  /** Re-dispatch a voided review round with the same model and reason (§3.7.1); false when the row cannot (the parent is gone). */
  readonly redispatch?: (reviewTaskId: string, attempt: Attempt) => Promise<boolean>
  /** The evidence of the task's newest checked trunk advance since its latest dispatch (src/execute/advance.ts): the trailer commit and the check's commands; `undefined` while this attempt has not reached the trunk. */
  readonly trunkEvidence?: (projectRoot: string, task: string) => Promise<readonly Evidence[] | undefined>
  /** Hand an event to the loop board (src/execute/loop-link.ts): `hourness.handback`, `hourness.review-skipped`, `hourness.review-passed`, `hourness.stopped` (§2.5). */
  readonly emit?: (project: string, sessionId: string | undefined, event: LoopEmit) => void
}

/** The stop markers this process wrote itself when the graph refused the comment (§3.7.3); the brief gate reads them through the row. */
const stoppedInProcess = new Set<string>()

/** Remember (inside this process) that a node's stop marker could not be written; the gate refuses dispatches for it until the graph takes the comment. */
function markStoppedInMemory(nodeId: string): void {
  stoppedInProcess.add(nodeId)
}

/** Whether the row remembers an unwritable stop marker for the node (§3.7.3). */
export function stoppedInMemory(nodeId: string): boolean {
  return stoppedInProcess.has(nodeId)
}

/** Run the processing of one settled activation to its end; never rejects. The reconcile awaits it (§3.9.6 step 3). */
export async function settleHandback(deps: HandbackDeps, attempt: Attempt, settlement: unknown): Promise<void> {
  try {
    await processHandback(deps, attempt, settlement)
  }
  catch (error) {
    deps.report(undefined, 'degraded', `交回处理没跑完（${attempt.childId}）：${errorText(error)}；这次交回的批注可能没写上，重新派发按新的一轮算`)
  }
}

/** Enter the processing of one settled activation; never throws, never rejects. */
export function startHandback(deps: HandbackDeps, attempt: Attempt, settlement: unknown): void {
  void settleHandback(deps, attempt, settlement)
}

// ---- the handback projection (§3.9.6 step 3) ----

/** The key of the session projection a lost dispatch's handback is read back from. */
export const HANDBACK_PROJECTION = 'hournessHandback'

const STRUCTURED_OUTPUT = 'structured_output'
/** At most this many calls wait for their results; a call whose result never came is dropped first. */
const PENDING_KEPT = 8

/** What the projection keeps of one session. */
interface HandbackState {
  /** Not a subagent's session: nothing to fold. */
  readonly inert: boolean
  /** Events a fork inherited are not this session's own calls. */
  readonly skipBelowSeq: number
  /** The `structured_output` calls whose result has not come yet: the call id and its arguments. */
  readonly pending: readonly { readonly id: string, readonly args: Readonly<Record<string, unknown>> }[]
  /** The arguments of the last `structured_output` call whose result was not an error, or null. */
  readonly handback: Readonly<Record<string, unknown>> | null
}

/** The arguments of a tool-call block: the provider's JSON text, or already an object; undefined when they are not an object. */
function callArguments(block: Record<string, unknown>): Readonly<Record<string, unknown>> | undefined {
  let input: unknown = block.arguments ?? block.input
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    }
    catch {
      return undefined
    }
  }
  return isRecord(input) ? input : undefined
}

/**
 * Fold one session event (the src/design/talk.ts pattern): an assistant
 * message's `structured_output` call blocks wait for their `tool/result`
 * by call id; a result that is not an error makes the call's arguments the
 * handback, the way the subagent runtime captures it (subagent
 * structured.js: the capture commits only after a successful result). The
 * same state comes back when nothing changed.
 */
function handbackApply(state: HandbackState, event: { readonly type: string, readonly seq: number, readonly data?: unknown }): HandbackState {
  if (state.inert || event.seq < state.skipBelowSeq || !isRecord(event.data) || !isRecord(event.data.message)) return state
  const { message } = event.data
  if (event.type === 'assistant/message' && Array.isArray(message.content)) {
    const calls = message.content.flatMap((block) => {
      if (!isRecord(block) || block.type !== 'tool-call' || block.name !== STRUCTURED_OUTPUT || typeof block.id !== 'string') return []
      const args = callArguments(block)
      return args === undefined ? [] : [{ id: block.id, args }]
    })
    return calls.length === 0 ? state : { ...state, pending: [...state.pending, ...calls].slice(-PENDING_KEPT) }
  }
  if (event.type !== 'tool/result' || typeof message.toolCallId !== 'string') return state
  const call = state.pending.find(entry => entry.id === message.toolCallId)
  if (call === undefined) return state
  const pending = state.pending.filter(entry => entry !== call)
  return message.isError === true ? { ...state, pending } : { ...state, pending, handback: call.args }
}

function parseHandbackState(value: unknown): HandbackState {
  if (!isRecord(value) || typeof value.inert !== 'boolean' || typeof value.skipBelowSeq !== 'number' || !Array.isArray(value.pending) || (value.handback !== null && !isRecord(value.handback))) {
    throw new TypeError('handback state: inert, skipBelowSeq, pending and handback are required')
  }
  return value as unknown as HandbackState
}

function parseHandbackView(value: unknown): Readonly<Record<string, unknown>> | null {
  if (value !== null && !isRecord(value)) throw new TypeError('handback view: an object or null')
  return value
}

/**
 * The session projection `hournessHandback` (§3.9.6 step 3, U6): per
 * subagent session, the last `structured_output` arguments whose result was
 * not an error. Its view is that value or null; a session observation
 * carries it in `projections.values` (only units with a view are there,
 * session-projection:141–153), which is how the reconcile reads the
 * handback of a dispatch the host lost.
 */
export const handbackProjection = {
  key: HANDBACK_PROJECTION,
  stateVersion: 1,
  stateSchema: { parse: parseHandbackState },
  init: (header: unknown, inheritedEventCount: number): HandbackState => ({
    inert: !isRecord(header) || header.origin !== 'subagent',
    skipBelowSeq: inheritedEventCount,
    pending: [],
    handback: null,
  }),
  apply: handbackApply,
  wire: { viewSchema: { parse: parseHandbackView }, view: (state: HandbackState): Readonly<Record<string, unknown>> | null => state.handback },
} as const

async function processHandback(deps: HandbackDeps, attempt: Attempt, settlement: unknown): Promise<void> {
  const graph = await deps.cache.load(attempt.graphDir)
  const node = graph.nodes.get(attempt.node)
  if (node === undefined) {
    forgetAttempt(attempt.childId)
    return
  }
  if (alreadyProcessed(graph, attempt)) {
    forgetAttempt(attempt.childId)
    return
  }
  if (attempt.role === 'worker') {
    await workerHandback(deps, attempt, graph, node, settlement)
    forgetAttempt(attempt.childId)
    return
  }
  if (attempt.role === 'acceptance-review') {
    await acceptanceHandback(deps, attempt, node, settlement)
    forgetAttempt(attempt.childId)
    return
  }
  if (isDesignReview(graph, node)) {
    await designReviewHandback(deps, attempt, graph, node, settlement)
    forgetAttempt(attempt.childId)
    return
  }
  await taskReviewHandback(deps, attempt, graph, node, settlement)
  forgetAttempt(attempt.childId)
}

/** Whether the graph already carries this childId's processing (§3.6.2's idempotency): the worker's summary or ending comment, the reviewer's round comment, the module's design-review record, the acceptance review's round, ending or void; the reconcile asks the same (§3.9.6 step 2). */
export function alreadyProcessed(graph: LoadedGraph, attempt: Attempt): boolean {
  const node = graph.nodes.get(attempt.node)
  if (node !== undefined) {
    if (attempt.role === 'worker') {
      const mine = node.history.some(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined && (parseHandbackComment(entry.text)?.childId === attempt.childId || ENDED.exec(entry.text)?.[3] === attempt.childId))
      if (mine) return true
    }
    else if (attempt.role === 'acceptance-review') {
      // The goal's round comment, the reviewer's ending comment or the void of this round (§3.9.4).
      const mine = acceptanceRounds(node).some(round => round.childId === attempt.childId) || node.history.some(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined
        && (ENDED.exec(entry.text)?.[3] === attempt.childId || entry.text.startsWith(`第 ${attempt.attempt} 次结束：verdict invalid · ${attempt.childId} · `) || entry.text.startsWith(`审查作废 · ${attempt.childId} · `)))
      if (mine) return true
    }
    else if (roundsOf(node.history).some(round => round.childId === attempt.childId)) return true
  }
  if (attempt.role === 'review') {
    const module = node?.parent !== undefined ? graph.nodes.get(node.parent) : undefined
    if (module !== undefined && designRecordsOf(module).some(record => record.childId === attempt.childId)) return true
  }
  return false
}

const ENDED = /^第 (\d+) 次结束：(\S+) · (\S+)$/

/** One harness comment; no revision to retry against. */
async function comment(deps: HandbackDeps, dir: string, nodeId: string, text: string): Promise<boolean> {
  const engine = openEngine(dir, { now: deps.now ?? ((): Date => new Date()) })
  const written = await engine.apply('harness', { op: 'comment', id: nodeId, text }).catch(() => undefined)
  return written !== undefined && written.ok
}

/** The notice of the execute row to the current holder (§3.4.3); best effort, a failed delivery is said in the health. */
function notify(deps: HandbackDeps, dir: string, event: 'handback' | 'review' | 'stale', attempt: Attempt, summary: string, text: string): void {
  const notice: UserNotice = createUserNotice('glm-hourness-execute', summary, text, { hournessExecute: { event, task: attempt.node, attempt: attempt.attempt, childId: attempt.childId } })
  const holder = mainAgentOf(holderHome(deps.lookup), dir)
  const way = holder === undefined ? undefined : deliver(deps.lookup, holder.sessionId, notice)
  if (way === undefined || way.kind !== 'sent') {
    const why = holder === undefined ? '项目没有主 Agent 记录' : way === undefined || way.kind === 'gone' ? '持有者的会话不在了' : way.kind === 'failed' ? way.why : '没有可用的 agent 注册表'
    deps.report(attempt.parentSession, 'degraded', `交回的通知送不到当前主 Agent（${attempt.childId}）：${why}`)
  }
}

const SESSION_TIMEOUT_MS = 30_000

/** The design-review records a module carries (§3.7.5). */
function designRecordsOf(module: GraphNode): readonly { childId: string, verdict: string, digest: string, blocking: number, dispatchedAt: string }[] {
  return module.history.flatMap(entry => {
    if (entry.op !== 'comment' || entry.actor !== 'harness' || entry.text === undefined) return []
    const record = /^设计审查 · (\S+) · (APPROVED|CHANGES_REQUESTED) · 方向清单 ([0-9a-f]{12}) · 挡路 (\d+) · 派出 (\S+)$/.exec(entry.text)
    return record === null ? [] : [{ childId: record[1], verdict: record[2], digest: record[3], blocking: Number(record[4]), dispatchedAt: record[5] }]
  })
}

/** The dispatch comment's timestamp of one childId on a node's history (§3.7.5's 派出). */
function dispatchedAtOf(node: GraphNode, childId: string): string | undefined {
  return node.history.find(entry => entry.op === 'comment' && entry.actor === 'harness' && typeof entry.text === 'string' && parseDispatchComment(entry.text)?.childId === childId)?.at
}

// ---- the worker handback (§3.6.2) ----

async function workerHandback(deps: HandbackDeps, attempt: Attempt, graph: LoadedGraph, node: GraphNode, settlement: unknown): Promise<void> {
  const started = Date.now()
  const worktree = attempt.worktree
  const projectRoot = worktree === undefined ? undefined : projectOf(worktree)?.root
  const structured = isRecord(settlement) && isRecord(settlement.structured) ? settlement.structured : undefined
  const stopReason = isRecord(settlement) && typeof settlement.stopReason === 'string' && settlement.stopReason !== '' ? settlement.stopReason : 'error'
  if (structured === undefined || worktree === undefined || projectRoot === undefined) {
    // A settled activation without the structured handback: the runtime counts it as an error, the handback is lost (§3.6.2 step 1).
    await comment(deps, attempt.graphDir, node.id, `第 ${attempt.attempt} 次结束：${stopReason} · ${attempt.childId}`)
    notify(deps, attempt.graphDir, 'handback', attempt, `Task ${node.id} ended without a handback (${stopReason}).`, `The activation settled as ${stopReason} and brought no structured handback; the task stays in progress. Dispatch it again: the new attempt carries what this one did in its brief.`)
    emitMetric({ event: 'execute.handback', task: node.id, attempt: attempt.attempt, status: 'ended', stopReason, commits: 0, files: 0, ms: Date.now() - started, outside: 0 })
    return
  }
  // Semantic validation (§3.6.2 step 2): commits 7-40 hex, on the task's branch, on top of the base; files repository-relative.
  const problems: string[] = [...handbackProblems(structured)]
  const commits = stringList(structured.commits) ?? []
  for (const commit of commits) {
    if (!/^[0-9a-f]{7,40}$/.test(commit)) {
      problems.push(`commit "${commit}" is not 7-40 hex digits`)
      continue
    }
    const ancestor = await deps.git.isAncestor(worktree, attempt.baseSha ?? 'HEAD', commit)
    if (!ancestor.ok || ancestor.value === false) problems.push(`commit ${commit} is not on top of the dispatch's base`)
    const contains = await deps.runCommand(worktree, `git branch --contains ${commit}`, SESSION_TIMEOUT_MS)
    if (contains.code !== 0 || !contains.stdout.includes(`hz/${node.id}`)) problems.push(`commit ${commit} is not on the task's branch`)
  }
  const files = stringList(structured.files) ?? []
  for (const file of files) {
    if (file === '' || file.startsWith('/') || file.includes('\\') || file.includes('..')) problems.push(`file "${file}" is not a repository-relative path`)
  }
  // The long report (§3.6.2 step 3): out of the worktree before it is discarded.
  let report: string | undefined
  if (typeof structured.report === 'string' && structured.report !== '') {
    report = join(deps.execDir(projectRoot), 'reports', `${attempt.childId}.md`)
    try {
      await mkdir(join(deps.execDir(projectRoot), 'reports'), { recursive: true })
      await writeFile(report, await readFile(join(worktree, '.hourness', `${attempt.childId}.md`), 'utf8'))
    }
    catch {
      problems.push('the long report could not be copied out of the worktree')
      report = undefined
    }
  }
  // Candidate lessons (§3.5.5): through the service when it is there, the fallback comment with secret-shaped strings elided when not.
  const lessons = lessonsOf(structured.lessons)
  const lessonsResult = await lessonsStep(deps, attempt, lessons)
  const status = typeof structured.status === 'string' && ['done', 'blocked', 'partial', 'plan-pending'].includes(structured.status) ? structured.status : 'partial'
  // The stale check (§3.6.2 step 6): after the summary and the lessons, before the done flow.
  const stale = staleness(graph, attempt.pins, sha256Hex)
  // The effective depth (§3.7.1) of a done handback: the change and the command record against the floor.
  let depth: '全审' | '轻审' | undefined
  let floorHit: string | undefined
  // The event's `floorHit` (§2.5): `unparsed`, the class that was hit, or empty.
  let hitClass = ''
  // The component-doc lines (docs-at-hand design 0.3 §6): the worker's `docs` line verbatim, then one sentence per component the change touched whose AGENTS.md it did not.
  let docs: readonly string[] = []
  if (status === 'done' && stale.length === 0) {
    const floor = parseFloor(graph.nodes.get('norm-review-floor'))
    const head = commits.at(-1)
    // One git diff read serves the floor and the docs gaps: the change as `--no-renames --name-status` prints it (§3.7.1, §6.1).
    const changed = attempt.baseSha === undefined || head === undefined
      ? undefined
      : await deps.git.changedFiles(worktree, attempt.baseSha, head)
    const change: FloorChange = changed !== undefined && changed.ok
      ? { paths: changed.value.map(file => file.path), deleted: changed.value.filter(file => file.status === 'D').map(file => file.path) }
      : { paths: [], deleted: [] }
    const calls = await readCalls(join(deps.execDir(projectRoot), 'tasks', node.id, `${attempt.childId}.commands.jsonl`))
    const hits = floorHits(floor, change, calls, worktree)
    const declared = attempt.review ?? 'full'
    if (floor.unparsed.length > 0) {
      depth = '全审'
      floorHit = '清单有判不了的条目'
      hitClass = 'unparsed'
    }
    else if (hits.length > 0) {
      depth = '全审'
      const entry = floor.entries.find(candidate => String(candidate.index) === hits[0].index)
      floorHit = `审查改为全审：碰到必须全审清单第 ${hits[0].index} 类（${entry?.text ?? hits[0].reason}）`
      hitClass = hits[0].index
    }
    else depth = declared === 'light' ? '轻审' : declared === 'skip' ? undefined : '全审'
    // The docs gaps (§6.1): which components exist is read from the head commit's tree, so a worktree nobody cleaned cannot answer for the handback. A git that will not say — the diff or the tree — leaves the gaps uncomputed and says so once, degraded.
    const withAgents = new Set<string>()
    let gitReason = changed !== undefined && !changed.ok ? changed.reason : undefined
    for (const dir of ancestorDirsOf(change.paths)) {
      // A change list that is not empty names a head, so the loop cannot reach here without one.
      const entry = await deps.git.entryAt(worktree, head!, `${dir}/AGENTS.md`)
      if (!entry.ok) {
        gitReason = entry.reason
        break
      }
      if (entry.value !== undefined) withAgents.add(dir)
    }
    const gaps = gitReason === undefined ? docsGaps(change.paths, file => componentAtHead(file, withAgents)) : undefined
    docs = docsLines(gaps, typeof structured.docs === 'string' ? structured.docs : undefined, gitReason === undefined ? undefined : `git 没说出组件的 AGENTS.md 在不在（${gitReason}）`)
    if (gitReason !== undefined) deps.report(attempt.parentSession, 'degraded', `文档缺口没算成（${node.id}，${attempt.childId}）：${gitReason}`)
    emitMetric({
      event: 'execute.review-depth',
      task: node.id,
      declared,
      effective: depth === '全审' ? 'full' : depth === '轻审' ? 'light' : 'skip',
      ...(hitClass === '' || hitClass === 'unparsed' ? {} : { hit: hitClass }),
      ...(hitClass === 'unparsed' ? { unparsed: true } : {}),
    })
  }
  const counts = communicationOf(attempt.childId)
  const summary: HandbackComment = {
    attempt: attempt.attempt,
    status,
    childId: attempt.childId,
    commits: commits.length,
    ...(commits.at(-1) === undefined ? {} : { head: commits.at(-1)!.slice(0, 12) }),
    files: files.length,
    ...(attempt.baseSha === undefined ? {} : { base: attempt.baseSha.slice(0, 12) }),
    ...(report === undefined ? {} : { report }),
    questions: stringList(structured.questions)?.length ?? 0,
    assumptions: stringList(structured.assumptions)?.length ?? 0,
    asked: counts.asked,
    answered: counts.answered,
    timeouts: counts.timeouts,
    plans: counts.plans,
    incoming: counts.incoming,
    lessons: lessonsResult.count,
    ...(lessonsResult.rejected === undefined ? {} : { lessonsRejected: lessonsResult.rejected }),
    ...(depth === undefined ? {} : { depth }),
    ...(floorHit === undefined ? {} : { floorHit }),
    ...(docs.length > 0 ? { docs } : {}),
    problems,
  }
  const commentOk = await comment(deps, attempt.graphDir, node.id, renderHandbackComment(summary))
  if (!commentOk) deps.report(attempt.parentSession, 'degraded', `交回摘要写不进图（任务 ${node.id}，${attempt.childId}）；这次交回的事实只在这个通知里`)
  if (lessonsResult.fallback !== undefined) {
    const written = await comment(deps, attempt.graphDir, node.id, lessonsResult.fallback)
    if (!written) deps.report(attempt.parentSession, 'degraded', `候选经验的退路批注写不进图（任务 ${node.id}）；候选经验没有记到任何地方`)
  }
  if (stale.length > 0) {
    // Step 6: the pins went stale — the work cannot reach the trunk, stop here.
    notify(deps, attempt.graphDir, 'stale', attempt, `Task ${node.id} went stale since the dispatch.`, `The graph moved under the task since it was dispatched: ${stale.map(change => `${change.id} ${change.change}`).join(', ')}. The handback is on the task, but its work cannot reach the trunk; dispatch the task again.`)
    emitMetric({ event: 'execute.handback', task: node.id, attempt: attempt.attempt, status, commits: commits.length, files: files.length, ms: Date.now() - started, outside: 0 })
    return
  }
  if (status !== 'done') {
    // Steps 7-8 for the statuses that go back to the main agent as facts.
    notify(deps, attempt.graphDir, 'handback', attempt, `Task ${node.id} handed back ${status}.`, `Attempt ${attempt.attempt} handed back with status ${status}: ${typeof structured.summary === 'string' ? structured.summary.slice(0, 400) : 'no summary'}. Decide: dispatch it again, change the task, or ask the person.`)
    emitMetric({ event: 'execute.handback', task: node.id, attempt: attempt.attempt, status, commits: commits.length, files: files.length, ms: Date.now() - started, outside: await outsideCount(join(deps.execDir(projectRoot), 'tasks', node.id, `${attempt.childId}.commands.jsonl`)) })
    return
  }
  // The done flow: the effective depth decides whether the task has a review task (§3.7.1).
  let reviewTask = taskReviewOf(graph, node.id)
  if (depth !== undefined) {
    if (reviewTask === undefined) {
      const engine = openEngine(attempt.graphDir, { now: deps.now ?? ((): Date => new Date()) })
      const proposed = await writeWithRetry(() => engine.apply('harness', {
        op: 'propose',
        reason: `review task of ${node.id} (handback ${attempt.childId})`,
        node: {
          type: 'task',
          parent: node.id,
          kind: 'review',
          writeScope: [],
          title: `审查：${node.title}`,
          acceptance: [REVIEW_TASK_ACCEPTANCE],
          edges: [{ type: 'source', to: node.id }],
        },
      }))
      if (proposed.ok) reviewTask = taskReviewOf(await deps.cache.load(attempt.graphDir), node.id)
      else deps.report(attempt.parentSession, 'degraded', `审查任务提议不上（任务 ${node.id}）：${proposed.error.message}`)
    }
  }
  emitMetric({ event: 'execute.handback', task: node.id, attempt: attempt.attempt, status, commits: commits.length, files: files.length, ms: Date.now() - started, outside: await outsideCount(join(deps.execDir(projectRoot), 'tasks', node.id, `${attempt.childId}.commands.jsonl`)) })
  const depthWord = depth === undefined ? '不审' : depth
  const summaryText = `Task ${node.id} attempt ${attempt.attempt} handed back done: ${commits.length} commit(s), ${files.length} file(s), effective review depth ${depth === undefined ? 'none (skip)' : depthWord}${depth === undefined ? '' : reviewTask === undefined ? ', but its review task could not be created' : `, waiting for your review dispatch of ${reviewTask.id}`}.`
  notify(deps, attempt.graphDir, 'handback', attempt, `Task ${node.id} handed back done.`, `${summaryText}${problems.length > 0 ? `\nSemantic problems of the handback: ${problems.join('; ')}` : ''}${docs.length > 0 ? `\n${docs.map(line => `Docs: ${line}`).join('\n')}` : ''}`)
  // The loop board's entries take it from here (§2.5): dispatch the review, or integrate a task that is not reviewed.
  if (depth === undefined) deps.emit?.(projectRoot, attempt.parentSession, { event: 'hourness.review-skipped', key: `review-skipped:${node.id}:${attempt.childId}`, payload: { task: node.id } })
  else {
    deps.emit?.(projectRoot, attempt.parentSession, {
      event: 'hourness.handback',
      key: `handback:${node.id}:${attempt.childId}`,
      payload: { task: node.id, attempt: attempt.attempt, status, depth: depth === '全审' ? 'full' : 'light', reviewTask: reviewTask?.id ?? '', commits: commits.length, floorHit: hitClass },
    })
  }
}

function stringList(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string') ? value : undefined
}

/**
 * What the exported rules file read as (reval design §3.2): a file that is
 * not there is the legal no-rules state, a failed read is unreadable. Both
 * the dispatch and the handback comparison read it this way.
 */
export async function rulesReadOf(projectRoot: string): Promise<RulesRead> {
  const text = await readFile(rulesPaths(projectRoot).rulesFile, 'utf8').then(
    text => text,
    (error: unknown): string | null | undefined => error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null,
  )
  return text === undefined ? { kind: 'absent' } : text === null ? { kind: 'unreadable' } : { kind: 'text', text }
}

/** The change a done handback made, as the floor reads it (§3.7.1). */
export async function changeOf(git: Git, worktree: string, base: string | undefined, head: string | undefined): Promise<FloorChange> {
  if (base === undefined || head === undefined) return { paths: [], deleted: [] }
  const changed = await git.changedFiles(worktree, base, head)
  if (!changed.ok) return { paths: [], deleted: [] }
  return { paths: changed.value.map(file => file.path), deleted: changed.value.filter(file => file.status === 'D').map(file => file.path) }
}

/** The ancestor directories of the changed paths, the checkout root excluded, once each (§6.1's component candidates). */
function ancestorDirsOf(paths: readonly string[]): readonly string[] {
  const dirs = new Set<string>()
  for (const file of paths) {
    const segments = file.split('/')
    segments.pop()
    while (segments.length > 0) {
      dirs.add(segments.join('/'))
      segments.pop()
    }
  }
  return [...dirs]
}

/** The nearest directory above `file` that the head commit's tree gives an `AGENTS.md`: the component the handback's own commit says the file belongs to. */
function componentAtHead(file: string, withAgents: ReadonlySet<string>): string | undefined {
  const segments = file.split('/')
  segments.pop()
  while (segments.length > 0) {
    const dir = segments.join('/')
    if (withAgents.has(dir)) return dir
    segments.pop()
  }
  return undefined
}

/** The command record of one dispatch, as the floor reads it (§3.8.5). */
export async function readCalls(recordFile: string): Promise<FloorCall[]> {
  const text = await readFile(recordFile, 'utf8').then(text => text, () => '')
  return text.split('\n').filter(line => line !== '').flatMap(line => {
    try {
      const record = JSON.parse(line) as { tool?: unknown, simple?: unknown, git?: unknown, paths?: unknown, writes?: unknown }
      if (typeof record.tool !== 'string' || !Array.isArray(record.paths)) return []
      return [{
        tool: record.tool,
        words: record.simple as FloorCall['words'],
        git: Array.isArray(record.git) ? record.git as FloorCall['git'] : [],
        paths: record.paths as string[],
        writes: record.writes === true,
        shell: record.simple !== null,
      }]
    }
    catch {
      return []
    }
  })
}

/** The refused calls of a command record: the attempts to leave the scope count too (§3.7.1's outside). */
async function outsideCount(recordFile: string): Promise<number> {
  const text = await readFile(recordFile, 'utf8').then(text => text, () => '')
  return text.split('\n').filter(line => line.includes('"verdict":"refused"')).length
}

// ---- the lessons seam (§3.5.5) ----

interface LessonItem {
  readonly problem: string
  readonly fix: string
  readonly files: readonly string[]
  readonly commands: readonly string[]
  readonly tools: readonly string[]
  readonly errors?: readonly string[]
  readonly scope?: 'project' | 'all'
}

function lessonsOf(value: unknown): readonly LessonItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (!isRecord(entry) || typeof entry.problem !== 'string' || typeof entry.fix !== 'string') return []
    return [{
      problem: entry.problem,
      fix: entry.fix,
      files: stringList(entry.files) ?? [],
      commands: stringList(entry.commands) ?? [],
      tools: stringList(entry.tools) ?? [],
      ...(Array.isArray(entry.errors) && entry.errors.every(item => typeof item === 'string') ? { errors: entry.errors } : {}),
      ...(entry.scope === 'all' ? { scope: 'all' as const } : { scope: 'project' as const }),
    }]
  })
}

async function lessonsStep(deps: HandbackDeps, attempt: Attempt, lessons: readonly LessonItem[]): Promise<{ count: number, rejected?: number, fallback?: string }> {
  if (lessons.length === 0) return { count: 0 }
  const service: unknown = typeof deps.lookup.get === 'function' ? deps.lookup.get(LESSONS_SERVICE) : undefined
  const propose = (service as { propose?: unknown } | null | undefined)?.propose
  const agents = typeof deps.lookup.get === 'function' ? deps.lookup.get('agents') as { get(name: string): unknown } | undefined : undefined
  const parentSession = attempt.parentSession === undefined ? undefined : (agents?.get(attempt.parentSession) as { session?: unknown } | undefined)?.session
  if (typeof propose !== 'function' || parentSession === undefined) {
    // The service is off, or the parent's session is not in this process: the fallback comment keeps the candidates on the task (§3.5.5).
    const lines = lessons.map(lesson => `[候选经验] ${secretChecked(lesson.problem)} → ${secretChecked(lesson.fix)} · ${JSON.stringify({ files: lesson.files.map(secretChecked), commands: lesson.commands.map(secretChecked), tools: lesson.tools, ...(lesson.errors === undefined ? {} : { errors: lesson.errors.map(secretChecked) }), scope: lesson.scope })}`)
    return { count: lessons.length, fallback: `候选经验退路 · ${attempt.childId}\n${lines.join('\n')}` }
  }
  let count = 0
  let rejected: number | undefined
  for (const lesson of lessons) {
    count += 1
    try {
      const result = await (propose as (candidate: unknown, context: unknown) => Promise<{ status?: string; code?: string } | { error?: string }>)(
        { problem: lesson.problem, fix: lesson.fix, files: lesson.files, commands: lesson.commands, tools: lesson.tools, ...(lesson.errors === undefined ? {} : { errors: lesson.errors }), scope: lesson.scope },
        { session: parentSession, task: attempt.node, childId: attempt.childId },
      )
      if (result !== null && typeof result === 'object' && 'status' in result && result.status === 'rejected') rejected = (rejected ?? 0) + 1
    }
    catch {
      // One propose failing does not stop the others; the summary counts what it counted.
    }
  }
  return { count, ...(rejected === undefined ? {} : { rejected }) }
}

/** One string through the secret shape; a hit is replaced, the content never reaches the graph (§3.5.5). */
function secretChecked(text: string): string {
  return looksSecret(text) === undefined ? text : '（像密钥，已略去）'
}

// ---- the review handbacks (§3.7.2–§3.7.5) ----

interface Verdict {
  readonly verdict: 'APPROVED' | 'CHANGES_REQUESTED'
  readonly commit: string
  readonly findings: readonly { readonly id: string, readonly blocking: boolean, readonly criterion: string, readonly where: string, readonly what: string, readonly fix: string }[]
  readonly checked: readonly string[]
}

function verdictOf(settlement: unknown): Verdict | undefined {
  const structured = isRecord(settlement) && isRecord(settlement.structured) ? settlement.structured : undefined
  if (structured === undefined || !Array.isArray(structured.findings) || typeof structured.commit !== 'string' || (structured.verdict !== 'APPROVED' && structured.verdict !== 'CHANGES_REQUESTED') || !Array.isArray(structured.checked)) return undefined
  const findings = structured.findings.flatMap(entry => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.blocking !== 'boolean' || typeof entry.criterion !== 'string' || typeof entry.where !== 'string' || typeof entry.what !== 'string' || typeof entry.fix !== 'string') return []
    return [{ id: entry.id, blocking: entry.blocking, criterion: entry.criterion, where: entry.where, what: entry.what, fix: entry.fix }]
  })
  return { verdict: structured.verdict, commit: structured.commit, findings, checked: structured.checked as string[] }
}

/** The review problems of a verdict shape, for the ending comment when a reviewer brings none. */
function problemsOf(settlement: unknown): string {
  const problems = reviewProblems(isRecord(settlement) && isRecord(settlement.structured) ? settlement.structured : undefined)
  return problems.length === 0 ? 'no structured verdict' : problems.join('; ')
}

/** One coverage item: `acceptance:<i>` (or `direction:<i>`) named in `checked`. */
function covers(checked: readonly string[], kind: 'acceptance' | 'direction', count: number): readonly number[] {
  const missing: number[] = []
  for (let index = 0; index < count; index++) {
    if (!checked.includes(`${kind}:${index}`)) missing.push(index)
  }
  return missing
}

/** Void one round: voided once, the same model and reason dispatch again (§3.7.1, §3.7.2); voided twice, back to the main agent. The count is the review task's, whichever dispatch caused the voids. */
async function voidRound(deps: HandbackDeps, attempt: Attempt, node: GraphNode, reason: string): Promise<'redispatched' | 'blocked'> {
  const voids = node.history.filter(entry => entry.op === 'comment' && entry.actor === 'harness' && typeof entry.text === 'string' && entry.text.startsWith('审查作废 · '))
  if (voids.length > 0 || deps.redispatch === undefined) {
    notify(deps, attempt.graphDir, 'review', attempt, `Review round of ${node.id} voided twice.`, `The verdict is not usable (${reason}); it was voided and re-dispatched once already. Treat the task as blocked and decide: dispatch the review again with better instructions, or ask the person.`)
    return 'blocked'
  }
  await comment(deps, attempt.graphDir, node.id, `审查作废 · ${attempt.childId} · ${reason}`)
  // Drop this dispatch from the register first: the re-dispatch's gate would see it as the node's running dispatch.
  forgetAttempt(attempt.childId)
  const dispatched = await deps.redispatch(node.id, attempt).catch(() => false)
  if (!dispatched) {
    notify(deps, attempt.graphDir, 'review', attempt, `Review round of ${node.id} could not be re-dispatched.`, `The verdict was voided (${reason}), and the re-dispatch with the same model and reason failed. Treat the task as blocked and decide.`)
    return 'blocked'
  }
  return 'redispatched'
}

type ReviewKind = 'review' | 'design review' | 'acceptance review'
const capitalized = (kind: ReviewKind): string => `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`

/** The reviewer settled without a structured verdict: the ending comment and the notice; the next dispatch starts a fresh round (§3.7.2). */
async function endWithoutVerdict(deps: HandbackDeps, attempt: Attempt, node: GraphNode, kind: ReviewKind, stopReason: string): Promise<void> {
  await comment(deps, attempt.graphDir, node.id, `第 ${attempt.attempt} 次结束：${stopReason} · ${attempt.childId}`)
  notify(deps, attempt.graphDir, 'review', attempt, `${capitalized(kind)} ${node.id} ended without a verdict (${stopReason}).`, `The reviewer settled as ${stopReason} with no structured verdict; dispatch the ${kind} again.`)
}

/** The verdict the reviewer brought does not parse: the ending comment names the schema problems (§3.7.2). */
async function endWithInvalidVerdict(deps: HandbackDeps, attempt: Attempt, node: GraphNode, kind: ReviewKind, problems: string): Promise<void> {
  await comment(deps, attempt.graphDir, node.id, `第 ${attempt.attempt} 次结束：verdict invalid · ${attempt.childId} · ${problems}`)
  notify(deps, attempt.graphDir, 'review', attempt, `${capitalized(kind)} ${node.id} brought an unusable verdict.`, `${problems}; dispatch the ${kind} again.`)
}

/** The history time of the newest comment on a node with exactly this text, read back after the write: the key of a stop (D11). */
async function commentAt(graphDir: string, nodeId: string, text: string): Promise<string | undefined> {
  const graph = await openEngine(graphDir).load().catch(() => undefined)
  return graph?.nodes.get(nodeId)?.history.filter(entry => entry.op === 'comment' && entry.text === text).at(-1)?.at
}

async function taskReviewHandback(deps: HandbackDeps, attempt: Attempt, graph: LoadedGraph, node: GraphNode, settlement: unknown): Promise<void> {
  const reviewed = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  const structured = isRecord(settlement) && isRecord(settlement.structured) ? settlement.structured : undefined
  const stopReason = isRecord(settlement) && typeof settlement.stopReason === 'string' && settlement.stopReason !== '' ? settlement.stopReason : 'error'
  if (structured === undefined || reviewed === undefined) {
    await endWithoutVerdict(deps, attempt, node, 'review', stopReason)
    return
  }
  const verdict = verdictOf(settlement)
  if (verdict === undefined) {
    await endWithInvalidVerdict(deps, attempt, node, 'review', problemsOf(settlement))
    return
  }
  const depth: '全审' | '轻审' = attempt.depth === 'light' ? '轻审' : '全审'
  const handback = reviewed.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseHandbackComment(entry.text)] : []).filter(entry => entry !== undefined && entry.status === 'done').at(-1)
  const reviewedCommit = handback?.head
  const commitShort = verdict.commit.slice(0, 12)
  if (reviewedCommit !== undefined && !verdict.commit.startsWith(reviewedCommit)) {
    const outcome = await voidRound(deps, attempt, node, 'the verdict names a commit that is not the reviewed one')
    if (outcome === 'redispatched') return
    taskReviewHandbackBlocked(deps, attempt, node)
    return
  }
  if (depth === '全审') {
    const missing = covers(verdict.checked, 'acceptance', (reviewed.acceptance ?? []).length)
    if (missing.length > 0) {
      const outcome = await voidRound(deps, attempt, node, `the full review does not cover acceptance:${missing.join(', acceptance:')}`)
      if (outcome === 'redispatched') return
      taskReviewHandbackBlocked(deps, attempt, node)
      return
    }
  }
  const normalized = normalizeVerdict(reviewed, verdict, undefined)
  const blocking = normalized.findings.filter(finding => finding.blocking)
  const nonBlocking = normalized.findings.filter(finding => !finding.blocking)
  // The reviewer's handback comment: the verdict and the findings, what the next round's brief reads (§3.7.1).
  const findingLines = normalized.findings.map(finding => `- [${finding.blocking ? 'blocking' : 'non-blocking'}] ${finding.criterion} at ${finding.where}: ${finding.what} (fix: ${finding.fix})`)
  await comment(deps, attempt.graphDir, node.id, `审查交回 · ${attempt.childId} · ${normalized.verdict} · 提交 ${commitShort} · 挡路 ${blocking.length} · 不挡路 ${nonBlocking.length}${normalized.demoted > 0 ? ` · 改为不挡路 ${normalized.demoted} 条：没有挂到三类标准上` : ''}\n${findingLines.join('\n')}`)
  // The rounds since the person's latest word in the subtree (§3.7.3), this round included. The graph is re-read first: the two comments above are part of this step's fresh read.
  const fresh = await deps.cache.load(attempt.graphDir)
  const freshNode = fresh.nodes.get(node.id)
  if (freshNode === undefined) return
  const freshReviewed = fresh.nodes.get(reviewed.id)
  const questions = [...fresh.nodes.values()].filter(entry => entry.type === 'question' && (entry.parent === reviewed.id || entry.parent === node.id))
  const humanAt = latestHumanAt([freshReviewed?.history ?? [], freshNode.history, ...questions.map(entry => entry.history)])
  const rounds = roundsSinceHuman(freshNode.history, humanAt)
  const k = (rounds.at(-1)?.k ?? 0) + 1
  const current: Round = { k, blocking: blocking.length, nonBlocking: nonBlocking.length, depth, childId: attempt.childId, at: new Date().toISOString(), stopped: false }
  const convergence = converge([...rounds, current], humanAt !== undefined)
  const stopping = convergence.action === 'stop'
  const roundWritten = await comment(deps, attempt.graphDir, node.id, renderRoundComment(k, blocking.length, nonBlocking.length, depth, attempt.childId, stopping))
  if (!roundWritten && stopping) {
    markStoppedInMemory(node.id)
    deps.report(attempt.parentSession, 'degraded', `停下的标记写不进图（${node.id}）：本进程内照样拒绝派发，图恢复可写后补写`)
  }
  const projectRoot = (attempt.worktree === undefined ? undefined : projectOf(attempt.worktree)?.root) ?? dirname(dirname(attempt.graphDir))
  if (convergence.action === 'pass') {
    // §3.7.3: the review task is done, with the evidence the trunk check later reads; a reviewed task that already reached the trunk goes with it.
    const patchId = await patchIdOf(deps, attempt, handback)
    const engine = openEngine(attempt.graphDir, { now: deps.now ?? ((): Date => new Date()) })
    const finished = await writeWithRetry(async () => {
      const current = await engine.load()
      return engine.apply('harness', { op: 'status', id: node.id, rev: current.revisions.get(node.id)!, to: 'done', evidence: [{ kind: 'check', ref: `review ${attempt.childId}`, exit: 0, note: `${commitShort} · ${depth} · patch ${patchId} · ${attempt.provider}/${attempt.model}` }], reason: `review passed (${attempt.childId})` })
    })
    if (!finished.ok) deps.report(attempt.parentSession, 'degraded', `审查任务的完成写不进图（${node.id}）：${finished.error.message}`)
    // A reviewed task already on the trunk waited for this pass (§3.8.4, D2): it goes done with the evidence of its trunk advance.
    const trunkEvidence = reviewed.status === 'done' || deps.trunkEvidence === undefined
      ? undefined
      : await deps.trunkEvidence(projectRoot, reviewed.id).catch((error: unknown) => {
          deps.report(attempt.parentSession, 'degraded', `被审任务的进主干证据读不出（${reviewed.id}）：${errorText(error)}`)
          return undefined
        })
    if (trunkEvidence !== undefined && trunkEvidence.length > 0) {
      const doneReviewed = await writeWithRetry(async () => {
        const current = await engine.load()
        return engine.apply('harness', { op: 'status', id: reviewed.id, rev: current.revisions.get(reviewed.id)!, to: 'done', evidence: trunkEvidence, reason: `review passed (${attempt.childId}) after the trunk advance` })
      })
      if (!doneReviewed.ok) deps.report(attempt.parentSession, 'degraded', `被审任务的完成写不进图（${reviewed.id}）：${doneReviewed.error.message}`)
      else {
        // The task is done: its clean worktree goes as at a trunk advance (D3); git refuses an unclean one and it stays.
        const worktree = join(projectRoot, '.worktrees', `hz-${reviewed.id}`)
        if (await stat(worktree).then(() => true, () => false)) await deps.git.removeWorktree(projectRoot, worktree)
      }
    }
    notify(deps, attempt.graphDir, 'review', attempt, `Task ${reviewed.id} round ${k}: APPROVED.`, `The review of ${reviewed.id} passed in round ${k} (${depth}); the review task ${node.id} is done. Continue with the merge checks.`)
    emitMetric({ event: 'execute.review', task: reviewed.id, round: k, depth: depth === '全审' ? 'full' : 'light', model: attempt.model, blocking: 0, nonBlocking: nonBlocking.length, demoted: normalized.demoted })
    deps.emit?.(projectRoot, attempt.parentSession, { event: 'hourness.review-passed', key: `review-passed:${reviewed.id}:${attempt.childId}`, payload: { task: reviewed.id, round: k } })
    return
  }
  if (stopping) {
    // §3.7.3: the marker is on this round's comment (written above); the stop draft goes to the person through `hourness.stopped`, keyed with that comment's time (D11).
    emitMetric({ event: 'execute.stop', node: reviewed.id, kind: 'review', rounds: k })
    const roundText = renderRoundComment(k, blocking.length, nonBlocking.length, depth, attempt.childId, true)
    const stoppedAt = roundWritten ? await commentAt(attempt.graphDir, node.id, roundText) : undefined
    deps.emit?.(projectRoot, attempt.parentSession, { event: 'hourness.stopped', key: `stopped:${node.id}:review-${stoppedAt ?? current.at}`, payload: { node: node.id, kind: 'review', rounds: k } })
    return
  }
  if (blocking.length > 0) {
    // §3.7.3: a factual notice with the blocking findings; the non-blocking ones are annotated on the reviewed task.
    if (nonBlocking.length > 0) {
      await comment(deps, attempt.graphDir, reviewed.id, `不挡路 · ${attempt.childId}（第 ${k} 轮）\n${nonBlocking.map(finding => `- ${finding.criterion} at ${finding.where}: ${finding.what} (fix: ${finding.fix})`).join('\n')}`)
    }
    notify(deps, attempt.graphDir, 'review', attempt, `Task ${reviewed.id} round ${k}: ${blocking.length} blocking finding(s).`, `Round ${k} of the review (${depth}) found ${blocking.length} blocking:\n${blocking.map(finding => `- ${finding.criterion} at ${finding.where}: ${finding.what} (fix: ${finding.fix})`).join('\n')}\nAddress them and dispatch the task again: dispatch_task {id: "${reviewed.id}"}; the next review round carries these findings.`)
    emitMetric({ event: 'execute.review', task: reviewed.id, round: k, depth: depth === '全审' ? 'full' : 'light', model: attempt.model, blocking: blocking.length, nonBlocking: nonBlocking.length, demoted: normalized.demoted })
    return
  }
  emitMetric({ event: 'execute.review', task: reviewed.id, round: k, depth: depth === '全审' ? 'full' : 'light', model: attempt.model, blocking: 0, nonBlocking: nonBlocking.length, demoted: normalized.demoted })
}

function taskReviewHandbackBlocked(deps: HandbackDeps, attempt: Attempt, node: GraphNode): void {
  notify(deps, attempt.graphDir, 'review', attempt, `Review of ${node.id} is blocked.`, `The verdict kept being unusable; decide: dispatch the review again with better instructions, or ask the person.`)
}

/** `git diff <base> <commit> | git patch-id --stable`, the patch id the trunk check reads from the evidence (§3.7.1). The diff runs in the reviewed task's worktree, where the reviewer worked. */
async function patchIdOf(deps: HandbackDeps, attempt: Attempt, handback: HandbackComment | undefined): Promise<string> {
  if (attempt.worktree === undefined || handback?.base === undefined || handback.head === undefined) return 'unknown'
  const patch = await deps.runCommand(attempt.worktree, `git diff ${handback.base} ${handback.head} | git patch-id --stable`, SESSION_TIMEOUT_MS)
  return patch.code === 0 ? patch.stdout.split(/\s+/)[0] ?? 'unknown' : 'unknown'
}

async function designReviewHandback(deps: HandbackDeps, attempt: Attempt, graph: LoadedGraph, node: GraphNode, settlement: unknown): Promise<void> {
  const module = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  const structured = isRecord(settlement) && isRecord(settlement.structured) ? settlement.structured : undefined
  const stopReason = isRecord(settlement) && typeof settlement.stopReason === 'string' && settlement.stopReason !== '' ? settlement.stopReason : 'error'
  if (structured === undefined || module === undefined) {
    await endWithoutVerdict(deps, attempt, node, 'design review', stopReason)
    return
  }
  // Stale first (§3.7.5): the module or the goal moved under the review — no record, a notice, and a fresh dispatch is wanted.
  const stale = staleness(graph, attempt.pins, sha256Hex)
  if (stale.length > 0) {
    notify(deps, attempt.graphDir, 'stale', attempt, `Design review ${node.id} went stale.`, `The graph moved under the review since it was dispatched: ${stale.map(change => `${change.id} ${change.change}`).join(', ')}. No record was written; dispatch the design review again.`)
    return
  }
  const verdict = verdictOf(settlement)
  if (verdict === undefined) {
    await endWithInvalidVerdict(deps, attempt, node, 'design review', problemsOf(settlement))
    return
  }
  const directions = graph.nodes.get(DIRECTIONS_ID)
  const directionCount = (directions?.acceptance ?? []).length
  const normalized = normalizeVerdict(module, verdict, directionCount)
  const blocking = normalized.findings.filter(finding => finding.blocking)
  const nonBlocking = normalized.findings.filter(finding => !finding.blocking)
  // The full coverage of a design review: every direction and every acceptance item of the module (§3.7.5).
  const missing = [...covers(verdict.checked, 'direction', directionCount).map(index => `direction:${index}`), ...covers(verdict.checked, 'acceptance', (module.acceptance ?? []).length).map(index => `acceptance:${index}`)]
  if (missing.length > 0) {
    const outcome = await voidRound(deps, attempt, node, `the review does not cover ${missing.join(', ')}`)
    if (outcome === 'redispatched') return
    notify(deps, attempt.graphDir, 'review', attempt, `Design review of ${module.id} is blocked.`, `The verdict kept being unusable; decide: dispatch the design review again, or ask the person.`)
    return
  }
  // The record (§3.7.5): what the module release gate's eighth item reads.
  const digest = sha256Hex((directions?.acceptance ?? []).map(text => text.trim()).join('\n')).slice(0, 12)
  const dispatchedAt = dispatchedAtOf(node, attempt.childId) ?? new Date(deps.now?.().getTime() ?? Date.now()).toISOString()
  const record = `设计审查 · ${attempt.childId} · ${normalized.verdict} · 方向清单 ${digest} · 挡路 ${blocking.length} · 派出 ${dispatchedAt}`
  const recorded = await comment(deps, attempt.graphDir, module.id, record)
  if (!recorded) {
    deps.report(attempt.parentSession, 'degraded', `设计审查记录写不进图（模块 ${module.id}）：评审${normalized.verdict === 'APPROVED' ? '通过但' : ''}没有记录，放行页提不出这一项；重派一轮直到写成`)
  }
  const k = roundsOf(node.history).length + 1
  await comment(deps, attempt.graphDir, node.id, renderRoundComment(k, blocking.length, nonBlocking.length, '全审', attempt.childId))
  emitMetric({ event: 'execute.review', task: module.id, round: k, depth: 'full', model: attempt.model, blocking: blocking.length, nonBlocking: nonBlocking.length, demoted: normalized.demoted })
  const line = normalized.verdict === 'APPROVED' ? `Module ${module.id} design review round ${k}: APPROVED` : `Module ${module.id} design review round ${k}: CHANGES_REQUESTED, ${blocking.length} blocking`
  notify(deps, attempt.graphDir, 'review', attempt, line, `${line}.\n${blocking.map(finding => `- ${finding.criterion} at ${finding.where}: ${finding.what} (fix: ${finding.fix})`).join('\n')}`)
}

// ---- the acceptance review of a goal (§3.9.4) ----

const ACCEPTANCE_CHECKED = /^acceptance:(\d+)(?!\d)[\s:：,，.—–-]*(\S.*)?$/

/** The goal's acceptance items `checked` does not cover with evidence: each needs an entry `acceptance:<i> <evidence>` (§3.9.4). */
function uncovered(checked: readonly string[], count: number): readonly number[] {
  const covered = new Set<number>()
  for (const entry of checked) {
    const match = ACCEPTANCE_CHECKED.exec(entry.trim())
    if (match !== null && match[2] !== undefined) covered.add(Number(match[1]))
  }
  return Array.from({ length: count }, (_, index) => index).filter(index => !covered.has(index))
}

/**
 * The verdict of a goal's acceptance review (§3.9.4, design 0.2 §3.9.4): a
 * verdict that names another commit than the trunk commit of the dispatch,
 * or does not cover every acceptance item with its evidence, voids the round
 * once (a second void goes back to the main agent); otherwise the findings
 * comment and the round comment `验收审查第 k 轮：…` on the goal, which the
 * completion gate's fifth item reads. `k` counts the goal's rounds since the
 * person's latest word on the goal or a question under it; the release the
 * person wrote before any round is no answer to the review, so the table's
 * "after the person answered" row needs a word that came after an earlier
 * round. A stop marks the round and hands `hourness.stopped` (kind
 * `acceptance`) to the loop board.
 */
async function acceptanceHandback(deps: HandbackDeps, attempt: Attempt, goal: GraphNode, settlement: unknown): Promise<void> {
  const structured = isRecord(settlement) && isRecord(settlement.structured) ? settlement.structured : undefined
  const stopReason = isRecord(settlement) && typeof settlement.stopReason === 'string' && settlement.stopReason !== '' ? settlement.stopReason : 'error'
  if (structured === undefined) {
    await endWithoutVerdict(deps, attempt, goal, 'acceptance review', stopReason)
    return
  }
  const verdict = verdictOf(settlement)
  if (verdict === undefined) {
    await endWithInvalidVerdict(deps, attempt, goal, 'acceptance review', problemsOf(settlement))
    return
  }
  const trunk = attempt.baseSha ?? ''
  const named = verdict.commit.toLowerCase()
  const sameCommit = trunk !== '' && /^[0-9a-f]{7,40}$/.test(named) && (trunk.startsWith(named) || named.startsWith(trunk))
  const missing = uncovered(verdict.checked, (goal.acceptance ?? []).length)
  const fault = !sameCommit ? `the verdict names commit ${verdict.commit.slice(0, 40)}, not the trunk commit ${trunk.slice(0, 12)} the review was dispatched at`
    : missing.length > 0 ? `checked does not cover acceptance:${missing.join(', acceptance:')} with its evidence` : undefined
  if (fault !== undefined) {
    await voidRound(deps, attempt, goal, fault)
    return
  }
  const normalized = normalizeVerdict(goal, verdict)
  const blocking = normalized.findings.filter(finding => finding.blocking)
  const nonBlocking = normalized.findings.filter(finding => !finding.blocking)
  const trunk12 = trunk.slice(0, 12)
  const findingLines = normalized.findings.map(finding => `- [${finding.blocking ? 'blocking' : 'non-blocking'}] ${finding.criterion} at ${finding.where}: ${finding.what} (fix: ${finding.fix})`)
  await comment(deps, attempt.graphDir, goal.id, `验收审查交回 · ${attempt.childId} · ${normalized.verdict} · 提交 ${trunk12} · 挡路 ${blocking.length} · 不挡路 ${nonBlocking.length}${normalized.demoted > 0 ? ` · 改为不挡路 ${normalized.demoted} 条：没有挂到验收条目上` : ''}${findingLines.length > 0 ? `\n${findingLines.join('\n')}` : ''}`)
  // The rounds are read from the goal after the findings comment (the graph is the source of truth).
  const fresh = await deps.cache.load(attempt.graphDir)
  const freshGoal = fresh.nodes.get(goal.id)
  if (freshGoal === undefined) return
  const questions = [...fresh.nodes.values()].filter(entry => entry.type === 'question' && entry.parent === goal.id)
  const humanAt = latestHumanAt([freshGoal.history, ...questions.map(entry => entry.history)])
  const all = acceptanceRounds(freshGoal)
  const since: Round[] = all.filter(round => humanAt === undefined || round.at > humanAt)
    .map(round => ({ k: round.k, blocking: round.blocking, nonBlocking: 0, depth: '全审', childId: round.childId, at: round.at, stopped: round.stopped }))
  const answered = humanAt !== undefined && all.some(round => round.at <= humanAt)
  const k = (since.at(-1)?.k ?? 0) + 1
  const current: Round = { k, blocking: blocking.length, nonBlocking: nonBlocking.length, depth: '全审', childId: attempt.childId, at: new Date().toISOString(), stopped: false }
  const convergence = converge([...since, current], answered)
  const stopping = convergence.action === 'stop'
  const roundText = renderAcceptanceComment(k, normalized.verdict, blocking.length, attempt.childId, trunk12, attempt.pins, stopping)
  const written = await comment(deps, attempt.graphDir, goal.id, roundText)
  if (!written) {
    if (stopping) markStoppedInMemory(goal.id)
    deps.report(attempt.parentSession, 'degraded', `验收审查的轮次批注写不进图（${goal.id}，${attempt.childId}）：完成门禁读不到这一轮${stopping ? '；本进程内照样拒绝派发，图恢复可写后补写' : ''}`)
  }
  emitMetric({ event: 'execute.acceptance-review', goal: goal.id, round: k, model: attempt.model, verdict: normalized.verdict, blocking: blocking.length })
  const projectRoot = (attempt.worktree === undefined ? undefined : projectOf(attempt.worktree)?.root) ?? dirname(dirname(attempt.graphDir))
  if (stopping) {
    // §3.7.3 for the goal: the marker is on this round's comment; the stop draft goes to the person through `hourness.stopped` (D11).
    emitMetric({ event: 'execute.stop', node: goal.id, kind: 'acceptance', rounds: k })
    const stoppedAt = written ? await commentAt(attempt.graphDir, goal.id, roundText) : undefined
    deps.emit?.(projectRoot, attempt.parentSession, { event: 'hourness.stopped', key: `stopped:${goal.id}:acceptance-${stoppedAt ?? current.at}`, payload: { node: goal.id, kind: 'acceptance', rounds: k } })
    return
  }
  if (convergence.action === 'pass') {
    notify(deps, attempt.graphDir, 'review', attempt, `Goal ${goal.id} acceptance review round ${k}: APPROVED.`, `The acceptance review of goal ${goal.id} passed in round ${k} at ${trunk12}. Call update_goal complete; the completion gate checks what is left.`)
    return
  }
  notify(deps, attempt.graphDir, 'review', attempt, `Goal ${goal.id} acceptance review round ${k}: ${blocking.length} blocking finding(s).`, `Round ${k} of the acceptance review at ${trunk12} found ${blocking.length} blocking:\n${blocking.map(finding => `- ${finding.criterion} at ${finding.where}: ${finding.what} (fix: ${finding.fix})`).join('\n')}\nSplit the failed acceptance into new tasks under the approved feature or task it belongs to, dispatch them, and once they are on the trunk dispatch the acceptance review again: dispatch_task {id: "${goal.id}"} with a model and why.`)
}
