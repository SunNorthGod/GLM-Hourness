/**
 * The dispatch status notice (M7 design 0.6 §3.5.4 without the free-slot
 * line and the ready-task list, which are P1's, D4): what the main agent
 * reads at a step while the work in its focus is being driven. An
 * `agent/pre-step` notice through the shared seam (src/shared/step-notice.ts)
 * on the holder's steps only, while the focus module (else the focus goal)
 * derives to `decompose`, `execute` or `merge`, or a module or the goal is
 * sent back to design (§3.9.7).
 *
 * The English text lists only the parts that have content: the running
 * dispatches of the project (task, attempt, minutes since the dispatch
 * comment, the latest open request; §3.4.3's sentence for a worker a
 * previous holder started), the open requests longest waiting first, the
 * stale dispatches (the pins of each in-progress task's latest dispatch),
 * the dispatches the reconcile found lost (§3.9.6), the drive's state line
 * (§3.9.1), the two-level loop (what is sent back with the work running in
 * it, what the agent decided itself since its last batch, the batch's tell,
 * and the batch split into now and later by `batchOf`), and the model
 * catalog of the holder's provider the first time in the process and
 * whenever it changes (§3.1.3).
 *
 * Injection follows src/graph/digest-notice.ts: after a compaction, at a
 * goal round, and when the digest changes. The digest is taken of the text
 * without the minutes and without the catalog line, so the passing of time
 * alone adds no notice (K7); a new catalog adds one by itself. The wording
 * the design leaves open is authored here (D9).
 */
import { changeReason, digestOf, isGoalRound, noticeHistory, type DigestFacts } from '../graph/digest-notice.ts'
import { derivedStage, sentBack } from '../graph/execute-stage.ts'
import { modulesOf, moduleOf } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { staleness } from '../graph/pins.ts'
import { childrenIndex, subtreeOf } from '../graph/projection.ts'
import type { GraphNode } from '../graph/schema.ts'
import { graphFocus } from '../graph/service.ts'
import { effectiveStage, goalOf, moduleReleaseGate } from '../graph/stage.ts'
import { userGraphOf } from '../graph/user-graph.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type ServiceLookup, type UserNotice } from '../shared/dsh-min.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { parseDispatchComment, latestDispatch, registeredDispatches, type Attempt } from './attempts.ts'
import { sha256Hex } from './digest.ts'
import { routeOf, type GraphCache } from './dispatch.ts'
import type { Drive } from './drive.ts'
import { pendingRequests, type PendingRequest } from './requests.ts'
import { batchOf, batchSince, pendingReport, type BatchItem } from './tiers.ts'

/** Source kind of the notice: the execute row's fact notices (§3.4.3). */
const NOTICE_SOURCE = 'glm-hourness-execute'

const NOTICE_REASONS = ['compaction', 'goal-round', 'first', 'changed', 'catalog'] as const
type NoticeReason = typeof NOTICE_REASONS[number]

/** What the notice keeps in its source: `{hournessExecute: {event: 'drive', digest, anchor?, reason}}`. */
interface DriveFacts extends DigestFacts {
  readonly event: 'drive'
  readonly reason: NoticeReason
}

/** The stages of the focus that carry the notice (§3.5.4). */
const DRIVEN: ReadonlySet<string> = new Set(['decompose', 'execute', 'merge'])
const GONE: ReadonlySet<string> = new Set(['dropped', 'superseded'])
/** The decisions of the agent the notice names at most (§3.9.7). */
const REPORT_LIMIT = 5
/** The model ids of a catalog the notice lists at most. */
const CATALOG_LIMIT = 40
const QUESTION_LIMIT = 200

/** §3.4.3's sentence for a worker a previous holder started. */
const PREVIOUS_HOLDER = 'started by the previous main agent: you can answer its requests; to change its direction, let it hand back and dispatch again, or ask the person to stop it from the panel'

/** What the drive says of the holder's session (src/execute/drive.ts). */
type DriveStatus = ReturnType<Drive['status']>

