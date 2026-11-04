/**
 * The third rework's question for the human (m4 design §4.6; task m4-rules,
 * acceptance item 2; docs/ORCHESTRATION.md §2.4): when an LLM reopens a node
 * from done to doing for the third time, the harness files one proposal-style
 * question under the node — one plan in four lines, no options to pick from —
 * and hands it to the caller's next batch with a notice. The counting rule
 * (the whole document keeps this one reading): the first completion ends the
 * building; every reopen after it starts one fix, so the n-th reopen is the
 * n-th fix starting, and the question is filed as the third fix is about to
 * begin. A question of this kind is recognized by its history, not its text:
 * the first history entry is a propose by the harness whose reason is exactly
 * `第三次修复：<node id>`, so an edited body still reads as one. The question
 * keeps the fields the engine's proposal shape has (M3 appendix 0.6 cancelled
 * the background/doubt node fields the design §4.6 table named, so the four
 * lines travel on reason/proposal/cost/notTaken; the presentation is M3's —
 * m4 design §16, the N22 row). Pure functions here; the graph_status tool
 * (tools.ts) does the writing and the loops hand-over reports it.
 */
import { escapeText, personTitle } from './plan-text.ts'
import type { GraphNode } from './schema.ts'
import { plainWordsIn } from './plain-question.ts'

/** How many reopens of one node ask the human (design §6.8: the board's ownRules names it too). */
export const REOPEN_LIMIT = 3

/** The first history entry of a third-rework question: a propose by the harness with this exact reason. */
export function thirdReworkReason(nodeId: string): string {
  return `第三次修复：${nodeId}`
}

/** One reopen of the node: the moment and the reason the reopener gave, as the question's 附 cites them. */
export interface ReopenEntry {
  readonly at: string
  readonly reason?: string
}

/**
 * The reopens of `node` after `since`: history entries that moved it from
 * done back to doing, whoever wrote them. `since` undefined counts from the
 * beginning (ISO timestamps compare as text).
 */
export function reopensAfter(node: GraphNode, since: string | undefined): ReopenEntry[] {
  return node.history
    .filter(entry => entry.op === 'status' && entry.from === 'done' && entry.to === 'doing' && (since === undefined || entry.at > since))
    .map(({ at, reason }) => ({ at, ...(reason === undefined ? {} : { reason }) }))
}

/** How many reopens `node` has after `since` (design §4.6's reopenCount). */
export function reopenCount(node: GraphNode, since: string | undefined): number {
  return reopensAfter(node, since).length
}

/** A question of the third-rework kind under `nodeId`, by its history, whatever its text says now. */
function isThirdReworkQuestion(node: GraphNode, nodeId: string): boolean {
  const first = node.history[0]
  return node.parent === nodeId && node.type === 'question'
    && first?.op === 'propose' && first.actor === 'harness' && first.reason === thirdReworkReason(nodeId)
}

/** The last moment a status-changing history entry of the question was written (a propose, decide, approve, reject or status; edits and comments have no `to`). */
function lastStatusAt(node: GraphNode): string | undefined {
  for (let index = node.history.length - 1; index >= 0; index--) {
    const entry = node.history[index]
    if (entry?.to !== undefined) return entry.at
  }
  return undefined
}

/** What the node's third-rework questions say now: an open one, or when the most recently closed one closed. */
export interface ThirdReworkState {
  /** A question still waiting for the human (approved or doing): do not file another. */
  readonly open: GraphNode | undefined
  /** When the most recently closed (done or dropped) one had its last status history; undefined when none was ever closed. */
  readonly closedAt: string | undefined
}

/**
 * The third-rework questions under `nodeId` (the whole graph, questions
 * included). Closed is done or dropped; the newest close moment is the
 * `since` the next count starts from, so after the human agrees, or says it
 * needs no decision, the count starts over and the question is filed again
 * only after REOPEN_LIMIT more reopens.
 */
export function thirdReworkState(graph: { readonly nodes: ReadonlyMap<string, GraphNode> }, nodeId: string): ThirdReworkState {
  const questions = [...graph.nodes.values()].filter(node => isThirdReworkQuestion(node, nodeId))
  const open = questions.find(node => node.status === 'approved' || node.status === 'doing')
  let closedAt: string | undefined
  for (const node of questions) {
    if (node.status !== 'done' && node.status !== 'dropped') continue
    const at = lastStatusAt(node)
    if (at !== undefined && (closedAt === undefined || at > closedAt)) closedAt = at
  }
  return { open, closedAt }
}

/** The four lines and the words around them, word for word (design §4.6's table; pinned by tests). */
const LINES = {
  /** 背景, on the record's reason: why the recommendation is to stop. */
  reason: '这件活**修过两次又被重新打开**，同一处反复修不好，常常是问题没找对',
  /** 推荐, the record's proposal. */
  proposal: '**先停下查原因**，查清了写进这件活再接着修',
  /** 疑问, on the record's cost: a fact one can check, which unseats the plan when it changes. */
  cost: '若**三次重开不是同一个问题**，接着修也行',
} as const

