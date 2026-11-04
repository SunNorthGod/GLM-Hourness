/**
 * The end of a GLM peak (src/loops/peak.ts, the wiring in run.ts; loop board
 * design 0.6 §6.9 item 4): one case per row of the ten-row table, in both
 * levels where the table says so, the resume of the execute row's action and
 * its absence (M7 does not exist yet), the rerun of a judgement that waited
 * for another process, the recording of the peak-start entry, and the view's
 * peak line.
 *
 * The world is one host process over a project (as in loops-run.spec), with
 * the delivery the row really builds over the fake host, so a wake travels
 * the way it does in the row: revival, the wake table, the batching.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { holderFileOf, type HolderRecord } from '../src/graph/main-agent-holder.ts'
import { CHANNEL_EVENTS, CHANNEL_PEAK_CHANGED, peakChangedKey } from '../src/loops/channel.ts'
import { LOOP_ACTIONS, LOOP_DEFAULTS } from '../src/loops/defaults.ts'
import { currentRun } from '../src/loops/harness.ts'
import { PEAK_RESUME_ACTION } from '../src/loops/peak.ts'
import { createRegistry } from '../src/loops/registry.ts'
import { createProjectRuntime, type ProjectRuntime } from '../src/loops/run.ts'
import type { ContributionSource, HarnessResult, LoopEventRecord } from '../src/loops/service.ts'
import { ensureRuntimeDir, openLoopStore, type LoopStore } from '../src/loops/store.ts'
import type { HolderState } from '../src/loops/holder.ts'
import { DATA_SERVICE } from '../src/shared/data-home.ts'
import { METRICS_SERVICE, type EmittedEvent } from '../src/shared/metrics.ts'
import { PEAK_MODE_SERVICE, peakHoldOf, peakModeState, type PeakModeService } from '../src/shared/peak-mode.ts'
import { PRICING_SERVICE } from '../src/shared/pricing.ts'
import type { AgentLike, SessionLike } from '../src/shared/dsh-min.ts'
import { fakeLive, fakeWorkspaceRegistry, type FakeLive } from './fake-rc3.ts'
import { gitProjectTest, heldTimers, journalTakes, quickIo, NOW } from './loops-helpers.ts'
import { withLoopsRow } from './loops-host.ts'

const EXECUTE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/execute' }
const HOLDER = 's-main'
/** The clock the world runs at: inside the peak. */
const AT = Date.parse('2026-11-02T06:30:00.000Z')
const BOOT = Date.parse('2026-11-01T00:00:00.000Z')
/** The peak the world's pricing service reads: one hour, covering AT. */
const PEAK_START = Date.parse('2026-11-02T06:00:00.000Z')
const PEAK_END = PEAK_START + 3_600_000
const inPeak = (atMs: number): boolean => atMs >= PEAK_START && atMs < PEAK_END
/** The two entries of the loop row the peak cases need; the other two bring events and thresholds the cases do not use. */
const PEAK_ENTRIES = LOOP_DEFAULTS.filter(entry => entry.id.startsWith('loops.peak'))

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve))
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
/** The real time one quiet turn of `quiesce` lasts. */
const QUIET_MS = 10

/** A session as the host's registry holds it, and an agent over it. */
const agentOf = (id: string): AgentLike => ({ id, session: { id, header: {}, deriveMessages: () => [] } as unknown as SessionLike } as unknown as AgentLike)

/** What the execute row's hand-over does when the board calls its action. */
type ResumeCase =
  | { readonly kind: 'done', readonly tell?: string }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'failed', readonly reason?: string, readonly tell?: string }
  | { readonly kind: 'throw' }
  | { readonly kind: 'hang' }

interface WorldOptions {
  readonly pid?: number
  /** The level the rules board's service reads; `absent` provides no service, `unreadable` one that cannot read the project. */
  readonly level?: 'inform' | 'reduce' | 'stop' | 'unreadable' | 'absent'
  /** The execute row's hand-over; undefined lists no action, which is how the world stands for M7 being absent. */
  readonly resume?: ResumeCase
  /** The holder state, overriding the record-based reading (row 2 and the rerun cases). */
  readonly holder?: () => HolderState
  /** The walk record to write before anything runs; `garbage` writes a file that cannot be read. */
  readonly mainStep?: { readonly session: string, readonly at: number } | 'garbage'
  /** What `resolveAgent` answers; the default is `session/not-found`. */
  readonly answer?: (live: FakeLive) => { readonly agent?: unknown, readonly error?: { readonly code: string, readonly message?: string } }
  readonly at?: number
  /** Whether the host's workspace registry archives the holder session (row 1's archived reading). */
  readonly archived?: boolean
}

interface World {
  readonly runtime: ProjectRuntime
  readonly store: LoopStore
  readonly home: string
  readonly live: FakeLive
  /** Archive the holder session in the host's workspace registry. */
  readonly archive: (sessionId: string) => Promise<void>
  /** The ids `resolveAgent` was asked for, and what it answers next. */
  readonly resolve: { readonly asked: string[], answer: () => { readonly agent?: unknown, readonly error?: { readonly code: string, readonly message?: string } } }
  /** The goal reads and the resume calls, in the order they happened. */
  readonly order: string[]
  readonly resumeCalls: Array<{ readonly action: string, readonly event: string, readonly run: string | undefined }>
  /** The rules board's level, changeable between fires. */
  readonly level: { level: 'inform' | 'reduce' | 'stop' | 'unreadable' }
  readonly now: () => number
  readonly move: (ms: number) => void
  readonly tick: (ms?: number) => Promise<void>
  readonly fire: (edge: 'start' | 'end', boundary?: number) => Promise<void>
  readonly woken: FakeLive['woken']
  readonly told: Array<{ text: string, level: string }>
  readonly runs: () => Promise<Array<Record<string, unknown>>>
  readonly state: () => Promise<{ held: Array<Record<string, unknown>>, last: Record<string, { run: string, outcome: string, reason?: string }> }>
  readonly recordFile: string
  readonly stop: () => Promise<void>
}

