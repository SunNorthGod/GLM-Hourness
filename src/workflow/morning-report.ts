/**
 * Morning report: fold one period of the audit journal (dispatch calls,
 * violations, usage) and the project graph (the asks waiting for the person
 * and who settled the others) into the harvest report. Pure — reads parsed
 * JSONL lines and a loaded graph, emits text. Granularity: exceptions first,
 * then what waits for the person, then plain facts; no padding, no
 * restatement of completed work. The usage section is the usage panel's
 * list (src/report/panel.ts), priced through the pricing service when there
 * is one. The journal's lines are classified through the one classifier
 * every reader shares (src/guard/records.ts classifyRecord, m4-gate G1):
 * denials and late denials are the violations, a late denial is counted on
 * its own line, the rules board's recorded calls and the gaps the journal
 * itself wrote get their own lines, and anything unreadable is counted at
 * the end instead of silently shaping the numbers.
 */
import { auditPaths, type DecisionRecord, type UsageRecord } from '../memory/audit.ts'
import { classifyRecord, type GuardRecord, type LiftRecord } from '../guard/records.ts'
import { liftStatesOf } from '../guard/lift.ts'
import { ruleStats } from '../guard/measure.ts'
import { runGit } from '../data/git-process.ts'
import type { SuppressionRecord } from '../env/suppressions.ts'
import { limitSetting, parseLimits, type LimitLine } from '../env/limit-tool.ts'
import { lastValues, parseTiming, secondsText, valueSourceText, type TimingLine } from '../env/timeout.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { listOpenItems } from '../graph/projection.ts'
import type { HistoryEntry } from '../graph/schema.ts'
import { answerKindOf } from '../shared/answer-marks.ts'
import { gapLines, parseGaps, usagePanelLines, usagePanelOf, type PanelLineOptions } from '../report/panel.ts'
import type { DataHomes } from '../shared/data-home.ts'
import type { UsagePricing } from '../shared/pricing.ts'
import type { MomentZone } from '../shared/quota.ts'

/** Why the project graph could not be read; the report names it in place of the numbers. */
interface GraphUnreadable {
  readonly unreadable: string
}

/** What the report reads of the project graph. */
export interface AskSummary {
  /** Asks that wait for the person: how many, and the day the oldest was put (local calendar day; absent when none or when none has a time). */
  readonly waiting: { readonly count: number, readonly oldest?: string }
  /** Asks the agent settles itself. */
  readonly agentOwn: number
  /** Decisions made in the period, by who made them. */
  readonly decided: { readonly person: number, readonly inChat: number, readonly agent: number }
}

export interface ReportInput {
  readonly decisions: readonly DecisionRecord[]
  /** Every journal line the period holds; classifyRecord decides what each one is. */
  readonly violations: readonly GuardRecord[]
  readonly usage: readonly UsageRecord[]
  /** The daily suppression-comment counts the period covers (m4-suppressions), oldest first. */
  readonly suppressions?: readonly SuppressionRecord[] | undefined
  readonly period: string
  /** Prices the usage section in credits; without it the section lists calls and tokens. */
  readonly pricing?: UsagePricing | undefined
  /** Hears about a pricing service that throws. */
  readonly problem?: ((message: string) => void) | undefined
  /** Finished list lines for the usage section after its first line: the gaps in the records the period covers. */
  readonly usageScope?: readonly string[] | undefined
  /** The asks on the project graph, or why they could not be read. */
  readonly asks: AskSummary | GraphUnreadable
  /** The display zone for the gap line's timestamp, minutes east of UTC; default UTC+8, the report's peak-hour zone. */
  readonly offsetMinutes?: number | undefined
  /** The lift record of the project, over the WHOLE journal and the file (m4-gate G3, design §3.10) — not period-bounded; absent when the caller read nothing. */
  readonly lifts?: LiftsInput | undefined
  /** The whole timing journal of the project's checks (m4-checks, design §6.3.1); its section counts the seven days before `now`. */
  readonly timing?: readonly TimingLine[] | undefined
  /** The readable lines of the project's limits.jsonl: a check's last line says whether the main agent raised its ceiling (design §6.3.1, P13-01). */
  readonly limits?: readonly LimitLine[] | undefined
  /** The moment the report is made, epoch milliseconds: the seven days of the checks section end here. */
  readonly now?: number | undefined
}

