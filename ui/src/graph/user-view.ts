/**
 * The view model of 用户怎么用 (user graph design 0.4.1 §6.1 to §6.5): pure
 * functions from the graph, the goal, the selected node and the container
 * width to the overview band, the user view's role, flow and step rows, the
 * development view's feature and task rows, and what the selection lights
 * up on the other side. No DOM and no DSH service: UserView.tsx only renders
 * it, and the specs run it under Node. States, gaps and servers all come
 * from userGraphOf (src/graph/user-graph.ts); the 不服务任何步骤 marks come
 * only from its work:orphan gaps, never from a judgement of this file.
 */
import { OUTDATED_LABEL, USER_STATE_LABELS } from '../../../src/graph/labels.ts'
import { byCreation } from '../../../src/graph/modules.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { childrenIndex, subtreeOf } from '../../../src/graph/projection.ts'
import type { GraphNode } from '../../../src/graph/schema.ts'
import { goalOf } from '../../../src/graph/stage.ts'
import {
  estimatedTimeoutMs, renderUserGraph, stepsServedBy, userGraphOf, walkResult,
  type FlowState, type FlowView, type StepView, type UserGraph, type WalkRecord,
} from '../../../src/graph/user-graph.ts'
import { liveOf } from '../../../src/graph/user-live.ts'
import { statusText } from './model.ts'

/** From this container width the two views stand side by side (§6.2); below it one column with a switch. */
const SPLIT_WIDTH = 760

/** How many gaps the overview band names (§6.2). */
const BAND_GAPS = 3

/** The order the progress line counts flow states in (§6.1): what passed and what failed first, what is not started last. */
const PROGRESS_ORDER: readonly FlowState[] = ['walked', 'failed', 'built', 'building', 'unserved', 'planned', 'proposed', 'empty']

/** The progress line's words: §6.5's, with 做完了 for built whether or not it has to be walked again. */
const PROGRESS_WORDS: Readonly<Record<FlowState, string>> = { ...USER_STATE_LABELS, built: '做完了' }

/** How a walk was made, as the flow's walk line says it. */
const VIA_WORDS: Readonly<Record<WalkRecord['via'], string>> = {
  command: '命令',
  screenshot: '截图',
  transcript: '终端',
  person: '你走的',
}

const NO_FLOWS = '还没画流程，主 Agent 会在对话里和你一起画'
const UNREADABLE = '读不出用户图：'

/** How a row stands to the selection: the selected one, one linked to it, one on the other side the selection fades, or none. */
export type Mark = 'selected' | 'linked' | 'faded' | 'plain'

export interface StepRow {
  readonly id: string
  /** The step's number in the flow's display order (§2.3). */
  readonly number: number
  readonly title: string
  readonly state: string
  /** 服务者 n: the step's live servers. */
  readonly servers: number
  /** Branches and loops: 条件 › 到第 n 步, 回到第 n 步; absent for one plain edge on to the next step. */
  readonly next?: string
  /** The step still points at a step that is no longer wanted (the gap step:next-dropped). */
  readonly nextDropped: boolean
  /** The flow's entry does not reach it (§2.3: listed last, marked). */
  readonly unreachable: boolean
  readonly mark: Mark
}

export interface FlowRow {
  readonly id: string
  readonly title: string
  readonly state: string
  /** How many live steps the flow has. */
  readonly steps: number
  /** The flow's last walk: when, and how it went (which step did not pass and why). */
  readonly walk?: { readonly at: string, readonly text: string }
  /** How the flow is walked: kind, estimate, current timeout cap and where the cap comes from. */
  readonly spec: string
  readonly rows: readonly StepRow[]
  /** The selection lies in this flow: it shows its steps whatever the person folded. */
  readonly open: boolean
  readonly mark: Mark
}

export interface RoleRow {
  readonly id: string
  readonly title: string
  readonly state: string
  readonly flows: readonly FlowRow[]
  readonly mark: Mark
}

export interface DevRow {
  readonly id: string
  readonly title: string
  /** 0 for a direct child of the goal. */
  readonly depth: number
  readonly status: string
  /** 服务 n 步: the live steps the node or its descendants serve. */
  readonly serves: number
  /** The work:orphan mark, in the gap's words. */
  readonly orphan?: string
  readonly mark: Mark
}

interface BandGap {
  readonly text: string
  /** The node the gap names first: clicking the gap selects it. */
  readonly node: string
}

