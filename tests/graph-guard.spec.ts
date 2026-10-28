import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { apply } from '../src/graph/index.ts'
import { loadGraph } from '../src/graph/store.ts'
import { GRAPH_FILES_RULE, graphFilesOnly } from '../src/guard/graph-files.ts'
import { apply as applyGuard } from '../src/guard/index.ts'
import type { ToolFinalResult } from '../src/shared/dsh-min.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'

/** File and shell tools as both faces name them: the GLM aliases reach pre-execute under their own names. */
const NATIVES = ['Write', 'Edit', 'write', 'edit', 'str_replace_editor', 'read', 'Bash', 'pwsh', 'terminal_send']

interface Fixture {
  readonly workspace: string
  /** The graph directory: docs/graph under the workspace. */
  readonly graph: string
  readonly runtime: FakeRuntime
  /** Bodies that ran: a denied call never reaches its body. */
  readonly calls: Array<{ name: string, args: unknown }>
  readonly call: (name: string, args: unknown, extra?: { parent?: unknown }) => Promise<ToolFinalResult>
}

function caller(runtime: FakeRuntime): Fixture['call'] {
  let counter = 0
  return (name, args, extra = {}) => runtime.ctx.tools.execute({ callId: `call-${++counter}`, name, arguments: args, agent: runtime.agent, signal: new AbortController().signal, ...extra })
}

async function workspaceWithGraph(): Promise<{ workspace: string, graph: string }> {
  const workspace = await mkdtemp(join(tmpdir(), 'graph-guard-'))
  const graph = join(workspace, 'docs', 'graph')
  await mkdir(graph, { recursive: true })
  const seeded = await openEngine(graph).apply('human', { op: 'propose', reason: '建图', node: { type: 'goal', title: '项目图' } })
  assert.ok(seeded.ok, JSON.stringify(seeded))
  return { workspace, graph }
}

