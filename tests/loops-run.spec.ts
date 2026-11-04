/**
 * Running one project's board (src/loops/run.ts, src/loops/lock.ts,
 * src/loops/harness.ts; loop board design 0.6 §6.1, §6.5, §6.8, §6.10): who
 * holds the run lock and how it changes hands, the events the loop row puts out
 * itself, what a harness action's result becomes, that a script or a check
 * entry is refused without starting anything, and what the record of a run
 * says.
 *
 * The clock, the timers, the lock's view of the machine, the pricing service's
 * peak reading, the graph reading and the delivery are injected: two runtimes
 * over one project directory stand for two host processes, as design §1.4 asks.
 */
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { projectKey } from '../src/graph/main-agent-holder.ts'
import { CHANNEL_EVENTS, peakChangedKey } from '../src/loops/channel.ts'
import { hostRestartedKey } from '../src/loops/events.ts'
import { currentRun } from '../src/loops/harness.ts'
import type { LoopEntryDefinition } from '../src/loops/model.ts'
import type { DoneRecord, FiredRecord, HandoverRecord, HolderRecord as LoopHolderRecord, LoopRecord } from '../src/loops/records.ts'
import { createRegistry } from '../src/loops/registry.ts'
import type { DeliverRequest, DeliverResult } from '../src/loops/deliver.ts'
import { createProjectRuntime, type ProjectDeps, type ProjectRuntime, type WaitingItem } from '../src/loops/run.ts'
import type { Contribution, ContributionSource, HarnessResult, LoopEventDeclaration } from '../src/loops/service.ts'
import { ensureRuntimeDir, openLoopStore, type LoopStore } from '../src/loops/store.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import type { EmittedEvent } from '../src/shared/metrics.ts'
import { METRICS_SERVICE } from '../src/shared/metrics.ts'
import { DATA_SERVICE } from '../src/shared/data-home.ts'
import { gitProjectTest, quickIo, scriptEntry, seedAgreed, SCRIPT_TEXT, tellEntry } from './loops-helpers.ts'

const EXECUTE: ContributionSource = { plugin: 'dsh-hourness', row: 'glm-hourness/execute' }

const HANDBACK: LoopEventDeclaration = {
  id: 'hourness.handback',
  title: '一件活交回了',
  fields: [{ name: 'task', type: 'string', title: '任务', filter: 'in' }],
  personSelectable: true,
}

const AT = Date.parse('2026-11-02T03:00:00.000Z')
const BOOT = Date.parse('2026-11-01T00:00:00.000Z')
/** What a test entry tells the main agent. */
const TELL = 'Look at what happened and say what you did.'

/** The pricing service's reading of a peak that begins at `from` and ends an hour later. */
const peakBetween = (from: number): ((atMs: number) => boolean) => (atMs: number): boolean => atMs >= from && atMs < from + 3_600_000

interface World {
  readonly runtime: ProjectRuntime
  readonly store: LoopStore
  readonly records: LoopRecord[]
  readonly told: Array<{ text: string, level: 'info' | 'degraded' }>
  readonly delivered: DeliverRequest[]
  readonly timers: Array<{ ms: number, run: () => void }>
  readonly now: () => number
  readonly move: (ms: number) => void
  /** Fire every armed timer, then beat. */
  readonly tick: (ms?: number) => Promise<void>
}

interface WorldOptions {
  readonly pid?: number
  readonly entries?: readonly LoopEntryDefinition[]
  readonly actions?: readonly { readonly id: string, readonly title: string }[]
  readonly run?: (action: string, event: { readonly id: string }) => Promise<HarnessResult>
  readonly deliver?: (request: DeliverRequest) => Promise<DeliverResult>
  readonly holderHere?: () => string | undefined
  readonly peak?: () => ((atMs: number) => boolean) | undefined
  readonly waiting?: () => Promise<readonly WaitingItem[]>
  readonly at?: number
}

