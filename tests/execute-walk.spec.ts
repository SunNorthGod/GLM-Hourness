/**
 * The walk job (user graph design 0.4.1 §2.7, §5.5; step U5b) at level 2:
 * on the library fixture, the preconditions and the views — `walkBlockers`
 * (a gap outside the ready set or an undecided proposal blocks, the ready
 * set passes), `pendingWalks` (the walked-and-covered flows stay out, the
 * person's own and unparsed ones split off), `walkCommitsOf`, the brief
 * lines, `limitOf` (three measured runs set the cap, timeouts do not
 * measure), the `stepExits` matrix (the one rule: ok is exit 0, a
 * contradiction fails the entry step with the command's own exit, a review
 * verdict overrides), `readWalkReport`'s validation, `modelTakesImages`,
 * `userCompletionItems` and the budget's relation to the gate lock's wait.
 * On real repositories, a committed driver script branches per flow id: a
 * passing walk writes one evidence per listed step, a command that fails
 * while the report says all ok fails the entry step with its own exit, a
 * missing report and a timeout write an exit 1 on the entry step alone,
 * past the 45-minute budget the next flow waits as `not_run`, three failed
 * walks or three failed reviews stop the goal (`hourness.stopped`), the
 * review role judges a 截图 flow's artifact, a held gate lock runs nothing,
 * and the restart reconcile marks abandoned jobs and re-writes a 命令
 * flow's evidence from the run's copy.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode, HistoryEntry } from '../src/graph/schema.ts'
import { estimatedTimeoutMs, userCompletionItems, userGraphOf, type FlowView } from '../src/graph/user-graph.ts'
import { appendJsonl } from '../src/execute/check.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { acquireGateLock, GATE_WAIT_MS, type GateLockSetup } from '../src/execute/gate-lock.ts'
import { createGateLauncher } from '../src/execute/gate-provider.ts'
import { createGit } from '../src/execute/git.ts'
import type { LoopEmit } from '../src/execute/loop-link.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import {
  buildCovers, limitOf, modelTakesImages, pendingWalks, readWalkReport, reconcileWalks,
  runWalkJob, stepExits, walkBlockers, walkBriefLines, walkCommitsOf,
  WALK_JOB_MS, WALK_REVIEW_SCHEMA,
  type WalkDeps, type WalkJobSpec, type WalkLimitLine, type WalkLine, type WalkOutcome, type WalkReport, type WalkStart,
} from '../src/execute/walk.ts'
import type { LiveAgentLike } from '../src/shared/dsh-min.ts'
import { stageNodes, testRepo, type TestRepo } from './execute-repo.ts'
import { libraryGraph, loaded, when, WALKED_AT } from './graph-user-helpers.ts'

/** The text a RegExp matches literally: the artifact path the reviewer prompt names. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---- the library fixture's views ----

/** The named flow's view off the library fixture (roles 读者, 管理员; flows 登录 … 处理逾期). */
function flowOf(graph: LoadedGraph, id: string): FlowView {
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  const view = userGraphOf(graph, goal).roles.flatMap(role => role.flows).find(flow => flow.flow.id === id)
  assert.ok(view !== undefined, `the fixture has no flow ${id}`)
  return view
}

test('walkBlockers: a gap outside the ready set blocks, the ready set (failed step, orphan, too long, branches) passes, an undecided proposal blocks, a goal without a user graph is ready', () => {
  const graph = libraryGraph()
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  const blockers = walkBlockers(graph, goal)
  assert.equal(blockers.length, 3)
  assert.match(blockers[0] ?? '', /^step:unserved on step-11: /, 'step:failed(step-21) and work:orphan(feat-export) are in the ready set and do not block')
  assert.match(blockers[1] ?? '', /^flow:no-test on flow-2: /, '§2.6 table order, one gap per flow')
  assert.match(blockers[2] ?? '', /^flow:no-test on flow-4: /)

  // step-11 gains a server, flows 2 and 4 gain a test-kind leaf: only ready-set gaps remain.
  const ready = libraryGraph((nodes) => {
    nodes.set('feat-deposit', { ...nodes.get('feat-catalog')!, id: 'feat-deposit', title: '押金', edges: [{ type: 'serves', to: 'step-11' }] })
    nodes.set('task-4', { ...nodes.get('task-4')!, kind: 'test' })
    nodes.set('task-8', { ...nodes.get('task-8')!, kind: 'test' })
  })
  const readyGoal = ready.nodes.get('goal-1')
  assert.ok(readyGoal !== undefined)
  assert.deepEqual(walkBlockers(ready, readyGoal), [])

  // A live proposed user node under the goal blocks until the person decides.
  const undecided = libraryGraph((nodes) => {
    nodes.set('flow-new', {
      ...nodes.get('flow-2')!, id: 'flow-new', title: '新流程', parent: 'role-1', status: 'proposed',
      history: [{ at: when('10-31 17:30'), actor: 'human', op: 'propose', reason: '夹具副本', to: 'proposed' }],
    })
  })
  const undecidedGoal = undecided.nodes.get('goal-1')
  assert.ok(undecidedGoal !== undefined)
  assert.deepEqual(walkBlockers(undecided, undecidedGoal).filter(line => line.startsWith('proposal')), ['proposal flow-new (新流程) is not decided yet'])

  // No roles and no flows under the goal: no user graph, always ready.
  const bareGoal: GraphNode = {
    id: 'goal-bare', type: 'goal', title: '没有图的活', status: 'approved',
    history: [
      { at: when('10-26 08:00'), actor: 'llm', op: 'propose', reason: '夹具', to: 'proposed' },
      { at: when('10-26 09:00'), actor: 'human', op: 'approve', reason: '夹具', from: 'proposed', to: 'approved' },
    ],
  }
  assert.deepEqual(walkBlockers(loaded([bareGoal]), bareGoal), [])
})

