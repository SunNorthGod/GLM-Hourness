/**
 * The machine-level runner (src/loops/machine.ts; docs/ORCHESTRATION.md §18.9;
 * loop board design 0.6 §1.4 items 23 and 24, §3.4 M6-L2 to M6-L5, §4.3,
 * §6.1, §6.4, §9.1): the account's two channel events, judged once for the
 * whole machine and handed to the project the main agent last walked in.
 *
 * The pricing service is a fake whose quota reader answers what the case
 * sets and counts its calls; the channel's entries come from the GLM
 * channel's real defaults through the real registry. The user directory is a
 * temporary directory, the clock is injected, and the inbox of a project is
 * the `emit` the runner is given, recorded per project.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { GLM_LOOP_DEFAULTS } from '../src/glm-llm/loop-defaults.ts'
import { CHANNEL_EVENTS, CHANNEL_LOGIN_REJECTED, CHANNEL_QUOTA_LOW, channelEntries, loginRejectedKey, quotaLowKey } from '../src/loops/channel.ts'
import { createMachineRunner, machinePaths, QUOTA_WAIT_MS, type MachineRunner } from '../src/loops/machine.ts'
import type { ReadRecord } from '../src/loops/records.ts'
import { createRegistry } from '../src/loops/registry.ts'
import type { UsagePricing } from '../src/shared/pricing.ts'
import { loginLine, quotaLowLine, type LoginView, type QuotaRequest, type QuotaView, type QuotaWindowView } from '../src/shared/quota.ts'
import { quickIo } from './loops-helpers.ts'

const AT = Date.parse('2026-11-04T08:00:00.000Z')
const BOOT = Date.parse('2026-11-04T00:00:00.000Z')
const MINUTE = 60_000
const PROJECT_A = 'C:/work/alpha'
const PROJECT_B = 'C:/work/beta'

interface Emitted {
  readonly project: string
  readonly event: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
}

interface Machine {
  readonly home: string
  readonly runner: MachineRunner
  readonly emitted: Emitted[]
  readonly reads: ReadRecord[]
  readonly told: Array<{ text: string, level: string }>
  readonly calls: QuotaRequest[]
  /** What the channel says now. */
  view: QuotaView
  /** The projects that have a main agent now. */
  holders: Set<string>
  /** Make the next emit fail. */
  failing: boolean
  readonly now: () => number
  readonly move: (ms: number) => void
}

const okLogin: LoginView = { state: 'ok' }

/** A pricing service whose quota reader answers `machine.view`, a full read giving `reading` as of the moment it is called. */
function pricingFor(machine: () => Machine, reading: () => QuotaView['reading']): UsagePricing {
  return {
    basis: 'probe',
    plan: 'GLM Coding Plan',
    charged: () => undefined,
    peak: () => false,
    loopDefaults: GLM_LOOP_DEFAULTS,
    quota: (request?: QuotaRequest): Promise<QuotaView> => {
      const self = machine()
      self.calls.push(request ?? {})
      if (request?.read === false) return Promise.resolve(self.view)
      const fresh = reading()
      if (fresh !== undefined) self.view = { ...self.view, reading: fresh }
      return Promise.resolve(self.view)
    },
  }
}

interface MachineOptions {
  readonly home: string
  readonly pid?: number
  readonly clock?: { at: number }
  readonly reading?: () => QuotaView['reading']
  readonly pricing?: boolean
  /** false: the board lists no machine entry (the channel's two are not there). */
  readonly machineEntries?: boolean
}

