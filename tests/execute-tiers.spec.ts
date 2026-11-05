import assert from 'node:assert/strict'
import { chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { LoadedGraph } from '../src/graph/parse.ts'
import {
  DRIVE_START_MARK,
  RELEASE_MARK,
  batchOf,
  batchSince,
  driveDecision,
  nextCounters,
  pendingRelease,
  pendingReport,
  returnsOf,
  type BatchItem,
  type DriveInput,
  type GoalView,
} from '../src/execute/tiers.ts'
import { at, comment, graphOf, node, splitGraph, stageEdit } from './execute-helpers.ts'
import { goalNow, setStage, startedRig, withRig } from './execute-drive-rig.ts'

const startComment = (session: string, release: string, module?: string): string =>
  `${module === undefined ? DRIVE_START_MARK : `模块 ${module} 已放行`} · ${RELEASE_MARK}${release} · goal goal-1 · 会话 ${session} · 主干 main`

const view = (over: Partial<GoalView> = {}): GoalView => ({ phase: 'active', armed: true, ...over })

const drive = (graph: LoadedGraph, over: Partial<DriveInput> = {}): DriveInput => ({
  graph,
  goal: graph.nodes.get('goal-1') ?? node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release')]),
  view: view(),
  session: 's2',
  restartPause: false,
  peakHold: undefined,
  peakOver: false,
  waitingDecided: false,
  ...over,
})

const plainGoal = (): LoadedGraph => graphOf([
  node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release')]),
  node({ id: 't1', type: 'task', parent: 'goal-1', kind: 'implement', writeScope: ['src/'], worktree: true, acceptance: ['x'] }),
])

test('returnsOf: the second and third tiers, acknowledged by their comment', () => {
  const moduleBack = node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design')])
  const goalBack = node({ id: 'goal-1', type: 'goal', stage: 'design' }, 0, 'llm', [stageEdit(5, 'design', 'release'), stageEdit(25, 'release', 'design', { relay: '框架要改' })])
  const graph = graphOf([goalBack, moduleBack])
  assert.deepEqual(returnsOf(graph), [
    { node: 'goal-1', tier: 3, at: at(25) },
    { node: 'module-a', tier: 2, at: at(20) },
  ])
  // The acknowledgement comment names the write's at.
  const withAck = graphOf([
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'design' }, 1, 'llm', [stageEdit(10, 'design', 'release'), stageEdit(20, 'release', 'design'), comment(30, `退回设计 · ${at(20)} · 受影响的在跑的活：没有`)]),
    node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'llm', [stageEdit(5, 'design', 'release')]),
  ])
  assert.deepEqual(returnsOf(withAck), [])
  // A feature under a module is an ordinary feature: its return is the module's own matter, not a tier of its own.
  const withFeature = graphOf([
    node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release')]),
    node({ id: 'module-a', type: 'feature', parent: 'goal-1', stage: 'release' }, 1, 'llm', [stageEdit(10, 'design', 'release')]),
    node({ id: 'f1', type: 'feature', parent: 'module-a', stage: 'design' }, 2, 'llm', [stageEdit(30, 'release', 'design')]),
  ])
  assert.deepEqual(returnsOf(withFeature), [])
})

test('pendingReport and batchSince: tier one is told, from the batch mark or the drive start', () => {
  const graph = splitGraph()
  const goalWithStart = node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(20, startComment('s1', at(5)))])
  const decided = node({ id: 'q-1', type: 'question', parent: 'goal-1', status: 'done', decider: 'agent', decision: 'keep' }, 0, 'llm', [{ at: at(12), actor: 'llm', op: 'decide', reason: '可以撤回', option: 'keep' }])
  const humanQuestion = node({ id: 'q-2', type: 'question', parent: 'goal-1', status: 'done' }, 0, 'llm', [{ at: at(13), actor: 'human', op: 'decide', option: 'theirs' }])
  const withQuestions = graphOf([...[...graph.nodes.values()].filter(entry => entry.id !== 'goal-1'), goalWithStart, decided, humanQuestion])
  const goal = withQuestions.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  assert.equal(batchSince(goal), at(20))
  assert.deepEqual(pendingReport(withQuestions, goal, at(5)), [{ id: 'q-1', title: 'q-1', at: at(12) }])
  // A batch mark replaces the start as the since.
  const batchedGoal = node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(20, startComment('s1', at(5))), comment(30, '批次 1 · 交给你 2 件 · 告知 agent 自己定的 1 件 · c1')])
  const batched = graphOf([...[...withQuestions.nodes.values()].filter(entry => entry.id !== 'goal-1'), batchedGoal])
  const batchedRef = batched.nodes.get('goal-1')
  assert.ok(batchedRef !== undefined)
  assert.equal(batchSince(batchedRef), at(30))
  assert.deepEqual(pendingReport(batched, batchedRef, at(30)), [])
})

const item = (kind: BatchItem['kind'], id: string): BatchItem => ({ kind, id, title: id })

