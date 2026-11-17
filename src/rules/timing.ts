/**
 * The timing journal of the rules board's scripts (docs/ORCHESTRATION.md
 * §16.16, decision d-timeout-measured): how long each approved script took,
 * what timeout was in force, where that value came from, and what every
 * timeout did to its call — the traceability the decision asks for, with the
 * sources, the floors and the ceilings of `effectiveTimeoutSeconds`
 * (src/loops/trigger.ts, the one place the numbers are computed).
 *
 * The journal (`<root>/.llm/rules/timing.jsonl`, append-only, not in git)
 * has four kinds of line: `estimate` (propose-tool.ts, the writer's estimate
 * with the session that proposed it), `run`, `value` and `timeout` (the
 * runner side, `recordScriptRuns`, which `runJudgedScripts` calls after a
 * batch of scripts came back). A rule keyed by its id; a run cut at its
 * timeout counts at that timeout, the way M4's checker counts one. A value
 * is written when the effective value changed since the rule's last `value`
 * line, and a measured value held at the ceiling has the main agent told
 * once per change (the board's notices, F8 of the decision). The readers are
 * the three callers of `judge` (the recent runs fill a rule's timeout), the
 * view (the page's sources, history and timeouts) and `tidyTiming`, which
 * rewrites the journal once per project and process the way env-checks
 * keeps its own (src/env/timeout.ts).
 *
 * Every function never throws: a journal that cannot be read is an empty
 * one, a write that fails comes back as a problem string for the caller's
 * own audible channel, and the verdict of a call never depends on any of it.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { GATE_TIMEOUT_MAX_SECONDS, effectiveTimeoutSeconds, type TimeoutInput } from '../loops/trigger.ts'
import { openRulesBoard } from './engine.ts'
import { rulesPaths, type StoreIo } from './store.ts'

/** The runs a value is computed from, the last ones per rule (M4's checker keeps the same many). */
export const RULES_RECENT_RUNS = 10

/** The writer's estimate of one run, recorded when the proposal is made; the session is the proposing one. */
export interface EstimateLine {
  readonly kind: 'estimate'
  readonly at: string
  readonly rule: string
  readonly seconds: number
  readonly session?: string
}

/** One finished run of an approved script, as `runJudgedScripts` read it. A run cut at its timeout is outcome `timeout`. */
export interface RunLine {
  readonly kind: 'run'
  readonly at: string
  readonly rule: string
  /** The id the executor gave the run (the envelope's `run`); the source of a computed value names these. */
  readonly run: string
  readonly ms: number
  readonly outcome: 'allow' | 'block' | 'queue' | 'failed' | 'timeout' | 'refused'
}

/** Where a timeout value came from: the writer's estimate (with the session), the named runs, or neither (the ceiling). */
export type TimingSource =
  | { readonly by: 'estimate', readonly estimateS: number, readonly session?: string }
  | { readonly by: 'runs', readonly runIds: readonly string[], readonly seconds: number, readonly factor: number }
  | { readonly by: 'ceiling' }

/** A timeout value took effect; written when it changed since the rule's last one. */
export interface ValueLine {
  readonly kind: 'value'
  readonly at: string
  readonly rule: string
  readonly seconds: number
  readonly previousSeconds?: number
  /** Set when the value was held at the ceiling: what it wanted to be. */
  readonly capped?: { readonly wantedSeconds: number }
  readonly source: TimingSource
}

/** A script was stopped at its timeout: the entry, the limit, the actual time, and how the rule's failure setting treated the call. */
export interface TimeoutLine {
  readonly kind: 'timeout'
  readonly at: string
  readonly rule: string
  readonly limitSeconds: number
  readonly elapsedSeconds: number
  readonly outcome: 'allowed' | 'blocked'
}

export type ScriptTimingLine = EstimateLine | RunLine | ValueLine | TimeoutLine

const TIMING_KINDS: readonly string[] = ['estimate', 'run', 'value', 'timeout']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a parsed line has the kind, rule and time every line has (the rest is read where it is used). */
function isTimingLine(value: unknown): value is ScriptTimingLine {
  return isRecord(value) && typeof value.kind === 'string' && TIMING_KINDS.includes(value.kind) && typeof value.rule === 'string' && typeof value.at === 'string'
}

/** The journal of one project: its readable lines in order, and how many lines could not be read. */
export interface TimingBook {
  readonly lines: readonly ScriptTimingLine[]
  readonly bad: number
}

/** The lines of a journal text; a line that is not JSON or not a timing line is counted and skipped. Pure. */
export function parseTiming(text: string): TimingBook {
  const lines: ScriptTimingLine[] = []
  let bad = 0
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    try {
      const line: unknown = JSON.parse(raw)
      if (isTimingLine(line)) lines.push(line)
      else bad++
    }
    catch {
      bad++
    }
  }
  return { lines, bad }
}

