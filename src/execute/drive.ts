/**
 * The drive (M7 design 0.6 §3.9.1, §3.9.3, §3.9.5, §3.9.7): what the execute
 * row does with the holder's DSH goal so a released design is driven to the
 * end without a command, and what keeps the goal from being marked complete
 * while work is missing.
 *
 * - `onStep` runs in the holder's `agent/pre-step` before the step (goal
 *   operations land before the model reads, U12) and never throws: the
 *   holder's first step in the process hands over `hourness.host-started`;
 *   the second and third tiers' returns are acknowledged on the graph
 *   (`退回设计 · <at> · …`); the decision table of `tiers.ts`
 *   (`driveDecision`) picks one act — hand over `hourness.design-released`,
 *   start on the new holder after `/wish here` (D14), resume, block
 *   `hourness-design-wait`, or hold with the line that says why; an active
 *   goal with open guard requests blocks `hourness-waiting-human` (D3);
 *   `hourness.tasks-closed` goes out once every task of the goal is closed;
 *   at the first step of a goal round the idle and peak counters move
 *   (`nextCounters`, D7) and block `hourness-idle-rounds` or
 *   `hourness-peak-wait`, the latter with a timer five minutes after the
 *   peak's end in case the loop board does not resume it.
 * - `startDrive` and `resumeDrive` are the harness actions
 *   `execute.start-drive` and `execute.resume-drive`, idempotent per release
 *   (the `放行 <at>` comment is the key) and per block.
 * - `onGoalChanged` writes the pause line of drive.jsonl, marks the graph
 *   goal done when a `complete` pairs with a completion-gate credential of
 *   the last ten minutes, and comments a completion outside the gate and the
 *   blocks the row did not make (D5: comment only, no retro node).
 * - `completionGate` is the `tools/pre-execute` listener on the main agent's
 *   `update_goal complete` (rule `completion-gate`): `goalCompletion` with
 *   the git facts read here; gaps deny with the first ten, a pass keeps the
 *   credential.
 * - `awaitHuman` is the main agent's `await_human`; `batchMark` comments a
 *   batch after a shown `propose_to_human` and after `await_human` (D8).
 * - `reconcile` is the harness action `execute.reconcile` (§3.9.6) of
 *   `hourness.host-started`, idempotent per event key through
 *   `<exec>/reconcile.jsonl`; a completion-gate refusal runs it once more
 *   without the key. A dispatch the host lost is replayed from the
 *   `hournessHandback` session projection, or commented lost and listed in
 *   the status; the trunk evidence, the interrupted harness actions, a DSH
 *   goal completed while its graph goal is not done, and the two-level
 *   loop's returns and module releases are caught up. It never dispatches.
 *
 * Model-facing words are English. Sentences the design gives are used as it
 * writes them; the ones it leaves open (the idle block, the hold lines it has
 * no sentence for, the gate's refusal header) are authored here (D9). The
 * drive's journal is src/execute/drive-log.ts.
 */
import { dirname, join } from 'node:path'
import { openEngine, type ApplyResult } from '../graph/engine.ts'
import { acceptanceRounds, goalCompletion, isDesignReview, isPostRelease, MODULE_READERS, scopedTasks, sentBack, type AcceptanceRound, type CompletionFacts } from '../graph/execute-stage.ts'
import { isGoalRound } from '../graph/digest-notice.ts'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { staleness } from '../graph/pins.ts'
import { childrenIndex, deciderOf, subtreeOf } from '../graph/projection.ts'
import type { GraphNode } from '../graph/schema.ts'
import { graphFocus } from '../graph/service.ts'
import { effectiveStage, goalOf } from '../graph/stage.ts'
import { projectOf } from '../data/project-root.ts'
import { errorText, isRecord, mainAgentCall, refuse, toolShell } from '../design/tool-support.ts'
import type { ViolationRecord } from '../guard/records.ts'
import { requestsService } from '../guard/request-service.ts'
import type { HarnessResult, LoopEventRecord } from '../loops/service.ts'
import { createUserNotice, type AgentLike, type GoalChangedPayload, type GoalsService, type GoalView as DshGoalView, type LiveAgentLike, type PostExecuteListener, type PreExecuteListener, type ServiceLookup, type SessionEventDocumentLike, type SessionLike, type SessionObservationLike, type SessionQueryService, type ToolDefinitionLike } from '../shared/dsh-min.ts'
import { peakModeService, type PeakHold } from '../shared/peak-mode.ts'
import { shownProposalOf } from '../shared/tool-names.ts'
import { latestDispatch, lostChildOf, registeredAttempt, registeredDispatches, renderLostComment, type Attempt, type DispatchRecord } from './attempts.ts'
import { toHolder, trunkBranchOf } from './check.ts'
import { sha256Hex } from './digest.ts'
import type { GraphCache } from './dispatch.ts'
import { appendDrive, appendDriveSync, appendReconcile, readDrive, reconciledKeys, restartPause, type DriveLine } from './drive-log.ts'
import type { Git } from './git.ts'
import { alreadyProcessed, HANDBACK_PROJECTION, type Settlement } from './handback.ts'
import { PROC, unrefDelay, type LoopEmit } from './loop-link.ts'
import { emitMetric, onMetricEvent } from './metrics.ts'
import { writeWithRetry } from './retry.ts'
import { batchSince, DRIVE_START_MARK, driveDecision, nextCounters, pendingRelease, pendingReport, RELEASE_MARK, returnsOf, type DriveCounters, type DriveDecision, type GoalView } from './tiers.ts'

// ---- the words (§3.9.1, §3.9.5; D9 for the authored ones) ----

const PERSON_PAUSED = 'The person paused the drive; it resumes when they press resume on the goal bar or run /goal resume.'
const RESTART_RESUMED = 'The drive was paused by the app shutting down and has resumed. If the person meant to pause it, they can pause it again.'
const RELEASED_AGAIN = 'The goal was released again. Tasks that were running when it went back are stale: dispatch them again with the new design.'
const CONTINUE_NOW = 'If the person asks to continue now, call update_goal resume.'
/** Authored (D9): the line after the waited questions and requests are decided. */
const WAITING_DONE = 'What the drive waited for is decided; the drive has resumed.'
/** Authored (D9): the block after three goal rounds without progress (§3.9.5). */
const IDLE_MESSAGE = 'No progress in three goal rounds in a row: nothing was dispatched, handed back, planned, asked, checked or merged, and the project graph did not change. Say in the chat what holds the work; when the person says to go on, call update_goal resume.'
const ROUND_LIMIT_ADVICE = 'The goal used up its rounds: first raise max_goal_rounds by 500 with update_goal edit, then resume.'
const OUTSIDE_GATE = 'goal 在完成门禁之外完成'
const GOALS_ABSENT = '没有 goal 服务，不能自动推进'
const PEAK_TAKEOVER = '高峰结束时循环板没有接上推进：M7 自己接上了'

const designWaitLine = (goal: string): string => `The framework of goal ${goal} is being changed with the person (the goal went back to design). Nothing is dispatched until it is released again.`
const pad = (value: number): string => String(value).padStart(2, '0')
/** `HH:MM` of an ISO time in the host's time zone. */
const clockOf = (iso: string): string => {
  const at = new Date(iso)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}
const peakWaitLine = (hold: PeakHold): string => `Waiting for GLM peak hours to end at ${clockOf(hold.until)}: the work left is held back by the peak mode (${hold.level}). The harness resumes the drive after peak.`
const clearedLine = (objective: string): string => `The person cleared the drive. If they ask you to continue, call create_goal with this objective: ${objective}`

const DRIVE_BODY = (trunk: string): string => `Drive it through the project graph without waiting for the person: dispatch ready tasks with dispatch_task (choose a model and say why), dispatch their reviews the same way, answer worker requests with answer_worker, integrate with git, run check_commit on the commit you want on ${trunk}, then fast-forward ${trunk} to it. Put matters only the person can decide to them in the chat (at most three at a time); when everything left waits for them, call await_human. Mark this goal complete only when the completion gate passes; it lists what is missing.`
const SPLIT_SENTENCE = 'The work is split into modules and the person releases each module on its own; dispatch_task refuses the tasks of a module that is not released (not_released). When no released module has work left, write the design of the next module, have it reviewed against norm-directions (dispatch_task with the module id, choose a model and say why) and fix what blocks, then put its release to the person with propose_to_human (kind release, module <id>); when everything left waits for the person, call await_human.'
const OBJECTIVE_MAX = 2000
const OBJECTIVE_PREFIX = /^Project graph goal ([^\s:]+):/
const MOVED_MARK = '自动推进移到会话 '
const CLOSED: ReadonlySet<string> = new Set(['done', 'dropped', 'superseded'])
const GONE: ReadonlySet<string> = new Set(['dropped', 'superseded'])
/** The execution activity of a goal round (§3.9.5): what a round without it did not do (D7). */
const ACTIVITY: ReadonlySet<string> = new Set(['execute.dispatch', 'execute.handback', 'execute.plan', 'execute.ask', 'execute.check', 'execute.advance'])
const CREDENTIAL_MS = 10 * 60_000
const PEAK_GRACE_MS = 5 * 60_000
const START_TRIES = 3
const ROW_CODES = new Set(['hourness-waiting-human', 'hourness-idle-rounds', 'hourness-peak-wait', 'hourness-design-wait'])

