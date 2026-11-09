/**
 * The expected effect of a rule proposal (M5 design §3.6.1,
 * docs/ORCHESTRATION.md §8.5; node m5-rule-expected-effect, the person
 * 2026-11-05): a rule the main agent puts to the person says which count it
 * should move, which way, and after how many days the harness checks it. A
 * proposal to lift a rule names the rule that covers the same calls, or, when
 * none does, carries the result of a one-layer ablation that the person sees
 * before agreeing (reading digest 2026-11-05 A5, D3).
 *
 * The effect travels as the `rule` argument of propose_to_human and is kept
 * as the first lines of the question's body, in the fixed words below; this
 * file is the one place that writes and reads those words. Pure: the design
 * row checks the argument and writes the body, the learning digest reads the
 * body back, and the morning report gets the checks of the proposals whose
 * days are up (effectChecks, effectCheckLines).
 */
import { PLAIN_WORDS, plainWordsIn } from '../graph/plain-question.ts'
import { codePointCount } from '../graph/proposal.ts'
import type { GraphNode } from '../graph/schema.ts'
import { CATALOG } from '../rules/builtin.ts'
import { correctionSignals } from './signals.ts'

/** Limits of the effect, in code points and days. */
const EFFECT_LIMITS = { effect: 60, minDays: 7, maxDays: 56, ablation: 6000 } as const

export interface RuleEffect {
  /** `add`: a new rule or a stricter one; `lift`: a rule taken off. */
  readonly change: 'add' | 'lift'
  /** One line for the person: which count, which way. */
  readonly effect: string
  /** The count the harness checks: `corrections:<group key>` (the person's corrections of that kind on the graph) or `denials:<rule id>` (the denials of that rule in the metrics journal). */
  readonly metric: string
  readonly direction: 'down' | 'up'
  /** Days after the person agreed when the count is checked. */
  readonly days: number
  /** The rule taken off (`lift` only). */
  readonly lift?: string
  /** The rule that covers the same calls (`lift` only; this or `ablation`). */
  readonly cover?: string
  /** The result of switching off only the lifted rule, as the main agent was given it (`lift` only, when no rule covers the same calls). */
  readonly ablation?: string
}

export interface EffectRefusal {
  /** `rule` or `rule.<field>`. */
  readonly field: string
  readonly message: string
  readonly hint: string
}

const FIELDS: ReadonlySet<string> = new Set(['change', 'effect', 'metric', 'direction', 'days', 'lift', 'cover', 'ablation'])

/** The rule ids a metric, a lift and a cover may name: the code rules and the defaults of the rules catalog. */
const RULE_IDS: ReadonlySet<string> = new Set(CATALOG.map(entry => entry.id))

/** The kinds of correction the graph history holds (src/memory/signals.ts); `depth:*` lives in the user-level journal, not on the graph. */
const CORRECTION_KEY = /^(?:edit:[a-z]+\.[A-Za-z]+|reject:[a-z]+|reopen:[a-z]+|chat:(?:reject|add))$/

const EFFECT_HINT = 'pass rule {change, effect, metric, direction, days}: change add or lift; effect one line for the person saying which count moves which way; metric corrections:<group key from learning_signals> or denials:<rule id>; direction down or up; days 7 to 56'
const COVER_HINT = 'name in cover the rule that covers the same kind of calls; when no rule does, switch off only this rule, run the work it guards, and put the result in ablation: the person sees it before agreeing'

const refusal = (field: string, message: string, hint: string = EFFECT_HINT): EffectRefusal => ({ field, message, hint })

/** The parts of a metric: what is counted and the group key or rule id; undefined when it is neither form. */
function metricOf(metric: string): { readonly kind: 'corrections' | 'denials', readonly name: string } | undefined {
  const colon = metric.indexOf(':')
  const kind = metric.slice(0, colon)
  const name = metric.slice(colon + 1)
  if (kind === 'corrections' && CORRECTION_KEY.test(name)) return { kind, name }
  if (kind === 'denials' && RULE_IDS.has(name)) return { kind, name }
  return undefined
}

