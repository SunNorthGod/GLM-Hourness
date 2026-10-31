/**
 * The entry shape both boards share (docs/ORCHESTRATION.md §18; loop board
 * design 0.6 §2.2, §3.1, §4.6, §12): when an entry fires (nextOccurrence),
 * whether a trigger and its filter are well formed (validateWhen), whether
 * one event's payload passes a filter (matchesFilter), and the one function
 * that picks a script's timeout (effectiveTimeoutSeconds, decision
 * d-timeout-measured). Pure functions; no host, no file system, no clock.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import test from 'node:test'
import {
  effectiveTimeoutSeconds,
  GATE_TIMEOUT_MAX_SECONDS,
  matchesFilter,
  nextOccurrence,
  validateScriptAction,
  validateWhen,
  WORK_TIMEOUT_MAX_SECONDS,
  type EventFilter,
  type EventParams,
  type FilterTest,
  type HookShape,
  type LoopEventDeclaration,
  type LoopEventField,
  type LoopEventParam,
  type ScriptAction,
  type ScriptLang,
  type ScriptRef,
  type ScriptTiming,
  type ScriptTimingContext,
  type TimeoutDecision,
  type TimeoutInput,
  type Trigger,
  type TriggerIssue,
} from '../src/loops/trigger.ts'

const iso = (date: Date | undefined): string | undefined => date?.toISOString()
const paths = (issues: readonly TriggerIssue[]): readonly string[] => issues.map(issue => issue.path)

// ---------------------------------------------------------------- the module

test('the module imports no Node built-in, so a client can import it', () => {
  const text = readFileSync(new URL('../src/loops/trigger.ts', import.meta.url), 'utf8')
  const specifiers = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1] ?? '')
  const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])
  assert.deepEqual(specifiers.filter(specifier => specifier.startsWith('node:') || builtins.has(specifier)), [])
  assert.doesNotMatch(text, /\brequire\(|\bimport\(/)
})

test('the ceilings are 30 seconds on a gating event and 1800 seconds elsewhere (decision d-timeout-measured)', () => {
  assert.equal(GATE_TIMEOUT_MAX_SECONDS, 30)
  assert.equal(WORK_TIMEOUT_MAX_SECONDS, 1800)
})

// ----------------------------------------------------------- nextOccurrence

const SHANGHAI = 'Asia/Shanghai'
const NEW_YORK = 'America/New_York'

test('once: the moment itself while it is ahead, nothing once it is not strictly ahead', () => {
  const when: Trigger = { kind: 'once', at: '2026-10-30T09:00:00+08:00' }
  assert.equal(iso(nextOccurrence(when, new Date('2026-10-30T00:00:00Z'), SHANGHAI)), '2026-10-30T01:00:00.000Z')
  assert.equal(nextOccurrence(when, new Date('2026-10-30T01:00:00Z'), SHANGHAI), undefined)
  assert.equal(nextOccurrence(when, new Date('2026-10-30T02:00:00Z'), SHANGHAI), undefined)
  assert.equal(nextOccurrence({ kind: 'once', at: 'tomorrow' }, new Date('2026-10-30T00:00:00Z'), SHANGHAI), undefined)
})

test('every: the given number of seconds after the moment asked from', () => {
  const after = new Date('2026-10-30T00:00:00Z')
  assert.equal(iso(nextOccurrence({ kind: 'every', seconds: 600 }, after, SHANGHAI)), '2026-10-30T00:10:00.000Z')
  assert.equal(after.toISOString(), '2026-10-30T00:00:00.000Z', 'the argument is not changed')
  for (const seconds of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(nextOccurrence({ kind: 'every', seconds }, after, SHANGHAI), undefined, String(seconds))
})

test('daily in Asia/Shanghai: today when the time is still ahead, tomorrow when it is now or past', () => {
  const when: Trigger = { kind: 'daily', time: '09:30', timeZone: SHANGHAI }
  assert.equal(iso(nextOccurrence(when, new Date('2026-10-30T00:00:00Z'), NEW_YORK)), '2026-10-30T01:30:00.000Z')
  assert.equal(iso(nextOccurrence(when, new Date('2026-10-30T01:30:00Z'), NEW_YORK)), '2026-10-31T01:30:00.000Z', 'strictly after')
  assert.equal(iso(nextOccurrence(when, new Date('2026-10-30T02:00:00Z'), NEW_YORK)), '2026-10-31T01:30:00.000Z')
  assert.equal(iso(nextOccurrence({ kind: 'daily', time: '00:15', timeZone: SHANGHAI }, new Date('2026-10-30T16:00:00Z'), NEW_YORK)), '2026-10-30T16:15:00.000Z', 'the local day starts at 16:00Z')
})

test('daily without a time zone uses the system time zone it is given', () => {
  const when: Trigger = { kind: 'daily', time: '09:30' }
  assert.equal(iso(nextOccurrence(when, new Date('2026-10-30T00:00:00Z'), SHANGHAI)), '2026-10-30T01:30:00.000Z')
  assert.equal(iso(nextOccurrence(when, new Date('2026-10-30T00:00:00Z'), NEW_YORK)), '2026-10-30T13:30:00.000Z')
})

test('weekly in Asia/Shanghai: ISO weekdays, Sunday is 7, the same day when the time is still ahead', () => {
  const friday = new Date('2026-10-30T02:00:00Z') // Friday 10:00 local
  const monWed: Trigger = { kind: 'weekly', time: '09:00', weekdays: [1, 3], timeZone: SHANGHAI }
  assert.equal(iso(nextOccurrence(monWed, friday, SHANGHAI)), '2026-11-02T01:00:00.000Z')
  assert.equal(iso(nextOccurrence(monWed, new Date('2026-11-02T01:00:00Z'), SHANGHAI)), '2026-11-04T01:00:00.000Z')
  assert.equal(iso(nextOccurrence({ kind: 'weekly', time: '09:00', weekdays: [7], timeZone: SHANGHAI }, friday, SHANGHAI)), '2026-11-01T01:00:00.000Z')
  assert.equal(iso(nextOccurrence({ kind: 'weekly', time: '12:00', weekdays: [5], timeZone: SHANGHAI }, friday, SHANGHAI)), '2026-10-30T04:00:00.000Z')
})

test('a daily time inside the hour that spring-forward skips is skipped for that day', () => {
  // America/New_York, 2026-03-08 02:00 EST jumps to 03:00 EDT: 02:30 does not exist that day.
  const skipped: Trigger = { kind: 'daily', time: '02:30', timeZone: NEW_YORK }
  assert.equal(iso(nextOccurrence(skipped, new Date('2026-03-06T12:00:00Z'), SHANGHAI)), '2026-03-07T07:30:00.000Z', 'the day before: 02:30 EST')
  assert.equal(iso(nextOccurrence(skipped, new Date('2026-03-07T12:00:00Z'), SHANGHAI)), '2026-03-09T06:30:00.000Z', 'the missing day is skipped: 02:30 EDT two days on')
  assert.equal(iso(nextOccurrence({ kind: 'daily', time: '03:30', timeZone: NEW_YORK }, new Date('2026-03-07T12:00:00Z'), SHANGHAI)), '2026-03-08T07:30:00.000Z', 'a time that exists is not moved')
  const sunday: Trigger = { kind: 'weekly', time: '02:30', weekdays: [7], timeZone: NEW_YORK }
  assert.equal(iso(nextOccurrence(sunday, new Date('2026-03-01T12:00:00Z'), SHANGHAI)), '2026-03-15T06:30:00.000Z', 'weekly skips the Sunday that has no 02:30')
})

test('a daily time inside the hour that fall-back repeats takes the earlier occurrence only', () => {
  // America/New_York, 2026-11-01 02:00 EDT falls back to 01:00 EST: 01:30 happens twice (05:30Z and 06:30Z).
  const repeated: Trigger = { kind: 'daily', time: '01:30', timeZone: NEW_YORK }
  assert.equal(iso(nextOccurrence(repeated, new Date('2026-11-01T00:00:00Z'), SHANGHAI)), '2026-11-01T05:30:00.000Z', 'the earlier one')
  assert.equal(iso(nextOccurrence(repeated, new Date('2026-11-01T05:30:00Z'), SHANGHAI)), '2026-11-02T06:30:00.000Z', 'the later 01:30 is not a second occurrence')
  assert.equal(iso(nextOccurrence({ kind: 'daily', time: '02:30', timeZone: NEW_YORK }, new Date('2026-11-01T00:00:00Z'), SHANGHAI)), '2026-11-01T07:30:00.000Z', 'a time after the repeated hour exists once')
})

test('event, command and cron triggers have no next moment of their own', () => {
  const after = new Date('2026-10-30T00:00:00Z')
  const triggers: readonly Trigger[] = [
    { kind: 'event', events: ['hourness.handback'] },
    { kind: 'command', names: ['glm-status'] },
    { kind: 'cron', expression: '0 9 * * 1-5' }, // the DSH schedule service computes cron
  ]
  for (const when of triggers) assert.equal(nextOccurrence(when, after, SHANGHAI), undefined, when.kind)
})

test('unreadable input gives undefined and never throws', () => {
  const after = new Date('2026-10-30T00:00:00Z')
  assert.equal(nextOccurrence({ kind: 'daily', time: '25:00', timeZone: SHANGHAI }, after, SHANGHAI), undefined)
  assert.equal(nextOccurrence({ kind: 'daily', time: '9:30', timeZone: SHANGHAI }, after, SHANGHAI), undefined)
  assert.equal(nextOccurrence({ kind: 'daily', time: '09:30', timeZone: 'Mars/Base' }, after, SHANGHAI), undefined)
  assert.equal(nextOccurrence({ kind: 'daily', time: '09:30' }, after, 'Mars/Base'), undefined)
  assert.equal(nextOccurrence({ kind: 'weekly', time: '09:00', weekdays: [], timeZone: SHANGHAI }, after, SHANGHAI), undefined)
  assert.equal(nextOccurrence({ kind: 'weekly', time: '09:00', weekdays: [0, 8], timeZone: SHANGHAI }, after, SHANGHAI), undefined)
  assert.equal(nextOccurrence({ kind: 'daily', time: '09:30', timeZone: SHANGHAI }, new Date(Number.NaN), SHANGHAI), undefined)
})

// -------------------------------------------------------------- validateWhen

function field(name: string, type: LoopEventField['type'], filter?: LoopEventField['filter']): LoopEventField {
  return { name, type, title: name, ...(filter === undefined ? {} : { filter }) }
}
function declaration(
  id: string,
  fields: readonly LoopEventField[],
  extra: { readonly params?: readonly LoopEventParam[], readonly personSelectable?: boolean, readonly listedOnly?: boolean, readonly gateOnErrorDefault?: 'allow' | 'block' } = {},
): LoopEventDeclaration {
  const { personSelectable = true, ...rest } = extra
  return { id, title: id, fields, personSelectable, ...rest }
}
const TABLE: ReadonlyMap<string, LoopEventDeclaration> = new Map([
  declaration('hourness.handback', [field('task', 'string', 'in'), field('attempt', 'number', 'atLeast'), field('status', 'string', 'in'), field('floorHit', 'string'), field('truncated', 'boolean', 'is')]),
  declaration('hourness.review-passed', [field('task', 'string', 'in'), field('round', 'number', 'atLeast')]),
  declaration('hourness.review-skipped', [field('task', 'string', 'in')]),
  declaration('hourness.trunk-advanced', [field('files', 'strings', 'paths'), field('truncated', 'boolean', 'is')]),
  declaration('hourness.host-started', [], { personSelectable: false }),
  declaration('env.files-edited', [field('files', 'strings', 'paths'), field('root', 'string')]),
  declaration('graph.third-reopen', [], { personSelectable: false, listedOnly: true }),
  declaration('loops.waiting-on-human', [field('count', 'number', 'atLeast'), field('items', 'strings')], { params: [{ name: 'olderThanHours', type: 'number', title: 'hours', required: true, min: 1, max: 168 }] }),
  declaration('loops.file-changed', [field('path', 'string'), field('size', 'number', 'atLeast')], { params: [{ name: 'path', type: 'string', title: 'path', required: true }, { name: 'quiet', type: 'boolean', title: 'quiet', required: false }] }),
  declaration('gate.tool-call', [field('tool', 'string', 'in'), field('command', 'string', 'in'), field('targets', 'strings', 'paths'), field('glmSpend', 'boolean', 'is'), field('session', 'string', 'in')]),
  declaration('gate.trunk-advance', [field('files', 'strings', 'paths')], { gateOnErrorDefault: 'block' }),
].map(entry => [entry.id, entry] as const))

const NOW = new Date('2026-10-30T00:00:00Z')
const BASE = { allowGate: false, origin: 'person', now: NOW, action: 'tell-main' } as const
type Options = Parameters<typeof validateWhen>[3]
const check = (when: Trigger, filter?: EventFilter, options: Options = BASE): readonly TriggerIssue[] => validateWhen(when, filter, TABLE, options)
const onEvent = (...events: string[]): Trigger => ({ kind: 'event', events })

test('a hook shape pairs when, filter and an action of the board; its when and filter pass validateWhen', () => {
  const shape: HookShape<{ readonly kind: 'tell-main' }> = {
    when: { kind: 'event', events: ['hourness.handback'] },
    filter: { status: { in: ['done'] }, attempt: { atLeast: 2 } },
    action: { kind: 'tell-main' },
  }
  assert.deepEqual(check(shape.when, shape.filter), [])
})

test('event triggers: 1 to 4 events, each in the table, and a person only gets the ones marked for people', () => {
  assert.deepEqual(check(onEvent('hourness.handback')), [])
  assert.deepEqual(check(onEvent('hourness.handback', 'hourness.review-passed', 'hourness.review-skipped', 'hourness.trunk-advanced')), [])
  assert.deepEqual(paths(check(onEvent())), ['when.events'])
  assert.deepEqual(paths(check(onEvent('hourness.handback', 'hourness.review-passed', 'hourness.review-skipped', 'hourness.trunk-advanced', 'env.files-edited'))), ['when.events'])
  assert.deepEqual(paths(check(onEvent('nobody.knows'))), ['when.events'])
  assert.deepEqual(paths(check(onEvent('hourness.host-started'))), ['when.events'], 'not selectable by a person')
  assert.deepEqual(check(onEvent('hourness.host-started'), undefined, { ...BASE, origin: 'plugin' }), [])
})

test('gating events: only where allowGate is true, and a loop board entry is pointed to the rules board', () => {
  const gated = check(onEvent('gate.tool-call'))
  assert.deepEqual(paths(gated), ['when.events'])
  assert.match(gated[0]?.message ?? '', /rules_propose/)
  assert.deepEqual(paths(check(onEvent('gate.not-declared'))), ['when.events'], 'the same answer for a gate. name the table lacks')
  assert.deepEqual(check(onEvent('gate.tool-call'), undefined, { ...BASE, allowGate: true }), [])
  assert.deepEqual(check(onEvent('hourness.handback'), undefined, { ...BASE, allowGate: true }), [], 'allowGate does not forbid the other events')
})

test('a filter belongs to an event trigger', () => {
  assert.deepEqual(paths(check({ kind: 'daily', time: '09:00', timeZone: SHANGHAI }, { task: { in: ['x'] } })), ['filter'])
  assert.deepEqual(check(onEvent('hourness.handback'), {}), [])
})

test('filter keys must be fields every listed event declares, compared the way the field declares', () => {
  assert.deepEqual(check(onEvent('hourness.handback'), { task: { in: ['a'] }, attempt: { atLeast: 3 }, truncated: { is: true } }), [])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { nope: { in: ['a'] } })), ['filter.nope'])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { floorHit: { in: ['a'] } })), ['filter.floorHit'], 'a field that declares no comparison cannot be filtered')
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { attempt: { in: ['1'] } })), ['filter.attempt'], 'in on a number field')
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { atLeast: 1 } })), ['filter.task'])
  assert.deepEqual(paths(check(onEvent('hourness.trunk-advanced'), { files: { in: ['a'] } })), ['filter.files'])
  assert.deepEqual(check(onEvent('hourness.trunk-advanced'), { files: { paths: ['src/'] } }), [])
  // review-passed declares round, review-skipped does not: a key needs every listed event to declare it.
  assert.deepEqual(check(onEvent('hourness.review-passed', 'hourness.review-skipped'), { task: { in: ['t'] } }), [])
  assert.deepEqual(paths(check(onEvent('hourness.review-passed', 'hourness.review-skipped'), { round: { atLeast: 2 } })), ['filter.round'])
})

test('filter values: the right JSON type, at most 50 in-values, at most 20 path patterns, one comparison per key', () => {
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { in: Array.from({ length: 51 }, (_, index) => `t${index}`) } })), ['filter.task'])
  assert.deepEqual(check(onEvent('hourness.handback'), { task: { in: Array.from({ length: 50 }, (_, index) => `t${index}`) } }), [])
  assert.deepEqual(paths(check(onEvent('hourness.trunk-advanced'), { files: { paths: Array.from({ length: 21 }, (_, index) => `d${index}/`) } })), ['filter.files'])
  assert.deepEqual(check(onEvent('hourness.trunk-advanced'), { files: { paths: Array.from({ length: 20 }, (_, index) => `d${index}/`) } }), [])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { attempt: { atLeast: Number.NaN } })), ['filter.attempt'])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { truncated: { is: 'yes' } } as unknown as EventFilter)), ['filter.truncated'])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { in: [1, 2] } } as unknown as EventFilter)), ['filter.task'])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: {} } as unknown as EventFilter)), ['filter.task'])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { in: ['a'], matches: 'a' } })), ['filter.task'], 'two comparisons in one test')
})

test('matches: allowed on a string field declared as in, compiled when written, at most 300 characters', () => {
  assert.deepEqual(check(onEvent('gate.tool-call'), { command: { matches: '^npm\\s+install\\b' } }, { ...BASE, allowGate: true }), [])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { attempt: { matches: '1' } })), ['filter.attempt'], 'not on a number field')
  assert.deepEqual(paths(check(onEvent('hourness.trunk-advanced'), { files: { matches: 'a' } })), ['filter.files'], 'not on a strings field')
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { matches: '(' } })), ['filter.task'], 'does not compile')
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { matches: '' } })), ['filter.task'], 'empty')
  assert.deepEqual(check(onEvent('hourness.handback'), { task: { matches: 'a'.repeat(300) } }), [])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), { task: { matches: 'a'.repeat(301) } })), ['filter.task'])
})

test('matches: a regex that takes more than 50 ms on the fixed long inputs is invalid, a plain one passes', () => {
  const started = Date.now()
  const slow = ['(a+)+$', '(a|aa)+$', '^(a*)*b', '(x+x+)+y', '(.*a){12}x', '.*.*.*.*=.*=.*!']
  for (const pattern of slow) {
    const issues = check(onEvent('hourness.handback'), { task: { matches: pattern } })
    assert.deepEqual(paths(issues), ['filter.task'], pattern)
    assert.match(issues[0]?.message ?? '', /太慢/, pattern)
  }
  const fine = ['^npm\\s+install\\b', 'rm\\s+-rf\\s+/', '\\.env$', '^git\\s+push\\b.*--force', 'curl .*\\|\\s*(sh|bash)', '(^|[\\\\/])\\.env(\\.|$)', 'DROP\\s+TABLE', '[a-z]+@[a-z]+\\.com']
  for (const pattern of fine) assert.deepEqual(check(onEvent('hourness.handback'), { task: { matches: pattern } }), [], pattern)
  assert.ok(Date.now() - started < 20_000, 'the probe stops at the first input that is too slow')
})

test('params: the declared names only, required ones present, the declared type, numbers within min and max', () => {
  const waiting = (params: EventParams): Trigger => ({ kind: 'event', events: ['loops.waiting-on-human'], params })
  assert.deepEqual(check(waiting({ olderThanHours: 24 })), [])
  assert.deepEqual(check(waiting({ olderThanHours: 1 })), [])
  assert.deepEqual(check(waiting({ olderThanHours: 168 })), [])
  assert.deepEqual(paths(check(waiting({}))), ['when.params.olderThanHours'], 'required')
  assert.deepEqual(paths(check(waiting({ olderThanHours: 0 }))), ['when.params.olderThanHours'])
  assert.deepEqual(paths(check(waiting({ olderThanHours: 169 }))), ['when.params.olderThanHours'])
  assert.deepEqual(paths(check(waiting({ olderThanHours: '24' }))), ['when.params.olderThanHours'], 'string for a number')
  assert.deepEqual(paths(check(waiting({ olderThanHours: Number.NaN }))), ['when.params.olderThanHours'])
  assert.deepEqual(paths(check(waiting({ olderThanHours: 24, extra: 1 }))), ['when.params.extra'], 'not declared')
  assert.deepEqual(check({ kind: 'event', events: ['loops.file-changed'], params: { path: '/work/app/docs', quiet: true } }), [])
  assert.deepEqual(paths(check({ kind: 'event', events: ['loops.file-changed'], params: { path: '/work/app/docs', quiet: 'no' } })), ['when.params.quiet'])
  assert.deepEqual(paths(check({ kind: 'event', events: ['loops.file-changed'], params: { path: '' } })), ['when.params.path'])
  assert.deepEqual(paths(check(onEvent('hourness.handback'), undefined)), [])
  assert.deepEqual(paths(check({ kind: 'event', events: ['hourness.handback'], params: { x: 1 } })), ['when.params.x'], 'an event without params takes none')
})

test('once: strictly in the future, at most one year out, a real calendar moment with an offset', () => {
  const once = (at: string): Trigger => ({ kind: 'once', at })
  assert.deepEqual(check(once('2026-10-30T00:00:01Z')), [])
  assert.deepEqual(check(once('2026-10-30T09:00:00+08:00')), [])
  assert.deepEqual(check(once('2027-10-30T00:00:00Z')), [], 'exactly one year out')
  assert.deepEqual(paths(check(once('2026-10-30T00:00:00Z'))), ['when.at'], 'now is not in the future')
  assert.deepEqual(paths(check(once('2026-10-29T23:59:59Z'))), ['when.at'])
  assert.deepEqual(paths(check(once('2027-10-30T00:00:01Z'))), ['when.at'], 'more than a year out')
  assert.deepEqual(paths(check(once('2026-11-01T09:00:00'))), ['when.at'], 'no offset')
  assert.deepEqual(paths(check(once('2026-02-30T09:00:00Z'))), ['when.at'], 'a day the month does not have')
  assert.deepEqual(paths(check(once('2026-11-01T24:00:00Z'))), ['when.at'])
  assert.deepEqual(paths(check(once('soon'))), ['when.at'])
})

test('every: a whole number of seconds from 600 when it tells the main agent, from 300 otherwise, to 31,536,000', () => {
  const every = (seconds: number): Trigger => ({ kind: 'every', seconds })
  assert.deepEqual(check(every(600)), [])
  assert.deepEqual(paths(check(every(599))), ['when.seconds'])
  assert.deepEqual(check(every(300), undefined, { ...BASE, action: 'work' }), [])
  assert.deepEqual(paths(check(every(299), undefined, { ...BASE, action: 'work' })), ['when.seconds'])
  assert.deepEqual(check(every(300), undefined, { ...BASE, action: 'self', origin: 'plugin' }), [])
  assert.deepEqual(check(every(31_536_000)), [])
  assert.deepEqual(paths(check(every(31_536_001))), ['when.seconds'])
  for (const seconds of [Number.NaN, 1.5, -600, Number.POSITIVE_INFINITY]) assert.deepEqual(paths(check(every(seconds))), ['when.seconds'], String(seconds))
})

test('daily and weekly: HH:MM, a time zone Intl knows (a person always writes one), distinct ISO weekdays', () => {
  const daily = (time: string, timeZone?: string): Trigger => timeZone === undefined ? { kind: 'daily', time } : { kind: 'daily', time, timeZone }
  assert.deepEqual(check(daily('00:00', SHANGHAI)), [])
  assert.deepEqual(check(daily('23:59', NEW_YORK)), [])
  for (const time of ['24:00', '9:30', '09:60', '0930', '']) assert.deepEqual(paths(check(daily(time, SHANGHAI))), ['when.time'], time)
  assert.deepEqual(paths(check(daily('09:00'))), ['when.timeZone'], 'a person always writes the zone')
  assert.deepEqual(check(daily('09:00'), undefined, { ...BASE, origin: 'plugin' }), [], 'a plugin may leave it to the system zone')
  assert.deepEqual(paths(check(daily('09:00', 'Mars/Base'))), ['when.timeZone'])
  assert.deepEqual(paths(check(daily('09:00', 'Mars/Base'), undefined, { ...BASE, origin: 'plugin' })), ['when.timeZone'])
  const weekly = (weekdays: readonly number[]): Trigger => ({ kind: 'weekly', time: '09:00', weekdays, timeZone: SHANGHAI })
  assert.deepEqual(check(weekly([1, 7])), [])
  assert.deepEqual(paths(check(weekly([]))), ['when.weekdays'])
  assert.deepEqual(paths(check(weekly([0]))), ['when.weekdays'])
  assert.deepEqual(paths(check(weekly([8]))), ['when.weekdays'])
  assert.deepEqual(paths(check(weekly([1, 1]))), ['when.weekdays'])
  assert.deepEqual(paths(check(weekly([1.5]))), ['when.weekdays'])
})

test('cron: five fields, at most 100 characters, only when the entry tells the main agent', () => {
  const cron = (expression: string): Trigger => ({ kind: 'cron', expression, timeZone: SHANGHAI })
  assert.deepEqual(check(cron('0 9 * * 1-5')), [])
  assert.deepEqual(check(cron('*/15   9-17 * * *')), [], 'any run of whitespace between fields')
  assert.deepEqual(paths(check(cron('0 9 * *'))), ['when.expression'])
  assert.deepEqual(paths(check(cron('0 0 9 * * *'))), ['when.expression'])
  assert.deepEqual(paths(check(cron(`0 ${'9,'.repeat(60)}9 * * *`))), ['when.expression'], 'over 100 characters')
  assert.deepEqual(paths(check(cron('0 9 * * 1-5'), undefined, { ...BASE, action: 'work' })), ['when'], 'cron only fits telling the main agent')
  assert.deepEqual(paths(check({ kind: 'cron', expression: '0 9 * * *', timeZone: 'Mars/Base' })), ['when.timeZone'])
})

