/**
 * The metrics board's view (metrics design §7.6.2): `boardView` imports
 * `factsFor` and `scoresFor` and shapes the numbers that go on the board
 * into groups and rows, pairing each row of the recent-7-days window with
 * the same row of the previous-7-days window. The numbers stay formatted
 * exactly as calc renders them — one place formats, the client copies the
 * text out verbatim; the ratio parentheticals (62.5%（8 次里 5 次）) are
 * composed here, with `samples` carrying the machine-readable denominators
 * (F69). A pure function: no clock, no files, no randomness, so the same
 * events render byte for byte the same (acceptance 25 (a)).
 *
 * Group and row names are plain words and deliberately distinct from the
 * fact groups and rows the `/hourness` report prints (acceptance 25 (b)):
 * the fact titles 覆盖/任务/拦截 are not reused. The board keeps the S rows
 * the design's example shows; the per-kind answer split stays on the
 * command line.
 */
import { factsFor, localDate, pct, scoresFor, type CalcGroup, type CalcRow } from './calc.ts'
import type { LogFindings } from './read.ts'
import type { MetricsEvent } from './schema.ts'
import type { MetricsBoardGroup, MetricsBoardRow, MetricsBoardView } from '../shared/metrics-board.ts'

/** One 7-day natural-day window: the label it carries on the board and its `[from, to)` bounds. */
interface BoardWindow {
  readonly label: string
  readonly from: string
  readonly to: string
}

export interface BoardViewInput {
  readonly events: readonly MetricsEvent[]
  /** 最近 7 天, today included. */
  readonly current: BoardWindow
  /** 前 7 天, the seven before that. */
  readonly previous: BoardWindow
  readonly tz: string
  /** `checkLog`'s findings over the same read: the coverage rows come from here. */
  readonly findings: LogFindings
  /** The read's basis (which files, how many lines, F8): calc renders the line that 讲细点 shows. */
  readonly basis: ReadonlyMap<string, number>
}

/** `boardView`'s own answer: the groups; `at`/`tried`/`problem`/`windows` are the writer's (§7.6.2). */
export interface BoardViewShape {
  readonly basis: string
  readonly groups: readonly MetricsBoardGroup[]
}

/** The two natural-day windows a moment falls into, with the bounds the reader takes. */
export interface BoardWindows {
  readonly current: BoardWindow
  readonly previous: BoardWindow
  /** The two labels the view carries. */
  readonly labels: readonly [string, string]
  /** `[from, to)` over both windows, as UTC instants the event strings compare against. */
  readonly from: string
  readonly to: string
  /** The local day the windows belong to, for the date-change trigger (§7.6.2). */
  readonly day: string
}

/**
 * The two windows of a moment in `tz` (§7.6.2): 最近 7 天 is the seven
 * natural days of today, 前 7 天 the seven before. The window bounds are the
 * UTC instants of the local midnights, so calc's string comparisons compare
 * instants, and the reader takes the files of both windows at once.
 */
export function boardWindows(isoNow: string, tz: string): BoardWindows {
  const day = localDate(isoNow, tz)
  const shifted = (days: number): string =>
    new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + days)).toISOString().slice(0, 10)
  const instantOf = (date: string): string => new Date(Date.parse(`${date}T00:00:00${tz}`)).toISOString()
  const currentStart = shifted(-6)
  const previousStart = shifted(-13)
  const tomorrow = shifted(1)
  return {
    current: { label: '最近 7 天', from: instantOf(currentStart), to: instantOf(tomorrow) },
    previous: { label: '前 7 天', from: instantOf(previousStart), to: instantOf(currentStart) },
    labels: ['最近 7 天', '前 7 天'],
    from: instantOf(previousStart),
    to: instantOf(tomorrow),
    day,
  }
}

type Row = MetricsBoardRow

/** calc's empty-window placeholder rows are not board rows; an empty group just shows no rows. */
const PLACEHOLDERS = new Set(['（无）', '（无派发）'])

/** Board labels cap at 40 code points (§7.6.2); a long task target or model name keeps its head and an ellipsis. */
function clamp(label: string): string {
  const points = [...label]
  return points.length <= 40 ? label : `${points.slice(0, 39).join('')}…`
}

/** Pair one row of the two windows; the denominator follows as the machine-readable samples. */
function paired(label: string, current: CalcRow | undefined, previous: CalcRow | undefined): Row {
  const currentSamples = current?.samples
  const previousSamples = previous?.samples
  return {
    label: clamp(label),
    values: [current === undefined ? '—' : current.value, previous === undefined ? '—' : previous.value],
    ...(currentSamples === undefined && previousSamples === undefined ? {} : { samples: [currentSamples ?? 0, previousSamples ?? 0] }),
  }
}

const rowOf = (group: CalcGroup | undefined, label: string): CalcRow | undefined =>
  group?.rows.find(row => row.label === label)