test('pendingWalks: walked flows covered by the trunk stay out, stale covers put them back, and the person walks the 你来走 and unparsed flows themselves', () => {
  const graph = libraryGraph()
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)

  const fresh = pendingWalks(graph, goal, () => true)
  assert.ok(fresh !== undefined)
  assert.deepEqual(fresh.auto.map(flow => flow.flow.id), ['flow-2', 'flow-3', 'flow-4', 'flow-5', 'flow-6'], '登录 was walked at a covered commit; 录入新书 is stale (its work moved after the walk) and walks again')
  assert.deepEqual(fresh.person, [])
  for (const auto of fresh.auto) {
    assert.ok(!('unparsed' in auto.spec) && auto.spec.command.includes(auto.flow.id), 'every auto flow carries its gate command with {flow} replaced by its id')
  }

  const staleCovers = pendingWalks(graph, goal, () => false)
  assert.ok(staleCovers !== undefined)
  assert.deepEqual(staleCovers.auto.map(flow => flow.flow.id), ['flow-1', 'flow-2', 'flow-3', 'flow-4', 'flow-5', 'flow-6'], 'a commit the trunk does not cover makes the walk stale again')

  const person = libraryGraph((nodes) => {
    nodes.set('flow-manual', {
      ...nodes.get('flow-2')!, id: 'flow-manual', title: '亲手验', body: '走法：你来走',
      history: [{ at: when('10-31 17:00'), actor: 'human', op: 'propose', reason: '夹具副本', to: 'approved' }],
    })
    nodes.set('flow-broken', {
      ...nodes.get('flow-2')!, id: 'flow-broken', title: '坏走法', body: '走法：命令 · 预计 0 秒',
      history: [{ at: when('10-31 17:10'), actor: 'human', op: 'propose', reason: '夹具副本', to: 'approved' }],
    })
  })
  const personGoal = person.nodes.get('goal-1')
  assert.ok(personGoal !== undefined)
  const split = pendingWalks(person, personGoal, () => true)
  assert.ok(split !== undefined)
  assert.deepEqual(split.person.map(flow => flow.flow.id), ['flow-manual', 'flow-broken'], 'the 你来走 and the unparsed flow stay with the person, in display order')
})

test('walkCommitsOf lists each walked commit once; walkBriefLines says how far each flow got, with the walk result where it failed', () => {
  const graph = libraryGraph()
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  assert.deepEqual(walkCommitsOf(graph, goal), [WALKED_AT])
  assert.deepEqual(walkBriefLines(graph, goal), [
    '读者 › 登录 (flow-1): 4/4 steps walked',
    '读者 › 搜书 (flow-2): 0/3 steps walked',
    '读者 › 借书 (flow-3): 0/4 steps walked',
    '读者 › 还书 (flow-4): 0/3 steps walked',
    '管理员 › 录入新书 (flow-5): 0/4 steps walked',
    '管理员 › 处理逾期 (flow-6): failed at "发提醒或登记赔偿" (登记赔偿后状态没变)',
  ])
})

test('limitOf: three measured runs set the cap at three times the slowest within the bounds, timeouts do not measure, fewer runs keep the estimate', () => {
  const flow = flowOf(libraryGraph(), 'flow-1')
  assert.equal(estimatedTimeoutMs(30), 90_000)
  const line = (outcome: WalkOutcome, elapsedMs: number): WalkLine =>
    ({ kind: 'flow-end', job: 'j', flow: 'flow-1', outcome, limitMs: 0, elapsedMs, at: when('10-30 09:00') })
  assert.deepEqual(limitOf(flow, []), { ms: 90_000, source: 'agent' })
  assert.deepEqual(limitOf(flow, [line('passed', 1000), line('passed', 2000)]), { ms: 90_000, source: 'agent' }, 'two runs do not measure yet')
  assert.deepEqual(limitOf(flow, [line('passed', 1000), line('failed', 2000), line('passed', 5000), line('passed', 3000)]), { ms: 15_000, source: 'harness' }, 'the last three runs decide; the slowest is 5 s')
  assert.deepEqual(limitOf(flow, [line('timeout', 60_000), line('passed', 1000), line('passed', 2000), line('timeout', 60_000)]), { ms: 90_000, source: 'agent' }, 'a timed-out run is no measurement')
  assert.deepEqual(limitOf(flow, [line('passed', 100), line('passed', 100), line('passed', 100)]), { ms: 10_000, source: 'harness' }, 'the floor is 10 s')
})

test('stepExits follows the one rule: ok is exit 0, a contradiction fails the entry step with the command exit, a review verdict overrides, an artifact rides along', () => {
  const flow = flowOf(libraryGraph(), 'flow-1')
  const reportOf = (steps: readonly { readonly id: string, readonly ok: boolean, readonly said?: string }): WalkReport => ({ ok: true, steps })
  const exitsOf = (steps: readonly { readonly id: string, readonly ok: boolean, readonly said?: string }[], commandExit: number, judged?: ReadonlyMap<string, { readonly ok: boolean, readonly why?: string }>): readonly (readonly (string | number)[])[] =>
    stepExits(flow, reportOf(steps), commandExit, judged).map(entry => [entry.id, entry.exit, entry.result])

  assert.deepEqual(exitsOf([{ id: 'step-1', ok: true, said: '记好了' }, { id: 'step-2', ok: false, said: '看不到' }], 0), [
    ['step-1', 0, '通过'],
    ['step-2', 1, '没过：看不到'],
  ], 'a step the report marks not ok fails with exit 1 when the command exited 0')
  assert.deepEqual(exitsOf([{ id: 'step-1', ok: true, said: 'a' }, { id: 'step-2', ok: true, said: 'b' }], 3), [
    ['step-1', 3, '没过：命令的退出码不是 0，而报告里列出的步骤全是 ok'],
    ['step-2', 0, '通过'],
  ], 'a non-zero exit while every listed step says ok fails the entry step with the command own exit; the rest keep their ok')
  assert.deepEqual(exitsOf([{ id: 'step-1', ok: true, said: 'a' }], 0, new Map([['step-1', { ok: false, why: '看不清' }]])), [
    ['step-1', 1, '没过：看不清'],
  ], 'the walk-review verdict overrides the report')
  assert.deepEqual(stepExits(flow, reportOf([{ id: 'step-1', ok: true, artifact: 'shot.png' }]), 0, undefined).map(entry => entry.artifact), ['shot.png'])
  assert.deepEqual(stepExits(flow, reportOf([]), 0, undefined), [], 'a report that lists no step writes no evidence (§2.7 rule 5)')
})