test('command triggers belong to the self entries a plugin hands over', () => {
  const command = (...names: string[]): Trigger => ({ kind: 'command', names })
  const SELF = { ...BASE, origin: 'plugin', action: 'self' } as const
  assert.deepEqual(check(command('glm-status', 'hourness'), undefined, SELF), [])
  assert.deepEqual(paths(check(command('glm-status'), undefined, { ...SELF, action: 'work' })), ['when'])
  assert.deepEqual(paths(check(command('glm-status'), undefined, { ...SELF, origin: 'person' })), ['when'])
  assert.deepEqual(paths(check(command(), undefined, SELF)), ['when.names'])
  assert.deepEqual(paths(check(command(...Array.from({ length: 9 }, (_, index) => `c${index}`)), undefined, SELF)), ['when.names'])
  assert.deepEqual(paths(check(command('Glm_Status'), undefined, SELF)), ['when.names'])
  assert.deepEqual(paths(check(command('a'.repeat(33)), undefined, SELF)), ['when.names'])
})

test('an event that is only listed (the host does it) fits a self entry and nothing else', () => {
  const SELF = { ...BASE, origin: 'plugin', action: 'self' } as const
  assert.deepEqual(check(onEvent('graph.third-reopen'), undefined, SELF), [])
  assert.deepEqual(paths(check(onEvent('graph.third-reopen'), undefined, { ...SELF, action: 'work' })), ['when.events'])
  assert.deepEqual(paths(check(onEvent('graph.third-reopen'), undefined, { ...SELF, action: 'tell-main' })), ['when.events'])
})

