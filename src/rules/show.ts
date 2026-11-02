/**
 * The text of the rules in force, the waiting calls and the signals
 * (docs/ORCHESTRATION.md §16.10; design §6.4 last paragraph, §9.4): what
 * `rules_show` tells an agent and what `npm run -s rules -- show` prints. One
 * formatter, so the tool and the command line say the same things the same
 * way. Pure: everything it prints is passed in. English, for the model.
 */
import { basename } from 'node:path'
import { pluginLabel } from '../shared/plugin-labels.ts'
import { BUILTIN_PLUGIN } from './builtin.ts'
import { builtinDeferral, conditionPhrase, localClock, localMinute, modeSentence, setByPhrase, type PeakSetting } from './denial.ts'
import type { BuiltinRule, Rule, Ticket } from './model.ts'
import type { SignalReading } from './signals.ts'

/** A rule in force, with what the reader should know about it besides its fields. */
export interface ShownRule {
  readonly rule: Rule | BuiltinRule
  readonly note?: string
}

export interface ShowInput {
  /** The project root. */
  readonly project: string
  readonly peak: PeakSetting
  /** The reading of `glm-peak`, from the caller, a heartbeat or nowhere. */
  readonly glmPeak: SignalReading
  /** When the peak in force ends. */
  readonly until?: string
  readonly rules: readonly ShownRule[]
  /** The waiting calls: tickets still open. */
  readonly tickets: readonly Ticket[]
  /** The signals of the project (switches and detectors' signals), `glm-peak` aside. */
  readonly signals: readonly SignalReading[]
  /** What the reader should know about how the state was read. */
  readonly notes: readonly string[]
}

const PRICING = 'builtin:glm-peak-pricing'

function glmPeakLine(reading: SignalReading, until: string | undefined): string {
  if (reading.value === undefined) return `GLM peak: unknown (${reading.unknown}).`
  const where = reading.source === 'heartbeat' && reading.host !== undefined
    ? ` (read from the heartbeat of host ${reading.host})`
    : reading.source === 'caller' ? ' (given by the caller)' : ''
  if (!reading.value) return `GLM peak: not now${where}.`
  return `GLM peak: now${until === undefined ? '' : `, until ${localClock(until)}`}${where}.`
}

/** What the default rule of GLM's prices says: in a peak, until when it holds; otherwise the plain statement. The GLM package's reminder tells the model; this rule only informs. */
function pricingText(glmPeak: SignalReading, until: string | undefined): string {
  const told = "The GLM package's peak reminder tells you this."
  return glmPeak.value === true && until !== undefined
    ? `GLM peak hours until ${localClock(until)}: GLM usage is charged at the full credit rate, half outside peak. ${told}`
    : `GLM usage is charged at the full credit rate in peak hours and half outside them. ${told}`
}

/** Said once under the rules, when any entry of the code is listed: where such an entry comes from and who can change what. */
const PROVENANCE = `Entries named builtin: come with the package ${pluginLabel(BUILTIN_PLUGIN)} (${BUILTIN_PLUGIN}) and cannot be changed by you; the human changes the peak mode with /rules peak.`

function ruleLine({ rule, note }: ShownRule, input: ShowInput): string {
  const what = rule.id === PRICING
    ? pricingText(input.glmPeak, input.until)
    : rule.scope === 'builtin'
      ? `Defers ${builtinDeferral(rule.id) ?? 'it'}.`
      : `${rule.title} (${setByPhrase(rule)}).`
  const applies = rule.condition === undefined || rule.id === PRICING ? '' : ` Applies while ${conditionPhrase(rule.condition)}.`
  return `- [${rule.action.kind}] ${rule.id}: ${what}${applies}${note === undefined ? '' : ` ${note}`}`
}

function ticketLine(ticket: Ticket): string {
  return `- ${ticket.id}: ${ticket.tool} "${ticket.summary}" is ${ticket.state} since ${localMinute(ticket.since)} by ${ticket.rules.length === 1 ? 'rule' : 'rules'} ${ticket.rules.join(', ')}.`
}

function signalLine(reading: SignalReading): string {
  if (reading.value === undefined) return `- ${reading.name}: unknown (${reading.unknown})`
  return `- ${reading.name}: ${typeof reading.value === 'boolean' ? (reading.value ? 'on' : 'off') : String(reading.value)} (source ${reading.source})`
}

/** A list with its heading, or `<heading> none.` when there is nothing to list. */
function section(heading: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [`${heading} none.`] : [heading, ...lines]
}

export function showText(input: ShowInput): string {
  return [
    `Rules board of ${basename(input.project)}.`,
    modeSentence(input.peak),
    glmPeakLine(input.glmPeak, input.until),
    ...section('Rules in force:', input.rules.map(entry => ruleLine(entry, input))),
    ...(input.rules.some(({ rule }) => rule.scope === 'builtin') ? [PROVENANCE] : []),
    ...section('Waiting calls:', input.tickets.map(ticketLine)),
    ...section('Signals:', input.signals.map(signalLine)),
    ...input.notes,
  ].join('\n')
}
