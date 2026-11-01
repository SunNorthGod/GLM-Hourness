/**
 * The words a rule refusal is told in (docs/ORCHESTRATION.md §16.10; design
 * §6.4, §9.4): the four parts of a guard correction (`renderCorrection`), for
 * a call a rule blocks and for a call a rule defers. The text is for the
 * model, so it is English. Pure: the moment in a sentence is the one that is
 * passed in, shown in the machine's time zone.
 *
 * A deferred call has a ticket in the gate. `checkCall` opens none, so it
 * says so (`Would be deferred; the command line opens no ticket.`), tells the
 * caller to run it again instead of waiting for a message, and names no
 * ticket in the exception; everything else is the same words.
 */
import { renderCorrection } from '../guard/rules.ts'
import type { RuleHit } from './judge.ts'
import type { BuiltinRule, Condition, PeakLevel, Rule } from './model.ts'

/** The peak level in force and where it comes from. */
export interface PeakSetting {
  readonly level: PeakLevel
  readonly origin: 'default' | 'human'
  /** When the person chose it; present when `origin` is `human`. */
  readonly at?: string
}

export interface DenialInput {
  /** What the agent tried (`You tried to run "..."`). */
  readonly attempt: string
  readonly effect: 'block' | 'queue'
  /** The strongest hits, by id, with the rule behind each. */
  readonly rules: ReadonlyArray<{ readonly hit: RuleHit, readonly rule: Rule | BuiltinRule }>
  /** The ticket the call was deferred as; absent when none was opened. */
  readonly ticket?: string
  readonly peak: PeakSetting & { readonly until?: string }
}

/** `YYYY-MM-DD HH:MM` in the time zone of this machine; a text that is not a time is returned as it is. */
export function localMinute(iso: string): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return iso
  // The wall clock of this machine at that moment, written out by the ISO form of the same moment shifted by the offset.
  return new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16).replace('T', ' ')
}

/** `HH:MM` in the time zone of this machine. */
export function localClock(iso: string): string {
  const minute = localMinute(iso)
  return minute === iso ? iso : minute.slice(11)
}

// ------------------------------------------------------------------ phrases

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function clockPhrase(clock: Extract<Condition, { readonly clock: unknown }>['clock'], outside: boolean): string {
  const days = clock.days === undefined ? '' : ` on ${clock.days.map(day => DAY_NAMES[day - 1] ?? String(day)).join(', ')}`
  return `the clock is ${outside ? 'outside' : 'within'} ${clock.from}-${clock.to} ${clock.tz ?? 'local time'}${days}`
}

function signalPhrase(condition: Extract<Condition, { readonly signal: string }>): string {
  const name = condition.signal
  if ('known' in condition) return `${name} has a value`
  if ('is' in condition) return `${name} is ${typeof condition.is === 'boolean' ? (condition.is ? 'on' : 'off') : String(condition.is)}`
  if ('in' in condition) return `${name} is one of ${condition.in.join(', ')}`
  if ('above' in condition) return `${name} is above ${condition.above}`
  return `${name} is below ${condition.below}`
}

/** A condition as a plain statement: `code-freeze is on`, `the clock is outside 09:00-21:00 +08:00`. */
export function conditionPhrase(condition: Condition): string {
  if ('signal' in condition) return signalPhrase(condition)
  if ('clock' in condition) return clockPhrase(condition.clock, false)
  if ('stage' in condition) return `the goal stage is ${condition.stage.join(' or ')}`
  if ('not' in condition) return 'clock' in condition.not ? clockPhrase(condition.not.clock, true) : `it is not so that ${conditionPhrase(condition.not)}`
  const [items, joiner] = 'all' in condition ? [condition.all, ' and '] as const : [condition.any, ' or '] as const
  return items.length === 1 ? conditionPhrase(items[0]) : items.map(item => `(${conditionPhrase(item)})`).join(joiner)
}

function lifetimePhrase(rule: Rule): string {
  const life = rule.lifetime
  switch (life.kind) {
    case 'until-lifted': return 'until lifted'
    case 'ttl': return `until ${localMinute(life.expiresAt)}`
    case 'until': return `until ${conditionPhrase(life.condition)}`
    case 'session': return 'for this session'
  }
}

/** Who set a rule, when, and for how long: `set by the human at 2026-10-29 21:05, until lifted`. */
export function setByPhrase(rule: Rule): string {
  const who = rule.origin.actor === 'human' ? 'the human' : 'an agent, with the human\'s agreement'
  return `set by ${who} at ${localMinute(rule.origin.at)}, ${lifetimePhrase(rule)}`
}

