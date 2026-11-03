/**
 * The one exit of the execution layer's metrics (M7 design 0.6 §3.16): call
 * sites hand each fact over as an event the moment it happens; the numbers
 * are harness-recorded counts and references, never conversation text and
 * never a model's self-report.
 *
 * The metrics pipeline that would store these events is not built (it is not
 * on the bootstrap path, `d-dogfood-scope`), and its write interface is its
 * design's to fix — including the envelope every event gets (the time, the
 * project, the session, the row). Until it lands the sink is `undefined` and
 * `emitMetric` is a no-op: the facts stay where §3.16's second table says
 * they live (dispatch comments, evidence, checks.jsonl, advances.jsonl, the
 * violation journal, the usage journal), and the reports compute from those.
 * Tests and the real pipeline inject a sink; when the pipeline arrives, only
 * this file changes.
 */

/** Every event the execution layer hands over, with the fields of §3.16's table. */
export type MetricEvent =
  | { readonly event: 'execute.dispatch', readonly role: string, readonly node: string, readonly attempt: number, readonly childId: string, readonly provider: string, readonly model: string, readonly reasoningEffort?: string, readonly sameAsMain: boolean, readonly sameAsWorker?: boolean, readonly depth?: 'full' | 'light' | 'skip', readonly whyRef: string }
  | { readonly event: 'execute.dispatch-refused', readonly code: string }
  | { readonly event: 'execute.plan', readonly task: string, readonly version: number, readonly outcome: 'revise' | 'to-main' | 'approved' | 'rejected' | 'timeout', readonly steps: number, readonly waitedMs: number }
  | { readonly event: 'execute.ask', readonly task: string, readonly waitedMs: number, readonly outcome: 'answered' | 'timeout' }
  | { readonly event: 'execute.handback', readonly task: string, readonly attempt: number, readonly status: string, readonly stopReason?: string, readonly commits: number, readonly files: number, readonly ms: number, readonly outside: number }
  | { readonly event: 'execute.review-depth', readonly task: string, readonly declared: 'full' | 'light' | 'skip', readonly effective: 'full' | 'light' | 'skip', readonly hit?: string, readonly unparsed?: boolean }
  | { readonly event: 'execute.review', readonly task: string, readonly round: number, readonly depth: 'full' | 'light', readonly model: string, readonly blocking: number, readonly nonBlocking: number, readonly demoted: number }
  | { readonly event: 'execute.stop', readonly node: string, readonly kind: 'review' | 'check' | 'acceptance', readonly rounds: number }
  | { readonly event: 'execute.check', readonly commit: string, readonly tasks: readonly string[], readonly passed: boolean, readonly kind: 'commands' | 'only' | 'trunk', readonly commands: readonly { readonly line: string, readonly exit: number, readonly ms: number }[], readonly setup: boolean, readonly lockWaitMs: number }
  | { readonly event: 'execute.advance', readonly ref: 'local' | 'remote', readonly way: 'advance' | 'push' | 'fetch' | 'outside', readonly from: string, readonly to: string, readonly tasks: readonly string[], readonly byCheck?: boolean, readonly byPaths?: boolean, readonly checkedAfter?: boolean, readonly reviewPending?: readonly string[], readonly incomingFloor?: number, readonly external?: boolean }
  | { readonly event: 'execute.advance-refused', readonly missing: string }
  | { readonly event: 'execute.unchecked-advance', readonly ref: 'local' | 'remote', readonly from: string, readonly to: string, readonly missing: string }
  | { readonly event: 'execute.goal', readonly goal: string, readonly module?: string, readonly op: 'start' | 'module-released' | 'move' | 'resume' | 'block' | 'complete', readonly code?: string, readonly reason?: string }
  | { readonly event: 'execute.tier', readonly tier: 1 | 2 | 3, readonly node: string, readonly running?: number, readonly stale?: number, readonly reported?: number, readonly batched?: number }
  | { readonly event: 'execute.completion-gate', readonly goal: string, readonly passed: boolean, readonly gaps: number }
  | { readonly event: 'execute.acceptance-review', readonly goal: string, readonly round: number, readonly model: string, readonly verdict: 'APPROVED' | 'CHANGES_REQUESTED', readonly blocking: number }
  | { readonly event: 'execute.reconcile', readonly lost: number, readonly replayed: number, readonly evidence: number }
  | { readonly event: 'execute.loop-entry', readonly entry: string, readonly key: string, readonly delivered: boolean, readonly deferred?: string }
  | { readonly event: 'execute.loop-fallback', readonly entry: string, readonly key: string, readonly reason: 'unclaimed' | 'emit-failed' | 'interrupted' | 'peak-end-missed', readonly waitedS?: number }
  | { readonly event: 'execute.loop-contribute', readonly row: string, readonly accepted: readonly string[], readonly dropped: readonly { readonly id: string, readonly reason: string }[] }
  | { readonly event: 'execute.peak-cap', readonly model: string, readonly cap: number, readonly running: number }
  | { readonly event: 'operate.report', readonly kind: 'morning' | 'weekly' | 'patrol', readonly lines: number, readonly characters: number }
  | { readonly event: 'operate.patrol', readonly findings: Readonly<Record<string, number>>, readonly done: readonly string[], readonly trunkCheck?: 'passed' | 'failed' | 'skipped' }

/** Where a handed-over event goes: the metrics pipeline when it is there, a test's recorder otherwise. */
export type MetricSink = (event: MetricEvent) => void

let sink: MetricSink | undefined

/** Install the exit, or `undefined` to go back to recording nothing. Returns the previous sink. */
export function setMetricSink(next: MetricSink | undefined): MetricSink | undefined {
  const previous = sink
  sink = next
  return previous
}

/**
 * Hand one fact over. Without a sink this records nothing and costs nothing
 * but the call. It never throws and never blocks the caller: what a write
 * failure means (§3.16's health and gap journal) belongs to the exit, which
 * is the pipeline's once it lands.
 */
export function emitMetric(event: MetricEvent): void {
  if (sink !== undefined) sink(event)
}
