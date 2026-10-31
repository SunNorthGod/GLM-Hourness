/**
 * The pricing contract (docs/ORCHESTRATION.md §11.2, §11.3): how the usage
 * panel of the orchestration package prices a call without carrying any
 * plan's coefficients.
 *
 * The glm-login row of the GLM channel package provides the service with
 * the GLM credit plan (src/glm-llm/credits.ts); the hourness row reads it per
 * invocation and lists calls and tokens only while it is absent. A
 * malformed value counts as absent and is reported to the reader's
 * `problem` callback; only the four members the panel uses are checked, so
 * a wider value from a newer channel package still reads. The members M6
 * adds (`peakHours`, `quota`, `loopDefaults`) are optional and each has its
 * own reader here or in channel-loop.ts: an absent one reads as none
 * without a report, one of the wrong type reads as none with one, and
 * neither touches the other members.
 */
import type { ChannelLoopDefault } from './channel-loop.ts'
import type { ServiceLookup } from './dsh-min.ts'
import type { TokenUsage } from './lm-min.ts'
import type { QuotaRequest, QuotaView } from './quota.ts'

/** The cordis service name the glm-login row provides. */
export const PRICING_SERVICE = 'glmHournessPricing'

export interface UsagePricing {
  /** The panel's first line: what the numbers are and when peak hours are. */
  readonly basis: string
  /** The plan's name, in the line of models outside it. */
  readonly plan: string
  /** Credits one call made at `atMs` is charged; undefined for a model outside the plan. */
  charged(model: string, usage: TokenUsage, atMs: number): number | undefined
  /** Whether `atMs` falls in the plan's peak hours. */
  peak(atMs: number): boolean
  /** The plan's peak hours as text for people and models (M6); absent before M6. */
  readonly peakHours?: PeakHoursText
  /** The plan's quota windows and login state as the channel reads them (M6); absent before M6. */
  quota?(request?: QuotaRequest): Promise<QuotaView>
  /** The channel package's default loop-board entries, as data (M6); absent before M6. */
  readonly loopDefaults?: readonly ChannelLoopDefault[]
}

/** e.g. {en: "weekdays 14:00-18:00 UTC+8", zh: "工作日 14:00–18:00（UTC+8）"} */
export interface PeakHoursText {
  readonly en: string
  readonly zh: string
}

const MINUTE_MS = 60_000

/** How far `nextPeakChange` looks by default: a peak window recurs within a week. */
const DEFAULT_HORIZON_MS = 8 * 24 * 60 * MINUTE_MS

/**
 * The first whole minute after `fromMs` at which `peak` differs from
 * `peak(fromMs)`; undefined when it does not change within `horizonMs`.
 * One function for every reader that words the end of a peak, so they name
 * the same minute.
 */
export function nextPeakChange(peak: (atMs: number) => boolean, fromMs: number, horizonMs: number = DEFAULT_HORIZON_MS): number | undefined {
  const current = peak(fromMs)
  for (let at = (Math.floor(fromMs / MINUTE_MS) + 1) * MINUTE_MS; at <= fromMs + horizonMs; at += MINUTE_MS) {
    if (peak(at) !== current) return at
  }
  return undefined
}

/** Read the service; undefined while the glm-login row is not active, or when a member the panel uses has the wrong type. */
export function pricingService(ctx: ServiceLookup, problem?: (message: string) => void): UsagePricing | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(PRICING_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const service = value as Partial<Record<keyof UsagePricing, unknown>>
  if (typeof service.basis === 'string' && typeof service.plan === 'string' && typeof service.charged === 'function' && typeof service.peak === 'function') return value as UsagePricing
  problem?.(`${PRICING_SERVICE} has the wrong shape; the usage panel lists calls and tokens only`)
  return undefined
}

/** The longest text a plan may give for its peak hours, in characters. */
const PEAK_HOURS_MAX = 80

/** The service as what it may hold at run time: every member unknown, to be checked before use. */
const membersOf = (pricing: UsagePricing): Partial<Record<keyof UsagePricing, unknown>> => pricing

const singleLine = (text: string): boolean => text.length >= 1 && text.length <= PEAK_HOURS_MAX && !/[\n\r\u2028\u2029]/.test(text)

/**
 * The peak-hours text when both strings are single lines of 1-80 characters,
 * else undefined. A member of the wrong type is reported to `problem`; one
 * that is absent, too long or has a line break reads as none without a report.
 */
export function peakHoursOf(pricing: UsagePricing, problem?: (message: string) => void): PeakHoursText | undefined {
  const value = membersOf(pricing).peakHours
  if (value === undefined) return undefined
  const text: Partial<Record<keyof PeakHoursText, unknown>> | null = typeof value === 'object' ? value : null
  if (text === null || typeof text.en !== 'string' || typeof text.zh !== 'string') {
    problem?.(`${PRICING_SERVICE} peakHours has the wrong shape; the peak hours text reads as absent`)
    return undefined
  }
  return singleLine(text.en) && singleLine(text.zh) ? { en: text.en, zh: text.zh } : undefined
}

/**
 * The quota reader, called on the service; undefined when the member is
 * absent, or not a function (reported to `problem`). The promise it returns
 * may reject: the caller shows the failure and leaves the rest of the
 * service as it is.
 */
export function quotaOf(pricing: UsagePricing, problem?: (message: string) => void): ((request?: QuotaRequest) => Promise<QuotaView>) | undefined {
  const quota = membersOf(pricing).quota
  if (quota === undefined) return undefined
  if (typeof quota !== 'function') {
    problem?.(`${PRICING_SERVICE} quota is not a function; the quota reads as absent`)
    return undefined
  }
  return (request?: QuotaRequest): Promise<QuotaView> => (quota as (request?: QuotaRequest) => Promise<QuotaView>).call(pricing, request)
}
