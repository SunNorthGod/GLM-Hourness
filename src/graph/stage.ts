/**
 * Design-loop stage model (docs/ORCHESTRATION.md §4.2, §4.3, §4.8): the
 * requirement card of a goal, the five columns of a design decision, the
 * release set and the gates that let a goal leave the interview and design
 * stages, as pure functions over a loaded graph. No file system and no
 * Node built-ins, so the host rows and the DSH client import the same
 * rules. A graph with validation errors is evaluated as it is (reads are
 * never blocked; the engine refuses the writes), and every walk is cut at
 * a loop.
 *
 * Gate items come in two kinds: checks that are always listed with their
 * ok flag (the 8 card items, the decision item, the five columns of each
 * design decision, the acceptance of each proposed task), and offenders
 * that are listed only while they block (an undecided question, a
 * proposal with a supersedes edge).
 */
import { compareText } from './format.ts'
import { DIRECTIONS_ID, directionsOf, frameworkOf, isSplit, moduleOf } from './modules.ts'
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf, childrenIndex, subtreeOf, waitsForHuman } from './projection.ts'
import { STAGES, type GraphNode, type Stage, type Status } from './schema.ts'

export interface GateItem {
  /** Stable key, for example acceptance or decision-3:architecture. */
  readonly key: string
  /** What the human reads, in Chinese, for example 成功（怎样算做成）. */
  readonly label: string
  readonly ok: boolean
  /** For the model, in English: which interview step asks for it, or what to write where on the graph. */
  readonly hint: string
}

export interface StageStatus {
  readonly goal: string
  readonly stage: Stage | null
  /** The goal is done, dropped or superseded. */
  readonly closed: boolean
  /**
   * wish and interview: the requirement card and the confirmation gate
   * (goal:supersedes); design: the release gate, five columns of every
   * design decision included; empty for the other stages and for null.
   */
  readonly items: readonly GateItem[]
  /** The goal may leave its stage through design_review: a wish, interview or design stage with every item ok. */
  readonly exitReady: boolean
  /** Questions in the goal's subtree waiting for the human. */
  readonly waitingHuman: number
}

const CLOSED: ReadonlySet<Status> = new Set(['done', 'dropped', 'superseded'])

/** Statuses of nodes that no longer count: dropped or superseded. */
const GONE: ReadonlySet<Status> = new Set(['dropped', 'superseded'])

/**
 * The labeled sections of a body. A section starts at a line that begins
 * with a known label and a full-width or ASCII colon, and runs to the next
 * line that starts a known label, or to the end; its value is trimmed.
 * Only the first section of a label counts; text before the first label
 * belongs to none.
 */
export function labeledSections(body: string | undefined, labels: readonly string[]): ReadonlyMap<string, string> {
  const sections = new Map<string, string>()
  if (body === undefined) return sections
  let current: string | undefined
  let lines: string[] = []
  const close = (): void => {
    if (current !== undefined && !sections.has(current)) sections.set(current, lines.join('\n').trim())
  }
  for (const line of body.split(/\r?\n/)) {
    const label = labels.find(entry => line.startsWith(`${entry}：`) || line.startsWith(`${entry}:`))
    if (label === undefined) {
      lines.push(line)
      continue
    }
    close()
    current = label
    lines = [line.slice(label.length + 1)]
  }
  close()
  return sections
}

/**
 * The stage a goal is really in (design §2.4): a proposed goal is in wish
 * or interview whatever stage it names, because only the human's approval
 * moves it on; an approved or doing goal is in the stage it names, or in
 * none when it names none (it does not run the design loop); a closed goal
 * is in none.
 */
export function effectiveStage(node: GraphNode): Stage | null {
  if (node.status === 'proposed') return node.stage === undefined || node.stage === 'wish' ? 'wish' : 'interview'
  if (node.status === 'approved' || node.status === 'doing') return node.stage ?? null
  return null
}

