/**
 * The env module's status entries (src/env/status.ts, status hub design 0.3
 * §3.1, §12 M4 row): the one `env/suppressions` entry over the project's
 * daily counts, and the row providing it as glmHournessStatus/env for the
 * collector — withdrawn with the row, no entry without a journal or a
 * session the row knows, a journal that cannot be read into the collector's
 * placeholder, a line that cannot be parsed skipped. The checks' timeouts
 * (batch 9, §12 M4 row): checkTimeouts and timeoutLines are the morning
 * report's 检查的超时 section line for line, env/timeouts hands the same
 * lines, a raise or a reset of limits.jsonl shows at the next read.
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply as envApply } from '../src/env/index.ts'
import { parseLimits } from '../src/env/limit-tool.ts'
import { checkTimeouts, envStatusItems, envTimeoutItems, pageChecks, suppressionLineOf, suppressionTotalLine, timeoutLines } from '../src/env/status.ts'
import type { SuppressionRecord } from '../src/env/suppressions.ts'
import { parseTiming } from '../src/env/timeout.ts'
import { collectStatus } from '../src/report/status.ts'
import { validateStatusItem } from '../src/shared/status.ts'
import { statusServiceName, type RowStatusView } from '../src/shared/status-host.ts'
import { morningReport } from '../src/workflow/morning-report.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'

const record = (at: string, total: number): SuppressionRecord => ({ at, repo: 'r', total, byMarker: {} })

test('envStatusItems: the latest count is the text, the field, the moment; no count, no entry', () => {
  assert.deepEqual(envStatusItems([], 'suppressions.jsonl'), [])
  const [only] = envStatusItems([record('2026-11-04T00:30:00Z', 7)], 'suppressions.jsonl')
  assert.equal(only?.id, 'env/suppressions')
  assert.equal(only?.owner, 'env')
  assert.equal(only?.audience, 'agent')
  assert.equal(only?.asOf, '2026-11-04T00:30:00Z')
  assert.equal(only?.source, 'suppressions.jsonl')
  assert.equal(only?.text, '压制注释 7 处')
  assert.deepEqual(only?.fields, { total: 7 })
  assert.ok((only?.staleAfterMs ?? 0) > 0, 'a count that stopped refreshing grows stale')
  const [latest] = envStatusItems([record('2026-11-02T00:30:00Z', 3), record('2026-11-04T00:30:00Z', 7)], 's')
  assert.equal(latest?.text, '压制注释 7 处', 'the entry states the latest count, the movement stays the report\'s period line')
})

test('the count line is one wording for the entry and the report\'s no-churn line', () => {
  assert.equal(suppressionLineOf([record('2026-11-04T00:30:00Z', 7)]), suppressionTotalLine(7))
  assert.equal(suppressionLineOf([record('2026-11-03T00:30:00Z', 3), record('2026-11-04T00:30:00Z', 7)]), `${suppressionTotalLine(7)}（本期 +4 / −0）`)
})

/**
 * A fixture whose daily gate must not run: the journal's last record is
 * today's (UTC+8), so the row skips the count and with it the git call.
 */
