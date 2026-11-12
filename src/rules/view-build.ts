/**
 * The rules page's data computed from what the row has read (docs/ORCHESTRATION.md
 * §16.14): one pure function from the project's state, the peak reading, the
 * row states, the violation journal, the lift state and the collector's items
 * to the view the row writes into `view.json` (view.ts). It reads no clock,
 * file or service: the row's writer (index.ts) reads them and passes them in.
 *
 * The journal's numbers come from the one statistics reader
 * (src/guard/measure.ts `ruleStats`, 7 days) and the one classifier
 * (`classifyRecord`): a code rule's count is its denials; a rule of the rules
 * board also counts the calls it put off, and a person's rule the calls it
 * only noted, apart. This file is host-side (the journal reader imports
 * Node's crypto); the client imports view.ts only.
 */
import { GUARD_RULES } from '../guard/catalog.ts'
import { DESIGN_LIFTS } from '../guard/main-agent-rules.ts'
import type { LiftService } from '../guard/lift-service.ts'
import { ruleStats, sinceCutoff, SUBJECT_LIMIT } from '../guard/measure.ts'
import { classifyRecord, type GuardRecord, type LateRecord, type ViolationRecord } from '../guard/records.ts'
import { effectiveTimeoutSeconds } from '../loops/trigger.ts'
import type { HealthRow } from '../shared/health.ts'
import type { StatusItem } from '../shared/status.ts'
import { BUILTIN_RULES, CATALOG } from './builtin.ts'
import { RULES_EVENT_TABLE } from './events.ts'
import { ended, evaluateCondition, judgeInput } from './judge.ts'
import { openTickets, projectSignals, stateNotes } from './listing.ts'
import { unapprovedScripts, type Rule, type RowState, type Ticket } from './model.ts'
import { stateOf, type PeakReading } from './peak.ts'
import type { ProjectRead } from './repo.ts'
import { clockReadings, compare } from './table.ts'
import { journalRuleOf, RULES_VIEW_VERSION, type RulesCodeView, type RulesDenialView, type RulesPersonView, type RulesScriptView, type RulesView } from './view.ts'

/** The rows the page names: every row a catalog entry belongs to or is told by. */
export const VIEW_ROWS: readonly HealthRow[] = [...new Set(CATALOG.flatMap(entry => [entry.row, ...(entry.toldBy === undefined ? [] : [entry.toldBy])]))]

/** Said of the rule that guards the lift record: only the rules board's command lifts it, and the board does not offer code rules yet. */
export const LIFT_BOARD_ONLY = '它护着撤下记录本身，只能在规则板上撤，规则板还没接上'
/** Said of a rule the lift paths do not know (the main agent's but the one DESIGN_LIFTS names, the rules board's own gate). */
export const LIFT_NOT_OFFERED = '这一条不在撤下的办法里，现在撤不了'

const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_RULES.map(rule => rule.id))
/** The entries only the stop level enables: what the page counts as the stop level's waiting work. */
const STOP_IDS: ReadonlySet<string> = new Set(BUILTIN_RULES.filter(rule => rule.enabledBy?.includes('stop') === true && !rule.enabledBy.includes('reduce')).map(rule => rule.id))
/** The catalog ids the lift paths resolve, guard rules and the design row's liftable one: the page shows their lift and their lifted moment. */
const GUARD_BY_CATALOG = new Map<string, (typeof GUARD_RULES)[number]>([
  ...GUARD_RULES.map(rule => [`${rule.row}:${rule.id}`, rule] as const),
  ...[...DESIGN_LIFTS].map(([id, lift]) => [`design:${id}`, { id, row: 'design' as const, title: lift.title, blocks: lift.blocks, liftVia: 'any' as const }] as const),
])

