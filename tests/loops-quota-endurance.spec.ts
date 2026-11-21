/**
 * The endurance mapping and wording (src/loops/quota-endurance.ts): the
 * usage journal's records become the shared judgment's facts, and the
 * judgment's kinds become the lines the loop board, the morning report and
 * the channel's exhausts event read. The judgment itself is shared/quota.ts
 * (tested in tests/quota.spec.ts); this spec pins the mapping, the two
 * sizes this file fixes (the rule and the window lengths) and the wording.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { QUOTA_ENDURANCE_RULE, WINDOW_LENGTHS, quotaEnduranceLines, quotaUsageFactsOfText, windowEnduranceOf } from '../src/loops/quota-endurance.ts'
import type { QuotaWindowView } from '../src/shared/quota.ts'

const at = (iso: string): number => Date.parse(iso)
const ZONE = { offsetMinutes: 480 }
// 2026-10-28 is a Wednesday.
const NOW = at('2026-10-28T17:02:00+08:00')

const windowOf = (name: 'five-hour' | 'weekly', label: string, usedPercent: number | undefined, resetAt: number | undefined): QuotaWindowView =>
  ({ name, label, ...(usedPercent === undefined ? {} : { usedPercent }), ...(resetAt === undefined ? {} : { resetAt }), projection: { kind: 'none', reason: '' } })

const fiveHour = (usedPercent: number | undefined, resetAt: number | undefined): QuotaWindowView => windowOf('five-hour', '5 小时', usedPercent, resetAt)

const record = (atIso: string, model: string, usage: unknown): string =>
  JSON.stringify({ at: atIso, provider: model.startsWith('glm') ? 'glm-zcode' : 'deepseek-account', model, usage })

/** The three GLM records of the rate example in quota.spec.ts: 500 at 12:10, 800 at 16:40, 2700 at 17:00 — 35% lasts to the reset. */
const LASTS_TEXT = [
  record('2026-10-28T12:10:00+08:00', 'glm-5.3', { inputTokens: 500, outputTokens: 0 }),
  record('2026-10-28T16:40:00+08:00', 'glm-5.3', { inputTokens: 700, outputTokens: 100 }),
  record('2026-10-28T17:00:00+08:00', 'glm-5.3', { inputTokens: 2700, outputTokens: 0 }),
].join('\n')

test('QUOTA_ENDURANCE_RULE and WINDOW_LENGTHS are the sizes every reader judges by', () => {
  assert.deepEqual(QUOTA_ENDURANCE_RULE, { exhaustPercent: 100, lightPercent: 50 })
  assert.deepEqual(WINDOW_LENGTHS, {
    'five-hour': { lengthMs: 5 * 3_600_000, speed: '5 小时' },
    weekly: { lengthMs: 7 * 86_400_000, speed: '7 天' },
  })
})

test('quotaUsageFactsOfText maps the journal\'s lines onto facts by the lm-min vocabulary: input counts the main input, cache reads and writes count toward no sum', () => {
  const text = [
    record('2026-10-28T16:40:00+08:00', 'glm-5.3', { inputTokens: 700, cacheReadTokens: 4000, cacheWriteTokens: 200, outputTokens: 100, totalTokens: 5000 }),
    record('2026-10-28T16:50:00+08:00', 'deepseek-flash', { inputTokens: 900, outputTokens: 10 }),
    '{broken json',
    '',
    record('2026-10-28T16:55:00+08:00', 'glm-5.3', undefined),
    record('2026-10-28T17:03:00+08:00', 'glm-5.3', { inputTokens: 50, outputTokens: 5 }),
    record('2026-10-28T16:58:00+08:00', 'glm-5.3', { inputTokens: 'many', outputTokens: 5 }),
    '5',
    record('2026-10-28T16:59:00+08:00', 'glm-5.3', { inputTokens: 10, outputTokens: 1 }).replace('"at"', '"taken"'),
  ].join('\n')
  assert.deepEqual(quotaUsageFactsOfText(text, NOW), [
    { at: at('2026-10-28T16:40:00+08:00'), input: 700, output: 100 },
    { at: at('2026-10-28T16:55:00+08:00'), input: 0 },
    { at: at('2026-10-28T16:58:00+08:00'), input: 0, output: 5 },
  ], 'the other family, the broken line, the future record, the bare number and the record without a time are skipped; an input that is not a number counts as 0')
})

test('quotaUsageFactsOfText: an empty or all-foreign journal is no facts', () => {
  assert.deepEqual(quotaUsageFactsOfText('', NOW), [])
  assert.deepEqual(quotaUsageFactsOfText(record('2026-10-28T16:40:00+08:00', 'deepseek-flash', { inputTokens: 5, outputTokens: 1 }), NOW), [])
})

