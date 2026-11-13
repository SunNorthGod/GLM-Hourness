/**
 * The loop row on the fake rc.1 host, for the specs that drive it
 * (loops-guard.spec, loops-row.spec; docs/ORCHESTRATION.md §18): a git project in
 * a temporary directory, a host whose agent works in it, the data service that
 * says where the violation journal goes, the session projection registry, and the row
 * applied on a clock the test fixes. The tool-call gate is exercised through the
 * host's own `tools.execute`, which runs the `tools/pre-execute` waterfall the way
 * the runtime does (tests/fake-rc3.ts).
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, type LoopsConfig, type LoopsContext } from '../src/loops/index.ts'
import type { LoopsProjectionState } from '../src/loops/projection.ts'
import { DATA_SERVICE } from '../src/shared/data-home.ts'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, CommandResultLike, SessionProjectionsService, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { collectHealth } from '../src/shared/health.ts'
import { execTool, fakeInjector, fakeRuntime, fakeSchedule, readViolations, type ExecTool, type FakeRuntime, type FakeSchedule, type ReadViolations } from './fake-rc3.ts'
import { git, quickIo } from './loops-helpers.ts'

export interface LoopsFixture {
  readonly root: string
  readonly runtime: FakeRuntime
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  /** What the row registered with the session projection registry. */
  readonly projections: Array<{ readonly key: string, readonly init: (header: unknown) => LoopsProjectionState, readonly apply: (state: LoopsProjectionState) => LoopsProjectionState }>
  /** The timers the row asked for, held until a test fires them. */
  readonly delayed: Array<{ readonly ms: number, readonly run: () => void }>
  /** Apply the row (the fixture does it at once unless `start: false`); the function it returns takes the row out. */
  readonly start: () => () => void
  /** Run `/loops <input>` in the fake agent's session, as the person. */
  readonly run: (input: string) => Promise<CommandResultLike>
  readonly exec: ExecTool
  readonly violations: ReadViolations
  /** What the native tools were called with: a call the gate refused is not in it. */
  readonly calls: Array<{ name: string, args: unknown }>
  /** The same agent in another working directory. */
  readonly agentIn: (cwd: string) => AgentLike
  /** The loop row's line in the health table of the fake agent's session. */
  readonly health: () => ReturnType<typeof collectHealth>[number]
  /** Provide the session projection registry, as the host does once it is loaded. */
  readonly provideProjections: () => void
  /** Provide or take away the session controller: only with it does the row hand its service out and run entries (design §6.1). */
  readonly controller: (there: boolean) => void
  /** The beats the row asked for, so a test drives them itself. */
  readonly beats: Array<{ readonly ms: number, readonly run: () => void }>
  /** The host's schedule service, which the row binds its time entries to (design §6.2). */
  readonly schedule: FakeSchedule
}

export interface LoopsFixtureOptions {
  /** The working directory of the fake agent: the project unless given, none for `null`. */
  readonly cwd?: string | null
  /** Do not apply the row until the test calls `start`. */
  readonly start?: false
  readonly config?: LoopsConfig
  readonly now?: () => number
  /** A host without these parts of the context. */
  readonly without?: ReadonlyArray<'commands' | 'on' | 'inject'>
  /** Provide the session projection registry from the start (default true). */
  readonly projections?: boolean
  /** Provide the session controller from the start (default true): without it the row provides no service and runs nothing. */
  readonly controller?: boolean
}

/**
 * The natives the gates judge: the file tools, the shell, and the reminder
 * tools the Web composition mounts over the host's schedule service (rc.1's
 * directory has `schedule_create`, `schedule_list`, `schedule_view` and
 * `schedule_edit`, which merged rc.3's update and delete;
 * dsh-schedule/README.md:30–37).
 */
const NATIVES = ['pwsh', 'write', 'edit', 'read', 'str_replace_editor', 'schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit']

/** A timer that holds what it is asked to run until a test fires it; firing or cancelling takes it out of `held`. */
function fakeDelay(held: LoopsFixture['delayed']): NonNullable<LoopsConfig['delay']> {
  return (run, ms) => {
    const cancel = (): void => {
      const at = held.indexOf(entry)
      if (at >= 0) held.splice(at, 1)
    }
    const entry = { ms, run: () => { cancel(); run() } }
    held.push(entry)
    return cancel
  }
}

