/**
 * Who the loop board may talk to, and how (loop board design 0.6 §6.4;
 * docs/ORCHESTRATION.md §18.10): the six readings of the main agent's session
 * and what each of them costs, and the delivery itself — the wake table, the
 * revival of a cold session, the two answers of `resolveAgent` that are not
 * failures, the messages that wait while nobody can be told, and the retries of
 * a delivery the session did not acknowledge.
 *
 * The holder record is read through M3's own module over a temporary user
 * directory, so the file shape is the one M3 writes. The mode of the session it
 * names is crossed with it: a record left behind by a cancelled `/wish` names a
 * session that is not the main agent any more, and a reminder delivered there
 * would land on an ordinary agent (the M3 review of the /wish fix, finding R2).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { holderFileOf, type HolderRecord } from '../src/graph/main-agent-holder.ts'
import { BATCH_MS, createDelivery, HELD_MS, HELD_ROOM, LOOP_NOTICE_SOURCE, RETRY_MS, wayTo, type DeliverDeps, type DeliverRequest } from '../src/loops/deliver.ts'
import { archivedSessionsOf, canDeliver, holderFault, holderLine, holderStateOf, mayRemoveHolderTasks, modeOfSession, WRITER_HELD_MS, type HolderMemory, type HolderReason, type HolderState, type HolderStateKind } from '../src/loops/holder.ts'
import { emptyState, type RuntimeState } from '../src/loops/inbox.ts'
import { scheduleIdsOf, stepLine } from '../src/loops/reminder.ts'
import { DATA_SERVICE } from '../src/shared/data-home.ts'
import type { AgentLike, MessageableAgentLike, ServiceLookup, SessionLike } from '../src/shared/dsh-min.ts'
import { fakeLive, fakeWorkspaceRegistry, type FakeLive } from './fake-rc3.ts'
import { heldTimers, NOW } from './loops-helpers.ts'

const HOLDER = 'session-main'
const PROJECT = 'C:/work/app'

/** A session as the host hands it to a projection reader. */
const sessionOf = (id: string): SessionLike => ({ id, header: { cwd: PROJECT }, deriveMessages: () => [] } as unknown as SessionLike)

/** An agent of the registry, with its session. */
const agentOf = (id: string): AgentLike => ({ id, session: sessionOf(id) } as unknown as AgentLike)

interface Host {
  readonly ctx: ServiceLookup
  readonly live: FakeLive
  /** What `resolveAgent` answers next, and every id it was asked for. */
  resolve: { answer: () => { readonly agent?: unknown, readonly error?: { readonly code: string, readonly message?: string } }, asked: string[] }
  /** What `sessions.flush` answers; false is a session that did not acknowledge the message (session:1950). */
  flushes: boolean
  /** The main-agent projection values, by session id. */
  readonly modes: Map<string, unknown>
  /** Whether the row's delivery was made outside anybody's turn (agent:414). */
  outside: number
}

function host(): Host {
  const live = fakeLive()
  const it: Host = {
    live,
    resolve: { answer: () => ({ error: { code: 'session/not-found' } }), asked: [] },
    flushes: true,
    modes: new Map<string, unknown>(),
    outside: 0,
    ctx: {
      get(name: string): unknown {
        if (name === 'agents') {
          return {
            get: (id: string) => live.agents.get(id),
            list: () => live.agents.list(),
            withoutInitiator: <T>(op: () => T): T => {
              it.outside += 1
              return op()
            },
          }
        }
        if (name === 'goals') return live.goals
        if (name === 'sessions') return { flush: () => Promise.resolve(it.flushes) }
        if (name === 'sessionController') {
          return {
            resolveAgent: (id: string) => {
              it.resolve.asked.push(id)
              return Promise.resolve(it.resolve.answer())
            },
          }
        }
        if (name === 'sessionProjections') return { stateOf: (session: SessionLike, key: string) => key === MAIN_AGENT_KEY ? it.modes.get(session.id) : undefined }
        return undefined
      },
    },
  }
  return it
}

