/**
 * hourness data plane: the usage panel and the dispatch panel read the audit
 * journal — no separate bookkeeping. Pure functions over JSONL text; the
 * `/hourness` command renders them (src/report/index.ts) and the morning
 * report's usage section lists the same lines (src/workflow/morning-report.ts).
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
 *
 * Around the numbers the panel says what they cover: the peak line from the
 * service's `peak`, the number of records read and the earliest, the
 * deletions of records named in the gap file (docs/DESIGN.md §2.4), and the
 * quota section from the service's `quota` member. The words of the plan
 * come from the service; nothing here knows a plan's hours or coefficients.
 */
import type { DecisionRecord, UsageRecord } from '../memory/audit.ts'
import { PRICING_SERVICE, quotaOf, type UsagePricing } from '../shared/pricing.ts'
import { formatMoment, peakLine, quotaLines, type MomentZone, type QuotaView } from '../shared/quota.ts'

/** The native channel's provider id at the time of the usage-chunk defect (src/glm-llm/index.ts default). */
const NATIVE_PROVIDER = 'glm-zcode'

/** How long the panel waits for the quota reading it starts or joins. */
const QUOTA_WAIT_MS = 3000

/** The longest message of a failure that a line quotes, in characters. */
const FAILURE_WORDS_MAX = 80

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
  /** The records that could be read, including those left out of the numbers above (the pre-fix ones). */
  readonly records: number
  /** The time of the earliest readable record, epoch milliseconds; absent without one. */
  readonly earliest?: number
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
 * The usage panel of parsed journal lines. With `pricing`, calls are priced
 * through it; without, every model lists calls and tokens. `problem` hears
 * about a pricing service that throws. `unparsed` is the number of lines the
 * caller could not parse as JSON; they are counted as unreadable with the
 * values that are not usage records. The morning report and the `/hourness`
 * panel both come through here, so their numbers are the same.
 */
export function usagePanelOf(values: readonly unknown[], pricing?: UsagePricing, problem?: (message: string) => void, unparsed = 0): UsagePanelData {
  const models = new Map<string, { -readonly [K in keyof ModelUsage]: ModelUsage[K] }>()
  const unpriced = new Map<string, number>()
  let unpriceable = 0
  let preFix = 0
  let unreadable = unparsed
  let records = 0
  let earliest: number | undefined
  for (const value of values) {
    if (!readableUsage(value)) {
      unreadable += 1
      continue
    }
    const at = Date.parse(value.at)
    records += 1
    if (earliest === undefined || at < earliest) earliest = at
    if (preFixRecord(value)) {
      preFix += 1
      continue
    }
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
    records,
    ...(earliest === undefined ? {} : { earliest }),
  }
}

/**
 * The usage panel of a journal as text: each line is parsed, and a line that
 * is not JSON is counted and handed to `usagePanelOf` as unparsed.
 */
export function usagePanel(usageRaw: string, pricing?: UsagePricing, problem?: (message: string) => void): UsagePanelData {
  const values: unknown[] = []
  let unparsed = 0
  for (const line of usageRaw.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      values.push(JSON.parse(line))
    }
    catch {
      unparsed += 1
    }
  }
  return usagePanelOf(values, pricing, problem, unparsed)
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

export interface PanelLineOptions {
  /** Whether the pricing basis is the first line; default true. The note that there is no pricing service is always written. */
  readonly basis?: boolean
  /** Finished list lines between that first line and the totals: what the records cover and the gaps in them. */
  readonly scope?: readonly string[]
}

/**
 * The panel as Markdown list lines: the basis (or the note that there is no
 * pricing service), the scope lines, the totals and the models, then what
 * was left out. The `/hourness` 面板 section and the morning report's 用量
 * section are both this list; the report leaves the basis to the panel.
 */
