import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { apply, renderHourness } from '../src/report/index.ts'
import { cacheHitRate, parseGaps, peakStatusItems, usagePanel, usagePanelLines, usagePanelOf, usageStatusItems, type PanelLineOptions } from '../src/report/panel.ts'
import { collectStatus } from '../src/report/status.ts'
import { statusServiceName, provideRowStatus } from '../src/shared/status-host.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import type { UsagePricing } from '../src/shared/pricing.ts'
import { quotaLines, type QuotaView } from '../src/shared/quota.ts'
import { serviceStore } from './fake-rc3.ts'
import { engineFixture, fixtureTest } from './graph-helpers.ts'
import { exampleRecord } from './proposal-examples.ts'

// The usage panel with the pricing service the GLM channel package provides
// (its credit plan, src/glm-llm/credits.ts), and without it. The provider
// and reader wiring is in tests/contracts.spec.ts.

function fakeFs(files: Map<string, string>) {
  return { readFile: async (path: string) => {
    const content = files.get(path)
    if (content === undefined) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return content
  } }
}

const homes = { projectHome: 'C:/ws/.llm', userHome: 'C:/u/glm-hourness' }
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

const journalRecords = [
  // Wednesday peak, native channel, mostly cache reads: 2.57 charged in full.
  { at: '2026-10-28T15:00:00+08:00', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500, totalTokens: 5500 } },
  // Wednesday morning, old route: 3.78 at full rate, 1.89 charged.
  { at: '2026-10-28T10:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 } },
  // Saturday afternoon: off-peak; 1.201 at full rate, 0.6005 charged; the id case does not matter.
  { at: '2026-10-31T15:00:00+08:00', provider: 'glm-zcode', model: 'GLM-5.3-Flash', usage: { inputTokens: 1000, cacheReadTokens: 1000, cacheWriteTokens: 500, outputTokens: 1000, totalTokens: 3500 } },
  // Native channel before the usage-chunk fix: input 0 and no total. Flagged, not priced.
  { at: '2026-10-27T15:00:00+08:00', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 0, outputTokens: 300 } },
  // The same shape from another route is a real record: 0.24 in peak.
  { at: '2026-10-28T16:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 0, outputTokens: 100 } },
  // Outside the credit plan: counted only.
  { at: '2026-10-28T15:00:00+08:00', provider: 'deepseek-account', model: 'deepseek-flash', usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 } },
  { at: '2026-10-28T16:00:00+08:00', provider: 'deepseek-account', model: 'deepseek-flash', usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 } },
  // No time: unreadable.
  { provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 10, outputTokens: 10 } },
]
const journal = journalRecords.map(record => JSON.stringify(record)).concat(['{broken json', '']).join('\n')

test('with the pricing service the usage panel prices each model in charged credits with its peak part and token counts', () => {
  const panel = usagePanel(journal, creditPricing)
  assert.deepEqual(panel.models.map(model => [model.model, model.calls]), [['glm-5.3', 3], ['glm-5.3-flash', 1]])
  const [glm, flash] = panel.models
  assert.ok(glm !== undefined && flash !== undefined)
  close(glm.credits, 2.57 + 1.89 + 0.24)
  close(glm.peakCredits, 2.57 + 0.24)
  assert.deepEqual([glm.inputTokens, glm.cacheReadTokens, glm.cacheWriteTokens, glm.outputTokens], [3000, 4000, 0, 1600])
  close(flash.credits, 0.6005)
  assert.equal(flash.peakCredits, 0)
  const hit = (counts: Parameters<typeof cacheHitRate>[0], expected: number): void => {
    const rate = cacheHitRate(counts)
    assert.ok(rate !== undefined)
    close(rate, expected)
  }
  hit(glm, 4000 / 7000)
  hit(flash, 1000 / 2500)
  assert.equal(cacheHitRate({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5 }), undefined)
  assert.deepEqual(panel.unpriced, [{ model: 'deepseek-flash', calls: 2 }])
  assert.equal(panel.unpriceable, 0)
  assert.equal(panel.preFix, 1)
  assert.equal(panel.unreadable, 2)
})

test('with the pricing service the panel lines give totals, per-model credits, peak share by credits, cache hit rate and what was left out', () => {
  assert.deepEqual(usagePanelLines(usagePanel(journal, creditPricing)), [
    '- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8），其余时段按 50% 计积分；高峰占比按积分计',
    // 2.81 of 5.3005 credits were charged in peak; 5000 of 9500 input tokens were cache reads.
    '- 合计：积分 5.30 · 高峰 53% · 缓存命中 53%',
    '- glm-5.3：3 次 · 积分 4.70 · 高峰 60% · 缓存命中 57%',
    '- glm-5.3-flash：1 次 · 积分 0.60 · 高峰 0% · 缓存命中 40%',
    '- 不计积分（不在 GLM 积分套餐内）：deepseek-flash 2 次',
    '- 修正前的原生通道记录 1 条：输入计为 0，未计入',
    '- 无法读取的记录 2 条，未计入',
  ])
})

