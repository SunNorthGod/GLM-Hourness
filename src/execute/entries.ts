/**
 * The execute row's tables for the loop board (M7 design 0.6 §2.5, §3.11.1):
 * the events it hands over, the seven default entries that listen to them,
 * and the harness actions an entry runs. Data only — the board shows and
 * runs what is written here, M7's fallback executor reads the same tables,
 * and the loop row itself carries none of them, so one matter never wakes
 * the main agent twice. The runtime wiring (`contribute`, `emit`, the
 * fallback and the watchdog) is E8's; `src/execute/loop-link.ts` imports
 * these tables from here.
 *
 * Every `tell` wakes: each link of the drive chain has to reach an idle main
 * agent, and the time entries are delivered by the host's schedule anyway.
 * The words to the main agent are English; the first line,
 * `Loop board: <id> (default of dsh-hourness).`, is written on delivery, so
 * the texts here begin with the second line. A `{name}` is filled from the
 * event's payload and every event named by the entry declares it.
 */
import type { LoopEntryDefinition } from '../loops/model.ts'
import type { LoopEventDeclaration } from '../loops/trigger.ts'

// ---- events (§2.5) ----

/** The event the drive starts on: a design was released and not processed yet. */
const DESIGN_RELEASED = 'hourness.design-released'
/** A task's finished handback was processed and the effective depth is not skip. */
const HANDBACK = 'hourness.handback'
/** A review passed. */
const REVIEW_PASSED = 'hourness.review-passed'
/** The effective depth was skip: no review task, straight to integration. */
const REVIEW_SKIPPED = 'hourness.review-skipped'
/** A review, a check or the acceptance review stopped and waits for the person. */
const STOPPED = 'hourness.stopped'
/** Every task of a goal is closed and no module is left in design. */
const TASKS_CLOSED = 'hourness.tasks-closed'
/** The trunk moved and the gate passed. */
const TRUNK_ADVANCED = 'hourness.trunk-advanced'
/** The trunk moved by someone or something outside the dispatch chain. */
const OUTSIDE_ADVANCE = 'hourness.outside-advance'
/** The holder session walked its first step in this process or was created. */
const HOST_STARTED = 'hourness.host-started'

/** The nine events the execute row hands the board, with the fields their entries and filters read (§2.5). */
export const EXECUTE_EVENTS: readonly LoopEventDeclaration[] = [
  {
    id: DESIGN_RELEASED,
    title: '设计放行，该开始自动推进了',
    fields: [
      { name: 'goal', type: 'string', title: '放行的目标' },
      { name: 'module', type: 'string', title: '放行的模块，没分模块时是空串' },
      { name: 'release', type: 'string', title: '放行那条历史的时刻' },
    ],
    personSelectable: true,
  },
  {
    id: HANDBACK,
    title: '一件活交回来了，该派审查了',
    fields: [
      { name: 'task', type: 'string', title: '交回的任务' },
      { name: 'attempt', type: 'number', title: '第几次派发' },
      { name: 'status', type: 'string', title: '交回的状态' },
      { name: 'depth', type: 'string', title: '有效深浅' },
      { name: 'reviewTask', type: 'string', title: '要派的审查任务；不审时为空串' },
      { name: 'commits', type: 'number', title: '这次交回的提交数' },
      { name: 'floorHit', type: 'string', title: '碰到必须全审清单的哪一条，unparsed 或空串' },
    ],
    personSelectable: true,
  },
  {
    id: REVIEW_PASSED,
    title: '审查过了，该做进主干的提交了',
    fields: [
      { name: 'task', type: 'string', title: '被审的任务' },
      { name: 'round', type: 'number', title: '过了的轮数' },
    ],
    personSelectable: true,
  },
  {
    id: REVIEW_SKIPPED,
    title: '这件活按理由不审，直接去做提交',
    fields: [{ name: 'task', type: 'string', title: '不审的任务' }],
    personSelectable: true,
  },
  {
    id: STOPPED,
    title: '审查或检查停下了，该问你',
    fields: [
      { name: 'node', type: 'string', title: '停下的节点' },
      { name: 'kind', type: 'string', title: 'review、check 或 acceptance' },
      { name: 'rounds', type: 'number', title: '停下时的轮数' },
    ],
    personSelectable: true,
  },
  {
    id: TASKS_CLOSED,
    title: '一个目标下的活都关了，该整体审一遍',
    fields: [{ name: 'goal', type: 'string', title: '关完的目标' }],
    personSelectable: true,
  },
  {
    id: TRUNK_ADVANCED,
    title: '主干前进过了，该跑一遍完整检查',
    fields: [
      { name: 'from', type: 'string', title: '前进前的主干' },
      { name: 'to', type: 'string', title: '前进后的主干' },
      { name: 'tasks', type: 'string', title: '这次进主干的活，逗号隔开' },
      { name: 'files', type: 'strings', title: '这次改动的文件，至多 200 项', filter: 'paths' },
      { name: 'truncated', type: 'boolean', title: '文件列表是不是被截断了' },
    ],
    personSelectable: true,
  },
  {
    id: OUTSIDE_ADVANCE,
    title: '主干被系统外的人或工具挪了',
    fields: [
      { name: 'from', type: 'string', title: '挪动前的主干' },
      { name: 'to', type: 'string', title: '挪动后的主干' },
      { name: 'files', type: 'strings', title: '这次改动的文件，至多 200 项', filter: 'paths' },
      { name: 'truncated', type: 'boolean', title: '文件列表是不是被截断了' },
    ],
    personSelectable: true,
  },
  {
    id: HOST_STARTED,
    title: '主 Agent 在这个进程里开始走动了',
    fields: [],
    personSelectable: true,
  },
]

