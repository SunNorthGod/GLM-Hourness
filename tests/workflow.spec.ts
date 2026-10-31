import assert from 'node:assert/strict'
import test from 'node:test'
import { FIVE_KEYS, gradeDecision } from '../src/workflow/decisions.ts'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { usagePanelLines, usagePanelOf } from '../src/report/panel.ts'
import { morningReport, reportFromFiles, type ReportFs, type ReportOptions } from '../src/workflow/morning-report.ts'
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
  { at: '2026-10-27T10:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50 } },
  { at: '2026-10-27T11:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 } },
  { at: '2026-10-27T12:00:00+08:00', provider: 'glm', model: 'glm-5.3-flash', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
]
const quietReport = { period: 'p', decisions: [], violations: [] }
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
  assert.ok(report.includes('- glm-5.3：2 次 · 未命中输入 130 · 缓存读 0 · 缓存写 0 · 输出 70 · 缓存命中 0%'))
})

test('clean period reports 无 exceptions and empty usage', () => {
  const report = morningReport({ period: 'p', decisions: [], violations: [], usage: [] })
  assert.ok(report.includes('- 无'))
  assert.ok(report.includes('- 无模型调用'))
  assert.ok(!report.includes('影子记录'))
})

test('shadow records are counted apart from denials: never blocked, not exceptions', () => {
  const report = morningReport({
    period: 'p',
    decisions: [],
    violations: [
      { at: 't1', rule: 'file-tools-only', mode: 'shadow', sessionId: 's1', turn: 1, paths: ['gen.txt'], calls: [{ tool: 'Bash', command: '[IO.File]::WriteAllText(…)' }] },
      { at: 't2', rule: 'file-tools-only', mode: 'shadow', sessionId: 's1', turn: 2, paths: ['b.txt'], calls: [{ tool: 'Bash', command: 'cmd /c …' }] },
    ],
    usage: [],
  })
  assert.ok(report.includes('## 例外（先看）\n- 无'))
  assert.ok(!report.includes('违规 file-tools-only'))
  assert.ok(report.includes('## 影子记录（只记录，未拦截）\n- file-tools-only × 2'))
})

test('records from routes the dialect did not claim are counted apart; records without a scope count as before', () => {
  const report = morningReport({
    period: 'p',
    decisions: [],
    violations: [
      { at: 't1', rule: 'file-tools-only', tool: 'Bash', correction: '…' }, // written before split step 7
      { at: 't2', rule: 'file-tools-only', tool: 'Bash', scope: 'dialect', route: { provider: 'glm-zcode', model: 'glm-5.3' }, correction: '…' },
      { at: 't3', rule: 'file-tools-only', tool: 'pwsh', scope: 'other', route: { provider: 'deepseek-account', model: 'deepseek-flash' }, correction: '…' },
      { at: 't4', rule: 'file-tools-only', mode: 'shadow', sessionId: 's1', scope: 'other', route: { provider: 'deepseek-account', model: 'deepseek-flash' }, turn: 1, paths: ['gen.txt'], calls: [{ tool: 'pwsh', command: 'cmd /c …' }] },
    ],
    usage: [],
  })
  assert.ok(report.includes('## 例外（先看）\n- 违规 file-tools-only × 2\n- 违规 file-tools-only（其他路由） × 1\n'))
  assert.ok(report.includes('## 影子记录（只记录，未拦截）\n- file-tools-only（其他路由） × 1'))
})

