/**
 * The metric events of the execution layer through an injected exit (M7
 * design 0.6 §3.16 "验证用注入的出口", the m7 feature's point 3): every
 * `execute.*` event of the `MetricEvent` union comes at least once, with its
 * fields, while the scenarios below run the real code on temp repositories
 * and the fake rc.3 host; no event carries a string longer than 200
 * characters, so none carries conversation text. An L2 test also wires the
 * real `execute` row to `METRICS_SERVICE` and verifies the events land in
 * `.llm/metrics/` with `rejected === 0`.
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
import { createGateLauncher } from '../src/execute/gate-provider.ts'
import { createGit } from '../src/execute/git.ts'
import { startHandback, type HandbackDeps } from '../src/execute/handback.ts'
import { apply as executeApply } from '../src/execute/index.ts'
import { emitMetric, executeMetricWhere, setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import { askMainTool, submitPlanTool, type RequestsDeps } from '../src/execute/requests.ts'
import type { WalkDeps } from '../src/execute/walk.ts'
import { apply as metricsApply } from '../src/metrics/index.ts'
import { readLog } from '../src/metrics/read.ts'
import { LOOPS_SERVICE, type LoopsService, type LoopEventRecord } from '../src/loops/service.ts'
import type { AgentLike, InjectableServices, ToolDefinitionLike, ToolExecutionContext } from '../src/shared/dsh-min.ts'
import { PEAK_MODE_SERVICE, type PeakModeService } from '../src/shared/peak-mode.ts'
import { completeGoal, resultOf, startedRig, withRig } from './execute-drive-rig.ts'
import { noticeHost } from './execute-helpers.ts'
import { GOAL, TASK, gateNode, stageNodes, testRepo } from './execute-repo.ts'
import { withTrunkRig } from './execute-trunk.ts'
import { fakeRuntime } from './fake-rc3.ts'
import { until } from './panel-helpers.ts'

type ExecuteKind = Extract<MetricEvent['event'], `execute.${string}`>

/** The fields §3.16's table gives each event, the ones every occurrence carries (the optional ones are left out). */
const REQUIRED: { readonly [K in ExecuteKind]: readonly (keyof Extract<MetricEvent, { event: K }>)[] } = {
  'execute.dispatch': ['role', 'target', 'n', 'child', 'provider', 'model', 'think', 'sameAsMain', 'whyRef'],
  'execute.dispatch-refused': ['code'],
  'execute.plan': ['task', 'version', 'result', 'steps', 'waitedMs'],
  'execute.ask': ['task', 'waitedMs', 'result'],
  'execute.handback': ['task', 'n', 'status', 'stopReason', 'commits', 'files', 'ms', 'outside'],
  'execute.review-depth': ['task', 'declared', 'effective', 'floors', 'unparsed'],
  'execute.policy-drift': ['task', 'attempt', 'classes'],
  'execute.review': ['task', 'round', 'depth', 'model', 'blocking', 'nonBlocking', 'downgraded'],
  'execute.stop': ['node', 'kind', 'rounds'],
  'execute.check': ['commit', 'ok', 'kind', 'cmds', 'exits', 'ms', 'setup', 'lockMs'],
  'execute.walk': ['phase', 'goal', 'job'],
  'execute.advance': ['ref', 'how', 'from', 'to', 'by', 'checkAfter', 'reviewPending', 'incomingFloor'],
  'execute.advance-refused': ['missing'],
  'execute.unchecked-advance': ['ref', 'from', 'to', 'missing'],
  'execute.goal': ['goal', 'op'],
  'execute.tier': ['tier', 'node', 'running', 'stale', 'told', 'handed'],
  'execute.completion-gate': ['goal', 'ok', 'gaps'],
  'execute.acceptance-review': ['goal', 'round', 'model', 'verdict', 'blocking'],
  'execute.reconcile': ['lost', 'redone', 'evidence'],
  'execute.loop-entry': ['entry', 'key', 'sent'],
  'execute.loop-fallback': ['entry', 'key', 'why', 'waitedS'],
  'execute.loop-contribute': ['row', 'accepted', 'dropped', 'reasons'],
  'execute.peak-cap': ['model', 'cap', 'running'],
}

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
    registerAttempt({ childId: 'hz-task-0-a1-glm000', role: 'worker', node: 'task-0', attempt: 1, graphDir: repo.graphDir, provider: 'probe', model: 'glm-5.3', why: 'holds the cap', plan: 'none', pins: 'pins: task-0@000000000000' })
    glmWorkerCap = 1
    await assert.rejects(call({ id: 'task-1', model: 'glm-5.3', why: 'a GLM model in the peak' }), /"code":"slots_full"/)
    forgetAttempt('hz-task-0-a1-glm000')
    glmWorkerCap = undefined
    assert.deepEqual(of('execute.peak-cap'), [{ event: 'execute.peak-cap', model: 'glm-5.3', cap: 1, running: 1 }])
    assert.deepEqual(of('execute.dispatch-refused').map(event => event.code), ['invalid', 'slots_full'])

    const worker = await call({ id: 'task-1', model: 'probe-model', why: 'one directory' })
    // Change rules policy between dispatch and handback so execute.policy-drift is emitted.
    mkdirSync(join(repo.root, 'docs', 'rules'), { recursive: true })
    writeFileSync(join(repo.root, 'docs', 'rules', 'rules.json'), '{"version":2,"rules":{}}\n')
    const tree = join(repo.root, '.worktrees', 'hz-task-1')
    mkdirSync(join(tree, 'src'), { recursive: true })
    writeFileSync(join(tree, 'src', 'feed.js'), 'the feed\n')
    execFileSync('git', ['add', 'src/feed.js'], { cwd: tree })
    execFileSync('git', ['commit', '--quiet', '-m', 'task-1: the feed'], { cwd: tree })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tree, encoding: 'utf8' }).trim()
    await handBack(worker.childId, { status: 'done', summary: 'the feed is written', commits: [commit], files: ['src/feed.js'], checks: [{ command: 'node --test', exit: 0 }], questions: [], assumptions: [], lessons: [] })
    assert.deepEqual(of('execute.handback').map(event => [event.task, event.status, event.commits]), [['task-1', 'done', 1]])
    assert.deepEqual(of('execute.policy-drift').map(event => [event.task, event.attempt, event.classes]), [['task-1', 1, ['rules']]])
    assert.deepEqual(of('execute.review-depth').map(event => [event.task, event.declared, event.effective]), [['task-1', 'full', 'full']])

    const reviewTask = [...(await openEngine(repo.graphDir).load()).nodes.values()].find(node => node.parent === 'task-1' && node.kind === 'review')
    assert.ok(reviewTask !== undefined, 'the done handback made no review task')
    const review = await call({ id: reviewTask.id, model: 'probe-review', why: 'a small change', depth: 'light', depthWhy: 'one new file' })
    assert.deepEqual(of('execute.review-depth').at(-1), { event: 'execute.review-depth', task: 'task-1', declared: 'full', effective: 'light', floors: [], unparsed: false }, 'the main agent lightened the recorded depth')
    await handBack(review.childId, { verdict: 'APPROVED', commit, findings: [], checked: ['acceptance:0'] })
    assert.deepEqual(of('execute.review').map(event => [event.task, event.round, event.depth, event.blocking, event.downgraded]), [['task-1', 1, 'light', 0, 0]])

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
    const exec = execAs({ id: childId, ctx: {} as never, session: { id: childId, header: { id: childId, cwd: worktree }, deriveMessages: () => [] } }, 'call-worker')
    const step = { title: 'Write the feed', paths: ['src/feed.js'], acceptance: ['it renders'] }
    await assert.rejects(submitPlanTool(deps).execute({ steps: [{ ...step, covers: [], verify: 'L1', commands: [] }] }, exec), /does not pass the checks/)
    assert.deepEqual(await submitPlanTool(deps).execute({ steps: [{ ...step, covers: [0], verify: 'L2', commands: ['node --test'] }] }, exec), { status: 'timeout', version: 1, hint: 'No review within 30 minutes; hand back with status plan-pending.' })
    assert.deepEqual(of('execute.plan').map(event => [event.task, event.version, event.result, event.steps]), [['task-1', 1, 'revise', 1], ['task-1', 1, 'to-main', 1], ['task-1', 1, 'timeout', 1]])
    assert.equal((await askMainTool(deps).execute({ question: 'Which feed format ships first?', assumption: 'RSS' }, exec) as { status: string }).status, 'timeout')
    assert.deepEqual(of('execute.ask').map(event => [event.task, event.result]), [['task-1', 'timeout']])
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
  assert.deepEqual(of('execute.check').map(event => event.ok), [false, false, false, true])
  assert.deepEqual(of('execute.stop').map(event => [event.node, event.kind, event.rounds]), [['task-1', 'check', 3]])
  assert.ok(of('execute.advance').some(event => event.ref === 'local' && event.to === commit))
  assert.ok(of('execute.unchecked-advance').some(event => event.to === side))
  assert.equal(of('execute.advance-refused').length, 1)
}))

