/**
 * Morning report: fold one period of the audit journal (decisions, violations,
 * usage) into the harvest report. Pure — reads parsed JSONL lines, emits text.
 * Granularity: exceptions first, then curve movement, then plain
 * facts; no padding, no restatement of completed work. The usage section is
 * the usage panel's list (src/report/panel.ts), priced through the pricing
 * service when there is one.
 */
import { auditPaths, type DecisionRecord, type UsageRecord } from '../memory/audit.ts'
import type { GuardRecord } from '../guard/index.ts'
import { gapLines, parseGaps, usagePanelLines, usagePanelOf, type PanelLineOptions } from '../report/panel.ts'
import type { DataHomes } from '../shared/data-home.ts'
import type { UsagePricing } from '../shared/pricing.ts'
import type { MomentZone } from '../shared/quota.ts'

export interface ReportInput {
  readonly decisions: readonly DecisionRecord[]
  /** Guard denials and shadow records (`mode: 'shadow'`, recorded without blocking). */
  readonly violations: readonly GuardRecord[]
  readonly usage: readonly UsageRecord[]
  readonly period: string
  /** Prices the usage section in credits; without it the section lists calls and tokens. */
  readonly pricing?: UsagePricing | undefined
  /** Hears about a pricing service that throws. */
  readonly problem?: ((message: string) => void) | undefined
  /** Finished list lines for the usage section after its first line: the gaps in the records the period covers. */
  readonly usageScope?: readonly string[] | undefined
}

/** Render the morning report for one period. */
export function morningReport(input: ReportInput): string {
  const lines: string[] = [`# 晨报 ${input.period}`]

  const l3 = input.decisions.filter(decision => decision.level === 'L3')
  // A guard denial carries no mode; the rules board's denial says `enforce`, and a call it only recorded (`record`) is neither a violation nor a shadow record.
  const denials = input.violations.filter(violation => violation.mode === undefined || violation.mode === 'enforce')
  const shadows = input.violations.filter(violation => violation.mode === 'shadow')
  // Records from routes the GLM dialect did not claim count apart (src/guard/origin.ts):
  // the rules were tuned on GLM, so their misfires elsewhere stay visible.
  // Records without a scope predate split step 7 and were all GLM.
  const countByRule = (records: readonly GuardRecord[]): Map<string, number> => {
    const byRule = new Map<string, number>()
    for (const record of records) {
      const label = record.scope === 'other' ? `${record.rule}（其他路由）` : record.rule
      byRule.set(label, (byRule.get(label) ?? 0) + 1)
    }
    return byRule
  }
  lines.push('')
  lines.push('## 例外（先看）')
  if (l3.length === 0 && denials.length === 0) {
    lines.push('- 无')
  }
  else {
    for (const decision of l3) lines.push(`- [L3] ${decision.kind}: ${decision.subject}`)
    for (const [rule, count] of countByRule(denials)) lines.push(`- 违规 ${rule} × ${count}`)
  }

  lines.push('')
  lines.push('## 决策曲线')
  const graded = new Map<string, number>()
  for (const decision of input.decisions) graded.set(decision.level, (graded.get(decision.level) ?? 0) + 1)
  lines.push(`- L1 自主 ${graded.get('L1') ?? 0} · L2 次日报备 ${graded.get('L2') ?? 0} · L3 当次申报 ${graded.get('L3') ?? 0}`)

  // Shadow records were never blocked; they measure a rule before it is enforced.
  if (shadows.length > 0) {
    lines.push('')
    lines.push('## 影子记录（只记录，未拦截）')
    for (const [rule, count] of countByRule(shadows)) lines.push(`- ${rule} × ${count}`)
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
  const readJsonl = async (path: string | undefined) => {
    if (path === undefined) return []
    try {
      const raw = await fs.readFile(path)
      return raw.split('\n').filter(line => line.trim().length > 0).flatMap(line => {
        try {
          return [JSON.parse(line)]
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
  const inPeriod = (records: Array<{ at?: unknown }>) => sinceMs === undefined || Number.isNaN(sinceMs)
    ? records
    : records.filter(record => typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at)) && Date.parse(record.at) >= sinceMs)
  const paths = auditPaths(homes)
  const gapRaw = paths.gaps === undefined ? '' : await fs.readFile(paths.gaps).catch(() => '')
  const periodStart = sinceMs === undefined || Number.isNaN(sinceMs) ? undefined : sinceMs
  const zone: MomentZone = options.offsetMinutes === undefined ? {} : { offsetMinutes: options.offsetMinutes }
  return morningReport({
    decisions: inPeriod(await readJsonl(paths.decisions)) as DecisionRecord[],
    violations: inPeriod(await readJsonl(paths.violations)) as GuardRecord[],
    usage: inPeriod(await readJsonl(paths.usage)) as UsageRecord[],
    period,
    pricing: options.pricing,
    problem: options.problem,
    usageScope: gapLines(parseGaps(gapRaw), options.now ?? Date.now(), zone, periodStart),
  })
}
