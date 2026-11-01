/**
 * The rules board's judgement (docs/ORCHESTRATION.md §16, design §2.3, §2.4,
 * §6.2, §6.7): which rules apply to a call, what the strongest of them
 * makes of it, and what a script that is not approved here comes to. Pure:
 * the input carries the moment, the signals and the events of the call, and
 * the tool-call gate and `checkCall` build that input with the same
 * function (judgeInput), so they cannot disagree.
 *
 * There is no rule that allows: every rule can only make a call stricter, so
 * adding one never loosens a verdict and the rules need no order. A rule
 * applies when one of its events happened, its filter holds for that event's
 * payload, and its condition holds (a condition that cannot be read leaves the
 * rule off unless the rule says `onUnknown: 'apply'`). A rule whose filter
 * asks about a field the call cannot tell (role, model, session, target
 * model) does not apply, and the result says which field and why.
 */
import { matchesFilter, validateScriptAction, type ScriptAction, type ScriptRef } from '../loops/trigger.ts'
import { RULES_TOOL_NAMES } from '../shared/tool-names.ts'
import { RULES_EVENT_TABLE, type RulesEvent, type RulesEventRecord } from './events.ts'
import { effectOf, type BuiltinRule, type Condition, type Effect, type Rule } from './model.ts'
import type { SignalReading } from './signals.ts'

/** A condition holds, does not hold, or cannot be told. */
export type Truth = 'true' | 'false' | 'unknown'

/** The fields of a call that say who acts; when a call cannot tell one, a rule that asks about it does not apply. */
type SubjectItem = 'role' | 'model' | 'session' | 'targetModel'

/** The stage of the calling session's focused goal, or why it is not known. */
type StageReading = { readonly stage: string } | { readonly unknown: string }

export interface JudgeInput {
  /** The moment of the judgement: the clock conditions and the lifetimes read it. */
  readonly now: Date
  readonly project: string
  /** The events the call pushed (events.ts gateEvents), or one `rules.step`. */
  readonly events: readonly RulesEventRecord[]
  readonly signals: Readonly<Record<string, SignalReading>>
  readonly stage: StageReading
  /** Why each subject field cannot be read, for the case it cannot. */
  readonly unreadable: Readonly<Record<SubjectItem, string>>
}

export interface JudgeParts {
  readonly now: Date
  readonly project: string
  readonly events: readonly RulesEventRecord[]
  readonly signals: readonly SignalReading[]
  /** Absent: the call has no focused goal. */
  readonly stage?: StageReading
  /** Reasons the caller knows better than the default (the command line was not given `--role`; the session has no request header yet). */
  readonly unreadable?: Partial<Record<SubjectItem, string>>
}

/** The one place the input of a judgement is made from what a caller has. */
export function judgeInput(parts: JudgeParts): JudgeInput {
  const why = (item: SubjectItem): string => parts.unreadable?.[item] ?? `the ${item} of this call is not known`
  return {
    now: parts.now,
    project: parts.project,
    events: parts.events,
    signals: Object.fromEntries(parts.signals.map(reading => [reading.name, reading])),
    stage: parts.stage ?? { unknown: 'the call has no focused goal' },
    unreadable: { role: why('role'), model: why('model'), session: why('session'), targetModel: why('targetModel') },
  }
}

// -------------------------------------------------------------- conditions

function signalTruth(condition: Extract<Condition, { readonly signal: string }>, input: JudgeInput): Truth {
  const reading = input.signals[condition.signal]
  const value = reading?.value
  if ('known' in condition) return value === undefined ? 'false' : 'true'
  if (value === undefined) return 'unknown'
  if ('is' in condition) return value === condition.is ? 'true' : 'false'
  if ('in' in condition) return condition.in.includes(value) ? 'true' : 'false'
  if (typeof value !== 'number') return 'unknown'
  return ('above' in condition ? value > condition.above : value < condition.below) ? 'true' : 'false'
}

const MINUTE_MS = 60_000

function clockTruth(clock: Extract<Condition, { readonly clock: unknown }>['clock'], now: Date): Truth {
  const zone = /^([+-])(\d{2}):(\d{2})$/.exec(clock.tz ?? 'local')
  const offset = zone === null ? -now.getTimezoneOffset() : (zone[1] === '-' ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3]))
  const wall = new Date(now.getTime() + offset * MINUTE_MS)
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes()
  const [from, to] = [clock.from, clock.to].map(time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))) as [number, number]
  const across = to < from
  const inside = across ? minutes >= from || minutes < to : minutes >= from && minutes < to
  if (!inside) return 'false'
  if (clock.days === undefined) return 'true'
  // A window across midnight belongs to the day it began: after midnight that is yesterday.
  const today = wall.getUTCDay() === 0 ? 7 : wall.getUTCDay()
  const began = across && minutes < to ? (today === 1 ? 7 : today - 1) : today
  return clock.days.includes(began) ? 'true' : 'false'
}

