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
 * session whose /wish did not take effect is deleted by the first of these
 * to find out: the handler itself when the /wish errors after it wrote the
 * record (released before the error is returned; a failed release is that
 * session's degraded health), the session's own next read of its role
 * (cancelled), its creation (crash), or another session's /wish (which
 * takes the role over).
 *
 * The person's persona (the row's `persona` setting, persona.ts) is a system
 * prompt section for the main agent only. The tool face listener, the inner
 * one, adds it, so the dialect's listener sees the section and places it
 * whichever way round the two rows were installed. A session that is not the
 * main agent, a delegated child included, never gets it.
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
import { graphFocus, graphService } from '../graph/service.ts'
import { installMainAgentRules, type BypassAlert } from '../guard/main-agent.ts'
import { insertHournessSection } from '../guard/sections.ts'
import { projectJournal } from '../memory/audit.ts'
import { projectHomeFor } from '../data/project-home.ts'
import { dialectService, dialectWarner, toNativeTool } from '../shared/dialect.ts'
import { createUserNotice, type AgentLike, type CommandDefinitionLike, type CommandsExecutor, type DesignAgentLike, type DesignAgentsService, type DesignInvocationLike, type InjectHost, type PreExecuteListener, type ProvideHost, type ServiceLookup, type SessionLike, type SessionPersistenceLike, type SessionProjectionsService } from '../shared/dsh-min.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import Schema from '../shared/schemastery.ts'
import { ATTACH_BOARDS } from './attach.ts'
import { MAIN_AGENT_IDENTITY, MAIN_AGENT_SECTION } from './identity.ts'
import { emitMetric } from './metrics.ts'
import { localTime, mainAgentProjection, modeOf, roleOf, staleRecordKept, wishHandler, type RoleDeps, type RoleReading, type WishDeps } from './mode.ts'
import { DEFAULT_PERSONA_NAME, PERSONA_NAME_LIMIT, PERSONA_TEXT_LIMIT, readPersona } from './persona.ts'
import { proposeTool, type DesignToolDeps } from './propose.ts'
import { recordTool } from './record.ts'
import { mainAgentFace, ordinaryFace } from './role-face.ts'
import { installStageNotice } from './stage-notice.ts'
import { HIDDEN_FROM_MAIN_AGENT, TALK_PROJECTION, parseTalkState, personSaid, talkApply, talkFold, talkInit, type TalkState } from './talk.ts'

/** Row config: the persona of the main agent (persona.ts) and the project directory (workspace `.llm`) for the violation journal; defaults to the calling session's project. */
export interface DesignConfig {
  readonly persona?: { readonly name?: string, readonly text?: string }
  readonly home?: string | undefined
}

/** Runtime Config schema: the persona of the main agent as settings in the DSH plugin manager. Empty `text` adds nothing. */
export const Config = Schema.object({
  persona: Schema.object({
    name: Schema.string().default(DEFAULT_PERSONA_NAME).description(`人设的名字，一行，至多 ${PERSONA_NAME_LIMIT} 个字，超出的截掉。缺省为「${DEFAULT_PERSONA_NAME}」。`),
    text: Schema.string().role('textarea').default('').description(`主 Agent 跟你说话的人设：语气、称呼、自称等，至多 ${PERSONA_TEXT_LIMIT} 个字。只作用于主 Agent 回给你的话，子 agent 和别的会话不带；留空就不加人设。`),
  }).description('主 Agent 的人设。插件不带人设内容，写什么是你自己的配置。'),
})

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

