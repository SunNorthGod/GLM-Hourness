/**
 * Watching the files entries wait for (docs/ORCHESTRATION.md §18.9; loop board
 * design 0.6 §4.1): one judgment of "this file changed", in one place, for both
 * boards. The loop row puts `loops.file-changed` out with it, and the rules
 * board's detectors use the same function when they land, so the two never
 * disagree on what a change is.
 *
 * What counts as one change: `fs.watch` says something happened and the beat
 * (60 seconds) compares size and modification time as a backstop, so a change
 * is caught even where `fs.watch` says nothing (a network share, an editor that
 * replaces the file). A file that changed counts once it has been still for 60
 * seconds, so a build that writes a file ten times in a row is one change. A
 * file that is gone counts too: its state is `gone` with the time of the last
 * version seen, which is what the dedupe key carries.
 *
 * Nothing here throws into its caller: a path that cannot be read is a state
 * like any other, and a `fs.watch` the platform refuses leaves the beat as the
 * only way the change is found.
 */
import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'

/** How long a file has to be still before its change counts. */
export const QUIET_MS = 60_000

export interface FileState {
  /** The size in bytes, or `gone` when the file is not there. */
  readonly size: number | 'gone'
  /** The modification time in milliseconds; for a file that is gone, the time of the last version seen. */
  readonly mtimeMs: number
}

export interface WatchDeps {
  readonly now: () => number
  /** Read one path's state; a path that cannot be read at all is `gone`. */
  readonly read?: (path: string, previous: FileState | undefined) => Promise<FileState>
  /** Say when something happened to a path; undefined when the platform refuses to watch it. */
  readonly watch?: (path: string, happened: () => void) => (() => void) | undefined
  /** A timer that runs `run` once after `ms` and returns the cancel; the row's own timers never hold the process open. */
  readonly delay: (run: () => void, ms: number) => () => void
  /** How long a file has to be still; default `QUIET_MS`. */
  readonly quietMs?: number
  /** The states a stopped host left, so a change made while it was down is found once (design §6.8). */
  readonly known?: ReadonlyMap<string, FileState>
}

export interface Watched {
  /** Compare every path now and tell `onChange` about every change that is settled. */
  beat(): Promise<void>
  /** The state of every path as the last settled reading left it, to keep for the next start. */
  states(): ReadonlyMap<string, FileState>
  /** Watch this set of paths from now on: paths that left are forgotten, new ones are read at the next beat. */
  follow(paths: readonly string[]): void
  dispose(): void
}

const sameState = (a: FileState | undefined, b: FileState | undefined): boolean =>
  a?.size === b?.size && a?.mtimeMs === b?.mtimeMs

/** The real reading: a file that is not there keeps the time of the version last seen. */
async function readState(path: string, previous: FileState | undefined): Promise<FileState> {
  try {
    const found = await stat(path)
    return { size: found.size, mtimeMs: Math.round(found.mtimeMs) }
  }
  catch {
    return { size: 'gone', mtimeMs: previous?.mtimeMs ?? 0 }
  }
}

/** The real watch; a platform that refuses to watch the path leaves the beat as the only finder. */
function realWatch(path: string, happened: () => void): (() => void) | undefined {
  try {
    const watcher = watch(path, { persistent: false }, () => { happened() })
    watcher.on('error', () => { watcher.close() })
    return () => { watcher.close() }
  }
  catch {
    return undefined
  }
}

interface Entry {
  /** The last state a settled change left (or the one a stopped host remembered). */
  settled: FileState | undefined
  /** A state seen that is not settled yet, and when it was first seen. */
  pending: { state: FileState, since: number } | undefined
  stop: (() => void) | undefined
  /** The timer armed to look again once the quiet time is over. */
  cancel: (() => void) | undefined
}

/**
 * Watch `paths` and tell `onChange` once for each settled change. `onChange`
 * is called from a beat or from a timer; a throw of it is swallowed here, since
 * a watcher must not take the host's timer down.
 */
export function watchPaths(paths: readonly string[], onChange: (path: string, state: FileState) => void, deps: WatchDeps): Watched {
  const read = deps.read ?? readState
  const watcher = deps.watch ?? realWatch
  const quietMs = deps.quietMs ?? QUIET_MS
  const entries = new Map<string, Entry>()

  const tell = (path: string, state: FileState): void => {
    try {
      onChange(path, state)
    }
    catch {
      // The caller reports its own faults; a watcher never throws out of a timer.
    }
  }

  async function look(path: string): Promise<void> {
    const entry = entries.get(path)
    if (entry === undefined) return
    const state = await read(path, entry.pending?.state ?? entry.settled)
    if (entry.settled === undefined && entry.pending === undefined) {
      // The first reading of a path this host has no state for is what is there, not a change: a restart does not wake anybody.
      entry.settled = state
      return
    }
    if (sameState(state, entry.settled)) {
      entry.cancel?.()
      entry.cancel = undefined
      entry.pending = undefined
      return
    }
    if (entry.pending === undefined || !sameState(state, entry.pending.state)) {
      entry.pending = { state, since: deps.now() }
      entry.cancel?.()
      entry.cancel = deps.delay(() => { entry.cancel = undefined; void look(path) }, quietMs)
      return
    }
    if (deps.now() - entry.pending.since < quietMs) return
    entry.settled = state
    entry.pending = undefined
    entry.cancel?.()
    entry.cancel = undefined
    tell(path, state)
  }

  function follow(next: readonly string[]): void {
    const wanted = new Set(next)
    for (const [path, entry] of entries) {
      if (wanted.has(path)) continue
      entry.stop?.()
      entry.cancel?.()
      entries.delete(path)
    }
    for (const path of wanted) {
      if (entries.has(path)) continue
      const entry: Entry = { settled: deps.known?.get(path), pending: undefined, stop: undefined, cancel: undefined }
      entries.set(path, entry)
      entry.stop = watcher(path, () => {
        entry.cancel?.()
        entry.cancel = deps.delay(() => { entry.cancel = undefined; void look(path) }, quietMs)
      })
    }
  }

  follow(paths)
  return {
    beat: async () => {
      for (const path of [...entries.keys()]) await look(path)
    },
    states: () => new Map([...entries].flatMap(([path, entry]) => entry.settled === undefined ? [] : [[path, entry.settled] as const])),
    follow,
    dispose() {
      for (const entry of entries.values()) {
        entry.stop?.()
        entry.cancel?.()
      }
      entries.clear()
    },
  }
}
