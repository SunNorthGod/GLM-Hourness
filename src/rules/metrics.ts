/**
 * The one exit of the rules board's metrics events (docs/ORCHESTRATION.md
 * §16.10; design §10.5). The metrics stream has no design or code yet, so the
 * exit is injected and, with none installed, does nothing: the board's facts
 * stay in its own journal either way. When the stream exists, the choice of
 * writer (the host's service, or the library entry outside DSH) is made here
 * and nowhere else.
 *
 * An event is data only: counts, ids and levels, never the text of a command
 * or its arguments. A failing exit does not reach the caller: the verdict and
 * the exit code of a check do not depend on whether it was recorded.
 */
import type { Effect, PeakLevel } from './model.ts'
import type { SignalReading } from './signals.ts'

/** `rules.check`: one per judgement of `checkCall`. The time and the project are the envelope's, which the writer adds. */
export interface RulesCheckEvent {
  readonly event: 'rules.check'
  readonly effect: 'allow' | Effect
  readonly exitCode: 0 | 4 | 5
  /** The rules that applied to the call, strongest first. */
  readonly rules: readonly string[]
  readonly peakMode: { readonly level: PeakLevel, readonly origin: 'default' | 'human' }
  readonly glmSpend?: 'optional' | 'necessary'
  /** Where the reading of `glm-peak` came from. */
  readonly glmPeakSource: SignalReading['source']
  readonly unknownSignals: readonly string[]
  /** How long the caller has waited since its first judgement (a repeated judgement while it waits). */
  readonly waitedMs?: number
  readonly caller: 'cli' | 'library'
}

/** Every event the rules board hands to the stream; the later steps add theirs here. */
export type RulesMetricEvent = RulesCheckEvent

/** Where an event goes: the event and the project root it concerns. */
export type MetricExit = (event: RulesMetricEvent, project: string) => void | Promise<void>

const NO_EXIT: MetricExit = () => {}

/** Hand an event to the exit and wait for it. Never rejects: an exit that throws or fails is swallowed. */
export async function emitMetric(event: RulesMetricEvent, project: string, exit: MetricExit = NO_EXIT): Promise<void> {
  try {
    await exit(event, project)
  }
  catch {
    // The stream is not the board's to repair; the judgement stands without it.
  }
}
