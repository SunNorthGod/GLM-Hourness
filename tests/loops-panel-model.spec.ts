import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { LOOP_DEFAULTS } from '../src/loops/defaults.ts'
import { LOOP_EVENT_TABLE } from '../src/loops/events.ts'
import type { LoopEntry, LoopEntryDefinition, PersonEntry } from '../src/loops/model.ts'
import { nextOccurrence } from '../src/loops/trigger.ts'
import { buildView, momentText, runLine, type LoopsView, type ViewRuntime } from '../src/loops/view.ts'
import { loopsBoard } from '../ui/src/loops/board.ts'
import { buildLoopsPage, type LoopItem } from '../ui/src/loops/model.ts'
import { holdLoopsSource, LoopsSource } from '../ui/src/loops/source.ts'
import { BOARD_ORDER } from '../ui/src/graph/boards.ts'
import { fakeRemote, fakeSessions, until } from './panel-helpers.ts'

/**
 * The loop board's view and page (docs/ORCHESTRATION.md §18.7; loop board
 * design 0.6 §7.2, §8.1 to §8.5): the words view.ts gives every entry
 * (什么时候, 做什么, 谁带来的, the last run in the page's words, the next
 * time) and the last runs, the page model the panel builds of a view, the
 * page source over view.json (a failed read or a file that is not a view
 * keeps the last content and says why; the change feed and the poll), the
 * board's registration and availability, the plain-words check over every
 * fixed string of the view and the page, and the static check that
 * ui/src/loops/ never writes. The pure functions run without React.
 */

const AT = '2026-11-02T01:00:00.000Z'
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** A plugin's entry as the registry holds it. */
const pluginEntry = (definition: LoopEntryDefinition, plugin = 'dsh-hourness'): LoopEntry => ({ ...definition, source: { kind: 'plugin', plugin, row: 'glm-hourness/loops' }, rev: '000000000000' })

const tell = (id: string, when: LoopEntryDefinition['when'], over: Partial<LoopEntryDefinition> = {}): LoopEntryDefinition =>
  ({ id, title: id, why: `${id} 的理由`, when, action: { kind: 'tell-main', text: 'Hello.', wake: true }, ...over })

/** A person's entry as the store reads it, agreed to in the chat unless `via` says otherwise. */
const personBoardEntry = (id: string, title: string, action: PersonEntry['action'], when: PersonEntry['when'], state = 'ok', via: 'chat' | 'board' = 'chat'): { id: string, title: string, status: { kind: string }, entry: PersonEntry, restorable: boolean } => ({
  id,
  title,
  status: { kind: state },
  restorable: true,
  entry: { id, title, when, action, source: { kind: 'person', at: '2026-11-01T01:00:00.000Z', via, relay: '好，就这样', proposal: 'lp-0123abcd' } },
})

const SCRIPT = { kind: 'script', script: { file: 'docs/loops/scripts/u-00000001.mjs', sha256: 'a'.repeat(64), lang: 'node' }, timeoutSeconds: 30, report: 'always', to: 'event-session' } as const
const CHECK = { kind: 'check', tool: 'tsc', argv: ['node', 'tsc', '--noEmit'], report: 'on-change' } as const

/** A view with one entry of every kind of trigger and action, plus the runtime given. */
function richView(runtime?: ViewRuntime): LoopsView {
  const plugin = [
    pluginEntry(tell('loops.once', { kind: 'once', at: '2026-11-05T02:30:00.000Z' })),
    pluginEntry(tell('loops.every-half-hour', { kind: 'every', seconds: 1800 }, { action: { kind: 'tell-main', text: 'Hi.', wake: false } })),
    pluginEntry(tell('loops.every-two-hours', { kind: 'every', seconds: 7200 })),
    pluginEntry(tell('loops.daily', { kind: 'daily', time: '08:30', timeZone: ZONE })),
    pluginEntry(tell('loops.weekly', { kind: 'weekly', time: '17:00', weekdays: [1, 3, 7], timeZone: ZONE })),
    pluginEntry(tell('loops.cron', { kind: 'cron', expression: '0 9 * * 1-5' })),
    pluginEntry(tell('loops.command', { kind: 'command', names: ['glm-status'] }, { action: { kind: 'self', does: '它自己写高峰行', by: 'glm-hourness/glm-login' } }), 'dsh-glm-zcode'),
    pluginEntry(tell('loops.harness', { kind: 'event', events: ['loops.host-restarted', 'hourness.handback'] }, { action: { kind: 'harness', action: 'loops.peak-end', tell: { text: 'Go.', wake: true } }, basis: '高峰时刻' })),
  ].map(entry => ({ entry, state: entry.when.kind === 'event' ? 'waiting' : 'active', ...(entry.when.kind === 'event' ? { reason: '这一项现在不跑' } : {}) }))
  const board = {
    entries: [
      personBoardEntry('u-00000001', '重启之后查一下服务', SCRIPT, { kind: 'event', events: ['loops.host-restarted'] }),
      personBoardEntry('u-00000002', '改了 ts 就跑检查', CHECK, { kind: 'event', events: ['loops.file-changed'], params: { path: 'src/' } }, 'ok', 'board'),
      personBoardEntry('u-00000003', '删掉的一项', { kind: 'tell-main', text: 'Bye.', wake: true }, { kind: 'daily', time: '09:00', timeZone: ZONE }, 'deleted'),
      personBoardEntry('u-00000004', '没同意的一项', SCRIPT, { kind: 'every', seconds: 3600 }, 'unadopted'),
    ],
    journal: { unacknowledged: [] },
    git: undefined,
  }
  return buildView({ at: AT, project: 'p', plugin, board, events: LOOP_EVENT_TABLE, ...(runtime === undefined ? {} : { runtime }) })
}

