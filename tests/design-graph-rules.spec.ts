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
import { releaseVerdict } from '../src/guard/design-release.ts'
import { GRAPH_CLI_RULE, GRAPH_DELEGATIONS_RULE, GRAPH_OPTIONS_RULE, GRAPH_RELAY_RULE, GRAPH_STAGE_RULE, MAIN_AGENT_RULES } from '../src/guard/main-agent-rules.ts'
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
  await host.say(agent, '最怕我懒得每天记')
  // A risk is what the interview collects, so it may carry the human's words under a goal still in the interview (main-agent-graph-stage, d).
  const args = (relay: string) => ({ node: { type: 'risk', title: '懒得记', parent: 'goal-1' }, reason: '人说的', relay })
  assert.equal((await host.preExecute(agent, 'graph_propose', args('最怕我懒得每天记'))).kind, 'allow')
  assert.match(denied(await host.preExecute(agent, 'graph_propose', args('另一个风险'))), /^The words you relayed are not in a message the human sent in this session\./)
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
  assert.equal((await host.preExecute(agent, 'graph_comment', { id: 'goal-1', text: '备注' })).kind, 'allow')
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
  assert.equal((await host.preExecute(child, 'graph_edit', { ...call, set: { body: '需求：记账' }, relay: undefined })).kind, 'allow', 'an edit without relay that moves no stage is not touched')
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
  await captureWarnings(async () => {
    assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'question-1', rev: 'r', set: { crux: '取决于什么？' }, reason: '改' })).kind, 'allow')
  })
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /没能查这次图写入是不是给人列选项/)
})

test('a nested call with a parent token is never judged by these rules, like the other rules of the main agent', async () => {
  const { host, agent } = await mainAgentWithGoal()
  assert.equal((await host.preExecute(agent, 'graph_decide', decideWith('question-1', '我编的'), {})).kind, 'allow')
})

// ---------------------------------------------------------------- main-agent-graph-delegations

/** The main agent, a subagent it dispatched and an ordinary session of the same project, with the fixture they share. */
async function sessions(): Promise<{ readonly fixture: MainAgentFixture, readonly host: DesignHost, readonly agent: FakeAgent, readonly child: FakeAgent, readonly plain: FakeAgent }> {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  return { fixture, host, agent, child: host.addAgent('child', { origin: 'subagent', parentSession: agent.id }), plain: host.addAgent('plain') }
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

// ---------------------------------------------------------------- main-agent-graph-stage

/** Set the stage of goal-1 by the human's hand, as a release would leave it. */
async function setStage(fixture: MainAgentFixture, stage: string): Promise<void> {
  const rev = (await fixture.engine.load()).revisions.get('goal-1')
  const done = await fixture.engine.apply('human', { op: 'edit', id: 'goal-1', rev, set: { stage }, reason: '改阶段' })
  assert.ok(done.ok, JSON.stringify(done))
}

/** A task the main agent proposed under goal-1, which waits for a release. */
async function proposedTask(fixture: MainAgentFixture): Promise<string> {
  const done = await fixture.engine.apply('llm', { op: 'propose', reason: '规划', node: { type: 'task', title: '写记账命令', parent: 'goal-1', acceptance: ['能记一笔'] } })
  assert.ok(done.ok, JSON.stringify(done))
  return done.ok ? done.id : ''
}

const STAGE_PATH = 'Put it to the human with propose_to_human (kind confirm or release) and record their answer with record_human_answer; the harness checks the requirement or the design first.'

test('the main agent cannot move a goal on with a graph tool, even with the human\'s own words: it is put to the human, whose agreement record_human_answer records', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  await host.say(agent, '可以，放行')
  const rev = (await fixture.engine.load()).revisions.get('goal-1')
  // A goal in its interview does not go to design with an edit, nor is it approved.
  const edit = denied(await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev, set: { stage: 'design' }, reason: '进设计' }))
  assert.match(edit, /^You tried to set the stage of "记账小工具" to design while it is in interview\./)
  assert.ok(edit.includes('Boundary: A goal moves forward only when the human agrees to the requirement or the design you put to them, and the graph tools do not carry that agreement.'))
  assert.ok(edit.includes(`Right path: ${STAGE_PATH}`))
  assert.ok(edit.includes('Exception: none'))
  assert.match(denied(await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev, set: { stage: 'design' }, reason: '进设计', relay: '可以，放行' })), /^You tried to set the stage of "记账小工具" to design/, 'their real words do not change that')
  assert.match(denied(await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev, set: { stage: 'release' }, reason: '放行' })), /to release while it is in interview/, 'nor does a longer step')
  const approve = denied(await host.preExecute(agent, 'graph_approve', { id: 'goal-1', rev, reason: '确认', relay: '可以，放行' }))
  assert.match(approve, /^You tried to approve the goal "记账小工具" while its requirement has not been confirmed \(it is in interview\)\./)
  assert.ok(approve.includes(`Right path: ${STAGE_PATH}`))
  // The words it invents are stopped before that, by the rule about words.
  assert.match(denied(await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev, set: { stage: 'design' }, reason: '进设计', relay: '我编的' })), /^The words you relayed are not in a message the human sent/)
  const rows = await journaled(host, 5)
  const stageRows = rows.filter(row => row.rule === GRAPH_STAGE_RULE)
  assert.equal(stageRows.length, 4)
  // The journal is written without waiting, so the rows are found by what they say, not by the order of the calls.
  const editRow = stageRows.find(row => row.tool === 'graph_edit' && row.stageTo === 'design')
  const approveRow = stageRows.find(row => row.tool === 'graph_approve')
  assert.deepEqual([editRow?.goal, editRow?.node, editRow?.stageFrom, editRow?.session], ['goal-1', 'goal-1', 'interview', undefined])
  assert.deepEqual([approveRow?.stageFrom, approveRow?.stageTo], ['interview', undefined])
  assert.equal(rows.filter(row => row.rule === GRAPH_RELAY_RULE).length, 1)
  // What does not move it on is left alone: the same stage, a step back, a note, any other field.
  for (const set of [{ stage: 'interview' }, { stage: 'wish' }, { body: '需求：记账' }]) assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev, set, reason: '改' })).kind, 'allow', JSON.stringify(set))
  // The main agent does not tell anyone about its own refusal: it is given the way.
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 0)
})

