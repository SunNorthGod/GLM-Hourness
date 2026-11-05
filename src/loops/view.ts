/**
 * What the loop board shows of a project (docs/ORCHESTRATION.md §18.7; loop board
 * design §7.2, §8.2, §8.4, §8.5, §9.3): one `view.json` in the project's
 * `.llm/loops/`, written by the host that runs the board, so the page and
 * `/loops` show the same thing the board judges by. It lists every entry, the
 * plugins' and the person's, with the state the board holds it in, what it
 * listens for and does, who brought it, its last run in plain words and its
 * next time; the main agent's line of the page head; how many things wait;
 * the last runs; and the things a person is to look at, each as the sentence
 * the page shows.
 *
 * Only types and pure functions, and no import that reaches a Node built-in
 * (the input shapes are written out here instead of taken from store.ts,
 * registry.ts and records.ts), so the page can import it. The runtime part
 * comes from the project's `state.json` and the tail of its run records,
 * which boards.ts reads; a view without it lists the entries alone.
 */
import { pluginLabel } from '../shared/plugin-labels.ts'
import { commandText, WORK_TIMEOUT_MS } from './command-text.ts'
import type { Action, LoopEntry, PersonEntry } from './model.ts'
import { nextOccurrence, type LoopEventDeclaration, type Trigger } from './trigger.ts'

/** One run's end as the person reads it (design §8.5). */
interface OutcomeView {
  /** ISO time the run ended. */
  readonly at: string
  /** The outcome as the run records name it. */
  readonly outcome: string
  /** The outcome in the page's words. */
  readonly text: string
}

export interface ViewEntry {
  readonly id: string
  readonly title: string
  readonly source: 'plugin' | 'person'
  /** A plugin's: `active` or `waiting`; a person's: the state the board holds the entry file in (`ok`, `owed`, `outside`, `not-in-checkout`, `unreadable`, `unadopted`, `deleted`). */
  readonly state: string
  /** The sentence to show beside the state, when there is one. */
  readonly note?: string
  /** `time`: the clock starts it; `event`: something that happens (an event, or a command for a plugin's own entry). The page groups by it (design §8.2 items 3 to 5). */
  readonly trigger: 'time' | 'event'
  /** The kind of the action; absent for a person's entry whose file cannot be read. */
  readonly action?: Action['kind']
  /** 什么时候. */
  readonly when: string
  /** 做什么. */
  readonly does: string
  /** 谁带来的. */
  readonly from: string
  readonly why?: string
  /** The last run, when the board has one. */
  readonly last?: OutcomeView
  /** ISO time of the next run of a `once`, `daily` or `weekly` entry that runs now; none for `every` (DSH aligns it to its task's anchor) and cron (DSH computes it). */
  readonly next?: string
  /** A plugin entry's own rules, as its hand-over lists them (design §8.2 讲细点). */
  readonly ownRules?: readonly string[]
  /** A plugin entry's detail lines for this project, from its hand-over's `details` (design §8.2 讲细点). */
  readonly details?: readonly string[]
  /** The checks a plugin entry runs in this project with their timeouts, from its hand-over's `checks` (plain-ui 1.3 §4.7, §8.2). */
  readonly checks?: readonly ViewCheck[]
  /** A person's script or check entry: the line of the version agreed to, a check's command line, and the timeout line (design §8.2 item 5, plain-ui 1.3 §4.7). */
  readonly work?: readonly string[]
  /** A person's script entry: its file from the project root, which the page reads when 讲细点 opens (design §8.2 item 5). */
  readonly script?: string
}
/**
 * Where a timeout's number came from (plain-ui 1.3 §4.7 「数与来源」, §8.2):
 * the estimate of the agent that wrote the check (E seconds, the day and
 * session it was written), the slowest of the last N runs (X seconds), the
 * ceiling (no estimate, no run), or a fixed number of the design.
 */
export type ViewTimeoutSource =
  | { readonly kind: 'agent-estimate', readonly estimateS: number, readonly at?: string, readonly session?: string, readonly who?: 'human' }
  | { readonly kind: 'measured', readonly runs: number, readonly slowestS: number }
  | { readonly kind: 'ceiling' }
  | { readonly kind: 'fixed-by-design' }
