/**
 * hourness-ui data plane: the usage panel and dispatch panel read the audit
 * journal — no separate bookkeeping. Pure functions over JSONL text; the UI
 * row (DSH client plugin) renders these, the off-peak badge uses the
 * configured window (ZCode off-peak plan windows are server-delivered; the
 * default here is the documented coding-plan window and stays configurable).
 */
import type { UsageRecord } from '../memory/audit.ts'
import type { DecisionRecord } from '../memory/audit.ts'
import { usageByModel } from '../workflow/morning-report.ts'

export interface OffPeakWindow {
  readonly startHour: number
  readonly endHour: number
}

export const DEFAULT_OFF_PEAK: OffPeakWindow = { startHour: 0, endHour: 8 }

/** Parse one JSONL file into typed lines; blank lines and parse failures are skipped. */
export function parseJsonl<T>(raw: string): T[] {
  return raw.split('\n').filter(line => line.trim().length > 0).flatMap(line => {
    try {
      return [JSON.parse(line) as T]
    }
    catch {
      return []
    }
  })
}

export interface UsagePanelData {
  readonly totals: { calls: number, inputTokens: number, outputTokens: number, totalTokens: number }
  readonly byModel: ReturnType<typeof usageByModel>
  /** Hour-of-day call counts (local time) for the load curve. */
  readonly hourly: number[]
  /** Share of calls inside the off-peak window, 0..1. */
  readonly offPeakShare: number
}

export function usagePanel(usageRaw: string, window: OffPeakWindow = DEFAULT_OFF_PEAK): UsagePanelData {
  const records = parseJsonl<UsageRecord>(usageRaw)
  const byModel = usageByModel(records)
  const hourly = new Array<number>(24).fill(0)
  let offPeak = 0
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  for (const record of records) {
    const hour = new Date(record.at).getHours()
    hourly[hour] = (hourly[hour] ?? 0) + 1
    if (inWindow(hour, window)) offPeak += 1
    inputTokens += record.usage.inputTokens
    outputTokens += record.usage.outputTokens
    totalTokens += record.usage.totalTokens ?? (record.usage.inputTokens + record.usage.outputTokens)
  }
  return {
    totals: { calls: records.length, inputTokens, outputTokens, totalTokens },
    byModel,
    hourly,
    offPeakShare: records.length === 0 ? 0 : offPeak / records.length,
  }
}

function inWindow(hour: number, window: OffPeakWindow): boolean {
  return window.startHour <= window.endHour
    ? hour >= window.startHour && hour < window.endHour
    : hour >= window.startHour || hour < window.endHour
}

/** Off-peak badge text: 峰谷 share in the panel vocabulary. */
export function offPeakBadge(share: number): string {
  const percent = Math.round(share * 100)
  return `谷 ${percent}%`
}

export interface DispatchPanelRow {
  readonly at: string
  readonly level: string
  readonly kind: string
  readonly subject: string
}

export function dispatchPanel(decisionsRaw: string, limit = 20): DispatchPanelRow[] {
  return parseJsonl<DecisionRecord>(decisionsRaw)
    .slice(-limit)
    .reverse()
    .map(record => ({ at: record.at, level: record.level, kind: record.kind, subject: record.subject }))
}
