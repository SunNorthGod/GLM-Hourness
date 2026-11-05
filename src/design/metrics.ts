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
 */
import type { ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { emitMetric, METRICS_ID_PATTERN, type DesignBodies, type MetricsWhere } from '../shared/metrics.ts'

/** One of the design row's ten kinds, before the sink adds the submitter. */
export type DesignMetricEvent = { [K in keyof DesignBodies]: { readonly k: K, readonly body: DesignBodies[K] } }[keyof DesignBodies]

/** Where the design row and its rules hand their events. Never throws. */
export type DesignMetricSink = (event: DesignMetricEvent, where: MetricsWhere) => void

/** The sink over the metrics service as cordis finds it at each event (`emitMetric` reads the service lazily and swallows its failures). */
export function designMetricSink(ctx: ServiceLookup): DesignMetricSink {
  return (event, where) => { emitMetric(ctx, { ...event, by: 'design' }, where) }
}

/** Where an event of a session belongs: the session and its working directory, each only when it is there. */
export function whereOf(session: Pick<SessionLike, 'id' | 'header'> | undefined): MetricsWhere {
  const cwd = session?.header.cwd
  return {
    ...(session === undefined || session.id === '' ? {} : { sessionId: session.id }),
    ...(typeof cwd === 'string' && cwd !== '' ? { dir: cwd } : {}),
  }
}

/** A value for an id field: itself when it has the shape of an id (§4.4), else `other`, so that the event is not refused whole for it; `none` when there is none and the field is required. */
export function metricId(value: string | undefined): string {
  if (value === undefined || value === '') return 'none'
  return METRICS_ID_PATTERN.test(value) ? value : 'other'
}

/** An optional id field: left out when there is none, else shaped by `metricId`. */
export function optionalId<K extends string>(key: K, value: string | undefined): { readonly [P in K]?: string } {
  return (value === undefined || value === '' ? {} : { [key]: metricId(value) }) as { readonly [P in K]?: string }
}

/** How the holder record of a project changed (`design.holder-moved`): written by /wish, moved here, taken over, written over an unreadable one, deleted by /wish off, or deleted because the /wish that wrote it did not take effect. */
export interface HolderMove {
  readonly how: 'wish' | 'here' | 'takeover' | 'unreadable' | 'off' | 'lapsed'
  readonly from?: string
  readonly to?: string
}

/** The body of `design.holder-moved`: the session ids shaped as ids. */
export function holderMovedBody(move: HolderMove): DesignBodies['design.holder-moved'] {
  return {
    how: move.how,
    ...(move.from === undefined ? {} : { from: metricId(move.from) }),
    ...(move.to === undefined ? {} : { to: metricId(move.to) }),
  }
}