test('validateWhen reports every problem it finds and does not throw on a trigger of the wrong shape', () => {
  const several = check(onEvent('nobody.knows', 'hourness.handback'), { nope: { in: ['a'] }, attempt: { in: ['1'] } })
  assert.deepEqual(paths(several), ['when.events', 'filter.nope', 'filter.attempt'])
  assert.ok(several.every(issue => issue.message.length > 0))
  const strange = [undefined, null, 5, {}, { kind: 'sometimes' }, { kind: 'event' }, { kind: 'event', events: 'x' }, { kind: 'once' }, { kind: 'weekly', time: 5 }]
  for (const when of strange) {
    const issues = check(when as unknown as Trigger)
    assert.ok(issues.length > 0, JSON.stringify(when))
  }
})

// ------------------------------------------------------------- matchesFilter

const PROJECT = '/work/app'
const WIN_PROJECT = 'C:/work/app'
const files = (...list: string[]): Readonly<Record<string, unknown>> => ({ files: list })
const hit = (pattern: string, ...list: string[]): boolean => matchesFilter({ files: { paths: [pattern] } }, files(...list), PROJECT)

test('no filter and an empty filter pass every payload; every key must pass', () => {
  assert.equal(matchesFilter(undefined, { a: 1 }, PROJECT), true)
  assert.equal(matchesFilter({}, { a: 1 }, PROJECT), true)
  const both: EventFilter = { status: { in: ['done'] }, attempt: { atLeast: 2 } }
  assert.equal(matchesFilter(both, { status: 'done', attempt: 2 }, PROJECT), true)
  assert.equal(matchesFilter(both, { status: 'done', attempt: 1 }, PROJECT), false)
  assert.equal(matchesFilter(both, { status: 'stopped', attempt: 5 }, PROJECT), false)
})