test('with the pricing service a journal with no priced call shows zero credits and nothing else invented', () => {
  const lines = usagePanelLines(usagePanel(JSON.stringify({ at: '2026-10-28T15:00:00+08:00', provider: 'deepseek-account', model: 'deepseek-flash', usage: { inputTokens: 1, outputTokens: 1 } }), creditPricing))
  assert.deepEqual(lines.slice(1), ['- 合计：积分 0.00', '- 不计积分（不在 GLM 积分套餐内）：deepseek-flash 1 次'])
})

test('without the pricing service the panel lists calls and token counts of every model, most calls first; pre-fix and unreadable records as with it', () => {
  const panel = usagePanel(journal)
  assert.equal(panel.pricing, undefined)
  assert.deepEqual(panel.models.map(model => [model.model, model.calls, model.credits]), [['glm-5.3', 3, 0], ['deepseek-flash', 2, 0], ['glm-5.3-flash', 1, 0]])
  assert.deepEqual(panel.unpriced, [])
  assert.deepEqual(usagePanelLines(panel), [
    '- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token',
    // 5000 of 9600 input tokens were cache reads.
    '- 合计：6 次 · 未命中输入 4100 · 缓存读 5000 · 缓存写 500 · 输出 2610 · 缓存命中 52%',
    '- glm-5.3：3 次 · 未命中输入 3000 · 缓存读 4000 · 缓存写 0 · 输出 1600 · 缓存命中 57%',
    '- deepseek-flash：2 次 · 未命中输入 100 · 缓存读 0 · 缓存写 0 · 输出 10 · 缓存命中 0%',
    '- glm-5.3-flash：1 次 · 未命中输入 1000 · 缓存读 1000 · 缓存写 500 · 输出 1000 · 缓存命中 40%',
    '- 修正前的原生通道记录 1 条：输入计为 0，未计入',
    '- 无法读取的记录 2 条，未计入',
  ])
})

test('renderHourness folds report and panel summary from both directories, bounded to the local day', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-27T01:00:00+08:00', kind: 'dispatch:spawn_teammate', subject: 'researcher' }),
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', level: 'L3', kind: 'dispatch:subagent', subject: 'yesterday must not leak in' }),
    ].join('\n')],
    ['C:/u/glm-hourness/audit/usage.jsonl', [
      JSON.stringify({ at: '2026-10-27T02:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }),
      JSON.stringify({ at: '2026-10-27T15:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }),
    ].join('\n')],
  ])
  const now = new Date('2026-10-27T20:00:00+08:00')
  const usageText = files.get(USAGE_FILE) ?? ''
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now, offsetMinutes: 480, ...statusOf(usageText, creditPricing, now.getTime()) })
  assert.ok(text.includes('# 晨报 2026-10-27'))
  assert.ok(text.includes('- 派遣类调用 1 次')) // yesterday's call (written with a level) filtered out
  assert.ok(!/L[123]/.test(text), text)
  assert.ok(!text.includes('yesterday must not leak in'))
  // The panel reads the full journal on the credit basis: 0.0945 off-peak
  // (02:00, half of 0.189) plus 0.0189 in peak (Tuesday 15:00). Its first line is the peak line.
  assert.ok(text.includes('## 面板\n- 高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）\n- 全部用量记录；'))
  assert.ok(text.includes('- 合计：积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(text.includes('- glm-5.3：2 次 · 积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(!text.includes('## 数据目录'))
  // Without the pricing service the same journal lists calls and tokens, and has no peak line.
  const plain = await renderHourness(homes, { fs: fakeFs(files), now, offsetMinutes: 480, ...statusOf(usageText, undefined, now.getTime()) })
  assert.ok(plain.includes('## 面板\n- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token\n- 范围：2 条用量记录，最早 02:00；只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内\n- 合计：2 次 · 未命中输入 110 · 缓存读 0 · 缓存写 0 · 输出 55 · 缓存命中 0%'))
  assert.ok(!plain.includes('积分 0.11'))
  assert.ok(!plain.includes('高峰：'))
})

test('empty journal still renders the clean report; without a place for the graph the section says so', async () => {
  const text = await renderHourness(homes, { fs: fakeFs(new Map()) })
  assert.ok(text.includes('- 无'))
  assert.ok(!text.includes('## 数据目录'))
  assert.ok(text.includes('## 等你定的事\n- 项目图读不到：这次调用没有给出项目图的位置\n- 派遣类调用 0 次'), text)
})

test('a missing directory is named in the report', async () => {
  const noUser = await renderHourness({ projectHome: 'C:/ws/.llm' }, { fs: fakeFs(new Map()) })
  assert.ok(noUser.includes('## 数据目录\n- 用户级目录不可用（数据目录行 glm-hourness/data 未启用），用量流水读不到'))
  const none = await renderHourness({}, { fs: fakeFs(new Map()) })
  assert.ok(none.includes('- 项目目录未配置'))
  assert.ok(none.includes('- 用户级目录不可用'))
})

