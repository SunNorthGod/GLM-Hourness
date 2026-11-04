/**
 * The environment notice (src/env/notice.ts): the body for a branch and for
 * no branch, the first/changed/compaction reasons over a derived history,
 * and the installed step notice on the fake runtime — first step carries it,
 * the next does not, a changed branch re-injects, and a graph the env row
 * cannot read leaves the scratch line alone.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply as envApply } from '../src/env/index.ts'
import { envNotice, envNoticeBody, ENV_NOTICE_SOURCE, NO_BOARD_LINE, NO_CHECKS_LINE, SCRATCH_LINE } from '../src/env/notice.ts'
import { openEngine } from '../src/graph/engine.ts'
import { serializeNode } from '../src/graph/format.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE } from '../src/loops/service.ts'
import { GRAPH_SERVICE } from '../src/graph/service.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { DerivedMessage, ServiceLookup, SessionLike, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { seedAsHuman } from './graph-helpers.ts'

const message = (source: Record<string, unknown>, role: 'user' | 'assistant' = 'user'): DerivedMessage =>
  ({ role, source, content: [{ type: 'text', text: 'x' }] })

const bareSession = { id: 's', header: {} } as unknown as SessionLike
const noServices = { get: () => undefined } as unknown as ServiceLookup

test('the body for a branch: header, tools, proposals, the checks line, the scratch line', () => {
  const body = envNoticeBody({
    tools: [
      { id: 'tool-1', title: 'ESLint', rev: 'r1', usage: 'npm run lint', configs: ['eslint.config.mjs'], checks: [] },
      { id: 'tool-2', title: 'gitleaks', rev: 'r2', usage: 'npm run check:secrets', configs: [], checks: [] },
    ],
    proposals: 2,
    issues: [],
  })
  const lines = body.split('\n')
  assert.deepEqual(lines, [
    'Project tools (graph node env). Use these before writing your own.',
    '- ESLint [tool-1]: npm run lint',
    '- gitleaks [tool-2]: npm run check:secrets',
    '2 more tool nodes wait for the human\'s approval.',
    NO_CHECKS_LINE,
    SCRATCH_LINE,
  ])
})

test('more than twelve tools collapse into an "N more" line; an empty branch is the scratch line alone', () => {
  const tools = Array.from({ length: 14 }, (_, index) => ({ id: `tool-${index + 1}`, title: `T${index + 1}`, rev: 'r', usage: 'run', configs: [], checks: [] }))
  const body = envNoticeBody({ tools, proposals: 0, issues: [] })
  const lines = body.split('\n')
  assert.equal(lines.filter(line => line.startsWith('- ')).length, 12)
  assert.ok(lines.includes('2 more: graph_show env'))
  assert.equal(envNoticeBody(undefined), SCRATCH_LINE)
  assert.equal(envNoticeBody({ tools: [], proposals: 0, issues: [] }), SCRATCH_LINE)
})

test('the body stays within 1500 characters', () => {
  const tools = Array.from({ length: 12 }, (_, index) => ({ id: `tool-${index + 1}`, title: `T${index + 1}`, rev: 'r', usage: 'x'.repeat(140), configs: [], checks: [] }))
  const body = envNoticeBody({ tools, proposals: 0, issues: [] })
  assert.ok(body.length <= 1500, String(body.length))
})

function historyWith(notice: Record<string, unknown> | undefined, checkpoint?: Record<string, unknown>): readonly DerivedMessage[] {
  return [
    ...(checkpoint === undefined ? [] : [message({ kind: 'compact-checkpoint', ...checkpoint })]),
    message({ kind: 'user' }),
    ...(notice === undefined ? [] : [message({ kind: ENV_NOTICE_SOURCE, envNotice: notice })]),
  ]
}

/** The notice over a hand-made history with no graph service (the scratch line alone), or undefined. */
const noticeOver = async (history: readonly DerivedMessage[]): Promise<UserNotice | undefined> => envNotice(noServices, history, bareSession)

const factsOf = (notice: UserNotice): Record<string, unknown> => notice.source.envNotice as Record<string, unknown>

