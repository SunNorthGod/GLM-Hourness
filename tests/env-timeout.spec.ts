/**
 * The time limit of M4's own checks at approval time (src/env/timeout.ts,
 * M4 design §6.3.1 items 1-3, §14.2 decision three ①②③ and review N12):
 * `checkTimeout` over estimates and recent runs, the four sentences of
 * `timeoutText`, and the graph tools that return them for a tool node under
 * env and record each estimate they wrote, with the caller's session, in the
 * project's timing journal.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  appendTiming, argvDigest, checkKey, checkTimeout, CHECK_RECENT_RUNS, CHECK_TIMEOUT_CAP_MS, CHECK_TIMEOUT_FACTOR, CHECK_TIMEOUT_FLOOR_MS,
  envToolTimeouts, estimateLines, estimateOrigin, nextValue, parseTiming, readTiming, tidiedLines, tidyTiming, timeoutText, valueSourceText,
  type EstimateLine, type TimingLine,
} from '../src/env/timeout.ts'
import { apply } from '../src/graph/index.ts'
import { codePointCount } from '../src/graph/proposal.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { proposalLineRefusal } from '../src/graph/plan-text.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { ToolFinalResult } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings, seedAsHuman } from './graph-helpers.ts'

test('checkTimeout: three times the estimate, at least the floor, at most the ceiling; no estimate and no run is the ceiling', () => {
  assert.deepEqual(checkTimeout({ estimateS: 1, recentMs: [] }), { limitMs: 5_000, basis: 'estimate' })
  assert.deepEqual(checkTimeout({ estimateS: 3, recentMs: [] }), { limitMs: 9_000, basis: 'estimate' })
  assert.deepEqual(checkTimeout({ estimateS: 25, recentMs: [] }), { limitMs: 60_000, basis: 'estimate', capped: { wantedMs: 75_000 } })
  assert.deepEqual(checkTimeout({ recentMs: [] }), { limitMs: 60_000, basis: 'ceiling' })
  assert.deepEqual([CHECK_TIMEOUT_FACTOR, CHECK_TIMEOUT_FLOOR_MS, CHECK_TIMEOUT_CAP_MS, CHECK_RECENT_RUNS], [3, 5_000, 60_000, 10])
})

test('checkTimeout: after runs the slowest of the recent ten decides, the estimate gives way, and a run cut at its limit counts as the limit', () => {
  assert.deepEqual(checkTimeout({ estimateS: 1, recentMs: [3_000, 24_000, 2_000] }), { limitMs: 60_000, basis: 'runs', capped: { wantedMs: 72_000 } })
  // A first run stopped at its 5 s limit counts as 5 s: the next limit is three times it.
  assert.deepEqual(checkTimeout({ estimateS: 1, recentMs: [5_000] }), { limitMs: 15_000, basis: 'runs' })
  assert.deepEqual(checkTimeout({ recentMs: [800] }), { limitMs: 5_000, basis: 'runs' }, 'the floor holds after runs too')
  const old = [50_000, ...Array.from({ length: CHECK_RECENT_RUNS }, () => 2_000)]
  assert.deepEqual(checkTimeout({ recentMs: old }), { limitMs: 6_000, basis: 'runs' }, 'a run older than the last ten no longer counts')
  assert.deepEqual(checkTimeout({ estimateS: 30, recentMs: [], capMs: 120_000 }), { limitMs: 90_000, basis: 'estimate' }, 'the ceiling is a parameter')
})

test('timeoutText: the four sentences word for word, each the limit checkTimeout gives, short and plain enough for the plan', () => {
  const cases: ReadonlyArray<readonly [number | undefined, string]> = [
    [3, '超时 9 秒（估 3 秒，乘 3）'],
    [1, '超时 5 秒（估 1 秒，乘 3 不足 5 秒）'],
    [25, '超时 60 秒（估 25 秒，乘 3 超过 60 秒）'],
    [undefined, '超时 60 秒（没有估计，先用最长的）'],
  ]
  for (const [estimateS, text] of cases) {
    assert.equal(timeoutText(estimateS), text)
    assert.ok(codePointCount(text) <= 40, `${text}: at most 40 code points (N12)`)
    assert.deepEqual(plainWordsIn(text), [], text)
    // The sentence sits next to its check line: with the check name in bold it is one background line of the plan.
    assert.equal(proposalLineRefusal('background', `**eslint** ${text}`), undefined, text)
    assert.ok(text.startsWith(`超时 ${checkTimeout({ estimateS, recentMs: [] }).limitMs / 1000} 秒`), text)
  }
})

test('checkKey and argvDigest: the journal keys a check by node and name, and a changed command gets another digest', () => {
  assert.equal(checkKey('tool-3', 'eslint'), 'tool-3/eslint')
  const digest = argvDigest(['node', 'lint.mjs', '{files}'])
  assert.match(digest, /^[0-9a-f]{8}$/)
  assert.equal(argvDigest(['node', 'lint.mjs', '{files}']), digest)
  assert.notEqual(argvDigest(['node', 'lint.mjs', '--fix', '{files}']), digest)
  assert.notEqual(argvDigest(['node lint.mjs', '{files}']), digest, 'the split counts, not only the text')
})

const SLOW = '`check slow lines 1s $ node slow.mjs {files}` when *.txt'
const LINT = '`check lint lines $ node lint.mjs {files}`'
const FULL = 'check full tsc 25s $ node tsc.mjs'

/** A tool node under env as the engine stores it, with one history entry. */
function toolNode(acceptance: readonly string[], entry: GraphNode['history'][number], fields: Partial<GraphNode> = {}): GraphNode {
  return { id: 'tool-1', type: 'tool', title: 'Lint', status: 'approved', parent: 'env', acceptance, history: [entry], ...fields }
}

