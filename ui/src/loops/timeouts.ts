/**
 * The timeout cell of one check on the loop board's page (plain-ui 1.3 §4.7
 * 「超时的数与超时记录」, §8.2 the row of the boards' timeouts): the number
 * with where it came from in one of the four sources (an agent's estimate,
 * the slowest of the last runs, the ceiling, a fixed number of the design),
 * the sentence for a number held at the floor or the ceiling, the check of
 * three times the run time (0.5 s either way counts as equal), the line of a
 * ceiling the main agent raised, the seven days' line; and for 讲细点 the
 * history, newest first, and the last five timeouts. Every number and every
 * sentence part comes from the board's data, none is fixed here. A part the
 * data lacks or holds in the wrong shape reads 「没有记录：<原因>」 and is
 * told once per entry, check and reason; the rest of the cell stands. A
 * timeout with no source field at all reads as a fixed number of the design
 * and is told once per board as information. Pure but for the teller.
 */
import { momentText } from '../../../src/loops/view.ts'

/** Where the cell tells what it found wrong (console.warn) or merely notes (console.info), each once per key. */
export interface PageTell {
  warn(key: string, text: string): void
  info(key: string, text: string): void
}

/** One check's cell: the lines under the entry, and the lines 讲细点 adds. */
interface CheckCell {
  readonly key: string
  /** The timeout sentence, the raised ceiling, the seven days. */
  readonly lines: readonly string[]
  /** The history and the last timeouts. */
  readonly details: readonly string[]
}

/** Three times the run time and the number match within this (plain-ui 1.3 §8.2). */
const TOLERANCE_S = 0.5
const WEEK_MS = 7 * 24 * 3600 * 1000
/** The timeouts 讲细点 lists at most (plain-ui 1.3 §4.7 「超时记录」). */
const SHOWN_TIMEOUTS = 5

type Rec = Readonly<Record<string, unknown>>
type Held = { readonly by: 'cap' | 'floor', readonly wantedS: number }
type Report = (code: string, why: string) => void

const isRecord = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const isSeconds = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE_S
const noRecord = (why: string): string => `没有记录：${why}`

/** Seconds as the page writes them: whole when whole, else to one decimal. */
function s(seconds: number): string {
  const tenth = Math.round(seconds * 10) / 10
  return Number.isInteger(tenth) ? String(tenth) : tenth.toFixed(1)
}

/** `10 月 29 日` on the clock of this machine. */
function dayWords(at: string): string {
  const moment = new Date(at)
  return `${moment.getMonth() + 1} 月 ${moment.getDate()} 日`
}

/** What is wrong with a reason, or undefined when it is one line of words. */
function reasonProblem(reason: unknown): string | undefined {
  if (reason === undefined) return '缺理由'
  if (typeof reason !== 'string') return '理由不是一句话'
  if (reason.trim() === '') return '理由是空的'
  return /[\r\n]/.test(reason) ? '理由不止一行' : undefined
}

/** The `held` of a timeout: absent, readable, or not in its shape. */
function heldOf(raw: unknown): Held | 'bad' | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || (raw.by !== 'cap' && raw.by !== 'floor') || !isPositive(raw.wantedS)) return 'bad'
  return { by: raw.by, wantedS: raw.wantedS }
}

/** The sentences of a number three times a run time gives: as it is, raised to the floor, held at the ceiling. */
interface Computed {
  readonly plain: string
  readonly floor: (wantedS: number) => string
  readonly cap: (wantedS: number) => string
}

/** The sentence of a computed number after the check of three times the run time (plain-ui 1.3 §8.2, P12-01, P13-03). */
function computedWords(seconds: number, held: Held | 'bad' | undefined, triple: number, words: Computed, report: Report): string {
  if (held === 'bad') {
    report('held', '下限或上限的说法读不懂')
    return noRecord('下限或上限的说法读不懂')
  }
  if (held === undefined) {
    if (near(seconds, triple)) return words.plain
    const why = `超时的数和来源对不上（${s(seconds)} 秒，3 倍是 ${s(triple)} 秒）`
    report('triple', why)
    return noRecord(why)
  }
  if (!near(held.wantedS, triple)) {
    const why = `算出来的数和来源对不上（算出来是 ${s(held.wantedS)} 秒，3 倍是 ${s(triple)} 秒）`
    report('triple', why)
    return noRecord(why)
  }
  if (held.by === 'floor' ? held.wantedS >= seconds : held.wantedS <= seconds) {
    const why = held.by === 'floor'
      ? `算出来的 ${s(held.wantedS)} 秒不比超时的 ${s(seconds)} 秒少，却写着取下限`
      : `算出来的 ${s(held.wantedS)} 秒不比超时的 ${s(seconds)} 秒多，却写着保持上限`
    report('held', why)
    return noRecord(why)
  }
  return held.by === 'floor' ? words.floor(held.wantedS) : words.cap(held.wantedS)
}

