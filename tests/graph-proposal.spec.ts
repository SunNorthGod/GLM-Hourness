/**
 * Questions in the proposal shape (docs/ORCHESTRATION.md §2.6; addendum
 * §3.3): the two shapes in the file format, the write rules of the engine,
 * the decision with a conclusion, and what the projections and the stage
 * model make of it. Questions with options keep their tests in
 * graph-engine.spec.ts, graph-store.spec.ts and graph-stage.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkNode, serializeNode, type GraphIssue } from '../src/graph/format.ts'
import { PLAIN_QUESTION_EXAMPLES } from '../src/graph/plain-question.ts'
import { ASK_FORMS, PROPOSAL_LIMITS, TALK_LIMITS } from '../src/graph/proposal.ts'
import { PLAIN_LIMITS } from '../src/graph/schema.ts'
import { requirementCard } from '../src/graph/stage.ts'
import { loadGraph } from '../src/graph/store.ts'
import { engineFixture, fixtureTest, must, refused, type EngineFixture } from './graph-helpers.ts'
import { exampleRecord } from './proposal-examples.ts'

type Fixture = EngineFixture

/** goal-1 (interview), feature-1 under it. */
const fixture = (): Promise<Fixture> => engineFixture('graph-proposal-', 31, async ({ run }) => {
  await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview', body: '需求：记一下每天花了多少钱' } })
  await run('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '记一笔', parent: 'goal-1' } })
})

const graphTest = fixtureTest(fixture)

const PROPOSAL = { type: 'question', parent: 'goal-1', ...exampleRecord('recommend') }

/** A question with options, the human's. */
const TABLE = {
  type: 'question',
  title: '存储格式',
  parent: 'feature-1',
  options: [{ key: 'B', label: 'Markdown', gain: '正文更好读', cost: '要自写解析器' }, { key: 'A', label: 'JSON', gain: '不新增解析器', cost: '长正文是一行字符串' }],
  recommend: 'A',
  crux: '长段正文主要在网页上读吗？',
  verdict: '是 → B；否 → A',
  weight: 'two-way',
}

const issuesOf = (raw: Record<string, unknown>): GraphIssue[] => {
  const issues: GraphIssue[] = []
  checkNode({ id: 'question-1', status: 'approved', parent: 'goal-1', history: [{ at: '2026-10-31T08:00:00.000Z', actor: 'human', op: 'propose', reason: 'x', to: 'approved' }], ...raw }, 'nodes/question-1.json', issues)
  return issues.filter(issue => issue.severity === 'error')
}

const RAW = { type: 'question', title: '题', ask: '要这样吗？', form: 'recommend', proposal: '推荐', reason: '理由' }

graphTest('a proposal of each way of asking is proposed approved under an open parent, with its record on the node', async g => {
  for (const form of ASK_FORMS) {
    const asked = await g.run('llm', { op: 'propose', reason: '主 Agent 在对话里把这件事交给人', node: { type: 'question', parent: 'goal-1', ...exampleRecord(form) } })
    const node = await g.node(asked.id)
    assert.equal(node.status, 'approved', form)
    assert.equal(node.options, undefined, form)
    assert.equal(node.form, form)
    for (const [field, value] of Object.entries(exampleRecord(form))) assert.deepEqual(node[field as keyof GraphNode], value, `${form}.${field}`)
    assert.equal(node.body, undefined)
  }
})

graphTest('the file of a proposal is written in the field order and read back byte for byte', async g => {
  const asked = await g.run('llm', { op: 'propose', reason: '交给人', node: PROPOSAL })
  const node = await g.node(asked.id)
  const text = serializeNode(node)
  assert.deepEqual(Object.keys(JSON.parse(text) as object), ['id', 'type', 'title', 'ask', 'form', 'status', 'parent', 'proposal', 'reason', 'cost', 'history'])
  const again: GraphIssue[] = []
  const reread = checkNode(JSON.parse(text), 'nodes/question-1.json', again)
  assert.deepEqual(again, [])
  assert.equal(serializeNode(reread!), text)
  const decided = await g.run('human', { op: 'decide', id: asked.id, rev: asked.rev, conclusion: '借书先不收押金', reason: '同意' })
  const keys = Object.keys(JSON.parse(serializeNode(decided.node)) as object)
  assert.ok(keys.indexOf('conclusion') > keys.indexOf('cost') && keys.indexOf('conclusion') < keys.indexOf('evidence'), keys.join(','))
})

test('the file format has two shapes of a question and names what is wrong with anything else', () => {
  assert.deepEqual(issuesOf(RAW), [])
  assert.deepEqual(issuesOf({ ...RAW, status: 'done', conclusion: '定了', evidence: [{ kind: 'decision', ref: 'conclusion' }] }), [])
  const missing = issuesOf({ type: 'question', title: '题', form: 'want', proposal: '猜测' })
  assert.deepEqual(missing.map(issue => issue.field), ['ask'])
  assert.match(missing[0].message, /a question node has options, or ask, form and proposal/)
  assert.deepEqual(issuesOf({ type: 'question', title: '题' }).map(issue => issue.field), ['ask'])
  // By way of asking: what is required and what is not taken.
  assert.deepEqual(issuesOf({ ...RAW, reason: undefined }).map(issue => issue.field), ['reason'])
  assert.deepEqual(issuesOf({ ...RAW, ways: ['甲', '乙'] }).map(issue => issue.field), ['ways'])
  assert.deepEqual(issuesOf({ ...RAW, form: 'choose', ways: ['甲', '乙'], cost: '代价' }).map(issue => issue.field), ['cost'])
  assert.deepEqual(issuesOf({ ...RAW, form: 'want', reason: '理由' }).map(issue => issue.field), ['reason'])
  assert.deepEqual(issuesOf({ ...RAW, form: 'look', notTaken: '没选的' }).map(issue => issue.field), ['reason', 'notTaken'])
  // Mixed: the card fields do not belong to a proposal, the proposal's fields and conclusion not to a question with options.
  assert.deepEqual(issuesOf({ ...RAW, crux: '取决于' }).map(issue => issue.field), ['crux'])
  assert.deepEqual(issuesOf({ ...RAW, decision: 'A' }).map(issue => issue.field), ['decision'])
  const table = { type: 'question', title: '题', options: TABLE.options, recommend: 'A' }
  assert.deepEqual(issuesOf(table), [])
  assert.deepEqual(issuesOf({ ...table, ask: '要这样吗？' }).map(issue => issue.field), ['ask'])
  assert.deepEqual(issuesOf({ ...table, proposal: '推荐', conclusion: '定了' }).map(issue => issue.field), ['proposal', 'conclusion'])
  // Evidence: an option key for a question with options, the literal `conclusion` for a proposal.
  const done = { status: 'done', evidence: [{ kind: 'decision', ref: 'A' }] }
  assert.deepEqual(issuesOf({ ...table, ...done, decision: 'A' }), [])
  assert.deepEqual(issuesOf({ ...RAW, ...done, conclusion: '定了' }).map(issue => issue.field), ['evidence[0].ref'])
  assert.deepEqual(issuesOf({ ...table, status: 'done', decision: 'A', evidence: [{ kind: 'decision', ref: 'conclusion' }] }).map(issue => issue.field), ['evidence[0].ref'])
  // Other nodes do not carry the question's fields.
  for (const field of ['ask', 'form', 'proposal', 'reason', 'cost', 'notTaken', 'conclusion']) {
    assert.deepEqual(issuesOf({ type: 'task', title: '任务', [field]: '一行' }).map(issue => issue.field), [field], field)
  }
  assert.deepEqual(issuesOf({ type: 'task', title: '任务', ways: ['甲', '乙'] }).map(issue => issue.field), ['ways'])
})

graphTest('a proposal is refused at every rule of the record, with the field to correct', async g => {
  const bad = async (patch: Record<string, unknown>, field: string): Promise<void> => {
    refused(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { ...PROPOSAL, ...patch } }), 'invalid', field)
  }
  await bad({ title: '' }, 'node.title')
  await bad({ title: '字'.repeat(PLAIN_LIMITS.title + 1) }, 'node.title')
  await bad({ ask: '没有问号。' }, 'node.ask')
  await bad({ ask: '问了吗？问了吗？' }, 'node.ask')
  await bad({ ask: `${'字'.repeat(TALK_LIMITS.text.recommend)}？` }, 'node.ask')
  await bad({ proposal: '' }, 'node.proposal')
  await bad({ proposal: '一\n二' }, 'node.proposal')
  await bad({ proposal: '字'.repeat(PROPOSAL_LIMITS.line + 1) }, 'node.proposal')
  await bad({ reason: '无' }, 'node.reason')
  await bad({ cost: '没有' }, 'node.cost')
  await bad({ form: 'sing' }, 'node.form')
  await bad({ ways: ['甲', '乙'] }, 'node.ways')
  // Exactly at the limits passes.
  must(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { ...PROPOSAL, proposal: '字'.repeat(PROPOSAL_LIMITS.line), ask: `${'字'.repeat(TALK_LIMITS.text.recommend - 1)}？` } }))
  // A question that has neither options nor the record is refused by the format, naming the missing field.
  refused(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { type: 'question', parent: 'goal-1', title: '题' } }), 'invalid', 'node.ask')
  // The card fields cannot be mixed in.
  refused(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { ...PROPOSAL, crux: '取决于什么' } }), 'invalid', 'node.crux')
  // A choose question: two or three ways, each one line, the proposal is the last of them.
  const choose = { type: 'question', parent: 'goal-1', ...exampleRecord('choose') }
  must(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: choose }))
  refused(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { ...choose, ways: ['只有一条'], proposal: '只有一条' } }), 'invalid', 'node.ways')
  refused(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { ...choose, ways: ['甲', '乙', '丙', '丁'], proposal: '丁' } }), 'invalid', 'node.ways')
  refused(await g.engine.apply('llm', { op: 'propose', reason: '交给人', node: { ...choose, proposal: '不在路里' } }), 'invalid', 'node.proposal')
})

