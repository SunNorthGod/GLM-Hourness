/**
 * The env row's one metric event (m4 design §3.11; metrics design §6.2): the
 * daily suppression count hands a `count` event to the metrics journal at the
 * same write that appends its line to the repository's audit journal. Only
 * counts travel — the marker names as id-shaped keys and their numbers,
 * never a file or its text; the readable names stay in the audit journal,
 * which is what the status entry and the morning report read. The event
 * rides the write: a metrics row that is absent or throwing changes nothing,
 * the audit journal is the fact.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { emitMetric, METRICS_ID_PATTERN, type MetricsMap } from '../shared/metrics.ts'
import type { SuppressionRecord } from './suppressions.ts'

/** The `what` label of the count event, so the readers group it. */
const SUPPRESSION_COUNT = 'suppression-comments'

/**
 * A marker as a `byKey` key (metrics design §4.2: map keys are ids; §4.4
 * hands the shaping to the sender): every character outside the id shape
 * becomes `_`, one for one, so `# noqa` travels as `__noqa` and the mapping
 * stays deterministic across days and repositories.
 */
export function markerKey(marker: string): string {
  return [...marker].map(ch => (METRICS_ID_PATTERN.test(ch) ? ch : '_')).join('')
}

/** Hand the daily count of one repository to the metrics row's service. Never throws. */
export function emitSuppressionCount(ctx: ServiceLookup, record: SuppressionRecord): void {
  const byKey: MetricsMap = Object.fromEntries(Object.entries(record.byMarker).map(([marker, count]) => [markerKey(marker), count]))
  emitMetric(ctx, {
    k: 'count',
    by: 'env',
    body: {
      what: SUPPRESSION_COUNT,
      value: record.total,
      ...(Object.keys(byKey).length === 0 ? {} : { byKey }),
    },
  }, { dir: record.repo })
}
