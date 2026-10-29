/**
 * The pricing contract (docs/ORCHESTRATION.md §11.2, §11.3): how the usage
 * panel of the orchestration package prices a call without carrying any
 * plan's coefficients.
 *
 * The glm-login row of the GLM channel package provides the service with
 * the GLM credit plan (src/glm-llm/credits.ts); the hourness row reads it per
 * invocation and lists calls and tokens only while it is absent. A
 * malformed value counts as absent and is reported to the reader's
 * `problem` callback; only the members the panel uses are checked, so a
 * wider value from a newer channel package still reads.
 */
import type { ServiceLookup } from './dsh-min.ts'
import type { TokenUsage } from './lm-min.ts'

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
