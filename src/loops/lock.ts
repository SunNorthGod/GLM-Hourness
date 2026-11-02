/**
 * Who runs a project's board (docs/ORCHESTRATION.md §18.9; loop board design 0.6
 * §6.1): one run lock for each project, `<project>/.llm/loops/runner.lock`, made
 * with `wx` so only one process gets it, and refreshed every beat. A process
 * that finds a fresh lock does not run the project; it says on the page that
 * another DSH process has it. Liveness is not judged by the pid (Windows reuses
 * them): a lock whose stamp is older than three minutes, or that was written in
 * another boot of this machine, is taken over, and the old file is kept as
 * `runner.lock.stale-<ms>` so a person can see it happened.
 *
 * The lock follows the main agent's session, because a message can only be
 * delivered in the process where that session is open (`session/writer-held`
 * elsewhere). A process in which the holder session opens writes
 * `handover.json` and refreshes it every beat; the holder reads it every beat
 * and lets the lock go once nothing of its own is running, which the other
 * process takes on its next beat. A process does not take a lock while
 * somebody else's `handover.json` is fresh, so the two do not take turns
 * fighting over it.
 *
 * Nothing here throws into the beat: a file that cannot be read or written
 * leaves the lock as it was and is told to the caller as a fault.
 */
import { open, rename, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { writeAtomic, type StoreIo } from '../rules/store.ts'
import type { LoopsPaths } from './store.ts'

/** A lock whose stamp is older than this is taken over, live holder or not (design §6.1). */
const LOCK_FRESH_MS = 3 * 60_000
/** Two readings of the machine's boot time may differ by this much and still mean the same boot. */
const BOOT_TOLERANCE_MS = 120_000

interface LockFile {
  readonly pid: number
  readonly boot: number
  readonly startedAt: string
  readonly at: string
  readonly token: string
}

interface HandoverFile {
  readonly pid: number
  readonly boot: number
  readonly session: string
  readonly at: string
  readonly token: string
}

export interface RunLockDeps {
  readonly paths: LoopsPaths
  readonly io: StoreIo
  readonly now: () => number
  readonly pid: number
  /** The machine's boot time, to the minute, as the rules board's lock computes it. */
  readonly boot: () => number
  /** The main agent's session if it is open in this process, else undefined (design §6.1). */
  readonly holderHere: () => string | undefined
  /** Whether a run of this process is in flight: the lock is not handed over while one is (design §6.1). */
  readonly busy: () => string | undefined
  /** A record of the lock changing hands (design §6.10 `loop-handover`). */
  readonly record: (op: 'release' | 'take', session?: string) => void
}

/** Where the lock stands after a beat. */
export type LockStand =
  /** This process runs the project. */
  | { readonly kind: 'held' }
  /** Another process holds a fresh lock. */
  | { readonly kind: 'elsewhere', readonly pid: number }
  /** This process asked for the lock (the holder session is open here) and the other one has not let go yet. */
  | { readonly kind: 'waiting', readonly pid: number }
  /** The lock is being handed over by this process, as soon as the run named here is finished. */
  | { readonly kind: 'handing', readonly run: string }
  | { readonly kind: 'fault', readonly reason: string }

export interface RunLock {
  /** Take the lock, refresh it, hand it over or ask for it; one call for each beat and one at the start. */
  beat(): Promise<LockStand>
  /** Whether this process holds the lock now. */
  holds(): boolean
  /** Let the lock and the hand-over request go, if they are this process's; called when the row unloads. */
  release(): Promise<void>
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Read a JSON file; undefined when it is not there or says nothing. */
async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    const handle = await open(file, 'r')
    try {
      const text = await handle.readFile('utf8')
      const value: unknown = JSON.parse(text)
      return typeof value === 'object' && value !== null ? value as T : undefined
    }
    finally {
      await handle.close()
    }
  }
  catch {
    return undefined
  }
}

