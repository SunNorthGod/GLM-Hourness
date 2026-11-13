/**
 * The walk job (user graph design 0.4.1 §2.7, §5.5): the harness walks each
 * automatic flow of a present goal in the gate worktree, and one walk
 * evidence per step lands in the project graph. `dispatch_task <goal id>`
 * checks the preconditions, starts the job on the check backend and returns
 * `walking` at once; the `hourness.walk-done` notice wakes the main agent,
 * which dispatches again until every flow holds a valid passing record and
 * the acceptance review goes out.
 *
 * The kind and estimate live in the flow's `走法：` line; the command itself
 * comes only from the person-approved `norm-merge-gate` (a
 * `` `walk <kind> $ <command>` `` line, `{flow}` replaced by the flow id) —
 * the job never executes text the main agent can rewrite. The job pins the
 * trunk commit T, holds the checks' gate lock, runs the setup commands the
 * checks run, and past 45 minutes of its budget (`WALK_JOB_MS`, shorter than
 * the checks' 60-minute lock wait) starts no new flow: the first flow of a
 * job always starts, a not-run flow waits for the next `dispatch_task`.
 * Evidence follows the one rule of §2.7: a timeout or an unusable report
 * writes an `exit 1` on the entry step; a good report writes one entry per
 * listed step, `exit 0` exactly when the step is ok; a command that exited
 * non-zero while every listed step says ok fails the entry step with the
 * command's own exit; steps the report does not list get none. A `截图` or
 * `终端` flow passes through the `walk-review` role — a reviewer by
 * registration, under the reviewers' boundaries — which judges each artifact
 * against the step's acceptance. Timeouts are three times the estimate, then
 * three times the slowest of the last three measured runs, within 10 seconds
 * and 30 minutes, every change journaled to `<exec>/walk-limits.jsonl`;
 * every run lands in `<exec>/walks.jsonl`, the file the restart reconcile
 * reads and the three-failure stop counts. A step whose last three walks all
 * failed stops the goal for the person (`hourness.stopped`, kind
 * `acceptance`).
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { openEngine } from '../graph/engine.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import { childrenIndex, subtreeOf } from '../graph/projection.ts'
import type { Evidence, GraphNode } from '../graph/schema.ts'
import { estimatedTimeoutMs, isUserNode, stepsServedBy, userGraphOf, walkResult, type FlowView, type WalkSpec } from '../graph/user-graph.ts'
import { goalOf } from '../graph/stage.ts'
import { liveOf } from '../graph/user-live.ts'
import type { SnapshotEnvironment } from '../guard/git-snapshot.ts'
import type { AgentLike, LiveAgentLike } from '../shared/dsh-min.ts'
import { forgetAttempt, makeChildId, registerAttempt } from './attempts.ts'
import { appendJsonl, gateSetup, runLine, snapshotSaver } from './check.ts'
import { parseGateNorm } from './gate-norm.ts'
import { sha256HexOfBytes } from './digest.ts'
import { agentOptionsOf, type CatalogEntry, type ModelChoice } from './models.ts'
import { acquireGateLock, ensureExecDir, type GateLockSetup } from './gate-lock.ts'
import type { GateLauncher, GateVerdict } from './gate-provider.ts'
import { emitMetric } from './metrics.ts'
import { writeWithRetry } from './retry.ts'
import type { CommandRunner } from './dispatch.ts'
import type { Git } from './git.ts'
import type { LoopEmit } from './loop-link.ts'

/** The budget a walk job spends before it starts no new flow (§2.7 step 4); below the checks' 60-minute lock wait (tests pin it). */
export const WALK_JOB_MS = 45 * 60_000

/** Where a walk run's report and artifacts are copied, under `<exec>`; the evidence refs and the reviewer name these copies. */
const WALK_RUNS_DIR = 'walks'
const WALKS_JOURNAL = 'walks.jsonl'
const WALK_LIMITS_JOURNAL = 'walk-limits.jsonl'
/** The report directory of one flow, in the gate worktree. */
const REPORT_ROOT = '.hourness/walk'
/** Bounds of a flow's timeout, shared with `estimatedTimeoutMs` (§2.7). */
const LIMIT_MIN_MS = 10_000
const LIMIT_MAX_MS = 30 * 60_000
/** Artifact byte bounds of a report (§8.2): 5 MB for an image kind, 200 KB otherwise. */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const TEXT_MAX_BYTES = 200 * 1024
/** The review activation's tries before a flow counts as `review_failed` (§2.7: at most two retries). */
const REVIEW_TRIES = 3
/** How many measured runs of one flow set its cap: the slowest of the last three. */
const MEASURED_RUNS = 3
/** A setup command's bound, the one dispatch's own preparation keeps (§2.7: at most 10 minutes each). */
const SETUP_TIMEOUT_MS = 10 * 60_000

/** The outcomes of one flow's walk, as the journal and the notice name them. */
export type WalkOutcome = 'passed' | 'failed' | 'timeout' | 'no_report' | 'review_failed' | 'not_run'

/** A flow the job walks itself (§2.7): a 走法 line that parsed and carries the merge gate's command of its kind — `unparsed` and `你来走` stay with the person. */
export type AutoFlow = FlowView & { readonly spec: Extract<WalkSpec, { readonly command: string }> }

/** What `dispatch_task` returns when it started a walk job instead of a dispatch (§5.5): the main agent wakes at the `hourness.walk-done` notice and dispatches again. */
export interface WalkDispatch {
  readonly task: string
  readonly status: 'walking'
  readonly job: string
  readonly flows: readonly string[]
  readonly waitingForPerson: readonly string[]
  readonly head: string
}

/** What the walk needs from the row; the seams the checks and dispatches use. */
export interface WalkDeps {
  readonly execDir: (projectRoot: string) => string
  readonly git: Git
  readonly launcher: GateLauncher
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** Hand an event to the loop board: `hourness.stopped` after the third failed walk of one step, `hourness.walk-done` at the job's end (§2.7). */
  readonly emit: (project: string, sessionId: string | undefined, event: LoopEmit) => void
  readonly runCommand?: CommandRunner
  readonly lockSetup?: GateLockSetup
  /** M3's snapshot machine; tests keep the real one. */
  readonly snapshots?: SnapshotEnvironment
  /** The `startActivation` of the subagents service, read once by the row; undefined when the host has none (a `截图` or `终端` flow then reads as `review_failed`). */
  readonly start?: WalkStart | undefined
  /** The clock of the journals and the budget; tests pin it. */
  readonly now?: () => Date
  /** The random source of the review child id suffix; tests pin it. */
  readonly random?: () => number
}