/**
 * The objective of the drive's goal (§3.9.1): the goal, its acceptance, what
 * is not in scope, the drive paragraph with the trunk, and for a split goal
 * the module sentence; at most 2000 characters, `Not in scope` cut first.
 */
function objectiveOf(goal: GraphNode, trunk: string | undefined, split: boolean): string {
  const acceptance = goal.acceptance ?? []
  const nonGoals = goal.nonGoals ?? []
  const build = (scope: boolean): string => [
    `Project graph goal ${goal.id}: ${goal.title}`,
    ...(acceptance.length > 0 ? [`Done when: ${acceptance.map((item, index) => `${index + 1}. ${item}`).join(' ')}`] : []),
    ...(scope && nonGoals.length > 0 ? [`Not in scope: ${nonGoals.join('; ')}`] : []),
    DRIVE_BODY(trunk ?? 'the main branch'),
    ...(split ? [SPLIT_SENTENCE] : []),
  ].join('\n')
  const full = build(true)
  return (full.length <= OBJECTIVE_MAX ? full : build(false)).slice(0, OBJECTIVE_MAX)
}

/** One module or goal sent back to design, with the work that was running in it (§3.9.7 point 3). */
interface SentBackItem {
  readonly node: string
  readonly tier: 2 | 3
  readonly at: string
  readonly running: readonly { readonly task: string, readonly childId: string }[]
}

/** A dispatch the host lost before it handed back (§3.9.6 step 4), listed until the task is dispatched again. */
interface LostDispatch {
  readonly task: string
  readonly attempt: number
  readonly childId: string
}

/** What the dispatch status notice reads of the drive (§3.5.4). */
interface DriveStatus {
  /** The drive's state line of the latest step, when it has something to say. */
  readonly state?: string
  readonly returns: readonly SentBackItem[]
  /** The dispatches the reconcile found lost. */
  readonly lost: readonly LostDispatch[]
  /** The batch's tell (§3.9.7, D8): what the agent decided itself and is to say in the next reply. */
  readonly batchTell?: string
  readonly counters: DriveCounters
}

/** A row-health line of the drive. */
interface DriveNote {
  readonly text: string
  readonly degraded: boolean
}

export interface DriveDeps {
  readonly lookup: ServiceLookup
  readonly cache: GraphCache
  readonly graphDirOf: (cwd: string | undefined) => string | undefined
  readonly graphDirOfRoot: (root: string) => string
  readonly execDir: (projectRoot: string) => string
  readonly git: Git
  /** Whether the agent is its project's main agent now; may throw. */
  readonly isMain: (agent: { readonly id: string, readonly session?: SessionLike }) => boolean
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** Hand an event to the loop board (src/execute/loop-link.ts). */
  readonly emit: (project: string, sessionId: string | undefined, event: LoopEmit) => void
  /** Write one denial to the violation journal; never rejects into the call. */
  readonly journal: (record: ViolationRecord) => void
  /** Whether the loop board took the row's hand-over (and so should have resumed after peak). */
  readonly boardAttached: () => boolean
  /** The merge checks still running, with their tasks (src/execute/gate-provider.ts). */
  readonly runningChecks: () => readonly { readonly tasks: readonly string[] }[]
  /** The drive's row-health notes changed. */
  readonly notesChanged: () => void
  /** Process one handback the reconcile read back (src/execute/handback.ts `settleHandback`); never rejects. */
  readonly handback: (attempt: Attempt, settlement: Settlement) => Promise<void>
  /** The trunk step of the reconcile (src/execute/advance.ts `reconcileTrunk`): the count of evidence written. */
  readonly reconcileTrunk: (project: string, sessionId: string | undefined) => Promise<number>
  /** The harness actions another process left unfinished, run again (src/execute/loop-link.ts): the count. */
  readonly replayInterrupted: (project: string) => Promise<number>
  readonly now?: () => Date
  /** A timer that runs once and never holds the host open. */
  readonly delay?: (run: () => void, ms: number) => () => void
}

export interface Drive {
  /** The holder's step, before the model reads (§3.9.1). Never throws. */
  onStep(agent: AgentLike, admitted: readonly unknown[]): Promise<void>
  /** A root agent was created or restored: the holder hands over `hourness.host-started`; a former holder's drive goal is cleared (N7). Never throws. */
  onCreated(agent: AgentLike): Promise<void>
  onGoalChanged(payload: GoalChangedPayload): Promise<void>
  /** `execute.start-drive`. */
  startDrive(record: LoopEventRecord): Promise<HarnessResult>
  /** `execute.resume-drive`. */
  resumeDrive(record: LoopEventRecord): Promise<HarnessResult>
  /** `execute.reconcile` (§3.9.6), idempotent per event key. */
  reconcile(record: LoopEventRecord): Promise<HarnessResult>
  readonly completionGate: PreExecuteListener
  readonly batchMark: PostExecuteListener
  readonly awaitHuman: ToolDefinitionLike
  status(session: string): DriveStatus
  notes(): readonly DriveNote[]
  /** Write the exit lines and stop the timers. */
  dispose(): void
}

interface Place {
  readonly project: string
  readonly graphDir: string
  readonly exec: string
}

interface SessionState {
  counters: DriveCounters
  last: { readonly revision: string, readonly activity: number } | undefined
  state: string | undefined
  returns: SentBackItem[]
  lost: LostDispatch[]
  batchTell: string | undefined
  hostStarted: boolean
  cancelPeak: (() => void) | undefined
}

interface Credential {
  readonly agentId: string
  readonly goalId: string
  readonly graphGoal: string
  readonly graphRevision: string
  readonly callId: string
  readonly at: number
  readonly note: string
}

interface StartInput {
  readonly project: string
  readonly key: string
  readonly goal: string
  readonly module: string
  readonly release: string
  readonly session?: string
  readonly move?: boolean
}

const codeOf = (error: unknown): string | undefined => isRecord(error) && typeof error.code === 'string' ? error.code : undefined
const commentsOf = (node: GraphNode): string[] => node.history.flatMap(entry => entry.op === 'comment' && typeof entry.text === 'string' ? [entry.text] : [])
/** Whether a comment names this session as the drive's (`会话 <session>` followed by a separator). */
const namesSession = (text: string, session: string): boolean => {
  const at = text.indexOf(`会话 ${session}`)
  if (at < 0) return false
  const after = text.charAt(at + `会话 ${session}`.length)
  return after === '' || after === ' ' || after === '·'
}
const graphGoalOf = (objective: string | undefined): string | undefined => objective === undefined ? undefined : OBJECTIVE_PREFIX.exec(objective)?.[1]
const refOf = (view: DshGoalView): { readonly id: string, readonly revision: number } => ({ id: view.id, revision: view.revision })
/** Whether the goal is split into modules; an unreadable module structure reads as split (the stricter side, R5-F3). */
function splitOf(graph: LoadedGraph, goal: GraphNode): boolean {
  try {
    return MODULE_READERS.isSplit(graph, goal)
  }
  catch {
    return true
  }
}

/** The table's view of a DSH goal. */
function tierView(view: DshGoalView | undefined): GoalView {
  if (view === undefined) return { phase: 'none', armed: false }
  const phase = view.phase === 'active' || view.phase === 'paused' || view.phase === 'blocked' || view.phase === 'complete' ? view.phase : 'none'
  return { phase, armed: view.activation === 'armed', ...(view.blockedReason === undefined ? {} : { blockedCode: view.blockedReason.code }) }
}