/** Whether a node is done, dropped or superseded. */
export function isClosed(node: GraphNode): boolean {
  return CLOSED.has(node.status)
}

/** The node itself when it is a goal, else its nearest goal ancestor: the current goal of a focus. Undefined when the node is missing or no goal is above it. */
export function goalOf(graph: LoadedGraph, id: string): GraphNode | undefined {
  const node = graph.nodes.get(id)
  if (node === undefined) return undefined
  return [node, ...ancestorsOf(graph, node)].find(entry => entry.type === 'goal')
}

/** The goal's descendants, without the goal. */
function descendants(graph: LoadedGraph, goal: GraphNode): GraphNode[] {
  return subtreeOf(childrenIndex(graph), goal).slice(1)
}

function filled(sections: ReadonlyMap<string, string>, label: string): boolean {
  return (sections.get(label) ?? '').length > 0
}

/** The last decide of a question was the human's, in the panel or relayed from the chat. */
function lastDecidedByHuman(node: GraphNode): boolean {
  const last = node.history.filter(entry => entry.op === 'decide').at(-1)
  return last !== undefined && (last.actor === 'human' || last.relay !== undefined)
}

const CARD_LABELS = ['需求', '问题', '给谁', '约束']

/** The 8 items of the requirement card (§4.2), read from the goal and its subtree. */
export function requirementCard(graph: LoadedGraph, goal: GraphNode): readonly GateItem[] {
  const sections = labeledSections(goal.body, CARD_LABELS)
  const below = descendants(graph, goal)
  return [
    { key: 'need', label: '需求', ok: filled(sections, '需求'), hint: 'interview step 1 (what they want): a line "需求：" with the human\'s words verbatim in the goal body' },
    { key: 'problem', label: '问题', ok: filled(sections, '问题'), hint: 'interview step 2 (how their days change once it is done): a line "问题：" with the real problem in the goal body' },
    { key: 'audience', label: '给谁', ok: filled(sections, '给谁'), hint: 'interview step 2: a line "给谁：" with who uses it in the goal body' },
    { key: 'constraints', label: '约束', ok: filled(sections, '约束'), hint: 'interview step 5 (what must not change, cost or be risked): a line "约束：" in the goal body, "约束：无" when there are none' },
    { key: 'acceptance', label: '成功（怎样算做成）', ok: (goal.acceptance ?? []).length > 0, hint: 'interview step 3 (how they will check it is done): set acceptance on the goal' },
    { key: 'non-goals', label: '非目标（明确不做的）', ok: (goal.nonGoals ?? []).length > 0, hint: 'interview step 4 (what they clearly do not want; offer guesses): set nonGoals on the goal' },
    {
      key: 'risks',
      label: '风险（最可能出岔子的地方）',
      ok: below.some(node => node.type === 'risk' && !GONE.has(node.status)),
      hint: 'interview step 6 (the likeliest reasons it fails; guess three): graph_propose one risk node under the goal for each',
    },
    {
      key: 'choice',
      label: '岔路（人拍板的选择）',
      ok: below.some(node => node.type === 'question' && node.status === 'done' && (node.decision !== undefined || node.conclusion !== undefined) && lastDecidedByHuman(node)),
      hint: 'interview step 7 (the fork only the human can decide): put it with propose_to_human (kind question, form recommend or choose) and record the answer with record_human_answer; a question the agent decided on its own does not count',
    },
  ]
}

const COLUMN_LABELS = ['理由', '架构', '查过的现成方案']

/**
 * The labels a decision body is cut into sections by. A decision may also
 * carry a line "如果失败：" (the likeliest reason it fails, written before the
 * design is put to the human): it is not a column and the gate does not look
 * at it, but it has to end the section above it, or an empty
 * "查过的现成方案：" followed by that line would read as filled.
 */
const PARSED_LABELS = [...COLUMN_LABELS, '如果失败']

