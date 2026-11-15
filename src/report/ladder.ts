/**
 * The rules ladder of the weekly report (M7 design 0.6 §3.12.1, §3.12.2,
 * m7-8): which norms the week's numbers say to move, and by how much. A norm
 * enters the ladder only when its body carries the `规则：` label (the ids it
 * names, read with M3's labeledSections, are matched exactly against the
 * violation journal's `rule` field); norms without it are only counted by
 * the report. The levels are 记忆 < 提示词 < 阶段提醒 < 门禁.
 *
 * Two directions remain. Up: a norm below 门禁 whose rules denied at least
 * three calls in the last seven days. Down: a gate-level norm whose rules
 * denied nothing and have no shadow record in the last twenty-eight days.
 * The third direction the design named — a shadow norm turning enforce — is
 * gone: the person decided code rules block from the day they start
 * (`d-code-rules-enforce`, 2026-10-31) and deleted the shadow-to-enforce
 * ladder step with the whole promotion machinery (M4 design 0.6, decision
 * one). The counts go through the one classifier every reader shares
 * (classifyRecord): a plain denial is a block, a `mode: 'shadow'` line with
 * paths is a shadow record, anything unreadable counts nowhere.
 *
 * The harness never asks the person itself (`d-rules-human-only`,
 * `d-chat-not-cards`): each direction becomes one `askDraft('norm-ladder')`
 * — facts plus a four-line draft the weekly report carries and the main
 * agent puts to the person with propose_to_human, at most three matters a
 * week together with the floor proposals. A norm the person rejected within
 * the last twenty-eight days (`rejectedNorms`) is not proposed again.
 *
 * Pure like the other reports: the clock comes in with the input, so the
 * same records read twice give the same proposals.
 */
import { askDraft, type Ask } from '../execute/asks.ts'
import { classifyRecord, type GuardRecord } from '../guard/records.ts'
import { answerKindOf } from '../shared/answer-marks.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { labeledSections } from '../graph/stage.ts'
import type { GraphNode } from '../graph/schema.ts'

/** The levels of the ladder, lowest first (§3.12.1). */
const LEVELS = ['记忆', '提示词', '阶段提醒', '门禁'] as const
/** The labels a norm's body may carry; only 级别 and 规则 matter to the ladder. */
const LABELS = ['级别', '规则'] as const

/** How long after blocks still count for a promotion (§3.12.2 「近 7 天」). */
const UP_WINDOW_MS = 7 * 86_400_000
/** The quiet stretch that proposes a demotion, blocks and shadow records both (§3.12.2 「近 28 天」). */
const DOWN_WINDOW_MS = 28 * 86_400_000
/** Blocks in the up window that point up (§3.12.2 「拦截不少于 3 条」). */
const UP_BLOCKS = 3
/** How long a rejection by the person keeps a norm off the ladder (§3.12.2). */
const REJECTED_WINDOW_MS = 28 * 86_400_000

/** Which way the numbers point for a norm's level; the enforce direction is gone (`d-code-rules-enforce`). */
type LadderMove = 'up' | 'down'

export interface LadderInput {
  /** The moment the proposals are made, epoch milliseconds (the windows' exclusive end). */
  readonly nowMs: number
  /** The project's norm nodes (the graph's `type: 'norm'` nodes). */
  readonly norms: readonly GraphNode[]
  /** The project's violation journal records, in journal order. */
  readonly violations: readonly GuardRecord[]
  /** Ids of the norms the person rejected within the last twenty-eight days (`rejectedNorms`); none of these is proposed. */
  readonly rejected: readonly string[]
}

/** One direction the week's numbers point, with the facts and the draft that carry it. */
export interface LadderProposal {
  /** The norm node's id (the propose_to_human parent). */
  readonly norm: string
  /** The norm node's title. */
  readonly title: string
  /** Which way the numbers point. */
  readonly direction: LadderMove
  /** The counts behind the direction, one line, as the facts carry them. */
  readonly counts: string
  /** The matter for the main agent: facts and the four-line draft (`askDraft('norm-ladder')`). */
  readonly ask: Ask
}

