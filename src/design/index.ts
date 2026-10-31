/**
 * glm-hourness/design row entry (docs/ORCHESTRATION.md §3.1, §3.5): main
 * agent mode. `/wish` makes one session per project the main agent, the
 * person's one conversation with the project (decision d-one-main-agent).
 * From the next step on, that session's system prompt carries the identity
 * section `hourness:main-agent` (identity.ts) and its tool face has no
 * tool that writes files and no ask_user_question (role-face.ts). Every
 * other session, and every delegated child, is unchanged.
 *
 * Who is the main agent: the session projection of /wish (mode.ts) says
 * what a session was told, the holder record under the DSH user directory
 * (src/graph/main-agent-holder.ts) says which session of the project holds
 * the role; mode.ts `roleOf` combines them. When the role moves, the
 * session that lost it is told to leave main agent mode by a /wish off the
 * row runs for it, as soon as that session is idle. A record naming a
 * session whose /wish did not take effect (cancelled after it claimed the
 * record, or cut off by a crash) is deleted by the first of these to find
 * out: the session's own next read of its role (cancelled), its creation
 * (crash), or another session's /wish (which takes the role over).
 *
 * Both assembly listeners are installed per agent by `installAgentHooks`,
 * at agent creation and again by /wish itself, because an idle agent that
 * /wish wakes assembles its first step before the command returns, and the
 * row's agent/created listener may not have run for it. Activation never
 * throws: a missing service or a failed registration warns and says why in
 * the row health. It ships disabled (packages/hourness/cordis.patch.yml).
 */