const request = (over: Partial<DeliverRequest> = {}): DeliverRequest => ({
  project: PROJECT,
  entry: 'u-1a2b3c4d',
  run: 'run-000000000001',
  title: '每周五看一眼没合入的分支',
  text: 'Weekly: list the branches not merged into main.',
  wake: true,
  ...over,
})

/** A user directory with one holder record, as M3 writes it. */
function holderHome(body: (home: string, write: (record: HolderRecord | undefined) => void) => void): void {
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-holder-')))
  try {
    const file = holderFileOf(home, join(PROJECT, 'docs', 'graph'))
    body(home, (record) => {
      mkdirSync(dirname(file), { recursive: true })
      if (record === undefined) writeFileSync(file, 'not a holder record\n')
      else writeFileSync(file, `${JSON.stringify(record)}\n`)
    })
  }
  finally {
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

const record = (sessionId = HOLDER): HolderRecord => ({ version: 1, sessionId, graphDir: join(PROJECT, 'docs', 'graph'), since: new Date(NOW - 3_600_000).toISOString(), commandId: 'command-1' })

test('holder: the six readings of the main agent\'s session, and what each of them allows', () => {
  const memory: HolderMemory = {}
  const archived: string[] = []
  const base = {
    projectRoot: PROJECT,
    ctx: {} as ServiceLookup,
    now: (): number => NOW,
    memory: (): HolderMemory => memory,
    archived: (): readonly string[] => archived,
  }
  // No record at all: the project has no main agent, or the person left the role.
  assert.deepEqual(holderStateOf({ ...base, record: () => ({ kind: 'none' }), mode: () => 'unknown' }), { kind: 'none', reason: 'no-record' })
  // The record itself cannot be read: the board does not know whom to tell.
  assert.deepEqual(holderStateOf({ ...base, record: () => ({ kind: 'unreadable', reason: 'broken' }), mode: () => 'unknown' }), { kind: 'unknown', reason: 'holder-unreadable', detail: 'broken' })
  const held = { kind: 'held' as const, record: record() }
  // A record whose session is not in the role any more reads as no main agent (M3 review R2).
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'off' }), { kind: 'none', session: HOLDER, reason: 'mode-off' })
  // The mode cannot be read (the session is not open in this process): the record stands.
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'unknown' }), { kind: 'ok', session: HOLDER })
  archived.push(HOLDER)
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'on' }), { kind: 'archived', session: HOLDER, reason: 'holder-archived' })
  archived.pop()
  // The archive set cannot be read: the board keeps delivering and removes nothing.
  const unknown = holderStateOf({ ...base, record: () => held, mode: () => 'on', archived: () => { throw new Error('workspace registry is not started yet') } })
  assert.deepEqual([unknown.kind, unknown.reason], ['unknown', 'archive-unreadable'])
  assert.equal(canDeliver(unknown), true)
  assert.equal(mayRemoveHolderTasks(unknown), false)
  // Another process has the holder session open and asked for the run lock.
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'on', handedElsewhere: () => HOLDER }), { kind: 'elsewhere', session: HOLDER, reason: 'handover' })
  // The last resolveAgent said the writer is elsewhere: that stands for five minutes.
  memory.writerHeld = { session: HOLDER, at: new Date(NOW - 60_000).toISOString() }
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'on' }), { kind: 'elsewhere', session: HOLDER, reason: 'writer-held' })
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'on', now: () => NOW + WRITER_HELD_MS }), { kind: 'ok', session: HOLDER })
  delete memory.writerHeld
  memory.notFound = { session: HOLDER, at: new Date(NOW).toISOString() }
  assert.deepEqual(holderStateOf({ ...base, record: () => held, mode: () => 'on' }), { kind: 'not-found', session: HOLDER, reason: 'holder-not-found' })
  // What may be done in each state.
  const nobody: ReadonlyArray<{ readonly kind: HolderStateKind, readonly reason: HolderReason }> = [
    { kind: 'none', reason: 'no-record' },
    { kind: 'archived', reason: 'holder-archived' },
    { kind: 'not-found', reason: 'holder-not-found' },
    { kind: 'elsewhere', reason: 'writer-held' },
  ]
  for (const state of nobody) {
    assert.equal(canDeliver(state), false, state.kind)
    assert.ok(holderLine(state) !== undefined, state.kind)
  }
  assert.equal(mayRemoveHolderTasks({ kind: 'archived' }), true)
  assert.equal(mayRemoveHolderTasks({ kind: 'elsewhere' }), false)
  assert.ok(holderFault({ kind: 'unknown', reason: 'holder-unreadable', detail: 'broken' })!.includes('读不出主 Agent 的记录'))
  assert.ok(holderFault({ kind: 'unknown', reason: 'archive-unreadable', detail: 'not started' })!.includes('读不到归档状态'))
  assert.equal(holderFault({ kind: 'ok', session: HOLDER }), undefined)
})

