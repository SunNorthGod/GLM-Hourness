/**
 * The rules row on the fake rc.3 host, for the specs that drive it
 * (rules-row.spec, rules-gate.spec; docs/ORCHESTRATION.md §16): a git project
 * in a temporary directory, a host whose agent works in it, the pricing
 * service the GLM package provides (the real credit plan), the data service
 * that says where the violation journal goes, and the row applied on a clock
 * the test fixes. The tool-call gate is exercised through the host's own
 * `tools.execute`, which runs the `tools/pre-execute` waterfall the way
 * rc.3 does (tests/fake-rc3.ts).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { apply, BEAT_MS, PASS_MS, type IntervalTimer, type RulesConfig, type RulesContext } from '../src/rules/index.ts'
import { repoJson, type RepoRules, type Ticket } from '../src/rules/model.ts'
import { loadState, rulesPaths } from '../src/rules/store.ts'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, CommandResultLike, SessionProjectionsService, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { DATA_SERVICE } from '../src/shared/data-home.ts'
import { collectHealth } from '../src/shared/health.ts'
import { peakModeService, type PeakModeService } from '../src/shared/peak-mode.ts'
import { PRICING_SERVICE } from '../src/shared/pricing.ts'
import { execTool, fakeInjector, fakeLive, fakeRuntime, readViolations, type ExecTool, type FakeLive, type FakeRuntime, type ReadViolations } from './fake-rc3.ts'
import { quickIo, type FakeClock } from './rules-helpers.ts'

/** Wednesday 15:00 in UTC+8, inside GLM's peak hours (14:00-18:00). */
export const PEAK_NOW = Date.parse('2026-10-28T15:00:00+08:00')

/** The repeating timers a row asks for, held until a test runs them. */
function fakeTimers(): { readonly timer: IntervalTimer, readonly run: (everyMs: number) => Promise<void>, readonly active: () => number } {
  const timers = new Set<{ readonly tick: () => Promise<void>, readonly everyMs: number }>()
  return {
    timer: (tick, everyMs) => {
      const entry = { tick, everyMs }
      timers.add(entry)
      return () => { timers.delete(entry) }
    },
    run: async (everyMs) => {
      for (const entry of [...timers].filter(timer => timer.everyMs === everyMs)) await entry.tick()
    },
    active: () => timers.size,
  }
}

export interface Fixture {
  readonly root: string
  readonly runtime: FakeRuntime
  /** The live-agent registry and goal service, when the options ask for them (live: true); the fake agent is registered idle. */
  readonly live: FakeLive
  /** Run the row's re-judgement of its tickets (the 5-second timer) and wait for it. */
  readonly pass: () => Promise<void>
  /** Run the row's heartbeat (the 15-second timer) and wait for it. */
  readonly beat: () => Promise<void>
  /** The repeating timers the row holds now. */
  readonly timers: () => number
  /** The tickets of the project's state now, by number. */
  readonly tickets: () => Readonly<Record<string, Ticket>>
  /** Wait until the condition holds (work the row does on an event runs after the event returns). */
  readonly until: (condition: () => boolean) => Promise<void>
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly service: PeakModeService
  /** Unload the row and wait for what it does on the way out (the goals it resumes). A second call does nothing. */
  readonly dispose: () => Promise<void>
  /** What the native tools were called with: a call the gate refused is not in it. */
  readonly calls: Array<{ name: string, args: unknown }>
  /** Run `/rules <input>` in the fake agent's session, as the person. */
  readonly run: (input: string) => Promise<CommandResultLike>
  readonly exec: ExecTool
  readonly violations: ReadViolations
  /** The units the row registered with the session projection registry. */
  readonly projections: ReadonlyArray<{ readonly key: string, readonly init: (header: unknown) => unknown, readonly apply: (state: never) => unknown }>
}

export interface Options {
  /** The pricing service on the host: the GLM credit plan unless given, none for `'none'`. */
  readonly pricing?: unknown
  readonly now?: number
  readonly config?: RulesConfig
  /** The working directory of the fake agent: the project unless given, none for `null`. */
  readonly cwd?: string | null
  readonly breakCommands?: boolean
  /** The rules file the project has in its repository when the row starts. */
  readonly rules?: RepoRules
  readonly natives?: readonly string[]
  /** The route of the session's latest request. */
  readonly route?: { provider?: string, model?: string }
  /** Further services on the host. */
  readonly services?: Readonly<Record<string, unknown>>
  /** Provide the data service that names the project directory (and with it the violation journal). Default true. */
  readonly data?: boolean
  /** Provide the `agents` and `goals` services of a live host, with the fake agent registered. Default false. */
  readonly live?: boolean
  /** A clock the test moves: the row's and the board's moment. Replaces `now`. */
  readonly clock?: FakeClock
  /** Give the row `ctx.inject` with the session projection registry, as the rc.3 host does. Default true; false leaves `inject` out. */
  readonly projections?: boolean
  /** Run before the row is applied, with the project, the host and the live agents: the state a row meets when it starts (a ticket another run left, a live subagent). */
  readonly setup?: (parts: { readonly root: string, readonly runtime: FakeRuntime, readonly live: FakeLive, readonly now: () => number }) => Promise<void>
}

