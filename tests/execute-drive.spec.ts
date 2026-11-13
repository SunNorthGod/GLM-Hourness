/**
 * The drive (M7 design 0.6 §3.9.1, §3.9.3, §3.9.5, §3.9.7; src/execute/
 * drive.ts) on the fake rc.3 goals service and a staged graph in a temp git
 * repository, with the loop board absent so the drive's events run in the
 * row's fallback executor: a released goal gets one goal at the holder's
 * next step with no command typed; the completion gate denies with the gaps
 * and keeps the goal active, and its credential marks the graph goal done;
 * a completion outside the gate is only commented; await_human blocks and
 * the decided questions resume; an open guard request blocks and its
 * closing resumes (D3); three rounds without progress block; the person's
 * pause stays, a pause hugged by another process's exit within 30 s
 * resumes and at 60 s does not (N3); a disarmed goal is resumed; a cleared
 * one is not rebuilt; `/wish here` moves the drive (N7); another block code
 * holds and says so; drive.jsonl's lines; the batch mark and its tell (D8);
 * `hourness.tasks-closed` once per key.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { releaseAtOf } from '../src/graph/execute-stage.ts'
import { pinsOf, renderPins } from '../src/graph/pins.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { appendDrive } from '../src/execute/drive-log.ts'
import { PROC } from '../src/execute/loop-link.ts'
import { join } from 'node:path'
import { GOAL, TASK } from './execute-repo.ts'
import { completeGoal, driveRig, goalNow, graphWrite, liveOf, resultOf, startedRig, withRig, type DriveRig } from './execute-drive-rig.ts'
import { until } from './panel-helpers.ts'

const QUESTION_H = { type: 'question', id: 'question-h', parent: 'goal-1', title: 'Feed format', options: [{ key: 'A', label: 'RSS', gain: 'every reader has it', cost: 'older format' }, { key: 'B', label: 'Atom', gain: 'stricter format', cost: 'fewer readers' }], recommend: 'B', crux: 'do old readers matter', verdict: '是 → A；否 → B', weight: 'two-way' }
const QUESTION_A = { ...QUESTION_H, id: 'question-a', title: 'Feed path', decider: 'agent' }
const execOf = (rig: DriveRig, callId: string): Record<string, unknown> => ({ callId, signal: new AbortController().signal, agent: rig.agent(), deferContext: () => {}, concludeTurn: () => {} })
const refusalOf = async (run: () => Promise<unknown>): Promise<{ code: string, message: string }> => {
  try {
    await run()
  }
  catch (error) {
    return JSON.parse(error instanceof Error ? error.message : String(error)) as { code: string, message: string }
  }
  throw new Error('the call was expected to refuse')
}
const execDir = (rig: DriveRig): string => join(rig.repo.root, '.llm', 'execute')

test('a released goal gets one goal at the holder\'s next step with no command typed: §3.9.1\'s objective, the start comment naming the trunk, the entry\'s tell; later steps start nothing again', () => withRig(driveRig, async (rig) => {
  assert.equal(rig.live.goalOf('main-1'), undefined)
  await rig.step()
  await until(() => rig.live.goalOf('main-1') !== undefined, 'the drive created a goal')
  await rig.settle()
  const goal = goalNow(rig)
  assert.deepEqual([goal.phase, goal.activation, goal.maxGoalRounds], ['active', 'armed', 500])
  assert.match(goal.objective, /^Project graph goal goal-1: Static blog\nDone when: 1\. the blog builds\nDrive it through the project graph without waiting for the person: /)
  assert.match(goal.objective, /run check_commit on the commit you want on main, then fast-forward main to it\. .* Mark this goal complete only when the completion gate passes; it lists what is missing\./)
  // The nowait sentence (the design's §3.2): the background, the notices, and the turn that ends.
  assert.ok(goal.objective.includes('Run long commands in the background (run_in_background): the job\'s end, with its output, arrives by itself as a notice. Never hold the turn open with sleep, polling or a long job wait; when nothing is left to do in the turn, end it.'))
  // The three tiers' judgement hint (user graph design 0.4.1 §4.3): decide yourself, the module back to design, the big loop, unsure goes up.
  assert.ok(goal.objective.includes('Grade what development raises before you ask: what a released module\'s added tasks can build without changing that module\'s settled design, decide yourself (a question with decider agent) and tell it at the next batch; what changes a released module\'s design sends that module back to design; what needs a new module goes back to the big loop, where alone the module list is set; when unsure, take the higher tier.'), goal.objective)
  const release = releaseAtOf(await rig.node('goal-1'))
  assert.ok(release !== null)
  assert.deepEqual(rig.emitted.filter(event => event.event === 'hourness.design-released'), [{ event: 'hourness.design-released', key: `design-released:goal-1:${release}`, payload: { goal: 'goal-1', module: '', release } }])
  assert.deepEqual((await rig.comments('goal-1')).filter(text => text.startsWith('自动推进已开始')), [`自动推进已开始 · 放行 ${release} · goal ${goal.id} · 会话 main-1 · 主干 main`])
  assert.ok(rig.live.woken.some(entry => entry.kind === 'glm-hourness-loop' && entry.text.includes('The design of goal-1 is released and the drive has started.')), 'the entry tells the holder to decompose and dispatch')
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'start' && event.goal === 'goal-1'))
  await rig.step()
  await rig.step()
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'create').length, 1, 'the release comment is the key: one goal')
  assert.equal((await rig.comments('goal-1')).filter(text => text.startsWith('自动推进已开始')).length, 1)
}))

test('a goal whose Not in scope pushes the objective past 2000 characters loses the scope line first; the nowait sentence is not the first thing cut', () => withRig(() => startedRig({ nodes: [{ ...GOAL, nonGoals: ['x'.repeat(1500)] }] }), async (rig) => {
  await rig.step()
  await until(() => rig.live.goalOf('main-1') !== undefined, 'the drive created a goal')
  await rig.settle()
  const goal = goalNow(rig)
  assert.equal(goal.objective.includes('Not in scope:'), false, 'the scope line is what the cut takes first')
  assert.ok(goal.objective.length <= 2000)
  assert.ok(goal.objective.includes('Never hold the turn open with sleep, polling or a long job wait; when nothing is left to do in the turn, end it.'), 'the nowait sentence survives whole')
}))

test('update_goal complete with gaps is denied with the gaps and the goal stays active; with the acceptance review passed it is allowed and the credential marks the graph goal done with the gate evidence', () => withRig(() => startedRig({ nodes: [GOAL] }), async (rig) => {
  const denied = await completeGoal(rig)
  assert.equal(denied.kind, 'deny')
  assert.equal(denied.reason, 'The completion gate keeps goal goal-1 open. What is missing:\n- the goal\'s acceptance review has not passed: dispatch_task goal-1 with a model and why')
  assert.equal(goalNow(rig).phase, 'active', 'the goal stays active')
  assert.ok(rig.metrics.some(event => event.event === 'execute.completion-gate' && !event.passed && event.gaps === 1))
  // The acceptance review passed on the trunk commit with the goal's pins.
  const graph = await rig.graph()
  const goal = graph.nodes.get('goal-1')
  assert.ok(goal !== undefined)
  const head = rig.repo.git('rev-parse', 'HEAD')
  await graphWrite(rig, 'harness', { op: 'comment', id: 'goal-1', text: `验收审查第 1 轮：APPROVED · 挡路 0 · hz-goal-1-acc-a1-abcdef · @${head.slice(0, 12)} · ${renderPins(pinsOf(graph, goal, sha256Hex))}` })
  const allowed = await completeGoal(rig, 'call-done')
  assert.equal(allowed.kind, 'allow')
  await until(() => rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'complete'), 'the graph goal was marked done')
  const done = await rig.node('goal-1')
  assert.equal(done.status, 'done')
  const entry = done.history.at(-1)
  assert.equal(entry?.actor, 'harness')
  assert.deepEqual(entry?.evidence, [{ kind: 'check', ref: 'hourness completion gate', exit: 0, note: '0 tasks, 0 advances, acceptance review hz-goal-1-acc-a1-abcdef, call call-done' }])
}))

/** main-1 completes its drive goal without a credential: only the outside-the-gate comment, the graph goal stays open. */
async function completeOutsideGate(rig: DriveRig): Promise<void> {
  const goal = goalNow(rig)
  rig.live.goals.complete(liveOf(rig, 'main-1'), { id: goal.id, revision: goal.revision })
  await rig.settle()
  assert.ok((await rig.comments('goal-1')).includes('goal 在完成门禁之外完成'))
  assert.equal((await rig.node('goal-1')).status, 'approved')
}