/** The named rows of a group, in the given order; a row absent from both windows drops out. */
function rowsBetween(current: CalcGroup | undefined, previous: CalcGroup | undefined, labels: readonly string[]): Row[] {
  return labels.flatMap(label => {
    const currentRow = rowOf(current, label)
    const previousRow = rowOf(previous, label)
    return currentRow === undefined && previousRow === undefined ? [] : [paired(label, currentRow, previousRow)]
  })
}

/** Every real row of a group (placeholders dropped), each relabeled through `labelOf`. */
function rowsOf(current: CalcGroup | undefined, previous: CalcGroup | undefined, labelOf: (row: CalcRow) => string): Row[] {
  return (current?.rows ?? []).filter(row => !PLACEHOLDERS.has(row.label))
    .map(row => paired(labelOf(row), row, rowOf(previous, row.label)))
}

/** Per-model rows, at most eight named models, the rest summed into 其他 (§7.6.2). */
function stepRows(current: CalcGroup | undefined, previous: CalcGroup | undefined): Row[] {
  const rows = rowsOf(current, previous, row => `每步 ${row.label}`)
  if (rows.length <= 8) return rows
  const rest = rows.slice(8)
  const steps = rest.reduce((sum, row) => sum + (row.samples?.[0] ?? 0), 0)
  const previousSteps = rest.reduce((sum, row) => sum + (row.samples?.[1] ?? 0), 0)
  return [...rows.slice(0, 8), { label: '其他', values: [`其余 ${rest.length} 个模型，共 ${steps} 步`, '—'], samples: [steps, previousSteps] }]
}

/** 积分's rows: 总计 keeps its name, a bare model name becomes the second half of 积分 <模型>. */
function creditRows(current: CalcGroup | undefined, previous: CalcGroup | undefined): Row[] {
  return rowsOf(current, previous, row => row.label === '总计' || row.label.startsWith('角色 ') ? row.label : `积分 ${row.label}`)
}

/** The overall 原样同意 ratio (§7.2 问人（打分）): agree over every non-delegated answer of the window. */
function agreeRow(events: readonly MetricsEvent[], window: BoardWindow): { readonly value: string, readonly total: number } {
  const answers = events.filter(event =>
    event.k === 'design.answer-recorded' && event.at >= window.from && event.at < window.to && event.body.delegated !== true)
  const agree = answers.filter(event => event.body.answer === 'agree').length
  return { value: answers.length === 0 ? '—' : `${pct(agree, answers.length)}（${answers.length} 次里 ${agree} 次）`, total: answers.length }
}

/**
 * The one memory line of the coverage group (m5-index-truncation-alarm): how
 * often the session index was cut at a cap and how often memory_query found
 * nothing, the two numbers that say whether keyword recall still fits.
 */
function memoryRow(current: CalcGroup | undefined, previous: CalcGroup | undefined): Row {
  const pair = (group: CalcGroup | undefined): { readonly value: string, readonly cuts: number } => {
    const cut = rowOf(group, '索引截掉')
    const empty = rowOf(group, '查询落空')
    return { value: cut === undefined || empty === undefined ? '—' : `索引截掉 ${cut.value}，查询落空 ${empty.value}`, cuts: cut?.samples ?? 0 }
  }
  const now = pair(current)
  const before = pair(previous)
  return { label: '记忆索引截掉与查询落空', values: [now.value, before.value], samples: [now.cuts, before.cuts] }
}

