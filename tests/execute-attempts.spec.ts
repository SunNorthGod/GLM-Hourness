import assert from 'node:assert/strict'
import test from 'node:test'
import {
  latestDispatch,
  lostChildOf,
  makeChildId,
  nextAttempt,
  parseChildId,
  parseDispatchComment,
  parseHandbackComment,
  renderDispatchComment,
  renderHandbackComment,
  renderLostComment,
  runningGlm,
  runningOn,
  runningWorkers,
  type Attempt,
} from '../src/execute/attempts.ts'
import { renderPins } from '../src/graph/pins.ts'
import { comment, node } from './execute-helpers.ts'

test('makeChildId: hz-<task>-a<attempt>-<6 base36>, in the characters session ids allow', () => {
  assert.equal(makeChildId('task-12', 1, () => 0), 'hz-task-12-a1-000000')
  assert.equal(makeChildId('task-12', 3, () => 0.5), 'hz-task-12-a3-' + Math.floor(0.5 * 36 ** 6).toString(36))
  const last = makeChildId('t', 1, () => 1 - Number.EPSILON)
  assert.match(last, /^hz-t-a1-[0-9a-z]{6}$/)
  assert.equal(last, 'hz-t-a1-zzzzzz')
  for (const random of [0, 0.123456, 0.999999]) assert.match(makeChildId('task-12', 2, () => random), /^[A-Za-z0-9._-]+$/)
})

test('makeChildId: the review of a whole goal has its own form', () => {
  assert.equal(makeChildId('goal-1', 2, () => 0, true), 'hz-goal-1-acc-a2-000000')
})

test('parseChildId: reads both forms back, anchored at the end, and refuses anything else', () => {
  assert.deepEqual(parseChildId('hz-task-12-a1-k3x9ab'), { node: 'task-12', attempt: 1, acceptance: false })
  assert.deepEqual(parseChildId('hz-task-a2-a14-k3x9ab'), { node: 'task-a2', attempt: 14, acceptance: false })
  assert.deepEqual(parseChildId('hz-goal-1-acc-a3-k3x9ab'), { node: 'goal-1', attempt: 3, acceptance: true })
  for (const bad of ['', 'task-12-a1-k3x9ab', 'hz-task-12-a1-k3x9a', 'hz-task-12-a1-K3X9AB', 'hz-task-12-a-k3x9ab', 'hz-Task-a1-k3x9ab', 'hz--a1-k3x9ab', 'hz-task-12-a1-k3x9abc']) {
    assert.equal(parseChildId(bad), undefined, bad)
  }
  // Round trip over ids that contain "-a<digit>" and "-acc" themselves.
  for (const id of ['t', 'task-a1', 'a1-a2', 'x-acc-y']) {
    assert.deepEqual(parseChildId(makeChildId(id, 7, () => 0.25)), { node: id, attempt: 7, acceptance: false }, id)
  }
})

const attempt = (overrides: Partial<Attempt>): Attempt => ({ childId: 'hz-t-a1-000000', role: 'worker', node: 't', attempt: 1, provider: 'p', model: 'm', why: 'w', plan: 'required', pins: 'pins: t@000000000000', ...overrides })

test('queries over the running dispatches: by node, workers, and GLM ones that count against the cap', () => {
  const running = [
    attempt({ node: 'a', model: 'glm-5.3' }),
    attempt({ node: 'b', role: 'review', model: 'GLM-5.3-Flash', childId: 'hz-b-a1-000001' }),
    attempt({ node: 'c', role: 'check', model: 'glm-5.3', childId: 'hz-c-a1-000002' }),
    attempt({ node: 'goal', role: 'acceptance-review', model: 'other', childId: 'hz-goal-acc-a1-000003' }),
    attempt({ node: 'd', model: 'deepseek-v4', childId: 'hz-d-a1-000004' }),
  ]
  assert.deepEqual(runningOn(running, 'c').map(entry => entry.role), ['check'])
  assert.deepEqual(runningOn(running, 'nothing'), [])
  assert.deepEqual(runningWorkers(running).map(entry => entry.node), ['a', 'd'])
  assert.deepEqual(runningGlm(running).map(entry => entry.node), ['a', 'b'], 'a check runs no model and a non-GLM model is not limited')
})

