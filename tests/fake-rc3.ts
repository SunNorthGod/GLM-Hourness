/**
 * Test double of the installed 0.2.2-rc.1 runtime surface the rows touch
 * (docs/DESIGN.md §2.4a, face-migration design 0.1). It offers only what the
 * desktop runtime offers: scoped `tools.register(definition)` (rejecting
 * output schemas outside the enforced subset), `tools.get(name, scope)`,
 * `tools.schemas(scope)` (the registry view the wire-face projection reads),
 * `tools.execute(input)` (gated by `tools/pre-execute`, validating success
 * values against the output schema, ending in `tools/post-execute`), the
 * agent-scoped waterfalls, the session's derived history, and cordis `get` /
 * `provide`. The `agent/pre-step` payload carries the step's model
 * selection. The assemble payload carries no tool face, the way the
 * installed 0.2.2-rc.1 runtime composes it; the request face is the wire
 * face over the collected face (`schemas`). The route reaches plugins
 * through the assembly variables and the pre-step payload, exactly as
 * installModelSelection injects them.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentRequestErrorPayload, AgentRequestPayload, AgentLike, AssemblePayload, AssembledTool, InjectHost, InjectableServices, LlmStreamListener, LlmStreamOptions, PluginContext, PostExecuteDecision, PostExecuteListener, PostExecutePayload, PreExecuteDecision, PreExecuteListener, PreStepDecision, PreStepPayload, ProvideHost, ScheduleCatalogEntry, ScheduleRecordLike, ScheduleSelector, ScheduleService, ScheduleUpdateResult, ServiceLookup, SessionEventLike, SessionLike, ToolDefinitionLike, ToolExecuteInput, ToolFinalResult, UserNotice, UserQuestionsAnswer, UserQuestionsListener, UserQuestionsRequest, WorkspaceRegistryService } from '../src/shared/dsh-min.ts'
import type { StreamChunk } from '../src/shared/lm-min.ts'

type Listener = (...args: never[]) => unknown

type ServiceName = keyof InjectableServices

/**
 * cordis `ctx.inject` over a service table (cordis:1600; the callback's
 * returned function is its fiber's disposer, cordis:1071, 1142–1143): a
 * callback runs once every service it names is present, at the call or
 * when `provide` adds the last one, and its disposer runs when `remove`
 * takes one of them away. `base` is the context the child fiber inherits
 * (the host's `provide` and `get`), which a row that provides a service of
 * its own inside the callback needs.
 */
export function fakeInjector(initial: Partial<InjectableServices> = {}, base: object = {}): {
  /** A function property, so a test hands it on as the row's `ctx.inject`. */
  readonly inject: InjectHost['inject']
  provide<K extends ServiceName>(name: K, value: InjectableServices[K]): void
  remove(name: ServiceName): void
} {
  const services: Partial<Record<ServiceName, unknown>> = { ...initial }
  const fibers: Array<{ readonly names: readonly ServiceName[], readonly callback: (ctx: never) => (() => void) | void, dispose: (() => void) | undefined, running: boolean }> = []
  const settle = (): void => {
    for (const fiber of fibers) {
      const ready = fiber.names.every(name => services[name] !== undefined)
      if (ready && !fiber.running) {
        fiber.running = true
        // A cordis child fiber's context is the parent's with the named services on it: `provide` and `get` are there too.
        const dispose = fiber.callback({ ...base, ...services } as never)
        fiber.dispose = typeof dispose === 'function' ? dispose : undefined
      }
      else if (!ready && fiber.running) {
        fiber.running = false
        fiber.dispose?.()
        fiber.dispose = undefined
      }
    }
  }
  return {
    inject: (names, callback) => {
      fibers.push({ names, callback, dispose: undefined, running: false })
      settle()
      return undefined
    },
    provide: (name, value) => {
      services[name] = value
      settle()
    },
    remove: (name) => {
      delete services[name]
      settle()
    },
  }
}

/**
 * A cordis service store as far as the rows use it (rc.3 cordis
 * lib/index.js:763 `get`, :800 `provide`): `get` reads undefined until a
 * fiber provides the name, a second provider of the same name throws, and
 * the disposer unregisters.
 */
export function serviceStore(): ServiceLookup & ProvideHost & { readonly services: Map<string, unknown>, get(name: string): unknown } {
  const services = new Map<string, unknown>()
  return {
    services,
    get: (name: string) => services.get(name),
    provide: (name: string, value: unknown) => {
      if (services.has(name)) throw new Error(`service "${name}" has been registered`)
      services.set(name, value)
      return () => { services.delete(name) }
    },
  }
}

/** A message put in front of a live agent: the way it was sent, and the kind and text of the notice. */
interface Woken {
  readonly agentId: string
  readonly how: 'steer' | 'inject' | 'followup'
  readonly kind: string
  readonly text: string
}

/** A live agent as the `agents` registry hands it out (agent-loop:790–821): a status, and three ways to put a message in front of it. */
interface FakeLiveAgent {
  readonly id: string
  readonly session: SessionLike
  readonly status: 'idle' | 'running'
  steer(message: UserNotice): void
  inject(message: UserNotice): void
  followup(message: UserNotice): void
  cancel(): void
}

/** What rc.3 throws for a goal operation it refuses (dsh-goal `GoalError`: `GOAL_AGENT_NOT_LIVE`, `GOAL_STALE_REVISION`, `GOAL_INVALID_TRANSITION`, `GOAL_NOT_FOUND`). */
class GoalError extends Error {
  readonly code: string
  constructor(message: string, code = 'GOAL_AGENT_NOT_LIVE') {
    super(message)
    this.code = code
  }
}

/**
 * A goal as `goals.get` returns it, as far as the rows read it: its identity,
 * the revision that every change raises by one, the phase with why a blocked
 * one is blocked (dsh-goal `GoalBlockReason`), the objective, the round
 * budget, and the process-local activation (goal:880–888).
 */
interface FakeGoal {
  readonly id: string
  readonly revision: number
  readonly phase: string
  readonly blockedReason?: { readonly code: string, readonly message: string }
  readonly objective: string
  readonly maxGoalRounds: number
  readonly roundsStarted: number
  readonly activation: 'armed' | 'disarmed'
}

/** What a row asked of the goal service, in order, with the reference it gave (none for `create`). */
interface GoalCall {
  readonly op: 'pause' | 'resume' | 'create' | 'edit' | 'complete' | 'block' | 'clear'
  readonly agentId: string
  readonly ref: { readonly id: string, readonly revision: number }
}

/** What `goal/changed` carries (goal:872–877), with the live agent fused in (goal-round-driver:243). */
interface FakeGoalChanged {
  readonly agent: FakeLiveAgent
  readonly change: { readonly operation: string, readonly ref: { readonly id: string, readonly revision: number }, readonly goal?: FakeGoal }
}

