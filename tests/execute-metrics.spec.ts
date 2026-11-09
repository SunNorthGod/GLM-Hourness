/**
 * The metric events of the execution layer through an injected exit (M7
 * design 0.6 §3.16 "验证用注入的出口", the m7 feature's point 3): every
 * `execute.*` event of the `MetricEvent` union comes at least once, with its
 * fields, while the scenarios below run the real code on temp repositories
 * and the fake rc.3 host; no event carries a string longer than 200
 * characters, so none carries conversation text. The pipeline that stores the
 * events is not built; the exit is the test's recorder here and the rigs'
 * own recorders (their `metrics`) where a rig installs one.
 *
 * The scenarios: the worker line (a refused dispatch, the GLM peak cap, a
 * dispatch, its handback and effective depth, a review round dispatched at
 * another depth, the goal's acceptance review); the plan and the question;
 * the trunk (a refused merge, failing checks up to the stop, a checked
 * fast-forward, a move outside every check); the drive (start, the
 * completion gate, a batch, await_human, the reconcile, the hand-over to a
 * board whose emit fails, the fallback's tell).
 *
 * `operate.report` and `operate.patrol` belong to P2 and P3 (the reports and
 * the patrol); nothing in the skeleton emits them, and the last case says so.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import { pinsOf, renderPins } from '../src/graph/pins.ts'
import { forgetAttempt, registerAttempt, registeredAttempt, reviewTargetOf } from '../src/execute/attempts.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { createGraphCache, dispatchTool, realCommandRunner } from '../src/execute/dispatch.ts'
import { createGit } from '../src/execute/git.ts'
import { startHandback, type HandbackDeps } from '../src/execute/handback.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import { askMainTool, submitPlanTool, type RequestsDeps } from '../src/execute/requests.ts'
import type { LoopsService, LoopEventRecord } from '../src/loops/service.ts'
import type { AgentLike, ToolExecutionContext } from '../src/shared/dsh-min.ts'
import { PEAK_MODE_SERVICE, type PeakModeService } from '../src/shared/peak-mode.ts'
import { completeGoal, resultOf, startedRig, withRig } from './execute-drive-rig.ts'
import { noticeHost } from './execute-helpers.ts'
import { GOAL, TASK, stageNodes, testRepo } from './execute-repo.ts'
import { withTrunkRig } from './execute-trunk.ts'
import { until } from './panel-helpers.ts'

type ExecuteKind = Extract<MetricEvent['event'], `execute.${string}`>

/** The fields §3.16's table gives each event, the ones every occurrence carries (the optional ones are left out). */
const REQUIRED: { readonly [K in ExecuteKind]: readonly (keyof Extract<MetricEvent, { event: K }>)[] } = {
  'execute.dispatch': ['role', 'node', 'attempt', 'childId', 'provider', 'model', 'sameAsMain', 'whyRef'],
  'execute.dispatch-refused': ['code'],
  'execute.plan': ['task', 'version', 'outcome', 'steps', 'waitedMs'],
  'execute.ask': ['task', 'waitedMs', 'outcome'],
  'execute.handback': ['task', 'attempt', 'status', 'commits', 'files', 'ms', 'outside'],
  'execute.review-depth': ['task', 'declared', 'effective'],
  'execute.review': ['task', 'round', 'depth', 'model', 'blocking', 'nonBlocking', 'demoted'],
  'execute.stop': ['node', 'kind', 'rounds'],
  'execute.check': ['commit', 'tasks', 'passed', 'kind', 'commands', 'setup', 'lockWaitMs'],
  'execute.advance': ['ref', 'way', 'from', 'to', 'tasks'],
  'execute.advance-refused': ['missing'],
  'execute.unchecked-advance': ['ref', 'from', 'to', 'missing'],
  'execute.goal': ['goal', 'op'],
  'execute.tier': ['tier', 'node'],
  'execute.completion-gate': ['goal', 'passed', 'gaps'],
  'execute.acceptance-review': ['goal', 'round', 'model', 'verdict', 'blocking'],
  'execute.reconcile': ['lost', 'replayed', 'evidence'],
  'execute.loop-entry': ['entry', 'key', 'delivered'],
  'execute.loop-fallback': ['entry', 'key', 'reason'],
  'execute.loop-contribute': ['row', 'accepted', 'dropped'],
  'execute.peak-cap': ['model', 'cap', 'running'],
}

