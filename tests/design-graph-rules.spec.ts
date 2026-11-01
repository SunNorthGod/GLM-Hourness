/**
 * The rules about how a session may write the project graph (src/guard/
 * main-agent-graph.ts, docs/ORCHESTRATION.md §6.7): main-agent-graph-relay and
 * main-agent-graph-options, on the fake host with the real fold of the session
 * log under them. The graph tools register for every agent and a write that
 * carries `relay` has the human's authority, so whose words they are is checked
 * before the tool runs, by kind of session.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { GRAPH_DELEGATIONS_RULE, GRAPH_OPTIONS_RULE, GRAPH_RELAY_RULE, MAIN_AGENT_RULES } from '../src/guard/main-agent-rules.ts'
import { denied, designHost, healthOf, hostWithoutTalkProjection, journaled, sleep, type DesignHost, type FakeAgent } from './design-host.ts'
import { captureWarnings } from './graph-helpers.ts'
import { mainAgentWithGoal, type MainAgentFixture } from './design-tools-helpers.ts'
import { exampleRecord } from './proposal-examples.ts'

/** A question for the human in the proposal shape, put by the main agent. */
async function proposal(fixture: MainAgentFixture): Promise<string> {
  const result = await fixture.engine.apply('llm', { op: 'propose', reason: '交给人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend') } })
  assert.ok(result.ok)
  return result.id
}

const decideWith = (id: string, relay: string | undefined) => ({ id, rev: 'r', conclusion: '默认少做', reason: '人在对话里同意', ...relay === undefined ? {} : { relay } })

// ---------------------------------------------------------------- main-agent-graph-relay, the main agent

test('the main agent\'s relay has to be in a message the human sent after the node last changed: invented, older or borrowed words are denied with the right path', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  await host.say(agent, '之前说过：全部放行')
  const id = await proposal(fixture)
  await host.say(agent, '可以，就按推荐的来')
  for (const relay of ['我编的一句话', '全部放行']) {
    const reason = denied(await host.preExecute(agent, 'graph_decide', decideWith(id, relay)))
    assert.match(reason, new RegExp(`^The words you relayed are not in a message the human sent after ${id} last changed\\.`), relay)
    assert.ok(reason.includes('Boundary: Only the human\'s own words carry their authority.'))
    assert.ok(reason.includes('Right path: Quote them exactly from their message, or ask them and wait; to record an answer to a proposal, use record_human_answer.'))
    assert.ok(reason.includes('Exception: none'))
  }
  for (const tool of ['graph_approve', 'graph_status', 'graph_edit', 'graph_reject', 'graph_link']) {
    denied(await host.preExecute(agent, tool, { id, rev: 'r', reason: 'x', relay: '我编的一句话' }))
  }
  const rows = (await journaled(host, 7)).filter(row => row.rule === GRAPH_RELAY_RULE)
  assert.equal(rows.length, 7)
  assert.deepEqual([rows[0].tool, rows[0].sessionId, rows[0].node], ['graph_decide', 's1', id])
  // Their real words, said after the node last changed, go through; so does a call without relay.
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith(id, '可以，就按推荐的来'))).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith(id, '可以'))).kind, 'allow', 'a whole phrase of it')
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith(id, undefined))).kind, 'allow')
})

test('a comment does not move the point the human\'s words must come after, and a change of the node does', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  const id = await proposal(fixture)
  await host.say(agent, '可以，就按推荐的来')
  await sleep(4)
  await engine.apply('llm', { op: 'comment', id, text: '备注' })
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith(id, '可以，就按推荐的来'))).kind, 'allow')
  await sleep(4)
  const rev = (await engine.load()).revisions.get(id)
  assert.ok((await engine.apply('llm', { op: 'edit', id, rev, reason: '改方案', set: { proposal: '借书先不收押金，逾期再说' } })).ok)
  denied(await host.preExecute(agent, 'graph_decide', decideWith(id, '可以，就按推荐的来')))
})

test('a new node has no earlier state: any message of this session counts, and a quote that is not in one is denied', async () => {
  const { host, agent } = await mainAgentWithGoal()
  await host.say(agent, '加一个模块：记一笔')
  const args = (relay: string) => ({ node: { type: 'feature', title: '记一笔', parent: 'goal-1' }, reason: '人要的', relay })
  assert.equal((await host.preExecute(agent, 'graph_propose', args('加一个模块：记一笔'))).kind, 'allow')
  assert.match(denied(await host.preExecute(agent, 'graph_propose', args('另一个模块'))), /^The words you relayed are not in a message the human sent in this session\./)
})

test('a call that names no node that exists, and a graph that cannot be read, are left to the tool to refuse', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  await host.say(agent, '可以')
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith('question-99', '编的'))).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'graph_decide', { rev: 'r', conclusion: 'x', reason: 'x', relay: '编的' })).kind, 'allow')
})