test('the dispatch comment: one line of facts, then the pins line; it reads back', () => {
  const text = renderDispatchComment({
    attempt: 2,
    childId: 'hz-task-12-a2-k3x9ab',
    base: { branch: 'main', sha: 'abc1234' },
    provider: 'example',
    model: 'example-model-large',
    reasoningEffort: 'high',
    why: 'one directory with a check',
    review: { depth: 'light', why: 'adds one file' },
    brief: '3fa91c0b2d44',
    pins: 'pins: task-12@111111111111 goal-1@222222222222',
  })
  assert.equal(text, [
    '第 2 次派发 · hz-task-12-a2-k3x9ab · 基线 main@abc1234 · 模型 example/example-model-large high，理由：one directory with a check · 审查：轻审，理由：adds one file · 简报 3fa91c0b2d44',
    'pins: task-12@111111111111 goal-1@222222222222',
  ].join('\n'))
  // The reconcile rebuilds a lost dispatch from these parts (§3.9.6 step 3).
  assert.deepEqual(parseDispatchComment(text), {
    attempt: 2,
    childId: 'hz-task-12-a2-k3x9ab',
    pins: 'pins: task-12@111111111111 goal-1@222222222222',
    base: { branch: 'main', sha: 'abc1234' },
    provider: 'example',
    model: 'example-model-large',
    reasoningEffort: 'high',
    why: 'one directory with a check',
    review: 'light',
  })
})

test('the lost comment names the attempt and the child id, and reads back', () => {
  assert.equal(renderLostComment(3, 'hz-task-1-a3-abcdef'), '第 3 次在宿主重启时丢失 · hz-task-1-a3-abcdef')
  assert.equal(lostChildOf(renderLostComment(3, 'hz-task-1-a3-abcdef')), 'hz-task-1-a3-abcdef')
  assert.equal(lostChildOf('第 3 次结束：error · hz-task-1-a3-abcdef'), undefined)
})

test('the dispatch comment: optional parts leave out their words, and a note is appended', () => {
  const text = renderDispatchComment({
    attempt: 1, childId: 'hz-t-a1-000000', provider: 'p', model: 'm', why: 'w', review: { depth: 'full' }, brief: 'abcabcabcabc', note: '模型目录读不到，没有核对', pins: 'pins: t@000000000000',
  })
  assert.equal(text.split('\n')[0], '第 1 次派发 · hz-t-a1-000000 · 模型 p/m，理由：w · 审查：全审 · 简报 abcabcabcabc · 模型目录读不到，没有核对')
  assert.equal(renderDispatchComment({ attempt: 1, childId: 'hz-t-a1-000000', provider: 'p', model: 'm', why: 'w', review: { depth: 'skip', why: 'docs only' }, brief: 'abcabcabcabc', pins: 'pins: t@000000000000' }).includes('审查：不审，理由：docs only'), true)
})

test('parseDispatchComment refuses what is not a dispatch comment', () => {
  assert.equal(parseDispatchComment('计划第 1 版已批 · 摘要 abcabcabcabc · hz-t-a1-000000 · call-1'), undefined)
  assert.equal(parseDispatchComment('第 1 次派发 · hz-t-a1-000000 · 简报 abc'), undefined, 'no pins line')
  assert.equal(parseDispatchComment('第 1 次派发 · hz-t-a1-000000 · 简报 abc\nnot pins'), undefined)
  assert.equal(parseDispatchComment(''), undefined)
})

test('the dispatch comment: the policy line rides after the pins line, and both are found by prefix, not position (reval R2)', () => {
  const text = renderDispatchComment({
    attempt: 3,
    childId: 'hz-task-12-a3-k3x9ab',
    provider: 'example',
    model: 'example-model-large',
    why: 'one directory with a check',
    brief: '3fa91c0b2d44',
    pins: 'pins: task-12@111111111111',
    policy: 'policy: gate@aaaaaaaaaaaa floor@bbbbbbbbbbbb rules@cccccccccccc checker@dddddddddddd',
  })
  assert.equal(text, [
    '第 3 次派发 · hz-task-12-a3-k3x9ab · 模型 example/example-model-large，理由：one directory with a check · 简报 3fa91c0b2d44',
    'pins: task-12@111111111111',
    'policy: gate@aaaaaaaaaaaa floor@bbbbbbbbbbbb rules@cccccccccccc checker@dddddddddddd',
  ].join('\n'))
  assert.deepEqual(parseDispatchComment(text), {
    attempt: 3,
    childId: 'hz-task-12-a3-k3x9ab',
    pins: 'pins: task-12@111111111111',
    policy: 'policy: gate@aaaaaaaaaaaa floor@bbbbbbbbbbbb rules@cccccccccccc checker@dddddddddddd',
    provider: 'example',
    model: 'example-model-large',
    why: 'one directory with a check',
  })
  // The pins line is no longer the last line: found by its prefix all the same.
  const order = parseDispatchComment('第 1 次派发 · hz-t-a1-000000 · 简报 abc\npins: t@000000000000\npolicy: gate@aaaaaaaaaaaa\n尾部多出的一行')
  assert.equal(order?.pins, 'pins: t@000000000000')
  assert.equal(order?.policy, 'policy: gate@aaaaaaaaaaaa')
})

