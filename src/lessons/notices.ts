/**
 * What the lessons row tells the main agent on its own (M5 design §4.2.1,
 * §4.6): the candidates waiting to be merged, and a lesson that keeps coming
 * back. Both are notices of the agent's step, shown to the main agent of the
 * project only (`isMainAgentFor`: the person's ordinary sessions in the same
 * project are not the ones to merge anything), and neither blocks anything.
 *
 * The candidate notice comes when the set of open candidates is not the one
 * the last such notice in the request-visible history listed (so a compaction
 * that removed it brings it back once, and a merge that changes the set
 * brings the shorter list); it is also where the row looks at the graph for
 * candidates M7 left as notes (src/lessons/import.ts) and where candidates
 * open for more than 30 days expire. The recurrence notice comes once per
 * lesson in 28 days, one lesson per step, and its record is written first:
 * a notice that could not be recorded is not sent, so it cannot repeat.
 */
import { createHash } from 'node:crypto'
import { isMainAgentFor } from '../data/main-agent.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type ServiceLookup, type SessionLike, type UserNotice } from '../shared/dsh-min.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import type { Importer } from './import.ts'
import { dueRecurrences } from './match.ts'
import { openCandidates, type LessonsState } from './model.ts'
import { candidateNotice, recurNotice } from './render.ts'
import { noteWrite, readLessons, writeLessons, type LessonsEnv } from './storage.ts'

/** The source of the candidate notice and of the recurrence notice. */
export const PENDING_SOURCE = 'glm-hourness-lessons-pending'
export const RECUR_SOURCE = 'glm-hourness-lessons-recur'

const EXPIRE_DAYS = 30
const DAY_MS = 86_400_000

/** What the notices need of the row. */
export interface NoticeParts {
  readonly ctx: ServiceLookup
  readonly env: LessonsEnv
  readonly importer: Importer
  /** Tell the row's health how the session stands. */
  report(session: SessionLike): Promise<void>
  /** Warn on the console once per key. */
  warn(key: string, text: string): void
}

/** The `digest` of the last notice of this source in the request-visible history. */
function lastDigest(history: readonly DerivedMessage[], kind: string): unknown {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    if (message?.role === 'user' && message.source?.kind === kind) return message.source.digest
  }
  return undefined
}

/** The project directory when `agent` is the main agent of it; the judgement's reason goes to the row's health, and so does a main agent that has no project. */
async function mainProject(parts: NoticeParts, agent: AgentLike, session: SessionLike): Promise<string | undefined> {
  const judged = isMainAgentFor(parts.ctx, agent)
  parts.env.note(session.id, 'main-agent', judged.note)
  if (!judged.main) {
    if (judged.note !== undefined) await parts.report(session)
    return undefined
  }
  const dir = parts.env.dirOf(session)
  if (dir === undefined) await parts.report(session)
  return dir
}

/** Close the candidates that have been open for more than 30 days; the state after, as far as it could be written. */
async function expireOld(parts: NoticeParts, dir: string, session: SessionLike, state: LessonsState): Promise<LessonsState> {
  const { env } = parts
  const old = (current: LessonsState) => openCandidates(current).filter(candidate => env.now().getTime() - Date.parse(candidate.at) > EXPIRE_DAYS * DAY_MS)
  if (old(state).length === 0) return state
  const written = await writeLessons<never>(dir, current => ({
    records: old(current).map(candidate => ({ actor: 'harness' as const, by: { session: session.id, tool: 'expire' }, op: 'expire', id: candidate.id, reason: `open for more than ${EXPIRE_DAYS} days` })),
  }), env.append)
  noteWrite(env, session.id, written)
  env.note(session.id, 'expire', written.status === 'ok' ? undefined : '开了 30 天的候选没能记为过期，下一次再试')
  const again = written.status === 'ok' ? await readLessons(dir) : undefined
  return again?.ok === true ? again.reading.state : state
}

function candidateStep(parts: NoticeParts, agent: AgentLike): ((history: readonly DerivedMessage[], step: { readonly session: SessionLike }) => Promise<UserNotice | undefined>) {
  const { env } = parts
  return async (history, { session }) => {
    try {
      const dir = await mainProject(parts, agent, session)
      if (dir === undefined) return undefined
      await parts.importer.run(session, dir)
      const read = await readLessons(dir)
      if (read.ok) env.note(session.id, 'read', undefined)
      const state = read.ok ? await expireOld(parts, dir, session, read.reading.state) : undefined
      await parts.report(session)
      if (state === undefined) return undefined
      const text = candidateNotice(state)
      if (text === undefined) return undefined
      const digest = createHash('sha256').update(text).digest('hex').slice(0, 16)
      if (lastDigest(history, PENDING_SOURCE) === digest) return undefined
      return createUserNotice(PENDING_SOURCE, 'lesson candidates', text, { candidates: openCandidates(state).length, digest })
    }
    catch (error) {
      parts.warn('candidates', `the candidate notice failed: ${error instanceof Error ? error.message : String(error)}`)
      env.note(session.id, 'read', `候选提醒出错：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }
}

function recurStep(parts: NoticeParts, agent: AgentLike): ((history: readonly DerivedMessage[], step: { readonly session: SessionLike }) => Promise<UserNotice | undefined>) {
  const { env } = parts
  return async (_history, { session }) => {
    try {
      const dir = await mainProject(parts, agent, session)
      if (dir === undefined) return undefined
      const read = await readLessons(dir)
      if (!read.ok) return undefined
      const due = dueRecurrences(read.reading.state, env.now().toISOString())[0]
      if (due === undefined) return undefined
      let recorded = 0
      const written = await writeLessons<never>(dir, (state) => {
        const again = dueRecurrences(state, env.now().toISOString()).find(item => item.lesson.id === due.lesson.id)
        if (again === undefined) return { records: [] }
        recorded = again.sessions
        return { records: [{ actor: 'harness' as const, by: { session: session.id, tool: 'recur' }, op: 'recur-notified', id: due.lesson.id, data: { sessions: again.sessions } }] }
      }, env.append)
      noteWrite(env, session.id, written)
      env.note(session.id, 'recur', written.status === 'ok' ? undefined : '复发提醒没能记下，这一步不发，下一次再试')
      if (written.status !== 'ok' || recorded === 0) return undefined
      return createUserNotice(RECUR_SOURCE, 'lesson recurrence', recurNotice(due.lesson, recorded), { lesson: due.lesson.id, sessions: recorded })
    }
    catch (error) {
      parts.warn('recurrence', `the recurrence notice failed: ${error instanceof Error ? error.message : String(error)}`)
      env.note(session.id, 'recur', `复发提醒出错：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }
}

/** Install both notices on a root agent; the disposers of those that could be installed. */
export function installLessonNotices(parts: NoticeParts, agent: AgentLike): Array<() => void> {
  return [
    installStepNotice(agent, 'lesson candidate notice', () => true, candidateStep(parts, agent), 'lessons'),
    installStepNotice(agent, 'lesson recurrence notice', () => true, recurStep(parts, agent), 'lessons'),
  ].filter((off): off is () => void => off !== undefined)
}
