/**
 * The project's inbox and what it does with an event (docs/ORCHESTRATION.md §18.9;
 * loop board design 0.6 §6.3, §6.7): a row hands an event over with `emit`,
 * which appends one line to `<project>/.llm/loops/events.jsonl` under the write
 * lock, whether or not this process runs the project. The process that holds
 * the run lock reads the file from the position it remembers, so events handed
 * over while it was stopped or by another process are run once, after the fact.
 *
 * What the inbox decides before an entry runs:
 *
 * - the same dedupe key is run once in seven days; the next arrival is a
 *   `loop-duplicate` record, and a fourth arrival of one key inside 24 hours
 *   degrades the row, since whoever writes that key is writing one key for
 *   several occurrences;
 * - an entry waits out its debounce (5 seconds for a plugin's entry, 30 for a
 *   person's) and the events that arrive meanwhile are merged into the same run;
 * - an entry runs at most `maxPerHour` times (30 for a plugin's, 6 for a
 *   person's); events over the limit are not lost, they are merged into the
 *   first run after the hour turns;
 * - a check entry and a script entry that reports to the session of the event
 *   are counted by group (entry, session, checkout root), so two subagents
 *   editing files in two work trees are two runs, each in its own checkout;
 * - an event that this entry's own run brought in does not trigger it again
 *   within ten minutes;
 * - a tell-main entry with quiet hours keeps its run until the quiet hours are
 *   over, so a reminder does not wake the main agent at 03:00.
 *
 * The runtime state (`state.json`) keeps all of it, so a restart does not lose
 * a position, a key, a waiting run or an hour's count. Nothing here throws into
 * a caller: `emit` answers with a code, and the beat reports a fault.
 */
import { open, rename, stat } from 'node:fs/promises'
import { matchesFilter, type LoopEventDeclaration } from './trigger.ts'
import { ROTATE_BYTES, appendLine, readText, stamp, writeAtomic, type StoreIo } from '../rules/store.ts'
import type { HolderMemory } from './holder.ts'
import type { LoopEntryDefinition } from './model.ts'
import { eventId, firedRecord, type FiredRecord, type LoopRecord } from './records.ts'
import type { EmitResult, LoopEventRecord } from './service.ts'
import type { LoopsPaths } from './store.ts'

export type { EmitResult } from './service.ts'

/** How long a dedupe key is remembered (design §6.3). */
const KEY_MEMORY_MS = 7 * 24 * 3_600_000
/** How many keys of one namespace are remembered; the oldest of that namespace goes when it is full. */
const KEY_ROOM: Readonly<Record<string, number>> = { hourness: 5000, env: 2000, loops: 1000, channel: 1000 }
const KEY_ROOM_OTHER = 1000
/** An event left in the inbox longer than this is not run (design §6.3, §6.8). */
const EVENT_STALE_MS = 7 * 24 * 3_600_000
/** The debounce and the hourly limit an entry gets when it names none (design §6.7). */
const LIMITS = { plugin: { debounceSeconds: 5, maxPerHour: 30 }, person: { debounceSeconds: 30, maxPerHour: 6 }, group: { maxPerHour: 30 } } as const
/** An event brought in by this entry's own run does not trigger it again inside this window (design §6.7). */
export const SELF_LOOP_MS = 10 * 60_000
/** How many groups of one entry may have a run waiting or in flight (design §6.7). */
const GROUP_ROOM = 32
/** How many events one group keeps while it is over its hourly limit. */
const SURPLUS_ROOM = 100
/** The waits between the three retries of an `emit` that could not write (design §3.1). */
const EMIT_BACKOFF_MS = [1_000, 3_000, 6_000]

/** One entry as the runner holds it: the definition plus where it came from. */
export interface RunnableEntry {
  readonly entry: LoopEntryDefinition
  readonly source: 'plugin' | 'person'
  readonly plugin?: string
  readonly row?: string
}

/** What a row hands over (design §3.1 `LoopEventInput`), with the project already resolved. */
export interface EmitInput {
  readonly event: string
  readonly project: string
  readonly session?: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  /** The row that hands it over. */
  readonly from: string
  /** The run during whose own execution this event was handed over (design §6.3). */
  readonly cause?: string
}

