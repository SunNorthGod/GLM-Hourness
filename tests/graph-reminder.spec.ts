import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { apply } from '../src/graph/index.ts'
import { CHECKPOINT_SOURCE, GOAL_ROUND_SOURCE, PROJECTION_SOURCE } from '../src/graph/reminder.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { AgentLike, UserNotice } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings, seedAsHuman } from './graph-helpers.ts'

interface Fixture {
  readonly workspace: string
  readonly graph: string
  readonly runtime: FakeRuntime
  /** Call graph_focus the way a model step does: execute it, then record the call and its result in the history. */
  readonly focus: (id: string) => Promise<boolean>
  /** Run one step and append what it admits to the history, as the session does; returns the projection notices. */
  readonly step: (options?: { messages?: readonly unknown[], step?: number }) => Promise<UserNotice[]>
  /** Write as the human through the engine. */
  readonly human: (mutation: Record<string, unknown>) => Promise<void>
  readonly rev: (id: string) => Promise<string>
}

/**
 * goal-1
 *   feature-1 (stage execute)
 *     task-2
 *     task-1 (depends on task-2)
 *     question-1
 */
async function seed(graph: string): Promise<void> {
  await seedAsHuman(graph, [
    { type: 'goal', title: '项目图', acceptance: ['人能看，LLM 能读写'] },
    { type: 'feature', title: '图工具', parent: 'goal-1', stage: 'execute' },
    { id: 'task-2', type: 'task', title: '写引擎', parent: 'feature-1', acceptance: ['单测通过'] },
    { id: 'task-1', type: 'task', title: '读投影', parent: 'feature-1', acceptance: ['每步可见'], edges: [{ type: 'depends', to: 'task-2' }] },
    { type: 'question', title: '投影放多少', parent: 'feature-1', options: [{ key: 'A', label: '短', gain: '省 token', cost: '常要再读一次' }, { key: 'B', label: '全', gain: '少读一次', cost: '每步多几百 token' }], recommend: 'B', crux: '上下文窗口吃紧吗？', verdict: '是 → A；否 → B', weight: 'two-way' },
  ])
}

function userMessage(text: string, source: Record<string, unknown> = { kind: 'user' }): Record<string, unknown> {
  return { id: `m-${Math.random().toString(36).slice(2)}`, role: 'user', content: [{ type: 'text', text }], source }
}

function projectionNotices(messages: readonly unknown[]): UserNotice[] {
  return messages.filter((message): message is UserNotice => (message as UserNotice).source?.kind === PROJECTION_SOURCE)
}

function fixture(runtime: FakeRuntime, workspace: string, graph: string): Fixture {
  let calls = 0
  return {
    workspace,
    graph,
    runtime,
    async focus(id) {
      const callId = `focus-${++calls}`
      const result = await runtime.ctx.tools.execute({ calls: [{ id: callId, name: 'graph_focus', arguments: { id } }], agent: runtime.agent, signal: new AbortController().signal, log: { turn: runtime.progress.turn, step: runtime.progress.step } }).then(batch => batch.results[0].result)
      runtime.history.push(
        { role: 'assistant', source: { kind: 'model', provider: 'glm-zcode', model: 'glm-5.3' }, content: [{ type: 'tool-call', id: callId, name: 'graph_focus', arguments: JSON.stringify({ id }) }] },
        { role: 'tool', toolCallId: callId, isError: result.isError, content: result.content },
      )
      return !result.isError
    },
    async step({ messages = [userMessage('继续')], step = 2 } = {}) {
      const decision = await runtime.preStep({ messages, step })
      assert.equal(decision.kind, 'enter')
      const admitted = (decision as { messages: readonly unknown[] }).messages
      runtime.history.push(...admitted)
      const notices = projectionNotices(admitted)
      // A notice goes at the end of the step's input (DESIGN.md §6).
      if (notices.length > 0) assert.equal(admitted.at(-1), notices.at(-1))
      return notices
    },
    async human(mutation) {
      const result = await openEngine(graph).apply('human', mutation)
      assert.ok(result.ok, JSON.stringify(result))
    },
    rev: async id => (await loadGraph(graph)).revisions.get(id)!,
  }
}