/** The kinds of the union that later steps emit (P2's reports, P3's patrol). */
const LATER: readonly MetricEvent['event'][] = ['operate.report', 'operate.patrol']

/** Every event the scenarios handed over, in order. */
const seen: MetricEvent[] = []

const of = <K extends MetricEvent['event']>(kind: K): Extract<MetricEvent, { event: K }>[] =>
  seen.filter((event): event is Extract<MetricEvent, { event: K }> => event.event === kind)

/** Every string inside a value, however deep. */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsOf)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf)
  return []
}

const execAs = (agent: AgentLike, callId: string): ToolExecutionContext => ({ callId, signal: new AbortController().signal, agent, deferContext: () => {}, concludeTurn: () => {} })

test('the worker line: a refused dispatch and the GLM peak cap, a dispatch, its handback and effective depth, a review round at a lighter depth, the goal\'s acceptance review', async () => {
  const previous = setMetricSink(event => { seen.push(event) })
  const repo = testRepo()
  const childIds: string[] = []
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    // Each started activation settles when the case hands it its settlement.
    const settle = new Map<string, (settlement: unknown) => void>()
    const subagents = {
      startActivation(spec: { readonly childId: string }) {
        childIds.push(spec.childId)
        return Promise.resolve({ childId: spec.childId, result: new Promise((resolve) => { settle.set(spec.childId, resolve) }), dispose: () => Promise.resolve() })
      },
      resolveMaxDepth: () => 1,
    }
    let glmWorkerCap: number | undefined
    const peak: PeakModeService = {
      stateFor: () => glmWorkerCap === undefined ? undefined : { level: 'reduce', origin: 'human', peak: true, until: '2030-01-01T10:00:00.000Z', glmWorkerCap },
      stateForProject: () => undefined,
      peakHoldFor: () => undefined,
    }
    const { lookup } = noticeHost(repo, { subagents, [PEAK_MODE_SERVICE]: peak })
    const cache = createGraphCache(() => {})
    const execDir = (root: string): string => join(root, '.llm', 'execute')
    const handbackDeps: HandbackDeps = { lookup, cache, execDir, git: createGit(), runCommand: realCommandRunner, report: () => {} }
    const tool = dispatchTool({
      lookup, cache, execDir, slots: 3, graphDir: () => repo.graphDir, isMainAgent: () => true, designPresent: () => true, report: () => {},
      reviewTarget: (graph, reviewTask) => reviewTargetOf(graph, reviewTask, sha256Hex),
      onHandback: (attempt, settlement) => startHandback(handbackDeps, attempt, settlement),
    })
    const main: AgentLike = { id: 'main-1', ctx: {} as never, session: { id: 'main-1', header: { id: 'main-1', cwd: repo.root }, requestHeader: () => ({ config: { provider: 'probe', model: 'probe-main' } }) } as never }
    let calls = 0
    const call = async (args: Record<string, unknown>): Promise<{ readonly childId: string }> => await tool.execute(args, execAs(main, `call-${++calls}`)) as { readonly childId: string }
    const handBack = async (childId: string, structured: Record<string, unknown>): Promise<void> => {
      settle.get(childId)?.({ stopReason: 'completed', structured })
      await until(() => registeredAttempt(childId) === undefined, `the handback of ${childId} was processed`)
    }

    await assert.rejects(call({ id: 'task-1', why: 'no model named' }), /"code":"invalid"/)
    // A GLM subagent holds the one place the peak leaves: a second GLM dispatch is refused.
    registerAttempt({ childId: 'hz-task-0-a1-glm000', role: 'worker', node: 'task-0', attempt: 1, provider: 'probe', model: 'glm-5.3', why: 'holds the cap', plan: 'none', pins: 'pins: task-0@000000000000' })
    glmWorkerCap = 1
    await assert.rejects(call({ id: 'task-1', model: 'glm-5.3', why: 'a GLM model in the peak' }), /"code":"slots_full"/)
    forgetAttempt('hz-task-0-a1-glm000')
    glmWorkerCap = undefined
    assert.deepEqual(of('execute.peak-cap'), [{ event: 'execute.peak-cap', model: 'glm-5.3', cap: 1, running: 1 }])
    assert.deepEqual(of('execute.dispatch-refused').map(event => event.code), ['invalid', 'slots_full'])

    const worker = await call({ id: 'task-1', model: 'probe-model', why: 'one directory' })
    const tree = join(repo.root, '.worktrees', 'hz-task-1')
    mkdirSync(join(tree, 'src'), { recursive: true })
    writeFileSync(join(tree, 'src', 'feed.js'), 'the feed\n')
    execFileSync('git', ['add', 'src/feed.js'], { cwd: tree })
    execFileSync('git', ['commit', '--quiet', '-m', 'task-1: the feed'], { cwd: tree })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tree, encoding: 'utf8' }).trim()
    await handBack(worker.childId, { status: 'done', summary: 'the feed is written', commits: [commit], files: ['src/feed.js'], checks: [{ command: 'node --test', exit: 0 }], questions: [], assumptions: [], lessons: [] })
    assert.deepEqual(of('execute.handback').map(event => [event.task, event.status, event.commits]), [['task-1', 'done', 1]])
    assert.deepEqual(of('execute.review-depth').map(event => [event.task, event.declared, event.effective]), [['task-1', 'full', 'full']])

    const reviewTask = [...(await openEngine(repo.graphDir).load()).nodes.values()].find(node => node.parent === 'task-1' && node.kind === 'review')
    assert.ok(reviewTask !== undefined, 'the done handback made no review task')
    const review = await call({ id: reviewTask.id, model: 'probe-review', why: 'a small change', depth: 'light', depthWhy: 'one new file' })
    assert.deepEqual(of('execute.review-depth').at(-1), { event: 'execute.review-depth', task: 'task-1', declared: 'full', effective: 'light' }, 'the main agent lightened the recorded depth')
    await handBack(review.childId, { verdict: 'APPROVED', commit, findings: [], checked: ['acceptance:0'] })
    assert.deepEqual(of('execute.review').map(event => [event.task, event.round, event.depth, event.blocking]), [['task-1', 1, 'light', 0]])

    const trunk = repo.git('rev-parse', 'refs/heads/main')
    const acceptance = await call({ id: 'goal-1', model: 'probe-review', why: 'the work is on its branch' })
    await handBack(acceptance.childId, { verdict: 'APPROVED', commit: trunk, findings: [], checked: ['acceptance:0 the build log exits 0'], lessons: [] })
    assert.deepEqual(of('execute.acceptance-review').map(event => [event.goal, event.round, event.verdict]), [['goal-1', 1, 'APPROVED']])
    assert.deepEqual(of('execute.dispatch').map(event => event.role), ['worker', 'review', 'acceptance-review'])
  }
  finally {
    for (const childId of childIds) forgetAttempt(childId)
    setMetricSink(previous)
    repo.dispose()
  }
})

