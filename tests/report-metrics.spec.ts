/**
 * The four delivery numbers' L2 (M7 design 0.6 §3.13, m7-9): each number's
 * fixed reading — a deployment is one verified forward move of the local
 * trunk; the lead runs from the journey's first dispatch to the landing; a
 * deployment fails when a named task reopens, a sourced fix task appears or
 * the first commit after it breaks the full trunk check, all within 14 days;
 * a restore incident runs from a trunk-check failure to the next pass — and
 * the event body that leaves a field out instead of writing a zero. The
 * wiring half: the weekly report call emits one `operate.dora` event from
 * the journals it already read, the morning call emits none, and the text
 * carries no delivery number (`d-metrics-ratios-person-only`).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { dora, doraBody, type DoraInput } from '../src/report/metrics.ts'
import { hournessReportTool } from '../src/operate/index.ts'
import type { AdvanceRecord } from '../src/execute/advance.ts'
import type { VerifiedCheck } from '../src/execute/check.ts'
import type { HistoryEntry } from '../src/graph/schema.ts'
import type { ServiceLookup, ToolExecutionContext } from '../src/shared/dsh-min.ts'
import { at, graphOf, node } from './execute-helpers.ts'

const NOW = Date.parse(at(100))
const SINCE = Date.parse(at(50))

/** One verified forward move of the trunk. */
function deploy(from: string, to: string, n: number, tasks: readonly string[] = []): AdvanceRecord {
  return { ref: 'local', from, to, tasks: [...tasks], at: at(n), ok: true }
}

/** A refused or otherwise not-counted advance line. */
function refused(from: string, to: string, n: number): AdvanceRecord {
  return { ref: 'local', from, to, at: at(n), ok: false, missing: 'check' }
}

/** A dispatch comment the graph reader recognizes (第 N 次派发 · childId · … + pins line). */
function dispatch(n: number, attempt = 1, childId = 'child-1'): HistoryEntry {
  return { at: at(n), actor: 'harness', op: 'comment', text: `第 ${attempt} 次派发 · ${childId} · 模型 p/m，理由：测试\npins: a=b` }
}

const DIGEST = '0'.repeat(64)

/** One verified trunk-check record, the fields `dora` reads plus the shape the type carries. */
function trunkCheck(commit: string, passed: boolean, n: number): VerifiedCheck {
  const atString = at(n)
  const record = { kind: 'trunk' as const, commit, tree: `tree-${commit}`, normDigest: 'norm', ran: [0], passed, tasks: [] as string[], at: atString }
  return {
    ...record,
    result: `checks/${commit}/run/result.json`,
    resultDigest: DIGEST,
    detail: { ...record, base: 'main', mergeBase: null, commands: [{ index: 0, line: 'npm test', exit: passed ? 0 : 1, ms: 1, log: 'logs/t.log' }] },
  }
}

/** The input over one graph with the parts a test changes; the window is seconds 50..100 of the fixture clock. */
function input(graph: Parameters<typeof dora>[0]['graph'], extra?: Partial<DoraInput>): DoraInput {
  return { nowMs: NOW, sinceMs: SINCE, advances: [], checks: [], graph, ...extra }
}

test('交付频率 counts only the window’s verified local advances, and is the failure rate’s denominator', () => {
  const numbers = dora(input(undefined, {
    advances: [
      deploy('a', 'b', 40), // before the window
      deploy('b', 'c', 60, ['task-a']),
      deploy('c', 'd', 99),
      deploy('d', 'e', 100), // at the window's end is outside
      refused('e', 'f', 70), // ok: false never counts
      { ref: 'local', from: 'f', to: 'g', ok: true }, // no moment: not windowed
      { ref: 'remote', by: 'push', from: 'd', to: 'e', at: at(80), ok: true }, // a push is not a deployment
    ],
  }))
  assert.equal(numbers.deploys, 2)
  assert.equal(numbers.failed, undefined)
})

