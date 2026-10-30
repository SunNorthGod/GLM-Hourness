/**
 * The write lock of one project's rules state (design §7.4 step 2): an
 * exclusive file, created with `wx`, that holds `{pid, startedAt, at,
 * token}` and, for whoever finds it, `boot` (when the machine booted, if the
 * environment can tell) and `holder` (who asked, if the caller named
 * itself). A lock whose holder is gone, or that is older than the critical
 * section can last, is taken over; otherwise a writer retries every 25 ms
 * and gives up after 2 s with `busy`. Written after DSH's `withFileLock`
 * (rc.3 atomic-write:189–219) because the runtime's packages cannot be
 * resolved from this repository (docs/DESIGN.md §2.4).
 *
 * The holder checks `held()` just before it appends: a lock taken over from
 * a writer that stalled no longer carries that writer's token, and the stalled
 * writer must abandon. The millisecond window that is left is closed by the
 * revision check of the write.
 *
 * Not rules-specific: this is the one file-lock module of the repository.
 * The rules board uses it with the defaults below; M7's gate lock
 * (src/execute/gate-lock.ts) passes `LockOptions` for a lock that is held for
 * minutes and waited for up to an hour, and M5 reuses it instead of writing a
 * second one (docs/ORCHESTRATION.md §16.3, §17.6). Every option defaults to
 * the rules board's behavior, so a caller that passes none sees no change.
 *
 * Time is judged on the `at` stamp the holder wrote, which is the file's
 * modification time because nobody rewrites the file; it comes from the
 * injected clock, so tests do not touch file times.
 */
import { randomUUID } from 'node:crypto'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { uptime } from 'node:os'

/** A lock older than this is taken over: the critical section lasts tens of milliseconds. */
export const STALE_LOCK_MS = 10_000
/** How long a writer waits for the lock before it reports `busy`. */
export const LOCK_WAIT_MS = 2_000
const RETRY_MS = 25

export interface LockEnvironment {
  readonly now: () => number
  readonly sleep: (ms: number) => Promise<void>
  readonly pid: number
  /** Whether a process with this id is alive. */
  readonly isAlive: (pid: number) => boolean
  /**
   * When the machine booted, in epoch milliseconds: now minus uptime. Optional:
   * an environment without it writes no `boot` and never compares one, so an
   * environment written for the interface before this member existed still works.
   */
  readonly bootTime?: () => number
}

export const realLockEnvironment: LockEnvironment = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  pid: process.pid,
  isAlive(pid) {
    try {
      process.kill(pid, 0)
      return true
    }
    catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
  },
  bootTime: () => Date.now() - uptime() * 1000,
}

export interface WriteLock {
  /** Whether the lock file still carries this writer's token. */
  held(): Promise<boolean>
  release(): Promise<void>
}

/** What a caller can change; each default is the rules board's value. */
export interface LockOptions {
  /** Pause between attempts. Default 25 ms. */
  readonly retryMs?: number
  /** How long to wait before `busy`. Default `LOCK_WAIT_MS`. */
  readonly waitMs?: number
  /** A lock whose `at` stamp is older than this is taken over even when its holder lives. Default `STALE_LOCK_MS`. */
  readonly staleMs?: number
  /**
   * A lock written in another boot of the machine is taken over: its `boot`
   * differs from the current boot time by more than this. The tolerance
   * absorbs rounding and small clock corrections between two computations of
   * the boot time. Default: the boot time is not compared.
   */
  readonly bootToleranceMs?: number
  /** Who holds the lock, written into the file for whoever finds it. */
  readonly holder?: string
  /** Rename a lock that is taken over to `<file>.stale-<ms>` instead of deleting it. Default: delete. */
  readonly keepStale?: boolean
}

interface LockContent {
  readonly pid: number
  readonly startedAt: number
  readonly at: number
  readonly token: string
  readonly boot?: number
  readonly holder?: string
}

async function readContent(file: string): Promise<{ readonly text: string, readonly content: Partial<LockContent> } | undefined> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  }
  catch {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return { text, content: typeof parsed === 'object' && parsed !== null ? parsed : {} }
  }
  catch {
    return { text, content: {} }
  }
}

async function tryCreate(file: string, content: LockContent): Promise<boolean> {
  try {
    const handle = await open(file, 'wx')
    try {
      await handle.writeFile(JSON.stringify(content))
    }
    finally {
      await handle.close()
    }
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/** Whether the holder is gone, the lock is too old, or it was written before the machine last booted. */
function isAbandoned(content: Partial<LockContent>, environment: LockEnvironment, options: LockOptions): boolean {
  const { pid, at, boot } = content
  if (typeof pid === 'number' && !environment.isAlive(pid)) return true
  if (typeof at !== 'number' || environment.now() - at > (options.staleMs ?? STALE_LOCK_MS)) return true
  if (options.bootToleranceMs === undefined || typeof boot !== 'number') return false
  const current = environment.bootTime?.()
  return current !== undefined && Math.abs(boot - current) > options.bootToleranceMs
}

/** Take the lock, or `busy` when someone else holds it for the whole wait. The directory of `file` must exist. */
export async function acquireLock(file: string, environment: LockEnvironment = realLockEnvironment, options: LockOptions = {}): Promise<WriteLock | 'busy'> {
  const token = randomUUID()
  const startedAt = environment.now()
  const deadline = startedAt + (options.waitMs ?? LOCK_WAIT_MS)
  for (;;) {
    const boot = environment.bootTime?.()
    const written: LockContent = { pid: environment.pid, startedAt, at: environment.now(), token, ...(boot === undefined ? {} : { boot }), ...(options.holder === undefined ? {} : { holder: options.holder }) }
    if (await tryCreate(file, written)) {
      return {
        async held() {
          return (await readContent(file))?.content.token === token
        },
        async release() {
          if ((await readContent(file))?.content.token === token) await unlink(file).catch(() => {})
        },
      }
    }
    const holder = await readContent(file)
    if (holder === undefined) {
      // The holder released between the attempt and the read: try again at once.
      if (environment.now() >= deadline) return 'busy'
      continue
    }
    // Remove only the lock that was read: a writer that took over in between keeps its fresh one.
    const removed = isAbandoned(holder.content, environment, options) && (await readContent(file))?.text === holder.text
      && await (options.keepStale === true ? rename(file, `${file}.stale-${environment.now()}`) : unlink(file)).then(() => true, () => false)
    if (removed) continue
    if (environment.now() >= deadline) return 'busy'
    await environment.sleep(options.retryMs ?? RETRY_MS)
  }
}
