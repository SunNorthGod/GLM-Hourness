/**
 * The user graph's derivations (design 0.4.1 §2.5, §2.6, §3.6; decision
 * d-user-graph-one-graph): step and flow states, the gaps both directions,
 * the display order of a flow's steps, the walk spec merged from the flow's
 * 走法 line and the merge gate's walk commands, the release and completion
 * items, and the pages a confirm or release appends. Pure functions over a
 * loaded graph: no Node built-ins, no file system, so the host, the tools
 * and the panel read the same states from the same graph, and the same
 * graph yields the same bytes. Liveness is `liveOf` (user-live.ts); nothing
 * here mutates the graph. One call builds its indexes once (children, the
 * serves edges reversed, the depends edges reversed) and every walk keeps a
 * visited set, so next and depends cycles (a graph may carry validation
 * errors) end.
 */
import { OUTDATED_LABEL, USER_STATE_LABELS } from './labels.ts'
import { byCreation, isSplit, moduleCandidatesOf, moduleOf, modulesOf } from './modules.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf, childrenIndex, subtreeOf } from './projection.ts'
import { labeledSections, type GateItem } from './stage.ts'
import { USER_LIMITS, USER_TYPES, type Actor, type GraphEdge, type GraphNode, type NodeType } from './schema.ts'
import { liveOf } from './user-live.ts'
import { WALK_SECONDS_LIMIT, parseWalkLine, walkCommandsOf, type WalkKind } from './walk-spec.ts'

/** The derived state of a step (design 0.4.1 §2.5); a flow's and a role's is `FlowState`. */
export type StepState = 'proposed' | 'unserved' | 'planned' | 'building' | 'built' | 'walked' | 'failed'
export type FlowState = StepState | 'empty'

/** One walk history entry of a step that counts (§2.5): the harness's, the person's, or relayed by the main agent. */
export interface WalkRecord {
  readonly at: string
  readonly actor: Actor
  /** Every evidence entry of the walk exited 0. */
  readonly ok: boolean
  /** How the walk was made, from its first evidence ref. */
  readonly via: 'command' | 'screenshot' | 'transcript' | 'person'
  /** The commit the walk ran at, parsed from the note's leading @<commit>; absent when the note names none. */
  readonly commit?: string
  readonly note: string
}

export interface StepView {
  readonly step: GraphNode
  readonly state: StepState
  /** The flow's connected work moved after the last walk: the result is stale (做完了，要重走). */
  readonly outdated: boolean
  /** The live features and tasks that serve this step, reviews left out. */
  readonly servers: readonly GraphNode[]
  /** The work the step's progress reads (leavesOf, §2.5). */
  readonly leaves: readonly GraphNode[]
  readonly lastWalk?: WalkRecord
}

/** A flow's 走法 merged with the merge gate's command (§2.7). */
export type WalkSpec =
  | { readonly kind: Exclude<WalkKind, '你来走'>, readonly seconds: number, readonly command: string }
  | { readonly kind: '你来走' }

export interface FlowView {
  readonly flow: GraphNode
  readonly state: FlowState
  /** The live steps in display order: from the entry depth first, the steps it does not reach by creation time at the end. */
  readonly steps: readonly StepView[]
  /** The live step the flow's own next edge points at, when there is exactly one. */
  readonly entry?: GraphNode
  /** Live steps the entry does not reach (all of them when there is no single entry). */
  readonly unreachable: readonly GraphNode[]
  readonly counts: Readonly<Record<StepState, number>>
  readonly spec: WalkSpec | { readonly unparsed: string }
}

export interface RoleView {
  readonly role: GraphNode
  readonly state: FlowState
  readonly flows: readonly FlowView[]
}

/** The gap keys in the order of design §2.6's table: the order gaps are listed in. */
const GAP_KEYS = [
  'step:unserved', 'work:orphan', 'step:no-expect', 'step:failed', 'flow:empty', 'role:no-flow', 'flow:entry', 'flow:unreachable',
  'step:branch', 'step:next-dropped', 'flow:no-walk', 'flow:no-test', 'flow:too-long', 'step:too-many-branches',
] as const
export type GapKey = typeof GAP_KEYS[number]

export interface Gap {
  readonly key: GapKey
  readonly nodes: readonly string[]
  /** The sentence a person reads (§6.5). */
  readonly text: string
  /** The right way forward, for the model. */
  readonly hint: string
  /** Why a work is an orphan (review 5 finding 1): set on work:orphan only. */
  readonly reason?: 'never-served' | 'steps-dropped'
}

export interface UserGraph {
  readonly goal: GraphNode
  readonly roles: readonly RoleView[]
  /** The goal's gaps: by key in §2.6's table order, then roles, flows and steps in display order. */
  readonly gaps: readonly Gap[]
  /** The goal has a user graph: at least one live role under it. */
  readonly present: boolean
  /** The graph the views were read from: the serves pages name the servers' features and the module's subtree. */
  readonly graph: LoadedGraph
}

export interface UserPage {
  /** What the person agrees to: roles, flows, steps, conditions, owners, the commands. A change to it invalidates the showing. */
  readonly stable: string
  /** As of the showing: step states, other modules, the timeout caps. Not compared when the person answers. */
  readonly state: string
}

/** The norm node whose acceptance names the walk commands (§2.7). */
const MERGE_GATE_ID = 'norm-merge-gate'

/** The timeout bounds of a walk (§2.7). */
const TIMEOUT_MIN_MS = 10_000
const TIMEOUT_MAX_MS = 30 * 60 * 1000