test('变更前置时间 runs from the journey’s first dispatch to the landing; a rework’s second landing measures its own dispatches', () => {
  const graph = graphOf([
    node({ id: 'task-a', type: 'task', title: '一次做成', status: 'done' }, 10, 'llm', [dispatch(40)]),
    node({ id: 'task-b', type: 'task', title: '重开后修成', status: 'doing' }, 10, 'llm', [
      dispatch(30, 1, 'child-b1'),
      { at: at(45), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '坏了' },
      dispatch(58, 2, 'child-b2'),
    ]),
    node({ id: 'task-c', type: 'task', title: '没有派发批注', status: 'done' }, 10, 'llm', []),
  ])
  const numbers = dora(input(graph, {
    advances: [
      deploy('a', 'b', 40, ['task-b']), // task-b's first landing, before the window: the boundary, not a cohort member
      deploy('b', 'c', 55, ['task-a', 'task-b', 'task-c']),
      deploy('c', 'd', 70, ['task-b']),
    ],
  }))
  // task-a: 55-40 = 15 s; task-b's second journey starts after its first landing (40), so 70-58 = 12 s,
  // not 70-30; task-c has no dispatch comment and enters no cohort. Median of [15000, 12000] is 13500.
  assert.equal(numbers.leadTasks, 2)
  assert.equal(numbers.leadMs, 13_500)
})

test('变更前置时间 skips a dispatch written after its landing, and the median of three is the middle', () => {
  const graph = graphOf([
    node({ id: 'task-a', type: 'task', title: '派发晚于合入', status: 'done' }, 10, 'llm', [dispatch(60)]),
    node({ id: 'task-b', type: 'task', title: '普通', status: 'done' }, 10, 'llm', [dispatch(52)]),
    node({ id: 'task-c', type: 'task', title: '第三件', status: 'done' }, 10, 'llm', [dispatch(53)]),
  ])
  const numbers = dora(input(graph, { advances: [deploy('a', 'b', 55, ['task-a', 'task-b', 'task-c'])] }))
  // task-a's only dispatch is after the landing: dropped. The others are 3 s and 2 s; the even pair rounds to 2500.
  assert.equal(numbers.leadTasks, 2)
  assert.equal(numbers.leadMs, 2_500)
  const odd = dora(input(graphOf([
    node({ id: 'task-b', type: 'task', title: '普通', status: 'done' }, 10, 'llm', [dispatch(52)]),
    node({ id: 'task-c', type: 'task', title: '第三件', status: 'done' }, 10, 'llm', [dispatch(53)]),
    node({ id: 'task-d', type: 'task', title: '第四件', status: 'done' }, 10, 'llm', [dispatch(50)]),
  ]), { advances: [deploy('a', 'b', 61, ['task-b']), deploy('b', 'c', 62, ['task-c']), deploy('c', 'd', 63, ['task-d'])] }))
  // 9 s, 9 s and 13 s: the odd middle is 9000.
  assert.equal(odd.leadTasks, 3)
  assert.equal(odd.leadMs, 9_000)
})

test('变更失败率 marks a deployment when a named task reopens within 14 days, not after', () => {
  const graph = graphOf([
    node({ id: 'task-in', type: 'task', title: '十四天内重开', status: 'doing' }, 10, 'llm', [
      { at: at(60 + 13 * 86_400), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '坏了' },
    ]),
    node({ id: 'task-out', type: 'task', title: '十五天后重开', status: 'doing' }, 10, 'llm', [
      { at: at(60 + 15 * 86_400), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '坏了但太晚' },
    ]),
  ])
  const numbers = dora(input(graph, { advances: [deploy('a', 'b', 60, ['task-in', 'task-out'])] }))
  assert.equal(numbers.failed, 1)
})

