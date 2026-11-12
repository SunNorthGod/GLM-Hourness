/**
 * propose_to_human (src/design/propose.ts, docs/ORCHESTRATION.md §3.4) on the
 * fake host: the rules of the call, what it writes to the graph, the text it
 * returns, the limit of three questions in one reply, who may call it, what
 * `attach` does, and the question shown once more. The face of the sessions
 * that are not the main agent has neither design tool.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER, DESIGN_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { designFaceSource } from '../src/design/role-face.ts'
import { proposeTool } from '../src/design/propose.ts'
import { TALK_PROJECTION, TALK_SHAPES, type TalkState } from '../src/design/talk.ts'
import { PLAIN_QUESTION_EXAMPLES, PLAIN_QUESTION_GUIDE, plainWordsIn } from '../src/graph/plain-question.ts'
import { ASK_FORMS, PAGE_LIMITS, PROPOSAL_LIMITS, TALK_LIMITS, askOf, fenced, renderAsk } from '../src/graph/proposal.ts'
import { openEngine } from '../src/graph/engine.ts'
import { nodePlainIssues } from '../src/graph/plain.ts'
import { PLAIN_LIMITS } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { faceSourceOf, hostWithoutTalkProjection, type DesignHost, type FakeAgent } from './design-host.ts'
import { FRAMEWORK_PAGE, NO_END_USER, SPLIT_NAMES, fakeBoard, fillRequirementCard, frameworkReleased, mainAgentWithGoal, modulePage, toolDeps, writeDesign } from './design-tools-helpers.ts'
import { exampleArgs } from './proposal-examples.ts'

type Outcome = Awaited<ReturnType<DesignHost['callTool']>>

const errorOf = (outcome: Outcome): { code: string, field: string | undefined, message: string, hint: string } | undefined => outcome.kind === 'error' ? outcome.error : undefined
const valueOf = (outcome: Outcome): Record<string, unknown> => {
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  return outcome.kind === 'ok' ? outcome.value : {}
}

/** The human answers between two questions, so each is the first of its reply. */
async function nextReply(host: DesignHost, agent: FakeAgent): Promise<void> {
  host.reply(agent, '…')
  await host.say(agent, '好')
}

test('each way of asking puts a question to the human: it is written to the graph waiting for them and the text to show is the main agent\'s own, laid out only where the harness must', async () => {
  const { host, agent, node } = await mainAgentWithGoal()
  let index = 0
  for (const form of ASK_FORMS) {
    const example = PLAIN_QUESTION_EXAMPLES[form]
    const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs(form)))
    index += 1
    const id = `question-${index}`
    assert.equal(value.tool, PROPOSE_TO_HUMAN)
    assert.deepEqual([value.kind, value.form, value.goal, value.question, value.number], ['question', form, 'goal-1', id, 1])
    assert.equal(value.text, renderAsk(example.text, 1, example.ways, example.sample, true), form)
    assert.match(String(value.message), /^Show text to the human exactly as given; it is Markdown\. Put it after your report, together with the other questions of this reply, then end your turn\./)
    assert.equal(String(value.message).includes('keep it verbatim'), form === 'look', `only a question with a sample carries the original text: ${form}`)
    const question = await node(id)
    assert.equal(question.status, 'approved')
    assert.equal(question.form, form)
    assert.equal(question.ask, askOf(example.text), 'the question is the text up to its question mark')
    assert.equal(question.proposal, example.proposal ?? example.ways?.at(-1), 'a choose takes its last way as the proposal')
    assert.deepEqual([question.reason, question.cost, question.ways, question.notTaken], [example.reason, example.cost, example.ways, example.notTaken])
    assert.equal(question.title, example.title)
    assert.equal(question.body, undefined)
    assert.equal(question.parent, 'goal-1')
    const first = question.history[0]
    assert.deepEqual([first.actor, first.op, first.to], ['llm', 'propose', 'approved'])
    assert.match(first.reason ?? '', /^主 Agent 在对话里把这件事交给人（propose_to_human call-\d+）$/)
    await nextReply(host, agent)
  }
})

test('the ways of a choose are a numbered list set apart from the question, the last marked as the pick; a look sample is fenced; the words the harness adds are plain', async () => {
  const { host, agent } = await mainAgentWithGoal()
  const choose = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('choose')))
  const [question, ...list] = String(choose.text).split('\n\n')
  assert.ok(question.startsWith('① '))
  assert.deepEqual(list.join('\n\n').split('\n').map(line => line.slice(0, 3)), ['1. ', '2. '])
  assert.ok(String(choose.text).endsWith('（推荐）'))
  assert.deepEqual(plainWordsIn(String(choose.text)), [])
  await nextReply(host, agent)
  const look = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('look')))
  assert.ok(String(look.text).includes('\n\n```\n[借书页]'), 'the sketch is in a code fence so that its line breaks stay')
})

test('the call hangs under the node it names, with sources as source edges, and under the goal in focus when it names none', async () => {
  const { host, agent, node, engine } = await mainAgentWithGoal()
  await engine.apply('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '记一笔', parent: 'goal-1' } })
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), parent: 'feature-1', sources: ['goal-1'] }))
  assert.equal((await node('question-1')).parent, 'feature-1')
  assert.deepEqual((await node('question-1')).edges, [{ type: 'source', to: 'goal-1' }])
  host.focuses.set(agent.id, 'feature-1')
  await nextReply(host, agent)
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('want')))
  assert.equal((await node('question-2')).parent, 'goal-1', 'the goal above the focus')
  host.focuses.delete(agent.id)
  const none = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('want')))
  assert.deepEqual([none?.code, none?.field], ['invalid', 'parent'])
})

test('the parent must exist and be open', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const missing = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), parent: 'feature-9' }))
  assert.deepEqual([missing?.code, missing?.field], ['invalid', 'parent'])
  await engine.apply('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '记一笔', parent: 'goal-1' } })
  await engine.apply('human', { op: 'status', id: 'feature-1', rev: (await engine.load()).revisions.get('feature-1'), to: 'dropped', reason: '不做了' })
  const closed = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), parent: 'feature-1' }))
  assert.deepEqual([closed?.code, closed?.field], ['invalid', 'parent'])
})

test('the shape of the call: what goes with what, one rule at a time, and nothing is written', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const before = (await engine.load()).revision
  const refused = async (args: unknown, field: string | undefined, message?: RegExp): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, args))
    assert.equal(error?.code, 'invalid', JSON.stringify(args))
    assert.equal(error?.field, field, JSON.stringify(error))
    assert.ok((error?.hint ?? '').length > 0)
    if (message !== undefined) assert.match(error?.message ?? '', message)
  }
  const want = exampleArgs('want')
  const { text: _text, ...noText } = want
  const { form: _form, ...noForm } = want
  await refused('not an object', undefined, /must be a JSON object/)
  await refused({ ...want, extra: 1 }, 'extra')
  await refused({ ...want, kind: 'nonsense' }, 'kind')
  await refused(noText, 'text', /text is required/)
  await refused(noForm, 'form')
  await refused({ kind: 'question', text: '这样吗？' }, 'form', /needs form, title and its record/)
  await refused({ ...want, form: 'sing' }, 'form')
  await refused({ ...want, goal: 'goal-1' }, 'goal')
  await refused({ ...want, module: 'module-a' }, 'module')
  await refused({ ...want, page: 'p' }, 'page')
  await refused({ ...want, sources: 'goal-1' }, 'sources')
  await refused({ ...want, ways: 'a' }, 'ways')
  await refused({ ...want, parent: 'goal-1', question: 'question-1' }, 'question')
  await refused({ ...want, sample: '样稿' }, 'sample', /taken by form look/)
  await refused({ ...want, attach: 'rules:p-3f9a1c07' }, 'attach', /taken only by form recommend/)
  await refused({ ...exampleArgs('look'), attach: 'rules:p-3f9a1c07' }, 'sample', /exclude each other/)
  await refused({ ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07', sample: '样稿' }, 'sample', /exclude each other/)
  await refused({ ...exampleArgs('look'), sample: '' }, 'sample')
  await refused({ ...exampleArgs('look'), sample: '字'.repeat(6001) }, 'sample')
  await refused({ ...want, title: 7 }, 'title', /must be a string/)
  const release = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'release', text: '这样吗？', goal: 'goal-1' }))
  assert.deepEqual([release?.code, release?.field], ['invalid', 'goal'], 'a goal still in the interview is not released')
  assert.match(release?.hint ?? '', /kind confirm first/)
  assert.equal((await engine.load()).revision, before, 'the graph did not change')
})

