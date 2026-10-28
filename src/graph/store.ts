/**
 * Graph store (docs/ORCHESTRATION.md §2.6, §2.11): reads and validates the
 * node files under <graph>/nodes/, computes revisions, and writes nodes
 * atomically after a revision check. Only the engine calls the writer.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkNode, compareText, serializeNode, type GraphIssue } from './format.ts'
import { ID_PATTERN, type GraphNode } from './schema.ts'
import { validateGraph } from './validate.ts'

const NODES_DIR = 'nodes'

/** First 12 hex digits of the SHA-256 of a node file's bytes. */
export function revisionOf(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12)
}

/** Revision of the whole graph: SHA-256 over one "<id> <revision>\n" line per node file, in id order. */
export function graphRevision(revisions: ReadonlyMap<string, string>): string {
  const lines = [...revisions.keys()].sort(compareText).map(id => `${id} ${revisions.get(id)!}\n`)
  return revisionOf(lines.join(''))
}

export interface LoadedGraph {
  /** Nodes whose files parsed with every known field well-formed, in id order. */
  readonly nodes: ReadonlyMap<string, GraphNode>
  /** Revision of every node file, keyed by file name without .json. */
  readonly revisions: ReadonlyMap<string, string>
  readonly revision: string
  readonly issues: readonly GraphIssue[]
}

export function hasErrors(graph: LoadedGraph): boolean {
  return graph.issues.some(issue => issue.severity === 'error')
}

/** Load and validate <dir>/nodes/*.json. A missing nodes directory is an empty graph. */
export async function loadGraph(dir: string): Promise<LoadedGraph> {
  const nodesDir = join(dir, NODES_DIR)
  let names: string[]
  try {
    const entries = await readdir(nodesDir, { withFileTypes: true })
    names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name).sort(compareText)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    names = []
  }
  const nodes = new Map<string, GraphNode>()
  const revisions = new Map<string, string>()
  const issues: GraphIssue[] = []
  for (const name of names) {
    const file = `${NODES_DIR}/${name}`
    const stem = name.slice(0, -'.json'.length)
    const bytes = await readFile(join(nodesDir, name))
    revisions.set(stem, revisionOf(bytes))
    if (!ID_PATTERN.test(stem)) {
      issues.push({ severity: 'error', file, message: 'file name is not a node id followed by .json' })
      continue
    }
    const text = bytes.toString('utf8')
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
  return { nodes, revisions, revision: graphRevision(revisions), issues }
}

export interface NodeWrite {
  readonly node: GraphNode
  /** Revision the caller read; null when the file must not exist yet. */
  readonly expected: string | null
}

export type WriteOutcome =
  | { readonly ok: true, readonly revisions: ReadonlyMap<string, string> }
  | { readonly ok: false, readonly id: string, readonly current: string | null }

async function currentRevision(nodesDir: string, id: string): Promise<string | null> {
  try {
    return revisionOf(await readFile(join(nodesDir, `${id}.json`)))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/**
 * Write nodes in canonical form. Every expected revision is checked before
 * the first write; each file is written to a temp file (ignored by
 * loadGraph) and renamed over the target, so readers never see half a file.
 */
export async function writeNodes(dir: string, writes: readonly NodeWrite[]): Promise<WriteOutcome> {
  for (const { node } of writes) {
    // The id becomes a file name: refuse anything that could leave the nodes directory.
    if (!ID_PATTERN.test(node.id)) throw new Error(`graph store: "${node.id}" is not a node id`)
  }
  const nodesDir = join(dir, NODES_DIR)
  for (const { node, expected } of writes) {
    const current = await currentRevision(nodesDir, node.id)
    if (current !== expected) return { ok: false, id: node.id, current }
  }
  await mkdir(nodesDir, { recursive: true })
  const revisions = new Map<string, string>()
  for (const { node } of writes) {
    const text = serializeNode(node)
    const temp = join(nodesDir, `.${node.id}.${randomBytes(6).toString('hex')}.tmp`)
    try {
      await writeFile(temp, text)
      await rename(temp, join(nodesDir, `${node.id}.json`))
    }
    catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    revisions.set(node.id, revisionOf(text))
  }
  return { ok: true, revisions }
}