test('a goal completed outside the completion gate gets only the comment, and the graph goal stays open', () => withRig(() => startedRig({ nodes: [GOAL] }), completeOutsideGate))

test('after the holder leaves main-agent mode (/wish off) its completion of the drive goal gets the outside-the-gate comment, and the graph goal stays open (§3.9.3)', () => withRig(() => startedRig({ nodes: [GOAL] }), async (rig) => {
  // main-1 is no longer the project's main agent; its drive goal still stands.
  rig.addAgent('main-2')
  rig.setHolder('main-2')
  await completeOutsideGate(rig)
}))

test('await_human blocks the goal hourness-waiting-human with the ids and the summary, refuses ids that are not the person\'s open questions, and the step after they are decided resumes', () => withRig(() => startedRig({ nodes: [GOAL, TASK, QUESTION_H] }), async (rig) => {
  const refused = await refusalOf(() => rig.drive.awaitHuman.execute({ questions: ['task-1'], summary: 'which feed format' }, execOf(rig, 'call-x')))
  assert.equal(refused.code, 'invalid')
  assert.match(refused.message, /task-1 is not an open question of goal goal-1 that the person decides/)
  assert.equal((await refusalOf(() => rig.drive.awaitHuman.execute({ questions: [], summary: 'x' }, execOf(rig, 'call-y')))).code, 'invalid')
  const result = await rig.drive.awaitHuman.execute({ questions: ['question-h'], summary: 'Which feed format to ship.' }, execOf(rig, 'call-a'))
  assert.deepEqual(result, { goal: 'goal-1', blocked: true, questions: ['question-h'] })
  assert.deepEqual([goalNow(rig).phase, goalNow(rig).blockedReason], ['blocked', { code: 'hourness-waiting-human', message: 'Waiting for the person: question-h. Which feed format to ship.' }])
  await rig.step()
  assert.equal(goalNow(rig).phase, 'blocked', 'not decided yet: it waits')
  await graphWrite(rig, 'human', { op: 'decide', id: 'question-h', option: 'A', reason: 'the person chose RSS' })
  await rig.step()
  assert.deepEqual([goalNow(rig).phase, goalNow(rig).activation], ['active', 'armed'])
  assert.equal(rig.drive.status('main-1').state, 'What the drive waited for is decided; the drive has resumed.')
  assert.ok((await rig.lines()).some(line => line.op === 'resume' && line.reason === 'waiting-decided'))
}))

