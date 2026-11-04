/**
 * The handback processing (M7 design 0.6 §3.6, §3.7) over a real repository
 * and graph: a done handback lands as one idempotent comment with the
 * communication counts, gets its effective depth from the must-review floor
 * (the hit upgrades a light dispatch, a missing floor node leaves the
 * declared depth) and makes sure the review task exists; a stale dispatch
 * stops before the review flow; lessons without the lessons row go to the
 * fallback comment with secret-shaped strings elided; a reviewer's verdict
 * is normalized, a full review missing an acceptance item is voided once and
 * re-dispatched with the same model, a passing round marks the review task
 * done with the patch-id evidence, two non-converging rounds stop with the
 * marker and the stop draft; a design review writes the module record.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import { pinsOf, renderPins } from '../src/graph/pins.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import { createGraphCache, realCommandRunner, type GraphCache } from '../src/execute/dispatch.ts'
import { startHandback, type HandbackDeps } from '../src/execute/handback.ts'
import { createGit } from '../src/execute/git.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { forgetAttempt, parseHandbackComment, recordCommunication, registerAttempt, registeredAttempt, REVIEW_TASK_ACCEPTANCE, type Attempt } from '../src/execute/attempts.ts'
import { roundsOf } from '../src/execute/review.ts'
import { briefGate } from '../src/execute/brief.ts'
import { gitSeed, noticeHost, seedGoalTask } from './execute-helpers.ts'

// ---- fixtures ----

interface Project {
  readonly root: string
  readonly graphDir: string
  readonly worktree: string
  readonly commit: string
  readonly baseSha: string
}

const git = (root: string, args: readonly string[]): string => {
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`)
  return run.stdout
}

/** A repository with a released goal over one task, a worktree on the task's branch, and one commit on top of the base. */
async function presetProject(): Promise<Project> {
  const root = mkdtempSync(join(tmpdir(), 'glm-hourness-handback-'))
  mkdirSync(join(root, 'docs', 'graph'), { recursive: true })
  const graphDir = join(root, 'docs', 'graph')
  await seedGoalTask(graphDir, { title: 'Guard the writer', writeScope: ['src/guarded/'], acceptance: ['the writer is guarded', 'the guard is tested'], worktree: true })
  gitSeed(root)
  const baseSha = git(root, ['rev-parse', 'HEAD']).trim()
  git(root, ['worktree', 'add', '--quiet', join('.worktrees', 'hz-task-1'), '-b', 'hz/task-1'])
  const worktree = join(root, '.worktrees', 'hz-task-1')
  mkdirSync(join(worktree, 'src', 'guarded'), { recursive: true })
  writeFileSync(join(worktree, 'src', 'guarded', 'writer.js'), 'guarded\n')
  git(worktree, ['add', 'src/guarded/writer.js'])
  git(worktree, ['commit', '-q', '-m', 'task-1: guard the writer'])
  const commit = git(worktree, ['rev-parse', 'HEAD']).trim()
  return { root, graphDir, worktree, commit, baseSha }
}

interface Rig {
  readonly project: Project
  readonly cache: GraphCache
  readonly deps: HandbackDeps
  readonly sent: UserNotice[]
  readonly redispatches: readonly { readonly reviewTaskId: string, readonly model: string }[]
  /** The attempt as the register holds it (the caller passes this one back to startHandback). */
  readonly registered: Attempt
}

async function rig(project: Project, attempt: Attempt): Promise<Rig> {
  const { lookup, sent } = noticeHost(project)
  const cache = createGraphCache(() => {})
  const graph = await cache.load(project.graphDir)
  const task = graph.nodes.get(attempt.node)
  assert.ok(task !== undefined, 'the fixture task is missing')
  const pins = renderPins(pinsOf(graph, task, sha256Hex))
  registerAttempt({ ...attempt, graphDir: project.graphDir, pins })
  const redispatches: { reviewTaskId: string, model: string }[] = []
  const deps: HandbackDeps = {
    lookup,
    cache,
    execDir: root => join(root, '.llm', 'execute'),
    report: (_s, _st, reason) => console.log("REPORT:", reason),
    git: createGit(),
    runCommand: realCommandRunner,
    redispatch: (reviewTaskId, same) => {
      redispatches.push({ reviewTaskId, model: same.model })
      return Promise.resolve(true)
    },
  }
  const registered: Attempt = { ...attempt, graphDir: project.graphDir, pins }
  return { project, cache, deps, sent, redispatches, registered }
}

