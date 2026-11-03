/**
 * The reader behind the lessons page (M5 design §4.7): it reads the
 * project's lessons journal and the two memory journals whole through
 * remote.workspaceFiles.readBytes, folds them with the pure functions of
 * src/lessons/model.ts and src/memory/model.ts, follows the journals
 * through the changes feeds, and re-checks every journal by size and
 * version every 15 s while the page is visible (the poll runs while
 * someone subscribes). A failed read keeps the last content and the reason
 * goes to the top of the page; a journal that is not there yet is an empty
 * state, not a failure. An external store for useSyncExternalStore, one
 * per session and set of paths, shared through holdLessonsSource.
 */
import { parseRecord } from '../../../src/data/record.ts'
import type { Fold } from '../../../src/data/record.ts'
import { lessonsFold, type LessonsState } from '../../../src/lessons/model.ts'
import { memoryFold, type MemoryState } from '../../../src/memory/model.ts'
import type { RemoteRoot, WatchFrame } from '../dsh.ts'
import { holder } from '../graph/source.ts'
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

/** Wait this long after a change frame, so a write of several records is read once. */
const SETTLE_MS = 120

/** How often the visible page re-checks the journals by size and version (design §4.7). */
const POLL_MS = 15_000

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

/** One journal the page reads: its last content, its identity at that read, and why the last read failed. */
interface Journal {
  readonly kind: keyof typeof LABELS
  readonly path: string
  state: LessonsState | MemoryState | undefined
  version: string | undefined
  bytes: number | undefined
  problem: string | undefined
  readAtLeastOnce: boolean
  generation: number
}

export class LessonsSource {
  private snapshot: LessonsSnapshot = { loading: true, problem: null, model: buildLessonsPage(null, memoryRows(null, null, Date.now()), Date.now()) }
  private readonly listeners = new Set<() => void>()
  private readonly journals: readonly Journal[]
  private readonly remote: RemoteRoot
  private readonly sessionId: string
  private readonly pollMs: number
  private abort = new AbortController()
  private timer: ReturnType<typeof setInterval> | undefined
  private settle: ReturnType<typeof setTimeout> | undefined
  private readonly dirty = new Set<Journal>()

  constructor(remote: RemoteRoot, sessionId: string, paths: LessonsPaths, pollMs: number = POLL_MS) {
    this.remote = remote
    this.sessionId = sessionId
    this.pollMs = pollMs
    this.journals = ([
      ['lessons', paths.lessons],
      ['project', paths.project],
      ['user', paths.user],
    ] as const).flatMap(([kind, path]) => path === null ? [] : [{
      kind, path, state: undefined, version: undefined, bytes: undefined, problem: undefined, readAtLeastOnce: false, generation: 0,
    }])
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  readonly getSnapshot = (): LessonsSnapshot => this.snapshot

  dispose(): void {
    this.stop()
    this.listeners.clear()
  }

  /** First read, the change feeds and the poll; again on every re-mount after a stop. */
  private start(): void {
    this.abort = new AbortController()
    void this.readAll()
    this.watch()
    this.timer = setInterval(() => { void this.poll() }, this.pollMs)
  }

  private stop(): void {
    this.abort.abort()
    if (this.timer !== undefined) clearInterval(this.timer)
    if (this.settle !== undefined) clearTimeout(this.settle)
    this.timer = undefined
    this.settle = undefined
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

  /** Read every journal once; the first pass ends the loading state even where a read failed. */
  private async readAll(): Promise<void> {
    await Promise.all(this.journals.map(journal => this.read(journal)))
  }

  private async read(journal: Journal): Promise<void> {
    const generation = ++journal.generation
    const result = await this.remote.workspaceFiles.readBytes(this.sessionId, journal.path, {}, this.abort.signal)
    if (this.abort.signal.aborted || generation !== journal.generation) return
    journal.readAtLeastOnce = true
    if (!result.ok) {
      if (result.error.code === 'workspace-file/not-found') {
        // A journal that is not there yet: an empty state, not a failure.
        journal.state = this.empty(journal)
        journal.version = undefined
        journal.bytes = undefined
        journal.problem = undefined
      }
      else {
        // Keep the last content; the reason goes to the top of the page.
        journal.problem = result.error.message
      }
      this.publish()
      return
    }
    const { version, bytes, data } = result.value
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(data)
    journal.state = this.fold(journal, text)
    journal.version = version
    journal.bytes = bytes
    journal.problem = undefined
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

  /** Follow each journal through its change feed; a feed that cannot start leaves the poll. */
  private watch(): void {
    for (const journal of this.journals) {
      const stream = this.remote.$stream<WatchFrame>({
        name: `lessons ${journal.path}`,
        open: lifetime => this.remote.workspaceFiles.changes(this.sessionId, journal.path, lifetime),
        ended: () => new Error(`lessons watch ended: ${journal.path}`),
      })
      const stop = (): void => { void stream.dispose() }
      this.abort.signal.addEventListener('abort', stop, { once: true })
      void (async () => {
        try {
          for await (const item of stream) {
            if (this.abort.signal.aborted) return
            if (item.value.kind === 'ready') {
              item.accept()
              // Changes from before the feed was ready are not replayed: read once more.
              void this.read(journal)
              continue
            }
            this.changed(journal, item.value.change.absolutePath)
          }
        }
        catch {
          // The feed failed or ended; the poll still re-checks every 15 s.
        }
        finally {
          this.abort.signal.removeEventListener('abort', stop)
        }
      })()
    }
  }

  /** A change frame for this journal: read it once the writes have settled. Frames for other paths are not ours. */
  private changed(journal: Journal, absolutePath: string): void {
    if (absolutePath.replace(/\\/g, '/') !== journal.path.replace(/\\/g, '/')) return
    this.dirty.add(journal)
    if (this.settle !== undefined) return
    this.settle = setTimeout(() => {
      this.settle = undefined
      for (const pending of this.dirty) void this.read(pending)
      this.dirty.clear()
    }, SETTLE_MS)
  }

  /** The visible page's check: re-read a journal only when its size or version moved. */
  private async poll(): Promise<void> {
    for (const journal of this.journals) {
      if (this.abort.signal.aborted) return
      const stat = await this.remote.workspaceFiles.stat(this.sessionId, journal.path, this.abort.signal)
      if (this.abort.signal.aborted) return
      if (!stat.ok) {
        // A journal that went away, or a stat that failed: read, so the page follows or keeps saying why.
        if (journal.version !== undefined || stat.error.code === 'workspace-file/not-found') void this.read(journal)
        continue
      }
      if (stat.value.version !== journal.version || stat.value.bytes !== journal.bytes) void this.read(journal)
    }
  }
}


const holdAJournalSource = holder<LessonsSource>()
/** The shared source of one session's journals; release it when the page unmounts. */
export function holdLessonsSource(remote: RemoteRoot, sessionId: string, paths: LessonsPaths): { readonly source: LessonsSource, release: () => void } {
  const key = `${sessionId}\n${paths.lessons ?? ''}\n${paths.project ?? ''}\n${paths.user ?? ''}`
  const { value, release } = holdAJournalSource(key, () => new LessonsSource(remote, sessionId, paths))
  return { source: value, release }
}