graphTest('the llm edits the record of a proposal that waits for the human, not of one the human decided; the human always may', async g => {
  const asked = await g.run('llm', { op: 'propose', reason: '交给人', node: PROPOSAL })
  const revised = must(await g.act('llm', { op: 'edit', id: asked.id, reason: '人补充了，改了方案', set: { proposal: '借书先不收押金，逾期再说' } }))
  assert.equal((await g.node(revised.id)).proposal, '借书先不收押金，逾期再说')
  refused(await g.act('llm', { op: 'edit', id: asked.id, reason: '改', set: { reason: '无' } }), 'invalid', 'set.reason')
  refused(await g.act('llm', { op: 'edit', id: asked.id, reason: '改', set: { title: '' } }), 'invalid', 'set.title')
  // A field the form does not take, and the fields of a table card, are not part of a proposal.
  refused(await g.act('llm', { op: 'edit', id: asked.id, reason: '改', set: { ways: ['甲', '乙'] } }), 'invalid', 'set.ways')
  refused(await g.act('llm', { op: 'edit', id: asked.id, reason: '改', set: { crux: '取决于什么' } }), 'forbidden', 'set.crux')
  refused(await g.act('llm', { op: 'edit', id: asked.id, reason: '改', set: { options: TABLE.options } }), 'forbidden', 'set.options')
  // The form is set once.
  refused(await g.act('human', { op: 'edit', id: asked.id, reason: '换问法', set: { form: 'want' } }), 'invalid', 'set.form')

  const decided = must(await g.act('llm', { op: 'decide', id: asked.id, reason: '人在对话里同意', relay: '可以，就按推荐的来', conclusion: '借书先不收押金' }))
  refused(await g.act('llm', { op: 'edit', id: decided.id, reason: '改', set: { proposal: '借书改回收押金' } }), 'forbidden', 'set.proposal')
  refused(await g.act('llm', { op: 'edit', id: decided.id, reason: '改', set: { title: '换个题' } }), 'forbidden', 'set.title')
  refused(await g.act('harness', { op: 'edit', id: decided.id, reason: '改', set: { notTaken: '先收押金' } }), 'forbidden', 'set.notTaken')
  must(await g.act('human', { op: 'edit', id: decided.id, reason: '人自己改', set: { notTaken: '先收押金' } }))
  // The body stays the llm's to edit, as on any node.
  must(await g.act('llm', { op: 'edit', id: decided.id, reason: '补正文', set: { body: '依据见 d-peak-mode' } }))
})

