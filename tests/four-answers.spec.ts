/**
 * The four-answers morning report’s L2 (M7 design 0.6 §3.10, m7-6): the
 * sections in the design’s order, every number harness-computed from the
 * graph and the execute journals, the hub’s rows relayed word for word (the
 * same-source rule of status hub design 0.3 §12 — the report input has no
 * violation or usage journal to re-derive them from), the same input
 * rendering the same text, and the plain-words check clean.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { fourAnswers, type FourAnswersInput } from '../src/report/four-answers.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import type { AdvanceRecord } from '../src/execute/advance.ts'
import type { DriveLine } from '../src/execute/drive-log.ts'
import type { VerifiedCheck } from '../src/execute/check.ts'
import type { AskSummary } from '../src/workflow/morning-report.ts'
import { at, graphOf, node } from './execute-helpers.ts'
import type { EffectCheck } from '../src/memory/effect.ts'
import { decide, hubEntry, reportInput, section } from './report-helpers.ts'

/** The report input over one graph, with the parts a test changes. */
function input(graph: ReturnType<typeof graphOf> | { readonly unreadable: string }, extra?: Partial<FourAnswersInput>): FourAnswersInput {
  const base = reportInput(graph)
  return extra === undefined ? base : { ...base, ...extra }
}

/** One check record with its result file, the parts a test changes. */
function check(task: string, atN: number, passed: boolean, commands: readonly { line: string, exit: number }[] = []): VerifiedCheck {
  return {
    kind: 'commands',
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    normDigest: 'c'.repeat(64),
    ran: [0],
    passed,
    tasks: [task],
    at: at(atN),
    result: `checks/${'a'.repeat(40)}/t1/result.json`,
    resultDigest: 'd'.repeat(64),
    detail: {
      kind: 'commands',
      commit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      normDigest: 'c'.repeat(64),
      base: 'main',
      mergeBase: null,
      ran: [0],
      commands: commands.map((command, index) => ({ index, line: command.line, exit: command.exit, ms: 10, log: `logs/${index}.log` })),
      passed,
      tasks: [task],
      at: at(atN),
    },
  }
}

test('an empty period reads as zeros and 无, with the sections in the design order', () => {
  const text = fourAnswers(input(graphOf([]), { asks: { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } } }))
  const lines = text.split('\n')
  assert.equal(lines[0], '# 晨报 2026-10-30')
  for (const title of ['## 一、目标', '## 二、规划', '## 三、理由', '## 四、架构', '## 在等你回话的', '## 检查与审查', '## 花了多少', '## 例外']) {
    assert.ok(lines.includes(title), title)
  }
  assert.equal(lines[lines.indexOf('## 一、目标') + 1], '- 无进行中的目标')
  assert.equal(lines[lines.indexOf('## 二、规划') + 1], '- 本期新增任务 0 个、废弃 0 个')
  assert.equal(lines[lines.indexOf('## 三、理由') + 1], '- agent 自己定了 0 件')
  assert.equal(lines[lines.indexOf('## 四、架构') + 1], '- 已采纳还没验证的决定 0 件')
  assert.equal(lines[lines.indexOf('## 在等你回话的') + 1], '- 等你回话的 0 件')
  assert.equal(lines[lines.indexOf('## 检查与审查') + 1], '- 合入前的检查跑了 0 次，第一次就过 0/0')
  assert.equal(lines[lines.indexOf('## 花了多少') + 1], '- 无模型调用')
  assert.equal(lines[lines.indexOf('## 例外') + 1], '- 无')
})

test('one line per open goal: the stage, the tasks done, the advances of the period that carried them', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', title: '静态博客', status: 'doing' }, 0, 'human'),
    node({ id: 'task-1', type: 'task', parent: 'goal-1', status: 'done' }),
    node({ id: 'task-2', type: 'task', parent: 'goal-1', status: 'doing' }),
    node({ id: 'goal-2', type: 'goal', title: '另一个目标', status: 'done' }), // closed: no line
  ])
  const advances: AdvanceRecord[] = [
    { ref: 'local', from: '1'.repeat(40), to: '2'.repeat(40), ok: true, check: '3'.repeat(40), tasks: ['task-1'], at: at(60) },
    { ref: 'local', from: '2'.repeat(40), to: '4'.repeat(40), ok: true, check: '3'.repeat(40), tasks: ['task-1'], at: at(20) }, // before the period
  ]
  const lines = fourAnswers(input(graph, { advances })).split('\n')
  assert.equal(lines[lines.indexOf('## 一、目标') + 1], '- 静态博客：执行；任务完成 1/2，本期进主干 1 次')
  assert.ok(!lines.some(line => line.includes('另一个目标')))
})