/** The processing is done when the register entry is gone; poll for it. */
async function processed(childId: string): Promise<void> {
  for (let deadline = Date.now() + 4000; registeredAttempt(childId) !== undefined && Date.now() < deadline;) {
    await new Promise(done => setTimeout(done, 20))
  }
  assert.equal(registeredAttempt(childId), undefined, `the processing of ${childId} did not finish`)
}

function workerAttempt(project: Project, childId: string, over: Partial<Attempt> = {}): Attempt {
  return {
    childId, role: 'worker', node: 'task-1', attempt: 1, graphDir: project.graphDir, worktree: project.worktree, branch: 'hz/task-1', baseSha: project.baseSha, review: 'full', parentSession: 'main-1', provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'required', pins: 'pins: task-1@000000000000', ...over,
  }
}

function structuredDone(project: Project, over: Record<string, unknown> = {}): unknown {
  return { stopReason: 'completed', structured: { status: 'done', summary: 'guarded the writer', commits: [project.commit], files: ['src/guarded/writer.js'], checks: [{ command: 'node --test', exit: 0 }], questions: [], assumptions: [], lessons: [], ...over } }
}

function reviewerAttempt(project: Project, graph: Awaited<ReturnType<GraphCache['load']>>, childId: string, attempt: number): Attempt {
  const reviewTask = [...graph.nodes.values()].find(entry => entry.parent === 'task-1' && entry.kind === 'review')
  assert.ok(reviewTask !== undefined, 'the fixture needs the review task of a done handback')
  return { childId, role: 'review', node: reviewTask.id, attempt, graphDir: project.graphDir, worktree: project.worktree, depth: 'full', parentSession: 'main-1', provider: 'probe', model: 'probe-review', why: 'the change is small', plan: 'none', pins: renderPins(pinsOf(graph, reviewTask, sha256Hex)) }
}

function reviewTaskOf(graph: Awaited<ReturnType<GraphCache['load']>>): GraphNode {
  const reviewTask = [...graph.nodes.values()].find(entry => entry.parent === 'task-1' && entry.kind === 'review')
  assert.ok(reviewTask !== undefined, 'the fixture has no review task')
  return reviewTask
}

/** The handback comments of a task, in history order. */
function handbacksOf(task: GraphNode): readonly { attempt: number, status: string, childId: string, depth?: string, floorHit?: string }[] {
  return task.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && typeof entry.text === 'string' ? [parseHandbackComment(entry.text)] : []).filter(entry => entry !== undefined)
}

/** Run one done worker handback on the rig's registered attempt and read its comment back. */
async function runDoneHandback(rig1: Rig, project: Project, childId: string, over: Record<string, unknown> = {}): Promise<{ readonly graph: Awaited<ReturnType<GraphCache['load']>>, readonly comment: ReturnType<typeof handbacksOf>[number] }> {
  startHandback(rig1.deps, rig1.registered, structuredDone(project, over))
  await processed(childId)
  const graph = await rig1.cache.load(project.graphDir)
  const comment = handbacksOf(graph.nodes.get('task-1')!).at(-1)
  assert.ok(comment !== undefined, 'no handback comment on the task')
  return { graph, comment }
}

// ---- the worker handback (§3.6.2) ----