test('a goal in the design is no more moved on by a graph tool; sending it back needs the human\'s words, and once released the stage rule leaves it alone', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  await setStage(fixture, 'design')
  const task = await proposedTask(fixture)
  await host.say(agent, '可以，放行')
  const rev = (await fixture.engine.load()).revisions.get('goal-1')
  assert.match(denied(await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev, set: { stage: 'release' }, reason: '放行', relay: '可以，放行' })), /^You tried to set the stage of "记账小工具" to release while it is in design\./)
  const approve = denied(await host.preExecute(agent, 'graph_approve', { id: task, rev: (await fixture.engine.load()).revisions.get(task), reason: '放行集合' }))
  assert.match(approve, /^You tried to approve "写记账命令" under the goal "记账小工具", which is in design\./)
  const node = { type: 'feature', title: '记一笔', parent: 'goal-1' }
  assert.match(denied(await host.preExecute(agent, 'graph_propose', { node, reason: '模块', relay: '可以，放行' })), /^You tried to propose "记一笔" with the human's words under the goal "记账小工具", which is in design\./)
  assert.match(denied(await host.preExecute(agent, 'graph_propose', { node: { type: 'goal', title: '另一个', stage: 'release' }, reason: '新目标', relay: '可以，放行' })), /^You tried to propose the goal "另一个" with the human's words at stage release\./)
  assert.match(denied(await host.preExecute(agent, 'graph_propose', { node: { type: 'feature', title: '模块', parent: 'goal-1', stage: 'design' }, reason: '模块', relay: '可以，放行' })), /at stage design\./)
  // A matter for the human, a risk and a retro may carry their words under the goal; so may anything without them.
  for (const type of ['question', 'risk', 'retro']) assert.equal((await host.preExecute(agent, 'graph_propose', { node: { type, title: '一件事', parent: 'goal-1' }, reason: '访谈', relay: '可以，放行' })).kind, 'allow', type)
  assert.equal((await host.preExecute(agent, 'graph_propose', { node, reason: '模块' })).kind, 'allow', 'a proposal without their words waits to be released')
  // Back to the design with their words is allowed, and so is moving on after the release.
  await setStage(fixture, 'release')
  await host.say(agent, '回设计吧')
  await sleepForHistory()
  const released = (await fixture.engine.load()).revisions.get('goal-1')
  assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev: released, set: { stage: 'design' }, reason: '退回', relay: '回设计吧' })).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev: released, set: { stage: 'decompose' }, reason: '分解' })).kind, 'allow')
  assert.equal((await host.preExecute(agent, 'graph_approve', { id: task, rev: (await fixture.engine.load()).revisions.get(task), reason: '放行集合' })).kind, 'allow', 'under a released goal an approval is not a release')
})

