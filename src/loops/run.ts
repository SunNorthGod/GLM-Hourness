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
 * human too long; then let the inbox start what is due (inbox.ts). When a peak
 * ended, the loop row's own action runs the table of design §6.9 item 4
 * (peak.ts), and a judgement that waits because the main agent's session is
 * open in another process is made again here on every beat (row 2).
 *
 * What an entry's action does here:
 *
 * - `tell-main`: the text goes to the main agent through the delivery seam;
 *   until that side of the board is built the seam holds the message and the
 *   run ends `held`, so nothing is lost and the page says why;
 * - `harness`: the action of the row that brought it runs (harness.ts) and its
 *   result becomes the outcome; `failed` degrades this row's health, a finding
 *   of the action does not. The loop row's own peak-end action may answer a
 *   skipped result whose run is `held` (peak.ts, design §6.9 item 4 row 2):
 *   the judgement waits and the beat makes it again;
 * - `self`: never run here. The row that owns it runs it where it happens and
 *   reports through `recordRun`; the one exception is the loop row's own
 *   peak-start entry, whose run the board records itself, `delegated`, when
 *   the channel event fires (design §6.9 item 5);
 * - `script`: an entry the person adopted runs through the shared executor
 *   (script.ts, design 0.6 §6.6): first the rules board's `checkCall` judges
 *   the command (§6.9 item 1 — pass, inform or record runs; queue defers and
 *   the beat asks again every five minutes for a day; block ends the run
 *   `blocked` with the rule), then `runScript` verifies the bytes against the
 *   agreed digest and runs its private copy. The result maps as design §6.6
 *   says: exit 0 passes; another code and a crash do not; a timeout is
 *   `unfinished` and its events wait for the next trigger. What is told to
 *   the main agent (or to the session of the event) follows the entry's
 *   `report` and `to`. An entry without the person's adoption record on this
 *   machine is refused (`unadopted`) and starts nothing — the store never
 *   hands such an entry over, so the check here is the second lock on the
 *   same door;
 * - `check`: the same road (design §6.6): the rules board judges first, then
 *   the environment row's reading of the approved tool node decides — the
 *   command gone or changed is `refused` (`check-missing` / `check-changed`)
 *   — and the executor's check lane starts the filled argv in the checkout
 *   the events name. The seam (`deps.checks`) arrives with the environment
 *   row; until it lands on main the answer is `check-missing`.
 *
 * Nothing here throws into a timer, a listener or a tool handler: every step is
 * caught, and what went wrong is told to the row's health.
 */
import { projectKey } from '../graph/main-agent-holder.ts'
import { openEngine } from '../graph/engine.ts'
import { listOpenItems } from '../graph/projection.ts'
import { DEFAULT_GRAPH_DIR } from '../graph/tools.ts'
import { join } from 'node:path'
import { redactSecrets } from '../data/secret-shape.ts'
import { checkCall } from '../rules/check.ts'
import { stamp, type StoreIo } from '../rules/store.ts'
import { agentsOf } from '../rules/wake.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { emitMetric } from '../shared/metrics.ts'
import { nextPeakChange } from '../shared/pricing.ts'
import { reconcile, scheduleOf, type BindDeps, type BindOutcome } from './bind.ts'
import { CHANNEL_PEAK_CHANGED, peakChangedKey } from './channel.ts'
import { createDelivery, HELD_MS, type Deliver, type DeliverResult, type LoopDelivery } from './deliver.ts'
import { PEAK_END_ACTION, PEAK_START_ENTRY } from './defaults.ts'
import { fileChangedKey, hostRestartedKey, waitingOnHumanKey } from './events.ts'
import { currentRun, runAction } from './harness.ts'
import { holderFault, holderLine, holderRecordFor, holderStateOf, WRITER_HELD_MS, type HolderState } from './holder.ts'
import { openInbox, type EmitInput, type EmitResult, type Inbox, type RunBatch, type RunnableEntry } from './inbox.ts'
import { createRunLock, type LockStand } from './lock.ts'
import { watchPaths, type WatchDeps, type Watched } from './file-watch.ts'
import { metricEventOf } from './metrics.ts'
import { createPeakEnd, peakLevelOf, type PeakEnd } from './peak.ts'
import { firedRecord, reasonCode, ruleReason, runId, type LoopRecord, type RunOutcome, type RunReason } from './records.ts'
import type { LoopsRegistry } from './registry.ts'
import { commandText, runCommand, runScript, sweepRunCopies, WORK_TIMEOUT_MS, type HookEnvelope, type ScriptResult } from './script.ts'
import { matchesFilter } from './trigger.ts'
import type { HarnessResult, ListedRun, LoopEventRecord } from './service.ts'
import { ensureRuntimeDir, type LoopStore } from './store.ts'
import { fillPlaceholders, type LoopCheckAction, type LoopScriptAction } from './model.ts'

