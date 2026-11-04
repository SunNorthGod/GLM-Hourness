/**
 * The time limit of M4's own checks (M4 design §6.3.1, decision
 * d-timeout-measured): three times the run time, not under the floor and not
 * over the ceiling. The first run time is the estimate the agent wrote on the
 * check line; after real runs it is the slowest of the recent ones; with
 * neither the limit is the ceiling. The human sees the limit next to the
 * check line when approving the tool node: `timeoutText` writes that
 * sentence from the same constants, and the graph tools return it for every
 * readable check line of an environment tool node (`envToolTimeouts`),
 * recording each estimate they wrote in the project's timing journal
 * (`estimateLines`, `appendTiming`).
 *
 * The journal (`<project directory>/env-checks/timing.jsonl`, append-only,
 * not in git) has five kinds of line: `estimate` (the graph tools), and
 * `run`, `value`, `timeout`, `queue` (the env row's runner). A check is keyed
 * `<tool node id>/<name>` and its command by `argvDigest`: runs under another
 * command do not count. `nextValue` reads the journal into the limit of the
 * next run and the `value` line to write when that limit changed;
 * `tidyTiming` rewrites the journal once per project and process. This file
 * is the one place the numbers are written; everything else reads them from
 * here.
 */
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Actor, GraphNode } from '../graph/schema.ts'
import { isEnvTool, nodeChecks } from './branch.ts'

/** The limit is this many times the run time. */
export const CHECK_TIMEOUT_FACTOR = 3
/** The run time is the slowest of this many recent runs. */
export const CHECK_RECENT_RUNS = 10
/** No limit is shorter: a cold start or a virus scan makes a one-second check slower now and then. */
export const CHECK_TIMEOUT_FLOOR_MS = 5_000
/** No limit is longer unless the main agent raises it for one check; with no estimate and no run the limit is this. */
export const CHECK_TIMEOUT_CAP_MS = 60_000
/** A step waits at most this long for its checks; a slower one goes on in the background and arrives in a later step. */
export const CHECK_STEP_DEADLINE_MS = 20_000
/** A check that waited this long for a process slot is dropped without running; the next edit queues it again. */
export const CHECK_QUEUE_WAIT_MS = 3 * CHECK_STEP_DEADLINE_MS

/** One check's limit and where its run time came from. */
export interface CheckTimeout {
  readonly limitMs: number
  /** The slowest recent run, the line's estimate, or neither (the ceiling). */
  readonly basis: 'runs' | 'estimate' | 'ceiling'
  /** Set when three times the run time was over the ceiling and the limit was held there. */
  readonly capped?: { readonly wantedMs: number }
}

/**
 * The limit of one check: the factor times the slowest of the last
 * CHECK_RECENT_RUNS entries of `recentMs` (oldest first; a run stopped at its
 * limit counts as that limit), else times the estimate; at least the floor,
 * at most the ceiling (then `capped` says what was wanted). No estimate and
 * no run give the ceiling. Pure.
 */
export function checkTimeout(input: {
  readonly estimateS?: number | undefined
  readonly recentMs: readonly number[]
  readonly factor?: number
  readonly floorMs?: number
  readonly capMs?: number
}): CheckTimeout {
  const factor = input.factor ?? CHECK_TIMEOUT_FACTOR
  const floorMs = input.floorMs ?? CHECK_TIMEOUT_FLOOR_MS
  const capMs = input.capMs ?? CHECK_TIMEOUT_CAP_MS
  const recent = input.recentMs.slice(-CHECK_RECENT_RUNS)
  const basis = recent.length > 0 ? 'runs' : input.estimateS === undefined ? 'ceiling' : 'estimate'
  if (basis === 'ceiling') return { limitMs: capMs, basis }
  const runMs = basis === 'runs' ? Math.max(...recent) : (input.estimateS ?? 0) * 1000
  const wantedMs = Math.max(floorMs, factor * runMs)
  return wantedMs > capMs ? { limitMs: capMs, basis, capped: { wantedMs } } : { limitMs: wantedMs, basis }
}

const seconds = (ms: number): number => ms / 1000

/**
 * The sentence the human reads next to a check line when approving its tool
 * node (design §6.3.1 item 3): the limit of the first run and the estimate it
 * came from, in one of four forms, at most 40 code points. Built from the
 * constants above.
 */