test('the hard limits of the text, one case each, with the sentence to shorten named', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const before = (await engine.load()).revision
  const refused = async (patch: Record<string, unknown>, message: RegExp, hint?: RegExp): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), ...patch }))
    assert.deepEqual([error?.code, error?.field], ['invalid', 'text'], JSON.stringify(patch))
    assert.match(error?.message ?? '', message)
    if (hint !== undefined) assert.match(error?.hint ?? '', hint)
  }
  await refused({ text: '' }, /non-empty/)
  await refused({ text: '第一行？\n第二行' }, /one line/)
  await refused({ text: '我猜你要导入一整批（比如一个表格），对吗。' }, /exactly one question mark, it has 0/)
  await refused({ text: '我猜你要导入一整批（比如一个表格），对吗？是不是？' }, /it has 2/)
  await refused({ text: `${'字'.repeat(TALK_LIMITS.text.want)}？` }, new RegExp(`longer than ${TALK_LIMITS.text.want}`), /^shorten the sentence that ends with the question mark/)
  await refused({ text: `我猜你要导入一整批（比如一个表格），对吗？${'字'.repeat(TALK_LIMITS.text.want)}` }, /longer than/, /^shorten the sentence after the question mark/)
  const long = `${'字'.repeat(TALK_LIMITS.text.recommend - 1)}？`
  const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), text: long }))
  assert.equal(error?.field, 'text')
  assert.equal((await engine.load()).revision, before)
  // The limit of the way of asking: a recommend question may be longer than a choose question.
  const asked = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), text: `我猜你${'字'.repeat(TALK_LIMITS.text.want - 7)}，对吗？`, proposal: '字' }))
  assert.equal(asked.kind, 'question')
})

test('the words the person has not learned are refused wherever they are written, with what to say instead', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const before = (await engine.load()).revision
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ text: '我猜你要把验收做成一页，对吗？', proposal: '把验收做成一页' }, 'text'],
    [{ title: '标定的事' }, 'title'],
    [{ ...exampleArgs('choose'), ways: ['看门禁', '站内通知加邮件：到期前一天和逾期当天各发一次，没登录也收得到'] }, 'ways'],
  ]
  for (const [patch, field] of cases) {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), ...patch }))
    assert.deepEqual([error?.code, error?.field], ['invalid', field], JSON.stringify(patch))
    assert.match(error?.message ?? '', /has not learned/)
    assert.match(error?.hint ?? '', /^say .+ instead of /)
  }
  assert.equal((await engine.load()).revision, before)
})

test('the record is checked by way of asking: what each needs, what it does not take, fillers, and the proposal of a choose', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const before = (await engine.load()).revision
  const refused = async (form: (typeof ASK_FORMS)[number], patch: Record<string, unknown>, field: string): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs(form), ...patch }))
    assert.deepEqual([error?.code, error?.field], ['invalid', field], `${form} ${JSON.stringify(patch)}`)
    assert.ok((error?.hint ?? '').length > 0)
  }
  await refused('recommend', { title: '' }, 'title')
  await refused('recommend', { title: '字'.repeat(PLAIN_LIMITS.title + 1) }, 'title')
  await refused('recommend', { reason: undefined }, 'reason')
  await refused('choose', { reason: undefined }, 'reason')
  await refused('choose', { ways: ['只有一条'] }, 'ways')
  await refused('choose', { ways: ['甲', '乙', '丙', '丁'] }, 'ways')
  await refused('choose', { ways: undefined }, 'ways')
  await refused('choose', { cost: '一点代价' }, 'cost')
  await refused('choose', { proposal: '不是最后一条' }, 'proposal')
  await refused('recommend', { ways: ['甲', '乙'] }, 'ways')
  await refused('want', { reason: '押金要退还' }, 'reason')
  await refused('want', { proposal: undefined }, 'proposal')
  await refused('look', { cost: '代价' }, 'cost')
  await refused('recommend', { cost: '无' }, 'cost')
  await refused('recommend', { notTaken: '没有' }, 'notTaken')
  await refused('recommend', { proposal: '字'.repeat(PROPOSAL_LIMITS.line + 1) }, 'proposal')
  assert.equal((await engine.load()).revision, before)
  // A choose question's proposal is given or left out; given, it must be the last way.
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('choose'), proposal: PLAIN_QUESTION_EXAMPLES.choose.ways!.at(-1) }))
})

test('the record is in the words: reason and proposal in the question itself, cost and the reason of a choose anywhere; a reason after the question mark is refused with where it belongs', async () => {
  const { host, agent, node, engine } = await mainAgentWithGoal()
  const recommend = { kind: 'question', form: 'recommend', title: '借书要不要先交押金', proposal: '借书先不收押金', reason: '押金要退还' }
  const before = (await engine.load()).revision
  const after = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...recommend, text: '我建议借书先不收押金，可以吗？理由是押金要退还。' }))
  assert.deepEqual([after?.code, after?.field], ['invalid', 'text'])
  assert.match(after?.message ?? '', /reason is not in text word for word/)
  assert.match(after?.hint ?? '', /in the sentence that ends with the question mark/)
  const missing = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...recommend, text: '我建议先不收押金，因为押金要退还，可以吗？' }))
  assert.match(missing?.message ?? '', /proposal is not in text/)
  const cost = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...recommend, text: '我建议借书先不收押金，因为押金要退还，可以吗？', cost: '书丢了只能事后追责' }))
  assert.match(cost?.message ?? '', /cost is not in text/)
  assert.match(cost?.hint ?? '', /in text:/)
  assert.equal((await engine.load()).revision, before)
  // The cost after the question mark is fine; the stored question runs from the start to the mark.
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...recommend, text: '我建议借书先不收押金，因为押金要退还，可以吗？代价是书丢了只能事后追责。', cost: '书丢了只能事后追责' }))
  await nextReply(host, agent)
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...recommend, text: '我建议借书先不收押金。理由是押金要退还。可以吗？' }))
  assert.equal((await node('question-2')).ask, '我建议借书先不收押金。理由是押金要退还。可以吗？', 'the whole stretch to the mark, not the last sentence')
  await nextReply(host, agent)
  const choose = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('choose'), text: '读者快到期或逾期时怎么提醒他们？' }))
  assert.match(choose?.message ?? '', /reason is not in text/)
})

test('the engine\'s own refusal comes through as it is', async () => {
  const { host, agent } = await mainAgentWithGoal()
  const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), sources: ['nowhere-1'] }))
  assert.equal(error?.code, 'invalid')
})

test('at most three questions in one reply: the fourth is refused with nothing written, and the count starts again at the human\'s next message', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const numbers: unknown[] = []
  for (let index = 1; index <= 3; index++) {
    const outcome = await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), title: `第 ${index} 件` })
    numbers.push(outcome.kind === 'ok' ? [outcome.value.number, String(outcome.value.text).slice(0, 1)] : outcome.kind)
  }
  assert.deepEqual(numbers, [[1, '①'], [2, '②'], [3, '③']])
  const before = (await engine.load()).revision
  const fourth = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), title: '第 4 件' }))
  assert.deepEqual([fourth?.code, fourth?.hint], ['too_many', 'at most three questions in one reply: end this reply with the questions you have and wait'])
  assert.equal((await engine.load()).revision, before)
  host.reply(agent, '三件事，你看呢？')
  await host.say(agent, '第一件可以，另外两件再说')
  const again = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), title: '新的一件' }))
  assert.equal(again.number, 1)
})