test('the reason: first notice, changed digest, compaction re-anchor, all read from the history', async () => {
  const first = await noticeOver([])
  assert.ok(first !== undefined)
  assert.deepEqual([factsOf(first).reason, typeof factsOf(first).digest], ['first', 'string'])
  const digest = factsOf(first).digest as string
  const settled = await noticeOver(historyWith({ digest, reason: 'first' }))
  assert.equal(settled, undefined)
  // The graph the row cannot read keeps the scratch line, whose digest differs from nothing shown yet.
  const changed = await noticeOver(historyWith({ digest: 'b'.repeat(12), reason: 'first' }))
  assert.ok(changed !== undefined)
  assert.equal(factsOf(changed).reason, 'changed')
  const checkpointed = await noticeOver(historyWith({ digest, reason: 'first' }, { compactionId: 'c1' }))
  assert.ok(checkpointed !== undefined)
  assert.deepEqual([factsOf(checkpointed).reason, factsOf(checkpointed).anchor], ['compaction', 'c1'])
  const reanchored = await noticeOver([
    message({ kind: 'compact-checkpoint', compactionId: 'c1' }),
    message({ kind: ENV_NOTICE_SOURCE, envNotice: { digest, anchor: 'c1', reason: 'compaction' } }),
  ])
  assert.equal(reanchored, undefined)
})