test('batchOf: the priority, three at a time, tier one not counted', () => {
  const batch = batchOf([
    item('report', 'w1'), item('stopped', 's1'), item('report', 'w2'), item('module-release', 'm1'), item('framework', 'g1'), item('stopped', 's2'),
  ])
  assert.deepEqual(batch.now.map(entry => entry.id), ['g1', 'm1', 's1'])
  assert.deepEqual(batch.later.map(entry => entry.id), ['s2', 'w1', 'w2'])
  assert.deepEqual(batchOf([item('stopped', 's1')]).later, [])
})

test('pendingRelease: the goal\'s own release for a plain goal, each released module for a split one', () => {
  const plain = plainGoal()
  const plainRef = plain.nodes.get('goal-1')
  assert.ok(plainRef !== undefined)
  assert.deepEqual(pendingRelease(plain, plainRef), { module: '', release: at(5) })
  const graph = splitGraph()
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  // Module A is released at 10 and unnamed; module B is in design; the goal's own release is not a module release.
  assert.deepEqual(pendingRelease(graph, goal), { module: 'module-a', release: at(10) })
  // The module's release named: nothing pending, and B is not released.
  const acknowledged = graphOf([...graph.nodes.values(), node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(20, startComment('s1', at(10), 'module-a'))])])
  const ackedGoal = acknowledged.nodes.get('goal-1')
  assert.ok(ackedGoal !== undefined)
  assert.equal(pendingRelease(acknowledged, ackedGoal), undefined)
  // A goal that never ran the design loop never starts the drive on its own.
  const unstaged = graphOf([node({ id: 'goal-9', type: 'goal' }), node({ id: 't9', type: 'task', parent: 'goal-9' })])
  const unstagedGoal = unstaged.nodes.get('goal-9')
  assert.ok(unstagedGoal !== undefined)
  assert.equal(pendingRelease(unstaged, unstagedGoal), undefined)
})

test('driveDecision: the release rows, the move, and the holds', () => {
  const graph = splitGraph()
  // A goal that is not split, released, and no goal in DSH: start the drive.
  assert.deepEqual(driveDecision(drive(plainGoal(), { view: view({ phase: 'none' }) })), { action: 'release', module: '', release: at(5) })
  // Split goal: a released module's release is the pending one, whatever the goal's state.
  assert.deepEqual(driveDecision(drive(graph, { view: view({ phase: 'paused' }) })), { action: 'release', module: 'module-a', release: at(10) })
  // Unnamed release on a running unsplit drive: nothing (the start row is not for mid-drive).
  assert.deepEqual(driveDecision(drive(plainGoal(), { view: view({ phase: 'active' }) })), { action: 'none' })
  // The drive started on another session, and every release so far is processed: move.
  const moved = graphOf([...graph.nodes.values(), node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(20, startComment('s1', at(5))), comment(21, startComment('s1', at(10), 'module-a'))])])
  assert.deepEqual(driveDecision(drive(moved, { view: view({ phase: 'active' }) })), { action: 'move', release: at(5) })
  // The same session: not a move.
  assert.deepEqual(driveDecision(drive(moved, { session: 's1', view: view({ phase: 'active' }) })), { action: 'none' })
  // The person paused: hold. A pause that hugged a host exit: resume.
  assert.deepEqual(driveDecision(drive(moved, { session: 's1', view: view({ phase: 'paused' }) })), { action: 'hold', why: 'human-paused' })
  assert.deepEqual(driveDecision(drive(moved, { session: 's1', view: view({ phase: 'paused' }), restartPause: true })), { action: 'resume', reason: 'restart-pause' })
  // The person cleared the goal: hold, with the way back named by the caller.
  assert.deepEqual(driveDecision(drive(moved, { session: 's1', view: view({ phase: 'none' }) })), { action: 'hold', why: 'cleared' })
})

