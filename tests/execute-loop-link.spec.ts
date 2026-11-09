/**
 * The execute row's seam to the loop board (M7 design 0.6 §2.5 points 1–7;
 * src/execute/loop-link.ts) against a fake `glmHournessLoops` and the real
 * registry: every entry of the three tables is kept by the board's own
 * `createRegistry`; a dropped entry runs in the fallback and the health
 * names it; a harness entry the board does not run within five minutes is
 * run by the watchdog, and a late run is the action's own `skipped`; `busy`
 * and `unheard` run the fallback at once; `duplicate` reruns only an action
 * another process left half-done; `runAction` answers `failed` and never
 * rejects for an unknown action and a project that is not a git root; the
 * claim lines of actions.jsonl; a red trunk check is `done` with its tell;
 * one key once per process; a notice for a holder that is not live waits for
 * its next step; `replayInterrupted` reruns another process's open start.
 */
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { trunkCheck, type CheckDeps } from '../src/execute/check.ts'
import { createGraphCache } from '../src/execute/dispatch.ts'
import { EXECUTE_ENTRIES } from '../src/execute/entries.ts'
import { createGateLauncher } from '../src/execute/gate-provider.ts'
import { createGit } from '../src/execute/git.ts'
import { createLoopLink, stopDraftAction, type LoopAction, type LoopEmit, type LoopLink } from '../src/execute/loop-link.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import { createRegistry } from '../src/loops/registry.ts'
import type { Contribution, ContributeResult, EmitResult, LoopEventInput, LoopEventRecord, LoopsService } from '../src/loops/service.ts'
import type { ServiceLookup, UserNotice } from '../src/shared/dsh-min.ts'
import { noticeHost } from './execute-helpers.ts'
import { GOAL, TASK, gateNode, stageNodes, testRepo, type TestRepo } from './execute-repo.ts'
import { until } from './panel-helpers.ts'

const PROC = Math.round(performance.timeOrigin)
const START = Date.parse('2026-11-04T09:00:00.000Z')
const SOURCE = { plugin: 'dsh-hourness', row: 'glm-hourness/execute' }

interface Rig {
  readonly repo: TestRepo
  readonly link: LoopLink
  readonly sent: UserNotice[]
  readonly metrics: MetricEvent[]
  readonly reports: string[]
  /** The keys the fake start-drive action ran for. */
  readonly runs: string[]
  advance(ms: number): void
  /** Run the timers that are due, the way the host's would. */
  fire(): void
  timers(): number
  setLive(live: boolean): void
  record(event: LoopEmit): LoopEventRecord
  dispose(): void
}

/** `execute.start-drive` as the drive will be: done once per key, `skipped` after. */
function idempotent(runs: string[]): LoopAction {
  const done = new Set<string>()
  return (record) => {
    runs.push(record.key)
    if (done.has(record.key)) return Promise.resolve({ outcome: 'skipped', reason: 'already done' })
    done.add(record.key)
    return Promise.resolve({ outcome: 'done' })
  }
}

async function rig(options: { gate?: readonly string[], actions?: (deps: { lookup: ServiceLookup, repo: TestRepo }) => Readonly<Record<string, LoopAction>> } = {}): Promise<Rig> {
  const repo = testRepo()
  await stageNodes(repo.graphDir, [GOAL, TASK, ...(options.gate === undefined ? [] : [gateNode(options.gate)])])
  const host = noticeHost({ root: repo.root, graphDir: repo.graphDir })
  let live = true
  const lookup: ServiceLookup = { get: name => name === 'agents' && !live ? { get: () => undefined } : host.lookup.get?.(name) }
  const metrics: MetricEvent[] = []
  const previous = setMetricSink(event => { metrics.push(event) })
  const reports: string[] = []
  const runs: string[] = []
  let now = START
  let pending: { run: () => void, at: number }[] = []
  const cache = createGraphCache(() => {})
  const link = createLoopLink({
    lookup,
    execDir: root => join(root, '.llm', 'execute'),
    graphDirOfRoot: () => repo.graphDir,
    cache,
    report: (_session, _state, reason) => { reports.push(reason) },
    actions: { 'execute.start-drive': idempotent(runs), 'execute.stop-draft': stopDraftAction(cache, () => repo.graphDir), ...options.actions?.({ lookup, repo }) },
    notesChanged: () => {},
    now: () => new Date(now),
    delay: (run, ms) => {
      const timer = { run, at: now + ms }
      pending.push(timer)
      return () => { pending = pending.filter(item => item !== timer) }
    },
  })
  return {
    repo,
    link,
    sent: host.sent,
    metrics,
    reports,
    runs,
    advance: (ms) => { now += ms },
    fire: () => {
      const due = pending.filter(item => item.at <= now)
      pending = pending.filter(item => item.at > now)
      for (const item of due) item.run()
    },
    timers: () => pending.length,
    setLive: (value) => { live = value },
    record: event => ({ id: 'ev-00000000000000aa', event: event.event, at: new Date(now).toISOString(), project: repo.root, session: 'main-1', key: event.key, payload: event.payload, merged: [] }),
    dispose: () => {
      link.dispose()
      setMetricSink(previous)
      repo.dispose()
    },
  }
}