/**
 * The five columns of a design decision (§4.3): reason and architecture in
 * its body, acceptance, plan, non-goals. The plan is what points at the
 * decision with a source edge below `within` (the goal; for a module's
 * decision, the module).
 */
export function designColumns(graph: LoadedGraph, within: GraphNode, decision: GraphNode): readonly GateItem[] {
  const sections = labeledSections(decision.body, PARSED_LABELS)
  const id = decision.id
  const plan = descendants(graph, within).filter(node => !GONE.has(node.status) && (node.edges ?? []).some(edge => edge.type === 'source' && edge.to === id))
  return [
    { key: `${id}:reason`, label: '理由', ok: filled(sections, '理由'), hint: `a line "理由：" with why this design, in the body of ${id}` },
    {
      key: `${id}:architecture`,
      label: '架构（含查过的现成方案）',
      ok: filled(sections, '架构') && filled(sections, '查过的现成方案'),
      hint: `both "架构：" (how it works) and "查过的现成方案：" (the existing solutions checked and why they are not used) in the body of ${id}`,
    },
    { key: `${id}:acceptance`, label: '目标（怎样算做成）', ok: (decision.acceptance ?? []).length > 0, hint: `set acceptance on ${id}: checkable criteria for the effect` },
    { key: `${id}:plan`, label: '规划', ok: plan.length > 0, hint: `graph_propose the planned features and tasks under the goal, each with a source edge to ${id}` },
    { key: `${id}:non-goals`, label: '非目标', ok: (decision.nonGoals ?? []).length > 0, hint: `set nonGoals on ${id}: what this design does not do` },
  ]
}

/** The nodes ordered the way a release approves them: by depth, then creation time (first history entry), then id, so a parent comes before its children. */
function inReleaseOrder(graph: LoadedGraph, nodes: readonly GraphNode[]): readonly GraphNode[] {
  const depth = (node: GraphNode): number => ancestorsOf(graph, node).length
  const created = (node: GraphNode): string => node.history[0]?.at ?? ''
  return [...nodes].sort((a, b) => depth(a) - depth(b) || compareText(created(a), created(b)) || compareText(a.id, b.id))
}

/**
 * What a release approves (§3.3.2 item 2): every proposed node in the
 * goal's subtree but the goal, by depth, then creation time (first history
 * entry), then id, so a parent comes before its children. This is the set of
 * a goal that is not split into modules; a split goal releases `bigLoopSet`
 * first and each module its `moduleSet`.
 */
export function releaseSet(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return inReleaseOrder(graph, descendants(graph, goal).filter(node => node.status === 'proposed'))
}

/** Whether a node is below a module or a module candidate (the module itself is not): a part of that module's own release. */
function belowModule(graph: LoadedGraph, node: GraphNode): boolean {
  const module = moduleOf(graph, node)
  return module !== undefined && module.id !== node.id
}

/**
 * What the release of the framework approves for a goal split into modules
 * (§3.14.2): the proposed nodes of the goal's subtree that are not below a
 * module or a candidate, and the candidates themselves. In release order.
 */
export function bigLoopSet(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  return inReleaseOrder(graph, descendants(graph, goal).filter(node => node.status === 'proposed' && !belowModule(graph, node)))
}

/** What the release of one module approves (§3.14.3): the proposed nodes below the module, in release order. */
export function moduleSet(graph: LoadedGraph, module: GraphNode): readonly GraphNode[] {
  return inReleaseOrder(graph, descendants(graph, module).filter(node => node.status === 'proposed'))
}

/** A proposal with a supersedes edge blocks: approving it would supersede nodes the card does not show (design §3.3.2 item 6). */
function supersedesItem(node: GraphNode, key: string, hint: string): GateItem[] {
  return (node.edges ?? []).some(edge => edge.type === 'supersedes') ? [{ key, label: `「${node.title}」取代旧节点`, ok: false, hint }] : []
}

const HUMAN_SUPERSEDES = 'superseding a node needs the human: they approve it in the panel, or say so in the chat and you relay their words'