const STEP_STATES: readonly StepState[] = ['proposed', 'unserved', 'planned', 'building', 'built', 'walked', 'failed']
/** A flow folds its approved steps to the first of these present, when none failed and not all are walked (§2.5). */
const STEP_FOLD: readonly StepState[] = ['unserved', 'planned', 'building', 'built']
/** A role folds its flows the same way (§2.5). */
const FLOW_FOLD: readonly FlowState[] = ['proposed', 'empty', 'unserved', 'planned', 'building', 'built']

/** The gaps the release item flows:shape stands for (§5.2). */
const SHAPE_KEYS: readonly GapKey[] = ['role:no-flow', 'flow:empty', 'flow:entry', 'flow:unreachable', 'step:branch', 'step:next-dropped']

const STATE_HEADING = '截至给你看的时刻（这一段只是给你看现状，不是你要同意的内容，之后会变）'
const TIMEOUT_TEXT = '超时是预计秒数的 3 倍，跑过几次之后按最近三次里最慢的一次的 3 倍，不低于 10 秒、不高于 30 分钟。写着「你来走」的流程不跑命令，这里写「没法自动测，做完时请你亲自走一遍」。'
const BY_PERSON = '没法自动测，做完时请你亲自走一遍'

export function isUserNode(node: GraphNode): boolean {
  return (USER_TYPES as readonly string[]).includes(node.type)
}

/** Indexes one call builds and everything below reads. */
interface Index {
  readonly graph: LoadedGraph
  readonly children: ReadonlyMap<string, readonly GraphNode[]>
  /** The nodes with a serves edge to a step, by step id. */
  readonly servesTo: ReadonlyMap<string, readonly GraphNode[]>
  /** The nodes with a depends edge to a node, by that node's id. */
  readonly dependedBy: ReadonlyMap<string, readonly string[]>
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [value])
  else list.push(value)
}

function buildIndex(graph: LoadedGraph): Index {
  const servesTo = new Map<string, GraphNode[]>()
  const dependedBy = new Map<string, string[]>()
  for (const node of graph.nodes.values()) {
    for (const edge of node.edges ?? []) {
      if (edge.type === 'serves') push(servesTo, edge.to, node)
      else if (edge.type === 'depends') push(dependedBy, edge.to, node.id)
    }
  }
  return { graph, children: childrenIndex(graph), servesTo, dependedBy }
}

/** Work in the sense of §2.5: a feature, or a task that is not a review. */
function isWork(node: GraphNode): boolean {
  return node.type === 'feature' || (node.type === 'task' && node.kind !== 'review')
}

/** The live children of one type, by creation time. */
function liveChildren(index: Index, node: GraphNode, type: NodeType): GraphNode[] {
  return (index.children.get(node.id) ?? []).filter(child => child.type === type && liveOf(index.graph, child)).sort(byCreation)
}

/** The live step an edge points at; undefined when the target is missing, not a step, or not live. */
function liveStep(index: Index, id: string): GraphNode | undefined {
  const target = index.graph.nodes.get(id)
  return target !== undefined && target.type === 'step' && liveOf(index.graph, target) ? target : undefined
}

function nextEdges(node: GraphNode): GraphEdge[] {
  return (node.edges ?? []).filter(edge => edge.type === 'next')
}

/** The live work below one node, the node itself left out. */
function workBelow(index: Index, node: GraphNode): GraphNode[] {
  return subtreeOf(index.children, node).slice(1).filter(entry => isWork(entry) && liveOf(index.graph, entry))
}

/** Whether a node's own serves edges reach a live step. */
function servesLive(index: Index, node: GraphNode): boolean {
  return (node.edges ?? []).some(edge => edge.type === 'serves' && liveStep(index, edge.to) !== undefined)
}

/** The step's servers (§2.5 serversOf): live work with a serves edge to it. */
function serversOf(index: Index, step: GraphNode): GraphNode[] {
  return (index.servesTo.get(step.id) ?? []).filter(server => isWork(server) && liveOf(index.graph, server))
}

/**
 * The leaves of one feature (§2.5): its live work children, a task being a
 * leaf itself and a feature contributing its own leaves, or itself when it
 * has none.
 */
function featureLeaves(index: Index, feature: GraphNode): GraphNode[] {
  const out: GraphNode[] = []
  const seen = new Set<string>([feature.id])
  const visit = (node: GraphNode): void => {
    for (const child of index.children.get(node.id) ?? []) {
      if (seen.has(child.id) || !isWork(child) || !liveOf(index.graph, child)) continue
      seen.add(child.id)
      if (child.type === 'task') {
        out.push(child)
        continue
      }
      const before = out.length
      visit(child)
      if (out.length === before) out.push(child)
    }
  }
  visit(feature)
  return out.length > 0 ? out : [feature]
}

/**
 * The step's leaves (§2.5 leavesOf): a task server is its own leaf; a
 * feature server F contributes the live tasks below it that serve this step
 * themselves, or, when none does, all its leaves. The narrowing happens only
 * to F's own descendants: a test task elsewhere (another module, directly
 * under the goal) linked to a step that only F covers adds itself as a task
 * server and leaves F's leaves in place (review 5 finding 3), so such a test
 * task may be linked to it.
 */
function leavesOf(index: Index, step: GraphNode, servers: readonly GraphNode[]): GraphNode[] {
  const out = new Map<string, GraphNode>()
  for (const server of servers) {
    if (server.type === 'task') {
      out.set(server.id, server)
      continue
    }
    const direct = workBelow(index, server).filter(node => node.type === 'task' && (node.edges ?? []).some(edge => edge.type === 'serves' && edge.to === step.id))
    for (const leaf of direct.length > 0 ? direct : featureLeaves(index, server)) out.set(leaf.id, leaf)
  }
  return [...out.values()]
}

