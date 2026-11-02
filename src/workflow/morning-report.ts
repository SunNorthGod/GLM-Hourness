/**
 * Morning report: fold one period of the audit journal (decisions, violations,
 * usage) into the harvest report. Pure — reads parsed JSONL lines, emits text.
 * Granularity: exceptions first, then curve movement, then plain
 * facts; no padding, no restatement of completed work. The usage section is
 * the usage panel's list (src/report/panel.ts), priced through the pricing
 * service when there is one. The journal's lines are classified through the
 * one classifier every reader shares (src/guard/records.ts classifyRecord,
 * m4-gate G1): denials and late denials are the violations, a late denial is
 * counted on its own line, the rules board's recorded calls and the gaps the
 * journal itself wrote get their own lines, and anything unreadable is
 * counted at the end instead of silently shaping the numbers.
 */
import { auditPaths, type DecisionRecord, type UsageRecord } from '../memory/audit.ts'
import { classifyRecord, type GuardRecord } from '../guard/records.ts'
import type { SuppressionRecord } from '../env/suppressions.ts'
import { gapLines, parseGaps, usagePanelLines, usagePanelOf, type PanelLineOptions } from '../report/panel.ts'
import type { DataHomes } from '../shared/data-home.ts'
import type { UsagePricing } from '../shared/pricing.ts'
import type { MomentZone } from '../shared/quota.ts'

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
  /** The display zone for the gap line's timestamp, minutes east of UTC; default UTC+8, the report's peak-hour zone. */
  readonly offsetMinutes?: number | undefined
}

/** The lines the 例外 section carries besides the L3 decisions and the per-rule counts, in the order they are written. */
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

/** A journal timestamp as the report writes clock times: `MM-DD HH:mm` in the display zone. */
function renderStamp(at: number, offsetMinutes: number): string {
  const shifted = new Date(at + offsetMinutes * 60_000)
  const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${shifted.getUTCDate()}`.padStart(2, '0')
  const hour = `${shifted.getUTCHours()}`.padStart(2, '0')
  const minute = `${shifted.getUTCMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
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
  const auxiliary: Auxiliary[] = [
    ...(late > 0 ? [`- 其中晚到的拦下 ${late} 条`] : []),
    ...(recorded > 0 ? [`- 只记录 ${recorded} 条（规则板上人选的做法）`] : []),
    ...(gapLine === undefined ? [] : [gapLine]),
    ...(unreadable > 0 ? [`- ${unreadable} 行记录读不懂`] : []),
  ]

  const l3 = input.decisions.filter(decision => decision.level === 'L3')
  lines.push('')
  lines.push('## 例外（先看）')
  // 「无」 answers the violations; the lines below it count what the journal
  // holds besides them (late denials, recorded calls, gaps, unreadable lines).
  if (l3.length === 0 && denials.length === 0) lines.push('- 无')
  for (const decision of l3) lines.push(`- [L3] ${decision.kind}: ${decision.subject}`)
  lines.push(...violationLines(denials))
  lines.push(...auxiliary)

  // The suppression-comment total and its movement over the period (m4-suppressions §6.7):
  // rises and falls counted apart, so a net-zero period with churn still shows.
  const suppressionLine = suppressionLineOf(input.suppressions ?? [])
  if (suppressionLine !== undefined) lines.push(suppressionLine)

  lines.push('')
  lines.push('## 决策曲线')
  const graded = new Map<string, number>()
  for (const decision of input.decisions) graded.set(decision.level, (graded.get(decision.level) ?? 0) + 1)
  lines.push(`- L1 自主 ${graded.get('L1') ?? 0} · L2 次日报备 ${graded.get('L2') ?? 0} · L3 当次申报 ${graded.get('L3') ?? 0}`)

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
}

/**
 * Assemble the morning report from the audit journal files: decisions and
 * violations from the project directory, usage and the gap file (the
 * deletions of usage records) from the user directory (docs/DESIGN.md §2.4);
 * an unknown directory reads as an empty journal.
 * `since` (ISO instant) bounds the period: only records stamped at or after
 * it enter the report, so one period reports on that window, not on all
 * history. The usage section names the gaps that period meets.
 */
export async function reportFromFiles(fs: ReportFs, homes: DataHomes, period: string, since?: string, options: ReportOptions = {}): Promise<string> {
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
  const sinceMs = since === undefined ? undefined : Date.parse(since)
  const inPeriod = <T extends { readonly at?: unknown }>(records: readonly T[]): readonly T[] => sinceMs === undefined || Number.isNaN(sinceMs)
    ? records
    : records.filter(record => typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at)) && Date.parse(record.at) >= sinceMs)
  const paths = auditPaths(homes)
  const gapRaw = paths.gaps === undefined ? '' : await fs.readFile(paths.gaps).catch(() => '')
  const periodStart = sinceMs === undefined || Number.isNaN(sinceMs) ? undefined : sinceMs
  const zone: MomentZone = options.offsetMinutes === undefined ? {} : { offsetMinutes: options.offsetMinutes }
  return morningReport({
    decisions: inPeriod(await readJsonl<DecisionRecord>(paths.decisions)),
    violations: inPeriod(await readJsonl<GuardRecord>(paths.violations)),
    usage: inPeriod(await readJsonl<UsageRecord>(paths.usage)),
    suppressions: inPeriod(await readJsonl<SuppressionRecord>(paths.suppressions)),
    period,
    pricing: options.pricing,
    problem: options.problem,
    usageScope: gapLines(parseGaps(gapRaw), options.now ?? Date.now(), zone, periodStart),
    offsetMinutes: options.offsetMinutes,
  })
}