/** What one step's notice is built from; the caller read the graph, the register, the requests and the drive. */
export interface StatusInput {
  readonly graph: LoadedGraph
  readonly focus: string | undefined
  /** The holder session this step serves. */
  readonly session: string
  readonly drive: DriveStatus
  /** The running dispatches of this project. */
  readonly running: readonly Attempt[]
  /** The open requests of this project. */
  readonly requests: readonly PendingRequest[]
  readonly now: Date
}

/** The notice's body: `text` is shown, `stable` (no minutes) is what the digest is taken of. */
export interface StatusText {
  readonly subject: string
  readonly text: string
  readonly stable: string
}

const commentsOf = (node: GraphNode): GraphNode['history'] => node.history.filter(entry => entry.op === 'comment' && typeof entry.text === 'string')

/** The `at` of the dispatch comment that names the child id. */
function dispatchedAt(graph: LoadedGraph, attempt: Attempt): string | undefined {
  const node = graph.nodes.get(attempt.node)
  return node === undefined ? undefined : commentsOf(node).filter(entry => parseDispatchComment(entry.text ?? '')?.childId === attempt.childId).at(-1)?.at
}

/** A module or the goal sent back to design and still there. */
function backInDesign(node: GraphNode): boolean {
  return effectiveStage(node) === 'design' && !GONE.has(node.status) && sentBack(node)
}

/** The modules of a goal; an unreadable module structure reads as none (the notice only reads). */
function modulesOfGoal(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  try {
    return modulesOf(graph, goal)
  }
  catch {
    return []
  }
}

/** The focus module (when the focus is in one of the goal's modules), else the goal. */
function subjectOf(graph: LoadedGraph, goal: GraphNode, focus: GraphNode): GraphNode {
  try {
    const module = moduleOf(graph, focus)
    return module !== undefined && modulesOf(graph, goal).includes(module) ? module : goal
  }
  catch {
    return goal
  }
}

/** The nodes of the goal whose latest stop mark (`· 停下`) has no later human entry in the subtree (§3.7.3). */
function stoppedNodes(subtree: readonly GraphNode[]): GraphNode[] {
  const human = subtree.flatMap(node => node.history.filter(entry => entry.actor === 'human' || entry.relay !== undefined).map(entry => entry.at))
  return subtree.filter(node => {
    const mark = commentsOf(node).filter(entry => /·\s*停下\s*$/.test(entry.text ?? '')).at(-1)
    return mark !== undefined && !human.some(at => at > mark.at)
  })
}

/**
 * The user graph's decomposition gaps as one notice line (user graph design
 * 0.4.1 §5.4): who is missing per step, the work nothing serves, the flows
 * without their test task, and the steps still pointing at dropped ones.
 * Undefined for a goal without a user graph or without any of these gaps —
 * the other gaps have their own doors (the release and the walk
 * preconditions) and no line here.
 */
function userGraphGaps(graph: LoadedGraph, goal: GraphNode): string | undefined {
  const unserved: string[] = []
  const orphan: string[] = []
  const noTest: string[] = []
  const nextDropped: string[] = []
  for (const gap of userGraphOf(graph, goal).gaps) {
    if (gap.key === 'step:unserved' || gap.key === 'step:next-dropped') {
      const step = graph.nodes.get(gap.nodes[0] ?? '')
      if (step === undefined) continue
      const flow = step.parent === undefined ? undefined : graph.nodes.get(step.parent)
      const named = `${flow?.title ?? step.title} › ${step.title} (${step.id})`
      if (gap.key === 'step:unserved') unserved.push(named)
      else nextDropped.push(named)
    }
    else if (gap.key === 'work:orphan') {
      const work = graph.nodes.get(gap.nodes[0] ?? '')
      if (work !== undefined) orphan.push(`${work.title} (${work.id})`)
    }
    else if (gap.key === 'flow:no-test') {
      const flow = graph.nodes.get(gap.nodes[0] ?? '')
      if (flow !== undefined) noTest.push(`${flow.title} (${flow.id})`)
    }
  }
  const parts = [
    ...(unserved.length > 0 ? [`Steps nobody serves: ${unserved.join(', ')}`] : []),
    ...(orphan.length > 0 ? [`work that serves no step: ${orphan.join(', ')}`] : []),
    ...(noTest.length > 0 ? [`flows with no test task: ${noTest.join(', ')}`] : []),
    ...(nextDropped.length > 0 ? [`steps whose next points at a dropped step: ${nextDropped.join(', ')}`] : []),
  ]
  return parts.length === 0 ? undefined : parts.join('; ')
}