test('变更失败率 marks a deployment when a task sourced to a named one appears within 14 days', () => {
  const graph = graphOf([
    node({ id: 'task-a', type: 'task', title: '原件', status: 'done' }, 10, 'llm', []),
    node({ id: 'fix-in', type: 'task', title: '十四天内的修复', status: 'approved', edges: [{ type: 'source', to: 'task-a' }] }, 61, 'llm', []),
    node({ id: 'fix-out', type: 'task', title: '源在合入之前就在', status: 'approved', edges: [{ type: 'source', to: 'task-a' }] }, 10, 'llm', []),
    node({ id: 'task-old', type: 'task', title: '旧件', status: 'done' }, 10, 'llm', []),
    node({ id: 'fix-late', type: 'task', title: '十五天后的修复', status: 'approved', edges: [{ type: 'source', to: 'task-old' }] }, 60 + 15 * 86_400, 'llm', []),
  ])
  const numbers = dora(input(graph, { advances: [deploy('a', 'b', 60, ['task-a', 'task-old'])] }))
  assert.equal(numbers.failed, 1)
})

test('变更失败率 marks a deployment when the first commit after it breaks the full trunk check within 14 days', () => {
  const graph = graphOf([node({ id: 'task-a', type: 'task', title: '普通', status: 'done' }, 10, 'llm', [])])
  const numbers = dora(input(graph, {
    advances: [deploy('a', 'b', 60, ['task-a']), refused('b', 'c', 70)],
    checks: [trunkCheck('c', false, 71)],
  }))
  // The next local record moves the trunk to c and its full check failed: the deployment at b is the suspect.
  assert.equal(numbers.failed, 1)
  const noSuccessor = dora(input(graph, { advances: [deploy('a', 'b', 60)], checks: [trunkCheck('c', false, 71)] }))
  assert.equal(noSuccessor.failed, 0)
  const laterCheck = dora(input(graph, {
    advances: [deploy('a', 'b', 60), refused('b', 'c', 70)],
    checks: [trunkCheck('c', false, 60 + 15 * 86_400)],
  }))
  assert.equal(laterCheck.failed, 0)
  // The successor landed verified and its commit's full check still failed afterwards: the design's wording
  // attributes the breakage to the deployment whose successor commit failed, so the deployment at b counts.
  const verifiedSuccessor = dora(input(graph, {
    advances: [deploy('a', 'b', 60, ['task-a']), deploy('b', 'c', 70)],
    checks: [trunkCheck('c', true, 70), trunkCheck('c', false, 71)],
  }))
  assert.equal(verifiedSuccessor.failed, 1)
})

test('a deployment counts once however many markers name it; an unreadable graph leaves the rate out and keeps the counts', () => {
  const graph = graphOf([
    node({ id: 'task-a', type: 'task', title: '重开又有修复', status: 'doing' }, 10, 'llm', [
      { at: at(65), actor: 'llm', op: 'status', from: 'done', to: 'doing', reason: '坏了' },
    ]),
    node({ id: 'fix', type: 'task', title: '修复', status: 'approved', edges: [{ type: 'source', to: 'task-a' }] }, 66, 'llm', []),
  ])
  const numbers = dora(input(graph, { advances: [deploy('a', 'b', 60, ['task-a'])] }))
  assert.equal(numbers.failed, 1)
  const unreadable = dora(input(undefined, { advances: [deploy('a', 'b', 60)], checks: [trunkCheck('c', false, 61)] }))
  assert.equal(unreadable.deploys, 1)
  assert.equal(unreadable.failed, undefined)
  assert.equal(unreadable.leadTasks, 0)
})

test('恢复时长 runs from each trunk failure of the window to the next passing trunk record; other kinds, out-of-window and unresolved failures stay out', () => {
  const commandFailure = trunkCheck('f', false, 90)
  const numbers = dora(input(graphOf([]), {
    checks: [
      trunkCheck('old', false, 20), // before the window
      trunkCheck('b', false, 60), // in window: restored by c at second 95, 35 s
      trunkCheck('e', false, 80), // in window: restored by c at second 95, 15 s
      { ...commandFailure, kind: 'commands', detail: { ...commandFailure.detail, kind: 'commands' } }, // a command check is not a trunk run
      trunkCheck('c', true, 95),
      trunkCheck('g', false, 99), // in window: no passing trunk record after it, unresolved
    ],
  }))
  assert.equal(numbers.restoreN, 2)
  assert.equal(numbers.restoreMs, 25_000)
})