/** `no` wins over `unknown` for all, `yes` over `unknown` for any, and `not` keeps `unknown`. */
export function evaluateCondition(condition: Condition, input: JudgeInput): Truth {
  if ('signal' in condition) return signalTruth(condition, input)
  if ('clock' in condition) return clockTruth(condition.clock, input.now)
  if ('stage' in condition) return 'stage' in input.stage ? (condition.stage.includes(input.stage.stage) ? 'true' : 'false') : 'unknown'
  if ('not' in condition) {
    const inner = evaluateCondition(condition.not, input)
    return inner === 'unknown' ? 'unknown' : (inner === 'true' ? 'false' : 'true')
  }
  const [decisive, other]: [Truth, Truth] = 'all' in condition ? ['false', 'true'] : ['true', 'false']
  const items = 'all' in condition ? condition.all : condition.any
  const results = items.map(item => evaluateCondition(item, input))
  if (results.includes(decisive)) return decisive
  return results.includes('unknown') ? 'unknown' : other
}

// ----------------------------------------------------------------- verdict

/** A rule that applied to the call, and what it makes of it. */
export interface RuleHit {
  readonly rule: string
  readonly title: string
  readonly effect: Effect
  /** The entry queues with one ticket for the whole session (signature `any:<rule>`). */
  readonly ticketPerSession?: true
  /** Why, when the effect did not come from the rule's own action (a script that was not run). */
  readonly reason?: string
}

export interface Verdict {
  /** The strongest effect of the hits, or `allow` when none applied. */
  readonly effect: Effect | 'allow'
  /** Strongest first, equals by id. */
  readonly hits: readonly RuleHit[]
  /** The hits that have the strongest effect: the ones a refusal lists. */
  readonly strongest: readonly RuleHit[]
}

const STRENGTH: Readonly<Record<Effect, number>> = { block: 4, queue: 3, record: 2, inform: 1 }
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Block over queue over record over inform; the hits of the strongest effect are listed by id. The result of a script is combined with the rules' own the same way. */
export function combine(hits: readonly RuleHit[]): Verdict {
  const ordered = [...hits].sort((a, b) => STRENGTH[b.effect] - STRENGTH[a.effect] || compare(a.rule, b.rule))
  const top = ordered[0]
  if (top === undefined) return { effect: 'allow', hits: [], strongest: [] }
  return { effect: top.effect, hits: ordered, strongest: ordered.filter(hit => hit.effect === top.effect) }
}

/** A script to run for the call: the rule's, its timing for a gating event, and the event it ran for. */
interface PendingScript {
  readonly rule: string
  readonly event: RulesEvent
  readonly script: ScriptRef
  readonly timeoutSeconds: number
  readonly onError: 'allow' | 'block'
}

/** A script that was not run, and what the rule's failure setting makes of that. */
interface RefusedScript {
  readonly rule: string
  readonly event: RulesEvent
  readonly onError: 'allow' | 'block'
  readonly reason: string
}

export interface JudgeResult extends Verdict {
  /** Approved scripts of applying rules, to be run unless a rule already blocks the call. */
  readonly pending: readonly PendingScript[]
  readonly refused: readonly RefusedScript[]
  /** The condition of every rule that listens to an event of the call and passes its filter. */
  readonly evaluated: readonly { readonly rule: string, readonly when: Truth }[]
  /** Rules that did not apply because a field they ask about is unreadable. */
  readonly subjects: readonly { readonly rule: string, readonly item: SubjectItem, readonly unknown: string }[]
}

export interface JudgeOptions {
  /** Ids of the rules whose script a person approved on this machine (the hash pinned at approval). A script of any other rule is not run. */
  readonly approved?: ReadonlySet<string>
}

const SUBJECT_ITEMS: readonly SubjectItem[] = ['role', 'model', 'session', 'targetModel']

/** A script failing leaves a gating call through unless the entry, or the event it ran for, says to block. */
const ON_ERROR_DEFAULT = 'allow'

/** Whether a rule's own time is up: its expiry has passed, or the condition it was to last until holds. */
export function ended(rule: Rule | BuiltinRule, input: JudgeInput): boolean {
  const life = rule.lifetime
  if (life.kind === 'ttl') return Date.parse(life.expiresAt) <= input.now.getTime()
  return life.kind === 'until' && evaluateCondition(life.condition, input) === 'true'
}

/** The subject fields a rule's filter asks about and the event's payload lacks (a target model of an empty string is lacking too). */
function unreadableItems(rule: Rule | BuiltinRule, record: RulesEventRecord): readonly SubjectItem[] {
  return SUBJECT_ITEMS.filter(item => rule.filter?.[item] !== undefined && (record.payload[item] === undefined || record.payload[item] === ''))
}

