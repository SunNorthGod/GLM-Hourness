/**
 * Graph store (docs/ORCHESTRATION.md §2.6, §2.11): reads and validates the
 * node files under <graph>/nodes/, computes revisions, and writes nodes
 * atomically after a revision check. Only the engine calls the writer.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serializeNode } from './format.ts'
import { NODES_DIR, nodeFileNames, parseGraph, revisionInput, type LoadedGraph, type NodeFile } from './parse.ts'
import { ID_PATTERN, type GraphNode } from './schema.ts'

export { hasErrors, type LoadedGraph } from './parse.ts'

/** First 12 hex digits of the SHA-256 of a node file's bytes. */
export function revisionOf(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12)
}

/** Revision of the whole graph: SHA-256 over one "<id> <revision>\n" line per node file, in id order. */
export function graphRevision(revisions: ReadonlyMap<string, string>): string {
  return revisionOf(revisionInput(revisions))
}

/** Load and validate <dir>/nodes/*.json. A missing nodes directory is an empty graph. */
export async function loadGraph(dir: string): Promise<LoadedGraph> {
  const nodesDir = join(dir, NODES_DIR)
  let names: string[]
  try {
    const entries = await readdir(nodesDir, { withFileTypes: true })
    names = nodeFileNames(entries.filter(entry => entry.isFile()).map(entry => entry.name))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    names = []
  }
  const files: NodeFile[] = []
  const revisions = new Map<string, string>()
  for (const name of names) {
    const bytes = await readFile(join(nodesDir, name))
    const revision = revisionOf(bytes)
    files.push({ name, text: bytes.toString('utf8'), revision })
    revisions.set(name.slice(0, -'.json'.length), revision)
  }
  return parseGraph(files, graphRevision(revisions))
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
