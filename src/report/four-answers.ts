/**
 * The four-answers morning report (M7 design 0.6 §3.10, m7-6): one text that
 * answers four questions — what the goals amount to, how the plan went, why
 * things were decided, how the architecture stands — and carries what waits
 * for the person, the checks and reviews, the spend and the exceptions.
 * Pure: reads a loaded graph, the execute journals and the status hub's
 * entries, emits text.
 *
 * Same source (status hub design 0.3 §12 M7 row): the rows another module
 * owns — the peak, the quota, the usage, the check timeouts, the lifts and
 * the suppression count — come in as the hub's entries and are never
 * recomputed here; what the report owns (the goal and task counts, the
 * checks, the advances, the drive) is computed here from the same records
 * the execute row writes. The exception section therefore states the
 * whole-journal account the entries carry, not a period slice.
 *
 * Same input, same text word for word (m7-6 acceptance): no clock and no
 * random read inside — `nowMs` and the period come in with the input, and
 * every listing walks its records in a fixed order. Each section leads with
 * its number and at most five detail lines, the rest counted in one 「还有 N
 * 条」 line. The report's own words pass the plain-words check (no 门禁, no
 * 验收, no 标定); node titles and reasons are the graph's data and are
 * quoted as recorded.
 */
import { derivedStage } from '../graph/execute-stage.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { reopenCount } from '../graph/reopen.ts'
import type { GraphNode, Stage } from '../graph/schema.ts'
import type { AdvanceRecord } from '../execute/advance.ts'
import type { DriveLine } from '../execute/drive-log.ts'
import type { VerifiedCheck } from '../execute/check.ts'
import type { StatusItem } from '../shared/status.ts'
import type { AskSummary } from '../workflow/morning-report.ts'
import { effectCheckLines, type EffectCheck } from '../memory/effect.ts'

/** Why the project graph could not be read; the report names it in place of the numbers. */
interface GraphUnreadable {
  readonly unreadable: string
}

export interface FourAnswersInput {
  /** The report's period label, as the title carries it (2026-11-14). */
  readonly period: string
  /** The moment the report is made, epoch milliseconds: fixed by the caller so the text is reproducible. */
  readonly nowMs: number
  /** ISO instant the period starts at (inclusive); undefined reads the whole history. */
  readonly since?: string | undefined
  /** The status hub's agent entries (`collectStatus(..., 'agent', now).items`), the rows other modules own. */
  readonly status: readonly StatusItem[]
  /** The project graph, or why it could not be read. */
  readonly graph: LoadedGraph | GraphUnreadable
  /** The asks of the graph (the questions that wait for the person); absent when the graph could not be read. */
  readonly asks?: AskSummary | undefined
  /** The verified records of `<exec>/checks.jsonl` (src/execute/check.ts readChecks), oldest first. */
  readonly checks?: readonly VerifiedCheck[] | undefined
  /** The lines of `<exec>/advances.jsonl` (src/execute/check.ts readAdvances), oldest first. */
  readonly advances?: readonly AdvanceRecord[] | undefined
  /** The lines of `<exec>/drive.jsonl` (src/execute/drive-log.ts readDrive), oldest first. */
  readonly drive?: readonly DriveLine[] | undefined
  /** The rows whose status could not be read (`statusPlaceholders` of the collector's `rows`), named where the exceptions are listed. */
  readonly placeholders?: readonly string[] | undefined
  /** The checks of the rule proposals whose days are up (src/workflow/morning-report.ts readEffects), the section the /hourness report carries after its exceptions. */
  readonly effects?: readonly EffectCheck[] | undefined
  /** The display zone the rule-check lines word their days in, minutes east of UTC; default UTC+8, the reports' zone. */
  readonly offsetMinutes?: number | undefined
}

/** The design-loop stages in the words the report uses (no map like it exists; the stage row names one). */
const STAGE_WORDS: Readonly<Record<Stage, string>> = {
  wish: '愿望',
  interview: '访谈',
  design: '设计',
  release: '放行',
  decompose: '分解',
  execute: '执行',
  merge: '合入',
  operate: '运维',
}

/** Detail lines a section lists before the 「还有 N 条」 count (design §3.10). */
const DETAIL_MAX = 5

/** One reason as a detail line carries it: one line of at most 80 code points. */
function shortReason(reason: string): string {
  const flat = reason.replace(/[\r\n]+/g, ' ').trim()
  return [...flat].length <= 80 ? flat : `${[...flat].slice(0, 79).join('')}…`
}

