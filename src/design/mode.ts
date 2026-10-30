/**
 * Main agent mode (docs/ORCHESTRATION.md §3.1; decisions d-one-main-agent,
 * d-chat-not-cards): which session is the main agent of its project, and the
 * /wish command that makes one.
 *
 * A session's mode is a session projection folded from the command
 * lifecycle events of /wish (command/run, command/done), like plan mode
 * folds /plan: only the person can type a slash command, so the model cannot
 * enter or leave the role. A short pending state in memory covers the gap
 * between the handler returning and command/done landing in the log (the
 * first assembly of an idle agent that /wish wakes starts before that).
 * The projection says what the session was told; the holder record
 * (src/graph/main-agent-holder.ts) says which session of the project is the
 * main agent. `isMainAgent` combines them: the projection must be on, and
 * where a record exists it must name this session.
 */
import { MAIN_AGENT_KEY, type MainAgentView } from '../graph/main-agent.ts'
import { claimHolder, holderFileOf, projectKey, readHolder, releaseHolder, replaceHolder, type HolderReading, type HolderRecord } from '../graph/main-agent-holder.ts'
import type { GraphService } from '../graph/service.ts'
import { createUserNotice, type CommandResultLike, type DesignAgentLike, type DesignAgentsService, type DesignInvocationLike, type SessionEventLike, type SessionLike, type SessionPersistenceLike, type SessionProjectionsService, type UserNotice } from '../shared/dsh-min.ts'
import type { HealthState } from '../shared/health.ts'

/** What the projection keeps for one session. */
export interface MainAgentState {
  readonly active: boolean
  /** A /wish that has not finished: its command id and the role it asks for. */
  readonly running: { readonly commandId: string, readonly wanted: boolean } | null
  /** The command id of the last /wish that finished. */
  readonly settled: string | null
}

/**
 * A /wish that ends with this text did not change the session's role (the
 * project's main agent is another session): its command/done does not turn
 * the projection on.
 */
export const ROLE_UNCHANGED_MARK = '这个项目的主 Agent 在另一个会话里'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseState(value: unknown): MainAgentState {
  if (!isRecord(value) || typeof value.active !== 'boolean') throw new TypeError('main agent state: active must be a boolean')
  const { running, settled } = value
  if (running !== null && !(isRecord(running) && typeof running.commandId === 'string' && typeof running.wanted === 'boolean')) throw new TypeError('main agent state: running must be null or {commandId, wanted}')
  if (settled !== null && typeof settled !== 'string') throw new TypeError('main agent state: settled must be null or a command id')
  return value as unknown as MainAgentState
}

function parseView(value: unknown): MainAgentView {
  if (!isRecord(value) || typeof value.active !== 'boolean') throw new TypeError('main agent view: active must be a boolean')
  return { active: value.active }
}

/**
 * The fold: /wish running with the role its argument asks for, and, when it
 * finishes in success without the mark above, the session has that role.
 * Inherited events of a fork fold like any other (a fork of a main agent
 * session starts as one; the holder record decides whether it is).
 */
function foldMainAgent(state: MainAgentState, event: SessionEventLike): MainAgentState {
  const data = event.data
  if (!isRecord(data) || typeof data.commandId !== 'string') return state
  if (event.type === 'command/run' && data.name === 'wish' && typeof data.args === 'string') {
    return { ...state, running: { commandId: data.commandId, wanted: data.args.trim() !== 'off' } }
  }
  if (event.type === 'command/done' && state.running !== null && data.commandId === state.running.commandId) {
    const changed = data.kind === 'success' && !(typeof data.text === 'string' && data.text.startsWith(ROLE_UNCHANGED_MARK))
    return { active: changed ? state.running.wanted : state.active, running: null, settled: data.commandId }
  }
  return state
}

/** The projection the design row registers; the key and the view are read by the panel row and the client from src/graph/main-agent.ts. */
export const mainAgentProjection = {
  key: MAIN_AGENT_KEY,
  stateVersion: 1,
  stateSchema: { parse: parseState },
  init: (): MainAgentState => ({ active: false, running: null, settled: null }),
  apply: foldMainAgent,
  wire: { viewSchema: { parse: parseView }, view: (state: MainAgentState): MainAgentView => ({ active: state.active }) },
} as const

const pending = new WeakMap<SessionLike, { readonly commandId: string, readonly active: boolean }>()

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Record the role the /wish being handled asks for, before its command/done lands. */
function setPending(session: SessionLike, commandId: string, active: boolean): void {
  pending.set(session, { commandId, active })
}