export function timeoutText(estimateS?: number): string {
  const timeout = checkTimeout({ estimateS, recentMs: [] })
  const limit = `超时 ${seconds(timeout.limitMs)} 秒`
  if (estimateS === undefined) return `${limit}（没有估计，先用最长的）`
  if (timeout.capped !== undefined) return `${limit}（估 ${estimateS} 秒，乘 ${CHECK_TIMEOUT_FACTOR} 超过 ${seconds(CHECK_TIMEOUT_CAP_MS)} 秒）`
  if (CHECK_TIMEOUT_FACTOR * estimateS * 1000 < CHECK_TIMEOUT_FLOOR_MS) return `${limit}（估 ${estimateS} 秒，乘 ${CHECK_TIMEOUT_FACTOR} 不足 ${seconds(CHECK_TIMEOUT_FLOOR_MS)} 秒）`
  return `${limit}（估 ${estimateS} 秒，乘 ${CHECK_TIMEOUT_FACTOR}）`
}

/** The key of one check in the journals and in check_limit: `<tool node id>/<check name>`. */
export function checkKey(tool: string, name: string): string {
  return `${tool}/${name}`
}

/** The digest the journals keep a command under: the first 8 hex digits of the SHA-256 of the argument vector as JSON. A changed command starts over. */
export function argvDigest(argv: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(argv)).digest('hex').slice(0, 8)
}

/**
 * An estimate on a check line was written or changed. The graph history
 * entry has no session field, so the graph tools record the session here
 * when graph_propose or graph_edit returns the timeouts; `actor` and
 * `historyAt` copy the history entry the engine just wrote.
 */
export interface EstimateLine {
  readonly kind: 'estimate'
  readonly at: string
  readonly check: string
  readonly argv: string
  readonly estimateS: number
  readonly node: string
  readonly actor: 'llm' | 'human'
  readonly historyAt: string
  readonly session?: string
}

/** The timeout sentence of one check line of a tool node. */
export interface CheckTimeoutText {
  /** The line's name. */
  readonly check: string
  readonly text: string
}

/** The timeouts of an environment tool node, one per readable check line in line order; undefined for any other node. */
export function envToolTimeouts(node: GraphNode): readonly CheckTimeoutText[] | undefined {
  if (!isEnvTool(node)) return undefined
  return nodeChecks(node).map(({ entry }) => ({ check: entry.name, text: timeoutText(entry.estimateSeconds) }))
}

/**
 * The estimates the write that made the node's last history entry put on an
 * environment tool node: a propose puts every check line with an estimate,
 * an edit the lines with an estimate its new acceptance conditions have and
 * its old ones did not have word for word. Any other node or operation puts
 * none. Pure but for `at`.
 */
export function estimateLines(node: GraphNode, session: string | undefined, at: Date): readonly EstimateLine[] {
  const last = node.history.at(-1)
  const actor = last?.actor === 'llm' || last?.actor === 'human' ? last.actor : undefined
  if (!isEnvTool(node) || last === undefined || actor === undefined) return []
  let added: (line: string) => boolean
  if (last.op === 'propose') added = () => true
  else if (last.op === 'edit' && last.changes?.acceptance !== undefined) {
    const before = last.changes.acceptance.from
    const old = new Set(Array.isArray(before) ? before.filter((line): line is string => typeof line === 'string') : [])
    added = line => !old.has(line)
  }
  else return []
  return nodeChecks(node).flatMap(({ line, entry }): EstimateLine[] => entry.estimateSeconds === undefined || !added(line) ? [] : [{
    kind: 'estimate',
    at: at.toISOString(),
    check: checkKey(node.id, entry.name),
    argv: argvDigest(entry.argv),
    estimateS: entry.estimateSeconds,
    node: node.id,
    actor,
    historyAt: last.at,
    ...(session === undefined ? {} : { session }),
  }])
}

/** A run that ended by itself, or was cut at its limit (`censored`; `ms` is then the limit). */
interface RunLine {
  readonly kind: 'run'
  readonly at: string
  readonly check: string
  readonly argv: string
  readonly ms: number
  readonly censored?: true
}

/** Where a timeout value came from: the line's estimate (with the history entry that wrote it), the recent runs, or nothing (the ceiling). */
type ValueSource =
  | { readonly by: 'estimate', readonly node: string, readonly rev: string, readonly actor?: Actor, readonly at?: string, readonly session?: string, readonly estimateS: number }
  | { readonly by: 'harness', readonly runs: readonly number[], readonly factor: number, readonly floorMs: number }
  | { readonly by: 'ceiling' }

/** A timeout value took effect. `cap` is the maximum that applied when it was computed (provenance only). */
export interface ValueLine {
  readonly kind: 'value'
  readonly at: string
  readonly check: string
  readonly argv: string
  readonly limitMs: number
  readonly previousMs?: number
  readonly cap: { readonly by: 'default' }
  /** Set when three times the run time was above the maximum and the value was held there. */
  readonly capped?: { readonly wantedMs: number }
  readonly source: ValueSource
}

