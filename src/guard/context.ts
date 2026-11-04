/**
 * The judgment context of one call (m4-gate G3, design §4.1): the external
 * facts the code rules need, prepared before `detect` runs — whether the
 * write target exists and how big it is, its old content, the tracked files
 * of the checkout the target sits in, the checker configuration files the
 * project's env tool nodes name, and the node ids of the project graph. The
 * rules that need facts read them here, so a fifth fact cannot grow a second
 * reader.
 *
 * A fact the harness cannot learn is left out (`undefined` in the result),
 * and a rule that needs it passes the call without a record (design §4.1):
 * an unknown must never turn into a denial. The whole preparation waits at
 * most five seconds; whatever has not settled by then stays unknown. The
 * tracked files are cached per checkout root for a minute (a `git ls-files`
 * per call is too heavy); the graph's facts are cached per revision — a read
 * that fails falls back to the last one, a graph that never read keeps the
 * rules to their built-in tables.
 */
import { readFile, stat } from 'node:fs/promises'
import { relative } from 'node:path'
import { checkoutRootOf } from '../data/project-root.ts'
import { runGit } from '../data/git-process.ts'
import { loadGraph } from '../graph/store.ts'
import { envBranch } from '../env/branch.ts'

/** How long the whole preparation may take; the facts still missing then stay unknown (design §4.1). */
const PREPARE_LIMIT_MS = 5_000

/** How long the tracked-file list of one checkout stays cached (design §4.1). */
const TRACKED_FRESH_MS = 60_000

/** Old content above this size is not read (design §4.1); the fact stays unknown, not empty. */
const OLD_CONTENT_LIMIT = 1024 * 1024

/** The facts of one call; a fact the harness could not learn is absent (design §4.1). */
export interface RuleContext {
  /** The write target's stat; `exists: false` is a fact (ENOENT), an absent member is not. */
  readonly target?: { readonly exists: boolean, readonly size?: number }
  /** The target's old content; `''` when it does not exist; absent when it could not be read or is above 1 MiB. */
  readonly oldContent?: string
  /** The tracked files of the checkout the target sits in, repository-relative, slash-separated; absent without git, on a timeout or an error. */
  readonly tracked?: readonly string[]
  /** The checker configuration files the project's env tool nodes name (repository-relative); absent when the graph could not be read. */
  readonly envConfigs?: readonly string[]
  /** The node ids of the project graph; absent when the graph could not be read. */
  readonly nodeIds?: ReadonlySet<string>
}

const EMPTY: RuleContext = {}

/** The filesystems and services the preparation reads; tests inject them, the guard row passes the real ones. */
export interface ContextIo {
  stat(path: string): Promise<{ readonly size?: number }>
  readFile(path: string): Promise<string>
  /** The tracked files of the checkout at `root` (`git ls-files`), repository-relative; rejects on timeout or failure. */
  trackedFiles(root: string): Promise<readonly string[]>
  /** The project graph's facts of the session's checkout, or undefined when there is no checkout or the graph cannot be read. */
  graph(cwd: string | undefined): Promise<{ readonly revision: string, readonly configs: readonly string[], readonly nodeIds: ReadonlySet<string> } | undefined>
}

/** The real io: node fs, one git process per read through runGit, the project graph of the session's checkout. */
const nodeContextIo: ContextIo = {
  async stat(path) {
    const info = await stat(path)
    return { size: info.size }
  },
  async readFile(path) {
    return readFile(path, 'utf8')
  },
  async trackedFiles(root) {
    const run = await runGit(root, ['ls-files', '-z'], 5_000)
    if (run.code !== 0) throw new Error(`git ls-files failed: ${run.err.slice(0, 120)}`)
    return run.out.split('\0').filter(line => line.length > 0)
  },
  async graph(cwd) {
    const root = checkoutRootOf(cwd ?? '.')
    if (root === undefined) return undefined
    try {
      const graph = await loadGraph(`${root}/docs/graph`)
      const configs = [...new Set(envBranch(graph).tools.flatMap(tool => tool.configs))]
      return { revision: graph.revision, configs, nodeIds: new Set(graph.nodes.keys()) }
    }
    catch {
      return undefined
    }
  },
}