/** What the lift side of the report reads: the whole journal's lift records, the journal's earliest instant (gap records count their `since`), and the record file's text or read error. */
export interface LiftsInput {
  /** Every `kind: 'lift'` line of the whole violations journal. */
  readonly records: readonly LiftRecord[]
  /** The earliest instant any journal record (any class) carries; a gap record counts its `since`. Absent when the journal is empty. */
  readonly earliest?: string | undefined
  /** The record file's text, when the report knows the project root; absent without a root, and the report then derives the lifts from the journal alone. */
  readonly file?: { readonly text: string } | { readonly error: string }
  /** Whether git sees uncommitted changes to the record file (the caller ran `git status`, 5 seconds, failure absent). */
  readonly uncommitted?: boolean | undefined
}

/** The local calendar day of an instant, as 2026-10-27. */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** Who made a decision: the person on the panel or the command line, the person in the chat (the main agent recorded their checked words), or the agent. */
function deciderOfEntry(entry: HistoryEntry): keyof AskSummary['decided'] {
  if (entry.actor === 'human') return 'person'
  // The mark alone is text the model could write into the reason of its own decision; the words the harness checked are the `relay`.
  if (entry.actor === 'llm' && answerKindOf(entry) === 'agree' && entry.relay !== undefined) return 'inChat'
  return 'agent'
}

/**
 * The asks of a graph. The waiting counts come from the open items; the
 * decisions come from the history of every question, not from the latest
 * decisions the projection lists (at most 20, one per question). `since`
 * (ISO instant) bounds the decisions counted to those made at or after it.
 */
export function askSummary(graph: LoadedGraph, since?: string): AskSummary {
  const items = listOpenItems(graph)
  const waitingSince = items.questions.flatMap(entry => entry.askedAt === undefined ? [] : [Date.parse(entry.askedAt)]).filter(time => !Number.isNaN(time))
  const sinceMs = since === undefined ? undefined : Date.parse(since)
  const decided = { person: 0, inChat: 0, agent: 0 }
  for (const node of graph.nodes.values()) {
    if (node.type !== 'question') continue
    for (const entry of node.history) {
      if (entry.op !== 'decide') continue
      const at = Date.parse(entry.at)
      if (sinceMs !== undefined && !Number.isNaN(sinceMs) && !(at >= sinceMs)) continue
      decided[deciderOfEntry(entry)] += 1
    }
  }
  return {
    waiting: {
      count: items.questions.length,
      ...(waitingSince.length === 0 ? {} : { oldest: localDay(new Date(Math.min(...waitingSince))) }),
    },
    agentOwn: items.agentQueue.length,
    decided,
  }
}

/** The lines the 例外 section carries besides the per-rule counts, in the order they are written. */
type Auxiliary = string

/** The Chinese label of one record class in the gap line; an unknown class keeps its own name. */
const GAP_CLASS_LABELS: Readonly<Record<string, string>> = {
  denial: '拦下',
  'late-denial': '晚到的拦下',
  followup: '跟进',
  request: '申报',
  grant: '放行',
  'grant-void': '放行作废',
  lift: '撤下',
  'rule-record': '只记录',
  deferral: '排队',
}

/** The suppression-comment line, or undefined when the period holds no count. */
export function suppressionLineOf(records: readonly SuppressionRecord[]): string | undefined {
  if (records.length === 0) return undefined
  const total = records[records.length - 1].total
  let up = 0
  let down = 0
  for (let index = 1; index < records.length; index++) {
    const delta = records[index].total - records[index - 1].total
    if (delta > 0) up += delta
    else down -= delta
  }
  return up === 0 && down === 0 ? `压制注释 ${total} 处` : `压制注释 ${total} 处（本期 +${up} / −${down}）`
}

