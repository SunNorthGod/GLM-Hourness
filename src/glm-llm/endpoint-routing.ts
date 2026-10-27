/**
 * Provider endpoint routing for the native ZCode client (ported from
 * reference/zcode-api src/proxy/endpoint-routing.ts, mirroring the ZCode
 * `ProviderEndpointRoutingService`): periodically fetch
 * `GET zcode.z.ai/api/v1/agent/configs` and rewrite request URLs per the
 * server-controlled `data.proxyEndpoint.mapping` table. The same snapshot
 * carries the 3.16.3 request-verification (captcha) switch. Failure
 * semantics are strictly fail-open: any error keeps the previous snapshot
 * (or none) and resolves the original URL after a cooldown.
 */
import { buildContextIdentityHeaders, type ZcodeIdentity } from './identity.ts'

const DEFAULT_ORIGIN = 'https://zcode.z.ai'
const CONFIG_PATH = '/api/v1/agent/configs'
const SUCCESS_TTL_MS = 300_000
const FAILURE_COOLDOWN_MS = 30_000
const REQUEST_TIMEOUT_MS = 3_000
const MAX_MAPPING_ENTRIES = 256

const ZCODE_AUTHORIZATION_HEADER = 'X-ZCode-Authorization'
const ZCODE_AUTHORIZATION_MARKER = 'x-zcode-authorization'
const ZCODE_AUTHORIZATION_PATHS = ['/api/v1/ultra', '/api/v1/ultra-zai']

export interface EndpointRoutingOptions {
  readonly origin?: string
  readonly identity: ZcodeIdentity
  readonly credential?: () => string | undefined
  readonly fetchImpl?: typeof fetch
  readonly now?: () => number
  readonly successTtlMs?: number
  readonly failureCooldownMs?: number
  readonly requestTimeoutMs?: number
  readonly env?: NodeJS.ProcessEnv
}

export interface RoutedUrl {
  readonly routed: boolean
  readonly url: string
  readonly headers?: Record<string, string>
}

interface RoutingTarget {
  url: string
  includeZCodeAuthorization: boolean
}

/** 3.16.3 request-verification switch (`configs.captcha`, camelCase; null while the server has not shipped the block). */
export interface RequestVerificationConfig {
  enabled?: boolean
  skipModelRequest?: boolean
}

interface RoutingSnapshot {
  expiresAt: number
  mapping: Map<string, RoutingTarget>
  requestVerification: RequestVerificationConfig | null
}

/** Whether the claim plane requires captcha under the given switch (absent config → required). */
export function requiresClaimCaptcha(config: RequestVerificationConfig | null | undefined): boolean {
  return config?.enabled !== false && config?.skipModelRequest !== true
}

function normalizePath(pathname: string): string {
  if (pathname === '/') return '/'
  return pathname.replace(/\/+$/u, '') || '/'
}

