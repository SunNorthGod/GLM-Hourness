/**
 * M4's own checker (M4 design §6.2, §6.3, §6.5): the check lines with `when`
 * of the project's approved tool nodes run after the edits they match, in
 * the checkout the files are in, and the agent that changed the files reads
 * the result before its next step. Only these: a person's check entries on
 * the loop board run in the board's executor, not here.
 *
 * Every process starts through the boards' shared executor
 * (src/loops/script.ts `runCommand`, queue `direct`: no shell, the program
 * resolved outside the project, the whitelist environment, the tree ended at
 * the limit). This row owns the concurrency: at most CHECK_SLOTS checks run
 * in the whole process, the rest wait in arrival order, and one that waited
 * CHECK_QUEUE_WAIT_MS is dropped without starting; the checks whose ceiling
 * the main agent raised (check_limit, limit-tool.ts) take at most
 * CHECK_RAISED_SLOTS of them, so a stuck one leaves the other slot to the
 * checks with the default ceiling. A step waits for its
 * checks up to the longest of their limits, at most CHECK_STEP_DEADLINE_MS;
 * a slower one goes on in the background and its result arrives with a
 * later step of the same session. A check still running is not started a
 * second time; files whose size and modification time did not change, under
 * the same node revision, are not checked again. A check that could not
 * start, that the executor refused, or whose output could not be read is on
 * the session's row health, degrading it, until its next run that reads;
 * CHECK_FAILURE_LIMIT such runs in a row and it is not run again in the
 * session. A timeout does not count and does not degrade: it is on the row
 * health as a remark until the check next finishes (design §6.3.1).
 *
 * Every limit comes from the timing journal (timeout.ts) under the ceiling
 * of limits.jsonl (limit-tool.ts): the value line
 * when it changes, a run line for every run that ended, a timeout line and a
 * censored run for a run stopped at its limit, a queue line for a dropped
 * one. With no loop board the checks do not run (design §6.1.2: the rules
 * of the project are listed on the board or nowhere). Nothing here throws.
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { GitRun } from '../data/git-process.ts'
import { projectHomeFor, projectRootOf } from '../data/project-home.ts'
import { readGraph } from '../graph/row-health.ts'
import type { GraphNode } from '../graph/schema.ts'
import { graphService } from '../graph/service.ts'
import { commandText, runCommand, type CommandRequest, type ScriptResult } from '../loops/script.ts'
import type { ListedRun } from '../loops/service.ts'
import { DETAILS_MAX_LINES, DETAILS_MAX_WIDTH, loopsService } from '../loops/service.ts'
import { matchesFilter } from '../loops/trigger.ts'
import type { DerivedMessage, ServiceLookup, UserNotice } from '../shared/dsh-min.ts'
import { createUserNotice } from '../shared/dsh-min.ts'
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { envBranch, nodeChecks, type EnvTool } from './branch.ts'
import { changedLines, type ChangedLines, type EditMarks } from './changed-lines.ts'
import { fillCheckArgv, type CheckEntry, type CheckFormat } from './check-entry.ts'
import { CHECKS_NOTICE_SOURCE, checkNoticeBody, languageOf, limitBasis, missingCheckLine, NO_BOARD_CHECKS_LINE, queuedSentence, type CheckResult, type MarkedFinding } from './check-notice.ts'
import type { EditedStep } from './edited.ts'
import { limitSetting, readLimits, readLimitsSync, type LimitBook } from './limit-tool.ts'
import { parseCheckOutput } from './parsers.ts'
import {
  appendTiming, argvDigest, capMsOf, checkKey, checkTimeout, CHECK_QUEUE_WAIT_MS, CHECK_STEP_DEADLINE_MS, CHECK_TIMEOUT_CAP_MS, estimateOrigin, lastValues,
  nextValue, readTiming, secondsText, tidyTiming, valueSourceText, type CheckTimeout, type TimingBook, type TimingLine, type ValueLine,
} from './timeout.ts'

/** At most this many checks run at once in the whole process. */
export const CHECK_SLOTS = 2
/** Of them, the checks whose ceiling the main agent raised over CHECK_TIMEOUT_CAP_MS take at most this many (design §6.3, N17). */
export const CHECK_RAISED_SLOTS = 1
/** A check that could not start, or whose output could not be read, this many times in a row is not run again in the session. */
export const CHECK_FAILURE_LIMIT = 3
/** Each session hears once per language that no check covers its edits. */
export const MISSING_CHECK_NOTICES = 1

