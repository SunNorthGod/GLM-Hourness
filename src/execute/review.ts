/**
 * The independent review's verdict and its convergence (M7 design 0.6
 * §3.7.2, §3.7.3): what a reviewer may block on, how the rounds are counted
 * from the graph, and when the harness stops dispatching and hands the
 * matter to the person. Pure functions over the reviewed node's fields and
 * the histories the caller merges; the graph is the source of truth.
 *
 * A review round is one comment on the review task:
 * `第 <k> 轮：挡路 <b>，不挡路 <n> · <全审|轻审> · <childId>`, and the goal's
 * acceptance review comments on the goal:
 * `验收审查第 <k> 轮：<APPROVED|CHANGES_REQUESTED> · 挡路 <n> · <childId> ·
 * @<trunk> · pins: <goal>@<digest>`. A stop appends `· 停下` to the latest
 * round — the same suffix the dispatch gate reads (src/execute/brief.ts).
 */
import type { HistoryEntry } from '../graph/schema.ts'

/** One finding as the reviewer's schema carries it (src/execute/schemas.ts). */
export interface ReviewFinding {
  readonly id: string
  readonly blocking: boolean
  readonly criterion: string
  readonly where: string
  readonly what: string
  readonly fix: string
}

/** The reviewer's verdict before it is reconciled (§3.7.2). */
export interface ReviewVerdict {
  readonly verdict: 'APPROVED' | 'CHANGES_REQUESTED'
  readonly commit: string
  readonly findings: readonly ReviewFinding[]
  readonly checked: readonly string[]
}

const CRITERIA: ReadonlySet<string> = new Set(['irreversible-loss', 'failure-plan'])

/** Whether the criterion names an item that exists: `acceptance:<i>` against the reviewed node's acceptance, `direction:<i>` against the direction list. */
function criterionHolds(criterion: string, acceptanceCount: number, directionCount: number | undefined): boolean {
  if (CRITERIA.has(criterion)) return true
  for (const [prefix, count] of [['acceptance:', acceptanceCount], ['direction:', directionCount]] as const) {
    if (count === undefined || !criterion.startsWith(prefix)) continue
    const index = Number(criterion.slice(prefix.length))
    return Number.isInteger(index) && index >= 0 && index < count
  }
  return false
}

/**
 * The verdict reconciled (§3.7.2): every blocking finding must hang on one of
 * the three criteria — or on `direction:<i>` when the review is a module's
 * design review and `directions` is the direction list's length; anything
 * else is demoted to not blocking and counted in `demoted`. The findings
 * then outrank the verdict: an `APPROVED` with blocking findings left is a
 * `CHANGES_REQUESTED`, a `CHANGES_REQUESTED` without any is `APPROVED`.
 */
export function normalizeVerdict(reviewed: { readonly acceptance?: readonly string[] }, verdict: ReviewVerdict, directions?: number): {
  readonly verdict: 'APPROVED' | 'CHANGES_REQUESTED'
  readonly findings: readonly ReviewFinding[]
  readonly demoted: number
} {
  const acceptanceCount = (reviewed.acceptance ?? []).length
  let demoted = 0
  const findings = verdict.findings.map(finding => {
    if (!finding.blocking || criterionHolds(finding.criterion, acceptanceCount, directions)) return finding
    demoted += 1
    return { ...finding, blocking: false }
  })
  const blocking = findings.filter(finding => finding.blocking).length
  const settled = verdict.verdict === 'APPROVED' ? blocking === 0 : blocking > 0
  return { verdict: settled ? verdict.verdict : blocking === 0 ? 'APPROVED' : 'CHANGES_REQUESTED', findings, demoted }
}

/** One review round as the graph's comment holds it. */
export interface Round {
  readonly k: number
  readonly blocking: number
  readonly nonBlocking: number
  readonly depth: '全审' | '轻审'
  readonly childId: string
  readonly at: string
  readonly stopped: boolean
}

const ROUND = /^第 (\d+) 轮：挡路 (\d+)，不挡路 (\d+) · (全审|轻审) · (\S+?)(?: · 停下)?$/