type Invocation = { rawInput: string, agent?: { id: string, session: { id: string, header: { id: string, cwd?: string } } } }
type Registered = { name: string, handler: (invocation: Invocation) => Promise<{ kind: string, text: string }> }

function register(config: { home?: string }, data: unknown, graph?: unknown): { registered: Registered[], dispose: () => void } {
  const registered: Registered[] = []
  const dispose = apply({
    commands: { register: definition => { registered.push(definition as Registered); return () => {} } },
    get: name => name === 'glmHournessData' ? data : name === 'glmHournessGraph' ? graph : undefined,
  }, config)
  return { registered, dispose }
}

/** A session invocation of /hourness whose working directory is `cwd`. */
const inSession = (cwd?: string): Invocation => ({ rawInput: '', agent: { id: 's1', session: { id: 's1', header: { id: 's1', ...cwd === undefined ? {} : { cwd } } } } })

/** The graph row's service, as the row provides it: where the graph is for a working directory (the call is recorded), and which names are graph tools. */
function graphRow(where: (cwd: string | undefined) => string | undefined): { service: unknown, calls: Array<string | undefined> } {
  const calls: Array<string | undefined> = []
  return { calls, service: { dirFor: (cwd: string | undefined) => { calls.push(cwd); return where(cwd) }, isGraphTool: () => false } }
}

const reasonOf = async (graph: unknown, cwd?: string): Promise<string> => {
  const { registered, dispose } = register({ home: 'C:/definitely-empty-hourness-home' }, { userHome: 'C:/definitely-empty-hourness-user' }, graph)
  try {
    const result = await registered[0].handler(inSession(cwd))
    assert.equal(result.kind, 'success')
    return result.text.split('## 等你定的事\n')[1].split('\n\n')[0]
  }
  finally {
    dispose()
  }
}

test('/hourness reads the graph of the calling session and names why when it cannot: the row off, no working directory, no directory, an unreadable graph', async () => {
  assert.equal(await reasonOf(undefined, 'C:/ws'), '- 项目图读不到：项目图行 glm-hourness/graph 没有启用\n- 派遣类调用 0 次')

  const none = graphRow(() => undefined)
  assert.equal(await reasonOf(none.service), '- 项目图读不到：这个会话没有工作目录，找不到项目图\n- 派遣类调用 0 次')
  assert.deepEqual(none.calls, [undefined])

  const root = await mkdtemp(join(tmpdir(), 'glmh-report-graph-'))
  try {
    const missing = join(root, 'docs', 'graph')
    const absent = graphRow(() => missing)
    assert.equal(await reasonOf(absent.service, root), `- 项目图读不到：项目图目录 ${missing} 不存在\n- 派遣类调用 0 次`)
    assert.deepEqual(absent.calls, [root])

    // nodes is a file: the directory is there, the graph cannot be read.
    const broken = join(root, 'broken')
    await mkdir(broken)
    await writeFile(join(broken, 'nodes'), 'not a directory')
    const unreadable = await reasonOf(graphRow(() => broken).service, root)
    assert.ok(unreadable.startsWith('- 项目图读不到：读图出错：'), unreadable)

    // An existing directory without nodes is a graph with nothing on it.
    const empty = join(root, 'empty')
    await mkdir(empty)
    assert.equal(await reasonOf(graphRow(() => empty).service, root), '- 等你定的 0 件\n- agent 自己要定的 0 件\n- 本期拍板 0 次：你 0 · 你在对话里说 0 · agent 0\n- 派遣类调用 0 次')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

const askedFixture = fixtureTest(() => engineFixture('glmh-report-asks-', 27, async ({ run }) => {
  await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview', body: '需求：记一下每天花了多少钱' } })
  await run('llm', { op: 'propose', reason: '主 Agent 在对话里把这件事交给人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend') } })
}))

askedFixture('/hourness counts the asks of the graph the graph row points the session at', async g => {
  const row = graphRow(() => g.dir)
  const section = await reasonOf(row.service, 'C:/ws')
  assert.ok(section.startsWith('- 等你定的 1 件，最早一件是 '), section)
  assert.ok(section.includes('\n- agent 自己要定的 0 件\n'), section)
  assert.deepEqual(row.calls, ['C:/ws'])
})

test('apply registers /hourness and /hourness-status; /hourness reports from the real directories', async () => {
  const { registered, dispose } = register({ home: 'C:/definitely-empty-hourness-home' }, { userHome: 'C:/definitely-empty-hourness-user' })
  assert.deepEqual(registered.map(definition => definition.name), ['hourness', 'hourness-status'])
  assert.equal(registered[0]!.name, 'hourness')
  const withArgs = await registered[0]!.handler({ rawInput: 'x' })
  assert.equal(withArgs.kind, 'error')
  const clean = await registered[0]!.handler({ rawInput: '' })
  assert.equal(clean.kind, 'success')
  assert.ok(clean.text.includes('# 晨报'))
  assert.ok(!clean.text.includes('## 数据目录'))
  dispose()
})

test('without a home or the data service the command still registers and names what is missing', async () => {
  const { registered, dispose } = register({}, undefined)
  const result = await registered[0]!.handler({ rawInput: '' })
  assert.equal(result.kind, 'success')
  assert.ok(result.text.includes('- 项目目录未配置'))
  assert.ok(result.text.includes('- 用户级目录不可用'))
  dispose()
})

// --- the panel of the usage journal: one function for both sections, the peak line, the scope of the records, the gaps and the quota ---

const ZONE = { offsetMinutes: 480 }
const GAP_FILE = 'C:/u/glm-hourness/audit/usage-gaps.jsonl'
const USAGE_FILE = 'C:/u/glm-hourness/audit/usage.jsonl'
const SCOPE_NOTE = '只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内'

/** The lines of the `## <title>` section of a rendered report, without the title and the blank lines. */
function sectionOf(text: string, title: string): string[] {
  const lines = text.split('\n')
  const start = lines.indexOf(`## ${title}`)
  if (start < 0) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => line.startsWith('## '))
  return (end < 0 ? rest : rest.slice(0, end)).filter(line => line.length > 0)
}

