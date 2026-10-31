import assert from 'node:assert/strict'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { apply, renderHourness } from '../src/report/index.ts'
import { cacheHitRate, parseGaps, usagePanel, usagePanelLines, usagePanelOf, type PanelLineOptions } from '../src/report/panel.ts'
import type { UsagePricing } from '../src/shared/pricing.ts'
import { quotaLines, type QuotaView } from '../src/shared/quota.ts'

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
      JSON.stringify({ at: '2026-10-27T01:00:00+08:00', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' }),
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', level: 'L3', kind: 'model-route', subject: 'yesterday must not leak in' }),
    ].join('\n')],
    ['C:/u/glm-hourness/audit/usage.jsonl', [
      JSON.stringify({ at: '2026-10-27T02:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }),
      JSON.stringify({ at: '2026-10-27T15:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }),
    ].join('\n')],
  ])
  const now = new Date('2026-10-27T20:00:00+08:00')
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now, offsetMinutes: 480 })
  assert.ok(text.includes('# 晨报 2026-10-27'))
  assert.ok(text.includes('L1 自主 1 · L2 次日报备 0 · L3 当次申报 0')) // yesterday's L3 filtered out
  assert.ok(!text.includes('yesterday must not leak in'))
  // The panel reads the full journal on the credit basis: 0.0945 off-peak
  // (02:00, half of 0.189) plus 0.0189 in peak (Tuesday 15:00). Its first line is the peak line.
  assert.ok(text.includes('## 面板\n- 高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）\n- 全部用量记录；'))
  assert.ok(text.includes('- 合计：积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(text.includes('- glm-5.3：2 次 · 积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(!text.includes('## 数据目录'))
  // Without the pricing service the same journal lists calls and tokens, and has no peak line.
  const plain = await renderHourness(homes, { fs: fakeFs(files), now, offsetMinutes: 480 })
  assert.ok(plain.includes('## 面板\n- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token\n- 范围：2 条用量记录，最早 02:00；只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内\n- 合计：2 次 · 未命中输入 110 · 缓存读 0 · 缓存写 0 · 输出 55 · 缓存命中 0%'))
  assert.ok(!plain.includes('积分 0.11'))
  assert.ok(!plain.includes('高峰：'))
})

test('empty journal still renders the clean report', async () => {
  const text = await renderHourness(homes, { fs: fakeFs(new Map()) })
  assert.ok(text.includes('- 无'))
  assert.ok(!text.includes('## 数据目录'))
})

test('a missing directory is named in the report', async () => {
  const noUser = await renderHourness({ projectHome: 'C:/ws/.llm' }, { fs: fakeFs(new Map()) })
  assert.ok(noUser.includes('## 数据目录\n- 用户级目录不可用（数据目录行 glm-hourness/data 未启用），用量流水读不到'))
  const none = await renderHourness({}, { fs: fakeFs(new Map()) })
  assert.ok(none.includes('- 项目目录未配置'))
  assert.ok(none.includes('- 用户级目录不可用'))
})

type Registered = { name: string, handler: (invocation: { rawInput: string }) => Promise<{ kind: string, text: string }> }

function register(config: { home?: string }, data: unknown): { registered: Registered[], dispose: () => void } {
  const registered: Registered[] = []
  const dispose = apply({
    commands: { register: definition => { registered.push(definition as Registered); return () => {} } },
    get: name => name === 'glmHournessData' ? data : undefined,
  }, config)
  return { registered, dispose }
}

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
  const priced = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now: localNoon, offsetMinutes: 480 })
  const usage = sectionOf(priced, '用量（今天）')
  const panel = sectionOf(priced, '面板')
  assert.equal(factsOf(usage).length, 4) // totals, two models, the model outside the plan
  assert.deepEqual(factsOf(usage), factsOf(panel))
  assert.ok(usage.every(line => line !== `- ${creditPricing.basis}`))
  assert.equal(panel.filter(line => line === `- ${creditPricing.basis}`).length, 1)
  assert.equal(priced.split(creditPricing.basis).length - 1, 1)

  const plain = await renderHourness(homes, { fs: fakeFs(files), now: localNoon, offsetMinutes: 480 })
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
    sectionOf(await renderHourness(homes, { pricing, fs: fakeFs(files), now: new Date(at), offsetMinutes: 480 }), '面板')[0]
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
  const files = new Map([[USAGE_FILE, todays]])
  const problems: string[] = []
  const run = async (pricing: UsagePricing): Promise<string[]> =>
    sectionOf(await renderHourness(homes, { pricing, problem: message => { problems.push(message) }, fs: fakeFs(files), now: localNoon, offsetMinutes: 480 }), '面板')
  const throwing = await run({ ...creditPricing, peak: () => { throw new Error('clock gone') } })
  const odd = await run({ ...creditPricing, peak: (() => 'yes') as unknown as UsagePricing['peak'] })
  for (const lines of [throwing, odd]) {
    assert.ok(lines.every(line => !line.startsWith('- 高峰：')), lines.join('\n'))
    assert.ok(lines.some(line => line.startsWith('- 范围：')))
  }
  assert.ok(problems.some(message => message.includes('peak line')), problems.join('\n'))
})

