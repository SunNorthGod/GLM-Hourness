/**
 * glm-hourness/loops row entry (docs/ORCHESTRATION.md §18): the loop board. The
 * board lists what is done when something happens or the time comes: entries
 * from the rows that own them and from the people who add their own. What the
 * row does so far:
 * - provides the service `glmHournessLoops` (service.ts): a row hands its entries,
 *   events and harness actions to `contribute`, and the registry (registry.ts)
 *   validates them, holds them and lists what waits for an event nobody declares;
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
 * It listens to no event of the entries, runs no entry and registers no tool
 * yet: those come with the inbox and the runner. Activation never throws. A
 * service that cannot be provided makes the row inactive with the reason, and
 * a host without `provide` the same; a command, a gate or a projection that
 * cannot be set up degrades the row and says which. The row ships disabled
 * (packages/hourness/cordis.patch.yml).
 */
import { projectOf } from '../data/project-root.ts'
import type { LockEnvironment } from '../data/lock.ts'
import { rowJournal } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, CommandResultLike, CommandsHost, InjectHost, PreExecuteHost, PreExecuteListener, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'
import { provideRowHealth, type HealthState, type RowHealth } from '../shared/health.ts'
import type { StoreIo } from '../rules/store.ts'
import { realStoreIo } from '../rules/store.ts'
import { createBoards, realDelay, type Delay } from './boards.ts'
import { LOOPS_HINT, NOT_A_PROJECT, runLoopsCommand } from './commands.ts'
import { LOOP_CONTRIBUTION, LOOP_DEFAULTS } from './defaults.ts'
import { installLoopsFileGuard, LOOPS_FILES_ONLY } from './guard.ts'
import { LOOPS_KEY, loopsProjection } from './projection.ts'
import { createRegistry, LOOPS_SOURCE } from './registry.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, type LoopsService } from './service.ts'

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
  /** The timer that writes a `view.json` that came too soon after the last one; default `setTimeout`, unref'd. */
  readonly delay?: Delay
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
  const problems: string[] = []
  /** What the setup of the command, the gate and the projection says: undefined once it is in place. */
  const setup: { command: string | undefined, gate: string | undefined, projection: string | undefined } = { command: '/loops 还没注册', gate: '文件门还没装', projection: WAITING_PROJECTION }
  const activation = (): readonly [HealthState, string] => {
    const faults = [setup.command, setup.gate, setup.projection].flatMap(fault => fault ?? [])
    const listed = [...problems, ...boards.problems()]
    return [
      faults.length + listed.length === 0 ? 'active' : 'degraded',
      [
        `服务 ${LOOPS_SERVICE} 已就绪，循环板自己的 ${LOOP_DEFAULTS.length} 项条目已登记`,
        ...(setup.command === undefined ? [`命令 /${LOOPS_COMMAND} 已注册`] : []),
        ...(setup.gate === undefined ? [`${LOOPS_FILES_ONLY} 已装上`] : []),
        ...(setup.projection === undefined ? [`会话投影 ${LOOPS_KEY} 已注册`] : []),
        ...faults,
        ...listed,
      ].join('；'),
    ]
  }
  const health: RowHealth = provideRowHealth(ctx, 'loops', 'inactive', `服务 ${LOOPS_SERVICE} 还没提供`)
  const registry = createRegistry({
    report: (text) => {
      problems.push(text)
      health.reactivate(...activation())
    },
  })
  const boards = createBoards({ registry, io, delay: config.delay ?? realDelay, changed: () => { health.reactivate(...activation()) }, ...(config.lock === undefined ? {} : { lock: config.lock }) })
  // What the contract says and no more: other rows get `contribute` and the guard's line, not the registry's readers.
  const service: LoopsService = { declaration: LOOPS_DECLARATION, contribute: (source, contribution) => registry.contribute(source, contribution) }
  let withdraw: () => void
  try {
    withdraw = ctx.provide(LOOPS_SERVICE, service)
  }
  catch (error) {
    console.warn(`${name}: ${LOOPS_SERVICE} is not provided, no row can hand entries to the loop board: ${message(error)}`)
    health.reactivate('inactive', `服务 ${LOOPS_SERVICE} 没提供上：${message(error)}`)
    return () => { health.dispose() }
  }
  const own = registry.contribute(LOOPS_SOURCE, LOOP_CONTRIBUTION)
  const disposers: Array<() => void> = []

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
      // A session that starts in a project is the host meeting that project: its files are settled and its view written.
      disposers.push(ctx.on('agent/created', async ({ agent }) => {
        const cwd = agent.session?.header.cwd
        const project = typeof cwd === 'string' && cwd !== '' ? projectOf(cwd) : undefined
        if (project !== undefined) await boards.refresh(project.root)
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
  health.reactivate(...activation())
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
    boards.dispose()
    if (own.ok) own.dispose()
    withdraw()
    health.dispose()
  }
}
