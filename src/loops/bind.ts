/**
 * The DSH reminders of the time entries (docs/ORCHESTRATION.md §18.10; loop
 * board design 0.6 §6.2): an entry that tells the main agent at a time is one
 * task of the host's schedule service, bound to the main agent's session, and
 * DSH delivers it and wakes the session. The board keeps the two sides in step
 * and does nothing else about time: the clocks, the time zones, the cron rules
 * and the one catch-up after a restart are the host's.
 *
 * One reconciliation does five things, in this order (design §6.2):
 *
 * 0. read the main agent's session again (holder.ts). Not `ok` and not
 *    "only the archive set could not be read" means the board either removes
 *    the reminders of a session nobody can be told through any more, or — while
 *    it cannot see the session clearly — changes nothing at all. This is the
 *    only place that keeps a reminder from being made on an archived session:
 *    `schedule.create` takes one (schedule:2254–2261 refuses a delegated
 *    child's session and nothing else);
 * 1. make what is missing: a new entry, a new main agent, a task somebody
 *    deleted;
 * 2. move what is bound to another session: make the new one first, then
 *    remove the old one (remove.ts);
 * 3. repair what does not match: the board's own digest of the entry, and the
 *    fingerprint of the host's record, say whether the entry changed or
 *    somebody edited the task on the DSH task page. An edit from outside is
 *    put back and said once a day;
 * 4. take in or remove a reminder of the board's that no binding names: after
 *    the state file was lost it is taken back, and once the entry is certainly
 *    gone it is removed. "Certainly" is the point: an entry missing because the
 *    row that hands it over has not handed it over yet is waited for, not
 *    deleted (design §6.2, review F41).
 *
 * After the due time the board only reads: a delivery the host made is one run
 * of the entry, and a delivery it did not make in five minutes is one failure,
 * which the board delivers itself once.
 *
 * Nothing here throws into the beat; every host call is caught and becomes a
 * line of the row's health.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from '../rules/model.ts'
import type { StoreIo } from '../rules/store.ts'
import type { ScheduleCatalogEntry, ScheduleChange, ScheduleRecordLike, ScheduleSelector, ScheduleService, ServiceLookup } from '../shared/dsh-min.ts'
import { canDeliver, mayRemoveHolderTasks, type HolderState } from './holder.ts'
import type { Binding, RunnableEntry, RuntimeState } from './inbox.ts'
import type { LoopEntryDefinition } from './model.ts'
import { firedRecord, runId, type LoopRecord } from './records.ts'
import { entryIdOfPrompt, isOurs, promptLineOf, removeTask, TASK_TITLE_PREFIX, trimRemovedTasks, type RemoveDeps, type RemoveReason } from './remove.ts'
import type { LoopsPaths } from './store.ts'
import type { Trigger } from './trigger.ts'
import type { Deliver } from './deliver.ts'

/** How long the board waits for a delivery the host owes before it calls it a failure and delivers once itself (design §6.2, review F25). */
export const NOT_DELIVERED_MS = 5 * 60_000
/** How long a process must have been running a project before an entry that is not in the execution table counts as gone (design §6.2, review F41). */
export const ENTRY_GONE_WARMUP_MS = 5 * 60_000
/** Two reconciliations at least this far apart must both miss an entry before it counts as gone. */
export const ENTRY_GONE_GAP_MS = 60_000

/** Read the host's schedule service; undefined in a composition that mounts none (design §10.1: `ctx.get`, never `inject`). */
export function scheduleOf(ctx: ServiceLookup, problem?: (text: string) => void): ScheduleService | undefined {
  const value: unknown = typeof ctx.get === 'function' ? ctx.get('schedule') : undefined
  if (value === undefined || value === null) return undefined
  const members = value as Partial<Record<keyof ScheduleService, unknown>>
  if (['create', 'list', 'catalog', 'delete', 'update'].every(name => typeof members[name as keyof ScheduleService] === 'function')) return value as ScheduleService
  problem?.('DSH 的定时服务形状不对，到点告诉主 Agent 的条目不跑')
  return undefined
}

/** The entries that are one DSH reminder each: a message for the main agent at a time (design §6.2 table). */
export function timeEntries(entries: readonly RunnableEntry[]): readonly RunnableEntry[] {
  return entries.filter(item => item.entry.action.kind === 'tell-main' && item.entry.when.kind !== 'event' && item.entry.when.kind !== 'command')
}