test('the event body carries counts and medians, leaving a field out when its cohort is empty or the graph was unreadable', () => {
  assert.deepEqual(doraBody({ deploys: 2, leadTasks: 0, failed: 0, restoreN: 0 }), { deploys: 2, leadTasks: 0, failed: 0, restoreN: 0 })
  assert.deepEqual(
    doraBody({ deploys: 3, leadTasks: 2, leadMs: 13_500, restoreN: 1, restoreMs: 40_000 }),
    { deploys: 3, leadTasks: 2, leadMs: 13_500, restoreN: 1, restoreMs: 40_000 },
  )
  assert.deepEqual(doraBody({ deploys: 1, leadTasks: 0, restoreN: 0 }), { deploys: 1, leadTasks: 0, restoreN: 0 })
})

test('the numbers are pure: the same input computes the same numbers', () => {
  const graph = graphOf([node({ id: 'task-a', type: 'task', title: '普通', status: 'done' }, 10, 'llm', [dispatch(40)])])
  const one = dora(input(graph, { advances: [deploy('a', 'b', 60, ['task-a'])], checks: [trunkCheck('b', true, 61)] }))
  const two = dora(input(graph, { advances: [deploy('a', 'b', 60, ['task-a'])], checks: [trunkCheck('b', true, 61)] }))
  assert.deepEqual(one, two)
})

/** A lookup whose metrics service records what the row is handed. */
function hostWith(): { readonly lookup: ServiceLookup, readonly emitted: { readonly k: string, readonly body: unknown }[] } {
  const emitted: { readonly k: string, readonly body: unknown }[] = []
  const lookup: ServiceLookup = { get: (name) => name === 'glmHournessMetrics' ? { emit: (event: { k: string, body: unknown }) => { emitted.push(event) } } : undefined }
  return { lookup, emitted }
}

/** The tool over a temp project whose `.llm/execute` holds one verified advance; the graph stays unreadable. */
function weeklyTool(lookup: ServiceLookup): { readonly tool: ReturnType<typeof hournessReportTool>, readonly exec: ToolExecutionContext } {
  const cwd = mkdtempSync(join(tmpdir(), 'report-metrics-'))
  mkdirSync(join(cwd, '.llm', 'execute'), { recursive: true })
  const line = JSON.stringify({ ref: 'local', from: 'a', to: 'b', ok: true, at: new Date(NOW - 3_600_000).toISOString(), tasks: ['task-x'] })
  writeFileSync(join(cwd, '.llm', 'execute', 'advances.jsonl'), `${line}\n`)
  const tool = hournessReportTool({ lookup, isMain: () => true, graphDirOf: () => undefined, now: () => NOW })
  const exec = { agent: { id: 'main-1', session: { id: 's1', header: { cwd } } } } as unknown as ToolExecutionContext
  return { tool, exec }
}

test('the weekly call emits operate.dora from the journals it read; the morning call emits none', async () => {
  const host = hostWith()
  const { tool, exec } = weeklyTool(host.lookup)
  const weekly = await Promise.resolve(tool.execute({ kind: 'weekly' }, exec)) as { text: string }
  assert.ok(weekly.text.includes('# 周报'))
  const emitted = host.emitted.filter(event => event.k === 'operate.dora')
  assert.equal(emitted.length, 1)
  // The graph is unreadable here, so the dispatch-derived numbers are absent; the journals alone give the counts.
  assert.deepEqual(emitted[0]?.body, { deploys: 1, leadTasks: 0, restoreN: 0 })
  host.emitted.length = 0
  await Promise.resolve(tool.execute({ kind: 'morning' }, exec))
  assert.equal(host.emitted.filter(event => event.k === 'operate.dora').length, 0)
})