const entryOf = (view: LoopsView, id: string) => view.entries.find(entry => entry.id === id)!

// --- The view's words -------------------------------------------------------

test('every entry says 什么时候, 做什么 and 谁带来的 in the page\'s words, and which group it belongs to', () => {
  const view = richView()
  const words = (id: string) => [entryOf(view, id).trigger, entryOf(view, id).when, entryOf(view, id).does]
  assert.deepEqual(words('loops.once'), ['time', `${momentText('2026-11-05T02:30:00.000Z')} 一次`, '告诉主 Agent'])
  assert.deepEqual(words('loops.every-half-hour'), ['time', '每 30 分钟', '告诉主 Agent（不叫醒它）'])
  assert.deepEqual(words('loops.every-two-hours').slice(1, 2), ['每 2 小时'])
  assert.deepEqual(words('loops.daily').slice(1, 2), ['每天 08:30'], 'the time zone of this machine is not written')
  assert.deepEqual(words('loops.weekly').slice(1, 2), ['每周一、三、日 17:00'])
  assert.deepEqual(words('loops.cron').slice(1, 2), ['按 cron「0 9 * * 1-5」'])
  assert.deepEqual(words('loops.command'), ['event', '打 /glm-status 时', '交给GLM 通道自己做：它自己写高峰行'])
  assert.deepEqual(words('loops.harness'), ['event', '碰到「DSH 重新启动了」或「hourness.handback」', '系统自己做，再告诉主 Agent'])
  assert.equal(entryOf(view, 'loops.harness').from, '项目编排带来的 · 只能看 · 依据 高峰时刻')
  assert.equal(entryOf(view, 'loops.command').from, 'GLM 通道带来的 · 只能看')
  assert.equal(entryOf(view, 'loops.harness').note, '这一项现在不跑')
  assert.equal(entryOf(view, 'loops.harness').why, 'loops.harness 的理由')
  assert.deepEqual(words('u-00000001'), ['event', '碰到「DSH 重新启动了」', '跑脚本 docs/loops/scripts/u-00000001.mjs，每次都告诉事件来的那个会话'])
  assert.deepEqual(words('u-00000002'), ['event', '碰到「某个文件变了」', '跑项目图上「tsc」的检查，结果变了才告诉主 Agent'])
  assert.equal(entryOf(view, 'u-00000001').from, '你在对话里加的：「好，就这样」')
  assert.equal(entryOf(view, 'u-00000002').from, '你在输入框里同意的')
  assert.equal(entryOf(view, 'u-00000003').note, '要恢复：在输入框打 /loops restore u-00000003')
  assert.equal(entryOf(view, 'u-00000003').action, 'tell-main')
})

test('the next time is there for a once, daily or weekly entry that runs now; none for every (DSH aligns it to its task\'s anchor), cron, an event, a deleted or an unadopted entry', () => {
  const view = richView()
  const after = new Date(AT)
  assert.equal(entryOf(view, 'loops.daily').next, nextOccurrence({ kind: 'daily', time: '08:30', timeZone: ZONE }, after, ZONE)!.toISOString())
  for (const id of ['loops.every-half-hour', 'loops.every-two-hours', 'loops.cron', 'loops.harness', 'loops.command', 'u-00000001', 'u-00000003', 'u-00000004']) assert.equal(entryOf(view, id).next, undefined, id)
  assert.deepEqual([view.waiting, view.recent, view.holder], [0, [], undefined], 'no runtime: nothing waits, nothing ran, no main agent line')
})

/** The last run's words of one entry for one outcome. */
function lastText(outcome: string, reason?: string, passed?: boolean, id = 'u-00000001'): string | undefined {
  const runtime: ViewRuntime = {
    last: { [id]: { at: '2026-11-01T09:00:00.000Z', outcome, ...(reason === undefined ? {} : { reason }) } },
    passing: passed === undefined ? {} : { [id]: passed },
    waiting: 0,
    records: [],
  }
  return entryOf(richView(runtime), id).last?.text
}

test('the last run reads in the words of design §8.5, with a script\'s pass or failure and the reason a run was refused', () => {
  const cases: Array<[string, string | undefined, boolean | undefined, string]> = [
    ['delivered', undefined, undefined, '已交给主 Agent'],
    ['ran', undefined, true, '跑完了，没事'],
    ['ran', 'spawn', false, '跑完了，没过'],
    ['reported', undefined, true, '跑完了，已告诉主 Agent'],
    ['reported', undefined, false, '没过，已告诉主 Agent'],
    ['skipped', undefined, undefined, '这次不用跑'],
    ['suppressed', 'rate', undefined, '次数太多，合进下一次'],
    ['suppressed', 'self-loop', undefined, '循环板自己做的事引起的，这次停下'],
    ['deferred', undefined, undefined, '在等规则放行'],
    ['blocked', 'guard:file-tools-only', undefined, '被规则拦下'],
    ['held', 'holder-archived', undefined, '先存着'],
    ['failed', 'timeout', undefined, '没成功'],
    ['expired', undefined, undefined, '放太久，作废了'],
    ['unfinished', 'timeout', undefined, '没跑完，这次的事件下次一起再跑'],
    ['refused', 'unadopted', undefined, '这台电脑上没有你同意的记录，先不跑'],
    ['refused', 'script-changed', undefined, '脚本和你同意的那一版不一样，先不跑'],
    ['refused', 'script-missing', undefined, '脚本不在这份检出里，先不跑'],
    ['refused', 'check-missing', undefined, '取不到这项检查的命令，先不跑'],
    ['refused', 'check-changed', undefined, '检查命令在项目图上改过了，先不跑'],
    ['refused', 'outside-project', undefined, '要跑的那份检出不在这个项目里，先不跑'],
    ['refused', 'something-new', undefined, '先不跑'],
  ]
  for (const [outcome, reason, passed, text] of cases) assert.equal(lastText(outcome, reason, passed), text, `${outcome} ${reason ?? ''}`)
  assert.equal(lastText('delegated', undefined, undefined, 'loops.command'), '交给GLM 通道自己做')
  assert.deepEqual(entryOf(richView({ last: { 'u-00000001': { at: '2026-11-01T09:00:00.000Z', outcome: 'ran' } }, passing: {}, waiting: 0, records: [] }), 'u-00000001').last, { at: '2026-11-01T09:00:00.000Z', outcome: 'ran', text: '跑完了，没事' })
})

