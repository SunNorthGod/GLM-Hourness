/**
 * The record of what the loop board did (docs/ORCHESTRATION.md §18.9; loop board
 * design 0.6 §6.10): every run writes a pair, `loop-fired` before it runs and
 * `loop-done` when it has an outcome, and the things that happen beside a run
 * (a duplicate event, the run lock changing hands) write one record each. The
 * loop row writes them; what a model says is not a record.
 *
 * They go to the project's metrics journal as their `loop-*` events, mapped in
 * metrics.ts (loop board design 0.6 §6.10; metrics design §12 step 6 — the
 * board's own runs.jsonl is gone). No output text of a run is ever written:
 * a record carries how many bytes, not what they said.
 */
import { randomBytes } from 'node:crypto'

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
