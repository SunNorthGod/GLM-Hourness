/**
 * The env row's status entries (status hub design 0.3 §3.1, §4.2, §12 M4
 * row): the daily suppression-comment count of the project's
 * suppressions.jsonl as the one `env/suppressions` entry. The words of the
 * count line live here — the morning report's movement line
 * (suppressionLineOf, moved from the report so the entry and the report read
 * one computation) and the entry's plain total share it. The entry states
 * the latest count with its reading moment; the per-period rise and fall
 * stays the report's movement line, which slices a period, until the
 * report's hub adoption.
 */
import type { SuppressionRecord } from './suppressions.ts'
import type { StatusItem } from '../shared/status.ts'

/** The count line without a movement: what the entry states and the report's no-churn line reads. */
export function suppressionTotalLine(total: number): string {
  return `压制注释 ${total} 处`
}

/**
 * The suppression-comment line over one period's counts, oldest first (M4
 * design §6.7, m4-suppressions): the latest total, and the rise and fall of
 * the period counted apart, so a net-zero period with churn still shows.
 * Undefined when the period holds no count.
 */
export function suppressionLineOf(records: readonly SuppressionRecord[]): string | undefined {
  if (records.length === 0) return undefined
  const total = records[records.length - 1].total
  let up = 0
  let down = 0
  for (let index = 1; index < records.length; index++) {
    const delta = records[index].total - records[index - 1].total
    if (delta > 0) up += delta
    else down -= delta
  }
  return up === 0 && down === 0 ? suppressionTotalLine(total) : `${suppressionTotalLine(total)}（本期 +${up} / −${down}）`
}

/**
 * The count is taken once a repository and day; a reading older than two
 * days means the row has not run its count for at least one day, so the hub
 * marks the entry stale from there.
 */
const SUPPRESSION_STALE_MS = 48 * 60 * 60 * 1000

/**
 * The one `env/suppressions` entry (status hub design 0.3 §3.1): the latest
 * count is the text, the total is the field, `asOf` the count's moment — the
 * whole journal's account, the way the usage entry is the usage journal's.
 * No entry when the journal holds no count yet.
 */
export function envStatusItems(records: readonly SuppressionRecord[], source: string): StatusItem[] {
  const last = records.at(-1)
  if (last === undefined) return []
  return [{
    id: 'env/suppressions',
    owner: 'env',
    audience: 'agent',
    asOf: last.at,
    source,
    text: suppressionTotalLine(last.total),
    fields: { total: last.total },
    staleAfterMs: SUPPRESSION_STALE_MS,
  }]
}
