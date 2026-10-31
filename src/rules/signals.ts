/**
 * The effective value of a signal (docs/ORCHESTRATION.md §16, design §5.1):
 * what a rule's condition reads. A person's value comes first and is always
 * allowed to override a detector; otherwise the value a detector measured,
 * while the detector is live; otherwise unknown, with the reason. A detector
 * that fails, times out or has no host is unknown, never "no". Pure: the
 * moment is passed in, nothing is read.
 */
import type { SignalState, SignalValue } from './model.ts'

/** The signal the host computes from the pricing service: whether it is a GLM peak hour. */
export const GLM_PEAK = 'glm-peak'

/** Where a reading came from. `caller`, `heartbeat` and `clock` are for the host-computed signal; `none` is a reading with no source at all. */
type SignalSource = 'caller' | 'heartbeat' | 'manual' | 'detector' | 'clock' | 'none'

/** A signal's value, or why it cannot be read. */
export type SignalReading = (
  | { readonly value: SignalValue, readonly unknown?: never }
  | { readonly unknown: string, readonly value?: never }
) & { readonly name: string, readonly source: SignalSource }

/** Whether the detector of a signal is live: its script is the approved one and its host reported a fresh success. The detector row decides; this file takes the answer. */
export type DetectorStatus = { readonly live: true } | { readonly live: false, readonly reason: string }

function unknownReading(name: string, source: SignalSource, reason: string): SignalReading {
  return { name, source, unknown: reason }
}

/**
 * The reading of one signal at `now`. `state` is undefined for a name nobody
 * defined; `detector` is the answer for the signal's detector (absent when no
 * host reports on it).
 */
export function effectiveSignal(name: string, state: SignalState | undefined, now: Date, detector?: DetectorStatus): SignalReading {
  if (state === undefined) return unknownReading(name, 'none', `${name} is not defined in this project`)
  const manual = state.manual
  const expired = manual?.expiresAt !== undefined && Date.parse(manual.expiresAt) <= now.getTime()
  if (manual !== undefined && !expired) return { name, source: 'manual', value: manual.value }
  if (state.detector === undefined) {
    return unknownReading(name, 'none', expired ? `the value set for ${name} has expired` : `${name} has no value yet: nobody has set it`)
  }
  if (detector?.live === false) return unknownReading(name, 'detector', detector.reason)
  if (detector === undefined) return unknownReading(name, 'detector', `the detector ${state.detector} has no live host reporting on it`)
  if (state.detected === undefined) return unknownReading(name, 'detector', `the detector ${state.detector} has not reported a value`)
  return { name, source: 'detector', value: state.detected.value }
}