test('only the main agent may call it: an ordinary session and a delegated one are refused, and neither has the tool on its face', async () => {
  const { host, agent } = await mainAgentWithGoal()
  const plain = host.addAgent('plain')
  const child = host.addAgent('child', { origin: 'subagent', parentSession: agent.id })
  for (const other of [plain, child]) {
    const error = errorOf(await host.callTool(other, PROPOSE_TO_HUMAN, exampleArgs('want')))
    assert.deepEqual([error?.code, error?.hint], ['forbidden', 'only the main agent puts matters to the human; the human turns main agent mode on with /wish'], other.id)
  }
  await host.created(plain)
  await host.created(child)
  await host.created(agent)
  const source = faceSourceOf(host)
  for (const other of [plain, child]) {
    assert.deepEqual([...source.removals(other.id)].sort(), ['propose_to_human', 'record_human_answer'], other.id)
    assert.deepEqual(source.narrowing?.(other.id), [], other.id)
  }
  const removals = [...source.removals(agent.id)].sort()
  assert.ok(!removals.includes(PROPOSE_TO_HUMAN) && !removals.includes(RECORD_HUMAN_ANSWER), 'the main agent keeps both')
  assert.ok(removals.includes('write'))
})

test('the face policy of a session that is not the main agent names the two tools by native name', () => {
  const source = designFaceSource({
    isMain: sessionId => sessionId === 's1' ? true : sessionId === 'other' ? false : undefined,
    report: () => {},
  })
  assert.deepEqual([...source.removals('other')].sort(), [...DESIGN_TOOL_NAMES].sort())
  assert.equal(source.removals('unknown-session').size, 0, 'a session whose role cannot be resolved counts as no removal')
  assert.deepEqual([...source.removals('s1')].sort(), ['ask_user_question', 'edit', 'write'])
  assert.deepEqual(source.narrowing?.('s1'), [{ tool: 'str_replace_editor', parameter: 'command', values: ['view'] }])
})

test('the tool description carries the shapes of a question and the worked examples', async () => {
  const { host } = await mainAgentWithGoal()
  const tool = host.tools.get(PROPOSE_TO_HUMAN)!
  assert.ok(tool.description.includes(TALK_SHAPES))
  assert.ok(tool.description.includes(PLAIN_QUESTION_GUIDE))
  assert.match(tool.description, /^Put one matter to the human: one question they can answer in a few words\. The harness checks it, keeps it on the graph when the human decides it, and returns the text to show\./)
  for (const kind of ['question', 'confirm', 'release']) assert.ok(tool.description.includes(`kind ${kind}:`), kind)
  const properties = (tool.parameters as { properties: Record<string, unknown> }).properties
  assert.deepEqual(Object.keys(properties), ['kind', 'text', 'form', 'title', 'proposal', 'reason', 'cost', 'ways', 'notTaken', 'sample', 'goal', 'module', 'page', 'parent', 'question', 'sources', 'attach', 'rule'])
  assert.deepEqual((tool.parameters as { required: string[] }).required, ['kind', 'text'])
})

/** A recommend question that carries a board's proposal is put and answered once, so that the next call is a second reply. */
async function putWithBoard(fixture: Awaited<ReturnType<typeof mainAgentWithGoal>>): Promise<{ readonly board: ReturnType<typeof fakeBoard>, readonly tool: ReturnType<typeof proposeTool> }> {
  const board = fakeBoard()
  const tool = proposeTool(toolDeps(fixture, [board.board]))
  await fixture.host.invoke(fixture.agent, tool, { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' })
  await nextReply(fixture.host, fixture.agent)
  return { board, tool }
}

// ---------------------------------------------------------------- revising and showing once more

test('after the human added or turned it down, the question is revised in place with its record; what is not given is cleared; the way of asking cannot change; a decided question is not revised', async () => {
  const { host, agent, node, engine } = await mainAgentWithGoal()
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), notTaken: '先收押金' }))
  await nextReply(host, agent)
  const { text: _t, cost: _c, notTaken: _n, ...base } = exampleArgs('recommend')
  const text = '我建议借书先不收押金，因为押金要退还，管理员得多做一份对账，可以吗？'
  const revised = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...base, question: 'question-1', text }))
  assert.equal(revised.question, 'question-1')
  assert.equal(revised.number, 1, 'a new reply counts from one')
  const question = await node('question-1')
  assert.deepEqual([question.cost, question.notTaken], [undefined, undefined], 'what the revision did not give is cleared')
  assert.equal(question.ask, text)
  assert.equal(question.history.at(-1)?.op, 'edit')
  assert.match(question.history.at(-1)?.reason ?? '', /^主 Agent 在对话里改了交给人的方案（propose_to_human call-\d+）$/)
  assert.equal(revised.text, renderAsk(text, 1))
  // The way of asking is set once.
  const change = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), question: 'question-1' }))
  assert.deepEqual([change?.code, change?.field], ['invalid', 'form'])
  assert.match(change?.hint ?? '', /drop this question with graph_status \(status dropped, the human's exact words in relay\) and put a new one with propose_to_human/)
  // A revision gives the form and the title with the record.
  const partial = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text, proposal: '借书先不收押金' }))
  assert.deepEqual([partial?.code, partial?.field], ['invalid', 'form'])
  // Decided: refused.
  const rev = (await engine.load()).revisions.get('question-1')
  assert.equal((await engine.apply('human', { op: 'decide', id: 'question-1', rev, conclusion: '借书先不收押金', reason: '同意' })).ok, true)
  const late = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...base, question: 'question-1', text }))
  assert.deepEqual([late?.code, late?.field, late?.hint], ['invalid', 'question', 'decided; propose a new question'])
})

test('a question that is not a proposal waiting for the human cannot be revised or shown once more', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  await engine.apply('human', { op: 'propose', reason: '建图', node: { type: 'question', title: '存储格式', parent: 'goal-1', options: [{ key: 'B', label: 'a', gain: 'g', cost: 'c' }, { key: 'A', label: 'b', gain: 'g', cost: 'c' }], recommend: 'A', crux: '取决于什么？', verdict: '是 → B；否 → A', weight: 'two-way' } })
  for (const args of [{ question: 'question-1', text: '再问一次吗？' }, { ...exampleArgs('want'), question: 'question-1' }, { question: 'goal-1', text: '再问一次吗？' }, { question: 'question-9', text: '再问一次吗？' }]) {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', ...args }))
    assert.ok(['invalid', 'not_found'].includes(error?.code ?? ''), JSON.stringify(args))
    assert.equal(error?.field, 'question', JSON.stringify(args))
  }
})

test('a question already put is shown once more with its own words held to the same limits and to its record, without writing, and takes one of the three', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('choose')))
  await nextReply(host, agent)
  const revision = (await engine.load()).revision
  const text = '上次问的提醒方式还没定：读者快到期或逾期时怎么提醒他们？我推荐站内通知加邮件，因为多数读者不会每天登录。'
  const again = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text }))
  assert.equal(again.question, 'question-1')
  assert.equal(again.form, 'choose', 'the form is the question\'s own')
  assert.equal(again.text, renderAsk(text, 1, PLAIN_QUESTION_EXAMPLES.choose.ways), 'the ways come from the node')
  assert.equal((await engine.load()).revision, revision, 'the history did not change')
  const state = host.projections.stateOf(agent.session, 'hournessTalk') as { shown: Array<{ question?: string, form?: string }> }
  assert.deepEqual(state.shown.filter(entry => entry.question === 'question-1').map(entry => entry.form), ['choose', 'choose'], 'the session log has an item for it again')
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text })).number, 2)
  // The new words are held to the limits and to the record of the node.
  const refused = [
    errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text: '没有问号。' })),
    errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text: '还没定，怎么提醒他们？' })),
    errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text: '还没定，怎么提醒他们？我推荐站内通知加邮件，因为多数读者不会每天登录。', attach: 'rules:p-3f9a1c07' })),
  ]
  assert.deepEqual(refused.map(error => [error?.code, error?.field]), [['invalid', 'text'], ['invalid', 'text'], ['invalid', 'attach']])
})

