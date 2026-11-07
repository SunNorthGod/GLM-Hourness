/**
 * Lessons after a failed call (M5 design §4.4, §4.6): when a tool call
 * fails and its output contains the error fragment of a lesson, the result
 * carries a reminder of that lesson, and the match is recorded as a `hit`
 * (the count of sessions a lesson matched in is what makes it one that keeps
 * coming back, src/lessons/match.ts `dueRecurrences`).
 *
 * The listener is on `tools/post-execute` of the host, so it sees the calls
 * of every agent, a delegated child's included. It only adds: whatever the
 * listeners below decided is returned as it was, with the reminder put in
 * front of its contexts, and a call is never refused, changed or cancelled
 * (lessons are advice, not rules). A failure of its own, a journal that
 * cannot be read or a history that cannot be derived, leaves the result as
 * it was, warns once and shows in the health of the session's row.
 *
 * A call counts as failed when a shell tool (native `pwsh` or `bash`; the
 * GLM face's `Bash` is `pwsh`) exits with a code other than 0 or times out,
 * or when any tool's result is an error, a call that `tools/pre-execute`
 * refused included. A transport sub-call (`run_code` binding) and a call
 * without an agent are not looked at: the first one's failure is in the
 * result of `run_code`, the second has no session. A lesson already shown to
 * the session is not shown again: the notices of this source in the visible
 * history say which, and so does what this process pushed to the session
 * since (the result of a call reaches the history only at the next step, and
 * a wrapper such as the deferred tool call fails with the same text as the
 * call inside it).
 */
import { isObject } from '../data/refusal.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type PostExecuteHost, type PostExecutePayload, type SessionLike, type ToolFinalResult, type UserNotice } from '../shared/dsh-min.ts'
import { matchFailure, type FailureMatch } from './match.ts'
import { failureNotice } from './render.ts'
import { noteWrite, readLessons, writeLessons, type LessonsEnv } from './storage.ts'

/** The source of the reminder after a failed call. */
export const FAILURE_SOURCE = 'glm-hourness-lessons'
/** The source of the reminder after a successful read, write or edit (src/lessons/path.ts); its `keys` fact lists what it told, lessons by id. */
export const PATH_SOURCE = 'glm-hourness-lessons-path'

const SHELLS: ReadonlySet<string> = new Set(['pwsh', 'bash'])
const STDERR_TAIL = 4_000
const STDOUT_TAIL = 2_000
const ERROR_HEAD = 6_000

/** What the listener needs of the row. */
export interface FailureParts {
  readonly ctx: PostExecuteHost
  readonly env: LessonsEnv
  /** Tell the row's health how the session stands. */
  report(session: SessionLike): Promise<void>
  /** Warn on the console once per key. */
  warn(key: string, text: string): void
  /** What this process pushed to each session; the reminder at a file (src/lessons/path.ts) shares it, so a lesson one of them told is not told by the other. */
  readonly pushedBy: PushedBy
}

/**
 * What this process has pushed to each session and not yet seen in its
 * visible history: the key, and how long the history was when it was pushed.
 * A result reaches the history only at the end of its step, so while the
 * history is as long as it was the push is still on its way and counts as
 * told; once the history has moved on, a key that is not in it was taken out
 * of it (a compaction) and may be told again.
 */
export type PushedBy = WeakMap<SessionLike, Map<string, number>>

const tail = (text: string, max: number): string => text.length > max ? text.slice(text.length - max) : text
const streamText = (stream: unknown): string => isObject(stream) && typeof stream.text === 'string' ? stream.text : ''
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** The output of a shell result that failed: the end of stderr, then the end of stdout; undefined when the command ran through. */
function shellFailure(value: unknown): string | undefined {
  if (!isObject(value)) return undefined
  const failed = value.timedOut === true || (typeof value.exitCode === 'number' && value.exitCode !== 0)
  return failed ? `${tail(streamText(value.stderr), STDERR_TAIL)}\n${tail(streamText(value.stdout), STDOUT_TAIL)}` : undefined
}

/**
 * The text a call's failure is matched against, or undefined when the call
 * did not fail: an error result gives its text and message (the start of
 * them); a shell that ran gives its output only when it failed.
 */