async function withWorkspace(body: (workspace: string, graph: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-reminder-'))
  try {
    const graph = join(workspace, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    await seed(graph)
    await body(workspace, graph)
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

/** With `journal`, the row's home is `<workspace>/.llm`, so the re-anchoring reads the violation journal under it. */
function reminderTest(name: string, body: (fixture: Fixture) => Promise<void>, options: { journal?: true } = {}): void {
  test(name, () => withWorkspace(async (workspace, graph) => {
    const runtime = fakeRuntime({ natives: [], cwd: workspace })
    apply(runtime.ctx, options.journal === undefined ? {} : { home: join(workspace, '.llm') })
    await runtime.create()
    await body(fixture(runtime, workspace, graph))
  }))
}

/** The violation journal the row reads when the test runs with `journal`. */
function journalOf(workspace: string): string {
  return join(workspace, '.llm', 'audit', 'violations.jsonl')
}

async function writeJournal(workspace: string, lines: readonly string[]): Promise<void> {
  await mkdir(join(workspace, '.llm', 'audit'), { recursive: true })
  await writeFile(journalOf(workspace), lines.map(line => `${line}\n`).join(''))
}

/** One guard denial as the gates journal it (src/guard/records.ts ViolationRecord). */
function denial(rule: string, sessionId: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ at: '2026-11-05T10:00:00.000Z', rule, tool: 'Write', agentId: sessionId, sessionId, scope: 'dialect', correction: 'take the right path', ...extra })
}

/** How the re-anchoring opens the denied rules. */
const DENIED = 'Calls the harness denied in this session, by rule (rule id: times). These rules still apply: take the right path a denial named instead of repeating the call.'

function graphHealthOf(runtime: FakeRuntime): { state: string, reason: string } | undefined {
  return (runtime.services.get(healthServiceName('graph')) as RowHealthView).session(runtime.agent.session!.id)
}

/** Compaction replaces the visible history with one checkpoint message. */
function compact(runtime: FakeRuntime, id: string): void {
  runtime.history.splice(0, runtime.history.length, userMessage('Summary:\n…', { kind: CHECKPOINT_SOURCE, compactionId: id }))
}

function text(notice: UserNotice): string {
  return notice.content[0].text
}

function facts(notice: UserNotice): Record<string, unknown> {
  return notice.source.graphProjection as Record<string, unknown>
}


reminderTest('an agent without a focus gets no projection', async ({ step }) => {
  assert.deepEqual(await step(), [])
  assert.deepEqual(await step({ messages: [], step: 3 }), [])
})

reminderTest('after graph_focus the next step ends with the projection, once', async ({ focus, step, runtime, rev }) => {
  assert.equal(await focus('task-1'), true)
  const [notice, ...rest] = await step({ messages: [], step: 3 })
  assert.equal(rest.length, 0)
  assert.ok(notice !== undefined, 'the step after graph_focus carries the projection')
  // The inbox keys messages by id and the session projects them by role (DESIGN.md §2.4a).
  assert.equal(typeof notice.id, 'string')
  assert.equal(notice.role, 'user')
  assert.deepEqual([facts(notice).focus, facts(notice).reason], ['task-1', 'focus'])
  assert.match(facts(notice).digest as string, /^[0-9a-f]{12}$/)
  const body = text(notice)
  assert.ok(body.startsWith('<system-reminder>\n') && body.endsWith('\n</system-reminder>'), body)
  for (const line of [
    'Focus: task task-1 [approved] 读投影',
    'Acceptance:\n- 每步可见',
    'Path to the goal, parent first:\n- feature feature-1 [approved] 图工具\n- goal goal-1 [approved] 项目图',
    'Stage: execute',
    'Depends on:\n- task task-2 [approved] 写引擎',
    'Open gates:\n- dependencies: depends on nodes that are not done (task-2)',
  ]) assert.ok(body.includes(line), `${line}\n---\n${body}`)
  assert.ok(!body.includes(await rev('task-1')) && !body.includes('建图'), 'revisions and history stay out of the reminder')
  assert.deepEqual(await step(), [], 'an unchanged projection is not repeated')
  assert.equal(runtime.history.filter(message => (message as UserNotice).source?.kind === PROJECTION_SOURCE).length, 1)
})

reminderTest('a change inside the projection adds a notice; a comment or a change elsewhere does not', async ({ focus, step, human, rev }) => {
  await focus('task-1')
  assert.equal((await step()).length, 1)
  await human({ op: 'comment', id: 'task-1', text: '先写引擎' })
  await human({ op: 'propose', reason: '风险', node: { type: 'risk', title: '投影太长', parent: 'goal-1' } })
  assert.deepEqual(await step(), [], 'a comment changes the rev, not the projection; the new risk is not a neighbor')
  await human({ op: 'status', id: 'task-2', rev: await rev('task-2'), to: 'done', reason: '写完了', evidence: [{ kind: 'commit', ref: 'abc1234' }] })
  const [changed] = await step()
  assert.ok(changed !== undefined)
  assert.equal(facts(changed).reason, 'changed')
  assert.ok(text(changed).includes('Depends on:\n- task task-2 [done] 写引擎'), text(changed))
  assert.ok(!text(changed).includes('dependencies:'), 'the dependency gate is passed')
  assert.deepEqual(await step(), [])
})

reminderTest('the focus follows the latest successful graph_focus call', async ({ focus, step }) => {
  await focus('task-1')
  await step()
  assert.equal(await focus('task-9'), false, 'an unknown node is refused')
  assert.deepEqual(await step(), [], 'a refused call moves nothing')
  await focus('task-2')
  const [moved] = await step()
  assert.ok(moved !== undefined)
  assert.deepEqual([facts(moved).focus, facts(moved).reason], ['task-2', 'focus'])
  assert.ok(text(moved).includes('Focus: task task-2 [approved] 写引擎'))
  assert.ok(text(moved).includes('Needed by:\n- task task-1 [approved] 读投影'))
})

reminderTest('after a compaction the projection is anchored again, once per checkpoint', async ({ focus, step, runtime }) => {
  await focus('task-1')
  const [first] = await step()
  assert.ok(first !== undefined)
  // Compaction replaces the history range with one checkpoint message: the call and the notice are gone.
  runtime.history.splice(0, runtime.history.length, userMessage('Summary:\n…', { kind: CHECKPOINT_SOURCE, compactionId: 'c-1' }))
  const [anchored] = await step({ messages: [], step: 3 })
  assert.ok(anchored !== undefined, 'the focus survives in memory and the projection comes back')
  assert.deepEqual([facts(anchored).focus, facts(anchored).reason, facts(anchored).anchor], ['task-1', 'compaction', 'c-1'])
  assert.equal(text(anchored), text(first))
  assert.deepEqual(await step(), [])
  // A later compaction that keeps the last notice in its retained tail still re-anchors.
  const tail = runtime.history.slice(1)
  runtime.history.splice(0, runtime.history.length, userMessage('Summary:\n…', { kind: CHECKPOINT_SOURCE, compactionId: 'c-2' }), ...tail)
  const [again] = await step()
  assert.ok(again !== undefined)
  assert.deepEqual([facts(again).reason, facts(again).anchor], ['compaction', 'c-2'])
  assert.deepEqual(await step(), [])
})

reminderTest('the re-anchoring after a compaction lists the rules denied in this session with their counts and the goal\'s non-goals; no other step does', async ({ focus, step, human, rev, runtime, workspace }) => {
  const own = runtime.agent.session!.id
  await writeJournal(workspace, [
    denial('graph-files-only', own),
    denial('file-tools-only', own),
    denial('graph-files-only', own, { tool: 'Bash' }),
    // A late denial of the workspace-change fallback counts as a denial; a rules-board denial carries mode enforce.
    JSON.stringify({ at: '2026-11-05T10:01:00.000Z', rule: 'file-tools-only', mode: 'late', via: 'turn-end', sessionId: own, paths: ['x.txt'], correction: 'use the file tools' }),
    denial('rules:r-block', own, { mode: 'enforce' }),
    // Not counted: another session's denial, a follow-up, a record-only call, a gap line and a line that does not parse.
    denial('workspace-containment', 'agent-2'),
    JSON.stringify({ kind: 'followup', at: '2026-11-05T10:02:00.000Z', rule: 'graph-files-only', tool: 'Write', sessionId: own, scope: 'dialect', denial: 'abc123abc123', outcome: 'repeat' }),
    JSON.stringify({ at: '2026-11-05T10:03:00.000Z', rule: 'rules:r-note', tool: 'Bash', sessionId: own, mode: 'record' }),
    JSON.stringify({ kind: 'gap', at: '2026-11-05T10:04:00.000Z', row: 'guard', lost: 2, classes: { denial: 2 }, since: '2026-11-05T09:00:00.000Z', until: '2026-11-05T09:30:00.000Z' }),
    '{ not json',
  ])
  await human({ op: 'edit', id: 'goal-1', rev: await rev('goal-1'), reason: '划范围', set: { nonGoals: ['不接 DSH 运行时', '不做多人协作'] } })
  await focus('task-1')
  const [first] = await step()
  assert.ok(first !== undefined)
  assert.ok(!text(first).includes(DENIED) && !text(first).includes('Non-goals'), 'the step after graph_focus carries neither')
  compact(runtime, 'c-1')
  const [anchored] = await step({ messages: [], step: 3 })
  assert.ok(anchored !== undefined)
  assert.equal(facts(anchored).reason, 'compaction')
  assert.equal(facts(anchored).digest, facts(first).digest, 'the extra lines stay out of the digest')
  const close = '\n</system-reminder>'
  assert.equal(text(anchored), `${text(first).slice(0, -close.length)}\n${[
    'Non-goals of goal goal-1, outside the scope of this work (graph_show gives the goal\'s acceptance):',
    '- 不接 DSH 运行时',
    '- 不做多人协作',
    DENIED,
    '- file-tools-only: 2',
    '- graph-files-only: 2',
    '- rules:r-block: 1',
  ].join('\n')}${close}`)
  assert.deepEqual(await step(), [], 'the next step sees the same digest and adds nothing')
  const round = userMessage('<goal_round>\nObjective: "项目图"\nRound: 2/256\n</goal_round>', { kind: GOAL_ROUND_SOURCE, goalId: 'goal-a', revision: 1, round: 2 })
  const [beat] = await step({ messages: [round] })
  assert.ok(beat !== undefined)
  assert.equal(text(beat), text(first), 'a goal round carries the projection alone')
  assert.equal(graphHealthOf(runtime)?.state, 'active')
}, { journal: true })

/** Focus task-1, take the projection, compact once (c-1) and take the re-anchoring that follows. */
async function focusThenCompact({ focus, step, runtime }: Fixture): Promise<{ first: UserNotice, bare: UserNotice }> {
  await focus('task-1')
  const [first] = await step()
  assert.ok(first !== undefined)
  compact(runtime, 'c-1')
  const [bare] = await step({ messages: [], step: 3 })
  assert.ok(bare !== undefined)
  assert.equal(facts(bare).reason, 'compaction')
  return { first, bare }
}

reminderTest('the re-anchoring lists the titles of the approved norm nodes under the focus\'s goal, one per line; a goal without them adds no section; no other step does', async (fixture) => {
  const { step, human, rev, runtime, graph } = fixture
  const { first, bare } = await focusThenCompact(fixture)
  assert.equal(text(bare), text(first), 'a goal without norm nodes: no norms section')
  await human({ op: 'propose', reason: '规范', node: { id: 'norm-tests', type: 'norm', title: '改代码前测试先过', parent: 'goal-1', acceptance: ['npm test 退出码 0'] } })
  await human({ op: 'propose', reason: '规范', node: { id: 'norm-docs', type: 'norm', title: '文档与行为同一批提交', parent: 'feature-1', acceptance: ['同一个提交'] } })
  // Not listed: a norm the human dropped, a norm still waiting for approval, a norm under another goal.
  await human({ op: 'propose', reason: '规范', node: { id: 'norm-old', type: 'norm', title: '旧规矩', parent: 'goal-1', acceptance: ['x'] } })
  await human({ op: 'status', id: 'norm-old', rev: await rev('norm-old'), to: 'dropped', reason: '不用了' })
  const proposed = await openEngine(graph).apply('llm', { op: 'propose', reason: '提议', node: { id: 'norm-draft', type: 'norm', title: '还没批', parent: 'goal-1', acceptance: ['x'] } })
  assert.ok(proposed.ok, JSON.stringify(proposed))
  assert.equal((await loadGraph(graph)).nodes.get('norm-draft')?.status, 'proposed')
  await human({ op: 'propose', reason: '另一个目标', node: { type: 'goal', title: '别的目标', acceptance: ['y'] } })
  await human({ op: 'propose', reason: '规范', node: { id: 'norm-elsewhere', type: 'norm', title: '别处的规矩', parent: 'goal-2', acceptance: ['z'] } })
  assert.deepEqual(await step(), [], 'new norm nodes are not neighbors of the focus: an ordinary step adds nothing')
  compact(runtime, 'c-2')
  const [anchored] = await step()
  assert.ok(anchored !== undefined)
  assert.equal(facts(anchored).reason, 'compaction')
  assert.equal(facts(anchored).digest, facts(first).digest, 'the norms stay out of the digest')
  const close = '\n</system-reminder>'
  assert.equal(text(anchored), `${text(first).slice(0, -close.length)}\n${[
    'Norms in effect under goal goal-1, approved by the human (graph_show gives the items of each):',
    '- norm-docs: 文档与行为同一批提交',
    '- norm-tests: 改代码前测试先过',
  ].join('\n')}${close}`)
  assert.deepEqual(await step(), [], 'the next step sees the same digest and adds nothing')
  await human({ op: 'edit', id: 'task-1', rev: await rev('task-1'), reason: '改名', set: { title: '读投影二' } })
  const [changed] = await step()
  assert.ok(changed !== undefined)
  assert.equal(facts(changed).reason, 'changed')
  assert.ok(!text(changed).includes('Norms in effect'), 'a changed projection carries no norms')
  const round = userMessage('<goal_round>\nObjective: "项目图"\nRound: 2/256\n</goal_round>', { kind: GOAL_ROUND_SOURCE, goalId: 'goal-a', revision: 1, round: 2 })
  const [beat] = await step({ messages: [round] })
  assert.ok(beat !== undefined)
  assert.equal(facts(beat).reason, 'goal-round')
  assert.ok(!text(beat).includes('Norms in effect'), 'a goal round carries no norms')
}, { journal: true })

reminderTest('a session without denials re-anchors with the projection alone, whether the journal exists or not', async (fixture) => {
  const { step, runtime, workspace } = fixture
  const { first, bare } = await focusThenCompact(fixture)
  assert.equal(text(bare), text(first), 'no journal yet: no denial, no section')
  await writeJournal(workspace, [
    denial('graph-files-only', 'agent-2'),
    JSON.stringify({ kind: 'followup', at: '2026-11-05T10:02:00.000Z', rule: 'graph-files-only', tool: 'Write', sessionId: runtime.agent.session!.id, scope: 'dialect', denial: 'abc123abc123', outcome: 'none' }),
  ])
  compact(runtime, 'c-2')
  const [again] = await step()
  assert.ok(again !== undefined)
  assert.equal(facts(again).reason, 'compaction')
  assert.equal(text(again), text(first), 'another session\'s denial and this session\'s follow-up add no section')
  assert.equal(graphHealthOf(runtime)?.state, 'active')
}, { journal: true })

reminderTest('a journal that cannot be read leaves the denials out of the re-anchoring, never the step, and the row health says so until a read succeeds', async ({ focus, step, runtime, workspace }) => {
  // A directory where the journal file should be: reading it fails, not with ENOENT.
  await mkdir(journalOf(workspace), { recursive: true })
  await focus('task-1')
  const [first] = await step()
  assert.ok(first !== undefined)
  assert.equal(graphHealthOf(runtime)?.state, 'active', 'a step that is not a re-anchoring does not read the journal')
  compact(runtime, 'c-1')
  const { result: [anchored], warnings } = await captureWarnings(() => step({ messages: [], step: 3 }))
  assert.ok(anchored !== undefined, 'the step still re-anchors')
  assert.equal(text(anchored), text(first))
  assert.deepEqual(warnings, [], 'the projection is not skipped')
  const health = graphHealthOf(runtime)
  assert.equal(health?.state, 'degraded')
  assert.match(health?.reason ?? '', /；压缩后重锚没带本会话的拦截计数：读不到违规流水（EISDIR）$/)
  await rm(journalOf(workspace), { recursive: true })
  await writeJournal(workspace, [denial('graph-files-only', runtime.agent.session!.id)])
  compact(runtime, 'c-2')
  const [recovered] = await step()
  assert.ok(recovered !== undefined)
  assert.ok(text(recovered).endsWith(`${DENIED}\n- graph-files-only: 1\n</system-reminder>`), text(recovered))
  assert.equal(graphHealthOf(runtime)?.state, 'active', 'the read that succeeds withdraws the note')
}, { journal: true })

reminderTest('every goal round carries the projection', async ({ focus, step }) => {
  await focus('task-1')
  await step()
  const round = userMessage('<goal_round>\nObjective: "项目图"\nRound: 2/256\n</goal_round>', { kind: GOAL_ROUND_SOURCE, goalId: 'goal-a', revision: 1, round: 2 })
  const [beat] = await step({ messages: [round] })
  assert.ok(beat !== undefined, 'an unchanged projection still comes with the beat')
  assert.equal(facts(beat).reason, 'goal-round')
  assert.deepEqual(await step(), [])
})

test('a resumed session finds the focus in its history', () => withWorkspace(async (workspace, graph) => {
  const before = fakeRuntime({ natives: [], cwd: workspace })
  apply(before.ctx, {})
  await before.create()
  const earlier = fixture(before, workspace, graph)
  await earlier.focus('task-1')
  await earlier.step()

  // A new process: a fresh row (empty focus memory) over the persisted history.
  const after = fakeRuntime({ natives: [], cwd: workspace })
  after.history.push(...before.history)
  apply(after.ctx, {})
  await after.create()
  const resumed = fixture(after, workspace, graph)
  assert.deepEqual(await resumed.step(), [], 'the projection the history shows is not repeated')
  await resumed.human({ op: 'status', id: 'task-1', rev: await resumed.rev('task-1'), to: 'doing', reason: '开工' })
  const [changed] = await resumed.step()
  assert.ok(changed !== undefined)
  assert.ok(text(changed).includes('Focus: task task-1 [doing] 读投影'))

  // A crash between the graph_focus call and the next step: the call alone sets the focus.
  const crashed = fakeRuntime({ natives: [], cwd: workspace })
  crashed.history.push(...before.history.slice(0, 2))
  apply(crashed.ctx, {})
  await crashed.create()
  const [recovered] = await fixture(crashed, workspace, graph).step()
  assert.ok(recovered !== undefined)
  assert.deepEqual([facts(recovered).focus, facts(recovered).reason], ['task-1', 'focus'])
}))

reminderTest('a broken graph or a missing focus node is reported once', async ({ focus, step, graph }) => {
  await focus('task-1')
  await step()
  await writeFile(join(graph, 'nodes', 'task-9.json'), '{ not json')
  const [broken] = await step()
  assert.ok(broken !== undefined)
  assert.match(text(broken), /The graph has 1 validation error\(s\): every write is refused/)
  assert.deepEqual(await step(), [])
  await rm(join(graph, 'nodes', 'task-9.json'))
  await rm(join(graph, 'nodes', 'task-1.json'))
  const [missing] = await step()
  assert.ok(missing !== undefined)
  assert.match(text(missing), /your focus node task-1 is not in the graph at .*graph_open lists the open nodes; graph_focus moves the focus/)
  assert.deepEqual(await step(), [])
  await rm(graph, { recursive: true })
  const [gone] = await step()
  assert.ok(gone !== undefined)
  assert.match(text(gone), /your focus node task-1 cannot be read: no project graph at /)
})

reminderTest('a step that turns into no request gets nothing', async ({ focus, runtime }) => {
  await focus('task-1')
  // installModelSelection's guard: an empty decision on the first step, or one that claimed messages, is no step.
  const decision = await runtime.preStep({ messages: [], step: 1 })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })
})

