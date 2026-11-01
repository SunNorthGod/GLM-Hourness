/**
 * The main agent's stage reminder (docs/ORCHESTRATION.md §3.5, §4.8; decision
 * d-chat-not-cards): at a step that needs it, a short <system-reminder> after
 * the step's admitted messages says where the goal in the main agent's focus
 * stands in the design loop, what the stage asks of it and what is missing
 * before the goal can leave the stage. It is built from the graph
 * (src/graph/stage.ts, src/graph/modules.ts) and the focus the graph row
 * reports (src/graph/service.ts), never from the system prompt, so it follows
 * the graph. Whether the history already shows the current text is decided by
 * src/graph/digest-notice.ts, the rule the step projection uses: nothing is
 * added while the text is unchanged, a compaction or a goal round adds it
 * again.
 *
 * The interview is a talk in plain chat. The reminder names the one question
 * to ask next, taken from a table keyed by the requirement card's items;
 * what the human answers goes onto the graph as soon as it is had. Nothing
 * here names a question card: the tools that put a matter to the human are
 * propose_to_human and record_human_answer. A goal split into modules is
 * designed twice (docs/ORCHESTRATION.md §4.9): the reminder says which loop
 * the focus is in. The release lines of the two loops come with the release
 * gates of the later steps and are not written here.
 *
 * Reading the graph can fail; the step then goes without the reminder, the
 * failure is warned once per process and the session's row health says so.
 */
import { changeReason, digestOf, isGoalRound, noticeHistory, type DigestFacts } from '../graph/digest-notice.ts'
import { sentBack } from '../graph/execute-stage.ts'
import { isReleased, isSplit, modulesOf, moduleOf } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import type { GraphFocusService } from '../graph/service.ts'
import { goalOf, releaseSet, stageStatus, type GateItem } from '../graph/stage.ts'
import { loadGraph } from '../graph/store.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type UserNotice } from '../shared/dsh-min.ts'
import { DELEGATIONS_ID, DELEGATION_LIMIT, delegationKindOf } from '../shared/answer-marks.ts'
import type { HealthState } from '../shared/health.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'

/** Source kind of the persisted stage reminder. */
export const STAGE_SOURCE = 'glm-design-stage'

const STAGE_REASONS = ['compaction', 'goal-round', 'goal', 'changed'] as const
/** Why a reminder was added: the first rule of changeReason (src/graph/digest-notice.ts) that applied. */
type StageReason = typeof STAGE_REASONS[number]

/** Facts persisted in the notice source; later steps re-derive what the model was shown from them. */
interface StageFacts extends DigestFacts {
  /** The goal the reminder is about; empty when no goal is in focus. */
  readonly goal: string
  /** The goal's effective stage, `closed` for a closed goal, `none` for a goal outside the design loop or no goal. */
  readonly stage: string
  readonly reason: StageReason
}

/** What the reminder says about the focus, before the history decides whether to add it. */
export interface StageReminder {
  readonly goal: string
  readonly stage: string
  readonly text: string
  /** Something the reminder went without, for the row health. */
  readonly degraded?: string
}

/**
 * The line that tells the main agent how to interview: one or two questions
 * at a time, in the human's words, each answer onto the graph at once.
 */
export const INTERVIEW_METHOD = 'Interview the human in plain chat, one or two questions at a time, in their words: say 怎样算做成 for acceptance, 明确不做的 for non-goals, 最可能出岔子的地方 for risks, 不能改、不能花、不能冒的险 for constraints; guess first and write it as 「我猜你……，对吗？」 so they only correct it; write each answer to the graph as soon as you have it. These interview questions are asked in chat, not through propose_to_human.'

/** What the main agent asks next for one missing item of the requirement card: the interview step and the "Next:" line (`hint` is the item's hint). */
interface InterviewStep {
  readonly key: string
  readonly step: number
  readonly next: (hint: string) => string
}

const askLine = (question: string, tail = ''): ((hint: string) => string) => hint => `Next: ask 「${question}」${tail}, then ${hint}.`

/**
 * The interview steps by the key of a requirement card item (the order is
 * the tie-break between items of one step; the card's own order is not used,
 * it puts the constraints before the success). The questions are the text of
 * docs/ORCHESTRATION.md §4.2. The last step is not a question in those
 * words: it is the one fork only the human can decide.
 */