function machineOf(options: MachineOptions): Machine {
  const clock = options.clock ?? { at: AT }
  // The fakes below call back into the machine, which exists once they are all made.
  const box: { machine?: Machine } = {}
  const self = (): Machine => box.machine!
  const pricing = pricingFor(self, options.reading ?? (() => undefined))
  const registry = createRegistry({ now: () => new Date(clock.at), channel: () => CHANNEL_EVENTS, channelEntries: () => channelEntries(pricing) })
  const emitted: Emitted[] = []
  const reads: ReadRecord[] = []
  const told: Machine['told'] = []
  const machine: Machine = {
    home: options.home,
    emitted,
    reads,
    told,
    calls: [],
    view: { login: okLogin, pending: false },
    holders: new Set([PROJECT_A, PROJECT_B]),
    failing: false,
    now: () => clock.at,
    move: (ms) => { clock.at += ms },
    runner: createMachineRunner({
      userHome: options.home,
      io: quickIo({ now: () => clock.at }),
      now: () => clock.at,
      pid: options.pid ?? 6001,
      boot: () => BOOT,
      pricing: () => options.pricing === false ? undefined : pricing,
      entries: () => options.machineEntries === false ? [] : registry.entries().filter(item => item.state === 'active' && item.entry.scope === 'machine').map(item => item.entry),
      hasHolder: project => self().holders.has(project),
      emit: (project, event) => {
        if (self().failing) return Promise.resolve({ ok: false, code: 'busy', message: 'the write lock is held' })
        emitted.push({ project, ...event })
        return Promise.resolve({ ok: true, id: `ev-${emitted.length}`, duplicate: false })
      },
      record: (record) => { reads.push(record) },
      report: (text, level) => { told.push({ text, level }) },
    }),
  }
  box.machine = machine
  return machine
}

/** The main agent last walked in this project (design §6.1, reminder.ts writes the same note). */
async function walkedIn(home: string, project: string): Promise<void> {
  const file = machinePaths(home).lastStep
  mkdirSync(join(home, 'loops', 'machine'), { recursive: true })
  await writeFile(file, `${JSON.stringify({ session: 'session-1', at: new Date(AT).toISOString(), projectKey: project.toLowerCase(), project }, null, 2)}\n`)
}

/** One record of the user-level usage journal (src/memory/audit.ts UsageRecord). */
async function used(home: string, model: string, at: number): Promise<void> {
  const file = machinePaths(home).usage
  mkdirSync(join(home, 'audit'), { recursive: true })
  await appendFile(file, `${JSON.stringify({ at: new Date(at).toISOString(), provider: model.startsWith('glm') ? 'glm-zcode' : 'deepseek', model, usage: { input: 10, output: 5 } })}\n`)
}

function withHome(name: string, body: (home: string) => Promise<void>): void {
  test(name, async () => {
    const home = mkdtempSync(join(tmpdir(), 'glmh-machine-'))
    try {
      await body(home)
    }
    finally {
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
    }
  })
}

const toldFile = async (home: string): Promise<{ login?: { key: string, since: string }, quota: Array<{ key: string, period: string }> }> =>
  JSON.parse(await readFile(machinePaths(home).told, 'utf8')) as { login?: { key: string, since: string }, quota: Array<{ key: string, period: string }> }

const fiveHour = (usedPercent: number, resetAt: number, extra: Partial<QuotaWindowView> = {}): QuotaWindowView => ({
  name: 'five-hour',
  label: '5 小时',
  usedPercent,
  resetAt,
  projection: { kind: 'none', reason: '' },
  ...extra,
})

withHome('a rejected login is told once to the project the main agent last walked in; back to ok and rejected again is told again (design §1.4 item 23)', async (home) => {
  const machine = machineOf({ home })
  await walkedIn(home, PROJECT_B)
  await machine.runner.beat()
  assert.equal(machine.runner.stand().kind, 'held')
  assert.equal(machine.emitted.length, 0)
  const since = AT + 30_000
  machine.view = { login: { state: 'rejected', since, path: 'model' }, pending: false }
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal(machine.emitted.length, 1)
  const first = machine.emitted[0]
  assert.ok(first !== undefined)
  assert.deepEqual([first.project, first.event, first.key], [PROJECT_B, CHANNEL_LOGIN_REJECTED, loginRejectedKey('model', new Date(since).toISOString())])
  assert.deepEqual(first.payload, { since: new Date(since).toISOString(), path: 'model', line: loginLine({ state: 'rejected', since, path: 'model' }, machine.now()) })
  for (let beat = 0; beat < 5; beat++) {
    machine.move(MINUTE)
    await machine.runner.beat()
  }
  assert.equal(machine.emitted.length, 1, 'the same rejection is told once, however many beats see it')
  // The login comes back, then is rejected again: a new rejection, told once more.
  machine.view = { login: okLogin, pending: false }
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal((await toldFile(home)).login, undefined, 'back to ok, the told rejection is forgotten')
  const again = machine.now() + 10_000
  machine.view = { login: { state: 'rejected', since: again, path: 'model' }, pending: false }
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.deepEqual(machine.emitted.map(item => item.key), [first.key, loginRejectedKey('model', new Date(again).toISOString())])
  // Every check of the login reads the cache only: no request is sent for it (design §1.4 item 24).
  assert.ok(machine.calls.every(call => call.read === false && call.waitMs === 0))
  await machine.runner.stop()
})

