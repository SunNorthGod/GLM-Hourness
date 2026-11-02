/**
 * What a judgement reads of a project: the table of rules and the readings of
 * the signals their conditions name (docs/ORCHESTRATION.md §16.10, §16.11). One
 * place, so the tool-call gate and checkCall build them the same way and
 * cannot judge the same rules differently. Pure.
 */
import { builtinRulesFor } from './builtin.ts'
import type { BuiltinRule, Condition, PeakLevel, ProjectState, Rule } from './model.ts'
import type { PeakReading } from './peak.ts'
import { GLM_PEAK, effectiveSignal, type SignalReading } from './signals.ts'

export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The table of rules a judgement reads: the person's rules by id, then the entries of the code the peak level enables. */
export function tableOf(state: ProjectState, level: PeakLevel): readonly (Rule | BuiltinRule)[] {
  return [...Object.values(state.rules ?? {}).sort((a, b) => compare(a.id, b.id)), ...builtinRulesFor(level)]
}

/**
 * Every signal a condition can name: `glm-peak` and the project's switches and detector signals. No detector is
 * reported live here (nothing runs them yet), so a signal a detector defines reads as unknown unless a person set it.
 */
export function readingsOf(state: ProjectState, glmPeak: SignalReading, now: Date): ReadonlyMap<string, SignalReading> {
  const readings = new Map(Object.keys(state.signals ?? {}).map(name => [name, effectiveSignal(name, state.signals?.[name], now)] as const))
  return readings.set(GLM_PEAK, glmPeak)
}

function namesIn(condition: Condition | undefined): readonly string[] {
  if (condition === undefined) return []
  if ('signal' in condition) return [condition.signal]
  if ('not' in condition) return namesIn(condition.not)
  if ('all' in condition) return condition.all.flatMap(namesIn)
  if ('any' in condition) return condition.any.flatMap(namesIn)
  return []
}

/** Every signal read at `now`, with `glm-peak` taken from the clock of the GLM plan (a peak that cannot be read is unknown, with the reason), and while it is peak, when the peak ends. */
export function clockReadings(state: ProjectState, reading: PeakReading, now: Date): { readonly glmPeak: SignalReading, readonly until?: string, readonly readings: ReadonlyMap<string, SignalReading> } {
  const glmPeak: SignalReading = reading.peak === undefined ? { name: GLM_PEAK, source: 'none', unknown: reading.why ?? '原因不明' } : { name: GLM_PEAK, source: 'clock', value: reading.peak }
  return { glmPeak, ...(reading.peak === true && reading.until !== undefined ? { until: reading.until } : {}), readings: readingsOf(state, glmPeak, now) }
}

/** The signals a rule reads: those of its condition and of the condition it lasts until. */
export function signalsRead(rule: Rule | BuiltinRule): readonly string[] {
  return [...namesIn(rule.condition), ...(rule.lifetime.kind === 'until' ? namesIn(rule.lifetime.condition) : [])]
}
