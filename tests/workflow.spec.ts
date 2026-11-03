import assert from 'node:assert/strict'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { usagePanelLines, usagePanelOf } from '../src/report/panel.ts'
import { openEngine } from '../src/graph/engine.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { loadGraph } from '../src/graph/store.ts'
import { ANSWER_MARKS, answerCallMark } from '../src/shared/answer-marks.ts'
import { askSummary, localDay, morningReport, reportFromFiles, type AskSummary, type ReportFs, type ReportOptions } from '../src/workflow/morning-report.ts'
import { apply } from '../src/workflow/index.ts'
import type { AuditJournal, DecisionRecord, UsageRecord } from '../src/memory/audit.ts'
import type { GuardRecord } from '../src/guard/records.ts'
import { engineFixture, fixtureTest, must, type EngineFixture } from './graph-helpers.ts'
import { exampleRecord } from './proposal-examples.ts'

const usage: UsageRecord[] = [
  { at: '2026-10-27T10:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50 } },
  { at: '2026-10-27T11:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 } },
  { at: '2026-10-27T12:00:00+08:00', provider: 'glm', model: 'glm-5.3-flash', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
]
const NO_ASKS: AskSummary = { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } }
const quietReport = { period: 'p', decisions: [], violations: [], asks: NO_ASKS }
const usageSectionOf = (report: string): string[] => report.slice(report.indexOf('## 用量（今天）')).split('\n')

test('the usage section is the lines of the panel: credits per model with a pricing service, calls and tokens without; the basis line is left to the panel', () => {
  const priced = usageSectionOf(morningReport({ ...quietReport, usage, pricing: creditPricing }))
  assert.deepEqual(priced, ['## 用量（今天）', ...usagePanelLines(usagePanelOf(usage, creditPricing), { basis: false })])
  assert.ok(priced.some(line => /^- glm-5\.3：2 次 · 积分 \d+\.\d\d · /.test(line)), priced.join('\n'))
  assert.ok(priced.every(line => line !== `- ${creditPricing.basis}`))
  assert.deepEqual(usageSectionOf(morningReport({ ...quietReport, usage })), [
    '## 用量（今天）',
    '- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token',
    '- 合计：3 次 · 未命中输入 140 · 缓存读 0 · 缓存写 0 · 输出 75 · 缓存命中 0%',
    '- glm-5.3：2 次 · 未命中输入 130 · 缓存读 0 · 缓存写 0 · 输出 70 · 缓存命中 0%',
    '- glm-5.3-flash：1 次 · 未命中输入 10 · 缓存读 0 · 缓存写 0 · 输出 5 · 缓存命中 0%',
  ])
})

test('a record the usage section cannot read is counted, not dropped; the pricing service\'s problems reach the callback', () => {
  const problems: string[] = []
  const throwing = { ...creditPricing, charged: () => { throw new Error('rate table gone') } }
  const section = usageSectionOf(morningReport({ ...quietReport, usage: [...usage, { at: 'soon', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 1, outputTokens: 1 } }], pricing: throwing, problem: message => { problems.push(message) } }))
  assert.ok(section.includes('- 无法计价的记录 3 条（计价服务出错），未计入'), section.join('\n'))
  assert.ok(section.includes('- 无法读取的记录 1 条，未计入'))
  assert.equal(problems.length, 3)
})

test('morning report leads with exceptions, then what waits for the person, then usage; it has no grading', () => {
  const decisions: DecisionRecord[] = [
    { at: 't1', kind: 'dispatch:spawn_teammate', subject: 'researcher' },
    { at: 't2', kind: 'dispatch:subagent', subject: 'reviewer' },
  ]
  const asks: AskSummary = { waiting: { count: 2, oldest: '2026-10-20' }, agentOwn: 1, decided: { person: 25, inChat: 3, agent: 3 } }
  const report = morningReport({
    period: '2026-10-27',
    decisions,
    violations: [{ at: 't3', rule: 'file-tools-only', tool: 'Bash', correction: 'Boundary: …' }],
    usage,
    asks,
  })
  const exceptionIndex = report.indexOf('## 例外')
  const asksIndex = report.indexOf('## 等你定的事')
  const usageIndex = report.indexOf('## 用量')
  assert.ok(exceptionIndex >= 0 && exceptionIndex < asksIndex && asksIndex < usageIndex)
  assert.ok(report.includes('违规 file-tools-only × 1'))
  assert.ok(report.includes([
    '## 等你定的事',
    '- 等你定的 2 件，最早一件是 2026-10-20 提出的',
    '- agent 自己要定的 1 件',
    '- 本期拍板 31 次：你 25 · 你在对话里说 3 · agent 3',
    '- 派遣类调用 2 次',
  ].join('\n')))
  assert.ok(report.includes('- glm-5.3：2 次 · 未命中输入 130 · 缓存读 0 · 缓存写 0 · 输出 70 · 缓存命中 0%'))
  assert.ok(!/L[123]|决策曲线|次日报备|当次申报/.test(report), report)
})

test('the section of asks names the oldest ask only when there is one, and counts only dispatch records as dispatch calls', () => {
  const report = morningReport({
    period: 'p',
    decisions: [
      { at: 't1', kind: 'dispatch', subject: 'a' },
      { at: 't2', kind: 'dispatch:subagent', subject: 'b' },
      { at: 't3', kind: 'out-of-workspace', subject: 'C:\\Windows\\x' },
      { at: 't4', kind: 'model-route', subject: 'c' },
    ],
    violations: [],
    usage: [],
    asks: NO_ASKS,
  })
  assert.ok(report.includes('## 等你定的事\n- 等你定的 0 件\n- agent 自己要定的 0 件\n- 本期拍板 0 次：你 0 · 你在对话里说 0 · agent 0\n- 派遣类调用 2 次'), report)
  assert.ok(report.includes('## 例外（先看）\n- 无'))
})

test('a graph that cannot be read puts its reason in the section of asks, keeps the dispatch count, and the rest of the report stays', () => {
  const report = morningReport({
    period: 'p',
    decisions: [{ at: 't1', kind: 'dispatch:subagent', subject: 'reviewer' }],
    violations: [{ at: 't3', rule: 'file-tools-only', tool: 'Bash', correction: 'Boundary: …' }],
    usage,
    asks: { unreadable: '项目图目录 C:/ws/docs/graph 不存在' },
  })
  assert.ok(report.includes('## 等你定的事\n- 项目图读不到：项目图目录 C:/ws/docs/graph 不存在\n- 派遣类调用 1 次'), report)
  assert.ok(!report.includes('等你定的 '))
  assert.ok(report.includes('违规 file-tools-only × 1'))
  assert.ok(report.includes('glm-5.3：2 次 · 未命中输入 130'))
})

test('clean period reports 无 exceptions and empty usage', () => {
  const report = morningReport({ period: 'p', decisions: [], violations: [], usage: [], asks: NO_ASKS })
  assert.ok(report.includes('- 无'))
  assert.ok(report.includes('- 无模型调用'))
  assert.ok(!report.includes('影子记录'))
})

/** The report over one period's journal records alone: no decisions, no usage (the tests below read the exception section). */
const reportOf = (violations: readonly GuardRecord[]): string => morningReport({ period: 'p', decisions: [], violations: [...violations], usage: [], asks: NO_ASKS })

test('denials and late denials are the violations; a late denial is counted on its own line', () => {
  const report = reportOf([
      { at: 't1', rule: 'file-tools-only', tool: 'Bash', correction: '…' },
      // A shadow record of the pre-0.6 fallback and a rules-board late block: both are late denials.
      { at: 't2', rule: 'file-tools-only', mode: 'shadow', sessionId: 's1', turn: 1, paths: ['gen.txt'], calls: [{ tool: 'Bash', command: '[IO.File]::WriteAllText(…)' }] },
      { at: 't3', rule: 'rules:r-no-push', mode: 'late', tool: 'pwsh', scope: 'other' },
  ])
  assert.ok(report.includes('## 例外（先看）\n- 违规 file-tools-only × 2\n- 违规 rules:r-no-push（其他路由） × 1\n- 其中晚到的拦下 2 条\n'), report)
  assert.ok(!report.includes('## 影子记录'), 'the shadow section is gone')
})

test('a denial of the rules board (mode enforce, effect block) is a violation like the guard\'s', () => {
  const report = morningReport({
    period: 'p',
    decisions: [],
    violations: [
      { at: 't1', rule: 'rules:r-no-push', mode: 'enforce', effect: 'block', tool: 'pwsh', scope: 'other', correction: '…' },
    ],
    usage: [],
    asks: NO_ASKS,
  })
  assert.ok(report.includes('- 违规 rules:r-no-push（其他路由） × 1'), report)
})

test('follow-up, request, grant, void, lift and gap records are not violations; a queued call, a recorded call and an unreadable line are counted apart', () => {
  const report = morningReport({
    period: 'p',
    decisions: [],
    violations: [
      { at: 't1', rule: 'rules:r-note', mode: 'record', effect: 'record', tool: 'pwsh', scope: 'other' },
      { at: 't2', rule: 'rules:r-queue', mode: 'enforce', effect: 'queue', tool: 'pwsh', scope: 'other', correction: '…' },
      { at: 't3', kind: 'followup', rule: 'file-tools-only', tool: 'pwsh', outcome: 'repeat', denial: 'k', scope: 'dialect' },
      { at: 't4', kind: 'request', rule: 'workspace-containment', tool: 'write', ref: 'r-1', outcome: 'approved', by: 'human', words: '可以', scope: 'dialect' },
      { at: 't5', kind: 'grant', rule: 'workspace-containment', tool: 'write', ref: 'r-1', signature: 's', call: { tool: 'write', target: 'x' }, scope: 'dialect' },
      { at: 't6', kind: 'grant-void', rule: 'workspace-containment', tool: 'write', ref: 'r-1', reason: 'changed', scope: 'dialect' },
      { at: 't7', kind: 'lift', rule: 'scratch-only', action: 'lift', via: 'chat', words: '新建脚本那条先别拦了' },
      { at: 't8', rule: 'x', mode: 'late' },
      { at: 't9', kind: 'gap', row: 'guard', lost: 3, classes: { denial: 2, followup: 1 }, since: '2026-11-01T01:00:00Z', until: '2026-11-01T02:10:00Z' },
    ],
    usage: [],
    asks: NO_ASKS,
    offsetMinutes: 480,
  })
  assert.ok(report.includes('## 例外（先看）\n- 无\n'), report)
  assert.ok(!report.includes('违规 rules:r-queue'), 'a queued call is not a violation')
  assert.ok(!report.includes('违规 file-tools-only'), 'a follow-up record is not a violation')
  assert.ok(!report.includes('违规 workspace-containment'), 'a request, a grant or a void is not a violation')
  assert.ok(!report.includes('违规 scratch-only'), 'a lift record is not a violation')
  assert.ok(report.includes('- 只记录 1 条（规则板上人选的做法）'), report)
  assert.ok(report.includes('- 流水有缺口：这段时间有 3 条记录没写进来（拦下 2、跟进 1），最近一处到 11-01 10:10；当时的拦截都照常生效'), report)
  assert.ok(report.includes('- 1 行记录读不懂'), report)
})

test('records from routes the dialect did not claim are counted apart; records without a scope count as before', () => {
  const report = reportOf([
      { at: 't1', rule: 'file-tools-only', tool: 'Bash', correction: '…' }, // written before split step 7
      { at: 't2', rule: 'file-tools-only', tool: 'Bash', scope: 'dialect', route: { provider: 'glm-zcode', model: 'glm-5.3' }, correction: '…' },
      { at: 't3', rule: 'file-tools-only', tool: 'pwsh', scope: 'other', route: { provider: 'deepseek-account', model: 'deepseek-flash' }, correction: '…' },
  ])
  assert.ok(report.includes('## 例外（先看）\n- 违规 file-tools-only × 2\n- 违规 file-tools-only（其他路由） × 1\n'))
})

/** A filesystem of the given files; a file that is not in it is missing, as ENOENT. */
function filesOf(files: ReadonlyMap<string, string>): { readFile(path: string): Promise<string> } {
  return {
    readFile: (path) => {
      const content = files.get(path)
      return content === undefined ? Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) : Promise.resolve(content)
    },
  }
}
/** A graph with no node, for the tests of the journals. */
const emptyGraph = (): Promise<LoadedGraph> => Promise.resolve({ nodes: new Map(), revisions: new Map(), revision: '', issues: [] })

