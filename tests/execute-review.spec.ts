import assert from 'node:assert/strict'
import test from 'node:test'
import {
  converge,
  latestHumanAt,
  normalizeVerdict,
  renderAcceptanceComment,
  renderRoundComment,
  roundsOf,
  roundsSinceHuman,
  type Round,
} from '../src/execute/review.ts'
import { at, comment, node, stageEdit } from './execute-helpers.ts'

const verdictOf = (findings: Parameters<typeof normalizeVerdict>[1]['findings'], verdict: 'APPROVED' | 'CHANGES_REQUESTED' = 'CHANGES_REQUESTED') =>
  ({ verdict, commit: 'abc1234', findings, checked: ['acceptance:0 saw'] })

test('normalizeVerdict: a blocking finding must hang on one of the three criteria, or on a direction of the design review', () => {
  const reviewed = node({ id: 'task-1', type: 'task', acceptance: ['first', 'second'] })
  // acceptance:<i> with an index the task has, and the two free-standing ones.
  const kept = normalizeVerdict(reviewed, verdictOf([
    { id: 'f1', blocking: true, criterion: 'acceptance:1', where: 'x.ts', what: 'not met', fix: 'meet it' },
    { id: 'f2', blocking: true, criterion: 'irreversible-loss', where: '-', what: 'drops data', fix: 'backup' },
    { id: 'f3', blocking: true, criterion: 'failure-plan', where: '-', what: 'no way to see it fail', fix: 'log' },
  ]))
  assert.equal(kept.demoted, 0)
  assert.equal(kept.verdict, 'CHANGES_REQUESTED')
  // acceptance:2 does not exist (0-based), and neither does a made-up kind.
  const demoted = normalizeVerdict(reviewed, verdictOf([
    { id: 'f1', blocking: true, criterion: 'acceptance:2', where: '-', what: 'x', fix: 'y' },
    { id: 'f2', blocking: true, criterion: 'style', where: '-', what: 'x', fix: 'y' },
    { id: 'f3', blocking: false, criterion: 'whatever it likes', where: '-', what: 'x', fix: 'y' },
  ]))
  assert.equal(demoted.demoted, 2)
  assert.deepEqual(demoted.findings.map(finding => finding.blocking), [false, false, false])
  // A design review also takes direction:<i> against the direction list.
  const design = normalizeVerdict(reviewed, verdictOf([{ id: 'd1', blocking: true, criterion: 'direction:1', where: '-', what: 'x', fix: 'y' }]), 2)
  assert.equal(design.demoted, 0)
  const outOfRange = normalizeVerdict(reviewed, verdictOf([{ id: 'd1', blocking: true, criterion: 'direction:2', where: '-', what: 'x', fix: 'y' }]), 2)
  assert.equal(outOfRange.demoted, 1)
})

test('normalizeVerdict: the findings outrank the verdict', () => {
  const reviewed = node({ id: 'task-1', type: 'task', acceptance: ['first'] })
  const approvedButBlocking = normalizeVerdict(reviewed, verdictOf([{ id: 'f1', blocking: true, criterion: 'acceptance:0', where: '-', what: 'x', fix: 'y' }], 'APPROVED'))
  assert.equal(approvedButBlocking.verdict, 'CHANGES_REQUESTED')
  const blockedButEmpty = normalizeVerdict(reviewed, verdictOf([{ id: 'f1', blocking: false, criterion: 'acceptance:0', where: '-', what: 'x', fix: 'y' }]))
  assert.equal(blockedButEmpty.verdict, 'APPROVED')
})

test('rounds: the comment round-trips, and the stop marker rides at the end', () => {
  const text = renderRoundComment(2, 1, 3, '全审', 'hz-task-1-a2-abcdef')
  assert.equal(text, '第 2 轮：挡路 1，不挡路 3 · 全审 · hz-task-1-a2-abcdef')
  assert.deepEqual(roundsOf([{ at: at(1), actor: 'harness', op: 'comment', text }]), [{ k: 2, blocking: 1, nonBlocking: 3, depth: '全审', childId: 'hz-task-1-a2-abcdef', at: at(1), stopped: false }])
  const stopped = renderRoundComment(3, 2, 0, '轻审', 'hz-task-1-a3-abcdef', true)
  assert.ok(stopped.endsWith('· 停下'))
  assert.equal(roundsOf([{ at: at(2), actor: 'harness', op: 'comment', text: stopped }])[0]?.stopped, true)
  // Any other comment is not a round.
  assert.deepEqual(roundsOf([{ at: at(3), actor: 'harness', op: 'comment', text: '交回摘要：done' }]), [])
})

