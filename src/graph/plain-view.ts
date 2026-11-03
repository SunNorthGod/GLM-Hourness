/**
 * The panel's plain-language view model (plain-ui 1.3 §5.4): pure functions
 * over a loaded graph, the session's live views and the current time, one
 * call per graph revision (the caller caches). The words a template writes
 * are plain words: titles travel through quote, and the model's own words
 * carry no route numbers, node ids or engine words — tests/graph-plain-view.spec.ts
 * pins that by running plainIssues-shaped assertions over the output with
 * the titles replaced.
 *
 * Client-safe: no file system, no Node built-ins, so the host rows and the
 * DSH client import the same functions. Where a reading already exists it
 * is imported, not repeated: modules and directions from modules.ts, the
 * dependency walk from projection.ts, the stages from stage.ts, the answer
 * marks from the shared library.
 */
import { answerCallOf, answerKindOf } from '../shared/answer-marks.ts'
import { compareText } from './format.ts'
import { isDesignReview, isPostRelease } from './execute-stage.ts'
import type { AwaitingEntry } from './live.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf, blockersOf, childrenIndex, deciderOf, askFieldsOf, OPEN_STATUSES, subtreeOf, waitsForHuman } from './projection.ts'
import { directionsOf, frameworkOf, isSplit, moduleCandidatesOf, modulesOf, moduleOf } from './modules.ts'
import { effectiveStage, goalOf, isClosed } from './stage.ts'
import type { GraphNode, HistoryEntry } from './schema.ts'

/** Minutes of graph history that fold into one row of the same kind. */
const MERGE_MS = 5 * 60 * 1000

// --- Small shared pieces -----------------------------------------------------

/** 「text」 — every title a template puts inside a sentence travels through here. */
export function quote(text: string): string {
  return `「${text}」`
}

/** The title up to the first full-width colon, when that part is long enough to stand alone; only the live line shortens titles. */
export function shortTitle(title: string): string {
  const head = title.split('：')[0] ?? title
  return head.length >= 4 ? head : title
}

