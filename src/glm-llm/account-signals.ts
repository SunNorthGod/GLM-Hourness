/**
 * What the failures of the model route and of the token mint say about the
 * account (docs/DESIGN.md §4.6, §4.9): the quota is spent (a 429 with one of
 * BigModel's limit codes) or the login was refused (the mint answered 401 or
 * 403). Pure functions; the adapter writes the journal records.
 */
import type { StartPlanFailoverReason } from '../shared/start-plan-status.ts'
import { PROJECT_TOKEN_CODES, PROJECT_TOKEN_HTTP_CODE_PREFIX } from './zcode-wire.ts'

/** 1308 usage limit reached, 1310 weekly or monthly limit, 1316-1321 the team and sub-account limits (docs/FACTS.md §2.5). */
const LIMIT_CODES: ReadonlySet<string> = new Set(['1308', '1310', '1316', '1317', '1318', '1319', '1320', '1321'])
/** A body longer than this is not parsed. */
const BODY_MAX = 64 * 1024
const MESSAGE_MAX = 400
/** The recovery time of a message is read as UTC+8, the plan's zone. */
const PLAN_OFFSET_MS = 8 * 3_600_000
/** A recovery time further ahead than this is not believed. */
const HORIZON_MS = 8 * 86_400_000
const TIME_IN_MESSAGE = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The first `YYYY-MM-DD HH:MM[:SS]` (or with a `T`) in the message as epoch milliseconds, when it is a real time within [nowMs, nowMs + 8 days]. */
function recoveryTime(message: string, nowMs: number): number | undefined {
  const match = TIME_IN_MESSAGE.exec(message)
  if (match === null) return undefined
  const [year, month, day, hour, minute, second] = match.slice(1).map(part => (part === undefined ? 0 : Number(part)))
  const utc = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0)
  const check = new Date(utc)
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === (month ?? 1) - 1 && check.getUTCDate() === day
    && check.getUTCHours() === hour && check.getUTCMinutes() === minute && check.getUTCSeconds() === second
  const at = utc - PLAN_OFFSET_MS
  return real && at >= nowMs && at <= nowMs + HORIZON_MS ? at : undefined
}

/**
 * The limit a 429 body announces: `{"error": {"code": "1308", "message": …}}`
 * with a code of the list above (a string or a number), and the recovery time
 * the message names when it names one. Undefined for any other body.
 */
export function upstreamLimitOf(body: string, nowMs: number): { readonly code: string, readonly until?: number } | undefined {
  if (body.length > BODY_MAX) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch {
    return undefined
  }
  const failure = isRecord(parsed) ? parsed.error : undefined
  if (!isRecord(failure)) return undefined
  const code = typeof failure.code === 'string' || typeof failure.code === 'number' ? String(failure.code) : undefined
  if (code === undefined || !LIMIT_CODES.has(code)) return undefined
  const until = typeof failure.message === 'string' ? recoveryTime(failure.message.slice(0, MESSAGE_MAX), nowMs) : undefined
  return until === undefined ? { code } : { code, until }
}

/**
 * The record fields of a mint failure that means the login was refused: the
 * personal-plan lookup or the mint answered 401 or 403, or the login token
 * is empty. Transient failures (network, timeout, 429, 5xx) and the account
 * or project states (disabled, unavailable) are not a refused login.
 */
export function mintRejectionOf(code: string): { readonly status: 401 | 403 } | { readonly code: string } | undefined {
  if (code === `${PROJECT_TOKEN_HTTP_CODE_PREFIX}401`) return { status: 401 }
  if (code === `${PROJECT_TOKEN_HTTP_CODE_PREFIX}403`) return { status: 403 }
  if (code === PROJECT_TOKEN_CODES.loginRequired) return { code }
  return undefined
}

const EMPTY_BALANCE_CODES: ReadonlySet<string> = new Set(['1113', '1308', '1309', '1310'])
const CONCURRENCY_CODES: ReadonlySet<string> = new Set(['1302', '1305'])
const EXPIRED_TERMS = ['expired', '已过期'] as const
const EMPTY_TERMS = ['insufficient', 'balance', 'exhausted', 'quota', '余额不足', '额度已用尽', '无可用额度'] as const
const UNENTITLED_TERMS = ['not supported', 'not entitled', 'unsupported model', 'model not available', 'no entitlement', '套餐不支持', '无权限'] as const

function codeString(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function parseStartPlanSignals(body: string): { readonly codes: readonly string[], readonly text: string } {
  const fallback = body.slice(0, MESSAGE_MAX).toLowerCase()
  if (body.length > BODY_MAX) return { codes: [], text: fallback }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch {
    return { codes: [], text: fallback }
  }
  if (!isRecord(parsed)) return { codes: [], text: fallback }
  const data = isRecord(parsed.data) ? parsed.data : undefined
  const error = isRecord(parsed.error) ? parsed.error : undefined
  const codes = [parsed.code, data?.code, error?.code]
    .map(codeString)
    .filter((entry): entry is string => entry !== undefined)
  const messages = [parsed.msg, parsed.message, data?.msg, data?.message, error?.message, error?.reason]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  const text = (messages.length > 0 ? messages.join(' ').slice(0, MESSAGE_MAX * 2) : body.slice(0, MESSAGE_MAX)).toLowerCase()
  return { codes, text }
}

/**
 * Classifies whether a non-OK Start Plan HTTP response should fail over to
 * Coding Plan, and why. Login rejections (`401` or code `3012`) and generic
 * server/validation errors return `undefined`.
 */
export function classifyStartPlanFailover(status: number, body: string): StartPlanFailoverReason | undefined {
  if (status === 401) return undefined
  const { codes, text } = parseStartPlanSignals(body)
  if (codes.includes('3012')) return undefined
  if (EXPIRED_TERMS.some(term => text.includes(term))) return 'expired'
  if (status === 402 || codes.some(code => EMPTY_BALANCE_CODES.has(code)) || EMPTY_TERMS.some(term => text.includes(term))) {
    return 'empty'
  }
  if (status === 429 || codes.some(code => CONCURRENCY_CODES.has(code))) return 'concurrency'
  if ((status === 403 || status === 400 || status === 404) && UNENTITLED_TERMS.some(term => text.includes(term))) {
    return 'unentitled'
  }
  return undefined
}
