/**
 * The loop board's two weekly lists (docs/ORCHESTRATION.md §18.4; loop board
 * design 0.6 §3.1, §6.11): which of the board's entries are stale — a
 * person's, four weeks old, no run with a result in four weeks — and which
 * time out again and again — three unfinished runs in seven days. The
 * selection is pure: the run facts come from the metrics journal
 * (records.ts `runEvents`, metrics F33) and an entry's age from the change
 * record's earliest add, the board computes the lists beside its view
 * (boards.ts) and holds them for the service's readers (index.ts), and the
 * status hub's `loops/*` entries word the same lists (this file's worders,
 * status hub design 0.3 §4.2, §12 loops row). The filter 「已在一条 open 的
 * 删除提议里的不列」 joins when the proposal path (`loop_propose`) is built;
 * today no proposal can exist.
 */
import type { EntryRunEvent } from './records.ts'
import type { StaleEntry, TimeoutEntry } from './service.ts'

/** The outcomes that count as a result (design §6.11): the run did what it was for, or told the main agent it did. */
const RESULT_OUTCOMES: ReadonlySet<string> = new Set(['delivered', 'ran', 'reported'])

/** The most entries either list names (design §6.11). */
export const LIST_CAP = 3

/** How long without a result makes a person's entry stale (design §6.11: four weeks). */
const STALE_AGE_MS = 28 * 86_400_000

/** How far back a run with a result keeps an entry off the first list (design §6.11: the same four weeks). */
const STALE_WINDOW_MS = 28 * 86_400_000

/** How far back timeouts count (design §6.11, `d-script-timeout`: seven days). */
const TIMEOUT_WINDOW_MS = 7 * 86_400_000

/** How many unfinished runs in the window put an entry on the second list (design §6.11: three). */
export const TIMEOUT_FLOOR = 3

/** A person's entry as the first list's candidate: the board's read gives id and title, its age comes from the change record. */
export interface StaleCandidate {
  readonly id: string
  readonly title: string
  /** The change record's earliest add, ISO; an entry without one cannot prove its age and is not listed. */
  readonly addedAt: string | undefined
}

/**
 * The first list (design §6.11, acceptance 34): the candidates four weeks
 * old or older whose window holds no run that reached a result, at most
 * `LIST_CAP`, the stalest first — no result ever first, then by the last
 * result, and equals by the day they were added.
 */
export function staleEntriesOf(input: {
  readonly entries: readonly StaleCandidate[]
  readonly runs: ReadonlyMap<string, readonly EntryRunEvent[]>
  readonly nowMs: number
}): readonly StaleEntry[] {
  const windowMs = input.nowMs - STALE_WINDOW_MS
  const found = input.entries.flatMap((entry): StaleEntry[] => {
    if (entry.addedAt === undefined) return []
    const added = Date.parse(entry.addedAt)
    if (!Number.isFinite(added) || added + STALE_AGE_MS > input.nowMs) return []
    let runs28d = 0
    let resultInWindow = false
    let lastResultAt: string | undefined
    for (const run of input.runs.get(entry.id) ?? []) {
      const at = Date.parse(run.at)
      if (run.kind === 'fired') {
        if (at >= windowMs) runs28d += 1
        continue
      }
      if (run.outcome === undefined || !RESULT_OUTCOMES.has(run.outcome)) continue
      // The journal is in instant order, so the last result seen is the latest.
      lastResultAt = run.at
      if (at >= windowMs) resultInWindow = true
    }
    if (resultInWindow) return []
    return [{
      id: entry.id,
      title: entry.title,
      addedAt: entry.addedAt,
      runs28d,
      why: runs28d === 0 ? 'never-triggered' : 'no-result',
      ...(lastResultAt === undefined ? {} : { lastResultAt }),
    }]
  })
  return found.sort((a, b) => {
    const aAt = a.lastResultAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(a.lastResultAt)
    const bAt = b.lastResultAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(b.lastResultAt)
    if (aAt !== bAt) return aAt < bAt ? -1 : 1
    return Date.parse(a.addedAt) <= Date.parse(b.addedAt) ? -1 : 1
  }).slice(0, LIST_CAP)
}

/** An entry as the second list's candidate: a person's and a plugin's alike, id and title only. */
export interface TimeoutCandidate {
  readonly id: string
  readonly title: string
}

/**
 * The second list (design §6.11, `d-script-timeout`): the candidates with
 * `TIMEOUT_FLOOR` or more `unfinished` runs in the last seven days, at most
 * `LIST_CAP`, the most timeouts first, equals by the earliest last timeout.
 */
export function timeoutEntriesOf(input: {
  readonly entries: readonly TimeoutCandidate[]
  readonly runs: ReadonlyMap<string, readonly EntryRunEvent[]>
  readonly nowMs: number
}): readonly TimeoutEntry[] {
  const windowMs = input.nowMs - TIMEOUT_WINDOW_MS
  const found = input.entries.flatMap((entry): TimeoutEntry[] => {
    let timeouts7d = 0
    let lastTimeoutAt: string | undefined
    for (const run of input.runs.get(entry.id) ?? []) {
      if (run.kind !== 'done' || run.outcome !== 'unfinished' || Date.parse(run.at) < windowMs) continue
      timeouts7d += 1
      lastTimeoutAt = run.at
    }
    if (timeouts7d < TIMEOUT_FLOOR || lastTimeoutAt === undefined) return []
    return [{ id: entry.id, title: entry.title, timeouts7d, lastTimeoutAt }]
  })
  return found.sort((a, b) => a.timeouts7d !== b.timeouts7d
    ? b.timeouts7d - a.timeouts7d
    : Date.parse(a.lastTimeoutAt) - Date.parse(b.lastTimeoutAt),
  ).slice(0, LIST_CAP)
}