/** The title of the reminder of one entry; the host trims it to 120 characters, so the board does too (schedule:93–97). */
export function titleOf(entry: LoopEntryDefinition): string {
  return `${TASK_TITLE_PREFIX}${entry.title}`.slice(0, 120)
}

/** The prompt of the reminder of one entry: the board's own first line, then the text the entry gives the main agent. */
export function promptOf(item: RunnableEntry): string {
  const text = item.entry.action.kind === 'tell-main' ? item.entry.action.text : ''
  return `${promptLineOf(item.entry.id, item.source === 'plugin' ? { plugin: item.plugin ?? 'dsh-hourness' } : {})}\n${text}`
}

/** The timing of one entry as the host takes it, or undefined when the entry has no time trigger (design §2.2 mapping). */
export function selectorOf(when: Trigger, systemTimeZone: string): ScheduleSelector | undefined {
  switch (when.kind) {
    case 'once': return { at: when.at }
    case 'every': return { every_seconds: when.seconds }
    case 'daily': return { daily: { time: `${when.time}:00`, time_zone: when.timeZone ?? systemTimeZone } }
    case 'weekly': return { weekly: { time: `${when.time}:00`, time_zone: when.timeZone ?? systemTimeZone, weekdays: [...when.weekdays] } }
    case 'cron': return { cron: { expression: when.expression, time_zone: when.timeZone ?? systemTimeZone } }
    default: return undefined
  }
}

/** The kind the host's `change` needs beside the selector (schedule:1710–1716); `once` is the host's `at`. */
function changeKindOf(when: Trigger): ScheduleChange['kind'] | undefined {
  switch (when.kind) {
    case 'once': return 'at'
    case 'every': return 'every'
    case 'daily': return 'daily'
    case 'weekly': return 'weekly'
    case 'cron': return 'cron'
    default: return undefined
  }
}

const sha12 = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12)

/** The digest of what the board wants the reminder to say: its title, its text and its timing with the zone already chosen (design §6.2 `specDigest`). */
export function specDigestOf(item: RunnableEntry, systemTimeZone: string): string {
  return sha12(canonicalJson({ title: titleOf(item.entry), prompt: promptOf(item), selector: selectorOf(item.entry.when, systemTimeZone) }))
}

/**
 * The fingerprint of a host record: its kind, title and prompt, with the
 * timing keys of its own kind. The next due time of a repeating reminder
 * changes with every delivery, so it is not part of it; for a one-shot it is
 * the time itself (design §6.2).
 */
export function fingerprintOf(record: ScheduleRecordLike): string {
  const timing: Record<string, unknown> = record.kind === 'at' || record.kind === 'after'
    ? { scheduledAt: record.scheduledAt }
    : record.kind === 'every' ? { everySeconds: record.everySeconds }
      : record.kind === 'daily' ? { time: record.time, timeZone: record.timeZone }
        : record.kind === 'weekly' ? { time: record.time, timeZone: record.timeZone, weekdays: record.weekdays }
          : { expression: record.expression, timeZone: record.timeZone }
  return sha12(canonicalJson({ kind: record.kind, title: record.title, prompt: record.prompt, ...timing }))
}

export interface BindDeps {
  readonly paths: LoopsPaths
  readonly io: StoreIo
  readonly now: () => number
  readonly state: () => RuntimeState
  readonly schedule: () => ScheduleService | undefined
  readonly holder: () => HolderState
  readonly entries: () => readonly RunnableEntry[]
  /** Whether the person deleted this entry on this computer: then it is certainly gone (design §6.2). */
  readonly deleted: (entry: string) => boolean
  /** When this process started running this project, for the warm-up of `entry-gone`. */
  readonly startedAt: string
  readonly record: (record: LoopRecord) => void
  readonly report: (text: string, level: 'info' | 'degraded') => void
  /** Deliver one message the host owed and did not deliver (design §6.2 "after the due time"). */
  readonly deliver: Deliver
  /** The time zone an entry that names none is read in; the host's own zone. */
  readonly timeZone?: () => string
}

export interface BindOutcome {
  readonly created: readonly string[]
  readonly moved: readonly string[]
  readonly updated: readonly string[]
  readonly adopted: readonly string[]
  readonly removed: readonly string[]
  /** Tasks the board decided not to remove, with the reason: the page counts them (design §6.2). */
  readonly kept: readonly string[]
  /** Lines for the page and the row's health. */
  readonly lines: readonly string[]
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 120)

