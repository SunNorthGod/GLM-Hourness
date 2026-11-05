/**
 * The request register and the communication tools (M7 design 0.6 §3.3,
 * §3.4): a worker's `submit_plan` (§3.3.2) and `ask_main` (§3.4.2) register a
 * request, notify the current main agent, and hold the worker's tool call
 * open until the main agent's `answer_worker` resolves it or the wait runs
 * out. A dispatched child carries an `outputSchema`: a turn that ends without
 * the structured result settles as an error and the handback is lost
 * (subagent:1098–1117), so the wait must live inside one tool call and the
 * worker's turn stays open while it waits — which also keeps the driver from
 * starting its next beat (§3.3.2).
 *
 * The register is module level like the dispatch register
 * (src/execute/attempts.ts): it survives a row disable and re-enable in the
 * same process, and `answer_worker` authorizes by the caller being the main
 * agent — the current holder can answer a request that a previous main
 * agent's dispatch registered (§3.4.3). The recipient of a notice is
 * re-read from the holder record on every send, never taken from the
 * dispatch's parent.
 */
import { openEngine } from '../graph/engine.ts'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import { staleness } from '../graph/pins.ts'
import { mainAgentCall, isRecord, refuse, toolShell } from '../design/tool-support.ts'
import type { AgentLike, ServiceLookup, ToolDefinitionLike, ToolExecutionContext, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { deliver } from '../rules/wake.ts'
import type { Attempt } from './attempts.ts'
import { recordCommunication, registeredAttempt, updateAttempt } from './attempts.ts'
import type { GraphCache } from './dispatch.ts'
import { writeWithRetry } from './retry.ts'
import { sha256Hex } from './digest.ts'
import { emitMetric } from './metrics.ts'
import { checkPlan, planDigest, planPathsOfSection, readPlanSection, approvePlanSection, renderPlanSection, withPlanSection, renderApprovalComment, type Plan } from './plan.ts'

/** The plan wait (§3.3.2 step 3) and the ask wait (§3.4.2). */
const PLAN_WAIT_MS = 30 * 60_000
const ASK_WAIT_MS = 20 * 60_000

/** How many plan checks one dispatch may fail in a row before it must hand back (§3.3.2). */
const PLAN_REJECT_LIMIT = 4

const REQUEST_ID = /^R-[0-9a-z]{6}$/

/** What the worker's held call resolves to (§3.3.2 step 4, §3.4.2). */
type RequestOutcome =
  | { readonly status: 'approved', readonly version: number }
  | { readonly status: 'revise', readonly version: number, readonly text: string }
  | { readonly status: 'answered', readonly text: string }
  | { readonly status: 'timeout', readonly hint: string }

/** What a held plan submit resolves to. */
type PlanOutcome = Extract<RequestOutcome, { readonly status: 'approved' | 'revise' | 'timeout' }>

/** What a held question resolves to. */
type QuestionOutcome = Extract<RequestOutcome, { readonly status: 'answered' | 'timeout' }>

/** One open request (§3.3.2 step 2, §3.4.2): what the notice carried and the answer needs. */
export interface ExecuteRequest {
  readonly id: string
  readonly kind: 'plan' | 'question'
  readonly childId: string
  readonly task: string
  readonly attempt: number
  /** The graph directory of the project, for the holder lookup and the approval writes. */
  readonly graphDir: string
  /** Plan requests: the version and digest of the section the submit wrote. */
  readonly version?: number
  readonly digest?: string
  /** Question requests: what was asked and what the worker does on a timeout. */
  readonly question?: string
  readonly assumption?: string
}

interface Pending {
  readonly request: ExecuteRequest
  /** When the request was registered (milliseconds since the epoch): the dispatch status notice orders by waiting time. */
  readonly since: number
  /** The checked plan, kept for the approval's re-check (§3.3.4); a question has none. */
  readonly plan?: Plan
  readonly resolve: (outcome: RequestOutcome) => void
  readonly timer: ReturnType<typeof setTimeout>
}

/** The open requests of this process, oldest first (a Map keeps insertion order). */
const pending = new Map<string, Pending>()

/** Consecutive failed plan checks per dispatch (§3.3.2); the fourth one must hand back. */
const planRejects = new Map<string, number>()

/** Register a request and hold the worker's call until the answer, the wait's end, or the worker's interruption. */
function awaitAnswer<T extends RequestOutcome>(request: ExecuteRequest, plan: Plan | undefined, waitMs: number, timeout: T, signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false
    const finish = (outcome: RequestOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      pending.delete(request.id)
      resolve(outcome as T)
    }
    const timer = setTimeout(() => finish(timeout), waitMs)
    pending.set(request.id, { request, since: Date.now(), ...(plan === undefined ? {} : { plan }), resolve: finish, timer })
    signal?.addEventListener('abort', () => finish(timeout), { once: true })
  })
}