test('roundsSinceHuman: counts the rounds after the person\'s latest word in the merged subtree history', () => {
  const history = [
    { at: at(1), actor: 'harness' as const, op: 'comment' as const, text: renderRoundComment(1, 3, 0, '全审', 'hz-x-a1-aaaaaa') },
    { at: at(2), actor: 'llm' as const, op: 'edit' as const, reason: 'r', relay: '再修一轮', changes: {} },
    { at: at(3), actor: 'harness' as const, op: 'comment' as const, text: renderRoundComment(2, 2, 1, '全审', 'hz-x-a2-aaaaaa') },
    { at: at(4), actor: 'human' as const, op: 'comment' as const, text: '改这里' },
    { at: at(5), actor: 'harness' as const, op: 'comment' as const, text: renderRoundComment(3, 1, 2, '全审', 'hz-x-a3-aaaaaa') },
  ]
  assert.equal(roundsSinceHuman(history, at(4)).length, 1)
  // No human word anywhere in the subtree: every round counts.
  assert.equal(roundsSinceHuman(history.slice(0, 3), undefined).length, 2)
  assert.equal(latestHumanAt([history]), at(4))
  // A relayed write counts as the person's.
  assert.equal(latestHumanAt([[{ at: at(2), actor: 'llm', op: 'edit', reason: 'r', relay: '再修一轮', changes: {} }]]), at(2))
})

const round = (k: number, blocking: number, stop = false): Round =>
  ({ k, blocking, nonBlocking: 0, depth: '全审', childId: `hz-x-a${k}-aaaaaa`, at: at(k), stopped: stop })

test('converge: the table of §3.7.3', () => {
  // b_k = 0 passes.
  assert.deepEqual(converge([round(1, 2), round(2, 0)], false), { action: 'pass' })
  // Without a human word: a round that does not improve stops.
  assert.deepEqual(converge([round(1, 2), round(2, 2)], false), { action: 'stop', why: 'not-converging' })
  // …and so does the third round with findings, even one still improving.
  assert.deepEqual(converge([round(1, 3), round(2, 2), round(3, 1)], false), { action: 'stop', why: 'rounds-used' })
  // An improving second round is one more round.
  assert.deepEqual(converge([round(1, 3), round(2, 2)], false), { action: 'notify' })
  // After an answer, the first round with findings stops: the person gave one round.
  assert.deepEqual(converge([round(1, 1)], true), { action: 'stop', why: 'human-gave-one-round' })
  // …and a clean first round passes.
  assert.deepEqual(converge([round(1, 0)], true), { action: 'pass' })
  // A second round after an answer without a new answer is one more round.
  assert.deepEqual(converge([round(1, 2), round(2, 1)], true), { action: 'notify' })
})

test('acceptance comments: the goal-level round carries the verdict, the trunk and the pins', () => {
  const pins = 'pins: goal-1@0123456789ab'
  const text = renderAcceptanceComment(2, 'APPROVED', 0, 'hz-goal-1-acc-a2-ffffff', 'deadbeef123', pins)
  assert.equal(text, `验收审查第 2 轮：APPROVED · 挡路 0 · hz-goal-1-acc-a2-ffffff · @deadbeef123 · ${pins}`)
  const stopped = renderAcceptanceComment(3, 'CHANGES_REQUESTED', 2, 'hz-goal-1-acc-a3-ffffff', 'deadbeef123', pins, true)
  assert.ok(stopped.endsWith('· 停下'))
  assert.ok(text.includes('挡路 0'))
})

test('a stop marker the person answered no longer stops (the gate reads the graph the same way)', () => {
  const marked = node({ id: 'task-1', type: 'task' }, 0, 'llm', [
    comment(1, renderRoundComment(1, 2, 0, '全审', 'hz-task-1-a1-aaaaaa', true)),
    stageEdit(2, 'design', 'release'),
    { at: at(3), actor: 'human', op: 'comment', text: '再修一轮' },
  ])
  const marker = roundsOf(marked.history).at(-1)
  const human = latestHumanAt([marked.history])
  assert.ok(marker !== undefined && human !== undefined && marker.at < human)
  assert.equal(marker?.stopped, true)
  // The gate's cut (brief.ts waitingOn) keys on the marker having no later
  // human word; here the answer is later, so the marker is spent.
  const humanTime = Date.parse(human)
  const spent = marked.history.some(entry => entry.op === 'comment' && entry.text?.endsWith('· 停下') && Date.parse(entry.at) < humanTime)
  assert.equal(spent, true)
  // A marker after the answer still holds: the count starts from the answer.
  const fresh = roundsSinceHuman(marked.history, human)
  assert.deepEqual(fresh, [])
})
