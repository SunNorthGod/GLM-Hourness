import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { graphRevision, loadGraph, revisionOf } from '../src/graph/store.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { RemoteRoot, StreamItem, WatchFrame } from '../ui/src/dsh.ts'
import { absoluteTime, byCreation, decidedBy, dotTone, graphRevisionOf, historyText, liveGroups, nobodyRunningText, placeText, presenceText, progressOf, progressText, revisionOfBytes, statusText, tokensText, visibleGraph } from '../ui/src/graph/model.ts'
import { GraphSource, type GraphSnapshot } from '../ui/src/graph/source.ts'
import { fixtureTest, seedAsHuman } from './graph-helpers.ts'

/**
 * goal-1
 *   feature-1 doing
 *     task-1 done
 *     task-2 done
 *     task-3 approved
 *     question-1 approved (human)
 *   feature-2 done
 *     task-4 done
 *   feature-3 proposed (llm)
 */
async function seed(dir: string): Promise<void> {
  await seedAsHuman(dir, [
    { type: 'goal', title: '目标' },
    { type: 'feature', title: '在做', parent: 'goal-1' },
    { type: 'task', title: '甲', parent: 'feature-1' },
    { type: 'task', title: '乙', parent: 'feature-1' },
    { type: 'task', title: '丙', parent: 'feature-1' },
    { type: 'question', title: '问人', parent: 'feature-1', options: [{ key: 'A', label: '甲案', consequence: '快' }, { key: 'B', label: '乙案', consequence: '稳' }], recommend: 'A' },
    { type: 'feature', title: '做完', parent: 'goal-1' },
    { type: 'task', title: '丁', parent: 'feature-2' },
  ])
  const engine = openEngine(dir)
  const rev = async (id: string): Promise<string> => (await loadGraph(dir)).revisions.get(id)!
  const done = async (id: string): Promise<void> => {
    const result = await engine.apply('human', { op: 'status', id, rev: await rev(id), to: 'done', reason: '完成', evidence: [{ kind: 'commit', ref: 'abc1234' }] })
    assert.ok(result.ok, JSON.stringify(result))
  }
  const result = await engine.apply('human', { op: 'status', id: 'feature-1', rev: await rev('feature-1'), to: 'doing', reason: '开工' })
  assert.ok(result.ok)
  for (const id of ['task-1', 'task-2', 'task-4', 'feature-2']) await done(id)
  assert.ok((await engine.apply('llm', { op: 'propose', reason: '新分支', node: { type: 'feature', title: '提议', parent: 'goal-1' } })).ok)
}

const graphTest = fixtureTest(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'graph-panel-model-'))
  await seed(dir)
  return { dir }
})

graphTest('revisions computed with Web Crypto match the store\'s node:crypto ones', async ({ dir }) => {
  const graph = await loadGraph(dir)
  const bytes = await readFile(join(dir, 'nodes', 'task-1.json'))
  assert.equal(await revisionOfBytes(bytes), revisionOf(bytes))
  assert.equal(await graphRevisionOf(graph.revisions), graphRevision(graph.revisions))
  assert.equal(await graphRevisionOf(graph.revisions), graph.revision)
})

graphTest('filters: open hides closed subtrees and counts closed children, mine keeps what waits for the human', async ({ dir }) => {
  const graph = await loadGraph(dir)
  const open = visibleGraph(graph, 'open')
  assert.deepEqual([...open.nodes.keys()].sort(), ['feature-1', 'feature-3', 'goal-1', 'question-1', 'task-3'])
  assert.deepEqual([...open.hiddenClosed].sort(), [['feature-1', 2], ['goal-1', 1]])
  const mine = visibleGraph(graph, 'mine')
  assert.deepEqual([...mine.nodes.keys()].sort(), ['feature-1', 'feature-3', 'goal-1', 'question-1'])
  assert.equal(visibleGraph(graph, 'all').nodes.size, graph.nodes.size)
})