/** One host process over a project: its own runtime, lock identity and clock, sharing the project's files. */
async function worldOf(root: string, options: WorldOptions = {}): Promise<World> {
  let clock = options.at ?? AT
  const records: LoopRecord[] = []
  const told: World['told'] = []
  const delivered: DeliverRequest[] = []
  const timers: World['timers'] = []
  const store = openLoopStore(root, { io: quickIo({ now: () => clock }) })
  // The board hands its records to the metrics journal; this fake is the journal, keeping the events for
  // the assertions. The data service points the holder reads at the fixture's own directories, like the
  // loop-peak fixture does, so nothing outside the temporary root is read.
  const ctx: ServiceLookup = {
    get: (name: string): unknown => {
      if (name === METRICS_SERVICE) {
        return {
          emit: (event: EmittedEvent): void => {
            records.push({ ...event.body, kind: event.k } as LoopRecord)
          },
        }
      }
      if (name === DATA_SERVICE) return { userHome: join(root, 'user'), projectHome: join(root, '.llm') }
      return undefined
    },
  }
  await ensureRuntimeDir(store.paths)
  // The channel events are in the table while a pricing service is there, as the row's registry has them.
  const registry = createRegistry({ now: () => new Date(clock), report: (text) => { told.push({ text, level: 'degraded' }) }, channel: () => options.peak === undefined ? [] : CHANNEL_EVENTS })
  const contribution: Contribution = {
    events: [HANDBACK],
    entries: options.entries ?? [],
    ...(options.actions === undefined ? {} : { actions: options.actions }),
    ...(options.run === undefined ? {} : { run: options.run }),
  }
  if (contribution.entries.length > 0 || contribution.events !== undefined) registry.contribute(EXECUTE, contribution)
  const deps: ProjectDeps = {
    root,
    store,
    registry,
    ctx,
    io: quickIo({ now: () => clock }),
    now: () => clock,
    delay: (run, ms) => {
      const timer = { ms, run }
      timers.push(timer)
      return () => {
        const index = timers.indexOf(timer)
        if (index >= 0) timers.splice(index, 1)
      }
    },
    pid: options.pid ?? 4001,
    boot: () => BOOT,
    report: (text, level) => { told.push({ text, level }) },
    deliver: async (request) => {
      delivered.push(request)
      return options.deliver === undefined ? { kind: 'delivered', how: 'followup' } : await options.deliver(request)
    },
    appStamp: () => 'app-1',
    // No real file is watched unless a case asks for one.
    watch: () => undefined,
    read: (_path, previous) => Promise.resolve({ size: 'gone', mtimeMs: previous?.mtimeMs ?? 0 }),
    ...(options.holderHere === undefined ? {} : { holderHere: options.holderHere }),
    ...(options.peak === undefined ? {} : { peak: options.peak }),
    ...(options.waiting === undefined ? {} : { waiting: options.waiting }),
  }
  const runtime = createProjectRuntime({ ...deps, report: (text, level) => { told.push({ text, level }) } })
  // Every record of this process is kept for the assertions as well as handed to the metrics journal.
  return {
    runtime,
    store,
    records,
    told,
    delivered,
    timers,
    now: () => clock,
    move: (ms) => { clock += ms },
    tick: async (ms = 0) => {
      clock += ms
      for (const timer of timers.splice(0)) timer.run()
      await runtime.beat()
      // A run the beat started is a promise of its own: let it settle before the case looks.
      await new Promise(resolve => setImmediate(resolve))
    },
  }
}

/** The records this process handed the metrics journal. */
function runsOf(world: World): LoopRecord[] {
  return world.records
}

/** The events of the inbox. */
async function eventsOf(store: LoopStore): Promise<Array<{ event: string, key: string, payload: Record<string, unknown> }>> {
  const text = await readFile(store.paths.events, 'utf8').catch(() => '')
  return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as { event: string, key: string, payload: Record<string, unknown> })
}

const entryHearing = (id: string, over: Partial<LoopEntryDefinition> = {}): LoopEntryDefinition => ({
  id,
  title: `执行行的 ${id}`,
  why: '这一项在测试里替执行行听一个事件，看板子怎样执行它',
  when: { kind: 'event', events: [HANDBACK.id] },
  // No placeholder of a payload field: a case that moves the entry to another event keeps the text valid.
  action: { kind: 'tell-main', text: TELL, wake: true },
  limits: { debounceSeconds: 1, maxPerHour: 30 },
  ...over,
})

gitProjectTest('the run lock: the first process takes it, the second does not run the project, and a lock nobody refreshed is taken over and kept as evidence', async ({ root }) => {
  const first = await worldOf(root, { pid: 4001 })
  await first.tick()
  assert.deepEqual(first.runtime.stand(), { kind: 'held' })
  const second = await worldOf(root, { pid: 4002 })
  await second.tick()
  assert.equal(second.runtime.stand().kind, 'elsewhere')
  assert.equal(second.runtime.stand().kind === 'elsewhere' && second.runtime.stand().pid, 4001)
  // Three minutes without a refresh: the lock is taken over, the old file kept.
  second.move(4 * 60_000)
  await second.tick()
  assert.deepEqual(second.runtime.stand(), { kind: 'held' })
  const left = await readdir(second.store.paths.runtimeDir)
  assert.equal(left.filter(name => name.startsWith('runner.lock.stale-')).length, 1)
  await first.runtime.stop()
  await second.runtime.stop()
})

