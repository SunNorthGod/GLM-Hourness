/**
 * glm-hourness/rules row entry (docs/ORCHESTRATION.md §16): the rules board. A
 * project has rules its person set, kept in the repository (`docs/rules/rules.json`,
 * with the journal and snapshot in the project's `.llm/rules/`), and a peak
 * mode: 无影响 (inform), 少做 (reduce, the default) or 不做 (stop).
 *
 * What the row does:
 * - the tool-call gate (gate.ts): registered outermost on `tools/pre-execute`,
 *   it keeps the board's own files to the board (`rules:files-only`) and
 *   judges every call that the gates inside it let through against the rules:
 *   a blocking rule refuses the call with the reason, a recording rule leaves a
 *   line in the violation journal, rules that only inform change nothing;
 * - `rules_show` (tool.ts): the tool an agent reads the rules that hold it with;
 * - `/rules` (commands.ts): the person looks at the rules and changes what they
 *   may: the peak mode, a rule's lifting or deletion, a switch, a waiting call;
 * - the service `glmHournessPeakMode`: the dispatch tool counts running GLM
 *   subagents against `glmWorkerCap` (at most 1 under `reduce` during a peak),
 *   and asks `peakHoldFor` whether the peak holds a session's work back;
 * - the service `glmHournessRules`, whose one member is the line the guard adds
 *   to its prompt section while this row is on;
 * - the status view `glmHournessStatus/rules` (src/rules/status.ts): the status
 *   hub's one `rules/peak` entry, the peak-hours line from the pricing service
 *   with the project's level in the fields, the one source the report face and
 *   the rules board's page read;
 * - waiting tickets (tickets.ts): a call a rule of the person queues is refused
 *   with a ticket, judged again every 5 seconds by the host that owns it, and
 *   the agent is told once when it clears; a subagent's ticket goes to the
 *   agent that dispatched it when its session ends;
 * - the heartbeat (heartbeat.ts) every 15 seconds in each project the host has
 *   a live session in, which is how a ticket's host is known to be there;
 * - the per-step reminder (reminder.ts) of the rules that only inform and of
 *   the agent's own tickets;
 * - the rules page's data (view-build.ts, view-writer.ts): each known
 *   project's `.llm/rules/view.json`, written after a session starts, after
 *   `/rules`, a second after a journal line of the gate and every 15 seconds,
 *   and the session projection `hournessRules` (projection.ts) the panel
 *   finds it with.
 *
 * - the stop level (goal.ts, tickets.ts): in a GLM peak the tool calls of a GLM
 *   subagent are one ticket for its session and its active goal is paused;
 *   dispatching a GLM subagent is an ordinary ticket on the agent that
 *   dispatches. When the peak is over, or the person changes the level or lets
 *   the session work, the goal is resumed and the agent told. A host takes over
 *   the stop tickets of a session that appears on it after a restart, and a row
 *   that goes resumes the goals it paused.
 *
 * The main agent is never held by a peak level: its own tool calls run and its
 * goal is not paused on any level; it gets a line about the peak and the level
 * at the top of its reminder. Nothing a rule says can be written by an agent;
 * only the person's `/rules`, as the human, changes rules.
 *
 * Activation never throws. A failed registration or provision warns once and
 * degrades the row's health with the reason; a gate that cannot be installed
 * makes the row inactive; a problem the storage finds is reported per session
 * (row-health.ts). The row ships disabled (packages/hourness/cordis.patch.yml).
 */
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { projectHomeFor } from '../data/project-home.ts'
import { projectOf } from '../data/project-root.ts'
import { liftService } from '../guard/lift-service.ts'
import { auditPaths, projectJournal, type ProjectJournal } from '../memory/audit.ts'
import { collectStatus } from '../report/status.ts'
import type { AgentCommandInvocationLike, AgentLike, AgentsService, CommandDefinitionLike, CommandResultLike, CommandsHost, InjectHost, PreExecuteListener, ProvideHost, ServiceLookup, SessionLike, ToolsLike } from '../shared/dsh-min.ts'
import { activationState, provideRowHealth, sessionIdOf, type HealthState, type RowHealth } from '../shared/health.ts'
import { PEAK_MODE_SERVICE } from '../shared/peak-mode.ts'
import { peakHoursOf, pricingService } from '../shared/pricing.ts'
import { whenPresent } from '../shared/row-support.ts'
import { provideRowStatus } from '../shared/status-host.ts'
import { RULES_TOOL_NAMES } from '../shared/tool-names.ts'
import { CATALOG } from './builtin.ts'
import { NOT_A_PROJECT, RULES_HINT, runRulesCommand } from './commands.ts'
import { openRulesBoard } from './engine.ts'
import { installRulesGate } from './gate.ts'
import { createHeartbeat, liveHeartbeats, readHeartbeats, type HostHeartbeat } from './heartbeat.ts'
import { peakModeServiceFor, peakReader, projectReader, type ProjectView } from './peak.ts'
import { RULES_KEY, rulesProjection } from './projection.ts'
import { gitOperationIn, readProject } from './repo.ts'
import { installReminder } from './reminder.ts'
import type { HostRef } from './request.ts'
import { projectHealth } from './row-health.ts'
import { RULES_DECLARATION, RULES_SERVICE, type RulesService } from './service.ts'
import { rulesStatusItems } from './status.ts'
import { DEFAULT_RULES_DIR, realStoreIo, type RulesPaths, type StoreIo } from './store.ts'
import { createTicketDesk } from './tickets.ts'
import { rulesShowTool } from './tool.ts'
import { buildRulesView, VIEW_ROWS } from './view-build.ts'
import { journalsReader } from './view-journal.ts'
import { createViewWriter } from './view-writer.ts'
import type { RulesView } from './view.ts'