/** A git project in a temporary directory with the loop row applied on a fake host whose agent works in it. */
export async function withLoopsRow(body: (fixture: LoopsFixture) => Promise<void> | void, options: LoopsFixtureOptions = {}): Promise<void> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-row-')))
  const stops: Array<() => void> = []
  try {
    git(root, 'init', '--quiet', '-b', 'main')
    mkdirSync(join(root, 'docs'), { recursive: true })
    git(root, 'commit', '--quiet', '--allow-empty', '-m', 'first')
    const calls: LoopsFixture['calls'] = []
    const runtime = fakeRuntime({ natives: NATIVES, calls, ...(options.cwd === null ? {} : { cwd: options.cwd ?? root }) })
    runtime.services.set(DATA_SERVICE, { userHome: join(root, 'user'), projectHome: join(root, '.llm') })
    const commands: LoopsFixture['commands'] = new Map()
    const projections: LoopsFixture['projections'] = []
    const delayed: LoopsFixture['delayed'] = []
    const beats: LoopsFixture['beats'] = []
    const injector = fakeInjector({}, runtime.ctx)
    const registry: Pick<SessionProjectionsService, 'register'> = {
      register: (definition) => {
        projections.push(definition as unknown as LoopsFixture['projections'][number])
        return () => { projections.splice(0) }
      },
    }
    const missing = new Set(options.without ?? [])
    const context = {
      ...runtime.ctx,
      ...(missing.has('on') ? { on: undefined } : {}),
      ...(missing.has('commands') ? {} : { commands: { register: (definition: CommandDefinitionLike<AgentCommandInvocationLike>) => { commands.set(definition.name, definition); return () => { commands.delete(definition.name) } } } }),
      ...(missing.has('inject') ? {} : { inject: injector.inject }),
    } as unknown as LoopsContext
    const io = quickIo(options.now === undefined ? {} : { now: options.now })
    // The host's schedule service, as the Web composition mounts it; the row reads it through ctx.get (design §10.1).
    const schedule = fakeSchedule({ now: io.now })
    runtime.services.set('schedule', schedule.service)
    const config: LoopsConfig = {
      io,
      delay: fakeDelay(delayed),
      beat: (run, ms) => {
        const beat = { ms, run }
        beats.push(beat)
        return () => {
          const at = beats.indexOf(beat)
          if (at >= 0) beats.splice(at, 1)
        }
      },
      ...options.config,
    }
    const provideProjections = (): void => { injector.provide('sessionProjections', registry as SessionProjectionsService) }
    /** The session controller as rc.3 has it: only the revival of a cold session, which the delivery side will call. */
    const controller = (there: boolean): void => {
      if (there) injector.provide('sessionController', { resolveAgent: () => Promise.resolve({ error: { code: 'session/not-found' } }) })
      else injector.remove('sessionController')
    }
    const start = (): (() => void) => {
      const stop = apply(context, config)
      stops.push(stop)
      return stop
    }
    if (options.projections !== false) provideProjections()
    if (options.controller !== false) controller(true)
    if (options.start !== false) start()
    await body({
      root,
      runtime,
      commands,
      projections,
      delayed,
      beats,
      schedule,
      start,
      provideProjections,
      controller,
      calls,
      run: input => commands.get('loops')!.handler({ commandId: 'test', agent: runtime.agent, rawInput: input } as unknown as AgentCommandInvocationLike),
      exec: execTool(runtime),
      agentIn: cwd => ({ ...runtime.agent, session: { ...runtime.agent.session!, header: { ...runtime.agent.session!.header, cwd } } }),
      health: () => collectHealth(runtime.ctx, 'agent-1').find(entry => entry.row === 'loops')!,
      violations: readViolations(root),
    })
  }
  finally {
    // The gate does not wait for its journal writes; the last of them finish before the directory goes.
    await new Promise(resolve => setTimeout(resolve, 80))
    for (const stop of stops.splice(0)) stop()
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

/** The text of a tool result. */
export const textOf = (result: ToolFinalResult): string => result.content.map(part => part.text ?? '').join('')
