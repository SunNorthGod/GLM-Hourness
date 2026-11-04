/**
 * The record of what the loop board did (docs/ORCHESTRATION.md §18.9; loop board
 * design 0.6 §6.10): every run writes a pair, `loop-fired` before it runs and
 * `loop-done` when it has an outcome, and the things that happen beside a run
 * (a duplicate event, the run lock changing hands) write one record each. The
 * loop row writes them; what a model says is not a record.
 *
 * They go to the project's metrics journal as their `loop-*` events, mapped in
 * metrics.ts (loop board design 0.6 §6.10; metrics design §12 step 6 — the
 * board's own runs.jsonl is gone), and `recentRecords` is the one place that
 * reads them back, for the page's last runs (F33). No output text of a run
 * is ever written: a record carries how many bytes, not what they said.
 */
import { randomBytes } from 'node:crypto'
import { projectOf } from '../data/project-root.ts'
import { readLog } from '../metrics/read.ts'
import type { ViewRecord } from './view.ts'

/** How a run ended (design §6.10). `held` and `deferred` are told again later with the outcome they reach. */
export type RunOutcome =
  | 'delivered' | 'ran' | 'reported' | 'delegated' | 'skipped' | 'suppressed'
  | 'deferred' | 'blocked' | 'refused' | 'unfinished' | 'held' | 'failed' | 'expired'

/**
 * Why a run ended as it did. The design names these (§6.7, §6.10):
 * `rate`, `groups`, `self-loop` for a suppressed run; `unadopted`,
 * `check-missing`, `entry-changed`, `not-in-checkout` for a refused one;
 * `timeout`, `action-missing` for a harness action; the `holderState` of a
 * held message. A harness action's own `reason` is its words, so this is a
 * string and not a closed union.
 */
export type RunReason = string

export interface FiredRecord {
  readonly kind: 'loop-fired'
  readonly at: string
  readonly project: string
  readonly entry: string
  readonly run: string
  readonly source: 'plugin' | 'person'
  readonly plugin?: string
  readonly row?: string
  readonly trigger: { readonly kind: string, readonly event?: string, readonly occurrenceAt?: string }
  /** How many events were merged into this run. */
  readonly events: number
  /** The run whose own execution brought the event in (design §6.7). */
  readonly cause?: string
  readonly late?: boolean
}

export interface DoneRecord {
  readonly kind: 'loop-done'
  readonly at: string
  readonly project: string
  readonly entry: string
  readonly run: string
  readonly outcome: RunOutcome
  readonly reason?: RunReason
  readonly durationMs?: number
  readonly outputBytes?: number
  /** The exit codes of the processes the run started (design §6.10 `exits`); a run that started none has none. */
  readonly exits?: number[]
  readonly delivery?: 'steer' | 'inject' | 'followup' | 'dsh'
  readonly messageId?: string
}

export interface DuplicateRecord {
  readonly kind: 'loop-duplicate'
  readonly at: string
  readonly project: string
  readonly event: string
  readonly key: string
  readonly from: string
  readonly firstSeen: string
}

export interface HandoverRecord {
  readonly kind: 'loop-handover'
  readonly at: string
  readonly project: string
  readonly op: 'release' | 'take'
  readonly pid: number
  readonly session?: string
}

/** Somebody changed, deleted or did not deliver a reminder of the board's in DSH (design §6.10). */
export interface DriftRecord {
  readonly kind: 'loop-drift'
  readonly at: string
  readonly project: string
  readonly entry: string
  readonly what: 'edited' | 'deleted' | 'not-delivered' | 'orphan'
}

/** Whether the main agent's session can be told, and why not (design §6.4, §6.10): the one record that says afterwards why messages waited. */
export interface HolderRecord {
  readonly kind: 'loop-holder'
  readonly at: string
  readonly project: string
  readonly session?: string
  readonly state: 'ok' | 'none' | 'archived' | 'not-found' | 'elsewhere' | 'unknown'
  readonly reason?: string
}

/** The board deleted one DSH reminder; the whole text of it is in `removed-tasks.jsonl` and only its id is here (design §6.2, §6.10). */
export interface TaskDeleteRecord {
  readonly kind: 'loop-task-delete'
  readonly at: string
  readonly project: string
  readonly entry?: string
  readonly scheduleId: string
  readonly why: 'moved' | 'entry-gone' | 'duplicate' | 'no-holder' | 'holder-archived' | 'holder-not-found' | 'repair' | 'not-delivered'
  readonly deleted: boolean
}

