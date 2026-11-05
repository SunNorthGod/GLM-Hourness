/**
 * Run controls on project graph nodes (docs/ORCHESTRATION.md §2.10
 * 运行控制, m2-9): the /graph-run handler of the graph-panel row over a
 * real graph, a live agent that records its followup / inject / cancel
 * calls in order, and the services the row injects: the session
 * projections (graphLive, subagentCatalog), the agents registry and the
 * subagents interrupt, which refuses another parent's child as rc.3 does
 * (dsh-subagent subagent:1266–1267). The panel's button rules (run.ts)
 * are checked on the same histories.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import { apply } from '../src/graph/panel-row.ts'
import { RUN_SOURCE } from '../src/graph/run-control.ts'
import { RUN_COMMAND, acceptanceChange, nodeRefusal, offersRedo, runNote } from '../src/graph/run.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandResultLike, InjectableServices, LiveAgentLike, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeInjector } from './fake-rc3.ts'
import { fixtureTest, seedAsHuman } from './graph-helpers.ts'
import { stepScope } from './step-agent.ts'

/** One call on an agent or the subagents service, in the order they happened. */
type Call =
  | { readonly agent: string, readonly call: 'followup' | 'inject', readonly message: UserNotice }
  | { readonly agent: string, readonly call: 'cancel', readonly cause: unknown, readonly options: unknown }
  | { readonly agent: string, readonly call: 'interrupt', readonly authority: unknown }

/** A live agent on a step scope (tests/step-agent.ts): `step()` runs its next step in rc.3's order and returns what the step admitted. */
type MutableAgent = LiveAgentLike & { status: 'idle' | 'running', step(messages?: readonly unknown[]): Promise<UserNotice[]> }

interface Fixture {
  readonly dir: string
  readonly graph: string
  readonly calls: Call[]
  readonly main: MutableAgent
  readonly command: CommandDefinitionLike<AgentCommandInvocationLike>
  readonly host: ReturnType<typeof fakeInjector>
  /** Where an agent stands (its graphLive focus); a session without one has no graphLive value. */
  readonly focus: (sessionId: string, focus: string | null) => void
  /** Add a direct child of the main agent to its catalog and the live agents. */
  readonly child: (id: string, label: string, focus: string | null, status: 'idle' | 'running') => MutableAgent
  readonly send: (input: string) => Promise<CommandResultLike>
}

const MAIN = 'session-main'

function liveAgent(id: string, cwd: string, calls: Call[]): MutableAgent {
  const scope = stepScope()
  const session = { id, header: { id, cwd }, deriveMessages: () => [] }
  return {
    id,
    status: 'idle',
    session,
    ctx: scope.ctx,
    followup: message => { calls.push({ agent: id, call: 'followup', message }) },
    inject: message => { calls.push({ agent: id, call: 'inject', message }) },
    cancel: (cause, options) => { calls.push({ agent: id, call: 'cancel', cause, options }) },
    step: async (messages = [{ id: `user-${id}`, role: 'user', content: [{ type: 'text', text: 'next' }], source: { kind: 'user' } }]) => {
      const decision = await scope.step(session, { messages })
      return decision.kind === 'enter' ? (decision.messages as UserNotice[]).filter(message => message.source?.kind === RUN_SOURCE) : []
    },
  }
}

/** The pause notice the agent's next step carries, and that the step after it carries none. */
async function pausedAtNextStep(agent: MutableAgent): Promise<UserNotice> {
  const told = await agent.step()
  assert.equal(told.length, 1, JSON.stringify(told))
  assert.deepEqual(await agent.step(), [], 'told once')
  return told[0]
}

