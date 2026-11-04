/**
 * The project graph of one session's workspace, read in the renderer
 * (docs/ORCHESTRATION.md §2.10, §13): the node files of docs/graph/nodes
 * through remote.workspaceFiles, parsed with the engine's own rules
 * (src/graph/parse.ts), and followed through the directory's change feed.
 * A change re-reads the files it names, so a write by the engine, the
 * command line, git or a hand edit shows up without a refresh. The source
 * is an external store for useSyncExternalStore; one source per session is
 * shared by every panel that shows it.
 */
import { NODES_DIR, nodeFileNames, parseGraph, type LoadedGraph, type NodeFile } from '../../../src/graph/parse.ts'
import { listOpenItems, type OpenItems } from '../../../src/graph/projection.ts'
import type { RemoteRoot, WatchFrame } from '../dsh.ts'
import { baseName, graphRevisionOf, revisionOfBytes } from './model.ts'

/** The graph directory relative to the session workspace (the graph tools' default, src/graph/tools.ts). */
export const GRAPH_DIR = 'docs/graph'

/** A node file the panel could not read; its node is missing from the panel's graph (the engine reads the files itself). */
interface UnreadableFile {
  /** Path relative to the graph directory, as GraphIssue writes it. */
  readonly file: string
  readonly message: string
}

export type GraphSnapshot =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'failed', readonly message: string }
  | { readonly status: 'ready', readonly graph: LoadedGraph, readonly items: OpenItems, readonly live: boolean, readonly unreadable: readonly UnreadableFile[] }

/** One node file read: its content, gone (deleted since the listing or the change), or a read that failed. */
type FileRead =
  | { readonly kind: 'file', readonly file: NodeFile }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed', readonly message: string }

/** Wait this long after a change frame, so a write of several files is read once. */
const SETTLE_MS = 120

export class GraphSource {
  private snapshot: GraphSnapshot = { status: 'loading' }
  private readonly listeners = new Set<() => void>()
  private readonly files = new Map<string, NodeFile>()
  /** Node files whose last read failed, with the reason, by file name. */
  private readonly unreadable = new Map<string, string>()
  private readonly abort = new AbortController()
  private pending = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private live = false
  private watching = false
  private generation = 0
  private readonly remote: RemoteRoot
  private readonly sessionId: string
  private readonly dir: string

