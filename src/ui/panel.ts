/**
 * hourness data plane: the usage panel and the dispatch panel read the audit
 * journal — no separate bookkeeping. Pure functions over JSONL text; the
 * `/hourness` command renders them (src/ui/index.ts).
 *
 * The usage panel is on the credit basis (src/shared/credits.ts,
 * docs/FACTS.md §2.4, docs/ORCHESTRATION.md §11.3): credits per model with
 * the off-peak discount, cache hit rate, and the peak share weighted by the
 * credits charged. Models outside the credit plan are counted, not priced.
 * Native-channel records written before the usage-chunk fix
 * (docs/DESIGN.md §4.6a) counted every input as 0; that decoder emitted no
 * `totalTokens`, which identifies them, and they enter no number but their
 * own count.
 */
import { chargedCredits, creditRate, peakWindowAt } from '../shared/credits.ts'
import type { DecisionRecord, UsageRecord } from '../memory/audit.ts'

/** The native channel's provider id at the time of the usage-chunk defect (src/glm-llm/index.ts default). */
const NATIVE_PROVIDER = 'glm-zcode'

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

/** Token counts of a set of calls (DSH counts are disjoint: input excludes cache reads and writes). */
interface TokenCounts {
  readonly inputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly outputTokens: number
}

/** One priced model of the usage panel. */
interface ModelUsage extends TokenCounts {
  readonly model: string
  readonly calls: number
  /** Credits charged: the full rate in peak hours, half of it otherwise. */
  readonly credits: number
  /** The part of `credits` charged in peak hours. */
  readonly peakCredits: number
}

export interface UsagePanelData {
  /** Models of the credit plan, most credits first. */
  readonly models: readonly ModelUsage[]
  /** Models outside the credit plan, most calls first: counted, not priced. */
  readonly unpriced: ReadonlyArray<{ readonly model: string, readonly calls: number }>
  /** Native-channel records from before the usage-chunk fix, left out of every number. */
  readonly preFix: number
  /** Lines without a parseable record, time or token counts, left out of every number. */
  readonly unreadable: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A journal line with what the panel needs: a valid time, a model and the two required token counts. */
function readableUsage(value: unknown): value is UsageRecord {
  if (!isRecord(value) || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) || typeof value.model !== 'string') return false
  const usage = value.usage
  return isRecord(usage) && typeof usage.inputTokens === 'number' && typeof usage.outputTokens === 'number'
}

/** A native-channel record the pre-fix decoder wrote: input 0 and no total. */
function preFixRecord(record: UsageRecord): boolean {
  return record.provider === NATIVE_PROVIDER && record.usage.inputTokens === 0 && record.usage.totalTokens === undefined
}

export function usagePanel(usageRaw: string): UsagePanelData {
  const priced = new Map<string, { -readonly [K in keyof ModelUsage]: ModelUsage[K] }>()
  const unpriced = new Map<string, number>()
  let preFix = 0
  let unreadable = 0
  for (const line of usageRaw.split('\n')) {
    if (line.trim().length === 0) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    }
    catch {
      unreadable += 1
      continue
    }
    if (!readableUsage(value)) {
      unreadable += 1
      continue
    }
    if (preFixRecord(value)) {
      preFix += 1
      continue
    }
    const rate = creditRate(value.model)
    if (rate === undefined) {
      unpriced.set(value.model, (unpriced.get(value.model) ?? 0) + 1)
      continue
    }
    const model = value.model.toLowerCase()
    const entry = priced.get(model) ?? { model, calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, credits: 0, peakCredits: 0 }
    const at = Date.parse(value.at)
    const credits = chargedCredits(rate, value.usage, at)
    entry.calls += 1
    entry.inputTokens += value.usage.inputTokens
    entry.cacheReadTokens += value.usage.cacheReadTokens ?? 0
    entry.cacheWriteTokens += value.usage.cacheWriteTokens ?? 0
    entry.outputTokens += value.usage.outputTokens
    entry.credits += credits
    if (peakWindowAt(at) !== undefined) entry.peakCredits += credits
    priced.set(model, entry)
  }
  return {
    models: [...priced.values()].sort((a, b) => b.credits - a.credits),
    unpriced: [...unpriced].map(([model, calls]) => ({ model, calls })).sort((a, b) => b.calls - a.calls),
    preFix,
    unreadable,
  }
}

/** Cache reads over all input (uncached, cache reads, cache writes), 0..1; undefined without input. */
export function cacheHitRate(counts: TokenCounts): number | undefined {
  const input = counts.inputTokens + counts.cacheReadTokens + counts.cacheWriteTokens
  return input === 0 ? undefined : counts.cacheReadTokens / input
}

const percent = (share: number): string => `${Math.round(share * 100)}%`

/** Credits, peak share and cache hit rate of one line. */
function creditFacts(usage: TokenCounts & Pick<ModelUsage, 'credits' | 'peakCredits'>): string {
  const hit = cacheHitRate(usage)
  return [
    `积分 ${usage.credits.toFixed(2)}`,
    ...(usage.credits > 0 ? [`高峰 ${percent(usage.peakCredits / usage.credits)}`] : []),
    ...(hit === undefined ? [] : [`缓存命中 ${percent(hit)}`]),
  ].join(' · ')
}

/** The panel as Markdown list lines (the `/hourness` 面板 section). */
export function usagePanelLines(panel: UsagePanelData): string[] {
  const sum = (key: keyof TokenCounts | 'credits' | 'peakCredits'): number => panel.models.reduce((total, model) => total + model[key], 0)
  const total = { inputTokens: sum('inputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'), outputTokens: sum('outputTokens'), credits: sum('credits'), peakCredits: sum('peakCredits') }
  return [
    '- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8），其余时段按 50% 计积分；高峰占比按积分计',
    `- 合计：${creditFacts(total)}`,
    ...panel.models.map(model => `- ${model.model}：${model.calls} 次 · ${creditFacts(model)}`),
    ...(panel.unpriced.length === 0 ? [] : [`- 不计积分（不在 GLM 积分套餐内）：${panel.unpriced.map(entry => `${entry.model} ${entry.calls} 次`).join('，')}`]),
    ...(panel.preFix === 0 ? [] : [`- 修正前的原生通道记录 ${panel.preFix} 条：输入计为 0，未计入`]),
    ...(panel.unreadable === 0 ? [] : [`- 无法读取的记录 ${panel.unreadable} 条，未计入`]),
  ]
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
