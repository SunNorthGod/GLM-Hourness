/**
 * record_human_answer (src/design/record.ts, docs/ORCHESTRATION.md §3.5) on the
 * fake host, with the real fold of the session log (`hournessTalk`) under it:
 * what it writes to the graph for each of the three replies, which words it
 * accepts as the human's and which it refuses, what it does when the session's
 * messages cannot be read, and what it asks a board to prove before it hands
 * the human's agreement back. The check of the words is the harness's: the
 * model can be wrong or invent, the graph must not move.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { attachDigest } from '../src/design/attach.ts'
import { recordTool } from '../src/design/record.ts'
import { proposeTool } from '../src/design/propose.ts'
import { GOAL_ATTACHMENT_TEXT } from '../src/design/talk.ts'
import { PLAIN_QUESTION_EXAMPLES } from '../src/graph/plain-question.ts'
import { ANSWER_MARKS, DELEGATED, DELEGATIONS_ID, DELEGATION_LIMIT, DELEGATION_REASON, DELEGATION_SUFFIX, answerCallOf, answerKindOf } from '../src/shared/answer-marks.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } from '../src/shared/tool-names.ts'
import { healthOf, hostWithoutTalkProjection, type FakeAgent } from './design-host.ts'
import { fakeBoard, mainAgentWithGoal, toolDeps, type MainAgentFixture } from './design-tools-helpers.ts'
import { exampleArgs } from './proposal-examples.ts'

/** A question put to the human and answered "可以，就按推荐的来". */
async function asked(fixture: MainAgentFixture, reply = true): Promise<void> {
  const outcome = await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend') })
  assert.equal(outcome.kind, 'ok')
  fixture.host.reply(fixture.agent, outcome.kind === 'ok' ? `${String(outcome.value.text)}\n\n按这个来吗？` : '')
  if (reply) await fixture.host.say(fixture.agent, '可以，就按推荐的来')
}

const record = (fixture: MainAgentFixture, args: Record<string, unknown>) => fixture.host.callTool(fixture.agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '默认少做', ...args })

const errorOf = (outcome: Awaited<ReturnType<typeof record>>): { code: string, field?: string, message: string, hint: string } => {
  assert.equal(outcome.kind, 'error', JSON.stringify(outcome))
  if (outcome.kind !== 'error') throw new Error('unreachable')
  return outcome.error
}

test('the human agrees in their own words: the question is decided with their words as relay, in the words fixed for it, and the main agent is told to carry on', async () => {
  const fixture = await mainAgentWithGoal()
  await asked(fixture)
  const outcome = await record(fixture, {})
  assert.equal(outcome.kind, 'ok')
  assert.deepEqual(outcome.kind === 'ok' ? [outcome.value.outcome, outcome.value.handedBack] : [], ['decided', undefined])
  const question = await fixture.node('question-1')
  assert.equal(question.status, 'done')
  assert.equal(question.conclusion, '默认少做')
  assert.deepEqual(question.evidence, [{ kind: 'decision', ref: 'conclusion' }])
  const entry = question.history.at(-1)!
  assert.deepEqual([entry.actor, entry.op, entry.relay, entry.conclusion], ['llm', 'decide', '可以，就按推荐的来', '默认少做'])
  assert.ok(entry.reason?.startsWith(ANSWER_MARKS.agree), entry.reason)
  assert.equal(answerKindOf(entry), 'agree')
  assert.match(answerCallOf(entry) ?? '', /^call-\d+$/)
  assert.match(entry.reason ?? '', /^人在对话里同意（record_human_answer call-\d+）$/)
  assert.match(String(outcome.kind === 'ok' ? outcome.value.message : ''), /the human agreed, and question-1 is decided\. Carry on from the conclusion\./)
})

test('adding or rejecting notes the human\'s words on the question and leaves it open; neither carries the words as relay', async () => {
  for (const [answer, mark, outcome] of [['add', ANSWER_MARKS.add, 'added'], ['reject', ANSWER_MARKS.reject, 'rejected']] as const) {
    const fixture = await mainAgentWithGoal()
    await asked(fixture)
    const result = await record(fixture, { answer, recordedAs: '他想要的是不排队' })
    assert.equal(result.kind === 'ok' ? result.value.outcome : result.kind, outcome)
    const question = await fixture.node('question-1')
    assert.equal(question.status, 'approved', 'still open')
    assert.equal(question.conclusion, undefined)
    const note = question.history.at(-1)!
    assert.deepEqual([note.op, note.actor, note.relay], ['comment', 'llm', undefined])
    assert.ok(note.text?.startsWith(mark))
    assert.match(note.text ?? '', /「可以，就按推荐的来」；主 Agent 记成：他想要的是不排队（record_human_answer call-\d+）$/)
    assert.equal(answerKindOf(note), answer)
    assert.match(String(result.kind === 'ok' ? result.value.message : ''), answer === 'add' ? /revise the matter with propose_to_human \(question question-1\) and show it again/ : /turned question-1 down/)
  }
})

// ---------------------------------------------------------------- whose words

