/**
 * Graph engine (docs/ORCHESTRATION.md §2.9, §2.11): the one API every
 * client uses. Reads load the node files fresh, so changes made by other
 * processes show up. Every write goes through apply: request shape, actor
 * permissions, state rules, revision check, one history entry per changed
 * node, validation of the would-be graph, then the store's atomic write.
 * Writes to one graph directory are serialized within the process.
 */
import { resolve } from 'node:path'
import { checkNode, nodeFile, type GraphIssue } from './format.ts'
import { PROPOSE_FIELDS, failure, parseMutation, type Failure, type Mutation, type ProposedNode } from './mutation.ts'
import { OPEN_STATUSES, listOpenItems, projectNode, type OpenItems, type Projection } from './projection.ts'
import {
  DISPATCH_FIELDS,
  EDITABLE_FIELDS,
  isPassingEvidence,
  type Actor,
  type EditableField,
  type Evidence,
  type FieldChange,
  type GraphEdge,
  type GraphNode,
  type HistoryEntry,
  type NodeType,
  type Status,
} from './schema.ts'
import { graphRevision, hasErrors, loadGraph, writeNodes, type LoadedGraph, type NodeWrite } from './store.ts'
import { validateGraph } from './validate.ts'

export interface EngineOptions {
  /** Clock for history timestamps; tests pin it. */
  readonly now?: () => Date
}

export type ApplyResult =
  | {
    readonly ok: true
    /** The node the mutation targeted (the new id for propose). */
    readonly id: string
    readonly rev: string
    /** Graph revision after the write, from the revisions read before it plus the files written. */
    readonly revision: string
    readonly node: GraphNode
    /** Every node file the mutation wrote, target first. */
    readonly changed: readonly string[]
  }
  | Failure

export interface GraphEngine {
  readonly dir: string
  load(): Promise<LoadedGraph>
  projection(id: string): Promise<{ readonly ok: true, readonly projection: Projection } | Failure>
  openItems(): Promise<OpenItems>
  /** The only write path. The actor comes from the client entry point, never from request data. */
  apply(actor: Actor, mutation: unknown): Promise<ApplyResult>
}

export function openEngine(dir: string, options: EngineOptions = {}): GraphEngine {
  const now = options.now ?? (() => new Date())
  return {
    dir,
    load: () => loadGraph(dir),
    projection: async id => projectNode(await loadGraph(dir), id),
    openItems: async () => listOpenItems(await loadGraph(dir)),
    apply: (actor, mutation) => apply(dir, actor, mutation, now),
  }
}

const queues = new Map<string, Promise<void>>()

/** Run writes to one graph directory one after another within this process. */
function exclusive<T>(dir: string, task: () => Promise<T>): Promise<T> {
  const key = resolve(dir)
  const run = (queues.get(key) ?? Promise.resolve()).then(task)
  const settled = run.then(() => undefined, () => undefined)
  queues.set(key, settled)
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return run
}

/**
 * Operations that need the human's authority (§2.9 table): the human, or an
 * llm write that relays the human's words. An llm decides a question on its
 * own only when the question's decider is the agent (checked per node).
 */
const HUMAN_ONLY = new Set<Mutation['op']>(['approve', 'reject', 'decide', 'supersede'])

/**
 * Fields llm and harness may edit on nodes other than their own open
 * proposals: wording, slope, the task dispatch attributes the main agent
 * sets when it hands a task out, and the decider of a question (handing a
 * question to the human is always allowed; taking one from the human needs
 * a relay). Acceptance criteria stay the human's.
 */
const LLM_EDITABLE = new Set<string>(['title', 'body', 'slope', 'decider', ...DISPATCH_FIELDS])

/** Types an llm or harness proposal may open directly under any open parent. */
const OPEN_PARENT_TYPES = new Set<NodeType>(['risk', 'question', 'retro'])

/** Statuses a node can be superseded from: adopted, in progress or finished. */
const SUPERSEDABLE = new Set<Status>(['approved', 'doing', 'done'])

/** Status transitions of the status operation (§2.9 table); the viewer offers these. */
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  proposed: [],
  approved: ['doing', 'done', 'dropped'],
  doing: ['done', 'dropped'],
  done: ['doing'],
  dropped: ['approved'],
  superseded: [],
}