// ---------------------------------------------------------------- attach

test('with no board in the table, attach is refused with the reason, and a prefix the table does not know too', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const before = (await engine.load()).revision
  for (const attach of ['rules:p-3f9a1c07', 'loops:lp-3f9a1c07', 'scripts:x']) {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), attach }))
    assert.deepEqual([error?.code, error?.field], ['invalid', 'attach'], attach)
    // The rules board has its row in the table; the host in this test does not run it. The loops board has none yet.
    assert.match(error?.message ?? '', attach.startsWith('rules:') ? /the rules board is not running here/ : /no component in this composition takes attach (loops:|scripts:)/, attach)
  }
  assert.equal((await engine.load()).revision, before)
})

test('a board\'s proposal is shown with its original text after the question, and the question\'s body ends with the line that ties it', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, node } = fixture
  const board = fakeBoard()
  const tool = proposeTool(toolDeps(fixture, [board.board]))
  const outcome = await host.invoke(agent, tool, { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' })
  const value = valueOf(outcome)
  const detail = (board.answer.ok ? board.answer.detail?.markdown : '') ?? ''
  assert.equal(value.text, renderAsk(PLAIN_QUESTION_EXAMPLES.recommend.text, 1, undefined, detail))
  assert.ok(String(value.text).endsWith(detail), 'the original text is the last paragraph, verbatim')
  assert.equal(value.attach, 'rules:p-3f9a1c07')
  assert.match(String(value.message), /The last paragraph is the exact text the human must see before agreeing: keep it verbatim in your reply\.$/)
  assert.equal((await node('question-1')).body, `${detail}\n\n提议：p-3f9a1c07`)
  assert.deepEqual(board.asked.map(entry => entry.proposal), ['p-3f9a1c07'])
})

test('a board that refuses, is not running, answers oddly or sends a detail outside the limits keeps the question from being put', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  const board = fakeBoard()
  const tool = proposeTool(toolDeps(fixture, [board.board]))
  const piece = (size: number): string => '字'.repeat(size)
  const answers: Array<[string, unknown]> = [
    ['refused', { ok: false, message: 'the script has been changed' }],
    ['not an answer', 'yes'],
    ['markdown too long', { ok: true, detail: { markdown: piece(6001), mustShow: ['x'] } }],
    ['markdown empty', { ok: true, detail: { markdown: '', mustShow: ['x'] } }],
    ['no pieces', { ok: true, detail: { markdown: 'x', mustShow: [] } }],
    ['too many pieces', { ok: true, detail: { markdown: 'x', mustShow: Array.from({ length: 9 }, () => 'x') } }],
    ['piece too long', { ok: true, detail: { markdown: 'x', mustShow: [piece(4001)] } }],
    ['detail of another shape', { ok: true, detail: 'text' }],
  ]
  const args = { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' }
  for (const [name, answer] of answers) {
    board.answer = answer as typeof board.answer
    const error = errorOf(await host.invoke(agent, tool, args))
    assert.deepEqual([error?.code, error?.field], ['invalid', 'attach'], name)
  }
  // At the limits it goes through: 6000 code points of text, 8 pieces of 4000.
  board.answer = { ok: true, detail: { markdown: piece(6000), mustShow: Array.from({ length: 8 }, () => piece(4000)) } }
  assert.equal((await host.invoke(agent, tool, args)).kind, 'ok')
  // A throwing board and a board that is not running.
  board.answer = { ok: true }
  board.service.attachable = () => { throw new Error('board down') }
  assert.match(errorOf(await host.invoke(agent, tool, args))?.message ?? '', /board down/)
  const absent = proposeTool(toolDeps(fixture, [{ ...board.board, service: () => undefined }]))
  assert.match(errorOf(await host.invoke(agent, absent, args))?.message ?? '', /the rules board is not running here/)
  assert.equal(errorOf(await host.invoke(agent, tool, { ...args, attach: 'rules:p-xyz' }))?.field, 'attach')
  assert.deepEqual([...(await engine.load()).nodes.keys()], ['goal-1', 'question-1'], 'only the question that was accepted at the limits was written')
})

test('revising a question that carries a board\'s proposal needs a new attach, and replaces the whole body with it', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, node } = fixture
  const { board, tool } = await putWithBoard(fixture)
  const { cost: _cost, notTaken: _notTaken, ...revision } = exampleArgs('recommend')
  const text = '我建议借书先不收押金，因为押金要退还，管理员得多做一份对账，可以吗？'
  const without = errorOf(await host.invoke(agent, tool, { ...revision, question: 'question-1', text }))
  assert.deepEqual([without?.code, without?.field], ['invalid', 'attach'])
  assert.match(without?.hint ?? '', /record the revised proposal with the board first and pass its new attach/)
  board.answer = { ok: true, detail: { markdown: '新的脚本原文', mustShow: ['新的脚本原文'] } }
  const revised = valueOf(await host.invoke(agent, tool, { ...revision, question: 'question-1', text, attach: 'rules:p-aaaaaaaa' }))
  assert.equal((await node('question-1')).body, '新的脚本原文\n\n提议：p-aaaaaaaa')
  assert.equal(revised.text, renderAsk(text, 1, undefined, '新的脚本原文'))
})

test('showing a question with a board\'s proposal once more asks the board again for the original text; one whose board is not running cannot be shown', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  const { board, tool } = await putWithBoard(fixture)
  board.answer = { ok: true, detail: { markdown: '重新核对过的原文', mustShow: ['重新核对过的原文'] } }
  const text = PLAIN_QUESTION_EXAMPLES.recommend.text
  const again = valueOf(await host.invoke(agent, tool, { kind: 'question', question: 'question-1', text }))
  assert.equal(again.text, renderAsk(text, 1, undefined, '重新核对过的原文'), 'the detail as the board gives it now, after the question')
  assert.deepEqual(board.asked.map(entry => entry.proposal), ['p-3f9a1c07', 'p-3f9a1c07'])
  board.answer = { ok: false, message: 'the proposal has been withdrawn' }
  const refused = errorOf(await host.invoke(agent, tool, { kind: 'question', question: 'question-1', text }))
  assert.deepEqual([refused?.code, refused?.field], ['invalid', 'attach'])
  const absent = proposeTool(toolDeps(fixture, [{ ...board.board, service: () => undefined }]))
  const out = errorOf(await host.invoke(agent, absent, { kind: 'question', question: 'question-1', text }))
  assert.deepEqual([out?.code, out?.field], ['invalid', 'attach'])
})

// ---------------------------------------------------------------- when the session's messages cannot be read

test('when the session\'s messages cannot be read at all the question is counted as the first and the row health says so', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  const reports: string[] = []
  const tool = proposeTool(toolDeps(fixture, [], { talk: () => undefined, report: (_agent, _state, reason) => { reports.push(reason) } }))
  for (let index = 0; index < 4; index++) {
    const outcome = await host.invoke(agent, tool, { ...exampleArgs('want'), title: `第 ${index + 1} 件` })
    assert.equal(outcome.kind === 'ok' ? outcome.value.number : outcome.kind, 1, 'the limit of three cannot be counted, so it is not enforced')
  }
  assert.match(reports[0] ?? '', /编号只按第 1 件算/)
})