/** One host process over a project, with the host services the peak table reads. */
async function worldOf(root: string, options: WorldOptions = {}): Promise<World> {
  let clock = options.at ?? AT
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-peak-')))
  const store = openLoopStore(root, { io: quickIo({ now: () => clock }) })
  await ensureRuntimeDir(store.paths)
  const live = fakeLive()
  const order: string[] = []
  const resumeCalls: World['resumeCalls'] = []
  const told: World['told'] = []
  // The board hands its records to the metrics journal (metrics design §12 step 6); this fake is the journal,
  // keeping what its field tables take (a refused event is lost, as in the real one).
  const records: Array<Record<string, unknown>> = []
  const level = { level: options.level ?? 'reduce' }
  const resolve: World['resolve'] = {
    asked: [],
    answer: options.answer ?? ((): { readonly error: { readonly code: string } } => ({ error: { code: 'session/not-found' } })),
  }
  const recordFile = holderFileOf(home, join(root, 'docs', 'graph'))
  mkdirSync(dirname(recordFile), { recursive: true })
  const record: HolderRecord = { version: 1, sessionId: HOLDER, graphDir: join(root, 'docs', 'graph'), since: new Date(NOW).toISOString(), commandId: 'command-1' }
  writeFileSync(recordFile, `${JSON.stringify(record)}\n`)
  const registryService = fakeWorkspaceRegistry()
  if (options.archived === true) void registryService.archive(HOLDER)

  const writeMainStep = (note: { readonly session: string, readonly at: number } | 'garbage'): void => {
    if (note === 'garbage') writeFileSync(store.paths.mainStep, 'not a walk record\n')
    else writeFileSync(store.paths.mainStep, `${JSON.stringify({ session: note.session, at: new Date(note.at).toISOString() })}\n`)
  }
  if (options.mainStep === 'garbage') writeMainStep('garbage')
  else if (options.mainStep !== undefined) writeMainStep(options.mainStep)

  const peakMode: PeakModeService = {
    stateFor: sessionId => peakMode.stateForProject(sessionId),
    stateForProject: () => level.level === 'unreadable'
      ? undefined
      : peakModeState({ level: level.level, origin: 'human', at: new Date(NOW).toISOString(), peak: inPeak(clock), until: new Date(PEAK_END).toISOString() }),
    peakHoldFor: sessionId => {
      const state = peakMode.stateForProject(sessionId)
      return state === undefined ? undefined : peakHoldOf(state)
    },
  }
  const ctx = {
    get(name: string): unknown {
      if (name === 'agents') return { get: (id: string) => live.agents.get(id), list: () => live.agents.list() }
      if (name === 'goals') {
        return {
          get: (agent: Parameters<FakeLive['goals']['get']>[0]) => { order.push('goal'); return live.goals.get(agent) },
          pause: (agent: Parameters<FakeLive['goals']['pause']>[0], ref: Parameters<FakeLive['goals']['pause']>[1]) => live.goals.pause(agent, ref),
          resume: (agent: Parameters<FakeLive['goals']['resume']>[0], ref: Parameters<FakeLive['goals']['resume']>[1]) => live.goals.resume(agent, ref),
        }
      }
      if (name === 'sessionController') {
        return {
          resolveAgent: async (id: string) => {
            resolve.asked.push(id)
            return await Promise.resolve(resolve.answer(live))
          },
        }
      }
      if (name === 'sessionProjections') return { stateOf: (session: SessionLike, key: string) => key === MAIN_AGENT_KEY ? undefined : undefined }
      if (name === 'workspaceRegistry') return registryService.service
      if (name === 'sessions') return { flush: () => Promise.resolve(true) }
      if (name === DATA_SERVICE) return { userHome: home, projectHome: join(root, '.llm') }
      if (name === METRICS_SERVICE) return { emit: (event: EmittedEvent): void => { if (journalTakes(event)) records.push({ ...event.body, kind: event.k }) } }
      if (name === PEAK_MODE_SERVICE && level.level !== 'absent') return peakMode
      return undefined
    },
  }

  const registry = createRegistry({ now: () => new Date(clock), channel: () => CHANNEL_EVENTS })
  const { timers, delay: holdTimer } = heldTimers()
  const drain = async (): Promise<void> => {
    for (let round = 0; round < 8 && timers.length > 0; round++) {
      for (const timer of timers.splice(0)) timer.run()
      await settle()
    }
  }
  const runtime = createProjectRuntime({
    root,
    store,
    registry,
    io: quickIo({ now: () => clock }),
    now: () => clock,
    delay: holdTimer,
    pid: options.pid ?? 4001,
    boot: () => BOOT,
    ctx,
    report: (text, reportLevel) => { told.push({ text, level: reportLevel }) },
    ...(options.holder === undefined ? {} : { holder: options.holder }),
    peak: () => inPeak,
    deliverBatchMs: 0,
  })
  // The loop row's hand-over, as index.ts builds it: its run is the project's own peak-end runner.
  registry.contribute({ plugin: 'dsh-hourness', row: 'glm-hourness/loops' }, { entries: PEAK_ENTRIES, actions: LOOP_ACTIONS, run: (action, event) => runtime.peakEnd(action, event) })
  if (options.resume !== undefined) {
    const wanted = options.resume
    registry.contribute(EXECUTE, {
      entries: [],
      actions: [{ id: PEAK_RESUME_ACTION, title: '接上高峰里停住的自动推进' }],
      run: async (action, event): Promise<HarnessResult> => {
        resumeCalls.push({ action, event: event.id, run: currentRun() })
        order.push('resume')
        if (wanted.kind === 'throw') throw new Error('resume blew up')
        if (wanted.kind === 'hang') return await new Promise<HarnessResult>(() => {})
        if (wanted.kind === 'done') return { outcome: 'done', ...(wanted.tell === undefined ? {} : { tell: wanted.tell }) }
        if (wanted.kind === 'skipped') return { outcome: 'skipped', reason: '这个 goal 没有停着' }
        return { outcome: 'failed', reason: wanted.reason ?? 'resume failed', ...(wanted.tell === undefined ? {} : { tell: wanted.tell }) }
      },
    })
  }

  const emit = async (edge: 'start' | 'end', boundary: number): Promise<void> => {
    await runtime.emit({
      event: CHANNEL_PEAK_CHANGED,
      key: peakChangedKey(edge, new Date(boundary).toISOString()),
      payload: { edge, boundary: new Date(boundary).toISOString(), until: new Date(PEAK_END).toISOString() },
      from: 'glm-hourness/loops',
    })
  }

  /**
   * Whether state.json already holds what the latest `loop-done` of every entry
   * set: the journal takes a record at once, and the row writes `last` (and the
   * held list beside it) to disk only afterwards, so a quiet journal alone does
   * not mean the state the cases read has landed.
   */
  const persisted = async (): Promise<boolean> => {
    const latest = new Map<unknown, Record<string, unknown>>()
    for (const line of records) if (line.kind === 'loop-done') latest.set(line.entry, line)
    if (latest.size === 0) return true
    const text = await readFile(store.paths.state, 'utf8').catch(() => '')
    let last: Record<string, { readonly run?: unknown, readonly outcome?: unknown }>
    try {
      last = (JSON.parse(text) as { last?: typeof last }).last ?? {}
    }
    catch {
      return false
    }
    return [...latest.values()].every(line => last[String(line.entry)]?.run === line.run && last[String(line.entry)]?.outcome === line.outcome)
  }

  /** Whether a run has its `loop-fired` and not yet a `loop-done`: it is still working on the real event loop. */
  const running = (): boolean => {
    const done = new Set(records.filter(line => line.kind === 'loop-done').map(line => line.run))
    return records.some(line => line.kind === 'loop-fired' && !done.has(line.run))
  }

  /**
   * Wait for the row to be quiet: a run that a debounce timer started floats
   * on the real event loop (the stubbed delay only moves when drained), so the
   * wait goes on until no timers are left, no run is between its two records,
   * the records have not grown for two turns and the state they imply is on
   * disk. A record whose run never sets `last` (an event expiring in the
   * inbox) only makes the wait run to its bound.
   */
  const quiesce = async (): Promise<void> => {
    // Turns of the event loop pass in well under a millisecond while a file write is still on the thread
    // pool, so the work that can be named is waited for in real time, up to a second (a run that hangs on
    // purpose stays in flight until a later tick fires its timeout).
    const until = Date.now() + 1_000
    let last = -1
    let stable = 0
    let turns = 0
    while (stable < 2 && turns < 40) {
      await settle()
      const now = records.length
      const pending = running() || !(await persisted())
      if (pending && Date.now() < until) {
        stable = 0
        last = now
        await wait(1)
        continue
      }
      turns += 1
      if (now === last && timers.length === 0 && !pending) stable += 1
      else stable = 0
      last = now
      // A timer that drain ran starts an inbox beat that stats the inbox file on the thread pool before the
      // run records its loop-fired, so nothing names that work: a quiet turn lasts a few milliseconds of real time.
      if (timers.length === 0 && !pending) await wait(QUIET_MS)
    }
  }

  return {
    runtime,
    store,
    home,
    live,
    archive: sessionId => registryService.archive(sessionId),
    resolve,
    order,
    resumeCalls,
    level,
    woken: live.woken,
    told,
    now: () => clock,
    move: ms => { clock += ms },
    tick: async (ms = 0) => {
      clock += ms
      await drain()
      await runtime.beat()
      // A beat arms the debounce of what it queued and the batching of what it delivered: cross them and fire again.
      clock += 6_000
      await drain()
      await runtime.beat()
      await quiesce()
    },
    fire: async (edge, boundary = PEAK_END) => {
      await runtime.beat()
      await emit(edge, boundary)
      // The beat after the emit reads the inbox and queues the run; crossing the debounce starts it.
      await runtime.beat()
      clock += 6_000
      await drain()
      await quiesce()
    },
    runs: async () => await Promise.resolve([...records]),
    state: async () => {
      const text = await readFile(store.paths.state, 'utf8').catch(() => '{}')
      const read = JSON.parse(text) as { held?: Array<Record<string, unknown>>, last?: Record<string, { run: string, outcome: string, reason?: string }> }
      return { held: read.held ?? [], last: read.last ?? {} }
    },
    recordFile,
    stop: () => runtime.stop(),
  }
}