test('report entry folds the journal files from both directories and tolerates missing ones', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', JSON.stringify({ at: 't1', kind: 'dispatch:spawn_teammate', subject: 'researcher' })],
    ['C:/u/glm-hourness/audit/usage.jsonl', JSON.stringify({ at: '2026-10-27T01:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 9, outputTokens: 1 } })],
  ])
  const fs = filesOf(files)
  const report = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm/', userHome: 'C:/u/glm-hourness' }, '2026-10-27', emptyGraph)
  assert.ok(report.includes('# 晨报 2026-10-27'))
  assert.ok(report.includes('- 派遣类调用 1 次'))
  assert.ok(report.includes('- glm-5.3：1 次 · 未命中输入 9 · 缓存读 0 · 缓存写 0 · 输出 1 · 缓存命中 0%'))
  assert.ok(report.includes('- 无')) // no violations journal, no exceptions
  const projectOnly = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-27', emptyGraph)
  assert.ok(projectOnly.includes('- 无模型调用')) // no user directory: the usage journal reads as empty
})

test('report entry honors the period bound: older records stay out', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', kind: 'dispatch:subagent', subject: 'old' }), // lexically after the bound, instant before it
      JSON.stringify({ at: '2026-10-27T01:00:00Z', kind: 'dispatch:subagent', subject: 'new' }),
    ].join('\n')],
  ])
  const fs = filesOf(files)
  const report = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-27', emptyGraph, '2026-10-27T00:00:00Z')
  assert.ok(report.includes('- 派遣类调用 1 次')) // today's record counted, yesterday's not
})