/** What waits to go to the person (§3.9.7): the framework sent back, the module release pages, the stops. */
function batchItems(graph: LoadedGraph, goal: GraphNode, subtree: readonly GraphNode[]): BatchItem[] {
  const items: BatchItem[] = []
  if (backInDesign(goal)) items.push({ kind: 'framework', id: goal.id, title: goal.title })
  for (const module of modulesOfGoal(graph, goal)) {
    if (effectiveStage(module) !== 'design' || GONE.has(module.status)) continue
    if (sentBack(module) || moduleReleaseGate(graph, goal, module).every(item => item.ok)) items.push({ kind: 'module-release', id: module.id, title: module.title })
  }
  for (const node of stoppedNodes(subtree)) items.push({ kind: 'stopped', id: node.id, title: node.title })
  return items
}

function batchWords(item: BatchItem): string {
  if (item.kind === 'framework') return `the framework of goal ${item.id} "${item.title}"`
  if (item.kind === 'module-release') return `the release page of module ${item.id} "${item.title}"`
  if (item.kind === 'stopped') return `what stopped on ${item.id} "${item.title}"`
  return `${item.id} "${item.title}"`
}

/**
 * The notice's body for this step, or undefined when the focus does not
 * qualify (§3.5.4): no goal above the focus, or a focus whose stage is not
 * `decompose`, `execute` or `merge` while nothing under the goal is sent
 * back. Only the parts with content are written.
 */
