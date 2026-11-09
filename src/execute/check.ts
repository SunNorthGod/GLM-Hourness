/**
 * The merge checks (M7 design 0.6 §3.8.1–§3.8.3) and the full trunk check
 * (§3.11.1): `check_commit`, the main agent's tool that has the harness run
 * `norm-merge-gate` on one commit, the gate run they share, the check
 * records, and `trunkCheck`, the harness action of the `execute.trunk` entry.
 *
 * `check_commit {commit}` resolves the commit, reads the gate and its digest,
 * and answers `already-passed` when a verified passed record of the commit
 * under the digest exists; a change against the trunk's merge base that
 * stays inside the gate's `only` paths is recorded as passed without a
 * command (`passed-by-paths`). Otherwise it lists the `Hourness-Task`
 * trailers of the change, refuses `scratch_left` while the workspace's
 * scratch area holds files (m4 §2.3; only with the guard row loaded), and
 * starts the job on the check backend `hourness-gate` (src/execute/
 * gate-provider.ts; inside the call when the backend is not there).
 *
 * A gate run (steps 4–8) takes the gate lock, puts the gate worktree on the
 * commit (saving a snapshot through M3's `takeSnapshot` before anything in
 * it is discarded), runs the setup commands when the worktree is new or a
 * watched file changed, runs the commands in order with the output in log
 * files and a per-command time limit that ends the whole process tree,
 * stops at the first failure, writes `result.json`, then appends the line
 * of `checks.jsonl`. Step 9 tells the main agent and comments every failed
 * task 「检查第 <n> 次没过」, counted after the person's latest word; the
 * third stops the task: `hourness.stopped` goes to the loop board, whose
 * `execute.stop-draft` action words the check-stuck draft from that
 * comment (src/execute/asks.ts `stopDraftOf`, D11). A lock that stays busy, a setup that fails, a scratch area that is not
 * empty and a record that cannot be written leave no check line and count
 * no failure.
 *
 * Records are only believed with their result: a line of `checks.jsonl`
 * counts when the `result.json` it names exists, its SHA-256 equals the
 * line's `resultDigest` and it says the same as the line.
 *
 * `trunkCheck` is the `execute.trunk-check` action the loop board (or the
 * row's fallback executor, src/execute/loop-link.ts) runs for a trunk
 * event: every `$` and `when`
 * command must have passed on the new trunk's content, counted from the
 * verified records of commits with the same tree or differing only by
 * `only` paths; the missing commands run in the gate worktree and the
 * result is one `kind: 'trunk'` record. It never throws.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { randomBytes } from 'node:crypto'
import { openEngine } from '../graph/engine.ts'
import { holderHome, mainAgentOf } from '../graph/main-agent-holder.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { projectOf } from '../data/project-root.ts'
import { errorText, isRecord, mainAgentCall, refuse, toolShell } from '../design/tool-support.ts'
import { takeSnapshot, realSnapshotEnvironment, type SnapshotEnvironment } from '../guard/git-snapshot.ts'
import { requestsService } from '../guard/request-service.ts'
import { scratchLeftovers, type ScratchLeftovers } from '../guard/scratch.ts'
import type { HarnessResult, LoopEventRecord } from '../loops/service.ts'
import { deliver } from '../rules/wake.ts'
import { createUserNotice, type AgentLike, type ServiceLookup, type ToolDefinitionLike, type ToolExecutionContext, type UserNotice } from '../shared/dsh-min.ts'
import type { AdvanceRecord } from './advance.ts'
import { sha256Hex } from './digest.ts'
import type { GraphCache } from './dispatch.ts'
import { floorPathIn } from './floor.ts'
import { acquireGateLock, ensureExecDir, type GateLockSetup } from './gate-lock.ts'
import { normDigest, parseGateNorm, type ParsedGate } from './gate-norm.ts'
import type { GateLauncher, GateVerdict } from './gate-provider.ts'
import { watchedDigest, type Git, type SnapshotSaver } from './git.ts'
import type { LoopEmit } from './loop-link.ts'
import { emitMetric } from './metrics.ts'
import { writeWithRetry } from './retry.ts'
import { latestHumanAt } from './review.ts'

// ---------------------------------------------------------------------------
// The records

const CHECKS_FILE = 'checks.jsonl'
const ADVANCES_FILE = 'advances.jsonl'
const SETUP_FILE = 'gate-setup.json'
const COMMIT_ID = /^[0-9a-f]{40,64}$/
const RESULT_PATH = /^checks\/([0-9a-f]{40,64})\/[^/\\]+\/result\.json$/

type CheckKind = 'commands' | 'only' | 'trunk'

/** One command of a check as `result.json` lists it. */
interface CheckCommandResult {
  /** The acceptance line's index in `norm-merge-gate`. */
  readonly index: number
  readonly line: string
  /** The exit code; -1 when the process did not end by itself (time limit, stop) or did not start. */
  readonly exit: number
  readonly ms: number
  /** The log file, relative to the project root. */
  readonly log: string
}

/** `<exec>/checks/<C>/<time>/result.json` (§3.8.3 step 8). */
export interface CheckResult {
  readonly kind: CheckKind
  readonly commit: string
  readonly tree: string
  readonly normDigest: string
  /** The trunk branch the change was measured against. */
  readonly base: string
  readonly mergeBase: string | null
  /** The acceptance indexes of the commands that ran (for a trunk record, with those earlier records covered). */
  readonly ran: readonly number[]
  readonly commands: readonly CheckCommandResult[]
  readonly passed: boolean
  readonly tasks: readonly string[]
  readonly at: string
  readonly reason?: string
}