test('when the session\'s messages cannot be read the main agent\'s relay is denied, and the health says so; a call without relay is not affected', async () => {
  const host = hostWithoutTalkProjection()
  const { apply } = await import('../src/design/index.ts')
  await captureWarnings(() => apply(host.ctx))
  const agent: FakeAgent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  ;(agent.session as { snapshotEvents?: unknown }).snapshotEvents = undefined
  const { openEngine } = await import('../src/graph/engine.ts')
  const engine = openEngine(join(host.workspace('ws'), 'docs', 'graph'))
  await engine.apply('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview' } })
  const reason = denied(await host.preExecute(agent, 'graph_approve', { id: 'goal-1', rev: 'r', reason: 'x', relay: '可以' }))
  assert.match(reason, /^The harness cannot read this session's messages, so it cannot check the words you relayed\./)
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /读不到会话里人的消息，带转述的图写入一律被拒/)
  assert.equal((await host.preExecute(agent, 'graph_approve', { id: 'goal-1', rev: 'r', reason: 'x' })).kind, 'allow')
})

// ---------------------------------------------------------------- main-agent-graph-relay, a delegated session

test('a subagent\'s relay is refused whatever it says; the attempt is journaled with who tried and at what, the main agent is told once, and the row health says so', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  const child = host.addAgent('child', { origin: 'subagent', parentSession: agent.id })
  await host.say(agent, '可以，放行')
  await sleep(2)
  const rev = (await engine.load()).revisions.get('goal-1')
  const call = { id: 'goal-1', rev, set: { stage: 'release' }, reason: '放行', relay: '可以，放行' }
  const reason = denied(await host.preExecute(child, 'graph_edit', call))
  assert.match(reason, /^Subagents do not relay the human's words\./)
  assert.ok(reason.includes('Boundary: Only the main agent talks with the human, and only it records their words.'))
  assert.ok(reason.includes('Right path: Report back; the main agent records the human\'s words.'))
  assert.ok(reason.includes('Exception: none'))
  const [row] = (await journaled(host, 1)).filter(entry => entry.rule === GRAPH_RELAY_RULE)
  assert.deepEqual(row.session, { id: 'child', kind: 'subagent', parent: 's1' })
  assert.deepEqual([row.goal, row.node, row.tool, row.agentId], ['goal-1', 'goal-1', 'graph_edit', 'child'])
  // The stage was not touched.
  assert.equal((await engine.load()).nodes.get('goal-1')?.stage, 'interview')
  // The main agent reads it in its next step, once in ten minutes for the same session and goal.
  const notices = agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass')
  assert.equal(notices.length, 1)
  assert.equal(notices[0].via, 'inject')
  assert.equal(notices[0].message.content[0].text, '[拦下] 子 agent「child」想不经人的同意把「记账小工具」推到 release，harness 拒绝了（main-agent-graph-relay）。下一次回复里用一句话告诉人。')
  denied(await host.preExecute(child, 'graph_edit', call))
  denied(await host.preExecute(child, 'graph_approve', { id: 'goal-1', rev, reason: '批准', relay: '可以，放行' }))
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 1, 'no second notice for the same session and goal')
  const other = host.addAgent('child-2', { origin: 'subagent', parentSession: agent.id })
  denied(await host.preExecute(other, 'graph_edit', call))
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 2, 'another session is another notice')
  // The row says it: the main agent's health, from the next step on.
  await host.created(agent)
  await agent.assemble()
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /^最近 24 小时有 4 次不经人的同意推进目标的写入被拦下，最近一次：子 agent「child-2」想把「记账小工具」推到 release，\d+月\d+日 \d\d:\d\d$/)
  // The delegated session's calls without relay are not touched by this rule.
  assert.equal((await host.preExecute(child, 'graph_comment', { id: 'goal-1', text: '备注' })).kind, 'allow')
  assert.equal((await host.preExecute(child, 'graph_edit', { ...call, relay: undefined })).kind, 'allow')
})

test('with no main agent holding the project the attempt is journaled and the row says it, but nobody gets a notice', async () => {
  const host = designHost()
  const { apply } = await import('../src/design/index.ts')
  apply(host.ctx)
  const idle = host.addAgent('idle')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: idle.id })
  denied(await host.preExecute(child, 'graph_decide', decideWith('question-1', '可以')))
  const [row] = await journaled(host, 1)
  assert.equal(row.rule, GRAPH_RELAY_RULE)
  assert.equal(idle.sent.length, 0)
  assert.equal(host.agents.get('child')?.sent.length, 0)
})