/** The `startActivation` seam the walk-review activations go through; the request view `dispatch_task`'s start shares. */
export interface WalkStart {
  (spec: {
    readonly provider: string
    readonly label: string
    readonly childId: string
    readonly request: {
      readonly cwd: string
      readonly prompt: readonly unknown[]
      readonly parent: LiveAgentLike
      readonly agentOptions: { readonly provider: string, readonly model: string, readonly reasoningEffort?: string }
      readonly outputSchema: unknown
      readonly maxDepth?: number
    }
    readonly signal: AbortSignal
    readonly delivery: 'caller'
  }): Promise<unknown>
}

// ---------------------------------------------------------------------------
// The preconditions and the pending flows (§5.5 steps 1–2)

/** The gap keys a goal may still carry when its flows are walked (§5.5 step 1 a). */
const WALK_READY_GAPS: ReadonlySet<string> = new Set(['step:failed', 'work:orphan', 'flow:too-long', 'step:too-many-branches'])

/**
 * The walk preconditions of one goal (§5.5 step 1): no gap outside the ready
 * set (`flow:no-test` gets its first door here) and no `proposed` live user
 * node under the goal. One line per blocker; empty when the flows may be
 * walked. A goal without a user graph is always ready.
 */
export function walkBlockers(graph: LoadedGraph, goal: GraphNode): readonly string[] {
  const ug = userGraphOf(graph, goal)
  if (!ug.present) return []
  const blockers = ug.gaps.filter(gap => !WALK_READY_GAPS.has(gap.key)).map(gap => `${gap.key} on ${gap.nodes.join(', ')}: ${gap.text}`)
  for (const node of subtreeOf(childrenIndex(graph), goal)) {
    if (isUserNode(node) && node.status === 'proposed' && liveOf(graph, node)) blockers.push(`proposal ${node.id} (${node.title}) is not decided yet`)
  }
  return blockers
}

/**
 * The `covers` facts of one trunk tip (§5.5 step 2, item 8), read upfront:
 * for each walked commit, whether it is an ancestor of `tip` (or is it) and
 * `git diff --name-only` between the two names nothing outside the project's
 * graph directory. `graphRel` is that directory relative to the project
 * root, forward slashes. A git failure throws: the completion gate refuses
 * on a throw (fail closed, R5-F3), and the dispatch precondition reads a
 * throw as not covered.
 */
export async function buildCovers(git: Git, project: string, tip: string | undefined, graphRel: string, commits: readonly string[]): Promise<(commit: string) => boolean> {
  const underGraph = (path: string): boolean => path === graphRel || path.startsWith(`${graphRel}/`)
  const covered = new Map<string, boolean>()
  for (const commit of commits) {
    if (tip === undefined) throw new Error('the trunk commit to compare the walks with cannot be read')
    if (commit === tip) {
      covered.set(commit, true)
      continue
    }
    const ancestor = await git.isAncestor(project, commit, tip)
    if (!ancestor.ok) throw new Error(`whether ${commit} is an ancestor of ${tip} cannot be read: ${ancestor.reason}`)
    if (!ancestor.value) {
      covered.set(commit, false)
      continue
    }
    const changed = await git.changedFiles(project, commit, tip)
    if (!changed.ok) throw new Error(`the change between ${commit} and ${tip} cannot be read: ${changed.reason}`)
    covered.set(commit, changed.value.every(file => underGraph(file.path)))
  }
  return commit => covered.get(commit) === true
}

/** Whether one flow holds a valid passing record (§5.5 step 2): every live approved step walked, its last passing walk's commit covered. */
function flowWalked(view: FlowView, covers: (commit: string) => boolean): boolean {
  const approved = view.steps.filter(step => step.step.status === 'approved')
  return approved.length > 0 && approved.every((step) => {
    if (step.state !== 'walked') return false
    const commit = step.lastWalk?.commit
    return commit !== undefined && covers(commit)
  })
}

/** The flows of a present goal that still need a walk: the automatic ones and the person's own; `undefined` when the goal has no user graph. */
export function pendingWalks(graph: LoadedGraph, goal: GraphNode, covers: (commit: string) => boolean): { readonly auto: readonly AutoFlow[], readonly person: readonly FlowView[] } | undefined {
  const ug = userGraphOf(graph, goal)
  if (!ug.present) return undefined
  const auto: AutoFlow[] = []
  const person: FlowView[] = []
  for (const { flows } of ug.roles) {
    for (const flow of flows) {
      if (flowWalked(flow, covers)) continue
      if ('unparsed' in flow.spec || flow.spec.kind === '你来走') person.push(flow)
      else auto.push({ ...flow, spec: flow.spec })
    }
  }
  return { auto, person }
}

/** The commits the goal's steps were last walked at, each once, in walk order; empty when the goal has no user graph. */
export function walkCommitsOf(graph: LoadedGraph, goal: GraphNode): readonly string[] {
  const ug = userGraphOf(graph, goal)
  if (!ug.present) return []
  return [...new Set(ug.roles.flatMap(role => role.flows.flatMap(flow => flow.steps.map(step => step.lastWalk?.commit))).filter((commit): commit is string => commit !== undefined))]
}

/**
 * The one-line walk results the acceptance review's brief carries (§5.5
 * step 5): per flow, who walks it, how far it got, and where it failed with
 * the walk's own words.
 */
export function walkBriefLines(graph: LoadedGraph, goal: GraphNode): readonly string[] {
  const ug = userGraphOf(graph, goal)
  if (!ug.present) return []
  return ug.roles.flatMap(role => role.flows.map((flow) => {
    const approved = flow.steps.filter(step => step.step.status === 'approved')
    const failed = approved.filter(step => step.state === 'failed')
    const walked = approved.filter(step => step.state === 'walked').length
    const detail = failed.length > 0
      ? `failed at ${failed.map(step => `"${step.step.title}" (${walkResult(step.lastWalk?.note ?? '')})`).join(', ')}`
      : `${walked}/${approved.length} steps walked`
    return `${role.role.title} › ${flow.flow.title} (${flow.flow.id}): ${detail}`
  }))
}

/**
 * Whether the model is marked as taking images (§2.7): the provider's
 * catalog entry carries `inputModalities` where the provider publishes them
 * (the GLM channel does); a catalog that says nothing never confirms one, so
 * a `截图` flow stays unwalkable on such a provider.
 */
export function modelTakesImages(model: string, catalog: readonly CatalogEntry[] | undefined): boolean {
  const entry = catalog?.find(candidate => candidate.id === model) as (CatalogEntry & { readonly inputModalities?: readonly string[] }) | undefined
  return entry?.inputModalities?.includes('image') === true
}