const HUMAN_HINT = 'leave it for the human (it shows up in their decision queue); if the human asked for it in the chat, send their words verbatim as relay'

/** One node file to write: the raw would-be node, checked again before the write. */
interface Draft {
  readonly id: string
  readonly raw: Record<string, unknown>
  readonly expected: string | null
}

interface Plan {
  readonly ok: true
  readonly target: string
  readonly drafts: readonly Draft[]
  /** Maps an issue on the would-be graph back to a request field. */
  readonly fieldOf: (issue: GraphIssue) => string | undefined
}

interface Context {
  readonly graph: LoadedGraph
  readonly actor: Actor
  readonly at: string
  /** The human's words an llm write relays; recorded in every history entry the write appends. */
  readonly relay: string | undefined
  /** The write has the human's permissions: the human, or a relayed llm write. */
  readonly privileged: boolean
}

async function apply(dir: string, actor: Actor, input: unknown, now: () => Date): Promise<ApplyResult> {
  const parsed = parseMutation(input)
  if (!parsed.ok) return parsed
  const mutation = parsed.mutation
  const relay = mutation.op === 'comment' ? undefined : mutation.relay
  if (relay !== undefined && actor !== 'llm') {
    return failure('invalid', `${actor} writes do not relay`, actor === 'human' ? 'the human acts directly; leave relay out' : 'harness writes act on their own rules; leave relay out', 'relay')
  }
  const privileged = actor === 'human' || relay !== undefined
  if (!privileged && HUMAN_ONLY.has(mutation.op) && mutation.op !== 'decide') {
    return failure('forbidden', `${actor} cannot ${mutation.op}`, mutation.op === 'supersede'
      ? 'propose the new node with a supersedes edge; it takes effect when the human approves it, or at once with the human\'s words as relay'
      : HUMAN_HINT)
  }
  return exclusive(dir, async () => {
    const graph = await loadGraph(dir)
    if (hasErrors(graph)) {
      const errors = graph.issues.filter(issue => issue.severity === 'error')
      return failure('graph_invalid', `the graph has ${errors.length} validation error(s); first: ${describeIssue(errors[0])}`, 'fix the node files by hand or restore them with git, then retry')
    }
    const context: Context = { graph, actor, at: now().toISOString(), relay, privileged }
    const plan = mutation.op === 'propose' ? planPropose(context, mutation.node, mutation.reason) : planChange(context, mutation)
    if (!plan.ok) return plan
    return commit(dir, graph, plan)
  })
}

function describeIssue(issue: GraphIssue): string {
  return issue.field === undefined ? `${issue.file}: ${issue.message}` : `${issue.file} ${issue.field}: ${issue.message}`
}

function issueFailure(issue: GraphIssue, plan: Plan): Failure {
  return failure('invalid', describeIssue(issue), 'correct the request so the node passes the rules in docs/ORCHESTRATION.md §2.6', plan.fieldOf(issue))
}

/** Issues on the target file about a field the request can set are reported under base.<field>. */
function requestFields(file: string, base: string, settable: readonly string[]): (issue: GraphIssue) => string | undefined {
  const keys = new Set(settable)
  return issue => {
    if (issue.field === undefined || issue.file !== file) return issue.field
    const top = issue.field.split(/[.[]/)[0]
    return keys.has(top) ? `${base}.${issue.field}` : issue.field
  }
}

async function commit(dir: string, graph: LoadedGraph, plan: Plan): Promise<ApplyResult> {
  const next = new Map(graph.nodes)
  const writes: NodeWrite[] = []
  for (const draft of plan.drafts) {
    const issues: GraphIssue[] = []
    const node = checkNode(draft.raw, nodeFile(draft.id), issues)
    const error = issues.find(issue => issue.severity === 'error')
    if (error !== undefined) return issueFailure(error, plan)
    // checkNode reports an error whenever it returns undefined.
    next.set(draft.id, node!)
    writes.push({ node: node!, expected: draft.expected })
  }
  const graphError = validateGraph(next).find(issue => issue.severity === 'error')
  if (graphError !== undefined) return issueFailure(graphError, plan)
  const outcome = await writeNodes(dir, writes)
  if (!outcome.ok) {
    if (outcome.current !== null && plan.drafts.find(draft => draft.id === outcome.id)?.expected === null) {
      return failure('conflict', `node "${outcome.id}" was created by another writer`, 'propose again; the engine picks the next free id when id is left out', 'node.id')
    }
    return failure('stale_revision', `node "${outcome.id}" changed while the write was prepared`, 'read the projection again and retry with the new rev')
  }
  const revisions = new Map(graph.revisions)
  for (const [id, rev] of outcome.revisions) revisions.set(id, rev)
  return {
    ok: true,
    id: plan.target,
    rev: revisions.get(plan.target)!,
    revision: graphRevision(revisions),
    node: next.get(plan.target)!,
    changed: writes.map(write => write.node.id),
  }
}

/** A draft of an existing node: fields replaced (null removes one) and one history entry appended. */
function change(context: Context, node: GraphNode, patch: Readonly<Record<string, unknown>>, entry: HistoryEntry): Draft {
  const raw: Record<string, unknown> = { ...node }
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) delete raw[field]
    else raw[field] = value
  }
  raw.history = [...node.history, relayed(context, entry)]
  return { id: node.id, raw, expected: context.graph.revisions.get(node.id)! }
}