test('windowEnduranceOf: the five-hour window rates over five hours and the weekly one over seven, by the shared judgment', () => {
  // The same numbers quota.spec.ts nails for quotaRateOf: 4000 tokens over 5 hours, the 3500 inside the period are the 35% of the reading.
  const reset = at('2026-10-28T21:32:00+08:00')
  const facts = quotaUsageFactsOfText(LASTS_TEXT, NOW)
  assert.deepEqual(windowEnduranceOf(fiveHour(35, reset), facts, NOW), { kind: 'lasts', percentAtReset: 71 }, '35 + 8 × the 4.5 hours to the reset')
  // The weekly numbers of quota.spec.ts: 8400 tokens over 168 hours, 0.5 per hour.
  const weekReset = at('2026-11-02T10:00:00+08:00')
  const weekFacts = quotaUsageFactsOfText([
    record('2026-10-23T12:00:00+08:00', 'glm-5.3', { inputTokens: 7000, outputTokens: 0 }),
    record('2026-10-27T12:00:00+08:00', 'glm-5.3', { inputTokens: 1400, outputTokens: 0 }),
    record('2026-10-20T12:00:00+08:00', 'glm-5.3', { inputTokens: 999, outputTokens: 0 }),
  ].join('\n'), NOW)
  const week = windowEnduranceOf(windowOf('weekly', '每周', 14, weekReset), weekFacts, NOW)
  assert.ok(week.kind === 'lasts')
  assert.ok(Math.abs(week.percentAtReset - (14 + 0.5 * (weekReset - NOW) / 3_600_000)) < 0.01, JSON.stringify(week))
})

test('windowEnduranceOf: a window the judgment does not run for, or one without the data, is 待数据', () => {
  const facts = quotaUsageFactsOfText(record('2026-10-28T17:00:00+08:00', 'glm-5.3', { inputTokens: 100, outputTokens: 0 }), NOW)
  const mcp: QuotaWindowView = { name: 'mcp', label: 'MCP 工具调用', usedPercent: 50, resetAt: at('2026-10-28T21:30:00+08:00'), projection: { kind: 'none', reason: '' } }
  assert.deepEqual(windowEnduranceOf(mcp, facts, NOW), { kind: 'pending', reason: '读数不足' })
  assert.deepEqual(windowEnduranceOf(fiveHour(40, undefined), facts, NOW), { kind: 'pending', reason: '读数不足' })
  assert.deepEqual(windowEnduranceOf(fiveHour(0, at('2026-10-28T21:30:00+08:00')), facts, NOW), { kind: 'pending', reason: '本窗口还没有消耗' })
  assert.deepEqual(windowEnduranceOf(fiveHour(40, at('2026-10-28T21:30:00+08:00')), [], NOW), { kind: 'pending', reason: '没有可计的用量记录' })
})

test('quotaEnduranceLines: 撑不到 and 用得太少 word the share, the reset and the average pace; 撑得到 says nothing', () => {
  // One fact inside the period that began an hour ago: the steady share reads as 17 per hour, 153 at the reset four hours ahead.
  const facts = quotaUsageFactsOfText(record('2026-10-28T16:02:00+08:00', 'glm-5.3', { inputTokens: 1000, outputTokens: 0 }), NOW)
  const reset = at('2026-10-28T21:02:00+08:00')
  assert.deepEqual(quotaEnduranceLines([fiveHour(85, reset)], facts, NOW, ZONE), ['5 小时额度撑不到重置，已用 85%，到 21:02 重置，照 5 小时平均速度预计到时约 153%'])
  const light = quotaUsageFactsOfText(record('2026-10-28T16:02:00+08:00', 'glm-5.3', { inputTokens: 100, outputTokens: 0 }), NOW)
  assert.deepEqual(quotaEnduranceLines([fiveHour(20, reset)], light, NOW, ZONE), ['5 小时额度用得太少，已用 20%，到 21:02 重置，照 5 小时平均速度预计到时约 36%'])
  assert.deepEqual(quotaEnduranceLines([fiveHour(35, at('2026-10-28T21:32:00+08:00'))], quotaUsageFactsOfText(LASTS_TEXT, NOW), NOW, ZONE), [], '撑得到 is said by the reading\'s own lines')
})

test('quotaEnduranceLines: the weekly window words its seven-day pace, and the windows the judgment skips stay out', () => {
  // One fact an hour back: inside both periods, it reads as the share of the reading per hour on each window's own scale.
  const facts = quotaUsageFactsOfText(record('2026-10-28T16:02:00+08:00', 'glm-5.3', { inputTokens: 1000, outputTokens: 0 }), NOW)
  const reset = at('2026-10-28T21:02:00+08:00')
  const weeklyReset = at('2026-10-28T18:02:00+08:00')
  assert.deepEqual(quotaEnduranceLines([mcpWindow(weeklyReset), fiveHour(85, reset)], facts, NOW, ZONE), ['5 小时额度撑不到重置，已用 85%，到 21:02 重置，照 5 小时平均速度预计到时约 153%'], 'the MCP window is no line, in no direction')
  assert.deepEqual(quotaEnduranceLines([windowOf('weekly', '每周', 5, weeklyReset)], quotaUsageFactsOfText(record('2026-10-28T15:02:00+08:00', 'glm-5.3', { inputTokens: 100, outputTokens: 0 }), NOW), NOW, ZONE), ['每周额度用得太少，已用 5%，到 18:02 重置，照 7 天平均速度预计到时约 5%'])
})

const mcpWindow = (resetAt: number): QuotaWindowView => ({ name: 'mcp', label: 'MCP 工具调用', usedPercent: 50, resetAt, projection: { kind: 'none', reason: '' } })

test('quotaEnduranceLines: 待数据 lines name the reason, in the windows\' order', () => {
  const reset = at('2026-10-28T21:02:00+08:00')
  assert.deepEqual(quotaEnduranceLines([fiveHour(85, reset), windowOf('weekly', '每周', 5, reset)], [], NOW, ZONE), [
    '5 小时额度判定待数据：没有可计的用量记录',
    '每周额度判定待数据：没有可计的用量记录',
  ])
  assert.deepEqual(quotaEnduranceLines([fiveHour(0, reset)], [], NOW, ZONE), ['5 小时额度判定待数据：本窗口还没有消耗'])
})
