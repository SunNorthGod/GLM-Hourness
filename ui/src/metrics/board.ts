/**
 * The metrics board's client half minus the page (metrics design §7.6.3):
 * the reader for the project's `view.json` (through
 * `remote.workspaceFiles.readBytes`; a change feed that names the file, or
 * one quiet minute, each ends in a re-read while someone subscribes), the
 * home line's three sentences, the fixed guide line, and the board factory
 * that reads the `hournessMetrics` projection of a session and turns a
 * non-empty `viewFile` into an available board. The projection's values
 * carry only paths or reasons, never a number; every number on this board
 * comes from reading the view file. A failed read keeps the last content
 * and the reason goes to the home line and the top of the page; a file that
 * is not there is 还没有算过, not a failure (§7.6.5). No React here: the
 * specs run this file under Node, the page component lives in ./board.tsx.
 */
import type { ComponentType } from 'react'
import { parseMetricsBoardView, type MetricsBoardView } from '../../../src/shared/metrics-board.ts'
import type { RemoteRoot, SessionsClient, StreamItem, WatchFrame } from '../dsh.ts'
import { boardSessions, type Board, type BoardState } from '../graph/boards.ts'
import { holder } from '../graph/source.ts'

/** How long a subscribed reader waits, without a change frame, before it reads again (§7.6.3). */
const POLL_MS = 60_000

/** Wait `ms`, giving up early when the signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

/** Wait this long after a change frame, so a write is read once. */
const SETTLE_MS = 120

/** How stale a view may get before the home line says so (§7.6.3: 早于 24 小时之前). */
const STALE_MS = 24 * 60 * 60_000

/** The cap the home line shares with the other boards' lines (§7.6.3: 截到上限). */
const LINE_MAX = 60

/** What the reader holds: the parsed view, and why the last read failed when it did. */
export interface MetricsSnapshot {
  /** Why the last read failed (unreadable or wrong shape); null when it read or the file is not there. */
  readonly problem: string | null
  /** The last good content; null before the first successful read and after the file went away. */
  readonly view: MetricsBoardView | null
}

/** One line of at most 60 code points; a longer reason is cut (§7.6.3). */
function lineOf(text: string): string {
  const points = [...text]
  return points.length <= LINE_MAX ? text : `${points.slice(0, LINE_MAX - 1).join('')}…`
}