/** A board service: `contribute` answers with `contributed`, `emit` with `answer`; every emit is kept. */
function fakeBoard(answer: (input: LoopEventInput) => EmitResult, contributed: (contribution: Contribution) => ContributeResult = contribution => ({ ok: true, dispose: () => {}, accepted: contribution.entries.map(entry => entry.id), dropped: [] })): { readonly service: LoopsService, readonly emits: LoopEventInput[] } {
  const emits: LoopEventInput[] = []
  return {
    emits,
    service: {
      declaration: 'the fake board',
      contribute: (_source, contribution) => contributed(contribution),
      emit: (input) => {
        emits.push(input)
        return Promise.resolve(answer(input))
      },
      listens: () => true,
      recordRun: () => {},
    },
  }
}

/** A fake board with this emit answer, the rig's link attached to it. */
function withBoard(r: Rig, answer: EmitResult): ReturnType<typeof fakeBoard> {
  const board = fakeBoard(() => answer)
  r.link.attach(board.service)
  return board
}

const released = (at: string): LoopEmit => ({ event: 'hourness.design-released', key: `design-released:goal-1:${at}`, payload: { goal: 'goal-1', module: '', release: at } })
const reviewPassed = (childId: string): LoopEmit => ({ event: 'hourness.review-passed', key: `review-passed:task-1:${childId}`, payload: { task: 'task-1', round: 1 } })
const loopNotices = (r: Rig): UserNotice[] => r.sent.filter(notice => notice.source.kind === 'glm-hourness-loop')
const textOf = (notice: UserNotice | undefined): string => notice?.content[0]?.text ?? ''
const actionLines = (r: Rig): Record<string, unknown>[] => readFileSync(join(r.repo.root, '.llm', 'execute', 'actions.jsonl'), 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)
const writeLine = (r: Rig, line: Record<string, unknown>): void => {
  mkdirSync(join(r.repo.root, '.llm', 'execute'), { recursive: true })
  appendFileSync(join(r.repo.root, '.llm', 'execute', 'actions.jsonl'), `${JSON.stringify(line)}\n`)
}
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 100) })

// ---- the hand-over (§2.5 points 1, 4, 7) ----

test('the real registry keeps every entry, event and action of the hand-over and drops nothing; attached to it the row has no health note', async () => {
  const r = await rig()
  try {
    assert.deepEqual(r.link.notes(), [{ text: '循环板不在：M7 的事件条目由 M7 自己执行，晨报、周报、巡检不会到点出现', degraded: false }], 'the board being absent is a note that does not degrade')
    const registry = createRegistry({ now: () => new Date(START) })
    const contributed: ContributeResult[] = []
    const board = fakeBoard(() => ({ ok: true, id: 'ev-1', duplicate: false }), (contribution) => {
      const result = registry.contribute(SOURCE, contribution)
      contributed.push(result)
      return result
    })
    const withdraw = r.link.attach(board.service)
    const result = contributed[0]
    assert.ok(result?.ok, result?.ok === false ? result.reason : 'contribute was not called')
    assert.deepEqual(result.accepted, EXECUTE_ENTRIES.map(entry => entry.id))
    assert.deepEqual(result.dropped, [])
    assert.deepEqual(registry.entries().map(entry => [entry.entry.id, entry.state]), EXECUTE_ENTRIES.map(entry => [entry.id, 'active']))
    assert.equal(typeof registry.runOfAction('execute.stop-draft'), 'function', 'the board reaches the row\u2019s actions')
    assert.deepEqual(r.link.notes(), [])
    assert.ok(r.metrics.some(event => event.event === 'execute.loop-contribute' && event.accepted.length === EXECUTE_ENTRIES.length && event.dropped.length === 0))
    // The same service again (agent/created, V12) keeps the standing hand-over.
    r.link.attach(board.service)
    assert.equal(contributed.length, 1)
    withdraw()
    assert.equal(registry.entries().length, 0, 'the disposer withdraws the hand-over')
    r.link.attach(undefined, 'glmHournessLoops has the wrong shape')
    assert.deepEqual(r.link.notes(), [{ text: '循环板接口与 M7 不符：glmHournessLoops has the wrong shape；M7 自己执行事件条目', degraded: true }])
  }
  finally {
    r.dispose()
  }
})

