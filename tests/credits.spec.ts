import assert from 'node:assert/strict'
import test from 'node:test'
import { chargedCredits, CREDIT_RATES, creditPricing, creditRate, fullCredits, PEAK_END_LABEL, PEAK_HOURS, peakWindowAt } from '../src/glm-llm/credits.ts'

// The GLM credit formula (docs/FACTS.md §2.4). The usage panel that prices
// a journal with it through the pricing service is in tests/hourness.spec.ts.

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

test('the peak hours text and the end label are frozen constants; the pricing service carries the text and keeps its basis byte for byte', () => {
  assert.deepEqual(PEAK_HOURS, { en: 'weekdays 14:00-18:00 UTC+8', zh: '工作日 14:00–18:00（UTC+8）' })
  assert.ok(Object.isFrozen(PEAK_HOURS))
  assert.equal(PEAK_END_LABEL, '18:00')
  assert.equal(creditPricing.basis, '全部用量记录；高峰为工作日 14:00–18:00（UTC+8），其余时段按 50% 计积分；高峰占比按积分计')
  assert.equal(creditPricing.peakHours, PEAK_HOURS)
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
