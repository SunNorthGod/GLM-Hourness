/**
 * The guard module's status entries (src/guard/status.ts, status hub design
 * 0.3 §3.1, §12 M4 row): `rules/denials` and `rules/lifts` carry the exact
 * lines the morning report's 例外 section words (ruleLines, liftLines — one
 * computation), over the WHOLE journal (F16), and the row provides them as
 * glmHournessStatus/guard for the collector, withdrawn with the row, with no
 * entries for a session the row does not know the project of.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply as guardApply } from '../src/guard/index.ts'
import { auditPaths } from '../src/memory/audit.ts'
import { journalEarliest, type GapRecord, type GuardRecord, type LiftRecord, type ViolationRecord } from '../src/guard/records.ts'
import { guardStatusItems, liftLines, ruleLines, type LiftsInput } from '../src/guard/status.ts'
import { liftRecordPath } from '../src/guard/lift.ts'
import { collectStatus } from '../src/report/status.ts'
import { statusServiceName, type RowStatusView } from '../src/shared/status-host.ts'
import { fakeRuntime } from './fake-rc3.ts'

const NOW_MS = Date.parse('2026-11-04T09:00:00Z')

const denial = (at: string, rule: string, tool = 'pwsh', subject?: string): ViolationRecord => ({
  at,
  rule,
  tool,
  ...(subject === undefined ? {} : { call: { tool, command: subject } }),
  correction: 'no',
})

const followup = (at: string, rule: string, outcome: 'right-path' | 'repeat' | 'other' | 'none'): GuardRecord => ({
  kind: 'followup',
  at,
  rule,
  tool: 'pwsh',
  scope: 'dialect',
  denial: 'k',
  outcome,
})

const liftRecord = (at: string, rule: string, action: 'lift' | 'restore', words: string): LiftRecord => ({
  kind: 'lift',
  at,
  rule,
  action,
  via: 'chat',
  words,
})

const liftFileLine = (at: string, rule: string, action: 'lift' | 'restore'): string =>
  JSON.stringify({ at, rule, action, via: 'chat', words: '新建脚本那条先别拦了' })

test('rules/denials carries the ruleLines words verbatim: the first line is the text, the rest the detail', () => {
  const records: GuardRecord[] = [
    denial('2026-11-04T01:00:00Z', 'scratch-only', 'write', 'C:/ws/run.ps1'),
    followup('2026-11-04T01:01:00Z', 'scratch-only', 'right-path'),
    denial('2026-11-04T02:00:00Z', 'file-tools-only', 'pwsh', 'Set-Content a.txt'),
    followup('2026-11-04T02:01:00Z', 'file-tools-only', 'repeat'),
  ]
  const [item] = guardStatusItems({ violations: records, lifts: { records: [] }, source: 'j', liftsSource: 'l' }, NOW_MS)
  assert.equal(item?.id, 'rules/denials')
  assert.equal(item?.owner, 'rules')
  assert.equal(item?.audience, 'agent')
  assert.equal(item?.asOf, new Date(NOW_MS).toISOString())
  assert.equal(item?.source, 'j')
  const lines = ruleLines(records, 480)
  assert.equal(item?.text, lines[0], 'the words are the report face words, one computation')
  assert.deepEqual(item?.detail, lines.slice(1))
})

test('a single denied rule leaves no detail; a journal without denials leaves no denials entry', () => {
  const one = [denial('2026-11-04T01:00:00Z', 'scratch-only')]
  const [only] = guardStatusItems({ violations: one, lifts: { records: [] }, source: 'j', liftsSource: 'l' }, NOW_MS)
  assert.equal(only?.id, 'rules/denials')
  assert.equal(only?.text, ruleLines(one, 480)[0])
  assert.equal(only?.detail, undefined)
  const none = guardStatusItems({ violations: [liftRecord('2026-11-04T01:00:00Z', 'scratch-only', 'lift', '别拦')], lifts: { records: [] }, source: 'j', liftsSource: 'l' }, NOW_MS)
  assert.equal(none.some(item => item.id === 'rules/denials'), false, 'a lift record is not a denial')
})

test('rules/lifts carries the liftLines words verbatim: the 撤下的规则 line is the text, the reconciliation the detail', () => {
  const records = [liftRecord('2026-11-04T01:00:00Z', 'scratch-only', 'lift', '新建脚本那条先别拦了')]
  const lifts: LiftsInput = { records, file: { text: `${liftFileLine('2026-11-04T01:00:00Z', 'scratch-only', 'lift')}\n` }, earliest: '2026-11-04T00:00:00Z' }
  const item = guardStatusItems({ violations: [], lifts, source: 'j', liftsSource: 'docs/guard/lifts.jsonl' }, NOW_MS).find(entry => entry.id === 'rules/lifts')
  assert.equal(item?.owner, 'rules')
  assert.equal(item?.audience, 'agent')
  assert.equal(item?.source, 'docs/guard/lifts.jsonl')
  assert.equal(item?.asOf, '2026-11-04T01:00:00Z', 'the state is as of the last lift record')
  const lines = liftLines(lifts, 480)
  assert.equal(item?.text, lines[0], 'the words are the report face words, one computation')
  assert.ok(item?.text.includes('经对话，原话「新建脚本那条先别拦了」'), 'the route and the human words ride in the text (the design\'s liftHow)')
  assert.equal(item?.detail, undefined, 'nothing stands behind the 撤下的规则 line here')
})

test('no rule lifted says so, with the read moment as its asOf', () => {
  const [item] = guardStatusItems({ violations: [], lifts: { records: [] }, source: 'j', liftsSource: 'docs/guard/lifts.jsonl' }, NOW_MS)
  assert.equal(item?.id, 'rules/lifts')
  assert.equal(item?.text, '- 撤下的规则：无')
  assert.equal(item?.detail, undefined)
  assert.equal(item?.asOf, new Date(NOW_MS).toISOString())
})

test('an unreadable record file reads its lifts from the journal and names the file', () => {
  const lifts: LiftsInput = { records: [liftRecord('2026-11-04T01:00:00Z', 'scratch-only', 'lift', '别拦')], file: { error: 'EACCES' } }
  const item = guardStatusItems({ violations: [], lifts, source: 'j', liftsSource: 'l' }, NOW_MS).find(entry => entry.id === 'rules/lifts')
  assert.equal(item?.text, liftLines(lifts, 480)[0])
  assert.ok(item?.detail?.includes('- lifts.jsonl 读不出（EACCES），这一次没有对账'), item?.detail?.join('\n'))
})

test('a file the journal contradicts keeps the mismatch line in the detail', () => {
  const lifts: LiftsInput = {
    records: [
      liftRecord('2026-11-03T01:00:00Z', 'scratch-only', 'lift', '别拦'),
      liftRecord('2026-11-04T01:00:00Z', 'scratch-only', 'restore', '拦回来'),
    ],
    earliest: '2026-11-03T00:00:00Z',
    file: { text: `${liftFileLine('2026-11-03T01:00:00Z', 'scratch-only', 'lift')}\n` },
  }
  const item = guardStatusItems({ violations: [], lifts, source: 'j', liftsSource: 'l' }, NOW_MS).find(entry => entry.id === 'rules/lifts')
  const lines = liftLines(lifts, 480)
  assert.equal(item?.text, lines[0], 'the file says lifted, so the 撤下的规则 line stands with the journal\'s last words')
  assert.deepEqual(item?.detail, lines.slice(1))
  assert.ok(item?.detail?.[0]?.includes('lifts.jsonl 与流水对不上：scratch-only，文件里最后一行是撤下，流水里最后一条是恢复'))
})

test('journalEarliest takes the earliest instant, a gap record\'s since included', () => {
  const gap: GapRecord = { kind: 'gap', at: '2026-11-04T01:00:00Z', row: 'guard', lost: 1, classes: { denial: 1 }, since: '2026-11-01T00:00:00Z', until: '2026-11-01T01:00:00Z' }
  assert.equal(journalEarliest([denial('2026-11-03T00:00:00Z', 'r'), gap]), '2026-11-01T00:00:00Z')
  assert.equal(journalEarliest([]), undefined)
  assert.equal(journalEarliest([denial('not-a-time', 'r')]), undefined)
})

test('the guard row provides glmHournessStatus/guard over the project journals and withdraws it with the row', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'guard-status-'))
  try {
    await mkdir(join(workspace, '.llm', 'audit'), { recursive: true })
    await mkdir(join(workspace, 'docs', 'guard'), { recursive: true })
    const violations: GuardRecord[] = [
      denial('2026-11-04T01:00:00Z', 'scratch-only', 'write', 'C:/ws/run.ps1'),
      followup('2026-11-04T01:01:00Z', 'scratch-only', 'right-path'),
    ]
    const liftRecords = [liftRecord('2026-11-04T02:00:00Z', 'file-tools-only', 'lift', '别拦')]
    await writeFile(join(workspace, '.llm', 'audit', 'violations.jsonl'), `${[...violations, ...liftRecords].map(record => JSON.stringify(record)).join('\n')}\n`)
    await writeFile(join(workspace, 'docs', 'guard', 'lifts.jsonl'), `${liftFileLine('2026-11-04T02:00:00Z', 'file-tools-only', 'lift')}\n`)
    const rt = fakeRuntime({ cwd: workspace })
    const dispose = guardApply(rt.ctx as never, { home: join(workspace, '.llm'), now: () => new Date(NOW_MS) })
    await rt.create()
    const view = rt.services.get(statusServiceName('guard')) as RowStatusView | undefined
    assert.ok(view !== undefined, 'the row provides glmHournessStatus/guard')
    assert.equal(view.row, 'guard')
    const expected = guardStatusItems({
      violations: [...violations, ...liftRecords],
      lifts: {
        records: liftRecords,
        earliest: '2026-11-04T01:00:00Z',
        file: { text: `${liftFileLine('2026-11-04T02:00:00Z', 'file-tools-only', 'lift')}\n` },
      },
      source: auditPaths({ projectHome: join(workspace, '.llm') }).violations!,
      liftsSource: liftRecordPath(workspace),
    }, NOW_MS)
    assert.deepEqual(view.items('agent-1'), expected, 'the view feeds the collector the same entries the pure function computes')
    assert.deepEqual(view.items('no-such-session'), [], 'a session the row does not know has no entries')
    const collected = collectStatus(rt.services, 'agent-1', 'agent', NOW_MS)
    assert.deepEqual(collected.items, expected, 'the collector reads the row\'s view like any report face')
    dispose()
    assert.equal(rt.services.has(statusServiceName('guard')), false)
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('a journal that is not there yet: the lifts entry still answers over the missing record file, as the report words it', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'guard-status-bare-'))
  try {
    await mkdir(join(workspace, '.llm'), { recursive: true })
    const rt = fakeRuntime({ cwd: workspace })
    const dispose = guardApply(rt.ctx as never, { home: join(workspace, '.llm'), now: () => new Date(NOW_MS) })
    await rt.create()
    const view = rt.services.get(statusServiceName('guard')) as RowStatusView
    const [lifts] = view.items('agent-1')
    assert.equal(lifts?.id, 'rules/lifts')
    assert.equal(lifts?.text, '- 撤下的规则：无')
    assert.deepEqual(lifts?.detail, ['- lifts.jsonl 读不出（ENOENT），这一次没有对账'], 'the same words the report writes for a project without a record file')
    dispose()
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