/** The walk history entries a step carries that count (§2.5): the harness's, the human's, or an llm's with the person's words; the rest of a hand-edited file is not trusted. */
function walkRecordsOf(step: GraphNode): WalkRecord[] {
  const out: WalkRecord[] = []
  for (const entry of step.history) {
    if (entry.op !== 'walk') continue
    if (!(entry.actor === 'harness' || entry.actor === 'human' || (entry.actor === 'llm' && entry.relay !== undefined))) continue
    const evidence = entry.evidence ?? []
    const first = evidence[0]
    if (first === undefined) continue
    const via = (['command', 'screenshot', 'transcript', 'person'] as const).find(kind => first.ref.startsWith(`${kind}:`))
    if (via === undefined) continue
    const note = first.note ?? ''
    const commit = /^@([0-9a-f]{7,40}) /u.exec(note)?.[1]
    out.push({ at: entry.at, actor: entry.actor, ok: evidence.every(item => item.exit === 0), via, ...(commit === undefined ? {} : { commit }), note })
  }
  return out
}

/** The result line of a walk note: the @<commit> and the harness's sha256 digest left out; the gaps and the panel's walk line (ui/src/graph/user-view.ts) say it. */
export function walkResult(note: string): string {
  return note.replace(/^@[0-9a-f]{7,40} /u, '').replace(/^sha256:(?:[0-9a-f]{8}|-) /u, '')
}

/**
 * Whether the flow's connected work moved at or after a walk (§2.5): the
 * flow, its live steps, their servers and the servers' leaves, any history
 * entry that is not a comment or a walk. A serves link or unlink counts only
 * when it touches a live step of this flow, so a module serving another
 * flow does not stale this one. Equal times count as moved (the
 * conservative side).
 */
function outdatedSince(index: Index, flow: GraphNode, liveSteps: readonly GraphNode[], since: number): boolean {
  const steps = new Set(liveSteps.map(step => step.id))
  const scope = new Map<string, GraphNode>([[flow.id, flow]])
  for (const step of liveSteps) {
    scope.set(step.id, step)
    const servers = serversOf(index, step)
    for (const server of servers) scope.set(server.id, server)
    for (const leaf of leavesOf(index, step, servers)) scope.set(leaf.id, leaf)
  }
  return [...scope.values()].some(node => node.history.some((entry) => {
    if (entry.op === 'comment' || entry.op === 'walk' || Date.parse(entry.at) < since) return false
    if ((entry.op === 'link' || entry.op === 'unlink') && entry.edge?.type === 'serves') return steps.has(entry.edge.to)
    return true
  }))
}

/** The step's state (§2.5): the first row of the design's table that holds. */
function stepStateOf(index: Index, step: GraphNode, servers: readonly GraphNode[], leaves: readonly GraphNode[], flow: GraphNode, liveSteps: readonly GraphNode[]): { readonly state: StepState, readonly outdated: boolean } {
  if (step.status === 'proposed') return { state: 'proposed', outdated: false }
  if (servers.length === 0) return { state: 'unserved', outdated: false }
  if (!leaves.some(leaf => leaf.status === 'doing' || leaf.status === 'done')) return { state: 'planned', outdated: false }
  if (!leaves.every(leaf => leaf.status === 'done')) return { state: 'building', outdated: false }
  const last = walkRecordsOf(step).at(-1)
  if (last === undefined) return { state: 'built', outdated: false }
  if (outdatedSince(index, flow, liveSteps, Date.parse(last.at))) return { state: 'built', outdated: true }
  return { state: last.ok ? 'walked' : 'failed', outdated: false }
}

/** The live steps a step's or a flow's next edges reach, by target creation time, then id. */
function nextSteps(index: Index, node: GraphNode): GraphNode[] {
  return nextEdges(node).flatMap(edge => liveStep(index, edge.to) ?? []).sort(byCreation)
}

/** The display order of a flow's steps (§2.3): depth first from the single entry, already listed steps not repeated; the unreachable by creation time at the end. */
function orderedSteps(index: Index, flow: GraphNode, liveSteps: readonly GraphNode[]): { readonly ordered: readonly GraphNode[], readonly unreachable: readonly GraphNode[], readonly entry?: GraphNode } {
  const entries = nextSteps(index, flow)
  const entry = entries.length === 1 ? entries[0] : undefined
  const ordered: GraphNode[] = []
  const seen = new Set<string>()
  const visit = (step: GraphNode): void => {
    if (seen.has(step.id)) return
    seen.add(step.id)
    ordered.push(step)
    for (const target of nextSteps(index, step)) visit(target)
  }
  if (entry !== undefined) visit(entry)
  const unreachable = liveSteps.filter(step => !seen.has(step.id))
  return { ordered: [...ordered, ...unreachable], unreachable, ...(entry === undefined ? {} : { entry }) }
}

/** The flow's 走法 merged with the merge gate's commands (§2.7 walkSpecOf); `unparsed` says why it cannot be walked automatically. */
function walkSpecFromIndex(index: Index, flow: GraphNode): WalkSpec | { readonly unparsed: string } {
  const parsed = parseWalkLine(flow.body)
  if ('unparsed' in parsed) return parsed
  if (parsed.kind === '你来走') return { kind: '你来走' }
  const gate = index.graph.nodes.get(MERGE_GATE_ID)
  const { commands, skipped } = walkCommandsOf(gate !== undefined && gate.type === 'norm' && liveOf(index.graph, gate) ? gate.acceptance : undefined)
  const command = commands[parsed.kind]
  if (command === undefined) {
    return { unparsed: skipped.find(reason => reason.includes(`「${parsed.kind}」`)) ?? `合入前检查清单里没有「${parsed.kind}」这一种走法的 walk 行` }
  }
  return { kind: parsed.kind, seconds: parsed.seconds ?? WALK_SECONDS_LIMIT, command: command.replaceAll('{flow}', flow.id) }
}