/**
 * The live-agent registry and the goal service of rc.3 as far as the rows
 * read them: `agents.get(id)` is the live agent of a session and undefined
 * once the agent is released, `agents.list()` all live agents; `goals.get`
 * is the goal view of a live agent and `goals.pause` / `goals.resume` change
 * it by one revision, all three throwing `GoalError` for an agent that is not
 * live (dsh-goal `assertLive`, goal:611–614) and the two changes for a stale
 * reference (`expectCurrent`, goal:760–765) or a phase they do not take
 * (goal:676–699). The execute row's drive uses the rest of the life cycle:
 * `create` arms a new goal and refuses while an unfinished one stands
 * (`GOAL_ALREADY_EXISTS`, goal:635–650), `edit` changes the objective or the
 * round budget, `complete` takes an active, paused or blocked goal to
 * `complete`, `block` an active one to `blocked` with a lowercase-hyphen code
 * and a trimmed non-empty message (goal:76–83, 472–480), and `clear` removes
 * it (goal:736–753). `create` and `resume` arm the goal, `pause`, `block` and
 * `complete` disarm it, and `disarm(id)` stands for `agent/created`
 * (goal:594–596); `resume` refuses an active armed goal and an exhausted
 * round budget (goal:696–697). Every change goes to the `onChanged`
 * listeners as `goal/changed` with the agent fused in. Every message put in
 * front of an agent is recorded in `woken`, every goal operation in
 * `goalCalls`, and both in `log` in the order they happened.
 */
export interface FakeLive {
  readonly agents: { get(id: string): FakeLiveAgent | undefined, list(): FakeLiveAgent[] }
  readonly goals: {
    get(agent: FakeLiveAgent): FakeGoal | undefined
    create(agent: FakeLiveAgent, request: { readonly objective: string, readonly maxGoalRounds?: number }): FakeGoal
    edit(agent: FakeLiveAgent, ref: GoalCall['ref'], change: { readonly objective?: string, readonly maxGoalRounds?: number }): FakeGoal
    pause(agent: FakeLiveAgent, ref: GoalCall['ref']): FakeGoal
    resume(agent: FakeLiveAgent, ref: GoalCall['ref']): FakeGoal
    complete(agent: FakeLiveAgent, ref: GoalCall['ref']): FakeGoal
    block(agent: FakeLiveAgent, ref: GoalCall['ref'], reason: { readonly code: string, readonly message: string }): FakeGoal
    clear(agent: FakeLiveAgent, ref: GoalCall['ref']): void
  }
  readonly woken: Woken[]
  /** The goal operations the rows asked for, whether or not they worked. */
  readonly goalCalls: GoalCall[]
  /** `goal:<op>` and `wake:<way>` in the order they happened. */
  readonly log: string[]
  /** Listen to every goal change, as a host-level `goal/changed` listener would. */
  onChanged(listener: (payload: FakeGoalChanged) => void): void
  /** The process-local activation edge of `agent/created`: the goal stays as it is and is disarmed. */
  disarm(id: string): void
  /** The goal rounds the driver started so far; `resume` refuses once they reach the budget. */
  setRounds(id: string, started: number): void
  /** Register the live agent of a session. */
  add(agent: AgentLike, status?: 'idle' | 'running'): void
  /** The agent is released: the registry no longer knows it. */
  release(id: string): void
  setStatus(id: string, status: 'idle' | 'running'): void
  /** Give the agent's goal this phase, as a person's change would: a new goal is revision 1, an existing one goes up by one revision; none when undefined. `blocked` is the reason a blocked phase carries. */
  setGoal(id: string, phase: string | undefined, blocked?: { readonly code: string, readonly message: string }): void
  /** The agent's goal now. */
  goalOf(id: string): FakeGoal | undefined
  /** Make the ways named (all three when none are) throw for the agent. */
  breakWake(id: string, ...ways: Array<Woken['how']>): void
  /** Make `goals.get` throw for the agent, as it does for one that is not live. */
  breakGoals(id: string): void
  /** Make the next goal operation `op` for the agent throw with this message (every one after it too). */
  breakGoalChange(id: string, op: GoalCall['op'], message?: string, code?: string): void
}