const settledJournal = (): string => `${JSON.stringify(record(`${new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00Z`, 7))}\n`

async function withRow(body: (view: RowStatusView, workspace: string, rt: FakeRuntime) => void, options: { readFile?: (path: string) => string, journal?: string, timing?: string, limits?: string } = {}): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'env-status-'))
  try {
    await mkdir(join(workspace, '.llm', 'audit'), { recursive: true })
    await writeFile(join(workspace, '.llm', 'audit', 'suppressions.jsonl'), options.journal ?? settledJournal())
    if (options.timing !== undefined || options.limits !== undefined) await mkdir(join(workspace, '.llm', 'env-checks'), { recursive: true })
    if (options.timing !== undefined) await writeFile(join(workspace, '.llm', 'env-checks', 'timing.jsonl'), options.timing)
    if (options.limits !== undefined) await writeFile(join(workspace, '.llm', 'env-checks', 'limits.jsonl'), options.limits)
    const rt = fakeRuntime({ cwd: workspace })
    const dispose = envApply(rt.ctx, options.readFile === undefined ? {} : { readFile: options.readFile })
    await rt.create()
    const view = rt.services.get(statusServiceName('env')) as RowStatusView | undefined
    assert.ok(view !== undefined, 'the row provides glmHournessStatus/env')
    body(view, workspace, rt)
    dispose()
    assert.equal(rt.services.has(statusServiceName('env')), false, 'the view goes with the row')
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

test('the env row provides glmHournessStatus/env: the latest count as the one entry, the collector reads it', async () => {
  await withRow((view, workspace, rt) => {
    const [item] = view.items('agent-1')
    assert.equal(item?.id, 'env/suppressions')
    assert.equal(item?.text, '压制注释 7 处')
    assert.deepEqual(item?.fields, { total: 7 })
    assert.equal(item?.source, join(workspace, '.llm', 'audit', 'suppressions.jsonl'))
    const collected = collectStatus(rt.services, 'agent-1', 'agent', Date.now())
    assert.equal(collected.items.some(entry => entry.id === 'env/suppressions'), true)
    assert.deepEqual(view.items('agent-1').map(entry => entry.id), ['env/suppressions'], 'no timing journal, no timeouts entry')
  })
})

test('a session the row does not know has no entry; a journal that cannot be read throws for the collector', async () => {
  await withRow((view) => {
    assert.deepEqual(view.items('no-such-session'), [])
    assert.throws(() => view.items('agent-1'), /EACCES/, 'the view throws; the collector takes the placeholder')
  }, {
    readFile: (path) => {
      const error = new Error(`EACCES: permission denied, access '${path}'`) as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    },
  })
})

test('a journal that is not there yet is no entry, not an error', async () => {
  await withRow((view) => {
    assert.deepEqual(view.items('agent-1'), [])
  }, {
    readFile: (path) => {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    },
  })
})

test('a line the journal cannot parse is skipped, the rest counted', async () => {
  const corrupt = `${'not json'}\n${settledJournal()}`
  await withRow((view) => {
    const [item] = view.items('agent-1')
    assert.equal(item?.text, '压制注释 7 处')
  }, { journal: corrupt })
})

// --- The checks' timeouts: one set of facts for the morning report and the env/timeouts entry ---

const NOW = Date.parse('2026-11-05T06:00:00Z')
const KEY = { argv: 'abcd1234' }
const NO_ASKS = { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } }
/** Two checks: one stopped at its estimate's limit and raised by the harness, one held at the ceiling with a queue drop. */
const TIMING = [
  { kind: 'value', at: '2026-11-05T01:00:00Z', check: 'tool-1/slow', ...KEY, limitMs: 5000, cap: { by: 'default' }, source: { by: 'estimate', node: 'tool-1', rev: 'r', actor: 'llm', at: '2026-11-05T00:59:00Z', session: 'sess-123456789', estimateS: 1 } },
  { kind: 'timeout', at: '2026-11-05T01:00:05Z', check: 'tool-1/slow', ...KEY, limitMs: 5000, elapsedMs: 5230, session: 's', outcome: 'not-finished' },
  { kind: 'run', at: '2026-11-05T01:00:05Z', check: 'tool-1/slow', ...KEY, ms: 5000, censored: true },
  { kind: 'value', at: '2026-11-05T01:01:00Z', check: 'tool-1/slow', ...KEY, limitMs: 15000, previousMs: 5000, cap: { by: 'default' }, source: { by: 'harness', runs: [5000], factor: 3, floorMs: 5000 } },
  { kind: 'value', at: '2026-11-05T01:00:00Z', check: 'tool-2/eslint', ...KEY, limitMs: 60000, cap: { by: 'default' }, capped: { wantedMs: 75000 }, source: { by: 'estimate', node: 'tool-2', rev: 'r', estimateS: 25 } },
  { kind: 'queue', at: '2026-11-05T02:00:00Z', check: 'tool-2/eslint', ...KEY, waitedMs: 60000, running: 2, outcome: 'not-run' },
].map(line => JSON.stringify(line)).join('\n')
const REASON = '整个项目跑带类型信息的规则，要 40 秒左右'
const limitLine = (at: string, check: string, action: 'raise' | 'reset', capS: number, reason: string): string => JSON.stringify({ at, check, action, capS, previousCapS: 60, reason })
const RAISED = `${limitLine('2026-11-04T20:00:00Z', 'tool-2/eslint', 'raise', 120, REASON)}\n`