// ---- harness actions (§2.5) ----

const START_DRIVE = 'execute.start-drive'
const TRUNK_CHECK = 'execute.trunk-check'
const RECONCILE = 'execute.reconcile'
const RESUME_DRIVE = 'execute.resume-drive'
const STOP_DRAFT = 'execute.stop-draft'

/** The five harness actions the execute row runs, with the titles the board shows (§2.5). */
export const EXECUTE_ACTIONS: readonly { readonly id: string, readonly title: string }[] = [
  { id: START_DRIVE, title: '开始自动推进' },
  { id: TRUNK_CHECK, title: '在主干上跑完整检查' },
  { id: RECONCILE, title: '重启后对账' },
  { id: RESUME_DRIVE, title: '高峰后接上自动推进' },
  { id: STOP_DRAFT, title: '把停下的活写成问你的草稿' },
]

// ---- entries (§3.11.1) ----

const tellMain = (text: string) => ({ kind: 'tell-main' as const, text, wake: true })

/**
 * The seven default entries of the execute row (§3.11.1's table): what each
 * listens to, and the words the main agent gets. The words that need the
 * graph (the stopped draft, the trunk check's verdict, the reconcile list)
 * come from the action's own `tell`, so the entry names the action only.
 */
export const EXECUTE_ENTRIES: readonly LoopEntryDefinition[] = [
  {
    id: 'execute.release',
    title: '设计放行之后：主 Agent 开始自己推进',
    why: '你放行设计之后不用再发命令，这一项让系统开始自动推进，并提醒主 Agent 分解与派活',
    when: { kind: 'event', events: [DESIGN_RELEASED] },
    action: {
      kind: 'harness',
      action: START_DRIVE,
      tell: {
        text: 'The design of {goal} is released and the drive has started. Decompose it into tasks with dispatch attributes and dispatch them with dispatch_task; do not wait for the person.',
        wake: true,
      },
    },
    limits: { debounceSeconds: 5, maxPerHour: 30 },
  },
  {
    id: 'execute.handback',
    title: '一件活交回之后：派审查',
    why: '交回的活要有人审过才进主干，这一项提醒主 Agent 去派审查',
    when: { kind: 'event', events: [HANDBACK] },
    action: tellMain('{task} is handed back (attempt {attempt}, {commits} commits). Review depth: {depth} (raised to full by the must-review list: {floorHit}; empty means not raised). Dispatch its review: dispatch_task {reviewTask} with a model and why.'),
    limits: { debounceSeconds: 5, maxPerHour: 30 },
  },
  {
    id: 'execute.reviewed',
    title: '审查过了（或按理由不审）之后：做出要进主干的提交，检查后合入',
    why: '审查过了的活要先过合入前的检查才能进主干，这一项提醒主 Agent 去做',
    when: { kind: 'event', events: [REVIEW_PASSED, REVIEW_SKIPPED] },
    action: tellMain('{task} is ready to integrate. Build the commit for the main branch with the trailer "Hourness-Task: {task}", run check_commit on it, then fast-forward the main branch to it.'),
    limits: { debounceSeconds: 5, maxPerHour: 30 },
  },
  {
    id: 'execute.stopped',
    title: '审查或检查一再不过停下之后：在对话里问你',
    why: '审查或检查一再不过时不再派这件活，这一项让主 Agent 把它拿到对话里问你',
    when: { kind: 'event', events: [STOPPED] },
    action: { kind: 'harness', action: STOP_DRAFT },
    limits: { debounceSeconds: 5, maxPerHour: 30 },
  },
  {
    id: 'execute.tasks-closed',
    title: '一个目标下的活都关了之后：派目标整体的审查',
    why: '活都做完之后，要对照目标的要求整体再审一遍，才能说目标做完了',
    when: { kind: 'event', events: [TASKS_CLOSED] },
    action: tellMain('All tasks of {goal} are closed. Dispatch its acceptance review: dispatch_task {goal} with a model and why.'),
    limits: { debounceSeconds: 5, maxPerHour: 30 },
  },
  {
    id: 'execute.trunk',
    title: '合进主干之后：在主干上跑一遍完整的检查',
    why: '每次合进主干之后，确认主干上的每条检查都跑过、都过了，坏了就提醒主 Agent 修',
    when: { kind: 'event', events: [TRUNK_ADVANCED, OUTSIDE_ADVANCE] },
    action: { kind: 'harness', action: TRUNK_CHECK },
    limits: { debounceSeconds: 30, maxPerHour: 30 },
  },
  {
    id: 'execute.restart',
    title: '重启之后：接上停了的活',
    why: '重启时没交回的活会丢，这一项对一遍账，把丢了的列给主 Agent，不重复派',
    when: { kind: 'event', events: [HOST_STARTED] },
    action: { kind: 'harness', action: RECONCILE },
    limits: { debounceSeconds: 5, maxPerHour: 6 },
  },
]

// The loop row's own `loops.peak-end` entry calls RESUME_DRIVE when a peak
// ends (loop board defaults, src/loops/defaults.ts); the execute row adds no
// entry of its own for it.
