/**
 * The view model of the loop board's page (loop board design 0.6 §8.2,
 * §8.5): what the project's view.json (src/loops/view.ts) becomes as the
 * page's sections — the head with the main agent's line, what the person
 * is to look at, the plugins' entries that something starts and the ones
 * the clock starts, the person's own (the deleted ones folded), and the last
 * runs. Every line is in the page's words; the runs line is the one `/loops`
 * prints too (`runLine`). Pure functions, no React, no DOM, no Node
 * built-ins, so the spec runs them directly. The page carries no write path:
 * what the person can change is said as what to tell the main agent or which
 * command to type.
 */
import { momentText, runLine, type LoopsView, type PeakView, type ViewEntry } from '../../../src/loops/view.ts'
import { checkCell, type PageTell } from './timeouts.ts'

/** One entry on the page. */
export interface LoopItem {
  readonly id: string
  readonly title: string
  /** 什么时候 · 做什么. */
  readonly whatLine: string
  /** 上次 · 下次, or that it runs on its own. */
  readonly runLine: string
  /** 谁带来的, the grey line. */
  readonly fromLine: string
  /** The sentence beside the state: why it does not run now, or how to get it back. */
  readonly note: string | null
  /** It does not run now: shown greyed. */
  readonly greyed: boolean
  /** How to change and delete one of the person's own; null for a plugin's. */
  readonly changeLine: string | null
  /** The timeout of each check a plugin entry runs: the number and its source, a raised ceiling, the seven days (./timeouts.ts). */
  readonly checkLines: readonly string[]
  /** A person's script or check entry: the version agreed to, a check's command, the timeout (loop board design §8.2 item 5). */
  readonly workLines: readonly string[]
  /** A person's script entry: its file from the project root, read when 讲细点 opens; null for the others. */
  readonly script: string | null
  /** 讲细点: why it is there, the hand-over's lines, the history and last timeouts of its checks, its own rules, the id and its state, in small print. */
  readonly details: readonly string[]
}

interface ItemGroup {
  readonly title: string
  readonly rows: readonly LoopItem[]
}

export interface LoopsPageModel {
  /** The main agent's line of the head; null while the board has not read it yet. */
  readonly holderLine: string | null
  readonly holderSession: string | null
  /** The GLM peak as the board reads it; null without the GLM channel. */
  readonly peakLine: string | null
  /** How many things wait; null when nothing does. */
  readonly waitingLine: string | null
  /** 要你看一眼的. */
  readonly attention: readonly string[]
  /** 碰到某件事就做的: the plugins' entries that an event starts. */
  readonly events: ItemGroup
  /** 到点做的: the plugins' entries the clock starts. */
  readonly timed: ItemGroup
  /** 本项目加的: the person's entries. */
  readonly mine: ItemGroup
  /** The line in place of the person's entries when there is none. */
  readonly mineEmpty: string | null
  /** The person's entries deleted in the last 7 days, folded. */
  readonly deleted: ItemGroup
  /** 最近跑过的: 时刻 · 名字 · 结局. */
  readonly recent: readonly string[]
}

/** The state words of the entries that do not run now (design §9.3). */
const STATE_WORDS: Readonly<Record<string, string>> = {
  active: '在用',
  waiting: '现在不跑',
  ok: '在用',
  owed: '条目文件待写回',
  outside: '条目文件在循环板之外被改过',
  'not-in-checkout': '当前检出里没有',
  unreadable: '条目文件读不出',
  unadopted: '这台电脑上没有你同意的记录',
  deleted: '删掉了',
}

const runs = (entry: ViewEntry): boolean => entry.state === 'active' || entry.state === 'ok'

/** The page tells what the board's data lacks once per key, in the console (plain-ui 1.3 §8.1). */
const told = new Set<string>()
const CONSOLE_TELL: PageTell = {
  warn(key, text) {
    if (told.has(`warn:${key}`)) return
    told.add(`warn:${key}`)
    console.warn(`glm-hourness: ${text}`)
  },
  info(key, text) {
    if (told.has(`info:${key}`)) return
    told.add(`info:${key}`)
    console.info(`glm-hourness: ${text}`)
  },
}