/** Whether the entry is the person's rejection of a proposal in the chat. */
function isRejection(entry: { readonly op: string, readonly at: string, readonly text?: string, readonly reason?: string }): boolean {
  return entry.op === 'comment' && answerKindOf(entry) === 'reject' && !Number.isNaN(Date.parse(entry.at))
}

/**
 * The norms the person said no to in the chat within the last twenty-eight
 * days (§3.12.2 「人否掉过的……不再提」): proposal-style questions under a
 * norm node that carry a rejection comment. Their moments compare as
 * instants; an unparsable moment never counts.
 */
export function rejectedNorms(graph: LoadedGraph, nowMs: number): ReadonlySet<string> {
  const cutoff = nowMs - REJECTED_WINDOW_MS
  const norms = new Set([...graph.nodes.values()].filter(node => node.type === 'norm').map(node => node.id))
  const rejected = new Set<string>()
  for (const node of graph.nodes.values()) {
    if (node.type !== 'question' || node.parent === undefined || !norms.has(node.parent)) continue
    if (node.history.some(entry => isRejection(entry) && Date.parse(entry.at) >= cutoff)) rejected.add(node.parent)
  }
  return rejected
}

/** The blocks and the shadow records of one rule set in `[since, now)` — the classes the one classifier names, the mode tells apart. */
function countsInWindow(violations: readonly GuardRecord[], rules: ReadonlySet<string>, sinceMs: number, nowMs: number): { blocks: number, shadow: number } {
  let blocks = 0
  let shadow = 0
  for (const record of violations) {
    const line = record as unknown as Readonly<Record<string, unknown>>
    if (typeof line.rule !== 'string' || !rules.has(line.rule)) continue
    const at = typeof line.at === 'string' ? Date.parse(line.at) : Number.NaN
    if (Number.isNaN(at) || at < sinceMs || at >= nowMs) continue
    const klass = classifyRecord(line)
    if (klass === 'denial') blocks += 1
    else if (klass === 'late-denial' && line.mode === 'shadow') shadow += 1
  }
  return { blocks, shadow }
}

/** One norm read for the ladder: its id, title, level rank and rule ids; undefined when any part is missing or unreadable. */
export function ladderEntry(node: GraphNode): { id: string, title: string, rank: number, rules: ReadonlySet<string> } | undefined {
  const rank = (LEVELS as readonly string[]).indexOf((labeledSections(node.body, LABELS).get('级别') ?? '').trim())
  if (rank < 0) return undefined
  const rules = labeledSections(node.body, LABELS).get('规则') ?? ''
  const ids = rules.split(/[,,、]/).map(id => id.trim()).filter(id => id.length > 0)
  if (ids.length === 0) return undefined
  return { id: node.id, title: node.title, rank, rules: new Set(ids) }
}

/** Compute the week's ladder proposals (§3.12.2), input order, rejected norms left out. */
export function ladderProposals(input: LadderInput): readonly LadderProposal[] {
  const proposals: LadderProposal[] = []
  const rejected = new Set(input.rejected)
  for (const node of input.norms) {
    if (rejected.has(node.id)) continue
    const norm = ladderEntry(node)
    if (norm === undefined) continue
    const gate = (LEVELS as readonly string[]).indexOf('门禁')
    let direction: LadderMove | undefined
    let counts: string
    if (norm.rank < gate) {
      const { blocks } = countsInWindow(input.violations, norm.rules, input.nowMs - UP_WINDOW_MS, input.nowMs)
      if (blocks < UP_BLOCKS) continue
      direction = 'up'
      counts = `近 7 天拦截 ${blocks} 条`
    }
    else {
      const { blocks, shadow } = countsInWindow(input.violations, norm.rules, input.nowMs - DOWN_WINDOW_MS, input.nowMs)
      if (blocks > 0 || shadow > 0) continue
      direction = 'down'
      counts = '近 28 天拦截与影子都是 0'
    }
    proposals.push({ norm: norm.id, title: norm.title, direction, counts, ask: askDraft('norm-ladder', { norm: norm.id, title: norm.title, direction, counts }) })
  }
  return proposals
}
