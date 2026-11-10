/**
 * The rig of the trunk-advance specs (M7 design 0.6 §3.8.4, step E7): a real
 * repository (tests/execute-repo.ts) whose graph has the goal, task-1,
 * norm-merge-gate (and norm-review-floor when asked) and the drive comment
 * that names main as the trunk; the fake rc.3 host (tests/fake-rc3.ts) with a
 * scoped pwsh tool that really runs the command through the system shell in
 * the caller's working directory, so pre-execute, the body and post-execute
 * run as the runtime runs them; `installTrunkGate` with the runtime's agent
 * as the main agent, live in the agents service the gate walks a
 * subagent's chain through; `check_commit` on the same records, its pass wired to
 * the gate's `checkedAfter` the way the row wires it. Notices, violations,
 * trunk events, metrics and row-health reports are captured.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { ViolationRecord } from '../src/guard/records.ts'
import { installTrunkGate, type AdvanceRecord } from '../src/execute/advance.ts'
import { registeredAttempt, renderDispatchComment, renderHandbackComment } from '../src/execute/attempts.ts'
import { checkCommitTool, readAdvances, type CheckDeps } from '../src/execute/check.ts'
import { createGraphCache } from '../src/execute/dispatch.ts'
import { createGateLauncher } from '../src/execute/gate-provider.ts'
import { createGit } from '../src/execute/git.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import type { AgentLike, ServiceLookup, ToolDefinitionLike, ToolFinalResult, UserNotice } from '../src/shared/dsh-min.ts'
import { noticeHost } from './execute-helpers.ts'
import { GOAL, TASK, floorNode, gateNode, sandbox, stageNodes, testRepo, type TestRepo } from './execute-repo.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'

/** Two `$` lines and one `when src/` line, all passing, and the graph directory as the only paths. */
const GATE = ['`$ node -e "process.exit(0)"`', '`$ node -e "process.exit(0)"`', '`$ node -e "process.exit(0)" when src/`', '`only docs/graph/`'] as const
const TRAILER = 'Hourness-Task: task-1'

type Gate = ReturnType<typeof installTrunkGate>
type GateHost = Parameters<typeof installTrunkGate>[0]
type TrunkEventSeen = { readonly project: string, readonly trunk: string, readonly event: { readonly event: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> } }

export interface TrunkRig {
  readonly repo: TestRepo
  /** The bare `origin`, when the rig was made with `remote: true`. */
  readonly remote: string | undefined
  readonly runtime: FakeRuntime
  readonly gate: Gate
  readonly checkDeps: CheckDeps
  readonly execDir: string
  /** The runtime's agent, the project's main agent. */
  readonly main: AgentLike
  readonly sent: UserNotice[]
  readonly violations: ViolationRecord[]
  readonly events: TrunkEventSeen[]
  readonly metrics: MetricEvent[]
  readonly reports: string[]
  /** Run a shell line through the runtime's tool pipeline; `text` is the denial or the command's output. */
  run(command: string, over?: { readonly agent?: AgentLike, readonly callId?: string }): Promise<{ readonly result: ToolFinalResult, readonly callId: string, readonly text: string }>
  /** check_commit as the main agent; the check runs inside the call (no backend registered). */
  check(commit: string): Promise<Record<string, unknown>>
  advances(): Promise<AdvanceRecord[]>
  node(id: string): Promise<GraphNode>
  comments(id: string): Promise<string[]>
  /** One commit on hz/task-1 with the task-1 trailer, then the task worktree `.worktrees/hz-task-1` on that branch. */
  taskBranch(files: Readonly<Record<string, string | null>>): { readonly commit: string, readonly worktree: string }
  /** The dispatch comment and a done handback (depth `skip` writes none, as a skipped review does) on task-1, which goes doing as dispatch_task moves it. */
  dispatched(depth: 'skip' | '全审', head: string): Promise<void>
  dispose(): void
}

