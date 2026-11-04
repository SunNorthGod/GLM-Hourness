/**
 * The environment branch of the project graph (M4 design §7.1): the feature
 * node `env` and its tool children — what the project already has, how to
 * use it, and which checker configuration files belong to it. Pure over a
 * loaded graph; the env row renders it into the environment notice and
 * (with m4-checks) reads the check lines the same way.
 */
import { labeledSections } from '../graph/stage.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'

/** The id of the environment feature node; a project mounts it under one of its goals. */
const ENV_NODE_ID = 'env'

/** The body labels a tool node carries (M3's labeled sections). */
const TOOL_LABELS = ['用途', '用法', '选择理由', '安装位置'] as const

/** Tool statuses the notice lists; a proposal waits for the human and is counted. */
const LISTED: readonly string[] = ['approved', 'doing', 'done']

/** One tool of the environment branch. */
interface EnvTool {
  readonly id: string
  readonly title: string
  /** The first line of the 用法 section, empty when the node has none. */
  readonly usage: string
  /** Configuration and baseline files from readable `config` lines, repository-relative, in line order. */
  readonly configs: readonly string[]
}

export interface EnvBranch {
  readonly tools: readonly EnvTool[]
  /** Tool children still waiting for the human's approval. */
  readonly proposals: number
  /** What could not be read: one line per unreadable `config` line. */
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

function toolOf(node: GraphNode): EnvTool {
  const usage = labeledSections(node.body, TOOL_LABELS).get('用法')?.split(/\r?\n/).find(line => line.trim() !== '') ?? ''
  return { id: node.id, title: node.title, usage, configs: [] }
}

/** The environment branch of one loaded graph: approved tools, waiting proposals, unreadable lines. */
export function envBranch(graph: LoadedGraph): EnvBranch {
  const tools: EnvTool[] = []
  const issues: string[] = []
  let proposals = 0
  for (const node of graph.nodes.values()) {
    if (node.parent !== ENV_NODE_ID || node.type !== 'tool') continue
    if (LISTED.includes(node.status)) {
      const tool = toolOf(node)
      const configs: string[] = []
      for (const [index, line] of (node.acceptance ?? []).entries()) {
        const paths = parseConfigLine(line)
        if (paths === undefined) {
          if (/^`?config\s/.test(line)) issues.push(`${node.id} 第 ${index + 1} 条 config 行读不懂`)
          continue
        }
        configs.push(...paths)
      }
      tools.push({ ...tool, configs })
    }
    else if (node.status === 'proposed') proposals += 1
  }
  return { tools, proposals, issues }
}
