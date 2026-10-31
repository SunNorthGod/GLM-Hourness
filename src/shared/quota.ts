/**
 * The quota contract between the GLM channel package and the orchestration
 * package (docs/ORCHESTRATION.md §11.3): what the pricing service's `quota`
 * member returns, and the pure functions both packages use to word it. One
 * set of functions renders the status command's section and the usage
 * panel's, so the two places print the same text.
 *
 * Types and pure functions only; no Node built-in is imported, so both
 * packages and the client can use the file. The channel package reads the
 * server and fills the view; nothing here knows a window's size or a plan's
 * coefficients, and the plan's own words reach the text through the service's
 * `plan` string and the labels the reader puts on each window.
 */
import { nextPeakChange } from './pricing.ts'

export interface QuotaRequest {
  /** How long the caller waits for a read it starts or joins; default 0. */
  readonly waitMs?: number
  /** false: start no read, return the cached or journalled view; default true. */
  readonly read?: boolean
}

export type QuotaWindowName = 'five-hour' | 'weekly' | 'mcp' | 'window' | 'other'

/** What a projection stands on: the speed between two readings, or the average speed since the window began. */
export type QuotaBasis =
  | { readonly kind: 'recent', readonly from: number, readonly to: number }
  | { readonly kind: 'window', readonly since: number, readonly includesNights: boolean }

export type QuotaProjection =
  | { readonly kind: 'exhausts', readonly at: number, readonly basis: QuotaBasis }
  | { readonly kind: 'at-reset', readonly percent: number, readonly basis: QuotaBasis }
  | { readonly kind: 'spent' }
  | { readonly kind: 'idle', readonly basis: QuotaBasis }
  /** `reason`: why there is no estimate, in plain words; empty for a window that is never estimated (the MCP window). */
  | { readonly kind: 'none', readonly reason: string }

export interface QuotaWindowView {
  readonly name: QuotaWindowName
  /** 「5 小时」「每周」「MCP 工具调用」「额度窗口（21:30 重置）」或原样的类型名 */
  readonly label: string
  readonly usedPercent?: number
  readonly resetAt?: number
  readonly projection: QuotaProjection
}

export interface QuotaReading {
  readonly at: number
  readonly level?: string
  readonly windows: readonly QuotaWindowView[]
}

export interface LoginView {
  readonly state: 'ok' | 'rejected' | 'absent'
  readonly since?: number
  readonly path?: 'model' | 'mint'
}

export interface QuotaView {
  /** The last successful reading, if any. */
  readonly reading?: QuotaReading
  /** The latest failure when it is newer than `reading`: the reason code and its line. */
  readonly failure?: { readonly at: number, readonly reason: string, readonly text: string }
  /** The latest upstream-limit record newer than `reading`. */
  readonly limited?: { readonly at: number, readonly code: string, readonly until?: number }
  /** The login state. */
  readonly login: LoginView
  /** A read is still running past `waitMs`. */
  readonly pending: boolean
}

/** The display time zone; without `offsetMinutes` the host's offset at each instant. */
export interface MomentZone {
  readonly offsetMinutes?: number
}

export interface QuotaLowRule {
  readonly usedPercent: number
  readonly exhaustsWithinMinutes: number
}

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const pad = (value: number): string => String(value).padStart(2, '0')

/** `ms` moved so that its UTC fields read as the clock of the display zone. */
function shifted(ms: number, zone: MomentZone | undefined): number {
  return ms + (zone?.offsetMinutes ?? -new Date(ms).getTimezoneOffset()) * MINUTE_MS
}

/**
 * A moment in words, counted in the display zone: the same day is `HH:MM`,
 * the next day `明天 HH:MM`, two to six days ahead `周X HH:MM`, and any other
 * day (further ahead, or before today) `MM-DD HH:MM`.
 */