const WALK_DRIVER = [
  'import { mkdirSync, writeFileSync } from "node:fs"',
  'const flow = process.argv[2]',
  'const dir = ".hourness/walk/" + flow',
  'mkdirSync(dir, { recursive: true })',
  'writeFileSync(dir + "/report.json", JSON.stringify({ flow, steps: [{ id: "step-1", ok: true, said: "done" }] }))',
].join('\n')

test('the walk: dispatching a goal with an automatic flow emits execute.walk start and end', async () => {
  const previous = setMetricSink(event => { seen.push(event) })
  const repo = testRepo()
  try {
    repo.commit({ 'walk-driver.mjs': WALK_DRIVER }, 'walk driver')
    await stageNodes(repo.graphDir, [
      GOAL,
      gateNode(['`$ node -e "process.exit(0)"`', '`walk 命令 $ node walk-driver.mjs {flow}`']),
      { type: 'role', id: 'role-1', title: 'Reader', parent: 'goal-1' },
      { type: 'flow', id: 'flow-1', title: 'Walk one', parent: 'role-1', body: '走法：命令 · 预计 30 秒' },
      { type: 'step', id: 'step-1', title: 'Step one', parent: 'flow-1', acceptance: ['it works'] },
      { ...TASK, kind: 'test', edges: [{ type: 'serves', to: 'step-1' }] },
    ])
    const engine = openEngine(repo.graphDir)
    const loaded = await engine.load()
    const rev = loaded.revisions.get('flow-1') ?? ''
    assert.ok((await engine.apply('human', { op: 'link', id: 'flow-1', type: 'next', to: 'step-1', rev, reason: 'test seed' })).ok)
    const taskRev = loaded.revisions.get('task-1') ?? ''
    assert.ok((await engine.apply('human', { op: 'status', id: 'task-1', rev: taskRev, to: 'done', evidence: [{ kind: 'check', ref: 'npm test', exit: 0 }], reason: 'test seed' })).ok)
    const subagents = {
      startActivation: () => Promise.resolve({ childId: 'unused', result: Promise.resolve({ stopReason: 'completed' }), dispose: () => Promise.resolve() }),
      resolveMaxDepth: () => 1,
    }
    const { lookup } = noticeHost(repo, { subagents })
    const cache = createGraphCache(() => {})
    let walkDone = false
    const walkDeps: WalkDeps = {
      execDir: root => join(root, '.llm', 'execute'),
      git: createGit(),
      launcher: createGateLauncher(),
      report: () => {},
      emit: (_project, _session, event) => { if (event.event === 'hourness.walk-done') walkDone = true },
    }
    const tool = dispatchTool({
      lookup, cache, execDir: root => join(root, '.llm', 'execute'), slots: 3, graphDir: () => repo.graphDir, isMainAgent: () => true, designPresent: () => true, report: () => {}, walk: walkDeps,
    })
    const main: AgentLike = { id: 'main-1', ctx: {} as never, session: { id: 'main-1', header: { id: 'main-1', cwd: repo.root }, requestHeader: () => ({ config: { provider: 'probe', model: 'probe-main' } }) } as never }
    const res = await tool.execute({ id: 'goal-1', model: 'probe-review', why: 'walk the user flow' }, execAs(main, 'call-walk')) as { status?: string }
    assert.equal(res.status, 'walking')
    await until(() => walkDone, 'walk job finished')
    assert.ok(of('execute.walk').some(event => event.phase === 'start' && event.goal === 'goal-1'))
    assert.ok(of('execute.walk').some(event => event.phase === 'end' && event.goal === 'goal-1' && event.passed === 1 && event.failed === 0))
  }
  finally {
    setMetricSink(previous)
    repo.dispose()
  }
})

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
    contribute: (_source, contribution) => ({ ok: true, dispose: () => {}, accepted: contribution.entries.map(entry => entry.id), dropped: [] }),
    emit: () => Promise.resolve({ ok: false, code: 'busy', message: 'the board is busy' }),
    listens: () => true,
    recordRun: () => {},
    staleEntries: () => [],
    timeoutEntries: () => [],
  }
  rig.link.attach(board)
  rig.link.emit(rig.repo.root, 'main-1', { event: 'hourness.review-passed', key: 'review-passed:task-1:hz-task-1-r1-metric', payload: { task: 'task-1', round: 1 } })
  await until(() => rig.metrics.some(event => event.event === 'execute.loop-entry' && event.entry === 'execute.reviewed'), 'the fallback told the holder')
  seen.push(...rig.metrics)
  assert.ok(of('execute.goal').some(event => event.op === 'start' && event.goal === 'goal-1'))
  assert.ok(of('execute.goal').some(event => event.op === 'block' && event.code === 'hourness-waiting-human'))
  assert.ok(of('execute.completion-gate').some(event => !event.ok && event.gaps > 0))
  assert.ok(of('execute.tier').some(event => event.tier === 1 && event.handed === 1))
  assert.ok(of('execute.reconcile').length >= 1, 'the reconcile handed its counts over')
  assert.ok(of('execute.loop-contribute').some(event => event.row === 'glm-hourness/execute' && event.dropped.length === 0))
  assert.ok(of('execute.loop-fallback').some(event => event.entry === 'execute.reviewed' && event.why === 'emit-failed'))
  assert.ok(of('execute.loop-entry').some(event => event.entry === 'execute.reviewed' && event.sent))
}))