export interface RulesViewInput {
  /** The project's root, the `project` of the judgement the conditions are read with. */
  readonly root: string
  readonly read: ProjectRead
  readonly reading: PeakReading
  /** The pricing service's words for the peak hours, when it has them. */
  readonly hoursZh?: string | undefined
  /** The state of each of VIEW_ROWS on this host. */
  readonly rows: Readonly<Partial<Record<HealthRow, RowState>>>
  /** Every record of the violation journal, in file order. */
  readonly records: readonly GuardRecord[]
  /** The guard rules lifted now in the project (the lift service), by their bare id. */
  readonly lifted: ReturnType<LiftService['lifted']>
  /** The hosts whose heartbeat is fresh. */
  readonly liveHosts: ReadonlyArray<{ readonly pid: number, readonly startedAt: number }>
  /** The ids of the person's rules whose script file is not in the project. */
  readonly missingScripts: ReadonlySet<string>
  /** The collector's items with owner `rules`. */
  readonly items: readonly StatusItem[]
  readonly statusProblems: ReadonlyArray<{ readonly row: string, readonly reason: string }>
  readonly host: { readonly pid: number }
}

const cut = (text: string): string => Array.from(text).slice(0, SUBJECT_LIMIT).join('')

/** The journal's counts of the last 7 days by journal rule id: denials (the statistics reader's), deferrals and noted calls. */
function countsOf(records: readonly GuardRecord[], nowMs: number): { readonly denials: (rule: string) => number, readonly enforce: (rule: string) => number, readonly noted: (rule: string) => number } {
  const now = new Date(nowMs)
  const stats = ruleStats(records, { since: '7d', now })
  const cutoff = sinceCutoff('7d', now) ?? Number.NEGATIVE_INFINITY
  const deferred = new Map<string, number>()
  const noted = new Map<string, number>()
  for (const record of records) {
    const line = record as unknown as Readonly<Record<string, unknown>>
    if (typeof line.rule !== 'string' || typeof line.at !== 'string' || !(Date.parse(line.at) >= cutoff)) continue
    const klass = classifyRecord(line)
    const counter = klass === 'deferral' ? deferred : klass === 'rule-record' ? noted : undefined
    counter?.set(line.rule, (counter.get(line.rule) ?? 0) + 1)
  }
  const denials = (rule: string): number => {
    const stat = stats.rules.get(rule)
    return stat === undefined ? 0 : stat.denials.dialect + stat.denials.other
  }
  return { denials, enforce: rule => denials(rule) + (deferred.get(rule) ?? 0), noted: rule => noted.get(rule) ?? 0 }
}

/** The newest five denials of each journal rule id, of the whole journal, newest first. */
function recentDenials(records: readonly GuardRecord[]): ReadonlyMap<string, readonly RulesDenialView[]> {
  const denials: Array<RulesDenialView & { readonly ms: number, readonly index: number }> = []
  records.forEach((record, index) => {
    const line = record as unknown as Readonly<Record<string, unknown>>
    const klass = classifyRecord(line)
    if ((klass !== 'denial' && klass !== 'late-denial') || typeof line.rule !== 'string' || typeof line.at !== 'string' || Number.isNaN(Date.parse(line.at))) return
    let what: string
    if (klass === 'late-denial') what = cut(((record as LateRecord).paths ?? []).join('、'))
    else {
      const denial = record as ViolationRecord
      const subject = denial.call?.command ?? denial.call?.target
      what = cut(subject === undefined ? denial.tool : `${denial.tool} ${subject}`)
    }
    denials.push({ at: line.at, what, outcome: klass === 'late-denial' ? 'late' : 'block', rule: line.rule, ms: Date.parse(line.at), index })
  })
  denials.sort((a, b) => b.ms - a.ms || b.index - a.index)
  const byRule = new Map<string, RulesDenialView[]>()
  for (const { at, what, outcome, rule } of denials) {
    const list = byRule.get(rule) ?? []
    if (list.length < 5) list.push({ at, what, outcome, rule })
    byRule.set(rule, list)
  }
  return byRule
}

