/**
 * Removing one DSH reminder (docs/ORCHESTRATION.md §18.10; loop board design
 * 0.6 §6.2 "the rule for deleting a task", §11.3): the one function that calls
 * `schedule.delete`. Deleting a task is irreversible — the host drops the row
 * and the saved deliveries with it (schedule:2164–2182) — so the function
 * deletes only when both of these hold, and answers `kept` with the reason when
 * either does not:
 *
 * - the board can prove the task is its own: the id is in `bindings`, or the
 *   title and the first line of the prompt are both written the way the board
 *   writes them (an agent cannot make such a reminder: `loops:schedule-tools`
 *   refuses it, so apart from the board only a person copying it on the DSH
 *   task page can), and a reminder the main agent set for itself is never
 *   touched;
 * - the board can say why the task is of no use, and the reason is one of the
 *   eight the design lists. While the holder session cannot be seen clearly
 *   (`elsewhere`, `unknown`), a task bound to it is in none of them.
 *
 * Before the delete the whole task, as `schedule.catalog()` has it, is appended
 * to `<project>/.llm/loops/removed-tasks.jsonl` and flushed to disk; a line
 * that cannot be written stops the delete, so nothing disappears without a
 * record a person can rebuild it from. Lines are kept 30 days.
 */
import { appendLine, readText, writeAtomic, type StoreIo } from '../rules/store.ts'
import type { ScheduleCatalogEntry, ScheduleService } from '../shared/dsh-min.ts'
import { mayRemoveHolderTasks, type HolderState } from './holder.ts'
import type { LoopRecord } from './records.ts'
import type { LoopsPaths } from './store.ts'

/** Why a task is of no use; the design's closed list (design §6.2, §6.10 `loop-task-delete`). */
export type RemoveReason = 'moved' | 'entry-gone' | 'duplicate' | 'no-holder' | 'holder-archived' | 'holder-not-found' | 'repair' | 'not-delivered'

/** How long a line of `removed-tasks.jsonl` is kept (design §6.2). */
export const REMOVED_KEPT_MS = 30 * 24 * 3_600_000

export type RemoveOutcome =
  | { readonly kind: 'deleted' }
  /** Nothing was deleted, and this is why; the page counts them (design §6.2). */
  | { readonly kind: 'kept', readonly why: string }

export interface RemoveDeps {
  readonly paths: LoopsPaths
  readonly schedule: ScheduleService
  readonly now: () => number
  /** The ids of the tasks the board created, from `bindings`. */
  readonly ours: () => ReadonlySet<string>
  /** How the holder session reads now: a task bound to it is kept while that is not clear (design §6.2 item 0). */
  readonly holder: () => HolderState
  /** Write one record (design §6.10). */
  readonly record: (record: LoopRecord) => void
  readonly report: (text: string, level: 'info' | 'degraded') => void
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 120)

/** One line of `removed-tasks.jsonl` (design §6.2): enough for a person to make the reminder again on the DSH task page. */
export interface RemovedTaskLine {
  readonly at: string
  readonly project: string
  readonly scheduleId: string
  readonly sessionId: string
  readonly entry?: string
  readonly why: RemoveReason
  /** The whole row of `schedule.catalog()`, with its status and last delivery. */
  readonly record: ScheduleCatalogEntry
}

/**
 * Append one line and flush it: a record written after the delete would be
 * lost by a crash in between, so this runs first and the delete only follows a
 * line that is on disk.
 */
async function writeRemoved(file: string, line: RemovedTaskLine): Promise<{ readonly ok: true } | { readonly ok: false, readonly reason: string }> {
  try {
    await appendLine(file, line)
    return { ok: true }
  }
  catch (error) {
    return { ok: false, reason: message(error) }
  }
}

/**
 * Delete one reminder of the board's, or keep it and say why. `entry` is the
 * entry the task belonged to when the board knows it.
 */
