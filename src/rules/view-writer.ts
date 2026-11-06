/**
 * The writer of the rules page's data (docs/ORCHESTRATION.md §16.14): it
 * writes each project's `view.json` atomically (a temporary file renamed
 * over it, through the row's storage operations) and only when the content
 * changed, apart from the moments: the view's `at` and the items' `asOf`,
 * which two of the items set to the moment they are read. Writes are done
 * one after another. A write that fails warns once per run of failures and
 * tells the row, which degrades its health until the next write succeeds;
 * nothing else of the row depends on it, and nothing here throws.
 */
import { unlink } from 'node:fs/promises'
import { ensureRuntimeDir, writeAtomic, type RulesPaths, type StoreIo } from './store.ts'
import type { RulesView } from './view.ts'

/** The quiet time after a journal write before the views are written again. */
const VIEW_DEBOUNCE_MS = 1_000

export interface ViewWriterDeps {
  /** The views to write now, computed on the spot: the project of `cwd`, or every project the row knows. Never throws. */
  readonly compose: (cwd?: string) => ReadonlyArray<{ readonly paths: RulesPaths, readonly view: RulesView }>
  readonly io: StoreIo
  /** A write failed with this reason, or (undefined) the next one succeeded. */
  readonly failed: (reason: string | undefined) => void
  readonly warn: (text: string) => void
}

export interface ViewWriter {
  /** Write the views of `cwd`'s project, or of every project, and wait for it. */
  write(cwd?: string): Promise<void>
  /** Write every project's view once the journal has been quiet for VIEW_DEBOUNCE_MS. */
  soon(): void
  /** The row goes: do the write `soon` still owes at once and take no more; the promise of what is in flight, or undefined when nothing is. */
  close(): Promise<void> | undefined
}

/** What decides whether a view changed: everything but the moments. */
function contentOf(view: RulesView): string {
  return JSON.stringify({ ...view, at: '', items: view.items.map(item => ({ ...item, asOf: '' })) })
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim().slice(0, 120)

export function createViewWriter(deps: ViewWriterDeps): ViewWriter {
  const written = new Map<string, string>()
  let chain: Promise<void> = Promise.resolve()
  let inFlight = 0
  let failing = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function persist(paths: RulesPaths, view: RulesView): Promise<void> {
    const content = contentOf(view)
    if (written.get(paths.view) === content) return
    let problem: string | undefined
    try {
      await ensureRuntimeDir(paths)
      const result = await writeAtomic(paths.view, `${JSON.stringify(view, null, 2)}\n`, deps.io)
      if (!result.ok) {
        await unlink(result.temporary).catch(() => {})
        problem = '新文件换不上去（文件正被别处打开）'
      }
    }
    catch (error) {
      problem = reasonOf(error)
    }
    if (problem === undefined) {
      written.set(paths.view, content)
      if (failing) {
        failing = false
        deps.failed(undefined)
      }
      return
    }
    if (!failing) deps.warn(`the rules page's view.json cannot be written (${paths.view}): ${problem}`)
    failing = true
    deps.failed(problem)
  }

  function queue(views: ReturnType<ViewWriterDeps['compose']>): Promise<void> {
    if (views.length === 0) return chain
    inFlight += 1
    chain = chain.then(async () => {
      for (const { paths, view } of views) await persist(paths, view)
    }).catch((error: unknown) => {
      deps.warn(`writing the rules page's view.json failed: ${reasonOf(error)}`)
    }).finally(() => { inFlight -= 1 })
    return chain
  }

  let closed = false
  const write = (cwd?: string): Promise<void> => closed ? chain : queue(deps.compose(cwd))

  return {
    write,
    soon() {
      if (closed) return
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void write()
      }, VIEW_DEBOUNCE_MS)
      // The debounce never keeps the host process alive; the row's unload flushes it.
      timer.unref()
    },
    close() {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
        void write()
      }
      closed = true
      return inFlight > 0 ? chain : undefined
    },
  }
}
