import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approvePlanSection,
  carriedPlan,
  checkPlan,
  parseApprovalComment,
  planDigest,
  planPathsOfSection,
  readPlanSection,
  renderApprovalComment,
  renderPlanSection,
  withPlanSection,
  type Plan,
} from '../src/execute/plan.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { comment, node } from './execute-helpers.ts'

const TASK: Pick<GraphNode, 'acceptance' | 'writeScope'> = { acceptance: ['feed lists the 20 newest posts', 'every item has a title'], writeScope: ['site/feed/', 'site/build.mjs'] }

const step = (overrides: Record<string, unknown> = {}) => ({
  title: 'Write the feed builder',
  paths: ['site/feed/rss.mjs'],
  acceptance: ['builder returns 20 items'],
  covers: [0, 1],
  verify: 'L2',
  commands: ['node --test'],
  ...overrides,
})

const problemsOf = (raw: unknown, task = TASK): readonly string[] => {
  const result = checkPlan(task, raw)
  assert.equal(result.ok, false, JSON.stringify(raw))
  return result.ok ? [] : result.problems
}

test('checkPlan: a sound plan passes and comes back normalized', () => {
  const result = checkPlan(TASK, { steps: [step({ title: '  Write the feed builder  ' })], notes: 'two steps would be too many' })
  assert.ok(result.ok)
  assert.equal(result.plan.steps[0]?.title, 'Write the feed builder')
  assert.equal(result.plan.notes, 'two steps would be too many')
  assert.equal(checkPlan(TASK, { steps: [step()] }).ok && 'notes' in (checkPlan(TASK, { steps: [step()] }) as { plan: Plan }).plan, false)
})

test('checkPlan: step count 1 to 12', () => {
  assert.deepEqual(problemsOf({ steps: [] }), ['a plan has 1 to 12 steps, this one has 0'])
  const many = Array.from({ length: 13 }, () => step())
  assert.ok(problemsOf({ steps: many }).includes('a plan has 1 to 12 steps, this one has 13'))
  assert.equal(checkPlan(TASK, { steps: Array.from({ length: 12 }, () => step()) }).ok, true)
  assert.deepEqual(problemsOf({}), ['steps must be a list'])
  assert.deepEqual(problemsOf('steps'), ['steps must be a list'])
  assert.deepEqual(problemsOf(null), ['steps must be a list'])
})

test('checkPlan: paths outside the write scope are named with the scope', () => {
  assert.deepEqual(problemsOf({ steps: [step(), step({ paths: ['ui/x.ts'] })] }), ['step 2: path "ui/x.ts" is outside the write scope [site/feed/, site/build.mjs]'])
  assert.equal(checkPlan(TASK, { steps: [step({ paths: ['site/feed/', 'site/build.mjs'] })] }).ok, true, 'directories and files inside the scope')
  assert.deepEqual(problemsOf({ steps: [step({ paths: ['site/feed/../../etc/passwd'] })] }), ['step 1: path "site/feed/../../etc/passwd" is not a repository-relative path with / separators'])
  assert.deepEqual(problemsOf({ steps: [step({ paths: ['site/'] })] }), ['step 1: path "site/" is outside the write scope [site/feed/, site/build.mjs]'], 'a plan path broader than the scope')
  assert.equal(checkPlan(TASK, { steps: [step({ paths: [] })] }).ok, true, 'a step may only run checks')
})

test('checkPlan: title, acceptance, verify and commands per step', () => {
  assert.deepEqual(problemsOf({ steps: [step({ title: ' ' })] }), ['step 1: title must be one non-empty line'])
  assert.deepEqual(problemsOf({ steps: [step({ title: 'a\nb' })] }), ['step 1: title must be one non-empty line'])
  assert.deepEqual(problemsOf({ steps: [step({ acceptance: [] })] }), ['step 1: acceptance needs at least one non-empty item'])
  assert.deepEqual(problemsOf({ steps: [step({ acceptance: [' '] })] }), ['step 1: acceptance needs at least one non-empty item'])
  assert.deepEqual(problemsOf({ steps: [step({ verify: 'L5' })] }), ['step 1: verify must be one of L1, L2, L3, L4-batch'])
  assert.deepEqual(problemsOf({ steps: [step({ verify: 'L2', commands: [] })] }), ['step 1: a L2 step needs at least one command'])
  assert.deepEqual(problemsOf({ steps: [step({ verify: 'L3', commands: [] })] }), ['step 1: a L3 step needs at least one command'])
  assert.equal(checkPlan(TASK, { steps: [step({ verify: 'L1', commands: [] })] }).ok, true)
  assert.deepEqual(problemsOf({ steps: [step({ verify: 'L4-batch', commands: ['npm run probe'] })] }), ['step 1: an L4-batch step carries no commands (desktop checks are batched)'])
  assert.equal(checkPlan(TASK, { steps: [step({ verify: 'L4-batch', commands: [] })] }).ok, true)
  assert.deepEqual(problemsOf({ steps: ['not a step'] }), ['step 1: must be an object'])
  assert.deepEqual(problemsOf({ steps: [step({ paths: 'site/feed/' })] }), ['step 1: paths must be a list of strings'])
  assert.deepEqual(problemsOf({ steps: [step({ commands: 'node --test' })] }), ['step 1: commands must be a list of strings'])
})