test('the morning report\'s 检查的超时 section is timeoutLines over checkTimeouts, line for line (one computation)', () => {
  const timing = parseTiming(TIMING).lines
  const limits = parseLimits(RAISED).lines
  const lines = timeoutLines(checkTimeouts(timing, limits, NOW), 480)
  const report = morningReport({ period: 'p', decisions: [], violations: [], usage: [], asks: NO_ASKS, timing, limits, now: NOW, offsetMinutes: 480 })
  const section = report.slice(report.indexOf('## 检查的超时')).split('\n\n')[0]?.split('\n')
  assert.deepEqual(section, ['## 检查的超时', ...lines])
  assert.equal(lines.length, 3)
  assert.equal(lines[2], `  - 上限已由主 Agent 调高到 120 秒 · 2026-11-05：${REASON}；要改回，跟主 Agent 说`, 'plain-ui §4.7\'s words, from the check\'s last line in limits.jsonl')
  const facts = checkTimeouts(timing, limits, NOW)
  assert.deepEqual(facts.map(fact => [fact.check, fact.value.limitMs, fact.timeouts.length, fact.queued, fact.setting?.capS]), [['tool-1/slow', 15000, 1, 0, undefined], ['tool-2/eslint', 60000, 0, 1, 120]])
  const reset = parseLimits(`${RAISED}${limitLine('2026-11-05T03:00:00Z', 'tool-2/eslint', 'reset', 60, '')}\n`).lines
  assert.equal(checkTimeouts(timing, reset, NOW)[1]?.setting, undefined, 'a reset takes the raise away though the latest value line is the same')
  assert.deepEqual(checkTimeouts(timing, limits, Date.parse('2026-11-20T00:00:00Z')).map(fact => [fact.timeouts.length, fact.queued]), [[0, 0], [0, 0]], 'the counts look back seven days')
})

test('env/timeouts: the same lines, the first as the text and the rest as the detail; it passes the entry check without a warning; no value line, no entry', () => {
  const facts = checkTimeouts(parseTiming(TIMING).lines, parseLimits(RAISED).lines, NOW)
  const lines = timeoutLines(facts, 480)
  const [item, ...more] = envTimeoutItems(facts, 'timing.jsonl', NOW)
  assert.equal(more.length, 0)
  assert.equal(item?.id, 'env/timeouts')
  assert.equal(item?.owner, 'env')
  assert.equal(item?.audience, 'agent')
  assert.equal(item?.asOf, new Date(NOW).toISOString())
  assert.equal(item?.source, 'timing.jsonl')
  assert.equal(item?.text, lines[0])
  assert.deepEqual(item?.detail, lines.slice(1))
  assert.deepEqual(item?.fields, { checks: 2, timeouts7d: 1 })
  const checked = validateStatusItem(item)
  assert.ok(checked.ok && checked.warnings.length === 0, JSON.stringify(checked))
  assert.deepEqual(envTimeoutItems([], 'timing.jsonl', NOW), [])
  assert.deepEqual(envTimeoutItems(checkTimeouts(parseTiming(TIMING).lines.filter(line => line.kind !== 'value'), [], NOW), 'timing.jsonl', NOW), [], 'runs without a value line give no entry')
})

