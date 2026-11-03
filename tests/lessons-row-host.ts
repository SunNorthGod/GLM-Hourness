/**
 * The lessons row on the fake rc.3 host, for the specs of what the row does
 * with a running agent (tests/lessons-row.spec.ts, tests/lessons-failure.spec.ts):
 * the row applied over a real temporary project directory, the optional
 * services of the host, the main agent of the project judged by the real
 * holder record, and the journal read back as records.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { realLockEnvironment } from '../src/data/lock.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { claimHolder, holderFileOf } from '../src/graph/main-agent-holder.ts'
import { apply, type LessonsConfig, type LessonsContext } from '../src/lessons/index.ts'
import { LESSONS_SERVICE, type LessonsService } from '../src/lessons/service.ts'
import { journalFile } from '../src/lessons/storage.ts'
import type { AgentCommandInvocationLike, CommandDefinitionLike, SessionLike, SessionProjectionsService, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { CANDIDATE, NOW } from './lessons-helpers.ts'
import { healthOf, optionalServices, runRow, stepOf } from './row-host.ts'

export const WORK = resolve(tmpdir(), 'lessons-row-project')
const GRAPH_DIR = join(WORK, 'docs', 'graph')

export interface Row {
  readonly root: string
  readonly project: string
  readonly userHome: string
  readonly runtime: FakeRuntime
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly projections: Array<Parameters<SessionProjectionsService['register']>[0]>
  readonly service: LessonsService
  readonly dispose: () => void
  /** The modes the projection of each session reports, for the judgement of the main agent. */
  readonly modes: Map<string, unknown>
  readonly services: { provide(): void, remove(): void }
  setNow(at: Date): void
  /** Make `sessionId` the main agent of the project, in the record file. */
  hold(sessionId: string): void
  /** The records of the project's journal, in file order. */
  readonly journal: () => Array<Record<string, unknown>>
  /** One step of the main agent; the notices the row adds stay in the history like real ones. */
  readonly step: () => Promise<readonly UserNotice[]>
  /** Type `/lessons <input>` as the person, in the main agent's session. */
  readonly run: (input: string) => Promise<{ readonly kind: string, readonly text?: string }>
  /** Call a lessons tool as the main agent of the fake host. */
  readonly tool: (name: string, args: unknown) => Promise<Record<string, unknown>>
}

export interface RowOptions {
  /** The data row names no project for the session. */
  readonly noProject?: boolean
  readonly config?: LessonsConfig
  /** Leave the optional services out: the host has no `inject`. */
  readonly bare?: boolean
  /** The commands and sessionProjections services are not there when the row starts. */
  readonly late?: boolean
  /** The graph row and the session state service are there, so the main agent is judged by its record. */
  readonly judged?: boolean
  /** The tools the host has as natives (`pwsh` by default). */
  readonly natives?: readonly string[]
}

const readJournalLines = (file: string): Array<Record<string, unknown>> => readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)

export async function withRow(body: (row: Row) => Promise<void> | void, options: RowOptions = {}): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'lessons-row-'))
  const project = join(root, 'project')
  const userHome = join(root, 'dsh', 'glm-hourness')
  let clock = NOW
  const runtime = fakeRuntime({ natives: options.natives ?? ['pwsh'], cwd: WORK })
  runtime.services.set('glmHournessData', { userHome, projectDirOf: () => options.noProject === true ? undefined : project })
  const modes = new Map<string, unknown>()
  if (options.judged === true) {
    runtime.services.set('glmHournessGraph', { dirFor: () => GRAPH_DIR, isGraphTool: () => false })
    runtime.services.set('sessionProjections', { stateOf: (session: SessionLike, key: string) => key === MAIN_AGENT_KEY ? modes.get(session.id) : undefined })
  }
  const optional = optionalServices(runtime, options)
  const { commands, projections, services } = optional
  const ctx = optional.ctx as unknown as LessonsContext
  const config: LessonsConfig = { now: () => clock, random: (() => { let drawn = 0x100000; return () => drawn++ })(), ignoreCase: false, append: { lock: { ...realLockEnvironment, now: () => clock.getTime() } }, ...options.config }
  const dispose = apply(ctx, config)
  const service = runtime.services.get(LESSONS_SERVICE) as LessonsService
  const row: Row = {
    root,
    project,
    userHome,
    runtime,
    commands,
    projections,
    service,
    dispose,
    modes,
    services,
    setNow(at) { clock = at },
    hold(sessionId) {
      rmSync(holderFileOf(userHome, GRAPH_DIR), { force: true })
      claimHolder(holderFileOf(userHome, GRAPH_DIR), { version: 1, sessionId, graphDir: GRAPH_DIR, since: '2026-11-01T00:00:00.000Z', commandId: `cmd-${sessionId}` })
    },
    tool: async (toolName, args) => await runtime.execute(toolName, args) as Record<string, unknown>,
    run: async input => commands.get('lessons')!.handler({ commandId: 'cmd-1', agent: { id: runtime.agent.id, session: runtime.agent.session }, rawInput: input } as unknown as AgentCommandInvocationLike),
    step: () => stepOf(runtime),

    journal: () => {
      try {
        return readJournalLines(journalFile(project))
      }
      catch {
        return []
      }
    },
  }
  await runRow(runtime, row, dispose, root, body)
}

export const rowHealth = (row: Row, sessionId?: string) => healthOf(row.runtime, 'lessons', sessionId)
export const kinds = (notices: readonly UserNotice[]): string[] => notices.map(notice => notice.source.kind)
export const proposeFrom = (row: Row, session: string, candidate: object = CANDIDATE) => row.service.propose(candidate as never, { session: { id: session, header: { id: session }, deriveMessages: () => [] }, task: 'task-3' })