test('the panel says how many records it read and from when, and that other clients are not in them', async () => {
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(new Map([[USAGE_FILE, journal]])), now: new Date('2026-10-31T20:00:00+08:00'), offsetMinutes: 480 })
  // Seven records are readable (one of them from before the usage-chunk fix); the first is Tuesday 10-27 15:00.
  assert.ok(sectionOf(text, '面板').includes(`- 范围：7 条用量记录，最早 10-27 15:00；${SCOPE_NOTE}`), text)
  const sameDay = await renderHourness(homes, { fs: fakeFs(new Map([[USAGE_FILE, todays]])), now: localNoon, offsetMinutes: -new Date(localAt(9)).getTimezoneOffset() })
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
  const text = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(files), now: new Date('2026-10-31T20:00:00+08:00'), offsetMinutes: 480 })
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
  const clean = await renderHourness(homes, { pricing: creditPricing, fs: fakeFs(new Map([[USAGE_FILE, journal]])), now: new Date('2026-10-31T20:00:00+08:00'), offsetMinutes: 480 })
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
const quotaTextOf = async (pricing: UsagePricing | undefined, problems: string[] = [], usage = journal): Promise<string[]> =>
  sectionOf(await renderHourness(homes, { pricing, problem: message => { problems.push(message) }, fs: fakeFs(new Map([[USAGE_FILE, usage]])), now: QUOTA_NOW, offsetMinutes: 480 }), '额度')

test('the quota section is what the service\'s quota member returns, asked for at most three seconds; the panel keeps its numbers', async () => {
  const asked: unknown[] = []
  const pricing = withQuota((request: unknown) => { asked.push(request); return Promise.resolve(VIEW) })
  const text = await renderHourness(homes, { pricing, fs: fakeFs(new Map([[USAGE_FILE, journal]])), now: QUOTA_NOW, offsetMinutes: 480 })
  assert.deepEqual(asked, [{ waitMs: 3000 }])
  assert.deepEqual(sectionOf(text, '额度'), quotaLines(VIEW, QUOTA_NOW.getTime(), ZONE))
  assert.equal(sectionOf(text, '额度')[0], '额度（服务端读数，含 ZCode 等其他客户端，读于 19:40）：max')
  assert.equal(sectionOf(text, '额度')[1], '- 5 小时：已用 41% · 21:30 重置 · 不预估：读数不足')
  assert.ok(text.indexOf('## 面板') < text.indexOf('## 额度'))
  assert.ok(sectionOf(text, '面板').includes('- 合计：积分 5.30 · 高峰 53% · 缓存命中 53%'))
})

test('a pricing service without a quota member says so; without a pricing service there is no quota section', async () => {
  assert.deepEqual(await quotaTextOf(creditPricing), ['额度：GLM 通道包没有提供额度数据'])
  assert.deepEqual(await quotaTextOf(undefined), [])
  const bent: string[] = []
  assert.deepEqual(await quotaTextOf(withQuota('later'), bent), ['额度：GLM 通道包没有提供额度数据'])
  assert.equal(bent.length, 1)
})

test('the quota section is there when the usage journal is empty: it is the server\'s reading, not the local records', async () => {
  const text = await renderHourness(homes, { pricing: withQuota(() => Promise.resolve(VIEW)), fs: fakeFs(new Map()), now: QUOTA_NOW, offsetMinutes: 480 })
  assert.ok(!text.includes('## 面板'))
  assert.deepEqual(sectionOf(text, '额度'), quotaLines(VIEW, QUOTA_NOW.getTime(), ZONE))
})

test('a quota member that rejects, answers with a non-object, or answers a view the lines cannot be made from prints one line and is reported; the panel is otherwise normal', async () => {
  const problems: string[] = []
  const rejected = withQuota(() => Promise.reject(new Error('quota gone\nsecond line')))
  const texts = await Promise.all([
    renderHourness(homes, { pricing: rejected, problem: message => { problems.push(message) }, fs: fakeFs(new Map([[USAGE_FILE, journal]])), now: QUOTA_NOW, offsetMinutes: 480 }),
  ])
  assert.deepEqual(sectionOf(texts[0] ?? '', '额度'), ['额度：读取出错（quota gone second line）'])
  assert.ok(sectionOf(texts[0] ?? '', '面板').includes('- 合计：积分 5.30 · 高峰 53% · 缓存命中 53%'))
  assert.equal(problems.length, 1)
  assert.deepEqual(await quotaTextOf(withQuota(() => Promise.resolve(5))), ['额度：读取出错（返回的不是对象）'])
  assert.deepEqual(await quotaTextOf(withQuota(() => Promise.resolve({ pending: false }))).then(lines => lines.map(line => line.slice(0, 7))), ['额度：读取出错'])
  assert.deepEqual(await quotaTextOf(withQuota(() => { throw new Error('sync') })), ['额度：读取出错（sync）'])
  assert.equal((await quotaTextOf(withQuota(() => Promise.reject(new Error('x'.repeat(200)))))).at(0)?.length, '额度：读取出错（）'.length + 80)
})
