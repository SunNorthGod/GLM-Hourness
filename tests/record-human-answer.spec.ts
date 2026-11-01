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
import { createRequire, syncBuiltinESMExports } from 'node:module'
import test from 'node:test'
import { attachDigest } from '../src/design/attach.ts'
import { pageDigest, recordTool } from '../src/design/record.ts'
import { proposeTool } from '../src/design/propose.ts'
import { GOAL_ATTACHMENT_TEXT } from '../src/design/talk.ts'
import { isSplit, modulesOf } from '../src/graph/modules.ts'
import { PLAIN_QUESTION_EXAMPLES } from '../src/graph/plain-question.ts'
import { stageStatus } from '../src/graph/stage.ts'
import { releaseVerdict } from '../src/guard/design-release.ts'
import { ANSWER_MARKS, DELEGATED, DELEGATIONS_ID, DELEGATION_LIMIT, DELEGATION_REASON, DELEGATION_SUFFIX, answerCallOf, answerKindOf } from '../src/shared/answer-marks.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } from '../src/shared/tool-names.ts'
import { denied, healthOf, hostWithoutTalkProjection, type FakeAgent } from './design-host.ts'
import { FRAMEWORK_PAGE, SPLIT_NAMES, fakeBoard, fillRequirementCard, frameworkReleased, mainAgentWithGoal, modulePage, toolDeps, writeDesign, type MainAgentFixture } from './design-tools-helpers.ts'
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
    [{ kind: 'confirm' }, 'question'],
    [{ kind: 'release' }, 'question'],
    [{ kind: 'bogus' }, 'kind'],
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
  assert.match(errorOf(await record(fixture, { kind: 'bogus' })).hint, /^pass kind question, confirm, release or delegation/)
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

// ---------------------------------------------------------------- kind confirm (M3 step 8)

const CONFIRM = { kind: 'confirm', goal: 'goal-1', text: '需求就按上面这样定，可以吗？' }
const AGREE = '对，就这样'

/** The requirement of goal-1 put to the human; the main agent says the text it got back, and the human answers (unless `reply` is false). */
async function requirementShown(fixture: MainAgentFixture, reply: string | false = AGREE, sample?: string, said?: string): Promise<void> {
  const outcome = await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, { ...CONFIRM, ...sample === undefined ? {} : { sample } })
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  fixture.host.reply(fixture.agent, said ?? (outcome.kind === 'ok' ? String(outcome.value.text) : ''))
  if (reply !== false) await fixture.host.say(fixture.agent, reply)
}
const recordConfirm = (fixture: MainAgentFixture, patch: Record<string, unknown> = {}) => fixture.host.callTool(fixture.agent, RECORD_HUMAN_ANSWER, { kind: 'confirm', goal: 'goal-1', answer: 'agree', words: [AGREE], recordedAs: '需求按上面这样定', ...patch })
const valueOfOk = (outcome: Awaited<ReturnType<typeof recordConfirm>>): Record<string, unknown> => {
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  return outcome.kind === 'ok' ? outcome.value : {}
}

test('kind confirm: the human agrees to the requirement, and the goal is approved and put into the design, each write with their words as relay', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture)
  assert.equal((await fixture.node('goal-1')).status, 'proposed', 'the main agent\'s own proposal waits for the human')
  await requirementShown(fixture)
  const value = valueOfOk(await recordConfirm(fixture))
  assert.deepEqual([value.outcome, value.stage], ['confirmed', 'design'])
  assert.match(String(value.message), /^Recorded: the human confirmed the requirements\. goal-1 is approved and in stage design\./)
  const goal = await fixture.node('goal-1')
  assert.deepEqual([goal.status, goal.stage], ['approved', 'design'])
  // The stage is written first, while the goal is still a proposal and so still in the interview, and the approval second: whichever write stops, the same words finish it.
  const [edit, approve] = goal.history.slice(-2)
  assert.deepEqual([approve.op, approve.actor, approve.relay, approve.to], ['approve', 'llm', AGREE, 'approved'])
  assert.deepEqual([edit.op, edit.actor, edit.relay], ['edit', 'llm', AGREE])
  assert.deepEqual(edit.changes, { stage: { from: 'interview', to: 'design' } })
  for (const entry of [approve, edit]) {
    assert.match(entry.reason ?? '', /^人在对话里同意（record_human_answer call-\d+）$/)
    assert.equal(answerKindOf(entry), 'agree')
  }
  assert.equal(answerCallOf(approve), answerCallOf(edit), 'one call wrote both')
})

/** Run `body` with the nth file the graph store renames into place failing, as a disk that will not take the write does. */
async function whileWriteFails<T>(nth: number, body: () => Promise<T>): Promise<T> {
  const fs = createRequire(import.meta.url)('node:fs/promises') as { rename: (from: string, to: string) => Promise<void> }
  const original = fs.rename
  let calls = 0
  fs.rename = (from, to) => {
    calls += 1
    return calls === nth ? Promise.reject(new Error('ENOSPC: no space left on device')) : original(from, to)
  }
  syncBuiltinESMExports()
  try {
    return await body()
  }
  finally {
    fs.rename = original
    syncBuiltinESMExports()
  }
}