test('an open guard request blocks the active goal hourness-waiting-human and its closing resumes it (D3)', () => withRig(startedRig, async (rig) => {
  rig.requests = [{ ref: 'r-1', askedAt: rig.now().toISOString(), target: 'C:/outside/feed.xml' }]
  await rig.step()
  assert.deepEqual(goalNow(rig).blockedReason, { code: 'hourness-waiting-human', message: 'Waiting for the person: request r-1 (C:/outside/feed.xml).' })
  await rig.step()
  assert.equal(goalNow(rig).phase, 'blocked', 'the request is still open')
  rig.requests = []
  await rig.step()
  assert.equal(goalNow(rig).phase, 'active')
}))

test('three goal rounds without progress block hourness-idle-rounds; a round with progress resets the count', () => withRig(startedRig, async (rig) => {
  await rig.round()
  await rig.round()
  await rig.round()
  assert.equal(goalNow(rig).phase, 'active', 'two idle rounds after the first do not block')
  await graphWrite(rig, 'harness', { op: 'comment', id: 'task-1', text: 'progress' })
  await rig.round()
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 0, peak: 0 }, 'progress resets')
  await rig.round()
  await rig.round()
  assert.equal(goalNow(rig).phase, 'active')
  await rig.round()
  assert.equal(goalNow(rig).blockedReason?.code, 'hourness-idle-rounds')
  assert.match(goalNow(rig).blockedReason?.message ?? '', /^No progress in three goal rounds in a row/)
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'block' && event.code === 'hourness-idle-rounds'))
}))