test('driveDecision: the active rows — design wait, disarm — and the blocked rows', () => {
  const graph = splitGraph()
  // Every release is processed, and the drive started on the current session.
  const started = graphOf([...graph.nodes.values(), node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release'), comment(20, startComment('s2', at(5))), comment(21, startComment('s2', at(10), 'module-a'))])])
  // The framework went back to design while the goal is active: stop the drive.
  const inDesign = graphOf([...started.nodes.values()].map(entry => entry.id === 'goal-1'
    ? node({ id: 'goal-1', type: 'goal', stage: 'design' }, 0, 'llm', [stageEdit(5, 'design', 'release'), stageEdit(25, 'release', 'design', { relay: '框架要改' }), comment(26, startComment('s2', at(5))), comment(27, startComment('s2', at(10), 'module-a'))])
    : entry))
  assert.deepEqual(driveDecision(drive(inDesign, { view: view() })), { action: 'design-wait' })
  // Disarmed after a host restart: resume.
  assert.deepEqual(driveDecision(drive(started, { view: view({ armed: false }) })), { action: 'resume', reason: 'disarmed' })
  // Blocked on the person, questions still open: hold; decided: resume.
  assert.deepEqual(driveDecision(drive(started, { view: view({ phase: 'blocked', blockedCode: 'hourness-waiting-human' }) })), { action: 'hold', why: 'waiting-human' })
  assert.deepEqual(driveDecision(drive(started, { view: view({ phase: 'blocked', blockedCode: 'hourness-waiting-human' }), waitingDecided: true })), { action: 'resume', reason: 'waiting-decided' })
  // Blocked on the peak: over means resume, otherwise hold.
  assert.deepEqual(driveDecision(drive(started, { view: view({ phase: 'blocked', blockedCode: 'hourness-peak-wait' }), peakOver: false })), { action: 'hold', why: 'peak-waiting' })
  assert.deepEqual(driveDecision(drive(started, { view: view({ phase: 'blocked', blockedCode: 'hourness-peak-wait' }), peakOver: true })), { action: 'resume', reason: 'peak-over' })
  // Blocked because the framework went back to design: released again means resume.
  assert.deepEqual(driveDecision(drive(inDesign, { view: view({ phase: 'blocked', blockedCode: 'hourness-design-wait' }) })), { action: 'hold', why: 'in-design' })
  const releasedAgain = graphOf([...inDesign.nodes.values()].map(entry => entry.id === 'goal-1'
    ? node({ id: 'goal-1', type: 'goal', stage: 'release' }, 0, 'human', [stageEdit(5, 'design', 'release'), stageEdit(25, 'release', 'design', { relay: '框架要改' }), comment(26, startComment('s2', at(5))), comment(27, startComment('s2', at(10), 'module-a')), stageEdit(30, 'design', 'release')])
    : entry))
  assert.deepEqual(driveDecision(drive(releasedAgain, { view: view({ phase: 'blocked', blockedCode: 'hourness-design-wait' }) })), { action: 'resume', reason: 'design-released' })
  // Any other block reason holds.
  assert.deepEqual(driveDecision(drive(started, { view: view({ phase: 'blocked', blockedCode: 'round-limit' }) })), { action: 'hold', why: 'blocked' })
})

test('nextCounters: three idle rounds block, two peak-held rounds block, progress resets', () => {
  let counters = { idle: 0, peak: 0 }
  counters = nextCounters(counters, false, false)
  assert.deepEqual(counters, { idle: 1, peak: 0, block: undefined })
  counters = nextCounters(counters, false, false)
  assert.deepEqual(counters, { idle: 2, peak: 0, block: undefined })
  counters = nextCounters(counters, false, false)
  assert.deepEqual(counters, { idle: 3, peak: 0, block: 'hourness-idle-rounds' })
  // A peak-held round does not count as idle and builds its own count.
  counters = nextCounters({ idle: 2, peak: 0 }, false, true)
  assert.deepEqual(counters, { idle: 2, peak: 1, block: undefined })
  counters = nextCounters(counters, false, true)
  assert.deepEqual(counters, { idle: 2, peak: 2, block: 'hourness-peak-wait' })
  // Progress clears both.
  assert.deepEqual(nextCounters(counters, true, false), { idle: 0, peak: 0, block: undefined })
  // A round without the peak breaks the peak streak.
  assert.deepEqual(nextCounters({ idle: 0, peak: 1 }, false, false), { idle: 1, peak: 0, block: undefined })
})

// ---- the acknowledgement on the drive's step (design §6.6 (f); src/execute/drive.ts) ----

test('(f) a return and its re-release inside one step still get the acknowledgement comment and the tier metric', () => withRig(startedRig, async (rig) => {
  await setStage(rig, 'goal-1', 'design')
  const back = (await rig.node('goal-1')).history.at(-1)?.at
  await setStage(rig, 'goal-1', 'release')
  await rig.step()
  assert.ok((await rig.comments('goal-1')).includes(`退回设计 · ${back ?? ''} · 受影响的在跑的活：没有`))
  assert.ok(rig.metrics.some(event => event.event === 'execute.tier' && event.tier === 3 && event.node === 'goal-1' && event.running === 0))
  assert.deepEqual(rig.drive.status('main-1').returns, [], 'released again: nothing is listed as sent back')
  await rig.step()
  assert.equal((await rig.comments('goal-1')).filter(text => text.startsWith('退回设计 · ')).length, 1, 'the comment is the key')
}))

test('(f) a failed acknowledgement keeps the return remembered: the consequence holds, the notice lists it, the write is not tried again', () => withRig(startedRig, async (rig) => {
  await setStage(rig, 'goal-1', 'design')
  const file = join(rig.repo.graphDir, 'nodes', 'goal-1.json')
  assert.ok(existsSync(file), 'the node file is where the store writes it')
  chmodSync(file, 0o444)
  try {
    await rig.step()
    const failed = (): number => rig.reports.filter(reason => reason.startsWith('退回设计的批注写不进图（goal-1）')).length
    assert.equal(failed(), 1)
    assert.deepEqual(rig.drive.status('main-1').returns.map(entry => [entry.node, entry.tier]), [['goal-1', 3]])
    assert.equal(goalNow(rig).blockedReason?.code, 'hourness-design-wait', 'the consequence comes from the stage, not from the comment')
    await rig.step()
    assert.equal(failed(), 1, 'not tried again in this process')
  }
  finally {
    chmodSync(file, 0o666)
  }
}))