test('words the human did not say after the matter was put to them are refused, and the graph does not move', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  await host.say(agent, '之前说过：全部放行')
  await asked(fixture, false)
  const append = (data: unknown): void => { agent.session.append('user/message', data) }
  await new Promise(resolve => setTimeout(resolve, 4))
  // A notice, the time context of the clock plugin, the main agent's own words and the /goal attachment line are not the human's.
  append({ id: 'n1', role: 'user', content: [{ type: 'text', text: '就按推荐的来 通知' }], source: { kind: 'glm-design-bypass', form: 'notice', summary: 's' } })
  append({ id: 'n2', role: 'user', content: [{ type: 'text', text: '就按推荐的来 时间' }], source: { kind: 'dsh-time-context', form: 'snapshot' } })
  host.reply(agent, '就按推荐的来 主 Agent 自己说的')
  append({ id: 'n3', role: 'user', content: [{ type: 'text', text: GOAL_ATTACHMENT_TEXT }], source: { kind: 'user' } })
  const revision = (await engine.load()).revision
  const quotes: Array<[string, string]> = [
    ['全部放行', 'said before the matter was put'],
    ['就按推荐的来 通知', 'a notice'],
    ['就按推荐的来 时间', 'a message of the time context'],
    ['就按推荐的来 主 Agent 自己说的', 'the main agent\'s own message'],
    [GOAL_ATTACHMENT_TEXT, 'the /goal attachment line'],
    ['我编的一句话', 'made up'],
  ]
  for (const [words, why] of quotes) {
    const error = errorOf(await record(fixture, { words: [words] }))
    assert.deepEqual([error.code, error.field], ['invalid', 'words'], why)
    assert.match(error.message, /^quote 1 is not in any message the human sent/, why)
    assert.match(error.hint, /quote the human's own words exactly, from a message they sent after you showed the proposal; if they have not answered yet, end your turn and wait/, why)
  }
  assert.equal((await engine.load()).revision, revision)
})

test('a quote has to be a whole phrase: "可以" is not taken out of "不可以", and is out of "可以，放行"', async () => {
  const fixture = await mainAgentWithGoal()
  await asked(fixture, false)
  await fixture.host.say(fixture.agent, '不可以')
  const off = errorOf(await record(fixture, { words: ['可以'] }))
  assert.equal(off.field, 'words')
  assert.match(off.message, /in a message the human sent, but not as a whole phrase/)
  assert.match(off.hint, /quote whole phrases, from one punctuation mark or line break to the next/)
  const second = await mainAgentWithGoal()
  await asked(second, false)
  await second.host.say(second.agent, '可以，放行')
  assert.equal((await record(second, { words: ['可以'] })).kind, 'ok')
})

test('full-width and half-width forms and white space do not matter, and two quotes may come from two messages', async () => {
  const fixture = await mainAgentWithGoal()
  await asked(fixture, false)
  await fixture.host.say(fixture.agent, 'ＯＫ   就这样')
  await fixture.host.say(fixture.agent, '另外：数据只放在本机')
  const outcome = await record(fixture, { answer: 'add', words: ['OK 就这样', '数据只放在本机'], recordedAs: '同意，另加一条' })
  assert.equal(outcome.kind, 'ok')
  assert.ok((await fixture.node('question-1')).history.at(-1)?.text?.includes('「OK 就这样\n数据只放在本机」'))
})

test('a decided question is decided again only by what the human says after that; the same conclusion is no change', async () => {
  const fixture = await mainAgentWithGoal()
  await asked(fixture)
  assert.equal((await record(fixture, {})).kind, 'ok')
  const stale = errorOf(await record(fixture, { recordedAs: '改成不做' }))
  assert.equal(stale.field, 'words', 'the old words come from before the decision')
  await fixture.host.say(fixture.agent, '不对，还是不做吧')
  const same = errorOf(await record(fixture, { words: ['还是不做吧'], recordedAs: '默认少做' }))
  assert.equal(same.code, 'bad_transition')
  assert.equal((await record(fixture, { words: ['还是不做吧'], recordedAs: '改成不做' })).kind, 'ok')
  assert.equal((await fixture.node('question-1')).conclusion, '改成不做')
})

test('the words a revised matter is answered with are those said after the revision', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  await asked(fixture, false)
  await host.say(agent, '先别排队')
  assert.equal((await record(fixture, { answer: 'add', words: ['先别排队'], recordedAs: '不排队' })).kind, 'ok')
  const { text: _text, cost: _cost, ...revision } = exampleArgs('recommend')
  const revised = await host.callTool(agent, PROPOSE_TO_HUMAN, { ...revision, question: 'question-1', text: '我建议借书先不收押金，因为押金要退还，管理员得多做一份对账，可以吗？先别排队的事另说。', notTaken: '先收押金' })
  assert.equal(revised.kind, 'ok')
  const late = errorOf(await record(fixture, { words: ['先别排队'], recordedAs: '不排队' }))
  assert.equal(late.field, 'words', 'said before the revised matter, so not an answer to it')
  await host.say(agent, '这版可以')
  assert.equal((await record(fixture, { words: ['这版可以'], recordedAs: '按修改后的来' })).kind, 'ok')
})