export type UserView =
  | { readonly kind: 'none', readonly text: string }
  | { readonly kind: 'failed', readonly text: string, readonly dev: readonly DevRow[] }
  | {
    readonly kind: 'ready'
    readonly layout: 'split' | 'single'
    readonly progress: string
    readonly gaps: readonly BandGap[]
    /** Gaps beyond the band's three. */
    readonly more: number
    readonly roles: readonly RoleRow[]
    readonly dev: readonly DevRow[]
    /** The first flow that needs attention (§6.2 先看到什么): the page scrolls to it. */
    readonly focus?: string
    /** Where the selection is, when there is one. */
    readonly side?: 'user' | 'dev'
    /** How many rows on the other side the selection lights up. */
    readonly linked: number
  }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error'
}

function flowsOf(ug: UserGraph): FlowView[] {
  return ug.roles.flatMap(role => role.flows)
}

/** 「6 条流程：1 走通 · 1 走不通 · 2 做完了 · 1 没人负责 · 1 排上了」 (§6.1); a goal with roles and no flow says so (§6.4). */
function progressText(ug: UserGraph): string {
  const flows = flowsOf(ug)
  if (flows.length === 0) return NO_FLOWS
  const parts = PROGRESS_ORDER.flatMap((state) => {
    const count = flows.filter(flow => flow.state === state).length
    return count === 0 ? [] : [`${count} ${PROGRESS_WORDS[state]}`]
  })
  return `${flows.length} 条流程：${parts.join(' · ')}`
}

/**
 * The first line of a goal on the home page (§6.1): its flow progress when
 * the goal has a user graph, null when it has none (the home stays as it
 * was), and what went wrong when the user graph cannot be read.
 */
export function homeFlowLine(graph: LoadedGraph, goal: GraphNode): string | null {
  try {
    const ug = userGraphOf(graph, goal)
    return ug.present ? progressText(ug) : null
  }
  catch (error) {
    return `${UNREADABLE}${messageOf(error)}`
  }
}

/**
 * Whether a goal's node pages and the footer lead to 用户怎么用 (§6.1,
 * §6.4): the goal has a user graph, or its body says why it has no end
 * user (the page then says that), or its user graph cannot be read (the
 * page says why). A goal with neither shows no entry.
 */
export function hasUserPage(graph: LoadedGraph, goal: GraphNode): boolean {
  try {
    const ug = userGraphOf(graph, goal)
    return ug.present || renderUserGraph(ug, 'confirm').stable.length > 0
  }
  catch {
    return true
  }
}

/** The servers of a step, as its node page says 谁在做它; none for a step that is not live or not under a goal. */
export function whoBuilds(graph: LoadedGraph, step: GraphNode): readonly GraphNode[] {
  const goal = goalOf(graph, step.id)
  if (goal === undefined) return []
  for (const flow of flowsOf(userGraphOf(graph, goal))) {
    const view = flow.steps.find(entry => entry.step.id === step.id)
    if (view !== undefined) return view.servers
  }
  return []
}

function stepStateText(view: StepView): string {
  return view.outdated ? OUTDATED_LABEL : USER_STATE_LABELS[view.state]
}

function flowStateText(flow: FlowView): string {
  const stale = flow.state === 'built' && flow.steps.some(view => view.step.status === 'approved' && view.outdated)
  return stale ? OUTDATED_LABEL : USER_STATE_LABELS[flow.state]
}

/** The flow's last walk (§6.2): the latest walk its steps carry, how many of the steps it reached passed, and each that did not with why. */
function walkLine(flow: FlowView): FlowRow['walk'] {
  const walks = flow.steps.flatMap(view => view.lastWalk === undefined ? [] : [{ title: view.step.title, walk: view.lastWalk }])
  if (walks.length === 0) return undefined
  const latest = Math.max(...walks.map(entry => Date.parse(entry.walk.at)))
  const last = walks.filter(entry => Date.parse(entry.walk.at) === latest)
  const failed = last.filter(entry => !entry.walk.ok)
  const head = `${VIA_WORDS[last[0].walk.via]} · ${last.length - failed.length}/${last.length} 通过`
  return { at: last[0].walk.at, text: [head, ...failed.map(entry => `「${entry.title}」走不通：${walkResult(entry.walk.note)}`)].join(' · ') }
}

