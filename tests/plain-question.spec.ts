/**
 * Plain words for the human (docs/ORCHESTRATION.md §3.5; decisions
 * d-plain-questions and d-ask-three-gates): the word list, one worked example
 * of each way of asking and the guide that carries both into the tool
 * description of propose_to_human. The examples go through the same checks as
 * a real question, so a change to a rule or a limit fails them here.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PLAIN_QUESTION_EXAMPLES, PLAIN_QUESTION_GUIDE, PLAIN_WORDS, PLAIN_WORDS_GUIDE, plainWordsIn } from '../src/graph/plain-question.ts'
import { ASK_FORMS, askTextRefusal, proposalRecordRefusal, renderAsk, textCoversRecord } from '../src/graph/proposal.ts'
import { PLAIN_LIMITS } from '../src/graph/schema.ts'
import { exampleRecord } from './proposal-examples.ts'

const codePoints = (text: string): number => [...text].length

test('the word list has the five entries the person was confused by, each with what to say instead', () => {
  assert.deepEqual(PLAIN_WORDS.map(entry => entry.avoid), [['验收', 'acceptance'], ['标定', 'calibration'], ['门禁', 'gate'], ['投影', 'projection'], ['补遗', '附录', 'addendum']])
  assert.deepEqual(PLAIN_WORDS.map(entry => entry.say), ['怎样算做完', '练习题', '合入前的检查', '每一步给 agent 的项目摘要', '说清它是什么'])
})

test('plainWordsIn: Chinese words by substring, English words by whole word, any case', () => {
  assert.deepEqual(plainWordsIn('这一步的验收和标定都过了'), ['验收', '标定'])
  assert.deepEqual(plainWordsIn('补遗、附录'), ['补遗', '附录'])
  assert.deepEqual(plainWordsIn('Acceptance and the GATE'), ['acceptance', 'gate'])
  assert.deepEqual(plainWordsIn('a calibration run, an Addendum, a projection'), ['calibration', 'projection', 'addendum'])
  assert.deepEqual(plainWordsIn('the gateway and sessionProjections and acceptances'), [], 'a longer word is not the word')
  assert.deepEqual(plainWordsIn('(gate)'), ['gate'], 'punctuation is a boundary')
  assert.deepEqual(plainWordsIn('怎样算做完，合入前的检查，练习题'), [], 'the plain words themselves are clean')
  assert.deepEqual(plainWordsIn(''), [])
})

test('there is one example for each way of asking', () => {
  assert.deepEqual(Object.keys(PLAIN_QUESTION_EXAMPLES), [...ASK_FORMS])
})

test('every example passes the checks a real question passes: plain words, the text, the record, the record inside the text', () => {
  for (const form of ASK_FORMS) {
    const example = PLAIN_QUESTION_EXAMPLES[form]
    const record = exampleRecord(form)
    const texts = [example.title, example.text, example.proposal ?? '', example.reason ?? '', example.cost ?? '', example.notTaken ?? '', ...example.ways ?? [], example.sample ?? '']
    for (const text of texts) assert.deepEqual(plainWordsIn(text), [], `${form}: ${text}`)
    assert.equal(askTextRefusal(form, example.text), undefined, form)
    assert.equal(proposalRecordRefusal(record), undefined, form)
    assert.equal(textCoversRecord(example.text, record, form), undefined, form)
    assert.ok(codePoints(example.title) <= PLAIN_LIMITS.title, `${form}: title`)
  }
})

test('the examples show what each way of asking needs', () => {
  const { recommend, choose, want, look } = PLAIN_QUESTION_EXAMPLES
  assert.ok(recommend.cost !== undefined && recommend.reason !== undefined && recommend.ways === undefined, 'recommend: a reason and a real cost')
  assert.equal(choose.proposal, undefined, 'choose leaves proposal to the harness')
  assert.ok(choose.ways !== undefined && choose.ways.length === 2 && choose.reason !== undefined)
  assert.ok(want.text.includes('我猜') && want.text.includes('对吗'), 'want offers a guess to correct')
  assert.ok(look.sample !== undefined && look.sample.includes('\n'), 'look carries a sketch that needs its line breaks')
})

test('the guide: the four examples as the human reads them, then the word list', () => {
  assert.ok(codePoints(PLAIN_QUESTION_GUIDE) <= 1200, `${codePoints(PLAIN_QUESTION_GUIDE)} code points`)
  assert.ok(PLAIN_QUESTION_GUIDE.includes('made-up'), 'the examples are not matters to raise')
  for (const form of ASK_FORMS) {
    assert.ok(PLAIN_QUESTION_GUIDE.includes(`${form}:`), form)
    const example = PLAIN_QUESTION_EXAMPLES[form]
    assert.ok(PLAIN_QUESTION_GUIDE.includes(renderAsk(example.text, 1, example.ways, example.sample, true)), `${form}: the text the human reads`)
  }
  assert.ok(PLAIN_QUESTION_GUIDE.endsWith(PLAIN_WORDS_GUIDE))
  for (const { avoid, say } of PLAIN_WORDS) {
    // The fifth entry's replacement is an instruction, not a phrase: the guide says it in English.
    assert.ok(PLAIN_WORDS_GUIDE.includes(say === '说清它是什么' ? 'say what the document is' : say), say)
    for (const word of avoid) assert.ok(PLAIN_WORDS_GUIDE.includes(word), word)
  }
  assert.ok(PLAIN_WORDS_GUIDE.includes('(for a goal: 怎样算做成)'))
})