/** The totals, the per-model lines and the line of models outside the plan. */
const factsOf = (lines: readonly string[]): string[] => lines.filter(line => /^- (合计：|不计积分|[^：]+：\d+ 次)/.test(line))

/**
 * A service lookup whose hourness row provides the peak and usage entries the
 * way the row itself computes them (peakStatusItems, and usagePanel over the
 * raw journal then usageStatusItems), in the display zone the renderHourness
 * calls of this spec pass (480); the 面板 section reads them through it.
 */
function statusLookup(journalText: string, pricing: UsagePricing | undefined, now: number, offsetMinutes = 480): ServiceLookup {
  const store = serviceStore()
  provideRowStatus(store, 'hourness', () => [
    ...(pricing === undefined ? [] : peakStatusItems(pricing, now, { offsetMinutes })),
    ...usageStatusItems(usagePanel(journalText, pricing), USAGE_FILE, now),
  ])
  return store
}

/** The status option of a renderHourness call over the journal text. */
const statusOf = (journalText: string, pricing: UsagePricing | undefined, now: number): { status: { lookup: ServiceLookup, sessionId: string } } =>
  ({ status: { lookup: statusLookup(journalText, pricing, now), sessionId: 's1' } })

/** Local calendar day 2026-10-28 at `hour` o'clock, as the report's own day. */
const localAt = (hour: number): string => new Date(2026, 9, 28, hour, 0, 0).toISOString()
const todays = [
  { at: localAt(9), provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500, totalTokens: 5500 } },
  { at: localAt(10), provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 } },
  { at: localAt(11), provider: 'glm-zcode', model: 'GLM-5.3-Flash', usage: { inputTokens: 1000, cacheReadTokens: 1000, cacheWriteTokens: 500, outputTokens: 1000, totalTokens: 3500 } },
  { at: localAt(11), provider: 'deepseek-account', model: 'deepseek-flash', usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 } },
].map(record => JSON.stringify(record)).join('\n')
const localNoon = new Date(2026, 9, 28, 12, 0, 0)

test('usagePanelOf takes parsed values and the count of lines that were not JSON; usagePanel is the same over text, and both count the readable records and the earliest', () => {
  const parsed = usagePanelOf(journalRecords, creditPricing, undefined, 1)
  assert.deepEqual(parsed, usagePanel(journal, creditPricing))
  assert.equal(parsed.unreadable, 2) // one record without a time, one line that is not JSON
  assert.equal(parsed.records, 7)
  assert.equal(parsed.earliest, Date.parse('2026-10-27T15:00:00+08:00'))
  const none = usagePanelOf([])
  assert.deepEqual([none.records, none.earliest], [0, undefined])
})

test('usagePanelLines: basis false drops only the basis line, the note without pricing stays, and scope lines sit between the first line and the totals', () => {
  const priced = usagePanel(journal, creditPricing)
  const full = usagePanelLines(priced)
  assert.deepEqual(usagePanelLines(priced, { basis: false }), full.slice(1))
  const scope: PanelLineOptions = { scope: ['- 范围：甲', '- 缺口：乙'] }
  assert.deepEqual(usagePanelLines(priced, scope), [full[0], '- 范围：甲', '- 缺口：乙', ...full.slice(1)])
  assert.deepEqual(usagePanelLines(priced, { basis: false, ...scope }), ['- 范围：甲', '- 缺口：乙', ...full.slice(1)])
  const plain = usagePanel(journal)
  assert.deepEqual(usagePanelLines(plain, { basis: false }), usagePanelLines(plain))
  assert.deepEqual(usagePanelLines(plain, scope).slice(0, 3), [usagePanelLines(plain)[0], '- 范围：甲', '- 缺口：乙'])
})