const doneOf = async (world: World, entry = 'loops.peak-end'): Promise<Array<Record<string, unknown>>> =>
  (await world.runs()).filter(record => record.kind === 'loop-done' && record.entry === entry)

/** The revival that answers with the session own agent and an active goal: the shape the row 3 and row 9 cases share. */
const revivedAnswer = (live: FakeLive): { readonly agent: unknown } => {
  const agent = agentOf(HOLDER)
  live.add(agent)
  live.setGoal(HOLDER, "active")
  return { agent: live.agents.get(HOLDER) }
}

/** Fire the end over one hot session that expects the resume call and a delivered run; the world comes back stopped. */
async function fireHot(root: string, options: WorldOptions): Promise<World> {
  const world = await worldOf(root, options)
  world.live.add(agentOf(HOLDER))
  await world.fire("end")
  assert.equal(world.resumeCalls.length, 1, "the action ran for the hot session")
  assert.equal(((await oneDone(world)) as { outcome: string }).outcome, "delivered")
  await world.stop()
  return world
}

/** The only `loop-done` of the entry so far, failing the case when that is not one. */
async function oneDone(world: World, entry = 'loops.peak-end'): Promise<Record<string, unknown>> {
  const done = await doneOf(world, entry)
  assert.equal(done.length, 1, `one loop-done for ${entry}: ${JSON.stringify(done)}`)
  return done[0]
}