const DECISION_HINT = 'graph_propose a decision node under the goal with the five columns: "理由：", "架构：" and "查过的现成方案：" in its body, acceptance, nonGoals, and planned nodes with a source edge to it'

/** The items every release gate has in common: the five columns of each proposed decision, the acceptance of each proposed task, the questions that still wait, the proposals that supersede. */
function setItems(graph: LoadedGraph, within: GraphNode, set: readonly GraphNode[], undecided: readonly GraphNode[]): GateItem[] {
  return [
    ...set.filter(node => node.type === 'decision').flatMap(decision => designColumns(graph, within, decision)),
    ...set.filter(node => node.type === 'task').map(task => ({
      key: `${task.id}:acceptance`, label: `任务「${task.title}」怎样算做完`, ok: (task.acceptance ?? []).length > 0, hint: `set acceptance on ${task.id}: how to tell it is done`,
    })),
    ...undecided.map(question => ({
      key: `${question.id}:undecided`,
      label: `待决「${question.title}」还没拍板`,
      ok: false,
      hint: question.decider === 'agent' ? `${question.id} is yours: decide it with graph_decide` : `the human decides ${question.id}: wait for the human's answer in the chat and record it with record_human_answer`,
    })),
    ...set.flatMap(node => supersedesItem(node, `${node.id}:supersedes`, `${HUMAN_SUPERSEDES}; or remove the edge and raise a question instead`)),
  ]
}

/** The questions among `candidates` that still wait, and those the nodes of `set` point at with a source edge, each once. */
function waitingQuestions(graph: LoadedGraph, candidates: readonly GraphNode[], set: readonly GraphNode[]): GraphNode[] {
  const waiting = (node: GraphNode | undefined): node is GraphNode => node !== undefined && node.type === 'question' && (node.status === 'approved' || node.status === 'doing')
  const cited = set.flatMap(node => (node.edges ?? []).filter(edge => edge.type === 'source').map(edge => graph.nodes.get(edge.to)))
  const seen = new Set<string>()
  return [...candidates, ...cited].filter(waiting).filter(question => !seen.has(question.id) && seen.add(question.id))
}

/** Whether the node is approved, in progress or done: a proposal the human has agreed to. */
function adopted(node: GraphNode): boolean {
  return node.status === 'approved' || node.status === 'doing' || node.status === 'done'
}

/**
 * The release gate of a goal that is not split (§3.3.2). The design decision
 * is one in the set, or one that is approved already: a release that stopped
 * or skipped a node has approved the decision, and the design put to the
 * human again has to be released from there.
 */
function singleGate(graph: LoadedGraph, goal: GraphNode): GateItem[] {
  const set = releaseSet(graph, goal)
  const below = descendants(graph, goal)
  return [
    { key: 'decision', label: '设计决策', ok: set.some(node => node.type === 'decision') || below.some(node => node.type === 'decision' && adopted(node)), hint: DECISION_HINT },
    ...setItems(graph, goal, set, waitingQuestions(graph, below, [])),
  ]
}

/**
 * The release gate of the framework of a goal split into modules (§3.14.2):
 * a framework (a decision already approved under the goal, or one in the
 * set), the five columns of each decision in the set, the acceptance of each
 * task in the set, no question left open outside the modules, no
 * superseding proposal, and a list of directions with at least one item. The
 * set cannot be empty here: a split goal has a candidate, which is in it, or
 * a module, which is the case of a release put again after the framework was
 * sent back to design.
 */
function bigLoopGate(graph: LoadedGraph, goal: GraphNode): GateItem[] {
  const set = bigLoopSet(graph, goal)
  const directions = directionsOf(graph)
  return [
    {
      key: 'framework',
      label: '框架（设计决策）',
      ok: frameworkOf(graph, goal).length + set.filter(node => node.type === 'decision').length > 0,
      hint: DECISION_HINT.replace('a decision node under the goal', 'the framework as a decision node directly under the goal'),
    },
    {
      key: 'directions',
      label: '人定过的方向清单',
      ok: directions !== undefined && (directions.acceptance ?? []).length > 0,
      hint: `propose a norm node with the id ${DIRECTIONS_ID} under the goal; each acceptance item is a product direction the human decided`,
    },
    ...setItems(graph, goal, set, waitingQuestions(graph, descendants(graph, goal).filter(node => !belowModule(graph, node)), set)),
  ]
}