/** The rule argument of propose_to_human, checked field by field; the first thing wrong is refused with how to fix it. */
export function ruleEffectOf(raw: unknown): RuleEffect | EffectRefusal {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return refusal('rule', 'rule must be an object: the expected effect of the rule proposal')
  const value = raw as Record<string, unknown>
  const extra = Object.keys(value).find(key => !FIELDS.has(key))
  if (extra !== undefined) return refusal(`rule.${extra}`, `${extra} is not a field of rule`)
  const { change, effect, metric, direction, days, lift, cover, ablation } = value
  if (change !== 'add' && change !== 'lift') return refusal('rule.change', 'rule.change is required: add for a new or stricter rule, lift to take a rule off')
  if (typeof effect !== 'string' || effect.trim().length === 0) return refusal('rule.effect', 'rule.effect is required: the expected effect in one line for the person')
  if (/[\r\n]/.test(effect) || codePointCount(effect.trim()) > EFFECT_LIMITS.effect) return refusal('rule.effect', `rule.effect is one line of at most ${EFFECT_LIMITS.effect} characters`)
  const plain = plainWordsIn(effect)[0]
  if (plain !== undefined) return refusal('rule.effect', `rule.effect uses the word ${plain}, which the human has not learned`, `say ${PLAIN_WORDS.find(entry => entry.avoid.includes(plain))?.say ?? 'a plainer word'} instead of ${plain}`)
  if (effect.includes('·')) return refusal('rule.effect', 'rule.effect must not contain ·', 'write the effect as one plain sentence; the morning report uses · to set items apart')
  if (typeof metric !== 'string') return refusal('rule.metric', 'rule.metric is required: the count the harness checks when the days are up')
  if (metricOf(metric) === undefined) return refusal('rule.metric', `rule.metric "${metric}" is not a count the harness can check`, 'write corrections:<group key> with a key as learning_signals shows it (edit, reject, reopen or chat), or denials:<rule id> with an id the rules board lists')
  if (direction !== 'down' && direction !== 'up') return refusal('rule.direction', 'rule.direction is required: down or up, the way the count should move')
  if (typeof days !== 'number' || !Number.isInteger(days) || days < EFFECT_LIMITS.minDays || days > EFFECT_LIMITS.maxDays) return refusal('rule.days', `rule.days is required: a whole number of days from ${EFFECT_LIMITS.minDays} to ${EFFECT_LIMITS.maxDays} after the person agrees`)
  const base = { change, effect: effect.trim(), metric, direction, days } as const
  if (change === 'add') {
    for (const [field, given] of [['lift', lift], ['cover', cover], ['ablation', ablation]] as const) {
      if (given !== undefined) return refusal(`rule.${field}`, `rule.${field} belongs to change lift`, `leave ${field} out for a new rule`)
    }
    return base
  }
  if (typeof lift !== 'string' || !RULE_IDS.has(lift)) return refusal('rule.lift', 'rule.lift is required for change lift: the id of the rule taken off, as the rules board lists it', 'pass the rule id from rules_show or the rules page')
  if (cover !== undefined && ablation !== undefined) return refusal('rule.ablation', 'rule.cover and rule.ablation exclude each other', 'a rule that covers the same calls is enough; leave ablation out')
  if (cover === undefined && ablation === undefined) return refusal('rule.cover', `taking off ${lift} needs the rule that covers the same calls, or a one-layer ablation result when none does`, COVER_HINT)
  if (cover !== undefined) {
    if (typeof cover !== 'string' || !RULE_IDS.has(cover)) return refusal('rule.cover', 'rule.cover is the id of a rule the rules board lists', COVER_HINT)
    if (cover === lift) return refusal('rule.cover', 'rule.cover must be another rule than the one taken off', COVER_HINT)
    return { ...base, lift, cover }
  }
  if (typeof ablation !== 'string' || ablation.trim().length === 0 || codePointCount(ablation) > EFFECT_LIMITS.ablation) return refusal('rule.ablation', `rule.ablation is the one-layer ablation result, 1 to ${EFFECT_LIMITS.ablation} characters`, COVER_HINT)
  return { ...base, lift, ablation }
}

