/**
 * dsh-memory (audit foundation) — durable JSONL sinks under `.llm/audit/`:
 * violations (guard denials), usage (per model-call token accounting), and
 * workflow decisions. The filesystem is injected; every sink appends one
 * JSON object per line and never rewrites history.
 */
import type { ViolationRecord } from '../guard/index.ts'
import type { TokenUsage } from '../glm-llm/lm-min.ts'

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

/** One workflow decision record (grading: L1 autonomous / L2 notify / L3 ask). */
export interface DecisionRecord {
  readonly at: string
  readonly level: 'L1' | 'L2' | 'L3'
  readonly kind: string
  readonly subject: string
  readonly detail?: string | undefined
}

export interface AuditPaths {
  readonly violations: string
  readonly usage: string
  readonly decisions: string
}

export function auditPaths(home: string): AuditPaths {
  const root = `${home.replace(/[\\/]+$/, '')}/audit`
  return {
    violations: `${root}/violations.jsonl`,
    usage: `${root}/usage.jsonl`,
    decisions: `${root}/decisions.jsonl`,
  }
}

/** Build the three-sink audit journal over an injected appender. */
export function auditJournal(append: AppendLine, paths: AuditPaths) {
  return {
    violation(record: ViolationRecord): Promise<void> {
      return append(paths.violations, JSON.stringify(record))
    },
    usage(record: UsageRecord): Promise<void> {
      return append(paths.usage, JSON.stringify(record))
    },
    decision(record: DecisionRecord): Promise<void> {
      return append(paths.decisions, JSON.stringify(record))
    },
  }
}

export type AuditJournal = ReturnType<typeof auditJournal>

/** Node fs-backed appender (mkdir -p then append with trailing newline). */
export function fsAppender(fs: {
  mkdir: (path: string, options: { recursive: boolean }) => Promise<unknown>
  appendFile: (path: string, data: string) => Promise<void>
}): AppendLine {
  return async (path, line) => {
    const dir = path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
    await fs.mkdir(dir, { recursive: true })
    await fs.appendFile(path, `${line}\n`)
  }
}