async function withGraph(body: (runtime: FakeRuntime, workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'env-notice-'))
  try {
    const graph = join(workspace, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    await seedAsHuman(graph, [
      { type: 'goal', title: '目标' },
      { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
      { id: 'tool-1', type: 'tool', title: 'ESLint', parent: 'env', body: '用法：npm run lint' },
    ])
    // Approve the tool node as the human: the graph files change under the row's feet.
    const engineGraph = await loadGraph(graph)
    await writeFile(join(graph, 'nodes', 'tool-1.json'), serializeNode({ ...engineGraph.nodes.get('tool-1')!, status: 'approved' }))
    const runtime = fakeRuntime({ natives: [], cwd: workspace })
    // The env row reads the graph through the graph row's service; provide the stub of one.
    runtime.ctx.provide(GRAPH_SERVICE, { dirFor: () => graph, isGraphTool: () => false })
    envApply(runtime.ctx)
    await runtime.create()
    await body(runtime, workspace)
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

const envNotices = (messages: readonly unknown[]): UserNotice[] =>
  messages.filter((message): message is UserNotice => (message as UserNotice).source?.kind === ENV_NOTICE_SOURCE)

test('the first step carries the notice, the second does not; a branch change brings it back', async () => {
  await withGraph(async (runtime, workspace) => {
    const first = await runtime.preStep({ messages: [{ id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'go' }] }], step: 1 })
    assert.equal(first.kind, 'enter')
    const admitted = (first as { messages: readonly unknown[] }).messages
    const notices = envNotices(admitted)
    assert.equal(notices.length, 1)
    const text = notices[0].content[0].text
    assert.ok(text.includes('Project tools (graph node env)'), text)
    assert.ok(text.includes('- ESLint [tool-1]: npm run lint'), text)
    // The fake runtime has no loop board: M4's own checks do not run, and the line says why.
    assert.ok(text.includes(NO_BOARD_LINE), text)
    assert.ok(text.includes(SCRATCH_LINE), text)
    runtime.history.push(...admitted)
    const second = await runtime.preStep({ messages: [{ id: 'm2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'go on' }] }], step: 2 })
    assert.equal(envNotices((second as { messages: readonly unknown[] }).messages).length, 0)
    // The branch changes: another approved tool node lands in the graph.
    const graph = join(workspace, 'docs', 'graph')
    const loaded = await loadGraph(graph)
    await writeFile(join(graph, 'nodes', 'tool-2.json'), serializeNode({ id: 'tool-2', type: 'tool', title: 'gitleaks', parent: 'env', status: 'approved', body: '用法：npm run check:secrets', history: [] }))
    void loaded
    const third = await runtime.preStep({ messages: [{ id: 'm3', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'again' }] }], step: 3 })
    const again = envNotices((third as { messages: readonly unknown[] }).messages)
    assert.equal(again.length, 1)
    assert.ok(again[0].content[0].text.includes('gitleaks'), again[0].content[0].text)
  })
})

test('a session whose graph has no env node gets the scratch line alone, once', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'env-notice-bare-'))
  try {
    const graph = join(workspace, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    await seedAsHuman(graph, [{ type: 'goal', title: '目标' }])
    const runtime = fakeRuntime({ natives: [], cwd: workspace })
    envApply(runtime.ctx)
    await runtime.create()
    const first = await runtime.preStep({ messages: [{ id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'go' }] }], step: 1 })
    const notices = envNotices((first as { messages: readonly unknown[] }).messages)
    assert.equal(notices.length, 1)
    assert.equal(notices[0].content[0].text, `<system-reminder>\n${SCRATCH_LINE}\n</system-reminder>`)
    runtime.history.push(...(first as { messages: readonly unknown[] }).messages)
    const second = await runtime.preStep({ messages: [], step: 2 })
    assert.equal(envNotices((second as { messages: readonly unknown[] }).messages).length, 0)
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('the checks line names M4\'s own checks with the board on; a changed check command shows the notice again (design §7.2)', async () => {
  const check = (name: string, paths?: readonly string[]) => ({ name, format: 'lines' as const, argv: ['node', `${name}.mjs`], ...(paths === undefined ? {} : { paths }) })
  const branch = {
    tools: [
      { id: 'tool-1', title: 'ESLint', rev: 'r1', usage: 'npm run lint', configs: [], checks: [check('eslint', ['*.ts', '*.mts']), check('full')] },
      { id: 'tool-2', title: 'TypeScript', rev: 'r2', usage: 'npx tsc', configs: [], checks: [check('tsc', ['*.ts'])] },
    ],
    proposals: 0,
    issues: [],
  }
  assert.ok(envNoticeBody(branch).includes('\nChecks run after each edit (listed on the loop board): eslint on *.ts, *.mts; tsc on *.ts.\n'))
  assert.ok(envNoticeBody(branch, false).includes(`\n${NO_BOARD_LINE}\n`))
  assert.ok(envNoticeBody({ ...branch, tools: [{ ...branch.tools[0], checks: [check('full')] }] }).includes(`\n${NO_CHECKS_LINE}\n`), 'a line without when is no check M4 runs')
  const many = { ...branch, tools: [{ ...branch.tools[0], checks: Array.from({ length: 30 }, (_, index) => check(`c${index}`, ['*.ts'])) }] }
  const line = envNoticeBody(many).split('\n').find(text => text.startsWith('Checks run after each edit')) ?? ''
  assert.ok(line.length <= 300, String(line.length))

  await withGraph(async (runtime, workspace) => {
    runtime.ctx.provide(LOOPS_SERVICE, { declaration: LOOPS_DECLARATION, contribute: () => ({ ok: true, dispose: () => {}, accepted: [], dropped: [] }), emit: () => Promise.resolve({ ok: true, id: 'ev-x', duplicate: false }), listens: () => false, recordRun: () => {} })
    const graph = join(workspace, 'docs', 'graph')
    const engine = openEngine(graph)
    const set = async (acceptance: readonly string[]): Promise<void> => {
      const loaded = await loadGraph(graph)
      assert.ok((await engine.apply('human', { op: 'edit', id: 'tool-1', rev: loaded.revisions.get('tool-1') ?? '', reason: '改检查', set: { acceptance } })).ok)
    }
    await set(['`check lint lines $ node lint.mjs {files}` when *.txt'])
    const first = await runtime.preStep({ messages: [{ id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'go' }] }], step: 1 })
    const shown = envNotices((first as { messages: readonly unknown[] }).messages)
    assert.ok(shown[0]?.content[0].text.includes('Checks run after each edit (listed on the loop board): lint on *.txt.'), shown[0]?.content[0].text)
    runtime.history.push(...(first as { messages: readonly unknown[] }).messages)
    // Same name and condition, another command: the body reads the same, the node's revision moved.
    await set(['`check lint lines $ node lint2.mjs {files}` when *.txt'])
    const again = await runtime.preStep({ messages: [{ id: 'm2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'on' }] }], step: 2 })
    assert.equal(envNotices((again as { messages: readonly unknown[] }).messages).length, 1)
  })
})

test('without a graph service, or without a working directory, the notice is the scratch line', async () => {
  const notice = await envNotice(noServices, [], { id: 's', header: {} } as unknown as SessionLike)
  assert.ok(notice !== undefined)
  assert.equal(notice.content[0].text, `<system-reminder>\n${SCRATCH_LINE}\n</system-reminder>`)
})