graphTest('progress counts work children only; decided questions are counted apart and risks not at all', async ({ dir }) => {
  // A risk under feature-1, and a question under task-3 that the human decides: m1-parity's shape, a task whose only children are decided questions.
  await seedAsHuman(dir, [
    { type: 'risk', title: '风险', parent: 'feature-1' },
    { type: 'question', title: '再问', parent: 'task-3', options: [{ key: 'A', label: '甲案', consequence: '快' }, { key: 'B', label: '乙案', consequence: '稳' }], recommend: 'A' },
  ])
  const decided = await openEngine(dir).apply('human', { op: 'decide', id: 'question-2', rev: (await loadGraph(dir)).revisions.get('question-2')!, option: 'A', reason: '快' })
  assert.ok(decided.ok, JSON.stringify(decided))
  const graph = await loadGraph(dir)
  assert.deepEqual(progressOf(graph, 'feature-1'), { done: 2, total: 3, decided: 0, questions: 1 })
  assert.deepEqual(progressText(progressOf(graph, 'feature-1')), { work: '工作完成 2/3', questions: '待决已定 0/1' })
  assert.deepEqual(progressOf(graph, 'task-3'), { done: 0, total: 0, decided: 1, questions: 1 })
  assert.deepEqual(progressText(progressOf(graph, 'task-3')), { work: undefined, questions: '待决已定 1/1' }, 'no work children: no work progress, so no bar')
  assert.deepEqual(progressOf(graph, 'goal-1'), { done: 1, total: 3, decided: 0, questions: 0 }, 'direct children only: feature-1 doing, feature-2 done, feature-3 proposed')
  assert.deepEqual(progressText(progressOf(graph, 'task-1')), { work: undefined, questions: undefined })
})

test('现场 says where an idle agent was, and what it cannot see when nothing runs', () => {
  assert.equal(placeText('甲', 'doing', true), '在「甲」')
  assert.equal(placeText('甲', 'doing', false), '停在「甲」')
  assert.equal(placeText('甲', 'done', false), '上次在「甲」')
  assert.equal(placeText('甲', 'dropped', false), '上次在「甲」')
  // The count is of tasks: Doing passes the tasks in progress, not the features that contain them.
  assert.equal(nobodyRunningText(0), '这个会话里没有 agent 在跑。')
  assert.equal(nobodyRunningText(3), '这个会话里没有 agent 在跑。进行中的 3 个任务可能在别的会话或 DSH 之外推进。')
})

test('lists follow the graph view\'s sibling order: creation time, then id, not file-name order', () => {
  const node = (id: string, at: string): GraphNode => ({ id, type: 'task', title: id, status: 'doing', parent: 'g', history: [{ at, actor: 'llm', op: 'propose' }] })
  // File-name order of the real graph: m1-10 before m1-2, m1-parity and m1-2 before m1.
  const nodes = [node('m1-10', '2026-10-27T03:00:00Z'), node('m1-2', '2026-10-27T02:00:00Z'), node('m1-parity', '2026-10-28T01:00:00Z'), node('m1', '2026-10-27T01:00:00Z'), node('m1-3', '2026-10-27T02:00:00Z')]
  const graph = { nodes: new Map(nodes.map(entry => [entry.id, entry])), revisions: new Map(), revision: '', issues: [] }
  assert.deepEqual([...nodes].sort(byCreation(graph)).map(entry => entry.id), ['m1', 'm1-2', 'm1-3', 'm1-10', 'm1-parity'], 'm1-2 and m1-3 share a time and fall back to id order')
})

test('现场 keeps the idle main agent in view and folds only children', () => {
  const agent = (id: string, main: boolean, running: boolean, view: unknown) => ({ id, main, running, view })
  const main = agent('main', true, false, {})
  const child = agent('child', false, true, {})
  const stopped = agent('stopped', false, false, {})
  const earlier = agent('earlier', false, false, undefined)
  const ids = (list: readonly { readonly id: string }[]): string[] => list.map(entry => entry.id)
  // A child runs (background dispatch): the idle main agent waits for the human and is not 已停下.
  const busy = liveGroups([main, child, stopped, earlier])
  assert.deepEqual([ids(busy.running), ids(busy.quiet), ids(busy.folded)], [['child'], ['main'], ['stopped', 'earlier']])
  // Nothing runs: idle main and stopped children each get a line; only children from before this app start fold.
  const idle = liveGroups([main, { ...child, running: false }, earlier])
  assert.deepEqual([ids(idle.running), ids(idle.quiet), ids(idle.folded)], [[], ['main', 'child'], ['earlier']])
  // A main agent without live data yet is not listed (the section says there is no data).
  assert.deepEqual(liveGroups([agent('main', true, false, undefined)]).quiet, [])
})