test('checkPlan: covers stay inside the task\'s acceptance and every item is covered', () => {
  assert.deepEqual(problemsOf({ steps: [step({ covers: [0, 2] })] }), ['step 1: covers index 2 is out of range (the task has 2 acceptance items)'])
  assert.deepEqual(problemsOf({ steps: [step({ covers: [-1, 0, 1] })] }), ['step 1: covers index -1 is out of range (the task has 2 acceptance items)'])
  assert.deepEqual(problemsOf({ steps: [step({ covers: [0.5] })] }), ['step 1: covers must be a list of integers'])
  assert.deepEqual(problemsOf({ steps: [step({ covers: [0] })] }), ['acceptance item 2 ("every item has a title") is not covered by any step'])
  assert.equal(checkPlan(TASK, { steps: [step({ covers: [0] }), step({ title: 'Second', covers: [1] })] }).ok, true, 'two steps together cover it')
  assert.deepEqual(problemsOf({ steps: [step()] }, { acceptance: ['only one'], writeScope: ['site/feed/'] }), ['step 1: covers index 1 is out of range (the task has 1 acceptance item)'])
  // Coverage is only reported once the steps are sound.
  assert.deepEqual(problemsOf({ steps: [step({ covers: [0], verify: 'L9' })] }), ['step 1: verify must be one of L1, L2, L3, L4-batch'])
})

test('checkPlan: notes are a string of at most 2000 characters', () => {
  assert.deepEqual(problemsOf({ steps: [step()], notes: 'x'.repeat(2001) }), ['notes must be a string of at most 2000 characters'])
  assert.deepEqual(problemsOf({ steps: [step()], notes: 5 }), ['notes must be a string of at most 2000 characters'])
  assert.equal(checkPlan(TASK, { steps: [step()], notes: 'x'.repeat(2000) }).ok, true)
})

test('checkPlan: a task without a write scope accepts no path', () => {
  assert.deepEqual(problemsOf({ steps: [step()] }, { acceptance: ['a', 'b'] }), ['step 1: path "site/feed/rss.mjs" is outside the write scope []'])
})

function plan(overrides: Record<string, unknown> = {}): Plan {
  const result = checkPlan(TASK, { steps: [step(overrides)] })
  assert.ok(result.ok)
  return result.plan
}

test('planDigest: 12 hex digits over the steps; notes and padding do not move it, any step field does', () => {
  const base = plan()
  assert.match(planDigest(base), /^[0-9a-f]{12}$/)
  assert.equal(planDigest({ ...base, notes: 'prose' }), planDigest(base))
  for (const change of [{ title: 'Other' }, { paths: ['site/feed/other.mjs'] }, { acceptance: ['changed'] }, { covers: [1, 0] }, { verify: 'L3' }, { commands: ['node --test', 'more'] }]) {
    assert.notEqual(planDigest(plan(change)), planDigest(base), JSON.stringify(change))
  }
})

test('renderPlanSection: title line, header line with version, state and digest, then two lines per step', () => {
  const text = renderPlanSection(plan(), 2, 'pending')
  assert.equal(text, [
    '## 计划',
    `第 2 版 · 等主 Agent 审 · 摘要 ${planDigest(plan())}`,
    '1. Write the feed builder',
    '   路径：site/feed/rss.mjs · 验证：L2',
  ].join('\n'))
  assert.ok(renderPlanSection(plan({ paths: ['site/build.mjs'] }), 1, 'approved').includes('主 Agent 已批'))
  assert.ok(renderPlanSection(plan({ paths: ['site/feed/', 'site/build.mjs'] }), 1, 'pending').includes('路径：site/feed/、site/build.mjs · 验证：L2'))
  assert.ok(renderPlanSection(plan({ paths: [] }), 1, 'pending').includes('路径：无 · 验证：L2'))
})

test('withPlanSection: appended to a body, or replacing the section in place and keeping what follows', () => {
  const section = renderPlanSection(plan(), 1, 'pending')
  assert.equal(withPlanSection(undefined, section), section)
  assert.equal(withPlanSection('  \n', section), section)
  assert.equal(withPlanSection('Why this task.', section), `Why this task.\n\n${section}`)
  const second = renderPlanSection(plan({ title: 'Second try' }), 2, 'pending')
  const replaced = withPlanSection(`Why this task.\n\n${section}`, second)
  assert.equal(replaced, `Why this task.\n\n${second}`)
  const middle = withPlanSection(`Intro\n\n${section}\n\n## 备注\nkeep me`, second)
  assert.equal(middle, `Intro\n\n${second}\n\n## 备注\nkeep me`)
  assert.equal(withPlanSection(middle, second), middle, 'idempotent')
})

