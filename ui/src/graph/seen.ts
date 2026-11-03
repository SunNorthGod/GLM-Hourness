/**
 * 上次看之后 (plain-ui 1.3 §6.8, §4.8): whether the panel is really in
 * front of the human, and when they last left. A pure state machine here,
 * a small hook in the panel that feeds it visibility events and keeps the
 * departure in the browser's localStorage — interface state of one person,
 * not project state, so it never enters the graph or git.
 *
 * The rules: an arrival is the mount, or a return to visible after more
 * than ten minutes hidden; it reads `since` from the local record. A
 * departure is turning away (or unmounting) after five continuous seconds
 * of visibility; it writes the time. Between arrivals `since` stays in
 * memory, so clicking into a second-layer page and back does not move the
 * list. Reads and writes that fail are treated as no record — the changes
 * read 「最近一天」, nothing breaks.
 */

/** Longer than this hidden, and the return is a new arrival. */
const AWAY_MS = 10 * 60 * 1000

/** Visibility shorter than this is not a departure worth recording. */
const SEEN_MS = 5 * 1000

export interface SeenState {
  /** When the human last left, as this arrival read it; undefined on the first visit (the changes read the last day). */
  readonly since: number | undefined
  /** When the current visibility stretch began; undefined while hidden. */
  readonly visibleSince: number | undefined
  /** When the panel was last known to be hidden. */
  readonly hiddenAt: number | undefined
}

export const initialSeen: SeenState = { since: undefined, visibleSince: undefined, hiddenAt: undefined }

export type SeenEvent = 'mount' | 'visible' | 'hidden' | 'unmount'

export interface SeenStep {
  /** The next persistent state. */
  readonly state: SeenState
  /** Defined when this event was a departure: the time to write to the record. */
  readonly departure: number | undefined
}

/**
 * The next state for one visibility event. `recorded` is the value in the
 * local storage right now; a departure's write is the hook's job (it has
 * the storage), the machine only says when: `departure` is set once, on
 * the event that turns away after five continuous seconds.
 */
export function nextSeen(state: SeenState, event: SeenEvent, now: number, recorded: number | undefined): SeenStep {
  switch (event) {
    case 'mount':
      return { state: { since: recorded, visibleSince: undefined, hiddenAt: undefined }, departure: undefined }
    case 'visible': {
      // A return after a long absence is a new arrival; a mount is one already.
      if (state.hiddenAt !== undefined && now - state.hiddenAt > AWAY_MS) {
        return { state: { since: recorded, visibleSince: now, hiddenAt: undefined }, departure: undefined }
      }
      if (state.visibleSince !== undefined) return { state, departure: undefined }
      return { state: { ...state, visibleSince: now, hiddenAt: undefined }, departure: undefined }
    }
    case 'hidden':
    case 'unmount': {
      if (state.visibleSince === undefined) return { state: { ...state, visibleSince: undefined, hiddenAt: now }, departure: undefined }
      const stayed = now - state.visibleSince
      if (stayed >= SEEN_MS) {
        return { state: { since: state.since, visibleSince: undefined, hiddenAt: now }, departure: now }
      }
      return { state: { ...state, visibleSince: undefined, hiddenAt: now }, departure: undefined }
    }
  }
}

/** The record of one graph directory: when the human last left the panel, or undefined (no record, unreadable). */
export function seenRecordOf(storage: Storage | undefined, key: string): number | undefined {
  try {
    const raw = storage?.getItem(key)
    if (raw === undefined || raw === null) return undefined
    const at = Date.parse(raw)
    return Number.isFinite(at) ? at : undefined
  }
  catch {
    return undefined
  }
}

/** Write the departure, or give up quietly (storage full or disabled: this arrival keeps its in-memory since). */
export function writeSeenRecord(storage: Storage | undefined, key: string, at: number): void {
  try {
    storage?.setItem(key, new Date(at).toISOString())
  }
  catch {
    // Interface state of one person; losing it only widens the next changes list.
  }
}

/** The local key of one graph directory (plain-ui 1.3 §6.8): the absolute nodes directory the reads come from. */
export function seenKeyOf(nodesDir: string): string {
  return `glm-hourness.panel.seen.v1:${nodesDir.replace(/\\/g, '/').toLowerCase()}`
}