test('every execute.* event of the union came through the exit with its fields and none carries a string over 200 characters', () => {
  for (const [kind, fields] of Object.entries(REQUIRED) as [ExecuteKind, readonly string[]][]) {
    const events = seen.filter(event => event.event === kind)
    assert.ok(events.length > 0, `${kind} never came`)
    for (const event of events) {
      for (const field of fields) assert.notEqual((event as unknown as Record<string, unknown>)[field], undefined, `${kind} lacks ${field}: ${JSON.stringify(event)}`)
    }
  }
  const known = new Set<string>(Object.keys(REQUIRED))
  assert.deepEqual(seen.filter(event => !known.has(event.event)), [], 'an event outside the union came')
  const long = seen.filter(event => stringsOf(event).some(text => [...text].length > 200))
  assert.deepEqual(long, [], 'an event carries a long string')
})

test('L2: execute row forwards execute.* events into .llm/metrics/ via METRICS_SERVICE with zero rejections', async () => {
  const repo = testRepo()
  await stageNodes(repo.graphDir, [GOAL, TASK])
  const runtime = fakeRuntime({ cwd: repo.root, natives: [] })
  const registered: ToolDefinitionLike[] = []
  const tools = { get: (name: string) => registered.find(tool => tool.name === name), register: (definition: ToolDefinitionLike) => { registered.push(definition); return () => {} } }
  runtime.ctx.provide?.('tools', tools)
  const subagents = {
    startActivation: () => Promise.resolve({ childId: 'c1', result: Promise.resolve({ stopReason: 'completed' }), dispose: () => Promise.resolve() }),
    resolveMaxDepth: () => 1,
    registerProvider: () => () => {},
  } as unknown as InjectableServices['subagents']
  const loops: LoopsService = LOOPS_FAKE
  runtime.ctx.provide?.(LOOPS_SERVICE, loops)
  const inject = injectOf({ tools, subagents, [LOOPS_SERVICE]: loops })
  const stopMetrics = metricsApply(runtime.ctx as never, { checkDelay: 60_000 })
  const stopExecute = executeApply({ ...runtime.ctx, inject }, {})
  const metricsReason = (): string =>
    (runtime.services.get('glmHournessHealth/metrics') as { activation(): { readonly reason: string } } | undefined)?.activation().reason ?? ''
  try {
    assert.ok(!metricsReason().includes('无项目的事件'), metricsReason())
    const dispatch = registered.find(tool => tool.name === 'dispatch_task')
    assert.ok(dispatch !== undefined, 'dispatch_task registered')
    const main: AgentLike = { id: 'agent-1', ctx: {} as never, session: { id: 'agent-1', header: { id: 'agent-1', cwd: repo.root }, deriveMessages: () => [] } }
    // Dispatch without model triggers execute.dispatch-refused through execute's default sink into METRICS_SERVICE.
    await assert.rejects(dispatch.execute({ id: 'task-1', why: 'missing model' }, execAs(main, 'call-l2')))
    assert.ok(!metricsReason().includes('无项目的事件'), metricsReason())
  }
  finally {
    stopExecute()
    stopMetrics()
  }
  try {
    // Allow microtask queue and writer close/flush to settle, then read journal back.
    await new Promise(resolve => setTimeout(resolve, 100))
    const reading = await readLog(repo.root)
    assert.deepEqual(reading.problems, [])
    assert.equal(reading.events.filter(event => event.k === 'reject').length, 0, 'rejected === 0')
    assert.ok(reading.events.some(event => event.k === 'execute.loop-contribute' && event.by === 'execute'), 'execute.loop-contribute flushed into project metrics')
    const refused = reading.events.filter(event => event.k === 'execute.dispatch-refused')
    assert.equal(refused.length, 1)
    assert.equal(refused[0]?.by, 'execute')
    assert.equal(refused[0]?.sid, 'agent-1')
  }
  finally {
    repo.dispose()
  }
})