/** What a `hourness-waiting-human` message names: the questions of `await_human` and the requests of D3. */
function waitedOf(message: string): { readonly questions: readonly string[], readonly requests: readonly string[] } {
  const body = message.startsWith('Waiting for the person: ') ? message.slice('Waiting for the person: '.length) : message
  const requests = [...body.matchAll(/request (\S+) \(/g)].map(match => match[1] ?? '')
  if (requests.length > 0) return { questions: [], requests }
  const head = body.split('. ')[0] ?? ''
  return { questions: head.replace(/\.$/, '').split(', ').map(id => id.trim()).filter(id => id !== ''), requests: [] }
}

export function createDrive(deps: DriveDeps): Drive {
  const now = deps.now ?? ((): Date => new Date())
  const delay = deps.delay ?? unrefDelay
  const sessions = new Map<string, SessionState>()
  const returned = new Set<string>()
  const credentials = new Map<string, Credential>()
  const startFailures = new Map<string, number>()
  const seenExec = new Set<string>()
  const startedExec = new Set<string>()
  const noteSet = new Map<string, DriveNote>()
  let peakWarned = false
  let activity = 0
  const stopWatching = onMetricEvent((event) => {
    if (ACTIVITY.has(event.event)) activity += 1
  })

  const setNote = (text: string, on: boolean, degraded = true): void => {
    if (on === noteSet.has(text)) return
    if (on) noteSet.set(text, { text, degraded })
    else noteSet.delete(text)
    deps.notesChanged()
  }
  const stateOf = (session: string): SessionState => {
    let state = sessions.get(session)
    if (state === undefined) {
      state = { counters: { idle: 0, peak: 0 }, last: undefined, state: undefined, returns: [], lost: [], batchTell: undefined, hostStarted: false, cancelPeak: undefined }
      sessions.set(session, state)
    }
    return state
  }
  const get = (name: string): unknown => typeof deps.lookup.get === 'function' ? deps.lookup.get(name) : undefined
  const goalsOf = (): GoalsService | undefined => {
    const value = get('goals')
    if (typeof value !== 'object' || value === null) return undefined
    const members = value as Partial<Record<keyof GoalsService, unknown>>
    const names: readonly (keyof GoalsService)[] = ['get', 'create', 'edit', 'pause', 'resume', 'complete', 'block', 'clear']
    return names.every(member => typeof members[member] === 'function') ? value as GoalsService : undefined
  }
  const liveAgent = (session: string): LiveAgentLike | undefined => {
    const agents = get('agents') as { get?: (id: string) => LiveAgentLike | undefined } | undefined
    try {
      return typeof agents?.get === 'function' ? agents.get(session) : undefined
    }
    catch {
      return undefined
    }
  }
  const isMain = (agent: { readonly id: string, readonly session?: SessionLike }): boolean => {
    try {
      return deps.isMain(agent)
    }
    catch {
      return false
    }
  }
  const viewOf = (goals: GoalsService, live: LiveAgentLike): DshGoalView | undefined => {
    try {
      return goals.get(live)
    }
    catch {
      return undefined
    }
  }
  const placeOf = (session: SessionLike | undefined): Place | undefined => {
    const cwd = session?.header.cwd
    const graphDir = deps.graphDirOf(cwd)
    if (graphDir === undefined) return undefined
    const project = (cwd === undefined ? undefined : projectOf(cwd)?.root) ?? dirname(dirname(graphDir))
    return { project, graphDir, exec: deps.execDir(project) }
  }
  const placeOfRoot = (project: string): Place => ({ project, graphDir: deps.graphDirOfRoot(project), exec: deps.execDir(project) })
  const holderOf = (graphDir: string): string | undefined => mainAgentOf(holderHome(deps.lookup), graphDir)?.sessionId
  const holdOf = (session: string): PeakHold | undefined => {
    let hold: PeakHold | undefined
    try {
      hold = peakModeService(deps.lookup)?.peakHoldFor(session)
    }
    catch {
      hold = undefined
    }
    if (hold !== undefined && Number.isNaN(Date.parse(hold.until))) {
      if (!peakWarned) console.warn(`dsh-glm-hourness/execute: the peak hold's end "${hold.until}" does not parse; the round counts as not held`)
      peakWarned = true
      return undefined
    }
    return hold
  }
  const focusGoal = (session: SessionLike, graph: LoadedGraph): GraphNode | undefined => {
    let focus: string | undefined
    try {
      focus = graphFocus(deps.lookup)?.focusOf(session)
    }
    catch {
      focus = undefined
    }
    return focus === undefined ? undefined : goalOf(graph, focus)
  }
  const drive = (exec: string, line: Omit<DriveLine, 'proc' | 'at'>, session: string | undefined): Promise<void> =>
    appendDrive(exec, { ...line, proc: PROC, at: now().toISOString() }).catch((error: unknown) => {
      deps.report(session, 'degraded', `drive.jsonl 写不进去：${errorText(error)}`)
    })
  const write = async (graphDir: string, run: (engine: ReturnType<typeof openEngine>) => Promise<ApplyResult>): Promise<{ readonly ok: boolean, readonly why?: string }> => {
    try {
      const engine = openEngine(graphDir, { now })
      const result = await writeWithRetry(() => run(engine))
      return result.ok ? { ok: true } : { ok: false, why: result.error.message }
    }
    catch (error) {
      return { ok: false, why: errorText(error) }
    }
  }
  const comment = (graphDir: string, id: string, text: string): Promise<{ readonly ok: boolean, readonly why?: string }> => write(graphDir, engine => engine.apply('harness', { op: 'comment', id, text }))

  /** The start line once per project, `hourness.host-started` once per holder session in this process. */
  async function hello(place: Place, session: string): Promise<void> {
    if (!seenExec.has(place.exec)) {
      seenExec.add(place.exec)
      try {
        await appendDrive(place.exec, { op: 'start', proc: PROC, at: now().toISOString() })
        startedExec.add(place.exec)
      }
      catch (error) {
        deps.report(session, 'degraded', `drive.jsonl 写不进去：${errorText(error)}`)
      }
    }
    const state = stateOf(session)
    if (state.hostStarted) return
    state.hostStarted = true
    deps.emit(place.project, session, { event: 'hourness.host-started', key: `host-started:${session}:${PROC}`, payload: {} })
  }

  /** Tiers two and three (§3.9.7 points 1–3): one comment per return, the metric, the running work for the notice. */
  async function acknowledgeReturns(place: Place, graph: LoadedGraph, goal: GraphNode, state: SessionState): Promise<boolean> {
    const index = childrenIndex(graph)
    const inGoal = new Set(subtreeOf(index, goal).map(node => node.id))
    let wrote = false
    for (const item of returnsOf(graph)) {
      const key = `${item.node}\n${item.at}`
      if (!inGoal.has(item.node) || returned.has(key)) continue
      returned.add(key)
      const node = graph.nodes.get(item.node)
      if (node === undefined) continue
      const under = subtreeOf(index, node)
      const ids = new Set(under.map(entry => entry.id))
      const running = registeredDispatches().filter(attempt => ids.has(attempt.node)).map(attempt => ({ task: attempt.node, childId: attempt.childId }))
      const stale = under.filter(entry => entry.type === 'task' && entry.status === 'doing').length
      const text = `退回设计 · ${item.at} · 受影响的在跑的活：${running.length === 0 ? '没有' : running.map(entry => `${entry.task} (${entry.childId})`).join('、')}`
      const written = await comment(place.graphDir, item.node, text)
      if (written.ok) wrote = true
      else deps.report(undefined, 'degraded', `退回设计的批注写不进图（${item.node}）：${written.why ?? ''}`)
      emitMetric({ event: 'execute.tier', tier: item.tier, node: item.node, running: running.length, stale })
      state.returns = [...state.returns.filter(entry => entry.node !== item.node), { node: item.node, tier: item.tier, at: item.at, running }]
    }
    return wrote
  }

  /** Whether the human wrote in the holder session between two times; a session that cannot be read counts as yes (the person's pause stays). */
  async function humanInput(session: string): Promise<(from: string, to: string) => boolean> {
    const query = get('sessionQuery') as { filterEvents?: (id: string, filters: readonly []) => Promise<readonly SessionEventDocumentLike[]> } | undefined
    if (typeof query?.filterEvents !== 'function') return () => true
    try {
      // The documents carry no source: every user message in the window counts, the strict side.
      const documents = await query.filterEvents(session, [])
      return (from, to) => documents.some(document => document.type === 'user/message' && document.time >= Date.parse(from) && document.time <= Date.parse(to))
    }
    catch {
      return () => true
    }
  }

  /** Whether the question ids and request refs a `hourness-waiting-human` block names are all decided or gone. */
  function waitedDecided(graph: LoadedGraph, session: string, message: string): boolean {
    const waited = waitedOf(message)
    const open = new Set((requestsService(deps.lookup)?.openRequests(session) ?? []).map(request => request.ref))
    const questionsDone = waited.questions.every((id) => {
      const node = graph.nodes.get(id)
      return node === undefined || CLOSED.has(node.status)
    })
    return questionsDone && waited.requests.every(ref => !open.has(ref))
  }

  function resetCounters(state: SessionState): void {
    state.counters = { idle: 0, peak: 0 }
    state.last = undefined
  }

  async function resume(place: Place, session: string, goal: GraphNode, live: LiveAgentLike, goals: GoalsService, reason: Extract<DriveDecision, { action: 'resume' }>['reason'], state: SessionState): Promise<void> {
    const view = viewOf(goals, live)
    if (view === undefined) return
    try {
      goals.resume(live, refOf(view))
    }
    catch (error) {
      const why = errorText(error)
      state.state = `The harness could not resume the drive: ${why}.${/exhausted|maxGoalRounds/.test(why) ? ` ${ROUND_LIMIT_ADVICE}` : ''}`
      deps.report(session, 'degraded', `自动推进没恢复上：${why}`)
      return
    }
    resetCounters(state)
    await drive(place.exec, { op: 'resume', goal: view.id, reason }, session)
    emitMetric({ event: 'execute.goal', goal: goal.id, op: 'resume', reason })
    if (reason === 'restart-pause') {
      const pause = (await readDrive(place.exec)).filter(line => line.op === 'pause' && line.goal === view.id).at(-1)
      const exit = pause === undefined ? undefined : (await readDrive(place.exec)).find(line => line.op === 'exit' && line.proc === pause.proc && line.at >= pause.at)
      const seconds = pause === undefined || exit === undefined ? 0 : Math.round((Date.parse(exit.at) - Date.parse(pause.at)) / 1000)
      const written = await comment(place.graphDir, goal.id, `重启前的暂停（暂停后 ${seconds} 秒宿主退出），已恢复`)
      if (!written.ok) deps.report(session, 'degraded', `重启前暂停的批注写不进图（${goal.id}）：${written.why ?? ''}`)
      state.state = RESTART_RESUMED
    }
    else if (reason === 'design-released') state.state = RELEASED_AGAIN
    else if (reason === 'waiting-decided') state.state = WAITING_DONE
  }

  async function block(place: Place, session: string, goal: GraphNode, live: LiveAgentLike, goals: GoalsService, code: string, message: string): Promise<boolean> {
    const view = viewOf(goals, live)
    if (view?.phase !== 'active') return false
    try {
      goals.block(live, refOf(view), { code, message })
    }
    catch (error) {
      deps.report(session, 'degraded', `自动推进没停住（${code}）：${errorText(error)}`)
      return false
    }
    emitMetric({ event: 'execute.goal', goal: goal.id, op: 'block', code })
    if (code === 'hourness-design-wait') await drive(place.exec, { op: 'design-wait', goal: view.id }, session)
    return true
  }

  /** The peak block (§3.9.5): the block, the line, and the timer that resumes five minutes after the end when nobody else did. */
  async function peakBlock(place: Place, session: string, goal: GraphNode, live: LiveAgentLike, goals: GoalsService, hold: PeakHold, state: SessionState): Promise<void> {
    const view = viewOf(goals, live)
    if (!await block(place, session, goal, live, goals, 'hourness-peak-wait', peakWaitLine(hold))) return
    await drive(place.exec, { op: 'peak-wait', ...(view === undefined ? {} : { goal: view.id }), until: hold.until, level: hold.level }, session)
    state.state = `${peakWaitLine(hold)} ${CONTINUE_NOW}`
    state.cancelPeak?.()
    const wait = Math.max(0, Date.parse(hold.until) + PEAK_GRACE_MS - now().getTime())
    state.cancelPeak = delay(() => {
      state.cancelPeak = undefined
      void peakTimer(place, session, hold).catch((error: unknown) => {
        deps.report(session, 'degraded', `高峰结束后的接续出错：${errorText(error)}`)
      })
    }, wait)
  }

  async function peakTimer(place: Place, session: string, hold: PeakHold): Promise<void> {
    const result = await resumeAfterPeak(place, session)
    if (result.outcome !== 'done') return
    const key = `peak-end:${session}:${hold.until}`
    emitMetric({ event: 'execute.loop-fallback', entry: 'loops.peak-end', key, reason: 'peak-end-missed' })
    const why = toHolder(deps.lookup, place.graphDir, createUserNotice('glm-hourness-loop', '高峰结束之后：接上推进', `GLM peak hours ended at ${clockOf(hold.until)}. Work you moved to after peak can start now.`, { hournessLoop: { entry: 'loops.peak-end', key } }))
    if (why !== undefined) deps.report(session, 'degraded', `高峰结束的提醒没送到主 Agent：${why}`)
    if (deps.boardAttached()) setNote(PEAK_TAKEOVER, true)
  }

  /** `execute.resume-drive` (§3.9.5 "接上"): only the holder's goal blocked for the peak, and only once the peak is over. */
  async function resumeAfterPeak(place: Place, session: string | undefined): Promise<HarnessResult> {
    const live = session === undefined ? undefined : liveAgent(session)
    if (session === undefined || live === undefined) return { outcome: 'skipped', reason: 'main agent is not open in this DSH process' }
    const goals = goalsOf()
    if (goals === undefined) return { outcome: 'skipped', reason: 'no goals service' }
    const view = viewOf(goals, live)
    const code = view?.blockedReason?.code
    if (view?.phase !== 'blocked' || code !== 'hourness-peak-wait') return { outcome: 'skipped', reason: `the goal is not blocked hourness-peak-wait (${code ?? view?.phase ?? 'no goal'})` }
    const hold = holdOf(session)
    if (hold !== undefined) return { outcome: 'skipped', reason: `peak hours still on until ${hold.until}` }
    try {
      goals.resume(live, refOf(view))
    }
    catch (error) {
      return { outcome: 'failed', reason: `the goal cannot be resumed: ${errorText(error)}` }
    }
    const state = stateOf(session)
    resetCounters(state)
    state.cancelPeak?.()
    state.cancelPeak = undefined
    await drive(place.exec, { op: 'resume', goal: view.id, reason: 'peak-end' }, session)
    emitMetric({ event: 'execute.goal', goal: graphGoalOf(view.objective) ?? view.id, op: 'resume', reason: 'peak-end' })
    return { outcome: 'done' }
  }

  /** The approved or doing tasks of a module whose latest dispatch went stale (§3.9.7 "人重新放行之后"). */
  function staleTasks(graph: LoadedGraph, module: GraphNode): readonly GraphNode[] {
    return subtreeOf(childrenIndex(graph), module).filter((node) => {
      if (node.type !== 'task' || (node.status !== 'approved' && node.status !== 'doing')) return false
      const dispatched = latestDispatch(node)
      return dispatched !== undefined && staleness(graph, dispatched.pins, sha256Hex).length > 0
    })
  }

  /** `execute.start-drive` (§3.9.1 table row 2), and the move to a new holder (row 3, D14). */
  async function start(input: StartInput): Promise<HarnessResult> {
    const place = placeOfRoot(input.project)
    const graph = await deps.cache.load(place.graphDir)
    const goal = graph.nodes.get(input.goal)
    if (goal?.type !== 'goal') return { outcome: 'skipped', reason: `no goal ${input.goal} in the project graph` }
    const holder = holderOf(place.graphDir) ?? input.session
    const mark = `${RELEASE_MARK}${input.release}`
    const texts = commentsOf(goal)
    if (texts.some(text => text.includes(mark) && (input.move !== true || (holder !== undefined && namesSession(text, holder))))) return { outcome: 'skipped', reason: 'already done' }
    const live = holder === undefined ? undefined : liveAgent(holder)
    if (holder === undefined || live === undefined) return { outcome: 'skipped', reason: 'main agent is not open in this DSH process' }
    const goals = goalsOf()
    if (goals === undefined) return { outcome: 'failed', reason: 'no goals service: the drive cannot start' }
    const split = splitOf(graph, goal)
    let view = viewOf(goals, live)
    const started = texts.some(text => text.includes(DRIVE_START_MARK))
    const module = input.module === '' ? undefined : graph.nodes.get(input.module)
    const create = !split || !started || view === undefined || view.phase === 'complete' || input.move === true
    let text: string
    if (create) {
      const trunk = await trunkBranchOf(deps.git, input.project, graph)
      try {
        view = goals.create(live, { objective: objectiveOf(goal, trunk, split), maxGoalRounds: 500 })
      }
      catch (error) {
        if (codeOf(error) !== 'GOAL_ALREADY_EXISTS') {
          const tries = (startFailures.get(input.key) ?? 0) + 1
          startFailures.set(input.key, tries)
          deps.report(holder, 'degraded', `自动推进没开始（第 ${tries} 次）：${errorText(error)}`)
          return { outcome: 'failed', reason: `the goal cannot be created: ${errorText(error)}` }
        }
        view = viewOf(goals, live)
      }
      startFailures.delete(input.key)
      text = input.move === true
        ? `${MOVED_MARK}${holder} · ${mark}`
        : `${DRIVE_START_MARK} · ${mark} · ${module === undefined ? '' : `模块 ${module.id} · `}goal ${view?.id ?? '?'} · 会话 ${holder}${trunk === undefined ? '' : ` · 主干 ${trunk}`}`
      emitMetric({ event: 'execute.goal', goal: goal.id, ...(module === undefined ? {} : { module: module.id }), op: input.move === true ? 'move' : 'start' })
    }
    else {
      text = `模块 ${input.module} 已放行 · ${mark}`
      emitMetric({ event: 'execute.goal', goal: goal.id, module: input.module, op: 'module-released' })
    }
    const written = await comment(place.graphDir, goal.id, text)
    if (!written.ok) {
      deps.report(holder, 'degraded', `自动推进的批注写不进图（${goal.id}）：${written.why ?? ''}`)
      return { outcome: 'failed', reason: `the drive comment cannot be written: ${written.why ?? ''}` }
    }
    if (!split || module === undefined) return { outcome: 'done' }
    const first = create && input.move !== true
    let tell = `Module ${module.id} "${module.title}" of goal ${goal.id} is released${first ? ' and the drive has started' : ''}. Decompose it into tasks with dispatch attributes under the module and dispatch them with dispatch_task; do not wait for the person. Modules still in design cannot be dispatched (not_released).`
    const stale = sentBack(module) ? staleTasks(graph, module) : []
    if (stale.length > 0) tell += ` These tasks of the module were dispatched before it went back to design and their dispatch is stale: ${stale.map(task => `${task.id} ${task.title}`).join(', ')}. Dispatch them again with the new design.`
    return { outcome: 'done', tell }
  }

  /** The former holder's drive goal, cleared when it is live here (N7). */
  function clearFormer(goals: GoalsService, goal: GraphNode, session: string): void {
    const former = commentsOf(goal).filter(text => text.startsWith(DRIVE_START_MARK) || text.startsWith(MOVED_MARK)).map(text => /会话 (\S+)/.exec(text)?.[1]).filter(id => id !== undefined && id !== session).at(-1)
    const live = former === undefined ? undefined : liveAgent(former)
    if (live === undefined) return
    const view = viewOf(goals, live)
    if (view === undefined || graphGoalOf(view.objective) !== goal.id) return
    try {
      goals.clear(live, refOf(view))
    }
    catch (error) {
      deps.report(former, 'degraded', `旧会话的自动推进没清掉：${errorText(error)}`)
    }
  }

  async function act(place: Place, session: string, goal: GraphNode, live: LiveAgentLike, goals: GoalsService, view: DshGoalView | undefined, decision: DriveDecision, hold: PeakHold | undefined, state: SessionState): Promise<void> {
    switch (decision.action) {
      case 'release': {
        const key = `design-released:${decision.module === '' ? goal.id : decision.module}:${decision.release}`
        const tries = startFailures.get(key)
        // A start that failed is tried again from the step, at most three times in all (§6.2): the event's key was handed over already.
        if (tries !== undefined) {
          if (tries < START_TRIES) await start({ project: place.project, key, goal: goal.id, module: decision.module, release: decision.release, session })
          return
        }
        deps.emit(place.project, session, { event: 'hourness.design-released', key, payload: { goal: goal.id, module: decision.module, release: decision.release } })
        return
      }
      case 'move': {
        const result = await start({ project: place.project, key: `design-released:${goal.id}:${decision.release}`, goal: goal.id, module: '', release: decision.release, session, move: true })
        if (result.outcome === 'done') clearFormer(goals, goal, session)
        return
      }
      case 'resume':
        if (decision.reason === 'peak-over') {
          const result = await resumeAfterPeak(place, session)
          if (result.outcome !== 'done' && result.reason !== undefined) state.state = `The harness could not resume the drive after peak: ${result.reason}.`
          return
        }
        await resume(place, session, goal, live, goals, decision.reason, state)
        return
      case 'design-wait':
        if (await block(place, session, goal, live, goals, 'hourness-design-wait', designWaitLine(goal.id))) state.state = `${designWaitLine(goal.id)} ${CONTINUE_NOW}`
        return
      case 'hold':
        state.state = decision.why === 'cleared' ? await clearedObjective(place, goal) : holdLine(decision.why, goal, view, hold)
        return
      case 'none':
        return
    }
  }

  /** The cleared line with the objective `start` builds (§3.9.1 row 人清掉了): the trunk and, for a split goal, the module sentence. */
  async function clearedObjective(place: Place, goal: GraphNode): Promise<string> {
    const graph = await deps.cache.load(place.graphDir)
    const trunk = await trunkBranchOf(deps.git, place.project, graph)
    return clearedLine(objectiveOf(goal, trunk, splitOf(graph, goal)))
  }

  function holdLine(why: Exclude<Extract<DriveDecision, { action: 'hold' }>['why'], 'cleared'>, goal: GraphNode, view: DshGoalView | undefined, hold: PeakHold | undefined): string {
    const reason = view?.blockedReason
    switch (why) {
      case 'human-paused': return PERSON_PAUSED
      case 'peak-waiting': return hold === undefined ? `${reason?.message ?? 'Waiting for GLM peak hours to end.'} ${CONTINUE_NOW}` : `${peakWaitLine(hold)} ${CONTINUE_NOW}`
      case 'waiting-human': return reason?.message ?? 'Waiting for the person.'
      case 'in-design': return `${designWaitLine(goal.id)} ${CONTINUE_NOW}`
      case 'blocked': return `The drive is blocked (${reason?.code ?? 'unknown'}: ${reason?.message ?? ''}); when the person says to go on, call update_goal resume.${reason?.code === 'round-limit' ? ` ${ROUND_LIMIT_ADVICE}` : ''}`
    }
  }

  /** `hourness.tasks-closed` (§3.9.4): every task of the goal closed, at least one, no module left in design. */
  function tasksClosed(place: Place, session: string, graph: LoadedGraph, goal: GraphNode): void {
    let tasks: GraphNode[]
    try {
      if (MODULE_READERS.isSplit(graph, goal)) {
        const modules = [...MODULE_READERS.modulesOf(graph, goal), ...MODULE_READERS.moduleCandidatesOf(graph, goal)]
        if (modules.some(module => !GONE.has(module.status) && !isPostRelease(effectiveStage(module)))) return
      }
      tasks = scopedTasks(graph, goal)
    }
    catch {
      return
    }
    if (tasks.length === 0 || !tasks.every(task => CLOSED.has(task.status))) return
    const closedAt = tasks.flatMap(task => task.history.filter(entry => entry.op === 'status' && entry.to !== undefined && CLOSED.has(entry.to)).map(entry => entry.at)).sort().at(-1)
    if (closedAt === undefined) return
    deps.emit(place.project, session, { event: 'hourness.tasks-closed', key: `tasks-closed:${goal.id}:${closedAt}`, payload: { goal: goal.id } })
  }

  /** The counters at a goal round's first step (§3.9.5, D7). */
  async function countRound(place: Place, session: string, graph: LoadedGraph, goal: GraphNode, live: LiveAgentLike, goals: GoalsService, hold: PeakHold | undefined, state: SessionState): Promise<void> {
    const snapshot = { revision: graph.revision, activity }
    const progressed = state.last === undefined || state.last.revision !== snapshot.revision || state.last.activity !== snapshot.activity
    state.last = snapshot
    const counted = nextCounters(state.counters, progressed, hold !== undefined)
    state.counters = { idle: counted.idle, peak: counted.peak }
    if (counted.block === 'hourness-idle-rounds') {
      if (await block(place, session, goal, live, goals, 'hourness-idle-rounds', IDLE_MESSAGE)) {
        state.state = IDLE_MESSAGE
        resetCounters(state)
      }
    }
    else if (counted.block === 'hourness-peak-wait' && hold !== undefined) {
      await peakBlock(place, session, goal, live, goals, hold, state)
      resetCounters(state)
    }
  }

  async function step(agent: AgentLike, admitted: readonly unknown[]): Promise<void> {
    const session = agent.session
    if (session === undefined || !isMain(agent)) return
    const place = placeOf(session)
    if (place === undefined) return
    await hello(place, session.id)
    const goals = goalsOf()
    setNote(GOALS_ABSENT, goals === undefined)
    if (goals === undefined) return
    const live = liveAgent(session.id) ?? agent as unknown as LiveAgentLike
    const state = stateOf(session.id)
    let graph = await deps.cache.load(place.graphDir)
    const focus = focusGoal(session, graph)
    if (focus === undefined || (focus.status !== 'approved' && focus.status !== 'doing')) return
    if (await acknowledgeReturns(place, graph, focus, state)) graph = await deps.cache.load(place.graphDir)
    const goal = graph.nodes.get(focus.id) ?? focus
    // A node back in release drops off the list of what is sent back; a lost dispatch drops off once its task was dispatched again or closed.
    state.returns = state.returns.filter((entry) => {
      const node = graph.nodes.get(entry.node)
      return node !== undefined && !isPostRelease(effectiveStage(node))
    })
    state.lost = state.lost.filter((entry) => {
      const node = graph.nodes.get(entry.task)
      return node?.status === 'doing' && latestDispatch(node)?.childId === entry.childId
    })
    const view = viewOf(goals, live)
    const table = tierView(view)
    const hold = holdOf(session.id)
    let pause = false
    let peakOver = false
    let waitingDecided = false
    if (table.phase === 'paused' && view !== undefined) {
      const lines = (await readDrive(place.exec)).filter(line => line.op === 'exit' || (line.op === 'pause' && line.goal === view.id))
      if (restartPause(lines, PROC, () => false) !== undefined) pause = restartPause(lines, PROC, await humanInput(session.id)) !== undefined
    }
    if (table.blockedCode === 'hourness-peak-wait' && view !== undefined) {
      const line = (await readDrive(place.exec)).filter(entry => entry.op === 'peak-wait' && entry.goal === view.id).at(-1)
      const ended = line?.until === undefined || Number.isNaN(Date.parse(line.until)) || now().getTime() > Date.parse(line.until)
      peakOver = ended && hold === undefined
    }
    if (table.blockedCode === 'hourness-waiting-human') waitingDecided = waitedDecided(graph, session.id, view?.blockedReason?.message ?? '')
    const decision = driveDecision({ graph, goal, view: table, session: session.id, restartPause: pause, peakHold: hold, peakOver, waitingDecided })
    state.state = undefined
    await act(place, session.id, goal, live, goals, view, decision, hold, state)
    if (decision.action === 'none' && table.phase === 'active') {
      // D3: open guard requests wait for the person like await_human does.
      const open = requestsService(deps.lookup)?.openRequests(session.id) ?? []
      if (open.length > 0) {
        const message = `Waiting for the person: ${open.map(request => `request ${request.ref} (${request.target})`).join(', ')}.`
        if (await block(place, session.id, goal, live, goals, 'hourness-waiting-human', message)) state.state = message
      }
      else if (admitted.some(isGoalRound)) await countRound(place, session.id, graph, goal, live, goals, hold, state)
    }
    tasksClosed(place, session.id, graph, goal)
  }

  // ---- the completion gate (§3.9.3) ----

  /** `goalCompletion` with the git facts read here (§3.9.3), and the acceptance round it judged by. */
  async function completionOf(place: Place, graph: LoadedGraph, goal: GraphNode): Promise<{ readonly verdict: ReturnType<typeof goalCompletion>, readonly latest: AcceptanceRound | undefined }> {
    const trunk = await trunkBranchOf(deps.git, place.project, graph)
    const tip = trunk === undefined ? undefined : await deps.git.resolveCommit(place.project, `refs/heads/${trunk}`)
    const tasks = subtreeOf(childrenIndex(graph), goal).filter(node => node.type === 'task')
    const onTrunk = new Map<string, boolean>()
    for (const task of tasks) {
      for (const evidence of task.evidence ?? []) {
        if (evidence.kind !== 'commit' || onTrunk.has(evidence.ref)) continue
        let on = false
        if (trunk !== undefined && tip !== undefined) {
          const ancestor = await deps.git.isAncestor(place.project, evidence.ref, tip)
          on = ancestor.ok && ancestor.value
          if (!on) {
            const merged = await deps.git.lastTaskCommit(place.project, `refs/heads/${trunk}`, task.id)
            on = merged.ok && merged.value !== undefined
          }
        }
        onTrunk.set(evidence.ref, on)
      }
    }
    const latest = acceptanceRounds(goal).at(-1)
    const inReviewed = new Map<string, boolean>()
    if (latest !== undefined) {
      for (const ref of onTrunk.keys()) {
        const ancestor = await deps.git.isAncestor(place.project, ref, latest.commit)
        inReviewed.set(ref, ancestor.ok && ancestor.value)
      }
    }
    const facts: CompletionFacts = {
      onTrunk: commit => onTrunk.get(commit) ?? false,
      isAncestor: (older, newer) => older === newer || (newer === latest?.commit && (inReviewed.get(older) ?? false)),
      running: new Set(registeredDispatches().map(attempt => attempt.childId)),
      runningChecks: deps.runningChecks().flatMap(job => job.tasks),
      pinsFresh: (line) => {
        const changes = staleness(graph, line, sha256Hex)
        return changes.length === 0 ? undefined : changes.map(change => `${change.id} ${change.change}`).join(', ')
      },
    }
    return { verdict: goalCompletion(graph, goal, facts), latest }
  }

  async function judgeCompletion(agent: AgentLike, callId: string): Promise<{ readonly kind: 'deny', readonly reason: string } | undefined> {
    const session = agent.session
    const place = placeOf(session)
    const goals = goalsOf()
    if (session === undefined || place === undefined || goals === undefined) return undefined
    const live = liveAgent(session.id) ?? agent as unknown as LiveAgentLike
    const view = viewOf(goals, live)
    const graph = await deps.cache.load(place.graphDir)
    const named = graphGoalOf(view?.objective)
    const goal = named === undefined ? focusGoal(session, graph) : graph.nodes.get(named)
    if (goal?.type !== 'goal') return undefined
    const { verdict, latest } = await completionOf(place, graph, goal)
    emitMetric({ event: 'execute.completion-gate', goal: goal.id, passed: verdict.ok, gaps: verdict.gaps.length })
    if (!verdict.ok) {
      const shown = verdict.gaps.slice(0, 10)
      const reason = [`The completion gate keeps goal ${goal.id} open. What is missing:`, ...shown.map(gap => `- ${gap}`), ...(verdict.gaps.length > shown.length ? [`- and ${verdict.gaps.length - shown.length} more`] : [])].join('\n')
      deps.journal({ at: now().toISOString(), rule: 'completion-gate', tool: 'update_goal', agentId: agent.id, sessionId: session.id, correction: reason })
      // A refusal reconciles once more, without the event key (§3.9.6): a dispatch lost or a handback missed may be what the gap is.
      reconcileAfterRefusal(place, session.id, callId)
      return { kind: 'deny', reason }
    }
    const advances = new Set(scopedTasks(graph, goal).flatMap(task => (task.evidence ?? []).filter(entry => entry.kind === 'commit').map(entry => entry.ref)))
    credentials.set(agent.id, {
      agentId: agent.id,
      goalId: view?.id ?? '',
      graphGoal: goal.id,
      graphRevision: graph.revision,
      callId,
      at: now().getTime(),
      note: `${scopedTasks(graph, goal).length} tasks, ${advances.size} advances, acceptance review ${latest?.childId ?? 'none'}, call ${callId}`,
    })
    return undefined
  }

  const completionGate: PreExecuteListener = async (exec, next) => {
    if (exec.name !== 'update_goal' || exec.parent !== undefined || !isRecord(exec.arguments) || exec.arguments.action !== 'complete') return next()
    const agent = exec.agent
    // Without the goals service the gate is not installed (§6.1); a caller that is not the main agent is not bound by it.
    if (agent === undefined || goalsOf() === undefined || !isMain(agent)) return next()
    let denial: { readonly kind: 'deny', readonly reason: string } | undefined
    try {
      denial = await judgeCompletion(agent, exec.callId ?? '')
    }
    catch (error) {
      denial = { kind: 'deny', reason: `The completion gate could not check the goal: ${errorText(error)}. Call update_goal complete again.` }
    }
    return denial ?? next()
  }

  // ---- the reconcile after a restart (§3.9.6) ----

  const disposeKey = (Symbol as unknown as { readonly dispose?: symbol }).dispose

  /** The handback the projection folded in a dispatch's session (§3.9.6 step 3, U6); undefined when the session or the projection is not there. */
  async function projectedHandback(childId: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    const query = get('sessionQuery') as Partial<SessionQueryService> | undefined
    const observe = query?.observeSession
    if (typeof observe !== 'function') return undefined
    let observation: SessionObservationLike
    try {
      observation = await observe.call(query, childId)
    }
    catch {
      // rc.3 rejects for a session it cannot find (SESSION_QUERY_SESSION_NOT_FOUND): nothing to read back.
      return undefined
    }
    try {
      const value = observation.projections?.values?.[HANDBACK_PROJECTION]
      return isRecord(value) ? value : undefined
    }
    finally {
      // The observation is a lease (session-query:450–507); it is released after the read, as listChildren does.
      const release = disposeKey === undefined ? undefined : (observation as unknown as Readonly<Record<symbol, unknown>>)[disposeKey]
      if (typeof release === 'function') (release as () => void).call(observation)
    }
  }

  /** The register entry of a lost dispatch rebuilt from its comment (§3.9.6 step 3): what the handback processing reads of it. */
  function rebuiltAttempt(place: Place, graph: LoadedGraph, node: GraphNode, dispatched: DispatchRecord, session: string | undefined): Attempt {
    const common = {
      childId: dispatched.childId,
      node: node.id,
      attempt: dispatched.attempt,
      graphDir: place.graphDir,
      provider: dispatched.provider ?? 'unknown',
      model: dispatched.model ?? 'unknown',
      ...(dispatched.reasoningEffort === undefined ? {} : { reasoningEffort: dispatched.reasoningEffort }),
      why: dispatched.why ?? '',
      plan: 'none' as const,
      pins: dispatched.pins,
      ...(session === undefined ? {} : { parentSession: session }),
    }
    const base = dispatched.base === undefined ? {} : { baseSha: dispatched.base.sha }
    if (node.type === 'goal') return { ...common, role: 'acceptance-review', worktree: place.project, ...base }
    if (node.kind === 'review') {
      if (node.parent === undefined || isDesignReview(graph, node)) return { ...common, role: 'review' }
      return { ...common, role: 'review', worktree: join(place.project, '.worktrees', `hz-${node.parent}`), depth: dispatched.review === 'light' ? 'light' : 'full' }
    }
    return { ...common, role: 'worker', worktree: join(place.project, '.worktrees', `hz-${node.id}`), branch: `hz/${node.id}`, ...base, ...(dispatched.review === undefined ? {} : { review: dispatched.review }) }
  }

  /** The open goals of a graph: what the reconcile looks under. */
  const openGoals = (graph: LoadedGraph): GraphNode[] => [...graph.nodes.values()].filter(node => node.type === 'goal' && (node.status === 'approved' || node.status === 'doing'))

  /** The in-progress tasks of the open goals, and a goal in progress itself (its acceptance review), with a dispatch comment (§3.9.6 step 1). */
  function dispatchedWork(graph: LoadedGraph): GraphNode[] {
    const index = childrenIndex(graph)
    const seen = new Set<string>()
    return openGoals(graph).flatMap(goal => subtreeOf(index, goal)).filter((node) => {
      if (seen.has(node.id) || node.status !== 'doing' || (node.type !== 'task' && node.type !== 'goal')) return false
      seen.add(node.id)
      return latestDispatch(node) !== undefined
    })
  }

  function listLost(session: string | undefined, item: LostDispatch): void {
    if (session === undefined) return
    const state = stateOf(session)
    state.lost = [...state.lost.filter(entry => entry.childId !== item.childId), item]
  }

  const named = (items: readonly LostDispatch[]): string => items.map(item => `${item.task} attempt ${item.attempt} (${item.childId})`).join(', ')

  /**
   * `execute.reconcile` (§3.9.6): idempotent per event key through
   * reconcile.jsonl unless `dedupe` is off (the completion gate's refusal).
   * Steps 1–4: a dispatch of an in-progress task that is neither in the
   * register nor live and has no handback is replayed from the session
   * projection, or commented lost and listed in the drive status; step 5:
   * the trunk evidence (the trunk gate's `reconcileTrunk`); step 7: the
   * harness actions another process left unfinished; step 8: a completed DSH
   * goal whose graph goal is not done is judged by the gate again; step 9:
   * the returns to design, a framework sent back while the goal is active,
   * a module release no comment acknowledges. It only comments and tells:
   * the main agent decides every dispatch.
   */
  async function runReconcile(project: string, recordSession: string | undefined, key: string, dedupe: boolean): Promise<HarnessResult> {
    const place = placeOfRoot(project)
    if (dedupe && (await reconciledKeys(place.exec)).has(key)) return { outcome: 'skipped', reason: 'already reconciled' }
    const session = holderOf(place.graphDir) ?? recordSession
    let graph = await deps.cache.load(place.graphDir)
    const lost: LostDispatch[] = []
    const replayed: LostDispatch[] = []
    for (const node of dispatchedWork(graph)) {
      const dispatched = latestDispatch(node)
      if (dispatched === undefined || registeredAttempt(dispatched.childId) !== undefined || liveAgent(dispatched.childId) !== undefined) continue
      const attempt = rebuiltAttempt(place, graph, node, dispatched, session)
      if (alreadyProcessed(graph, attempt)) continue
      const item: LostDispatch = { task: node.id, attempt: dispatched.attempt, childId: dispatched.childId }
      if (commentsOf(node).some(text => lostChildOf(text) === dispatched.childId)) {
        listLost(session, item)
        continue
      }
      const structured = await projectedHandback(dispatched.childId)
      if (structured !== undefined) {
        await deps.handback(attempt, { structured, stopReason: 'completed' })
        replayed.push(item)
        continue
      }
      const written = await comment(place.graphDir, node.id, renderLostComment(dispatched.attempt, dispatched.childId))
      if (!written.ok) deps.report(session, 'degraded', `丢失的派发批注写不进图（${node.id}，${dispatched.childId}）：${written.why ?? ''}`)
      lost.push(item)
      listLost(session, item)
    }
    let evidence = 0
    try {
      evidence += await deps.reconcileTrunk(project, session)
    }
    catch (error) {
      deps.report(session, 'degraded', `对账时主干的证据没补完：${errorText(error)}`)
    }
    let actions = 0
    try {
      actions = await deps.replayInterrupted(project)
    }
    catch (error) {
      deps.report(session, 'degraded', `对账时没跑完的动作没重做完：${errorText(error)}`)
    }
    graph = await deps.cache.load(place.graphDir)
    const goals = goalsOf()
    const live = session === undefined ? undefined : liveAgent(session)
    const view = goals === undefined || live === undefined ? undefined : viewOf(goals, live)
    const state = session === undefined ? undefined : stateOf(session)
    for (const goal of openGoals(graph)) {
      try {
        const drives = graphGoalOf(view?.objective) === goal.id
        if (drives && view?.phase === 'complete') {
          const { verdict } = await completionOf(place, graph, goal)
          if (verdict.ok) {
            const done = await write(place.graphDir, async (engine) => {
              const current = await engine.load()
              return engine.apply('harness', { op: 'status', id: goal.id, rev: current.revisions.get(goal.id) ?? '', to: 'done', evidence: [{ kind: 'check', ref: 'hourness completion gate (reconcile)', exit: 0 }], reason: 'the completion gate passed on the reconcile after a restart' })
            })
            if (done.ok) {
              evidence += 1
              emitMetric({ event: 'execute.goal', goal: goal.id, op: 'complete' })
            }
            else deps.report(session, 'degraded', `对账时目标的完成写不进图（${goal.id}）：${done.why ?? ''}`)
          }
          else if (state !== undefined) state.state = `Goal ${goal.id} is not done although its drive goal completed. Missing: ${verdict.gaps.slice(0, 10).join('; ')}; when the gaps are closed and the person asks to go on, call create_goal again.`
          continue
        }
        if (state !== undefined) await acknowledgeReturns(place, graph, goal, state)
        const stage = effectiveStage(goal)
        if (drives && view?.phase === 'active' && session !== undefined && live !== undefined && goals !== undefined && stage !== null && !isPostRelease(stage)) {
          if (await block(place, session, goal, live, goals, 'hourness-design-wait', designWaitLine(goal.id)) && state !== undefined) state.state = `${designWaitLine(goal.id)} ${CONTINUE_NOW}`
        }
        const release = pendingRelease(graph, goal)
        if (release !== undefined && release.module !== '') {
          deps.emit(project, session, { event: 'hourness.design-released', key: `design-released:${release.module}:${release.release}`, payload: { goal: goal.id, module: release.module, release: release.release } })
        }
      }
      catch (error) {
        deps.report(session, 'degraded', `对账时目标 ${goal.id} 没对完：${errorText(error)}`)
      }
    }
    const count = { lost: lost.length, replayed: replayed.length + actions, evidence }
    await appendReconcile(place.exec, { key, at: now().toISOString(), ...count }).catch((error: unknown) => {
      deps.report(session, 'degraded', `reconcile.jsonl 写不进去：${errorText(error)}`)
    })
    emitMetric({ event: 'execute.reconcile', ...count })
    const tell = [
      ...(lost.length === 0 ? [] : [`Lost when the app restarted, with nothing handed back: ${named(lost)}. Their tasks stay in progress; dispatch each again when you decide to, and its brief lists the commits its branch already has.`]),
      ...(replayed.length === 0 ? [] : [`Handed back from the session log after the restart: ${named(replayed)}; their handback notices came on their own.`]),
    ]
    return tell.length === 0 ? { outcome: 'done' } : { outcome: 'done', tell: tell.join(' ') }
  }

  /** The completion gate's refusal reconciles once, without the event key (§3.9.6). */
  function reconcileAfterRefusal(place: Place, session: string, callId: string): void {
    void runReconcile(place.project, session, `completion-gate:${session}:${callId}`, false).catch((error: unknown) => {
      deps.report(session, 'degraded', `完成门禁拒绝之后的对账没跑完：${errorText(error)}`)
    })
  }

  // ---- goal/changed (§3.9.1, §3.9.3, §3.9.5) ----

  async function goalChanged(payload: GoalChangedPayload): Promise<void> {
    const agent = payload.agent
    // A subagent's goal is never a drive goal; a root agent that left main-agent mode (`/wish off`) still completes or blocks the drive goal it holds (§3.9.3).
    if (agent.session.header.origin === 'subagent') return
    const place = placeOf(agent.session)
    if (place === undefined) return
    const { operation, ref, goal: view } = payload.change
    if (operation === 'pause') {
      // The pause line is the holder's: only the main agent's pause counts for the restart judgement.
      if (isMain(agent)) await drive(place.exec, { op: 'pause', goal: ref.id }, agent.id)
      return
    }
    if (operation !== 'complete' && operation !== 'block') return
    const held = credentials.get(agent.id)
    const credential = held !== undefined && held.goalId === ref.id && now().getTime() - held.at <= CREDENTIAL_MS ? held : undefined
    const graphGoal = credential?.graphGoal ?? graphGoalOf(view?.objective)
    if (graphGoal === undefined) return
    if (operation === 'complete') {
      if (credential !== undefined) {
        credentials.delete(agent.id)
        const done = await write(place.graphDir, async (engine) => {
          const current = await engine.load()
          return engine.apply('harness', { op: 'status', id: graphGoal, rev: current.revisions.get(graphGoal) ?? '', to: 'done', evidence: [{ kind: 'check', ref: 'hourness completion gate', exit: 0, note: credential.note }], reason: `the completion gate passed (call ${credential.callId})` })
        })
        if (done.ok) emitMetric({ event: 'execute.goal', goal: graphGoal, op: 'complete' })
        else deps.report(agent.id, 'degraded', `目标的完成写不进图（${graphGoal}）：${done.why ?? ''}`)
        return
      }
      const written = await comment(place.graphDir, graphGoal, OUTSIDE_GATE)
      if (!written.ok) deps.report(agent.id, 'degraded', `完成门禁之外的完成没批注上（${graphGoal}）：${written.why ?? ''}`)
      return
    }
    const reason = view?.blockedReason
    if (reason === undefined || ROW_CODES.has(reason.code)) return
    const text = reason.code === 'round-limit' ? `goal 到了轮次上限（round-limit）：${reason.message}` : `goal 被阻塞（${reason.code}）：${reason.message}`
    const written = await comment(place.graphDir, graphGoal, text)
    if (!written.ok) deps.report(agent.id, 'degraded', `goal 阻塞的批注写不进图（${graphGoal}）：${written.why ?? ''}`)
  }

  // ---- await_human and the batch mark (§3.9.5, §3.9.7, D8) ----

  const AWAIT_PARAMETERS = {
    type: 'object',
    properties: {
      questions: { type: 'array', items: { type: 'string' }, description: 'The ids of the open questions the person decides (1 to 20), each in the goal in focus, approved or doing.' },
      summary: { type: 'string', description: 'One line (at most 500 characters) on what the drive waits for.' },
    },
    required: ['questions', 'summary'],
    additionalProperties: false,
  } as const
  const AWAIT_OUTPUT = {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The project graph goal whose drive now waits.' },
      blocked: { type: 'boolean' },
      questions: { type: 'array', items: { type: 'string' } },
    },
    required: ['goal', 'blocked', 'questions'],
  } as const
  const AWAIT_DESCRIPTION = 'Stop the drive while everything left waits for the person: pass the ids of the open questions only the person decides and a one-line summary. The goal is blocked until they are decided; the harness resumes it by itself once every listed question is decided or dropped. Main agent only.'

  const awaitHuman: ToolDefinitionLike = {
    ...toolShell('await_human', AWAIT_DESCRIPTION, AWAIT_PARAMETERS, AWAIT_OUTPUT),
    async execute(args: unknown, exec: unknown) {
      const { agent } = mainAgentCall(isMain, exec, { message: 'only the main agent waits for the person', hint: 'the main agent puts the questions to the person and calls await_human' })
      const questions = isRecord(args) && Array.isArray(args.questions) ? args.questions : undefined
      if (questions === undefined || questions.length < 1 || questions.length > 20 || !questions.every(id => typeof id === 'string' && id.trim() !== '')) refuse('invalid', 'questions must list 1 to 20 question ids', 'pass the ids of the open questions the person decides', 'questions')
      const summary = isRecord(args) && typeof args.summary === 'string' ? args.summary.trim() : ''
      if (summary.length < 1 || summary.length > 500) refuse('invalid', 'summary must be 1 to 500 characters', 'say in one line what the drive waits for', 'summary')
      const session = agent.session
      const place = placeOf(session)
      if (session === undefined || place === undefined) refuse('invalid', 'no project graph for this session', 'enable glm-hourness/design and /wish')
      const graph = await deps.cache.load(place.graphDir)
      const goal = focusGoal(session, graph)
      if (goal === undefined) refuse('invalid', 'no goal in focus', 'focus the goal whose drive waits with graph_focus')
      const ids = [...new Set((questions as string[]).map(id => id.trim()))]
      const inGoal = new Set(subtreeOf(childrenIndex(graph), goal).map(node => node.id))
      for (const id of ids) {
        const node = graph.nodes.get(id)
        if (node === undefined || !inGoal.has(id) || node.type !== 'question' || (node.status !== 'approved' && node.status !== 'doing') || deciderOf(node) !== 'human') {
          refuse('invalid', `${id} is not an open question of goal ${goal.id} that the person decides`, 'list only approved or doing questions under the goal whose decider is the person; decide the agent\'s own with graph_decide', 'questions')
        }
      }
      const goals = goalsOf()
      if (goals === undefined) refuse('invalid', 'there is no goals service: the drive cannot wait', 'tell the person in the chat what waits for them')
      const live = liveAgent(session.id) ?? agent as unknown as LiveAgentLike
      const view = viewOf(goals, live)
      if (view?.phase !== 'active') refuse('invalid', `the goal is ${view?.phase ?? 'not there'}, not active`, 'await_human stops an active drive; there is nothing to stop')
      try {
        goals.block(live, refOf(view), { code: 'hourness-waiting-human', message: `Waiting for the person: ${ids.join(', ')}. ${summary}`.trim() })
      }
      catch (error) {
        refuse('invalid', `the goal cannot be blocked: ${errorText(error)}`, 'read the goal again and call await_human once more')
      }
      emitMetric({ event: 'execute.goal', goal: goal.id, op: 'block', code: 'hourness-waiting-human' })
      return { goal: goal.id, blocked: true, questions: ids }
    },
  }

  async function markBatch(agent: AgentLike, callId: string, k: number): Promise<void> {
    const session = agent.session
    const place = placeOf(session)
    if (session === undefined || place === undefined) return
    const graph = await deps.cache.load(place.graphDir)
    const goal = focusGoal(session, graph)
    if (goal === undefined) return
    const decided = pendingReport(graph, goal, batchSince(goal))
    const n = commentsOf(goal).filter(text => /^批次 \d+ · /.test(text)).length + 1
    const written = await comment(place.graphDir, goal.id, `批次 ${n} · 交给你 ${k} 件 · 告知 agent 自己定的 ${decided.length} 件 · ${callId}`)
    if (!written.ok) deps.report(session.id, 'degraded', `批次的批注写不进图（${goal.id}）：${written.why ?? ''}`)
    emitMetric({ event: 'execute.tier', tier: 1, node: goal.id, reported: decided.length, batched: k })
    stateOf(session.id).batchTell = decided.length === 0 ? undefined : `Say in one line each, in this same reply, what you decided yourself since the last batch: ${decided.map(item => `${item.id} ${item.title}`).join(', ')}.`
  }

  const batchMark: PostExecuteListener = async (exec, result, next) => {
    const decision = await next()
    if (decision.kind === 'block' || result.isError || exec.parent !== undefined || exec.agent === undefined) return decision
    if (exec.name !== 'propose_to_human' && exec.name !== 'await_human') return decision
    const agent = exec.agent
    if (!isMain(agent)) return decision
    try {
      if (exec.name === 'propose_to_human') {
        if (shownProposalOf(false, result.content.map(block => block.text ?? '').join('')) !== undefined) await markBatch(agent, exec.callId, 1)
      }
      else {
        const value = result.value
        const count = isRecord(value) && Array.isArray(value.questions) ? value.questions.length : 1
        await markBatch(agent, exec.callId, count)
      }
    }
    catch (error) {
      deps.report(agent.session?.id, 'degraded', `批次没记上：${errorText(error)}`)
    }
    return decision
  }

  // ---- the holder's lifecycle ----

  async function created(agent: AgentLike): Promise<void> {
    const session = agent.session
    if (session === undefined || session.header.origin === 'subagent') return
    const place = placeOf(session)
    if (place === undefined) return
    if (isMain(agent)) {
      await hello(place, session.id)
      return
    }
    // A former holder restored in this process: its drive goal goes, the drive follows the main agent (N7).
    const goals = goalsOf()
    const live = liveAgent(session.id)
    if (goals === undefined || live === undefined) return
    const view = viewOf(goals, live)
    const named = graphGoalOf(view?.objective)
    if (view === undefined || named === undefined) return
    const goal = (await deps.cache.load(place.graphDir)).nodes.get(named)
    const latest = goal === undefined ? undefined : commentsOf(goal).filter(text => text.startsWith(DRIVE_START_MARK) || text.startsWith(MOVED_MARK)).map(text => /会话 (\S+)/.exec(text)?.[1]).at(-1)
    if (latest === undefined || latest === session.id) return
    try {
      goals.clear(live, refOf(view))
    }
    catch (error) {
      deps.report(session.id, 'degraded', `旧会话的自动推进没清掉：${errorText(error)}`)
    }
  }

  const guarded = async (what: string, sessionId: string | undefined, run: () => Promise<void>): Promise<void> => {
    try {
      await run()
    }
    catch (error) {
      deps.report(sessionId, 'degraded', `自动推进的${what}出错：${errorText(error)}`)
    }
  }
  const guardedAction = async (run: () => Promise<HarnessResult>): Promise<HarnessResult> => {
    try {
      return await run()
    }
    catch (error) {
      return { outcome: 'failed', reason: errorText(error) }
    }
  }

  return {
    onStep: (agent, admitted) => guarded('判断', agent.session?.id, () => step(agent, admitted)),
    onCreated: agent => guarded('接手', agent.session?.id, () => created(agent)),
    onGoalChanged: payload => guarded('goal 记录', payload.agent.id, () => goalChanged(payload)),
    startDrive: record => guardedAction(() => start({
      project: record.project,
      key: record.key,
      goal: typeof record.payload.goal === 'string' ? record.payload.goal : '',
      module: typeof record.payload.module === 'string' ? record.payload.module : '',
      release: typeof record.payload.release === 'string' ? record.payload.release : '',
      ...(record.session === undefined ? {} : { session: record.session }),
    })),
    resumeDrive: record => guardedAction(() => {
      const place = placeOfRoot(record.project)
      return resumeAfterPeak(place, holderOf(place.graphDir) ?? record.session)
    }),
    reconcile: record => guardedAction(() => runReconcile(record.project, record.session, record.key, true)),
    completionGate,
    batchMark,
    awaitHuman,
    status(session) {
      const state = stateOf(session)
      return { ...(state.state === undefined ? {} : { state: state.state }), returns: state.returns, lost: state.lost, ...(state.batchTell === undefined ? {} : { batchTell: state.batchTell }), counters: state.counters }
    },
    notes: () => [...noteSet.values()],
    dispose() {
      stopWatching()
      for (const state of sessions.values()) state.cancelPeak?.()
      for (const exec of startedExec) {
        try {
          appendDriveSync(exec, { op: 'exit', proc: PROC, at: now().toISOString() })
        }
        catch {
          // The host is going away: a line that cannot be written leaves the pause to be read as the person's.
        }
      }
      startedExec.clear()
    },
  }
}