export function createRunLock(deps: RunLockDeps): RunLock {
  const token = randomBytes(8).toString('hex')
  const startedAt = new Date(deps.now()).toISOString()
  let held = false
  /** Set while this process has a `handover.json` of its own on file. */
  let asked: string | undefined

  const iso = (): string => new Date(deps.now()).toISOString()
  const bootOf = (): number => Math.round(deps.boot() / 60_000) * 60_000
  const sameBoot = (boot: unknown): boolean => typeof boot === 'number' && Math.abs(boot - bootOf()) <= BOOT_TOLERANCE_MS
  const fresh = (at: unknown): boolean => typeof at === 'string' && deps.now() - Date.parse(at) <= LOCK_FRESH_MS

  const lockText = (): string => `${JSON.stringify({ pid: deps.pid, boot: bootOf(), startedAt, at: iso(), token } satisfies LockFile, null, 2)}\n`

  /** Make the lock file, or say it is already there, or why it could not be made. */
  async function create(): Promise<{ readonly kind: 'made' | 'taken' } | { readonly kind: 'fault', readonly reason: string }> {
    try {
      const handle = await open(deps.paths.runner, 'wx')
      try {
        await handle.writeFile(lockText())
        await handle.sync()
      }
      finally {
        await handle.close()
      }
      return { kind: 'made' }
    }
    catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EEXIST' ? { kind: 'taken' } : { kind: 'fault', reason: message(error) }
    }
  }

  async function refresh(): Promise<void> {
    const written = await writeAtomic(deps.paths.runner, lockText(), deps.io)
    if (!written.ok) await unlink(written.temporary).catch(() => {})
  }

  /** Ask for the lock: the main agent's session is open here and another process runs the project. */
  async function ask(session: string): Promise<void> {
    const request: HandoverFile = { pid: deps.pid, boot: bootOf(), session, at: iso(), token }
    const written = await writeAtomic(deps.paths.handover, `${JSON.stringify(request, null, 2)}\n`, deps.io)
    if (written.ok) asked = session
    else await unlink(written.temporary).catch(() => {})
  }

  /** Take the request back: this process no longer has the holder session, or it now holds the lock. */
  async function unask(): Promise<void> {
    if (asked === undefined) return
    const request = await readJson<HandoverFile>(deps.paths.handover)
    asked = undefined
    if (request?.token !== token) return
    await unlink(deps.paths.handover).catch(() => {})
  }

  async function dropLock(): Promise<void> {
    const file = await readJson<LockFile>(deps.paths.runner)
    held = false
    if (file?.token !== token) return
    await unlink(deps.paths.runner).catch(() => {})
  }

  /** The hand-over request of another process that is worth answering, if there is one. */
  async function requestFromElsewhere(): Promise<HandoverFile | undefined> {
    const request = await readJson<HandoverFile>(deps.paths.handover)
    if (request === undefined || request.token === token) return undefined
    if (!fresh(request.at) || !sameBoot(request.boot)) return undefined
    // The session it names must not be open here: then the request is out of date and this process is the one that can deliver.
    return deps.holderHere() === request.session ? undefined : request
  }

  async function asHolder(): Promise<LockStand> {
    await refresh()
    const request = await requestFromElsewhere()
    if (request === undefined) return { kind: 'held' }
    const running = deps.busy()
    if (running !== undefined) return { kind: 'handing', run: running }
    await dropLock()
    deps.record('release', request.session)
    return { kind: 'elsewhere', pid: request.pid }
  }

  async function claim(): Promise<LockStand> {
    const file = await readJson<LockFile>(deps.paths.runner)
    if (file?.token === token) {
      held = true
      return asHolder()
    }
    if (file !== undefined && fresh(file.at) && sameBoot(file.boot)) {
      const session = deps.holderHere()
      if (session === undefined) {
        await unask()
        return { kind: 'elsewhere', pid: file.pid }
      }
      // The main agent's session is open here: ask for the lock, refreshing the request every beat, and wait for the other process to let it go.
      await ask(session)
      return { kind: 'waiting', pid: file.pid }
    }
    if (file !== undefined) {
      // A lock nobody refreshed, or one from another boot: kept as evidence, not deleted.
      const kept = await rename(deps.paths.runner, `${deps.paths.runner}.stale-${deps.now()}`).then(() => true).catch(() => false)
      if (!kept) return { kind: 'fault', reason: '旧的运行锁改不了名，这一拍先不跑这个项目' }
    }
    else {
      // Somebody else's fresh request means they are about to take the lock: leave it to them.
      const request = await readJson<HandoverFile>(deps.paths.handover)
      if (request !== undefined && request.token !== token && fresh(request.at) && sameBoot(request.boot) && deps.holderHere() !== request.session) {
        return { kind: 'waiting', pid: request.pid }
      }
    }
    const made = await create()
    if (made.kind === 'taken') return { kind: 'elsewhere', pid: (await readJson<LockFile>(deps.paths.runner))?.pid ?? 0 }
    if (made.kind === 'fault') return { kind: 'fault', reason: `运行锁建不上：${made.reason}` }
    held = true
    // A record is written when the lock changed hands because the main agent's session is here, not when a process simply found it free (design §6.10).
    const handed = asked
    await unask()
    if (handed !== undefined) deps.record('take', handed)
    return { kind: 'held' }
  }

  return {
    holds: () => held,
    beat: async () => {
      try {
        if (!held) return await claim()
        const file = await readJson<LockFile>(deps.paths.runner)
        if (file?.token !== token) {
          // Somebody took the lock over (this process was stopped long enough to look dead): start again from the file.
          held = false
          return await claim()
        }
        return await asHolder()
      }
      catch (error) {
        return { kind: 'fault', reason: `运行锁读不出：${message(error)}` }
      }
    },
    release: async () => {
      try {
        await unask()
        if (held) await dropLock()
      }
      catch {
        // A lock left behind is taken over after three minutes; nothing is lost.
      }
    },
  }
}