test('report entry folds the three journal files from both directories and tolerates missing ones', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', JSON.stringify({ at: 't1', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' })],
    ['C:/u/glm-hourness/audit/usage.jsonl', JSON.stringify({ at: '2026-10-27T01:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 9, outputTokens: 1 } })],
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
  const report = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm/', userHome: 'C:/u/glm-hourness' }, '2026-10-27')
  assert.ok(report.includes('# 晨报 2026-10-27'))
  assert.ok(report.includes('L1 自主 1'))
  assert.ok(report.includes('- glm-5.3：1 次 · 未命中输入 9 · 缓存读 0 · 缓存写 0 · 输出 1 · 缓存命中 0%'))
  assert.ok(report.includes('- 无')) // no violations journal, no exceptions
  const projectOnly = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-27')
  assert.ok(projectOnly.includes('- 无模型调用')) // no user directory: the usage journal reads as empty
})

test('report entry honors the period bound: older records stay out', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', level: 'L3', kind: 'out-of-workspace', subject: 'old' }), // lexically after the bound, instant before it
      JSON.stringify({ at: '2026-10-27T01:00:00Z', level: 'L1', kind: 'dispatch:subagent', subject: 'new' }),
    ].join('\n')],
  ])
  const fs = { readFile: async (path: string) => files.get(path)! }
  const report = await reportFromFiles(fs, { projectHome: 'C:/ws/.llm' }, '2026-10-27', '2026-10-27T00:00:00Z')
  assert.ok(report.includes('L1 自主 1 · L2 次日报备 0 · L3 当次申报 0')) // today's record counted
  assert.ok(!report.includes('out-of-workspace: old')) // yesterday's L3 stayed out of the exceptions
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
  const report = await reportFromFiles(memoryFs(files), { projectHome: 'C:/ws/.llm', userHome: 'C:/u/glm-hourness' }, 'p', since, { pricing: creditPricing, now: Date.parse('2026-10-31T20:00:00+08:00'), offsetMinutes: 480, ...extra })
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
  const empty = await reportFromFiles(memoryFs(new Map([[GAP_PATH, gapRow({})]])), { userHome: 'C:/u/glm-hourness' }, 'p', '2026-10-29T00:00:00+08:00', { now: Date.parse('2026-10-31T20:00:00+08:00'), offsetMinutes: 480 })
  assert.deepEqual(usageSectionOf(empty), ['## 用量（今天）', '- 无模型调用', GAP_LINE])
  const noGap = await reportFromFiles(memoryFs(new Map()), { userHome: 'C:/u/glm-hourness' }, 'p', '2026-10-29T00:00:00+08:00')
  assert.deepEqual(usageSectionOf(noGap), ['## 用量（今天）', '- 无模型调用'])
})

test('report entry: the usage section prices through the service in the options, and the records without a readable time stay out of the period', async () => {
  const files = new Map([[USAGE_PATH, [
    JSON.stringify({ at: '2026-10-31T10:00:00+08:00', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500, totalTokens: 5500 } }),
    JSON.stringify({ at: 'whenever', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 1, outputTokens: 1 } }),
    '{broken',
  ].join('\n')]])
  const homes = { userHome: 'C:/u/glm-hourness' }
  const priced = usageSectionOf(await reportFromFiles(memoryFs(files), homes, 'p', '2026-10-31T00:00:00+08:00', { pricing: creditPricing }))
  // Saturday morning: off-peak, so half of the 2.57 the same call costs in peak.
  const credits = creditPricing.charged('glm-5.3', { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 500 }, Date.parse('2026-10-31T10:00:00+08:00'))
  assert.ok(credits !== undefined && Math.abs(credits - 1.285) < 1e-9, String(credits))
  assert.deepEqual(priced, ['## 用量（今天）', `- 合计：积分 ${credits.toFixed(2)} · 高峰 0% · 缓存命中 80%`, `- glm-5.3：1 次 · 积分 ${credits.toFixed(2)} · 高峰 0% · 缓存命中 80%`])
  // With no period bound nothing is filtered by time: the record without a time is counted as unreadable, the broken line is not seen by the report.
  const all = usageSectionOf(await reportFromFiles(memoryFs(files), homes, 'p', undefined, { pricing: creditPricing }))
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

test('the installer form journals decisions into the row home, else the data service project directory', async () => {
  const files = new Map<string, string>()
  const fs = { mkdir: async () => undefined, appendFile: async (path: string, data: string) => { files.set(path, (files.get(path) ?? '') + data) } }
  const run = async (config: { home?: string }, data: unknown) => {
    const listeners: Array<(payload: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
    apply({ on: (_event, listener) => { listeners.push(listener as typeof listeners[number]); return () => {} }, get: name => name === 'glmHournessData' ? data : undefined }, { ...config, fs })
    await listeners[0]!({ name: 'subagent', arguments: { description: 'task' } }, async () => ({ kind: 'allow' }))
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