export function statusText(input: StatusInput): StatusText | undefined {
  const { graph, drive } = input
  const focus = input.focus === undefined ? undefined : graph.nodes.get(input.focus)
  const goal = focus === undefined ? undefined : goalOf(graph, focus.id)
  if (focus === undefined || goal === undefined) return undefined
  const subject = subjectOf(graph, goal, focus)
  const stage = derivedStage(graph, subject)
  const returned = backInDesign(goal) || modulesOfGoal(graph, goal).some(backInDesign) || drive.returns.length > 0
  if (!DRIVEN.has(stage) && !returned) return undefined

  const subtree = subtreeOf(childrenIndex(graph), goal)
  const render = (timed: boolean): string => {
    const minutes = (at: string | number | undefined): string => {
      if (!timed || at === undefined) return ''
      const since = typeof at === 'number' ? at : Date.parse(at)
      return Number.isNaN(since) ? '' : `, ${Math.max(0, Math.floor((input.now.getTime() - since) / 60_000))} min`
    }
    const lines = [`Dispatch status of ${subject.type === 'goal' ? 'goal' : 'module'} ${subject.id} (stage ${stage}):`]
    if (input.running.length > 0) {
      lines.push('Running:')
      for (const attempt of input.running) {
        const latest = input.requests.filter(entry => entry.request.childId === attempt.childId).at(-1)
        const request = latest === undefined ? '' : `; latest request: ${latest.request.kind} ${latest.request.id}`
        const previous = attempt.parentSession !== undefined && attempt.parentSession !== input.session ? `; ${PREVIOUS_HOLDER}` : ''
        lines.push(`- ${attempt.node} attempt ${attempt.attempt} (${attempt.role}, ${attempt.childId}, model ${attempt.model}${minutes(dispatchedAt(graph, attempt))})${request}${previous}`)
      }
    }
    if (input.requests.length > 0) {
      lines.push('Waiting for your answer_worker, longest first:')
      for (const { request, since } of [...input.requests].sort((a, b) => a.since - b.since)) {
        const asked = request.question === undefined ? '' : `: ${request.question.slice(0, QUESTION_LIMIT)}`
        lines.push(`- ${request.id} ${request.kind} of ${request.task} attempt ${request.attempt}${minutes(since)}${asked}`)
      }
    }
    const stale = subtree.filter(node => node.type === 'task' && node.status === 'doing').flatMap(node => {
      const dispatched = latestDispatch(node)
      const changes = dispatched === undefined ? [] : staleness(graph, dispatched.pins, sha256Hex)
      return dispatched === undefined || changes.length === 0 ? [] : [`${node.id} attempt ${dispatched.attempt} (${changes.map(change => `${change.id} ${change.change}`).join(', ')})`]
    })
    if (stale.length > 0) lines.push(`Stale dispatches, the graph changed after they were dispatched: ${stale.join('; ')}. Their handbacks count as stale; dispatch again when the work should follow the graph as it is now.`)
    if (drive.lost.length > 0) lines.push(`Lost when the app restarted: ${drive.lost.map(item => `${item.task} attempt ${item.attempt} (${item.childId})`).join(', ')}. Dispatch each again when you decide to; its brief lists the commits its branch already has.`)
    const gaps = userGraphGaps(graph, goal)
    if (gaps !== undefined && gaps.length > 0) lines.push(gaps)
    if (drive.state !== undefined) lines.push(drive.state)
    for (const entry of drive.returns) {
      const what = `${entry.tier === 3 ? 'goal' : 'module'} ${entry.node}`
      lines.push(entry.running.length === 0
        ? `Sent back to design: ${what} (running: none). Nothing in it is dispatched until the person releases the design.`
        : `Sent back to design: ${what} (running: ${entry.running.map(item => `${item.task} ${item.childId}`).join(', ')}). They are stale: interrupt them with interrupt_agent; dispatch again after the person releases the design.`)
    }
    const decided = pendingReport(graph, goal, batchSince(goal))
    if (decided.length > 0) lines.push(`Decided by you since your last batch to the person: ${decided.slice(0, REPORT_LIMIT).map(item => `${item.id} ${item.title}`).join(', ')} (${decided.length})`)
    if (drive.batchTell !== undefined) lines.push(drive.batchTell)
    const batch = batchOf(batchItems(graph, goal, subtree))
    if (batch.now.length > 0) lines.push(`Put these to the person now (at most three): ${batch.now.map(batchWords).join('; ')}; later: ${batch.later.length === 0 ? 'none' : batch.later.map(batchWords).join('; ')}.`)
    if (lines.length === 1) lines.push('Nothing runs or waits for you here.')
    return lines.join('\n')
  }
  return { subject: subject.id, text: render(true), stable: render(false) }
}

/** The catalog of the holder's provider, as the notice shows it. */
export interface Catalog {
  readonly provider: string
  readonly ids: readonly string[]
}

/** The catalog digest shown per provider in this process (§3.5.4: the first time, and whenever it changes). */
const shownCatalogs = new Map<string, string>()

