/**
 * The habit questions and the relay check (M5 design §3.8, acceptance m5-4
 * items 4 to 7, H1): the ask, its caps and its repeats, the confirm and the
 * decline against the person's real words, the `store` record that names a
 * question, and the `relay` of a preference checked against the person's
 * latest message. The tools run over real journals in temporary directories
 * (tests/memory-helpers.ts); the talk state is given directly, and the
 * fixture's clock drives both the tools and the journal's stamps.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { applyRecord } from '../src/memory/model.ts'
import { readScope } from '../src/memory/storage.ts'
import type { TalkView } from '../src/memory/answers.ts'
import { memoryTools } from '../src/memory/tools.ts'
import { agentOf, journalRecords, MAIN, refusalOf, runTool, withFixture, type MemoryFixture } from './memory-helpers.ts'

const T0 = Date.parse('2026-11-01T12:00:00Z')
const MINUTE = 60_000
const DAY = 86_400_000

const HABIT = {
  name: 'commit-in-english',
  scope: 'all',
  description: 'Write commit messages in English',
  body: 'Commit messages stay in English.\n**Why:** the person asked for it.\n**How to apply:** write the subject and the body in English.',
  question: '以后提交说明都写成英文，好吗？',
}

const REPLY = '好，都写成英文吧'
const OTHER_REPLY = '提交说明随意，不用改'
const WITHDRAWAL = '提交说明不用再写英文了'
const TASK = 'the first task of the session'

/** The person's messages around the ask: the task a minute before it, then the replies a minute apart; `shown` matters were put to them since their last message. */
const talkOf = (replies: readonly string[], minutesBeforeAsk = 1, shown = 0): TalkView => ({
  people: [
    { seq: 1, time: T0 - minutesBeforeAsk * MINUTE, text: TASK },
    ...replies.map((text, index) => ({ seq: index + 2, time: T0 + (index + 1) * MINUTE, text })),
  ],
  shown: Array.from({ length: shown }, (_, index) => ({ seq: 10 + index })),
})

const withMemory = withFixture

const records = journalRecords

const stateOf = async (memory: MemoryFixture, scope: 'project' | 'all') => {
  const read = await readScope(scope, scope === 'project' ? memory.places.project! : memory.places.user!)
  assert.ok(read.ok)
  return read.read.state
}

// --- ask --------------------------------------------------------------------

test('an ask records the question and returns the text the person reads: the circled number, the question, and the content on a second line', () => withMemory(async (memory) => {
  const asked = await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  assert.equal(asked.asked, true)
  assert.equal(asked.number, 1)
  assert.equal(asked.text, `① ${HABIT.question}\n要记的：${HABIT.description}`)
  const [record] = records(memory.places.user!)
  assert.deepEqual([record?.op, record?.actor, record?.id], ['ask', 'llm', 'all:commit-in-english'])
  assert.deepEqual([record?.data.name, record?.data.scope, record?.data.description, record?.data.body, record?.data.question], [HABIT.name, HABIT.scope, HABIT.description, HABIT.body, HABIT.question])
  assert.deepEqual([record?.by?.session, record?.by?.tool], ['main-session', 'memory_habit'])
}, { talk: talkOf([]) }))

test('a question behind proposals of the same reply carries their number, and the reply keeps at most three questions together', () => withMemory(async (memory) => {
  assert.equal((await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)).number, 2)
  assert.equal((await memory.call('memory_habit', { action: 'ask', ...HABIT, name: 'second-habit', question: '代码评审先给结论，好吗？', description: 'Lead with the conclusion' }, MAIN)).number, 3)
  const refused = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT, name: 'third-habit', question: '每周只开一次会，好吗？', description: 'One meeting a week' }, MAIN))
  assert.deepEqual([refused.code, refused.field], ['too_many', undefined])
  assert.match(refused.hint ?? '', /after the propose_to_human calls/)
  assert.equal(records(memory.places.user!).length, 2, 'nothing was written')
}, { talk: talkOf([], 1, 1) }))

