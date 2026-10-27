/**
 * Todo reminder loop, mirroring ZCode's runtime-reminders semantics
 * (official source: apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts).
 *
 * Official behavior: double threshold 10/10 over assistant turns since the
 * last TodoWrite call and since the last todo_reminder; body is the verbatim
 * nudge plus the todo list echo (`N. [status] content` inside brackets).
 *
 * DSH adaptation (S1 deviation, recorded): turns are counted per completed
 * tool call via `tools/post-execute` — an assistant turn with several tool
 * calls counts several times. Precise turn counting moves to the pre-step
 * message walk when the dialect row reads full step messages.
 */
import { TODO_REMINDER_BODY, TODO_REMINDER_ECHO_HEADER, TODO_REMINDER_THRESHOLDS } from './verbatim.ts'

export interface TodoItem {
  readonly content: string
  readonly status: string
}

/** Per-agent reminder counters. */
export interface ReminderState {
  turnsSinceLastTodoWrite: number
  turnsSinceLastReminder: number
  latestTodos: readonly TodoItem[]
}

export function initialReminderState(): ReminderState {
  return {
    turnsSinceLastTodoWrite: 0,
    turnsSinceLastReminder: TODO_REMINDER_THRESHOLDS.TURNS_BETWEEN_REMINDERS,
    latestTodos: [],
  }
}

/** Official echo format: `N. [status] content`, wrapped in brackets as a block. */
export function formatTodoListForReminder(todos: readonly TodoItem[]): string[] {
  return todos.map((todo, index) => `${index + 1}. [${todo.status}] ${todo.content}`)
}

/** Official reminder body: verbatim nudge + echo when todos exist. */
export function buildTodoReminderBody(todos: readonly TodoItem[]): string {
  const lines = [TODO_REMINDER_BODY]
  if (todos.length > 0) {
    const currentTodos = `[${formatTodoListForReminder(todos).join('\n')}]`
    lines.push('', TODO_REMINDER_ECHO_HEADER, '', currentTodos)
  }
  return lines.join('\n')
}

/** Official double-threshold gate. */
export function shouldRemind(state: ReminderState): boolean {
  return state.turnsSinceLastTodoWrite >= TODO_REMINDER_THRESHOLDS.TURNS_SINCE_WRITE
    && state.turnsSinceLastReminder >= TODO_REMINDER_THRESHOLDS.TURNS_BETWEEN_REMINDERS
}

/**
 * Advance state for one completed tool call. A TodoWrite call resets the
 * write counter and refreshes the echoed list; any other call advances both
 * counters. Returns the reminder to deliver when the gate opens.
 */
export function observeToolCall(state: ReminderState, toolName: string, todosFromCall?: readonly TodoItem[]): { state: ReminderState, reminder: string | undefined } {
  if (toolName === 'TodoWrite') {
    const next: ReminderState = {
      turnsSinceLastTodoWrite: 0,
      turnsSinceLastReminder: state.turnsSinceLastReminder,
      latestTodos: todosFromCall ?? state.latestTodos,
    }
    return { state: next, reminder: undefined }
  }
  const next: ReminderState = {
    turnsSinceLastTodoWrite: state.turnsSinceLastTodoWrite + 1,
    turnsSinceLastReminder: state.turnsSinceLastReminder + 1,
    latestTodos: state.latestTodos,
  }
  if (!shouldRemind(next)) return { state: next, reminder: undefined }
  return {
    state: { ...next, turnsSinceLastReminder: 0 },
    reminder: buildTodoReminderBody(next.latestTodos),
  }
}
