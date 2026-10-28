import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { graphRevision, loadGraph, revisionOf } from '../src/graph/store.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { RemoteRoot, StreamItem, WatchFrame } from '../ui/src/dsh.ts'
import { decidedBy, graphRevisionOf, revisionOfBytes, statusText, visibleGraph } from '../ui/src/graph/model.ts'
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

test('status lines say what a node waits for', () => {
  const base = { history: [], options: [{ key: 'A', label: '甲案', consequence: '快' }, { key: 'B', label: '乙案', consequence: '稳' }], recommend: 'A' }
  const question = (fields: Partial<GraphNode>): GraphNode => ({ id: 'q', type: 'question', title: 'q', status: 'approved', parent: 'g', ...base, ...fields })
  assert.equal(statusText(question({})), '等你拍板')
  assert.equal(statusText(question({ decider: 'agent' })), 'agent 来定')
  assert.equal(statusText(question({ status: 'done', decision: 'B' })), '选了 B 乙案')
  assert.equal(statusText(question({ status: 'proposed' })), '等你批准')
  assert.equal(statusText({ id: 't', type: 'task', title: 't', status: 'doing', parent: 'g', history: [] }), '进行中')
  assert.equal(decidedBy({ decidedBy: 'llm' }), 'agent')
  assert.equal(decidedBy({ decidedBy: 'llm', relay: '选 A' }), 'relay')
  assert.equal(decidedBy({ decidedBy: 'human' }), 'human')
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
