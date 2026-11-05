/**
 * The execute row's loop-board tables (M7 design 0.6 §2.5, §3.11.1): the
 * nine events and seven default entries go through the loop board's own
 * `validateEntry` with zero issues, the referenced events, actions and
 * placeholders all resolve, every word to the main agent wakes it, and the
 * loop link's contribution passes the board's `validateContribution` whole.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateEntry, type EntryContext } from '../src/loops/model.ts'
import type { LoopEventDeclaration } from '../src/loops/trigger.ts'
import { EXECUTE_ACTIONS, EXECUTE_ENTRIES, EXECUTE_EVENTS } from '../src/execute/entries.ts'
import { createGraphCache } from '../src/execute/dispatch.ts'
import { createLoopLink } from '../src/execute/loop-link.ts'
import { LOOP_EVENT_TABLE } from '../src/loops/events.ts'
import { validateContribution } from '../src/loops/registry.ts'

const TABLE = new Map<string, LoopEventDeclaration>(EXECUTE_EVENTS.map(event => [event.id, event]))
const ACTIONS = new Set(EXECUTE_ACTIONS.map(action => action.id))
const context = (): EntryContext => ({ table: TABLE, now: new Date('2026-11-02T01:00:00Z'), actions: ACTIONS })

test('the events and the actions are sound tables: unique ids, action titles', () => {
  assert.equal(new Set(EXECUTE_EVENTS.map(event => event.id)).size, EXECUTE_EVENTS.length)
  assert.equal(new Set(EXECUTE_ACTIONS.map(action => action.id)).size, EXECUTE_ACTIONS.length)
  for (const event of EXECUTE_EVENTS) {
    assert.equal(event.personSelectable, true, event.id)
    assert.ok(event.title.length >= 1 && event.title.length <= 60, event.id)
  }
  for (const action of EXECUTE_ACTIONS) {
    assert.ok(action.title.length >= 1 && action.title.length <= 60, action.id)
  }
})

test('all seven default entries pass the loop board validation with zero issues', () => {
  for (const entry of EXECUTE_ENTRIES) {
    const issues = validateEntry(entry, 'plugin', context())
    assert.deepEqual(issues, [], entry.id)
  }
})

test('entries only name events the execute row declares, actions the execute row lists', () => {
  for (const entry of EXECUTE_ENTRIES) {
    assert.ok(entry.when.kind === 'event')
    for (const id of entry.when.events) {
      assert.ok(TABLE.has(id), `${entry.id} names unknown event ${id}`)
    }
    if (entry.action.kind === 'harness') {
      assert.ok(ACTIONS.has(entry.action.action), `${entry.id} names unknown action ${entry.action.action}`)
    }
  }
})

test('every tell to the main agent wakes it, and no wake field is false', () => {
  const tells: { readonly entry: string, readonly where: string, readonly text: string, readonly wake: boolean }[] = []
  for (const entry of EXECUTE_ENTRIES) {
    if (entry.action.kind === 'tell-main') tells.push({ entry: entry.id, where: 'action', text: entry.action.text, wake: entry.action.wake })
    if (entry.action.kind === 'harness' && entry.action.tell !== undefined) {
      tells.push({ entry: entry.id, where: 'action.tell', text: entry.action.tell.text, wake: entry.action.tell.wake })
    }
  }
  assert.ok(tells.length >= 4)
  for (const tell of tells) {
    assert.equal(tell.wake, true, `${tell.entry}.${tell.where} must wake`)
    assert.ok(tell.text.length >= 1 && tell.text.length <= 2000)
  }
})

test('the loop link hands these three tables over with a run, and the board\u2019s validateContribution keeps every item under glm-hourness/execute (§2.5 point 1)', () => {
  const link = createLoopLink({ lookup: { get: () => undefined }, execDir: root => root, graphDirOfRoot: root => root, cache: createGraphCache(() => {}), report: () => {}, actions: {}, notesChanged: () => {} })
  const { contribution } = link
  assert.equal(contribution.events, EXECUTE_EVENTS)
  assert.equal(contribution.entries, EXECUTE_ENTRIES)
  assert.equal(contribution.actions, EXECUTE_ACTIONS)
  assert.equal(typeof contribution.run, 'function')
  const check = validateContribution({ plugin: 'dsh-hourness', row: 'glm-hourness/execute' }, contribution, { table: LOOP_EVENT_TABLE, owners: new Map(), now: new Date('2026-11-02T01:00:00Z') })
  assert.ok(check.ok, check.ok ? '' : check.reason)
  assert.deepEqual(check.dropped, [])
  assert.deepEqual(check.events.map(event => event.id), EXECUTE_EVENTS.map(event => event.id))
  assert.deepEqual(check.actions.map(action => action.id), EXECUTE_ACTIONS.map(action => action.id))
  assert.deepEqual(check.entries.map(entry => entry.definition.id), EXECUTE_ENTRIES.map(entry => entry.id))
  assert.ok(check.entries.every(entry => entry.waitingOn.length === 0), 'an entry waits for an event nobody declares')
  link.dispose()
})

test('the debounces and hourly caps follow the table of §3.11.1', () => {
  const byId = new Map(EXECUTE_ENTRIES.map(entry => [entry.id, entry]))
  const limitOf = (id: string): { readonly debounceSeconds?: number, readonly maxPerHour?: number } => byId.get(id)?.limits ?? {}
  assert.deepEqual(limitOf('execute.release'), { debounceSeconds: 5, maxPerHour: 30 })
  assert.deepEqual(limitOf('execute.trunk'), { debounceSeconds: 30, maxPerHour: 30 })
  assert.deepEqual(limitOf('execute.restart'), { debounceSeconds: 5, maxPerHour: 6 })
  for (const id of ['execute.handback', 'execute.reviewed', 'execute.stopped', 'execute.tasks-closed']) {
    assert.deepEqual(limitOf(id), { debounceSeconds: 5, maxPerHour: 30 }, id)
  }
})
