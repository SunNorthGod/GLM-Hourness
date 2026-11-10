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
 * the focus is in, what is missing before the framework or the module can be
 * put to the human, and the release that comes next. The user graph (user
 * graph design 0.4.1 §5.1–§5.4) adds a line at the interview, the design and
 * after the release, and one line that sums up its gaps while it has any.
 * While the execute row's service is present (M7 design 0.6 §3.9.2, §3.8.1,
 * §3.8.5), the release line says the drive has started and the derived
 * stage's segment (decompose, execute, merge) follows, a module back in
 * design says what that stops, and the design stage asks for
 * norm-merge-gate and norm-review-floor when the graph has neither.
 *
 * Reading the graph can fail; the step then goes without the reminder, the
 * failure is warned once per process and the session's row health says so.
 */
import { changeReason, digestOf, isGoalRound, noticeHistory, type DigestFacts } from '../graph/digest-notice.ts'
import { derivedStage, sentBack } from '../graph/execute-stage.ts'
import { isReleased, isSplit, modulesOf, moduleOf } from '../graph/modules.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import type { GraphFocusService } from '../graph/service.ts'
import { bigLoopSet, effectiveStage, goalOf, moduleReleaseGate, releaseSet, stageStatus, type GateItem } from '../graph/stage.ts'
import { loadGraph } from '../graph/store.ts'
import { userGraphOf, type Gap, type GapKey } from '../graph/user-graph.ts'
import { createUserNotice, type AgentLike, type DerivedMessage, type UserNotice } from '../shared/dsh-min.ts'
import { DELEGATIONS_ID, DELEGATION_LIMIT, delegationKindOf } from '../shared/answer-marks.ts'
import type { HealthState } from '../shared/health.ts'
import { installStepNotice } from '../shared/step-notice.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { DRIVE_START_MARK } from '../execute/tiers.ts'

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
  // Step 2b (user graph design 0.4.1 §5.1): after the problem and the audience, the same step number, the table's order.
  { key: 'flows', step: 2, next: askLine('谁会用它，他们进来先做什么', ' with your guess of who uses it, written as 「我猜用它的有……，对吗？」') },
  { key: 'acceptance', step: 3, next: askLine('你会怎么检查它真的做成了') },
  { key: 'non-goals', step: 4, next: askLine('有没有你明确不想要的', ' with your guesses in one line') },
  { key: 'constraints', step: 5, next: askLine('有没有不能改、不能花、不能冒的险') },
  { key: 'risks', step: 6, next: askLine('假如最后没做成，最可能是因为什么', ' with your three guesses in one line') },
  { key: 'choice', step: 7, next: () => 'Next: put the one fork only the human can decide with propose_to_human (kind question, form recommend or choose) and record their answer with record_human_answer; a question you decide on your own does not count.' },
]

const CONFIRM_NEXT = 'Next: put the requirement to the human with propose_to_human (kind confirm).'
const RELEASE_NEXT = 'Next: put the design to the human with propose_to_human (kind release).'
const FRAMEWORK_NEXT = 'Next: put the framework, the module list and the directions to the human with propose_to_human (kind release, page listing them).'
const moduleNext = (id: string): string => `Next: put this module to the human with propose_to_human (kind release, module ${id}, page: one page in plain words).`

/** The line that asks for the likeliest reason a design fails: not a column of the gate, said in plain words when the design is put to the human. */
const FAILURE_LINE = 'Optionally add a line "如果失败：<the likeliest reason it fails>" to a decision body; when you put the design to the human, say it in plain words in your report.'

const DESIGN_FORMAT = 'Write each design decision with "理由：", "架构：" and "查过的现成方案：" lines in its body, acceptance and nonGoals; plan tasks under the goal with a source edge to the decision, every task with acceptance; a small project keeps its tasks directly under the goal, and only work with independent parts the human should release one by one is planned as features (modules) under the goal.'

const FRAMEWORK_FORMAT = 'The work is split into modules. Write the framework as design decisions under the goal (each with "理由：", "架构：" and "查过的现成方案：" lines, acceptance and nonGoals) and plan each module as a feature directly under the goal with a source edge to a framework decision; write the directions the human decided as the acceptance items of one norm node with the id norm-directions under the goal. A module\'s own decisions and tasks are written later, under the module.'

const DISPATCH_FOCUS = 'Before you dispatch a subagent that writes, graph_focus to the module or the task it belongs to.'

const MODULE_FORMAT = `Write this module's design decisions as children of the module (the same columns), its plan as features and tasks under the module, every task with acceptance; check the design against every direction in norm-directions and name in your report any it strains. ${DISPATCH_FOCUS}`

