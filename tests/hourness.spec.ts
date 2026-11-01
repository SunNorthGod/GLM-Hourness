import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { apply, renderHourness } from '../src/report/index.ts'
import { cacheHitRate, usagePanel, usagePanelLines } from '../src/report/panel.ts'
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

const journal = [
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
].map(record => JSON.stringify(record)).concat(['{broken json', '']).join('\n')

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
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now })
  assert.ok(text.includes('# 晨报 2026-10-27'))
  assert.ok(text.includes('- 派遣类调用 1 次')) // yesterday's call (written with a level) filtered out
  assert.ok(!/L[123]/.test(text), text)
  assert.ok(!text.includes('yesterday must not leak in'))
  // The panel reads the full journal on the credit basis: 0.0945 off-peak
  // (02:00, half of 0.189) plus 0.0189 in peak (Tuesday 15:00).
  assert.ok(text.includes('## 面板\n- 全部用量记录；'))
  assert.ok(text.includes('- 合计：积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(text.includes('- glm-5.3：2 次 · 积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(!text.includes('## 数据目录'))
  // Without the pricing service the same journal lists calls and tokens.
  const plain = await renderHourness(homes, { fs: fakeFs(files), now })
  assert.ok(plain.includes('## 面板\n- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token\n- 合计：2 次 · 未命中输入 110 · 缓存读 0 · 缓存写 0 · 输出 55 · 缓存命中 0%'))
  assert.ok(!plain.includes('积分 0.11'))
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