/** Output a run keeps for reading (design §6.3: 1 MiB); the log takes all of it. */
const CHECK_OUTPUT_BYTES = 1_048_576
/** A step waits this long past the longest limit, so a check stopped at its limit still reports in the step that started it. */
const KILL_SETTLE_MS = 1_500
/** Session log directories older than this are removed, the first time a project's checks run in a process (design §6.3). */
const LOG_KEEP_MS = 7 * 24 * 3600 * 1000
/** Sessions the checker remembers; the oldest leaves first. */
const SESSION_LIMIT = 64
/** At most this many checks on the loop board's page (design §6.8); the lines and their width are the board's limits (src/loops/service.ts). */
const DETAIL_CHECKS = 10

const fold = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path
const slashes = (path: string): string => path.split(sep).join('/')
const codePoints = (text: string, limit: number): string => [...text].length <= limit ? text : `${[...text].slice(0, limit - 1).join('')}…`
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** How one slot ticket ended: the run's result, or dropped unstarted after its wait. */
type SlotOutcome = { readonly kind: 'ran', readonly result: ScriptResult } | { readonly kind: 'dropped', readonly waitedMs: number, readonly running: number }

/** The process-wide process slots of M4's checks. */
export interface CheckSlots {
  /**
   * Start `run` once a slot is free, in order of arrival; still waiting
   * after `waitMs`, it is dropped without starting. A `raised` run (its
   * ceiling raised over the default) waits while the raised slots are taken
   * and keeps its place, without holding back the runs behind it.
   */
  enter(run: () => Promise<ScriptResult>, waitMs: number, raised?: boolean): { readonly done: Promise<SlotOutcome>, readonly started: () => boolean }
  running(): number
}

export function createCheckSlots(slots: number = CHECK_SLOTS, clock: () => number = Date.now, raisedSlots: number = CHECK_RAISED_SLOTS): CheckSlots {
  let busy = 0
  let raisedBusy = 0
  const queue: Array<{ readonly start: () => void, readonly raised: boolean }> = []
  const pump = (): void => {
    for (let index = 0; index < queue.length && busy < slots;) {
      const waiting = queue[index]
      if (waiting === undefined || (waiting.raised && raisedBusy >= raisedSlots)) {
        index++
        continue
      }
      queue.splice(index, 1)
      waiting.start()
    }
  }
  return {
    running: () => busy,
    enter(run, waitMs, raised = false) {
      let started = false
      const done = new Promise<SlotOutcome>(resolveDone => {
        const entered = clock()
        const start = (): void => {
          started = true
          clearTimeout(timer)
          busy++
          if (raised) raisedBusy++
          run().then(
            result => { resolveDone({ kind: 'ran', result }) },
            (error: unknown) => { resolveDone({ kind: 'ran', result: { kind: 'crashed', reason: 'io', message: message(error), durationMs: clock() - entered } }) },
          ).finally(() => {
            busy--
            if (raised) raisedBusy--
            pump()
          })
        }
        const ticket = { start, raised }
        const timer = setTimeout(() => {
          const at = queue.indexOf(ticket)
          if (at < 0) return
          queue.splice(at, 1)
          resolveDone({ kind: 'dropped', waitedMs: clock() - entered, running: busy })
        }, waitMs)
        timer.unref()
        queue.push(ticket)
        pump()
      })
      return { done, started: () => started }
    },
  }
}

/**
 * The log file of one run: `<home>/env-checks/<first 8 of the session id>/<UTC time>-<tool id>-<name>.log`.
 * rc.3 session ids are `session-<uuid>`: the prefix is dropped, so the directory is the 8 hex digits the sweep knows.
 */
export function checkLogFile(home: string, session: string, at: Date, tool: string, name: string): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '')
  const prefix = session.replace(/^session-/, '').slice(0, 8).replace(/[^A-Za-z0-9_-]/g, '_') || 'session'
  return join(home, 'env-checks', prefix, `${stamp}-${tool}-${name}.log`)
}