gitProjectTest('the run lock follows the main agent\'s session: the process it is open in asks, the holder lets go once nothing of its own runs, and both write it down', async ({ root }) => {
  const holder = await worldOf(root, { pid: 5001 })
  await holder.tick()
  assert.deepEqual(holder.runtime.stand(), { kind: 'held' })
  const withSession = await worldOf(root, { pid: 5002, holderHere: () => 's-main' })
  await withSession.tick()
  assert.equal(withSession.runtime.stand().kind, 'waiting', 'it asked for the lock, it did not take it')
  const asked = JSON.parse(await readFile(holder.store.paths.handover, 'utf8')) as { pid: number, session: string }
  assert.deepEqual([asked.pid, asked.session], [5002, 's-main'])
  await holder.tick()
  assert.equal(holder.runtime.stand().kind, 'elsewhere', 'the holder let the lock go')
  await withSession.tick()
  assert.deepEqual(withSession.runtime.stand(), { kind: 'held' })
  // Both processes write their own hand-over; the journal of the project holds both.
  const hands = [...runsOf(holder), ...runsOf(withSession)].filter((record): record is HandoverRecord => record.kind === 'loop-handover')
  assert.deepEqual(hands.map(record => [record.op, record.pid]), [['release', 5001], ['take', 5002]])
  assert.equal(await readFile(holder.store.paths.handover, 'utf8').catch(() => 'gone'), 'gone', 'the request is taken back once the lock is held')
  await holder.runtime.stop()
  await withSession.runtime.stop()
})

gitProjectTest('a holder with a run of its own in flight keeps the lock until the run is finished', async ({ root }) => {
  let settle: (() => void) | undefined
  const holder = await worldOf(root, {
    pid: 6001,
    entries: [entryHearing('execute.handback')],
    deliver: () => new Promise<DeliverResult>((resolve) => { settle = () => { resolve({ kind: 'delivered', how: 'followup' }) } }),
  })
  await holder.tick()
  await holder.runtime.emit({ event: HANDBACK.id, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: EXECUTE.row })
  await holder.tick(2_000)
  assert.equal(holder.delivered.length, 1, 'the run is in flight')
  const withSession = await worldOf(root, { pid: 6002, holderHere: () => 's-main' })
  await withSession.tick()
  await holder.tick()
  assert.equal(holder.runtime.stand().kind, 'handing', 'the lock waits for the run')
  assert.equal(holder.runtime.stand().kind === 'handing' && holder.runtime.stand().run, '执行行的 execute.handback')
  settle?.()
  await new Promise(resolve => setImmediate(resolve))
  await holder.tick()
  assert.equal(holder.runtime.stand().kind, 'elsewhere')
  await holder.runtime.stop()
  await withSession.runtime.stop()
})

gitProjectTest('loops.host-restarted: once for this start, with the start in its key, and what it says about the stop', async ({ root }) => {
  const before = await worldOf(root, { pid: 7001, entries: [entryHearing('execute.restart', { when: { kind: 'event', events: ['loops.host-restarted'] } })] })
  await before.tick()
  assert.deepEqual(await eventsOf(before.store), [], 'the first start this project ever saw is not a restart')
  await before.runtime.stop()
  const after = await worldOf(root, { pid: 7002, at: AT + 20 * 60_000, entries: [entryHearing('execute.restart', { when: { kind: 'event', events: ['loops.host-restarted'] } })] })
  await after.tick()
  const events = await eventsOf(after.store)
  assert.equal(events.length, 1)
  assert.equal(events[0]?.event, 'loops.host-restarted')
  assert.equal(events[0]?.key, hostRestartedKey(projectKey(root), new Date(AT + 20 * 60_000).toISOString()))
  assert.deepEqual([events[0]?.payload.downMinutes, events[0]?.payload.crashed, events[0]?.payload.rebooted, events[0]?.payload.appChanged], [20, false, false, false])
  await after.tick(60_000)
  assert.equal((await eventsOf(after.store)).length, 1, 'one start, one event')
  await after.runtime.stop()
})

