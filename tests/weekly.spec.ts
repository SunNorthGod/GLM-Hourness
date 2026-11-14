/**
 * The weekly report’s L2 (M7 design 0.6 §3.12, m7-8; status hub design 0.3
 * §6, §12 M7 row): the four burden numbers — three relayed word for word
 * from the hub’s `metrics/load` entry, the fourth (the rework after the
 * person’s calls) computed from the graph per §3.12.3 — the hub’s operations
 * rows relayed verbatim, the loop board’s two weekly lists rendered from
 * whatever `loops/*` entries exist (the seam while the board’s service lacks
 * staleEntries and timeoutEntries), no ratio anywhere in the text, and the
 * closing line that points the person to the metrics board.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { weeklyReport, reworkAfterHuman, type WeeklyReportInput } from '../src/report/weekly.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { at, graphOf, node } from './execute-helpers.ts'
import { SINCE, decide, hubEntry, reportInput, section } from './report-helpers.ts'

/** The report input over one graph, with the parts a test changes. */
function input(graph: ReturnType<typeof graphOf> | { readonly unreadable: string }, extra?: Partial<WeeklyReportInput>): WeeklyReportInput {
  return { ...reportInput(graph), ...extra }
}

test('人的负担 relays the metrics/load entry word for word and computes the fourth number from the graph', () => {
  const graph = graphOf([
    node({ id: 'task-a', type: 'task', title: '重开任务', status: 'doing', parent: 'feature-a' }, 10, 'llm', [
      { at: at(60), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '回归坏了' },
    ]),
    node({ id: 'feature-a', type: 'feature', title: '所属模块', status: 'doing' }, 10, 'llm', [
      { ...decide(40, '人拍的方向'), relay: '就这么办' },
    ]),
    node({ id: 'task-b', type: 'task', title: '普通重开', status: 'doing' }, 10, 'llm', [
      { at: at(62), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '没人拍过板' },
    ]),
  ])
  const text = weeklyReport(input(graph, { status: [hubEntry('metrics/load', '最近 7 天：每周被问几次 3；每次要读多少字 220；回话等多久 40 分')] }))
  assert.deepEqual(section(text, '## 人的负担'), [
    '最近 7 天：每周被问几次 3；每次要读多少字 220；回话等多久 40 分',
    '- 因人的决定返工 1 次（近 7 天）',
  ])
})

test('a reopen counts as the person’s when they re-decided, overturned or superseded within seven days before it', () => {
  // The person’s decide 6 days before the reopen: in the window.
  const sixDaysBefore = new Date(Date.parse(at(60)) - 6 * 86_400_000).toISOString()
  const eightDaysBefore = new Date(Date.parse(at(60)) - 8 * 86_400_000).toISOString()
  const graph = graphOf([
    node({ id: 'task-in', type: 'task', title: '窗口内', status: 'doing' }, 10, 'llm', [
      { at: sixDaysBefore, actor: 'human', op: 'decide', reason: '人拍的' },
      { at: at(60), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '返工' },
    ]),
    node({ id: 'task-out', type: 'task', title: '窗口外', status: 'doing' }, 10, 'llm', [
      { at: eightDaysBefore, actor: 'human', op: 'decide', reason: '太早了' },
      { at: at(60), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '返工' },
    ]),
  ])
  assert.equal(reworkAfterHuman(graph, Date.parse(SINCE)), 1)
})

test('without the metrics/load entry the burden section says so; an unreadable graph says why it has no fourth number', () => {
  const text = weeklyReport(input(graphOf([])))
  assert.deepEqual(section(text, '## 人的负担'), [
    '- 减负数字读不到（指标行没启用，或指标板还没算出最近 7 天的数）',
    '- 因人的决定返工 0 次（近 7 天）',
  ])
  const broken = weeklyReport(input({ unreadable: '图目录不存在' }, { status: [hubEntry('metrics/load', '最近 7 天：每周被问几次 3')] }))
  assert.deepEqual(section(broken, '## 人的负担'), [
    '最近 7 天：每周被问几次 3',
    '- 项目图读不到：图目录不存在',
  ])
})

test('the operations rows and the loop board’s lists are relayed verbatim, each section only when its entries exist', () => {
  const full = weeklyReport(input(graphOf([]), {
    status: [
      hubEntry('rules/denials', '- 拦下 files-only × 2'),
      hubEntry('rules/lifts', '- 撤下的规则：无'),
      hubEntry('env/suppressions', '压制注释 3 处'),
      hubEntry('env/timeouts', '- npm test：超时 120 秒', { detail: ['  - 近 7 天超时 1 次'] }),
      hubEntry('loops/stale', '四周没有结果的 1 件', { detail: ['- 一件旧事'], owner: 'loops' }),
      hubEntry('loops/timeout', '反复超时的 2 件', { owner: 'loops' }),
    ],
  }))
  assert.deepEqual(section(full, '## 拦下与撤下'), [
    '- 拦下 files-only × 2',
    '- 撤下的规则：无',
    '压制注释 3 处',
    '- npm test：超时 120 秒',
    '  - 近 7 天超时 1 次',
  ])
  assert.deepEqual(section(full, '## 两张单子'), ['四周没有结果的 1 件', '- 一件旧事', '反复超时的 2 件'])
  const bare = weeklyReport(input(graphOf([])))
  assert.ok(!bare.includes('## 拦下与撤下'))
  assert.ok(!bare.includes('## 两张单子'))
})

test('the closing line points the person to the metrics board, and no ratio enters the text', () => {
  const text = weeklyReport(input(graphOf([]), { status: [hubEntry('metrics/load', '最近 7 天：每周被问几次 3')] }))
  assert.ok(text.endsWith('其余的数字在面板的指标板上：比率与对照只给人看，不进对话。'))
  assert.deepEqual(plainWordsIn(text), [])
  assert.equal(text, weeklyReport(input(graphOf([]), { status: [hubEntry('metrics/load', '最近 7 天：每周被问几次 3')] })))
})