/** One earlier value of a timeout, for its history (plain-ui 1.3 §4.7 「来历」). */
export interface ViewTimeoutChange {
  readonly at: string
  readonly seconds: number
  /** The value before; only the oldest change kept may lack it. */
  readonly previousS?: number
  /** Where this value came from, in the page's words. */
  readonly source: string
}
/** One run stopped at its limit (plain-ui 1.3 §4.7 「超时记录」). */
interface ViewTimeoutRecord {
  readonly at: string
  readonly limitS: number
  readonly elapsedS: number
  /** What the entry does with it, in the page's words. */
  readonly outcome: string
}
/** The timeout of one check as the page words it (plain-ui 1.3 §8.2, the row of the boards' timeouts). Every number is in seconds, as computed, not rounded. */
export interface ViewTimeout {
  readonly seconds: number
  readonly source?: ViewTimeoutSource
  /** Three times the run time was under the floor or over the ceiling: what it would have been. Only with an estimate or runs. */
  readonly held?: { readonly by: 'cap' | 'floor', readonly wantedS: number }
  /** The ceiling the main agent raised, while that is the setting in force. */
  readonly capRaised?: { readonly capS: number, readonly at: string, readonly reason: string }
  /** The values it had, newest first. */
  readonly history?: readonly ViewTimeoutChange[]
  /** Its last timeouts, newest first, at most five. */
  readonly timeouts?: readonly ViewTimeoutRecord[]
  /** Its timeouts in the seven days before the view. */
  readonly timeouts7d?: number
}
/** One check a plugin entry runs, with its timeout. */
export interface ViewCheck {
  /** The check's key, for the small print. */
  readonly key: string
  /** Its name in the page's words. */
  readonly title: string
  readonly timeout: ViewTimeout
}

/**
 * What the view says about the GLM peak (design §8.2 item 3, §6.9 item 3):
 * whether it is peak now and when it turns, from the pricing service the
 * board reads its channel events from, and the level, from the rules board's
 * service (`stateForProject`) — never from the rules board's files. A level
 * the rules board cannot read for this project says where to look instead.
 */
export interface PeakView {
  /** Whether it is peak now; undefined when the clock cannot be read. */
  readonly now: boolean | undefined
  /** ISO 8601: the end of this peak, or the start of the next one. */
  readonly until?: string
  /** The level's name (无影响/少做/不做), or 「档位在规则板上看」. */
  readonly level: string
  /** `default`: the factory level stands, the project never chose; `human`: the person chose it. Undefined with the fallback level. */
  readonly origin?: 'default' | 'human'
  /** The reduce level's cap line, while it is peak. */
  readonly cap?: string
}

/** The line of the page head about the main agent (design §8.2 item 1). */
export interface HolderView {
  readonly line: string
  /** The main agent's session, for the small print. */
  readonly session?: string
}

/** One line of 最近跑过的 (design §8.2 item 7): a run, an event reported again, or a DSH reminder the board deleted. */
interface RecentRun {
  readonly at: string
  readonly title: string
  readonly text: string
}

export interface LoopsView {
  readonly version: 1
  /** ISO time the view was made. */
  readonly at: string
  /** The project's key (src/graph/main-agent-holder.ts projectKey). */
  readonly project: string
  readonly entries: readonly ViewEntry[]
  /** What the person is to look at, one sentence each. */
  readonly attention: readonly string[]
  /** The GLM peak as it stands; absent while this host has no pricing service at all (no peak to show, design §5.2). */
  readonly peak?: PeakView
  /** The main agent's line; absent while the runtime of this project has not read the holder yet. */
  readonly holder?: HolderView
  /** How many things wait (design §7.2 「在等的 N 件」): runs whose debounce is not over, messages held for the main agent, runs the rules board queued. */
  readonly waiting: number
  /** The last runs, newest first, at most 20. */
  readonly recent: readonly RecentRun[]
}

/** One thing the person is to look at; `degrades` says it also degrades the row's health, since it stops an entry or the record from being trusted. */
interface Attention {
  readonly text: string
  readonly degrades: boolean
}