export function usagePanelLines(panel: UsagePanelData, options: PanelLineOptions = {}): string[] {
  const sum = (key: keyof TokenCounts | 'calls' | 'credits' | 'peakCredits'): number => panel.models.reduce((total, model) => total + model[key], 0)
  const total = { inputTokens: sum('inputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'), outputTokens: sum('outputTokens'), credits: sum('credits'), peakCredits: sum('peakCredits') }
  const pricing = panel.pricing
  const first = pricing === undefined
    ? ['- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token']
    : options.basis === false ? [] : [`- ${pricing.basis}`]
  const body = pricing === undefined
    ? [
        `- 合计：${sum('calls')} 次 · ${tokenFacts(total)}`,
        ...panel.models.map(model => `- ${model.model}：${model.calls} 次 · ${tokenFacts(model)}`),
      ]
    : [
        `- 合计：${creditFacts(total)}`,
        ...panel.models.map(model => `- ${model.model}：${model.calls} 次 · ${creditFacts(model)}`),
        ...(panel.unpriced.length === 0 ? [] : [`- 不计积分（不在 ${pricing.plan}内）：${panel.unpriced.map(entry => `${entry.model} ${entry.calls} 次`).join('，')}`]),
      ]
  return [
    ...first,
    ...(options.scope ?? []),
    ...body,
    ...(panel.unpriceable === 0 ? [] : [`- 无法计价的记录 ${panel.unpriceable} 条（计价服务出错），未计入`]),
    ...(panel.preFix === 0 ? [] : [`- 修正前的原生通道记录 ${panel.preFix} 条：输入计为 0，未计入`]),
    ...(panel.unreadable === 0 ? [] : [`- 无法读取的记录 ${panel.unreadable} 条，未计入`]),
  ]
}

/** The scope line: how many records the panel read, from when, and what they leave out. */
export function rangeLine(panel: UsagePanelData, now: number, zone?: MomentZone): string {
  const earliest = panel.earliest === undefined ? '' : `，最早 ${formatMoment(panel.earliest, now, zone)}`
  return `- 范围：${panel.records} 条用量记录${earliest}；只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内`
}

/** One record of the gap file: usage records that were deleted, so no number of the panel covers them (docs/DESIGN.md §2.4). */
interface UsageGap {
  readonly at: number
  readonly removed: number
  readonly reason: string
  /** The time range the deleted records covered, when it is known. */
  readonly from?: number
  readonly to?: number
}

/** The gap file as read: the valid records, oldest first, and how many rows could not be read. */
interface UsageGaps {
  readonly gaps: readonly UsageGap[]
  readonly unreadable: number
}

const GAP_REMOVED_MAX = 10_000_000
const GAP_REASON_MAX = 300
const GAP_DETAIL_MAX = 300
const GAP_REF_MAX = 200

/** The time of an ISO 8601 string that parses, else undefined. */
function instantOf(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : undefined
}

/** An optional string of at most `max` characters: a string within the limit, or nothing at all. */
const optionalText = (value: unknown, max: number): boolean => value === undefined || (typeof value === 'string' && value.length <= max)

/**
 * A row of the gap file as a record, by the table of docs/DESIGN.md §2.4:
 * `at` and `removed` and `reason` are required, `detail`, `ref`, `from` and
 * `to` are checked when present, other keys are ignored. Undefined when any
 * check fails.
 */
function gapOf(value: unknown): UsageGap | undefined {
  if (!isRecord(value)) return undefined
  const { removed, reason, detail, ref } = value
  const at = instantOf(value.at)
  const from = instantOf(value.from)
  const to = instantOf(value.to)
  if (at === undefined || typeof removed !== 'number' || !Number.isInteger(removed) || removed < 1 || removed > GAP_REMOVED_MAX) return undefined
  if (typeof reason !== 'string' || reason.length < 1 || reason.length > GAP_REASON_MAX) return undefined
  if (!optionalText(detail, GAP_DETAIL_MAX) || !optionalText(ref, GAP_REF_MAX)) return undefined
  if ((value.from !== undefined && from === undefined) || (value.to !== undefined && to === undefined)) return undefined
  if (from !== undefined && to !== undefined && from > to) return undefined
  return { at, removed, reason, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) }
}

