/**
 * The reader behind the panel's pages that show files the host writes (the
 * lessons page's journals, the loop board's view.json): every file is read
 * whole through remote.workspaceFiles.readBytes, followed through its
 * changes feed, and re-checked by size and version every 15 s while the
 * page that started it is visible (the poll runs between start and stop).
 * Each read is handed to `took`: the text, `missing` for a file that is not
 * there yet (not a failure), or `failed` with the reason. A read that a
 * newer read of the same file overtook is dropped. No React here.
 */
import type { RemoteRoot, WatchFrame } from '../dsh.ts'

/** What one read of a file gave. */
export type WatchedRead =
  | { readonly kind: 'text', readonly text: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed', readonly message: string }

/** Wait this long after a change frame, so a write of several records is read once. */
const SETTLE_MS = 120

/** How often the visible page re-checks the files by size and version. */
export const POLL_MS = 15_000

/** One file: its identity at the last read and the number of the latest read. */
interface Watched {
  readonly index: number
  readonly path: string
  version: string | undefined
  bytes: number | undefined
  generation: number
}

export class WatchedFiles {
  private readonly files: readonly Watched[]
  private readonly remote: RemoteRoot
  private readonly sessionId: string
  private readonly label: string
  private readonly took: (index: number, read: WatchedRead) => void
  private readonly pollMs: number
  private abort = new AbortController()
  private timer: ReturnType<typeof setInterval> | undefined
  private settle: ReturnType<typeof setTimeout> | undefined
  private readonly dirty = new Set<Watched>()

  /** `took` gets the index of the file in `paths` and what its read gave; `label` names the feeds. */
  constructor(remote: RemoteRoot, sessionId: string, paths: readonly string[], label: string, took: (index: number, read: WatchedRead) => void, pollMs: number = POLL_MS) {
    this.remote = remote
    this.sessionId = sessionId
    this.label = label
    this.took = took
    this.pollMs = pollMs
    this.files = paths.map((path, index) => ({ index, path, version: undefined, bytes: undefined, generation: 0 }))
  }

  /** First read, the change feeds and the poll; again on every start after a stop. */
  start(): void {
    this.abort = new AbortController()
    for (const file of this.files) void this.read(file)
    this.watch()
    this.timer = setInterval(() => { void this.poll() }, this.pollMs)
  }

  stop(): void {
    this.abort.abort()
    if (this.timer !== undefined) clearInterval(this.timer)
    if (this.settle !== undefined) clearTimeout(this.settle)
    this.timer = undefined
    this.settle = undefined
  }

  private async read(file: Watched): Promise<void> {
    const generation = ++file.generation
    const result = await this.remote.workspaceFiles.readBytes(this.sessionId, file.path, {}, this.abort.signal)
    if (this.abort.signal.aborted || generation !== file.generation) return
    if (!result.ok) {
      if (result.error.code === 'workspace-file/not-found') {
        // A file that is not there yet: an empty state, not a failure.
        file.version = undefined
        file.bytes = undefined
        this.took(file.index, { kind: 'missing' })
      }
      // Keep the last content; the reader says why.
      else this.took(file.index, { kind: 'failed', message: result.error.message })
      return
    }
    const { version, bytes, data } = result.value
    file.version = version
    file.bytes = bytes
    this.took(file.index, { kind: 'text', text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(data) })
  }

  /** Follow each file through its change feed; a feed that cannot start leaves the poll. */
  private watch(): void {
    for (const file of this.files) {
      const stream = this.remote.$stream<WatchFrame>({
        name: `${this.label} ${file.path}`,
        open: lifetime => this.remote.workspaceFiles.changes(this.sessionId, file.path, lifetime),
        ended: () => new Error(`${this.label} watch ended: ${file.path}`),
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
              void this.read(file)
              continue
            }
            this.changed(file, item.value.change.absolutePath)
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

  /** A change frame for this file: read it once the writes have settled. Frames for other paths are not ours. */
  private changed(file: Watched, absolutePath: string): void {
    if (absolutePath.replace(/\\/g, '/') !== file.path.replace(/\\/g, '/')) return
    this.dirty.add(file)
    if (this.settle !== undefined) return
    this.settle = setTimeout(() => {
      this.settle = undefined
      for (const pending of this.dirty) void this.read(pending)
      this.dirty.clear()
    }, SETTLE_MS)
  }

  /** The visible page's check: re-read a file only when its size or version moved. */
  private async poll(): Promise<void> {
    for (const file of this.files) {
      if (this.abort.signal.aborted) return
      const stat = await this.remote.workspaceFiles.stat(this.sessionId, file.path, this.abort.signal)
      if (this.abort.signal.aborted) return
      if (!stat.ok) {
        // A file that went away, or a stat that failed: read, so the page follows or keeps saying why.
        if (file.version !== undefined || stat.error.code === 'workspace-file/not-found') void this.read(file)
        continue
      }
      if (stat.value.version !== file.version || stat.value.bytes !== file.bytes) void this.read(file)
    }
  }
}
