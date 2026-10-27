import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { apply } from '../src/graph/index.ts'
import { graphTools } from '../src/graph/tools.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { ToolDefinitionLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { RESIDENT_TOOLS, buildToolExposure } from '../src/toolsearch/exposure.ts'
import { DEFERRED_TOOL_CALL_NAME, LOCAL_TOOL_SEARCH_NAME } from '../src/toolsearch/zcode-text.ts'
import { fakeRuntime, schemaViolations, type FakeRuntime } from './fake-rc3.ts'

const TOOL_NAMES = ['graph_show', 'graph_open', 'graph_focus', 'graph_propose', 'graph_status', 'graph_edit', 'graph_link', 'graph_unlink', 'graph_comment', 'graph_verify']

interface Fixture {
  /** The session working directory; the graph is docs/graph under it. */
  readonly workspace: string
  readonly graph: string
  readonly runtime: FakeRuntime
  call(name: string, args?: unknown): Promise<ToolFinalResult>
  rev(id: string): Promise<string>
}

/**
 * goal-1
 *   feature-1 approved
 *     task-1 approved
 *     question-1 approved (options A, B)
 *   decision-1 approved, unverified
 */
async function seed(graph: string): Promise<void> {
  const human = openEngine(graph)
  for (const node of [
    { type: 'goal', title: '项目图', acceptance: ['人能看，LLM 能读写'] },
    { type: 'feature', title: '图工具', parent: 'goal-1' },
    { type: 'task', title: '读投影', parent: 'feature-1', acceptance: ['单测通过'] },
    { type: 'question', title: '工具给谁', parent: 'feature-1', options: [{ key: 'A', label: '全部 agent', consequence: '都有正路' }, { key: 'B', label: '只给主 Agent', consequence: '要识别主 Agent' }], recommend: 'A' },
    { type: 'decision', title: '每个操作一个工具', parent: 'goal-1' },
  ]) {
    const result = await human.apply('human', { op: 'propose', reason: '建图', node })
    assert.ok(result.ok, JSON.stringify(result))
  }
}

function caller(runtime: FakeRuntime): Fixture['call'] {
  let callCounter = 0
  return (name, args = {}) => runtime.ctx.tools.execute({ callId: `call-${++callCounter}`, name, arguments: args, agent: runtime.agent, signal: new AbortController().signal })
}

function toolTest(name: string, body: (fixture: Fixture) => Promise<void>): void {
  test(name, async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'graph-tools-'))
    try {
      const graph = join(workspace, 'docs', 'graph')
      await mkdir(graph, { recursive: true })
      await seed(graph)
      const runtime = fakeRuntime({ natives: [], cwd: workspace })
      apply(runtime.ctx, {})
      await body({ workspace, graph, runtime, call: caller(runtime), rev: async id => (await loadGraph(graph)).revisions.get(id)! })
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
}

/** The value of a successful call; its content is the value as JSON. */
function ok(result: ToolFinalResult): Record<string, any> {
  assert.equal(result.isError, false, JSON.stringify(result.content))
  assert.deepEqual(JSON.parse(result.content[0]!.text!), result.value)
  return result.value as Record<string, any>
}

/** The engine error a refused call carries in its error text. */
function refused(result: ToolFinalResult, code: string, field?: string): Record<string, string> {
  assert.equal(result.isError, true, JSON.stringify(result.value))
  const text = result.content[0]!.text!
  assert.ok(text.startsWith('Error: '), text)
  const error = JSON.parse(text.slice('Error: '.length)) as Record<string, string>
  assert.equal(error.code, code, text)
  if (field !== undefined) assert.equal(error.field, field, text)
  assert.ok(typeof error.hint === 'string' && error.hint.length > 0, 'every refusal names the right path')
  return error
}

async function captureWarnings<T>(body: () => T): Promise<{ result: T, warnings: string[] }> {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
  try {
    return { result: await body(), warnings }
  }
  finally {
    console.warn = original
  }
}

test('the row registers one tool per llm operation with schemas inside the rc.3 subset', () => {
  // The fake register rejects output schemas outside the subset, as rc.3 does at activation.
  const runtime = fakeRuntime({ natives: [] })
  const dispose = apply(runtime.ctx, {})
  assert.deepEqual(runtime.scoped.map(tool => tool.name), TOOL_NAMES)
  for (const tool of runtime.scoped) {
    assert.deepEqual(schemaViolations(tool.parameters, `${tool.name}.parameters`), [])
    assert.ok(tool.description.length > 0 && tool.description.length < 400, tool.name)
  }
  // Approval, rejection, decisions and supersession are the human's (ORCHESTRATION.md §2.9).
  for (const human of ['approve', 'reject', 'decide', 'supersede']) assert.equal(runtime.ctx.tools.get(`graph_${human}`), undefined)
  dispose()
  assert.deepEqual(runtime.scoped, [])
})