/** The lines of one hub entry: its human line, then its detail. Empty when the entry is not there. */
export function hubEntryLines(items: readonly StatusItem[], id: string): string[] {
  const item = items.find(entry => entry.id === id)
  if (item === undefined) return []
  return [item.text, ...(item.detail ?? [])]
}

/** The lines of every entry a module owns, in the collector's order. */
function ownerLines(items: readonly StatusItem[], owner: string): string[] {
  return items.filter(item => item.owner === owner).flatMap(item => [item.text, ...(item.detail ?? [])])
}

/** At most `DETAIL_MAX` lines, the rest counted. */
function capped(lines: readonly string[]): string[] {
  return lines.length <= DETAIL_MAX ? [...lines] : [...lines.slice(0, DETAIL_MAX), `（还有 ${lines.length - DETAIL_MAX} 条）`]
}

interface Period {
  readonly sinceMs?: number | undefined
}

/** Whether a record's instant sits in the period (at or after its start). */
function inPeriod(period: Period, at: string | undefined): boolean {
  if (at === undefined) return period.sinceMs === undefined
  const ms = Date.parse(at)
  if (Number.isNaN(ms)) return false
  return period.sinceMs === undefined || ms >= period.sinceMs
}

/** The stage of a goal in the report's words; a stage the graph cannot derive falls back to the node's own, else a dash. */
function stageWord(graph: LoadedGraph, goal: GraphNode): string {
  try {
    return STAGE_WORDS[derivedStage(graph, goal)]
  }
  catch {
    return goal.stage === undefined ? '—' : STAGE_WORDS[goal.stage]
  }
}

/** The children of every node that has one, keyed by parent id. */
function childrenOf(graph: LoadedGraph): Map<string, GraphNode[]> {
  const children = new Map<string, GraphNode[]>()
  for (const node of graph.nodes.values()) {
    if (node.parent === undefined) continue
    children.set(node.parent, [...children.get(node.parent) ?? [], node])
  }
  return children
}

/** 一、目标：one line per open goal — its stage, its tasks done, the advances of the period that carried them. */
function goalLines(graph: LoadedGraph, period: Period, advances: readonly AdvanceRecord[]): string[] {
  const children = childrenOf(graph)
  const tasksUnder = (id: string): Set<string> => {
    const ids = new Set<string>()
    const walk = (parent: string): void => {
      for (const child of children.get(parent) ?? []) {
        if (child.type === 'task') ids.add(child.id)
        walk(child.id)
      }
    }
    walk(id)
    return ids
  }
  const lines: string[] = []
  const goals = [...graph.nodes.values()]
    .filter(node => node.type === 'goal' && (node.status === 'proposed' || node.status === 'approved' || node.status === 'doing'))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  for (const goal of goals) {
    const tasks = tasksUnder(goal.id)
    const done = [...tasks].filter(id => graph.nodes.get(id)?.status === 'done').length
    const merged = advances.filter(advance => advance.ok === true && inPeriod(period, advance.at) && (advance.tasks ?? []).some(task => tasks.has(task))).length
    lines.push(`- ${goal.title}：${stageWord(graph, goal)}；任务完成 ${done}/${tasks.size}，本期进主干 ${merged} 次`)
  }
  return lines
}

/** 二、规划：the tasks the agent added and dropped, and the reopens, of the period. */
function planLines(graph: LoadedGraph, period: Period): string[] {
  const inRange = (at: string | undefined): boolean => inPeriod(period, at)
  const added: string[] = []
  let dropped = 0
  const reworked: string[] = []
  let reopens = 0
  for (const node of graph.nodes.values()) {
    if (node.type !== 'task') continue
    const first = node.history[0]
    if (first !== undefined && first.op === 'propose' && first.actor === 'llm' && inRange(first.at)) added.push(node.title)
    if (node.history.some(entry => entry.op === 'status' && entry.to === 'dropped' && inRange(entry.at))) dropped += 1
    const count = reopenCount(node, period.sinceMs === undefined ? undefined : new Date(period.sinceMs).toISOString())
    if (count > 0) {
      reopens += count
      reworked.push(node.title)
    }
  }
  const lines: string[] = [`- 本期新增任务 ${added.length} 个、废弃 ${dropped} 个`]
  lines.push(...capped(added.map(title => `  - ${title}`)))
  if (reopens > 0) {
    const names = reworked.length <= DETAIL_MAX ? reworked.join('、') : `${reworked.slice(0, DETAIL_MAX).join('、')}等 ${reworked.length} 个节点`
    lines.push(`- 返工（重开）${reopens} 次：${names}`)
  }
  return lines
}