/** `<M 月 D 日 HH:MM>` in the client's local time, the way the staleness line and the page head stamp a moment. */
export function stampOf(iso: string): string {
  const at = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${at.getMonth() + 1} 月 ${at.getDate()} 日 ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/**
 * The home line of the board (§7.6.3), the first sentence that applies:
 * the file cannot be read or does not hold, the last compute failed, or the
 * numbers stand still for over a day. A file that is not there yet gives no
 * line, and neither does a fresh, healthy view. Ratios never reach the home
 * page — the sentences carry reasons and stamps only.
 */
export function homeLineOf(snapshot: MetricsSnapshot, nowMs: number): string | null {
  if (snapshot.problem !== null) return lineOf(`指标板读不出：${snapshot.problem}`)
  const view = snapshot.view
  if (view === null) return null
  if (view.problem !== null) return lineOf(`指标板没能更新：${view.problem}`)
  if (view.at !== null && nowMs - Date.parse(view.at) > STALE_MS) return lineOf(`指标板的数停在 ${stampOf(view.at)}，之后没算成`)
  return null
}

/** The guide line the board hands the onboarding page (§7.6.3, 38 code points). */
export const GUIDE_LINE = '同意的比例、问法的分布、按模型的比较都在「指标」板上，主 Agent 不转述'

export class MetricsViewSource {
  private snapshot: MetricsSnapshot = { problem: null, view: null }
  private readonly listeners = new Set<() => void>()
  private readonly remote: RemoteRoot
  private readonly sessionId: string
  private readonly path: string
  private readonly pollMs: number
  private running: { readonly controller: AbortController } | undefined
  /** The text the current view was parsed from, so a rewrite with the same content keeps the same objects. */
  private text: string | undefined

  constructor(remote: RemoteRoot, sessionId: string, path: string, pollMs: number = POLL_MS) {
    this.remote = remote
    this.sessionId = sessionId
    this.path = path
    this.pollMs = pollMs
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.running === undefined) {
      const controller = new AbortController()
      this.running = { controller }
      void this.follow(controller).catch(() => {})
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && this.running !== undefined) {
        this.running.controller.abort()
        this.running = undefined
      }
    }
  }

  readonly getSnapshot = (): MetricsSnapshot => this.snapshot

  dispose(): void {
    this.listeners.clear()
    if (this.running !== undefined) {
      this.running.controller.abort()
      this.running = undefined
    }
  }

  /**
   * Read once, then follow the file until aborted: a change frame that
   * names it ends in a settle and a re-read, a feed that ends or fails in
   * one quiet minute without it, and an open silent feed in a re-read after
   * one quiet minute. Every way out waits on a real timer, so the loop
   * never spins without yielding.
   */
  private async follow(controller: AbortController): Promise<void> {
    const signal = controller.signal
    while (!signal.aborted) {
      await this.refresh(signal)
      if (signal.aborted) return
      const stream = this.remote.$stream<WatchFrame>({
        name: `metrics ${this.path}`,
        open: lifetime => this.remote.workspaceFiles.changes(this.sessionId, this.path, lifetime),
        ended: () => new Error(`metrics watch ended: ${this.path}`),
      })
      const dispose = (): void => { void stream.dispose() }
      signal.addEventListener('abort', dispose, { once: true })
      try {
        const due = await Promise.race([
          this.frames(stream, signal),
          sleep(this.pollMs, signal).then(() => 'quiet' as const),
        ])
        await sleep(due === 'change' ? SETTLE_MS : due === 'ended' ? this.pollMs : 0, signal)
      }
      finally {
        signal.removeEventListener('abort', dispose)
        dispose()
      }
    }
  }

  /** `'change'` once a frame names this file, `'ended'` when the feed ends; ready frames bring their own read. */
  private async frames(stream: AsyncIterable<StreamItem<WatchFrame>>, signal: AbortSignal): Promise<'change' | 'ended'> {
    try {
      for await (const item of stream) {
        if (signal.aborted) return 'ended'
        if (item.value.kind === 'ready') {
          item.accept()
          // Changes from before the feed was ready are not replayed: read once more.
          void this.refresh(signal)
          continue
        }
        if (item.value.change.absolutePath.replace(/\\/g, '/') === this.path.replace(/\\/g, '/')) return 'change'
      }
    }
    catch {
      // The feed failed; the quiet sleep below still paces the next read.
    }
    return 'ended'
  }

  private async refresh(signal: AbortSignal): Promise<void> {
    const result = await this.remote.workspaceFiles.readBytes(this.sessionId, this.path, {}, signal)
    if (signal.aborted) return
    const next = this.absorb(result)
    if (next === undefined) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  /** The snapshot a read leaves behind: not-found is 还没有算过 (§7.6.5), a failure keeps the last content, a fresh text becomes the new view. */
  private absorb(result: {
    readonly ok: false
    readonly error: { readonly code: string, readonly message: string }
  } | {
    readonly ok: true
    readonly value: { readonly data: Uint8Array }
  }): MetricsSnapshot | undefined {
    if (!result.ok) {
      if (result.error.code === 'workspace-file/not-found') {
        this.text = undefined
        return { problem: null, view: null }
      }
      return { ...this.snapshot, problem: result.error.message }
    }
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(result.value.data)
    const shape = this.shapeOf(text)
    if (typeof shape === 'string') return { ...this.snapshot, problem: shape }
    if (text === this.text) return { ...this.snapshot, problem: null }
    this.text = text
    return { problem: null, view: shape }
  }

  /** The parsed view, or why the text is not one (§7.6.3: the shape check of src/shared/metrics-board.ts). */
  private shapeOf(text: string): MetricsBoardView | string {
    let value: unknown
    try {
      value = JSON.parse(text)
    }
    catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    try {
      return parseMetricsBoardView(value)
    }
    catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}

const holdAViewSource = holder<MetricsViewSource>()

/** The shared reader of one session's view file; release it when the page or the board lets go. */
export function holdMetricsSource(remote: RemoteRoot, sessionId: string, path: string): { readonly source: MetricsViewSource, release: () => void } {
  const { value, release } = holdAViewSource(`${sessionId}\n${path}`, () => new MetricsViewSource(remote, sessionId, path))
  return { source: value, release }
}

export interface MetricsBoardDeps {
  readonly remote: RemoteRoot
  readonly sessions: SessionsClient
  /** The clock the staleness line judges against; default `Date.now`. Tests inject theirs. */
  readonly now?: () => number
}

const UNAVAILABLE: BoardState = { available: false, homeLine: null, guideLine: null, peakApplies: false }

/**
 * The board over the client's session list (§7.6.3): a session is
 * available when its `hournessMetrics` projection names a view file, and
 * its home line comes from reading that file. It follows the projections
 * (asking once for a cold session) and each held reader; the same state
 * object stays until `available` or the home line moves.
 */
export function metricsBoard(page: ComponentType<{ readonly sessionId: string }>, deps: MetricsBoardDeps): { readonly board: Board, readonly dispose: () => void } {
  const sessions = boardSessions()
  const held = new Map<string, { readonly source: MetricsViewSource, release: () => void, unsubscribe: () => void }>()
  const now = deps.now ?? ((): number => Date.now())

  const release = (sessionId: string): void => {
    const hold = held.get(sessionId)
    if (hold === undefined) return
    hold.unsubscribe()
    hold.release()
    held.delete(sessionId)
  }

  const recompute = (): void => {
    const asked = sessions.listenedWith(deps.sessions.list.getSnapshot().projectionsBySession, id => { void deps.sessions.refreshProjections(id).catch(() => {}) })
    for (const { sessionId, values } of asked) {
      const viewFile = values.hournessMetrics?.viewFile
      if (typeof viewFile === 'string' && viewFile !== '') {
        let hold = held.get(sessionId)
        if (hold === undefined) {
          const shared = holdMetricsSource(deps.remote, sessionId, viewFile)
          hold = { ...shared, unsubscribe: shared.source.subscribe(recompute) }
          held.set(sessionId, hold)
        }
        const next: BoardState = { available: true, homeLine: homeLineOf(hold.source.getSnapshot(), now()), guideLine: GUIDE_LINE, peakApplies: false }
        const current = sessions.state(sessionId)
        if (current === undefined || current.available !== next.available || current.homeLine !== next.homeLine) sessions.remember(sessionId, next)
        continue
      }
      // No value, or none that names a file: the board is not there for this session.
      release(sessionId)
      const current = sessions.state(sessionId)
      if (current === undefined || current.available) sessions.remember(sessionId, UNAVAILABLE)
    }
    // A session nobody listens to any more lets its reader go.
    const listened = sessions.listened()
    for (const sessionId of [...held.keys()]) {
      if (!listened.includes(sessionId)) release(sessionId)
    }
  }

  const unsubscribeList = deps.sessions.list.subscribe(recompute)

  return {
    board: {
      id: 'metrics',
      label: '指标',
      subscribe: (sessionId, listener) => {
        const off = sessions.subscribe(sessionId, listener)
        recompute()
        return off
      },
      snapshot: sessionId => sessions.state(sessionId) ?? UNAVAILABLE,
      Page: page,
    },
    dispose: () => {
      unsubscribeList()
      for (const sessionId of [...held.keys()]) release(sessionId)
    },
  }
}
