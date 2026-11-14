/**
 * The weekly report (M7 design 0.6 §3.12, m7-8; the batch-6 shape of
 * status hub design 0.3 §6, §12 M7 row): what the person's burden did this
 * week, stated the way the person decided it (`d-metrics-ratios-person-only`,
 * 2026-11-01) — the main agent relays the charter's four burden numbers and
 * nothing else. Three of them come from the hub's `metrics/load` entry (the
 * board's relayed load group, one computation with the metrics board); the
 * fourth (the rework after the person's own calls) the report computes from
 * the project graph (§3.12.3). The operations state the reports relay beside
 * it — the denials, the lifts, the suppression count, the check timeouts —
 * are the hub's entries again, never recomputed; the loop board's two weekly
 * lists arrive as its `loops/*` entries once the board's service grows the
 * readers for them (staleEntries, timeoutEntries) and are rendered from
 * whatever entries that owner holds. Every other number is a ratio and stays
 * on the panel's metrics board: the last line says so.
 *
 * Pure and reproducible like the four-answers report (src/report/
 * four-answers.ts): the clock and the period come in with the input.
 */
import type { LoadedGraph } from '../graph/parse.ts'
import { reopensAfter } from '../graph/reopen.ts'
import type { GraphNode, HistoryEntry } from '../graph/schema.ts'
import type { StatusItem } from '../shared/status.ts'
import { hubEntryLines } from './four-answers.ts'

/** Why the project graph could not be read; the report names it in place of the numbers. */
interface GraphUnreadable {
  readonly unreadable: string
}

export interface WeeklyReportInput {
  /** The report's period label, as the title carries it (2026-11-14). */
  readonly period: string
  /** The moment the report is made, epoch milliseconds. */
  readonly nowMs: number
  /** ISO instant the week starts at (inclusive); undefined reads the whole history. */
  readonly since?: string | undefined
  /** The status hub's agent entries (`collectStatus(..., 'agent', now).items`). */
  readonly status: readonly StatusItem[]
  /** The project graph, or why it could not be read. */
  readonly graph: LoadedGraph | GraphUnreadable
  /** The rows whose status could not be read (`statusPlaceholders` of the collector's `rows`), said before the closing line. */
  readonly placeholders?: readonly string[] | undefined
}

/** How far before a reopen the person's call still counts as its cause (§3.12.3 「重开之前 7 天内」). */
const CAUSE_WINDOW_MS = 7 * 86_400_000

/** The graph the report reads, or undefined when it could not. */
function readable(graph: LoadedGraph | GraphUnreadable): LoadedGraph | undefined {
  return 'nodes' in graph ? graph : undefined
}

/** Whether one history entry is the person's: their own hand, or their checked words relayed. */
function isHumanCall(entry: HistoryEntry): boolean {
  return entry.actor === 'human' || (entry.actor === 'llm' && entry.relay !== undefined)
}

/** Whether the person re-decided, overturned or superseded something on `node` in the window before `toMs`. */
function humanCallNear(node: GraphNode, fromMs: number, toMs: number): boolean {
  return node.history.some((entry) => {
    const at = Date.parse(entry.at)
    if (Number.isNaN(at) || at < fromMs || at >= toMs) return false
    if (entry.op === 'decide' && isHumanCall(entry)) return true
    if (entry.op === 'supersede') return true
    return (entry.op === 'verify' || entry.op === 'status') && (entry.to === 'overturned' || entry.to === 'superseded')
  })
}

/**
 * The fourth burden number (§3.12.3): of the week's reopens, the ones whose
 * cause chain — the node itself and its ancestors; a source edge is not read
 * here yet — holds a call, an overturn or a supersede of the person within
 * the seven days before it.
 */
export function reworkAfterHuman(graph: LoadedGraph, sinceMs: number | undefined): number {
  let count = 0
  for (const node of graph.nodes.values()) {
    for (const reopen of reopensAfter(node, sinceMs === undefined ? undefined : new Date(sinceMs).toISOString())) {
      const at = Date.parse(reopen.at)
      if (Number.isNaN(at)) continue
      let current: GraphNode | undefined = node
      const seen = new Set<string>()
      while (current !== undefined && !seen.has(current.id)) {
        seen.add(current.id)
        if (humanCallNear(current, at - CAUSE_WINDOW_MS, at)) {
          count += 1
          break
        }
        current = current.parent === undefined ? undefined : graph.nodes.get(current.parent)
      }
    }
  }
  return count
}

/** The report's status section from the hub's operations entries, in the collector's order. */
function operationsLines(items: readonly StatusItem[]): string[] {
  const ids = ['rules/denials', 'rules/lifts', 'env/suppressions', 'env/timeouts']
  return ids.flatMap(id => hubEntryLines(items, id))
}

/** The loop board's two weekly lists, as far as its entries exist (`loops/*`; the board's staleEntries and timeoutEntries arrive with its service). */
function loopsLines(items: readonly StatusItem[]): string[] {
  return items.filter(item => item.owner === 'loops').flatMap(item => [item.text, ...(item.detail ?? [])])
}

/** Render the weekly report for one week. */
export function weeklyReport(input: WeeklyReportInput): string {
  const parsed = input.since === undefined ? Number.NaN : Date.parse(input.since)
  const sinceMs = Number.isFinite(parsed) ? parsed : undefined
  const graph = readable(input.graph)
  const lines: string[] = [`# 周报 ${input.period}`]

  lines.push('', '## 人的负担')
  const load = hubEntryLines(input.status, 'metrics/load')
  if (load.length === 0) lines.push('- 减负数字读不到（指标行没启用，或指标板还没算出最近 7 天的数）')
  else lines.push(...load)
  if (graph === undefined) lines.push(`- 项目图读不到：${('unreadable' in input.graph) ? input.graph.unreadable : ''}`)
  else lines.push(`- 因人的决定返工 ${reworkAfterHuman(graph, sinceMs)} 次（近 7 天）`)

  const operations = operationsLines(input.status)
  if (operations.length > 0) lines.push('', '## 拦下与撤下', ...operations)

  const loops = loopsLines(input.status)
  if (loops.length > 0) lines.push('', '## 两张单子', ...loops)

  for (const placeholder of input.placeholders ?? []) lines.push('', placeholder)
  lines.push('', '其余的数字在面板的指标板上：比率与对照只给人看，不进对话。')
  return lines.join('\n')
}