/** 三、理由：the matters the agent decided itself (no human words behind it), with one reason each. */
function reasonLines(graph: LoadedGraph, period: Period): string[] {
  const decided: { title: string, reason: string }[] = []
  for (const node of graph.nodes.values()) {
    for (const entry of node.history) {
      if (entry.op !== 'decide' || entry.actor !== 'llm' || entry.relay !== undefined || entry.reason === undefined) continue
      if (!inPeriod(period, entry.at)) continue
      decided.push({ title: node.title, reason: entry.reason })
    }
  }
  return [
    `- agent 自己定了 ${decided.length} 件`,
    ...capped(decided.map(item => `  - ${item.title}：${shortReason(item.reason)}`)),
  ]
}

/** 四、架构：the decisions adopted but not verified, and the ones the period overturned or superseded. */
function architectureLines(graph: LoadedGraph, period: Period): string[] {
  let adopted = 0
  let overturned = 0
  let superseded = 0
  for (const node of graph.nodes.values()) {
    if (node.type === 'decision' && node.status === 'approved' && (node.verification === undefined || node.verification === 'unverified')) adopted += 1
    for (const entry of node.history) {
      if (!inPeriod(period, entry.at)) continue
      if (entry.op === 'supersede') superseded += 1
      if ((entry.op === 'verify' || entry.op === 'status') && entry.to === 'overturned') overturned += 1
    }
  }
  const lines = [`- 已采纳还没验证的决定 ${adopted} 件`]
  if (overturned > 0 || superseded > 0) lines.push(`- 本期被推翻 ${overturned} 件、被取代 ${superseded} 件`)
  return lines
}

/** 在等你回话的：what the asks carry, and whether the drive stands stopped. `graphWhy` names an unreadable graph. */
function waitingLines(asks: AskSummary | undefined, graphWhy: string | undefined, drive: readonly DriveLine[], nowMs: number): string[] {
  const lines: string[] = []
  if (graphWhy !== undefined) lines.push('- 项目图读不到，等你回话的件数不知道')
  else if (asks === undefined) lines.push('- 等你回话的件数不知道（这次调用没有带上）')
  else {
    const { count, oldest } = asks.waiting
    if (count === 0) lines.push('- 等你回话的 0 件')
    else if (oldest === undefined) lines.push(`- 等你回话的 ${count} 件`)
    else {
      const days = Math.max(0, Math.floor((nowMs - Date.parse(oldest)) / 86_400_000))
      lines.push(`- 等你回话的 ${count} 件，最早一件是 ${oldest} 提出的（等了 ${days} 天）`)
    }
  }
  const last = drive.at(-1)
  if (last !== undefined && (last.op === 'pause' || last.op === 'peak-wait' || last.op === 'design-wait')) {
    const why = last.op === 'peak-wait' ? '高峰里停着，等接上' : last.op === 'design-wait' ? '退回设计，等重新放行' : '停着'
    lines.push(`- 自动推进${why}`)
  }
  return lines
}

/** 检查与审查：the checks of the period — how many ran, how many tasks passed the first time, the failures by command. */
function checkLines(checks: readonly VerifiedCheck[], period: Period): string[] {
  const ran = checks.filter(record => inPeriod(period, record.at))
  const firstOfTask = new Map<string, VerifiedCheck>()
  for (const record of ran) {
    for (const task of record.tasks) if (!firstOfTask.has(task)) firstOfTask.set(task, record)
  }
  const firstPass = [...firstOfTask.values()].filter(record => record.passed).length
  const lines = [`- 合入前的检查跑了 ${ran.length} 次，第一次就过 ${firstPass}/${firstOfTask.size}`]
  const byCommand = new Map<string, number>()
  for (const record of ran) {
    if (record.passed) continue
    for (const command of record.detail.commands) {
      if (command.exit === 0) continue
      byCommand.set(command.line, (byCommand.get(command.line) ?? 0) + 1)
    }
  }
  lines.push(...capped([...byCommand].sort(([left], [right]) => (left < right ? -1 : 1)).map(([line, count]) => `  - 没过：${line} × ${count}`)))
  return lines
}