/** The loop board the row-level cases hand over to: it takes every entry and answers every event. */
const LOOPS_FAKE: LoopsService = {
  contribute: () => ({ ok: true, accepted: ['execute.reviewed'], dropped: [], dispose: () => {} }),
  emit: () => Promise.resolve({ ok: true, id: 'e1', duplicate: false }),
  listens: () => false,
  recordRun: () => {},
} as unknown as LoopsService

/** The fake inject: hand over the named services when every one of them was provided, wait otherwise. */
function injectOf(handovers: Record<string, unknown>): NonNullable<Parameters<typeof executeApply>[0]['inject']> {
  return (_names, cb) => {
    const picked: Record<string, unknown> = {}
    for (const n of _names) {
      const value = handovers[n as string]
      if (value !== undefined) picked[n as string] = value
    }
    if (Object.keys(picked).length === _names.length) return cb(picked as never)
    return undefined
  }
}

/** The fake rc.3 host pieces the row-level cases share: tools, the loop board, and the inject that hands both over. */
function startRowWithLoops(runtime: ReturnType<typeof fakeRuntime>): () => void {
  const registered: ToolDefinitionLike[] = []
  const tools = { get: (name: string) => registered.find(tool => tool.name === name), register: (definition: ToolDefinitionLike) => { registered.push(definition); return () => {} } }
  runtime.ctx.provide?.('tools', tools)
  const loops: LoopsService = LOOPS_FAKE
  runtime.ctx.provide?.(LOOPS_SERVICE, loops)
  const inject = injectOf({ tools, [LOOPS_SERVICE]: loops })
  return executeApply({ ...runtime.ctx, inject }, {})
}

