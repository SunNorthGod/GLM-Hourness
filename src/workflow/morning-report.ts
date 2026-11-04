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
import { classifyRecord, journalEarliest, type GuardRecord, type LiftRecord } from '../guard/records.ts'
import { liftRecordPath } from '../guard/lift.ts'
import { liftLines, renderStamp, ruleLines, type LiftsInput } from '../guard/status.ts'
import { suppressionLineOf } from '../env/status.ts'
import { runGit } from '../data/git-process.ts'
import type { SuppressionRecord } from '../env/suppressions.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { listOpenItems } from '../graph/projection.ts'
import type { HistoryEntry } from '../graph/schema.ts'
import { answerKindOf } from '../shared/answer-marks.ts'
import { gapLines, parseGaps, usagePanelLines, usagePanelOf, type PanelLineOptions } from '../report/panel.ts'
import type { DataHomes } from '../shared/data-home.ts'
import type { UsagePricing } from '../shared/pricing.ts'
import type { MomentZone } from '../shared/quota.ts'
import { readLog, type LogFindings } from '../metrics/read.ts'
import { factsFor, localDate } from '../metrics/calc.ts'
import type { MetricsCoverage } from '../shared/metrics.ts'

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
  /** The metrics journal's facts and its 记录 coverage line, ready-made lines; absent when the caller passed no project. */
  readonly metrics?: readonly string[]
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

  lines.push('')
  lines.push('## 等你定的事')
  lines.push(...askLines(input.asks, input.decisions.filter(isDispatch).length))

  if (input.metrics !== undefined && input.metrics.length > 0) {
    lines.push('')
    lines.push(...input.metrics)
  }

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
  /**
   * The metrics journal of the calling session's project (metrics design
   * §7.3): the root to read, with the metrics row's process-local coverage
   * state when the row is on; or why there is no project at all.
   */
  readonly metrics?: { readonly root: string, readonly coverage?: MetricsCoverage } | { readonly reason: string }
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
  const nowAt = options.now ?? Date.now()
  const metricsLinesOut = options.metrics === undefined ? undefined : await metricsLines(options.metrics, nowAt, options.offsetMinutes, graph)
  // The lift side reads the WHOLE journal, not the period (design §3.10, review finish2 round 2 F16): a lift is the project's decision, whatever day it fell on.
  const wholeViolations = await readJsonl<GuardRecord>(paths.violations)
  const liftRecords = wholeViolations.flatMap((record): LiftRecord[] => classifyRecord(record as unknown as Readonly<Record<string, unknown>>) === 'lift' ? [record as unknown as LiftRecord] : [])
  const earliest = journalEarliest(wholeViolations)
  const root = options.root
  const file = root === undefined
    ? undefined
    : await fs.readFile(liftRecordPath(root)).then(
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
    period,
    pricing: options.pricing,
    problem: options.problem,
    usageScope: gapLines(parseGaps(gapRaw), nowAt, zone, periodStart),
    asks: await readAsks(graph, since),
    offsetMinutes: options.offsetMinutes,
    lifts: {
      records: liftRecords,
      ...(earliest === undefined ? {} : { earliest }),
      ...(file === undefined ? {} : { file }),
      ...(uncommitted === undefined ? {} : { uncommitted }),
    },
    ...(metricsLinesOut === undefined ? {} : { metrics: metricsLinesOut }),
  })
}

/** The facts groups the conversation-facing report carries (§7.3): the task, interception, lift, timeout, stall and report groups, no scores, no burden numbers, no coverage group. */
const FACT_GROUP_TITLES = ['任务', '拦截', '撤下', '超时', '额度停住', '汇报']

/** The checker findings the printed groups never read (the 覆盖 group is the CLI's). */
const NO_FINDINGS: LogFindings = { events: 0, unreadable: [], missing: [], chainBreaks: [], noStop: [], clockRollbacks: [], duplicates: 0, lostFiles: [], forgeries: [], bytes: 0 }