/** The closing question: the record's ask and the last line the human reads. */
export const REOPEN_ASK = '先停下查原因，可以吗？'

/** The plain-words check of the harness's own strings: before plain-ui's second phase the list is plainWordsIn. */
const issuesOf = (text: string): readonly string[] => plainWordsIn(text)

/** The moment of an ISO timestamp as the 附 shows it, at UTC+8 like the project's other day keys. */
function momentOf(at: string): string {
  const shifted = new Date(new Date(at).getTime() + 8 * 60 * 60 * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}

/** A reason cut to 40 code points and escaped for a verbatim line in the 附. */
function citedReason(reason: string | undefined): string {
  const points = [...(reason ?? '').trim()]
  return escapeText(points.slice(0, 40).join(''))
}

/** The title of the question: the node's title shown to the human, or the fallback wording (F18). */
function titleOf(node: GraphNode): string {
  const shown = personTitle(node.title, { limit: 24, issuesOf })
  return shown === undefined ? `这件活要修第 ${REOPEN_LIMIT} 次了` : `「${shown}」要修第 ${REOPEN_LIMIT} 次了`
}

/** What the question carries on the graph and the sentence the showing shows. */
export interface ReopenQuestion {
  /** The propose payload: the engine's proposal shape, no option field on it. */
  readonly node: {
    readonly type: 'question'
    readonly parent: string
    readonly title: string
    readonly ask: string
    readonly form: 'recommend'
    readonly proposal: string
    readonly reason: string
    readonly cost: string
    readonly notTaken: string
    readonly body: string
  }
  /** The propose's reason, exactly: how the question is recognized again. */
  readonly reason: string
  /** The sentence propose_to_human's text takes: the three lines word for word, ending with the question (M3's checks hold it to the record). */
  readonly showText: string
  /** The title the notice names, for tests and for the caller's own message. */
  readonly title: string
}

/**
 * The third-rework question for `node`, from the reopens counted after the
 * last closed question of this kind (design §4.6's reopenQuestion). The 附
 * cites the last three reopens of that window by their place in it, the
 * moment at UTC+8 and the reopener's reason cut to 40 code points; when the
 * title fell back, the node's title goes to the 附's first line, escaped
 * (F18). Every harness sentence passes the plain-words list; the cited
 * moments and reasons are data and show as they are.
 */
export function reopenQuestion(node: GraphNode, reopens: readonly ReopenEntry[]): ReopenQuestion {
  const title = titleOf(node)
  const fellBack = title.startsWith('这件活')
  const cited = reopens.slice(-REOPEN_LIMIT)
  const first = reopens.length - cited.length
  const lines = [
    ...(fellBack ? [`- 这件活是「${escapeText(node.title)}」`] : []),
    ...cited.map((reopen, index) => `- 第 ${first + index + 1} 次重新打开：${momentOf(reopen.at)}「${citedReason(reopen.reason)}」`),
  ]
  return {
    node: {
      type: 'question',
      parent: node.id,
      title,
      ask: REOPEN_ASK,
      form: 'recommend',
      proposal: LINES.proposal,
      reason: LINES.reason,
      cost: LINES.cost,
      notTaken: `**直接接着修**，多半还要修第 ${REOPEN_LIMIT + 1} 次`,
      body: lines.join('\n'),
    },
    reason: thirdReworkReason(node.id),
    showText: `${LINES.reason}，${LINES.proposal}，${LINES.cost}，${REOPEN_ASK}`,
    title,
  }
}

/** Why the harness shows it to the caller of a root agent (design §4.6, adapted to propose_to_human's text parameter: M3's checks hold the text to the record, so the three lines travel in it). */
export function reopenNotice(question: ReopenQuestion, id: string): string {
  return `Filed question ${id} for the human: this node is about to get its third fix. Do not start the third fix yet. In your next batch (at most three matters in one reply) call propose_to_human with kind "question", question "${id}" and this exact text: ${question.showText} Put the text it returns at the very end of your reply, with nothing after it, and end your turn. Record the answer with record_human_answer (kind question, question ${id}): if they agree, look for the cause and write it into this node before fixing; if they add to it or turn it down, revise the question with propose_to_human and show it again with their exact words. If they say it needs no decision (for example 接着修吧), drop the question with graph_status and their words as relay.`
}

/** The notice a subagent's caller reads: the subagent stops and hands back; the main agent asks the human (design §4.6). */
export function reopenNoticeForSubagent(id: string): string {
  return `Filed question ${id} for the human: this node is about to get its third fix. Stop work on it and say so in your final result; the main agent asks the human.`
}

/** The notice when filing failed: the reopen stands, the question is tried again on the next reopen (design §4.6). */
export function reopenNoticeFailed(error: { readonly code: string, readonly message: string }): string {
  return `This reopen is the third, but filing the question for the human failed (${error.code}: ${error.message}). The reopen stands; the question is tried again on the next reopen.`
}
