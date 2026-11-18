/**
 * The board's own clock (src/loops/clock.ts, src/loops/run.ts; loop board
 * design 0.6 §6.2, §6.8): the time entries that run something — a person's
 * script or check, a plugin's harness action — fire at their moment, the
 * script through the shared executor with the agreed bytes and the time
 * envelope (`event: 'time'`, `occurrenceAt`), the run recorded as the pair
 * the design asks for, the next moment armed from now, and a moment the host
 * was down for caught up once, late. What the clock does not fire: an entry
 * without a time trigger, a `tell-main` time entry (DSH's reminder times
 * that one), an entry the person's adoption does not stand behind. A script
 * changed behind the board's back is refused; a run that does not finish
 * leaves nothing in the inbox's waiting groups, its next time is the clock's;
 * a run the rules board queues keeps its time shape until the verdict.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { DEFER_RETRY_MS } from '../src/loops/run.ts'
import { clockEntries, whenDigest } from '../src/loops/clock.ts'
import type { LoopEntryDefinition, PersonEntry } from '../src/loops/model.ts'
import type { DoneRecord, FiredRecord } from '../src/loops/records.ts'
import { gitProjectTest, loopWorldOf, seedAgreed, seedRule, sha256, tellEntry, type LoopWorld as World } from './loops-helpers.ts'

const AT = Date.parse('2026-11-02T03:00:00.000Z')

/** A script that reads its envelope and prints the parts the clock's shape is about. */
const ENVELOPE_TEXT = [
  "import { readFileSync } from 'node:fs'",
  "const event = JSON.parse(readFileSync(0, 'utf8'))",
  "console.log([event.event, event.occurrenceAt, event.id ?? 'no-id', event.key ?? 'no-key'].join(' '))",
  '',
].join('\n')

/** A person's entry that runs a script at a moment (design §6.2: the board's own clock times it). */
function timeScript(id: string, when: PersonEntry['when'], scriptText: string, over: Partial<PersonEntry> = {}): PersonEntry {
  return tellEntry(id, {
    title: '到点跑一次脚本',
    when,
    action: { kind: 'script', script: { file: `docs/loops/scripts/${id}.mjs`, sha256: sha256(scriptText), lang: 'node' }, timeoutSeconds: 30, report: 'always' },
    ...over,
  })
}

/** This file's world runs with no row contribution unless a case hands one over. */
const worldOf = (root: string, options: Parameters<typeof loopWorldOf>[1] = {}): Promise<World> => loopWorldOf(root, options)

/** The loop-done records of one entry. */
const doneOf = (world: World, entry: string): DoneRecord[] =>
  world.records.filter((record): record is DoneRecord => record.kind === 'loop-done' && record.entry === entry)

const firedOf = (world: World, entry: string): FiredRecord[] =>
  world.records.filter((record): record is FiredRecord => record.kind === 'loop-fired' && record.entry === entry)