/** The history of a write is stamped to the millisecond, and the words after it count only if they are later: let one pass. */
const sleepForHistory = (): Promise<void> => sleep(4)

test('a subagent or an ordinary session that tries to move a goal on is refused, journaled with who tried and at what, and told to the human and the main agent; the main agent\'s own words cannot be borrowed', async () => {
  const { fixture, host, agent, child, plain } = await sessions()
  await setStage(fixture, 'design')
  const task = await proposedTask(fixture)
  const rev = (await fixture.engine.load()).revisions.get('goal-1')
  const taskRev = (await fixture.engine.load()).revisions.get(task)
  const FACT = 'Only the main agent moves a goal forward, by recording the human\'s agreement to its proposal.'
  const calls: ReadonlyArray<readonly [string, Record<string, unknown>, RegExp]> = [
    ['graph_edit', { id: 'goal-1', rev, set: { stage: 'release' }, reason: '放行' }, /^Boundary: You tried to set the stage of "记账小工具" to release while it is in design\./m],
    ['graph_approve', { id: task, rev: taskRev, reason: '放行集合' }, /^Boundary: You tried to approve "写记账命令" under the goal "记账小工具", which is in design\./m],
  ]
  const withWords: ReadonlyArray<readonly [string, Record<string, unknown>, RegExp]> = [
    ['graph_propose', { node: { type: 'feature', title: '记一笔', parent: 'goal-1' }, reason: '模块', relay: '可以，放行' }, /^Boundary: You tried to propose "记一笔" with the human's words under the goal "记账小工具", which is in design\./m],
    ['graph_propose', { node: { type: 'goal', title: '另一个', stage: 'release' }, reason: '新目标', relay: '可以，放行' }, /^Boundary: You tried to propose the goal "另一个" with the human's words at stage release\./m],
  ]
  let count = 0
  for (const [who, rightPath] of [[child, 'Report back to the main agent.'], [plain, 'The human agrees in the main agent\'s conversation; /wish in this session shows where it is.']] as const) {
    // A subagent's call that carries the words is refused for that first (main-agent-graph-relay); the ordinary session's words are not checked, so the stage rule stops them.
    for (const [tool, args, boundary] of who === child ? calls : [...calls, ...withWords]) {
      const reason = denied(await host.preExecute(who, tool, args))
      assert.ok(reason.startsWith(FACT), `${who.id} ${tool}: ${reason}`)
      assert.match(reason, boundary, `${who.id} ${tool}`)
      assert.ok(reason.includes(`Right path: ${rightPath}`))
      assert.ok(reason.includes('Exception: none'))
      count += 1
    }
    if (who === child) {
      for (const [tool, args] of withWords) {
        assert.match(denied(await host.preExecute(who, tool, args)), /^Subagents do not relay the human's words\./)
        count += 1
      }
    }
  }
  const rows = await journaled(host, count)
  const stageRows = rows.filter(row => row.rule === GRAPH_STAGE_RULE)
  assert.equal(stageRows.length, 2 + 4)
  assert.deepEqual(stageRows.filter(row => row.sessionId === 'child').map(row => row.session), [{ id: 'child', kind: 'subagent', parent: 's1' }, { id: 'child', kind: 'subagent', parent: 's1' }])
  assert.deepEqual(stageRows.filter(row => row.sessionId === 'plain').map(row => (row.session as { kind: string }).kind), ['ordinary', 'ordinary', 'ordinary', 'ordinary'])
  const childEdit = stageRows.find(row => row.sessionId === 'child' && row.tool === 'graph_edit')
  const childApprove = stageRows.find(row => row.sessionId === 'child' && row.tool === 'graph_approve')
  assert.deepEqual([childEdit?.goal, childEdit?.node, childEdit?.stageFrom, childEdit?.stageTo], ['goal-1', 'goal-1', 'design', 'release'])
  assert.deepEqual([childApprove?.node, childApprove?.stageFrom], [task, 'design'])
  // The goal did not move.
  assert.deepEqual([(await fixture.node('goal-1')).status, (await fixture.node('goal-1')).stage], ['approved', 'design'])
  // The main agent's next reply tells the human: a notice for each session and goal in ten minutes (an attempt that names no goal is its own), and the row says so.
  const notices = agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').map(entry => entry.message.content[0].text)
  assert.equal(notices.length, 4)
  assert.equal(notices[0], '[拦下] 子 agent「child」想不经人的同意把「记账小工具」推到 release，harness 拒绝了（main-agent-graph-stage）。下一次回复里用一句话告诉人。')
  assert.equal(notices[2], '[拦下] 另一个会话「plain」想不经人的同意把「记账小工具」推到 release，harness 拒绝了（main-agent-graph-stage）。下一次回复里用一句话告诉人。')
  assert.equal(notices[3], '[拦下] 另一个会话「plain」想不经人的同意提议已在 release 的目标「另一个」，harness 拒绝了（main-agent-graph-stage）。下一次回复里用一句话告诉人。')
  await host.created(agent)
  await agent.assemble()
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /^最近 24 小时有 8 次不经人的同意推进目标的写入被拦下，最近一次：另一个会话「plain」想提议已在 release 的目标「另一个」，\d+月\d+日 \d\d:\d\d$/)
})

test('what a delegated or an ordinary session may do to the graph is untouched: reads, notes, a stage that does not move on, and a graph past the design', async () => {
  const { fixture, host, agent, child, plain } = await sessions()
  const rev = (await fixture.engine.load()).revisions.get('goal-1')
  for (const who of [child, plain]) {
    for (const [tool, args] of [
      ['graph_show', { id: 'goal-1' }],
      ['graph_comment', { id: 'goal-1', text: '一条批注' }],
      ['graph_edit', { id: 'goal-1', rev, set: { stage: 'interview' }, reason: '同阶段' }],
      ['graph_edit', { id: 'goal-1', rev, set: { body: '需求：记账' }, reason: '改' }],
      ['graph_edit', { id: 'goal-9', rev, set: { stage: 'release' }, reason: '没有这个节点，交给工具去拒绝' }],
      ['graph_approve', { id: 'task-9', rev, reason: '没有这个节点，交给工具去拒绝' }],
    ] as const) assert.equal((await host.preExecute(who, tool, args)).kind, 'allow', `${who.id} ${tool}`)
  }
  await setStage(fixture, 'release')
  const task = await proposedTask(fixture)
  const released = (await fixture.engine.load()).revisions.get('goal-1')
  for (const who of [child, plain]) {
    assert.equal((await host.preExecute(who, 'graph_edit', { id: 'goal-1', rev: released, set: { stage: 'decompose' }, reason: '分解' })).kind, 'allow', who.id)
    assert.equal((await host.preExecute(who, 'graph_approve', { id: task, rev: (await fixture.engine.load()).revisions.get(task), reason: '放行集合' })).kind, 'allow', who.id)
  }
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 0)
})

test('when the graph cannot be read the five calls that could move a goal on are refused, whoever makes them; the other graph calls go on', async () => {
  const { host, agent, child, plain } = await sessions()
  await host.say(agent, '可以，放行')
  // The role of each session is read once, with the graph row working; then the row breaks.
  for (const who of [agent, plain]) await host.preExecute(who, 'graph_approve', { id: 'goal-9', rev: 'r', reason: 'x' })
  host.services.set('glmHournessGraph', { dirFor: () => { throw new Error('graph row broke') }, isGraphTool: () => false, focusOf: () => undefined })
  const candidates: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['graph_edit', { id: 'goal-1', rev: 'r', set: { stage: 'design' }, reason: 'x' }],
    ['graph_edit', { id: 'goal-1', rev: 'r', set: { stage: null }, reason: 'x' }],
    ['graph_approve', { id: 'goal-1', rev: 'r', reason: 'x' }],
    ['graph_approve', { id: 'task-1', rev: 'r', reason: 'x' }],
    ['graph_propose', { node: { type: 'feature', title: '记一笔', parent: 'goal-1' }, reason: 'x', relay: '可以，放行' }],
    ['graph_propose', { node: { type: 'goal', title: '另一个', stage: 'release' }, reason: 'x', relay: '可以，放行' }],
    ['graph_propose', { node: { type: 'goal', title: '另一个' }, reason: 'x', relay: '可以，放行' }],
  ]
  await captureWarnings(async () => {
    for (const who of [agent, plain]) {
      for (const [tool, args] of candidates) {
        const reason = denied(await host.preExecute(who, tool, args))
        assert.match(reason, /^(The harness could not read the project graph to judge this call\.|The words you relayed)/, `${who.id} ${tool}`)
      }
    }
    // The main agent's own call without words, the delegated session's call: the graph is read for them too.
    assert.match(denied(await host.preExecute(agent, 'graph_approve', { id: 'goal-1', rev: 'r', reason: 'x' })), /^The harness could not read the project graph to judge this call\./)
    assert.equal((await host.preExecute(agent, 'graph_comment', { id: 'goal-1', text: '备注' })).kind, 'allow')
    assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev: 'r', set: { body: '需求：记账' }, reason: 'x' })).kind, 'allow', 'an edit that sets no stage is no candidate')
  })
  const reason = denied(await host.preExecute(agent, 'graph_approve', { id: 'goal-1', rev: 'r', reason: 'x' }))
  assert.ok(reason.includes('Right path: Retry; if it fails again, tell the human the reason.'))
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /读不到项目图，没法判断这次图写入会不会不经人的同意把目标推向前，已拒绝/)
  assert.equal(child.sent.length, 0)
})