test('words of the avoided list in the question or the description are refused with what to say instead; a secret in the fields is refused', () => withMemory(async (memory) => {
  const plain = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT, question: '验收标准都用测试来写，好吗？' }, MAIN))
  assert.equal(plain.code, 'plain_words')
  assert.equal(plain.field, 'question')
  assert.ok(plain.hint?.includes('怎样算做完') === true, plain.hint)
  const plainDescription = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT, description: ' acceptance rules in tests' }, MAIN))
  assert.equal(plainDescription.field, 'description')
  const secret = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT, body: 'The token is ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8.\n**Why:** said.' }, MAIN))
  assert.deepEqual([secret.code, secret.field], ['secret_like', 'body'])
  assert.ok(!existsSync(join(memory.places.user!, 'memory.jsonl')), 'nothing was written')
}, { talk: talkOf([]) }))

test('without the person\'s messages nothing is asked and nothing is written; a child is refused by role', () => withMemory(async (memory) => {
  const refused = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN))
  assert.equal(refused.code, 'unavailable')
  assert.ok(!existsSync(join(memory.places.user!, 'memory.jsonl')))
  const child = agentOf('child-1', { cwd: 'C:/work/project', subagent: true })
  assert.equal((await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT }, child))).code, 'role')
}, {}))

test('a habit that is already an active memory under the same name answers known', () => withMemory(async (memory) => {
  const { question: _question, ...stated } = HABIT
  await memory.call('memory_store', { ...stated, type: 'feedback', relay: TASK })
  const known = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN))
  assert.equal(known.code, 'known')
  assert.deepEqual(records(memory.places.user!).map(record => record.op), ['store'], 'nothing was asked')
}, { talk: talkOf([]) }))

test('an open ask with the same group key answers asked_recently even under another name and other words', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT, learnedFrom: ['edit:goal.stage'] }, MAIN)
  const second = { action: 'ask', name: 'message-language', scope: 'all', description: 'Everything written into the repo stays in English', body: HABIT.body, question: '提交信息统一用英文写，行吗？', learnedFrom: ['edit:goal.stage'] }
  const again = await refusalOf(memory.call('memory_habit', second, MAIN))
  assert.equal(again.code, 'asked_recently')
  assert.equal(records(memory.places.user!).length, 1)
  memory.setNow(new Date(T0 + 27 * DAY))
  assert.equal((await refusalOf(memory.call('memory_habit', second, MAIN))).code, 'asked_recently', 'an unanswered question still holds on day 27')
  memory.setNow(new Date(T0 + 29 * DAY))
  assert.equal((await memory.call('memory_habit', second, MAIN)).asked, true, 'and no longer on day 29')
}, { talk: talkOf([]) }))

test('a no blocks the same habit for 28 days by group key: still refused on day 27, askable on day 29', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT, learnedFrom: ['edit:goal.stage'] }, MAIN)
  assert.equal((await memory.call('memory_habit', { action: 'decline', name: 'commit-in-english', words: [OTHER_REPLY] })).declined, true)
  memory.setNow(new Date(T0 + 27 * DAY))
  const tooSoon = await refusalOf(memory.call('memory_habit', { action: 'ask', name: 'message-language', scope: 'all', description: 'Everything written into the repo stays in English', body: HABIT.body, question: '提交信息统一用英文写，行吗？', learnedFrom: ['edit:goal.stage'] }, MAIN))
  assert.equal(tooSoon.code, 'declined_recently')
  memory.setNow(new Date(T0 + 29 * DAY))
  const later = await memory.call('memory_habit', { action: 'ask', name: 'message-language', scope: 'all', description: 'Everything written into the repo stays in English', body: HABIT.body, question: '提交信息统一用英文写，行吗？', learnedFrom: ['edit:goal.stage'] }, MAIN)
  assert.equal(later.asked, true)
  const state = await stateOf(memory, 'all')
  assert.equal(state.declined.get('commit-in-english')?.until, new Date(T0 + 28 * DAY).toISOString())
  assert.ok(state.asks.has('message-language'), 'the second ask is the open question of its name')
}, { talk: talkOf([OTHER_REPLY]) }))

