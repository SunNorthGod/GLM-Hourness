/**
 * The status hub's report-side collector (status hub design 0.3 §3.3, §7,
 * §8): one read over every known row's status view, filtered to an audience,
 * each entry validated, stale entries marked, sorted by owner and id — the
 * one door the report faces (the /hourness command, the morning and weekly
 * reports, the main agent's `hourness_report`) go through, so an entry meant
 * only for a face cannot reach the model. The panel face does not come
 * through here: it reads the boards' own snapshots (the design's §3.4).
 *
 * The known rows are STATUS_ROWS, written like HEALTH_ROWS of
 * src/shared/health.ts and a superset of it — today the two are equal, and
 * rows of future owners join as their packages merge. A row whose view is
 * absent is not enabled and is skipped, not an error; a view whose items
 * throw takes one visible placeholder and one warning while the other rows
 * go on (§7). The collector is a pure function over the service lookups, so
 * L2 runs it without a host.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { HealthRow } from '../shared/health.ts'
import { HEALTH_ROWS } from '../shared/health.ts'
import { formatMoment } from '../shared/quota.ts'
import { statusServiceName, type RowStatusView } from '../shared/status-host.ts'
import { isStale, validateStatusItem, type StatusAudience, type StatusItem } from '../shared/status.ts'

/**
 * Every row whose status view the collector reads, in patch order. A
 * superset of HEALTH_ROWS: the rows of future owners (metrics, execute,
 * loops) join here as their packages merge, and a row not enabled is
 * collected as absent and skipped.
 */
export const STATUS_ROWS: readonly HealthRow[] = HEALTH_ROWS

/** How one row's read went, for the placeholders and the warnings of §7 and the one-source cross-check. */
export interface StatusRowOutcome {
  readonly row: HealthRow
  readonly outcome: 'ok' | 'absent' | 'error'
  /** Why the read failed, cut to 80 characters; present when the outcome is `error`. */
  readonly reason?: string
}

export interface CollectedStatus {
  /** The entries past the audience filter and the validation of §8, a stale one's text marked with its time, sorted by owner and id. */
  readonly items: readonly StatusItem[]
  /** Per known row: read, or absent (not enabled), or failed with the reason. */
  readonly rows: readonly StatusRowOutcome[]
}

function asView(value: unknown): RowStatusView | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return typeof (value as Partial<RowStatusView>).items === 'function' ? value as RowStatusView : undefined
}

/** A failure's message on one line, cut to the length a reason quotes. */
const failureWords = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim().slice(0, 80)

/** A stale entry keeps its place with the time it is from added to its text (§5, §7); the hub owns this wording. */
function markedText(item: StatusItem, nowMs: number): string {
  return isStale(item, nowMs) ? `${item.text}（截至 ${formatMoment(Date.parse(item.asOf), nowMs)}）` : item.text
}

/**
 * Every row's items for one session and audience. `agent` keeps only
 * `audience === 'agent'` (the door to anything that enters the model
 * context); `all` keeps both, for a report face that lists person entries —
 * today none exists. A malformed entry drops with one warning per row and
 * reason; a cleaned one (a field key dropped, a detail line cut) warns once
 * too. A row whose items throw yields no entries and an `error` outcome.
 */
export function collectStatus(ctx: ServiceLookup, sessionId: string | undefined, audience: StatusAudience | 'all', nowMs: number): CollectedStatus {
  const rows: StatusRowOutcome[] = []
  const items: StatusItem[] = []
  for (const row of STATUS_ROWS) {
    const view = asView(typeof ctx.get === 'function' ? ctx.get(statusServiceName(row)) : undefined)
    if (view === undefined) {
      rows.push({ row, outcome: 'absent' })
      continue
    }
    const warned = new Set<string>()
    const warnOnce = (message: string): void => {
      if (warned.has(message)) return
      warned.add(message)
      console.warn(`dsh-glm-hourness/${row}: ${message}`)
    }
    try {
      const kept: StatusItem[] = []
      for (const candidate of view.items(sessionId)) {
        const checked = validateStatusItem(candidate)
        if (!checked.ok) {
          warnOnce(`状态条目被丢弃（${checked.reason}）`)
          continue
        }
        for (const warning of checked.warnings) warnOnce(warning)
        if (audience === 'all' || checked.item.audience === 'agent') {
          const text = markedText(checked.item, nowMs)
          kept.push(text === checked.item.text ? checked.item : { ...checked.item, text })
        }
      }
      rows.push({ row, outcome: 'ok' })
      items.push(...kept)
    }
    catch (error) {
      const reason = failureWords(error)
      warnOnce(`状态读取失败：${reason}`)
      rows.push({ row, outcome: 'error', reason })
    }
  }
  items.sort((a, b) => a.owner === b.owner ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.owner < b.owner ? -1 : 1)
  return { items, rows }
}

/**
 * One line per row whose status could not be read (§7): the placeholder a
 * face shows where that row's entries would have been. Absent rows show
 * nothing — not being enabled is not an error.
 */
export function statusPlaceholders(rows: readonly StatusRowOutcome[]): string[] {
  return rows.filter(row => row.outcome === 'error').map(row => `${row.row} 行的状态暂时读不到：${row.reason ?? ''}`)
}
