/**
 * The learning digest reminder (M5 design §3.6 step 2): once in a while the
 * main agent of a project is told that the person has corrected the same
 * kind of thing more than once, and where to look (`learning_signals`). It
 * comes as a notice of the main agent's step, and blocks nothing.
 *
 * It comes when all of these hold: the session has a project; the last
 * `learn-notified` record of the project's memory journal is seven days old
 * or there is none; the agent is the main agent of the project
 * (`isMainAgentFor`); at least one group of corrections has no landing yet or
 * has come back after one; and the groups are not the ones the last
 * reminder named (a digest that has not changed is not sent again). The
 * time is looked at first, in a journal read that the cache answers with one
 * `stat`; the graph is read only when the seven days are over. A digest that
 * does not qualify, and a write that failed, are not tried again by this
 * process for an hour. The record is written before the notice goes out, so
 * a notice that was sent has its record, and a restart, a compaction or
 * another session cannot send it twice.
 */
import { createHash } from 'node:crypto'
import { isMainAgentFor } from '../data/main-agent.ts'
import { createUserNotice, type AgentLike, type ServiceLookup, type SessionLike, type UserNotice } from '../shared/dsh-min.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { readDigest } from './digest.ts'
import { LEARNING_NOTICE, noticeDue, noticeKeys, sameKeys } from './learning.ts'
import { learnNotifiedRecord } from './model.ts'
import { noteWrite, readScope, writeScope, type MemoryEnv } from './storage.ts'

/** The source of the learning digest notice. */
export const LEARNING_SOURCE = 'glm-hourness-learning'

const HOLD_MS = 3_600_000

/** What the reminder needs of the row. */
interface NoticeParts {
  readonly ctx: ServiceLookup
  readonly env: MemoryEnv
  /** Tell the row's health how the session stands. */
  report(session: SessionLike): void
  /** Warn on the console once per key. */
  warn(key: string, text: string): void
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** The installer of the reminder on a root agent; the hold of an hour per project is shared by the agents it installs on. */
export function learningNotice(parts: NoticeParts): (agent: AgentLike) => (() => void) | undefined {
  const { env } = parts
  const held = new Map<string, number>()

  const step = (agent: AgentLike) => async (_history: unknown, { session }: { readonly session: SessionLike }): Promise<UserNotice | undefined> => {
    const now = env.now()
    let dir: string | undefined
    const hold = (): void => { if (dir !== undefined) held.set(dir, now.getTime() + HOLD_MS) }
    try {
      dir = env.places(session).project
      if (dir === undefined || (held.get(dir) ?? 0) > now.getTime()) return undefined
      const read = await readScope('project', dir)
      if (!read.ok) return undefined
      const last = read.read.state.learnNotice
      if (!noticeDue(last, now.toISOString())) return undefined
      const judged = isMainAgentFor(parts.ctx, agent)
      if (!judged.main) {
        env.note(session.id, 'main-agent', judged.note)
        if (judged.note !== undefined) parts.report(session)
        return undefined
      }
      const keys = noticeKeys(await readDigest(env, session))
      if (keys.length === 0 || (last !== undefined && sameKeys(keys, last.keys))) {
        hold()
        return undefined
      }
      const written = await writeScope<'recent'>('project', dir, state => noticeDue(state.learnNotice, env.now().toISOString())
        ? { records: [learnNotifiedRecord(keys, { session: session.id, tool: 'learning' })] }
        : { refused: 'recent' }, env.append)
      noteWrite(env, session.id, written)
      env.note(session.id, 'learn-notice', written.status === 'ok' || written.status === 'refused' ? undefined : '学习摘要的提醒没能记下，这一步不发，一小时后再试')
      // Said only when the judgement decided who got the reminder: a main agent that was found by default (no design row, no record) is a degraded reading.
      if (written.status === 'ok') env.note(session.id, 'main-agent', judged.note)
      parts.report(session)
      if (written.status !== 'ok') {
        hold()
        return undefined
      }
      return createUserNotice(LEARNING_SOURCE, 'learning digest', LEARNING_NOTICE, { groups: keys.length, digest: createHash('sha256').update(keys.join('\n')).digest('hex').slice(0, 16) })
    }
    catch (error) {
      hold()
      parts.warn('learning', `the learning digest reminder failed: ${messageOf(error)}`)
      env.note(session.id, 'learn-notice', `学习摘要的提醒出错：${messageOf(error)}`)
      parts.report(session)
      return undefined
    }
  }

  return agent => installStepNotice(agent, 'learning digest', () => true, step(agent), 'memory')
}