gitProjectTest('row 1: no record means nobody to wake, and the listed resume is not called', async ({ root }) => {
  const none = await worldOf(root, { level: 'reduce', resume: { kind: 'done' } })
  rmSync(join(none.home, 'main-agent'), { recursive: true, force: true })
  await none.fire('end')
  assert.equal(((await oneDone(none)) as { reason?: string }).reason, 'peak-no-holder')
  assert.equal(none.resumeCalls.length, 0, 'the resume waits for a session to wake')
  assert.equal(none.woken.length, 0)
  await none.stop()
})

gitProjectTest('row 1: an archived holder session is nobody to wake', async ({ root }) => {
  const archived = await worldOf(root, { level: 'reduce', resume: { kind: 'done' }, archived: true })
  await archived.fire('end')
  assert.equal(((await oneDone(archived)) as { reason?: string }).reason, 'peak-no-holder')
  assert.equal(archived.resumeCalls.length, 0)
  await archived.stop()
})

gitProjectTest('row 1: a record that cannot be read is nobody to wake', async ({ root }) => {
  const unreadable = await worldOf(root, { level: 'reduce' })
  writeFileSync(unreadable.recordFile, 'not a holder record\n')
  await unreadable.fire('end')
  assert.equal(((await oneDone(unreadable)) as { reason?: string }).reason, 'peak-no-holder')
  await unreadable.stop()
})

gitProjectTest('row 1 through row 3: a cold session whose revival says it is gone converts to nobody to wake', async ({ root }) => {
  const gone = await worldOf(root, { level: 'reduce', resume: { kind: 'done' }, mainStep: { session: HOLDER, at: PEAK_START } })
  await gone.fire('end')
  assert.deepEqual(gone.resolve.asked, [HOLDER], 'the cold session was revived for the action')
  assert.equal(((await oneDone(gone)) as { reason?: string }).reason, 'peak-no-holder')
  assert.equal(gone.resumeCalls.length, 0)
  await gone.stop()
})

gitProjectTest('row 2: elsewhere keeps the judgement, and the same holder makes it again with the same run once the state turns', async ({ root }) => {
  const box: { state: HolderState } = { state: { kind: 'elsewhere', session: HOLDER, reason: 'writer-held' } }
  const world = await worldOf(root, { resume: { kind: 'done', tell: 'resumed by M7' }, holder: () => box.state })
  await world.fire('end')
  const held = (await oneDone(world)) as { outcome: string, reason?: string, run: string }
  assert.deepEqual([held.outcome, held.reason], ['held', 'writer-held'])
  assert.equal(world.resumeCalls.length, 0, 'the action is not called while the session is elsewhere')
  assert.equal(world.woken.length, 0)
  const state = await world.state()
  assert.equal(state.held.length, 1)
  assert.equal(state.held[0]?.rerun, 'loops.peak-end', 'what waits is a judgement to make again, not a message')
  assert.ok((state.held[0] as { event?: LoopEventRecord }).event !== undefined, 'the rerun judges the same event')

  // The elsewhere ends: the beat makes the judgement again, from the table's first row, with the run it had.
  world.live.add(agentOf(HOLDER))
  box.state = { kind: 'ok', session: HOLDER }
  await world.tick(60_000)
  assert.equal((await doneOf(world)).length, 2, 'the held run is told again with the outcome it reached')
  const after = (await doneOf(world))[1] as { outcome: string, run: string }
  assert.deepEqual([after.outcome, after.run], ['delivered', held.run], 'the run number does not change')
  assert.equal(world.resumeCalls.length, 1, 'the action runs exactly once across the two judgements')
  assert.equal(world.woken.length, 1)
  assert.equal((await world.state()).held.length, 0)
  await world.stop()
})

gitProjectTest('row 2: a judgement that waits a day without a verdict expires', async ({ root }) => {
  const waiting = await worldOf(root, { holder: () => ({ kind: 'elsewhere', session: HOLDER, reason: 'writer-held' }) })
  await waiting.fire('end')
  assert.equal(((await oneDone(waiting)) as { outcome: string }).outcome, 'held')
  waiting.move(25 * 3_600_000)
  await waiting.tick()
  const ended = await doneOf(waiting)
  assert.equal(ended.length, 2, 'the held run is told again with the outcome it reached')
  assert.equal((ended[1] as { outcome: string }).outcome, 'expired')
  assert.equal((await waiting.state()).held.length, 0)
  await waiting.stop()
})