/** How the flow is walked (§6.2): the timeout cap is the estimate's until the harness has measured it (U5b). */
function specText(flow: FlowView): string {
  const { spec } = flow
  if ('unparsed' in spec) return `还没写好怎么走一遍（${spec.unparsed}）`
  if (spec.kind === '你来走') return '走法：你来走（没法自动测，做完时请你亲自走一遍）'
  return `走法：${spec.kind} · 预计 ${spec.seconds} 秒 · 超时上限 ${estimatedTimeoutMs(spec.seconds) / 1000} 秒（预计的 3 倍，还没有跑过）`
}

/** The rank of the flows that need no attention first, and of a gap in no flow (a role without flows, an orphan work). */
const FLOWLESS_RANK = 3

/** A flow's place in 先看到什么 (§6.2): 走不通, 没人负责, 做完了要重走, then the rest. */
function attentionOf(flow: FlowView): number {
  if (flow.state === 'failed') return 0
  if (flow.state === 'unserved') return 1
  if (flowStateText(flow) === OUTDATED_LABEL) return 2
  return FLOWLESS_RANK
}

/** The ids of the live steps a node and its live descendants serve with their own serves edges (服务 n 步). */
function servedSteps(graph: LoadedGraph, index: ReadonlyMap<string, readonly GraphNode[]>, node: GraphNode): ReadonlySet<string> {
  const steps = subtreeOf(index, node).filter(entry => liveOf(graph, entry)).flatMap(entry => stepsServedBy(graph, entry))
  return new Set(steps.map(step => step.id))
}

/** The development view (§6.2): the goal's live features and tasks as a tree, siblings by creation time (the module list's order). */
function devRows(graph: LoadedGraph, goal: GraphNode, orphans: ReadonlyMap<string, string>, mark: (id: string) => Mark): DevRow[] {
  const index = childrenIndex(graph)
  const rows: DevRow[] = []
  const seen = new Set([goal.id])
  const visit = (node: GraphNode, depth: number): void => {
    const children = (index.get(node.id) ?? []).filter(child => (child.type === 'feature' || child.type === 'task') && liveOf(graph, child))
    for (const child of [...children].sort(byCreation)) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      const orphan = orphans.get(child.id)
      rows.push({
        id: child.id,
        title: child.title,
        depth,
        status: statusText(child, graph),
        serves: servedSteps(graph, index, child).size,
        ...(orphan === undefined ? {} : { orphan }),
        mark: mark(child.id),
      })
      visit(child, depth + 1)
    }
  }
  visit(goal, 0)
  return rows
}

/** What a selection lights up on the other side, and which side it is on; undefined when the node is in neither view. */
function linkedOf(graph: LoadedGraph, ug: UserGraph, selected: GraphNode): { readonly side: 'user' | 'dev', readonly ids: ReadonlySet<string> } | undefined {
  const roles = ug.roles.filter(role => role.role.id === selected.id)
  const flows = [...roles.flatMap(role => role.flows), ...flowsOf(ug).filter(flow => flow.flow.id === selected.id)]
  const steps = [...flows.flatMap(flow => flow.steps), ...flowsOf(ug).flatMap(flow => flow.steps).filter(view => view.step.id === selected.id)]
  if (roles.length + flows.length + steps.length > 0) {
    return { side: 'user', ids: new Set(steps.flatMap(view => [...view.servers, ...view.leaves].map(node => node.id))) }
  }
  if ((selected.type !== 'feature' && selected.type !== 'task') || !liveOf(graph, selected) || goalOf(graph, selected.id)?.id !== ug.goal.id) return undefined
  const served = servedSteps(graph, childrenIndex(graph), selected)
  const leafOf = flowsOf(ug).flatMap(flow => flow.steps).filter(view => view.leaves.some(leaf => leaf.id === selected.id)).map(view => view.step.id)
  return { side: 'dev', ids: new Set([...served, ...leafOf]) }
}

/**
 * 用户怎么用 for one goal (§6.2 to §6.4). `selected` is the node the person
 * picked on either side; `width` the page's container width. A goal without
 * a user graph has only its line (the confirm page's one line of no end
 * user, when the body gives a reason); a user graph that cannot be read says
 * why and keeps the development view.
 */
