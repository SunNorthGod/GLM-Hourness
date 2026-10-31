/**
 * The GLM credit plan of the user's coding plan (docs/FACTS.md §2.4), used
 * by the peak-hour reminder (src/glm-prompt/peak-reminder.ts), the
 * calibration runner and the probe, and served to the orchestration
 * package's usage panel as the pricing service (src/shared/pricing.ts) by
 * the glm-login row.
 *
 * credits = (input × Input + cache reads × Cached + output × Output) / 10000,
 * charged at the full rate in peak hours (Monday to Friday 14:00-18:00,
 * UTC+8) and at 50 percent at every other time, weekends included. The
 * formula has no cache-write coefficient; cache writes are priced as input.
 * MCP tool calls (1.2 credits per call) do not reach the usage journal and
 * are not priced here.
 */
import type { TokenUsage } from '../shared/lm-min.ts'
import type { PeakHoursText, UsagePricing } from '../shared/pricing.ts'

/** Coefficients per 10,000 tokens. */
interface CreditRate {
  readonly input: number
  readonly cached: number
  readonly output: number
}

/** Coefficients by model id (FACTS.md §2.4; the Flash rate includes its vision MCP). */
export const CREDIT_RATES: ReadonlyMap<string, CreditRate> = new Map([
  ['glm-5.3', { input: 6.9, cached: 1.7, output: 24 }],
  ['glm-5.3-flash', { input: 2.3, cached: 0.56, output: 8 }],
])

/** Share of the full rate charged outside peak hours. */
const OFF_PEAK_RATE = 0.5

/** Peak hours are stated in UTC+8. */
const PLAN_OFFSET_MS = 8 * 3_600_000
const PEAK_START_HOUR = 14
const PEAK_END_HOUR = 18

/**
 * The peak hours as text for models (`en`) and people (`zh`), and the end of
 * a peak as the models read it. The text and the hours (PEAK_START_HOUR,
 * PEAK_END_HOUR) are in this one file, so a change of the hours is a change
 * here only.
 */
export const PEAK_HOURS: PeakHoursText = Object.freeze({ en: 'weekdays 14:00-18:00 UTC+8', zh: '工作日 14:00–18:00（UTC+8）' })
export const PEAK_END_LABEL = '18:00'

/**
 * The peak window an instant (epoch milliseconds) falls in, named by its
 * UTC+8 date (`YYYY-MM-DD`); undefined outside peak hours. 14:00 is the
 * first peak minute, 18:00 the first off-peak one.
 */
export function peakWindowAt(ms: number): string | undefined {
  if (!Number.isFinite(ms)) return undefined
  const plan = new Date(ms + PLAN_OFFSET_MS)
  const day = plan.getUTCDay()
  const hour = plan.getUTCHours()
  if (day === 0 || day === 6 || hour < PEAK_START_HOUR || hour >= PEAK_END_HOUR) return undefined
  return plan.toISOString().slice(0, 10)
}

/** The rate of one model id (case-insensitive); undefined for models outside the credit plan. */
export function creditRate(model: string): CreditRate | undefined {
  return CREDIT_RATES.get(model.toLowerCase())
}

/** Full-rate credits of one call. */
export function fullCredits(rate: CreditRate, usage: TokenUsage): number {
  return ((usage.inputTokens + (usage.cacheWriteTokens ?? 0)) * rate.input + (usage.cacheReadTokens ?? 0) * rate.cached + usage.outputTokens * rate.output) / 10_000
}

/** Credits charged for one call made at `ms`: the full rate in peak hours, `OFF_PEAK_RATE` of it otherwise. */
export function chargedCredits(rate: CreditRate, usage: TokenUsage, ms: number): number {
  const full = fullCredits(rate, usage)
  return peakWindowAt(ms) === undefined ? full * OFF_PEAK_RATE : full
}

/** The pricing service value of the credit plan (src/shared/pricing.ts). */
export const creditPricing: UsagePricing = Object.freeze({
  basis: `全部用量记录；高峰为${PEAK_HOURS.zh}，其余时段按 50% 计积分；高峰占比按积分计`,
  plan: 'GLM 积分套餐',
  peakHours: PEAK_HOURS,
  charged: (model: string, usage: TokenUsage, atMs: number): number | undefined => {
    const rate = creditRate(model)
    return rate === undefined ? undefined : chargedCredits(rate, usage, atMs)
  },
  peak: (atMs: number): boolean => peakWindowAt(atMs) !== undefined,
})