export function fakeLive(): FakeLive {
  const entries = new Map<string, { live: FakeLiveAgent, status: 'idle' | 'running', goal: FakeGoal | undefined, broken: ReadonlySet<Woken['how']>, goalsBroken: boolean, changeBroken: Map<GoalCall['op'], { message: string, code: string }> }>()
  const woken: Woken[] = []
  const goalCalls: GoalCall[] = []
  const log: string[] = []
  const changed: Array<(payload: FakeGoalChanged) => void> = []
  const WAYS = ['steer', 'inject', 'followup'] as const
  const CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
  const liveEntry = (agent: FakeLiveAgent) => {
    const entry = entries.get(agent.id)
    if (entry?.live !== agent || entry.goalsBroken) throw new GoalError(`agent "${agent.id}" is not live in this registry`)
    return entry
  }
  const notify = (agent: FakeLiveAgent, operation: string, ref: GoalCall['ref'], goal: FakeGoal | undefined): void => {
    for (const listener of [...changed]) listener({ agent, change: { operation, ref: { ...ref }, ...(goal === undefined ? {} : { goal }) } })
  }
  /** One recorded call on a live agent's current goal at the reference given. */
  const current = (op: GoalCall['op'], agent: FakeLiveAgent, ref: GoalCall['ref']) => {
    goalCalls.push({ op, agentId: agent.id, ref: { ...ref } })
    log.push(`goal:${op}`)
    const entry = liveEntry(agent)
    const broken = entry.changeBroken.get(op)
    if (broken !== undefined) throw new GoalError(broken.message, broken.code)
    const goal = entry.goal
    if (goal === undefined) throw new GoalError('no current goal', 'GOAL_NOT_FOUND')
    if (ref.id !== goal.id || ref.revision !== goal.revision) throw new GoalError(`stale goal ref "${ref.id}" revision ${ref.revision}; current is "${goal.id}" revision ${goal.revision}`, 'GOAL_STALE_REVISION')
    return { entry, goal }
  }
  const commit = (entry: { goal: FakeGoal | undefined, live: FakeLiveAgent }, operation: string, goal: FakeGoal): FakeGoal => {
    entry.goal = goal
    notify(entry.live, operation, { id: goal.id, revision: goal.revision }, goal)
    return goal
  }
  const next = (goal: FakeGoal, phase: string, activation: FakeGoal['activation']): FakeGoal => ({ id: goal.id, revision: goal.revision + 1, phase, objective: goal.objective, maxGoalRounds: goal.maxGoalRounds, roundsStarted: goal.roundsStarted, activation })
  const transition = (op: 'pause' | 'complete', allowed: readonly string[], phase: string) => (agent: FakeLiveAgent, ref: GoalCall['ref']): FakeGoal => {
    const { entry, goal } = current(op, agent, ref)
    if (!allowed.includes(goal.phase)) throw new GoalError(`cannot ${op} goal "${goal.id}" from phase "${goal.phase}"`, 'GOAL_INVALID_TRANSITION')
    return commit(entry, op, next(goal, phase, 'disarmed'))
  }
  let created = 0
  return {
    woken,
    goalCalls,
    log,
    agents: { get: id => entries.get(id)?.live, list: () => [...entries.values()].map(entry => entry.live) },
    goals: {
      get: agent => liveEntry(agent).goal,
      create(agent, request) {
        goalCalls.push({ op: 'create', agentId: agent.id, ref: { id: '', revision: 0 } })
        log.push('goal:create')
        const entry = liveEntry(agent)
        const broken = entry.changeBroken.get('create')
        if (broken !== undefined) throw new GoalError(broken.message, broken.code)
        if (typeof request.objective !== 'string' || request.objective.trim() === '') throw new GoalError('goal objective must be a non-empty string', 'GOAL_INVALID_OBJECTIVE')
        const standing = entry.goal
        if (standing !== undefined && standing.phase !== 'complete') throw new GoalError(`goal "${standing.id}" already exists with phase "${standing.phase}"`, 'GOAL_ALREADY_EXISTS')
        return commit(entry, 'create', { id: `goal-${agent.id}-${++created}`, revision: 1, phase: 'active', objective: request.objective.trim(), maxGoalRounds: request.maxGoalRounds ?? 256, roundsStarted: 0, activation: 'armed' })
      },
      edit(agent, ref, change) {
        const { entry, goal } = current('edit', agent, ref)
        if (change.objective === undefined && change.maxGoalRounds === undefined) throw new GoalError('goal edit requires objective and/or maxGoalRounds', 'GOAL_INVALID_EDIT')
        return commit(entry, 'edit', { ...goal, revision: goal.revision + 1, ...(change.objective === undefined ? {} : { objective: change.objective.trim() }), ...(change.maxGoalRounds === undefined ? {} : { maxGoalRounds: change.maxGoalRounds }) })
      },
      pause: transition('pause', ['active'], 'paused'),
      resume(agent, ref) {
        const { entry, goal } = current('resume', agent, ref)
        if (!['active', 'paused', 'blocked'].includes(goal.phase)) throw new GoalError(`cannot resume goal "${goal.id}" from phase "${goal.phase}"`, 'GOAL_INVALID_TRANSITION')
        if (goal.phase === 'active' && goal.activation === 'armed') throw new GoalError(`goal "${goal.id}" is already active and armed`, 'GOAL_INVALID_TRANSITION')
        if (goal.roundsStarted >= goal.maxGoalRounds) throw new GoalError(`goal "${goal.id}" exhausted ${goal.maxGoalRounds} goal rounds; increase maxGoalRounds before resuming`, 'GOAL_INVALID_TRANSITION')
        return commit(entry, 'resume', next(goal, 'active', 'armed'))
      },
      complete: transition('complete', ['active', 'paused', 'blocked'], 'complete'),
      block(agent, ref, reason) {
        const { entry, goal } = current('block', agent, ref)
        if (goal.phase !== 'active') throw new GoalError(`cannot block goal "${goal.id}" from phase "${goal.phase}"`, 'GOAL_INVALID_TRANSITION')
        if (!CODE.test(reason.code) || reason.message.trim() === '') throw new GoalError('goal block reason requires a lower-kebab-case code and a non-empty message', 'GOAL_INVALID_BLOCK_REASON')
        return commit(entry, 'block', { ...next(goal, 'blocked', 'disarmed'), blockedReason: { code: reason.code, message: reason.message.trim() } })
      },
      clear(agent, ref) {
        const { entry, goal } = current('clear', agent, ref)
        entry.goal = undefined
        notify(agent, 'clear', { id: goal.id, revision: goal.revision + 1 }, undefined)
      },
    },
    onChanged(listener) { changed.push(listener) },
    disarm(id) {
      const entry = entries.get(id)
      if (entry?.goal !== undefined) entry.goal = { ...entry.goal, activation: 'disarmed' }
    },
    setRounds(id, started) {
      const entry = entries.get(id)
      if (entry?.goal !== undefined) entry.goal = { ...entry.goal, roundsStarted: started }
    },
    add(agent, status = 'idle') {
      const session = agent.session!
      const send = (how: Woken['how']) => (message: UserNotice): void => {
        if (entries.get(agent.id)?.broken.has(how) === true) throw new Error(`${how} failed for ${agent.id}`)
        woken.push({ agentId: agent.id, how, kind: String(message.source.kind), text: message.content.map(part => part.text).join('') })
        log.push(`wake:${how}`)
      }
      const live: FakeLiveAgent = {
        id: agent.id,
        session,
        get status() { return entries.get(agent.id)?.status ?? 'idle' },
        steer: send('steer'),
        inject: send('inject'),
        followup: send('followup'),
        cancel() {},
      }
      entries.set(agent.id, { live, status, goal: undefined, broken: new Set(), goalsBroken: false, changeBroken: new Map() })
    },
    release: id => void entries.delete(id),
    setStatus(id, status) { const entry = entries.get(id); if (entry !== undefined) entry.status = status },
    setGoal(id, phase, blocked) {
      const entry = entries.get(id)
      if (entry === undefined) return
      const before = entry.goal
      entry.goal = phase === undefined
        ? undefined
        : {
            id: before?.id ?? `goal-${id}`,
            revision: (before?.revision ?? 0) + 1,
            phase,
            objective: before?.objective ?? `goal of ${id}`,
            maxGoalRounds: before?.maxGoalRounds ?? 256,
            roundsStarted: before?.roundsStarted ?? 0,
            activation: phase === 'active' ? 'armed' : 'disarmed',
            ...(blocked === undefined || phase !== 'blocked' ? {} : { blockedReason: blocked }),
          }
      // The person's change reaches the listeners as the operation it stands for.
      const operation = phase === undefined ? 'clear' : phase === 'paused' ? 'pause' : phase === 'blocked' ? 'block' : phase === 'complete' ? 'complete' : before === undefined ? 'create' : 'resume'
      const goal = entry.goal ?? before
      if (goal !== undefined) notify(entry.live, operation, { id: goal.id, revision: entry.goal?.revision ?? goal.revision + 1 }, entry.goal)
    },
    goalOf: id => entries.get(id)?.goal,
    breakWake(id, ...ways) { const entry = entries.get(id); if (entry !== undefined) entry.broken = new Set(ways.length === 0 ? WAYS : ways) },
    breakGoals(id) { const entry = entries.get(id); if (entry !== undefined) entry.goalsBroken = true },
    breakGoalChange(id, op, message = `${op} refused`, code = 'GOAL_INVALID_TRANSITION') { entries.get(id)?.changeBroken.set(op, { message, code }) },
  }
}
/** One call the schedule service took, in order, so a spec can see what the board asked of the host. */
export interface ScheduleCall {
  readonly op: 'create' | 'list' | 'catalog' | 'delete' | 'update'
  readonly sessionId?: string
  readonly id?: string
}

/**
 * The host's schedule service as the loop board uses it (rc.3 dsh-schedule),
 * with the refusals that decide what the board may do: a title that is empty
 * or over 120 characters and a request without exactly one selector throw
 * (schedule:93–97, 2083); `update` decodes `expected` by its whole key set, so
 * a row of the catalog, which carries three keys more, is `invalid_rule`
 * (schedule:74–77, 1806–1815, the failure of review F7), and an `expected`
 * that is not the stored record is `schedule_conflict`; a timing change the
 * host normalizes to the stored rule answers `updated: false` without a code
 * (schedule:1824–1829); `delete` takes the row and its deliveries away
 * (schedule:2164–2182); `catalog` carries `sessionId`, `status` and
 * `lastDelivery` and is sorted by due time and then by id (schedule:2129–2136);
 * every write sends `schedule/changed` afterwards (schedule:2231–2237).
 */
