/**
 * The env row's status entries (status hub design 0.3 §3.1, §4.2, §12 M4
 * row): the daily suppression-comment count of the project's
 * suppressions.jsonl as the one `env/suppressions` entry. The words of the
 * count line live here — the morning report's movement line
 * (suppressionLineOf, moved from the report so the entry and the report read
 * one computation) and the entry's plain total share it. The entry states
 * the latest count with its reading moment; the per-period rise and fall
 * stays the report's movement line, which slices a period, until the
 * report's hub adoption.
 *
 * The checks' timeouts (status hub design 0.3 §12 M4 row, plain-ui P13-01)
 * are computed here once: `checkTimeouts` reads the timing journal and
 * limits.jsonl into one set of facts per check (the latest value, its
 * history, the timeouts, the queue drops, the ceiling in force as the
 * check's last line in limits.jsonl), `timeoutLines` words them as the
 * morning report's 检查的超时 section, and `envTimeoutItems` hands the same
 * lines as the one `env/timeouts` entry.
 */
import { renderStamp } from '../guard/status.ts'
import { limitSetting, type LimitLine } from './limit-tool.ts'
import type { SuppressionRecord } from './suppressions.ts'
import { lastValues, secondsText, valueSourceText, type CapSetting, type TimingLine, type ValueLine } from './timeout.ts'
import { STATUS_TEXT_MAX, type StatusItem } from '../shared/status.ts'

/** The count line without a movement: what the entry states and the report's no-churn line reads. */
export function suppressionTotalLine(total: number): string {
  return `压制注释 ${total} 处`
}

/**
 * The suppression-comment line over one period's counts, oldest first (M4
 * design §6.7, m4-suppressions): the latest total, and the rise and fall of
 * the period counted apart, so a net-zero period with churn still shows.
 * Undefined when the period holds no count.
 */
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
  return up === 0 && down === 0 ? suppressionTotalLine(total) : `${suppressionTotalLine(total)}（本期 +${up} / −${down}）`
}

/**
 * The count is taken once a repository and day; a reading older than two
 * days means the row has not run its count for at least one day, so the hub
 * marks the entry stale from there.
 */
const SUPPRESSION_STALE_MS = 48 * 60 * 60 * 1000

/**
 * The one `env/suppressions` entry (status hub design 0.3 §3.1): the latest
 * count is the text, the total is the field, `asOf` the count's moment — the
 * whole journal's account, the way the usage entry is the usage journal's.
 * No entry when the journal holds no count yet.
 */
export function envStatusItems(records: readonly SuppressionRecord[], source: string): StatusItem[] {
  const last = records.at(-1)
  if (last === undefined) return []
  return [{
    id: 'env/suppressions',
    owner: 'env',
    audience: 'agent',
    asOf: last.at,
    source,
    text: suppressionTotalLine(last.total),
    fields: { total: last.total },
    staleAfterMs: SUPPRESSION_STALE_MS,
  }]
}

/** The checks' timeouts look back this far (M4 design §6.3.1 「看得见」). */
const TIMING_WINDOW_MS = 7 * 24 * 3600 * 1000

/** A timeout line of the timing journal. */
type TimeoutLine = Extract<TimingLine, { readonly kind: 'timeout' }>

/** One check's timeouts as one set of facts: what the morning report and the status entry both word. */
export interface CheckTimeoutFacts {
  /** The check's key, `<tool node id>/<name>`. */
  readonly check: string
  /** Its latest value line: the limit in force and where it came from. */
  readonly value: ValueLine
  /** Its timeouts in the seven days before now, oldest first. */
  readonly timeouts: readonly TimeoutLine[]
  /** How many of its runs the queue dropped in those seven days. */
  readonly queued: number
  /** The ceiling the main agent raised, when the check's last line in limits.jsonl is a raise; absent after a reset (P13-01). */
  readonly setting?: CapSetting
}

/**
 * The facts of every check that has a value line, in the order the journal
 * first names them (M4 design §6.3.1): the latest value, the timeouts and
 * the queue drops of the seven days before `nowMs`, and the ceiling in force
 * — the check's last line in limits.jsonl, never a value line's `cap`, so a
 * raise or a reset shows before the check runs again. Pure.
 */