test('the person\'s pause stays; a pause hugged by another process\'s exit within 30 s resumes with the comment; at 60 s, or with the person writing in between, it does not (N3)', () => withRig(startedRig, async (rig) => {
  const pause = (): void => {
    const goal = goalNow(rig)
    rig.live.goals.pause(liveOf(rig), { id: goal.id, revision: goal.revision })
  }
  pause()
  await rig.settle()
  await rig.step()
  assert.equal(goalNow(rig).phase, 'paused')
  assert.equal(rig.drive.status('main-1').state, 'The person paused the drive; it resumes when they press resume on the goal bar or run /goal resume.')
  // Another process paused and exited 20 seconds later.
  const hug = async (proc: number, seconds: number): Promise<void> => {
    const at = Date.parse(rig.now().toISOString()) - 120_000
    await appendDrive(execDir(rig), { op: 'pause', proc, at: new Date(at).toISOString(), goal: goalNow(rig).id })
    await appendDrive(execDir(rig), { op: 'exit', proc, at: new Date(at + seconds * 1000).toISOString() })
  }
  await hug(PROC + 1, 20)
  await rig.step()
  assert.equal(goalNow(rig).phase, 'active')
  assert.ok((await rig.comments('goal-1')).includes('重启前的暂停（暂停后 20 秒宿主退出），已恢复'))
  assert.equal(rig.drive.status('main-1').state, 'The drive was paused by the app shutting down and has resumed. If the person meant to pause it, they can pause it again.')
  pause()
  await rig.settle()
  await hug(PROC + 2, 60)
  await rig.step()
  assert.equal(goalNow(rig).phase, 'paused', 'sixty seconds is not the shutdown')
  await hug(PROC + 3, 10)
  const hugged = Date.parse(rig.now().toISOString()) - 115_000
  rig.documents = [{ seq: 1, type: 'user/message', time: hugged, surface: 'current', text: 'stop for now' }]
  await rig.step()
  assert.equal(goalNow(rig).phase, 'paused', 'the person wrote between the pause and the exit')
}))

test('an active goal that is not armed is resumed, and the holder\'s first step handed over hourness.host-started', () => withRig(startedRig, async (rig) => {
  assert.ok(rig.emitted.some(event => event.event === 'hourness.host-started' && event.key === `host-started:main-1:${PROC}`))
  rig.live.disarm('main-1')
  await rig.step()
  assert.deepEqual([goalNow(rig).phase, goalNow(rig).activation], ['active', 'armed'])
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'resume' && event.reason === 'disarmed'))
}))

test('a goal the person cleared is not rebuilt; the line gives the objective to start again with', () => withRig(startedRig, async (rig) => {
  const goal = goalNow(rig)
  rig.live.goals.clear(liveOf(rig), { id: goal.id, revision: goal.revision })
  await rig.step()
  await rig.step()
  assert.equal(rig.live.goalOf('main-1'), undefined)
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'create').length, 1)
  const line = rig.drive.status('main-1').state ?? ''
  assert.match(line, /^The person cleared the drive\. If they ask you to continue, call create_goal with this objective: Project graph goal goal-1: Static blog\n/)
  // The objective is the one start builds: the trunk from the project, not a stand-in.
  assert.equal(line.slice(line.indexOf('Project graph goal ')), goal.objective)
}))

test('/wish here: the new holder gets the drive and the moved comment, the old live session\'s drive goal is cleared (N7)', () => withRig(startedRig, async (rig) => {
  rig.addAgent('main-2')
  rig.setHolder('main-2')
  await rig.step('main-2')
  const release = releaseAtOf(await rig.node('goal-1'))
  assert.equal(goalNow(rig, 'main-2').phase, 'active')
  assert.match(goalNow(rig, 'main-2').objective, /^Project graph goal goal-1: /)
  assert.ok((await rig.comments('goal-1')).includes(`自动推进移到会话 main-2 · 放行 ${release}`))
  assert.equal(rig.live.goalOf('main-1'), undefined, 'the old session no longer drives')
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'move'))
  await rig.step('main-2')
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'create').length, 2, 'moved once')
}))

test('a goal blocked with another code holds and says so; the model\'s block and the round limit are commented on the graph goal', () => withRig(startedRig, async (rig) => {
  const goal = goalNow(rig)
  rig.live.goals.block(liveOf(rig), { id: goal.id, revision: goal.revision }, { code: 'model-reported', message: 'the feed library is missing' })
  await rig.settle()
  await rig.step()
  assert.equal(goalNow(rig).phase, 'blocked')
  assert.equal(rig.drive.status('main-1').state, 'The drive is blocked (model-reported: the feed library is missing); when the person says to go on, call update_goal resume.')
  assert.ok((await rig.comments('goal-1')).includes('goal 被阻塞（model-reported）：the feed library is missing'))
  const blocked = goalNow(rig)
  rig.live.goals.resume(liveOf(rig), { id: blocked.id, revision: blocked.revision })
  const active = goalNow(rig)
  rig.live.goals.block(liveOf(rig), { id: active.id, revision: active.revision }, { code: 'round-limit', message: 'Goal reached its configured limit of 500 rounds.' })
  await rig.settle()
  await rig.step()
  assert.match(rig.drive.status('main-1').state ?? '', /first raise max_goal_rounds by 500 with update_goal edit, then resume\.$/)
  assert.ok((await rig.comments('goal-1')).includes('goal 到了轮次上限（round-limit）：Goal reached its configured limit of 500 rounds.'))
}))

