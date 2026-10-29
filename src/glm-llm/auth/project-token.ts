/**
 * The project access token (PAT) of a bigmodel personal coding plan, ported
 * from ZCode 3.16.3 `ProjectAccessTokenClient` and `ProjectAccessTokenCache`
 * (CLI bundle `sge` @1082916 and `Urt` @1080367; the desktop host chunk
 * `out/host/chunk-5YNPFY3L.js` carries the same code, `My` and `wc`). 3.16.3
 * account mode sends this token as the model request credential and signs
 * with it.
 *
 * - Locate (once per scope, persisted through `locationStore`):
 *   `getCustomerInfo` with the raw OAuth token → drop projects of type "2"
 *   and organizations left without projects → the organization named
 *   「默认机构」 else the first, its project named 「默认项目」 else the first
 *   → list the project's API keys, take the one named `zcode-api-key` or
 *   create it with `usageScene: 1`.
 * - Mint: `POST …/api_keys/{apiKeyId}/access_tokens` with
 *   `Authorization: Bearer <OAuth token>` and
 *   `{clientType: "zcode", clientVersion}`. A `{code: 404}` answer drops the
 *   location, so the next resolve locates again.
 * - Cache: a token is reused until `expiresAt − 120 s − random·60 s`; a
 *   transient failure (429, 5xx, network, timeout) keeps a still-valid token
 *   and retries 5 s later; `rejectedFingerprint` equal to the cached token's
 *   SHA-256 forces a new mint (the 401 refresh).
 * - Every failure surfaces as one ZCode code (zcode-wire.ts
 *   PROJECT_TOKEN_CODES); messages never carry a token or server text.
 *   Request failures carry their kind as 3.17.1 names it (`KAr`): network,
 *   timeout, or the HTTP status.
 */
import { CUSTOMER_INFO_PATH, PROJECT_KEY_LOCATION_PREFIX, PROJECT_TOKEN_CODES, PROJECT_TOKEN_HTTP_CODE_PREFIX, ZCODE_API_KEY_NAME } from '../zcode-wire.ts'

/** `pi`, `eF`, `tF`, `nF` (desktop chunk +849741): refresh 120 s before expiry minus up to 60 s of jitter; retry a deferred refresh after 5 s. */
const SECOND_MS = 1_000
const REFRESH_LEAD_MS = 120 * SECOND_MS
const REFRESH_JITTER_MS = 60 * SECOND_MS
const DEFERRED_RETRY_MS = 5 * SECOND_MS
/** `x_e` (desktop host index.js +1203000): the request timeout of the PAT plane. */
const REQUEST_TIMEOUT_MS = 15_000
/** `di.CODING_PLAN`: the API key usage scene of a coding plan. */
const CODING_PLAN_USAGE_SCENE = 1
/** `rF`, `iF`: the default organization and project name markers. */
const DEFAULT_ORGANIZATION_MARKER = '默认机构'
const DEFAULT_PROJECT_MARKER = '默认项目'
/** The personal plan's project selection key in the location scope (`personalProjectSelection ?? "non-team"`). */
const PERSONAL_SELECTION = 'non-team'

/** The family of the personal plan this channel serves. */
type Family = 'bigmodel'

/** A located project API key (`cF`: all three non-empty). */
export interface ProjectKeyLocation {
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
}

export interface ResolvedProjectToken extends ProjectKeyLocation {
  readonly token: string
}

/** Persisted locations, keyed by the 3.16.3 `project-key-location:v1:` key. */
export interface ProjectKeyLocationStore {
  load(key: string): Promise<string | undefined>
  /**
   * `loginToken` is the OAuth token the location was resolved with, as the
   * caller passed it in `resolve`; a store that also holds the login can
   * refuse a location whose login has been replaced meanwhile.
   */
  save(key: string, value: string, loginToken: string): Promise<void>
  delete(key: string): Promise<void>
}

/** `ProjectAccessTokenError`: a failure that already carries its 3.16.3 code. */
class ProjectAccessTokenError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'ProjectAccessTokenError'
  }
}

/** What a PAT-plane request failed on (3.17.1 `j2`/`WG` `failure`). */
type RequestFailure = { readonly kind: 'network' } | { readonly kind: 'timeout' } | { readonly kind: 'http', readonly status: number }