/**
 * The walk agreement a `kind: test` task's brief carries (§5.4): per flow
 * the task's served steps belong to, the walk kind, the merge gate's command
 * with `{flow}` replaced, and where the harness reads the report the test
 * writes. The report format's only copy lives here, beside the reader that
 * judges it (`checkReport`); a flow whose 走法 the harness cannot run stays
 * out, its agreement is not the test writer's to keep.
 */
export function walkAgreementOf(graph: LoadedGraph, task: GraphNode): readonly string[] {
  if (task.kind !== 'test') return []
  const served = new Set(stepsServedBy(graph, task).map(step => step.id))
  if (served.size === 0) return []
  const goal = goalOf(graph, task.id)
  if (goal === undefined) return []
  const lines: string[] = []
  for (const { flows } of userGraphOf(graph, goal).roles) {
    for (const flow of flows) {
      if (!flow.steps.some(step => served.has(step.step.id))) continue
      if ('unparsed' in flow.spec || flow.spec.kind === '你来走') continue
      lines.push(
        `${flow.flow.title} (${flow.flow.id}) walks by ${flow.spec.kind}: \`${flow.spec.command}\`. `
        + `The harness runs it in the merge gate's worktree at the trunk commit and reads the report the test writes at ${REPORT_ROOT}/${flow.flow.id}/report.json: `
        + `{"flow": "<flow id>", "steps": [{"id": "<approved step id>", "ok": true, "said": "one line", "artifact": "<bare file name, 截图 and 终端 only>"}]}`,
      )
    }
  }
  return lines
}

// ---------------------------------------------------------------------------
// The journals

/** One line of `<exec>/walks.jsonl`: the job's start, each flow's end, its evidence, the job's end — or the restart reconcile's abandoned mark. */
export type WalkLine =
  | { readonly kind: 'start', readonly job: string, readonly goal: string, readonly commit: string, readonly at: string }
  | { readonly kind: 'flow-end', readonly job: string, readonly flow: string, readonly outcome: WalkOutcome, readonly exit?: number, readonly limitMs: number, readonly elapsedMs: number, readonly at: string, readonly reason?: string }
  | { readonly kind: 'evidence', readonly job: string, readonly flow: string, readonly steps: readonly string[], readonly at: string }
  | { readonly kind: 'end', readonly job: string, readonly trunkMoved: boolean, readonly at: string }
  | { readonly kind: 'abandoned', readonly job: string, readonly at: string }

/** The JSON lines of a journal that carry the wanted mark; a line that does not parse is no record. */
async function readJsonl<T>(file: string, keep: (value: object) => boolean): Promise<readonly T[]> {
  const text = await readFile(file, 'utf8').catch(() => '')
  const lines: T[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const value: unknown = JSON.parse(line)
      if (typeof value === 'object' && value !== null && keep(value)) lines.push(value as T)
    }
    catch {
      // A line that does not parse is no record.
    }
  }
  return lines
}

async function readWalkLines(execDir: string): Promise<readonly WalkLine[]> {
  return readJsonl<WalkLine>(join(execDir, WALKS_JOURNAL), value => typeof (value as { kind?: unknown }).kind === 'string')
}

/** One line of `<exec>/walk-limits.jsonl`: a timeout cap, where it came from, when it changed (§2.7). */
export interface WalkLimitLine {
  readonly flow: string
  readonly old: number | null
  readonly new: number
  readonly source: 'agent' | 'harness'
  readonly basis: string
  readonly at: string
}

async function readLimitLines(execDir: string): Promise<readonly WalkLimitLine[]> {
  return readJsonl<WalkLimitLine>(join(execDir, WALK_LIMITS_JOURNAL), value => typeof (value as { flow?: unknown }).flow === 'string' && typeof (value as { new?: unknown }).new === 'number')
}

async function appendWalkLine(execDir: string, file: string, value: WalkLine | WalkLimitLine): Promise<void> {
  await ensureExecDir(execDir)
  await appendJsonl(join(execDir, file), value)
}

/**
 * The timeout cap of a flow (§2.7): with three measured runs on record, three
 * times the slowest of the last three, within the bounds; before that, three
 * times the estimate. A timed-out run is not a measurement; neither is a
 * flow that never started.
 */
export function limitOf(flow: FlowView, lines: readonly WalkLine[]): { readonly ms: number, readonly source: 'agent' | 'harness' } {
  const measured = lines
    .filter((line): line is Extract<WalkLine, { readonly kind: 'flow-end' }> => line.kind === 'flow-end' && line.flow === flow.flow.id && line.outcome !== 'timeout' && line.outcome !== 'not_run')
    .slice(-MEASURED_RUNS)
    .map(line => line.elapsedMs)
  if (measured.length < MEASURED_RUNS) {
    const seconds = 'seconds' in flow.spec ? flow.spec.seconds : 0
    return { ms: estimatedTimeoutMs(seconds), source: 'agent' }
  }
  return { ms: Math.min(LIMIT_MAX_MS, Math.max(LIMIT_MIN_MS, Math.max(...measured) * 3)), source: 'harness' }
}

/** The `at` an `agent`-sourced limit names as its basis: the flow's latest history entry (the one carrying the estimate), else the job. */
function estimateBasis(flow: FlowView, job: string): string {
  return flow.flow.history.at(-1)?.at ?? job
}

// ---------------------------------------------------------------------------
// The report of one flow (§2.7, §8.2)

interface ReportStep {
  readonly id: string
  readonly ok: boolean
  readonly artifact?: string
  readonly said?: string
}

/** The validated report of a flow, or why it cannot be judged. */
export type WalkReport =
  | { readonly ok: true, readonly steps: readonly ReportStep[] }
  | { readonly ok: false, readonly reason: string }

/** The artifact byte bound of one kind: 5 MB for `截图`, 200 KB otherwise. */
function artifactMax(kind: string): number {
  return kind === '截图' ? IMAGE_MAX_BYTES : TEXT_MAX_BYTES
}

/** Read and check `.hourness/walk/<flowId>/report.json` in the gate worktree. */
export async function readWalkReport(worktree: string, flow: FlowView, timedOut: boolean): Promise<WalkReport> {
  return checkReport(join(worktree, ...REPORT_ROOT.split('/'), flow.flow.id), flow, timedOut)
}

