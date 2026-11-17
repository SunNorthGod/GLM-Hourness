/**
 * The one exit of the execution layer's metrics (M7 design 0.6 §3.16; metrics
 * design §4.5, §6.2): call sites hand each fact over as an event the moment
 * it happens; the numbers are harness-recorded counts and references, never
 * conversation text and never a model's self-report.
 *
 * When `glm-hourness/execute` is active, it installs the default sink that
 * forwards every event through `glmHournessMetrics`. Outside an activated row
 * (standalone tools or unit tests without a custom sink), `emitMetric` is a
 * no-op unless a test installs a sink with `setMetricSink`.
 */
import type { ExecuteBodies, MetricsWhere } from '../shared/metrics.ts'

/** Every event the execution layer hands over, derived from the closed `ExecuteBodies` contract. */
export type MetricEvent = {
  [K in keyof ExecuteBodies]: { readonly event: K } & ExecuteBodies[K]
}[keyof ExecuteBodies]

/** Where a handed-over event goes: the metrics pipeline when it is there, a test's recorder otherwise. */
export type MetricSink = (event: MetricEvent, where?: MetricsWhere) => void

let sink: MetricSink | undefined
let defaultSink: MetricSink | undefined

const observers = new Set<MetricSink>()

/** Build a `MetricsWhere` from optional project directory and session id, omitting empty values. */
export function executeMetricWhere(dir?: string, sessionId?: string): MetricsWhere {
  return {
    ...(dir !== undefined && dir !== '' ? { dir } : {}),
    ...(sessionId !== undefined && sessionId !== '' ? { sessionId } : {}),
  }
}

/**
 * Watch every event handed over, after the sink: the drive counts the
 * execution activity of a goal round this way (§3.9.5, E8 D7). A throwing
 * observer is ignored. The returned function stops watching.
 */
export function onMetricEvent(listener: MetricSink): () => void {
  observers.add(listener)
  return () => { observers.delete(listener) }
}

/** Install the exit, or `undefined` to go back to the default sink (no-op when standalone). Returns the previous custom sink. */
export function setMetricSink(next: MetricSink | undefined): MetricSink | undefined {
  const previous = sink
  sink = next
  return previous
}

/**
 * Install the row-level default exit used when no custom `setMetricSink`
 * overrides it; returns a disposer that restores the previous default.
 */
export function setDefaultMetricSink(next: MetricSink | undefined): () => void {
  const previous = defaultSink
  defaultSink = next
  return () => {
    if (defaultSink === next) defaultSink = previous
  }
}

/**
 * Hand one fact over. Without a sink this records nothing and costs nothing
 * but the call. It never throws and never blocks the caller: what a write
 * failure means (§3.16's health and gap journal) belongs to the metrics row.
 */
export function emitMetric(event: MetricEvent, where?: MetricsWhere): void {
  const active = sink ?? defaultSink
  if (active !== undefined) active(event, where)
  for (const observer of observers) {
    try {
      observer(event, where)
    }
    catch {
      // An observer is not the exit: its failure does not reach the caller.
    }
  }
}