test('the last runs are the newest 20 records as lines, newest first: a run, an event reported again, a reminder the board deleted or could not', () => {
  const records: ViewRuntime['records'] = [
    ...Array.from({ length: 22 }, (_, index) => ({ kind: 'loop-done' as const, at: `2026-11-01T0${Math.floor(index / 10)}:${String(index % 10).padStart(2, '0')}:00.000Z`, entry: 'u-00000001', outcome: 'ran', exits: [index % 2] })),
    { kind: 'loop-done', at: '2026-11-01T03:00:00.000Z', entry: 'u-00000001', outcome: 'ran', reason: 'spawn' },
    { kind: 'loop-duplicate', at: '2026-11-01T03:01:00.000Z', event: 'loops.host-restarted' },
    { kind: 'loop-task-delete', at: '2026-11-01T03:02:00.000Z', entry: 'loops.daily', why: 'no-holder', deleted: false },
    { kind: 'loop-task-delete', at: '2026-11-01T03:03:00.000Z', why: 'moved', deleted: true },
    { kind: 'loop-done', at: '2026-11-01T03:04:00.000Z', entry: 'u-gone0000', outcome: 'delegated' },
  ]
  const view = richView({ last: {}, passing: {}, waiting: 3, records })
  assert.equal(view.recent.length, 20)
  assert.equal(view.waiting, 3)
  assert.deepEqual(view.recent.slice(0, 7), [
    { at: '2026-11-01T03:04:00.000Z', title: 'u-gone0000', text: '交给带来它的插件自己做' },
    { at: '2026-11-01T03:03:00.000Z', title: '一条提醒', text: '删掉了 DSH 里的旧提醒（主 Agent 换了会话）' },
    { at: '2026-11-01T03:02:00.000Z', title: 'loops.daily', text: 'DSH 里的旧提醒没删成（还没有主 Agent）' },
    { at: '2026-11-01T03:01:00.000Z', title: 'DSH 重新启动了', text: '同一件事又报了一次，没再跑' },
    { at: '2026-11-01T03:00:00.000Z', title: '重启之后查一下服务', text: '跑完了，没过' },
    { at: '2026-11-01T02:01:00.000Z', title: '重启之后查一下服务', text: '跑完了，没过' },
    { at: '2026-11-01T02:00:00.000Z', title: '重启之后查一下服务', text: '跑完了，没事' },
  ])
})

test('the runs line says the last run with its words and the next time, that a plugin\'s own entry runs on its own, or that it has not run yet', () => {
  const view = richView({ last: { 'loops.daily': { at: '2026-11-01T00:30:00.000Z', outcome: 'delivered' } }, passing: {}, waiting: 0, records: [] })
  const daily = entryOf(view, 'loops.daily')
  assert.equal(runLine(daily), `上次 ${momentText('2026-11-01T00:30:00.000Z')} · 已交给主 Agent · 下次 ${momentText(daily.next!)}`)
  assert.equal(runLine(entryOf(view, 'loops.command')), '它自己执行，这里只列出')
  assert.equal(runLine(entryOf(view, 'loops.weekly')), `还没跑过 · 下次 ${momentText(entryOf(view, 'loops.weekly').next!)}`)
  assert.equal(runLine(entryOf(view, 'loops.every-two-hours')), '还没跑过')
  assert.equal(runLine(entryOf(view, 'u-00000001')), '还没跑过')
  assert.equal(momentText('not a time'), 'not a time')
})

// --- The page model ---------------------------------------------------------

