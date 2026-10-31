/**
 * The quota response of BigModel and the names of its windows
 * (docs/DESIGN.md §4.7). Pure functions: the text of one response in, the
 * rows the journal keeps out, and from the rows of one reading the windows
 * the status command words.
 *
 * Parsing follows the desktop client (3.17.1 `jD`, `QD`): the envelope
 * succeeds when `success` is not false and `code` is absent, null, 0 or 200;
 * the rows are the entries of `data.limits` whose `type` is a non-empty
 * string, keeping only their numeric fields. The caps are this package's:
 * 32 rows, 64 characters of type, 32 of level.
 */
import { formatMoment, type MomentZone, type QuotaWindowName } from '../shared/quota.ts'

/** One row of `data.limits`, as the journal keeps it. */
export interface QuotaLimitRow {
  readonly type: string
  readonly percentage?: number
  readonly remaining?: number
  readonly number?: number
  readonly usage?: number
  readonly currentValue?: number
  /** Epoch milliseconds. */
  readonly nextResetTime?: number
}

/** The response as parsed: the rows, or why there are none. */
export type ParsedQuota =
  | { readonly ok: true, readonly level?: string, readonly limits: readonly QuotaLimitRow[], readonly dropped: number, readonly keys: readonly string[] }
  | { readonly ok: false, readonly reason: string, readonly text: string, readonly keys?: readonly string[] }

export const ROWS_MAX = 32
const TYPE_MAX = 64
const LEVEL_MAX = 32
const MESSAGE_MAX = 80
const KEYS_MAX = 16
const KEY_MAX = 32
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** A reset time below this is in seconds (the server sends both). */
const SECONDS_BELOW = 1e12
/** The tolerance around now for a reset time: a day back, 45 days ahead. */
const RESET_BEFORE_MS = DAY_MS
const RESET_AFTER_MS = 45 * DAY_MS
/** The five-hour window, with two minutes for the clock difference to the server. */
const FIVE_HOUR_MS = 5 * HOUR_MS + 2 * MINUTE_MS

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** One line of server text for a message: control characters become spaces, at most 80 characters. */
function oneLine(text: string): string {
  let line = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    line += code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 ? ' ' : char
  }
  return line.replace(/ {2,}/g, ' ').trim().slice(0, MESSAGE_MAX)
}

/** The numeric fields of a row that are finite numbers; the percentage as 0-100 (a larger share is kept as 100, a negative one dropped). */
function numericFields(raw: Record<string, unknown>): Partial<Record<'percentage' | 'remaining' | 'number' | 'usage' | 'currentValue', number>> {
  const fields: Partial<Record<'percentage' | 'remaining' | 'number' | 'usage' | 'currentValue', number>> = {}
  if (finite(raw.percentage) && raw.percentage >= 0) fields.percentage = Math.min(100, raw.percentage)
  for (const key of ['remaining', 'number', 'usage', 'currentValue'] as const) {
    const value = raw[key]
    if (finite(value)) fields[key] = value
  }
  return fields
}

/** A reset time in milliseconds when it is a number within a day before and 45 days after the read. */
function resetTime(value: unknown, readAt: number): number | undefined {
  if (!finite(value)) return undefined
  const ms = value < SECONDS_BELOW ? value * 1000 : value
  return ms >= readAt - RESET_BEFORE_MS && ms <= readAt + RESET_AFTER_MS ? ms : undefined
}

/**
 * The row when it has a usable type and a share or a remainder; otherwise
 * undefined. The journal reads its rows back through the same rules.
 */
export function parseLimitRow(raw: unknown, readAt: number): QuotaLimitRow | undefined {
  if (!isRecord(raw)) return undefined
  const type = raw.type
  if (typeof type !== 'string' || type.length < 1 || type.length > TYPE_MAX) return undefined
  const fields = numericFields(raw)
  if (fields.percentage === undefined && fields.remaining === undefined) return undefined
  const reset = resetTime(raw.nextResetTime, readAt)
  return { type, ...fields, ...(reset === undefined ? {} : { nextResetTime: reset }) }
}

/** The names of the keys of the rows that were dropped, never their values. */
function keysOf(rows: readonly unknown[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    if (!isRecord(row)) continue
    for (const key of Object.keys(row)) if (keys.size < KEYS_MAX) keys.add(key.slice(0, KEY_MAX))
  }
  return [...keys]
}