test('a fork does not take the human\'s messages of its parent as its own', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent } = fixture
  await asked(fixture)
  const fork = host.addAgent('fork', { inheritFrom: agent })
  const tool = recordTool(toolDeps(fixture, [], { isMainAgent: () => true }))
  const inherited = await host.invoke(fork, tool, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '默认少做' })
  assert.equal(inherited.kind === 'error' ? inherited.error.field : inherited.kind, 'words')
  await host.say(fork, '可以，就按推荐的来')
  assert.equal((await host.invoke(fork, tool, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '默认少做' })).kind, 'ok')
})

// ---------------------------------------------------------------- the call itself

test('the call is checked before anything is read: who calls, the shape of the words and of the line, the kind, the question', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, engine } = fixture
  await asked(fixture)
  const revision = (await engine.load()).revision
  const plain = host.addAgent('plain')
  const forbidden = await host.callTool(plain, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以'], recordedAs: 'x' })
  assert.equal(forbidden.kind === 'error' ? forbidden.error.code : forbidden.kind, 'forbidden')
  const long = '字'.repeat(501)
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ words: [] }, 'words'],
    [{ words: ['一', '二', '三', '四'] }, 'words'],
    [{ words: ['  '] }, 'words'],
    [{ words: [long] }, 'words'],
    [{ words: [1] }, 'words'],
    [{ words: ['字'.repeat(500), '字'.repeat(500), '字'.repeat(500)] }, 'words'],
    [{ recordedAs: '' }, 'recordedAs'],
    [{ recordedAs: '一行\n两行' }, 'recordedAs'],
    [{ recordedAs: '字'.repeat(121) }, 'recordedAs'],
    [{ answer: 'maybe' }, 'answer'],
    [{ kind: 'confirm' }, 'kind'],
    [{ kind: 'release' }, 'kind'],
    [{ question: undefined }, 'question'],
    [{ extra: 1 }, 'extra'],
    [{ goal: 'goal-1' }, 'goal'],
    [{ module: 'module-a' }, 'module'],
  ]
  for (const [patch, field] of cases) {
    const outcome = await record(fixture, patch)
    assert.equal(outcome.kind, 'error', JSON.stringify(patch))
    assert.deepEqual(outcome.kind === 'error' ? [outcome.error.code, outcome.error.field] : [], ['invalid', field], JSON.stringify(patch).slice(0, 80))
  }
  assert.match(errorOf(await record(fixture, { kind: 'confirm' })).hint, /^not yet/)
  const missing = errorOf(await record(fixture, { question: 'question-9' }))
  assert.deepEqual([missing.code, missing.field], ['not_found', 'question'])
  const notProposal = errorOf(await record(fixture, { question: 'goal-1' }))
  assert.deepEqual([notProposal.code, notProposal.field], ['invalid', 'question'])
  assert.equal((await engine.load()).revision, revision, 'nothing was written')
  // At the limits it goes through: three quotes of 500 characters, a line of 120.
  const limit = await mainAgentWithGoal()
  await asked(limit, false)
  const quotes = ['甲', '乙', '丙'].map(letter => `${letter.repeat(499)}。`)
  await limit.host.say(limit.agent, quotes.join('\n'))
  assert.equal((await record(limit, { words: quotes, recordedAs: '字'.repeat(120) })).kind, 'ok')
})

test('when the session\'s messages cannot be read nothing is recorded and the health says so', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  await asked(fixture)
  const revision = (await engine.load()).revision
  const reports: string[] = []
  const tool = recordTool(toolDeps(fixture, [], { talk: () => undefined, report: (_agent, state, reason) => { reports.push(`${state}: ${reason}`) } }))
  const outcome = await host.invoke(agent, tool, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '默认少做' })
  assert.deepEqual(outcome.kind === 'error' ? [outcome.error.code, outcome.error.hint] : [], ['unavailable', 'tell the human that their reply could not be recorded'])
  assert.deepEqual(reports, ['degraded: 读不到会话里人的消息，没有记下人的回话'])
  assert.equal((await engine.load()).revision, revision)
})

