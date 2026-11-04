import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { graphRevision, loadGraph, revisionOf } from '../src/graph/store.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { absoluteTime, byCreation, decidedBy, dotTone, graphRevisionOf, headlineGoals, historyText, liveGroups, nobodyRunningText, placeText, presenceText, progressOf, progressText, revisionOfBytes, statusText, tokensText, visibleGraph } from '../ui/src/graph/model.ts'
import { holderRecordOf } from '../src/shared/holder-record.ts'
import { firstVisit, graphHasHumanActorHistory, GUIDE_KEY, noGraphKey, readStamp, writeStamp } from '../ui/src/guide/state.ts'
import { cwdKeyOf, mainChatOf, openerOf, recordReads } from '../ui/src/graph/main-chat.ts'
import { GraphSource } from '../ui/src/graph/source.ts'
import type { RemoteRoot } from '../ui/src/dsh.ts'
import { initialSeen, nextSeen, seenKeyOf, seenRecordOf, watchVisibility, writeSeenRecord, type VisibilityHost } from '../ui/src/graph/seen.ts'
import { fakeRemote, fixtureTest, seedAsHuman, until } from './graph-helpers.ts'

/** The table card of the seeded questions (ORCHESTRATION.md §2.6). */
const CARD = {
  options: [{ key: 'A', label: '甲案', gain: '快', cost: '要返工一次' }, { key: 'B', label: '乙案', gain: '稳', cost: '多两天' }],
  recommend: 'B',
  crux: '这周要交付吗？',
  verdict: '是 → A；否 → B',
  weight: 'two-way',
}

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
    { type: 'question', title: '问人', parent: 'feature-1', ...CARD },
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
    { type: 'question', title: '再问', parent: 'task-3', ...CARD },
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