test('kind confirm: a write that fails leaves the goal in the interview, whichever write it is, and recording the same words finishes it', async () => {
  for (const [nth, written] of [[1, 'nothing'], [2, 'the stage']] as const) {
    const fixture = await mainAgentWithGoal({}, 'llm')
    await fillRequirementCard(fixture)
    await requirementShown(fixture)
    const error = errorOf(await whileWriteFails(nth, () => recordConfirm(fixture)))
    assert.equal(error.code, 'unavailable', written)
    assert.match(error.message, /^the graph could not be written: ENOSPC/)
    assert.match(error.hint, written === 'nothing' ? /^nothing more was recorded; the human said: 对，就这样$/ : /^goal-1 has its stage set to design and waits for its approval, and it is still a proposal: record the same words again to finish it; the human said: 对，就这样$/)
    // Where it stopped the goal is a proposal, so the gates of the interview still hold: it is not released, not approved, and nothing it plans can be built.
    const stopped = await fixture.node('goal-1')
    assert.deepEqual([stopped.status, stopped.stage], ['proposed', written === 'nothing' ? 'interview' : 'design'], written)
    const graph = await fixture.engine.load()
    assert.equal(stageStatus(graph, stopped).stage, 'interview', written)
    const verdict = releaseVerdict(graph, 'goal-1')
    assert.match(verdict.kind === 'deny' ? verdict.violation : 'allowed', /design loop at stage interview/, written)
    assert.deepEqual(stopped.history.filter(entry => entry.op === 'approve'), [], written)
    // The same words, with nothing else, finish it: one stage write and one approval in all.
    assert.equal(valueOfOk(await recordConfirm(fixture)).outcome, 'confirmed', written)
    const done = await fixture.node('goal-1')
    assert.deepEqual([done.status, done.stage], ['approved', 'design'], written)
    assert.deepEqual(done.history.slice(-2).map(entry => [entry.op, entry.relay]), [['edit', AGREE], ['approve', AGREE]], written)
    assert.equal(done.history.filter(entry => entry.op === 'edit' && entry.changes?.stage !== undefined).length, 1, written)
  }
})

test('kind confirm: a goal that is approved already gets only its stage set, and one that names design already gets only its approval', async () => {
  const approved = await mainAgentWithGoal()
  await fillRequirementCard(approved)
  await requirementShown(approved)
  assert.equal(valueOfOk(await recordConfirm(approved)).outcome, 'confirmed')
  const goal = await approved.node('goal-1')
  assert.deepEqual(goal.history.filter(entry => entry.op === 'approve'), [])
  assert.deepEqual([goal.history.at(-1)?.op, goal.history.at(-1)?.relay, goal.stage], ['edit', AGREE, 'design'])

  const named = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(named)
  assert.ok((await named.engine.apply('human', { op: 'edit', id: 'goal-1', rev: (await named.engine.load()).revisions.get('goal-1'), set: { stage: 'design' }, reason: '写了设计' })).ok)
  await requirementShown(named)
  assert.equal(valueOfOk(await recordConfirm(named)).outcome, 'confirmed')
  const proposal = await named.node('goal-1')
  assert.deepEqual([proposal.status, proposal.stage, proposal.history.at(-1)?.op, proposal.history.at(-2)?.actor], ['approved', 'design', 'approve', 'human'])
})

test('kind confirm: the card is checked again at the answer, so a requirement that changed after it was shown is not confirmed, and the same answer goes through once it is whole again', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture)
  await requirementShown(fixture)
  const edit = async (set: Record<string, unknown>): Promise<void> => {
    assert.ok((await fixture.engine.apply('human', { op: 'edit', id: 'goal-1', rev: (await fixture.engine.load()).revisions.get('goal-1'), set, reason: '改了' })).ok)
  }
  await edit({ acceptance: null })
  const before = (await fixture.engine.load()).revision
  const error = errorOf(await recordConfirm(fixture))
  assert.equal(error.code, 'gate_unmet')
  assert.match(error.message, /missing: 成功（怎样算做成）$/)
  assert.equal((await fixture.engine.load()).revision, before, 'nothing was written')
  await edit({ acceptance: ['月底跑一个命令能看到按类别的合计'] })
  assert.equal(valueOfOk(await recordConfirm(fixture)).outcome, 'confirmed')
  assert.deepEqual([(await fixture.node('goal-1')).status, (await fixture.node('goal-1')).stage], ['approved', 'design'])
})

test('kind confirm: only the requirement that was put to the human in this session is recorded, and a goal in the design or a closed one is not confirmed again', async () => {
  const fixture = await mainAgentWithGoal()
  await fillRequirementCard(fixture)
  const notShown = errorOf(await recordConfirm(fixture))
  assert.deepEqual([notShown.code, notShown.field], ['not_shown', 'goal'])
  assert.match(notShown.hint, /show it with propose_to_human first, in this session/)
  // A matter of another kind, or the requirement of another goal, is not it.
  await asked(fixture)
  assert.equal(errorOf(await recordConfirm(fixture)).code, 'not_shown')
  assert.ok((await fixture.engine.apply('human', { op: 'propose', reason: '另一个', node: { type: 'goal', title: '另一个目标' } })).ok)
  await requirementShown(fixture)
  const other = errorOf(await recordConfirm(fixture, { goal: 'goal-2' }))
  assert.deepEqual([other.code, other.field], ['not_shown', 'goal'])
  // Confirmed once, it is in the design; recording it again changes nothing and says why.
  assert.equal(valueOfOk(await recordConfirm(fixture)).outcome, 'confirmed')
  const settled = (await fixture.engine.load()).revision
  const again = errorOf(await recordConfirm(fixture))
  assert.deepEqual([again.code, again.field], ['invalid', 'goal'])
  assert.match(again.hint, /a design is put to the human with kind release/)
  assert.equal((await fixture.engine.load()).revision, settled)
  const revision = (await fixture.engine.load()).revisions.get('goal-1')
  assert.ok((await fixture.engine.apply('human', { op: 'status', id: 'goal-1', rev: revision, to: 'dropped', reason: '不做了' })).ok)
  assert.equal(errorOf(await recordConfirm(fixture)).code, 'invalid')
})

test('kind confirm: words the human did not say after the requirement was put to them are refused, and the goal does not move', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture)
  await fixture.host.say(fixture.agent, '之前说过：全部放行')
  await requirementShown(fixture)
  const before = (await fixture.engine.load()).revision
  for (const words of [['我编的一句话'], ['全部放行'], [AGREE, '再编一句']]) {
    const error = errorOf(await recordConfirm(fixture, { words }))
    assert.deepEqual([error.code, error.field], ['invalid', 'words'], words.join('|'))
  }
  assert.equal((await fixture.engine.load()).revision, before)
  assert.equal((await fixture.node('goal-1')).status, 'proposed')
})