test('the session log is read when the projection is not registered, and that is told in the row health', async () => {
  const { apply } = await import('../src/design/index.ts')
  const { captureWarnings } = await import('./graph-helpers.ts')
  const host = hostWithoutTalkProjection()
  await captureWarnings(() => apply(host.ctx))
  const agent: FakeAgent = host.addAgent('s1')
  await host.execute(agent, '/wish')
  const { openEngine } = await import('../src/graph/engine.ts')
  const engine = openEngine(`${host.workspace('ws')}/docs/graph`)
  await engine.apply('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'interview' } })
  host.focuses.set('s1', 'goal-1')
  await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend') })
  await host.say(agent, '可以，就按推荐的来')
  const outcome = await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '默认少做' })
  assert.equal(outcome.kind, 'ok')
  assert.equal(healthOf(host, agent)?.state, 'degraded')
  assert.match(healthOf(host, agent)?.reason ?? '', /人的消息改从会话日志读/)
  // With neither the projection nor the log, it is `unavailable`.
  const blind = host.addAgent('s2')
  ;(blind.session as { snapshotEvents?: unknown }).snapshotEvents = undefined
  const none = await host.invoke(blind, recordTool(toolDeps({ host, dir: `${host.workspace('ws')}/docs/graph` }, [], { isMainAgent: () => true })), { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以'], recordedAs: 'x' })
  assert.equal(none.kind === 'error' ? none.error.code : none.kind, 'unavailable')
})

// ---------------------------------------------------------------- attach: the proposal of a board

/** A question that carries a board's proposal, put to the human with the original text shown in the reply. */
async function withProposal(shownInReply: (text: string) => string = text => text): Promise<{ fixture: MainAgentFixture, board: ReturnType<typeof fakeBoard>, record: (args?: Record<string, unknown>) => ReturnType<typeof fixture.host.invoke>, propose: ReturnType<typeof proposeTool> }> {
  const fixture = await mainAgentWithGoal()
  const board = fakeBoard()
  const deps = toolDeps(fixture, [board.board])
  const propose = proposeTool(deps)
  const outcome = await fixture.host.invoke(fixture.agent, propose, { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' })
  assert.equal(outcome.kind, 'ok')
  fixture.host.reply(fixture.agent, shownInReply(outcome.kind === 'ok' ? String(outcome.value.text) : ''))
  await fixture.host.say(fixture.agent, '可以，就按推荐的来')
  const recorder = recordTool(deps)
  return { fixture, board, propose, record: (args = {}) => fixture.host.invoke(fixture.agent, recorder, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '同意这条规则', ...args }) }
}

test('the human agrees to a board\'s proposal they were shown in full: the decision says so, and the board is handed the agreement', async () => {
  const { fixture, board, record: run } = await withProposal()
  const outcome = await run()
  assert.equal(outcome.kind, 'ok')
  assert.equal(outcome.kind === 'ok' ? outcome.value.handedBack : '', 'Rules board: proposal took effect')
  const question = await fixture.node('question-1')
  const detail = board.answer.ok ? board.answer.detail! : undefined
  assert.match(question.history.at(-1)?.reason ?? '', new RegExp(`^人在对话里同意（record_human_answer call-\\d+） · 已给人看原文 ${attachDigest(detail!)}$`))
  assert.equal(board.accepted.length, 1)
  assert.deepEqual(board.accepted[0], { questionId: 'question-1', graphDir: fixture.dir, cwd: fixture.host.workspace('ws'), by: { actor: 'llm', relay: '可以，就按推荐的来' } })
  assert.equal(board.asked.length, 2, 'asked before it was put and again before the agreement')
})

test('the agreement is refused when the pieces the human had to see were not in the reply; nothing is written and the board is not told', async () => {
  const { fixture, board, record: run } = await withProposal(text => text.replace('npm test', '…').replace('它会跑全部测试', '…'))
  const revision = (await fixture.engine.load()).revision
  for (const answer of [await run()]) {
    assert.deepEqual(answer.kind === 'error' ? [answer.error.code, answer.error.hint] : [], ['not_shown', 'The human has not seen the exact command text and cautions; show the text from propose_to_human again, verbatim, and ask again'])
  }
  assert.equal((await fixture.engine.load()).revision, revision)
  assert.equal(board.accepted.length, 0)
  // Shown once more, verbatim, the agreement after it goes through.
  const again = await fixture.host.invoke(fixture.agent, proposeTool(toolDeps(fixture, [board.board])), { kind: 'question', question: 'question-1', text: exampleArgs('recommend').text })
  assert.equal(again.kind, 'ok')
  fixture.host.reply(fixture.agent, again.kind === 'ok' ? String(again.value.text) : '')
  await fixture.host.say(fixture.agent, '行，就这样')
  assert.equal((await run({ words: ['就这样'] })).kind, 'ok')
})

test('what the main agent said counts up to the limit of what is kept after the matter: 6000 characters of original text, the four lines and a few sentences are within it; a piece beyond it is not', async () => {
  const fixture = await mainAgentWithGoal()
  const board = fakeBoard()
  board.answer = { ok: true, detail: { markdown: `${'码'.repeat(5990)}\n结尾提醒`, mustShow: ['结尾提醒', '码'.repeat(10)] } }
  const deps = toolDeps(fixture, [board.board])
  const outcome = await fixture.host.invoke(fixture.agent, proposeTool(deps), { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' })
  assert.equal(outcome.kind, 'ok')
  fixture.host.reply(fixture.agent, `${outcome.kind === 'ok' ? String(outcome.value.text) : ''}\n${'补充说明。'.repeat(500)}`)
  await fixture.host.say(fixture.agent, '可以，就按推荐的来')
  const recorder = recordTool(deps)
  const ok = await fixture.host.invoke(fixture.agent, recorder, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '同意' })
  assert.equal(ok.kind, 'ok')
  // The same reply, followed by so much text that the end of the original is cut from what is kept.
  const cut = await mainAgentWithGoal()
  const out = await cut.host.invoke(cut.agent, proposeTool(toolDeps(cut, [board.board])), { ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07' })
  assert.equal(out.kind, 'ok')
  cut.host.reply(cut.agent, `${'前言。'.repeat(5400)}${out.kind === 'ok' ? String(out.value.text) : ''}`)
  await cut.host.say(cut.agent, '可以，就按推荐的来')
  const refused = await cut.host.invoke(cut.agent, recordTool(toolDeps(cut, [board.board])), { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '同意' })
  assert.equal(refused.kind === 'error' ? refused.error.code : refused.kind, 'not_shown', 'the original text begins after 16,000 characters of the reply were kept')
})

test('a board that says no at the time of the agreement, is not running then, or fails to take the hand-back', async () => {
  const no = await withProposal()
  no.board.answer = { ok: false, message: 'the proposal has been changed since' }
  const refused = await no.record()
  assert.deepEqual(refused.kind === 'error' ? [refused.error.code, refused.error.field] : [], ['invalid', 'attach'])
  assert.equal((await no.fixture.node('question-1')).status, 'approved')

  const gone = await withProposal()
  const recorder = recordTool(toolDeps(gone.fixture, [{ ...gone.board.board, service: () => undefined }]))
  const outcome = await gone.fixture.host.invoke(gone.fixture.agent, recorder, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '同意' })
  assert.equal(outcome.kind, 'ok', 'the decision is made; the board reconciles from the graph when it is back')
  assert.equal(outcome.kind === 'ok' ? outcome.value.handedBack : '', undefined)
  assert.doesNotMatch((await gone.fixture.node('question-1')).history.at(-1)?.reason ?? '', /已给人看原文/)

  const failing = await withProposal()
  failing.board.handBack = () => Promise.reject(new Error('the rules file is locked'))
  const handed = await failing.record()
  assert.equal(handed.kind, 'ok')
  assert.equal(handed.kind === 'ok' ? handed.value.handedBack : '', 'could not hand back to the rules board: the rules file is locked; it reconciles from the graph within a minute')
  assert.equal((await failing.fixture.node('question-1')).status, 'done')
})

test('adding or rejecting does not hand anything back, and the board proposal stays open', async () => {
  for (const answer of ['add', 'reject']) {
    const { fixture, board, record: run } = await withProposal()
    assert.equal((await run({ answer, recordedAs: '再想想' })).kind, 'ok')
    assert.equal(board.accepted.length, 0)
    assert.equal((await fixture.node('question-1')).status, 'approved')
  }
})

test('both boards, the rules board and the loops board, are checked the same way', async () => {
  for (const prefix of ['rules:', 'loops:'] as const) {
    const fixture = await mainAgentWithGoal()
    const board = fakeBoard(prefix)
    const deps = toolDeps(fixture, [board.board])
    const id = prefix === 'rules:' ? 'rules:p-3f9a1c07' : 'loops:lp-3f9a1c07'
    const outcome = await fixture.host.invoke(fixture.agent, proposeTool(deps), { ...exampleArgs('recommend'), attach: id })
    assert.equal(outcome.kind, 'ok', prefix)
    fixture.host.reply(fixture.agent, '只说了一句，没有给人看原文')
    await fixture.host.say(fixture.agent, '可以，就按推荐的来')
    const answer = await fixture.host.invoke(fixture.agent, recordTool(deps), { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以，就按推荐的来'], recordedAs: '同意' })
    assert.equal(answer.kind === 'error' ? answer.error.code : answer.kind, 'not_shown', prefix)
  }
})

// ---------------------------------------------------------------- the four ways of asking (0.6)

/** A question of one way of asking put to the human, with the text the harness returned shown in the reply; the human has not answered yet. */
async function put(fixture: MainAgentFixture, form: 'recommend' | 'choose' | 'want' | 'look', over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const outcome = await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, { ...exampleArgs(form), ...over })
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  const value = outcome.kind === 'ok' ? outcome.value : {}
  fixture.host.reply(fixture.agent, String(value.text))
  return value
}

const call = (fixture: MainAgentFixture, args: Record<string, unknown>) => fixture.host.callTool(fixture.agent, RECORD_HUMAN_ANSWER, args)

test('recommend, want and look: the agreement decides the question and the conclusion is what the main agent recorded', async () => {
  for (const [form, said, recordedAs] of [['recommend', '可以', '借书先不收押金'], ['want', '不是，我要的是按月看的汇总', '要按月看的汇总'], ['look', '按钮放在左边', '借出按钮改到左边']] as const) {
    const fixture = await mainAgentWithGoal()
    await put(fixture, form)
    await fixture.host.say(fixture.agent, said)
    const outcome = await call(fixture, { kind: 'question', question: 'question-1', answer: 'agree', words: [said], recordedAs })
    assert.equal(outcome.kind === 'ok' ? outcome.value.outcome : outcome.kind, 'decided', form)
    const question = await fixture.node('question-1')
    assert.deepEqual([question.status, question.conclusion], ['done', recordedAs], form)
    assert.equal(question.history.at(-1)?.relay, said)
  }
})

test('choose: the agreement says which way the human picked; it is required unless they left the whole matter to the main agent, and refused anywhere else', async () => {
  const fixture = await mainAgentWithGoal()
  const ways = PLAIN_QUESTION_EXAMPLES.choose.ways!
  await put(fixture, 'choose')
  await fixture.host.say(fixture.agent, '第一条')
  const base = { kind: 'question', question: 'question-1', answer: 'agree', words: ['第一条'], recordedAs: ways[0] }
  const revision = (await fixture.engine.load()).revision
  const missing = errorOf(await call(fixture, base))
  assert.deepEqual([missing.code, missing.field], ['invalid', 'way'])
  assert.match(missing.hint, /交给主 Agent 定：/)
  assert.equal(errorOf(await call(fixture, { ...base, way: 3 })).field, 'way', 'beyond the number of ways')
  assert.equal(errorOf(await call(fixture, { ...base, way: 0 })).field, 'way')
  assert.equal(errorOf(await call(fixture, { ...base, way: 1.5 })).field, 'way')
  assert.equal(errorOf(await call(fixture, { ...base, way: '1' })).field, 'way')
  assert.equal(errorOf(await call(fixture, { ...base, way: 1, answer: 'reject' })).field, 'way', 'only the agreement names a way')
  assert.equal((await fixture.engine.load()).revision, revision)
  const picked = await call(fixture, { ...base, way: 1 })
  assert.equal(picked.kind, 'ok')
  assert.equal((await fixture.node('question-1')).conclusion, ways[0])
  // Another way of asking does not take a way.
  const other = await mainAgentWithGoal()
  await put(other, 'recommend')
  await other.host.say(other.agent, '可以')
  assert.equal(errorOf(await call(other, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以'], recordedAs: '借书先不收押金', way: 1 })).field, 'way')
})

test('the human leaves the matter to the main agent: the agreement begins with the hand-over words, and a choose takes no way then', async () => {
  const fixture = await mainAgentWithGoal()
  await put(fixture, 'choose')
  await fixture.host.say(fixture.agent, '你定')
  const recordedAs = `${DELEGATED}站内通知加邮件`
  const withWay = errorOf(await call(fixture, { kind: 'question', question: 'question-1', answer: 'agree', words: ['你定'], recordedAs, way: 2 }))
  assert.deepEqual([withWay.code, withWay.field], ['invalid', 'way'])
  const outcome = await call(fixture, { kind: 'question', question: 'question-1', answer: 'agree', words: ['你定'], recordedAs })
  assert.equal(outcome.kind === 'ok' ? outcome.value.outcome : outcome.kind, 'decided')
  assert.equal((await fixture.node('question-1')).conclusion, recordedAs)
})

test('a look question shown with a sample is agreed to only when the whole sample was in what the main agent said', async () => {
  const fixture = await mainAgentWithGoal()
  const { sample } = PLAIN_QUESTION_EXAMPLES.look
  await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, exampleArgs('look'))
  fixture.host.reply(fixture.agent, '借书页草图在下面，看着哪里不对？')
  await fixture.host.say(fixture.agent, '可以')
  const revision = (await fixture.engine.load()).revision
  const args = { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以'], recordedAs: '样稿可以' }
  const refused = errorOf(await call(fixture, args))
  assert.deepEqual([refused.code, refused.hint], ['not_shown', 'The human has not seen the whole page or sample they must see before agreeing; show the text from propose_to_human again, verbatim, and ask again'])
  assert.equal((await fixture.engine.load()).revision, revision)
  // Part of the sample is not enough either.
  fixture.host.reply(fixture.agent, `借书页草图在下面，看着哪里不对？\n${sample!.split('\n')[0]}`)
  await fixture.host.say(fixture.agent, '可以')
  assert.equal(errorOf(await call(fixture, args)).code, 'not_shown')
  // Shown once more with the sample, and agreed to after that, it goes through.
  const again = await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text: '借书页草图在下面，看着哪里不对？', sample })
  assert.equal(again.kind, 'ok')
  fixture.host.reply(fixture.agent, again.kind === 'ok' ? String(again.value.text) : '')
  await fixture.host.say(fixture.agent, '可以')
  assert.equal((await call(fixture, args)).kind, 'ok')
})

test('a question dropped with the human\'s words makes room for one of another way of asking; without their words the main agent cannot drop it', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  await put(fixture, 'recommend')
  await host.say(agent, '不要这个，我想在两三条路里选')
  const rejected = await call(fixture, { kind: 'question', question: 'question-1', answer: 'reject', words: ['我想在两三条路里选'], recordedAs: '要在几条路里选' })
  assert.equal(rejected.kind === 'ok' ? rejected.value.outcome : rejected.kind, 'rejected')
  assert.match(String(rejected.kind === 'ok' ? rejected.value.message : ''), /another way of asking, set the question to dropped with graph_status/)
  const same = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('choose'), question: 'question-1' }))
  assert.deepEqual([same.code, same.field], ['invalid', 'form'])
  assert.match(same.hint, /dropped/)
  const rev = async (): Promise<string> => (await engine.load()).revisions.get('question-1')!
  const bare = await engine.apply('llm', { op: 'status', id: 'question-1', rev: await rev(), to: 'dropped', reason: '换问法' })
  assert.equal(bare.ok ? 'ok' : bare.error.code, 'forbidden')
  const dropped = await engine.apply('llm', { op: 'status', id: 'question-1', rev: await rev(), to: 'dropped', reason: '换问法', relay: '我想在两三条路里选' })
  assert.equal(dropped.ok, true, JSON.stringify(dropped))
  assert.equal((await engine.openItems()).questions.some(entry => entry.id === 'question-1'), false, 'it left the decision queue')
  await host.say(agent, '嗯')
  const created = await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('choose'))
  assert.equal(created.kind, 'ok')
  const next = await fixture.node('question-2')
  assert.deepEqual([next.form, next.ways], ['choose', PLAIN_QUESTION_EXAMPLES.choose.ways])
})

// ---------------------------------------------------------------- delegation: "this kind is yours" (0.6)

/** The human's latest message says the words; the call hands the kind over (or takes it back). */
async function delegate(fixture: MainAgentFixture, said: string, args: Record<string, unknown>) {
  await fixture.host.say(fixture.agent, said)
  return call(fixture, { kind: 'delegation', words: [said], ...args })
}

const itemOf = (scope: string): string => `${scope}${DELEGATION_SUFFIX}`

test('delegation creates the node while the goal is still in interview, adds a kind, ignores a repeat, takes one back and keeps the node when the last is gone', async () => {
  const fixture = await mainAgentWithGoal()
  const { engine } = fixture
  const first = await delegate(fixture, '这类你定', { scope: '代码风格' })
  assert.equal(first.kind === 'ok' ? first.value.outcome : first, 'delegated', JSON.stringify(first))
  assert.deepEqual(first.kind === 'ok' ? first.value.scopes : [], ['代码风格'])
  assert.match(String(first.kind === 'ok' ? first.value.message : ''), /Tell the human now, in one sentence: 以后「代码风格」这类我定，只在下一批里告诉你，不对就说/)
  const node = await fixture.node(DELEGATIONS_ID)
  assert.deepEqual([node.type, node.status, node.parent, node.acceptance], ['norm', 'approved', 'goal-1', [itemOf('代码风格')]])
  const entry = node.history[0]
  assert.ok(entry.reason?.startsWith(DELEGATION_REASON), entry.reason)
  assert.match(entry.reason ?? '', /（record_human_answer call-\d+）$/)
  assert.equal(entry.relay, '这类你定')
  assert.equal(answerKindOf(entry), undefined, 'the panel does not read it as an agreement')
  // A second kind is added; the same kind again changes nothing.
  assert.deepEqual((await delegate(fixture, '命名也是，这类你定', { scope: '命名' })).kind === 'ok' ? (await fixture.node(DELEGATIONS_ID)).acceptance : [], [itemOf('代码风格'), itemOf('命名')])
  const length = (await fixture.node(DELEGATIONS_ID)).history.length
  const repeat = await delegate(fixture, '命名的事，这类你定', { scope: '命名' })
  assert.equal(repeat.kind === 'ok' ? repeat.value.outcome : repeat.kind, 'unchanged')
  assert.equal((await fixture.node(DELEGATIONS_ID)).history.length, length)
  // Taking back: each by itself; the node stays with an empty list; a kind can be handed over again.
  const undone = await delegate(fixture, '命名这类还是问我', { scope: '命名', undo: true })
  assert.equal(undone.kind === 'ok' ? undone.value.outcome : undone.kind, 'revoked')
  assert.match(String(undone.kind === 'ok' ? undone.value.message : ''), /这类我以后还是先问你/)
  assert.deepEqual((await fixture.node(DELEGATIONS_ID)).acceptance, [itemOf('代码风格')])
  await delegate(fixture, '代码风格这类还是问我', { scope: '代码风格', undo: true })
  const empty = await fixture.node(DELEGATIONS_ID)
  assert.deepEqual([empty.status, empty.acceptance ?? []], ['approved', []], 'the real engine takes an empty list (it leaves the field out of the file) and the node stays')
  assert.equal((await delegate(fixture, '测试这类你定', { scope: '测试' })).kind, 'ok')
  assert.deepEqual((await fixture.node(DELEGATIONS_ID)).acceptance, [itemOf('测试')])
  assert.equal((await engine.load()).issues.filter(issue => issue.severity === 'error').length, 0, 'the graph is still valid')
})

test('delegation takes a kind back only if it is there, naming the kinds that are; the same kind in another width, case of spaces or layout is the same kind', async () => {
  const fixture = await mainAgentWithGoal()
  await delegate(fixture, '这类你定', { scope: ' 代码　 风格\n'.trim() })
  assert.deepEqual((await fixture.node(DELEGATIONS_ID)).acceptance, [itemOf('代码 风格')], 'stored in its normalised form')
  const same = await delegate(fixture, 'ＯＫ，这类你定', { scope: '  代码   风格 ' })
  assert.equal(same.kind === 'ok' ? same.value.outcome : same.kind, 'unchanged')
  const missing = errorOf(await delegate(fixture, '这类还是问我', { scope: '命名', undo: true }))
  assert.deepEqual([missing.code, missing.field], ['invalid', 'scope'])
  assert.match(missing.hint, /代码 风格/)
  const undone = await delegate(fixture, '这类还是问我', { scope: '代码　风格', undo: true })
  assert.equal(undone.kind === 'ok' ? undone.value.outcome : undone.kind, 'revoked', 'undo matches the normalised kind')
  const none = await mainAgentWithGoal()
  const absent = errorOf(await delegate(none, '这类还是问我', { scope: '命名', undo: true }))
  assert.deepEqual([absent.code, absent.field], ['invalid', 'scope'])
})

test('delegation holds at most twenty kinds; taking one back makes room', async () => {
  const fixture = await mainAgentWithGoal()
  for (let index = 1; index <= DELEGATION_LIMIT; index++) assert.equal((await delegate(fixture, `第${index}类这类你定`.replace('类这类', '类，这类'), { scope: `类别${index}` })).kind, 'ok', String(index))
  assert.equal((await fixture.node(DELEGATIONS_ID)).acceptance?.length, DELEGATION_LIMIT)
  const full = errorOf(await delegate(fixture, '再来一类，这类你定', { scope: '多出来的' }))
  assert.deepEqual([full.code, full.field], ['invalid', 'scope'])
  assert.match(full.hint, /ask the human which kinds to take back first/)
  assert.equal((await delegate(fixture, '类别1，这类还是问我', { scope: '类别1', undo: true })).kind, 'ok')
  assert.equal((await delegate(fixture, '多出来的，这类你定', { scope: '多出来的' })).kind, 'ok')
})

test('delegation needs the human\'s own words from their latest message; an older message, the main agent\'s words and invented words are refused and nothing is written', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  await host.say(agent, '这类你定')
  host.reply(agent, '好的，我记下了：代码风格这类我定')
  await host.say(agent, '另外，再看看别的')
  const revision = (await engine.load()).revision
  const old = errorOf(await call(fixture, { kind: 'delegation', scope: '代码风格', words: ['这类你定'] }))
  assert.deepEqual([old.code, old.field], ['invalid', 'words'], 'said in the message before the latest')
  assert.match(old.hint, /the words must be in the latest message the human sent; if they said it earlier, ask them to say it again/)
  for (const words of ['代码风格这类我定', '我编的一句话']) assert.equal(errorOf(await call(fixture, { kind: 'delegation', scope: '代码风格', words: [words] })).field, 'words', words)
  assert.equal((await engine.load()).revision, revision)
  assert.equal((await engine.load()).nodes.has(DELEGATIONS_ID), false)
})