test('the usage (today) section and the panel section give the same calls, credits, peak share and cache hit per model; the basis line is in the panel only', async () => {
  const files = new Map([[USAGE_FILE, todays]])
  const priced = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now: localNoon, offsetMinutes: 480, ...statusOf(todays, creditPricing, localNoon.getTime()) })
  const usage = sectionOf(priced, '用量（今天）')
  const panel = sectionOf(priced, '面板')
  assert.equal(factsOf(usage).length, 4) // totals, two models, the model outside the plan
  assert.deepEqual(factsOf(usage), factsOf(panel))
  assert.ok(usage.every(line => line !== `- ${creditPricing.basis}`))
  assert.equal(panel.filter(line => line === `- ${creditPricing.basis}`).length, 1)
  assert.equal(priced.split(creditPricing.basis).length - 1, 1)

  const plain = await renderHourness(homes, { fs: fakeFs(files), now: localNoon, offsetMinutes: 480, ...statusOf(todays, undefined, localNoon.getTime()) })
  const note = '- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token'
  assert.equal(sectionOf(plain, '用量（今天）').filter(line => line === note).length, 1)
  assert.equal(sectionOf(plain, '面板').filter(line => line === note).length, 1)
  assert.deepEqual(factsOf(sectionOf(plain, '用量（今天）')), factsOf(sectionOf(plain, '面板')))
  assert.equal(factsOf(sectionOf(plain, '面板')).length, 4) // totals and three models
  assert.ok(!plain.includes('积分 '))
})

test('the panel starts with the peak line at the six moments of the acceptance; without a pricing service there is no peak line', async () => {
  const files = new Map([[USAGE_FILE, todays]])
  const firstLine = async (at: string, pricing: UsagePricing | undefined): Promise<string | undefined> =>
    sectionOf(await renderHourness(homes, { pricing, fs: fakeFs(files), now: new Date(at), offsetMinutes: 480, ...statusOf(todays, pricing, Date.parse(at)) }), '面板')[0]
  const moments: Array<[string, string]> = [
    ['2026-10-28T13:59:00+08:00', '不是高峰；下一个高峰 14:00'],
    ['2026-10-28T14:00:00+08:00', '高峰中，到 18:00'],
    ['2026-10-28T17:59:00+08:00', '高峰中，到 18:00'],
    ['2026-10-28T18:00:00+08:00', '不是高峰；下一个高峰 明天 14:00'],
    ['2026-10-30T18:00:00+08:00', '不是高峰；下一个高峰 周一 14:00'],
    ['2026-10-31T15:00:00+08:00', '不是高峰；下一个高峰 周一 14:00'],
  ]
  for (const [at, words] of moments) assert.equal(await firstLine(at, creditPricing), `- 高峰：${words}（GLM 积分套餐）`, at)
  const without = await firstLine('2026-10-28T15:00:00+08:00', undefined)
  assert.ok(without?.startsWith('- 没有计价服务'), String(without))
})

test('a peak function that throws or answers with something else leaves the peak line out, reports once, and the rest of the panel stays', async () => {
  const throwing = statusRow(new Map([[USAGE_FILE, todays]]), { pricing: { ...creditPricing, peak: () => { throw new Error('clock gone') } } })
  const odd = statusRow(new Map([[USAGE_FILE, todays]]), { pricing: { ...creditPricing, peak: (() => 'yes') as unknown as UsagePricing['peak'] } })
  for (const row of [throwing, odd]) {
    const result = await row.run()
    const lines = sectionOf(result.text, '面板')
    assert.ok(lines.every(line => !line.startsWith('- 高峰：')), lines.join('\n'))
    assert.ok(lines.some(line => line.startsWith('- 范围：')))
    assert.equal(row.warnings.filter(message => message.includes('peak line')).length, 1)
    row.dispose()
  }
})

test('the panel says how many records it read and from when, and that other clients are not in them', async () => {
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(new Map([[USAGE_FILE, journal]])), now: new Date('2026-10-31T20:00:00+08:00'), offsetMinutes: 480, ...statusOf(journal, creditPricing, Date.parse('2026-10-31T20:00:00+08:00')) })
  // Seven records are readable (one of them from before the usage-chunk fix); the first is Tuesday 10-27 15:00.
  assert.ok(sectionOf(text, '面板').includes(`- 范围：7 条用量记录，最早 10-27 15:00；${SCOPE_NOTE}`), text)
  const sameDay = await renderHourness(homes, { fs: fakeFs(new Map([[USAGE_FILE, todays]])), now: localNoon, offsetMinutes: -new Date(localAt(9)).getTimezoneOffset(), ...statusOf(todays, undefined, localNoon.getTime()) })
  assert.ok(sectionOf(sameDay, '面板').includes(`- 范围：4 条用量记录，最早 09:00；${SCOPE_NOTE}`), sameDay)
})

