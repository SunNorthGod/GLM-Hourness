/**
 * The graph row's wiring beyond its tools and rule (docs/ORCHESTRATION.md
 * §2.7, §6.4; docs/DESIGN.md §2.5): graph-files-only denials in the
 * violation journal, the service the guard row reads, and the row health
 * of glm-hourness/graph and glm-hourness/graph-panel (whose services come
 * through the fake cordis inject).
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { apply } from '../src/graph/index.ts'
import { holderFileOf, holderHome } from '../src/graph/main-agent-holder.ts'
import { apply as applyPanel } from '../src/graph/panel-row.ts'
import type { ToolFinalResult } from '../src/shared/dsh-min.ts'
import { GRAPH_SERVICE, graphFocus, graphService } from '../src/graph/service.ts'
import { collectHealth, healthServiceName, type HealthEntry, type RowHealthView } from '../src/shared/health.ts'
import { fakeInjector, fakeRuntime, serviceStore, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'

interface Fixture {
  readonly workspace: string
  readonly graph: string
  readonly home: string
  readonly runtime: FakeRuntime
  readonly call: (name: string, args: unknown) => Promise<ToolFinalResult>
}

async function withRow(body: (fixture: Fixture) => Promise<void>, config: { dir?: string } = {}): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-row-'))
  try {
    const graph = join(workspace, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    const seeded = await openEngine(graph).apply('human', { op: 'propose', reason: '建图', node: { type: 'goal', title: '项目图' } })
    assert.ok(seeded.ok, JSON.stringify(seeded))
    const home = join(workspace, '.llm')
    const runtime = fakeRuntime({ natives: ['Write', 'pwsh'], cwd: workspace, route: { provider: 'glm-zcode', model: 'glm-5.3' } })
    apply(runtime.ctx, { ...config, home })
    let counter = 0
    const call: Fixture['call'] = (name, args) => runtime.ctx.tools.execute({ callId: `call-${++counter}`, name, arguments: args, agent: runtime.agent, signal: new AbortController().signal })
    await body({ workspace, graph, home, runtime, call })
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

/** The journal write is fire-and-forget (mkdir, then append): wait until the file has a line, two seconds at most. */
async function journalLines(file: string): Promise<Array<Record<string, unknown>>> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const text = await readFile(file, 'utf8')
      if (text.endsWith('\n')) return text.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`no journal line in ${file}`)
}

function entry(runtime: FakeRuntime, row: 'graph' | 'graph-panel'): HealthEntry {
  return collectHealth(runtime.ctx, runtime.agent.session!.id).find(item => item.row === row)!
}

test('a graph-files-only denial goes to the violation journal of the project directory, with the calling agent', async () => {
  await withRow(async ({ home, runtime, call }) => {
    const result = await call('Write', { file_path: 'docs/graph/nodes/goal-1.json', content: '{}' })
    assert.equal(result.isError, true)
    const lines = await journalLines(join(home, 'audit', 'violations.jsonl'))
    assert.equal(lines.length, 1)
    const [line] = lines
    assert.deepEqual([line?.rule, line?.tool, line?.agentId, line?.sessionId], ['graph-files-only', 'Write', runtime.agent.id, runtime.agent.session?.id])
    assert.equal(line?.correction, result.content[0]?.text?.replace(/^Error: /, ''))
  })
})

test('the row provides the graph service: the directory per working directory and the graph tool names; it leaves with the row', () => {
  const runtime = fakeRuntime({ natives: [] })
  const dispose = apply(runtime.ctx, {})
  const service = graphService(runtime.ctx)!
  assert.equal(service.dirFor(join(tmpdir(), 'ws')), join(tmpdir(), 'ws', 'docs', 'graph'))
  assert.equal(service.dirFor(undefined), undefined)
  assert.deepEqual([service.isGraphTool('graph_comment'), service.isGraphTool('graph_focus'), service.isGraphTool('Write')], [true, true, false])
  dispose()
  assert.equal(runtime.services.has(GRAPH_SERVICE), false)
  assert.equal(runtime.services.has(healthServiceName('graph')), false)
})