/** The journal file of a project root (next to the board's runtime state). */
export function timingFile(root: string, rulesDir?: string): string {
  return join(rulesPaths(root, rulesDir).runtimeDir, 'timing.jsonl')
}

/** Read a project's journal: no file is an empty journal; any other failure is an empty one too (the callers go on). Synchronous, for the judge and the view. */
export function readTimingSync(root: string, rulesDir?: string): TimingBook {
  try {
    return parseTiming(readFileSync(timingFile(root, rulesDir), 'utf8'))
  }
  catch {
    return { lines: [], bad: 0 }
  }
}

/** Append one line to the journal, creating the directory; resolves with the problem when the write failed, undefined otherwise. Never rejects. */
async function appendTiming(root: string, line: ScriptTimingLine, rulesDir?: string): Promise<string | undefined> {
  const file = timingFile(root, rulesDir)
  try {
    await mkdir(dirname(file), { recursive: true })
    await appendLine(file, line)
    return undefined
  }
  catch (error) {
    return `规则脚本的超时账没写成（${(error as NodeJS.ErrnoException).code ?? (error instanceof Error ? error.message : String(error))}）`
  }
}

/**
 * The writer's estimate of one script run, recorded when its proposal was made (decision d-timeout-measured
 * 「可追溯」: an estimate is recorded with the session that wrote it). Resolves with the problem when the write
 * failed; a lost line only means the session reads 「会话未记」 on the page. Never rejects.
 */
export async function recordEstimate(root: string, line: Omit<EstimateLine, 'kind'>, rulesDir?: string): Promise<string | undefined> {
  return appendTiming(root, { kind: 'estimate', ...line }, rulesDir)
}

async function appendLine(file: string, line: ScriptTimingLine): Promise<void> {
  await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8')
}

/** The seconds one run counts for in a value: whole seconds, rounded up, so the value and the page's check of three times the run time agree. Pure. */
export function runSecondsOf(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0
}

/** The latest runs of one rule, oldest first, the last RULES_RECENT_RUNS of them, as `effectiveTimeoutSeconds` reads them. Pure. */
export function recentRunsOf(lines: readonly ScriptTimingLine[], rule: string): TimeoutInput['recent'] {
  return lines
    .flatMap(line => line.kind === 'run' && line.rule === rule ? [{ runId: line.run, seconds: runSecondsOf(line.ms) }] : [])
    .slice(-RULES_RECENT_RUNS)
}

/** The rule's last value line. Pure. */
export function lastValueOf(lines: readonly ScriptTimingLine[], rule: string): ValueLine | undefined {
  return [...lines].reverse().find((line): line is ValueLine => line.kind === 'value' && line.rule === rule)
}

/** The rule's latest estimate line, for the session a value's estimate came from. Pure. */
export function latestEstimateOf(lines: readonly ScriptTimingLine[], rule: string): EstimateLine | undefined {
  return [...lines].reverse().find((line): line is EstimateLine => line.kind === 'estimate' && line.rule === rule)
}

/**
 * The latest runs of every rule the journal holds, as `judge`'s `timing` option reads them: a rule's timeout
 * is filled from these when the rule writes none. A journal that cannot be read gives an empty map, and the
 * judgement goes on with the estimate or the ceiling. Reads the file once; pure from there.
 */
export function timingOf(root: string, rulesDir?: string): ReadonlyMap<string, readonly { readonly runId: string, readonly seconds: number }[]> {
  const byRule = new Map<string, Array<{ readonly runId: string, readonly seconds: number }>>()
  for (const line of readTimingSync(root, rulesDir).lines) {
    if (line.kind !== 'run') continue
    const list = byRule.get(line.rule) ?? []
    list.push({ runId: line.run, seconds: runSecondsOf(line.ms) })
    byRule.set(line.rule, list)
  }
  for (const [rule, list] of byRule) byRule.set(rule, list.slice(-RULES_RECENT_RUNS))
  return byRule
}

/**
 * The value line to append for a rule after its recent runs changed: the effective timeout of the decision and,
 * when it differs from the rule's last value line, the line with its source, the old value and whether the ceiling
 * held it. `estimate` is the rule action's `estimateSeconds`; the session of an estimate source is the proposing
 * one, read from the journal's estimate lines. Pure but for nothing: the caller stamps `at`.
 */
