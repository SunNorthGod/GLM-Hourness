/**
 * The gate lock (M7 design 0.6 §3.8.3): one merge check or full trunk check
 * at a time uses the gate worktree of a project. The lock file is
 * `<exec>/gate.lock`, `<exec>` being the project's `.llm/execute/`, and the
 * lock is the repository's one file lock, `src/data/lock.ts`, taken with the
 * gate's values:
 *
 * - a waiter tries every 5 seconds and gives up with `busy` after 60
 *   minutes (the design's `gate_busy`);
 * - a lock held for more than 6 hours is stale, longer than the longest
 *   check can run;
 * - a lock written before the machine last booted is stale: its boot time
 *   differs from the current one by more than 120 seconds, which absorbs
 *   rounding and small clock corrections;
 * - a lock file without readable content is abandoned only after a waiter
 *   has seen it that way for 2 seconds (its creator may be between creating
 *   the file and writing it);
 * - a lock taken over is renamed to `gate.lock.stale-<ms>` and kept;
 * - the file names its holder; releasing deletes the file only while it
 *   still carries this holder's token, so a holder that was wrongly judged
 *   stale never deletes its successor's lock.
 *
 * Holders in one process queue behind each other in arrival order and hand
 * the lock over at once instead of waiting for the next poll. The queue
 * saves time and keeps the order; the file is what excludes. A waiter that
 * gives up leaves the queue without letting the ones behind it jump ahead
 * of the ones still in front of it.
 *
 * A holder whose process is gone does not block either: the shared lock
 * takes over a lock whose pid is dead. The design names only the two
 * conditions above; a dead holder on the same machine is certain, and the
 * alternative is up to six hours of `busy` after a crash.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acquireLock, realLockEnvironment, type LockEnvironment, type LockOptions, type WriteLock } from '../data/lock.ts'

const GATE_LOCK_FILE = 'gate.lock'
export const GATE_RETRY_MS = 5_000
export const GATE_WAIT_MS = 60 * 60_000
export const GATE_STALE_MS = 6 * 60 * 60_000
export const GATE_BOOT_TOLERANCE_MS = 120_000
/** Time a creator gets between making the lock file and writing its content; a file that stays empty longer is abandoned. Under one poll. */
export const GATE_UNREADABLE_GRACE_MS = 2_000

/** The values of the design; tests pass shorter ones. */
const GATE_OPTIONS: LockOptions = {
  retryMs: GATE_RETRY_MS,
  waitMs: GATE_WAIT_MS,
  staleMs: GATE_STALE_MS,
  bootToleranceMs: GATE_BOOT_TOLERANCE_MS,
  unreadableGraceMs: GATE_UNREADABLE_GRACE_MS,
  keepStale: true,
}

const queues = new Map<string, Promise<void>>()
const queueKey = (file: string): string => process.platform === 'win32' ? resolve(file).toLowerCase() : resolve(file)

/** Whether `done` settled within `ms` milliseconds, without leaving a timer behind. */
function settledWithin(done: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((report) => {
    const timer = setTimeout(() => report(false), Math.max(0, ms))
    void done.then(() => {
      clearTimeout(timer)
      report(true)
    })
  })
}

/**
 * `<exec>` must exist and ignore itself, like every runtime directory of the
 * execution layer (§2.1): a `.gitignore` holding `*` also hides itself, so
 * the directory stays out of git where the project's own ignore rules do
 * not cover `.llm/`. An existing file is left alone.
 */
async function ensureExecDir(execDir: string): Promise<void> {
  await mkdir(execDir, { recursive: true })
  await writeFile(join(execDir, '.gitignore'), '*\n', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
}

export interface GateLockSetup {
  readonly environment?: LockEnvironment
  /** Replaces single values of the gate's options. */
  readonly options?: LockOptions
}

/**
 * Take the gate lock of the project whose runtime directory is `execDir`,
 * or `busy` when another check holds it for the whole wait. `holder` says
 * who asks (`check 1a2b3c4`) and is written into the file. Throws only when
 * `execDir` cannot be created.
 */
export async function acquireGateLock(execDir: string, holder: string, setup: GateLockSetup = {}): Promise<WriteLock | 'busy'> {
  const environment = setup.environment ?? realLockEnvironment
  const options: LockOptions = { ...GATE_OPTIONS, holder, ...setup.options }
  const waitMs = options.waitMs ?? GATE_WAIT_MS
  const startedAt = environment.now()
  await ensureExecDir(execDir)
  const file = join(execDir, GATE_LOCK_FILE)
  const key = queueKey(file)

  // The queue is a chain: the tail settles when everyone ahead is done and this caller is done (released the lock, or gave up).
  let leave: () => void = () => {}
  const mine = new Promise<void>((resolveMine) => { leave = resolveMine })
  const ahead = queues.get(key)
  const tail = Promise.all([ahead, mine]).then(() => {})
  queues.set(key, tail)
  const finish = (): void => {
    leave()
    void tail.then(() => {
      if (queues.get(key) === tail) queues.delete(key)
    })
  }

  try {
    if (ahead !== undefined && !await settledWithin(ahead, waitMs)) {
      finish()
      return 'busy'
    }
    const lock = await acquireLock(file, environment, { ...options, waitMs: Math.max(0, waitMs - (environment.now() - startedAt)) })
    if (lock === 'busy') {
      finish()
      return 'busy'
    }
    return {
      held: () => lock.held(),
      async release() {
        await lock.release()
        finish()
      },
    }
  }
  catch (error) {
    finish()
    throw error
  }
}
