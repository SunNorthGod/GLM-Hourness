/**
 * dsh-memory row entry (M5 design §2.2, §3, §7): the three memory tools, the
 * read-only learning tool `learning_signals` and the digest reminder that
 * points the main agent to it (src/memory/notices.ts), the memory index a
 * root agent starts a session with, `/memory`, the service
 * `glmHournessMemory`, the session projection `hournessMemory`, and the
 * usage per model call that the read-only `llm/stream` waterfall feeds into
 * the user-level journal the data row provides (docs/DESIGN.md §2.4).
 *
 * Memory is per session: the project directory follows the working
 * directory of the session (the row's old `home` setting is ignored and the
 * health says so), what is about the person is in the user-level directory.
 * A delegated child gets neither the tools nor the index nor the reminder: a
 * listener on the child's own scope removes the tools from its request (it does not
 * `prepend`, so the dialect's section decision, which runs outside it, sees
 * the tools that are left), and the tool bodies refuse a child that calls
 * one by name. The row has one code rule, `habit-ask-first`
 * (src/memory/habit-rule.ts), installed through the guard framework's gate:
 * its denials go to the violation journal of the session's project.
 *
 * Sinks never throw into the caller's stream; a failure to read or write
 * is reported to the session's row health (src/shared/health.ts) and, in a
 * tool, to the model. Activation never throws: the commands and the
 * projection arrive through `ctx.inject` when their services are there.
 */
import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { projectDirOf, projectOf } from '../data/project-root.ts'
import { ID_PATTERN } from '../graph/schema.ts'
import { graphService } from '../graph/service.ts'
import { loadGraph } from '../graph/store.ts'
import { projectJournal, rowJournal, type AuditFs, type UsageRecord } from './audit.ts'
import { HABIT_ASK_FIRST, installHabitRule } from './habit-rule.ts'
import { memoryCommand } from './commands.ts'
import { answersOf } from './answers.ts'
import { learningNotice } from './notices.ts'
import { renderIndex, visibleEntries } from './recall.ts'
import { memoryRowService } from './service.ts'
import { readBoth, type Both, type GraphRead, type MemoryEnv, type NoteKey, type Places, type SourceCheck } from './storage.ts'
import { learningTools, memoryTools } from './tools.ts'
import { dataHomes, dataService } from '../shared/data-home.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import type { AgentLike, DerivedMessage, InjectHost, LlmStreamHost, PreExecuteHost, ProvideHost, ServiceLookup, SessionEventHost, SessionLike, SessionProjectionsService, ToolsLike } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import type { TokenUsage } from '../shared/lm-min.ts'
import { MEMORY_SERVICE } from '../shared/memory-service.ts'
import { sessionNotebook, warnOnceFor, whenPresent } from '../shared/row-support.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { LEARNING_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../shared/tool-names.ts'
import type { AppendOptions } from '../data/journal.ts'

export interface MemoryConfig {
  /** Not used any more: the project directory follows the working directory of the session. A value is ignored and the row health says so. */
  readonly home?: string
  /** Injected filesystem override for the usage journal in tests. */
  readonly fs?: AuditFs
  /** The clock for strength and the index; tests inject theirs. */
  readonly now?: () => Date
  /** The lock environment and flush of the journal writes; tests replace them. */
  readonly append?: Pick<AppendOptions, 'lock' | 'sync'>
}

/** The agent lifecycle event the row listens to. */
interface AgentLifecycleHost {
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
}

/** The row's context: the `llm/stream` waterfall, the agent lifecycle, the tools service, and the services that may be missing. */
export type MemoryContext = LlmStreamHost & AgentLifecycleHost & ServiceLookup & Partial<ProvideHost> & Partial<InjectHost> & { readonly tools: Pick<ToolsLike, 'register'> }

/** cordis plugin identity: needs the tools service (memory tools family). */
export const name = 'dsh-glm-hourness/memory'
export const inject = ['tools']

/** The source of the memory index notice; the index is not repeated while a request-visible message has it. */
export const INDEX_SOURCE = 'glm-hourness-memory'

/** The session projection that gives the panel the paths of the journals. */
export const MEMORY_PROJECTION = 'hournessMemory'

const WAITING_COMMANDS = '命令 /memory 等 commands 服务'
const WAITING_PROJECTION = '会话投影 hournessMemory 等 sessionProjections 服务'
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

interface MemoryView {
  readonly projectJournal: string | null
  readonly userJournal: string | null
}