/** How a code rule is lifted, or why it is not; and, lifted, since when and how it comes back. */
function liftOf(id: string, title: string, lifted: RulesViewInput['lifted']): Pick<RulesCodeView, 'liftHow' | 'notLiftableBecause' | 'liftedAt' | 'restoreHow'> {
  const guard = GUARD_BY_CATALOG.get(id)
  if (guard === undefined) return { liftHow: null, notLiftableBecause: LIFT_NOT_OFFERED }
  if (guard.liftVia === 'board') return { liftHow: null, notLiftableBecause: LIFT_BOARD_ONLY }
  const state = lifted.find(entry => entry.rule === guard.id)
  return {
    liftHow: `跟主 Agent 说「撤下${title}」`,
    ...(state === undefined ? {} : { liftedAt: state.at, restoreHow: `要恢复：跟主 Agent 说「恢复${title}」` }),
  }
}

type Standing = RulesScriptView['standing']

function scriptOf(rule: Rule, standings: ReadonlyMap<string, Standing>, missing: ReadonlySet<string>): RulesScriptView | undefined {
  const action = rule.action
  if (action.kind !== 'script') return undefined
  // The failure setting judge.ts uses when the rule does not say: the blocking default of an event first.
  const defaults = rule.when.events.map(event => RULES_EVENT_TABLE.get(event)?.gateOnErrorDefault)
  const fallback = defaults.find(value => value === 'block') ?? defaults.find(value => value !== undefined) ?? 'allow'
  return {
    file: action.script.file,
    lang: action.script.lang,
    standing: standings.get(rule.id) ?? 'approved',
    missing: missing.has(rule.id),
    timeoutSeconds: action.timeoutSeconds ?? effectiveTimeoutSeconds({ recent: [], purpose: 'gate' }).seconds,
    timeoutFrom: action.timeoutSeconds === undefined ? 'design' : 'entry',
    onError: action.onError ?? fallback,
    onErrorIsDefault: action.onError === undefined,
  }
}

const isStop = (ticket: Ticket): boolean => ticket.rules.some(rule => STOP_IDS.has(rule))
const goalPaused = (ticket: Ticket): boolean => ticket.pausedGoal !== undefined && ticket.resumedAt === undefined