/** The history entry with the relayed words of the write, when it has any. */
function relayed(context: Context, entry: HistoryEntry): HistoryEntry {
  return context.relay === undefined ? entry : { ...entry, relay: context.relay }
}

/** A decide by the human or with the human's words; after one, only the human's authority decides the question again. */
function decidedByHuman(node: GraphNode): boolean {
  return node.history.some(entry => entry.op === 'decide' && (entry.actor === 'human' || entry.relay !== undefined))
}

/**
 * Why the actor may not decide this question without the human's
 * authority, or undefined when it may: the llm decides questions whose
 * decider is the agent, until the human has decided one of them.
 */
function decideRefusal(context: Context, node: GraphNode): Failure | undefined {
  if (context.privileged) return undefined
  if (node.decider !== 'agent') return failure('forbidden', `${context.actor} cannot decide "${node.id}": the human decides it`, HUMAN_HINT)
  if (decidedByHuman(node)) return failure('forbidden', `"${node.id}" was decided by the human; only the human decides it again`, HUMAN_HINT)
  return undefined
}

function plan(target: string, drafts: readonly Draft[], fieldOf: Plan['fieldOf'] = issue => issue.field): Plan {
  return { ok: true, target, drafts, fieldOf }
}

function withEvidence(node: GraphNode, evidence: readonly Evidence[] | undefined): Record<string, unknown> {
  return evidence === undefined || evidence.length === 0 ? {} : { evidence: [...node.evidence ?? [], ...evidence] }
}

function entryEvidence(evidence: readonly Evidence[] | undefined): { evidence?: readonly Evidence[] } {
  return evidence === undefined || evidence.length === 0 ? {} : { evidence }
}

/**
 * Supersede the targets of a node's supersedes edges that are still
 * adopted, in progress or finished; targets already closed are left alone.
 * A superseded decision's verification state becomes superseded as well.
 */
function supersedeTargets(context: Context, by: string, edges: readonly GraphEdge[] | undefined, reason: string): Draft[] {
  return (edges ?? []).filter(edge => edge.type === 'supersedes').flatMap(edge => {
    const target = context.graph.nodes.get(edge.to)
    if (target === undefined || !SUPERSEDABLE.has(target.status)) return []
    return [change(context, target, { status: 'superseded', ...(target.type === 'decision' ? { verification: 'superseded' } : {}) }, {
      at: context.at, actor: context.actor, op: 'supersede', reason, from: target.status, to: 'superseded', by,
    })]
  })
}

/** Initial status of a proposal (§2.9 propose row). */
function initialStatus(context: Context, node: ProposedNode): Status {
  if (context.privileged) return 'approved'
  // Supersession is a human decision, so a proposal that supersedes anything waits for approval.
  if ((node.edges ?? []).some(edge => edge.type === 'supersedes')) return 'proposed'
  const parent = node.parent === undefined ? undefined : context.graph.nodes.get(node.parent)
  if (parent === undefined) return 'proposed'
  if (node.type === 'task') {
    const underOpenWork = (parent.type === 'feature' || parent.type === 'task') && (parent.status === 'approved' || parent.status === 'doing')
    return underOpenWork ? 'approved' : 'proposed'
  }
  if (OPEN_PARENT_TYPES.has(node.type)) return OPEN_STATUSES.has(parent.status) ? 'approved' : 'proposed'
  return 'proposed'
}