/** The tracked files of one checkout, cached for a minute per root. */
const trackedCache = new Map<string, { readonly at: number, readonly files: readonly string[] }>()

/** The graph facts of one checkout, cached per revision: a failed fresh read falls back to the last good one. */
const graphCache = new Map<string, { readonly revision: string, readonly configs: readonly string[], readonly nodeIds: ReadonlySet<string> }>()

/**
 * Prepare the facts one call's rules need (design §4.1): only a call that
 * names a file-tool write target does any work — every other call gets
 * `EMPTY`, which makes each fact unknown and each fact-needing rule allow,
 * exactly as an unknown must. `target` is the absolute path the rules
 * already resolved (the guard row resolves it the way containment does);
 * `cwd` is the session's working directory, which picks the project graph.
 * Never throws: every failure is an unknown fact.
 */
export async function prepareContext(target: string | undefined, cwd: string | undefined, io: ContextIo = nodeContextIo): Promise<RuleContext> {
  if (target === undefined) return EMPTY
  const deadline = Date.now() + PREPARE_LIMIT_MS
  const left = (): number => Math.max(0, deadline - Date.now())
  const within = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        work(),
        new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), left()) }),
      ])
    }
    catch {
      return undefined
    }
    finally {
      clearTimeout(timer)
    }
  }
  const root = checkoutRootOf(target) ?? checkoutRootOf(cwd ?? target)
  const [targetStat, tracked, graph] = await Promise.all([
    within(async () => {
      try {
        const info = await io.stat(target)
        return { exists: true, ...(info.size === undefined ? {} : { size: info.size }) }
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false }
        throw error
      }
    }),
    root === undefined ? Promise.resolve(undefined) : trackedOf(root, io),
    graphOf(cwd, io),
  ])
  // Size first, read second (design §4.1: only a target that exists and is
  // at most 1 MiB has its content read); a vanished target reads as empty.
  let oldContent: string | undefined
  if (targetStat !== undefined && targetStat.exists) {
    oldContent = typeof targetStat.size === 'number' && targetStat.size > OLD_CONTENT_LIMIT
      ? undefined
      : await within(async () => {
        try {
          return await io.readFile(target)
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
          throw error
        }
      })
  }
  else if (targetStat?.exists === false) {
    oldContent = ''
  }
  return {
    ...(targetStat === undefined ? {} : { target: targetStat }),
    ...(oldContent === undefined ? {} : { oldContent }),
    ...(tracked === undefined ? {} : { tracked }),
    ...(graph?.configs === undefined ? {} : { envConfigs: graph.configs }),
    ...(graph?.nodeIds === undefined ? {} : { nodeIds: graph.nodeIds }),
  }
}

/** The graph facts of the session's checkout; the cache answers when the fresh read fails or times out. */
async function graphOf(cwd: string | undefined, io: ContextIo): Promise<{ configs?: readonly string[], nodeIds?: ReadonlySet<string> } | undefined> {
  const root = checkoutRootOf(cwd ?? '.')
  if (root === undefined) return undefined
  const fresh = await io.graph(cwd).catch(() => undefined)
  if (fresh === undefined) {
    const known = graphCache.get(root)
    return known === undefined ? undefined : { configs: known.configs, nodeIds: known.nodeIds }
  }
  graphCache.set(root, fresh)
  return { configs: fresh.configs, nodeIds: fresh.nodeIds }
}

/** The tracked files of the checkout at `root`, cached for a minute; a failed refresh falls back to the last list. */
async function trackedOf(root: string, io: ContextIo): Promise<readonly string[] | undefined> {
  const known = trackedCache.get(root)
  if (known !== undefined && Date.now() - known.at < TRACKED_FRESH_MS) return known.files
  const files = await io.trackedFiles(root).catch(() => undefined)
  if (files === undefined) return known?.files
  trackedCache.set(root, { at: Date.now(), files })
  return files
}

/** The repository-relative spelling of an absolute path inside `root`, or undefined when it is outside. */
export function relativeToRoot(root: string, path: string): string | undefined {
  const rel = relative(root, path)
  return rel === '' || rel.startsWith('..') ? undefined : rel.replaceAll('\\', '/')
}