/** The flow's state (§2.5): over its live approved steps; proposed steps are only counted. */
function flowStateOf(flow: GraphNode, steps: readonly StepView[]): FlowState {
  if (flow.status === 'proposed') return 'proposed'
  const approved = steps.filter(view => view.step.status === 'approved')
  if (approved.length === 0) return 'empty'
  if (approved.some(view => view.state === 'failed')) return 'failed'
  if (approved.every(view => view.state === 'walked')) return 'walked'
  return STEP_FOLD.find(state => approved.some(view => view.state === state)) ?? 'built'
}

function flowViewOf(index: Index, flow: GraphNode): FlowView {
  const liveSteps = liveChildren(index, flow, 'step')
  const { ordered, unreachable, entry } = orderedSteps(index, flow, liveSteps)
  const steps = ordered.map((step): StepView => {
    const servers = serversOf(index, step)
    const leaves = leavesOf(index, step, servers)
    const { state, outdated } = stepStateOf(index, step, servers, leaves, flow, liveSteps)
    const lastWalk = walkRecordsOf(step).at(-1)
    return { step, state, outdated, servers, leaves, ...(lastWalk === undefined ? {} : { lastWalk }) }
  })
  const counts = Object.fromEntries(STEP_STATES.map(state => [state, steps.filter(view => view.state === state).length])) as Record<StepState, number>
  return { flow, state: flowStateOf(flow, steps), steps, ...(entry === undefined ? {} : { entry }), unreachable, counts, spec: walkSpecFromIndex(index, flow) }
}

/** The role's state: its live flows folded (§2.5). */
function roleStateOf(flows: readonly FlowView[]): FlowState {
  const states = flows.map(flow => flow.state)
  if (states.length === 0) return 'empty'
  if (states.includes('failed')) return 'failed'
  if (states.every(state => state === 'walked')) return 'walked'
  return FLOW_FOLD.find(state => states.includes(state)) ?? 'built'
}

/** The reason after a `<label>：无，<reason>` line of a body, or undefined when the body has no such line or the reason is empty. */
function noneReason(node: GraphNode, label: string): string | undefined {
  const line = (labeledSections(node.body, [label]).get(label) ?? '').split('\n')[0].trim()
  const match = /^无[，,]\s*(\S.*)$/u.exec(line)
  return match === null ? undefined : match[1].trim()
}

/** A module or a module candidate (§2.6 「模块是例外」): a direct feature child of a goal, the unit a person releases. */
function isModule(index: Index, node: GraphNode): boolean {
  return node.type === 'feature' && moduleOf(index.graph, node)?.id === node.id
}

/** The modules and candidates of a goal. */
function modulesAndCandidates(graph: LoadedGraph, goal: GraphNode): GraphNode[] {
  return [...modulesOf(graph, goal), ...moduleCandidatesOf(graph, goal)]
}

/** The ancestors of a node below the goal, parent first. */
function ancestorsBelow(index: Index, node: GraphNode, goal: GraphNode): GraphNode[] {
  const chain = ancestorsOf(index.graph, node)
  const at = chain.findIndex(entry => entry.id === goal.id)
  return at === -1 ? chain : chain.slice(0, at)
}

/**
 * The orphans of a goal (§2.6 work:orphan, review 5 finding 5): live work
 * under the goal that nobody uses, by the design's four rules in order. Used
 * means: its own serves reach a live step (1); a descendant's do, or a used
 * work depends on it, to a fixed point (2); it has no serves of its own and
 * an ancestor below the goal has serves to a live step (4). Not used and
 * carrying serves of its own is an orphan without looking at the ancestors
 * (3). A module that declared 服务：无, and work without serves of its own
 * below such a module, are no orphans.
 */
function orphansOf(index: Index, goal: GraphNode): GraphNode[] {
  const works = subtreeOf(index.children, goal).slice(1).filter(node => isWork(node) && liveOf(index.graph, node))
  const ownServes = (node: GraphNode): boolean => (node.edges ?? []).some(edge => edge.type === 'serves')
  const used = new Set(works.filter(work =>
    servesLive(index, work)
    || workBelow(index, work).some(node => servesLive(index, node))
    || (!ownServes(work) && ancestorsBelow(index, work, goal).some(node => servesLive(index, node)))).map(work => work.id))
  for (let grew = true; grew;) {
    grew = false
    for (const work of works) {
      if (used.has(work.id) || !(index.dependedBy.get(work.id) ?? []).some(id => used.has(id))) continue
      used.add(work.id)
      grew = true
    }
  }
  const declared = (node: GraphNode): boolean => isModule(index, node) && noneReason(node, '服务') !== undefined
  return works.filter(work => !used.has(work.id)
    && !declared(work)
    && !(!ownServes(work) && ancestorsBelow(index, work, goal).some(declared)))
}

const NEVER_SERVED_HINT = 'connect it to the step it builds with graph_link type serves, make a work that serves a step depend on it, or drop it if it is not needed'
const STEPS_DROPPED_HINT = 'this work only serves steps that were dropped: graph_unlink those serves and graph_link it to the step that replaced them, or drop it if it is not needed (a done work cannot be dropped: its serves links can still be changed)'

