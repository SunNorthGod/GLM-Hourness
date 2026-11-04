/**
 * The three output formats a check line may name (M4 design §6.4) and the
 * reader the loop board calls after a person's check entry ran
 * (`formatCheckOutput`, design §6.1.2). Pure. The exit code does not decide
 * whether there are findings (some checkers exit 1 when they have some);
 * output with no readable finding and an exit code other than 0 is
 * "not readable".
 */
import type { CheckFormat } from './check-entry.ts'

/** One finding of a check run. The changed-line mark is not here: it needs git and the editing session. */
interface Finding {
  readonly file: string
  readonly line: number
  readonly column?: number
  readonly rule?: string
  readonly message: string
}

/** What one run printed and how it ended. */
interface CheckRun {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** At most this many finding lines go back, each at most this many characters (design §6.1.2). */
const OUTPUT_LINES = 20
const LINE_LIMIT = 200

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

/** ESLint's built-in `json` format: an array of files, each with `filePath` and `messages`. */
function eslintFindings(stdout: string): readonly Finding[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  }
  catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((file: unknown) => {
    if (!isRecord(file) || typeof file.filePath !== 'string' || !Array.isArray(file.messages)) return []
    const path = file.filePath
    return file.messages.flatMap((message: unknown): Finding[] => {
      if (!isRecord(message) || typeof message.message !== 'string') return []
      const line = positive(message.line) ?? 1
      const column = positive(message.column)
      const rule = typeof message.ruleId === 'string' ? message.ruleId : undefined
      return [{ file: path, line, ...(column === undefined ? {} : { column }), ...(rule === undefined ? {} : { rule }), message: message.message }]
    })
  })
}

const TSC_LINE = /^(.+?)\((\d+),(\d+)\): (?:error|warning) (TS\d+): (.*)$/
const GCC_LINE = /^(.+?):(\d+)(?::(\d+))?:\s*(.*)$/

/** Line formats: tsc's `--pretty false` lines, or `<file>:<line>[:<col>]: <message>` (gcc style). Both streams are read. */
function lineFindings(format: 'tsc' | 'lines', run: CheckRun): readonly Finding[] {
  const found: Finding[] = []
  for (const raw of `${run.stdout}\n${run.stderr}`.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (format === 'tsc') {
      const match = TSC_LINE.exec(line)
      if (match !== null) found.push({ file: match[1] ?? '', line: Number(match[2]), column: Number(match[3]), rule: match[4] ?? '', message: match[5] ?? '' })
      continue
    }
    const match = GCC_LINE.exec(line)
    if (match === null || (match[1] ?? '').trim() === '' || Number(match[2]) <= 0) continue
    const column = match[3] === undefined ? undefined : Number(match[3])
    found.push({ file: match[1] ?? '', line: Number(match[2]), ...(column === undefined || column <= 0 ? {} : { column }), message: match[4] ?? '' })
  }
  return found
}

/** The findings of one run in one format. */
export function parseCheckOutput(format: CheckFormat, run: CheckRun): readonly Finding[] {
  return format === 'eslint-json' ? eslintFindings(run.stdout) : lineFindings(format, run)
}

/** One finding as one line: `file:line[:column] [rule] message`, at most 200 characters. */
function findingLine(finding: Finding): string {
  const place = `${finding.file}:${finding.line}${finding.column === undefined ? '' : `:${finding.column}`}`
  const text = `${place} ${finding.rule === undefined || finding.rule === '' ? '' : `${finding.rule} `}${finding.message}`.replace(/\s+/g, ' ').trim()
  return text.length <= LINE_LIMIT ? text : `${text.slice(0, LINE_LIMIT - 1)}…`
}

/**
 * The result of one run as findings, without the changed-line marks.
 * undefined: no finding is readable in that format and the exit code is not
 * 0; the loop board then reports the exit code and the tail of the output.
 * At most 20 lines of at most 200 characters.
 */
export function formatCheckOutput(format: CheckFormat, run: CheckRun): { readonly findings: number, readonly lines: readonly string[] } | undefined {
  const findings = parseCheckOutput(format, run)
  if (findings.length === 0 && run.exitCode !== 0) return undefined
  return { findings: findings.length, lines: findings.slice(0, OUTPUT_LINES).map(findingLine) }
}
