/**
 * Semantic pins (M7 design 0.6 §3.5.3): a short digest of every graph node a
 * dispatched task rests on, written into the dispatch comment, so a later
 * look can tell whether the intent changed under it. Pure functions; the
 * digest function is a parameter and nothing here imports a Node built-in,
 * so the host rows and the DSH client import the same rules.
 *
 * The digest of a node covers only what changes intent, by node type:
 * - task: acceptance, non-goals, kind, whether it is dropped or superseded;
 * - goal, feature (and any other ancestor): acceptance, non-goals, whether it
 *   is dropped or superseded; a goal, and a feature the readers know as a
 *   module of its goal, also the time it last entered the released state
 *   (`releaseAt`, §2.4). A module sent back to design and released again
 *   gets a new time, so work dispatched before the return is stale;
 * - decision: whether verification is overturned or superseded, the status;
 * - question: the chosen option or the conclusion, the status.
 * Titles, bodies, slope, history and the write scope stay out: a retitled
 * node must not stale the work; the write scope is checked against the live
 * graph by the write gate. Readers that throw leave `releaseAt` out of a
 * feature's digest, which differs from the digest taken while they worked,
 * so an unreadable module structure reads as changed (the stricter side).
 */
import { MODULE_READERS, releaseAtOf, type ModuleReaders } from './execute-stage.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf } from './projection.ts'
import type { GraphNode } from './schema.ts'

/** SHA-256 of a UTF-8 text as 64 lowercase hex digits. */
export type Sha256 = (text: string) => string

export interface Pin {
  readonly id: string
  /** 12 lowercase hex digits. */
  readonly digest: string
}

/** What differs for one pinned node: its digest changed, or the node is gone. */
export interface PinChange {
  readonly id: string
  readonly change: 'changed' | 'missing'
  readonly from: string
  readonly to?: string
}

const PINS_PREFIX = 'pins: '
const PIN_PATTERN = /^([a-z][a-z0-9-]{0,47})@([0-9a-f]{12})$/

function isModule(graph: LoadedGraph, node: GraphNode, readers: ModuleReaders): boolean {
  if (node.type !== 'feature') return false
  try {
    return readers.moduleOf(graph, node)?.id === node.id
  }
  catch {
    return false
  }
}

/** The fields of one node that go into its digest, in a fixed order. */
function semanticFields(graph: LoadedGraph, node: GraphNode, readers: ModuleReaders): Record<string, unknown> {
  const gone = node.status === 'dropped' || node.status === 'superseded'
  switch (node.type) {
    case 'task':
      return { acceptance: node.acceptance ?? [], nonGoals: node.nonGoals ?? [], kind: node.kind ?? null, gone }
    case 'decision':
      return { overturned: node.verification === 'overturned' || node.verification === 'superseded', status: node.status }
    case 'question':
      return { decision: node.decision ?? null, conclusion: node.conclusion ?? null, status: node.status }
    default: {
      const fields: Record<string, unknown> = { acceptance: node.acceptance ?? [], nonGoals: node.nonGoals ?? [], gone }
      if (node.type === 'goal' || isModule(graph, node, readers)) fields.releaseAt = releaseAtOf(node)
      return fields
    }
  }
}

function pinOf(graph: LoadedGraph, node: GraphNode, sha256: Sha256, readers: ModuleReaders): Pin {
  return { id: node.id, digest: sha256(JSON.stringify(semanticFields(graph, node, readers))).slice(0, 12) }
}

/**
 * The pins of a task: the task, its ancestors up to the goal (parent first),
 * then every node its `source` edges point at, in edge order, each once.
 * An edge to a node that does not exist is left out.
 */
export function pinsOf(graph: LoadedGraph, task: GraphNode, sha256: Sha256, readers: ModuleReaders = MODULE_READERS): readonly Pin[] {
  const nodes = [task, ...ancestorsOf(graph, task)]
  for (const edge of task.edges ?? []) {
    const target = edge.type === 'source' ? graph.nodes.get(edge.to) : undefined
    if (target !== undefined) nodes.push(target)
  }
  const seen = new Set<string>()
  return nodes.filter(node => !seen.has(node.id) && seen.add(node.id)).map(node => pinOf(graph, node, sha256, readers))
}

/** The last line of a dispatch comment: `pins: <id>@<digest> <id>@<digest> …`. */
export function renderPins(pins: readonly Pin[]): string {
  return `${PINS_PREFIX}${pins.map(pin => `${pin.id}@${pin.digest}`).join(' ')}`
}

/** The pins in a pins line, or in the last `pins:` line of a longer text; undefined when there is none or it is malformed. */
export function parsePins(text: string): readonly Pin[] | undefined {
  const line = text.split(/\r?\n/).reverse().find(entry => entry.startsWith(PINS_PREFIX))
  if (line === undefined) return undefined
  const words = line.slice(PINS_PREFIX.length).trim().split(/\s+/).filter(word => word !== '')
  const pins: Pin[] = []
  for (const word of words) {
    const match = PIN_PATTERN.exec(word)
    if (match === null) return undefined
    pins.push({ id: match[1], digest: match[2] })
  }
  return pins.length === 0 ? undefined : pins
}

/**
 * The pinned nodes whose digest changed or that are gone from the graph.
 * An empty list means nothing the task rests on changed. A line that cannot
 * be read is reported as the single change `(pins)`/`missing`, so it is never
 * mistaken for fresh.
 */
export function staleness(graph: LoadedGraph, pinsLine: string, sha256: Sha256, readers: ModuleReaders = MODULE_READERS): readonly PinChange[] {
  const pins = parsePins(pinsLine)
  if (pins === undefined) return [{ id: '(pins)', change: 'missing', from: '' }]
  const changes: PinChange[] = []
  for (const pin of pins) {
    const node = graph.nodes.get(pin.id)
    if (node === undefined) {
      changes.push({ id: pin.id, change: 'missing', from: pin.digest })
      continue
    }
    const now = pinOf(graph, node, sha256, readers).digest
    if (now !== pin.digest) changes.push({ id: pin.id, change: 'changed', from: pin.digest, to: now })
  }
  return changes
}