/** The gap file's text as records and a count of the rows that are not JSON or do not follow the table. */
export function parseGaps(raw: string): UsageGaps {
  const gaps: UsageGap[] = []
  let unreadable = 0
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    }
    catch {
      unreadable += 1
      continue
    }
    const gap = gapOf(value)
    if (gap === undefined) unreadable += 1
    else gaps.push(gap)
  }
  return { gaps: gaps.sort((a, b) => a.at - b.at), unreadable }
}

/**
 * Whether a report that starts at `periodStart` covers records the gap
 * deleted. A gap with a range is met when the range ends no earlier than the
 * period starts; one without is met when the period starts before the
 * deletion. No start means the whole record, which every gap is in. The
 * period has no end of its own: a report runs up to now.
 */
function gapInPeriod(gap: UsageGap, periodStart: number | undefined): boolean {
  if (periodStart === undefined) return true
  return gap.from !== undefined && gap.to !== undefined ? gap.to >= periodStart : periodStart < gap.at
}

/**
 * The gap lines for a report that starts at `periodStart` (the whole record
 * when undefined): one line for each gap the period meets, then one line for
 * the rows that could not be read, whatever the period, because a row that
 * cannot be read cannot be placed in one.
 */
export function gapLines(journal: UsageGaps, now: number, zone?: MomentZone, periodStart?: number): string[] {
  return [
    ...journal.gaps.filter(gap => gapInPeriod(gap, periodStart)).map(gap => `- 缺口：${formatMoment(gap.at, now, zone)} 删去 ${gap.removed} 条（${gap.reason.replace(/\s+/g, ' ')}）；这些调用不在本节的数字里`),
    ...(journal.unreadable === 0 ? [] : [`- 无法读取的缺口记录 ${journal.unreadable} 条，未列出`]),
  ]
}

/** A failure's message on one line, cut to the length a line quotes. */
const failureWords = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim().slice(0, FAILURE_WORDS_MAX)

/**
 * The panel's first line: whether it is peak hours now and until when, from
 * the service's `peak` and plan name (`peakLine`, the one that the GLM
 * package's status command prints too). Undefined, reported to `problem`,
 * when `peak` throws or does not answer with a boolean: the panel then has no
 * such line.
 */
export function peakLineOf(pricing: UsagePricing, now: number, zone?: MomentZone, problem?: (message: string) => void): string | undefined {
  try {
    const peak = (atMs: number): boolean => pricing.peak(atMs)
    if (typeof peak(now) !== 'boolean') throw new Error('peak did not answer with a boolean')
    return `- ${peakLine(pricing.plan, peak, now, zone)}`
  }
  catch (error) {
    problem?.(`${PRICING_SERVICE} peak is unreadable (${failureWords(error)}); the panel has no peak line`)
    return undefined
  }
}

/**
 * The lines of the quota section: the view the service's `quota` member
 * returns, worded by `quotaLines` as the GLM status command words it,
 * asked for with a wait of three seconds at most; when the service has no
 * such member, one line says so. A member that throws, rejects or answers
 * with something the lines cannot be made from becomes one line with the
 * reason, reported to `problem`.
 */
export async function quotaSection(pricing: UsagePricing, now: number, zone?: MomentZone, problem?: (message: string) => void): Promise<string[]> {
  const read = quotaOf(pricing, problem)
  if (read === undefined) return ['额度：GLM 通道包没有提供额度数据']
  try {
    const view: unknown = await read({ waitMs: QUOTA_WAIT_MS })
    if (typeof view !== 'object' || view === null) throw new Error('返回的不是对象')
    return quotaLines(view as QuotaView, now, zone)
  }
  catch (error) {
    problem?.(`${PRICING_SERVICE} quota failed (${failureWords(error)}); the quota section shows the failure only`)
    return [`额度：读取出错（${failureWords(error)}）`]
  }
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