export { clockText } from './commands.ts'

/** The period of the host's re-judgement of its waiting tickets, and of its heartbeat (design §6.3, §5.4). */
export const PASS_MS = 5_000
export const BEAT_MS = 15_000

/** A repeating timer: `tick` every `everyMs` until the returned function is called. A tick never rejects. */
export type IntervalTimer = (tick: () => Promise<void>, everyMs: number) => () => void

const realTimer: IntervalTimer = (tick, everyMs) => {
  const handle = setInterval(() => { void tick() }, everyMs)
  // The row's timers never keep the host process alive.
  handle.unref()
  return () => { clearInterval(handle) }
}

export interface RulesConfig {
  /** The rules directory in the repository: relative to the project root, or absolute (the probe and tests). Default docs/rules. */
  readonly dir?: string
  /** The project directory (workspace `.llm`) for the violation journal; without it each record goes to the `.llm` of the session's project, else to the data service's (projectHomeFor). */
  readonly home?: string
  /** The clock, for tests; default `Date.now`. */
  readonly now?: () => number
  /** The storage's file operations that tests replace (a rename that fails). */
  readonly io?: StoreIo
  /** The repeating timer, for tests that run the 5-second and 15-second periods by hand; default `setInterval`, unref'd. */
  readonly timer?: IntervalTimer
}

/** cordis plugin identity: needs the tools and commands services. */
export const name = 'dsh-glm-hourness/rules'
export const inject = ['tools', 'commands']

/** The command name; its definition id is `dsh-glm-hourness/rules`. */
export const RULES_COMMAND = 'rules'

const WAITING_PROJECTION = `会话投影 ${RULES_KEY} 等 sessionProjections 服务`