/** The review rounds a history holds, in comment order. */
export function roundsOf(history: readonly HistoryEntry[]): readonly Round[] {
  const rounds: Round[] = []
  for (const entry of history) {
    if (entry.op !== 'comment' || typeof entry.text !== 'string') continue
    const match = ROUND.exec(entry.text)
    if (match === null) continue
    rounds.push({
      k: Number(match[1]),
      blocking: Number(match[2]),
      nonBlocking: Number(match[3]),
      depth: match[4] as '全审' | '轻审',
      childId: match[5] ?? '',
      at: entry.at,
      stopped: entry.text.endsWith('· 停下'),
    })
  }
  return rounds
}

/** The comment of one round (§3.7.3); `stop` appends the marker the gate reads. */
export function renderRoundComment(k: number, blocking: number, nonBlocking: number, depth: '全审' | '轻审', childId: string, stop = false): string {
  return `第 ${k} 轮：挡路 ${blocking}，不挡路 ${nonBlocking} · ${depth} · ${childId}${stop ? ' · 停下' : ''}`
}

/** The comment of one acceptance-review round on a goal (§3.9.3, item 5). */
export function renderAcceptanceComment(k: number, verdict: 'APPROVED' | 'CHANGES_REQUESTED', blocking: number, childId: string, trunk: string, pinsLine: string, stop = false): string {
  return `验收审查第 ${k} 轮：${verdict} · 挡路 ${blocking} · ${childId} · @${trunk} · ${pinsLine}${stop ? ' · 停下' : ''}`
}

/**
 * The time of the latest human write in these histories: an entry the person
 * made themselves (`actor: human`) or that carries their words (`relay`),
 * whichever history holds it — the reviewed task, the review task, the
 * questions below them. Undefined when none of them has one.
 */
export function latestHumanAt(histories: readonly (readonly HistoryEntry[])[]): string | undefined {
  let latest: string | undefined
  for (const history of histories) {
    for (const entry of history) {
      if (entry.actor !== 'human' && entry.relay === undefined) continue
      if (latest === undefined || entry.at > latest) latest = entry.at
    }
  }
  return latest
}

/**
 * How many rounds came after the person's latest word (§3.7.3): the round
 * comments of `history` — the subtree's histories merged in time order —
 * whose `at` is later than `humanAt`. All of them when the person has not
 * written into the subtree at all (the table's 「子树里还没有过人的条目」).
 */
export function roundsSinceHuman(history: readonly HistoryEntry[], humanAt: string | undefined): readonly Round[] {
  const rounds = roundsOf(history)
  return humanAt === undefined ? rounds : rounds.filter(round => round.at > humanAt)
}

/** What the convergence table (§3.7.3) says to do after the latest round. */
export type Convergence =
  | { readonly action: 'pass' }
  | { readonly action: 'stop', readonly why: 'not-converging' | 'rounds-used' | 'human-gave-one-round' }
  | { readonly action: 'notify' }

/**
 * The convergence table, on the rounds since the person's latest word (all
 * of them when they have never written into the subtree) and whether they
 * ever did. `b_k = 0` passes; without a human word, rounds that do not
 * improve or the third round with findings stop; after an answer, the first
 * round with findings stops (the person gave one round, not a new three);
 * anything else is a factual notice to the main agent.
 */
export function converge(rounds: readonly Round[], humanSeen: boolean): Convergence {
  const last = rounds.at(-1)
  if (last === undefined) return { action: 'notify' }
  if (last.blocking === 0) return { action: 'pass' }
  const previous = rounds.at(-2)
  if (!humanSeen) {
    if (rounds.length >= 2 && previous !== undefined && last.blocking >= previous.blocking) return { action: 'stop', why: 'not-converging' }
    if (rounds.length >= 3) return { action: 'stop', why: 'rounds-used' }
  }
  else if (rounds.length === 1) {
    return { action: 'stop', why: 'human-gave-one-round' }
  }
  return { action: 'notify' }
}