/** The metrics row's activation reason, as the health table would render it. */
function metricsReasonOf(runtime: ReturnType<typeof fakeRuntime>): string {
  return (runtime.services.get('glmHournessHealth/metrics') as { activation(): { readonly reason: string } } | undefined)?.activation().reason ?? ''
}

/** Poll an async check for up to 4 seconds (the writer flush is IO-paced). */
async function waitUntil(check: () => Promise<boolean>, what: string): Promise<void> {
  for (let waited = 0; waited < 4000; waited += 25) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.ok(await check(), what)
}

/** The metrics row and the execute row together on a fake host, with the ordered dispose both directions need (the row first, so its dispose hand-over still finds the service). */
async function withRowAndMetrics(runtime: ReturnType<typeof fakeRuntime>, run: (stopExecute: () => void, reason: () => string) => void | Promise<void>): Promise<void> {
  const stopMetrics = metricsApply(runtime.ctx as never, { checkDelay: 60_000 })
  const stopExecute = startRowWithLoops(runtime)
  try {
    await run(stopExecute, () => metricsReasonOf(runtime))
  }
  finally {
    stopExecute()
    stopMetrics()
  }
}

test('L2: the startup buffer flushes to the first project the row serves, later naked facts follow the same anchor, and a second project inherits nothing', async () => {
  const first = testRepo()
  const second = testRepo()
  const runtime = fakeRuntime({ cwd: first.root, natives: [] })
  await withRowAndMetrics(runtime, async (stopExecute, reason) => {
    // The apply-time hand-over's contribute result waits; the counter stays empty while it waits.
    const waiting = reason()
    assert.ok(!waiting.includes('无项目的事件'), waiting)
    // The first event whose directory resolves fixes the anchor and flushes the buffer there.
    emitMetric({ event: 'execute.peak-cap', model: 'probe-model', cap: 1, running: 1 }, executeMetricWhere(first.root, 's1'))
    await waitUntil(async () => (await readLog(first.root)).events.some(event => event.k === 'execute.loop-contribute'), 'the buffered contribute result flushed into the first project')
    assert.equal((await readLog(first.root)).events.filter(event => event.k === 'execute.peak-cap').length, 1)
    // A later naked fact follows the anchor instead of waiting to be inherited by the next project.
    emitMetric({ event: 'execute.peak-cap', model: 'probe-model', cap: 1, running: 1 })
    // An event of a second project writes there and inherits nothing.
    emitMetric({ event: 'execute.peak-cap', model: 'probe-model', cap: 1, running: 1 }, executeMetricWhere(second.root, 's2'))
    await waitUntil(async () => (await readLog(second.root)).events.length > 0, 'the second project wrote its own event')
    const firstAfter = await readLog(first.root)
    const secondAfter = await readLog(second.root)
    assert.equal(firstAfter.events.filter(event => event.k === 'execute.peak-cap').length, 2, 'the later naked fact went to the anchor')
    assert.equal(secondAfter.events.filter(event => event.k === 'execute.loop-contribute').length, 0, 'the second project inherits no startup fact')
    assert.equal(secondAfter.events.filter(event => event.k === 'execute.peak-cap').length, 1)
    assert.ok(!reason().includes('无项目的事件'), reason())
    // The buffer drained through the anchor, so dispose handed the counter nothing.
    stopExecute()
    const afterDispose = reason()
    assert.ok(!afterDispose.includes('无项目的事件'), afterDispose)
  })
  first.dispose()
  second.dispose()
})

test('L2: a dispose with no project ever spoken hands the startup facts to the no-project counter instead of dropping them silently', async () => {
  const repo = testRepo()
  const runtime = fakeRuntime({ cwd: repo.root, natives: [] })
  try {
    await withRowAndMetrics(runtime, (stopExecute, reason) => {
      const before = reason()
      assert.ok(!before.includes('无项目的事件'), before)
      stopExecute()
      assert.match(reason(), /无项目的事件 1 条（execute\.loop-contribute）/)
    })
  }
  finally {
    repo.dispose()
  }
})

test('L2: without the metrics row the dispose hand-over is the accepted no-op any sender has before the row activates', () => {
  const repo = testRepo()
  const runtime = fakeRuntime({ cwd: repo.root, natives: [] })
  const stopExecute = startRowWithLoops(runtime)
  assert.equal(runtime.services.get('glmHournessMetrics'), undefined)
  stopExecute()
  repo.dispose()
})