test('the page model groups the plugins\' entries by what starts them, keeps the person\'s own with how to change them, folds the deleted ones, and lists the last runs', () => {
  const view: LoopsView = {
    ...richView({ last: {}, passing: {}, waiting: 2, records: [{ kind: 'loop-duplicate', at: '2026-11-01T03:01:00.000Z', event: 'loops.host-restarted' }], holder: { line: '主 Agent 收得到这块板的消息', session: 'sess-main' } }),
    attention: ['「没同意的一项」在这台电脑上没有你同意的记录，先不跑'],
  }
  const page = buildLoopsPage(view)
  assert.deepEqual([page.holderLine, page.holderSession, page.waitingLine], ['主 Agent 收得到这块板的消息', 'sess-main', '在等的 2 件'])
  assert.deepEqual(page.attention, ['「没同意的一项」在这台电脑上没有你同意的记录，先不跑'])
  assert.equal(page.events.title, '碰到某件事就做的')
  assert.deepEqual(page.events.rows.map(row => row.id), ['loops.command', 'loops.harness'])
  assert.deepEqual(page.timed.rows.map(row => row.id), ['loops.once', 'loops.every-half-hour', 'loops.every-two-hours', 'loops.daily', 'loops.weekly', 'loops.cron'])
  assert.deepEqual(page.mine.rows.map(row => row.id), ['u-00000001', 'u-00000002', 'u-00000004'])
  assert.equal(page.mineEmpty, null)
  assert.deepEqual([page.deleted.title, page.deleted.rows.map(row => row.id)], ['最近 7 天删掉的（1）', ['u-00000003']])
  const harness = page.events.rows[1]
  assert.deepEqual([harness.greyed, harness.note, harness.changeLine], [true, '这一项现在不跑', null])
  assert.equal(harness.whatLine, '碰到「DSH 重新启动了」或「hourness.handback」 · 系统自己做，再告诉主 Agent')
  assert.deepEqual(harness.details, ['为什么有它：loops.harness 的理由', '状态：现在不跑', 'id：loops.harness'])
  const script = page.mine.rows[0]
  assert.deepEqual([script.greyed, script.runLine, script.fromLine], [false, '还没跑过', '你在对话里加的：「好，就这样」'])
  assert.equal(script.changeLine, '要改：跟主 Agent 说「把重启之后查一下服务改成……」；要删：在输入框打 /loops delete 重启之后查一下服务')
  assert.equal(page.mine.rows[2].greyed, true, 'an entry not adopted on this computer does not run')
  assert.deepEqual([page.deleted.rows[0].note, page.deleted.rows[0].changeLine], ['要恢复：在输入框打 /loops restore u-00000003', null])
  assert.deepEqual(page.recent, [`${momentText('2026-11-01T03:01:00.000Z')} · DSH 重新启动了 · 同一件事又报了一次，没再跑`])
  assert.equal(page.peakLine, null, 'no pricing service: no peak line')
})

test('the peak line says whether it is peak now, when it turns, the level and its cap', () => {
  const base = richView()
  const until = '2026-11-02T10:00:00.000Z'
  assert.equal(buildLoopsPage({ ...base, peak: { now: true, until, level: '少做', origin: 'default', cap: '少做：高峰里同时至多 1 个 GLM 子 agent' } }).peakLine, `此刻：高峰中，到 ${momentText(until)} 结束 · 高峰模式：少做（出厂默认） · 少做：高峰里同时至多 1 个 GLM 子 agent`)
  assert.equal(buildLoopsPage({ ...base, peak: { now: false, until, level: '不做', origin: 'human' } }).peakLine, `此刻：不是高峰；下一个高峰 ${momentText(until)} · 高峰模式：不做`)
  assert.equal(buildLoopsPage({ ...base, peak: { now: undefined, level: '档位在规则板上看' } }).peakLine, '此刻读不出是不是高峰 · 高峰模式：档位在规则板上看')
})

test('a project without a view yet, or without entries of the person\'s, says how to add one and lists nothing else', () => {
  const page = buildLoopsPage(null)
  assert.deepEqual([page.holderLine, page.waitingLine, page.peakLine, page.events.rows, page.timed.rows, page.mine.rows, page.recent], [null, null, null, [], [], [], []])
  assert.equal(page.mineEmpty, '还没有你加的。要加：跟主 Agent 说「每 30 分钟查一下服务器，挂了告诉我」')
})

// --- The timeout cell of a plugin entry's checks (plain-ui 1.3 §4.7, §8.2) ---

/** The day the cell writes, on the clock of this machine. */
const day = (at: string): string => `${new Date(at).getMonth() + 1} 月 ${new Date(at).getDate()} 日`
const WRITTEN = '2026-10-29T03:00:00.000Z'
const RAISED_AT = '2026-11-01T02:00:00.000Z'
const CHECKER = tell('env.checks-after-edit', { kind: 'event', events: ['loops.host-restarted'] }, { title: '改完文件就跑检查', action: { kind: 'self', does: '跑这个项目里批过的检查', by: 'glm-hourness/env' }, ownRules: ['一步最多等 20 秒'] })
const ESTIMATE = { kind: 'agent-estimate', estimateS: 4, at: WRITTEN, session: 'a3f2' }
const measured = (runs: number, slowestS: number): Record<string, unknown> => ({ kind: 'measured', runs, slowestS })
/** The history and the (empty) timeouts an estimate or measured runs owe. */
const OWED = { history: [{ at: WRITTEN, seconds: 12, source: '写检查的 agent 估 4 秒' }], timeouts: [] }
const check = (timeout: Record<string, unknown>, key = 'tool-1/lint'): unknown => ({ key, title: 'Lint：lint', timeout })

interface Heard {
  readonly warn: Array<readonly [string, string]>
  readonly info: Array<readonly [string, string]>
}

/** The view of one plugin entry, the checker's, whose hand-over gives these checks and detail lines. */
const checkerView = (checks: readonly unknown[], details: readonly string[] = []): LoopsView =>
  buildView({ at: AT, project: 'p', plugin: [{ entry: pluginEntry(CHECKER), state: 'active' }], board: undefined, events: LOOP_EVENT_TABLE, page: () => ({ details, checks: checks as never }) })

/** The checker's row on the page of that view, and what the cell told. */
function checkerRow(checks: readonly unknown[], details: readonly string[] = []): { readonly row: LoopItem, readonly heard: Heard } {
  const heard: Heard = { warn: [], info: [] }
  const page = buildLoopsPage(checkerView(checks, details), { warn: (key, text) => { heard.warn.push([key, text]) }, info: (key, text) => { heard.info.push([key, text]) } })
  const row = page.events.rows[0]
  assert.ok(row !== undefined && row.id === CHECKER.id)
  return { row, heard }
}

