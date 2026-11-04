/**
 * dsh-memory (audit foundation) — durable JSONL sinks under `<dir>/audit/`:
 * usage (per model-call token accounting) in the user-level directory,
 * violations (guard denials, the rules board's records, the fallback's
 * late records, follow-ups, lifts, gaps) and workflow decisions in the
 * project directory (docs/DESIGN.md §2.4). The filesystem is injected;
 * every sink appends one JSON object per line and never rewrites history.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { classifyRecord, type GapRecord, type GuardRecord } from '../guard/records.ts'
import type { DataHomes } from '../shared/data-home.ts'
import type { TokenUsage } from '../shared/lm-min.ts'

export type AppendLine = (path: string, line: string) => Promise<void>

/** One usage journal record (ZCode-panel metric vocabulary). */
export interface UsageRecord {
  readonly at: string
  readonly sessionId?: string | undefined
  readonly provider: string
  readonly model: string
  readonly purpose?: 'compaction' | 'session-title' | undefined
  readonly usage: TokenUsage
}

/**
 * One workflow decision record: a dispatch call the workflow row observed.
 * Lines written before the grading was removed also carry a `level`; readers
 * ignore it.
 */
export interface DecisionRecord {
  readonly at: string
  readonly kind: string
  readonly subject: string
  readonly detail?: string | undefined
}

/** Journal files; a sink whose directory is unknown has no path. */
export interface AuditPaths {
  readonly violations?: string
  readonly usage?: string
  readonly decisions?: string
  /** The daily counts of suppression comments (m4-suppressions), beside the violations journal. */
  readonly suppressions?: string
  /** The deletions of usage records, beside the usage journal (docs/DESIGN.md §2.4): written by hand when records are removed, read by the report. */
  readonly gaps?: string
}

/** Usage and its gaps under the user directory, violations, decisions and suppression counts under the project directory. */
export function auditPaths(homes: DataHomes): AuditPaths {
  const under = (home: string, file: string) => `${home.replace(/[\\/]+$/, '')}/audit/${file}`
  return {
    ...(homes.projectHome === undefined ? {} : { violations: under(homes.projectHome, 'violations.jsonl'), decisions: under(homes.projectHome, 'decisions.jsonl'), suppressions: under(homes.projectHome, 'suppressions.jsonl') }),
    ...(homes.userHome === undefined ? {} : { usage: under(homes.userHome, 'usage.jsonl'), gaps: under(homes.userHome, 'usage-gaps.jsonl') }),
  }
}

export interface AuditJournal {
  /** A guard denial, or a record of another kind the journal holds (src/guard/records.ts GuardRecord). */
  violation(record: GuardRecord): Promise<void>
  usage(record: UsageRecord): Promise<void>
  decision(record: DecisionRecord): Promise<void>
}

/** Build the three-sink audit journal over an injected appender; a sink without a path rejects. */
export function auditJournal(append: AppendLine, paths: AuditPaths): AuditJournal {
  const sink = (kind: keyof AuditPaths) => (record: object): Promise<void> => {
    const path = paths[kind]
    if (path === undefined) {
      const level = kind === 'usage' ? 'user-level directory (the data row glm-hourness/data)' : 'project directory (row home or the data row projectHome)'
      return Promise.reject(new Error(`no ${level} for the ${kind} journal`))
    }
    return append(path, JSON.stringify(record))
  }
  return { violation: sink('violations'), usage: sink('usage'), decision: sink('decisions') }
}

/** Filesystem the appender writes through (subset of node:fs/promises). */
export interface AuditFs {
  mkdir: (path: string, options: { recursive: boolean }) => Promise<unknown>
  appendFile: (path: string, data: string) => Promise<void>
}

const nodeAuditFs: AuditFs = {
  mkdir: (path, options) => mkdir(path, options),
  appendFile: (path, data) => appendFile(path, data),
}

/**
 * The write in flight per journal file, shared by every appender of the
 * package: the rows write their records without awaiting them (a denial is
 * journaled fire-and-forget, its follow-up a turn later), and two unchained
 * appends to one file land in whichever order the filesystem finishes them.
 */
const inFlight = new Map<string, Promise<void>>()

/**
 * Node fs-backed appender (mkdir -p then append with trailing newline).
 * Appends to the same file run one after the other, in the order they were
 * asked for, so a follow-up never lands before the denial it settles; a failed
 * append rejects its own caller and does not hold up the next one.
 */
export function fsAppender(fs: AuditFs): AppendLine {
  return (path, line) => {
    const write = async (): Promise<void> => {
      const dir = path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
      await fs.mkdir(dir, { recursive: true })
      await fs.appendFile(path, `${line}\n`)
    }
    const run = (inFlight.get(path) ?? Promise.resolve()).then(write)
    const settled = run.catch(() => {})
    inFlight.set(path, settled)
    void settled.then(() => { if (inFlight.get(path) === settled) inFlight.delete(path) })
    return run
  }
}

/**
 * How one violation write came out (m4-gate G1, §3.2). rowJournal catches a
 * failed append and resolves normally, so a caller cannot tell a lost record
 * from a written one without this. 'no-home': no project directory could be
 * resolved, nothing was attempted (the row health says so).
 */
export type JournalOutcome = 'written' | 'failed' | 'no-home'