export async function removeTask(deps: RemoveDeps, task: ScheduleCatalogEntry, why: RemoveReason, entry?: string): Promise<RemoveOutcome> {
  const holder = deps.holder()
  if (task.sessionId === holder.session && !mayRemoveHolderTasks(holder)) {
    return { kind: 'kept', why: `主 Agent 的会话此刻看不清（${holder.reason ?? holder.kind}），绑在它上面的提醒不删` }
  }
  if (!isOurs(deps.ours(), task)) return { kind: 'kept', why: '证明不了这条 DSH 提醒是循环板建的' }
  const line: RemovedTaskLine = {
    at: new Date(deps.now()).toISOString(),
    project: deps.paths.projectRoot,
    scheduleId: task.id,
    sessionId: task.sessionId,
    ...(entry === undefined ? {} : { entry }),
    why,
    record: task,
  }
  const written = await writeRemoved(deps.paths.removedTasks, line)
  if (!written.ok) {
    deps.report(`没能记下要删的 DSH 提醒，先不删：${written.reason}`, 'degraded')
    return { kind: 'kept', why: `removed-tasks.jsonl 写不进：${written.reason}` }
  }
  let deleted = false
  let fault: string | undefined
  try {
    const result = await deps.schedule.delete({ sessionId: task.sessionId, id: task.id })
    deleted = result.deleted
    if (!deleted) fault = result.code ?? 'DSH 说没有这条提醒'
  }
  catch (error) {
    fault = message(error)
  }
  deps.record({
    kind: 'loop-task-delete',
    at: new Date(deps.now()).toISOString(),
    project: deps.paths.projectRoot,
    ...(entry === undefined ? {} : { entry }),
    scheduleId: task.id,
    why,
    deleted,
  })
  if (deleted) return { kind: 'deleted' }
  // The task is gone from DSH, or the call failed: either way the board did not delete it, and the line of removed-tasks.jsonl says it tried.
  if (fault !== undefined && fault !== 'schedule_not_found') deps.report(`删 DSH 提醒 ${task.id} 没成：${fault}`, 'info')
  return { kind: 'kept', why: fault ?? 'DSH 没有删' }
}

/** Whether the board can prove it made this task (design §6.2): its own binding, or both of its own writings. */
export function isOurs(bindings: ReadonlySet<string>, task: Pick<ScheduleCatalogEntry, 'id' | 'title' | 'prompt'>): boolean {
  return bindings.has(task.id) || (task.title.startsWith(TASK_TITLE_PREFIX) && entryIdOfPrompt(task.prompt) !== undefined)
}

/** The title of a reminder of the board's; the host trims it and takes at most 120 characters (schedule:93–97). */
export const TASK_TITLE_PREFIX = '循环板 · '

/** The first line of the prompt of a reminder of the board's; `loops:schedule-tools` refuses an agent a reminder that begins with it (design §6.2, §2.4 row 16). */
export const TASK_PROMPT_PREFIX = 'Loop board: '

const ENTRY_ID = /^Loop board: ([A-Za-z0-9][\w.:-]{0,63}) \((?:default of [^)]+|added by the human)\)\. Change it on the loop board, not here\.$/

/** The entry a prompt of the board's names, or undefined when the first line is not one the board writes. */
export function entryIdOfPrompt(prompt: string): string | undefined {
  const first = prompt.split('\n', 1)[0] ?? ''
  return ENTRY_ID.exec(first)?.[1]
}

/** The first line of the prompt the board gives a reminder (design §6.2). */
export function promptLineOf(entry: string, origin: { readonly plugin?: string }): string {
  const who = origin.plugin === undefined ? 'added by the human' : `default of ${origin.plugin}`
  return `${TASK_PROMPT_PREFIX}${entry} (${who}). Change it on the loop board, not here.`
}

/** The lines of `removed-tasks.jsonl` that are still inside the 30 days; a line whose time cannot be read is kept, since a record is only evidence. */
export function keptLines(text: string, nowMs: number): readonly string[] {
  return text.split('\n').filter((line) => {
    if (!line.startsWith('{')) return false
    try {
      const at = Date.parse(String((JSON.parse(line) as { readonly at?: unknown }).at))
      return !Number.isFinite(at) || nowMs - at < REMOVED_KEPT_MS
    }
    catch {
      return false
    }
  })
}

/** Drop the lines older than 30 days (design §6.2: the first beat of a day does it). A file that cannot be rewritten is left as it is. */
export async function trimRemovedTasks(paths: LoopsPaths, io: StoreIo, nowMs: number): Promise<void> {
  const text = readText(paths.removedTasks)
  if (text === undefined) return
  const kept = keptLines(text, nowMs)
  if (kept.length === text.split('\n').filter(line => line.startsWith('{')).length) return
  await writeAtomic(paths.removedTasks, kept.length === 0 ? '' : `${kept.join('\n')}\n`, io)
}
