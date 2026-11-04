/**
 * The reader behind the loop board's page (loop board design 0.6 §8.4): it
 * reads the project's view.json, which the host that runs the board writes,
 * whole, follows it through the changes feed and re-checks it by size and
 * version every 15 s while the page is visible (the panel's file reader,
 * ../graph/watched-files.ts), and makes the page model of it (./model.ts).
 * The page reads nothing else of the board's. A failed read, or a file that
 * is not a view, keeps the last content and the reason goes to the top of
 * the page; a view.json that is not there yet is no view, not a failure. An
 * external store for useSyncExternalStore, one per session and file, shared
 * through holdLoopsSource.
 */
import type { LoopsView } from '../../../src/loops/view.ts'
import type { RemoteRoot } from '../dsh.ts'
import { holder } from '../graph/source.ts'
import { POLL_MS, WatchedFiles, type WatchedRead } from '../graph/watched-files.ts'
import { buildLoopsPage, type LoopsPageModel } from './model.ts'

export interface LoopsSnapshot {
  /** The first read of view.json has been attempted. */
  readonly loading: boolean
  /** Why the last read failed, for the top of the page; null when it read. */
  readonly problem: string | null
  /** The board has not written a view.json for this project yet. */
  readonly missing: boolean
  /** The last good content. */
  readonly model: LoopsPageModel
}

/** The view in a file's text, or undefined when the text is not one (another version, a cut write). */
function parseView(text: string): LoopsView | undefined {
  try {
    const value = JSON.parse(text) as Partial<LoopsView> | null
    return value?.version === 1 && Array.isArray(value.entries) && Array.isArray(value.attention) && Array.isArray(value.recent) && typeof value.waiting === 'number'
      ? value as LoopsView
      : undefined
  }
  catch {
    return undefined
  }
}

export class LoopsSource {
  private snapshot: LoopsSnapshot = { loading: true, problem: null, missing: false, model: buildLoopsPage(null) }
  private readonly listeners = new Set<() => void>()
  private readonly file: WatchedFiles

  constructor(remote: RemoteRoot, sessionId: string, viewFile: string, pollMs: number = POLL_MS) {
    this.file = new WatchedFiles(remote, sessionId, [viewFile], 'loops', (_index, read) => { this.took(read) }, pollMs)
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.file.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.file.stop()
    }
  }

  readonly getSnapshot = (): LoopsSnapshot => this.snapshot

  dispose(): void {
    this.file.stop()
    this.listeners.clear()
  }

  private took(read: WatchedRead): void {
    const last = this.snapshot
    if (read.kind === 'missing') this.snapshot = { loading: false, problem: null, missing: true, model: buildLoopsPage(null) }
    else if (read.kind === 'failed') this.snapshot = { ...last, loading: false, problem: `循环板读不出：${read.message}` }
    else {
      const view = parseView(read.text)
      this.snapshot = view === undefined
        ? { ...last, loading: false, problem: '循环板的 view.json 读不懂，下面是上一次读到的样子' }
        : { loading: false, problem: null, missing: false, model: buildLoopsPage(view) }
    }
    for (const listener of this.listeners) listener()
  }
}

const holdAViewSource = holder<LoopsSource>()
/** The shared source of one session's view.json; release it when the page unmounts. */
export function holdLoopsSource(remote: RemoteRoot, sessionId: string, viewFile: string): { readonly source: LoopsSource, release: () => void } {
  const { value, release } = holdAViewSource(`${sessionId}\n${viewFile}`, () => new LoopsSource(remote, sessionId, viewFile))
  return { source: value, release }
}
