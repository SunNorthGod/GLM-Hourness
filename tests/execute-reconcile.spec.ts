/**
 * The reconcile after a host restart (M7 design 0.6 §3.9.6, `execute.reconcile`
 * in src/execute/drive.ts): a dispatch the register lost with the host is
 * replayed from the `hournessHandback` session projection once, or commented
 * lost, listed in the drive status, and named in the next dispatch's brief
 * with the commits its branch already has; the trunk-advance check's
 * `reconcileTrunk` writes the evidence an ok line was left without and judges
 * a checked move no line recorded; a harness action another process started
 * and never ended runs again; a DSH goal completed while the graph goal is
 * not done is judged by the completion gate again; a return to design missed
 * before the restart is acknowledged; the completion gate's refusal runs it
 * once more without the event key; the projection folds what rc.3's capture
 * keeps (a `structured_output` call whose result is not an error).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pinsOf, renderPins } from '../src/graph/pins.ts'
import { forgetAttempt, renderDispatchComment, type Attempt } from '../src/execute/attempts.ts'
import { appendAdvance } from '../src/execute/check.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { createGraphCache, dispatchTool, realCommandRunner, type DispatchDeps } from '../src/execute/dispatch.ts'
import { createGit } from '../src/execute/git.ts'
import { handbackProjection, settleHandback, type HandbackDeps } from '../src/execute/handback.ts'
import { PROC } from '../src/execute/loop-link.ts'
import { pendingRelease } from '../src/execute/tiers.ts'
import type { LoopEventRecord } from '../src/loops/service.ts'
import type { AgentLike, ServiceLookup } from '../src/shared/dsh-min.ts'
import { completeGoal, driveRig, goalNow, graphWrite, liveOf, setStage, startedRig, withRig, type DriveRig } from './execute-drive-rig.ts'
import { GOAL, TASK } from './execute-repo.ts'
import { doneEvidence, withTrunkRig, type TrunkRig } from './execute-trunk.ts'
import { until } from './panel-helpers.ts'

const CHILD = 'hz-task-1-a1-lost01'

/** The record the loop board hands `execute.reconcile` for the holder's `hourness.host-started`. */
function hostStarted(rig: DriveRig, key: string): LoopEventRecord {
  return { id: 'ev-0000000000000001', event: 'hourness.host-started', at: new Date().toISOString(), project: rig.repo.root, session: 'main-1', key, payload: {}, merged: [] }
}

/** task-1 in progress with the harness's dispatch comment of attempt 1 (base: the main branch now), as dispatch_task leaves it. */
async function dispatchedTask(rig: DriveRig): Promise<string> {
  const graph = await rig.graph()
  const task = graph.nodes.get('task-1')
  assert.ok(task !== undefined)
  const base = rig.repo.git('rev-parse', 'main')
  const text = renderDispatchComment({ attempt: 1, childId: CHILD, base: { branch: 'main', sha: base.slice(0, 12) }, provider: 'probe', model: 'probe-model', why: 'one directory', review: { depth: 'full' }, brief: '000000000000', pins: renderPins(pinsOf(graph, task, sha256Hex)) })
  await graphWrite(rig, 'harness', { op: 'comment', id: 'task-1', text })
  await graphWrite(rig, 'harness', { op: 'status', id: 'task-1', to: 'doing', reason: `dispatch ${CHILD}` })
  return base
}

/** The handback processing over the rig's project, the way the row's deps reach the holder. */
function handbackDepsOf(rig: DriveRig): HandbackDeps {
  const lookup: ServiceLookup = { get: name => name === 'glmHournessData' ? { userHome: join(rig.repo.root, 'dsh-home') } : name === 'agents' ? rig.live.agents : undefined }
  return { lookup, cache: createGraphCache(() => {}), execDir: root => join(root, '.llm', 'execute'), report: () => {}, git: createGit(), runCommand: realCommandRunner }
}