/** One violation line: the rule, the routes the dialect did not claim counted apart, the count. */
function violationLines(records: readonly { rule: string, scope?: unknown }[]): string[] {
  const byRule = new Map<string, number>()
  for (const record of records) {
    const label = record.scope === 'other' ? `${record.rule}（其他路由）` : record.rule
    byRule.set(label, (byRule.get(label) ?? 0) + 1)
  }
  return [...byRule].map(([rule, count]) => `- 违规 ${rule} × ${count}`)
}

/** The 流水有缺口 line for one period's gap records; undefined without any (design §3.10). */
function gapLineOf(records: readonly Record<string, unknown>[], offsetMinutes: number): Auxiliary | undefined {
  if (records.length === 0) return undefined
  let lost = 0
  const classes = new Map<string, number>()
  let until = ''
  for (const record of records) {
    const gapLost = typeof record.lost === 'number' ? record.lost : 0
    lost += gapLost
    const named = typeof record.classes === 'object' && record.classes !== null ? record.classes as Record<string, unknown> : {}
    for (const [klass, count] of Object.entries(named)) {
      if (typeof count === 'number') classes.set(klass, (classes.get(klass) ?? 0) + count)
    }
    if (typeof record.until === 'string' && (until === '' || Date.parse(record.until) > Date.parse(until))) until = record.until
  }
  const parts = [...classes].sort(([left], [right]) => left.localeCompare(right))
    .map(([klass, count]) => `${GAP_CLASS_LABELS[klass] ?? klass} ${count}`)
    .join('、')
  const at = until === '' || Number.isNaN(Date.parse(until)) ? '' : renderStamp(Date.parse(until), offsetMinutes)
  return `- 流水有缺口：这段时间有 ${lost} 条记录没写进来（${parts}），最近一处到 ${at}；当时的拦截都照常生效`
}

/** The 申报 line of the 例外 section (m4-request-card, design §5.8): the period's filings by outcome, with the grants spent and voided beside them; undefined when the period filed none. The journal only counts — it never authorizes. */
function requestLineOf(records: readonly { ref: string, outcome: string }[], grants: number, voids: number): Auxiliary | undefined {
  if (records.length === 0) return undefined
  const asked = new Set(records.filter(record => record.outcome === 'asked').map(record => record.ref))
  const approved = records.filter(record => record.outcome === 'approved').length
  const declined = records.filter(record => record.outcome === 'declined').length
  const unanswered = records.filter(record => record.outcome === 'expired' || record.outcome === 'closed').length
  return `- 申报 ${asked.size} 次：放行 ${approved}（已用 ${grants}、作废 ${voids}）、不放行 ${declined}、没答 ${unanswered}`
}