/** One line of `<exec>/checks.jsonl`. */
export interface CheckRecord {
  readonly kind: CheckKind
  readonly commit: string
  readonly tree: string
  readonly normDigest: string
  readonly ran: readonly number[]
  readonly passed: boolean
  readonly tasks: readonly string[]
  readonly at: string
  /** The result file, relative to `<exec>`, slash-separated. */
  readonly result: string
  /** The SHA-256 of the result file's content. */
  readonly resultDigest: string
  /** A trunk record that ran nothing: earlier records covered every command. */
  readonly skipped?: true
}

/** A record whose result file exists, matches its digest and says the same; `detail` is that file. */
export interface VerifiedCheck extends CheckRecord {
  readonly detail: CheckResult
}

const isNumbers = (value: unknown): value is number[] => Array.isArray(value) && value.every(entry => Number.isInteger(entry))
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(entry => typeof entry === 'string')
const isKind = (value: unknown): value is CheckKind => value === 'commands' || value === 'only' || value === 'trunk'
const sameNumbers = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((entry, index) => entry === b[index])

function parseRecord(line: string): CheckRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  }
  catch {
    return undefined
  }
  if (!isRecord(value)) return undefined
  const { kind, commit, tree, normDigest: digest, ran, passed, tasks, at, result, resultDigest, skipped } = value
  if (!isKind(kind) || typeof commit !== 'string' || !COMMIT_ID.test(commit) || typeof tree !== 'string' || typeof digest !== 'string') return undefined
  if (!isNumbers(ran) || typeof passed !== 'boolean' || !isStrings(tasks) || typeof at !== 'string') return undefined
  if (typeof result !== 'string' || RESULT_PATH.exec(result)?.[1] !== commit || typeof resultDigest !== 'string' || !/^[0-9a-f]{64}$/.test(resultDigest)) return undefined
  if (skipped !== undefined && skipped !== true) return undefined
  return { kind, commit, tree, normDigest: digest, ran, passed, tasks, at, result, resultDigest, ...(skipped === true ? { skipped } : {}) }
}

function parseResult(text: string): CheckResult | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return undefined
  }
  if (!isRecord(value) || !isKind(value.kind) || typeof value.commit !== 'string' || typeof value.tree !== 'string' || typeof value.normDigest !== 'string') return undefined
  if (!isNumbers(value.ran) || typeof value.passed !== 'boolean' || !isStrings(value.tasks) || !Array.isArray(value.commands)) return undefined
  return value as unknown as CheckResult
}

/**
 * The records of `<exec>/checks.jsonl` that count (§3.8.3, last paragraph):
 * the result file the line names exists, its SHA-256 equals the line's
 * `resultDigest`, and it carries the same kind, commit, tree, digest,
 * commands and verdict. A missing journal is no record; a line that does
 * not parse is skipped.
 */
export async function readChecks(execDir: string): Promise<VerifiedCheck[]> {
  const text = await readFile(join(execDir, CHECKS_FILE), 'utf8').catch(() => '')
  const verified: VerifiedCheck[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const record = parseRecord(line)
    if (record === undefined) continue
    const content = await readFile(join(execDir, ...record.result.split('/')), 'utf8').catch(() => undefined)
    if (content === undefined || sha256Hex(content) !== record.resultDigest) continue
    const detail = parseResult(content)
    if (detail === undefined) continue
    const agrees = detail.kind === record.kind && detail.commit === record.commit && detail.tree === record.tree && detail.normDigest === record.normDigest
      && detail.passed === record.passed && sameNumbers(detail.ran, record.ran)
    if (agrees) verified.push({ ...record, detail })
  }
  return verified
}

/** Append one JSON line and flush it to the disk before the call returns (§3.8.3 step 8's `fh.sync()`). */
async function appendJsonl(file: string, value: unknown): Promise<void> {
  const handle = await open(file, 'a')
  try {
    await handle.appendFile(`${JSON.stringify(value)}\n`, 'utf8')
    await handle.sync()
  }
  finally {
    await handle.close()
  }
}

function parseAdvance(line: string): AdvanceRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  }
  catch {
    return undefined
  }
  if (!isRecord(value) || (value.ref !== 'local' && value.ref !== 'remote') || typeof value.from !== 'string' || typeof value.to !== 'string') return undefined
  return value as unknown as AdvanceRecord
}

/** The lines of `<exec>/advances.jsonl` (§3.8.4), oldest first; a missing file is none, a line that does not parse is skipped. */
export async function readAdvances(execDir: string): Promise<AdvanceRecord[]> {
  const text = await readFile(join(execDir, ADVANCES_FILE), 'utf8').catch(() => '')
  return text.split('\n').filter(line => line.trim() !== '').flatMap(line => parseAdvance(line) ?? [])
}

/** Append one line to `<exec>/advances.jsonl`, the directory made first. */
export async function appendAdvance(execDir: string, record: AdvanceRecord): Promise<void> {
  await ensureExecDir(execDir)
  await appendJsonl(join(execDir, ADVANCES_FILE), record)
}

/** The directory name of a check's time: `:` and `.` are not file name characters everywhere. */
const stampOf = (at: string): string => at.replace(/[:.]/g, '-')

/** Write `result.json` and then the journal line pointing at it; the record as written. Throws when either write fails. */
async function writeCheck(execDir: string, result: CheckResult, skipped: boolean): Promise<CheckRecord> {
  const dir = `checks/${result.commit}/${stampOf(result.at)}`
  await ensureExecDir(execDir)
  await mkdir(join(execDir, ...dir.split('/')), { recursive: true })
  const text = `${JSON.stringify(result, null, 2)}\n`
  await writeFile(join(execDir, ...dir.split('/'), 'result.json'), text, 'utf8')
  const record: CheckRecord = {
    kind: result.kind,
    commit: result.commit,
    tree: result.tree,
    normDigest: result.normDigest,
    ran: result.ran,
    passed: result.passed,
    tasks: result.tasks,
    at: result.at,
    result: `${dir}/result.json`,
    resultDigest: sha256Hex(text),
    ...(skipped ? { skipped: true as const } : {}),
  }
  await appendJsonl(join(execDir, CHECKS_FILE), record)
  return record
}

