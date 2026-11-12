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
 * marker and the stop draft; a design review writes the module record; a
 * goal's acceptance review, dispatched through dispatch_task, writes the
 * round the completion gate reads, is voided on a wrong commit or missing
 * evidence, and stops on a second round that does not improve, and again on
 * the first failing round after the person's answer (§3.9.4).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import { goalCompletion } from '../src/graph/execute-stage.ts'
import { pinsOf, renderPins, staleness } from '../src/graph/pins.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { AgentLike, UserNotice } from '../src/shared/dsh-min.ts'
import { createGraphCache, dispatchTool, realCommandRunner, type DispatchDeps, type GraphCache } from '../src/execute/dispatch.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import { rulesReadOf, startHandback, type HandbackDeps } from '../src/execute/handback.ts'
import { policyDigests, renderPolicyLine } from '../src/execute/policy-digest.ts'
import { createGit } from '../src/execute/git.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { forgetAttempt, parseHandbackComment, recordCommunication, registerAttempt, registeredAttempt, renderDispatchComment, REVIEW_TASK_ACCEPTANCE, type Attempt } from '../src/execute/attempts.ts'
import { roundsOf } from '../src/execute/review.ts'
import { briefGate } from '../src/execute/brief.ts'
import type { LoopEmit } from '../src/execute/loop-link.ts'
import { gitSeed, noticeHost, seedGoalTask, stopSeam } from './execute-helpers.ts'
import { until } from './panel-helpers.ts'
import { doneEvidence, withTrunkRig, type TrunkRig } from './execute-trunk.ts'

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

/**
 * A repository with a released goal over one task, a worktree on the task's
 * branch, and one commit on top of the base; with `docs`, the base also
 * carries a component document at `src/guarded/AGENTS.md`, so it exists at
 * the handback's head (docs-at-hand design 0.3 §6.1).
 */
async function presetProject(options: { readonly docs?: boolean } = {}): Promise<Project> {
  const root = mkdtempSync(join(tmpdir(), 'glm-hourness-handback-'))
  mkdirSync(join(root, 'docs', 'graph'), { recursive: true })
  const graphDir = join(root, 'docs', 'graph')
  await seedGoalTask(graphDir, { title: 'Guard the writer', writeScope: ['src/guarded/'], acceptance: ['the writer is guarded', 'the guard is tested'], worktree: true })
  gitSeed(root)
  if (options.docs === true) {
    mkdirSync(join(root, 'src', 'guarded'), { recursive: true })
    writeFileSync(join(root, 'src', 'guarded', 'AGENTS.md'), '# Guarded\nWhat the writer may do.\n')
    git(root, ['add', 'src/guarded/AGENTS.md'])
    git(root, ['commit', '-q', '-m', 'component doc'])
  }
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

/** The docs-gap fixtures: the same project with the component document on the base. */
const presetDocsProject = (): Promise<Project> => presetProject({ docs: true })

interface Rig {
  readonly project: Project
  readonly cache: GraphCache
  readonly deps: HandbackDeps
  readonly sent: UserNotice[]
  /** The events handed to the loop seam (§2.5). */
  readonly emitted: readonly LoopEmit[]
  readonly redispatches: readonly { readonly reviewTaskId: string, readonly model: string }[]
  /** The attempt as the register holds it (the caller passes this one back to startHandback). */
  readonly registered: Attempt
}

async function rig(project: Project, attempt: Attempt, overrides: Partial<HandbackDeps> = {}): Promise<Rig> {
  const { lookup, sent } = noticeHost(project)
  const cache = createGraphCache(() => {})
  const graph = await cache.load(project.graphDir)
  const task = graph.nodes.get(attempt.node)
  assert.ok(task !== undefined, 'the fixture task is missing')
  const pins = renderPins(pinsOf(graph, task, sha256Hex))
  registerAttempt({ ...attempt, graphDir: project.graphDir, pins })
  const redispatches: { reviewTaskId: string, model: string }[] = []
  const seam = stopSeam(lookup, cache, project.graphDir)
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
    emit: seam.emit,
    ...overrides,
  }
  const registered: Attempt = { ...attempt, graphDir: project.graphDir, pins }
  return { project, cache, deps, sent, emitted: seam.emitted, redispatches, registered }
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
    // The loop board's event (§2.5): the declared payload, keyed with the childId.
    const handback = { event: 'hourness.handback', key: `handback:task-1:${attempt.childId}`, payload: { task: 'task-1', attempt: 1, status: 'done', depth: 'full', reviewTask: reviewTask.id, commits: 1, floorHit: '' } }
    assert.deepEqual(rig1.emitted, [handback])
    // Idempotent: rerunning processes nothing.
    startHandback(rig1.deps, rig1.registered, structuredDone(project))
    await new Promise(done => setTimeout(done, 150))
    assert.equal(handbacksOf(graph.nodes.get('task-1')!).length, 1, 'a rerun wrote a second handback comment')
    assert.deepEqual(rig1.emitted, [handback], 'a rerun handed the event over again')
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
    const event = rig1.emitted.find(item => item.event === 'hourness.handback')
    assert.equal(event?.payload.depth, 'full', 'the event carries the raised depth')
    assert.match(String(event?.payload.floorHit), /^\d+$/, 'the event names the class that was hit')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

// ---- the policy drift of a handback (reval design §4.1, §4.5) ----

/** Seed the must-review floor the way the execution specs do (a proposal the harness approves directly). */
async function seedFloor(project: Project, acceptance: readonly string[]): Promise<void> {
  const engine = openEngine(project.graphDir)
  const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node: { type: 'norm', id: 'norm-review-floor', title: '必须全审的改动', parent: 'goal-1', acceptance } })
  assert.ok(seeded.ok, `the floor seed failed: ${JSON.stringify(seeded.ok ? {} : seeded.error)}`)
}