test('readWalkReport validates the report of one flow: the flow id, the steps list and its size, the step ids, one said line, the bare artifact name and its bytes', async () => {
  const flow = flowOf(libraryGraph(), 'flow-1')
  const dir = mkdtempSync(join(tmpdir(), 'walk-report-'))
  try {
    const reportDir = join(dir, '.hourness', 'walk', 'flow-1')
    const write = (value: unknown, files: Readonly<Record<string, string>> = {}): void => {
      mkdirSync(reportDir, { recursive: true })
      for (const [name, content] of Object.entries(files)) writeFileSync(join(reportDir, name), content)
      if (value === null) rmSync(join(reportDir, 'report.json'), { force: true })
      else writeFileSync(join(reportDir, 'report.json'), typeof value === 'string' ? value : `${JSON.stringify(value)}\n`)
    }
    const reason = async (): Promise<string> => {
      const read = await readWalkReport(dir, flow, false)
      assert.equal(read.ok, false, 'the report was expected to be unusable')
      return read.ok ? '' : read.reason
    }

    const timed = await readWalkReport(dir, flow, true)
    assert.equal(timed.ok, false)
    assert.match(timed.ok ? '' : timed.reason, /timed out$/, 'a timeout is unusable before anything is read')
    write(null)
    assert.match(await reason(), /^no report at \.hourness\/walk\/flow-1\/report\.json$/)
    write('{ broken')
    assert.equal(await reason(), 'the report does not parse as JSON')
    write({ flow: 'flow-2', steps: [] })
    assert.equal(await reason(), 'the report names flow flow-2, not flow-1')
    write({ flow: 'flow-1' })
    assert.equal(await reason(), 'the report has no steps list')
    write({ flow: 'flow-1', steps: Array.from({ length: 51 }, (_, index) => ({ id: `step-${(index % 4) + 1}`, ok: true })) })
    assert.equal(await reason(), 'the report lists 51 steps, at most 50')
    write({ flow: 'flow-1', steps: [{ id: 'step-9', ok: true }] })
    assert.equal(await reason(), 'the report names step-9, which is no live approved step of flow-1')
    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true }, { id: 'step-1', ok: true }] })
    assert.equal(await reason(), 'the report names step-1 twice')
    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true, said: '一'.repeat(121) }] })
    assert.equal(await reason(), 'the said of step-1 is not one line of at most 120 characters')
    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true, artifact: 'a/b.png' }] })
    assert.equal(await reason(), 'the artifact of step-1 is not a bare file name')
    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true, artifact: 'gone.png' }] })
    assert.equal(await reason(), 'the artifact of step-1 is missing: gone.png')
    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true, artifact: 'empty.png' }] }, { 'empty.png': '' })
    assert.equal(await reason(), 'the artifact of step-1 is empty')

    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true, said: '记好了', artifact: 'note.txt' }] }, { 'note.txt': 'note\n' })
    const good = await readWalkReport(dir, flow, false)
    assert.deepEqual(good.ok ? good.steps : good, [{ id: 'step-1', ok: true, said: '记好了', artifact: 'note.txt' }])

    // A 截图 flow names an artifact for every step; a 命令 flow need not.
    const screenshot: FlowView = { ...flow, spec: { kind: '截图', seconds: 5, command: 'node shot.mjs {flow}' } }
    write({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true }] })
    const shot = await readWalkReport(dir, screenshot, false)
    assert.equal(shot.ok, false)
    assert.equal(shot.ok ? '' : shot.reason, 'a 截图 walk names an artifact for every step; step-1 names none')
  }
  finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('modelTakesImages reads the catalog entry inputModalities; a catalog that says nothing never confirms one', () => {
  const catalog: readonly { readonly id: string, readonly inputModalities?: readonly string[] }[] =
    [{ id: 'glm-a', inputModalities: ['text', 'image'] }, { id: 'glm-b', inputModalities: ['text'] }, { id: 'glm-c' }]
  assert.equal(modelTakesImages('glm-a', catalog), true)
  assert.equal(modelTakesImages('glm-b', catalog), false)
  assert.equal(modelTakesImages('glm-c', catalog), false, 'an entry without inputModalities is no confirmation')
  assert.equal(modelTakesImages('glm-a', undefined), false, 'no catalog at all is no confirmation')
  assert.equal(modelTakesImages('glm-missing', catalog), false)
})

test('the walk job budget sits below the gate lock wait, and userCompletionItems judge the walks of the goal against the trunk', () => {
  assert.ok(WALK_JOB_MS < GATE_WAIT_MS, `WALK_JOB_MS ${WALK_JOB_MS} must be below GATE_WAIT_MS ${GATE_WAIT_MS}`)
  const graph = libraryGraph()
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  const fresh = userCompletionItems(graph, goal, commit => commit === WALKED_AT)
  assert.deepEqual(fresh.map(item => [item.key, item.ok]), [['flows:walked', false], ['flows:fresh', true]], 'the fixture has unwalked steps, and every walked one is at a covered commit')
  const stale = userCompletionItems(graph, goal, () => false)
  const freshItem = stale.find(item => item.key === 'flows:fresh')
  assert.ok(freshItem !== undefined && !freshItem.ok)
  assert.match(freshItem.hint, /walk them again/)
})