// ---------------------------------------------------------------------------
// The trunk, the holder, the scratch area

const DRIVE_STARTED = '自动推进已开始'
const DRIVE_TRUNK = / · 主干 (\S+)/

/**
 * The trunk of a project (§3.8.4): the branch the newest 「自动推进已开始 …
 * · 主干 <branch>」 comment names (the drive writes it, E8); without one
 * the remote's default branch (`refs/remotes/origin/HEAD`), else the branch
 * the main checkout is on. `undefined` when none of them is there.
 */
export async function trunkBranchOf(git: Git, project: string, graph: LoadedGraph): Promise<string | undefined> {
  let newest: { readonly at: string, readonly branch: string } | undefined
  for (const node of graph.nodes.values()) {
    for (const entry of node.history) {
      if (entry.op !== 'comment' || entry.actor !== 'harness' || entry.text?.startsWith(DRIVE_STARTED) !== true) continue
      const branch = DRIVE_TRUNK.exec(entry.text)?.[1]
      if (branch !== undefined && (newest === undefined || entry.at > newest.at)) newest = { at: entry.at, branch }
    }
  }
  if (newest !== undefined) return newest.branch
  const remote = await git.remoteHeadBranch(project, 'origin')
  if (remote.ok && remote.value !== undefined) return remote.value
  return git.currentBranch(project)
}

/** Deliver a notice to the project's current main agent; why it did not arrive, or `undefined` when it did. */
export function toHolder(lookup: ServiceLookup, graphDir: string, notice: UserNotice): string | undefined {
  const holder = mainAgentOf(holderHome(lookup), graphDir)
  if (holder === undefined) return '项目没有主 Agent 记录'
  const delivery = deliver(lookup, holder.sessionId, notice)
  switch (delivery.kind) {
    case 'sent': return undefined
    case 'gone': return '持有者的会话不在了'
    case 'failed': return delivery.why
    default: return '没有可用的 agent 注册表'
  }
}

/** The scratch area's leftovers when the guard row is loaded and the area holds files (D6, m4 §2.3); `undefined` otherwise. */
async function scratchStep(lookup: ServiceLookup, project: string): Promise<ScratchLeftovers | undefined> {
  if (requestsService(lookup) === undefined) return undefined
  const left = await scratchLeftovers(project)
  return left.total > 0 ? left : undefined
}

const SCRATCH_HINT = 'Delete them, or promote each one: move it into scripts/ (or the project\'s source tree), give it a graph node and say what it is for.'
const SCRATCH_LISTED = 20

function scratchText(left: ScratchLeftovers): string {
  const shown = left.files.slice(0, SCRATCH_LISTED)
  return `the scratch area .llm/scratch/ holds ${left.total} file(s): ${shown.join(', ')}${left.total > shown.length ? `, and ${left.total - shown.length} more` : ''}`
}

// ---------------------------------------------------------------------------
// Running one command

const COMMAND_TIMEOUT_MS = 30 * 60_000
const LOG_TAIL_LINES = 40
const LOG_TAIL_BYTES = 64 * 1024

interface CommandRun {
  readonly exit: number
  readonly ms: number
  /** Why the process did not end by itself, or why it did not start. */
  readonly problem?: string
}

/** End a process and everything it started: `taskkill /T /F` on Windows, the process group elsewhere. */
function killTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' })
    killer.on('error', () => { child.kill() })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  }
  catch {
    child.kill('SIGKILL')
  }
}

/**
 * Run one command line of the gate (§3.8.1: through the shell, the text
 * comes from a norm the person approved) in `cwd`, its output and errors in
 * `logFile`, never in memory. The time limit and the signal end the whole
 * process tree.
 */
