/**
 * Running one project's board (docs/ORCHESTRATION.md §18.9; loop board design 0.6
 * §6.1, §6.3, §6.5, §6.8, §6.10): the part of the row that holds the run lock,
 * beats every 60 seconds, puts the loop row's own events out, reads the inbox
 * and executes what an entry says to do.
 *
 * One runtime for each project, in the process that has a session controller;
 * only the holder of the run lock does any of it, and it lets the lock go to the
 * process where the main agent's session is open (lock.ts).
 *
 * What a beat does: refresh or ask for the lock; put out `loops.host-restarted`
 * when this process has started since the state was written; compare the files
 * entries wait for (file-watch.ts) and the channel's peak reading (channel.ts),
 * each against what the state remembers, so a change made while the host was
 * down is caught once; read the graph once an hour for what has waited for the
 * human too long; then let the inbox start what is due (inbox.ts).
 *
 * What an entry's action does here:
 *
 * - `tell-main`: the text goes to the main agent through the delivery seam;
 *   until that side of the board is built the seam holds the message and the
 *   run ends `held`, so nothing is lost and the page says why;
 * - `harness`: the action of the row that brought it runs (harness.ts) and its
 *   result becomes the outcome; `failed` degrades this row's health, a finding
 *   of the action does not;
 * - `self`: never run here. The row that owns it runs it where it happens and
 *   reports through `recordRun`;
 * - `script` and `check`: refused, without starting anything. A script runs only
 *   after the person has read it and agreed, and that path does not exist on
 *   this computer yet (`unadopted`); a check needs the command of an approved
 *   environment tool node, which is not built yet (`check-missing`).
 *
 * Nothing here throws into a timer, a listener or a tool handler: every step is
 * caught, and what went wrong is told to the row's health.
 */
import { projectKey } from '../graph/main-agent-holder.ts'
import { openEngine } from '../graph/engine.ts'
import { listOpenItems } from '../graph/projection.ts'
import { DEFAULT_GRAPH_DIR } from '../graph/tools.ts'
import { join } from 'node:path'
import { agentsOf } from '../rules/wake.ts'
import type { StoreIo } from '../rules/store.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { nextPeakChange } from '../shared/pricing.ts'
import { reconcile, scheduleOf, type BindDeps, type BindOutcome } from './bind.ts'
import { CHANNEL_PEAK_CHANGED, peakChangedKey } from './channel.ts'
import { createDelivery, type Deliver, type DeliverResult, type LoopDelivery } from './deliver.ts'
import { fileChangedKey, hostRestartedKey, waitingOnHumanKey } from './events.ts'
import { currentRun, runAction } from './harness.ts'
import { holderFault, holderLine, holderRecordFor, holderStateOf, WRITER_HELD_MS, type HolderState } from './holder.ts'
import { openInbox, type EmitInput, type EmitResult, type Inbox, type RunBatch, type RunnableEntry } from './inbox.ts'
import { createRunLock, type LockStand } from './lock.ts'
import { watchPaths, type WatchDeps, type Watched } from './file-watch.ts'
import { appendRun, firedRecord, runId, type LoopRecord, type RunOutcome, type RunReason } from './records.ts'
import type { LoopsRegistry } from './registry.ts'
import type { ListedRun } from './service.ts'
import type { LoopStore } from './store.ts'

/** How often a project's board beats (design §6.1). */
export const BEAT_MS = 60_000

