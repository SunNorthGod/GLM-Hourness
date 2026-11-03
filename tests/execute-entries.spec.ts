/**
 * The execute row's loop-board tables (M7 design 0.6 §2.5, §3.11.1): the
 * nine events and seven default entries go through the loop board's own
 * `validateEntry` with zero issues, the referenced events, actions and
 * placeholders all resolve, and every word to the main agent wakes it.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateEntry, type EntryContext } from '../src/loops/model.ts'
import type { LoopEventDeclaration } from '../src/loops/trigger.ts'
import { EXECUTE_ACTIONS, EXECUTE_ENTRIES, EXECUTE_EVENTS } from '../src/execute/entries.ts'

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
