/**
 * Read projections (docs/ORCHESTRATION.md §2.5, §2.9): what one step needs
 * to know about one node, and the open items across the graph. Pure
 * functions over a loaded graph. Gates are reported, never enforced. The
 * graph may carry validation errors (reads stay available), so every walk
 * guards against cycles.
 */
import { compareText } from './format.ts'
import { failure, type Failure } from './mutation.ts'
import type { Actor, Decider, DecisionOption, GraphNode, HistoryEntry, NodeType, Stage, Status } from './schema.ts'
import type { LoadedGraph } from './store.ts'

/** Statuses of nodes that are still open: not done, dropped or superseded. */
export const OPEN_STATUSES: ReadonlySet<Status> = new Set(['proposed', 'approved', 'doing'])

/** History entries a projection carries; the full history stays in the node file. */
const RECENT_HISTORY = 5

/** Decisions the open items list, newest first; older ones stay on their question nodes. */
const RECENT_DECISIONS = 20

/** Who decides a question: its decider, the human when it names none. */
export function deciderOf(node: GraphNode): Decider {
  return node.decider ?? 'human'
}

/** An open question waiting for the human: a question the agent decides never makes anything wait for the human. */
export function waitsForHuman(node: GraphNode): boolean {
  return node.type === 'question' && OPEN_STATUSES.has(node.status) && deciderOf(node) === 'human'
}

export interface NodeRef {
  readonly id: string
  readonly type: NodeType
  readonly title: string
  readonly status: Status
  /** Revision to pass back in a mutation of this node. */
  readonly rev: string
  readonly verification?: GraphNode['verification']
  readonly decision?: string
}

/** An ancestor; the goal at the end of the chain carries its acceptance criteria and non-goals. */
interface AncestorRef extends NodeRef {
  readonly acceptance?: readonly string[]
  readonly nonGoals?: readonly string[]
}

type NodeDetail = Omit<GraphNode, 'history'> & { readonly rev: string }

type GateKind = 'dependencies' | 'approval' | 'questions' | 'decisions' | 'acceptance' | 'children' | 'verification'

interface Gate {
  readonly kind: GateKind
  readonly message: string
  readonly ids: readonly string[]
}

export interface Projection {
  /** Graph revision the projection was read at. */
  readonly revision: string
  readonly node: NodeDetail
  readonly historyCount: number
  readonly recentHistory: readonly HistoryEntry[]
  /** Parent first, goal last. */
  readonly ancestors: readonly AncestorRef[]
  readonly children: readonly NodeRef[]
  /** Nodes this one depends on, and nodes that depend on it. */
  readonly dependsOn: readonly NodeRef[]
  readonly dependents: readonly NodeRef[]
  /** Nodes this one exists because of, and nodes that exist because of it. */
  readonly sources: readonly NodeRef[]
  readonly sourceOf: readonly NodeRef[]
  readonly supersedes: readonly NodeRef[]
  readonly supersededBy: readonly NodeRef[]
  /** Own stage, or the stage of the nearest ancestor that has one. */
  readonly stage: Stage | null
  readonly gates: readonly Gate[]
}

/** One card of a decision queue (§5): an open question with what its decider needs to decide it. */
interface QueueEntry extends NodeRef {
  readonly body?: string
  readonly options: readonly DecisionOption[]
  readonly recommend?: string
  readonly decider: Decider
  /** The node the question was raised under (its parent); null when the parent is missing. */
  readonly raisedBy: NodeRef | null
  /** Nodes the question exists because of (its source edges). */
  readonly sources: readonly NodeRef[]
  /** Time and actor of the proposal, from the first history entry (absent only in a graph with validation errors); the queue runs oldest first. */
  readonly askedAt?: string
  readonly askedBy?: Actor
}

/** The latest decide of a question: what was chosen, by whom, and whether it relayed the human's words. */
interface DecisionRecord extends NodeRef {
  readonly decision: string
  /** Label of the chosen option. */
  readonly label: string
  readonly decider: Decider
  readonly decidedAt: string
  readonly decidedBy: Actor
  readonly relay?: string
  readonly reason?: string
  /** Number of decides; above 1 means the question was decided again (overturned). */
  readonly rounds: number
  readonly raisedBy: NodeRef | null
}

export interface OpenItems {
  readonly revision: string
  /** Proposals waiting for a human to approve or reject them. */
  readonly proposals: readonly NodeRef[]
  /** The human's decision queue: approved or reopened questions the human decides, oldest first. */
  readonly questions: readonly QueueEntry[]
  /** Approved or reopened questions the agent decides itself, oldest first. */
  readonly agentQueue: readonly QueueEntry[]
  /** The latest decides across the graph, newest first, at most RECENT_DECISIONS; the human overturns any of them. */
  readonly recentDecisions: readonly DecisionRecord[]
  readonly doing: readonly NodeRef[]
  /** Approved tasks without open or finished children whose dependencies are all done. */
  readonly ready: readonly NodeRef[]
  /** Adopted decisions (approved, doing or done) still unverified. */
  readonly verificationDebt: readonly NodeRef[]
}