test('without the talk projection the tool reads the session log, the count is right, and the row health says so', async () => {
  const host = hostWithoutTalkProjection()
  const { captureWarnings } = await import('./graph-helpers.ts')
  const { apply } = await import('../src/design/index.ts')
  const { warnings } = await captureWarnings(() => apply(host.ctx))
  assert.ok(warnings.some(text => text.includes('hournessTalk')), warnings.join('\n'))
  const agent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  const { openEngine } = await import('../src/graph/engine.ts')
  const dir = `${host.workspace('ws')}/docs/graph`
  await openEngine(dir).apply('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview' } })
  host.focuses.set('s1', 'goal-1')
  const numbers: unknown[] = []
  for (const title of ['一', '二', '三']) {
    const outcome = await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), title })
    numbers.push(outcome.kind === 'ok' ? outcome.value.number : outcome.kind)
  }
  assert.deepEqual(numbers, [1, 2, 3])
  assert.equal((await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('want'), title: '四' })).kind, 'error')
  const { healthOf } = await import('./design-host.ts')
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /人的消息改从会话日志读/)
})

// ---------------------------------------------------------------- kind confirm (M3 step 8)

const CONFIRM = { kind: 'confirm', goal: 'goal-1', text: '需求就按上面这样定，可以吗？' }

/** The line the confirm of a goal without end users carries (user graph design 0.4.1 §5.1). */
const NO_END_USER_PAGE = `这个目标没有终端用户：${NO_END_USER}`
const PAGE_MESSAGE = 'Everything after the question, down to the user page in the fenced block at the end, is the exact text the human must see before agreeing: keep it verbatim in your reply.'

test('kind confirm puts the requirement of a goal to the human once its card is complete: the text is the main agent\'s own question, nothing is written, and the showing is kept for the answer', async () => {
  const fixture = await mainAgentWithGoal()
  await fillRequirementCard(fixture)
  const { host, agent, engine } = fixture
  const before = (await engine.load()).revision
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, CONFIRM))
  assert.deepEqual([value.tool, value.kind, value.goal, value.number, value.form, value.question], [PROPOSE_TO_HUMAN, 'confirm', 'goal-1', 1, undefined, undefined])
  // The goal draws no user graph: the line that says so is the user page, under the question.
  assert.equal(value.text, `${renderAsk(CONFIRM.text, 1)}\n\n${fenced(NO_END_USER_PAGE)}`)
  assert.deepEqual(value.userPage, { stable: NO_END_USER_PAGE, state: '' })
  assert.match(String(value.message), /^Show text to the human exactly as given; .* then call record_human_answer with kind confirm and their exact words\. The requirement itself goes in your report before the question; text is only the question\. Everything after the question/)
  assert.equal((await engine.load()).revision, before, 'the graph did not change')
  const talk = host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState
  assert.deepEqual(talk.shown.map(entry => [entry.kind, entry.goal, entry.module, entry.number, entry.form, entry.exact, entry.userPage]), [['confirm', 'goal-1', undefined, 1, undefined, undefined, { stable: NO_END_USER_PAGE, state: '' }]])
})

test('kind confirm is refused until the card is complete: gate_unmet says what is missing and where to write it, and nothing is shown', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  const before = (await engine.load()).revision
  const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, CONFIRM))
  assert.equal(error?.code, 'gate_unmet')
  assert.match(error?.message ?? '', /^the requirement card of "goal-1" is not complete; missing: /)
  for (const label of ['问题', '给谁', '约束', '成功（怎样算做成）', '非目标（明确不做的）', '风险（最可能出岔子的地方）', '岔路（人拍板的选择）']) assert.ok((error?.message ?? '').includes(label), label)
  assert.match(error?.hint ?? '', /interview step 2 \(how their days change once it is done\)/)
  assert.match(error?.hint ?? '', /interview step 7 \(the fork only the human can decide\): put it with propose_to_human/)
  assert.equal((await engine.load()).revision, before)
  assert.deepEqual((host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState).shown, [], 'a refused call shows the human nothing')
  // One missing item at a time, each named as the card names it.
  for (const [item, label] of [['need', '需求'], ['constraints', '约束'], ['acceptance', '成功（怎样算做成）'], ['non-goals', '非目标（明确不做的）'], ['risks', '风险（最可能出岔子的地方）'], ['choice', '岔路（人拍板的选择）']] as const) {
    const one = await mainAgentWithGoal()
    await fillRequirementCard(one, [item])
    const missing = errorOf(await one.host.callTool(one.agent, PROPOSE_TO_HUMAN, CONFIRM))
    assert.deepEqual([missing?.code, missing?.message], ['gate_unmet', `the requirement card of "goal-1" is not complete; missing: ${label}`], item)
  }
})

test('kind confirm names a goal that is open and still in the interview: anything else is refused for the goal, one reason each', async () => {
  const fixture = await mainAgentWithGoal()
  await fillRequirementCard(fixture)
  const { host, agent, engine } = fixture
  const refused = async (patch: Record<string, unknown>, code: string, hint: RegExp | undefined): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...CONFIRM, ...patch }))
    assert.deepEqual([error?.code, error?.field], [code, 'goal'], JSON.stringify(patch))
    if (hint !== undefined) assert.match(error?.hint ?? '', hint)
  }
  await refused({ goal: 'goal-9' }, 'not_found', undefined)
  await refused({ goal: 'risk-1' }, 'invalid', /pass the id of the goal/)
  // The goal the human proposed is approved at once (the fixture's); its stage moves on by their hand.
  assert.ok((await engine.apply('human', { op: 'edit', id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), set: { stage: 'design' }, reason: '进设计' })).ok)
  await refused({}, 'invalid', /a design is put to the human with kind release/)
  assert.ok((await engine.apply('human', { op: 'status', id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), to: 'dropped', reason: '不做了' })).ok)
  await refused({}, 'invalid', /a closed goal is not put to the human/)
})

test('kind confirm takes only the goal, the text and a sample: the fields of a question and of a release are refused, and so is a call without them', async () => {
  const fixture = await mainAgentWithGoal()
  await fillRequirementCard(fixture)
  const { host, agent, engine } = fixture
  const before = (await engine.load()).revision
  const refused = async (patch: Record<string, unknown>, field: string): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...CONFIRM, ...patch }))
    assert.deepEqual([error?.code, error?.field], ['invalid', field], JSON.stringify(patch))
    assert.ok((error?.hint ?? '').length > 0)
  }
  for (const [field, value] of [['form', 'recommend'], ['title', '题'], ['proposal', '做法'], ['reason', '理由'], ['cost', '代价'], ['ways', ['甲', '乙']], ['notTaken', '没选的'], ['parent', 'goal-1'], ['question', 'question-1'], ['sources', ['goal-1']], ['attach', 'rules:p-3f9a1c07'], ['module', 'module-a'], ['page', '一页']] as const) {
    await refused({ [field]: value }, field)
  }
  await refused({ goal: undefined }, 'goal')
  await refused({ goal: '' }, 'goal')
  await refused({ text: undefined }, 'text')
  await refused({ sample: '' }, 'sample')
  await refused({ sample: '字'.repeat(6001) }, 'sample')
  await refused({ sample: 7 }, 'sample')
  assert.equal((await engine.load()).revision, before)
})

test('the text of a confirm is held to the limit of a recommend and to the plain words, and it counts among the three questions of a reply', async () => {
  const fixture = await mainAgentWithGoal()
  await fillRequirementCard(fixture)
  const { host, agent } = fixture
  const refused = async (text: string, message: RegExp): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...CONFIRM, text }))
    assert.deepEqual([error?.code, error?.field], ['invalid', 'text'], text.slice(0, 20))
    assert.match(error?.message ?? '', message)
  }
  await refused('', /non-empty/)
  await refused('需求就按这样定？\n可以吗？', /one line/)
  await refused('需求就按这样定，可以吗。', /exactly one question mark, it has 0/)
  await refused('需求就按这样定吗？是不是？', /it has 2/)
  await refused(`${'字'.repeat(TALK_LIMITS.text.recommend)}？`, new RegExp(`longer than ${TALK_LIMITS.text.recommend}`))
  await refused('验收就按这样定，可以吗？', /text uses the word 验收, which the human has not learned/)
  // The limit is the recommend one, longer than the others': 160 characters pass.
  const longest = `${'字'.repeat(TALK_LIMITS.text.recommend - 1)}？`
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...CONFIRM, text: longest })).number, 1)
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, CONFIRM)).number, 2)
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('want'))).number, 3)
  const fourth = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, CONFIRM))
  assert.equal(fourth?.code, 'too_many')
  assert.match(fourth?.hint ?? '', /at most three questions in one reply/)
})