/** The projection of what the human said and was shown (src/design/talk.ts), for the session state service. */
const talkProjection = { key: TALK_PROJECTION, stateVersion: 1, stateSchema: { parse: parseTalkState }, init: talkInit, apply: talkApply } as const

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
export function apply(ctx: DesignContext, config: DesignConfig = {}): () => void {
  const disposers: Array<() => void> = []
  const dispose = (): void => {
    for (const undo of disposers.splice(0).reverse()) undo()
  }
  const problem = dialectWarner('design')
  // The person's persona, read once: it does not change within a session (docs/ORCHESTRATION.md §3.1).
  const persona = readPersona(config)
  for (const text of persona.warnings) console.warn(`${name}: ${text}`)
  let projections: SessionProjectionsService | undefined
  let waiting: string | undefined = WAITING_STATE
  let registration: string | undefined
  // Why the execution-boundary rules of the main agent are not installed (docs/ORCHESTRATION.md §6.1).
  let boundary: string | undefined
  // Why the human's messages are read from the session log (the projection hournessTalk is not registered), and why the two tools are not registered.
  let talkNote: string | undefined
  let toolsNote: string | undefined = '设计工具要工具服务（tools）'

  // Graph writes by sessions that have no right to the human's words that were refused, newest last: the last 50, told for 24 hours after the latest.
  const bypasses: Array<{ readonly at: number, readonly text: string }> = []
  const BYPASS_KEPT = 50
  const BYPASS_WINDOW_MS = 24 * 60 * 60 * 1000
  const bypassNote = (): string | undefined => {
    const recent = bypasses.filter(entry => entry.at >= Date.now() - BYPASS_WINDOW_MS)
    return recent.length === 0 ? undefined : `最近 24 小时有 ${recent.length} 次不经人的同意推进目标的写入被拦下，最近一次：${recent.at(-1)!.text}`
  }

  const status = (): [HealthState, string] => {
    const notes = [boundary, talkNote, toolsNote, persona.problem, bypassNote()].filter(note => note !== undefined)
    return [
      registration !== undefined ? 'inactive' : waiting === undefined && notes.length === 0 ? 'active' : 'degraded',
      [registration ?? `命令 /${WISH_COMMAND} 已注册`, waiting ?? '会话状态服务已就绪', ...notes].join('；'),
    ]
  }
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

  /**
   * What the human said and was shown in a session: the session projection
   * hournessTalk, else a fold of the session log, which rc.3 marks deprecated
   * and which is only the way back; undefined when neither can be read.
   */
  const talkOf = (agent: { readonly id: string, readonly session?: SessionLike | undefined }): TalkState | undefined => {
    const session = agent.session
    if (session === undefined) return undefined
    try {
      const state = projections?.stateOf(session, TALK_PROJECTION)
      if (state !== undefined) return state as TalkState
    }
    catch (error) {
      warnRead(`the talk state of a session cannot be read from its projection: ${message(error)}`)
    }
    if (typeof session.snapshotEvents !== 'function') return undefined
    try {
      const folded = talkFold(session.header, session.snapshotEvents())
      health.report(session.id, 'degraded', '人的消息改从会话日志读（会话投影 hournessTalk 没注册上）')
      return folded
    }
    catch (error) {
      warnRead(`the talk state of a session cannot be read from its log: ${message(error)}`)
      return undefined
    }
  }

  /** Whether a session is its project's main agent now; what is wrong with reading that is the session's degraded row health. */
  const isMain = (agent: { readonly id: string, readonly session?: SessionLike | undefined }): boolean => {
    const reading = roleOf(role, agent)
    if (reading.problems.length > 0 && agent.session !== undefined) health.report(agent.session.id, 'degraded', reading.problems.join('；'))
    return reading.main
  }

  // A delegated session that sent the human's words with a graph write was refused: the human is told through the row health and the main agent's next reply, once in ten minutes per session and goal.
  const noticed = new Map<string, number>()
  const NOTICE_GAP_MS = 10 * 60 * 1000
  const onBypass = (alert: BypassAlert): void => {
    const at = Date.now()
    const session = alert.agent.session
    const title = session === undefined ? undefined : (() => { try { const text = projections?.stateOf(session, 'title'); return typeof text === 'string' && text.length > 0 ? text : undefined } catch { return undefined } })()
    const label = alert.kind === 'subagent' ? `子 agent「${alert.agent.id}」` : `另一个会话「${title ?? alert.agent.id}」`
    bypasses.push({ at, text: `${label}想${alert.what}，${localTime(new Date(at).toISOString())}` })
    if (bypasses.length > BYPASS_KEPT) bypasses.shift()
    health.reactivate(...status())
    emitMetric({ event: 'design.bypass-refused', rule: alert.rule, session: alert.kind, goal: alert.goal, node: alert.node, tool: alert.tool })
    const holder = session === undefined ? undefined : role.holder(session)
    if (holder?.kind !== 'held') return
    health.report(holder.record.sessionId, 'degraded', bypassNote() ?? '')
    const key = `${alert.agent.id}\n${alert.goal ?? ''}`
    const last = noticed.get(key)
    if (last !== undefined && at - last < NOTICE_GAP_MS) return
    noticed.set(key, at)
    const live = agents()?.get(holder.record.sessionId)
    if (live === undefined) return
    live.inject(createUserNotice('glm-design-bypass', 'a write that moves work on without the human was refused', `[拦下] ${label}想不经人的同意${alert.what}，harness 拒绝了（${alert.rule}）。下一次回复里用一句话告诉人。`))
  }

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
  // What the latest assembly of an agent decided: the stage reminder (an `agent/pre-step` notice, after the step's assembly) goes to a main agent only.
  const assembledAsMain = new WeakMap<AgentLike, boolean>()
  // Sessions this row has reported as a main agent: when one stops being it, the report must not go on saying so.
  const reportedMain = new WeakSet<SessionLike>()
  /** The identity section and the tool face of the main agent, on this agent's own assembly. */
  function installAgentHooks(agent: AgentLike): void {
    if (installed.has(agent)) return
    installed.add(agent)
    // Prepend, like the guard's declaration: the section lands before glm:guard whichever listener is outermost.
    disposers.push(agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const reading = roleForStep(agent)
      // The main agent's health keeps saying that a write was refused until 24 hours after the latest one.
      const refused = reading.main ? bypassNote() : undefined
      if (bypasses.length > 0) health.reactivate(...status())
      // A persona the person wrote that was not added is the main agent's degraded state too: the session report would otherwise say "in effect".
      const unadded = reading.main ? persona.problem : undefined
      const step = { role: reading, problems: [...reading.problems, ...refused === undefined ? [] : [refused], ...unadded === undefined ? [] : [unadded]] }
      steps.set(agent, step)
      assembledAsMain.set(agent, reading.main)
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
      const dialect = dialectService(ctx, problem)
      // The two tools of this row are the main agent's only: every other session's face is without them.
      if (!(step?.role ?? roleForStep(agent)).main) {
        const tools = ordinaryFace(assembled.tools, tool => toNativeTool(dialect, tool, problem))
        return tools === assembled.tools ? assembled : { ...assembled, tools: [...tools] }
      }
      const face = mainAgentFace(assembled.tools, tool => toNativeTool(dialect, tool, problem))
      for (const why of face.problems) {
        if (step === undefined) health.report(sessionIdOf(agent), 'degraded', why)
        else step.problems.push(why)
      }
      // The person's persona, for the main agent only; the dialect's listener, outside this one, places it.
      const sections = persona.section === undefined ? assembled.sections : insertHournessSection(assembled.sections, persona.section)
      return { ...assembled, sections, tools: face.tools }
    }))
    // The stage reminder: after the step's assembly, so `assembledAsMain` is this step's. Its failure leaves the identity section and the tool face in place.
    try {
      const uninstall = installStageNotice(agent, {
        eligible: () => assembledAsMain.get(agent) === true,
        graph: () => graphFocus(ctx),
        report: (reported, state, reason) => { health.report(sessionIdOf(reported), state, reason) },
      })
      if (uninstall !== undefined) disposers.push(uninstall)
    }
    catch (error) {
      console.warn(`${name}: the stage reminder is not installed for agent ${agent.id}: ${message(error)}`)
      health.report(agent.id, 'degraded', `阶段提醒没装上：${message(error)}`)
    }
  }

  /**
   * A session that was a main agent when it was saved or forked, while another session holds the role now,
   * is told to leave it. Not awaited: agent/created is awaited serially before the agent finishes creation.
   * The agent is asked again when it is idle, because the person may have moved the role back meanwhile.
   * A session whose mode is off (readable), while the record names it, has the record deleted at creation -
   * whatever its log says about the /wish: finished, errored, or never written (review R4).
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
        const project = projectOfSession(session)
        if (session.id === except || session.header.origin === 'subagent' || project === undefined || project.key !== key || !modeOf(projections, session).active) continue
        // The session the record names holds the role now, whatever its projection says: demoting it would delete the record a running /wish relies on (review R3). Read per candidate: the record can change hands while this loop waits on a demotion.
        const named = readHolder(project.file)
        if (named.kind === 'held' && named.record.sessionId === session.id) continue
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
        // What the human said is read from this projection; without it the main agent's tools and rules read the session log (rc.3 marks that deprecated).
        try {
          projectionCtx.sessionProjections.register(talkProjection)
          talkNote = undefined
        }
        catch (error) {
          console.warn(`${name}: the talk projection ${TALK_PROJECTION} is off, the human's messages are read from the session log: ${message(error)}`)
          talkNote = `人的消息改从会话日志读（会话投影 ${TALK_PROJECTION} 没注册上：${message(error)}）`
        }
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

  // The two tools of the main agent: put a matter to the human, record their reply (src/design/propose.ts, record.ts).
  const toolDeps: DesignToolDeps = {
    boards: ATTACH_BOARDS,
    lookup: ctx,
    isMainAgent: isMain,
    graph: (agent) => {
      const graph = graphFocus(ctx)
      const cwd = agent.session?.header.cwd
      const dir = graph?.dirFor(cwd)
      if (graph === undefined || agent.session === undefined || dir === undefined || !isDirectory(dir)) return undefined
      return { dir, cwd, focus: graph.focusOf(agent.session) }
    },
    talk: talkOf,
    report: (agent, state, reason) => { health.report(sessionIdOf(agent), state, reason) },
  }
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['tools'], toolsCtx => {
        const undo: Array<() => void> = []
        try {
          undo.push(toolsCtx.tools.register(proposeTool(toolDeps)))
          undo.push(toolsCtx.tools.register(recordTool(toolDeps)))
        }
        catch (error) {
          for (const withdraw of undo.splice(0).reverse()) withdraw()
          console.warn(`${name}: registering the design tools failed, the main agent cannot put a matter to the human: ${message(error)}`)
          toolsNote = `propose_to_human 和 record_human_answer 没注册上：${message(error)}`
          health.reactivate(...status())
          return undefined
        }
        toolsNote = undefined
        health.reactivate(...status())
        return () => {
          for (const withdraw of undo.splice(0).reverse()) withdraw()
          toolsNote = '设计工具要工具服务（tools）'
          health.reactivate(...status())
        }
      })
    }
    catch (error) {
      console.warn(`${name}: the design tools are not registered: ${message(error)}`)
      toolsNote = `设计工具没注册上：${message(error)}`
    }
  }
  else toolsNote = '宿主没有 inject，设计工具拿不到工具服务'

  // The main agent has no tool that writes files, but the runtime executes by name: the rules deny a write, a question card and a git command that cannot be saved first (src/guard/main-agent.ts).
  try {
    const journal = projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd))
    disposers.push(installMainAgentRules(ctx, {
      agents,
      graph: () => graphFocus(ctx),
      isMainAgent: isMain,
      checkRelay: (agent, quotes, afterMs) => {
        const state = talkOf(agent)
        if (state === undefined) return undefined
        const said = personSaid(state, quotes, afterMs)
        return said.ok ? { ok: true } : { ok: false, reason: said.reason, offBoundary: said.offBoundary }
      },
      bypass: onBypass,
      metric: emitMetric,
      hiddenTools: HIDDEN_FROM_MAIN_AGENT,
      journal: (record, cwd) => { void journal.violation(record, cwd) },
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
