/**
 * glm-hourness/loops row entry (docs/ORCHESTRATION.md §18): the loop board. The
 * board lists what is done when something happens or the time comes: entries
 * from the rows that own them and from the people who add their own. What the
 * row does so far:
 * - provides the service `glmHournessLoops` (service.ts) in a process that has a
 *   session controller, and only there: a row hands its entries, events and
 *   harness actions to `contribute`, and the registry (registry.ts) validates
 *   them, holds them and lists what waits for an event nobody declares. A
 *   process without a session controller (headless, the probe) cannot reach a
 *   session, so it does not hand the service out and runs no entry; the execute
 *   row then runs its own event entries as it does without the board (design
 *   §3.1, §6.1, §11.1);
 * - runs a project's board where it has the service (run.ts): it holds the
 *   project's run lock, beats every 60 seconds, hands the lock to the process
 *   where the main agent's session is open, reads the inbox (inbox.ts) and
 *   executes what an entry says to do. A message for the main agent waits until
 *   that side of the board is built; a person's adopted script entry runs
 *   through the shared executor (script.ts) after the rules board lets it
 *   through, and so does a check entry, whose command the environment row's
 *   service reads from the tool node (`checksSeam`; refused while that row
 *   is off);
 * - runs the end of a GLM peak itself (peak.ts): the harness action of the
 *   loop row's own hand-over takes the table of design §6.9 item 4 — the
 *   execute row's resume action when a hand-over lists it, otherwise the wake
 *   of the main agent alone — and records the peak-start entry's run as the
 *   rules row's work it only lists;
 * - lists projects from the host's workspace registry, so a project with a
 *   main agent runs before any session of it is open (design §6.1);
 * - hands over the loop row's own events (events.ts) as the always-there part of
 *   the event table, and its own four entries (defaults.ts);
 * - keeps the entries a person agreed to (store.ts): files in the repository's
 *   `docs/loops/`, the change record in the project's `.llm/loops/`; settles what
 *   git or an editor changed behind its back whenever a session starts in a
 *   project (boards.ts) and writes the project's `view.json` (view.ts), whose
 *   peak line reads the level from the rules board's service, and writes it
 *   again after every beat of a project it runs, so the page shows the last
 *   runs;
 * - `/loops` (commands.ts): the person lists every entry, deletes one of
 *   theirs, gets one back, or acknowledges a damaged change record;
 * - the gate `loops:files-only` (guard.ts), outermost on `tools/pre-execute`: a
 *   file tool or a shell command that writes into the board's files is denied
 *   from the day the row is enabled;
 * - the session projection `hournessLoops` (projection.ts), where the page finds
 *   the project's `view.json`;
 * - reports its health: ready, or degraded with each thing that is wrong.
 *
 * It registers no tool yet (`loop_show`, `loop_propose` and `loop_note` come
 * with the path of a person's agreement) and binds no reminder of the DSH
 * schedule service yet. Activation never throws: a host without `provide`
 * leaves the row inactive with the reason, and a command, a gate, a projection
 * or a beat that cannot be set up degrades the row and says which. The row
 * ships disabled (packages/hourness/cordis.patch.yml).
 */
import { projectOf } from '../data/project-root.ts'
import { projectHomeFor } from '../data/project-home.ts'
import type { LockEnvironment } from '../data/lock.ts'
import { projectKey } from '../graph/main-agent-holder.ts'
import { projectJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, CommandResultLike, CommandsHost, InjectHost, PreExecuteHost, PreExecuteListener, ProvideHost, ServiceLookup, SessionEventHost, SessionEventLike, SessionLike, WorkspaceRegistryService } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import type { StoreIo } from '../rules/store.ts'
import { realStoreIo } from '../rules/store.ts'
import { statSync } from 'node:fs'
import { realLockEnvironment } from '../data/lock.ts'
import { nextPeakChange, pricingService } from '../shared/pricing.ts'
import { PEAK_LEVEL_WORDS, PEAK_REDUCE_GLM_WORKERS, peakModeService, type PeakModeState } from '../shared/peak-mode.ts'
import { scheduleOf } from './bind.ts'
import { createBoards, realDelay, type Delay } from './boards.ts'
import { CHANNEL_EVENTS, CHANNEL_PEAK_CHANGED } from './channel.ts'
import { LOOPS_HINT, NOT_A_PROJECT, runLoopsCommand } from './commands.ts'
import { LOOP_ACTIONS, LOOP_DEFAULTS } from './defaults.ts'
import { installLoopsFileGuard, installLoopsScheduleGuard, LOOPS_FILES_ONLY, LOOPS_SCHEDULE_TOOLS } from './guard.ts'
import { holderRecordFor } from './holder.ts'
import { LOOPS_KEY, loopsProjection } from './projection.ts'
import { createRegistry, LOOPS_SOURCE } from './registry.ts'
import { installLoopStepNotice, machineStepFile } from './reminder.ts'
import { BEAT_MS, createProjectRuntime, type LoopChecks, type ProjectRuntime } from './run.ts'
import { envService, fillCheckArgv, formatCheckOutput, isCheckFormat } from '../env/env-service.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, type Contribution, type LoopEventInput, type LoopsService } from './service.ts'
import type { PeakView } from './view.ts'