export const INTERVIEW_STEPS: readonly InterviewStep[] = [
  { key: 'need', step: 1, next: askLine('你想要什么', ' as an open question') },
  { key: 'problem', step: 2, next: askLine('做成以后，你的日子会有什么不一样') },
  { key: 'audience', step: 2, next: askLine('做成以后，你的日子会有什么不一样') },
  { key: 'acceptance', step: 3, next: askLine('你会怎么检查它真的做成了') },
  { key: 'non-goals', step: 4, next: askLine('有没有你明确不想要的', ' with your guesses in one line') },
  { key: 'constraints', step: 5, next: askLine('有没有不能改、不能花、不能冒的险') },
  { key: 'risks', step: 6, next: askLine('假如最后没做成，最可能是因为什么', ' with your three guesses in one line') },
  { key: 'choice', step: 7, next: () => 'Next: put the one fork only the human can decide with propose_to_human (kind question, form recommend or choose) and record their answer with record_human_answer; a question you decide on your own does not count.' },
]

const CONFIRM_NEXT = 'Next: put the requirement to the human with propose_to_human (kind confirm).'
const RELEASE_NEXT = 'Next: put the design to the human with propose_to_human (kind release).'

const DESIGN_FORMAT = 'Write each design decision with "理由：", "架构：" and "查过的现成方案：" lines in its body, acceptance and nonGoals; plan tasks under the goal with a source edge to the decision, every task with acceptance; a small project keeps its tasks directly under the goal, and only work with independent parts the human should release one by one is planned as features (modules) under the goal.'

const FRAMEWORK_FORMAT = 'The work is split into modules. Write the framework as design decisions under the goal (each with "理由：", "架构：" and "查过的现成方案：" lines, acceptance and nonGoals) and plan each module as a feature directly under the goal with a source edge to a framework decision; write the directions the human decided as the acceptance items of one norm node with the id norm-directions under the goal. A module\'s own decisions and tasks are written later, under the module.'

const DISPATCH_FOCUS = 'Before you dispatch a subagent that writes, graph_focus to the module or the task it belongs to.'

const MODULE_FORMAT = `Write this module's design decisions as children of the module (the same columns), its plan as features and tasks under the module, every task with acceptance; check the design against every direction in norm-directions and name in your report any it strains. ${DISPATCH_FOCUS}`

const RELEASED_LINE = 'The design is released. Tell the human in one line; decomposition and dispatch come next.'

const MODULES_RELEASED_LINE = `The framework, the module list and the directions are released. Each module starts in design: write its decisions and plan under it, check them against every direction in norm-directions, and put it to the human with propose_to_human (kind release, module <id>, page). Nothing under a module is built before that module is released. ${DISPATCH_FOCUS}`

const MODULE_RELEASED_LINE = 'This module is released. Tell the human in one line; decomposition and dispatch of this module come next.'

/** The module lines the reminder lists at most. */
const MODULE_LINES = 8

/** The missing item to ask about next: the smallest interview step, the table's order inside a step; undefined when no missing item has a step. */
export function nextInterviewItem(missing: readonly GateItem[]): { readonly item: GateItem, readonly line: string } | undefined {
  for (const entry of [...INTERVIEW_STEPS].sort((a, b) => a.step - b.step)) {
    const item = missing.find(candidate => candidate.key === entry.key)
    if (item !== undefined) return { item, line: entry.next(item.hint) }
  }
  return undefined
}

const itemLine = (item: GateItem): string => `- ${item.label}: ${item.hint}`

function quoted(title: string): string {
  return `"${title}"`
}

/** The reminder when the focus is not under a goal that can be worked on. */
function noGoal(focus: string | undefined, graph: LoadedGraph): StageReminder {
  const why = focus === undefined
    ? 'no goal is in your focus yet'
    : graph.nodes.has(focus) ? `your focus ${focus} has no goal above it` : `your focus ${focus} is not in the graph`
  return {
    goal: '',
    stage: 'none',
    text: [
      `Stage reminder: ${why}, so nothing you plan is released and the subagents you dispatch can only read.`,
      'If the human has just made a wish, propose the goal on the graph (interview step 1) and graph_focus it; otherwise graph_open lists the open work: graph_focus the goal, or the task it belongs to.',
    ].join('\n'),
  }
}

/** The lines of the interview stages: the method, the card's count, what is missing and the next question. */
function interviewLines(items: readonly GateItem[]): string[] {
  const card = items.filter(item => item.key !== 'goal:supersedes')
  const missing = items.filter(item => !item.ok)
  const next = nextInterviewItem(missing)
  const others = missing.filter(item => item !== next?.item)
  return [
    INTERVIEW_METHOD,
    `Requirement card: ${card.filter(item => item.ok).length} of ${card.length} filled.`,
    ...others.map(itemLine),
    ...next === undefined ? [] : [next.line],
    ...missing.length === 0 ? [CONFIRM_NEXT] : [],
  ]
}

