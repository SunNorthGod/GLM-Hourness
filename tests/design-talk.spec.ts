/**
 * What the main agent's session shows of its talk with the human (src/design/
 * talk.ts, docs/ORCHESTRATION.md §3.5): which events are the human's own
 * messages, how the session log folds into the state, and when a quote counts
 * as something the human said. Pure functions over rc.3-shaped events; the
 * tools that use them are tested with the fake host in propose-to-human.spec.ts
 * and record-human-answer.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionEventLike } from '../src/shared/dsh-min.ts'
import { ANSWER_MARKS, answerCallOf, answerCallMark, answerKindOf } from '../src/shared/answer-marks.ts'
import { PROPOSE_TO_HUMAN, shownProposalOf } from '../src/shared/tool-names.ts'
import { GOAL_ATTACHMENT_TEXT, isPersonMessage, normalizeTalk, parseTalkState, personSaid, talkApply, talkFold, talkInit, type TalkState } from '../src/design/talk.ts'

let seq = 0
const event = (type: string, data: unknown, time: number): SessionEventLike => ({ type, seq: seq++, time, data })
const person = (text: string, time: number, source: Record<string, unknown> = { kind: 'user' }): SessionEventLike => event('user/message', { id: `u${seq}`, role: 'user', content: [{ type: 'text', text }], source }, time)
const said = (text: string, time: number, calls: readonly string[] = []): SessionEventLike => event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text }, ...calls.map(id => ({ type: 'tool-call', id, name: PROPOSE_TO_HUMAN, arguments: '{}' }))], source: { kind: 'model' } }, turn: 1 }, time)
const result = (callId: string, text: string, time: number, isError = false): SessionEventLike => event('tool/result', { message: { role: 'tool', content: [{ type: 'text', text }], toolCallId: callId, ...isError ? { isError } : {}, source: { kind: 'tool', callId } } }, time)
const shown = (kind: 'question' | 'confirm' | 'release', number: number, extra: Record<string, unknown> = {}): string => JSON.stringify({ tool: PROPOSE_TO_HUMAN, kind, goal: 'goal-1', number, text: '①', message: 'm', ...extra })

const fold = (events: readonly SessionEventLike[], header: { origin?: string } = {}, inherited = 0): TalkState => events.reduce(talkApply, talkInit(header, inherited))

test('a message the human sent is a user message with the user as its source and no form; notices, snapshots, commands and the /goal attachment line are not', () => {
  assert.equal(isPersonMessage(person('可以', 10)), true)
  assert.equal(isPersonMessage(person('可以', 10, { kind: 'user', rpcId: 'rpc-1' })), true)
  assert.equal(isPersonMessage(person('', 10)), true, 'a message of an image alone is still theirs')
  assert.equal(isPersonMessage(person('[拦下] x', 10, { kind: 'glm-design-bypass', form: 'notice' })), false)
  assert.equal(isPersonMessage(person('时间', 10, { kind: 'dsh-time-context', form: 'snapshot' })), false)
  assert.equal(isPersonMessage(person('时间', 10, { kind: 'user', form: 'notice' })), false)
  assert.equal(isPersonMessage(person('任务', 10, { kind: 'subagent-parent' })), false)
  assert.equal(isPersonMessage(person(GOAL_ATTACHMENT_TEXT, 10)), false)
  assert.equal(isPersonMessage(person(`  ${GOAL_ATTACHMENT_TEXT}\n`, 10)), false)
  assert.equal(isPersonMessage(person(`${GOAL_ATTACHMENT_TEXT} 另外一句`, 10)), true)
  assert.equal(isPersonMessage(event('command/run', { commandId: 'c', name: 'wish', source: { kind: 'user' } }, 10)), false)
  assert.equal(isPersonMessage(event('assistant/message', { message: { role: 'assistant', content: [] } }, 10)), false)
  assert.equal(isPersonMessage(event('user/message', 'not an object', 10)), false)
  assert.equal(isPersonMessage(event('user/message', { content: [{ type: 'text', text: 'x' }] }, 10)), false)
})

test('the text of a message is its text blocks joined by line breaks', () => {
  const two = event('user/message', { content: [{ type: 'text', text: '第一句' }, { type: 'image', url: 'x' }, { type: 'text', text: '第二句' }], source: { kind: 'user' } }, 10)
  assert.equal(fold([two]).people[0].text, '第一句\n第二句')
})

test('the fold keeps the human\'s messages in order, with when they came and whether the main agent had said it would record the answer', () => {
  const state = fold([person('先说一句', 10), said('那我记成：只给自己看', 20), person('对', 30), said('好', 40), person('另外', 50)])
  assert.deepEqual(state.people.map(message => [message.text, message.time, message.restated]), [['先说一句', 10, false], ['对', 30, true], ['另外', 50, false]])
})

test('a matter put to the human is kept when its tool result says so and the call is one of propose_to_human\'s', () => {
  const state = fold([
    said('我交给你一件事', 10, ['call-1']),
    result('call-1', shown('question', 1, { question: 'question-1' }), 11),
    said('背景：…\n你看呢？', 12),
  ])
  assert.equal(state.shown.length, 1)
  assert.deepEqual([state.shown[0].kind, state.shown[0].goal, state.shown[0].question, state.shown[0].number, state.shown[0].time], ['question', 'goal-1', 'question-1', 1, 11])
  assert.equal(state.shown[0].after, '背景：…\n你看呢？', 'what the main agent said after it')
  assert.equal(state.unparsed, 0)
})

test('the way of asking of a question and the sample its call carried are kept with the matter, whether the arguments are text or an object', () => {
  const call = (id: string, args: unknown): Record<string, unknown> => ({ type: 'tool-call', id, name: PROPOSE_TO_HUMAN, arguments: args })
  const sketch = event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: '草图在下面' }, call('c1', JSON.stringify({ kind: 'question', sample: '[页]\n  [钮]' })), call('c2', { kind: 'question', sample: '对象里的样稿' }), call('c3', 'not json')], source: { kind: 'model' } }, turn: 1 }, 10)
  const state = fold([
    sketch,
    result('c1', shown('question', 1, { question: 'question-1', form: 'look' }), 11),
    result('c2', shown('question', 2, { question: 'question-2', form: 'recommend' }), 12),
    result('c3', shown('question', 3, { question: 'question-3', form: 'sing' }), 13),
  ])
  assert.deepEqual(state.shown.map(entry => [entry.form, entry.exact]), [['look', '[页]\n  [钮]'], ['recommend', '对象里的样稿']])
  assert.equal(state.unparsed, 1, 'a result with a form that is not one of the four cannot be read')
})

test('the one-page note of a release is kept with the matter like a sample, the module of the release with it, and the revisions of the set', () => {
  const call = (id: string, args: unknown): Record<string, unknown> => ({ type: 'tool-call', id, name: PROPOSE_TO_HUMAN, arguments: args })
  const state = fold([
    event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: '这一页放行吗' }, call('c1', JSON.stringify({ kind: 'release', goal: 'goal-1', module: 'module-a', page: '一页：记账' })), call('c2', { kind: 'release', goal: 'goal-1' })], source: { kind: 'model' } }, turn: 1 }, 10),
    result('c1', shown('release', 1, { module: 'module-a', releaseSet: [{ id: 'decision-a', rev: 'r1' }] }), 11),
    result('c2', shown('release', 2, { releaseSet: [] }), 12),
  ])
  assert.deepEqual(state.shown.map(entry => [entry.kind, entry.module, entry.exact, entry.releaseSet]), [['release', 'module-a', '一页：记账', [{ id: 'decision-a', rev: 'r1' }]], ['release', undefined, undefined, []]])
})
test('only the result of a propose_to_human call counts: an error, another tool\'s result with the same text and an unknown call id do not', () => {
  const text = shown('question', 1)
  const state = fold([
    said('', 10, ['call-1']),
    result('call-1', 'Error: {"code":"invalid"}', 11, true),
    said('', 12),
    result('read-1', text, 13),
    result('call-9', text, 14),
  ])
  assert.deepEqual(state.shown, [])
  assert.equal(state.unparsed, 0)
})

test('a result of a propose_to_human call that cannot be read is counted, not kept', () => {
  const state = fold([said('', 10, ['call-1']), result('call-1', 'not json', 11), said('', 12, ['call-2']), result('call-2', JSON.stringify({ tool: PROPOSE_TO_HUMAN, kind: 'other', number: 1, text: 't' }), 13)])
  assert.deepEqual(state.shown, [])
  assert.equal(state.unparsed, 2)
})

test('what the main agent said is added to the matters shown since the human\'s last message, up to the next message of the human', () => {
  const state = fold([
    said('', 10, ['c1']), result('c1', shown('question', 1), 11),
    said('一件', 12),
    said('', 13, ['c2']), result('c2', shown('question', 2), 14),
    said('两件，你看呢？', 15),
    person('好', 16),
    said('记下了', 17),
  ])
  assert.deepEqual(state.shown.map(entry => entry.after), ['一件两件，你看呢？', '两件，你看呢？'])
})

test('what is said after the limit is cut and marked, once', () => {
  const long = '字'.repeat(15_990)
  const state = fold([said('', 10, ['c1']), result('c1', shown('question', 1), 11), said(long, 12), said('1234567890123456', 13), said('more', 14)])
  assert.equal([...state.shown[0].after].length, 16_000)
  assert.equal(state.shown[0].afterTruncated, true)
  assert.ok(state.shown[0].after.endsWith('1234567890'))
})

test('the last 16 calls and the last 64 matters are kept; the human\'s messages are cut from the oldest at 200,000 code points but the newest stays', () => {
  const calls = Array.from({ length: 20 }, (_, index) => `c${index}`)
  const state = fold([said('', 10, calls)])
  assert.deepEqual(state.calls.map(call => call.id), calls.slice(-16))
  let many = fold([said('', 10, ['c'])])
  for (let index = 0; index < 70; index++) many = talkApply(many, result('c', shown('question', 1, { question: `question-${index}` }), 11 + index))
  assert.equal(many.shown.length, 64)
  assert.equal(many.shown[0].question, 'question-6')
  const big = fold([person('一'.repeat(120_000), 10), person('二'.repeat(120_000), 11), person('短', 12)])
  assert.deepEqual(big.people.map(message => message.text.length), [120_000, 1])
  assert.equal(fold([person('三'.repeat(250_000), 10)]).people.length, 1, 'a single message over the limit is kept')
})

test('a delegated session records nothing, and a fork does not take its parent\'s messages as its own', () => {
  const events = [person('任务：看一下', 10), said('', 11, ['c1']), result('c1', shown('question', 1), 12)]
  assert.deepEqual(fold(events, { origin: 'subagent' }), talkInit({ origin: 'subagent' }, 0))
  // The log of a session numbers its events from 0; the first one was inherited.
  const forked = fold([person('父会话里人说的', 10), person('这个会话里人说的', 20)].map((entry, index) => ({ ...entry, seq: index })), {}, 1)
  assert.deepEqual(forked.people.map(message => message.text), ['这个会话里人说的'])
})

test('events the fold does not know leave the state as it was, and the fold of the log is the fold of its events', () => {
  const start = talkInit({}, 0)
  assert.equal(talkApply(start, event('turn/start', {}, 1)), start)
  assert.equal(talkApply(start, event('tool/result', 'odd', 1)), start)
  assert.equal(talkApply(start, event('assistant/message', { message: 'odd' }, 1)), start)
  const events = [person('可以', 10), said('好', 11)]
  assert.deepEqual(talkFold({}, events), fold(events))
})

test('a state is checked at the edges of the session projection', () => {
  const ok = talkInit({}, 0)
  assert.equal(parseTalkState(ok), ok)
  for (const bad of [null, 'x', { ...ok, people: 'no' }, { ...ok, inert: 1 }, { ...ok, unparsed: undefined }]) assert.throws(() => parseTalkState(bad), TypeError)
})

test('the result of propose_to_human is read by one function for every reader', () => {
  const ok = shownProposalOf(false, shown('release', 2, { module: 'module-a' }))
  assert.deepEqual([ok?.kind, ok?.goal, ok?.module, ok?.number], ['release', 'goal-1', 'module-a', 2])
  assert.equal(shownProposalOf(true, shown('question', 1)), undefined)
  assert.equal(shownProposalOf(false, 'Error: nope'), undefined)
  assert.equal(shownProposalOf(false, JSON.stringify({ tool: 'graph_show', kind: 'question', number: 1, text: 't' })), undefined)
  assert.equal(shownProposalOf(false, shown('question', 4)), undefined)
  assert.equal(shownProposalOf(false, JSON.stringify({ tool: PROPOSE_TO_HUMAN, kind: 'question', number: 1 })), undefined)
  assert.equal(shownProposalOf(false, '[1,2]'), undefined)
  assert.equal(shownProposalOf(false, 'null'), undefined)
})

// ---------------------------------------------------------------- personSaid

const humanSaid = (...messages: Array<readonly [string, number]>): TalkState => fold(messages.map(([text, time]) => person(text, time)))

test('a quote is a whole message, or a phrase of it from one punctuation mark, space or line break to the next', () => {
  const state = humanSaid(['可以，放行', 100], ['不可以', 110], ['嗯 就按推荐的来\n另外：数据只放在本机', 120])
  assert.deepEqual(personSaid(state, ['可以，放行'], 0), { ok: true, relay: '可以，放行' })
  assert.equal(personSaid(state, ['可以'], 0).ok, true, 'out of "可以，放行"')
  assert.equal(personSaid(state, ['放行'], 0).ok, true)
  assert.equal(personSaid(state, ['就按推荐的来'], 0).ok, true, 'from a space to a line break')
  assert.equal(personSaid(state, ['数据只放在本机'], 0).ok, true, 'after a colon')
  const off = personSaid(humanSaid(['不可以', 110]), ['可以'], 0)
  assert.equal(off.ok, false)
  assert.equal(off.ok === false && off.offBoundary, true, 'it is in the message but not as a phrase')
  assert.match(off.ok === false ? off.reason : '', /quote 1 is in a message the human sent, but not as a whole phrase/)
})

test('a quote that is nowhere in what the human sent is refused with its number, and an empty one too', () => {
  const state = humanSaid(['可以', 100])
  const none = personSaid(state, ['可以', '放行吧'], 0)
  assert.equal(none.ok, false)
  assert.equal(none.ok === false && none.offBoundary, false)
  assert.match(none.ok === false ? none.reason : '', /^quote 2 is not in any message the human sent/)
  assert.equal(personSaid(state, ['   '], 0).ok, false)
  assert.equal(personSaid(state, [], 0).ok, true, 'no quote asks for nothing; the tools require at least one')
})

test('only messages after the given time count', () => {
  const state = humanSaid(['可以', 100], ['不行', 200])
  assert.equal(personSaid(state, ['可以'], 99).ok, true)
  assert.equal(personSaid(state, ['可以'], 100).ok, false, 'a message at that very time was before the matter')
  assert.equal(personSaid(state, ['可以'], 150).ok, false)
  assert.equal(personSaid(state, ['不行'], 150).ok, true)
})

test('width, case-folding forms and white space do not matter, the relay is the quotes as given, and quotes may come from two messages', () => {
  const state = humanSaid(['ＯＫ，就这样\t放行', 100], ['再加一句：数据在本机', 110])
  assert.equal(personSaid(state, ['OK'], 0).ok, true, 'full-width letters')
  assert.equal(personSaid(state, ['就这样 放行'], 0).ok, true, 'a tab and a space')
  assert.deepEqual(personSaid(state, ['  ＯＫ ', '数据在本机'], 0), { ok: true, relay: '  ＯＫ \n数据在本机' })
  assert.equal(normalizeTalk(' a \n\t b '), 'a b')
})

// ---------------------------------------------------------------- answer marks

test('the three replies are told apart by the start of the reason or the note; the call that wrote them is read from its mark', () => {
  assert.equal(answerKindOf({ op: 'decide', reason: `${ANSWER_MARKS.agree}${answerCallMark('call-7')}` }), 'agree')
  assert.equal(answerKindOf({ op: 'approve', reason: `${ANSWER_MARKS.agree}（record_human_answer call-7） · 已给人看原文 abc` }), 'agree')
  assert.equal(answerKindOf({ op: 'edit', reason: ANSWER_MARKS.agree }), 'agree')
  assert.equal(answerKindOf({ op: 'comment', text: `${ANSWER_MARKS.add}「另外」；主 Agent 记成：加一条` }), 'add')
  assert.equal(answerKindOf({ op: 'comment', text: `${ANSWER_MARKS.reject}「不行」` }), 'reject')
  assert.equal(answerKindOf({ op: 'comment', text: '普通批注' }), undefined)
  assert.equal(answerKindOf({ op: 'decide', reason: '我定的' }), undefined)
  assert.equal(answerKindOf({ op: 'comment', text: `${ANSWER_MARKS.agree}` }), undefined, 'an agreement is a decision, not a note')
  assert.equal(answerKindOf({ op: 'decide' }), undefined)
  assert.equal(answerCallOf({ reason: `${ANSWER_MARKS.agree}（record_human_answer call-7） · 已给人看原文 abc` }), 'call-7')
  assert.equal(answerCallOf({ text: `${ANSWER_MARKS.add}「x」；主 Agent 记成：y（record_human_answer call-9）` }), 'call-9')
  assert.equal(answerCallOf({ reason: '没有记号' }), undefined)
})
