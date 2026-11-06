/**
 * The reader behind a board page that shows one `view.json` the host writes
 * (the loop board's, ui/src/loops/source.ts; the rules board's,
 * ui/src/rules/source.ts): the file is read whole, followed through its
 * changes feed and re-checked by size and version every 15 s while someone
 * subscribes (./watched-files.ts), parsed by the board's own reader and made
 * into the board's model. A failed read, or a text that is not a view, keeps
 * the last content and says why; a file that is not there yet is no view,
 * not a failure. An external store for useSyncExternalStore; one per
 * session and file, shared through the holder viewFileHolder makes.
 */
import type { RemoteRoot } from '../dsh.ts'
import { holder } from './source.ts'
import { POLL_MS, WatchedFiles, type WatchedRead } from './watched-files.ts'

export interface ViewFileSnapshot<M> {
  /** The first read of view.json has not finished yet. */
  readonly loading: boolean
  /** Why the last read failed, for the top of the page; null when it read. */
  readonly problem: string | null
  /** The host has not written a view.json for this project yet. */
  readonly missing: boolean
  /** The model of the last good content. */
  readonly model: M
}

/** What one board's reader does with the file: its feed label, its parser and model, and its words for the two failures. */
export interface ViewFileSpec<V, M> {
  readonly label: string
  /** The view in a file's text, or undefined when the text is not one (another version, a cut write). */
  readonly parse: (text: string) => V | undefined
  /** The model of a view; null while there is none. */
  readonly build: (view: V | null) => M
  /** The sentence for a read that failed with `message`. */
  readonly failed: (message: string) => string
  /** The sentence for a text that is not a view. */
  readonly unreadable: string
}

export class ViewFileSource<V, M> {
  private snapshot: ViewFileSnapshot<M>
  private readonly listeners = new Set<() => void>()
  private readonly file: WatchedFiles
  private readonly spec: ViewFileSpec<V, M>

  constructor(remote: RemoteRoot, sessionId: string, viewFile: string, spec: ViewFileSpec<V, M>, pollMs: number = POLL_MS) {
    this.spec = spec
    this.snapshot = { loading: true, problem: null, missing: false, model: spec.build(null) }
    this.file = new WatchedFiles(remote, sessionId, [viewFile], spec.label, (_index, read) => { this.took(read) }, pollMs)
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.file.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.file.stop()
    }
  }

  readonly getSnapshot = (): ViewFileSnapshot<M> => this.snapshot

  dispose(): void {
    this.file.stop()
    this.listeners.clear()
  }

  private took(read: WatchedRead): void {
    const last = this.snapshot
    if (read.kind === 'missing') this.snapshot = { loading: false, problem: null, missing: true, model: this.spec.build(null) }
    else if (read.kind === 'failed') this.snapshot = { ...last, loading: false, problem: this.spec.failed(read.message) }
    else {
      const view = this.spec.parse(read.text)
      this.snapshot = view === undefined
        ? { ...last, loading: false, problem: this.spec.unreadable }
        : { loading: false, problem: null, missing: false, model: this.spec.build(view) }
    }
    for (const listener of this.listeners) listener()
  }
}

/** The holder of one kind of source: one per session and view.json, released with the last holder. */
export function viewFileHolder<S extends { dispose: () => void }>(make: (remote: RemoteRoot, sessionId: string, viewFile: string) => S): (remote: RemoteRoot, sessionId: string, viewFile: string) => { readonly source: S, release: () => void } {
  const hold = holder<S>()
  return (remote, sessionId, viewFile) => {
    const { value, release } = hold(`${sessionId}\n${viewFile}`, () => make(remote, sessionId, viewFile))
    return { source: value, release }
  }
}