test('every graph tool stays resident on GLM requests', () => {
  const contract = (tool: ToolDefinitionLike) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })
  const face = [
    ...graphTools('docs/graph', new Map()).map(contract),
    { name: 'web_fetch', description: 'fetch', parameters: { type: 'object' } },
    { name: LOCAL_TOOL_SEARCH_NAME, description: 'search', parameters: { type: 'object' } },
    { name: DEFERRED_TOOL_CALL_NAME, description: 'call', parameters: { type: 'object' } },
  ]
  for (const name of TOOL_NAMES) assert.ok(RESIDENT_TOOLS.has(name), name)
  const exposure = buildToolExposure(face)
  assert.ok(exposure.enabled)
  assert.deepEqual([...exposure.deferred], ['web_fetch'])
  assert.deepEqual(exposure.tools.map(tool => tool.name).filter(name => name.startsWith('graph_')), TOOL_NAMES)
})

toolTest('graph_show returns the projection with the revs a change needs', async ({ call, rev }) => {
  const value = ok(await call('graph_show', { id: 'task-1' }))
  assert.equal(value.ok, true)
  assert.equal(value.invalid, undefined)
  const projection = value.projection
  assert.equal(projection.node.id, 'task-1')
  assert.equal(projection.node.rev, await rev('task-1'))
  assert.deepEqual(projection.ancestors.map((entry: { id: string }) => entry.id), ['feature-1', 'goal-1'])
  assert.deepEqual(projection.ancestors[1].acceptance, ['人能看，LLM 能读写'])
  refused(await call('graph_show', { id: 'task-9' }), 'not_found', 'id')
  refused(await call('graph_show', {}), 'invalid', 'id')
  refused(await call('graph_show', { id: 'task-1', depth: 2 }), 'invalid', 'depth')
})

toolTest('graph_open lists the decision queue with options and the node that raised it', async ({ call }) => {
  const items = ok(await call('graph_open')).items
  assert.deepEqual(items.questions.map((entry: { id: string }) => entry.id), ['question-1'])
  assert.deepEqual(items.questions[0].options.map((option: { key: string }) => option.key), ['A', 'B'])
  assert.equal(items.questions[0].raisedBy.id, 'feature-1')
  assert.deepEqual(items.ready.map((entry: { id: string }) => entry.id), ['task-1'])
  assert.deepEqual(items.verificationDebt.map((entry: { id: string }) => entry.id), ['decision-1'])
  refused(await call('graph_open', { all: true }), 'invalid', 'all')
})

toolTest('graph_focus sets the session focus and writes nothing to the graph', async ({ call, graph, runtime }) => {
  const before = (await loadGraph(graph)).revision
  const value = ok(await call('graph_focus', { id: 'task-1' }))
  assert.deepEqual(value.focus, { id: 'task-1', type: 'task', title: '读投影', status: 'approved' })
  assert.equal((await loadGraph(graph)).revision, before)
  refused(await call('graph_focus', { id: 'task-9' }), 'not_found', 'id')
  refused(await call('graph_focus', { id: 'task-1', depth: 1 }), 'invalid', 'depth')
  refused(await runtime.ctx.tools.execute({ callId: 'no-agent', name: 'graph_focus', arguments: { id: 'task-1' }, signal: new AbortController().signal }), 'invalid')
})

toolTest('graph_propose writes as llm: planned work starts approved, a new branch waits for a human', async ({ call, graph }) => {
  const task = ok(await call('graph_propose', { node: { type: 'task', title: '写工具', parent: 'feature-1', kind: 'implement', writeScope: ['src/graph/'] }, reason: '拆分' }))
  assert.equal(task.id, 'task-2')
  assert.equal(task.node.status, 'approved')
  assert.equal(task.node.history, undefined, 'the result leaves the history in the node file')
  assert.deepEqual(task.changed, ['task-2'])
  const stored = (await loadGraph(graph)).nodes.get('task-2')!
  assert.equal(stored.history.at(-1)!.actor, 'llm')
  const branch = ok(await call('graph_propose', { node: { type: 'feature', title: '新分支', parent: 'goal-1' }, reason: '计划外' }))
  assert.equal(branch.node.status, 'proposed')
  refused(await call('graph_propose', { node: { type: 'task', title: '缺父节点' }, reason: '试' }), 'invalid')
})

