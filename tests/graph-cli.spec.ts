import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli, type CliResult } from '../src/graph/cli.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { fixtureTest, seedAsHuman, type GraphAnswer } from './graph-helpers.ts'

interface Run {
  readonly exitCode: CliResult['exitCode']
  /** The parsed stdout document. */
  readonly out: GraphAnswer
  readonly readStdin: boolean
}

interface Fixture {
  readonly dir: string
  /** Run the CLI against the fixture graph; stdin is the given text. */
  cli(args: readonly string[], stdin?: string): Promise<Run>
  rev(id: string): Promise<string>
  node(id: string): Promise<GraphNode>
}

/**
 * goal-1
 *   feature-1 approved
 *     task-1 approved
 */
async function fixture(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), 'graph-cli-'))
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 9, 28, 9, 0, tick++))
  await seedAsHuman(dir, [
    { type: 'goal', title: '项目图引擎', acceptance: ['人能看，LLM 能读写'] },
    { type: 'feature', title: '命令行', parent: 'goal-1' },
    { type: 'task', title: '读投影', parent: 'feature-1' },
  ], { now })
  return {
    dir,
    async cli(args, stdin = '') {
      let readStdin = false
      const result = await runCli(['--dir', dir, ...args], {
        dir: join(dir, 'unused'),
        now,
        stdin: () => {
          readStdin = true
          return Promise.resolve(stdin)
        },
      })
      assert.ok(result.text.endsWith('\n'), 'stdout is one newline-terminated document')
      return { exitCode: result.exitCode, out: JSON.parse(result.text) as GraphAnswer, readStdin }
    },
    rev: async id => (await loadGraph(dir)).revisions.get(id)!,
    node: async id => (await loadGraph(dir)).nodes.get(id)!,
  }
}

const cliTest = fixtureTest(fixture)

function refused(result: Run, exitCode: 1 | 2, code: string, field?: string): void {
  assert.equal(result.exitCode, exitCode, JSON.stringify(result.out))
  assert.equal(result.out.ok, false)
  assert.equal(result.out.error.code, code, JSON.stringify(result.out.error))
  if (field !== undefined) assert.equal(result.out.error.field, field, JSON.stringify(result.out.error))
  assert.equal(typeof result.out.error.message, 'string')
  assert.ok(result.out.error.hint.length > 0, 'every refusal names the way forward')
}

cliTest('show prints the projection of a node; an unknown node is a structured not_found', async g => {
  const shown = await g.cli(['show', 'task-1'])
  assert.equal(shown.exitCode, 0)
  assert.equal(shown.out.ok, true)
  assert.equal(shown.out.projection.node.id, 'task-1')
  assert.equal(shown.out.projection.node.rev, await g.rev('task-1'))
  assert.deepEqual(shown.out.projection.ancestors.map((entry: { id: string }) => entry.id), ['feature-1', 'goal-1'])
  assert.deepEqual(shown.out.projection.ancestors[1].acceptance, ['人能看，LLM 能读写'])
  refused(await g.cli(['show', 'task-9']), 1, 'not_found', 'id')
})

cliTest('open lists the open items with the decision queue', async g => {
  await g.cli(['propose', JSON.stringify({ reason: '问人', node: { type: 'question', title: '输出格式', parent: 'feature-1', options: [{ key: 'A', label: '缩进 JSON', consequence: '好读' }, { key: 'B', label: '单行 JSON', consequence: '省字' }], recommend: 'A' } })])
  const open = await g.cli(['open'])
  assert.equal(open.exitCode, 0)
  assert.deepEqual(open.out.items.ready.map((entry: { id: string }) => entry.id), ['task-1'])
  assert.equal(open.out.items.questions.length, 1)
  const card = open.out.items.questions[0]
  assert.deepEqual([card.id, card.recommend, card.raisedBy?.id, card.askedBy, card.options.length], ['question-1', 'A', 'feature-1', 'llm', 2])
})

cliTest('propose from a JSON argument writes as the llm: plan-internal approved, plan-external proposed', async g => {
  const task = await g.cli(['propose', JSON.stringify({ reason: '拆分', node: { type: 'task', title: '写命令', parent: 'feature-1', kind: 'implement', writeScope: ['src/graph/cli.ts'] } })])
  assert.equal(task.exitCode, 0, JSON.stringify(task.out))
  assert.equal(task.readStdin, false, 'a JSON argument leaves stdin alone')
  assert.deepEqual([task.out.id, task.out.node.status, task.out.changed], ['task-2', 'approved', ['task-2']])
  assert.equal(task.out.rev, await g.rev('task-2'))
  assert.deepEqual((await g.node('task-2')).history, [{ at: '2026-10-28T09:00:03.000Z', actor: 'llm', op: 'propose', reason: '拆分', to: 'approved' }])
  const branch = await g.cli(['propose', JSON.stringify({ reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })])
  assert.equal(branch.out.node.status, 'proposed')
})