export function valueLineFor(input: {
  readonly rule: string
  readonly estimate?: number
  readonly recent: TimeoutInput['recent']
  readonly last: ValueLine | undefined
  readonly estimates: readonly ScriptTimingLine[]
  readonly at: string
}): { readonly decision: ReturnType<typeof effectiveTimeoutSeconds>, readonly line?: ValueLine } {
  const { rule, recent, last, at } = input
  const estimate = typeof input.estimate === 'number' && Number.isFinite(input.estimate) && input.estimate >= 1 ? input.estimate : undefined
  const decision = effectiveTimeoutSeconds({ recent, purpose: 'gate', ...(estimate === undefined ? {} : { estimate }) })
  if (last !== undefined && last.seconds === decision.seconds) return { decision }
  const slowestS = recent.length === 0 ? 0 : Math.max(...recent.map(run => run.seconds))
  const wantedSeconds = decision.source === 'ceiling' ? undefined
    : decision.source === 'estimate' ? Math.ceil(3 * (estimate ?? 0))
      : Math.ceil(3 * slowestS)
  const source: TimingSource = decision.source === 'ceiling' ? { by: 'ceiling' }
    : decision.source === 'estimate' ? { by: 'estimate', estimateS: estimate ?? 0, ...(latestEstimateOf(input.estimates, rule)?.session === undefined ? {} : { session: latestEstimateOf(input.estimates, rule)!.session }) }
      : { by: 'runs', runIds: decision.source, seconds: slowestS, factor: 3 }
  const line: ValueLine = {
    kind: 'value',
    at,
    rule,
    seconds: decision.seconds,
    ...(last === undefined ? {} : { previousSeconds: last.seconds }),
    ...(decision.capped === true && wantedSeconds !== undefined ? { capped: { wantedSeconds } } : {}),
    source,
  }
  return { decision, line }
}

/** How many lines of each kind a rule keeps when the journal is tidied (the way env-checks keeps its own). */
const KEEP: Readonly<Record<ScriptTimingLine['kind'], number>> = { run: RULES_RECENT_RUNS, value: 20, timeout: 20, estimate: 5 }

/** The journal after tidying: per rule the latest lines of each kind (KEEP), in their order. Pure. */
export function tidiedTimingLines(lines: readonly ScriptTimingLine[]): readonly ScriptTimingLine[] {
  const seen = new Map<string, number>()
  const kept: ScriptTimingLine[] = []
  for (const line of [...lines].reverse()) {
    const key = `${line.kind}\n${line.rule}`
    const count = seen.get(key) ?? 0
    if (count >= KEEP[line.kind]) continue
    seen.set(key, count + 1)
    kept.push(line)
  }
  return kept.reverse()
}

/** The projects this process has tidied: once per project and process, as the env row's checker does. */
const tidied = new Set<string>()

/**
 * Rewrite a project's journal tidied, at most once per project and process. Resolves with the problem when it
 * could not be read or written, undefined otherwise; a failure leaves the journal as it was.
 */
async function tidyTiming(root: string, rulesDir?: string): Promise<string | undefined> {
  if (tidied.has(root)) return undefined
  tidied.add(root)
  const file = timingFile(root, rulesDir)
  let book: TimingBook
  try {
    book = parseTiming(await readFile(file, 'utf8'))
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : `规则脚本的超时账读不出（${(error as NodeJS.ErrnoException).code ?? String(error)}）`
  }
  const tidy = tidiedTimingLines(book.lines)
  if (book.bad === 0 && tidy.length === book.lines.length) return undefined
  const temporary = `${file}.${process.pid}.tmp`
  try {
    await writeFile(temporary, tidy.map(line => `${JSON.stringify(line)}\n`).join(''), 'utf8')
    await rename(temporary, file)
    return undefined
  }
  catch (error) {
    return `规则脚本的超时账没整理成（${(error as NodeJS.ErrnoException).code ?? String(error)}）`
  }
}

/** One run of one script, as the runner hands it to the journal: what `ScriptOutcome` says plus the limit that was in force. */
export interface RecordedRun {
  readonly rule: string
  readonly run: string
  readonly outcome: 'allow' | 'block' | 'queue' | 'failed' | 'timeout' | 'refused'
  readonly ms?: number
  /** The timeout the run was given; a run that was stopped at it carries it into the person's timeout record. */
  readonly limitSeconds?: number
  /** The rule's failure setting, which says how the call was treated when the run timed out. */
  readonly onError?: 'allow' | 'block'
}

/** What the journal needs to compute a value for the rules of one batch: their estimates and whether their timeout is pinned. */
export interface RuleTimingFacts {
  readonly estimate?: number
  /** The rule writes its own `timeoutSeconds`: it is the value, and no measured value takes it over. */
  readonly pinned: boolean
}

/**
 * Land a batch of script runs in the journal (decision d-timeout-measured 「可追溯」): the runs, the timeouts with
 * their limit, actual time and how the call was treated, and — for a rule whose timeout is not pinned — the value
 * line when the effective value changed, computed over the journal's recent runs plus this batch's. A measured
 * value held at the ceiling has the main agent told once per change (a notice in the board's `notices`, carried by
 * the step reminder). Resolves with the problems, one per failed write; never rejects and never throws, and a
 * journal that fails changes no verdict.
 */