test('kind confirm: adding or rejecting notes the human\'s words on the goal and moves nothing; the requirement is put to them again after it is changed', async () => {
  for (const [answer, mark, outcome] of [['add', ANSWER_MARKS.add, 'added'], ['reject', ANSWER_MARKS.reject, 'rejected']] as const) {
    const fixture = await mainAgentWithGoal({}, 'llm')
    await fillRequirementCard(fixture)
    const said = '补充：数据只存在本机，一个文件就够'
    await requirementShown(fixture, said)
    const value = valueOfOk(await recordConfirm(fixture, { answer, words: [said], recordedAs: '数据只放本机' }))
    assert.equal(value.outcome, outcome)
    assert.equal(value.stage, undefined)
    assert.match(String(value.message), /put the requirement to them again with propose_to_human \(kind confirm\)\.$/)
    const goal = await fixture.node('goal-1')
    assert.deepEqual([goal.status, goal.stage], ['proposed', 'interview'])
    const note = goal.history.at(-1)!
    assert.deepEqual([note.op, note.actor, note.relay], ['comment', 'llm', undefined])
    assert.ok(note.text?.startsWith(mark))
    assert.match(note.text ?? '', /「补充：数据只存在本机，一个文件就够」；主 Agent 记成：数据只放本机（record_human_answer call-\d+）$/)
    // The requirement is shown again and then answered with a nod: only that showing counts.
    await requirementShown(fixture, '这回对了')
    const stale = errorOf(await recordConfirm(fixture, { words: [said] }))
    assert.deepEqual([stale.code, stale.field], ['invalid', 'words'])
    assert.equal(valueOfOk(await recordConfirm(fixture, { words: ['这回对了'] })).outcome, 'confirmed')
  }
})

test('kind confirm: a sample shown with the requirement must have been whole in what the main agent said before the human can agree to it; adding needs no such proof', async () => {
  const sample = '需求：记一下每天花了多少钱\n问题：月底不知道钱花在哪'
  const whole = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(whole)
  await requirementShown(whole, AGREE, sample)
  assert.equal(valueOfOk(await recordConfirm(whole)).outcome, 'confirmed')

  const missing = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(missing)
  await requirementShown(missing, AGREE, sample, CONFIRM.text)
  const before = (await missing.engine.load()).revision
  const error = errorOf(await recordConfirm(missing))
  assert.equal(error.code, 'not_shown')
  assert.match(error.message, /has not seen the whole page or sample they must see before agreeing/)
  assert.equal((await missing.engine.load()).revision, before)
  assert.equal(valueOfOk(await recordConfirm(missing, { answer: 'add', recordedAs: '先给他看全文' })).outcome, 'added')
})

test('kind confirm: the shape of the call, one rule at a time; the fields of the other kinds are refused and nothing is written', async () => {
  const fixture = await mainAgentWithGoal({}, 'llm')
  await fillRequirementCard(fixture)
  await requirementShown(fixture)
  const before = (await fixture.engine.load()).revision
  const refused = async (patch: Record<string, unknown>, code: string, field: string): Promise<void> => {
    const error = errorOf(await recordConfirm(fixture, patch))
    assert.deepEqual([error.code, error.field], [code, field], JSON.stringify(patch))
  }
  for (const [field, value] of [['question', 'question-1'], ['way', 1], ['module', 'module-a'], ['scope', '代码风格'], ['undo', true]] as const) await refused({ [field]: value }, 'invalid', field)
  await refused({ goal: undefined }, 'invalid', 'goal')
  await refused({ goal: '' }, 'invalid', 'goal')
  await refused({ answer: undefined }, 'invalid', 'answer')
  await refused({ answer: 'maybe' }, 'invalid', 'answer')
  await refused({ recordedAs: '' }, 'invalid', 'recordedAs')
  await refused({ words: [] }, 'invalid', 'words')
  await refused({ goal: 'goal-9' }, 'not_found', 'goal')
  await refused({ goal: 'risk-1' }, 'invalid', 'goal')
  assert.equal((await fixture.engine.load()).revision, before)
  // A question call keeps refusing the goal.
  const question = errorOf(await fixture.host.callTool(fixture.agent, RECORD_HUMAN_ANSWER, { kind: 'question', goal: 'goal-1', question: 'question-1', answer: 'agree', words: [AGREE], recordedAs: 'x' }))
  assert.deepEqual([question.code, question.field], ['invalid', 'goal'])
})

// ---------------------------------------------------------------- kind release (M3 step 9)

const RELEASE_TEXT = '照上面的方案放行，可以吗？'
const GO = '可以，放行'

/** The release put to the human (a module's, with its page, when named); the main agent says the text it got back, and the human answers (unless `reply` is false). Returns what the tool returned. */
async function releaseShown(fixture: MainAgentFixture, patch: Record<string, unknown> = {}, reply: string | false = GO, said?: string): Promise<Record<string, unknown>> {
  const outcome = await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, { kind: 'release', goal: 'goal-1', text: RELEASE_TEXT, ...patch })
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome))
  const value = outcome.kind === 'ok' ? outcome.value : {}
  fixture.host.reply(fixture.agent, said ?? String(value.text))
  if (reply !== false) await fixture.host.say(fixture.agent, reply)
  return value
}
const recordRelease = (fixture: MainAgentFixture, patch: Record<string, unknown> = {}) => fixture.host.callTool(fixture.agent, RECORD_HUMAN_ANSWER, { kind: 'release', goal: 'goal-1', answer: 'agree', words: [GO], recordedAs: '照这一页放行', ...patch })
const framework = (fixture: MainAgentFixture, reply: string | false = GO, said?: string) => releaseShown(fixture, { page: FRAMEWORK_PAGE }, reply, said)
const moduleShown = (fixture: MainAgentFixture, id: 'module-a' | 'module-b', reply: string | false = GO, said?: string) => releaseShown(fixture, { module: id, page: modulePage(id === 'module-a' ? SPLIT_NAMES.moduleA : SPLIT_NAMES.moduleB) }, reply, said)
const agreeMark = /^人在对话里同意（record_human_answer call-\d+）$/
const changedStage = (node: Awaited<ReturnType<MainAgentFixture['node']>>, to: string) => node.history.filter(entry => entry.op === 'edit' && entry.changes?.stage?.to === to)

