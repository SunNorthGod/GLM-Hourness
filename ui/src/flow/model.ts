/**
 * Text of the flow bar (docs/ORCHESTRATION.md §4.8): the one line above the
 * composer of the main-agent session that says which stage of the design
 * loop the current goal is in, what is still missing and whether the main
 * agent is waiting for the human, and the reminder to switch to a stronger
 * model when the main agent runs on a small one. Pure functions over the
 * session's projection values and the graph, so the tests drive them
 * without a renderer. Every string a human reads on the bar is here
 * (FlowBar.tsx has none), so a change of wording touches this file alone.
 * The bar only shows; it has no click target but the model reminder's
 * dismissal.
 */
import { STAGE_LABELS } from '../../../src/graph/labels.ts'
import type { LiveView } from '../../../src/graph/live.ts'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { GraphNode, Stage } from '../../../src/graph/schema.ts'
import { designColumns, effectiveStage, goalOf, releaseSet, requirementCard, stageStatus } from '../../../src/graph/stage.ts'
import type { GraphSnapshot } from '../graph/source.ts'

/** Slot id and order of the bar above the composer: DSH's todo strip is 0, the goal bar 10, the queue strip 20; the /wish card (40) follows it. */
export const FLOW_ID = 'hourness-flow'
export const FLOW_ORDER = 30

/** Words of the bar, in the order they are read. */
export const FLOW_TEXT = {
  name: '主 Agent',
  separator: ' · ',
  /** The slot's label in DSH's slot registry. */
  slotLabel: '主 Agent 流程',
  region: '主 Agent 流程条',
  loading: '读取项目图中',
  noGraph: '这个工作区还没有项目图',
  graphFailed: '读不到项目图',
  stageUnreadable: '读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）',
  noGoal: '还没有目标',
  released: '已放行',
  noDecision: '还没有设计决策',
  waitConfirm: '等你确认',
  waitApprove: '等你批准',
  waitDecide: '等你拍板',
  dismiss: '这次就用它',
  closed: (title: string): string => `${title}（已关闭）`,
  requirementCard: (ok: number, total: number): string => `需求卡 ${ok}/${total}`,
  columns: (ok: number, total: number): string => `五栏 ${ok}/${total}`,
  pendingDecisions: (count: number): string => `待你拍板 ${count}`,
  cheapModel: (model: string): string => `现在是 ${model}；主 Agent 建议换强一点的模型`,
} as const

/** The tool a main agent hands something to the human with (M3 addendum §3.4, registered by the design row); its result is the last thing in `recent` while the agent waits. */
const PROPOSE_TOOL = 'propose_to_human'

/** Words that mark a small model in its id (plain-ui 0.4 §7.5.5). */
const CHEAP_WORDS: ReadonlySet<string> = new Set(['flash', 'mini', 'lite', 'haiku', 'small', 'nano'])

/**
 * Whether a model id names a small model: lower-cased, split into words at
 * - _ . / : and white space, and one word is flash, mini, lite, haiku,
 * small or nano. Whole words, not substrings: gemini-2.5-pro has the
 * letters "mini" and is not small. An id that is not a string, or that no
 * word marks, is not reminded about.
 */
export function isCheapModel(model: unknown): boolean {
  if (typeof model !== 'string') return false
  return model.toLowerCase().split(/[-_./:\s]+/).some(word => CHEAP_WORDS.has(word))
}

export interface FlowBarInput {
  /** The session is in main-agent mode (mainAgentActive of its projection values). */
  readonly main: boolean
  /** The session's graphLive view; undefined when the graph-panel row is off or the value has not arrived. */
  readonly live: LiveView | undefined
  readonly graph: GraphSnapshot
  /** The reminder to switch models is wanted: the model is a small one and the human has not dismissed it for this session. */
  readonly cheapModel: boolean
}

export interface FlowBarText {
  readonly line: string
  /** The main agent has handed something over and waits for the human, or the graph has questions waiting. */
  readonly waiting: boolean
  /** The second, warning line, when the reminder applies. */
  readonly modelNote: string | null
}

type Wait = 'confirm' | 'approve' | 'decide' | null

