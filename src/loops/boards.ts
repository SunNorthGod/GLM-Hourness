/**
 * The boards of the projects this host has seen (docs/ORCHESTRATION.md §18.7; loop
 * board design §8.4, §9.3): one store for each project root, and the work the
 * host does for a project when it meets it or when something changes: settle
 * what a read of its files found (store.ts), make `view.json` (view.ts) and say
 * what is wrong to the row's health. Nothing here throws: a project whose files
 * cannot be read is a problem for the health, not for the session.
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
import type { LoopsRegistry } from './registry.ts'
import { ensureRuntimeDir, openLoopStore, type LoopStore } from './store.ts'
import { attentionOf, buildView, type LoopsView, type PeakView } from './view.ts'

/** How often `view.json` of one project is written at most. */
const VIEW_EVERY_MS = 2_000

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
  /** Settle the project's files, write its `view.json` and note what is wrong. Never throws. */
  refresh(root: string): Promise<void>
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

  async function refresh(root: string): Promise<void> {
    try {
      const store = storeOf(root)
      const settled = await store.settle()
      // A busy lock leaves the files as they are: the read shows them as they are.
      const board = settled === 'busy' ? store.read() : settled
      const peak = deps.peakOf?.(root)
      await request(root, store, buildView({ at: new Date(deps.io.now()).toISOString(), project: projectKey(root), plugin: deps.registry.entries(), board, ...(peak === undefined ? {} : { peak }) }))
      note(root, 'files', attentionOf(board).filter(item => item.degrades).map(item => item.text))
    }
    catch (error) {
      note(root, 'files', [`读循环板的文件失败：${message(error)}`])
    }
  }

  return {
    storeOf,
    refresh,
    problems: () => [...problems.values()].flat(),
    dispose() {
      for (const item of written.values()) item.waiting?.cancel()
    },
  }
}