test('in, is and atLeast compare the payload value of the same type and nothing looser', () => {
  const pass = (comparison: FilterTest, value?: unknown): boolean => matchesFilter({ x: comparison }, value === undefined ? {} : { x: value }, PROJECT)
  assert.equal(pass({ in: ['done', 'stopped'] }, 'stopped'), true)
  assert.equal(pass({ in: ['done'] }, 'Done'), false, 'case-sensitive')
  assert.equal(pass({ in: ['1'] }, 1), false)
  assert.equal(pass({ in: ['done'] }), false, 'a missing field does not pass')
  assert.equal(pass({ is: true }, true), true)
  assert.equal(pass({ is: false }, true), false)
  assert.equal(pass({ is: true }, 'true'), false)
  assert.equal(pass({ atLeast: 10 }, 10), true)
  assert.equal(pass({ atLeast: 10 }, 9.99), false)
  assert.equal(pass({ atLeast: 10 }, '12'), false)
  assert.equal(pass({ atLeast: 10 }, Number.NaN), false)
})

test('matches: case-insensitive, and only the first 8 KiB of the value is looked at', () => {
  const filter: EventFilter = { command: { matches: '^npm\\s+install\\b' } }
  assert.equal(matchesFilter(filter, { command: 'NPM   Install left-pad' }, PROJECT), true)
  assert.equal(matchesFilter(filter, { command: 'npx install' }, PROJECT), false)
  assert.equal(matchesFilter({ command: { matches: 'needle' } }, { command: `${'x'.repeat(8186)}needle` }, PROJECT), true, 'ends exactly at 8192')
  assert.equal(matchesFilter({ command: { matches: 'needle' } }, { command: `${'x'.repeat(8187)}needle` }, PROJECT), false, 'one character past the window')
  assert.equal(matchesFilter({ command: { matches: 'needle' } }, { command: `needle${'x'.repeat(9000)}` }, PROJECT), true)
  assert.equal(matchesFilter(filter, { command: 5 }, PROJECT), false)
  assert.equal(matchesFilter(filter, {}, PROJECT), false)
})

