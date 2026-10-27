import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTodoReminderBody, formatTodoListForReminder, initialReminderState, observeToolCall, shouldRemind } from '../src/glm-prompt/todo-reminder.ts'

const todos = [{ content: 'write spec', status: 'in_progress' }, { content: 'ship it', status: 'pending' }]

test('echo formats as official N. [status] content inside brackets', () => {
  assert.deepEqual(formatTodoListForReminder(todos), ['1. [in_progress] write spec', '2. [pending] ship it'])
  const body = buildTodoReminderBody(todos)
  assert.ok(body.includes("Here are the existing contents of your todo list:\n\n[1. [in_progress] write spec\n2. [pending] ship it]"))
})

test('empty todo list yields the bare nudge', () => {
  const body = buildTodoReminderBody([])
  assert.equal(body.split('\n').length, 1)
  assert.ok(body.startsWith("The TodoWrite tool hasn't been used recently."))
})

test('fires exactly at the 10/10 double threshold', () => {
  let state = initialReminderState()
  let reminder: string | undefined
  for (let i = 0; i < 9; i++) state = observeToolCall(state, 'Read').state
  assert.equal(shouldRemind(state), false)
  const result = observeToolCall(state, 'Read') // 10th call
  assert.ok(result.reminder !== undefined && result.reminder.includes("hasn't been used"))
})

test('TodoWrite resets the write counter, not the reminder counter', () => {
  let state = initialReminderState()
  for (let i = 0; i < 9; i++) state = observeToolCall(state, 'Read').state
  state = observeToolCall(state, 'TodoWrite', todos).state
  assert.equal(state.turnsSinceLastTodoWrite, 0)
  assert.deepEqual(state.latestTodos, todos)
  assert.equal(shouldRemind(state), false)
})

test('reminder interval resets after firing', () => {
  let state = initialReminderState()
  let fired = 0
  for (let i = 0; i < 25; i++) {
    const result = observeToolCall(state, 'Read')
    state = result.state
    if (result.reminder !== undefined) fired++
  }
  assert.equal(fired, 2) // at call 10 and again 10 calls later
})