/** 「3 分钟前」 style time; the local date beyond a week. */
export function agoText(at: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000))
  if (seconds < 60) return '刚刚'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} 天前`
  return at.slice(0, 10)
}

/** 「1 分 20 秒」 style span for the live line and the panel's doing text. */
export function spanText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

/** The last history entry of a node, or undefined. */
function lastEntry(node: GraphNode): HistoryEntry | undefined {
  return node.history.at(-1)
}

/** When the node was created (its first history entry). */
function created(node: GraphNode): string {
  return node.history[0]?.at ?? ''
}

const isNewer = (a: string, b: string): number => Date.parse(b) - Date.parse(a)

// --- Progress ----------------------------------------------------------------

/** Work leaves below one node: tasks and features that are not dropped or superseded and have no such work child. Design-review tasks of a module do not count. */
function leafWorkOf(graph: LoadedGraph, rootId: string): readonly GraphNode[] {
  const root = graph.nodes.get(rootId)
  if (root === undefined) return []
  const work = subtreeOf(childrenIndex(graph), root)
    .slice(1)
    .filter(node => (node.type === 'task' || node.type === 'feature') && node.status !== 'dropped' && node.status !== 'superseded')
    .filter(node => !(node.type === 'task' && isDesignReview(graph, node)))
  const parents = new Set(work.map(node => node.parent).filter((parent): parent is string => parent !== undefined))
  return work.filter(node => !parents.has(node.id))
}

export interface Remaining {
  /** Finished leaves. */
  readonly done: number
  /** Leaves the plan numbers: in progress or approved. */
  readonly left: number
  /** Of those, the approved ones that are still one piece (no dependency holds them). */
  readonly unsplit: number
}

/** The progress of a goal or module over its leaf work (plain-ui 1.3 §5.4 remainingOf). */
export function remainingOf(graph: LoadedGraph, rootId: string): Remaining {
  const leaves = leafWorkOf(graph, rootId)
  const inPlan = leaves.filter(node => node.status === 'doing' || node.status === 'approved')
  return {
    done: leaves.filter(node => node.status === 'done').length,
    left: inPlan.length,
    unsplit: inPlan.filter(node => node.type === 'feature' && blockersOf(graph, node.id).length === 0).length,
  }
}

/** 「做完 18 件，还剩 20 件；其中 1 块还没细分成小步」 — the progress line of the home page's first section. */
export function progressLine(graph: LoadedGraph, goalId: string): string {
  const { done, left, unsplit } = remainingOf(graph, goalId)
  if (left === 0) {
    const root = graph.nodes.get(goalId)
    const below = root === undefined ? [] : subtreeOf(childrenIndex(graph), root).slice(1)
    const stalled = below.filter(node => node.type === 'feature' && node.status === 'doing' && remainingOf(graph, node.id).left === 0)
    const rest = stalled.length > 0 ? `；还开着的：${stalled.map(node => quote(node.title)).join('、')}` : ''
    return `做完 ${done} 件，没有剩下的${rest}`
  }
  const rest = unsplit > 0 ? `；其中 ${unsplit} 块还没细分成小步` : ''
  return `做完 ${done} 件，还剩 ${left} 件${rest}`
}

// --- The plan ----------------------------------------------------------------

export interface PlanItem {
  readonly node: GraphNode
  /** The goal the item hangs under, for the section headers when several goals remain. */
  readonly goalId: string
  /** The page number of the item, across the four groups in display order. */
  readonly number: number
  /** The status line under the title. */
  readonly status: string
  /** Ids of the nodes the item waits for (the waiting group only). */
  readonly waitsFor?: readonly string[]
}

export interface Plan {
  readonly doing: readonly PlanItem[]
  readonly ready: readonly PlanItem[]
  readonly waiting: readonly PlanItem[]
  readonly unsplit: readonly PlanItem[]
  /** Every goal that still has items, in id order. */
  readonly goals: readonly string[]
  /** How many items remain, all groups together. */
  readonly total: number
}

const workStatus = (node: GraphNode): node is GraphNode & { readonly status: 'approved' | 'doing' } =>
  node.status === 'approved' || node.status === 'doing'

/** The items that stay, grouped the way the plan page shows them (plain-ui 1.3 §4.4). */
export function planOf(graph: LoadedGraph, now: number, focus?: string): Plan {
  const goals = [...graph.nodes.values()].filter(node => node.type === 'goal' && OPEN_STATUSES.has(node.status)).sort((a, b) => compareText(a.id, b.id))
  const leaves: readonly { readonly node: GraphNode, readonly goalId: string }[] = goals.flatMap(goal =>
    leafWorkOf(graph, goal.id).map(node => ({ node, goalId: goal.id })))
  const doing = leaves.filter(({ node }) => node.status === 'doing')
  const approved = leaves.filter((pair): pair is { readonly node: GraphNode, readonly goalId: string } => workStatus(pair.node) && pair.node.status === 'approved')
  const ready = approved.filter(({ node }) => blockersOf(graph, node.id).length === 0)
  const unsplit = ready.filter(({ node }) => node.type === 'feature')
  const readyTasks = ready.filter(({ node }) => node.type === 'task')
  const waiting = approved.filter(({ node }) => blockersOf(graph, node.id).length > 0)
  const lastAt = (pair: { readonly node: GraphNode }): number => Date.parse(lastEntry(pair.node)?.at ?? created(pair.node))

  // Doing: the focus first, then by the latest history.
  const doingItems = [...doing].sort((a, b) =>
    (a.node.id === focus ? 0 : 1) - (b.node.id === focus ? 0 : 1) || isNewer(String(lastAt(a)), String(lastAt(b))) || compareText(a.node.id, b.node.id))
  // Ready and unsplit: by creation, then id.
  const byCreation = (a: { readonly node: GraphNode }, b: { readonly node: GraphNode }): number =>
    compareText(created(a.node), created(b.node)) || compareText(a.node.id, b.node.id)
  const readyItems = [...readyTasks].sort(byCreation)
  const unsplitItems = [...unsplit].sort(byCreation)

  // Waiting: Kahn over the group, the key the smallest page number among the blockers that are on the page.
  const numbers = new Map<string, number>()
  let next = 1
  for (const item of [...doingItems, ...readyItems]) numbers.set(item.node.id, next++)
  const groupIds = new Set(waiting.map(pair => pair.node.id))
  const keyOf = (pair: { readonly node: GraphNode }): number => {
    const keys = blockersOf(graph, pair.node.id).map(blocker => {
      const direct = numbers.get(blocker.id)
      if (direct !== undefined) return direct
      // The blocker is not on the page: its subtree may carry a numbered item.
      const below = subtreeOf(childrenIndex(graph), blocker).map(node => numbers.get(node.id)).filter((value): value is number => value !== undefined)
      return below.length > 0 ? Math.min(...below) : Number.POSITIVE_INFINITY
    })
    return keys.length > 0 ? Math.min(...keys) : Number.POSITIVE_INFINITY
  }
  const left = [...waiting]
  const ordered: { readonly node: GraphNode, readonly goalId: string }[] = []
  while (left.length > 0) {
    const free = left.filter(pair => blockersOf(graph, pair.node.id).every(blocker => !groupIds.has(blocker.id) || numbers.has(blocker.id)))
    const pick = (free.length > 0 ? free : left)
      .sort((a, b) => keyOf(a) - keyOf(b) || compareText(created(a.node), created(b.node)) || compareText(a.node.id, b.node.id))[0]
    ordered.push(pick)
    numbers.set(pick.node.id, next++)
    left.splice(left.indexOf(pick), 1)
  }
  for (const item of [...doingItems, ...readyItems, ...ordered, ...unsplitItems]) {
    if (!numbers.has(item.node.id)) numbers.set(item.node.id, next++)
  }

  const build = (pair: { readonly node: GraphNode, readonly goalId: string }, status: string, waitsFor?: readonly string[]): PlanItem =>
    ({ node: pair.node, goalId: pair.goalId, number: numbers.get(pair.node.id) ?? 0, status, ...(waitsFor === undefined ? {} : { waitsFor }) })

  const doingBuilt = doingItems.map(pair => {
    const blockers = blockersOf(graph, pair.node.id)
    if (pair.node.id === focus) return build(pair, '在做 · 主 Agent 在这里')
    const blocker = blockers.map(node => numbers.get(node.id)).filter((value): value is number => value !== undefined).at(0)
    if (blocker !== undefined) return build(pair, `在做 · 还要等第 ${blocker} 件做完`)
    const at = lastEntry(pair.node)?.at ?? created(pair.node)
    const ago = now - Date.parse(at)
    const progress = ago > 3 * 24 * 60 * 60 * 1000 ? '3 天没有动静' : `${agoText(at, now)}有进展`
    return build(pair, `在做 · ${progress}`)
  })
  const readyBuilt = readyItems.map(pair => build(pair, '可以开工'))
  const waitingBuilt = ordered.map(pair => {
    const blockers = blockersOf(graph, pair.node.id)
    const onPage = blockers.map(node => numbers.get(node.id)).filter((value): value is number => value !== undefined)
    if (onPage.length === blockers.length && onPage.length > 0) {
      return build(pair, `等第 ${onPage.sort((a, b) => a - b).join('、')} 件`, blockers.map(node => node.id))
    }
    const offPage = blockers.filter(node => !numbers.has(node.id))
    const first = offPage[0]
    const gone = first !== undefined && (first.status === 'dropped' || first.status === 'superseded')
    const name = gone ? `${quote(first?.title ?? '')}（它不做了，主 Agent 会处理）` : quote(first?.title ?? '')
    const rest = offPage.length > 1 ? `等 ${offPage.length - 1} 件` : ''
    return build(pair, `等${name}${rest}`, blockers.map(node => node.id))
  })
  const unsplitBuilt = unsplitItems.map(pair => build(pair, '还没细分'))
  const total = doingBuilt.length + readyBuilt.length + waitingBuilt.length + unsplitBuilt.length
  return {
    doing: doingBuilt,
    ready: readyBuilt,
    waiting: waitingBuilt,
    unsplit: unsplitBuilt,
    goals: goals.map(goal => goal.id).filter(goalId => leaves.some(pair => pair.goalId === goalId)),
    total,
  }
}

// --- Status phrases ----------------------------------------------------------

/** Whether the goal or module the node hangs under is still being designed (wish, interview or design). */
function inDesignPhase(graph: LoadedGraph, node: GraphNode): boolean {
  const holder = moduleOf(graph, node) ?? goalOf(graph, node.id)
  if (holder === undefined) return false
  const stage = holder.id === node.id ? effectiveStage(goalOf(graph, node.id) ?? node) : effectiveStage(holder)
  return stage !== null && !isPostRelease(stage)
}

const isModuleNode = (graph: LoadedGraph, node: GraphNode): boolean =>
  node.type === 'feature' && node.stage !== undefined && node.parent !== undefined && graph.nodes.get(node.parent)?.type === 'goal'

/** A new module candidate: proposed feature under a released goal that is split, when the directions are on the graph. */
function isFreshCandidate(graph: LoadedGraph, node: GraphNode): boolean {
  if (node.type !== 'feature' || node.status !== 'proposed' || node.stage !== undefined || node.parent === undefined) return false
  const goal = graph.nodes.get(node.parent)
  if (goal === undefined || goal.type !== 'goal' || !isSplit(graph, goal)) return false
  const stage = effectiveStage(goal)
  return stage !== null && isPostRelease(stage) && directionsOf(graph) !== undefined
}

/** The plain status of any node (plain-ui 1.3 §5.4 statusPhrase), for the lists and the node pages. */
export function statusPhrase(node: GraphNode, graph: LoadedGraph, awaiting: readonly AwaitingEntry[] = []): string {
  if (node.status === 'proposed') {
    const holder = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
    const moduleHolder = moduleOf(graph, node)
    if (moduleHolder !== undefined && moduleHolder.id !== node.id && moduleHolder.stage !== undefined && !isPostRelease(moduleHolder.stage)) return '随这一块的设计一起定'
    if (isFreshCandidate(graph, node)) return '等下一次定框架时一起定'
    if (holder !== undefined && (holder.type === 'goal' || holder.type === 'feature')) {
      const stage = effectiveStage(holder)
      if (stage !== null && !isPostRelease(stage)) return '随方案一起定'
    }
    return '等你批准'
  }
  if (isModuleNode(graph, node)) return modulePhrase(moduleStateOf(graph, node, awaiting))
  if (node.type === 'question') {
    if (node.status === 'done') {
      if (node.conclusion !== undefined) return `定了：${node.conclusion}`
      const chosen = node.options?.find(entry => entry.key === node.decision)
      return chosen === undefined ? '已定' : `选了「${chosen.label}」`
    }
    if (OPEN_STATUSES.has(node.status)) return deciderOf(node) === 'agent' ? 'agent 来定' : '等你回话'
  }
  if (node.type === 'task' || node.type === 'feature') {
    switch (node.status) {
      case 'doing': return '在做'
      case 'done': return '做完了'
      case 'dropped': return '不做了'
      case 'superseded': return '被取代了'
      default: {
        const blockers = blockersOf(graph, node.id)
        if (blockers.length > 0) return `等${quote(blockers[0]?.title ?? '')}`
        if (node.type === 'feature' && leafWorkOf(graph, node.id).length === 0) return '还没细分'
        return '可以开工'
      }
    }
  }
  if (node.type === 'decision') {
    if (node.status === 'dropped') return '被推翻了'
    if (node.status === 'superseded') return '被取代了'
    if (node.verification === 'sandbox') return '在沙盒里验过'
    if (node.verification === 'device') return '在真机上验过'
    return OPEN_STATUSES.has(node.status) ? '已采纳 · 还没验证' : node.status === 'done' ? '已采纳' : '等你批准'
  }
  if (node.type === 'norm') return OPEN_STATUSES.has(node.status) ? '生效中' : node.status === 'done' ? '生效中' : '等你批准'
  if (node.type === 'risk') return OPEN_STATUSES.has(node.status) || node.status === 'done' ? '在盯着' : '等你批准'
  if (node.type === 'tool') return OPEN_STATUSES.has(node.status) || node.status === 'done' ? '可用' : '等你批准'
  if (node.type === 'goal') {
    if (node.status === 'done') return '做完了'
    if (node.status === 'dropped') return '不做了'
    if (node.status === 'superseded') return '被取代了'
    const stage = effectiveStage(node)
    if (stage === 'wish') return '还在问你想做成什么'
    if (stage === 'interview') return '在问清需求'
    if (stage === 'design') return '在写方案'
    return node.status === 'doing' ? '在做' : '还没开工'
  }
  return '在往前走'
}

// --- The two-level loop ------------------------------------------------------

/** The state of a module (plain-ui 1.3 §4.11). 在开发 waits for M7's derived stage (E1b): until it lands a released module shows 放行了. */
export type ModuleState = 'designing' | 'awaiting-release' | 'released' | 'developing' | 'done'

export const MODULE_PHRASES: Readonly<Record<ModuleState, string>> = {
  designing: '设计中',
  'awaiting-release': '等你放行',
  released: '放行了',
  developing: '在开发',
  done: '做完了',
}

const modulePhrase = (state: ModuleState): string => MODULE_PHRASES[state]

/** The state of one module, first rule that holds wins (plain-ui 1.3 §4.11). */
export function moduleStateOf(graph: LoadedGraph, module: GraphNode, awaiting: readonly AwaitingEntry[]): ModuleState {
  if (module.status === 'done') return 'done'
  const goal = module.parent === undefined ? undefined : graph.nodes.get(module.parent)
  const goalStage = goal === undefined ? null : effectiveStage(goal)
  const moduleStage = module.stage === undefined ? null : module.stage
  if (moduleStage !== null && !isPostRelease(moduleStage)) {
    const waiting = goalStage !== null && isPostRelease(goalStage)
      && awaiting.some(entry => entry.kind === 'release' && entry.goal === goal?.id && entry.module === module.id)
    return waiting ? 'awaiting-release' : 'designing'
  }
  return 'released'
}

/** Whether a split goal's framework is being changed again: the goal is back in a design stage while modules exist. */
export function frameworkChanging(graph: LoadedGraph, goal: GraphNode): boolean {
  if (modulesOf(graph, goal).length === 0) return false
  const stage = effectiveStage(goal)
  return stage !== null && !isPostRelease(stage)
}

interface ModuleLine {
  readonly node: GraphNode
  readonly state: ModuleState
  readonly done: number
  readonly left: number
}

export interface ModulesGoalView {
  readonly goal: GraphNode
  readonly framework: readonly GraphNode[]
  readonly changing: boolean
  readonly modules: readonly ModuleLine[]
  /** Module candidates proposed after the release; the module list only changes in the big loop, so they wait there. */
  readonly fresh: readonly GraphNode[]
  readonly hasModules: boolean
}

export interface ModulesView {
  readonly directions: readonly string[]
  readonly goals: readonly ModulesGoalView[]
}

/**
 * The 框架与模块 page and the home page's module line (plain-ui 1.3 §4.11):
 * one section per goal that is split or hides fresh candidates, and the
 * directions at the end. Null when the directions are not on the graph —
 * the whole two-level loop display stays off then.
 */
export function modulesView(graph: LoadedGraph, awaiting: readonly AwaitingEntry[]): ModulesView | null {
  const directions = directionsOf(graph)
  if (directions === undefined) return null
  const goals: ModulesGoalView[] = []
  for (const goal of [...graph.nodes.values()].filter(node => node.type === 'goal' && OPEN_STATUSES.has(node.status))) {
    const modules = modulesOf(graph, goal)
    const fresh = moduleCandidatesOf(graph, goal).filter(node => isFreshCandidate(graph, node))
    if (modules.length === 0 && fresh.length === 0) continue
    const released = isSplit(graph, goal) && ((): boolean => {
      const stage = effectiveStage(goal)
      return stage !== null && isPostRelease(stage)
    })()
    if (modules.length === 0 && !(released && fresh.length > 0)) continue
    goals.push({
      goal,
      framework: frameworkOf(graph, goal),
      changing: frameworkChanging(graph, goal),
      modules: modules.map(node => {
        const state = moduleStateOf(graph, node, awaiting)
        const remaining = remainingOf(graph, node.id)
        return { node, state, done: remaining.done, left: remaining.left }
      }),
      fresh,
      hasModules: modules.length > 0,
    })
  }
  return { directions: directions.acceptance ?? [], goals }
}

/** 「6 个模块：1 个等你放行 · 2 个在开发 · 2 个设计中 · 1 个做完了」 — the home line under a split goal's progress, or null. */
export function moduleRowText(graph: LoadedGraph, goal: GraphNode, awaiting: readonly AwaitingEntry[]): string | null {
  if (directionsOf(graph) === undefined) return null
  const modules = modulesOf(graph, goal)
  if (modules.length === 0) return null
  const counts = new Map<ModuleState, number>()
  for (const module of modules) {
    const state = moduleStateOf(graph, module, awaiting)
    counts.set(state, (counts.get(state) ?? 0) + 1)
  }
  const parts = (['awaiting-release', 'developing', 'released', 'designing', 'done'] as const)
    .map(state => counts.get(state) === undefined ? undefined : `${counts.get(state)} 个${MODULE_PHRASES[state]}`)
    .filter((part): part is string => part !== undefined)
  const changing = frameworkChanging(graph, goal) ? '框架在改 · ' : ''
  return `${changing}${modules.length} 个模块：${parts.join(' · ')}`
}

// --- Needs you ---------------------------------------------------------------

type NeedKind = 'question' | 'awaiting' | 'proposal'

export interface NeedEntry {
  readonly kind: NeedKind
  /** Since when the human is waited on (ISO), oldest first. */
  readonly since: string
  /** The node on the graph (question, proposal). */
  readonly node?: GraphNode
  /** The matter the main agent put to the human and has not recorded an answer for. */
  readonly matter?: AwaitingEntry
  /** How many proposed nodes hide under a top proposal. */
  readonly includes?: number
  /** Whether the question carries the legacy option card. */
  readonly legacy?: boolean
}

/** The stages a confirm waits in, and the one a release waits in (plain-ui 1.3 §4.9). */
function awaitingStageOk(kind: 'confirm' | 'release', stage: ReturnType<typeof effectiveStage>): boolean {
  if (stage === null) return false
  return kind === 'confirm' ? stage === 'wish' || stage === 'interview' : stage === 'design'
}

/** What waits for the human, oldest first (plain-ui 1.3 §4.3): open questions the human decides, the matters in the main agent's awaiting, and proposals to approve. */
export function needsOf(graph: LoadedGraph, awaiting: readonly AwaitingEntry[]): NeedEntry[] {
  const entries: NeedEntry[] = []
  for (const node of graph.nodes.values()) {
    if (waitsForHuman(node)) {
      const asked = [...node.history].reverse().find(entry => entry.op === 'propose' || entry.op === 'edit')
      entries.push({ kind: 'question', since: asked?.at ?? created(node), node, ...(node.options !== undefined ? { legacy: true } : {}) })
      continue
    }
    if (node.status === 'proposed' && node.type !== 'question') {
      const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
      if (parent !== undefined && parent.status === 'proposed') continue
      if (inDesignPhase(graph, node)) continue
      if (isFreshCandidate(graph, node)) continue
      const below = [...graph.nodes.values()].filter(other =>
        other.status === 'proposed' && other.type !== 'question' && other.id !== node.id && isUnder(graph, other, node.id)).length
      entries.push({ kind: 'proposal', since: created(node), node, ...(below > 0 ? { includes: below } : {}) })
    }
  }
  for (const matter of awaiting) {
    if (matter.kind === 'unknown') {
      entries.push({ kind: 'awaiting', since: new Date(matter.at).toISOString(), matter })
      continue
    }
    const goal = graph.nodes.get(matter.goal)
    if (goal === undefined || isClosed(goal)) continue
    const stage = effectiveStage(goal)
    if (matter.module !== '') {
      const module = graph.nodes.get(matter.module)
      if (module === undefined || isClosed(module) || effectiveStage(module) !== 'design') continue
      if (stage === null || !isPostRelease(stage)) continue
    }
    else if (!awaitingStageOk(matter.kind, stage)) continue
    entries.push({ kind: 'awaiting', since: new Date(matter.at).toISOString(), matter })
  }
  return entries.sort((a, b) => compareText(a.since, b.since))
}

/** Whether `node` sits strictly under `id` in the decomposition tree. */
function isUnder(graph: LoadedGraph, node: GraphNode, id: string | undefined): boolean {
  return id !== undefined && ancestorsOf(graph, node).some(entry => entry.id === id)
}

// --- Changes -----------------------------------------------------------------

export interface ChangeRow {
  readonly at: string
  /** The one human line. */
  readonly text: string
  /** A small line under it («连同 N 件»). */
  readonly note?: string
}

/** The goals' one-piece-done lines and the goals' own line never merge (plain-ui 1.3 §4.8). */
function isBlockDone(graph: LoadedGraph, node: GraphNode): boolean {
  return node.type === 'feature' && node.parent !== undefined && graph.nodes.get(node.parent)?.type === 'goal'
}

/**
 * What changed since the human last looked (plain-ui 1.3 §4.8): the
 * history after `since`, the human's own operations left out, one row per
 * kind of change. `quiet` carries the nodes that sit in 需要你 right now —
 * their changes stay invisible until the matter is settled.
 */
export function changesSince(graph: LoadedGraph, since: string, quiet: ReadonlySet<string>): ChangeRow[] {
  const sinceMs = Date.parse(since)
  if (!Number.isFinite(sinceMs)) return []
  const rows: ChangeRow[] = []
  /** Rows of one answer call: the first write makes the row, the approves of the same call join it as 连同 N 件. */
  const calls = new Map<string, { readonly at: string, readonly text: string, readonly extras: string[] }>()
  const noteOf = (call: { readonly extras: readonly string[] }): string | undefined =>
    call.extras.length === 0 ? undefined : `连同 ${call.extras.length} 件`
  const push = (at: string, text: string, note?: string): void => { rows.push({ at, text, ...(note === undefined ? {} : { note }) }) }

  const progress: { readonly at: string, readonly kind: string, readonly title: string }[] = []
  const comments = new Map<string, number>()

  for (const node of graph.nodes.values()) {
    if (quiet.has(node.id)) continue
    for (const entry of node.history) {
      if (Date.parse(entry.at) <= sinceMs) continue
      if (entry.actor !== 'llm') continue
      const mark = answerKindOf(entry)
      const callId = answerCallOf(entry)
      if (entry.op === 'decide') {
        if (mark === 'agree') {
          const text = `你在对话里同意了${quote(node.title)}${entry.conclusion === undefined ? '' : `：${entry.conclusion}`}`
          if (callId !== undefined) calls.set(callId, { at: entry.at, text, extras: [] })
          else push(entry.at, text)
        }
        else if (deciderOf(node) === 'agent') {
          const chosen = entry.conclusion ?? node.options?.find(option => option.key === entry.option)?.label ?? entry.option
          push(entry.at, `agent 自己定了${quote(node.title)}${chosen === undefined ? '' : `：${chosen}`}`, '要推翻，跟主 Agent 说')
        }
        continue
      }
      if (entry.op === 'comment') {
        if (mark === 'add') push(entry.at, `你在对话里补充了${quote(node.title)}，主 Agent 会改了再问你`)
        else if (mark === 'reject') push(entry.at, `你在对话里否掉了${quote(node.title)}的方案，主 Agent 会换一个再问你`)
        else comments.set(node.id, (comments.get(node.id) ?? 0) + 1)
        continue
      }
      if (entry.op === 'edit') {
        const stage = entry.changes?.stage?.to
        if (mark === 'agree' && stage === 'design' && node.type === 'goal') {
          const text = `你在对话里确认了${quote(node.title)}要做成什么`
          if (callId !== undefined && !calls.has(callId)) calls.set(callId, { at: entry.at, text, extras: [] })
          else if (callId === undefined) push(entry.at, text)
          continue
        }
        if (mark === 'agree' && stage === 'release') {
          const text = isModuleNode(graph, node)
            ? `你在对话里放行了${quote(node.title)}这一块的设计`
            : `你在对话里放行了${quote(node.title)}的方案`
          if (callId !== undefined && !calls.has(callId)) calls.set(callId, { at: entry.at, text, extras: [] })
          else if (callId === undefined) push(entry.at, text)
          continue
        }
        if (mark === undefined && stage === 'design' && node.type === 'feature' && node.stage !== undefined && entry.changes?.stage?.from !== undefined && isPostRelease(entry.changes.stage.from)) {
          push(entry.at, `${quote(node.title)}回到设计，主 Agent 改好设计会再交给你放行`)
          continue
        }
        if (mark === undefined && stage === 'design' && node.type === 'goal' && entry.relay !== undefined && entry.changes?.stage?.from !== undefined && isPostRelease(entry.changes.stage.from)) {
          push(entry.at, `按你在对话里说的，${quote(node.title)}的框架要改`)
          continue
        }
        if (entry.relay !== undefined && mark === undefined) push(entry.at, `按你在对话里说的，${quote(node.title)}更新了`)
        continue
      }
      if (entry.op === 'approve') {
        if (mark === 'agree' && callId !== undefined) {
          const call = calls.get(callId)
          if (call !== undefined) calls.set(callId, { ...call, extras: [...call.extras, node.title] })
        }
        else if (entry.relay !== undefined) push(entry.at, `按你在对话里说的，批准了${quote(node.title)}`)
        continue
      }
      if (entry.op === 'propose') {
        if (node.status === 'proposed') continue
        progress.push({ at: entry.at, kind: entry.relay === undefined ? 'added' : 'added-relay', title: node.title })
        continue
      }
      if (entry.op === 'status') {
        if (entry.to === 'doing') progress.push({ at: entry.at, kind: 'doing', title: node.title })
        else if (entry.to === 'done') {
          if (node.type === 'goal') push(entry.at, `${quote(node.title)}做完了，整体审查的结论在它的节点页`)
          else if (isBlockDone(graph, node)) push(entry.at, `${quote(node.title)}这一块做完了`)
          else progress.push({ at: entry.at, kind: 'done', title: node.title })
        }
        else if (entry.to === 'dropped') progress.push({ at: entry.at, kind: 'dropped', title: node.title })
        else if (entry.from === 'dropped' && entry.to === 'approved') push(entry.at, `${quote(node.title)}重新打开返工`)
        continue
      }
      if (entry.op === 'verify') {
        push(entry.at, entry.to === 'sandbox' ? `${quote(node.title)}在沙盒里验过了` : entry.to === 'device' ? `${quote(node.title)}在真机上验过了` : `${quote(node.title)}的验证更新了`)
        continue
      }
      if (entry.op === 'supersede') {
        const other = entry.by === undefined ? undefined : graph.nodes.get(entry.by)
        push(entry.at, other === undefined ? `${quote(node.title)}被取代了` : `${quote(node.title)}被${quote(other.title)}取代了`)
        continue
      }
    }
  }

  // Progress kinds fold within the window of their latest row; a relayed add reads differently.
  const folded = new Map<string, { readonly at: string, last: number, readonly titles: string[] }>()
  for (const item of progress.sort((a, b) => compareText(a.at, b.at))) {
    const known = folded.get(item.kind)
    const at = Date.parse(item.at)
    if (known !== undefined && at - known.last <= MERGE_MS) {
      folded.set(item.kind, { ...known, last: Math.max(known.last, at), titles: [...known.titles, item.title] })
      continue
    }
    folded.set(item.kind, { at: item.at, last: at, titles: [item.title] })
  }
  const KIND_TEXT: Readonly<Record<string, string>> = {
    doing: '开始做',
    done: '做完了',
    dropped: '不做',
    added: '新加了一件',
    'added-relay': '按你在对话里说的，新加了',
  }
  for (const [key, group] of folded) {
    const verb = KIND_TEXT[key] ?? '更新了'
    const [first, ...rest] = group.titles
    const text = rest.length === 0 || key === 'added' || key === 'added-relay'
      ? `${verb}${quote(first ?? '')}`
      : `${verb}${quote(first ?? '')}等 ${group.titles.length} 件`
    push(group.at, text)
  }
  for (const [id, count] of comments) {
    const node = graph.nodes.get(id)
    if (node !== undefined) push(node.history[node.history.length - 1]?.at ?? '', `${quote(node.title)}有 ${count} 条新进展`)
  }
  for (const call of calls.values()) push(call.at, call.text, noteOf(call))
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

// --- The live line -----------------------------------------------------------

/** What an agent of this session is, as the live line reads it. */
export interface LiveAgent {
  readonly main: boolean
  readonly running: boolean
  readonly view?: {
    readonly focus: string | null
    readonly tool: { readonly name: string, readonly since: number } | null
    readonly turnSince: number | null
  }
}

/** The tool a live view names, in the words the home page uses (plain-ui 1.3 §5.4 liveLine). */
export function toolWords(name: string): string {
  if (['Bash', 'bash', 'pwsh'].includes(name)) return '在跑命令'
  if (['Read', 'read'].includes(name)) return '在读文件'
  if (['Write', 'Edit', 'write', 'edit', 'str_replace_editor'].includes(name)) return '在改文件'
  if (['Grep', 'Glob'].includes(name)) return '在找文件'
  if (name.startsWith('graph_')) return '在写项目图'
  if (name === 'propose_to_human') return '在把一件事交给你'
  if (name === 'record_human_answer') return '在记下你的回话'
  if (name === 'subagent' || name === 'subagent_fork') return '在派子 agent'
  return '在用工具'
}

export interface LiveLineResult {
  /** The 现在 sentence. */
  readonly line: string
  /** The second line when children of this session run. */
  readonly sub?: string
}

/** The 现在 sentence (plain-ui 1.3 §4.2 ③): where this session's agent stands, and what it is doing. */
export function liveLine(agents: readonly LiveAgent[], graph: LoadedGraph, now: number, mainHere: boolean): LiveLineResult {
  const root = agents.find(agent => agent.main)
  const children = agents.filter(agent => !agent.main && agent.running)
  const subject = mainHere ? '主 Agent' : '这个对话的 agent'
  const sub = children.length > 0 ? `另有 ${children.length} 个子 agent 在跑` : undefined
  if (root === undefined || root.view === undefined) {
    return { line: `${subject}还没有现场数据`, ...(sub === undefined ? {} : { sub }) }
  }
  const place = root.view.focus === null ? undefined : graph.nodes.get(root.view.focus)
  const at = place === undefined ? undefined : quote(shortTitle(place.title))
  if (root.running) {
    const tool = root.view.tool
    const doing = tool === null ? '在想' : `${toolWords(tool.name)} · ${spanText(now - tool.since)}`
    return { line: `${subject} ${at === undefined ? '在推进' : `在${at}上`} · ${doing}`, ...(sub === undefined ? {} : { sub }) }
  }
  if (!mainHere && children.length === 0) {
    const working = [...graph.nodes.values()].filter(node => node.status === 'doing' && node.type !== 'goal').length
    const rest = working > 0 ? `在做的 ${working} 件可能在主 Agent 的对话或 DSH 之外推进` : ''
    return { line: `这个对话里没有 agent 在跑${rest === '' ? '' : `；${rest}`}` }
  }
  return { line: at === undefined ? `${subject} 空闲，等你说话` : `${subject} 空闲，等你说话 · 上次在${at}`, ...(sub === undefined ? {} : { sub }) }
}

// --- The question view -------------------------------------------------------

export interface QuestionView {
  readonly title: string
  /** The question as the human read it (the proposal shape). */
  readonly ask?: string
  readonly proposal?: string
  readonly reason?: string
  readonly cost?: string
  readonly ways?: readonly string[]
  readonly notTaken?: string
  /** The question carries the legacy option card; the panel shows the title and lets the chat answer. */
  readonly legacy: boolean
  readonly decided: { readonly conclusion?: string, readonly label?: string, readonly words?: string, readonly at?: string } | null
}

/** What a question shows (plain-ui 1.3 §5.4 questionView), on the landed ask forms: no option keys, no recommendation marks. */
export function questionView(node: GraphNode): QuestionView {
  const decide = [...node.history].reverse().find(entry => entry.op === 'decide')
  return {
    title: node.title,
    ...askFieldsOf(node),
    legacy: node.options !== undefined,
    decided: node.status === 'done'
      ? {
          ...(node.conclusion === undefined ? {} : { conclusion: node.conclusion }),
          ...(node.decision === undefined ? {} : { label: node.options?.find(entry => entry.key === node.decision)?.label ?? node.decision }),
          ...(decide?.relay === undefined ? {} : { words: decide.relay }),
          ...(decide === undefined ? {} : { at: decide.at }),
        }
      : null,
  }
}
