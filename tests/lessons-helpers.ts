/**
 * Shared pieces of the lessons service, tool, row and command-line specs: a
 * lessons environment over a real temporary directory (the journal, the lock
 * and the project folder are the real ones; the clock is the spec's), the
 * service and the two tools over it, and the journal read back as records.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRecord, type JournalRecord } from '../src/data/journal.ts'
import { realLockEnvironment } from '../src/data/lock.ts'
import { lessonsRowService, type LessonsService } from '../src/lessons/service.ts'
import { journalFile, type LessonsEnv, type NoteKey } from '../src/lessons/storage.ts'
import { lessonsTools } from '../src/lessons/tools.ts'
import type { AgentLike, SessionLike, ToolDefinitionLike } from '../src/shared/dsh-min.ts'
import { agentOf, runTool } from './memory-helpers.ts'

/** The clock of the specs: the lock stamps every record with it too. */
export const NOW = new Date('2026-11-01T12:00:00Z')

export interface LessonsFixture {
  /** A temporary directory that holds the project directory. */
  readonly root: string
  /** The project directory the environment gives every session (not a `.llm`, so nothing outside the temporary directory is touched). */
  readonly dir: string
  readonly env: LessonsEnv
  readonly notes: Array<{ readonly sessionId: string | undefined, readonly key: NoteKey, readonly text: string | undefined }>
  readonly service: LessonsService
  readonly tools: ReadonlyMap<string, ToolDefinitionLike>
  /** Move the clock. */
  setNow(at: Date): void
  /** Run a lessons tool as `agent` (the main agent by default); resolves to the tool's value. */
  call(name: string, args: unknown, agent?: AgentLike): Promise<Record<string, unknown>>
  /** The records of the journal, in file order. */
  journal(): JournalRecord[]
  dispose(): void
}

interface FixtureOptions {
  /** Replaces the project directory the environment gives a session (none, or one that cannot be made). */
  readonly dirOf?: (root: string, dir: string) => string | undefined
  readonly now?: Date
}

const MAIN = agentOf('main-session', { cwd: 'C:/work/project' })
export const MAIN_SESSION = MAIN.session as SessionLike
export const CHILD = agentOf('child-session', { cwd: 'C:/work/project', subagent: true })

export function lessonsFixture(options: FixtureOptions = {}): LessonsFixture {
  const root = mkdtempSync(join(tmpdir(), 'lessons-'))
  const dir = join(root, 'project')
  let clock = options.now ?? NOW
  let drawn = 0x100000
  const notes: LessonsFixture['notes'] = []
  const env: LessonsEnv = {
    dirOf: () => options.dirOf === undefined ? dir : options.dirOf(root, dir),
    now: () => clock,
    random: () => drawn++,
    ignoreCase: false,
    native: tool => tool === 'Bash' ? 'pwsh' : tool,
    note: (sessionId, key, text) => { notes.push({ sessionId, key, text }) },
    counters: { rejected: new Map(), failed: new Set() },
    append: { lock: { ...realLockEnvironment, now: () => clock.getTime() } },
  }
  const tools = new Map(lessonsTools(env).map(tool => [tool.name, tool]))
  return {
    root,
    dir,
    env,
    notes,
    service: lessonsRowService(env),
    tools,
    setNow(at) { clock = at },
    call: (name, args, agent = MAIN) => runTool(tools, name, args, agent),
    journal() {
      const file = journalFile(dir)
      if (!existsSync(file)) return []
      return readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map((line) => {
        const record = parseRecord(line)
        assert.ok(typeof record !== 'string', line)
        return record
      })
    },
    dispose: () => { rmSync(root, { recursive: true, force: true }) },
  }
}

/** Run ody over a fixture and remove its directory afterwards. */
export async function withFixture(body: (fixture: LessonsFixture) => Promise<void>, options?: FixtureOptions): Promise<void> {
  const fixture = lessonsFixture(options)
  try {
    await body(fixture)
  }
  finally {
    fixture.dispose()
  }
}

/** A candidate as a worker's handback gives it. */
export const CANDIDATE = {
  problem: 'Get-Content without -Encoding garbled the Chinese text in a fixture.',
  fix: 'Pass -Encoding UTF8, or read the file with a Node script.',
  files: ['tests/fixtures/**'],
  commands: ['Get-Content'],
  tools: ['Bash'],
  errors: ['garbled Chinese text'],
} as const

/** A lesson as lessons_merge writes it. */
export const LESSON = {
  action: 'new',
  reason: 'seed for the spec',
  situation: { files: ['docs/graph/**'], commands: ['git commit'], errors: ['graph write refused here'] },
  pitfall: 'A worker committed a graph comment although its brief said not to.',
  fix: 'Report graph changes in the handback and let the main agent write the graph.',
  evidence: ['commit:cae6ddf'],
} as const
