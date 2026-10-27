import assert from 'node:assert/strict'
import test from 'node:test'
import { mapTodoWriteToDsh, validateZcodeTodos } from '../src/glm-prompt/todowrite.ts'
import { todoWriteAliasTool } from '../src/glm-prompt/index.ts'
import { TODO_WRITE_DESCRIPTION, TODO_WRITE_INPUT_SCHEMA } from '../src/glm-prompt/zcode-tool-text.ts'

const valid = { todos: [
  { content: 'a', status: 'pending', priority: 'high' },
  { content: 'b', status: 'in_progress', priority: 'medium' },
  { content: 'c', status: 'completed', priority: 'low' },
] }

test('schema keeps the three required ZCode fields with string enums', () => {
  const item = (TODO_WRITE_INPUT_SCHEMA.properties as any).todos.items
  assert.deepEqual(item.required.sort(), ['content', 'priority', 'status'])
  assert.deepEqual(item.properties.priority.enum, ['high', 'medium', 'low'])
  assert.deepEqual((TODO_WRITE_INPUT_SCHEMA as any).required, ['todos'])
})

test('the alias carries the ZCode 3.16.3 description and schema', () => {
  const alias = todoWriteAliasTool(async () => ({}))
  assert.equal(alias.description, TODO_WRITE_DESCRIPTION)
  assert.equal(alias.parameters, TODO_WRITE_INPUT_SCHEMA)
  assert.ok(TODO_WRITE_DESCRIPTION.startsWith('Create and update a task list for the current session.'))
})

test('accepts a fully valid payload and strips priority for DSH', async () => {
  assert.deepEqual(validateZcodeTodos(valid), [])
  assert.deepEqual(mapTodoWriteToDsh(valid), { todos: [
    { content: 'a', status: 'pending' },
    { content: 'b', status: 'in_progress' },
    { content: 'c', status: 'completed' },
  ] })
  const received: unknown[] = []
  await todoWriteAliasTool(async (args) => { received.push(args); return {} }).execute(valid, undefined)
  assert.deepEqual(received, [mapTodoWriteToDsh(valid)])
})

test('rejects missing priority, bad status, and non-array todos', () => {
  const missingPriority = { todos: [{ content: 'a', status: 'pending' }] }
  assert.ok(validateZcodeTodos(missingPriority).some(v => v.includes('priority')))
  const badStatus = { todos: [{ content: 'a', status: 'done', priority: 'low' }] }
  assert.ok(validateZcodeTodos(badStatus).some(v => v.includes('status')))
  assert.ok(validateZcodeTodos({}).some(v => v.includes('required')))
  assert.throws(() => mapTodoWriteToDsh(missingPriority), /invalid payload/)
})