/** The gaps of one flow and its steps (§2.6), in display order. */
function flowGaps(index: Index, view: FlowView, add: (gap: Gap) => void): void {
  const { flow, steps } = view
  if (steps.length === 0) {
    add({ key: 'flow:empty', nodes: [flow.id], text: `「${flow.title}」还没有步骤`, hint: `propose the steps of ${flow.id} under it, and link its first step with graph_link type next from ${flow.id}` })
  }
  else {
    const entries = nextSteps(index, flow)
    if (entries.length !== 1) {
      add({
        key: 'flow:entry',
        nodes: [flow.id],
        text: `「${flow.title}」找不到起点（或有两个起点）`,
        hint: entries.length === 0
          ? `the flow's own next edge is its entry: graph_relink ${flow.id} to its first step`
          : `the flow's own next edge is its entry and there is one: graph_relink ${flow.id} to its first step only`,
      })
    }
    else {
      for (const step of view.unreachable) {
        add({ key: 'flow:unreachable', nodes: [step.id], text: `「${step.title}」从起点走不到`, hint: `graph_relink the step before ${step.id} so that one of its next edges leads to it` })
      }
    }
  }
  steps.forEach((entry, position) => {
    const { step } = entry
    if (entry.servers.length === 0) {
      add({ key: 'step:unserved', nodes: [step.id], text: `「${flow.title}」的第 ${position + 1} 步「${step.title}」没人负责`, hint: `connect ${step.id} to the module or task that builds it, with graph_link type serves` })
    }
    if ((step.acceptance ?? []).length === 0) {
      add({ key: 'step:no-expect', nodes: [step.id], text: `「${step.title}」没写怎样算做成`, hint: `set acceptance on ${step.id}: what the person sees when this step is done` })
    }
    if (entry.state === 'failed' && entry.lastWalk !== undefined) {
      add({ key: 'step:failed', nodes: [step.id], text: `「${step.title}」上次走不通：${walkResult(entry.lastWalk.note)}`, hint: `fix what the walk found, then walk the flows again with dispatch_task on the goal; the step that did not pass: ${step.id}` })
    }
    const out = nextEdges(step).filter(edge => liveStep(index, edge.to) !== undefined)
    const whens = out.map(edge => edge.when?.trim() ?? '')
    if (out.length > 1 && (whens.includes('') || new Set(whens).size !== whens.length)) {
      add({ key: 'step:branch', nodes: [step.id], text: `「${step.title}」后面分了几路，有的没写条件`, hint: `every branch of ${step.id} carries its own when: graph_relink writes them in one go` })
    }
    for (const edge of nextEdges(step)) {
      const target = index.graph.nodes.get(edge.to)
      if (target === undefined || liveOf(index.graph, target)) continue
      add({
        key: 'step:next-dropped',
        nodes: [step.id],
        text: `「${step.title}」后面接的那一步已经不要了`,
        hint: `step ${step.id} still points at ${edge.to}, which was dropped or replaced: graph_relink it to the step that replaced it, or to nothing when it is now the last step`,
      })
    }
    if (out.length > USER_LIMITS.branches) {
      add({ key: 'step:too-many-branches', nodes: [step.id], text: `「${step.title}」后面分了 ${out.length} 路，建议拆开`, hint: `split ${step.id} into smaller steps` })
    }
  })
  if ('unparsed' in view.spec) {
    add({
      key: 'flow:no-walk',
      nodes: [flow.id],
      text: `「${flow.title}」没写怎么走一遍，或合入前检查清单里没有对应的命令`,
      hint: `${view.spec.unparsed}: write "走法：<命令|截图|终端> · 预计 <N> 秒" or "走法：你来走" in the body of ${flow.id}, and for the automatic kinds a line walk <kind> $ <command with {flow}> in the acceptance of ${MERGE_GATE_ID}`,
    })
  }
  else if (view.spec.kind !== '你来走' && steps.length > 0) {
    const tasked = steps.every(entry => entry.leaves.some(leaf => leaf.type === 'task'))
    const tested = steps.some(entry => entry.leaves.some(leaf => leaf.type === 'task' && leaf.kind === 'test'))
    if (tasked && !tested) {
      add({
        key: 'flow:no-test',
        nodes: [flow.id],
        text: `「${flow.title}」每一步都拆成了任务，还没有人写走一遍要跑的测试`,
        hint: `a task of kind test writes the end-to-end test the walk of ${flow.id} runs: put it in the module that owns these steps, or link it with serves to the steps it covers (inside the serving module, a linked test task becomes the step's only leaf, so link it there only to a step that already has task-level serves)`,
      })
    }
  }
  if (steps.length > USER_LIMITS.flowSteps) {
    add({ key: 'flow:too-long', nodes: [flow.id], text: `「${flow.title}」有 ${steps.length} 步，建议拆开`, hint: `split ${flow.id} into smaller flows` })
  }
}

