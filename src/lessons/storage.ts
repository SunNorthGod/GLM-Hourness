/**
 * Where a session's lessons are and how the lessons row reads and writes them
 * (M5 design §5.1 to §5.3, §7.2). All lessons belong to the project and live
 * in one journal, `<project>/.llm/lessons.jsonl` (`d-memory-scope`): there is
 * no user-level lessons journal. The journal is the append-only journal of
 * src/data/journal.ts folded by the lessons model.
 *
 * `LessonsEnv` is everything the tools, the services, the notices, the
 * commands and the command line need from the row: the project directory of
 * a session, the clock, the random source of the ids, whether paths compare
 * without case, and where a problem is told to the row's health.
 */
import { join } from 'node:path'
import { projectDirOf } from '../data/project-root.ts'
import { appendJournal, readJournal, type AppendOptions, type AppendResult, type JournalRecord, type NewRecord, type Plan, type Reading } from '../data/journal.ts'
import { dataService } from '../shared/data-home.ts'
import type { ServiceLookup, SessionLike } from '../shared/dsh-min.ts'
import { judgeRecord, lessonsFold, type LessonsState, type RandomSource, type Refusal } from './model.ts'

export const journalFile = (dir: string): string => join(dir, 'lessons.jsonl')

/** What kind of problem a note to the row's health is about; a later success under the same key clears it. */
export type NoteKey = 'directory' | 'lock' | 'io' | 'read' | 'import' | 'main-agent' | 'expire' | 'recur' | 'failure' | 'path'

/** What the row counts while it runs, for its health and for the service. */
interface LessonCounters {
  /** Candidates the service refused since the host started, by code. */
  readonly rejected: Map<string, number>
  /** Project directories where `propose` failed inside the service since the last time the annotations were looked at. */
  readonly failed: Set<string>
}

export interface LessonsEnv {
  /** The project's data directory for a session; undefined when the session has no project. */
  dirOf(session: SessionLike | undefined): string | undefined
  now(): Date
  readonly random: RandomSource
  /** Whether file paths compare without case (Windows). */
  readonly ignoreCase: boolean
  /** A tool name as the DSH native it runs (`Bash` is `pwsh`): lessons store and match native names. */
  native(tool: string): string
  /** Tell the row what is wrong with one session's lessons (Chinese, for the row health), or `undefined` that it is fine again. */
  note(sessionId: string | undefined, key: NoteKey, text: string | undefined): void
  readonly counters: LessonCounters
  /** The lock environment and the flush a test replaces. */
  readonly append?: Pick<AppendOptions, 'lock' | 'sync'>
}

/** The project directory of a session working directory, as the data service resolves it (with the test override), else from the repository the directory is in. */
export function projectDirFor(ctx: ServiceLookup, cwd: string | undefined): string | undefined {
  const data = dataService(ctx)
  if (data?.projectDirOf !== undefined) return data.projectDirOf(cwd)
  return cwd === undefined ? undefined : projectDirOf(cwd)
}

export type ReadOutcome =
  | { readonly ok: true, readonly reading: Reading<LessonsState> }
  | { readonly ok: false, readonly reason: string }

/** The folded journal of a project directory; a journal that cannot be read comes back with the reason, never as an empty state. */
export async function readLessons(dir: string): Promise<ReadOutcome> {
  try {
    return { ok: true, reading: await readJournal(journalFile(dir), lessonsFold) }
  }
  catch (error) {
    return { ok: false, reason: `${journalFile(dir)}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Append what `plan` decides to the project's lessons journal, under its lock. */
export function writeLessons<Failure>(dir: string, plan: (state: LessonsState) => ReturnType<Plan<LessonsState, Failure>>, options: Pick<AppendOptions, 'lock' | 'sync'> = {}): Promise<AppendResult<Failure>> {
  return appendJournal<LessonsState, Failure>(journalFile(dir), lessonsFold, reading => plan(reading.state), { directory: 'project', row: 'lessons', ...options })
}

/**
 * The state after `records` are applied one after the other at `at`, or the
 * first refusal. The same rules the fold applies when the journal is read,
 * so a write that passes here is never a bad line afterwards.
 */
export function foldNew(state: LessonsState, records: readonly NewRecord[], at: string): LessonsState | Refusal {
  let current = state
  for (const [index, record] of records.entries()) {
    const full: JournalRecord = { v: 1, seq: index + 1, at, ...record }
    const next = judgeRecord(current, full)
    if ('code' in next) return next
    current = next
  }
  return current
}

/** Pass a write's outcome to the row's health notes for the session. */
export function noteWrite(env: LessonsEnv, sessionId: string | undefined, result: AppendResult<unknown>): void {
  if (result.status === 'ok') {
    for (const key of ['directory', 'lock', 'io'] as const) env.note(sessionId, key, undefined)
  }
  else if (result.status === 'busy' && result.lockLost) env.note(sessionId, 'lock', '锁被判陈旧过：有一次写入被放弃，由调用方重试')
  else if (result.status === 'io' && result.stage === 'directory') env.note(sessionId, 'directory', `不能准备项目的 .llm 目录（把 .llm/ 加进 .git/info/exclude，或建目录）：${result.message}；本项目范围的经验暂时不能写`)
  else if (result.status === 'io') env.note(sessionId, 'io', `经验流水写失败（${result.stage}）：${result.message}`)
}