/** The source sentence of a timeout in the parentheses after its number (plain-ui 1.3 §4.7 「数与来源」). */
function sourceWords(timeout: Rec, seconds: number, report: Report, tell: PageTell): string {
  const source = timeout.source
  const held = heldOf(timeout.held)
  if (source === undefined) {
    tell.info('loops:no-source', 'a timeout on the loop board has no source: the page reads it as a fixed number of the design')
    if (held === undefined) return '设计里定的固定值'
    report('held', '设计里定的固定值不会被下限抬高或被上限截住')
    return noRecord('设计里定的固定值不会被下限抬高或被上限截住')
  }
  if (!isRecord(source)) {
    report('source', '来源读不懂')
    return noRecord('来源读不懂')
  }
  switch (source.kind) {
    case 'ceiling':
    case 'fixed-by-design': {
      if (held === undefined) return source.kind === 'ceiling' ? '上限 · 没写估计' : '设计里定的固定值'
      report('held', '这种来源不会被下限抬高或被上限截住')
      return noRecord('这种来源不会被下限抬高或被上限截住')
    }
    case 'agent-estimate': {
      if (!isPositive(source.estimateS)) {
        report('estimate', '缺估的秒数')
        return noRecord('缺估的秒数')
      }
      if (!isTime(source.at)) {
        report('estimate-at', '缺估的日期')
        return noRecord('缺估的日期')
      }
      const said = `${source.who === 'human' ? '你' : 'agent '}估跑 ${s(source.estimateS)} 秒`
      const stamp = ` · ${dayWords(source.at)}，${typeof source.session === 'string' && source.session !== '' ? `会话 ${source.session}` : '会话未记'}`
      return computedWords(seconds, held, 3 * source.estimateS, {
        plain: `${said}，乘 3${stamp}`,
        floor: wanted => `${said}，乘 3 是 ${s(wanted)} 秒，不足下限，取下限 ${s(seconds)} 秒${stamp}`,
        cap: wanted => `${said}，乘 3 本该是 ${s(wanted)} 秒，超过上限，保持上限 ${s(seconds)} 秒，已告诉主 Agent${stamp}`,
      }, report)
    }
    case 'measured': {
      if (!Number.isInteger(source.runs) || (source.runs as number) <= 0 || !isSeconds(source.slowestS)) {
        report('measured', '缺运行的次数或最慢的秒数')
        return noRecord('缺运行的次数或最慢的秒数')
      }
      const said = `系统按最近 ${source.runs as number} 次最慢的 ${s(source.slowestS)} 秒`
      return computedWords(seconds, held, 3 * source.slowestS, {
        plain: `${said}的 3 倍定`,
        floor: wanted => `${said}算，3 倍是 ${s(wanted)} 秒，不足下限，取下限 ${s(seconds)} 秒`,
        cap: wanted => `${said}算，3 倍本该是 ${s(wanted)} 秒，超过上限，保持上限 ${s(seconds)} 秒，已告诉主 Agent`,
      }, report)
    }
    default:
      report('source', '来源不在四种里')
      return noRecord('来源不在四种里')
  }
}

/** The line of a ceiling the main agent raised, while that is the setting in force (plain-ui 1.3 §4.7, P12-02, P13-04). */
function raisedLine(raw: unknown, fixed: boolean, report: Report): string | undefined {
  if (raw === undefined) return undefined
  if (fixed) {
    report('raised', '设计里定的固定值不会被调高上限')
    return noRecord('设计里定的固定值不会被调高上限')
  }
  if (!isRecord(raw) || !isPositive(raw.capS)) {
    report('raised', '调高到几秒读不懂')
    return noRecord('调高到几秒读不懂')
  }
  if (!isTime(raw.at)) {
    report('raised', '调高的日期读不懂')
    return noRecord('调高的日期读不懂')
  }
  const head = `上限已由主 Agent 调高到 ${s(raw.capS)} 秒 · ${dayWords(raw.at)}`
  const problem = reasonProblem(raw.reason)
  if (problem === undefined) return `${head}：${raw.reason as string}；要改回，跟主 Agent 说`
  report('reason', `理由没有记录：${problem}`)
  return `${head}（理由没有记录：${problem}）；要改回，跟主 Agent 说`
}

/** The history in 讲细点, newest first; the first value kept has no old value (plain-ui 1.3 §4.7 「来历」). */
function historyLines(raw: unknown, title: string, required: boolean, report: Report): string[] {
  const missing = (): string[] => {
    report('history', '缺来历')
    return [`${title}的来历：${noRecord('缺来历')}`]
  }
  if (raw === undefined || !Array.isArray(raw)) return required || raw !== undefined ? missing() : []
  if (raw.length === 0) return required ? missing() : []
  const lines: string[] = []
  for (const [index, item] of (raw as readonly unknown[]).entries()) {
    const oldest = index === raw.length - 1
    if (!isRecord(item) || !isTime(item.at) || !isPositive(item.seconds) || typeof item.source !== 'string' || (item.previousS === undefined ? !oldest : !isPositive(item.previousS))) {
      const why = `来历第 ${index + 1} 条缺时间、新值、旧值或来源`
      report('history', why)
      return [`${title}的来历：${noRecord(why)}`]
    }
    lines.push(`${momentText(item.at)} · ${s(item.seconds)} 秒 · ${item.previousS === undefined ? '第一个值' : `原 ${s(item.previousS as number)} 秒`} · ${item.source}`)
  }
  return [`${title}的来历（新的在前）：`, ...lines]
}