test('envToolTimeouts: one sentence per readable check line of a tool under env, none for other nodes', () => {
  const entry = { at: '2026-11-05T01:00:00.000Z', actor: 'llm', op: 'propose', reason: 'r' } as const
  assert.deepEqual(envToolTimeouts(toolNode([SLOW, '普通验收行', LINT, '`check bad lines 4 s $ x`', FULL], entry)), [
    { check: 'slow', text: '超时 5 秒（估 1 秒，乘 3 不足 5 秒）' },
    { check: 'lint', text: '超时 60 秒（没有估计，先用最长的）' },
    { check: 'full', text: '超时 60 秒（估 25 秒，乘 3 超过 60 秒）' },
  ])
  assert.deepEqual(envToolTimeouts(toolNode([], entry)), [], 'a tool without check lines has an empty list')
  assert.equal(envToolTimeouts(toolNode([SLOW], entry, { parent: 'goal-1' })), undefined, 'a tool outside env')
  assert.equal(envToolTimeouts(toolNode([SLOW], entry, { type: 'task' })), undefined, 'a task under env')
})

test('estimateLines: a propose records every line with an estimate; an edit only the lines it brought; the actor and time of the history entry are copied', () => {
  const at = new Date('2026-11-05T02:00:00.000Z')
  const proposed = toolNode([SLOW, LINT, FULL], { at: '2026-11-05T01:00:00.000Z', actor: 'llm', op: 'propose', reason: 'r' })
  const lines = estimateLines(proposed, 'session-1', at)
  assert.deepEqual(lines, [
    { kind: 'estimate', at: at.toISOString(), check: 'tool-1/slow', argv: argvDigest(['node', 'slow.mjs', '{files}']), estimateS: 1, node: 'tool-1', actor: 'llm', historyAt: '2026-11-05T01:00:00.000Z', session: 'session-1' },
    { kind: 'estimate', at: at.toISOString(), check: 'tool-1/full', argv: argvDigest(['node', 'tsc.mjs']), estimateS: 25, node: 'tool-1', actor: 'llm', historyAt: '2026-11-05T01:00:00.000Z', session: 'session-1' },
  ])
  const changedSlow = SLOW.replace('1s', '2s')
  const edited = toolNode([changedSlow, LINT, FULL], { at: '2026-11-05T03:00:00.000Z', actor: 'human', op: 'edit', reason: 'r', changes: { acceptance: { from: [SLOW, LINT, FULL], to: [changedSlow, LINT, FULL] } } })
  assert.deepEqual(estimateLines(edited, undefined, at).map(line => [line.check, line.estimateS, line.actor, line.historyAt, line.session]), [['tool-1/slow', 2, 'human', '2026-11-05T03:00:00.000Z', undefined]])
  const retitled = toolNode([SLOW], { at: '2026-11-05T03:00:00.000Z', actor: 'llm', op: 'edit', reason: 'r', changes: { title: { from: 'a', to: 'b' } } })
  assert.deepEqual(estimateLines(retitled, 's', at), [], 'an edit that leaves the acceptance conditions alone writes no estimate')
  const byHarness = toolNode([SLOW], { at: '2026-11-05T03:00:00.000Z', actor: 'harness', op: 'propose', reason: 'r' })
  assert.deepEqual(estimateLines(byHarness, 's', at), [], 'the journal names an llm or a human')
  assert.deepEqual(estimateLines(toolNode([SLOW], { at: 'x', actor: 'llm', op: 'propose', reason: 'r' }, { parent: 'goal-1' }), 's', at), [])
})

