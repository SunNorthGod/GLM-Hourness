/**
 * The env row's one metric event (m4 design §3.11; metrics design §6.2): the
 * daily suppression count hands a `count` event to the metrics journal —
 * since metrics step 10 the event is the count's only record (the
 * suppressions.jsonl ledger of the M4 design is retired). Only counts
 * travel — the marker names as id-shaped keys and their numbers, never a
 * file or its text. A metrics row that is absent or throwing changes
 * nothing: the count is the env row's best effort, the journal's own
 * chain check is what stands guard over what landed.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { emitMetric, METRICS_ID_PATTERN, type MetricsMap } from '../shared/metrics.ts'
import type { SuppressionTally } from './suppressions.ts'

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
export function emitSuppressionCount(ctx: ServiceLookup, repo: string, tally: SuppressionTally): void {
  const byKey: MetricsMap = Object.fromEntries(Object.entries(tally.byMarker).map(([marker, count]) => [markerKey(marker), count]))
  emitMetric(ctx, {
    k: 'count',
    by: 'env',
    body: {
      what: SUPPRESSION_COUNT,
      value: tally.total,
      ...(Object.keys(byKey).length === 0 ? {} : { byKey }),
    },
  }, { dir: repo })
}