/** A person's entry as the store reads it (store.ts `BoardEntry`, the fields the view reads). */
interface ViewBoardEntry {
  readonly id: string
  readonly title: string
  readonly status: { readonly kind: string }
  readonly entry: PersonEntry | undefined
  readonly restorable: boolean
}

/** The store's read of a project (store.ts `BoardRead`, the fields the view reads). */
interface ViewBoard {
  readonly entries: readonly ViewBoardEntry[]
  readonly journal: { readonly unacknowledged: readonly number[] }
  readonly git?: string | undefined
}

/** A plugin's entry as the registry lists it (registry.ts `RegisteredEntry`, the fields the view reads). */
interface ViewPluginEntry {
  readonly entry: LoopEntry
  readonly state: string
  readonly reason?: string
}

/** The records 最近跑过的 lists (records.ts `loop-done`, `loop-duplicate`, `loop-task-delete`, the fields the view reads; `recentRecords` reads them in this shape). */
export type ViewRecord =
  | { readonly kind: 'loop-done', readonly at: string, readonly entry: string, readonly outcome: string, readonly reason?: string, readonly exits?: readonly number[] }
  | { readonly kind: 'loop-duplicate', readonly at: string, readonly event: string }
  | { readonly kind: 'loop-task-delete', readonly at: string, readonly entry?: string, readonly why: string, readonly deleted: boolean }

/** What the runtime of the project has kept (inbox.ts `RuntimeState`) and recorded, as the view reads it. */
export interface ViewRuntime {
  /** The last run of each entry. */
  readonly last: Readonly<Record<string, { readonly at: string, readonly outcome: string, readonly reason?: string }>>
  /** Whether each script or check entry passed its last run. */
  readonly passing: Readonly<Record<string, boolean>>
  readonly waiting: number
  /** The latest records, oldest first. */
  readonly records: readonly ViewRecord[]
  readonly holder?: HolderView
}

/** How many runs 最近跑过的 lists (design §8.2 item 7). */
const RECENT_RUNS = 20

// ------------------------------------------------------------------ words