test('records written before the grading was removed still read: the level is ignored, a graded line is no exception, and only dispatch kinds count as dispatch calls', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-27T01:00:00Z', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' }),
      JSON.stringify({ at: '2026-10-27T02:00:00Z', level: 'L3', kind: 'out-of-workspace', subject: 'C:\\Windows\\x' }),
      JSON.stringify({ at: '2026-10-27T03:00:00Z', level: 'L2' }), // no kind at all
    ].join('\n')],
  ])
  const fs = filesOf(files)
  const report = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-27', emptyGraph, '2026-10-27T00:00:00Z')
  assert.ok(report.includes('## 例外（先看）\n- 无'))
  assert.ok(report.includes('- 派遣类调用 1 次'))
  assert.ok(!/L[123]|out-of-workspace/.test(report), report)
})

test('a graph reader that rejects, or throws at once, puts its reason in the section and the report still comes out', async () => {
  const fs = filesOf(new Map())
  const homes = { projectHome: 'C:/ws/.llm' }
  const rejected = await reportFromFiles(fs, homes, 'p', () => Promise.reject(new Error('项目图行 glm-hourness/graph 没有启用')))
  assert.ok(rejected.includes('## 等你定的事\n- 项目图读不到：项目图行 glm-hourness/graph 没有启用\n- 派遣类调用 0 次'), rejected)
  const thrown = await reportFromFiles(fs, homes, 'p', () => { throw new Error('boom') })
  assert.ok(thrown.includes('- 项目图读不到：boom'), thrown)
  assert.ok(thrown.includes('## 用量（今天）\n- 无模型调用'))
})

