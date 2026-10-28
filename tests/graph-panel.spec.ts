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
    { type: 'question', title: '面板放哪', parent: 'feature-1', options: [{ key: 'A', label: '右侧栏', consequence: '与会话并排' }, { key: 'B', label: '网页', consequence: '离开 IDE' }], recommend: 'A' },
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

panelTest('refusals come back as one line with the code and the way forward', async ({ run }) => {
  const stale = await run({ op: 'decide', id: 'question-1', rev: 'stale', option: 'A', reason: '旧版本' })
  assert.equal(stale.kind, 'error')
  assert.match(stale.text, /^图没有写入（stale_revision）：.+。read the projection again/)
  const relayed = await run({ op: 'comment', id: 'feature-1', text: 'x', relay: '人说的' })
  assert.match(relayed.text, /^图没有写入（invalid）：relay/)
  const garbled = await run('{ "op": ')
  assert.equal(garbled.kind, 'error')
  assert.match(garbled.text, /^图没有写入（invalid）：the input is not JSON/)
})

panelTest('the graph is found under the invoking session\'s working directory, or reported missing', async ({ command, dir }) => {
  const missing = await command.handler(invocation(join(dir, 'elsewhere'), JSON.stringify({ op: 'comment', id: 'goal-1', text: 'x' })))
  assert.equal(missing.kind, 'error')
  assert.match(missing.text, /^图没有写入（not_found）：no project graph at/)
  const noCwd = await command.handler(invocation(undefined, JSON.stringify({ op: 'comment', id: 'goal-1', text: 'x' })))
  assert.match(noCwd.text, /^图没有写入（not_found）：this session has no working directory/)
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