gitProjectTest('a host that did not exit cleanly says so, and the beat after a crash still runs what waited', async ({ root }) => {
  const crashed = await worldOf(root, { pid: 7101 })
  await crashed.tick()
  // No stop(): the state keeps no clean exit, as a crash leaves it.
  const next = await worldOf(root, { pid: 7102, at: AT + 5 * 60_000, entries: [entryHearing('execute.restart', { when: { kind: 'event', events: ['loops.host-restarted'] } })] })
  next.move(4 * 60_000)
  await next.tick()
  const events = await eventsOf(next.store)
  assert.equal(events[0]?.payload.crashed, true)
  await next.runtime.stop()
  await crashed.runtime.stop()
})

gitProjectTest('channel.peak-changed comes from the pricing service, keys on the boundary instant, and is not there without it', async ({ root }) => {
  const boundary = AT + 10 * 60_000
  const without = await worldOf(root, { pid: 8001, entries: [entryHearing('execute.peak', { when: { kind: 'event', events: ['channel.peak-changed'] } })] })
  await without.tick()
  await without.tick(20 * 60_000)
  assert.deepEqual(await eventsOf(without.store), [], 'no pricing service, no channel event')
  await without.runtime.stop()
  const world = await worldOf(root, { pid: 8002, at: AT + 40 * 60_000, peak: () => peakBetween(boundary), entries: [entryHearing('execute.peak', { when: { kind: 'event', events: ['channel.peak-changed'] } })] })
  await world.tick()
  assert.deepEqual(await eventsOf(world.store), [], 'the first reading is what it is, not a change')
  await world.tick(30 * 60_000)
  const events = await eventsOf(world.store)
  assert.equal(events.length, 1)
  assert.equal(events[0]?.key, peakChangedKey('end', new Date(boundary + 3_600_000).toISOString()))
  assert.equal(events[0]?.payload.edge, 'end')
  await world.runtime.stop()
})

gitProjectTest('loops.waiting-on-human: once an hour, what crossed the threshold, each item once a day', async ({ root }) => {
  const since = new Date(AT - 30 * 3_600_000).toISOString()
  const young = new Date(AT - 2 * 3_600_000).toISOString()
  const items: WaitingItem[] = [{ id: 'q-7', title: '要你定的一件', since }, { id: 'q-8', title: '刚问的一件', since: young }]
  const world = await worldOf(root, {
    pid: 9001,
    waiting: () => Promise.resolve(items),
    entries: [entryHearing('execute.waiting', { when: { kind: 'event', events: ['loops.waiting-on-human'], params: { olderThanHours: 24 } } })],
  })
  await world.tick()
  const events = await eventsOf(world.store)
  assert.equal(events.length, 1)
  assert.deepEqual(events[0]?.payload.count, 1, 'only what crossed the threshold is listed')
  assert.match((events[0]?.payload.items as string[])[0] ?? '', /^q-7 "要你定的一件" since \d\d-\d\d \d\d:\d\d$/)
  await world.tick(10 * 60_000)
  assert.equal((await eventsOf(world.store)).length, 1, 'the graph is read once an hour')
  await world.tick(60 * 60_000)
  assert.equal((await eventsOf(world.store)).length, 1, 'an item already listed is not listed again the same day')
  await world.runtime.stop()
})

