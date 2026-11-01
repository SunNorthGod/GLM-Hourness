/**
 * The text a lesson becomes where models read it (M5 design §4.2.1, §4.3,
 * §4.4, §4.6): the one line in a dispatch brief, the notice after a failed
 * command, the list of candidates waiting for the main agent, the reminder
 * that a lesson keeps coming back. English: these go to models. Every notice
 * says the lessons are advice, not rules. Pure functions.
 */
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { FAILURE_LIMIT, SESSION_WINDOW_DAYS, type FailureMatch } from './match.ts'
import { activeLessons, openCandidates, similar, type Candidate, type Lesson, type LessonsState, type Situation } from './model.ts'

export const BRIEF_LINE_MAX = 300
export const FAILURE_LINE_MAX = 400
const CANDIDATES_LISTED = 5

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** `text` cut to `max` characters with `…` at the end; a cut never leaves half of a surrogate pair. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  if (max < 1) return ''
  const kept = text.slice(0, max - 1)
  return `${/[\uD800-\uDBFF]$/.test(kept) ? kept.slice(0, -1) : kept}…`
}

/**
 * `build(parts)` with the parts cut, one after the other in `order`, only as
 * far as the result needs to fit in `max`. The fixed text of a line is far
 * shorter than `max`, so cutting every part to nothing would fit it.
 */
function fit<Key extends string>(parts: Readonly<Record<Key, string>>, order: readonly Key[], build: (parts: Readonly<Record<Key, string>>) => string, max: number): string {
  const current: Record<Key, string> = { ...parts }
  for (const key of order) {
    const over = build(current).length - max
    if (over <= 0) break
    current[key] = clip(current[key], Math.max(1, current[key].length - over))
  }
  return build(current)
}

/** The situation in a phrase: `files src/guard/**; commands Get-Content`. */
export function whenOf(situation: Situation): string {
  return [
    situation.files.length === 0 ? '' : `files ${situation.files.join(', ')}`,
    situation.tools.length === 0 ? '' : `tools ${situation.tools.join(', ')}`,
    situation.commands.length === 0 ? '' : `commands ${situation.commands.join(', ')}`,
    situation.errors.length === 0 ? '' : `errors ${situation.errors.map(fragment => `"${fragment}"`).join(', ')}`,
  ].filter(part => part !== '').join('; ')
}

/** `L-3f9a2c: when <when> → <pitfall> → <fix>`, at most 300 characters: the fix is cut first, then the situation, then the pitfall. */
export function briefLine(lesson: Lesson): string {
  return fit(
    { when: whenOf(lesson.situation), pitfall: oneLine(lesson.pitfall), fix: oneLine(lesson.fix) },
    ['fix', 'when', 'pitfall'],
    parts => `${lesson.id}: when ${parts.when} → ${parts.pitfall} → ${parts.fix}`,
    BRIEF_LINE_MAX,
  )
}

/** What a dispatch brief takes of a lesson. */
export interface BriefEntry {
  readonly id: string
  readonly when: string
  readonly problem: string
  readonly fix: string
  readonly line: string
}

export const briefEntry = (lesson: Lesson): BriefEntry => ({ id: lesson.id, when: whenOf(lesson.situation), problem: lesson.pitfall, fix: lesson.fix, line: briefLine(lesson) })

/** One lesson in the notice after a failure: `- L-6c1d02: <error fragment> → <pitfall> → <fix>`, at most 400 characters. */
function failureLine(match: FailureMatch): string {
  return fit(
    { fragment: oneLine(match.fragment), pitfall: oneLine(match.lesson.pitfall), fix: oneLine(match.lesson.fix) },
    ['fix', 'fragment', 'pitfall'],
    parts => `- ${match.lesson.id}: ${parts.fragment} → ${parts.pitfall} → ${parts.fix}`,
    FAILURE_LINE_MAX,
  )
}

/** The notice that follows a failed command whose output contains a lesson's error fragment: two lessons at most, 400 characters each. */
export function failureNotice(matches: readonly FailureMatch[]): string {
  return wrapSystemReminder([
    'This failure matches a lesson from earlier work (advice, not a rule; check that the fix still applies):',
    ...matches.slice(0, FAILURE_LIMIT).map(failureLine),
    'More with lessons_query.',
  ].join('\n'))
}

/** Where a candidate came from: the task of its evidence, if it has one. */
function sourceOf(candidate: Candidate): string {
  const task = candidate.evidence.find(item => item.startsWith('task:'))
  return task === undefined ? '' : ` from ${task.slice('task:'.length).split('@')[0] ?? ''}`
}

/** The open candidates for the main agent to merge, oldest first, five listed (§4.2.1); undefined when none is open. A candidate that reads like an active lesson says which. */
export function candidateNotice(state: LessonsState): string | undefined {
  const open = openCandidates(state).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : 1))
  if (open.length === 0) return undefined
  const lessons = activeLessons(state)
  const lines = open.slice(0, CANDIDATES_LISTED).map((candidate) => {
    const twin = lessons.find(lesson => similar(lesson, candidate))
    return `- ${candidate.id}${sourceOf(candidate)}: ${oneLine(candidate.pitfall)}${twin === undefined ? '' : ` (likely duplicate of ${twin.id})`}`
  })
  return wrapSystemReminder([
    `Lesson candidates waiting for you to merge (${open.length}):`,
    ...lines,
    ...(open.length > CANDIDATES_LISTED ? [`and ${open.length - CANDIDATES_LISTED} more`] : []),
    'Merge each with lessons_merge: new, into <lesson>, or drop. Lessons are advice, not rules.',
  ].join('\n'))
}

/** The reminder that a lesson matched failures in several sessions lately (§4.6). */
export function recurNotice(lesson: Lesson, sessions: number): string {
  return wrapSystemReminder(`Lesson ${lesson.id} matched failures in ${sessions} sessions in the last ${SESSION_WINDOW_DAYS} days. Lessons stay advice. If the harness should enforce it, record a rule proposal with rules_propose and put it to the user with propose_to_human; if you do not have rules_propose, put the point to the user in plain words with propose_to_human.`)
}