/** The gaps of one goal's user graph (§2.6), in the table's key order; only live nodes count. */
function gapsOf(index: Index, goal: GraphNode, roles: readonly RoleView[]): readonly Gap[] {
  const gaps: Gap[] = []
  const add = (gap: Gap): void => {
    gaps.push(gap)
  }
  for (const { role, flows } of roles) {
    if (flows.length === 0) add({ key: 'role:no-flow', nodes: [role.id], text: `「${role.title}」还没有流程`, hint: `draw the flows of ${role.id} with graph_propose (type flow, parent ${role.id})` })
    for (const flow of flows) flowGaps(index, flow, add)
  }
  const orphans = orphansOf(index, goal)
  const orphanIds = new Set(orphans.map(node => node.id))
  for (const orphan of orphans) {
    // An orphan under an orphan feature is not listed on its own: the topmost stands for it.
    if (orphan.parent !== undefined && orphanIds.has(orphan.parent)) continue
    const dropped = (orphan.edges ?? []).some(edge => edge.type === 'serves')
    add({
      key: 'work:orphan',
      nodes: [orphan.id],
      text: dropped ? `「${orphan.title}」服务的步骤都不要了` : `「${orphan.title}」不服务任何步骤`,
      hint: dropped ? STEPS_DROPPED_HINT : NEVER_SERVED_HINT,
      reason: dropped ? 'steps-dropped' : 'never-served',
    })
  }
  return GAP_KEYS.flatMap(key => gaps.filter(gap => gap.key === key))
}

function readUserGraph(graph: LoadedGraph, goal: GraphNode): { readonly ug: UserGraph, readonly index: Index } {
  const index = buildIndex(graph)
  const roles = liveChildren(index, goal, 'role').map((role): RoleView => {
    const flows = liveChildren(index, role, 'flow').map(flow => flowViewOf(index, flow))
    return { role, state: roleStateOf(flows), flows }
  })
  return { ug: { goal, roles, gaps: gapsOf(index, goal, roles), present: roles.length > 0, graph }, index }
}

/** The user graph of one goal (§3.6 userGraphOf): its live roles, each with its live flows in display order, and the goal's gaps. */
export function userGraphOf(graph: LoadedGraph, goal: GraphNode): UserGraph {
  return readUserGraph(graph, goal).ug
}

/**
 * The requirement card's item 用户怎么用 (§5.1): a live role under the goal
 * with a live flow under it and a live step under that; or, while the goal
 * has no live role, a line 用户流程：无，<reason> in its body. A live role
 * makes that line void, so a role without a flow with a step is missing
 * however the body reads.
 */
export function userFlowsAnswered(graph: LoadedGraph, goal: GraphNode): boolean {
  const index = buildIndex(graph)
  const roles = liveChildren(index, goal, 'role')
  if (roles.length === 0) return noneReason(goal, '用户流程') !== undefined
  return roles.some(role => liveChildren(index, role, 'flow').some(flow => liveChildren(index, flow, 'step').length > 0))
}

/** The live steps one feature or task serves by its own serves edges (§3.6 stepsServedBy): what a brief names as the work's steps. */
export function stepsServedBy(graph: LoadedGraph, work: GraphNode): readonly GraphNode[] {
  return (work.edges ?? []).filter(edge => edge.type === 'serves').flatMap((edge) => {
    const step = graph.nodes.get(edge.to)
    return step !== undefined && step.type === 'step' && liveOf(graph, step) ? [step] : []
  })
}

/** The timeout cap of a flow before the harness has measured it: three times the estimate, within the bounds (§2.7); the release page and the panel's flow lines state it. */
export function estimatedTimeoutMs(seconds: number): number {
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, seconds * 3 * 1000))
}

/**
 * Steps as one line (§5.1, §5.3): `n 标题〔怎样算做成〕`, numbered in the
 * order given; the next edges between the given steps follow, `→ m`, or
 * `→（条件）m；（条件）k` for branches. A single unconditional edge to the
 * step listed next runs on into it; otherwise a full stop starts the next.
 */
function stepsLine(steps: readonly GraphNode[]): string {
  const numbers = new Map(steps.map((step, position) => [step.id, position + 1]))
  let line = ''
  steps.forEach((step, position) => {
    const number = position + 1
    const expect = (step.acceptance ?? []).length > 0 ? `〔${step.acceptance!.join('；')}〕` : ''
    line += `${number} ${step.title}${expect}`
    const out = nextEdges(step)
      .flatMap(edge => numbers.has(edge.to) ? [{ to: numbers.get(edge.to)!, when: edge.when }] : [])
      .sort((a, b) => a.to - b.to)
    if (out.length === 1 && out[0].when === undefined && out[0].to === number + 1) {
      line += '→ '
      return
    }
    if (out.length > 0) line += `→${out.map(edge => edge.when === undefined ? ` ${edge.to}` : `（${edge.when}）${edge.to}`).join('；')}`
    if (position < steps.length - 1) line += '。'
  })
  return line
}

/** The confirm sample (§5.1): roles, their flows, each flow's steps with conditions and what each step looks like done. */
function confirmPage(ug: UserGraph): string {
  const lines = ['用户怎么用']
  for (const { role, flows } of ug.roles) {
    lines.push(role.title)
    for (const { flow, steps } of flows) lines.push(` ${flow.title}：${stepsLine(steps.map(view => view.step))}`)
  }
  return lines.join('\n')
}

/** Who owns one server on a release page (§3.6): its nearest feature ancestor; a server without one names itself. */
function ownerOf(graph: LoadedGraph, server: GraphNode): GraphNode {
  return ancestorsOf(graph, server).find(node => node.type === 'feature') ?? server
}

/**
 * The titles of the owners of some servers, each once, by the owner's
 * creation time, then id. Not in the order the servers are read (their file
 * names): a task added under an owner, its id sorting first, would reorder
 * an unchanged ownership and void an agreement to it (§1.4 item 29).
 */
function ownerTitles(graph: LoadedGraph, servers: readonly GraphNode[]): string[] {
  const owners = new Map(servers.map(server => ownerOf(graph, server)).map(owner => [owner.id, owner]))
  return [...owners.values()].sort(byCreation).map(owner => owner.title)
}