/** How many code points of an error code the gap record keeps. */
const CODE_LIMIT = 40

/** What a journal instance holds for the records it could not write (design §3.2, F13). */
interface LostGap {
  lost: number
  classes: Map<string, number>
  since: string
  until: string
  code?: string
}

/** Merge one lost record (or one failed gap write) into the pending gap; the caller has taken the gap out of the journal's way. */
function mergeLost(gap: LostGap | undefined, record: GuardRecord | undefined, error: unknown, now: () => Date): LostGap {
  const merged: LostGap = gap ?? { lost: 0, classes: new Map(), since: '', until: '' }
  if (record !== undefined) {
    const line = record as unknown as Record<string, unknown>
    const at = typeof line.at === 'string' && line.at.length > 0 ? line.at : now().toISOString()
    const klass = classifyRecord(line)
    if (merged.since === '') merged.since = at
    merged.until = at
    merged.lost += 1
    merged.classes.set(klass, (merged.classes.get(klass) ?? 0) + 1)
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (typeof code === 'string' && code.length > 0) merged.code = Array.from(code).slice(0, CODE_LIMIT).join('')
  return merged
}

/** The gap line for what a journal instance holds; written alone or ahead of the next record. */
function gapLine(gap: LostGap, row: string, now: () => Date): string {
  const line: GapRecord = {
    kind: 'gap',
    at: now().toISOString(),
    row,
    lost: gap.lost,
    classes: Object.fromEntries([...gap.classes].sort(([left], [right]) => left.localeCompare(right))),
    since: gap.since,
    until: gap.until,
    ...(gap.code === undefined ? {} : { code: gap.code }),
  }
  return JSON.stringify(line)
}

/**
 * The audit journal of one row. Directories are resolved at every write, so
 * a data service that activates after the row still counts. A write never
 * rejects into the caller; the first failure of each sink is reported on the
 * console, because a lost record must not go unnoticed. The violation sink
 * reports how the write came out, and a failed append is held as a pending
 * gap: the next successful append writes one gap line directly before the
 * record it carries, so the gap stands exactly where the records went
 * missing (design §3.2); `flush` writes it on its own, for a session that
 * ends without a further call.
 */
export interface RowJournal {
  violation(record: GuardRecord): Promise<JournalOutcome>
  usage(record: UsageRecord): Promise<void>
  decision(record: DecisionRecord): Promise<void>
  /** Write the pending gap record without a new record; nothing happens when there is none. */
  flush(): Promise<void>
}

export function rowJournal(row: string, homes: () => DataHomes, fs: AuditFs = nodeAuditFs, now: () => Date = () => new Date()): RowJournal {
  const append = fsAppender(fs)
  const reported = new Set<string>()
  const report = (kind: string) => (error: unknown) => {
    if (reported.has(kind)) return
    reported.add(kind)
    console.warn(`${row}: ${kind} journal write failed: ${(error as Error).message}`)
  }
  let gap: LostGap | undefined
  const takeGap = (): LostGap | undefined => {
    const taken = gap
    gap = undefined
    return taken
  }
  const violation = (record: GuardRecord): Promise<JournalOutcome> => {
    const path = auditPaths(homes()).violations
    if (path === undefined) return Promise.resolve('no-home')
    // The take happens in the same tick as the call, before any await, so concurrent writes never each write a gap line.
    const taken = takeGap()
    const text = taken === undefined ? JSON.stringify(record) : `${gapLine(taken, row, now)}\n${JSON.stringify(record)}`
    return append(path, text).then(
      () => 'written',
      (error: unknown) => {
        gap = mergeLost(taken, record, error, now)
        report('violations')(error)
        return 'failed'
      },
    )
  }
  return {
    violation,
    usage: record => auditJournal(append, auditPaths(homes())).usage(record).catch(report('usage')),
    decision: record => auditJournal(append, auditPaths(homes())).decision(record).catch(report('decisions')),
    async flush() {
      const path = auditPaths(homes()).violations
      if (path === undefined) return
      const taken = takeGap()
      if (taken === undefined) return
      try {
        await append(path, gapLine(taken, row, now))
      }
      catch (error) {
        gap = mergeLost(taken, undefined, error, now)
      }
    },
  }
}

/** The per-project journal of one row: one rowJournal instance per project root, so console warnings are per project and per sink (design §2.2). */
export interface ProjectJournal {
  violation(record: GuardRecord, cwd: string | undefined): Promise<JournalOutcome>
  /** Flush every cached project journal (the gate calls it when a session ends). */
  flush(): Promise<void>
}

export function projectJournal(row: string, homeFor: (cwd: string | undefined) => string | undefined, fs: AuditFs = nodeAuditFs): ProjectJournal {
  const cached = new Map<string, RowJournal>()
  const journalOf = (cwd: string | undefined): RowJournal | undefined => {
    const home = homeFor(cwd)
    if (home === undefined) return undefined
    const key = home.replace(/[\\/]+$/, '')
    let journal = cached.get(key)
    if (journal === undefined) {
      journal = rowJournal(row, () => ({ projectHome: home }), fs)
      cached.set(key, journal)
    }
    return journal
  }
  return {
    violation: (record, cwd) => journalOf(cwd)?.violation(record) ?? Promise.resolve('no-home'),
    flush: async () => {
      for (const journal of cached.values()) await journal.flush()
    },
  }
}