const runTest = fixtureTest(async (): Promise<Fixture> => {
  const dir = await mkdtemp(join(tmpdir(), 'graph-run-'))
  const graph = join(dir, 'docs', 'graph')
  await mkdir(graph, { recursive: true })
  await seedAsHuman(graph, [
    { type: 'goal', title: '项目图' },
    { type: 'feature', title: '运行控制', parent: 'goal-1' },
    { type: 'task', title: '开始按钮', parent: 'feature-1', acceptance: ['主 Agent 收到指令'] },
    { type: 'task', title: '暂停按钮', parent: 'feature-1' },
  ])
  const calls: Call[] = []
  const main = liveAgent(MAIN, dir, calls)
  const values = new Map<string, Record<string, unknown>>()
  const agents = new Map<string, MutableAgent>([[MAIN, main]])
  const catalog: Array<{ id: string, mode: string, label: string }> = []
  values.set(MAIN, { subagentCatalog: catalog })
  const services: InjectableServices = {
    sessionProjections: {
      register: () => () => {},
      snapshot: (session, keys) => ({ values: Object.fromEntries(Object.entries(values.get(session.id) ?? {}).filter(([key]) => keys.includes(key))) }),
    },
    agents: { get: id => agents.get(id) },
    subagents: {
      interrupt: (target, authority) => {
        if (!catalog.some(entry => entry.id === target)) return
        if (authority.parentSessionId !== MAIN) throw Object.assign(new Error(`subagent "${target}" belongs to another parent session`), { code: 'UNAUTHORIZED' })
        calls.push({ agent: target, call: 'interrupt', authority })
      },
    },
  }
  const host = fakeInjector(services)
  const registered: Array<CommandDefinitionLike<AgentCommandInvocationLike>> = []
  apply({ commands: { register: definition => { registered.push(definition); return () => {} } }, inject: host.inject })
  const command = registered.find(definition => definition.name === RUN_COMMAND)
  assert.ok(command !== undefined)
  const focus: Fixture['focus'] = (sessionId, at) => { values.set(sessionId, { ...values.get(sessionId), graphLive: { focus: at, model: null, turnSince: null, steps: 0, tool: null, recent: [] } }) }
  return {
    dir,
    graph,
    calls,
    main,
    command,
    host,
    focus,
    child: (id, label, at, status) => {
      const agent = liveAgent(id, dir, calls)
      agent.status = status
      agents.set(id, agent)
      catalog.push({ id, mode: 'continuable', label })
      focus(id, at)
      return agent
    },
    send: input => command.handler({ commandId: 'command-1', agent: main, rawInput: input }),
  }
})

async function nodeOf(graph: string, id: string) {
  const node = (await loadGraph(graph)).nodes.get(id)
  assert.ok(node !== undefined)
  return node
}

function only(calls: readonly Call[], call: 'followup' | 'inject'): UserNotice {
  const found = calls.filter(entry => entry.call === call)
  assert.equal(found.length, 1, JSON.stringify(calls))
  return (found[0] as { readonly message: UserNotice }).message
}

const sequence = (calls: readonly Call[]): string[] => calls.map(entry => `${entry.agent}.${entry.call}`)

runTest('the row registers /graph-run; its short input stays on the command record', ({ command }) => {
  assert.equal(command.definitionId, 'dsh-glm-hourness/graph-run')
  assert.equal(command.recordInput, undefined, 'command/run keeps the raw input (dsh-commands default)')
  return Promise.resolve()
})

runTest('start: the main agent gets a followup naming the node and asking for graph_focus; the click lands in the node history as the human', async ({ graph, calls, main, send }) => {
  assert.deepEqual(await send('start task-1'), { kind: 'success', text: '已让主 Agent 从「开始按钮」开始做' })
  assert.deepEqual(sequence(calls), [`${MAIN}.followup`])
  const message = only(calls, 'followup')
  assert.deepEqual([message.role, message.source.kind, message.source.form, message.source.summary], ['user', RUN_SOURCE, 'notice', '从「开始按钮」开始做'])
  assert.deepEqual(message.source.graphRun, { action: 'start', node: 'task-1', commandId: 'command-1' })
  const text = message.content[0]?.text ?? ''
  assert.ok(text.includes('graph_focus {"id":"task-1"}'), text)
  assert.ok(text.includes('graph_status'), 'an approved task is to be marked doing')
  const entry = (await nodeOf(graph, 'task-1')).history.at(-1)
  assert.deepEqual([entry?.actor, entry?.op, entry?.text], ['human', 'comment', runNote('start')])
  // A busy agent gets it as a followup too: after its current turn, not into it.
  main.status = 'running'
  assert.deepEqual(await send('start task-1'), { kind: 'success', text: '已让主 Agent 从「开始按钮」开始做（它正忙，这一轮做完就接着做）' })
  assert.deepEqual(sequence(calls), [`${MAIN}.followup`, `${MAIN}.followup`])
})

