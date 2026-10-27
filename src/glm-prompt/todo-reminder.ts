/**
 * Todo reminder, ported from ZCode 3.16.3 (bundle `XNa`, `U4o`, `z4o` and
 * the turn loop's attachment collection; source
 * apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts and
 * runtime/methods/turn-loop.ts).
 *
 * ZCode, before every model request whose turn tools include TodoWrite:
 * walk the history backwards counting assistant messages; the gate opens
 * when at least 10 of them follow the last assistant message that called
 * TodoWrite and at least 10 follow the last `todo_reminder` entry (absent
 * marks count the whole history). The body is the verbatim nudge plus the
 * session's todo list echo; it travels as a `todo_reminder` system-reminder
 * attachment and is persisted, so later requests count from it.
 *
 * DSH port (docs/DESIGN.md §5.5): the counts are re-derived on every GLM
 * step from the request-visible history (`session.deriveMessages()`), so
 * resume and compaction see what the model sees. Only assistant messages a
 * GLM model produced count as turns (rc.3 assistant messages carry their
 * `source.model`). A todo write is a TodoWrite call, a DeferredToolCall
 * naming TodoWrite (ZCode records that call under the target's name), or a
 * native `todo_write` call from a non-GLM step, which updates the same list.
 * The echo is the list of the latest successful todo write in that history:
 * ZCode reads its session todo store, and DSH has no durable equivalent (the
 * dsh-tool-todo `todos` projection clears at every turn start).
 */
import { isGlmModel } from '../shared/route.ts'
import { createUserNotice, type AgentLike, type DerivedMessage } from '../shared/dsh-min.ts'
import { DEFERRED_TOOL_CALL_NAME, wrapSystemReminder } from '../toolsearch/zcode-text.ts'
import { TODO_REMINDER_BODY, TODO_REMINDER_ECHO_HEADER, TODO_REMINDER_THRESHOLDS } from './verbatim.ts'

/** Source kind of the persisted reminder notice (ZCode `todo_reminder`). */
export const TODO_REMINDER_SOURCE = 'glm-todo-reminder'

/** The ZCode-facing todo tool; its presence on the request face enables the reminder. */
export const TODO_WRITE_NAME = 'TodoWrite'

/** The native the TodoWrite alias covers. */
export const TODO_NATIVE = 'todo_write'

export interface TodoItem {
  readonly content: string
  readonly status: string
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

type Block = NonNullable<DerivedMessage['content']>[number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A tool-call block's arguments as an object (rc.3 stores the provider's JSON text). */
function callArguments(block: Block): Record<string, unknown> | undefined {
  const raw = block.arguments
  if (isRecord(raw)) return raw
  if (typeof raw !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : undefined
  }
  catch {
    return undefined
  }
}

/** The arguments of a tool-call block that writes the todo list, or undefined for any other block. */
function todoWriteArguments(block: Block): Record<string, unknown> | undefined {
  if (block.type !== 'tool-call') return undefined
  if (block.name === TODO_WRITE_NAME || block.name === TODO_NATIVE) return callArguments(block) ?? {}
  if (block.name !== DEFERRED_TOOL_CALL_NAME) return undefined
  const wrapper = callArguments(block)
  if (wrapper?.name !== TODO_WRITE_NAME) return undefined
  return isRecord(wrapper.input) ? wrapper.input : {}
}

const writesTodos = (message: DerivedMessage): boolean =>
  (message.content ?? []).some(block => todoWriteArguments(block) !== undefined)

export interface TodoReminderTurnCounts {
  readonly turnsSinceLastTodoWrite: number
  readonly turnsSinceLastReminder: number
}

/** ZCode `getTodoReminderTurnCounts` over the DSH derived history (GLM assistant messages are the turns). */
export function todoReminderTurnCounts(history: readonly DerivedMessage[]): TodoReminderTurnCounts {
  let turns = 0
  let sinceWrite: number | undefined
  let sinceReminder: number | undefined
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]!
    if (sinceReminder === undefined && message.role === 'user' && message.source?.kind === TODO_REMINDER_SOURCE) sinceReminder = turns
    if (sinceWrite !== undefined && sinceReminder !== undefined) break
    if (message.role !== 'assistant') continue
    if (sinceWrite === undefined && writesTodos(message)) sinceWrite = turns
    if (isGlmModel(message.source?.model)) turns++
    if (sinceWrite !== undefined && sinceReminder !== undefined) break
  }
  return { turnsSinceLastTodoWrite: sinceWrite ?? turns, turnsSinceLastReminder: sinceReminder ?? turns }
}

/** ZCode `shouldBuildTodoReminder`: the 10/10 double threshold. */
export function shouldBuildTodoReminder(history: readonly DerivedMessage[]): boolean {
  const counts = todoReminderTurnCounts(history)
  return counts.turnsSinceLastTodoWrite >= TODO_REMINDER_THRESHOLDS.TURNS_SINCE_WRITE
    && counts.turnsSinceLastReminder >= TODO_REMINDER_THRESHOLDS.TURNS_BETWEEN_REMINDERS
}

/** The list written by the latest successful todo write in the history; empty when there is none. */
export function latestTodos(history: readonly DerivedMessage[]): TodoItem[] {
  const failed = new Set<string>()
  const answered = new Set<string>()
  for (const message of history) {
    if (message.role !== 'tool' || message.toolCallId === undefined) continue
    answered.add(message.toolCallId)
    if (message.isError === true) failed.add(message.toolCallId)
  }
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]!
    if (message.role !== 'assistant') continue
    const blocks = message.content ?? []
    for (let position = blocks.length - 1; position >= 0; position--) {
      const block = blocks[position]!
      const args = todoWriteArguments(block)
      if (args === undefined || typeof block.id !== 'string' || !answered.has(block.id) || failed.has(block.id)) continue
      const todos = Array.isArray(args.todos) ? args.todos : []
      return todos.filter((todo): todo is TodoItem => isRecord(todo) && typeof todo.content === 'string' && typeof todo.status === 'string')
        .map(todo => ({ content: todo.content, status: todo.status }))
    }
  }
  return []
}

/**
 * Install the reminder on one agent: an `agent/pre-step` listener (after the
 * step's assembly, before its request; ZCode's attachment collection) that,
 * when `eligible()` says the assembled request is GLM-routed with TodoWrite
 * on its face, appends the reminder as a `<system-reminder>` notice after
 * the step's admitted messages. The notice persists in the session, so the
 * next steps count from it. Returns undefined, installing nothing, when the
 * agent has no session history to count from.
 */
export function installTodoReminder(agent: AgentLike, eligible: () => boolean): (() => void) | undefined {
  const session = agent.session
  if (typeof session?.deriveMessages !== 'function') {
    console.warn(`dsh-glm-hourness/glm-prompt: todo reminder not installed for agent ${agent.id}: no session history`)
    return undefined
  }
  return agent.ctx.on('agent/pre-step', async ({ messages, signal, step }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || !eligible()) return decision
    // installModelSelection's guard: an empty decision never turns into a step.
    if (decision.messages.length === 0 && (step === 1 || messages.length > 0)) return decision
    const history = session.deriveMessages() as readonly DerivedMessage[]
    if (!shouldBuildTodoReminder(history)) return decision
    const notice = createUserNotice(TODO_REMINDER_SOURCE, 'todo reminder', wrapSystemReminder(buildTodoReminderBody(latestTodos(history))))
    return { ...decision, messages: [...decision.messages, notice] }
  })
}