test('a done handback lands as one comment with the counts and the review task exists; the depth is the declared one without a floor', async () => {
  const project = await presetProject()
  const attempt = workerAttempt(project, 'hz-task-1-a1-aaaaaa')
  const rig1 = await rig(project, attempt)
  try {
    recordCounts(attempt.childId)
    const { graph, comment } = await runDoneHandback(rig1, project, attempt.childId)
    assert.equal(comment.status, 'done')
    assert.equal(comment.commits, 1)
    assert.equal(comment.childId, attempt.childId)
    assert.equal(comment.asked, 2)
    assert.equal(comment.answered, 1)
    assert.equal(comment.timeouts, 1)
    assert.equal(comment.incoming, 1)
    assert.equal(comment.depth, '全审', 'the declared depth is full, no floor node, no hit')
    const reviewTask = [...graph.nodes.values()].find(entry => entry.parent === 'task-1' && entry.kind === 'review')
    assert.ok(reviewTask !== undefined, 'no review task was created')
    assert.deepEqual(reviewTask.acceptance, [REVIEW_TASK_ACCEPTANCE])
    assert.ok((reviewTask.edges ?? []).some(edge => edge.type === 'source' && edge.to === 'task-1'), 'the review task does not point at the reviewed task')
    assert.equal(reviewTask.status, 'approved', 'the harness proposal is approved directly')
    const notice = rig1.sent.at(-1)
    assert.ok(notice !== undefined && notice.source.kind === 'glm-hourness-execute')
    assert.equal((notice.source.hournessExecute as { event: string }).event, 'handback')
    assert.match(notice.content[0].text, /handed back done/)
    // Idempotent: rerunning processes nothing.
    startHandback(rig1.deps, rig1.registered, structuredDone(project))
    await new Promise(done => setTimeout(done, 150))
    assert.equal(handbacksOf(graph.nodes.get('task-1')!).length, 1, 'a rerun wrote a second handback comment')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

function recordCounts(childId: string): void {
  recordCommunication(childId, 'asked')
  recordCommunication(childId, 'asked')
  recordCommunication(childId, 'answered')
  recordCommunication(childId, 'timeout')
  recordCommunication(childId, 'incoming')
}

test('a floor hit upgrades a light dispatch; the comment names the hit and the review task exists', async () => {
  const project = await presetProject()
  const attempt = workerAttempt(project, 'hz-task-1-a2-bbbbbb', { attempt: 2, review: 'light' })
  const rig1 = await rig(project, attempt)
  try {
    const engine = openEngine(project.graphDir)
    const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node: { type: 'norm', id: 'norm-review-floor', title: '必须全审的改动', parent: 'goal-1', acceptance: ['碰到必须全审：`files src/guarded/`'] } })
    assert.ok(seeded.ok, `the floor seed failed: ${JSON.stringify(seeded.ok ? {} : seeded.error)}`)
    const { graph, comment } = await runDoneHandback(rig1, project, attempt.childId)
    assert.equal(comment.depth, '全审')
    assert.match(comment.floorHit ?? '', /files src\/guarded\//)
    assert.ok([...graph.nodes.values()].some(entry => entry.parent === 'task-1' && entry.kind === 'review'), 'no review task under a floor hit')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('a stale dispatch stops before the review flow: the comment is there, no review task, a stale notice', async () => {
  const project = await presetProject()
  const attempt = workerAttempt(project, 'hz-task-1-a3-cccccc', { attempt: 3 })
  const rig1 = await rig(project, attempt)
  try {
    const engine = openEngine(project.graphDir)
    const current = await engine.load()
    const moved = await engine.apply('human', { op: 'edit', id: 'goal-1', rev: current.revisions.get('goal-1')!, set: { acceptance: ['the blog builds fast'] }, reason: 'test: the goal moved' })
    assert.ok(moved.ok, 'the fixture edit failed')
    startHandback(rig1.deps, rig1.registered, structuredDone(project))
    await processed(attempt.childId)
    const graph = await rig1.cache.load(project.graphDir)
    assert.equal(handbacksOf(graph.nodes.get('task-1')!).at(-1)?.status, 'done', 'no handback comment')
    assert.equal([...graph.nodes.values()].filter(entry => entry.parent === 'task-1' && entry.kind === 'review').length, 0, 'a review task under a stale handback')
    const notice = rig1.sent.at(-1)
    assert.ok(notice !== undefined && (notice.source.hournessExecute as { event: string }).event === 'stale')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('lessons without the lessons row go to the fallback comment; a secret-shaped string is elided', async () => {
  const project = await presetProject()
  const attempt = workerAttempt(project, 'hz-task-1-a4-dddddd', { attempt: 4 })
  const rig1 = await rig(project, attempt)
  try {
    startHandback(rig1.deps, rig1.registered, structuredDone(project, {
      lessons: [{ problem: 'the writer unlocked the guard', fix: 'hold the lock across the write', files: ['src/guarded/writer.js'], commands: ['node --test'], tools: ['Write'], errors: ['EACCES: permission denied'], scope: 'project' }, { problem: 'the api key is sk-1234567890abcdef', fix: 'none', files: [], commands: [], tools: [] }],
    }))
    await processed(attempt.childId)
    const graph = await rig1.cache.load(project.graphDir)
    const fallback = graph.nodes.get('task-1')!.history.find(entry => entry.op === 'comment' && typeof entry.text === 'string' && entry.text.startsWith(`候选经验退路 · ${attempt.childId}`))
    assert.ok(fallback !== undefined, 'no fallback comment for the candidates')
    assert.match(fallback.text, /\[候选经验\] the writer unlocked the guard → hold the lock across the write/)
    assert.match(fallback.text, /（像密钥，已略去）/, 'the secret-shaped problem text is not elided')
    assert.doesNotMatch(fallback.text, /sk-1234567890abcdef/, 'the secret reached the graph')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('an activation that settles without the structured handback ends the attempt, the task stays in progress', async () => {
  const project = await presetProject()
  const attempt = workerAttempt(project, 'hz-task-1-a5-eeeeee', { attempt: 5 })
  const rig1 = await rig(project, attempt)
  try {
    // The dispatch marks the task doing (dispatch.ts does the same write).
    const engine = openEngine(project.graphDir)
    const current = await engine.load()
    const doing = await engine.apply('harness', { op: 'status', id: 'task-1', rev: current.revisions.get('task-1')!, to: 'doing', reason: `dispatch ${attempt.childId}` })
    assert.ok(doing.ok, 'the fixture doing move failed')
    startHandback(rig1.deps, rig1.registered, { stopReason: 'aborted' })
    await processed(attempt.childId)
    const task = (await rig1.cache.load(project.graphDir)).nodes.get('task-1')!
    assert.ok(task.history.some(entry => entry.op === 'comment' && typeof entry.text === 'string' && /^第 5 次结束：aborted · /.test(entry.text)), 'no ending comment')
    assert.equal(task.status, 'doing', 'the task did not stay in progress')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

// ---- the review handback (§3.7.1–§3.7.3) ----

const BLOCKING = { id: 'f1', blocking: true, criterion: 'acceptance:0', where: 'src/guarded/writer.js', what: 'the guard is not held', fix: 'hold the lock' }

/** One reviewer round: the dispatch registered with fresh pins, the verdict settled, the processing awaited. */
async function reviewRound(rig1: Rig, project: Project, childId: string, attempt: number, structured: Record<string, unknown>): Promise<void> {
  const reviewer = reviewerAttempt(project, await rig1.cache.load(project.graphDir), childId, attempt)
  registerAttempt(reviewer)
  startHandback(rig1.deps, reviewer, { stopReason: 'completed', structured })
  await processed(childId)
}

/** The shared start of the review tests: the project set up, the worker's done handback processed, one reviewer round run. */
async function reviewFixture(firstRound: (project: Project) => Record<string, unknown>): Promise<{ readonly project: Project, readonly rig1: Rig }> {
  const project = await presetProject()
  const worker = workerAttempt(project, 'hz-task-1-a1-aaaaaa')
  const rig1 = await rig(project, worker)
  startHandback(rig1.deps, rig1.registered, structuredDone(project))
  await processed(worker.childId)
  await reviewRound(rig1, project, 'hz-task-1-r1-rrrrrr', 1, firstRound(project))
  return { project, rig1 }
}

test('a full review that passes marks the review task done with the patch-id evidence and reports APPROVED', async () => {
  const { project, rig1 } = await reviewFixture(project => ({ verdict: 'APPROVED', commit: project.commit, findings: [], checked: ['acceptance:0', 'acceptance:1'] }))
  try {
    const graph = await rig1.cache.load(project.graphDir)
    const reviewTask = reviewTaskOf(graph)
    assert.equal(reviewTask.status, 'done', 'the review task was not marked done')
    const verify = reviewTask.history.find(entry => entry.op === 'status' && entry.to === 'done')
    const evidence = (verify?.evidence ?? []) as { kind: string, ref: string, exit: number, note: string }[]
    assert.ok(evidence.some(item => item.kind === 'check' && item.ref === 'review hz-task-1-r1-rrrrrr' && item.exit === 0 && /patch [0-9a-f]{30,}/.test(item.note) && item.note.includes('全审')), `the evidence is wrong: ${JSON.stringify(evidence)}`)
    assert.ok(roundsOf(reviewTask.history).some(round => round.k === 1 && round.blocking === 0 && round.depth === '全审' && round.childId === 'hz-task-1-r1-rrrrrr'), 'no round comment for the passing round')
    assert.match(rig1.sent.at(-1)?.content[0].text ?? '', /passed in round 1/)
  }
  finally {
    forgetAttempt('hz-task-1-a1-aaaaaa')
    forgetAttempt('hz-task-1-r1-rrrrrr')
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('a blocking first round stops with the marker and the stop draft; the gate reads the marker; the word of the person lifts it and a still-failing round stops again', async () => {
  const { project, rig1 } = await reviewFixture(project => ({ verdict: 'CHANGES_REQUESTED', commit: project.commit, findings: [BLOCKING], checked: ['acceptance:0', 'acceptance:1'] }))
  try {
    const round = async (childId: string, attempt: number): Promise<void> => {
      await reviewRound(rig1, project, childId, attempt, { verdict: 'CHANGES_REQUESTED', commit: project.commit, findings: [BLOCKING], checked: ['acceptance:0', 'acceptance:1'] })
    }
    const graph = await rig1.cache.load(project.graphDir)
    const reviewTask = reviewTaskOf(graph)
    const rounds = roundsOf(reviewTask.history)
    assert.equal(rounds.at(-1)?.stopped, true, 'the first round carries no stop marker')
    const draft = rig1.sent.at(-1)
    assert.ok(draft !== undefined && draft.source.kind === 'glm-hourness-loop', 'no stop draft to the holder')
    assert.equal((draft.source.hournessLoop as { entry: string }).entry, 'execute.stopped')
    assert.match(draft.content[0].text, /review rounds, 1 blocking findings left/)
    assert.match(draft.content[0].text, /propose_to_human \(kind question, parent task-1/)
    // The gate refuses the stopped task: the marker is in the graph, no answer since.
    const verdict = briefGate(graph, reviewTask, { args: { id: reviewTask.id, model: 'probe-model', why: 'w', depth: 'full' }, running: [], slots: 3, release: { ok: true, goal: { id: 'goal-1', at: '2026-11-04T08:00:00.000Z' } }, stopped: false, outputSchemaOk: true })
    assert.equal(verdict.ok, false, 'the stopped review task was not refused')
    assert.equal(verdict.ok ? '' : verdict.code, 'waiting_human')
    // The person answers in the chat; the word lifts the marker (the gate reads it gone) and the next failing round is the one they gave again (F21).
    const engine = openEngine(project.graphDir)
    const answered = await engine.apply('human', { op: 'comment', id: 'task-1', text: '按你说的修，再看一轮' })
    assert.ok(answered.ok, 'the fixture answer failed')
    await round('hz-task-1-r2-ssssss', 2)
    const after = await rig1.cache.load(project.graphDir)
    const roundsAfter = roundsOf(reviewTaskOf(after).history)
    // The count restarts at the person's word: the post-answer round is k=1 again, and it is the round they gave (F21).
    assert.equal(roundsAfter.at(-1)?.k, 1)
    assert.equal(roundsAfter.at(-1)?.stopped, true, 'the post-answer round did not stop again')
    assert.equal(rig1.sent.filter(notice => notice.source.kind === 'glm-hourness-loop').length, 2, 'no second stop draft')
  }
  finally {
    forgetAttempt('hz-task-1-a1-aaaaaa')
    forgetAttempt('hz-task-1-r1-rrrrrr')
    forgetAttempt('hz-task-1-r2-ssssss')
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('a full review that misses an acceptance item is voided once and re-dispatched with the same model; the second void goes back to the main agent', async () => {
  const { project, rig1 } = await reviewFixture(project => ({ verdict: 'APPROVED', commit: project.commit, findings: [], checked: ['acceptance:0'] }))
  try {
    const graph = await rig1.cache.load(project.graphDir)
    assert.ok(reviewTaskOf(graph).history.some(entry => entry.op === 'comment' && typeof entry.text === 'string' && entry.text.startsWith('审查作废 · ')), 'no void comment')
    assert.deepEqual(rig1.redispatches, [{ reviewTaskId: reviewTaskOf(graph).id, model: 'probe-review' }], 'the voided round was not re-dispatched with the same model')
    // The second unusable verdict goes back without another dispatch.
    await reviewRound(rig1, project, 'hz-task-1-r2-ssssss', 2, { verdict: 'APPROVED', commit: project.commit, findings: [], checked: ['acceptance:0'] })
    assert.equal(rig1.redispatches.length, 1, 'a second void re-dispatched again')
    assert.ok(rig1.sent.some(notice => notice.content[0].text.includes('voided and re-dispatched once already')), 'no voided-twice notice')
  }
  finally {
    forgetAttempt('hz-task-1-a1-aaaaaa')
    forgetAttempt('hz-task-1-r1-rrrrrr')
    forgetAttempt('hz-task-1-r2-ssssss')
    rmSync(project.root, { recursive: true, force: true })
  }
})

// ---- the module's design review record (§3.7.5) ----

test('a design review writes the module record with the directions digest and the dispatch time', async () => {
  const project = await presetProject()
  const rig1 = await rig(project, workerAttempt(project, 'hz-worker-unused-000000'))
  try {
    const engine = openEngine(project.graphDir)
    for (const seed of [
      { type: 'feature', id: 'module-a', title: 'Reports', parent: 'goal-1', stage: 'design', acceptance: ['the reports work'] },
      { type: 'decision', id: 'decision-a', title: 'One report format', parent: 'module-a' },
      { type: 'norm', id: 'norm-directions', title: '方向清单', parent: 'goal-1', acceptance: ['  reports before records  ', 'no server'] },
    ]) {
      const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node: seed })
      assert.ok(seeded.ok, `seeding ${String(seed.id)} failed`)
    }
    // A design review task is the harness's own proposal (isDesignReview reads the first history entry's actor).
    const reviewSeed = await engine.apply('harness', { op: 'propose', reason: 'test seed', node: { type: 'task', id: 'review-module-a', title: '审查：Reports', parent: 'module-a', kind: 'review', writeScope: [], acceptance: ['verdict APPROVED against every item of norm-directions'], edges: [{ type: 'source', to: 'decision-a' }] } })
    assert.ok(reviewSeed.ok, `seeding review-module-a failed: ${JSON.stringify(reviewSeed.ok ? {} : reviewSeed.error)}`)
    // The review task's dispatch comment carries the 派出 time (§3.7.5).
    const commented = await engine.apply('harness', { op: 'comment', id: 'review-module-a', text: `第 1 次派发 · hz-review-module-a-a1-zzzzzz · 模型 probe/probe-review，理由：the design is done · 简报 abcabcabcabc\npins: review-module-a@000000000000` })
    assert.ok(commented.ok, 'the fixture dispatch comment failed')
    const graph = await rig1.cache.load(project.graphDir)
    const digest = sha256Hex(['reports before records', 'no server'].join('\n')).slice(0, 12)
    const attempt: Attempt = { childId: 'hz-review-module-a-a1-zzzzzz', role: 'review', node: 'review-module-a', attempt: 1, graphDir: project.graphDir, worktree: project.root, depth: 'full', parentSession: 'main-1', provider: 'probe', model: 'probe-review', why: 'the design is done', plan: 'none', pins: renderPins(pinsOf(graph, graph.nodes.get('review-module-a')!, sha256Hex)) }
    registerAttempt(attempt)
    startHandback(rig1.deps, attempt, { stopReason: 'completed', structured: { verdict: 'APPROVED', commit: project.commit, findings: [], checked: ['direction:0', 'direction:1', 'acceptance:0'] } })
    await processed(attempt.childId)
    const after = await rig1.cache.load(project.graphDir)
    const record = after.nodes.get('module-a')!.history.find(entry => entry.op === 'comment' && typeof entry.text === 'string' && entry.text.startsWith('设计审查 · '))
    assert.ok(record !== undefined, 'no design review record on the module')
    assert.match(record.text, /^设计审查 · hz-review-module-a-a1-zzzzzz · APPROVED · 方向清单 [0-9a-f]{12} · 挡路 0 · 派出 \S+$/)
    assert.ok(record.text.includes(digest), `the digest does not match the trimmed directions: ${record.text}`)
    const rounds = roundsOf(after.nodes.get('review-module-a')!.history)
    assert.equal(rounds.at(-1)?.blocking, 0)
    assert.ok(after.nodes.get('review-module-a')!.status !== 'done', 'a design review task must not be marked done')
  }
  finally {
    forgetAttempt('hz-worker-unused-000000')
    forgetAttempt('hz-review-module-a-a1-zzzzzz')
    rmSync(rig1.project.root, { recursive: true, force: true })
  }
})