test('the plan and the question: a plan the check sends back, one put to the main agent that nobody answers, a question nobody answers', async () => {
  const previous = setMetricSink(event => { seen.push(event) })
  const repo = testRepo()
  const childId = 'hz-task-1-a1-metric'
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const { lookup } = noticeHost(repo)
    const cache = createGraphCache(() => {})
    const graph = await cache.load(repo.graphDir)
    const task = graph.nodes.get('task-1')
    assert.ok(task !== undefined)
    const worktree = join(repo.root, '.worktrees', 'hz-task-1')
    registerAttempt({ childId, role: 'worker', node: 'task-1', attempt: 1, graphDir: repo.graphDir, worktree, branch: 'hz/task-1', provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'required', pins: renderPins(pinsOf(graph, task, sha256Hex)) })
    const deps: RequestsDeps = { lookup, cache, graphDir: () => repo.graphDir, isMainAgent: agent => agent.id === 'main-1', designPresent: () => true, report: () => {}, planWaitMs: 30, askWaitMs: 30 }
    const exec = execAs({ id: childId, ctx: {} as never, session: { id: childId, header: { id: childId, cwd: worktree } } }, 'call-worker')
    const step = { title: 'Write the feed', paths: ['src/feed.js'], acceptance: ['it renders'] }
    await assert.rejects(submitPlanTool(deps).execute({ steps: [{ ...step, covers: [], verify: 'L1', commands: [] }] }, exec), /does not pass the checks/)
    assert.deepEqual(await submitPlanTool(deps).execute({ steps: [{ ...step, covers: [0], verify: 'L2', commands: ['node --test'] }] }, exec), { status: 'timeout', version: 1, hint: 'No review within 30 minutes; hand back with status plan-pending.' })
    assert.deepEqual(of('execute.plan').map(event => [event.task, event.version, event.outcome, event.steps]), [['task-1', 1, 'revise', 1], ['task-1', 1, 'to-main', 1], ['task-1', 1, 'timeout', 1]])
    assert.equal((await askMainTool(deps).execute({ question: 'Which feed format ships first?', assumption: 'RSS' }, exec)).status, 'timeout')
    assert.deepEqual(of('execute.ask').map(event => [event.task, event.outcome]), [['task-1', 'timeout']])
    assert.ok(of('execute.ask').every(event => event.waitedMs >= 0) && of('execute.plan').every(event => event.waitedMs >= 0))
  }
  finally {
    forgetAttempt(childId)
    setMetricSink(previous)
    repo.dispose()
  }
})