/** Check one flow's report in the given directory: the gate worktree's, or the run's copy the reconcile reads (§2.7). */
async function checkReport(dir: string, flow: FlowView, timedOut: boolean): Promise<WalkReport> {
  if (timedOut) return { ok: false, reason: `the walk command of ${flow.flow.id} timed out` }
  const text = await readFile(join(dir, 'report.json'), 'utf8').catch(() => undefined)
  if (text === undefined) return { ok: false, reason: `no report at ${REPORT_ROOT}/${flow.flow.id}/report.json` }
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return { ok: false, reason: 'the report does not parse as JSON' }
  }
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'the report is not an object' }
  const report = value as { readonly flow?: unknown, readonly steps?: unknown }
  if (report.flow !== flow.flow.id) return { ok: false, reason: `the report names flow ${String(report.flow)}, not ${flow.flow.id}` }
  if (!Array.isArray(report.steps)) return { ok: false, reason: 'the report has no steps list' }
  if (report.steps.length > 50) return { ok: false, reason: `the report lists ${report.steps.length} steps, at most 50` }
  const approved = new Set(flow.steps.filter(step => step.step.status === 'approved').map(step => step.step.id))
  const seen = new Set<string>()
  const steps: ReportStep[] = []
  const kind = 'kind' in flow.spec ? flow.spec.kind : ''
  for (const raw of report.steps) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'a report step is not an object' }
    const entry = raw as { readonly id?: unknown, readonly ok?: unknown, readonly artifact?: unknown, readonly said?: unknown }
    if (typeof entry.id !== 'string' || typeof entry.ok !== 'boolean') return { ok: false, reason: 'a report step carries no id or ok' }
    if (!approved.has(entry.id)) return { ok: false, reason: `the report names ${entry.id}, which is no live approved step of ${flow.flow.id}` }
    if (seen.has(entry.id)) return { ok: false, reason: `the report names ${entry.id} twice` }
    seen.add(entry.id)
    const said = entry.said === undefined ? undefined : typeof entry.said === 'string' ? entry.said : undefined
    if (entry.said !== undefined && (said === undefined || [...said].length > 120)) return { ok: false, reason: `the said of ${entry.id} is not one line of at most 120 characters` }
    const artifact = entry.artifact === undefined ? undefined : typeof entry.artifact === 'string' ? entry.artifact : undefined
    if (entry.artifact !== undefined && (artifact === undefined || artifact.includes('/') || artifact.includes('\\') || artifact.includes('..'))) {
      return { ok: false, reason: `the artifact of ${entry.id} is not a bare file name` }
    }
    if ((kind === '截图' || kind === '终端') && artifact === undefined) return { ok: false, reason: `a ${kind} walk names an artifact for every step; ${entry.id} names none` }
    if (artifact !== undefined) {
      const size = await stat(join(dir, artifact)).then(entry => entry.size, () => -1)
      if (size < 0) return { ok: false, reason: `the artifact of ${entry.id} is missing: ${artifact}` }
      if (size === 0) return { ok: false, reason: `the artifact of ${entry.id} is empty` }
      if (size > artifactMax(kind)) return { ok: false, reason: `the artifact of ${entry.id} is ${size} bytes, over the ${artifactMax(kind)} bound` }
    }
    steps.push({ id: entry.id, ok: entry.ok, ...(artifact === undefined ? {} : { artifact }), ...(said === undefined ? {} : { said }) })
  }
  return { ok: true, steps }
}

