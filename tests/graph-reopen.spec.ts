import assert from 'node:assert/strict'
import { openEngine } from '../src/graph/engine.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { proposalLineRefusal } from '../src/graph/plan-text.ts'
import {
  REOPEN_ASK,
  REOPEN_LIMIT,
  reopenCount,
  reopenNotice,
  reopenNoticeFailed,
  reopenNoticeForSubagent,
  reopenQuestion,
  reopensAfter,
  thirdReworkReason,
  thirdReworkState,
} from '../src/graph/reopen.ts'
import { proposalRecordRefusal } from '../src/graph/proposal.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'
import { engineFixture, fixtureTest, must, type EngineFixture } from './graph-helpers.ts'

/**
 * goal-1 (stage design)
 *   feature-1 approved
 *     task-1 approved — the node the tests reopen
 */
async function fixture(): Promise<EngineFixture> {
  return engineFixture('graph-reopen-', 12, async ({ run }) => {
    await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '第三次修复', stage: 'design', acceptance: ['第 3 次重开问人'] } })
    await run('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '问人', parent: 'goal-1' } })
    await run('human', { op: 'propose', reason: '拆分', node: { type: 'task', title: '路径解析', parent: 'feature-1', acceptance: ['测试过'] } })
  })
}

const graphTest = fixtureTest(fixture)

/** A done node: the commit evidence the engine requires for done. */
const EVIDENCE = [{ kind: 'commit', ref: 'abc1234' }]

/** One 附 line the way reopen.ts writes it: the window ordinal, the moment at UTC+8, the escaped reason. */
function expectCite(ordinal: number, reason: string): string {
  return `- 第 ${ordinal} 次重新打开：10-12 16:00「${reason}」`
}

/** Take the node to done and reopen it `times` times — each reopen is one done-to-doing move; returns the node. */
async function reopens(g: EngineFixture, times: number, reason: string): Promise<GraphNode> {
  must(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '第一次完成', evidence: EVIDENCE }))
  for (let index = 0; index < times; index++) {
    if (index > 0) must(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: `第 ${index} 次修复完成`, evidence: EVIDENCE }))
    must(await g.act('llm', { op: 'status', id: 'task-1', to: 'doing', reason }))
  }
  return g.node('task-1')
}

graphTest('reopensAfter counts the done-to-doing moves after `since`, whoever wrote them, and not a work start', async g => {
  const node = await reopens(g, 2, '没修住')
  const counted = reopensAfter(node, undefined)
  assert.equal(counted.length, 2)
  assert.ok(counted.every(entry => entry.reason === '没修住'))
  // A second actor counts the same: the counting rule reads the history, not the writer.
  must(await g.act('human', { op: 'status', id: 'task-1', to: 'done', reason: '收', evidence: EVIDENCE }))
  must(await g.act('harness', { op: 'status', id: 'task-1', to: 'doing', reason: '人让再试一次' }))
  assert.equal(reopensAfter(await g.node('task-1'), undefined).length, 3)
  // Only the moves after `since` count.
  const since = counted[0]?.at
  assert.equal(reopensAfter(await g.node('task-1'), since).length, 2)
  // The first move to doing of an approved node is a work start, not a reopen.
  const fresh = await g.run('human', { op: 'propose', reason: '补', node: { type: 'task', title: '另一件', parent: 'feature-1' } })
  must(await g.act('llm', { op: 'status', id: fresh.id, to: 'doing', reason: '开工' }))
  assert.equal(reopensAfter(await g.node(fresh.id), undefined).length, 0)
  assert.equal(reopenCount(await g.node('task-1'), undefined), 3)
})

graphTest('a third-rework question is recognized by its history reason, with its text edited', async g => {
  await g.run('harness', { op: 'propose', reason: thirdReworkReason('task-1'), node: { type: 'question', parent: 'task-1', title: '第三方的问题', ask: '先停下查原因，可以吗？', form: 'recommend', proposal: '**先停下查原因**，查清了写进这件活再接着修', reason: '这件活**修过两次又被重新打开**，同一处反复修不好，常常是问题没找对', notTaken: '**直接接着修**，多半还要修第 4 次' } })
  const question = await g.node('question-1')
  // The body (and the ask) were edited afterwards: the recognition reads the history.
  await g.act('llm', { op: 'edit', id: 'question-1', set: { body: '被改过的正文', ask: '还是先停下查原因，可以吗？' }, reason: '改写法' })
  const edited = await g.node('question-1')
  assert.equal(thirdReworkState(await loadGraph(g.dir), 'task-1').open?.id, 'question-1')
  assert.notEqual(edited.body, question.body)
  // A question from another parent, and one of another kind, are not this node's.
  const state = thirdReworkState(await loadGraph(g.dir), 'feature-1')
  assert.equal(state.open, undefined)
})

