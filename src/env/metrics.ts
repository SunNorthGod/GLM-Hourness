/**
 * The env row's one metric event (m4 design §3.11; metrics design §6.2): the
 * daily suppression count hands a `count` event to the metrics journal at the
 * same write that appends its line to the repository's audit journal. Only
 * counts travel — the marker names and their numbers, never a file or its
 * text. The event rides the write: a metrics row that is absent or throwing
 * changes nothing, the audit journal is the fact.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { emitMetric } from '../shared/metrics.ts'
import type { SuppressionRecord } from './suppressions.ts'

/** The `what` label of the count event, so the readers group it. */
const SUPPRESSION_COUNT = 'suppression-comments'

/** Hand the daily count of one repository to the metrics row's service. Never throws. */
export function emitSuppressionCount(ctx: ServiceLookup, record: SuppressionRecord): void {
  emitMetric(ctx, {
    k: 'count',
    by: 'env',
    body: {
      what: SUPPRESSION_COUNT,
      value: record.total,
      ...(Object.keys(record.byMarker).length === 0 ? {} : { byKey: record.byMarker }),
    },
  }, { dir: record.repo })
}