/** The row's context: the tools and commands services, the tool-call gate, the agent lifecycle and session end events, optional service provision, lookup and injection (the session projections). */
export interface RulesContext extends CommandsHost<AgentCommandInvocationLike>, ServiceLookup, Partial<ProvideHost>, Partial<InjectHost> {
  readonly tools: ToolsLike
  on(event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
  on(event: 'session/disposed', listener: (session: SessionLike) => void): () => void
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A warning on the host log, each distinct one said once. */
function onceWarner(): (text: string) => void {
  const said = new Set<string>()
  return (text) => {
    if (said.has(text)) return
    said.add(text)
    console.warn(`${name}: ${text}`)
  }
}

/** What the row does on its way out: undefined when it is done at once, else a promise that ends when the goals the stop level paused are resumed and written down (at most two seconds). */
export type Unload = () => Promise<void> | undefined

/** cordis plugin entry: register /rules and rules_show, install the gate, provide the services and the row health. Activation never throws. */
export function apply(ctx: RulesContext, config: RulesConfig = {}): Unload {
  const configured: unknown = config.dir ?? DEFAULT_RULES_DIR
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    console.warn(`${name}: config.dir must be a non-empty path; the rules row stays off`)
    const off = provideRowHealth(ctx, 'rules', 'inactive', 'config.dir 不是非空路径，规则板未启用')
    return () => {
      off.dispose()
      return undefined
    }
  }
  const rulesDir: string = configured
  const now = config.now ?? ((): number => Date.now())
  const sessions = new Map<string, string>()
  const reading = peakReader(ctx, now)
  const read = projectReader(rulesDir)
  const disposers: Array<() => void> = []
  const problems: string[] = []
  /** What the optional services are waiting for (whenPresent): the session projection the rules page finds its data with. */
  const waiting: Record<string, string | undefined> = { projection: WAITING_PROJECTION }
  /** Why the rules page's data cannot be written, until the next write succeeds. */
  let viewProblem: string | undefined
  let gateInstalled = false

  // A session this host has not seen is looked up in the host's agent registry, so a row enabled mid-run still answers.
  const cwdOf = (sessionId: string): string | undefined => {
    const known = sessions.get(sessionId)
    if (known !== undefined) return known
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') as AgentsService | undefined : undefined
    return typeof agents?.get === 'function' ? agents.get(sessionId)?.session.header.cwd : undefined
  }

  const activation = (): [HealthState, string] => {
    const faults = [...problems, ...Object.values(waiting).flatMap(text => text ?? []), ...(viewProblem === undefined ? [] : [viewProblem])]
    return [
      !gateInstalled ? 'inactive' : faults.length === 0 ? 'active' : 'degraded',
      [`命令 /${RULES_COMMAND}、工具 ${RULES_TOOL_NAMES.join('、')} 与高峰模式服务 ${PEAK_MODE_SERVICE} 已就绪`, ...faults].join('；'),
    ]
  }
  const health: RowHealth = provideRowHealth(ctx, 'rules', ...activation())
  disposers.push(() => { health.dispose() })

  const warn = onceWarner()
  const host: HostRef = { pid: process.pid, startedAt: Date.now() }
  const heartbeat = createHeartbeat({
    host,
    rulesDir,
    now,
    io: config.io ?? realStoreIo,
    peak: reading,
    catalog: (): HostHeartbeat['catalog'] => CATALOG.map(entry => ({ id: entry.id, state: activationState(ctx, entry.row), ...(entry.toldBy === undefined ? {} : { toldState: activationState(ctx, entry.toldBy) }) })),
    // The writer owes one warning per run of failures, and says so again after a success.
    warn: (text) => { console.warn(`${name}: ${text}`) },
  })
  const tickets = createTicketDesk({ ctx, rulesDir, now, io: config.io, host, project: read, peak: reading, health, heartbeat, warn })
  const reminders = new Map<string, () => void>()
  // What is left to do once the goals are right: the heartbeat goes last, since the tickets are the host's only while it is there.
  const finish = (): void => {
    tickets.stop()
    heartbeat.stop()
    for (const off of reminders.values()) off()
    reminders.clear()
  }

  /**
   * The rules page's data of each project a known session works in (§16.14), or of the project of `only`:
   * the project's state, the project's violation journal (the one the row's own gate and the guard
   * framework's rows write, and the guard status view reads), the lifts, the heartbeats, the row states
   * and the collector's items with owner `rules`, asked with one session of the project. Computed on the
   * spot, the journal reread only when it changed (view-journal.ts); a project whose data cannot be read
   * is left out with a warning.
   */
  const journals = journalsReader()
  function composeViews(only?: string): Array<{ readonly paths: RulesPaths, readonly view: RulesView }> {
    const target = only === undefined ? undefined : projectOf(only)?.root
    const projects = new Map<string, { readonly sessionId: string, readonly cwd: string }>()
    for (const [sessionId, cwd] of sessions) {
      const root = projectOf(cwd)?.root
      if (root !== undefined && (only === undefined || root === target) && !projects.has(root)) projects.set(root, { sessionId, cwd })
    }
    const views: Array<{ readonly paths: RulesPaths, readonly view: RulesView }> = []
    for (const [root, { sessionId, cwd }] of projects) {
      try {
        const project = read(cwd)
        if (project === undefined) continue
        const at = now()
        const projectHome = projectHomeFor(ctx, config.home, cwd)
        const records = journals([projectHome === undefined ? undefined : auditPaths({ projectHome }).violations])
        const pricing = pricingService(ctx)
        const collected = collectStatus(ctx, sessionId, 'all', at)
        const scripts = Object.values(project.read.state.rules ?? {}).flatMap(rule => rule.action.kind === 'script' ? [{ id: rule.id, file: rule.action.script.file }] : [])
        const view = buildRulesView({
          root,
          read: project.read,
          reading: reading(),
          hoursZh: pricing === undefined ? undefined : peakHoursOf(pricing)?.zh,
          rows: Object.fromEntries(VIEW_ROWS.map(row => [row, activationState(ctx, row)])),
          records,
          lifted: liftService(ctx)?.lifted(cwd) ?? [],
          liveHosts: liveHeartbeats(readHeartbeats(project.paths).heartbeats, at).map(heartbeat => heartbeat.host),
          missingScripts: new Set(scripts.filter(script => !existsSync(join(root, script.file))).map(script => script.id)),
          items: collected.items.filter(item => item.owner === 'rules'),
          statusProblems: collected.rows.flatMap(row => row.outcome === 'error' && (row.row === 'rules' || row.row === 'guard') ? [{ row: row.row, reason: row.reason ?? '' }] : []),
          host: { pid: host.pid },
        }, at)
        views.push({ paths: project.paths, view })
      }
      catch (error) {
        warn(`the rules page's data of ${root} cannot be computed: ${message(error)}`)
      }
    }
    return views
  }
  const pageView = createViewWriter({
    compose: composeViews,
    io: config.io ?? realStoreIo,
    failed: (reason) => {
      viewProblem = reason === undefined ? undefined : `规则页的数据写不出：${reason}`
      // The row's line of every known session says it too, not only the activation a session without a report shows.
      for (const sessionId of sessions.keys()) health.note(sessionId, 'view', viewProblem)
      health.reactivate(...activation())
    },
    warn: (text) => { console.warn(`${name}: ${text}`) },
  })

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
    const result = await runRulesCommand(invocation.rawInput, cwd === undefined ? undefined : projectOf(cwd), {
      rulesDir,
      ...(config.io === undefined ? {} : { io: config.io }),
      now,
      peak: reading,
      settle: () => settle(sessionId, cwd),
    })
    // What the person changed may clear a ticket now; the period would find it in five seconds.
    await tickets.reconcile()
    // The rules page shows what the command changed (the writer never rejects).
    if (cwd !== undefined) await pageView.write(cwd)
    return result
  }