  constructor(remote: RemoteRoot, sessionId: string, dir: string = GRAPH_DIR) {
    this.remote = remote
    this.sessionId = sessionId
    this.dir = dir
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly getSnapshot = (): GraphSnapshot => this.snapshot

  /** First read and the change feed; call once. */
  start(): void {
    void this.retry()
  }

  /** Read again, and follow changes when the feed is not running (the directory may have appeared since). */
  async retry(): Promise<void> {
    await this.reload()
    if (!this.watching) void this.watch()
  }

  /** The graph directory's absolute path, for the local record's key (seen.ts); null when the host cannot name it. */
  async statAbsolute(): Promise<string | null> {
    const result = await this.remote.workspaceFiles.stat(this.sessionId, this.dir, this.abort.signal)
    return result.ok ? result.value.absolutePath : null
  }

  dispose(): void {
    this.abort.abort()
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.listeners.clear()
  }

  private get nodesPath(): string {
    return `${this.dir}/${NODES_DIR}`
  }

  private publish(snapshot: GraphSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  private async readFile(name: string): Promise<FileRead> {
    const result = await this.remote.workspaceFiles.readBytes(this.sessionId, `${this.nodesPath}/${name}`, {}, this.abort.signal)
    if (!result.ok) return result.error.code === 'workspace-file/not-found' ? { kind: 'gone' } : { kind: 'failed', message: result.error.message }
    const { data } = result.value
    return { kind: 'file', file: { name, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(data), revision: await revisionOfBytes(data) } }
  }

  /** Keep one read: the file, or its absence and why. A failed read is kept apart instead of dropping the node silently. */
  private take(name: string, read: FileRead): void {
    if (read.kind === 'file') this.files.set(name, read.file)
    else this.files.delete(name)
    if (read.kind === 'failed') this.unreadable.set(name, read.message)
    else this.unreadable.delete(name)
  }

  /** Read every node file again. */
  async reload(): Promise<void> {
    const generation = ++this.generation
    const listing = await this.remote.workspaceFiles.list(this.sessionId, this.nodesPath, this.abort.signal)
    if (this.abort.signal.aborted || generation !== this.generation) return
    if (!listing.ok) {
      if (listing.error.code === 'workspace-file/not-found' || listing.error.code === 'workspace-file/not-directory') this.publish({ status: 'missing' })
      else this.publish({ status: 'failed', message: listing.error.message })
      return
    }
    const names = nodeFileNames(listing.value.entries.filter(entry => entry.type === 'file').map(entry => entry.name))
    const read = await Promise.all(names.map(name => this.readFile(name)))
    if (this.abort.signal.aborted || generation !== this.generation) return
    this.files.clear()
    this.unreadable.clear()
    for (const [index, name] of names.entries()) this.take(name, read[index])
    await this.rebuild()
  }

  private async rebuild(): Promise<void> {
    const files = [...this.files.values()]
    const revisions = new Map(files.map(file => [file.name.slice(0, -'.json'.length), file.revision]))
    const graph = parseGraph(files, await graphRevisionOf(revisions))
    if (this.abort.signal.aborted) return
    const unreadable = [...this.unreadable].map(([name, message]) => ({ file: `${NODES_DIR}/${name}`, message }))
    this.publish({ status: 'ready', graph, items: listOpenItems(graph), live: this.live, unreadable })
  }

  /** Follow the nodes directory; a feed that cannot start leaves the graph readable and not live. */
  private async watch(): Promise<void> {
    if (this.abort.signal.aborted || this.snapshot.status !== 'ready') return
    this.watching = true
    const stream = this.remote.$stream<WatchFrame>({
      name: `graph ${this.nodesPath}`,
      open: lifetime => this.remote.workspaceFiles.changes(this.sessionId, this.nodesPath, lifetime),
      ended: () => new Error(`graph watch ended: ${this.nodesPath}`),
    })
    const stop = (): void => { void stream.dispose() }
    this.abort.signal.addEventListener('abort', stop, { once: true })
    try {
      for await (const item of stream) {
        if (this.abort.signal.aborted) return
        if (item.value.kind === 'ready') {
          item.accept()
          this.live = true
          // Changes that happened before the feed was ready are not replayed: read once more.
          await this.reload()
          continue
        }
        this.changed(baseName(item.value.change.absolutePath))
      }
    }
    catch {
      // The feed failed or ended; the graph stays readable without live updates.
    }
    finally {
      this.abort.signal.removeEventListener('abort', stop)
      this.watching = false
      this.live = false
      if (this.snapshot.status === 'ready') this.publish({ ...this.snapshot, live: false })
    }
  }

  private changed(name: string): void {
    // A frame for the directory itself, or for a name that is not a node file, re-reads everything.
    this.pending.add(name.endsWith('.json') && !name.startsWith('.') ? name : '*')
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      const names = this.pending
      this.pending = new Set()
      void this.apply(names)
    }, SETTLE_MS)
  }

  private async apply(names: ReadonlySet<string>): Promise<void> {
    if (names.has('*')) {
      await this.reload()
      return
    }
    const generation = this.generation
    const read = await Promise.all([...names].map(async name => [name, await this.readFile(name)] as const))
    if (this.abort.signal.aborted || generation !== this.generation) return
    for (const [name, file] of read) this.take(name, file)
    await this.rebuild()
  }
}

interface Held<T> {
  readonly value: T
  count: number
}

/**
 * One shared resource per key while someone holds it: the first holder
 * makes it, the last release disposes it. The graph panel's sources and the
 * lessons page's sources share this shape.
 */
export function holder<T extends { dispose: () => void }>(): (key: string, make: () => T) => { readonly value: T, release: () => void } {
  const held = new Map<string, Held<T>>()
  return (key, make) => {
    let entry = held.get(key)
    if (entry === undefined) {
      entry = { value: make(), count: 0 }
      held.set(key, entry)
    }
    entry.count++
    const current = entry
    let released = false
    return {
      value: current.value,
      release: () => {
        if (released) return
        released = true
        current.count--
        if (current.count > 0) return
        current.value.dispose()
        if (held.get(key) === current) held.delete(key)
      },
    }
  }
}

const holdGraphSource = holder<GraphSource>()

/** The shared source of a session's graph; release it when the panel unmounts. */
export function holdSource(remote: RemoteRoot, sessionId: string): { readonly source: GraphSource, release: () => void } {
  const { value, release } = holdGraphSource(sessionId, () => {
    const source = new GraphSource(remote, sessionId)
    source.start()
    return source
  })
  return { source: value, release }
}
