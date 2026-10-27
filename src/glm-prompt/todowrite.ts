/**
 * TodoWrite alias shim onto the DSH todo_write executor. The model sees the
 * ZCode 3.16.3 description and three-field schema (TODO_WRITE_DESCRIPTION,
 * TODO_WRITE_INPUT_SCHEMA in zcode-tool-text.ts; content/status/priority,
 * all required). DSH todo items carry content and status only, so priority
 * is validated and then stripped at the execution boundary. The native
 * replaces the whole list per call and the DSH UI renders it as the todo
 * panel, as the description says (dsh-tool-todo, dsh-client-ui-conversation).
 */
import type { JsonRecord, JsonValue } from './json.ts'

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