test('an old-format dispatch comment without a policy line parses, policy left out (reval §12 R2 exemption)', () => {
  const old = parseDispatchComment('第 2 次派发 · hz-t-a2-000001 · 基线 main@abc1234 · 模型 p/m，理由：w · 简报 abcabcabcabc\npins: t@000000000000')
  assert.deepEqual(old, {
    attempt: 2,
    childId: 'hz-t-a2-000001',
    pins: 'pins: t@000000000000',
    base: { branch: 'main', sha: 'abc1234' },
    provider: 'p',
    model: 'm',
    why: 'w',
  })
  // Trailing blank lines and a multi-line tail that an old comment could carry.
  const padded = parseDispatchComment('第 2 次派发 · hz-t-a2-000001 · 简报 abcabcabcabc\npins: t@000000000000\n\n另起的一行不是 pins\n')
  assert.equal(padded?.pins, 'pins: t@000000000000')
  assert.equal(padded?.policy, undefined)
})

test('nextAttempt and latestDispatch count only the harness\'s own dispatch comments', () => {
  const first = renderDispatchComment({ attempt: 1, childId: 'hz-t-a1-000000', provider: 'p', model: 'm', why: 'w', brief: 'a'.repeat(12), pins: renderPins([{ id: 't', digest: '0'.repeat(12) }]) })
  const second = renderDispatchComment({ attempt: 2, childId: 'hz-t-a2-000001', provider: 'p', model: 'm', why: 'w', brief: 'b'.repeat(12), pins: renderPins([{ id: 't', digest: '1'.repeat(12) }]) })
  const fresh = node({ id: 't', type: 'task' })
  assert.equal(nextAttempt(fresh), 1)
  assert.equal(latestDispatch(fresh), undefined)
  const dispatched = node({ id: 't', type: 'task' }, 0, 'llm', [comment(1, first), comment(2, '审查第 1 轮：挡路 1'), comment(3, second)])
  assert.equal(nextAttempt(dispatched), 3)
  assert.deepEqual(latestDispatch(dispatched), { attempt: 2, childId: 'hz-t-a2-000001', pins: 'pins: t@111111111111', provider: 'p', model: 'm', why: 'w' })
  // A model that writes a comment shaped like a dispatch comment does not count.
  const forged = node({ id: 't', type: 'task' }, 0, 'llm', [comment(1, first, 'llm')])
  assert.equal(nextAttempt(forged), 1)
})

test('the handback comment: the component-doc lines sit between the depth and the problems, each with the Docs: prefix, and read back verbatim', () => {
  const base = { attempt: 2, status: 'done', childId: 'hz-t-a2-000001', commits: 1, head: 'abc123def456', files: 1, base: 'aaa111bbb222', questions: 0, assumptions: 0, asked: 0, answered: 0, timeouts: 0, plans: 0, incoming: 0, lessons: 0, depth: '轻审' as const, problems: ['files[0] is not a repository-relative path'] }
  const bare = renderHandbackComment(base)
  assert.ok(!bare.includes('Docs:'))
  assert.deepEqual(parseHandbackComment(bare)?.docs, undefined)
  const withDocs = renderHandbackComment({ ...base, docs: ['src/guarded changed code but its AGENTS.md was not touched and the handback says nothing about it.', '文档缺口没算成：git gone'] })
  const lines = withDocs.split('\n')
  assert.ok(lines[3].startsWith('有效深浅 轻审'))
  assert.equal(lines[4], 'Docs: src/guarded changed code but its AGENTS.md was not touched and the handback says nothing about it.')
  assert.equal(lines[5], 'Docs: 文档缺口没算成：git gone')
  assert.ok(lines[6].startsWith('校验不过：'))
  const read = parseHandbackComment(withDocs)
  assert.deepEqual(read?.docs, ['src/guarded changed code but its AGENTS.md was not touched and the handback says nothing about it.', '文档缺口没算成：git gone'])
  assert.deepEqual(read?.problems, ['files[0] is not a repository-relative path'])
  assert.equal(read?.depth, '轻审')
})