const EMPTY: BindOutcome = { created: [], moved: [], updated: [], adopted: [], removed: [], kept: [], lines: [] }

/** One reconciliation of the project's reminders. Never throws. */
export async function reconcile(deps: BindDeps): Promise<BindOutcome> {
  const schedule = deps.schedule()
  if (schedule === undefined) return EMPTY
  const holder = deps.holder()
  const state = deps.state()
  // The board cannot see the holder session clearly: it makes, moves, repairs and removes nothing (design §6.2 item 0).
  if (holder.kind === 'elsewhere' || (holder.kind === 'unknown' && holder.reason === 'holder-unreadable')) return EMPTY
  const zone = (deps.timeZone ?? ((): string => Intl.DateTimeFormat().resolvedOptions().timeZone))()
  const out: {
    created: string[]
    moved: string[]
    updated: string[]
    adopted: string[]
    removed: string[]
    kept: string[]
    lines: string[]
  } = { created: [], moved: [], updated: [], adopted: [], removed: [], kept: [], lines: [] }
  let catalog: readonly ScheduleCatalogEntry[]
  try {
    catalog = await schedule.catalog()
  }
  catch (error) {
    deps.report(`读不出 DSH 的定时任务清单：${message(error)}`, 'degraded')
    return EMPTY
  }
  const byId = new Map(catalog.map(task => [task.id, task]))
  const remover: RemoveDeps = {
    paths: deps.paths,
    schedule,
    now: deps.now,
    ours: () => new Set(Object.values(state.bindings).map(binding => binding.scheduleId)),
    holder: () => holder,
    record: deps.record,
    report: deps.report,
  }
  /** The tasks this pass removed: the catalog it read is from before, so nothing is judged twice. */
  const gone = new Set<string>()
  const drop = async (task: ScheduleCatalogEntry, why: RemoveReason, entry?: string): Promise<boolean> => {
    const result = await removeTask(remover, task, why, entry)
    if (result.kind === 'deleted') {
      out.removed.push(task.id)
      gone.add(task.id)
    }
    else out.kept.push(`${task.id}：${result.why}`)
    return result.kind === 'deleted'
  }

  const items = timeEntries(deps.entries())
  const wanted = new Map(items.map(item => [item.entry.id, item]))

  // Item 0: there is nobody to tell. The reminders of the session the record used to name go, and none is made.
  if (!canDeliver(holder)) {
    const why: RemoveReason = holder.kind === 'archived' ? 'holder-archived' : holder.kind === 'not-found' ? 'holder-not-found' : 'no-holder'
    if (holder.kind === 'none' && !noRecordTwice(state, deps.now())) {
      out.lines.push('还没读到主 Agent 的记录，再看一拍才动那几条提醒')
      return out
    }
    if (!mayRemoveHolderTasks(holder)) return out
    for (const [entry, binding] of Object.entries(state.bindings)) {
      const task = byId.get(binding.scheduleId)
      if (task === undefined) {
        delete state.bindings[entry]
        continue
      }
      if (await drop(task, why, entry)) delete state.bindings[entry]
    }
    return out
  }
  // The record is readable again: the count of reconciliations without one starts over.
  delete state.holderMemory.noRecord
  const session = holder.session
  if (session === undefined) return out

  /**
   * Item 4, first half: a reminder of the board's that no binding names is
   * taken back before anything is made, so a lost state file does not make a
   * second reminder and throw the first one, with its deliveries, away
   * (review F13).
   */
  for (const task of catalog) {
    if (task.status === 'inactive' || !isOurs(new Set(), task)) continue
    const entry = entryIdOfPrompt(task.prompt)
    if (entry === undefined || state.bindings[entry] !== undefined || task.sessionId !== session) continue
    const item = wanted.get(entry)
    if (item === undefined) continue
    state.bindings[entry] = { scheduleId: task.id, sessionId: task.sessionId, specDigest: specDigestOf(item, zone), fingerprint: fingerprintOf(task), ...(task.lastDelivery === undefined ? {} : { deliveredMessageId: task.lastDelivery.messageId }) }
    out.adopted.push(entry)
  }

  for (const item of items) {
    const binding = state.bindings[item.entry.id]
    const selector = selectorOf(item.entry.when, zone)
    if (selector === undefined) continue
    const digest = specDigestOf(item, zone)
    const task = binding === undefined ? undefined : byId.get(binding.scheduleId)
    // A one-shot that has fired stays as DSH left it: inactive, and not made again (design §6.2).
    if (binding?.done === true && task !== undefined) continue
    if (task?.status === 'inactive') {
      state.bindings[item.entry.id] = { ...binding, done: true }
      out.lines.push(`「${item.entry.title}」已跑过（${task.lastDelivery?.deliveredAt ?? task.scheduledAt}）`)
      continue
    }
    // Item 2: the main agent moved. The new reminder is made first, so a crash in between leaves one too many, not none.
    if (task !== undefined && task.sessionId !== session) {
      const made = await create(schedule, session, item, selector, deps)
      if (made === undefined) continue
      state.bindings[item.entry.id] = made
      out.moved.push(item.entry.id)
      await drop(task, 'moved', item.entry.id)
      continue
    }
    // Item 1: nothing is there (a new entry, a new main agent, a task somebody deleted).
    if (task === undefined) {
      const made = await create(schedule, session, item, selector, deps)
      if (made === undefined) continue
      state.bindings[item.entry.id] = made
      out.created.push(item.entry.id)
      continue
    }
    // Item 3: the content does not match. Whose change it was decides what the page says.
    const outside = fingerprintOf(task) !== binding.fingerprint
    if (outside || binding.specDigest !== digest) {
      const repaired = await repair(schedule, session, item, selector, task, digest, deps, drop)
      if (repaired !== undefined) {
        state.bindings[item.entry.id] = repaired
        out.updated.push(item.entry.id)
      }
      if (outside) {
        deps.record({ kind: 'loop-drift', at: new Date(deps.now()).toISOString(), project: deps.paths.projectRoot, entry: item.entry.id, what: 'edited' })
        if (sayOnce(state, task.id, deps.now())) out.lines.push(`「${item.entry.title}」：在 DSH 的自动化任务页里改的不算数，已按循环板改回；要改：跟主 Agent 说`)
      }
      continue
    }
    await afterDue(task, item, binding, deps, state, drop)
  }

  // Item 4, second half: what is left over is removed, once the board can say why.
  const bound = new Set(Object.values(state.bindings).map(binding => binding.scheduleId))
  for (const task of catalog) {
    if (bound.has(task.id) || gone.has(task.id) || task.status === 'inactive') continue
    if (!isOurs(new Set(), task)) continue
    const entry = entryIdOfPrompt(task.prompt)
    if (entry === undefined) continue
    const item = wanted.get(entry)
    if (!mayRemoveHolderTasks(holder) && task.sessionId === session) {
      out.kept.push(`${task.id}：此刻看不清主 Agent 的会话，多出来的提醒先不删`)
      if (sayOnce(state, task.id, deps.now())) out.lines.push('DSH 里多了一条循环板的提醒，此刻不删')
      continue
    }
    if (item !== undefined && task.sessionId !== session) {
      await drop(task, 'moved', entry)
      continue
    }
    if (item !== undefined) {
      await drop(task, 'duplicate', entry)
      continue
    }
    const certain = entryGone(state, entry, deps)
    if (certain) await drop(task, 'entry-gone', entry)
    else out.kept.push(`${task.id}：条目 ${entry} 此刻不在执行表里，先等它`)
  }

  await trim(deps, state)
  return out
}

