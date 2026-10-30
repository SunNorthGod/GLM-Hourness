/**
 * Plain words for the human (docs/ORCHESTRATION.md §3.5; decision
 * d-plain-questions): the word list, the worked example of a proposal and the
 * guide that carries both into the main agent's system prompt.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PLAIN_QUESTION_EXAMPLE, PLAIN_QUESTION_GUIDE, PLAIN_WORDS, plainWordsIn } from '../src/graph/plain-question.ts'
import { renderProposal } from '../src/graph/proposal.ts'

// The line limits the example must meet: a proposal line has at most 40 code
// points once the bold marks are taken out, the background line at most 60
// (panel design 0.6 §5.3 PLAIN_LIMITS.background), the title at most 40.
// PLAIN_LIMITS and PROPOSAL_LIMITS arrive with proposalLineRefusal in step 6;
// the example then goes through that function and these literals go away.
const LINE_LIMIT = 40
const BACKGROUND_LIMIT = 60
const TITLE_LIMIT = 40

const codePoints = (text: string): number => [...text].length
const unbolded = (text: string): string => text.replaceAll('**', '')

const LINES = [
  ['background', PLAIN_QUESTION_EXAMPLE.background, BACKGROUND_LIMIT],
  ['proposal', PLAIN_QUESTION_EXAMPLE.proposal, LINE_LIMIT],
  ['doubt', PLAIN_QUESTION_EXAMPLE.doubt, LINE_LIMIT],
  ['notTaken', PLAIN_QUESTION_EXAMPLE.notTaken, LINE_LIMIT],
] as const

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

test('the example is the person\'s four-line layout, settled content, in plain words', () => {
  const { title } = PLAIN_QUESTION_EXAMPLE
  for (const [field, value] of [['title', title], ...LINES.map(([name, line]) => [name, line] as const)] as ReadonlyArray<readonly [string, string]>) assert.deepEqual(plainWordsIn(value), [], field)
  assert.ok(!title.includes('主 Agent'), 'the title is about the work dispatched, not about the main agent (d-main-agent-peak-exempt)')
  assert.ok(PLAIN_QUESTION_EXAMPLE.notTaken.includes('主 Agent 照常回你话'), 'the last line says the main agent answers on every level')
  assert.ok(codePoints(title) > 0 && codePoints(title) <= TITLE_LIMIT && !title.includes('*'), 'the title is one short line without bold')
  for (const [field, value, limit] of LINES) {
    assert.ok(!value.includes('\n') && value.trim() === value && value.length > 0, `${field} is one trimmed line`)
    assert.ok(!value.startsWith(`${field}：`), `${field} leaves out its label`)
    assert.ok(codePoints(unbolded(value)) <= limit, `${field}: ${codePoints(unbolded(value))} code points after the bold marks, limit ${limit}`)
    const bold = [...value.matchAll(/\*\*([^*]+)\*\*/g)]
    assert.equal(bold.length, 1, `${field} has exactly one bold span`)
    const inside = codePoints(bold[0]?.[1] ?? '')
    assert.ok(inside >= 2 && inside <= 12, `${field}: ${inside} code points in the bold span`)
    assert.notEqual(unbolded(value), bold[0]?.[1], `${field} is not bold all through`)
  }
  assert.equal(unbolded(PLAIN_QUESTION_EXAMPLE.background).includes('*'), false)
})

test('the guide: one layout sentence, the example printed as renderProposal prints it, the word list', () => {
  assert.ok(codePoints(PLAIN_QUESTION_GUIDE) <= 1000, `${PLAIN_QUESTION_GUIDE.length} code units`)
  assert.ok(PLAIN_QUESTION_GUIDE.includes('the example only shows the layout'), 'the example is not a matter to raise')
  const printed = renderProposal(PLAIN_QUESTION_EXAMPLE, 1)
  assert.ok(PLAIN_QUESTION_GUIDE.includes(printed))
  assert.equal(printed.split('\n\n').length, 5, 'title and four lines, each its own paragraph')
  assert.ok(printed.startsWith('① 高峰时段派出去的活怎么排\n\n背景：'))
  for (const { avoid, say } of PLAIN_WORDS) {
    // The fifth entry's replacement is an instruction, not a phrase: the guide says it in English.
    assert.ok(PLAIN_QUESTION_GUIDE.includes(say === '说清它是什么' ? 'say what the document is' : say), say)
    for (const word of avoid) assert.ok(PLAIN_QUESTION_GUIDE.includes(word), word)
  }
  assert.ok(PLAIN_QUESTION_GUIDE.includes('(for a goal: 怎样算做成)'))
  assert.equal(PLAIN_QUESTION_GUIDE.split('\n')[0]?.startsWith('Whatever you say to the human is in plain words.'), true)
})
