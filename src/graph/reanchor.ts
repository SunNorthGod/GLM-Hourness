/**
 * What the step projection adds when it re-anchors after a compaction
 * (docs/ORCHESTRATION.md §2.5 重锚): the non-goals of the goal the focus is
 * under, the titles of the approved norm nodes under that goal, and the
 * rules the harness denied in this session with how many times. Only the
 * notice whose reason is `compaction` carries them, after the projection;
 * the notice keeps the projection's digest, so the next step sees no change
 * and adds nothing, and no other step carries them.
 *
 * The norms are the live norm nodes (`norm-*`) anywhere below the goal whose
 * status is approved, doing or done: a proposal is not a norm yet, and a
 * dropped or superseded one, or one below a dropped branch, no longer is.
 *
 * The counts come from the violation journal of the session's project
 * (src/memory/audit.ts), read once per re-anchoring and counted by the one
 * statistics reader of the journal (src/guard/measure.ts ruleStats): denials
 * and late denials count, follow-ups, deferrals and record-only calls do
 * not. A journal that does not exist yet holds no denial; one that cannot
 * be read, or a session without a project directory, leaves the counts out
 * and says why, for the row health.
 */
import { readFile } from 'node:fs/promises'
import { ruleStats } from '../guard/measure.ts'
import { journalRecords } from '../guard/records.ts'
import { compareText } from './format.ts'
import type { LoadedGraph } from './parse.ts'
import { childrenIndex, subtreeOf, type Projection } from './projection.ts'
import type { GraphNode, Status } from './schema.ts'
import { goalOf } from './stage.ts'
import { liveOf } from './user-live.ts'

/** The session's denials by rule, most denied first, or why the journal could not be read. */
type SessionDenials = { readonly rules: ReadonlyArray<{ readonly rule: string, readonly times: number }> } | { readonly problem: string }

/** A norm the re-anchoring names: its id and title. */
type NormRef = Pick<GraphNode, 'id' | 'title'>

/** Statuses of a norm that passed approval. */
const APPROVED: ReadonlySet<Status> = new Set(['approved', 'doing', 'done'])

/** Count the denials of one session in a violation journal; `journal` is undefined when the session has no project directory. */
export async function sessionDenials(journal: string | undefined, sessionId: string): Promise<SessionDenials> {
  if (journal === undefined) return { problem: '没有项目目录，违规流水无处可读' }
  let text: string
  try {
    text = await readFile(journal, 'utf8')
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { rules: [] }
    return { problem: `读不到违规流水（${code ?? (error instanceof Error ? error.message : String(error))}）` }
  }
  // A line that parses to something other than an object (`null`, a number) is no record of this session.
  const own = journalRecords(text).filter((record: unknown) => typeof record === 'object' && record !== null && (record as { readonly sessionId?: unknown }).sessionId === sessionId)
  const rules = [...ruleStats(own).rules].flatMap(([rule, stat]) => {
    const times = stat.denials.dialect + stat.denials.other
    return times > 0 ? [{ rule, times }] : []
  })
  return { rules: rules.sort((a, b) => b.times - a.times || (a.rule < b.rule ? -1 : 1)) }
}

/** The approved, live norm nodes below the goal of `focus`, in id order; empty when the focus has no goal. */
export function goalNorms(graph: LoadedGraph, focus: string): NormRef[] {
  const goal = goalOf(graph, focus)
  if (goal === undefined) return []
  return subtreeOf(childrenIndex(graph), goal).slice(1)
    .filter(node => node.type === 'norm' && APPROVED.has(node.status) && liveOf(graph, node))
    .sort((a, b) => compareText(a.id, b.id))
    .map(({ id, title }) => ({ id, title }))
}

/**
 * The lines a re-anchoring adds after the projection: the goal's non-goals
 * when the focus could be projected and its goal has any, the goal's norms
 * when there are any, the denied rules when the session has any. Empty when
 * there is none of them.
 */
export function reanchorLines(projection: Projection | undefined, norms: readonly NormRef[], denials: SessionDenials): string[] {
  const top = projection?.ancestors.at(-1)
  const goal = projection?.node.type === 'goal' ? projection.node : top?.type === 'goal' ? top : undefined
  const nonGoals = goal?.nonGoals ?? []
  const lines: string[] = []
  if (goal !== undefined && nonGoals.length > 0) {
    lines.push(`Non-goals of goal ${goal.id}, outside the scope of this work (graph_show gives the goal's acceptance):`, ...nonGoals.map(line => `- ${line}`))
  }
  if (goal !== undefined && norms.length > 0) {
    lines.push(`Norms in effect under goal ${goal.id}, approved by the human (graph_show gives the items of each):`, ...norms.map(norm => `- ${norm.id}: ${norm.title}`))
  }
  if ('rules' in denials && denials.rules.length > 0) {
    lines.push(
      'Calls the harness denied in this session, by rule (rule id: times). These rules still apply: take the right path a denial named instead of repeating the call.',
      ...denials.rules.map(({ rule, times }) => `- ${rule}: ${times}`),
    )
  }
  return lines
}
