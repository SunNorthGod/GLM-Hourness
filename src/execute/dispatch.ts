/**
 * `dispatch_task` (M7 design 0.6 §3.1): the tool that hands one task of the
 * project graph to a subagent. The gate (briefGate, the pure part) runs
 * first; then the worktree of a write task with its setup commands (§3.1.2
 * step 4), the model choice against the provider's catalog (§3.1.3), the
 * activation on the `subagents` service (step 8), the register entry
 * (§3.1.4), and the dispatch comment with its pins on the task (step 10) —
 * approved tasks go to `doing` in the same write round. A design review of a
 * module is dispatched with the module id: the harness proposes the review
 * task under the module, idempotent by shape, and dispatches it (§3.7.5).
 * The review of a task and of a whole goal are later steps' (E6, E8) and
 * refuse until they land.
 *
 * The graph is read through the row's revision-keyed cache so the
 * write-scope check of the workers sees the same revision the dispatch saw
 * (§3.2.1). The peak cap is one read of the rules board's service per call,
 * for a GLM model only (§3.1.2 step 3); M7 reads no level and no clock. A
 * graph write that fails is retried three times with fresh revisions and
 * never undoes the dispatch (step 10).
 */
import { exec } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { openEngine } from '../graph/engine.ts'
import { DESIGN_REVIEW_ACCEPTANCE, isDesignReview, releaseOf } from '../graph/execute-stage.ts'
import type { LoadedGraph } from '../graph/parse.ts'
import type { GraphNode } from '../graph/schema.ts'
import { pinsOf, renderPins } from '../graph/pins.ts'
import { projectOf } from '../data/project-root.ts'
import { peakModeService } from '../shared/peak-mode.ts'
import { isGlmModel } from '../shared/route.ts'
import type { AgentLike, LiveAgentLike, ServiceLookup, ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import { briefGate, renderBrief, renderDesignReviewBrief, renderReviewBrief, type Brief, type BriefContext, type GateResult } from './brief.ts'
import { makeChildId, nextAttempt, parseHandbackComment, registerAttempt, registeredDispatches, renderDispatchComment, type Attempt, type DispatchSummary, type HandbackComment, type PlanStatus } from './attempts.ts'
import { sha256Hex } from './digest.ts'
import { dispatchDescription } from './examples.ts'
import { agentOptionsOf, checkModelChoice, CATALOG_UNCHECKED_NOTE, type CatalogEntry, type ModelChoice } from './models.ts'
import { carriedPlan, planPathsOfSection, planStatusOf, readPlanSection } from './plan.ts'
import { changeOf, readCalls, type Settlement } from './handback.ts'
import { floorHits, parseFloor } from './floor.ts'
import { writeWithRetry } from './retry.ts'
import { HANDBACK_SCHEMA, REVIEW_SCHEMA, mergeHandbackSchema } from './schemas.ts'
import { DEFAULT_WATCHED, parseGateNorm } from './gate-norm.ts'
import { createGit, watchedDigest, type Git } from './git.ts'
import { emitMetric } from './metrics.ts'
import { isRecord, refuse, toolShell } from '../design/tool-support.ts'

/** A shell command run in a directory, with its own cap; tests inject it. The handback processing takes one through the row's deps. */
export type CommandRunner = (cwd: string, command: string, timeoutMs: number) => Promise<{ readonly code: number | undefined, readonly stdout: string, readonly stderr: string }>

/** The real runner: a shell line through `exec`, the way the gate commands are written. */
export const realCommandRunner: CommandRunner = (cwd, command, timeoutMs) => new Promise((done) => {
  exec(command, { cwd, timeout: timeoutMs, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C', LANGUAGE: 'C' } }, (error, stdout, stderr) => {
    const code = error === null ? 0 : typeof error.code === 'number' ? error.code : undefined
    done({ code, stdout: String(stdout), stderr: stderr === '' && error !== null ? error.message : String(stderr) })
  })
})

const SETUP_TIMEOUT_MS = 10 * 60_000
export interface GraphCache {
  load(dir: string): Promise<LoadedGraph>
  get(dir: string): LoadedGraph | undefined
}

export function createGraphCache(problem: (reason: string) => void): GraphCache {
  const cached = new Map<string, LoadedGraph>()
  return {
    async load(dir) {
      try {
        const graph = await openEngine(dir).load()
        cached.set(dir, graph)
        return graph
      }
      catch (error) {
        const held = cached.get(dir)
        if (held === undefined) throw error
        problem(`图读不出（${error instanceof Error ? error.message : String(error)}），沿用上一次读到的一份`)
        return held
      }
    },
    get: dir => cached.get(dir),
  }
}

/** The `subagents` and `llm` members the dispatch needs; undefined when the host has no subagents service. */
interface DispatchServices {
  readonly start: (spec: {
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
  }) => Promise<unknown>
  readonly maxDepth: () => number | undefined
  readonly catalog: (provider: string) => Promise<readonly CatalogEntry[] | undefined>
  readonly efforts: (provider: string, model: string) => Promise<readonly string[] | undefined>
}

function readServices(lookup: ServiceLookup | undefined): DispatchServices | undefined {
  const get = (name: string): unknown => lookup === undefined || typeof lookup.get !== 'function' ? undefined : lookup.get(name)
  const subagents = get('subagents') as {
    startActivation?: (spec: never) => Promise<unknown>
    resolveMaxDepth?: (configured?: unknown) => number | undefined
  } | undefined
  if (subagents === undefined || typeof subagents.startActivation !== 'function' || typeof subagents.resolveMaxDepth !== 'function') return undefined
  const llm = get('llm') as {
    listModels?: (provider: string) => Promise<readonly CatalogEntry[]>
    resolveModelInfo?: (provider: string, model: string) => Promise<{ readonly reasoning?: { readonly efforts?: readonly string[] } } | undefined>
  } | undefined
  const hasLlm = llm !== undefined && typeof llm.listModels === 'function' && typeof llm.resolveModelInfo === 'function'
  return {
    // The services are called as methods: the runtime's members read `this`.
    start: spec => subagents.startActivation!(spec as never),
    maxDepth: () => subagents.resolveMaxDepth!(),
    catalog: hasLlm
      ? async (provider) => {
        try {
          return await llm.listModels!(provider)
        }
        catch {
          return undefined
        }
      }
      : () => Promise.resolve(undefined),
    efforts: hasLlm
      ? async (provider, model) => {
        try {
          return (await llm.resolveModelInfo!(provider, model))?.reasoning?.efforts
        }
        catch {
          return undefined
        }
      }
      : () => Promise.resolve(undefined),
  }
}

/** What the tool needs from the row. */
export interface DispatchDeps {
  readonly lookup: ServiceLookup
  /** Where the project graph of a working directory is; undefined outside a project with a graph. */
  readonly graphDir: (cwd: string | undefined) => string | undefined
  /** The row's revision-keyed graph cache. */
  readonly cache: GraphCache
  /** Whether the agent's session is its project's main agent now; may throw. */
  readonly isMainAgent: (agent: AgentLike) => boolean
  /** Whether the design row is loaded, whose /wish makes the main agent. */
  readonly designPresent: () => boolean
  /** Parallel write slots of the row (the `slots` setting, default 3). */
  readonly slots: number
  /** `<proj>/.llm/execute` of a project root: where the tasks' setup logs and digests live. */
  readonly execDir: (projectRoot: string) => string
  /** Report the row health of a session. */
  readonly report: (sessionId: string | undefined, state: 'active' | 'degraded', reason: string) => void
  /** Whether the row remembers an unwritable stop marker for the node (§3.7.3); the brief gate refuses the dispatch then. */
  readonly stoppedInMemory?: (nodeId: string) => boolean
  /** Whether the reviewed task of a review dispatch has a current finished handback (§3.5.1); the row reads the handback comment shapes. */
  readonly reviewTarget?: (graph: LoadedGraph, reviewTask: GraphNode) => { readonly handedBack: boolean, readonly stale: boolean }
  /** Run the handback processing of one settled activation (§3.6.2); the row wires it to the handback module. */
  readonly onHandback?: (attempt: Attempt, settlement: Settlement) => void
  /** The runner of the setup commands; tests inject failures. */
  readonly runCommand?: CommandRunner
  /** The clock of history timestamps; tests pin it. */
  readonly now?: () => Date
  /** The random source of the child id suffix; tests pin it. */
  readonly random?: () => number
}

const PARAMETERS = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The task, the review task, the goal (its acceptance review), or the module (its design review).' },
    model: { type: 'string', description: 'The model id the subagent runs on, from the dispatch notice. There is no default.' },
    why: { type: 'string', description: 'Why this model, one line of at most 300 characters.' },
    provider: { type: 'string', description: 'Defaults to yours.' },
    reasoningEffort: { type: 'string', description: 'Defaults to the model\'s own.' },
    review: {
      type: 'object',
      description: 'Write tasks only: the review depth you declare. Default full; light and skip need why.',
      properties: { depth: { type: 'string', enum: ['full', 'light', 'skip'] }, why: { type: 'string', description: 'Required for light and skip, at most 300 characters.' } },
      required: ['depth'],
    },
    depth: { type: 'string', enum: ['full', 'light'], description: 'Review tasks only: this round\'s depth.' },
    depthWhy: { type: 'string', description: 'Review tasks only: required when depth is shallower than the dispatch.' },
    context: { type: 'string', description: 'What you add for the worker, at most 4000 characters.' },
    quick: { type: 'boolean', description: 'Write tasks only: a write scope of at most 2 files needs no plan.' },
  },
  required: ['id', 'model', 'why'],
  additionalProperties: false,
} as const