test('kind release: the human agrees to the design of a goal that is not split, and what they were shown is approved and the goal released, each write with their words as relay', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  await releaseShown(fixture)
  const value = valueOfOk(await recordRelease(fixture))
  assert.deepEqual([value.outcome, value.stage, value.approved, value.skipped, value.module, value.modules], ['released', 'release', ['decision-1', 'task-1'], undefined, undefined, undefined])
  assert.match(String(value.message), /^Recorded: the human released the design of goal-1, and goal-1 is at stage release\./)
  for (const id of ['decision-1', 'task-1']) {
    const entry = (await fixture.node(id)).history.at(-1)!
    assert.deepEqual([entry.op, entry.actor, entry.relay, entry.to], ['approve', 'llm', GO, 'approved'], id)
    assert.match(entry.reason ?? '', agreeMark, id)
  }
  const goal = await fixture.node('goal-1')
  const stage = goal.history.at(-1)!
  assert.deepEqual([goal.stage, stage.op, stage.actor, stage.relay, stage.changes], ['release', 'edit', 'llm', GO, { stage: { from: 'design', to: 'release' } }])
  assert.match(stage.reason ?? '', agreeMark, 'a goal that is not split has no page, so no digest')
  assert.equal(answerKindOf(stage), 'agree')
})

test('kind release: a proposal that changed after the human saw it is skipped and the stage does not move; one added after is listed; the same words finish it once the design is shown again', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  await releaseShown(fixture)
  await fixture.engine.apply('llm', { op: 'edit', id: 'task-1', rev: (await fixture.engine.load()).revisions.get('task-1'), set: { acceptance: ['记一条能读回，改过了'] }, reason: '改' })
  await fixture.engine.apply('llm', { op: 'propose', reason: '新', node: { type: 'task', id: 'task-2', title: '写汇总', parent: 'goal-1', acceptance: ['能汇总'], edges: [{ type: 'source', to: 'decision-1' }] } })
  const value = valueOfOk(await recordRelease(fixture))
  assert.deepEqual([value.outcome, value.stage, value.approved, value.skipped], ['partial', undefined, ['decision-1'], [{ id: 'task-1', code: 'stale_revision' }]])
  assert.match(String(value.message), /the stage of goal-1 did not move.*task-1 \(stale_revision\).*2 proposal\(s\) are still waiting \(task-1, task-2\)/)
  assert.deepEqual([(await fixture.node('goal-1')).stage, (await fixture.node('task-1')).status, (await fixture.node('task-2')).status, (await fixture.node('decision-1')).status], ['design', 'proposed', 'proposed', 'approved'])
  // The design is shown again as it is now, the human nods once more, and the rest is released: what is approved already is not approved twice.
  await releaseShown(fixture, {}, '好的，这回放行')
  const done = valueOfOk(await recordRelease(fixture, { words: ['好的，这回放行'] }))
  assert.deepEqual([done.outcome, done.approved], ['released', ['task-1', 'task-2']])
  assert.equal((await fixture.node('decision-1')).history.filter(entry => entry.op === 'approve').length, 1)
  assert.equal((await fixture.node('goal-1')).stage, 'release')
})

test('kind release: the gate is checked again at the answer, so a design that changed after it was shown is not released, and nothing is written', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  await releaseShown(fixture)
  await fixture.engine.apply('llm', { op: 'edit', id: 'task-1', rev: (await fixture.engine.load()).revisions.get('task-1'), set: { acceptance: null }, reason: '改' })
  const before = (await fixture.engine.load()).revision
  const error = errorOf(await recordRelease(fixture))
  assert.equal(error.code, 'gate_unmet')
  assert.match(error.message, /missing: 任务「写记账命令」怎样算做完$/)
  assert.equal((await fixture.engine.load()).revision, before)
})

test('kind release: only the release that was put to the human in this session is recorded: not another goal\'s, not the goal\'s when a module\'s was shown, not a module\'s when the goal\'s was', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  const before = (await fixture.engine.load()).revision
  const notShown = errorOf(await recordRelease(fixture))
  assert.deepEqual([notShown.code, notShown.field], ['not_shown', 'goal'])
  assert.match(notShown.hint, /show it with propose_to_human first, in this session/)
  await framework(fixture)
  assert.equal(valueOfOk(await recordRelease(fixture)).outcome, 'released')
  const settled = (await fixture.engine.load()).revision
  assert.notEqual(settled, before)
  // A module of the released framework: only its own release counts.
  await moduleShown(fixture, 'module-a', GO)
  const other = errorOf(await recordRelease(fixture, { module: 'module-b' }))
  assert.deepEqual([other.code, other.field], ['not_shown', 'module'])
  // Only module-a was put to the human: neither the release of the goal itself nor that of module-b is theirs to have agreed to.
  const separate = await mainAgentWithGoal()
  await writeDesign(separate, 'split')
  await frameworkReleased(separate)
  await moduleShown(separate, 'module-a')
  assert.deepEqual([errorOf(await recordRelease(separate, {})).code, errorOf(await recordRelease(separate, { module: 'module-b' })).code], ['not_shown', 'not_shown'])
  const goalLevel = errorOf(await recordRelease(fixture, {}))
  assert.equal(goalLevel.code, 'invalid', 'the goal is released: its own release is over')
  assert.equal((await fixture.engine.load()).revision, settled)
  const missing = errorOf(await recordRelease(fixture, { goal: 'goal-9' }))
  assert.deepEqual([missing.code, missing.field], ['not_found', 'goal'])
})