/** `ProjectAccessTokenTransientError`: 429, 5xx, a network failure or a timeout. */
class ProjectAccessTokenTransientError extends Error {
  readonly failure: RequestFailure
  constructor(failure: RequestFailure) {
    super('project_token_transient_failure')
    this.name = 'ProjectAccessTokenTransientError'
    this.failure = failure
  }
}

/** `ProjectAccessTokenHttpStatusError` (3.17.1): any other status outside 2xx. */
class ProjectAccessTokenHttpStatusError extends Error {
  readonly failure: RequestFailure
  constructor(status: number) {
    super('project_token_http_status')
    this.name = 'ProjectAccessTokenHttpStatusError'
    this.failure = { kind: 'http', status }
  }
}

/** `projectAccessTokenRequestFailureCode` (3.17.1 `KAr`). */
function requestFailureCode(failure: RequestFailure): string {
  if (failure.kind === 'network') return PROJECT_TOKEN_CODES.networkError
  if (failure.kind === 'timeout') return PROJECT_TOKEN_CODES.timeout
  return Number.isInteger(failure.status) && failure.status >= 100 && failure.status <= 599 ? `${PROJECT_TOKEN_HTTP_CODE_PREFIX}${failure.status}` : PROJECT_TOKEN_CODES.requestFailed
}

/** One PAT-plane request: the parsed JSON body, `{code: 404}` for HTTP 404; throws on any other failure. */
export type ProjectTokenRequest = (url: string, init: { method: 'GET' | 'POST', headers: Record<string, string>, body?: string }) => Promise<unknown>

/**
 * The request wrapper of ZCode `createAccountProjectTokenClient` (3.16.3
 * `RM`, desktop host index.js +1203000; 3.17.1 `Zht`): 15 s timeout; 404 →
 * `{code: 404}`; 429, 5xx, network failures and timeouts are transient;
 * other statuses fail with their status; a body that is not JSON is an
 * invalid response (3.17.1). The desktop sends through its API client
 * (`Wt`); whether that client adds default headers was not traced
 * (docs/DESIGN.md §4.8), this sends the literal headers ZCode passes.
 */