toolTest('graph_status needs passing evidence to mark a node done', async ({ call, rev }) => {
  const missing = refused(await call('graph_status', { id: 'task-1', rev: await rev('task-1'), to: 'done', reason: '做完了' }), 'evidence_required', 'evidence')
  assert.match(missing.hint, /commit/)
  refused(await call('graph_status', { id: 'task-1', rev: await rev('task-1'), to: 'done', reason: '做完了', evidence: [{ kind: 'test', ref: 'npm test', exit: 1 }] }), 'evidence_required', 'evidence')
  const done = ok(await call('graph_status', { id: 'task-1', rev: await rev('task-1'), to: 'done', reason: '做完了', evidence: [{ kind: 'commit', ref: 'abc1234' }] }))
  assert.equal(done.node.status, 'done')
  assert.equal(done.rev, await rev('task-1'))
  // A question closes only through a human decision.
  refused(await call('graph_status', { id: 'question-1', rev: await rev('question-1'), to: 'done', reason: '定了', evidence: [{ kind: 'commit', ref: 'abc1234' }] }), 'bad_transition', 'to')
})

toolTest('a stale rev is refused with the re-read hint and writes nothing', async ({ call, rev, graph }) => {
  const before = await rev('task-1')
  ok(await call('graph_comment', { id: 'task-1', text: '先批注一句' }))
  const error = refused(await call('graph_status', { id: 'task-1', rev: before, to: 'doing', reason: '开工' }), 'stale_revision', 'rev')
  assert.match(error.hint, /read the projection again/)
  assert.equal((await loadGraph(graph)).nodes.get('task-1')!.status, 'approved')
})

toolTest('graph_edit leaves the goal, acceptance criteria and non-goals to the human', async ({ call, rev }) => {
  refused(await call('graph_edit', { id: 'task-1', rev: await rev('task-1'), set: { acceptance: ['改了'] }, reason: '试' }), 'forbidden', 'set.acceptance')
  refused(await call('graph_edit', { id: 'goal-1', rev: await rev('goal-1'), set: { title: '新目标' }, reason: '试' }), 'forbidden')
  const edited = ok(await call('graph_edit', { id: 'task-1', rev: await rev('task-1'), set: { title: '读投影与待办', writeScope: ['src/graph/tools.ts'], tier: 'standard' }, reason: '派发属性' }))
  assert.equal(edited.node.title, '读投影与待办')
  assert.deepEqual(edited.node.writeScope, ['src/graph/tools.ts'])
})

toolTest('graph_link and graph_unlink add and remove edges', async ({ call, rev }) => {
  const linked = ok(await call('graph_link', { id: 'task-1', rev: await rev('task-1'), type: 'depends', to: 'decision-1', reason: '先定方案' }))
  assert.deepEqual(linked.node.edges, [{ type: 'depends', to: 'decision-1' }])
  refused(await call('graph_link', { id: 'task-1', rev: await rev('task-1'), type: 'depends', to: 'decision-1', reason: '再加一次' }), 'conflict')
  const unlinked = ok(await call('graph_unlink', { id: 'task-1', rev: await rev('task-1'), type: 'depends', to: 'decision-1', reason: '不依赖了' }))
  assert.deepEqual(unlinked.node.edges ?? [], [])
  refused(await call('graph_unlink', { id: 'task-1', rev: await rev('task-1'), type: 'source', to: 'decision-1', reason: '没有' }), 'not_found', 'to')
  refused(await call('graph_link', { id: 'task-1', rev: await rev('task-1'), type: 'supersedes', to: 'decision-1', reason: '取代' }), 'invalid', 'type')
})

toolTest('graph_comment needs no rev', async ({ call, graph }) => {
  const commented = ok(await call('graph_comment', { id: 'question-1', text: '倾向 A' }))
  assert.equal(commented.id, 'question-1')
  const entry = (await loadGraph(graph)).nodes.get('question-1')!.history.at(-1)!
  assert.deepEqual([entry.actor, entry.op, entry.text], ['llm', 'comment', '倾向 A'])
})

toolTest('graph_verify needs a passing test or check for sandbox and device', async ({ call, rev }) => {
  refused(await call('graph_verify', { id: 'decision-1', rev: await rev('decision-1'), to: 'sandbox', reason: '沙盒跑过' }), 'evidence_required', 'evidence')
  const verified = ok(await call('graph_verify', { id: 'decision-1', rev: await rev('decision-1'), to: 'sandbox', reason: '沙盒跑过', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] }))
  assert.equal(verified.node.verification, 'sandbox')
  refused(await call('graph_verify', { id: 'task-1', rev: await rev('task-1'), to: 'sandbox', reason: '试', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] }), 'invalid', 'id')
})