gitProjectTest('a harness action: done with a tell is delivered, skipped and failed are what they say, and only failed degrades the row', async ({ root }) => {
  let result: HarnessResult = { outcome: 'done', tell: 'The full check on main failed: 2 tests.' }
  const seen: Array<{ action: string, run: string | undefined }> = []
  const world = await worldOf(root, {
    pid: 9101,
    entries: [entryHearing('execute.trunk', { action: { kind: 'harness', action: 'execute.trunk-check' } })],
    actions: [{ id: 'execute.trunk-check', title: '主干全量检查' }],
    run: (action) => {
      seen.push({ action, run: currentRun() })
      return Promise.resolve(result)
    },
  })
  await world.tick()
  const fire = async (index: number): Promise<void> => {
    await world.runtime.emit({ event: HANDBACK.id, key: `handback:t-1:c-${index}`, payload: { task: 't-1' }, from: EXECUTE.row })
    await world.tick(2_000)
  }
  await fire(1)
  assert.equal(seen.length, 1)
  assert.match(seen[0]?.run ?? '', /^run-[0-9a-f]{12}$/, 'the action runs in the context that carries the run')
  assert.equal(world.delivered.length, 1)
  assert.equal(world.delivered[0]?.text, 'The full check on main failed: 2 tests.')
  result = { outcome: 'skipped', reason: '这次不用跑' }
  await fire(2)
  assert.equal(world.delivered.length, 1, 'a skip says nothing to the main agent')
  result = { outcome: 'failed', reason: '起不来' }
  await fire(3)
  const runs = runsOf(world)
  const done = runs.filter((record): record is DoneRecord => record.kind === 'loop-done')
  assert.deepEqual(done.map(record => record.outcome), ['delivered', 'skipped', 'failed'])
  assert.deepEqual(done.map(record => record.reason), [undefined, '这次不用跑', '起不来'])
  // The holder reads its directories from the fixture's data service and finds no record: no fault of the board's, so of the three actions only the one that could not run degrades the row.
  assert.deepEqual(world.told.filter(line => line.level === 'degraded').map(line => line.text.replace(/：.*$/, '')), [`${EXECUTE.row.split('/')[1]}.trunk 的 harness 动作失败`])
  const fired = runs.filter((record): record is FiredRecord => record.kind === 'loop-fired')
  assert.deepEqual(fired.map(record => [record.source, record.plugin, record.row]), [['plugin', 'dsh-hourness', EXECUTE.row], ['plugin', 'dsh-hourness', EXECUTE.row], ['plugin', 'dsh-hourness', EXECUTE.row]])
  assert.deepEqual(fired.map(record => record.trigger.event), [HANDBACK.id, HANDBACK.id, HANDBACK.id])
  await world.runtime.stop()
})

gitProjectTest('a harness entry whose action nobody provides fails and says so, and an action that never answers ends on the limit', async ({ root }) => {
  const world = await worldOf(root, {
    pid: 9201,
    entries: [entryHearing('execute.trunk', { action: { kind: 'harness', action: 'execute.trunk-check' } })],
    actions: [{ id: 'execute.trunk-check', title: '主干全量检查' }],
    run: () => new Promise<HarnessResult>(() => {}),
  })
  await world.tick()
  await world.runtime.emit({ event: HANDBACK.id, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: EXECUTE.row })
  // The run waits for the action; firing the limit's timer is what the six hours are.
  await world.tick(2_000)
  for (const timer of world.timers.splice(0)) timer.run()
  await new Promise(resolve => setImmediate(resolve))
  await world.tick()
  const done = runsOf(world).filter((record): record is DoneRecord => record.kind === 'loop-done')
  assert.deepEqual(done.map(record => [record.outcome, record.reason]), [['failed', 'timeout']])
  assert.equal(world.delivered.length, 0, 'an action that never answered says nothing to the main agent')
  await world.runtime.stop()
})

gitProjectTest('a person\'s entry that would run a script or a check is refused without starting anything, and says which to the page and the health', async ({ root, store }) => {
  const script = scriptEntry('u-11111111')
  await seedAgreed({ root, store }, script, { scriptText: SCRIPT_TEXT })
  const world = await worldOf(root, { pid: 9301 })
  await world.tick()
  assert.equal(world.store.read().entries.find(entry => entry.id === script.id)?.status.kind, 'ok', 'the entry stands: what follows is about running it')
  await world.runtime.emit({ event: 'loops.host-restarted', key: `host-restarted:${projectKey(root)}:${new Date(world.now()).toISOString()}`, payload: { previousStart: new Date(AT - 60_000).toISOString(), downMinutes: 1, crashed: false, rebooted: false, appChanged: false }, from: 'glm-hourness/loops' })
  await world.tick(31_000)
  const done = runsOf(world).filter((record): record is DoneRecord => record.kind === 'loop-done')
  assert.deepEqual(done.map(record => [record.outcome, record.reason]), [['refused', 'unadopted']])
  assert.equal(world.delivered.length, 0, 'a refused run tells nobody anything')
  const state = JSON.parse(await readFile(world.store.paths.state, 'utf8')) as { last: Record<string, { run: string, at: string, outcome: string, reason?: string }> }
  assert.deepEqual(state.last[script.id], { run: state.last[script.id]?.run ?? '', at: new Date(world.now()).toISOString(), outcome: 'refused', reason: 'unadopted' })
  await world.runtime.stop()
})

