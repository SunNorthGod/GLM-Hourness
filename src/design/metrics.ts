/**
 * The design row's exit to the metrics journal (M3 addendum 0.6 §3.12;
 * metrics design §4.5, §6.2; decision `metrics`): what the design row and
 * the main agent's rules count goes out here, a number, a code or an id,
 * never the words of the conversation. The kinds and their fields are the
 * closed table of src/shared/metrics.ts (`DesignBodies`), so a field the
 * table does not have does not compile. The event names where it belongs
 * (the session and its working directory); the metrics row files it under
 * that project, and one it cannot place is counted, not written. Without
 * the metrics row the sink does nothing and says nothing: the facts are
 * still in the violation journal, the snapshot journal, the graph's history
 * and the session log.
 *
 * Ids built from outside text (session ids, node ids, tool names) go
 * through `toMetricsId`: a value that is not id-shaped is written `other`
 * and a missing required one `none`, so that one field never loses the
 * whole event. `pending` is the matter put to the human: the question for a
 * question, the goal (or the module) for a confirm and a release, so that a
 * showing and the answer to it pair up.
 */
import type { ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { emitMetric, metricsWhereOf, toMetricsId, type BodyEventOf, type DesignBodies, type MetricsWhere } from '../shared/metrics.ts'

/** One of the design row's ten kinds, before the sink adds the submitter. */
export type DesignMetricEvent = BodyEventOf<DesignBodies>

/** Where the design row and its rules hand their events. Never throws. */
export type DesignMetricSink = (event: DesignMetricEvent, where: MetricsWhere) => void

/** The sink over the metrics service as cordis finds it at each event (`emitMetric` reads the service lazily and swallows its failures). */
export function designMetricSink(ctx: ServiceLookup): DesignMetricSink {
  return (event, where) => { emitMetric(ctx, { ...event, by: 'design' }, where) }
}

/** Hand one event of an agent's session: filed under the session and its working directory. Never throws. */
export function emitDesign(lookup: ServiceLookup, agent: { readonly session?: SessionLike | undefined } | undefined, event: DesignMetricEvent): void {
  designMetricSink(lookup)(event, metricsWhereOf(agent?.session))
}

/** An optional id field: left out when there is none, else shaped by `toMetricsId`. */
export function optionalId<K extends string>(key: K, value: string | undefined): { readonly [P in K]?: string } {
  return (value === undefined || value === '' ? {} : { [key]: toMetricsId(value) }) as { readonly [P in K]?: string }
}

/** A count of milliseconds for an int field: whole, never below zero. */
export function msOf(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

/**
 * How the holder record of a project changed (`design.holder-moved`):
 * written by /wish (`wish`), moved here by /wish here (`here`), taken over
 * from a session that is gone or not in main agent mode (`takeover`),
 * written over a record that could not be read (`unreadable`), deleted by
 * /wish off (`off`), or deleted because the /wish that wrote it did not take
 * effect (`lapsed`: cancelled, failed, or found at the session's creation
 * with its mode off).
 */
export interface HolderMove {
  readonly how: 'wish' | 'here' | 'takeover' | 'unreadable' | 'off' | 'lapsed'
  readonly from?: string
  readonly to?: string
}

/** The event of a holder move: the session ids shaped as ids. */
export function holderMoved(move: HolderMove): DesignMetricEvent {
  return { k: 'design.holder-moved', body: { how: move.how, ...optionalId('from', move.from), ...optionalId('to', move.to) } }
}
