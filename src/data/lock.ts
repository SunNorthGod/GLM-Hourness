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
import { open, rename, stat, unlink } from 'node:fs/promises'
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
  /**
   * A file whose content tells nothing (empty, not JSON, no pid and no stamp)
   * may belong to a creator that has made the file and not yet written it.
   * It is taken over only once this waiter has seen the same content for this
   * long. A lock held for minutes cannot afford to be taken from a live
   * creator in that window. Default 0: at once, as the rules board always did.
   */
  readonly unreadableGraceMs?: number
}

interface LockContent {
  readonly pid: number
  readonly startedAt: number
  readonly at: number
  readonly token: string
  readonly boot?: number
  readonly holder?: string
}

interface ReadLock {
  readonly text: string
  readonly content: Partial<LockContent>
  readonly mtimeMs: number
  readonly birthtimeMs: number
  readonly size: number
  readonly ino: number
}

async function readContent(file: string): Promise<ReadLock | undefined> {
  try {
    const handle = await open(file, 'r')
    try {
      const text = await handle.readFile('utf8')
      const info = await handle.stat()
      let content: Partial<LockContent> = {}
      try {
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed === 'object' && parsed !== null) content = parsed
      }
      catch {
        // Non-JSON content is tracked as unreadable with its file stats.
      }
      return {
        text,
        content,
        mtimeMs: info.mtimeMs,
        birthtimeMs: info.birthtimeMs,
        size: info.size,
        ino: info.ino,
      }
    }
    finally {
      await handle.close()
    }
  }
  catch {
    return undefined
  }
}

/** Serialize stale-lock takeover across contenders with a short-lived `.takeover` file. */
export async function withTakeoverLock<T>(
  targetFile: string,
  action: () => Promise<T>,
  staleMs = 5_000,
): Promise<{ readonly acquired: true, readonly value: T } | { readonly acquired: false }> {
  const takeoverFile = `${targetFile}.takeover`
  let takeoverHandle = await open(takeoverFile, 'wx').catch(() => undefined)
  if (takeoverHandle === undefined) {
    const takeoverInfo = await stat(takeoverFile).catch(() => undefined)
    if (takeoverInfo !== undefined && Date.now() - takeoverInfo.mtimeMs > staleMs) {
      await unlink(takeoverFile).catch(() => {})
      takeoverHandle = await open(takeoverFile, 'wx').catch(() => undefined)
    }
  }
  if (takeoverHandle === undefined) return { acquired: false }
  try {
    await takeoverHandle.close().catch(() => {})
    return { acquired: true, value: await action() }
  }
  finally {
    await unlink(takeoverFile).catch(() => {})
  }
}

/**
 * Created (`true`), held by someone else (`false`), or, on Windows only, the
 * refusal `EPERM`: while another process is unlinking the previous lock the
 * name answers access denied instead of `EEXIST` for a few milliseconds. The
 * refusal is returned so the caller can wait it out; a refusal that does not
 * pass is a real one and is thrown at the deadline.
 */
async function tryCreate(file: string, content: LockContent): Promise<boolean | Error> {
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
    const { code } = error as NodeJS.ErrnoException
    if (code === 'EEXIST') return false
    if (code === 'EPERM' && process.platform === 'win32') return error as Error
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
  /** The content without information this waiter last saw, and when it first saw it (reset on any text or mtime/birthtime advance). */
  let unreadable: { readonly text: string, readonly mtimeMs: number, readonly birthtimeMs: number, readonly since: number } | undefined
  for (;;) {
    const boot = environment.bootTime?.()
    const written: LockContent = { pid: environment.pid, startedAt, at: environment.now(), token, ...(boot === undefined ? {} : { boot }), ...(options.holder === undefined ? {} : { holder: options.holder }) }
    const created = await tryCreate(file, written)
    if (created === true) {
      return {
        async held() {
          return (await readContent(file))?.content.token === token
        },
        async release() {
          if ((await readContent(file))?.content.token === token) await unlink(file).catch(() => {})
        },
      }
    }
    if (created !== false) {
      if (environment.now() >= deadline) throw created
      await environment.sleep(options.retryMs ?? RETRY_MS)
      continue
    }
    const holder = await readContent(file)
    if (holder === undefined) {
      // The holder released between the attempt and the read: try again at once.
      unreadable = undefined
      if (environment.now() >= deadline) return 'busy'
      continue
    }
    let abandoned = isAbandoned(holder.content, environment, options)
    // Seen "continuously": any content that tells something, or none at all, ends the run of looks; an mtime/birthtime advance (heartbeat rewrite) resets the grace clock.
    if (typeof holder.content.pid === 'number' || typeof holder.content.at === 'number' || (options.unreadableGraceMs ?? 0) <= 0) unreadable = undefined
    else if (unreadable === undefined || unreadable.text !== holder.text || unreadable.mtimeMs !== holder.mtimeMs || unreadable.birthtimeMs !== holder.birthtimeMs) {
      unreadable = { text: holder.text, mtimeMs: holder.mtimeMs, birthtimeMs: holder.birthtimeMs, since: environment.now() }
    }
    if (unreadable !== undefined) abandoned = environment.now() - unreadable.since >= (options.unreadableGraceMs ?? 0)
    // Remove only the exact lock file that was read: serialize stale takeover via an exclusive `.takeover` file and re-verify stat right before atomic rename.
    let removed = false
    if (abandoned) {
      await withTakeoverLock(file, async () => {
        const current = await stat(file).catch(() => undefined)
        if (
          current !== undefined
          && current.mtimeMs === holder.mtimeMs
          && current.birthtimeMs === holder.birthtimeMs
          && current.size === holder.size
          && current.ino === holder.ino
        ) {
          const archive = options.keepStale === true ? `${file}.stale-${environment.now()}` : `${file}.trash-${randomUUID()}`
          const moved = await rename(file, archive).then(() => true, () => false)
          if (moved) {
            if (options.keepStale !== true) await unlink(archive).catch(() => {})
            removed = true
          }
        }
      })
    }
    if (removed) {
      unreadable = undefined
      continue
    }
    if (environment.now() >= deadline) return 'busy'
    await environment.sleep(options.retryMs ?? RETRY_MS)
  }
}