export interface ProjectDeps {
  readonly root: string
  readonly store: LoopStore
  readonly registry: LoopsRegistry
  readonly io: StoreIo
  readonly now: () => number
  /** A timer that runs `run` once after `ms`, returning the cancel; the row's timers never hold the host open. */
  readonly delay: (run: () => void, ms: number) => () => void
  readonly pid: number
  readonly boot: () => number
  /**
   * The host, for the main agent's side of the board: the holder record, the
   * schedule service, the live agents and the session controller (holder.ts,
   * bind.ts, deliver.ts). Without it the board runs its event entries and holds
   * every message for the main agent, which is what a process that cannot
   * reach a session can do.
   */
  readonly ctx?: ServiceLookup
  /** Where a message for the main agent goes; the delivery of deliver.ts when absent. */
  readonly deliver?: Deliver
  /** How the main agent's session reads; holder.ts over `ctx` when absent. Tests replace it. */
  readonly holder?: () => HolderState
  readonly report: (text: string, level: 'info' | 'degraded') => void
  /** The channel's peak reading, while a pricing service is there (design §4.3). */
  readonly peak?: () => ((atMs: number) => boolean) | undefined
  /** The main agent's session if it is open in this process (design §6.1); without it the lock is never handed over. */
  readonly holderHere?: () => string | undefined
  /** What the graph has waiting for the human; the default reads the project's own graph. */
  readonly waiting?: () => Promise<readonly WaitingItem[]>
  /** The size and modification time of the DSH program file, for `appChanged` (design §10.2 V6). */
  readonly appStamp?: () => string | undefined
  readonly watch?: WatchDeps['watch']
  readonly read?: WatchDeps['read']
}

/** One thing the graph has waiting for the human (design §4.1). */
export interface WaitingItem {
  readonly id: string
  readonly title: string
  /** When it started waiting. */
  readonly since: string
}