const RELEASED_LINE = 'The design is released. Tell the human in one line; decomposition and dispatch come next.'

const MODULES_RELEASED_LINE = `The framework, the module list and the directions are released. Each module starts in design: write its decisions and plan under it, check them against every direction in norm-directions, and put it to the human with propose_to_human (kind release, module <id>, page). Nothing under a module is built before that module is released. ${DISPATCH_FOCUS}`

const MODULE_RELEASED_LINE = 'This module is released. Tell the human in one line; decomposition and dispatch of this module come next.'

// ---- the lines of the execute row (M7 design 0.6 §3.9.2, §3.8.1, §3.8.5), only while its service is present ----

/** The release line once the drive runs (§3.9.2). */
const DRIVE_RELEASED_LINE = 'The design is released and the harness has started the drive: decompose into tasks with dispatch attributes and dispatch them; do not wait for the person.'

/** Authored (M7 E8 D9): the derived stage decompose. */
const DECOMPOSE_LINE = 'Stage decompose: nothing here is ready to dispatch. Split the released work into tasks under it (graph_propose type task, each with acceptance, kind, writeScope and worktree; depends edges where order matters), then dispatch the ready ones with dispatch_task, choosing a model and saying why.'

/** Authored (M7 E8 D9): the derived stage execute. */
const EXECUTE_LINE = 'Stage execute: dispatch the ready tasks with dispatch_task (choose a model and say why), answer worker requests with answer_worker, and dispatch the review of each task that is handed back; the dispatch status notice lists what runs and what waits.'

/** The merge stage (§3.9.2, verbatim); `<trunk>` is filled in. */
const mergeLine = (trunk: string): string => `To integrate a reviewed task: in its worktree rebase onto ${trunk} (dispatch a worker if it conflicts), squash into one commit whose message starts with "<id>: <title>" and ends with "Hourness-Task: <id>", run check_commit on it, then git merge --ff-only it in the main checkout and push without --force. Several tasks may share one commit with one trailer line each. Commit the graph files you changed through the graph tools the same way (on a branch, check_commit, fast-forward); when norm-merge-gate has an only line that covers docs/graph/, you may commit them on ${trunk} directly. To take in commits pushed elsewhere: git fetch <upstream>, run check_commit on <upstream>/${trunk}, then git merge --ff-only it; git pull on ${trunk} is refused.`

/** A module back in design (§3.9.2, verbatim). */
const moduleBackLine = (id: string): string => `Module ${id} went back to design: write its decisions and plan again and put its release page to the person; nothing in it is dispatched until then.`

/** §3.8.1, verbatim: a graph without norm-merge-gate. */
const MERGE_GATE_LINE = 'Before release, propose norm-merge-gate under the goal: read the project\'s build and test setup and list each command as `$ <command>`.'

/** Authored (M7 E8 D9, §3.8.5): a graph without norm-review-floor. */
const REVIEW_FLOOR_LINE = 'Before release, propose norm-review-floor under the goal: one acceptance item per kind of change that must be fully reviewed, in plain words, each ending with its form in backticks: `files <paths>`, `deletes`, `commands <commands>` or `outside`.'

/** The trunk the drive named in its newest start comment (「自动推进已开始 … · 主干 <branch>」), else `the main branch`. */
function trunkOf(goal: GraphNode): string {
  const start = goal.history.filter(entry => entry.op === 'comment' && entry.text?.includes(DRIVE_START_MARK) === true).at(-1)
  return /· 主干 (\S+)/.exec(start?.text ?? '')?.[1] ?? 'the main branch'
}

/** The segment of a derived stage (§3.9.2); none for the others. */
function stageSegment(graph: LoadedGraph, goal: GraphNode, node: GraphNode): string[] {
  const stage = derivedStage(graph, node)
  if (stage === 'decompose') return [DECOMPOSE_LINE]
  if (stage === 'execute') return [EXECUTE_LINE]
  if (stage === 'merge') return [mergeLine(trunkOf(goal))]
  return []
}

/** The two norm sentences of the design stage: one for each norm node the graph does not have. */
function normLines(graph: LoadedGraph): string[] {
  return [...graph.nodes.has('norm-merge-gate') ? [] : [MERGE_GATE_LINE], ...graph.nodes.has('norm-review-floor') ? [] : [REVIEW_FLOOR_LINE]]
}

/** A module that went back to design and is still there. */
const backInDesign = (module: GraphNode): boolean => effectiveStage(module) === 'design' && sentBack(module)

/** The module lines the reminder lists at most. */
const MODULE_LINES = 8