/** The lines of the project's reconcile.jsonl; none before the first run. */
function reconcileLines(rig: DriveRig): { key: string, lost: number, replayed: number, evidence: number }[] {
  const file = join(rig.repo.root, '.llm', 'execute', 'reconcile.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { key: string, lost: number, replayed: number, evidence: number })
}

/** task-1's commit on its branch, dispatched with its review skipped and (when `checked`) passed by check_commit, then the main branch fast-forwarded to it outside every call, as before a restart. */
async function movedBeforeRestart(rig: TrunkRig, checked: boolean): Promise<{ readonly commit: string, readonly from: string }> {
  const from = rig.repo.git('rev-parse', 'main')
  const { commit } = rig.taskBranch({ 'src/feed.js': 'the feed\n' })
  await rig.dispatched('skip', commit)
  if (checked) assert.equal((await rig.check(commit)).status, 'started')
  rig.repo.git('merge', '--quiet', '--ff-only', commit)
  return { commit, from }
}

test('a lost dispatch whose session holds a structured_output is replayed from the projection through the handback processing once; the same key again is skipped', async () => {
  let deps: HandbackDeps | undefined
  const rig = await driveRig({ handback: (attempt, settlement) => settleHandback(deps!, attempt, settlement) })
  try {
    deps = handbackDepsOf(rig)
    const base = await dispatchedTask(rig)
    rig.repo.git('worktree', 'add', '--quiet', join(rig.repo.root, '.worktrees', 'hz-task-1'), '-b', 'hz/task-1')
    rig.projections.set(CHILD, { status: 'blocked', summary: 'the feed library is missing', commits: [], files: [], checks: [], questions: [], assumptions: [], lessons: [] })
    const result = await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:1'))
    assert.deepEqual(result, { outcome: 'done', tell: `Handed back from the session log after the restart: task-1 attempt 1 (${CHILD}); their handback notices came on their own.` })
    assert.equal(rig.handbacks.length, 1)
    const attempt: Attempt | undefined = rig.handbacks[0]?.attempt
    assert.deepEqual({ ...attempt, graphDir: undefined }, {
      childId: CHILD, node: 'task-1', attempt: 1, graphDir: undefined, provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'none',
      pins: attempt?.pins, parentSession: 'main-1', role: 'worker', worktree: join(rig.repo.root, '.worktrees', 'hz-task-1'), branch: 'hz/task-1', baseSha: base.slice(0, 12), review: 'full',
    })
    assert.deepEqual(rig.handbacks[0]?.settlement, { structured: rig.projections.get(CHILD), stopReason: 'completed' })
    assert.ok((await rig.comments('task-1')).some(text => text.startsWith(`第 1 次交回 · blocked · ${CHILD}`)), 'the handback comment is on the task')
    assert.deepEqual(reconcileLines(rig).map(line => [line.key, line.lost, line.replayed, line.evidence]), [['host-started:main-1:1', 0, 1, 0]])
    assert.ok(rig.metrics.some(event => event.event === 'execute.reconcile' && event.replayed === 1 && event.lost === 0))
    assert.deepEqual(await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:1')), { outcome: 'skipped', reason: 'already reconciled' })
    // Another key finds the handback comment: the dispatch is processed, nothing runs twice.
    assert.deepEqual(await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:2')), { outcome: 'done' })
    assert.equal(rig.handbacks.length, 1)
  }
  finally {
    rig.dispose()
  }
})

test('a lost dispatch with nothing to read back is commented lost and listed in the drive status, the holder\'s first step runs the reconcile, and the next dispatch\'s brief carries the commits its branch has', async () => {
  const rig = await driveRig({ reconcile: true })
  const started: { childId: string, prompt: string }[] = []
  try {
    await dispatchedTask(rig)
    const commit = rig.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, 'task-1: half of the feed')
    // The holder's first step in this process hands over hourness.host-started; without the board the fallback runs execute.reconcile.
    await rig.step()
    await until(async () => (await rig.comments('task-1')).includes(`第 1 次在宿主重启时丢失 · ${CHILD}`), 'the lost comment')
    await until(() => reconcileLines(rig).length === 1, 'the reconcile line')
    assert.deepEqual(reconcileLines(rig).map(line => [line.key, line.lost]), [[`host-started:main-1:${PROC}`, 1]])
    assert.deepEqual(rig.drive.status('main-1').lost, [{ task: 'task-1', attempt: 1, childId: CHILD }])
    assert.ok(rig.live.woken.some(entry => entry.kind === 'glm-hourness-loop' && entry.text.startsWith(`Lost when the app restarted, with nothing handed back: task-1 attempt 1 (${CHILD}).`)), 'the restart entry tells the holder')
    // A second reconcile does not comment the same loss again.
    await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:again'))
    assert.equal((await rig.comments('task-1')).filter(text => text.includes('在宿主重启时丢失')).length, 1)
    // The main agent dispatches the task again: the brief names what the branch already has.
    const subagents = {
      startActivation(spec: { readonly childId: string, readonly request: { readonly prompt: readonly { readonly text: string }[] } }) {
        started.push({ childId: spec.childId, prompt: spec.request.prompt[0]?.text ?? '' })
        return Promise.resolve({ childId: spec.childId, result: new Promise(() => {}), dispose: () => Promise.resolve() })
      },
      resolveMaxDepth: () => 1,
    }
    const deps: DispatchDeps = { lookup: { get: name => name === 'subagents' ? subagents : undefined }, graphDir: () => rig.repo.graphDir, cache: createGraphCache(() => {}), isMainAgent: () => true, designPresent: () => true, slots: 3, execDir: root => join(root, '.llm', 'execute'), report: () => {} }
    const main: AgentLike = { id: 'main-1', ctx: {} as never, session: { id: 'main-1', header: { id: 'main-1', cwd: rig.repo.root }, requestHeader: () => ({ config: { provider: 'probe', model: 'probe-main' } }) } as never }
    await dispatchTool(deps).execute({ id: 'task-1', model: 'probe-model', why: 'pick up the lost attempt' }, { callId: 'call-2', signal: new AbortController().signal, agent: main, deferContext: () => {}, concludeTurn: () => {} })
    assert.equal(started.length, 1)
    assert.ok(started[0]?.prompt.includes(`  - attempt 1: 上一次丢失：分支 hz/task-1 上已有提交 ${commit.slice(0, 12)}，先检查再接着做`), `the brief has no lost line:\n${started[0]?.prompt ?? ''}`)
    // Dispatched again: the loss drops off the status.
    await rig.step()
    assert.deepEqual(rig.drive.status('main-1').lost, [])
  }
  finally {
    for (const entry of started) forgetAttempt(entry.childId)
    rig.dispose()
  }
})

test('reconcileTrunk: an ok advance line whose task lacks its evidence gets it once (§3.9.6 step 5)', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit, from } = await movedBeforeRestart(rig, true)
    // The host wrote the line and left before the evidence.
    await appendAdvance(rig.execDir, { ref: 'local', from, to: commit, agent: rig.main.id, callId: 'call-gone', check: commit, tasks: ['task-1'], at: new Date().toISOString(), ok: true })
    assert.equal(await rig.gate.reconcileTrunk(rig.repo.root), 1)
    const task = await rig.node('task-1')
    assert.equal(task.status, 'done')
    assert.deepEqual(doneEvidence(task)[0], { kind: 'commit', ref: commit })
    assert.ok((await rig.comments('task-1')).includes(`进主干 ${commit.slice(0, 12)}（从 ${from.slice(0, 12)}）· 检查 ${commit.slice(0, 12)}`))
    assert.equal(await rig.gate.reconcileTrunk(rig.repo.root), 0, 'a second run writes nothing')
    assert.equal((await rig.advances()).length, 1)
  })
})

