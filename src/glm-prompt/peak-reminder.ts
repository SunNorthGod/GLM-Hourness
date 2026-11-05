/**
 * Peak-hour reminder (docs/ORCHESTRATION.md §11.4): on a GLM route, the first
 * step of a session inside a peak window (src/glm-llm/credits.ts,
 * docs/FACTS.md §2.4) gets one short `<system-reminder>` notice that peak
 * hours have started. Information on peak pricing, worded by the project's
 * peak mode when the rules board provides it (glmHournessPeakMode); without it
 * the M6.1 text. The reminder never switches models or plans; deferring work
 * is the rules board's (docs/ORCHESTRATION.md §11.4).
 *
 * The state lives in the session: each notice records the window it
 * announced (`source.peakWindow`, the window's UTC+8 date), and a step
 * reminds when the request-visible history (`session.deriveMessages()`)
 * holds no notice for the current window. A session that starts inside the
 * window, or whose previous step was before it, is told once; a resumed
 * session is not told again; a compaction that drops the notice makes the
 * next GLM step in the same window repeat it, because the model no longer
 * sees it. A level changed inside the window does not remind again. Not a
 * ZCode text (ZCode has no local peak window, docs/FACTS.md §1), so it lives
 * outside the mirror files.
 */
import { createUserNotice, type AgentLike, type DerivedMessage } from '../shared/dsh-min.ts'
import { PEAK_END_LABEL, PEAK_HOURS, peakWindowAt } from '../glm-llm/credits.ts'
import { metricsWhere, type GlmMetricSink } from '../glm-llm/metrics.ts'
import type { GlmBodies } from '../shared/metrics.ts'
import { PEAK_MODE_SERVICE, type PeakLevel, type PeakModeService } from '../shared/peak-mode.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'

/** Source kind of the persisted reminder notice. */
export const PEAK_REMINDER_SOURCE = 'glm-peak-reminder'

/** The first two sentences, the same under every level. */
const PEAK_OPENING = `Peak hours have started (${PEAK_HOURS.en}). Until ${PEAK_END_LABEL}, GLM usage is charged at the full credit rate; outside peak hours it costs half.`

/** The sentence every level ends with (docs/CHARTER.md §6). */
const PLANS_SENTENCE = 'Do not switch models or plans unless the user asks.'

/** The reminder body when no peak mode is readable or the mode is inform (docs/ORCHESTRATION.md §11.4). */
export const PEAK_REMINDER_TEXT = `${PEAK_OPENING} This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.`

export interface ReminderMode {
  readonly level: PeakLevel
  readonly origin: 'default' | 'human'
  /** The service's `glmWorkerCap`, a positive safe integer when present; worded only for `reduce`. */
  readonly glmWorkerCap?: number
}

/** The level sentence, worded as the rules board words it in its own line (the same sentence twice in one step reads as one fact). */
function levelSentence(mode: ReminderMode): string {
  return mode.origin === 'default' ? `Peak mode: ${mode.level} (the default; the human can change it).` : `Peak mode set by the human: ${mode.level}.`
}

/**
 * The reminder body for a peak mode: PEAK_REMINDER_TEXT for no mode and for
 * `inform`. `reduce` and `stop` say what is asked of whom and never that work
 * is only for information or may not be paused; the main agent is not held on
 * any level (docs/ORCHESTRATION.md §16), so no text tells it to stop or wait.
 */
export function peakReminderText(mode?: ReminderMode): string {
  if (mode === undefined || mode.level === 'inform') return PEAK_REMINDER_TEXT
  const level = levelSentence(mode)
  if (mode.level === 'stop') {
    return `${PEAK_OPENING} ${level} Until ${PEAK_END_LABEL}, do not dispatch a GLM subagent and do not start a script that spends GLM credits; a GLM subagent whose call comes back deferred stops and reports where it stopped. The main agent is not held on any level: it keeps answering the human and working. ${PLANS_SENTENCE}`
  }
  const cap = mode.glmWorkerCap === undefined ? '' : `run at most ${mode.glmWorkerCap} GLM subagent${mode.glmWorkerCap === 1 ? '' : 's'} at a time and `
  return `${PEAK_OPENING} ${level} Until ${PEAK_END_LABEL}, ${cap}do not start optional work that spends many GLM credits (calibration runs, ablations, large reviews); the main agent moves such work to after peak, including work it dispatches. Necessary work, and a task you were dispatched for, go on. ${PLANS_SENTENCE}`
}

/** Why the reminder fell back to PEAK_REMINDER_TEXT, as `source.peakModeNote` records it. */
type PeakModeNote = 'no-service' | 'no-state' | 'not-peak' | 'peak-unknown' | 'invalid'

export type PeakModeRead = { readonly mode: ReminderMode } | { readonly note: PeakModeNote }

const isLevel = (value: unknown): value is PeakLevel => value === 'inform' || value === 'reduce' || value === 'stop'
const isOrigin = (value: unknown): value is 'default' | 'human' => value === 'default' || value === 'human'
const isWorkerCap = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const reported = new WeakMap<(message: string) => void, Set<string>>()