/** The envelope's `code` as a number: a number, or a numeric string; null when absent. */
function codeOf(code: unknown): number | null | 'invalid' {
  if (code === undefined || code === null) return null
  if (finite(code)) return code
  if (typeof code === 'string' && code.trim().length > 0 && Number.isFinite(Number(code))) return Number(code)
  return 'invalid'
}

function refusal(body: Record<string, unknown>, code: number | null | 'invalid'): ParsedQuota {
  const label = code === null ? 'unsuccessful' : String(code)
  const message = typeof body.msg === 'string' ? body.msg : typeof body.message === 'string' ? body.message : ''
  const words = oneLine(message)
  return { ok: false, reason: `envelope:${label}`, text: `额度：服务端拒绝（${label}${words.length === 0 ? '' : ` ${words}`}）` }
}

/**
 * The response text as rows. A text that is not a JSON object, or an
 * unsuccessful envelope, is `envelope:<code>`; a successful one without a
 * usable row (including a data or limits member of the wrong shape) is
 * `no-windows`. `readAt` (epoch milliseconds) bounds the reset times.
 */
export function parseQuotaBody(text: string, readAt: number): ParsedQuota {
  let body: unknown
  try {
    body = JSON.parse(text)
  }
  catch {
    return { ok: false, reason: 'envelope:not-json', text: '额度：服务端拒绝（not-json）' }
  }
  if (!isRecord(body)) return { ok: false, reason: 'envelope:not-json', text: '额度：服务端拒绝（not-json）' }
  const code = codeOf(body.code)
  const succeeded = body.success !== false && (code === null || code === 0 || code === 200)
  if (!succeeded) return refusal(body, code)
  const data = isRecord(body.data) ? body.data : {}
  const rows: unknown[] = Array.isArray(data.limits) ? data.limits : []
  const limits: QuotaLimitRow[] = []
  const dropped: unknown[] = rows.slice(ROWS_MAX)
  for (const raw of rows.slice(0, ROWS_MAX)) {
    const row = parseLimitRow(raw, readAt)
    if (row === undefined) dropped.push(raw)
    else limits.push(row)
  }
  if (limits.length === 0) return { ok: false, reason: 'no-windows', text: '额度：服务端没有返回可识别的窗口', keys: keysOf(dropped) }
  const level = typeof data.level === 'string' ? data.level.trim() : ''
  return { ok: true, ...(level.length >= 1 && level.length <= LEVEL_MAX ? { level } : {}), limits, dropped: dropped.length, keys: keysOf(dropped) }
}

/** One row with the name and the words its window goes by. */
export interface NamedWindow {
  readonly name: QuotaWindowName
  readonly label: string
  readonly row: QuotaLimitRow
}

const LABELS = { 'five-hour': '5 小时', weekly: '每周', mcp: 'MCP 工具调用' } as const

/**
 * The windows of one reading, named by how long they run to their reset
 * (docs/DESIGN.md §4.3), counted from `readAt`: `TIME_LIMIT` is the MCP
 * window; of the `TOKENS_LIMIT` rows with a reset time, the ones resetting
 * within five hours are five-hour candidates and the rest weekly ones. One
 * candidate of each (or only one row) is named; any other count is not
 * guessed, each such row is an unnamed window. `zone` words the clock in the
 * label of an unnamed window.
 */
export function nameWindows(limits: readonly QuotaLimitRow[], readAt: number, zone?: MomentZone): NamedWindow[] {
  const candidates = limits.filter(row => row.type === 'TOKENS_LIMIT' && row.nextResetTime !== undefined)
  const soon = candidates.filter(row => (row.nextResetTime ?? 0) - readAt <= FIVE_HOUR_MS)
  const later = candidates.filter(row => !soon.includes(row))
  const named = soon.length <= 1 && later.length <= 1
  return limits.map((row): NamedWindow => {
    if (row.type === 'TIME_LIMIT') return { name: 'mcp', label: LABELS.mcp, row }
    if (row.type !== 'TOKENS_LIMIT') return { name: 'other', label: row.type, row }
    if (row.nextResetTime === undefined) return { name: 'window', label: '额度窗口', row }
    if (named) {
      const name = soon.includes(row) ? 'five-hour' : 'weekly'
      return { name, label: LABELS[name], row }
    }
    return { name: 'window', label: `额度窗口（${formatMoment(row.nextResetTime, row.nextResetTime, zone)} 重置）`, row }
  })
}