test('reconcileTrunk: a trunk moved to a checked commit with no line (the host left before the compare) is judged as after the call: the line, the evidence, the event', async () => {
  await withTrunkRig({}, async (rig) => {
    const { commit, from } = await movedBeforeRestart(rig, true)
    assert.deepEqual(await rig.advances(), [])
    assert.equal(await rig.gate.reconcileTrunk(rig.repo.root), 1)
    const [line] = await rig.advances()
    assert.deepEqual([line?.ref, line?.from, line?.to, line?.check, line?.tasks, line?.ok], ['local', from, commit, commit, ['task-1'], true])
    assert.equal((await rig.node('task-1')).status, 'done')
    assert.deepEqual(rig.events.map(seen => seen.event.event), ['hourness.trunk-advanced'])
    assert.deepEqual(rig.violations, [])
    assert.equal(await rig.gate.reconcileTrunk(rig.repo.root), 0)
    assert.equal((await rig.advances()).length, 1, 'the move is recorded once')
  })
})

test('reconcileTrunk: an unchecked trunk tip is left to the step compare; the reconcile judges only a commit with a passed check', async () => {
  await withTrunkRig({}, async (rig) => {
    await movedBeforeRestart(rig, false)
    assert.equal(await rig.gate.reconcileTrunk(rig.repo.root), 0)
    assert.deepEqual(await rig.advances(), [])
    assert.deepEqual(rig.violations, [])
  })
})

