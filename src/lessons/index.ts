/**
 * dsh-lessons row entry (M5 design §2.2, §4, §7): the lessons board of a
 * project. The lookup tool `lessons_query` for every agent, the merge tool
 * `lessons_merge` for the main agent, the service `glmHournessLessons` that
 * the dispatch of work reads and writes, the notices to the main agent
 * (candidates waiting, a lesson that keeps coming back), `/lessons`, and the
 * session projection `hournessLessons` that tells the page where the journal
 * is.
 *
 * Lessons are advice, not rules: the row registers no `tools/pre-execute`
 * listener and blocks no tool call (`d-code-rules-enforce`: it has no rule).
 * Its listeners on a tool call are both on `tools/post-execute` of the host:
 * a failed call that matches a lesson gets a reminder in its result
 * (src/lessons/failure.ts), whichever agent made it, and the match is
 * recorded; a successful read, write or edit gets one reminder for the path,
 * the lessons that fit it and the component's document and decisions
 * (src/lessons/path.ts). A call is one or the other, and the call itself is
 * never refused or changed. A delegated child
 * gets `lessons_query` but not `lessons_merge`: a listener on the child's
 * own scope removes the tool from its request (it does not `prepend`, so the
 * dialect's decisions outside it see what is left), and the tool body
 * refuses a child that calls it by name.
 *
 * Everything belongs to the project of the session (the working directory of
 * the session decides it); there is no user-level lessons journal. The row
 * ships disabled until the probe and the first desktop pass (AGENTS.md). It
 * never throws on activation: a part that cannot be set up is a warning and
 * a line in the row health.
 */
import { randomInt } from 'node:crypto'
import { dialectService, toNativeTool } from '../shared/dialect.ts'
import type { AgentLike, InjectHost, PostExecuteHost, ProvideHost, ServiceLookup, SessionLike, SessionProjectionsService, ToolsLike } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import { sessionNotebook, warnOnceFor, whenPresent } from '../shared/row-support.ts'
import { LESSONS_MERGE_TOOL } from '../shared/tool-names.ts'
import type { AppendOptions } from '../data/journal.ts'
import { lessonsCommand } from './commands.ts'
import { installFailureMatching } from './failure.ts'
import { installPathNotices } from './path.ts'
import { createImporter } from './import.ts'
import { activeLessons, openCandidates, type RandomSource } from './model.ts'
import { installLessonNotices } from './notices.ts'
import { LESSONS_SERVICE, lessonsRowService } from './service.ts'
import { journalFile, projectDirFor, readLessons, type LessonsEnv, type NoteKey } from './storage.ts'
import { lessonsTools } from './tools.ts'

export interface LessonsConfig {
  /** The clock; tests inject theirs. */
  readonly now?: () => Date
  /** The source of the six hex digits of an id (an integer from 0 to 0xFFFFFF); tests inject theirs. */
  readonly random?: RandomSource
  /** Whether file paths compare without case; Windows by default. */
  readonly ignoreCase?: boolean
  /** The lock environment and flush of the journal writes; tests replace them. */
  readonly append?: Pick<AppendOptions, 'lock' | 'sync'>
}