gitProjectTest('row 2 across processes: the process that takes the run lock judges, and the action runs at most once for both', async ({ root }) => {
  const box: { state: HolderState } = { state: { kind: 'elsewhere', session: HOLDER, reason: 'writer-held' } }
  const first = await worldOf(root, { pid: 4301, resume: { kind: 'done' }, holder: () => box.state })
  await first.fire('end')
  const held = (await oneDone(first)) as { outcome: string, run: string }
  assert.equal(held.outcome, 'held')
  await first.stop()

  // The lock moves to the process the main agent's session is open in; the state came with it.
  box.state = { kind: 'ok', session: HOLDER }
  const second = await worldOf(root, { pid: 4302, resume: { kind: 'done' }, holder: () => box.state })
  second.live.add(agentOf(HOLDER))
  await second.tick(60_000)
  assert.equal(second.resumeCalls.length, 1, 'the taking process calls the action')
  const delivered = (await doneOf(second)).filter(record => record.outcome === 'delivered')
  assert.equal(delivered.length, 1)
  assert.equal((delivered[0] as { run?: string }).run, held.run, 'the run number travelled with the state')
  assert.equal(first.resumeCalls.length, 0, 'the process that gave the lock up never called it')
  await second.stop()
})

gitProjectTest('row 3, hot session: the action runs once, its tell is delivered, and the goal is not read before it', async ({ root }) => {
  const world = await worldOf(root, { level: 'reduce', resume: { kind: 'done', tell: 'The drive is going again, says M7.' } })
  world.live.add(agentOf(HOLDER))
  await world.fire('end')
  assert.equal(world.resumeCalls.length, 1)
  assert.equal(world.resumeCalls[0]?.action, PEAK_RESUME_ACTION)
  assert.match(world.resumeCalls[0]?.event ?? '', /^ev-[0-9a-f]{16}$/, 'the action is called with this event')
  assert.match(world.resumeCalls[0]?.run ?? '', /^run-[0-9a-f]{12}$/, 'the action runs in the context that carries the run number')
  assert.deepEqual(world.order, ['resume', 'goal'], 'the board does not read the goal before the action; the wake table does afterwards')
  assert.equal(((await oneDone(world)) as { outcome: string }).outcome, 'delivered')
  assert.equal(world.woken.length, 1)
  assert.ok(world.woken[0]?.text.includes('The drive is going again, says M7.'))
  await world.stop()
})

gitProjectTest('row 3, hot session: done without a tell is delivered with the design\'s sentence', async ({ root }) => {
  const plain = await worldOf(root, { level: 'reduce', resume: { kind: 'done' } })
  plain.live.add(agentOf(HOLDER))
  await plain.fire('end')
  assert.equal(((await oneDone(plain)) as { outcome: string }).outcome, 'delivered')
  assert.ok(plain.woken[0]?.text.includes('The harness resumed the drive that waited out the peak; continue with the work you moved.'))
  await plain.stop()
})

gitProjectTest('row 3: skipped on a hot session falls through to the wake', async ({ root }) => {
  const hot = await fireHot(root, { level: 'reduce', resume: { kind: 'skipped' } })
  assert.ok(hot.woken[0]?.text.includes('Work you moved to after peak can start now.'))
})

gitProjectTest('row 3: skipped after a revival whose drive is already running is done, once', async ({ root }) => {
  const revived = await worldOf(root, {
    level: 'reduce',
    resume: { kind: 'skipped' },
    mainStep: { session: HOLDER, at: PEAK_START },
    answer: revivedAnswer,
  })
  await revived.fire('end')
  assert.deepEqual(revived.resolve.asked, [HOLDER], 'the board revives the session before calling the action')
  assert.equal(revived.resumeCalls.length, 1)
  const done = (await oneDone(revived)) as { outcome: string, reason?: string }
  assert.deepEqual([done.outcome, done.reason], ['delivered', 'peak-drive-caught-up'])
  assert.ok(revived.woken[0]?.text.includes('The drive is running again; continue with the work you moved.'))
  assert.equal(revived.woken.length, 1, 'one message, not a wake on top of the revived drive')
  await revived.stop()
})

gitProjectTest('row 3: a cold session that did not work in this peak is not revived for the action', async ({ root }) => {
  const cold = await worldOf(root, { level: 'reduce', resume: { kind: 'skipped' }, mainStep: { session: 's-other', at: PEAK_START } })
  await cold.fire('end')
  assert.equal(cold.resumeCalls.length, 0)
  assert.deepEqual(cold.resolve.asked, [])
  assert.equal(((await oneDone(cold)) as { reason?: string }).reason, 'peak-holder-idle')
  await cold.stop()
})

gitProjectTest('row 3: a failed action fails the run, tells the main agent once and degrades the row', async ({ root }) => {
  const failed = await worldOf(root, { level: 'reduce', resume: { kind: 'failed', reason: '轮次用完了', tell: 'M7 could not resume it.' } })
  failed.live.add(agentOf(HOLDER))
  await failed.fire('end')
  const done = (await oneDone(failed)) as { outcome: string, reason?: string }
  // The execute row's words go to the main agent; the record keeps a code (records.ts).
  assert.deepEqual([done.outcome, done.reason], ['failed', 'plugin-reason'])
  assert.equal(failed.woken.length, 1)
  assert.ok(failed.woken[0]?.text.includes('M7 could not resume it.'))
  assert.ok(failed.told.some(line => line.level === 'degraded' && line.text.includes('harness 动作失败')), 'the row\'s health degrades once')
  await failed.stop()
})

gitProjectTest('row 3: a throw brings the design\'s sentence without a tell', async ({ root }) => {
  const threw = await worldOf(root, { level: 'reduce', resume: { kind: 'throw' } })
  threw.live.add(agentOf(HOLDER))
  await threw.fire('end')
  assert.equal(((await oneDone(threw)) as { outcome: string }).outcome, 'failed')
  assert.ok(threw.woken[0]?.text.includes('The harness could not resume the drive that waited out the peak'))
  assert.ok(threw.woken[0]?.text.includes('Tell the human in one line'))
  await threw.stop()
})