function parseView(value: unknown): MemoryView {
  const view = value as Partial<Record<keyof MemoryView, unknown>> | null
  for (const key of ['projectJournal', 'userJournal'] as const) {
    if (typeof view !== 'object' || view === null || !(view[key] === null || typeof view[key] === 'string')) throw new TypeError(`${MEMORY_PROJECTION}.${key} must be a path or null`)
  }
  return value as MemoryView
}

/** The projection that hands the panel the journals of a session; its state does not change after the session is created. */
function projectionFor(places: (cwd: string | undefined) => Places): Parameters<SessionProjectionsService['register']>[0] {
  return {
    key: MEMORY_PROJECTION,
    stateVersion: 1,
    stateSchema: { parse: parseView },
    init: (header: unknown): MemoryView => {
      const found = places((header as { readonly cwd?: unknown } | null)?.cwd as string | undefined)
      return { projectJournal: found.project === undefined ? null : join(found.project, 'memory.jsonl'), userJournal: found.user === undefined ? null : join(found.user, 'memory.jsonl') }
    },
    apply: (state: MemoryView): MemoryView => state,
    wire: { viewSchema: { parse: parseView }, view: (state: MemoryView): MemoryView => state },
  }
}

const isIndexNotice = (message: DerivedMessage): boolean => message.role === 'user' && message.source?.kind === INDEX_SOURCE