test('an ordinary session\'s relay is not checked here', async () => {
  const fixture = await mainAgentWithGoal()
  const plain = fixture.host.addAgent('plain')
  assert.equal((await fixture.host.preExecute(plain, 'graph_decide', decideWith('question-1', '我编的'))).kind, 'allow')
})

// ---------------------------------------------------------------- main-agent-graph-options

const TABLE_NODE = { type: 'question', title: '存储格式', parent: 'goal-1', options: [{ key: 'B', label: 'a', gain: 'g', cost: 'c' }, { key: 'A', label: 'b', gain: 'g', cost: 'c' }], recommend: 'A', crux: '取决于什么？', verdict: '是 → B；否 → A', weight: 'two-way' }

test('the main agent does not put a question with options to the human: proposing one or giving a question of the human\'s a table is denied', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  const reason = denied(await host.preExecute(agent, 'graph_propose', { node: TABLE_NODE, reason: '问人' }))
  assert.match(reason, /^You tried to put an option table for the human on the graph for "存储格式"\./)
  assert.ok(reason.includes('Boundary: As the main agent you put a matter to the human with propose_to_human; the graph keeps no table of options for them to pick from.'))
  assert.ok(reason.includes('Right path: Put the matter with propose_to_human (form choose lists two or three ways when a real trade-off exists). A question you decide yourself takes decider agent.'))
  // A question it decides itself keeps its table; a proposal and a non-question are not touched.
  assert.equal((await host.preExecute(agent, 'graph_propose', { node: { ...TABLE_NODE, decider: 'agent' }, reason: '自己定' })).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'graph_propose', { node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend') }, reason: '问人' })).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'graph_propose', { node: { type: 'task', title: '写代码', parent: 'goal-1' }, reason: 'x' })).kind, 'allow')
  // Editing the card of a question the human decides is the same thing.
  const asked = await engine.apply('human', { op: 'propose', reason: '建图', node: TABLE_NODE })
  const own = await engine.apply('llm', { op: 'propose', reason: '自己定', node: { ...TABLE_NODE, decider: 'agent' } })
  assert.ok(asked.ok && own.ok)
  if (!asked.ok || !own.ok) return
  denied(await host.preExecute(agent, 'graph_edit', { id: asked.id, rev: asked.rev, set: { crux: '取决于别的？' }, reason: '改' }))
  denied(await host.preExecute(agent, 'graph_edit', { id: asked.id, rev: asked.rev, set: { options: TABLE_NODE.options }, reason: '改' }))
  assert.equal((await host.preExecute(agent, 'graph_edit', { id: asked.id, rev: asked.rev, set: { title: '换个题' }, reason: '改' })).kind, 'allow', 'not a card field')
  assert.equal((await host.preExecute(agent, 'graph_edit', { id: own.id, rev: own.rev, set: { crux: '取决于别的？' }, reason: '改' })).kind, 'allow', 'its own')
  assert.equal((await host.preExecute(agent, 'graph_edit', { id: asked.id, rev: asked.rev, set: { crux: '取决于别的？', decider: 'agent' }, reason: '改' })).kind, 'allow', 'handing it to itself')
  const rows = (await journaled(host, 3)).filter(row => row.rule === GRAPH_OPTIONS_RULE)
  assert.equal(rows.length, 3)
  // Only the main agent: a subagent and an ordinary session are not held to it.
  const child = host.addAgent('child', { origin: 'subagent', parentSession: agent.id })
  const plain = host.addAgent('plain')
  for (const other of [child, plain]) assert.equal((await host.preExecute(other, 'graph_propose', { node: TABLE_NODE, reason: '问人' })).kind, 'allow', other.id)
})

test('the options rule lets the call through when the graph cannot be read, and the health says so', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  // The first judgment reads where the project is; the graph row breaks after that.
  assert.equal((await host.preExecute(agent, 'graph_propose', { node: { type: 'task', title: '写代码', parent: 'goal-1' }, reason: 'x' })).kind, 'allow')
  host.services.set('glmHournessGraph', { dirFor: () => { throw new Error('graph row broke') }, isGraphTool: () => false, focusOf: () => undefined })
  const { warnings } = await captureWarnings(async () => {
    assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'question-1', rev: 'r', set: { crux: '取决于什么？' }, reason: '改' })).kind, 'allow')
  })
  assert.ok(warnings.length >= 0)
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /没能查这次图写入是不是给人列选项/)
})

test('a nested call with a parent token is never judged by these rules, like the other rules of the main agent', async () => {
  const { host, agent } = await mainAgentWithGoal()
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith('question-1', '我编的'), {})).kind, 'allow')
})

// ---------------------------------------------------------------- main-agent-graph-delegations

