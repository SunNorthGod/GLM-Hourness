/**
 * Probe clock (docs/DEVELOPMENT.md §3, ROADMAP M6.1): an overlay-only row
 * that moves the runtime's wall clock, `Date.now()`, by a constant offset so
 * that a scenario runs at the instant `config.at`; time keeps running from
 * there. The peak-hour reminder (src/glm-prompt/peak-reminder.ts) reads
 * `Date.now()`. `new Date()`, which the usage journal stamps with, and
 * timers keep the real clock. Not part of the bundle: loaded only through
 * the overlay that scripts/probe/run-probe.mjs generates.
 */
export const name = 'glm-hourness-probe/clock'

export function apply(_ctx, config = {}) {
  const real = Date.now
  const offset = Date.parse(config.at) - real()
  if (!Number.isFinite(offset)) throw new Error(`probe clock: invalid instant ${JSON.stringify(config.at)}`)
  Date.now = () => real() + offset
  return () => {
    Date.now = real
  }
}