function nextId(graph: LoadedGraph, type: NodeType): string {
  for (let index = 1; ; index++) {
    const id = `${type}-${index}`
    if (!graph.revisions.has(id)) return id
  }
}

function planPropose(context: Context, node: ProposedNode, reason: string): Plan | Failure {
  const { graph } = context
  if (node.id !== undefined && graph.revisions.has(node.id)) {
    return failure('conflict', `node "${node.id}" already exists`, 'leave id out and the engine picks the next free one', 'node.id')
  }
  const id = node.id ?? nextId(graph, node.type)
  const status = initialStatus(context, node)
  const raw: Record<string, unknown> = {
    ...node,
    id,
    status,
    ...(node.type === 'decision' ? { verification: 'unverified' } : {}),
    history: [relayed(context, { at: context.at, actor: context.actor, op: 'propose', reason, to: status })],
  }
  const drafts: Draft[] = [{ id, raw, expected: null }]
  if (status === 'approved') drafts.push(...supersedeTargets(context, id, node.edges, reason))
  return plan(id, drafts, requestFields(nodeFile(id), 'node', PROPOSE_FIELDS))
}

type Change = Exclude<Mutation, { readonly op: 'propose' }>

function planChange(context: Context, mutation: Change): Plan | Failure {
  const { graph, actor, at } = context
  const node = graph.nodes.get(mutation.id)
  if (node === undefined) return failure('not_found', `no node "${mutation.id}"`, 'check the id against the open items or a projection', 'id')
  if (mutation.op === 'comment') {
    return plan(node.id, [change(context, node, {}, { at, actor, op: 'comment', text: mutation.text })])
  }
  if (mutation.op === 'decide' && node.type === 'question') {
    const refusal = decideRefusal(context, node)
    if (refusal !== undefined) return refusal
  }
  const rev = graph.revisions.get(node.id)!
  if (mutation.rev !== rev) {
    return failure('stale_revision', `node "${node.id}" is at revision ${rev}, not ${mutation.rev}`, 'read the projection again and decide on the current state', 'rev')
  }
  const { reason } = mutation
  switch (mutation.op) {
    case 'approve':
    case 'reject': {
      if (node.status !== 'proposed') return failure('bad_transition', `"${node.id}" is ${node.status}, not proposed`, 'only proposed nodes are approved or rejected; use status for other changes')
      const to: Status = mutation.op === 'approve' ? 'approved' : 'dropped'
      const drafts = [change(context, node, { status: to }, { at, actor, op: mutation.op, reason, from: 'proposed', to })]
      if (mutation.op === 'approve') drafts.push(...supersedeTargets(context, node.id, node.edges, reason))
      return plan(node.id, drafts)
    }
    case 'status':
      return planStatus(context, node, mutation.to, mutation.evidence, reason)
    case 'edit':
      return planEdit(context, node, mutation.set, reason)
    case 'link':
    case 'unlink': {
      if (!context.privileged && node.type === 'goal') return failure('forbidden', `${actor} cannot change the edges of the goal`, HUMAN_HINT)
      const edge: GraphEdge = { type: mutation.type, to: mutation.to }
      const edges = node.edges ?? []
      const exists = edges.some(entry => entry.type === edge.type && entry.to === edge.to)
      if (mutation.op === 'unlink') {
        if (!exists) return failure('not_found', `"${node.id}" has no ${edge.type} edge to "${edge.to}"`, 'read the projection for the current edges', 'to')
        return plan(node.id, [change(context, node, { edges: edges.filter(entry => entry.type !== edge.type || entry.to !== edge.to) }, { at, actor, op: 'unlink', reason, edge })])
      }
      if (!graph.nodes.has(edge.to)) return failure('not_found', `no node "${edge.to}"`, 'link to an existing node', 'to')
      if (exists) return failure('conflict', `"${node.id}" already has a ${edge.type} edge to "${edge.to}"`, 'the edge is already there; nothing to do')
      return plan(node.id, [change(context, node, { edges: [...edges, edge] }, { at, actor, op: 'link', reason, edge })], issue => issue.field === 'edges' ? 'to' : issue.field)
    }
    case 'decide': {
      if (node.type !== 'question') return failure('invalid', `"${node.id}" is a ${node.type} node; decide applies to question nodes`, 'decide a question node', 'id')
      // A done question is decided again in place: the human overturns a decision without reopening it first.
      if (node.status !== 'approved' && node.status !== 'doing' && node.status !== 'done') {
        return failure('bad_transition', `"${node.id}" is ${node.status}`, node.status === 'proposed' ? 'approve the question first' : 'it is closed; propose a new question')
      }
      const keys = (node.options ?? []).map(entry => entry.key)
      if (!keys.includes(mutation.option)) return failure('invalid', `"${mutation.option}" is not an option of "${node.id}"`, `choose one of ${keys.join(', ')}`, 'option')
      if (node.status === 'done' && node.decision === mutation.option) return failure('bad_transition', `"${node.id}" is already decided ${mutation.option}`, 'nothing to change', 'option')
      const evidence: Evidence[] = [{ kind: 'decision', ref: mutation.option }]
      return plan(node.id, [change(context, node, { status: 'done', decision: mutation.option, ...withEvidence(node, evidence) }, {
        at, actor, op: 'decide', reason, from: node.status, to: 'done', option: mutation.option, evidence,
      })])
    }
    case 'verify': {
      if (node.type !== 'decision') return failure('invalid', `"${node.id}" is a ${node.type} node; verify applies to decision nodes`, 'verify a decision node', 'id')
      if (node.status === 'superseded') return failure('bad_transition', `"${node.id}" is superseded; its verification is final`, 'verify the decision that superseded it')
      const to = mutation.to
      if (to === 'superseded') return failure('bad_transition', 'a verification becomes superseded only through supersession', 'use supersede, or propose a decision with a supersedes edge', 'to')
      if (to === node.verification) return failure('bad_transition', `"${node.id}" is already ${to}`, 'nothing to change', 'to')
      const evidence = mutation.evidence
      if ((to === 'sandbox' || to === 'device') && !(evidence ?? []).some(entry => (entry.kind === 'test' || entry.kind === 'check') && entry.exit === 0)) {
        return failure('evidence_required', `verifying "${node.id}" as ${to} needs passing test or check evidence`, 'attach {kind: "test" or "check", ref: the command or checker, exit: 0}', 'evidence')
      }
      return plan(node.id, [change(context, node, { verification: to, ...withEvidence(node, evidence) }, {
        at, actor, op: 'verify', reason, from: node.verification!, to, ...entryEvidence(evidence),
      })])
    }
    case 'supersede': {
      const by = graph.nodes.get(mutation.by)
      if (by === undefined) return failure('not_found', `no node "${mutation.by}"`, 'name the existing node that replaces this one', 'by')
      if (by.id === node.id) return failure('invalid', 'a node cannot supersede itself', 'name the node that replaces this one', 'by')
      if (!SUPERSEDABLE.has(node.status)) return failure('bad_transition', `"${node.id}" is ${node.status} and cannot be superseded`, node.status === 'proposed' ? 'reject the proposal instead' : 'it is already closed')
      if (!SUPERSEDABLE.has(by.status)) return failure('bad_transition', `"${by.id}" is ${by.status}; only an approved, doing or done node supersedes another`, by.status === 'proposed' ? 'approve it first' : 'name an open replacement', 'by')
      const edge: GraphEdge = { type: 'supersedes', to: node.id }
      const drafts = supersedeTargets(context, by.id, [edge], reason)
      if (!(by.edges ?? []).some(entry => entry.type === edge.type && entry.to === edge.to)) {
        drafts.push(change(context, by, { edges: [...by.edges ?? [], edge] }, { at, actor, op: 'supersede', reason, edge }))
      }
      return plan(node.id, drafts)
    }
  }
}