test('holder: the record on disk is read through M3\'s module, and its session\'s mode is crossed with it', () => {
  holderHome((home, write) => {
    const it = host()
    const ctx: ServiceLookup = {
      get(name: string): unknown {
        return name === DATA_SERVICE ? { userHome: home, projectHome: join(PROJECT, '.llm') } : it.ctx.get!(name)
      },
    }
    const deps = { projectRoot: PROJECT, ctx, now: (): number => NOW, memory: (): HolderMemory => ({}), archived: (): readonly string[] => [] }
    assert.deepEqual(holderStateOf(deps), { kind: 'none', reason: 'no-record' })
    write(record())
    // Nothing of this session is open here, so the mode cannot be read and the record decides.
    assert.deepEqual(holderStateOf(deps), { kind: 'ok', session: HOLDER })
    assert.equal(modeOfSession(ctx, HOLDER), 'unknown')
    const agent = agentOf(HOLDER)
    it.live.add(agent)
    // The session is open and its projection says the role is off: a cancelled /wish left the record behind.
    it.modes.set(HOLDER, { active: false, running: null, settled: 'command-1' })
    assert.equal(modeOfSession(ctx, HOLDER), 'off')
    assert.deepEqual(holderStateOf(deps), { kind: 'none', session: HOLDER, reason: 'mode-off' })
    // A /wish that has not finished counts as on: the role it asks for is not settled yet.
    it.modes.set(HOLDER, { active: false, running: { commandId: 'command-2', wanted: true }, settled: null })
    assert.equal(modeOfSession(ctx, HOLDER), 'on')
    assert.deepEqual(holderStateOf(deps), { kind: 'ok', session: HOLDER })
    it.modes.set(HOLDER, { active: true, running: null, settled: 'command-1' })
    assert.deepEqual(holderStateOf(deps), { kind: 'ok', session: HOLDER })
    write(undefined)
    assert.deepEqual(holderStateOf(deps).kind, 'unknown')
  })
})

test('holder: the archive set comes from the host\'s workspace registry, and a registry that has not started reads as unknown', () => {
  const registry = fakeWorkspaceRegistry()
  const ctx: ServiceLookup = { get: name => name === 'workspaceRegistry' ? registry.service : undefined }
  const deps = { projectRoot: PROJECT, ctx, now: (): number => NOW, memory: (): HolderMemory => ({}), record: () => ({ kind: 'held' as const, record: record() }), mode: (): 'unknown' => 'unknown' }
  assert.deepEqual(holderStateOf(deps), { kind: 'ok', session: HOLDER })
  void registry.archive(HOLDER)
  assert.deepEqual(holderStateOf(deps), { kind: 'archived', session: HOLDER, reason: 'holder-archived' })
  registry.unarchive(HOLDER)
  assert.deepEqual(holderStateOf(deps), { kind: 'ok', session: HOLDER })
  registry.breakState()
  assert.deepEqual(holderStateOf(deps).reason, 'archive-unreadable')
  const read = archivedSessionsOf(ctx)
  assert.ok('fault' in read && read.fault.includes('not started yet'))
  // No registry in this process at all is the same reading.
  assert.deepEqual(holderStateOf({ ...deps, ctx: {} }).reason, 'archive-unreadable')
  assert.ok('fault' in archivedSessionsOf({}))
})

