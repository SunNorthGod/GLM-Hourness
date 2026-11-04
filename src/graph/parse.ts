/**
 * Graph parsing (docs/ORCHESTRATION.md §2.6): node file texts in, a loaded
 * graph with its validation issues out. No file system and no Node
 * built-ins, so the DSH panel (ui/src) runs the same rules in the renderer.
 * The caller reads the files and hashes them: store.ts with node:crypto,
 * the panel with Web Crypto.
 */
import { checkNode, compareText, serializeNode, type GraphIssue } from './format.ts'
import { plainNotices } from './plain.ts'
import { ID_PATTERN, type GraphNode } from './schema.ts'
import { validateGraph } from './validate.ts'

/** Directory of the node files inside a graph directory. */
export const NODES_DIR = 'nodes'

export interface LoadedGraph {
  /** Nodes whose files parsed with every known field well-formed, in id order. */
  readonly nodes: ReadonlyMap<string, GraphNode>
  /** Revision of every node file, keyed by file name without .json. */
  readonly revisions: ReadonlyMap<string, string>
  readonly revision: string
  readonly issues: readonly GraphIssue[]
}

/** One file of <graph>/nodes/: its name, its text, and the revision of its bytes. */
export interface NodeFile {
  readonly name: string
  readonly text: string
  /** First 12 hex digits of the SHA-256 of the file's bytes. */
  readonly revision: string
}

export function hasErrors(graph: LoadedGraph): boolean {
  return graph.issues.some(issue => issue.severity === 'error')
}

/** The text whose revision is the graph revision: one "<id> <revision>\n" line per node file, in id order. */
export function revisionInput(revisions: ReadonlyMap<string, string>): string {
  return [...revisions.keys()].sort(compareText).map(id => `${id} ${revisions.get(id)!}\n`).join('')
}

/** Node files that belong to the graph: *.json, in name order; temp files of a write start with a dot and end in .tmp. */
export function nodeFileNames(names: readonly string[]): string[] {
  return names.filter(name => name.endsWith('.json')).sort(compareText)
}

/**
 * Parse and validate the node files; `revision` is the revision of
 * revisionInput over their revisions. Files that fail to parse keep their
 * revision and an error; a node not in canonical form gets a notice, and
 * so does every writing rule an open node breaks (with its `rule`).
 */
export function parseGraph(files: readonly NodeFile[], revision: string): LoadedGraph {
  const nodes = new Map<string, GraphNode>()
  const revisions = new Map<string, string>()
  const issues: GraphIssue[] = []
  for (const { name, text, revision: fileRevision } of [...files].sort((a, b) => compareText(a.name, b.name))) {
    const file = `${NODES_DIR}/${name}`
    const stem = name.slice(0, -'.json'.length)
    revisions.set(stem, fileRevision)
    if (!ID_PATTERN.test(stem)) {
      issues.push({ severity: 'error', file, message: 'file name is not a node id followed by .json' })
      continue
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    }
    catch (error) {
      issues.push({ severity: 'error', file, message: `not valid JSON: ${(error as Error).message}` })
      continue
    }
    const node = checkNode(raw, file, issues)
    if (node === undefined) continue
    if (node.id !== stem) {
      issues.push({ severity: 'error', file, field: 'id', message: `"${node.id}" does not match the file name` })
      continue
    }
    nodes.set(stem, node)
    if (serializeNode(node) !== text) {
      issues.push({ severity: 'notice', file, message: 'not in canonical form; the engine rewrites it on the next write of this node' })
    }
  }
  issues.push(...validateGraph(nodes))
  // The writing check on open nodes, as notices with their rule (plain-ui 1.3 §5.3): they never block a write.
  issues.push(...plainNotices(nodes))
  return { nodes, revisions, revision, issues }
}