test('readPlanSection reads what renderPlanSection wrote, and nothing else', () => {
  const written = plan()
  const body = withPlanSection('Why.', renderPlanSection(written, 3, 'approved'))
  assert.deepEqual(readPlanSection(body), { version: 3, state: 'approved', digest: planDigest(written), steps: '1. Write the feed builder\n   路径：site/feed/rss.mjs · 验证：L2' })
  assert.equal(readPlanSection(withPlanSection('Why.', renderPlanSection(written, 1, 'pending')))?.state, 'pending')
  assert.equal(readPlanSection(undefined), undefined)
  assert.equal(readPlanSection('Why. No plan here.'), undefined)
  assert.equal(readPlanSection('## 计划\nnot a header line\n1. x'), undefined)
  const later = readPlanSection(`${renderPlanSection(written, 1, 'pending')}\n\n## 备注\nmore`)
  assert.equal(later?.steps, '1. Write the feed builder\n   路径：site/feed/rss.mjs · 验证：L2', 'the section ends at the next heading')
})

test('approvePlanSection flips the state and keeps the digest', () => {
  const written = plan()
  const body = withPlanSection('Why.', renderPlanSection(written, 2, 'pending'))
  const approved = approvePlanSection(body)
  assert.deepEqual(readPlanSection(approved)?.state, 'approved')
  assert.equal(readPlanSection(approved)?.digest, planDigest(written))
  assert.equal(approved, withPlanSection('Why.', renderPlanSection(written, 2, 'approved')))
  assert.equal(approvePlanSection('no plan'), undefined)
})

test('the approval comment reads back', () => {
  const text = renderApprovalComment(2, 'abcabcabcabc', 'hz-t-a1-000000', 'call-9')
  assert.equal(text, '计划第 2 版已批 · 摘要 abcabcabcabc · hz-t-a1-000000 · call-9')
  assert.deepEqual(parseApprovalComment(text), { version: 2, digest: 'abcabcabcabc', childId: 'hz-t-a1-000000', callId: 'call-9' })
  assert.equal(parseApprovalComment('计划第 2 版已批'), undefined)
  assert.equal(parseApprovalComment('第 1 次派发 · hz-t-a1-000000 · 简报 abc'), undefined)
})

test('carriedPlan: the latest approval whose digest is the one in the body now, marked approved', () => {
  const written = plan()
  const digest = planDigest(written)
  const approvedBody = withPlanSection('Why.', renderPlanSection(written, 2, 'approved'))
  const approval = comment(5, renderApprovalComment(2, digest, 'hz-t-a1-000000', 'call-9'))
  assert.deepEqual(carriedPlan(node({ id: 't', type: 'task', body: approvedBody }, 0, 'llm', [approval])), { version: 2, digest, childId: 'hz-t-a1-000000', callId: 'call-9' })
  // The person or the model changed the plan section: the approval no longer fits.
  const changed = withPlanSection(approvedBody, renderPlanSection(plan({ title: 'Edited' }), 2, 'approved'))
  assert.equal(carriedPlan(node({ id: 't', type: 'task', body: changed }, 0, 'llm', [approval])), undefined)
  // A new version waits for review: the old approval does not carry.
  const pending = withPlanSection('Why.', renderPlanSection(written, 3, 'pending'))
  assert.equal(carriedPlan(node({ id: 't', type: 'task', body: pending }, 0, 'llm', [approval])), undefined)
  // A comment the model wrote in the same words approves nothing.
  assert.equal(carriedPlan(node({ id: 't', type: 'task', body: approvedBody }, 0, 'llm', [comment(5, approval.text!, 'llm')])), undefined)
  assert.equal(carriedPlan(node({ id: 't', type: 'task', body: approvedBody })), undefined)
  // The latest approval counts.
  const stale = comment(3, renderApprovalComment(1, 'ffffffffffff', 'hz-t-a1-000000', 'call-1'))
  assert.equal(carriedPlan(node({ id: 't', type: 'task', body: approvedBody }, 0, 'llm', [approval, stale])), undefined)
  assert.equal(carriedPlan(node({ id: 't', type: 'task', body: approvedBody }, 0, 'llm', [stale, approval]))?.version, 2)
})

test('planPathsOfSection: the union of the step lines\u2019 paths, first-seen order, none for 无', () => {
  const multi = renderPlanSection(plan({
    title: 'Two files',
    paths: ['site/feed/a.mjs', 'site/feed/b.mjs'],
  }), 1, 'approved')
  assert.deepEqual(planPathsOfSection(readPlanSection(withPlanSection(undefined, multi))!.steps), ['site/feed/a.mjs', 'site/feed/b.mjs'])
  const twoSteps = [
    '1. First\n   路径：site/x.mjs、site/y.mjs · 验证：L1',
    '2. Second\n   路径：site/x.mjs · 验证：L2',
    '3. Third\n   路径：无 · 验证：L4-batch',
  ].join('\n')
  assert.deepEqual(planPathsOfSection(twoSteps), ['site/x.mjs', 'site/y.mjs'], 'repeats collapse, 无 contributes none')
  assert.deepEqual(planPathsOfSection('1. Empty\n   路径：无 · 验证：L4-batch'), [])
  assert.deepEqual(planPathsOfSection('no step lines'), [])
})