/** Remove session log directories (8 hex digits) older than seven days; other names are left alone. Never throws. */
export function sweepCheckLogs(home: string, nowMs: number): void {
  const dir = join(home, 'env-checks')
  let names: string[]
  try {
    names = readdirSync(dir)
  }
  catch {
    return
  }
  for (const name of names) {
    if (!/^[0-9a-f]{8}$/.test(name)) continue
    try {
      const path = join(dir, name)
      const stat = statSync(path)
      if (stat.isDirectory() && nowMs - stat.mtimeMs > LOG_KEEP_MS) rmSync(path, { recursive: true, force: true })
    }
    catch {
      // A directory that cannot be removed now goes another day.
    }
  }
}

/** One check line with `when` of an approved tool node, with what the journal and the page need. */
interface OwnCheck {
  readonly tool: EnvTool
  readonly node: GraphNode
  readonly line: string
  readonly entry: CheckEntry & { readonly paths: readonly string[] }
  readonly key: string
}

/**
 * The check lines with `when` of the approved tool nodes of the project a
 * working directory is in, and the unreadable lines; undefined without a
 * readable graph. The checker runs these, and check_limit takes their keys.
 */
export async function readOwnChecks(ctx: ServiceLookup, cwd: string): Promise<{ readonly checks: readonly OwnCheck[], readonly issues: readonly string[] } | undefined> {
  const dir = graphService(ctx)?.dirFor(cwd)
  if (dir === undefined) return undefined
  const read = await readGraph(dir, cwd)
  if ('failure' in read) return undefined
  const branch = envBranch(read.graph)
  const checks: OwnCheck[] = []
  for (const tool of branch.tools) {
    const node = read.graph.nodes.get(tool.id)
    if (node === undefined) continue
    for (const { line, entry } of nodeChecks(node)) {
      if (entry.paths === undefined) continue
      checks.push({ tool, node, line, entry: { ...entry, paths: entry.paths }, key: checkKey(tool.id, entry.name) })
    }
  }
  return { checks, issues: branch.issues }
}

/** One run in flight. */
interface Job {
  readonly session: string
  readonly cwd: string
  readonly check: OwnCheck
  readonly format: CheckFormat
  readonly root: string
  readonly files: readonly string[]
  readonly digest: string
  readonly timeout: CheckTimeout
  readonly recent: readonly number[]
  /** The ceiling in force for the check: the main agent's setting, else the default. */
  readonly capMs: number
  readonly home: string | undefined
  readonly logFile: string | undefined
  readonly marks: ReadonlyMap<string, EditMarks>
}

/** A result waiting for the session's next step, with what the loop board's run record takes from it. */
interface Delivery {
  readonly result: CheckResult
  readonly cwd: string
  readonly exitCode?: number
  readonly durationMs?: number
}

interface SessionChecks {
  readonly running: Map<string, Promise<void>>
  readonly results: Delivery[]
  readonly failures: Map<string, number>
  /** A check over its failure limit: `pending` until the session was told once. */
  readonly skipped: Map<string, 'pending' | 'told'>
  /** The row health's words for each check whose latest run failed (degrading), and for each whose latest run timed out (a remark), by check key. */
  readonly failing: Map<string, string>
  readonly timedOut: Map<string, string>
  readonly stamps: Map<string, string>
  readonly logs: Map<string, string>
  readonly told: Map<string, number>
  boardTold: boolean
}

/** What the loop board's page reads of one project (design §6.8 details). */
interface ProjectSnapshot {
  readonly checks: ReadonlyArray<{ readonly title: string, readonly key: string, readonly paths: readonly string[], readonly argv: readonly string[], readonly estimateS?: number }>
  readonly values: Map<string, ValueLine>
  /** The project directory: the page reads limits.jsonl there every time, so a raise or a reset shows before the check runs again. */
  readonly home?: string
}

export interface CheckerOptions {
  readonly ctx: ServiceLookup
  /** A lasting problem on the session's row health, by key; undefined withdraws it; `degrades` false is a remark that leaves the state. */
  readonly note: (sessionId: string, key: string, text: string | undefined, degrades?: boolean) => void
  /** One run of the board's `env.checks-after-edit`, every time results go to an agent. */
  readonly recordRun: (run: Omit<ListedRun, 'entry'>) => void
  readonly run?: (request: CommandRequest) => Promise<ScriptResult>
  readonly slots?: CheckSlots
  readonly now?: () => Date
  readonly stepDeadlineMs?: number
  readonly queueWaitMs?: number
  readonly git?: (root: string, args: readonly string[]) => Promise<GitRun>
}