/** Wait until one entry's run has reached `outcome` (a script is a real process). */
async function untilDone(world: World, entry: string, outcome?: string): Promise<void> {
  const started = Date.now()
  for (;;) {
    const done = doneOf(world, entry).some(record => outcome === undefined || record.outcome === outcome)
    if (done || Date.now() - started > 15_000) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/** Wait until one entry has `count` ended runs: a record of an earlier run makes untilDone return while a later script is still going. */
async function untilCount(world: World, entry: string, count: number): Promise<void> {
  const started = Date.now()
  for (;;) {
    if (doneOf(world, entry).length >= count || Date.now() - started > 15_000) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/** Wait until every fired run has its ending record, so a script the test started is over before the project directory goes. */
async function untilSettled(world: World): Promise<void> {
  const started = Date.now()
  for (;;) {
    const ended = new Set(world.records.filter(record => record.kind === 'loop-done').map(record => record.run))
    if (world.records.filter(record => record.kind === 'loop-fired').every(record => ended.has(record.run)) || Date.now() - started > 15_000) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/** What the cases read of the runtime's state.json; a field the file does not have yet reads as empty. */
interface ClockSavedState {
  due: Record<string, { at: string, digest: string }>
  last: Record<string, { run: string, at: string, outcome: string, reason?: string }>
  pending: Record<string, { events: unknown[] }>
  deferred: Record<string, { time?: { occurrenceAt: string } }>
}

/** The runtime's state.json once `ready` holds, or as it is after five seconds. */
async function savedState(world: World, ready: (state: ClockSavedState) => boolean): Promise<ClockSavedState> {
  const started = Date.now()
  for (;;) {
    const text = await readFile(world.store.paths.state, 'utf8').catch(() => '{}')
    const state = { due: {}, last: {}, pending: {}, deferred: {}, ...JSON.parse(text) } as ClockSavedState
    if (ready(state) || Date.now() - started > 5_000) return state
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

gitProjectTest('a once script entry fires at its moment: the executor reads the time envelope, the pair of records carries the occurrence, and the due is spent', async ({ root, store }) => {
  const moment = new Date(AT + 60_000).toISOString()
  const entry = timeScript('u-10101010', { kind: 'once', at: moment }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, entry, { scriptText: ENVELOPE_TEXT })
  const world = await worldOf(root, { pid: 4101 })
  await world.tick()
  assert.deepEqual(await savedState(world, state => state.due[entry.id] !== undefined).then(state => state.due[entry.id]?.at), moment, 'the first beat arms the moment')
  assert.equal(world.runtime.bindings().size, 0, 'a script entry gets no DSH reminder')
  await world.tick(61_000)
  await untilDone(world, entry.id, 'reported')
  const fired = firedOf(world, entry.id)
  assert.equal(fired.length, 1, 'one moment, one firing')
  assert.deepEqual([fired[0]?.trigger.kind, fired[0]?.trigger.occurrenceAt, fired[0]?.trigger.event], ['once', moment, undefined])
  assert.equal(fired[0]?.late, undefined, 'the moment arrived on time')
  const done = doneOf(world, entry.id)
  assert.deepEqual(done.map(record => record.outcome), ['reported'])
  assert.deepEqual(done[0]?.exits, [0])
  const text = world.delivered[0]?.text ?? ''
  assert.equal(text.includes(`\`node docs/loops/scripts/${entry.id}.mjs\` exit 0（`), true, 'the result names the command and the exit')
  assert.equal(text.includes(`time ${moment} no-id no-key`), true, `the envelope says time and the occurrence, with no event id or key: ${text.split('\n')[1] ?? ''}`)
  const state = await savedState(world, saved => saved.last[entry.id]?.outcome === 'reported')
  assert.equal(state.due[entry.id], undefined, 'a spent once has no next moment')
  assert.equal(state.last[entry.id]?.outcome, 'reported')
  await untilSettled(world)
  await world.runtime.stop()
})

gitProjectTest('a moment the host was down for is caught up once, late, with the moment it should have happened', async ({ root, store }) => {
  const moment = new Date(AT + 60_000).toISOString()
  const entry = timeScript('u-20202020', { kind: 'once', at: moment }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, entry, { scriptText: ENVELOPE_TEXT })
  const down = await worldOf(root, { pid: 4201 })
  await down.tick()
  await down.runtime.stop()
  // The host is gone for ten minutes; the state keeps the due nobody fired.
  const back = await worldOf(root, { pid: 4202, at: AT + 10 * 60_000 })
  await back.tick()
  await untilDone(back, entry.id, 'reported')
  const fired = firedOf(back, entry.id)
  assert.equal(fired.length, 1, 'one catch-up, not a second')
  assert.deepEqual([fired[0]?.trigger.occurrenceAt, fired[0]?.late], [moment, true])
  const spent = await savedState(back, saved => saved.due[entry.id] === undefined && saved.last[entry.id] !== undefined)
  assert.equal(spent.due[entry.id], undefined, 'the spent once is not armed again')
  await untilSettled(back)
  await back.runtime.stop()
})

gitProjectTest('a daily script entry fires at its wall time and the next day is armed from now; an every entry re-arms from now', async ({ root, store }) => {
  const entry = timeScript('u-30303030', { kind: 'daily', time: '03:05', timeZone: 'UTC' }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, entry, { scriptText: ENVELOPE_TEXT })
  const every = timeScript('u-30303031', { kind: 'every', seconds: 300 }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, every, { scriptText: ENVELOPE_TEXT })
  const world = await worldOf(root, { pid: 4301 })
  await world.tick()
  assert.equal((await savedState(world, state => state.due[entry.id] !== undefined && state.due[every.id] !== undefined)).due[entry.id]?.at, '2026-11-02T03:05:00.000Z')
  assert.equal((await savedState(world, () => true)).due[every.id]?.at, new Date(AT + 300_000).toISOString(), 'an every entry counts from the moment it was armed')
  await world.tick(5 * 60_000 + 1_000)
  await untilDone(world, entry.id, 'reported')
  await untilCount(world, every.id, 1)
  assert.equal((await savedState(world, () => true)).due[entry.id]?.at, '2026-11-03T03:05:00.000Z', 'the next wall time is armed')
  await world.tick(300_000)
  await untilCount(world, every.id, 2)
  const state = await savedState(world, () => true)
  assert.equal(state.due[every.id]?.at, new Date(AT + 10 * 60_000 + 1_000 + 300_000).toISOString(), 'an every entry counts its next from the moment it fired')
  assert.deepEqual(doneOf(world, entry.id).map(record => record.outcome), ['reported'])
  assert.deepEqual(doneOf(world, every.id).map(record => record.outcome), ['reported', 'reported'], 'the every entry fired at 5:01 and again at 10:01')
  await untilSettled(world)
  await world.runtime.stop()
})

gitProjectTest('what the clock does not fire: an event entry, a tell-main time entry, and an entry the person\'s adoption no longer stands behind', async ({ root, store }) => {
  const moment = new Date(AT + 60_000).toISOString()
  const script = timeScript('u-40404040', { kind: 'once', at: moment }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, script, { scriptText: ENVELOPE_TEXT })
  const event = timeScript('u-40404041', { kind: 'event', events: ['loops.host-restarted'] }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, event, { scriptText: ENVELOPE_TEXT })
  const told = tellEntry('u-40404042', { title: '到点说一声', when: { kind: 'daily', time: '03:05', timeZone: 'UTC' } })
  await seedAgreed({ root, store }, told)
  const world = await worldOf(root, { pid: 4401 })
  await world.tick()
  const state = await savedState(world, saved => saved.due[script.id] !== undefined)
  assert.equal(state.due[event.id], undefined, 'an event trigger is the inbox\'s, not the clock\'s')
  assert.equal(state.due[told.id], undefined, 'a tell-main time entry is DSH\'s reminder (bind.ts), not the clock\'s')
  await world.tick(61_000)
  await untilDone(world, script.id, 'reported')
  assert.equal(doneOf(world, event.id).length, 0, 'the event entry waited for its event, which never came')
  assert.equal(doneOf(world, told.id).length, 0, 'the tell-main entry waited for DSH, which is not here')
  assert.equal(world.delivered.every(request => request.entry === script.id), true, 'the only delivery is the script\'s result')

  // The person's adoption no longer stands behind the entry: the file changed outside the board (§9.3), the clock drops it.
  const entryFile = join(root, 'docs', 'loops', 'entries', `${script.id}.json`)
  const text = await readFile(entryFile, 'utf8')
  await writeFile(entryFile, text.replace('到点跑一次脚本', '到点跑一次脚本（改过）'))
  await world.tick()
  assert.equal(world.store.read().entries.find(item => item.id === script.id)?.status.kind, 'outside', 'the changed file stands outside the board')
  assert.equal((await savedState(world, () => true)).due[script.id], undefined, 'the clock dropped what it may not fire')
  await world.tick(61_000)
  assert.equal(firedOf(world, script.id).length, 1, 'no firing past the adoption')
  await untilSettled(world)
  await world.runtime.stop()
})

gitProjectTest('a script changed behind the board\'s back is refused at its moment, and the next moment still comes', async ({ root, store }) => {
  const moment = new Date(AT + 60_000).toISOString()
  const entry = timeScript('u-50505050', { kind: 'once', at: moment }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, entry, { scriptText: ENVELOPE_TEXT })
  await writeFile(join(root, 'docs', 'loops', 'scripts', `${entry.id}.mjs`), 'console.log("changed")\n')
  const world = await worldOf(root, { pid: 4501 })
  await world.tick()
  await world.tick(61_000)
  await untilDone(world, entry.id, 'refused')
  assert.deepEqual(doneOf(world, entry.id).map(record => [record.outcome, record.reason]), [['refused', 'script-changed']])
  assert.equal(world.delivered.length, 0, 'a refused run tells nobody anything')
  await untilSettled(world)
  await world.runtime.stop()
})

gitProjectTest('a run that does not finish ends unfinished and leaves nothing in the inbox\'s waiting groups; its next time is the clock\'s', async ({ root, store }) => {
  const slowText = 'setTimeout(() => process.exit(0), 5000)\n'
  const base = timeScript('u-60606060', { kind: 'daily', time: '03:05', timeZone: 'UTC' }, slowText)
  const entry = { ...base, action: { ...base.action, timeoutSeconds: 1 } }
  await seedAgreed({ root, store }, entry, { scriptText: slowText })
  const world = await worldOf(root, { pid: 4601 })
  await world.tick()
  await world.tick(5 * 60_000 + 1_000)
  await untilDone(world, entry.id, 'unfinished')
  const done = doneOf(world, entry.id)
  assert.deepEqual(done.map(record => record.outcome), ['unfinished'])
  const state = await savedState(world, saved => saved.last[entry.id]?.outcome === 'unfinished')
  assert.equal(Object.values(state.pending).some(group => Array.isArray(group.events) && group.events.length > 0), false, 'a clock run has no events to hand back')
  assert.equal(state.due[entry.id]?.at, '2026-11-03T03:05:00.000Z', 'the next wall time was armed before the run')
  await untilSettled(world)
  await world.runtime.stop()
})

gitProjectTest('a run the rules board queues keeps its time shape, and runs with it when the rule is lifted', async ({ root, store }) => {
  const moment = new Date(AT + 60_000).toISOString()
  const entry = timeScript('u-70707070', { kind: 'once', at: moment }, ENVELOPE_TEXT)
  await seedAgreed({ root, store }, entry, { scriptText: ENVELOPE_TEXT })
  const world = await worldOf(root, { pid: 4701 })
  // The queueing rule is in before the moment: the firing beat asks and is queued.
  await seedRule(root, 'queue', new Date(world.now()).toISOString(), 1)
  await world.tick()
  await world.tick(61_000)
  await untilDone(world, entry.id, 'deferred')
  const held = await savedState(world, saved => Object.keys(saved.deferred).length > 0)
  const queued = Object.values(held.deferred)[0]
  assert.equal(queued?.time?.occurrenceAt, moment, 'the queued run keeps the moment it should have happened')
  await seedRule(root, 'queue', new Date(world.now()).toISOString(), 1, 'lifted')
  world.move(DEFER_RETRY_MS + 1_000)
  await world.tick()
  await untilDone(world, entry.id, 'reported')
  const whole = world.records.filter(record => 'entry' in record && record.entry === entry.id)
  assert.deepEqual(whole.filter(record => record.kind === 'loop-done').map(record => record.kind === 'loop-done' && record.outcome), ['deferred', 'reported'])
  assert.equal(whole.filter(record => record.kind === 'loop-fired').length, 1, 'one moment, one firing, however long the verdict took')
  await untilSettled(world)
  await world.runtime.stop()
})

gitProjectTest('a plugin\'s harness action at a moment runs through the same execution and its tell reaches the main agent', async ({ root }) => {
  const moment = new Date(AT + 60_000).toISOString()
  const entry: LoopEntryDefinition = {
    id: 'execute.nightly',
    title: '执行行的夜里一件',
    why: '这一项在测试里替执行行到点做一件事',
    when: { kind: 'once', at: moment },
    action: { kind: 'harness', action: 'execute.nightly', tell: { text: 'The nightly ran.', wake: true } },
  }
  const world = await worldOf(root, {
    pid: 4801,
    entries: [entry],
    actions: [{ id: 'execute.nightly', title: '夜里一件' }],
    run: () => Promise.resolve({ outcome: 'done' as const, tell: 'Did the nightly work.' }),
  })
  await world.tick()
  await world.tick(61_000)
  await untilDone(world, entry.id, 'delivered')
  const fired = firedOf(world, entry.id)
  assert.deepEqual([fired[0]?.trigger.kind, fired[0]?.trigger.occurrenceAt], ['once', moment], 'the design §6.2 table: a harness action is the clock\'s, too')
  assert.deepEqual(doneOf(world, entry.id).map(record => record.outcome), ['delivered'])
  assert.equal(world.delivered[0]?.text, 'Did the nightly work.', 'the action\'s own words go out')
  await untilSettled(world)
  await world.runtime.stop()
})

test('the clock knows its entries and digests: only the four time triggers with a run action, and a changed trigger changes the digest', () => {
  const script = { file: 'docs/loops/scripts/a.mjs', sha256: 'a'.repeat(64), lang: 'node' } as const
  const entries = clockEntries([
    { entry: { id: 'a', title: 'a', when: { kind: 'once', at: '2026-11-05T02:30:00.000Z' }, action: { kind: 'script', script, report: 'always' } }, source: 'person' },
    { entry: { id: 'b', title: 'b', when: { kind: 'daily', time: '09:00', timeZone: 'UTC' }, action: { kind: 'check', tool: 'tsc', argv: ['node', 'tsc'], report: 'on-change' } }, source: 'person' },
    { entry: { id: 'c', title: 'c', when: { kind: 'weekly', time: '09:00', weekdays: [1], timeZone: 'UTC' }, action: { kind: 'harness', action: 'x', tell: { text: 't', wake: true } } }, source: 'plugin' },
    { entry: { id: 'd', title: 'd', when: { kind: 'daily', time: '09:00', timeZone: 'UTC' }, action: { kind: 'tell-main', text: 't', wake: true } }, source: 'person' },
    { entry: { id: 'e', title: 'e', when: { kind: 'event', events: ['loops.host-restarted'] }, action: { kind: 'script', script, report: 'always' } }, source: 'person' },
    { entry: { id: 'f', title: 'f', when: { kind: 'daily', time: '09:00', timeZone: 'UTC' }, action: { kind: 'self', does: '它自己做', by: 'x' } }, source: 'plugin' },
    { entry: { id: 'g', title: 'g', when: { kind: 'cron', expression: '0 9 * * 1-5', timeZone: 'UTC' }, action: { kind: 'tell-main', text: 't', wake: true } }, source: 'person' },
  ])
  assert.deepEqual(entries.map(item => item.entry.id), ['a', 'b', 'c'], 'script, check and harness at a time; tell-main, event, self and cron are not the clock\'s')
  const when = { kind: 'daily' as const, time: '09:00', timeZone: 'UTC' }
  assert.equal(whenDigest(when), whenDigest({ ...when }), 'the digest is of the value')
  assert.notEqual(whenDigest(when), whenDigest({ ...when, time: '09:30' }), 'a changed trigger has another digest')
})