export function userViewOf(graph: LoadedGraph, goalId: string, selected: string | undefined, width: number): UserView {
  const goal = graph.nodes.get(goalId)
  if (goal === undefined || goal.type !== 'goal') return { kind: 'none', text: '这个目标已经不在图里了' }
  let ug: UserGraph
  try {
    ug = userGraphOf(graph, goal)
  }
  catch (error) {
    return { kind: 'failed', text: `${UNREADABLE}${messageOf(error)}`, dev: devRows(graph, goal, new Map(), () => 'plain') }
  }
  if (!ug.present) {
    const line = renderUserGraph(ug, 'confirm').stable
    return { kind: 'none', text: line.length > 0 ? line : '这个目标还没有用户图' }
  }
  const picked = selected === undefined ? undefined : graph.nodes.get(selected)
  const linked = picked === undefined ? undefined : linkedOf(graph, ug, picked)
  const markOn = (side: 'user' | 'dev') => (id: string): Mark => {
    if (linked === undefined) return 'plain'
    if (id === selected) return 'selected'
    if (linked.ids.has(id)) return 'linked'
    return linked.side === side ? 'plain' : 'faded'
  }
  const userMark = markOn('user')
  const nextDropped = new Set(ug.gaps.filter(gap => gap.key === 'step:next-dropped').flatMap(gap => gap.nodes))
  const flowRow = (flow: FlowView): FlowRow => {
    const numbers = new Map(flow.steps.map((view, position) => [view.step.id, position + 1]))
    const unreachable = new Set(flow.unreachable.map(step => step.id))
    const rows = flow.steps.map((view, position): StepRow => {
      const number = position + 1
      const out = (view.step.edges ?? [])
        .flatMap(edge => edge.type === 'next' && numbers.has(edge.to) ? [{ to: numbers.get(edge.to) ?? 0, when: edge.when }] : [])
        .sort((a, b) => a.to - b.to)
      const plain = out.length === 0 || (out.length === 1 && out[0].when === undefined && out[0].to === number + 1)
      const next = out.map(edge => `${edge.when === undefined ? '' : `${edge.when} › `}${edge.to <= number ? '回到' : '到'}第 ${edge.to} 步`).join('；')
      return {
        id: view.step.id,
        number,
        title: view.step.title,
        state: stepStateText(view),
        servers: view.servers.length,
        ...(plain ? {} : { next }),
        nextDropped: nextDropped.has(view.step.id),
        unreachable: unreachable.has(view.step.id),
        mark: userMark(view.step.id),
      }
    })
    const walk = walkLine(flow)
    return {
      id: flow.flow.id,
      title: flow.flow.title,
      state: flowStateText(flow),
      steps: flow.steps.length,
      ...(walk === undefined ? {} : { walk }),
      spec: specText(flow),
      rows,
      open: flow.flow.id === selected || rows.some(row => row.mark === 'selected' || row.mark === 'linked'),
      mark: flow.flow.id === selected ? 'selected' : 'plain',
    }
  }
  const roles = ug.roles.map((role): RoleRow => ({
    id: role.role.id,
    title: role.role.title,
    state: USER_STATE_LABELS[role.state],
    flows: role.flows.map(flowRow),
    mark: role.role.id === selected ? 'selected' : 'plain',
  }))
  const orphans = new Map(ug.gaps.filter(gap => gap.key === 'work:orphan').flatMap(gap => gap.nodes.map(id => [id, gap.reason === 'steps-dropped' ? '服务的步骤都不要了' : '不服务任何步骤'] as const)))
  const dev = devRows(graph, goal, orphans, markOn('dev'))
  const focus = [...flowsOf(ug)].sort((a, b) => attentionOf(a) - attentionOf(b) || byCreation(a.flow, b.flow))[0]
  // The band's gaps follow the same order (§6.2): by the attention of the flow a gap is in, §2.6's order within one rank.
  const rankOf = new Map(flowsOf(ug).flatMap(flow => [flow.flow.id, ...flow.steps.map(view => view.step.id)].map(id => [id, attentionOf(flow)] as const)))
  const gaps = ug.gaps.map((gap, position) => ({ gap, position, rank: rankOf.get(gap.nodes[0]) ?? FLOWLESS_RANK }))
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .map(entry => entry.gap)
  const otherSide: readonly { readonly mark: Mark }[] = linked?.side === 'user' ? dev : roles.flatMap(role => role.flows.flatMap(flow => flow.rows))
  return {
    kind: 'ready',
    layout: width >= SPLIT_WIDTH ? 'split' : 'single',
    progress: progressText(ug),
    gaps: gaps.slice(0, BAND_GAPS).map(gap => ({ text: gap.text, node: gap.nodes[0] })),
    more: Math.max(0, ug.gaps.length - BAND_GAPS),
    roles,
    dev,
    ...(focus === undefined ? {} : { focus: focus.flow.id }),
    ...(linked === undefined ? {} : { side: linked.side }),
    linked: otherSide.filter(row => row.mark === 'linked').length,
  }
}