/** A journal timestamp as the report writes clock times: `MM-DD HH:mm` in the display zone. */
function renderStamp(at: number, offsetMinutes: number): string {
  const shifted = new Date(at + offsetMinutes * 60_000)
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${shifted.getUTCDate()}`.padStart(2, '0')
  const hour = `${shifted.getUTCHours()}`.padStart(2, '0')
  const minute = `${shifted.getUTCMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

/** The checks' timeouts look back this far (design §6.3.1 「看得见」). */
const TIMING_WINDOW_MS = 7 * 24 * 3600 * 1000

/**
 * The section of the checks' timeouts (design §6.3.1, §3.10): one line per
 * check that has a value, with the value and where it came from (whose
 * estimate, in which session, or that the session was not recorded; then
 * what was wanted when the value is held at the ceiling), the
 * timeouts of the last seven days and the latest one, and the runs dropped
 * from the queue; under it, when the check's last line in limits.jsonl is a
 * raise, the raised ceiling with its day and reason (never a value line's
 * `cap`: a reset shows at once). Empty when the journal has no value line.
 */
function timingSection(timing: readonly TimingLine[], limits: readonly LimitLine[], now: number, offsetMinutes: number): string[] {
  const since = now - TIMING_WINDOW_MS
  const recent = (line: TimingLine): boolean => !Number.isNaN(Date.parse(line.at)) && Date.parse(line.at) >= since && Date.parse(line.at) <= now
  const lines: string[] = []
  for (const [check, value] of lastValues({ lines: timing, bad: 0 })) {
    const timeouts = timing.filter(line => line.kind === 'timeout' && line.check === check && recent(line))
    const queued = timing.filter(line => line.kind === 'queue' && line.check === check && recent(line)).length
    const last = timeouts.at(-1)
    const late = last?.kind !== 'timeout' ? '近 7 天没有超时' : `近 7 天超时 ${timeouts.length} 次（最近一次：上限 ${secondsText(last.limitMs)} 秒，跑了 ${(last.elapsedMs / 1000).toFixed(1)} 秒，${renderStamp(Date.parse(last.at), offsetMinutes)}）`
    lines.push(`- ${check}：超时 ${secondsText(value.limitMs)} 秒（${valueSourceText(value, true)}）· ${late}${queued === 0 ? '' : ` · 排队太久没跑 ${queued} 次`}`)
    const setting = limitSetting({ lines: limits, bad: 0 }, check)
    if (setting !== undefined) lines.push(`  - 上限已由主 Agent 调高到 ${setting.capS} 秒 · ${renderDay(setting.at, offsetMinutes)}：${setting.reason}；要改回，跟主 Agent 说`)
  }
  return lines.length === 0 ? [] : ['', '## 检查的超时', ...lines]
}

/** The day of a moment at the report's offset, YYYY-MM-DD; a moment that does not read is written as recorded. */
function renderDay(at: string, offsetMinutes: number): string {
  const ms = Date.parse(at)
  return Number.isNaN(ms) ? at : new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10)
}

/** The section of the asks: what waits for the person, who settled the rest, and how many dispatch calls were made. */
function askLines(asks: AskSummary | GraphUnreadable, dispatches: number): string[] {
  const calls = `- 派遣类调用 ${dispatches} 次`
  if ('unreadable' in asks) return [`- 项目图读不到：${asks.unreadable}`, calls]
  const { waiting, agentOwn, decided } = asks
  return [
    `- 等你定的 ${waiting.count} 件${waiting.oldest === undefined ? '' : `，最早一件是 ${waiting.oldest} 提出的`}`,
    `- agent 自己要定的 ${agentOwn} 件`,
    `- 本期拍板 ${decided.person + decided.inChat + decided.agent} 次：你 ${decided.person} · 你在对话里说 ${decided.inChat} · agent ${decided.agent}`,
    calls,
  ]
}

/** Whether a decision record is a dispatch call (the only kind the workflow row writes). */
function isDispatch(record: DecisionRecord): boolean {
  // The journal is read from disk without a schema: a line without a text kind is not a dispatch.
  return typeof record.kind === 'string' && (record.kind === 'dispatch' || record.kind.startsWith('dispatch:'))
}

/**
 * One line per rule the journal denied in the period, and the right-path
 * summary (m4-gate G2, design §3.10), over the same statistics reader the
 * command line and the rules page use. The denominator of a ratio holds
 * right-path, verbatim retries and everything else; the follow-ups that
 * settled as no next call are counted apart, because stopping for the human
 * is the right path for several corrections (design §3.3). A rule whose
 * denials all sit outside the period has no line of its own; a rule the
 * journal only holds follow-ups for still enters the summary.
 */
function ruleLines(records: readonly GuardRecord[], offsetMinutes: number): string[] {
  const stats = ruleStats(records, {})
  const lines: string[] = []
  const ratios: string[] = []
  let stopped = 0
  for (const [rule, stat] of stats.rules) {
    // The stops count for every rule the journal holds, also for one whose denials sit outside the period.
    stopped += stat.followups.none
    const denominator = stat.followups['right-path'] + stat.followups.repeat + stat.followups.other
    if (denominator > 0) ratios.push(`${rule} ${stat.followups['right-path']}/${denominator}`)
    const denials = stat.denials.dialect + stat.denials.other
    if (denials === 0) continue
    const last = stat.last
    const at = last === undefined || Number.isNaN(Date.parse(last.at)) ? '' : ` · ${renderStamp(Date.parse(last.at), offsetMinutes)}`
    const look = last === undefined ? '' : `（最近一次：${last.tool}${last.subject === undefined ? '' : ` ${last.subject}`}${at}）`
    lines.push(`- 拦下 ${rule} × ${denials}${look}${denominator > 0 ? ` · 拦截后下一步走对 ${stat.followups['right-path']}/${denominator}` : ''}${stat.followups.repeat > 0 ? ` · 原样重试 ${stat.followups.repeat} 次` : ''}`)
  }
  if (ratios.length === 0 && stopped === 0) return lines
  const pairs = ratios.length === 0 ? '无' : ratios.join('，')
  lines.push(`- 拦截后下一步走对：${pairs}${stopped > 0 ? `（另有 ${stopped} 次停下来交给人或上级）` : ''}`)
  return lines
}

/**
 * The lift lines of the 例外 section (m4-gate G3, design §3.10): which rules
 * stand lifted right now, and whether the record file and the journal agree.
 * The input is not period-bounded — a lift is a decision of the project, its
 * day does not matter (review finish2 round 2 F16). Without a record file
 * the report derives the lifted rules from the journal alone and reconciles
 * nothing; an unreadable file says so and reconciles nothing. A mismatch
 * never changes a rule's state (the gate reads the file), the line only
 * names it.
 */
function liftLines(lifts: LiftsInput, offsetMinutes: number): string[] {
  const lines: string[] = []
  const journalOf = (rule: string): LiftRecord | undefined =>
    [...lifts.records].filter(record => record.rule === rule).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)
  const journalStateOf = (rule: string): 'lift' | 'restore' | undefined => {
    const last = journalOf(rule)
    return last === undefined ? undefined : last.action
  }
  const file = lifts.file
  const fileStates = file !== undefined && 'text' in file ? liftStatesOf(file.text) : undefined
  const liftedRules = fileStates !== undefined
    ? [...fileStates.states].filter(([, action]) => action === 'lift').map(([rule]) => rule)
    : [...new Set(lifts.records.filter(record => record.action === 'lift').map(record => record.rule))].filter(rule => journalStateOf(rule) === 'lift')
  // - 撤下的规则：one line, every rule now lifted, with the last lift record's moment and words (design §3.10).
  if (liftedRules.length > 0) {
    const parts = liftedRules.map((rule) => {
      const last = journalOf(rule)
      if (last === undefined) return rule
      const at = Number.isNaN(Date.parse(last.at)) ? '' : `${renderStamp(Date.parse(last.at), offsetMinutes)}，`
      const via = last.via === 'chat' ? `经对话，原话「${last.words}」` : `经规则板，写命令原文「${last.words}」`
      return `${rule}（${at}${via}）`
    })
    lines.push(`- 撤下的规则：${parts.join('、')}`)
  }
  if (file !== undefined && 'error' in file) {
    lines.push(`- lifts.jsonl 读不出（${file.error}），这一次没有对账`)
    return lines
  }
  if (fileStates === undefined) return lines
  // The reconciliation (review finish2 round F15): terminal state per rule,
  // then the lines each side holds and the other lacks, keyed at+rule+action.
  const earliestMs = lifts.earliest === undefined || Number.isNaN(Date.parse(lifts.earliest)) ? undefined : Date.parse(lifts.earliest)
  const journalKeys = new Set(lifts.records.map(record => `${record.at}|${record.rule}|${record.action}`))
  const preJournal = (at: string): boolean => earliestMs !== undefined && !Number.isNaN(Date.parse(at)) && Date.parse(at) < earliestMs
  const say = (state: 'lift' | 'restore' | undefined, side: '文件' | '流水'): string =>
    state === undefined ? (side === '文件' ? '文件里没有这条规则的行' : '流水里没有这条规则的记录') : `${side === '文件' ? '文件里最后一行是' : '流水里最后一条是'}${state === 'lift' ? '撤下' : '恢复'}`
  const mismatched = new Set<string>()
  const carried = new Set<string>()
  for (const rule of [...new Set([...fileStates.states.keys(), ...lifts.records.map(record => record.rule)])]) {
    const fileLines = fileStates.lines.filter(line => line.rule === rule)
    const freshFileLines = fileLines.filter(line => !preJournal(line.at))
    const journalRecords = lifts.records.filter(record => record.rule === rule)
    // A rule the file lifts only before the journal's first record, with no
    // journal record of its own, belongs to the new-machine row: its lines
    // cannot be repopulated, so per-rule rows would never clear (review
    // finish2 round 2 N29).
    if (freshFileLines.length === 0 && journalRecords.length === 0) {
      if (fileLines.length > 0) carried.add(rule)
      continue
    }
    const fileState = fileStates.states.get(rule)
    const journalState = journalStateOf(rule)
    if (fileState !== journalState) {
      mismatched.add(rule)
      lines.push(`- lifts.jsonl 与流水对不上：${rule}，${say(fileState, '文件')}，${say(journalState, '流水')}`)
      continue
    }
    const extraFile = freshFileLines.filter(line => !journalKeys.has(`${line.at}|${line.rule}|${line.action}`)).length
    const extraJournal = journalRecords.filter(record => !fileStates.lines.some(line => line.at === record.at && line.action === record.action)).length
    if (extraFile > 0 || extraJournal > 0) {
      mismatched.add(rule)
      lines.push(`- lifts.jsonl 与流水对不上：${rule}，文件里有 ${extraFile} 行流水没有的，流水里有 ${extraJournal} 条文件没有的`)
    }
  }
  if (carried.size > 0) {
    const names = [...carried].slice(0, 5).join('、')
    lines.push(`- 流水里没有这些撤下记录（换了电脑？）：lifts.jsonl 里有 ${carried.size} 条规则的撤下或恢复早于本机流水：${names}${carried.size > 5 ? '等' : ''}`)
  }
  if (lifts.uncommitted === true) lines.push('- lifts.jsonl 有未提交的撤下，随下一次提交带上')
  return lines
}