const isRefusal = (value: RuleEffect | EffectRefusal): value is EffectRefusal => 'hint' in value

const HEAD_ADD = '规则提议：新增'
const HEAD_LIFT = '规则提议：撤下 '
const EFFECT_LINE = '预期效果：'
const CHECK_LINE = '核对：'
const COVER_LINE = '替补：'
const NO_COVER = '替补：没有，附了单层消融的结果'
const WAY: Readonly<Record<RuleEffect['direction'], string>> = { down: '变少', up: '变多' }
const CHECK = /^核对：(\S+) (变少|变多)，同意后 (\d+) 天$/u

/** The first lines of the body of a question that carries a rule proposal: what the graph keeps, read back by effectOf. */
export function effectBlock(effect: RuleEffect): string {
  const lines = [
    effect.change === 'add' ? HEAD_ADD : `${HEAD_LIFT}${effect.lift}`,
    `${EFFECT_LINE}${effect.effect}`,
    `${CHECK_LINE}${effect.metric} ${WAY[effect.direction]}，同意后 ${effect.days} 天`,
  ]
  if (effect.change === 'lift') lines.push(effect.cover === undefined ? NO_COVER : `${COVER_LINE}${effect.cover}`)
  if (effect.ablation !== undefined) lines.push(effect.ablation)
  return lines.join('\n')
}

/** The body of a question: the effect block first, then what a board attached (its last line ties the question to the board's proposal). */
export function bodyWithEffect(effect: RuleEffect, attached: string | undefined): string {
  return attached === undefined ? effectBlock(effect) : `${effectBlock(effect)}\n\n${attached}`
}

/** The expected effect a question's body opens with; undefined when it opens with none or the lines do not read. */
export function effectOf(body: string | undefined): RuleEffect | undefined {
  if (body === undefined) return undefined
  const lines = body.split('\n')
  const head = lines[0] ?? ''
  const change = head === HEAD_ADD ? 'add' : head.startsWith(HEAD_LIFT) ? 'lift' : undefined
  if (change === undefined || !(lines[1] ?? '').startsWith(EFFECT_LINE)) return undefined
  const check = CHECK.exec(lines[2] ?? '')
  if (check === null) return undefined
  const raw: Record<string, unknown> = { change, effect: lines[1].slice(EFFECT_LINE.length), metric: check[1], direction: check[2] === '变少' ? 'down' : 'up', days: Number(check[3]) }
  if (change === 'lift') {
    raw.lift = head.slice(HEAD_LIFT.length)
    const cover = lines[3] ?? ''
    if (cover === NO_COVER) raw.ablation = lines.slice(4).join('\n')
    else if (cover.startsWith(COVER_LINE)) raw.cover = cover.slice(COVER_LINE.length)
  }
  const effect = ruleEffectOf(raw)
  return isRefusal(effect) ? undefined : effect
}

/**
 * What the person reads after the question: the expected effect and when it
 * is checked, and for a lift what covers the same calls; the ablation result
 * is not in it, it follows as the original text the person must see.
 */
export function effectShown(effect: RuleEffect): string {
  const lines = [`预期效果：${effect.effect}；同意后 ${effect.days} 天核对，没做到会写进晨报。`]
  if (effect.change === 'lift') {
    lines.push(effect.cover === undefined
      ? `撤下 ${effect.lift}，没有替补，单层消融的结果在下面。`
      : `撤下 ${effect.lift}，替补是 ${effect.cover}，它也管同一类调用。`)
  }
  return lines.join('\n')
}

// --- The check when the days are up (M5 design §3.6.1, docs/ORCHESTRATION.md §12) ---

const DAY_MS = 86_400_000

/** A due check is reported for this long after the day it fell due. */
const REPORT_DAYS = 7

/** One line of the metrics journal, as much of it as the check reads (src/metrics/schema.ts MetricsEvent). */
export interface JournalEvent {
  readonly k: string
  readonly at: string
  readonly body: Readonly<Record<string, unknown>>
}

/** The metrics journal of the project: its events, or why it could not be read. */
export type JournalRead = { readonly events: readonly JournalEvent[] } | { readonly unreadable: string }