/** Exit 3 when the checked commit carries a file named FAIL. */
const FAILS_ON_FILE = '`$ node -e "process.exit(require(\'fs\').existsSync(\'FAIL\') ? 3 : 0)"`'

test('the trunk: a merge refused, three failing checks up to the stop, a checked fast-forward, a move outside every check', () => withTrunkRig({ gate: [FAILS_ON_FILE] }, async (rig) => {
  const { commit } = rig.taskBranch({ 'src/feed.js': 'the feed\n' })
  assert.equal((await rig.run('git merge --no-ff hz/task-1 -m merge-task-1')).result.isError, true)
  const broken = rig.repo.commitOn('broken', { FAIL: 'x\n' }, 'task-1: break it\n\nHourness-Task: task-1')
  for (let round = 0; round < 3; round++) await rig.check(broken)
  await rig.dispatched('skip', commit)
  assert.equal((await rig.check(commit)).status, 'started')
  assert.equal((await rig.run(`git merge --ff-only ${commit}`)).result.isError, false)
  const side = rig.repo.commitOn('side', { 'notes/side.txt': 'side\n' }, 'a side note')
  assert.equal((await rig.run(`git -c alias.tm="update-ref refs/heads/main ${side}" tm`)).result.isError, false)
  seen.push(...rig.metrics)
  assert.deepEqual(of('execute.check').map(event => event.passed), [false, false, false, true])
  assert.deepEqual(of('execute.stop').map(event => [event.node, event.kind, event.rounds]), [['task-1', 'check', 3]])
  assert.ok(of('execute.advance').some(event => event.ref === 'local' && event.to === commit))
  assert.ok(of('execute.unchecked-advance').some(event => event.to === side))
  assert.equal(of('execute.advance-refused').length, 1)
}))

const QUESTION = { type: 'question', id: 'question-m', parent: 'goal-1', title: 'Feed format', options: [{ key: 'A', label: 'RSS', gain: 'every reader has it', cost: 'older format' }, { key: 'B', label: 'Atom', gain: 'stricter format', cost: 'fewer readers' }], recommend: 'B', crux: 'do old readers matter', verdict: '是 → A；否 → B', weight: 'two-way' }