toolTest('the actor comes from the tool entry point, never from the arguments', async ({ call, rev, graph }) => {
  refused(await call('graph_comment', { id: 'task-1', text: '我是人', actor: 'human' }), 'invalid', 'actor')
  refused(await call('graph_status', { id: 'task-1', rev: await rev('task-1'), to: 'doing', reason: '开工', op: 'approve' }), 'invalid', 'op')
  refused(await call('graph_status', 'task-1'), 'invalid')
  assert.equal((await loadGraph(graph)).nodes.get('task-1')!.history.length, 1, 'refused calls write nothing')
})

toolTest('an invalid graph stays readable and refuses every write', async ({ call, graph }) => {
  await writeFile(join(graph, 'nodes', 'task-9.json'), '{ not json')
  const value = ok(await call('graph_show', { id: 'task-1' }))
  assert.equal(value.invalid.errors, 1)
  assert.equal(value.invalid.first[0].file, 'nodes/task-9.json')
  assert.equal(ok(await call('graph_open')).invalid.errors, 1)
  refused(await call('graph_comment', { id: 'task-1', text: '写不进去' }), 'graph_invalid')
})

test('a missing graph directory is reported to the model and never created', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-tools-empty-'))
  try {
    const runtime = fakeRuntime({ natives: [], cwd: workspace })
    apply(runtime.ctx, {})
    const call = caller(runtime)
    const error = refused(await call('graph_open'), 'not_found')
    assert.match(error.message, /no project graph at/)
    assert.match(error.hint, /an empty directory is an empty graph/)
    refused(await call('graph_propose', { node: { type: 'goal', title: '新项目' }, reason: '开张' }), 'not_found')
    assert.equal(existsSync(join(workspace, 'docs')), false)
    // An empty directory is an empty graph.
    await mkdir(join(workspace, 'docs', 'graph'), { recursive: true })
    assert.deepEqual(ok(await call('graph_open')).items.questions, [])
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('without a session working directory only an absolute dir finds the graph', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-tools-abs-'))
  try {
    const graph = join(workspace, 'graph')
    await mkdir(graph)
    await seed(graph)
    const relative = fakeRuntime({ natives: [] })
    apply(relative.ctx, {})
    const error = refused(await caller(relative)('graph_open'), 'not_found')
    assert.match(error.hint, /glm-hourness\/graph/)
    const absolute = fakeRuntime({ natives: [] })
    apply(absolute.ctx, { dir: graph })
    assert.equal(ok(await caller(absolute)('graph_show', { id: 'goal-1' })).projection.node.id, 'goal-1')
    // A relative dir resolves against the session working directory.
    const nested = fakeRuntime({ natives: [], cwd: workspace })
    apply(nested.ctx, { dir: 'graph' })
    assert.equal(ok(await caller(nested)('graph_show', { id: 'goal-1' })).projection.node.id, 'goal-1')
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('activation never throws: a bad config or a failed registration warns and stays off', async () => {
  const empty = fakeRuntime({ natives: [] })
  const bad = await captureWarnings(() => apply(empty.ctx, { dir: ' ' }))
  assert.equal(typeof bad.result, 'function')
  assert.equal(empty.scoped.length, 0)
  assert.match(bad.warnings.join('\n'), /config\.dir must be a non-empty path/)

  const missing = fakeRuntime({ natives: [] })
  const absent = join(tmpdir(), 'graph-tools-absent', 'graph')
  const warned = await captureWarnings(() => apply(missing.ctx, { dir: absent }))
  assert.equal(missing.scoped.length, TOOL_NAMES.length, 'the tools still register and report the directory')
  assert.match(warned.warnings.join('\n'), /does not exist/)

  const disposed: string[] = []
  let registered = 0
  const listened: string[] = []
  const failing = await captureWarnings(() => apply({
    tools: {
      register: tool => {
        if (++registered === 3) throw new Error('tool "graph_focus" is already registered')
        return () => { disposed.push(tool.name) }
      },
    },
    on: event => { listened.push(event); return () => {} },
  }, {}))
  assert.deepEqual(listened, [], 'a row that stays off installs no step projection')
  assert.deepEqual(disposed, ['graph_open', 'graph_show'], 'tools registered before the failure are removed again')
  assert.match(failing.warnings.join('\n'), /registering the graph tools failed/)
  failing.result()
})

test('the graph row ships disabled', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const lines = patch.split('\n')
  const start = lines.findIndex(line => line.trim() === '- id: glm-hourness/graph')
  assert.ok(start >= 0, 'the patch declares the graph row')
  const end = lines.findIndex((line, index) => index > start && line.trim().startsWith('- '))
  const row = lines.slice(start + 1, end < 0 ? undefined : end).map(line => line.trim())
  assert.ok(row.includes('name: ./dist/graph/index.js'))
  assert.ok(row.includes('disabled: true'))
  assert.ok(row.includes('inject: [tools]'))
})