export interface FakeSchedule {
  readonly service: ScheduleService
  readonly calls: ScheduleCall[]
  /** The catalog as the host would give it. */
  tasks(): ScheduleCatalogEntry[]
  /** Make a task the way a person does on the DSH task page (and the way a board of an earlier run left one). */
  seed(sessionId: string, record: Partial<ScheduleRecordLike> & Pick<ScheduleRecordLike, 'title' | 'prompt'>): ScheduleCatalogEntry
  /** Change a task the way a person does on the DSH task page: the board's reconciliation finds the fingerprint changed. */
  edit(id: string, over: Partial<ScheduleRecordLike>): void
  /** Deliver one task, as the host's own drive does: a one-shot becomes inactive, a repeating one gets its next due time (schedule:1576–1625). */
  fire(id: string, options?: { readonly messageId?: string, readonly nextAt?: string }): void
  /** Set the due time of a task, so a spec can let one fall due without the host's clock. */
  due(id: string, at: string): void
  /** Make the next call of this kind throw; every later one too. */
  breakOp(op: ScheduleCall['op'], message?: string): void
  /** How many times `schedule/changed` was sent. */
  changed(): number
}

/** The host's workspace registry as the board reads it (rc.3 dsh-workspace): the archive set, the workspaces, and the stop event an archive with `stopActivity` sends. */
export interface FakeWorkspaceRegistry {
  readonly service: WorkspaceRegistryService
  /** Archive a session with `stopActivity`: the set is written first, then the `workspace/session-stop` providers are asked (dsh-workspace:526–541, 621–629). */
  archive(sessionId: string): Promise<void>
  unarchive(sessionId: string): void
  addWorkspace(path: string): void
  /** Make the getter throw, as `requireState` does before the service starts (dsh-workspace:934–937). */
  breakState(message?: string): void
}

/** The schedule service of rc.3, reduced to what the board calls, over a table in memory. */
export function fakeSchedule(options: { readonly now?: () => number, readonly changed?: () => void } = {}): FakeSchedule {
  const now = options.now ?? ((): number => Date.now())
  const rows = new Map<string, { sessionId: string, record: ScheduleRecordLike, status: 'active' | 'inactive', lastDelivery?: { scheduledAt: string, deliveredAt: string, messageId: string } }>()
  const calls: ScheduleCall[] = []
  const broken = new Map<ScheduleCall['op'], string>()
  let changes = 0
  let made = 0
  const iso = (at: number): string => new Date(at).toISOString()
  const check = (op: ScheduleCall['op']): void => {
    const why = broken.get(op)
    if (why !== undefined) throw new Error(why)
  }
  const emit = (): void => {
    changes += 1
    options.changed?.()
  }
  const KEYS: Readonly<Record<string, readonly string[]>> = {
    at: ['id', 'kind', 'title', 'prompt', 'scheduledAt'],
    after: ['id', 'kind', 'title', 'prompt', 'afterSeconds', 'scheduledAt'],
    every: ['id', 'kind', 'title', 'prompt', 'everySeconds', 'scheduledAt'],
    daily: ['id', 'kind', 'title', 'prompt', 'time', 'timeZone', 'scheduledAt'],
    weekly: ['id', 'kind', 'title', 'prompt', 'time', 'timeZone', 'weekdays', 'scheduledAt'],
    cron: ['id', 'kind', 'title', 'prompt', 'expression', 'timeZone', 'scheduledAt'],
  }
  /** The whole-key decoding of the durable boundary: a value with a key more or less is not a record. */
  const decodes = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    const expected = KEYS[String(record.kind)]
    if (expected === undefined) return false
    return expected.every(key => key in record) && Object.keys(record).every(key => expected.includes(key))
  }
  const time = (value: string): string => `${value.length === 5 ? `${value}:00` : value}${value.includes('.') ? '' : '.000'}`
  const zone = (value: string): string => new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  const recordOf = (id: string, request: { readonly title: string, readonly prompt: string } & ScheduleSelector): ScheduleRecordLike => {
    const base = { id, title: request.title.trim(), prompt: request.prompt }
    if ('at' in request) return { ...base, kind: 'at', scheduledAt: iso(Date.parse(request.at)) }
    if ('every_seconds' in request) {
      if (!Number.isSafeInteger(request.every_seconds) || request.every_seconds < 60) throw new Error('everySeconds must be a safe integer of at least 60')
      return { ...base, kind: 'every', everySeconds: request.every_seconds, scheduledAt: iso(now() + request.every_seconds * 1000) }
    }
    if ('daily' in request) return { ...base, kind: 'daily', time: time(request.daily.time), timeZone: zone(request.daily.time_zone), scheduledAt: iso(now() + 3_600_000) }
    if ('weekly' in request) return { ...base, kind: 'weekly', time: time(request.weekly.time), timeZone: zone(request.weekly.time_zone), weekdays: [...request.weekly.weekdays].sort((left, right) => left - right), scheduledAt: iso(now() + 3_600_000) }
    return { ...base, kind: 'cron', expression: request.cron.expression, timeZone: zone(request.cron.time_zone), scheduledAt: iso(now() + 3_600_000) }
  }
  const selectors = ['at', 'after_seconds', 'every_seconds', 'daily', 'weekly', 'cron']
  const catalogOf = (): ScheduleCatalogEntry[] => [...rows.values()]
    .map(row => ({ ...row.record, sessionId: row.sessionId, status: row.status, ...(row.lastDelivery === undefined ? {} : { lastDelivery: row.lastDelivery }) }))
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.id.localeCompare(right.id))
  const service: ScheduleService = {
    create(sessionId, request) {
      calls.push({ op: 'create', sessionId })
      check('create')
      const title = request.title.trim()
      if (title.length === 0) throw new Error('title is required and must be non-empty after trimming.')
      if (title.length > 120) throw new Error('title must be at most 120 characters.')
      if (request.prompt.trim().length === 0) throw new Error('prompt must be non-empty after trimming.')
      if (selectors.filter(key => Object.hasOwn(request, key)).length !== 1) throw new Error('Exactly one reminder selector is required.')
      made += 1
      const id = `schedule-fake-${String(made).padStart(3, '0')}`
      const record = recordOf(id, request)
      rows.set(id, { sessionId, record, status: 'active' })
      emit()
      return Promise.resolve(record)
    },
    list(request) {
      calls.push({ op: 'list', sessionId: request.sessionId })
      check('list')
      return Promise.resolve([...rows.values()].filter(row => row.sessionId === request.sessionId && row.status === 'active').map(row => row.record))
    },
    catalog() {
      calls.push({ op: 'catalog' })
      check('catalog')
      return Promise.resolve(catalogOf())
    },
    delete(request) {
      calls.push({ op: 'delete', sessionId: request.sessionId, id: request.id })
      check('delete')
      const row = rows.get(request.id)
      if (row === undefined || row.sessionId !== request.sessionId) return Promise.resolve({ id: request.id, deleted: false, code: 'schedule_not_found' })
      rows.delete(request.id)
      emit()
      return Promise.resolve({ id: request.id, deleted: true })
    },
    update(request): Promise<ScheduleUpdateResult> {
      calls.push({ op: 'update', sessionId: request.sessionId, id: request.id })
      check('update')
      if (!decodes(request.expected)) return Promise.resolve({ code: 'invalid_rule', message: 'expected must be a complete valid Schedule record.' })
      const row = rows.get(request.id)
      if (row === undefined || row.sessionId !== request.sessionId) return Promise.resolve({ id: request.id, updated: false as const, code: 'schedule_not_found' })
      if (row.status === 'inactive') return Promise.resolve({ id: request.id, updated: false as const, code: 'schedule_ended' })
      if (JSON.stringify(row.record) !== JSON.stringify(request.expected)) return Promise.resolve({ id: request.id, updated: false as const, code: 'schedule_conflict' })
      const changeKind = request.change?.kind
      const timed = request.change === undefined ? row.record : recordOf(request.id, { title: request.title ?? row.record.title, prompt: request.prompt ?? row.record.prompt, ...Object.fromEntries(Object.entries(request.change).filter(([key]) => key !== 'kind')) } as { readonly title: string, readonly prompt: string } & ScheduleSelector)
      const next: ScheduleRecordLike = { ...timed, id: request.id, ...(changeKind === undefined ? {} : {}), title: request.title ?? row.record.title, prompt: request.prompt ?? row.record.prompt }
      // A change the host normalizes to the stored rule writes nothing and is not an error (schedule:1824–1829).
      if (JSON.stringify({ ...next, scheduledAt: row.record.scheduledAt }) === JSON.stringify(row.record)) return Promise.resolve({ id: request.id, updated: false as const, record: row.record })
      rows.set(request.id, { ...row, record: next })
      emit()
      return Promise.resolve({ id: request.id, updated: true as const, record: next })
    },
  }
  return {
    service,
    calls,
    tasks: catalogOf,
    seed(sessionId, record) {
      made += 1
      const id = record.id ?? `schedule-seed-${String(made).padStart(3, '0')}`
      const full: ScheduleRecordLike = { kind: 'daily', time: '09:00:00.000', timeZone: 'Asia/Shanghai', scheduledAt: iso(now() + 3_600_000), ...record, id, title: record.title, prompt: record.prompt }
      rows.set(id, { sessionId, record: full, status: 'active' })
      return { ...full, sessionId, status: 'active' }
    },
    edit(id, over) {
      const row = rows.get(id)
      if (row !== undefined) rows.set(id, { ...row, record: { ...row.record, ...over } })
    },
    fire(id, fired = {}) {
      const row = rows.get(id)
      if (row === undefined) return
      const lastDelivery = { scheduledAt: row.record.scheduledAt, deliveredAt: iso(now()), messageId: fired.messageId ?? `message-${id}-${String(changes)}` }
      const repeating = row.record.kind !== 'at' && row.record.kind !== 'after'
      rows.set(id, {
        ...row,
        record: { ...row.record, scheduledAt: fired.nextAt ?? (repeating ? iso(now() + 86_400_000) : row.record.scheduledAt) },
        status: repeating ? 'active' : 'inactive',
        lastDelivery,
      })
      emit()
    },
    due(id, at) {
      const row = rows.get(id)
      if (row !== undefined) rows.set(id, { ...row, record: { ...row.record, scheduledAt: at } })
    },
    breakOp(op, why = `${op} failed`) { broken.set(op, why) },
    changed: () => changes,
  }
}

