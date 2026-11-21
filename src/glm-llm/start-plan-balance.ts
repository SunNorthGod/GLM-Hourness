/**
 * Free Start Plan balance reader (ZCode 3.19.1 `zcode-plan/billing/balance`):
 * GET https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=<appVersion>
 * with `Authorization: Bearer <jwt>`.
 *
 * Strictly fail-open: 60s reuse cache, 15s timeout, never throws, and never
 * logs or exposes the bearer token. Handles expired plans where
 * `ends_at <= server_time`.
 */
import { randomUUID } from 'node:crypto'
import { ensureCliDeviceMid } from './device-mid.ts'
import { ZCODE_APP_VERSION } from './identity.ts'
import { cappedText } from './quota.ts'
import { loginFingerprintOf } from './quota-journal.ts'

const START_PLAN_BALANCE_ORIGIN = 'https://zcode.z.ai'
const START_PLAN_BALANCE_PATH = '/api/v1/zcode-plan/billing/balance'
export const START_PLAN_BALANCE_TIMEOUT_MS = 15_000
const REUSE_MS = 60_000

interface StartPlanEntitlement {
  readonly effectiveAt?: number
}

interface StartPlanInfo {
  readonly planId?: string
  readonly userPlanId?: string
  readonly name?: string
  readonly status?: string
  readonly startsAt?: number
  readonly endsAt?: number
  readonly entitlements: readonly StartPlanEntitlement[]
  readonly expired: boolean
}

interface StartPlanBalanceEntry {
  readonly planId?: string
  readonly userPlanId?: string
  readonly showName?: string
  readonly capabilities: readonly string[]
  readonly models: readonly string[]
  readonly remaining?: number
  readonly total?: number
  readonly used?: number
  readonly unit?: string
}

export type StartPlanBalanceRead =
  | {
      readonly ok: true
      readonly at: number
      readonly serverTime?: number
      readonly plans: readonly StartPlanInfo[]
      readonly balances: readonly StartPlanBalanceEntry[]
      readonly active: boolean
      readonly expired: boolean
    }
  | {
      readonly ok: false
      readonly at: number
      readonly reason: string
    }

export interface StartPlanBalanceReaderOptions {
  readonly origin?: string
  readonly appVersion?: string
  readonly deviceMid?: () => Promise<string> | string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => number
  readonly timeoutMs?: number
}

