/**
 * Whether a workspace has a project graph, and which way a takeover goes
 * (takeover design 0.6 §3.1, §3.4). `hasProjectGraph` is the only answer to
 * "is there a project graph" in the takeover: the path decision, the
 * `/hourness-init` command and the service's `wants` all call it (§14).
 * `isProjectGraph` is the same judgement on a listing, with no file system,
 * so the graph panel's client can share it. `decidePath` is pure: it reads
 * a finished scan.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ScanResult } from './scan.ts'

/** Whether a `nodes/` listing makes a project graph: at least one name that ends in `.json`. */
export function isProjectGraph(nodeFileNames: readonly string[]): boolean {
  return nodeFileNames.some(name => name.endsWith('.json'))
}

/** The node files of a graph directory: the `.json` files in its `nodes/`; none when the directory is not there. */
export function graphNodeFiles(graphDir: string): string[] {
  try {
    return readdirSync(join(graphDir, 'nodes'), { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).filter(name => name.endsWith('.json'))
  }
  catch {
    return []
  }
}

/** Whether `<graphDir>/nodes/` exists and holds at least one `.json` file (§3.1); an empty `nodes/` is no graph. */
export function hasProjectGraph(graphDir: string): boolean {
  return isProjectGraph(graphNodeFiles(graphDir))
}

/** Entries of a non-git directory that do not count as "something else" in path rule 2 (§3.4); the graph directory chain is judged by the scan. */
export function isIgnorableEntry(name: string, directory: boolean): boolean {
  if (directory) return ['.llm', '.vscode', '.idea'].includes(name)
  return name === '.DS_Store' || name === '.gitignore' || name === '.gitattributes' || /^(?:readme|license)/i.test(name)
}

/** The way a takeover goes: a new project, an existing one, or only the gaps of an existing graph. */
type TakeoverPath = 'new' | 'existing' | 'gaps'

/**
 * The path decision (§3.4). `rule` is the row of the table that held;
 * `init` says the workspace gets `git init` first (rule 2); `reason` is the
 * sentence for the command result, `note` an extra one for a repository
 * without commits. A refusal is rule 3 (files, not a git repository) or 0
 * (git could not be read: not installed, or the scan ran out of time on it).
 */
export type PathDecision =
  | { readonly ok: true, readonly path: TakeoverPath, readonly rule: 1 | 2 | 4 | 5, readonly init: boolean, readonly reason: string, readonly note?: string }
  | { readonly ok: false, readonly rule: 0 | 3, readonly reason: string }

/** The most commits a repository without code may have and still be a new project (§3.4 rule 4). */
const NEW_PROJECT_MAX_COMMITS = 3

export function decidePath(scan: ScanResult): PathDecision {
  if (scan.graph.present) return { ok: true, path: 'gaps', rule: 1, init: false, reason: `已有项目图（${scan.graph.nodes} 个节点）：只补缺的` }
  const git = scan.git
  if (git.state === 'missing') return { ok: false, rule: 0, reason: '找不到 git：接管要用 git' }
  if (git.state === 'unread') return { ok: false, rule: 0, reason: '读 git 的状态时扫描超时了：再发一次 /wish' }
  if (git.state !== 'repo') {
    if (scan.workspace.loose.length === 0) return { ok: true, path: 'new', rule: 2, init: true, reason: '空目录：当新项目，已建 git 仓库' }
    return { ok: false, rule: 3, reason: '这个目录有文件但不是 git 仓库：先在终端里 git init 并提交一次，再发 /wish' }
  }
  const commits = git.commits
  // Without HEAD, `git ls-files` lists the index: staged files are not tracked code yet, so rule 4 reads 0 (§3.4, last paragraph).
  const code = git.head === undefined ? 0 : scan.files.code
  if (code === 0 && commits <= NEW_PROJECT_MAX_COMMITS) {
    const note = git.head === undefined ? { note: '仓库里还没有提交：工作区里的文件不当已有的代码读' } : {}
    return { ok: true, path: 'new', rule: 4, init: false, reason: `git 仓库里还没有代码（${commits} 个提交）：当新项目`, ...note }
  }
  const manifests = scan.sources.manifests.filter(file => !file.includes('/'))
  const named = manifests.length === 0 ? '' : `、清单 ${manifests.join('、')}`
  return { ok: true, path: 'existing', rule: 5, init: false, reason: `已有项目：${code} 个代码文件、${commits} 个提交${named}` }
}