/**
 * The release gate of a goal in its design (§3.3.2, §3.14.2): for a goal that
 * is split into modules the gate of the framework, the module list and the
 * directions, else the six items of the release of the whole design: at least
 * one proposed design decision, which also makes the release set non-empty;
 * five columns on every proposed decision; acceptance on every proposed task;
 * no undecided question in the subtree, whoever decides it; no proposal with a
 * supersedes edge.
 */
export function releaseGate(graph: LoadedGraph, goal: GraphNode): GateItem[] {
  return isSplit(graph, goal) ? bigLoopGate(graph, goal) : singleGate(graph, goal)
}

/** Whether a stage write sent the node back to design from release or later (§3.14.3). */
function sentBackToDesign(node: GraphNode): boolean {
  return node.history.some((entry) => {
    const change = entry.changes?.stage
    return change?.to === 'design' && typeof change.from === 'string' && STAGES.indexOf(change.from as Stage) >= STAGES.indexOf('release')
  })
}

/**
 * The release gate of one module of a split goal (§3.14.3), for a module in
 * design whose goal has released the framework: something to release, a design
 * decision directly under it, the five columns of each decision in its
 * set, the acceptance of each task in it, no question left open below it or
 * cited by it, no superseding proposal. The first item is the goal's: the
 * framework, the module list and the directions are released (the goal is at
 * release or later). Something to release is a proposal below the module, or
 * a design that is approved already and waits for the stage only: a module
 * sent back to design, whose change is on the graph, or one whose release
 * stopped after the approvals.
 */
export function moduleReleaseGate(graph: LoadedGraph, goal: GraphNode, module: GraphNode): GateItem[] {
  const set = moduleSet(graph, module)
  const below = descendants(graph, module)
  const stage = effectiveStage(goal)
  return [
    {
      key: 'framework-released',
      label: '项目的框架、模块清单和方向',
      ok: stage !== null && STAGES.indexOf(stage) >= STAGES.indexOf('release'),
      hint: 'release the framework, the module list and the directions first (propose_to_human kind release without module)',
    },
    {
      key: 'changes',
      label: '要放行的内容',
      ok: set.length > 0 || sentBackToDesign(module) || below.some(adopted),
      hint: `graph_propose the design of ${module.id} (decisions, features, tasks) as children of the module: nothing proposed waits for release`,
    },
    {
      key: 'decision',
      label: '模块自己的设计决策',
      ok: below.some(node => node.type === 'decision' && node.parent === module.id && !GONE.has(node.status)),
      hint: DECISION_HINT.replace('under the goal', `directly under ${module.id}`),
    },
    ...setItems(graph, module, set, waitingQuestions(graph, below, set)),
  ]
}
/** Where a goal stands in the design loop and what keeps it from leaving its stage. */
export function stageStatus(graph: LoadedGraph, goal: GraphNode): StageStatus {
  const stage = effectiveStage(goal)
  const leaving = stage === 'wish' || stage === 'interview' || stage === 'design'
  const items = stage === 'wish' || stage === 'interview'
    ? [...requirementCard(graph, goal), ...supersedesItem(goal, 'goal:supersedes', HUMAN_SUPERSEDES)]
    : stage === 'design' ? releaseGate(graph, goal) : []
  return {
    goal: goal.id,
    stage,
    closed: isClosed(goal),
    items,
    exitReady: leaving && items.every(item => item.ok),
    waitingHuman: descendants(graph, goal).filter(waitsForHuman).length,
  }
}