/** cordis plugin identity: needs the commands service. */
export const name = 'dsh-glm-hourness/loops'
export const inject = ['commands']

/** The command name; its definition id is `dsh-glm-hourness/loops`. */
export const LOOPS_COMMAND = 'loops'

export interface LoopsConfig {
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the data service's. */
  readonly home?: string
  /** The storage's file operations and its clock, which tests replace. */
  readonly io?: StoreIo
  /** The write lock's environment, which tests replace. */
  readonly lock?: LockEnvironment
  /** The timer that writes a `view.json` that came too soon after the last one, and the runtime's own one-shot timers; default `setTimeout`, unref'd. */
  readonly delay?: Delay
  /** The beat of the projects that run (every 60 seconds); default `setInterval`, unref'd. Tests drive it themselves. */
  readonly beat?: (run: () => void, ms: number) => () => void
}

/** The beat of the projects: `setInterval`, which never holds the host process open. */
const realBeat = (run: () => void, ms: number): (() => void) => {
  const handle = setInterval(run, ms)
  handle.unref()
  return () => { clearInterval(handle) }
}

/** The size and modification time of the DSH program file, for the `appChanged` of `loops.host-restarted` (design §10.2 V6). */
function appStamp(): string | undefined {
  try {
    const found = statSync(process.execPath)
    return `${found.size}-${Math.round(found.mtimeMs)}`
  }
  catch {
    return undefined
  }
}

/**
 * What the loop row hands to its own registry: the entries and the action of
 * defaults.ts, with the two peak entries only while a pricing service is there
 * (design §5.2; the deferral the review of the registry step recorded). The
 * channel events themselves are not handed over, since the `channel` namespace
 * belongs to no hand-over: the registry takes them from the same service
 * (design §4.3). The run is the row's own peak-end action, dispatched to the
 * runner of the project the event belongs to (design §6.9 item 4).
 */
function ownContribution(hasPricing: boolean, run: NonNullable<Contribution['run']>): Contribution {
  return {
    entries: hasPricing
      ? LOOP_DEFAULTS
      : LOOP_DEFAULTS.filter(entry => entry.when.kind !== 'event' || !entry.when.events.includes(CHANNEL_PEAK_CHANGED)),
    actions: LOOP_ACTIONS,
    run,
  }
}