test('buildView puts a plugin entry\'s own rules and what its hand-over gives the page into the entry; empty lists stay out', () => {
  const view = checkerView([check({ seconds: 60, source: { kind: 'ceiling' } })], ['Lint：改了 *.txt 之后跑 · node lint.mjs {files}'])
  const [entry] = view.entries
  assert.deepEqual([entry?.ownRules, entry?.details, entry?.checks], [['一步最多等 20 秒'], ['Lint：改了 *.txt 之后跑 · node lint.mjs {files}'], [check({ seconds: 60, source: { kind: 'ceiling' } })]])
  const [bare] = buildView({ at: AT, project: 'p', plugin: [{ entry: pluginEntry({ ...CHECKER, ownRules: [] }), state: 'active' }], board: undefined, events: LOOP_EVENT_TABLE, page: () => ({ details: [], checks: [] }) }).entries
  assert.deepEqual([bare?.ownRules, bare?.details, bare?.checks], [undefined, undefined, undefined])
})

test('the timeout cell words the four sources: an estimate with its day and session, the runs, the ceiling, a fixed number; a missing source reads as a fixed number, told once per board as information (plain-ui 1.3 §4.7)', () => {
  const cases: ReadonlyArray<readonly [Record<string, unknown>, readonly string[]]> = [
    [{ seconds: 12, source: ESTIMATE, ...OWED }, [`Lint：lint · 超时 12 秒（agent 估跑 4 秒，乘 3 · ${day(WRITTEN)}，会话 a3f2）`, '最近没有超时']],
    [{ seconds: 12, source: { kind: 'agent-estimate', estimateS: 4, at: WRITTEN, who: 'human' }, ...OWED }, [`Lint：lint · 超时 12 秒（你估跑 4 秒，乘 3 · ${day(WRITTEN)}，会话未记）`, '最近没有超时']],
    [{ seconds: 15, source: measured(10, 5), ...OWED, timeouts7d: 2 }, ['Lint：lint · 超时 15 秒（系统按最近 10 次最慢的 5 秒的 3 倍定）', '最近 7 天超时 2 次']],
    [{ seconds: 15.4, source: measured(1, 5), ...OWED }, ['Lint：lint · 超时 15.4 秒（系统按最近 1 次最慢的 5 秒的 3 倍定）', '最近没有超时']],
    [{ seconds: 60, source: { kind: 'ceiling' } }, ['Lint：lint · 超时 60 秒（上限 · 没写估计）']],
    [{ seconds: 60, source: { kind: 'fixed-by-design' } }, ['Lint：lint · 超时 60 秒（设计里定的固定值）']],
  ]
  for (const [timeout, lines] of cases) {
    const { row, heard } = checkerRow([check(timeout)])
    assert.deepEqual(row.checkLines, lines)
    assert.deepEqual([heard.warn, heard.info], [[], []], 'the ceiling and a fixed number owe no history and no timeouts')
    assert.ok(!row.details.some(line => line.includes('没有记录')), JSON.stringify(row.details))
  }
  const { row, heard } = checkerRow([check({ seconds: 60 }), check({ seconds: 30 }, 'tool-1/other')])
  assert.deepEqual(row.checkLines, ['Lint：lint · 超时 60 秒（设计里定的固定值）', 'Lint：lint · 超时 30 秒（设计里定的固定值）'])
  assert.deepEqual([heard.warn, [...new Set(heard.info.map(([key]) => key))]], [[], ['loops:no-source']], 'one key for the whole board')
})

test('a number held at the floor or the ceiling says what three times was and where it was held (P11-01)', () => {
  const cases: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
    [{ seconds: 5, source: { ...ESTIMATE, estimateS: 1 }, held: { by: 'floor', wantedS: 3 }, ...OWED }, `超时 5 秒（agent 估跑 1 秒，乘 3 是 3 秒，不足下限，取下限 5 秒 · ${day(WRITTEN)}，会话 a3f2）`],
    [{ seconds: 60, source: { ...ESTIMATE, estimateS: 25 }, held: { by: 'cap', wantedS: 75 }, ...OWED }, `超时 60 秒（agent 估跑 25 秒，乘 3 本该是 75 秒，超过上限，保持上限 60 秒，已告诉主 Agent · ${day(WRITTEN)}，会话 a3f2）`],
    [{ seconds: 5, source: measured(10, 1), held: { by: 'floor', wantedS: 3 }, ...OWED }, '超时 5 秒（系统按最近 10 次最慢的 1 秒算，3 倍是 3 秒，不足下限，取下限 5 秒）'],
    [{ seconds: 60, source: measured(3, 30), held: { by: 'cap', wantedS: 90 }, ...OWED }, '超时 60 秒（系统按最近 3 次最慢的 30 秒算，3 倍本该是 90 秒，超过上限，保持上限 60 秒，已告诉主 Agent）'],
  ]
  for (const [timeout, sentence] of cases) {
    const { row, heard } = checkerRow([check(timeout)])
    assert.equal(row.checkLines[0], `Lint：lint · ${sentence}`)
    assert.deepEqual(heard.warn, [])
  }
})