/** The main agent, a subagent it dispatched and an ordinary session of the same project. */
async function sessions(): Promise<{ readonly host: DesignHost, readonly agent: FakeAgent, readonly child: FakeAgent, readonly plain: FakeAgent }> {
  const { host, agent } = await mainAgentWithGoal()
  return { host, agent, child: host.addAgent('child', { origin: 'subagent', parentSession: agent.id }), plain: host.addAgent('plain') }
}

const NODE = 'norm-delegations'
const DELEGATION_NODE = { id: NODE, type: 'norm', title: '交给主 Agent 定的几类事', parent: 'goal-1', acceptance: ['代码风格：主 Agent 定，只告知'] }

/** Write calls of the graph tools that point at the node of what the human handed over, each in a different way. */
const AT_NODE: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['graph_propose', { node: DELEGATION_NODE, reason: 'x' }],
  ['graph_propose', { node: DELEGATION_NODE, reason: 'x', relay: '这类你定' }],
  ['graph_propose', { node: { type: 'norm', title: '换一份', parent: 'goal-1', edges: [{ type: 'supersedes', to: NODE }] }, reason: 'x' }],
  ['graph_edit', { id: NODE, rev: 'r', set: { acceptance: ['代码风格：主 Agent 定，只告知'] }, reason: 'x' }],
  ['graph_edit', { id: NODE, rev: 'r', set: { acceptance: ['命名：主 Agent 定，只告知'] }, reason: 'x', relay: '这类你定' }],
  ['graph_approve', { id: NODE, rev: 'r', reason: 'x' }],
  ['graph_status', { id: NODE, rev: 'r', to: 'dropped', reason: 'x' }],
  ['graph_link', { id: 'goal-1', rev: 'r', type: 'depends', to: NODE, reason: 'x' }],
  ['graph_link', { id: NODE, rev: 'r', type: 'depends', to: 'goal-1', reason: 'x' }],
  ['graph_unlink', { id: 'goal-1', rev: 'r', type: 'depends', to: NODE, reason: 'x' }],
  ['graph_comment', { id: NODE, text: '加一类' }],
  ['graph_reject', { id: NODE, rev: 'r', reason: 'x' }],
]

test('any session that writes norm-delegations with a graph tool is denied, with or without the human\'s words, and nothing is raised as an alarm', async () => {
  const { host, agent, child, plain } = await sessions()
  await host.say(agent, '这类你定')
  const sentBefore = agent.sent.length
  let count = 0
  for (const who of [agent, child, plain]) {
    for (const [tool, args] of AT_NODE) {
      const reason = denied(await host.preExecute(who, tool, args))
      assert.match(reason, /^You tried to change norm-delegations with a graph tool\./, `${who.id} ${tool}`)
      assert.ok(reason.includes('Boundary: It holds what the human handed over to you for good, so only the harness writes it, after checking the human\'s own words.'))
      assert.ok(reason.includes('Right path: When the human says 这类你定, call record_human_answer with kind delegation, the kind in scope and their exact words (undo: true takes one back).'))
      assert.ok(reason.includes('Exception: none'))
      count += 1
    }
  }
  const rows = (await journaled(host, count)).filter(row => row.rule === GRAPH_DELEGATIONS_RULE)
  assert.equal(rows.length, count)
  assert.deepEqual([...new Set(rows.map(row => row.sessionId))].sort(), ['child', 'plain', 's1'])
  assert.equal(agent.sent.length, sentBefore, 'no notice to the main agent: this is not an attempt to move work on')
  assert.equal(healthOf(host, child)?.state === 'degraded', false)
})

test('reads of the graph and writes to other nodes are not stopped by the delegations rule', async () => {
  const { host, agent, child, plain } = await sessions()
  for (const who of [agent, child, plain]) {
    for (const [tool, args] of [
      ['graph_show', { id: NODE }],
      ['graph_open', {}],
      ['graph_focus', { id: NODE }],
      ['graph_comment', { id: 'goal-1', text: '一条批注' }],
      ['graph_edit', { id: 'goal-1', rev: 'r', set: { title: '换个题' }, reason: 'x' }],
      ['graph_link', { id: 'goal-1', rev: 'r', type: 'depends', to: 'feature-1', reason: 'x' }],
      ['graph_propose', { node: { type: 'task', title: '写代码', parent: 'goal-1' }, reason: 'x' }],
    ] as const) assert.equal((await host.preExecute(who, tool, args)).kind, 'allow', `${who.id} ${tool}`)
  }
})

test('the rules table lists the three graph rules of this step, the last for every session', () => {
  const ids = MAIN_AGENT_RULES.filter(rule => rule.step === 6).map(rule => [rule.id, rule.subjects])
  assert.deepEqual(ids, [[GRAPH_RELAY_RULE, 'every-session'], [GRAPH_OPTIONS_RULE, 'main-agent'], [GRAPH_DELEGATIONS_RULE, 'every-session']])
})