function nodeRef(graph: LoadedGraph, node: GraphNode): NodeRef {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    rev: graph.revisions.get(node.id)!,
    ...(node.verification === undefined ? {} : { verification: node.verification }),
    ...(node.decision === undefined ? {} : { decision: node.decision }),
  }
}

function childrenIndex(graph: LoadedGraph): ReadonlyMap<string, readonly GraphNode[]> {
  const index = new Map<string, GraphNode[]>()
  for (const node of graph.nodes.values()) {
    if (node.parent === undefined) continue
    const list = index.get(node.parent)
    if (list === undefined) index.set(node.parent, [node])
    else list.push(node)
  }
  return index
}

/** Targets of this node's edges of one type that exist in the graph. */
function targets(graph: LoadedGraph, node: GraphNode, type: 'depends' | 'source' | 'supersedes'): GraphNode[] {
  return (node.edges ?? []).filter(edge => edge.type === type).flatMap(edge => {
    const target = graph.nodes.get(edge.to)
    return target === undefined ? [] : [target]
  })
}

/** Nodes with an edge of one type pointing at this node, in id order. */
function referrers(graph: LoadedGraph, id: string, type: 'depends' | 'source' | 'supersedes'): GraphNode[] {
  return [...graph.nodes.values()].filter(node => (node.edges ?? []).some(edge => edge.type === type && edge.to === id))
}

function ancestorsOf(graph: LoadedGraph, node: GraphNode): GraphNode[] {
  const chain: GraphNode[] = []
  const seen = new Set([node.id])
  let parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  while (parent !== undefined && !seen.has(parent.id)) {
    seen.add(parent.id)
    chain.push(parent)
    parent = parent.parent === undefined ? undefined : graph.nodes.get(parent.parent)
  }
  return chain
}

/** The node and all its descendants. */
function subtreeOf(index: ReadonlyMap<string, readonly GraphNode[]>, node: GraphNode): GraphNode[] {
  const out: GraphNode[] = []
  const seen = new Set<string>()
  const queue = [node]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (seen.has(next.id)) continue
    seen.add(next.id)
    out.push(next)
    queue.push(...index.get(next.id) ?? [])
  }
  return out
}

function ids(nodes: readonly GraphNode[]): string[] {
  return nodes.map(node => node.id)
}

function gatesOf(node: GraphNode, dependsOn: readonly GraphNode[], children: readonly GraphNode[], subtree: readonly GraphNode[]): Gate[] {
  const gates: Gate[] = []
  const openDependencies = dependsOn.filter(target => target.status !== 'done')
  if (openDependencies.length > 0) gates.push({ kind: 'dependencies', message: 'depends on nodes that are not done', ids: ids(openDependencies) })
  if (node.status === 'proposed') gates.push({ kind: 'approval', message: 'waits for a human to approve or reject it', ids: [node.id] })
  const humanQuestions = subtree.filter(waitsForHuman)
  if (humanQuestions.length > 0) gates.push({ kind: 'questions', message: 'questions in this subtree wait for a human decision', ids: ids(humanQuestions) })
  const agentQuestions = subtree.filter(entry => entry.type === 'question' && OPEN_STATUSES.has(entry.status) && deciderOf(entry) === 'agent')
  if (agentQuestions.length > 0) gates.push({ kind: 'decisions', message: 'questions in this subtree are the agent\'s to decide', ids: ids(agentQuestions) })
  if (node.type === 'task' && (node.acceptance ?? []).length === 0) gates.push({ kind: 'acceptance', message: 'the task has no acceptance criteria', ids: [node.id] })
  const openChildren = children.filter(child => OPEN_STATUSES.has(child.status))
  if (openChildren.length > 0) gates.push({ kind: 'children', message: 'children are not all closed', ids: ids(openChildren) })
  if (node.type === 'decision' && node.verification === 'unverified') gates.push({ kind: 'verification', message: 'the decision is not verified yet', ids: [node.id] })
  return gates
}

