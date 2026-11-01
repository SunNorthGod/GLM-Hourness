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
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { apply, type RulesConfig, type RulesContext } from '../src/rules/index.ts'
import { repoJson, type RepoRules } from '../src/rules/model.ts'
import type { AgentCommandInvocationLike, AgentLike, CommandDefinitionLike, CommandResultLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { DATA_SERVICE } from '../src/shared/data-home.ts'
import { collectHealth } from '../src/shared/health.ts'
import { peakModeService, type PeakModeService } from '../src/shared/peak-mode.ts'
import { PRICING_SERVICE } from '../src/shared/pricing.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { quickIo } from './rules-helpers.ts'

/** Wednesday 15:00 in UTC+8, inside GLM's peak hours (14:00-18:00). */
export const PEAK_NOW = Date.parse('2026-10-28T15:00:00+08:00')

export interface Fixture {
  readonly root: string
  readonly runtime: FakeRuntime
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly service: PeakModeService
  readonly dispose: () => void
  /** What the native tools were called with: a call the gate refused is not in it. */
  readonly calls: Array<{ name: string, args: unknown }>
  /** Run `/rules <input>` in the fake agent's session, as the person. */
  readonly run: (input: string) => Promise<CommandResultLike>
  /** Execute a tool through the full pipeline (`tools/pre-execute`, body, output check) as `agent` (the fake agent unless given). */
  readonly exec: (name: string, args: unknown, over?: { readonly agent?: AgentLike, readonly parent?: unknown }) => Promise<ToolFinalResult>
  /** The records of the project's violation journal. The gate does not wait for its writes (as the guard does not), so this waits until expected records are there, then a moment more for any further one. */
  readonly violations: (expected?: number) => Promise<Array<Record<string, unknown>>>
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
    const ctx = {
      ...runtime.ctx,
      commands: {
        register: (definition: CommandDefinitionLike<AgentCommandInvocationLike>) => {
          if (options.breakCommands === true) throw new Error('taken')
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    } as unknown as RulesContext
    const now = options.now ?? PEAK_NOW
    const dispose = apply(ctx, { now: () => now, io: quickIo(), ...options.config })
    let counter = 0
    await body({
      root,
      runtime,
      commands,
      calls,
      service: peakModeService(runtime.ctx)!,
      dispose,
      run: input => commands.get('rules')!.handler({ commandId: 'test', agent: { id: runtime.agent.id, session: runtime.agent.session }, rawInput: input } as unknown as AgentCommandInvocationLike),
      exec: (name, args, over = {}) => runtime.ctx.tools.execute({
        callId: `call-${++counter}`,
        name,
        arguments: args,
        agent: over.agent ?? runtime.agent,
        signal: new AbortController().signal,
        ...(over.parent === undefined ? {} : { parent: over.parent }),
      }),
      violations: async (expected = 0) => {
        const read = async (): Promise<Array<Record<string, unknown>>> => {
          const text = await readFile(join(root, '.llm', 'audit', 'violations.jsonl'), 'utf8').catch(() => '')
          return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)
        }
        for (let waited = 0; waited < 3_000 && (await read()).length < expected; waited += 25) await new Promise(resolve => setTimeout(resolve, 25))
        await new Promise(resolve => setTimeout(resolve, 40))
        return read()
      },    })
    dispose()
  }
  finally {
    await rm(root, { recursive: true, force: true })
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