test('规划 counts the tasks the agent added and dropped and the reopens of the period', () => {
  const graph = graphOf([
    node({ id: 'task-a', type: 'task', title: '新任务', status: 'doing' }, 60, 'llm'), // proposed at 60, in period
    node({ id: 'task-b', type: 'task', title: '早任务', status: 'doing' }, 10, 'llm'), // proposed before the period
    node({ id: 'task-c', type: 'task', title: '废任务', status: 'dropped' }, 10, 'llm', [{ at: at(70), actor: 'llm', op: 'status', from: 'doing', to: 'dropped', reason: '不要了' }]),
    node({ id: 'task-d', type: 'task', title: '重开任务', status: 'doing' }, 10, 'llm', [{ at: at(80), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '回归坏了' }]),
  ])
  const lines = fourAnswers(input(graph)).split('\n')
  const at2 = lines.indexOf('## 二、规划')
  assert.equal(lines[at2 + 1], '- 本期新增任务 1 个、废弃 1 个')
  assert.equal(lines[at2 + 2], '  - 新任务')
  assert.equal(lines[at2 + 3], '- 返工（重开）1 次：重开任务')
})

test('理由 counts the decisions the agent made itself; a relayed decide is the person’s, not the agent’s', () => {
  const graph = graphOf([
    node({ id: 'q-1', type: 'question', title: '走哪条路', status: 'done' }, 10, 'llm', [decide(60, '按平时的路径走')]),
    node({ id: 'q-2', type: 'question', title: '人拍的事', status: 'done' }, 10, 'llm', [
      { at: at(62), actor: 'llm', op: 'decide', reason: '人在对话里说', relay: '就按你说的' },
    ]),
    node({ id: 'q-3', type: 'question', title: '早先定的事', status: 'done' }, 10, 'llm', [decide(20, '早于本期')]),
  ])
  const lines = fourAnswers(input(graph)).split('\n')
  const at3 = lines.indexOf('## 三、理由')
  assert.equal(lines[at3 + 1], '- agent 自己定了 1 件')
  assert.equal(lines[at3 + 2], '  - 走哪条路：按平时的路径走')
})

test('架构 counts the decisions adopted unverified, and the period’s overturns and supersedes', () => {
  const graph = graphOf([
    node({ id: 'd-1', type: 'decision', title: '定了存储', status: 'approved', verification: 'unverified' }),
    node({ id: 'd-2', type: 'decision', title: '已验证的', status: 'approved', verification: 'sandbox' }),
    node({ id: 'd-3', type: 'decision', title: '被推翻的', status: 'approved', verification: 'overturned' }, 10, 'llm', [
      { at: at(70), actor: 'llm', op: 'verify', to: 'overturned', reason: '跑不起来' },
    ]),
    node({ id: 'd-4', type: 'decision', title: '被取代的', status: 'superseded' }, 10, 'llm', [
      { at: at(72), actor: 'llm', op: 'supersede', by: 'd-1', reason: '更好的做法' },
    ]),
  ])
  const lines = fourAnswers(input(graph)).split('\n')
  const at4 = lines.indexOf('## 四、架构')
  assert.equal(lines[at4 + 1], '- 已采纳还没验证的决定 1 件')
  assert.equal(lines[at4 + 2], '- 本期被推翻 1 件、被取代 1 件')
})

test('在等你回话的 relays the asks and says when the drive stands stopped', () => {
  const asks: AskSummary = {
    waiting: { count: 2, oldest: '2026-10-28' },
    agentOwn: 1,
    decided: { person: 3, inChat: 1, agent: 2 },
  }
  const drive: DriveLine[] = [
    { op: 'start', proc: 1, at: at(10) },
    { op: 'pause', proc: 1, at: at(95) },
  ]
  const lines = fourAnswers(input(graphOf([]), { asks, drive })).split('\n')
  const at5 = lines.indexOf('## 在等你回话的')
  assert.equal(lines[at5 + 1], '- 等你回话的 2 件，最早一件是 2026-10-28 提出的（等了 2 天）')
  assert.equal(lines[at5 + 2], '- 自动推进停着')
})

test('检查与审查 counts the period’s checks, the tasks that passed the first time, and the failures by command', () => {
  const checks = [
    check('task-1', 55, true, [{ line: 'npm run build', exit: 0 }]),
    check('task-2', 56, false, [{ line: 'npm run build', exit: 0 }, { line: 'npm test', exit: 1 }]),
    check('task-2', 57, true, [{ line: 'npm test', exit: 0 }]),
    check('task-3', 20, false, [{ line: '老的失败', exit: 2 }]), // before the period
  ]
  const lines = fourAnswers(input(graphOf([]), { checks })).split('\n')
  const at6 = lines.indexOf('## 检查与审查')
  assert.equal(lines[at6 + 1], '- 合入前的检查跑了 3 次，第一次就过 1/2')
  assert.equal(lines[at6 + 2], '  - 没过：npm test × 1')
})