/** What the entries of the code defer, in the words after `defers`. */
const DEFERS = new Map<string, string>([
  ['builtin:glm-peak-reduce', 'scripts that report optional GLM spending until peak ends'],
  ['builtin:glm-peak-stop', 'every tool call of a GLM subagent until peak ends'],
  ['builtin:glm-peak-stop-dispatch', 'dispatching a GLM subagent until peak ends'],
  ['builtin:glm-peak-stop-scripts', 'scripts that report GLM spending until peak ends'],
])

/** What a code entry defers, or undefined for an entry that defers nothing. */
export function builtinDeferral(id: string): string | undefined {
  return DEFERS.get(id)
}

/** The peak mode as a sentence: where it comes from, and which level. */
export function modeSentence(peak: PeakSetting): string {
  if (peak.origin === 'default') return `Peak mode: ${peak.level} (the default; the human can change it).`
  return peak.at === undefined ? `Peak mode set by the human: ${peak.level}.` : `Peak mode set by the human at ${localMinute(peak.at)}: ${peak.level}.`
}

// ------------------------------------------------------------------- the text

type Entry = DenialInput['rules'][number]

function clauseOf(entry: Entry, effect: 'block' | 'queue'): string {
  const { rule, hit } = entry
  if (rule.scope === 'builtin') return `Rule ${rule.id} defers ${builtinDeferral(rule.id) ?? 'it'}.`
  const head = `Rule ${rule.id} "${rule.title}" (${setByPhrase(rule)})`
  const reason = hit.reason === undefined ? '' : ` ${hit.reason}`
  if (effect === 'block') return `${head} blocks it now${rule.condition === undefined ? '' : `: ${conditionPhrase(rule.condition)}`}.${reason}`
  return `${head} defers it${rule.condition === undefined ? '' : ` while ${conditionPhrase(rule.condition)}`}.${reason}`
}

function boundaryOf(input: DenialInput, codeEntries: readonly Entry[]): string {
  const parts: string[] = []
  if (input.effect === 'queue') parts.push(input.ticket === undefined ? 'Would be deferred; the command line opens no ticket.' : `Deferred as ticket ${input.ticket}.`)
  if (codeEntries.length > 0) parts.push(`GLM peak hours now${input.peak.until === undefined ? '' : ` until ${localClock(input.peak.until)}`}.`, modeSentence(input.peak))
  parts.push(...input.rules.map(entry => clauseOf(entry, input.effect)))
  return parts.join(' ')
}

function rightPathOf(input: DenialInput, onlyCode: boolean): string {
  if (input.effect === 'block') return 'Do not repeat the call. Continue with other planned work, or tell the human what you need and why.'
  if (input.ticket === undefined && onlyCode) return `Run it again after ${input.peak.until === undefined ? 'peak ends' : localClock(input.peak.until)}.`
  const next = input.ticket === undefined ? 'Run it again when the condition no longer holds.' : `the harness sends you a message when ${input.ticket} clears, then run the same call again.`
  return `The call did not run. Continue with other planned work; ${next} Running it again before that returns this message and does not queue it twice.`
}

function exceptionOf(input: DenialInput, personEntries: readonly Entry[], codeEntries: readonly Entry[]): string {
  const parts: string[] = []
  if (personEntries.length > 0) {
    if (input.effect === 'block') {
      const lifts = personEntries.map(entry => `/rules lift ${entry.rule.id}`).join(' or ')
      parts.push(`Only the human can change or lift rules (${lifts}). If the task really needs this now, tell the human what you need and why; you may propose a change with rules_propose, and it takes effect only when the human agrees.`)
    }
    else parts.push(input.ticket === undefined ? 'The human can change the rule.' : `The human can let it through once (/rules let ${input.ticket}), or change the rule.`)
  }
  if (codeEntries.length > 0) parts.push('The human can change the peak mode (/rules peak).')
  return parts.join(' ')
}

/** The refusal a model reads: what it tried, the boundary that stopped it, the right path, and who can change it. */
export function denialText(input: DenialInput): string {
  const codeEntries = input.rules.filter(entry => entry.rule.scope === 'builtin')
  const personEntries = input.rules.filter(entry => entry.rule.scope !== 'builtin')
  return renderCorrection({
    fact: input.attempt,
    violation: boundaryOf(input, codeEntries),
    rightPath: rightPathOf(input, personEntries.length === 0),
    exception: exceptionOf(input, personEntries, codeEntries),
  })
}