/** A git project in a temporary directory with the rules row applied on a fake host whose agent works in it. */
export async function withRow(body: (fixture: Fixture) => Promise<void>, options: Options = {}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'rules-row-'))
  try {
    await mkdir(join(root, '.git'))
    if (options.rules !== undefined) {
      await mkdir(join(root, 'docs', 'rules'), { recursive: true })
      await writeFile(join(root, 'docs', 'rules', 'rules.json'), repoJson(options.rules))
    }
    const calls: Fixture['calls'] = []
    const runtime = fakeRuntime({ natives: options.natives ?? ['pwsh'], calls, ...(options.cwd === null ? {} : { cwd: options.cwd ?? root }), ...(options.route === undefined ? {} : { route: options.route }) })
    if (options.pricing !== 'none') runtime.services.set(PRICING_SERVICE, options.pricing ?? creditPricing)
    if (options.data !== false) runtime.services.set(DATA_SERVICE, { userHome: join(root, 'user'), projectHome: join(root, '.llm') })
    for (const [name, value] of Object.entries(options.services ?? {})) runtime.services.set(name, value)
    const commands = new Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>()
    const projections: Array<Fixture['projections'][number]> = []
    const registry: Pick<SessionProjectionsService, 'register'> = {
      register: (definition) => {
        const unit = definition as unknown as Fixture['projections'][number]
        projections.push(unit)
        return () => { projections.splice(projections.indexOf(unit), 1) }
      },
    }
    const injector = fakeInjector({ sessionProjections: registry as SessionProjectionsService }, runtime.ctx)
    const ctx = {
      ...runtime.ctx,
      ...(options.projections === false ? {} : { inject: injector.inject }),
      commands: {
        register: (definition: CommandDefinitionLike<AgentCommandInvocationLike>) => {
          if (options.breakCommands === true) throw new Error('taken')
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    } as unknown as RulesContext
    const now = options.now ?? PEAK_NOW
    const moment = options.clock?.now ?? ((): number => now)
    const live = fakeLive()
    if (options.live === true) {
      live.add(runtime.agent)
      runtime.services.set('agents', live.agents)
      runtime.services.set('goals', live.goals)
    }
    await options.setup?.({ root, runtime, live, now: moment })
    const timers = fakeTimers()
    const unload = apply(ctx, { now: moment, io: quickIo({ now: moment }), timer: timers.timer, ...options.config })
    const dispose = async (): Promise<void> => { await unload() }
    await body({
      root,
      runtime,
      live,
      pass: () => timers.run(PASS_MS),
      beat: () => timers.run(BEAT_MS),
      timers: timers.active,
      tickets: () => loadState(rulesPaths(root)).state.tickets ?? {},
      until: async (condition) => {
        for (let waited = 0; waited < 3_000 && !condition(); waited += 10) await new Promise(resolve => setTimeout(resolve, 10))
        if (!condition()) throw new Error('timed out waiting for the condition')
      },
      commands,
      calls,
      service: peakModeService(runtime.ctx)!,
      dispose,
      run: input => commands.get('rules')!.handler({ commandId: 'test', agent: { id: runtime.agent.id, session: runtime.agent.session }, rawInput: input } as unknown as AgentCommandInvocationLike),
      exec: execTool(runtime),
      violations: readViolations(root),
      projections,
    })
    await dispose()
  }
  finally {
    // The row journals its records without awaiting them, one file's appends in order (src/memory/audit.ts):
    // a write still landing while the tree goes is ENOTEMPTY on Windows, so the removal tries again.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
  }
}

export function rowTest(title: string, body: (fixture: Fixture) => Promise<void>, options: Options = {}): void {
  test(title, () => withRow(body, options))
}

/** The rules row's line in the health table of the fake agent's session. */
export const health = (runtime: FakeRuntime): ReturnType<typeof collectHealth>[number] => collectHealth(runtime.ctx, 'agent-1').find(entry => entry.row === 'rules')!

/** A delegated child of `agent`: a session whose header says `origin: 'subagent'`, on the same route. */
export function subagentOf(agent: AgentLike): AgentLike {
  const session = agent.session!
  return { ...agent, id: 'sub-1', session: { ...session, id: 'sub-1', header: { ...session.header, id: 'sub-1', parentSession: session.id, origin: 'subagent' } } }
}

/** The text of a tool result. */
export const textOf = (result: ToolFinalResult): string => result.content.map(part => part.text ?? '').join('')