export type LoopRecord = FiredRecord | DoneRecord | DuplicateRecord | HandoverRecord | DriftRecord | HolderRecord | TaskDeleteRecord

/** `run-<12 hex digits>`: one run of one entry, named in both of its records and in the message the main agent gets. */
export function runId(): string {
  return `run-${randomBytes(6).toString('hex')}`
}

/** What a run of one entry begins with (design §6.10), from the entry and the event that triggered it; one place, since a suppressed run writes the same pair. */
export function firedRecord(input: {
  readonly at: string
  readonly project: string
  readonly run: string
  readonly entry: { readonly id: string, readonly when: { readonly kind: string } }
  readonly from: { readonly source: 'plugin' | 'person', readonly plugin?: string, readonly row?: string }
  readonly event?: { readonly event: string, readonly at: string }
  readonly events: number
  readonly cause?: string
  readonly late?: boolean
}): FiredRecord {
  return {
    kind: 'loop-fired',
    at: input.at,
    project: input.project,
    entry: input.entry.id,
    run: input.run,
    source: input.from.source,
    ...(input.from.plugin === undefined ? {} : { plugin: input.from.plugin }),
    ...(input.from.row === undefined ? {} : { row: input.from.row }),
    trigger: {
      kind: input.entry.when.kind,
      ...(input.event === undefined ? {} : { event: input.event.event, occurrenceAt: input.event.at }),
    },
    events: input.events,
    ...(input.cause === undefined ? {} : { cause: input.cause }),
    ...(input.late === true ? { late: true } : {}),
  }
}

/** `ev-<16 hex digits>`: one line of the inbox. */
export function eventId(): string {
  return `ev-${randomBytes(8).toString('hex')}`
}

/** The records the page's last runs list (design §8.2 item 7): the runs, the events reported again, the DSH reminders the board deleted, in the view's shape. */
type RecentRecord = ViewRecord

/** How far back the last runs are looked for (metrics design F33: the board's readers take a 28-day window). */
const RECENT_DAYS = 28

const DAY_MS = 86_400_000

const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined

/** One journal event as a record the page lists, or undefined for every other kind. */
function recentOf(kind: string, at: string, body: Readonly<Record<string, unknown>>): RecentRecord | undefined {
  const entry = text(body['entry'])
  if (kind === 'loop-done') {
    const outcome = text(body['outcome'])
    if (entry === undefined || outcome === undefined) return undefined
    const reason = text(body['reason'])
    const exits = Array.isArray(body['exits']) ? body['exits'].filter((code): code is number => typeof code === 'number') : undefined
    return { kind, at, entry, outcome, ...(reason === undefined ? {} : { reason }), ...(exits === undefined ? {} : { exits }) }
  }
  if (kind === 'loop-duplicate') {
    const event = text(body['event'])
    return event === undefined ? undefined : { kind, at, event }
  }
  if (kind === 'loop-task-delete') {
    const why = text(body['why'])
    if (why === undefined || typeof body['deleted'] !== 'boolean') return undefined
    return { kind, at, ...(entry === undefined ? {} : { entry }), why, deleted: body['deleted'] }
  }
  return undefined
}

/**
 * The latest records the page lists, oldest first, at most `limit`, from the
 * project's metrics journal (`readLog`, so the lines are the ones the
 * journal's own tables accept): one UTC day file at a time, newest first,
 * back at most 28 days, stopping once `limit` are found. Never throws: a
 * journal that is not there or cannot be read has no recent runs.
 */
export async function recentRecords(root: string, nowMs: number, limit: number): Promise<RecentRecord[]> {
  const journal = projectOf(root)?.root ?? root
  const found: RecentRecord[] = []
  try {
    for (let back = 0; back < RECENT_DAYS && found.length < limit; back += 1) {
      const day = new Date(nowMs - back * DAY_MS).toISOString().slice(0, 10)
      const next = new Date(Date.parse(day) + DAY_MS).toISOString().slice(0, 10)
      const { events } = await readLog(journal, { from: day, to: next })
      const ofDay = events.flatMap((event) => {
        const record = recentOf(event.k, event.at, event.body)
        return record === undefined ? [] : [record]
      })
      found.unshift(...ofDay)
    }
  }
  catch {
    // A day file that cannot be read ends the look back; what was found stands.
  }
  return found.slice(-limit)
}