/** One read with brief retries: a file the driver's closing process just wrote can still be held for a moment (Windows). */
async function readCopyable(file: string): Promise<Buffer> {
  let last: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await readFile(file)
    }
    catch (error) {
      last = error
      await new Promise(resolve => setTimeout(resolve, 40 * (attempt + 1)))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

/** Copy the report directory of one flow into the run's directory; the copy is what the evidence and the reviewer name, so a file that cannot be copied fails the flow rather than leaving the copy silently short. */
async function copyReport(worktree: string, runsDir: string, flowId: string): Promise<void> {
  const from = join(worktree, ...REPORT_ROOT.split('/'), flowId)
  const to = join(runsDir, flowId)
  await mkdir(to, { recursive: true })
  for (const name of await readdir(from)) {
    const content = await readCopyable(join(from, name))
    await writeFile(join(to, name), content)
  }
}

// ---------------------------------------------------------------------------
// The evidence of one flow (§2.7, the one rule)

/** The harness's note: `@<commit> sha256:<digest or -> <result>` (§2.7). */
function harnessNote(commit: string, digest: string | undefined, result: string): string {
  return `@${commit.slice(0, 7)} sha256:${digest ?? '-'} ${result}`
}

const REF_PREFIX: Readonly<Record<string, string>> = { '命令': 'command', '截图': 'screenshot', '终端': 'transcript' }

/** The evidence ref of one step: the command text (cut at 150 code points), or the artifact's copy path. */
function evidenceRef(kind: string, command: string, artifactPath: string | undefined): string {
  const prefix = REF_PREFIX[kind] ?? 'command'
  const content = artifactPath ?? (command.length > 150 ? `${command.slice(0, 150)}…` : command)
  return `${prefix}:${content}`
}

/** What one step's evidence carries: the exit and the note's result line. */
interface EvidenceEntry {
  readonly id: string
  readonly exit: number
  readonly result: string
  readonly artifact?: string
}

/**
 * The exits of a good report (§2.7 rules 3 and 4): one per listed step,
 * `exit 0` exactly when the step is ok — a `截图` or `终端` step ok by report
 * and review; a command that exited non-zero while every listed step says ok
 * fails the entry step with the command's own exit. Steps the report does
 * not list get no evidence at all (rule 5).
 */
export function stepExits(flow: FlowView, report: WalkReport & { readonly ok: true }, commandExit: number, judged: ReadonlyMap<string, { readonly ok: boolean, readonly why?: string }> | undefined): readonly EvidenceEntry[] {
  const entryId = flow.steps.find(step => step.step.status === 'approved')?.step.id
  const contradiction = commandExit !== 0 && report.steps.length > 0 && report.steps.every(step => step.ok)
  return report.steps.map((step) => {
    if (contradiction && step.id === entryId) {
      return { id: step.id, exit: commandExit, result: '没过：命令的退出码不是 0，而报告里列出的步骤全是 ok' }
    }
    const ok = judged === undefined ? step.ok : judged.get(step.id)?.ok === true
    const why = judged?.get(step.id)?.why ?? step.said
    return {
      id: step.id,
      exit: ok ? 0 : commandExit === 0 ? 1 : commandExit,
      result: ok ? '通过' : `没过：${why ?? 'the step did not pass'}`,
      ...(step.artifact === undefined ? {} : { artifact: step.artifact }),
    }
  })
}

/** Whether one step's walk evidence landed: written now, already there under the same reason (the reconcile's dedupe), or failed. */
type EvidenceLanded = 'written' | 'deduped' | 'failed'

/** Write one step's walk evidence into the graph, fresh revisions on every retry; a step that already carries a walk under this reason is left alone (§2.7's reconcile dedupe). */
async function writeStepEvidence(deps: Pick<WalkDeps, 'now'>, graphDir: string, stepId: string, ref: string, note: string, exit: number, reason: string): Promise<EvidenceLanded> {
  const engine = openEngine(graphDir, deps.now === undefined ? {} : { now: deps.now })
  try {
    const existing = await engine.load()
    if (existing.nodes.get(stepId)?.history.some(entry => entry.op === 'walk' && entry.reason === reason)) return 'deduped'
  }
  catch {
    // The graph is read again inside the retry; the dedupe check is best effort.
  }
  const applied = await writeWithRetry(async () => {
    const current = await engine.load()
    const rev = current.revisions.get(stepId)
    if (rev === undefined) return { ok: false as const, error: { code: 'not_found', message: `step ${stepId} is gone from the graph`, hint: '' } }
    const evidence: Evidence = { kind: 'walk', ref, exit, note }
    return engine.apply('harness', { op: 'walk', id: stepId, rev, reason, evidence: [evidence] })
  })
  return applied.ok ? 'written' : 'failed'
}

/** The facts one flow's evidence writes are named by: the job, the commit it pinned, and the graph they land in. */
interface EvidenceTarget {
  readonly graphDir: string
  readonly commit: string
  readonly job: string
  readonly sessionId: string | undefined
}

/**
 * The evidence writes of one walked flow, per the one rule (§2.7 rules 1–5):
 * an unusable report or a timeout writes an exit 1 on the entry step alone, a
 * good report writes one entry per listed step (`judged` carries the
 * walk-review verdicts when the kind has them). `dir` is where the artifacts
 * are read (the run's copy). Returns every entry and the steps that landed.
 */
async function writeFlowEvidence(deps: Pick<WalkDeps, 'report' | 'now'>, target: EvidenceTarget, flow: FlowView, kind: string, command: string, dir: string, report: WalkReport, commandExit: number, judged: ReadonlyMap<string, { readonly ok: boolean, readonly why?: string }> | undefined): Promise<{ readonly entries: readonly EvidenceEntry[], readonly written: readonly string[] }> {
  if (!report.ok) {
    // Rule 1 and 2: a timeout or an unusable report writes an exit 1 on the entry step, the rest stay silent.
    const entry = flow.steps.find(step => step.step.status === 'approved')?.step
    if (entry === undefined) return { entries: [], written: [] }
    const result = timedOutReason(report.reason) ?? `没走完：${report.reason}`
    const landed = await writeStepEvidence(deps, target.graphDir, entry.id, evidenceRef(kind, command, undefined), harnessNote(target.commit, undefined, result), 1, evidenceReason(target.job, flow))
    if (landed === 'failed') deps.report(target.sessionId, 'degraded', `走一遍的没过证据写不进图（步骤 ${entry.id}）；对账会补写`)
    return { entries: [{ id: entry.id, exit: 1, result }], written: landed === 'failed' ? [] : [entry.id] }
  }
  const entries = stepExits(flow, report, commandExit, judged)
  const written: string[] = []
  for (const entry of entries) {
    const artifactPath = entry.artifact === undefined ? undefined : join(dir, entry.artifact)
    const digest = artifactPath === undefined ? undefined : await readFile(artifactPath).then(content => sha256HexOfBytes(content).slice(0, 8), () => undefined)
    const landed = await writeStepEvidence(deps, target.graphDir, entry.id, evidenceRef(kind, command, artifactPath), harnessNote(target.commit, digest, entry.result), entry.exit, evidenceReason(target.job, flow))
    if (landed !== 'failed') written.push(entry.id)
    else deps.report(target.sessionId, 'degraded', `走一遍的证据写不进图（步骤 ${entry.id}）；对账会补写`)
  }
  return { entries, written }
}

/** The reason a flow's evidence carries: the job and the flow it belongs to (§2.7 step 3). */
function evidenceReason(job: string, flow: FlowView): string {
  return `${job} 流程「${flow.flow.title}」走一遍`
}

/** The timeout reason, told apart from an unusable report's (§2.7 rule 1's 「超时」). */
function timedOutReason(reason: string): string | undefined {
  return reason.startsWith('the walk command of') && reason.endsWith(' timed out') ? '超时' : undefined
}

// ---------------------------------------------------------------------------
// The walk-review role (§2.7)

/** The reviewer's output: one verdict per live approved step of the flow. */
export const WALK_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, ok: { type: 'boolean' }, why: { type: 'string', description: 'One line of at most 120 characters.' } },
        required: ['id', 'ok'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps'],
  additionalProperties: false,
} as const

/** The reviewer of one flow: registered as a reviewer, started by the harness with the dispatch's model. */
interface ReviewSpec {
  readonly project: string
  readonly graphDir: string
  readonly commit: string
  readonly flow: FlowView
  readonly artifacts: ReadonlyMap<string, string>
  readonly reportPath: string
  readonly choice: ModelChoice
  readonly why: string
}

/** The reviewer's prompt: the steps with their acceptance and artifact paths, the report, the output shape. */
function reviewPrompt(spec: ReviewSpec): string {
  const lines = [
    `# Walk review of flow ${spec.flow.flow.id}: ${spec.flow.flow.title}`,
    'You are the independent reviewer of one walked flow (a reviewer the harness started, not a dispatch of the main agent).',
    '',
    '## Goal',
    'The person meets the product through this flow. Decide, step by step, whether the artifact shows the step done as its acceptance says.',
    '',
    '## Context',
    '- Workspace: your working directory is the main checkout; read the artifacts with the read tool (images reach you when the route takes them).',
    ...spec.flow.steps.filter(step => step.step.status === 'approved').map((step) => {
      const artifact = spec.artifacts.get(step.step.id)
      return `- ${step.step.id} "${step.step.title}" — acceptance: ${(step.step.acceptance ?? []).join('; ') || 'none recorded'}${artifact === undefined ? '' : `; artifact: ${artifact}`}`
    }),
    `- The walk's own report: ${spec.reportPath}.`,
    '',
    '## Constraints',
    '- You write nothing except notes under .hourness/.',
    '- Judge only from the artifacts: ok is true when the artifact shows the step\'s acceptance met.',
    '- why: one line of at most 120 characters.',
    '',
    '## Done when',
    '- structured_output once: {"steps": [{"id": "<step id>", "ok": true, "why": "..."}]} covering every step above; a missing step or a schema mismatch fails this review.',
  ]
  return lines.join('\n')
}

