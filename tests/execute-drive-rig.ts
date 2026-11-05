/**
 * The rig of the drive specs (src/execute/drive.ts): a project in a temp git
 * repository with a staged graph, the holder record naming `main-1`, the
 * fake rc.3 agents and goals (tests/fake-rc3.ts) whose `goal/changed` goes
 * to the drive, a board-less loop link so the drive's events run in the
 * fallback executor the way they do without the loop board, an injected
 * clock and timers, and the services the drive reads (focus, peak hold,
 * open requests, session documents) as values a case sets.
 */
import { join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import { claimHolder, holderFileOf, replaceHolder } from '../src/graph/main-agent-holder.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { REQUESTS_SERVICE } from '../src/guard/request-service.ts'
import { createGraphCache } from '../src/execute/dispatch.ts'
import { createDrive, type Drive } from '../src/execute/drive.ts'
import { readDrive, type DriveLine } from '../src/execute/drive-log.ts'
import type { Attempt } from '../src/execute/attempts.ts'
import type { Settlement } from '../src/execute/handback.ts'
import { createGit } from '../src/execute/git.ts'
import { createLoopLink, type LoopEmit, type LoopLink } from '../src/execute/loop-link.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import type { AgentLike, ServiceLookup, SessionEventDocumentLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { PEAK_MODE_SERVICE, type PeakHold, type PeakModeService } from '../src/shared/peak-mode.ts'
import { fakeLive, type FakeLive } from './fake-rc3.ts'
import { GOAL, TASK, stageNodes, testRepo, type TestRepo } from './execute-repo.ts'
import { until } from './panel-helpers.ts'

/** A root agent of the project, the way the agent loop hands one to the hooks. */
function rootAgent(id: string, cwd: string): AgentLike {
  return { id, ctx: {} as never, session: { id, header: { id, cwd }, deriveMessages: () => [] } }
}

/** A goal round message as the round driver queues it (goal-round-driver:144–151). */
const GOAL_ROUND = { source: { kind: 'goal' } }

export interface DriveRig {
  readonly repo: TestRepo
  readonly live: FakeLive
  readonly link: LoopLink
  drive: Drive
  readonly emitted: LoopEmit[]
  readonly metrics: MetricEvent[]
  readonly reports: string[]
  /** The node the holder's session has in focus. */
  focus: string | undefined
  /** What the peak service holds back now. */
  hold: PeakHold | undefined
  /** The guard row's open requests of the holder. */
  requests: { readonly ref: string, readonly askedAt: string, readonly target: string }[]
  /** The documents of the holder session (user messages for the restart pause). */
  documents: SessionEventDocumentLike[]
  /** Whether the loop board took the hand-over (for the peak takeover note). */
  boardAttached: boolean
  /** The `hournessHandback` view of a session as `sessionQuery.observeSession` gives it; a session not listed is not found. */
  readonly projections: Map<string, unknown>
  /** The handbacks the reconcile handed to the processing. */
  readonly handbacks: { readonly attempt: Attempt, readonly settlement: Settlement }[]
  /** What the reconcile's trunk step reports (default: nothing written). */
  reconcileTrunk: (project: string, sessionId: string | undefined) => Promise<number>
  readonly now: () => Date
  advance(ms: number): void
  /** Run the timers that are due. */
  fire(): void
  /** The holder agent of a session (registered live). */
  agent(id?: string): AgentLike
  /** Add a root agent of the project and register it live. */
  addAgent(id: string): AgentLike
  /** Make `id` the project's holder. */
  setHolder(id: string): void
  /** One holder step, then wait for what the fallback started. */
  step(id?: string, messages?: readonly unknown[]): Promise<void>
  /** A step that admits a goal round message. */
  round(id?: string): Promise<void>
  graph(): Promise<LoadedGraph>
  node(id: string): Promise<GraphNode>
  comments(id: string): Promise<string[]>
  lines(): Promise<DriveLine[]>
  /** A fresh drive over the same project, as after a host restart (the old one is disposed). */
  restart(): void
  /** The fallback's work and the goal/changed writes settle. */
  settle(): Promise<void>
  dispose(): void
}

export async function driveRig(options: {
  readonly nodes?: readonly Readonly<Record<string, unknown>>[]
  /** Put `execute.reconcile` in the loop link's action table, so the holder's `hourness.host-started` runs it in the fallback as the row does. */
  readonly reconcile?: boolean
  /** Process a reconciled handback; default: record it only. */
  readonly handback?: (attempt: Attempt, settlement: Settlement) => Promise<void>
} = {}): Promise<DriveRig> {
  const repo = testRepo()
  // A goal or module staged at release is staged in design and released by the person's write, the way record_human_answer does: that write's time is the release (releaseAtOf).
  const nodes = options.nodes ?? [GOAL, TASK]
  const released = nodes.filter(node => (node.type === 'goal' || node.type === 'feature') && node.stage === 'release').map(node => String(node.id))
  await stageNodes(repo.graphDir, nodes.map(node => released.includes(String(node.id)) ? { ...node, stage: 'design' } : node))
  const engine = openEngine(repo.graphDir)
  for (const id of released) {
    const current = await engine.load()
    const written = await engine.apply('human', { op: 'edit', id, rev: current.revisions.get(id) ?? '', set: { stage: 'release' }, reason: '人在对话里同意（test）' })
    if (!written.ok) throw new Error(`releasing ${id} failed: ${JSON.stringify(written.error)}`)
  }
  const home = join(repo.root, 'dsh-home')
  let holder = 'main-1'
  claimHolder(holderFileOf(home, repo.graphDir), { version: 1, sessionId: holder, graphDir: repo.graphDir, since: '2026-11-04T08:00:00.000Z', commandId: 'cmd-1' })
  const live = fakeLive()
  const agents = new Map<string, AgentLike>()
  const metrics: MetricEvent[] = []
  const previous = setMetricSink(event => { metrics.push(event) })
  const reports: string[] = []
  const emitted: LoopEmit[] = []
  // The clock runs with real time (the engine's own writes use it) plus what a case advances.
  let offset = 0
  const clock = (): number => Date.now() + offset
  let pending: { run: () => void, at: number }[] = []
  const delay = (run: () => void, ms: number): (() => void) => {
    const timer = { run, at: clock() + ms }
    pending.push(timer)
    return () => { pending = pending.filter(item => item !== timer) }
  }
  const requestsDesk = {
    outsideDenial: () => undefined,
    peekGrant: () => false,
    openRequests: () => rig.requests,
  }
  const peak: PeakModeService = {
    stateFor: () => rig.hold === undefined ? undefined : { level: rig.hold.level, origin: 'human', peak: true, until: rig.hold.until, glmWorkerCap: 1 },
    stateForProject: () => undefined,
    peakHoldFor: () => rig.hold,
  }
  const services: Record<string, unknown> = {
    agents: live.agents,
    goals: live.goals,
    glmHournessData: { userHome: home },
    glmHournessGraph: { dirFor: () => repo.graphDir, isGraphTool: () => false, focusOf: () => rig.focus },
    sessionQuery: {
      filterEvents: () => Promise.resolve(rig.documents),
      // rc.3: an async lease whose projections carry the registered views; a session it cannot find rejects (session-query:1064, 545).
      observeSession: (id: string) => rig.projections.has(id)
        ? Promise.resolve({ projections: { values: { hournessHandback: rig.projections.get(id) } }, [Symbol.dispose]: () => {} })
        : Promise.reject(new Error(`session "${id}" not found`)),
    },
    [REQUESTS_SERVICE]: requestsDesk,
    [PEAK_MODE_SERVICE]: peak,
  }
  const lookup: ServiceLookup = { get: (name: string) => services[name] }
  const cache = createGraphCache(() => {})
  const execDir = (root: string): string => join(root, '.llm', 'execute')
  const link = createLoopLink({
    lookup,
    execDir,
    graphDirOfRoot: () => repo.graphDir,
    cache,
    report: (_session, _state, reason) => { reports.push(reason) },
    actions: {
      'execute.start-drive': record => rig.drive.startDrive(record),
      'execute.resume-drive': record => rig.drive.resumeDrive(record),
      ...(options.reconcile === true ? { 'execute.reconcile': (record: Parameters<Drive['reconcile']>[0]) => rig.drive.reconcile(record) } : {}),
    },
    notesChanged: () => {},
    now: () => new Date(clock()),
    delay,
  })
  const makeDrive = (): Drive => createDrive({
    lookup,
    cache,
    graphDirOf: () => repo.graphDir,
    graphDirOfRoot: () => repo.graphDir,
    execDir,
    git: createGit(),
    isMain: agent => agent.id === holder,
    report: (_session, _state, reason) => { reports.push(reason) },
    emit: (project, sessionId, event) => {
      emitted.push(event)
      link.emit(project, sessionId, event)
    },
    journal: () => {},
    boardAttached: () => rig.boardAttached,
    runningChecks: () => [],
    notesChanged: () => {},
    handback: (attempt, settlement) => {
      rig.handbacks.push({ attempt, settlement })
      return options.handback?.(attempt, settlement) ?? Promise.resolve()
    },
    reconcileTrunk: (project, sessionId) => rig.reconcileTrunk(project, sessionId),
    replayInterrupted: project => link.replayInterrupted(project),
    now: () => new Date(clock()),
    delay,
  })
  const changes: Promise<void>[] = []
  live.onChanged((payload) => { changes.push(rig.drive.onGoalChanged(payload)) })
  const addAgent = (id: string): AgentLike => {
    const agent = rootAgent(id, repo.root)
    agents.set(id, agent)
    live.add(agent)
    return agent
  }
  addAgent('main-1')
  const settle = async (): Promise<void> => {
    await new Promise(resolve => { setTimeout(resolve, 150) })
    await Promise.all(changes.splice(0))
  }
  const rig: DriveRig = {
    repo,
    live,
    link,
    drive: makeDrive(),
    emitted,
    metrics,
    reports,
    focus: 'goal-1',
    hold: undefined,
    requests: [],
    documents: [],
    boardAttached: false,
    projections: new Map(),
    handbacks: [],
    reconcileTrunk: () => Promise.resolve(0),
    now: () => new Date(clock()),
    advance: (ms) => { offset += ms },
    fire: () => {
      const at = clock()
      const due = pending.filter(item => item.at <= at)
      pending = pending.filter(item => item.at > at)
      for (const item of due) item.run()
    },
    agent: (id = holder) => {
      const agent = agents.get(id)
      if (agent === undefined) throw new Error(`no agent ${id}`)
      return agent
    },
    addAgent,
    setHolder: (id) => {
      holder = id
      replaceHolder(holderFileOf(home, repo.graphDir), { version: 1, sessionId: id, graphDir: repo.graphDir, since: new Date(clock()).toISOString(), commandId: `cmd-${id}` })
    },
    async step(id = holder, messages = []) {
      await rig.drive.onStep(rig.agent(id), messages)
      await settle()
    },
    round: id => rig.step(id, [GOAL_ROUND]),
    graph: () => openEngine(repo.graphDir).load(),
    async node(id) {
      const found = (await rig.graph()).nodes.get(id)
      if (found === undefined) throw new Error(`no node ${id}`)
      return found
    },
    async comments(id) {
      return (await rig.node(id)).history.flatMap(entry => entry.op === 'comment' && typeof entry.text === 'string' ? [entry.text] : [])
    },
    lines: () => readDrive(execDir(repo.root)),
    restart() {
      rig.drive.dispose()
      rig.drive = makeDrive()
    },
    settle,
    dispose() {
      rig.drive.dispose()
      link.dispose()
      setMetricSink(previous)
      repo.dispose()
    },
  }
  return rig
}

/** A rig whose drive has started on the released goal: the goal stands on `main-1`. */
export async function startedRig(options: Parameters<typeof driveRig>[0] = {}): Promise<DriveRig> {
  const rig = await driveRig(options)
  await rig.step()
  await until(() => rig.live.goalOf('main-1') !== undefined, 'the drive started a goal')
  await rig.settle()
  return rig
}

/** One case on a fresh rig, disposed whatever the case did. */
export async function withRig(make: () => Promise<DriveRig>, body: (rig: DriveRig) => Promise<void>): Promise<void> {
  const rig = await make()
  try {
    await body(rig)
  }
  finally {
    rig.dispose()
  }
}

/** The pre-execute chain of `update_goal complete` through the completion gate, then the goal service when it allows. */
export async function completeGoal(rig: DriveRig, callId = 'call-complete'): Promise<{ readonly kind: string, readonly reason?: string }> {
  const agent = rig.agent()
  const goal = rig.live.goalOf(agent.id)
  if (goal === undefined) throw new Error('no goal to complete')
  const decision = await rig.drive.completionGate({ name: 'update_goal', arguments: { goal_id: goal.id, revision: goal.revision, action: 'complete' }, agent, callId }, () => Promise.resolve({ kind: 'allow' }))
  if (decision.kind === 'allow') {
    const liveAgent = rig.live.agents.get(agent.id)
    if (liveAgent === undefined) throw new Error('the holder is not live')
    rig.live.goals.complete(liveAgent, { id: goal.id, revision: goal.revision })
    await rig.settle()
  }
  return decision.kind === 'deny' ? { kind: 'deny', reason: decision.reason } : { kind: decision.kind }
}

/** A successful tool result whose text is the JSON of `value`. */
export function resultOf(value: unknown): ToolFinalResult {
  return { isError: false, value, content: [{ type: 'text', text: JSON.stringify(value) }] }
}

/** Run one engine write as `actor` (with the node's current revision unless it is a comment), failing the case when it is refused. */
export async function graphWrite(rig: DriveRig, actor: 'human' | 'llm' | 'harness', mutation: Record<string, unknown>): Promise<void> {
  const engine = openEngine(rig.repo.graphDir)
  const current = await engine.load()
  const id = typeof mutation.id === 'string' ? mutation.id : ''
  const rev = mutation.op === 'comment' || id === '' ? {} : { rev: current.revisions.get(id) }
  const written = await engine.apply(actor, { ...rev, ...mutation })
  if (!written.ok) throw new Error(`the fixture write failed: ${JSON.stringify(written.error)}`)
}

/** The human moves a goal or module to a stage. */
export const setStage = (rig: DriveRig, id: string, stage: string): Promise<void> => graphWrite(rig, 'human', { op: 'edit', id, set: { stage }, reason: `test: ${id} to ${stage}` })

/** The live agent of a session in the rig. */
export function liveOf(rig: DriveRig, id = 'main-1'): Parameters<FakeLive['goals']['get']>[0] {
  const found = rig.live.agents.get(id)
  if (found === undefined) throw new Error(`${id} is not live`)
  return found
}

/** The current goal of a session, or a failure. */
export function goalNow(rig: DriveRig, id = 'main-1'): NonNullable<ReturnType<FakeLive['goalOf']>> {
  const goal = rig.live.goalOf(id)
  if (goal === undefined) throw new Error(`${id} has no goal`)
  return goal
}