/** The main agent's answer resolves the held call (§3.3.4, §3.4.2); false when the id names no open request. */
function answerRequest(id: string, answer: RequestOutcome): boolean {
  const entry = pending.get(id)
  if (entry === undefined) return false
  pending.delete(id)
  clearTimeout(entry.timer)
  entry.resolve(answer)
  return true
}

/** The oldest open request of a kind in a project, optionally of one task; the probe's answer scripts resolve ids through it (§9.1 glm-exec-plan). */
export function oldestPending(kind: 'plan' | 'question', graphDir?: string, task?: string): ExecuteRequest | undefined {
  for (const entry of pending.values()) {
    if (entry.request.kind !== kind) continue
    if (graphDir !== undefined && entry.request.graphDir !== graphDir) continue
    if (task !== undefined && entry.request.task !== task) continue
    return entry.request
  }
  return undefined
}

/** One open request with the time it was registered. */
export interface PendingRequest {
  readonly request: ExecuteRequest
  /** Milliseconds since the epoch. */
  readonly since: number
}

/** The open requests of a project, the longest waiting first (§3.5.4): the dispatch status notice lists them. */
export function pendingRequests(graphDir: string): readonly PendingRequest[] {
  return [...pending.values()].filter(entry => entry.request.graphDir === graphDir).map(entry => ({ request: entry.request, since: entry.since }))
}

/** The id of a new request: `R-` plus six base-36 digits (§3.3.2 step 2). */
function requestId(random: () => number): string {
  for (;;) {
    const id = `R-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`
    if (!pending.has(id)) return id
  }
}

/** What the tools need from the row — the seams the dispatch tool reads. */
export interface RequestsDeps {
  readonly lookup: ServiceLookup
  /** Where the project graph of a working directory is; undefined outside a project with a graph. */
  readonly graphDir: (cwd: string | undefined) => string | undefined
  /** The row's revision-keyed graph cache; a load is the fresh read of a check (§3.3.4). */
  readonly cache: GraphCache
  /** Whether the agent's session is its project's main agent now; may throw. */
  readonly isMainAgent: (agent: AgentLike) => boolean
  /** Whether the design row is loaded, whose /wish makes the main agent. */
  readonly designPresent: () => boolean
  /** Report the row health of a session. */
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** The clock of history timestamps; tests pin it. */
  readonly now?: () => Date
  /** The random source of request ids; tests pin it. */
  readonly random?: () => number
  /** The wait lengths; tests shorten them. */
  readonly planWaitMs?: number
  readonly askWaitMs?: number
}

/** The caller's project graph directory, or a refusal when the session has none. */
function dirFor(deps: RequestsDeps, agent: AgentLike): string {
  const dir = deps.graphDir(agent.session?.header.cwd)
  if (dir === undefined) refuse('invalid', 'no project graph for this session', 'the tools of the execute row run inside a project with a graph')
  return dir
}

/** The registered dispatch of the calling tool; a session this process did not dispatch is nobody's worker. */
function callerAttempt(agent: AgentLike): Attempt {
  const attempt = registeredAttempt(agent.id)
  if (attempt === undefined) refuse('forbidden', 'only a dispatched worker or reviewer calls this tool', 'the tools for workers run in a session dispatch_task started')
  return attempt
}

/** A caller's argument as a non-empty one-line string of at most 2000 characters, or undefined. */
function oneLine(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' && !/[\r\n]/.test(value) && value.length <= 2000 ? value.trim() : undefined
}

/** The notice to the current main agent (§3.4.3): the facts carry the request, the recipient is the holder at this moment. Best effort; a failed delivery is said in the sender's health. */
function notifyMain(deps: RequestsDeps, request: ExecuteRequest, event: 'plan' | 'question', summary: string, text: string, sessionId: string | undefined): void {
  const notice: UserNotice = createUserNotice('glm-hourness-execute', summary, text, { hournessExecute: { event, task: request.task, attempt: request.attempt, childId: request.childId, request: request.id } })
  const holder = mainAgentOf(holderHome(deps.lookup), request.graphDir)
  const way = holder === undefined ? undefined : deliver(deps.lookup, holder.sessionId, notice)
  if (holder === undefined || way === undefined || way.kind !== 'sent') {
    const why = holder === undefined
      ? '项目没有主 Agent 记录'
      : way === undefined || way.kind === 'gone' ? '持有者的会话不在了' : way.kind === 'failed' ? way.why : '没有可用的 agent 注册表'
    deps.report(sessionId, 'degraded', `通知送不到当前主 Agent（请求 ${request.id}）：${why}；请求仍开着，等 ${request.kind === 'plan' ? 30 : 20} 分钟超时`)
  }
}