/** The big-loop release page's first section (§5.2): the owners of each flow, and the modules that declared they serve no step. */
function ownersPage(ug: UserGraph): string {
  const lines = ['每条流程由谁负责']
  for (const { role, flows } of ug.roles) {
    for (const { flow, steps } of flows) {
      const owners = ownerTitles(ug.graph, steps.flatMap(view => view.servers))
      lines.push(` ${role.title} › ${flow.title}：${owners.length === 0 ? '还没人负责' : owners.join('、')}`)
    }
  }
  const declared = modulesAndCandidates(ug.graph, ug.goal).flatMap((module) => {
    const reason = noneReason(module, '服务')
    return reason === undefined ? [] : [`${module.title}（正文写明的原因：${reason}）`]
  })
  if (declared.length > 0) lines.push(`不服务任何步骤的模块：${declared.join('；')}`)
  return lines.join('\n')
}

/** The module release page (§5.3): the steps the module or its work serves, by flow, and as of the showing their states, the other modules on them, its orphans. */
function modulePage(ug: UserGraph, module: GraphNode): UserPage {
  const inModule = (node: GraphNode): boolean => node.id === module.id || ancestorsOf(ug.graph, node).some(entry => entry.id === module.id)
  const stable = ['这个模块服务哪几步']
  const served: StepView[] = []
  for (const { flows } of ug.roles) {
    for (const { flow, steps } of flows) {
      const own = steps.filter(view => view.servers.some(inModule))
      if (own.length === 0) continue
      served.push(...own)
      stable.push(` ${flow.title}：${stepsLine(own.map(view => view.step))}`)
    }
  }
  const reason = noneReason(module, '服务')
  if (reason !== undefined) stable.push(` 不服务任何步骤（正文写明的原因：${reason}）`)
  else if (served.length === 0) stable.push(' 还没有连到任何一步')
  const words = served.map(view => view.outdated ? OUTDATED_LABEL : USER_STATE_LABELS[view.state])
  const states = new Set(words).size === 1
    ? `这 ${served.length} 步现在都是「${words[0]}」`
    : `这 ${served.length} 步现在：${served.map((view, position) => `「${view.step.title}」${words[position]}`).join('、')}`
  const others = ownerTitles(ug.graph, served.flatMap(view => view.servers.filter(entry => !inModule(entry))))
  const elsewhere = others.length === 0 ? '这些步骤没有别的模块在做' : `这些步骤还有别的模块也在做：${others.join('、')}`
  const orphans = ug.gaps.filter(gap => gap.key === 'work:orphan' && gap.nodes.some(id => {
    const node = ug.graph.nodes.get(id)
    return node !== undefined && node.type === 'task' && inModule(node)
  })).length
  const state = served.length === 0
    ? `${STATE_HEADING}\n 模块里不服务任何步骤的任务：${orphans} 个`
    : `${STATE_HEADING}\n ${states}；${elsewhere}；模块里不服务任何步骤的任务：${orphans} 个`
  return { stable: stable.join('\n'), state }
}

/** The release page's walk sections (§5.2): each flow's kind, command and estimate, the timeout rule; as of the showing, the current caps. */
function walksPage(ug: UserGraph): UserPage {
  const stable = ['每条流程怎么走一遍（命令来自合入前检查清单，放行之后执行的就是这些）']
  const caps: string[] = []
  for (const { role, flows } of ug.roles) {
    for (const { flow, spec } of flows) {
      const name = ` ${role.title} › ${flow.title}：`
      if ('unparsed' in spec) stable.push(`${name}还没写好怎么走一遍（${spec.unparsed}）`)
      else if (spec.kind === '你来走') stable.push(`${name}${BY_PERSON}`)
      else {
        stable.push(`${name}${spec.kind} · ${spec.command} · 预计 ${spec.seconds} 秒`)
        caps.push(`${flow.title} ${estimatedTimeoutMs(spec.seconds) / 1000} 秒`)
      }
    }
  }
  stable.push(TIMEOUT_TEXT)
  const state = caps.length === 0 ? `${STATE_HEADING}\n 没有要自动走一遍的流程` : `${STATE_HEADING}\n 超时上限：${caps.join('、')}，都是预计的 3 倍，还没有跑过`
  return { stable: stable.join('\n'), state }
}

/**
 * The user page a confirm or release appends (§3.6 renderUserGraph):
 * confirm, the sample of roles, flows and steps (no state); serves, the
 * owners of each flow on the big-loop page, or with `module` the steps that
 * module serves and their state; walks, the commands and the timeout caps.
 * A goal without a user graph has only the confirm line that it has no end
 * user, when its body says so with a reason; every other page is empty.
 */
export function renderUserGraph(ug: UserGraph, level: 'confirm' | 'serves' | 'walks', module?: GraphNode): UserPage {
  if (!ug.present) {
    const reason = level === 'confirm' ? noneReason(ug.goal, '用户流程') : undefined
    return { stable: reason === undefined ? '' : `这个目标没有终端用户：${reason}`, state: '' }
  }
  if (level === 'confirm') return { stable: confirmPage(ug), state: '' }
  if (level === 'walks') return walksPage(ug)
  return module === undefined ? { stable: ownersPage(ug), state: '' } : modulePage(ug, module)
}

/**
 * The user page a release appends (§5.2, §5.3): for the goal, who owns each
 * flow and how each flow is walked (stable) and the timeout caps (state);
 * with `module`, the steps that module serves and, as of the showing, their
 * state. Both parts are empty for a goal without a user graph.
 */