test('kind release: words the human did not say after the release was put to them are refused, and the graph does not move', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  await fixture.host.say(fixture.agent, '之前说过：全部放行')
  await releaseShown(fixture)
  const before = (await fixture.engine.load()).revision
  for (const words of [['我编的一句话'], ['全部放行'], [GO, '再编一句']]) {
    const error = errorOf(await recordRelease(fixture, { words }))
    assert.deepEqual([error.code, error.field], ['invalid', 'words'], words.join('|'))
  }
  assert.equal((await fixture.engine.load()).revision, before)
  assert.deepEqual([(await fixture.node('goal-1')).stage, (await fixture.node('task-1')).status], ['design', 'proposed'])
})

test('kind release: adding or rejecting notes the human\'s words on the goal and moves nothing; the design is put to them again after it is changed', async () => {
  for (const [answer, mark, outcome] of [['add', ANSWER_MARKS.add, 'added'], ['reject', ANSWER_MARKS.reject, 'rejected']] as const) {
    const fixture = await mainAgentWithGoal()
    await writeDesign(fixture, 'small')
    const said = '补充：月底的汇总按金额从大到小排'
    await releaseShown(fixture, {}, said)
    const value = valueOfOk(await recordRelease(fixture, { answer, words: [said], recordedAs: '汇总按金额排序' }))
    assert.equal(value.outcome, outcome)
    assert.equal(value.stage, undefined)
    assert.match(String(value.message), /put it to them again with propose_to_human \(kind release\)\.$/)
    const goal = await fixture.node('goal-1')
    assert.equal(goal.stage, 'design')
    const note = goal.history.at(-1)!
    assert.deepEqual([note.op, note.actor, note.relay], ['comment', 'llm', undefined])
    assert.ok(note.text?.startsWith(mark))
    assert.match(note.text ?? '', /「补充：月底的汇总按金额从大到小排」；主 Agent 记成：汇总按金额排序（record_human_answer call-\d+）$/)
    assert.equal((await fixture.node('decision-1')).status, 'proposed')
  }
})

test('kind release: a sample shown with the design must have been whole in what the main agent said before the human can agree to it', async () => {
  const sample = '方案：用本地文件存账\n任务：写记账命令'
  const whole = await mainAgentWithGoal()
  await writeDesign(whole, 'small')
  await releaseShown(whole, { sample })
  assert.equal(valueOfOk(await recordRelease(whole)).outcome, 'released')
  const missing = await mainAgentWithGoal()
  await writeDesign(missing, 'small')
  await releaseShown(missing, { sample }, GO, RELEASE_TEXT)
  const before = (await missing.engine.load()).revision
  const error = errorOf(await recordRelease(missing))
  assert.equal(error.code, 'not_shown')
  assert.match(error.message, /has not seen the whole page or sample they must see before agreeing/)
  assert.equal((await missing.engine.load()).revision, before)
  assert.equal(valueOfOk(await recordRelease(missing, { answer: 'add', recordedAs: '先给他看全文' })).outcome, 'added')
})

test('kind release: the shape of the call; the fields of the other kinds are refused and nothing is written', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'small')
  await releaseShown(fixture)
  const before = (await fixture.engine.load()).revision
  for (const [patch, field] of [[{ question: 'question-1' }, 'question'], [{ way: 1 }, 'way'], [{ scope: '代码风格' }, 'scope'], [{ undo: true }, 'undo'], [{ goal: undefined }, 'goal'], [{ goal: '' }, 'goal'], [{ module: '' }, 'module'], [{ module: 7 }, 'module'], [{ answer: undefined }, 'answer'], [{ recordedAs: '' }, 'recordedAs'], [{ words: [] }, 'words']] as const) {
    const error = errorOf(await recordRelease(fixture, patch))
    assert.deepEqual([error.code, error.field], ['invalid', field], JSON.stringify(patch))
  }
  const named = errorOf(await recordRelease(fixture, { module: 'task-1' }))
  assert.deepEqual([named.code, named.field], ['invalid', 'module'], 'a goal that is not split has no module')
  assert.equal((await fixture.engine.load()).revision, before)
})

// ---- a goal split into modules: the release of the framework

test('kind release, the framework of a goal split into modules: the candidates get the stage design, then everything shown is approved, then the goal is released; what is below a module stays a proposal', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await framework(fixture)
  const value = valueOfOk(await recordRelease(fixture))
  assert.deepEqual([value.outcome, value.stage, value.modules, value.approved], ['released', 'release', ['module-a', 'module-b'], ['decision-fw', 'norm-directions', 'module-a', 'module-b']])
  assert.match(String(value.message), /^Recorded: the human released the framework, the module list and the directions of goal-1\. module-a, module-b are modules now, each in design/)
  const graph = await fixture.engine.load()
  const goal = graph.nodes.get('goal-1')!
  assert.deepEqual(modulesOf(graph, goal).map(module => [module.id, module.status, module.stage]), [['module-a', 'approved', 'design'], ['module-b', 'approved', 'design']])
  for (const id of ['decision-a', 'task-a', 'decision-b', 'task-b']) assert.equal(graph.nodes.get(id)!.status, 'proposed', id)
  for (const id of ['decision-fw', 'norm-directions']) assert.equal(graph.nodes.get(id)!.status, 'approved', id)
  // Every write has the human's words; the stage of the goal names the page the human saw.
  for (const id of ['module-a', 'module-b']) {
    const history = graph.nodes.get(id)!.history
    assert.deepEqual(history.map(entry => entry.op), ['propose', 'edit', 'approve'], `${id}: the stage design is written while it is a proposal, then it is approved`)
    assert.deepEqual(history.slice(1).map(entry => [entry.relay, entry.changes?.stage?.to]), [[GO, 'design'], [GO, undefined]], id)
    for (const entry of history.slice(1)) assert.match(entry.reason ?? '', agreeMark, id)
  }
  const stage = goal.history.at(-1)!
  assert.deepEqual([goal.stage, stage.relay, stage.changes], ['release', GO, { stage: { from: 'design', to: 'release' } }])
  assert.match(stage.reason ?? '', new RegExp(`^人在对话里同意（record_human_answer call-\\d+） · 一页放行稿 ${pageDigest(FRAMEWORK_PAGE)}$`))
  assert.match(pageDigest(FRAMEWORK_PAGE), /^[0-9a-f]{8}$/)
  assert.equal(pageDigest(FRAMEWORK_PAGE), pageDigest(`  ${FRAMEWORK_PAGE.replaceAll('\n', '\r\n')}  `), 'the digest is of the page as texts are compared')
  assert.notEqual(pageDigest(FRAMEWORK_PAGE), pageDigest(modulePage('x')))
})