test('a confirmed habit the person withdrew is known for 28 days from the withdrawal, by group key: confirmed on day 0, withdrawn on day 20, refused on days 27, 30 and 47, askable on day 49', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT, learnedFrom: ['edit:goal.stage'] }, MAIN)
  assert.equal((await memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [REPLY] }, MAIN)).confirmed, true)
  memory.setNow(new Date(T0 + 20 * DAY))
  const owner = await refusalOf(memory.call('memory_forget', { name: 'commit-in-english', reason: 'the agent takes it back' }, MAIN))
  assert.equal(owner.code, 'preference_owner', 'the asking session cannot forget the confirmed habit without the person\'s words')
  assert.equal((await memory.call('memory_forget', { name: 'commit-in-english', reason: 'the person withdrew the habit', relay: WITHDRAWAL }, MAIN)).forgotten, true)
  const again = { action: 'ask', name: 'message-language', scope: 'all', description: 'Everything written into the repo stays in English', body: HABIT.body, question: '提交信息统一用英文写，行吗？', learnedFrom: ['edit:goal.stage'] }
  for (const day of [27, 30, 47]) {
    memory.setNow(new Date(T0 + day * DAY))
    const answer = await memory.call('memory_habit', again, MAIN).then(() => 'asked', (error: Error) => (JSON.parse(error.message) as { code: string }).code)
    assert.equal(answer, 'known', `day ${day}`)
  }
  memory.setNow(new Date(T0 + 49 * DAY))
  assert.equal((await memory.call('memory_habit', again, MAIN)).asked, true, 'day 49: 29 days after the withdrawal')
  assert.deepEqual(records(memory.places.user!).map(record => record.op), ['ask', 'store', 'forget', 'ask'])
}, { talk: talkOf([REPLY, WITHDRAWAL]) }))

test('the fourth question of a week is week_cap, and the next week has room again', () => withMemory(async (memory) => {
  for (const [index, question] of ['提交说明都写成英文，好吗？', '代码评审先给结论，好吗？', '每周只开一次会，好吗？'].entries()) {
    assert.equal((await memory.call('memory_habit', { action: 'ask', ...HABIT, name: `habit-${index}`, question, description: `habit ${index}` }, MAIN)).asked, true)
  }
  const fourth = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT, name: 'habit-3', question: '提交前都跑一遍检查，好吗？', description: 'run the checks' }, MAIN))
  assert.equal(fourth.code, 'week_cap')
  memory.setNow(new Date(T0 + 7 * DAY))
  assert.equal((await memory.call('memory_habit', { action: 'ask', ...HABIT, name: 'habit-3', question: '提交前都跑一遍检查，好吗？', description: 'run the checks' }, MAIN)).asked, true)
  }, { talk: talkOf([REPLY]) }))

test('the field rules of an ask: kebab-case name, one-line question of 10 to 90 code points ending in a question mark, Why line, scope, learnedFrom keys', () => withMemory(async (memory) => {
  for (const [over, field] of [
    [{ name: 'x' }, 'name'],
    [{ question: '短吗？' }, 'question'],
    [{ question: `${'这个问句特别长'.repeat(20)}，好吗？` }, 'question'],
    [{ question: '第一行\n第二行，好吗？' }, 'question'],
    [{ question: '这句话结尾没有问号' }, 'question'],
    [{ body: 'no reason line' }, 'body'],
    [{ scope: undefined }, 'scope'],
    [{ learnedFrom: [' edit:goal.stage'] }, 'learnedFrom'],
    [{ extra: 1 }, 'extra'],
  ] as const) {
    const refused = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT, ...over }, MAIN))
    assert.equal(refused.field, field, JSON.stringify(over))
  }
  assert.equal((await refusalOf(memory.call('memory_habit', { action: 'wink' }, MAIN))).code, 'invalid')
}, { talk: talkOf([]) }))

// --- confirm ----------------------------------------------------------------