graphTest('closedAt is the newest close of a closed question, and the count restarts from it', async g => {
  await reopens(g, 3, '没修住')
  const question = must(await openEngine(g.dir).apply('harness', { op: 'propose', reason: thirdReworkReason('task-1'), node: reopenQuestion(await g.node('task-1'), reopensAfter(await g.node('task-1'), undefined)).node }))
  // The human agrees: decide with their words as relay; the close moment is the decide.
  await g.act('human', { op: 'decide', id: question.id, conclusion: '先停下查原因', reason: '好，先查' })
  const closed = await g.node(question.id)
  const state = thirdReworkState(await loadGraph(g.dir), 'task-1')
  assert.equal(state.open, undefined)
  assert.equal(state.closedAt, closed.history.at(-1)?.at)
  // One more reopen: the count over the window since the close is one, not four.
  must(await g.act('llm', { op: 'status', id: 'task-1', to: 'done', reason: '又完成', evidence: EVIDENCE }))
  must(await g.act('llm', { op: 'status', id: 'task-1', to: 'doing', reason: '再开' }))
  const node = await g.node('task-1')
  assert.equal(reopenCount(node, state.closedAt), 1)
  assert.equal(reopensAfter(node, state.closedAt).length, 1)
})

graphTest('a dropped question counts as closed too', async g => {
  await reopens(g, 3, '没修住')
  const question = must(await openEngine(g.dir).apply('harness', { op: 'propose', reason: thirdReworkReason('task-1'), node: reopenQuestion(await g.node('task-1'), reopensAfter(await g.node('task-1'), undefined)).node }))
  await g.act('human', { op: 'status', id: question.id, to: 'dropped', reason: '不用定，接着修' })
  const state = thirdReworkState(await loadGraph(g.dir), 'task-1')
  assert.equal(state.open, undefined)
  assert.equal(state.closedAt, (await g.node(question.id)).history.at(-1)?.at)
})

graphTest('the question the design writes, word for word, passes the real engine with no option field', async g => {
  const node = await reopens(g, REOPEN_LIMIT, '没修住')
  const question = reopenQuestion(node, reopensAfter(node, undefined))
  // The verbatim title and the four lines (m4 design §4.6's table).
  assert.equal(question.title, '「路径解析」要修第 3 次了')
  assert.equal(question.node.title, '「路径解析」要修第 3 次了')
  assert.equal(question.node.reason, '这件活**修过两次又被重新打开**，同一处反复修不好，常常是问题没找对')
  assert.equal(question.node.proposal, '**先停下查原因**，查清了写进这件活再接着修')
  assert.equal(question.node.cost, '若**三次重开不是同一个问题**，接着修也行')
  assert.equal(question.node.notTaken, '**直接接着修**，多半还要修第 4 次')
  assert.equal(question.node.ask, REOPEN_ASK)
  assert.equal(question.node.form, 'recommend')
  assert.equal(question.reason, '第三次修复：task-1')
  // The four lines pass the four-line rules of plan-text.ts, under their design names.
  assert.equal(proposalLineRefusal('background', question.node.reason), undefined)
  assert.equal(proposalLineRefusal('proposal', question.node.proposal), undefined)
  assert.equal(proposalLineRefusal('doubt', question.node.cost), undefined)
  assert.equal(proposalLineRefusal('notTaken', question.node.notTaken), undefined)
  // The harness's own strings carry no plain-words word; the 附 is data (the node title and the reopens' reasons) and is not checked.
  assert.deepEqual([question.title, question.node.ask, question.node.reason, question.node.proposal, question.node.cost, question.node.notTaken].flatMap(plainWordsIn), [])
  // The record passes the proposal-shape rules the engine applies.
  assert.equal(proposalRecordRefusal(question.node), undefined)
  // F12: the real engine takes it — approved at once under the doing parent, no option field, the reason in the history.
  const filed = must(await openEngine(g.dir).apply('harness', { op: 'propose', reason: question.reason, node: question.node }))
  assert.equal(filed.node.status, 'approved')
  assert.equal(filed.node.parent, 'task-1')
  for (const field of ['options', 'recommend', 'crux', 'verdict', 'weight'] as const) {
    assert.equal(filed.node[field], undefined, `${field} is absent`)
  }
  const history = filed.node.history.at(-1)
  assert.equal(history?.op, 'propose')
  assert.equal(history?.actor, 'harness')
  assert.equal(history?.reason, '第三次修复：task-1')
})