const OUTPUT = {
  type: 'object',
  properties: {
    task: { type: 'string' },
    attempt: { type: 'integer' },
    childId: { type: 'string' },
    role: { type: 'string', enum: ['worker', 'review'] },
    worktree: { type: 'string' },
    branch: { type: 'string' },
    provider: { type: 'string' },
    model: { type: 'string' },
    reasoningEffort: { type: 'string' },
    review: { type: 'string', enum: ['full', 'light', 'skip'] },
    brief: { type: 'string', description: '12 hex digits of the brief.' },
    plan: { type: 'string', enum: ['required', 'approved', 'skipped', 'none'] },
  },
  required: ['task', 'attempt', 'childId', 'role', 'provider', 'model', 'brief', 'plan'],
} as const

/** The provider a dispatch without one runs on: the session's route (subagent:293–303). */
const routeOf = (agent: AgentLike): string | undefined => {
  const header = agent.session?.requestHeader?.()
  const fromHeader = header === undefined ? undefined : header.config?.provider
  if (fromHeader !== undefined) return fromHeader
  const options = (agent as { readonly options?: { readonly provider?: string } }).options
  return options?.provider
}

const mainModelOf = (agent: AgentLike): string | undefined => {
  const header = agent.session?.requestHeader?.()
  return header === undefined ? undefined : header.config?.model
}