test('the cell checks three times the run time within 0.5 s: without held against the number, with held against what was computed; a mismatch or a held that does not fit is 没有记录, told once per entry, and the rest of the cell stands (P12-01, P13-03)', () => {
  const lone = checkerRow([check({ seconds: 5, source: measured(10, 1), ...OWED })])
  assert.deepEqual(lone.row.checkLines, ['Lint：lint · 超时 5 秒（没有记录：超时的数和来源对不上（5 秒，3 倍是 3 秒））', '最近没有超时'], 'the board left out held: the page does not write 「1 秒的 3 倍定」')
  assert.deepEqual(lone.heard.warn.map(([key]) => key), ['env.checks-after-edit:tool-1/lint:triple'])
  const cases: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
    [{ seconds: 60, source: { ...ESTIMATE, estimateS: 25 }, held: { by: 'cap', wantedS: 80 }, ...OWED }, '没有记录：算出来的数和来源对不上（算出来是 80 秒，3 倍是 75 秒）'],
    [{ seconds: 5, source: measured(10, 2), held: { by: 'floor', wantedS: 6 }, ...OWED }, '没有记录：算出来的 6 秒不比超时的 5 秒少，却写着取下限'],
    [{ seconds: 60, source: measured(10, 2), held: { by: 'up', wantedS: 6 }, ...OWED }, '没有记录：下限或上限的说法读不懂'],
    [{ seconds: 60, source: { kind: 'ceiling' }, held: { by: 'cap', wantedS: 75 } }, '没有记录：这种来源不会被下限抬高或被上限截住'],
    [{ seconds: 60, source: { kind: 'guess' } }, '没有记录：来源不在四种里'],
    [{ seconds: 12, source: { kind: 'agent-estimate', at: WRITTEN }, ...OWED }, '没有记录：缺估的秒数'],
    [{ seconds: 12, source: { kind: 'agent-estimate', estimateS: 4 }, ...OWED }, '没有记录：缺估的日期'],
    [{ seconds: 12, source: { kind: 'measured', runs: 0, slowestS: 4 }, ...OWED }, '没有记录：缺运行的次数或最慢的秒数'],
  ]
  for (const [timeout, words] of cases) {
    const { row, heard } = checkerRow([check(timeout)])
    assert.equal(row.checkLines[0], `Lint：lint · 超时 ${String(timeout.seconds)} 秒（${words}）`)
    assert.equal(heard.warn.length, 1, words)
  }
  const nothing = checkerRow([check({ seconds: 0, source: { kind: 'ceiling' } }), { key: 'odd' }])
  assert.deepEqual(nothing.row.checkLines, ['Lint：lint · 超时：没有记录：超时的数读不懂'], 'a check that is not one is left out')
  assert.deepEqual(nothing.heard.warn.map(([key]) => key), ['env.checks-after-edit:tool-1/lint:seconds', 'env.checks-after-edit:check'])
  // Through the console: the same entry, check and reason is told once however often the page is made.
  const told: unknown[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => { told.push(args) }
  try {
    for (let pass = 0; pass < 3; pass++) buildLoopsPage(checkerView([check({ seconds: 7, source: measured(10, 1), ...OWED }, 'tool-9/once')]))
  }
  finally {
    console.warn = warn
  }
  assert.equal(told.length, 1)
})

test('a raised ceiling is a line under the timeout with its day, reason and how to take it back; a bad reason keeps the seconds and the day; on a fixed number or with bad seconds or day it is 没有记录 (P12-02, P13-04)', () => {
  const raised = (capRaised: unknown, source: unknown = { kind: 'ceiling' }): { readonly row: LoopItem, readonly heard: Heard } => checkerRow([check({ seconds: 60, source, capRaised })])
  const good = raised({ capS: 120, at: RAISED_AT, reason: '整个项目要跑一分多钟' })
  assert.deepEqual(good.row.checkLines, ['Lint：lint · 超时 60 秒（上限 · 没写估计）', `上限已由主 Agent 调高到 120 秒 · ${day(RAISED_AT)}：整个项目要跑一分多钟；要改回，跟主 Agent 说`])
  assert.deepEqual(good.heard.warn, [], 'the number not yet computed under the raised ceiling is not checked against it')
  const reasons: ReadonlyArray<readonly [unknown, string]> = [['第一行\n第二行', '理由不止一行'], ['  ', '理由是空的'], [undefined, '缺理由'], [7, '理由不是一句话']]
  for (const [reason, why] of reasons) {
    const { row, heard } = raised({ capS: 120, at: RAISED_AT, ...(reason === undefined ? {} : { reason }) })
    assert.equal(row.checkLines[1], `上限已由主 Agent 调高到 120 秒 · ${day(RAISED_AT)}（理由没有记录：${why}）；要改回，跟主 Agent 说`)
    assert.deepEqual(heard.warn.map(([key]) => key), ['env.checks-after-edit:tool-1/lint:reason'])
  }
  const bad: ReadonlyArray<readonly [unknown, unknown, string]> = [
    [{ capS: 120, at: RAISED_AT, reason: 'r' }, { kind: 'fixed-by-design' }, '没有记录：设计里定的固定值不会被调高上限'],
    [{ capS: -1, at: RAISED_AT, reason: 'r' }, { kind: 'ceiling' }, '没有记录：调高到几秒读不懂'],
    ['120', { kind: 'ceiling' }, '没有记录：调高到几秒读不懂'],
    [{ capS: 120, at: 'yesterday', reason: 'r' }, { kind: 'ceiling' }, '没有记录：调高的日期读不懂'],
  ]
  for (const [capRaised, source, line] of bad) {
    const { row, heard } = raised(capRaised, source)
    assert.equal(row.checkLines[1], line)
    assert.equal(heard.warn.length, 1)
  }
})