/** The lines of a design stage that is not split: how to write, the five columns, what blocks the release. */
function designLines(graph: LoadedGraph, goal: GraphNode, items: readonly GateItem[], exitReady: boolean): string[] {
  // The columns of a decision are the items keyed `<decision id>:<column>`; a task's acceptance item has the same shape and is not one.
  const counts = releaseSet(graph, goal).filter(entry => entry.type === 'decision').map(decision => ({
    id: decision.id,
    filled: items.filter(item => item.key.startsWith(`${decision.id}:`) && item.ok).length,
  }))
  const fewest = [...counts].sort((a, b) => a.filled - b.filled || (a.id < b.id ? -1 : 1))[0]
  return [
    DESIGN_FORMAT,
    ...fewest === undefined ? [] : [`Design columns: ${counts.length} decision(s) proposed; ${fewest.id} has the fewest, ${fewest.filled} of 5.`],
    ...items.filter(item => !item.ok).map(itemLine),
    ...exitReady ? [RELEASE_NEXT] : [],
  ]
}
function moduleState(module: GraphNode): string {
  if (isReleased(module)) return '已放行'
  return sentBack(module) ? '退回设计' : '设计中'
}

/** One line per module, at most MODULE_LINES, the rest counted. */
function moduleLines(modules: readonly GraphNode[]): string[] {
  const shown = modules.slice(0, MODULE_LINES).map(module => `- ${module.title}（${module.id}）：${moduleState(module)}`)
  return modules.length > MODULE_LINES ? [...shown, `and ${modules.length - MODULE_LINES} more`] : shown
}

/**
 * What the reminder says for the node in focus, read from the graph: the
 * goal above it and the goal's stage, and for a goal split into modules the
 * module the focus is in. The release gates of the two loops are not read
 * here; a design stage lists the gate of an unsplit goal only.
 */
export function stageReminder(graph: LoadedGraph, focus: string | undefined): StageReminder {
  const reminder = reminderFor(graph, focus)
  const { line, degraded } = delegationsLine(graph)
  return { ...reminder, ...line === undefined ? {} : { text: `${reminder.text}\n${line}` }, ...degraded === undefined ? {} : { degraded } }
}

/**
 * The line that lists the kinds of matter the human handed to the main agent
 * for good (the node norm-delegations, written only by record_human_answer),
 * at the end of every reminder while there are any. It only reminds; a node
 * that cannot be read as the list goes without the line and the row health
 * says so.
 */
function delegationsLine(graph: LoadedGraph): { readonly line?: string, readonly degraded?: string } {
  const node = graph.nodes.get(DELEGATIONS_ID)
  if (node === undefined || node.status === 'dropped' || node.status === 'superseded') return {}
  if (node.type !== 'norm') return { degraded: `${DELEGATIONS_ID} 不是 norm 节点，提醒里没写交给主 Agent 定的几类事` }
  const kinds = (node.acceptance ?? []).slice(0, DELEGATION_LIMIT).map(delegationKindOf)
  if (kinds.length === 0) return {}
  return { line: `The human told you to decide these kinds yourself and only report them, while the matter can still be undone: ${kinds.join('；')}. To take one back, record_human_answer kind delegation with undo: true, that kind and their words.` }
}

