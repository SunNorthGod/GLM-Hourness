/**
 * The write lock of one project's rules state (design §7.4 step 2): an
 * exclusive file, created with `wx`, that holds `{pid, startedAt, at,
 * token}`. A lock whose holder is gone, or that is older than the critical
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
 * The rules board uses it today; M7's step E3 and M5 reuse it instead of
 * writing a second one (docs/ORCHESTRATION.md §16.3).
 */
import { randomUUID } from 'node:crypto'
import { open, readFile, unlink } from 'node:fs/promises'

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
}

export interface WriteLock {
  /** Whether the lock file still carries this writer's token. */
  held(): Promise<boolean>
  release(): Promise<void>
}

interface LockContent {
  readonly pid: number
  readonly startedAt: number
  readonly at: number
  readonly token: string
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

/** Take the lock, or `busy` when someone else holds it for the whole wait. The directory of `file` must exist. */
export async function acquireLock(file: string, environment: LockEnvironment = realLockEnvironment): Promise<WriteLock | 'busy'> {
  const token = randomUUID()
  const startedAt = environment.now()
  const deadline = startedAt + LOCK_WAIT_MS
  for (;;) {
    if (await tryCreate(file, { pid: environment.pid, startedAt, at: environment.now(), token })) {
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
    const { pid, at } = holder.content
    const abandoned = (typeof pid === 'number' && !environment.isAlive(pid)) || typeof at !== 'number' || environment.now() - at > STALE_LOCK_MS
    // Delete only the lock that was read: a writer that took over in between keeps its fresh one.
    const removed = abandoned && (await readContent(file))?.text === holder.text && await unlink(file).then(() => true, () => false)
    if (removed) continue
    if (environment.now() >= deadline) return 'busy'
    await environment.sleep(RETRY_MS)
  }
}