export async function recordScriptRuns(parts: {
  readonly root: string
  /** The row's rules directory override, as the callers were configured with. */
  readonly rulesDir?: string
  /** The board's file operations, as the row was configured with, for the notice of a held value. */
  readonly io?: StoreIo
  readonly facts: (rule: string) => RuleTimingFacts | undefined
  readonly runs: readonly RecordedRun[]
  readonly now: Date
}): Promise<readonly string[]> {
  const problems: string[] = []
  try {
    const book = readTimingSync(parts.root, parts.rulesDir)
    const batch = parts.runs.map(run => ({ ...run, at: parts.now.toISOString() }))
    for (const run of batch) {
      if (typeof run.ms !== 'number') continue
      const problem = await appendTiming(parts.root, { kind: 'run', at: run.at, rule: run.rule, run: run.run, ms: run.ms, outcome: run.outcome }, parts.rulesDir)
      if (problem !== undefined) problems.push(problem)
    }
    for (const run of batch) {
      if (run.outcome !== 'timeout' || run.limitSeconds === undefined) continue
      const problem = await appendTiming(parts.root, {
        kind: 'timeout',
        at: run.at,
        rule: run.rule,
        limitSeconds: run.limitSeconds,
        elapsedSeconds: typeof run.ms === 'number' ? Math.round(run.ms / 100) / 10 : 0,
        outcome: run.onError === 'block' ? 'blocked' : 'allowed',
      }, parts.rulesDir)
      if (problem !== undefined) problems.push(problem)
    }
    const rules = [...new Set(parts.runs.map(run => run.rule))]
    for (const rule of rules) {
      const facts = parts.facts(rule)
      if (facts === undefined || facts.pinned) continue
      const batchRuns = batch.filter(run => run.rule === rule && typeof run.ms === 'number').map(run => ({ runId: run.run, seconds: runSecondsOf(run.ms as number) }))
      if (batchRuns.length === 0) continue
      const recent = [...recentRunsOf(book.lines, rule), ...batchRuns].slice(-RULES_RECENT_RUNS)
      const made = valueLineFor({ rule, ...(facts.estimate === undefined ? {} : { estimate: facts.estimate }), recent, last: lastValueOf(book.lines, rule), estimates: book.lines, at: parts.now.toISOString() })
      if (made.line === undefined) continue
      const problem = await appendTiming(parts.root, made.line, parts.rulesDir)
      if (problem !== undefined) problems.push(problem)
      if (made.line.capped !== undefined && made.line.source.by === 'runs') problems.push(...await tellHeldValue(parts, rule, made.line))
    }
    const tidy = await tidyTiming(parts.root, parts.rulesDir)
    if (tidy !== undefined) problems.push(tidy)
  }
  catch (error) {
    problems.push(`规则脚本的超时账没有记上（${error instanceof Error ? error.message : String(error)}）`)
  }
  return problems
}

/** The main agent's words when a measured value was held at the ceiling (the decision F8: the harness does not raise it). */
export function heldValueText(line: ValueLine, ceilingSeconds: number): string {
  const { source } = line
  const slowest = source.by === 'runs' ? source.seconds : 0
  return `[rules board] Rule ${line.rule}'s script ran its slowest of the last ${source.by === 'runs' ? source.runIds.length : 0} recorded runs in ${slowest} s; three times that (${line.capped?.wantedSeconds ?? 0} s) is above the ${ceilingSeconds} s ceiling, so the timeout stays at ${ceilingSeconds} s. Make the script faster, or tell the human the ceiling should change.`
}

/** The notice one held value waits as, for the main agent's next step on this host. */
async function tellHeldValue(parts: {
  readonly root: string
  readonly rulesDir?: string
  readonly io?: StoreIo
}, rule: string, line: ValueLine): Promise<readonly string[]> {
  try {
    const board = openRulesBoard({ projectRoot: parts.root, ...(parts.rulesDir === undefined ? {} : { rulesDir: parts.rulesDir }), ...(parts.io === undefined ? {} : { io: parts.io }) })
    const written = await board.apply('harness', { op: 'notice-add', kind: 'timeout-capped', rule, text: heldValueText(line, GATE_TIMEOUT_MAX_SECONDS) })
    return written.ok ? [] : [`规则 ${rule} 的超时保持在上限的提醒没有写成：${written.error.message}`]
  }
  catch (error) {
    return [`规则 ${rule} 的超时保持在上限的提醒没有写成：${error instanceof Error ? error.message : String(error)}`]
  }
}