const GAP = { at: '2026-10-29T03:12:34.750Z', removed: 806, reason: '旧路由留下的记录，按用户要求删除', detail: 'glm/glm-5.3 796、glm/glm-5.3-flash 10', ref: 'docs/DESIGN.md §2.4' }

test('parseGaps reads the rows of the gap file that follow the table and counts the others', () => {
  const long = (length: number): string => 'x'.repeat(length)
  const valid = [
    GAP,
    { at: '2026-10-30T00:00:00Z', removed: 1, reason: 'r' },
    { at: '2026-10-30T00:00:00Z', removed: 10_000_000, reason: long(300), detail: long(300), ref: long(200), from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z', extra: 'ignored' },
    { at: '2026-10-30T00:00:00Z', removed: 2, reason: 'r', from: '2026-10-02T00:00:00Z', to: '2026-10-02T00:00:00Z' },
  ]
  const invalid: unknown[] = [
    { removed: 5, reason: 'r' },
    { at: 'not a time', removed: 5, reason: 'r' },
    { at: GAP.at, removed: 0, reason: 'r' },
    { at: GAP.at, removed: 1.5, reason: 'r' },
    { at: GAP.at, removed: 10_000_001, reason: 'r' },
    { at: GAP.at, removed: '5', reason: 'r' },
    { at: GAP.at, removed: 5 },
    { at: GAP.at, removed: 5, reason: '' },
    { at: GAP.at, removed: 5, reason: long(301) },
    { at: GAP.at, removed: 5, reason: 'r', detail: long(301) },
    { at: GAP.at, removed: 5, reason: 'r', detail: 7 },
    { at: GAP.at, removed: 5, reason: 'r', ref: long(201) },
    { at: GAP.at, removed: 5, reason: 'r', from: 'later' },
    { at: GAP.at, removed: 5, reason: 'r', from: '2026-10-03T00:00:00Z', to: '2026-10-02T00:00:00Z' },
    [1, 2],
    'text',
  ]
  const raw = [...valid, ...invalid].map(row => JSON.stringify(row)).concat(['{broken', '']).join('\n')
  const parsed = parseGaps(raw)
  assert.equal(parsed.gaps.length, valid.length)
  assert.equal(parsed.unreadable, invalid.length + 1)
  assert.deepEqual(parsed.gaps.map(gap => gap.removed), [806, 1, 10_000_000, 2], 'oldest first, by the time of the deletion; ties keep the file order')
  const first = parsed.gaps.at(0)
  assert.deepEqual(first, { at: Date.parse(GAP.at), removed: 806, reason: GAP.reason })
  assert.deepEqual(parseGaps(''), { gaps: [], unreadable: 0 })
})

test('the panel lists one line for each gap record, and one line for the records it cannot read', async () => {
  const gapFile = [JSON.stringify(GAP), '{broken', JSON.stringify({ at: GAP.at, removed: 0, reason: 'r' }), JSON.stringify({ at: '2026-10-30T09:30:00+08:00', removed: 12, reason: '换行\n的理由' })].join('\n')
  const files = new Map([[USAGE_FILE, journal], [GAP_FILE, gapFile]])
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now: new Date('2026-10-31T20:00:00+08:00'), offsetMinutes: 480, ...statusOf(journal, creditPricing, Date.parse('2026-10-31T20:00:00+08:00')) })
  const panel = sectionOf(text, '面板')
  const scope = panel.slice(panel.findIndex(line => line.startsWith('- 范围：')))
  assert.deepEqual(scope.slice(0, 4), [
    `- 范围：7 条用量记录，最早 10-27 15:00；${SCOPE_NOTE}`,
    '- 缺口：10-29 11:12 删去 806 条（旧路由留下的记录，按用户要求删除）；这些调用不在本节的数字里',
    '- 缺口：10-30 09:30 删去 12 条（换行 的理由）；这些调用不在本节的数字里',
    '- 无法读取的缺口记录 2 条，未列出',
  ])
  assert.ok(scope[4]?.startsWith('- 合计：积分'), scope[4])
  // Without a gap file there is no gap line and no line about unreadable ones.
  const clean = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(new Map([[USAGE_FILE, journal]])), now: new Date('2026-10-31T20:00:00+08:00'), offsetMinutes: 480, ...statusOf(journal, creditPricing, Date.parse('2026-10-31T20:00:00+08:00')) })
  assert.ok(sectionOf(clean, '面板').every(line => !line.startsWith('- 缺口：') && !line.includes('缺口记录')))
})

// The quota section: from the pricing service's `quota` member, three seconds at most.

const QUOTA_NOW = new Date('2026-10-31T20:00:00+08:00')
const VIEW: QuotaView = {
  reading: {
    at: Date.parse('2026-10-31T19:40:00+08:00'),
    level: 'max',
    windows: [{ name: 'five-hour', label: '5 小时', usedPercent: 41, resetAt: Date.parse('2026-10-31T21:30:00+08:00'), projection: { kind: 'none', reason: '读数不足' } }],
  },
  login: { state: 'ok' },
  pending: false,
}
const withQuota = (quota: unknown): UsagePricing => ({ ...creditPricing, quota } as UsagePricing)