async function runLine(command: string, cwd: string, logFile: string, timeoutMs: number, signal: AbortSignal): Promise<CommandRun> {
  const started = Date.now()
  const handle = await open(logFile, 'w')
  try {
    return await new Promise<CommandRun>((done) => {
      let settled = false
      let ended: string | undefined
      const finish = (run: CommandRun): void => {
        if (settled) return
        settled = true
        done(run)
      }
      let child: ChildProcess
      try {
        child = spawn(command, { shell: true, cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', handle.fd, handle.fd] })
      }
      catch (error) {
        finish({ exit: -1, ms: Date.now() - started, problem: `the command could not start: ${errorText(error)}` })
        return
      }
      const stop = (why: string): void => {
        if (ended !== undefined) return
        ended = why
        killTree(child)
      }
      const timer = setTimeout(() => stop(`timed out after ${timeoutMs} ms; the process tree was ended`), timeoutMs)
      const onAbort = (): void => stop('stopped; the process tree was ended')
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
      const cleanup = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
      }
      child.once('error', (error) => {
        cleanup()
        finish({ exit: -1, ms: Date.now() - started, problem: `the command could not start: ${error.message}` })
      })
      child.once('close', (code) => {
        cleanup()
        finish({ exit: ended === undefined && typeof code === 'number' ? code : -1, ms: Date.now() - started, ...(ended === undefined ? {} : { problem: ended }) })
      })
    })
  }
  finally {
    await handle.close()
  }
}

/** The last lines of a log, read from its end only. */
async function logTail(file: string): Promise<string> {
  try {
    const handle = await open(file, 'r')
    try {
      const { size } = await handle.stat()
      const length = Math.min(size, LOG_TAIL_BYTES)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      return buffer.toString('utf8').split(/\r?\n/).filter(line => line.trim() !== '').slice(-LOG_TAIL_LINES).join('\n')
    }
    finally {
      await handle.close()
    }
  }
  catch {
    return '(the log cannot be read)'
  }
}

// ---------------------------------------------------------------------------
// The gate run (§3.8.3 steps 4–8)

/** What a check needs from the row. */
export interface CheckDeps {
  readonly lookup: ServiceLookup
  readonly cache: GraphCache
  /** Where the project graph of a working directory is; undefined outside a project with a graph. */
  readonly graphDirOf: (cwd: string | undefined) => string | undefined
  /** `<proj>/.llm/execute` of a project root. */
  readonly execDir: (projectRoot: string) => string
  /** Whether the agent is its project's main agent now; may throw. */
  readonly isMain: (agent: AgentLike) => boolean
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  readonly git: Git
  readonly launcher: GateLauncher
  /** A passed (or already passed) check of a commit; the trunk-advance check writes the evidence it was waiting for. `sessionId` is the session that asked for the check, for the row health. */
  readonly onPassed?: (project: string, commit: string, record: CheckRecord, sessionId: string | undefined) => Promise<void>
  /** The gate lock's values; tests pass shorter waits. */
  readonly lockSetup?: GateLockSetup
  /** The per-command limit; 30 minutes by default (§3.8.1). */
  readonly commandTimeoutMs?: number
  /** M3's snapshot machine; tests keep the real one. */
  readonly snapshots?: SnapshotEnvironment
  readonly now?: () => Date
  /** Hand an event to the loop board (src/execute/loop-link.ts): `hourness.stopped` after the third failure (§3.7.3). */
  readonly emit?: (project: string, sessionId: string | undefined, event: LoopEmit) => void
}

/** One gate run: what to check and what it is about. */
interface GateRunSpec {
  readonly kind: 'commands' | 'trunk'
  readonly project: string
  readonly graphDir: string
  readonly commit: string
  readonly trunk: string
  readonly mergeBase: string | undefined
  /** The paths the change touches, for the `when` commands; `undefined` runs every `when` command. */
  readonly paths: readonly string[] | undefined
  /** The commands to run by acceptance index (the trunk check's missing ones); otherwise the change decides. */
  readonly indexes?: readonly number[]
  /** Indexes earlier records covered, merged into a trunk record's `ran`. */
  readonly covered?: readonly number[]
  readonly tasks: readonly string[]
  readonly gate: ParsedGate
  readonly normDigest: string
  /** The session the check was asked from, for the row health. */
  readonly sessionId: string | undefined
}

type GateRefusal = 'gate_busy' | 'gate_worktree_invalid' | 'gate_snapshot_failed' | 'setup_failed' | 'write_failed' | 'aborted'

type GateOutcome =
  | { readonly kind: 'ran', readonly record: CheckRecord, readonly result: CheckResult, readonly failure: CheckCommandResult | undefined, readonly problem: string | undefined, readonly setup: boolean, readonly lockWaitMs: number }
  | { readonly kind: 'refused', readonly code: GateRefusal, readonly reason: string, readonly lockWaitMs: number }

const short = (commit: string): string => commit.slice(0, 12)

/** M3's `takeSnapshot` as the gate guard takes it: a saved snapshot or nothing to save is fine, anything else stops the reset. */
function snapshotSaver(deps: CheckDeps, project: string): SnapshotSaver {
  return async (repo, invocation, risk) => {
    const outcome = await takeSnapshot(
      repo,
      { dir: repo, repoOptions: [], configs: [], sub: invocation.sub, args: invocation.args, unknownGlobal: false },
      risk,
      { command: `git ${invocation.sub} ${invocation.args.join(' ')}`, sessionDir: project },
      deps.snapshots ?? realSnapshotEnvironment,
    )
    switch (outcome.kind) {
      case 'saved':
      case 'nothing': return { ok: true }
      case 'refused': return { ok: false, reason: `${outcome.refusal.code}: ${outcome.refusal.reason}` }
      default: return { ok: false, reason: outcome.kind }
    }
  }
}

/** The commands a run takes: the explicit indexes, or every `$` line and the `when` lines the change touches (all of them when the change is unknown). */
function commandsOf(spec: GateRunSpec): ParsedGate['commands'] {
  const checks = spec.gate.commands.filter(command => command.kind === 'check')
  if (spec.indexes !== undefined) return checks.filter(command => spec.indexes!.includes(command.index))
  const paths = spec.paths
  return checks.filter(command => command.when === undefined || paths === undefined || command.when.some(prefix => paths.some(path => floorPathIn([prefix], path))))
}

/**
 * Steps 4–8 of §3.8.3 for one commit. Never throws: every way it does not
 * get to a record is a refusal with its code.
 */
async function runGate(deps: CheckDeps, spec: GateRunSpec, signal: AbortSignal): Promise<GateOutcome> {
  const execDir = deps.execDir(spec.project)
  const lockStarted = Date.now()
  let lock: Awaited<ReturnType<typeof acquireGateLock>>
  try {
    lock = await acquireGateLock(execDir, `check ${short(spec.commit)}`, deps.lockSetup)
  }
  catch (error) {
    return { kind: 'refused', code: 'write_failed', reason: `the gate lock cannot be taken: ${errorText(error)}`, lockWaitMs: Date.now() - lockStarted }
  }
  const lockWaitMs = Date.now() - lockStarted
  if (lock === 'busy') return { kind: 'refused', code: 'gate_busy', reason: 'another check held the gate worktree for the whole wait', lockWaitMs }
  const refused = (code: GateRefusal, reason: string): GateOutcome => ({ kind: 'refused', code, reason, lockWaitMs })
  try {
    const at = (deps.now ?? ((): Date => new Date()))().toISOString()
    const runDir = join(execDir, 'checks', spec.commit, stampOf(at))
    const logOf = (name: string): { readonly file: string, readonly shown: string } => {
      const file = join(runDir, `${name}.log`)
      return { file, shown: relative(spec.project, file).replaceAll('\\', '/') }
    }
    const tree = await deps.git.treeOf(spec.project, spec.commit)
    if (!tree.ok || tree.value === undefined) return refused('gate_worktree_invalid', tree.ok ? `${spec.commit} has no tree` : tree.reason)

    // Step 5: the gate worktree on the commit, saved before it is cleaned.
    const prepared = await deps.git.prepareGateWorktree({ root: spec.project, commit: spec.commit, saveSnapshot: snapshotSaver(deps, spec.project) })
    if (!prepared.ok) return refused(prepared.code, prepared.reason)
    try {
      await mkdir(runDir, { recursive: true })
    }
    catch (error) {
      return refused('write_failed', `the check directory cannot be made: ${errorText(error)}`)
    }
    const timeoutMs = deps.commandTimeoutMs ?? COMMAND_TIMEOUT_MS

    // Step 6: setup when the worktree is new or a watched file changed.
    const setups = spec.gate.commands.filter(command => command.kind === 'setup')
    let setupRan = false
    if (setups.length > 0) {
      const setupFile = join(execDir, SETUP_FILE)
      const watched = [...new Set(setups.flatMap(command => command.when ?? []))]
      const digest = await watchedDigest(prepared.path, watched)
      if (prepared.created || await recordedSetup(setupFile) !== digest) {
        setupRan = true
        for (const command of setups) {
          const log = logOf(`setup-${command.index}`)
          const outcome = await runLine(command.command, prepared.path, log.file, timeoutMs, signal)
          if (signal.aborted) return refused('aborted', 'the check was stopped during the setup')
          if (outcome.exit !== 0) {
            await rm(setupFile, { force: true }).catch(() => undefined)
            return refused('setup_failed', `the setup command \`${command.command}\` exited ${outcome.exit}${outcome.problem === undefined ? '' : ` (${outcome.problem})`}; log ${log.shown}`)
          }
        }
        try {
          await writeFile(setupFile, `${JSON.stringify({ digest, at })}\n`, 'utf8')
        }
        catch (error) {
          return refused('write_failed', `the setup record cannot be written: ${errorText(error)}`)
        }
      }
    }

    // Step 7: the commands in order; the first failure stops.
    const ran: number[] = []
    const commands: CheckCommandResult[] = []
    let failure: CheckCommandResult | undefined
    let problem: string | undefined
    for (const command of commandsOf(spec)) {
      const log = logOf(String(command.index))
      const outcome = await runLine(command.command, prepared.path, log.file, timeoutMs, signal)
      if (signal.aborted) return refused('aborted', 'the check was stopped')
      const entry: CheckCommandResult = { index: command.index, line: command.command, exit: outcome.exit, ms: outcome.ms, log: log.shown }
      ran.push(command.index)
      commands.push(entry)
      if (outcome.exit !== 0) {
        failure = entry
        problem = outcome.problem
        break
      }
    }

    // Step 8: result.json, then the journal line.
    const result: CheckResult = {
      kind: spec.kind,
      commit: spec.commit,
      tree: tree.value,
      normDigest: spec.normDigest,
      base: spec.trunk,
      mergeBase: spec.mergeBase ?? null,
      ran: [...new Set([...(spec.covered ?? []), ...ran])].sort((a, b) => a - b),
      commands,
      passed: failure === undefined,
      tasks: spec.tasks,
      at,
      ...(failure === undefined ? {} : { reason: `${failure.line} exited ${failure.exit}${problem === undefined ? '' : ` (${problem})`}` }),
    }
    let record: CheckRecord
    try {
      record = await writeCheck(execDir, result, false)
    }
    catch (error) {
      return refused('write_failed', `the check record cannot be written: ${errorText(error)}`)
    }
    return { kind: 'ran', record, result, failure, problem, setup: setupRan, lockWaitMs }
  }
  catch (error) {
    return refused('write_failed', `the check stopped on a file it could not write or read: ${errorText(error)}`)
  }
  finally {
    await lock.release().catch(() => undefined)
  }
}

/** The watched-files digest the last successful setup recorded; `undefined` when there is none or it cannot be read. */
async function recordedSetup(file: string): Promise<string | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))
    return isRecord(value) && typeof value.digest === 'string' ? value.digest : undefined
  }
  catch {
    return undefined
  }
}

