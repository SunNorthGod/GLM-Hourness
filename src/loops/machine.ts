/**
 * The machine-level runner (docs/ORCHESTRATION.md §18.9; loop board design 0.6
 * §3.4 M6-L2 to M6-L5, §4.3, §6.1, §6.4 last paragraphs, §9.1): the account's
 * two channel events, judged in one place for the whole machine, so two host
 * processes do not each read the quota and each tell the main agent.
 *
 * One process runs it: the one that holds `<userHome>/loops/machine/runner.lock`
 * (the project lock's code, lock.ts; this lock is not handed over, since the
 * runner only writes inboxes). It goes for the lock only while the pricing
 * service has a quota reader and the board lists an active machine entry (the
 * GLM channel's `glm:quota-low`, `glm:login-rejected`, channel.ts), and lets it
 * go otherwise. Each beat:
 *
 * - the login (M6-L3): one `quota({waitMs: 0, read: false})`, which sends no
 *   request; a rejection not told yet becomes `channel.login-rejected`, its
 *   `since` the channel's or, without one, the beat that first saw it (kept in
 *   `state.json` as `loginRejectedSince` until the state leaves `rejected`);
 *   back to `ok`, the told rejection is forgotten, so the next one is told;
 * - the quota (M6-L2): the lines the user-level usage journal gained since the
 *   last beat; a GLM record among them, with the last reading and the last read
 *   this runner started both at least `afterUsageMinutes` old, starts exactly
 *   one `quota({waitMs: 3000})`; a window `quotaLowOf` finds low, in a period
 *   not told yet (the window and a reset instant within 120 seconds of the told
 *   one), becomes `channel.quota-low`; every read leaves a `loop-read` in the
 *   metrics journal of the project the event would go to (M6-L5);
 * - where an event goes (M6-L4): the inbox of the project the main agent last
 *   walked in (`last-step.json`, reminder.ts), when that project has a main
 *   agent; the event is appended first and told second, so a crash between
 *   the two tells it again rather than never. An event with nowhere to go
 *   waits in the machine's held list (one per key, at most 10, a day at most)
 *   and is tried again every beat.
 *
 * Nothing here throws into the beat: a file that cannot be read starts from
 * nothing, one that cannot be written is written at the next beat, and each
 * fault is told to the row health.
 */