export function formatMoment(ms: number, now: number, zone?: MomentZone): string {
  const local = shifted(ms, zone)
  const days = Math.floor(local / DAY_MS) - Math.floor(shifted(now, zone) / DAY_MS)
  const date = new Date(local)
  const clock = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  if (days === 0) return clock
  if (days === 1) return `明天 ${clock}`
  if (days >= 2 && days <= 6) return `${WEEKDAYS[date.getUTCDay()] ?? ''} ${clock}`
  return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${clock}`
}

/**
 * The peak line of the status command and the panel. The plan's name comes
 * from the pricing service; the change is the next minute `peak` differs from
 * now, from `nextPeakChange`, so every place that words it names the same one.
 */
export function peakLine(plan: string, peak: (atMs: number) => boolean, now: number, zone?: MomentZone): string {
  const change = nextPeakChange(peak, now)
  const moment = change === undefined ? undefined : formatMoment(change, now, zone)
  const state = peak(now)
    ? moment === undefined ? '高峰中' : `高峰中，到 ${moment}`
    : moment === undefined ? '不是高峰' : `不是高峰；下一个高峰 ${moment}`
  return `高峰：${state}（${plan}）`
}

const SPENT_PERCENT = 100

/** Whether the window has no quota left: the reader says so, or the share is the whole. */
const spentOf = (window: QuotaWindowView): boolean => window.projection.kind === 'spent' || (window.usedPercent ?? 0) >= SPENT_PERCENT

const percentWords = (value: number): string => `${Math.round(value)}%`

function basisWords(basis: QuotaBasis, now: number, zone: MomentZone | undefined): string {
  if (basis.kind === 'recent') return `按 ${formatMoment(basis.from, now, zone)}–${formatMoment(basis.to, now, zone)} 两次读数的速度`
  return `按本窗口 ${formatMoment(basis.since, now, zone)} 以来的平均速度${basis.includesNights ? '（含夜间，偏低）' : ''}`
}

/** The words of the projection after the share and the reset; undefined when it adds none (spent is said by the share). */
function projectionWords(projection: QuotaProjection, now: number, zone: MomentZone | undefined): string | undefined {
  switch (projection.kind) {
    case 'exhausts': return `预计 ${formatMoment(projection.at, now, zone)} 用完，${basisWords(projection.basis, now, zone)}`
    case 'at-reset': return `到重置时约 ${percentWords(projection.percent)}，${basisWords(projection.basis, now, zone)}`
    case 'idle': return `最近没有消耗，${basisWords(projection.basis, now, zone)}`
    case 'none': return projection.reason === '' ? undefined : `不预估：${projection.reason}`
    case 'spent': return undefined
  }
}

function windowLine(window: QuotaWindowView, now: number, zone: MomentZone | undefined): string {
  const used = spentOf(window) ? '已用完' : window.usedPercent === undefined ? '已用比例未知' : `已用 ${percentWords(window.usedPercent)}`
  const reset = window.resetAt === undefined ? undefined : `${formatMoment(window.resetAt, now, zone)} 重置`
  const projection = projectionWords(window.projection, now, zone)
  return `- ${window.label}：${[used, reset, projection].filter((part): part is string => part !== undefined).join(' · ')}`
}

const REJECTED_PATH_WORDS: Readonly<Record<'model' | 'mint', string>> = {
  model: '模型请求在重新取令牌之后仍被拒',
  mint: '取令牌时被拒',
}

/** 「登录：被拒（17:40，模型请求在重新取令牌之后仍被拒），运行 /glm-login」 */
function rejectedLoginLine(login: LoginView, now: number, zone: MomentZone | undefined): string {
  const detail = [
    login.since === undefined ? undefined : formatMoment(login.since, now, zone),
    login.path === undefined ? undefined : REJECTED_PATH_WORDS[login.path],
  ].filter((part): part is string => part !== undefined)
  return `登录：被拒${detail.length === 0 ? '' : `（${detail.join('，')}）`}，运行 /glm-login`
}

/**
 * The quota section of the status command and the panel, one line per
 * element: a rejected login, an upstream limit newer than the reading, the
 * latest failure, the last reading with a line per window, and a read still
 * running. A view with none of these says there is no reading yet.
 */
export function quotaLines(view: QuotaView, now: number, zone?: MomentZone): string[] {
  const lines: string[] = []
  if (view.login.state === 'rejected') lines.push(rejectedLoginLine(view.login, now, zone))
  if (view.limited !== undefined) lines.push(`额度已用完（服务端 ${view.limited.code}）${view.limited.until === undefined ? '' : `，预计 ${formatMoment(view.limited.until, now, zone)} 恢复`}`)
  if (view.failure !== undefined) lines.push(view.failure.text)
  if (view.reading !== undefined) {
    const level = view.reading.level === undefined ? '' : `：${view.reading.level}`
    lines.push(`额度（服务端读数，含 ZCode 等其他客户端，读于 ${formatMoment(view.reading.at, now, zone)}）${level}`)
    for (const window of view.reading.windows) lines.push(windowLine(window, now, zone))
  }
  else if (view.limited === undefined && view.failure === undefined && !view.pending) lines.push('额度：还没有读数')
  if (view.pending) lines.push('额度：正在读取，稍后再看')
  return lines
}

/** Whether the five-hour or weekly window is at the share, will run out soon, or has run out. */
function lowIn(window: QuotaWindowView, rule: QuotaLowRule, now: number): boolean {
  const projection = window.projection
  return spentOf(window)
    || (window.usedPercent ?? 0) >= rule.usedPercent
    || (projection.kind === 'exhausts' && projection.at - now <= rule.exhaustsWithinMinutes * MINUTE_MS)
}

/**
 * The five-hour or weekly window that is running low (the higher used share
 * wins, the first on a tie); undefined when none is. The MCP window and the
 * unnamed ones never count: a spent MCP window leaves model requests as they
 * were.
 */
export function quotaLowOf(view: QuotaView, rule: QuotaLowRule, now: number): QuotaWindowView | undefined {
  let low: QuotaWindowView | undefined
  let lowShare = -1
  for (const window of view.reading?.windows ?? []) {
    if (window.name !== 'five-hour' && window.name !== 'weekly') continue
    if (!lowIn(window, rule, now)) continue
    const share = spentOf(window) ? SPENT_PERCENT : window.usedPercent ?? 0
    if (share > lowShare) {
      low = window
      lowShare = share
    }
  }
  return low
}

/** 「5 小时额度已用 85%，21:30 重置，预计 20:40 用完」 */
export function quotaLowLine(window: QuotaWindowView, now: number, zone?: MomentZone): string {
  const used = spentOf(window) ? '已用完' : window.usedPercent === undefined ? '' : `已用 ${percentWords(window.usedPercent)}`
  const clauses = [`${window.label}额度${used}`]
  if (window.resetAt !== undefined) clauses.push(`${formatMoment(window.resetAt, now, zone)} 重置`)
  if (window.projection.kind === 'exhausts') clauses.push(`预计 ${formatMoment(window.projection.at, now, zone)} 用完`)
  return clauses.join('，')
}

/** 「GLM 登录在 17:40 被服务端拒绝，GLM 的请求会失败；运行 /glm-login 重新登录」 */
export function loginLine(login: LoginView, now: number, zone?: MomentZone): string {
  switch (login.state) {
    case 'rejected': return `GLM 登录${login.since === undefined ? '' : `在 ${formatMoment(login.since, now, zone)} `}被服务端拒绝，GLM 的请求会失败；运行 /glm-login 重新登录`
    case 'absent': return 'GLM 未登录；运行 /glm-login 登录'
    case 'ok': return 'GLM 登录正常'
  }
}
