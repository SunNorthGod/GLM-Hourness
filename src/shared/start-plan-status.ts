/**
 * Start Plan live availability and failover telemetry contract shared by the
 * GLM channel (provider) and the execute row (dispatcher and step notice).
 *
 * The glm-llm row provides `START_PLAN_SERVICE`; without it, callers read the
 * service as absent and fall back cleanly without failing.
 */
import type { ServiceLookup } from './dsh-min.ts'

/** Cordis service name the glm-llm row provides for Start Plan runtime status. */
export const START_PLAN_SERVICE = 'glmHournessStartPlan'

export type StartPlanAvailabilityReason =
  | 'ok'
  | 'empty'
  | 'concurrency'
  | 'unentitled'
  | 'unlogged'
  | 'expired'
  | 'unavailable'

export type StartPlanFailoverReason = 'empty' | 'concurrency' | 'unentitled' | 'expired'

export interface StartPlanSnapshot {
  readonly available: boolean
  readonly reason: StartPlanAvailabilityReason
  readonly activeStreams: number
  readonly cooldownUntil?: number
  readonly failoverCount: number
  readonly lastFailoverReason?: StartPlanFailoverReason
  readonly balanceSummary?: string
}

export interface StartPlanStatusService {
  status(model?: string): StartPlanSnapshot
}

/** Read the Start Plan live-status service; undefined when absent or malformed. */
export function startPlanStatusService(ctx: ServiceLookup, problem?: (message: string) => void): StartPlanStatusService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get(START_PLAN_SERVICE) : undefined
  if (value === undefined || value === null) return undefined
  const candidate = value as Partial<Record<keyof StartPlanStatusService, unknown>>
  if (typeof candidate.status === 'function') return value as StartPlanStatusService
  problem?.(`${START_PLAN_SERVICE} has the wrong shape; Start Plan failover status reads as absent`)
  return undefined
}
