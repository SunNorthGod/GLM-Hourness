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
import type { LoadedGraph } from './parse.ts'
import { ancestorsOf, childrenIndex, subtreeOf, waitsForHuman } from './projection.ts'
import type { GraphNode, Stage, Status } from './schema.ts'

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
      ok: below.some(node => node.type === 'question' && node.status === 'done' && node.decision !== undefined && lastDecidedByHuman(node)),
      hint: 'interview step 7 (two or three ways with their trade-offs, the recommendation last): ask the human with decision_card; a question the agent decided on its own does not count',
    },
  ]
}

const COLUMN_LABELS = ['理由', '架构', '查过的现成方案']

/** The five columns of a design decision (§4.3): reason and architecture in its body, acceptance, plan, non-goals. */
export function designColumns(graph: LoadedGraph, goal: GraphNode, decision: GraphNode): readonly GateItem[] {
  const sections = labeledSections(decision.body, COLUMN_LABELS)
  const id = decision.id
  const plan = descendants(graph, goal).filter(node => !GONE.has(node.status) && (node.edges ?? []).some(edge => edge.type === 'source' && edge.to === id))
  return [
    { key: `${id}:reason`, label: '理由', ok: filled(sections, '理由'), hint: `a line "理由：" with why this design, in the body of ${id}` },
    {
      key: `${id}:architecture`,
      label: '架构（含查过的现成方案）',
      ok: filled(sections, '架构') && filled(sections, '查过的现成方案'),
      hint: `both "架构：" (how it works) and "查过的现成方案：" (the existing solutions checked and why they are not used) in the body of ${id}`,
    },
    { key: `${id}:acceptance`, label: '目标（验收条件）', ok: (decision.acceptance ?? []).length > 0, hint: `set acceptance on ${id}: checkable criteria for the effect` },
    { key: `${id}:plan`, label: '规划', ok: plan.length > 0, hint: `graph_propose the planned features and tasks under the goal, each with a source edge to ${id}` },
    { key: `${id}:non-goals`, label: '非目标', ok: (decision.nonGoals ?? []).length > 0, hint: `set nonGoals on ${id}: what this design does not do` },
  ]
}

/**
 * What a release approves (§3.3.2 item 2): every proposed node in the
 * goal's subtree but the goal, by depth, then creation time (first history
 * entry), then id, so a parent comes before its children.
 */
export function releaseSet(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[] {
  const depth = (node: GraphNode): number => ancestorsOf(graph, node).length
  const created = (node: GraphNode): string => node.history[0]?.at ?? ''
  return descendants(graph, goal)
    .filter(node => node.status === 'proposed')
    .sort((a, b) => depth(a) - depth(b) || compareText(created(a), created(b)) || compareText(a.id, b.id))
}

/** A proposal with a supersedes edge blocks: approving it would supersede nodes the card does not show (design §3.3.2 item 6). */
function supersedesItem(node: GraphNode, key: string, hint: string): GateItem[] {
  return (node.edges ?? []).some(edge => edge.type === 'supersedes') ? [{ key, label: `「${node.title}」取代旧节点`, ok: false, hint }] : []
}

const HUMAN_SUPERSEDES = 'superseding a node needs the human: they approve it in the panel, or say so in the chat and you relay their words'

/**
 * The release gate (§3.3.2): at least one proposed design decision, which
 * also makes the release set non-empty; five columns on every proposed
 * decision; acceptance on every proposed task; no undecided question in
 * the subtree, whoever decides it; no proposal with a supersedes edge.
 */
function releaseGate(graph: LoadedGraph, goal: GraphNode): GateItem[] {
  const set = releaseSet(graph, goal)
  const decisions = set.filter(node => node.type === 'decision')
  const undecided = descendants(graph, goal).filter(node => node.type === 'question' && (node.status === 'approved' || node.status === 'doing'))
  return [
    {
      key: 'decision',
      label: '设计决策',
      ok: decisions.length > 0,
      hint: 'graph_propose a decision node under the goal with the five columns: "理由：", "架构：" and "查过的现成方案：" in its body, acceptance, nonGoals, and planned nodes with a source edge to it',
    },
    ...decisions.flatMap(decision => designColumns(graph, goal, decision)),
    ...set.filter(node => node.type === 'task').map(task => ({
      key: `${task.id}:acceptance`, label: `任务「${task.title}」的验收条件`, ok: (task.acceptance ?? []).length > 0, hint: `set acceptance on ${task.id}: how to tell it is done`,
    })),
    ...undecided.map(question => ({
      key: `${question.id}:undecided`,
      label: `待决「${question.title}」还没拍板`,
      ok: false,
      hint: question.decider === 'agent' ? `${question.id} is yours: decide it with graph_decide` : `the human decides ${question.id}: wait for their decision in the panel, or ask them with decision_card`,
    })),
    ...set.flatMap(node => supersedesItem(node, `${node.id}:supersedes`, `${HUMAN_SUPERSEDES}; or remove the edge and raise a question instead`)),
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
    closed: CLOSED.has(goal.status),
    items,
    exitReady: leaving && items.every(item => item.ok),
    waitingHuman: descendants(graph, goal).filter(waitsForHuman).length,
  }
}
