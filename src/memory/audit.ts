/**
 * dsh-memory (audit foundation) — durable JSONL sinks under `<dir>/audit/`:
 * usage (per model-call token accounting) in the user-level directory,
 * violations (guard denials and shadow records) and workflow decisions in the project directory
 * (docs/DESIGN.md §2.4). The filesystem is injected; every sink appends one
 * JSON object per line and never rewrites history.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import type { GuardRecord } from '../guard/index.ts'
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
  /** The deletions of usage records, beside the usage journal (docs/DESIGN.md §2.4): written by hand when records are removed, read by the report. */
  readonly gaps?: string
}

/** Usage and its gaps under the user directory, violations and decisions under the project directory. */
export function auditPaths(homes: DataHomes): AuditPaths {
  const under = (home: string, file: string) => `${home.replace(/[\\/]+$/, '')}/audit/${file}`
  return {
    ...(homes.projectHome === undefined ? {} : { violations: under(homes.projectHome, 'violations.jsonl'), decisions: under(homes.projectHome, 'decisions.jsonl') }),
    ...(homes.userHome === undefined ? {} : { usage: under(homes.userHome, 'usage.jsonl'), gaps: under(homes.userHome, 'usage-gaps.jsonl') }),
  }
}

export interface AuditJournal {
  /** A guard denial, or a shadow record of the workspace-change fallback (`mode: 'shadow'`). */
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

/** Node fs-backed appender (mkdir -p then append with trailing newline). */
export function fsAppender(fs: AuditFs): AppendLine {
  return async (path, line) => {
    const dir = path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
    await fs.mkdir(dir, { recursive: true })
    await fs.appendFile(path, `${line}\n`)
  }
}

/**
 * The audit journal of one row. Directories are resolved at every write, so
 * a data service that activates after the row still counts. A write never
 * rejects into the caller (sinks never break a stream or a tool call); the
 * first failure of each sink is reported on the console, because a lost
 * record must not go unnoticed.
 */
export function rowJournal(row: string, homes: () => DataHomes, fs: AuditFs = nodeAuditFs): AuditJournal {
  const append = fsAppender(fs)
  const reported = new Set<string>()
  const report = (kind: string) => (error: unknown) => {
    if (reported.has(kind)) return
    reported.add(kind)
    console.warn(`${row}: ${kind} journal write failed: ${(error as Error).message}`)
  }
  return {
    violation: record => auditJournal(append, auditPaths(homes())).violation(record).catch(report('violations')),
    usage: record => auditJournal(append, auditPaths(homes())).usage(record).catch(report('usage')),
    decision: record => auditJournal(append, auditPaths(homes())).decision(record).catch(report('decisions')),
  }
}