/** What `modeOf` found: the mode, a /wish that settled without effect, and why the projection could not be read. */
export interface Mode {
  readonly active: boolean
  /** A pending /wish settled without effect (the request was aborted): the role the person had asked for. */
  readonly cancelled?: boolean
  /** The projection threw or held a value of another shape; the mode then comes from the pending state alone. */
  readonly error?: string
}

/**
 * Whether the session has main agent mode on, by the pending state while the
 * command is unsettled and by the projection after.
 */
export function modeOf(projections: Pick<SessionProjectionsService, 'stateOf'> | undefined, session: SessionLike): Mode {
  let state: MainAgentState | undefined
  let error: string | undefined
  try {
    const value = projections?.stateOf(session, MAIN_AGENT_KEY)
    state = value === undefined ? undefined : parseState(value)
  }
  catch (reason) {
    error = message(reason)
  }
  const failure = error === undefined ? {} : { error }
  const waiting = pending.get(session)
  if (waiting === undefined) return { active: state?.active === true, ...failure }
  if (state?.settled === waiting.commandId) {
    pending.delete(session)
    return state.active === waiting.active ? { active: state.active } : { active: state.active, cancelled: waiting.active }
  }
  return { active: waiting.active, ...failure }
}

export const CANCELLED_ON = '/wish 在生效前被取消，这个会话不是主 Agent'
export const CANCELLED_OFF = '/wish off 在生效前被取消，这个会话仍是主 Agent'

/** What `roleOf` and `isMainAgent` read. */
export interface RoleDeps {
  projections(): Pick<SessionProjectionsService, 'stateOf'> | undefined
  /** The holder record of the session's project; undefined for a session with no graph directory. */
  holder(session: SessionLike): HolderReading | undefined
  /** Report the row's health in a session. */
  report(session: SessionLike, state: HealthState, reason: string): void
  /** Warn on the console; the row says it once. */
  warn(text: string): void
}

/** Whether a session is its project's main agent, and what in reading that is not as it should be (each becomes a degraded row health). */
export interface RoleReading {
  readonly main: boolean
  readonly problems: readonly string[]
}

/**
 * Who this agent is: not a delegated child, mode on, and the holder record,
 * where one exists, names this session. With no readable record the
 * projection decides. A projection that cannot be read counts as "not the
 * main agent" for this step (docs/ORCHESTRATION.md §3.1). Reports nothing
 * itself: the assembly listener folds the problems into the one health
 * report of its step, so a later "in effect" does not cover them.
 */
export function roleOf(deps: RoleDeps, agent: { readonly session?: SessionLike | undefined }): RoleReading {
  const session = agent.session
  if (session === undefined || session.header.origin === 'subagent') return { main: false, problems: [] }
  const mode = modeOf(deps.projections(), session)
  const problems: string[] = []
  if (mode.error !== undefined) {
    deps.warn(`the main agent state of a session cannot be read, so it counts as an ordinary session: ${mode.error}`)
    problems.push(`读不到主 Agent 的会话状态（${mode.error}），这一步当作普通会话`)
  }
  if (mode.cancelled !== undefined) problems.push(mode.cancelled ? CANCELLED_ON : CANCELLED_OFF)
  if (!mode.active) return { main: false, problems }
  const holder = deps.holder(session)
  if (holder === undefined) return { main: true, problems }
  if (holder.kind === 'held') return { main: holder.record.sessionId === session.id, problems }
  problems.push(`主 Agent 的持有者记录读不到（${holder.kind === 'none' ? '没有记录' : holder.reason}）：在主 Agent 会话里再发一次 /wish`)
  return { main: true, problems }
}

/** `roleOf(...).main`, reporting its problems as the session's degraded row health (for callers outside the assembly). */
function isMainAgent(deps: RoleDeps, agent: { readonly session?: SessionLike | undefined }): boolean {
  const role = roleOf(deps, agent)
  if (role.problems.length > 0 && agent.session !== undefined) deps.report(agent.session, 'degraded', role.problems.join('；'))
  return role.main
}

/** The longest wish /wish takes, the same ceiling as a relayed quote. */
export const MAX_WISH_LENGTH = 2000

const NOTICE_KIND = 'glm-design-wish'

