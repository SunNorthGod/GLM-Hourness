/**
 * The /wish entry (docs/ORCHESTRATION.md §4.8, M3 addendum §2.6): the
 * card on the opening screen of a new session (WishCard.tsx), and the
 * button under the composer with its small popover (WishPill.tsx). This
 * file holds what is decided without a renderer: when each shows, which
 * buttons it has, what a click does, the short label, how the result of a
 * command reads. Every string a human reads on the entry is here (the
 * components have none), so a change of wording or position in the panel
 * design (plain-ui 0.7 §11, mockup-wish.svg) touches this file and the
 * slot orders below, nothing else. No word of the entry names a model:
 * the orchestration package works with any model.
 */
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { OPEN_STATUSES } from '../../../src/graph/projection.ts'
import type { GraphSnapshot } from '../graph/source.ts'

/** Slot order of the opening card; the flow bar is 30 (DSH's queue strip is 20), the card follows it. */
export const CARD_ORDER = 40
/** Slot order of the button under the composer: DSH's statistics are 0 and 1, the GLM button 150. */
export const PILL_ORDER = 160

/** Slot id both entries register under in their own slots. */
export const ENTRY_ID = 'hourness-wish'

/** The command line each click sends, and the draft the first button writes. */
export const WISH_COMMAND = '/wish'
export const WISH_OFF_COMMAND = '/wish off'
export const WISH_DRAFT = '/wish '

/**
 * Width of the composer's dock row below which the button uses its short
 * label. The two client bundles share no code, so a short label in the GLM
 * bundle (plain-ui 0.4 §7.5.4) keeps its own copy of this number.
 */
export const NARROW_BELOW_PX = 520

export const WISH_TEXT = {
  slotLabel: '交给主 Agent',
  cardTitle: '把这个工作区交给主 Agent',
  cardBody: '说一句你想做的。主 Agent 先问清楚、出方案给你批，再分给子 agent 去做；它自己不写代码。',
  start: '写一句你想做的',
  resume: '接着推进现有项目',
  strongModel: '主 Agent 用强一点的模型',
  commandHint: '命令是 /wish，随时 /wish off 退出。',
  alreadyMain: '这个会话的 agent 是主 Agent',
  exit: '退出主 Agent（/wish off）',
  pillOrdinary: '交给主 Agent',
  pillShort: '/wish',
  pillMain: '主 Agent',
  popoverOrdinary: '让主 Agent 接手这个工作区：它按项目图推进，自己不写代码。',
  popoverMain: '这个会话的 agent 是这个项目的主 Agent：按项目图推进，不写文件。进度在右边的项目图里。',
  draftBusy: '输入框里还有没发出的字',
  copyHelp: '在输入框打 /wish，后面跟一句你想做的',
  copy: '复制 /wish',
  copied: '已复制',
  copyFailed: '复制失败，请手动输入',
  commandMissing: '这个会话里没有 /wish 命令',
  commandNotRun: '命令没有执行',
  commandFailed: (reason: string): string => `命令没有执行：${reason}`,
} as const

/** Facts the opening card decides on. */
export interface CardFacts {
  /** The session has not started: no prompt sent or attempted, nothing running. */
  readonly blank: boolean
  /** The session is in main-agent mode. */
  readonly main: boolean
  /** The workspace has a project graph. */
  readonly graph: boolean
  /** /wish is among the session's commands. */
  readonly wishRegistered: boolean
}

export type CardMode = 'full' | 'exit' | null

/**
 * Which of the card's two shapes shows, or neither. The full card:
 * blank session, not the main agent, a graph, /wish registered. The exit
 * line: blank session with a graph that is already the main agent, which
 * is what a bare /wish leaves on the opening screen (it injects and opens
 * no turn); the first sent message makes the session non-blank and the
 * line goes, the button under the composer takes over.
 */
export function cardMode(facts: CardFacts): CardMode {
  if (!facts.blank || !facts.graph) return null
  if (facts.main) return 'exit'
  return facts.wishRegistered ? 'full' : null
}

/** The session snapshot fields behind "blank", as the standard prop reads them; undefined where the prop is missing. */
export interface SessionFlags {
  readonly blank: boolean | undefined
  readonly promptAttempted: boolean | undefined
  readonly running: boolean | undefined
}

/**
 * Whether the session has not started. With the standard session prop:
 * blank, and no prompt attempted, and nothing running. Without it, or when
 * it has no snapshot yet, the session list's own `blank`.
 */
export function isBlankSession(flags: SessionFlags | undefined, summaryBlank: boolean | undefined): boolean {
  if (flags?.blank === undefined) return summaryBlank === true
  return flags.blank && flags.promptAttempted !== true && flags.running !== true
}