import { statSync } from 'node:fs'
import { holderFile, holderHome, projectKey, readHolder, releaseHolder } from '../graph/main-agent-holder.ts'
import { graphService } from '../graph/service.ts'
import { installMainAgentRules } from '../guard/main-agent.ts'
import { insertHournessSection } from '../guard/sections.ts'
import { rowJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import { dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import { createUserNotice, type AgentLike, type CommandDefinitionLike, type CommandsExecutor, type DesignAgentLike, type DesignAgentsService, type DesignInvocationLike, type InjectHost, type PreExecuteListener, type ProvideHost, type ServiceLookup, type SessionLike, type SessionPersistenceLike, type SessionProjectionsService } from '../shared/dsh-min.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import { MAIN_AGENT_IDENTITY, MAIN_AGENT_SECTION } from './identity.ts'
import { mainAgentProjection, modeOf, roleOf, staleRecordKept, wishHandler, type RoleDeps, type RoleReading, type WishDeps } from './mode.ts'
import { mainAgentFace } from './role-face.ts'
import { HIDDEN_FROM_MAIN_AGENT } from './talk.ts'

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/design'
export const inject = ['commands']

/** The command name; its definition id is `dsh-glm-hourness/wish`. */
export const WISH_COMMAND = 'wish'

/** The row's context: the commands service (register and run), the agent lifecycle event, the tool gate, optional lookup, injection and provision. */
export interface DesignContext extends ServiceLookup, Partial<InjectHost>, Partial<ProvideHost> {
  readonly commands: CommandsExecutor & { register(definition: CommandDefinitionLike<DesignInvocationLike>): () => void }
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

/** What the row says while the session state service has not arrived. */
export const WAITING_STATE = '主 Agent 模式要会话状态服务（sessionProjections）'

/** What a main agent session's row health says when nothing is wrong. */
export const MAIN_AGENT_ACTIVE = '主 Agent：身份节已加上，写文件的工具和 ask_user_question 已从工具面去掉'

/** What a session's row health says after it stopped being the main agent. */
export const MAIN_AGENT_INACTIVE = '这个会话现在不是主 Agent：用 /wish 开启'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A service from the cordis store that has all the named functions, else undefined. */
function service<T>(ctx: ServiceLookup, serviceName: string, members: readonly string[]): T | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(serviceName) : undefined
  if (typeof value !== 'object' || value === null) return undefined
  return members.every(member => typeof (value as Record<string, unknown>)[member] === 'function') ? value as T : undefined
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory()
  }
  catch {
    return false
  }
}

/** cordis plugin entry: register /wish and the main agent projection, keep the role consistent. Activation never throws. */
export function apply(ctx: DesignContext): () => void {
  const disposers: Array<() => void> = []
  const dispose = (): void => {
    for (const undo of disposers.splice(0).reverse()) undo()
  }
  const problem = dialectWarner('design')
  let projections: SessionProjectionsService | undefined
  let waiting: string | undefined = WAITING_STATE
  let registration: string | undefined
  // Why the execution-boundary rules of the main agent are not installed (docs/ORCHESTRATION.md §6.1).
  let boundary: string | undefined

  const status = (): [HealthState, string] => [
    registration !== undefined ? 'inactive' : waiting === undefined && boundary === undefined ? 'active' : 'degraded',
    [registration ?? `命令 /${WISH_COMMAND} 已注册`, waiting ?? '会话状态服务已就绪', ...boundary === undefined ? [] : [boundary]].join('；'),
  ]
  const health = provideRowHealth(ctx, 'design', ...status())
  disposers.push(() => { health.dispose() })

  // Warned once per row process: a state that cannot be read tends to repeat on every step.
  let warnedRead = false
  const warnRead = (text: string): void => {
    if (warnedRead) return
    warnedRead = true
    console.warn(`${name}: ${text}`)
  }

  // The project of a session is its graph directory; the record file is fixed by it and the user directory.
  const projects = new WeakMap<SessionLike, { readonly key: string, readonly file: string }>()
  const projectOfSession = (session: SessionLike): { readonly key: string, readonly file: string } | undefined => {
    const known = projects.get(session)
    if (known !== undefined) return known
    const dir = graphService(ctx)?.dirFor(session.header.cwd)
    if (dir === undefined) return undefined
    const key = projectKey(dir)
    const project = { key, file: holderFile(holderHome(ctx), key) }
    projects.set(session, project)
    return project
  }

  const role: RoleDeps = {
    projections: () => projections,
    holder: (session) => {
      const project = projectOfSession(session)
      return project === undefined ? undefined : readHolder(project.file)
    },
    release: (session) => {
      const project = projectOfSession(session)
      return project !== undefined && releaseHolder(project.file, session.id)
    },
    report: (session, state, reason) => { health.report(session.id, state, reason) },
    warn: warnRead,
  }

  /** Whether the holder record of the session's project names another session; undefined when it names none or cannot be read. */
  const heldElsewhere = (session: SessionLike): boolean | undefined => {
    const holder = role.holder(session)
    return holder?.kind === 'held' ? holder.record.sessionId !== session.id : undefined
  }

  const agents = (): DesignAgentsService | undefined => service<DesignAgentsService>(ctx, 'agents', ['get', 'roots'])

  let reportedOffFailure = false
  /** A session could not be made to leave main agent mode: warned once, and shown in that session's row health. */
  const leaveFailed = (agentId: string, why: string): void => {
    const text = `没能让会话 ${agentId} 退出主 Agent：${why}`
    if (!reportedOffFailure) {
      reportedOffFailure = true
      console.warn(`${name}: ${text}`)
    }
    health.report(agentId, 'degraded', text)
  }
  /** Run `/wish off` for a session as the person would. */
  async function leaveRole(agent: DesignAgentLike): Promise<void> {
    const failed = (why: string): void => { leaveFailed(agent.id, why) }
    try {
      const run = await ctx.commands.execute(agent, `/${WISH_COMMAND} off`, [], AbortSignal.timeout(10_000))
      if (run === undefined) failed('/wish 在那个会话里没有注册')
      else if (run.result.kind === 'error') failed(run.result.text)
    }
    catch (error) {
      failed(message(error))
    }
  }

  /** Delete the record that names a session which is not the main agent; a record that stays is shown in that session's health. */
  const releaseStale = (session: SessionLike): void => {
    try {
      role.release(session)
    }
    catch (error) {
      health.report(session.id, 'degraded', staleRecordKept(message(error)))
    }
  }

  /** Who the agent is for one assembly step; a read that fails counts as an ordinary session for that step, warned once (an assembly listener that throws would break the agent's step). */
  const roleForStep = (agent: AgentLike): RoleReading => {
    try {
      return roleOf(role, agent)
    }
    catch (error) {
      warnRead(`the main agent role of a session cannot be read, so it counts as an ordinary session: ${message(error)}`)
      return { main: false, problems: [`读不到主 Agent 的状态（${message(error)}），这一步当作普通会话`] }
    }
  }

  const installed = new WeakSet<AgentLike>()
  // One assembly step of an agent as our two listeners see it: who the agent is, read once at the start by the identity listener (outermost of ours), and the problems of the step. The tool face listener (inside every prepended listener) reads the same role and adds its problems; the identity listener reports once when the step is over, so a later "in effect" never covers an earlier problem and the pending state of /wish is consumed by one reader only.
  const steps = new WeakMap<AgentLike, { readonly role: RoleReading, readonly problems: string[] }>()
  // Sessions this row has reported as a main agent: when one stops being it, the report must not go on saying so.
  const reportedMain = new WeakSet<SessionLike>()
  /** The identity section and the tool face of the main agent, on this agent's own assembly. */
  function installAgentHooks(agent: AgentLike): void {
    if (installed.has(agent)) return
    installed.add(agent)
    // Prepend, like the guard's declaration: the section lands before glm:guard whichever listener is outermost.
    disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const reading = roleForStep(agent)
      const step = { role: reading, problems: [...reading.problems] }
      steps.set(agent, step)
      let assembled
      try {
        assembled = await next()
      }
      finally {
        steps.delete(agent)
      }
      const session = agent.session
      const said = step.problems.join('；')
      if (!reading.main) {
        if (step.problems.length > 0) health.report(sessionIdOf(agent), 'degraded', said)
        else if (session !== undefined && reportedMain.delete(session)) health.report(session.id, 'inactive', MAIN_AGENT_INACTIVE)
        return assembled
      }
      if (session !== undefined) reportedMain.add(session)
      health.report(sessionIdOf(agent), step.problems.length > 0 ? 'degraded' : 'active', step.problems.length > 0 ? said : MAIN_AGENT_ACTIVE)
      return { ...assembled, sections: insertHournessSection(assembled.sections, { name: MAIN_AGENT_SECTION, text: MAIN_AGENT_IDENTITY, interpolate: false }) }
    }, { prepend: true }))
    // Not prepend: inside every prepended listener, so the dialect's and tool search's listeners already see the face without the tools.
    disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembled = await next()
      const step = steps.get(agent)
      if (!(step?.role ?? roleForStep(agent)).main) return assembled
      const dialect = dialectService(ctx, problem)
      const face = mainAgentFace(assembled.tools, tool => toNativeTool(dialect, tool, problem))
      for (const why of face.problems) {
        if (step === undefined) health.report(sessionIdOf(agent), 'degraded', why)
        else step.problems.push(why)
      }
      return { ...assembled, tools: face.tools }
    }))
  }

  /**
   * A session that was a main agent when it was saved or forked, while another session holds the role now,
   * is told to leave it. Not awaited: agent/created is awaited serially before the agent finishes creation.
   * The agent is asked again when it is idle, because the person may have moved the role back meanwhile.
   * A session whose log has no finished /wish that turned the mode on, while the record names it, is a
   * /wish cut off after it claimed the record (a crash before command/done reached the disk): the record is deleted.
   */
  function alignOnCreation(agent: AgentLike): void {
    const session = agent.session
    if (session === undefined || session.header.origin === 'subagent') return
    const mode = modeOf(projections, session)
    if (!mode.active) {
      // With no session state service or an unreadable state the mode is unknown, not off.
      if (projections !== undefined && mode.error === undefined && heldElsewhere(session) === false) releaseStale(session)
      return
    }
    if (heldElsewhere(session) !== true) return
    const idle = (agent as Partial<DesignAgentLike>).whenIdle
    const leaveIfStillElsewhere = (): Promise<void> => heldElsewhere(session) === true && modeOf(projections, session).active ? leaveRole(agent as DesignAgentLike) : Promise.resolve()
    void (typeof idle === 'function' ? idle.call(agent) : Promise.resolve()).then(leaveIfStillElsewhere).catch((error: unknown) => { leaveFailed(agent.id, message(error)) })
  }

  const wish: WishDeps = {
    role,
    graph: () => graphService(ctx),
    dirExists: isDirectory,
    userHome: () => holderHome(ctx),
    agents,
    persistence: () => service<SessionPersistenceLike>(ctx, 'sessionPersistence', ['list']),
    titleOf: (session) => {
      try {
        const title = projections?.stateOf(session, 'title')
        return typeof title === 'string' && title.length > 0 ? title : undefined
      }
      catch {
        return undefined
      }
    },
    installHooks: (agent) => {
      try {
        installAgentHooks(agent)
      }
      catch (error) {
        console.warn(`${name}: the main agent hooks are not installed for agent ${agent.id}: ${message(error)}`)
        health.report(agent.id, 'degraded', `身份节和工具面没装上：${message(error)}`)
      }
    },
    demoteOthers: async (key, except) => {
      const registry = agents()
      if (registry === undefined) {
        health.report(except, 'degraded', '拿不到会话登记（agents 服务），别的会话没有退出主 Agent')
        return
      }
      for (const other of registry.roots()) {
        const session = other.session
        if (session.id === except || session.header.origin === 'subagent' || projectOfSession(session)?.key !== key || !modeOf(projections, session).active) continue
        await leaveRole(other)
      }
    },
    now: () => new Date(),
  }

  try {
    disposers.push(ctx.commands.register({
      definitionId: 'dsh-glm-hourness/wish',
      name: WISH_COMMAND,
      description: '让这个会话的 agent 当这个项目的主 Agent（项目经理）：按项目图推进，不写文件；后面跟一句话就从许愿开始；here 把主 Agent 从别的会话移过来，后面也可以跟一句话；/wish off 退出',
      input: { hint: 'off | here [一句话] | 一句话' },
      handler: wishHandler(wish),
    }))
  }
  catch (error) {
    // Without /wish nothing can turn main agent mode on, so the row does nothing else.
    console.warn(`${name}: registering /${WISH_COMMAND} failed, main agent mode cannot be turned on: ${message(error)}`)
    registration = `/${WISH_COMMAND} 注册失败：${message(error)}`
    health.reactivate(...status())
    return dispose
  }

  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['sessionProjections'], projectionCtx => {
        try {
          projectionCtx.sessionProjections.register(mainAgentProjection)
        }
        catch (error) {
          console.warn(`${name}: the main agent projection is off: ${message(error)}`)
          waiting = `主 Agent 状态注册失败：${message(error)}`
          health.reactivate(...status())
          return undefined
        }
        projections = projectionCtx.sessionProjections
        waiting = undefined
        health.reactivate(...status())
        return () => {
          projections = undefined
          waiting = WAITING_STATE
          health.reactivate(...status())
        }
      })
    }
    catch (error) {
      console.warn(`${name}: the main agent projection is off: ${message(error)}`)
      waiting = `主 Agent 状态没注册上：${message(error)}`
    }
  }
  else waiting = '宿主没有 inject，会话状态服务拿不到，/wish 用不了'

  // The main agent has no tool that writes files, but the runtime executes by name: the rules deny a write, a question card and a git command that cannot be saved first (src/guard/main-agent.ts).
  try {
    const journal = rowJournal(name, () => dataHomes(ctx, undefined))
    disposers.push(installMainAgentRules(ctx, {
      isMainAgent: (agent) => {
        const reading = roleOf(role, agent)
        if (reading.problems.length > 0 && agent.session !== undefined) health.report(agent.session.id, 'degraded', reading.problems.join('；'))
        return reading.main
      },
      hiddenTools: HIDDEN_FROM_MAIN_AGENT,
      journal: (record) => { void journal.violation(record) },
      report: (agent, state, reason) => { health.report(sessionIdOf(agent), state, reason) },
      tell: (agent, notice) => {
        const live = agents()?.get(agent.id)
        if (live === undefined) return false
        live.inject(createUserNotice(notice.kind, notice.summary, notice.text))
        return true
      },
    }))
  }
  catch (error) {
    console.warn(`${name}: the main agent's execution rules are not installed, so a write by name is not stopped: ${message(error)}`)
    boundary = `主 Agent 的执行边界规则没装上：${message(error)}`
  }
  health.reactivate(...status())

  try {
    disposers.push(ctx.on('agent/created', ({ agent }) => {
      try {
        installAgentHooks(agent)
      }
      catch (error) {
        // One agent's hooks must never break agent creation; /wish installs them again.
        console.warn(`${name}: the main agent hooks are not installed for agent ${agent.id}: ${message(error)}`)
      }
      try {
        alignOnCreation(agent)
      }
      catch (error) {
        // Reading the holder record must not break agent creation either.
        warnRead(`the holder of a new session's project cannot be read, so the session is not checked for a role it lost: ${message(error)}`)
        health.report(agent.id, 'degraded', `没能检查这个会话是不是还是主 Agent：${message(error)}`)
      }
    }))
  }
  catch (error) {
    console.warn(`${name}: agent/created is not listened to; /wish installs the hooks itself: ${message(error)}`)
  }

  return dispose
}