withHome('a rejection the channel gives no since for: the key, the payload and told.json carry the first beat that saw it; a cleared state.json tells it at most once more', async (home) => {
  const machine = machineOf({ home })
  await walkedIn(home, PROJECT_A)
  await machine.runner.beat()
  machine.view = { login: { state: 'rejected' }, pending: false }
  machine.move(MINUTE)
  const first = new Date(machine.now()).toISOString()
  await machine.runner.beat()
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal(machine.emitted.length, 1)
  assert.deepEqual([machine.emitted[0]?.key, machine.emitted[0]?.payload.since, machine.emitted[0]?.payload.path], [loginRejectedKey('', first), first, ''])
  assert.deepEqual((await toldFile(home)).login, { key: `login-rejected:glm:${first}`, since: first })
  await machine.runner.stop()
  // Somebody deletes the machine's state.json: the next runner sees the rejection as new once, then keeps it.
  await rm(machinePaths(home).state)
  const next = machineOf({ home, clock: { at: machine.now() + MINUTE } })
  next.view = { login: { state: 'rejected' }, pending: false }
  for (let beat = 0; beat < 4; beat++) {
    await next.runner.beat()
    next.move(MINUTE)
  }
  assert.equal(next.emitted.length, 1, 'once more, not every beat')
  await next.runner.stop()
})

withHome('the quota is read once when GLM was used and the last reading is 15 minutes old; not within the 15 minutes, not without GLM use; a low window is told once for its period (design §1.4 item 24, M6-L2)', async (home) => {
  const reset = AT + 3 * 3_600_000
  let percent = 85
  const machine = machineOf({ home, reading: () => ({ at: machine.now(), windows: [fiveHour(percent, reset)] }) })
  await walkedIn(home, PROJECT_A)
  await used(home, 'glm-5.3', AT - MINUTE)
  // The first beat notes where the journal ends; what it already held is old use.
  await machine.runner.beat()
  const full = (): QuotaRequest[] => machine.calls.filter(call => call.read !== false)
  assert.equal(full().length, 0)
  // A model of another family is no GLM use.
  await used(home, 'deepseek-v4', AT)
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal(full().length, 0)
  // GLM use and no reading yet: exactly one read, waiting three seconds.
  await used(home, 'glm-5.3', machine.now())
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.deepEqual(full(), [{ waitMs: QUOTA_WAIT_MS }])
  assert.equal(machine.emitted.length, 1)
  assert.deepEqual([machine.emitted[0]?.event, machine.emitted[0]?.key], [CHANNEL_QUOTA_LOW, quotaLowKey('five-hour', new Date(reset).toISOString())])
  assert.deepEqual(machine.emitted[0]?.payload, { window: 'five-hour', usedPercent: 85, resetAt: new Date(reset).toISOString(), line: quotaLowLine(fiveHour(85, reset), machine.now()) })
  assert.deepEqual(machine.reads.map(read => [read.kind, read.project, read.entry, read.ok, read.hit]), [['loop-read', PROJECT_A, 'glm:quota-low', true, true]])
  // GLM use again within 15 minutes: no read.
  await used(home, 'glm-5.3', machine.now())
  machine.move(5 * MINUTE)
  await machine.runner.beat()
  assert.equal(full().length, 1)
  // 15 minutes after the reading, more use: one read; the same window in the same period is not told again.
  percent = 90
  machine.move(11 * MINUTE)
  await used(home, 'glm-5.3', machine.now())
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal(full().length, 2)
  assert.equal(machine.emitted.length, 1, 'one period, one message')
  assert.equal(machine.reads.length, 2)
  // Without GLM use in between, nothing is read however long it waits.
  machine.move(60 * MINUTE)
  await machine.runner.beat()
  assert.equal(full().length, 2)
  await machine.runner.stop()
})