test('the row installs the projection per agent; an agent without a session or a graph read failure leaves steps alone', () => withWorkspace(async (workspace) => {
  const runtime = fakeRuntime({ natives: [], cwd: workspace })
  // A directory name stat() rejects outright (not ENOENT): reading the graph throws during the step.
  apply(runtime.ctx, { dir: 'docs/gr\0aph' })
  await runtime.create()
  await runtime.create()
  assert.equal(runtime.listeners.filter(entry => entry.event === 'agent/pre-step').length, 1, 'one listener per agent')
  const created = runtime.listeners.find(entry => entry.event === 'agent/created')!.listener as unknown as (payload: { agent: AgentLike }) => void
  const sessionless = await captureWarnings(() => created({ agent: { id: 'agent-2', ctx: runtime.ctx } }))
  assert.match(sessionless.warnings.join('\n'), /step projection not installed for agent agent-2: no session history/)
  assert.equal(runtime.listeners.filter(entry => entry.event === 'agent/pre-step').length, 1)

  runtime.history.push(
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'graph_focus', arguments: '{"id":"task-1"}' }] },
    { role: 'tool', toolCallId: 'c1', isError: false, content: [] },
  )
  const claimed = [userMessage('继续')]
  const failed = await captureWarnings(() => runtime.preStep({ messages: claimed, step: 2 }))
  assert.deepEqual(failed.result, { kind: 'enter', messages: claimed })
  assert.match(failed.warnings.join('\n'), /step projection skipped for agent agent-1/)
}))
