/**
 * A no that is still in force, seen and checked (project graph node
 * m5-habit-rule, M5 design §3.8): the memory index and memory_query list the
 * live noes; an ask whose description shares at least MAYBE_DECLINED_SHARE
 * of its words with a live no is refused as maybe_declined, naming the no;
 * an ask resent with notSame: true goes through, and the ask record and a
 * metrics `count` event name the no it set aside. The pairs are the two real
 * re-asks of 2026-11-06 (.agents/tasks/m5/habit-rule-runs.md) and five
 * habits that are not the declined one.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { TalkView } from '../src/memory/answers.ts'
import { MAYBE_DECLINED_SHARE } from '../src/memory/habit.ts'
import { renderIndex } from '../src/memory/recall.ts'
import { HABIT_NOT_SAME } from '../src/memory/tools.ts'
import type { EmittedEvent, MetricsWhere } from '../src/shared/metrics.ts'
import { journalRecords, MAIN, refusalOf, withFixture, type MemoryFixture } from './memory-helpers.ts'

const T0 = Date.parse('2026-11-01T12:00:00Z')
const MINUTE = 60_000
const DAY = 86_400_000
const NO = '不用，这个不用记。'
const BODY = 'Strings use one kind of quote.\n**Why:** guessed from the person\'s edits.\n**How to apply:** follow it in new code.'

interface Habit {
  readonly name: string
  readonly scope: 'project' | 'all'
  readonly description: string
  readonly question: string
}

/** The person's task a minute before the first ask, then their no a minute after it. */
const talk: TalkView = {
  people: [{ seq: 1, time: T0 - MINUTE, text: 'the task' }, { seq: 2, time: T0 + MINUTE, text: NO }],
  shown: [],
}

const ask = (memory: MemoryFixture, habit: Habit, extra: Record<string, unknown> = {}) =>
  memory.call('memory_habit', { action: 'ask', ...habit, body: BODY, ...extra }, MAIN)

/** Ask `first` and record the person's no to it. */
async function declined(memory: MemoryFixture, first: Habit): Promise<void> {
  assert.equal((await ask(memory, first)).asked, true)
  assert.equal((await memory.call('memory_habit', { action: 'decline', name: first.name, words: [NO] }, MAIN)).declined, true)
}

const recordsOf = (memory: MemoryFixture, scope: 'project' | 'all') => journalRecords(scope === 'project' ? memory.places.project! : memory.places.user!)

const SQ: Habit = { name: 'python-single-quotes', scope: 'project', description: 'Python 字符串字面量统一用单引号，不用双引号', question: '以后我写 Python 也统一用单引号写字符串？' }

/** The two real re-asks: the first habit was declined in session 1, the second asked in session 2. */
const POSITIVES: ReadonlyArray<readonly [string, Habit, Habit]> = [
  ['GLM-5.3 (all, then project)', { name: 'python-single-quote-strings', scope: 'all', description: 'Python 代码中的字符串使用单引号，而非双引号', question: 'Python 字符串统一用单引号，要记下来吗？' }, SQ],
  ['GLM-5.3-Flash (both project)', { name: 'prefer-single-quotes', scope: 'project', description: 'Python 字符串字面量统一用单引号，不用双引号', question: '以后我写 Python 代码，字符串都统一用单引号，可以吗？' },
    { name: 'python-single-quotes', scope: 'project', description: 'Python 代码里字符串一律用单引号，不用双引号', question: '以后这个项目的 Python 代码都默认用单引号吗？' }],
]

/** Habits that are not the declined SQ: the first three share most words with it, the last two do not. */
const NEGATIVES: ReadonlyArray<readonly [string, Habit, boolean]> = [
  ['same tool, opposite preference', { name: 'python-double-quotes', scope: 'project', description: 'Python 字符串字面量统一用双引号，不用单引号', question: '以后我写 Python 都统一用双引号写字符串？' }, true],
  ['same rule, other language', { name: 'js-single-quotes', scope: 'project', description: 'JavaScript 字符串字面量统一用单引号，不用双引号', question: '以后我写 JavaScript 也统一用单引号写字符串？' }, true],
  ['different scope, same wording', { name: 'python-single-quotes-all', scope: 'all', description: 'Python 字符串字面量统一用单引号，不用双引号', question: '所有项目里写 Python 都统一用单引号吗？' }, true],
  ['unrelated, shares common words', { name: 'python-four-spaces', scope: 'project', description: 'Python 代码统一用四个空格缩进，不用制表符', question: '以后 Python 代码都用四个空格缩进吗？' }, false],
  ['unrelated', { name: 'commit-in-english', scope: 'all', description: 'Commit messages stay in English', question: '以后提交说明都写成英文，好吗？' }, false],
]

test('the threshold sits between the real re-asks and the unrelated habit that shares common words', () => {
  assert.equal(MAYBE_DECLINED_SHARE, 0.25)
})