export function checkTimeouts(timing: readonly TimingLine[], limits: readonly LimitLine[], nowMs: number): CheckTimeoutFacts[] {
  const since = nowMs - TIMING_WINDOW_MS
  const recent = (line: TimingLine): boolean => !Number.isNaN(Date.parse(line.at)) && Date.parse(line.at) >= since && Date.parse(line.at) <= nowMs
  const book = { lines: limits, bad: 0 }
  return [...lastValues({ lines: timing, bad: 0 })].map(([check, value]): CheckTimeoutFacts => {
    const setting = limitSetting(book, check)
    return {
      check,
      value,
      timeouts: timing.filter((line): line is TimeoutLine => line.kind === 'timeout' && line.check === check && recent(line)),
      queued: timing.filter(line => line.kind === 'queue' && line.check === check && recent(line)).length,
      ...(setting === undefined ? {} : { setting }),
    }
  })
}

/** The day of a moment at the given offset, YYYY-MM-DD; a moment that does not read is written as recorded. */
function renderDay(at: string, offsetMinutes: number): string {
  const ms = Date.parse(at)
  return Number.isNaN(ms) ? at : new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10)
}

/**
 * The lines of the morning report's 检查的超时 section (M4 design §6.3.1,
 * §3.10): one line per check with the value and where it came from (whose
 * estimate, in which session, or that the session was not recorded; then
 * what was wanted when the value is held at the ceiling), the timeouts of
 * the seven days and the latest one, and the runs the queue dropped; under
 * it, when the main agent raised the ceiling, the raised ceiling with its
 * day and reason in plain-ui §4.7's words. Empty when no check has a value.
 */
export function timeoutLines(facts: readonly CheckTimeoutFacts[], offsetMinutes: number): string[] {
  return facts.flatMap((fact) => {
    const last = fact.timeouts.at(-1)
    const late = last === undefined
      ? '近 7 天没有超时'
      : `近 7 天超时 ${fact.timeouts.length} 次（最近一次：上限 ${secondsText(last.limitMs)} 秒，跑了 ${(last.elapsedMs / 1000).toFixed(1)} 秒，${renderStamp(Date.parse(last.at), offsetMinutes)}）`
    const line = `- ${fact.check}：超时 ${secondsText(fact.value.limitMs)} 秒（${valueSourceText(fact.value, true)}）· ${late}${fact.queued === 0 ? '' : ` · 排队太久没跑 ${fact.queued} 次`}`
    const { setting } = fact
    return setting === undefined
      ? [line]
      : [line, `  - 上限已由主 Agent 调高到 ${setting.capS} 秒 · ${renderDay(setting.at, offsetMinutes)}：${setting.reason}；要改回，跟主 Agent 说`]
  })
}

/** The display zone the entry words its times in: the morning report's default (UTC+8), as the guard's entries do. */
const ENV_STATUS_OFFSET_MINUTES = 480

/** One line of at most STATUS_TEXT_MAX code points: line breaks (a reason may hold one) become spaces, a longer line ends in an ellipsis. */
function entryLine(line: string): string {
  const points = [...line.replace(/[\r\n]+/g, ' ')]
  return points.length <= STATUS_TEXT_MAX ? points.join('') : `${points.slice(0, STATUS_TEXT_MAX - 1).join('')}…`
}

/**
 * The one `env/timeouts` entry (status hub design 0.3 §12 M4 row): the
 * morning report's 检查的超时 lines from the same facts, the first as the
 * text and the rest as the detail, each one line of at most STATUS_TEXT_MAX
 * code points; `asOf` is `nowMs`, the end of the seven days the counts look
 * back on. No entry when no check has a value line.
 */
export function envTimeoutItems(facts: readonly CheckTimeoutFacts[], source: string, nowMs: number, offsetMinutes: number = ENV_STATUS_OFFSET_MINUTES): StatusItem[] {
  const [first, ...rest] = timeoutLines(facts, offsetMinutes)
  if (first === undefined) return []
  return [{
    id: 'env/timeouts',
    owner: 'env',
    audience: 'agent',
    asOf: new Date(nowMs).toISOString(),
    source,
    text: entryLine(first),
    ...(rest.length === 0 ? {} : { detail: rest.map(entryLine) }),
    fields: { checks: facts.length, timeouts7d: facts.reduce((sum, fact) => sum + fact.timeouts.length, 0) },
  }]
}
