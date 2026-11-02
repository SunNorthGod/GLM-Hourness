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
  /** The call was a deferral that no ticket could be recorded for (the write failed): the agent is told to run it again itself. */
  readonly unrecorded?: true
  /** The call came from a `run_code` program, which received the refusal as an error. */
  readonly nested?: true
  /** The call came from a subagent: it reports the ticket in its handoff, and the agent that dispatched it is told when it clears. */
  readonly subagent?: true
  /** What the stop level did with the goal of the session the ticket holds: `paused`, or `not-paused` when the pause was refused. Absent when there was no goal. */
  readonly goal?: 'paused' | 'not-paused'
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
  if (input.effect === 'queue') parts.push(input.ticket !== undefined ? `Deferred as ticket ${input.ticket}.` : input.unrecorded === true ? 'Deferred, but the board could not record a waiting ticket for it.' : 'Would be deferred; the command line opens no ticket.')
  if (codeEntries.length > 0) parts.push(`GLM peak hours now${input.peak.until === undefined ? '' : ` until ${localClock(input.peak.until)}`}.`, modeSentence(input.peak))
  parts.push(...input.rules.map(entry => clauseOf(entry, input.effect)))
  if (input.nested === true) parts.push('Your program received this as an error.')
  return parts.join(' ')
}

function rightPathOf(input: DenialInput, onlyCode: boolean): string {
  if (input.effect === 'block') return 'Do not repeat the call. Continue with other planned work, or tell the human what you need and why.'
  if (input.unrecorded === true) return 'The call did not run, and no message will come when the rule stops holding: run the call again yourself once it does not.'
  if (input.ticket === undefined && onlyCode) return `Run it again after ${input.peak.until === undefined ? 'peak ends' : localClock(input.peak.until)}.`
  if (input.ticket !== undefined && input.subagent === true) {
    return `${input.nested === true ? 'The call did not run; your program received this as an error.' : 'The call did not run.'} If your task cannot finish without this call, stop and report ticket ${input.ticket} in your handoff; the agent that dispatched you is told when it clears. Otherwise continue with the rest of your task.`
  }
  if (input.ticket !== undefined && input.nested === true) {
    return `The call did not run. Continue with other planned work, in this program or the next one; the harness sends you a message when ${input.ticket} clears, then run the deferred call again. Running it again before that returns this message and does not queue it twice.`
  }
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

/** The refusal of a call that would need a ticket beyond the 20 a session may have open: no ticket is opened. */
export function ticketLimitText(attempt: string, open: readonly string[]): string {
  return renderCorrection({
    fact: attempt,
    violation: `Too many open waiting tickets: this session already has ${open.length} (${open.join(', ')}), the most it may have.`,
    rightPath: 'The call did not run and no ticket was opened. Deal with the open ones first: wait for the message that says one of them cleared, or tell the human.',
    exception: 'The human can cancel tickets (/rules cancel <ticket>) or change the rules.',
  })
}

/**
 * The refusal of the stop level for a call that got a ticket (design §6.4):
 * to a GLM subagent, which is told to stop and report the ticket, and to the
 * agent that dispatches one, which is told it is not held. Undefined for any
 * other refusal.
 */
function stopText(input: DenialInput): string | undefined {
  const [only, ...more] = input.rules
  if (input.effect !== 'queue' || input.ticket === undefined || only === undefined || more.length > 0) return undefined
  const id = only.rule.id
  if (id !== 'builtin:glm-peak-stop' && id !== 'builtin:glm-peak-stop-dispatch') return undefined
  const ticket = input.ticket
  const until = input.peak.until === undefined ? undefined : localClock(input.peak.until)
  const now = `GLM peak hours now${until === undefined ? '' : ` until ${until}`}, and the human chose "stop" for peak hours:`
  const nested = input.nested === true ? ' Your program received this as an error.' : ''
  if (id === 'builtin:glm-peak-stop-dispatch') {
    return renderCorrection({
      fact: input.attempt,
      violation: `Deferred as ticket ${ticket}. ${now} no GLM subagents until then. You are not held: keep answering the human and doing other work.${nested}`,
      rightPath: `The dispatch did not run. Do other planned work, or dispatch this task with a non-GLM model if that fits; ${until === undefined ? 'when peak ends' : `at ${until}`} the harness tells you that you can dispatch it again.`,
      exception: `The human can let this one dispatch through now (/rules let ${ticket}), or change the peak mode (/rules peak).`,
    })
  }
  const goal = input.goal === 'paused' ? ' Your goal is paused.' : input.goal === 'not-paused' ? ' Your goal could not be paused; end your turn anyway.' : ''
  return renderCorrection({
    fact: input.attempt,
    violation: `Deferred as ticket ${ticket}. ${now} GLM subagents do no work until then.${goal}${nested}`,
    rightPath: `The call did not run. Stop and report ticket ${ticket} and where you stopped in your handoff; the agent that dispatched you is told ${until === undefined ? 'when peak ends' : `at ${until}`} and can dispatch the work again. Other tool calls before then return this message.`,
    exception: `The human can let this session work through this peak (/rules let ${ticket}), or change the peak mode (/rules peak).`,
  })
}

/** The refusal a model reads: what it tried, the boundary that stopped it, the right path, and who can change it. */
export function denialText(input: DenialInput): string {
  const stop = stopText(input)
  if (stop !== undefined) return stop
  const codeEntries = input.rules.filter(entry => entry.rule.scope === 'builtin')
  const personEntries = input.rules.filter(entry => entry.rule.scope !== 'builtin')
  return renderCorrection({
    fact: input.attempt,
    violation: boundaryOf(input, codeEntries),
    rightPath: rightPathOf(input, personEntries.length === 0),
    exception: exceptionOf(input, personEntries, codeEntries),
  })
}