/** The evidence hook after a pass; a failure is said in the row health and never fails the check. */
async function passedHook(deps: CheckDeps, sessionId: string | undefined, project: string, record: CheckRecord): Promise<void> {
  await Promise.resolve()
    .then(() => deps.onPassed?.(project, record.commit, record, sessionId))
    .catch((error: unknown) => { deps.report(sessionId, 'degraded', `检查通过之后的记录没写完（${short(record.commit)}）：${errorText(error)}`) })
}

function metricOf(result: CheckResult, setup: boolean, lockWaitMs: number): void {
  emitMetric({
    event: 'execute.check',
    commit: result.commit,
    tasks: result.tasks,
    passed: result.passed,
    kind: result.kind,
    commands: result.commands.map(command => ({ line: command.line, exit: command.exit, ms: command.ms })),
    setup,
    lockWaitMs,
  })
}

const NO_TRAILER = '没有任务尾注：进主干之后不会记到任何活上'
const CHECK_FAILED = /^检查第 \d+ 次没过：/
const STOP_AT = 3

/** Tell the main agent; a notice that does not arrive is said in the row health. */
function tellHolder(deps: CheckDeps, spec: GateRunSpec, notice: UserNotice, what: string): void {
  const why = toHolder(deps.lookup, spec.graphDir, notice)
  if (why !== undefined) deps.report(spec.sessionId, 'degraded', `${what}送不到当前主 Agent（${short(spec.commit)}）：${why}`)
}