test('token counts and times read like DSH\'s: 282K tok, tooltips with the local minute', () => {
  assert.deepEqual([tokensText(517), tokensText(12_240), tokensText(282_400), tokensText(1_234_567)], ['517', '12.2K', '282K', '1.2M'])
  assert.equal(absoluteTime(new Date(2026, 9, 28, 9, 5, 30).toISOString()), '2026-10-28 09:05')
  assert.equal(absoluteTime('not a time'), 'not a time')
})

test('status lines say what a node waits for', () => {
  const base = { history: [], options: [{ key: 'A', label: '甲案', consequence: '快' }, { key: 'B', label: '乙案', consequence: '稳' }], recommend: 'A' }
  const question = (fields: Partial<GraphNode>): GraphNode => ({ id: 'q', type: 'question', title: 'q', status: 'approved', parent: 'g', ...base, ...fields })
  assert.equal(statusText(question({})), '等你拍板')
  assert.equal(statusText(question({ decider: 'agent' })), 'agent 来定')
  assert.equal(statusText(question({ status: 'done', decision: 'B' })), '选了 B 乙案')
  assert.equal(statusText(question({ status: 'proposed' })), '等你批准')
  assert.equal(statusText({ id: 't', type: 'task', title: 't', status: 'doing', parent: 'g', history: [] }), '进行中')
  // Child-row dots: a proposal is dashed even though the human has to act on it; the red dot is for questions the human decides.
  assert.equal(dotTone(question({ status: 'proposed' })), 'proposed')
  assert.equal(dotTone(question({})), 'wait')
  assert.equal(dotTone(question({ decider: 'agent' })), 'approved')
  assert.equal(dotTone({ id: 't', type: 'task', title: 't', status: 'done', parent: 'g', history: [] }), 'done')
  assert.equal(decidedBy({ decidedBy: 'llm' }), 'agent')
  assert.equal(decidedBy({ decidedBy: 'llm', relay: '选 A' }), 'relay')
  assert.equal(decidedBy({ decidedBy: 'human' }), 'human')
})

test('history lines name the edited fields and do not repeat the relay label', () => {
  const at = '2026-10-28T13:26:37.663Z'
  // m1-parity's relayed edit: the stored reason opens with 用户：, the display drops it; the entry is not touched.
  const relayed = { at, actor: 'llm', op: 'edit', reason: '用户：额度扣减看不出来，按代码级别一致验收', relay: '看量或者扣减看不出来的。\n\nB，彻底一样', changes: { acceptance: { from: ['a'], to: ['b'] } } } as const
  assert.deepEqual(historyText(relayed), { who: '你（经对话）', what: '编辑验收条件：额度扣减看不出来，按代码级别一致验收' })
  assert.equal(relayed.reason, '用户：额度扣减看不出来，按代码级别一致验收')
  // Without a relay the reason is shown as written; several fields follow the write order of EDITABLE_FIELDS.
  assert.deepEqual(historyText({ at, actor: 'llm', op: 'edit', reason: '用户：原话', changes: { acceptance: { from: null, to: ['x'] }, body: { from: null, to: 'y' } } }), { who: 'agent', what: '编辑正文、验收条件：用户：原话' })
  assert.deepEqual(historyText({ at, actor: 'human', op: 'decide', reason: '稳', option: 'B' }), { who: '你', what: '拍板 B：稳' })
  assert.deepEqual(historyText({ at, actor: 'human', op: 'comment', text: '看一下' }), { who: '你', what: '批注：看一下' })
})