gitProjectTest('a check entry is refused with check-missing, and nothing in the row can start a process', async ({ root, store }) => {
  const check = tellEntry('u-22222222', {
    title: '改了 ts 之后跑一遍类型检查',
    when: { kind: 'event', events: ['loops.file-changed'], params: { path: join(root, 'package.json') } },
    action: { kind: 'check', tool: 'n-tsc', argv: ['node', 'tsc', '--noEmit'], report: 'on-failure', to: 'event-session' },
  })
  await seedAgreed({ root, store }, check)
  const world = await worldOf(root, { pid: 9401 })
  await world.tick()
  await world.runtime.emit({ event: 'loops.file-changed', key: `file-changed:${join(root, 'package.json')}:12-${AT}`, payload: { path: join(root, 'package.json'), size: 12, mtime: new Date(AT).toISOString() }, from: 'glm-hourness/loops' })
  await world.tick(31_000)
  const done = runsOf(world).filter((record): record is DoneRecord => record.kind === 'loop-done')
  assert.deepEqual(done.map(record => [record.outcome, record.reason]), [['refused', 'check-missing']])
  assert.equal(world.delivered.length, 0)
  await world.runtime.stop()
})

gitProjectTest('a process that cannot read which session is the main agent holds the message: the run is held with the reason, and nothing is lost', async ({ root }) => {
  const world = await worldOf(root, { pid: 9501, entries: [entryHearing('execute.handback')], deliver: () => Promise.resolve({ kind: 'held', reason: 'holder-unreadable' }) })
  await world.tick()
  await world.runtime.emit({ event: HANDBACK.id, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: EXECUTE.row })
  await world.tick(2_000)
  const written = runsOf(world)
  const done = written.filter((record): record is DoneRecord => record.kind === 'loop-done')
  assert.deepEqual(done.map(record => [record.outcome, record.reason]), [['held', 'holder-unreadable']])
  // Why it waited is a record of its own, so it can be looked up afterwards (design §6.10).
  const holder = written.filter((record): record is LoopHolderRecord => record.kind === 'loop-holder')
  assert.deepEqual(holder.map(record => [record.state, record.reason]), [['none', 'no-record']], 'the holder reads its directories from the fixture and finds no record; the message waits either way')
  const records = runsOf(world)
  assert.equal(records.every(record => !JSON.stringify(record).includes(TELL)), true, 'no record carries what was said')
  await world.runtime.stop()
})

gitProjectTest('a self entry is not run here: the row that owns it reports its run, and an id that is not a listed one is dropped', async ({ root }) => {
  const world = await worldOf(root, {
    pid: 9601,
    entries: [
      entryHearing('execute.listed', { action: { kind: 'self', does: '执行行自己做', by: 'glm-hourness/execute' } }),
      entryHearing('execute.handback'),
    ],
  })
  await world.tick()
  await world.runtime.emit({ event: HANDBACK.id, key: 'handback:t-1:c-1', payload: { task: 't-1' }, from: EXECUTE.row })
  await world.tick(2_000)
  const ran = runsOf(world).filter(record => record.kind === 'loop-fired')
  assert.deepEqual(ran.map(record => record.kind === 'loop-fired' && record.entry), ['execute.handback'], 'the listed entry does not run from the inbox')
  world.runtime.recordRun({ cwd: root, entry: 'execute.listed', outcome: 'ran', durationMs: 12 })
  world.runtime.recordRun({ cwd: root, entry: 'execute.handback', outcome: 'ran' })
  world.runtime.recordRun({ cwd: root, entry: 'nobody.here', outcome: 'ran' })
  await world.tick()
  const listed = runsOf(world).filter(record => record.kind === 'loop-done' && record.entry === 'execute.listed')
  assert.equal(listed.length, 1, 'the row that ran it reported one run')
  assert.equal(runsOf(world).filter(record => record.entry === 'nobody.here').length, 0)
  assert.equal(runsOf(world).filter(record => record.kind === 'loop-done' && record.entry === 'execute.handback').length, 1, 'only a listed entry can be reported')
  await world.runtime.stop()
})

test('nothing in src/loops/ starts a process: no module imports node:child_process', async () => {
  const dir = new URL('../src/loops/', import.meta.url)
  const names = await readdir(dir)
  for (const name of names.filter(file => file.endsWith('.ts'))) {
    const text = await readFile(new URL(name, dir), 'utf8')
    assert.equal(text.includes('child_process'), false, `${name} must not reach for a process`)
    assert.equal(/\bspawn\s*\(|\bexecFile\s*\(/.test(text), false, `${name} must not spawn`)
  }
})