export interface Checker {
  /** The checks notice of one step, or undefined. Never rejects. */
  step(step: EditedStep): Promise<UserNotice | undefined>
  /** The loop board's lines for `env.checks-after-edit` in one project: synchronous, from memory, empty before any step there. */
  details(project: string): readonly string[]
}

/** The findings counts the latest checks notice recorded, by check key. */
function lastCounts(history: readonly DerivedMessage[]): Readonly<Record<string, number>> {
  let counts: Readonly<Record<string, number>> = {}
  for (const message of history) {
    if (message.role !== 'user' || message.source?.kind !== CHECKS_NOTICE_SOURCE) continue
    const checks = message.source.checks
    const value = typeof checks === 'object' && checks !== null ? (checks as { readonly counts?: unknown }).counts : undefined
    counts = typeof value === 'object' && value !== null ? value as Readonly<Record<string, number>> : {}
  }
  return counts
}

/** A path as the agent reads it: relative to its working directory when inside, else absolute, with forward slashes. */
function shownPath(path: string, cwd: string): string {
  const inside = relative(cwd, path)
  return slashes(inside !== '' && !inside.startsWith('..') && !isAbsolute(inside) ? inside : path)
}

/** The sizes and modification times of the files under a node revision: an unchanged stamp does not run again. */
function stampOf(rev: string, root: string, files: readonly string[]): string {
  return JSON.stringify([rev, ...files.map(file => {
    try {
      const stat = statSync(resolve(root, file))
      return `${file}:${stat.size}:${stat.mtimeMs}`
    }
    catch {
      return `${file}:gone`
    }
  })])
}

/** The run record of one delivery (design §6.8): `failed` when any check failed, `skipped`, `reported` with findings, else `ran`. */
function runRecord(deliveries: readonly Delivery[]): Omit<ListedRun, 'entry'> {
  const results = deliveries.map(delivery => delivery.result)
  const failure = results.find(result => result.kind === 'failed' || result.kind === 'timeout' || result.kind === 'dropped')
  const reason = failure === undefined
    ? undefined
    : failure.kind === 'timeout'
      ? `${failure.name}: timeout ${secondsText(failure.limitMs)}s/${(failure.elapsedMs / 1000).toFixed(1)}s`
      : failure.kind === 'dropped'
        ? `${failure.name}: queue ${Math.round(failure.waitedMs / 1000)}s`
        : failure.kind === 'failed' ? `${failure.name}: ${failure.reason.split(/\r?\n/)[0] ?? ''}` : undefined
  const outcome: ListedRun['outcome'] = failure !== undefined
    ? 'failed'
    : results.every(result => result.kind === 'skipped')
      ? 'skipped'
      : results.some(result => result.kind === 'findings' && result.findings.length > 0) ? 'reported' : 'ran'
  const durations = deliveries.flatMap(delivery => delivery.durationMs === undefined ? [] : [delivery.durationMs])
  const exits = deliveries.flatMap(delivery => delivery.exitCode === undefined ? [] : [delivery.exitCode])
  return {
    cwd: deliveries[0]?.cwd ?? '',
    outcome,
    ...(durations.length === 0 ? {} : { durationMs: Math.max(...durations) }),
    ...(exits.length === 0 ? {} : { exits }),
    ...(reason === undefined ? {} : { reason: codePoints(reason, 120) }),
  }
}