test('a filter that was never validated does not throw: it just does not pass', () => {
  assert.equal(matchesFilter({ command: { matches: '(' } }, { command: 'x' }, PROJECT), false)
  assert.equal(matchesFilter({ command: { bogus: 1 } } as unknown as EventFilter, { command: 'x' }, PROJECT), false)
  assert.equal(matchesFilter({ command: null } as unknown as EventFilter, { command: 'x' }, PROJECT), false)
  assert.equal(matchesFilter({ files: { paths: 'src/' } } as unknown as EventFilter, files('src/a.ts'), PROJECT), false)
  assert.equal(matchesFilter({ a: { in: ['x'] } }, null as unknown as Record<string, unknown>, PROJECT), false)
})

test('paths: a trailing slash is a directory prefix from the project root', () => {
  assert.equal(hit('src/', 'src/a.ts'), true)
  assert.equal(hit('src/', 'src/deep/er/a.ts'), true)
  assert.equal(hit('src/', 'src2/a.ts'), false)
  assert.equal(hit('src/', 'lib/src/a.ts'), false, 'from the root, not at any depth')
  assert.equal(hit('docs/rules/', 'docs/rules/rules.json'), true)
  assert.equal(hit('docs/rules/', 'docs/rule/x.json'), false)
})

test('paths: a name with a slash is one file relative to the project', () => {
  assert.equal(hit('docs/setup.md', 'docs/setup.md'), true)
  assert.equal(hit('docs/setup.md', 'x/docs/setup.md'), false)
  assert.equal(hit('docs/setup.md', 'docs/setup.md.bak'), false)
  assert.equal(hit('docs/setup.md', 'docs'), false)
})