test('the drive: the start, the completion gate, a batch, await_human, the reconcile, a board whose emit fails and the fallback\'s tell', () => withRig(() => startedRig({ nodes: [GOAL, TASK, QUESTION] }), async (rig) => {
  assert.equal((await completeGoal(rig)).kind, 'deny')
  const accept = (): Promise<{ readonly kind: 'accept' }> => Promise.resolve({ kind: 'accept' })
  await rig.drive.batchMark({ name: 'propose_to_human', arguments: {}, agent: rig.agent(), callId: 'call-batch' }, resultOf({ tool: 'propose_to_human', kind: 'question', number: 1, text: 'Which feed format ships first?' }), accept)
  await rig.drive.awaitHuman.execute({ questions: ['question-m'], summary: 'Which feed format to ship.' }, execAs(rig.agent(), 'call-await'))
  const record: LoopEventRecord = { id: 'ev-00000000000000mt', event: 'hourness.host-started', at: rig.now().toISOString(), project: rig.repo.root, session: 'main-1', key: 'host-started:main-1:metrics', payload: {}, merged: [] }
  assert.equal((await rig.drive.reconcile(record)).outcome, 'done')
  // A board that takes every entry and then cannot take the event: the listening entry runs here.
  const board: LoopsService = {
    declaration: 'a board that is busy',
    contribute: (_source, contribution) => ({ ok: true, dispose: () => {}, accepted: contribution.entries.map(entry => entry.id), dropped: [] }),
    emit: () => Promise.resolve({ ok: false, code: 'busy', message: 'the board is busy' }),
    listens: () => true,
    recordRun: () => {},
  }
  rig.link.attach(board)
  rig.link.emit(rig.repo.root, 'main-1', { event: 'hourness.review-passed', key: 'review-passed:task-1:hz-task-1-r1-metric', payload: { task: 'task-1', round: 1 } })
  await until(() => rig.metrics.some(event => event.event === 'execute.loop-entry' && event.entry === 'execute.reviewed'), 'the fallback told the holder')
  seen.push(...rig.metrics)
  assert.ok(of('execute.goal').some(event => event.op === 'start' && event.goal === 'goal-1'))
  assert.ok(of('execute.goal').some(event => event.op === 'block' && event.code === 'hourness-waiting-human'))
  assert.ok(of('execute.completion-gate').some(event => !event.passed && event.gaps > 0))
  assert.ok(of('execute.tier').some(event => event.tier === 1 && event.batched === 1))
  assert.ok(of('execute.reconcile').length >= 1, 'the reconcile handed its counts over')
  assert.ok(of('execute.loop-contribute').some(event => event.row === 'glm-hourness/execute' && event.dropped.length === 0))
  assert.ok(of('execute.loop-fallback').some(event => event.entry === 'execute.reviewed' && event.reason === 'emit-failed'))
  assert.ok(of('execute.loop-entry').some(event => event.entry === 'execute.reviewed' && event.delivered))
}))

test('every execute.* event of the union came through the exit with its fields, none carries a string over 200 characters, and the reports\' events are left to P2 and P3', () => {
  for (const [kind, fields] of Object.entries(REQUIRED) as [ExecuteKind, readonly string[]][]) {
    const events = seen.filter(event => event.event === kind)
    assert.ok(events.length > 0, `${kind} never came`)
    for (const event of events) {
      for (const field of fields) assert.notEqual((event as unknown as Record<string, unknown>)[field], undefined, `${kind} lacks ${field}: ${JSON.stringify(event)}`)
    }
  }
  const known = new Set<string>([...Object.keys(REQUIRED), ...LATER])
  assert.deepEqual(seen.filter(event => !known.has(event.event)), [], 'an event outside the union came')
  assert.deepEqual(seen.filter(event => LATER.includes(event.event)), [], 'the skeleton emits no report or patrol event')
  const long = seen.filter(event => stringsOf(event).some(text => [...text].length > 200))
  assert.deepEqual(long, [], 'an event carries a long string')
})
