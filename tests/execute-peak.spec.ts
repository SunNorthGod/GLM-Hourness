/**
 * The drive in GLM peak hours (M7 design 0.6 §3.9.5, §3.9.1's
 * `hourness-peak-wait` row; src/execute/drive.ts) with a fixed
 * implementation of the real `PeakModeService` type (src/shared/
 * peak-mode.ts) holding the holder's GLM work back at `reduce`, an injected
 * clock and timers: two held rounds without progress block
 * `hourness-peak-wait` and the idle count does not move; `execute.resume-drive`
 * resumes only once the peak is over and the counts restart; without a hold
 * three idle rounds block; the five-minute timer resumes when the board did
 * not; after a restart the first step resumes a block whose end passed and
 * keeps one whose end did not; a paused goal is the person's, never the
 * peak's (R4-F1).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LoopEventRecord } from '../src/loops/service.ts'
import { goalNow, liveOf, startedRig, withRig, type DriveRig } from './execute-drive-rig.ts'

const HOUR = 3_600_000
const pad = (value: number): string => String(value).padStart(2, '0')
const clockOf = (iso: string): string => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`
const peakEnd = (rig: DriveRig): LoopEventRecord => ({ id: 'ev-00000000000000pe', event: 'loops.peak-end', at: rig.now().toISOString(), project: rig.repo.root, session: 'main-1', key: 'peak-end:main-1:boundary', payload: {}, merged: [] })

/** The holder's goal blocked for the peak: a baseline round, then two held rounds without progress. */
async function heldTwice(rig: DriveRig): Promise<string> {
  const until = new Date(rig.now().getTime() + 2 * HOUR).toISOString()
  rig.hold = { level: 'reduce', until }
  await rig.round()
  await rig.round()
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 0, peak: 1 }, 'a held round counts for the peak, not as idle')
  assert.equal(goalNow(rig).phase, 'active')
  await rig.round()
  return until
}

test('two held rounds without progress block hourness-peak-wait with the end and the level; the idle count does not move', () => withRig(startedRig, async (rig) => {
  const until = await heldTwice(rig)
  assert.deepEqual(goalNow(rig).blockedReason, { code: 'hourness-peak-wait', message: `Waiting for GLM peak hours to end at ${clockOf(until)}: the work left is held back by the peak mode (reduce). The harness resumes the drive after peak.` })
  assert.ok((await rig.lines()).some(line => line.op === 'peak-wait' && line.until === until && line.level === 'reduce' && line.goal === goalNow(rig).id))
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'block' && event.code === 'hourness-peak-wait'))
  assert.equal(rig.metrics.filter(event => event.event === 'execute.goal' && event.code === 'hourness-idle-rounds').length, 0)
  assert.match(rig.drive.status('main-1').state ?? '', /If the person asks to continue now, call update_goal resume\.$/)
}))

test('execute.resume-drive is skipped while the peak holds and for a goal not blocked for the peak; after the peak it resumes and the counts restart', () => withRig(startedRig, async (rig) => {
  assert.deepEqual(await rig.drive.resumeDrive(peakEnd(rig)), { outcome: 'skipped', reason: 'the goal is not blocked hourness-peak-wait (active)' })
  const until = await heldTwice(rig)
  assert.deepEqual(await rig.drive.resumeDrive(peakEnd(rig)), { outcome: 'skipped', reason: `peak hours still on until ${until}` })
  rig.hold = undefined
  // The loop row's peak end reaches the action through the row's runAction: an event of another row is checked by its key only.
  assert.deepEqual(await rig.link.runAction('execute.resume-drive', peakEnd(rig)), { outcome: 'done' })
  assert.deepEqual([goalNow(rig).phase, goalNow(rig).activation], ['active', 'armed'])
  assert.deepEqual(rig.drive.status('main-1').counters, { idle: 0, peak: 0 })
  assert.ok((await rig.lines()).some(line => line.op === 'resume' && line.reason === 'peak-end'))
  assert.ok(rig.metrics.some(event => event.event === 'execute.goal' && event.op === 'resume' && event.reason === 'peak-end'))
  assert.deepEqual(await rig.drive.resumeDrive(peakEnd(rig)), { outcome: 'skipped', reason: 'the goal is not blocked hourness-peak-wait (active)' }, 'a second run is idempotent')
}))

test('without a hold three idle rounds block hourness-idle-rounds', () => withRig(startedRig, async (rig) => {
  for (let round = 0; round < 3; round++) await rig.round()
  assert.equal(goalNow(rig).phase, 'active')
  await rig.round()
  assert.equal(goalNow(rig).blockedReason?.code, 'hourness-idle-rounds')
}))

test('the timer five minutes after the peak resumes the drive the board did not resume, tells the holder, and says so in the health when the board had the hand-over', () => withRig(startedRig, async (rig) => {
  rig.boardAttached = true
  const until = await heldTwice(rig)
  rig.hold = undefined
  rig.advance(2 * HOUR + 4 * 60_000)
  rig.fire()
  await rig.settle()
  assert.equal(goalNow(rig).phase, 'blocked', 'not before the five minutes')
  rig.advance(2 * 60_000)
  rig.fire()
  await rig.settle()
  assert.equal(goalNow(rig).phase, 'active')
  assert.ok(rig.live.woken.some(entry => entry.kind === 'glm-hourness-loop' && entry.text === `GLM peak hours ended at ${clockOf(until)}. Work you moved to after peak can start now.`))
  assert.ok(rig.metrics.some(event => event.event === 'execute.loop-fallback' && event.entry === 'loops.peak-end' && event.reason === 'peak-end-missed'))
  assert.deepEqual(rig.drive.notes(), [{ text: '高峰结束时循环板没有接上推进：M7 自己接上了', degraded: true }])
}))

test('after a restart the holder\'s first step resumes a peak block whose end passed and keeps one whose end did not', () => withRig(startedRig, async (rig) => {
  await heldTwice(rig)
  rig.restart()
  rig.hold = undefined
  await rig.step()
  assert.equal(goalNow(rig).phase, 'blocked', 'the end recorded in drive.jsonl has not come')
  assert.match(rig.drive.status('main-1').state ?? '', /^Waiting for GLM peak hours to end at/)
  rig.advance(3 * HOUR)
  await rig.step()
  assert.equal(goalNow(rig).phase, 'active')
}))

test('a paused goal reads as the person\'s in the peak too: it is not resumed', () => withRig(startedRig, async (rig) => {
  rig.hold = { level: 'stop', until: new Date(rig.now().getTime() + HOUR).toISOString() }
  const goal = goalNow(rig)
  rig.live.goals.pause(liveOf(rig), { id: goal.id, revision: goal.revision })
  await rig.settle()
  await rig.round()
  await rig.step()
  assert.equal(goalNow(rig).phase, 'paused')
  assert.equal(rig.drive.status('main-1').state, 'The person paused the drive; it resumes when they press resume on the goal bar or run /goal resume.')
  assert.equal(rig.live.goalCalls.filter(call => call.op === 'resume' || call.op === 'block').length, 0)
}))