// ---- real repositories ----

/**
 * The driver the walk command runs in the gate worktree; its behavior
 * branches on the flow id, so every test names its flows after the outcome
 * it wants and no test-global state is involved.
 */
const DRIVER = `import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const flow = process.argv[2]
if (flow === 'flow-slow') {
  setTimeout(() => {}, 120000)
}
else if (flow !== 'flow-noreport') {
  const dir = join('.hourness', 'walk', flow)
  mkdirSync(dir, { recursive: true })
  const steps = []
  if (flow === 'flow-fail' || flow === 'flow-fail3') {
    steps.push({ id: 'step-1', ok: true, said: '写进去了' }, { id: 'step-2', ok: true, said: '写进去了' })
  }
  else if (flow === 'flow-stepfail') {
    steps.push({ id: 'step-3', ok: true, said: '写进去了' }, { id: 'step-4', ok: false, said: '看不到结果' })
  }
  else if (flow === 'flow-shot') {
    writeFileSync(join(dir, 'shot.png'), 'pretend-image-bytes')
    steps.push({ id: 'step-1', ok: true, artifact: 'shot.png', said: '截到了页面' })
  }
  else {
    steps.push({ id: 'step-1', ok: true, said: '写进去了' }, { id: 'step-2', ok: true, said: '写进去了' })
  }
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ flow, steps }))
  if (flow === 'flow-fail' || flow === 'flow-fail3') process.exit(1)
}
`

interface FlowPlan {
  readonly id: string
  readonly title?: string
  readonly body: string
  /** The step ids in walk order; each links by a next edge to the one after it. */
  readonly steps: readonly string[]
}

const COMMAND_BODY = '走法：命令 · 预计 30 秒'

const twoSteps = (id: string, body: string, ...steps: readonly string[]): FlowPlan => ({ id, body, steps })

interface Rig {
  readonly repo: TestRepo
  readonly execDir: string
  readonly trunk: string
  readonly spec: WalkJobSpec
  readonly deps: WalkDeps
  readonly emitted: LoopEmit[]
  readonly reports: string[]
  readonly starts: Parameters<WalkStart>[0][]
  readonly metrics: MetricEvent[]
  run(): Promise<void>
  journal(): Promise<readonly WalkLine[]>
  walkHistory(stepId: string): Promise<readonly HistoryEntry[]>
  dispose(): void
}

interface RigOptions {
  /** The merge gate's walk line; the walk command the flows run. */
  readonly walkLine?: string
  readonly flows?: readonly FlowPlan[]
  readonly now?: () => Date
  readonly start?: WalkStart
  readonly lockSetup?: GateLockSetup
}

let jobs = 0

/** The flow's own next edge to its entry step, as the person's link. */
async function linkEntry(repo: TestRepo, flowId: string, to: string): Promise<void> {
  const engine = openEngine(repo.graphDir)
  const rev = (await engine.load()).revisions.get(flowId)
  if (rev === undefined) throw new Error(`the staged flow ${flowId} has no revision`)
  const done = await engine.apply('human', { op: 'link', id: flowId, type: 'next', to, rev, reason: 'test seed' })
  if (!done.ok) throw new Error(`linking ${flowId} to ${to} failed: ${JSON.stringify(done.error)}`)
}

/**
 * A project whose goal carries one role, the merge gate with a walk line,
 * and the planned flows with their steps; `run()` walks them all through
 * `runWalkJob` with real git and a real gate launcher, and fake emit and
 * report seams that collect.
 */