// The asks of the project graph. The fixture clock starts at 08:00:00 UTC on the day it is given and runs a second per write.

const asksFixture = (): Promise<EngineFixture> => engineFixture('morning-asks-', 27, async ({ run }) => {
  await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview', body: '需求：记一下每天花了多少钱' } })
})
const graphTest = fixtureTest(asksFixture)

const CONCLUSION = '借书先不收押金'
const mark = (call: string): string => `${ANSWER_MARKS.agree}${answerCallMark(call)}`

/** Put one more ask of the proposal shape under goal-1; `settledBy: 'agent'` makes it one the agent settles itself. */
async function ask(g: EngineFixture, title: string, settledBy?: 'agent'): Promise<string> {
  const asked = await g.run('human', { op: 'propose', reason: '立项', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), title, ...settledBy === undefined ? {} : { decider: settledBy } } })
  return asked.id
}

/** The person decides on the panel or the command line. */
const byPerson = (g: EngineFixture, id: string, conclusion = CONCLUSION) => g.act('human', { op: 'decide', id, reason: '同意', conclusion })
/** The main agent records what the person said in the chat: the mark of the agreement and the words as relay. */
const inChat = (g: EngineFixture, id: string, call: string, conclusion = CONCLUSION) => g.act('llm', { op: 'decide', id, reason: mark(call), relay: '可以', conclusion })

