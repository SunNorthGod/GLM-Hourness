/**
 * The guard command line (m4-gate G2, design §3.9): read-only over one
 * project's violation journal, the file the guard writes. It runs in its own
 * process, outside DSH, only on Node builtins, and never writes:
 *
 *   npm run -s guard -- records [--since 14d] [--rule <id>] [--show] [--home <dir>]
 *   npm run -s guard -- stats   [--since 14d] [--home <dir>]
 *
 * `records` lists one JSON document with the journal's lines: the key
 * (recordKey over the line, the id a follow-up record cites), the moment,
 * the rule, the class (classifyRecord — the one classifier every reader
 * shares), the origin's scope and the tool; `--show` adds the command or
 * target, so `--rule <id> --show` lists one rule's denials in full. `stats`
 * prints `ruleStats` as JSON. The project directory comes from `--home`,
 * else `<working directory>/.llm`; one that is not a directory, and a
 * command line that does not fit, exit 2 with one line on the standard
 * error. `--since` is an ISO instant or `<n>d` days before now.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { auditPaths } from '../memory/audit.ts'
import { ruleStats, sinceCutoff } from './measure.ts'
import { classifyRecord, recordKey, type GuardRecord } from './records.ts'

export interface CliIo {
  /** The directory the command line was started in: the workspace, unless `--home` says otherwise. */
  readonly cwd: string
  /** The moment `--since 14d` resolves against; only a test sets it. */
  readonly now?: Date | undefined
}

export interface CliResult {
  readonly exitCode: 0 | 2
  /** The JSON document, newline-terminated; empty when the command line or the directory did not fit. */
  readonly stdout: string
  /** One line saying what was wrong; empty on success. */
  readonly stderr: string
}

const done = (document: unknown): CliResult => ({ exitCode: 0, stdout: `${JSON.stringify(document, null, 2)}\n`, stderr: '' })
const refused = (message: string): CliResult => ({ exitCode: 2, stdout: '', stderr: `${message.replace(/\s+/g, ' ').trim()}\n` })

/** One line of the `records` listing. */
interface RecordLine {
  readonly key: string
  readonly at?: unknown
  readonly rule: unknown
  readonly class: string
  readonly scope: unknown
  readonly tool: unknown
  /** --show: what the call touched, as the journal keeps it. */
  readonly command?: unknown
  readonly target?: unknown
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<CliResult> {
  let parsed: { positionals: string[], values: Record<string, string | boolean | string[] | undefined> }
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        since: { type: 'string' },
        rule: { type: 'string' },
        show: { type: 'boolean', default: false },
        home: { type: 'string' },
      },
      allowPositionals: true,
    })
  }
  catch (error) {
    return refused(`guard: ${(error as Error).message}`)
  }
  const text = (value: string | boolean | string[] | undefined): string | undefined => typeof value === 'string' ? value : undefined
  const since = text(parsed.values.since)
  const [command] = parsed.positionals
  if ((command !== 'records' && command !== 'stats') || parsed.positionals.length > 1) {
    return refused('guard: usage: records [--since <iso|Nd>] [--rule <id>] [--show] [--home <dir>] | stats [--since <iso|Nd>] [--home <dir>]')
  }
  const home = text(parsed.values.home) ?? join(io.cwd, '.llm')
  const directory = await stat(home).then(info => info.isDirectory(), () => false)
  if (!directory) return refused(`guard: ${home} is not a directory`)
  const cutoff = sinceCutoff(since, io.now ?? new Date())
  if (since !== undefined && cutoff === undefined) {
    return refused(`guard: --since must be an ISO instant or a number of days like 14d, not "${since}"`)
  }
  const path = auditPaths({ projectHome: home }).violations
  const lines = path === undefined ? [] : (await readFile(path, 'utf8').catch(() => '')).split('\n').filter(line => line.trim().length > 0)
  const records = lines.flatMap(line => {
    try {
      return [JSON.parse(line) as Record<string, unknown>]
    }
    catch {
      return []
    }
  })
  const inPeriod = cutoff === undefined ? records : records.filter(record => typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at)) && Date.parse(record.at) >= cutoff)
  if (command === 'stats') {
    // The period is already cut above; ruleStats must not re-cut a relative
    // `since` against a different clock than the listing did.
    const stats = ruleStats(inPeriod as unknown as GuardRecord[], { now: io.now })
    return done({
      rules: Object.fromEntries([...stats.rules].map(([rule, stat]) => [rule, stat])),
      unrecorded: stats.unrecorded,
    })
  }
  const rule = text(parsed.values.rule)
  const listed = inPeriod
    .map(record => ({ record, key: recordKey(JSON.stringify(record)) }))
    .filter(({ record }) => rule === undefined || record.rule === rule)
    .map(({ record, key }): RecordLine => {
      const call = record.call as { command?: unknown, target?: unknown } | undefined
      return {
        key,
        at: record.at,
        rule: record.rule,
        class: classifyRecord(record),
        scope: record.scope,
        tool: record.tool,
        ...(parsed.values.show && typeof call === 'object' && call !== null
          ? { ...(call.command === undefined ? {} : { command: call.command }), ...(call.target === undefined ? {} : { target: call.target }) }
          : {}),
      }
    })
  return done(listed)
}