/** Render the morning report for one period. */
export function morningReport(input: ReportInput): string {
  const lines: string[] = [`# 晨报 ${input.period}`]

  const offsetMinutes = input.offsetMinutes ?? 480
  const classes = input.violations.map(record => ({ record, klass: classifyRecord(record as unknown as Readonly<Record<string, unknown>>) }))
  const denial = (klass: string) => classes.filter(entry => entry.klass === klass).map(entry => entry.record as { rule: string, scope?: unknown })
  // Denials and late denials are the violations; the rules were tuned on GLM, so
  // records from routes the dialect did not claim count apart (src/guard/origin.ts).
  // Records without a scope predate split step 7 and were all GLM.
  const denials = [...denial('denial'), ...denial('late-denial')]
  const late = denial('late-denial').length
  const recorded = denial('rule-record').length
  const unreadable = denial('unknown').length
  const gaps = classes.filter(entry => entry.klass === 'gap').map(entry => entry.record as unknown as Record<string, unknown>)
  const gapLine = gapLineOf(gaps, offsetMinutes)
  // The request channel's period counts (m4-request-card, design §5.8): filings by outcome, grants and voids beside them.
  const requests = classes.filter(entry => entry.klass === 'request').map(entry => entry.record as unknown as { ref: string, outcome: string })
  const grants = classes.filter(entry => entry.klass === 'grant').length
  const voids = classes.filter(entry => entry.klass === 'grant-void').length
  const requestLine = requestLineOf(requests, grants, voids)
  const auxiliary: Auxiliary[] = [
    ...(late > 0 ? [`- 其中晚到的拦下 ${late} 条`] : []),
    ...(recorded > 0 ? [`- 只记录 ${recorded} 条（规则板上人选的做法）`] : []),
    ...(gapLine === undefined ? [] : [gapLine]),
    ...(requestLine === undefined ? [] : [requestLine]),
    ...(unreadable > 0 ? [`- ${unreadable} 行记录读不懂`] : []),
  ]

  lines.push('')
  lines.push('## 例外（先看）')
  // 「无」 answers the violations; the lines below it count what the journal
  // holds besides them (late denials, recorded calls, gaps, unreadable lines)
  // and then what the model did after each rule's denials (design §3.10).
  if (denials.length === 0) lines.push('- 无')
  lines.push(...violationLines(denials))
  lines.push(...auxiliary)
  lines.push(...ruleLines(input.violations, offsetMinutes))
  if (input.lifts !== undefined) lines.push(...liftLines(input.lifts, offsetMinutes))

  // The suppression-comment total and its movement over the period (m4-suppressions §6.7):
  // rises and falls counted apart, so a net-zero period with churn still shows.
  const suppressionLine = suppressionLineOf(input.suppressions ?? [])
  if (suppressionLine !== undefined) lines.push(suppressionLine)
  lines.push(...timingSection(input.timing ?? [], input.limits ?? [], input.now ?? Date.now(), offsetMinutes))

  lines.push('')
  lines.push('## 等你定的事')
  lines.push(...askLines(input.asks, input.decisions.filter(isDispatch).length))

  lines.push('')
  lines.push('## 用量（今天）')
  // The panel's own list, minus its basis line (the panel section writes that once).
  const scope = input.usageScope ?? []
  if (input.usage.length === 0) {
    lines.push('- 无模型调用', ...scope)
  }
  else {
    const options: PanelLineOptions = { basis: false, scope }
    lines.push(...usagePanelLines(usagePanelOf(input.usage, input.pricing, input.problem), options))
  }

  return lines.join('\n')
}

