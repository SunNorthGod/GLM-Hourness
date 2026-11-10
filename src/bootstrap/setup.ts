/**
 * The deterministic part of a takeover (takeover design 0.6 §4.1): find the
 * project root, scan it, decide the path, and bring the directories to
 * their target state: `git init` an empty folder, keep `.llm/` out of git
 * (src/data/llm-ignore.ts: the `info/exclude` line and the `check-ignore`
 * proof), make `.llm/` and `<graph dir>/nodes/`, and say when the graph
 * directory itself is ignored. Each item already in its target state is
 * `present`; a refusal (the home directory, a drive root, a folder with
 * files outside git, an ignore that does not hold) writes nothing more.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'
import { runGit } from '../data/git-process.ts'
import { ensureLlmIgnored } from '../data/llm-ignore.ts'
import { projectOf } from '../data/project-root.ts'
import { decidePath, graphNodeFiles, type PathDecision } from './path.ts'
import { scanWorkspace, type ScanOutput } from './scan.ts'
import type { TakeoverRecord } from './takeover.ts'

export type Settled =
  | { readonly ok: false, readonly text: string }
  | {
    readonly ok: true
    readonly root: string
    readonly scan: ScanOutput
    readonly decision: Extract<PathDecision, { ok: true }>
    /** One `setup` record per item (§9.1). */
    readonly setup: readonly TakeoverRecord[]
    /** What was done, for the command result (Chinese). */
    readonly done: readonly string[]
    /** What holds the takeover back without stopping it, for the result and the row health (Chinese). */
    readonly warnings: readonly string[]
  }

const sameDir = (a: string, b: string): boolean => {
  const fold = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
  return fold(a) === fold(b)
}

const setupRecord = (item: string, action: 'created' | 'present' | 'failed', detail?: string): TakeoverRecord => ({ op: 'setup', data: { item, action, ...detail === undefined ? {} : { detail } } })

/** A path under the root with forward slashes; undefined when it is outside the root. */
function underRoot(root: string, path: string): string | undefined {
  const rel = relative(root, path)
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? undefined : rel.split('\\').join('/')
}

/** Make a directory; whether it was there already. */
async function ensureDir(path: string): Promise<boolean> {
  const present = existsSync(path)
  await mkdir(path, { recursive: true })
  return present
}

/** How many node files of the graph directory git does not track; undefined when git cannot say. */
export async function untrackedNodeFiles(root: string, graphDir: string): Promise<number | undefined> {
  const rel = underRoot(root, graphDir)
  if (rel === undefined) return undefined
  const listed = await runGit(root, ['-c', 'core.quotepath=false', 'ls-files', '--', `${rel}/nodes`])
  if (listed.code !== 0) return undefined
  const tracked = new Set(listed.out.split('\n').map(line => line.trim().split('/').at(-1)).filter((name): name is string => name !== undefined && name !== ''))
  return graphNodeFiles(graphDir).filter(name => !tracked.has(name)).length
}

/** The files git tracks under the root, repository-relative; none when git cannot say (the checker gap of §5.8 reads them). */
export async function trackedFiles(root: string): Promise<readonly string[]> {
  const listed = await runGit(root, ['ls-files', '-z'])
  return listed.code === 0 ? listed.out.split('\0').filter(path => path !== '') : []
}

/**
 * Scan the workspace of `cwd` and settle its directories (§4.1).
 * @param graphDir - the graph row's `dirFor(cwd)`.
 * @param home - the user's home directory, never a project.
 */
export async function settleWorkspace(cwd: string, graphDir: string, home: string = homedir()): Promise<Settled> {
  const dir = resolve(cwd)
  const located = projectOf(dir, home)
  if (located === undefined && (sameDir(dir, home) || parse(dir).root === dir)) return { ok: false, text: '这个会话的工作目录不是一个项目文件夹' }
  const root = located?.root ?? dir
  const scan = await scanWorkspace(root, { graphDir })
  const decision = decidePath(scan.scan)
  if (!decision.ok) return { ok: false, text: decision.reason }
  const setup: TakeoverRecord[] = []
  const done: string[] = []
  const warnings: string[] = []
  if (decision.init) {
    const init = await runGit(root, ['init'])
    if (init.code !== 0) return { ok: false, text: `git init 没做成（${(init.err.trim() || `退出 ${init.code}`).slice(0, 200)}）` }
    if (projectOf(root, home) === undefined) return { ok: false, text: 'git init 之后仍找不到项目根' }
    setup.push(setupRecord('git-init', 'created'))
    done.push('建了 git 仓库')
  }
  const ignored = await ensureLlmIgnored(root)
  if (ignored.kind !== 'ignored') {
    const why = ignored.kind === 'no-git' ? '这里不是 git 仓库' : ignored.reason
    return { ok: false, text: `.llm/ 没被 git 忽略（${why.slice(0, 200)}）：运行时文件可能被提交，所以没有建，接管没有开` }
  }
  setup.push(setupRecord('exclude', ignored.appended ? 'created' : 'present'))
  if (ignored.appended) done.push('把 .llm/ 写进了 .git/info/exclude')
  try {
    setup.push(setupRecord('llm-dir', await ensureDir(join(root, '.llm')) ? 'present' : 'created'))
    const graphPresent = await ensureDir(join(graphDir, 'nodes'))
    setup.push(setupRecord('graph-dir', graphPresent ? 'present' : 'created'))
    if (!graphPresent) done.push(`建了 ${underRoot(root, graphDir) ?? graphDir}/nodes/`)
  }
  catch (error) {
    return { ok: false, text: `目录建不了（${error instanceof Error ? error.message : String(error)}）：修好权限后再发一次` }
  }
  const graphRel = underRoot(root, graphDir)
  if (graphRel !== undefined && (await runGit(root, ['check-ignore', '-q', `${graphRel}/nodes/x.json`])).code === 0) warnings.push(`${graphRel} 被 .gitignore 忽略了：项目图进不了 git`)
  return { ok: true, root, scan, decision, setup, done, warnings }
}