/** How often a project's board beats (design §6.1). */
export const BEAT_MS = 60_000

/** How long a file-changed event stays one of a script's own after its run ended (design §6.7). */
const SELF_SCRIPT_MS = 60_000
/** How often a queued run asks the rules board again (design §6.9 item 1). */
export const DEFER_RETRY_MS = 5 * 60_000
/** How long a deferral may wait before its run ends `expired` (design §6.9 item 1). */
export const DEFER_MAX_MS = 24 * 3_600_000

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
  /** Told when a peak edge was emitted, so the page's view of the level is written again (design §6.9 item 3). */
  readonly onPeakEdge?: () => void
  /** The delivery's gather window; tests set 0 so a beat's delivery does not wait for a timer (the batching itself is deliver.ts's). */
  readonly deliverBatchMs?: number
  /** The main agent's session if it is open in this process (design §6.1); without it the lock is never handed over. */
  readonly holderHere?: () => string | undefined
  /** What the graph has waiting for the human; the default reads the project's own graph. */
  readonly waiting?: () => Promise<readonly WaitingItem[]>
  /** The size and modification time of the DSH program file, for `appChanged` (design §10.2 V6). */
  readonly appStamp?: () => string | undefined
  /**
   * What the environment row hands the board for check entries (m4 design
   * §6.1.2, one seam until `src/env/env-service.ts` lands and index.ts wires
   * it): the command of an approved tool node, the filler of `{files}` and
   * the reader of the output. Absent — the state of main until that row
   * lands — a check entry is refused (`check-missing`). Tests hand a fake.
   */
  readonly checks?: () => LoopChecks | undefined
  readonly watch?: WatchDeps['watch']
  readonly read?: WatchDeps['read']
}

/** The command of one approved check line, as the check entry needs it (m4 design §6.1.2 `CheckCommand`, narrowed to what the board uses). */
interface LoopCheckCommand {
  /** The command as the node holds it, placeholders still in (the entry's `argv` must be the same). */
  readonly argv: readonly string[]
  /** Opaque to the board; the seam reads it back in `present`. */
  readonly format: unknown
  /** The line carries a `when`: the environment row's own checker runs it too, and the page says so. */
  readonly own: boolean
}

/** What the board needs of the environment row to run a check entry (m4 design §6.1.2). Never throws; an absent command is `check-missing`. */
export interface LoopChecks {
  /** One check line of an approved tool node of the project of `cwd`, read now. */
  commandOf(cwd: string, tool: string, check?: string): Promise<LoopCheckCommand | undefined>
  /** Fill `{files}` of an argv from the changed files of the run (M4's `fillCheckArgv`). */
  fill(argv: readonly string[], files: readonly string[]): { readonly argv: readonly string[], readonly used: number, readonly dropped: number }
  /** The output as findings (at most 20 lines); undefined when the output is not readable in that format and the exit code is not 0. */
  present(format: unknown, run: { readonly stdout: string, readonly stderr: string, readonly exitCode: number }): { readonly findings: number, readonly lines: readonly string[] } | undefined
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
  /** The loop row's own harness action for this project: the end of a peak (design §6.9 item 4). Never throws. */
  peakEnd(action: string, event: LoopEventRecord): Promise<HarnessResult>
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
  /** The runtime directory is made once, before the first lock beat (design §6.1). */
  let dirMade = false
  let stand: LockStand = { kind: 'waiting', pid: 0 }
  let restartTold = false
  let watched: Watched | undefined
  let peakTimer: (() => void) | undefined
  /** The session this process handed the run lock over for: the main agent's session is open in that other process (design §6.1, §6.4 (a)). */
  let handedTo: string | undefined
  /** Since when the holder session has read `elsewhere` without a break, for the five minutes after which the row says so (design §6.4). */
  let elsewhereSince: number | undefined
  /** The person's entries, read at most once a second: `listens` is called on a hot path (design §4.4). */
  let read: { at: number, entries: readonly RunnableEntry[], agreed: ReadonlySet<string> } | undefined
  /** The scripts of this project that are running, or ended less than a minute ago (design §6.7 self-trigger). */
  const scriptWindows = new Map<string, { running: boolean, until?: number }>()