test('paths: a bare name matches a file of that name at any depth', () => {
  assert.equal(hit('package.json', 'package.json'), true)
  assert.equal(hit('package.json', 'packages/glm/package.json'), true)
  assert.equal(hit('package.json', 'package.json5'), false)
  assert.equal(hit('package.json', 'mypackage.json'), false)
  assert.equal(hit('*.ts', 'a.ts'), true)
  assert.equal(hit('*.ts', 'src/deep/a.ts'), true)
  assert.equal(hit('*.ts', 'a.tsx'), false)
})

test('paths: * stays inside one path segment', () => {
  assert.equal(hit('src/*.ts', 'src/a.ts'), true)
  assert.equal(hit('src/*.ts', 'src/x/a.ts'), false)
  assert.equal(hit('src/*/index.ts', 'src/graph/index.ts'), true)
  assert.equal(hit('src/*/index.ts', 'src/graph/deep/index.ts'), false)
  assert.equal(hit('src/a*b.ts', 'src/aXYb.ts'), true)
  assert.equal(hit('src/a*b.ts', 'src/ab.ts'), true)
  assert.equal(hit('src/a*b.ts', 'src/a/b.ts'), false)
})

test('paths: ** as a whole segment matches zero or more directories', () => {
  assert.equal(hit('docs/**/*.md', 'docs/setup.md'), true, 'zero directories')
  assert.equal(hit('docs/**/*.md', 'docs/a/setup.md'), true)
  assert.equal(hit('docs/**/*.md', 'docs/a/b/c/setup.md'), true)
  assert.equal(hit('docs/**/*.md', 'docs/a/setup.txt'), false)
  assert.equal(hit('docs/**/*.md', 'other/docs/setup.md'), false)
  assert.equal(hit('**/x.json', 'x.json'), true, 'zero directories')
  assert.equal(hit('**/x.json', 'a/b/x.json'), true)
  assert.equal(hit('**/x.json', 'a/xx.json'), false)
  assert.equal(hit('src/**/', 'src/a/b.ts'), true)
  assert.equal(hit('docs/**', 'docs/a/b.md'), true, 'a trailing ** takes everything below')
  assert.equal(hit('docs/**', 'other/b.md'), false)
})

test('paths: ** that is not a whole segment behaves like *', () => {
  assert.equal(hit('src/a**b.ts', 'src/aXb.ts'), true)
  assert.equal(hit('src/a**b.ts', 'src/a/b.ts'), false, 'does not cross a slash')
  assert.equal(hit('src/a**b.ts', 'src/a/x/b.ts'), false)
})

