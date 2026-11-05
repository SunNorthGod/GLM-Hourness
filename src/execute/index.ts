/**
 * glm-hourness/execute row entry (M7 design 0.6 §2.1, §3.1, §2.3.2, §6.7):
 * the execution line of the orchestration package. It registers
 * `dispatch_task` for the main agent — write tasks and task reviews
 * (§3.7.1) — the worker's `submit_plan` and
 * `ask_main` and the main agent's `answer_worker` (src/execute/requests.ts),
 * runs the handback processing of every settled activation
 * (src/execute/handback.ts: the summary comment, the effective review depth
 * and the review task, the reviewer's rounds, convergence and the stop
 * draft, the module design review's record), installs the dispatched chain's
 * execution-boundary rules (src/guard/execute-rules.ts), filters every
 * agent's tool face by its role (src/execute/faces.ts), provides the
 * `glmHournessExecute` service whose `isWorker` tells M3's guard rules who a
 * dispatch carries, and reports the row health of the sessions it acts in.
 * It registers the main agent's `check_commit` (src/execute/check.ts: the
 * merge checks of §3.8.2–§3.8.3 and their records) and the check backend
 * `hourness-gate` with the `subagents` service (src/execute/
 * gate-provider.ts); without the backend a check runs inside its call and
 * the row health says so. It installs the trunk-advance check
 * (src/execute/advance.ts, §3.8.4) before the dispatched chain's rules, so
 * those stay outermost; the service's `trunkAdvanceFor` reads it (R4-F4), a
 * passing check writes the evidence a move made before it was waiting for,
 * and a review that passes after the advance completes the task with that
 * evidence.
 *
 * The seam to the loop board (§2.5, src/execute/loop-link.ts) is here: the
 * row hands its events, entries and harness actions to `glmHournessLoops`
 * when that service arrives (and again at every `agent/created`, V12), the
 * service's `runAction` runs the actions (`execute.trunk-check`,
 * `execute.stop-draft`), and the trunk, handback, review and stop events go
 * to the board through one `emit`; an entry the board did not take, or did
 * not run in five minutes, runs in the row's fallback executor, and its
 * notice waits for the holder's next step when the holder is not live.
 *
 * The drive (§3.9, src/execute/drive.ts) runs at the holder's every
 * `agent/pre-step` before the step and at `agent/created`: it hands over
 * `hourness.design-released` and `hourness.host-started`, runs
 * `execute.start-drive` and `execute.resume-drive`, resumes, blocks and
 * holds the holder's DSH goal by the table of §3.9.1, and keeps
 * `<exec>/drive.jsonl` (the start line at a project's first holder step, the
 * pause lines from `goal/changed`, the exit lines from the row's dispose).
 * The completion gate on `update_goal complete` and the batch mark after
 * `propose_to_human` and `await_human` are installed after the
 * trunk-advance check and before the chain's rules; `await_human` is the
 * main agent's tool. Without the `goals` service nothing is driven and the
 * row health says 「没有 goal 服务，不能自动推进」. `dispatch_task` with a
 * goal id dispatches the goal's acceptance review (§3.9.4). The
 * `execute.reconcile` action of `hourness.host-started` (§3.9.6) reads a
 * lost dispatch's handback back from the `hournessHandback` session
 * projection this row registers, catches up the trunk evidence through the
 * trunk-advance check's `reconcileTrunk` and reruns the interrupted
 * harness actions. The holder's agent carries the dispatch status notice
 * (src/execute/notice.ts, §3.5.4), installed at its creation or at its
 * first step as the holder.
 *
 * The row keeps the dispatch register (src/execute/attempts.ts) and the
 * revision-keyed graph cache the rules read; the graph of a project is
 * loaded by its dispatches and re-read when the revision moves. The command
 * record of a dispatched chain (§3.8.5) goes to
 * `<proj>/.llm/execute/tasks/<task>/<childId>.commands.jsonl`, with a
 * `.gitignore` of its own on the first write, like every runtime file here.
 * Activation never throws: a missing service or a failed registration warns
 * and says why in the row health. It ships disabled
 * (packages/hourness/cordis.patch.yml); the E9 verification turns it on.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { graphService } from '../graph/service.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { projectOf } from '../data/project-root.ts'
import { isMainAgentFor } from '../data/main-agent.ts'
import { rowJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentsService, AgentLike, GoalChangedPayload, InjectHost, PostExecuteListener, PreExecuteListener, ProvideHost, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { LOOPS_SERVICE, loopsService } from '../loops/service.ts'
import { EXECUTE_SERVICE, type ExecuteService } from '../shared/execute-service.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { disposerList } from '../shared/row-support.ts'
import Schema from '../shared/schemastery.ts'
import { installExecuteRules, type ExecuteRulesDeps } from '../guard/execute-rules.ts'
import { latestDispatch, registeredAttempt, recordCommunication, reviewTargetOf } from './attempts.ts'
import { createGraphCache, dispatchTool, realCommandRunner, type DispatchDeps, type GraphCache } from './dispatch.ts'
import { answerWorkerTool, askMainTool, submitPlanTool, type RequestsDeps } from './requests.ts'
import { sha256Hex } from './digest.ts'
import { handbackProjection, HANDBACK_PROJECTION, readCalls, settleHandback, startHandback, stoppedInMemory, type HandbackDeps } from './handback.ts'
import { createGit } from './git.ts'
import { faceOfRole, roleOfAgent, type FaceDeps } from './faces.ts'
import { checkCommitTool, trunkCheck, type CheckDeps } from './check.ts'
import { createLoopLink, stopDraftAction } from './loop-link.ts'
import { createDrive } from './drive.ts'
import { installDispatchNotice } from './notice.ts'
import { createGateLauncher, GATE_PROVIDER } from './gate-provider.ts'
import { installTrunkGate } from './advance.ts'
import { floorHits, parseFloor } from './floor.ts'

/** Row config: the parallel write slots. */
export interface ExecuteConfig {
  readonly slots?: number
}