/** The workspace registry of rc.3, reduced to the two members the board reads, over a set in memory. */
export function fakeWorkspaceRegistry(options: { readonly stop?: (sessionId: string) => Promise<void> | void } = {}): FakeWorkspaceRegistry {
  const archived = new Set<string>()
  const workspaces: Array<{ readonly path: string }> = []
  let fault: string | undefined
  const requireState = (): void => {
    if (fault !== undefined) throw new Error(fault)
  }
  return {
    service: {
      get archivedSessionIds() {
        requireState()
        return [...archived]
      },
      list() {
        requireState()
        return workspaces
      },
    },
    async archive(sessionId) {
      requireState()
      archived.add(sessionId)
      await options.stop?.(sessionId)
    },
    unarchive(sessionId) {
      requireState()
      archived.delete(sessionId)
    },
    addWorkspace(path) { workspaces.push({ path }) },
    breakState(message = 'workspace registry is not started yet') { fault = message },
  }
}

export interface FakeRuntime {
  /** The context every row receives; cordis contexts also read and provide services. */
  readonly ctx: PluginContext & ServiceLookup & ProvideHost
  /** The services provided through `ctx.provide`. */
  readonly services: Map<string, unknown>
  readonly agent: AgentLike
  /** Natives registered globally, by name. */
  readonly natives: Map<string, ToolDefinitionLike>
  /** Scoped registrations made through the agent context. */
  readonly scoped: ToolDefinitionLike[]
  /** Every `on()` registration, in order. */
  readonly listeners: Array<{ event: string, listener: Listener, options?: { prepend?: boolean } }>
  /** The session's request-visible history (`deriveMessages()` returns a copy). */
  readonly history: unknown[]
  /** Contexts tool bodies attached through `exec.deferContext`. */
  readonly deferred: unknown[]
  /** Every call `tools.execute` received. */
  readonly executed: ToolExecuteInput[]
  /** Run the agent-scoped assemble waterfall with the route the model selection would inject. */
  assemble(route: { provider?: string, model?: string }, sections?: AssemblePayload['sections']): Promise<AssemblePayload>
  /** The registry view the wire-face projection reads (`ctx.tools.schemas(agent)`). */
  schemas(): AssembledTool[]
  /** Fire `agent/created` for the fake agent, or for another agent of the host. */
  create(target?: AgentLike): Promise<void>
  /** Fire `session/disposed` for a session (session:1925–1936): observers run synchronously, as in rc.3. */
  disposeSession(session: SessionLike): void
  /** Append one session log event; the session/event observers run synchronously inside it, as dsh-session's append does (session:1574–1593). */
  sessionEvent(session: SessionLike, type: string, data: unknown): void
  /** The turn and step the `tool/call` events of executed calls carry; a spec moves it as the agent loop advances. */
  readonly progress: { turn: number, step: number }
  /** Run `agent/pre-step` for one step; the runtime's default decision admits the claimed messages. */
  preStep(options?: { messages?: readonly unknown[], step?: number, turn?: number, route?: { provider?: string, model?: string } }): Promise<PreStepDecision>
  /** Run the `agent/request` waterfall for the fake agent (rc.3 agent-loop:1191): the default proposes the route given at `fakeRuntime`. */
  request(turn: number, step: number): Promise<unknown>
  /** Run the `agent/request-error` waterfall (rc.3 agent-loop:1136): the default decides nothing. */
  requestError(turn: number, step: number): Promise<unknown>
  /** Run the `llm/stream` waterfall (rc.3 llm:2393): `inner` is the adapter's stream. */
  stream(options: LlmStreamOptions, inner: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
  /** Fire `session/event` for a session (session:1517–1536): observers run synchronously, as in rc.3. */
  event(session: SessionLike, event: SessionEventLike): void
  /** Run the `user-questions/request` waterfall (user-questions:668): the default is the no-answerer rejection (`NO_PROVIDER`). */
  ask(request: UserQuestionsRequest): Promise<UserQuestionsAnswer>
  /** Execute a visible tool by name the way the runtime resolves calls (scoped shadows global); returns the body's value. */
  execute(name: string, args: unknown): Promise<unknown>
}

function native(name: string, calls: Array<{ name: string, args: unknown }>): ToolDefinitionLike {
  return {
    name,
    description: `native ${name}`,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: name }] },
    execute(args) { calls.push({ name, args }); return Promise.resolve({ ok: name }) },
  }
}