graphTest('an edit cannot turn one shape of a question into the other', async g => {
  const asked = await g.run('llm', { op: 'propose', reason: '交给人', node: PROPOSAL })
  refused(await g.act('human', { op: 'edit', id: asked.id, reason: '换形状', set: { options: TABLE.options } }), 'invalid', 'set.options')
  refused(await g.act('human', { op: 'edit', id: asked.id, reason: '换形状', set: { crux: '取决于什么' } }), 'invalid', 'set.crux')
  const table = await g.run('human', { op: 'propose', reason: '建图', node: TABLE })
  refused(await g.act('human', { op: 'edit', id: table.id, reason: '换形状', set: { proposal: '默认少做' } }), 'invalid', 'set.proposal')
  refused(await g.act('human', { op: 'edit', id: table.id, reason: '换形状', set: { ask: '换吗？' } }), 'invalid', 'set.ask')
  // Removing the card fields of a table question leaves a question with neither shape.
  refused(await g.act('human', { op: 'edit', id: table.id, reason: '去掉', set: { options: null, recommend: null, crux: null, verdict: null, weight: null } }), 'invalid')
})

graphTest('decide: a proposal takes a conclusion and a question with options takes an option, never both', async g => {
  const asked = await g.run('human', { op: 'propose', reason: '建图', node: PROPOSAL })
  const table = await g.run('human', { op: 'propose', reason: '建图', node: TABLE })
  refused(await g.act('human', { op: 'decide', id: asked.id, reason: '定', option: 'A' }), 'invalid', 'option')
  refused(await g.act('human', { op: 'decide', id: asked.id, reason: '定' }), 'invalid', 'option')
  refused(await g.act('human', { op: 'decide', id: asked.id, reason: '定', option: 'A', conclusion: '定了' }), 'invalid', 'option')
  refused(await g.act('human', { op: 'decide', id: table.id, reason: '定', conclusion: '定了' }), 'invalid', 'conclusion')
  for (const conclusion of ['', '   ', '一\n二', '字'.repeat(PROPOSAL_LIMITS.conclusion + 1)]) {
    refused(await g.act('human', { op: 'decide', id: asked.id, reason: '定', conclusion }), 'invalid', 'conclusion')
  }
  const decided = must(await g.act('human', { op: 'decide', id: asked.id, reason: '定', conclusion: `  ${'字'.repeat(PROPOSAL_LIMITS.conclusion)}  ` }))
  const node = await g.node(decided.id)
  assert.equal(node.status, 'done')
  assert.equal(node.conclusion, '字'.repeat(PROPOSAL_LIMITS.conclusion), 'the conclusion is kept without the white space around it')
  assert.equal(node.decision, undefined)
  assert.deepEqual(node.evidence, [{ kind: 'decision', ref: 'conclusion' }])
  const entry = node.history.at(-1)!
  assert.deepEqual([entry.op, entry.actor, entry.from, entry.to, entry.conclusion, entry.option], ['decide', 'human', 'approved', 'done', node.conclusion, undefined])
  // The same conclusion again is not a change; another one overturns the first and adds a second piece of evidence.
  refused(await g.act('human', { op: 'decide', id: asked.id, reason: '再定', conclusion: node.conclusion }), 'bad_transition', 'conclusion')
  must(await g.act('human', { op: 'decide', id: asked.id, reason: '改主意', conclusion: '改成收押金' }))
  assert.equal((await g.node(asked.id)).conclusion, '改成收押金')
  assert.equal((await g.node(asked.id)).evidence?.length, 2)
  // A question with options still decides by option.
  must(await g.act('human', { op: 'decide', id: table.id, reason: '定', option: 'A' }))
  assert.equal((await g.node(table.id)).decision, 'A')
})