export function releaseUserPage(ug: UserGraph, module?: GraphNode): UserPage {
  if (module !== undefined) return renderUserGraph(ug, 'serves', module)
  const walks = renderUserGraph(ug, 'walks')
  return { stable: [renderUserGraph(ug, 'serves').stable, walks.stable].filter(text => text.length > 0).join('\n'), state: walks.state }
}

/** A module serves a live step by its own serves edges or by those of the work below it, or its body says why it serves none (§5.2 flows:modules, §5.3 module:serves). */
function moduleServes(index: Index, module: GraphNode): boolean {
  return servesLive(index, module) || workBelow(index, module).some(node => servesLive(index, node)) || noneReason(module, '服务') !== undefined
}

const MODULE_SERVES_HINT = 'connect the module or its tasks to a step with serves, or add a line "服务：无，<reason>" to'

/**
 * The release gate's user items (§5.2, §5.3), for a present goal. Without
 * `module`, the release of the goal: shape, what each step looks like done,
 * who serves each step, the walk of each flow, the size of the appended page;
 * and, for a goal split into modules, that each module serves a step or says
 * why not. With `module`, the release of that module: it serves a step or
 * says why not (module:serves).
 */
export function userReleaseItems(graph: LoadedGraph, goal: GraphNode, module?: GraphNode): readonly GateItem[] {
  const { ug, index } = readUserGraph(graph, goal)
  if (!ug.present) return []
  if (module !== undefined) {
    return [{ key: 'module:serves', label: '这个模块服务至少一步，或写明为什么不服务', ok: moduleServes(index, module), hint: `${MODULE_SERVES_HINT} the module body` }]
  }
  const first = (keys: readonly GapKey[]): Gap | undefined => ug.gaps.find(gap => keys.includes(gap.key))
  const shape = first(SHAPE_KEYS)
  const expect = first(['step:no-expect'])
  const served = first(['step:unserved'])
  const walk = first(['flow:no-walk'])
  const walks = renderUserGraph(ug, 'walks')
  const size = [renderUserGraph(ug, 'serves').stable, walks.stable, walks.state].reduce((sum, text) => sum + [...text].length, 0)
  const modules = isSplit(graph, goal) ? [modulesAndCandidates(graph, goal).filter(entry => !moduleServes(index, entry))] : []
  return [
    {
      key: 'flows:shape',
      label: '用户流程的形状（每个角色有流程，每条流程有步骤和一个入口，分支写了条件，没有指向已不要的步骤的连线）',
      ok: shape === undefined,
      hint: shape === undefined ? 'every role has flows, every flow has steps and one entry, branches carry conditions' : `fix the shape gaps first: ${shape.hint}`,
    },
    {
      key: 'flows:expect',
      label: '每一步写了怎样算做成',
      ok: expect === undefined,
      hint: expect === undefined ? 'every step says what the person sees when it is done' : `set acceptance on ${expect.nodes[0]}: what the person sees when this step is done`,
    },
    {
      key: 'flows:served',
      label: '每一步都有人负责',
      ok: served === undefined,
      hint: served === undefined ? 'every step has a module, feature or task that serves it' : `connect ${served.nodes[0]} to the module or task that builds it, with graph_link type serves`,
    },
    ...modules.map(unserving => ({
      key: 'flows:modules',
      label: '每个模块至少服务一步，或写明为什么不服务',
      ok: unserving.length === 0,
      hint: `${MODULE_SERVES_HINT} its body${unserving.length === 0 ? '' : ` (${unserving.map(entry => entry.id).join(', ')})`}`,
    })),
    {
      key: 'flows:walk',
      label: '每条流程写了怎么走一遍，合入前检查清单里有对应的命令',
      ok: walk === undefined,
      hint: `write "走法：<命令|截图|终端> · 预计 <N> 秒" in the flow body, and add a line walk <kind> $ <command with {flow}> to ${MERGE_GATE_ID}${walk === undefined ? '' : ` (${walk.nodes[0]})`}`,
    },
    {
      key: 'flows:page',
      label: `放行页里的用户图部分放得下一页（合计不超过 ${USER_LIMITS.appended.toLocaleString('en-US')} 字）`,
      ok: size <= USER_LIMITS.appended,
      hint: 'the user graph is too big for one release page: split the goal, or shorten flow and step titles',
    },
  ]
}

/**
 * The completion gate's user items (§5.5), for a present goal: every live
 * approved step walked, and the last passing walk of each covered by the
 * reviewed trunk commit (`covers`, git, is the caller's).
 */
export function userCompletionItems(graph: LoadedGraph, goal: GraphNode, covers: (commit: string) => boolean): readonly GateItem[] {
  const ug = userGraphOf(graph, goal)
  if (!ug.present) return []
  const notWalked: string[] = []
  const stale: string[] = []
  for (const { flows } of ug.roles) {
    for (const { steps } of flows) {
      for (const view of steps) {
        if (view.step.status !== 'approved') continue
        const commit = view.lastWalk?.commit
        if (view.state !== 'walked') notWalked.push(view.step.id)
        else if (commit === undefined || !covers(commit)) stale.push(view.step.id)
      }
    }
  }
  return [
    {
      key: 'flows:walked',
      label: '每一步都走通了',
      ok: notWalked.length === 0,
      hint: `walk the flows again with dispatch_task on the goal; steps that are not walked: ${notWalked.length === 0 ? 'none' : notWalked.join(', ')}`,
    },
    {
      key: 'flows:fresh',
      label: '走一遍的结果对得上现在的代码',
      ok: stale.length === 0,
      hint: 'the code changed after these steps were walked: walk them again',
    },
  ]
}