/** Make one reminder and the binding of it; undefined when the host refused it, which is said once. */
async function create(schedule: ScheduleService, session: string, item: RunnableEntry, selector: ScheduleSelector, deps: BindDeps): Promise<Binding | undefined> {
  try {
    const record = await schedule.create(session, { title: titleOf(item.entry), prompt: promptOf(item), ...selector })
    return { scheduleId: record.id, sessionId: session, specDigest: specDigestOf(item, (deps.timeZone ?? ((): string => Intl.DateTimeFormat().resolvedOptions().timeZone))()), fingerprint: fingerprintOf(record) }
  }
  catch (error) {
    deps.report(`「${item.entry.title}」的到点提醒建不上：${message(error)}`, 'degraded')
    return undefined
  }
}

/**
 * Put one reminder back to what the entry says. The host needs the whole
 * record the caller observed as `expected`, and it must come from `list`: a row
 * of the catalog carries three keys more and the host's whole-key decoding
 * refuses it (schedule:74–77, 1806–1815; review F7).
 */
async function repair(
  schedule: ScheduleService,
  session: string,
  item: RunnableEntry,
  selector: ScheduleSelector,
  task: ScheduleCatalogEntry,
  digest: string,
  deps: BindDeps,
  drop: (task: ScheduleCatalogEntry, why: RemoveReason, entry?: string) => Promise<boolean>,
): Promise<Binding | undefined> {
  const kind = changeKindOf(item.entry.when)
  if (kind === undefined) return undefined
  const base = { scheduleId: task.id, sessionId: session, specDigest: digest }
  try {
    const active = await schedule.list({ sessionId: session })
    const expected = active.find(record => record.id === task.id)
    if (expected === undefined) {
      // DSH no longer has it: nothing to put back, the next reconciliation makes it again.
      const made = await create(schedule, session, item, selector, deps)
      return made === undefined ? undefined : { ...made, specDigest: digest }
    }
    const result = await schedule.update({ sessionId: session, id: task.id, expected, title: titleOf(item.entry), prompt: promptOf(item), change: { kind, ...selector } })
    if (result.updated === true) return { ...base, fingerprint: fingerprintOf(result.record) }
    if (result.code === undefined) return { ...base, fingerprint: fingerprintOf(expected) }
    if (result.code === 'schedule_not_found') {
      const made = await create(schedule, session, item, selector, deps)
      return made === undefined ? undefined : { ...made, specDigest: digest }
    }
    if (!mayRemoveHolderTasks(deps.holder())) {
      deps.report(`DSH 里的「${item.entry.title}」和循环板的不一样，此刻不重建，下一拍再试（${result.code}）`, 'info')
      return undefined
    }
    // The task cannot be put back (a conflict, a rule DSH will not take, an ended task): it goes and is made again.
    if (!await drop(task, 'repair', item.entry.id)) return undefined
    const made = await create(schedule, session, item, selector, deps)
    return made === undefined ? undefined : { ...made, specDigest: digest }
  }
  catch (error) {
    deps.report(`「${item.entry.title}」的到点提醒改不回来：${message(error)}`, 'degraded')
    return undefined
  }
}