function guardTest(name: string, body: (fixture: Fixture) => Promise<void>, options: { guardRow?: boolean } = {}): void {
  test(name, async () => {
    const { workspace, graph } = await workspaceWithGraph()
    try {
      const calls: Fixture['calls'] = []
      const runtime = fakeRuntime({ natives: NATIVES, calls, cwd: workspace })
      // The loader activates the guard row before the graph row (cordis.patch.yml order).
      if (options.guardRow === true) applyGuard(runtime.ctx, {})
      apply(runtime.ctx, {})
      await body({ workspace, graph, runtime, calls, call: caller(runtime) })
    }
    finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
}

/** The four-part correction of a denied call, as the model reads it. */
function denied(result: ToolFinalResult): string {
  assert.equal(result.isError, true, JSON.stringify(result))
  const text = result.content[0].text!
  assert.ok(text.startsWith('Error: You tried to '), text)
  return text
}

function deniedByGraphRule(result: ToolFinalResult): string {
  const text = denied(result)
  for (const part of ['Boundary: That is inside the project graph', 'Right path: Read the node with graph_show', 'graph_edit', 'Exception: ']) assert.ok(text.includes(part), text)
  return text
}

function passed(result: ToolFinalResult): void {
  assert.equal(result.isError, false, JSON.stringify(result.content))
}

guardTest('file tools cannot write into the graph directory, however the path is spelled', async ({ graph, call, calls }) => {
  const targets = [
    join(graph, 'nodes', 'goal-1.json'),
    'docs/graph/nodes/goal-1.json',
    'docs\\graph\\graph.svg',
    './docs/graph/nodes/task-1.json',
    'DOCS/Graph/nodes/goal-1.json',
    'docs/other/../graph/nodes/goal-1.json',
    'docs/graph',
  ]
  for (const name of ['Write', 'Edit', 'write', 'edit']) {
    for (const file_path of targets) {
      const text = deniedByGraphRule(await call(name, { file_path, content: '{}' }))
      assert.ok(text.includes(`"${file_path}"`), text)
    }
  }
  assert.deepEqual(calls, [], 'no denied body ran')
})

guardTest('str_replace_editor writes into the graph are denied, views pass', async ({ call, calls }) => {
  for (const command of ['create', 'str_replace', 'insert']) deniedByGraphRule(await call('str_replace_editor', { command, path: 'docs/graph/nodes/goal-1.json' }))
  passed(await call('str_replace_editor', { command: 'view', path: 'docs/graph/nodes/goal-1.json' }))
  assert.deepEqual(calls.map(entry => entry.name), ['str_replace_editor'])
})

guardTest('paths outside the graph directory pass', async ({ workspace, call, calls }) => {
  for (const file_path of ['docs/graphs/x.md', 'docs/graph.md', 'docs/graph/../notes.md', join(workspace, 'src', 'a.ts'), join(tmpdir(), 'docs', 'graph', 'x.json')]) {
    passed(await call('Write', { file_path, content: 'x' }))
  }
  passed(await call('read', { file_path: 'docs/graph/nodes/goal-1.json' }))
  assert.equal(calls.length, 6)
})

guardTest('write-shaped shell commands that name the graph are denied with the graph correction', async ({ graph, call, calls }) => {
  // The shell text field is the one file-tools-only reads: `command`, and `text` for terminal_send.
  for (const [name, args] of [
    ['pwsh', { command: 'Remove-Item docs/graph/nodes/goal-1.json' }],
    ['Bash', { command: 'echo {} > docs\\graph\\nodes\\task-9.json' }],
    ['terminal_send', { text: `Set-Content -Path "${graph}\\nodes\\task-9.json" -Value x` }],
    ['pwsh', { command: 'cd .\\docs\\graph; Remove-Item nodes\\goal-1.json' }],
  ] as const) {
    const text = deniedByGraphRule(await call(name, args))
    assert.ok(text.includes('through the shell'), text)
  }
  // Commands file-tools-only does not count as writes (quoted arrows included), and writes elsewhere, are not this rule's.
  for (const command of ['npm run graph:render', 'Get-Content docs/graph/nodes/goal-1.json', 'git diff docs/graph', 'Write-Output "docs/graph => nodes"', 'Remove-Item build/out.txt', 'Remove-Item docs/graphs/x.md']) {
    passed(await call('pwsh', { command }))
  }
  assert.equal(calls.length, 6)
})

guardTest('the graph tools still write the graph', async ({ graph, call }) => {
  passed(await call('graph_comment', { id: 'goal-1', text: '经工具写' }))
  const entry = (await loadGraph(graph)).nodes.get('goal-1')!.history.at(-1)!
  assert.deepEqual([entry.actor, entry.op, entry.text], ['llm', 'comment', '经工具写'])
})

guardTest('next to the guard row, the graph rule decides first and the guard row keeps the rest', async ({ graph, workspace, call, calls }) => {
  // Registered outermost: a shell write into the graph gets the graph tools as its right path, not Write or Edit.
  deniedByGraphRule(await call('pwsh', { command: 'Remove-Item docs/graph/nodes/goal-1.json' }))
  deniedByGraphRule(await call('Write', { file_path: join(graph, 'nodes', 'goal-1.json'), content: '{}' }))
  const shell = denied(await call('pwsh', { command: 'Remove-Item build/out.txt' }))
  assert.ok(shell.includes('apply the change with Write or Edit'), 'file-tools-only still owns shell writes elsewhere')
  passed(await call('Write', { file_path: join(workspace, 'src', 'a.ts'), content: 'x' }))
  assert.deepEqual(calls.map(entry => entry.name), ['Write'])
}, { guardRow: true })

guardTest('nested transport calls pass, as in the guard row', async ({ call, calls }) => {
  passed(await call('write', { file_path: 'docs/graph/nodes/goal-1.json', content: '{}' }, { parent: { token: 'run_code' } }))
  assert.equal(calls.length, 1)
})

test('without a session directory only an absolute graph dir is guarded, and only for absolute targets', async () => {
  const { workspace, graph } = await workspaceWithGraph()
  try {
    const relative = fakeRuntime({ natives: NATIVES })
    apply(relative.ctx, {})
    passed(await caller(relative)('Write', { file_path: join(graph, 'nodes', 'goal-1.json'), content: '{}' }))

    const absolute = fakeRuntime({ natives: NATIVES })
    apply(absolute.ctx, { dir: graph })
    deniedByGraphRule(await caller(absolute)('Write', { file_path: join(graph, 'nodes', 'goal-1.json'), content: '{}' }))
    passed(await caller(absolute)('Write', { file_path: 'nodes/goal-1.json', content: '{}' }))
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('disposing the row removes the rule', async () => {
  const { workspace } = await workspaceWithGraph()
  try {
    const runtime = fakeRuntime({ natives: NATIVES, cwd: workspace })
    const dispose = apply(runtime.ctx, {})
    deniedByGraphRule(await caller(runtime)('Write', { file_path: 'docs/graph/x.json', content: '{}' }))
    dispose()
    assert.deepEqual(runtime.listeners.filter(entry => entry.event === 'tools/pre-execute'), [])
    passed(await caller(runtime)('Write', { file_path: 'docs/graph/x.json', content: '{}' }))
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('the rule is guard data: its id and declaration, and arguments it cannot read pass', () => {
  const rule = graphFilesOnly(join(tmpdir(), 'ws', 'docs', 'graph'), join(tmpdir(), 'ws'))
  assert.equal(rule.id, GRAPH_FILES_RULE)
  assert.match(rule.declare, /graph tools/)
  assert.deepEqual(rule.detect({ name: 'Write', arguments: 'docs/graph/x.json' }), { kind: 'allow' })
  assert.deepEqual(rule.detect({ name: 'Write', arguments: { file_path: 7 } }), { kind: 'allow' })
  const verdict = rule.detect({ name: 'Write', arguments: { file_path: 'docs/graph/x.json' } })
  assert.equal(verdict.kind === 'deny' ? verdict.rule : undefined, GRAPH_FILES_RULE)
})
