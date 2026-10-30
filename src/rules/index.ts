/**
 * glm-hourness/rules row entry (docs/ORCHESTRATION.md §16): the first slice
 * of the rules board. A project has a peak mode, chosen by the person:
 * 无影响 (inform), 少做 (reduce, the default) or 不做 (stop). The row keeps
 * the choice (the repository's `docs/rules/rules.json`, with the journal
 * and snapshot in the project's `.llm/rules/`), changes it only when the
 * person types `/rules peak`, and hands it to the rows that read it through
 * the service `glmHournessPeakMode`: the dispatch tool counts running GLM
 * subagents against `glmWorkerCap` (at most 1 under `reduce` during a peak),
 * and asks `peakHoldFor` whether the peak holds a session's work back.
 *
 * Nothing here holds or delays any agent: the main agent is never touched by
 * a level, and this slice queues and pauses nothing. It adds no dispatch
 * logic; the cap is a number the service exposes.
 *
 * The row registers `/rules` and provides the service; activation never
 * throws. A failed registration or provision warns once and degrades the
 * row's health with the reason; a problem the storage finds is reported per
 * session (row-health.ts). It ships disabled (packages/hourness/cordis.patch.yml).
 */
import { basename } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import type { AgentCommandInvocationLike, AgentLike, AgentsService, CommandDefinitionLike, CommandResultLike, CommandsHost, ProvideHost, ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import { PEAK_LEVEL_WORDS, PEAK_MODE_SERVICE, peakModeIntro, type PeakModeState } from '../shared/peak-mode.ts'
import { openRulesBoard, type ApplyError } from './engine.ts'
import { parsePeakLevel } from './model.ts'
import { peakModeServiceFor, peakReader, projectReader, stateOf, type ProjectView } from './peak.ts'
import { gitOperationIn, readProject } from './repo.ts'
import { projectHealth } from './row-health.ts'
import { DEFAULT_RULES_DIR, type StoreIo } from './store.ts'

export interface RulesConfig {
  /** The rules directory in the repository: relative to the project root, or absolute (the probe and tests). Default docs/rules. */
  readonly dir?: string
  /** The clock, for tests; default `Date.now`. */
  readonly now?: () => number
  /** The storage's file operations that tests replace (a rename that fails). */
  readonly io?: StoreIo
}

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/rules'
export const inject = ['commands']

/** The command name; its definition id is `dsh-glm-hourness/rules`. */
export const RULES_COMMAND = 'rules'

const USAGE = '用法：/rules peak [无影响|少做|不做]。规则板现在只有高峰模式这一项；不带档位就是看现在是哪一档。'
const NOT_A_PROJECT = '这个会话没有工作目录，或不在项目里（用户主目录、盘符根，或既没有 .git 也没有 .llm 的文件夹），规则板找不到项目，高峰模式不起作用。'

/** The row's context: the commands service, the agent lifecycle and session end events, optional service provision and lookup. */
export interface RulesContext extends CommandsHost<AgentCommandInvocationLike>, ServiceLookup, Partial<ProvideHost> {
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  on(event: 'session/disposed', listener: (session: SessionLike) => void): () => void
}

const pad = (value: number): string => String(value).padStart(2, '0')
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** A moment as the person reads it: `HH:MM` today, `周X HH:MM` on another day, in the machine's time zone. */
export function clockText(iso: string, nowMs: number): string {
  const at = new Date(iso)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return at.toDateString() === new Date(nowMs).toDateString() ? time : `周${WEEKDAYS[at.getDay()]} ${time}`
}

/** One sentence about the clock: is it peak, until when. */
function peakLine(state: PeakModeState, why: string | undefined, nowMs: number): string {
  if (state.peak === undefined) return `读不到是不是高峰（${why ?? '原因不明'}），这一档现在不生效。`
  const until = state.until === undefined ? undefined : clockText(state.until, nowMs)
  if (state.peak) return until === undefined ? '现在是高峰。' : `现在是高峰，到 ${until}。`
  return until === undefined ? '现在不是高峰。' : `现在不是高峰，下一次 ${until} 开始。`
}

const chosen = (state: PeakModeState, nowMs: number): string => state.origin === 'human' && state.at !== undefined ? `你在 ${clockText(state.at, nowMs)} 选的` : '出厂默认'

function failureText(error: ApplyError): string {
  if (error.code === 'busy' || error.code === 'io') return error.message
  return `高峰模式没有改：${error.message}${error.hint === undefined ? '' : `。${error.hint}`}`
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** cordis plugin entry: register /rules, provide the service and the row health. Activation never throws. */
export function apply(ctx: RulesContext, config: RulesConfig = {}): () => void {
  const configured: unknown = config.dir ?? DEFAULT_RULES_DIR
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; the rules row stays off`)
    const off = provideRowHealth(ctx, 'rules', 'inactive', 'config.dir 不是非空路径，规则板未启用')
    return () => { off.dispose() }
  }
  const rulesDir: string = configured
  const now = config.now ?? ((): number => Date.now())
  const sessions = new Map<string, string>()
  const reading = peakReader(ctx, now)
  const read = projectReader(rulesDir)
  const disposers: Array<() => void> = []
  const problems: string[] = []

  // A session this host has not seen is looked up in the host's agent registry, so a row enabled mid-run still answers.
  const cwdOf = (sessionId: string): string | undefined => {
    const known = sessions.get(sessionId)
    if (known !== undefined) return known
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') as AgentsService | undefined : undefined
    return typeof agents?.get === 'function' ? agents.get(sessionId)?.session.header.cwd : undefined
  }

  const activation = (): readonly [HealthState, string] => [
    problems.length === 0 ? 'active' : 'degraded',
    [`命令 /${RULES_COMMAND} 与高峰模式服务 ${PEAK_MODE_SERVICE} 已就绪`, ...problems].join('；'),
  ]
  const health: RowHealth = provideRowHealth(ctx, 'rules', ...activation())
  disposers.push(() => { health.dispose() })

  /** Persist what the project's files need (a recovery, the start from the rules file, an owed write), then report the session's health. Never throws. */
  async function settle(sessionId: string | undefined, cwd: string | undefined): Promise<ProjectView | undefined> {
    try {
      const project = cwd === undefined ? undefined : projectOf(cwd)
      if (project === undefined) {
        if (sessionId !== undefined) health.report(sessionId, 'degraded', NOT_A_PROJECT)
        return undefined
      }
      const board = openRulesBoard({ projectRoot: project.root, rulesDir, ...(config.io === undefined ? {} : { io: config.io }) })
      const settled = await board.settle()
      const view: ProjectView = { paths: board.paths, read: settled === 'busy' ? readProject(board.paths) : settled }
      if (sessionId !== undefined) health.report(sessionId, ...projectHealth(basename(project.root), view.read, reading(), gitOperationIn(project.root)))
      return view
    }
    catch (error) {
      if (sessionId !== undefined) health.report(sessionId, 'degraded', `读规则板的状态失败：${message(error)}`)
      return undefined
    }
  }

  async function rulesCommand(invocation: AgentCommandInvocationLike): Promise<CommandResultLike> {
    const cwd = invocation.agent.session.header.cwd
    const sessionId = invocation.agent.id
    if (cwd !== undefined) sessions.set(sessionId, cwd)
    const [sub, ...rest] = invocation.rawInput.trim().split(/\s+/).filter(word => word !== '')
    if (sub !== 'peak' || rest.length > 1) return { kind: 'error', text: USAGE }
    const project = cwd === undefined ? undefined : projectOf(cwd)
    if (project === undefined) return { kind: 'error', text: NOT_A_PROJECT }
    const [word] = rest
    if (word === undefined) {
      const view = await settle(sessionId, cwd)
      if (view === undefined) return { kind: 'error', text: '读不出规则板的状态，行健康里有原因。' }
      const clock = reading()
      const state = stateOf(view.read, clock)
      return { kind: 'success', text: `高峰模式：${PEAK_LEVEL_WORDS[state.level].name}（${chosen(state, now())}）。${peakLine(state, clock.why, now())}\n\n${peakModeIntro()}` }
    }
    const level = parsePeakLevel(word)
    if (level === undefined) return { kind: 'error', text: `不认识档位「${word}」。${USAGE}` }
    const words = PEAK_LEVEL_WORDS[level]
    const board = openRulesBoard({ projectRoot: project.root, rulesDir, ...(config.io === undefined ? {} : { io: config.io }) })
    const result = await board.apply('human', { op: 'peak-mode-set', level, reason: `人用 /rules peak 把高峰模式改成了「${words.name}」` })
    const view = await settle(sessionId, cwd)
    if (!result.ok) return { kind: 'error', text: failureText(result.error) }
    if (!result.changed) return { kind: 'success', text: `高峰模式已经是「${words.name}」，没有改动。` }
    const clock = reading()
    const line = view === undefined ? '' : peakLine(stateOf(view.read, clock), clock.why, now())
    const file = result.file === 'deferred' ? '仓库里的规则文件等 git 做完合并或变基再写。' : result.file === 'failed' ? '仓库里的规则文件没写成，下次读状态时补写。' : ''
    return {
      kind: 'success',
      text: `高峰模式改成了「${words.name}」（${words.half}）。${line}${file}\n档位已记下，派活和提醒那几块读它；这一版没有排队和暂停，不拦任何调用。`,
    }
  }

  const definition: CommandDefinitionLike<AgentCommandInvocationLike> = {
    definitionId: name,
    name: RULES_COMMAND,
    description: '规则板：看或改这个项目的高峰模式',
    input: { hint: 'peak [无影响|少做|不做]' },
    handler: rulesCommand,
  }
  try {
    disposers.push(ctx.commands.register(definition))
  }
  catch (error) {
    console.warn(`${name}: registering /${RULES_COMMAND} failed, the level cannot be changed: ${message(error)}`)
    problems.push(`/${RULES_COMMAND} 注册失败，档位改不了：${message(error)}`)
  }

  if (typeof ctx.provide === 'function') {
    try {
      disposers.push(ctx.provide(PEAK_MODE_SERVICE, peakModeServiceFor({ cwdOf, project: read, peak: reading })))
    }
    catch (error) {
      console.warn(`${name}: ${PEAK_MODE_SERVICE} is not provided (dispatch keeps its own slots, the GLM reminder keeps today's text): ${message(error)}`)
      problems.push(`服务 ${PEAK_MODE_SERVICE} 没提供上：${message(error)}（派活照原来的槽位，GLM 提醒照原文）`)
    }
  }
  else problems.push(`宿主没有 provide，服务 ${PEAK_MODE_SERVICE} 没提供`)

  try {
    disposers.push(ctx.on('agent/created', async ({ agent }) => {
      const sessionId = sessionIdOf(agent)
      const cwd = agent.session?.header.cwd
      if (sessionId !== undefined && cwd !== undefined) sessions.set(sessionId, cwd)
      await settle(sessionId, cwd)
    }))
    disposers.push(ctx.on('session/disposed', (session) => { sessions.delete(session.id) }))
  }
  catch (error) {
    console.warn(`${name}: the session listeners are not registered, the row answers only for sessions it finds in the agent registry: ${message(error)}`)
    problems.push(`会话事件没注册上：${message(error)}`)
  }

  health.reactivate(...activation())
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
  }
}