/** Runtime Config schema: the parallel write slots as a setting in the DSH plugin manager. */
export const Config = Schema.object({
  slots: Schema.number().default(3).description('同时进行的写任务上限（审查与检查不占槽）。缺省 3。'),
})

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/execute'

/** The row's context: service lookup, the agent lifecycle, the tool gate, provision and injection. */
export interface ExecuteContext extends ServiceLookup, Partial<InjectHost>, Partial<ProvideHost> {
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  /** The pre-step is a decision chain: the listener installs the face, runs the drive's step and passes the decision through. */
  on(event: 'agent/pre-step', listener: (payload: { readonly agent: AgentLike, readonly messages?: readonly unknown[] }, next: () => Promise<unknown>) => Promise<unknown>): () => void
  /** Every tool result before the call settles; the trunk-advance check compares the trunk here (§3.8.4). */
  on(event: 'tools/post-execute', listener: PostExecuteListener, options?: { prepend?: boolean }): () => void
  /** Every goal change, with the live agent fused in (dsh-goal 872–877, goal-round-driver 243): the drive's journal and the completion credential. */
  on(event: 'goal/changed', listener: (payload: GoalChangedPayload) => void): () => void
}

/** What a main agent session's row health says while dispatch works. */
export const EXECUTE_ACTIVE = '主 Agent：dispatch_task 可用，派发链的写入边界规则已装上'

