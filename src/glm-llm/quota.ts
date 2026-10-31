/**
 * The quota reader of the GLM channel (docs/DESIGN.md §4): what the
 * BigModel monitor endpoint says about the five-hour, weekly and MCP windows
 * of the coding plan, the projection of when a window runs out, and the
 * state of the login. It serves the pricing service's `quota` member to the
 * orchestration package and the `/glm-status` section.
 *
 * The request is the one the desktop client makes for its usage page (3.17.1
 * `BigModelUsageQuotaProvider`): a GET with exactly two headers,
 * `authorization` (the project access token as it is, without `Bearer `) and
 * `x-request-id` (a new UUID per read), no identity headers, no retry, and no
 * new token on a 401. Nothing here runs on a timer: a read starts when a
 * caller asks, at most once in 60 seconds, and a caller waits at most the
 * `waitMs` it gives. A failed read is a line of the view with its reason, a
 * record in the quota journal and one console warning per reason (not being
 * logged in is the state of a new install: the line and the row health say
 * it, the console does not, and the experience plan is no failure at all);
 * it never throws and never changes a request.
 */
import { randomUUID } from 'node:crypto'
import { formatMoment, type LoginView, type MomentZone, type QuotaReading, type QuotaRequest, type QuotaView, type QuotaWindowView } from '../shared/quota.ts'
import { rateShareAt } from './credits.ts'
import type { QuotaJournal, QuotaRecord, StoredRecord } from './quota-journal.ts'
import { nameWindows, parseQuotaBody, type NamedWindow } from './quota-parse.ts'
import { projectWindow, samePeriod, type WindowPoint, type WindowState } from './quota-projection.ts'
import { BIGMODEL_API_ORIGIN } from './zcode-wire.ts'
import type { LoginIdentity } from './zcode.ts'

export const QUOTA_URL = `${BIGMODEL_API_ORIGIN}/api/monitor/usage/quota/limit`

/** A read that has not answered by now is abandoned. */
export const QUOTA_TIMEOUT_MS = 15_000
/** A read is not started again within this long of the last start. */
const REUSE_MS = 60_000
const RESPONSE_MAX_BYTES = 256 * 1024
/** The same failure reason is recorded once in this long. */
const FAILURE_RECORD_INTERVAL_MS = 10 * 60_000
const WAIT_MAX_MS = 15_000
/** Earlier readings kept for a projection. */
const HISTORY_MAX = 32
const JOURNAL_LARGE_BYTES = 8 * 1024 * 1024

/** What the reader needs of the channel adapter. */
interface QuotaCredentials {
  usageAuthorization(): Promise<string>
  loginIdentity(): Promise<LoginIdentity>
}

export interface QuotaReaderOptions {
  readonly adapter: QuotaCredentials
  readonly journal: QuotaJournal
  readonly fetchImpl?: typeof fetch
  /** Epoch milliseconds; default `Date.now`. */
  readonly now?: () => number
  /** Words the clock in the label of an unnamed window. */
  readonly zone?: MomentZone
  /** The deadline of one read; default `QUOTA_TIMEOUT_MS`. */
  readonly timeoutMs?: number
}

/** What the row health says about the quota (`quotaHealthText`). */
export interface QuotaHealth {
  /** When the last successful reading was taken. */
  readonly readAt?: number
  /** The reason code of a failure newer than that reading. */
  readonly failure?: string
  readonly loginRejected: boolean
  readonly credentialUnreadable: boolean
  readonly credentialStatError?: string
  /** Lines of the journal that could not be read as records. */
  readonly skippedLines: number
  readonly journalBytes: number
}

export interface QuotaReader {
  /** Start or join a read when one is due, wait for it up to `waitMs`, and return the view. Never throws. */
  view(request?: QuotaRequest): Promise<QuotaView>
  /** The quota state as of the latest `view`. */
  health(): QuotaHealth
}

const FAILURE_WORDS: Readonly<Record<string, string>> = {
  'start-plan': '额度：体验套餐没有 5 小时与周额度',
  'not-logged-in': '额度：未登录 GLM（/glm-login）',
  network: '额度：读不到（网络错误）',
  timeout: '额度：读不到（15 秒没有响应）',
  'http-401': '额度：令牌被拒（401）；令牌到期换新后再读，或运行 /glm-login',
  'too-large': '额度：读不到（响应过大）',
  'no-windows': '额度：服务端没有返回可识别的窗口',
}

