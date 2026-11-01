/**
 * Morning report: fold one period of the audit journal (dispatch calls,
 * violations, usage) and the project graph (the asks waiting for the person
 * and who settled the others) into the harvest report. Pure — reads parsed
 * JSONL lines and a loaded graph, emits text. Granularity: exceptions first,
 * then what waits for the person, then plain facts; no padding, no
 * restatement of completed work.
 */
import { auditPaths, type DecisionRecord, type UsageRecord } from '../memory/audit.ts'
import type { GuardRecord } from '../guard/index.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { listOpenItems } from '../graph/projection.ts'
import type { HistoryEntry } from '../graph/schema.ts'
import { answerKindOf } from '../shared/answer-marks.ts'
import type { DataHomes } from '../shared/data-home.ts'

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
  /** Guard denials and shadow records (`mode: 'shadow'`, recorded without blocking). */
  readonly violations: readonly GuardRecord[]
  readonly usage: readonly UsageRecord[]
  readonly period: string
  /** The asks on the project graph, or why they could not be read. */
  readonly asks: AskSummary | GraphUnreadable
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

  const denials = input.violations.filter(violation => !('mode' in violation))
  const shadows = input.violations.filter(violation => 'mode' in violation && violation.mode === 'shadow')
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
  if (denials.length === 0) {
    lines.push('- 无')
  }
  else {
    for (const [rule, count] of countByRule(denials)) lines.push(`- 违规 ${rule} × ${count}`)
  }

  lines.push('')
  lines.push('## 等你定的事')
  lines.push(...askLines(input.asks, input.decisions.filter(isDispatch).length))

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
 * Assemble the morning report from the audit journal files: dispatch calls
 * and violations from the project directory, usage from the user directory
 * (docs/DESIGN.md §2.4); an unknown directory reads as an empty journal. The
 * asks come from the project graph `graph` reads. `since` (ISO instant)
 * bounds the period: only records stamped at or after it enter the report,
 * so one period reports on that window, not on all history.
 */
export async function reportFromFiles(fs: ReportFs, homes: DataHomes, period: string, graph: GraphReader, since?: string): Promise<string> {
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
    asks: await readAsks(graph, since),
  })
}