/** Report a bad read to `problem` once per reason for that callback; the callback of a row lives as long as the process. */
function invalid(problem: ((message: string) => void) | undefined, reason: string, detail: string): PeakModeRead {
  if (problem !== undefined) {
    const seen = reported.get(problem) ?? new Set<string>()
    reported.set(problem, seen)
    if (!seen.has(reason)) {
      seen.add(reason)
      problem(`${PEAK_MODE_SERVICE} ${detail}; the peak reminder uses its text without a peak mode`)
    }
  }
  return { note: 'invalid' }
}

/**
 * The mode to word the reminder by. `service` is peakModeService's result and
 * `shapeProblem` whether it reported a wrong shape; a mode comes only when
 * `stateFor(sessionId)` says it is peak and gives a known level and origin.
 * Never throws; an unreadable answer is `invalid`, reported to `problem` once
 * per reason.
 */
export function readPeakMode(service: PeakModeService | undefined, shapeProblem: boolean, sessionId: string | undefined, problem?: (message: string) => void): PeakModeRead {
  if (service === undefined) return shapeProblem ? invalid(problem, 'service-shape', 'has the wrong shape') : { note: 'no-service' }
  if (sessionId === undefined) return { note: 'no-state' }
  let state: unknown
  try {
    state = service.stateFor(sessionId)
  }
  catch (error) {
    return invalid(problem, 'read-threw', `stateFor threw: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (state === undefined) return { note: 'no-state' }
  if (typeof state !== 'object' || state === null) return invalid(problem, 'state-shape', 'gave a state that is not an object')
  const { level, origin, peak, glmWorkerCap } = state as Record<string, unknown>
  if (!isLevel(level)) return invalid(problem, 'level', 'gave a level it does not define')
  if (!isOrigin(origin)) return invalid(problem, 'origin', 'gave an origin it does not define')
  if (peak === undefined) return { note: 'peak-unknown' }
  if (typeof peak !== 'boolean') return invalid(problem, 'peak', 'gave a peak that is not true, false or absent')
  if (!peak) return { note: 'not-peak' }
  return { mode: { level, origin, ...(level === 'reduce' && isWorkerCap(glmWorkerCap) ? { glmWorkerCap } : {}) } }
}

/** The peak window to announce at `now` (epoch milliseconds): undefined off-peak or when the history already holds its notice. */
export function peakWindowToAnnounce(history: readonly DerivedMessage[], now: number): string | undefined {
  const window = peakWindowAt(now)
  if (window === undefined) return undefined
  const announced = history.some(message => message.role === 'user' && message.source?.kind === PEAK_REMINDER_SOURCE && message.source.peakWindow === window)
  return announced ? undefined : window
}

/**
 * Install the reminder on one agent (src/shared/step-notice.ts, the seam
 * of the todo reminder and the graph's step projection): when `eligible()`
 * says this step is GLM-routed, the notice is appended after the step's
 * admitted messages. `now` reads the wall clock (injectable for tests).
 * `peakMode` reads the project's peak mode and is called once per notice
 * sent, on the step that announces; without it every notice is
 * PEAK_REMINDER_TEXT with the note `no-service`. Each notice sent is one
 * `glm.peak-reminder` to `metric` (M6 design §14.2) for the agent's session
 * and working directory: the window, the level (`none` with the note when
 * none was readable) and the cap the text wrote. Returns undefined,
 * installing nothing, when the agent has no session history to read the
 * state from.
 */
export function installPeakReminder(agent: AgentLike, eligible: () => boolean, now: () => number, peakMode?: () => PeakModeRead, metric?: GlmMetricSink): (() => void) | undefined {
  const told = (body: GlmBodies['glm.peak-reminder']): void => {
    try {
      metric?.({ k: 'glm.peak-reminder', body }, metricsWhere(agent.session?.id ?? agent.id, agent.session?.header.cwd))
    }
    catch {
      // The sink never throws; the notice goes out whatever the journal does.
    }
  }
  return installStepNotice(agent, 'peak reminder', eligible, (history) => {
    const window = peakWindowToAnnounce(history, now())
    if (window === undefined) return undefined
    const read: PeakModeRead = peakMode === undefined ? { note: 'no-service' } : peakMode()
    if ('note' in read) {
      told({ window, mode: 'none', note: read.note })
      return createUserNotice(PEAK_REMINDER_SOURCE, `peak hours ${window}`, wrapSystemReminder(PEAK_REMINDER_TEXT), { peakWindow: window, peakMode: 'none', peakModeNote: read.note })
    }
    const { mode } = read
    told({ window, mode: mode.level, ...(mode.glmWorkerCap === undefined ? {} : { cap: mode.glmWorkerCap }) })
    return createUserNotice(PEAK_REMINDER_SOURCE, `peak hours ${window}`, wrapSystemReminder(peakReminderText(mode)), {
      peakWindow: window,
      peakMode: mode.level,
      peakModeOrigin: mode.origin,
      ...(mode.glmWorkerCap === undefined ? {} : { peakWorkerCap: mode.glmWorkerCap }),
    })
  }, 'glm-prompt')
}
