import assert from 'node:assert/strict'
import test from 'node:test'
import { chargedCredits, CREDIT_RATES, creditRate, fullCredits, peakWindowAt } from '../src/shared/credits.ts'
import { cacheHitRate, usagePanel, usagePanelLines } from '../src/ui/panel.ts'

const at = (iso: string): number => Date.parse(iso)
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('peak windows are weekdays 14:00-18:00 UTC+8, named by their UTC+8 date', () => {
  // 2026-10-28 is a Wednesday.
  assert.equal(peakWindowAt(at('2026-10-28T13:59:59+08:00')), undefined)
  assert.equal(peakWindowAt(at('2026-10-28T14:00:00+08:00')), '2026-10-28')
  assert.equal(peakWindowAt(at('2026-10-28T17:59:59+08:00')), '2026-10-28')
  assert.equal(peakWindowAt(at('2026-10-28T18:00:00+08:00')), undefined)
  assert.equal(peakWindowAt(at('2026-10-28T06:30:00Z')), '2026-10-28') // 14:30 UTC+8, whatever the host zone
  assert.equal(peakWindowAt(at('2026-10-30T15:00:00+08:00')), '2026-10-30') // Friday
  assert.equal(peakWindowAt(at('2026-10-31T15:00:00+08:00')), undefined) // Saturday
  assert.equal(peakWindowAt(at('2026-11-01T15:00:00+08:00')), undefined) // Sunday
  assert.equal(peakWindowAt(at('2026-11-02T14:30:00+08:00')), '2026-11-02') // Monday
  assert.equal(peakWindowAt(Number.NaN), undefined)
})

test('credits follow the FACTS.md 2.4 formula; off-peak calls are charged half, cache writes as input', () => {
  assert.deepEqual([...CREDIT_RATES.keys()], ['glm-5.3', 'glm-5.3-flash'])
  const glm = creditRate('GLM-5.3')!
  const flash = creditRate('glm-5.3-flash')!
  assert.equal(creditRate('deepseek-flash'), undefined)
  // (1000 × 6.9 + 4000 × 1.7 + 500 × 24) / 10000 = 2.57
  const cached = { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 }
  close(fullCredits(glm, cached), 2.57)
  close(chargedCredits(glm, cached, at('2026-10-28T15:00:00+08:00')), 2.57)
  close(chargedCredits(glm, cached, at('2026-10-28T10:00:00+08:00')), 1.285)
  // ((1000 + 500) × 2.3 + 1000 × 0.56 + 1000 × 8) / 10000 = 1.201, Saturday afternoon is off-peak
  const written = { inputTokens: 1000, cacheReadTokens: 1000, cacheWriteTokens: 500, outputTokens: 1000 }
  close(fullCredits(flash, written), 1.201)
  close(chargedCredits(flash, written, at('2026-10-31T15:00:00+08:00')), 0.6005)
})

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

test('the usage panel prices each model in charged credits with its peak part and token counts', () => {
  const panel = usagePanel(journal)
  assert.deepEqual(panel.models.map(model => [model.model, model.calls]), [['glm-5.3', 3], ['glm-5.3-flash', 1]])
  const [glm, flash] = panel.models
  assert.ok(glm !== undefined && flash !== undefined)
  close(glm.credits, 2.57 + 1.89 + 0.24)
  close(glm.peakCredits, 2.57 + 0.24)
  assert.deepEqual([glm.inputTokens, glm.cacheReadTokens, glm.cacheWriteTokens, glm.outputTokens], [3000, 4000, 0, 1600])
  close(flash.credits, 0.6005)
  assert.equal(flash.peakCredits, 0)
  close(cacheHitRate(glm)!, 4000 / 7000)
  close(cacheHitRate(flash)!, 1000 / 2500)
  assert.equal(cacheHitRate({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5 }), undefined)
  assert.deepEqual(panel.unpriced, [{ model: 'deepseek-flash', calls: 2 }])
  assert.equal(panel.preFix, 1)
  assert.equal(panel.unreadable, 2)
})

test('the panel lines give totals, per-model credits, peak share by credits, cache hit rate and what was left out', () => {
  assert.deepEqual(usagePanelLines(usagePanel(journal)), [
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

test('a journal with no priced call shows zero credits and nothing else invented', () => {
  const lines = usagePanelLines(usagePanel(JSON.stringify({ at: '2026-10-28T15:00:00+08:00', provider: 'deepseek-account', model: 'deepseek-flash', usage: { inputTokens: 1, outputTokens: 1 } })))
  assert.deepEqual(lines.slice(1), ['- 合计：积分 0.00', '- 不计积分（不在 GLM 积分套餐内）：deepseek-flash 1 次'])
})