gitProjectTest('row 3: no answer within sixty seconds is a timeout', async ({ root }) => {
  const hanging = await worldOf(root, { level: 'reduce', resume: { kind: 'hang' } })
  hanging.live.add(agentOf(HOLDER))
  await hanging.fire('end')
  assert.equal(hanging.resumeCalls.length, 1, 'the action was called and never answered')
  await hanging.tick(60_000)
  assert.equal(((await oneDone(hanging)) as { outcome: string, reason?: string }).reason, 'timeout', 'the sixty-second limit fired')
  await hanging.stop()
})

gitProjectTest('with M7 absent the board never calls the resume and still wakes the main agent where the table says so', async ({ root }) => {
  // No hand-over lists the action: row 3 is skipped whole; reduce level, idle main agent that worked in the peak.
  const world = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  world.live.add(agentOf(HOLDER))
  await world.fire('end')
  assert.equal(world.resumeCalls.length, 0)
  assert.equal(((await oneDone(world)) as { outcome: string }).outcome, 'delivered')
  assert.ok(world.woken[0]?.text.includes('Work you moved to after peak can start now.'))
  assert.equal(world.woken.length, 1)
  await world.stop()
})

gitProjectTest('row 4: no rules board service skips the wake, after the resume had its chance on a hot session', async ({ root }) => {
  const absent = await worldOf(root, { level: 'absent', resume: { kind: 'skipped' } })
  absent.live.add(agentOf(HOLDER))
  await absent.fire('end')
  assert.equal(absent.resumeCalls.length, 1, 'row 3 runs before the level is read (review F34)')
  assert.equal(((await oneDone(absent)) as { reason?: string }).reason, 'peak-level-unreadable')
  await absent.stop()
})

gitProjectTest('row 4: a service that cannot read the project skips the wake', async ({ root }) => {
  const unreadable = await worldOf(root, { level: 'unreadable' })
  unreadable.live.add(agentOf(HOLDER))
  await unreadable.fire('end')
  assert.equal(((await oneDone(unreadable)) as { reason?: string }).reason, 'peak-level-unreadable')
  await unreadable.stop()
})

gitProjectTest('rows 5 and 10: 少做 and 不做 wake the idle main agent the same way', async ({ root }) => {
  // One world per level: row 5 is the fall-through, so the two levels reach the same rows and the same words (d-main-agent-peak-exempt).
  const reduce = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  reduce.live.add(agentOf(HOLDER))
  await reduce.fire('end')
  assert.ok(reduce.woken[0]?.text.includes('Work you moved to after peak can start now.'))
  await reduce.stop()

  // The second level stands alone: its own dedupe, so its event is not the first world's duplicate.
  rmSync(join(root, '.llm', 'loops', 'state.json'))
  const stop = await worldOf(root, { level: 'stop', mainStep: { session: HOLDER, at: PEAK_START } })
  stop.live.add(agentOf(HOLDER))
  await stop.fire('end')
  assert.equal(stop.woken.length, 1)
  assert.ok(stop.woken[0]?.text.includes('Work you moved to after peak can start now.'), 'the same words for both levels (d-main-agent-peak-exempt)')
  await stop.stop()
})

gitProjectTest('rows 5 and 10: one boundary is one occurrence', async ({ root }) => {
  const once = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  once.live.add(agentOf(HOLDER))
  await once.fire('end')
  await once.fire('end')
  assert.equal(once.woken.length, 1)
  assert.ok((await once.runs()).some(record => record.kind === 'loop-duplicate' && record.event === CHANNEL_PEAK_CHANGED))
  await once.stop()
})

gitProjectTest('row 6: 无影响 has nothing moved', async ({ root }) => {
  const world = await worldOf(root, { level: 'inform' })
  world.live.add(agentOf(HOLDER))
  await world.fire('end')
  assert.equal(((await oneDone(world)) as { reason?: string }).reason, 'peak-level-inform')
  assert.equal(world.woken.length, 0)
  await world.stop()
})

gitProjectTest('row 6 with the action listed: a hot session is called even under 无影响 (review F48)', async ({ root }) => {
  await fireHot(root, { level: 'inform', resume: { kind: 'done' } })
})

gitProjectTest('row 7: a main agent that is running is not woken', async ({ root }) => {
  const world = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  world.live.add(agentOf(HOLDER))
  world.live.setStatus(HOLDER, 'running')
  await world.fire('end')
  assert.equal(((await oneDone(world)) as { reason?: string }).reason, 'peak-holder-running')
  assert.equal(world.woken.length, 0)
  await world.stop()
})

gitProjectTest('row 7 with the action listed: a running main agent is still called for the resume (review F48)', async ({ root }) => {
  const withResume = await worldOf(root, { level: 'reduce', resume: { kind: 'skipped' }, mainStep: { session: HOLDER, at: PEAK_START } })
  withResume.live.add(agentOf(HOLDER))
  withResume.live.setStatus(HOLDER, 'running')
  await withResume.fire('end')
  assert.equal(withResume.resumeCalls.length, 1)
  assert.equal(((await oneDone(withResume)) as { reason?: string }).reason, 'peak-holder-running')
  await withResume.stop()
})

gitProjectTest('row 8: a walk record from before the peak\'s first minute is not walked', async ({ root }) => {
  const early = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START - 60_000 } })
  early.live.add(agentOf(HOLDER))
  await early.fire('end')
  assert.equal(((await oneDone(early)) as { reason?: string }).reason, 'peak-holder-idle')
  await early.stop()
})