test('history lines say the result: the new status or verification, the edge, the other node of a supersede', () => {
  const at = '2026-10-28T13:26:37.663Z'
  assert.deepEqual(historyText({ at, actor: 'harness', op: 'status', reason: '派发', from: 'approved', to: 'doing' }), { who: 'harness', what: '改为「进行中」：派发' })
  assert.deepEqual(historyText({ at, actor: 'llm', op: 'status', reason: 'L4 两条验收满足', from: 'doing', to: 'done' }), { who: 'agent', what: '改为「完成」：L4 两条验收满足' })
  assert.deepEqual(historyText({ at, actor: 'llm', op: 'verify', reason: '探针通过', from: 'unverified', to: 'sandbox' }), { who: 'agent', what: '验证为「沙盒验证」：探针通过' })
  assert.deepEqual(historyText({ at, actor: 'llm', op: 'link', reason: '先做读', edge: { type: 'depends', to: 'task-2' } }), { who: 'agent', what: '加连线 依赖 → task-2：先做读' })
  assert.deepEqual(historyText({ at, actor: 'human', op: 'unlink', edge: { type: 'source', to: 'q-1' } }), { who: '你', what: '删连线 来源 → q-1' })
  assert.deepEqual(historyText({ at, actor: 'human', op: 'supersede', reason: '换方案', by: 'decision-2' }), { who: '你', what: '被 decision-2 取代：换方案' })
  assert.deepEqual(historyText({ at, actor: 'human', op: 'supersede', reason: '换方案', edge: { type: 'supersedes', to: 'decision-1' } }), { who: '你', what: '取代 decision-1：换方案' })
})

test('run-control presence lines say the panel sees only its own DSH session', () => {
  assert.equal(presenceText('doing', ['主 Agent', '子 agent']), '在这里干活：主 Agent、子 agent')
  assert.equal(presenceText('approved', []), '这个 DSH 会话里没有 agent 在做它')
  assert.equal(presenceText('doing', []), '这个 DSH 会话里没有 agent 在做它；状态是进行中，活可能在别的会话或 DSH 之外')
  assert.equal(presenceText('done', []), undefined)
})

/** A Remote face over a directory on disk, with a change feed the test drives. */
function fakeRemote(workspace: string): { readonly remote: RemoteRoot, readonly push: (frame: WatchFrame) => void } {
  const queue: WatchFrame[] = []
  let wake: (() => void) | undefined
  const push = (frame: WatchFrame): void => {
    queue.push(frame)
    wake?.()
  }
  let disposed = false
  const remote: RemoteRoot = {
    workspaceFiles: {
      list: async (_session, path) => {
        try {
          const entries = await readdir(join(workspace, path), { withFileTypes: true })
          return { ok: true, value: { path, entries: entries.map(entry => ({ name: entry.name, type: entry.isFile() ? 'file' : 'directory' })), truncated: false } }
        }
        catch {
          return { ok: false, error: { code: 'workspace-file/not-found', message: `no entry at "${path}"` } }
        }
      },
      readBytes: async (_session, path) => {
        try {
          return { ok: true, value: { absolutePath: join(workspace, path), data: new Uint8Array(await readFile(join(workspace, path))) } }
        }
        catch {
          return { ok: false, error: { code: 'workspace-file/not-found', message: path } }
        }
      },
      changes: () => undefined,
    },
    commands: { execute: () => Promise.resolve({ ok: true, value: undefined }) },
    $stream: <T>() => ({
      async *[Symbol.asyncIterator]() {
        while (!disposed) {
          const frame = queue.shift()
          if (frame === undefined) {
            await new Promise<void>(resolve => { wake = resolve })
            continue
          }
          yield { value: frame as T, accept: () => {} } satisfies StreamItem<T>
        }
      },
      dispose: () => {
        disposed = true
        wake?.()
        return Promise.resolve()
      },
    }),
  }
  return { remote, push }
}

