/**
 * The statistics reader (src/guard/measure.ts ruleStats, m4-gate G2, design
 * §3.3, §3.10): per rule the denial count by origin, the four follow-up
 * counts and the most recent denial's look; for the whole journal the gap
 * records' totals. A late denial counts as a denial, a deferral and a
 * record-only call do not count, and `since` bounds the period by ISO
 * instant or by days before now — the one function the morning report, the
 * command line and the rules page read.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { ruleStats, sinceCutoff, SUBJECT_LIMIT } from '../src/guard/measure.ts'
import type { GuardRecord } from '../src/guard/records.ts'

const NOW = new Date('2026-11-03T12:00:00Z')

const denial = (rule: string, at: string, over: Partial<GuardRecord> = {}): GuardRecord => ({
  at,
  rule,
  tool: 'Write',
  scope: 'dialect',
  correction: 'no',
  ...over,
} as GuardRecord)

const followup = (rule: string, at: string, outcome: 'right-path' | 'repeat' | 'other' | 'none'): GuardRecord => ({
  at,
  rule,
  tool: 'read',
  scope: 'dialect',
  kind: 'followup',
  denial: 'k',
  outcome,
} as unknown as GuardRecord)

test('ruleStats counts denials by rule and origin, follow-ups by outcome, and keeps the latest denial', () => {
  const stats = ruleStats([
    denial('one', '2026-11-01T09:00:00Z'),
    denial('one', '2026-11-02T09:00:00Z', { scope: 'other' }),
    denial('one', '2026-11-03T09:00:00Z', { tool: 'Bash', call: { tool: 'pwsh', command: 'Set-Content -Path a.txt -Value x' } }),
    followup('one', '2026-11-03T09:05:00Z', 'repeat'),
    followup('one', '2026-11-03T09:06:00Z', 'other'),
    followup('one', '2026-11-03T09:07:00Z', 'none'),
    followup('two', '2026-11-03T09:08:00Z', 'right-path'),
  ], { now: NOW })
  const one = stats.rules.get('one')
  assert.ok(one !== undefined)
  assert.deepEqual(one.denials, { dialect: 2, other: 1 })
  assert.deepEqual(one.followups, { 'right-path': 0, repeat: 1, other: 1, none: 1 })
  assert.deepEqual(one.last, { at: '2026-11-03T09:00:00Z', tool: 'Bash', subject: 'Set-Content -Path a.txt -Value x' })
  const two = stats.rules.get('two')
  assert.ok(two !== undefined)
  assert.deepEqual([two.denials.dialect + two.denials.other, two.followups['right-path']], [0, 1], 'a follow-up whose denial sits outside the period still counts')
})

test('ruleStats keeps at most 60 characters of the command or target, and prefers the command over the target', () => {
  const long = 'x'.repeat(100)
  const stats = ruleStats([
    denial('one', '2026-11-01T09:00:00Z', { call: { tool: 'write', target: long } }),
    denial('one', '2026-11-02T09:00:00Z', { call: { tool: 'pwsh', command: `short ${long}` } }),
  ], { now: NOW })
  assert.equal(stats.rules.get('one')?.last?.subject?.length, SUBJECT_LIMIT)
  assert.ok(stats.rules.get('one')?.last?.subject?.startsWith('short '), 'the latest denial is the command one')
})

test('ruleStats reads the rules board\'s records the way the morning report does: a late denial counts, a deferral and a record-only call do not', () => {
  const stats = ruleStats([
    { at: '2026-11-01T09:00:00Z', rule: 'rules:p-1', tool: 'pwsh', mode: 'enforce', effect: 'block', correction: 'no', signals: {} },
    { at: '2026-11-01T09:01:00Z', rule: 'rules:p-1', tool: 'pwsh', mode: 'enforce', effect: 'queue', correction: 'no', signals: {} },
    { at: '2026-11-01T09:02:00Z', rule: 'rules:p-1', tool: 'pwsh', mode: 'record', effect: 'record', signals: {} },
    { at: '2026-11-01T09:03:00Z', rule: 'file-tools-only', tool: 'pwsh', mode: 'late', via: 'turn-end', turn: 1, sessionId: 's', paths: ['a'], calls: [] },
  ] as unknown as readonly GuardRecord[], { now: NOW })
  assert.deepEqual(stats.rules.get('rules:p-1')?.denials, { dialect: 1, other: 0 }, 'the block is a denial, the queue and the record are not')
  assert.deepEqual(stats.rules.get('file-tools-only')?.denials, { dialect: 1, other: 0 }, 'the late denial counts as a denial')
  assert.equal(stats.rules.size, 2)
})

test('ruleStats sums the gap records into unrecorded, with the latest until', () => {
  const stats = ruleStats([
    denial('one', '2026-11-01T09:00:00Z'),
    { kind: 'gap', at: '2026-11-01T10:00:00Z', row: 'guard', lost: 2, classes: { denial: 2 }, since: '2026-11-01T08:00:00Z', until: '2026-11-01T08:30:00Z' },
    { kind: 'gap', at: '2026-11-02T10:00:00Z', row: 'guard', lost: 1, classes: { followup: 1 }, since: '2026-11-01T09:00:00Z', until: '2026-11-01T09:30:00Z' },
  ] as unknown as readonly GuardRecord[], { now: NOW })
  assert.deepEqual(stats.unrecorded, { records: 3, gaps: 2, last: '2026-11-01T09:30:00Z' })
  const none = ruleStats([denial('one', '2026-11-01T09:00:00Z')], { now: NOW })
  assert.deepEqual(none.unrecorded, { records: 0, gaps: 0 })
})

test('ruleStats bounds the period by an ISO instant or by days before now', () => {
  const records = [denial('one', '2026-11-01T09:00:00Z'), denial('one', '2026-11-03T09:00:00Z'), followup('one', '2026-11-02T09:00:00Z', 'none')]
  assert.deepEqual(ruleStats(records, { now: NOW, since: '2026-11-02T00:00:00Z' }).rules.get('one')?.denials, { dialect: 1, other: 0 })
  assert.deepEqual(ruleStats(records, { now: NOW, since: '2d' }).rules.get('one')?.denials, { dialect: 1, other: 0 }, '2 days before 2026-11-03 noon reaches 2026-11-01 noon, so the first denial is out')
  assert.deepEqual(ruleStats(records, { now: NOW }).rules.get('one')?.denials, { dialect: 2, other: 0 }, 'without since everything counts')
  assert.deepEqual(sinceCutoff('14d', NOW), Date.parse('2026-10-20T12:00:00Z'))
  assert.equal(sinceCutoff(undefined, NOW), undefined)
  assert.equal(sinceCutoff('nonsense', NOW), undefined, 'a value that parses to nothing bounds nothing')
})