const PERIOD_START = '2026-10-27T00:00:00Z'

graphTest('the asks of a graph: the waiting ones and the oldest day, the agent\'s own, and every decision of the period by who made it, not cut at the 20 the projection lists', async g => {
  // Waiting for the person: one put on the 20th and one today. Waiting for the agent: one.
  const earlier = openEngine(g.dir, { now: () => new Date(Date.UTC(2026, 9, 20, 8, 0, 0)) })
  must(await earlier.apply('human', { op: 'propose', reason: '立项', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), title: '更早的一件' } }))
  await ask(g, '今天的一件')
  await ask(g, '自己定的一件', 'agent')
  // The period holds 25 decisions of the person, 3 of the person in the chat and 2 of the agent.
  for (let index = 1; index <= 25; index++) must(await byPerson(g, await ask(g, `拍板 ${index}`)))
  for (let index = 1; index <= 3; index++) must(await inChat(g, await ask(g, `对话里 ${index}`), `call-${index}`))
  for (let index = 1; index <= 2; index++) must(await g.act('llm', { op: 'decide', id: await ask(g, `agent ${index}`, 'agent'), reason: '按惯例定', conclusion: CONCLUSION }))
  // Before the period: two decisions of the person on the 20th.
  for (const title of ['更早拍板 1', '更早拍板 2']) {
    const id = await ask(g, title)
    must(await earlier.apply('human', { op: 'decide', id, rev: await g.rev(id), reason: '同意', conclusion: CONCLUSION }))
  }

  const graph = await loadGraph(g.dir)
  assert.equal((await g.engine.openItems()).recentDecisions.length, 20, 'the projection lists at most 20, one per question')

  const inPeriod = askSummary(graph, PERIOD_START)
  assert.deepEqual(inPeriod.decided, { person: 25, inChat: 3, agent: 2 })
  assert.deepEqual(inPeriod.waiting, { count: 2, oldest: localDay(new Date(Date.UTC(2026, 9, 20, 8, 0, 0))) })
  assert.equal(inPeriod.agentOwn, 1)

  assert.deepEqual(askSummary(graph).decided, { person: 27, inChat: 3, agent: 2 }, 'without a period bound every decision counts')
})

graphTest('a question decided twice in the period counts twice: the agent\'s decision and the person\'s overturning of it', async g => {
  const id = await ask(g, '先 agent 后你', 'agent')
  must(await g.act('llm', { op: 'decide', id, reason: '按惯例定', conclusion: CONCLUSION }))
  must(await byPerson(g, id, '改成收押金'))
  assert.equal((await g.engine.openItems()).recentDecisions.length, 1, 'the projection keeps the last decision of a question only')
  assert.deepEqual(askSummary(await loadGraph(g.dir), PERIOD_START).decided, { person: 1, inChat: 0, agent: 1 })
})
graphTest('only the words the harness checked count as said in the chat: the mark without the relay, and a relay without the mark, are the agent\'s', async g => {
  // The mark in the reason of the agent's own decision, with no words of the person: not in the chat.
  const marked = await ask(g, '写了标记没有原话', 'agent')
  must(await g.act('llm', { op: 'decide', id: marked, reason: mark('forged'), conclusion: CONCLUSION }))
  // The old way: the llm relays the person's words and decides, with a reason of its own; the harness did not check the words.
  const relayed = await ask(g, '转述但没有标记')
  must(await g.act('llm', { op: 'decide', id: relayed, reason: '人说可以', relay: '可以', conclusion: CONCLUSION }))
  // What record_human_answer writes: the mark and the checked words.
  const checked = await ask(g, '核对过的原话')
  must(await inChat(g, checked, 'call-9'))
  const summary = askSummary(await loadGraph(g.dir), PERIOD_START)
  assert.deepEqual(summary.decided, { person: 0, inChat: 1, agent: 2 })
})