const PLAN_TIMEOUT_HINT = 'No review within 30 minutes; hand back with status plan-pending.'
const ASK_TIMEOUT_HINT = 'No answer within 20 minutes; continue on your stated assumption and list it under assumptions in your handback.'

const SUBMIT_PARAMETERS = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      description: 'The steps of the plan, in order.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'One line.' },
          paths: { type: 'array', items: { type: 'string' }, description: 'Repository-relative paths this step writes, in the write scope notation.' },
          acceptance: { type: 'array', items: { type: 'string' }, description: 'At least one per step: how you will know the step is done.' },
          covers: { type: 'array', items: { type: 'integer' }, description: 'Which acceptance items of the task (counted from 0) this step covers.' },
          verify: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4-batch'], description: 'How far the step is verified. L2 and L3 need commands, L4-batch takes none.' },
          commands: { type: 'array', items: { type: 'string' }, description: 'The check commands of the step.' },
        },
        required: ['title', 'paths', 'acceptance', 'covers', 'verify', 'commands'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'At most 2000 characters of context for the reviewer.' },
  },
  required: ['steps'],
  additionalProperties: false,
} as const

const SUBMIT_OUTPUT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['approved', 'revise', 'timeout'] },
    version: { type: 'integer', description: 'The version of the plan section on the task.' },
    text: { type: 'string', description: 'A revise verdict: what the main agent wants changed.' },
    hint: { type: 'string', description: 'A timeout: what to do next.' },
  },
  required: ['status', 'version'],
} as const

/**
 * The `submit_plan` tool (§3.3.2): the check is the whole gate — a plan that
 * does not pass comes back to the worker at once and the main agent hears
 * nothing of it; the fourth consecutive failure of one dispatch must hand
 * back. A passing plan is written into the task body as the plan section,
 * registered, and notified; then the call stays open until the main agent's
 * `answer_worker` or the 30-minute wait.
 */
