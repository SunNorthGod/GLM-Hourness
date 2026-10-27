/**
 * OAuth login flows for the Bigmodel provider, mirroring the ZCode desktop
 * client (ported from reference/zcode-api src/auth/oauth.ts, bundle-verified):
 *
 * - Primary path is the server-mediated CLI login (`startOAuthWithPolling`):
 *   POST the provider to `zcode.z.ai/api/v1/oauth/cli/init`, open the returned
 *   `authorize_url` (with the client-appended interstitial param), then poll
 *   `/oauth/cli/poll/{flow_id}` until the server reports `ready` with the
 *   tokens. No local callback server exists on this path.
 * - Headless fallback is the classic auth-code flow: authorize at
 *   `bigmodel.cn/login?appId=zcode`, the user pastes the redirected callback
 *   URL back, and the code exchanges at the shared zcode.z.ai token endpoint.
 */
import { randomBytes } from 'node:crypto'
import { ZCODE_APP_VERSION } from '../identity.ts'

/** zcode.z.ai API base (cli-login + token endpoints hang off it). */
const ZCODE_API_BASE = 'https://zcode.z.ai/api/v1'
/** Shared token-exchange endpoint (bigmodel auth-code flow). */
const ZCODE_TOKEN_ENDPOINT = `${ZCODE_API_BASE}/oauth/token`
/** Default Bigmodel authorize host. */
const BIGMODEL_HOST = 'https://bigmodel.cn'
/** Default Bigmodel app id. */
const BIGMODEL_APP_ID = 'zcode'

/** Overall login timeout shared by both flows (bundle `tln`). */
export const LOGIN_TIMEOUT_MS = 300_000

/** Tokens produced by a completed flow, pre-key-resolution. */
export interface OAuthFlowTokens {
  readonly accessToken: string
  readonly userId?: string
  readonly jwt?: string
}

export type FetchFn = typeof fetch

/** Flow handle returned by `start()`. */
export interface OAuthFlowStart {
  readonly authorizeUrl: string
  /** CSRF state (auth-code) / server flow_id (cli poll flow). */
  readonly state: string
}

/** The zcode.z.ai `{code, data, msg}` envelope. */
interface ZcodeEnvelope {
  code?: number
  data?: unknown
  msg?: string
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/** POST/GET a zcode.z.ai endpoint and unwrap the envelope; non-2xx or `code !== 0` fails with the server msg. */
async function requestZcodeEnvelope(fetchImpl: FetchFn, url: string, init: RequestInit, label: string): Promise<unknown> {
  const resp = await fetchImpl(url, init)
  const raw = safeJsonParse(await resp.text()) as ZcodeEnvelope | null
  if (raw === null || typeof raw.code !== 'number') throw new Error(`${label}: invalid response envelope (status=${resp.status})`)
  if (!resp.ok || raw.code !== 0) throw new Error(`${label} failed: status=${resp.status} msg=${raw.msg ?? '(none)'}`)
  return raw.data
}

/**
 * The interstitial the ZCode client appends to the server-provided
 * authorize_url: a zcode.z.ai page that records the authorization server-side
 * (so the poll flips to `ready`) before bouncing the browser to
 * `zcode://oauth/callback`. Bigmodel's param name is `redirect`.
 */
export function buildDesktopOAuthRedirectParam(appVersion: string): string {
  const url = new URL('/app/oauth/login', 'https://zcode.z.ai')
  url.searchParams.set('redirect', 'zcode://oauth/callback')
  url.searchParams.set('app_version', appVersion)
  return url.toString()
}

interface CliInitData {
  readonly flow_id: string
  readonly authorize_url: string
  readonly expires_at: number
  readonly poll_interval_sec: number
}

interface CliPollData {
  readonly status: string
  readonly token?: unknown
  readonly user?: { readonly user_id?: unknown }
  readonly bigmodel?: { readonly access_token?: unknown }
}

/**
 * Server-mediated CLI login (the ZCode desktop default): init → open
 * authorize_url → poll until ready. One poll token (32 random bytes, hex) is
 * generated per flow and sent as `Authorization: Bearer` on both init and
 * poll. Poll error semantics mirror the bundle: 4xx (except 408/429),
 * envelope `code !== 0`, or an unknown status are fatal; network errors,
 * 5xx/408/429, and malformed 200 bodies retry as if pending.
 */
export class PollOAuthClient {
  private flow: CliInitData | null = null
  private pollToken = ''
  private readonly fetchImpl: FetchFn
  private readonly sleep: (ms: number) => Promise<void>
  private readonly appVersion: string

  constructor(fetchImpl: FetchFn = fetch, sleep: (ms: number) => Promise<void> = defaultSleep, appVersion: string = ZCODE_APP_VERSION) {
    this.fetchImpl = fetchImpl
    this.sleep = sleep
    this.appVersion = appVersion
  }