/** The advances of the period that reached the trunk without a passed check, local and remote counted apart. */
function uncheckedAdvances(advances: readonly AdvanceRecord[], period: Period): { local: number, remote: number, floors: readonly string[] } {
  let local = 0
  let remote = 0
  const floors = new Set<string>()
  for (const advance of advances) {
    if (advance.ok !== true || !inPeriod(period, advance.at) || advance.check !== undefined) continue
    if (advance.ref === 'local') local += 1
    else remote += 1
    for (const file of advance.incomingFloor ?? []) floors.add(file)
  }
  return { local, remote, floors: [...floors] }
}

/** Render the four-answers morning report for one period. */
export function fourAnswers(input: FourAnswersInput): string {
  const parsed = input.since === undefined ? Number.NaN : Date.parse(input.since)
  const period: Period = { sinceMs: Number.isFinite(parsed) ? parsed : undefined }
  const graph = 'nodes' in input.graph ? input.graph : undefined
  const unreadable = 'unreadable' in input.graph ? input.graph.unreadable : undefined
  const lines: string[] = [`# 晨报 ${input.period}`]
  const now = hubEntryLines(input.status, 'rules/peak')
  const quota = input.status.find(item => item.id === 'glm/quota')
  if (quota !== undefined) now.push(quota.text, ...(quota.detail ?? []))
  now.push(...ownerLines(input.status, 'execute'))
  if (now.length > 0) lines.push('', '## 现在', ...now)

  lines.push('', '## 一、目标')
  if (graph === undefined) lines.push(`- 项目图读不到：${unreadable ?? ''}`)
  else {
    const goals = goalLines(graph, period, input.advances ?? [])
    lines.push(...(goals.length === 0 ? ['- 无进行中的目标'] : goals))
  }

  lines.push('', '## 二、规划')
  lines.push(...(graph === undefined ? ['- 项目图读不到'] : planLines(graph, period)))

  lines.push('', '## 三、理由')
  lines.push(...(graph === undefined ? ['- 项目图读不到'] : reasonLines(graph, period)))

  lines.push('', '## 四、架构')
  lines.push(...(graph === undefined ? ['- 项目图读不到'] : architectureLines(graph, period)))

  lines.push('', '## 在等你回话的')
  lines.push(...waitingLines(input.asks, graph === undefined ? unreadable : undefined, input.drive ?? [], input.nowMs))

  lines.push('', '## 检查与审查')
  lines.push(...checkLines(input.checks ?? [], period))

  const usage = hubEntryLines(input.status, 'glm/usage')
  lines.push('', '## 花了多少')
  lines.push(...(usage.length === 0 ? ['- 无模型调用'] : usage))

  const exceptions: string[] = []
  exceptions.push(...hubEntryLines(input.status, 'rules/denials'))
  exceptions.push(...hubEntryLines(input.status, 'rules/lifts'))
  exceptions.push(...hubEntryLines(input.status, 'env/suppressions'))
  exceptions.push(...hubEntryLines(input.status, 'env/timeouts'))
  const unchecked = uncheckedAdvances(input.advances ?? [], period)
  if (unchecked.local + unchecked.remote > 0) exceptions.push(`- 没经检查的主干前进：本地 ${unchecked.local} 次、远端 ${unchecked.remote} 次`)
  if (unchecked.floors.length > 0) {
    const names = unchecked.floors.length <= DETAIL_MAX ? unchecked.floors.join('、') : `${unchecked.floors.slice(0, DETAIL_MAX).join('、')}等 ${unchecked.floors.length} 个文件`
    exceptions.push(`- 拉来的提交带着没全审的改动：${names}`)
  }
  if (graph !== undefined) {
    const retros = [...graph.nodes.values()].filter((node) => {
      const first = node.history[0]
      return node.type === 'retro' && first !== undefined && first.op === 'propose' && inPeriod(period, first.at)
    }).length
    if (retros > 0) exceptions.push(`- 新增复盘 ${retros} 件`)
  }
  exceptions.push(...(input.placeholders ?? []))
  lines.push('', '## 例外')
  lines.push(...(exceptions.length === 0 ? ['- 无'] : exceptions))

  // The rule proposals' checks (docs/ORCHESTRATION.md §12): the same section
  // the /hourness report carries after its exceptions, its lines the memory
  // module's own words; the section stands only when something is to say.
  lines.push(...effectCheckLines(input.effects ?? [], input.offsetMinutes ?? 480))

  return lines.join('\n')
}