/** The line a failure reason goes by in the quota section. */
function failureText(reason: string): string {
  const known = FAILURE_WORDS[reason]
  if (known !== undefined) return known
  if (reason.startsWith('credential:')) return `额度：项目令牌拿不到（${reason.slice('credential:'.length)}），运行 /glm-login`
  if (reason.startsWith('http-')) return `额度：读不到（服务端返回 ${reason.slice('http-'.length)}）`
  if (reason.startsWith('envelope:')) return `额度：服务端拒绝（${reason.slice('envelope:'.length)}）`
  return `额度：读不到（${reason}）`
}

/** The words the row health appends: the last reading or why there is none, a refused login, and what is wrong with the files. */
export function quotaHealthText(health: QuotaHealth, now: number, zone?: MomentZone): string {
  const parts: string[] = []
  if (health.failure === 'start-plan') parts.push('额度：体验套餐没有 5 小时与周额度')
  else if (health.failure !== undefined) parts.push(`额度：读不到（${health.failure}）`)
  else if (health.readAt !== undefined) parts.push(`额度：读于 ${formatMoment(health.readAt, now, zone)}`)
  if (health.loginRejected) parts.push('登录被拒')
  if (health.credentialUnreadable) parts.push('凭证文件读不出，运行 /glm-login')
  if (health.credentialStatError !== undefined) parts.push(`凭证文件状态读不出（${health.credentialStatError.slice(0, 80)}）`)
  if (health.skippedLines > 0) parts.push(`额度流水有 ${health.skippedLines} 行读不懂`)
  if (health.journalBytes >= JOURNAL_LARGE_BYTES) parts.push('额度流水已到 8 MiB，轮换要另行设计')
  return parts.join('；')
}

type ReadingEntry = StoredRecord & { readonly record: Extract<QuotaRecord, { readonly kind: 'reading' }> }

const isReading = (entry: StoredRecord): entry is ReadingEntry => entry.record.kind === 'reading'

/** Reject when `signal` aborts before `work` settles. */
function until<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => reject(new Error('aborted'))
    if (signal.aborted) {
      aborted()
      return
    }
    signal.addEventListener('abort', aborted, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}

/** The response text, or undefined when it is longer than the cap. */
async function cappedText(response: Response, signal: AbortSignal): Promise<string | undefined> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > RESPONSE_MAX_BYTES) {
    await response.body?.cancel().catch(() => { /* already closed */ })
    return undefined
  }
  if (response.body === null) {
    const text = await until(response.text(), signal)
    return Buffer.byteLength(text, 'utf8') > RESPONSE_MAX_BYTES ? undefined : text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await until(reader.read(), signal)
      if (done) break
      total += value.byteLength
      if (total > RESPONSE_MAX_BYTES) return undefined
      chunks.push(value)
    }
  }
  finally {
    await reader.cancel().catch(() => { /* already closed */ })
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** The reason code a failed `usageAuthorization` goes by. */
function credentialReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message === 'start-plan' || message === 'not-logged-in' ? message : `credential:${message.slice(0, 100)}`
}

/** The reading of a stored record, with a projection for each window. */
function readingOf(latest: ReadingEntry, earlier: readonly ReadingEntry[], zone: MomentZone | undefined): QuotaReading {
  const stateOf = (window: NamedWindow): WindowState => ({
    name: window.name,
    ...(window.row.percentage === undefined ? {} : { usedPercent: window.row.percentage }),
    ...(window.row.nextResetTime === undefined ? {} : { resetAt: window.row.nextResetTime }),
  })
  const history = earlier.map(entry => ({ atMs: entry.atMs, windows: nameWindows(entry.record.limits, entry.atMs, zone).map(stateOf) }))
  const windows = nameWindows(latest.record.limits, latest.atMs, zone).map((window): QuotaWindowView => {
    const state = stateOf(window)
    const points = history.flatMap(({ atMs, windows: before }): WindowPoint[] => before
      .filter(other => other.usedPercent !== undefined && samePeriod(other, state))
      .map(other => ({ at: atMs, usedPercent: other.usedPercent ?? 0 })))
    return {
      name: window.name,
      label: window.label,
      ...(state.usedPercent === undefined ? {} : { usedPercent: state.usedPercent }),
      ...(state.resetAt === undefined ? {} : { resetAt: state.resetAt }),
      projection: projectWindow(state, latest.atMs, points, rateShareAt),
    }
  })
  return { at: latest.atMs, ...(latest.record.level === undefined ? {} : { level: latest.record.level }), windows }
}