/** `until` as HH:MM in the local zone, for the peak message (§3.1.2 step 3). */
function hhmm(iso: string): string | undefined {
  const at = Date.parse(iso)
  return Number.isNaN(at) ? undefined : new Date(at).toTimeString().slice(0, 5)
}

function lastLines(text: string, count: number): string[] {
  return text.split(/\r?\n/).filter(line => line !== '').slice(-count)
}

/** The project root a graph directory belongs to: the session's project, else two levels above the graph directory. */
function projectRootOf(dir: string, cwd: string | undefined): string {
  return (cwd !== undefined ? projectOf(cwd)?.root : undefined) ?? dirname(dirname(dir))
}

/** Whether the task's `outputSchema` resolves to an object schema in the runtime's subset (§3.5.1 bad_schema). */
async function schemaResolves(node: GraphNode, projectRoot: string | undefined): Promise<boolean> {
  const named = node.outputSchema
  if (named === undefined || named === 'hourness-handback-v1' || named === 'hourness-review-v1') return true
  if (projectRoot === undefined || !named.endsWith('.json')) return false
  const text = await readFile(join(projectRoot, named), 'utf8').catch(() => undefined)
  return text !== undefined && mergeHandbackSchema(safeJson(text)) !== undefined
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

/** The schema the worker submits with (§3.6.1): the built-in handback, or the task's file merged with the core fields. */
async function schemaFor(node: GraphNode, projectRoot: string | undefined): Promise<unknown> {
  const named = node.outputSchema
  if (named === undefined || !named.endsWith('.json') || projectRoot === undefined) return HANDBACK_SCHEMA
  const text = await readFile(join(projectRoot, named), 'utf8').catch(() => undefined)
  return text === undefined ? HANDBACK_SCHEMA : mergeHandbackSchema(safeJson(text)) ?? HANDBACK_SCHEMA
}

interface WorktreeOutcome {
  readonly ok: true
  readonly path: string
  readonly branch: string
  readonly base: string
  readonly baseSha: string
  readonly renamedFrom?: string
}

interface WorktreeRefusal {
  readonly ok: false
  readonly code: string
  readonly message: string
  readonly hint: string
}

/** The worktree of a write task and its setup commands (§3.1.2 step 4). */
async function prepareWorktree(
  git: Git,
  deps: DispatchDeps,
  runCommand: CommandRunner,
  graph: LoadedGraph,
  task: GraphNode,
  cwd: string,
  projectRoot: string,
  now: () => Date,
): Promise<WorktreeOutcome | WorktreeRefusal> {
  const outcome = await git.ensureWorktree(cwd, task.id)
  if (!outcome.ok) {
    const hints: Record<string, string> = {
      not_git: 'dispatch_task runs from the main checkout of a git repository.',
      no_base_branch: 'check out the branch the work is based on, then dispatch again.',
      bad_task: 'the node id cannot be a branch name.',
      worktree_dirty: 'commit or discard the files named in the reason, then dispatch again.',
      worktree_failed: 'fix what the reason names, then dispatch again.',
    }
    const files = 'files' in outcome && outcome.files !== undefined ? ` Files: ${outcome.files.join(', ')}.` : ''
    return { ok: false, code: outcome.code, message: outcome.reason, hint: `${hints[outcome.code] ?? ''}${files}` }
  }
  const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
  const setup = gate.commands.filter(command => command.kind === 'setup')
  const tasksDir = join(deps.execDir(projectRoot), 'tasks', task.id)
  const stateFile = join(tasksDir, 'setup.json')
  if (setup.length === 0) return { ok: true, path: outcome.path, branch: outcome.branch, base: outcome.base, baseSha: outcome.baseSha, ...(outcome.renamedFrom === undefined ? {} : { renamedFrom: outcome.renamedFrom }) }
  const watched = [...new Set(setup.flatMap(command => command.when ?? DEFAULT_WATCHED))]
  const digest = await watchedDigest(outcome.path, watched)
  const prior = await readFile(stateFile, 'utf8').then(text => safeJson(text) as { readonly digest?: string } | undefined, () => undefined)
  if (!outcome.created && prior?.digest === digest) {
    return { ok: true, path: outcome.path, branch: outcome.branch, base: outcome.base, baseSha: outcome.baseSha, ...(outcome.renamedFrom === undefined ? {} : { renamedFrom: outcome.renamedFrom }) }
  }
  const stamp = now().toISOString().replaceAll(':', '-')
  const logFile = join(tasksDir, `setup-${stamp}.log`)
  const sections: string[] = []
  for (const command of setup) {
    const result = await runCommand(outcome.path, command.command, SETUP_TIMEOUT_MS)
    sections.push(`$ ${command.command}\n${result.stdout}${result.stderr === '' || result.stderr === result.stdout ? '' : `\n${result.stderr}`}\nexit ${result.code ?? 'unknown'}\n`)
    if (result.code !== 0) {
      if (outcome.created) await git.discardWorktree(cwd, outcome.path, outcome.branch)
      const log = sections.join('\n')
      await mkdir(tasksDir, { recursive: true }).catch(() => undefined)
      await writeFile(logFile, log, 'utf8').catch(() => undefined)
      return {
        ok: false,
        code: 'worktree_setup_failed',
        message: `the setup command failed: ${command.command}`,
        hint: `The log is ${logFile}; its last lines:\n${lastLines(log, 20).join('\n')}`,
      }
    }
  }
  const log = sections.join('\n')
  await mkdir(tasksDir, { recursive: true }).catch(() => undefined)
  await Promise.all([
    writeFile(logFile, log, 'utf8').catch(() => undefined),
    writeFile(stateFile, `${JSON.stringify({ digest })}\n`, 'utf8').catch(() => undefined),
  ])
  return { ok: true, path: outcome.path, branch: outcome.branch, base: outcome.base, baseSha: outcome.baseSha, ...(outcome.renamedFrom === undefined ? {} : { renamedFrom: outcome.renamedFrom }) }
}

/** The design-review task of a module: reuse the one of the right shape, else propose it (§3.7.5); returns the reloaded node. */
async function proposeDesignReview(deps: DispatchDeps, dir: string, graph: LoadedGraph, module: GraphNode, now: () => Date): Promise<LoadedGraph> {
  const existing = [...graph.nodes.values()].find(entry => entry.parent === module.id && isDesignReview(graph, entry))
  if (existing !== undefined) return graph
  const sources = [...graph.nodes.values()]
    .filter(entry => entry.parent === module.id && entry.type === 'decision' && entry.status !== 'dropped' && entry.status !== 'superseded')
    .map(entry => ({ type: 'source' as const, to: entry.id }))
  const proposed = await writeWithRetry(() => openEngine(dir, { now }).apply('harness', {
    op: 'propose',
    reason: `module design review of ${module.id}`,
    node: {
      type: 'task',
      parent: module.id,
      kind: 'review',
      writeScope: [],
      title: `审查：${module.title}`,
      acceptance: [DESIGN_REVIEW_ACCEPTANCE],
      ...(sources.length > 0 ? { edges: sources } : {}),
    },
  }))
  if (!proposed.ok) refuse('invalid', `the design review task could not be proposed: ${proposed.error.message}`, proposed.error.hint)
  return deps.cache.load(dir)
}

/** The tool. */
export function dispatchTool(deps: DispatchDeps): ToolDefinitionLike {
  const git: Git = createGit()
  const runCommand = deps.runCommand ?? realCommandRunner
  const now = deps.now ?? ((): Date => new Date())
  const random = deps.random ?? Math.random

  return {
    ...toolShell('dispatch_task', dispatchDescription(), PARAMETERS, OUTPUT),
    async execute(args: unknown, exec: ToolExecutionContext): Promise<DispatchSummary> {
      const agent = exec.agent
      if (agent === undefined) refuse('forbidden', 'dispatch_task runs for an agent', 'dispatch_task is a tool of a session')
      let main = false
      try {
        main = deps.isMainAgent(agent)
      }
      catch {
        // A role that cannot be read is no role.
      }
      if (!main) refuse('forbidden', 'only the main agent dispatches work', deps.designPresent() ? 'make this session the main agent with /wish' : '先启用 glm-hourness/design 并 /wish')
      const cwd = agent.session?.header.cwd
      const dir = deps.graphDir(cwd)
      if (dir === undefined) refuse('invalid', 'no project graph for this session', '先启用 glm-hourness/design 并 /wish，等目标放行后再派活')
      const graph = await deps.cache.load(dir)
      const id = isRecord(args) && typeof args.id === 'string' ? args.id : ''
      const node = graph.nodes.get(id)
      if (node === undefined) refuse('bad_task', `no node "${id}" in the graph`, 'check the id against the open items')
      const rawModel = isRecord(args) && typeof args.model === 'string' ? args.model : undefined

      // The peak cap: one read per call, GLM models only (§3.1.2 step 3).
      let glmWorkerCap: BriefContext['glmWorkerCap']
      if (rawModel !== undefined && isGlmModel(rawModel)) {
        const state = peakModeService(deps.lookup)?.stateFor(agent.session?.id ?? '')
        const until = state?.until === undefined ? undefined : hhmm(state.until)
        if (state?.glmWorkerCap !== undefined) glmWorkerCap = { cap: state.glmWorkerCap, ...(until === undefined ? {} : { until }) }
      }

      const project = projectRootOf(dir, cwd)
      const gate = parseGateNorm(graph.nodes.get('norm-merge-gate'))
      const gateCommands = gate.commands.filter(command => command.kind === 'check').map(command => command.command)
      const outputSchemaOk = await schemaResolves(node, project)
      // The catalog of the call's provider, for the hint of an invalid call (§3.5.1 invalid row); a read failure reads as no catalog.
      const hintProvider = isRecord(args) && typeof args.provider === 'string' ? args.provider : routeOf(agent)
      const services = readServices(deps.lookup)
      if (services === undefined) refuse('inactive', 'the subagents service is not available', 'the host needs the subagents row to start a dispatch')
      const hintCatalog = hintProvider === undefined ? undefined : await services.catalog(hintProvider)
      const reviewTask = node.kind === 'review' && !isDesignReview(graph, node)
      const verdict: GateResult = briefGate(graph, node, {
        args,
        running: registeredDispatches(),
        slots: deps.slots,
        release: releaseOf(graph, node),
        stopped: deps.stoppedInMemory?.(node.id) === true,
        ...(glmWorkerCap === undefined ? {} : { glmWorkerCap }),
        outputSchemaOk,
        ...(hintCatalog === undefined ? {} : { catalog: hintCatalog }),
        ...(reviewTask && deps.reviewTarget !== undefined ? { reviewTarget: deps.reviewTarget(graph, node) } : {}),
      })
      if (!verdict.ok) refuse(verdict.code, verdict.message, verdict.hint)
      // The acceptance review of a goal is the drive's (E8); the review of a task dispatches from here on (E6).
      if (verdict.subject === 'goal') refuse('invalid', 'the acceptance review of a goal is dispatched by the drive (step E8), not yet by hand', 'close the tasks of the goal; the loop board entry reminds you')

      const { args: parsed } = verdict
      const provider = parsed.provider ?? routeOf(agent)
      if (provider === undefined) refuse('invalid', 'no provider to run the model on', 'pass provider, or dispatch from a session with a provider')
      const catalog = await services.catalog(provider)
      if (catalog === undefined && parsed.provider !== undefined) refuse('unknown_provider', `provider "${parsed.provider}" is not registered`, 'use one of the providers of this host, or leave provider out')
      const efforts = await services.efforts(provider, parsed.model)
      const choice: ModelChoice = { provider, model: parsed.model, ...(parsed.reasoningEffort === undefined ? {} : { reasoningEffort: parsed.reasoningEffort }) }
      const checked = checkModelChoice(choice, catalog, efforts)
      if (!checked.ok) refuse(checked.code, checked.message, checked.hint)

      // The design review of a module: propose the review task, then dispatch it (§3.7.5). The review of a task runs in the reviewed task's worktree (§3.7.1).
      const designReview = verdict.subject === 'module'
      const taskReview = verdict.subject === 'review'
      const targetGraph = designReview ? await proposeDesignReview(deps, dir, graph, node, now) : graph
      const target = designReview ? findDesignReview(targetGraph, id) ?? node : node
      const isWorkerRole = !designReview && !taskReview

      // Worktree and setup commands: write tasks only (§3.1.2 step 4).
      let worktree: WorktreeOutcome | undefined
      if (isWorkerRole) {
        const outcome = await prepareWorktree(git, deps, runCommand, targetGraph, target, cwd ?? project, project, now)
        if (!outcome.ok) refuse(outcome.code, outcome.message, outcome.hint)
        worktree = outcome
      }

      // The review of a task (§3.7.1): the reviewer's worktree is the reviewed task's, read-only, and the floor is judged as it stands now.
      let reviewed: GraphNode | undefined
      let reviewedWorktree: string | undefined
      let reviewHandback: HandbackComment | undefined
      let depth: 'full' | 'light' = 'full'
      if (taskReview) {
        reviewed = target.parent === undefined ? undefined : targetGraph.nodes.get(target.parent)
        if (reviewed === undefined) refuse('nothing_to_review', `Review task ${target.id} has no reviewed task.`, 'the reviewed task is the parent of the review task')
        reviewHandback = reviewed.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [parseHandbackComment(entry.text)] : []).filter(entry => entry !== undefined && entry.status === 'done').at(-1)
        depth = parsed.depth ?? (reviewHandback?.depth === '轻审' ? 'light' : 'full')
        reviewedWorktree = join(project, '.worktrees', `hz-${reviewed.id}`)
        if (!(await stat(reviewedWorktree).then(() => true, () => false))) {
          refuse('worktree_failed', `the worktree of the reviewed task ${reviewed.id} is gone`, 'dispatch the reviewed task again to recreate it, then dispatch its review')
        }
        const floor = parseFloor(targetGraph.nodes.get('norm-review-floor'))
        const change = await changeOf(git, reviewedWorktree, reviewHandback?.base, reviewHandback?.head)
        const calls = await readCalls(join(deps.execDir(project), 'tasks', reviewed.id, `${reviewHandback?.childId ?? ''}.commands.jsonl`))
        const hits = floorHits(floor, change, calls, reviewedWorktree)
        if (depth === 'light') {
          if (floor.unparsed.length > 0) {
            const text = floor.entries.filter(entry => floor.unparsed.includes(entry.index)).map(entry => `"${entry.text}"`).join('; ')
            refuse('floor_unparsed', `the must-review floor has ${floor.unparsed.length} line(s) the harness cannot judge: ${text}`, 'the person has not given these lines a form the harness can judge; every task is fully reviewed until they do')
          }
          if (hits.length > 0) {
            refuse('floor_requires_full', `the change hits the must-review floor: ${hits.map(hit => `#${hit.index} (${hit.reason})`).join(', ')}`, 'dispatch the review with depth full, or ask the person to narrow the floor')
          }
        }
      }

      const attempt = nextAttempt(target)
      const childId = makeChildId(target.id, attempt, random)
      const plan: PlanStatus = isWorkerRole ? planStatusOf(target, parsed.quick) : 'none'
      const approved = plan === 'approved' ? carriedPlan(target) : undefined
      const section = readPlanSection(target.body)
      const brief: Brief = isWorkerRole
        ? renderBrief({
            graph: targetGraph,
            task: target,
            childId,
            parent: agent.id,
            worktree: worktree!.path,
            branch: worktree!.branch,
            base: { branch: worktree!.base, sha: worktree!.baseSha },
            ...(parsed.context === undefined ? {} : { context: parsed.context }),
            earlier: [],
            ...(approved !== undefined && section !== undefined ? { plan: { version: approved.version, steps: section.steps } } : {}),
            ...(parsed.quick === true ? { quick: true } : {}),
            gateCommands,
          })
        : taskReview
          ? renderReviewBrief({
              graph: targetGraph,
              task: target,
              reviewed: reviewed!,
              childId,
              depth,
              ...(reviewHandback === undefined ? {} : { handback: { ...(reviewHandback.head === undefined ? {} : { head: reviewHandback.head }), ...(reviewHandback.base === undefined ? {} : { base: reviewHandback.base }), status: reviewHandback.status } }),
              gateCommands,
            })
          : renderDesignReviewBrief({ graph: targetGraph, childId, parent: agent.id, task: target })

      // The activation (§3.1.2 step 8); a full activation budget is slots_full like any other full slot.
      const outputSchema = isWorkerRole ? await schemaFor(target, project) : REVIEW_SCHEMA
      const cwdOf = taskReview && reviewedWorktree !== undefined ? resolve(project, reviewedWorktree) : worktree === undefined ? project : resolve(project, worktree.path)
      const maxDepth = services.maxDepth()
      let activation: unknown
      try {
        activation = await services.start({
          provider: 'spawn',
          label: `hourness ${taskReview ? 'review' : 'task'} ${target.id} attempt ${attempt}`,
          childId,
          request: {
            // The child's working directory is absolute: the session header
            // keeps it, and the chain's git judge compares it with the
            // register's worktree regardless of the host's process cwd.
            cwd: cwdOf,
            prompt: [{ type: 'text', text: brief.text }],
            parent: agent as unknown as LiveAgentLike,
            agentOptions: agentOptionsOf(choice),
            outputSchema,
            ...(maxDepth === undefined ? {} : { maxDepth }),
          },
          signal: exec.signal,
          delivery: 'caller',
        })
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('ACTIVATION_LIMIT_REACHED')) {
          refuse('slots_full', 'the runtime\'s activation budget is full', `Running in this process: ${registeredDispatches().map(running => running.childId).join(', ') || 'none'}.`)
        }
        refuse('invalid', `the subagent could not be started: ${message}`, 'fix what the message names and send the call again')
      }
      const pins = renderPins(pinsOf(targetGraph, target, sha256Hex))
      const record: Attempt = {
        childId,
        role: isWorkerRole ? 'worker' : 'review',
        node: target.id,
        attempt,
        graphDir: dir,
        // The register carries the absolute worktree path: the guards compare
        // it against the caller's session directory, whatever the host's
        // process cwd is (the summary shows the repository-relative form). A
        // reviewer's worktree is the reviewed task's, read-only (§3.7.1).
        ...(taskReview && reviewedWorktree !== undefined ? { worktree: resolve(project, reviewedWorktree), depth } : {}),
        ...(worktree === undefined ? {} : { worktree: resolve(project, worktree.path), branch: worktree.branch, baseSha: worktree.baseSha, ...(parsed.review === undefined ? {} : { review: parsed.review.depth }) }),
        ...(agent.session?.id === undefined ? {} : { parentSession: agent.session.id }),
        provider,
        model: parsed.model,
        ...(parsed.reasoningEffort === undefined ? {} : { reasoningEffort: parsed.reasoningEffort }),
        why: parsed.why,
        plan,
        // The carried plan's path union (§3.3.4): the write gate reads it
        // (§3.2.1). A body whose section cannot be read carries an empty
        // union — the worker can write nothing, the strict side.
        ...(plan === 'approved' ? { planPaths: section === undefined ? [] : planPathsOfSection(section.steps) } : {}),
        pins,
      }
      registerAttempt(record)
      // The handback processing runs when the activation settles (§3.6.2); a settlement that rejects is an error handback, never an unhandled rejection.
      if (deps.onHandback !== undefined && activation !== null && typeof activation === 'object') {
        const result = (activation as { result?: unknown }).result
        if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
          void (result as Promise<unknown>).then(
            settlement => deps.onHandback?.(record, isRecord(settlement) ? settlement : {}),
            () => deps.onHandback?.(record, { stopReason: 'error' }),
          )
        }
      }

      // The dispatch comment and the doing status, retried; a failed write never undoes the dispatch (§3.1.2 step 10).
      const notes = [
        ...(worktree?.renamedFrom === undefined ? [] : [`旧分支留在 ${worktree.renamedFrom}`]),
        ...(checked.note === CATALOG_UNCHECKED_NOTE ? [CATALOG_UNCHECKED_NOTE] : []),
      ]
      const comment = renderDispatchComment({
        attempt,
        childId,
        ...(worktree === undefined ? {} : { base: { branch: worktree.base, sha: worktree.baseSha.slice(0, 12) } }),
        provider,
        model: parsed.model,
        ...(parsed.reasoningEffort === undefined ? {} : { reasoningEffort: parsed.reasoningEffort }),
        why: parsed.why,
        ...(isWorkerRole && parsed.review !== undefined ? { review: parsed.review } : taskReview ? { review: { depth, ...(parsed.depthWhy === undefined ? {} : { why: parsed.depthWhy }) } } : {}),
        brief: brief.digest,
        ...(notes.length > 0 ? { note: notes.join('；') } : {}),
        pins,
      })
      const engine = openEngine(dir, { now })
      const written = await writeWithRetry(() => engine.apply('harness', { op: 'comment', id: target.id, text: comment })).catch(() => undefined)
      if (written === undefined) {
        deps.report(agent.session?.id, 'degraded', `派发批注写不进图（任务 ${target.id}）；派发的事实在这个会话的工具调用里`)
      }
      if (target.status === 'approved') {
        const status = await writeWithRetry(async () => {
          const current = await engine.load()
          return engine.apply('harness', { op: 'status', id: target.id, rev: current.revisions.get(target.id)!, to: 'doing', reason: `dispatch ${childId}` })
        }).catch(() => undefined)
        if (status === undefined) deps.report(agent.session?.id, 'degraded', `派发批注已写，任务 ${target.id} 没能转为进行中`)
      }

      const summary: DispatchSummary = {
        task: target.id,
        attempt,
        childId,
        role: isWorkerRole ? 'worker' : 'review',
        ...(worktree === undefined ? {} : { worktree: relative(project, worktree.path).replaceAll('\\', '/'), branch: worktree.branch }),
        provider,
        model: parsed.model,
        ...(parsed.reasoningEffort === undefined ? {} : { reasoningEffort: parsed.reasoningEffort }),
        ...(isWorkerRole && parsed.review !== undefined ? { review: parsed.review.depth } : {}),
        brief: brief.digest,
        plan,
      }
      emitMetric({
        event: 'execute.dispatch',
        role: summary.role,
        node: summary.task,
        attempt,
        childId,
        provider,
        model: parsed.model,
        ...(parsed.reasoningEffort === undefined ? {} : { reasoningEffort: parsed.reasoningEffort }),
        sameAsMain: parsed.model === mainModelOf(agent),
        ...(isWorkerRole && parsed.review !== undefined ? { depth: parsed.review.depth } : {}),
        whyRef: `${target.id}#${attempt}`,
      })
      return summary
    },
  }
}

/** The review task of a module in the graph, by shape (§3.7.5). */
function findDesignReview(graph: LoadedGraph, moduleId: string): GraphNode | undefined {
  return [...graph.nodes.values()].find(entry => entry.parent === moduleId && isDesignReview(graph, entry))
}
