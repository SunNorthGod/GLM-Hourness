/**
 * The boards of the projects this host has seen (docs/ORCHESTRATION.md §18.7; loop
 * board design §8.4, §9.3): one store for each project root, and the work the
 * host does for a project when it meets it or when something changes: settle
 * what a read of its files found (store.ts), make `view.json` (view.ts) and say
 * what is wrong to the row's health. Nothing here throws: a project whose files
 * cannot be read is a problem for the health, not for the session.
 *
 * The view carries what the runtime keeps (design §8.4): the last run of every
 * entry, what waits and the main agent's state from the project's
 * `state.json`, and the last runs from the tail of the run records
 * (records.ts `recentRecords`, the one reader of them). The runtime itself is
 * not asked: whichever process runs the project writes those files, so every
 * process makes the same view of it.
 *
 * `view.json` is written when its content changes, at most once every 2
 * seconds for a project; a change that comes sooner is written when the 2
 * seconds are over. The moment it was made is not part of the comparison.
 */
import { unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import type { LockEnvironment } from '../data/lock.ts'
import { projectKey } from '../graph/main-agent-holder.ts'
import { writeAtomic, type StoreIo } from '../rules/store.ts'
import { holderLine, WRITER_HELD_MS, type HolderReason, type HolderStateKind } from './holder.ts'
import { readState, type RuntimeState } from './inbox.ts'
import { recentRecords } from './records.ts'
import type { LoopsRegistry } from './registry.ts'
import { ensureRuntimeDir, openLoopStore, type BoardRead, type LoopStore } from './store.ts'
import { attentionOf, buildView, type HolderView, type LoopsView, type PeakView, type ViewRuntime } from './view.ts'

/** How often `view.json` of one project is written at most. */
const VIEW_EVERY_MS = 2_000

/** How many runs the page lists (design §8.2 item 7). */
const RECENT_RUNS = 20

/**
 * The main agent's line of the page head (design §8.2 item 1), from what the
 * runtime last read about the holder session: the words of holder.ts for a
 * state nobody can be told in, and for the first five minutes of `elsewhere`
 * the hand-over that is still going on.
 */
function holderViewOf(known: RuntimeState['holder'], nowMs: number): HolderView | undefined {
  if (known === undefined) return undefined
  const session = known.session === undefined ? {} : { session: known.session }
  if (known.state === 'ok') return { line: '主 Agent 收得到这块板的消息', ...session }
  if (known.state === 'elsewhere' && nowMs - Date.parse(known.at) < WRITER_HELD_MS) return { line: '这块板正交给主 Agent 所在的 DSH 进程', ...session }
  const line = holderLine({ kind: known.state as HolderStateKind, ...(known.reason === undefined ? {} : { reason: known.reason as HolderReason }) })
  return line === undefined ? undefined : { line, ...session }
}

/** What the runtime of a project has kept and recorded, as the view reads it. */
async function runtimeOf(store: LoopStore, nowMs: number): Promise<ViewRuntime> {
  const state = readState(store.paths, nowMs)
  const holder = holderViewOf(state.holder, nowMs)
  return {
    last: state.last,
    passing: state.passing,
    waiting: Object.keys(state.pending).length + state.held.length + Object.keys(state.deferred).length,
    records: await recentRecords(store.paths, RECENT_RUNS),
    ...(holder === undefined ? {} : { holder }),
  }
}

/** A timer that runs `run` once after `ms` and returns the function that cancels it. */
export type Delay = (run: () => void, ms: number) => () => void

export const realDelay: Delay = (run, ms) => {
  const handle = setTimeout(run, ms)
  // The row's timers never keep the host process alive.
  handle.unref()
  return () => { clearTimeout(handle) }
}

interface BoardsDeps {
  readonly registry: LoopsRegistry
  readonly io: StoreIo
  readonly lock?: LockEnvironment
  readonly delay: Delay
  /** Told when what is wrong with the projects may have changed. */
  readonly changed: () => void
  /**
   * The GLM peak of a project as the view shows it (design §6.9 item 3):
   * undefined while this host has no pricing service at all. The level comes
   * from the rules board's service, the clock from the pricing service.
   */
  readonly peakOf?: (projectRoot: string) => PeakView | undefined
}

export interface Boards {
  /** The store of a project root, made once. */
  storeOf(root: string): LoopStore
  /** Settle the project's files, write its `view.json` and note what is wrong; the view made, or undefined when the files could not be read. Never throws. */
  refresh(root: string): Promise<LoopsView | undefined>
  /** Write `view.json` again from the files as they read now and from what the runtime kept, without settling: a beat's change of the runtime (design §8.4). Never throws. */
  rewrite(root: string): Promise<void>
  /** What is wrong with the projects now, one sentence each, naming the project. */
  problems(): readonly string[]
  /** Cancel the writes still waiting. */
  dispose(): void
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

interface Written {
  /** The view without its time, as it was written last. */
  signature: string
  at: number
  /** The latest view not yet written, and the cancel of the timer that will write it. */
  waiting?: { readonly view: LoopsView, readonly cancel: () => void }
}

export function createBoards(deps: BoardsDeps): Boards {
  const stores = new Map<string, LoopStore>()
  const problems = new Map<string, readonly string[]>()
  const written = new Map<string, Written>()
  const signatureOf = (view: LoopsView): string => JSON.stringify({ ...view, at: undefined })

  function storeOf(root: string): LoopStore {
    let store = stores.get(root)
    if (store === undefined) {
      store = openLoopStore(root, { io: deps.io, table: () => deps.registry.events(), ...(deps.lock === undefined ? {} : { lock: deps.lock }) })
      stores.set(root, store)
    }
    return store
  }

  /** What is wrong with one project in one respect (`kind`): the whole list replaces the one before. */
  function note(root: string, kind: 'files' | 'view', lines: readonly string[]): void {
    const key = `${root}\n${kind}`
    const labelled = lines.map(line => `${basename(root)}：${line}`)
    if (JSON.stringify(problems.get(key) ?? []) === JSON.stringify(labelled)) return
    if (labelled.length === 0) problems.delete(key)
    else problems.set(key, labelled)
    deps.changed()
  }

  async function writeNow(root: string, store: LoopStore, view: LoopsView): Promise<void> {
    try {
      await ensureRuntimeDir(store.paths)
      const result = await writeAtomic(store.paths.view, `${JSON.stringify(view, null, 2)}\n`, deps.io)
      if (!result.ok) {
        await unlink(result.temporary).catch(() => {})
        throw new Error('view.json 换不上去（文件正被别处打开）')
      }
      written.set(root, { signature: signatureOf(view), at: deps.io.now() })
      note(root, 'view', [])
    }
    catch (error) {
      note(root, 'view', [`view.json 写不进：${message(error)}`])
    }
  }

  /** Write the view now, or at the end of the 2 seconds the last write started. */
  async function request(root: string, store: LoopStore, view: LoopsView): Promise<void> {
    const known = written.get(root)
    if (known?.signature === signatureOf(view)) {
      known.waiting?.cancel()
      delete known.waiting
      return
    }
    const wait = known === undefined ? 0 : known.at + VIEW_EVERY_MS - deps.io.now()
    if (known === undefined || wait <= 0) {
      known?.waiting?.cancel()
      await writeNow(root, store, view)
      return
    }
    known.waiting?.cancel()
    known.waiting = { view, cancel: deps.delay(() => {
      delete known.waiting
      void writeNow(root, store, view)
    }, wait) }
  }

  /** Make the view from a read of the files and write it; note what is wrong with the files. */
  async function show(root: string, store: LoopStore, board: BoardRead): Promise<LoopsView> {
    const nowMs = deps.io.now()
    const peak = deps.peakOf?.(root)
    const view = buildView({
      at: new Date(nowMs).toISOString(),
      project: projectKey(root),
      plugin: deps.registry.entries(),
      board,
      events: deps.registry.events(),
      runtime: await runtimeOf(store, nowMs),
      ...(peak === undefined ? {} : { peak }),
    })
    await request(root, store, view)
    note(root, 'files', attentionOf(board).filter(item => item.degrades).map(item => item.text))
    return view
  }

  async function refresh(root: string): Promise<LoopsView | undefined> {
    try {
      const store = storeOf(root)
      const settled = await store.settle()
      // A busy lock leaves the files as they are: the read shows them as they are.
      return await show(root, store, settled === 'busy' ? store.read() : settled)
    }
    catch (error) {
      note(root, 'files', [`读循环板的文件失败：${message(error)}`])
      return undefined
    }
  }

  async function rewrite(root: string): Promise<void> {
    try {
      const store = storeOf(root)
      await show(root, store, store.read())
    }
    catch (error) {
      note(root, 'files', [`读循环板的文件失败：${message(error)}`])
    }
  }

  return {
    storeOf,
    refresh,
    rewrite,
    problems: () => [...problems.values()].flat(),
    dispose() {
      for (const item of written.values()) item.waiting?.cancel()
    },
  }
}
