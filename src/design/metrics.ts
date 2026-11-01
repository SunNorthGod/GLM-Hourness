/**
 * The one exit M3 has to the metrics stream (docs/ORCHESTRATION.md §3.5;
 * decision `metrics`): what the design row counts goes out here, a number or
 * a reference, never the words of the conversation. The stream's design has
 * not fixed its write interface yet, so the exit does nothing; the facts stay
 * where they are written today (the violation journal, the snapshot journal,
 * the graph's history, the session log). The stream's design changes this
 * one function.
 */

/** One event: a name from the metrics table and its fields. */
export interface MetricEvent {
  readonly event: string
  readonly [field: string]: unknown
}

export function emitMetric(_event: MetricEvent): void {
  // The metrics stream has no write interface yet.
}