/** Ends every reply that makes a session the main agent: the main agent works best on a stronger model, and the plugin does not switch models for the person (docs/CHARTER.md §6). */
export const STRONG_MODEL_NOTE = '主 Agent 建议用强一点的模型'

const ENTER_NOTICE = 'The human made this session\'s agent the main agent of this project with /wish: you plan, dispatch and accept the work and write no files yourself. Open the graph with graph_open and follow the stage reminders.'
const OFF_NOTICE = 'The human left main-agent mode with /wish off: from the next step this session\'s agent is an ordinary agent and may write files directly.'
const MOVED_NOTICE = 'The main agent of this project moved to another session: from the next step this session\'s agent is an ordinary agent and may write files directly.'

const wishNotice = (text: string, commandId: string): UserNotice => createUserNotice(NOTICE_KIND, 'main agent mode on, with a wish', `${ENTER_NOTICE}\nThe human's wish, in their words: "${text}"\nStart the interview: propose the goal on the graph with a body that starts with 需求： followed by their words verbatim, then graph_focus it.`, { designWish: { commandId, text } })

/** What the /wish handler needs from the row. */
export interface WishDeps {
  readonly role: RoleDeps
  readonly graph: () => GraphService | undefined
  readonly dirExists: (dir: string) => boolean
  readonly userHome: () => string
  readonly agents: () => DesignAgentsService | undefined
  readonly persistence: () => SessionPersistenceLike | undefined
  readonly titleOf: (session: SessionLike) => string | undefined
  readonly installHooks: (agent: DesignAgentLike) => void
  /** Make every other live root session of the project, whose mode is on, leave it. */
  readonly demoteOthers: (key: string, except: string) => Promise<void>
  readonly now: () => Date
}

type Input = { readonly kind: 'off' } | { readonly kind: 'on', readonly here: boolean, readonly wish: string }

function parseInput(raw: string): Input {
  const input = raw.trim()
  if (input === 'off') return { kind: 'off' }
  const here = /^here(?:\s+([\s\S]*))?$/.exec(input)
  return here === null ? { kind: 'on', here: false, wish: input } : { kind: 'on', here: true, wish: (here[1] ?? '').trim() }
}

const fail = (text: string): CommandResultLike => ({ kind: 'error', text })
const done = (text: string): CommandResultLike => ({ kind: 'success', text })

const pad = (value: number): string => String(value).padStart(2, '0')

function localTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : `${at.getMonth() + 1}月${at.getDate()}日 ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** Whether the session a record names is open now, stored but closed, or gone. */
async function standingOf(deps: WishDeps, sessionId: string): Promise<'open' | 'closed' | 'gone'> {
  if (deps.agents()?.get(sessionId) !== undefined) return 'open'
  const persistence = deps.persistence()
  if (persistence === undefined) return 'closed'
  try {
    return (await persistence.list()).some(entry => entry.header.id === sessionId) ? 'closed' : 'gone'
  }
  catch {
    return 'closed'
  }
}

function pointerText(deps: WishDeps, record: HolderRecord, standing: 'open' | 'closed', hasWish: boolean): string {
  const live = deps.agents()?.get(record.sessionId)?.session
  const title = live === undefined ? undefined : deps.titleOf(live)
  const named = title === undefined ? `会话 id ${record.sessionId}` : `会话「${title}」，id ${record.sessionId}`
  const tail = hasWish
    ? '要把它移到这里并交给它这句话，输入 /wish here 加这句话，那个会话会变回普通会话。'
    : '要把它移到这里，输入 /wish here，那个会话会变回普通会话。'
  return `${ROLE_UNCHANGED_MARK}（${localTime(record.since)} 开始，${named}${standing === 'closed' ? '；现在没有打开' : ''}）。${tail}`
}

const MOVED_HERE = '主 Agent 已从另一个会话移到这里；那个会话变回普通会话。那个会话派出去还在跑的子 agent 从现在起按普通会话的规矩。'

/** The handler of /wish. */
export function wishHandler(deps: WishDeps): (invocation: DesignInvocationLike) => Promise<CommandResultLike> {
  const leave = (invocation: DesignInvocationLike): CommandResultLike => {
    const { agent, commandId } = invocation
    const session = agent.session
    const graph = deps.graph()
    const dir = graph?.dirFor(session.header.cwd)
    const file = dir === undefined ? undefined : holderFileOf(deps.userHome(), dir)
    const reading: HolderReading = file === undefined ? { kind: 'none' } : readHolder(file)
    const wasMain = isMainAgent(deps.role, agent)
    if (reading.kind === 'held' && reading.record.sessionId !== session.id && modeOf(deps.role.projections(), session).active) {
      setPending(session, commandId, false)
      agent.inject(createUserNotice(NOTICE_KIND, 'main agent moved away', MOVED_NOTICE))
      return done('主 Agent 在另一个会话里，这个会话已经变回普通会话')
    }
    if (file !== undefined && reading.kind === 'held' && reading.record.sessionId === session.id) {
      try {
        releaseHolder(file, session.id)
      }
      catch (error) {
        return fail(`主 Agent 的持有者记录删不掉：${message(error)}`)
      }
    }
    if (!wasMain) return done('这个会话本来就不是主 Agent')
    setPending(session, commandId, false)
    agent.inject(createUserNotice(NOTICE_KIND, 'main agent mode off', OFF_NOTICE))
    return done('已退出主 Agent 模式：这个会话的 agent 又可以直接写文件了')
  }

  const enter = async (invocation: DesignInvocationLike, input: Extract<Input, { kind: 'on' }>): Promise<CommandResultLike> => {
    const { agent, commandId } = invocation
    const session = agent.session
    if (session.header.origin === 'subagent') return fail('子 agent 的会话不能当主 Agent')
    if (deps.role.projections() === undefined) return fail('主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有')
    const graph = deps.graph()
    if (graph === undefined) return fail('项目图行 glm-hourness/graph 没有启用，主 Agent 没有图可用')
    const dir = graph.dirFor(session.header.cwd)
    if (dir === undefined) return fail('这个会话没有工作目录，找不到项目图')
    if (!deps.dirExists(dir)) return fail(`这个工作区还没有项目图：先建空目录 ${dir}`)
    if (input.wish.length > MAX_WISH_LENGTH) return fail('愿望太长，请先用一两句话说')

    const file = holderFileOf(deps.userHome(), dir)
    const key = projectKey(dir)
    const record: HolderRecord = { version: 1, sessionId: session.id, graphDir: dir, since: deps.now().toISOString(), commandId }
    let lead = ''
    try {
      // Three tries: a claim that loses to a session claiming at the same moment reads the record again.
      for (let attempt = 0; attempt < 3; attempt++) {
        const reading = readHolder(file)
        if (reading.kind === 'none') {
          if (claimHolder(file, record)) break
          continue
        }
        if (reading.kind === 'unreadable') {
          replaceHolder(file, record)
          await deps.demoteOthers(key, session.id)
          lead = `原来的主 Agent 记录读不到（${reading.reason}），已改为这个会话；`
          break
        }
        if (reading.record.sessionId === session.id) break
        if (input.here) {
          replaceHolder(file, record)
          await deps.demoteOthers(key, session.id)
          lead = MOVED_HERE
          break
        }
        const standing = await standingOf(deps, reading.record.sessionId)
        if (standing !== 'gone') return done(pointerText(deps, reading.record, standing, input.wish !== ''))
        replaceHolder(file, record)
        lead = '原来的主 Agent 会话已经不在了，'
        break
      }
      const final = readHolder(file)
      if (final.kind !== 'held' || final.record.sessionId !== session.id) throw new Error('别的会话同时在抢，记录还没写上')
    }
    catch (error) {
      return fail(`主 Agent 的持有者记录写不了：${message(error)}`)
    }

    // Hooks first, also for a session that is the main agent already: it may have been open before this row loaded.
    deps.installHooks(agent)
    if (input.wish === '' && isMainAgent(deps.role, agent)) return done(`${lead}这个会话已经是主 Agent`)
    setPending(session, commandId, true)
    if (input.wish === '') agent.inject(createUserNotice(NOTICE_KIND, 'main agent mode on', ENTER_NOTICE))
    else if (agent.status === 'running') agent.steer(wishNotice(input.wish, commandId))
    else agent.followup(wishNotice(input.wish, commandId))
    return done(`${lead}已让这个会话的 agent 当主 Agent（项目经理）：它按项目图推进，不写文件；/wish off 退出${input.wish === '' ? '' : '。已把你的愿望交给它'}。${STRONG_MODEL_NOTE}`)
  }

  return (invocation) => {
    const input = parseInput(invocation.rawInput)
    return input.kind === 'off' ? Promise.resolve(leave(invocation)) : enter(invocation, input)
  }
}