/** The agent lifecycle event the row listens to. */
interface AgentLifecycleHost {
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

/** The row's context: the tools service, the agent lifecycle, the results of tool calls, and the services that may be missing. */
export type LessonsContext = AgentLifecycleHost & PostExecuteHost & ServiceLookup & Partial<ProvideHost> & Partial<InjectHost> & { readonly tools: Pick<ToolsLike, 'register'> }

/** cordis plugin identity: needs the tools service. */
export const name = 'dsh-glm-hourness/lessons'
export const inject = ['tools']

/** The session projection that tells the page where the journal of a session's project is. */
export const LESSONS_PROJECTION = 'hournessLessons'

const WAITING_COMMANDS = '命令 /lessons 等 commands 服务'
const WAITING_PROJECTION = '会话投影 hournessLessons 等 sessionProjections 服务'
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

interface LessonsView {
  readonly journal: string | null
}

function parseView(value: unknown): LessonsView {
  const journal = (value as Partial<Record<keyof LessonsView, unknown>> | null)?.journal
  if (typeof value !== 'object' || value === null || !(journal === null || typeof journal === 'string')) throw new TypeError(`${LESSONS_PROJECTION}.journal must be a path or null`)
  return value as LessonsView
}

/** The projection that hands the page the journal of a session's project; its state does not change after the session is created. */
function projectionFor(dirOf: (cwd: string | undefined) => string | undefined): Parameters<SessionProjectionsService['register']>[0] {
  return {
    key: LESSONS_PROJECTION,
    stateVersion: 1,
    stateSchema: { parse: parseView },
    init: (header: unknown): LessonsView => {
      const dir = dirOf((header as { readonly cwd?: unknown } | null)?.cwd as string | undefined)
      return { journal: dir === undefined ? null : journalFile(dir) }
    },
    apply: (state: LessonsView): LessonsView => state,
    wire: { viewSchema: { parse: parseView }, view: (state: LessonsView): LessonsView => state },
  }
}

/** Where a session has no project, in words for the row health. */
const noProjectReason = (cwd: string | undefined): string => cwd === undefined
  ? '会话没有工作目录，本项目的经验不可用'
  : '这个文件夹不是项目（用户主目录、盘符根，或不在 git 仓库里又没有 .llm 文件夹），本项目的经验不可用；要用就在这里建一个 .llm 文件夹'

/**
 * cordis plugin entry: registers the two tools, provides the service,
 * listens to agent creation (the notices for a root agent, the tool filter
 * for a delegated child), and takes `/lessons` and the projection when their
 * services arrive. A part that cannot be set up warns once and shows in the
 * row health; activation must never throw, because an activation failure
 * takes the whole host startup down.
 */
export function apply(ctx: LessonsContext, config: LessonsConfig = {}): () => void {
  const disposers: Array<() => void> = []
  const notebook = sessionNotebook<NoteKey>()
  const waiting = { commands: WAITING_COMMANDS as string | undefined, projection: WAITING_PROJECTION as string | undefined }
  const failures: { registration?: string, service?: string, matching?: string, path?: string } = {}
  const activation = (): [HealthState, string] => {
    const problems = [failures.registration, failures.service, failures.matching, failures.path, waiting.commands, waiting.projection].filter((text): text is string => text !== undefined)
    if (failures.registration !== undefined) return ['inactive', failures.registration]
    return [problems.length === 0 ? 'active' : 'degraded', `经验工具已注册，项目目录跟会话的工作区${problems.length === 0 ? '' : `；${problems.join('；')}`}`]
  }
  const health: RowHealth = provideRowHealth(ctx, 'lessons', ...activation())
  disposers.push(() => { health.dispose() })

  const warnOnce = warnOnceFor(name)
  const dirOfCwd = (cwd: string | undefined): string | undefined => projectDirFor(ctx, cwd)
  const env: LessonsEnv = {
    dirOf: session => dirOfCwd(session?.header.cwd),
    now: config.now ?? ((): Date => new Date()),
    random: config.random ?? ((): number => randomInt(0x1000000)),
    ignoreCase: config.ignoreCase ?? process.platform === 'win32',
    native: tool => toNativeTool(dialectService(ctx), tool),
    note: notebook.note,
    counters: { rejected: new Map(), failed: new Set() },
    ...(config.append === undefined ? {} : { append: config.append }),
  }

  /** Report the session's health from what the project holds and what went wrong. */
  const report = async (session: SessionLike): Promise<void> => {
    const dir = env.dirOf(session)
    const problems: string[] = [...(notebook.notesOf(session.id)?.values() ?? [])]
    const parts: string[] = []
    if (dir === undefined) problems.push(noProjectReason(session.header.cwd))
    else {
      const read = await readLessons(dir)
      if (!read.ok) problems.push(`经验读不出：${read.reason}`)
      else {
        const { state, bad, size } = read.reading
        parts.push(`项目 ${dir}（生效经验 ${activeLessons(state).length}、候选 ${openCandidates(state).length}）`)
        if (bad.length > 0) problems.push(`流水有 ${bad.length} 行读不出`)
        if (size > MAX_JOURNAL_BYTES) problems.push('流水超过 8 MiB')
      }
    }
    const refused = [...env.counters.rejected]
    if (refused.length > 0) problems.push(`${refused.reduce((sum, [, count]) => sum + count, 0)} 条候选被拒（${refused.map(([code, count]) => `${code} ${count} 条`).join('、')}）`)
    health.report(session.id, problems.length === 0 ? 'active' : 'degraded', [...parts, ...problems].join('；'))
  }

  // Both tools or none: a tool that cannot be registered takes back those registered before it.
  const registered = lessonsTools(env).reduce<{ disposers: Array<() => void>, error?: string }>((done, tool) => {
    if (done.error !== undefined) return done
    try {
      return { disposers: [...done.disposers, ctx.tools.register(tool)] }
    }
    catch (error) {
      for (const dispose of done.disposers.reverse()) dispose()
      return { disposers: [], error: messageOf(error) }
    }
  }, { disposers: [] })
  disposers.push(...registered.disposers)
  if (registered.error !== undefined) {
    console.warn(`${name}: registering the lessons tools failed, the lessons tools stay off: ${registered.error}`)
    failures.registration = `经验工具注册失败，已全部撤掉：${registered.error}`
  }

  const provided = ((): { readonly dispose?: () => void, readonly failure?: string } => {
    if (typeof ctx.provide !== 'function') return { failure: `宿主没有 provide，服务 ${LESSONS_SERVICE} 没提供` }
    try {
      return { dispose: ctx.provide(LESSONS_SERVICE, lessonsRowService(env)) }
    }
    catch (error) {
      warnOnce('service', `${LESSONS_SERVICE} is not provided (the dispatch of work brings no lessons): ${messageOf(error)}`)
      return { failure: `服务 ${LESSONS_SERVICE} 没提供上：${messageOf(error)}` }
    }
  })()
  if (provided.dispose !== undefined) disposers.push(provided.dispose)
  if (provided.failure !== undefined) failures.service = provided.failure

  const notices = { ctx, env, importer: createImporter(ctx, env), report, warn: warnOnce }

  // What each session was told by the two reminders after a call: shared, so a lesson one tells the other does not tell again.
  const pushedBy = new WeakMap<SessionLike, Set<string>>()

  // The reminder after a failed call; without it the lessons still reach the agent through the brief, the notices and lessons_query.
  try {
    disposers.push(installFailureMatching({ ctx, env, report, warn: warnOnce, pushedBy }))
  }
  catch (error) {
    warnOnce('failure-matching', `failure matching is off: ${messageOf(error)}`)
    failures.matching = `失败匹配没装上：${messageOf(error)}`
  }

  // The reminder at a file after a successful read, write or edit; without it the lessons for a path still reach the agent through the brief and lessons_query.
  try {
    disposers.push(installPathNotices({ ctx, env, report, warn: warnOnce, pushedBy }))
  }
  catch (error) {
    warnOnce('path-notices', `the reminder at a file is off: ${messageOf(error)}`)
    failures.path = `文件处的提醒没装上：${messageOf(error)}`
  }

  /** A delegated child's request loses the tool that only the main agent has. */
  const hideMerge = (agent: AgentLike): (() => void) => agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    return { ...assembled, tools: assembled.tools.filter(tool => tool.name !== LESSONS_MERGE_TOOL) }
  })

  /** What a new agent gets: the notices when it is a root agent, a request without the merge tool when it is a child. */
  const installOn = (agent: AgentLike): void => {
    try {
      disposers.push(...(agent.session?.header.origin === 'subagent' ? [hideMerge(agent)] : installLessonNotices(notices, agent)))
    }
    catch (error) {
      console.warn(`${name}: the lessons are not installed for agent ${agent.id}: ${messageOf(error)}`)
    }
  }
  disposers.push(ctx.on('agent/created', ({ agent }) => { installOn(agent) }))

  // The commands and the projection arrive when their services do; without them the tools and the notices work all the same.
  const optional = { name, ctx, waiting, health, activation }
  whenPresent(optional, 'commands', 'commands', WAITING_COMMANDS, '命令 /lessons', ({ commands }) => commands.register(lessonsCommand(env)))
  whenPresent(optional, 'sessionProjections', 'projection', WAITING_PROJECTION, '会话投影 hournessLessons', ({ sessionProjections }) => sessionProjections.register(projectionFor(dirOfCwd)))

  health.reactivate(...activation())
  return () => { for (const dispose of disposers.splice(0).reverse()) dispose() }
}