test('an entry the board drops runs in the fallback and the health names it; the event still goes to the board', async () => {
  const r = await rig()
  try {
    const board = fakeBoard(() => ({ ok: true, id: 'ev-1', duplicate: false }), contribution => ({
      ok: true,
      dispose: () => {},
      accepted: contribution.entries.map(entry => entry.id).filter(id => id !== 'execute.reviewed'),
      dropped: [{ id: 'execute.reviewed', reason: 'why：写 1 到 150 个字' }],
    }))
    r.link.attach(board.service)
    assert.deepEqual(r.link.notes(), [{ text: '循环板没收下 execute.reviewed：why：写 1 到 150 个字；这几项由 M7 自己执行', degraded: true }])
    r.link.emit(r.repo.root, 'main-1', reviewPassed('hz-task-1-r1-aaaaaa'))
    await until(() => board.emits.length === 1, 'the event goes to the board')
    const notice = loopNotices(r).at(-1)
    assert.deepEqual(notice?.source.hournessLoop, { entry: 'execute.reviewed', key: 'review-passed:task-1:hz-task-1-r1-aaaaaa' })
    assert.equal(textOf(notice), 'task-1 is ready to integrate. Build the commit for the main branch with the trailer "Hourness-Task: task-1", run check_commit on it, then fast-forward the main branch to it.')
    assert.deepEqual(board.emits[0], { event: 'hourness.review-passed', cwd: r.repo.root, session: 'main-1', key: 'review-passed:task-1:hz-task-1-r1-aaaaaa', payload: { task: 'task-1', round: 1 } })
  }
  finally {
    r.dispose()
  }
})

// ---- the watchdog (§2.5 point 5) ----

test('a harness entry the board accepts but never runs is run by the watchdog after five minutes; the late board call gets the action\u2019s skipped', async () => {
  const r = await rig()
  try {
    withBoard(r, { ok: true, id: 'ev-1', duplicate: false })
    const event = released('2026-11-04T08:59:00.000Z')
    r.link.emit(r.repo.root, 'main-1', event)
    await until(() => r.timers() === 1, 'a pending claim starts the watchdog')
    r.advance(30_000)
    r.fire()
    await settle()
    assert.deepEqual(r.runs, [], 'nothing runs before the five minutes are up')
    assert.equal(r.timers(), 1, 'the watchdog looks again')
    r.advance(4.5 * 60_000)
    r.fire()
    await until(() => loopNotices(r).length === 1, 'the watchdog runs the entry')
    assert.deepEqual(r.runs, [event.key])
    assert.equal(textOf(loopNotices(r)[0]), 'The design of goal-1 is released and the drive has started. Decompose it into tasks with dispatch attributes and dispatch them with dispatch_task; do not wait for the person.')
    assert.ok(r.metrics.some(item => item.event === 'execute.loop-fallback' && item.entry === 'execute.release' && item.key === event.key && item.reason === 'unclaimed' && item.waitedS === 300))
    const note = r.link.notes().at(-1)
    assert.deepEqual(note, { text: '循环板没有在 5 分钟内执行『开始自动推进』（hourness.design-released）：M7 自己执行了（近 24 小时接手 1 次）', degraded: true })
    assert.equal(r.timers(), 0, 'no claim left, no timer')
    assert.deepEqual(await r.link.runAction('execute.start-drive', r.record(event)), { outcome: 'skipped', reason: 'already done' })
  }
  finally {
    r.dispose()
  }
})