function planStatus(context: Context, node: GraphNode, to: Status, evidence: readonly Evidence[] | undefined, reason: string): Plan | Failure {
  const { actor, at } = context
  const from = node.status
  if (from === to) return failure('bad_transition', `"${node.id}" is already ${to}`, 'nothing to change', 'to')
  if (from === 'proposed') return failure('bad_transition', `"${node.id}" is a proposal`, 'a human approves or rejects proposals; edit your own proposal while it waits')
  if (to === 'proposed') return failure('bad_transition', 'a node does not return to proposed', 'propose a new node instead', 'to')
  if (to === 'superseded') return failure('bad_transition', 'superseded is set only by supersession', 'propose the replacement with a supersedes edge', 'to')
  if (node.type === 'question' && to === 'done') return failure('bad_transition', 'a question closes only through decide', HUMAN_HINT, 'to')
  if (!TRANSITIONS[from].includes(to)) {
    return failure('bad_transition', `"${node.id}" cannot go from ${from} to ${to}`, `from ${from} the status can go to ${TRANSITIONS[from].join(', ')}`, 'to')
  }
  if (!context.privileged) {
    if ((node.type === 'goal' || node.type === 'feature') && (to === 'dropped' || from === 'dropped')) {
      return failure('forbidden', `${actor} cannot drop or restore a ${node.type}`, 'dropping or restoring a branch is plan-external: propose a question node under it for a human')
    }
    if (node.type === 'question' && to === 'dropped') return failure('forbidden', `${actor} cannot drop a question`, 'comment why it no longer matters; a human decides or drops it')
  }
  if (to === 'done' && !(evidence ?? []).some(isPassingEvidence)) {
    return failure('evidence_required', `marking "${node.id}" done needs passing evidence`, 'attach a commit hash, or a test or check run with exit 0', 'evidence')
  }
  return plan(node.id, [change(context, node, { status: to, ...withEvidence(node, evidence) }, { at, actor, op: 'status', reason, from, to, ...entryEvidence(evidence) })])
}