test('kind release, the framework: the whole page must have been in what the main agent said, to the character', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  const before = (await fixture.engine.load()).revision
  await framework(fixture, GO, RELEASE_TEXT)
  const absent = errorOf(await recordRelease(fixture))
  assert.deepEqual([absent.code, absent.hint.includes('show the text from propose_to_human again, verbatim')], ['not_shown', true])
  await framework(fixture, '好的', `${RELEASE_TEXT}\n\n${FRAMEWORK_PAGE.replace(SPLIT_NAMES.directions[0], `${SPLIT_NAMES.directions[0]}吧`)}`)
  assert.equal(errorOf(await recordRelease(fixture, { words: ['好的'] })).code, 'not_shown', 'one word changed')
  assert.equal((await fixture.engine.load()).revision, before)
  await framework(fixture, '好的，放行', `先说几句。\n${RELEASE_TEXT}\n\n${FRAMEWORK_PAGE}\n后面还有话。`)
  assert.equal(valueOfOk(await recordRelease(fixture, { words: ['好的，放行'] })).outcome, 'released')
})

test('kind release, the framework: the gate is checked again at the answer, so a framework that lost its directions after it was shown is not released, and nothing is written', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await framework(fixture)
  await fixture.engine.apply('human', { op: 'reject', id: 'norm-directions', rev: (await fixture.engine.load()).revisions.get('norm-directions'), reason: '不要了' })
  const before = (await fixture.engine.load()).revision
  const gap = errorOf(await recordRelease(fixture))
  assert.deepEqual([gap.code, gap.message.includes('人定过的方向清单')], ['gate_unmet', true])
  assert.equal((await fixture.engine.load()).revision, before)
  assert.deepEqual([(await fixture.node('module-a')).status, (await fixture.node('goal-1')).stage], ['proposed', 'design'])
})

test('kind release, the framework: a candidate changed after the human saw it is skipped, the others are released, and the goal stays in design', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  assert.ok((await fixture.engine.apply('llm', { op: 'edit', id: 'module-a', rev: (await fixture.engine.load()).revisions.get('module-a'), set: { stage: 'release' }, reason: '自己写的' })).ok)
  await framework(fixture)
  assert.ok((await fixture.engine.apply('llm', { op: 'edit', id: 'module-a', rev: (await fixture.engine.load()).revisions.get('module-a'), set: { title: '记账（改名）' }, reason: '改名' })).ok)
  const value = valueOfOk(await recordRelease(fixture))
  assert.deepEqual([value.outcome, value.stage, value.skipped, value.modules], ['partial', undefined, [{ id: 'module-a', code: 'stale_revision' }], ['module-b']])
  const graph = await fixture.engine.load()
  assert.deepEqual([graph.nodes.get('module-a')!.status, graph.nodes.get('module-a')!.stage, graph.nodes.get('module-b')!.status, graph.nodes.get('module-b')!.stage, graph.nodes.get('goal-1')!.stage], ['proposed', 'release', 'approved', 'design', 'design'])
  assert.equal(isSplit(graph, graph.nodes.get('goal-1')!), true)
})

test('kind release, the framework: a candidate that already has the stage design gets no second write, and one the main agent gave another stage is set to design, never left released', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  assert.ok((await fixture.engine.apply('llm', { op: 'edit', id: 'module-a', rev: (await fixture.engine.load()).revisions.get('module-a'), set: { stage: 'release' }, reason: '自己写的' })).ok)
  assert.ok((await fixture.engine.apply('llm', { op: 'edit', id: 'module-b', rev: (await fixture.engine.load()).revisions.get('module-b'), set: { stage: 'design' }, reason: '自己写的' })).ok)
  await framework(fixture)
  assert.equal(valueOfOk(await recordRelease(fixture)).outcome, 'released')
  assert.deepEqual(changedStage(await fixture.node('module-a'), 'design').map(entry => entry.changes?.stage), [{ from: 'release', to: 'design' }])
  assert.equal(changedStage(await fixture.node('module-b'), 'design').length, 1, 'only the main agent\'s own write, none of the harness\'s')
  assert.deepEqual([(await fixture.node('module-a')).stage, (await fixture.node('module-b')).stage], ['design', 'design'])
})

/** A process that stops at the nth write of the graph store: the same failure the writes of a confirmation are tried with. */
const stopAt = whileWriteFails

