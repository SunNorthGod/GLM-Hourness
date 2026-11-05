/**
 * The metrics row's status entry (status hub design 0.3 §4.2, §12 metrics
 * row): the board's relayed `load` group — the three burden numbers the
 * charter has the main agent relay weekly (asks, words read per ask, the
 * wait), computed by `factsFor` — as the one `metrics/load` entry, its
 * recent-7-days column. The entry reads the very view object the row writes
 * to `view.json`, so the board and the entry show one computation. Every
 * other group is a ratio or a per-model comparison and stays on the board,
 * for the person only (§4.3, `d-metrics-ratios-person-only`). The weekly
 * report (M7) is the entry's reader; `/hourness` does not list it (§5).
 */
import type { MetricsBoardView } from '../shared/metrics-board.ts'
import type { StatusItem } from '../shared/status.ts'

/**
 * The one `metrics/load` entry of a board view: the first window's label,
 * then each burden row's label and recent value. No entry before the board's
 * first successful compute (`at` is null), or when the view holds no relayed
 * `load` group with rows. A view whose latest compute failed still carries
 * the last good groups, so the entry stays, dated by the view's `at`.
 */
export function metricsStatusItems(view: MetricsBoardView, source: string): StatusItem[] {
  if (view.at === null) return []
  const load = view.groups.find(group => group.id === 'load')
  if (load === undefined || !load.relayed || load.rows.length === 0) return []
  return [{
    id: 'metrics/load',
    owner: 'metrics',
    audience: 'agent',
    asOf: view.at,
    source,
    text: `${view.windows[0]}：${load.rows.map(row => `${row.label} ${row.values[0]}`).join('；')}`,
  }]
}