test('the header names every goal that is not closed, in id order, and the first goal when all are closed', () => {
  const goal = (id: string, status: GraphNode['status']): GraphNode => ({ id, type: 'goal', title: id, status, history: [] })
  const feature: GraphNode = { id: 'feature-1', type: 'feature', title: 'feature-1', status: 'doing', parent: 'hourness', history: [] }
  const graph = (...nodes: GraphNode[]) => ({ nodes: new Map(nodes.map(entry => [entry.id, entry])), revisions: new Map(), revision: '', issues: [] })
  const ids = (list: readonly GraphNode[]): string[] => list.map(entry => entry.id)
  assert.deepEqual(ids(headlineGoals(graph(goal('hourness', 'doing'), feature))), ['hourness'])
  // This repository's two root goals after split: glm-house sorts before hourness, and both are named; a closed goal is left out.
  assert.deepEqual(ids(headlineGoals(graph(goal('hourness', 'doing'), feature, goal('glm-house', 'approved'), goal('a-old', 'done')))), ['glm-house', 'hourness'])
  assert.deepEqual(ids(headlineGoals(graph(goal('hourness', 'done'), goal('glm-house', 'dropped')))), ['glm-house'])
  assert.deepEqual(headlineGoals(graph(feature)), [])
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
  assert.equal(statusText(question({})), '等你回话', 'the same words as statusPhrase and the flow bar')
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
    // The local record's key (seen.ts) comes from a node file's absolute path, never from stat on the directory (the host refuses it).
    assert.equal(source.nodesDirAbsolute(), join(graphDir, 'nodes'))
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
    // rc.3 refuses a file over the full-file cap with workspace-file/too-large (dsh-api-workspace-files readBytes).
    let tooLarge = true
    const refusal = (path: string): string => `"${path}" exceeds the 4096 byte full-file cap`
    const files = remote.workspaceFiles
    const capped: RemoteRoot = {
      ...remote,
      workspaceFiles: {
        ...files,
        readBytes: (session, path, options, signal) => tooLarge && path.endsWith('/task-3.json')
          ? Promise.resolve({ ok: false, error: { code: 'workspace-file/too-large', message: refusal(path) } })
          : files.readBytes(session, path, options, signal),
      },
    }
    const source = new GraphSource(capped, 'session-a')
    source.start()
    const first = await until(source, snapshot => snapshot.status === 'ready')
    assert.ok(first.status === 'ready')
    assert.deepEqual(first.unreadable, [{ file: 'nodes/task-3.json', message: refusal('docs/graph/nodes/task-3.json') }])
    assert.equal(first.graph.nodes.has('task-3'), false)
    // The next change frame for the file reads it again; a good read clears the report.
    push({ kind: 'ready' })
    await until(source, snapshot => snapshot.status === 'ready' && snapshot.live)
    tooLarge = false
    push({ kind: 'change', change: { absolutePath: join(graphDir, 'nodes', 'task-3.json') } })
    const after = await until(source, snapshot => snapshot.status === 'ready' && snapshot.unreadable.length === 0)
    assert.equal(after.status === 'ready' && after.graph.nodes.has('task-3'), true)
    // While live, the banner's 重新读取 (retry) reads every file again without waiting for a change frame.
    tooLarge = true
    push({ kind: 'change', change: { absolutePath: join(graphDir, 'nodes', 'task-3.json') } })
    await until(source, snapshot => snapshot.status === 'ready' && snapshot.unreadable.length === 1)
    tooLarge = false
    await source.retry()
    const retried = source.getSnapshot()
    assert.equal(retried.status === 'ready' && retried.live && retried.unreadable.length === 0 && retried.graph.nodes.has('task-3'), true)
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

test('the panel sources carry no write path: no commands.execute and no apply import under ui/src/graph', async () => {
  const dir = new URL('../ui/src/graph/', import.meta.url)
  const names = (await readdir(dir)).filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
  assert.ok(names.length > 0)
  for (const name of names) {
    const text = await readFile(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /commands\.execute/, name)
    assert.doesNotMatch(text, /from '\.\/apply\.ts'/, name)
    // The desktop host keeps visibilityState at hidden (docs/FACTS.md §3): the panel's visibility never reads it (2026-11-05).
    assert.doesNotMatch(text, /visibilityState\s*[!=]==|'visibilitychange'/, name)
  }
})

test('上次看之后 (seen.ts): arrivals and departures follow the ten-minute and five-second rules', () => {
  const t = (minutes: number, seconds = 0): number => minutes * 60_000 + seconds * 1000
  let state = initialSeen
  let step = nextSeen(state, 'mount', t(0), t(-50))
  state = step.state
  assert.equal(state.since, t(-50), 'the arrival reads the record')
  step = nextSeen(state, 'visible', t(0, 1), undefined)
  state = step.state
  assert.equal(state.visibleSince, t(0, 1))
  step = nextSeen(state, 'hidden', t(0, 7), undefined)
  assert.equal(step.departure, t(0, 7), 'six visible seconds are a departure')
  state = step.state
  step = nextSeen(state, 'visible', t(0, 9), t(0, 7))
  state = step.state
  assert.equal(state.since, t(-50), 'back within ten minutes: the same arrival, the same since')
  assert.equal(state.visibleSince, t(0, 9))
  step = nextSeen(state, 'hidden', t(0, 10), undefined)
  assert.equal(step.departure, undefined, 'two visible seconds are not a departure')
  state = step.state
  step = nextSeen(state, 'visible', t(12), t(0, 7))
  state = step.state
  assert.equal(state.since, t(0, 7), 'hidden longer than ten minutes (the last write was t(0,7)): a new arrival reads the record again')
  const brief = nextSeen(nextSeen(initialSeen, 'mount', t(0), undefined).state, 'visible', t(0, 1), undefined)
  assert.equal(nextSeen(brief.state, 'hidden', t(0, 2), undefined).departure, undefined, 'a glance writes nothing')
})

test('上次看之后 (seen.ts): the local record reads, writes and fails quietly, and the key follows the graph directory', () => {
  const backing = new Map<string, string>()
  const storage = { getItem: (key: string) => backing.get(key) ?? null, setItem: (key: string, value: string) => { backing.set(key, value) } } as Storage
  const windows = ['D:', 'Repo', 'docs', 'graph', 'nodes'].join('\\')
  assert.equal(seenRecordOf(storage, seenKeyOf(windows)), undefined)
  writeSeenRecord(storage, seenKeyOf(windows), 1_000)
  assert.equal(seenRecordOf(storage, seenKeyOf(windows)), 1_000, 'the key folds separators and case like the design says')
  assert.equal(seenRecordOf(undefined, 'x'), undefined, 'no storage: no record')
  const broken = { getItem: () => { throw new Error('full') }, setItem: () => { throw new Error('full') } } as unknown as Storage
  assert.equal(seenRecordOf(broken, 'x'), undefined, 'a broken read is no record')
  writeSeenRecord(broken, 'x', 1_000)
  assert.equal(backing.size, 1, 'a broken write stays quiet')
})

/** A host for watchVisibility the test drives: the focus it reports, a focus change, an observer answer. */
function visibilityHost(observer: boolean): { readonly host: VisibilityHost, focus: (value: boolean) => void, see: (value: boolean) => void, readonly listeners: () => number } {
  let focused = true
  const focusListeners = new Set<() => void>()
  const seeListeners = new Set<(value: boolean) => void>()
  return {
    host: {
      hasFocus: () => focused,
      onFocusChange: listener => {
        focusListeners.add(listener)
        return () => { focusListeners.delete(listener) }
      },
      ...(observer ? { observe: (listener: (value: boolean) => void) => { seeListeners.add(listener); return () => { seeListeners.delete(listener) } } } : {}),
    },
    focus: value => {
      focused = value
      for (const listener of [...focusListeners]) listener()
    },
    see: value => { for (const listener of [...seeListeners]) listener(value) },
    listeners: () => focusListeners.size + seeListeners.size,
  }
}

test('上次看之后 (seen.ts watchVisibility): visible is the window focus; the observer only vetoes; only changes are told, nothing after stop', () => {
  const told: boolean[] = []
  const fake = visibilityHost(true)
  const stop = watchVisibility(fake.host, value => { told.push(value) })
  assert.deepEqual(told, [true], 'the start tells the value at once; an observer that has not answered (the desktop host) does not veto')
  fake.see(true)
  assert.deepEqual(told, [true], 'the same value is not told again')
  fake.focus(false)
  fake.focus(true)
  assert.deepEqual(told, [true, false, true], 'window blur and focus')
  fake.see(false)
  fake.focus(true)
  assert.deepEqual(told, [true, false, true, false], 'the body off screen vetoes while focused')
  fake.see(true)
  stop()
  fake.focus(false)
  assert.deepEqual(told, [true, false, true, false, true], 'nothing after stop')
  assert.equal(fake.listeners(), 0, 'stop unsubscribes')
  const plain = visibilityHost(false)
  plain.focus(false)
  const second: boolean[] = []
  watchVisibility(plain.host, value => { second.push(value) })()
  assert.deepEqual(second, [false], 'without an observer and without focus: not visible')
})

test('上次看之后 (seen.ts): the mount is the arrival that reads the record, so the first stretch of a visit knows the last departure', () => {
  const left = 1_000_000
  const mounted = nextSeen(initialSeen, 'mount', left + 60_000, left).state
  const shown = nextSeen(mounted, 'visible', left + 60_001, left).state
  assert.equal(shown.since, left, 'the changes start at the last departure, not at 最近一天')
  assert.equal(nextSeen(initialSeen, 'visible', left + 60_001, left).state.since, undefined, 'without the mount the record is never read (the bug the panel had)')
  const away = nextSeen(shown, 'unmount', left + 70_001, undefined)
  assert.equal(away.departure, left + 70_001, 'ten visible seconds, then the unmount: a departure')
})

test('主 Agent 的对话 (main-chat.ts recordReads): one read at the start, visible or not; a turn to visible reads and polls every 30 s; hidden stops the polling', () => {
  let reads = 0
  const timers: Array<{ ms: number, task: () => void, live: boolean }> = []
  const every = (ms: number, task: () => void): (() => void) => {
    const timer = { ms, task, live: true }
    timers.push(timer)
    return () => { timer.live = false }
  }
  const tick = (): void => { for (const timer of timers.filter(entry => entry.live)) timer.task() }
  const hidden = recordReads(() => { reads += 1 }, false, every)
  assert.equal(reads, 1, 'the mount reads once even while hidden')
  assert.equal(timers.length, 0, 'no polling while hidden')
  hidden.setVisible(true)
  assert.deepEqual([reads, timers.length, timers[0]?.ms], [2, 1, 30_000], 'turning visible reads and starts the 30-second poll')
  tick()
  assert.equal(reads, 3)
  hidden.setVisible(true)
  assert.deepEqual([reads, timers.length], [3, 1], 'visible again changes nothing')
  hidden.setVisible(false)
  tick()
  assert.equal(reads, 3, 'hidden: the poll stopped')
  hidden.stop()
  hidden.setVisible(true)
  assert.equal(reads, 3, 'nothing after stop')
  reads = 0
  const visible = recordReads(() => { reads += 1 }, true, every)
  assert.deepEqual([reads, timers.filter(entry => entry.live).length], [1, 1], 'a visible mount reads once and polls, no second read')
  visible.stop()
  assert.equal(timers.filter(entry => entry.live).length, 0, 'stop ends the poll')
})

test('主 Agent 的对话 (main-chat.ts openerOf): the jump calls openSession on the service, so a method that reads this still works; no service, no jump', () => {
  class Workspace {
    readonly lifetime = { signal: 'alive' }
    opened: string[] = []
    openSession(target: string): void {
      // The desktop's uiWorkspace reads this.lifetime.signal here; a detached call would throw.
      void this.lifetime.signal
      this.opened.push(target)
    }
  }
  const workspace = new Workspace()
  const open = openerOf(workspace)
  assert.ok(open !== undefined)
  open('session-2')
  assert.deepEqual(workspace.opened, ['session-2'])
  assert.equal(openerOf(undefined), undefined)
  assert.equal(openerOf({}), undefined)
})

test('主 Agent 的对话 (MainChat): a readable record decides by itself, an absent one says so, an unreadable one falls back', () => {
  const here = { kind: 'held', sessionId: 's-1' } as const
  assert.deepEqual(mainChatOf(here, 's-1', ['s-1']), { kind: 'here' }, 'the fallback is not consulted when the record reads')
  assert.deepEqual(mainChatOf(here, 's-2', []), { kind: 'there', sessionId: 's-1', guessed: false })
  assert.deepEqual(mainChatOf({ kind: 'absent' } as const, 's-1', ['s-2']), { kind: 'absent' }, 'a readable none stays none')
  const unreadable = { kind: 'unreadable', reason: 'denied' } as const
  assert.deepEqual(mainChatOf(unreadable, 's-1', ['s-2']), { kind: 'there', sessionId: 's-2', guessed: true })
  assert.deepEqual(mainChatOf(unreadable, 's-1', ['s-1']), { kind: 'here' }, 'the fallback finding this session makes it the main chat')
  const lost = mainChatOf(unreadable, 's-1', [])
  assert.equal(lost.kind, 'lost')
  assert.match(lost.kind === 'lost' ? lost.reason : '', /记录读不出来/)
  assert.match(lost.kind === 'lost' ? lost.reason : '', /没有哪个对话在主 Agent 模式/)
  const many = mainChatOf(unreadable, 's-1', ['s-2', 's-3', 's-2'])
  assert.equal(many.kind, 'lost')
  assert.match(many.kind === 'lost' ? many.reason : '', /有 2 个对话在主 Agent 模式/, 'duplicates fold')
})

test('主 Agent 的对话 (MainChat): the record shape and the working-directory key follow M3', () => {
  const record = holderRecordOf({ version: 1, sessionId: 's-9', graphDir: 'D:/R/docs/graph', since: '2026-11-04T00:00:00.000Z', commandId: 'c-1' })
  assert.deepEqual(record, { version: 1, sessionId: 's-9', graphDir: 'D:/R/docs/graph', since: '2026-11-04T00:00:00.000Z', commandId: 'c-1' })
  for (const bad of [undefined, null, 3, {}, { version: 2, sessionId: 's', graphDir: 'd', since: 'x', commandId: 'y' }, { version: 1, graphDir: 'd', since: 'x', commandId: 'y' }, { version: 1, sessionId: '', graphDir: 'd', since: 'x', commandId: 'y' }]) {
    assert.equal(holderRecordOf(bad), undefined, JSON.stringify(bad) ?? 'undefined')
  }
  assert.equal(cwdKeyOf('D:\\Repo\\ws\\', true), 'd:/repo/ws', 'backslashes, trailing slash, Windows lower case')
  assert.equal(cwdKeyOf('/home/r/ws/', false), '/home/r/ws', 'no lower case off Windows')
})

graphTest('上手页 (guide state): first visit ends at a record or at human history, and the records fail quietly', async ({ dir }) => {
  const backing = new Map<string, string>()
  const storage = { getItem: (key: string) => backing.get(key) ?? null, setItem: (key: string, value: string) => { backing.set(key, value) } } as Storage
  assert.equal(firstVisit(storage, false), true, 'no record, no human history: the first visit')
  writeStamp(storage, GUIDE_KEY, '2026-11-04T00:00:00.000Z')
  assert.equal(firstVisit(storage, false), false, 'a record ends it')
  assert.equal(firstVisit(undefined, false), true, 'no storage behaves like no record')
  assert.equal(firstVisit(storage, true), false, 'human history on the graph ends it, record or not')
  const graph = await loadGraph(dir)
  assert.equal(graphHasHumanActorHistory(graph), true, 'the seed writes human history (seedAsHuman)')
  const fresh = await mkdtemp(join(tmpdir(), 'guide-fresh-'))
  try {
    await openEngine(fresh).apply('llm', { op: 'propose', reason: '建图', node: { type: 'goal', title: '项目图' } })
    assert.equal(graphHasHumanActorHistory(await loadGraph(fresh)), false, 'an llm-only graph is a new user')
    const relayed = await openEngine(fresh).apply('llm', { op: 'propose', reason: '建图', node: { type: 'task', title: '带原话', parent: 'goal-1' }, relay: '人随口说的一句话' })
    assert.ok(relayed.ok, JSON.stringify(relayed))
    assert.equal(graphHasHumanActorHistory(await loadGraph(fresh)), false, 'a relayed llm entry does not count (P5-02)')
  }
  finally {
    await rm(fresh, { recursive: true, force: true })
  }
  const broken = { getItem: () => { throw new Error('full') }, setItem: () => { throw new Error('full') } } as unknown as Storage
  assert.equal(readStamp(broken, GUIDE_KEY), undefined, 'a broken read is no record')
  writeStamp(broken, GUIDE_KEY, '2026-11-04T00:00:00.000Z')
  assert.equal(noGraphKey('D:\\Repo\\ws'), 'glm-hourness.nograph.v1:d:/repo/ws')
})