/** One line of the inbox. */
interface InboxLine {
  readonly id: string
  readonly at: string
  readonly event: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly session?: string
  readonly from: string
  readonly cause?: string
}

/** One run the inbox hands to the runner. */
export interface RunBatch {
  readonly entry: RunnableEntry
  readonly record: LoopEventRecord
  readonly group: string
  readonly cause?: string
  /** The event waited in the inbox across a stop of the host. */
  readonly late?: boolean
}

interface KeyMemory {
  readonly firstSeen: string
  /** When the key arrived, newest last, kept for 24 hours and at most four, which is where the row is told. */
  readonly hits: readonly string[]
}

interface PendingGroup {
  readonly entry: string
  readonly session?: string
  readonly root?: string
  /** The events of the run that waits, in the order they arrived. */
  events: InboxLine[]
  /** When the debounce (or the quiet hours) is over. */
  dueAt: number
  /** The hour the count below belongs to, as `YYYY-MM-DDTHH` of the host's clock in UTC. */
  hour: string
  runs: number
  /** Events that arrived over the hourly limit; they join the first run after the hour turns. */
  surplus: InboxLine[]
  late?: boolean
  cause?: string
}

export interface RuntimeState {
  /** Where in the inbox the reading stands. */
  position: { bytes: number, lastId?: string }
  /** The dedupe keys, by namespace and key. */
  keys: Record<string, Record<string, KeyMemory>>
  pending: Record<string, PendingGroup>
  /** The last run of each entry, for the page. */
  last: Record<string, { run: string, at: string, outcome: string, reason?: string }>
  /** What the host last left: the restart event is derived from it (design §6.8). */
  host?: { pid: number, boot: number, startedAt: string, cleanExit?: boolean, appStamp?: string }
  /** The states the file watch settled on, so a change made while the host was down is found once. */
  files: Record<string, { size: number | 'gone', mtimeMs: number }>
  /** The peak reading the last beat saw, for the boundary a stopped host missed. */
  peak?: { value: boolean, at: string }
  /** When each item of the graph was last listed as waiting on the human, so one item is listed once a day. */
  waiting: Record<string, string>
  /** The hour `loops.waiting-on-human` was last looked at. */
  waitingHour?: string
  /** The runs whose own execution is going on, with the entry they belong to: the self-loop window is measured from them. */
  causes: Record<string, { entry: string, at: string }>
  /** The DSH reminder of each time entry, by entry id (design §6.2 `bindings`). */
  bindings: Record<string, Binding>
  /** The messages that could not be delivered yet, oldest first (design §6.4). */
  held: HeldMessage[]
  /** What the board last read about the main agent's session, so one `loop-holder` record is written for each change. */
  holder?: { state: string, reason?: string, session?: string, at: string }
  /** What reaching the holder session has answered so far (design §6.4). */
  holderMemory: HolderMemory
  /** Entries the execution table does not hold now, and since when: `entry-gone` waits them out (design §6.2, review F41). */
  missing: Record<string, { since: string, checks: number, at: string }>
  /** The day a line about one task was last written on the page, so the same task says it once a day (design §6.2 item 3). */
  said: Record<string, string>
  /** The day the 30-day trim of `removed-tasks.jsonl` last ran. */
  trimmedDay?: string
}

/** One DSH reminder the board holds for one entry (design §6.2). */
export interface Binding {
  readonly scheduleId: string
  readonly sessionId: string
  /** The digest of the title, the text and the timing of the entry, as the board last wrote them. */
  readonly specDigest: string
  /** The record DSH last gave back, reduced to the keys of its kind. */
  readonly fingerprint: string
  /** A one-shot reminder that has fired: DSH keeps it inactive and the board does not make it again. */
  readonly done?: boolean
  /** The message id of the last delivery the board has seen, so the next one is one run (design §6.2 "after the due time"). */
  readonly deliveredMessageId?: string
  /** When the board started waiting for a delivery that DSH has not made (the later of the due time and the start of this run of the project). */
  readonly dueSince?: string
}

