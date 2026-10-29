import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTodoReminderBody, formatTodoListForReminder, latestTodos, shouldBuildTodoReminder, todoReminderTurnCounts } from '../src/glm-prompt/todo-reminder.ts'
import type { DerivedMessage } from '../src/shared/dsh-min.ts'

const todos = [{ content: 'write spec', status: 'in_progress' }, { content: 'ship it', status: 'pending' }]

let ids = 0
/** One assistant message (rc.3 shape: tool-call blocks with JSON text arguments) and its tool results. */
function turn(calls: ReadonlyArray<{ name: string, args?: unknown, failed?: true }> = [{ name: 'Read' }], model = 'glm-5.3'): DerivedMessage[] {
  const blocks = calls.map(call => ({ type: 'tool-call', id: `call-${++ids}`, name: call.name, arguments: JSON.stringify(call.args ?? {}) }))
  const assistant: DerivedMessage = { role: 'assistant', content: blocks.length > 0 ? blocks : [{ type: 'text', text: 'ok' }], source: { kind: 'model', provider: 'glm-zcode', model } }
  return [assistant, ...blocks.map((block, index) => ({ role: 'tool', toolCallId: block.id, isError: calls[index]!.failed === true, content: [{ type: 'text', text: 'ok' }] }))]
}
const turns = (count: number, calls?: Parameters<typeof turn>[0], model?: string): DerivedMessage[] => Array.from({ length: count }, () => turn(calls, model)).flat()
const reminder: DerivedMessage = { role: 'user', content: [{ type: 'text', text: '<system-reminder>…' }], source: { kind: 'glm-todo-reminder', form: 'notice' } }
const todoWrite = (list = todos) => ({ name: 'TodoWrite', args: { todos: list.map(todo => ({ ...todo, priority: 'high' })) } })

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

test('the gate opens at 10 assistant turns without TodoWrite or reminder, not at 9', () => {
  assert.equal(shouldBuildTodoReminder(turns(9)), false)
  assert.equal(shouldBuildTodoReminder(turns(10)), true)
  assert.deepEqual(todoReminderTurnCounts(turns(10)), { turnsSinceLastTodoWrite: 10, turnsSinceLastReminder: 10 })
})

test('a turn with several tool calls counts once', () => {
  const parallel = turns(9, [{ name: 'Read' }, { name: 'Grep' }, { name: 'Bash' }])
  assert.deepEqual(todoReminderTurnCounts(parallel), { turnsSinceLastTodoWrite: 9, turnsSinceLastReminder: 9 })
  assert.equal(shouldBuildTodoReminder(parallel), false)
})

test('TodoWrite resets the write count from its own turn; the reminder count keeps running', () => {
  const history = [...turns(5), ...turn([{ name: 'Read' }, todoWrite()]), ...turns(9)]
  assert.deepEqual(todoReminderTurnCounts(history), { turnsSinceLastTodoWrite: 9, turnsSinceLastReminder: 15 })
  assert.equal(shouldBuildTodoReminder(history), false)
  assert.equal(shouldBuildTodoReminder([...history, ...turns(1)]), true)
})

test('a TodoWrite reached through DeferredToolCall counts as a todo write', () => {
  const nested = turn([{ name: 'DeferredToolCall', args: { name: 'TodoWrite', input: { todos: [] } } }])
  assert.equal(todoReminderTurnCounts([...turns(12), ...nested, ...turns(3)]).turnsSinceLastTodoWrite, 3)
  // Another deferred target is not a todo write.
  const other = turn([{ name: 'DeferredToolCall', args: { name: 'web_fetch', input: {} } }])
  assert.equal(todoReminderTurnCounts([...other, ...turns(3)]).turnsSinceLastTodoWrite, 4)
})

test('a reminder notice in history restarts the interval', () => {
  const history = [...turns(10), reminder, ...turns(9)]
  assert.deepEqual(todoReminderTurnCounts(history), { turnsSinceLastTodoWrite: 19, turnsSinceLastReminder: 9 })
  assert.equal(shouldBuildTodoReminder(history), false)
  assert.equal(shouldBuildTodoReminder([...history, ...turns(1)]), true)
})

test('only GLM assistant messages count as turns; a native todo_write from another route still resets', () => {
  assert.equal(shouldBuildTodoReminder(turns(15, undefined, 'deepseek-flash')), false)
  assert.deepEqual(todoReminderTurnCounts([...turns(15, undefined, 'deepseek-flash'), ...turns(4)]), { turnsSinceLastTodoWrite: 4, turnsSinceLastReminder: 4 })
  const native = turn([{ name: 'todo_write', args: { todos: [{ content: 'n', status: 'pending' }] } }], 'deepseek-flash')
  assert.equal(todoReminderTurnCounts([...turns(12), ...native, ...turns(2)]).turnsSinceLastTodoWrite, 2)
})

test('an assistant message of reasoning only is no turn (3.17.1 nUa); reasoning with text is one', () => {
  const thinking: DerivedMessage = { role: 'assistant', content: [{ type: 'reasoning', text: 'hmm' }], source: { kind: 'model', provider: 'glm-zcode', model: 'glm-5.3' } }
  const history = [...turns(9), thinking]
  assert.deepEqual(todoReminderTurnCounts(history), { turnsSinceLastTodoWrite: 9, turnsSinceLastReminder: 9 })
  assert.equal(shouldBuildTodoReminder(history), false)
  const answered: DerivedMessage = { ...thinking, content: [{ type: 'reasoning', text: 'hmm' }, { type: 'text', text: 'ok' }] }
  assert.equal(shouldBuildTodoReminder([...turns(9), answered]), true)
})

test('the echo is the list of the latest successful todo write, whichever name wrote it', () => {
  assert.deepEqual(latestTodos(turns(3)), [])
  assert.deepEqual(latestTodos([...turn([todoWrite()]), ...turns(2)]), todos)
  const later = [{ content: 'later', status: 'completed' }]
  assert.deepEqual(latestTodos([...turn([todoWrite()]), ...turn([{ name: 'DeferredToolCall', args: { name: 'TodoWrite', input: { todos: later } } }])]), later)
  assert.deepEqual(latestTodos([...turn([todoWrite()]), ...turn([{ name: 'todo_write', args: { todos: later } }], 'deepseek-flash')]), later)
  // A rejected write changed nothing; the earlier list stands.
  assert.deepEqual(latestTodos([...turn([todoWrite()]), ...turn([{ ...todoWrite(later), failed: true }])]), todos)
})