export function createChecker(options: CheckerOptions): Checker {
  const { ctx, note } = options
  const run = options.run ?? runCommand
  const slots = options.slots ?? createCheckSlots()
  const now = options.now ?? (() => new Date())
  const stepDeadlineMs = options.stepDeadlineMs ?? CHECK_STEP_DEADLINE_MS
  const queueWaitMs = options.queueWaitMs ?? CHECK_QUEUE_WAIT_MS
  const sessions = new Map<string, SessionChecks>()
  const snapshots = new Map<string, ProjectSnapshot>()
  const prepared = new Map<string, Promise<void>>()
  const usedLogs = new Set<string>()

  const stateOf = (id: string): SessionChecks => {
    let state = sessions.get(id)
    if (state === undefined) {
      state = { running: new Map(), results: [], failures: new Map(), skipped: new Map(), failing: new Map(), timedOut: new Map(), stamps: new Map(), logs: new Map(), told: new Map(), boardTold: false }
      sessions.set(id, state)
      while (sessions.size > SESSION_LIMIT) sessions.delete(sessions.keys().next().value ?? id)
    }
    return state
  }

  /** The first time a project directory is seen in this process: tidy its journal and sweep old logs (design §6.3, §6.3.1 「整理」). */
  const prepare = (home: string, session: string): Promise<void> => {
    let ready = prepared.get(fold(home))
    if (ready === undefined) {
      ready = tidyTiming(home).then(problem => {
        if (problem !== undefined) note(session, 'checks', problem)
        sweepCheckLogs(home, now().getTime())
      })
      prepared.set(fold(home), ready)
    }
    return ready
  }

  const write = async (job: Job, line: TimingLine): Promise<void> => {
    if (job.home === undefined) return
    if (line.kind === 'value') snapshots.get(fold(projectRootOf(job.cwd) ?? job.root))?.values.set(line.check, line)
    try {
      await appendTiming(job.home, line)
    }
    catch (error) {
      note(job.session, 'checks', `检查的超时账写不进：${(error as NodeJS.ErrnoException).code ?? message(error)}`)
    }
  }

  /** The session's row health lines of its checks: the failed ones degrade, the timed-out ones are a remark (design §6.3.1). */
  const health = (session: string, state: SessionChecks): void => {
    note(session, 'checks-failed', state.failing.size === 0 ? undefined : [...state.failing.values()].join('；'))
    note(session, 'checks-timeout', state.timedOut.size === 0 ? undefined : [...state.timedOut.values()].join('；'), false)
  }

  /** A run that could not start, was refused, or could not be read: on the row health, counted, and over the limit the check is not run again in the session. */
  const failed = (job: Job, state: SessionChecks, reason: string): CheckResult => {
    const key = job.check.key
    const count = (state.failures.get(key) ?? 0) + 1
    state.failures.set(key, count)
    if (count >= CHECK_FAILURE_LIMIT) {
      state.skipped.set(key, 'pending')
      state.failing.set(key, `${key} 本会话不再跑：连续 ${CHECK_FAILURE_LIMIT} 次跑不起来或输出读不懂`)
    }
    else state.failing.set(key, `${key} 没跑成：${reason.split(/\r?\n/)[0] ?? ''}`)
    state.timedOut.delete(key)
    health(job.session, state)
    return { kind: 'failed', name: job.check.entry.name, key, reason, ...logOf(job) }
  }

  const logOf = (job: Job): { readonly log?: string } => job.logFile === undefined ? {} : { log: shownPath(job.logFile, job.cwd) }

  /** The findings of a run with their files relative to the checkout and their changed-line marks. */
  const marked = async (job: Job, findings: ReturnType<typeof parseCheckOutput>): Promise<readonly MarkedFinding[]> => {
    const lines = new Map<string, Promise<ChangedLines>>()
    return Promise.all(findings.map(async (finding): Promise<MarkedFinding> => {
      const absolute = isAbsolute(finding.file) ? finding.file : resolve(job.root, finding.file)
      const inside = relative(job.root, absolute)
      const file = inside !== '' && !inside.startsWith('..') && !isAbsolute(inside) ? slashes(inside) : slashes(absolute)
      let changed = false
      if (job.files.includes(file)) {
        let found = lines.get(file)
        if (found === undefined) {
          found = changedLines(job.root, file, job.marks.get(fold(resolve(job.root, file))), options.git)
          lines.set(file, found)
        }
        const set = await found
        changed = set === 'all' || set.has(finding.line)
      }
      return { ...finding, file, changed }
    }))
  }

  /** Turn a ticket's end into a result for the session's next step, writing the journal lines first. */
  const settle = async (job: Job, state: SessionChecks, jobKey: string, outcome: SlotOutcome): Promise<void> => {
    const at = now().toISOString()
    const base = { check: job.check.key, argv: job.digest }
    const name = job.check.entry.name
    let delivery: Delivery
    if (outcome.kind === 'dropped') {
      await write(job, { kind: 'queue', at, ...base, waitedMs: outcome.waitedMs, running: outcome.running, session: job.session, outcome: 'not-run' })
      delivery = { cwd: job.cwd, result: { kind: 'dropped', name, key: job.check.key, waitedMs: outcome.waitedMs, running: outcome.running } }
    }
    else {
      const result = outcome.result
      if (result.kind === 'exited') {
        await write(job, { kind: 'run', at, ...base, ms: result.durationMs })
        const findings = parseCheckOutput(job.format, result)
        if (findings.length === 0 && result.exitCode !== 0) {
          delivery = { cwd: job.cwd, exitCode: result.exitCode, durationMs: result.durationMs, result: failed(job, state, `the output could not be read as ${job.format} (exit code ${result.exitCode})`) }
        }
        else {
          state.failures.set(job.check.key, 0)
          state.failing.delete(job.check.key)
          state.timedOut.delete(job.check.key)
          health(job.session, state)
          delivery = { cwd: job.cwd, exitCode: result.exitCode, durationMs: result.durationMs, result: { kind: 'findings', name, key: job.check.key, findings: await marked(job, findings), ...logOf(job) } }
        }
      }
      else if (result.kind === 'timeout') {
        await write(job, { kind: 'timeout', at, ...base, limitMs: job.timeout.limitMs, elapsedMs: result.durationMs, session: job.session, outcome: 'not-finished' })
        await write(job, { kind: 'run', at, ...base, ms: job.timeout.limitMs, censored: true })
        const next = checkTimeout({ estimateS: job.check.entry.estimateSeconds, recentMs: [...job.recent, job.timeout.limitMs], capMs: job.capMs })
        state.timedOut.set(job.check.key, `${job.check.key} 没跑完：上限 ${secondsText(job.timeout.limitMs)} 秒，跑了 ${(result.durationMs / 1000).toFixed(1)} 秒`)
        health(job.session, state)
        delivery = {
          cwd: job.cwd,
          durationMs: result.durationMs,
          result: { kind: 'timeout', name, key: job.check.key, elapsedMs: result.durationMs, limitMs: job.timeout.limitMs, basis: limitBasis(job.timeout, job.check.entry.estimateSeconds, job.recent), nextLimitMs: next.limitMs, capMs: job.capMs, ...logOf(job) },
        }
      }
      else delivery = { cwd: job.cwd, ...('durationMs' in result ? { durationMs: result.durationMs } : {}), result: failed(job, state, result.message) }
    }
    if (job.logFile !== undefined) state.logs.set(job.check.key, shownPath(job.logFile, job.cwd))
    state.running.delete(jobKey)
    state.results.push(delivery)
  }

  /** Start the checks this step's edits match; what the agent reads about left-out files and uncovered languages goes to `notes` and `tail`. */
  const launch = async (step: EditedStep, cwd: string, state: SessionChecks): Promise<{ readonly started: ReadonlyArray<{ readonly name: string, readonly started: () => boolean, readonly settled: Promise<void>, readonly limitMs: number }>, readonly notes: readonly string[], readonly uncovered: readonly string[] }> => {
    const session = step.session.id
    const project = projectRootOf(cwd)
    const found = await readOwnChecks(ctx, cwd)
    note(session, 'check-lines', found === undefined || found.issues.length === 0 ? undefined : found.issues.join('；'))
    const checks = found?.checks ?? []
    const home = projectHomeFor(ctx, undefined, cwd)
    if (home !== undefined) await prepare(home, session)
    let book: TimingBook = { lines: [], bad: 0 }
    let limits: LimitBook = { lines: [], bad: 0 }
    if (home !== undefined) {
      const read = await readTiming(home)
      if ('error' in read) note(session, 'checks', `检查的超时账读不出（${read.error}）：按没有实测算`)
      else book = read
      const set = await readLimits(home)
      if ('error' in set) note(session, 'checks', `检查上限的设置读不出（${set.error}）：按没有调高算`)
      else limits = set
    }
    const lines = [...book.lines]
    if (project !== undefined) {
      snapshots.set(fold(project), {
        checks: checks.map(check => ({ title: check.tool.title, key: check.key, paths: check.entry.paths, argv: check.entry.argv, ...(check.entry.estimateSeconds === undefined ? {} : { estimateS: check.entry.estimateSeconds }) })),
        values: new Map(lastValues(book)),
        ...(home === undefined ? {} : { home }),
      })
    }
    const started: Array<{ readonly name: string, readonly started: () => boolean, readonly settled: Promise<void>, readonly limitMs: number }> = []
    const notes: string[] = []
    const uncovered = new Set<string>()
    for (const group of step.groups) {
      // Files of another project are not this project's checks' business.
      if (project === undefined || fold(projectRootOf(group.root) ?? group.root) !== fold(project)) continue
      for (const file of group.files) {
        const language = languageOf(file)
        if (language !== undefined && !checks.some(check => matchesFilter({ files: { paths: check.entry.paths } }, { files: [file] }, group.root))) uncovered.add(language)
      }
      for (const check of checks) {
        const files = group.files.filter(file => matchesFilter({ files: { paths: check.entry.paths } }, { files: [file] }, group.root))
        if (files.length === 0) continue
        const skipped = state.skipped.get(check.key)
        if (skipped !== undefined) {
          if (skipped === 'pending') {
            state.skipped.set(check.key, 'told')
            const log = state.logs.get(check.key)
            state.results.push({ cwd, result: { kind: 'skipped', name: check.entry.name, key: check.key, failures: CHECK_FAILURE_LIMIT, ...(log === undefined ? {} : { log }) } })
          }
          continue
        }
        const jobKey = `${check.key}\n${fold(group.root)}`
        if (state.running.has(jobKey)) continue
        const stamp = stampOf(check.tool.rev, group.root, files)
        if (state.stamps.get(jobKey) === stamp) continue
        state.stamps.set(jobKey, stamp)
        for (const file of files) if (/[\0\r\n]/.test(file)) notes.push(`${check.entry.name} skipped ${JSON.stringify(file)}: the path has a newline.`)
        const filled = fillCheckArgv(check.entry.argv, files)
        if (filled.dropped > 0) notes.push(`${check.entry.name}: ${filled.dropped} more file${filled.dropped === 1 ? ' was' : 's were'} not checked: the command line is full.`)
        const digest = argvDigest(check.entry.argv)
        const setting = limitSetting(limits, check.key)
        const value = nextValue({ lines, bad: 0 }, { check: check.key, argv: digest, ...(check.entry.estimateSeconds === undefined ? {} : { estimateS: check.entry.estimateSeconds }), origin: estimateOrigin(check.node, check.line, check.tool.rev), ...(setting === undefined ? {} : { setting }) }, now())
        const capMs = capMsOf(setting)
        const at = now()
        let logFile = home === undefined ? undefined : checkLogFile(home, session, at, check.tool.id, check.entry.name)
        for (let n = 2; logFile !== undefined && usedLogs.has(fold(logFile)); n++) logFile = logFile.replace(/(-\d+)?\.log$/, `-${n}.log`)
        if (logFile !== undefined) usedLogs.add(fold(logFile))
        const job: Job = { session, cwd, check, format: check.entry.format, root: group.root, files, digest, timeout: value.timeout, recent: value.recent, capMs, home, logFile, marks: new Map([...step.marks].map(([path, mark]) => [fold(path), mark])) }
        if (value.line !== undefined) {
          lines.push(value.line)
          await write(job, value.line)
        }
        const request: CommandRequest = { queue: 'direct', project, cwd: group.root, argv: filled.argv, timeoutMs: value.timeout.limitMs, maxOutputBytes: CHECK_OUTPUT_BYTES, ...(logFile === undefined ? {} : { logFile }) }
        // A raised ceiling can hold a slot up to CHECK_TIMEOUT_RAISED_MAX_MS: such checks share CHECK_RAISED_SLOTS (design §6.3 rule 1).
        const ticket = slots.enter(() => run(request), queueWaitMs, capMs > CHECK_TIMEOUT_CAP_MS)
        const settled = ticket.done.then(outcome => settle(job, state, jobKey, outcome)).catch((error: unknown) => {
          state.running.delete(jobKey)
          note(session, 'checks', `检查没跑成：${message(error)}`)
        })
        state.running.set(jobKey, settled)
        started.push({ name: check.entry.name, started: ticket.started, settled, limitMs: value.timeout.limitMs })
      }
    }
    return { started, notes, uncovered: [...uncovered] }
  }

  return {
    async step(step) {
      try {
        const session = step.session.id
        const state = stateOf(session)
        const tail: string[] = []
        let started: Awaited<ReturnType<typeof launch>>['started'] = []
        let notes: readonly string[] = []
        const cwd = step.cwd
        if (step.groups.length > 0 && cwd !== undefined) {
          if (loopsService(ctx) === undefined) {
            note(session, 'checks-board', '循环板不在：改完文件不跑检查')
            if (!state.boardTold && step.groups.some(group => group.files.some(file => languageOf(file) !== undefined))) {
              state.boardTold = true
              tail.push(NO_BOARD_CHECKS_LINE)
            }
          }
          else {
            note(session, 'checks-board', undefined)
            const launched = await launch(step, cwd, state)
            started = launched.started
            notes = launched.notes
            const extensions = launched.uncovered.filter(extension => (state.told.get(extension) ?? 0) < MISSING_CHECK_NOTICES)
            for (const extension of extensions) state.told.set(extension, (state.told.get(extension) ?? 0) + 1)
            if (extensions.length > 0) tail.push(missingCheckLine(extensions, step.session.header.origin === 'subagent'))
          }
        }
        if (started.length > 0) {
          const wait = Math.min(Math.max(...started.map(job => job.limitMs)) + KILL_SETTLE_MS, stepDeadlineMs)
          let timer: NodeJS.Timeout | undefined
          await Promise.race([Promise.all(started.map(job => job.settled)), new Promise<void>(resolveWait => { timer = setTimeout(resolveWait, wait) })])
          clearTimeout(timer)
        }
        const queued = started.filter(job => !job.started()).map(job => queuedSentence(job.name, slots.running()))
        const deliveries = state.results.splice(0)
        if (deliveries.length > 0) {
          try {
            options.recordRun(runRecord(deliveries))
          }
          catch (error) {
            note(session, 'checks', `交给循环板的运行记录没交上：${message(error)}`)
          }
        }
        const results = deliveries.map(delivery => delivery.result)
        const counts = Object.fromEntries(results.flatMap(result => result.kind === 'findings' ? [[result.key, result.findings.length] as const] : []))
        const found = Object.values(counts).some(count => count > 0)
        const fixed = Object.keys(counts).length > 0 && Object.values(lastCounts(step.history)).some(count => count > 0)
        const other = results.some(result => result.kind !== 'findings') || queued.length > 0 || notes.length > 0 || tail.length > 0
        if (!found && !fixed && !other) return undefined
        const body = checkNoticeBody(results, queued, notes, tail)
        return createUserNotice(CHECKS_NOTICE_SOURCE, 'checks after your edits', wrapSystemReminder(body), { checks: { ...(step.mark === undefined ? {} : { lastCall: step.mark }), counts } })
      }
      catch (error) {
        note(step.session.id, 'checks', `检查没跑成：${message(error)}`)
        return undefined
      }
    },
    details(project) {
      const snapshot = snapshots.get(fold(project))
      if (snapshot === undefined) return []
      const lines: string[] = []
      // A raised ceiling is the check's last line in limits.jsonl now (P13-01), never a value line's cap.
      const limits = snapshot.home === undefined ? undefined : readLimitsSync(snapshot.home)
      for (const check of snapshot.checks.slice(0, DETAIL_CHECKS)) {
        const title = check.title === '' ? check.key : check.title
        lines.push(codePoints(`${title}：改了 ${check.paths.join('、')} 之后跑 · ${codePoints(commandText(check.argv), 40)}`, DETAILS_MAX_WIDTH))
        const value = snapshot.values.get(check.key)
        const setting = limits === undefined ? undefined : limitSetting(limits, check.key)
        const raised = setting === undefined ? '' : ` · 上限已调高到 ${setting.capS} 秒：${setting.reason}`
        lines.push(codePoints(value === undefined
          ? `超时 ${secondsText(checkTimeout({ estimateS: check.estimateS, recentMs: [], capMs: capMsOf(setting) }).limitMs)} 秒 · ${check.estimateS === undefined ? '没有估计，用上限' : `写检查的 agent 估 ${check.estimateS} 秒`} · 还没跑过${raised}`
          : `超时 ${secondsText(value.limitMs)} 秒 · ${valueSourceText(value)}${value.previousMs === undefined ? '' : ` · 原 ${secondsText(value.previousMs)} 秒`}${raised}`, DETAILS_MAX_WIDTH))
      }
      return lines.slice(0, DETAILS_MAX_LINES)
    },
  }
}