async function walkRig(options: RigOptions = {}): Promise<Rig> {
  const repo = testRepo()
  const trunk = repo.commit({ 'walk-driver.mjs': DRIVER }, 'walk driver')
  const walkLine = options.walkLine ?? '`walk 命令 $ node walk-driver.mjs {flow}`'
  const flows = options.flows ?? [{ id: 'flow-1', title: '记一笔', body: COMMAND_BODY, steps: ['step-1', 'step-2'] }]
  const nodes: Record<string, unknown>[] = [
    { type: 'goal', id: 'goal-1', title: '记事本', acceptance: ['记事本能用'] },
    { type: 'norm', id: 'norm-merge-gate', title: '合入前检查', parent: 'goal-1', acceptance: ['`npm test` 通过', walkLine] },
    { type: 'role', id: 'role-1', title: '记笔记的人', parent: 'goal-1' },
  ]
  for (const plan of flows) {
    nodes.push({ type: 'flow', id: plan.id, title: plan.title ?? plan.id, parent: 'role-1', body: plan.body })
    for (let index = plan.steps.length - 1; index >= 0; index--) {
      const id = plan.steps[index]
      const to = plan.steps[index + 1]
      if (id === undefined) throw new Error(`the flow plan ${plan.id} has a hole in its steps`)
      nodes.push({ type: 'step', id, title: id, parent: plan.id, acceptance: [`${id}做成了`], ...(to === undefined ? {} : { edges: [{ type: 'next', to }] }) })
    }
  }
  await stageNodes(repo.graphDir, nodes)
  for (const plan of flows) await linkEntry(repo, plan.id, plan.steps[0] ?? '')

  const graph = await openEngine(repo.graphDir).load()
  const goal = graph.nodes.get('goal-1')
  if (goal === undefined) throw new Error('the rig goal is gone')
  const pending = pendingWalks(graph, goal, () => true)
  if (pending === undefined || pending.auto.length === 0) throw new Error('the rig has no automatic flows to walk')
  const emitted: LoopEmit[] = []
  const reports: string[] = []
  const starts: Parameters<WalkStart>[0][] = []
  const metrics: MetricEvent[] = []
  const previous = setMetricSink(event => { metrics.push(event) })
  const given = options.start
  const start: WalkStart | undefined = given === undefined ? undefined : async spec => { starts.push(spec); return await given(spec) }
  const deps: WalkDeps = {
    execDir: root => join(root, '.llm', 'execute'),
    git: createGit(),
    launcher: createGateLauncher(),
    report: (_session, _state, reason) => { reports.push(reason) },
    emit: (_project, _session, event) => { emitted.push(event) },
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(start === undefined ? {} : { start }),
    ...(options.lockSetup === undefined ? {} : { lockSetup: options.lockSetup }),
  }
  const spec: WalkJobSpec = {
    job: `walk-goal-1-${String(++jobs).padStart(2, '0')}`,
    project: repo.root,
    graphDir: repo.graphDir,
    goal,
    flows: pending.auto,
    person: pending.person.map(flow => flow.flow.id),
    choice: { provider: 'probe', model: 'probe-model' },
    why: 'test seed',
    trunk: { branch: 'main', sha: trunk },
    sessionId: 'main-1',
    parent: {
      id: 'main-1', status: 'running', followup: () => {}, inject: () => {}, cancel: () => {}, session: {},
    } as unknown as LiveAgentLike,
  }
  return {
    repo,
    execDir: join(repo.root, '.llm', 'execute'),
    trunk,
    spec,
    deps,
    emitted,
    reports,
    starts,
    metrics,
    async run(): Promise<void> {
      await runWalkJob(deps, spec, new AbortController().signal)
    },
    async journal(): Promise<readonly WalkLine[]> {
      try {
        const text = await readFile(join(repo.root, '.llm', 'execute', 'walks.jsonl'), 'utf8')
        return text.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as WalkLine)
      }
      catch {
        return []
      }
    },
    async walkHistory(stepId: string): Promise<readonly HistoryEntry[]> {
      const current = await openEngine(repo.graphDir).load()
      return (current.nodes.get(stepId)?.history ?? []).filter(entry => entry.op === 'walk')
    },
    dispose(): void {
      setMetricSink(previous)
      repo.dispose()
    },
  }
}

const flowEndsOf = async (r: Rig): Promise<readonly Extract<WalkLine, { readonly kind: 'flow-end' }>[]> =>
  (await r.journal()).filter((line): line is Extract<WalkLine, { readonly kind: 'flow-end' }> => line.kind === 'flow-end')

test('a passing walk writes one evidence per listed step with the pinned commit and digest, journals the run, and wakes the main agent with hourness.walk-done', async () => {
  const r = await walkRig()
  try {
    await r.run()
    const [step1, step2] = [await r.walkHistory('step-1'), await r.walkHistory('step-2')]
    assert.equal(step1.length, 1)
    assert.equal(step2.length, 1)
    const evidence = step1[0]?.evidence?.[0]
    assert.deepEqual(evidence, {
      kind: 'walk',
      ref: 'command:node walk-driver.mjs flow-1',
      exit: 0,
      note: `@${r.trunk.slice(0, 7)} sha256:- 通过`,
    }, '§2.7: the note carries @<commit> sha256 and the result')
    assert.match(step1[0]?.reason ?? '', /^walk-goal-1-\S{2,8} 流程「记一笔」走一遍$/)
    assert.equal(step2[0]?.evidence?.[0]?.exit, 0)

    const lines = await r.journal()
    assert.deepEqual(lines.map(line => line.kind), ['start', 'evidence', 'flow-end', 'end'], 'the evidence line lands before the flow-end line of the same flow')
    const [start, evidenceLine, flowEnd, end] = lines as [Extract<WalkLine, { kind: 'start' }>, Extract<WalkLine, { kind: 'evidence' }>, Extract<WalkLine, { kind: 'flow-end' }>, Extract<WalkLine, { kind: 'end' }>]
    assert.deepEqual([start.job, start.goal, start.commit], [r.spec.job, 'goal-1', r.trunk])
    assert.deepEqual([flowEnd.flow, flowEnd.outcome, flowEnd.exit, flowEnd.limitMs], ['flow-1', 'passed', 0, 90_000], 'the cap is the estimate: 30 s times three')
    assert.deepEqual(evidenceLine.steps, ['step-1', 'step-2'])
    assert.equal(end.trunkMoved, false)

    assert.deepEqual(r.emitted, [{
      event: 'hourness.walk-done',
      key: `walk-done:${r.spec.job}`,
      payload: { job: r.spec.job, goal: 'goal-1', commit: r.trunk, trunkMoved: false, flows: ['flow-1 passed'] },
    }])
    const walkMetric = r.metrics.find(event => event.event === 'execute.walk')
    assert.ok(walkMetric !== undefined && walkMetric.event === 'execute.walk')
    assert.deepEqual([walkMetric.phase, walkMetric.goal, walkMetric.passed, walkMetric.failed, walkMetric.outcomes], ['end', 'goal-1', 1, 0, ['passed']])

    assert.ok(existsSync(join(r.execDir, 'walks', r.spec.job, 'flow-1', 'report.json')), 'the report is copied into the run directory')
    assert.ok(existsSync(join(r.execDir, 'walks', r.spec.job, 'flow-1.log')), 'the flow command has its own log')
    assert.deepEqual(r.reports, [], 'a clean job degrades nothing')
  }
  finally {
    r.dispose()
  }
})