test('a confirm can carry the original text the human must see: it is laid under the question as it is, the message says to keep it, and the showing remembers it', async () => {
  const fixture = await mainAgentWithGoal()
  await fillRequirementCard(fixture)
  const { host, agent } = fixture
  const sample = '需求：记一下每天花了多少钱\n问题：月底不知道钱花在哪'
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...CONFIRM, sample }))
  // The sample is laid under the question, the user page after it (user graph design 0.4.1 §5.1).
  assert.equal(value.text, `${renderAsk(CONFIRM.text, 1, undefined, sample, false)}\n\n${fenced(NO_END_USER_PAGE)}`)
  assert.ok(String(value.message).endsWith(PAGE_MESSAGE))
  const talk = host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState
  assert.equal(talk.shown[0]?.exact, sample)
  const bare = String(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, CONFIRM)).message)
  assert.ok(!bare.includes('The last paragraph'), 'no original text of its own, no sentence for it: only the one of the user page')
  assert.ok(bare.endsWith(PAGE_MESSAGE))
})

test('the description of propose_to_human says what a confirm is and what it takes', async () => {
  const { host } = await mainAgentWithGoal()
  const description = host.tools.get(PROPOSE_TO_HUMAN)?.description ?? ''
  assert.match(description, /kind confirm: the interview is over, put the requirements to the human; pass goal and text/)
  assert.match(description, /It is refused until the 9 items of the requirement card are filled\./)
  assert.match(description, /the harness appends the user page to the text of a confirm and a release \(userPage in the result\): the human agrees to it, so show it whole\./)
})

// ---------------------------------------------------------------- kind release (M3 step 9)

const RELEASE = { kind: 'release', goal: 'goal-1', text: '照上面的方案放行，可以吗？' }
const releaseOf = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({ ...RELEASE, ...patch })

/** The call is refused with this code on this field, and the graph and the human's view are as they were. */
async function releaseRefused(fixture: Awaited<ReturnType<typeof mainAgentWithGoal>>, patch: Record<string, unknown>, code: string, field: string | undefined): Promise<{ code: string, field: string | undefined, message: string, hint: string }> {
  const { host, agent, engine } = fixture
  const before = [(await engine.load()).revision, (host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState).shown.length]
  const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, releaseOf(patch)))
  assert.deepEqual([error?.code, error?.field], [code, field], JSON.stringify(patch))
  assert.ok((error?.hint ?? '').length > 0)
  assert.deepEqual([(await engine.load()).revision, (host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState).shown.length], before, 'nothing was written and nothing was shown')
  return error!
}

test('kind release puts the design of a goal that is not split to the human: the text is the main agent\'s own question, the set it will approve is recorded with its revisions, and nothing is written', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  const { host, agent, engine } = fixture
  const before = await engine.load()
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, RELEASE))
  assert.deepEqual([value.tool, value.kind, value.goal, value.module, value.number, value.form, value.question], [PROPOSE_TO_HUMAN, 'release', 'goal-1', undefined, 1, undefined, undefined])
  assert.equal(value.text, renderAsk(RELEASE.text, 1))
  assert.deepEqual(value.releaseSet, [{ id: 'decision-1', rev: before.revisions.get('decision-1') }, { id: 'task-1', rev: before.revisions.get('task-1') }], 'the proposals of the goal in the order they are approved, each as the human is shown it')
  assert.match(String(value.message), /^Show text to the human exactly as given; .* then call record_human_answer with kind release and their exact words\. The design itself goes in your report before the question; text is only the question\.$/)
  assert.equal((await engine.load()).revision, before.revision, 'the graph did not change')
  const talk = host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState
  assert.deepEqual(talk.shown.map(entry => [entry.kind, entry.goal, entry.module, entry.number, entry.exact, entry.releaseSet]), [['release', 'goal-1', undefined, 1, undefined, value.releaseSet]])
})

test('kind release is refused until the design is complete: gate_unmet names each thing missing as the human reads it and where to write it', async () => {
  const cases: ReadonlyArray<readonly [string, (fixture: Awaited<ReturnType<typeof mainAgentWithGoal>>) => Promise<void>, string]> = [
    ['no design decision', async ({ engine }) => { await engine.apply('human', { op: 'reject', id: 'decision-1', rev: (await engine.load()).revisions.get('decision-1'), reason: '不要了' }) }, '设计决策'],
    ['a column missing', async ({ engine }) => { await engine.apply('llm', { op: 'edit', id: 'decision-1', rev: (await engine.load()).revisions.get('decision-1'), set: { nonGoals: null }, reason: '改' }) }, '非目标'],
    ['a task without its criteria', async ({ engine }) => { await engine.apply('llm', { op: 'edit', id: 'task-1', rev: (await engine.load()).revisions.get('task-1'), set: { acceptance: null }, reason: '改' }) }, '任务「写记账命令」怎样算做完'],
    ['a question not answered', async ({ engine }) => { await engine.apply('llm', { op: 'propose', reason: '问', node: { type: 'question', parent: 'goal-1', ...exampleArgsRecord() } }) }, '待决'],
  ]
  for (const [name, spoil, label] of cases) {
    const fixture = await mainAgentWithGoal()
    await writeDesign(fixture, 'small')
    await spoil(fixture)
    const error = await releaseRefused(fixture, {}, 'gate_unmet', undefined)
    assert.match(error.message, /^the design of "goal-1" is not complete; missing: /, name)
    assert.ok(error.message.includes(label), `${name}: ${error.message}`)
    assert.ok(!/验收|门禁/.test(error.message), 'the human reads plain words')
  }
})

/** The record of a recommend question, as the engine takes it. */
function exampleArgsRecord(): Record<string, unknown> {
  const { text: _text, kind: _kind, ...record } = exampleArgs('recommend')
  const { form, title, proposal, reason, cost } = record as Record<string, string>
  return { form, title, ask: askOf(String(exampleArgs('recommend').text)), proposal, reason, cost }
}

test('kind release names a goal that is open and in its design: anything else is refused for the goal, one reason each', async () => {
  const fixture = await mainAgentWithGoal()
  await releaseRefused(fixture, { goal: 'goal-9' }, 'not_found', 'goal')
  await releaseRefused(fixture, { goal: 'risk-9' }, 'not_found', 'goal')
  const interview = await releaseRefused(fixture, {}, 'invalid', 'goal')
  assert.match(interview.hint, /kind confirm first/)
  await writeDesign(fixture, 'small')
  const { engine } = fixture
  assert.ok((await engine.apply('human', { op: 'edit', id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), set: { stage: 'release' }, reason: '放行' })).ok)
  assert.match((await releaseRefused(fixture, {}, 'invalid', 'goal')).hint, /released already/)
  assert.ok((await engine.apply('human', { op: 'status', id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), to: 'dropped', reason: '不做了' })).ok)
  assert.match((await releaseRefused(fixture, {}, 'invalid', 'goal')).hint, /closed goal/)
})

