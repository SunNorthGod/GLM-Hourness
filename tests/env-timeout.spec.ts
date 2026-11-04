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
  envToolTimeouts, estimateLines, timeoutText, type EstimateLine,
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
    const call: Fixture['call'] = (name, args = {}) => runtime.ctx.tools.execute({ callId: `call-${++calls}`, name, arguments: args, agent: runtime.agent, signal: new AbortController().signal })
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