graphTest('a decision of the person on the panel or the command line is the person\'s even when the reason carries the mark', async g => {
  const id = await ask(g, '人在面板上拍板')
  must(await g.act('human', { op: 'decide', id, reason: mark('x'), conclusion: CONCLUSION }))
  assert.deepEqual(askSummary(await loadGraph(g.dir), PERIOD_START).decided, { person: 1, inChat: 0, agent: 0 })
})

graphTest('a question with an option table counts like the others, and a node that is not a question does not count', async g => {
  await g.run('human', { op: 'propose', reason: '拆分', node: { type: 'task', title: '写代码', parent: 'goal-1', acceptance: ['能跑'] } })
  const table = await g.run('llm', { op: 'propose', reason: '自己定的细节', node: { type: 'question', title: '缓存目录名', parent: 'goal-1', decider: 'agent', recommend: 'A', options: [{ key: 'B', label: 'cache', gain: '一眼看见', cost: '要手动忽略' }, { key: 'A', label: '.cache', gain: '不入库', cost: '要加忽略行' }] } })
  let summary = askSummary(await loadGraph(g.dir), PERIOD_START)
  assert.deepEqual([summary.waiting.count, summary.agentOwn, summary.decided], [0, 1, { person: 0, inChat: 0, agent: 0 }])
  must(await g.act('llm', { op: 'decide', id: table.id, option: 'A', reason: '按惯例' }))
  must(await g.act('human', { op: 'decide', id: table.id, option: 'B', reason: '改成 cache' }))
  summary = askSummary(await loadGraph(g.dir), PERIOD_START)
  assert.deepEqual([summary.waiting.count, summary.agentOwn, summary.decided], [0, 0, { person: 1, inChat: 0, agent: 1 }])
  assert.equal(summary.waiting.oldest, undefined)
})
graphTest('the report entry reads the graph it is given: the section, then the period bound on the decisions', async g => {
  await ask(g, '一件等着的')
  must(await byPerson(g, await ask(g, '一件拍了的')))
  const fs = filesOf(new Map())
  const report = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-27', () => loadGraph(g.dir), PERIOD_START)
  assert.ok(report.includes([
    '## 等你定的事',
    `- 等你定的 1 件，最早一件是 ${localDay(new Date(Date.UTC(2026, 9, 27, 8, 0, 1)))} 提出的`,
    '- agent 自己要定的 0 件',
    '- 本期拍板 1 次：你 1 · 你在对话里说 0 · agent 0',
    '- 派遣类调用 0 次',
  ].join('\n')), report)
  const next = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-28', () => loadGraph(g.dir), '2026-10-28T00:00:00Z')
  assert.ok(next.includes('- 本期拍板 0 次：你 0 · 你在对话里说 0 · agent 0'), next)
})

// The gap file (docs/DESIGN.md §2.4): the usage section names the deletions that fall in its period.

const USAGE_PATH = 'C:/u/glm-hourness/audit/usage.jsonl'
const GAP_PATH = 'C:/u/glm-hourness/audit/usage-gaps.jsonl'
const GAP_AT = '2026-10-29T03:12:34.750Z' // 11:12 UTC+8
const GAP_LINE = '- 缺口：10-29 11:12 删去 806 条（旧路由的记录，按用户要求删除）；这些调用不在本节的数字里'
const gapRow = (row: object): string => JSON.stringify({ at: GAP_AT, removed: 806, reason: '旧路由的记录，按用户要求删除', ...row })

function memoryFs(files: Map<string, string>): ReportFs {
  return { readFile: (path: string) => {
    const content = files.get(path)
    return content === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(content)
  } }
}

