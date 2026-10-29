/**
 * hourness data plane: the usage panel and the dispatch panel read the audit
 * journal — no separate bookkeeping. Pure functions over JSONL text; the
 * `/hourness` command renders them (src/report/index.ts).
 *
 * The usage panel prices calls through the pricing service
 * (src/shared/pricing.ts, docs/ORCHESTRATION.md §11.3), which the GLM
 * channel package provides with its credit plan: credits per model, cache
 * hit rate, and the peak share weighted by the credits charged. Models
 * outside the plan are counted, not priced; a call the service fails to
 * price is counted as such. Without the service the panel lists calls and
 * token counts per model. Native-channel records written before the
 * usage-chunk fix (docs/DESIGN.md §4.6a) counted every input as 0; that
 * decoder emitted no `totalTokens`, which identifies them, and they enter
 * no number but their own count.
 */
import type { DecisionRecord, UsageRecord } from '../memory/audit.ts'
import { PRICING_SERVICE, type UsagePricing } from '../shared/pricing.ts'

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
  /** The pricing the credits follow; absent when the panel lists calls and tokens only. */
  readonly pricing?: Pick<UsagePricing, 'basis' | 'plan'>
  /** With pricing, the models of the plan, most credits first; without, every model (credits 0), most calls first. */
  readonly models: readonly ModelUsage[]
  /** Models outside the plan, most calls first: counted, not priced. Empty without pricing. */
  readonly unpriced: ReadonlyArray<{ readonly model: string, readonly calls: number }>
  /** Calls the pricing service failed to price (it threw), left out of every number. */
  readonly unpriceable: number
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

/** What one call is charged under `pricing`: credits and whether in peak hours, `outside` the plan, or `failed` (the service threw). */
function priceOf(pricing: UsagePricing, record: UsageRecord, at: number, problem: ((message: string) => void) | undefined): { readonly credits: number, readonly peak: boolean } | 'outside' | 'failed' {
  try {
    const credits = pricing.charged(record.model, record.usage, at)
    return credits === undefined ? 'outside' : { credits, peak: pricing.peak(at) }
  }
  catch (error) {
    problem?.(`${PRICING_SERVICE} threw while pricing a call (${error instanceof Error ? error.message : String(error)}); the call is counted as not priceable`)
    return 'failed'
  }
}

/**
 * The usage panel of a journal. With `pricing`, calls are priced through it;
 * without, every model lists calls and tokens. `problem` hears about a
 * pricing service that throws.
 */
export function usagePanel(usageRaw: string, pricing?: UsagePricing, problem?: (message: string) => void): UsagePanelData {
  const models = new Map<string, { -readonly [K in keyof ModelUsage]: ModelUsage[K] }>()
  const unpriced = new Map<string, number>()
  let unpriceable = 0
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
    const at = Date.parse(value.at)
    const price = pricing === undefined ? { credits: 0, peak: false } : priceOf(pricing, value, at, problem)
    if (price === 'failed') {
      unpriceable += 1
      continue
    }
    if (price === 'outside') {
      unpriced.set(value.model, (unpriced.get(value.model) ?? 0) + 1)
      continue
    }
    const model = value.model.toLowerCase()
    const entry = models.get(model) ?? { model, calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, credits: 0, peakCredits: 0 }
    entry.calls += 1
    entry.inputTokens += value.usage.inputTokens
    entry.cacheReadTokens += value.usage.cacheReadTokens ?? 0
    entry.cacheWriteTokens += value.usage.cacheWriteTokens ?? 0
    entry.outputTokens += value.usage.outputTokens
    entry.credits += price.credits
    if (price.peak) entry.peakCredits += price.credits
    models.set(model, entry)
  }
  return {
    ...(pricing === undefined ? {} : { pricing: { basis: pricing.basis, plan: pricing.plan } }),
    models: [...models.values()].sort(pricing === undefined ? (a, b) => b.calls - a.calls : (a, b) => b.credits - a.credits),
    unpriced: [...unpriced].map(([model, calls]) => ({ model, calls })).sort((a, b) => b.calls - a.calls),
    unpriceable,
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

/** Token counts and cache hit rate of one line, for the panel without pricing. */
function tokenFacts(usage: TokenCounts): string {
  const hit = cacheHitRate(usage)
  return [
    `未命中输入 ${usage.inputTokens}`,
    `缓存读 ${usage.cacheReadTokens}`,
    `缓存写 ${usage.cacheWriteTokens}`,
    `输出 ${usage.outputTokens}`,
    ...(hit === undefined ? [] : [`缓存命中 ${percent(hit)}`]),
  ].join(' · ')
}

/** The panel as Markdown list lines (the `/hourness` 面板 section). */
export function usagePanelLines(panel: UsagePanelData): string[] {
  const sum = (key: keyof TokenCounts | 'calls' | 'credits' | 'peakCredits'): number => panel.models.reduce((total, model) => total + model[key], 0)
  const total = { inputTokens: sum('inputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'), outputTokens: sum('outputTokens'), credits: sum('credits'), peakCredits: sum('peakCredits') }
  const pricing = panel.pricing
  const head = pricing === undefined
    ? [
        '- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token',
        `- 合计：${sum('calls')} 次 · ${tokenFacts(total)}`,
        ...panel.models.map(model => `- ${model.model}：${model.calls} 次 · ${tokenFacts(model)}`),
      ]
    : [
        `- ${pricing.basis}`,
        `- 合计：${creditFacts(total)}`,
        ...panel.models.map(model => `- ${model.model}：${model.calls} 次 · ${creditFacts(model)}`),
        ...(panel.unpriced.length === 0 ? [] : [`- 不计积分（不在 ${pricing.plan}内）：${panel.unpriced.map(entry => `${entry.model} ${entry.calls} 次`).join('，')}`]),
      ]
  return [
    ...head,
    ...(panel.unpriceable === 0 ? [] : [`- 无法计价的记录 ${panel.unpriceable} 条（计价服务出错），未计入`]),
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