for (const [label, first, second] of POSITIVES) {
  test(`a real re-ask after a no is refused as maybe_declined, naming the no: ${label}`, () => withFixture(async (memory) => {
    await declined(memory, first)
    const refused = await refusalOf(ask(memory, second))
    assert.equal(refused.code, 'maybe_declined')
    assert.equal(refused.field, 'description')
    assert.ok(refused.message.includes(first.name) && refused.message.includes(first.description) && refused.message.includes(new Date(T0 + 28 * DAY).toISOString().slice(0, 10)), refused.message)
    assert.match(refused.hint ?? '', /drop the ask/)
    assert.match(refused.hint ?? '', /notSame: true/)
    assert.ok(!recordsOf(memory, second.scope).some(record => record.op === 'ask' && record.data.name === second.name), 'nothing was asked')
  }, { talk }))
}

for (const [label, second, close] of NEGATIVES) {
  test(`a different habit after a no ${close ? 'is refused once and goes through with notSame, recorded with the no' : 'is asked as before'}: ${label}`, () => {
    const events: Array<{ event: EmittedEvent, where: MetricsWhere }> = []
    return withFixture(async (memory) => {
      await declined(memory, SQ)
      if (!close) {
        const asked = await ask(memory, second)
        assert.equal(asked.asked, true)
        assert.equal(asked.notSame, undefined)
        assert.equal(events.length, 0)
        return
      }
      assert.equal((await refusalOf(ask(memory, second))).code, 'maybe_declined')
      const asked = await ask(memory, second, { notSame: true })
      assert.equal(asked.asked, true)
      assert.deepEqual(asked.notSame, ['project:python-single-quotes'])
      const record = recordsOf(memory, second.scope).find(line => line.op === 'ask' && line.data.name === second.name)
      assert.deepEqual(record?.data.notSame, ['project:python-single-quotes'])
      assert.deepEqual(events.map(({ event }) => event), [{ k: 'count', by: 'memory', body: { what: HABIT_NOT_SAME, value: 1, byKey: { 'project:python-single-quotes': 1 } } }])
      assert.deepEqual(events[0]?.where, { sessionId: 'main-session', dir: 'C:/work/project' })
    }, { talk, emit: (event, where) => { events.push({ event, where }) } })
  })
}

test('notSame does not lift a no of the same name or group key, and an ask far from every no records no override', () => withFixture(async (memory) => {
  await declined(memory, SQ)
  assert.equal((await refusalOf(ask(memory, { ...SQ, question: '还是问一下：Python 统一用单引号吗？' }, { notSame: true }))).code, 'declined_recently')
  const far = await ask(memory, NEGATIVES[4][1], { notSame: true })
  assert.equal(far.notSame, undefined)
  assert.equal(recordsOf(memory, 'all').find(line => line.op === 'ask')?.data.notSame, undefined)
  assert.equal((await refusalOf(ask(memory, NEGATIVES[3][1], { notSame: 'yes' }))).code, 'invalid')
}, { talk }))

test('a no past its 28 days no longer refuses the close ask', () => withFixture(async (memory) => {
  await declined(memory, POSITIVES[0][1])
  memory.setNow(new Date(T0 + 29 * DAY))
  assert.equal((await ask(memory, SQ)).asked, true)
}, { talk: { ...talk, people: [...talk.people, { seq: 3, time: T0 + 29 * DAY - MINUTE, text: 'next task' }] } }))

test('memory_query lists the live noes whatever the focus, and not an expired one', () => withFixture(async (memory) => {
  await declined(memory, SQ)
  const answer = await memory.call('memory_query', { focus: 'unrelated words' }, MAIN)
  assert.deepEqual(answer.declined, [{ name: SQ.name, scope: 'project', description: SQ.description, until: new Date(T0 + 28 * DAY).toISOString() }])
  memory.setNow(new Date(T0 + 29 * DAY))
  assert.equal((await memory.call('memory_query', { focus: 'unrelated words' }, MAIN)).declined, undefined)
}, { talk }))

test('the index lists the live noes after the entries, one short line each, and an index with only noes is still given', () => {
  const until = new Date(T0 + 28 * DAY).toISOString()
  const index = renderIndex([], new Date(T0).toISOString(), [{ name: SQ.name, scope: 'project', description: SQ.description, until }])
  assert.ok(index !== undefined)
  assert.ok(index.text.includes('Habits the person said no to'), index.text)
  assert.ok(index.text.includes(`- ${SQ.name} — ${SQ.description} (not asked again until ${until.slice(0, 10)})`), index.text)
  assert.equal(renderIndex([], new Date(T0).toISOString(), []), undefined)
  const many = renderIndex([], new Date(T0).toISOString(), Array.from({ length: 12 }, (_, at) => ({ name: `habit-${at}`, scope: 'project' as const, description: `habit ${at}`, until })))
  assert.ok(many?.text.includes('2 more not listed.'))
  assert.equal(many?.text.split('\n').filter(line => line.startsWith('- habit-')).length, 10)
})