test('appendTiming appends one JSON line under env-checks and creates the directory', async () => {
  const home = await mkdtemp(join(tmpdir(), 'env-timing-'))
  try {
    const line: EstimateLine = { kind: 'estimate', at: 'a', check: 'tool-1/slow', argv: '0123abcd', estimateS: 1, node: 'tool-1', actor: 'llm', historyAt: 'h' }
    await appendTiming(home, line)
    await appendTiming(home, { ...line, at: 'b' })
    const text = await readFile(join(home, 'env-checks', 'timing.jsonl'), 'utf8')
    assert.deepEqual(text.trimEnd().split('\n').map(row => JSON.parse(row) as EstimateLine), [line, { ...line, at: 'b' }])
  }
  finally {
    await rm(home, { recursive: true, force: true })
  }
})

interface Fixture {
  readonly workspace: string
  readonly graph: string
  readonly runtime: FakeRuntime
  readonly call: (name: string, args?: unknown) => Promise<ToolFinalResult>
}

/** The graph row on a workspace that is a project (it has a `.llm`), with goal-1, the env feature and an approved task under goal-1. */
async function withGraphRow(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'env-timeout-'))
  try {
    const graph = join(workspace, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    await mkdir(join(workspace, '.llm'), { recursive: true })
    await seedAsHuman(graph, [
      { type: 'goal', title: '目标' },
      { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
      { type: 'feature', title: '别的', parent: 'goal-1' },
    ])
    const runtime = fakeRuntime({ natives: [], cwd: workspace })
    const dispose = apply(runtime.ctx, {})
    let calls = 0
    const call: Fixture['call'] = (name, args = {}) => runtime.ctx.tools.execute({ calls: [{ id: `call-${++calls}`, name, arguments: args }], agent: runtime.agent, signal: new AbortController().signal, log: { turn: runtime.progress.turn, step: runtime.progress.step } }).then(batch => batch.results[0].result)
    try {
      await body({ workspace, graph, runtime, call })
    }
    finally {
      dispose()
    }
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

function valueOf(result: ToolFinalResult): Record<string, unknown> {
  assert.equal(result.isError, false, JSON.stringify(result.content))
  return result.value as Record<string, unknown>
}

/** The timing journal's lines once `count` of them are there; the graph row writes it in the background. */
async function timingLines(workspace: string, count: number): Promise<EstimateLine[]> {
  const file = join(workspace, '.llm', 'env-checks', 'timing.jsonl')
  for (let tries = 0; tries < 100; tries++) {
    const lines = existsSync(file) ? (await readFile(file, 'utf8')).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as EstimateLine) : []
    if (lines.length >= count) return lines
    await new Promise(done => setTimeout(done, 20))
  }
  assert.fail(`the timing journal never reached ${count} lines`)
}

test('graph_propose of a tool under env returns a timeout per readable check line and records each estimate with the session', async () => {
  await withGraphRow(async ({ workspace, graph, call }) => {
    const value = valueOf(await call('graph_propose', { node: { id: 'tool-1', type: 'tool', title: 'Slow', parent: 'env', acceptance: [SLOW, LINT, '怎样算做完：跑得过'] }, reason: '加一个检查' }))
    assert.deepEqual(value.timeouts, [{ check: 'slow', text: '超时 5 秒（估 1 秒，乘 3 不足 5 秒）' }, { check: 'lint', text: '超时 60 秒（没有估计，先用最长的）' }])
    const node = (await loadGraph(graph)).nodes.get('tool-1')!
    const [line, ...rest] = await timingLines(workspace, 1)
    assert.deepEqual(rest, [], 'the line without an estimate writes none')
    assert.deepEqual({ ...line, at: undefined }, { kind: 'estimate', at: undefined, check: 'tool-1/slow', argv: argvDigest(['node', 'slow.mjs', '{files}']), estimateS: 1, node: 'tool-1', actor: 'llm', historyAt: node.history.at(-1)!.at, session: 'agent-1' })
  })
})

test('graph_edit of a tool under env returns the timeouts and records only the estimate it changed; other nodes and other operations carry none', async () => {
  await withGraphRow(async ({ workspace, graph, call }) => {
    const proposed = valueOf(await call('graph_propose', { node: { id: 'tool-1', type: 'tool', title: 'Slow', parent: 'env', acceptance: [SLOW, FULL] }, reason: '加检查' }))
    await timingLines(workspace, 2)
    const changed = SLOW.replace('1s', '3s')
    // An LLM edits any field of its own open proposal; the node still waits for the human.
    const edited = valueOf(await call('graph_edit', { id: 'tool-1', rev: proposed.rev, set: { acceptance: [changed, FULL] }, reason: '估高一点' }))
    assert.deepEqual(edited.timeouts, [{ check: 'slow', text: '超时 9 秒（估 3 秒，乘 3）' }, { check: 'full', text: '超时 60 秒（估 25 秒，乘 3 超过 60 秒）' }])
    const lines = await timingLines(workspace, 3)
    const node = (await loadGraph(graph)).nodes.get('tool-1')!
    assert.deepEqual(lines.slice(2).map(line => [line.check, line.estimateS, line.actor, line.historyAt, line.session]), [['tool-1/slow', 3, 'llm', node.history.at(-1)!.at, 'agent-1']])
    const comment = valueOf(await call('graph_comment', { id: 'tool-1', text: '备注' }))
    assert.equal(comment.timeouts, undefined, 'a comment is no propose or edit')
    const task = valueOf(await call('graph_propose', { node: { type: 'task', title: '任务', parent: 'feature-1', acceptance: [SLOW] }, reason: '别的节点' }))
    assert.equal(task.timeouts, undefined, 'a node that is not a tool under env carries none')
    const plain = valueOf(await call('graph_propose', { node: { id: 'tool-2', type: 'tool', title: '不在环境下', parent: 'feature-1', acceptance: [SLOW] }, reason: '别的分支' }))
    assert.equal(plain.timeouts, undefined, 'a tool outside env carries none')
    await new Promise(done => setTimeout(done, 100))
    assert.equal((await timingLines(workspace, 3)).length, 3, 'nothing else was journaled')
  })
})

test('graph_propose and graph_edit tell the caller where the timeouts go', async () => {
  await withGraphRow(({ runtime }) => {
    for (const name of ['graph_propose', 'graph_edit']) {
      const tool = runtime.scoped.find(candidate => candidate.name === name)!
      assert.match(tool.description, /A tool node under env comes back with timeouts: put each text verbatim next to its check line in the plan you show the human\.$/, name)
    }
    return Promise.resolve()
  })
})

test('a timing journal that cannot be written is a note on the graph row health; the write and its timeouts stand', async () => {
  await withGraphRow(async ({ workspace, runtime, call }) => {
    // A file where the directory should be: the append fails.
    await writeFile(join(workspace, '.llm', 'env-checks'), 'not a directory')
    const { result, warnings } = await captureWarnings(async () => {
      const value = valueOf(await call('graph_propose', { node: { id: 'tool-1', type: 'tool', title: 'Slow', parent: 'env', acceptance: [SLOW] }, reason: '加检查' }))
      const view = runtime.services.get(healthServiceName('graph')) as RowHealthView
      for (let tries = 0; tries < 100 && !(view.session('agent-1')?.reason.includes('检查的估计没记下') ?? false); tries++) await new Promise(done => setTimeout(done, 20))
      return { value, report: view.session('agent-1') }
    })
    assert.deepEqual(result.value.timeouts, [{ check: 'slow', text: '超时 5 秒（估 1 秒，乘 3 不足 5 秒）' }])
    assert.equal(result.report?.state, 'degraded')
    assert.match(result.report?.reason ?? '', /检查的估计没记下/)
    assert.ok(warnings.some(line => line.includes('检查的估计没记下')), 'warned')
  })
})

// ---------------------------------------------------------------- the journal the runner reads and writes (m4-checks B4)

const KEY = 'tool-1/slow'
const DIGEST = argvDigest(['node', 'slow.mjs', '{files}'])
const at = '2026-11-05T01:00:00.000Z'
const run = (ms: number, argv = DIGEST): TimingLine => ({ kind: 'run', at, check: KEY, argv, ms })

test('parseTiming keeps the five kinds and counts what it cannot read; readTiming reads no file as an empty journal and names any other failure', async () => {
  const text = [JSON.stringify(run(1)), 'not json', JSON.stringify({ kind: 'other', at, check: KEY, argv: DIGEST }), JSON.stringify({ kind: 'run', at, argv: DIGEST }), '', JSON.stringify({ kind: 'queue', at, check: KEY, argv: DIGEST, waitedMs: 60_000, running: 2, outcome: 'not-run' })].join('\n')
  const book = parseTiming(text)
  assert.deepEqual([book.lines.map(line => line.kind), book.bad], [['run', 'queue'], 3])
  const home = await mkdtemp(join(tmpdir(), 'env-timing-'))
  try {
    assert.deepEqual(await readTiming(home), { lines: [], bad: 0 })
    await mkdir(join(home, 'env-checks', 'timing.jsonl'), { recursive: true })
    const failed = await readTiming(home)
    assert.ok('error' in failed && failed.error.length > 0, JSON.stringify(failed))
  }
  finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('nextValue: the source of each value (estimate with the session the graph tools recorded, the harness, the ceiling), and no line while the value stands', () => {
  const node: GraphNode = toolNode([SLOW], { at: '2026-11-04T10:00:00.000Z', actor: 'llm', op: 'propose', reason: 'r' })
  const origin = estimateOrigin(node, SLOW, 'rev1')
  assert.deepEqual(origin, { node: 'tool-1', rev: 'rev1', actor: 'llm', at: '2026-11-04T10:00:00.000Z' })
  const estimate: EstimateLine = { kind: 'estimate', at, check: KEY, argv: DIGEST, estimateS: 1, node: 'tool-1', actor: 'llm', historyAt: '2026-11-04T10:00:00.000Z', session: 'sess-1' }
  const first = nextValue({ lines: [estimate], bad: 0 }, { check: KEY, argv: DIGEST, estimateS: 1, origin }, new Date(at))
  assert.deepEqual(first.line, { kind: 'value', at, check: KEY, argv: DIGEST, limitMs: 5_000, cap: { by: 'default' }, source: { by: 'estimate', node: 'tool-1', rev: 'rev1', actor: 'llm', at: '2026-11-04T10:00:00.000Z', session: 'sess-1', estimateS: 1 } })
  assert.equal(valueSourceText(first.line), '写检查的 agent 估 1 秒')
  assert.equal(valueSourceText(first.line, true), '写检查的 agent 估 1 秒，会话 sess-1')
  // Without the graph tools' line (a hand-edited file) the source has no session, and the report says so.
  const unrecorded = nextValue({ lines: [], bad: 0 }, { check: KEY, argv: DIGEST, estimateS: 1, origin }, new Date(at)).line
  assert.ok(unrecorded?.source.by === 'estimate' && unrecorded.source.session === undefined)
  assert.equal(valueSourceText(unrecorded, true), '写检查的 agent 估 1 秒，会话未记')
  const standing = nextValue({ lines: [estimate, first.line], bad: 0 }, { check: KEY, argv: DIGEST, estimateS: 1, origin }, new Date(at))
  assert.equal(standing.line, undefined, 'the same value under the same command writes nothing')
  // A run stopped at its 5 s limit counts as 5 s: the next value is 15 s, from the harness, with the old value.
  const after = nextValue({ lines: [first.line, { ...run(5_000), censored: true }], bad: 0 }, { check: KEY, argv: DIGEST, estimateS: 1, origin }, new Date(at))
  assert.deepEqual([after.line?.limitMs, after.line?.previousMs, after.line?.source], [15_000, 5_000, { by: 'harness', runs: [5_000], factor: 3, floorMs: 5_000 }])
  assert.equal(valueSourceText(after.line!), '系统按最近 1 次，最慢 5 秒')
  const ceiling = nextValue({ lines: [], bad: 0 }, { check: KEY, argv: DIGEST }, new Date(at)).line
  assert.deepEqual([ceiling?.limitMs, ceiling?.source], [60_000, { by: 'ceiling' }])
  assert.equal(valueSourceText(ceiling!), '没有估计，用上限')
  const capped = nextValue({ lines: [], bad: 0 }, { check: KEY, argv: DIGEST, estimateS: 25, origin }, new Date(at)).line
  assert.deepEqual([capped?.limitMs, capped?.capped], [60_000, { wantedMs: 75_000 }])
  assert.equal(valueSourceText(capped!), '想要 75 秒，被上限截在 60 秒', 'the board details say only that it is held')
  assert.equal(valueSourceText(capped!, true), '写检查的 agent 估 25 秒，会话未记；想要 75 秒，被上限截在 60 秒', 'the report keeps the source before it')
  // Runs under another command do not count: the value starts over from the estimate.
  const changed = nextValue({ lines: [first.line, run(20_000)], bad: 0 }, { check: KEY, argv: argvDigest(['node', 'slow2.mjs', '{files}']), estimateS: 1, origin }, new Date(at))
  assert.deepEqual([changed.timeout.limitMs, changed.line?.source.by], [5_000, 'estimate'])
})

test('estimateOrigin: the last edit that holds the whole line, else the propose; a human\'s edit makes it the human\'s', () => {
  const node: GraphNode = {
    ...toolNode([SLOW], { at: '2026-11-04T10:00:00.000Z', actor: 'llm', op: 'propose', reason: 'r' }),
    history: [
      { at: '2026-11-04T10:00:00.000Z', actor: 'llm', op: 'propose', reason: 'r' },
      { at: '2026-11-04T11:00:00.000Z', actor: 'human', op: 'edit', reason: '改预计', changes: { acceptance: { from: [LINT], to: [SLOW] } } },
      { at: '2026-11-04T12:00:00.000Z', actor: 'human', op: 'edit', reason: '改别的', changes: { title: { from: 'a', to: 'b' } } },
    ],
  }
  assert.deepEqual(estimateOrigin(node, SLOW, 'r2'), { node: 'tool-1', rev: 'r2', actor: 'human', at: '2026-11-04T11:00:00.000Z' })
  assert.deepEqual(estimateOrigin(node, LINT, 'r2'), { node: 'tool-1', rev: 'r2', actor: 'llm', at: '2026-11-04T10:00:00.000Z' })
})

test('tidying keeps per check the latest ten runs, twenty values, timeouts and queue lines, five estimates; it rewrites the file only when needed', async () => {
  const many = (kind: TimingLine['kind'], count: number): TimingLine[] => Array.from({ length: count }, (_, index) => ({ kind, at, check: KEY, argv: DIGEST, ms: index, limitMs: index, elapsedMs: index, waitedMs: index, running: 2, estimateS: 1, node: 'tool-1', actor: 'llm', historyAt: at, cap: { by: 'default' }, source: { by: 'ceiling' }, outcome: 'not-run' } as unknown as TimingLine))
  const lines = [...many('run', 15), ...many('value', 25), ...many('timeout', 22), ...many('queue', 21), ...many('estimate', 7), { ...run(1), check: 'tool-2/x' }]
  const kept = tidiedLines(lines)
  const count = (kind: string, check = KEY): number => kept.filter(line => line.kind === kind && line.check === check).length
  assert.deepEqual([count('run'), count('value'), count('timeout'), count('queue'), count('estimate'), count('run', 'tool-2/x')], [CHECK_RECENT_RUNS, 20, 20, 20, 5, 1])
  assert.equal((kept.find(line => line.kind === 'run') as { ms: number }).ms, 5, 'the oldest go first')
  const home = await mkdtemp(join(tmpdir(), 'env-tidy-'))
  try {
    await mkdir(join(home, 'env-checks'), { recursive: true })
    await writeFile(join(home, 'env-checks', 'timing.jsonl'), [...lines.map(line => JSON.stringify(line)), 'bad line', ''].join('\n'))
    assert.equal(await tidyTiming(home), undefined)
    const after = parseTiming(await readFile(join(home, 'env-checks', 'timing.jsonl'), 'utf8'))
    assert.deepEqual([after.lines.length, after.bad], [kept.length, 0])
    assert.equal(await tidyTiming(home), undefined, 'a tidy journal is left alone')
  }
  finally {
    await rm(home, { recursive: true, force: true })
  }
})
