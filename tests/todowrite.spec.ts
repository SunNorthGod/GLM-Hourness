import assert from 'node:assert/strict'
import test from 'node:test'
import { mapTodoWriteToDsh, validateZcodeTodos, zcodeTodoWriteDescription, zcodeTodoWriteSchema } from '../src/glm-prompt/todowrite.ts'

const valid = { todos: [
  { content: 'a', status: 'pending', priority: 'high' },
  { content: 'b', status: 'in_progress', priority: 'medium' },
  { content: 'c', status: 'completed', priority: 'low' },
] }

test('schema keeps the three required ZCode fields with string enums', () => {
  const item = (zcodeTodoWriteSchema.properties as any).todos.items
  assert.deepEqual(item.required.sort(), ['content', 'priority', 'status'])
  assert.deepEqual(item.properties.priority.enum, ['high', 'medium', 'low'])
  assert.deepEqual((zcodeTodoWriteSchema as any).required, ['todos'])
})

test('description stays the ZCode original', () => {
  assert.ok(zcodeTodoWriteDescription.startsWith('Create and update your task list for the user.'))
})

test('accepts a fully valid payload and strips priority for DSH', () => {
  assert.deepEqual(validateZcodeTodos(valid), [])
  assert.deepEqual(mapTodoWriteToDsh(valid), { todos: [
    { content: 'a', status: 'pending' },
    { content: 'b', status: 'in_progress' },
    { content: 'c', status: 'completed' },
  ] })
})

test('rejects missing priority, bad status, and non-array todos', () => {
  const missingPriority = { todos: [{ content: 'a', status: 'pending' }] }
  assert.ok(validateZcodeTodos(missingPriority).some(v => v.includes('priority')))
  const badStatus = { todos: [{ content: 'a', status: 'done', priority: 'low' }] }
  assert.ok(validateZcodeTodos(badStatus).some(v => v.includes('status')))
  assert.ok(validateZcodeTodos({}).some(v => v.includes('required')))
  assert.throws(() => mapTodoWriteToDsh(missingPriority), /invalid payload/)
})