import { mkdir, open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { auditPaths } from '../memory/audit.ts'
import { writeAtomic, type StoreIo } from '../rules/store.ts'
import { quotaOf, type UsagePricing } from '../shared/pricing.ts'
import { loginLine, quotaLowLine, quotaLowOf, type LoginView, type QuotaView, type QuotaWindowView } from '../shared/quota.ts'
import { isGlmModel } from '../shared/route.ts'
import { CHANNEL_LOGIN_REJECTED, CHANNEL_QUOTA_LOW, loginRejectedKey, quotaLowKey } from './channel.ts'
import { createRunLock, type LockStand, type RunLock } from './lock.ts'
import type { LoopEntry } from './model.ts'
import type { ReadRecord } from './records.ts'
import { machineStepFile, type MachineStepNote } from './reminder.ts'
import type { EmitResult } from './service.ts'

/** How long the quota read of the runner waits (M6-L2). */
export const QUOTA_WAIT_MS = 3_000
/** Two reset instants this close name one period of a window (design §3.4 M6-L2). */
const SAME_PERIOD_MS = 120_000
/** The machine's held events: at most this many, for at most a day (design §6.4). */
const HELD_ROOM = 10
const HELD_MS = 24 * 3_600_000
/** The most of the usage journal one beat reads: only whether a GLM record is among the new lines matters. */
const USAGE_TAIL_BYTES = 1024 * 1024
const HOUR_MS = 3_600_000

/** `<userHome>/loops/machine/`: only the account's two reminders keep anything here (design §9.1). */
export function machinePaths(userHome: string): { readonly dir: string, readonly runner: string, readonly handover: string, readonly state: string, readonly told: string, readonly lastStep: string, readonly usage: string } {
  const dir = join(userHome, 'loops', 'machine')
  return {
    dir,
    runner: join(dir, 'runner.lock'),
    // The machine lock is never handed over; the file is only where the lock's code would look.
    handover: join(dir, 'handover.json'),
    state: join(dir, 'state.json'),
    told: join(dir, 'told.json'),
    lastStep: machineStepFile(userHome),
    usage: auditPaths({ userHome }).usage ?? join(userHome, 'audit', 'usage.jsonl'),
  }
}

/** One account-level event the runner derived and has not handed to a project yet. */
interface HeldEvent {
  readonly at: string
  readonly event: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  /** What `told.json` gets once the event is in an inbox. */
  readonly mark: ToldMark
}

type ToldMark =
  | { readonly kind: 'login', readonly key: string, readonly since: string }
  | { readonly kind: 'quota', readonly key: string, readonly window: string, readonly period: string, readonly resetAt?: number }

interface MachineState {
  /** The login state of the last beat. */
  login?: LoginView['state']
  /** The beat that first saw this rejection, when the channel gives no `since` (design §4.3, review F38). */
  loginRejectedSince?: string
  /** How far the usage journal has been read, in bytes. */
  usageBytes?: number
  /** When this runner last started a quota read. */
  quotaReadAt?: number
  held: HeldEvent[]
}

interface ToldFile {
  login?: { readonly key: string, readonly since: string }
  quota: Array<{ readonly key: string, readonly window: string, readonly period: string, readonly resetAt?: number, readonly at: string }>
}

export interface MachineDeps {
  readonly userHome: string
  readonly io: StoreIo
  readonly now: () => number
  readonly pid: number
  readonly boot: () => number
  /** The pricing service now; undefined while the channel package's glm-login row is off. */
  readonly pricing: () => UsagePricing | undefined
  /** The board's active entries with the machine scope (the channel's two, channel.ts). */
  readonly entries: () => readonly LoopEntry[]
  /** Whether the project has a main agent now (its holder record). */
  readonly hasHolder: (project: string) => boolean
  /** Append one event to the project's inbox, through that project's runtime. */
  readonly emit: (project: string, event: { readonly event: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }) => Promise<EmitResult>
  /** One `loop-read` record, into the project's metrics journal. */
  readonly record: (record: ReadRecord) => void
  readonly report: (text: string, level: 'info' | 'degraded') => void
}

export interface MachineRunner {
  beat(): Promise<void>
  /** Where the machine lock stands after the last beat; `off` while there is nothing to run. */
  stand(): LockStand | { readonly kind: 'off' }
  stop(): Promise<void>
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

async function readJson(file: string): Promise<unknown> {
  try {
    const handle = await open(file, 'r')
    try {
      return JSON.parse(await handle.readFile('utf8')) as unknown
    }
    finally {
      await handle.close()
    }
  }
  catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined

function stateOf(value: unknown): MachineState {
  if (!isRecord(value)) return { held: [] }
  const login = value.login === 'ok' || value.login === 'rejected' || value.login === 'absent' ? value.login : undefined
  const since = text(value.loginRejectedSince)
  const bytes = finite(value.usageBytes)
  const readAt = finite(value.quotaReadAt)
  const held = Array.isArray(value.held) ? value.held.filter((item): item is HeldEvent => isRecord(item) && typeof item.event === 'string' && typeof item.key === 'string' && isRecord(item.payload) && isRecord(item.mark) && typeof item.at === 'string') : []
  return { ...(login === undefined ? {} : { login }), ...(since === undefined ? {} : { loginRejectedSince: since }), ...(bytes === undefined ? {} : { usageBytes: bytes }), ...(readAt === undefined ? {} : { quotaReadAt: readAt }), held }
}

function toldOf(value: unknown): ToldFile {
  if (!isRecord(value)) return { quota: [] }
  const login = isRecord(value.login) && typeof value.login.key === 'string' && typeof value.login.since === 'string' ? { key: value.login.key, since: value.login.since } : undefined
  const quota = Array.isArray(value.quota) ? value.quota.filter((item): item is ToldFile['quota'][number] => isRecord(item) && typeof item.key === 'string' && typeof item.window === 'string' && typeof item.period === 'string' && typeof item.at === 'string') : []
  return { ...(login === undefined ? {} : { login }), quota }
}

/** The project the main agent last walked in (design §6.1), or undefined when the note cannot be read. */
async function lastProject(file: string): Promise<string | undefined> {
  const note = await readJson(file) as Partial<MachineStepNote> | undefined
  return typeof note?.project === 'string' && note.project !== '' ? note.project : undefined
}

const iso = (ms: number): string => new Date(ms).toISOString()

export function createMachineRunner(deps: MachineDeps): MachineRunner {
  const paths = machinePaths(deps.userHome)
  let lock: RunLock | undefined
  let current: LockStand | { readonly kind: 'off' } = { kind: 'off' }
  let state: MachineState | undefined
  let told: ToldFile | undefined
  let dirMade = false
  let saved = ''
  let toldSaved = ''

  const lockOf = (): RunLock => {
    lock ??= createRunLock({
      paths,
      io: deps.io,
      now: deps.now,
      pid: deps.pid,
      boot: deps.boot,
      // The machine lock stays where it is: nothing of it has to be delivered in one process rather than another.
      holderHere: () => undefined,
      busy: () => undefined,
      record: () => {},
    })
    return lock
  }

  /** The machine entries that listen to one of the two events. */
  const listening = (event: string): readonly LoopEntry[] => deps.entries().filter(entry => entry.when.kind === 'event' && entry.when.events.includes(event))

  async function save(): Promise<void> {
    if (state === undefined || told === undefined) return
    const stateText = `${JSON.stringify(state, null, 2)}\n`
    if (stateText !== saved) {
      const written = await writeAtomic(paths.state, stateText, deps.io)
      if (written.ok) saved = stateText
      else deps.report('机器一级的 state.json 换不上去，下一拍再写', 'info')
    }
    const toldText = `${JSON.stringify(told, null, 2)}\n`
    if (toldText !== toldSaved) {
      const written = await writeAtomic(paths.told, toldText, deps.io)
      if (written.ok) toldSaved = toldText
      else deps.report('机器一级的 told.json 换不上去，下一拍再写', 'info')
    }
  }

  /** Remember one event as told: the project's inbox has it. */
  function remember(mark: ToldMark): void {
    if (told === undefined) return
    if (mark.kind === 'login') told.login = { key: mark.key, since: mark.since }
    else told.quota = [...told.quota.filter(item => item.key !== mark.key), { key: mark.key, window: mark.window, period: mark.period, ...(mark.resetAt === undefined ? {} : { resetAt: mark.resetAt }), at: iso(deps.now()) }]
  }

  const isTold = (key: string): boolean => told?.login?.key === key || told?.quota.some(item => item.key === key) === true

  /** Hand one event to the project of the last walk, or keep it in the machine's held list (design §6.4). */
  async function deliver(event: HeldEvent, project: string | undefined): Promise<boolean> {
    if (project === undefined || !deps.hasHolder(project)) return false
    const result = await deps.emit(project, { event: event.event, key: event.key, payload: event.payload }).catch((error: unknown): EmitResult => ({ ok: false, code: 'io', message: message(error) }))
    if (!result.ok) {
      deps.report(`没能把「${event.event}」交给 ${project}：${result.message}`, 'info')
      return false
    }
    remember(event.mark)
    return true
  }

  function hold(event: HeldEvent): void {
    if (state === undefined) return
    if (state.held.some(item => item.key === event.key)) return
    state.held.push(event)
    if (state.held.length > HELD_ROOM) {
      const dropped = state.held.shift()
      if (dropped !== undefined) deps.report(`机器一级存着的事件超过 ${HELD_ROOM} 件，最早的「${dropped.event}」作废了`, 'info')
    }
  }

  /** The held events again, oldest first; a day without a project to take them ends them. */
  async function retryHeld(project: string | undefined): Promise<void> {
    if (state === undefined) return
    const kept: HeldEvent[] = []
    for (const item of state.held) {
      if (deps.now() - Date.parse(item.at) >= HELD_MS) {
        deps.report(`「${item.event}」存了一天还没有主 Agent 能收，作废了`, 'info')
        continue
      }
      if (isTold(item.key)) continue
      if (!await deliver(item, project)) kept.push(item)
    }
    state.held = kept
  }

  async function put(event: HeldEvent, project: string | undefined): Promise<void> {
    if (isTold(event.key) || state?.held.some(item => item.key === event.key) === true) return
    if (!await deliver(event, project)) hold(event)
  }

  /** The login (M6-L3): what the channel says now, with no request sent. */
  async function login(view: QuotaView, project: string | undefined): Promise<void> {
    if (state === undefined || told === undefined) return
    const now = deps.now()
    const login = view.login
    state.login = login.state
    if (login.state !== 'rejected') {
      delete state.loginRejectedSince
      // Back to ok: the rejection told is forgotten, so the next one is told again (design §3.4 M6-L3).
      if (login.state === 'ok') delete told.login
      return
    }
    state.loginRejectedSince ??= iso(now)
    const since = login.since === undefined ? state.loginRejectedSince : iso(login.since)
    const key = loginRejectedKey(login.path ?? '', since)
    await put({
      at: iso(now),
      event: CHANNEL_LOGIN_REJECTED,
      key,
      payload: { since, path: login.path ?? '', line: loginLine(login, now) },
      mark: { kind: 'login', key, since },
    }, project)
  }

  /** Whether the usage journal gained a GLM record since the last beat; the first beat only notes where the journal ends. */
  async function glmUsage(): Promise<boolean> {
    if (state === undefined) return false
    const size = await stat(paths.usage).then(found => found.size).catch(() => 0)
    const from = state.usageBytes
    if (from === undefined || size < from) {
      // The first look reads nothing old, and a journal that was emptied is read from its top at the next beat.
      state.usageBytes = from === undefined ? size : 0
      return false
    }
    if (size === from) return false
    const start = Math.max(from, size - USAGE_TAIL_BYTES)
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(paths.usage, 'r')
      const bytes = Buffer.alloc(size - start)
      await handle.read(bytes, 0, bytes.length, start)
      const body = bytes.toString('utf8')
      const end = body.lastIndexOf('\n')
      // A last line still being written waits for the next beat.
      if (end < 0) return false
      state.usageBytes = start + Buffer.byteLength(body.slice(0, end + 1), 'utf8')
      const lines = body.slice(0, end).split('\n')
      if (start > from) lines.shift()
      return lines.some((line) => {
        try {
          const record = JSON.parse(line) as { readonly model?: unknown } | null
          return isGlmModel(record?.model)
        }
        catch {
          return false
        }
      })
    }
    catch (error) {
      deps.report(`读不出用量流水：${message(error)}`, 'info')
      return false
    }
    finally {
      await handle?.close().catch(() => {})
    }
  }

  /** The period a low window belongs to: the reset instant told for it when this one is within two minutes of it, else this one, else the hour of the reading. */
  function periodOf(window: QuotaWindowView, readingAt: number): { readonly period: string, readonly resetAt?: number } {
    if (window.resetAt === undefined) return { period: iso(Math.floor(readingAt / HOUR_MS) * HOUR_MS) }
    const same = told?.quota.find(item => item.window === window.name && item.resetAt !== undefined && Math.abs(item.resetAt - window.resetAt!) <= SAME_PERIOD_MS)
    return same === undefined ? { period: iso(window.resetAt), resetAt: window.resetAt } : { period: same.period, resetAt: same.resetAt ?? window.resetAt }
  }

  /** The quota (M6-L2): one read when GLM was used and the last reading is old enough, then the windows against each entry's rule. */
  async function quota(read: (request?: { waitMs?: number, read?: boolean }) => Promise<QuotaView>, cached: QuotaView, entries: readonly LoopEntry[], project: string | undefined): Promise<void> {
    if (state === undefined) return
    if (!await glmUsage()) return
    const now = deps.now()
    const thresholdMs = Math.min(...entries.map(entry => {
      const minutes = entry.when.kind === 'event' ? entry.when.params?.afterUsageMinutes : undefined
      return (typeof minutes === 'number' ? minutes : 15) * 60_000
    }))
    const lastReading = cached.reading?.at
    if (lastReading !== undefined && now - lastReading < thresholdMs) return
    if (state.quotaReadAt !== undefined && now - state.quotaReadAt < thresholdMs) return
    state.quotaReadAt = now
    const started = deps.now()
    let view: QuotaView | undefined
    try {
      view = await read({ waitMs: QUOTA_WAIT_MS })
    }
    catch (error) {
      deps.report(`读 GLM 额度失败：${message(error)}`, 'info')
    }
    const ms = Math.max(0, Math.round(deps.now() - started))
    const ok = view?.reading !== undefined && view.failure === undefined && !view.pending
    for (const entry of entries) {
      const params = entry.when.kind === 'event' ? entry.when.params : undefined
      const rule = { usedPercent: typeof params?.usedPercent === 'number' ? params.usedPercent : 100, exhaustsWithinMinutes: typeof params?.exhaustsWithinMinutes === 'number' ? params.exhaustsWithinMinutes : 0 }
      const low = view === undefined ? undefined : quotaLowOf(view, rule, deps.now())
      if (project === undefined) deps.report('额度读了一次，可还没有主 Agent 走过步的项目，这一次的记录没地方写', 'info')
      else deps.record({ kind: 'loop-read', at: iso(deps.now()), project, entry: entry.id, ok, ms, hit: low !== undefined })
      if (low === undefined || view?.reading === undefined) continue
      const { period, resetAt } = periodOf(low, view.reading.at)
      const key = quotaLowKey(low.name, period)
      await put({
        at: iso(deps.now()),
        event: CHANNEL_QUOTA_LOW,
        key,
        payload: {
          window: low.name,
          ...(low.usedPercent === undefined ? {} : { usedPercent: low.usedPercent }),
          ...(low.resetAt === undefined ? {} : { resetAt: iso(low.resetAt) }),
          line: quotaLowLine(low, deps.now()),
        },
        mark: { kind: 'quota', key, window: low.name, period, ...(resetAt === undefined ? {} : { resetAt }) },
      }, project)
    }
  }

  async function off(): Promise<void> {
    if (current.kind === 'held') await save()
    current = { kind: 'off' }
    await lock?.release()
  }

  return {
    stand: () => current,
    async beat() {
      try {
        const pricing = deps.pricing()
        const read = pricing === undefined ? undefined : quotaOf(pricing)
        const loginEntries = listening(CHANNEL_LOGIN_REJECTED)
        const quotaEntries = listening(CHANNEL_QUOTA_LOW)
        if (read === undefined || loginEntries.length + quotaEntries.length === 0) {
          // Nothing of the account to judge in this process now: the lock goes to whoever needs it.
          if (current.kind !== 'off') await off()
          return
        }
        if (!dirMade) {
          await mkdir(paths.dir, { recursive: true })
          dirMade = true
        }
        current = await lockOf().beat()
        if (current.kind === 'fault') deps.report(`机器一级的运行锁：${current.reason}`, 'degraded')
        if (current.kind !== 'held') return
        state ??= stateOf(await readJson(paths.state))
        told ??= toldOf(await readJson(paths.told))
        const project = await lastProject(paths.lastStep)
        await retryHeld(project)
        const cached = await read({ waitMs: 0, read: false })
        if (loginEntries.length > 0) await login(cached, project)
        if (quotaEntries.length > 0) await quota(read, cached, quotaEntries, project)
        await save()
      }
      catch (error) {
        deps.report(`机器一级的运行者这一拍出错：${message(error)}`, 'degraded')
      }
    },
    async stop() {
      try {
        await off()
      }
      catch {
        // A lock left behind is taken over after three minutes.
      }
    },
  }
}