test('讲细点 has the hand-over\'s lines, the history newest first with 第一个值, the last five timeouts and the entry\'s own rules; the seven days\' line is the board\'s count, else the records of the week before the view; the first two sources owe a history and a timeouts list (plain-ui 1.3 §4.7, P10-02)', () => {
  const history = [
    { at: '2026-11-01T02:00:00.000Z', seconds: 15, previousS: 5, source: '系统按最近 1 次，最慢 5 秒' },
    { at: '2026-11-01T01:00:00.000Z', seconds: 5, source: '你估 1 秒，会话未记' },
  ]
  const timeouts = Array.from({ length: 6 }, (_, index) => ({ at: `2026-11-01T0${6 - index}:30:00.000Z`, limitS: 5, elapsedS: 5.21, outcome: '算没跑完，下一次改动照常再跑' }))
  const { row, heard } = checkerRow([check({ seconds: 15, source: measured(1, 5), history, timeouts })], ['Lint：改了 *.txt 之后跑 · node lint.mjs {files}'])
  assert.deepEqual(row.checkLines, ['Lint：lint · 超时 15 秒（系统按最近 1 次最慢的 5 秒的 3 倍定）', '最近 7 天超时 6 次'], 'no count from the board: the records of the week are counted, all six')
  assert.deepEqual(row.details, [
    '为什么有它：env.checks-after-edit 的理由',
    'Lint：改了 *.txt 之后跑 · node lint.mjs {files}',
    'Lint：lint的来历（新的在前）：',
    `${momentText(history[0].at)} · 15 秒 · 原 5 秒 · 系统按最近 1 次，最慢 5 秒`,
    `${momentText(history[1].at)} · 5 秒 · 第一个值 · 你估 1 秒，会话未记`,
    'Lint：lint最近的超时：',
    ...timeouts.slice(0, 5).map(item => `${momentText(item.at)} · 限 5 秒 · 跑了 5.2 秒 · 算没跑完，下一次改动照常再跑`),
    '「改完文件就跑检查」自己的规矩：',
    '一步最多等 20 秒',
    '状态：在用',
    'id：env.checks-after-edit',
  ])
  assert.deepEqual(heard.warn, [])
  assert.ok(!row.checkLines.some(line => line.includes('20 秒')), 'the step\'s 20 seconds are the checker\'s own rule, not in the timeout cell (P12-05)')
  assert.equal(checkerRow([check({ seconds: 15, source: measured(1, 5), history, timeouts: [{ ...timeouts[0], at: '2026-10-20T00:00:00.000Z' }] })]).row.checkLines[1], '最近没有超时', 'a timeout before the week does not count')
  const owing = checkerRow([check({ seconds: 12, source: ESTIMATE })])
  assert.deepEqual(owing.row.checkLines, [`Lint：lint · 超时 12 秒（agent 估跑 4 秒，乘 3 · ${day(WRITTEN)}，会话 a3f2）`])
  assert.ok(owing.row.details.includes('Lint：lint的来历：没有记录：缺来历') && owing.row.details.includes('Lint：lint最近的超时：没有记录：缺超时记录'), JSON.stringify(owing.row.details))
  assert.deepEqual(owing.heard.warn.map(([key]) => key).sort(), ['env.checks-after-edit:tool-1/lint:history', 'env.checks-after-edit:tool-1/lint:timeouts'])
  const shaped = checkerRow([check({ seconds: 60, source: { kind: 'ceiling' }, history: [{ at: WRITTEN, seconds: 60, source: 'x' }, { at: WRITTEN, seconds: 5, source: 'y' }], timeouts: [{ at: WRITTEN }], timeouts7d: -1 })])
  assert.ok(shaped.row.details.includes('Lint：lint的来历：没有记录：来历第 1 条缺时间、新值、旧值或来源') && shaped.row.details.includes('Lint：lint最近的超时：没有记录：超时记录第 1 条缺时间、限、用时或结局'), 'given to a ceiling, they are checked all the same')
  assert.equal(shaped.row.checkLines[1], '没有记录：最近 7 天的超时次数读不懂')
  const lines = [row, owing.row, shaped.row].flatMap(item => [...item.checkLines, ...item.details])
  assert.deepEqual(plainWordsIn(lines.join('\n')), [])
})

// --- Plain words ------------------------------------------------------------

/** The string literals with Chinese in them of the files that make what the person reads. */
async function fixedStrings(): Promise<string> {
  const files = ['src/loops/view.ts', 'src/loops/commands.ts', 'ui/src/loops/model.ts', 'ui/src/loops/timeouts.ts', 'ui/src/loops/source.ts', 'ui/src/loops/LoopsPage.tsx']
  const texts = await Promise.all(files.map(file => readFile(join(import.meta.dirname, '..', ...file.split('/')), 'utf8')))
  return texts.flatMap(text => text.match(/'[^'\n]*[\u4e00-\u9fff][^'\n]*'|`[^`]*[\u4e00-\u9fff][^`]*`|>[^<>{}\n]*[\u4e00-\u9fff][^<>{}\n]*</g) ?? []).join('\n')
}

test('every fixed string of the view, the list and the page, and every line the page shows, is in plain words (design §8.5)', async () => {
  const strings = await fixedStrings()
  assert.ok(strings.includes('跑完了，已告诉主 Agent') && strings.includes('到点了或碰到某件事，就去做一件事'), 'the check reads the strings')
  assert.deepEqual(plainWordsIn(strings), [])
  const page = buildLoopsPage(richView())
  const shown = [page.events, page.timed, page.mine, page.deleted].flatMap(group => [group.title, ...group.rows.flatMap(row => [row.title, row.whatLine, row.runLine, row.fromLine, row.note ?? '', row.changeLine ?? '', ...row.details])])
  assert.deepEqual(plainWordsIn(shown.join('\n')), [])
})

test('the loop row\'s own entries read in plain words on the page', () => {
  const view = buildView({ at: AT, project: 'p', plugin: LOOP_DEFAULTS.map(definition => ({ entry: pluginEntry(definition), state: 'active' })), board: undefined, events: LOOP_EVENT_TABLE })
  assert.deepEqual(plainWordsIn(view.entries.flatMap(entry => [entry.title, entry.when, entry.does, entry.from]).join('\n')), [])
})

// --- The page source --------------------------------------------------------

const VIEW_FILE = 'C:/p/.llm/loops/view.json'
const viewText = (view: LoopsView): string => `${JSON.stringify(view, null, 2)}\n`