/** A rule proposal the person agreed to: the question, its effect and the moment of the agreement. */
interface Agreed {
  readonly question: GraphNode
  readonly effect: RuleEffect
  readonly at: number
}

/** The counts of one metric in the two windows of a check, or why they cannot be counted. */
type Counts = { readonly before: number, readonly after: number } | { readonly unchecked: string }

/** An older rule whose count moved against its own expected effect in the windows of a newer one (D10). */
interface Backslide {
  readonly question: string
  readonly title: string
  readonly metric: string
  readonly before: number
  readonly after: number
}

/** The check of one rule proposal whose days are up. */
export interface EffectCheck {
  readonly question: string
  readonly title: string
  readonly effect: RuleEffect
  readonly agreedAt: string
  readonly dueAt: string
  readonly outcome: 'met' | 'missed' | 'unchecked'
  readonly before?: number
  readonly after?: number
  /** Why it could not be checked (outcome unchecked). */
  readonly reason?: string
  readonly backslides: readonly Backslide[]
}

/** The rule proposals the person agreed to: a question that is done, with an expected effect, at the time of its last decision. */
function agreedProposals(nodes: Iterable<GraphNode>): Agreed[] {
  return [...nodes].flatMap((question) => {
    if (question.type !== 'question' || question.status !== 'done') return []
    const effect = effectOf(question.body)
    const decided = question.history.filter(entry => entry.op === 'decide').at(-1)
    const at = decided === undefined ? Number.NaN : Date.parse(decided.at)
    return effect === undefined || Number.isNaN(at) ? [] : [{ question, effect, at }]
  })
}

/** Whether an event of the journal is a denial by the rule `id`: a guard denial or late denial (`rule`), or a block of the rules board (`rules.judged`); the event names the rule with or without its row. */
function deniedBy(event: JournalEvent, id: string, row: string | undefined): boolean {
  const named = event.body.rule
  if (typeof named !== 'string' || (named !== id && `${row}:${named}` !== id)) return false
  if (event.k === 'rule') return event.body.effect === 'deny' || event.body.effect === 'late'
  return event.k === 'rules.judged' && event.body.how === 'block'
}

const ROW_OF: ReadonlyMap<string, string> = new Map(CATALOG.map(entry => [entry.id, entry.row]))

/** The counts of a metric before [from, at) and after [at, due) the agreement. */
function countsOf(metric: string, nodes: readonly GraphNode[], journal: JournalRead, from: number, at: number, due: number): Counts {
  const parts = metricOf(metric)
  if (parts === undefined) return { unchecked: '核对的数认不出' }
  const iso = (ms: number): string => new Date(ms).toISOString()
  if (parts.kind === 'corrections') {
    const { events } = correctionSignals({ nodes, depthWrites: [], since: iso(from), until: iso(due) })
    const own = events.filter(event => event.key === parts.name).map(event => Date.parse(event.at))
    return { before: own.filter(ms => ms < at).length, after: own.filter(ms => ms >= at).length }
  }
  if ('unreadable' in journal) return { unchecked: `指标流水读不到：${journal.unreadable}` }
  // A loop, not Math.min(...): a spread puts every event on the call stack, and a real journal outgrows it.
  let earliest = Number.POSITIVE_INFINITY
  for (const event of journal.events) {
    const ms = Date.parse(event.at)
    if (ms < earliest) earliest = ms
  }
  if (earliest === Number.POSITIVE_INFINITY) return { unchecked: '指标流水还没有记录' }
  if (earliest > from) return { unchecked: `指标流水从 ${iso(earliest).slice(0, 10)} 才有，够不着同意之前的那段` }
  const row = ROW_OF.get(parts.name)
  const own = journal.events.filter(event => deniedBy(event, parts.name, row)).map(event => Date.parse(event.at)).filter(ms => ms >= from && ms < due)
  return { before: own.filter(ms => ms < at).length, after: own.filter(ms => ms >= at).length }
}

/** Whether the count went the way the effect expected: strictly, an equal count is a miss. */
const reached = (direction: RuleEffect['direction'], before: number, after: number): boolean => direction === 'down' ? after < before : after > before

