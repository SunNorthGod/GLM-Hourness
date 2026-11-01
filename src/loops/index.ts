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
 *   that side of the board is built; a script or a check entry is refused
 *   without starting anything;
 * - hands over the loop row's own events (events.ts) as the always-there part of
 *   the event table, and its own four entries (defaults.ts);
 * - keeps the entries a person agreed to (store.ts): files in the repository's
 *   `docs/loops/`, the change record in the project's `.llm/loops/`; settles what
 *   git or an editor changed behind its back whenever a session starts in a
 *   project (boards.ts) and writes the project's `view.json` (view.ts);
 * - `/loops` (commands.ts): the person deletes an entry, gets one back, or
 *   acknowledges a damaged change record;
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
import type { LockEnvironment } from '../data/lock.ts'
import { rowJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, CommandResultLike, CommandsHost, InjectHost, PreExecuteHost, PreExecuteListener, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import type { StoreIo } from '../rules/store.ts'
import { realStoreIo } from '../rules/store.ts'
import { statSync } from 'node:fs'
import { realLockEnvironment } from '../data/lock.ts'
import { pricingService } from '../shared/pricing.ts'
import { createBoards, realDelay, type Delay } from './boards.ts'
import { CHANNEL_EVENTS, CHANNEL_PEAK_CHANGED } from './channel.ts'
import { LOOPS_HINT, NOT_A_PROJECT, runLoopsCommand } from './commands.ts'
import { LOOP_ACTIONS, LOOP_CONTRIBUTION, LOOP_DEFAULTS } from './defaults.ts'
import { installLoopsFileGuard, LOOPS_FILES_ONLY } from './guard.ts'
import { LOOPS_KEY, loopsProjection } from './projection.ts'
import { createRegistry, LOOPS_SOURCE } from './registry.ts'
import { BEAT_MS, createProjectRuntime, type ProjectRuntime } from './run.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, type Contribution, type LoopEventInput, type LoopsService } from './service.ts'

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
 * (design §4.3).
 */
function ownContribution(hasPricing: boolean): Contribution {
  if (hasPricing) return LOOP_CONTRIBUTION
  return {
    entries: LOOP_DEFAULTS.filter(entry => entry.when.kind !== 'event' || !entry.when.events.includes(CHANNEL_PEAK_CHANGED)),
    actions: LOOP_ACTIONS,
    run: (action, event) => LOOP_CONTRIBUTION.run?.(action, event) ?? Promise.resolve({ outcome: 'failed', reason: `${action} 没有执行者` }),
  }
}

/** What the row takes from its context. Everything but `provide` is optional: a host that lacks a part degrades the row and says which. */
export interface LoopsContext extends Partial<ProvideHost>, Partial<InjectHost>, ServiceLookup, Partial<CommandsHost<AgentCommandInvocationLike>> {
  readonly on?: {
    (event: 'agent/created', listener: (payload: { agent: AgentLike }) => Promise<void> | void): () => void
    (event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
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
        ...(setup.gate === undefined ? [`${LOOPS_FILES_ONLY} 已装上`] : []),
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
  const boards = createBoards({ registry, io, delay, changed: () => { health.reactivate(...activation()) }, ...(config.lock === undefined ? {} : { lock: config.lock }) })
  let pricing = hasPricing()
  let own = registry.contribute(LOOPS_SOURCE, ownContribution(pricing))
  const disposers: Array<() => void> = []

  /**
   * The projects this process runs, by project root. A project is met when a
   * session of it is created or `/loops` runs in it; it is given up after ten
   * minutes without one, which lets the lock go to a process that has one
   * (design §6.1).
   */
  const running = new Map<string, { readonly runtime: ProjectRuntime, touchedAt: number }>()
  /** Set while this process has the session controller, which is what lets it run entries at all. */
  let runs = false

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
      report: say,
      peak: () => {
        const pricingRead = pricingService(ctx)
        return pricingRead === undefined ? undefined : (atMs: number): boolean => pricingRead.peak(atMs)
      },
      appStamp,
    })
    running.set(root, { runtime, touchedAt: io.now() })
    return runtime
  }

  /** One beat: every project that runs, and the projects that have gone quiet are given up. */
  async function beat(): Promise<void> {
    if (hasPricing() !== pricing) {
      // The GLM channel came or went: the two peak entries follow it (design §5.2).
      pricing = !pricing
      if (own.ok) own.dispose()
      own = registry.contribute(LOOPS_SOURCE, ownContribution(pricing))
    }
    for (const [root, held] of [...running]) {
      if (io.now() - held.touchedAt > 10 * BEAT_MS) {
        running.delete(root)
        await held.runtime.stop()
        continue
      }
      await held.runtime.beat()
    }
    health.reactivate(...activation())
  }

  const command: CommandDefinitionLike<AgentCommandInvocationLike> = {
    definitionId: name,
    name: LOOPS_COMMAND,
    description: '循环板：删掉你的一项、把读不出的一项恢复、确认存档恢复的提示',
    input: { hint: LOOPS_HINT },
    async handler(invocation): Promise<CommandResultLike> {
      const cwd = invocation.agent.session.header.cwd
      const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
      if (project === undefined) return { kind: 'error', text: NOT_A_PROJECT }
      const result = await runLoopsCommand(invocation.rawInput, { store: boards.storeOf(project.root), pluginIds: () => new Set(registry.entries().map(item => item.entry.id)), now: io.now })
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
      const journal = rowJournal(name, () => dataHomes(ctx, config.home))
      disposers.push(installLoopsFileGuard({ ctx: ctx as PreExecuteHost & ServiceLookup, now: io.now, journal: (record) => { void journal.violation(record) } }))
      setup.gate = undefined
    }
    catch (error) {
      console.warn(`${name}: the gate ${LOOPS_FILES_ONLY} is not installed, nothing keeps the board's files to the board: ${message(error)}`)
      setup.gate = `${LOOPS_FILES_ONLY} 没装上，没有什么拦着别人写循环板的文件：${message(error)}`
    }
    try {
      // A session that starts in a project is the host meeting that project: its files are settled, its view written, and this process starts running it.
      disposers.push(ctx.on('agent/created', async ({ agent }) => {
        const cwd = agent.session?.header.cwd
        const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
        if (project === undefined) return
        await boards.refresh(project.root)
        await runtimeOf(project.root)?.beat()
      }))
    }
    catch (error) {
      console.warn(`${name}: the session listener is not registered, a project's files are settled only when /${LOOPS_COMMAND} runs: ${message(error)}`)
      problems.push(`会话事件没注册上：${message(error)}`)
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