/** A check was stopped at its limit. */
interface TimeoutLine {
  readonly kind: 'timeout'
  readonly at: string
  readonly check: string
  readonly argv: string
  readonly limitMs: number
  readonly elapsedMs: number
  readonly session?: string
  readonly outcome: 'not-finished'
}

/** A check waited CHECK_QUEUE_WAIT_MS for a process slot and was dropped without running. */
interface QueueLine {
  readonly kind: 'queue'
  readonly at: string
  readonly check: string
  readonly argv: string
  readonly waitedMs: number
  readonly running: number
  readonly session?: string
  readonly outcome: 'not-run'
}

export type TimingLine = RunLine | ValueLine | TimeoutLine | EstimateLine | QueueLine

const TIMING_KINDS: readonly string[] = ['run', 'value', 'timeout', 'estimate', 'queue']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a parsed journal line has the kind, check and command every line has (the rest is read where it is used). */
function isTimingLine(value: unknown): value is TimingLine {
  return isRecord(value) && typeof value.kind === 'string' && TIMING_KINDS.includes(value.kind) && typeof value.check === 'string' && typeof value.argv === 'string' && typeof value.at === 'string'
}

/** The journal of one project: its readable lines in order, and how many lines could not be read. */
export interface TimingBook {
  readonly lines: readonly TimingLine[]
  readonly bad: number
}

/** The journal file of a project directory. */
function timingFile(home: string): string {
  return join(home, 'env-checks', 'timing.jsonl')
}

