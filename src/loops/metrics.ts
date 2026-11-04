/**
 * The loop board's metric events (loop board design 0.6 §6.10; metrics
 * design §4.5, §6.2, §12 step 6): every record the board writes hands one
 * event to the metrics journal at the same moment — the run pairs and the
 * things that happen beside a run. The board wrote its own
 * `.llm/loops/runs.jsonl` until the stream landed; the journal is the record
 * now, and the readers of run history (the page's last-run cache, the
 * `state.json` rebuild, `staleEntries`, `timeoutEntries`) will read it back
 * with `readLog(root, {from, to})` over a 28-day window when that path is
 * built. A failing write never reaches the run: the metrics row counts its
 * own losses (§5.1), the run goes on.
 */
import type { EmittedEvent } from '../shared/metrics.ts'
import type { LoopRecord } from './records.ts'

/** The board event as the journal's closed vocabulary holds it. */
export function metricEventOf(record: LoopRecord): EmittedEvent | undefined {
  switch (record.kind) {
    case 'loop-fired':
      return {
        k: 'loop-fired',
        by: 'loops',
        body: {
          entry: record.entry,
          run: record.run,
          source: record.source,
          ...(record.plugin === undefined ? {} : { plugin: record.plugin }),
          ...(record.row === undefined ? {} : { row: record.row }),
          trigger: {
            kind: record.trigger.kind,
            ...(record.trigger.event === undefined ? {} : { event: record.trigger.event }),
            ...(record.trigger.occurrenceAt === undefined ? {} : { occurrenceAt: record.trigger.occurrenceAt }),
          },
          events: record.events,
          ...(record.cause === undefined ? {} : { cause: record.cause }),
          ...(record.late === true ? { late: true } : {}),
        },
      }
    case 'loop-done':
      return {
        k: 'loop-done',
        by: 'loops',
        body: {
          entry: record.entry,
          run: record.run,
          outcome: record.outcome,
          ...(record.reason === undefined ? {} : { reason: record.reason }),
          ...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
          ...(record.outputBytes === undefined ? {} : { outputBytes: record.outputBytes }),
          ...(record.delivery === undefined ? {} : { delivery: record.delivery }),
          ...(record.messageId === undefined ? {} : { messageId: record.messageId }),
        },
      }
    case 'loop-duplicate':
      return { k: 'loop-duplicate', by: 'loops', body: { event: record.event, key: record.key, from: record.from, firstSeen: record.firstSeen } }
    case 'loop-handover':
      return {
        k: 'loop-handover',
        by: 'loops',
        body: {
          op: record.op,
          pid: record.pid,
          ...(record.session === undefined ? {} : { session: record.session }),
        },
      }
    case 'loop-drift':
      return { k: 'loop-drift', by: 'loops', body: { entry: record.entry, what: record.what } }
    case 'loop-holder':
      return {
        k: 'loop-holder',
        by: 'loops',
        body: {
          ...(record.session === undefined ? {} : { session: record.session }),
          state: record.state,
          ...(record.reason === undefined ? {} : { reason: record.reason }),
        },
      }
    case 'loop-task-delete':
      return {
        k: 'loop-task-delete',
        by: 'loops',
        body: {
          ...(record.entry === undefined ? {} : { entry: record.entry }),
          scheduleId: record.scheduleId,
          why: record.why,
          deleted: record.deleted,
        },
      }
  }
}