test('reminder: the schedule ids of a step\'s messages, and the line the board adds', () => {
  const one = {
    source: { kind: 'schedule' },
    content: [{ type: 'text', text: '[SCHEDULE REMINDER]\nThis is a scheduled message from the user\nschedule_id_json: "schedule-1"\noccurrence_at: 2026-11-02T01:00:00.000Z\nreminder_prompt_json: "Loop board: u-1 (added by the human). Change it on the loop board, not here.\\nhi"' }],
  }
  const batch = {
    source: { kind: 'schedule' },
    content: [{ type: 'text', text: `[SCHEDULE REMINDER BATCH]\nThis is a scheduled message from the user\nreminders_json: ${JSON.stringify([{ schedule_id: 'schedule-2', occurrence_at: 'x', reminder_prompt: 'y' }, { schedule_id: 'schedule-3', occurrence_at: 'x', reminder_prompt: 'y' }])}` }],
  }
  const person = { source: { kind: 'user' }, content: [{ type: 'text', text: 'schedule_id_json: "schedule-9"' }] }
  assert.deepEqual(scheduleIdsOf([one, batch, person]), ['schedule-1', 'schedule-2', 'schedule-3'])
  assert.deepEqual(scheduleIdsOf([{ source: { kind: 'schedule' }, content: [{ type: 'text', text: 'reminders_json: [not json' }] }]), [])
  assert.deepEqual(scheduleIdsOf([]), [])
  assert.equal(stepLine([{ entry: 'u-1', run: 'run-000000000001' }]), 'Loop run run-000000000001 for u-1.')
  assert.equal(stepLine([{ entry: 'u-1' }]), 'Loop board reminder for u-1.')
  assert.equal(stepLine([{ entry: 'u-1', run: 'run-1' }, { entry: 'u-2', run: 'run-2' }]), 'Loop run run-1 for u-1.\nLoop run run-2 for u-2.')
})

/** The delivery over a host, with the holder state a case sets. */
function delivery(it: Host, over: Partial<DeliverDeps> = {}): { readonly state: RuntimeState, readonly timers: ReturnType<typeof heldTimers>, readonly made: ReturnType<typeof createDelivery>, holder: HolderState } {
  const state = emptyState()
  const timers = heldTimers()
  const box = { holder: { kind: 'ok', session: HOLDER } as HolderState }
  const made = createDelivery({
    ctx: it.ctx,
    project: PROJECT,
    now: () => NOW,
    state: () => state,
    holder: () => box.holder,
    memory: () => state.holderMemory,
    report: () => {},
    delay: timers.delay,
    batchMs: 0,
    ...over,
  })
  return {
    state,
    timers,
    made,
    get holder() { return box.holder },
    set holder(value: HolderState) { box.holder = value },
  }
}