/** Whether the graph has a goal that is not closed (what "接着推进现有项目" continues). */
export function hasOpenGoal(graph: LoadedGraph): boolean {
  return [...graph.nodes.values()].some(node => node.type === 'goal' && OPEN_STATUSES.has(node.status))
}

/** Whether the workspace has a project graph: the node directory was read. */
export function hasGraph(snapshot: GraphSnapshot | undefined): boolean {
  return snapshot?.status === 'ready'
}

export type CardAction = 'start' | 'resume'

/** The buttons of the full card; the second only while a goal is open. */
export function cardActions(openGoal: boolean): readonly CardAction[] {
  return openGoal ? ['start', 'resume'] : ['start']
}

export type CardBlock = 'title' | 'body' | 'actions' | 'strong' | 'hint' | 'first-visit-line'

/**
 * The full card from top to bottom. The panel design's "第一次用？" line is
 * the last block when its component exists in this build (ui/src/guide/
 * FirstVisitLine.tsx, plain-ui 0.7 §6.5; it decides itself whether it
 * shows), and absent otherwise.
 */
export function fullCardBlocks(firstVisitLine: boolean): readonly CardBlock[] {
  const blocks: readonly CardBlock[] = ['title', 'body', 'actions', 'strong', 'hint']
  return firstVisitLine ? [...blocks, 'first-visit-line'] : blocks
}

/** Label of the button under the composer: the main agent's session says 主 Agent, a narrow row says /wish. */
export function pillLabel(main: boolean, rowWidth: number | undefined): string {
  if (main) return WISH_TEXT.pillMain
  return rowWidth !== undefined && rowWidth < NARROW_BELOW_PX ? WISH_TEXT.pillShort : WISH_TEXT.pillOrdinary
}

/**
 * Whether the button under the composer shows. The main agent's session
 * always has it (it is the way out); an ordinary session has it with a
 * graph and /wish registered.
 */
export function pillShown(facts: Pick<CardFacts, 'main' | 'graph' | 'wishRegistered'>): boolean {
  return facts.main || (facts.graph && facts.wishRegistered)
}

export type DraftPlan = 'write' | 'keep' | 'copy'

/**
 * What the first button does. With the input source and its setter: an
 * empty draft gets "/wish " (and the caret); a draft with text is left
 * alone and the human told. Without either, nothing is sent: the human
 * is shown what to type and a copy button.
 */
export function draftPlan(input: { readonly inputActions: boolean, readonly draft: string | undefined }): DraftPlan {
  if (!input.inputActions || input.draft === undefined) return 'copy'
  return input.draft.trim() === '' ? 'write' : 'keep'
}

/** What the human is told after a command click. */
export interface Outcome {
  readonly ok: boolean
  readonly text: string
}

/** A settled `remote.commands.execute` call, as far as it is read. */
export type ExecuteResult =
  | { readonly ok: true, readonly value: { readonly result: { readonly kind: 'success' | 'error', readonly text?: string } } | undefined }
  | { readonly ok: false, readonly error: { readonly message: string } }

/** The reply of a /wish click: the command's own text, or why it did not run. */
export function outcomeOf(result: ExecuteResult): Outcome {
  if (!result.ok) return { ok: false, text: WISH_TEXT.commandFailed(result.error.message) }
  if (result.value === undefined) return { ok: false, text: WISH_TEXT.commandMissing }
  const { kind, text } = result.value.result
  return kind === 'success' ? { ok: true, text: text ?? '' } : { ok: false, text: text ?? WISH_TEXT.commandNotRun }
}

/** Where a session's command list stands: not read, read, or failed (retried once after a session snapshot change). */
export type CommandsRead =
  | { readonly state: 'done', readonly registered: boolean }
  | { readonly state: 'failed', readonly retried: boolean }

/**
 * Whether to read the session's commands now. Once per session: nothing
 * read yet reads; a failed read is read once more after the session
 * snapshot changed; a finished read, or a second failure, is final.
 */
export function shouldReadCommands(read: CommandsRead | undefined, snapshotChanged: boolean): boolean {
  if (read === undefined) return true
  return read.state === 'failed' && !read.retried && snapshotChanged
}

/** The state after a read: `names` is the command names, undefined when the read failed. */
export function afterRead(previous: CommandsRead | undefined, names: readonly string[] | undefined): CommandsRead {
  if (names !== undefined) return { state: 'done', registered: names.includes('wish') }
  return { state: 'failed', retried: previous?.state === 'failed' }
}