/**
 * A real /hourness run over the row: the command reads the quota (three
 * seconds at most) and renders the entry it cached. Returns the whole text,
 * the 额度 section's lines and the row's warnings.
 */
async function quotaSectionOf(pricing: UsagePricing | undefined, usage: string = journal): Promise<{ text: string, lines: string[], warnings: string[] }> {
  const row = statusRow(new Map([[USAGE_FILE, usage]]), { pricing })
  try {
    const result = await row.run()
    return { text: result.text, lines: sectionOf(result.text, '额度'), warnings: row.warnings }
  }
  finally {
    row.dispose()
  }
}

test('the quota section is what the service\'s quota member returns, asked for at most three seconds; the panel keeps its numbers', async () => {
  const asked: unknown[] = []
  const { text, lines } = await quotaSectionOf(withQuota((request: unknown) => { asked.push(request); return Promise.resolve(VIEW) }))
  assert.deepEqual(asked, [{ waitMs: 3000 }])
  assert.deepEqual(lines, quotaLines(VIEW, QUOTA_NOW.getTime(), ZONE))
  assert.equal(lines[0], '额度（服务端读数，含 ZCode 等其他客户端，读于 19:40）：max')
  assert.equal(lines[1], '- 5 小时：已用 41% · 21:30 重置 · 不预估：读数不足')
  assert.ok(text.indexOf('## 面板') < text.indexOf('## 额度'))
  assert.ok(sectionOf(text, '面板').includes('- 合计：积分 5.30 · 高峰 53% · 缓存命中 53%'))
})

test('a pricing service without a quota member says so; without a pricing service there is no quota section', async () => {
  assert.deepEqual((await quotaSectionOf(creditPricing)).lines, ['额度：GLM 通道包没有提供额度数据'])
  assert.deepEqual((await quotaSectionOf(undefined)).lines, [])
  const bent = await quotaSectionOf(withQuota('later'))
  assert.deepEqual(bent.lines, ['额度：GLM 通道包没有提供额度数据'])
  assert.equal(bent.warnings.length, 1)
})

test('the quota section is there when the usage journal is empty: it is the server\'s reading, not the local records', async () => {
  const { text, lines } = await quotaSectionOf(withQuota(() => Promise.resolve(VIEW)), '')
  assert.ok(!text.includes('## 面板'))
  assert.deepEqual(lines, quotaLines(VIEW, QUOTA_NOW.getTime(), ZONE))
})

test('a quota member that rejects, answers with a non-object, or answers a view the lines cannot be made from prints one line and is reported; the panel is otherwise normal', async () => {
  const rejected = await quotaSectionOf(withQuota(() => Promise.reject(new Error('quota gone\nsecond line'))))
  assert.deepEqual(rejected.lines, ['额度：读取出错（quota gone second line）'])
  assert.ok(sectionOf(rejected.text, '面板').includes('- 合计：积分 5.30 · 高峰 53% · 缓存命中 53%'))
  assert.equal(rejected.warnings.length, 1)
  assert.deepEqual((await quotaSectionOf(withQuota(() => Promise.resolve(5)))).lines, ['额度：读取出错（返回的不是对象）'])
  assert.deepEqual((await quotaSectionOf(withQuota(() => Promise.resolve({ pending: false })))).lines.map(line => line.slice(0, 7)), ['额度：读取出错'])
  assert.deepEqual((await quotaSectionOf(withQuota(() => { throw new Error('sync') }))).lines, ['额度：读取出错（sync）'])
  assert.equal((await quotaSectionOf(withQuota(() => Promise.reject(new Error('x'.repeat(200)))))).lines.at(0)?.length, '额度：读取出错（）'.length + 80)
})

// --- the row's status view: the peak line, the usage list and the quota section as entries (status hub design 0.3 §3.2, §10) ---

/**
 * An apply whose row reads the journal through `read` (default: from `files`,
 * a missing file reading as ENOENT), with the clock pinned, `pricing`
 * provided (default the credit plan) and the row's warnings captured.
 */