/** The newest of some stored records of one kind (the later one when times tie). */
function newest<T extends StoredRecord>(entries: readonly T[]): T | undefined {
  return entries.reduce<T | undefined>((best, entry) => (best === undefined || entry.atMs >= best.atMs ? entry : best), undefined)
}

export function createQuotaReader(options: QuotaReaderOptions): QuotaReader {
  const { adapter, journal, zone } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? QUOTA_TIMEOUT_MS
  let inflight: Promise<void> | undefined
  let lastStartedAt: number | undefined
  /** The latest failure of this reader, with its words (the journal keeps the reason only). */
  let lastFailure: { readonly at: number, readonly reason: string, readonly text: string } | undefined
  const recordedFailures = new Map<string, number>()
  const warned = new Set<string>()
  let composed: { readonly key: string, readonly reading: QuotaReading } | undefined
  let health: QuotaHealth = { loginRejected: false, credentialUnreadable: false, skippedLines: 0, journalBytes: 0 }

  const fail = async (reason: string, text: string, keys?: readonly string[]): Promise<void> => {
    const at = now()
    lastFailure = { at, reason, text }
    if (reason === 'start-plan') return
    // Not being logged in is the state of a new install, said by the line and the row health; the console speaks of failures.
    if (reason !== 'not-logged-in' && !warned.has(reason)) {
      warned.add(reason)
      console.warn(`dsh-glm-hourness/glm-login: quota not read (${reason}): ${text}`)
    }
    const last = recordedFailures.get(reason)
    if (last !== undefined && at - last < FAILURE_RECORD_INTERVAL_MS) return
    recordedFailures.set(reason, at)
    await journal.append({ at: new Date(at).toISOString(), kind: 'failure', reason, ...(keys === undefined || keys.length === 0 ? {} : { keys }) })
  }

  const failWith = (reason: string): Promise<void> => fail(reason, failureText(reason))

  const requestQuota = async (authorization: string): Promise<void> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    /** A read that did not answer: out of time, or the network failed. */
    const unreachable = (): Promise<void> => failWith(controller.signal.aborted ? 'timeout' : 'network')
    try {
      let response: Response
      try {
        response = await until(fetchImpl(QUOTA_URL, { method: 'GET', headers: { authorization, 'x-request-id': randomUUID() }, signal: controller.signal }), controller.signal)
      }
      catch {
        await unreachable()
        return
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => { /* already closed */ })
        await failWith(`http-${response.status}`)
        return
      }
      let text: string | undefined
      try {
        text = await cappedText(response, controller.signal)
      }
      catch {
        await unreachable()
        return
      }
      if (text === undefined) {
        await failWith('too-large')
        return
      }
      const at = now()
      const parsed = parseQuotaBody(text, at)
      if (!parsed.ok) {
        await fail(parsed.reason, parsed.text, parsed.keys)
        return
      }
      await journal.append({
        at: new Date(at).toISOString(),
        kind: 'reading',
        ...(parsed.level === undefined ? {} : { level: parsed.level }),
        limits: parsed.limits,
        dropped: parsed.dropped,
        ...(parsed.dropped > 0 && parsed.keys.length > 0 ? { keys: parsed.keys } : {}),
      })
    }
    finally {
      clearTimeout(timer)
    }
  }

  const readOnce = async (): Promise<void> => {
    try {
      let authorization: string
      try {
        authorization = await adapter.usageAuthorization()
      }
      catch (error) {
        await failWith(credentialReason(error))
        return
      }
      await requestQuota(authorization)
    }
    catch (error) {
      await fail('read-error', `额度：读取出错（${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}）`)
    }
  }

  /** The read in progress, a new one when one is due, or nothing; boxed, so that the async function does not wait for it. */
  const readDue = async (): Promise<{ readonly job: Promise<void> } | undefined> => {
    if (inflight !== undefined) return { job: inflight }
    const { records } = await journal.read()
    if (inflight !== undefined) return { job: inflight }
    const started = now()
    if (lastStartedAt !== undefined && started - lastStartedAt < REUSE_MS) {
      const limit = newest(records.filter(entry => entry.record.kind === 'upstream-limit'))
      if (limit === undefined || limit.atMs <= lastStartedAt) return undefined
    }
    lastStartedAt = started
    inflight = readOnce().finally(() => { inflight = undefined })
    return { job: inflight }
  }

  const loginOf = (identity: LoginIdentity, records: readonly StoredRecord[], readingAt: number | undefined): LoginView => {
    if (identity.kind === 'absent') return { state: 'absent' }
    if (identity.kind === 'unknown') return { state: 'ok' }
    const refused = newest(records.filter(entry => entry.record.kind === 'login-rejected'))
    if (refused?.record.kind !== 'login-rejected' || refused.record.login !== identity.fingerprint) return { state: 'ok' }
    if (readingAt !== undefined && refused.atMs <= readingAt) return { state: 'ok' }
    return { state: 'rejected', since: refused.atMs, path: refused.record.path }
  }

  const compose = async (): Promise<QuotaView> => {
    const [journalRead, identity] = await Promise.all([
      journal.read(),
      adapter.loginIdentity().catch((error: unknown): LoginIdentity => ({ kind: 'unknown', reason: error instanceof Error ? error.message : String(error) })),
    ])
    const readings = journalRead.records.filter(isReading).sort((a, b) => a.atMs - b.atMs).slice(-(HISTORY_MAX + 1))
    const latest = readings.at(-1)
    const key = `${latest?.atMs ?? ''}:${readings.length}`
    if (latest !== undefined && composed?.key !== key) composed = { key, reading: readingOf(latest, readings.slice(0, -1), zone) }
    const reading = latest === undefined ? undefined : composed?.reading
    const after = (atMs: number): boolean => latest === undefined || atMs > latest.atMs
    // This reader's own latest failure has the words the journal does not keep; the journal's may come from another process.
    const journalled = newest(journalRead.records.filter(entry => entry.record.kind === 'failure'))
    const stored = journalled?.record.kind === 'failure' ? { at: journalled.atMs, reason: journalled.record.reason, text: failureText(journalled.record.reason) } : undefined
    const newer = lastFailure !== undefined && (stored === undefined || lastFailure.at >= stored.at) ? lastFailure : stored
    const failure = newer !== undefined && after(newer.at) ? newer : undefined
    const limit = newest(journalRead.records.filter(entry => entry.record.kind === 'upstream-limit'))
    const limited = limit?.record.kind === 'upstream-limit' && after(limit.atMs)
      ? { at: limit.atMs, code: limit.record.code, ...(limit.record.until === undefined ? {} : { until: Date.parse(limit.record.until) }) }
      : undefined
    const login = loginOf(identity, journalRead.records, latest?.atMs)
    health = {
      ...(latest === undefined ? {} : { readAt: latest.atMs }),
      ...(failure === undefined ? {} : { failure: failure.reason }),
      loginRejected: login.state === 'rejected',
      credentialUnreadable: identity.kind === 'absent' && identity.unreadable === true,
      ...(identity.kind === 'unknown' ? { credentialStatError: identity.reason } : {}),
      skippedLines: journalRead.skipped,
      journalBytes: journalRead.size,
    }
    return {
      ...(reading === undefined ? {} : { reading }),
      ...(failure === undefined ? {} : { failure }),
      ...(limited === undefined ? {} : { limited }),
      login,
      pending: inflight !== undefined,
    }
  }

  return {
    health: () => health,
    async view(request: QuotaRequest = {}): Promise<QuotaView> {
      const wait = typeof request.waitMs === 'number' && Number.isFinite(request.waitMs) ? Math.min(Math.max(request.waitMs, 0), WAIT_MAX_MS) : 0
      if (request.read !== false) {
        const due = await readDue()
        if (due !== undefined && wait > 0) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const waited = new Promise<void>(resolve => { timer = setTimeout(resolve, wait) })
          try {
            await Promise.race([due.job, waited])
          }
          finally {
            clearTimeout(timer)
          }
        }
      }
      return compose()
    },
  }
}