/** A path as the project knows it: the file named by a source, without a `§section` or `#anchor`. */
const pathOfSource = (text: string): string => text.replace(/\s*[§#].*$/s, '').trim()

/** The project graph of one session, read through the graph row's service. */
async function graphOf(ctx: ServiceLookup, session: SessionLike | undefined): Promise<GraphRead> {
  const cwd = session?.header.cwd
  const dir = cwd === undefined ? undefined : graphService(ctx)?.dirFor(cwd)
  if (dir === undefined) return { ok: false }
  try {
    return { ok: true, nodes: (await loadGraph(dir)).nodes }
  }
  catch (error) {
    return { ok: false, failure: messageOf(error) }
  }
}

/** What the graph and the project's files say about the sources of one session. */
async function sourceCheckFor(ctx: ServiceLookup, session: SessionLike | undefined): Promise<SourceCheck> {
  const cwd = session?.header.cwd
  const graph = await graphOf(ctx, session)
  const nodes = graph.ok ? graph.nodes : undefined
  const root = cwd === undefined ? undefined : projectOf(cwd)?.root ?? resolve(cwd)
  const node = (id: string): ReturnType<SourceCheck['inspect']> => {
    if (nodes === undefined) return 'unchecked'
    const found = nodes.get(id)
    if (found === undefined) return 'missing'
    return found.status === 'dropped' || found.status === 'superseded' ? 'dead' : 'ok'
  }
  const file = (text: string): boolean => {
    if (root === undefined) return false
    const path = resolve(root, pathOfSource(text))
    const inside = relative(root, path)
    if (inside.startsWith('..') || isAbsolute(inside)) return false
    try {
      return statSync(path).isFile() || statSync(path).isDirectory()
    }
    catch {
      return false
    }
  }
  return {
    inspect(ref) {
      if (ref.kind === 'node') return node(ref.id)
      if (ref.kind !== 'other') return 'ok'
      if (file(ref.text)) return 'ok'
      return ID_PATTERN.test(ref.text) ? node(ref.text) : 'missing'
    },
  }
}

/** Where a session has no project, in words for the row health. */
function noProjectReason(cwd: string | undefined): string {
  return cwd === undefined
    ? '会话没有工作目录，本项目范围的记忆不可用'
    : '这个文件夹不是项目（用户主目录、盘符根，或不在 git 仓库里又没有 .llm 文件夹），本项目范围的记忆不可用；要用就在这里建一个 .llm 文件夹'
}

/** The row health of one session: the places, what was found there, and what went wrong. */
function sessionHealth(session: SessionLike, places: Places, read: Both | undefined, notes: ReadonlyMap<NoteKey, string> | undefined, indexed: boolean, homeConfigured: boolean): [HealthState, string] {
  const problems: string[] = [...(notes?.values() ?? [])]
  const parts: string[] = []
  const describe = (label: string, dir: string | undefined, outcome: Both['project']): void => {
    if (dir === undefined || outcome === undefined) return
    if (!outcome.ok) {
      problems.push(`${label}记忆读不出：${outcome.reason}`)
      return
    }
    const entries = [...outcome.read.state.entries.values()].filter(entry => entry.status === 'active')
    parts.push(`${label} ${dir}（偏好 ${entries.filter(entry => entry.kind === 'preference').length}、事实 ${entries.filter(entry => entry.kind === 'fact').length}）`)
    if (outcome.read.bad > 0) problems.push(`${label}流水有 ${outcome.read.bad} 行读不出`)
    if (outcome.read.size > MAX_JOURNAL_BYTES) problems.push(`${label}流水超过 8 MiB`)
    if (outcome.read.fromLegacy) problems.push('旧的 memory.json 还没迁移，下一次写入时迁移')
  }
  if (places.project === undefined) problems.push(noProjectReason(session.header.cwd))
  describe('项目', places.project, read?.project)
  if (places.user === undefined) problems.push('数据目录行未启用：用户级的记忆不可用，用量不记录')
  describe('用户级', places.user, read?.user)
  parts.push(indexed ? '本会话已带索引' : '本会话还没带索引')
  if (homeConfigured) parts.push('行配置 home 已不再使用（M5），项目目录跟会话的工作区')
  return [problems.length === 0 ? 'active' : 'degraded', [...parts, ...problems].join('；')]
}

/**
 * cordis plugin entry: registers the memory tools, listens to agent creation
 * (the index for a root agent, the tool filter for a delegated child),
 * records usage per model call, and provides the service, `/memory` and the
 * projection. A part that cannot be set up warns once and shows in the row
 * health; activation must never throw, because an activation failure takes
 * the whole host startup down.
 */
export function apply(ctx: MemoryContext, config: MemoryConfig = {}): () => void {
  const disposers: Array<() => void> = []
  const now = config.now ?? ((): Date => new Date())
  const notebook = sessionNotebook<NoteKey>()
  const reads = new Map<string, Both>()
  const indexed = new Set<string>()
  const waiting = { commands: WAITING_COMMANDS as string | undefined, projection: WAITING_PROJECTION as string | undefined }
  let registration: string | undefined
  let service: string | undefined
  let rule: string | undefined
  const homeConfigured = config.home !== undefined && config.home.length > 0
  const activation = (): [HealthState, string] => {
    const problems = [registration, service, rule, waiting.commands, waiting.projection].filter((text): text is string => text !== undefined)
    const note = homeConfigured ? '；行配置 home 已不再使用（M5），项目目录跟会话的工作区' : ''
    if (registration !== undefined) return ['inactive', `${registration}${note}`]
    return [problems.length === 0 ? 'active' : 'degraded', `记忆工具已注册，项目目录跟会话的工作区${problems.length === 0 ? '' : `；${problems.join('；')}`}${note}`]
  }
  const health: RowHealth = provideRowHealth(ctx, 'memory', ...activation())
  disposers.push(() => { health.dispose() })

  const placesFor = (cwd: string | undefined): Places => {
    const data = dataService(ctx)
    const project = data?.projectDirOf !== undefined ? data.projectDirOf(cwd) : cwd === undefined ? undefined : projectDirOf(cwd)
    return { ...(project === undefined ? {} : { project }), ...(data === undefined ? {} : { user: join(data.userHome, 'memory') }) }
  }
  const warnOnce = warnOnceFor(name)
  const answers = answersOf(ctx)
  const env: MemoryEnv = {
    places: session => placesFor(session?.header.cwd),
    sources: session => sourceCheckFor(ctx, session),
    graph: session => graphOf(ctx, session),
    talk: session => answers.talkOf(session),
    now,
    note: notebook.note,
    ...(config.append === undefined ? {} : { append: config.append }),
  }

  /** Report the session's health from what the row last read and noted. */
  const report = (session: SessionLike): void => {
    health.report(session.id, ...sessionHealth(session, env.places(session), reads.get(session.id), notebook.notesOf(session.id), indexed.has(session.id), homeConfigured))
  }

  const registered: Array<() => void> = []
  try {
    for (const tool of [...memoryTools(env), ...learningTools(env)]) registered.push(ctx.tools.register(tool))
    disposers.push(...registered)
  }
  catch (error) {
    for (const dispose of registered.splice(0).reverse()) dispose()
    console.warn(`${name}: registering the memory tools failed, the memory tools stay off: ${messageOf(error)}`)
    registration = `记忆工具注册失败，已全部撤掉：${messageOf(error)}`
  }

  // The code rule habit-ask-first (src/memory/habit-rule.ts): installed through the gate with the tools, so it
  // denies from the day the row is enabled; a denial goes to the violation journal of the session's project
  // directory, the one the memory of the session lives in. A host without the tool seam judges nothing and
  // the health says so.
  if (registration === undefined) {
    const preExecute = (ctx as unknown as Partial<PreExecuteHost>).on
    if (typeof preExecute === 'function') {
      try {
        const violations = projectJournal(name, cwd => placesFor(cwd).project, config.fs)
        disposers.push(installHabitRule({
          ctx: ctx as unknown as PreExecuteHost & ServiceLookup & SessionEventHost,
          journal: (record, cwd) => violations.violation(record, cwd),
          flush: () => violations.flush(),
          health,
        }))
      }
      catch (error) {
        console.warn(`${name}: the rule ${HABIT_ASK_FIRST} is not installed: ${messageOf(error)}`)
        rule = `规则 ${HABIT_ASK_FIRST} 没装上，没经问话的习惯拦不住：${messageOf(error)}`
      }
    }
    else rule = `规则 ${HABIT_ASK_FIRST} 没装上：宿主没有 tools/pre-execute 接缝`
  }

  const rowService = memoryRowService(env, text => { warnOnce('depth', text) })
  if (typeof ctx.provide === 'function') {
    try {
      disposers.push(ctx.provide(MEMORY_SERVICE, rowService))
    }
    catch (error) {
      warnOnce('service', `${MEMORY_SERVICE} is not provided (the dialect reads the reporting depth from its configuration): ${messageOf(error)}`)
      service = `服务 ${MEMORY_SERVICE} 没提供上：${messageOf(error)}`
    }
  }
  else service = `宿主没有 provide，服务 ${MEMORY_SERVICE} 没提供`

  /** The index of a root agent: one reminder when the request-visible history has none (a session start, or after a compaction). */
  const installIndex = (agent: AgentLike): (() => void) | undefined => installStepNotice(agent, 'memory index', () => true, async (history, { session }) => {
    try {
      const read = await readBoth(env.places(session))
      reads.set(session.id, read)
      const states = [read.project, read.user].map(outcome => outcome?.ok === true ? outcome.read.state : undefined)
      const failed = [read.project, read.user].find(outcome => outcome?.ok === false)
      env.note(session.id, 'index', failed === undefined ? undefined : '索引不全：有一份记忆读不出')
      const have = history.some(isIndexNotice)
      if (have) indexed.add(session.id)
      const index = have ? undefined : renderIndex(visibleEntries(states[0], states[1]), now().toISOString())
      if (index !== undefined) indexed.add(session.id)
      report(session)
      if (index === undefined) return undefined
      return createUserNotice(INDEX_SOURCE, 'memory index', index.text, { entries: index.listed, faded: index.faded, truncated: index.truncated, digest: createHash('sha256').update(index.text).digest('hex').slice(0, 16) })
    }
    catch (error) {
      warnOnce('index', `the memory index failed: ${messageOf(error)}`)
      env.note(session.id, 'index', `索引提醒出错：${messageOf(error)}`)
      report(session)
      return undefined
    }
  }, 'memory')

  /** A delegated child's request loses the memory tools and the learning tool. */
  const hideTools = (agent: AgentLike): (() => void) => agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    return { ...assembled, tools: assembled.tools.filter(tool => !MEMORY_TOOL_NAMES.includes(tool.name) && !LEARNING_TOOL_NAMES.includes(tool.name)) }
  })

  /** The learning digest reminder of a root agent: installed first, so the index comes before it in a step that has both. */
  const installLearning = learningNotice({ ctx, env, report, warn: warnOnce })

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    try {
      const offs = agent.session?.header.origin === 'subagent' ? [hideTools(agent)] : [installLearning(agent), installIndex(agent)]
      for (const off of offs) if (off !== undefined) disposers.push(off)
    }
    catch (error) {
      console.warn(`${name}: the memory is not installed for agent ${agent.id}: ${messageOf(error)}`)
    }
  }))

  const journal = rowJournal(name, () => dataHomes(ctx, undefined), config.fs)
  disposers.push(ctx.on('llm/stream', (options, next) => (async function* () {
    let usage: TokenUsage | undefined
    for await (const chunk of next()) {
      if (chunk.type === 'usage') usage = chunk.usage
      yield chunk
    }
    if (usage !== undefined) {
      const record: UsageRecord = {
        at: new Date().toISOString(),
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        provider: options.provider,
        model: options.model,
        ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
        usage,
      }
      void journal.usage(record)
    }
  })()))

  // The commands and the projection arrive when their services do; without them the tools and the index work all the same.
  const optional = { name, ctx, waiting, health, activation }
  whenPresent(optional, 'commands', 'commands', WAITING_COMMANDS, '命令 /memory', ({ commands }) => commands.register(memoryCommand(env)))
  whenPresent(optional, 'sessionProjections', 'projection', WAITING_PROJECTION, '会话投影 hournessMemory', ({ sessionProjections }) => sessionProjections.register(projectionFor(placesFor)))

  health.reactivate(...activation())
  return () => { for (const dispose of disposers.splice(0).reverse()) dispose() }
}
