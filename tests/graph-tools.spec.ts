import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/graph/index.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { graphTools } from '../src/graph/tools.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { ToolDefinitionLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { RESIDENT_TOOLS, buildToolExposure } from '../src/toolsearch/exposure.ts'
import { GRAPH_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { DEFERRED_TOOL_CALL_NAME } from '../src/shared/zcode-notice.ts'
import { LOCAL_TOOL_SEARCH_NAME } from '../src/toolsearch/zcode-text.ts'
import { fakeRuntime, schemaViolations, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings, seedAsHuman, type GraphAnswer } from './graph-helpers.ts'
import { exampleRecord } from './proposal-examples.ts'

interface Fixture {
  /** The session working directory; the graph is docs/graph under it. */
  readonly workspace: string
  readonly graph: string
  readonly runtime: FakeRuntime
  readonly call: (name: string, args?: unknown) => Promise<ToolFinalResult>
  readonly rev: (id: string) => Promise<string>
}

/** A graph tool's value: the shared answer shapes; a write's node comes without its history. */
interface ToolValue extends Omit<GraphAnswer, 'node'> {
  readonly node: Partial<GraphNode>
  readonly focus: Pick<GraphNode, 'id' | 'type' | 'title' | 'status'>
  readonly invalid?: { readonly errors: number, readonly first: readonly { readonly file: string, readonly field?: string, readonly message: string }[] }
}

/**
 * goal-1
 *   feature-1 approved
 *     task-1 approved
 *     question-1 approved (options A, B)
 *   decision-1 approved, unverified
 */
async function seed(graph: string): Promise<void> {
  await seedAsHuman(graph, [
    { type: 'goal', title: '项目图', acceptance: ['人能看，LLM 能读写'] },
    { type: 'feature', title: '图工具', parent: 'goal-1' },
    { type: 'task', title: '读投影', parent: 'feature-1', acceptance: ['单测通过'] },
    { type: 'question', title: '工具给谁', parent: 'feature-1', options: [{ key: 'A', label: '全部 agent', gain: '子 agent 也有正路', cost: '每个子 agent 多 9 个工具' }, { key: 'B', label: '只给主 Agent', gain: '子 agent 工具面不变', cost: '要识别主 Agent' }], recommend: 'B', crux: '子 agent 要自己改图吗？', verdict: '是 → A；否 → B', weight: 'two-way' },
    { type: 'decision', title: '每个操作一个工具', parent: 'goal-1' },
  ])
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
function ok(result: ToolFinalResult): ToolValue {
  assert.equal(result.isError, false, JSON.stringify(result.content))
  assert.deepEqual(JSON.parse(result.content[0].text!), result.value)
  return result.value as ToolValue
}

/** The engine error a refused call carries in its error text. */
function refused(result: ToolFinalResult, code: string, field?: string): Record<string, string> {
  assert.equal(result.isError, true, JSON.stringify(result.value))
  const text = result.content[0].text!
  assert.ok(text.startsWith('Error: '), text)
  const error = JSON.parse(text.slice('Error: '.length)) as Record<string, string>
  assert.equal(error.code, code, text)
  if (field !== undefined) assert.equal(error.field, field, text)
  assert.ok(typeof error.hint === 'string' && error.hint.length > 0, 'every refusal names the right path')
  return error
}


test('the row registers one tool per llm operation with schemas inside the rc.3 subset', () => {
  // The fake register rejects output schemas outside the subset, as rc.3 does at activation.
  const runtime = fakeRuntime({ natives: [] })
  const dispose = apply(runtime.ctx, {})
  assert.deepEqual(runtime.scoped.map(tool => tool.name), GRAPH_TOOL_NAMES)
  for (const tool of runtime.scoped) {
    assert.deepEqual(schemaViolations(tool.parameters, `${tool.name}.parameters`), [])
    // 700: graph_propose carries the question rules (M3) and the sentence on the timeouts of a tool node under env (m4 design §6.3.1 item 3).
    assert.ok(tool.description.length > 0 && tool.description.length < 700, tool.name)
  }
  // A supersession is a proposal with a supersedes edge (ORCHESTRATION.md §2.9); it has no tool of its own.
  assert.equal(runtime.ctx.tools.get('graph_supersede'), undefined)
  dispose()
  assert.deepEqual(runtime.scoped, [])
})

toolTest('graph_propose says the recommended option goes last, and a question that puts it first is refused', async ({ runtime, call }) => {
  const propose = runtime.scoped.find(tool => tool.name === 'graph_propose')!
  const node = (propose.parameters.properties as Record<string, { properties: Record<string, { description: string }> }>).node.properties
  assert.match(propose.description, /recommended option last/)
  assert.match(node.recommend.description, /must be the last option/)
  assert.match(node.options.description, /recommended one last/)
  assert.match(runtime.scoped.find(tool => tool.name === 'graph_edit')!.description, /recommended option last/)
  const first = { type: 'question', title: '放哪', parent: 'feature-1', options: [{ key: 'A', label: '侧栏', gain: '与会话并排', cost: '窄，表格要竖排' }, { key: 'B', label: '网页', gain: '宽，表格放得下', cost: '离开 IDE' }], recommend: 'A', crux: '你常在 IDE 里看图吗？', verdict: '是 → A；否 → B', weight: 'two-way' }
  const error = refused(await call('graph_propose', { node: first, reason: '问人' }), 'invalid', 'node.options')
  assert.match(error.hint, /recommended option last/)
  assert.equal(ok(await call('graph_propose', { node: { ...first, recommend: 'B' }, reason: '问人' })).node.recommend, 'B')
})

toolTest('graph_propose explains the table card next to recommend-last; a question without it is refused with the field to add', async ({ runtime, call }) => {
  const propose = runtime.scoped.find(tool => tool.name === 'graph_propose')!
  type Described = { description: string, properties?: Record<string, Described>, items?: Described, enum?: string[] }
  const node = (propose.parameters.properties as Record<string, Described>).node.properties!
  assert.match(propose.description, /A question for the human is a proposal: ask \(the question\), form \(recommend, choose, want or look\), proposal and, by form, reason, cost, ways; the main agent puts one with propose_to_human\. A question you decide yourself \(decider agent\) is a table of options, the recommended option last\./)
  const row = node.options.items!.properties!
  assert.deepEqual(Object.keys(row), ['key', 'label', 'gain', 'cost'], 'new rows have no consequence')
  assert.match(row.label.description, /怎么做: .* at most 20 characters/)
  assert.match(row.gain.description, /得到: one line, at most 60 characters/)
  assert.match(row.cost.description, /代价: one line, at most 60 characters/)
  assert.match(node.dimension.description, /one extra column where the options really differ.*same value in every row is refused/)
  assert.match(node.dimension.properties!.name.description, /at most 12 characters/)
  assert.match(node.crux.description, /required when the human decides\. 取决于: one line, at most 60 characters/)
  assert.match(node.verdict.description, /是 → <key>；否 → <key>; every key after → must exist and the recommended key must appear/)
  assert.deepEqual(node.weight.enum, ['one-way', 'two-way'])
  assert.equal(node.why, undefined)
  assert.equal(node.counter, undefined)
  const bare = { type: 'question', title: '缓存放哪', parent: 'feature-1', options: [{ key: 'A', label: '.cache', gain: '工具都认', cost: '要加进 .gitignore' }, { key: 'B', label: 'tmp', gain: '系统会清', cost: '重启后要重建' }], recommend: 'B' }
  const error = refused(await call('graph_propose', { node: bare, reason: '问人' }), 'invalid', 'node.crux')
  assert.match(error.hint, /取决于/)
  const asked = ok(await call('graph_propose', { node: { ...bare, crux: '缓存要跨重启留着吗？', verdict: '是 → A；否 → B', weight: 'two-way' }, reason: '问人' }))
  assert.deepEqual([asked.node.crux, asked.node.verdict, asked.node.weight], ['缓存要跨重启留着吗？', '是 → A；否 → B', 'two-way'])
})

toolTest('graph_propose takes a proposal; graph_decide decides it with a conclusion, for the human only with their words', async ({ runtime, call, rev }) => {
  type Described = { description: string, properties?: Record<string, Described> }
  const propose = runtime.scoped.find(tool => tool.name === 'graph_propose')!
  const node = (propose.parameters.properties as Record<string, Described>).node.properties!
  for (const field of ['ask', 'form', 'proposal', 'reason', 'cost', 'ways', 'notTaken']) assert.match(node[field].description, /Question only, a proposal/, field)
  const decide = runtime.scoped.find(tool => tool.name === 'graph_decide')!
  assert.deepEqual((decide.parameters as { required: string[] }).required, ['id', 'rev', 'reason'])
  assert.deepEqual(Object.keys((decide.parameters as { properties: object }).properties), ['id', 'rev', 'option', 'conclusion', 'reason', 'relay'])
  assert.match(decide.description, /takes conclusion: one line, what was decided/)

  const record = exampleRecord('recommend')
  const asked = ok(await call('graph_propose', { node: { type: 'question', parent: 'feature-1', ...record }, reason: '问人' }))
  assert.equal(asked.node.options, undefined)
  assert.equal(asked.node.ask, record.ask)
  assert.equal(asked.node.form, 'recommend')
  refused(await call('graph_decide', { id: asked.id, rev: asked.rev, conclusion: '默认少做', reason: '我定' }), 'forbidden')
  refused(await call('graph_decide', { id: asked.id, rev: asked.rev, option: 'A', conclusion: '默认少做', reason: '我定', relay: '可以' }), 'invalid', 'option')
  refused(await call('graph_decide', { id: asked.id, rev: asked.rev, reason: '我定', relay: '可以' }), 'invalid', 'option')
  const decided = ok(await call('graph_decide', { id: asked.id, rev: await rev(asked.id), conclusion: '默认少做', reason: '人在对话里同意', relay: '可以，就按推荐的来' }))
  assert.equal(decided.node.status, 'done')
  assert.equal(decided.node.conclusion, '默认少做')
})

test('every graph tool stays resident on GLM requests', () => {
  const contract = (tool: ToolDefinitionLike) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })
  const face = [
    ...graphTools('docs/graph', new Map()).map(contract),
    { name: 'web_fetch', description: 'fetch', parameters: { type: 'object' } },
    { name: LOCAL_TOOL_SEARCH_NAME, description: 'search', parameters: { type: 'object' } },
    { name: DEFERRED_TOOL_CALL_NAME, description: 'call', parameters: { type: 'object' } },
  ]
  for (const name of GRAPH_TOOL_NAMES) assert.ok(RESIDENT_TOOLS.has(name), name)
  const exposure = buildToolExposure(face)
  assert.ok(exposure.enabled)
  assert.deepEqual([...exposure.deferred], ['web_fetch'])
  assert.deepEqual(exposure.tools.map(tool => tool.name).filter(name => name.startsWith('graph_')), GRAPH_TOOL_NAMES)
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
  assert.equal(items.questions[0].raisedBy?.id, 'feature-1')
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

toolTest('graph_decide: agent questions are the llm\'s, the human\'s need their words as relay', async ({ call, rev, graph }) => {
  const human = refused(await call('graph_decide', { id: 'question-1', rev: await rev('question-1'), option: 'A', reason: '自己定' }), 'forbidden')
  assert.match(human.hint, /relay/)
  const relayed = ok(await call('graph_decide', { id: 'question-1', rev: await rev('question-1'), option: 'A', reason: '人选了 A', relay: '工具给全部 agent' }))
  assert.equal(relayed.node.decision, 'A')
  assert.equal((await loadGraph(graph)).nodes.get('question-1')!.history.at(-1)!.relay, '工具给全部 agent')
  const own = ok(await call('graph_propose', { node: { type: 'question', title: '缓存目录名', parent: 'feature-1', decider: 'agent', options: [{ key: 'A', label: '.cache', gain: '工具都认', cost: '要加进 .gitignore' }, { key: 'B', label: 'tmp', gain: '系统会清', cost: '与系统临时目录易混' }], recommend: 'B' }, reason: '自己定的细节' }))
  assert.equal(ok(await call('graph_decide', { id: own.id, rev: await rev(own.id), option: 'A', reason: '常见写法' })).node.status, 'done')
  const items = ok(await call('graph_open')).items
  assert.deepEqual(items.recentDecisions.map(entry => [entry.id, entry.decidedBy, entry.relay ?? null]), [[own.id, 'llm', null], ['question-1', 'llm', '工具给全部 agent']])
})

toolTest('graph_approve and graph_reject act for the human only with a relay', async ({ call, rev }) => {
  const branch = ok(await call('graph_propose', { node: { type: 'feature', title: '新分支', parent: 'goal-1' }, reason: '计划外' }))
  refused(await call('graph_approve', { id: branch.id, rev: await rev(branch.id), reason: '自批' }), 'forbidden')
  assert.equal(ok(await call('graph_approve', { id: branch.id, rev: await rev(branch.id), reason: '人同意', relay: '可以，开这个分支' })).node.status, 'approved')
  const other = ok(await call('graph_propose', { node: { type: 'feature', title: '另一个分支', parent: 'goal-1' }, reason: '计划外' }))
  refused(await call('graph_reject', { id: other.id, rev: await rev(other.id), reason: '自否' }), 'forbidden')
  assert.equal(ok(await call('graph_reject', { id: other.id, rev: await rev(other.id), reason: '人不要', relay: '这个不要' })).node.status, 'dropped')
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
  assert.equal(value.invalid?.errors, 1)
  assert.equal(value.invalid?.first[0].file, 'nodes/task-9.json')
  assert.equal(ok(await call('graph_open')).invalid?.errors, 1)
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
  assert.equal(missing.scoped.length, GRAPH_TOOL_NAMES.length, 'the tools still register and report the directory')
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

test('the graph row ships enabled after its L3 probe (ROADMAP M2 2.11), injecting the tools service', async () => {
  const patch = await readFile(new URL('../packages/hourness/cordis.patch.yml', import.meta.url), 'utf8')
  const lines = patch.split('\n')
  const start = lines.findIndex(line => line.trim() === '- id: glm-hourness/graph')
  assert.ok(start >= 0, 'the patch declares the graph row')
  const end = lines.findIndex((line, index) => index > start && line.trim().startsWith('- '))
  const row = lines.slice(start + 1, end < 0 ? undefined : end).map(line => line.trim())
  assert.ok(row.includes('name: dsh-hourness/graph'))
  assert.ok(!row.some(line => line.startsWith('disabled:')))
  assert.ok(row.includes('inject: [tools]'))
})