interface TimeoutRecord {
  readonly at: string
  readonly limitS: number
  readonly elapsedS: number
  readonly outcome: string
}

/** The timeouts the board gave, readable, or the line saying they are not. */
function timeoutRecords(raw: unknown, title: string, required: boolean, report: Report): { readonly lines: readonly string[], readonly records?: readonly TimeoutRecord[] } {
  const bad = (why: string): { readonly lines: readonly string[] } => {
    report('timeouts', why)
    return { lines: [`${title}最近的超时：${noRecord(why)}`] }
  }
  if (raw === undefined) return required ? bad('缺超时记录') : { lines: [] }
  if (!Array.isArray(raw)) return bad('缺超时记录')
  const records: TimeoutRecord[] = []
  for (const [index, item] of (raw as readonly unknown[]).entries()) {
    if (!isRecord(item) || !isTime(item.at) || !isPositive(item.limitS) || !isSeconds(item.elapsedS) || typeof item.outcome !== 'string' || item.outcome === '') return bad(`超时记录第 ${index + 1} 条缺时间、限、用时或结局`)
    records.push({ at: item.at, limitS: item.limitS, elapsedS: item.elapsedS, outcome: item.outcome })
  }
  const shown = records.slice(0, SHOWN_TIMEOUTS).map(record => `${momentText(record.at)} · 限 ${s(record.limitS)} 秒 · 跑了 ${s(record.elapsedS)} 秒 · ${record.outcome}`)
  return { lines: shown.length === 0 ? [] : [`${title}最近的超时：`, ...shown], records }
}

/** 「最近 7 天超时 N 次」: the board's count, else the records of the seven days before the view; no line without either. */
function weekLine(raw: unknown, records: readonly TimeoutRecord[] | undefined, nowMs: number, report: Report): string | undefined {
  let count: number
  if (raw !== undefined) {
    if (!Number.isInteger(raw) || (raw as number) < 0) {
      report('timeouts7d', '最近 7 天的超时次数读不懂')
      return noRecord('最近 7 天的超时次数读不懂')
    }
    count = raw as number
  }
  else if (records !== undefined && !Number.isNaN(nowMs)) count = records.filter(record => Date.parse(record.at) <= nowMs && Date.parse(record.at) > nowMs - WEEK_MS).length
  else return undefined
  return count === 0 ? '最近没有超时' : `最近 7 天超时 ${count} 次`
}

/**
 * The cell of one check a plugin entry hands the page, or undefined (told)
 * when it is not a check at all. `nowMs` is the time of the view, for
 * counting the seven days out of the records when the board gave no count.
 */
export function checkCell(raw: unknown, entry: string, nowMs: number, tell: PageTell): CheckCell | undefined {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.title !== 'string' || !isRecord(raw.timeout)) {
    tell.warn(`${entry}:check`, `the loop board's entry ${entry} hands a check that is not one; the page leaves it out`)
    return undefined
  }
  const { key, title, timeout } = raw as { readonly key: string, readonly title: string, readonly timeout: Rec }
  const report: Report = (code, why) => { tell.warn(`${entry}:${key}:${code}`, `the loop board's entry ${entry}, check ${key}: ${why}`) }
  if (!isPositive(timeout.seconds)) {
    report('seconds', '超时的数读不懂')
    return { key, lines: [`${title} · 超时：${noRecord('超时的数读不懂')}`], details: [] }
  }
  const kind = isRecord(timeout.source) ? timeout.source.kind : undefined
  // The first two sources owe a history and a timeouts list; the ceiling and a fixed number may lack both (plain-ui 1.3 §4.7, P10-02).
  const counted = kind === 'agent-estimate' || kind === 'measured'
  const sentence = `${title} · 超时 ${s(timeout.seconds)} 秒（${sourceWords(timeout, timeout.seconds, report, tell)}）`
  const raised = raisedLine(timeout.capRaised, timeout.source === undefined || kind === 'fixed-by-design', report)
  const timeouts = timeoutRecords(timeout.timeouts, title, counted, report)
  const week = weekLine(timeout.timeouts7d, timeouts.records, nowMs, report)
  return {
    key,
    lines: [sentence, ...(raised === undefined ? [] : [raised]), ...(week === undefined ? [] : [week])],
    details: [...historyLines(timeout.history, title, counted, report), ...timeouts.lines],
  }
}
