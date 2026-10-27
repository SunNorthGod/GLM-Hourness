/**
 * TodoWrite alias: ZCode-facing schema and the shim mapping onto the DSH
 * todo_write executor. The model sees the ZCode three-field schema verbatim
 * (content/status/priority, all required); priority is advisory and is
 * stripped at the execution boundary (DSH todo items carry content+status).
 */
import type { JsonRecord, JsonValue } from './json.ts'

/** ZCode TodoWrite input_schema, verbatim (docs/02-zcode-tool-schemas.md §1). */
export const zcodeTodoWriteSchema: JsonRecord = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Brief description of the task' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Current status of the task' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Priority level of the task' },
        },
        required: ['content', 'status', 'priority'],
      },
    },
  },
  required: ['todos'],
}

/** ZCode TodoWrite description, verbatim. */
export const zcodeTodoWriteDescription
  = 'Create and update your task list for the user. Only use this tool if you have more than one substantial task to complete or the user explicitly requests it. This tool should be called sparingly, not for trivial tasks.'

const TODO_STATUSES = new Set(['pending', 'in_progress', 'completed'])
const TODO_PRIORITIES = new Set(['high', 'medium', 'low'])

/** One ZCode-facing todo item. */
export interface ZcodeTodo {
  readonly content: string
  readonly status: 'pending' | 'in_progress' | 'completed'
  readonly priority: 'high' | 'medium' | 'low'
}

/** Validation failures in the ZCode-facing shape (missing fields, bad enums). */
export function validateZcodeTodos(value: JsonValue): string[] {
  const violations: string[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['todos: expected an object']
  const todos = (value as JsonRecord).todos
  if (!Array.isArray(todos)) return ['todos: required and must be an array']
  todos.forEach((todo, index) => {
    const at = `todos[${index}]`
    if (typeof todo !== 'object' || todo === null || Array.isArray(todo)) {
      violations.push(`${at}: expected an object`)
      return
    }
    const { content, status, priority } = todo as JsonRecord
    if (typeof content !== 'string') violations.push(`${at}.content: required string`)
    if (typeof status !== 'string' || !TODO_STATUSES.has(status)) violations.push(`${at}.status: required, one of pending/in_progress/completed`)
    if (typeof priority !== 'string' || !TODO_PRIORITIES.has(priority)) violations.push(`${at}.priority: required, one of high/medium/low`)
  })
  return violations
}

/** Map a validated ZCode TodoWrite payload to the DSH todo_write arguments. */
export function mapTodoWriteToDsh(value: JsonValue): { todos: Array<{ content: string, status: string }> } {
  const violations = validateZcodeTodos(value)
  if (violations.length > 0) throw new Error(`TodoWrite shim: invalid payload (${violations.join('; ')})`)
  const todos = ((value as unknown) as { todos: ZcodeTodo[] }).todos.map(({ content, status }) => ({ content, status }))
  return { todos }
}
