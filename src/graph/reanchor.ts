/**
 * What the step projection adds when it re-anchors after a compaction
 * (docs/ORCHESTRATION.md §2.5 重锚): the non-goals of the goal the focus is
 * under, and the rules the harness denied in this session with how many
 * times. Only the notice whose reason is `compaction` carries them, after
 * the projection; the notice keeps the projection's digest, so the next step
 * sees no change and adds nothing, and no other step carries them.
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
import type { Projection } from './projection.ts'

/** The session's denials by rule, most denied first, or why the journal could not be read. */
type SessionDenials = { readonly rules: ReadonlyArray<{ readonly rule: string, readonly times: number }> } | { readonly problem: string }

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

/**
 * The lines a re-anchoring adds after the projection: the goal's non-goals
 * when the focus could be projected and its goal has any, the denied rules
 * when the session has any. Empty when there is neither.
 */
export function reanchorLines(projection: Projection | undefined, denials: SessionDenials): string[] {
  const top = projection?.ancestors.at(-1)
  const goal = projection?.node.type === 'goal' ? projection.node : top?.type === 'goal' ? top : undefined
  const nonGoals = goal?.nonGoals ?? []
  const lines: string[] = []
  if (goal !== undefined && nonGoals.length > 0) {
    lines.push(`Non-goals of goal ${goal.id}, outside the scope of this work (graph_show gives the goal's acceptance):`, ...nonGoals.map(line => `- ${line}`))
  }
  if ('rules' in denials && denials.rules.length > 0) {
    lines.push(
      'Calls the harness denied in this session, by rule (rule id: times). These rules still apply: take the right path a denial named instead of repeating the call.',
      ...denials.rules.map(({ rule, times }) => `- ${rule}: ${times}`),
    )
  }
  return lines
}
