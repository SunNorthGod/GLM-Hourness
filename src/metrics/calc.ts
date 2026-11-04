/**
 * The computation (design §7.2): pure functions over `readLog` events —
 * no clock, no files, no randomness. `factsFor` gives the facts only (the
 * path that reaches the main agent's conversation), `scoresFor` the full
 * table including the scores (the command line's `summary` and, later, the
 * board view); `compare` groups the scores by build, model, host or role.
 * Any change to an accounting rule bumps CALC_VERSION, and the first line
 * of every output names its inputs (the basis line, F8), so the same input
 * renders byte for byte the same output (acceptance 8).
 */
import type { LogFindings } from './read.ts'
import type { MetricsEvent } from './schema.ts'

/** Bumped on every change of an accounting rule below. */
export const CALC_VERSION = 1

/** One rendered line: the label, the value (already `—` where a denominator is zero) and the machine-readable sample count where one exists. */
export interface CalcRow {
  readonly label: string
  readonly value: string
  readonly samples?: number
}

/** One titled block of rows, in the order the design's table lists them. */
export interface CalcGroup {
  readonly title: string
  readonly rows: readonly CalcRow[]
}

/** Everything the computation reads (§7.2): the window's events, the reader's and checker's findings, and the caller's window pieces. */
export interface CalcInput {
  readonly events: readonly MetricsEvent[]
  /** The readLog basis of the same window: the file names and their line counts (F8). */
  readonly basis: ReadonlyMap<string, number>
  /** Window start, inclusive (ISO instant). */
  readonly from: string
  /** Window end, exclusive. */
  readonly to: string
  /** `+08:00`-shaped offset the caller chose. */
  readonly tz: string
  /** `checkLog`'s findings for the same project: the coverage rows come from here. */
  readonly findings: LogFindings
  /** The local date (in `tz`) "today" counts against; without it the today line is omitted. */
  readonly today?: string
  /** M7's two quota codes (§7.2 额度停住). Absent — M7 has not fixed them — the stall line reads `—`, never 0 (§11 item 15). */
  readonly quota?: { readonly stallCode: string, readonly resumeCode: string }
}

const num = (body: Readonly<Record<string, unknown>>, key: string): number | undefined =>
  typeof body[key] === 'number' ? (body[key]) : undefined
const str = (body: Readonly<Record<string, unknown>>, key: string): string | undefined =>
  typeof body[key] === 'string' ? (body[key]) : undefined
const bool = (body: Readonly<Record<string, unknown>>, key: string): boolean | undefined =>
  typeof body[key] === 'boolean' ? (body[key]) : undefined

/** Odd count takes the middle value; even takes the mean of the two middle ones, rounded to whole (§7.2). */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const maxOf = (values: readonly number[]): number | undefined => values.length === 0 ? undefined : Math.max(...values)
const sumOf = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0)