export const NATIVE_NAMES = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'todo_write', 'web_fetch'] as const

/** The batch's argument parse (rc.1 `parseArguments`): the provider's JSON text is parsed, anything else passes through. */
function parseBatchArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as unknown
  }
  catch {
    return raw
  }
}

const SCHEMA_CONSTRAINTS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'])
const SCHEMA_ANNOTATIONS = new Set(['description', 'title', 'default', 'examples'])
const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']
const BESIDE_ONE_OF = ['properties', 'required', 'additionalProperties', 'items', 'enum', 'const']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

function scalarMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    default: return value === null
  }
}

/**
 * Violations of the JSON Schema subset rc.3 enforces on tool output schemas
 * at `tools.register` (dsh-tools `assertSupportedJsonSchema`, tools:323,
 * called at tools:2978): `type` (one string) or `oneOf` (two or more
 * branches), object `properties` / `required` / boolean
 * `additionalProperties`, array `items`, scalar `enum` / `const`, and the
 * annotations description, title, default and examples.
 */
export function schemaViolations(schema: unknown, path = 'schema'): string[] {
  if (!isRecord(schema)) return [`${path} must be a schema object`]
  const out = Object.keys(schema).filter(key => !SCHEMA_CONSTRAINTS.has(key) && !SCHEMA_ANNOTATIONS.has(key)).map(key => `${path}.${key} is not a supported keyword`)
  const has = (key: string): boolean => Object.hasOwn(schema, key)
  if (has('type') && has('oneOf')) return [...out, `${path} cannot declare both type and oneOf`]
  if (has('oneOf')) {
    out.push(...BESIDE_ONE_OF.filter(has).map(key => `${path}.${key} is not supported beside oneOf`))
    const branches = schema.oneOf
    if (!Array.isArray(branches) || branches.length < 2) return [...out, `${path}.oneOf must be an array of at least two schemas`]
    return [...out, ...branches.flatMap((branch, index) => schemaViolations(branch, `${path}.oneOf[${index}]`))]
  }
  if (!has('type')) return [...out, ...BESIDE_ONE_OF.filter(has).map(key => `${path}.${key} requires type or oneOf`)]
  const type = schema.type
  if (typeof type !== 'string' || !SCHEMA_TYPES.includes(type)) return [...out, `${path}.type must be one of ${SCHEMA_TYPES.join('/')}`]
  const placement: Record<string, readonly string[]> = { properties: ['object'], required: ['object'], additionalProperties: ['object'], items: ['array'], enum: SCHEMA_TYPES.slice(2), const: SCHEMA_TYPES.slice(2) }
  out.push(...Object.entries(placement).filter(([key, types]) => has(key) && !types.includes(type)).map(([key]) => `${path}.${key} is not supported on type "${type}"`))
  if (type === 'object') {
    const properties = schema.properties
    if (has('properties') && !isRecord(properties)) out.push(`${path}.properties must be an object of schemas`)
    const declared = isRecord(properties) ? properties : {}
    for (const [key, child] of Object.entries(declared)) out.push(...schemaViolations(child, `${path}.properties.${key}`))
    const required = schema.required
    if (has('required')) {
      if (!isStringArray(required)) out.push(`${path}.required must be an array of strings`)
      else out.push(...required.filter(key => !Object.hasOwn(declared, key)).map(key => `${path}.required names "${key}" which is not in properties`))
    }
    if (has('additionalProperties') && typeof schema.additionalProperties !== 'boolean') out.push(`${path}.additionalProperties must be a boolean`)
  }
  else if (type === 'array') {
    if (has('items')) out.push(...schemaViolations(schema.items, `${path}.items`))
  }
  else {
    const allowed = schema.enum
    if (has('enum') && (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every(entry => scalarMatches(type, entry)))) out.push(`${path}.enum must be a non-empty array of ${type} values`)
    if (has('const') && !scalarMatches(type, schema.const)) out.push(`${path}.const must be a ${type} value`)
  }
  return out
}

/**
 * Violations of a successful tool value against its output schema: rc.3
 * validates every body value before rendering it and turns a mismatch into
 * an error result (dsh-tools `createSuccessResult`, tools:3637–3640).
 */
function valueViolations(schema: Record<string, unknown>, value: unknown, path = 'value'): string[] {
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(branch => valueViolations(branch as Record<string, unknown>, value, path).length === 0).length
    return matches === 1 ? [] : [`"${path}" must match exactly one oneOf branch (matched ${matches})`]
  }
  switch (schema.type) {
    case undefined: return []
    case 'object': {
      if (!isRecord(value)) return [`"${path}" must be an object`]
      const properties = isRecord(schema.properties) ? schema.properties : {}
      const out = ((schema.required ?? []) as string[]).filter(key => value[key] === undefined).map(key => `missing required property "${path}.${key}"`)
      for (const [key, child] of Object.entries(properties)) {
        if (value[key] !== undefined) out.push(...valueViolations(child as Record<string, unknown>, value[key], `${path}.${key}`))
      }
      if (schema.additionalProperties === false) out.push(...Object.keys(value).filter(key => !Object.hasOwn(properties, key)).map(key => `"${path}.${key}" is not a declared property (additionalProperties: false)`))
      return out
    }
    case 'array': {
      if (!Array.isArray(value)) return [`"${path}" must be an array`]
      const items = schema.items as Record<string, unknown> | undefined
      return items === undefined ? [] : value.flatMap((entry, index) => valueViolations(items, entry, `${path}[${index}]`))
    }
    default: {
      if (!scalarMatches(schema.type as string, value)) return [`"${path}" must be a ${String(schema.type)}`]
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`"${path}" must be one of ${JSON.stringify(schema.enum)}`]
      if (Object.hasOwn(schema, 'const') && value !== schema.const) return [`"${path}" must be ${JSON.stringify(schema.const)}`]
      return []
    }
  }
}

/** Execute a tool through the full pipeline (`tools/pre-execute`, body, output check) as `agent` (the runtime's agent unless given). */
export type ExecTool = (name: string, args: unknown, over?: { readonly agent?: AgentLike, readonly parent?: unknown }) => Promise<ToolFinalResult>

/**
 * {@link ExecTool} over a runtime, numbering the calls it makes. `parent` is
 * what the runtime puts on a call a `run_code` program makes from inside
 * another, which a gate has to judge like a direct one. Both boards' fixtures
 * (tests/rules-host.ts, tests/loops-host.ts) drive their gate through this.
 */
