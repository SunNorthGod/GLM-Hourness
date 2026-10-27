import assert from 'node:assert/strict'
import test from 'node:test'
import { FIVE_KEYS, gradeDecision } from '../src/workflow/decisions.ts'
import { morningReport, reportFromFiles, usageByModel } from '../src/workflow/morning-report.ts'
import { apply } from '../src/workflow/index.ts'
import type { AuditJournal, DecisionRecord, UsageRecord } from '../src/memory/audit.ts'

test('decision grading follows the L1/L2/L3 table', () => {
  assert.equal(gradeDecision('dispatch'), 'L1')
  assert.equal(gradeDecision('tool-call'), 'L1')
  assert.equal(gradeDecision('model-route'), 'L2')
  assert.equal(gradeDecision('background-job'), 'L2')
  assert.equal(gradeDecision('out-of-workspace'), 'L3')
  assert.equal(gradeDecision('credential'), 'L3')
  assert.equal(gradeDecision('novel-thing'), 'L2') // unknown defaults to notify
})

test('five-key card keeps the user-owned vocabulary in order', () => {
  assert.deepEqual(FIVE_KEYS.map(entry => entry.key), ['approve', 'reject', 'augment', 'more-detail', 'to-the-point'])
  assert.ok(FIVE_KEYS[1]!.label.includes('理由'))
  // User decision 2026-10-27: the depth keys are labelled by the action they request.
  assert.equal(FIVE_KEYS[3]!.label, '讲细点')
  assert.ok(FIVE_KEYS[3]!.meaning.includes('上调'))
  assert.equal(FIVE_KEYS[4]!.label, '说重点')
  assert.ok(FIVE_KEYS[4]!.meaning.includes('下调'))
})

const usage: UsageRecord[] = [
  { at: 't1', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50 } },
  { at: 't2', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 } },
  { at: 't3', provider: 'glm', model: 'glm-5.3-flash', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
]

test('usage aggregation folds per model and ranks by total', () => {
  assert.deepEqual(usageByModel(usage), [
    { model: 'glm-5.3', calls: 2, inputTokens: 130, outputTokens: 70, totalTokens: 200 },
    { model: 'glm-5.3-flash', calls: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  ])
})

test('morning report leads with exceptions, then curve, then usage', () => {
  const decisions: DecisionRecord[] = [
    { at: 't1', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' },
    { at: 't2', level: 'L3', kind: 'out-of-workspace', subject: 'C:\\Windows\\x' },
  ]
  const report = morningReport({
    period: '2026-10-27',
    decisions,
    violations: [{ at: 't3', rule: 'file-tools-only', tool: 'Bash', correction: 'Boundary: …' }],
    usage,
  })
  const exceptionIndex = report.indexOf('## 例外')
  const curveIndex = report.indexOf('## 决策曲线')
  const usageIndex = report.indexOf('## 用量')
  assert.ok(exceptionIndex >= 0 && exceptionIndex < curveIndex && curveIndex < usageIndex)
  assert.ok(report.includes('[L3] out-of-workspace: C:\\Windows\\x'))
  assert.ok(report.includes('违规 file-tools-only × 1'))
  assert.ok(report.includes('L1 自主 1 · L2 次日报备 0 · L3 当次申报 1'))
  assert.ok(report.includes('glm-5.3: 2 次 · in 130 / out 70 / total 200'))
})

test('clean period reports 无 exceptions and empty usage', () => {
  const report = morningReport({ period: 'p', decisions: [], violations: [], usage: [] })
  assert.ok(report.includes('- 无'))
  assert.ok(report.includes('- 无模型调用'))
})

test('report entry folds the three journal files and tolerates missing ones', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', JSON.stringify({ at: 't1', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' })],
    ['C:/ws/.llm/audit/usage.jsonl', JSON.stringify({ at: 't2', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 9, outputTokens: 1 } })],
  ])
  const fs = { readFile: async (path: string) => {
    const content = files.get(path)
    if (content === undefined) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return content
  } }
  const report = await reportFromFiles(fs, 'C:/ws/.llm/', '2026-10-27')
  assert.ok(report.includes('# 晨报 2026-10-27'))
  assert.ok(report.includes('L1 自主 1'))
  assert.ok(report.includes('glm-5.3: 1 次'))
  assert.ok(report.includes('- 无')) // no violations journal, no exceptions
})

test('report entry honors the period bound: older records stay out', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', level: 'L3', kind: 'out-of-workspace', subject: 'old' }), // lexically after the bound, instant before it
      JSON.stringify({ at: '2026-10-27T01:00:00Z', level: 'L1', kind: 'dispatch:subagent', subject: 'new' }),
    ].join('\n')],
  ])
  const fs = { readFile: async (path: string) => files.get(path)! }
  const report = await reportFromFiles(fs, 'C:/ws/.llm', '2026-10-27', '2026-10-27T00:00:00Z')
  assert.ok(report.includes('L1 自主 1 · L2 次日报备 0 · L3 当次申报 0')) // today's record counted
  assert.ok(!report.includes('out-of-workspace: old')) // yesterday's L3 stayed out of the exceptions
})

test('apply journals dispatch decisions and always delegates', async () => {
  const decisions: unknown[] = []
  const journal = { decision: async (record: unknown) => { decisions.push(record) } } as unknown as Pick<AuditJournal, 'decision'>
  const listeners: Array<(payload: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
  const dispose = apply({
    on: (_event, listener) => { listeners.push(listener as typeof listeners[number]); return () => {} },
  }, journal)
  let delegated = false
  const result = await listeners[0]!({ name: 'spawn_teammate', arguments: { name: 'researcher' } }, async () => { delegated = true; return { kind: 'allow' } })
  await new Promise(resolve => setImmediate(resolve))
  await listeners[0]!({ name: 'read', arguments: {} }, async () => { delegated = true; return { kind: 'allow' } })
  await listeners[0]!({ name: 'spawn_teammate', arguments: {}, parent: 'token' }, async () => { delegated = true; return { kind: 'allow' } })
  dispose()
  assert.equal(delegated, true)
  assert.deepEqual(result, { kind: 'allow' })
  assert.equal(decisions.length, 1) // only the root dispatch; nested + non-dispatch skipped
  const record = decisions[0] as DecisionRecord
  assert.equal(record.level, 'L1')
  assert.equal(record.subject, 'researcher')
})

test('both subagent tools of the rc.3 base profile are dispatches', async () => {
  // dsh-base cordis.patch.yml mounts dsh-tool-subagent twice: toolName subagent (spawn) and subagent_fork (fork).
  const decisions: DecisionRecord[] = []
  const journal = { decision: async (record: DecisionRecord) => { decisions.push(record) } }
  const listeners: Array<(payload: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
  apply({ on: (_event, listener) => { listeners.push(listener as typeof listeners[number]); return () => {} } }, journal)
  for (const name of ['subagent', 'subagent_fork']) {
    await listeners[0]!({ name, arguments: { description: `${name} task` } }, async () => ({ kind: 'allow' }))
  }
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(decisions.map(record => [record.kind, record.subject]), [['dispatch:subagent', 'subagent task'], ['dispatch:subagent_fork', 'subagent_fork task']])
})