test('the one rule on real runs: a failing command with an all-ok report fails the entry step with its own exit, a step the report marks not ok fails with exit 1', async () => {
  const r = await walkRig({ flows: [twoSteps('flow-fail', COMMAND_BODY, 'step-1', 'step-2'), twoSteps('flow-stepfail', COMMAND_BODY, 'step-3', 'step-4')] })
  try {
    await r.run()
    const step1 = (await r.walkHistory('step-1')).at(-1)?.evidence?.[0]
    const step2 = (await r.walkHistory('step-2')).at(-1)?.evidence?.[0]
    const step4 = (await r.walkHistory('step-4')).at(-1)?.evidence?.[0]
    assert.deepEqual([step1?.exit, step1?.note], [1, `@${r.trunk.slice(0, 7)} sha256:- 没过：命令的退出码不是 0，而报告里列出的步骤全是 ok`])
    assert.deepEqual([step2?.exit, step2?.note], [0, `@${r.trunk.slice(0, 7)} sha256:- 通过`], 'the rest of an all-ok report keeps its pass')
    assert.deepEqual([step4?.exit, step4?.note], [1, `@${r.trunk.slice(0, 7)} sha256:- 没过：看不到结果`], 'the report said is the failure wording')

    const ends = await flowEndsOf(r)
    assert.deepEqual(ends.map(end => [end.flow, end.outcome, end.exit]), [['flow-fail', 'failed', 1], ['flow-stepfail', 'failed', 0]])
    const done = r.emitted.at(-1)
    assert.ok(done !== undefined && done.event === 'hourness.walk-done')
    assert.deepEqual(done.payload.flows, ['flow-fail failed', 'flow-stepfail failed'])
    assert.deepEqual(r.emitted.filter(event => event.event === 'hourness.stopped'), [], 'one failed walk stops nothing')
  }
  finally {
    r.dispose()
  }
})

test('a missing report writes an exit 1 on the entry step alone; the other steps stay silent', async () => {
  const r = await walkRig({ flows: [twoSteps('flow-noreport', COMMAND_BODY, 'step-1', 'step-2')] })
  try {
    await r.run()
    const [step1, step2] = [await r.walkHistory('step-1'), await r.walkHistory('step-2')]
    assert.deepEqual([step1.length, step2.length], [1, 0], '§2.7 rule 2: only the entry step carries the exit 1')
    assert.deepEqual([step1[0]?.evidence?.[0]?.exit, step1[0]?.evidence?.[0]?.note], [1, `@${r.trunk.slice(0, 7)} sha256:- 没走完：no report at .hourness/walk/flow-noreport/report.json`])
    const end = (await flowEndsOf(r)).at(-1)
    assert.deepEqual([end?.outcome, end?.exit], ['no_report', 0])
    assert.match(end?.reason ?? '', /^no report at \.hourness\/walk\/flow-noreport\/report\.json$/)
  }
  finally {
    r.dispose()
  }
})

test('a walk past its cap is killed with its process tree, reads as timeout, and writes 超时 on the entry step', { timeout: 30_000 }, async () => {
  const r = await walkRig({ flows: [twoSteps('flow-slow', '走法：命令 · 预计 1 秒', 'step-1', 'step-2')] })
  try {
    await r.run()
    const [step1, step2] = [await r.walkHistory('step-1'), await r.walkHistory('step-2')]
    assert.deepEqual([step1.length, step2.length], [1, 0])
    assert.deepEqual([step1[0]?.evidence?.[0]?.exit, step1[0]?.evidence?.[0]?.note], [1, `@${r.trunk.slice(0, 7)} sha256:- 超时`], '§2.7 rule 1: the harness words it')
    const end = (await flowEndsOf(r)).at(-1)
    assert.deepEqual([end?.outcome, end?.limitMs], ['timeout', 10_000], 'the estimate 1 s times three lands on the 10 s floor')
    assert.match(end?.reason ?? '', /^the walk command of flow-slow timed out/)
    const limits = readFileSync(join(r.execDir, 'walk-limits.jsonl'), 'utf8').split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as WalkLimitLine)
    assert.deepEqual(limits.map(entry => [entry.flow, entry.old, entry.new, entry.source]), [['flow-slow', null, 10_000, 'agent']], 'every change of a cap is journaled')
  }
  finally {
    r.dispose()
  }
})

test('past its budget the job starts no new flow: the first flow always runs, the rest wait as not_run for the next dispatch', async () => {
  let ticks = 0
  const now = (): Date => new Date(Date.now() + (ticks++) * 10 * 60_000)
  const r = await walkRig({
    flows: [twoSteps('flow-a', COMMAND_BODY, 'step-1', 'step-2'), twoSteps('flow-b', COMMAND_BODY, 'step-3', 'step-4')],
    now,
  })
  try {
    await r.run()
    const [step1, step3] = [await r.walkHistory('step-1'), await r.walkHistory('step-3')]
    assert.equal(step1.length, 1, 'the first flow of a job always starts')
    assert.equal(step3.length, 0, 'the second flow waited')
    const ends = await flowEndsOf(r)
    assert.deepEqual(ends.map(end => [end.flow, end.outcome]), [['flow-a', 'passed'], ['flow-b', 'not_run']])
    assert.match(ends[1]?.reason ?? '', /^the job has spent \d+ ms of its 2700000 ms budget$/)
    const done = r.emitted.at(-1)
    assert.ok(done !== undefined && done.event === 'hourness.walk-done')
    assert.deepEqual(done.payload.flows, ['flow-a passed', 'flow-b not_run'])
  }
  finally {
    r.dispose()
  }
})