export function projectTokenRequest(fetchImpl: typeof fetch): ProjectTokenRequest {
  return async (url, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const unreachable = (): ProjectAccessTokenTransientError => new ProjectAccessTokenTransientError(controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network' })
    try {
      let response: Response
      try {
        response = await fetchImpl(url, { ...init, signal: controller.signal })
      }
      catch {
        throw unreachable()
      }
      if (response.status === 404) return { code: 404 }
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) throw new ProjectAccessTokenTransientError({ kind: 'http', status: response.status })
      if (!response.ok) throw new ProjectAccessTokenHttpStatusError(response.status)
      let body: string
      try {
        body = await response.text()
      }
      catch {
        throw unreachable()
      }
      try {
        return JSON.parse(body) as unknown
      }
      catch {
        throw new ProjectAccessTokenError(PROJECT_TOKEN_CODES.invalidResponse)
      }
    }
    finally {
      clearTimeout(timer)
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `Ic`: the success codes of the bigmodel envelope. */
function isSuccessCode(code: unknown): boolean {
  return code === 200 || code === 0 || code === '200' || code === '0'
}

/** `readData` (`$y`): the envelope's `data`; any other shape is an invalid response. */
function readData(body: unknown): unknown {
  if (!isRecord(body) || !isSuccessCode(body.code)) throw new Error(PROJECT_TOKEN_CODES.invalidResponse)
  return body.data
}

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** The mint answer as `oF` parses it: a missing `enable` means enabled; an enabled token needs a Bearer type and positive finite lifetimes. */
function parseMintResponse(body: unknown): { enable: false } | { enable: true, accessToken: string, expiresIn: number, expiresAt: number } | undefined {
  if (!isRecord(body) || !isSuccessCode(body.code) || !isRecord(body.data)) return undefined
  const data = 'enable' in body.data ? body.data : { ...body.data, enable: true }
  if (data.enable === false) return { enable: false }
  if (data.enable !== true || !nonEmptyString(data.accessToken) || data.tokenType !== 'Bearer') return undefined
  const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  if (!positive(data.expiresIn) || !positive(data.expiresAt)) return undefined
  return { enable: true, accessToken: data.accessToken.trim(), expiresIn: data.expiresIn, expiresAt: data.expiresAt }
}

/** `projectAccessTokenFingerprint` (`hR`): SHA-256 hex of the token. */
export async function projectTokenFingerprint(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

type CachedToken = { readonly enabled: false } | { readonly enabled: true, readonly token: string, readonly expiresAt: number }

interface CacheEntry {
  value?: Extract<CachedToken, { enabled: true }> | undefined
  refreshAt?: number | undefined
  fingerprint?: string
  pending?: Promise<CachedToken> | undefined
}

interface TokenScope extends ProjectKeyLocation {
  readonly origin: string
  readonly family: Family
  readonly accountId: string
  readonly usageScene: number
  readonly loginGeneration: string
}

/** `ProjectAccessTokenCache` (`Urt`): one entry per token scope. */
class ProjectAccessTokenCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly now: () => number
  private readonly random: () => number

  constructor(now: () => number, random: () => number) {
    this.now = now
    this.random = random
  }

  resolve(scope: TokenScope, mint: () => Promise<unknown>, rejectedFingerprint: string | undefined): Promise<CachedToken> {
    const key = JSON.stringify([scope.origin, scope.family, scope.accountId, scope.organizationId, scope.projectId, scope.apiKeyId, scope.usageScene, scope.loginGeneration])
    let entry = this.entries.get(key)
    if (rejectedFingerprint !== undefined && entry?.fingerprint === rejectedFingerprint) {
      entry.value = undefined
      entry.refreshAt = undefined
    }
    if (entry?.pending !== undefined) return entry.pending
    if (entry?.value !== undefined && this.now() < Math.min(entry.refreshAt ?? 0, entry.value.expiresAt)) return Promise.resolve(entry.value)
    if (entry === undefined) {
      entry = {}
      this.entries.set(key, entry)
    }
    const current = entry
    const startedAt = this.now()
    const assertCurrent = (): void => { if (this.entries.get(key) !== current) throw new ProjectAccessTokenError(PROJECT_TOKEN_CODES.scopeInvalidated) }
    const pending: Promise<CachedToken> = Promise.resolve()
      .then(() => { assertCurrent(); return mint() })
      .then(async (body): Promise<CachedToken> => {
        assertCurrent()
        const parsed = parseMintResponse(body)
        if (parsed === undefined) throw new ProjectAccessTokenError(PROJECT_TOKEN_CODES.invalidResponse)
        if (!parsed.enable) {
          this.entries.delete(key)
          return Object.freeze({ enabled: false as const })
        }
        const expiresAt = Math.min(parsed.expiresAt * SECOND_MS, startedAt + parsed.expiresIn * SECOND_MS)
        if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) throw new ProjectAccessTokenError(PROJECT_TOKEN_CODES.invalidResponse)
        const jitter = Math.max(0, Math.min(1, this.random())) * REFRESH_JITTER_MS
        const fingerprint = await projectTokenFingerprint(parsed.accessToken)
        assertCurrent()
        current.fingerprint = fingerprint
        current.value = Object.freeze({ enabled: true as const, token: parsed.accessToken, expiresAt })
        current.refreshAt = expiresAt - REFRESH_LEAD_MS - jitter
        return current.value
      })
      .catch((error: unknown): CachedToken => {
        assertCurrent()
        if (error instanceof ProjectAccessTokenTransientError && current.value !== undefined && this.now() < current.value.expiresAt) {
          current.refreshAt = Math.min(this.now() + DEFERRED_RETRY_MS, current.value.expiresAt)
          return current.value
        }
        this.entries.delete(key)
        throw error
      })
      .finally(() => { if (current.pending === pending) current.pending = undefined })
    current.pending = pending
    return pending
  }

  clear(): void {
    this.entries.clear()
  }
}

interface LoginScope {
  readonly token: string
  readonly generation: string
  readonly locations: Map<string, Promise<ProjectKeyLocation>>
  readonly cache: ProjectAccessTokenCache
}

export interface ProjectTokenResolveInput {
  /** The bigmodel API origin (`resolveBigModelApiOrigin`: `https://bigmodel.cn` in production). */
  readonly origin: string
  /** The OAuth access token of the login. */
  readonly loginToken: string
  /** The account identity (the login's user id). */
  readonly accountId: string
  /** The client version minted into the token (the signing version, one constant in 3.16.3). */
  readonly clientVersion: string
  /** SHA-256 of a token the upstream rejected; forces a new mint when it is the cached one. */
  readonly rejectedFingerprint?: string
}

/** `ProjectAccessTokenClient` (`sge`) for the personal (non-team) plan. */
export class ProjectAccessTokenClient {
  private readonly request: ProjectTokenRequest
  private readonly now: () => number
  private readonly random: () => number
  private readonly locationStore: ProjectKeyLocationStore | undefined
  private readonly scopes = new Map<string, LoginScope>()
  private generation = 0

  constructor(options: { request: ProjectTokenRequest, now?: () => number, random?: () => number, locationStore?: ProjectKeyLocationStore }) {
    this.request = options.request
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.locationStore = options.locationStore
  }

  async resolve(input: ProjectTokenResolveInput): Promise<ResolvedProjectToken> {
    const origin = new URL(input.origin).origin
    const family: Family = 'bigmodel'
    const loginToken = input.loginToken.trim().replace(/^Bearer\s+/iu, '')
    if (loginToken.length === 0 || input.accountId.trim().length === 0) throw new Error(PROJECT_TOKEN_CODES.loginRequired)
    const scopeKey = JSON.stringify([origin, family])
    let scope = this.scopes.get(scopeKey)
    if (scope === undefined || scope.token !== loginToken) {
      scope?.cache.clear()
      scope = { token: loginToken, generation: String(++this.generation), locations: new Map(), cache: new ProjectAccessTokenCache(this.now, this.random) }
      this.scopes.set(scopeKey, scope)
    }
    const current = scope
    const assertCurrent = (): void => { if (this.scopes.get(scopeKey) !== current) throw new ProjectAccessTokenError(PROJECT_TOKEN_CODES.scopeInvalidated) }
    const request: ProjectTokenRequest = async (url, init) => {
      assertCurrent()
      const body = await this.request(url, init)
      assertCurrent()
      return body
    }
    try {
      const locationKey = JSON.stringify([input.accountId, null, PERSONAL_SELECTION])
      const storeKey = `${PROJECT_KEY_LOCATION_PREFIX}${encodeURIComponent(JSON.stringify([origin, family, input.accountId, null, CODING_PLAN_USAGE_SCENE, PERSONAL_SELECTION]))}`
      let located = current.locations.get(locationKey)
      if (located === undefined) {
        const locating = (async (): Promise<ProjectKeyLocation> => {
          const stored = await this.locationStore?.load(storeKey)
          assertCurrent()
          const parsed = stored === undefined ? undefined : parseLocation(stored)
          if (parsed !== undefined) return parsed
          const fresh = await this.locate(origin, loginToken, request)
          assertCurrent()
          await this.locationStore?.save(storeKey, JSON.stringify(fresh), input.loginToken)
          assertCurrent()
          return fresh
        })()
        located = locating
        current.locations.set(locationKey, locating)
        locating.catch(() => { if (current.locations.get(locationKey) === locating) current.locations.delete(locationKey) })
      }
      const location = await located
      assertCurrent()
      const minted = await current.cache.resolve({ origin, family, accountId: input.accountId, ...location, usageScene: CODING_PLAN_USAGE_SCENE, loginGeneration: current.generation }, async () => {
        const body = await request(`${keyListUrl(origin, location)}/${encodeURIComponent(location.apiKeyId)}/access_tokens`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${loginToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientType: 'zcode', clientVersion: input.clientVersion }),
        })
        if (isRecord(body) && body.code === 404) {
          current.locations.delete(locationKey)
          await this.locationStore?.delete(storeKey)
        }
        return body
      }, input.rejectedFingerprint)
      assertCurrent()
      if (!minted.enabled) throw new Error(PROJECT_TOKEN_CODES.disabled)
      return { token: minted.token, ...location }
    }
    catch (error) {
      const known: readonly string[] = [PROJECT_TOKEN_CODES.disabled, PROJECT_TOKEN_CODES.projectUnavailable, PROJECT_TOKEN_CODES.invalidResponse]
      const code = error instanceof ProjectAccessTokenError
        ? error.code
        : error instanceof ProjectAccessTokenTransientError || error instanceof ProjectAccessTokenHttpStatusError
          ? requestFailureCode(error.failure)
          : error instanceof Error && known.includes(error.message) ? error.message : PROJECT_TOKEN_CODES.requestFailed
      // eslint-disable-next-line preserve-caught-error -- ZCode rethrows the bare code; the cause may quote server text or a request URL.
      throw new Error(code)
    }
  }

  /** Locate the personal plan's API key (`#n`). */
  private async locate(origin: string, loginToken: string, request: ProjectTokenRequest): Promise<ProjectKeyLocation> {
    const headers = { Authorization: loginToken, 'Content-Type': 'application/json' }
    const organizations = parseOrganizations(readData(await request(`${origin}${CUSTOMER_INFO_PATH}`, { method: 'GET', headers })))
    if (organizations === undefined) throw new Error(PROJECT_TOKEN_CODES.invalidResponse)
    const usable = organizations
      .map(organization => ({ ...organization, projects: organization.projects.filter(project => String(project.projectType ?? '').trim() !== '2') }))
      .filter(organization => organization.organizationId.length > 0 && organization.projects.length > 0)
    const organization = usable.find(entry => entry.organizationName?.includes(DEFAULT_ORGANIZATION_MARKER) === true) ?? usable[0]
    const project = organization?.projects.find(entry => entry.projectName?.includes(DEFAULT_PROJECT_MARKER) === true) ?? organization?.projects[0]
    if (organization === undefined || organization.organizationId.length === 0 || project === undefined || project.projectId.length === 0) throw new Error(PROJECT_TOKEN_CODES.projectUnavailable)
    const target = { organizationId: organization.organizationId, projectId: project.projectId }
    const listUrl = keyListUrl(origin, target)
    const keys = readData(await request(listUrl, { method: 'GET', headers }))
    if (!Array.isArray(keys)) throw new Error(PROJECT_TOKEN_CODES.invalidResponse)
    const existing: unknown = keys.find(entry => isRecord(entry) && 'name' in entry && entry.name === ZCODE_API_KEY_NAME)
    const key = existing ?? readData(await request(listUrl, { method: 'POST', headers, body: JSON.stringify({ name: ZCODE_API_KEY_NAME, usageScene: CODING_PLAN_USAGE_SCENE }) }))
    if (!isRecord(key) || !nonEmptyString(key.apiKey)) throw new Error(PROJECT_TOKEN_CODES.invalidResponse)
    return { ...target, apiKeyId: key.apiKey.trim() }
  }
}

