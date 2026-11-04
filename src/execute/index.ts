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
 * The gate provider, the drive and the loop-board seam arrive with E7–E8 on
 * this same entry.
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
import { projectOf } from '../data/project-root.ts'
import { isMainAgentFor } from '../data/main-agent.ts'
import { rowJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentsService, AgentLike, InjectHost, PreExecuteListener, ProvideHost, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { EXECUTE_SERVICE, type ExecuteService } from '../shared/execute-service.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { disposerList } from '../shared/row-support.ts'
import Schema from '../shared/schemastery.ts'
import { installExecuteRules } from '../guard/execute-rules.ts'
import { registeredAttempt, recordCommunication, reviewTargetOf } from './attempts.ts'
import { createGraphCache, dispatchTool, realCommandRunner, type DispatchDeps, type GraphCache } from './dispatch.ts'
import { answerWorkerTool, askMainTool, submitPlanTool, type RequestsDeps } from './requests.ts'
import { sha256Hex } from './digest.ts'
import { startHandback, stoppedInMemory, type HandbackDeps } from './handback.ts'
import { createGit } from './git.ts'
import { faceOfRole, roleOfAgent, type FaceDeps } from './faces.ts'

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
  /** The pre-step is a decision chain: the listener installs the face and passes the decision through. */
  on(event: 'agent/pre-step', listener: (payload: { readonly agent: AgentLike }, next: () => Promise<unknown>) => Promise<unknown>): () => void
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
  const health = provideRowHealth(ctx, 'execute', 'active', '已加载；派发与派发链的写入边界在本行的会话里生效')
  disposers.push(() => { health.dispose() })
  const report = (sessionId: string | undefined, state: HealthState, reason: string): void => {
    health.report(sessionId, state, reason)
  }
  const reactivate = (): void => {
    const notes = [toolsNote, rulesNote].filter(note => note !== undefined)
    health.reactivate(notes.length > 0 ? 'degraded' : 'active', notes.length > 0 ? notes.join('；') : '已加载；派发与派发链的写入边界在本行的会话里生效')
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

  // The service M3's guard rules judge with (§3.2.2): who a dispatch carries, live check included.
  const service: ExecuteService = {
    isWorker: (agentId) => {
      const attempt = registeredAttempt(agentId)
      return attempt !== undefined && agentsService()?.get(agentId) !== undefined
    },
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
  const tools = [dispatch, ...requestTools]

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

  // The dispatched chain's execution-boundary rules (§3.2), prepend.
  try {
    disposers.push(installExecuteRules(ctx, {
      lookup: ctx,
      register: registeredAttempt,
      owning: (caller) => {
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
      },
      live: agentId => agentsService()?.get(agentId) !== undefined,
      graphOf: projectRoot => cache.get(graphDirOfRoot(projectRoot)),
      journal: violation => { void journal.violation(violation) },
      report,
      record,
      effectiveDir: session => {
        const value: unknown = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
        const get = (value as { get?: (s: SessionLike) => string } | undefined)?.get
        if (typeof get !== 'function') return session.header.cwd
        try {
          return get.call(value, session)
        }
        catch {
          return session.header.cwd
        }
      },
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
  try {
    disposers.push(ctx.on('agent/created', ({ agent }) => {
      try {
        installFace(agent)
      }
      catch (error) {
        console.warn(`${name}: the face filter is not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const session = agent.session
      if (session !== undefined && isMain(agent)) report(sessionIdOf(agent), 'active', EXECUTE_ACTIVE)
    }))
  }
  catch (error) {
    console.warn(`${name}: agent/created is not listened to; faces follow new agents only: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    // A session that was open before this row activated gets the filter at its first step.
    disposers.push(ctx.on('agent/pre-step', async ({ agent }, next) => {
      try {
        installFace(agent)
      }
      catch (error) {
        console.warn(`${name}: the face filter is not installed for agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
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