function planEdit(context: Context, node: GraphNode, set: Readonly<Partial<Record<EditableField, unknown>>>, reason: string): Plan | Failure {
  const { actor, at } = context
  const fields = Object.keys(set) as EditableField[]
  if (!context.privileged) {
    const relayHint = 'if the human asked for it in the chat, send their words verbatim as relay'
    if (node.type === 'goal') return failure('forbidden', `${actor} cannot edit the goal`, `goals, acceptance criteria and non-goals are the human's: propose a question node under the goal; ${relayHint}`)
    const first = node.history[0]
    const ownProposal = node.status === 'proposed' && first?.op === 'propose' && first.actor === actor
    const denied = ownProposal ? undefined : fields.find(field => !LLM_EDITABLE.has(field))
    if (denied !== undefined) {
      return failure('forbidden', `${actor} cannot edit ${denied} of "${node.id}"`, `${actor} edits ${[...LLM_EDITABLE].join(', ')}, or any field of its own open proposal; propose a question node to change the rest; ${relayHint}`, `set.${denied}`)
    }
    if (set.decider === 'agent' && node.decider !== 'agent') {
      return failure('forbidden', `${actor} cannot take "${node.id}" from the human`, `the human decides it; ${relayHint}`, 'set.decider')
    }
  }
  const raw: Record<string, unknown> = { ...node }
  for (const field of fields) {
    if (set[field] === null) delete raw[field]
    else raw[field] = set[field]
  }
  const file = nodeFile(node.id)
  const fieldOf = requestFields(file, 'set', EDITABLE_FIELDS)
  const issues: GraphIssue[] = []
  const checked = checkNode(raw, file, issues)
  const error = issues.find(issue => issue.severity === 'error')
  if (error !== undefined) return failure('invalid', describeIssue(error), 'correct the request so the node passes the rules in docs/ORCHESTRATION.md §2.6', fieldOf(error))
  const changes: Partial<Record<EditableField, FieldChange>> = {}
  for (const field of EDITABLE_FIELDS) {
    if (!fields.includes(field)) continue
    const before = node[field] ?? null
    const after = checked![field] ?? null
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[field] = { from: before, to: after }
  }
  if (Object.keys(changes).length === 0) return failure('invalid', 'set changes nothing', 'send only fields whose value differs', 'set')
  const patch = Object.fromEntries(fields.map(field => [field, set[field]]))
  return plan(node.id, [change(context, node, patch, { at, actor, op: 'edit', reason, changes })], fieldOf)
}