export interface StartPlanBalanceReader {
  read(jwt: string, options?: { readonly waitMs?: number }): Promise<StartPlanBalanceRead>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

function isPlanExpired(endsAt: number | undefined, serverTime: number | undefined): boolean {
  if (endsAt === undefined || serverTime === undefined) return false
  // Normalize if one timestamp is seconds and the other is milliseconds.
  const endNorm = endsAt < 1e12 && serverTime >= 1e12 ? endsAt * 1000 : endsAt
  const srvNorm = serverTime < 1e12 && endsAt >= 1e12 ? serverTime * 1000 : serverTime
  return endNorm <= srvNorm
}

function parsePlan(raw: unknown, serverTime: number | undefined): StartPlanInfo | undefined {
  if (!isRecord(raw)) return undefined
  const planId = nonEmptyString(raw.plan_id)
  const userPlanId = nonEmptyString(raw.user_plan_id)
  const name = nonEmptyString(raw.name)
  const status = nonEmptyString(raw.status)
  const startsAt = finiteNumber(raw.starts_at)
  const endsAt = finiteNumber(raw.ends_at)
  const entitlements = Array.isArray(raw.entitlements)
    ? raw.entitlements.filter(isRecord).map((entry): StartPlanEntitlement => {
        const effectiveAt = finiteNumber(entry.effective_at)
        return effectiveAt === undefined ? {} : { effectiveAt }
      })
    : []
  return {
    ...(planId === undefined ? {} : { planId }),
    ...(userPlanId === undefined ? {} : { userPlanId }),
    ...(name === undefined ? {} : { name }),
    ...(status === undefined ? {} : { status }),
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(endsAt === undefined ? {} : { endsAt }),
    entitlements,
    expired: isPlanExpired(endsAt, serverTime),
  }
}

function parseBalance(raw: unknown): StartPlanBalanceEntry | undefined {
  if (!isRecord(raw)) return undefined
  const planId = nonEmptyString(raw.plan_id)
  const userPlanId = nonEmptyString(raw.user_plan_id)
  const showName = nonEmptyString(raw.show_name) ?? nonEmptyString(raw.name)
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const models = capabilities
    .filter(cap => cap.startsWith('model:'))
    .map(cap => cap.slice('model:'.length))
    .filter(id => id.length > 0)
  const remaining = finiteNumber(raw.remaining_units) ?? finiteNumber(raw.available_units) ?? finiteNumber(raw.remaining) ?? finiteNumber(raw.balance) ?? finiteNumber(raw.available)
  const total = finiteNumber(raw.total_units) ?? finiteNumber(raw.total) ?? finiteNumber(raw.limit) ?? finiteNumber(raw.quota)
  const used = finiteNumber(raw.used_units) ?? finiteNumber(raw.used)
  const unit = nonEmptyString(raw.unit_type) ?? nonEmptyString(raw.unit)
  return {
    ...(planId === undefined ? {} : { planId }),
    ...(userPlanId === undefined ? {} : { userPlanId }),
    ...(showName === undefined ? {} : { showName }),
    capabilities,
    models,
    ...(remaining === undefined ? {} : { remaining }),
    ...(total === undefined ? {} : { total }),
    ...(used === undefined ? {} : { used }),
    ...(unit === undefined ? {} : { unit }),
  }
}

/** Parse a raw balance response body; pure and never throws. */
export function parseStartPlanBalanceBody(text: string, at: number): StartPlanBalanceRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { ok: false, at, reason: 'not-json' }
  }
  if (!isRecord(parsed)) return { ok: false, at, reason: 'invalid-envelope' }
  const code = finiteNumber(parsed.code)
  if (parsed.success === false || (code !== undefined && code !== 0 && code !== 200)) {
    const msg = nonEmptyString(parsed.msg)
    return { ok: false, at, reason: `envelope:${code ?? 'error'}${msg === undefined ? '' : ` ${msg.slice(0, 60)}`}` }
  }
  const data = isRecord(parsed.data) ? parsed.data : undefined
  if (data === undefined) return { ok: false, at, reason: 'missing-data' }
  const serverTime = finiteNumber(data.server_time)
  const plans = Array.isArray(data.plans)
    ? data.plans.map(item => parsePlan(item, serverTime)).filter((item): item is StartPlanInfo => item !== undefined)
    : []
  const balances = Array.isArray(data.balances)
    ? data.balances.map(parseBalance).filter((item): item is StartPlanBalanceEntry => item !== undefined)
    : []
  const expired = plans.length > 0 && plans.every(plan => plan.expired)
  const active = plans.length > 0 ? plans.some(plan => !plan.expired) : balances.length > 0
  return {
    ok: true,
    at,
    ...(serverTime === undefined ? {} : { serverTime }),
    plans,
    balances,
    active,
    expired,
  }
}