test('delegation is refused for a scope that is empty, longer than 60 characters, over two lines or in words the person has not learned, for fields that belong to other kinds, and without a goal in focus', async () => {
  const fixture = await mainAgentWithGoal()
  const { host, agent, engine } = fixture
  await host.say(agent, '这类你定')
  const revision = (await engine.load()).revision
  const refused = async (args: Record<string, unknown>, field: string): Promise<void> => {
    const error = errorOf(await call(fixture, { kind: 'delegation', words: ['这类你定'], ...args }))
    assert.deepEqual([error.code, error.field], ['invalid', field], JSON.stringify(args))
  }
  await refused({}, 'scope')
  await refused({ scope: '' }, 'scope')
  await refused({ scope: '一行\n两行' }, 'scope')
  await refused({ scope: '字'.repeat(61) }, 'scope')
  await refused({ scope: '验收标准' }, 'scope')
  await refused({ scope: 7 }, 'scope')
  await refused({ scope: '代码风格', answer: 'agree' }, 'answer')
  await refused({ scope: '代码风格', recordedAs: '交给你' }, 'recordedAs')
  await refused({ scope: '代码风格', question: 'question-1' }, 'question')
  await refused({ scope: '代码风格', way: 1 }, 'way')
  await refused({ scope: '代码风格', undo: 'yes' }, 'undo')
  await refused({ scope: '代码风格', words: [] }, 'words')
  assert.equal((await call(fixture, { kind: 'delegation', words: ['这类你定'], scope: '字'.repeat(60) })).kind, 'ok', 'sixty characters go through')
  assert.equal((await engine.load()).revision === revision, false)
  const blank = await mainAgentWithGoal()
  blank.host.focuses.delete(blank.agent.id)
  const noGoal = errorOf(await delegate(blank, '这类你定', { scope: '代码风格' }))
  assert.deepEqual([noGoal.code, noGoal.field, noGoal.hint], ['invalid', 'scope', 'graph_focus the goal first'])
  assert.equal((await blank.engine.load()).nodes.has(DELEGATIONS_ID), false)
})

test('only the main agent hands a kind over, and the node is not taken from a closed one', async () => {
  const fixture = await mainAgentWithGoal()
  const plain = fixture.host.addAgent('plain')
  const forbidden = errorOf(await fixture.host.callTool(plain, RECORD_HUMAN_ANSWER, { kind: 'delegation', scope: '代码风格', words: ['这类你定'] }))
  assert.equal(forbidden.code, 'forbidden')
  await delegate(fixture, '这类你定', { scope: '代码风格' })
  const rev = (await fixture.engine.load()).revisions.get(DELEGATIONS_ID)!
  assert.equal((await fixture.engine.apply('human', { op: 'status', id: DELEGATIONS_ID, rev, to: 'dropped', reason: '不要了' })).ok, true)
  const closed = errorOf(await delegate(fixture, '命名，这类你定', { scope: '命名' }))
  assert.deepEqual([closed.code, closed.field], ['invalid', 'scope'])
})