test('drive.jsonl holds the start line, the pause of the holder\'s goal and the exit line of the dispose', () => withRig(startedRig, async (rig) => {
  const goal = goalNow(rig)
  rig.live.goals.pause(liveOf(rig), { id: goal.id, revision: goal.revision })
  await rig.settle()
  rig.drive.dispose()
  const lines = await rig.lines()
  assert.deepEqual(lines.map(line => line.op), ['start', 'pause', 'exit'])
  assert.ok(lines.every(line => line.proc === PROC))
  assert.equal(lines[1]?.goal, goal.id)
}))

test('the batch mark after a shown propose_to_human and after await_human, and the tell of what the agent decided itself (D8)', () => withRig(() => startedRig({ nodes: [GOAL, TASK, QUESTION_A, QUESTION_H] }), async (rig) => {
  await graphWrite(rig, 'llm', { op: 'decide', id: 'question-a', option: 'B', reason: 'the agent decided the path itself' })
  const next = (): Promise<{ readonly kind: 'accept' }> => Promise.resolve({ kind: 'accept' })
  const proposed = resultOf({ tool: 'propose_to_human', kind: 'question', number: 1, text: 'Which feed format should ship first?' })
  await rig.drive.batchMark({ name: 'propose_to_human', arguments: {}, agent: rig.agent(), callId: 'call-p1' }, proposed, next)
  assert.ok((await rig.comments('goal-1')).includes('批次 1 · 交给你 1 件 · 告知 agent 自己定的 1 件 · call-p1'))
  assert.equal(rig.drive.status('main-1').batchTell, 'Say in one line each, in this same reply, what you decided yourself since the last batch: question-a Feed path.')
  assert.ok(rig.metrics.some(event => event.event === 'execute.tier' && event.tier === 1 && event.reported === 1 && event.batched === 1))
  // An error result and a result that is not a shown proposal are no batch.
  await rig.drive.batchMark({ name: 'propose_to_human', arguments: {}, agent: rig.agent(), callId: 'call-p2' }, { isError: true, content: [{ type: 'text', text: 'Error: no' }] }, next)
  await rig.drive.batchMark({ name: 'propose_to_human', arguments: {}, agent: rig.agent(), callId: 'call-p3' }, resultOf({ refused: true }), next)
  await rig.drive.batchMark({ name: 'await_human', arguments: {}, agent: rig.agent(), callId: 'call-a1' }, resultOf({ goal: 'goal-1', blocked: true, questions: ['question-h'] }), next)
  const batches = (await rig.comments('goal-1')).filter(text => text.startsWith('批次 '))
  assert.deepEqual(batches, ['批次 1 · 交给你 1 件 · 告知 agent 自己定的 1 件 · call-p1', '批次 2 · 交给你 1 件 · 告知 agent 自己定的 0 件 · call-a1'])
  assert.equal(rig.drive.status('main-1').batchTell, undefined)
}))

test('hourness.tasks-closed goes out once every task of the goal is closed, with one key for one close', () => withRig(startedRig, async (rig) => {
  await rig.step()
  assert.equal(rig.emitted.filter(event => event.event === 'hourness.tasks-closed').length, 0)
  await graphWrite(rig, 'human', { op: 'status', id: 'task-1', to: 'done', evidence: [{ kind: 'check', ref: 'manual run', exit: 0 }], reason: 'test: the task is done' })
  await rig.step()
  await rig.step()
  const keys = new Set(rig.emitted.filter(event => event.event === 'hourness.tasks-closed').map(event => event.key))
  assert.equal(keys.size, 1)
  assert.match([...keys][0] ?? '', /^tasks-closed:goal-1:\d{4}-/)
  assert.equal(rig.live.woken.filter(entry => entry.text.includes('All tasks of goal-1 are closed.')).length, 1, 'one tell for one key')
}))