/**
 * What the main agent waits for. It has handed something over when it is
 * between turns and the last tool result it got is propose_to_human's (ok);
 * the stage says what that was: the requirement card in the wish and
 * interview stages, the release in the design stage. When questions wait
 * for the human it is the questions, whichever the stage (the live view
 * does not carry the kind of the proposal). Other stages show no wait: a
 * split project's bar reads the project level only.
 */
function waitOf(live: LiveView, stage: Stage | null, pending: number): Wait {
  if (live.turnSince !== null) return null
  const last = live.recent.at(-1)
  if (last === undefined || last.name !== PROPOSE_TOOL || !last.ok) return null
  if (pending > 0) return 'decide'
  if (stage === 'wish' || stage === 'interview') return 'confirm'
  return stage === 'design' ? 'approve' : null
}

const WAIT_TEXT: Readonly<Record<Exclude<Wait, null>, string>> = {
  confirm: FLOW_TEXT.waitConfirm,
  approve: FLOW_TEXT.waitApprove,
  decide: FLOW_TEXT.waitDecide,
}

/** The design stage's count: the decision with the fewest of its five columns filled; the text when there is no decision yet. */
function columnsText(graph: LoadedGraph, goal: GraphNode): string {
  const counts = releaseSet(graph, goal)
    .filter(node => node.type === 'decision')
    .map(decision => {
      const columns = designColumns(graph, goal, decision)
      return { ok: columns.filter(item => item.ok).length, total: columns.length }
    })
  if (counts.length === 0) return FLOW_TEXT.noDecision
  const fewest = counts.reduce((least, count) => (count.ok < least.ok ? count : least))
  return FLOW_TEXT.columns(fewest.ok, fewest.total)
}

function barLine(parts: readonly string[]): string {
  return [FLOW_TEXT.name, ...parts].join(FLOW_TEXT.separator)
}

/**
 * The bar's text, or null when the session is not the main agent's (the
 * component then renders nothing). Without the live view the bar cannot
 * tell the focus, so it says so; with it, the current goal is the focus's
 * own goal or its nearest goal ancestor (goalOf), its stage the effective
 * one (effectiveStage) and the counts the gates' own (stage.ts).
 */
export function flowBarText(input: FlowBarInput): FlowBarText | null {
  if (!input.main) return null
  const { live, graph } = input
  const plain = (text: string): FlowBarText => ({ line: barLine([text]), waiting: false, modelNote: null })
  if (live === undefined) return plain(FLOW_TEXT.stageUnreadable)
  const modelNote = input.cheapModel && live.model !== null ? FLOW_TEXT.cheapModel(live.model) : null
  const note = (text: FlowBarText): FlowBarText => ({ ...text, modelNote })
  if (graph.status === 'loading') return note(plain(FLOW_TEXT.loading))
  if (graph.status === 'missing') return note(plain(FLOW_TEXT.noGraph))
  if (graph.status === 'failed') return note(plain(FLOW_TEXT.graphFailed))
  const goal = live.focus === null ? undefined : goalOf(graph.graph, live.focus)
  if (goal === undefined) return note(plain(FLOW_TEXT.noGoal))
  const status = stageStatus(graph.graph, goal)
  if (status.closed) return note(plain(FLOW_TEXT.closed(goal.title)))
  const stage = effectiveStage(goal)
  const wait = waitOf(live, stage, status.waitingHuman)
  const head: string[] = []
  if (stage === null) head.push(goal.title)
  else if (stage === 'release') head.push(FLOW_TEXT.released)
  else if (stage === 'wish' || stage === 'interview') {
    const card = requirementCard(graph.graph, goal)
    head.push(STAGE_LABELS[stage], FLOW_TEXT.requirementCard(card.filter(item => item.ok).length, card.length))
  }
  else if (stage === 'design') head.push(STAGE_LABELS[stage], columnsText(graph.graph, goal))
  else head.push(STAGE_LABELS[stage])
  const tail = wait !== null ? [WAIT_TEXT[wait]] : status.waitingHuman > 0 ? [FLOW_TEXT.pendingDecisions(status.waitingHuman)] : []
  return { line: barLine([...head, ...tail]), waiting: tail.length > 0, modelNote }
}
