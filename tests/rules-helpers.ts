/**
 * Shared pieces of the rules board specs: a project in a temporary
 * directory (a git repository by its `.git` directory, as src/data/project-root.ts
 * reads it), the board's files by name, and a store whose file operations
 * the test can bend.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openRulesBoard, type RulesBoard } from '../src/rules/engine.ts'
import { realLockEnvironment, type LockEnvironment } from '../src/rules/lock.ts'
import { realStoreIo, type StoreIo } from '../src/rules/store.ts'

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
