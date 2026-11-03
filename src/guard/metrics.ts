/**
 * The guard's metric events (m4-gate G2, design §3.11): the metrics design
 * (0.1 §14, m4 request) asks for one `rule` event per denial with the
 * follow-up's outcome alongside, and the gap counter as its own count. Only
 * the rule id, the kind, the outcome, the origin's scope and the session id
 * travel — never a command or a path (the metrics design keeps hashes and
 * first words only). The service's name and envelope are the metrics
 * design's to fix; until its row provides the service this is a no-op, and
 * a service that throws is swallowed: the metric never takes a call down.
 *
 * Emission sites (design §3.11): the gate emits a denial after every
 * violation write it hands to the journal, and its follow-up journal hook
 * emits the follow-up with its outcome. The remaining sites wire with their
 * writers — the late denial and the lift records with G3, the request and
 * grant records with G4, and the gap line with the journal that writes it.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** The service the metrics row will provide; the metrics design fixes the name and the envelope (design §3.11). */
export const METRICS_SERVICE = 'glmHournessMetrics'

/** One metric event: only ids and outcomes, never a command or a path (design §3.11). */
export interface GuardMetricEvent {
  readonly kind: 'denial' | 'followup' | 'late' | 'lift' | 'request' | 'grant' | 'grant-void' | 'gap'
  readonly rule?: string
  /** followup: the outcome (right-path, repeat, other, none). */
  readonly outcome?: string
  readonly scope?: string
  readonly sessionId?: string | undefined
  /** gap only: the row whose journal lost the records, and how many. */
  readonly row?: string
  readonly lost?: number
}

/** The one member the metrics service exposes; the metrics design fixes the envelope. */
interface GuardMetricsService {
  readonly emit: (event: GuardMetricEvent) => void
}

/**
 * Hand one event to the metrics service through `ctx`, and do nothing when
 * the service is absent, malformed or throwing (design §3.11).
 */
export function emitGuardMetric(ctx: ServiceLookup | undefined, event: GuardMetricEvent): void {
  try {
    const value: unknown = typeof ctx?.get === 'function' ? ctx.get(METRICS_SERVICE) : undefined
    const service = value as GuardMetricsService | undefined
    if (typeof service?.emit === 'function') service.emit(event)
  }
  catch {
    // A metric is never worth a call: the pipeline is the metrics design's to build (design §3.11).
  }
}