/** The interview's line on the user graph (user graph design 0.4.1 §5.1): how to draw it, how many, in whose words. */
export const USER_INTERVIEW_LINE = 'Interview step 2b draws who uses it and what they do, as your own proposals without relay and in the human\'s words: 1 to 4 roles under the goal (graph_propose type role), 2 to 8 flows under each role (type flow, acceptance: what the user has when it is done), 3 to 10 steps under each flow (type step, acceptance: what the user sees when the step is done); graph_link type next from each flow to its first step and from each step to the next, with when on every branch. A step is something a user does or sees at the edge of the product, never an internal module. A goal with no end user gets a line "用户流程：无，<reason>" in its body instead.'

/** The design's line on the user graph (§5.2, §5.3): what its release asks of it. */
export const USER_DESIGN_LINE = 'The user graph is released with this design: every step needs acceptance and a module, feature or task that builds it (graph_link type serves from that work to the step); every flow a line "走法：<命令|截图|终端> · 预计 <N> 秒" or "走法：你来走" in its body, and norm-merge-gate a line walk <kind> $ <command with {flow}> for each automatic kind; a module serves at least one step or says "服务：无，<reason>" in its body. The harness appends who owns each flow and the walk commands to the release page.'

/** The line after a release on the user graph (§5.4, §11 M3 request ⑤): how the decomposition links to the steps. */
export const USER_RELEASE_LINE = 'When you decompose, link each task to the steps it builds with graph_link type serves; a flow walked by 命令, 截图 or 终端 needs a task of kind test, linked only to steps that already have task-level serves.'

/** The gaps the interview itself closes (§2.6): the shape of the flows and what each step looks like done. Who builds a step and how a flow is walked wait for the design. */
const INTERVIEW_GAPS: ReadonlySet<GapKey> = new Set(['role:no-flow', 'flow:empty', 'flow:entry', 'flow:unreachable', 'step:branch', 'step:next-dropped', 'step:no-expect', 'flow:too-long', 'step:too-many-branches'])

/** One line that sums the gaps up: how many, and the first with its way forward. */
function gapLine(gaps: readonly Gap[]): string[] {
  const first = gaps[0]
  return first === undefined ? [] : [`User graph: ${gaps.length} gap(s); the first, ${first.key} on ${first.nodes.join(', ')} (${first.text}): ${first.hint}.`]
}

/**
 * The user graph's lines of a stage (§1.4 item 31): the interview's line
 * always, with the gaps it closes; the design's and the release's only for a
 * goal with a user graph, with all its gaps. Read from the graph, so a
 * reminder whose gaps did not change is the same text and is not added again.
 */
function userGraphLines(graph: LoadedGraph, goal: GraphNode, at: 'interview' | 'design' | 'release'): string[] {
  const ug = userGraphOf(graph, goal)
  if (at === 'interview') return [USER_INTERVIEW_LINE, ...gapLine(ug.gaps.filter(gap => INTERVIEW_GAPS.has(gap.key)))]
  if (!ug.present) return []
  return [at === 'design' ? USER_DESIGN_LINE : USER_RELEASE_LINE, ...gapLine(ug.gaps)]
}

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

/** The lines of a design stage: how to write, the five columns, what blocks the release and the release that comes next; for a goal split into modules those of the framework, the module list and the directions. */
function designLines(graph: LoadedGraph, goal: GraphNode, items: readonly GateItem[], exitReady: boolean, split: boolean): string[] {
  // The columns of a decision are the items keyed `<decision id>:<column>`; a task's acceptance item has the same shape and is not one.
  const counts = (split ? bigLoopSet(graph, goal) : releaseSet(graph, goal)).filter(entry => entry.type === 'decision').map(decision => ({
    id: decision.id,
    filled: items.filter(item => item.key.startsWith(`${decision.id}:`) && item.ok).length,
  }))
  const fewest = [...counts].sort((a, b) => a.filled - b.filled || (a.id < b.id ? -1 : 1))[0]
  return [
    split ? FRAMEWORK_FORMAT : DESIGN_FORMAT,
    FAILURE_LINE,
    ...fewest === undefined ? [] : [`Design columns: ${counts.length} decision(s) proposed; ${fewest.id} has the fewest, ${fewest.filled} of 5.`],
    ...items.filter(item => !item.ok).map(itemLine),
    ...exitReady ? [split ? FRAMEWORK_NEXT : RELEASE_NEXT] : [],
  ]
}