/** Parse the reviewer's structured output; `undefined` when it misses a step or breaks the schema. */
function reviewOf(settlement: unknown, flow: FlowView): ReadonlyMap<string, { readonly ok: boolean, readonly why?: string }> | undefined {
  const structured = (settlement as { readonly structured?: unknown } | undefined)?.structured
  if (typeof structured !== 'object' || structured === null) return undefined
  const steps = (structured as { readonly steps?: unknown }).steps
  if (!Array.isArray(steps)) return undefined
  const judged = new Map<string, { readonly ok: boolean, readonly why?: string }>()
  for (const raw of steps) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const entry = raw as { readonly id?: unknown, readonly ok?: unknown, readonly why?: unknown }
    if (typeof entry.id !== 'string' || typeof entry.ok !== 'boolean') return undefined
    if (entry.why !== undefined && (typeof entry.why !== 'string' || [...entry.why].length > 120)) return undefined
    judged.set(entry.id, { ok: entry.ok, ...(entry.why === undefined ? {} : { why: entry.why }) })
  }
  const wanted = flow.steps.filter(step => step.step.status === 'approved').map(step => step.step.id)
  return wanted.every(id => judged.has(id)) ? judged : undefined
}

/**
 * One flow's review: up to `REVIEW_TRIES` activations of the `walk-review`
 * role, registered as a reviewer so the reviewers' boundaries hold. The map
 * of verdicts, or `undefined` when every try failed (the flow reads as
 * `review_failed` and no evidence is written).
 */