function reminderFor(graph: LoadedGraph, focus: string | undefined): StageReminder {
  const node = focus === undefined ? undefined : graph.nodes.get(focus)
  const goal = node === undefined ? undefined : goalOf(graph, node.id)
  if (node === undefined || goal === undefined) return noGoal(focus, graph)
  const status = stageStatus(graph, goal)
  const head = `Stage reminder: goal ${goal.id} ${quoted(goal.title)}`
  const waiting = status.waitingHuman > 0 ? [`${status.waitingHuman} question(s) under this goal wait for the human's answer.`] : []
  const done = (stage: string, lines: readonly string[]): StageReminder => ({ goal: goal.id, stage, text: [...lines, ...waiting].join('\n') })
  if (status.closed) {
    return done('closed', [`${head} is ${goal.status}. A closed goal is not worked on: the subagents you dispatch can only read. graph_focus an open goal or task, or propose a new goal.`])
  }
  const stage = status.stage
  if (stage === null) return done('none', [`${head} does not run the design loop (it has no stage), so nothing here waits for a release.`])
  if (stage === 'wish' || stage === 'interview') {
    return done(stage, [`${head} is at stage ${stage}: the requirement is not confirmed yet.`, ...interviewLines(status.items)])
  }
  const split = isSplit(graph, goal)
  if (stage === 'design') {
    return done(stage, [`${head} is at stage design.`, ...split ? [FRAMEWORK_FORMAT] : designLines(graph, goal, status.items, status.exitReady)])
  }
  if (stage === 'release') {
    const module = moduleOf(graph, node)
    if (module !== undefined && modulesOf(graph, goal).includes(module)) {
      const lines = isReleased(module) ? [MODULE_RELEASED_LINE] : [MODULE_FORMAT]
      return done(stage, [`${head} is released; you work in module ${module.id} ${quoted(module.title)}, which is ${isReleased(module) ? 'released' : 'in design'}.`, ...lines])
    }
    if (split) return done(stage, [`${head} is at stage release.`, MODULES_RELEASED_LINE, ...moduleLines(modulesOf(graph, goal))])
    return done(stage, [`${head} is at stage release.`, RELEASED_LINE])
  }
  return done(stage, [`${head} is at stage ${stage}, which does not belong to the design loop.`])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function noticeFacts(value: unknown): StageFacts | undefined {
  if (!isRecord(value)) return undefined
  const { goal, stage, digest, anchor, reason } = value
  if (typeof goal !== 'string' || typeof stage !== 'string' || typeof digest !== 'string' || !STAGE_REASONS.includes(reason as StageReason)) return undefined
  if (anchor !== undefined && typeof anchor !== 'string') return undefined
  return { goal, stage, digest, ...(anchor === undefined ? {} : { anchor }), reason: reason as StageReason }
}

/** The notice this step needs, or undefined when the history already shows the reminder. */
export function stageNotice(history: readonly DerivedMessage[], admitted: readonly unknown[], reminder: StageReminder): UserNotice | undefined {
  const state = noticeHistory(history, STAGE_SOURCE, source => noticeFacts(source.designStage))
  const digest = digestOf(reminder.text)
  const reason = changeReason(state, { digest, goalRound: admitted.some(isGoalRound), sameSubject: notice => notice.goal === reminder.goal }, 'goal')
  if (reason === undefined) return undefined
  const anchor = state.checkpoint?.id
  const facts: StageFacts = { goal: reminder.goal, stage: reminder.stage, digest, ...(anchor === undefined ? {} : { anchor }), reason }
  return createUserNotice(STAGE_SOURCE, `stage reminder for ${reminder.goal === '' ? 'no goal' : reminder.goal} at ${reminder.stage} (${reason})`, wrapSystemReminder(reminder.text), { designStage: facts })
}

/** What the row hands to the installer. */
export interface StageNoticeDeps {
  /** Whether this step's assembly decided the agent is the main agent. */
  readonly eligible: () => boolean
  /** The graph row's service; undefined while the row is off. */
  readonly graph: () => GraphFocusService | undefined
  /** Report the row health of the agent's session. */
  readonly report: (agent: AgentLike, state: HealthState, reason: string) => void
}

let warnedRead = false

function warnOnce(agent: AgentLike, why: string): void {
  if (warnedRead) return
  warnedRead = true
  console.warn(`dsh-glm-hourness/design: the stage reminder is skipped for agent ${agent.id}: ${why}`)
}

/**
 * Install the stage reminder on one agent through the shared step notice
 * seam (src/shared/step-notice.ts). Returns undefined, installing nothing,
 * when the agent has no session history.
 */
export function installStageNotice(agent: AgentLike, deps: StageNoticeDeps): (() => void) | undefined {
  return installStepNotice(agent, 'stage reminder', deps.eligible, async (history, { admitted, session }) => {
    try {
      const graph = deps.graph()
      const dir = graph?.dirFor(session.header.cwd)
      if (graph === undefined || dir === undefined) throw new Error('the graph row does not say where the project graph is or what the session has in focus')
      const reminder = stageReminder(await loadGraph(dir), graph.focusOf(session))
      if (reminder.degraded !== undefined) deps.report(agent, 'degraded', reminder.degraded)
      return stageNotice(history, admitted, reminder)
    }
    catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      warnOnce(agent, why)
      deps.report(agent, 'degraded', `阶段提醒这一步没带上：读不到图或焦点（${why}）`)
      return undefined
    }
  }, 'design')
}