function catalogLine(catalog: Catalog): string {
  const ids = catalog.ids.slice(0, CATALOG_LIMIT)
  return `Model catalog of provider ${catalog.provider}: ${ids.join(', ')}${catalog.ids.length > ids.length ? ', …' : ''}. Choose a model for each dispatch_task and say why.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function noticeFacts(value: unknown): DriveFacts | undefined {
  if (!isRecord(value)) return undefined
  const { event, digest, anchor, reason } = value
  if (event !== 'drive' || typeof digest !== 'string' || !NOTICE_REASONS.includes(reason as NoticeReason)) return undefined
  if (anchor !== undefined && typeof anchor !== 'string') return undefined
  return { event, digest, ...(anchor === undefined ? {} : { anchor }), reason: reason as NoticeReason }
}

/**
 * The notice this step needs, or undefined when the history already shows
 * the status: added after a compaction, at a goal round, when the stable
 * text's digest changed, or when the catalog is new to this process. A
 * catalog shown here is remembered.
 */
export function dispatchNotice(history: readonly DerivedMessage[], admitted: readonly unknown[], status: StatusText, catalog: Catalog | undefined): UserNotice | undefined {
  const state = noticeHistory(history, NOTICE_SOURCE, source => noticeFacts(source.hournessExecute))
  const digest = digestOf(status.stable)
  const catalogDigest = catalog === undefined || catalog.ids.length === 0 ? undefined : digestOf(catalog.ids.join('\n'))
  const newCatalog = catalog !== undefined && catalogDigest !== undefined && shownCatalogs.get(catalog.provider) !== catalogDigest
  const reason: NoticeReason | undefined = changeReason(state, { digest, goalRound: admitted.some(isGoalRound), sameSubject: () => true }, 'first') ?? (newCatalog ? 'catalog' : undefined)
  if (reason === undefined) return undefined
  if (newCatalog) shownCatalogs.set(catalog.provider, catalogDigest)
  const anchor = state.checkpoint?.id
  const facts: DriveFacts = { event: 'drive', digest, ...(anchor === undefined ? {} : { anchor }), reason }
  const text = newCatalog ? `${status.text}\n${catalogLine(catalog)}` : status.text
  return createUserNotice(NOTICE_SOURCE, `dispatch status of ${status.subject} (${reason})`, wrapSystemReminder(text), { hournessExecute: facts })
}

/** The catalog of the agent's provider through `llm.listModels`, called as a method; undefined when it cannot be read. */
async function readCatalog(lookup: ServiceLookup, agent: AgentLike): Promise<Catalog | undefined> {
  const provider = routeOf(agent)
  const llm: unknown = typeof lookup.get === 'function' ? lookup.get('llm') : undefined
  if (provider === undefined || !isRecord(llm) || typeof llm.listModels !== 'function') return undefined
  try {
    const listed: unknown = await (llm as { listModels: (provider: string) => Promise<unknown> }).listModels(provider)
    if (!Array.isArray(listed)) return undefined
    const ids = listed.flatMap(entry => isRecord(entry) && typeof entry.id === 'string' ? [entry.id] : [])
    return { provider, ids: [...new Set(ids)] }
  }
  catch {
    return undefined
  }
}

/** What the row hands to the installer. */
export interface DispatchNoticeDeps {
  readonly lookup: ServiceLookup
  readonly cache: GraphCache
  readonly graphDirOf: (cwd: string | undefined) => string | undefined
  /** Whether the agent is its project's main agent now; may throw. */
  readonly isMain: (agent: AgentLike) => boolean
  /** The drive's status of a holder session. */
  readonly drive: (session: string) => DriveStatus
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  readonly now?: () => Date
}

/**
 * Install the dispatch status notice on one agent. Returns undefined,
 * installing nothing, when the agent has no session history. A step whose
 * graph cannot be read goes without the notice and the row health says so.
 */
export function installDispatchNotice(agent: AgentLike, deps: DispatchNoticeDeps): (() => void) | undefined {
  const now = deps.now ?? ((): Date => new Date())
  const eligible = (): boolean => {
    try {
      return deps.isMain(agent)
    }
    catch {
      return false
    }
  }
  return installStepNotice(agent, 'dispatch status', eligible, async (history, { admitted, session }) => {
    try {
      const dir = deps.graphDirOf(session.header.cwd)
      if (dir === undefined) return undefined
      const graph = await deps.cache.load(dir)
      const status = statusText({
        graph,
        focus: graphFocus(deps.lookup)?.focusOf(session),
        session: session.id,
        drive: deps.drive(session.id),
        running: registeredDispatches().filter(attempt => attempt.graphDir === dir),
        requests: pendingRequests(dir),
        now: now(),
      })
      return status === undefined ? undefined : dispatchNotice(history, admitted, status, await readCatalog(deps.lookup, agent))
    }
    catch (error) {
      deps.report(session.id, 'degraded', `派发状态提醒这一步没带上：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }, 'execute')
}