test('env/timeouts: a reason with a line break or past 200 code points stays one line, cut with an ellipsis, and the collector keeps it without a warning', () => {
  const long = `第一行\n${'很'.repeat(250)}`
  const facts = checkTimeouts(parseTiming(TIMING).lines, parseLimits(`${limitLine('2026-11-04T20:00:00Z', 'tool-2/eslint', 'raise', 120, long)}\n`).lines, NOW)
  const [item] = envTimeoutItems(facts, 'timing.jsonl', NOW)
  const raised = item?.detail?.at(-1) ?? ''
  assert.equal([...raised].length, 200)
  assert.ok(raised.endsWith('…') && !raised.includes('\n') && raised.includes('第一行 很'), raised)
  const checked = validateStatusItem(item)
  assert.ok(checked.ok && checked.warnings.length === 0, JSON.stringify(checked))
})

test('the env row hands env/timeouts from the project\'s timing journal and limits.jsonl; a raise and a reset show at the next read, before the check runs again', async () => {
  await withRow((view, workspace, rt) => {
    const items = view.items('agent-1')
    assert.deepEqual(items.map(entry => entry.id), ['env/suppressions', 'env/timeouts'])
    const timeouts = items[1]
    assert.equal(timeouts?.source, join(`${workspace}/.llm`, 'env-checks', 'timing.jsonl'), 'the journal the runner writes (projectHomeFor)')
    assert.ok(timeouts?.text.startsWith('- tool-1/slow：超时 15 秒（'), timeouts?.text)
    assert.ok(timeouts?.detail?.includes(`  - 上限已由主 Agent 调高到 120 秒 · 2026-11-05：${REASON}；要改回，跟主 Agent 说`), JSON.stringify(timeouts?.detail))
    const collected = collectStatus(rt.services, 'agent-1', 'agent', Date.now())
    // Two reads a millisecond apart: everything but the read moment is the same entry.
    const withoutAsOf = (entry: typeof timeouts): object | undefined => entry === undefined ? undefined : { ...entry, asOf: undefined }
    assert.deepEqual(withoutAsOf(collected.items.find(entry => entry.id === 'env/timeouts')), withoutAsOf(timeouts), 'the collector reads the same entry')
    writeFileSync(join(workspace, '.llm', 'env-checks', 'limits.jsonl'), `${RAISED}${limitLine('2026-11-05T03:00:00Z', 'tool-2/eslint', 'reset', 60, '')}\n`)
    const after = view.items('agent-1').find(entry => entry.id === 'env/timeouts')
    assert.ok(after !== undefined && !(after.detail ?? []).some(line => line.includes('上限已由主 Agent 调高')), JSON.stringify(after))
  }, { timing: `${TIMING}\nnot json\n`, limits: RAISED })
})