async function reviewFlow(deps: WalkDeps, spec: ReviewSpec, parent: LiveAgentLike, signal: AbortSignal): Promise<ReadonlyMap<string, { readonly ok: boolean, readonly why?: string }> | undefined> {
  if (deps.start === undefined) return undefined
  const random = deps.random ?? Math.random
  for (let attempt = 1; attempt <= REVIEW_TRIES; attempt++) {
    const childId = makeChildId(spec.flow.flow.id, attempt, random)
    registerAttempt({
      childId,
      role: 'review',
      node: spec.flow.flow.id,
      attempt,
      graphDir: spec.graphDir,
      worktree: spec.project,
      baseSha: spec.commit,
      provider: spec.choice.provider,
      model: spec.choice.model,
      ...(spec.choice.reasoningEffort === undefined ? {} : { reasoningEffort: spec.choice.reasoningEffort }),
      why: spec.why,
      plan: 'none',
      pins: '',
    })
    try {
      const settlement = await deps.start({
        provider: 'spawn',
        label: `hourness walk review ${spec.flow.flow.id} try ${attempt}`,
        childId,
        request: {
          cwd: spec.project,
          prompt: [{ type: 'text', text: reviewPrompt(spec) }],
          parent,
          agentOptions: agentOptionsOf(spec.choice),
          outputSchema: WALK_REVIEW_SCHEMA,
        },
        signal,
        delivery: 'caller',
      })
      const judged = reviewOf(settlement, spec.flow)
      if (judged !== undefined) return judged
    }
    catch {
      // A failed activation spends one try; the next goes out unless the tries are spent.
    }
    finally {
      forgetAttempt(childId)
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// The job

/** One walk job, as `dispatch_task` starts it. */
export interface WalkJobSpec {
  readonly job: string
  readonly project: string
  readonly graphDir: string
  readonly goal: GraphNode
  /** The automatic flows to walk, in order, each with a usable command. */
  readonly flows: readonly AutoFlow[]
  /** The `你来走` flow ids the job reports as waiting for the person. */
  readonly person: readonly string[]
  readonly choice: ModelChoice
  /** Why the dispatch named; the reviewer's why. */
  readonly why: string
  /** The trunk branch and the commit the job pins (§2.7 step 2). */
  readonly trunk: { readonly branch: string, readonly sha: string }
  readonly sessionId: string | undefined
  readonly parent: LiveAgentLike
}

/** Start one walk job on the check backend; the verdict arrives as the `hourness.walk-done` notice. */
export async function startWalkJob(deps: WalkDeps, spec: WalkJobSpec, signal: AbortSignal): Promise<void> {
  await deps.launcher.start({
    id: spec.job,
    label: `hourness walk ${spec.goal.id}`,
    cwd: spec.project,
    tasks: [],
    run: jobSignal => runWalkJob(deps, spec, jobSignal).then((): GateVerdict => ({ text: `walk of ${spec.goal.id} done; the walk-done notice carries the results`, stopReason: 'completed' })),
  }, spec.parent as unknown as AgentLike, signal)
}

/** One flow's walk inside the job; never throws. */
async function walkFlow(deps: WalkDeps, spec: WalkJobSpec, worktree: string, runsDir: string, flow: AutoFlow, limit: { readonly ms: number, readonly source: 'agent' | 'harness' }, signal: AbortSignal): Promise<{ readonly outcome: WalkOutcome, readonly exit?: number, readonly elapsedMs: number, readonly reason?: string }> {
  const now = deps.now ?? ((): Date => new Date())
  const started = now().getTime()
  const kind = flow.spec.kind
  const command = flow.spec.command
  const flowEnd = (outcome: WalkOutcome, exit?: number, reason?: string): { readonly outcome: WalkOutcome, readonly exit?: number, readonly elapsedMs: number, readonly reason?: string } =>
    ({ outcome, ...(exit === undefined ? {} : { exit }), elapsedMs: now().getTime() - started, ...(reason === undefined ? {} : { reason }) })
  const reportDir = join(worktree, ...REPORT_ROOT.split('/'), flow.flow.id)
  await rm(reportDir, { recursive: true, force: true }).catch(() => undefined)
  const run = await runLine(command, worktree, join(runsDir, `${flow.flow.id}.log`), limit.ms, signal)
  const timedOut = run.problem?.startsWith('timed out') === true
  if (signal.aborted) return flowEnd('not_run', undefined, 'the job was stopped')
  const report = await readWalkReport(worktree, flow, timedOut)
  if (!report.ok) {
    // Rule 1 and 2: a timeout or an unusable report writes an exit 1 on the entry step, the rest stay silent.
    await writeFlowEvidence(deps, { graphDir: spec.graphDir, commit: spec.trunk.sha, job: spec.job, sessionId: spec.sessionId }, flow, kind, command, join(runsDir, flow.flow.id), report, run.exit ?? -1, undefined)
    return flowEnd(timedOut ? 'timeout' : 'no_report', run.exit, report.reason)
  }
  try {
    await copyReport(worktree, runsDir, flow.flow.id)
  } catch (error) {
    return flowEnd('failed', run.exit, `the run's copy could not be written (${error instanceof Error ? error.message : String(error)})`)
  }
  let judged: ReadonlyMap<string, { readonly ok: boolean, readonly why?: string }> | undefined
  if (kind === '截图' || kind === '终端') {
    const artifacts = new Map<string, string>()
    for (const step of report.steps) {
      if (step.artifact !== undefined) artifacts.set(step.id, join(runsDir, flow.flow.id, step.artifact))
    }
    judged = await reviewFlow(deps, {
      project: spec.project,
      graphDir: spec.graphDir,
      commit: spec.trunk.sha,
      flow,
      artifacts,
      reportPath: join(runsDir, flow.flow.id, 'report.json'),
      choice: spec.choice,
      why: spec.why,
    }, spec.parent, signal)
    if (judged === undefined) return flowEnd('review_failed', run.exit)
  }
  const { entries, written } = await writeFlowEvidence(deps, { graphDir: spec.graphDir, commit: spec.trunk.sha, job: spec.job, sessionId: spec.sessionId }, flow, kind, command, join(runsDir, flow.flow.id), report, run.exit ?? -1, judged)
  // The evidence line means this flow's evidence is fully written (§2.7 step 3); a partial write stays for the reconcile.
  if (written.length === entries.length && entries.length > 0) {
    await appendWalkLine(deps.execDir(spec.project), WALKS_JOURNAL, { kind: 'evidence', job: spec.job, flow: flow.flow.id, steps: written, at: now().toISOString() }).catch(() => undefined)
  }
  return flowEnd(entries.some(entry => entry.exit !== 0) ? 'failed' : 'passed', run.exit)
}

/** The whole job: the gate worktree at the pinned commit, the flows in order, the notice at the end. Never throws. */
export async function runWalkJob(deps: WalkDeps, spec: WalkJobSpec, signal: AbortSignal): Promise<void> {
  const now = deps.now ?? ((): Date => new Date())
  const execDir = deps.execDir(spec.project)
  const graphRel = relative(spec.project, spec.graphDir).replaceAll('\\', '/')
  const commit = spec.trunk.sha
  const results: { readonly flow: string, readonly outcome: WalkOutcome, readonly limitMs: number, readonly elapsedMs: number }[] = []
  const notRun = (reason?: string): void => {
    for (const flow of spec.flows) {
      if (results.some(result => result.flow === flow.flow.id)) continue
      results.push({ flow: flow.flow.id, outcome: 'not_run', limitMs: 0, elapsedMs: 0 })
    }
    if (reason !== undefined) deps.report(spec.sessionId, 'degraded', reason)
  }
  await appendWalkLine(execDir, WALKS_JOURNAL, { kind: 'start', job: spec.job, goal: spec.goal.id, commit, at: now().toISOString() }).catch(() => undefined)
  let lock: Awaited<ReturnType<typeof acquireGateLock>> | 'busy' = 'busy'
  try {
    const taken = await acquireGateLock(execDir, `walk ${spec.job}`, deps.lockSetup)
    if (taken !== 'busy') lock = taken
    else notRun(`走一遍作业拿不到门禁锁（别的检查占着门禁工作树；它跑完后再派一次）`)
  }
  catch (error) {
    notRun(`走一遍作业拿不到门禁锁（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (lock !== 'busy') {
    try {
      const lockStart = now().getTime()
      const prepared = await deps.git.prepareGateWorktree({ root: spec.project, commit, saveSnapshot: snapshotSaver(deps.snapshots, spec.project) })
      if (!prepared.ok) notRun(`走一遍作业起不来（${prepared.code}: ${prepared.reason}）`)
      else {
        const runsDir = join(execDir, WALK_RUNS_DIR, spec.job)
        await mkdir(runsDir, { recursive: true }).catch(() => undefined)
        const graph = await openEngine(spec.graphDir).load()
        const at = now().toISOString()
        const setup = await gateSetup(
          parseGateNorm(graph.nodes.get('norm-merge-gate')).commands.filter(command => command.kind === 'setup'),
          prepared.path,
          execDir,
          prepared.created,
          at,
          name => ({ file: join(runsDir, `${name}.log`), shown: `${WALK_RUNS_DIR}/${spec.job}/${name}.log` }),
          SETUP_TIMEOUT_MS,
          signal,
        )
        if (setup.failure !== undefined) notRun(`走一遍的准备命令没过（${setup.failure.command} exit ${setup.failure.exit}；日志 ${setup.failure.log}）`)
        else {
          const lines = await readWalkLines(execDir)
          const limits = await readLimitLines(execDir)
          const stopped = new Set<string>()
          for (const [index, flow] of spec.flows.entries()) {
            const limit = limitOf(flow, lines)
            const elapsed = now().getTime() - lockStart
            if (index > 0 && elapsed + limit.ms > WALK_JOB_MS) {
              // The one time rule (§2.7 step 4): past the budget no new flow starts; the first flow of a job always starts.
              const reason = `the job has spent ${elapsed} ms of its ${WALK_JOB_MS} ms budget`
              results.push({ flow: flow.flow.id, outcome: 'not_run', limitMs: limit.ms, elapsedMs: 0 })
              await appendWalkLine(execDir, WALKS_JOURNAL, { kind: 'flow-end', job: spec.job, flow: flow.flow.id, outcome: 'not_run', limitMs: limit.ms, elapsedMs: 0, at: now().toISOString(), reason }).catch(() => undefined)
              continue
            }
            const lastLimit = limits.filter(line => line.flow === flow.flow.id).at(-1)
            if (lastLimit === undefined || lastLimit.new !== limit.ms) {
              await appendWalkLine(execDir, WALK_LIMITS_JOURNAL, {
                flow: flow.flow.id,
                old: lastLimit?.new ?? null,
                new: limit.ms,
                source: limit.source,
                basis: limit.source === 'agent' ? estimateBasis(flow, spec.job) : spec.job,
                at: now().toISOString(),
              }).catch(() => undefined)
            }
            const walked = await walkFlow(deps, spec, prepared.path, runsDir, flow, limit, signal)
            results.push({ flow: flow.flow.id, outcome: walked.outcome, limitMs: limit.ms, elapsedMs: walked.elapsedMs })
            await appendWalkLine(execDir, WALKS_JOURNAL, { kind: 'flow-end', job: spec.job, flow: flow.flow.id, outcome: walked.outcome, ...(walked.exit === undefined ? {} : { exit: walked.exit }), limitMs: limit.ms, elapsedMs: walked.elapsedMs, at: now().toISOString(), ...(walked.reason === undefined ? {} : { reason: walked.reason }) }).catch(() => undefined)
            // A step whose last three walks all failed stops the goal for the person (§2.7, the three rounds of §3.7.3); the same for a flow the review failed three times.
            if (walked.outcome === 'failed') {
              const fresh = await openEngine(spec.graphDir).load()
              for (const item of flow.steps) {
                if (item.step.status !== 'approved' || stopped.has(item.step.id)) continue
                const walks = (fresh.nodes.get(item.step.id)?.history ?? []).filter(entry => entry.op === 'walk' && (entry.evidence ?? []).length > 0).slice(-3)
                if (walks.length === 3 && walks.every(entry => (entry.evidence ?? []).every(evidence => evidence.exit !== 0))) {
                  stopped.add(item.step.id)
                  deps.emit(spec.project, spec.sessionId, { event: 'hourness.stopped', key: `stopped:${item.step.id}:walk-${walks.at(-1)?.at}`, payload: { node: item.step.id, kind: 'acceptance', rounds: 3 } })
                }
              }
            }
            if (walked.outcome === 'review_failed' && !stopped.has(flow.flow.id)) {
              const fails = (await readWalkLines(execDir)).filter(line => line.kind === 'flow-end' && line.flow === flow.flow.id && line.outcome === 'review_failed').slice(-REVIEW_TRIES)
              if (fails.length === REVIEW_TRIES) {
                stopped.add(flow.flow.id)
                deps.emit(spec.project, spec.sessionId, { event: 'hourness.stopped', key: `stopped:${flow.flow.id}:walk-review-${fails.at(-1)?.at}`, payload: { node: flow.flow.id, kind: 'acceptance', rounds: REVIEW_TRIES } })
              }
            }
            if (signal.aborted) break
          }
        }
      }
    }
    catch (error) {
      notRun(`走一遍作业中途出错（${error instanceof Error ? error.message : String(error)}）；没跑的流程等下一次 dispatch_task`)
    }
    finally {
      await lock.release().catch(() => undefined)
    }
  }
  for (const flow of spec.flows) {
    if (results.every(result => result.flow !== flow.flow.id)) results.push({ flow: flow.flow.id, outcome: 'not_run', limitMs: 0, elapsedMs: 0 })
  }
  let trunkMoved = false
  const tip = await deps.git.resolveCommit(spec.project, `refs/heads/${spec.trunk.branch}`)
  if (tip !== undefined && tip !== commit) {
    const changed = await deps.git.changedFiles(spec.project, commit, tip)
    trunkMoved = !changed.ok || !changed.value.every(file => file.path === graphRel || file.path.startsWith(`${graphRel}/`))
  }
  await appendWalkLine(execDir, WALKS_JOURNAL, { kind: 'end', job: spec.job, trunkMoved, at: now().toISOString() }).catch(() => undefined)
  emitMetric({
    event: 'execute.walk',
    phase: 'end',
    goal: spec.goal.id,
    job: spec.job,
    commit,
    passed: results.filter(result => result.outcome === 'passed').length,
    failed: results.filter(result => result.outcome === 'failed').length,
    outcomes: results.map(result => result.outcome),
  })
  deps.emit(spec.project, spec.sessionId, {
    event: 'hourness.walk-done',
    key: `walk-done:${spec.job}`,
    payload: { job: spec.job, goal: spec.goal.id, commit, trunkMoved, flows: results.map(result => `${result.flow} ${result.outcome}`) },
  })
}

/**
 * The restart reconcile's walk step (§2.7): a job whose `start` line has no
 * `end` is marked `abandoned` in the journal; a `命令` flow of such a job
 * with a `flow-end` but no `evidence` line has its evidence written again
 * from the run's copy — a step the graph already carries under the same
 * reason is left alone. A `截图` or `终端` flow has no review verdict on
 * record to re-write from: the next job re-walks it. The count of the
 * evidence entries landed.
 */
export async function reconcileWalks(graphDir: string, execDir: string, deps: Pick<WalkDeps, 'report' | 'now'>, sessionId: string | undefined): Promise<number> {
  const now = deps.now ?? ((): Date => new Date())
  const lines = await readWalkLines(execDir)
  const started = new Map<string, string>()
  const ended = new Set<string>()
  const abandoned = new Set<string>()
  const evidenced = new Set<string>()
  const ends: Extract<WalkLine, { readonly kind: 'flow-end' }>[] = []
  for (const line of lines) {
    if (line.kind === 'start') started.set(line.job, line.commit)
    else if (line.kind === 'end') ended.add(line.job)
    else if (line.kind === 'abandoned') abandoned.add(line.job)
    else if (line.kind === 'evidence') evidenced.add(`${line.job}\n${line.flow}`)
    else if (line.kind === 'flow-end') ends.push(line)
  }
  for (const job of started.keys()) {
    if (ended.has(job) || abandoned.has(job)) continue
    await appendWalkLine(execDir, WALKS_JOURNAL, { kind: 'abandoned', job, at: now().toISOString() }).catch(() => undefined)
    abandoned.add(job)
  }
  const graph = await openEngine(graphDir).load()
  let count = 0
  for (const end of ends) {
    if (!abandoned.has(end.job) || evidenced.has(`${end.job}\n${end.flow}`) || end.outcome === 'not_run') continue
    const commit = started.get(end.job)
    const goal = end.flow === undefined ? undefined : graph.nodes.get(end.flow) === undefined ? undefined : goalOf(graph, end.flow)
    const flow = goal === undefined ? undefined : userGraphOf(graph, goal).roles.flatMap(role => role.flows).find(candidate => candidate.flow.id === end.flow)
    // No review verdict survives a restart: only a 命令 flow's evidence can be re-written from the copy (§2.7).
    if (commit === undefined || flow === undefined || 'unparsed' in flow.spec || flow.spec.kind !== '命令') continue
    const copy = join(execDir, WALK_RUNS_DIR, end.job, end.flow)
    const report = await checkReport(copy, flow, end.outcome === 'timeout')
    const { entries, written } = await writeFlowEvidence(deps, { graphDir, commit, job: end.job, sessionId }, flow, flow.spec.kind, flow.spec.command, copy, report, end.exit ?? -1, undefined)
    if (entries.length === 0 || written.length !== entries.length) continue
    await appendWalkLine(execDir, WALKS_JOURNAL, { kind: 'evidence', job: end.job, flow: end.flow, steps: written, at: now().toISOString() }).catch(() => undefined)
    count += entries.length
  }
  return count
}

