/**
 * The record of what the loop board did (docs/ORCHESTRATION.md §18.9; loop board
 * design 0.6 §6.10): every run writes a pair, `loop-fired` before it runs and
 * `loop-done` when it has an outcome, and the things that happen beside a run
 * (a duplicate event, the run lock changing hands) write one record each. The
 * loop row writes them; what a model says is not a record.
 *
 * They go to `<project>/.llm/loops/runs.jsonl`, rotated at 8 MiB, until the
 * metrics stream lands; the step that lands it changes this file only (same
 * agreement as the rules board's metrics.ts). No output text of a run is ever
 * written here: a record carries how many bytes, not what they said.
 */
import { rename, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { appendLine, ROTATE_BYTES, stamp } from '../rules/store.ts'
import type { LoopsPaths } from './store.ts'

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

/**
 * Append one record, rotating the file first when it has reached 8 MiB. A
 * failure to write never reaches the run: the caller is told through `problem`
 * and the run goes on, since a record is evidence and not a step of the work.
 */
export async function appendRun(paths: LoopsPaths, record: LoopRecord, problem?: (message: string) => void): Promise<void> {
  try {
    const size = await stat(paths.runs).then(found => found.size).catch(() => 0)
    if (size >= ROTATE_BYTES) await rename(paths.runs, paths.runs.replace(/\.jsonl$/, `-${stamp(Date.parse(record.at))}.jsonl`)).catch(() => {})
    await appendLine(paths.runs, record)
  }
  catch (error) {
    problem?.(`运行记录写不进：${error instanceof Error ? error.message : String(error)}`)
  }
}
