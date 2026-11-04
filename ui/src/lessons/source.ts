/**
 * The reader behind the lessons page (M5 design §4.7): it reads the
 * project's lessons journal and the two memory journals whole, follows them
 * through the changes feeds and re-checks them by size and version every
 * 15 s while the page is visible (the panel's file reader,
 * ../graph/watched-files.ts, runs while someone subscribes), and folds them
 * with the pure functions of src/lessons/model.ts and src/memory/model.ts.
 * A failed read keeps the last content and the reason goes to the top of
 * the page; a journal that is not there yet is an empty state, not a
 * failure. An external store for useSyncExternalStore, one per session and
 * set of paths, shared through holdLessonsSource.
 */
import { parseRecord } from '../../../src/data/record.ts'
import type { Fold } from '../../../src/data/record.ts'
import { lessonsFold, type LessonsState } from '../../../src/lessons/model.ts'
import { memoryFold, type MemoryState } from '../../../src/memory/model.ts'
import type { RemoteRoot } from '../dsh.ts'
import { holder } from '../graph/source.ts'
import { POLL_MS, WatchedFiles, type WatchedRead } from '../graph/watched-files.ts'
import { buildLessonsPage, memoryRows, type LessonsPageModel } from './model.ts'

/** The journals of one session, as the two projections hand them over; null when that journal does not apply. */
export interface LessonsPaths {
  readonly lessons: string | null
  readonly project: string | null
  readonly user: string | null
}

export interface LessonsSnapshot {
  /** The first read of every journal has been attempted. */
  readonly loading: boolean
  /** Why the last read failed, for the top of the page; null when everything read. */
  readonly problem: string | null
  /** The last good content. */
  readonly model: LessonsPageModel
}

/** The labels the problem line names the journals by. */
const LABELS = { lessons: '经验', project: '本项目记忆', user: '你的记忆' } as const

/** The fold of whole journal text, the way the Node reader folds it: a last line without a newline is a write in progress and is ignored, a line that does not parse or does not hold is skipped. */
export function foldJournalText<State>(text: string, fold: Fold<State>): State {
  const lines = text.split('\n')
  lines.pop()
  let state = fold.empty()
  for (const raw of lines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.trim() === '') continue
    const record = parseRecord(line)
    if (typeof record === 'string') continue
    const step = fold.apply(state, record)
    if (!('bad' in step)) state = step.state
  }
  return state
}

/** One journal the page reads: its last content and why the last read failed. */
interface Journal {
  readonly kind: keyof typeof LABELS
  readonly path: string
  state: LessonsState | MemoryState | undefined
  problem: string | undefined
  readAtLeastOnce: boolean
}

export class LessonsSource {
  private snapshot: LessonsSnapshot = { loading: true, problem: null, model: buildLessonsPage(null, memoryRows(null, null, Date.now()), Date.now()) }
  private readonly listeners = new Set<() => void>()
  private readonly journals: readonly Journal[]
  private readonly files: WatchedFiles

  constructor(remote: RemoteRoot, sessionId: string, paths: LessonsPaths, pollMs: number = POLL_MS) {
    this.journals = ([
      ['lessons', paths.lessons],
      ['project', paths.project],
      ['user', paths.user],
    ] as const).flatMap(([kind, path]) => path === null ? [] : [{ kind, path, state: undefined, problem: undefined, readAtLeastOnce: false }])
    this.files = new WatchedFiles(remote, sessionId, this.journals.map(journal => journal.path), 'lessons', (index, read) => { this.took(index, read) }, pollMs)
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.files.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.files.stop()
    }
  }

  readonly getSnapshot = (): LessonsSnapshot => this.snapshot

  dispose(): void {
    this.files.stop()
    this.listeners.clear()
  }

  private publish(): void {
    const now = Date.now()
    const problems = this.journals.filter(journal => journal.problem !== undefined).map(journal => `${LABELS[journal.kind]}读不出：${journal.problem}`)
    const lessons = this.journals.find(journal => journal.kind === 'lessons')?.state as LessonsState | undefined
    const project = this.journals.find(journal => journal.kind === 'project')?.state as MemoryState | undefined
    const user = this.journals.find(journal => journal.kind === 'user')?.state as MemoryState | undefined
    this.snapshot = {
      loading: this.journals.some(journal => !journal.readAtLeastOnce),
      problem: problems.length === 0 ? null : problems.join('；'),
      model: buildLessonsPage(lessons ?? null, memoryRows(project ?? null, user ?? null, now), now),
    }
    for (const listener of this.listeners) listener()
  }

  /** One read of a journal: the first ends the loading state even where it failed. */
  private took(index: number, read: WatchedRead): void {
    const journal = this.journals[index]
    if (journal === undefined) return
    journal.readAtLeastOnce = true
    if (read.kind === 'failed') {
      // Keep the last content; the reason goes to the top of the page.
      journal.problem = read.message
    }
    else {
      journal.state = read.kind === 'missing' ? this.empty(journal) : this.fold(journal, read.text)
      journal.problem = undefined
    }
    this.publish()
  }

  private empty(journal: Journal): LessonsState | MemoryState {
    return journal.kind === 'lessons' ? lessonsFold.empty() : memoryFold(journal.kind === 'project' ? 'project' : 'all').empty()
  }

  private fold(journal: Journal, text: string): LessonsState | MemoryState {
    return journal.kind === 'lessons'
      ? foldJournalText(text, lessonsFold)
      : foldJournalText(text, memoryFold(journal.kind === 'project' ? 'project' : 'all'))
  }
}

const holdAJournalSource = holder<LessonsSource>()
/** The shared source of one session's journals; release it when the page unmounts. */
export function holdLessonsSource(remote: RemoteRoot, sessionId: string, paths: LessonsPaths): { readonly source: LessonsSource, release: () => void } {
  const key = `${sessionId}\n${paths.lessons ?? ''}\n${paths.project ?? ''}\n${paths.user ?? ''}`
  const { value, release } = holdAJournalSource(key, () => new LessonsSource(remote, sessionId, paths))
  return { source: value, release }
}