/** `10月31日 08:30` on the clock of this machine; the text itself when it is not a time. */
export function momentText(at: string | Date): string {
  const moment = typeof at === 'string' ? new Date(at) : at
  if (Number.isNaN(moment.getTime())) return String(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${moment.getMonth() + 1}月${moment.getDate()}日 ${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

const systemTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** `每 30 分钟`, by the largest whole unit. */
function everyText(seconds: number): string {
  if (seconds % 86_400 === 0) return `每 ${seconds / 86_400} 天`
  if (seconds % 3_600 === 0) return `每 ${seconds / 3_600} 小时`
  if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`
  return `每 ${seconds} 秒`
}

/** The time zone a written time is in, when it is not this machine's. */
const zoneText = (timeZone: string | undefined): string => timeZone === undefined || timeZone === systemTimeZone() ? '' : `（${timeZone}）`

/** 什么时候 (design §8.5): the clock in words, or the titles of the events in the event table. */
function whenText(when: Trigger, events: ReadonlyMap<string, LoopEventDeclaration>): string {
  switch (when.kind) {
    case 'once': return `${momentText(when.at)} 一次`
    case 'every': return everyText(when.seconds)
    case 'daily': return `每天 ${when.time}${zoneText(when.timeZone)}`
    case 'weekly': return `每周${when.weekdays.map(day => WEEKDAYS[day - 1] ?? String(day)).join('、')} ${when.time}${zoneText(when.timeZone)}`
    case 'cron': return `按 cron「${when.expression}」${zoneText(when.timeZone)}`
    case 'event': return `碰到${when.events.map(id => `「${events.get(id)?.title ?? id}」`).join('或')}`
    case 'command': return `打 ${when.names.map(name => `/${name}`).join('、')} 时`
  }
}

/** Whom a script's or a check's result goes to, and when (design §2.3 `report`, `to`). */
function reportText(action: { readonly report: string, readonly to?: string }): string {
  const who = action.to === 'event-session' ? '事件来的那个会话' : '主 Agent'
  if (action.report === 'always') return `，每次都告诉${who}`
  if (action.report === 'on-failure') return `，没过才告诉${who}`
  return `，结果变了才告诉${who}`
}

/** 做什么 (design §8.5): the action in words; `label` is the plugin's name for an entry a plugin does itself. */
function doesText(action: Action, label: string): string {
  switch (action.kind) {
    case 'tell-main': return action.wake ? '告诉主 Agent' : '告诉主 Agent（不叫醒它）'
    case 'harness': return action.tell === undefined ? '系统自己做' : '系统自己做，再告诉主 Agent'
    case 'self': return `交给${label}自己做：${action.does}`
    case 'script': return `跑脚本 ${action.script.file}${reportText(action)}`
    case 'check': return `跑项目图上「${action.tool}」的检查${reportText(action)}`
  }
}

/** Whether a person's script file is the one they agreed to, as the host reads it now (boards.ts): the same bytes, other bytes, no file, or too large to read. */
export type ScriptStanding = 'agreed' | 'changed' | 'missing' | 'too-large'

/** `10 月 31 日` on the clock of this machine, as the timeout cell writes a day (ui/src/loops/timeouts.ts); the text itself when it is not a time. */
function dayText(at: string): string {
  const moment = new Date(at)
  return Number.isNaN(moment.getTime()) ? at : `${moment.getMonth() + 1} 月 ${moment.getDate()} 日`
}

/**
 * The lines under a person's script or check entry (design §8.2 item 5,
 * plain-ui 1.3 §4.7 「带脚本或检查的条目」): whether the script is the version
 * the person agreed to — or the check the command they agreed to, with the
 * command line —, and the timeout with where its number came from and what a
 * timeout or a crash does. A check whose command changed on the graph or
 * could not be read is known from its last run, since the view reads no
 * graph; a script's standing is the host's read of the file now.
 */
function workLines(entry: PersonEntry, state: string, standing: ScriptStanding | undefined, last: { readonly outcome: string, readonly reason?: string } | undefined): string[] | undefined {
  const action = entry.action
  if (action.kind !== 'script' && action.kind !== 'check') return undefined
  const day = dayText(entry.source.at)
  const unadopted = state === 'unadopted'
  const refused = last?.outcome === 'refused' ? last.reason : undefined
  const who = action.to === 'event-session' ? '事件来的那个会话' : '主 Agent'
  const seconds = action.timeoutSeconds ?? WORK_TIMEOUT_MS / 1000
  const timeout = `超时 ${seconds} 秒（${action.timeoutSeconds === undefined ? '设计里定的固定值' : '条目里写明的'}）：超时算没跑完，告诉${who}，这次的事件下次再跑；崩溃算没过`
  if (action.kind === 'script') {
    const again = `要接着用，跟主 Agent 说「把${entry.title}的脚本给我看一下」`
    const version = unadopted
      ? '脚本：这台电脑上没有你同意的记录，先不跑'
      : standing === 'changed'
        ? `脚本 ${action.script.file} 和你同意的那一版不一样，先不跑；${again}`
        : standing === 'missing'
          ? `脚本文件不见了：${action.script.file}，先不跑`
          : standing === 'too-large'
            ? '脚本太大，先不跑'
            : `脚本：你 ${day} 同意的那一版`
    return [version, timeout]
  }
  const version = unadopted
    ? `检查：项目图上「${action.tool}」的命令，这台电脑上没有你同意的记录，先不跑`
    : refused === 'check-changed'
      ? `检查：项目图上「${action.tool}」的命令改过了，和你 ${day} 同意的那一条不一样，先不跑；要接着用，跟主 Agent 说「把${entry.title}的检查再看一眼，同意一次」`
      : refused === 'check-missing'
        ? `检查：取不到项目图上「${action.tool}」的命令，先不跑`
        : `检查：项目图上「${action.tool}」的命令，你 ${day} 同意的那一条`
  return [version, `命令：${commandText(action.argv)}`, timeout]
}

/** 谁带来的 (design §8.2 items 3 and 5). */
function pluginFrom(entry: LoopEntry): string {
  return `${pluginLabel(entry.source.plugin)}带来的 · 只能看${entry.basis === undefined ? '' : ` · 依据 ${entry.basis}`}`
}

function personFrom(entry: PersonEntry | undefined): string {
  if (entry === undefined) return '你加的'
  return entry.source.via === 'board' ? '你在输入框里同意的' : `你在对话里加的：「${entry.source.relay}」`
}

/** The outcome words of design §8.5, by the outcome of §6.10. */
const OUTCOME_WORDS: Readonly<Record<string, string>> = {
  delivered: '已交给主 Agent',
  ran: '跑完了，没事',
  reported: '跑完了，已告诉主 Agent',
  skipped: '这次不用跑',
  suppressed: '次数太多，合进下一次',
  deferred: '在等规则放行',
  blocked: '被规则拦下',
  held: '先存着',
  failed: '没成功',
  expired: '放太久，作废了',
  unfinished: '没跑完，这次的事件下次一起再跑',
  refused: '先不跑',
}

/** Why a run was refused, in the page's words (design §6.6, §9.3). */
const REFUSED_WORDS: Readonly<Record<string, string>> = {
  'unadopted': '这台电脑上没有你同意的记录，先不跑',
  'script-changed': '脚本和你同意的那一版不一样，先不跑',
  'script-missing': '脚本不在这份检出里，先不跑',
  'too-large': '脚本太大，先不跑',
  'check-missing': '取不到这项检查的命令，先不跑',
  'check-changed': '检查命令在项目图上改过了，先不跑',
  'outside-project': '要跑的那份检出不在这个项目里，先不跑',
}

/** The crashes of the executor (script.ts): a script that could not start or was ended by a signal did not pass. */
const CRASHES = new Set(['spawn', 'signal', 'io'])

/**
 * One run's end in the page's words (design §8.5). `passed` tells a script's
 * or a check's pass from its failure, which the outcome alone does not say
 * (`ran` and `reported` are about whether it was told); `label` names the
 * plugin of an entry it does itself.
 */
function outcomeText(run: { readonly outcome: string, readonly reason?: string | undefined, readonly passed?: boolean | undefined }, label: string | undefined): string {
  if (run.outcome === 'delegated') return `交给${label ?? '带来它的插件'}自己做`
  if (run.outcome === 'refused') return REFUSED_WORDS[run.reason ?? ''] ?? OUTCOME_WORDS.refused
  if (run.outcome === 'suppressed' && run.reason === 'self-loop') return '循环板自己做的事引起的，这次停下'
  if (run.passed === false && run.outcome === 'ran') return '跑完了，没过'
  if (run.passed === false && run.outcome === 'reported') return '没过，已告诉主 Agent'
  return OUTCOME_WORDS[run.outcome] ?? run.outcome
}

/** Why the board deleted a DSH reminder (design §8.2 item 7, §6.2). */
const DELETE_WORDS: Readonly<Record<string, string>> = {
  'moved': '主 Agent 换了会话',
  'entry-gone': '这一项没了',
  'duplicate': '多了一条',
  'no-holder': '还没有主 Agent',
  'holder-archived': '主 Agent 的会话已归档',
  'holder-not-found': '主 Agent 的会话找不到了',
  'repair': 'DSH 里的被改坏了重建',
  'not-delivered': 'DSH 没投出去重建',
}

/** Whether a recorded run passed: the exit codes when it started a process, a crash when it could not. */
function passedOf(record: Extract<ViewRecord, { kind: 'loop-done' }>): boolean | undefined {
  if (record.exits !== undefined && record.exits.length > 0) return record.exits.every(code => code === 0)
  return record.reason !== undefined && CRASHES.has(record.reason) ? false : undefined
}

/** 最近跑过的: the records as lines, newest first, at most 20. */
function recentRuns(records: readonly ViewRecord[], titleOf: (id: string) => string, labelOf: (id: string) => string | undefined, events: ReadonlyMap<string, LoopEventDeclaration>): RecentRun[] {
  return records.slice(-RECENT_RUNS).reverse().map((record): RecentRun => {
    switch (record.kind) {
      case 'loop-done': return { at: record.at, title: titleOf(record.entry), text: outcomeText({ outcome: record.outcome, reason: record.reason, passed: passedOf(record) }, labelOf(record.entry)) }
      case 'loop-duplicate': return { at: record.at, title: events.get(record.event)?.title ?? record.event, text: '同一件事又报了一次，没再跑' }
      case 'loop-task-delete': {
        const why = DELETE_WORDS[record.why] ?? record.why
        return { at: record.at, title: record.entry === undefined ? '一条提醒' : titleOf(record.entry), text: record.deleted ? `删掉了 DSH 里的旧提醒（${why}）` : `DSH 里的旧提醒没删成（${why}）` }
      }
    }
  })
}

/** The line about one entry's runs, the same on the page and in `/loops` (design §7.2, §8.2): 上次 with its outcome, and 下次 when there is one. */
export function runLine(entry: ViewEntry): string {
  const next = entry.next === undefined ? '' : ` · 下次 ${momentText(entry.next)}`
  if (entry.last !== undefined) return `上次 ${momentText(entry.last.at)} · ${entry.last.text}${next}`
  if (entry.action === 'self') return '它自己执行，这里只列出'
  return `还没跑过${next}`
}

// ------------------------------------------------------------- attention

function restoreHint(entry: ViewBoardEntry): string {
  return entry.restorable ? `：打 /loops restore ${entry.id}` : `：跟主 Agent 说「从 git 里恢复 docs/loops/entries/${entry.id}.json」`
}

/** The sentence about one entry, when its state needs the person's eye (design §9.3 last column). */
function noteOf(entry: ViewBoardEntry, git: string | undefined): Attention | undefined {
  const quoted = `「${entry.title}」`
  switch (entry.status.kind) {
    case 'outside': return { text: `${quoted}的条目文件在循环板之外被改过，先不跑`, degrades: true }
    case 'not-in-checkout': return { text: `${quoted}在当前检出里没有（切了分支、回退或被 git 删了）：要接着用，在输入框打 /loops restore ${entry.id}`, degrades: false }
    case 'unreadable': return { text: `${quoted}的条目文件读不出，先不跑${restoreHint(entry)}`, degrades: true }
    case 'unadopted': return { text: `${quoted}在这台电脑上没有你同意的记录，先不跑`, degrades: false }
    case 'owed': return { text: git === undefined ? `${quoted}的条目文件待写回` : `${quoted}的条目文件待写回（git 正在合并或变基）`, degrades: false }
    default: return undefined
  }
}

/** Everything about a project's board that the person is to look at. */
export function attentionOf(board: ViewBoard): readonly Attention[] {
  const notes = board.entries.flatMap(entry => noteOf(entry, board.git) ?? [])
  const lines = board.journal.unacknowledged
  return lines.length === 0
    ? notes
    : [...notes, { text: `变更记录第 ${lines.join('、')} 行读不出，已跳过；涉及的那一项按之后的记录显示。知道了就在输入框打 /loops ack`, degrades: true }]
}

// ------------------------------------------------------------------ view

const NO_RUNTIME: ViewRuntime = { last: {}, passing: {}, waiting: 0, records: [] }

/** Whether an entry's state lets it run, so its next time is worth showing. */
const runs = (state: string): boolean => state === 'active' || state === 'ok'

/**
 * The view of a project. `board` is undefined when the project's files could
 * not be read; `peak` is absent while the host has no pricing service;
 * `runtime` is absent when there is nothing of the runtime to read.
 */
export function buildView(input: {
  readonly at: string
  readonly project: string
  readonly plugin: readonly ViewPluginEntry[]
  readonly board: ViewBoard | undefined
  readonly events: ReadonlyMap<string, LoopEventDeclaration>
  readonly peak?: PeakView
  readonly runtime?: ViewRuntime
  /** What a plugin entry's hand-over gives the page for this project (registry.ts `pageOf`): its detail lines and its checks with their timeouts. */
  readonly page?: (entry: string) => { readonly details?: readonly string[], readonly checks?: readonly ViewCheck[] }
  /** Whether a person's script file is the one agreed to, as the host reads it now (boards.ts); absent: taken as agreed. */
  readonly scriptStanding?: (entry: PersonEntry) => ScriptStanding | undefined
}): LoopsView {
  const runtime = input.runtime ?? NO_RUNTIME
  const now = new Date(input.at)
  const zone = systemTimeZone()
  const labels = new Map(input.plugin.map(item => [item.entry.id, pluginLabel(item.entry.source.plugin)]))
  const timing = (id: string, when: Trigger | undefined, state: string, label: string | undefined): Pick<ViewEntry, 'trigger' | 'last' | 'next'> => {
    const last = runtime.last[id]
    const next = when === undefined || when.kind === 'every' || !runs(state) ? undefined : nextOccurrence(when, now, zone)
    return {
      trigger: when === undefined || when.kind === 'event' || when.kind === 'command' ? 'event' : 'time',
      ...(last === undefined ? {} : { last: { at: last.at, outcome: last.outcome, text: outcomeText({ outcome: last.outcome, reason: last.reason, passed: runtime.passing[id] }, label) } }),
      ...(next === undefined ? {} : { next: next.toISOString() }),
    }
  }
  const plugin = input.plugin.map((item): ViewEntry => {
    const label = labels.get(item.entry.id) ?? item.entry.source.plugin
    const page = input.page?.(item.entry.id) ?? {}
    return {
      id: item.entry.id,
      title: item.entry.title,
      source: 'plugin',
      state: item.state,
      ...(item.reason === undefined ? {} : { note: item.reason }),
      ...timing(item.entry.id, item.entry.when, item.state, label),
      action: item.entry.action.kind,
      when: whenText(item.entry.when, input.events),
      does: doesText(item.entry.action, label),
      from: pluginFrom(item.entry),
      ...(item.entry.why === undefined ? {} : { why: item.entry.why }),
      ...(item.entry.ownRules === undefined || item.entry.ownRules.length === 0 ? {} : { ownRules: item.entry.ownRules }),
      ...(page.details === undefined || page.details.length === 0 ? {} : { details: page.details }),
      ...(page.checks === undefined || page.checks.length === 0 ? {} : { checks: page.checks }),
    }
  })
  /** A person's script or check entry's lines, and a script's file for 讲细点; nothing for the others or a deleted one. */
  const workOf = (entry: PersonEntry | undefined, state: string): Pick<ViewEntry, 'work' | 'script'> => {
    if (entry === undefined || state === 'deleted') return {}
    const work = workLines(entry, state, entry.action.kind === 'script' ? input.scriptStanding?.(entry) : undefined, runtime.last[entry.id])
    if (work === undefined) return {}
    return { work, ...(entry.action.kind === 'script' ? { script: entry.action.script.file } : {}) }
  }
  const person = (input.board?.entries ?? []).map((board): ViewEntry => {
    const note = board.status.kind === 'deleted' && board.restorable ? `要恢复：在输入框打 /loops restore ${board.id}` : undefined
    const entry = board.entry
    return {
      id: board.id,
      title: board.title,
      source: 'person',
      state: board.status.kind,
      ...(note === undefined ? {} : { note }),
      ...timing(board.id, entry?.when, board.status.kind, undefined),
      ...(entry === undefined ? {} : { action: entry.action.kind }),
      when: entry === undefined ? '读不出' : whenText(entry.when, input.events),
      does: entry === undefined ? '读不出' : doesText(entry.action, '你'),
      from: personFrom(entry),
      ...(entry?.why === undefined ? {} : { why: entry.why }),
      ...workOf(entry, board.status.kind),
    }
  })
  const entries = [...plugin, ...person]
  const titles = new Map(entries.map(entry => [entry.id, entry.title]))
  return {
    version: 1,
    at: input.at,
    project: input.project,
    entries,
    attention: input.board === undefined ? [] : attentionOf(input.board).map(item => item.text),
    ...(input.peak === undefined ? {} : { peak: input.peak }),
    ...(runtime.holder === undefined ? {} : { holder: runtime.holder }),
    waiting: runtime.waiting,
    recent: recentRuns(runtime.records, id => titles.get(id) ?? id, id => labels.get(id), input.events),
  }
}