test('kind release takes the goal, the text, the module, the page and a sample: the fields of a question are refused, the page and the sample exclude each other, a goal that is not split takes no page and no module', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  for (const [field, value] of [['form', 'recommend'], ['title', '题'], ['proposal', '做法'], ['reason', '理由'], ['cost', '代价'], ['ways', ['甲', '乙']], ['notTaken', '没选的'], ['parent', 'goal-1'], ['question', 'question-1'], ['sources', ['goal-1']], ['attach', 'rules:p-3f9a1c07']] as const) {
    assert.match((await releaseRefused(fixture, { [field]: value }, 'invalid', field)).hint, /kind release takes kind, text, goal, module, page and sample/)
  }
  await releaseRefused(fixture, { goal: undefined }, 'invalid', 'goal')
  await releaseRefused(fixture, { text: undefined }, 'invalid', 'text')
  await releaseRefused(fixture, { sample: '' }, 'invalid', 'sample')
  await releaseRefused(fixture, { sample: '字'.repeat(6001) }, 'invalid', 'sample')
  await releaseRefused(fixture, { module: '' }, 'invalid', 'module')
  await releaseRefused(fixture, { page: '一页', sample: '样稿' }, 'invalid', 'sample')
  assert.match((await releaseRefused(fixture, { page: '一页' }, 'invalid', 'page')).hint, /this goal is not split into modules/)
  await releaseRefused(fixture, { module: 'task-1' }, 'invalid', 'module')
  await releaseRefused(fixture, { module: 'module-z' }, 'not_found', 'module')
})

test('the text of a release is held to the limit of a recommend and to the plain words, and it counts among the three questions of a reply', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  const { host, agent } = fixture
  await releaseRefused(fixture, { text: '照上面的方案放行，可以吗。' }, 'invalid', 'text')
  await releaseRefused(fixture, { text: `${'字'.repeat(TALK_LIMITS.text.recommend)}？` }, 'invalid', 'text')
  const plain = await releaseRefused(fixture, { text: '验收过了，放行可以吗？' }, 'invalid', 'text')
  assert.match(plain.message, /text uses the word 验收/)
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, releaseOf({ text: `${'字'.repeat(TALK_LIMITS.text.recommend - 1)}？` }))).number, 1)
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, RELEASE)).number, 2)
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('want'))).number, 3)
  assert.equal(errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, RELEASE))?.code, 'too_many')
})

test('a release can carry the original text the human must see: it is laid under the question as it is and the showing remembers it', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  const { host, agent } = fixture
  const sample = '方案：用本地文件存账\n任务：写记账命令'
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, releaseOf({ sample })))
  assert.equal(value.text, renderAsk(RELEASE.text, 1, undefined, sample, false))
  assert.ok(String(value.message).endsWith('keep it verbatim in your reply.'))
  assert.equal((host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState).shown[0]?.exact, sample)
})

// A goal split into modules is released twice over (src/graph/modules.ts): the framework with the module list and the directions, then each module.

/** The things the framework release approves: the framework decision, the directions and the two candidates, not what is below the candidates. */
const FRAMEWORK_SET = ['decision-fw', 'norm-directions', 'module-a', 'module-b']

test('the framework release of a goal split into modules: the set is what is not below a module, the page is appended to the text and kept as the original text', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  const { host, agent, engine } = fixture
  const before = await engine.load()
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, releaseOf({ page: FRAMEWORK_PAGE })))
  assert.deepEqual([value.kind, value.goal, value.module], ['release', 'goal-1', undefined])
  assert.deepEqual((value.releaseSet as Array<{ id: string }>).map(entry => entry.id), FRAMEWORK_SET, 'depth first, then the order they were proposed in: the framework, the directions, the candidates')
  assert.equal(value.text, renderAsk(RELEASE.text, 1, undefined, FRAMEWORK_PAGE, false))
  assert.ok(String(value.message).endsWith('keep it verbatim in your reply.'))
  assert.equal((await engine.load()).revision, before.revision)
  assert.equal((host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState).shown[0]?.exact, FRAMEWORK_PAGE)
})

test('the framework release is refused one gap at a time: the framework, a column of it, the directions, a question left open outside the modules; what is below a module is not asked for yet', async () => {
  const gap = async (name: string, spoil: (fixture: Awaited<ReturnType<typeof mainAgentWithGoal>>) => Promise<void>, label: string): Promise<void> => {
    const fixture = await mainAgentWithGoal()
    await writeDesign(fixture, 'split')
    await spoil(fixture)
    const error = await releaseRefused(fixture, { page: FRAMEWORK_PAGE }, 'gate_unmet', undefined)
    assert.ok(error.message.includes(label), `${name}: ${error.message}`)
    assert.ok(error.message.startsWith('the design of "goal-1" is not complete; missing: '), name)
  }
  const edit = (id: string, set: Record<string, unknown>) => async ({ engine }: Awaited<ReturnType<typeof mainAgentWithGoal>>): Promise<void> => {
    assert.ok((await engine.apply('llm', { op: 'edit', id, rev: (await engine.load()).revisions.get(id), set, reason: '改' })).ok)
  }
  await gap('no framework decision', async ({ engine }) => { await engine.apply('human', { op: 'reject', id: 'decision-fw', rev: (await engine.load()).revisions.get('decision-fw'), reason: '不要了' }) }, '框架（设计决策）')
  await gap('a column of the framework', edit('decision-fw', { nonGoals: null }), '非目标')
  await gap('no directions node', async ({ engine }) => { await engine.apply('human', { op: 'reject', id: 'norm-directions', rev: (await engine.load()).revisions.get('norm-directions'), reason: '不要了' }) }, '人定过的方向清单')
  await gap('no direction in it', edit('norm-directions', { acceptance: null }), '人定过的方向清单')
  await gap('a question open outside the modules', async ({ engine }) => { await engine.apply('llm', { op: 'propose', reason: '问', node: { type: 'question', parent: 'goal-1', ...exampleArgsRecord() } }) }, '待决')
  // The design of a module is its own release: a missing column below a module and an open question below it do not hold the framework back.
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await edit('decision-a', { nonGoals: null })(fixture)
  await fixture.engine.apply('llm', { op: 'propose', reason: '问', node: { type: 'question', parent: 'module-a', ...exampleArgsRecord() } })
  assert.equal(valueOf(await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, releaseOf({ page: FRAMEWORK_PAGE }))).kind, 'release')
})

test('the page of the framework release is required, within the limit, and names each module, each framework decision and each direction word for word; the first one missing is named', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  assert.match((await releaseRefused(fixture, {}, 'invalid', 'page')).message, /page is required/)
  const without = (text: string): string => FRAMEWORK_PAGE.replace(text, '')
  assert.match((await releaseRefused(fixture, { page: without(SPLIT_NAMES.moduleB) }, 'invalid', 'page')).hint, new RegExp(`the module "${SPLIT_NAMES.moduleB}"`))
  assert.match((await releaseRefused(fixture, { page: without(SPLIT_NAMES.framework) }, 'invalid', 'page')).message, /the framework decision/)
  assert.match((await releaseRefused(fixture, { page: without(SPLIT_NAMES.directions[1]) }, 'invalid', 'page')).message, new RegExp(`the direction "${SPLIT_NAMES.directions[1]}"`))
  assert.match((await releaseRefused(fixture, { page: ' ' }, 'invalid', 'page')).message, /must not be empty/)
  assert.match((await releaseRefused(fixture, { page: `${FRAMEWORK_PAGE}${'字'.repeat(PAGE_LIMITS.max)}` }, 'invalid', 'page')).message, new RegExp(`longer than ${PAGE_LIMITS.max}`))
  assert.equal(valueOf(await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, releaseOf({ page: FRAMEWORK_PAGE }))).kind, 'release')
})

