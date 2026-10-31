/**
 * The default loop-board entries a channel package hands to the orchestration
 * package (docs/ORCHESTRATION.md §11.4): data in the pricing service's
 * `loopDefaults` member. The loop board lists them and runs the ones marked
 * `loop-board`; it carries no word of any model's own, so what an entry says
 * and when it fires is the channel package's to declare.
 *
 * Types and a validator only; no Node built-in is imported, so both packages
 * and the client can use the file. An entry that breaks a rule is dropped and
 * reported to the reader's `problem` callback by its id, the others read.
 */
import { PRICING_SERVICE, type UsagePricing } from './pricing.ts'

export type ChannelTrigger =
  | { readonly kind: 'peak-start' }
  | { readonly kind: 'command', readonly names: readonly string[] }
  | { readonly kind: 'quota-low', readonly usedPercent: number, readonly exhaustsWithinMinutes: number, readonly afterUsageMinutes: number }
  | { readonly kind: 'login-rejected' }

export interface ChannelLoopDefault {
  /** `<channel>:<name>`, matching /^[a-z0-9-]{1,16}:[a-z0-9-]{1,48}$/ */
  readonly id: string
  /** For people, plain words, 1-60 code points. */
  readonly title: string
  /** For people, plain words, 1-150 code points. */
  readonly why: string
  readonly when: ChannelTrigger
  /** channel: the channel package runs it and the loop board only lists it; loop-board: the loop board runs it. */
  readonly runBy: 'channel' | 'loop-board'
  /** runBy loop-board only: the English notice to the main agent, 1-400 characters; `{line}` is replaced with quotaLowLine or loginLine. */
  readonly tell?: string
}

const ID_PATTERN = /^[a-z0-9-]{1,16}:[a-z0-9-]{1,48}$/
const MAX_ENTRIES = 16
const TITLE_MAX = 60
const WHY_MAX = 150
const TELL_MAX = 400
const COMMAND_NAMES_MAX = 8

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const codePoints = (text: string): number => Array.from(text).length

/** A finite number within `[min, max]`. */
const within = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** The trigger when `when` is a complete one of the four kinds; otherwise the reason it is not. */
function triggerOf(when: unknown): ChannelTrigger | string {
  if (!isRecord(when)) return 'when is not an object'
  switch (when.kind) {
    case 'peak-start':
      return { kind: 'peak-start' }
    case 'login-rejected':
      return { kind: 'login-rejected' }
    case 'command': {
      const names = when.names
      if (!Array.isArray(names) || names.length < 1 || names.length > COMMAND_NAMES_MAX) return `when.names must list 1-${COMMAND_NAMES_MAX} command names`
      if (!names.every((name): name is string => typeof name === 'string' && name.length > 0)) return 'when.names must be non-empty strings'
      return { kind: 'command', names: [...names] }
    }
    case 'quota-low': {
      const { usedPercent, exhaustsWithinMinutes, afterUsageMinutes } = when
      if (!within(usedPercent, 1, 100)) return 'when.usedPercent must be 1-100'
      if (!within(exhaustsWithinMinutes, 1, 1440)) return 'when.exhaustsWithinMinutes must be 1-1440'
      if (!within(afterUsageMinutes, 1, 1440)) return 'when.afterUsageMinutes must be 1-1440'
      return { kind: 'quota-low', usedPercent, exhaustsWithinMinutes, afterUsageMinutes }
    }
    default:
      return 'when.kind is not one of peak-start, command, quota-low, login-rejected'
  }
}

/** The entry when `item` follows every rule of the table in docs/ORCHESTRATION.md §11.4; otherwise the reason it does not. */
function itemOf(item: unknown, seen: ReadonlySet<string>): ChannelLoopDefault | string {
  if (!isRecord(item)) return 'it is not an object'
  const { id, title, why, runBy, tell } = item
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return 'id must match <channel>:<name> in lower case letters, digits and hyphens'
  if (seen.has(id)) return 'its id repeats an earlier entry'
  if (typeof title !== 'string' || codePoints(title) < 1 || codePoints(title) > TITLE_MAX) return `title must be 1-${TITLE_MAX} characters`
  if (typeof why !== 'string' || codePoints(why) < 1 || codePoints(why) > WHY_MAX) return `why must be 1-${WHY_MAX} characters`
  const when = triggerOf(item.when)
  if (typeof when === 'string') return when
  if (runBy === 'channel') return { id, title, why, when, runBy }
  if (runBy !== 'loop-board') return 'runBy must be channel or loop-board'
  if (typeof tell !== 'string' || tell.length < 1 || tell.length > TELL_MAX) return `tell must be 1-${TELL_MAX} characters for a loop-board entry`
  return { id, title, why, when, runBy, tell }
}

/**
 * The valid entries of a pricing service's `loopDefaults`, in order. The
 * member being absent reads as none without a report (an older channel
 * package); a value that is not an array reads as none with one. Past the
 * sixteenth the entries are dropped with one report; each other invalid
 * entry is dropped and reported once by its id (by its place when it has no
 * usable id). The entries returned are new objects with the known members
 * only, and a `tell` only on the entries the loop board runs.
 */
export function loopDefaultsOf(pricing: UsagePricing, problem?: (message: string) => void): readonly ChannelLoopDefault[] {
  const value: unknown = pricing.loopDefaults
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    problem?.(`${PRICING_SERVICE} loopDefaults is not an array; the channel's loop entries read as none`)
    return []
  }
  if (value.length > MAX_ENTRIES) problem?.(`${PRICING_SERVICE} loopDefaults has ${value.length} entries; only the first ${MAX_ENTRIES} are read`)
  const entries: ChannelLoopDefault[] = []
  const seen = new Set<string>()
  value.slice(0, MAX_ENTRIES).forEach((item: unknown, index) => {
    const entry = itemOf(item, seen)
    if (typeof entry === 'string') {
      const label = isRecord(item) && typeof item.id === 'string' ? `"${item.id}"` : `#${index + 1}`
      problem?.(`${PRICING_SERVICE} loopDefaults entry ${label} dropped: ${entry}`)
      return
    }
    seen.add(entry.id)
    entries.push(entry)
  })
  return entries
}