test('a claim whose action has an end line in actions.jsonl (another process ran it) is dropped without running', async () => {
  const r = await rig()
  try {
    withBoard(r, { ok: true, id: 'ev-1', duplicate: false })
    const event = released('2026-11-04T08:58:00.000Z')
    r.link.emit(r.repo.root, 'main-1', event)
    await until(() => r.timers() === 1, 'the watchdog starts')
    writeLine(r, { action: 'execute.start-drive', key: event.key, event: event.event, payload: event.payload, at: new Date(START).toISOString(), proc: 1, phase: 'start' })
    writeLine(r, { action: 'execute.start-drive', key: event.key, at: new Date(START).toISOString(), proc: 1, phase: 'end', outcome: 'done' })
    r.advance(6 * 60_000)
    r.fire()
    await settle()
    assert.deepEqual(r.runs, [])
    assert.equal(r.timers(), 0)
  }
  finally {
    r.dispose()
  }
})

// ---- what emit answers (§2.5 points 4, 5; D16) ----

test('busy from the board runs the listening entries at once, with execute.loop-fallback emit-failed and a health line', async () => {
  const r = await rig()
  try {
    withBoard(r, { ok: false, code: 'busy', message: 'the inbox is held' })
    r.link.emit(r.repo.root, 'main-1', reviewPassed('hz-task-1-r1-bbbbbb'))
    await until(() => loopNotices(r).length === 1, 'the fallback tells the holder')
    assert.ok(r.metrics.some(item => item.event === 'execute.loop-fallback' && item.entry === 'execute.reviewed' && item.reason === 'emit-failed'))
    assert.match(r.link.notes().at(-1)?.text ?? '', /^交给循环板的事件 hourness\.review-passed 没交上（busy：the inbox is held）：M7 自己执行了（近 24 小时接手 1 次）$/)
  }
  finally {
    r.dispose()
  }
})

test('unheard runs the row\u2019s listening entries here (D16)', async () => {
  const r = await rig()
  try {
    withBoard(r, { ok: true, duplicate: false, unheard: true })
    const event = released('2026-11-04T08:57:00.000Z')
    r.link.emit(r.repo.root, 'main-1', event)
    await until(() => r.runs.length === 1, 'the fallback runs start-drive')
    assert.equal(r.timers(), 0, 'no claim for an event nobody hears')
  }
  finally {
    r.dispose()
  }
})

test('duplicate reruns an action whose only line is another process\u2019s start older than ten minutes; an end line or a recent start leaves it', async () => {
  const r = await rig()
  try {
    withBoard(r, { ok: true, id: 'ev-1', duplicate: true })
    const abandoned = released('2026-11-04T08:40:00.000Z')
    writeLine(r, { action: 'execute.start-drive', key: abandoned.key, event: abandoned.event, payload: abandoned.payload, at: new Date(START - 11 * 60_000).toISOString(), proc: 1, phase: 'start' })
    const finished = released('2026-11-04T08:41:00.000Z')
    writeLine(r, { action: 'execute.start-drive', key: finished.key, event: finished.event, payload: finished.payload, at: new Date(START - 11 * 60_000).toISOString(), proc: 1, phase: 'start' })
    writeLine(r, { action: 'execute.start-drive', key: finished.key, at: new Date(START - 10 * 60_000).toISOString(), proc: 1, phase: 'end', outcome: 'done' })
    const running = released('2026-11-04T08:42:00.000Z')
    writeLine(r, { action: 'execute.start-drive', key: running.key, event: running.event, payload: running.payload, at: new Date(START - 60_000).toISOString(), proc: 1, phase: 'start' })
    for (const event of [abandoned, finished, running]) r.link.emit(r.repo.root, 'main-1', event)
    await until(() => r.runs.length === 1, 'the abandoned action runs again')
    await settle()
    assert.deepEqual(r.runs, [abandoned.key])
    assert.ok(r.metrics.some(item => item.event === 'execute.loop-fallback' && item.key === abandoned.key && item.reason === 'interrupted'))
    assert.equal(r.timers(), 0, 'a duplicate leaves no claim')
  }
  finally {
    r.dispose()
  }
})

// ---- runAction (§2.5 point 2) ----