test('deliver: the wake table, and a message that does not wake the session only waits for its next step', async () => {
  const it = host()
  const agent = agentOf(HOLDER)
  it.live.add(agent, 'running')
  const sent = delivery(it)
  const told = await sent.made.deliver(request())
  assert.deepEqual([told.kind, told.kind === 'delivered' ? told.how : ''], ['delivered', 'steer'])
  assert.deepEqual(it.live.woken.map(woken => woken.how), ['steer'])
  assert.equal(it.live.woken[0].kind, LOOP_NOTICE_SOURCE)
  assert.ok(it.live.woken[0].text.startsWith('<system-reminder>'))
  assert.ok(it.live.woken[0].text.includes('run-000000000001'))
  assert.equal(it.outside, 1, 'the delivery is made outside anybody\'s turn')
  // A running agent and a message that does not wake it: the next step reads it.
  await sent.made.deliver(request({ wake: false }))
  assert.equal(it.live.woken[1].how, 'inject')
  it.live.setStatus(HOLDER, 'idle')
  it.live.setGoal(HOLDER, 'active')
  await sent.made.deliver(request())
  assert.equal(it.live.woken[2].how, 'inject')
  it.live.setGoal(HOLDER, 'paused')
  await sent.made.deliver(request())
  assert.equal(it.live.woken[3].how, 'followup')
  it.live.setGoal(HOLDER, undefined)
  await sent.made.deliver(request())
  assert.equal(it.live.woken[4].how, 'followup')
  // A goal service that throws for the agent means no goal (goal:611-614).
  it.live.setGoal(HOLDER, 'active')
  it.live.breakGoals(HOLDER)
  assert.equal(wayTo(it.ctx, it.live.agents.get(HOLDER) as unknown as MessageableAgentLike, true), 'followup')
})

test('deliver: a cold session is revived only for a message that wakes it, and the two expected refusals hold the message instead of failing', async () => {
  const it = host()
  const sent = delivery(it)
  // Nothing of the session is open: a message that does not wake it waits for its next appearance.
  assert.deepEqual(await sent.made.deliver(request({ wake: false })), { kind: 'held', reason: 'session-cold' })
  assert.equal(it.resolve.asked.length, 0)
  // A message that wakes it revives the session, as the host's own schedule delivery does.
  const agent = agentOf(HOLDER)
  it.resolve.answer = () => {
    it.live.add(agent)
    return { agent: it.live.agents.get(HOLDER) }
  }
  assert.deepEqual((await sent.made.deliver(request())).kind, 'delivered')
  assert.deepEqual(it.resolve.asked, [HOLDER])
  assert.equal(it.live.woken[0].how, 'followup')
  // The session is gone: the person has to name a new main agent, so the state says so from now on.
  it.live.release(HOLDER)
  it.resolve.answer = () => ({ error: { code: 'session/not-found' } })
  assert.deepEqual(await sent.made.deliver(request()), { kind: 'held', reason: 'holder-not-found' })
  assert.equal(sent.state.holderMemory.notFound?.session, HOLDER)
  assert.deepEqual(holderStateOf({ projectRoot: PROJECT, ctx: it.ctx, now: () => NOW, memory: () => sent.state.holderMemory, record: () => ({ kind: 'held', record: record() }), mode: () => 'unknown', archived: () => [] }), { kind: 'not-found', session: HOLDER, reason: 'holder-not-found' })
  // Another DSH process has the session open: the message waits for the run lock to go there.
  delete sent.state.holderMemory.notFound
  it.resolve.answer = () => ({ error: { code: 'session/writer-held' } })
  assert.deepEqual(await sent.made.deliver(request()), { kind: 'held', reason: 'writer-held' })
  assert.equal(sent.state.holderMemory.writerHeld?.session, HOLDER)
  // Any other code is a failure, which is retried.
  it.resolve.answer = () => ({ error: { code: 'gateway/internal', message: 'resume failed' } })
  const failed = await sent.made.deliver(request())
  assert.equal(failed.kind, 'failed')
  assert.ok(failed.kind === 'failed' && failed.reason.includes('gateway/internal'))
  sent.made.dispose()
})