function routingKey(url: URL): string {
  const port = url.port === '' ? '443' : url.port
  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}${normalizePath(url.pathname)}`
}

function parseMappingUrl(value: unknown, field: 'from' | 'to'): URL {
  if (typeof value !== 'string') throw new Error(`mapping.${field} must be a string`)
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error(`mapping.${field} URL is not a plain https URL`)
  }
  return parsed
}

function isAllowedZCodeAuthorizationTarget(target: URL, endpointOrigin: string): boolean {
  if (target.origin !== endpointOrigin) return false
  const path = normalizePath(target.pathname)
  return ZCODE_AUTHORIZATION_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

function normalizePrintableHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed.length === 0 || !/^[\x20-\x7e]+$/u.test(trimmed)) return undefined
  return trimmed
}

function buildZCodeAuthorizationHeaders(zcodeJwt: string | undefined): Record<string, string> | undefined {
  const value = normalizePrintableHeaderValue(zcodeJwt)
  if (value === undefined) return undefined
  return { [ZCODE_AUTHORIZATION_HEADER]: /^Bearer\s/i.test(value) ? value : `Bearer ${value}` }
}

function parseRequestVerificationConfig(configs: unknown): RequestVerificationConfig | null {
  const captcha = (configs as { captcha?: unknown } | null | undefined)?.captcha
  if (captcha === null || typeof captcha !== 'object' || Array.isArray(captcha)) return null
  const { skip_model_request, ...rest } = captcha as Record<string, unknown>
  const out: RequestVerificationConfig = {}
  if (typeof rest.enabled === 'boolean') out.enabled = rest.enabled
  if (typeof skip_model_request === 'boolean') out.skipModelRequest = skip_model_request
  return out
}

/** Mapping-table resolver with a shared snapshot cache; every failure fails open. */
export class EndpointRoutingService {
  private readonly configUrl: string
  private readonly endpointOrigin: string
  private readonly identity: ZcodeIdentity
  private readonly credential: (() => string | undefined) | undefined
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly successTtlMs: number
  private readonly failureCooldownMs: number
  private readonly requestTimeoutMs: number
  private readonly env: NodeJS.ProcessEnv
  private snapshot: RoutingSnapshot | undefined
  private retryAfter = 0
  private refreshPromise: Promise<void> | undefined

  constructor(opts: EndpointRoutingOptions) {
    this.configUrl = `${(opts.origin?.trim() || DEFAULT_ORIGIN).replace(/\/+$/u, '')}${CONFIG_PATH}`
    this.endpointOrigin = new URL(this.configUrl).origin
    this.identity = opts.identity
    this.credential = opts.credential
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.now = opts.now ?? Date.now
    this.successTtlMs = opts.successTtlMs ?? SUCCESS_TTL_MS
    this.failureCooldownMs = opts.failureCooldownMs ?? FAILURE_COOLDOWN_MS
    this.requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS
    this.env = opts.env ?? process.env
  }

  /** True when at least one successful snapshot has been fetched. */
  hasSnapshot(): boolean {
    return this.snapshot !== undefined
  }

  /** The request-verification switch from the latest snapshot (null while unshipped). */
  async getRequestVerificationConfig(credential?: string): Promise<RequestVerificationConfig | null> {
    try { await this.ensureFresh(credential) } catch { /* fail-open: read whatever snapshot we have */ }
    return this.snapshot?.requestVerification ?? null
  }

  /** Resolve a request URL through the mapping table; never throws. */
  async resolve(url: string, credential?: string, zcodeJwt?: string): Promise<RoutedUrl> {
    let parsed: URL
    try { parsed = new URL(url) } catch { return { routed: false, url } }
    try { await this.ensureFresh(credential) } catch { /* fail-open: resolve without a snapshot */ }
    const target = this.snapshot?.mapping.get(routingKey(parsed))
    if (target === undefined) return { routed: false, url }
    const rewritten = new URL(target.url)
    rewritten.search = parsed.search
    const headers = target.includeZCodeAuthorization ? buildZCodeAuthorizationHeaders(zcodeJwt) : undefined
    return headers === undefined ? { routed: true, url: rewritten.href } : { routed: true, url: rewritten.href, headers }
  }

  private async ensureFresh(credential?: string): Promise<void> {
    const now = this.now()
    if ((this.snapshot !== undefined && this.snapshot.expiresAt > now) || this.retryAfter > now) return
    const pending = this.refreshPromise ?? this.beginRefresh(credential)
    await pending
  }

  private beginRefresh(credential?: string): Promise<void> {
    const promise = this.refresh(credential).finally(() => { if (this.refreshPromise === promise) this.refreshPromise = undefined })
    this.refreshPromise = promise
    return promise
  }

  private async refresh(credential?: string): Promise<void> {
    // The config fetch uses the context identity plane (`TV`: no X-ZCode-Agent,
    // optional X-Device-Mid) plus x-api-key and Accept.
    const headers: Record<string, string> = { ...buildContextIdentityHeaders(this.identity, this.env), Accept: 'application/json' }
    const key = credential ?? this.credential?.()
    if (key !== undefined && key.length > 0) headers['x-api-key'] = key
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    try {
      const resp = await this.fetchImpl(this.configUrl, { method: 'GET', headers, redirect: 'manual', signal: controller.signal })
      if (resp.status < 200 || resp.status >= 300) throw new Error(`agent_configs_http_${resp.status}`)
      const envelope = await resp.json() as { code?: unknown, data?: { proxyEndpoint?: { mapping?: unknown }, configs?: unknown } }
      if (typeof envelope !== 'object' || envelope.code !== 0) throw new Error('agent_configs_nonzero_code')
      const list = Array.isArray(envelope.data?.proxyEndpoint?.mapping) ? envelope.data!.proxyEndpoint!.mapping as unknown[] : []
      if (list.length > MAX_MAPPING_ENTRIES) throw new Error('agent_configs_too_many_mappings')
      const mapping = new Map<string, RoutingTarget>()
      for (const entry of list) {
        const raw = entry as { from?: unknown, to?: unknown, zcodeAuthorizationHeader?: unknown }
        const from = parseMappingUrl(raw.from, 'from')
        const to = parseMappingUrl(raw.to, 'to')
        if (raw.zcodeAuthorizationHeader !== undefined && typeof raw.zcodeAuthorizationHeader !== 'string') throw new Error('agent_configs_invalid_zcode_authorization_header')
        const marker = raw.zcodeAuthorizationHeader?.trim() ?? ''
        const includeZCodeAuthorization = marker.length > 0
        if (includeZCodeAuthorization && (marker.toLowerCase() !== ZCODE_AUTHORIZATION_MARKER || !isAllowedZCodeAuthorizationTarget(to, this.endpointOrigin))) {
          throw new Error('agent_configs_unsafe_zcode_authorization_target')
        }
        const key = routingKey(from)
        if (mapping.has(key)) throw new Error('agent_configs_duplicate_from')
        mapping.set(key, { url: to.href, includeZCodeAuthorization })
      }
      this.snapshot = { expiresAt: this.now() + this.successTtlMs, mapping, requestVerification: parseRequestVerificationConfig(envelope.data?.configs) }
      this.retryAfter = 0
    }
    catch {
      this.retryAfter = this.now() + this.failureCooldownMs
    }
    finally {
      clearTimeout(timer)
    }
  }
}