/** Filesystem the report entry reads through (subset of node:fs/promises). */
export interface ReportFs {
  readFile(path: string): Promise<string>
}

export interface ReportOptions {
  /** Prices the usage section in credits; without it the section lists calls and tokens. */
  readonly pricing?: UsagePricing | undefined
  /** Hears about a pricing service that throws. */
  readonly problem?: ((message: string) => void) | undefined
  /** The moment the report is made, epoch milliseconds, which the times of the gap lines are worded against; default the clock. */
  readonly now?: number | undefined
  /** The display zone, minutes east of UTC; tests set it, the host's offset otherwise. */
  readonly offsetMinutes?: number | undefined
  /** The project root (m4-gate G3): the record file `docs/guard/lifts.jsonl` is read there and git asks it about uncommitted lifts. Without it the report derives the lifted rules from the journal alone and reconciles nothing. */
  readonly root?: string | undefined
}

/** Reads the project graph of the session that asked for the report; rejects with the reason when it cannot. */
export type GraphReader = () => Promise<LoadedGraph>

/** The asks of the graph `read` gives, or why it could not be read: the report names the reason and goes on. */
async function readAsks(read: GraphReader, since: string | undefined): Promise<AskSummary | GraphUnreadable> {
  try {
    return askSummary(await read(), since)
  }
  catch (error) {
    return { unreadable: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Assemble the morning report from the audit journal files: dispatch calls,
 * violations and the suppression counts from the project directory, usage and
 * the gap file (the deletions of usage records) from the user directory
 * (docs/DESIGN.md §2.4); an unknown directory reads as an empty journal. The
 * asks come from the project graph `graph` reads. `since` (ISO instant) bounds
 * the period: only records stamped at or after it enter the report, so one
 * period reports on that window, not on all history. The usage section names
 * the gaps that period meets.
 */
export async function reportFromFiles(fs: ReportFs, homes: DataHomes, period: string, graph: GraphReader, since?: string, options: ReportOptions = {}): Promise<string> {
  // A reader may throw before it returns a promise: both ways of failing read as an empty file.
  const readText = async (path: string | undefined): Promise<string> => {
    if (path === undefined) return ''
    try {
      return await fs.readFile(path)
    }
    catch {
      return ''
    }
  }
  const readJsonl = async <T>(path: string | undefined): Promise<T[]> => {
    if (path === undefined) return []
    try {
      const raw = await fs.readFile(path)
      return raw.split('\n').filter(line => line.trim().length > 0).flatMap<T>(line => {
        try {
          return [JSON.parse(line) as T]
        }
        catch {
          return []
        }
      })
    }
    catch {
      return [] // missing journal = empty period
    }
  }
  // Compare parsed instants, not strings: journal timestamps may carry
  // different UTC offsets and lexical order would misjudge them.
  const sinceMs = since === undefined || Number.isNaN(since) ? undefined : Date.parse(since)
  const inPeriod = <T extends { readonly at?: unknown }>(records: readonly T[]): readonly T[] => sinceMs === undefined || Number.isNaN(sinceMs)
    ? records
    : records.filter(record => typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at)) && Date.parse(record.at) >= sinceMs)
  const paths = auditPaths(homes)
  const gapRaw = paths.gaps === undefined ? '' : await fs.readFile(paths.gaps).catch(() => '')
  const periodStart = sinceMs === undefined || Number.isNaN(sinceMs) ? undefined : sinceMs
  const zone: MomentZone = options.offsetMinutes === undefined ? {} : { offsetMinutes: options.offsetMinutes }
  // The lift side reads the WHOLE journal, not the period (design §3.10, review finish2 round 2 F16): a lift is the project's decision, whatever day it fell on.
  const wholeViolations = await readJsonl<GuardRecord>(paths.violations)
  const liftRecords = wholeViolations.flatMap((record): LiftRecord[] => classifyRecord(record as unknown as Readonly<Record<string, unknown>>) === 'lift' ? [record as unknown as LiftRecord] : [])
  let earliest: string | undefined
  for (const record of wholeViolations) {
    // A gap record counts its `since` too: the first lost record is earlier than any line the journal holds (design §3.10).
    // A gap record counts its `since` too: the first lost record is earlier than any line the journal holds (design §3.10).
    const gap = record as unknown as { readonly kind?: unknown, readonly since?: unknown }
    for (const at of gap.kind === 'gap' && typeof gap.since === 'string' ? [record.at, gap.since] : [record.at]) {
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
      if (earliest === undefined || Date.parse(at) < Date.parse(earliest)) earliest = at
    }
  }
  const root = options.root
  const file = root === undefined
    ? undefined
    : await fs.readFile(`${root.replaceAll('\\', '/')}/docs/guard/lifts.jsonl`).then(
      text => ({ text }),
      error => ({ error: (error as NodeJS.ErrnoException).code ?? 'error' }),
    )
  const uncommitted = root === undefined || file === undefined || 'error' in file
    ? undefined
    : await runGit(root, ['status', '--porcelain', '--', 'docs/guard/lifts.jsonl']).then(run => run.code === 0 && run.out.trim().length > 0, () => undefined)
  return morningReport({
    decisions: inPeriod(await readJsonl<DecisionRecord>(paths.decisions)),
    violations: inPeriod(wholeViolations),
    usage: inPeriod(await readJsonl<UsageRecord>(paths.usage)),
    suppressions: inPeriod(await readJsonl<SuppressionRecord>(paths.suppressions)),
    // The checks' journal is read whole: its section counts its own seven days (design §6.3.1).
    timing: parseTiming(await readText(paths.timing)).lines,
    // A limits.jsonl that cannot be read is no setting (design §6.3.1).
    limits: parseLimits(await readText(paths.limits)).lines,
    now: options.now,
    period,
    pricing: options.pricing,
    problem: options.problem,
    usageScope: gapLines(parseGaps(gapRaw), options.now ?? Date.now(), zone, periodStart),
    asks: await readAsks(graph, since),
    offsetMinutes: options.offsetMinutes,
    lifts: {
      records: liftRecords,
      ...(earliest === undefined ? {} : { earliest }),
      ...(file === undefined ? {} : { file }),
      ...(uncommitted === undefined ? {} : { uncommitted }),
    },
  })
}
