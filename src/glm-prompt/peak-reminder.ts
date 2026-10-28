/**
 * Peak-hour reminder (docs/ORCHESTRATION.md §11.4): on a GLM route, the first
 * step of a session inside a peak window (src/shared/credits.ts,
 * docs/FACTS.md §2.4) gets one short `<system-reminder>` notice that peak
 * hours have started. Information only: the harness never switches models
 * or plans and never blocks or postpones work; scheduling is the user's
 * decision.
 *
 * The state lives in the session: each notice records the window it
 * announced (`source.peakWindow`, the window's UTC+8 date), and a step
 * reminds when the request-visible history (`session.deriveMessages()`)
 * holds no notice for the current window. A session that starts inside the
 * window, or whose previous step was before it, is told once; a resumed
 * session is not told again; a compaction that drops the notice makes the
 * next GLM step in the same window repeat it, because the model no longer
 * sees it. Not a ZCode text (ZCode has no local peak window, docs/FACTS.md
 * §1), so it lives outside the mirror files.
 */
import { createUserNotice, type AgentLike, type DerivedMessage } from '../shared/dsh-min.ts'
import { peakWindowAt } from '../shared/credits.ts'
import { wrapSystemReminder } from '../toolsearch/zcode-text.ts'
import { installStepNotice } from './step-notice.ts'

/** Source kind of the persisted reminder notice. */
export const PEAK_REMINDER_SOURCE = 'glm-peak-reminder'

/** The reminder body (docs/ORCHESTRATION.md §11.4). */
export const PEAK_REMINDER_TEXT = 'Peak hours have started (weekdays 14:00-18:00 UTC+8). Until 18:00, GLM usage is charged at the full credit rate; outside peak hours it costs half. This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.'

/** The peak window to announce at `now` (epoch milliseconds): undefined off-peak or when the history already holds its notice. */
export function peakWindowToAnnounce(history: readonly DerivedMessage[], now: number): string | undefined {
  const window = peakWindowAt(now)
  if (window === undefined) return undefined
  const announced = history.some(message => message.role === 'user' && message.source?.kind === PEAK_REMINDER_SOURCE && message.source.peakWindow === window)
  return announced ? undefined : window
}

/**
 * Install the reminder on one agent (src/glm-prompt/step-notice.ts, the seam
 * of the todo reminder and the tool-search announcement): when `eligible()`
 * says this step is GLM-routed, the notice is appended after the step's
 * admitted messages. `now` reads the wall clock (injectable for tests).
 * Returns undefined, installing nothing, when the agent has no session
 * history to read the state from.
 */
export function installPeakReminder(agent: AgentLike, eligible: () => boolean, now: () => number): (() => void) | undefined {
  return installStepNotice(agent, 'peak reminder', eligible, (history) => {
    const window = peakWindowToAnnounce(history, now())
    return window === undefined ? undefined : createUserNotice(PEAK_REMINDER_SOURCE, `peak hours ${window}`, wrapSystemReminder(PEAK_REMINDER_TEXT), { peakWindow: window })
  })
}