cliTest('status with evidence from stdin; done without evidence is refused with a structured error', async g => {
  const rev = await g.rev('task-1')
  refused(await g.cli(['status'], JSON.stringify({ id: 'task-1', rev, to: 'done', reason: '做完了' })), 1, 'evidence_required', 'evidence')
  refused(await g.cli(['status', '-'], JSON.stringify({ id: 'task-1', rev, to: 'done', reason: '做完了', evidence: [{ kind: 'test', ref: 'npm test', exit: 1 }] })), 1, 'evidence_required', 'evidence')
  assert.equal((await g.node('task-1')).status, 'approved', 'refused requests write nothing')
  const done = await g.cli(['status'], `\uFEFF${JSON.stringify({ id: 'task-1', rev, to: 'done', reason: '测试通过', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] })}`)
  assert.equal(done.exitCode, 0, JSON.stringify(done.out))
  assert.equal(done.out.node.status, 'done')
  const entry = (await g.node('task-1')).history.at(-1)!
  assert.deepEqual(entry, { at: entry.at, actor: 'llm', op: 'status', reason: '测试通过', from: 'approved', to: 'done', evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] })
  assert.equal(done.readStdin, true)
  refused(await g.cli(['status'], JSON.stringify({ id: 'task-1', rev, to: 'doing', reason: '返工' })), 1, 'stale_revision', 'rev')
})

cliTest('link from --file and comment; the edge and the text land in history', async g => {
  await g.cli(['propose', JSON.stringify({ reason: '拆分', node: { type: 'task', title: '写命令', parent: 'feature-1' } })])
  const request = join(g.dir, 'link.json')
  await writeFile(request, JSON.stringify({ id: 'task-2', rev: await g.rev('task-2'), type: 'depends', to: 'task-1', reason: '先读后写' }))
  const linked = await g.cli(['link', '--file', request])
  assert.equal(linked.exitCode, 0, JSON.stringify(linked.out))
  assert.equal(linked.readStdin, false, '--file leaves stdin alone')
  assert.deepEqual(linked.out.node.edges, [{ type: 'depends', to: 'task-1' }])
  refused(await g.cli(['link', '--file', request]), 1, 'stale_revision', 'rev')
  const commented = await g.cli(['comment', JSON.stringify({ id: 'task-2', text: '等 task-1' })])
  assert.equal(commented.exitCode, 0)
  assert.deepEqual((await g.node('task-2')).history.at(-1), { at: commented.out.node.history.at(-1)?.at, actor: 'llm', op: 'comment', text: '等 task-1' })
  const shown = await g.cli(['show', 'task-1'])
  assert.deepEqual(shown.out.projection.dependents.map((entry: { id: string }) => entry.id), ['task-2'])
})

cliTest('the actor is always llm: human-only operations and an actor field are refused', async g => {
  await g.cli(['propose', JSON.stringify({ reason: '新分支', node: { type: 'feature', title: '查看器', parent: 'goal-1' } })])
  const rev = await g.rev('feature-2')
  refused(await g.cli(['approve', JSON.stringify({ id: 'feature-2', rev, reason: '自批' })]), 1, 'forbidden')
  refused(await g.cli(['approve', JSON.stringify({ id: 'feature-2', rev, reason: '冒充', actor: 'human' })]), 1, 'invalid', 'actor')
  refused(await g.cli(['edit', JSON.stringify({ id: 'goal-1', rev: await g.rev('goal-1'), reason: '放宽', set: { acceptance: ['能跑就行'] } })]), 1, 'forbidden')
  assert.equal((await g.node('feature-2')).status, 'proposed')
})

cliTest('bad command lines and unreadable input are usage errors with exit code 2', async g => {
  refused(await g.cli([]), 2, 'invalid')
  refused(await g.cli(['delete', '{}']), 2, 'invalid')
  refused(await g.cli(['show']), 2, 'invalid')
  refused(await g.cli(['open', 'extra']), 2, 'invalid')
  refused(await g.cli(['show', 'task-1', '--file', 'x.json']), 2, 'invalid', 'file')
  refused(await g.cli(['comment', '--verbose', '{}']), 2, 'invalid')
  refused(await g.cli(['comment']), 2, 'invalid')
  refused(await g.cli(['comment', '{"id": "task-1",']), 2, 'invalid')
  refused(await g.cli(['comment', '["task-1"]']), 2, 'invalid')
  refused(await g.cli(['comment', '{"op": "approve", "id": "task-1", "text": "x"}']), 2, 'invalid', 'op')
  refused(await g.cli(['comment', '{}', '{}']), 2, 'invalid')
  refused(await g.cli(['comment', '{}', '--file', 'x.json']), 2, 'invalid', 'file')
  refused(await g.cli(['comment', '--file', join(g.dir, 'missing.json')]), 2, 'invalid', 'file')
  const malformed = await g.cli(['comment', '{"id": "task-1"}'])
  refused(malformed, 1, 'invalid', 'text')
  assert.equal((await g.node('task-1')).history.length, 1, 'nothing was written')
})