/** A started source that waits out its first read and always stops. */
async function withSource(fake: ReturnType<typeof fakeRemote>, run: (source: LoopsSource) => Promise<void> | void, pollMs?: number): Promise<void> {
  const source = new LoopsSource(fake.remote, 'session-1', VIEW_FILE, pollMs)
  const unsubscribe = source.subscribe(() => {})
  try {
    await until(() => source.getSnapshot().loading === false, 'view.json read once')
    await run(source)
  }
  finally {
    unsubscribe()
  }
}

test('the source makes the page of view.json and follows a rewrite through the change feed', async () => {
  const fake = fakeRemote({ [VIEW_FILE]: viewText(richView()) })
  await withSource(fake, async (source) => {
    assert.deepEqual([source.getSnapshot().problem, source.getSnapshot().missing], [null, false])
    assert.equal(source.getSnapshot().model.mine.rows.length, 3)
    await fake.write(VIEW_FILE, viewText({ ...richView(), waiting: 4 }))
    fake.push({ kind: 'change', change: { absolutePath: VIEW_FILE } })
    await until(() => source.getSnapshot().model.waitingLine === '在等的 4 件', 'the rewritten view')
  })
})

test('a failed read or a file that is not a view keeps the last page and says why; a view.json not there yet says how to make it', async () => {
  const fake = fakeRemote({ [VIEW_FILE]: viewText(richView()) })
  await withSource(fake, async (source) => {
    fake.fail(VIEW_FILE, 'boom')
    fake.push({ kind: 'change', change: { absolutePath: VIEW_FILE } })
    await until(() => source.getSnapshot().problem !== null, 'the failure')
    assert.equal(source.getSnapshot().problem, '循环板读不出：boom')
    assert.equal(source.getSnapshot().model.mine.rows.length, 3)
    fake.fail(VIEW_FILE, undefined)
    await fake.write(VIEW_FILE, '{"version": 2}\n')
    fake.push({ kind: 'change', change: { absolutePath: VIEW_FILE } })
    await until(() => source.getSnapshot().problem?.includes('读不懂') === true, 'the file that is not a view')
    assert.equal(source.getSnapshot().model.mine.rows.length, 3)
    await fake.write(VIEW_FILE, viewText(richView()))
    fake.push({ kind: 'change', change: { absolutePath: VIEW_FILE } })
    await until(() => source.getSnapshot().problem === null, 'the recovery')
  })
  await withSource(fakeRemote({}), (source) => {
    assert.deepEqual([source.getSnapshot().missing, source.getSnapshot().problem, source.getSnapshot().model.mine.rows], [true, null, []])
  })
})

test('the poll re-reads view.json when its size moved, without a change feed', async () => {
  const fake = fakeRemote({ [VIEW_FILE]: viewText(richView()) })
  await withSource(fake, async (source) => {
    const reads = fake.readsOf(VIEW_FILE)
    await new Promise(resolve => { setTimeout(resolve, 100) })
    assert.equal(fake.readsOf(VIEW_FILE), reads, 'an unchanged stat does not re-read')
    await fake.write(VIEW_FILE, viewText({ ...richView(), waiting: 12 }))
    await until(() => source.getSnapshot().model.waitingLine === '在等的 12 件', 'the polled rewrite')
  }, 25)
})

test('the held source is one per session and view.json, released with the last holder', () => {
  const { remote } = fakeRemote({})
  const first = holdLoopsSource(remote, 's1', VIEW_FILE)
  const second = holdLoopsSource(remote, 's1', VIEW_FILE)
  assert.equal(first.source, second.source)
  second.release()
  first.release()
  const again = holdLoopsSource(remote, 's1', VIEW_FILE)
  assert.notEqual(again.source, first.source)
  again.release()
})

// --- The board --------------------------------------------------------------

test('the loop board registers as 循环板 under its BOARD_ORDER id and is there for a session whose projection names a project', async () => {
  const cold = { hournessLoops: { projectKey: 'C:/p', viewFile: VIEW_FILE } }
  const { sessions, setProjections, refreshCountOf } = fakeSessions({}, cold)
  const { board, dispose } = loopsBoard(() => null, sessions)
  try {
    assert.deepEqual([board.id, board.label, BOARD_ORDER[1]], ['loops', '循环板', 'loops'])
    const stop = board.subscribe('s1', () => {})
    setProjections('s1', { hournessLoops: { projectKey: null, viewFile: null } })
    assert.deepEqual(board.snapshot('s1'), { available: false, homeLine: null, guideLine: null, peakApplies: false }, 'a session outside any git project has no board')
    setProjections('s1', cold)
    assert.deepEqual(board.snapshot('s1'), { available: true, homeLine: null, guideLine: null, peakApplies: false })
    setProjections('s1', {})
    assert.equal(board.snapshot('s1').available, false, 'without the loop row there is no board')
    stop()
    const stopCold = board.subscribe('cold', () => {})
    await until(() => board.snapshot('cold').available, 'the cold session\'s values')
    assert.equal(refreshCountOf('cold'), 1)
    stopCold()
  }
  finally {
    dispose()
  }
})

// --- The page never writes --------------------------------------------------

const WRITE_MARK = /commands\.execute|<(?:button|input|textarea|select|form)[\s/>]/i

test('no file under ui/src/loops/ calls commands.execute or renders a write control', async () => {
  const dir = join(import.meta.dirname, '..', 'ui', 'src', 'loops')
  const files = (await readdir(dir)).filter(name => /\.(ts|tsx)$/.test(name))
  assert.ok(files.length >= 4, `the page package is there: ${files.length}`)
  for (const file of files) assert.equal(WRITE_MARK.test(await readFile(join(dir, file), 'utf8')), false, `${file} must not write: no commands.execute, no button, toggle or form`)
})
