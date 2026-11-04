/**
 * Fakes of the client services the panel's pages read, for the specs that
 * run the page sources and the boards under Node (lessons-panel-model.spec,
 * loops-panel-model.spec): a Remote face over files held in memory with a
 * change feed the test drives, failing reads and stats, and a session list
 * whose projections the test sets.
 */
import type { ProjectionValues, RemoteRoot, SessionsClient, StreamItem, WatchFrame } from '../ui/src/dsh.ts'

/**
 * One changes feed of the fake remote: the test pushes frames, the reader
 * pulls them until the feed is disposed. A frame the reader does not wait
 * for is queued.
 */
function fakeFeed(): {
  readonly deliver: (frame: WatchFrame) => void
  readonly open: <T>() => AsyncIterable<StreamItem<T>> & { dispose(): Promise<void> }
} {
  const queued: WatchFrame[] = []
  let waiting: (() => void) | undefined
  let over = false
  return {
    deliver: frame => {
      queued.push(frame)
      waiting?.()
    },
    open: <T>() => ({
      async *[Symbol.asyncIterator]() {
        while (!over) {
          if (queued.length === 0) {
            await new Promise<void>(resolve => { waiting = resolve })
            continue
          }
          yield { value: queued.shift() as T, accept: (): void => {} }
        }
      },
      dispose: () => {
        over = true
        waiting?.()
        return Promise.resolve()
      },
    }),
  }
}

type RemoteResult =
  | { readonly ok: true, readonly value: { readonly absolutePath: string, readonly version: string, readonly bytes?: number, readonly data: Uint8Array } }
  | { readonly ok: false, readonly error: { readonly code: string, readonly message: string } }

/** A Remote face over absolute paths held in memory, with a change feed the test drives and failing reads. */
export function fakeRemote(files: { readonly [path: string]: string }): {
  readonly remote: RemoteRoot
  readonly push: (frame: WatchFrame) => void
  readonly fail: (path: string, message: string | undefined) => void
  readonly readsOf: (path: string) => number
  readonly write: (path: string, text: string) => Promise<void>
} {
  const contents = new Map(Object.entries(files))
  const failures = new Map<string, string>()
  const reads = new Map<string, number>()
  /** Every open feed; a pushed frame is broadcast and the reader filters by its path. */
  const feeds = new Set<ReturnType<typeof fakeFeed>['deliver']>()
  const fail = (path: string, message: string | undefined): void => {
    if (message === undefined) failures.delete(path)
    else failures.set(path, message)
  }
  const read = (path: string): Promise<RemoteResult> => {
    const failure = failures.get(path)
    if (failure !== undefined) return Promise.resolve({ ok: false, error: { code: 'workspace-file/unknown', message: failure } })
    const text = contents.get(path)
    if (text === undefined) return Promise.resolve({ ok: false, error: { code: 'workspace-file/not-found', message: path } })
    reads.set(path, (reads.get(path) ?? 0) + 1)
    return Promise.resolve({ ok: true, value: { absolutePath: path, version: String(text.length), bytes: text.length, data: new TextEncoder().encode(text) } })
  }
  const remote: RemoteRoot = {
    workspaceFiles: {
      list: () => Promise.resolve({ ok: false as const, error: { code: 'workspace-file/not-found', message: 'not used' } }),
      readBytes: (_session, path) => read(path),
      stat: (_session, path) => {
        const failure = failures.get(path)
        if (failure !== undefined) return Promise.resolve({ ok: false, error: { code: 'workspace-file/unknown', message: failure } })
        const text = contents.get(path)
        return text === undefined
          ? Promise.resolve({ ok: false, error: { code: 'workspace-file/not-found', message: path } })
          : Promise.resolve({ ok: true, value: { absolutePath: path, version: String(text.length), bytes: text.length } })
      },
      changes: () => undefined,
    },
    commands: { execute: () => Promise.resolve({ ok: true, value: undefined }) },
    $stream: <T>() => {
      const feed = fakeFeed()
      feeds.add(feed.deliver)
      return feed.open<T>()
    },
  }
  return {
    remote,
    push: frame => {
      for (const deliver of feeds) deliver(frame)
    },
    fail,
    readsOf: path => reads.get(path) ?? 0,
    write: (path, text) => {
      contents.set(path, text)
      return Promise.resolve()
    },
  }
}

/** A session list whose projections the test sets; a cold session asked for its values gets `cold`. */
export function fakeSessions(initial: { readonly [sessionId: string]: ProjectionValues | undefined }, cold: ProjectionValues): {
  readonly sessions: SessionsClient
  readonly setProjections: (sessionId: string, values: ProjectionValues | undefined) => void
  readonly refreshCountOf: (sessionId: string) => number
} {
  const projections: Record<string, { readonly values: ProjectionValues, readonly state?: string } | undefined> = Object.fromEntries(Object.entries(initial).map(([id, values]) => [id, values === undefined ? undefined : { values }]))
  const listeners = new Set<() => void>()
  const refreshes = new Map<string, number>()
  const sessions: SessionsClient = {
    list: {
      getSnapshot: () => ({ projectionsBySession: projections, byId: {} }),
      subscribe: listener => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    refreshProjections: sessionId => {
      refreshes.set(sessionId, (refreshes.get(sessionId) ?? 0) + 1)
      projections[sessionId] = { values: cold }
      for (const listener of listeners) listener()
      return Promise.resolve()
    },
  }
  return {
    sessions,
    setProjections: (sessionId, values) => {
      projections[sessionId] = values === undefined ? undefined : { values }
      for (const listener of listeners) listener()
    },
    refreshCountOf: sessionId => refreshes.get(sessionId) ?? 0,
  }
}

/** Wait until `check` holds, 4 seconds at most. */
export async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await new Promise(resolve => { setTimeout(resolve, 20) })
  }
  throw new Error(`timed out: ${what}`)
}