graphTest('the 附 cites the three reopens with their moments and cut, escaped reasons', async g => {
  const node = await reopens(g, REOPEN_LIMIT, '测试在 Windows 上挂了 [task-1] <详见> `日志`')
  const question = reopenQuestion(node, reopensAfter(node, undefined))
  const lines = question.node.body.split('\n')
  assert.equal(lines.length, REOPEN_LIMIT)
  // The Markdown characters of the reason arrive escaped (design §4.6's body rule).
  assert.equal(lines[0], expectCite(1, '测试在 Windows 上挂了 \\[task-1\\] \\<详见\\> \\`日志\\`'))
  assert.match(lines[2], /^- 第 3 次重新打开：/)
  // A reason longer than 40 code points is cut, and the ordinal follows the window's place.
  const long = await engineFixture('graph-reopen-long-', 12, async ({ run }) => {
    await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '第三次修复', stage: 'design', acceptance: ['附 cite'] } })
    await run('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '问人', parent: 'goal-1' } })
    await run('human', { op: 'propose', reason: '拆分', node: { type: 'task', title: '路径解析', parent: 'feature-1' } })
  })
  const reopened = await reopens(long, 4, '这个理由非常长'.repeat(10))
  const cited = reopenQuestion(reopened, reopensAfter(reopened, undefined))
  const citedLines = cited.node.body.split('\n')
  assert.equal(citedLines.length, REOPEN_LIMIT, 'at most three lines of the window')
  assert.match(citedLines[0], /^- 第 2 次重新打开：/, 'the ordinals are the reopens\' place in the window')
  const reason = citedLines[0].slice(citedLines[0].indexOf('「') + 1, -1)
  assert.equal([...reason].length, 40)
})

graphTest('a title the human cannot read takes the fallback wording, the title goes to the 附 (F18)', async () => {
  for (const [title, expectedTitle, fallback] of [
    ['补齐验收条件', '这件活要修第 3 次了', true],
    ['收拾 gate.ts', '这件活要修第 3 次了', true],
    ['M4 guard 补齐与环境', '「M4 guard 补齐与环境」要修第 3 次了', false],
  ] as const) {
    const made = await engineFixture('graph-reopen-title-', 12, async ({ run }) => {
      await run('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '第三次修复', stage: 'design', acceptance: ['题目退路'] } })
      await run('human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '问人', parent: 'goal-1' } })
      await run('human', { op: 'propose', reason: '拆分', node: { type: 'task', title, parent: 'feature-1' } })
    })
    const reopened = await reopens(made, REOPEN_LIMIT, '没修住')
    const question = reopenQuestion(reopened, reopensAfter(reopened, undefined))
    assert.equal(question.title, expectedTitle)
    const lines = question.node.body.split('\n')
    if (fallback) assert.equal(lines[0], `- 这件活是「${title}」`)
    else assert.ok(lines[0]?.startsWith('- 第 1 次重新打开'), 'no title line in the 附')
    // The whole record still passes the engine's record rules.
    assert.equal(proposalRecordRefusal(question.node), undefined)
  }
  // plain-ui's second phase (plainIssues with the graph's ids) is not merged: the M<数字> case above passes plainWordsIn
  // today and takes the title path; when plainIssues arrives, issuesOf moves to it and that case falls back instead.
})

graphTest('the notices name the question, the showing sentence and the way back', async g => {
  const node = await reopens(g, REOPEN_LIMIT, '没修住')
  const question = reopenQuestion(node, reopensAfter(node, undefined))
  const notice = reopenNotice(question, 'question-7')
  assert.ok(notice.includes('question-7'))
  assert.ok(notice.includes(question.showText), 'the text propose_to_human takes is in the notice')
  assert.ok(notice.includes('propose_to_human'))
  assert.ok(notice.includes('record_human_answer'))
  assert.ok(notice.includes('先停下查原因，可以吗？'))
  // One plan, no reply words to pick from: no 「回「…」」 in the notice or the 附.
  assert.equal((notice.match(/回「/g) ?? []).length, 0)
  assert.equal((question.node.body.match(/回「/g) ?? []).length, 0)
  const subagent = reopenNoticeForSubagent('question-7')
  assert.ok(subagent.includes('Stop work on it'))
  assert.ok(subagent.includes('the main agent asks the human'))
  const failed = reopenNoticeFailed({ code: 'invalid', message: 'the title is longer than 40 characters' })
  assert.ok(failed.includes('invalid'))
  assert.ok(failed.includes('tried again on the next reopen'))
  // The showing sentence is held to what M3 checks: one line, one question mark, within the recommend limit,
  // and covering the record's proposal, reason and cost word for word.
  assert.ok(!question.showText.includes('\n'))
  assert.equal((question.showText.match(/[?？]/g) ?? []).length, 1)
  for (const line of [question.node.reason, question.node.proposal, question.node.cost]) {
    assert.ok(question.showText.includes(line), 'each line of the record is in the showing text')
  }
})