/** The failure comment on one task, counted after the person's latest word; the third one stops the task and hands `hourness.stopped` on. */
async function commentFailure(deps: CheckDeps, spec: GateRunSpec, task: string, failure: CheckCommandResult, at: string): Promise<void> {
  const now = deps.now ?? ((): Date => new Date())
  const engine = openEngine(spec.graphDir, { now })
  let graph: LoadedGraph
  try {
    graph = await engine.load()
  }
  catch (error) {
    deps.report(spec.sessionId, 'degraded', `检查没过的批注写不进图（${task}）：${errorText(error)}`)
    return
  }
  const node = graph.nodes.get(task)
  if (node === undefined) return
  const questions = [...graph.nodes.values()].filter(entry => entry.type === 'question' && entry.parent === task)
  const humanAt = latestHumanAt([node.history, ...questions.map(entry => entry.history)])
  const earlier = node.history.filter(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined && CHECK_FAILED.test(entry.text) && (humanAt === undefined || entry.at > humanAt)).length
  const n = earlier + 1
  const stop = n === STOP_AT
  const text = `检查第 ${n} 次没过：${failure.line} exit ${failure.exit} · ${failure.log}${stop ? ' · 停下' : ''}`
  const written = await writeWithRetry(() => engine.apply('harness', { op: 'comment', id: task, text })).catch(() => undefined)
  if (written === undefined || !written.ok) deps.report(spec.sessionId, 'degraded', `检查没过的批注写不进图（${task}）`)
  if (!stop) return
  emitMetric({ event: 'execute.stop', node: task, kind: 'check', rounds: n })
  // The draft to the person goes through `hourness.stopped` and its `execute.stop-draft` action, keyed with the time of the comment that carries 停下 (D11).
  const stoppedAt = written?.ok === true ? written.node.history.filter(entry => entry.op === 'comment' && entry.text === text).at(-1)?.at : undefined
  deps.emit?.(spec.project, spec.sessionId, { event: 'hourness.stopped', key: `stopped:${task}:check-${stoppedAt ?? at}`, payload: { node: task, kind: 'check', rounds: n } })
}

/** Step 9 for a `check_commit` job: the notice, the failure comments and the stop, the metric, and the evidence hook on a pass. Returns the activation's verdict. */
async function finishCheck(deps: CheckDeps, spec: GateRunSpec, outcome: GateOutcome): Promise<GateVerdict> {
  const c12 = short(spec.commit)
  const notice = (summary: string, text: string, passed: boolean): UserNotice =>
    createUserNotice('glm-hourness-execute', summary, text, { hournessExecute: { event: 'check', commit: spec.commit, tasks: [...spec.tasks], passed } })
  const trailerNote = spec.tasks.length === 0 ? ` ${NO_TRAILER}.` : ''
  if (outcome.kind === 'refused') {
    if (outcome.code === 'write_failed') deps.report(spec.sessionId, 'degraded', `检查记录写不进去（${c12}）：${outcome.reason}`)
    const again = outcome.code === 'aborted' ? 'Run check_commit again when it should run.' : outcome.code === 'gate_busy' ? `Run check_commit ${c12} again once the other check is done.` : `Fix what the reason names, then run check_commit ${c12} again.`
    tellHolder(deps, spec, notice(`${c12} merge check did not run (${outcome.code})`, `The merge check of ${c12} did not run: ${outcome.code}: ${outcome.reason}. It counts as no check. ${again}`, false), '检查的通知')
    return { text: `${c12}: ${outcome.code}: ${outcome.reason}`, stopReason: outcome.code === 'aborted' ? 'aborted' : 'error' }
  }
  metricOf(outcome.result, outcome.setup, outcome.lockWaitMs)
  const failure = outcome.failure
  if (failure === undefined) {
    const n = outcome.result.commands.length
    const text = `${c12} passed the merge checks (${n} commands). Fast-forward ${spec.trunk} with \`git merge --ff-only ${spec.commit}\` in the main checkout${spec.gate.push ? '; then push without --force' : ''}.${trailerNote}`
    tellHolder(deps, spec, notice(`${c12} passed the merge checks`, text, true), '检查的通知')
    await passedHook(deps, spec.sessionId, spec.project, outcome.record)
    return { text: `${c12} passed the merge checks (${n} commands)`, stopReason: 'completed' }
  }
  const tail = await logTail(join(spec.project, ...failure.log.split('/')))
  const ended = outcome.problem === undefined ? '' : ` (${outcome.problem})`
  const text = `${c12} failed the merge checks: \`${failure.line}\` exit ${failure.exit}${ended}, log ${failure.log}.\nLast lines of the log:\n${tail}\nFix it on the branch the commit came from, build a new commit and run check_commit on it.${trailerNote}`
  tellHolder(deps, spec, notice(`${c12} failed the merge checks`, text, false), '检查的通知')
  for (const task of spec.tasks) await commentFailure(deps, spec, task, failure, outcome.record.at)
  return { text: `${c12} failed the merge checks: ${failure.line} exit ${failure.exit}`, stopReason: 'completed' }
}

// ---------------------------------------------------------------------------
// check_commit (§3.8.2)

const PARAMETERS = {
  type: 'object',
  properties: {
    commit: { type: 'string', description: 'The commit id, or a ref name that resolves to one (the task branch, or <upstream>/<main> after a fetch).' },
  },
  required: ['commit'],
  additionalProperties: false,
} as const

