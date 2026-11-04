/**
 * The one statistics reader of the violation journal (m4-gate G2, design
 * §3.3, §3.10): per rule, the denial count by origin, the four follow-up
 * counts, and what the most recent denial looked like; for the whole
 * project, what the journal itself lost (the gap records). Pure — over the
 * parsed journal lines, classified through the one classifier every reader
 * shares (classifyRecord). The morning report, the guard command line and
 * the rules board's rule page read this one function, so their numbers
 * cannot fork; a late denial counts as a denial, a deferral and a
 * record-only call do not count at all.
 */
import { classifyRecord, type FollowupRecord, type GuardRecord, type ViolationRecord } from './records.ts'

/** How much of a shell command or file target the last-denial look keeps (design §1.2 m4-gate item 3). */
export const SUBJECT_LIMIT = 60

/** What the most recent denial of a rule looked like (design §3.10): the tool, the command or target, the moment. */
interface LastDenial {
  readonly at: string
  readonly tool: string
  /** The shell command or file target, first 60 characters; absent when the call touched neither. */
  readonly subject?: string
}

interface RuleStat {
  /** Denials by origin (design §3.3): where the GLM dialect claimed the agent, and the rest. */
  readonly denials: Readonly<{ dialect: number, other: number }>
  /** The follow-up outcomes (design §3.3): right-path, verbatim retry, something else, no next call. */
  readonly followups: Readonly<{ 'right-path': number, repeat: number, other: number, none: number }>
  readonly last?: LastDenial
}

export interface RuleStats {
  readonly rules: ReadonlyMap<string, RuleStat>
  /** What the journal itself lost in the period (design §3.2): the gap records' totals, and the latest gap's until. */
  readonly unrecorded: { readonly records: number, readonly gaps: number, readonly last?: string }
}

export interface StatsOptions {
  /** The clock a relative `since` resolves against; only a relative since needs it, default the real clock. */
  readonly now?: Date | undefined
  /** Lower bound for the records counted: an ISO instant, or `<n>d` days before `now` (design §3.9). */
  readonly since?: string | undefined
}

/** The lower bound in milliseconds an options object's `since` names, or undefined for none; a value that parses to nothing bounds nothing. */
export function sinceCutoff(since: string | undefined, now: Date): number | undefined {
  if (since === undefined || since.trim().length === 0) return undefined
  const days = /^(\d+)d$/.exec(since.trim())?.[1]
  if (days !== undefined) return now.getTime() - Number(days) * 86_400_000
  const parsed = Date.parse(since)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** The look of one denial, as the journal keeps it (ViolationRecord.call). */
function lastDenialOf(record: ViolationRecord): LastDenial {
  const subject = record.call?.command ?? record.call?.target
  return {
    at: record.at,
    tool: record.tool,
    ...(subject === undefined ? {} : { subject: Array.from(subject).slice(0, SUBJECT_LIMIT).join('') }),
  }
}

/**
 * The statistics of one period of the journal. Records are keyed by their
 * `at`: with a `since`, only records stamped at or after it count, compared
 * as instants. A rule enters the table with its first denial or follow-up
 * and keeps the latest denial it has.
 */
export function ruleStats(records: readonly GuardRecord[], options: StatsOptions = {}): RuleStats {
  const cutoff = sinceCutoff(options.since, options.now ?? new Date())
  const rules = new Map<string, { denials: { dialect: number, other: number }, followups: { 'right-path': number, repeat: number, other: number, none: number }, last?: LastDenial }>()
  let lost = 0
  let gaps = 0
  let lastGap: string | undefined
  const inPeriod = (at: unknown): at is string => typeof at === 'string' && (cutoff === undefined || (!Number.isNaN(Date.parse(at)) && Date.parse(at) >= cutoff))
  const statOf = (rule: string): { denials: { dialect: number, other: number }, followups: { 'right-path': number, repeat: number, other: number, none: number }, last?: LastDenial } => {
    let stat = rules.get(rule)
    if (stat === undefined) {
      stat = { denials: { dialect: 0, other: 0 }, followups: { 'right-path': 0, repeat: 0, other: 0, none: 0 } }
      rules.set(rule, stat)
    }
    return stat
  }
  for (const record of records) {
    if (!inPeriod((record as { at?: unknown }).at)) continue
    const line = record as unknown as Readonly<Record<string, unknown>>
    const klass = classifyRecord(line)
    if (klass === 'denial' || klass === 'late-denial') {
      const denial = record as ViolationRecord
      const stat = statOf(denial.rule)
      stat.denials[denial.scope === 'other' ? 'other' : 'dialect'] += 1
      if (stat.last === undefined || Date.parse(denial.at) >= Date.parse(stat.last.at)) stat.last = lastDenialOf(denial)
    }
    else if (klass === 'followup') {
      const followup = record as FollowupRecord
      const outcome = followup.outcome
      if (outcome === 'right-path' || outcome === 'repeat' || outcome === 'other' || outcome === 'none') {
        statOf(followup.rule).followups[outcome] += 1
      }
    }
    else if (klass === 'gap') {
      const lineLost = typeof line.lost === 'number' ? line.lost : 0
      lost += lineLost
      gaps += 1
      if (typeof line.until === 'string' && (lastGap === undefined || Date.parse(line.until) > Date.parse(lastGap))) {
        lastGap = line.until
      }
    }
  }
  return {
    rules: new Map([...rules].map(([rule, stat]) => [rule, {
      denials: { ...stat.denials },
      followups: { ...stat.followups },
      ...(stat.last === undefined ? {} : { last: stat.last }),
    }])),
    unrecorded: { records: lost, gaps, ...(lastGap === undefined ? {} : { last: lastGap }) },
  }
}
