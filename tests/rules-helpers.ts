/**
 * Shared pieces of the rules board specs: a project in a temporary
 * directory (a git repository by its `.git` directory, as src/data/project-root.ts
 * reads it), the board's files by name, a store whose file operations
 * the test can bend, a clock the test moves, and the pieces of a project
 * state the engine does not make by itself (a host's heartbeat, a record
 * an earlier writer left).
 */
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'
import { realLockEnvironment, type LockEnvironment } from '../src/data/lock.ts'
import { openRulesBoard, type RulesBoard } from '../src/rules/engine.ts'
import type { Change, JournalRecord, ProjectState, RulesActor } from '../src/rules/model.ts'
import { appendRecord, applyRecord, ensureRuntimeDir, loadState, realStoreIo, stateDigest, writeSnapshot, type RulesPaths, type StoreIo } from '../src/rules/store.ts'

export interface Project {
  readonly root: string
  readonly board: RulesBoard
}

/** A lock environment that never waits: sleeping advances a fake clock, so `busy` comes at once. */
export function impatientLock(): LockEnvironment {
  let at = realLockEnvironment.now()
  return { ...realLockEnvironment, now: () => at, sleep: (ms) => { at += ms; return Promise.resolve() } }
}

/** File operations with no waiting between retries. */
export function quickIo(overrides: Partial<StoreIo> = {}): StoreIo {
  return { ...realStoreIo, sleep: () => Promise.resolve(), ...overrides }
}

/** A git project in a fresh temporary directory; `body` gets it and the directory is removed afterwards. */
export function projectTest(name: string, body: (project: Project) => Promise<void>, options: { readonly io?: StoreIo, readonly lock?: LockEnvironment } = {}): void {
  test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rules-'))
    try {
      await mkdir(join(root, '.git'))
      await body({ root, board: openRulesBoard({ projectRoot: root, ...(options.io === undefined ? {} : { io: options.io }), ...(options.lock === undefined ? {} : { lock: options.lock }) }) })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

/** A clock the test moves: the moment every record, ticket and expiry of the board is judged by. */
export interface FakeClock {
  readonly now: () => number
  /** Move forward and return the new moment. */
  readonly advance: (ms: number) => number
  readonly iso: () => string
}

export function fakeClock(start: string): FakeClock {
  let at = Date.parse(start)
  return { now: () => at, advance: (ms) => (at += ms), iso: () => new Date(at).toISOString() }
}

export const MINUTE = 60_000
export const HOUR = 3_600_000

export interface ClockedProject {
  readonly root: string
  readonly clock: FakeClock
  readonly board: RulesBoard
  readonly paths: RulesPaths
}

/** A git project with a board on a clock the test moves; `options` are the board's (a small journal size to rotate, for one). */
export function clockedTest(name: string, body: (project: ClockedProject) => Promise<void>, options: { readonly start?: string, readonly rotateAtBytes?: number } = {}): void {
  test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rules-'))
    try {
      await mkdir(join(root, '.git'))
      const clock = fakeClock(options.start ?? '2026-11-03T08:00:00.000Z')
      const board = openRulesBoard({ projectRoot: root, io: quickIo({ now: clock.now }), ...(options.rotateAtBytes === undefined ? {} : { rotateAtBytes: options.rotateAtBytes }) })
      await body({ root, clock, board, paths: board.paths })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

/** A host's heartbeat file, as the host writes it: `<runtime dir>/hosts/<pid>-<start>.json`, stamped with the given moment; `fields` replace or add to the file's other fields (`computed`, `catalog`). */
export async function writeHeartbeat(paths: RulesPaths, host: { readonly pid: number, readonly startedAt: number }, at: string, fields: Readonly<Record<string, unknown>> = {}): Promise<string> {
  const dir = join(paths.runtimeDir, 'hosts')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${host.pid}-${host.startedAt}.json`)
  await writeFile(file, JSON.stringify({ host, at, sessions: [], runner: false, ...fields }))
  return file
}

/** Every file under the project root (git's own directory aside) with its bytes: a refused request must leave this as it was. */
export async function treeOf(root: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {}
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git') await walk(path)
      }
      else tree[relative(root, path).replaceAll('\\', '/')] = await readFile(path, 'utf8')
    }
  }
  await walk(root)
  return tree
}

/** The records of the current journal file. */
export async function journalOf(paths: RulesPaths): Promise<JournalRecord[]> {
  const text = await readFile(paths.journal, 'utf8').catch(() => '')
  return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalRecord)
}

/**
 * A record an earlier writer left, for a state the engine has no operation for yet (a session's rule): the changes are
 * applied to the state as it stands, journaled with the digest they leave, and the snapshot follows.
 */
export async function injectRecord(paths: RulesPaths, changes: readonly Change[], at: string, actor: RulesActor = 'harness', op = 'test-inject'): Promise<ProjectState> {
  const load = loadState(paths)
  const seq = load.nextSeq
  const next = applyRecord(load.state, { seq, changes })
  await ensureRuntimeDir(paths)
  await appendRecord(paths, { seq, at, actor, op, changes, snapshot: stateDigest(next) })
  await writeSnapshot(paths, next, quickIo())
  return next
}