export function submitPlanTool(deps: RequestsDeps): ToolDefinitionLike {
  const now = deps.now ?? ((): Date => new Date())
  const random = deps.random ?? Math.random
  return {
    ...toolShell('submit_plan', 'Submit the plan of your task for the main agent to review. A plan that does not pass the checks comes back at once with the problems; a passing one is put on the task for the main agent to approve, and this call does not return until they approve it or send it back, or 30 minutes pass. Make the call the last thing in your turn and do no writes before it is approved.', SUBMIT_PARAMETERS, SUBMIT_OUTPUT),
    async execute(args: unknown, exec: ToolExecutionContext): Promise<{ status: 'approved' | 'revise' | 'timeout', version: number, text?: string, hint?: string }> {
      const agent = exec.agent
      if (agent === undefined) refuse('forbidden', 'submit_plan runs for an agent', 'submit_plan is a tool of a dispatched session')
      const attempt = callerAttempt(agent)
      if (attempt.role !== 'worker') refuse('forbidden', 'only a worker submits a plan', 'a reviewer has no plan; ask_main reaches the main agent')
      const dir = dirFor(deps, agent)
      const graph = await deps.cache.load(dir)
      const node = graph.nodes.get(attempt.node)
      if (node === undefined) refuse('invalid', `the task "${attempt.node}" is not in the graph any more`, 'hand the task back with status blocked')
      const checked = checkPlan(node, args)
      if (!checked.ok) {
        const rejects = (planRejects.get(attempt.childId) ?? 0) + 1
        planRejects.set(attempt.childId, rejects)
        // §3.16's 退回: the check sends the plan back to the worker; nobody waited.
        emitMetric({ event: 'execute.plan', task: attempt.node, version: (readPlanSection(node.body)?.version ?? 0) + 1, outcome: 'revise', steps: isRecord(args) && Array.isArray(args.steps) ? args.steps.length : 0, waitedMs: 0 })
        if (rejects >= PLAN_REJECT_LIMIT) {
          planRejects.delete(attempt.childId)
          refuse('plan_rejected', 'plan rejected 4 times; hand back with status blocked', 'hand the task back; the main agent can dispatch it again with better instructions')
        }
        refuse('invalid', `the plan does not pass the checks: ${checked.problems.join('; ')}`, 'fix the named problems and send the call again; the main agent is not notified of a failed check')
      }
      planRejects.delete(attempt.childId)
      const plan: Plan = checked.plan
      const version = (readPlanSection(node.body)?.version ?? 0) + 1
      const digest = planDigest(plan)
      recordCommunication(attempt.childId, 'plan')
      const id = requestId(random)
      const request: ExecuteRequest = {
        id,
        kind: 'plan',
        childId: attempt.childId,
        task: attempt.node,
        attempt: attempt.attempt,
        graphDir: dir,
        version,
        digest,
      }
      // The section on the task body is the durable copy (§3.3.2 step 1);
      // its write failing does not stop the review — the facts of this call
      // stay in the worker's session, and the health says why nothing is on
      // the task.
      const body = withPlanSection(node.body, renderPlanSection(plan, version, 'pending'))
      const engine = openEngine(dir, { now })
      const written = await writeWithRetry(async () => {
        const current = await engine.load()
        return engine.apply('harness', { op: 'edit', id: attempt.node, rev: current.revisions.get(attempt.node)!, set: { body }, reason: `计划第 ${version} 版待审（submit_plan ${id}）` })
      }).catch(() => undefined)
      if (written === undefined || !written.ok) {
        deps.report(agent.session?.id, 'degraded', `计划写不进任务正文（任务 ${attempt.node}）${written === undefined ? '' : `：${written.error.message}`}；审批不受影响，任务上看不到这一版计划`)
      }
      notifyMain(
        deps,
        request,
        'plan',
        `Plan of ${attempt.node} v${version} needs review (${id})`,
        `${renderPlanSection(plan, version, 'pending')}\n\nReview it: answer_worker {"request": "${id}", "verdict": "approve"} approves this version; {"request": "${id}", "verdict": "revise", "text": "what to change"} sends it back to the worker. The worker's call stays open for 30 minutes.`,
        agent.session?.id,
      )
      const planMetric = { event: 'execute.plan', task: attempt.node, version, steps: plan.steps.length } as const
      emitMetric({ ...planMetric, outcome: 'to-main', waitedMs: 0 })
      const asked = Date.now()
      const outcome = await awaitAnswer<PlanOutcome>(request, plan, deps.planWaitMs ?? PLAN_WAIT_MS, { status: 'timeout', hint: PLAN_TIMEOUT_HINT }, exec.signal)
      // 批准, 打回 (the main agent's revise) and 超时 of §3.16's table.
      emitMetric({ ...planMetric, outcome: outcome.status === 'revise' ? 'rejected' : outcome.status, waitedMs: Date.now() - asked })
      if (outcome.status === 'approved') return { status: 'approved', version }
      if (outcome.status === 'revise') return { status: 'revise', version, text: outcome.text }
      return { status: 'timeout', version, hint: outcome.hint }
    },
  }
}

const ASK_PARAMETERS = {
  type: 'object',
  properties: {
    question: { type: 'string', description: 'What you need decided, one line.' },
    assumption: { type: 'string', description: 'What you will do when nobody answers within 20 minutes.' },
    options: { type: 'array', items: { type: 'string' }, description: 'The choices, when you have concrete ones.' },
  },
  required: ['question', 'assumption'],
  additionalProperties: false,
} as const

const ASK_OUTPUT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['answered', 'timeout'] },
    text: { type: 'string', description: 'An answered question: the main agent\'s answer.' },
    hint: { type: 'string', description: 'A timeout: what to do next.' },
  },
  required: ['status'],
} as const