test('paths: any listed path against any pattern, relative or absolute paths under the project, backslashes included', () => {
  assert.equal(hit('src/', 'README.md', 'src/a.ts'), true)
  assert.equal(hit('src/', 'README.md', 'docs/a.md'), false)
  assert.equal(matchesFilter({ files: { paths: ['src/', 'docs/'] } }, files('docs/x.md'), PROJECT), true, 'any pattern')
  assert.equal(matchesFilter({ files: { paths: [] } }, files('docs/x.md'), PROJECT), false)
  assert.equal(matchesFilter({ files: { paths: ['src/'] } }, files(), PROJECT), false)
  assert.equal(hit('src/', '/work/app/src/a.ts'), true, 'an absolute path under the project root')
  assert.equal(hit('src/', '/work/application/src/a.ts'), false, 'a sibling that only shares the prefix')
  assert.equal(matchesFilter({ files: { paths: ['src/'] } }, files('C:\\work\\app\\src\\a.ts'), WIN_PROJECT), true, 'Windows separators')
  assert.equal(matchesFilter({ files: { paths: ['src/'] } }, files('c:\\Work\\App\\src\\a.ts'), WIN_PROJECT), true, 'a Windows drive path ignores case')
  assert.equal(matchesFilter({ files: { paths: ['src/'] } }, files('.\\src\\a.ts'), WIN_PROJECT), true, 'a leading ./')
  assert.equal(matchesFilter({ files: { paths: ['docs/setup.md'] } }, files('docs\\setup.md'), PROJECT), true)
  assert.equal(matchesFilter({ files: { paths: ['src/'] } }, { files: ['src/a.ts', 5] }, PROJECT), true, 'a non-string entry is skipped')
  assert.equal(matchesFilter({ files: { paths: ['src/'] } }, { files: 'src/a.ts' }, PROJECT), false, 'the field must be a list')
})

// ---------------------------------------------- effectiveTimeoutSeconds

test('no estimate and no runs: the ceiling of the purpose', () => {
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [], purpose: 'gate' }), { seconds: 30, source: 'ceiling', capped: false })
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [], purpose: 'work' }), { seconds: 1800, source: 'ceiling', capped: false })
})

test('an estimate alone is the timeout, raised to the smallest the entry allows and cut at the ceiling', () => {
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 12, recent: [], purpose: 'gate' }), { seconds: 12, source: 'estimate', capped: false })
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 600, recent: [], purpose: 'work' }), { seconds: 600, source: 'estimate', capped: false })
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 30, recent: [], purpose: 'gate' }), { seconds: 30, source: 'estimate', capped: false })
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 45, recent: [], purpose: 'gate' }), { seconds: 30, source: 'estimate', capped: true })
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 5000, recent: [], purpose: 'work' }), { seconds: 1800, source: 'estimate', capped: true })
  assert.equal(effectiveTimeoutSeconds({ estimate: 2.2, recent: [], purpose: 'gate' }).seconds, 3, 'whole seconds, rounded up')
  assert.equal(effectiveTimeoutSeconds({ estimate: 0.4, recent: [], purpose: 'gate' }).seconds, 1, 'a gate timeout is at least 1 second')
  assert.equal(effectiveTimeoutSeconds({ estimate: 2, recent: [], purpose: 'work' }).seconds, 5, 'a work timeout is at least 5 seconds')
})

test('with runs: three times the slowest, never above the ceiling, capped says when the ceiling cut it', () => {
  const runs = [{ runId: 'r1', seconds: 4 }, { runId: 'r2', seconds: 6 }, { runId: 'r3', seconds: 5 }]
  assert.deepEqual(effectiveTimeoutSeconds({ recent: runs, purpose: 'gate' }), { seconds: 18, source: ['r1', 'r2', 'r3'], capped: false })
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 10 }], purpose: 'gate' }), { seconds: 30, source: ['r1'], capped: false }, 'exactly the ceiling is not capped')
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 11 }], purpose: 'gate' }), { seconds: 30, source: ['r1'], capped: true })
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [{ runId: 'r9', seconds: 700 }], purpose: 'work' }), { seconds: 1800, source: ['r9'], capped: true })
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 120 }], purpose: 'work' }), { seconds: 360, source: ['r1'], capped: false })
  assert.equal(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 1.2 }], purpose: 'gate' }).seconds, 4, '3.6 rounds up')
  assert.equal(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 0.5 }], purpose: 'work' }).seconds, 5, 'a fast script still gets the smallest work timeout')
  assert.equal(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 0 }], purpose: 'gate' }).seconds, 1)
})

test('once there are runs they replace the estimate', () => {
  const decision: TimeoutDecision = effectiveTimeoutSeconds({ estimate: 25, recent: [{ runId: 'r1', seconds: 2 }], purpose: 'gate' })
  assert.deepEqual(decision, { seconds: 6, source: ['r1'], capped: false })
})

test('bad numbers count as absent and never throw: negative, NaN, infinite, the wrong type, a missing list', () => {
  const bad = [Number.NaN, -1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, '12', null, {}]
  bad.forEach((estimate, index) => {
    assert.deepEqual(effectiveTimeoutSeconds({ estimate: estimate as number, recent: [], purpose: 'gate' }), { seconds: 30, source: 'ceiling', capped: false }, `bad estimate #${index}`)
  })
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 0, recent: [], purpose: 'gate' }), { seconds: 30, source: 'ceiling', capped: false }, 'an estimate of zero is no estimate')
  const mixed = [{ runId: 'bad1', seconds: Number.NaN }, { runId: 'bad2', seconds: -3 }, { runId: 'bad3', seconds: Number.POSITIVE_INFINITY }, { runId: 'good', seconds: 4 }]
  assert.deepEqual(effectiveTimeoutSeconds({ recent: mixed, purpose: 'gate' }), { seconds: 12, source: ['good'], capped: false }, 'bad runs are left out of the decision and of its source')
  assert.deepEqual(effectiveTimeoutSeconds({ estimate: 8, recent: mixed.slice(0, 3), purpose: 'gate' }), { seconds: 8, source: 'estimate', capped: false }, 'only bad runs: back to the estimate')
  assert.deepEqual(effectiveTimeoutSeconds({ recent: mixed.slice(0, 3), purpose: 'work' }), { seconds: 1800, source: 'ceiling', capped: false })
  const garbage = [null, undefined, 5, 'r1', {}, { runId: 7, seconds: 3 }, { runId: 'x' }, { seconds: 3 }, { runId: 'ok', seconds: '3' }, { runId: 'fine', seconds: 2 }]
  assert.deepEqual(effectiveTimeoutSeconds({ recent: garbage as never, purpose: 'gate' }), { seconds: 6, source: ['fine'], capped: false })
  const notLists: readonly unknown[] = [undefined, null, 'r1', 5, {}]
  notLists.forEach((recent, index) => {
    assert.deepEqual(effectiveTimeoutSeconds({ recent: recent as never, purpose: 'work' }), { seconds: 1800, source: 'ceiling', capped: false }, `not a list #${index}`)
  })
})