gitProjectTest('row 8: the first minute of the peak counts as walked', async ({ root }) => {
  const firstMinute = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  firstMinute.live.add(agentOf(HOLDER))
  await firstMinute.fire('end')
  assert.equal(((await oneDone(firstMinute)) as { outcome: string }).outcome, 'delivered')
  await firstMinute.stop()
})

gitProjectTest('row 8: a walk record that names another session is not walked', async ({ root }) => {
  const other = await worldOf(root, { level: 'reduce', mainStep: { session: 's-other', at: PEAK_START + 60_000 } })
  other.live.add(agentOf(HOLDER))
  await other.fire('end')
  assert.equal(((await oneDone(other)) as { reason?: string }).reason, 'peak-holder-idle')
  await other.stop()
})

gitProjectTest('row 8: a walk record that cannot be read biases to waking', async ({ root }) => {
  const garbage = await worldOf(root, { level: 'reduce', mainStep: 'garbage' })
  garbage.live.add(agentOf(HOLDER))
  await garbage.fire('end')
  assert.equal(((await oneDone(garbage)) as { outcome: string }).outcome, 'delivered')
  await garbage.stop()
})

gitProjectTest('row 9: a paused goal is named and left alone', async ({ root }) => {
  const paused = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  paused.live.add(agentOf(HOLDER))
  paused.live.setGoal(HOLDER, 'paused')
  await paused.fire('end')
  assert.equal(((await oneDone(paused)) as { reason?: string }).reason, 'peak-drive-paused')
  assert.equal(paused.woken.length, 0)
  await paused.stop()
})

gitProjectTest('row 9: a goal waiting for the human is named', async ({ root }) => {
  const waiting = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  waiting.live.add(agentOf(HOLDER))
  waiting.live.setGoal(HOLDER, 'blocked', { code: 'hourness-waiting-human', message: 'the human has not answered' })
  await waiting.fire('end')
  assert.equal(((await oneDone(waiting)) as { reason?: string }).reason, 'peak-waiting-human')
  await waiting.stop()
})

gitProjectTest('row 9: an idle-rounds goal is named, the action itself judges, and the board never resumes it', async ({ root }) => {
  const idle = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START }, resume: { kind: 'skipped' } })
  idle.live.add(agentOf(HOLDER))
  idle.live.setGoal(HOLDER, 'blocked', { code: 'hourness-idle-rounds', message: 'three idle rounds' })
  await idle.fire('end')
  assert.equal(idle.resumeCalls.length, 1, 'the action itself judges; the board does not read the code')
  assert.equal(((await oneDone(idle)) as { reason?: string }).reason, 'peak-idle-rounds')
  assert.equal(idle.live.goalOf(HOLDER)?.phase, 'blocked', 'the goal is not resumed by the board')
  assert.equal(idle.woken.length, 0)
  await idle.stop()
})

gitProjectTest('row 9: another blocked code is named with the code', async ({ root }) => {
  const otherCode = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START } })
  otherCode.live.add(agentOf(HOLDER))
  otherCode.live.setGoal(HOLDER, 'blocked', { code: 'hourness-peak-wait', message: 'waiting out the peak' })
  await otherCode.fire('end')
  assert.equal(((await oneDone(otherCode)) as { reason?: string }).reason, 'peak-drive-blocked')
  await otherCode.stop()
})

gitProjectTest('row 9: a cold session is revived before its goal is read', async ({ root }) => {
  const cold = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START }, answer: revivedAnswer })
  await cold.fire('end')
  assert.deepEqual(cold.resolve.asked, [HOLDER])
  assert.equal(((await oneDone(cold)) as { outcome: string }).outcome, 'delivered')
  await cold.stop()
})

gitProjectTest('row 9: a revival that answers something else counts as no goal, biased to waking', async ({ root }) => {
  // The judgement's revival fails with an error nobody expects; the wake's own revival answers, so the tell goes out.
  let asks = 0
  const gateway = await worldOf(root, {
    level: 'reduce',
    mainStep: { session: HOLDER, at: PEAK_START },
    answer: live => {
      asks += 1
      if (asks === 1) return { error: { code: 'gateway/internal', message: 'resume failed' } }
      const agent = agentOf(HOLDER)
      live.add(agent)
      return { agent: live.agents.get(HOLDER) }
    },
  })
  await gateway.fire('end')
  assert.equal(((await oneDone(gateway)) as { outcome: string }).outcome, 'delivered')
  await gateway.stop()
})

gitProjectTest('row 9: a goal service that throws even for the revived agent is no goal', async ({ root }) => {
  const broken = await worldOf(root, {
    level: 'reduce',
    mainStep: { session: HOLDER, at: PEAK_START },
    answer: live => {
      const agent = agentOf(HOLDER)
      live.add(agent)
      return { agent: live.agents.get(HOLDER) }
    },
  })
  broken.live.breakGoals(HOLDER)
  await broken.fire('end')
  assert.deepEqual(broken.resolve.asked, [HOLDER])
  assert.equal(((await oneDone(broken)) as { outcome: string }).outcome, 'delivered')
  await broken.stop()
})

gitProjectTest('row 9 through a revival that says the writer is elsewhere: the judgement waits like row 2', async ({ root }) => {
  const world = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START }, answer: () => ({ error: { code: 'session/writer-held' } }) })
  await world.fire('end')
  const done = (await oneDone(world)) as { outcome: string, reason?: string }
  assert.deepEqual([done.outcome, done.reason], ['held', 'writer-held'])
  await world.stop()
  // The state file is written when the runtime stops; the rerun marker waits there for the process that takes the lock.
  assert.equal((await world.state()).held.length, 1)
})

