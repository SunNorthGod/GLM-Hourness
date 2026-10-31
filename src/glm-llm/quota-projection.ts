/**
 * When a quota window runs out, from the readings of the server
 * (docs/DESIGN.md §4.7). A pure function: the window's latest share, the
 * earlier readings of the same period, and the share of the full rate each
 * instant is charged at (`rateShareAt`, src/glm-llm/credits.ts), so the
 * plan's hours stay in that one file.
 *
 * The speed is counted in percentage points per full-price hour: an hour at
 * half price counts as half an hour, because off-peak consumption is taken
 * from the quota at half (docs/FACTS.md §2.4; an inference, V5). The speed
 * comes from the last two readings when they are 10 to 90 minutes apart,
 * else from the average since the window began (five-hour and weekly
 * windows only).
 */
import type { QuotaBasis, QuotaProjection, QuotaWindowName } from '../shared/quota.ts'

/** An earlier reading of one window. */
export interface WindowPoint {
  readonly at: number
  readonly usedPercent: number
}

export interface WindowState {
  readonly name: QuotaWindowName
  readonly usedPercent?: number
  readonly resetAt?: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** Two readings are of the same period of a window when the reset times differ by no more than this. */
const SAME_PERIOD_MS = 120_000
/** The two readings of a recent speed are this far apart: at least, at most. */
const RECENT_MIN_MS = 10 * MINUTE_MS
const RECENT_MAX_MS = 90 * MINUTE_MS
const WINDOW_LENGTH_MS = { 'five-hour': 5 * HOUR_MS, weekly: 7 * DAY_MS } as const
/** Without a reset time the search for the exhaustion stops here. */
const NO_RESET_HORIZON_MS = 7 * DAY_MS

const none = (reason: string): QuotaProjection => ({ kind: 'none', reason })

/** Whether two readings are of the same period of the same window: the name and the reset time agree (an unnamed window needs a reset time to be told from the others). */
export function samePeriod(a: WindowState, b: WindowState): boolean {
  if (a.name !== b.name) return false
  if (a.resetAt === undefined || b.resetAt === undefined) return a.resetAt === b.resetAt && a.name !== 'window' && a.name !== 'other'
  return Math.abs(a.resetAt - b.resetAt) <= SAME_PERIOD_MS
}

/** The full-price hours in `[from, to)`: each whole minute counts its share of an hour, the ends in proportion. */
function fullPriceHours(share: (ms: number) => number, from: number, to: number): number {
  let hours = 0
  for (let start = from; start < to;) {
    const next = Math.min(to, (Math.floor(start / MINUTE_MS) + 1) * MINUTE_MS)
    hours += share(start) * (next - start) / HOUR_MS
    start = next
  }
  return hours
}

/** The speed and what it stands on, or why there is none. */
function speedOf(state: WindowState & { readonly usedPercent: number }, at: number, earlier: readonly WindowPoint[], share: (ms: number) => number): { readonly speed: number, readonly basis: QuotaBasis } | string {
  const reference = earlier
    .filter(point => at - point.at >= RECENT_MIN_MS && at - point.at <= RECENT_MAX_MS)
    .reduce<WindowPoint | undefined>((first, point) => (first === undefined || point.at < first.at ? point : first), undefined)
  // A share that fell between the two readings means the window was reset in between.
  if (reference !== undefined && state.usedPercent >= reference.usedPercent) {
    return { speed: (state.usedPercent - reference.usedPercent) / fullPriceHours(share, reference.at, at), basis: { kind: 'recent', from: reference.at, to: at } }
  }
  if ((state.name === 'five-hour' || state.name === 'weekly') && state.resetAt !== undefined) {
    const since = state.resetAt - WINDOW_LENGTH_MS[state.name]
    if (since < at && state.usedPercent > 0) {
      return { speed: state.usedPercent / fullPriceHours(share, since, at), basis: { kind: 'window', since, includesNights: state.name === 'weekly' } }
    }
  }
  if (state.usedPercent === 0) return '本窗口还没有消耗'
  if (state.resetAt === undefined) return '没有重置时刻'
  return '读数不足'
}

/**
 * The projection of one window read at `at`. `earlier` holds the earlier
 * readings of the same period (see `samePeriod`). The MCP window and the
 * windows of a type this package does not know are not projected.
 */
export function projectWindow(state: WindowState, at: number, earlier: readonly WindowPoint[], share: (ms: number) => number): QuotaProjection {
  if (state.name === 'mcp' || state.name === 'other') return none('')
  if (state.usedPercent === undefined) return none('没有已用比例')
  if (state.usedPercent >= 100) return { kind: 'spent' }
  if (state.resetAt !== undefined && state.resetAt <= at) return none('即将重置')
  const found = speedOf({ ...state, usedPercent: state.usedPercent }, at, earlier, share)
  if (typeof found === 'string') return none(found)
  const { speed, basis } = found
  if (speed <= 0) return { kind: 'idle', basis }
  const end = state.resetAt ?? at + NO_RESET_HORIZON_MS
  let percent = state.usedPercent
  for (let start = at; start < end;) {
    const next = Math.min(end, (Math.floor(start / MINUTE_MS) + 1) * MINUTE_MS)
    const rate = speed * share(start) / HOUR_MS
    const gained = rate * (next - start)
    if (percent + gained >= 100) {
      // The minute the share reaches 100, rounded to the millisecond first so the float noise of the sum cannot move a crossing at a minute's edge.
      const crossing = Math.round(start + (100 - percent) / rate)
      return { kind: 'exhausts', at: Math.floor(crossing / MINUTE_MS) * MINUTE_MS, basis }
    }
    percent += gained
    start = next
  }
  return state.resetAt === undefined ? none('7 天内用不完') : { kind: 'at-reset', percent: Math.round(percent), basis }
}