/** What the row takes from its context. Everything but `provide` is optional: a host that lacks a part degrades the row and says which. */
export interface LoopsContext extends Partial<ProvideHost>, Partial<InjectHost>, ServiceLookup, Partial<CommandsHost<AgentCommandInvocationLike>> {
  readonly on?: {
    (event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
    (event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
    /** The gate's row journal flushes on a disposed session (m4-gate G1). */
    (event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void
    (event: 'session/disposed', listener: (session: SessionLike) => void): () => void
    /** `schedule/changed` has no payload and is sent after a task write landed (schedule:2231–2237). */
    (event: 'schedule/changed', listener: () => Promise<void> | void): () => void
    /** `workspace/session-stop` is sent only when a session is archived with `stopActivity` (dsh-workspace:540, 623). */
    (event: 'workspace/session-stop', listener: (payload: { sessionId: string }) => Promise<void> | void): () => void
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const WAITING_PROJECTION = `会话投影 ${LOOPS_KEY} 等 sessionProjections 服务`

/** What a process that cannot reach a session says: it is not a fault (design §11.1). */
const NO_CONTROLLER = '这个进程不跑循环板（没有会话控制器）'

/** Register the projection once the session projection registry is present; `settled` hears why it is off, or undefined once it is registered. */
function installProjection(ctx: Partial<InjectHost>, settled: (problem: string | undefined) => void): void {
  if (typeof ctx.inject !== 'function') {
    settled('宿主没有 inject，会话投影未注册')
    return
  }
  try {
    ctx.inject(['sessionProjections'], projectionCtx => {
      try {
        projectionCtx.sessionProjections.register(loopsProjection)
      }
      catch (error) {
        console.warn(`${name}: the projection ${LOOPS_KEY} is off: ${message(error)}`)
        settled(`会话投影未注册：${message(error)}`)
        return undefined
      }
      settled(undefined)
      return () => { settled(WAITING_PROJECTION) }
    })
  }
  catch (error) {
    console.warn(`${name}: the projection ${LOOPS_KEY} is off: ${message(error)}`)
    settled(`会话投影未注册：${message(error)}`)
  }
}

/**
 * The board's seam for check entries (run.ts `LoopChecks`) over the environment row's service (m4 design §6.1.2):
 * `checkCommandOf`, `fillCheckArgv` and `formatCheckOutput` of src/env/env-service.ts. undefined while that row is
 * off, so a check entry is refused (`check-missing`). A format the row does not know reads as unreadable output.
 */
export function checksSeam(ctx: ServiceLookup, problem?: (message: string) => void): LoopChecks | undefined {
  const env = envService(ctx, problem)
  if (env === undefined) return undefined
  return {
    commandOf: async (cwd, tool, check) => {
      try {
        return await env.checkCommandOf(cwd, tool, check)
      }
      catch {
        return undefined
      }
    },
    fill: fillCheckArgv,
    present: (format, run) => isCheckFormat(format) ? formatCheckOutput(format, run) : undefined,
  }
}

/** cordis plugin entry: provide the service and the row health, hand over the row's own entries, set up the command, the gate and the projection. Activation never throws. */
export function apply(ctx: LoopsContext, config: LoopsConfig = {}): () => void {
  if (typeof ctx.provide !== 'function') {
    console.warn(`${name}: the host has no provide; the loop board cannot hand out ${LOOPS_SERVICE} and stays off`)
    const off = provideRowHealth(ctx, 'loops', 'inactive', `宿主没有 provide，循环板的服务 ${LOOPS_SERVICE} 提供不了`)
    return () => { off.dispose() }
  }
  const io = config.io ?? realStoreIo
  const delay = config.delay ?? realDelay
  const problems: string[] = []
  /** Lines that say what this process does not do; they are not faults (design §11.1). */
  const notes: string[] = []
  /** What the setup of the command, the gate and the projection says: undefined once it is in place. */
  const setup: { command: string | undefined, gate: string | undefined, projection: string | undefined } = { command: '/loops 还没注册', gate: '文件门还没装', projection: WAITING_PROJECTION }
  const activation = (): readonly [HealthState, string] => {
    const faults = [setup.command, setup.gate, setup.projection].flatMap(fault => fault ?? [])
    const listed = [...problems, ...boards.problems()]
    return [
      faults.length + listed.length === 0 ? 'active' : 'degraded',
      [
        `循环板自己的 ${registry.entries().length} 项条目已登记`,
        ...notes,
        ...(setup.command === undefined ? [`命令 /${LOOPS_COMMAND} 已注册`] : []),
        ...(setup.gate === undefined ? [`${LOOPS_FILES_ONLY} 与 ${LOOPS_SCHEDULE_TOOLS} 已装上`] : []),
        ...(setup.projection === undefined ? [`会话投影 ${LOOPS_KEY} 已注册`] : []),
        ...faults,
        ...listed,
      ].join('；'),
    ]
  }
  const health: RowHealth = provideRowHealth(ctx, 'loops', 'inactive', '循环板还在起')
  const say = (text: string, level: 'info' | 'degraded'): void => {
    const lines = level === 'degraded' ? problems : notes
    if (!lines.includes(text)) lines.push(text)
    health.reactivate(...activation())
  }
  const hasPricing = (): boolean => pricingService(ctx, text => { say(text, 'info') }) !== undefined
  const registry = createRegistry({ report: (text) => { say(text, 'degraded') }, channel: () => hasPricing() ? CHANNEL_EVENTS : [] })

  /**
   * The projects this process runs, by project root. A project is met when a
   * session of it is created or `/loops` runs in it, or when the host's
   * workspace registry names it and it has a main agent; it is given up after
   * ten minutes without either, which lets the lock go to a process that has a
   * session (design §6.1).
   */
  const running = new Map<string, { readonly runtime: ProjectRuntime, touchedAt: number }>()
  /** Set while this process has the session controller, which is what lets it run entries at all. */
  let runs = false

  /**
   * The loop row's own harness action, dispatched to the runner of the project
   * the event belongs to (design §6.9 item 4). An event of a project this
   * process is not running cannot reach an action of its own runner.
   */
  const ownRun: NonNullable<Contribution['run']> = (action, event) => {
    const held = running.get(event.project)
    if (held === undefined) return Promise.resolve({ outcome: 'failed', reason: `这个进程此刻没有在跑 ${event.project}` })
    return held.runtime.peakEnd(action, event)
  }

  /**
   * The GLM peak of a project as the view shows it (design §6.9 item 3): the
   * clock from the pricing service, the level from the rules board's service
   * alone — a level the service cannot read says where to look, and with no
   * pricing service there is no peak to show at all.
   */
  function peakOf(root: string): PeakView | undefined {
    const pricing = pricingService(ctx)
    if (pricing === undefined) return undefined
    const at = io.now()
    let now: boolean | undefined
    let until: string | undefined
    try {
      now = pricing.peak(at)
      const next = nextPeakChange(atMs => pricing.peak(atMs), at)
      if (next !== undefined) until = new Date(next).toISOString()
    }
    catch {
      now = undefined
    }
    let state: PeakModeState | undefined
    try {
      state = peakModeService(ctx)?.stateForProject(root)
    }
    catch {
      state = undefined
    }
    if (state === undefined) return { now, ...(until === undefined ? {} : { until }), level: '档位在规则板上看' }
    return {
      now: state.peak ?? now,
      ...(until === undefined ? {} : { until }),
      level: PEAK_LEVEL_WORDS[state.level].name,
      origin: state.origin,
      ...(state.peak === true && state.level === 'reduce' ? { cap: `少做：高峰里同时至多 ${state.glmWorkerCap ?? PEAK_REDUCE_GLM_WORKERS} 个 GLM 子 agent` } : {}),
    }
  }

  const boards = createBoards({ registry, io, delay, changed: () => { health.reactivate(...activation()) }, peakOf, ...(config.lock === undefined ? {} : { lock: config.lock }) })
  let pricing = hasPricing()
  let own = registry.contribute(LOOPS_SOURCE, ownContribution(pricing, ownRun))
  const disposers: Array<() => void> = []

  function runtimeOf(root: string): ProjectRuntime | undefined {
    if (!runs) return undefined
    const known = running.get(root)
    if (known !== undefined) {
      known.touchedAt = io.now()
      return known.runtime
    }
    const runtime = createProjectRuntime({
      root,
      store: boards.storeOf(root),
      registry,
      io,
      now: io.now,
      delay,
      pid: config.lock?.pid ?? process.pid,
      boot: () => config.lock?.bootTime?.() ?? realLockEnvironment.bootTime?.() ?? Date.now(),
      ctx,
      report: say,
      peak: () => {
        const pricingRead = pricingService(ctx)
        return pricingRead === undefined ? undefined : (atMs: number): boolean => pricingRead.peak(atMs)
      },
      // A peak began or ended: the view's peak line is written again, so the page does not show the level of yesterday (design §6.9 item 3).
      onPeakEdge: () => { void boards.refresh(root) },
      appStamp,
      // The environment row's command of a check entry, read per run (m4 design §6.1.2); absent while that row is off.
      checks: () => checksSeam(ctx, message => { say(message, 'degraded') }),
    })
    running.set(root, { runtime, touchedAt: io.now() })
    return runtime
  }

  /** The projects this process runs whose main agent is this session (design §6.2: an archived holder session is reconciled at once). */
  function runtimeOfHolder(sessionId: string): ProjectRuntime | undefined {
    for (const held of running.values()) {
      if (held.runtime.holder().session === sessionId) return held.runtime
    }
    return undefined
  }

  /** The reminders the board bound in a project, for the schedule gate; empty for a project this process does not run. */
  function bindingsOf(root: string): ReadonlySet<string> {
    const runtime = running.get(root)?.runtime
    return runtime === undefined ? new Set() : runtime.bindings()
  }

  /**
   * The board's line at a step of the main agent, and the two notes of a walk
   * (reminder.ts): installed on every session of a project, since the holder
   * record decides at each step whether this session is the main agent and the
   * record moves with `/wish here`.
   */
  function stepNotice(agent: AgentLike, root: string): void {
    try {
      const userHome = dataHomes(ctx, config.home).userHome
      const store = boards.storeOf(root)
      const stop = installLoopStepNotice(agent, {
        project: root,
        projectKey: projectKey(root),
        mainStep: store.paths.mainStep,
        ...(userHome === undefined ? {} : { lastStep: machineStepFile(userHome) }),
        io,
        now: io.now,
        isHolder: (sessionId) => {
          const reading = holderRecordFor(ctx, root)
          return reading.kind === 'held' && reading.record.sessionId === sessionId
        },
        settle: async () => { await running.get(root)?.runtime.settleTasks() },
        runOf: entry => runOfEntry(root, entry),
        entryOf: scheduleId => running.get(root)?.runtime.binding(scheduleId)?.entry,
        peak: (atMs) => {
          const pricingRead = pricingService(ctx)
          return pricingRead === undefined ? undefined : pricingRead.peak(atMs)
        },
        warn: text => { console.warn(`${name}: ${text}`) },
      })
      if (stop !== undefined) disposers.push(stop)
    }
    catch (error) {
      say(`主 Agent 的走步记录没装上：${message(error)}`, 'info')
    }
  }

  /** The run of the last delivery of one entry, as the runtime's records have it. */
  function runOfEntry(root: string, entry: string): string | undefined {
    const runtime = running.get(root)?.runtime
    if (runtime === undefined) return undefined
    for (const id of runtime.bindings()) {
      const found = runtime.binding(id)
      if (found?.entry === entry) return found.run
    }
    return undefined
  }

  /** What a workspace registry that cannot be read says: not a fault, the projects then start when a session appears (design §6.1). */
  const WORKSPACE_NOTE = 'DSH 的工作区登记表读不出，项目在它的会话出现时才开始跑'

  /**
   * The projects the host's workspace registry names (design §6.1, V17): each
   * workspace whose project has a main-agent record starts running here, so a
   * freshly started host handles events before the person opens a session.
   * Every beat tries again; a registry that has not started yet (or is absent,
   * as in a headless process) only narrows when projects start.
   */
  function adoptWorkspaces(): void {
    const workspaces: unknown = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined
    const registry = workspaces as WorkspaceRegistryService | undefined
    if (typeof registry?.list !== 'function') {
      say(WORKSPACE_NOTE, 'info')
      return
    }
    let named: ReadonlyArray<{ readonly path: string }>
    try {
      named = registry.list()
    }
    catch {
      say(WORKSPACE_NOTE, 'info')
      return
    }
    for (const workspace of named) {
      if (typeof workspace?.path !== 'string' || workspace.path === '') continue
      const project = projectOf(workspace.path)
      if (project === undefined) continue
      try {
        const reading = holderRecordFor(ctx, project.root)
        if (reading.kind !== 'held') continue
      }
      catch {
        continue
      }
      runtimeOf(project.root)
    }
  }

  /** One beat: every project that runs, and the projects that have gone quiet are given up. */
  async function beat(): Promise<void> {
    if (hasPricing() !== pricing) {
      // The GLM channel came or went: the two peak entries follow it (design §5.2).
      pricing = !pricing
      if (own.ok) own.dispose()
      own = registry.contribute(LOOPS_SOURCE, ownContribution(pricing, ownRun))
    }
    adoptWorkspaces()
    for (const [root, held] of [...running]) {
      if (io.now() - held.touchedAt > 10 * BEAT_MS) {
        running.delete(root)
        await held.runtime.stop()
        continue
      }
      await held.runtime.beat()
      // What the beat ran, held or recorded goes on the page (design §8.4).
      await boards.rewrite(root)
    }
    health.reactivate(...activation())
  }

  const command: CommandDefinitionLike<AgentCommandInvocationLike> = {
    definitionId: name,
    name: LOOPS_COMMAND,
    description: '循环板：列出全部条目、删掉你的一项、把读不出的一项恢复、确认存档恢复的提示',
    input: { hint: LOOPS_HINT },
    async handler(invocation): Promise<CommandResultLike> {
      const cwd = invocation.agent.session.header.cwd
      const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
      if (project === undefined) return { kind: 'error', text: NOT_A_PROJECT }
      const root = project.root
      const result = await runLoopsCommand(invocation.rawInput, { store: boards.storeOf(root), pluginIds: () => new Set(registry.entries().map(item => item.entry.id)), now: io.now, view: () => boards.refresh(root) })
      await boards.refresh(project.root)
      // The person touched this project: this process runs it from here on, if it can.
      await runtimeOf(project.root)?.beat()
      return result
    },
  }
  if (typeof ctx.commands?.register === 'function') {
    try {
      disposers.push(ctx.commands.register(command))
      setup.command = undefined
    }
    catch (error) {
      console.warn(`${name}: registering /${LOOPS_COMMAND} failed, the person cannot delete or restore an entry: ${message(error)}`)
      setup.command = `/${LOOPS_COMMAND} 注册失败：${message(error)}`
    }
  }
  else setup.command = `宿主没有 commands，/${LOOPS_COMMAND} 注册不了`

  if (typeof ctx.on === 'function') {
    try {
      // The violation journal of the calling session's project (m4-gate G1, design §2.4).
      const journal = projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd))
      const guardCtx = ctx as PreExecuteHost & ServiceLookup & SessionEventHost
      const report = (record: Parameters<typeof journal.violation>[0], cwd: string | undefined): void => { void journal.violation(record, cwd) }
      disposers.push(installLoopsFileGuard({ ctx: guardCtx, now: io.now, journal: report }))
      disposers.push(installLoopsScheduleGuard({
        ctx: guardCtx,
        now: io.now,
        journal: report,
        bindings: bindingsOf,
        taskOf: async (id) => {
          const schedule = scheduleOf(ctx)
          if (schedule === undefined) return undefined
          try {
            return (await schedule.catalog()).find(task => task.id === id)
          }
          catch {
            // The catalog cannot be read: the call passes and the reconciliation puts the task back afterwards (design §6.2).
            return undefined
          }
        },
      }))
      setup.gate = undefined
    }
    catch (error) {
      console.warn(`${name}: the gates ${LOOPS_FILES_ONLY} and ${LOOPS_SCHEDULE_TOOLS} are not installed, nothing keeps the board's files and reminders to the board: ${message(error)}`)
      setup.gate = `${LOOPS_FILES_ONLY} 与 ${LOOPS_SCHEDULE_TOOLS} 没装上，没有什么拦着别人写循环板的文件与改它的到点提醒：${message(error)}`
    }
    try {
      // A session that starts in a project is the host meeting that project: its files are settled, its view written, and this process starts running it.
      disposers.push(ctx.on('agent/created', async ({ agent }) => {
        const cwd = agent.session?.header.cwd
        const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
        if (project === undefined) return
        await boards.refresh(project.root)
        const runtime = runtimeOf(project.root)
        stepNotice(agent, project.root)
        await runtime?.beat()
      }))
    }
    catch (error) {
      console.warn(`${name}: the session listener is not registered, a project's files are settled only when /${LOOPS_COMMAND} runs: ${message(error)}`)
      problems.push(`会话事件没注册上：${message(error)}`)
    }
    try {
      // DSH says a task was written: the reconciliation does not wait for the next beat (design §6.2).
      disposers.push(ctx.on('schedule/changed', async () => {
        for (const held of [...running.values()]) await held.runtime.settleTasks()
      }))
    }
    catch (error) {
      say(`DSH 的 schedule/changed 没监听上，任务对账只靠每 60 秒一拍：${message(error)}`, 'info')
    }
    try {
      // A session archived with stopActivity loses its tasks (dsh-workspace:540, 623; schedule:2056-2058): the board settles that project at once.
      disposers.push(ctx.on('workspace/session-stop', async ({ sessionId }) => {
        await runtimeOfHolder(sessionId)?.settleTasks()
      }))
    }
    catch (error) {
      say(`DSH 的 workspace/session-stop 没监听上，主 Agent 的会话被归档至多 60 秒后才发现：${message(error)}`, 'info')
    }
  }
  else setup.gate = `宿主没有 on，${LOOPS_FILES_ONLY} 装不上，没有什么拦着别人写循环板的文件`

  installProjection(ctx, (problem) => {
    setup.projection = problem
    health.reactivate(...activation())
  })

  /**
   * The service and the running of entries belong to a process that can reach
   * a session: the design provides them inside `ctx.inject(['sessionController'])`
   * (§3.1, §6.1). A process without it says so and runs nothing; the execute row
   * then runs its own event entries, as it does where the board is absent.
   */
  /** Take the service back, once; both the fiber's disposer and the row's own unload call it. */
  const drop = (): void => {
    const withdraw = withdrawService
    withdrawService = undefined
    withdraw?.()
  }
  const stopRunning = (): void => {
    runs = false
    drop()
    stopBeat?.()
    stopBeat = undefined
    for (const [root, held] of [...running]) {
      running.delete(root)
      void held.runtime.stop()
    }
    notes.splice(0)
    notes.push(NO_CONTROLLER)
    health.reactivate(...activation())
  }
  let stopBeat: (() => void) | undefined
  let withdrawService: (() => void) | undefined
  notes.push(NO_CONTROLLER)
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['sessionController'], (sub) => {
        if (typeof sub.provide !== 'function') return undefined
        try {
          // What the contract says and no more: other rows get these members, not the registry's readers.
          const service: LoopsService = {
            declaration: LOOPS_DECLARATION,
            contribute: (source, contribution) => registry.contribute(source, contribution),
            emit: async (event: LoopEventInput) => {
              const project = typeof event.cwd === 'string' && event.cwd !== '' ? projectOf(event.cwd) : undefined
              if (project === undefined) return { ok: false, code: 'no-project', message: 'cwd is not inside a git project' }
              const runtime = runtimeOf(project.root)
              if (runtime === undefined) return { ok: false, code: 'no-project', message: 'this process does not run that project' }
              return await runtime.emit({ event: event.event, key: event.key, payload: event.payload, from: registry.declarerOf(event.event) ?? event.event.slice(0, Math.max(0, event.event.indexOf('.'))), ...(event.session === undefined ? {} : { session: event.session }) })
            },
            listens: (event, cwd) => {
              const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
              const runtime = project === undefined ? undefined : running.get(project.root)?.runtime
              // A project this process does not run is judged by whoever holds its lock: the event is handed over.
              return runtime === undefined ? true : runtime.listens(event)
            },
            recordRun: (run) => {
              const project = typeof run.cwd === 'string' && run.cwd !== '' ? projectOf(run.cwd) : undefined
              if (project !== undefined) running.get(project.root)?.runtime.recordRun(run)
            },
          }
          withdrawService = sub.provide(LOOPS_SERVICE, service)
        }
        catch (error) {
          console.warn(`${name}: ${LOOPS_SERVICE} is not provided, no row can hand entries to the loop board: ${message(error)}`)
          say(`服务 ${LOOPS_SERVICE} 没提供上：${message(error)}`, 'degraded')
          return undefined
        }
        runs = true
        notes.splice(0)
        notes.push(`服务 ${LOOPS_SERVICE} 已就绪`)
        try {
          stopBeat = (config.beat ?? realBeat)(() => { void beat() }, BEAT_MS)
        }
        catch (error) {
          say(`循环板的拍没设上，条目不会到点跑：${message(error)}`, 'degraded')
        }
        health.reactivate(...activation())
        return stopRunning
      })
    }
    catch (error) {
      console.warn(`${name}: the loop board runs nothing: ${message(error)}`)
      say(`循环板跑不起来：${message(error)}`, 'degraded')
    }
  }
  else notes.push('宿主没有 inject，这个进程不提供循环板的服务')

  health.reactivate(...activation())
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
    boards.dispose()
    stopRunning()
    if (own.ok) own.dispose()
    health.dispose()
  }
}