export function execTool(runtime: FakeRuntime): ExecTool {
  let counter = 0
  return (name, args, over = {}) => runtime.ctx.tools.execute({
    calls: [{ id: `call-${++counter}`, name, arguments: args }],
    agent: over.agent ?? runtime.agent,
    signal: new AbortController().signal,
    log: { turn: runtime.progress.turn, step: runtime.progress.step },
    ...(over.parent === undefined ? {} : { parent: over.parent }),
  }).then(batch => batch.results[0].result)
}

/**
 * The records of a project's violation journal. A gate does not wait for its
 * writes (as the guard does not), so this waits until the expected number is
 * there, then a moment more for any further one.
 */
export type ReadViolations = (expected?: number) => Promise<Array<Record<string, unknown>>>

/** {@link ReadViolations} over the journal of the project at `root`. */
export function readViolations(root: string): ReadViolations {
  const read = async (): Promise<Array<Record<string, unknown>>> => {
    const text = await readFile(join(root, '.llm', 'audit', 'violations.jsonl'), 'utf8').catch(() => '')
    return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)
  }
  return async (expected = 0) => {
    for (let waited = 0; waited < 3_000 && (await read()).length < expected; waited += 25) await new Promise(resolve => setTimeout(resolve, 25))
    await new Promise(resolve => setTimeout(resolve, 40))
    return read()
  }
}

/**
 * `route` is the call config of the session's request header before any
 * assembly (rc.3 logs the header of every step before the model call);
 * each `assemble` then logs the route it was given, as the agent loop does.
 */