  const iso = (): string => new Date(deps.now()).toISOString()
  // One metrics event per record, at the same moment (metrics design §12 step 6): a metrics row that is
  // absent or failing is the journal's loss to count, never the run's.
  const record = (line: LoopRecord): void => {
    const event = metricEventOf(line)
    if (event !== undefined) emitMetric(ctx, event, { dir: line.project })
  }

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
    ...(deps.deliverBatchMs === undefined ? {} : { batchMs: deps.deliverBatchMs }),
  })
  const deliver: Deliver = deps.deliver ?? delivery.deliver

  function entries(): readonly RunnableEntry[] {
    if (read !== undefined && deps.now() - read.at < 1_000) return read.entries
    const plugin = deps.registry.entries()
      .filter(item => item.state === 'active')
      .map((item): RunnableEntry => ({ entry: item.entry, source: 'plugin', plugin: item.entry.source.plugin, row: item.entry.source.row }))
    let person: readonly RunnableEntry[] = []
    const agreed = new Set<string>()
    try {
      person = deps.store.read().entries
        .flatMap((item): readonly RunnableEntry[] => {
          if (item.status.kind === 'ok' && item.entry !== undefined) {
            agreed.add(item.id)
            return [{ entry: item.entry, source: 'person' }]
          }
          return []
        })
    }
    catch (error) {
      deps.report(`读人加的条目失败：${message(error)}`, 'degraded')
    }
    const all = [...plugin, ...person]
    read = { at: deps.now(), entries: all, agreed }
    return all
  }

  /**
   * Whether an entry may run something (design §18.7: only a person's adopted
   * entries run): the store's read is the gate and this is the second look.
   * A plugin cannot hand a script or a check over at all, so only a person's
   * entry asks.
   */
  function adopted(item: RunnableEntry): boolean {
    if (item.source === 'plugin') return true
    entries()
    return read?.agreed.has(item.entry.id) === true
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
    selfTriggered: (entry, event) => {
      if (event !== 'loops.file-changed') return false
      const window = scriptWindows.get(entry)
      return window !== undefined && (window.running || deps.now() < (window.until ?? 0))
    },
  })

  /**
   * The end of a peak, the loop row's own harness action (design §6.9 item 4,
   * peak.ts): the level through the rules board's service, the execute row's
   * resume action through the registry, the walk record of this project. A
   * judgement that has to wait (row 2) is kept in the held list as a rerun
   * marker, which the beat makes again; it is not a message.
   */
  const peakEnd: PeakEnd = createPeakEnd({
    ctx,
    projectRoot: deps.root,
    now: deps.now,
    delay: deps.delay,
    peak: () => deps.peak?.(),
    holder,
    memory: () => inbox.state().holderMemory,
    mainStep: paths.mainStep,
    runOfAction: action => deps.registry.runOfAction(action),
    hold: (event, run, reason) => {
      const state = inbox.state()
      if (state.held.some(item => item.rerun === 'loops.peak-end' && item.run === run)) return
      const title = entries().find(item => item.entry.id === PEAK_END_ACTION)?.entry.title ?? PEAK_END_ACTION
      state.held.push({ at: iso(), entry: PEAK_END_ACTION, run, title, text: '', wake: true, reason, rerun: 'loops.peak-end', event })
    },
    report: deps.report,
  })

  /**
   * A judgement that waited (row 2) is made again from the table's first row,
   * with the run number it had (design §6.9 item 4 row 2). A day without a
   * verdict ends the run `expired`; a verdict delivers its words and records
   * the one more outcome the design asks for a held run.
   */
  async function rerunPeakEnd(): Promise<void> {
    const state = inbox.state()
    const waiting = state.held.filter(item => item.rerun === 'loops.peak-end' && item.event !== undefined)
    for (const held of waiting) {
      try {
        if (deps.now() - Date.parse(held.at) >= HELD_MS) {
          state.held.splice(state.held.indexOf(held), 1)
          record({ kind: 'loop-done', at: iso(), project: deps.root, entry: held.entry, run: held.run, outcome: 'expired', reason: 'peak-rerun-expired' })
          inbox.state().last[held.entry] = { run: held.run, at: iso(), outcome: 'expired', reason: 'peak-rerun-expired' }
          continue
        }
        const judgement = await peakEnd.judge(held.event!, held.run)
        if (judgement.outcome === 'held') continue
        state.held.splice(state.held.indexOf(held), 1)
        const title = entries().find(item => item.entry.id === held.entry)?.entry.title ?? held.entry
        // A verdict of the table maps as the runner maps an action's: done with words is the delivery's outcome, failed stays failed (the words go out all the same).
        let outcome: RunOutcome = judgement.outcome === 'done' ? 'delivered' : judgement.outcome
        let why: RunReason | undefined = judgement.reason
        if (judgement.outcome === 'done') {
          const result = await deliver({ project: deps.root, entry: held.entry, run: held.run, title, text: judgement.tell, wake: true })
            .catch((error: unknown): DeliverResult => ({ kind: 'failed', reason: message(error) }))
          if (result.kind === 'delivered') outcome = 'delivered'
          else if (result.kind === 'held') outcome = 'held'
          else {
            outcome = 'failed'
            why = 'deliver-failed'
            deps.report(`没能把「${title}」交给主 Agent：${result.reason.slice(0, 80)}`, 'degraded')
          }
        }
        else if (judgement.outcome === 'failed') {
          await deliver({ project: deps.root, entry: held.entry, run: held.run, title, text: judgement.tell, wake: true })
            .catch((error: unknown): DeliverResult => ({ kind: 'failed', reason: message(error) }))
        }
        record({ kind: 'loop-done', at: iso(), project: deps.root, entry: held.entry, run: held.run, outcome, ...(why === undefined ? {} : { reason: why }) })
        inbox.state().last[held.entry] = { run: held.run, at: iso(), outcome, ...(why === undefined ? {} : { reason: why }) }
      }
      catch (error) {
        deps.report(`高峰结束的再判出错：${message(error)}`, 'degraded')
      }
    }
  }

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
    state.host = { pid: deps.pid, boot, startedAt, aliveAt: startedAt, ...(appStamp === undefined ? {} : { appStamp }) }
    if (previous === undefined) return
    // Down from the last moment the board was seen running (its last beat, or its clean exit) to this start; a state written before that moment was kept has only the start.
    const lastAlive = Date.parse(previous.aliveAt ?? '')
    const downFrom = Number.isFinite(lastAlive) ? lastAlive : Date.parse(previous.startedAt)
    const downMinutes = Math.max(0, Math.round((Date.parse(startedAt) - downFrom) / 60_000))
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
    recordPeakStart(edge)
    deps.onPeakEdge?.()
  }

  /**
   * The peak-start entry is the rules row's work: the board only records its
   * run, `delegated`, with the level the rules board's service reads at that
   * moment (design §5.2, §6.9 item 5). A `self` entry never runs from the
   * inbox, so this is the one record it gets.
   */
  function recordPeakStart(edge: 'start' | 'end'): void {
    if (edge !== 'start') return
    const item = entries().find(candidate => candidate.entry.id === PEAK_START_ENTRY)
    if (item === undefined || item.entry.action.kind !== 'self') return
    const id = runId()
    record(firedRecord({ at: iso(), project: deps.root, run: id, entry: item.entry, from: item, event: { event: CHANNEL_PEAK_CHANGED, at: iso() }, events: 1 }))
    const level = peakLevelOf(ctx, deps.root)?.level
    record({
      kind: 'loop-done',
      at: iso(),
      project: deps.root,
      entry: item.entry.id,
      run: id,
      outcome: 'delegated',
      ...(level === undefined ? {} : { reason: level }),
    })
    inbox.state().last[item.entry.id] = { run: id, at: iso(), outcome: 'delegated', ...(level === undefined ? {} : { reason: level }) }
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

  // ------------------------------------------------------------- the scripts

  /** What the rules board made of one command (design §6.9 item 1). */
  type RulesVerdict =
    | { readonly kind: 'run', readonly unavailable?: boolean }
    | { readonly kind: 'blocked', readonly rule: RunReason }
    | { readonly kind: 'queue' }

  /**
   * The rules board's judgement of one command (design §6.9 item 1): no
   * session, no role, no model — the board's commands are no session's, so
   * only rules without a subject and the `glmSpend`附属 rules reach them.
   * A fault of the rules board itself lets the command through, with one
   * note (`rules-unavailable`), the same bias the library has.
   */
  async function askRules(command: string, glmSpend?: 'optional' | 'necessary'): Promise<RulesVerdict> {
    try {
      const peak = deps.peak?.()
      const result = await checkCall(
        { tool: 'pwsh', args: { command } },
        {
          project: deps.root,
          ...(peak === undefined ? {} : { signals: { 'glm-peak': peak(deps.now()) } }),
          ...(glmSpend === undefined ? {} : { glmSpend }),
        },
      )
      if (result.effect === 'block') {
        return { kind: 'blocked', rule: ruleReason(result.rules.find(candidate => candidate.effect === 'block')?.id) }
      }
      if (result.effect === 'queue') return { kind: 'queue' }
      return { kind: 'run' }
    }
    catch {
      return { kind: 'run', unavailable: true }
    }
  }

  /** What a script reads on its standard input (design §6.6): this run's events, merged by the debounce. */
  function envelopeOf(item: RunnableEntry, run: string, batch: RunBatch): HookEnvelope {
    return {
      version: 1,
      board: 'loops',
      entry: item.entry.id,
      run,
      event: batch.record.event,
      id: batch.record.id,
      at: batch.record.at,
      project: deps.root,
      ...(batch.record.session === undefined ? {} : { session: batch.record.session }),
      key: batch.record.key,
      payload: batch.record.payload,
      merged: batch.record.merged,
    }
  }

  /** Seconds with one decimal, for a run's `（<用时>）` and its timeout line. */
  const secondsOf = (ms: number): string => `${(ms / 1000).toFixed(1)}s`

  /** The tail of one stream of output: at most 40 lines and 4000 characters, from the end (design §6.6). */
  function tailOf(text: string): string {
    const lines = text.replace(/\r/g, '').split('\n')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const picked = lines.slice(-40).join('\n')
    return picked.length > 4000 ? picked.slice(-4000) : picked
  }

  /** What the main agent (or the event's session) reads of one run (design §6.6), secrets masked; a check whose output the seam can read gets the findings instead of the raw tail. */
  function resultText(command: string, result: ScriptResult, note: string | undefined, logFile: string, found?: { readonly findings: number, readonly lines: readonly string[] }): string {
    const head = result.kind === 'exited'
      ? `\`${command}\` exit ${result.exitCode}（${secondsOf(result.durationMs)}）`
      : result.kind === 'timeout'
        ? `\`${command}\` did not finish: timed out after ${secondsOf(result.durationMs)}`
        : result.kind === 'crashed' && result.reason === 'spawn'
          ? `\`${command}\` could not start: ${result.message}`
          : `\`${command}\` did not run: ${result.message}`
    const body: string[] = []
    if (note !== undefined && note.length > 0) body.push(note)
    body.push(head)
    if (found !== undefined && result.kind === 'exited') {
      body.push(`发现 ${found.findings} 处：`)
      body.push(...found.lines.slice(0, 20))
    }
    else if (result.kind === 'exited' || result.kind === 'timeout') {
      const out = tailOf(result.stdout)
      if (out.length > 0) body.push(out)
    }
    if (result.kind === 'timeout' || (result.kind === 'exited' && result.exitCode !== 0)) {
      const err = tailOf(result.stderr)
      if (err.length > 0) body.push(err)
    }
    return `${redactSecrets(body.join('\n'))}\nFull output: ${logFile}`
  }

  interface RunParts {
    readonly outcome: RunOutcome
    readonly reason?: RunReason
    readonly how?: 'steer' | 'inject' | 'followup'
    readonly messageId?: string
    readonly exits?: number[]
    readonly outputBytes?: number
    readonly durationMs?: number
  }

  /** Whether a result is one the entry's `report` sends on (design §2.3, §6.6): a run that did not finish always says so. */
  function sendsOn(item: RunnableEntry, action: LoopScriptAction | LoopCheckAction, passed: boolean, timedOut: boolean): boolean {
    if (timedOut) return true
    if (action.report === 'always') return true
    const previous = inbox.state().passing[item.entry.id]
    if (action.report === 'on-change') return previous === undefined || previous !== passed
    return !passed || previous === false
  }

  /** The command line the rules board judges and the person reads: the interpreter's line, or the check's argv. */
  function commandLineOf(action: LoopScriptAction | LoopCheckAction): string {
    return action.kind === 'script' ? commandText(action.script) : commandText(action.argv)
  }

  /**
   * The changed files of one run (design §6.6, §6.7): the union of the run's
   * events' `files`, each judged against the entry's filter on its own, per
   * file — the filler of `{files}` takes this list.
   */
  function filesOf(batch: RunBatch, item: RunnableEntry, root: string): readonly string[] {
    const payloads = [batch.record.payload, ...batch.record.merged.map(merged => merged.payload)]
    const files: string[] = []
    for (const payload of payloads) {
      const named = payload.files
      if (!Array.isArray(named)) continue
      for (const file of named) {
        if (typeof file !== 'string' || files.includes(file)) continue
        if (item.entry.filter !== undefined && !matchesFilter(item.entry.filter, { ...payload, files: [file] }, root)) continue
        files.push(file)
      }
    }
    return files
  }

  const sameArgv = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((part, index) => part === b[index])

  /** The checkout a grouped run works in: the root its events name, or the project (design §6.7). */
  const rootOf = (batch: RunBatch): string =>
    typeof batch.record.payload.root === 'string' && batch.record.payload.root.length > 0 ? batch.record.payload.root : deps.root

  /**
   * One run of a script or a check, between its `loop-fired` and its
   * `loop-done` (design §6.6): the shared executor runs the person's bytes or
   * the approved command, the result maps onto the outcomes of §6.10, and
   * what is told follows the entry's `report` and `to`. A run that did not
   * finish hands its events back to the inbox, to join the next trigger.
   */
  async function runWorkEntry(item: RunnableEntry, run: string, batch: RunBatch, verdict: Extract<RulesVerdict, { kind: 'run' }>): Promise<RunParts> {
    const action = item.entry.action
    if (action.kind !== 'script' && action.kind !== 'check') return { outcome: 'refused', reason: 'unadopted' }
    const seconds = action.timeoutSeconds ?? WORK_TIMEOUT_MS / 1000
    const logFile = join(paths.logsDir, item.entry.id, `${stamp(deps.now())}-${run}.log`)
    let result: ScriptResult
    let found: { readonly findings: number, readonly lines: readonly string[] } | undefined
    if (action.kind === 'script') {
      scriptWindows.set(item.entry.id, { running: true })
      try {
        result = await runScript({
          project: deps.root,
          script: action.script,
          envelope: envelopeOf(item, run, batch),
          purpose: 'work',
          timeoutMs: seconds * 1000,
          logFile,
        })
      }
      finally {
        scriptWindows.set(item.entry.id, { running: false, until: deps.now() + SELF_SCRIPT_MS })
      }
    }
    else {
      // A check runs the command of an approved tool node, read now (m4 design §6.1.2): a different argv than
      // the one the person agreed to is check-changed, nothing to read is check-missing (design §6.6).
      // Both refusals leave before the result mapping: a refused run is neither a pass nor a failure.
      const seam = deps.checks?.()
      const command = seam === undefined ? undefined : await seam.commandOf(rootOf(batch), action.tool, action.check).catch(() => undefined)
      if (seam === undefined) return { outcome: 'refused', reason: 'check-missing' }
      if (command === undefined) {
        deps.report(`「${item.entry.title}」的检查取不到命令（图上没有批过的工具节点，或它没有这一条检查），先不跑`, 'degraded')
        return { outcome: 'refused', reason: 'check-missing' }
      }
      if (!sameArgv(command.argv, action.argv)) {
        deps.report(`「${item.entry.title}」的检查命令在项目图上改过了，先不跑；要接着用，跟主 Agent 说「把${item.entry.title}的检查再看一眼，同意一次」`, 'degraded')
        return { outcome: 'refused', reason: 'check-changed' }
      }
      const filled = seam.fill(action.argv, filesOf(batch, item, rootOf(batch)))
      result = await runCommand({
        queue: 'check',
        project: deps.root,
        ...(rootOf(batch) !== deps.root ? { cwd: rootOf(batch) } : {}),
        argv: filled.argv,
        envelope: envelopeOf(item, run, batch),
        timeoutMs: seconds * 1000,
        logFile,
      })
      found = result.kind === 'exited'
        ? seam.present(command.format, { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode })
        : undefined
    }
    // A refused run is neither a pass nor a failure: it does not touch the passing flag.
    if (result.kind === 'refused') {
      if (result.reason === 'script-changed' || result.reason === 'script-missing') {
        deps.report(`「${item.entry.title}」的脚本${result.reason === 'script-changed' ? '与同意时的哈希对不上' : '不在这份检出里'}，先不跑；要接着用，跟主 Agent 说「把${item.entry.title}的脚本给我看一下」`, 'degraded')
      }
      return { outcome: 'refused', reason: result.reason }
    }
    const passed = result.kind === 'exited' && result.exitCode === 0
    const timedOut = result.kind === 'timeout'
    inbox.state().passing[item.entry.id] = passed
    const speaks = sendsOn(item, action, passed, timedOut)
    let told: { how?: 'steer' | 'inject' | 'followup', messageId?: string } = {}
    if (speaks) {
      const said = await tell(item, run, resultText(commandLineOf(action), result, action.note, logFile, found), true, batch)
      told = { ...(said.how === undefined ? {} : { how: said.how }), ...(said.messageId === undefined ? {} : { messageId: said.messageId }) }
    }
    const outcome: RunOutcome = timedOut ? 'unfinished' : speaks ? 'reported' : 'ran'
    // How long it ran is the record's durationMs; the reason is the code alone.
    const reason: RunReason | undefined = timedOut
      ? 'timeout'
      : result.kind === 'crashed'
        ? result.reason
        : verdict.unavailable && !speaks ? 'rules-unavailable' : undefined
    if (timedOut) inbox.retry(batch)
    return {
      outcome,
      ...(reason === undefined ? {} : { reason }),
      ...told,
      ...(result.kind === 'exited' ? { exits: [result.exitCode] } : {}),
      ...(result.kind === 'exited' || result.kind === 'timeout'
        ? { outputBytes: Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) }
        : {}),
      durationMs: result.durationMs,
    }
  }

  /** A run the rules board has queued waits here, and the beat asks again (design §6.9 item 1). */
  function deferRun(item: RunnableEntry, run: string, batch: RunBatch): void {
    inbox.state().deferred[run] = {
      entry: item.entry.id,
      run,
      group: batch.group,
      record: batch.record,
      since: iso(),
      nextAt: deps.now() + DEFER_RETRY_MS,
    }
  }

  /**
   * The runs the rules board has queued, made again on every beat (design
   * §6.9 item 1): pass and the script runs; block ends the run; a day
   * without a verdict, or an entry that is no longer the adopted one, ends
   * it `expired`.
   */
  async function rerunDeferred(): Promise<void> {
    const state = inbox.state()
    for (const [run, held] of Object.entries(state.deferred)) {
      try {
        if (deps.now() < held.nextAt) continue
        const finish = (outcome: RunOutcome, why: RunReason | undefined, parts?: RunParts): void => {
          delete state.deferred[run]
          record({
            kind: 'loop-done',
            at: iso(),
            project: deps.root,
            entry: held.entry,
            run,
            outcome,
            ...(why === undefined ? {} : { reason: why }),
            ...(parts?.durationMs === undefined ? {} : { durationMs: parts.durationMs }),
            ...(parts?.exits === undefined ? {} : { exits: parts.exits }),
            ...(parts?.outputBytes === undefined ? {} : { outputBytes: parts.outputBytes }),
            ...(parts?.how === undefined ? {} : { delivery: parts.how }),
            ...(parts?.messageId === undefined ? {} : { messageId: parts.messageId }),
          })
          state.last[held.entry] = { run, at: iso(), outcome, ...(why === undefined ? {} : { reason: why }) }
        }
        if (deps.now() - Date.parse(held.since) >= DEFER_MAX_MS) {
          finish('expired', 'rules-queue-expired')
          continue
        }
        const item = entries().find(candidate => candidate.entry.id === held.entry)
        const action = item?.entry.action
        if (item === undefined || action === undefined || (action.kind !== 'script' && action.kind !== 'check') || !adopted(item)) {
          finish('expired', 'entry-not-adopted')
          continue
        }
        const verdict = await askRules(commandLineOf(action), action.glmSpend)
        if (verdict.kind === 'queue') {
          held.nextAt = deps.now() + DEFER_RETRY_MS
          continue
        }
        if (verdict.kind === 'blocked') {
          finish('blocked', verdict.rule)
          continue
        }
        const parts = await runWorkEntry(item, run, { entry: item, group: held.group, record: held.record }, verdict)
        finish(parts.outcome, parts.reason, parts)
      }
      catch (error) {
        deps.report(`规则板排队的重判出错：${message(error)}`, 'degraded')
      }
    }
    await inbox.save()
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
    let exits: number[] | undefined
    let outputBytes: number | undefined
    try {
      const action = item.entry.action
      if (action.kind === 'tell-main') {
        // A `{name}` of the entry's text takes the event's field of that name (design §2.3); a time entry has none.
        const told = await tell(item, run, fillPlaceholders(action.text, batch.record.payload), action.wake, batch)
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
          // The action's own words are the row's to word; the entry's text fills its placeholders from the event (design §2.3).
          const text = result.tell ?? (action.tell === undefined ? undefined : fillPlaceholders(action.tell.text, batch.record.payload))
          // The board's own peak-end action answers codes of the table; another plugin's reason is its words (records.ts).
          const said = result.reason === undefined ? undefined : reasonCode(result.reason, 'plugin-reason')
          if (result.held !== undefined) {
            // Row 2 of the peak-end table: the judgement waits in the held list and the beat makes it again (design §6.9 item 4 row 2).
            outcome = 'held'
            reason = reasonCode(result.held, 'plugin-reason')
          }
          else if (result.outcome === 'skipped') {
            outcome = 'skipped'
            reason = said
          }
          else if (result.outcome === 'done') {
            reason = said
            if (text === undefined) outcome = 'ran'
            else {
              const told = await tell(item, run, text, action.tell?.wake ?? true, batch)
              outcome = told.outcome
              reason = told.reason ?? said
              how = told.how
              messageId = told.messageId
            }
          }
          else {
            outcome = 'failed'
            reason = said
            deps.report(`${item.entry.id} 的 harness 动作失败：${(result.reason ?? '').slice(0, 80)}`, 'degraded')
            if (text !== undefined) await tell(item, run, text, action.tell?.wake ?? true, batch)
          }
        }
      }
      else if (action.kind === 'script' || action.kind === 'check') {
        // Only a person's adopted entry runs anything (design §18.7); the store never hands another over, so this is the second lock on the same door.
        if (!adopted(item)) {
          outcome = 'refused'
          reason = 'unadopted'
        }
        else {
          // The rules board judges before anything reads a node or starts a process (design §6.9 item 1).
          const verdict = await askRules(commandLineOf(action), action.glmSpend)
          if (verdict.kind === 'blocked') {
            outcome = 'blocked'
            reason = verdict.rule
          }
          else if (verdict.kind === 'queue') {
            deferRun(item, run, batch)
            outcome = 'deferred'
          }
          else {
            const parts = await runWorkEntry(item, run, batch, verdict)
            outcome = parts.outcome
            reason = parts.reason
            how = parts.how
            messageId = parts.messageId
            exits = parts.exits
            outputBytes = parts.outputBytes
          }
        }
      }
      else {
        // A `self` entry is run by the row that owns it; the inbox does not queue one.
        outcome = 'delegated'
      }
    }
    catch (error) {
      outcome = 'failed'
      reason = 'board-error'
      deps.report(`「${item.entry.title}」这一次跑出错：${message(error).slice(0, 80)}`, 'degraded')
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
      ...(outputBytes === undefined ? {} : { outputBytes }),
      ...(exits === undefined ? {} : { exits }),
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
    return { outcome: 'failed', reason: 'deliver-failed' }
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

  /**
   * One beat of the board. Beats come from the clock, the host and the file
   * watch, and a watch callback does not wait for the beat it starts, so two
   * beats can be in flight at once; the run state (the inbox position, the
   * held judgements) is not made for that. Every beat therefore waits for the
   * one before it: the design's "the beat makes it again" keeps its order,
   * and a beat that arrives while another runs becomes the next one, not a
   * second reader of the same journal bytes.
   */
  let beatChain: Promise<void> = Promise.resolve()
  function beat(): Promise<void> {
    const run = beatChain.then(runBeat, runBeat)
    beatChain = run.catch(() => {})
    return run
  }

  async function runBeat(): Promise<void> {
    if (stopped) return
    try {
      // A project adopted from the workspace registry beats before anything of it wrote here; the lock needs the directory (design §6.1).
      if (!dirMade) {
        dirMade = true
        await ensureRuntimeDir(deps.store.paths)
      }
      stand = await lock.beat()
      if (stand.kind === 'fault') deps.report(stand.reason, 'degraded')
      if (stand.kind !== 'held') {
        // Another process runs the project: nothing of this one watches its files.
        watched?.dispose()
        watched = undefined
        return
      }
      await restarted()
      // The board is alive at this beat: a crash after it is down from here, which the next start's downMinutes counts from.
      const host = inbox.state().host
      if (host !== undefined) host.aliveAt = iso()
      // Private copies a crash left behind go after an hour (design §6.6); the scripts' self-trigger windows close themselves.
      sweepRunCopies(deps.root, deps.now())
      for (const [entry, window] of [...scriptWindows]) {
        if (!window.running && deps.now() >= (window.until ?? 0)) scriptWindows.delete(entry)
      }
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
      await rerunPeakEnd()
      await rerunDeferred()
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
    peakEnd: (action, event) => peakEnd.run(action, event),
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
        // The row's reason is its words (design §3.1, one line); the record keeps a code (records.ts).
        const reason = run.reason === undefined ? undefined : reasonCode(run.reason, 'plugin-reason')
        record(firedRecord({ at: iso(), project: deps.root, run: id, entry: item.entry, from: item, events: 1 }))
        record({
          kind: 'loop-done',
          at: iso(),
          project: deps.root,
          entry: item.entry.id,
          run: id,
          outcome: run.outcome,
          ...(reason === undefined ? {} : { reason }),
          ...(run.durationMs === undefined ? {} : { durationMs: run.durationMs }),
        })
        inbox.state().last[item.entry.id] = { run: id, at: iso(), outcome: run.outcome, ...(reason === undefined ? {} : { reason }) }
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
        if (state.host !== undefined) state.host = { ...state.host, cleanExit: true, aliveAt: iso() }
        if (stand.kind === 'held') await inbox.save()
      }
      catch {
        // A state that could not be written is rebuilt at the next start (design §6.8).
      }
      await lock.release()
    },
  }
}