const OUTPUT = {
  type: 'object',
  properties: {
    commit: { type: 'string', description: 'The full commit id.' },
    status: { type: 'string', enum: ['started', 'already-passed', 'passed-by-paths'] },
    job: { type: 'string', description: 'The check job; its verdict arrives as a notice.' },
    tasks: { type: 'array', items: { type: 'string' }, description: 'The tasks named by the Hourness-Task trailers between the main branch and the commit.' },
  },
  required: ['commit', 'status', 'tasks'],
} as const

const DESCRIPTION = 'Run the merge checks of norm-merge-gate on one commit before the main branch moves to it. Pass the commit you built for the main branch (with the "Hourness-Task: <task>" trailer), or <upstream>/<main> after git fetch. The commands run in the gate worktree in the background; the verdict arrives as a notice. After a pass, fast-forward the main branch with git merge --ff-only <commit> in the main checkout. Main agent only.'

const NO_GATE_HINT = 'Propose norm-merge-gate under the goal: read the project\'s build and test setup and list each command as `$ <command>`.'

interface CheckOutput {
  readonly commit: string
  readonly status: 'started' | 'already-passed' | 'passed-by-paths'
  readonly job?: string
  readonly tasks: readonly string[]
}

/** The tool. */
export function checkCommitTool(deps: CheckDeps): ToolDefinitionLike {
  const git = deps.git
  const now = deps.now ?? ((): Date => new Date())
  return {
    ...toolShell('check_commit', DESCRIPTION, PARAMETERS, OUTPUT),
    async execute(args: unknown, exec: ToolExecutionContext): Promise<CheckOutput> {
      const { context, agent } = mainAgentCall(deps.isMain, exec, { message: 'only the main agent runs the merge checks', hint: 'the main agent builds the commit for the main branch and checks it' })
      const cwd = agent.session?.header.cwd
      const graphDir = deps.graphDirOf(cwd)
      if (graphDir === undefined) refuse('invalid', 'no project graph for this session', 'the merge checks read norm-merge-gate from the project graph; enable glm-hourness/design and /wish')
      const project = (cwd === undefined ? undefined : projectOf(cwd)?.root) ?? dirname(dirname(graphDir))
      const raw = isRecord(args) && typeof args.commit === 'string' ? args.commit.trim() : ''

      // Step 1: the commit, the gate and its digest, an earlier pass.
      const commit = await git.resolveCommit(project, raw)
      if (commit === undefined) refuse('not_commit', `"${raw}" names no commit in ${project}`, 'pass a commit id, or a ref name that resolves to one (for example hz/<task> or origin/main)', 'commit')
      const graph = await deps.cache.load(graphDir)
      const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
      if (!gate.commands.some(command => command.kind === 'check')) refuse('no_gate_norm', 'the project graph has no norm-merge-gate with a `$ <command>` line', NO_GATE_HINT)
      const digest = normDigest(gate, sha256Hex)
      const execDir = deps.execDir(project)
      const earlier = (await readChecks(execDir)).find(record => record.commit === commit && record.normDigest === digest && record.passed)
      if (earlier !== undefined) {
        await passedHook(deps, agent.session?.id, project, earlier)
        return { commit, status: 'already-passed', tasks: earlier.tasks }
      }

      // Step 2: the change against the trunk; step 3: its trailers.
      const trunk = await trunkBranchOf(git, project, graph)
      if (trunk === undefined) refuse('invalid', 'the main branch cannot be told: no drive comment names it, origin/HEAD is not set and the main checkout is on a detached head', 'check out the main branch in the main checkout')
      const base = await git.mergeBase(project, `refs/heads/${trunk}`, commit)
      if (!base.ok) refuse('invalid', `the change of ${short(commit)} against ${trunk} cannot be read: ${base.reason}`, `check that the branch ${trunk} exists in ${project}`)
      const mergeBase = base.value
      let paths: string[] | undefined
      let tasks: string[] = []
      // A commit the trunk already holds (the check after an unchecked move, §3.8.4) has no change of its own: it is not inside the only paths, and every when command runs.
      if (mergeBase !== undefined && mergeBase !== commit) {
        const changed = await git.changedFiles(project, mergeBase, commit)
        if (!changed.ok) refuse('invalid', `the change of ${short(commit)} cannot be read: ${changed.reason}`, 'send the call again; git failed')
        paths = changed.value.map(file => file.path)
        const trailers = await git.taskTrailers(project, mergeBase, commit)
        if (!trailers.ok) refuse('invalid', `the trailers of ${short(commit)} cannot be read: ${trailers.reason}`, 'send the call again; git failed')
        tasks = [...new Set(trailers.value.flatMap(entry => entry.tasks))]
      }
      if (paths !== undefined && gate.only.length > 0 && paths.every(path => floorPathIn(gate.only, path))) {
        const tree = await git.treeOf(project, commit)
        if (!tree.ok || tree.value === undefined) refuse('invalid', `the tree of ${short(commit)} cannot be read`, 'send the call again; git failed')
        const result: CheckResult = { kind: 'only', commit, tree: tree.value, normDigest: digest, base: trunk, mergeBase: mergeBase ?? null, ran: [], commands: [], passed: true, tasks, at: now().toISOString() }
        let record: CheckRecord
        try {
          record = await writeCheck(execDir, result, false)
        }
        catch (error) {
          deps.report(agent.session?.id, 'degraded', `检查记录写不进去（${short(commit)}）：${errorText(error)}`)
          refuse('write_failed', `the check record cannot be written: ${errorText(error)}`, 'send the call again; the change counts as unchecked until a record lands')
        }
        metricOf(result, false, 0)
        await passedHook(deps, agent.session?.id, project, record)
        return { commit, status: 'passed-by-paths', tasks }
      }

      // The scratch area must be empty before the work goes in (D6, m4 §2.3).
      const left = await scratchStep(deps.lookup, project)
      if (left !== undefined) refuse('scratch_left', `${scratchText(left)}; nothing goes into the main branch while one-off scripts are left behind`, SCRATCH_HINT)

      // Step 4: the job, on the check backend or inside this call.
      const id = `${short(commit)}-${randomBytes(4).toString('hex')}`
      const spec: GateRunSpec = { kind: 'commands', project, graphDir, commit, trunk, mergeBase, paths, tasks, gate, normDigest: digest, sessionId: agent.session?.id }
      const way = await deps.launcher.start({
        id,
        label: `hourness check ${short(commit)}`,
        cwd: project,
        tasks,
        run: async signal => finishCheck(deps, spec, await runGate(deps, spec, signal)),
      }, agent, context.signal)
      if (way === 'sync') deps.report(agent.session?.id, 'degraded', '检查以同步方式运行：检查后端 hourness-gate 没起来，这次检查在工具调用里跑完')
      return { commit, status: 'started', job: id, tasks }
    },
  }
}