test('a harness action another process started and never ended runs again: execute.start-drive starts the drive once', () => withRig(() => driveRig(), async (rig) => {
  const graph = await rig.graph()
  const release = pendingRelease(graph, graph.nodes.get('goal-1')!)
  assert.ok(release !== undefined)
  const execDir = join(rig.repo.root, '.llm', 'execute')
  mkdirSync(execDir, { recursive: true })
  const key = `design-released:goal-1:${release.release}`
  appendFileSync(join(execDir, 'actions.jsonl'), `${JSON.stringify({ action: 'execute.start-drive', key, event: 'hourness.design-released', payload: { goal: 'goal-1', module: '', release: release.release }, at: new Date().toISOString(), proc: PROC + 1, phase: 'start' })}\n`)
  const result = await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:1'))
  assert.equal(result.outcome, 'done')
  assert.ok(rig.live.goalOf('main-1') !== undefined, 'the interrupted start-drive did not run again')
  assert.equal((await rig.comments('goal-1')).filter(text => text.startsWith('自动推进已开始')).length, 1)
  assert.ok(rig.metrics.some(event => event.event === 'execute.loop-fallback' && event.reason === 'interrupted' && event.key === key))
  assert.deepEqual(reconcileLines(rig).map(line => line.replayed), [1])
  const lines = readFileSync(join(execDir, 'actions.jsonl'), 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { phase: string, key: string })
  assert.deepEqual(lines.map(line => line.phase), ['start', 'start', 'end'])
  await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:2'))
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'create').length, 1, 'replayed once')
}))

test('a DSH goal completed while the graph goal is not done is judged by the completion gate again: passing, the graph goal is done with the reconcile evidence', () => withRig(() => startedRig({ nodes: [GOAL] }), async (rig) => {
  const graph = await rig.graph()
  const head = rig.repo.git('rev-parse', 'HEAD')
  await graphWrite(rig, 'harness', { op: 'comment', id: 'goal-1', text: `验收审查第 1 轮：APPROVED · 挡路 0 · hz-goal-1-acc-a1-abcdef · @${head.slice(0, 12)} · ${renderPins(pinsOf(graph, graph.nodes.get('goal-1')!, sha256Hex))}` })
  // Completed with no credential this process holds (the credential went with the host).
  const goal = goalNow(rig)
  rig.live.goals.complete(liveOf(rig), { id: goal.id, revision: goal.revision })
  await rig.settle()
  assert.equal((await rig.node('goal-1')).status, 'approved')
  const result = await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:1'))
  assert.deepEqual(result, { outcome: 'done' })
  const done = await rig.node('goal-1')
  assert.equal(done.status, 'done')
  assert.deepEqual(done.history.at(-1)?.evidence, [{ kind: 'check', ref: 'hourness completion gate (reconcile)', exit: 0 }])
  assert.deepEqual(reconcileLines(rig).map(line => line.evidence), [1])
}))