/** The lines of a module in design: how to write it, what blocks its release and the release that comes next. */
function moduleDesignLines(graph: LoadedGraph, goal: GraphNode, module: GraphNode): string[] {
  const missing = moduleReleaseGate(graph, goal, module).filter(item => !item.ok)
  return [MODULE_FORMAT, FAILURE_LINE, ...missing.map(itemLine), ...missing.length === 0 ? [moduleNext(module.id)] : []]
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
export function stageReminder(graph: LoadedGraph, focus: string | undefined, executeOn = false): StageReminder {
  const reminder = reminderFor(graph, focus, executeOn)
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

/**
 * With the execute row on (`executeOn`, M7 E8 D10): the release line says
 * the drive has started and the derived stage's segment follows; a module
 * back in design says so; a hand-written decompose, execute or merge stage
 * reads like a release; the design stage asks for the norm nodes the graph
 * lacks. Without it every text is the design loop's own.
 */
function reminderFor(graph: LoadedGraph, focus: string | undefined, executeOn: boolean): StageReminder {
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
    return done(stage, [`${head} is at stage ${stage}: the requirement is not confirmed yet.`, ...interviewLines(status.items), ...userGraphLines(graph, goal, 'interview')])
  }
  const split = isSplit(graph, goal)
  if (stage === 'design') {
    return done(stage, [`${head} is at stage design.`, ...designLines(graph, goal, status.items, status.exitReady, split), ...executeOn ? normLines(graph) : [], ...userGraphLines(graph, goal, 'design')])
  }
  if (stage === 'release' || (executeOn && (stage === 'decompose' || stage === 'execute' || stage === 'merge'))) {
    const module = moduleOf(graph, node)
    const user = userGraphLines(graph, goal, 'release')
    if (module !== undefined && modulesOf(graph, goal).includes(module)) {
      const back = executeOn && backInDesign(module) ? [moduleBackLine(module.id)] : []
      const lines = isReleased(module) ? [MODULE_RELEASED_LINE, ...executeOn ? stageSegment(graph, goal, module) : []] : [...back, ...moduleDesignLines(graph, goal, module)]
      return done(stage, [`${head} is released; you work in module ${module.id} ${quoted(module.title)}, which is ${isReleased(module) ? 'released' : 'in design'}.`, ...lines, ...user])
    }
    if (split) {
      const modules = modulesOf(graph, goal)
      const back = executeOn ? modules.filter(backInDesign).map(entry => moduleBackLine(entry.id)) : []
      return done(stage, [`${head} is at stage ${stage}.`, MODULES_RELEASED_LINE, ...moduleLines(modules), ...back, ...user])
    }
    if (executeOn) return done(stage, [`${head} is at stage ${stage}.`, DRIVE_RELEASED_LINE, ...stageSegment(graph, goal, goal), ...user])
    return done(stage, [`${head} is at stage release.`, RELEASED_LINE, ...user])
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
  /** The takeover's answer for a goal of the project at `cwd` (src/bootstrap/service.ts `holds`): true when the open takeover of an existing project or of the gaps steers it; false while the takeover row is off. */
  readonly holds: (cwd: string, goalId: string) => boolean
  /** Report the row health of the agent's session. */
  readonly report: (agent: AgentLike, state: HealthState, reason: string) => void
  /** Whether the execute row's service is present (M7 E8 D10); read per step, the row can load later. */
  readonly executeOn: () => boolean
}

let warnedRead = false

function warnOnce(agent: AgentLike, why: string): void {
  if (warnedRead) return
  warnedRead = true
  console.warn(`dsh-glm-hourness/design: the stage reminder is skipped for agent ${agent.id}: ${why}`)
}

/**
 * Whether the takeover steers the goal the reminder is about (takeover design
 * 0.6 §3.1): then the interview reminder stays out, the takeover's own
 * reminder is the one the main agent follows. The takeover is asked on every
 * step (that is how it knows this reminder asks it, F44) but only an
 * interview stage yields; a takeover that throws is skipped for the step and
 * the reminder goes out as it would without the takeover.
 */
function takeoverSteers(deps: StageNoticeDeps, agent: AgentLike, cwd: string | undefined, reminder: StageReminder): boolean {
  if (cwd === undefined) return false
  try {
    return deps.holds(cwd, reminder.goal) && (reminder.stage === 'wish' || reminder.stage === 'interview')
  }
  catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    warnOnce(agent, `the takeover could not be asked about the goal: ${why}`)
    deps.report(agent, 'degraded', `阶段提醒问不到接管（${why}），这一步照常出访谈提醒`)
    return false
  }
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
      const reminder = stageReminder(await loadGraph(dir), graph.focusOf(session), deps.executeOn())
      if (reminder.degraded !== undefined) deps.report(agent, 'degraded', reminder.degraded)
      if (takeoverSteers(deps, agent, session.header.cwd, reminder)) return undefined
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