/** cordis plugin entry. Activation never throws. */
export function apply(ctx: ExecuteContext, config: ExecuteConfig = {}): () => void {
  const { list: disposers, drain: dispose } = disposerList()
  const slots = config.slots ?? 3
  const journal = rowJournal(name, () => dataHomes(ctx, undefined))

  let toolsNote: string | undefined = '执行行的工具要工具服务（tools）'
  let rulesNote: string | undefined
  let gateNote: string | undefined
  let trunkNote: string | undefined
  let projectionNote: string | undefined
  const health = provideRowHealth(ctx, 'execute', 'active', '已加载；派发与派发链的写入边界在本行的会话里生效')
  disposers.push(() => { health.dispose() })
  const report = (sessionId: string | undefined, state: HealthState, reason: string): void => {
    health.report(sessionId, state, reason)
  }
  const reactivate = (): void => {
    // The loop seam's notes: the board being absent is information only, the rest degrades (§2.5 point 7).
    const loopNotes = [...loopLink.notes(), ...drive.notes()]
    const notes = [toolsNote, rulesNote, gateNote, trunkNote, projectionNote, ...loopNotes.filter(note => note.degraded).map(note => note.text)].filter(note => note !== undefined)
    const info = loopNotes.filter(note => !note.degraded).map(note => note.text)
    health.reactivate(notes.length > 0 ? 'degraded' : 'active', (notes.length > 0 ? [...notes, ...info] : ['已加载；派发与派发链的写入边界在本行的会话里生效', ...info]).join('；'))
  }
  const warnOnce = (() => {
    let warned = false
    return (text: string): void => {
      if (warned) return
      warned = true
      console.warn(`${name}: ${text}`)
    }
  })()

  const isMain = (agent: { readonly id: string, readonly session?: SessionLike }): boolean => {
    // The one reader of the role (src/data/main-agent.ts); a read that came back with a note is no role for a gate that dispatches work.
    const judgement = isMainAgentFor(ctx, agent)
    return judgement.main && judgement.note === undefined
  }
  const designPresent = (): boolean => activationStateOf(ctx, 'design')
  const cache: GraphCache = createGraphCache(reason => warnOnce(reason))
  const graphDirOf: (cwd: string | undefined) => string | undefined = cwd => graphService(ctx)?.dirFor(cwd)
  const graphDirOfRoot: (root: string) => string = root => graphDirOf(root) ?? join(root, 'docs', 'graph')
  const execDir = (projectRoot: string): string => join(projectRoot, '.llm', 'execute')

  const agentsService = (): Pick<AgentsService, 'get'> | undefined => {
    const value: unknown = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    return typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function' ? value as Pick<AgentsService, 'get'> : undefined
  }

  // The command record of a dispatched chain (§3.8.5): one JSONL file per dispatch. A failed write says so, and the attempt's handback reviews at full depth.
  const record = async (task: string, childId: string, line: unknown): Promise<boolean> => {
    const root = registeredAttempt(childId)?.worktree
    const project = root !== undefined ? projectOf(root)?.root : undefined
    if (project === undefined) return false
    const dir = join(execDir(project), 'tasks', task)
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(join(execDir(project), '.gitignore'), '*\n', 'utf8').catch(() => undefined)
      await appendFile(join(dir, `${childId}.commands.jsonl`), `${JSON.stringify(line)}\n`, 'utf8')
      return true
    }
    catch {
      return false
    }
  }

  // The seam to the loop board (§2.5): the row's events go out through it, the board runs the harness actions through it, and it runs what the board does not.
  const loopLink = createLoopLink({
    lookup: ctx,
    execDir,
    graphDirOfRoot,
    cache,
    report,
    actions: {
      'execute.trunk-check': record => trunkCheck(checkDeps, record),
      'execute.stop-draft': stopDraftAction(cache, graphDirOfRoot),
      'execute.start-drive': record => drive.startDrive(record),
      'execute.resume-drive': record => drive.resumeDrive(record),
      'execute.reconcile': record => drive.reconcile(record),
    },
    notesChanged: () => { reactivate() },
  })
  disposers.push(() => { loopLink.dispose() })

  // The trunk-advance check (§3.8.4), installed below before the dispatched chain's rules; the service, the check records and the review pass read it.
  let trunkGate: ReturnType<typeof installTrunkGate> | undefined

  // The service M3's guard rules judge with (§3.2.2): who a dispatch carries, live check included; the trunk advance a running call may make (R4-F4); the loop board's runner of the row's harness actions (§2.5 point 2).
  const service: ExecuteService = {
    isWorker: (agentId) => {
      const attempt = registeredAttempt(agentId)
      return attempt !== undefined && agentsService()?.get(agentId) !== undefined
    },
    trunkAdvanceFor: callId => trunkGate?.trunkAdvanceFor(callId),
    runAction: (action, record) => loopLink.runAction(action, record),
  }
  try {
    ctx.provide?.(EXECUTE_SERVICE, service)
  }
  catch (error) {
    rulesNote = `服务 ${EXECUTE_SERVICE} 没提供上：${error instanceof Error ? error.message : String(error)}`
  }

  const dispatchDeps: DispatchDeps = {
    lookup: ctx,
    graphDir: graphDirOf,
    cache,
    isMainAgent: isMain,
    designPresent,
    slots,
    execDir,
    report,
    stoppedInMemory,
    reviewTarget: (graph, reviewTask) => reviewTargetOf(graph, reviewTask, sha256Hex),
    onHandback: (attempt, settlement) => startHandback(handbackDeps, attempt, settlement),
  }
  const dispatch = dispatchTool(dispatchDeps)

  // The handback processing (§3.6): the settled activations of this row's dispatches. A voided review round re-dispatches with the same model and reason, attached to the same main agent session (§3.7.1).
  const handbackDeps: HandbackDeps = {
    lookup: ctx,
    cache,
    execDir,
    report,
    git: createGit(),
    runCommand: realCommandRunner,
    trunkEvidence: (projectRoot, task) => trunkGate?.trunkEvidenceOf(projectRoot, task) ?? Promise.resolve(undefined),
    emit: (project, sessionId, event) => { loopLink.emit(project, sessionId, event) },
    redispatch: async (reviewTaskId, attempt) => {
      const agents = agentsService()
      const parent = attempt.parentSession === undefined || agents === undefined ? undefined : agents.get(attempt.parentSession)
      if (parent === undefined || parent.session === undefined) return false
      try {
        await dispatchTool(dispatchDeps).execute(
          { id: reviewTaskId, model: attempt.model, why: attempt.why, ...(attempt.depth === undefined ? {} : { depth: attempt.depth }) },
          { callId: `redispatch-${attempt.childId}`, signal: new AbortController().signal, agent: parent as unknown as AgentLike, deferContext: () => {}, concludeTurn: () => {} },
        )
        return true
      }
      catch {
        return false
      }
    },
  }

  // The plan and communication tools (§3.3, §3.4): the worker's two and the main agent's one.
  const requestDeps: RequestsDeps = {
    lookup: ctx,
    graphDir: graphDirOf,
    cache,
    isMainAgent: isMain,
    designPresent,
    report,
  }
  const requestTools = [submitPlanTool(requestDeps), askMainTool(requestDeps), answerWorkerTool(requestDeps)]

  // The merge checks (§3.8.2–§3.8.3): check_commit, its jobs on the check backend; a pass writes the evidence an earlier unchecked move waits for.
  const launcher = createGateLauncher()
  const checkDeps: CheckDeps = {
    lookup: ctx,
    cache,
    graphDirOf,
    execDir,
    isMain,
    report,
    git: createGit(),
    launcher,
    onPassed: (project, commit, _record, sessionId) => trunkGate?.checkedAfter(project, commit, sessionId) ?? Promise.resolve(),
    emit: (project, sessionId, event) => { loopLink.emit(project, sessionId, event) },
  }

  // The drive (§3.9): the holder's goal started on a release, resumed and held by the table of §3.9.1, the completion gate, await_human, the batch marks and the reconcile after a restart (§3.9.6).
  const drive = createDrive({
    lookup: ctx,
    cache,
    graphDirOf,
    graphDirOfRoot,
    execDir,
    git: createGit(),
    isMain,
    report,
    emit: (project, sessionId, event) => { loopLink.emit(project, sessionId, event) },
    journal: violation => { void journal.violation(violation) },
    boardAttached: () => loopLink.boardAttached(),
    runningChecks: () => launcher.running(),
    notesChanged: () => { reactivate() },
    handback: (attempt, settlement) => settleHandback(handbackDeps, attempt, settlement),
    reconcileTrunk: (project, sessionId) => trunkGate?.reconcileTrunk(project, sessionId) ?? Promise.resolve(0),
    replayInterrupted: project => loopLink.replayInterrupted(project),
  })
  disposers.push(() => { drive.dispose() })
  const tools = [dispatch, ...requestTools, checkCommitTool(checkDeps), drive.awaitHuman]

  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['tools'], toolsCtx => {
        const undos: (() => void)[] = []
        try {
          for (const tool of tools) undos.push(toolsCtx.tools.register(tool))
          toolsNote = undefined
          reactivate()
        }
        catch (error) {
          for (const undo of undos.splice(0)) undo()
          toolsNote = `执行行的工具没注册上：${error instanceof Error ? error.message : String(error)}`
          reactivate()
          return undefined
        }
        return () => {
          for (const undo of undos.splice(0)) undo()
          toolsNote = '执行行的工具要工具服务（tools）'
          reactivate()
        }
      })
    }
    catch (error) {
      toolsNote = `执行行的工具没注册上：${error instanceof Error ? error.message : String(error)}`
    }
  }
  else toolsNote = '宿主没有 inject，执行行的工具拿不到工具服务'

  // The check backend (§3.8.2): registered with subagents once it is there; a failed registration runs the checks inside their calls (U2).
  if (typeof ctx.inject === 'function') {
    const gateFailed = (error: unknown): void => {
      gateNote = `检查以同步方式运行：检查后端 ${GATE_PROVIDER} 没注册上（${error instanceof Error ? error.message : String(error)}）`
    }
    try {
      ctx.inject(['subagents'], subagentsCtx => {
        try {
          const undo = launcher.attach(subagentsCtx.subagents)
          gateNote = undefined
          reactivate()
          return undo
        }
        catch (error) {
          gateFailed(error)
          reactivate()
          return undefined
        }
      })
    }
    catch (error) {
      gateFailed(error)
    }
  }

  // The handback projection (§3.9.6 step 3): what the reconcile reads back of a dispatch the host lost. Without it a lost dispatch is commented lost.
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['sessionProjections'], (projectionCtx) => {
        try {
          const undo = projectionCtx.sessionProjections.register(handbackProjection)
          projectionNote = undefined
          reactivate()
          return undo
        }
        catch (error) {
          projectionNote = `会话投影 ${HANDBACK_PROJECTION} 没注册上（${error instanceof Error ? error.message : String(error)}）：宿主重启时丢的交回读不回来，只记为丢失`
          reactivate()
          return undefined
        }
      })
    }
    catch (error) {
      projectionNote = `会话投影 ${HANDBACK_PROJECTION} 没注册上（${error instanceof Error ? error.message : String(error)}）：宿主重启时丢的交回读不回来，只记为丢失`
    }
  }

  // The hand-over to the loop board (§2.5 point 1): when its service arrives, withdrawn when it leaves. `InjectableServices` lists only the host's own services, so the name goes in as a string (the metrics row does the same).
  if (typeof ctx.inject === 'function') {
    const injectLoops = ctx.inject as unknown as (names: readonly string[], callback: (sub: ServiceLookup & { readonly glmHournessLoops?: unknown }) => (() => void) | void) => unknown
    try {
      injectLoops([LOOPS_SERVICE], (sub) => {
        const value = sub.glmHournessLoops ?? (typeof sub.get === 'function' ? sub.get(LOOPS_SERVICE) : undefined)
        let problem: string | undefined
        const found = loopsService({ get: () => value }, (message) => { problem = message })
        return loopLink.attach(found, problem)
      })
    }
    catch (error) {
      console.warn(`${name}: the loop board is not waited for; the row runs its own entries: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Who a delegated caller works for, its effective directory, the violation journal: the chain's rules and the trunk-advance check share them.
  const owning: ExecuteRulesDeps['owning'] = (caller) => {
    const agents = agentsService()
    if (agents === undefined) return undefined
    let header = caller.session.header
    for (;;) {
      const up = header.parentSession
      if (up === undefined) return undefined
      const attempt = registeredAttempt(up)
      if (attempt !== undefined) return attempt
      const parent = agents.get(up)
      if (parent === undefined || parent.session === undefined) return undefined
      header = parent.session.header
      if (header.origin !== 'subagent') return undefined
    }
  }
  const effectiveDir: ExecuteRulesDeps['effectiveDir'] = (session) => {
    const value: unknown = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
    const get = (value as { get?: (s: SessionLike) => string } | undefined)?.get
    if (typeof get !== 'function') return session.header.cwd
    try {
      return get.call(value, session)
    }
    catch {
      return session.header.cwd
    }
  }
  const journalViolation: ExecuteRulesDeps['journal'] = violation => { void journal.violation(violation) }

  // Whether a trailer task's latest dispatch's command record hit a commands or outside line of the floor (§3.8.4).
  const taskHit = async (project: string, graph: LoadedGraph, task: string): Promise<boolean> => {
    const node = graph.nodes.get(task)
    const dispatched = node === undefined ? undefined : latestDispatch(node)
    if (dispatched === undefined) return false
    const calls = await readCalls(join(execDir(project), 'tasks', task, `${dispatched.childId}.commands.jsonl`))
    return floorHits(parseFloor(graph.nodes.get('norm-review-floor')), { paths: [], deleted: [] }, calls, join(project, '.worktrees', `hz-${task}`)).length > 0
  }

  // The trunk-advance check (§3.8.4), prepend, installed before the chain's rules so those stay outermost (worker-git answers a worker's trunk move first).
  try {
    trunkGate = installTrunkGate(ctx, {
      lookup: ctx,
      register: registeredAttempt,
      owning,
      effectiveDir,
      journal: journalViolation,
      git: createGit(),
      cache,
      graphDirOfRoot,
      execDir,
      isMain,
      report,
      taskHit,
      onTrunkEvent: (project, _trunk, event, sessionId) => { loopLink.emit(project, sessionId, event) },
    })
    const installed = trunkGate
    disposers.push(() => {
      installed.dispose()
      if (trunkGate === installed) trunkGate = undefined
    })
  }
  catch (error) {
    trunkNote = `主干前进的核对没装上：${error instanceof Error ? error.message : String(error)}`
  }

  // The completion gate (§3.9.3) and the batch mark (§3.9.7), prepend, after the trunk-advance check and before the chain's rules, so those stay outermost.
  try {
    disposers.push(ctx.on('tools/pre-execute', drive.completionGate, { prepend: true }))
    disposers.push(ctx.on('tools/post-execute', drive.batchMark, { prepend: true }))
  }
  catch (error) {
    rulesNote = `完成门禁没装上：${error instanceof Error ? error.message : String(error)}`
  }
  try {
    disposers.push(ctx.on('goal/changed', (payload) => { void drive.onGoalChanged(payload) }))
  }
  catch (error) {
    console.warn(`${name}: goal/changed is not listened to; the drive keeps no pause line and no completion credential is paired: ${error instanceof Error ? error.message : String(error)}`)
  }

  // The dispatched chain's execution-boundary rules (§3.2), prepend.
  try {
    disposers.push(installExecuteRules(ctx, {
      lookup: ctx,
      register: registeredAttempt,
      owning,
      live: agentId => agentsService()?.get(agentId) !== undefined,
      graphOf: projectRoot => cache.get(graphDirOfRoot(projectRoot)),
      journal: journalViolation,
      report,
      record,
      effectiveDir,
      recordIncoming: childId => recordCommunication(childId, 'incoming'),
    }))
  }
  catch (error) {
    rulesNote = `派发链的写入边界规则没装上：${error instanceof Error ? error.message : String(error)}`
  }
  reactivate()

  // The face filter (§2.3.2): agent-scoped, without prepend — inside the dialect's and tool search's listeners, which see the filtered face.
  const faceDeps: FaceDeps = {
    isMainAgent: isMain,
    register: registeredAttempt,
    agents: agentsService,
    report: (agentId, state, reason) => { health.report(agentId, state, reason) },
  }
  // The dispatch status notice (§3.5.4, src/execute/notice.ts): on the holder's agent, at its creation or its first step as the holder.
  const noticed = new WeakSet<AgentLike>()
  const installNotice = (agent: AgentLike): void => {
    if (noticed.has(agent) || agent.session === undefined || !isMain(agent)) return
    noticed.add(agent)
    const uninstall = installDispatchNotice(agent, { lookup: ctx, cache, graphDirOf, isMain, drive: session => drive.status(session), report })
    if (uninstall !== undefined) disposers.push(uninstall)
  }
  const installed = new WeakSet<AgentLike>()
  const installFace = (agent: AgentLike): void => {
    if (installed.has(agent)) return
    installed.add(agent)
    disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembled = await next()
      const role = roleOfAgent(faceDeps, agent)
      const tools = faceOfRole(assembled.tools, role)
      return tools === assembled.tools ? assembled : { ...assembled, tools: [...tools] }
    }))
  }
  /** The face filter and the dispatch status notice of one agent; neither failure stops the other. */
  const installOn = (agent: AgentLike): void => {
    try {
      installFace(agent)
    }
    catch (error) {
      console.warn(`${name}: the face filter is not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      installNotice(agent)
    }
    catch (error) {
      console.warn(`${name}: the dispatch status notice is not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    disposers.push(ctx.on('agent/created', ({ agent }) => {
      installOn(agent)
      const session = agent.session
      if (session !== undefined && isMain(agent)) report(sessionIdOf(agent), 'active', EXECUTE_ACTIVE)
      // Where inject does not reach a service of this package (V12), the hand-over rides agent creation; the same service keeps the standing one.
      let problem: string | undefined
      const loops = loopsService(ctx, (message) => { problem = message })
      if (loops !== undefined || problem !== undefined) loopLink.attach(loops, problem)
      // The holder created or restored hands over hourness.host-started; a former holder's drive goal goes (§3.9.1).
      return drive.onCreated(agent)
    }))
  }
  catch (error) {
    console.warn(`${name}: agent/created is not listened to; faces follow new agents only: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    // A session that was open before this row activated gets the filter at its first step.
    disposers.push(ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
      installOn(agent)
      // The loop notices kept while the holder was not live go out at its next step (§2.5 point 6).
      loopLink.flushHeld(sessionIdOf(agent))
      // The drive's goal operations land before the step (§3.9.1, U12).
      await drive.onStep(agent, messages ?? [])
      return next()
    }))
  }
  catch (error) {
    console.warn(`${name}: agent/pre-step is not listened to; faces follow new agents only: ${error instanceof Error ? error.message : String(error)}`)
  }

  return dispose
}

/** Whether the design row is loaded (its health view answers). */
function activationStateOf(ctx: ServiceLookup, row: 'design'): boolean {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(`glmHournessHealth/${row}`) : undefined
  if (typeof value !== 'object' || value === null) return false
  const view = value as { activation?: () => { readonly state: string } }
  return typeof view.activation === 'function' && view.activation().state !== 'absent'
}