/** One message of the board that nobody could be told yet (design §6.4). */
export interface HeldMessage {
  readonly at: string
  readonly entry: string
  readonly run: string
  readonly title: string
  readonly text: string
  readonly wake: boolean
  readonly reason: string
  /** The session the result was for, when it was not the main agent's. */
  readonly session?: string
  /**
   * Not a message but a judgement to make again (design §6.9 item 4 row 2):
   * `loops.peak-end` while the main agent's session is open in another DSH
   * process. It waits here so that it travels with the state when the run lock
   * goes to that process, and the delivery never sends one.
   */
  readonly rerun?: 'loops.peak-end'
  /** The event the rerun judges again, as the inbox read it. */
  readonly event?: LoopEventRecord
}

/** The state a project starts from, and the one a state file that cannot be read is rebuilt as (design §6.8). */
export function emptyState(): RuntimeState {
  return { position: { bytes: 0 }, keys: {}, pending: {}, last: {}, files: {}, waiting: {}, causes: {}, bindings: {}, held: [], holderMemory: {}, missing: {}, said: {} }
}

export interface InboxDeps {
  readonly paths: LoopsPaths
  readonly io: StoreIo
  readonly now: () => number
  /** The event table as it stands: an event nobody declares cannot be handed over or run. */
  readonly table: () => ReadonlyMap<string, LoopEventDeclaration>
  /** The entries that could run now, the plugins' and the person's. */
  readonly entries: () => readonly RunnableEntry[]
  /** Whether this process runs the project: it holds the run lock and has read the entries. */
  readonly running: () => boolean
  /** Run the write lock around a write of the inbox (shared with the storage, design §9.1). */
  readonly locked: <T>(body: () => Promise<T>) => Promise<T | 'busy'>
  /** Start one run; the inbox waits for it before it starts the next of that group. */
  readonly start: (batch: RunBatch) => Promise<void>
  /** Write one record (design §6.10). */
  readonly record: (record: LoopRecord) => void
  /** Say what is wrong, in words for the row's health. */
  readonly report: (text: string, level: 'info' | 'degraded') => void
  /** A timer that runs `run` once after `ms`; the row's timers never hold the host open. */
  readonly delay: (run: () => void, ms: number) => () => void
}