test('runAction answers failed and never rejects: an unknown action, a key the board would refuse, a directory that is no git root', async () => {
  const r = await rig()
  const outside = mkdtempSync(join(tmpdir(), 'loop-link-outside-'))
  try {
    const stopped: LoopEmit = { event: 'hourness.stopped', key: 'stopped:task-1:check-2026-11-04T09:00:00.000Z', payload: { node: 'task-1', kind: 'check', rounds: 3 } }
    assert.deepEqual(await r.link.runAction('execute.nothing', r.record(stopped)), { outcome: 'failed', reason: 'unknown action execute.nothing' })
    assert.deepEqual(await r.link.runAction('execute.stop-draft', { ...r.record(stopped), key: 'stopped:task-1' }), { outcome: 'failed', reason: 'key must name one occurrence: <event>:<subject>:<occurrence>' })
    assert.deepEqual(await r.link.runAction('execute.stop-draft', { ...r.record(stopped), project: outside }), { outcome: 'failed', reason: `${outside} is not the root of a git repository` })
    const inside = join(r.repo.root, 'docs')
    assert.deepEqual(await r.link.runAction('execute.stop-draft', { ...r.record(stopped), project: inside }), { outcome: 'failed', reason: `${inside} is not the root of a git repository` })
    assert.deepEqual(await r.link.runAction('execute.stop-draft', r.record(stopped)), { outcome: 'skipped', reason: 'nothing stopped there' })
  }
  finally {
    rmSync(outside, { recursive: true, force: true })
    r.dispose()
  }
})

test('every run writes a synced start line and an end line to actions.jsonl, with this process', async () => {
  const r = await rig()
  try {
    const event = released('2026-11-04T08:56:00.000Z')
    assert.deepEqual(await r.link.runAction('execute.start-drive', r.record(event)), { outcome: 'done' })
    assert.deepEqual(actionLines(r), [
      { action: 'execute.start-drive', key: event.key, event: event.event, payload: event.payload, at: new Date(START).toISOString(), proc: PROC, phase: 'start' },
      { action: 'execute.start-drive', key: event.key, at: new Date(START).toISOString(), proc: PROC, phase: 'end', outcome: 'done' },
    ])
  }
  finally {
    r.dispose()
  }
})

test('without a board, a trunk advance whose full check finds the trunk red tells the holder through execute.trunk: done with the tell', async () => {
  const FAIL_ON_FILE = '`$ node -e "process.exit(require(\'fs\').existsSync(\'FAIL\') ? 3 : 0)"`'
  const r = await rig({
    gate: [FAIL_ON_FILE],
    actions: ({ lookup, repo }) => {
      const deps: CheckDeps = {
        lookup,
        cache: createGraphCache(() => {}),
        graphDirOf: () => repo.graphDir,
        execDir: root => join(root, '.llm', 'execute'),
        isMain: () => false,
        report: () => {},
        git: createGit(),
        launcher: createGateLauncher(),
      }
      return { 'execute.trunk-check': record => trunkCheck(deps, record) }
    },
  })
  try {
    const from = r.repo.git('rev-parse', 'HEAD')
    const broken = r.repo.commit({ 'FAIL': 'x\n' }, 'broken on main')
    const event: LoopEmit = { event: 'hourness.trunk-advanced', key: `trunk-advanced:${broken}:2026-11-04T09:00:00.000Z`, payload: { from, to: broken, tasks: '', files: ['FAIL'], truncated: false } }
    r.link.emit(r.repo.root, 'main-1', event)
    await until(() => loopNotices(r).length === 1, 'the red trunk reaches the holder')
    const notice = loopNotices(r)[0]
    assert.deepEqual(notice.source.hournessLoop, { entry: 'execute.trunk', key: event.key })
    assert.match(textOf(notice), new RegExp(`^The full check on main ${broken.slice(0, 12)} failed: node -e .* exit 3 \\(\\.llm/execute/checks/${broken}/[^/]+/0\\.log\\)\\. Fix it or revert\\.$`))
    assert.deepEqual(actionLines(r).map(line => [line.action, line.phase, line.outcome]), [['execute.trunk-check', 'start', undefined], ['execute.trunk-check', 'end', 'done']])
  }
  finally {
    r.dispose()
  }
})