/** One decimal, always (40.0%); `—` when the denominator is zero (§7.2). */
export function pct(part: number, whole: number): string {
  return whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`
}

const inWindow = (events: readonly MetricsEvent[], from: string, to: string): MetricsEvent[] =>
  events.filter(event => event.at >= from && event.at < to)
const countOf = (events: readonly MetricsEvent[], kind: string): MetricsEvent[] => events.filter(event => event.k === kind)

/** The canonical order the reader produces (§7.1): `at`, then writer, then sequence. The pure functions re-apply it, so any input order computes the same output (acceptance 8). */
function ordered(events: readonly MetricsEvent[]): MetricsEvent[] {
  return [...events].sort((a, b) => a.at.localeCompare(b.at) || a.w.localeCompare(b.w) || a.n - b.n)
}

/** Per-id counts of one body field, sorted by count descending then id (the deterministic order, §7.2). */
function idCounts(events: readonly MetricsEvent[], kind: string, key: string): Array<{ readonly id: string, readonly count: number }> {
  const counts = new Map<string, number>()
  for (const event of events) {
    if (event.k !== kind) continue
    const id = str(event.body, key)
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return countedRows(counts)
}

/** The counted map as rows: count descending, then id (the deterministic order, §7.2). */
function countedRows(counts: ReadonlyMap<string, number>): Array<{ readonly id: string, readonly count: number }> {
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}

const idCountsText = (entries: readonly { readonly id: string, readonly count: number }[]): string =>
  entries.length === 0 ? '0' : entries.map(entry => `${entry.id} ${entry.count}`).join('、')

/** The first line of every output (F8): files with their line ranges, the window, the unreadable count, the version. */
function basisLine(basis: ReadonlyMap<string, number>, from: string, to: string, tz: string, unreadable: number): string {
  const files = [...basis.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, lines]) => `${file} 1–${lines} 行`)
  return `依据：${files.length === 0 ? '（空）' : files.join('，')}；窗口 ${from}–${to}（${tz}）；无法读取 ${unreadable}；计算版本 ${CALC_VERSION}`
}

/** Whole minutes, the way the burden rows and the stall row render waits (§7.6's example). */
const minutes = (ms: number): string => `${Math.round(ms / 60_000)} 分钟`

/** The local YYYY-MM-DD of an ISO instant in a `±HH:MM` zone. */
export function localDate(at: string, tz: string): string {
  const sign = tz[0] === '-' ? -1 : 1
  const hours = Number(tz.slice(1, 3))
  const mins = Number(tz.slice(4, 6))
  const offset = Number.isFinite(hours) && Number.isFinite(mins) ? sign * (hours * 60 + mins) : 0
  const shifted = new Date(Date.parse(at) + offset * 60_000)
  return Number.isFinite(shifted.getTime()) ? shifted.toISOString().slice(0, 10) : at.slice(0, 10)
}

/** The holder sessions of the main agent (F2): every session a holder move named. */
function mainSessions(events: readonly MetricsEvent[]): Set<string> {
  const sessions = new Set<string>()
  for (const event of countOf(events, 'design.holder-moved')) {
    for (const key of ['from', 'to']) {
      const id = str(event.body, key)
      if (id !== undefined) sessions.add(id)
    }
  }
  return sessions
}

/** Worker sessions: the children dispatch named (§7.2 积分 row's role join). */
function workerSessions(events: readonly MetricsEvent[]): Set<string> {
  const sessions = new Set<string>()
  for (const event of countOf(events, 'execute.dispatch')) {
    const child = str(event.body, 'child')
    if (child !== undefined) sessions.add(child)
  }
  return sessions
}

function roleOf(sid: string | undefined, main: ReadonlySet<string>, workers: ReadonlySet<string>): string {
  if (sid === undefined) return 'other'
  if (main.has(sid)) return 'main'
  if (workers.has(sid)) return 'worker'
  return 'other'
}

/** The last seven days of the window (§7.2's 近 7 天 rows). */
function last7(events: readonly MetricsEvent[], to: string): readonly MetricsEvent[] {
  const end = Date.parse(to)
  if (!Number.isFinite(end)) return events
  const start = new Date(end - 7 * 24 * 60 * 60_000).toISOString()
  return events.filter(event => event.at >= start && event.at < to)
}

/**
 * The facts (F9): the rows that may reach the main agent's conversation.
 * Every value is pre-rendered with the §7.2 conventions, so a caller
 * prints them as they are.
 */
export function factsFor(input: CalcInput): { readonly basis: string, readonly groups: readonly CalcGroup[] } {
  const { from, to, tz, findings, basis } = input
  const events = ordered(input.events)
  const windowed = inWindow(events, from, to)
  const recent = last7(windowed, to)
  const earliest = windowed[0]

  const gapLost = sumOf(countOf(windowed, 'gap').map(event => num(event.body, 'lost') ?? 0))
  const todayCount = input.today === undefined ? undefined : windowed.filter(event => localDate(event.at, tz) === input.today).length

  // 问人（减负数字，§7.2): the three of charter §3.2-5 the journal can count.
  const proposals = countOf(windowed, 'design.proposal-shown')
  const answers = countOf(windowed, 'design.answer-recorded')
  const proposalUnits = proposals.map(event => num(event.body, 'units') ?? 0)
  const waitMs = answers.map(event => num(event.body, 'ms') ?? 0)
  const main = mainSessions(events)
  const mainText = sumOf(windowed.filter(event => event.k === 'llm' && event.sid !== undefined && main.has(event.sid)).map(event => num(event.body, 'text') ?? 0))

  // 撤下 (F): seven-day lifts per rule, and what stands lifted now (last action per rule).
  const liftsRecent = idCounts(recent, 'lift', 'rule')
  const lastAction = new Map<string, string>()
  for (const event of countOf(events, 'lift').sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n)) {
    const rule = str(event.body, 'rule')
    const action = str(event.body, 'action')
    if (rule !== undefined && action !== undefined) lastAction.set(rule, action)
  }
  const liftedNow = [...lastAction.entries()].filter(([, action]) => action === 'lift').map(([rule]) => rule).sort()

  // 超时 (F): per entry (from its sets and hits), the recent hits and the latest set's source line (acceptance 21).
  const sets = countOf(windowed, 'timeout.set')
  const hits = countOf(windowed, 'timeout.hit')
  const entriesOf = new Map<string, { readonly sets: MetricsEvent[], readonly hits: MetricsEvent[] }>()
  for (const event of [...sets, ...hits]) {
    const entry = str(event.body, 'entry')
    if (entry === undefined) continue
    const slot = entriesOf.get(entry) ?? { sets: [], hits: [] }
    if (event.k === 'timeout.set') slot.sets.push(event)
    else slot.hits.push(event)
    entriesOf.set(entry, slot)
  }
  const timeoutRows: CalcRow[] = [...entriesOf.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([entry, slot]) => {
    const ordered = [...slot.hits].sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n)
    const entrySets = [...slot.sets].sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n)
    const lastHit = ordered.at(-1)
    const lastSet = entrySets.at(-1)
    const source = lastSet === undefined ? undefined : str(lastSet.body, 'source')
    const est = lastSet === undefined ? undefined : num(lastSet.body, 'estMs')
    const prev = lastSet === undefined ? undefined : num(lastSet.body, 'prevMs')
    const floored = entrySets.filter(event => bool(event.body, 'floored') === true).length
    const told = (lastHit !== undefined && bool(lastHit.body, 'told') === true) || (lastSet !== undefined && bool(lastSet.body, 'told') === true)
    return {
      label: entry,
      value: [
        `超时 ${ordered.length} 次`,
        ...(lastHit !== undefined ? [`最近限 ${num(lastHit.body, 'limitMs')}ms／用时 ${num(lastHit.body, 'elapsedMs')}ms／结局 ${str(lastHit.body, 'outcome') ?? '—'}`] : []),
        `来源 ${source ?? '—'}${est !== undefined ? `（预计 ${est}ms）` : ''}`,
        ...(lastSet !== undefined && prev !== undefined ? [`上次变更 ${lastSet.at}（原 ${prev}ms）`] : []),
        ...(floored > 0 ? [`被上限截住 ${floored} 次`] : []),
        `告知 ${told ? '是' : '否'}`,
      ].join('；'),
      samples: ordered.length,
    }
  })

  // 拦截 (F): rule events per id, seven days; judged hows listed as their own counts (§7.2, M4 §3.2's口径).
  const denyByRule = idCounts(recent.filter(event => str(event.body, 'effect') === 'deny'), 'rule', 'rule')
  const lateByRule = recent.filter(event => event.k === 'rule' && str(event.body, 'effect') === 'late')
  const judged = idCounts(recent, 'rules.judged', 'how')

  const scripts = idCounts(windowed, 'rules.script', 'result')
  const scriptTimeouts = scripts.find(entry => entry.id === 'timeout')?.count ?? 0

  const due = countOf(windowed, 'progress.due')
  const handovers = countOf(windowed, 'progress.handover')
  const waits = handovers.map(event => num(event.body, 'waitedMs') ?? 0)
  const goalDoneHandover = handovers.some(event => bool(event.body, 'goalDone') === true)

  const failedChecks = windowed.filter(event => event.k === 'execute.check' && bool(event.body, 'ok') === false)
  const failedCheckIds = failedChecks.map(event => str(event.body, 'task') ?? str(event.body, 'commit') ?? '—')
    .sort((a, b) => a.localeCompare(b))

  const groups: CalcGroup[] = [
    {
      title: '覆盖',
      rows: [
        { label: '事件', value: `${windowed.length} 条` },
        ...(earliest !== undefined ? [{ label: '最早', value: earliest.at }] : []),
        ...(todayCount !== undefined ? [{ label: '今天', value: `${todayCount} 条` }] : []),
        { label: '丢失与拒收', value: `gap 丢 ${gapLost}；拒收 ${countOf(windowed, 'reject').length}；无法读取 ${findings.unreadable.length}；未正常退出 ${findings.noStop.length}；文件丢失 ${findings.lostFiles.length}` },
        { label: '大小', value: `${findings.bytes} 字节` },
      ],
    },
    {
      title: '任务',
      rows: [
        { label: '派出', value: `${countOf(windowed, 'execute.dispatch').length} 件` },
        { label: '交付', value: idCountsText(idCounts(windowed, 'execute.handback', 'status')) },
        { label: '等人', value: idCountsText(idCounts(windowed, 'execute.ask', 'result')) },
        { label: '检查没过', value: failedCheckIds.length === 0 ? '0' : failedCheckIds.join('、') },
      ],
    },
    {
      title: '规则与循环执行',
      rows: [
        { label: '脚本规则', value: scripts.length === 0 ? '0' : scripts.map(entry => `${entry.id} ${entry.count}`).join('、') },
        { label: '超时', value: `${scriptTimeouts} 次` },
        { label: '晚到判定', value: idCountsText(idCounts(windowed, 'rules.late-verdict', 'result')) },
        { label: '仓库规则被外改', value: `${countOf(windowed, 'rules.repo').length} 次` },
        { label: '循环条目', value: idCountsText(idCounts(windowed, 'loop-done', 'outcome')) },
        { label: '过期清单', value: `${sumOf(countOf(windowed, 'rules.stale').map(event => num(event.body, 'listed') ?? 0))} 条` },
      ],
    },
    {
      title: '问人（减负数字）',
      rows: [
        { label: '问你几次', value: `${proposals.length} 次`, samples: proposals.length },
        { label: '每次要读的字', value: `${median(proposalUnits) ?? '—'}（最长 ${maxOf(proposalUnits) ?? '—'}）`, samples: proposals.length },
        { label: '一周要读的总字数', value: `${sumOf(proposalUnits) + mainText}` },
        { label: '你回话等了多久', value: `${waitMs.length === 0 ? '—' : minutes(median(waitMs)!)}（最长 ${waitMs.length === 0 ? '—' : minutes(maxOf(waitMs)!)}）`, samples: waitMs.length },
      ],
    },
    {
      title: '问人',
      rows: [
        { label: '次数', value: `${proposals.length} 次；按问法 ${idCountsText(formCounts(proposals))}` },
        { label: '一条回复的件数', value: idCountsText(idCounts(proposals, 'design.proposal-shown', 'number')) },
        { label: '你定了', value: `${answers.filter(event => bool(event.body, 'delegated') === true).length} 次` },
        { label: '这类你定', value: idCountsText(idCounts(windowed, 'design.delegation', 'action')) },
        { label: '被拒', value: idCountsText(idCounts(windowed, 'design.proposal-refused', 'code')) },
        { label: '原生问题与审批', value: `问 ${countOf(windowed, 'ask').length} 次；审批 ${countOf(windowed, 'approval').filter(event => str(event.body, 'phase') === 'decided').length} 次` },
      ],
    },
    {
      title: '拦截',
      rows: [
        { label: '近 7 天拦下', value: idCountsText(denyByRule), samples: sumOf(denyByRule.map(entry => entry.count)) },
        { label: '按日', value: byDayText(denyByRule.length === 0 ? [] : recent.filter(event => event.k === 'rule' && str(event.body, 'effect') === 'deny'), tz) },
        { label: '晚到的拦下', value: `${lateByRule.length} 次；判定 ${idCountsText(idCounts(windowed, 'rules.late-verdict', 'result'))}` },
        { label: '排队', value: idCountsText(judged.filter(entry => entry.id === 'deferral')) },
        { label: '只记录', value: idCountsText(judged.filter(entry => entry.id === 'rule-record')) },
        { label: '判定其他', value: idCountsText(judged.filter(entry => entry.id !== 'deferral' && entry.id !== 'rule-record')) },
      ],
    },
    {
      title: '撤下',
      rows: [
        { label: '近 7 天', value: liftsRecent.length === 0 ? '0' : liftsRecent.map(entry => `${entry.id} ${entry.count}`).join('、'), samples: sumOf(liftsRecent.map(entry => entry.count)) },
        { label: '现在撤下', value: liftedNow.length === 0 ? '无' : liftedNow.join('、') },
      ],
    },
    {
      title: '超时',
      rows: timeoutRows.length === 0 ? [{ label: '近 7 天', value: '—' }] : timeoutRows,
    },
    ...(input.quota === undefined
      ? [{ title: '额度停住', rows: [{ label: '停住', value: '—' } as CalcRow] }]
      : [quotaGroup(windowed, input.quota.stallCode, input.quota.resumeCode, countOf(windowed, 'glm.upstream-limit'))]),
    {
      title: '汇报',
      rows: [
        { label: '到期', value: `整目标 ${due.filter(event => str(event.body, 'scope') === 'goal').length}；一块 ${due.filter(event => str(event.body, 'scope') === 'part').length}` },
        { label: '交付', value: `${handovers.length} 次`, samples: handovers.length },
        { label: '最长等了', value: waits.length === 0 ? '—' : minutes(maxOf(waits)!) },
        { label: '目标做完的交了', value: goalDoneHandover ? '交了' : '没有' },
      ],
    },
  ]
  return { basis: basisLine(basis, from, to, tz, findings.unreadable.length), groups }
}

function formCounts(proposals: readonly MetricsEvent[]): Array<{ readonly id: string, readonly count: number }> {
  const counts = new Map<string, number>()
  for (const event of proposals) counts.set(str(event.body, 'form') ?? '（无）', (counts.get(str(event.body, 'form') ?? '（无）') ?? 0) + 1)
  return countedRows(counts)
}

function byDayText(events: readonly MetricsEvent[], tz: string): string {
  const counts = new Map<string, number>()
  for (const event of events) {
    const day = localDate(event.at, tz)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => `${day} ${count}`).join('、')
}

/** The quota-stall group (acceptance 24): a stall is a goal event with the stall code up to the goal's next event; the resume's `resumeWhy` says who resumed. */
function quotaGroup(events: readonly MetricsEvent[], stallCode: string, resumeCode: string, upstream: readonly MetricsEvent[]): CalcGroup {
  const goals = countOf(events, 'execute.goal').sort((a, b) => a.at.localeCompare(b.at) || a.n - b.n)
  let stalls = 0
  let resumedSelf = 0
  let resumedHuman = 0
  let stalledMs = 0
  let currentlyStalled = false
  for (let index = 0; index < goals.length; index += 1) {
    const event = goals[index]
    const goal = str(event.body, 'goal')
    const code = str(event.body, 'code')
    if (goal === undefined || code !== stallCode) continue
    stalls += 1
    currentlyStalled = true
    const resume = goals.find((later, laterIndex) => laterIndex > index && str(later.body, 'goal') === goal)
    if (resume === undefined) continue
    currentlyStalled = false
    stalledMs += Math.max(0, Date.parse(resume.at) - Date.parse(event.at))
    if (str(resume.body, 'resumeWhy') === resumeCode) resumedSelf += 1
    else resumedHuman += 1
  }
  const upstreamReset = upstream.some(event => bool(event.body, 'hasReset') === true)
  return {
    title: '额度停住',
    rows: [
      { label: '停住', value: `停了 ${stalls} 次，共 ${minutes(stalledMs)}；自己接上 ${resumedSelf} 次；人手动接上 ${resumedHuman} 次；现在${currentlyStalled ? '停着' : '没停'}`, samples: stalls },
      { label: '额度用完', value: upstream.length === 0 ? '—' : `${upstream.length} 次${upstreamReset ? '，其中见到重置' : ''}` },
    ],
  }
}

/** `scoresFor`'s input: today the same shape as the facts'; the board view (4a) reads the same rows. */
export type ScoresInput = CalcInput

/**
 * The scores (F9): the facts plus the ratios and distributions only the
 * person sees (the command line now, the metrics board later).
 */
export function scoresFor(input: ScoresInput): { readonly basis: string, readonly groups: readonly CalcGroup[] } {
  const base = factsFor(input)
  const { from, to } = input
  const events = ordered(input.events)
  const windowed = inWindow(events, from, to)
  const steps = windowed.filter(event => event.k === 'llm' && num(event.body, 'step') !== undefined && str(event.body, 'purpose') === undefined)
  const main = mainSessions(events)
  const workers = workerSessions(events)

  const byModel = new Map<string, MetricsEvent[]>()
  for (const event of steps) {
    const model = str(event.body, 'model') ?? '—'
    byModel.set(model, [...byModel.get(model) ?? [], event])
  }
  const stepRows: CalcRow[] = [...byModel.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([model, list]) => {
    const ms = list.map(event => num(event.body, 'ms') ?? 0)
    const tokens = list.map(event => num(event.body, 'total') ?? ((num(event.body, 'input') ?? 0) + (num(event.body, 'output') ?? 0)))
    const ttft = list.map(event => num(event.body, 'ttft') ?? 0).filter(value => value > 0)
    return {
      label: model,
      value: `步数 ${list.length}；用时中位 ${median(ms) ?? '—'}ms；token 中位 ${median(tokens) ?? '—'}；首字中位 ${median(ttft) ?? '—'}ms（最长 ${maxOf(ttft) ?? '—'}ms）；结束 ${idCountsText(finCounts(list))}`,
      samples: list.length,
    }
  })

  const tools = countOf(windowed, 'tool')
  const perStep = new Map<string, number>()
  for (const event of tools) {
    const key = `${event.sid ?? ''}\u0000${num(event.body, 'turn') ?? 0}\u0000${num(event.body, 'step') ?? 0}`
    perStep.set(key, (perStep.get(key) ?? 0) + 1)
  }
  const outs = idCounts(tools, 'tool', 'out')
  const denied = outs.find(entry => entry.id === 'denied')?.count ?? 0
  const catErrors = idCounts(tools.filter(event => str(event.body, 'out') === 'error'), 'tool', 'cat')

  const followups = countOf(windowed, 'followup').filter(event => str(event.body, 'outcome') !== 'none')
  const rightPath = followups.filter(event => str(event.body, 'outcome') === 'right-path').length

  const creditsTotal = sumOf(steps.map(event => num(event.body, 'credits') ?? 0))
  const peakCredits = sumOf(steps.filter(event => bool(event.body, 'peak') === true).map(event => num(event.body, 'credits') ?? 0))
  const byRole = new Map<string, number>()
  for (const event of steps) {
    const role = roleOf(event.sid, main, workers)
    byRole.set(role, (byRole.get(role) ?? 0) + (num(event.body, 'credits') ?? 0))
  }
  const byModelCredits = [...byModel.entries()].map(([model, list]) => ({ model, credits: sumOf(list.map(event => num(event.body, 'credits') ?? 0)) }))
    .sort((a, b) => b.credits - a.credits || a.model.localeCompare(b.model))

  // 问人（打分): agree/add/reject by kind, question by form, points, and the follow-the-recommendation ratio (§7.2, F58).
  const answers = countOf(windowed, 'design.answer-recorded').filter(event => bool(event.body, 'delegated') !== true)
  const agreeOf = (list: readonly MetricsEvent[]): number => list.filter(event => str(event.body, 'answer') === 'agree').length
  const byKind = new Map<string, MetricsEvent[]>()
  for (const event of answers) {
    const kind = str(event.body, 'kind') ?? '—'
    byKind.set(kind, [...byKind.get(kind) ?? [], event])
  }
  const agreeRows: CalcRow[] = [...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([kind, list]) => ({
    label: kind,
    value: `原样同意 ${pct(agreeOf(list), list.length)}（${list.length} 次里 ${agreeOf(list)} 次）`,
    samples: list.length,
  }))
  const questionForms = new Map<string, MetricsEvent[]>()
  for (const event of answers.filter(event => str(event.body, 'kind') === 'question')) {
    const form = str(event.body, 'form') ?? '（无）'
    questionForms.set(form, [...questionForms.get(form) ?? [], event])
  }
  const pointsRows: CalcRow[] = [...questionForms.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([form, list]) => {
    const points = list.map(event => num(event.body, 'points')).filter((value): value is number => value !== undefined)
    return { label: `问法 ${form}`, value: `points 中位 ${median(points) ?? '—'}（最长 ${maxOf(points) ?? '—'}）`, samples: list.length }
  })
  const eligible = answers.filter(event => str(event.body, 'form') === 'recommend' || str(event.body, 'form') === 'choose')
  const followed = eligible.filter(event =>
    (str(event.body, 'form') === 'recommend' && str(event.body, 'answer') === 'agree') ||
    (str(event.body, 'form') === 'choose' && str(event.body, 'answer') === 'agree' && bool(event.body, 'pickedRecommended') === true))

  const taskRows = taskCreditRows(windowed, steps)

  const scoreGroups: CalcGroup[] = [
    { title: '每一步（按模型）', rows: stepRows.length === 0 ? [{ label: '（无）', value: '—' }] : stepRows },
    {
      title: '工具',
      rows: [
        { label: '每步工具调用', value: `中位 ${median([...perStep.values()]) ?? '—'}`, samples: perStep.size },
        { label: '结果分布', value: idCountsText(outs) },
        { label: '被拦率', value: pct(denied, tools.length), samples: tools.length },
        { label: '出错率按类别', value: catErrors.length === 0 ? '—' : catErrors.map(entry => `${entry.id} ${pct(entry.count, tools.filter(event => str(event.body, 'cat') === entry.id).length)}`).join('、') },
        { label: '返工', value: `${reworkCount(windowed)} 次` },
      ],
    },
    {
      title: '拦截（打分）',
      rows: [
        { label: '下一步走对', value: pct(rightPath, followups.length), samples: followups.length },
      ],
    },
    {
      title: '积分',
      rows: [
        { label: '总计', value: `${creditsTotal.toFixed(2)}（高峰 ${pct(peakCredits, creditsTotal)}）`, samples: steps.length },
        ...byModelCredits.map(entry => ({ label: entry.model, value: `${entry.credits.toFixed(2)}（${pct(entry.credits, creditsTotal)}）` })),
        ...[...byRole.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([role, value]) => ({ label: `角色 ${role}`, value: `${value.toFixed(2)}（${pct(value, creditsTotal)}）` })),
      ],
    },
    {
      title: '任务（打分）',
      rows: taskRows.length === 0 ? [{ label: '（无派发）', value: '—' }] : taskRows,
    },
    {
      title: '问人（打分）',
      rows: [
        ...agreeRows,
        ...pointsRows,
        { label: '跟了推荐', value: pct(followed.length, eligible.length), samples: eligible.length },
      ],
    },
  ]
  return { basis: base.basis, groups: [...base.groups, ...scoreGroups] }
}

function finCounts(list: readonly MetricsEvent[]): Array<{ readonly id: string, readonly count: number }> {
  const counts = new Map<string, number>()
  for (const event of list) {
    const fin = str(event.body, 'fin')
    if (fin !== undefined) counts.set(fin, (counts.get(fin) ?? 0) + 1)
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}

/**
 * The same target written ok twice with a shell call of the same session in
 * between (§7.2 工具 row's rework). The events arrive sorted by
 * `(at, w, n)`; write events carry a hashed `target`, shell calls a `cat`
 * of `shell`.
 */
function reworkCount(events: readonly MetricsEvent[]): number {
  let rework = 0
  const seen = new Map<string, number>() // `sid␀target` → shell count at the last ok write
  let shells = 0
  for (const event of events) {
    if (event.k !== 'tool') continue
    if (str(event.body, 'cat') === 'shell') {
      shells += 1
      continue
    }
    if (str(event.body, 'out') !== 'ok') continue
    const target = str(event.body, 'target')
    if (target === undefined) continue
    const key = `${event.sid ?? ''}\u0000${target}`
    const at = seen.get(key)
    if (at !== undefined && shells > at) rework += 1
    seen.set(key, shells)
  }
  return rework
}

/** Per-task credit rows: each dispatch's child session carries its credits to the dispatched task (§7.2 任务 row). */
function taskCreditRows(events: readonly MetricsEvent[], steps: readonly MetricsEvent[]): readonly CalcRow[] {
  const childToTask = new Map<string, string>()
  for (const event of countOf(events, 'execute.dispatch')) {
    const child = str(event.body, 'child')
    const target = str(event.body, 'target')
    if (child !== undefined && target !== undefined) childToTask.set(child, target)
  }
  const byTask = new Map<string, number>()
  for (const event of steps) {
    const task = event.sid === undefined ? undefined : childToTask.get(event.sid)
    if (task === undefined) continue
    byTask.set(task, (byTask.get(task) ?? 0) + (num(event.body, 'credits') ?? 0))
  }
  return [...byTask.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([task, credits]) => ({ label: task, value: credits.toFixed(2) }))
}

/** The compare key (§7.4): build stamp, model, the session's host process, or the role join. */
export type CompareKey = 'v' | 'model' | 'host' | 'role'

/**
 * The comparison (§7.4): the score set per group, with sample counts, no
 * significance tests — one user, small samples, only the trend.
 */
export function compare(input: ScoresInput & { readonly by: CompareKey }): { readonly basis: string, readonly groups: readonly CalcGroup[] } {
  const { by, from, to } = input
  const events = ordered(input.events)
  const windowed = inWindow(events, from, to)
  const main = mainSessions(events)
  const workers = workerSessions(events)
  const hosts = new Map<string, string>()
  for (const event of countOf(events, 'start')) hosts.set(event.w, str(event.body, 'host') ?? '—')

  const keyOf = (event: MetricsEvent): string => {
    switch (by) {
      case 'v': return event.v
      case 'model': return str(event.body, 'model') ?? '—'
      case 'host': return hosts.get(event.w) ?? '—'
      case 'role': return roleOf(event.sid, main, workers)
    }
  }

  const groups = new Map<string, MetricsEvent[]>()
  for (const event of windowed) {
    const key = keyOf(event)
    groups.set(key, [...groups.get(key) ?? [], event])
  }

  const compareGroups: CalcGroup[] = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, list]) => {
    const steps = list.filter(event => event.k === 'llm' && num(event.body, 'step') !== undefined && str(event.body, 'purpose') === undefined)
    const ms = steps.map(event => num(event.body, 'ms') ?? 0)
    const tokens = steps.map(event => num(event.body, 'total') ?? ((num(event.body, 'input') ?? 0) + (num(event.body, 'output') ?? 0)))
    const answers = list.filter(event => event.k === 'design.answer-recorded' && bool(event.body, 'delegated') !== true)
    const agree = answers.filter(event => str(event.body, 'answer') === 'agree').length
    const credits = sumOf(steps.map(event => num(event.body, 'credits') ?? 0))
    const tasks = taskCreditRows(list, steps)
    return {
      title: `${by}=${key}`,
      rows: [
        { label: '样本', value: `${list.length} 条（模型调用 ${steps.length}）`, samples: list.length },
        { label: '每步用时中位', value: `${median(ms) ?? '—'}ms`, samples: steps.length },
        { label: '每步 token 中位', value: `${median(tokens) ?? '—'}`, samples: steps.length },
        { label: '积分', value: credits.toFixed(2) },
        ...(tasks.length > 0 ? [{ label: '每任务积分', value: tasks.map(row => `${row.label} ${row.value}`).join('、') } as CalcRow] : []),
        { label: '原样同意', value: pct(agree, answers.length), samples: answers.length },
      ],
    }
  })
  return { basis: basisLine(input.basis, from, to, input.tz, input.findings.unreadable.length), groups: compareGroups }
}
