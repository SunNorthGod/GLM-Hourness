/**
 * The memory row on the fake rc.3 host, for the specs of what the row does
 * with a running agent (tests/memory-row.spec.ts, tests/memory-learning.spec.ts):
 * the row applied over real temporary directories, the optional services of
 * the host, and, when asked, the project graph and the record of the main
 * agent of the project.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realLockEnvironment } from '../src/data/lock.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { claimHolder, holderFileOf } from '../src/graph/main-agent-holder.ts'
import { apply, type MemoryConfig, type MemoryContext } from '../src/memory/index.ts'
import type { MemoryRowService } from '../src/memory/service.ts'
import type { AgentCommandInvocationLike, CommandDefinitionLike, SessionLike, SessionProjectionsService, UserNotice } from '../src/shared/dsh-min.ts'
import { MEMORY_SERVICE } from '../src/shared/memory-service.ts'
import type { FacePolicyRegistry } from '../src/shared/face-policy.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { healthOf, optionalServices, runRow, stepOf } from './row-host.ts'

export interface Row {
  readonly root: string
  readonly work: string
  readonly project: string
  readonly userDir: string
  /** The graph directory the graph service names, when the row was made with `graph`. */
  readonly graphDir: string
  readonly runtime: FakeRuntime
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly projections: Array<Parameters<SessionProjectionsService['register']>[0]>
  /** The face-policy registry the row's wire-face source registered in (face-migration design 0.1 §6 D). */
  readonly faces: FacePolicyRegistry
  readonly service: MemoryRowService
  readonly dispose: () => void
  /** The optional services as the host brings them: `provide` brings them, `remove` takes them away. */
  readonly services: { provide(): void, remove(): void }
  /** The modes the projection of each session reports, for the judgement of the main agent (`graph: 'judged'`). */
  readonly modes: Map<string, unknown>
  /** Make `sessionId` the main agent of the project, in the record file. */
  readonly hold: (sessionId: string) => void
  /** How many times the graph service was asked for the graph directory. */
  readonly graphAsked: () => number
  /** The clock of the row, the journals and the lock. */
  readonly now: () => Date
  readonly setNow: (at: Date) => void
  /** Run a memory tool as the main agent of the fake host. */
  readonly tool: (name: string, args: unknown) => Promise<Record<string, unknown>>
  /** Run `/memory <input>` in the main agent's session. */
  readonly run: (input: string) => Promise<{ readonly kind: string, readonly text?: string }>
  /** One step of the main agent; the notice the row adds persists in the history like a real one. */
  readonly step: () => Promise<readonly UserNotice[]>
}

export interface Options {
  /** No data row: no user-level directory, no usage. */
  readonly noData?: boolean
  /** The data row names no project for the session. */
  readonly noProject?: boolean
  readonly config?: MemoryConfig
  /** Leave the optional services out: the host has no `inject`. */
  readonly bare?: boolean
  /** The commands and sessionProjections services are not there when the row starts. */
  readonly late?: boolean
  /** The graph row names the project graph; `judged` adds the session state service, so the main agent is judged by its record. */
  readonly graph?: 'plain' | 'judged'
  /** The clock of the row, the journals and the lock starts here (the clock of the machine otherwise). */
  readonly clock?: Date
}

export async function withRow(body: (row: Row) => Promise<void> | void, options: Options = {}): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'memory-row-'))
  const work = join(root, 'work')
  mkdirSync(join(work, 'docs'), { recursive: true })
  writeFileSync(join(work, 'docs', 'DESIGN.md'), '# design\n')
  const project = join(root, 'project')
  const userHome = join(root, 'dsh', 'glm-hourness')
  const userDir = join(userHome, 'memory')
  const graphDir = join(work, 'docs', 'graph')
  let clock = options.clock
  const now = (): Date => clock ?? new Date()
  const runtime = fakeRuntime({ natives: ['pwsh'], cwd: work })
  if (options.noData !== true) runtime.services.set('glmHournessData', { userHome, projectDirOf: () => options.noProject === true ? undefined : project })
  const modes = new Map<string, unknown>()
  let asked = 0
  if (options.graph !== undefined) {
    runtime.services.set('glmHournessGraph', { dirFor: () => { asked += 1; return graphDir }, isGraphTool: () => false })
  }
  if (options.graph === 'judged') {
    runtime.services.set('sessionProjections', { stateOf: (session: SessionLike, key: string) => key === MAIN_AGENT_KEY ? modes.get(session.id) : undefined })
  }
  const optional = optionalServices(runtime, options)
  const { commands, projections, faces, services } = optional
  const ctx = optional.ctx as unknown as MemoryContext
  const config: MemoryConfig = {
    ...options.clock === undefined ? {} : { now, append: { lock: { ...realLockEnvironment, now: () => now().getTime() } } },
    ...options.config,
  }
  const dispose = apply(ctx, config)
  const service = runtime.services.get(MEMORY_SERVICE) as MemoryRowService
  const row: Row = {
    root,
    work,
    project,
    userDir,
    graphDir,
    runtime,
    commands,
    projections,
    faces,
    service,
    dispose,
    services,
    modes,
    hold: (sessionId) => {
      rmSync(holderFileOf(userHome, graphDir), { force: true })
      claimHolder(holderFileOf(userHome, graphDir), { version: 1, sessionId, graphDir, since: '2026-11-01T00:00:00.000Z', commandId: `cmd-${sessionId}` })
    },
    graphAsked: () => asked,
    now,
    setNow: (at) => { clock = at },
    tool: async (toolName, args) => await runtime.execute(toolName, args) as Record<string, unknown>,
    run: async input => commands.get('memory')!.handler({ commandId: 'cmd-1', agent: { id: runtime.agent.id, session: runtime.agent.session }, rawInput: input } as unknown as AgentCommandInvocationLike),
    step: () => stepOf(runtime),
  }
  await runRow(runtime, row, dispose, root, body)
}

export const rowHealth = (row: Row, sessionId?: string) => healthOf(row.runtime, 'memory', sessionId)