test('kind release, the framework: a stop at any of the four points leaves a goal that is still split, and the same words finish it after the design is shown again', async () => {
  // The writes of one agreement, in order: 1, 2 the stage design of the candidates; 3 to 6 the approvals (the framework decision, the directions, the candidates); 7 the stage of the goal.
  const stops = [[2, 'a', ['module-a']], [3, 'b', ['module-a', 'module-b']], [6, 'c', ['module-a', 'module-b']], [7, 'd', ['module-a', 'module-b']]] as const
  for (const [nth, name, designed] of stops) {
    const fixture = await mainAgentWithGoal()
    await writeDesign(fixture, 'split')
    await framework(fixture)
    const error = errorOf(await stopAt(nth, () => recordRelease(fixture)))
    assert.equal(error.code, 'unavailable', name)
    assert.match(error.hint, /already on the graph: .*; record the same words again to finish it; the human said: 可以，放行$/, name)
    const stopped = await fixture.engine.load()
    const goal = stopped.nodes.get('goal-1')!
    assert.equal(isSplit(stopped, goal), true, `${name}: the goal is still split`)
    assert.equal(goal.stage, 'design', name)
    for (const id of ['module-a', 'module-b']) {
      const entry = stopped.nodes.get(id)!
      assert.ok(!(entry.status === 'approved' && entry.stage === undefined), `${name}: no module is approved without its stage (${id})`)
    }
    assert.deepEqual(['module-a', 'module-b'].filter(id => stopped.nodes.get(id)!.stage === 'design'), designed, name)
    // Shown again: the page is required (the candidates are candidates whether or not they have the stage yet), then the same human words finish it.
    const bare = await fixture.host.callTool(fixture.agent, PROPOSE_TO_HUMAN, { kind: 'release', goal: 'goal-1', text: RELEASE_TEXT })
    assert.deepEqual(bare.kind === 'error' ? [bare.error.code, bare.error.field, bare.error.message.includes('not split')] : [], ['invalid', 'page', false], name)
    const again = await framework(fixture, '好的，再放行一次')
    if (name === 'd') assert.deepEqual(again.releaseSet, [], 'everything is approved already: nothing is left to approve')
    const done = valueOfOk(await recordRelease(fixture, { words: ['好的，再放行一次'] }))
    assert.deepEqual([done.outcome, done.stage], ['released', 'release'], name)
    const graph = await fixture.engine.load()
    for (const id of ['module-a', 'module-b']) {
      const entry = graph.nodes.get(id)!
      assert.deepEqual([entry.status, entry.stage], ['approved', 'design'], `${name}: ${id}`)
      assert.equal(changedStage(entry, 'design').length, 1, `${name}: ${id} got the stage design once`)
      assert.equal(entry.history.filter(item => item.op === 'approve').length, 1, `${name}: ${id} is approved once`)
    }
    assert.equal(graph.nodes.get('goal-1')!.stage, 'release', name)
    for (const id of ['decision-a', 'task-a', 'decision-b', 'task-b']) assert.equal(graph.nodes.get(id)!.status, 'proposed', `${name}: ${id}`)
  }
})

// ---- the release of one module

test('kind release of a module: what is below it is approved and its stage is released with the page it was shown by; the other module, the directions and the goal are not touched', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  const goalBefore = await fixture.node('goal-1')
  await moduleShown(fixture, 'module-a')
  const value = valueOfOk(await recordRelease(fixture, { module: 'module-a' }))
  assert.deepEqual([value.outcome, value.stage, value.module, value.approved, value.modules], ['released', 'release', 'module-a', ['decision-a', 'task-a'], undefined])
  assert.match(String(value.message), /^Recorded: the human released module module-a of goal-1\./)
  const graph = await fixture.engine.load()
  for (const id of ['decision-a', 'task-a']) {
    const entry = graph.nodes.get(id)!.history.at(-1)!
    assert.deepEqual([entry.op, entry.relay], ['approve', GO], id)
  }
  const module = graph.nodes.get('module-a')!
  assert.deepEqual([module.stage, module.history.at(-1)!.relay, module.history.at(-1)!.changes], ['release', GO, { stage: { from: 'design', to: 'release' } }])
  assert.match(module.history.at(-1)!.reason ?? '', new RegExp(`^人在对话里同意（record_human_answer call-\\d+） · 一页放行稿 ${pageDigest(modulePage(SPLIT_NAMES.moduleA))}$`))
  assert.deepEqual(['decision-b', 'task-b'].map(id => graph.nodes.get(id)!.status), ['proposed', 'proposed'])
  assert.equal(graph.nodes.get('module-b')!.stage, 'design')
  assert.deepEqual(graph.nodes.get('goal-1'), goalBefore, 'the goal and the directions are not touched')
})

test('kind release of a module: a node changed after the human saw it is skipped and the module stays in design; a page that is not whole is not agreed to; adding notes the module', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  await moduleShown(fixture, 'module-a')
  await fixture.engine.apply('llm', { op: 'edit', id: 'task-a', rev: (await fixture.engine.load()).revisions.get('task-a'), set: { acceptance: ['能用，改过'] }, reason: '改' })
  const partial = valueOfOk(await recordRelease(fixture, { module: 'module-a' }))
  assert.deepEqual([partial.outcome, partial.stage, partial.skipped, partial.approved], ['partial', undefined, [{ id: 'task-a', code: 'stale_revision' }], ['decision-a']])
  assert.match(String(partial.message), /^Recorded, but the stage of module module-a of goal-1 did not move/)
  assert.match(String(partial.message), /put it to them again with propose_to_human \(kind release, module module-a\)\.$/)
  assert.equal((await fixture.node('module-a')).stage, 'design')
  await moduleShown(fixture, 'module-a', '好的，放行', `${RELEASE_TEXT}\n\n${modulePage(SPLIT_NAMES.moduleA).slice(0, -3)}`)
  const before = (await fixture.engine.load()).revision
  assert.equal(errorOf(await recordRelease(fixture, { module: 'module-a', words: ['好的，放行'] })).code, 'not_shown')
  assert.equal((await fixture.engine.load()).revision, before)
  const said = '补充：先做记录再做汇总'
  await moduleShown(fixture, 'module-a', said)
  const added = valueOfOk(await recordRelease(fixture, { module: 'module-a', answer: 'add', words: [said], recordedAs: '先记录后汇总' }))
  assert.equal(added.outcome, 'added')
  const note = (await fixture.node('module-a')).history.at(-1)!
  assert.deepEqual([note.op, note.relay, (await fixture.node('module-a')).stage], ['comment', undefined, 'design'])
  assert.ok(note.text?.startsWith(ANSWER_MARKS.add))
  assert.equal((await fixture.node('goal-1')).history.some(entry => entry.op === 'comment' && entry.text?.startsWith(ANSWER_MARKS.add)), false, 'the note is on the module, not on the goal')
})