test('花了多少 and the exception rows are the hub’s entries word for word — the report never recomputes them', () => {
  const status = [
    hubEntry('glm/usage', '用量合计一行', { detail: ['- glm-5.3：12 次调用', '- 高峰积分 4.5'] }),
    hubEntry('rules/denials', '- 拦下 files-only × 2', { detail: ['- 拦截后下一步走对：files-only 1/2'] }),
    hubEntry('rules/lifts', '- 撤下的规则：无'),
    hubEntry('env/suppressions', '压制注释 3 处'),
    hubEntry('env/timeouts', '- npm test：超时 120 秒', { detail: ['  - 近 7 天超时 1 次'] }),
  ]
  const text = fourAnswers(input(graphOf([]), { status }))
  assert.deepEqual(section(text, '## 花了多少'), ['用量合计一行', '- glm-5.3：12 次调用', '- 高峰积分 4.5'])
  assert.deepEqual(section(text, '## 例外'), [
    '- 拦下 files-only × 2',
    '- 拦截后下一步走对：files-only 1/2',
    '- 撤下的规则：无',
    '压制注释 3 处',
    '- npm test：超时 120 秒',
    '  - 近 7 天超时 1 次',
  ])
})

test('unchecked trunk advances and the incoming must-review files are the period’s own exception lines', () => {
  const advances: AdvanceRecord[] = [
    { ref: 'local', from: '1'.repeat(40), to: '2'.repeat(40), ok: true, at: at(60) }, // no check
    { ref: 'remote', by: 'push', from: '2'.repeat(40), to: '3'.repeat(40), ok: true, at: at(61) },
    { ref: 'local', from: '3'.repeat(40), to: '4'.repeat(40), ok: true, check: null, at: at(62) }, // a rollback: not an unchecked advance
    { ref: 'remote', by: 'fetch', from: '4'.repeat(40), to: '5'.repeat(40), ok: true, at: at(63), incomingFloor: ['src/graph/store.ts'] },
  ]
  const lines = fourAnswers(input(graphOf([]), { advances })).split('\n')
  const at7 = lines.indexOf('## 例外')
  assert.deepEqual(lines.slice(at7 + 1, at7 + 3), [
    '- 没经检查的主干前进：本地 1 次、远端 2 次',
    '- 拉来的提交带着没全审的改动：src/graph/store.ts',
  ])
})

test('a graph that cannot be read says so in the four answers and the waiting line, the rest unchanged', () => {
  const text = fourAnswers(input({ unreadable: '图目录不存在' }))
  assert.ok(text.includes('## 一、目标\n- 项目图读不到：图目录不存在'))
  assert.ok(text.includes('## 二、规划\n- 项目图读不到'))
  assert.ok(text.includes('## 三、理由\n- 项目图读不到'))
  assert.ok(text.includes('## 四、架构\n- 项目图读不到'))
  assert.ok(text.includes('## 在等你回话的\n- 项目图读不到，等你回话的件数不知道'))
})

test('the report’s own words pass the plain-words check, and the same input renders the same text', () => {
  const graph = graphOf([
    node({ id: 'goal-1', type: 'goal', title: '静态博客', status: 'doing' }, 0, 'human'),
    node({ id: 'task-1', type: 'task', parent: 'goal-1', status: 'done' }),
  ])
  const one: FourAnswersInput = input(graph, {
    status: [hubEntry('rules/peak', '此刻不是 GLM 高峰'), hubEntry('glm/quota', '5 小时窗口还有六成')],
  })
  const text = fourAnswers(one)
  assert.deepEqual(plainWordsIn(text), [])
  assert.equal(text, fourAnswers(one))
  assert.ok(text.includes('## 现在\n此刻不是 GLM 高峰\n5 小时窗口还有六成'))
  assert.ok(!text.includes('门禁') && !text.includes('验收') && !text.includes('标定'))
})

test('the rule proposals' + "'" + ' checks ride the same section the /hourness report carries, only when something is to say', () => {
  const missed: EffectCheck = {
    question: 'q-1',
    title: '拦下要变少',
    effect: { metric: 'denials:files-only', direction: 'down', days: 7 },
    agreedAt: at(10),
    dueAt: at(80),
    outcome: 'missed',
    before: 2,
    after: 5,
    backslides: [],
  }
  const empty = fourAnswers(input(graphOf([])))
  assert.ok(!empty.includes('规则提议的核对'))
  const text = fourAnswers(input(graphOf([]), { effects: [missed] }))
  assert.ok(text.includes('## 规则提议的核对'))
  assert.ok(text.includes('- 拦下要变少（'))
  assert.ok(text.indexOf('## 规则提议的核对') > text.indexOf('## 例外'))
  assert.deepEqual(plainWordsIn(text), [])
})