/**
 * What the host did with a reminder that was due: a delivery it made is one run
 * of the entry, and five minutes without one is a failure the board delivers
 * itself (the host does not retry until the next write or the next start,
 * schedule:1627–1640; review F25 measures from the later of the due time and
 * the start of this run of the project).
 */
async function afterDue(
  task: ScheduleCatalogEntry,
  item: RunnableEntry,
  binding: Binding,
  deps: BindDeps,
  state: RuntimeState,
  drop: (task: ScheduleCatalogEntry, why: RemoveReason, entry?: string) => Promise<boolean>,
): Promise<void> {
  const iso = (): string => new Date(deps.now()).toISOString()
  const delivery = task.lastDelivery
  if (delivery !== undefined && delivery.messageId !== binding.deliveredMessageId) {
    const run = runId()
    deps.record(firedRecord({ at: iso(), project: deps.paths.projectRoot, run, entry: item.entry, from: item, events: 1 }))
    deps.record({ kind: 'loop-done', at: iso(), project: deps.paths.projectRoot, entry: item.entry.id, run, outcome: 'delivered', delivery: 'dsh', messageId: delivery.messageId })
    state.last[item.entry.id] = { run, at: iso(), outcome: 'delivered' }
    const { dueSince: _dropped, ...rest } = binding
    state.bindings[item.entry.id] = { ...rest, deliveredMessageId: delivery.messageId }
    return
  }
  const due = Date.parse(task.scheduledAt)
  if (!Number.isFinite(due) || due > deps.now()) {
    if (binding.dueSince !== undefined) {
      const { dueSince: _dropped, ...rest } = binding
      state.bindings[item.entry.id] = rest
    }
    return
  }
  const since = Math.max(due, Date.parse(deps.startedAt))
  if (binding.dueSince === undefined) {
    state.bindings[item.entry.id] = { ...binding, dueSince: new Date(since).toISOString() }
    return
  }
  if (deps.now() - Date.parse(binding.dueSince) < NOT_DELIVERED_MS) return
  const run = runId()
  deps.record(firedRecord({ at: iso(), project: deps.paths.projectRoot, run, entry: item.entry, from: item, events: 1, late: true }))
  deps.record({ kind: 'loop-drift', at: iso(), project: deps.paths.projectRoot, entry: item.entry.id, what: 'not-delivered' })
  const text = item.entry.action.kind === 'tell-main' ? item.entry.action.text : item.entry.title
  const wake = item.entry.action.kind === 'tell-main' ? item.entry.action.wake : true
  const told = await deps.deliver({ project: deps.paths.projectRoot, entry: item.entry.id, run, title: item.entry.title, text, wake }).catch((error: unknown) => ({ kind: 'failed' as const, reason: message(error) }))
  deps.record({
    kind: 'loop-done',
    at: iso(),
    project: deps.paths.projectRoot,
    entry: item.entry.id,
    run,
    outcome: told.kind === 'delivered' ? 'delivered' : told.kind === 'held' ? 'held' : 'failed',
    reason: told.kind === 'delivered' ? 'DSH 没投出去，循环板补投了' : told.reason,
    ...(told.kind === 'delivered' ? { delivery: told.how } : {}),
  })
  state.last[item.entry.id] = { run, at: iso(), outcome: told.kind === 'delivered' ? 'delivered' : told.kind }
  const holder = deps.holder()
  if (holder.kind === 'ok' && holder.session !== undefined) {
    // The reminder is replaced, so the host counts its next occurrence from now instead of staying overdue.
    if (await drop(task, 'not-delivered', item.entry.id)) {
      delete state.bindings[item.entry.id]
      const selector = selectorOf(item.entry.when, (deps.timeZone ?? ((): string => Intl.DateTimeFormat().resolvedOptions().timeZone))())
      const schedule = deps.schedule()
      const made = selector === undefined || schedule === undefined ? undefined : await create(schedule, holder.session, item, selector, deps)
      if (made !== undefined) state.bindings[item.entry.id] = made
    }
    return
  }
  const { dueSince: _dropped, ...rest } = binding
  state.bindings[item.entry.id] = rest
}