/** The strings of a list the view hands over; anything else is no line. */
const textsOf = (value: unknown): readonly string[] => Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : []

function itemOf(entry: ViewEntry, nowMs: number, tell: PageTell): LoopItem {
  const mine = entry.source === 'person'
  const cells = (Array.isArray(entry.checks) ? entry.checks as readonly unknown[] : []).flatMap(check => checkCell(check, entry.id, nowMs, tell) ?? [])
  const ownRules = textsOf(entry.ownRules)
  return {
    id: entry.id,
    title: entry.title,
    whatLine: `${entry.when} · ${entry.does}`,
    runLine: runLine(entry),
    fromLine: entry.from,
    note: entry.note ?? null,
    greyed: !runs(entry),
    changeLine: mine && entry.state !== 'deleted' ? `要改：跟主 Agent 说「把${entry.title}改成……」；要删：在输入框打 /loops delete ${entry.title}` : null,
    checkLines: cells.flatMap(cell => cell.lines),
    workLines: textsOf(entry.work),
    script: typeof entry.script === 'string' && entry.script !== '' ? entry.script : null,
    details: [
      ...(entry.why === undefined ? [] : [`为什么有它：${entry.why}`]),
      ...textsOf(entry.details),
      ...cells.flatMap(cell => cell.details),
      // The entry's own rules (loop board design §2.1 「<名字>自己的规矩」); for M4's checker the step's 20 seconds are here, not in the timeout cell (plain-ui 1.3 §4.7, P12-05).
      ...(ownRules.length === 0 ? [] : [`「${entry.title}」自己的规矩：`, ...ownRules]),
      `状态：${STATE_WORDS[entry.state] ?? entry.state}`,
      `id：${entry.id}`,
    ],
  }
}

/** 此刻：高峰中… · 高峰模式：… (design §8.2 item 3). */
function peakLineOf(peak: PeakView): string {
  const clock = peak.now === undefined
    ? '此刻读不出是不是高峰'
    : peak.now
      ? `此刻：高峰中${peak.until === undefined ? '' : `，到 ${momentText(peak.until)} 结束`}`
      : `此刻：不是高峰${peak.until === undefined ? '' : `；下一个高峰 ${momentText(peak.until)}`}`
  const level = `高峰模式：${peak.level}${peak.origin === 'default' ? '（出厂默认）' : ''}`
  return [clock, level, ...(peak.cap === undefined ? [] : [peak.cap])].join(' · ')
}

/** The page model of a project's view; `view` is null while there is no view.json yet. `tell` hears what the board's data lacks (the console, once per key). */
export function buildLoopsPage(view: LoopsView | null, tell: PageTell = CONSOLE_TELL): LoopsPageModel {
  const entries = view?.entries ?? []
  const nowMs = view === null ? Number.NaN : Date.parse(view.at)
  const item = (entry: ViewEntry): LoopItem => itemOf(entry, nowMs, tell)
  const plugin = entries.filter(entry => entry.source === 'plugin')
  const person = entries.filter(entry => entry.source === 'person')
  const mine = person.filter(entry => entry.state !== 'deleted').map(item)
  const deleted = person.filter(entry => entry.state === 'deleted' && entry.note !== undefined).map(item)
  return {
    holderLine: view?.holder?.line ?? null,
    holderSession: view?.holder?.session ?? null,
    peakLine: view?.peak === undefined ? null : peakLineOf(view.peak),
    waitingLine: view === null || view.waiting === 0 ? null : `在等的 ${view.waiting} 件`,
    attention: view?.attention ?? [],
    events: { title: '碰到某件事就做的', rows: plugin.filter(entry => entry.trigger === 'event').map(item) },
    timed: { title: '到点做的', rows: plugin.filter(entry => entry.trigger === 'time').map(item) },
    mine: { title: '本项目加的', rows: mine },
    mineEmpty: mine.length === 0 ? '还没有你加的。要加：跟主 Agent 说「每 30 分钟查一下服务器，挂了告诉我」' : null,
    deleted: { title: `最近 7 天删掉的（${deleted.length}）`, rows: deleted },
    recent: (view?.recent ?? []).map(run => `${momentText(run.at)} · ${run.title} · ${run.text}`),
  }
}