runTest('stop on the main agent: cancel keeping the inbox, then the pause notice before its next step, not into its inbox', async ({ graph, calls, main, focus, send }) => {
  main.status = 'running'
  focus(MAIN, 'task-1')
  assert.deepEqual(await send('stop task-1'), { kind: 'success', text: '已暂停「开始按钮」：停下了主 Agent' })
  assert.deepEqual(sequence(calls), [`${MAIN}.cancel`])
  const cancel = calls[0] as Extract<Call, { call: 'cancel' }>
  assert.deepEqual([cancel.cause, cancel.options], [{ kind: 'user' }, { keepInbox: true }])
  main.status = 'idle'
  const notice = await pausedAtNextStep(main)
  assert.deepEqual(notice.source.graphRun, { action: 'stop', node: 'task-1', commandId: 'command-1', stopped: [MAIN] })
  assert.match(notice.content[0]?.text ?? '', /不要接着做这个节点，也不要重新派发它/)
  const entry = (await nodeOf(graph, 'task-1')).history.at(-1)
  assert.deepEqual([entry?.actor, entry?.op, entry?.text], ['human', 'comment', `${runNote('stop')}：停下了主 Agent`])
})

runTest('stop on a child: the main agent gets the notice first, then the child is interrupted as the human of this parent', async ({ calls, main, focus, child, send }) => {
  main.status = 'running'
  focus(MAIN, 'task-2')
  child('child-1', '写开始按钮', 'task-1', 'running')
  child('child-2', '跟着主 Agent', null, 'running') // no focus of its own: stands on task-2 with the main agent
  child('child-3', '已停下', 'task-1', 'idle')
  assert.deepEqual(await send('stop task-1'), { kind: 'success', text: '已暂停「开始按钮」：停下了子 agent 写开始按钮' })
  assert.deepEqual(sequence(calls), ['child-1.interrupt'])
  assert.deepEqual((calls[0] as Extract<Call, { call: 'interrupt' }>).authority, { kind: 'user', parentSessionId: MAIN })
  assert.deepEqual((await pausedAtNextStep(main)).source.graphRun, { action: 'stop', node: 'task-1', commandId: 'command-1', stopped: ['child-1'] })
  // On the main agent's node, the child without a focus of its own is stopped with it.
  assert.deepEqual(await send('stop task-2'), { kind: 'success', text: '已暂停「暂停按钮」：停下了主 Agent、子 agent 跟着主 Agent' })
  assert.deepEqual(sequence(calls.slice(1)), [`${MAIN}.cancel`, 'child-2.interrupt'])
  assert.deepEqual((await pausedAtNextStep(main)).source.graphRun, { action: 'stop', node: 'task-2', commandId: 'command-1', stopped: [MAIN, 'child-2'] })
})

runTest('redo: a done task reopens as the human, the agent on it is cancelled, then the message with the acceptance before and after follows up', async ({ graph, calls, main, focus, send }) => {
  const engine = openEngine(graph)
  const rev = async () => (await loadGraph(graph)).revisions.get('task-1')
  for (const mutation of [
    { op: 'status', id: 'task-1', to: 'doing', reason: '开工' },
    { op: 'status', id: 'task-1', to: 'done', reason: '做完', evidence: [{ kind: 'commit', ref: 'abc1234' }] },
    { op: 'edit', id: 'task-1', set: { acceptance: ['主 Agent 收到指令', '焦点落在节点上'] }, reason: '验收条件加一条' },
  ]) assert.ok((await engine.apply('human', { ...mutation, rev: await rev() })).ok)
  const done = await nodeOf(graph, 'task-1')
  assert.deepEqual([offersRedo(done), nodeRefusal(done, 'start')], [true, '「开始按钮」已经完成；要再做一遍，用「按现在的验收条件重做」'])
  main.status = 'running'
  focus(MAIN, 'task-1')
  assert.deepEqual(await send('redo task-1'), { kind: 'success', text: '已让主 Agent 按现在的验收条件重做「开始按钮」（先停下了主 Agent）' })
  assert.deepEqual(sequence(calls), [`${MAIN}.cancel`, `${MAIN}.followup`])
  const message = only(calls, 'followup')
  assert.deepEqual(message.source.graphRun, { action: 'redo', node: 'task-1', commandId: 'command-1', stopped: [MAIN] })
  const text = message.content[0]?.text ?? ''
  assert.ok(text.includes('验收条件原来是：\n- 主 Agent 收到指令\n现在是：\n- 主 Agent 收到指令\n- 焦点落在节点上'), text)
  assert.ok(text.includes('它已从完成改回进行中'), text)
  const reopened = await nodeOf(graph, 'task-1')
  const entry = reopened.history.at(-1)
  assert.deepEqual([reopened.status, entry?.actor, entry?.op, entry?.from, entry?.to, entry?.reason], ['doing', 'human', 'status', 'done', 'doing', `${runNote('redo')}：先停下了主 Agent`])
  assert.deepEqual([acceptanceChange(reopened), offersRedo(reopened)], [undefined, false], 'the redo is newer than the edit')
})

