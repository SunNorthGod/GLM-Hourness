/**
 * The environment branch of the project graph (M4 design §7.1): the feature
 * node `env` and its tool children — what the project already has, how to
 * use it, which checker configuration files belong to it, and its check
 * lines (check-entry.ts). Pure over a loaded graph; the env row renders it
 * into the environment notice, and `checkCommandOf` (env-service.ts) reads a
 * tool's check lines from it; the graph tools read one written node's check
 * lines through `nodeChecks` (timeout.ts).
 */
import { labeledSections } from '../graph/stage.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { checkLineRefusal, isCheckLine, parseCheckLine, type CheckEntry } from './check-entry.ts'

/** The id of the environment feature node; a project mounts it under one of its goals. */
const ENV_NODE_ID = 'env'

/** The body labels a tool node carries (M3's labeled sections). */
const TOOL_LABELS = ['用途', '用法', '选择理由', '安装位置'] as const

/** Tool statuses the notice lists; a proposal waits for the human and is counted. */
const LISTED: readonly string[] = ['approved', 'doing', 'done']

/** One tool of the environment branch. */
export interface EnvTool {
  readonly id: string
  readonly title: string
  /** The revision of the node's file: a changed check command changes it (the environment notice and the checker's cache read it). */
  readonly rev: string
  /** The first line of the 用法 section, empty when the node has none. */
  readonly usage: string
  /** Configuration and baseline files from readable `config` lines, repository-relative, in line order. */
  readonly configs: readonly string[]
  /** The readable check lines (design §6.1.1), with `when` or without, in line order; names are unique within the node. */
  readonly checks: readonly CheckEntry[]
}

export interface EnvBranch {
  readonly tools: readonly EnvTool[]
  /** Tool children still waiting for the human's approval. */
  readonly proposals: number
  /** What could not be read: one line per unreadable `config` or check line. */
  readonly issues: readonly string[]
}

/**
 * One `config <path>[, <path>…]` acceptance line: backticks around the whole
 * line are allowed, paths are comma-separated, repository-relative, without
 * a `..` segment. Returns the paths, or undefined when the line does not
 * parse (the caller then skips it and says so).
 */
function parseConfigLine(line: string): readonly string[] | undefined {
  const text = line.startsWith('`') && line.endsWith('`') && line.length >= 2 ? line.slice(1, -1) : line
  const match = /^config\s+(.+)$/.exec(text)
  if (match === null) return undefined
  const paths = match[1].split(',').map(path => path.trim())
  if (paths.some(path => path === '' || /[`\\]/.test(path) || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..'))) return undefined
  return paths
}

function toolOf(node: GraphNode, rev: string): EnvTool {
  const usage = labeledSections(node.body, TOOL_LABELS).get('用法')?.split(/\r?\n/).find(line => line.trim() !== '') ?? ''
  return { id: node.id, title: node.title, rev, usage, configs: [], checks: [] }
}

/** One check line of a node: the entry, or the issue line (the number is the line's place among the acceptance conditions). */
function checkOf(node: Pick<GraphNode, 'id'>, index: number, line: string, names: ReadonlySet<string>): CheckEntry | string {
  const issue = (reason: string): string => `${node.id} 第 ${index + 1} 条检查行读不懂：${reason}`
  const entry = parseCheckLine(line)
  if (entry === undefined) return issue(checkLineRefusal(line) ?? '读不出')
  return names.has(entry.name) ? issue(`名字 ${entry.name} 在这个节点里重复了`) : entry
}

/** Whether a node is a tool of the environment branch, whatever its status. */
export function isEnvTool(node: Pick<GraphNode, 'parent' | 'type'>): boolean {
  return node.parent === ENV_NODE_ID && node.type === 'tool'
}

/**
 * The readable check lines of one node whatever its status, in line order,
 * each with its acceptance line as written: the lines `envBranch` lists for
 * an approved tool (a repeated name is left out as it does).
 */
export function nodeChecks(node: Pick<GraphNode, 'id' | 'acceptance'>): ReadonlyArray<{ readonly line: string, readonly entry: CheckEntry }> {
  const checks: Array<{ readonly line: string, readonly entry: CheckEntry }> = []
  for (const [index, line] of (node.acceptance ?? []).entries()) {
    if (!isCheckLine(line)) continue
    const entry = checkOf(node, index, line, new Set(checks.map(check => check.entry.name)))
    if (typeof entry !== 'string') checks.push({ line, entry })
  }
  return checks
}

/** The environment branch of one loaded graph: approved tools, waiting proposals, unreadable lines. */
export function envBranch(graph: LoadedGraph): EnvBranch {
  const tools: EnvTool[] = []
  const issues: string[] = []
  let proposals = 0
  for (const node of graph.nodes.values()) {
    if (!isEnvTool(node)) continue
    if (LISTED.includes(node.status)) {
      const tool = toolOf(node, graph.revisions.get(node.id) ?? '')
      const configs: string[] = []
      const checks: CheckEntry[] = []
      for (const [index, line] of (node.acceptance ?? []).entries()) {
        if (isCheckLine(line)) {
          const check = checkOf(node, index, line, new Set(checks.map(entry => entry.name)))
          if (typeof check === 'string') issues.push(check)
          else checks.push(check)
          continue
        }
        const paths = parseConfigLine(line)
        if (paths === undefined) {
          if (/^`?config\s/.test(line)) issues.push(`${node.id} 第 ${index + 1} 条 config 行读不懂`)
          continue
        }
        configs.push(...paths)
      }
      tools.push({ ...tool, configs, checks })
    }
    else if (node.status === 'proposed') proposals += 1
  }
  return { tools, proposals, issues }
}