/** Whether the count went against the way the effect expected. */
const wentBack = (direction: RuleEffect['direction'], before: number, after: number): boolean => direction === 'down' ? after > before : after < before

/**
 * The checks of the rule proposals whose days fell due in the seven days up
 * to `now`. Each is counted in the window of its own length before the
 * agreement and the window from the agreement to the day it fell due; the
 * older agreed rule proposals are counted in the same two windows, and the
 * ones whose count moved against their own expectation are named with it.
 * Pure: nothing is changed, no rule is lifted or tightened (d-rules-human-only).
 */
export function effectChecks(nodes: Iterable<GraphNode>, journal: JournalRead, now: number): EffectCheck[] {
  const all = [...nodes]
  const agreed = agreedProposals(all).sort((a, b) => a.at - b.at || compare(a.question.id, b.question.id))
  return agreed.flatMap((entry): EffectCheck[] => {
    const due = entry.at + entry.effect.days * DAY_MS
    if (due > now || due <= now - REPORT_DAYS * DAY_MS) return []
    const from = entry.at - entry.effect.days * DAY_MS
    const counts = countsOf(entry.effect.metric, all, journal, from, entry.at, due)
    const backslides = agreed.filter(older => older.at < entry.at).flatMap((older): Backslide[] => {
      const theirs = countsOf(older.effect.metric, all, journal, from, entry.at, due)
      return 'unchecked' in theirs || !wentBack(older.effect.direction, theirs.before, theirs.after)
        ? []
        : [{ question: older.question.id, title: older.question.title, metric: older.effect.metric, before: theirs.before, after: theirs.after }]
    })
    const base = { question: entry.question.id, title: entry.question.title, effect: entry.effect, agreedAt: new Date(entry.at).toISOString(), dueAt: new Date(due).toISOString(), backslides }
    if ('unchecked' in counts) return [{ ...base, outcome: 'unchecked', reason: counts.unchecked }]
    return [{ ...base, outcome: reached(entry.effect.direction, counts.before, counts.after) ? 'met' : 'missed', before: counts.before, after: counts.after }]
  })
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** The day of a moment at the report's offset, YYYY-MM-DD. */
const dayOf = (at: string, offsetMinutes: number): string => new Date(Date.parse(at) + offsetMinutes * 60_000).toISOString().slice(0, 10)

/**
 * The morning report's section of the checks (docs/ORCHESTRATION.md §12):
 * only the checks that missed, could not be checked, or found an older rule
 * moving back; none when every due check was met. The counts are the raw
 * numbers of the two windows, no ratio and no score (decision
 * d-metrics-ratios-person-only; plan §2.3). The last line says the rules do
 * not change by themselves.
 */
export function effectCheckLines(checks: readonly EffectCheck[], offsetMinutes: number): string[] {
  const listed = checks.filter(check => check.outcome !== 'met' || check.backslides.length > 0)
  if (listed.length === 0) return []
  const lines = ['', '## 规则提议的核对']
  for (const check of listed) {
    const head = `- ${check.title}（${check.question}，${dayOf(check.agreedAt, offsetMinutes)} 同意，${dayOf(check.dueAt, offsetMinutes)} 到期）`
    const way = WAY[check.effect.direction]
    if (check.outcome === 'unchecked') lines.push(`${head}：核对不了，${check.reason ?? '原因未知'}`)
    else if (check.outcome === 'missed') lines.push(`${head}：没做到。预期 ${check.effect.metric} ${way}，同意前 ${check.effect.days} 天 ${check.before} 次，同意后 ${check.after} 次`)
    else lines.push(`${head}：做到了。${check.effect.metric} 同意前 ${check.before} 次，同意后 ${check.after} 次`)
    for (const back of check.backslides) lines.push(`  - 旧规则 ${back.title}（${back.question}）往回走了：${back.metric} 这两段里 ${back.before} 次 → ${back.after} 次`)
  }
  lines.push('- 这里只列出来，规则不会自己变；要撤或要改，跟主 Agent 说')
  return lines
}