test('a DSH goal completed while the gate does not pass leaves the graph goal open and says what is missing', () => withRig(() => startedRig({ nodes: [GOAL] }), async (rig) => {
  const goal = goalNow(rig)
  rig.live.goals.complete(liveOf(rig), { id: goal.id, revision: goal.revision })
  await rig.settle()
  await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:1'))
  assert.equal((await rig.node('goal-1')).status, 'approved')
  assert.equal(rig.drive.status('main-1').state, 'Goal goal-1 is not done although its drive goal completed. Missing: the goal\'s acceptance review has not passed: dispatch_task goal-1 with a model and why; when the gaps are closed and the person asks to go on, call create_goal again.')
}))

test('a return to design missed before the restart is acknowledged and the active goal waits for the framework', () => withRig(() => startedRig(), async (rig) => {
  await setStage(rig, 'goal-1', 'design')
  // A new process: the drive has not seen the return.
  rig.restart()
  await rig.drive.reconcile(hostStarted(rig, 'host-started:main-1:1'))
  assert.ok((await rig.comments('goal-1')).some(text => text.startsWith('退回设计 · ')), 'no return comment')
  const view = goalNow(rig)
  assert.equal(view.phase, 'blocked')
  assert.equal(view.blockedReason?.code, 'hourness-design-wait')
}))

test('the completion gate\'s refusal reconciles once more without the event key', () => withRig(() => startedRig({ nodes: [GOAL, TASK] }), async (rig) => {
  await dispatchedTask(rig)
  assert.equal((await completeGoal(rig, 'call-a')).kind, 'deny')
  await until(async () => (await rig.comments('task-1')).includes(`第 1 次在宿主重启时丢失 · ${CHILD}`), 'the refusal\'s reconcile commented the loss')
  await until(() => reconcileLines(rig).length === 1, 'the reconcile line')
  assert.equal((await completeGoal(rig, 'call-b')).kind, 'deny')
  await until(() => reconcileLines(rig).length === 2, 'a second refusal reconciles again')
  assert.deepEqual(reconcileLines(rig).map(line => line.key), ['completion-gate:main-1:call-a', 'completion-gate:main-1:call-b'])
}))

test('the hournessHandback projection folds the last structured_output call whose result is not an error, in a subagent session only', () => {
  const call = (seq: number, id: string, args: unknown): { type: string, seq: number, time: number, data: unknown } => ({ type: 'assistant/message', seq, time: seq, data: { message: { content: [{ type: 'tool-call', id, name: 'structured_output', arguments: typeof args === 'string' ? args : JSON.stringify(args) }] } } })
  const result = (seq: number, id: string, isError: boolean): { type: string, seq: number, time: number, data: unknown } => ({ type: 'tool/result', seq, time: seq, data: { message: { toolCallId: id, isError, content: [] } } })
  let state = handbackProjection.init({ origin: 'subagent' }, 0)
  for (const event of [call(0, 'c1', { status: 'partial' }), result(1, 'c1', true), call(2, 'c2', { status: 'done' }), result(3, 'c2', false), call(4, 'c3', 'not json')]) state = handbackProjection.apply(state, event)
  assert.deepEqual(handbackProjection.wire.view(state), { status: 'done' })
  assert.deepEqual(handbackProjection.stateSchema.parse(JSON.parse(JSON.stringify(state))), state)
  const same = handbackProjection.apply(state, { type: 'user/message', seq: 5, time: 5, data: {} })
  assert.equal(same, state, 'an event it does not know keeps the state')
  let root = handbackProjection.init({ origin: 'user' }, 0)
  root = handbackProjection.apply(root, call(0, 'c1', { status: 'done' }))
  root = handbackProjection.apply(root, result(1, 'c1', false))
  assert.equal(handbackProjection.wire.view(root), null, 'a root session folds nothing')
  let forked = handbackProjection.init({ origin: 'subagent' }, 2)
  for (const event of [call(0, 'c1', { status: 'done' }), result(1, 'c1', false)]) forked = handbackProjection.apply(forked, event)
  assert.equal(handbackProjection.wire.view(forked), null, 'inherited events are not the session\'s own')
})