export function fakeRuntime(options: { natives?: readonly string[], calls?: Array<{ name: string, args: unknown }>, cwd?: string, route?: { provider?: string, model?: string } } = {}): FakeRuntime {
  const calls = options.calls ?? []
  let headerRoute = options.route
  const natives = new Map((options.natives ?? NATIVE_NAMES).map(name => [name, native(name, calls)]))
  const scoped: ToolDefinitionLike[] = []
  const listeners: FakeRuntime['listeners'] = []
  const history: unknown[] = []
  const deferred: unknown[] = []
  const executed: ToolExecuteInput[] = []
  let callCounter = 0
  const visible = (): ToolDefinitionLike[] => {
    const byName = new Map(natives)
    for (const tool of scoped) byName.set(tool.name, tool)
    return [...byName.values()]
  }
  const of = (event: string) => listeners.filter(entry => entry.event === event).map(entry => entry.listener)
  const execution = (callId: string, signal: AbortSignal, contexts: unknown[]) => ({
    callId,
    signal,
    deferContext(context: unknown) { contexts.push(context) },
    concludeTurn() {},
  })
  /**
   * ToolRuntime.postExecute (tools:3598–3631): the `tools/post-execute`
   * waterfall defaults to accept. `block` turns the call into an error whose
   * content is the feedback and drops the contexts the body deferred; an
   * accept keeps the result (its content replaced when the decision has
   * one) and appends the decision's contexts to the result's. Replacing the
   * value is not modeled.
   */
  const postExecuted = async (pending: PostExecutePayload, result: ToolFinalResult): Promise<ToolFinalResult> => {
    const decision = await of('tools/post-execute').reduceRight<() => Promise<PostExecuteDecision>>(
      (next, listener) => async () => (listener as unknown as PostExecuteListener)(pending, result, next),
      () => Promise.resolve<PostExecuteDecision>({ kind: 'accept' }),
    )()
    const contexts = decision.additionalContexts ?? []
    if (decision.kind === 'block') {
      const message = decision.feedback.map(block => block.text ?? '').join('\n')
      return { isError: true, content: decision.feedback, error: { message }, ...(contexts.length > 0 ? { additionalContexts: contexts } : {}) }
    }
    if (decision.value !== undefined) throw new Error('fake-rc3 does not model replacing the value in post-execute')
    const additionalContexts = [...result.additionalContexts ?? [], ...contexts]
    return { ...result, ...(decision.content === undefined ? {} : { content: decision.content }), ...(additionalContexts.length > 0 ? { additionalContexts } : {}) }
  }
  const store = serviceStore()
  let seq = 0
  const fireSession = (session: SessionLike | undefined, type: string, data: unknown): void => {
    if (session === undefined) return
    for (const entry of listeners) {
      if (entry.event !== 'session/event') continue
      ;(entry.listener as unknown as (s: SessionLike, e: { readonly type: string, readonly seq: number, readonly time: number, readonly data?: unknown }) => void)(session, { type, seq: ++seq, time: Date.now(), data })
    }
  }
  const progress = { turn: 1, step: 1 }
  const ctx: FakeRuntime['ctx'] = {
    get: store.get,
    provide: store.provide,
    tools: {
      register: definition => {
        const violations = schemaViolations(definition.output.schema)
        if (violations.length > 0) throw new TypeError(`unsupported JSON schema: ${violations.join('; ')}`)
        scoped.push(definition)
        return () => { scoped.splice(scoped.indexOf(definition), 1) }
      },
      get: name => visible().find(tool => tool.name === name),
      // The registry view the wire-face projection reads (rc.1 dsh-tools
      // `schemas`, tools:585–591): model-facing schemas without callbacks,
      // no step admission. The runtime orders its registrations canonically;
      // the fake keeps registration order, which is enough for the name
      // assertions.
      schemas: scope => scope === undefined || scope === agent
        ? visible().map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
        : [],
      // Pipeline order of ToolRuntime.execute per call: pre-execute gate, body,
      // output render, deferred contexts, post-execute. The batch form is the
      // rc.1 contract (dsh-tools `execute`: `{calls, agent, signal, log?}`);
      // the batch `arguments` the provider sent as JSON text is parsed, an
      // object passes through (executeToolBatch `parseArguments`).
      async execute(input) {
        const results: Array<{ callId: string, result: ToolFinalResult }> = []
        const contexts: unknown[] = []
        let concluded = false
        for (const block of input.calls) {
          const callId = block.id
          const parsed: unknown = parseBatchArguments(block.arguments)
          const callSignal = input.signal ?? new AbortController().signal
          executed.push({ callId, name: block.name, arguments: parsed, ...(input.agent === undefined ? {} : { agent: input.agent }), ...(input.parent === undefined ? {} : { parent: input.parent }), signal: callSignal })
          // startCall appends the durable call before prepare (agent-loop:578–582), so the model's call is in
          // the log when the pre-execute waterfall runs. A call a body issues — a run_code program's, or a
          // DeferredToolCall's target, `<callId>:deferred` (toolsearch:173) — has no event, and neither does
          // a batch without `log` (an inner batch).
          if (input.log !== undefined && input.parent === undefined && !String(callId).endsWith(':deferred')) {
            fireSession(input.agent?.session, 'tool/call', { turn: input.log.turn, step: input.log.step, callId, name: block.name, arguments: parsed })
          }
          // prepareExecution (tools:3320–3321, 3337–3353): the waterfall defaults to allow; a deny reason
          // becomes the error result and the body never runs, but the result still goes through post-execute
          // (prepareExecution hands it on as a post-result). ask and cancel are not modeled.
          const pending: PostExecutePayload = { callId, name: block.name, arguments: parsed, ...(input.agent === undefined ? {} : { agent: input.agent }), ...(input.parent === undefined ? {} : { parent: input.parent }) }
          const gate = await of('tools/pre-execute').reduceRight<() => Promise<PreExecuteDecision>>(
            (next, listener) => async () => (listener as unknown as PreExecuteListener)(pending, next),
            () => Promise.resolve<PreExecuteDecision>({ kind: 'allow' }),
          )()
          if (gate.kind !== 'allow' && gate.kind !== 'deny') throw new Error(`fake-rc3 does not model the ${gate.kind} decision`)
          const tool = visible().find(candidate => candidate.name === block.name)
          const callContexts: unknown[] = []
          let result: ToolFinalResult
          try {
            if (gate.kind === 'deny') throw new Error(gate.reason)
            if (tool === undefined) throw new Error(`unknown tool "${block.name}"`)
            const value = await tool.execute(parsed, { ...execution(callId, callSignal, callContexts), ...(input.agent === undefined ? {} : { agent: input.agent }) })
            const violations = valueViolations(tool.output.schema, value)
            if (violations.length > 0) throw new Error(`tool "${tool.name}" returned an invalid value: ${violations.join('; ')}`)
            result = { isError: false, value, content: tool.output.render(parsed, value) }
          }
          catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            result = { isError: true, content: [{ type: 'text', text: `Error: ${message}` }], error: { message } }
          }
          const final = await postExecuted(pending, callContexts.length > 0 ? { ...result, additionalContexts: callContexts } : result)
          contexts.push(...(final.additionalContexts ?? []))
          concluded ||= final.concludesTurn === true
          results.push({ callId, result: final })
        }
        return { results, ...(contexts.length > 0 ? { additionalContexts: contexts } : {}), ...(concluded ? { concluded: true } : {}) }
      },
    },
    on: ((event: string, listener: Listener, opts?: { prepend?: boolean }) => {
      const entry = { event, listener, ...(opts === undefined ? {} : { options: opts }) }
      if (opts?.prepend === true) listeners.unshift(entry)
      else listeners.push(entry)
      return () => { listeners.splice(listeners.indexOf(entry), 1) }
    }),
  }
  // rc.3 session header: `cwd` is present when the store recorded a working directory (session:1820–1826).
  const header = options.cwd === undefined ? { id: 'agent-1' } : { id: 'agent-1', cwd: options.cwd }
  // rc.3 Session.requestHeader(): the fold of the logged request headers (session:1612).
  const agent: AgentLike = { id: 'agent-1', ctx, session: { id: 'agent-1', header, deriveMessages: () => [...history], requestHeader: () => headerRoute === undefined ? undefined : { config: headerRoute } } }
  return {
    ctx,
    services: store.services,
    agent,
    natives,
    scoped,
    listeners,
    history,
    deferred,
    executed,
    schemas: () => visible().map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
    async assemble(route, sections = [{ name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' }]) {
      headerRoute = route
      // The model-selection listener (innermost) injects the route after its
      // own next(). The payload carries no tool face: the installed
      // 0.2.2-rc.1 runtime composes it so ("tool declarations remain
      // provider-owned", docs/DESIGN.md §2.4a) and the request face is the
      // wire face (src/glm-llm/face-wire.ts), applied at the adapter's
      // stream over the collected face (the `schemas` view here).
      const base = (): Promise<AssemblePayload> => Promise.resolve({ sections, contexts: [], variables: { ...route } })
      const chain = of('system-prompt/assemble').reduceRight<() => Promise<AssemblePayload>>(
        (next, listener) => async () => (listener as unknown as (a: AssemblePayload, c: unknown, n: () => Promise<AssemblePayload>) => Promise<AssemblePayload>)({ sections, contexts: [], variables: {} }, undefined, next),
        base,
      )
      return chain()
    },
    async create(target = agent) {
      for (const listener of of('agent/created')) await (listener as unknown as (p: { agent: AgentLike }) => unknown)({ agent: target })
    },
    disposeSession(session) {
      for (const listener of of('session/disposed')) (listener as unknown as (session: SessionLike) => unknown)(session)
    },
    sessionEvent(session, type, data) {
      fireSession(session, type, data)
    },
    progress,
    async preStep({ messages = [], step = 1, turn = 1, route } = {}) {
      // rc.1 (agent-loop:685–690): the payload carries the step's model
      // selection; the fake takes the route of the latest `assemble` (the
      // way the loop's own selection precedes the step) unless given one.
      const selection = route ?? headerRoute
      const payload: PreStepPayload = {
        agent,
        messages,
        signal: new AbortController().signal,
        step,
        turn,
        ...(selection === undefined ? {} : { modelSelection: { provider: selection.provider, model: selection.model } }),
      }
      const chain = of('agent/pre-step').reduceRight<() => Promise<PreStepDecision>>(
        (next, listener) => async () => (listener as unknown as (p: PreStepPayload, n: () => Promise<PreStepDecision>) => Promise<PreStepDecision>)(payload, next),
        () => Promise.resolve({ kind: 'enter', messages }),
      )
      return chain()
    },
    async request(turn, step) {
      const payload: AgentRequestPayload = { turn, step, signal: new AbortController().signal }
      const chain = of('agent/request').reduceRight<() => Promise<unknown>>(
        (next, listener) => async () => (listener as unknown as (p: AgentRequestPayload, n: () => Promise<unknown>) => Promise<unknown>)(payload, next),
        () => Promise.resolve({ provider: headerRoute?.provider, model: headerRoute?.model }),
      )
      return chain()
    },
    async requestError(turn, step) {
      const payload: AgentRequestErrorPayload = { turn, step, provider: 'glm-probe', failure: { message: 'probe failure' }, signal: new AbortController().signal }
      const chain = of('agent/request-error').reduceRight<() => Promise<unknown>>(
        (next, listener) => async () => (listener as unknown as (p: AgentRequestErrorPayload, n: () => Promise<unknown>) => Promise<unknown>)(payload, next),
        () => Promise.resolve(undefined),
      )
      return chain()
    },
    stream(options, inner) {
      const chain = of('llm/stream').reduceRight<() => AsyncIterable<StreamChunk>>(
        (next, listener) => () => (listener as unknown as LlmStreamListener)(options, next),
        inner,
      )
      return chain()
    },
    event(session, event) {
      for (const listener of of('session/event')) (listener as unknown as (session: SessionLike, event: SessionEventLike) => void)(session, event)
    },
    async ask(request) {
      const chain = of('user-questions/request').reduceRight<() => Promise<UserQuestionsAnswer>>(
        (next, listener) => async () => (listener as unknown as UserQuestionsListener)(request, next),
        () => Promise.reject(Object.assign(new Error('no user-questions answerer accepted the request'), { code: 'NO_PROVIDER' })),
      )
      return chain()
    },
    async execute(name, args) {
      const tool = visible().find(candidate => candidate.name === name)
      if (tool === undefined) throw new Error(`unknown tool "${name}"`)
      return tool.execute(args, { ...execution(`call-${++callCounter}`, new AbortController().signal, deferred), agent })
    },
  }
}