/** The usage section of the report of `since` onward, made on 2026-10-31 20:00 UTC+8. */
async function usageSectionFrom(since: string | undefined, gaps: string, extra: ReportOptions = {}): Promise<string[]> {
  const files = new Map([
    [USAGE_PATH, JSON.stringify({ at: '2026-10-31T10:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 9, outputTokens: 1 } })],
    [GAP_PATH, gaps],
  ])
  const report = await reportFromFiles(memoryFs(files), { projectHome: 'C:/ws/.llm', userHome: 'C:/u/glm-hourness' }, 'p', emptyGraph, since, { pricing: creditPricing, now: Date.parse('2026-10-31T20:00:00+08:00'), offsetMinutes: 480, ...extra })
  return usageSectionOf(report)
}

test('report entry: a gap without a range is named when the period starts before the deletion, and not when it starts after', async () => {
  const gaps = gapRow({})
  const before = await usageSectionFrom('2026-10-29T00:00:00+08:00', gaps)
  assert.deepEqual(before.slice(0, 2), ['## 用量（今天）', GAP_LINE])
  assert.ok(before[2]?.startsWith('- 合计：积分'), before.join('\n'))
  const after = await usageSectionFrom('2026-10-30T00:00:00+08:00', gaps)
  assert.ok(after.every(line => !line.startsWith('- 缺口：')), after.join('\n'))
  assert.ok(after[1]?.startsWith('- 合计：积分'), after.join('\n'))
  // The same instant is not before it: the period starts at the deletion.
  assert.ok((await usageSectionFrom(GAP_AT, gaps)).every(line => !line.startsWith('- 缺口：')))
  // Without a period bound the report is the whole record, so every gap counts.
  assert.ok((await usageSectionFrom(undefined, gaps)).includes(GAP_LINE))
})

test('report entry: a gap with a range is named when the period meets the range', async () => {
  const gaps = gapRow({ from: '2026-10-20T00:00:00+08:00', to: '2026-10-28T12:00:00+08:00' })
  assert.ok((await usageSectionFrom('2026-10-28T00:00:00+08:00', gaps)).includes(GAP_LINE), 'the period starts inside the range')
  assert.ok((await usageSectionFrom('2026-10-28T12:00:00+08:00', gaps)).includes(GAP_LINE), 'the period starts at the end of the range')
  assert.ok((await usageSectionFrom('2026-10-29T00:00:00+08:00', gaps)).every(line => !line.startsWith('- 缺口：')), 'the period starts after the range, though before the deletion')
})

test('report entry: gap rows that cannot be read are counted in the usage section; an empty period still names the gap', async () => {
  const gaps = [gapRow({}), '{broken', gapRow({ removed: 0 })].join('\n')
  const section = await usageSectionFrom('2026-10-29T00:00:00+08:00', gaps)
  assert.deepEqual([section[1], section[2]], [GAP_LINE, '- 无法读取的缺口记录 2 条，未列出'])
  const empty = await reportFromFiles(memoryFs(new Map([[GAP_PATH, gapRow({})]])), { userHome: 'C:/u/glm-hourness' }, 'p', emptyGraph, '2026-10-29T00:00:00+08:00', { now: Date.parse('2026-10-31T20:00:00+08:00'), offsetMinutes: 480 })
  assert.deepEqual(usageSectionOf(empty), ['## 用量（今天）', '- 无模型调用', GAP_LINE])
  const noGap = await reportFromFiles(memoryFs(new Map()), { userHome: 'C:/u/glm-hourness' }, 'p', emptyGraph, '2026-10-29T00:00:00+08:00')
  assert.deepEqual(usageSectionOf(noGap), ['## 用量（今天）', '- 无模型调用'])
})

test('report entry: the usage section prices through the service in the options, and the records without a readable time stay out of the period', async () => {
  const files = new Map([[USAGE_PATH, [
    JSON.stringify({ at: '2026-10-31T10:00:00+08:00', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500, totalTokens: 5500 } }),
    JSON.stringify({ at: 'whenever', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1, outputTokens: 1 } }),
    '{broken',
  ].join('\n')]])
  const homes = { userHome: 'C:/u/glm-hourness' }
  const priced = usageSectionOf(await reportFromFiles(memoryFs(files), homes, 'p', emptyGraph, '2026-10-31T00:00:00+08:00', { pricing: creditPricing }))
  // Saturday morning: off-peak, so half of the 2.57 the same call costs in peak.
  const credits = creditPricing.charged('glm-5.3', { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 }, Date.parse('2026-10-31T10:00:00+08:00'))
  assert.ok(credits !== undefined && Math.abs(credits - 1.285) < 1e-9, String(credits))
  assert.deepEqual(priced, ['## 用量（今天）', `- 合计：积分 ${credits.toFixed(2)} · 高峰 0% · 缓存命中 80%`, `- glm-5.3：1 次 · 积分 ${credits.toFixed(2)} · 高峰 0% · 缓存命中 80%`])
  // With no period bound nothing is filtered by time: the record without a time is counted as unreadable, the broken line is not seen by the report.
  const all = usageSectionOf(await reportFromFiles(memoryFs(files), homes, 'p', emptyGraph, undefined, { pricing: creditPricing }))
  assert.ok(all.includes('- 无法读取的记录 1 条，未计入'), all.join('\n'))
})

test('apply journals dispatch decisions and always delegates', async () => {
  const decisions: unknown[] = []
  const journal = { decision: async (record: unknown) => { decisions.push(record) } } as unknown as Pick<AuditJournal, 'decision'>
  const listeners: Array<(payload: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
  const dispose = apply({
    on: (_event, listener) => { listeners.push(listener as typeof listeners[number]); return () => {} },
  }, journal)
  let delegated = false
  const result = await listeners[0]({ name: 'spawn_teammate', arguments: { name: 'researcher' } }, async () => { delegated = true; return { kind: 'allow' } })
  await new Promise(resolve => setImmediate(resolve))
  await listeners[0]({ name: 'read', arguments: {} }, async () => { delegated = true; return { kind: 'allow' } })
  await listeners[0]({ name: 'spawn_teammate', arguments: {}, parent: 'token' }, async () => { delegated = true; return { kind: 'allow' } })
  dispose()
  assert.equal(delegated, true)
  assert.deepEqual(result, { kind: 'allow' })
  assert.equal(decisions.length, 1) // only the root dispatch; nested + non-dispatch skipped
  const record = decisions[0] as DecisionRecord
  assert.deepEqual(Object.keys(record), ['at', 'kind', 'subject']) // no level
  assert.equal(record.kind, 'dispatch:spawn_teammate')
  assert.equal(record.subject, 'researcher')
})

test('both subagent tools of the rc.3 base profile are dispatches', async () => {
  // dsh-base cordis.patch.yml mounts dsh-tool-subagent twice: toolName subagent (spawn) and subagent_fork (fork).
  const decisions: DecisionRecord[] = []
  const journal = { decision: async (record: DecisionRecord) => { decisions.push(record) } }
  const listeners: Array<(payload: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
  apply({ on: (_event, listener) => { listeners.push(listener as typeof listeners[number]); return () => {} } }, journal)
  for (const name of ['subagent', 'subagent_fork']) {
    await listeners[0]({ name, arguments: { description: `${name} task` } }, async () => ({ kind: 'allow' }))
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(decisions.map(record => [record.kind, record.subject]), [['dispatch:subagent', 'subagent task'], ['dispatch:subagent_fork', 'subagent_fork task']])
})

test('the installer form journals decisions into the row home, else the data service project directory', async () => {
  const files = new Map<string, string>()
  const fs = { mkdir: async () => undefined, appendFile: async (path: string, data: string) => { files.set(path, (files.get(path) ?? '') + data) } }
  const run = async (config: { home?: string }, data: unknown) => {
    const listeners: Array<(payload: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
    apply({ on: (_event, listener) => { listeners.push(listener as typeof listeners[number]); return () => {} }, get: name => name === 'glmHournessData' ? data : undefined }, { ...config, fs })
    await listeners[0]({ name: 'subagent', arguments: { description: 'task' } }, async () => ({ kind: 'allow' }))
    await new Promise(resolve => setImmediate(resolve))
  }
  await run({}, { userHome: 'C:/u/glm-hourness', projectHome: 'C:/svc/.llm' })
  await run({ home: 'C:/row/.llm' }, { userHome: 'C:/u/glm-hourness', projectHome: 'C:/svc/.llm' })
  const warn = console.warn
  console.warn = () => {}
  try {
    await run({}, undefined) // no directory: dispatch still delegates, the record is reported and dropped
  }
  finally {
    console.warn = warn
  }
  assert.deepEqual([...files.keys()].sort(), ['C:/row/.llm/audit/decisions.jsonl', 'C:/svc/.llm/audit/decisions.jsonl'])
})