gitProjectTest('the peak-start entry is recorded as the rules row\'s work, delegated, with the level of the moment', async ({ root }) => {
  // The world starts before the peak, so the runner's own reading makes both edges.
  const world = await worldOf(root, { level: 'reduce', mainStep: { session: HOLDER, at: PEAK_START + 60_000 }, at: PEAK_START - 10 * 60_000 })
  world.live.add(agentOf(HOLDER))
  await world.tick()
  assert.deepEqual(await doneOf(world, 'loops.peak-start'), [], 'the first reading is not a change')
  world.move(20 * 60_000)
  await world.tick()
  const started = await doneOf(world, 'loops.peak-start')
  assert.equal(started.length, 1)
  assert.deepEqual([started[0]?.outcome, started[0]?.reason], ['delegated', 'reduce'])
  assert.equal((await world.runs()).filter(record => record.kind === 'loop-fired' && record.entry === 'loops.peak-start').length, 1)
  assert.equal(world.woken.length, 0, 'a self entry is only listed and recorded')

  // The peak ends: the peak-start entry is not recorded again, the peak-end entry runs the table.
  world.move(50 * 60_000)
  await world.tick()
  assert.equal((await doneOf(world, 'loops.peak-start')).length, 1)
  assert.deepEqual((await doneOf(world, 'loops.peak-end')).map(record => record.outcome), ['delivered'])
  assert.equal(world.woken.length, 1)
  await world.stop()
})

gitProjectTest('the peak-start entry is recorded without a level when the rules board cannot be read', async ({ root }) => {
  const absent = await worldOf(root, { level: 'absent', at: PEAK_START - 10 * 60_000 })
  absent.live.add(agentOf(HOLDER))
  await absent.tick()
  absent.move(20 * 60_000)
  await absent.tick()
  const bare = await doneOf(absent, 'loops.peak-start')
  assert.deepEqual([bare[0]?.outcome, bare[0]?.reason], ['delegated', undefined])
  await absent.stop()
})

test('view.json shows the peak and the level of the rules board, or where to look for it', async () => {
  await withLoopsRow(async (fixture) => {
    fixture.runtime.services.set(PRICING_SERVICE, { basis: 'probe', plan: 'probe', charged: () => undefined, peak: () => true })
    fixture.runtime.services.set(PEAK_MODE_SERVICE, {
      stateFor: () => peakModeState({ level: 'reduce', origin: 'default', peak: true }),
      stateForProject: () => peakModeState({ level: 'reduce', origin: 'default', peak: true }),
      peakHoldFor: () => ({ level: 'reduce', until: new Date(NOW + 3_600_000).toISOString() }),
    })
    fixture.start()
    await fixture.runtime.create()
    const view = JSON.parse(await readFile(join(fixture.root, '.llm', 'loops', 'view.json'), 'utf8')) as { peak?: Record<string, unknown> }
    assert.deepEqual(view.peak, { now: true, level: '少做', origin: 'default', cap: '少做：高峰里同时至多 1 个 GLM 子 agent' })
  }, { start: false })

  await withLoopsRow(async (fixture) => {
    fixture.runtime.services.set(PRICING_SERVICE, { basis: 'probe', plan: 'probe', charged: () => undefined, peak: () => true })
    fixture.start()
    await fixture.runtime.create()
    const view = JSON.parse(await readFile(join(fixture.root, '.llm', 'loops', 'view.json'), 'utf8')) as { peak?: Record<string, unknown> }
    assert.deepEqual(view.peak, { now: true, level: '档位在规则板上看' })
  }, { start: false })

  await withLoopsRow(async (fixture) => {
    fixture.start()
    await fixture.runtime.create()
    const view = JSON.parse(await readFile(join(fixture.root, '.llm', 'loops', 'view.json'), 'utf8')) as { peak?: Record<string, unknown> }
    assert.equal(view.peak, undefined, 'no pricing service, no peak to show (design §5.2)')
  }, { start: false })
})

test('a project with a main agent starts running from the host\'s workspace registry, without any session of it', async () => {
  await withLoopsRow(async (fixture) => {
    const home = join(fixture.root, 'user')
    const record: HolderRecord = { version: 1, sessionId: 'agent-1', graphDir: join(fixture.root, 'docs', 'graph'), since: new Date(NOW).toISOString(), commandId: 'command-1' }
    mkdirSync(dirname(holderFileOf(home, join(fixture.root, 'docs', 'graph'))), { recursive: true })
    writeFileSync(holderFileOf(home, join(fixture.root, 'docs', 'graph')), `${JSON.stringify(record)}\n`)
    const registry = fakeWorkspaceRegistry()
    registry.addWorkspace(fixture.root)
    fixture.runtime.services.set('workspaceRegistry', registry.service)
    fixture.start()
    assert.ok(fixture.beats.length > 0, 'the row beats once the session controller is there')
    fixture.beats[0]?.run()
    await wait(150)
    assert.equal(existsSync(join(fixture.root, '.llm', 'loops', 'runner.lock')), true, 'the board runs the project before any session of it is open (design §6.1, V17)')

    // A registry that has not started yet only narrows when projects start: the listing says so as a note, and keeps the project running; the archive set it also carries is a degraded fault of its own (design §6.1, §6.4).
    registry.breakState()
    fixture.beats[0]?.run()
    await wait(80)
    const health = fixture.health()
    assert.ok(health.reason.includes('DSH 的工作区登记表读不出，项目在它的会话出现时才开始跑'), 'the listing that cannot be read is a note, not a fault')
    assert.equal(health.status, 'degraded')
    assert.equal(existsSync(join(fixture.root, '.llm', 'loops', 'runner.lock')), true, 'the adopted project keeps running')
  }, { start: false })
})