test('the graph service says what a session has in focus: the history first, as the step projection reads it, else the memory of graph_focus; reading changes nothing', async () => {
  await withRow(async ({ runtime, call }) => {
    const service = graphFocus(runtime.ctx)!
    const session = runtime.agent.session!
    assert.equal(service.focusOf(session), undefined, 'no focus yet')
    assert.equal((await call('graph_focus', { id: 'goal-1' })).isError, false)
    assert.equal(service.focusOf(session), 'goal-1', 'the memory graph_focus keeps, while the history shows nothing')
    // The history shows a focus that is not the memory's: a person who rewound the conversation, and the history wins.
    runtime.history.push(
      { role: 'assistant', content: [{ type: 'tool-call', id: 'c-1', name: 'graph_focus', arguments: JSON.stringify({ id: 'task-7' }) }] },
      { role: 'tool', toolCallId: 'c-1', isError: false, content: [] },
    )
    assert.equal(service.focusOf(session), 'task-7')
    assert.equal(service.focusOf(session), 'task-7', 'reading twice gives the same answer')
    // A call whose result is an error does not move the focus.
    runtime.history.push(
      { role: 'assistant', content: [{ type: 'tool-call', id: 'c-2', name: 'graph_focus', arguments: JSON.stringify({ id: 'task-8' }) }] },
      { role: 'tool', toolCallId: 'c-2', isError: true, content: [] },
    )
    assert.equal(service.focusOf(session), 'task-7')
    // The service for a reader of focus needs focusOf; the guard's reader does not.
    assert.ok(graphService(runtime.ctx) !== undefined)
    const bare = serviceStore()
    bare.provide(GRAPH_SERVICE, { dirFor: () => undefined, isGraphTool: () => false })
    assert.equal(graphFocus(bare), undefined)
    assert.ok(graphService(bare) !== undefined)
  })
})

test('row health: tools registered at activation; after a call the session reports the graph, its size and the focus', async () => {
  await withRow(async ({ graph, runtime, call }) => {
    const view = runtime.services.get(healthServiceName('graph')) as RowHealthView
    assert.deepEqual([view.activation().state, view.activation().reason], ['active', '图工具已注册（13 个）；图目录 docs/graph（按会话工作目录解析）'])
    assert.equal(entry(runtime, 'graph').status, 'idle')
    await call('graph_open', {})
    assert.deepEqual([entry(runtime, 'graph').status, entry(runtime, 'graph').reason], ['active', `图 ${graph}，1 个节点；还没设焦点（graph_focus）`])
    await call('graph_focus', { id: 'goal-1' })
    assert.equal(entry(runtime, 'graph').reason, `图 ${graph}，1 个节点；焦点 goal-1`)
    await call('graph_show', { id: 'nope' }) // a refused call reports too
    assert.equal(entry(runtime, 'graph').status, 'active')
    await writeFile(join(graph, 'nodes', 'broken.json'), '{')
    await call('graph_open', {})
    assert.deepEqual([entry(runtime, 'graph').status, entry(runtime, 'graph').reason], ['degraded', `图 ${graph}，1 个节点；1 处校验错误，写入一律被拒；焦点 goal-1`])
  })
})

