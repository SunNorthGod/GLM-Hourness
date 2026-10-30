/**
 * The gate lock (src/execute/gate-lock.ts, M7 step E3) and the options it
 * adds to the repository's one file lock (src/data/lock.ts, finding R5-N6):
 * retry interval, longest wait, stale threshold and boot-time tolerance, each
 * with one case for the gate's values and one for M5's, plus the holder
 * name, keeping a stale lock, and the in-process queue. Files are real, in
 * temporary directories; time is a fake clock that sleeping advances.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireLock, LOCK_WAIT_MS, realLockEnvironment, STALE_LOCK_MS, type LockEnvironment, type LockOptions, type WriteLock } from '../src/data/lock.ts'
import { acquireGateLock, GATE_BOOT_TOLERANCE_MS, GATE_RETRY_MS, GATE_STALE_MS, GATE_WAIT_MS } from '../src/execute/gate-lock.ts'

const root = mkdtempSync(join(tmpdir(), 'execute-gate-lock-'))
process.on('exit', () => rmSync(root, { recursive: true, force: true, maxRetries: 3 }))

let counter = 0
/** A fresh runtime directory (`<exec>`), created. */
function execDir(): string {
  const dir = join(root, `exec${++counter}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const HOUR = 3_600_000
const BOOT = 5_000_000_000

interface FakeEnvironment extends LockEnvironment {
  readonly sleeps: number[]
}

/** A clock that only moves when somebody sleeps; every process counts as alive. */
function fakeEnvironment(over: Partial<LockEnvironment> = {}): FakeEnvironment {
  let clock = 1_700_000_000_000
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => clock,
    sleep: (ms) => { sleeps.push(ms); clock += ms; return Promise.resolve() },
    pid: process.pid,
    isAlive: () => true,
    bootTime: () => BOOT,
    ...over,
  }
}

/** The lock file a live process on this machine, not the caller, wrote. */
function foreignLock(file: string, environment: LockEnvironment, over: { readonly age?: number, readonly bootOffset?: number, readonly pid?: number } = {}): void {
  const at = environment.now() - (over.age ?? 0)
  writeFileSync(file, JSON.stringify({ pid: over.pid ?? process.pid, startedAt: at, at, token: 'someone-else', boot: environment.bootTime() + (over.bootOffset ?? 0), holder: 'check 0000000' }))
}

const staleFiles = (dir: string): string[] => readdirSync(dir).filter(name => name.startsWith('gate.lock.stale-'))
const lockOf = (dir: string): string => join(dir, 'gate.lock')

function held(lock: WriteLock | 'busy'): WriteLock {
  if (lock === 'busy') assert.fail('the lock was busy')
  return lock
}

// ---------------------------------------------------------------------------
// The gate lock

test('the gate lock is gate.lock in the runtime directory, names its holder, and the directory ignores itself', async () => {
  const dir = join(root, 'fresh', 'execute')
  const environment = fakeEnvironment()
  const lock = held(await acquireGateLock(dir, 'check 1a2b3c4', { environment }))
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), '*\n')
  const content = JSON.parse(readFileSync(lockOf(dir), 'utf8')) as Record<string, unknown>
  assert.deepEqual(content, { pid: process.pid, startedAt: environment.now(), at: environment.now(), token: content.token, boot: BOOT, holder: 'check 1a2b3c4' })
  assert.equal(typeof content.token, 'string')
  assert.equal(await lock.held(), true)
  await lock.release()
  assert.equal(await lock.held(), false)
  assert.deepEqual(readdirSync(dir), ['.gitignore'], 'releasing leaves the directory as it was')
  await lock.release()

  writeFileSync(join(dir, '.gitignore'), 'mine\n')
  await held(await acquireGateLock(dir, 'again', { environment })).release()
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'mine\n', 'an existing ignore file is left alone')
})

test('the gate\'s values are the design\'s: every 5 seconds, 60 minutes, stale after 6 hours, 120 seconds of boot tolerance', () => {
  assert.deepEqual([GATE_RETRY_MS, GATE_WAIT_MS, GATE_STALE_MS, GATE_BOOT_TOLERANCE_MS], [5_000, HOUR, 6 * HOUR, 120_000])
})

test('a lock held by another process makes the waiter retry every 5 seconds and report busy after 60 minutes', async () => {
  const dir = execDir()
  const environment = fakeEnvironment()
  foreignLock(lockOf(dir), environment)
  const started = environment.now()
  assert.equal(await acquireGateLock(dir, 'check', { environment }), 'busy')
  const waited = environment.now() - started
  assert.ok(waited >= GATE_WAIT_MS && waited < GATE_WAIT_MS + GATE_RETRY_MS, `waited ${waited} ms`)
  assert.ok(environment.sleeps.every(ms => ms === GATE_RETRY_MS))
  assert.equal((JSON.parse(readFileSync(lockOf(dir), 'utf8')) as { token: string }).token, 'someone-else', 'the other holder keeps its lock')
  assert.deepEqual(staleFiles(dir), [])
})

test('a lock held for more than 6 hours is taken over and kept as gate.lock.stale-<ms>; one held for less is respected', async () => {
  const dir = execDir()
  const environment = fakeEnvironment()
  foreignLock(lockOf(dir), environment, { age: 6 * HOUR - 60_000 })
  assert.equal(await acquireGateLock(dir, 'check', { environment, options: { waitMs: 10_000 } }), 'busy', '5 hours 59 minutes is not stale')
  assert.deepEqual(staleFiles(dir), [])

  foreignLock(lockOf(dir), environment, { age: 6 * HOUR + 1_000 })
  const taken = held(await acquireGateLock(dir, 'check', { environment }))
  const [stale = ''] = staleFiles(dir)
  assert.match(stale, /^gate\.lock\.stale-\d+$/)
  assert.equal((JSON.parse(readFileSync(join(dir, stale), 'utf8')) as { token: string }).token, 'someone-else', 'the old lock is kept for whoever looks')
  assert.equal(await taken.held(), true)
  await taken.release()
})

test('a lock written before the machine last booted is taken over; a boot time within 120 seconds is the same boot', async () => {
  const dir = execDir()
  const environment = fakeEnvironment()
  for (const bootOffset of [119_000, -119_000]) {
    foreignLock(lockOf(dir), environment, { bootOffset })
    assert.equal(await acquireGateLock(dir, 'check', { environment, options: { waitMs: 10_000 } }), 'busy', `boot time off by ${bootOffset} ms`)
  }
  for (const bootOffset of [121_000, -121_000]) {
    foreignLock(lockOf(dir), environment, { bootOffset })
    await held(await acquireGateLock(dir, 'check', { environment })).release()
    await environment.sleep(1_000)
  }
  assert.equal(staleFiles(dir).length, 2, 'both old locks are kept')
})

test('a lock whose process is gone is taken over at once, though the design names only age and boot time', async () => {
  const dir = execDir()
  const child = spawn(process.execPath, ['-e', ''])
  await new Promise(done => child.on('exit', done))
  const environment = fakeEnvironment({ isAlive: realLockEnvironment.isAlive })
  foreignLock(lockOf(dir), environment, { pid: child.pid ?? 0 })
  const started = environment.now()
  const lock = held(await acquireGateLock(dir, 'check', { environment }))
  assert.equal(environment.now(), started, 'no waiting')
  await lock.release()
})

test('releasing deletes the lock only while it still carries the holder\'s token', async () => {
  const dir = execDir()
  const environment = fakeEnvironment()
  const lock = held(await acquireGateLock(dir, 'check', { environment }))
  foreignLock(lockOf(dir), environment)
  assert.equal(await lock.held(), false, 'the holder sees that it was taken over')
  await lock.release()
  assert.equal((JSON.parse(readFileSync(lockOf(dir), 'utf8')) as { token: string }).token, 'someone-else', 'the successor\'s lock stays')
  rmSync(lockOf(dir))
  await held(await acquireGateLock(dir, 'next', { environment })).release()
})

test('holders in one process take the lock in arrival order, handing it over at once; a waiter that gave up does not block the ones behind', async () => {
  const dir = execDir()
  const options: LockOptions = { retryMs: 2_000, waitMs: 20_000 }
  const order: string[] = []
  const first = held(await acquireGateLock(dir, 'first', { options }))
  const take = async (name: string, over: LockOptions = {}): Promise<WriteLock | 'busy'> => {
    const lock = await acquireGateLock(dir, name, { options: { ...options, ...over } })
    order.push(lock === 'busy' ? `${name}:busy` : name)
    return lock
  }
  const second = take('second')
  const impatient = take('impatient', { waitMs: 150 })
  const third = take('third')
  await new Promise(done => setTimeout(done, 400))
  assert.deepEqual(order, ['impatient:busy'], 'only the waiter that ran out of patience is done while the first holds the lock')

  const released = Date.now()
  await first.release()
  const secondLock = held(await second)
  assert.ok(Date.now() - released < 1_000, 'the hand-over did not wait for the 2-second poll')
  assert.deepEqual(order, ['impatient:busy', 'second'])
  await secondLock.release()
  await held(await third).release()
  assert.equal(await impatient, 'busy')
  assert.deepEqual(order, ['impatient:busy', 'second', 'third'])
})

test('two projects\' gate locks do not wait for each other', async () => {
  const a = held(await acquireGateLock(execDir(), 'a', { options: { waitMs: 100 } }))
  const b = held(await acquireGateLock(execDir(), 'b', { options: { waitMs: 100 } }))
  await a.release()
  await b.release()
})

// ---------------------------------------------------------------------------
// The options of the shared lock: M7's values and M5's (design §3.8.3, M5 §5.3), one case each

const VALUE_SETS: readonly (readonly [string, Required<Pick<LockOptions, 'retryMs' | 'waitMs' | 'staleMs' | 'bootToleranceMs'>>])[] = [
  ['gate (M7)', { retryMs: GATE_RETRY_MS, waitMs: GATE_WAIT_MS, staleMs: GATE_STALE_MS, bootToleranceMs: GATE_BOOT_TOLERANCE_MS }],
  ['memory board (M5)', { retryMs: 50, waitMs: 2_000, staleMs: 30_000, bootToleranceMs: 120_000 }],
]

for (const [label, values] of VALUE_SETS) {
  test(`lock options, ${label}: retryMs is the pause between attempts`, async () => {
    const file = lockOf(execDir())
    const environment = fakeEnvironment()
    foreignLock(file, environment)
    assert.equal(await acquireLock(file, environment, { retryMs: values.retryMs, waitMs: values.retryMs * 5, staleMs: values.staleMs }), 'busy')
    assert.deepEqual(environment.sleeps, Array.from({ length: 5 }, () => values.retryMs))
  })

  test(`lock options, ${label}: waitMs is how long a waiter waits before busy`, async () => {
    const file = lockOf(execDir())
    const environment = fakeEnvironment()
    foreignLock(file, environment)
    const started = environment.now()
    assert.equal(await acquireLock(file, environment, { ...values, staleMs: 10 * HOUR }), 'busy')
    const waited = environment.now() - started
    assert.ok(waited >= values.waitMs && waited < values.waitMs + values.retryMs, `waited ${waited} ms for ${values.waitMs}`)
  })

  test(`lock options, ${label}: staleMs is the age at which a live holder's lock is taken over`, async () => {
    const file = lockOf(execDir())
    const environment = fakeEnvironment()
    const quick = { retryMs: 1, waitMs: 1, staleMs: values.staleMs }
    foreignLock(file, environment, { age: values.staleMs - 1_000 })
    assert.equal(await acquireLock(file, environment, quick), 'busy')
    foreignLock(file, environment, { age: values.staleMs + 1_000 })
    await held(await acquireLock(file, environment, quick)).release()
  })

  test(`lock options, ${label}: bootToleranceMs is how far apart two boot times may be and still be one boot`, async () => {
    const file = lockOf(execDir())
    const environment = fakeEnvironment()
    const quick = { retryMs: 1, waitMs: 1, bootToleranceMs: values.bootToleranceMs }
    foreignLock(file, environment, { bootOffset: values.bootToleranceMs - 1_000 })
    assert.equal(await acquireLock(file, environment, quick), 'busy')
    foreignLock(file, environment, { bootOffset: values.bootToleranceMs + 1_000 })
    await held(await acquireLock(file, environment, quick)).release()
  })
}