  /** Start the flow: returns the authorize URL to open in a browser. */
  async start(): Promise<OAuthFlowStart> {
    this.flow = null
    this.pollToken = randomBytes(32).toString('hex')
    const data = (await requestZcodeEnvelope(
      this.fetchImpl,
      `${ZCODE_API_BASE}/oauth/cli/init`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.pollToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'bigmodel' }),
      },
      'bigmodel login init',
    )) as Partial<CliInitData> | null
    if (data === null || typeof data.flow_id !== 'string' || typeof data.authorize_url !== 'string' || typeof data.expires_at !== 'number' || typeof data.poll_interval_sec !== 'number') {
      throw new Error('bigmodel login init: invalid response data')
    }
    this.flow = data as CliInitData
    const url = new URL(data.authorize_url)
    url.searchParams.set('redirect', buildDesktopOAuthRedirectParam(this.appVersion))
    return { authorizeUrl: url.toString(), state: data.flow_id }
  }

  /** Poll until the flow completes, fails, or times out. */
  async complete(timeoutMs: number = LOGIN_TIMEOUT_MS): Promise<OAuthFlowTokens> {
    const flow = this.flow
    if (flow === null) throw new Error('bigmodel login not started')
    const deadlineMs = Math.min(Date.now() + timeoutMs, flow.expires_at * 1000)
    const intervalMs = Math.max(1_000, flow.poll_interval_sec * 1000)
    for (;;) {
      if (Date.now() >= deadlineMs) throw new Error('Authorization timed out. Please retry login.')
      const outcome = await this.pollOnce(flow.flow_id)
      if (outcome.retry) {
        await this.sleep(Math.min(intervalMs, Math.max(0, deadlineMs - Date.now())))
        continue
      }
      const data = outcome.data
      if (data?.status === 'ready') {
        const accessToken = typeof data.bigmodel?.access_token === 'string' ? data.bigmodel.access_token.trim() : ''
        if (accessToken.length === 0) throw new Error('bigmodel login poll: response missing data.bigmodel.access_token')
        const jwt = typeof data.token === 'string' ? data.token.trim() : undefined
        const userId = typeof data.user?.user_id === 'string' ? data.user.user_id : undefined
        return { accessToken, ...(jwt === undefined ? {} : { jwt }), ...(userId === undefined ? {} : { userId }) }
      }
      if (data?.status === 'failed') throw new Error('Authorization failed. Please retry login.')
      if (data?.status !== 'pending') throw new Error(`bigmodel login poll: unexpected status ${String(data?.status ?? '(none)')}`)
      await this.sleep(Math.min(intervalMs, Math.max(0, deadlineMs - Date.now())))
    }
  }

  /** One poll round with the bundle's error semantics. */
  private async pollOnce(flowId: string): Promise<{ retry: true } | { retry: false, data: Partial<CliPollData> | null }> {
    let resp: Response
    try {
      resp = await this.fetchImpl(`${ZCODE_API_BASE}/oauth/cli/poll/${encodeURIComponent(flowId)}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${this.pollToken}` },
      })
    } catch {
      return { retry: true }
    }
    if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
      throw new Error(`bigmodel login poll failed: status=${resp.status}`)
    }
    if (!resp.ok) return { retry: true }
    const raw = safeJsonParse(await resp.text()) as ZcodeEnvelope | null
    if (raw === null || typeof raw.code !== 'number') return { retry: true }
    if (raw.code !== 0) throw new Error(`bigmodel login poll failed: code=${raw.code} msg=${raw.msg ?? '(none)'}`)
    return { retry: false, data: raw.data as Partial<CliPollData> | null }
  }
}

/** Build the bigmodel paste-login authorize URL (`appId`/`redirect`/`state` appended). */
export function buildPasteAuthorizeUrl(callbackUrl: string, state: string): string {
  const params = new URLSearchParams({ appId: BIGMODEL_APP_ID, redirect: callbackUrl, state })
  return `${BIGMODEL_HOST}/login?${params.toString()}`
}

/** Fresh CSRF state for the paste login (32 random bytes, hex). */
export function freshPasteState(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Parse a callback URL the user pasted back (headless `--paste` login).
 * Tolerates copy artifacts (wrapping quotes/brackets, `&amp;` entities).
 * Throws on a CSRF state mismatch or a missing code.
 */
export function parsePastedCallbackUrl(raw: string, expectedState: string): string {
  let text = raw.trim().replace(/^["'`<([{]+/, '').replace(/["'`>\])}]+$/, '')
  text = text.replace(/&amp;/gi, '&')
  const q = text.indexOf('?')
  const query = (q >= 0 ? text.slice(q + 1) : text).split('#')[0]
  const params = new URLSearchParams(query)
  const state = params.get('state') ?? ''
  if (state.length === 0 || state !== expectedState) {
    throw new Error('OAuth state mismatch — the pasted URL does not belong to this login session (possible CSRF). Retry the login.')
  }
  const providerError = params.get('error')
  const code = params.get('authCode') ?? params.get('code') ?? ''
  if (code.length === 0) {
    throw new Error(providerError !== null
      ? `Authorization failed: provider returned error=${providerError}`
      : 'No authorization code in the pasted URL — paste the redirected callback URL, not the authorize URL.')
  }
  return code
}

/** Exchange a paste-login auth code at the shared zcode.z.ai token endpoint. */
export async function exchangeCode(fetchImpl: FetchFn, authCode: string, redirectUri: string, state: string): Promise<OAuthFlowTokens> {
  const resp = await fetchImpl(ZCODE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'bigmodel', code: authCode, redirect_uri: redirectUri, state }),
  })
  const raw = safeJsonParse(await resp.text()) as (ZcodeEnvelope & { data?: { token?: unknown, user?: { user_id?: unknown }, bigmodel?: { access_token?: unknown } } }) | null
  if (raw === null || typeof raw.code !== 'number') throw new Error(`bigmodel token exchange: invalid response envelope (status=${resp.status})`)
  if (!resp.ok || raw.code !== 0) throw new Error(`bigmodel token exchange failed: status=${resp.status} msg=${raw.msg ?? '(none)'}`)
  const accessToken = typeof raw.data?.bigmodel?.access_token === 'string' ? raw.data.bigmodel.access_token.trim() : ''
  if (accessToken.length === 0) throw new Error('bigmodel token response missing data.bigmodel.access_token')
  const jwt = typeof raw.data?.token === 'string' ? raw.data.token.trim() : undefined
  const userId = typeof raw.data?.user?.user_id === 'string' ? raw.data.user.user_id : undefined
  return { accessToken, ...(jwt === undefined ? {} : { jwt }), ...(userId === undefined ? {} : { userId }) }
}