test('row health: a missing graph directory degrades the activation and the session', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-row-missing-'))
  try {
    const missing = join(workspace, 'nowhere')
    const runtime = fakeRuntime({ natives: [], cwd: workspace })
    const { warnings } = await captureWarnings(() => { apply(runtime.ctx, { dir: missing }) })
    assert.match(warnings.join('\n'), /does not exist/)
    const view = runtime.services.get(healthServiceName('graph')) as RowHealthView
    assert.deepEqual([view.activation().state, view.activation().reason], ['degraded', `图工具已注册（13 个）；图目录 ${missing} 还不存在`])
    await runtime.ctx.tools.execute({ callId: 'c1', name: 'graph_open', arguments: {}, agent: runtime.agent, signal: new AbortController().signal })
    const session = entry(runtime, 'graph')
    assert.equal(session.status, 'degraded')
    assert.match(session.reason, /^图目录找不到：no project graph at /)
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('row health: a bad config or a failed registration leaves the row inactive', async () => {
  const bad = fakeRuntime({ natives: [] })
  await captureWarnings(() => { apply(bad.ctx, { dir: '  ' }) })
  assert.deepEqual(entry(bad, 'graph'), { row: 'graph', status: 'inactive', reason: 'config.dir 不是非空路径，图工具未注册' })
  const store = serviceStore()
  await captureWarnings(() => { apply({ ...store, tools: { register: () => { throw new Error('tool "graph_show" is already registered') } }, on: () => () => {} }, {}) })
  assert.deepEqual(collectHealth(store, 's1').find(item => item.row === 'graph'), { row: 'graph', status: 'inactive', reason: '图工具注册失败：tool "graph_show" is already registered' })
  assert.equal(store.services.has(GRAPH_SERVICE), false)
})

test('graph-panel health is an activation status: the commands, the live projection and stopping subagents', async () => {
  const commands = { register: () => () => {} }
  const services = {
    sessionProjections: { register: () => () => {}, snapshot: () => ({ values: {} }) },
    agents: { get: () => undefined },
    subagents: { interrupt: () => {} },
  }
  const full = fakeRuntime({ natives: [] })
  applyPanel({ ...full.ctx, commands, inject: fakeInjector(services).inject })
  assert.deepEqual(entry(full, 'graph-panel'), { row: 'graph-panel', status: 'active', reason: '命令 /graph-run 已注册；现场投影 graphLive 与位置投影 hournessProject 已注册；能停子 agent' })
  const noInject = fakeRuntime({ natives: [] })
  applyPanel({ ...noInject.ctx, commands })
  assert.deepEqual(entry(noInject, 'graph-panel'), { row: 'graph-panel', status: 'degraded', reason: '命令 /graph-run 已注册；宿主没有 inject，现场投影未注册；宿主没有 inject，停不了子 agent' })
  // Services arrive after activation and leave again: degraded while one is missing, active once all are there.
  const late = fakeRuntime({ natives: [] })
  const host = fakeInjector({ agents: services.agents })
  applyPanel({ ...late.ctx, commands, inject: host.inject })
  assert.deepEqual(entry(late, 'graph-panel'), { row: 'graph-panel', status: 'degraded', reason: '命令 /graph-run 已注册；现场投影等 sessionProjections 服务；停子 agent 等 agents、subagents 服务' })
  host.provide('sessionProjections', services.sessionProjections)
  host.provide('subagents', services.subagents)
  assert.equal(entry(late, 'graph-panel').status, 'active')
  host.remove('subagents')
  assert.deepEqual(entry(late, 'graph-panel'), { row: 'graph-panel', status: 'degraded', reason: '命令 /graph-run 已注册；现场投影 graphLive 与位置投影 hournessProject 已注册；停子 agent 等 agents、subagents 服务' })
  const noCommand = fakeRuntime({ natives: [] })
  await captureWarnings(() => { applyPanel({ ...noCommand.ctx, commands: { register: () => { throw new Error('taken') } } }) })
  assert.equal(entry(noCommand, 'graph-panel').status, 'inactive')
  assert.match(entry(noCommand, 'graph-panel').reason, /^\/graph-run 注册失败：taken；/)
  // The one command's registration fails: there is nothing to withdraw, the row stays off.
  const withdrawn: string[] = []
  const second = fakeRuntime({ natives: [] })
  await captureWarnings(() => { applyPanel({ ...second.ctx, commands: { register: definition => { if (definition.name === 'graph-run') throw new Error('taken'); return () => { withdrawn.push(definition.name) } } } }) })
  assert.deepEqual(withdrawn, [])
  assert.match(entry(second, 'graph-panel').reason, /^\/graph-run 注册失败：taken；/)
})

test('the project projection names the holder record: the path through the graph row service, or the reason', () => {
  const commands = { register: () => () => {} }
  const definitions: Array<{ readonly key: string, readonly init: (header: unknown) => unknown }> = []
  const services = {
    sessionProjections: { register: (definition: never) => { definitions.push(definition); return () => {} }, snapshot: () => ({ values: {} }) },
    agents: { get: () => undefined },
    subagents: { interrupt: () => {} },
  }
  const runtime = fakeRuntime({ natives: [] })
  // The inject callback's context carries the parent's `get` (fake-rc3): the projection reads the graph row's service through it.
  const store = serviceStore()
  store.provide(GRAPH_SERVICE, { dirFor: (cwd: string | undefined) => cwd === undefined ? undefined : join(cwd, 'docs', 'graph'), isGraphTool: () => false })
  applyPanel({ ...runtime.ctx, commands, inject: fakeInjector(services, { get: (key: string) => store.get(key) }).inject })
  const project = definitions.find(definition => definition.key === 'hournessProject')
  assert.ok(project !== undefined, 'the project projection is registered next to the live one')
  const workspace = join(tmpdir(), 'panel-ws')
  const view = project.init({ cwd: workspace }) as { readonly holderFile: string | null, readonly reason?: string }
  assert.equal(view.holderFile, holderFileOf(holderHome(runtime.ctx), join(workspace, 'docs', 'graph')))
  assert.equal(view.reason, undefined)
  // No graph service (or no graph directory): no path, and the reason says why.
  const bare = fakeRuntime({ natives: [] })
  applyPanel({ ...bare.ctx, commands, inject: fakeInjector(services, { get: () => undefined }).inject })
  const project2 = definitions.slice(2).find(definition => definition.key === 'hournessProject')!
  assert.deepEqual(project2.init({ cwd: workspace }), { holderFile: null, reason: '图行服务不在，或这个工作区没有图目录' })
  assert.deepEqual(project2.init(null), { holderFile: null, reason: '图行服务不在，或这个工作区没有图目录' })
})