export interface ProjectRuntime {
  readonly root: string
  /** Take or refresh the run lock and do everything a beat does. Never throws. */
  beat(): Promise<void>
  /** Reconcile the DSH reminders now, without waiting for the next beat: the holder session was archived, or DSH said a task changed (design §6.2). Never throws. */
  settleTasks(): Promise<void>
  /** How the main agent's session of this project reads now (design §6.4). */
  holder(): HolderState
  /** The ids of the DSH reminders the board made for this project, for the schedule gate (design §6.2). */
  bindings(): ReadonlySet<string>
  /** The entry one of those reminders belongs to, and the run of its last delivery, for the line of a step that took it (design §6.4). */
  binding(scheduleId: string): { readonly entry: string, readonly run?: string } | undefined
  /** Hand one event over (the service's `emit`, design §3.1). */
  emit(input: Omit<EmitInput, 'project'>): Promise<EmitResult>
  /** Whether an entry that could run now hears this event (the service's `listens`). */
  listens(event: string): boolean
  /** One run of a `self` entry, reported by the row that ran it (the service's `recordRun`). */
  recordRun(run: ListedRun): void
  /** Where the run lock stands, for the page and the row's health. */
  stand(): LockStand
  /** Let the lock go and stop the timers; the host is exiting or the row is unloading. */
  stop(): Promise<void>
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** `<id> "<title>" since <MM-DD HH:MM>`, as the event's `items` lists one (design §4.1). */
function waitingLine(item: WaitingItem): string {
  const at = new Date(item.since)
  const two = (value: number): string => String(value).padStart(2, '0')
  const stamp = Number.isNaN(at.getTime()) ? item.since : `${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`
  return `${item.id} "${item.title}" since ${stamp}`
}

/** What the project's graph has waiting for the human: the proposals and the questions the human decides, with when each started waiting. */
async function graphWaiting(root: string): Promise<readonly WaitingItem[]> {
  const graph = await openEngine(join(root, ...DEFAULT_GRAPH_DIR.split('/'))).load()
  const open = listOpenItems(graph)
  const sinceOf = (id: string, ops: readonly string[]): string => {
    const history = graph.nodes.get(id)?.history ?? []
    const named = [...history].reverse().find(entry => ops.includes(entry.op))
    return named?.at ?? history[0]?.at ?? ''
  }
  return [
    ...open.proposals.map((node): WaitingItem => ({ id: node.id, title: node.title, since: sinceOf(node.id, ['propose']) })),
    ...open.questions.map((node): WaitingItem => ({ id: node.id, title: node.title, since: node.askedAt ?? sinceOf(node.id, ['propose', 'approve', 'status']) })),
  ].filter(item => item.since.length > 0)
}

export function createProjectRuntime(deps: ProjectDeps): ProjectRuntime {
  const paths = deps.store.paths
  const key = projectKey(deps.root)
  const ctx: ServiceLookup = deps.ctx ?? {}
  const startedAt = new Date(deps.now()).toISOString()
  /** The runs of this process that are in flight; the lock is not handed over while one is (design §6.1). */
  const flight = new Map<string, string>()
  let stopped = false
  let stand: LockStand = { kind: 'waiting', pid: 0 }
  let restartTold = false
  let watched: Watched | undefined
  let peakTimer: (() => void) | undefined
  /** The session this process handed the run lock over for: the main agent's session is open in that other process (design §6.1, §6.4 (a)). */
  let handedTo: string | undefined
  /** Since when the holder session has read `elsewhere` without a break, for the five minutes after which the row says so (design §6.4). */
  let elsewhereSince: number | undefined
  /** The person's entries, read at most once a second: `listens` is called on a hot path (design §4.4). */
  let read: { at: number, entries: readonly RunnableEntry[] } | undefined

  const iso = (): string => new Date(deps.now()).toISOString()
  const record = (line: LoopRecord): void => { void appendRun(paths, line, text => { deps.report(text, 'info') }) }

  /**
   * How the main agent's session reads, asked again every time (design §6.4):
   * the record, the mode of the session it names, the host's archive set and
   * what the last `resolveAgent` answered. A process that was given no host
   * cannot read any of it and holds its messages.
   */
  function holder(): HolderState {
    if (deps.holder !== undefined) return deps.holder()
    if (deps.ctx === undefined) return { kind: 'unknown', reason: 'holder-unreadable', detail: '这个进程没有宿主上下文' }
    return holderStateOf({
      projectRoot: deps.root,
      ctx,
      now: deps.now,
      memory: () => inbox.state().holderMemory,
      handedElsewhere: () => handedTo,
    })
  }

  const delivery: LoopDelivery = createDelivery({
    ctx,
    project: deps.root,
    now: deps.now,
    state: () => inbox.state(),
    holder,
    memory: () => inbox.state().holderMemory,
    report: deps.report,
    delay: deps.delay,
  })
  const deliver: Deliver = deps.deliver ?? delivery.deliver

  function entries(): readonly RunnableEntry[] {
    if (read !== undefined && deps.now() - read.at < 1_000) return read.entries
    const plugin = deps.registry.entries()
      .filter(item => item.state === 'active')
      .map((item): RunnableEntry => ({ entry: item.entry, source: 'plugin', plugin: item.entry.source.plugin, row: item.entry.source.row }))
    let person: readonly RunnableEntry[] = []
    try {
      person = deps.store.read().entries
        .flatMap((item): readonly RunnableEntry[] => item.status.kind === 'ok' && item.entry !== undefined ? [{ entry: item.entry, source: 'person' }] : [])
    }
    catch (error) {
      deps.report(`读人加的条目失败：${message(error)}`, 'degraded')
    }
    const all = [...plugin, ...person]
    read = { at: deps.now(), entries: all }
    return all
  }

  const inbox: Inbox = openInbox({
    paths,
    io: deps.io,
    now: deps.now,
    // The table the board judges by: the loop row's own events, the channel events while a pricing service is there, and what other rows declared.
    table: () => deps.registry.events(),
    entries,
    running: () => !stopped && stand.kind === 'held',
    locked: body => deps.store.locked(body),
    start: batch => execute(batch),
    record,
    report: deps.report,
    delay: deps.delay,
  })

  /** Hand one of the loop row's own events over, under the run that caused it when there is one. */
  async function own(event: string, key: string, payload: Readonly<Record<string, unknown>>, session?: string): Promise<void> {
    const result = await inbox.emit({
      event,
      project: deps.root,
      key,
      payload,
      from: 'glm-hourness/loops',
      ...(session === undefined ? {} : { session }),
      ...(currentRun() === undefined ? {} : { cause: currentRun()! }),
    })
    if (!result.ok) deps.report(`没能把「${event}」记进收件箱：${result.message}`, 'degraded')
  }

  /** `loops.host-restarted`: this process has started since the state was last written (design §6.8). */
  async function restarted(): Promise<void> {
    if (restartTold) return
    restartTold = true
    const state = inbox.state()
    const previous = state.host
    const boot = Math.round(deps.boot() / 60_000) * 60_000
    const appStamp = deps.appStamp?.()
    state.host = { pid: deps.pid, boot, startedAt, ...(appStamp === undefined ? {} : { appStamp }) }
    if (previous === undefined) return
    const downMinutes = Math.max(0, Math.round((Date.parse(startedAt) - Date.parse(previous.startedAt)) / 60_000))
    await own('loops.host-restarted', hostRestartedKey(key, startedAt), {
      previousStart: previous.startedAt,
      downMinutes,
      crashed: previous.cleanExit !== true,
      rebooted: previous.boot !== boot,
      appChanged: appStamp !== undefined && previous.appStamp !== undefined && previous.appStamp !== appStamp,
    })
  }

  /** The paths the entries that wait for a file change name (design §4.1 `path`). */
  function watchedPaths(): readonly string[] {
    return [...new Set(entries().flatMap((item) => {
      const when = item.entry.when
      if (when.kind !== 'event' || !when.events.includes('loops.file-changed')) return []
      const path = when.params?.path
      return typeof path === 'string' && path.length > 0 ? [path] : []
    }))].slice(0, 20)
  }

  /** Watch what the entries name now, keeping the states the state file remembers. */
  function follow(): Watched {
    if (watched !== undefined) {
      watched.follow(watchedPaths())
      return watched
    }
    const known = new Map(Object.entries(inbox.state().files))
    watched = watchPaths(watchedPaths(), (path, state) => {
      void own('loops.file-changed', fileChangedKey(path, state.size, state.mtimeMs), {
        path,
        // The declaration has one number for the size; a file that is gone says so in the key.
        size: state.size === 'gone' ? 0 : state.size,
        mtime: new Date(state.mtimeMs).toISOString(),
      })
    }, {
      now: deps.now,
      delay: deps.delay,
      known,
      ...(deps.watch === undefined ? {} : { watch: deps.watch }),
      ...(deps.read === undefined ? {} : { read: deps.read }),
    })
    return watched
  }

  /** `channel.peak-changed`: the pricing service's reading against the one the state remembers (design §4.3). */
  async function peakChanged(): Promise<void> {
    const peak = deps.peak?.()
    if (peak === undefined) return
    const state = inbox.state()
    const now = deps.now()
    let value: boolean
    try {
      value = peak(now)
    }
    catch (error) {
      deps.report(`读不出 GLM 高峰时刻：${message(error)}`, 'info')
      return
    }
    // The next change is where the timer goes, so the edge is not up to 60 seconds late.
    const next = nextPeakChange(peak, now)
    peakTimer?.()
    peakTimer = next === undefined ? undefined : deps.delay(() => { peakTimer = undefined; void beat() }, Math.max(1_000, next - now))
    const previous = state.peak
    state.peak = { value, at: new Date(now).toISOString() }
    if (previous === undefined || previous.value === value) return
    const boundary = nextPeakChange(peak, Date.parse(previous.at)) ?? now
    const edge = value ? 'start' : 'end'
    const until = nextPeakChange(peak, boundary + 1)
    await own(CHANNEL_PEAK_CHANGED, peakChangedKey(edge, new Date(boundary).toISOString()), {
      edge,
      boundary: new Date(boundary).toISOString(),
      until: until === undefined ? '' : new Date(until).toISOString(),
    })
  }

  /** `loops.waiting-on-human`: once an hour, what has waited longer than an entry's threshold and has not been listed in the last 24 hours (design §4.1). */
  async function waitingOnHuman(): Promise<void> {
    const thresholds = [...new Set(entries().flatMap((item) => {
      const when = item.entry.when
      if (when.kind !== 'event' || !when.events.includes('loops.waiting-on-human')) return []
      const hours = when.params?.olderThanHours
      return typeof hours === 'number' ? [hours] : []
    }))]
    if (thresholds.length === 0) return
    const state = inbox.state()
    const hour = new Date(deps.now()).toISOString().slice(0, 13)
    if (state.waitingHour === hour) return
    let items: readonly WaitingItem[]
    try {
      items = await (deps.waiting ?? (() => graphWaiting(deps.root)))()
    }
    catch (error) {
      deps.report(`读不出图上等人的事：${message(error)}`, 'info')
      return
    }
    state.waitingHour = hour
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    for (const olderThanHours of thresholds) {
      const crossed = items.filter((item) => {
        const waited = deps.now() - Date.parse(item.since)
        if (!(waited >= olderThanHours * 3_600_000)) return false
        const told = state.waiting[item.id]
        return told === undefined || deps.now() - Date.parse(told) >= 24 * 3_600_000
      })
      if (crossed.length === 0) continue
      for (const item of crossed) state.waiting[item.id] = iso()
      await own('loops.waiting-on-human', waitingOnHumanKey(olderThanHours, new Date(deps.now()), zone), {
        items: crossed.map(waitingLine),
        count: crossed.length,
      })
    }
  }

  /** The pair of records of one run, with the execution between them (design §6.10). */
  async function execute(batch: RunBatch): Promise<void> {
    const run = runId()
    const item = batch.entry
    const started = deps.now()
    record(firedRecord({
      at: iso(),
      project: deps.root,
      run,
      entry: item.entry,
      from: item,
      event: { event: batch.record.event, at: batch.record.at },
      events: 1 + batch.record.merged.length,
      ...(batch.cause === undefined ? {} : { cause: batch.cause }),
      ...(batch.late === true ? { late: true } : {}),
    }))
    flight.set(run, item.entry.title)
    inbox.state().causes[run] = { entry: item.entry.id, at: iso() }
    let outcome: RunOutcome | undefined
    let reason: RunReason | undefined
    let how: 'steer' | 'inject' | 'followup' | undefined
    let messageId: string | undefined
    try {
      const action = item.entry.action
      if (action.kind === 'tell-main') {
        const told = await tell(item, run, action.text, action.wake, batch)
        outcome = told.outcome
        reason = told.reason
        how = told.how
        messageId = told.messageId
      }
      else if (action.kind === 'harness') {
        const listed = deps.registry.actionOf(item.entry.id)
        if (listed === undefined || !listed.actions.includes(action.action)) {
          outcome = 'failed'
          reason = 'action-missing'
          deps.report(`「${item.entry.title}」的 harness 动作 ${action.action} 此刻没有谁提供`, 'degraded')
        }
        else {
          const result = await runAction(action.action, batch.record, run, { run: listed.run, now: deps.now, delay: deps.delay })
          const text = result.tell ?? action.tell?.text
          if (result.outcome === 'skipped') {
            outcome = 'skipped'
            reason = result.reason
          }
          else if (result.outcome === 'done') {
            if (text === undefined) outcome = 'ran'
            else {
              const told = await tell(item, run, text, action.tell?.wake ?? true, batch)
              outcome = told.outcome
              reason = told.reason
              how = told.how
              messageId = told.messageId
            }
          }
          else {
            outcome = 'failed'
            reason = result.reason
            deps.report(`${item.entry.id} 的 harness 动作失败：${(result.reason ?? '').slice(0, 80)}`, 'degraded')
            if (text !== undefined) await tell(item, run, text, action.tell?.wake ?? true, batch)
          }
        }
      }
      else if (action.kind === 'script' || action.kind === 'check') {
        // Nothing is started: the shared script executor and the approval path are not built (impl-plan section 3).
        outcome = 'refused'
        reason = action.kind === 'script' ? 'unadopted' : 'check-missing'
      }
      else {
        // A `self` entry is run by the row that owns it; the inbox does not queue one.
        outcome = 'delegated'
      }
    }
    catch (error) {
      outcome = 'failed'
      reason = message(error)
      deps.report(`「${item.entry.title}」这一次跑出错：${reason.slice(0, 80)}`, 'degraded')
    }
    finally {
      flight.delete(run)
    }
    record({
      kind: 'loop-done',
      at: iso(),
      project: deps.root,
      entry: item.entry.id,
      run,
      outcome: outcome ?? 'failed',
      ...(reason === undefined ? {} : { reason }),
      durationMs: deps.now() - started,
      ...(how === undefined ? {} : { delivery: how }),
      ...(messageId === undefined ? {} : { messageId }),
    })
    inbox.state().last[item.entry.id] = { run, at: iso(), outcome: outcome ?? 'failed', ...(reason === undefined ? {} : { reason }) }
    await inbox.save()
  }

  /** One message of a run, and what the delivery seam made of it. */
  async function tell(item: RunnableEntry, run: string, text: string, wake: boolean, batch: RunBatch): Promise<{ outcome: RunOutcome, reason?: RunReason, how?: 'steer' | 'inject' | 'followup', messageId?: string }> {
    const action = item.entry.action
    const toSession = (action.kind === 'script' || action.kind === 'check') && action.to === 'event-session' ? batch.record.session : undefined
    const result = await deliver({
      project: deps.root,
      entry: item.entry.id,
      run,
      title: item.entry.title,
      text,
      wake,
      ...(toSession === undefined ? {} : { session: toSession }),
    }).catch((error: unknown): DeliverResult => ({ kind: 'failed', reason: message(error) }))
    if (result.kind === 'delivered') return { outcome: 'delivered', how: result.how, ...(result.messageId === undefined ? {} : { messageId: result.messageId }) }
    if (result.kind === 'held') return { outcome: 'held', reason: result.reason }
    deps.report(`没能把「${item.entry.title}」交给主 Agent：${result.reason.slice(0, 80)}`, 'degraded')
    return { outcome: 'failed', reason: result.reason }
  }

  /**
   * The main agent's session when it is open in this process (design §6.1):
   * then the run lock belongs here, because only this process can deliver to
   * it (`resolveAgent` elsewhere answers `session/writer-held`). Read from the
   * record alone, not from `holderState`, which asks about the hand-over.
   */
  function holderHere(): string | undefined {
    if (deps.holderHere !== undefined) return deps.holderHere()
    if (deps.ctx === undefined) return undefined
    try {
      const reading = holderRecordFor(ctx, deps.root)
      if (reading.kind !== 'held') return undefined
      return agentsOf(ctx)?.get(reading.record.sessionId) === undefined ? undefined : reading.record.sessionId
    }
    catch {
      return undefined
    }
  }

  const bindDeps: BindDeps = {
    paths,
    io: deps.io,
    now: deps.now,
    state: () => inbox.state(),
    schedule: () => scheduleOf(ctx, text => { deps.report(text, 'degraded') }),
    holder,
    entries,
    deleted: (entry) => {
      try {
        return deps.store.read().entries.find(item => item.id === entry)?.status.kind === 'deleted'
      }
      catch {
        return false
      }
    },
    startedAt,
    record,
    report: deps.report,
    deliver,
  }

  /** One reconciliation, with what it did told to the row (design §6.2). */
  async function settleTasks(): Promise<void> {
    if (stopped) return
    try {
      const done = await reconcile(bindDeps)
      told(done)
      await inbox.save()
    }
    catch (error) {
      deps.report(`对不上 DSH 的定时任务：${message(error)}`, 'degraded')
    }
  }

  /** What a reconciliation and the holder state say to the row's health (design §6.2, §6.4). */
  function told(done: BindOutcome): void {
    for (const line of done.lines) deps.report(line, 'info')
    if (done.kept.length > 0) deps.report(`有 ${done.kept.length} 条 DSH 提醒这一拍没删`, 'info')
  }

  /** The `loop-holder` record of a change of state, so "the messages waited because the session was archived" can be looked up afterwards (design §6.10). */
  function holderChanged(state: HolderState): void {
    const known = inbox.state().holder
    if (known?.state === state.kind && known.reason === state.reason && known.session === state.session) return
    inbox.state().holder = { state: state.kind, at: iso(), ...(state.reason === undefined ? {} : { reason: state.reason }), ...(state.session === undefined ? {} : { session: state.session }) }
    record({ kind: 'loop-holder', at: iso(), project: deps.root, state: state.kind, ...(state.reason === undefined ? {} : { reason: state.reason }), ...(state.session === undefined ? {} : { session: state.session }) })
    const fault = holderFault(state)
    if (fault !== undefined) deps.report(fault, 'degraded')
    else {
      const line = holderLine(state)
      if (line !== undefined) deps.report(line, 'info')
    }
  }

  const lock = createRunLock({
    paths,
    io: deps.io,
    now: deps.now,
    pid: deps.pid,
    boot: deps.boot,
    holderHere,
    busy: () => [...flight.values()][0],
    record: (op, session) => {
      handedTo = op === 'release' ? session : undefined
      record({ kind: 'loop-handover', at: iso(), project: deps.root, op, pid: deps.pid, ...(session === undefined ? {} : { session }) })
    },
  })

  async function beat(): Promise<void> {
    if (stopped) return
    try {
      stand = await lock.beat()
      if (stand.kind === 'fault') deps.report(stand.reason, 'degraded')
      if (stand.kind !== 'held') {
        // Another process runs the project: nothing of this one watches its files.
        watched?.dispose()
        watched = undefined
        return
      }
      await restarted()
      const now = holder()
      holderChanged(now)
      if (now.kind === 'elsewhere') {
        elsewhereSince ??= deps.now()
        if (deps.now() - elsewhereSince >= WRITER_HELD_MS) {
          const running = [...flight.values()][0]
          deps.report(running === undefined ? '主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去' : `主 Agent 的会话在另一个 DSH 窗口里，这块板等手上的「${running}」跑完就交过去`, 'degraded')
        }
      }
      else elsewhereSince = undefined
      const files = follow()
      await files.beat()
      inbox.state().files = Object.fromEntries([...files.states()])
      await peakChanged()
      await waitingOnHuman()
      told(await reconcile(bindDeps))
      await delivery.flush()
      await inbox.beat()
    }
    catch (error) {
      deps.report(`循环板这一拍出错：${message(error)}`, 'degraded')
    }
  }

  return {
    root: deps.root,
    beat,
    settleTasks,
    holder,
    bindings: () => new Set(Object.values(inbox.state().bindings).map(binding => binding.scheduleId)),
    binding(scheduleId) {
      const found = Object.entries(inbox.state().bindings).find(([, binding]) => binding.scheduleId === scheduleId)
      if (found === undefined) return undefined
      const last = inbox.state().last[found[0]]
      return { entry: found[0], ...(last?.outcome === 'delivered' ? { run: last.run } : {}) }
    },
    stand: () => stand,
    emit: input => inbox.emit({ ...input, project: deps.root }),
    listens: event => inbox.listens(event),
    recordRun(run) {
      try {
        const item = entries().find(candidate => candidate.entry.id === run.entry)
        if (item === undefined || item.entry.action.kind !== 'self') return
        const id = runId()
        record(firedRecord({ at: iso(), project: deps.root, run: id, entry: item.entry, from: item, events: 1 }))
        record({
          kind: 'loop-done',
          at: iso(),
          project: deps.root,
          entry: item.entry.id,
          run: id,
          outcome: run.outcome,
          ...(run.reason === undefined ? {} : { reason: run.reason }),
          ...(run.durationMs === undefined ? {} : { durationMs: run.durationMs }),
        })
        inbox.state().last[item.entry.id] = { run: id, at: iso(), outcome: run.outcome, ...(run.reason === undefined ? {} : { reason: run.reason }) }
      }
      catch (error) {
        deps.report(`记一次 ${run.entry} 的运行失败：${message(error)}`, 'info')
      }
    },
    async stop() {
      stopped = true
      peakTimer?.()
      watched?.dispose()
      delivery.dispose()
      inbox.dispose()
      try {
        const state = inbox.state()
        // A clean exit is what tells the next start that the host did not crash (design §6.8).
        if (state.host !== undefined) state.host = { ...state.host, cleanExit: true }
        if (stand.kind === 'held') await inbox.save()
      }
      catch {
        // A state that could not be written is rebuilt at the next start (design §6.8).
      }
      await lock.release()
    },
  }
}