  const definition: CommandDefinitionLike<AgentCommandInvocationLike> = {
    definitionId: name,
    name: RULES_COMMAND,
    description: '规则板：看规则，改高峰模式，处理你定的规则、开关和等待单',
    input: { hint: RULES_HINT },
    handler: rulesCommand,
  }
  try {
    disposers.push(ctx.commands.register(definition))
  }
  catch (error) {
    console.warn(`${name}: registering /${RULES_COMMAND} failed, the level cannot be changed: ${message(error)}`)
    problems.push(`/${RULES_COMMAND} 注册失败，档位改不了：${message(error)}`)
  }

  try {
    disposers.push(ctx.tools.register(rulesShowTool({ ctx, now, project: read, peak: reading })))
  }
  catch (error) {
    console.warn(`${name}: registering ${RULES_TOOL_NAMES.join(', ')} failed, agents cannot read the rules: ${message(error)}`)
    problems.push(`工具 ${RULES_TOOL_NAMES.join('、')} 没注册上：${message(error)}`)
  }

  // The gate's journal; once a line has landed (or failed), the rules page is written again after a quiet second.
  const journal: ProjectJournal = projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd))
  const gateJournal = {
    violation: (record: Parameters<ProjectJournal['violation']>[0], cwd: string | undefined) => {
      const written = journal.violation(record, cwd)
      void written.then(() => { pageView.soon() }, () => { pageView.soon() })
      return written
    },
  }
  try {
    disposers.push(installRulesGate({ ctx, rulesDir, now, project: read, peak: reading, journal: gateJournal, health, tickets }))
    gateInstalled = true
  }
  catch (error) {
    console.warn(`${name}: the tool-call gate is not installed, the row executes no rule: ${message(error)}`)
    problems.push(`工具调用的门没装上，这一行不执行任何规则：${message(error)}`)
  }

  if (typeof ctx.provide === 'function') {
    try {
      disposers.push(ctx.provide(PEAK_MODE_SERVICE, peakModeServiceFor({ cwdOf, project: read, peak: reading })))
    }
    catch (error) {
      console.warn(`${name}: ${PEAK_MODE_SERVICE} is not provided (dispatch keeps its own slots, the GLM reminder keeps today's text): ${message(error)}`)
      problems.push(`服务 ${PEAK_MODE_SERVICE} 没提供上：${message(error)}（派活照原来的槽位，GLM 提醒照原文）`)
    }
    try {
      const service: RulesService = { declaration: RULES_DECLARATION }
      disposers.push(ctx.provide(RULES_SERVICE, service))
    }
    catch (error) {
      console.warn(`${name}: ${RULES_SERVICE} is not provided (the guard declares no rules board): ${message(error)}`)
      problems.push(`服务 ${RULES_SERVICE} 没提供上：${message(error)}（guard 的提示词里不写规则板那一行）`)
    }
    // The row's status view (status hub design 0.3 §3.2, §12 rules row): the one rules/peak entry —
    // the peak-hours line from the pricing service with the project's level in the fields — served
    // from rulesStatusItems (src/rules/status.ts), the one source the report face and the rules
    // board's page read. The session's project is read on demand, its files cached by the reader.
    const status = provideRowStatus(ctx, 'rules', (sessionId) => {
      const pricing = pricingService(ctx)
      if (pricing === undefined) return []
      const cwd = sessionId === undefined ? undefined : cwdOf(sessionId)
      const view = cwd === undefined ? undefined : read(cwd)
      return rulesStatusItems(view, reading(), pricing, now())
    })
    disposers.push(() => { status.dispose() })
  }
  else problems.push(`宿主没有 provide，服务 ${PEAK_MODE_SERVICE} 与 ${RULES_SERVICE} 没提供`)

  try {
    disposers.push(ctx.on('agent/created', async ({ agent }) => {
      const sessionId = sessionIdOf(agent)
      const cwd = agent.session?.header.cwd
      if (sessionId !== undefined && cwd !== undefined) sessions.set(sessionId, cwd)
      if (sessionId !== undefined && !reminders.has(sessionId)) {
        const off = installReminder(agent, { ctx, now, project: read, peak: reading, warn })
        if (off !== undefined) reminders.set(sessionId, off)
      }
      if (sessionId !== undefined && cwd !== undefined) await heartbeat.join(sessionId, cwd)
      await settle(sessionId, cwd)
      // A session that appears after a restart may have a goal an earlier host paused for the stop level.
      await tickets.adopt(agent)
      if (cwd !== undefined) await pageView.write(cwd)
    }))
    disposers.push(ctx.on('session/disposed', (session) => {
      sessions.delete(session.id)
      reminders.get(session.id)?.()
      reminders.delete(session.id)
      heartbeat.leave(session.id)
      void tickets.ended(session)
    }))
  }
  catch (error) {
    console.warn(`${name}: the session listeners are not registered, the row answers only for sessions it finds in the agent registry: ${message(error)}`)
    problems.push(`会话事件没注册上：${message(error)}`)
  }

  const every = config.timer ?? realTimer
  const guarded = (run: () => Promise<void>) => async (): Promise<void> => {
    try {
      await run()
    }
    catch (error) {
      warn(`a period of the row failed: ${message(error)}`)
    }
  }
  disposers.push(
    every(guarded(() => tickets.reconcile()), PASS_MS),
    every(guarded(() => heartbeat.beat()), BEAT_MS),
    // The rules page's data follows what no event of this row announces: the guard's denials, the lifts, the clock.
    every(guarded(() => pageView.write()), BEAT_MS),
  )

  // The rules page finds its data through the session projection hournessRules; without the registry the
  // row works all the same and its health says the projection waits (the loop board's way, §18.7).
  whenPresent({ name, ctx, waiting, health, activation }, 'sessionProjections', 'projection', WAITING_PROJECTION, `会话投影 ${RULES_KEY}`, ({ sessionProjections }) => sessionProjections.register(rulesProjection))

  health.reactivate(...activation())
  // The sessions that are live when the row starts: the same takeover as for a session that appears.
  void tickets.adoptLive()
  return () => {
    // Goals the stop level paused are put back first, while the heartbeat still says this host is there, and everything else goes without waiting for them.
    const resuming = tickets.release()
    // The page write the journal still owes is computed now, while the status views are there, and lands before the row is gone.
    const writing = pageView.close()
    for (const dispose of disposers.splice(0).reverse()) dispose()
    if (resuming === undefined && writing === undefined) {
      finish()
      return undefined
    }
    return Promise.all([resuming, writing]).then(() => undefined).finally(finish)
  }
}