test('previous is carried through when it is a real number and left out otherwise; the input is not changed', () => {
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [{ runId: 'r1', seconds: 4 }], purpose: 'gate', previous: 20 }), { seconds: 12, source: ['r1'], capped: false, previous: 20 })
  assert.deepEqual(effectiveTimeoutSeconds({ recent: [], purpose: 'work', previous: 90 }), { seconds: 1800, source: 'ceiling', capped: false, previous: 90 })
  for (const previous of [Number.NaN, -2, Number.POSITIVE_INFINITY, '20']) {
    assert.equal('previous' in effectiveTimeoutSeconds({ recent: [], purpose: 'gate', previous: previous as number }), false, String(previous))
  }
  assert.equal('previous' in effectiveTimeoutSeconds({ recent: [], purpose: 'gate' }), false)
  const input: TimeoutInput = { recent: [{ runId: 'r1', seconds: 4 }], purpose: 'gate', estimate: 9 }
  const before = JSON.stringify(input)
  effectiveTimeoutSeconds(input)
  assert.equal(JSON.stringify(input), before)
})

// ------------------------------------------------------ validateScriptAction

const NODE: ScriptLang = 'node'
const REF: ScriptRef = { file: 'docs/loops/scripts/u-0123abcd.mjs', sha256: '0'.repeat(64), lang: NODE }
const script = (extra: { readonly timeoutSeconds?: number, readonly onError?: 'allow' | 'block' } = {}): ScriptAction => ({ kind: 'script', script: REF, ...extra })

test('a script action on a gating event: timeout 1 to 30 whole seconds, onError allow or block with the declared default', () => {
  const gate: ScriptTimingContext = { purpose: 'gate' }
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 10 }), gate), { ok: true, timing: { timeoutSeconds: 10, onError: 'allow' } })
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 1 }), gate), { ok: true, timing: { timeoutSeconds: 1, onError: 'allow' } })
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 30 }), gate), { ok: true, timing: { timeoutSeconds: 30, onError: 'allow' } })
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 10 }), { ...gate, gateOnErrorDefault: 'block' }), { ok: true, timing: { timeoutSeconds: 10, onError: 'block' } }, 'the event declares block')
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 10, onError: 'allow' }), { ...gate, gateOnErrorDefault: 'block' }), { ok: true, timing: { timeoutSeconds: 10, onError: 'allow' } }, 'the entry wins')
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 10, onError: 'block' }), gate), { ok: true, timing: { timeoutSeconds: 10, onError: 'block' } })
  for (const timeoutSeconds of [0, 31, 1.5, -4, Number.NaN]) {
    const result = validateScriptAction(script({ timeoutSeconds }), gate)
    assert.equal(result.ok, false, String(timeoutSeconds))
    if (!result.ok) assert.deepEqual(paths(result.issues), ['action.timeoutSeconds'])
  }
  const wrongType = validateScriptAction({ kind: 'script', script: REF, timeoutSeconds: '10' } as unknown as ScriptAction, gate)
  assert.deepEqual(wrongType.ok ? [] : paths(wrongType.issues), ['action.timeoutSeconds'])
})

test('a script action elsewhere: timeout 5 to 1800 whole seconds, and no onError (only gating events have one)', () => {
  const work: ScriptTimingContext = { purpose: 'work' }
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 5 }), work), { ok: true, timing: { timeoutSeconds: 5 } })
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 1800 }), work), { ok: true, timing: { timeoutSeconds: 1800 } })
  for (const timeoutSeconds of [4, 1801, 60.5]) {
    const result = validateScriptAction(script({ timeoutSeconds }), work)
    assert.equal(result.ok, false, String(timeoutSeconds))
    if (!result.ok) assert.deepEqual(paths(result.issues), ['action.timeoutSeconds'])
  }
  const withOnError = validateScriptAction(script({ timeoutSeconds: 60, onError: 'allow' }), work)
  assert.deepEqual(withOnError.ok ? [] : paths(withOnError.issues), ['action.onError'])
  const bogus = validateScriptAction({ kind: 'script', script: REF, onError: 'maybe' } as unknown as ScriptAction, { purpose: 'gate' })
  assert.deepEqual(bogus.ok ? [] : paths(bogus.issues), ['action.onError'])
})

test('a timeout the entry does not write is filled by effectiveTimeoutSeconds: the estimate if there is one, the ceiling if not', () => {
  const unwritten = validateScriptAction(script(), { purpose: 'gate' })
  const timing: ScriptTiming | undefined = unwritten.ok ? unwritten.timing : undefined
  assert.equal(timing?.filled?.source, 'ceiling', 'the filled decision says where the value came from')
  assert.deepEqual(validateScriptAction(script(), { purpose: 'gate' }), {
    ok: true,
    timing: { timeoutSeconds: 30, onError: 'allow', filled: { seconds: 30, source: 'ceiling', capped: false } },
  })
  assert.deepEqual(validateScriptAction(script(), { purpose: 'gate', estimateSeconds: 8, gateOnErrorDefault: 'block' }), {
    ok: true,
    timing: { timeoutSeconds: 8, onError: 'block', filled: { seconds: 8, source: 'estimate', capped: false } },
  })
  assert.deepEqual(validateScriptAction(script(), { purpose: 'work', estimateSeconds: 9000 }), {
    ok: true,
    timing: { timeoutSeconds: 1800, filled: { seconds: 1800, source: 'estimate', capped: true } },
  })
  assert.deepEqual(validateScriptAction(script(), { purpose: 'work' }), {
    ok: true,
    timing: { timeoutSeconds: 1800, filled: { seconds: 1800, source: 'ceiling', capped: false } },
  })
  assert.deepEqual(validateScriptAction(script({ timeoutSeconds: 20 }), { purpose: 'gate', estimateSeconds: 8 }), { ok: true, timing: { timeoutSeconds: 20, onError: 'allow' } }, 'a written timeout wins and nothing is filled')
})