/** The `ask_main` tool (§3.4.2): register a question, notify the current main agent, hold the call for the answer or the 20-minute wait. */
export function askMainTool(deps: RequestsDeps): ToolDefinitionLike {
  const random = deps.random ?? Math.random
  return {
    ...toolShell('ask_main', 'Ask the main agent for a decision you cannot make yourself (the acceptance, the non-goals and the decider of a question are never yours). The call does not return until they answer or 20 minutes pass; on a timeout continue on your stated assumption and list it under assumptions in your handback. Make the call the last thing in your turn.', ASK_PARAMETERS, ASK_OUTPUT),
    async execute(args: unknown, exec: ToolExecutionContext): Promise<{ status: 'answered' | 'timeout', text?: string, hint?: string }> {
      const agent = exec.agent
      if (agent === undefined) refuse('forbidden', 'ask_main runs for an agent', 'ask_main is a tool of a dispatched session')
      const attempt = callerAttempt(agent)
      const dir = dirFor(deps, agent)
      const parsed = isRecord(args) ? args : {}
      const question = oneLine(parsed.question)
      const assumption = oneLine(parsed.assumption)
      if (question === undefined) refuse('invalid', 'question must be one non-empty line of at most 2000 characters', 'shorten it and send the call again', 'question')
      if (assumption === undefined) refuse('invalid', 'assumption must be one non-empty line of at most 2000 characters: what you will do when nobody answers', 'state it and send the call again', 'assumption')
      recordCommunication(attempt.childId, 'asked')
      const options = Array.isArray(parsed.options) && parsed.options.every(entry => typeof entry === 'string' && entry.trim() !== '') ? parsed.options as string[] : undefined
      const request: ExecuteRequest = {
        id: requestId(random),
        kind: 'question',
        childId: attempt.childId,
        task: attempt.node,
        attempt: attempt.attempt,
        graphDir: dir,
        question,
        assumption,
      }
      notifyMain(
        deps,
        request,
        'question',
        `Question from ${attempt.childId} (${request.id})`,
        `${question}${options === undefined ? '' : `\nOptions the worker sees: ${options.join(' | ')}`}\nThe worker continues on its own assumption if nobody answers within 20 minutes: ${assumption}\n\nAnswer with answer_worker {"request": "${request.id}", "text": "..."} — the answer is the result of the worker's call.`,
        agent.session?.id,
      )
      const asked = Date.now()
      const outcome = await awaitAnswer<QuestionOutcome>(request, undefined, deps.askWaitMs ?? ASK_WAIT_MS, { status: 'timeout', hint: ASK_TIMEOUT_HINT }, exec.signal)
      emitMetric({ event: 'execute.ask', task: attempt.node, waitedMs: Date.now() - asked, outcome: outcome.status })
      if (outcome.status === 'answered') {
        recordCommunication(attempt.childId, 'answered')
        return { status: 'answered', text: outcome.text }
      }
      recordCommunication(attempt.childId, 'timeout')
      return { status: 'timeout', hint: outcome.hint }
    },
  }
}

const ANSWER_PARAMETERS = {
  type: 'object',
  properties: {
    request: { type: 'string', description: 'The request id from the notice, `R-` plus six characters.' },
    verdict: { type: 'string', enum: ['approve', 'revise'], description: 'A plan request: approve the submitted version, or send it back.' },
    text: { type: 'string', description: 'A question request: the answer. A revise verdict: what to change, 1 to 4000 characters.' },
  },
  required: ['request'],
  additionalProperties: false,
} as const

const ANSWER_OUTPUT = {
  type: 'object',
  properties: { delivered: { type: 'boolean' } },
  required: ['delivered'],
} as const

/**
 * The `answer_worker` tool (§3.3.4, §3.4.2): the main agent resolves one open
 * request of its project. The caller is the main agent of the project the
 * request was registered under — the current holder answers what a previous
 * one left open. An approval re-checks the plan against the graph as it is
 * now (the checks and the pins); a failure comes back to the main agent and
 * the worker's held call does not move.
 */