test('pageChecks maps the same facts to the loop board page\'s shape: runs are measured, an estimate is agent-estimate, capped is held by the cap, three times under the value is held by the floor, the raise is the check\'s last line in limits.jsonl (plain-ui 1.3 §11 「1.0 的对接」第 2 条)', () => {
  const timing = parseTiming(TIMING).lines
  const [slow, eslint] = pageChecks([{ key: 'tool-1/slow', title: 'Slow' }, { key: 'tool-2/eslint', title: 'ESLint', estimateS: 25 }], timing, parseLimits(RAISED).lines, NOW)
  assert.deepEqual(slow, {
    key: 'tool-1/slow',
    title: 'Slow：slow',
    timeout: {
      seconds: 15,
      source: { kind: 'measured', runs: 1, slowestS: 5 },
      history: [
        { at: '2026-11-05T01:01:00Z', seconds: 15, previousS: 5, source: '系统按最近 1 次，最慢 5 秒' },
        { at: '2026-11-05T01:00:00Z', seconds: 5, source: '写检查的 agent 估 1 秒，会话 sess-123' },
      ],
      timeouts: [{ at: '2026-11-05T01:00:05Z', limitS: 5, elapsedS: 5.23, outcome: '算没跑完，下一次改动照常再跑' }],
      timeouts7d: 1,
    },
  }, 'three times the slowest run is the value: no held')
  assert.deepEqual(eslint?.timeout, {
    seconds: 60,
    source: { kind: 'agent-estimate', estimateS: 25 },
    held: { by: 'cap', wantedS: 75 },
    capRaised: { capS: 120, at: '2026-11-04T20:00:00Z', reason: REASON },
    history: [{ at: '2026-11-05T01:00:00Z', seconds: 60, source: '写检查的 agent 估 25 秒，会话未记；想要 75 秒，被上限截在 60 秒' }],
    timeouts: [],
    timeouts7d: 0,
  }, 'raised, but the value is still the one computed under the old ceiling until the check runs again')
  const reset = pageChecks([{ key: 'tool-2/eslint', title: 'ESLint', estimateS: 25 }], timing, parseLimits(`${RAISED}${limitLine('2026-11-05T03:00:00Z', 'tool-2/eslint', 'reset', 60, '')}\n`).lines, NOW)
  assert.equal(reset[0]?.timeout.capRaised, undefined, 'a reset takes the raise away at once')
  const floored = pageChecks([{ key: 'tool-1/slow', title: 'Slow' }], parseTiming(JSON.stringify({ kind: 'value', at: '2026-11-05T01:00:00Z', check: 'tool-1/slow', ...KEY, limitMs: 5000, cap: { by: 'default' }, source: { by: 'harness', runs: [400, 1000], factor: 3, floorMs: 5000 } })).lines, [], NOW)
  assert.deepEqual([floored[0]?.timeout.source, floored[0]?.timeout.held], [{ kind: 'measured', runs: 2, slowestS: 1 }, { by: 'floor', wantedS: 3 }])
})

test('pageChecks of a check that has not run yet: no estimate is the ceiling (raised when raised), an estimate is three times it with the history entry and session the graph tools recorded', () => {
  const written = { kind: 'estimate', at: '2026-11-05T00:30:00Z', check: 'tool-3/new', ...KEY, estimateS: 1, node: 'tool-3', actor: 'human', historyAt: '2026-11-05T00:29:59Z', session: 'session-abcdef123456' }
  const raise = parseLimits(`${limitLine('2026-11-05T02:00:00Z', 'tool-3/bare', 'raise', 120, REASON)}\n`).lines
  const [fresh, bare, unknown] = pageChecks([
    { key: 'tool-3/new', title: 'New', estimateS: 1, origin: { node: 'tool-3', rev: 'r', actor: 'human', at: '2026-11-05T00:29:59Z' } },
    { key: 'tool-3/bare', title: 'Bare' },
    { key: 'tool-3/quick', title: '', estimateS: 30 },
  ], parseTiming(JSON.stringify(written)).lines, raise, NOW)
  assert.deepEqual(fresh?.timeout, {
    seconds: 5,
    source: { kind: 'agent-estimate', estimateS: 1, at: '2026-11-05T00:29:59Z', session: 'abcdef12', who: 'human' },
    held: { by: 'floor', wantedS: 3 },
    history: [{ at: '2026-11-05T00:29:59Z', seconds: 5, source: '你估 1 秒，还没跑过' }],
    timeouts: [],
    timeouts7d: 0,
  })
  assert.deepEqual(bare?.timeout, { seconds: 120, source: { kind: 'ceiling' }, capRaised: { capS: 120, at: '2026-11-05T02:00:00Z', reason: REASON } }, 'no history and no timeouts owed by the ceiling')
  assert.deepEqual([unknown?.title, unknown?.timeout.seconds, unknown?.timeout.held, unknown?.timeout.history], ['tool-3/quick', 60, { by: 'cap', wantedS: 90 }, []], 'an estimate with no history entry known has no history line')
})