// ---------------------------------------------------------------------------
// trunkCheck (§3.11.1)

/** How many of the newest passed records a trunk check compares by path (the cost bound of D11; a missed older one only means a re-run). */
const COVERAGE_RECORDS = 50

/**
 * The full check on a new trunk commit (`execute.trunk-check`): `done`
 * without a tell when every `$` and `when` command has passed on this
 * content, `done` with a tell when a command fails, `skipped` when the
 * commit was trunk-checked already, `failed` when it cannot run. A
 * non-empty scratch area is a tell and no record, so the next advance runs
 * again. Never throws.
 */
export async function trunkCheck(deps: CheckDeps, record: LoopEventRecord): Promise<HarnessResult> {
  try {
    const project = record.project
    if (await deps.git.toplevel(project) === undefined) return { outcome: 'failed', reason: `${project} is not a git repository` }
    const graphDir = deps.graphDirOf(project) ?? join(project, 'docs', 'graph')
    let graph: LoadedGraph
    try {
      graph = await deps.cache.load(graphDir)
    }
    catch (error) {
      return { outcome: 'failed', reason: `the project graph cannot be read: ${errorText(error)}` }
    }
    const to = typeof record.payload.to === 'string' ? record.payload.to : ''
    const commit = await deps.git.resolveCommit(project, to)
    if (commit === undefined) return { outcome: 'failed', reason: `"${to}" names no commit` }
    const execDir = deps.execDir(project)
    const checks = await readChecks(execDir)
    if (checks.some(entry => entry.kind === 'trunk' && entry.commit === commit)) return { outcome: 'skipped', reason: 'already done' }
    const trunk = await trunkBranchOf(deps.git, project, graph) ?? 'the main branch'
    const left = await scratchStep(deps.lookup, project)
    if (left !== undefined) return { outcome: 'done', tell: `The full check on ${trunk} ${short(commit)} waits: ${scratchText(left)}. ${SCRATCH_HINT}` }

    const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
    const needed = gate.commands.filter(command => command.kind === 'check').map(command => command.index)
    if (needed.length === 0) return { outcome: 'skipped', reason: 'the graph has no norm-merge-gate command' }
    const digest = normDigest(gate, sha256Hex)
    const tree = await deps.git.treeOf(project, commit)
    if (!tree.ok || tree.value === undefined) return { outcome: 'failed', reason: tree.ok ? `${commit} has no tree` : tree.reason }
    const covered = new Set<number>()
    const passed = checks.filter(entry => entry.passed && entry.normDigest === digest)
    const byPath = new Set(passed.filter(entry => entry.tree !== tree.value).slice(-COVERAGE_RECORDS))
    for (const entry of passed) {
      let counts = entry.tree === tree.value
      if (!counts && byPath.has(entry) && gate.only.length > 0) {
        const changed = await deps.git.changedFiles(project, entry.commit, commit)
        counts = changed.ok && changed.value.every(file => floorPathIn(gate.only, file.path))
      }
      if (counts) for (const index of entry.ran) covered.add(index)
    }
    const missing = needed.filter(index => !covered.has(index))
    const tasks = typeof record.payload.tasks === 'string' ? record.payload.tasks.split(',').map(task => task.trim()).filter(task => task !== '') : []
    if (missing.length === 0) {
      const result: CheckResult = { kind: 'trunk', commit, tree: tree.value, normDigest: digest, base: trunk, mergeBase: null, ran: [...covered].sort((a, b) => a - b), commands: [], passed: true, tasks, at: (deps.now ?? ((): Date => new Date()))().toISOString() }
      try {
        await writeCheck(execDir, result, true)
      }
      catch (error) {
        return { outcome: 'failed', reason: `the trunk record cannot be written: ${errorText(error)}` }
      }
      metricOf(result, false, 0)
      return { outcome: 'done' }
    }
    const spec: GateRunSpec = { kind: 'trunk', project, graphDir, commit, trunk, mergeBase: undefined, paths: undefined, indexes: missing, covered: [...covered], tasks, gate, normDigest: digest, sessionId: record.session }
    const outcome = await runGate(deps, spec, new AbortController().signal)
    if (outcome.kind === 'refused') return { outcome: 'failed', reason: `${outcome.code}: ${outcome.reason}` }
    metricOf(outcome.result, outcome.setup, outcome.lockWaitMs)
    const failure = outcome.failure
    if (failure === undefined) return { outcome: 'done' }
    return { outcome: 'done', tell: `The full check on ${trunk} ${short(commit)} failed: ${failure.line} exit ${failure.exit} (${failure.log}). Fix it or revert.` }
  }
  catch (error) {
    return { outcome: 'failed', reason: errorText(error) }
  }
}