export function answerWorkerTool(deps: RequestsDeps): ToolDefinitionLike {
  const now = deps.now ?? ((): Date => new Date())
  return {
    ...toolShell('answer_worker', 'Answer an open request of a dispatched worker: approve or send back its plan, or answer its question. The request id is in the glm-hourness-execute notice you received; the worker\'s held call returns your answer.', ANSWER_PARAMETERS, ANSWER_OUTPUT),
    async execute(args: unknown, exec: ToolExecutionContext): Promise<{ delivered: boolean }> {
      const { agent } = mainAgentCall(deps.isMainAgent, exec, { message: 'only the main agent answers workers', hint: deps.designPresent() ? 'answer_worker is a tool of the main agent' : '先启用 glm-hourness/design 并 /wish' })
      const dir = dirFor(deps, agent)
      const parsed = isRecord(args) ? args : {}
      const id = parsed.request
      if (typeof id !== 'string' || !REQUEST_ID.test(id)) refuse('invalid', 'request must be the id from the notice, `R-` plus six characters', 'check the notice and send the call again', 'request')
      const entry = pending.get(id)
      if (entry === undefined || entry.request.graphDir !== dir) refuse('not_found', `no open request "${id}" in this project`, 'the request may have been answered or timed out; the open ones are in the notices and the dispatch reminder')
      const request = entry.request
      const callId = exec.callId
      if (request.kind === 'question') {
        if (parsed.verdict !== undefined) refuse('invalid', 'a question request takes no verdict', 'answer with text only', 'verdict')
        const text = typeof parsed.text === 'string' ? parsed.text : ''
        if (text.length === 0 || text.length > 4000) refuse('invalid', 'text must be the answer, 1 to 4000 characters', 'write it and send the call again', 'text')
        answerRequest(id, { status: 'answered', text })
        return { delivered: true }
      }
      // A plan request (§3.3.4).
      const verdict = parsed.verdict
      if (verdict !== 'approve' && verdict !== 'revise') refuse('invalid', 'a plan request takes verdict approve or revise', 'pass the verdict from the notice', 'verdict')
      if (verdict === 'revise') {
        const text = typeof parsed.text === 'string' ? parsed.text : ''
        if (text.length === 0 || text.length > 4000) refuse('invalid', 'a revise verdict needs text: what to change, 1 to 4000 characters', 'write it and send the call again', 'text')
        answerRequest(id, { status: 'revise', version: request.version!, text })
        return { delivered: true }
      }
      // The approval: the graph may have moved since the submit, so the
      // harness re-checks everything against the graph as it is now.
      const attempt = registeredAttempt(request.childId)
      if (attempt === undefined) refuse('plan_invalid', 'the dispatch of this request has handed back already', 'the request can no longer be approved; the task can be dispatched again')
      const graph = await deps.cache.load(dir)
      const node = graph.nodes.get(request.task)
      if (node === undefined) refuse('plan_invalid', `the task "${request.task}" is not in the graph any more`, 'let the worker hand back')
      const section = readPlanSection(node.body)
      if (section === undefined || section.state !== 'pending' || section.version !== request.version || section.digest !== request.digest) {
        refuse('plan_invalid', 'the plan section on the task is not the version the worker submitted', 'the body moved under the request; answer revise, or let the worker submit again')
      }
      const plan = entry.plan
      if (plan === undefined || planDigest(plan) !== section.digest) refuse('plan_invalid', 'the submitted plan does not match the section on the task', 'answer revise instead')
      const stale = staleness(graph, attempt.pins, sha256Hex)
      if (stale.length > 0) {
        refuse('brief_stale', `the graph moved under the task since the dispatch: ${stale.map(change => `${change.id} ${change.change}`).join(', ')}`, 'a dispatch with stale pins cannot be approved; let the worker hand back and dispatch again')
      }
      const checked = checkPlan(node, plan)
      if (!checked.ok) refuse('plan_invalid', `the plan no longer passes the checks: ${checked.problems.join('; ')}`, 'answer revise instead')
      const body = approvePlanSection(node.body)
      if (body === undefined) refuse('plan_invalid', 'the plan section could not be marked approved', 'let the worker submit again')
      const engine = openEngine(dir, { now })
      const written = await writeWithRetry(async () => {
        const current = await engine.load()
        return engine.apply('harness', { op: 'edit', id: request.task, rev: current.revisions.get(request.task)!, set: { body }, reason: `主 Agent 批准计划第 ${section.version} 版（answer_worker ${id}）` })
      }).catch(() => undefined)
      if (written === undefined || !written.ok) {
        deps.report(agent.session?.id, 'degraded', `已批标记写不进任务正文（任务 ${request.task}）${written === undefined ? '' : `：${written.error.message}`}；这次派发照批过的计划走，但这份批准不会带到以后的派发`)
      }
      const comment = await engine.apply('harness', { op: 'comment', id: request.task, text: renderApprovalComment(section.version, section.digest, request.childId, callId) }).catch(() => undefined)
      if (comment === undefined || !comment.ok) {
        deps.report(agent.session?.id, 'degraded', `批准批注写不进图（任务 ${request.task}）：这份批准带不到以后的派发，worker 的这次派发不受影响`)
      }
      planRejects.delete(request.childId)
      // The registered dispatch carries the approved paths from now on
      // (§3.3.4): the write gate reads them (§3.2.1).
      updateAttempt(request.childId, { plan: 'approved', planPaths: planPathsOfSection(section.steps) })
      answerRequest(id, { status: 'approved', version: section.version })
      return { delivered: true }
    },
  }
}