export function failureText(native: string, result: ToolFinalResult): string | undefined {
  if (result.isError) return [...result.content.map(block => block.type === 'text' ? block.text ?? '' : ''), result.error?.message ?? ''].join('\n').slice(0, ERROR_HEAD)
  return SHELLS.has(native) ? shellFailure(result.value) : undefined
}

/** What the session was told: the lessons of the failure notices in its visible history, the keys of the reminders at a file, and what this process pushed in the step that is still going on. */
export function toldTo(history: readonly DerivedMessage[], pushed: ReadonlyMap<string, number>): Set<string> {
  const told = new Set([...pushed].filter(([, length]) => length === history.length).map(([key]) => key))
  for (const message of history) {
    if (message.role !== 'user') continue
    const items = message.source?.kind === FAILURE_SOURCE ? message.source.lessons : message.source?.kind === PATH_SOURCE ? message.source.keys : undefined
    if (Array.isArray(items)) for (const item of items) if (typeof item === 'string') told.add(item)
  }
  return told
}

/** The call a failure came from, as a `hit` names it. */
interface FailedCall {
  readonly session: SessionLike
  readonly agent: AgentLike
  readonly callId: string
  /** The DSH native name of the tool. */
  readonly tool: string
}

/**
 * Record one `hit` per lesson that was brought up. The result does not wait
 * for it: a failed write only warns once and shows in the session's health.
 */
function recordHits(parts: FailureParts, dir: string, call: FailedCall, matches: readonly FailureMatch[]): void {
  const { env } = parts
  void (async () => {
    try {
      const by = { session: call.session.id, agent: call.agent.id, tool: call.tool, callId: call.callId }
      const written = await writeLessons<never>(dir, () => ({ records: matches.map(match => ({ actor: 'harness' as const, by, op: 'hit', id: match.lesson.id })) }), env.append)
      noteWrite(env, call.session.id, written)
      if (written.status !== 'ok') parts.warn('hit', `a lesson match was not recorded (${written.status}); the reminder was given all the same`)
    }
    catch (error) {
      parts.warn('hit', `a lesson match was not recorded: ${messageOf(error)}`)
    }
  })()
}

/** The reminder for a failed call, or undefined when nothing fails or no lesson fits. */
async function remind(parts: FailureParts, exec: PostExecutePayload, agent: AgentLike, session: SessionLike, result: ToolFinalResult): Promise<UserNotice | undefined> {
  const { env } = parts
  const tool = env.native(exec.name)
  const failure = failureText(tool, result)
  if (failure === undefined) return undefined
  const dir = env.dirOf(session)
  if (dir === undefined) return undefined
  const read = await readLessons(dir)
  if (!read.ok) {
    env.note(session.id, 'failure', `失败匹配读不出经验：${read.reason}`)
    await parts.report(session)
    return undefined
  }
  env.note(session.id, 'failure', undefined)
  const pushed = parts.pushedBy.get(session) ?? new Map<string, number>()
  parts.pushedBy.set(session, pushed)
  const history = session.deriveMessages() as readonly DerivedMessage[]
  const matches = matchFailure(read.reading.state, failure, { skip: toldTo(history, pushed) })
  if (matches.length === 0) return undefined
  for (const { lesson } of matches) pushed.set(lesson.id, history.length)
  recordHits(parts, dir, { session, agent, callId: exec.callId, tool }, matches)
  return createUserNotice(FAILURE_SOURCE, 'lesson match', failureNotice(matches), { lessons: matches.map(match => match.lesson.id) })
}

/** Install the listener on the host; the function that takes it back. */
export function installFailureMatching(parts: FailureParts): () => void {
  return parts.ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    const { agent } = exec
    const session = agent?.session
    if (agent === undefined || session === undefined || exec.parent !== undefined) return downstream
    try {
      const notice = await remind(parts, exec, agent, session, result)
      return notice === undefined ? downstream : { ...downstream, additionalContexts: [notice, ...downstream.additionalContexts ?? []] }
    }
    catch (error) {
      parts.warn('failure-matching', `matching a failed call against the lessons failed, the result stays as it was: ${messageOf(error)}`)
      parts.env.note(session.id, 'failure', `失败匹配出错：${messageOf(error)}`)
      await parts.report(session).catch(() => undefined)
      return downstream
    }
  })
}
