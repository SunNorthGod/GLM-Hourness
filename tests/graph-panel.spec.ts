import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APPLY_COMMAND, apply } from '../src/graph/panel-row.ts'
import type { CommandDefinitionLike, CommandInvocationLike } from '../src/shared/dsh-min.ts'
import { loadGraph } from '../src/graph/store.ts'
import { captureWarnings, fixtureTest, seedAsHuman } from './graph-helpers.ts'

interface Fixture {
  /** The session working directory; the graph is docs/graph under it. */
  readonly dir: string
  readonly graph: string
  readonly command: CommandDefinitionLike
  readonly run: (input: unknown) => ReturnType<CommandDefinitionLike['handler']>
  readonly rev: (id: string) => Promise<string>
}

/** Register the row on a commands host that keeps the definition. */
function register(config: Record<string, unknown> = {}): CommandDefinitionLike[] {
  const registered: CommandDefinitionLike[] = []
  apply({ commands: { register: definition => { registered.push(definition); return () => {} } } }, config)
  return registered
}

function invocation(cwd: string | undefined, rawInput: string): CommandInvocationLike {
  return { agent: { id: 'session-a', session: { id: 'session-a', ...(cwd === undefined ? {} : { header: { id: 'session-a', cwd } }) } }, rawInput }
}

const panelTest = fixtureTest(async (): Promise<Fixture> => {
  const dir = await mkdtemp(join(tmpdir(), 'graph-panel-'))
  const graph = join(dir, 'docs', 'graph')
  await mkdir(graph, { recursive: true })
  await seedAsHuman(graph, [
    { type: 'goal', title: '项目图' },
    { type: 'feature', title: '面板', parent: 'goal-1' },
    { type: 'question', title: '面板放哪', parent: 'feature-1', options: [{ key: 'A', label: '右侧栏', consequence: '与会话并排' }, { key: 'B', label: '网页', consequence: '离开 IDE' }], recommend: 'B' },
  ])
  const [command] = register()
  assert.ok(command !== undefined)
  return {
    dir,
    graph,
    command,
    run: input => command.handler(invocation(dir, typeof input === 'string' ? input : JSON.stringify(input))),
    rev: async id => (await loadGraph(graph)).revisions.get(id)!,
  }
})

panelTest('the row registers /graph-apply without recording the raw input', ({ command }) => {
  assert.equal(command.name, APPLY_COMMAND)
  assert.equal(command.recordInput, false)
  assert.equal(command.definitionId, 'dsh-glm-hourness/graph-panel')
  return Promise.resolve()
})

panelTest('a mutation from the panel is applied as the human, with a readable outcome', async ({ run, rev, graph }) => {
  const decided = await run({ op: 'decide', id: 'question-1', rev: await rev('question-1'), option: 'A', reason: '在面板里拍板' })
  assert.deepEqual(decided, { kind: 'success', text: '已拍板「面板放哪」：A 右侧栏' })
  const entry = (await loadGraph(graph)).nodes.get('question-1')!.history.at(-1)!
  assert.deepEqual([entry.actor, entry.op, entry.option, entry.reason], ['human', 'decide', 'A', '在面板里拍板'])
  assert.deepEqual(await run({ op: 'comment', id: 'feature-1', text: '先做读' }), { kind: 'success', text: '已批注「面板」' })
  assert.deepEqual(await run({ op: 'status', id: 'feature-1', rev: await rev('feature-1'), to: 'doing', reason: '开工' }), { kind: 'success', text: '「面板」改为进行中' })
})

panelTest('refusals come back as one Chinese line for the human who clicked, with the code; the LLM wording stays out', async ({ run, rev }) => {
  const stale = await run({ op: 'decide', id: 'question-1', rev: 'stale', option: 'A', reason: '旧版本' })
  assert.deepEqual(stale, { kind: 'error', text: '图没有写入（stale_revision）：这个节点刚被改过，面板已读到新内容，看一眼再点一次' })
  // A proposal the human already settled elsewhere: the line names the node's status now.
  assert.equal((await run({ op: 'approve', id: 'feature-1', rev: await rev('feature-1'), reason: '再批一次' })).text, '图没有写入（bad_transition）：节点已经不在可以这样改的状态（现在：已批准）')
  assert.equal((await run({ op: 'comment', id: 'feature-9', text: 'x' })).text, '图没有写入（not_found）：图里没有这个节点了')
  // Codes the panel does not cause keep the engine's message, after a Chinese lead.
  const relayed = await run({ op: 'comment', id: 'feature-1', text: 'x', relay: '人说的' })
  assert.match(relayed.text, /^图没有写入（invalid）：请求不合法（relay/)
  const garbled = await run('{ "op": ')
  assert.deepEqual(garbled, { kind: 'error', text: '图没有写入（invalid）：/graph-apply 后面要跟一个 JSON 写入请求' })
  for (const result of [stale, relayed, garbled]) assert.doesNotMatch(result.text, /read the projection|send one mutation/)
})

panelTest('the graph is found under the invoking session\'s working directory, or reported missing', async ({ command, dir }) => {
  const missing = await command.handler(invocation(join(dir, 'elsewhere'), JSON.stringify({ op: 'comment', id: 'goal-1', text: 'x' })))
  assert.deepEqual(missing, { kind: 'error', text: '图没有写入（not_found）：这个会话的工作目录下没有项目图（docs/graph）' })
  const noCwd = await command.handler(invocation(undefined, JSON.stringify({ op: 'comment', id: 'goal-1', text: 'x' })))
  assert.deepEqual(noCwd, { kind: 'error', text: '图没有写入（not_found）：这个会话没有工作目录，找不到项目图' })
})

panelTest('both panel commands are described in Chinese; /graph-run advertises its input', () => {
  const [applyCommand, runCommand] = register()
  assert.deepEqual([applyCommand?.description, runCommand?.description, runCommand?.input], ['项目图面板用：以人的身份改一次图', '项目图面板用：开始、暂停或重做一个任务', { hint: 'start|stop|redo <节点 id>' }])
  return Promise.resolve()
})

panelTest('an absolute config.dir is used as is', async ({ graph }) => {
  const [command] = register({ dir: graph })
  assert.ok(command !== undefined)
  const result = await command.handler(invocation(undefined, JSON.stringify({ op: 'comment', id: 'goal-1', text: '绝对路径' })))
  assert.equal(result.kind, 'success')
})

panelTest('activation never throws: a bad dir or a failed registration warns and registers nothing', async () => {
  const bad = await captureWarnings(() => register({ dir: ' ' }))
  assert.deepEqual(bad.result, [])
  assert.match(bad.warnings.join('\n'), /config\.dir must be a non-empty path/)
  const failing = await captureWarnings(() => apply({ commands: { register: () => { throw new Error('command "graph-apply" is already registered') } } }))
  assert.equal(typeof failing.result, 'function')
  assert.match(failing.warnings.join('\n'), /registering \/graph-apply failed/)
})