/**
 * The metrics journal's lines for the report (§7.3): the facts of the
 * calling session's project over the report's local day, then the 记录
 * coverage line — earliest entry, today's count, what this host's writer
 * dropped (with the code), the last background self-check, the events no
 * project could take, and the note that the graph has older history when
 * it does. A project with no journal yet names why, the rest of the
 * report unchanged.
 */
async function metricsLines(
  metrics: NonNullable<ReportOptions['metrics']>,
  nowMs: number,
  offsetMinutes: number | undefined,
  graph: GraphReader,
): Promise<string[]> {
  if (!('root' in metrics)) return [`## 指标（流水）`, `- 指标流水读不到：${metrics.reason}`]
  const zoneMinutes = offsetMinutes ?? -new Date(nowMs).getTimezoneOffset()
  const sign = zoneMinutes < 0 ? '-' : '+'
  const abs = Math.abs(zoneMinutes)
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  const dayStart = new Date(nowMs); dayStart.setHours(0, 0, 0, 0)
  const from = dayStart.toISOString()
  const to = new Date(dayStart.getTime() + 86_400_000).toISOString()
  const today = localDate(new Date(nowMs).toISOString(), tz)
  try {
    // The whole journal, not just today: the 记录 line's 最早 is the journal's
    // first entry (§5.5), and factsFor windows the facts to the day itself.
    const read = await readLog(metrics.root)
    const lines: string[] = ['## 指标（流水，今天）']
    if (read.events.length === 0) {
      lines.push('- 指标流水还没有：指标行没启用，或这个项目还没有记录')
      return lines
    }
    // The printed groups never read the checker's findings or the basis (the
    // 覆盖 group and the basis line are the CLI's), so the empty findings are
    // never rendered.
    const { groups } = factsFor({ events: read.events, basis: new Map(), from, to, tz, findings: NO_FINDINGS, today })
    for (const group of groups) {
      if (!FACT_GROUP_TITLES.includes(group.title)) continue
      lines.push(`### ${group.title}`)
      for (const row of group.rows) lines.push(`- ${row.label}：${row.value}`)
    }
    const earliest = read.events[0]?.at
    const earliestDay = earliest === undefined ? undefined : localDate(earliest, tz)
    const pieces = [`最早 ${earliestDay ?? '—'}`, `今天 ${read.events.filter(event => localDate(event.at, tz) === today).length} 条`]
    const coverage = metrics.coverage
    if (coverage === undefined) {
      pieces.push('本进程的丢失与自查：指标行不在')
    }
    else {
      pieces.push(coverage.dropped === 0 ? '本进程丢了 0 条' : `本进程丢了 ${coverage.dropped} 条（${coverage.reason ?? '原因未知'}）`)
      pieces.push(`上次自查${coverage.selfcheck}`)
      pieces.push(`无项目的事件 ${coverage.noProject} 条`)
    }
    if (earliest !== undefined) {
      const graphEarliest = await earliestGraphEntry(graph)
      if (graphEarliest !== undefined && Date.parse(graphEarliest) < Date.parse(earliest)) pieces.push(`图上有更早的记录，流水从 ${earliest.slice(0, 10)} 起`)
    }
    lines.push(`- 记录：${pieces.join('，')}`)
    return lines
  }
  catch (error) {
    return ['## 指标（流水）', `- 指标流水读不到：${error instanceof Error ? error.message : String(error)}`]
  }
}

/** The earliest history instant the project graph remembers, or undefined when it cannot be read (the report already names that in its own section). */
async function earliestGraphEntry(graph: GraphReader): Promise<string | undefined> {
  try {
    const loaded = await graph()
    let earliest: string | undefined = undefined
    for (const node of loaded.nodes.values()) {
      for (const entry of node.history) {
        if (earliest === undefined || entry.at < earliest) earliest = entry.at
      }
    }
    return earliest
  }
  catch {
    return undefined
  }
}
