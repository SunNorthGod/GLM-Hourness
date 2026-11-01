/**
 * The fixed words of a recorded answer (src/shared/answer-marks.ts; docs/
 * ORCHESTRATION.md §3.5, §3.7): the plain yes-words the harness and the
 * guide share, the start of a hand-over, and the node and ending of the
 * kinds the human handed to the main agent for good.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { TALK_GUIDE } from '../src/design/talk.ts'
import { AGREE_WORDS, ANSWER_MARKS, DELEGATED, DELEGATION_LIMIT, DELEGATION_REASON, DELEGATION_SUFFIX, DELEGATIONS_ID, answerKindOf, delegationKindOf, isPlainYes } from '../src/shared/answer-marks.ts'

test('isPlainYes: every word of the list, with white space and punctuation around it, and the number of a way', () => {
  for (const word of AGREE_WORDS) {
    assert.equal(isPlainYes(word), true, word)
    assert.equal(isPlainYes(`  ${word}。`), true, `${word} with white space and a full stop`)
    assert.equal(isPlainYes(`，${word}！`), true, `${word} with punctuation`)
  }
  for (const text of ['第二条', '第 2 条', '第三条', '第10条', '第十条']) assert.equal(isPlainYes(text), true, text)
})

test('isPlainYes: a short answer that is not plainly yes is not, the whole sentence is compared', () => {
  for (const text of ['嗯', '行吧', '差不多', '可以吧', '不可以', '好像可以', '可以，但是要加一条', '', '   ', '第条', '第二']) assert.equal(isPlainYes(text), false, text)
})

test('the guide lists exactly the words the harness reads', () => {
  const listed = [...TALK_GUIDE.matchAll(/「([^」]+)」/g)].map(match => match[1])
  for (const word of AGREE_WORDS) assert.ok(listed.includes(word), word)
  assert.ok(TALK_GUIDE.includes(`${AGREE_WORDS.map(word => `「${word}」`).join('')}「第 N 条」`))
})

test('the start of a hand-over and the reason of a delegation are not the words of an agreement', () => {
  assert.equal(DELEGATED, '交给主 Agent 定：')
  assert.equal(DELEGATION_REASON, '人在对话里把这一类交给主 Agent 定：')
  assert.equal(DELEGATION_REASON.startsWith(ANSWER_MARKS.agree), false, 'the panel must not read a delegation as the agreement to a proposal')
  assert.equal(answerKindOf({ op: 'edit', reason: `${DELEGATION_REASON}代码风格（record_human_answer call-1）` }), undefined)
  assert.equal(answerKindOf({ op: 'decide', reason: `${ANSWER_MARKS.agree}（record_human_answer call-1）` }), 'agree')
})

test('the kinds of norm-delegations: one node, one ending, the kind is the item without it', () => {
  assert.equal(DELEGATIONS_ID, 'norm-delegations')
  assert.equal(DELEGATION_SUFFIX, '：主 Agent 定，只告知')
  assert.equal(DELEGATION_LIMIT, 20)
  assert.equal(delegationKindOf(`代码风格${DELEGATION_SUFFIX}`), '代码风格')
  assert.equal(delegationKindOf('没有结尾的一项'), '没有结尾的一项')
})