export interface Inbox {
  /** Hand one event over (design §3.1 `emit`). Never throws, never rejects. */
  emit(input: EmitInput): Promise<EmitResult>
  /** Whether any entry that could run now hears this event (design §3.1 `listens`). */
  listens(event: string): boolean
  /** Read what is new in the inbox, start what is due, and persist the state. */
  beat(): Promise<void>
  /** The state as it stands; the runner reads and changes the parts that are its own (the host, the files, the peak). */
  state(): RuntimeState
  /** Write the state now. */
  save(): Promise<void>
  dispose(): void
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

const namespaceOf = (event: string): string => event.slice(0, Math.max(0, event.indexOf('.')))

const hourOf = (ms: number): string => new Date(ms).toISOString().slice(0, 13)

/** The dedupe key says one occurrence: `<event without its namespace>:<subject>:<what makes this occurrence this one>` (design §3.1). */
export function keyFaultOf(event: string, key: string): string | undefined {
  if (key.length === 0 || key.length > 200) return 'key must be 1 to 200 characters'
  const parts = key.split(':')
  if (parts.length < 3 || parts.some(part => part.length === 0)) return 'key must name one occurrence: <event>:<subject>:<occurrence>'
  if (parts[0] !== event.slice(event.indexOf('.') + 1)) return `key must start with ${event.slice(event.indexOf('.') + 1)}`
  return undefined
}

/** The payload against the declaration: a field it does not declare, or one of another type, is not an event of this kind. */
export function payloadFaultOf(declared: LoopEventDeclaration, payload: Readonly<Record<string, unknown>>): string | undefined {
  for (const [name, value] of Object.entries(payload)) {
    const field = declared.fields.find(candidate => candidate.name === name)
    if (field === undefined) return `payload has no field ${name} in ${declared.id}`
    const ok = field.type === 'strings'
      ? Array.isArray(value) && value.every(item => typeof item === 'string')
      : field.type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === field.type
    if (!ok) return `payload field ${name} of ${declared.id} must be ${field.type}`
  }
  return undefined
}

/** The group a run of this entry belongs to (design §6.7): by entry alone, or by entry, session and checkout for the entries whose result goes to the session that caused it. */
function groupOf(entry: LoopEntryDefinition, line: InboxLine): { readonly key: string, readonly session?: string, readonly root?: string } {
  const action = entry.action
  const grouped = action.kind === 'check' || (action.kind === 'script' && action.to === 'event-session')
  if (!grouped) return { key: entry.id }
  const root = typeof line.payload.root === 'string' ? line.payload.root : undefined
  return {
    key: `${entry.id}\n${line.session ?? ''}\n${root ?? ''}`,
    ...(line.session === undefined ? {} : { session: line.session }),
    ...(root === undefined ? {} : { root }),
  }
}

/** The debounce and the limit of one entry (design §6.7). */
function limitsOf(item: RunnableEntry): { readonly debounceMs: number, readonly maxPerHour: number } {
  const grouped = item.entry.action.kind === 'check' || (item.entry.action.kind === 'script' && item.entry.action.to === 'event-session')
  const base = LIMITS[item.source]
  return {
    debounceMs: (item.entry.limits?.debounceSeconds ?? base.debounceSeconds) * 1000,
    maxPerHour: item.entry.limits?.maxPerHour ?? (grouped ? LIMITS.group.maxPerHour : base.maxPerHour),
  }
}

/** Minutes of the day of `HH:MM`, or undefined. */
function minutesOf(time: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (match === null) return undefined
  const [hour, minute] = [Number(match[1]), Number(match[2])]
  return hour < 24 && minute < 60 ? hour * 60 + minute : undefined
}

/**
 * When the quiet hours of an entry are over, or undefined when `at` is not in
 * them (design §2.1: a tell-main entry's message waits for the end of the
 * quiet hours). The host's own time zone, as the entry's `HH:MM` is written in.
 */
export function quietUntil(quiet: { readonly from: string, readonly to: string } | undefined, at: number): number | undefined {
  if (quiet === undefined) return undefined
  const [from, to] = [minutesOf(quiet.from), minutesOf(quiet.to)]
  if (from === undefined || to === undefined || from === to) return undefined
  const local = new Date(at)
  const minute = local.getHours() * 60 + local.getMinutes()
  const inside = from < to ? minute >= from && minute < to : minute >= from || minute < to
  if (!inside) return undefined
  const end = new Date(local)
  end.setHours(Math.floor(to / 60), to % 60, 0, 0)
  if (end.getTime() <= at) end.setDate(end.getDate() + 1)
  return end.getTime()
}

export function openInbox(deps: InboxDeps): Inbox {
  // One live object for the whole runtime: a save prunes it in place and never replaces it (see save).
  const state = readState(deps.paths, deps.now())
  /** The groups whose run is in flight: no second run of a group overlaps the first. */
  const inFlight = new Set<string>()
  let armed: (() => void) | undefined
  let disposed = false
  /** Lines of the inbox that could not be read, and how many of them the row has been told about. */
  let unreadable = 0
  let unreadableTold = 0

  const iso = (): string => new Date(deps.now()).toISOString()

  const entryOf = (id: string): RunnableEntry | undefined => deps.entries().find(item => item.entry.id === id)

  function listens(event: string): boolean {
    if (!deps.running()) return true
    return deps.entries().some(item => item.entry.action.kind !== 'self' && item.entry.when.kind === 'event' && item.entry.when.events.includes(event))
  }

  /** Remember a key; `false` when it was seen inside the memory window, which means this occurrence has run already. */
  function remember(event: string, key: string, at: string): { readonly first: boolean, readonly firstSeen: string, readonly hits: number } {
    const space = namespaceOf(event)
    const room = KEY_ROOM[space] ?? KEY_ROOM_OTHER
    const known = state.keys[space] ?? {}
    state.keys[space] = known
    const memory = known[key]
    if (memory !== undefined) {
      const hits = [...memory.hits.filter(hit => Date.parse(at) - Date.parse(hit) < 24 * 3_600_000), at].slice(-4)
      known[key] = { firstSeen: memory.firstSeen, hits }
      return { first: false, firstSeen: memory.firstSeen, hits: hits.length }
    }
    known[key] = { firstSeen: at, hits: [at] }
    const names = Object.keys(known)
    if (names.length > room) {
      const seenAt = (name: string): number => Date.parse(known[name].firstSeen)
      const oldest = names.reduce((first, candidate) => seenAt(candidate) < seenAt(first) ? candidate : first, names[0])
      const dropped = known[oldest]
      delete known[oldest]
      if (Date.parse(at) - Date.parse(dropped.firstSeen) < KEY_MEMORY_MS) {
        deps.report(`${space} 的去重键 7 天内超过 ${room} 个，最早的已不再记`, 'info')
      }
    }
    return { first: true, firstSeen: at, hits: 1 }
  }

  /** Append one line to the inbox under the write lock, retrying three times inside ten seconds (design §3.1). */
  async function append(line: InboxLine): Promise<EmitResult> {
    for (let attempt = 0; ; attempt++) {
      const done = await deps.locked(async () => {
        await rotate()
        await appendLine(deps.paths.events, line)
        return 'written' as const
      }).catch((error: unknown) => message(error))
      if (done === 'written') return { ok: true, id: line.id, duplicate: false }
      const code = done === 'busy' ? 'busy' : 'io'
      const why = done === 'busy' ? '收件箱的写锁一直被别人拿着' : done
      if (attempt >= EMIT_BACKOFF_MS.length) {
        deps.report(`没能把「${line.event}」记进收件箱：${why}`, 'degraded')
        return { ok: false, code, message: why }
      }
      await deps.io.sleep(EMIT_BACKOFF_MS[attempt] ?? 0)
    }
  }

  /** Move the inbox aside once it has reached 8 MiB; the reading starts again at the top of the new file. */
  async function rotate(): Promise<void> {
    const size = await stat(deps.paths.events).then(found => found.size).catch(() => 0)
    if (size < ROTATE_BYTES) return
    const moved = await rename(deps.paths.events, deps.paths.events.replace(/\.jsonl$/, `-${stamp(deps.now())}.jsonl`)).then(() => true).catch(() => false)
    if (moved) state.position = { bytes: 0 }
  }

  async function emit(input: EmitInput): Promise<EmitResult> {
    try {
      const declared = deps.table().get(input.event)
      if (input.event.startsWith('gate.')) return { ok: false, code: 'unknown-event', message: 'gating events are judged at the boundary by the rules board' }
      if (declared === undefined) return { ok: false, code: 'unknown-event', message: `no row declares ${input.event} now` }
      if (declared.listedOnly === true) return { ok: false, code: 'unknown-event', message: `${input.event} is listed only; the board does not take it in` }
      const fault = keyFaultOf(input.event, input.key) ?? payloadFaultOf(declared, input.payload)
      if (fault !== undefined) return { ok: false, code: 'invalid', message: fault }
      if (!listens(input.event)) return { ok: true, duplicate: false, unheard: true }
      const line: InboxLine = {
        id: eventId(),
        at: iso(),
        event: input.event,
        key: input.key,
        payload: input.payload,
        ...(input.session === undefined ? {} : { session: input.session }),
        from: input.from,
        ...(input.cause === undefined ? {} : { cause: input.cause }),
      }
      const written = await append(line)
      if (!written.ok) return written
      if (!deps.running()) return written
      const memory = state.keys[namespaceOf(input.event)]?.[input.key]
      const duplicate = memory !== undefined && deps.now() - Date.parse(memory.firstSeen) < KEY_MEMORY_MS
      // This process runs the project: the line is read and handled now, not when the file watch notices it.
      await beat()
      return { ok: true, id: line.id, duplicate }
    }
    catch (error) {
      return { ok: false, code: 'io', message: message(error) }
    }
  }

  const sizeOf = (): Promise<number> => stat(deps.paths.events).then(found => found.size).catch(() => 0)

  /** One line of the inbox: deduplicate it, then put it to every entry that hears it. */
  function handle(line: InboxLine): { readonly duplicate: boolean } {
    const declared = deps.table().get(line.event)
    if (declared === undefined) {
      deps.record({ kind: 'loop-done', at: iso(), project: deps.paths.projectRoot, entry: line.event, run: line.id, outcome: 'expired', reason: '这个事件现在没有声明' })
      return { duplicate: false }
    }
    const age = deps.now() - Date.parse(line.at)
    if (Number.isFinite(age) && age > EVENT_STALE_MS) {
      deps.record({ kind: 'loop-done', at: iso(), project: deps.paths.projectRoot, entry: line.event, run: line.id, outcome: 'expired', reason: '事件在收件箱里超过 7 天' })
      return { duplicate: false }
    }
    const seen = remember(line.event, line.key, line.at)
    if (!seen.first) {
      deps.record({ kind: 'loop-duplicate', at: iso(), project: deps.paths.projectRoot, event: line.event, key: line.key, from: line.from, firstSeen: seen.firstSeen })
      if (seen.hits >= 4) deps.report(`同一个去重键反复出现：${line.event} ${line.key}`, 'degraded')
      return { duplicate: true }
    }
    const late = age > 2 * 60_000
    for (const item of deps.entries()) {
      if (item.entry.action.kind === 'self') continue
      if (item.entry.when.kind !== 'event' || !item.entry.when.events.includes(line.event)) continue
      if (!matchesFilter(item.entry.filter, line.payload, deps.paths.projectRoot)) continue
      queue(item, line, late)
    }
    return { duplicate: false }
  }

  /** Put one event into its group's waiting run, or say why it does not run. */
  function queue(item: RunnableEntry, line: InboxLine, late: boolean): void {
    const group = groupOf(item.entry, line)
    const cause = line.cause === undefined ? undefined : state.causes[line.cause]
    if (cause !== undefined && cause.entry === item.entry.id && deps.now() - Date.parse(cause.at) < SELF_LOOP_MS) {
      told(item, line, 'suppressed', 'self-loop')
      return
    }
    const waiting = state.pending[group.key]
    if (waiting !== undefined) {
      waiting.events.push(line)
      if (late) waiting.late = true
      if (line.cause !== undefined) waiting.cause = line.cause
      arm()
      return
    }
    const groups = Object.keys(state.pending).filter(key => key.split('\n')[0] === item.entry.id).length + inFlight.size
    if (groups >= GROUP_ROOM) {
      told(item, line, 'suppressed', 'groups')
      deps.report(`「${item.entry.title}」同时改文件的会话太多，有触发没跑`, 'info')
      return
    }
    const { debounceMs } = limitsOf(item)
    state.pending[group.key] = {
      entry: item.entry.id,
      ...(group.session === undefined ? {} : { session: group.session }),
      ...(group.root === undefined ? {} : { root: group.root }),
      events: [line],
      dueAt: deps.now() + debounceMs,
      hour: hourOf(deps.now()),
      runs: 0,
      surplus: [],
      ...(late ? { late: true } : {}),
      ...(line.cause === undefined ? {} : { cause: line.cause }),
    }
    arm()
  }

  /** A run that did not happen: the pair of records the design asks for, with no execution between them (design §6.10). */
  function told(item: RunnableEntry, line: InboxLine, outcome: 'suppressed', reason: string): void {
    const run = `run-${line.id.slice(3)}`
    const fired: FiredRecord = firedRecord({
      at: iso(),
      project: deps.paths.projectRoot,
      run,
      entry: item.entry,
      from: item,
      event: { event: line.event, at: line.at },
      events: 1,
      ...(line.cause === undefined ? {} : { cause: line.cause }),
    })
    deps.record(fired)
    deps.record({ kind: 'loop-done', at: iso(), project: deps.paths.projectRoot, entry: item.entry.id, run, outcome, reason })
    state.last[item.entry.id] = { run, at: iso(), outcome, reason }
  }

  /** Arm the timer for the nearest waiting run, so a debounce does not wait for the next beat. */
  function arm(): void {
    if (disposed) return
    const due = Object.entries(state.pending)
      .filter(([key, group]) => !inFlight.has(key) && group.events.length + group.surplus.length > 0)
      .map(([, group]) => group.dueAt)
    if (due.length === 0) return
    const wait = Math.max(0, Math.min(...due) - deps.now())
    armed?.()
    armed = deps.delay(() => { armed = undefined; void beat() }, wait)
  }

  /** Start every group whose wait is over and whose limit allows it. */
  function startDue(): void {
    const hour = hourOf(deps.now())
    for (const [key, group] of Object.entries(state.pending)) {
      if (group.hour !== hour && group.events.length + group.surplus.length === 0 && !inFlight.has(key)) {
        // An hour without an event of its own: the group goes, and its count with it (design §6.7).
        delete state.pending[key]
        continue
      }
      if (inFlight.has(key) || group.dueAt > deps.now() || group.events.length + group.surplus.length === 0) continue
      const item = entryOf(group.entry)
      // The row that brought the entry is not handing it over now: its events wait until it does, and age out as any other.
      if (item === undefined) continue
      if (group.hour !== hour) {
        group.hour = hour
        group.runs = 0
        group.events = [...group.surplus, ...group.events]
        group.surplus = []
      }
      const quiet = item.entry.action.kind === 'tell-main' ? quietUntil(item.entry.quiet, deps.now()) : undefined
      if (quiet !== undefined) {
        group.dueAt = quiet
        continue
      }
      const { maxPerHour } = limitsOf(item)
      if (group.runs >= maxPerHour) {
        const first = group.events[0]
        if (first !== undefined) {
          told(item, first, 'suppressed', 'rate')
          if (item.source === 'plugin') deps.report(`「${item.entry.title}」一小时里触发超过 ${maxPerHour} 次，后面的合进下一次`, 'degraded')
        }
        group.surplus = [...group.surplus, ...group.events].slice(-SURPLUS_ROOM)
        group.events = []
        // The first run after the hour turns takes them all.
        group.dueAt = Date.parse(`${hour}:59:59.999Z`) + 1
        continue
      }
      const events = group.events
      const first = events[0]
      if (first === undefined) continue
      group.runs += 1
      group.events = []
      const batch: RunBatch = {
        entry: item,
        group: key,
        record: {
          id: first.id,
          event: first.event,
          at: first.at,
          project: deps.paths.projectRoot,
          ...(first.session === undefined ? {} : { session: first.session }),
          key: first.key,
          payload: first.payload,
          merged: events.slice(1).map(line => ({ id: line.id, key: line.key, payload: line.payload })),
        },
        ...(group.cause === undefined ? {} : { cause: group.cause }),
        ...(group.late === true ? { late: true } : {}),
      }
      delete group.late
      delete group.cause
      inFlight.add(key)
      void deps.start(batch).catch(() => undefined).finally(() => {
        inFlight.delete(key)
        // A group whose run is over looks at what came in while it ran.
        arm()
      })
    }
  }

  /** Read what is new in the inbox from the position remembered. */
  async function take(): Promise<void> {
    const size = await sizeOf()
    if (size < state.position.bytes) state.position = { bytes: 0 }
    if (size === state.position.bytes) return
    const file = await open(deps.paths.events, 'r')
    try {
      const length = size - state.position.bytes
      const buffer = Buffer.alloc(length)
      await file.read(buffer, 0, length, state.position.bytes)
      const text = buffer.toString('utf8')
      const end = text.lastIndexOf('\n')
      // A line without its newline is still being written: the position stops before it.
      if (end < 0) return
      const complete = text.slice(0, end + 1)
      let lastId: string | undefined
      for (const raw of complete.split('\n')) {
        if (raw.trim().length === 0) continue
        let line: InboxLine | undefined
        try {
          const value: unknown = JSON.parse(raw)
          line = typeof value === 'object' && value !== null && typeof (value as InboxLine).event === 'string' ? value as InboxLine : undefined
        }
        catch {
          // A line that cannot be read is skipped, and the position goes past it: the row says how many.
          unreadable += 1
        }
        if (line === undefined || typeof line.key !== 'string' || typeof line.at !== 'string') continue
        lastId = line.id
        if (line.id === state.position.lastId) continue
        handle(line)
      }
      state.position = { bytes: state.position.bytes + Buffer.byteLength(complete, 'utf8'), ...(lastId === undefined ? {} : { lastId }) }
    }
    finally {
      await file.close()
    }
  }

  /**
   * One snapshot of the run state onto disk. It prunes in place and writes
   * the live object: a save never replaces `state`, because a run or a
   * delivery in flight holds the object it read from `state()` and its
   * mutations would land on an orphan — a held judgement or an armed run
   * silently lost. Saves run one at a time (a beat, a run and a retry can
   * save at once): the read of the object and the rename of the file travel
   * together, so the last save on disk is the last one that started and no
   * older snapshot lands over a newer one.
   */
  let saveChain: Promise<void> = Promise.resolve()
  function save(): Promise<void> {
    const run = saveChain.then(saveNow, saveNow)
    saveChain = run.catch(() => {})
    return run
  }

  async function saveNow(): Promise<void> {
    try {
      pruneKeys(state.keys, deps.now())
      for (const cause of Object.keys(state.causes)) {
        if (deps.now() - Date.parse(state.causes[cause].at) >= SELF_LOOP_MS) delete state.causes[cause]
      }
      const written = await writeAtomic(deps.paths.state, `${JSON.stringify(state, null, 2)}\n`, deps.io)
      if (!written.ok) deps.report('state.json 换不上去，下一拍再写', 'info')
    }
    catch (error) {
      deps.report(`运行状态写不进：${message(error)}`, 'info')
    }
  }

  async function beat(): Promise<void> {
    if (disposed) return
    try {
      await take()
      startDue()
      arm()
      if (unreadable > unreadableTold) {
        unreadableTold = unreadable
        deps.report(`收件箱里有 ${unreadable} 行读不懂，已跳过`, 'info')
      }
      await save()
    }
    catch (error) {
      deps.report(`收件箱读不出：${message(error)}`, 'degraded')
    }
  }

  return {
    emit,
    listens,
    beat,
    state: () => state,
    save,
    dispose() {
      disposed = true
      armed?.()
      armed = undefined
    },
  }
}

/** Forget the keys older than seven days. */
function prune(keys: RuntimeState['keys'], nowMs: number): RuntimeState['keys'] {
  return Object.fromEntries(Object.entries(keys).map(([space, known]) => [
    space,
    Object.fromEntries(Object.entries(known).filter(([, memory]) => nowMs - Date.parse(memory.firstSeen) < KEY_MEMORY_MS)),
  ]))
}

/** The same pruning, in place: the save writes the live state and must not rebuild it (see save). */
function pruneKeys(keys: RuntimeState['keys'], nowMs: number): void {
  for (const known of Object.values(keys)) {
    for (const key of Object.keys(known)) {
      if (nowMs - Date.parse(known[key].firstSeen) >= KEY_MEMORY_MS) delete known[key]
    }
  }
}

/** The state as it was left, or an empty one; a file that cannot be read is rebuilt, as design §6.8 says. */
function readState(paths: LoopsPaths, nowMs: number): RuntimeState {
  const text = readText(paths.state)
  if (text === undefined) return emptyState()
  try {
    const value = JSON.parse(text) as Partial<RuntimeState>
    return {
      ...emptyState(),
      ...value,
      position: typeof value.position?.bytes === 'number' ? value.position : { bytes: 0 },
      keys: prune(value.keys ?? {}, nowMs),
      pending: value.pending ?? {},
      last: value.last ?? {},
      files: value.files ?? {},
      waiting: value.waiting ?? {},
      causes: value.causes ?? {},
      bindings: value.bindings ?? {},
      held: Array.isArray(value.held) ? value.held : [],
      holderMemory: value.holderMemory ?? {},
      missing: value.missing ?? {},
      said: value.said ?? {},
    }
  }
  catch {
    return emptyState()
  }
}