test('kind release of a module: a stop between the approvals and the stage leaves the module in design with its design approved, and the same words finish it after it is shown again', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  await moduleShown(fixture, 'module-a')
  const error = errorOf(await stopAt(3, () => recordRelease(fixture, { module: 'module-a' })))
  assert.equal(error.code, 'unavailable')
  assert.match(error.hint, /already on the graph: decision-a is approved; task-a is approved; record the same words again/)
  assert.deepEqual([(await fixture.node('module-a')).stage, (await fixture.node('task-a')).status], ['design', 'approved'])
  const again = await moduleShown(fixture, 'module-a', '好的，再放行')
  assert.deepEqual(again.releaseSet, [], 'nothing is left to approve, and the module has its design: it is released with nothing new on the graph')
  assert.equal(valueOfOk(await recordRelease(fixture, { module: 'module-a', words: ['好的，再放行'] })).outcome, 'released')
  assert.equal((await fixture.node('module-a')).stage, 'release')
})

test('a module sent back to design by the main agent is released again with nothing new on the graph, once its design is shown again; the return is not the human\'s agreement', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  await moduleShown(fixture, 'module-a')
  valueOfOk(await recordRelease(fixture, { module: 'module-a' }))
  const { host, agent } = fixture
  // The module is not in design now, so a release of it is refused until it is sent back.
  const early = await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'release', goal: 'goal-1', text: RELEASE_TEXT, module: 'module-a', page: modulePage(SPLIT_NAMES.moduleA) })
  assert.deepEqual(early.kind === 'error' ? [early.error.code, early.error.field] : [], ['invalid', 'module'])
  const send = { id: 'module-a', rev: (await fixture.engine.load()).revisions.get('module-a'), set: { stage: 'design' }, reason: '方向要改：先记录再汇总' }
  assert.equal((await host.preExecute(agent, 'graph_edit', send)).kind, 'allow', 'the rule lets the main agent do it')
  assert.ok((await fixture.engine.apply('llm', { op: 'edit', ...send })).ok, 'and the engine asks no words of it')
  const sent = (await fixture.node('module-a')).history.at(-1)!
  assert.deepEqual([sent.actor, sent.relay, sent.changes], ['llm', undefined, { stage: { from: 'release', to: 'design' } }])
  assert.equal(answerKindOf(sent), undefined, 'a return is not read as the human agreeing')
  await moduleShown(fixture, 'module-a', '好的，再放行')
  assert.equal(valueOfOk(await recordRelease(fixture, { module: 'module-a', words: ['好的，再放行'] })).outcome, 'released')
  assert.equal(changedStage(await fixture.node('module-a'), 'release').length, 2, 'released, sent back, released again')
})

test('the framework of a goal sent back to design is released again with only the new candidate written: the module that is released keeps its stage', async () => {
  const fixture = await mainAgentWithGoal()
  await writeDesign(fixture, 'split')
  await frameworkReleased(fixture)
  await moduleShown(fixture, 'module-a')
  valueOfOk(await recordRelease(fixture, { module: 'module-a' }))
  const { engine } = fixture
  // The human says the framework has to change: the goal goes back to design with their words, and a third module is proposed.
  await fixture.host.say(fixture.agent, '框架要改，加一个导出的模块')
  const back = { id: 'goal-1', rev: (await engine.load()).revisions.get('goal-1'), set: { stage: 'design' }, reason: '框架要改', relay: '框架要改，加一个导出的模块' }
  assert.match(denied(await fixture.host.preExecute(fixture.agent, 'graph_edit', { ...back, relay: '我编的一句话' })), /^The words you relayed are not in a message the human sent/, 'words the human did not say do not send the goal back')
  assert.equal((await fixture.host.preExecute(fixture.agent, 'graph_edit', back)).kind, 'allow', 'their words are checked and are theirs')
  assert.ok((await engine.apply('llm', { op: 'edit', ...back })).ok)
  // The goal is in design again: a subagent of the main agent only reads, in the module that was released too.
  const verdict = releaseVerdict(await engine.load(), 'task-a')
  assert.match(verdict.kind === 'deny' ? verdict.violation : 'allowed', /design loop at stage design \(goal goal-1\)/)
  await engine.apply('llm', { op: 'propose', reason: '加模块', node: { type: 'feature', id: 'module-c', title: '导出', parent: 'goal-1', edges: [{ type: 'source', to: 'decision-fw' }] } })
  const page = `${FRAMEWORK_PAGE}\n新加的模块：导出。`
  await releaseShown(fixture, { page }, '可以，这样放行')
  const done = valueOfOk(await recordRelease(fixture, { words: ['可以，这样放行'] }))
  assert.deepEqual([done.outcome, done.modules, done.approved], ['released', ['module-c'], ['module-c']])
  const graph = await engine.load()
  assert.deepEqual(['module-a', 'module-b', 'module-c'].map(id => [graph.nodes.get(id)!.status, graph.nodes.get(id)!.stage]), [['approved', 'release'], ['approved', 'design'], ['approved', 'design']])
  assert.equal(changedStage(graph.nodes.get('module-a')!, 'design').length, 1, 'the module released before is not written again')
  assert.equal(graph.nodes.get('goal-1')!.stage, 'release')
})