function statusRow(files: Map<string, string>, options: { read?: (path: string) => string, pricing?: UsagePricing } = {}): {
  run: () => Promise<{ kind: string, text: string }>
  dispose: () => void
  store: ReturnType<typeof serviceStore>
  warnings: string[]
} {
  const store = serviceStore()
  if (options.pricing !== undefined) store.provide('glmHournessPricing', options.pricing)
  const commands: Registered[] = []
  const warnings: string[] = []
  const dispose = apply({
    commands: { register: definition => { commands.push(definition as Registered); return () => {} } },
    ...store,
    get: (name: string) => name === 'glmHournessData' ? { userHome: 'C:/u/glm-hourness' } : store.get(name),
  }, {
    readFile: options.read ?? (path => {
      const content = files.get(path)
      if (content === undefined) {
        const error = new Error('no such file') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
      return content
    }),
    now: () => QUOTA_NOW,
    offsetMinutes: 480,
  })
  const hourness = commands.find(command => command.name === 'hourness')
  assert.ok(hourness !== undefined)
  return {
    warnings,
    run: async () => {
      const warn = console.warn
      console.warn = (message: string) => { warnings.push(message) }
      try {
        return await hourness.handler(inSession())
      }
      finally {
        console.warn = warn
      }
    },
    dispose,
    store,
  }
}

test('the row provides glmHournessStatus/hourness and withdraws it on dispose; /hourness renders the 面板 section from the entry the collector reads back', async () => {
  const row = statusRow(new Map([[USAGE_FILE, journal]]), { pricing: creditPricing })
  const view = row.store.services.get(statusServiceName('hourness')) as { readonly items: (sessionId: string | undefined) => Array<{ id: string, text: string, detail?: readonly string[] }> }
  assert.ok(view !== undefined)
  const provided = view.items('s1')
  assert.deepEqual(provided.map(item => item.id), ['rules/peak', 'glm/usage']) // the quota entry waits for the row's first read
  assert.equal(provided[0]?.text, '- 高峰：不是高峰；下一个高峰 周一 14:00（GLM 积分套餐）')
  assert.equal(provided[1]?.detail?.at(0), '- glm-5.3：3 次 · 积分 4.70 · 高峰 60% · 缓存命中 57%')
  const result = await row.run()
  assert.equal(result.kind, 'success')
  // The command read the quota; the view now serves all three entries.
  assert.deepEqual(view.items('s1').map(item => item.id), ['rules/peak', 'glm/quota', 'glm/usage'])
  assert.equal(view.items('s1').find(item => item.id === 'glm/quota')?.text, '额度：GLM 通道包没有提供额度数据')
  // The sections are the entries with their layout around them: the same lines the entries carry.
  assert.ok(sectionOf(result.text, '面板').includes('- 高峰：不是高峰；下一个高峰 周一 14:00（GLM 积分套餐）'), result.text)
  assert.ok(sectionOf(result.text, '面板').includes('- 合计：积分 5.30 · 高峰 53% · 缓存命中 53%'), result.text)
  assert.ok(sectionOf(result.text, '面板').includes(`- 范围：7 条用量记录，最早 10-27 15:00；${SCOPE_NOTE}`), result.text)
  row.dispose()
  assert.equal(row.store.services.get(statusServiceName('hourness')), undefined)
})

test('a journal that is not there yet is no entry and no section; one that cannot be read takes the placeholder and warns once', async () => {
  const missing = await statusRow(new Map(), { pricing: creditPricing }).run()
  assert.equal(missing.kind, 'success')
  assert.ok(!missing.text.includes('## 面板'), missing.text)
  const blocked = statusRow(new Map(), { pricing: creditPricing, read: () => {
    const error = new Error('access denied') as NodeJS.ErrnoException
    error.code = 'EPERM'
    throw error
  } })
  const result = await blocked.run()
  assert.ok(result.text.includes('## 面板\nhourness 行的状态暂时读不到：access denied'), result.text)
  assert.equal(blocked.warnings.filter(message => message.startsWith('dsh-glm-hourness/hourness: 状态读取失败')).length, 1)
  blocked.dispose()
})

test('the hourness row yields its peak half while the rules row status view is there: one rules/peak entry, the rules row words', async () => {
  const row = statusRow(new Map([[USAGE_FILE, journal]]), { pricing: creditPricing })
  const provide = provideRowStatus(row.store, 'rules', () => [{
    id: 'rules/peak',
    owner: 'rules',
    audience: 'agent',
    asOf: new Date(QUOTA_NOW).toISOString(),
    source: 'glmHournessStatus/rules',
    text: '- 高峰：规则行在管这一条（少做）',
  }])
  try {
    const view = row.store.services.get(statusServiceName('hourness')) as { readonly items: (sessionId: string | undefined) => Array<{ id: string, text: string }> }
    assert.deepEqual(view.items('s1').map(item => item.id), ['glm/usage'], 'the peak half yields, the quota entry still waits for the first read')
    const result = await row.run()
    assert.equal(result.kind, 'success')
    const panel = sectionOf(result.text, '面板')
    assert.ok(panel.includes('- 高峰：规则行在管这一条（少做）'), result.text)
    assert.ok(!panel.some(line => line.startsWith('- 高峰：不是高峰')), result.text)
    const collected = collectStatus(row.store, 's1', 'agent', QUOTA_NOW.getTime())
    assert.deepEqual(collected.items.filter(item => item.id === 'rules/peak').map(item => item.text), ['- 高峰：规则行在管这一条（少做）'])
    assert.equal(collected.rows.find(entry => entry.row === 'rules')?.outcome, 'ok')
  }
  finally {
    provide.dispose()
    row.dispose()
  }
})