runTest('the panel offers a redo on a task in progress once its acceptance changed after it was started', async ({ graph, send }) => {
  const engine = openEngine(graph)
  assert.equal((await send('start task-1')).kind, 'success')
  const rev = async () => (await loadGraph(graph)).revisions.get('task-1')
  assert.ok((await engine.apply('llm', { op: 'status', id: 'task-1', rev: await rev(), to: 'doing', reason: '开工' })).ok)
  assert.equal(offersRedo(await nodeOf(graph, 'task-1')), false)
  assert.ok((await engine.apply('human', { op: 'edit', id: 'task-1', rev: await rev(), set: { acceptance: ['改过的条件'] }, reason: '改条件' })).ok)
  const changed = await nodeOf(graph, 'task-1')
  assert.deepEqual(acceptanceChange(changed), { from: ['主 Agent 收到指令'], to: ['改过的条件'] })
  assert.equal(offersRedo(changed), true)
  assert.deepEqual(await send('redo task-1'), { kind: 'success', text: '已让主 Agent 按现在的验收条件重做「开始按钮」' })
  assert.equal((await nodeOf(graph, 'task-1')).status, 'doing', 'a task in progress stays in progress; the redo is a comment')
  assert.equal(offersRedo(await nodeOf(graph, 'task-1')), false)
})

test('a redo written under the earlier label still marks where the last run began', () => {
  // m2-9-l4 in the real graph: the redo note of the label used until 2026-10-29, then no acceptance edit.
  const at = '2026-10-28T10:00:00Z'
  const node: GraphNode = {
    id: 'task-1', type: 'task', title: 't', status: 'doing', parent: 'feature-1', acceptance: ['新'],
    history: [
      { at, actor: 'human', op: 'propose' },
      { at, actor: 'human', op: 'edit', reason: '改条件', changes: { acceptance: { from: ['旧'], to: ['新'] } } },
      { at, actor: 'human', op: 'status', from: 'done', to: 'doing', reason: '人在面板里点了「改了验收条件后重做」：先停下了主 Agent' },
    ],
  }
  assert.deepEqual([acceptanceChange(node), offersRedo(node)], [undefined, false])
})

runTest('refusals give one readable line and change nothing: bad input, unknown node, not a task, nobody on the node, no subagents service', async ({ graph, calls, main, focus, child, host, send }) => {
  const before = (await loadGraph(graph)).revision
  const refusals: Array<[string, string]> = [
    ['go task-1', '/graph-run 没有执行：用法是 /graph-run start|stop|redo <节点 id>'],
    ['start', '/graph-run 没有执行：用法是 /graph-run start|stop|redo <节点 id>'],
    ['start task-9', '「从这里开始做」没有执行：图里没有节点 task-9'],
    ['start feature-1', '「从这里开始做」没有执行：feature-1 是特性，运行控制只用于任务'],
    ['stop task-1', '「暂停」没有执行：「开始按钮」上现在没有在跑的 agent'],
  ]
  for (const [input, text] of refusals) assert.deepEqual(await send(input), { kind: 'error', text }, input)
  main.status = 'running'
  focus(MAIN, 'task-2')
  assert.deepEqual(await send('stop task-1'), { kind: 'error', text: '「暂停」没有执行：「开始按钮」上现在没有在跑的 agent' }, 'the main agent runs elsewhere')
  child('child-1', '写开始按钮', 'task-1', 'running')
  host.remove('subagents')
  assert.deepEqual(await send('stop task-1'), { kind: 'error', text: '「暂停」没有执行：宿主没有 agents、subagents 服务，看不出也停不了子 agent' })
  assert.deepEqual(await send('stop task-2'), { kind: 'error', text: '「暂停」没有执行：宿主没有 agents、subagents 服务，看不出也停不了子 agent' }, 'not even the main agent: a child may stand there too')
  host.remove('sessionProjections')
  assert.deepEqual(await send('redo task-1'), { kind: 'error', text: '「按现在的验收条件重做」没有执行：现场投影 graphLive 不在，看不出谁在这个节点上' })
  assert.deepEqual(calls, [])
  assert.equal((await loadGraph(graph)).revision, before)
})
