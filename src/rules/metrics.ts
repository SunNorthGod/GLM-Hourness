/**
 * The one exit of the rules board's metrics events (docs/ORCHESTRATION.md
 * §16.10; design §10.5; metrics design §6.2). The choice of writer is made
 * here and nowhere else: inside the host the events go through the metrics
 * row's service (`glmHournessMetrics`), outside DSH — the rules command line
 * today, the loop board's script executor when it arrives — through the
 * library entry `appendEvents`, which locates the project from the directory
 * and writes nothing when there is none. A caller that wants another exit
 * injects it (the L2 fake exits).
 *
 * An event is data only: counts, ids and levels, never the text of a command
 * or its arguments. A failing exit does not reach the caller: the verdict and
 * the exit code of a check do not depend on whether it was recorded.
 */
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { EmittedEvent, MetricsMap, MetricsWhere } from '../shared/metrics.ts'
import { emitMetric as emitThroughService } from '../shared/metrics.ts'
import { appendEvents } from '../metrics/library.ts'
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

/** `rules.judged`: one per rule the gate judges to anything but allow — a block, a deferral, a record (design §10.5). */
export interface RulesJudgedEvent {
  readonly event: 'rules.judged'
  /** The rule's own id, as the board's table holds it (`r-no-probe`); the gate's own files rule is `files-only`. */
  readonly rule: string
  /** How the rule executes this call: `block`, `deferral` (a queued call) or `rule-record` (recorded, the call ran). */
  readonly how: 'block' | 'deferral' | 'rule-record'
  /** The call's native tool name. */
  readonly tool: string
  /** The ticket a deferral opened or answered. */
  readonly ticket?: string
  /** Whether the call was made by a child of the step's agent. */
  readonly sub: boolean
  /** The values of the signals the rule read; a value that is not an integer, a boolean or an id (unreadable is null) has its name in `unread` instead. */
  readonly signals: MetricsMap
  readonly unread?: readonly string[]
  /** How long the judgement itself took. */
  readonly ms: number
}

/** Every event the rules board hands to the stream; the later steps add theirs here. */
export type RulesMetricEvent = RulesCheckEvent | RulesJudgedEvent

/** Where an event goes: the event and the project root it concerns. */
export type MetricExit = (event: RulesMetricEvent, project: string) => void | Promise<void>

const NO_EXIT: MetricExit = () => {}

/** The board event as the journal's closed vocabulary holds it: the kind, the submitter and the body under `body`. */
export function toEmitted(event: RulesMetricEvent): EmittedEvent {
  if (event.event === 'rules.check') {
    return {
      k: 'rules.check',
      by: 'rules',
      body: {
        effect: event.effect,
        exitCode: event.exitCode,
        rules: event.rules,
        peakMode: { level: event.peakMode.level, origin: event.peakMode.origin },
        ...(event.glmSpend === undefined ? {} : { glmSpend: event.glmSpend }),
        glmPeakSource: event.glmPeakSource,
        unknownSignals: event.unknownSignals,
        ...(event.waitedMs === undefined ? {} : { waitedMs: event.waitedMs }),
        caller: event.caller,
      },
    }
  }
  return {
    k: 'rules.judged',
    by: 'rules',
    body: {
      rule: event.rule,
      how: event.how,
      tool: event.tool,
      ...(event.ticket === undefined ? {} : { ticket: event.ticket }),
      sub: event.sub,
      signals: event.signals,
      ...(event.unread === undefined ? {} : { unread: event.unread }),
      ms: event.ms,
    },
  }
}

/** The exit outside DSH: the library entry, the project located from the directory (metrics design §5.2). */
export const libraryExit: MetricExit = (event, project) => {
  void appendEvents(project, [toEmitted(event)])
}

/** Hand one event to the metrics row's service from a caller that also knows the session (the gate). Never throws. */
export function emitJudged(ctx: ServiceLookup, event: RulesJudgedEvent, where: MetricsWhere): void {
  emitThroughService(ctx, toEmitted(event), where)
}

/** Hand an event to the exit and wait for it. Never rejects: an exit that throws or fails is swallowed. */
export async function emitMetric(event: RulesMetricEvent, project: string, exit: MetricExit = NO_EXIT): Promise<void> {
  try {
    await exit(event, project)
  }
  catch {
    // The stream is not the board's to repair; the judgement stands without it.
  }
}