// ---- keys, held notices, the replay (§2.5 points 3, 6; §3.9.6 step 7) ----

test('one key once per process: a handback replayed twice is one event, two closes of one goal are two', async () => {
  const r = await rig()
  try {
    const board = withBoard(r, { ok: true, id: 'ev-1', duplicate: false })
    const handback: LoopEmit = { event: 'hourness.handback', key: 'handback:task-1:hz-task-1-a1-aaaaaa', payload: { task: 'task-1', attempt: 1, status: 'done', depth: 'full', reviewTask: 'task-2', commits: 1, floorHit: '' } }
    r.link.emit(r.repo.root, 'main-1', handback)
    r.link.emit(r.repo.root, 'main-1', handback)
    r.link.emit(r.repo.root, 'main-1', { event: 'hourness.tasks-closed', key: 'tasks-closed:goal-1:2026-11-04T08:10:00.000Z', payload: { goal: 'goal-1' } })
    r.link.emit(r.repo.root, 'main-1', { event: 'hourness.tasks-closed', key: 'tasks-closed:goal-1:2026-11-04T08:50:00.000Z', payload: { goal: 'goal-1' } })
    await until(() => board.emits.length === 3, 'three events reach the board')
    await settle()
    assert.deepEqual(board.emits.map(input => input.key), [handback.key, 'tasks-closed:goal-1:2026-11-04T08:10:00.000Z', 'tasks-closed:goal-1:2026-11-04T08:50:00.000Z'])
    assert.deepEqual(loopNotices(r), [], 'the board runs tell-main entries it accepted')
  }
  finally {
    r.dispose()
  }
})

test('a notice for a holder that is not live waits in memory and goes out at its next step', async () => {
  const r = await rig()
  try {
    r.setLive(false)
    r.link.emit(r.repo.root, 'main-1', reviewPassed('hz-task-1-r1-cccccc'))
    await settle()
    assert.deepEqual(loopNotices(r), [])
    assert.ok(r.metrics.some(item => item.event === 'execute.loop-entry' && item.entry === 'execute.reviewed' && !item.delivered && item.deferred === 'holder-not-live'))
    r.setLive(true)
    r.link.flushHeld('main-1')
    assert.equal(loopNotices(r).length, 1)
    assert.deepEqual(loopNotices(r)[0].source.hournessLoop, { entry: 'execute.reviewed', key: 'review-passed:task-1:hz-task-1-r1-cccccc' })
    r.link.flushHeld('main-1')
    assert.equal(loopNotices(r).length, 1, 'a flushed notice is not sent twice')
  }
  finally {
    r.dispose()
  }
})

test('replayInterrupted reruns a start without an end that another process wrote, once; this process\u2019s own and ended ones are left', async () => {
  const r = await rig()
  try {
    const interrupted = released('2026-11-04T08:30:00.000Z')
    writeLine(r, { action: 'execute.start-drive', key: interrupted.key, event: interrupted.event, payload: interrupted.payload, at: new Date(START - 60_000).toISOString(), proc: 1, phase: 'start' })
    const own = released('2026-11-04T08:31:00.000Z')
    writeLine(r, { action: 'execute.start-drive', key: own.key, event: own.event, payload: own.payload, at: new Date(START - 60_000).toISOString(), proc: PROC, phase: 'start' })
    const ended = released('2026-11-04T08:32:00.000Z')
    writeLine(r, { action: 'execute.start-drive', key: ended.key, event: ended.event, payload: ended.payload, at: new Date(START - 60_000).toISOString(), proc: 1, phase: 'start' })
    writeLine(r, { action: 'execute.start-drive', key: ended.key, at: new Date(START - 30_000).toISOString(), proc: 1, phase: 'end', outcome: 'done' })
    assert.equal(await r.link.replayInterrupted(r.repo.root), 1)
    assert.deepEqual(r.runs, [interrupted.key])
    assert.ok(r.metrics.some(item => item.event === 'execute.loop-fallback' && item.entry === 'execute.release' && item.key === interrupted.key && item.reason === 'interrupted'))
    assert.equal(loopNotices(r).length, 1, 'the replayed entry tells the holder')
    assert.equal(await r.link.replayInterrupted(r.repo.root), 0, 'replayed once in this process')
  }
  finally {
    r.dispose()
  }
})
