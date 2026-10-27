/**
 * Morning report: fold one period of the audit journal (decisions, violations,
 * usage) into the harvest report. Pure — reads parsed JSONL lines, emits text.
 * Granularity: exceptions first, then curve movement, then plain
 * facts; no padding, no restatement of completed work.
 */
import { auditPaths, type DecisionRecord, type UsageRecord } from '../memory/audit.ts'
import type { GuardRecord } from '../guard/index.ts'
import type { DataHomes } from '../shared/data-home.ts'

export interface ReportInput {
  readonly decisions: readonly DecisionRecord[]
  /** Guard denials and shadow records (`mode: 'shadow'`, recorded without blocking). */
  readonly violations: readonly GuardRecord[]
  readonly usage: readonly UsageRecord[]
  readonly period: string
}

/** Aggregate usage per model (ZCode panel vocabulary: in/out/total). */
export function usageByModel(records: readonly UsageRecord[]): Array<{ model: string, calls: number, inputTokens: number, outputTokens: number, totalTokens: number }> {
  const byModel = new Map<string, { model: string, calls: number, inputTokens: number, outputTokens: number, totalTokens: number }>()
  for (const record of records) {
    const entry = byModel.get(record.model) ?? { model: record.model, calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    entry.calls += 1
    entry.inputTokens += record.usage.inputTokens
    entry.outputTokens += record.usage.outputTokens
    entry.totalTokens += record.usage.totalTokens ?? (record.usage.inputTokens + record.usage.outputTokens)
    byModel.set(record.model, entry)
  }
  return [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens)
}

/** Render the morning report for one period. */
export function morningReport(input: ReportInput): string {
  const lines: string[] = [`# 晨报 ${input.period}`]

  const l3 = input.decisions.filter(decision => decision.level === 'L3')
  const denials = input.violations.filter(violation => !('mode' in violation))
  const shadows = input.violations.filter(violation => 'mode' in violation && violation.mode === 'shadow')
  const countByRule = (records: readonly GuardRecord[]): Map<string, number> => {
    const byRule = new Map<string, number>()
    for (const record of records) byRule.set(record.rule, (byRule.get(record.rule) ?? 0) + 1)
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
  lines.push('## 用量')
  const models = usageByModel(input.usage)
  if (models.length === 0) lines.push('- 无模型调用')
  for (const model of models) {
    lines.push(`- ${model.model}: ${model.calls} 次 · in ${model.inputTokens} / out ${model.outputTokens} / total ${model.totalTokens}`)
  }

  return lines.join('\n')
}

/** Filesystem the report entry reads through (subset of node:fs/promises). */
export interface ReportFs {
  readFile(path: string): Promise<string>
}

/**
 * Assemble the morning report from the audit journal files: decisions and
 * violations from the project directory, usage from the user directory
 * (docs/DESIGN.md §2.4); an unknown directory reads as an empty journal.
 * `since` (ISO instant) bounds the period: only records stamped at or after
 * it enter the report, so one period reports on that window, not on all
 * history.
 */
export async function reportFromFiles(fs: ReportFs, homes: DataHomes, period: string, since?: string): Promise<string> {
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
  return morningReport({
    decisions: inPeriod(await readJsonl(paths.decisions)) as DecisionRecord[],
    violations: inPeriod(await readJsonl(paths.violations)) as GuardRecord[],
    usage: inPeriod(await readJsonl(paths.usage)) as UsageRecord[],
    period,
  })
}