test('lock options: without them the lock behaves as the rules board always had it', async () => {
  const dir = execDir()
  const file = lockOf(dir)
  const environment = fakeEnvironment()

  // Wait and retry: 2 seconds, every 25 ms.
  foreignLock(file, environment)
  const started = environment.now()
  assert.equal(await acquireLock(file, environment), 'busy')
  assert.ok(environment.now() - started >= LOCK_WAIT_MS)
  assert.ok(environment.sleeps.every(ms => ms === 25))

  // Stale after 10 seconds; the boot time is not compared; a taken-over lock is deleted, not kept.
  foreignLock(file, environment, { age: STALE_LOCK_MS - 1_000, bootOffset: 7 * 24 * HOUR })
  assert.equal(await acquireLock(file, environment, { retryMs: 1, waitMs: 1 }), 'busy', 'a different boot time alone is no reason')
  foreignLock(file, environment, { age: STALE_LOCK_MS + 1_000 })
  await held(await acquireLock(file, environment)).release()
  assert.deepEqual(readdirSync(dir), [], 'no .stale file and no lock')
})

test('an environment without bootTime still locks: the boot time is optional and only compared when both sides have one (E3 review, E3-5)', async () => {
  const dir = execDir()
  const file = lockOf(dir)
  const full = fakeEnvironment()
  // The shape LockEnvironment had before bootTime existed.
  const older: LockEnvironment = { now: full.now, sleep: full.sleep, pid: full.pid, isAlive: full.isAlive }

  const lock = held(await acquireLock(file, older))
  assert.equal('boot' in (JSON.parse(readFileSync(file, 'utf8')) as object), false, 'no boot time is written when the environment cannot tell')
  await lock.release()

  // A dead holder is still taken over, and a boot tolerance without a boot time to compare changes nothing.
  foreignLock(file, full, { age: STALE_LOCK_MS + 1_000 })
  await held(await acquireLock(file, older, { bootToleranceMs: 120_000 })).release()
  foreignLock(file, full, { bootOffset: 7 * 24 * HOUR })
  assert.equal(await acquireLock(file, older, { bootToleranceMs: 120_000, retryMs: 1, waitMs: 1 }), 'busy', 'a lock from another boot cannot be recognised without a boot time of our own')
  // The other direction: a lock written without a boot time is not judged by boot either.
  writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: full.now(), at: full.now(), token: 'someone-else' }))
  assert.equal(await acquireLock(file, full, { bootToleranceMs: 120_000, retryMs: 1, waitMs: 1 }), 'busy')
})

test('lock options: keepStale renames the lock that is taken over, holder names the holder', async () => {
  const dir = execDir()
  const file = lockOf(dir)
  const environment = fakeEnvironment()
  foreignLock(file, environment, { age: STALE_LOCK_MS + 1_000 })
  const lock = held(await acquireLock(file, environment, { keepStale: true, holder: 'check abc' }))
  assert.deepEqual(staleFiles(dir), [`gate.lock.stale-${environment.now()}`])
  assert.equal((JSON.parse(readFileSync(file, 'utf8')) as { holder: string }).holder, 'check abc')
  await lock.release()
})