test('the release of a module needs the framework released first, a module of the goal that is in design, its own design complete and a page that names it', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  const early = await releaseRefused(fixture, { module: 'module-a', page: modulePage(SPLIT_NAMES.moduleA) }, 'invalid', 'module')
  assert.match(early.message, /is not a module of "goal-1"/, 'a candidate is not a module yet')
  await frameworkReleased(fixture)
  const { host, agent, engine } = fixture
  const before = await engine.load()
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, releaseOf({ module: 'module-a', page: modulePage(SPLIT_NAMES.moduleA) })))
  assert.deepEqual([value.kind, value.goal, value.module], ['release', 'goal-1', 'module-a'])
  assert.deepEqual(value.releaseSet, [{ id: 'decision-a', rev: before.revisions.get('decision-a') }, { id: 'task-a', rev: before.revisions.get('task-a') }], 'only the design below that module')
  assert.equal(value.text, renderAsk(RELEASE.text, 1, undefined, modulePage(SPLIT_NAMES.moduleA), false))
  const talk = host.projections.stateOf(agent.session, TALK_PROJECTION) as TalkState
  assert.deepEqual(talk.shown.map(entry => [entry.kind, entry.goal, entry.module]), [['release', 'goal-1', 'module-a']])
  // The page names the module: the other module's page does not do, and neither does no page.
  assert.match((await releaseRefused(fixture, { module: 'module-a', page: modulePage(SPLIT_NAMES.moduleB) }, 'invalid', 'page')).hint, new RegExp(SPLIT_NAMES.moduleA))
  assert.match((await releaseRefused(fixture, { module: 'module-a' }, 'invalid', 'page')).message, /page is required/)
  // Its design must be there: a decision directly under it with its columns, tasks with their criteria, no question open below it.
  await engine.apply('llm', { op: 'edit', id: 'decision-b', rev: (await engine.load()).revisions.get('decision-b'), set: { nonGoals: null }, reason: '改' })
  const gap = await releaseRefused(fixture, { module: 'module-b', page: modulePage(SPLIT_NAMES.moduleB) }, 'gate_unmet', undefined)
  assert.match(gap.message, /^the design of module "module-b" is not complete; missing: .*非目标/)
  await engine.apply('llm', { op: 'propose', reason: '问', node: { type: 'question', parent: 'module-b', ...exampleArgsRecord() } })
  assert.match((await releaseRefused(fixture, { module: 'module-b', page: modulePage(SPLIT_NAMES.moduleB) }, 'gate_unmet', undefined)).message, /待决/)
})

test('a module that is released already, a node that is not a module and a goal that is not released are refused for the module', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  const { engine } = fixture
  await releaseRefused(fixture, { module: 'decision-fw', page: modulePage('x') }, 'invalid', 'module')
  await releaseRefused(fixture, { module: 'task-a', page: modulePage('x') }, 'invalid', 'module')
  for (const id of ['decision-a', 'task-a']) assert.ok((await engine.apply('human', { op: 'approve', id, rev: (await engine.load()).revisions.get(id), reason: '放行' })).ok)
  assert.ok((await engine.apply('human', { op: 'edit', id: 'module-a', rev: (await engine.load()).revisions.get('module-a'), set: { stage: 'release' }, reason: '放行' })).ok)
  assert.match((await releaseRefused(fixture, { module: 'module-a', page: modulePage(SPLIT_NAMES.moduleA) }, 'invalid', 'module')).hint, /already released/)
  // The framework is put to the human again only after the goal is sent back to design: at release it is refused.
  assert.match((await releaseRefused(fixture, { page: FRAMEWORK_PAGE }, 'invalid', 'goal')).hint, /release a module of it with module/)
})

test('an empty column of the checked solutions followed by the line "如果失败：" is still an empty column: the release is refused for the architecture as the person reads it, and a filled one with that line goes through', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  const { engine, host, agent } = fixture
  const body = async (text: string): Promise<void> => {
    assert.ok((await engine.apply('llm', { op: 'edit', id: 'decision-1', rev: (await engine.load()).revisions.get('decision-1'), set: { body: text }, reason: '改' })).ok)
  }
  await body('理由：一个人用\n架构：本地 JSON 文件\n查过的现成方案：\n如果失败：文件被改坏')
  const error = await releaseRefused(fixture, {}, 'gate_unmet', undefined)
  assert.match(error.message, /missing: 架构（含查过的现成方案）$/)
  assert.match(error.hint, /both "架构：" \(how it works\) and "查过的现成方案：" \(the existing solutions checked and why they are not used\) in the body of decision-1/)
  await body('理由：一个人用\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重\n如果失败：文件被改坏')
  assert.equal(valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, RELEASE)).kind, 'release')
})

test('a module whose goal went back to design cannot be put for release: the framework has to be released again first', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  const { engine } = fixture
  assert.ok((await engine.apply('human', { op: 'edit', id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), set: { stage: 'design' }, reason: '框架要改' })).ok)
  const error = await releaseRefused(fixture, { module: 'module-a', page: modulePage(SPLIT_NAMES.moduleA) }, 'gate_unmet', undefined)
  assert.match(error.message, /^the design of module "module-a" is not complete; missing: 项目的框架、模块清单和方向$/)
  assert.match(error.hint, /release the framework, the module list and the directions first \(propose_to_human kind release without module\)/)
})
test('the description of propose_to_human says what a release is, what it takes and when the page is asked for', async () => {
  const { host } = await mainAgentWithGoal()
  const description = host.tools.get(PROPOSE_TO_HUMAN)?.description ?? ''
  assert.match(description, /kind release: the design is done, put it to the human to release; pass goal and text/)
  assert.match(description, /A goal split into modules is released twice over: first the framework, the module list and the directions \(no module\), then each module \(module\)/)
  assert.ok(description.includes(`at most ${PAGE_LIMITS.max} characters`))
  assert.match(description, /A goal that is not split takes no page\./)
})
// ---------------------------------------------------------------- the contract with the panel (panel design 0.7 §11, 6c)

test('contract with the panel: a question the tool puts for each worked example, and one that carries a board\'s original text, goes through the engine inside the limits and is kept as given', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, node } = fixture
  let index = 0
  for (const form of ASK_FORMS) {
    valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs(form)))
    index += 1
    const example = PLAIN_QUESTION_EXAMPLES[form]
    const stored = await node(`question-${index}`)
    assert.deepEqual([stored.ask, stored.form, stored.proposal, stored.title], [askOf(example.text), form, example.proposal ?? example.ways?.at(-1), example.title], form)
    assert.ok(stored.title.length <= PLAIN_LIMITS.title)
    await nextReply(host, agent)
  }
  const board = fakeBoard()
  const tool = proposeTool(toolDeps(fixture, [board.board]))
  valueOf(await host.invoke(agent, tool, { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' }))
  const attached = await node('question-5')
  assert.equal(attached.ask, askOf(PLAIN_QUESTION_EXAMPLES.recommend.text))
  assert.ok(attached.body?.endsWith('提议：p-3f9a1c07'))
})

// The panel design's writing check (src/graph/plain.ts, plain-ui 1.3 §5.3): the questions the tool puts for the worked examples
// break no rule, and the same fields proposed by the llm pass the engine in the second phase with no warning (§5.3 precondition (c)
// for propose_to_human).
test('contract with the panel: the questions of the worked examples pass the writing check, in the second phase too', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, node, dir } = fixture
  const strict = openEngine(dir, { plainPhase: 2 })
  let index = 0
  for (const form of ASK_FORMS) {
    valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs(form)))
    index += 1
    const stored = await node(`question-${index}`)
    const graph = await loadGraph(dir)
    assert.deepEqual(nodePlainIssues(stored, new Set(graph.nodes.keys())), [], form)
    const fields = Object.fromEntries((['title', 'ask', 'form', 'proposal', 'reason', 'cost', 'ways', 'notTaken'] as const).flatMap(field => stored[field] === undefined ? [] : [[field, stored[field]]]))
    const again = await strict.apply('llm', { op: 'propose', reason: '契约', node: { type: 'question', parent: stored.parent, ...fields } })
    assert.ok(again.ok, `${form}: ${JSON.stringify(again)}`)
    assert.equal(again.ok && again.warnings, undefined, form)
    await nextReply(host, agent)
  }
})
