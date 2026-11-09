import assert from 'node:assert/strict'
import test from 'node:test'
import { PROPOSAL_LIMITS, codePointCount } from '../src/graph/proposal.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { askDraft, draftRefusal } from '../src/execute/asks.ts'
import type { Draft } from '../src/execute/asks.ts'

/** Every line but the title carries exactly one bold phrase (d-chat-not-cards). */
function assertOneBold(draft: Draft): void {
  for (const [name, line] of [['ask', draft.ask], ['background', draft.background], ['proposal', draft.proposal], ['doubt', draft.doubt], ['notTaken', draft.notTaken]] as const) {
    const marks = line.split('**').length - 1
    assert.equal(marks, 2, `${name} carries exactly one bold: ${line}`)
  }
  assert.equal(codePointCount(draft.title) <= 40, true, 'the title is at most 40 code points')
}

test('each kind words its facts and a draft that passes the landed checks as written', () => {
  const asks = [
    askDraft('review-stuck', { task: 'task-1', title: '写入范围的纯函数', rounds: 3, blocking: 2, files: ['src/execute/scope.ts'] }),
    askDraft('review-stuck', { task: 'task-1', title: '写入范围的纯函数', rounds: 2, blocking: 5, files: [] }),
    askDraft('check-stuck', { task: 'task-1', title: '合入的提交', attempt: 3, command: 'npm test', log: '.llm/execute/checks/abc/x/run.log' }),
    askDraft('acceptance-stuck', { goal: 'goal-1', title: '记账小工具', failing: ['每月的账能导出', '导出的表格带合计'] }),
    askDraft('acceptance-stuck', { goal: 'goal-1', title: '记账小工具', failing: [] }),
    askDraft('norm-ladder', { norm: 'norm-merge-gate', title: '依赖检查', direction: 'up', counts: '近 7 天拦下 4 次' }),
    askDraft('norm-ladder', { norm: 'norm-review-floor', title: '派活先定审查', direction: 'enforce', counts: '近 14 天影子记录 23 条' }),
    askDraft('norm-ladder', { norm: 'norm-merge-gate', title: '整点校验', direction: 'down', counts: '近 28 天没有拦过' }),
    askDraft('floor-add', { paths: ['src/graph/', 'src/execute/'], reworked: 2, declared: 5 }),
  ]
  for (const ask of asks) {
    assert.ok(ask.facts.length >= 1 && ask.facts.every(line => line.length > 0), ask.kind)
    assert.equal(draftRefusal(ask.draft), undefined, `${ask.kind}: ${JSON.stringify(ask.draft)}`)
    assertOneBold(ask.draft)
    // The plain words hold for every line the person reads.
    assert.deepEqual(plainWordsIn([ask.draft.title, ask.draft.background, ask.draft.proposal, ask.draft.doubt, ask.draft.notTaken].join('\n')), [])
  }
})

test('the review-stuck draft takes the design back when more than two findings stand, and one more round otherwise', () => {
  const again = askDraft('review-stuck', { task: 'task-1', title: 'x', rounds: 3, blocking: 2, files: [] })
  assert.ok(again.draft.proposal.includes('再修一轮'))
  const back = askDraft('review-stuck', { task: 'task-1', title: 'x', rounds: 3, blocking: 5, files: [] })
  assert.ok(back.draft.proposal.includes('设计'))
})

test('draftRefusal names what a broken draft got wrong', () => {
  const long = askDraft('review-stuck', { task: 'task-1', title: 'x', rounds: 3, blocking: 2, files: [] })
  const broken: Draft = { ...long.draft, background: '背景'.repeat(40) }
  const refusal = draftRefusal(broken)
  assert.ok(refusal !== undefined)
  assert.ok(refusal.message.includes('reason is longer than') || refusal.message.includes('longer'), refusal?.message)
  // A banned word fails the draft.
  const banned: Draft = { ...long.draft, doubt: '要是**验收**本身不对，再修也没用' }
  const wordRefusal = draftRefusal(banned)
  assert.ok(wordRefusal !== undefined && wordRefusal.message.includes('验收'), wordRefusal?.message)
  // The line limit is the propose record's.
  assert.equal(PROPOSAL_LIMITS.line, 60)
})