test('a confirm stores what was asked as a preference that never fades, with the person\'s words and the question kept', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT, learnedFrom: ['edit:goal.stage'] }, MAIN)
  const confirmed = await memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [REPLY], description: 'Something else', body: 'Other content.\n**Why:** made up.' }, MAIN)
  assert.deepEqual([confirmed.confirmed, confirmed.name, confirmed.scope, confirmed.question, confirmed.updated], [true, 'commit-in-english', 'all', HABIT.question, false])
  const [ask, store] = records(memory.places.user!)
  assert.deepEqual([ask?.op, store?.op], ['ask', 'store'])
  assert.deepEqual([store?.data.description, store?.data.body], [HABIT.description, HABIT.body], 'confirm stores the content the question carried; it has no field that changes it')
  assert.equal(store?.relay, REPLY)
  assert.equal(store?.data.ask, HABIT.question)
  assert.equal(store?.data.relayChecked, true)
  assert.deepEqual(store?.data.learnedFrom, ['edit:goal.stage'])
  const state = await stateOf(memory, 'all')
  const entry = state.entries.get('commit-in-english')
  assert.equal(entry?.confirmed?.question, HABIT.question)
  assert.equal(entry?.confirmed?.body, HABIT.body)
  assert.equal(entry?.confirmed?.ask, 'all:commit-in-english')
  assert.equal(entry?.kind, 'preference')
  assert.ok(!state.asks.has('commit-in-english'), 'the question is answered and closed')
  const again = await refusalOf(memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN))
  assert.equal(again.code, 'known', 'the confirmed habit is known')
}, { talk: talkOf([REPLY]) }))

test('the words must be in the person\'s first message after the question: not in it, or only in a later one, is words_not_found', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  const absent = await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [OTHER_REPLY] }, MAIN))
  assert.deepEqual([absent.code, absent.field], ['words_not_found', 'words'])
  const second = await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: ['说得也对'] }, MAIN))
  assert.equal(second.code, 'words_not_found')
  assert.equal(records(memory.places.user!).length, 1, 'nothing was stored')
}, { talk: talkOf([REPLY, '说得也对']) }))

test('a reply that carries a secret-looking stretch is refused with field words and the question stays open', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  const secret = await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: ['可以，令牌是 ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'] }, MAIN))
  assert.deepEqual([secret.code, secret.field], ['secret_like', 'words'])
  const state = await stateOf(memory, 'all')
  assert.ok(state.asks.has('commit-in-english'), 'the ask stays open')
  assert.equal(records(memory.places.user!).length, 1)
}, { talk: talkOf(['可以，令牌是 ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8']) }))

test('confirm needs the ask of the same session, inside seven days, and a reply after the question', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  assert.equal((await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [REPLY] }, agentOf('other-session', { cwd: 'C:/work/project' })))).code, 'other_session')
  assert.equal((await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [REPLY] }, MAIN))).code, 'not_answered')
  memory.setNow(new Date(T0 + 8 * DAY))
  assert.equal((await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [REPLY] }, MAIN))).code, 'lapsed')
  assert.equal((await refusalOf(memory.call('memory_habit', { action: 'confirm', name: 'no-such-habit', words: [REPLY] }, MAIN))).code, 'no_ask')
  assert.equal(records(memory.places.user!).length, 1)
}, { talk: talkOf([]) }))

test('a decline records the person\'s words and the question', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  const declined = await memory.call('memory_habit', { action: 'decline', name: 'commit-in-english', words: [OTHER_REPLY] }, MAIN)
  assert.equal(declined.declined, true)
  assert.equal(declined.until, new Date(T0 + 28 * DAY).toISOString())
  const [, decline] = records(memory.places.user!)
  assert.deepEqual([decline?.op, decline?.relay, decline?.data.question], ['decline', OTHER_REPLY, HABIT.question])
  const state = await stateOf(memory, 'all')
  assert.equal(state.declined.get('commit-in-english')?.description, HABIT.description)
  assert.ok(!state.asks.has('commit-in-english'))
}, { talk: talkOf([OTHER_REPLY]) }))

// --- the relay of memory_store ----------------------------------------------

