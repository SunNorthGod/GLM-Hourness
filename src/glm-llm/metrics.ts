/**
 * The GLM channel's four metric events (M6 design §14.2; metrics design
 * §3.5, §4.5, §6.2): the sink the rows hand to the adapter, the quota
 * reader and the peak reminder, and the pure mapping from a finished quota
 * read to the body of `glm.quota-read`. The adapter's two records map
 * field for field (`glm.upstream-limit`, `glm.login-rejected`) and the
 * reminder's notice facts map to `glm.peak-reminder` where they are made.
 *
 * Only codes, counts and window names travel: no token, no header, no
 * response text. A reason code that is not id-shaped (the 3.16.3 credential
 * messages carry spaces) keeps its prefix and becomes `<prefix>:other`. The
 * event names where it belongs (the session, or a directory of the
 * project); the metrics row files it under that project, and one it cannot
 * place is counted, not written. Without the metrics row (the orchestration
 * package not installed, or its row off) the sink does nothing and says
 * nothing.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { emitMetric, METRICS_ID_PATTERN, type GlmBodies, type MetricsWhere } from '../shared/metrics.ts'
import { nameWindows, type QuotaLimitRow } from './quota-parse.ts'

/** One of the four events, before the sink adds the submitter. */
export type GlmMetricEvent = { [K in keyof GlmBodies]: { readonly k: K, readonly body: GlmBodies[K] } }[keyof GlmBodies]

/** Where the rows hand their events. Never throws. */
export type GlmMetricSink = (event: GlmMetricEvent, where: MetricsWhere) => void

/** The sink over the metrics service as cordis finds it at each event (`emitMetric` reads the service lazily and swallows its failures). */
export function glmMetricSink(ctx: ServiceLookup): GlmMetricSink {
  return (event, where) => { emitMetric(ctx, { ...event, by: 'glm' }, where) }
}

/** A `where` with only the members that are there: an empty session id or directory names nothing. */
export function metricsWhere(sessionId: string | undefined, dir?: string): MetricsWhere {
  return {
    ...(sessionId === undefined || sessionId === '' ? {} : { sessionId }),
    ...(dir === undefined || dir === '' ? {} : { dir }),
  }
}

/** How a quota read ended: the parsed rows of the answer and when it was read, or the reason code of the failure. */
export type QuotaReadEnd =
  | { readonly ok: true, readonly at: number, readonly limits: readonly QuotaLimitRow[], readonly dropped: number }
  | { readonly ok: false, readonly reason: string }

/** A reason code as an id: itself when id-shaped, else its prefix with `:other`, else `other`. */
export function reasonId(reason: string): string {
  if (METRICS_ID_PATTERN.test(reason)) return reason
  const colon = reason.indexOf(':')
  const prefixed = colon > 0 ? `${reason.slice(0, colon)}:other` : ''
  return METRICS_ID_PATTERN.test(prefixed) ? prefixed : 'other'
}

/**
 * The used share of each window of a reading, rounded to a whole percent,
 * keyed by the window's name (`five-hour`, `weekly`, `mcp`, `window`,
 * `other`); a name that comes again gets `-2`, `-3`. A row without a share
 * is left out. The reader takes at most 32 rows, the map's cap.
 */
export function windowShares(limits: readonly QuotaLimitRow[], readAt: number): Readonly<Record<string, number>> {
  const shares: Record<string, number> = {}
  const seen = new Map<string, number>()
  for (const { name, row } of nameWindows(limits, readAt)) {
    if (row.percentage === undefined) continue
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    shares[count === 1 ? name : `${name}-${count}`] = Math.round(row.percentage)
  }
  return shares
}

/** The body of one `glm.quota-read`: the outcome, how long the read took, who started it, the windows and the dropped rows. */
export function quotaReadBody(end: QuotaReadEnd, ms: number, by: 'command' | 'service'): GlmBodies['glm.quota-read'] {
  const took = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0
  if (!end.ok) return { ok: false, why: reasonId(end.reason), ms: took, by, windows: {}, dropped: 0 }
  return { ok: true, ms: took, by, windows: windowShares(end.limits, end.at), dropped: end.dropped }
}