test('a step whose last three walks all failed stops the goal: hourness.stopped, kind acceptance, three rounds', async () => {
  const r = await walkRig({ flows: [twoSteps('flow-fail3', COMMAND_BODY, 'step-1', 'step-2')] })
  try {
    const engine = openEngine(r.repo.graphDir)
    for (let round = 0; round < 2; round++) {
      const rev = (await engine.load()).revisions.get('step-1')
      if (rev === undefined) throw new Error('step-1 has no revision')
      const seeded = await engine.apply('harness', {
        op: 'walk', id: 'step-1', rev, reason: `seed round ${round}`,
        evidence: [{ kind: 'walk', ref: 'command:seed', exit: 1, note: '@aaaaaaa sha256:- 没过' }],
      })
      if (!seeded.ok) throw new Error(`seeding the failed walk failed: ${JSON.stringify(seeded.error)}`)
    }
    await r.run()
    const stopped = r.emitted.filter(event => event.event === 'hourness.stopped')
    assert.equal(stopped.length, 1, 'the third failing walk stops the step once')
    assert.deepEqual(stopped[0]?.payload, { node: 'step-1', kind: 'acceptance', rounds: 3 })
    assert.match(stopped[0]?.key ?? '', /^stopped:step-1:walk-/)
    const step2 = await r.walkHistory('step-2')
    assert.equal(step2.at(-1)?.evidence?.[0]?.exit, 0, 'step-2 walked ok in this run and is not stopped')
  }
  finally {
    r.dispose()
  }
})

test('a 截图 flow passes through the walk-review role: the reviewer sees the artifact copy under the review schema, its verdict decides the evidence', async () => {
  const r = await walkRig({
    walkLine: '`walk 截图 $ node walk-driver.mjs {flow}`',
    flows: [{ id: 'flow-shot', body: '走法：截图 · 预计 5 秒', steps: ['step-1'] }],
    start: () => Promise.resolve({ structured: { steps: [{ id: 'step-1', ok: true, why: '看得到页面' }] } }),
  })
  try {
    await r.run()
    assert.equal(r.starts.length, 1)
    const start = r.starts[0]
    assert.equal(start?.provider, 'spawn')
    assert.equal(start?.label, 'hourness walk review flow-shot try 1')
    assert.equal(start?.request.outputSchema, WALK_REVIEW_SCHEMA as unknown)
    const prompt = (start?.request.prompt[0] as { readonly text: string } | undefined)?.text ?? ''
    const artifactPattern = escapeRegExp(join(r.execDir, 'walks', r.spec.job, 'flow-shot', 'shot.png'))
    assert.match(prompt, new RegExp(`step-1 "step-1" — acceptance: step-1做成了; artifact: ${artifactPattern}`))
    assert.match(prompt, /structured_output once/)

    const evidence = (await r.walkHistory('step-1')).at(-1)?.evidence?.[0]
    const digest = sha256Hex('pretend-image-bytes').slice(0, 8)
    assert.deepEqual([evidence?.exit, evidence?.note], [0, `@${r.trunk.slice(0, 7)} sha256:${digest} 通过`], 'the reviewer ok is the pass; the note digests the artifact copy')
    assert.ok(evidence?.ref.startsWith('screenshot:') === true && evidence?.ref.endsWith('shot.png'))
    const end = (await flowEndsOf(r)).at(-1)
    assert.deepEqual([end?.flow, end?.outcome], ['flow-shot', 'passed'])
    assert.deepEqual(r.emitted.at(-1)?.payload.flows, ['flow-shot passed'])
  }
  finally {
    r.dispose()
  }
})

test('three failed reviews stop the flow: each try spends one activation, the journal counts across jobs, hourness.stopped names the flow', async () => {
  const r = await walkRig({
    walkLine: '`walk 截图 $ node walk-driver.mjs {flow}`',
    flows: [{ id: 'flow-shot', body: '走法：截图 · 预计 5 秒', steps: ['step-1'] }],
    start: () => Promise.resolve({}),
  })
  try {
    mkdirSync(r.execDir, { recursive: true })
    const at = new Date().toISOString()
    await appendJsonl(join(r.execDir, 'walks.jsonl'), { kind: 'flow-end', job: 'walk-goal-1-old1', flow: 'flow-shot', outcome: 'review_failed', limitMs: 10_000, elapsedMs: 0, at })
    await appendJsonl(join(r.execDir, 'walks.jsonl'), { kind: 'flow-end', job: 'walk-goal-1-old2', flow: 'flow-shot', outcome: 'review_failed', limitMs: 10_000, elapsedMs: 0, at })
    await r.run()
    assert.equal(r.starts.length, 3, 'the review activation runs at most three tries')
    assert.deepEqual(r.starts.map(entry => entry.label), ['hourness walk review flow-shot try 1', 'hourness walk review flow-shot try 2', 'hourness walk review flow-shot try 3'])
    assert.equal((await r.walkHistory('step-1')).length, 0, 'a review-failed flow writes no evidence')
    const stopped = r.emitted.filter(event => event.event === 'hourness.stopped')
    assert.equal(stopped.length, 1)
    assert.deepEqual(stopped[0]?.payload, { node: 'flow-shot', kind: 'acceptance', rounds: 3 })
    const end = (await flowEndsOf(r)).at(-1)
    assert.deepEqual([end?.flow, end?.outcome], ['flow-shot', 'review_failed'])
    assert.deepEqual(r.emitted.at(-1)?.payload.flows, ['flow-shot review_failed'])
  }
  finally {
    r.dispose()
  }
})

test('without a review backend a 截图 flow reads as review_failed at once and stops nothing', async () => {
  const r = await walkRig({
    walkLine: '`walk 截图 $ node walk-driver.mjs {flow}`',
    flows: [{ id: 'flow-shot', body: '走法：截图 · 预计 5 秒', steps: ['step-1'] }],
  })
  try {
    await r.run()
    assert.equal(r.starts.length, 0)
    const end = (await flowEndsOf(r)).at(-1)
    assert.deepEqual([end?.flow, end?.outcome], ['flow-shot', 'review_failed'])
    assert.deepEqual(r.emitted.filter(event => event.event === 'hourness.stopped'), [])
    assert.equal((await r.walkHistory('step-1')).length, 0)
  }
  finally {
    r.dispose()
  }
})