/** The board's groups over the two windows (§7.6.2's 上板的数). */
export function boardView(input: BoardViewInput): BoardViewShape {
  const windowed = (window: BoardWindow) => ({ events: input.events, basis: input.basis, from: window.from, to: window.to, tz: input.tz, findings: input.findings })
  const facts = factsFor(windowed(input.current))
  const factsPrev = factsFor(windowed(input.previous))
  const scores = scoresFor(windowed(input.current))
  const scoresPrev = scoresFor(windowed(input.previous))
  const factGroup = (title: string): CalcGroup | undefined => facts.groups.find(group => group.title === title)
  const factGroupPrev = (title: string): CalcGroup | undefined => factsPrev.groups.find(group => group.title === title)
  const scoreGroup = (title: string): CalcGroup | undefined => scores.groups.find(group => group.title === title)
  const scoreGroupPrev = (title: string): CalcGroup | undefined => scoresPrev.groups.find(group => group.title === title)

  const burden = (calcLabel: string, boardLabel: string): Row =>
    paired(boardLabel, rowOf(factGroup('问人（减负数字）'), calcLabel), rowOf(factGroupPrev('问人（减负数字）'), calcLabel))
  const currentAgree = agreeRow(input.events, input.current)
  const previousAgree = agreeRow(input.events, input.previous)

  const groups: MetricsBoardGroup[] = [
    {
      id: 'load',
      title: '你的负担（周报里主 Agent 也会说这几个数）',
      relayed: true,
      note: '第四个数「因你的决定返工几次」在周报里，由项目图算',
      rows: [
        burden('问你几次', '问你几次'),
        burden('每次要读的字', '每次要读的字（中位数）'),
        burden('你回话等了多久', '你回话等了多久（中位数）'),
      ],
    },
    {
      id: 'answers',
      title: '你怎么回的',
      relayed: false,
      rows: [
        {
          label: '原样同意',
          values: [currentAgree.value, previousAgree.value],
          ...(currentAgree.total === 0 && previousAgree.total === 0 ? {} : { samples: [currentAgree.total, previousAgree.total] }),
        },
        paired('跟了推荐', rowOf(scoreGroup('问人（打分）'), '跟了推荐'), rowOf(scoreGroupPrev('问人（打分）'), '跟了推荐')),
        paired('你说「你定」', rowOf(factGroup('问人'), '你定了'), rowOf(factGroupPrev('问人'), '你定了')),
      ],
    },
    { id: 'asks', title: '问法', relayed: false, rows: rowsOf(scoreGroup('问人（打分）'), scoreGroupPrev('问人（打分）'), row => row.label.startsWith('问法 ') ? row.label : `问法 ${row.label}`) },
    { id: 'steps', title: '每一步（按模型）', relayed: false, rows: stepRows(scoreGroup('每一步（按模型）'), scoreGroupPrev('每一步（按模型）')) },
    { id: 'tools', title: '工具', relayed: false, rows: rowsBetween(scoreGroup('工具'), scoreGroupPrev('工具'), ['每步工具调用', '结果分布', '被拦率', '出错率按类别', '返工']) },
    {
      id: 'tasks',
      title: '派出去的任务',
      relayed: false,
      rows: [
        ...rowsOf(scoreGroup('任务（打分）'), scoreGroupPrev('任务（打分）'), row => `任务 ${row.label}`),
        { label: '降档后的返工比例', values: ['—', '—'], note: '还没接上' },
        { label: '练习题回归一次做对的比例', values: ['—', '—'], note: '还没接上' },
      ],
    },
    { id: 'blocks', title: '拦截之后', relayed: false, rows: rowsBetween(scoreGroup('拦截（打分）'), scoreGroupPrev('拦截（打分）'), ['下一步走对']) },
    { id: 'credits', title: '积分', relayed: false, rows: creditRows(scoreGroup('积分'), scoreGroupPrev('积分')) },
    {
      id: 'coverage',
      title: '记录范围',
      relayed: false,
      rows: [
        // 依据 and 无法读取 are facts of the whole read, not of a window: the previous slot stays empty.
        { label: '依据', values: [facts.basis, '—'] },
        { label: '无法读取', values: [`${input.findings.unreadable.length} 行`, '—'] },
        { label: '丢失', values: [rowOf(factGroup('覆盖'), '丢失与拒收')?.value ?? '—', rowOf(factGroupPrev('覆盖'), '丢失与拒收')?.value ?? '—'] },
        memoryRow(factGroup('记忆'), factGroupPrev('记忆')),
      ],
    },
  ]
  return { basis: facts.basis, groups }
}

/** The whole view text caps at 64 KiB (§7.6.2): rows drop off the later groups first, the last group names how many did not fit. */
const VIEW_BYTES = 64 * 1024

/** A group while rows are being dropped from it. */
interface RowList {
  readonly id: string
  readonly title: string
  readonly relayed: boolean
  readonly note?: string
  rows: Row[]
}

/** Cap the view text at 64 KiB: rows drop off the later groups first, the last group ends with 「还有 N 行没放下，看命令行」. */
export function capView(view: MetricsBoardView): MetricsBoardView {
  if (Buffer.byteLength(JSON.stringify(view), 'utf8') <= VIEW_BYTES) return view
  const groups: RowList[] = view.groups.map(group => ({
    id: group.id,
    title: group.title,
    relayed: group.relayed,
    ...(group.note === undefined ? {} : { note: group.note }),
    rows: [...group.rows],
  }))
  let dropped = 0
  // The shape itself caps a group at 40 rows; the excess is rows that did not fit.
  for (const group of groups) {
    while (group.rows.length > 40) {
      group.rows.pop()
      dropped += 1
    }
  }
  // Drop to a little under the cap, so the closing 还有 row lands inside it too.
  const dropTo = VIEW_BYTES - 512
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    while (group.rows.length > 0 && Buffer.byteLength(JSON.stringify({ ...view, groups }), 'utf8') > dropTo) {
      group.rows.pop()
      dropped += 1
    }
  }
  const last = groups.at(-1)
  if (last !== undefined && dropped > 0) {
    if (last.rows.length >= 40) {
      last.rows.pop()
      dropped += 1
    }
    last.rows.push({ label: '还有', values: [`${dropped} 行没放下，看命令行`, '—'] })
  }
  return { ...view, groups }
}