withHome('a reset within two minutes of the told one is the same period; a window that is not low is read and recorded without an event', async (home) => {
  const reset = AT + 3 * 3_600_000
  let window = fiveHour(50, reset)
  const machine = machineOf({ home, reading: () => ({ at: machine.now(), windows: [window] }) })
  await walkedIn(home, PROJECT_A)
  await machine.runner.beat()
  await used(home, 'glm-5.3', machine.now())
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.deepEqual([machine.emitted.length, machine.reads.at(-1)?.hit], [0, false])
  window = fiveHour(95, reset + 90_000)
  machine.move(16 * MINUTE)
  await used(home, 'glm-5.3', machine.now())
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal(machine.emitted.length, 1)
  // The period is the reset first told; a reading whose reset moved by 90 seconds keeps it.
  window = fiveHour(97, reset + 30_000)
  machine.move(16 * MINUTE)
  await used(home, 'glm-5.3', machine.now())
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.equal(machine.emitted.length, 1)
  assert.deepEqual((await toldFile(home)).quota.map(item => item.period), [new Date(reset + 90_000).toISOString()])
  await machine.runner.stop()
})

withHome('two processes: only the holder of the machine lock reads and tells', async (home) => {
  const clock = { at: AT }
  const first = machineOf({ home, pid: 6101, clock })
  const second = machineOf({ home, pid: 6102, clock })
  await walkedIn(home, PROJECT_A)
  await first.runner.beat()
  await second.runner.beat()
  assert.deepEqual([first.runner.stand().kind, second.runner.stand().kind], ['held', 'elsewhere'])
  first.view = { login: { state: 'rejected', since: AT }, pending: false }
  second.view = first.view
  clock.at += MINUTE
  await first.runner.beat()
  await second.runner.beat()
  assert.equal(first.emitted.length, 1)
  assert.deepEqual([second.emitted.length, second.calls.length], [0, 0])
  await second.runner.stop()
  await first.runner.stop()
})

withHome('an event with nowhere to go waits in the machine\'s held list: no walk yet, a project without a main agent, an inbox that fails; it goes once there is one, and a day ends it', async (home) => {
  const machine = machineOf({ home })
  machine.view = { login: { state: 'rejected', since: AT }, pending: false }
  await machine.runner.beat()
  assert.equal(machine.emitted.length, 0, 'no project has had a main agent walk yet')
  const held = async (): Promise<number> => (JSON.parse(await readFile(machinePaths(home).state, 'utf8')) as { held: unknown[] }).held.length
  assert.equal(await held(), 1)
  await walkedIn(home, PROJECT_B)
  machine.holders.delete(PROJECT_B)
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.deepEqual([machine.emitted.length, await held()], [0, 1])
  machine.holders.add(PROJECT_B)
  machine.failing = true
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.deepEqual([machine.emitted.length, await held()], [0, 1], 'appended first, told second: a failed append is not told')
  assert.equal((await toldFile(home)).login, undefined)
  machine.failing = false
  machine.move(MINUTE)
  await machine.runner.beat()
  assert.deepEqual([machine.emitted.length, machine.emitted[0]?.project, await held()], [1, PROJECT_B, 0])
  await machine.runner.stop()
  // A rejection nobody can take for a day is dropped.
  const later = machineOf({ home: join(home, 'other') })
  later.view = { login: { state: 'rejected', since: AT }, pending: false }
  await later.runner.beat()
  later.move(25 * 3_600_000)
  await later.runner.beat()
  assert.ok(later.told.some(item => item.text.includes('存了一天')))
  await later.runner.stop()
})

withHome('no pricing service, or no machine entry: the runner takes no lock and reads nothing', async (home) => {
  const without = machineOf({ home, pricing: false })
  await without.runner.beat()
  assert.equal(without.runner.stand().kind, 'off')
  await assert.rejects(readFile(machinePaths(home).runner, 'utf8'))
  await without.runner.stop()
  const none = machineOf({ home, machineEntries: false })
  await none.runner.beat()
  assert.equal(none.runner.stand().kind, 'off')
  await assert.rejects(readFile(machinePaths(home).runner, 'utf8'))
  assert.equal(none.calls.length, 0)
  await none.runner.stop()
  // With both, the lock is taken, and it goes when the runner stops.
  const reader = machineOf({ home })
  await reader.runner.beat()
  assert.equal(reader.runner.stand().kind, 'held')
  await reader.runner.stop()
  await assert.rejects(readFile(machinePaths(home).runner, 'utf8'), 'the lock goes when the runner stops')
})