test('a held gate lock runs no flow: the job reports degraded, marks every flow not_run, and still wakes the main agent', async () => {
  const r = await walkRig({ lockSetup: { options: { waitMs: 200, retryMs: 50 } } })
  try {
    mkdirSync(r.execDir, { recursive: true })
    const held = await acquireGateLock(r.execDir, 'test holder', r.deps.lockSetup)
    assert.notEqual(held, 'busy')
    try {
      await r.run()
    }
    finally {
      if (held !== 'busy') await held.release()
    }
    assert.equal((await r.walkHistory('step-1')).length, 0)
    assert.equal(r.reports.length, 1)
    assert.match(r.reports[0] ?? '', /走一遍作业拿不到门禁锁/)
    const lines = await r.journal()
    assert.deepEqual(lines.map(line => line.kind), ['start', 'end'], 'no flow-end line: nothing ran')
    const done = r.emitted.at(-1)
    assert.ok(done !== undefined && done.event === 'hourness.walk-done')
    assert.deepEqual(done.payload.flows, ['flow-1 not_run'])
  }
  finally {
    r.dispose()
  }
})

test('the restart reconcile marks a job without its end abandoned and re-writes a 命令 flow evidence from the run copy; a 截图 flow waits for the next job', async () => {
  const r = await walkRig({
    flows: [twoSteps('flow-1', COMMAND_BODY, 'step-1', 'step-2'), { id: 'flow-shot', body: '走法：截图 · 预计 5 秒', steps: ['step-3'] }],
  })
  try {
    mkdirSync(r.execDir, { recursive: true })
    const at = new Date().toISOString()
    await appendJsonl(join(r.execDir, 'walks.jsonl'), { kind: 'start', job: 'job-x', goal: 'goal-1', commit: r.trunk, at })
    await appendJsonl(join(r.execDir, 'walks.jsonl'), { kind: 'flow-end', job: 'job-x', flow: 'flow-1', outcome: 'failed', exit: 2, limitMs: 90_000, elapsedMs: 1000, at })
    await appendJsonl(join(r.execDir, 'walks.jsonl'), { kind: 'flow-end', job: 'job-x', flow: 'flow-shot', outcome: 'failed', exit: 1, limitMs: 10_000, elapsedMs: 1000, at })
    await appendJsonl(join(r.execDir, 'walks.jsonl'), { kind: 'start', job: 'job-y', goal: 'goal-1', commit: r.trunk, at })
    const copy = join(r.execDir, 'walks', 'job-x', 'flow-1')
    mkdirSync(copy, { recursive: true })
    writeFileSync(join(copy, 'report.json'), `${JSON.stringify({ flow: 'flow-1', steps: [{ id: 'step-1', ok: true, said: '写进去了' }, { id: 'step-2', ok: false, said: '看不到结果' }] })}\n`)

    const count = await reconcileWalks(r.repo.graphDir, r.execDir, { report: () => {} }, 'main-1')
    assert.equal(count, 2, 'one evidence entry per listed step of the 命令 flow')
    const lines = await r.journal()
    const marks = lines.filter((line): line is Extract<WalkLine, { kind: 'abandoned' }> => line.kind === 'abandoned')
    assert.deepEqual(marks.map(mark => mark.job), ['job-x', 'job-y'], 'both jobs lost their host before their end')
    const evidence = lines.filter((line): line is Extract<WalkLine, { kind: 'evidence' }> => line.kind === 'evidence')
    assert.deepEqual(evidence.map(line => [line.job, line.flow, line.steps]), [['job-x', 'flow-1', ['step-1', 'step-2']]])
    const step1 = (await r.walkHistory('step-1')).at(-1)?.evidence?.[0]
    const step2 = (await r.walkHistory('step-2')).at(-1)?.evidence?.[0]
    assert.deepEqual([step1?.exit, step1?.note], [0, `@${r.trunk.slice(0, 7)} sha256:- 通过`])
    assert.deepEqual([step2?.exit, step2?.note], [2, `@${r.trunk.slice(0, 7)} sha256:- 没过：看不到结果`], 'the journaled command exit is the failing exit')
    assert.equal((await r.walkHistory('step-3')).length, 0, 'no review verdict survives a restart: the 截图 flow is skipped')

    const again = await reconcileWalks(r.repo.graphDir, r.execDir, { report: () => {} }, 'main-1')
    assert.equal(again, 0, 'a step already carrying the walk under the same reason is left alone')
  }
  finally {
    r.dispose()
  }
})

test('buildCovers: a commit is covered when everything after it touches only the graph directory; a source change after the walk, a no-change base and a side branch are not; an unreadable tip throws (fail closed)', async () => {
  const repo = testRepo()
  try {
    const base = repo.git('rev-parse', 'main')
    const graphCommit = repo.commit({ 'docs/graph/goal-1.json': '{}\n' }, 'graph only')
    const sourceCommit = repo.commit({ 'src/app.js': 'app\n' }, 'source')
    const tip = repo.commit({ 'docs/graph/flow-1.json': '{}\n' }, 'graph only again')
    const sideCommit = repo.commitOn('side', { 'src/side.js': 'side\n' }, 'side branch')
    const git = createGit()
    const covers = await buildCovers(git, repo.root, tip, 'docs/graph', [sourceCommit, graphCommit, base, sideCommit])
    assert.deepEqual([sourceCommit, graphCommit, base, sideCommit].map(commit => covers(commit)), [true, false, false, false], 'after the source commit only graph files changed; everything earlier saw the source change')
    await assert.rejects(buildCovers(git, repo.root, 'd'.repeat(40), 'docs/graph', [base]), /cannot be read/, 'a git failure throws: the completion gate refuses on a throw')
  }
  finally {
    repo.dispose()
  }
})