test('a nested call with a parent token is not judged by the stage rule either, like the other rules of the main agent (the open hole S4-1)', async () => {
  const { host, agent } = await mainAgentWithGoal()
  assert.equal((await host.preExecute(agent, 'graph_edit', { id: 'goal-1', rev: 'r', set: { stage: 'design' }, reason: 'x' }, {})).kind, 'allow')
})

// ---------------------------------------------------------------- main-agent-graph-stage, the side of the goals that run no design loop

const FACT_ANY = 'Only the main agent moves a goal forward, by recording the human\'s agreement to its proposal.'

/** A goal the human made without a stage: approved, and not in the design loop. */
async function goalWithoutStage(fixture: MainAgentFixture): Promise<string> {
  const done = await fixture.engine.apply('human', { op: 'propose', reason: '旧目标', node: { type: 'goal', title: '旧目标' } })
  assert.ok(done.ok, JSON.stringify(done))
  const goal = await fixture.node(done.ok ? done.id : '')
  assert.deepEqual([goal.status, goal.stage], ['approved', undefined])
  return goal.id
}

/** A call the way the runtime runs it: the gate decides, and a call it lets through is written by the graph tool, here by the engine as the llm. A call the tool would refuse is no concern of the gate. */
async function play(fixture: MainAgentFixture, who: FakeAgent, tool: 'graph_propose' | 'graph_edit', args: Record<string, unknown>): Promise<'allow' | 'deny'> {
  const verdict = await fixture.host.preExecute(who, tool, args)
  if (verdict.kind === 'deny') return 'deny'
  const { reason, relay, node, id, set } = args
  const rev = typeof id === 'string' ? (await fixture.engine.load()).revisions.get(id) : undefined
  await fixture.engine.apply('llm', tool === 'graph_propose' ? { op: 'propose', reason, node, ...relay === undefined ? {} : { relay } } : { op: 'edit', id, rev, set, reason, ...relay === undefined ? {} : { relay } })
  return 'allow'
}