/** The pwsh tool for the fake host: the command really runs, through the system shell, in the caller's working directory. */
function shellTool(): ToolDefinitionLike {
  return {
    name: 'pwsh',
    description: 'Run a command line.',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute(args, exec) {
      const command = (args as { readonly command: string }).command
      const cwd = (exec as { readonly agent?: AgentLike }).agent?.session?.header.cwd ?? sandbox
      const ran = spawnSync(command, { shell: true, cwd, encoding: 'utf8', windowsHide: true })
      return Promise.resolve({ exit: ran.status ?? -1, output: `${ran.stdout}${ran.stderr}` })
    },
  }
}

export async function trunkRig(options: {
  readonly gate?: readonly string[]
  readonly floor?: readonly string[]
  readonly remote?: boolean
  /** Whether every trailer task's latest command record hits a `commands` or `outside` floor line (default: none does). */
  readonly taskHit?: boolean
  /** Runs before the gate is installed (a listener registered here is inside the gate's). */
  readonly before?: (runtime: FakeRuntime, gate: () => Gate | undefined) => void
} = {}): Promise<TrunkRig> {
  const repo = testRepo()
  appendFileSync(join(repo.root, '.git', 'info', 'exclude'), '.worktrees/\n')
  const remote = options.remote === true ? repo.withRemote() : undefined
  await stageNodes(repo.graphDir, [GOAL, TASK, gateNode(options.gate ?? GATE), ...(options.floor === undefined ? [] : [floorNode(options.floor)])])
  const engine = openEngine(repo.graphDir)
  const drive = await engine.apply('harness', { op: 'comment', id: 'goal-1', text: '自动推进已开始 · 主干 main' })
  if (!drive.ok) throw new Error('the drive comment was refused')
  const { lookup, sent } = noticeHost({ root: repo.root, graphDir: repo.graphDir })
  const runtime = fakeRuntime({ cwd: repo.root })
  runtime.ctx.tools.register(shellTool())
  const violations: ViolationRecord[] = []
  const events: TrunkEventSeen[] = []
  const metrics: MetricEvent[] = []
  const reports: string[] = []
  const previous = setMetricSink(event => { metrics.push(event) })
  const cache = createGraphCache(() => {})
  const execDir = join(repo.root, '.llm', 'execute')
  const held: { gate?: Gate } = {}
  options.before?.(runtime, () => held.gate)
  // The live agents the gate walks a subagent's chain through: the runtime's agent, and the holder's main-1 the notices go to.
  const holderAgents = lookup.get?.('agents') as { get(id: string): unknown }
  const gateLookup: ServiceLookup = { get: name => name === 'agents' ? { get: (id: string) => id === runtime.agent.id ? runtime.agent : holderAgents.get(id) } : lookup.get?.(name) }
  const installed = installTrunkGate(runtime.ctx as unknown as GateHost, {
    lookup: gateLookup,
    register: registeredAttempt,
    owning: () => undefined,
    effectiveDir: session => session.header.cwd,
    journal: record => { violations.push(record) },
    git: createGit(),
    cache,
    graphDirOfRoot: () => repo.graphDir,
    execDir: root => join(root, '.llm', 'execute'),
    isMain: agent => agent.id === runtime.agent.id,
    report: (_session, _state, reason) => { reports.push(reason) },
    taskHit: () => Promise.resolve(options.taskHit === true),
    onTrunkEvent: (project, trunk, event) => { events.push({ project, trunk, event }) },
  })
  held.gate = installed
  const checkDeps: CheckDeps = {
    lookup,
    cache,
    graphDirOf: () => repo.graphDir,
    execDir: root => join(root, '.llm', 'execute'),
    isMain: agent => agent.id === runtime.agent.id,
    report: (_session, _state, reason) => { reports.push(reason) },
    git: createGit(),
    launcher: createGateLauncher(),
    onPassed: (project, commit) => installed.checkedAfter(project, commit),
  }
  const checkTool = checkCommitTool(checkDeps)
  let calls = 0
  const load = async (id: string): Promise<GraphNode> => {
    const found = (await openEngine(repo.graphDir).load()).nodes.get(id)
    if (found === undefined) throw new Error(`no node ${id}`)
    return found
  }
  return {
    repo,
    remote,
    runtime,
    gate: installed,
    checkDeps,
    execDir,
    main: runtime.agent,
    sent,
    violations,
    events,
    metrics,
    reports,
    async run(command, over = {}) {
      const callId = over.callId ?? `call-${++calls}`
      const batch = await runtime.ctx.tools.execute({ calls: [{ id: callId, name: 'pwsh', arguments: { command } }], agent: over.agent ?? runtime.agent, signal: new AbortController().signal, log: { turn: runtime.progress.turn, step: runtime.progress.step } })
      const result = batch.results[0].result
      return { result, callId, text: result.error?.message ?? result.content.map(block => block.text ?? '').join('\n') }
    },
    async check(commit) {
      return await checkTool.execute({ commit }, { callId: `check-${++calls}`, signal: new AbortController().signal, agent: runtime.agent, deferContext: () => {}, concludeTurn: () => {} }) as Record<string, unknown>
    },
    advances: () => readAdvances(execDir),
    node: load,
    async comments(id) {
      return (await load(id)).history.flatMap(entry => entry.op === 'comment' && entry.text !== undefined ? [entry.text] : [])
    },
    taskBranch(files) {
      const commit = repo.commitOn('hz/task-1', files, `task-1: the change\n\n${TRAILER}`)
      const worktree = join(repo.root, '.worktrees', 'hz-task-1')
      execFileSync('git', ['worktree', 'add', '--quiet', worktree, 'hz/task-1'], { cwd: repo.root, stdio: 'ignore' })
      return { commit, worktree }
    },
    async dispatched(depth, head) {
      const childId = 'hz-task-1-a1-aaaaaa'
      const dispatch = renderDispatchComment({ attempt: 1, childId, provider: 'probe', model: 'probe-model', why: 'one directory', review: { depth: depth === 'skip' ? 'skip' : 'full' }, brief: '000000000000', pins: 'pins: task-1@000000000000' })
      const handback = renderHandbackComment({ attempt: 1, status: 'done', childId, commits: 1, head: head.slice(0, 12), files: 1, questions: 0, assumptions: 0, asked: 0, answered: 0, timeouts: 0, plans: 0, incoming: 0, lessons: 0, problems: [], ...(depth === 'skip' ? {} : { depth }) })
      for (const text of [dispatch, handback]) {
        const written = await engine.apply('harness', { op: 'comment', id: 'task-1', text })
        if (!written.ok) throw new Error('the dispatch fixture comment was refused')
      }
      const current = await engine.load()
      const doing = await engine.apply('harness', { op: 'status', id: 'task-1', rev: current.revisions.get('task-1') ?? '', to: 'doing', reason: `dispatch ${childId}` })
      if (!doing.ok) throw new Error('the doing move was refused')
    },
    dispose() {
      installed.dispose()
      setMetricSink(previous)
      repo.dispose()
    },
  }
}

/** One case on a fresh rig, disposed whatever the case did. */
export async function withTrunkRig(options: Parameters<typeof trunkRig>[0], body: (rig: TrunkRig) => Promise<void>): Promise<void> {
  const rig = await trunkRig(options)
  try {
    await body(rig)
  }
  finally {
    rig.dispose()
  }
}

/** The `execute.advance` metric events. */
export const advanceEvents = (metrics: readonly MetricEvent[]): Extract<MetricEvent, { event: 'execute.advance' }>[] =>
  metrics.flatMap(event => event.event === 'execute.advance' ? [event] : [])

/** The evidence of the newest `done` status entry of a node. */
export function doneEvidence(node: GraphNode): readonly { readonly kind: string, readonly ref: string, readonly exit?: number, readonly note?: string }[] {
  return node.history.filter(entry => entry.op === 'status' && entry.to === 'done').at(-1)?.evidence ?? []
}