function hitOf(rule: Rule | BuiltinRule, effect: Effect, reason?: string): RuleHit {
  return { rule: rule.id, title: rule.title, effect, ...('ticketPerSession' in rule && rule.ticketPerSession === true ? { ticketPerSession: true as const } : {}), ...(reason === undefined ? {} : { reason }) }
}

/** What a rule's script comes to when it is not run: the failure setting, per event the rule listens to, the blocking one first. */
function refusal(ruleId: string, action: ScriptAction, events: readonly RulesEvent[], why: string): RefusedScript {
  const perEvent = events.map(event => ({ event, onError: action.onError ?? RULES_EVENT_TABLE.get(event)?.gateOnErrorDefault ?? ON_ERROR_DEFAULT }))
  const chosen = perEvent.find(entry => entry.onError === 'block') ?? perEvent[0]
  const onError = chosen?.onError ?? ON_ERROR_DEFAULT
  const outcome = onError === 'block' ? 'The rule\'s failure setting blocks the call.' : 'The rule\'s failure setting lets the call through.'
  return { rule: ruleId, event: chosen?.event ?? events[0] ?? 'gate.tool-call', onError, reason: `The script of rule ${ruleId} ${why}, so it was not run. ${outcome}` }
}

/**
 * Judges one call (or one step) against the rules in force: the person's
 * rules plus the code's entries the peak level enables. A script is run by
 * the caller, not here: an approved one is handed back as `pending` (and not
 * at all when a rule's own action already blocks the call), one that is not
 * approved on this machine, or whose stored timing is out of range, is
 * judged by its failure setting and listed as `refused`.
 */
export function judge(input: JudgeInput, rules: readonly (Rule | BuiltinRule)[], options: JudgeOptions = {}): JudgeResult {
  const hits: RuleHit[] = []
  const pending: PendingScript[] = []
  const refused: RefusedScript[] = []
  const evaluated: Array<{ rule: string, when: Truth }> = []
  const subjects: Array<{ rule: string, item: SubjectItem, unknown: string }> = []
  for (const rule of rules) {
    if (('status' in rule && rule.status !== 'active') || ended(rule, input)) continue
    const matched: RulesEvent[] = []
    for (const record of input.events) {
      if (!(rule.when.events as readonly string[]).includes(record.event)) continue
      if ('sessionId' in rule && rule.scope === 'session' && record.payload.session !== rule.sessionId) continue
      const missing = unreadableItems(rule, record)
      for (const item of missing) {
        if (!subjects.some(entry => entry.rule === rule.id && entry.item === item)) subjects.push({ rule: rule.id, item, unknown: input.unreadable[item] })
      }
      if (missing.length > 0 || !matchesFilter(rule.filter, record.payload, input.project)) continue
      if ('ticketPerSession' in rule && rule.ticketPerSession === true && typeof record.payload.tool === 'string' && RULES_TOOL_NAMES.includes(record.payload.tool)) continue
      matched.push(record.event)
    }
    if (matched.length === 0) continue
    const when = rule.condition === undefined ? 'true' : evaluateCondition(rule.condition, input)
    evaluated.push({ rule: rule.id, when })
    if (when === 'false' || (when === 'unknown' && rule.onUnknown !== 'apply')) continue
    const effect = effectOf(rule.action)
    if (effect !== undefined) {
      hits.push(hitOf(rule, effect))
      continue
    }
    if (rule.action.kind !== 'script') continue
    const script = rule.action
    const timings = matched.map((event) => {
      const fallback = RULES_EVENT_TABLE.get(event)?.gateOnErrorDefault
      return { event, timing: validateScriptAction(script, { purpose: 'gate', ...(fallback === undefined ? {} : { gateOnErrorDefault: fallback }) }) }
    })
    const unsound = timings.some(entry => !entry.timing.ok)
    const unapproved = options.approved?.has(rule.id) !== true
    if (unapproved || unsound) {
      const result = refusal(rule.id, script, matched, unapproved ? 'is not approved on this machine' : 'has timing settings that are out of range')
      refused.push(result)
      if (result.onError === 'block') hits.push(hitOf(rule, 'block', result.reason))
      continue
    }
    const chosen = timings.find(entry => entry.timing.ok && entry.timing.timing.onError === 'block') ?? timings[0]
    if (chosen === undefined || !chosen.timing.ok) continue
    pending.push({ rule: rule.id, event: chosen.event, script: script.script, timeoutSeconds: chosen.timing.timing.timeoutSeconds, onError: chosen.timing.timing.onError ?? ON_ERROR_DEFAULT })
  }
  const verdict = combine(hits)
  return { ...verdict, pending: verdict.effect === 'block' ? [] : pending, refused, evaluated, subjects }
}