test('a preference whose words are in the person\'s latest message is stored checked; words only in an earlier message are relay_not_said', () => withMemory(async (memory) => {
  const { question: _question, ...stated } = HABIT
  const stored = await memory.call('memory_store', { ...stated, name: 'stated-directly', type: 'feedback', relay: REPLY })
  assert.equal(stored.stored, true)
  const [record] = records(memory.places.user!)
  assert.equal(record?.data.relayChecked, true)
  const earlier = await refusalOf(memory.call('memory_store', { ...stated, name: 'from-an-earlier-message', type: 'feedback', relay: TASK }))
  assert.deepEqual([earlier.code, earlier.field], ['relay_not_said', 'relay'])
  assert.match(earlier.hint ?? '', /latest message/)
  assert.equal(records(memory.places.user!).length, 1)
}, { talk: talkOf([REPLY]) }))

test('updating a confirmed habit without the person\'s messages is unavailable and stores nothing; their latest words update it and keep the confirmation', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  await memory.call('memory_habit', { action: 'confirm', name: 'commit-in-english', words: [REPLY] }, MAIN)
  const talkless = memoryTools({ ...memory.env, talk: () => undefined }).find(tool => tool.name === 'memory_store')!
  const update = { name: 'commit-in-english', type: 'feedback', scope: 'all', description: HABIT.description, body: HABIT.body, relay: 'something the person never said' }
  const refused = await refusalOf(runTool(new Map([['memory_store', talkless]]), 'memory_store', update))
  assert.equal(refused.code, 'unavailable')
  assert.equal(records(memory.places.user!).length, 2, 'nothing was written')
  const { question: _question, ...stated } = HABIT
  const updated = await memory.call('memory_store', { ...stated, name: 'commit-in-english', type: 'feedback', relay: REPLY })
  assert.equal(updated.updated, true)
  const state = await stateOf(memory, 'all')
  const entry = state.entries.get('commit-in-english')
  assert.equal(entry?.confirmed?.question, HABIT.question, 'the update keeps the confirmation')
  assert.equal(entry?.origin.actor, 'llm')
  assert.equal(entry?.origin.session, 'main-session', 'the update keeps the origin')
  const owner = await refusalOf(memory.call('memory_forget', { name: 'commit-in-english', reason: 'the agent takes it back' }, MAIN))
  assert.equal(owner.code, 'preference_owner', 'the same agent in the same session cannot forget the confirmed habit without the person\'s words')
  assert.equal(records(memory.places.user!).length, 3, 'nothing was written')
  assert.equal((await stateOf(memory, 'all')).entries.get('commit-in-english')?.status, 'active')
}, { talk: talkOf([REPLY]) }))

// --- the fold ---------------------------------------------------------------

test('the fold refuses a store that names a question that is not open, or that changes what was asked, or that was asked elsewhere or too long ago', () => withMemory(async (memory) => {
  await memory.call('memory_habit', { action: 'ask', ...HABIT }, MAIN)
  const state = await stateOf(memory, 'all')
  const store = (over: Record<string, unknown>, by: Record<string, unknown> = { session: 'main-session' }, at = T0 + MINUTE) =>
    applyRecord(state, { v: 1, seq: 2, at: new Date(at).toISOString(), actor: 'llm', relay: REPLY, by, op: 'store', id: 'all:commit-in-english', data: { ...HABIT, type: 'feedback', source: [], ...over } } as never)
  assert.ok('bad' in store({ ask: 'a question nobody asked' }), 'an unknown question')
  assert.ok('bad' in store({ description: 'changed', ask: HABIT.question }), 'changed content')
  assert.ok('bad' in store({ ask: HABIT.question }, {}), 'no session in by')
  assert.ok('bad' in store({ ask: HABIT.question }, { session: 'elsewhere' }), 'another session')
  assert.ok('bad' in store({ ask: HABIT.question }, { session: 'main-session' }, T0 + 8 * DAY), 'past the answer window')
  assert.ok('state' in store({ ask: HABIT.question }), 'the true confirm holds')
  const withEntry = store({ ask: HABIT.question })
  assert.ok('state' in withEntry)
  const confirmed = withEntry.state.entries.get('commit-in-english')
  assert.equal(confirmed?.confirmed?.question, HABIT.question)
  assert.ok(!withEntry.state.asks.has('commit-in-english'))
}, { talk: talkOf([]) }))
