/**
 * The engine's notes mapped to metric events (metrics design §6.3, §4.2):
 * a written note's every entry becomes one `graph` event — the same shape
 * `backfill-graph` writes for history entries, minus `src` (a live write is
 * not a backfill) and with `rev`, the node's revision after the write; a
 * failed note becomes one `graph-fail` with the code and whatever of the
 * request the engine could name (F23: no history number and no revision
 * exists on a failure). Pure: the metrics row and the command line both
 * map through this, then record for the project the note's graph directory
 * belongs to.
 */
import type { EmittedEvent, HostBodies } from '../shared/metrics.ts'
import type { EngineEntry, EngineNote } from './engine.ts'

/** The events one engine note carries, in the note's own order. */
export function engineEventsOf(note: EngineNote): readonly EmittedEvent[] {
  if (note.kind === 'failed') {
    return [{
      k: 'graph-fail',
      by: 'graph',
      body: {
        actor: note.actor,
        err: note.err,
        ...(note.op === undefined ? {} : { op: note.op }),
        ...(note.node === undefined ? {} : { node: note.node }),
        ...(note.field === undefined ? {} : { field: note.field }),
      },
    }]
  }
  return note.entries.map(entry => ({ k: 'graph', by: 'graph', body: graphBody(entry) }))
}

function graphBody(entry: EngineEntry): HostBodies['graph'] {
  return {
    node: entry.node,
    type: entry.type,
    op: entry.op,
    hi: entry.hi,
    actor: entry.actor,
    rev: entry.rev,
    ...(entry.relay ? { relay: true as const } : {}),
    ...(entry.from === undefined ? {} : { from: entry.from }),
    ...(entry.to === undefined ? {} : { to: entry.to }),
  }
}