export function createStartPlanBalanceReader(options: StartPlanBalanceReaderOptions = {}): StartPlanBalanceReader {
  const origin = (options.origin ?? START_PLAN_BALANCE_ORIGIN).replace(/\/+$/u, '')
  const appVersion = options.appVersion ?? ZCODE_APP_VERSION
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? START_PLAN_BALANCE_TIMEOUT_MS
  const url = `${origin}${START_PLAN_BALANCE_PATH}?app_version=${encodeURIComponent(appVersion)}`

  const resolveDeviceMid = async (): Promise<string> => {
    if (options.deviceMid !== undefined) {
      try {
        const value = await options.deviceMid()
        if (value.trim().length > 0) return value.trim()
      }
      catch { /* fall back below */ }
    }
    try {
      const ensured = await ensureCliDeviceMid()
      if (ensured.value.trim().length > 0) return ensured.value.trim()
    }
    catch { /* fall back below */ }
    return randomUUID()
  }

  let lastFingerprint: string | undefined
  let lastStartedAt: number | undefined
  let lastResult: StartPlanBalanceRead | undefined
  let inflight: { readonly fingerprint: string, readonly job: Promise<StartPlanBalanceRead> } | undefined

  const fetchOnce = async (token: string): Promise<StartPlanBalanceRead> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const bearer = /^Bearer\s+/iu.test(token) ? token : `Bearer ${token}`
    const deviceMid = await resolveDeviceMid()
    try {
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: bearer, 'X-Device-Mid': deviceMid },
          signal: controller.signal,
        })
      }
      catch {
        return { ok: false, at: now(), reason: controller.signal.aborted ? 'timeout' : 'network' }
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => { /* already closed */ })
        return { ok: false, at: now(), reason: `http-${response.status}` }
      }
      let text: string | undefined
      try {
        text = await cappedText(response, controller.signal)
      }
      catch {
        return { ok: false, at: now(), reason: controller.signal.aborted ? 'timeout' : 'network' }
      }
      if (text === undefined) return { ok: false, at: now(), reason: 'too-large' }
      return parseStartPlanBalanceBody(text, now())
    }
    catch {
      return { ok: false, at: now(), reason: 'read-error' }
    }
    finally {
      clearTimeout(timer)
    }
  }

  return {
    async read(jwt: string, readOpts: { readonly waitMs?: number } = {}): Promise<StartPlanBalanceRead> {
      const token = jwt.trim()
      if (token.length === 0) return { ok: false, at: now(), reason: 'missing-jwt' }
      const fingerprint = loginFingerprintOf(token)
      const started = now()

      if (lastFingerprint === fingerprint && lastStartedAt !== undefined && started - lastStartedAt < REUSE_MS && lastResult !== undefined) {
        return lastResult
      }

      let job: Promise<StartPlanBalanceRead>
      if (inflight !== undefined && inflight.fingerprint === fingerprint) {
        job = inflight.job
      }
      else {
        lastFingerprint = fingerprint
        lastStartedAt = started
        const pending = fetchOnce(token).then(result => {
          if (lastFingerprint === fingerprint) lastResult = result
          return result
        }).finally(() => {
          if (inflight?.job === pending) inflight = undefined
        })
        inflight = { fingerprint, job: pending }
        job = pending
      }

      const waitMs = readOpts.waitMs
      if (typeof waitMs !== 'number' || !Number.isFinite(waitMs) || waitMs <= 0) return job
      let timer: ReturnType<typeof setTimeout> | undefined
      const fallback: StartPlanBalanceRead = lastFingerprint === fingerprint && lastResult !== undefined
        ? lastResult
        : { ok: false, at: now(), reason: 'pending' }
      try {
        return await Promise.race([
          job,
          new Promise<StartPlanBalanceRead>(resolve => { timer = setTimeout(() => resolve(fallback), waitMs) }),
        ])
      }
      finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Human-readable status line for `/glm-status`. */
export function formatStartPlanBalanceLine(result: StartPlanBalanceRead): string {
  if (!result.ok) {
    if (result.reason === 'pending') return '免费套餐余额：正在读取，稍后再看'
    return `免费套餐余额：暂不可读（${result.reason}）`
  }
  if (result.expired) {
    const names = result.plans.map(p => p.name ?? p.planId).filter((n): n is string => n !== undefined)
    return `免费套餐余额：已过期${names.length === 0 ? '' : `（${names.join('、')}）`}`
  }
  const activePlans = result.plans.filter(p => !p.expired)
  const expiredKeys = new Set(
    result.plans.filter(p => p.expired).map(p => p.userPlanId ?? p.planId).filter((k): k is string => k !== undefined),
  )
  const activeBalances = result.balances.filter(b => {
    const key = b.userPlanId ?? b.planId
    return key === undefined || !expiredKeys.has(key)
  })
  if (activeBalances.length === 0) {
    const names = activePlans.map(p => p.name ?? p.planId).filter((n): n is string => n !== undefined)
    return names.length === 0 ? '免费套餐余额：无可用额度记录' : `免费套餐余额：${names.join('、')}（有效）`
  }
  const formatUnitCount = (value: number, unit: string | undefined): string => {
    if (unit === 'token') {
      if (value >= 1_000_000) return `${Math.round((value / 1_000_000) * 10) / 10}M`
      if (value >= 1_000) return `${Math.round((value / 1_000) * 10) / 10}K`
    }
    return String(value)
  }
  const parts = activeBalances.map(entry => {
    const label = entry.showName ?? entry.planId ?? '免费额度'
    const unitSuffix = entry.unit ?? ''
    const amount = entry.remaining !== undefined && entry.total !== undefined
      ? `剩余 ${formatUnitCount(entry.remaining, entry.unit)}/${formatUnitCount(entry.total, entry.unit)}${unitSuffix === '' ? '' : ` ${unitSuffix}`}`
      : entry.remaining !== undefined
        ? `剩余 ${formatUnitCount(entry.remaining, entry.unit)}${unitSuffix === '' ? '' : ` ${unitSuffix}`}`
        : entry.used !== undefined
          ? `已用 ${formatUnitCount(entry.used, entry.unit)}${unitSuffix === '' ? '' : ` ${unitSuffix}`}`
          : '可用'
    const models = entry.models.length > 0 ? ` [${entry.models.join(', ')}]` : ''
    return `${label} ${amount}${models}`
  })
  return `免费套餐余额：${parts.join('；')}`
}