test('deliver: a state nobody can be told through keeps the message with its reason, oldest first, a day at most and fifty at a time', async () => {
  const it = host()
  const sent = delivery(it)
  sent.holder = { kind: 'archived', session: HOLDER, reason: 'holder-archived' }
  assert.deepEqual(await sent.made.deliver(request({ run: 'run-1' })), { kind: 'held', reason: 'holder-archived' })
  assert.deepEqual(await sent.made.deliver(request({ run: 'run-2' })), { kind: 'held', reason: 'holder-archived' })
  assert.equal(it.resolve.asked.length, 0, 'an archived session is not revived')
  assert.deepEqual(sent.state.held.map(held => held.run), ['run-1', 'run-2'])
  // The person un-archives the session: the messages go in the order they were kept.
  const agent = agentOf(HOLDER)
  it.live.add(agent)
  sent.holder = { kind: 'ok', session: HOLDER }
  await sent.made.flush()
  assert.deepEqual(sent.state.held, [])
  assert.deepEqual(it.live.woken.map(woken => woken.text.includes('run-1')), [true, false])
  // A message that waited a day is dropped.
  sent.state.held.push({ at: new Date(NOW - HELD_MS - 60_000).toISOString(), entry: 'u-old', run: 'run-old', title: 'old', text: 'old', wake: true, reason: 'holder-archived' })
  await sent.made.flush()
  assert.deepEqual(sent.state.held, [])
  assert.equal(it.live.woken.length, 2, 'the message that waited a day was not delivered')
  // Fifty at a time: the oldest goes when the fifty-first arrives.
  sent.holder = { kind: 'none', reason: 'no-record' }
  for (let index = 0; index < HELD_ROOM + 2; index++) await sent.made.deliver(request({ run: `run-${index}` }))
  assert.equal(sent.state.held.length, HELD_ROOM)
  assert.equal(sent.state.held[0].run, 'run-2')
  sent.made.dispose()
})

test('deliver: messages for one session inside two seconds travel as one, and a session that did not acknowledge one is tried again', async () => {
  const it = host()
  const agent = agentOf(HOLDER)
  it.live.add(agent)
  const sent = delivery(it, { batchMs: BATCH_MS })
  const first = sent.made.deliver(request({ run: 'run-1', title: 'first' }))
  const second = sent.made.deliver(request({ run: 'run-2', title: 'second' }))
  assert.equal(it.live.woken.length, 0, 'nothing is sent before the window is over')
  assert.equal(sent.timers.timers.length, 1)
  assert.equal(sent.timers.timers[0].ms, BATCH_MS)
  sent.timers.timers[0].run()
  assert.deepEqual([(await first).kind, (await second).kind], ['delivered', 'delivered'])
  assert.equal(it.live.woken.length, 1)
  assert.ok(it.live.woken[0].text.includes('first'))
  assert.ok(it.live.woken[0].text.includes('second'))
  // The session does not acknowledge the message: the delivery is a failure and is tried again after a minute.
  it.flushes = false
  const failed = sent.made.deliver(request({ run: 'run-3' }))
  sent.timers.timers.filter(timer => timer.ms === BATCH_MS).forEach(timer => timer.run())
  assert.equal((await failed).kind, 'failed')
  const retry = sent.timers.timers.find(timer => timer.ms === RETRY_MS[0])
  assert.ok(retry !== undefined, 'the first retry waits a minute')
  it.flushes = true
  retry.run()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(it.live.woken.filter(woken => woken.text.includes('run-3')).length, 2, 'the retry delivered it')
  sent.made.dispose()
})

test('deliver: the answer of a run that belongs to another session goes to it while it runs, and to the main agent otherwise', async () => {
  const it = host()
  const main = agentOf(HOLDER)
  const child = agentOf('session-child')
  it.live.add(main)
  it.live.add(child, 'running')
  const sent = delivery(it)
  await sent.made.deliver(request({ session: 'session-child', text: 'the check failed' }))
  assert.deepEqual(it.live.woken.map(woken => [woken.agentId, woken.how]), [['session-child', 'inject']])
  // The child has stopped: the main agent is told instead, and the message says which session it was for.
  it.live.setStatus('session-child', 'idle')
  await sent.made.deliver(request({ session: 'session-child', text: 'the check failed' }))
  assert.equal(it.live.woken[1].agentId, HOLDER)
  assert.ok(it.live.woken[1].text.includes('For session session-child, which is not running now.'))
  sent.made.dispose()
})