/** The lines of a journal text; a line that is not JSON or not a timing line is counted and skipped. Pure. */
export function parseTiming(text: string): TimingBook {
  const lines: TimingLine[] = []
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

/** Read a project's journal: no file is an empty journal; any other failure is its error code, and the caller goes on without runs. */
export async function readTiming(home: string): Promise<TimingBook | { readonly error: string }> {
  try {
    return parseTiming(await readFile(timingFile(home), 'utf8'))
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' ? { lines: [], bad: 0 } : { error: code ?? (error instanceof Error ? error.message : String(error)) }
  }
}

/** Append one line to `<home>/env-checks/timing.jsonl` (append-only, not in git), creating the directory. Rejects on a write failure. */
export async function appendTiming(home: string, line: TimingLine): Promise<void> {
  const file = timingFile(home)
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8')
}

/** How many lines of each kind a check keeps when the journal is tidied (design §6.3.1 「整理」). */
const KEEP: Readonly<Record<TimingLine['kind'], number>> = { run: CHECK_RECENT_RUNS, value: 20, timeout: 20, queue: 20, estimate: 5 }

/** The journal after tidying: per check the latest lines of each kind (KEEP), in their order. Pure. */
export function tidiedLines(lines: readonly TimingLine[]): readonly TimingLine[] {
  const seen = new Map<string, number>()
  const kept: TimingLine[] = []
  for (const line of [...lines].reverse()) {
    const key = `${line.kind}\n${line.check}`
    const count = seen.get(key) ?? 0
    if (count >= KEEP[line.kind]) continue
    seen.set(key, count + 1)
    kept.push(line)
  }
  return kept.reverse()
}

/**
 * Rewrite a project's journal tidied (through a temporary file and a
 * rename); a journal that is already tidy is left alone. The problem when it
 * could not be read or written, undefined otherwise; a failure leaves the
 * journal as it was.
 */
export async function tidyTiming(home: string): Promise<string | undefined> {
  const book = await readTiming(home)
  if ('error' in book) return `检查的超时账读不出（${book.error}）`
  const tidy = tidiedLines(book.lines)
  if (book.bad === 0 && tidy.length === book.lines.length) return undefined
  const file = timingFile(home)
  const temporary = `${file}.${process.pid}.tmp`
  try {
    await writeFile(temporary, tidy.map(line => `${JSON.stringify(line)}\n`).join(''), 'utf8')
    await rename(temporary, file)
    return undefined
  }
  catch (error) {
    return `检查的超时账没整理成（${(error as NodeJS.ErrnoException).code ?? String(error)}）`
  }
}

/** The run times of one check under one command, oldest first, the last CHECK_RECENT_RUNS of them. */
function recentRuns(book: TimingBook, check: string, argv: string): readonly number[] {
  return book.lines.flatMap(line => line.kind === 'run' && line.check === check && line.argv === argv && typeof line.ms === 'number' ? [line.ms] : []).slice(-CHECK_RECENT_RUNS)
}

/** The latest value line of each check in the journal. */
export function lastValues(book: TimingBook): ReadonlyMap<string, ValueLine> {
  const values = new Map<string, ValueLine>()
  for (const line of book.lines) if (line.kind === 'value' && typeof line.limitMs === 'number') values.set(line.check, line)
  return values
}

/** The history entry an estimate on a check line comes from (design §6.3.1 「来源」①②). */
export interface EstimateOrigin {
  readonly node: string
  readonly rev: string
  readonly actor?: Actor
  readonly at?: string
}

/**
 * Which history entry wrote the check line as it stands: the last `edit`
 * whose new acceptance conditions hold the whole line, else the `propose`
 * that created the node; with the node's revision. Pure.
 */
export function estimateOrigin(node: Pick<GraphNode, 'id' | 'history'>, line: string, rev: string): EstimateOrigin {
  const edit = [...node.history].reverse().find(entry => {
    const to = entry.op === 'edit' ? entry.changes?.acceptance?.to : undefined
    return Array.isArray(to) && to.includes(line)
  })
  const entry = edit ?? node.history.find(candidate => candidate.op === 'propose')
  return { node: node.id, rev, ...(entry === undefined ? {} : { actor: entry.actor, at: entry.at }) }
}

/** What the runner needs to know of a check to give it a limit. */
export interface ValueInput {
  readonly check: string
  /** The digest of the check line's command (with `{files}`). */
  readonly argv: string
  readonly estimateS?: number
  readonly origin?: EstimateOrigin
}

/**
 * The limit of the next run of a check from the journal, and the value line
 * to append when the limit or the command changed since the check's last
 * value line (design §6.3.1 「可追溯」). An estimate's session is the one the
 * graph tools recorded for the same node and history entry; without one
 * there is no session. Pure but for `at`.
 */
export function nextValue(book: TimingBook, input: ValueInput, at: Date): { readonly timeout: CheckTimeout, readonly recent: readonly number[], readonly line?: ValueLine } {
  const recent = recentRuns(book, input.check, input.argv)
  const timeout = checkTimeout({ estimateS: input.estimateS, recentMs: recent })
  const last = lastValues(book).get(input.check)
  if (last !== undefined && last.limitMs === timeout.limitMs && last.argv === input.argv) return { timeout, recent }
  let source: ValueSource
  if (timeout.basis === 'runs') source = { by: 'harness', runs: recent, factor: CHECK_TIMEOUT_FACTOR, floorMs: CHECK_TIMEOUT_FLOOR_MS }
  else if (timeout.basis === 'ceiling' || input.estimateS === undefined) source = { by: 'ceiling' }
  else {
    const origin = input.origin
    const session = origin?.at === undefined ? undefined : [...book.lines].reverse().find((line): line is EstimateLine => line.kind === 'estimate' && line.node === origin.node && line.historyAt === origin.at && line.check === input.check)?.session
    source = {
      by: 'estimate',
      node: origin?.node ?? input.check.split('/')[0] ?? '',
      rev: origin?.rev ?? '',
      ...(origin?.actor === undefined ? {} : { actor: origin.actor }),
      ...(origin?.at === undefined ? {} : { at: origin.at }),
      ...(session === undefined ? {} : { session }),
      estimateS: input.estimateS,
    }
  }
  const line: ValueLine = {
    kind: 'value',
    at: at.toISOString(),
    check: input.check,
    argv: input.argv,
    limitMs: timeout.limitMs,
    ...(last === undefined ? {} : { previousMs: last.limitMs }),
    cap: { by: 'default' },
    ...(timeout.capped === undefined ? {} : { capped: timeout.capped }),
    source,
  }
  return { timeout, recent, line }
}

/** Seconds for people: whole when whole, else one decimal. */
export function secondsText(ms: number): string {
  const value = ms / 1000
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * The one sentence of where a value came from, for the loop board's details
 * and the morning report (design §6.3.1, §6.8). The details say only that a
 * value is held at the ceiling; `session` (the report's form) adds the
 * session an estimate was written in, or that it was not recorded, and keeps
 * the source before the held-at-the-ceiling clause. A session id is shown by
 * its first 8 characters after the rc.3 `session-` prefix.
 */
export function valueSourceText(line: ValueLine, session = false): string {
  const capped = line.capped === undefined ? undefined : `想要 ${secondsText(line.capped.wantedMs)} 秒，被上限截在 ${secondsText(line.limitMs)} 秒`
  if (capped !== undefined && !session) return capped
  const said = sourceText(line.source, session)
  return capped === undefined ? said : `${said}；${capped}`
}

function sourceText(source: ValueSource, session: boolean): string {
  if (source.by === 'harness') return `系统按最近 ${source.runs.length} 次，最慢 ${secondsText(Math.max(...source.runs))} 秒`
  if (source.by === 'ceiling') return '没有估计，用上限'
  const who = `${source.actor === 'human' ? '你' : '写检查的 agent '}估 ${source.estimateS} 秒`
  if (!session) return who
  return `${who}，${source.session === undefined ? '会话未记' : `会话 ${source.session.replace(/^session-/, '').slice(0, 8)}`}`
}