/** The worker attempt of a dispatch whose policy line is the one the project's graph and rules file produce as they stand (reval tests). */
async function dispatchedWithPolicy(project: Project, childId: string, over: Partial<Attempt> = {}): Promise<Attempt> {
  const graph = await openEngine(project.graphDir).load()
  const line = renderPolicyLine(policyDigests(graph, await rulesReadOf(project.root), sha256Hex))
  assert.ok(line !== undefined && line.includes('checker@'))
  return workerAttempt(project, childId, { policy: line, ...over })
}

test('a policy change between the dispatch and the handback: the comment names the class, the notice is policy with its payload, the done flow continues (reval §4.1)', async () => {
  const project = await presetProject()
  try {
    const attempt = await dispatchedWithPolicy(project, 'hz-task-1-a1-eeeeee')
    const rig1 = await rig(project, attempt)
    try {
      await seedFloor(project, ['碰到必须全审：`files src/guarded/`'])
      const metrics: MetricEvent[] = []
      const previous = setMetricSink(event => { metrics.push(event) })
      try {
        recordCounts(attempt.childId)
        const { graph: after } = await runDoneHandback(rig1, project, attempt.childId)
        const comment = handbacksOf(after.nodes.get('task-1')!).at(-1)
        assert.ok(comment !== undefined)
        assert.deepEqual(comment.policyDrift, ['floor'], 'the parsed comment names the class that changed')
        const reviewTask = [...after.nodes.values()].find(entry => entry.parent === 'task-1' && entry.kind === 'review')
        assert.ok(reviewTask !== undefined, 'the done flow was not interrupted: the review task exists')
        const policyNotice = rig1.sent.find(notice => (notice.source.hournessExecute as { event?: string }).event === 'policy')
        assert.ok(policyNotice !== undefined, 'the holder was told')
        assert.deepEqual(policyNotice.source.hournessExecute, { event: 'policy', task: 'task-1', attempt: 1, childId: attempt.childId })
        assert.ok(policyNotice.content[0].text.includes('floor'), String(policyNotice.content[0].text))
        assert.ok(rig1.sent.at(-1)?.content[0].text.includes('handed back done'), 'the done notice still went out')
        assert.ok(rig1.emitted.some(entry => entry.event === 'hourness.handback'), 'the loop board still got the handback')
        const drift = metrics.find(event => event.event === 'execute.policy-drift')
        assert.ok(drift !== undefined && drift.event === 'execute.policy-drift' && drift.task === 'task-1' && drift.attempt === 1)
        assert.deepEqual(drift.classes, ['floor'])
      }
      finally {
        setMetricSink(previous)
      }
    }
    finally {
      forgetAttempt(attempt.childId)
    }
  }
  finally {
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('no policy change: the comment carries no 政策差 line and no policy notice goes out; a dispatch without a policy line is exempt (reval §4.2)', async () => {
  const project = await presetProject()
  try {
    const attempt = await dispatchedWithPolicy(project, 'hz-task-1-a1-ffffff')
    const rig1 = await rig(project, attempt)
    try {
      recordCounts(attempt.childId)
      const { graph: after, comment } = await runDoneHandback(rig1, project, attempt.childId)
      assert.equal(comment.policyDrift, undefined)
      assert.ok(!after.nodes.get('task-1')!.history.some(entry => entry.op === 'comment' && typeof entry.text === 'string' && entry.text.includes('政策差')))
      assert.equal(rig1.sent.find(notice => (notice.source.hournessExecute as { event?: string }).event === 'policy'), undefined)
    }
    finally {
      forgetAttempt(attempt.childId)
    }
    // The same change against a dispatch that predates the digest: exempt, nothing reported.
    const withFloor = await presetProject()
    try {
      await seedFloor(withFloor, ['碰到必须全审：`files src/guarded/`'])
      const bare = workerAttempt(withFloor, 'hz-task-1-a1-ffffff', { attempt: 2 })
      const rig2 = await rig(withFloor, bare)
      try {
        recordCounts(bare.childId)
        const { graph: after, comment } = await runDoneHandback(rig2, withFloor, bare.childId)
        assert.equal(comment.policyDrift, undefined)
        assert.equal(rig2.sent.find(notice => (notice.source.hournessExecute as { event?: string }).event === 'policy'), undefined)
        assert.ok([...after.nodes.values()].some(entry => entry.parent === 'task-1' && entry.kind === 'review'))
      }
      finally {
        forgetAttempt(bare.childId)
      }
    }
    finally {
      rmSync(withFloor.root, { recursive: true, force: true })
    }
  }
  finally {
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('the rules file unreadable at the handback: a recorded digest reports rules, a dispatch that could not read it reports nothing (reval §7)', async () => {
  const project = await presetProject()
  try {
    mkdirSync(join(project.root, 'docs', 'rules'), { recursive: true })
    writeFileSync(join(project.root, 'docs', 'rules', 'rules.json'), '{"version":2,"rules":{}}\n')
    const graph = await openEngine(project.graphDir).load()
    const line = renderPolicyLine(policyDigests(graph, await rulesReadOf(project.root), sha256Hex))
    assert.ok(line !== undefined && line.includes('rules@'))
    // The file becomes unreadable before the handback: the recorded digest reports the class.
    rmSync(join(project.root, 'docs', 'rules', 'rules.json'))
    mkdirSync(join(project.root, 'docs', 'rules', 'rules.json'))
    const attempt = workerAttempt(project, 'hz-task-1-a1-ababab', { policy: line })
    const rig1 = await rig(project, attempt)
    try {
      recordCounts(attempt.childId)
      const { comment } = await runDoneHandback(rig1, project, attempt.childId)
      assert.deepEqual(comment.policyDrift, ['rules'])
    }
    finally {
      forgetAttempt(attempt.childId)
    }
    // A dispatch that could not read the file either carries no rules segment: nothing to compare, nothing reported.
    const unreadableLine = renderPolicyLine(policyDigests(graph, { kind: 'unreadable' }, sha256Hex))
    assert.ok(unreadableLine !== undefined && !unreadableLine.includes('rules@'))
    const attempt2 = workerAttempt(project, 'hz-task-1-a2-ababab', { attempt: 2, policy: unreadableLine })
    const rig2 = await rig(project, attempt2)
    try {
      recordCounts(attempt2.childId)
      const { comment } = await runDoneHandback(rig2, project, attempt2.childId)
      assert.equal(comment.policyDrift, undefined)
      assert.equal(rig2.sent.find(notice => (notice.source.hournessExecute as { event?: string }).event === 'policy'), undefined)
    }
    finally {
      forgetAttempt(attempt2.childId)
    }
  }
  finally {
    rmSync(project.root, { recursive: true, force: true })
  }
})

// ---- the docs gaps of a done handback (docs-at-hand design 0.3 §6) ----

test('a done handback whose change touched a component with an AGENTS.md says the gap in the summary comment and the notice', async () => {
  const project = await presetDocsProject()
  const attempt = workerAttempt(project, 'hz-task-1-a1-dddddd')
  const rig1 = await rig(project, attempt)
  try {
    const { comment } = await runDoneHandback(rig1, project, attempt.childId)
    assert.deepEqual(comment.docs, ['src/guarded changed code but its AGENTS.md was not touched and the handback says nothing about it.'])
    const notice = rig1.sent.at(-1)
    assert.ok(notice !== undefined && notice.content[0].text.includes('Docs: src/guarded changed code but its AGENTS.md was not touched and the handback says nothing about it.'), String(notice?.content[0].text ?? 'no notice').slice(0, 200))
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('a handback with the docs line records it verbatim; a line that names another component still says the gap', async () => {
  const project = await presetDocsProject()
  const attempt = workerAttempt(project, 'hz-task-1-a1-eeeeee')
  const rig1 = await rig(project, attempt)
  try {
    const { comment } = await runDoneHandback(rig1, project, attempt.childId, { docs: 'still true: src/guarded' })
    assert.deepEqual(comment.docs, ['still true: src/guarded'], 'the component named is the one answered')
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
  const other = await presetDocsProject()
  const second = workerAttempt(other, 'hz-task-1-a1-ffffff')
  const rig2 = await rig(other, second)
  try {
    const { comment } = await runDoneHandback(rig2, other, second.childId, { docs: 'updated: elsewhere' })
    assert.deepEqual(comment.docs, ['updated: elsewhere', 'src/guarded changed code but its AGENTS.md was not touched and the handback says nothing about it.'])
  }
  finally {
    forgetAttempt(second.childId)
    rmSync(other.root, { recursive: true, force: true })
  }
})

test('a git that will not say whether a component document exists leaves the gaps uncomputed, once, degraded', async () => {
  const project = await presetDocsProject()
  const attempt = workerAttempt(project, 'hz-task-1-a1-gggggg')
  const degraded: string[] = []
  const rig1 = await rig(project, attempt, {
    report: (_s, state, reason) => { if (state === 'degraded') degraded.push(reason) },
    git: { ...createGit(), entryAt: () => Promise.resolve({ ok: false as const, reason: 'git gone' }) },
  })
  try {
    const { comment } = await runDoneHandback(rig1, project, attempt.childId)
    assert.deepEqual(comment.docs, ['文档缺口没算成：git 没说出组件的 AGENTS.md 在不在（git gone）'])
    assert.ok(degraded.some(reason => reason.includes('文档缺口没算成')), degraded.join(' | '))
  }
  finally {
    forgetAttempt(attempt.childId)
    rmSync(project.root, { recursive: true, force: true })
  }
})

test('a done handback declared skip hands hourness.review-skipped over and gets no review task', async () => {
  const project = await presetProject()
  const attempt = workerAttempt(project, 'hz-task-1-a1-cccccc', { review: 'skip' })
  const rig1 = await rig(project, attempt)
  try {
    const { graph } = await runDoneHandback(rig1, project, attempt.childId)
    assert.ok(![...graph.nodes.values()].some(entry => entry.parent === 'task-1' && entry.kind === 'review'), 'a skipped review got a review task')
    assert.deepEqual(rig1.emitted, [{ event: 'hourness.review-skipped', key: `review-skipped:task-1:${attempt.childId}`, payload: { task: 'task-1' } }])
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
    assert.deepEqual(rig1.emitted.at(-1), { event: 'hourness.review-passed', key: 'review-passed:task-1:hz-task-1-r1-rrrrrr', payload: { task: 'task-1', round: 1 } })
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
    // hourness.stopped, keyed with the time of the round comment that carries 停下 (D11); the draft comes from execute.stop-draft (§3.7.4).
    const stopRound = reviewTask.history.filter(entry => entry.op === 'comment' && entry.text?.endsWith('· 停下') === true).at(-1)
    const stopped = rig1.emitted.filter(event => event.event === 'hourness.stopped')
    assert.deepEqual(stopped, [{ event: 'hourness.stopped', key: `stopped:${reviewTask.id}:review-${stopRound?.at ?? ''}`, payload: { node: reviewTask.id, kind: 'review', rounds: 1 } }])
    await until(() => rig1.sent.some(notice => notice.source.kind === 'glm-hourness-loop'), 'the stop draft reaches the holder')
    const draft = rig1.sent.filter(notice => notice.source.kind === 'glm-hourness-loop').at(-1)
    assert.ok(draft !== undefined, 'no stop draft to the holder')
    assert.deepEqual(draft.source.hournessLoop, { entry: 'execute.stopped', key: stopped[0].key })
    assert.match(draft.content[0].text, /^task-1 stopped: 1 review rounds, 1 blocking findings left \(src\/guarded\/writer\.js\)\. Put it to the person in your next batch with propose_to_human \(kind question, parent task-1, sources \[/)
    assert.match(draft.content[0].text, /in the person's words, the four lines are: 「Guard the writer」审了 1 轮还没过 \| 背景：/)
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
    await until(() => rig1.sent.filter(notice => notice.source.kind === 'glm-hourness-loop').length === 2, 'a second stop draft, under a key of its own')
    assert.equal(new Set(rig1.emitted.filter(event => event.event === 'hourness.stopped').map(event => event.key)).size, 2)
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

// ---- the acceptance review of a goal (§3.9.4) ----

interface AcceptanceRig {
  readonly project: Project
  readonly cache: GraphCache
  readonly sent: UserNotice[]
  readonly emitted: readonly LoopEmit[]
  readonly metrics: MetricEvent[]
  /** The activations started, in order: what dispatch_task handed the subagents service. */
  readonly starts: { readonly childId: string, readonly label: string, readonly model: string, readonly cwd: string }[]
  /** dispatch_task {id: goal-1} as the main agent; resolves with the child id once its handback processing is done. */
  review(why?: string): Promise<string>
  /** dispatch_task {id: goal-1}, expected to refuse; the refusal. */
  refusal(): Promise<{ readonly code: string, readonly message: string }>
  /** The commit the main branch is at. */
  trunk(): string
  /** One commit on the main branch, so a new round has a new trunk commit. */
  advance(): void
  goal(): Promise<GraphNode>
  dispose(): void
}

/**
 * A goal whose only task is closed (dropped by the person, so the goal is
 * done without it), dispatched for its acceptance review through the real
 * dispatch_task: the subagents service settles each activation with the
 * verdict `settle` gives for the trunk commit and the activation's number,
 * a moment later so the dispatch comment lands first; the settlement goes
 * to the real handback processing, and a voided round re-dispatches the
 * way the row does.
 */
async function acceptanceRig(settle: (trunk: string, start: number) => unknown): Promise<AcceptanceRig> {
  const project = await presetProject()
  const engine = openEngine(project.graphDir)
  const current = await engine.load()
  const dropped = await engine.apply('human', { op: 'status', id: 'task-1', rev: current.revisions.get('task-1') ?? '', to: 'dropped', reason: 'test: the goal is done without it' })
  assert.ok(dropped.ok, `dropping the task failed: ${JSON.stringify(dropped.ok ? {} : dropped.error)}`)
  const trunk = (): string => git(project.root, ['rev-parse', 'refs/heads/main']).trim()
  const starts: { childId: string, label: string, model: string, cwd: string }[] = []
  const subagents = {
    startActivation(spec: { readonly childId: string, readonly label: string, readonly request: { readonly cwd: string, readonly agentOptions: { readonly model: string } } }) {
      starts.push({ childId: spec.childId, label: spec.label, model: spec.request.agentOptions.model, cwd: spec.request.cwd })
      const settlement = settle(trunk(), starts.length)
      return Promise.resolve({ childId: spec.childId, result: new Promise(done => setTimeout(() => done(settlement), 100)), dispose: () => Promise.resolve() })
    },
    resolveMaxDepth: () => 1,
  }
  const { lookup, sent } = noticeHost(project, { subagents })
  const cache = createGraphCache(() => {})
  const seam = stopSeam(lookup, cache, project.graphDir)
  const metrics: MetricEvent[] = []
  const previous = setMetricSink(event => { metrics.push(event) })
  const main: AgentLike = { id: 'main-1', ctx: {} as never, session: { id: 'main-1', header: { id: 'main-1', cwd: project.root }, requestHeader: () => ({ config: { provider: 'probe', model: 'probe-main' } }) } as never }
  const exec = (callId: string) => ({ callId, signal: new AbortController().signal, agent: main, deferContext: () => {}, concludeTurn: () => {} })
  const execDir = (root: string): string => join(root, '.llm', 'execute')
  const handbackDeps: HandbackDeps = {
    lookup,
    cache,
    execDir,
    report: () => {},
    git: createGit(),
    runCommand: realCommandRunner,
    emit: seam.emit,
    redispatch: async (id, attempt) => {
      try {
        await dispatchTool(dispatchDeps).execute({ id, model: attempt.model, why: attempt.why }, exec(`redispatch-${attempt.childId}`))
        return true
      }
      catch {
        return false
      }
    },
  }
  const dispatchDeps: DispatchDeps = {
    lookup,
    graphDir: () => project.graphDir,
    cache,
    isMainAgent: () => true,
    designPresent: () => true,
    slots: 3,
    execDir,
    report: () => {},
    onHandback: (attempt, settlement) => startHandback(handbackDeps, attempt, settlement),
  }
  let calls = 0
  return {
    project,
    cache,
    sent,
    emitted: seam.emitted,
    metrics,
    starts,
    async review(why = 'the tasks of the goal are closed') {
      const summary = await dispatchTool(dispatchDeps).execute({ id: 'goal-1', model: 'probe-review', why }, exec(`call-${++calls}`)) as { readonly childId: string }
      await processed(summary.childId)
      return summary.childId
    },
    async refusal() {
      try {
        await dispatchTool(dispatchDeps).execute({ id: 'goal-1', model: 'probe-review', why: 'again' }, exec(`call-${++calls}`))
      }
      catch (error) {
        return JSON.parse(error instanceof Error ? error.message : String(error)) as { code: string, message: string }
      }
      throw new Error('the dispatch was expected to refuse')
    },
    trunk,
    advance() {
      writeFileSync(join(project.root, `notes-${++calls}.txt`), 'more\n')
      git(project.root, ['add', '--', `notes-${calls}.txt`])
      git(project.root, ['commit', '-q', '-m', 'more notes'])
    },
    goal: async () => (await openEngine(project.graphDir).load()).nodes.get('goal-1')!,
    dispose() {
      for (const start of starts) forgetAttempt(start.childId)
      setMetricSink(previous)
      rmSync(project.root, { recursive: true, force: true })
    },
  }
}

const harnessTexts = (node: GraphNode): string[] => node.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && typeof entry.text === 'string' ? [entry.text] : [])

/** The completion gate's verdict on the goal (§3.9.3), with every git fact true and nothing running, so only the graph speaks. */
async function completionNow(rig1: AcceptanceRig): Promise<ReturnType<typeof goalCompletion>> {
  const graph = await openEngine(rig1.project.graphDir).load()
  return goalCompletion(graph, graph.nodes.get('goal-1')!, {
    onTrunk: () => true,
    isAncestor: () => true,
    running: new Set(),
    runningChecks: [],
    pinsFresh: (line) => {
      const changes = staleness(graph, line, sha256Hex)
      return changes.length === 0 ? undefined : changes.map(change => change.id).join(', ')
    },
  })
}

test('the acceptance review of a goal whose tasks are closed is dispatched in the main checkout; its passing round comment is what the completion gate reads (§3.9.3 point 5)', async () => {
  const rig1 = await acceptanceRig(trunk => ({ stopReason: 'completed', structured: { verdict: 'APPROVED', commit: trunk, findings: [], checked: ['acceptance:0 the build log .llm/logs/build.log exits 0'], lessons: [] } }))
  try {
    const before = await completionNow(rig1)
    assert.deepEqual(before.gaps, ['the goal\'s acceptance review has not passed: dispatch_task goal-1 with a model and why'])
    const childId = await rig1.review()
    assert.match(childId, /^hz-goal-1-acc-a1-[0-9a-z]{6}$/)
    assert.equal(rig1.starts[0]?.label, 'hourness acceptance goal-1 round 1')
    const trunk12 = rig1.trunk().slice(0, 12)
    const texts = harnessTexts(await rig1.goal())
    assert.ok(texts.includes(`验收审查交回 · ${childId} · APPROVED · 提交 ${trunk12} · 挡路 0 · 不挡路 0`), `no findings comment: ${texts.join(' | ')}`)
    const round = texts.find(text => text.startsWith('验收审查第 1 轮：'))
    assert.match(round ?? '', new RegExp(`^验收审查第 1 轮：APPROVED · 挡路 0 · ${childId} · @${trunk12} · pins: goal-1@[0-9a-f]{12}$`))
    assert.deepEqual(await completionNow(rig1), { ok: true, gaps: [] }, 'the gate does not read the passing round')
    assert.ok(rig1.metrics.some(event => event.event === 'execute.acceptance-review' && event.goal === 'goal-1' && event.round === 1 && event.verdict === 'APPROVED' && event.blocking === 0 && event.model === 'probe-review'))
    const notice = rig1.sent.at(-1)
    assert.equal(notice?.source.kind, 'glm-hourness-execute')
    assert.match(notice?.content[0].text ?? '', /passed in round 1 .* Call update_goal complete/)
    // A second review at the same trunk commit is busy: the round names it.
    assert.equal((await rig1.refusal()).code, 'busy')
    assert.equal(rig1.emitted.filter(event => event.event === 'hourness.stopped').length, 0)
  }
  finally {
    rig1.dispose()
  }
})

test('an acceptance verdict on another commit is voided and re-dispatched with the same model and reason; a second void, for an item checked without evidence, goes back to the main agent', async () => {
  const rig1 = await acceptanceRig((trunk, start) => ({
    stopReason: 'completed',
    structured: start === 1
      ? { verdict: 'APPROVED', commit: 'deadbeef0000', findings: [], checked: ['acceptance:0 build log'], lessons: [] }
      : { verdict: 'APPROVED', commit: trunk, findings: [], checked: ['acceptance:0'], lessons: [] },
  }))
  try {
    const first = await rig1.review('why this model')
    await until(() => rig1.starts.length === 2, 'the voided round was re-dispatched')
    await processed(rig1.starts[1].childId)
    assert.deepEqual(rig1.starts.map(start => start.model), ['probe-review', 'probe-review'])
    const texts = harnessTexts(await rig1.goal())
    assert.ok(texts.some(text => text.startsWith(`审查作废 · ${first} · the verdict names commit deadbeef0000, not the trunk commit`)), `no void comment: ${texts.join(' | ')}`)
    assert.equal(texts.filter(text => text.startsWith('审查作废 · ')).length, 1, 'the second void wrote a comment')
    assert.ok(texts.some(text => text.startsWith('第 2 次派发 · ') && text.includes('理由：why this model')), 'the re-dispatch did not keep the reason')
    assert.equal(texts.filter(text => text.startsWith('验收审查第 ')).length, 0, 'a voided round left a round comment')
    assert.ok(rig1.sent.some(notice => notice.content[0].text.includes('voided and re-dispatched once already')), 'no voided-twice notice')
    assert.equal(rig1.starts.length, 2, 'a second void re-dispatched again')
  }
  finally {
    rig1.dispose()
  }
})

test('a failing acceptance round asks the main agent to split it into tasks; a second round that does not improve stops with the marker, hourness.stopped kind acceptance and the stop draft (§3.7.3 for the goal, B)', async () => {
  const blocking = { id: 'f1', blocking: true, criterion: 'acceptance:0', where: 'site/', what: 'the build fails on the feed', fix: 'add the feed template' }
  const rig1 = await acceptanceRig(trunk => ({ stopReason: 'completed', structured: { verdict: 'CHANGES_REQUESTED', commit: trunk, findings: [blocking], checked: ['acceptance:0 npm run build exit 1'], lessons: [] } }))
  try {
    // Round 1: the person's release came before any round, so it is no answer to the review: the main agent splits the failure into tasks.
    await rig1.review()
    let texts = harnessTexts(await rig1.goal())
    assert.ok(texts.some(text => /^验收审查第 1 轮：CHANGES_REQUESTED · 挡路 1 · \S+ · @[0-9a-f]{12} · pins: goal-1@[0-9a-f]{12}$/.test(text)), 'round 1 stopped or is missing')
    const told = rig1.sent.at(-1)?.content[0].text ?? ''
    assert.match(told, /Split the failed acceptance into new tasks under the approved feature or task it belongs to/)
    assert.match(told, /acceptance:0 at site\/: the build fails on the feed/)
    assert.equal(rig1.emitted.filter(event => event.event === 'hourness.stopped').length, 0)
    // Round 2 on a new trunk commit, as many blocking findings: not converging, it stops.
    rig1.advance()
    await rig1.review()
    const goal = await rig1.goal()
    texts = harnessTexts(goal)
    const stopRound = goal.history.filter(entry => entry.op === 'comment' && entry.text?.startsWith('验收审查第 2 轮：') === true).at(-1)
    assert.ok(stopRound?.text?.endsWith(' · 停下'), `round 2 carries no stop marker: ${stopRound?.text ?? 'none'}`)
    const stopped = rig1.emitted.filter(event => event.event === 'hourness.stopped')
    assert.deepEqual(stopped, [{ event: 'hourness.stopped', key: `stopped:goal-1:acceptance-${stopRound?.at ?? ''}`, payload: { node: 'goal-1', kind: 'acceptance', rounds: 2 } }])
    assert.ok(rig1.metrics.some(event => event.event === 'execute.stop' && event.node === 'goal-1' && event.kind === 'acceptance' && event.rounds === 2))
    await until(() => rig1.sent.some(notice => notice.source.kind === 'glm-hourness-loop'), 'the stop draft reaches the holder')
    const draft = rig1.sent.filter(notice => notice.source.kind === 'glm-hourness-loop').at(-1)
    assert.deepEqual(draft?.source.hournessLoop, { entry: 'execute.stopped', key: stopped[0]?.key })
    assert.match(draft?.content[0].text ?? '', /^goal-1 stopped: 2 acceptance review rounds, 1 blocking findings left \(the blog builds\)\. Put it to the person/)
    assert.ok((await completionNow(rig1)).gaps.includes('the acceptance review was stopped: the person has not answered yet'))
    // The person answers after the stop: that word is an answer, the count restarts, and the first round that still fails stops again.
    const answered = await openEngine(rig1.project.graphDir).apply('human', { op: 'comment', id: 'goal-1', text: '再修一轮' })
    assert.ok(answered.ok)
    rig1.advance()
    await rig1.review()
    const after = (await rig1.goal()).history.filter(entry => entry.op === 'comment' && entry.text?.startsWith('验收审查第 ') === true).at(-1)?.text ?? ''
    assert.match(after, /^验收审查第 1 轮：CHANGES_REQUESTED · 挡路 1 · .* · 停下$/, 'the round after the answer did not stop')
    assert.equal(new Set(rig1.emitted.filter(event => event.event === 'hourness.stopped').map(event => event.key)).size, 2)
  }
  finally {
    rig1.dispose()
  }
})

/** The handback deps over the trunk rig's repository, the review-pass seam wired to the rig's gate. */
function trunkHandbackDeps(trunk: TrunkRig): HandbackDeps {
  return {
    lookup: trunk.checkDeps.lookup,
    cache: createGraphCache(() => {}),
    execDir: root => join(root, '.llm', 'execute'),
    report: () => {},
    git: createGit(),
    runCommand: realCommandRunner,
    trunkEvidence: (root, task) => trunk.gate.trunkEvidenceOf(root, task),
  }
}

/** Attempt `n` of the rig's task-1 dispatched at full depth and handed back done with `commit`: the review task appears. */
async function handedBack(trunk: TrunkRig, deps: HandbackDeps, n: number, commit: string, worktree: string): Promise<void> {
  const workerId = `hz-task-1-a${n}-tttttt`
  const dispatched = await openEngine(trunk.repo.graphDir).apply('harness', { op: 'comment', id: 'task-1', text: renderDispatchComment({ attempt: n, childId: workerId, provider: 'probe', model: 'probe-model', why: 'one directory', review: { depth: 'full' }, brief: '000000000000', pins: 'pins: task-1@000000000000' }) })
  assert.ok(dispatched.ok, 'the dispatch comment fixture was refused')
  const graph = await deps.cache.load(trunk.repo.graphDir)
  const worker: Attempt = { childId: workerId, role: 'worker', node: 'task-1', attempt: n, graphDir: trunk.repo.graphDir, worktree, branch: 'hz/task-1', baseSha: trunk.repo.git('rev-parse', 'main'), review: 'full', parentSession: 'main-1', provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'skipped', pins: renderPins(pinsOf(graph, graph.nodes.get('task-1')!, sha256Hex)) }
  registerAttempt(worker)
  try {
    startHandback(deps, worker, { stopReason: 'completed', structured: { status: 'done', summary: 'added the feed', commits: [commit], files: ['src/feed.js'], checks: [{ command: 'node --test', exit: 0 }], questions: [], assumptions: [], lessons: [] } })
    await processed(workerId)
  }
  finally {
    forgetAttempt(workerId)
  }
}

/** The first review round of the rig's task-1 passes `commit` at full depth; returns the review task's id. */
async function reviewPasses(trunk: TrunkRig, deps: HandbackDeps, commit: string, worktree: string): Promise<string> {
  const reviewerId = 'hz-task-1-r1-tttttt'
  const graph = await deps.cache.load(trunk.repo.graphDir)
  const reviewTask = reviewTaskOf(graph)
  const reviewer: Attempt = { childId: reviewerId, role: 'review', node: reviewTask.id, attempt: 1, graphDir: trunk.repo.graphDir, worktree, depth: 'full', parentSession: 'main-1', provider: 'probe', model: 'probe-review', why: 'the change is small', plan: 'none', pins: renderPins(pinsOf(graph, reviewTask, sha256Hex)) }
  registerAttempt(reviewer)
  try {
    startHandback(deps, reviewer, { stopReason: 'completed', structured: { verdict: 'APPROVED', commit, findings: [], checked: ['acceptance:0'] } })
    await processed(reviewerId)
  }
  finally {
    forgetAttempt(reviewerId)
  }
  return reviewTask.id
}

test('a review that passes after the task reached the trunk marks the reviewed task done with the commit and test evidence of that advance and removes its clean worktree (D2, D3)', async () => {
  await withTrunkRig({}, async (trunk) => {
    const { commit, worktree } = trunk.taskBranch({ 'src/feed.js': 'feed\n' })
    const deps = trunkHandbackDeps(trunk)
    // The worker's done handback: the full-depth review task appears.
    await handedBack(trunk, deps, 1, commit, worktree)
    // The trunk advances before the review: the task waits in progress.
    await trunk.check(commit)
    assert.equal((await trunk.run(`git merge --ff-only ${commit}`)).result.isError, false)
    assert.notEqual((await trunk.node('task-1')).status, 'done')
    assert.ok((await trunk.comments('task-1')).some(text => text.endsWith(' · 审查还没过，过了再记完成')))
    assert.equal(existsSync(worktree), true, 'the reviewer still needs the worktree')
    // The review passes: the reviewed task goes done with the evidence of its advance.
    // today: the pass looked for a verify entry no task carries and left the reviewed task in progress.
    const reviewTask = await reviewPasses(trunk, deps, commit, worktree)
    const task = await trunk.node('task-1')
    assert.equal(task.status, 'done')
    const evidence = doneEvidence(task)
    assert.deepEqual(evidence[0], { kind: 'commit', ref: commit })
    assert.deepEqual(evidence.slice(1).map(item => [item.kind, item.exit]), [['test', 0], ['test', 0], ['test', 0]])
    assert.equal((await trunk.node(reviewTask)).status, 'done')
    assert.equal(existsSync(worktree), false, 'the clean worktree of the completed task is removed')
  })
})

/** The main agent reopens the rig's done task-1; the worktree comes back on the task branch with one rework commit carrying the trailer, which is returned. */
async function reopenWithRework(trunk: TrunkRig, worktree: string): Promise<string> {
  const engine = openEngine(trunk.repo.graphDir)
  const reopened = await engine.apply('llm', { op: 'status', id: 'task-1', rev: (await engine.load()).revisions.get('task-1')!, to: 'doing', reason: 'rework the feed' })
  assert.ok(reopened.ok, 'the reopen was refused')
  trunk.repo.git('worktree', 'add', '--quiet', worktree, 'hz/task-1')
  writeFileSync(join(worktree, 'src', 'feed.js'), 'feed 2\n')
  trunk.repo.git('-C', worktree, 'commit', '--quiet', '-am', 'task-1: rework the feed\n\nHourness-Task: task-1')
  return trunk.repo.git('-C', worktree, 'rev-parse', 'HEAD')
}

test('a reopened task whose rework review passes before the rework reaches the trunk stays in progress: the earlier attempt\'s advance is no evidence for it', async () => {
  await withTrunkRig({}, async (trunk) => {
    const { commit, worktree } = trunk.taskBranch({ 'src/feed.js': 'feed\n' })
    await trunk.dispatched('skip', commit)
    await trunk.check(commit)
    assert.equal((await trunk.run(`git merge --ff-only ${commit}`)).result.isError, false)
    assert.equal((await trunk.node('task-1')).status, 'done')
    const rework = await reopenWithRework(trunk, worktree)
    const deps = trunkHandbackDeps(trunk)
    await handedBack(trunk, deps, 2, rework, worktree)
    // today: the pass took the first attempt's advance line and completed the rework with the old commit's evidence.
    const reviewTask = await reviewPasses(trunk, deps, rework, worktree)
    assert.equal((await trunk.node(reviewTask)).status, 'done')
    const task = await trunk.node('task-1')
    assert.equal(task.status, 'doing')
    assert.equal(task.history.filter(entry => entry.op === 'status' && entry.to === 'done').length, 1, 'only the first attempt\'s completion')
    assert.equal(existsSync(worktree), true, 'the rework\'s worktree stays until it reaches the trunk')
  })
})

/**
 * Attempt 1 of the rig's task-1 dispatched at full depth, reviewed, merged and
 * done; the task reopened and attempt 2 dispatched at full depth and handed
 * back done, its rework checked. The review task stays done from attempt 1:
 * the handback reuses it.
 */
async function reworkAfterReview(trunk: TrunkRig): Promise<{ readonly rework: string, readonly worktree: string, readonly reviewTask: string }> {
  const { commit, worktree } = trunk.taskBranch({ 'src/feed.js': 'feed\n' })
  const deps = trunkHandbackDeps(trunk)
  await handedBack(trunk, deps, 1, commit, worktree)
  const reviewTask = await reviewPasses(trunk, deps, commit, worktree)
  await trunk.check(commit)
  const first = await trunk.run(`git merge --ff-only ${commit}`)
  assert.equal(first.result.isError, false, first.text)
  assert.equal((await trunk.node('task-1')).status, 'done', 'the reviewed first attempt completes at its advance')
  const rework = await reopenWithRework(trunk, worktree)
  await handedBack(trunk, deps, 2, rework, worktree)
  assert.equal((await trunk.node(reviewTask)).status, 'done', 'the rework reuses the review task attempt 1 finished')
  await trunk.check(rework)
  return { rework, worktree, reviewTask }
}

test('a reopened, reviewed task whose rework reaches the trunk before its review stays in progress with 审查还没过: the earlier attempt\'s review does not settle the rework (review N4)', async () => {
  await withTrunkRig({}, async (trunk) => {
    const { rework, worktree } = await reworkAfterReview(trunk)
    const advanced = await trunk.run(`git merge --ff-only ${rework}`)
    assert.equal(advanced.result.isError, false, advanced.text)
    // today: the done review task of attempt 1 counted as the rework's review, and the task completed with no review of the rework.
    const task = await trunk.node('task-1')
    assert.equal(task.status, 'doing')
    assert.equal(task.history.filter(entry => entry.op === 'status' && entry.to === 'done').length, 1, 'only the first attempt\'s completion')
    assert.ok((await trunk.comments('task-1')).some(text => text.startsWith(`进主干 ${rework.slice(0, 12)}`) && text.endsWith(' · 审查还没过，过了再记完成')))
    assert.equal(existsSync(worktree), true, 'the rework\'s reviewer still needs the worktree')
  })
})

test('the floor clause asks for a full review of the rework: a reopened task whose commands hit the floor cannot reach the trunk on the earlier attempt\'s full review', async () => {
  await withTrunkRig({ taskHit: true }, async (trunk) => {
    const { rework } = await reworkAfterReview(trunk)
    const before = trunk.repo.git('rev-parse', 'main')
    // today: the floor clause read the done review task of attempt 1 as the rework's full review and let the advance through.
    const { result, text } = await trunk.run(`git merge --ff-only ${rework}`)
    assert.equal(result.isError, true)
    assert.match(text, /the task of the task-1 trailer has no passed full review \(the must-review floor binds the trunk\)/)
    assert.ok(text.endsWith('Exception: dispatch a full review of task-1'), text)
    assert.equal(trunk.repo.git('rev-parse', 'main'), before)
  })
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