/** Whether two reconciliations at least a minute apart have now read no holder record (design §6.2 item 0). */
function noRecordTwice(state: RuntimeState, nowMs: number): boolean {
  const seen = state.holderMemory.noRecord
  if (seen === undefined) {
    state.holderMemory.noRecord = { count: 1, at: new Date(nowMs).toISOString() }
    return false
  }
  if (nowMs - Date.parse(seen.at) < ENTRY_GONE_GAP_MS) return seen.count >= 2
  state.holderMemory.noRecord = { count: seen.count + 1, at: new Date(nowMs).toISOString() }
  return seen.count + 1 >= 2
}

/**
 * Whether an entry a reminder names is certainly gone: the person deleted it,
 * or this process has been running the project for five minutes and two
 * reconciliations a minute apart have both missed it. An entry that is only
 * missing because the row that owns it has not handed it over yet is waited
 * for (design §6.2, review F41).
 */
function entryGone(state: RuntimeState, entry: string, deps: BindDeps): boolean {
  if (deps.deleted(entry)) return true
  const now = deps.now()
  if (now - Date.parse(deps.startedAt) < ENTRY_GONE_WARMUP_MS) return false
  const seen = state.missing[entry]
  if (seen === undefined) {
    state.missing[entry] = { since: new Date(now).toISOString(), checks: 1, at: new Date(now).toISOString() }
    return false
  }
  if (now - Date.parse(seen.at) >= ENTRY_GONE_GAP_MS) {
    state.missing[entry] = { since: seen.since, checks: seen.checks + 1, at: new Date(now).toISOString() }
    return seen.checks + 1 >= 2
  }
  return seen.checks >= 2
}

/** Whether the page may write a line about this task today; the same task says the same thing once a day (design §6.2 item 3). */
function sayOnce(state: RuntimeState, scheduleId: string, nowMs: number): boolean {
  const day = new Date(nowMs).toISOString().slice(0, 10)
  if (state.said[scheduleId] === day) return false
  state.said[scheduleId] = day
  return true
}

/** The first reconciliation of a day cuts the lines of `removed-tasks.jsonl` that are older than 30 days. */
async function trim(deps: BindDeps, state: RuntimeState): Promise<void> {
  const day = new Date(deps.now()).toISOString().slice(0, 10)
  if (state.trimmedDay === day) return
  state.trimmedDay = day
  await trimRemovedTasks(deps.paths, deps.io, deps.now())
}