test('clearing the stage of a goal that is in the design loop is denied for every session, whatever words it relays: the goal does not leave the loop by being given no stage', async () => {
  const { fixture, host, agent, child, plain } = await sessions()
  const clear = async (relay?: string) => ({ id: 'goal-1', rev: (await fixture.engine.load()).revisions.get('goal-1'), set: { stage: null }, reason: '不走设计循环', ...relay === undefined ? {} : { relay } })
  for (const stage of ['interview', 'design']) {
    if (stage === 'design') await setStage(fixture, 'design')
    await sleepForHistory()
    await host.say(agent, '你好')
    // The main agent needs a message of the human in the session before a relay and no more than that: the words need not agree to anything.
    const main = denied(await host.preExecute(agent, 'graph_edit', await clear('你好')))
    assert.match(main, new RegExp(`^You tried to clear the stage of "记账小工具" while it is in ${stage}\\.`))
    assert.ok(main.includes('Boundary: A goal moves forward only when the human agrees to the requirement or the design you put to them, and the graph tools do not carry that agreement.'))
    assert.ok(main.includes(`Right path: ${STAGE_PATH}`))
    denied(await host.preExecute(agent, 'graph_edit', await clear()))
    for (const [who, rightPath] of [[child, 'Report back to the main agent.'], [plain, 'The human agrees in the main agent\'s conversation; /wish in this session shows where it is.']] as const) {
      const other = denied(await host.preExecute(who, 'graph_edit', await clear(who === plain ? '我编的' : undefined)))
      assert.ok(other.startsWith(FACT_ANY), `${who.id}: ${other}`)
      assert.match(other, new RegExp(`^Boundary: You tried to clear the stage of "记账小工具" while it is in ${stage}\\.`, 'm'))
      assert.ok(other.includes(`Right path: ${rightPath}`))
    }
    // A subagent that sends the words is refused for that first.
    assert.match(denied(await host.preExecute(child, 'graph_edit', await clear('可以'))), /^Subagents do not relay the human's words\./)
  }
  const rows = (await journaled(host, 10)).filter(row => row.rule === GRAPH_STAGE_RULE)
  const ordinary = rows.filter(row => row.sessionId === 'plain')
  assert.equal(ordinary.length, 2)
  assert.deepEqual(ordinary.map(row => [row.node, row.stageFrom, row.stageTo, (row.session as { kind: string }).kind]).sort(), [['goal-1', 'design', undefined, 'ordinary'], ['goal-1', 'interview', undefined, 'ordinary']])
  assert.deepEqual([(await fixture.node('goal-1')).status, (await fixture.node('goal-1')).stage], ['approved', 'design'])
  // A clear that changes nothing is left to the tool to refuse; a goal that has no stage is not in the loop to be taken out.
  const none = await goalWithoutStage(fixture)
  assert.equal((await host.preExecute(plain, 'graph_edit', { id: none, rev: 'r', set: { stage: null }, reason: 'x' })).kind, 'allow')
})

test('a goal that runs no design loop is not given a stage after the interview: not release, not decompose, not design', async () => {
  const { fixture, host, agent, child, plain } = await sessions()
  const none = await goalWithoutStage(fixture)
  await sleepForHistory()
  await host.say(agent, '你好')
  const edit = async (stage: string, relay?: string) => ({ id: none, rev: (await fixture.engine.load()).revisions.get(none), set: { stage }, reason: '放行', ...relay === undefined ? {} : { relay } })
  for (const stage of ['design', 'release', 'decompose']) {
    const main = denied(await host.preExecute(agent, 'graph_edit', await edit(stage, '你好')))
    assert.match(main, new RegExp(`^You tried to set the stage of "旧目标" to ${stage} while it runs no design loop\\.`), stage)
    assert.ok(main.includes(`Right path: ${STAGE_PATH}`))
    const other = denied(await host.preExecute(plain, 'graph_edit', await edit(stage, '我编的')))
    assert.ok(other.startsWith(FACT_ANY), other)
    assert.match(other, new RegExp(`^Boundary: You tried to set the stage of "旧目标" to ${stage} while it runs no design loop\\.`, 'm'))
    assert.match(denied(await host.preExecute(child, 'graph_edit', await edit(stage))), /^Only the main agent moves a goal forward/)
    assert.match(denied(await host.preExecute(child, 'graph_edit', await edit(stage, '可以'))), /^Subagents do not relay the human's words\./)
  }
  const rows = (await journaled(host, 12)).filter(row => row.rule === GRAPH_STAGE_RULE)
  assert.deepEqual(rows.filter(row => row.sessionId === 'plain').map(row => [row.node, row.stageFrom, row.stageTo]).sort(), [[none, undefined, 'decompose'], [none, undefined, 'design'], [none, undefined, 'release']])
  assert.equal((await fixture.node(none)).stage, undefined)
  // Putting it into the loop is not moving it on: the loop is where the gates are.
  assert.equal((await host.preExecute(agent, 'graph_edit', await edit('interview', '你好'))).kind, 'allow')
})

test('a goal proposed with the human\'s words is proposed in the loop: with no stage, or past the interview, the proposal is denied for every session; wish and interview, and a proposal without their words, are not', async () => {
  const { host, agent, child, plain } = await sessions()
  await sleepForHistory()
  await host.say(agent, '你好')
  const goal = (stage?: string | null, relay?: string) => ({ node: { type: 'goal', title: '偷渡', ...stage === undefined ? {} : { stage } }, reason: '立项', ...relay === undefined ? {} : { relay } })
  for (const stage of [undefined, null]) {
    const main = denied(await host.preExecute(agent, 'graph_propose', goal(stage, '你好')))
    assert.match(main, /^You tried to propose the goal "偷渡" with the human's words and no stage\./)
    assert.ok(main.includes(`Right path: ${STAGE_PATH}`))
    const other = denied(await host.preExecute(plain, 'graph_propose', goal(stage, '我编的')))
    assert.ok(other.startsWith(FACT_ANY), other)
    assert.match(other, /^Boundary: You tried to propose the goal "偷渡" with the human's words and no stage\./m)
    assert.match(denied(await host.preExecute(child, 'graph_propose', goal(stage, '可以'))), /^Subagents do not relay the human's words\./)
  }
  const rows = (await journaled(host, 6)).filter(row => row.rule === GRAPH_STAGE_RULE)
  assert.equal(rows.filter(row => row.sessionId === 'plain').length, 2)
  const notices = agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').map(entry => entry.message.content[0].text)
  assert.ok(notices.includes('[拦下] 另一个会话「plain」想不经人的同意提议不走设计循环的目标「偷渡」，harness 拒绝了（main-agent-graph-stage）。下一次回复里用一句话告诉人。'), JSON.stringify(notices))
  // Where the gates are: in the wish or the interview, and what waits for the human to approve.
  for (const stage of ['wish', 'interview']) {
    assert.equal((await host.preExecute(agent, 'graph_propose', goal(stage, '你好'))).kind, 'allow', stage)
    assert.equal((await host.preExecute(plain, 'graph_propose', goal(stage, '我编的'))).kind, 'allow', stage)
  }
  assert.equal((await host.preExecute(agent, 'graph_propose', goal())).kind, 'allow', 'a proposal without their words waits to be approved')
  assert.equal((await host.preExecute(plain, 'graph_propose', goal())).kind, 'allow')
  assert.equal((await host.preExecute(child, 'graph_propose', goal())).kind, 'allow')
})

test('two relayed calls do not take a goal from nothing to release, or out of the design to release: the calls the gate lets through are the ones that move nothing, and the release verdict stays deny', async () => {
  for (const kind of ['main-agent', 'ordinary'] as const) {
    // From nothing: a goal with no stage made with the words, then a stage release written on it.
    const nothing = await mainAgentWithGoal()
    const who = kind === 'main-agent' ? nothing.agent : nothing.host.addAgent('plain')
    const words = kind === 'main-agent' ? '你好' : '我编的'
    await sleepForHistory()
    await nothing.host.say(nothing.agent, '你好')
    assert.equal(await play(nothing, who, 'graph_propose', { node: { type: 'goal', title: '偷渡' }, reason: '立项', relay: words }), 'deny', kind)
    await sleepForHistory()
    await nothing.host.say(nothing.agent, '你好')
    await play(nothing, who, 'graph_edit', { id: 'goal-2', set: { stage: 'release' }, reason: '放行', relay: words })
    const made = await nothing.engine.load()
    assert.equal(made.nodes.has('goal-2'), false, kind)
    assert.deepEqual([...made.nodes.values()].filter(node => node.stage === 'release'), [], kind)
    assert.equal(releaseVerdict(made, 'goal-2').kind, 'deny', kind)

    // Out of the design: the stage cleared, then the goal released.
    const design = await mainAgentWithGoal()
    await setStage(design, 'design')
    const actor = kind === 'main-agent' ? design.agent : design.host.addAgent('plain')
    await sleepForHistory()
    await design.host.say(design.agent, '你好')
    assert.equal(await play(design, actor, 'graph_edit', { id: 'goal-1', set: { stage: null }, reason: '不走设计循环', relay: words }), 'deny', kind)
    await sleepForHistory()
    await design.host.say(design.agent, '你好')
    assert.equal(await play(design, actor, 'graph_edit', { id: 'goal-1', set: { stage: 'release' }, reason: '放行', relay: words }), 'deny', kind)
    const kept = await design.engine.load()
    assert.equal(kept.nodes.get('goal-1')?.stage, 'design', kind)
    const verdict = releaseVerdict(kept, 'goal-1')
    assert.equal(verdict.kind, 'deny', kind)
    assert.match(verdict.kind === 'deny' ? verdict.violation : '', /design loop at stage design/)
  }
})

// ---------------------------------------------------------------- main-agent-graph-cli

const CLI_WRITES = [
  'npm run -s graph -- edit \'{"id":"goal-1","set":{"stage":"design"}}\'',
  'npm run graph -- approve \'{"id":"goal-1"}\'',
  'npm --silent run graph -- decide -',
  'pnpm graph decide -',
  'yarn graph propose \'{"node":{}}\'',
  'node --experimental-strip-types scripts/graph/cli.ts approve \'{"id":"goal-1"}\'',
  'node .\\scripts\\graph\\cli.ts edit \'{}\'',
  'cd docs; npm run -s graph -- --dir graph status \'{}\'',
  'npm run -s graph',
]
const CLI_READS = [
  'npm run -s graph -- show goal-1',
  'npm run -s graph -- open',
  'pnpm graph show goal-1',
  'node scripts/graph/cli.ts open',
  'npm run -s graph -- --dir docs/graph show goal-1',
  'echo "npm run graph -- edit"',
  'npm run build',
  'npm run graph:render',
  'git status',
]

test('no session runs the graph\'s command line to write: edit, approve and the other operations are denied for the main agent, a subagent and an ordinary session, and show and open are left alone', async () => {
  const { host, agent, child, plain } = await sessions()
  let count = 0
  for (const who of [agent, child, plain]) {
    for (const command of CLI_WRITES) {
      const reason = denied(await host.preExecute(who, 'pwsh', { command }))
      assert.match(reason, /^Inside DSH the project graph changes through the graph tools\./, `${who.id}: ${command}`)
      assert.ok(reason.includes('Boundary: The graph tools check whose words a relay carries; the command line does not.'))
      assert.ok(reason.includes('Right path: Use the graph tools (graph_propose, graph_edit, graph_decide, …).'))
      assert.ok(reason.includes('Exception: The orchestrator runs the command line outside DSH.'))
      count += 1
    }
    for (const command of CLI_READS) assert.equal((await host.preExecute(who, 'pwsh', { command })).kind, 'allow', `${who.id}: ${command}`)
  }
  const rows = (await journaled(host, count)).filter(row => row.rule === GRAPH_CLI_RULE)
  assert.equal(rows.length, count)
  assert.deepEqual([...new Set(rows.map(row => row.sessionId))].sort(), ['child', 'plain', 's1'])
  // Nothing in it carries the human's words, so nobody is told.
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 0)
  // The bash tool and a terminal are shells too.
  const bash = denied(await host.preExecute(plain, 'bash', { command: 'pnpm graph edit -' }))
  assert.match(bash, /^Inside DSH the project graph changes through the graph tools\./)
  denied(await host.preExecute(child, 'terminal_send', { text: 'npm run -s graph -- approve \'{}\'\n' }))
})

test('a delegated or an ordinary session that runs the command line with `relay` in it is also told to the human and the main agent; the main agent itself is only denied', async () => {
  const { host, agent, child, plain } = await sessions()
  const command = 'npm run -s graph -- edit \'{"id":"goal-1","set":{"stage":"design"},"relay":"可以，放行"}\''
  denied(await host.preExecute(agent, 'pwsh', { command }))
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 0, 'the main agent only gets the denial')
  denied(await host.preExecute(child, 'pwsh', { command }))
  denied(await host.preExecute(plain, 'pwsh', { command }))
  const notices = agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass')
  assert.deepEqual(notices.map(entry => entry.message.content[0].text), [
    '[拦下] 子 agent「child」想不经人的同意用命令行带转述的话改项目图（edit），harness 拒绝了（main-agent-graph-cli）。下一次回复里用一句话告诉人。',
    '[拦下] 另一个会话「plain」想不经人的同意用命令行带转述的话改项目图（edit），harness 拒绝了（main-agent-graph-cli）。下一次回复里用一句话告诉人。',
  ])
  const rows = (await journaled(host, 3)).filter(row => row.rule === GRAPH_CLI_RULE)
  // The journal is written without waiting, so the rows are not in the order of the calls.
  const sessionOf = (id: string): unknown => rows.find(row => row.sessionId === id)?.session
  assert.deepEqual([sessionOf('s1'), sessionOf('child'), sessionOf('plain')], [undefined, { id: 'child', kind: 'subagent', parent: 's1' }, { id: 'plain', kind: 'ordinary' }])
  // Without `relay` in the text a subagent is denied and nobody is told.
  denied(await host.preExecute(child, 'pwsh', { command: 'pnpm graph decide -' }))
  assert.equal(agent.sent.filter(entry => entry.message.source.kind === 'glm-design-bypass').length, 2)
})

test('the rules table lists the two graph rules of the step that opens confirm, both for every session', () => {
  const ids = MAIN_AGENT_RULES.filter(rule => rule.step === 8).map(rule => [rule.id, rule.subjects, rule.enforcement])
  assert.deepEqual(ids, [[GRAPH_STAGE_RULE, 'every-session', 'deny'], [GRAPH_CLI_RULE, 'every-session', 'deny']])
})