/** The page's data at `nowMs`. Pure. */
export function buildRulesView(input: RulesViewInput, nowMs: number): RulesView {
  const now = new Date(nowMs)
  const { state } = input.read
  const mode = stateOf(input.read, input.reading)
  const clock = clockReadings(state, input.reading, now)
  const judgement = judgeInput({ now, project: input.root, events: [], signals: [...clock.readings.values()] })
  const counts = countsOf(input.records, nowMs)
  const recent = recentDenials(input.records)
  const standings = new Map(unapprovedScripts(state).map(entry => [entry.id, entry.standing] as const))
  const rowOf = (row: string): RowState => input.rows[row as HealthRow] ?? 'absent'
  const tickets = openTickets(state)
  const stopTickets = tickets.filter(ticket => ticket.state === 'deferred' && isStop(ticket))
  const actor = state.peakMode?.origin.actor
  const rules = Object.values(state.rules ?? {}).sort((a, b) => compare(a.id, b.id)).map((rule): RulesPersonView => {
    const script = scriptOf(rule, standings, input.missingScripts)
    return {
      id: rule.id,
      title: rule.title,
      scope: rule.scope,
      ...(rule.sessionId === undefined ? {} : { sessionId: rule.sessionId }),
      when: rule.when,
      ...(rule.filter === undefined ? {} : { filter: rule.filter }),
      ...(rule.condition === undefined ? {} : { condition: rule.condition, conditionNow: evaluateCondition(rule.condition, judgement) }),
      onUnknown: rule.onUnknown ?? 'skip',
      action: rule.action,
      lifetime: rule.lifetime,
      origin: rule.origin,
      status: rule.status,
      inForce: rule.status === 'active' && !ended(rule, judgement),
      reason: rule.reason,
      enforce7d: counts.enforce(journalRuleOf(rule.id)),
      record7d: counts.noted(journalRuleOf(rule.id)),
      ...(script === undefined ? {} : { script }),
    }
  })
  return {
    version: RULES_VIEW_VERSION,
    at: now.toISOString(),
    host: { pid: input.host.pid },
    peak: {
      applies: input.reading.noService !== true,
      ...(input.reading.peak === undefined ? {} : { now: input.reading.peak }),
      ...(input.reading.until === undefined ? {} : { until: input.reading.until }),
      ...(input.reading.noService === true || input.reading.why === undefined ? {} : { problem: input.reading.why }),
      ...(input.hoursZh === undefined ? {} : { hoursZh: input.hoursZh }),
      level: mode.level,
      origin: mode.origin,
      ...(mode.at === undefined ? {} : { setAt: mode.at }),
      ...(actor === undefined ? {} : { via: actor === 'human' ? 'command' as const : 'agent' as const }),
      waiting: { tickets: stopTickets.length, pausedGoals: stopTickets.filter(goalPaused).length },
    },
    rows: { ...Object.fromEntries(VIEW_ROWS.map(row => [row, rowOf(row)])), execute: 'absent' },
    builtins: BUILTIN_RULES.map(rule => ({
      id: rule.id,
      title: rule.title,
      effect: rule.action.kind,
      ...(rule.partOf === undefined ? {} : { partOf: rule.partOf }),
      ...(rule.enabledBy === undefined ? {} : { enabledBy: rule.enabledBy }),
      enabled: rule.enabledBy === undefined || rule.enabledBy.includes(mode.level),
      ...(rule.toldBy === undefined ? {} : { toldBy: rule.toldBy, toldState: rowOf(rule.toldBy) }),
      count7d: counts.enforce(journalRuleOf(rule.id)),
    })),
    rules,
    code: CATALOG.filter(entry => !BUILTIN_IDS.has(entry.id)).map((entry): RulesCodeView => {
      const journalId = journalRuleOf(entry.id)
      return {
        id: entry.id,
        title: entry.title,
        row: entry.row,
        rowState: rowOf(entry.row),
        denials7d: counts.denials(journalId),
        last: recent.get(journalId) ?? [],
        ...liftOf(entry.id, entry.title, input.lifted),
      }
    }),
    signals: projectSignals(state, clock.readings).map((reading) => {
      const signal = state.signals?.[reading.name]
      return {
        name: reading.name,
        ...(signal === undefined ? { type: { kind: 'boolean' as const } } : { type: signal.type }),
        ...(signal?.description === undefined ? {} : { description: signal.description }),
        ...(reading.value === undefined ? {} : { value: reading.value }),
        ...(reading.unknown === undefined ? {} : { unknown: reading.unknown }),
        source: reading.source,
        ...(signal?.manual === undefined ? {} : { setAt: signal.manual.at, ...(signal.manual.expiresAt === undefined ? {} : { expiresAt: signal.manual.expiresAt }) }),
      }
    }),
    tickets: tickets.map(ticket => ({
      id: ticket.id,
      state: ticket.state,
      sessionId: ticket.sessionId,
      agentLabel: ticket.agentLabel,
      tool: ticket.tool,
      summary: ticket.summary,
      rules: ticket.rules,
      since: ticket.since,
      ...(ticket.letOnceUntil === undefined ? {} : { letOnceUntil: ticket.letOnceUntil }),
      hostPid: ticket.host.pid,
      hostAlive: input.liveHosts.some(host => host.pid === ticket.host.pid && host.startedAt === ticket.host.startedAt),
      stop: isStop(ticket),
      goalPaused: goalPaused(ticket),
    })),
    notices: Object.values(state.notices ?? {}).sort((a, b) => compare(a.at, b.at)).map(notice => ({ kind: notice.kind, rule: notice.rule, text: notice.text, at: notice.at })),
    recovery: {
      notes: stateNotes(input.read),
      ...(state.recovered === undefined ? {} : { recovered: state.recovered }),
      unresolved: Object.values(state.unresolved ?? {}).sort((a, b) => compare(a.label, b.label)).map(entry => ({
        label: entry.label,
        why: entry.why,
        ...(entry.seq === undefined ? {} : { seq: entry.seq }),
        ...(entry.actor === undefined ? {} : { actor: entry.actor }),
        ...(entry.op === undefined ? {} : { op: entry.op }),
        ...(entry.target === undefined ? {} : { target: entry.target }),
      })),
      repo: input.read.repo.kind,
    },
    items: input.items,
    statusProblems: input.statusProblems,
  }
}