export function projectNode(graph: LoadedGraph, id: string): { readonly ok: true, readonly projection: Projection } | Failure {
  const node = graph.nodes.get(id)
  if (node === undefined) return failure('not_found', `no readable node "${id}"`, 'list the nodes with load or the open items; a file that fails to parse is reported in the load issues', 'id')
  const index = childrenIndex(graph)
  const ref = (entry: GraphNode): NodeRef => nodeRef(graph, entry)
  const ancestors = ancestorsOf(graph, node)
  const children = index.get(id) ?? []
  const dependsOn = targets(graph, node, 'depends')
  const { history, ...fields } = node
  const stage = [node, ...ancestors].find(entry => entry.stage !== undefined)?.stage ?? null
  return {
    ok: true,
    projection: {
      revision: graph.revision,
      node: { ...fields, rev: graph.revisions.get(id)! },
      historyCount: history.length,
      recentHistory: history.slice(-RECENT_HISTORY),
      ancestors: ancestors.map(entry => entry.type !== 'goal' ? ref(entry) : {
        ...ref(entry),
        ...(entry.acceptance === undefined ? {} : { acceptance: entry.acceptance }),
        ...(entry.nonGoals === undefined ? {} : { nonGoals: entry.nonGoals }),
      }),
      children: children.map(ref),
      dependsOn: dependsOn.map(ref),
      dependents: referrers(graph, id, 'depends').map(ref),
      sources: targets(graph, node, 'source').map(ref),
      sourceOf: referrers(graph, id, 'source').map(ref),
      supersedes: targets(graph, node, 'supersedes').map(ref),
      supersededBy: referrers(graph, id, 'supersedes').map(ref),
      stage,
      gates: gatesOf(node, dependsOn, children, subtreeOf(index, node)),
    },
  }
}

function queueEntry(graph: LoadedGraph, node: GraphNode): QueueEntry {
  const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  const first = node.history[0]
  return {
    ...nodeRef(graph, node),
    ...(node.body === undefined ? {} : { body: node.body }),
    options: node.options ?? [],
    ...(node.recommend === undefined ? {} : { recommend: node.recommend }),
    decider: deciderOf(node),
    raisedBy: parent === undefined ? null : nodeRef(graph, parent),
    sources: targets(graph, node, 'source').map(entry => nodeRef(graph, entry)),
    ...(first === undefined ? {} : { askedAt: first.at, askedBy: first.actor }),
  }
}

/** Oldest first by proposal time, then id; entries without a time go last. */
function compareQueue(a: QueueEntry, b: QueueEntry): number {
  const time = (entry: QueueEntry): number => entry.askedAt === undefined ? Infinity : Date.parse(entry.askedAt)
  // Infinity - Infinity is NaN, which falls through to the id like a tie.
  return time(a) - time(b) || compareText(a.id, b.id)
}

function decisionRecord(graph: LoadedGraph, node: GraphNode): DecisionRecord | undefined {
  const decides = node.history.filter(entry => entry.op === 'decide')
  const last = decides.at(-1)
  if (node.status !== 'done' || node.decision === undefined || last === undefined) return undefined
  const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
  return {
    ...nodeRef(graph, node),
    decision: node.decision,
    label: node.options?.find(entry => entry.key === node.decision)?.label ?? node.decision,
    decider: deciderOf(node),
    decidedAt: last.at,
    decidedBy: last.actor,
    ...(last.relay === undefined ? {} : { relay: last.relay }),
    ...(last.reason === undefined ? {} : { reason: last.reason }),
    rounds: decides.length,
    raisedBy: parent === undefined ? null : nodeRef(graph, parent),
  }
}

/** Newest first by decide time, then id. */
function compareDecisions(a: DecisionRecord, b: DecisionRecord): number {
  return Date.parse(b.decidedAt) - Date.parse(a.decidedAt) || compareText(a.id, b.id)
}

export function listOpenItems(graph: LoadedGraph): OpenItems {
  const index = childrenIndex(graph)
  const all = [...graph.nodes.values()]
  const ref = (entry: GraphNode): NodeRef => nodeRef(graph, entry)
  const ready = all.filter(node =>
    node.type === 'task'
    && node.status === 'approved'
    && (index.get(node.id) ?? []).every(child => child.status === 'dropped' || child.status === 'superseded')
    && targets(graph, node, 'depends').every(target => target.status === 'done'))
  const open = all.filter(node => node.type === 'question' && (node.status === 'approved' || node.status === 'doing'))
  const queue = (decider: Decider): QueueEntry[] => open.filter(node => deciderOf(node) === decider)
    .map(node => queueEntry(graph, node))
    .sort(compareQueue)
  return {
    revision: graph.revision,
    proposals: all.filter(node => node.status === 'proposed').map(ref),
    questions: queue('human'),
    agentQueue: queue('agent'),
    recentDecisions: all.flatMap(node => node.type === 'question' ? decisionRecord(graph, node) ?? [] : [])
      .sort(compareDecisions)
      .slice(0, RECENT_DECISIONS),
    doing: all.filter(node => node.status === 'doing').map(ref),
    ready: ready.map(ref),
    verificationDebt: all.filter(node => node.type === 'decision' && node.verification === 'unverified' && (node.status === 'approved' || node.status === 'doing' || node.status === 'done')).map(ref),
  }
}