/** `keyListUrl` (`bR`). */
function keyListUrl(origin: string, location: Pick<ProjectKeyLocation, 'organizationId' | 'projectId'>): string {
  return `${origin}/api/biz/v1/organization/${encodeURIComponent(location.organizationId)}/projects/${encodeURIComponent(location.projectId)}/api_keys`
}

interface OrganizationEntry {
  readonly organizationId: string
  readonly organizationName?: string | null | undefined
  readonly projects: ReadonlyArray<{ readonly projectId: string, readonly projectName?: string | null | undefined, readonly projectType?: string | number | null | undefined }>
}

/** `aF`: `organizations` (default []) of `{organizationId, organizationName?, projects (default [])}`; any other shape is undefined. */
function parseOrganizations(data: unknown): readonly OrganizationEntry[] | undefined {
  if (!isRecord(data)) return undefined
  const list = data.organizations ?? []
  if (!Array.isArray(list)) return undefined
  const out: OrganizationEntry[] = []
  for (const entry of list) {
    if (!isRecord(entry) || typeof entry.organizationId !== 'string') return undefined
    if (entry.organizationName !== undefined && entry.organizationName !== null && typeof entry.organizationName !== 'string') return undefined
    const projects = entry.projects ?? []
    if (!Array.isArray(projects)) return undefined
    const parsedProjects: Array<OrganizationEntry['projects'][number]> = []
    for (const project of projects) {
      if (!isRecord(project) || typeof project.projectId !== 'string') return undefined
      const { projectName, projectType } = project
      if (projectName !== undefined && projectName !== null && typeof projectName !== 'string') return undefined
      if (projectType !== undefined && projectType !== null && typeof projectType !== 'string' && typeof projectType !== 'number') return undefined
      parsedProjects.push({ projectId: project.projectId, projectName, projectType })
    }
    out.push({ organizationId: entry.organizationId, organizationName: entry.organizationName, projects: parsedProjects })
  }
  return out
}

/** A stored location as `cF` accepts it (three non-empty strings). */
function parseLocation(stored: string): ProjectKeyLocation | undefined {
  let value: unknown
  try { value = JSON.parse(stored) } catch { return undefined }
  if (!isRecord(value)) return undefined
  const { organizationId, projectId, apiKeyId } = value
  return typeof organizationId === 'string' && organizationId.length > 0 && typeof projectId === 'string' && projectId.length > 0 && typeof apiKeyId === 'string' && apiKeyId.length > 0
    ? { organizationId, projectId, apiKeyId }
    : undefined
}
