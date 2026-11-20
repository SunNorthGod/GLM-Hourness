/**
 * The drive on the GLM plan's quota (G15, .agents/tasks/preboot-decisions/
 * g15-design.md; src/execute/drive.ts, src/shared/quota.ts `quotaWaitOf`)
 * with the pricing service's `quota` member answered by a fixed view, an
 * injected clock and timers: a confirmed exhaustion blocks
 * `hourness-quota-wait` on the first round it is seen, with the reset
 * instant in the message and on the drive.jsonl line, and the idle count
 * does not move; a forecast-only view and a view without a reset instant
 * leave the counters to run; the timer resumes after the grace and tells the
 * holder; after a restart the first step resumes a block whose reset passed
 * and keeps one whose reset did not; the step path reads the cached view
 * only.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { startedRig, withRig, type DriveRig } from './execute-drive-rig.ts'

const MINUTE_MS = 60_000
const HOUR = 3_600_000
const pad = (value: number): string => String(value).padStart(2, '0')
const clockOf = (resetAt: number): string => {
  const at = new Date(resetAt)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** A spent five-hour window whose reset is `minutes` ahead of the rig's clock. */
function spentView(rig: DriveRig, minutes: number, code?: string): NonNullable<DriveRig['quotaView']> {
  return {
    reading: { at: rig.now().getTime() - HOUR, windows: [{ name: 'five-hour', label: '5 小时', usedPercent: 100, resetAt: rig.now().getTime() + minutes * MINUTE_MS, projection: { kind: 'spent' } }] },
    login: { state: 'ok' },
    pending: false,
    ...(code === undefined ? {} : { limited: { at: rig.now().getTime() - HOUR, code } }),
  }
}

test('a confirmed exhaustion blocks hourness-quota-wait on the first round, with the reset instant and the code; the idle count does not move', () => withRig(startedRig, async (rig) => {
  const resetAt = rig.now().getTime() + 90 * MINUTE_MS
  rig.quotaView = { ...spentView(rig, 90), limited: { at: rig.now().getTime() - HOUR, code: '1308', until: resetAt } }
  await rig.round()
  const goal = rig.live.goalOf('main-1')
  assert.equal(goal?.phase, 'blocked')
  assert.deepEqual(goal?.blockedReason, { code: 'hourness-quota-wait', message: `Waiting for the GLM quota to reset at ${clockOf(resetAt)}: the five-hour window is spent; the server named limit 1308. The harness resumes the drive after the reset.` })
  assert.ok((await rig.lines()).some(line => line.op === 'quota-wait' && line.until === new Date(resetAt).toISOString() && line.code === '1308' && line.goal === goal?.id))
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'block' && event.code === 'hourness-quota-wait'))
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 0, peak: 0 }, 'the exhausted round does not count as idle')
  assert.ok(rig.drive.status('main-1').state?.startsWith('Waiting for the GLM quota to reset'))
  assert.ok(rig.quotaCalls.every(read => read === false), 'the step path reads the cached view only')
}))

test('a forecast-only view or one without a reset instant does not block; the counters run as without the quota path', () => withRig(startedRig, async (rig) => {
  const resetAt = rig.now().getTime() + 30 * MINUTE_MS
  rig.quotaView = { reading: { at: rig.now().getTime() - HOUR, windows: [{ name: 'five-hour', label: '5 小时', usedPercent: 95, resetAt, projection: { kind: 'exhausts', at: rig.now().getTime() + 10 * MINUTE_MS, basis: { kind: 'recent', from: rig.now().getTime() - HOUR, to: rig.now().getTime() } } }] }, login: { state: 'ok' }, pending: false }
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'active', 'the forecast is the board quota-low entry\'s business')
  rig.quotaView = { login: { state: 'ok' }, pending: false, limited: { at: rig.now().getTime() - HOUR, code: '1308' } }
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'active', 'no reset instant anywhere: the drive does not stop blind')
  await rig.round()
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.blockedReason?.code, 'hourness-idle-rounds', 'the rounds count as idle when nothing stops the drive')
}))

test('the timer resumes after the reset plus the grace and tells the holder to go on', () => withRig(startedRig, async (rig) => {
  const resetAt = rig.now().getTime() + 2 * MINUTE_MS
  rig.quotaView = spentView(rig, 2)
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'blocked')
  rig.advance(2 * MINUTE_MS + 4 * MINUTE_MS)
  rig.fire()
  await rig.settle()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'blocked', 'not before the five-minute grace')
  rig.advance(2 * MINUTE_MS)
  rig.fire()
  await rig.settle()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'active')
  assert.ok((await rig.lines()).some(line => line.op === 'resume' && line.reason === 'quota-end'))
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'resume' && event.resumeWhy === 'quota-end'))
  assert.ok(rig.live.woken.some(entry => entry.kind === 'glm-hourness-execute' && entry.text.startsWith(`The GLM quota reset at ${clockOf(resetAt)}.`)))
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 0, peak: 0 })
}))

test('after a restart the holder\'s first step resumes a block whose reset passed and keeps one whose reset did not', () => withRig(startedRig, async (rig) => {
  rig.quotaView = spentView(rig, 5)
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.blockedReason?.code, 'hourness-quota-wait')
  rig.quotaView = undefined
  rig.restart()
  await rig.step()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'blocked', 'the reset recorded on drive.jsonl has not come')
  assert.match(rig.drive.status('main-1').state ?? '', /^Waiting for the GLM quota to reset/)
  rig.advance(10 * MINUTE_MS)
  await rig.step()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'active', 'the reset instant is the authority; a server that has not reset blocks again on the next 429')
}))

test('stale limited.until does not shadow an active reading reset, and peak timer firing preserves cancelQuota', () => withRig(startedRig, async (rig) => {
  const past = rig.now().getTime() - MINUTE_MS
  const resetAt = rig.now().getTime() + 40 * MINUTE_MS
  rig.quotaView = {
    reading: { at: rig.now().getTime() - HOUR, windows: [{ name: 'five-hour', label: '5 小时', usedPercent: 100, resetAt, projection: { kind: 'spent' } }] },
    login: { state: 'ok' },
    pending: false,
    limited: { at: past - MINUTE_MS, code: '1308', until: past },
  }
  // First trigger a peak block whose timer will fire sooner than the quota timer.
  const peakUntil = new Date(rig.now().getTime() + 2 * MINUTE_MS).toISOString()
  rig.hold = { level: 'stop', until: peakUntil }
  const savedQuota = rig.quotaView
  rig.quotaView = undefined
  await rig.round()
  await rig.round()
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.blockedReason?.code, 'hourness-peak-wait')
  // Externally resume and enter quota wait before the peak timer fires.
  const peakGoal = rig.live.goalOf('main-1')!
  rig.live.goals.resume(rig.live.agents.get('main-1')!, { id: peakGoal.id, revision: peakGoal.revision })
  rig.hold = undefined
  rig.quotaView = savedQuota
  await rig.round()
  assert.equal(rig.live.goalOf('main-1')?.blockedReason?.code, 'hourness-quota-wait')
  // Peak timer fires at +7m: it must not clear state.cancelQuota.
  rig.advance(10 * MINUTE_MS)
  rig.fire()
  await rig.settle()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'blocked', 'peak timer firing leaves quota-wait blocked')
  // Disposing the drive cancels the surviving quota timer, so firing past resetAt does not resume.
  rig.dispose()
  rig.advance(60 * MINUTE_MS)
  rig.fire()
  await rig.settle()
  assert.equal(rig.live.goalOf('main-1')?.phase, 'blocked', 'dispose cancelled the preserved quota timer')
}))