graphTest('decide on a proposal the human decides needs the human or their words; the llm decides its own only until the human has', async g => {
  const asked = await g.run('llm', { op: 'propose', reason: '交给人', node: PROPOSAL })
  refused(await g.act('llm', { op: 'decide', id: asked.id, reason: '我定', conclusion: '借书先不收押金' }), 'forbidden')
  const relayed = must(await g.act('llm', { op: 'decide', id: asked.id, reason: '人在对话里同意', relay: '可以', conclusion: '借书先不收押金' }))
  const entry = (await g.node(relayed.id)).history.at(-1)!
  assert.equal(entry.relay, '可以')
  assert.equal(entry.actor, 'llm')
  refused(await g.act('llm', { op: 'decide', id: asked.id, reason: '我改', conclusion: '改成收押金' }), 'forbidden')
  const own = await g.run('llm', { op: 'propose', reason: '自己定', node: { ...PROPOSAL, decider: 'agent' } })
  must(await g.act('llm', { op: 'decide', id: own.id, reason: '自己定', conclusion: '借书先不收押金' }))
})

graphTest('the projections show a proposal\'s record while it waits and its conclusion after the decision', async g => {
  const choose = { type: 'question', parent: 'goal-1', ...exampleRecord('choose') }
  const asked = await g.run('llm', { op: 'propose', reason: '交给人', node: choose })
  const waiting = (await g.engine.openItems()).questions.find(entry => entry.id === asked.id)!
  assert.deepEqual(waiting.options, [])
  const example = PLAIN_QUESTION_EXAMPLES.choose
  assert.deepEqual([waiting.ask, waiting.form, waiting.proposal, waiting.reason, waiting.ways], [exampleRecord('choose').ask, 'choose', example.ways?.at(-1), example.reason, example.ways])
  const table = await g.run('human', { op: 'propose', reason: '建图', node: TABLE })
  const tableEntry = (await g.engine.openItems()).questions.find(entry => entry.id === table.id)!
  assert.equal('proposal' in tableEntry, false)
  must(await g.act('llm', { op: 'decide', id: asked.id, reason: '同意', relay: '第二条', conclusion: '站内通知加邮件' }))
  const items = await g.engine.openItems()
  assert.deepEqual(items.questions.map(entry => entry.id), [table.id])
  const record = items.recentDecisions.find(entry => entry.id === asked.id)!
  assert.equal(record.conclusion, '站内通知加邮件')
  assert.equal(record.label, '站内通知加邮件')
  assert.equal('decision' in record, false)
  assert.equal(record.relay, '第二条')
  assert.equal(record.rounds, 1)
})

graphTest('the requirement card counts a fork the human decided in a proposal, not one the agent decided on its own', async g => {
  const choice = async (): Promise<boolean> => {
    const graph = await loadGraph(g.dir)
    return requirementCard(graph, graph.nodes.get('goal-1')!).find(item => item.key === 'choice')!.ok
  }
  assert.equal(await choice(), false)
  const own = await g.run('llm', { op: 'propose', reason: '自己定', node: { ...PROPOSAL, decider: 'agent' } })
  must(await g.act('llm', { op: 'decide', id: own.id, reason: '自己定', conclusion: '借书先不收押金' }))
  assert.equal(await choice(), false)
  const asked = await g.run('llm', { op: 'propose', reason: '交给人', node: PROPOSAL })
  assert.equal(await choice(), false, 'asked but not decided')
  must(await g.act('llm', { op: 'decide', id: asked.id, reason: '人在对话里同意', relay: '可以', conclusion: '借书先不收押金' }))
  assert.equal(await choice(), true)
})