async function until(source: GraphSource, check: (snapshot: GraphSnapshot) => boolean): Promise<GraphSnapshot> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = source.getSnapshot()
    if (check(snapshot)) return snapshot
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`timed out; last snapshot ${JSON.stringify(source.getSnapshot()).slice(0, 200)}`)
}

test('the source reads the graph, goes live on ready, and follows a write through the change feed', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-panel-source-'))
  const graphDir = join(workspace, 'docs', 'graph')
  try {
    await mkdir(graphDir, { recursive: true })
    await seed(graphDir)
    const { remote, push } = fakeRemote(workspace)
    const source = new GraphSource(remote, 'session-a')
    source.start()
    const first = await until(source, snapshot => snapshot.status === 'ready')
    assert.equal(first.status === 'ready' && first.graph.revision, (await loadGraph(graphDir)).revision)
    assert.deepEqual(first.status === 'ready' && first.items.questions.map(entry => entry.id), ['question-1'])
    push({ kind: 'ready' })
    await until(source, snapshot => snapshot.status === 'ready' && snapshot.live)

    const engine = openEngine(graphDir)
    const decided = await engine.apply('human', { op: 'decide', id: 'question-1', rev: (await loadGraph(graphDir)).revisions.get('question-1')!, option: 'B', reason: '稳' })
    assert.ok(decided.ok)
    push({ kind: 'change', change: { absolutePath: join(graphDir, 'nodes', 'question-1.json') } })
    const after = await until(source, snapshot => snapshot.status === 'ready' && snapshot.items.questions.length === 0)
    assert.equal(after.status === 'ready' && after.graph.revision, (await loadGraph(graphDir)).revision)

    await rm(join(graphDir, 'nodes', 'task-3.json'))
    push({ kind: 'change', change: { absolutePath: join(graphDir, 'nodes', 'task-3.json'), absent: true } })
    await until(source, snapshot => snapshot.status === 'ready' && !snapshot.graph.nodes.has('task-3'))
    source.dispose()
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('a node file the panel cannot read is reported, not dropped silently, and clears on a good read', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-panel-unreadable-'))
  const graphDir = join(workspace, 'docs', 'graph')
  try {
    await mkdir(graphDir, { recursive: true })
    await seed(graphDir)
    const { remote, push } = fakeRemote(workspace)
    let locked = true
    const files = remote.workspaceFiles
    const flaky: RemoteRoot = {
      ...remote,
      workspaceFiles: {
        ...files,
        readBytes: (session, path, options, signal) => locked && path.endsWith('/task-3.json')
          ? Promise.resolve({ ok: false, error: { code: 'workspace-file/io', message: 'file is locked' } })
          : files.readBytes(session, path, options, signal),
      },
    }
    const source = new GraphSource(flaky, 'session-a')
    source.start()
    const first = await until(source, snapshot => snapshot.status === 'ready')
    assert.ok(first.status === 'ready')
    assert.deepEqual(first.unreadable, [{ file: 'nodes/task-3.json', message: 'file is locked' }])
    assert.equal(first.graph.nodes.has('task-3'), false)
    // The next change frame for the file reads it again; a good read clears the report.
    push({ kind: 'ready' })
    await until(source, snapshot => snapshot.status === 'ready' && snapshot.live)
    locked = false
    push({ kind: 'change', change: { absolutePath: join(graphDir, 'nodes', 'task-3.json') } })
    const after = await until(source, snapshot => snapshot.status === 'ready' && snapshot.unreadable.length === 0)
    assert.equal(after.status === 'ready' && after.graph.nodes.has('task-3'), true)
    source.dispose()
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('a workspace without a graph is reported missing, and retry finds one created later', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-panel-missing-'))
  try {
    const { remote } = fakeRemote(workspace)
    const source = new GraphSource(remote, 'session-a')
    source.start()
    await until(source, snapshot => snapshot.status === 'missing')
    await mkdir(join(workspace, 'docs', 'graph', 'nodes'), { recursive: true })
    await source.retry()
    const empty = await until(source, snapshot => snapshot.status === 'ready')
    assert.equal(empty.status === 'ready' && empty.graph.nodes.size, 0)
    source.dispose()
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
