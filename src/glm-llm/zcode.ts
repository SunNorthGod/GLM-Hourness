/**
 * Native ZCode client adapter for the DSH LLM seam: assembles the full
 * upstream chain — encrypted credential store → ZCode deviceMid →
 * endpoint routing → identity/auth headers → V4 signing ladder → Anthropic
 * Messages transport. The channel speaks to the ZCode backend exactly the
 * way the desktop client does.
 *
 * coding-plan sends the caller's system as one text block; start-plan
 * replaces it with the gateway-fingerprinted 3-block assembly and pins the
 * currentDate context-prefix message ahead of the first user turn.
 */
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import type { Credential } from './auth/types.ts'
import { loadStoredCredential, saveCredential, clearCredential, updateStoredCredential, type StoreFs } from './auth/store.ts'
import { PollOAuthClient, LOGIN_TIMEOUT_MS, buildPasteAuthorizeUrl } from './auth/oauth.ts'
import { inspectJwt } from './auth/jwt.ts'
import { DEFAULT_IDENTITY, resolveEnvPromptInfo, type ZcodeIdentity } from './identity.ts'
import { ensureCliDeviceMid, readRoutingDeviceMid } from './device-mid.ts'
import { buildAuthHeaders, buildModelRequestHeaders, RequestAttributionTracker, upstreamSessionId, type PlanId, type SessionHeaderLike, type TraceContext } from './headers.ts'
import { EndpointRoutingService, type RoutingCredential } from './endpoint-routing.ts'
import { ClientSigningManager, sendWithClientSigning } from './signing.ts'
import { ProjectAccessTokenClient, projectTokenFingerprint, projectTokenRequest, type ProjectKeyLocationStore, type ResolvedProjectToken } from './auth/project-token.ts'
import { mintRejectionOf, upstreamLimitOf } from './account-signals.ts'
import { loginFingerprintOf, nodeQuotaFs, QuotaJournal } from './quota-journal.ts'
import { metricsWhere, type GlmMetricEvent, type GlmMetricSink } from './metrics.ts'
import { BIGMODEL_API_ORIGIN } from './zcode-wire.ts'
import { encodeRequest, decodeMessage, decodeSse, metadataUserId, splitSystemPrompt, type WireShape } from './anthropic.ts'
import { wireFace } from './face-wire.ts'
import { glmImageRequestTarget, prepareRequestImages } from './images.ts'
import { buildStartPlanSystem, buildContextPrefixMessage } from './start-plan.ts'
import { GLM_CONTEXT_WINDOW, GLM_DEFAULT_MAX_TOKENS, GLM_MODELS, GLM_REASONING_EFFORTS, glmInputModalities, zcodeModelRule, zcodeWireModelId } from './models.ts'
import { maxOutputTokensFor } from './token-budget.ts'
import { messageText, type AttachmentsLike, type GenerateOptionsLike } from '../shared/lm-min.ts'
import { isGlmModel } from '../shared/route.ts'
import type { FacePolicyRegistry } from '../shared/face-policy.ts'
import type { HealthState } from '../shared/health.ts'
import type { MetricsWhere } from '../shared/metrics.ts'
import type {
  GenerateOptions,
  LlmAdapter,
  LlmModelInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ReasoningEffortId,
  StreamChunk as LlmStreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'

/** Bigmodel coding-plan Anthropic endpoint (the provider baseURL, before server-side remapping; its origin hosts the signing handshake). */
const BIGMODEL_ANTHROPIC_BASE = 'https://open.bigmodel.cn/api/anthropic'

/** A refused login is recorded once per path and login in this long. */
const REJECTION_RECORD_INTERVAL_MS = 10 * 60_000

/**
 * The failures 3.16.3 reports when an account model request has no request
 * credential (desktop host `AccountRequestCredentialUnavailableError`,
 * `out/host/index.js` +1200545): no OAuth access token names the family, no
 * account identity names the provider of the individual coding plan.
 */
const CREDENTIAL_UNAVAILABLE_FAMILY = 'Account request credential is unavailable: bigmodel'
const CREDENTIAL_UNAVAILABLE_PROVIDER = 'Account request credential is unavailable: account:bigmodel-individual-coding-plan'
/** start-plan without its plan JWT (the same 3.16.3 error, for the start-plan provider). */
const START_PLAN_CREDENTIAL_UNAVAILABLE = 'Account request credential is unavailable: account:bigmodel-start-plan'

/** Values of a 401 body that mark a request-security failure, not a rejected project token (3.16.3 `isRequestSecurityFailure` `Vrt` @1090655). */
const SECURITY_FAILURE_VALUES: ReadonlySet<unknown> = new Set(['VERIFY_APIKEY_EXPIRED', 'VERIFY_SIGNATURE_INVALID', '3007'])

/**
 * Row-health suffix when the deviceMid could not be written to ZCode's
 * state file and the id generated in this process is sent (device-mid.ts;
 * 3.16.3 `ensureCliDeviceMid` falls back to it silently).
 */
const DEVICE_MID_TEMPORARY_NOTE = '；设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID'

/** The provider group name in DSH's model picker; Chinese like the picker's own groups (DeepSeek 账号). */
const PROVIDER_DISPLAY_NAME = 'GLM（ZCode 原生通道）'

export interface ZcodeAdapterOptions {
  /** Agent home directory: `<home>/credentials.json`. */
  readonly home: string
  /** Plan tier: coding-plan (default) or start-plan (gateway 3-block prompt). */
  readonly plan?: PlanId
  /** Registered provider route id. */
  readonly providerId?: string
  readonly identity?: ZcodeIdentity
  readonly fetchImpl?: typeof fetch
  readonly env?: NodeJS.ProcessEnv
  /** Optional sink for fail-open signing/routing notices. */
  readonly onEvent?: (message: string) => void
  /** Injected credential-store filesystem for tests. */
  readonly storeFs?: StoreFs
  /** The durable attachment service, read per request (images need it). */
  readonly resolveAttachments?: () => AttachmentsLike | undefined
  /** Map a host path into the tool execution world (the `fs` service), for offloaded-image placeholders. */
  readonly mapHostPath?: (hostPath: string) => string | undefined
  /** Row health sink (src/shared/health.ts): each request's outcome, keyed by its session. */
  readonly report?: (sessionId: string | undefined, state: HealthState, reason: string) => void
  /** The header of a live DSH session (the `agents` service), read per request to tell a delegated child. */
  readonly sessionHeader?: (sessionId: string) => SessionHeaderLike | undefined
  /**
   * The face-policy registry (the `glmHournessFaces` service), read per
   * request: the role layer of the wire face. Undefined reads as no role
   * layer — the dialect layer still runs (src/glm-llm/face-wire.ts).
   */
  readonly facePolicy?: () => FacePolicyRegistry | undefined
  /** The quota journal that takes the upstream-limit and login-rejected records; default the journal under `home`. */
  readonly journal?: QuotaJournal
  /** Where each of those records also goes as a metric event (src/glm-llm/metrics.ts); without it none is made. */
  readonly metric?: GlmMetricSink
  /** The clock of those records, epoch milliseconds; default `Date.now`. */
  readonly now?: () => number
  /** The context window declared to DSH and capping each step's output budget (the glm-llm row's `contextWindow`); default 512000 (docs/DESIGN.md §4.6). */
  readonly contextWindow?: number
}

const storeFsDefault: StoreFs = {
  readFile: path => readFile(path, 'utf8'),
  writeFile: (path, data) => writeFile(path, data),
  rename,
  unlink,
  stat: path => nodeQuotaFs.stat(path),
}

/**
 * The stored login as the quota reader needs it (docs/DESIGN.md §4.9):
 * `present` with the fingerprint of the login token, `absent` (no file, an
 * empty file after /glm-logout, no login token in it, or a file that cannot
 * be decrypted, then `unreadable`), or `unknown` when the file's metadata
 * could not be read.
 */
export type LoginIdentity =
  | { readonly kind: 'present', readonly fingerprint: string }
  | { readonly kind: 'absent', readonly unreadable?: true }
  | { readonly kind: 'unknown', readonly reason: string }

/** Interactive login state shared between the /glm-login and /glm-status commands. */
export interface LoginHandle {
  /** The authorize URL shown to the user, once started. */
  authorizeUrl?: string
  startedAt?: number
  error?: string
}

/**
 * One native-channel login: start() shows the authorize URL, complete()
 * resolves and persists the credential. Both poll-flow primary and the
 * paste-flow fallback land in the same store.
 */
export class ZcodeLogin {
  private readonly fetchImpl: typeof fetch
  private readonly home: string
  private readonly storeFs: StoreFs
  readonly state: LoginHandle = {}

  constructor(opts: { home: string, fetchImpl?: typeof fetch, storeFs?: StoreFs }) {
    this.home = opts.home
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.storeFs = opts.storeFs ?? storeFsDefault
  }

  /** Start the server-mediated CLI flow; returns the URL to open in a browser. */
  async start(): Promise<string> {
    const client = new PollOAuthClient(this.fetchImpl)
    const started = await client.start()
    this.state.authorizeUrl = started.authorizeUrl
    this.state.startedAt = Date.now()
    void this.settle(client)
    return started.authorizeUrl
  }

  /**
   * Complete the started flow and persist the login tokens, as the 3.16.3
   * desktop stores its OAuth token set: no API key is resolved here; the
   * project key is located on the first request that needs a project token.
   */
  private async settle(client: PollOAuthClient): Promise<void> {
    try {
      const tokens = await client.complete(LOGIN_TIMEOUT_MS)
      const stored: Credential = {
        version: 2,
        provider: 'bigmodel',
        oauthAccessToken: tokens.accessToken,
        ...(tokens.userId === undefined ? {} : { userId: tokens.userId }),
        ...(tokens.jwt === undefined ? {} : { jwt: tokens.jwt }),
      }
      await saveCredential(this.storeFs, this.credentialPath(), stored)
      delete this.state.error
    }
    catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error)
    }
  }

  /** Headless paste fallback: authorize URL for the user to open and paste back. */
  buildPasteUrl(callbackUrl: string, state: string): string {
    return buildPasteAuthorizeUrl(callbackUrl, state)
  }

  private credentialPath(): string {
    return `${this.home.replace(/[\\/]+$/, '')}/credentials.json`
  }
}

/**
 * The native ZCode adapter. Each stream resolves the credential fresh (a
 * completed /glm-login lands on the very next request) and never throws at
 * construction — a missing credential fails the stream with the re-login
 * instruction.
 *
 * Contract enforcement lives in the `AdapterContractCheck` type at the bottom
 * of this file: tsc validates every public method signature and return shape
 * against the installed @deepseek-ai/dsh-llm types, so contract drift fails
 * `npm run build` instead of the user's next restart.
 */
export class ZcodeAdapter {
  private readonly options: Required<Pick<ZcodeAdapterOptions, 'home'>> & ZcodeAdapterOptions
  private readonly routing: EndpointRoutingService
  private readonly signer: ClientSigningManager
  private readonly projectTokens: ProjectAccessTokenClient
  private readonly attribution: RequestAttributionTracker
  /** In-flight project token loads per (OAuth token, account, rejected fingerprint), as 3.16.3 `loadCodingPlanMaterial` shares them. */
  private readonly projectTokenLoads = new Map<string, Promise<ResolvedProjectToken>>()
  /** The credential the latest coding-plan request resolved, for the routed handshake. */
  private routingCredential: RoutingCredential = {}
  private readonly journal: QuotaJournal
  /** When a refused login was last recorded, per path and login fingerprint. */
  private readonly rejectionRecords = new Map<string, number>()
  /** The login identity of the credential file as of its size and modification time. */
  private identity: { readonly size: number, readonly mtimeMs: number, readonly value: LoginIdentity } | undefined

  constructor(options: ZcodeAdapterOptions) {
    this.options = options
    this.journal = options.journal ?? new QuotaJournal({ home: options.home })
    this.routing = new EndpointRoutingService({
      identity: { ...DEFAULT_IDENTITY, ...options.identity },
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.env === undefined ? {} : { env: options.env }),
      // The config request's X-Device-Mid is read as 3.16.3 `Kuc` reads it: never generated.
      deviceMid: () => readRoutingDeviceMid(this.env()),
    })
    this.signer = new ClientSigningManager({
      handshakeFetch: (input, init) => this.routedHandshake(input, init),
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    })
    this.attribution = new RequestAttributionTracker(sessionId => options.sessionHeader?.(sessionId))
    this.projectTokens = new ProjectAccessTokenClient({ request: projectTokenRequest(options.fetchImpl ?? fetch), locationStore: this.locationStore() })
  }

  /**
   * The project-key location persisted in the credential record (3.16.3
   * keeps it in its credential service under the same key): read, write and
   * drop by read-modify-write of the stored login in the store's write
   * queue, so a /glm-login that lands meanwhile is never overwritten. A
   * location is kept only while the stored OAuth token is the one it was
   * resolved with.
   */
  private locationStore(): ProjectKeyLocationStore {
    const write = (update: (credential: Credential) => Credential | undefined): Promise<void> =>
      updateStoredCredential(this.options.storeFs ?? storeFsDefault, this.credentialPath(), update)
    return {
      load: async key => {
        const location = (await this.loadCredential())?.location
        return location?.key === key ? location.value : undefined
      },
      save: (key, value, loginToken) => write(credential => credential.oauthAccessToken?.trim() === loginToken ? { ...credential, location: { key, value } } : undefined),
      delete: key => write(({ location, ...rest }) => location?.key === key ? rest : undefined),
    }
  }

  /**
   * The project access token of a coding-plan request, as 3.16.3 account
   * mode resolves its request credential (desktop
   * `AccountProviderRequestAuthService.resolveCurrent` and
   * `loadCodingPlanMaterial`, `out/host/index.js` +1200545, +1204641):
   * without an OAuth token or account identity it fails with the 3.16.3
   * message; a login that changed while the token was minted invalidates
   * the result. Throws an Error whose message is the 3.16.3 code or text.
   */
  private projectToken(credential: Credential, where: MetricsWhere, rejectedFingerprint?: string): Promise<ResolvedProjectToken> {
    const missing = missingAccountCredential(credential)
    if (missing !== undefined) return Promise.reject(new Error(missing))
    const oauth = credential.oauthAccessToken?.trim() ?? ''
    const accountId = credential.userId ?? ''
    const key = JSON.stringify([oauth, accountId, rejectedFingerprint ?? null])
    const shared = this.projectTokenLoads.get(key)
    if (shared !== undefined) return shared
    const load = (async () => {
      const resolved = await this.projectTokens.resolve({
        origin: BIGMODEL_API_ORIGIN,
        loginToken: oauth,
        accountId,
        clientVersion: { ...DEFAULT_IDENTITY, ...this.options.identity }.appVersion,
        ...(rejectedFingerprint === undefined ? {} : { rejectedFingerprint }),
      }).catch(async (error: unknown) => {
        // A refused login is noted for the quota view (docs/DESIGN.md §4.9); the error goes on unchanged.
        // A load callers share is filed under the caller that started it.
        const rejection = mintRejectionOf(error instanceof Error ? error.message : '')
        if (rejection !== undefined) await this.noteLoginRejected('mint', oauth, rejection, where)
        throw error
      })
      const current = await this.loadCredential().catch(() => undefined)
      if (current?.oauthAccessToken?.trim() !== oauth) throw new Error('project_token_scope_invalidated')
      return resolved
    })()
    this.projectTokenLoads.set(key, load)
    const release = (): void => { if (this.projectTokenLoads.get(key) === load) this.projectTokenLoads.delete(key) }
    load.then(release, release)
    return load
  }

  private clock(): number {
    return (this.options.now ?? Date.now)()
  }

  /**
   * Note in the quota journal that the server refused the login (docs/DESIGN.md
   * §4.9): once per path and per login in ten minutes, with the fingerprint of
   * the login token and never the token. The journal never throws. Each
   * record written is one `glm.login-rejected` (M6 design §14.2) for `where`:
   * the path and the status or code, no fingerprint.
   */
  private async noteLoginRejected(path: 'model' | 'mint', loginToken: string, detail: { readonly status: 401 | 403 } | { readonly code: string }, where: MetricsWhere): Promise<void> {
    const now = this.clock()
    const login = loginToken.trim().length === 0 ? undefined : loginFingerprintOf(loginToken)
    const key = `${path}:${login ?? ''}`
    const last = this.rejectionRecords.get(key)
    if (last !== undefined && now - last < REJECTION_RECORD_INTERVAL_MS) return
    this.rejectionRecords.set(key, now)
    await this.journal.append({ at: new Date(now).toISOString(), kind: 'login-rejected', path, ...detail, ...(login === undefined ? {} : { login }) })
    this.metric({ k: 'glm.login-rejected', body: { path, ...detail } }, where)
  }

  /** Note in the quota journal that a 429 body announces a spent quota (docs/DESIGN.md §4.6), and hand one `glm.upstream-limit` for the record. */
  private async noteUpstreamLimit(body: string, where: MetricsWhere): Promise<void> {
    const now = this.clock()
    const limit = upstreamLimitOf(body, now)
    if (limit === undefined) return
    await this.journal.append({ at: new Date(now).toISOString(), kind: 'upstream-limit', code: limit.code, ...(limit.until === undefined ? {} : { until: new Date(limit.until).toISOString() }) })
    this.metric({ k: 'glm.upstream-limit', body: { code: limit.code, hasReset: limit.until !== undefined } }, where)
  }

  /** Hand one event to the metrics sink; nothing without one, and a sink that throws changes no request. */
  private metric(event: GlmMetricEvent, where: MetricsWhere): void {
    try {
      this.options.metric?.(event, where)
    }
    catch {
      // The sink never throws; the record in the quota journal is the fact.
    }
  }

  /**
   * The request credential of the quota read: the project access token of
   * the coding plan, from the same cache as the model requests (3.17.1 reads
   * the quota with the account's request credential for `reason: "usage"`,
   * which takes no rejected fingerprint). The experience plan has no
   * five-hour or weekly quota, so it throws `start-plan` before the
   * credential is read and nothing is sent; no login throws `not-logged-in`;
   * a token that cannot be minted throws its `zcode-wire.ts`
   * PROJECT_TOKEN_CODES code or the 3.16.3 credential message. `where` is
   * the read's asker, for a refused login the mint meets.
   */
  async usageAuthorization(where: MetricsWhere = {}): Promise<string> {
    if ((this.options.plan ?? 'coding-plan') === 'start-plan') throw new Error('start-plan')
    const credential = await this.loadCredential().catch(() => undefined)
    if (credential === undefined) throw new Error('not-logged-in')
    return (await this.projectToken(credential, where)).token
  }

  /**
   * Which login is stored (docs/DESIGN.md §4.9). When the store reports the
   * file's size and modification time, the file is decrypted again only after
   * one of them changed; an empty file (/glm-logout writes one) or a missing
   * one is absent without decrypting.
   */
  async loginIdentity(): Promise<LoginIdentity> {
    const storeFs = this.options.storeFs ?? storeFsDefault
    let meta: { readonly size: number, readonly mtimeMs: number } | undefined
    if (storeFs.stat !== undefined) {
      try {
        meta = await storeFs.stat(this.credentialPath())
      }
      catch (error) {
        return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) }
      }
      if (meta === undefined || meta.size === 0) return { kind: 'absent' }
      if (this.identity?.size === meta.size && this.identity.mtimeMs === meta.mtimeMs) return this.identity.value
    }
    const value = await this.loadCredential().then((credential): LoginIdentity => {
      const token = credential?.oauthAccessToken?.trim() ?? ''
      return token.length === 0 ? { kind: 'absent' } : { kind: 'present', fingerprint: loginFingerprintOf(token) }
    }, (): LoginIdentity => ({ kind: 'absent', unreadable: true }))
    if (meta !== undefined) this.identity = { size: meta.size, mtimeMs: meta.mtimeMs, value }
    return value
  }

  /**
   * The signing handshake goes through endpoint routing like the model
   * request: in 3.16.3 the signer's transport is the routing fetch. The
   * routing table matches whole URLs, so the handshake is only rewritten
   * when the server maps the handshake URL itself.
   */
  private async routedHandshake(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const routed = await this.routing.resolve(url, this.routingCredential)
    const fetchImpl = this.options.fetchImpl ?? fetch
    return fetchImpl(routed.url, routed.routed ? routedInit(init, routed.headers) : init)
  }

  /**
   * Provider route display metadata (LlmAdapter base contract): the group
   * name the composer's model picker shows. The settings page
   * (ui/src/channel.js) quotes the same name.
   */
  providerInfo(provider: string): { id: string, name: string } {
    return { id: provider, name: PROVIDER_DISPLAY_NAME }
  }

  /** No route-owned retry policy (LlmAdapter base contract: undefined = defaults). */
  providerRetryPolicy(_provider: string): undefined {
    return undefined
  }

  /** No route-owned image request pricing (LlmAdapter base contract). */
  imageRequestPricing(_provider: string, _model: string): undefined {
    return undefined
  }

  /**
   * ZCode's model-image bounds (long edge 2000 px, base64 within 5 MiB); the
   * same target the request encoder reads each image version with, as the
   * LlmAdapter contract requires.
   */
  imageRequestTarget(_provider: string, _model: string, image: ImageAttachmentRef): ImageRequestTarget {
    return glmImageRequestTarget(image)
  }

  /** Bind metadata and dispatch to one adapter generation (LlmAdapter base contract). */
  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: options => this.stream(options),
    }
  }

  /** Advertise the catalog models for GUI selection (LlmAdapter base contract). */
  listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(GLM_MODELS.map(model => ({ provider, id: model.id, name: model.name, inputModalities: [...model.inputModalities] })))
  }

  resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      // A text-only declaration makes DSH project images to text before stream().
      inputModalities: [...glmInputModalities(model)],
      context: { contextWindow: this.contextWindow() },
      defaultMaxTokens: GLM_DEFAULT_MAX_TOKENS,
      // No `systemPromptUpdate`: Anthropic has no mid-conversation system
      // role, so a changed prompt must rewrite the leading system message
      // (which the encoder lifts into the `system` field).
      reasoning: { efforts: GLM_REASONING_EFFORTS.map(effort => ({ ...effort, id: effort.id as ReasoningEffortId })), defaultEffort: 'high' as ReasoningEffortId },
    })
  }

  private credentialPath(): string {
    return `${this.options.home.replace(/[\\/]+$/, '')}/credentials.json`
  }

  /** The context window this adapter declares to DSH; the row hands in a validated value. */
  private contextWindow(): number {
    return this.options.contextWindow ?? GLM_CONTEXT_WINDOW.default
  }

  /** The stored login, migrated to the version-2 record on first read (auth/store.ts `loadStoredCredential`). */
  private loadCredential(): Promise<Credential | undefined> {
    return loadStoredCredential(this.options.storeFs ?? storeFsDefault, this.credentialPath())
  }

  private env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env
  }

  /**
   * Signed-in status for the /glm-status command. A stored login the plan
   * cannot use (coding-plan without an OAuth token or account id, start-plan
   * without its plan JWT) is not logged in: `incomplete` names the 3.16.3
   * reason the request fails closed with.
   */
  async status(): Promise<{ logged: boolean, plan: PlanId, incomplete?: string, keyPreview?: string, userId?: string, jwtAgeHours?: number }> {
    const credential = await this.loadCredential().catch(() => undefined)
    const plan = this.options.plan ?? 'coding-plan'
    if (credential === undefined) return { logged: false, plan }
    const incomplete = plan === 'start-plan'
      ? (credential.jwt ?? '').length === 0 ? START_PLAN_CREDENTIAL_UNAVAILABLE : undefined
      : missingAccountCredential(credential)
    if (incomplete !== undefined) return { logged: false, plan, incomplete }
    const jwtInfo = plan === 'start-plan' && credential.jwt !== undefined ? inspectJwt(credential.jwt) : undefined
    return {
      logged: true,
      plan,
      keyPreview: keyPreviewOf(credential),
      ...(credential.userId === undefined ? {} : { userId: credential.userId }),
      ...(jwtInfo === null || jwtInfo === undefined ? {} : { jwtAgeHours: Math.round(jwtInfo.ageHours * 10) / 10 }),
    }
  }

  async * stream(request: GenerateOptions): AsyncIterable<LlmStreamChunk> {
    // The DSH request vocabulary is a structural superset of the internal
    // wire shape; the cast documents that boundary in one place.
    const options = request as unknown as GenerateOptionsLike
    // The wire face (face-migration design 0.1 §4.3): the request's tool face
    // is rewritten here, at the adapter's stream — on the installed
    // 0.2.2-rc.1 runtime the one seam a request's face passes through, since
    // the runtime appends its collected face after the assemble waterfall and
    // overwrites anything the waterfall wrote back (docs/DESIGN.md §2.4a). On
    // rc.3 the adapter received the listeners' rewritten face as
    // `options.tools`; composing the same face here restores the parity of
    // the upstream body. A compaction or session-title request carries the
    // tools of its session's last request header, so it takes the same
    // rewrite the rc.3 adapter saw.
    const tools = wireFace(options.tools ?? [], {
      glm: isGlmModel(request.model),
      sessionId: request.sessionId ?? '',
      policy: this.options.facePolicy?.(),
    })
    const plan = this.options.plan ?? 'coding-plan'
    const report = (state: HealthState, reason: string): void => this.options.report?.(request.sessionId, state, reason)
    const credential = await this.loadCredential().catch((error: unknown) => {
      report('inactive', `凭证不可读：${(error as Error).message}`)
      throw error
    })
    if (credential === undefined) {
      report('inactive', '未登录：凭证为空，运行 /glm-login')
      // The Chinese line first (plain-ui 1.3 §6.3): a person who has not logged in reads where to click; the English text stays for the log.
      throw new Error('还没登录 GLM：点输入框下方的 GLM 按钮登录；glm-zcode: not logged in — run /glm-login (the credential store is empty)')
    }
    const fetchImpl = this.options.fetchImpl ?? fetch
    // coding-plan: the project access token is the request credential; 3.16.3
    // account mode sends nothing without it (ModelRequestAuthMissing), so the
    // stream fails before any request leaves.
    // A refused login or a spent quota this request meets is filed under its session (metrics design §3.5).
    const where = metricsWhere(request.sessionId)
    let projectToken = plan === 'coding-plan' ? await this.projectToken(credential, where).catch((error: unknown) => failClosed(report, error)) : undefined
    // start-plan: the plan JWT is the request credential (3.16.3 `resolveCurrent`, `requireApiKey(zcodeJwtToken)`).
    const startPlanJwt = credential.jwt ?? ''
    if (plan === 'start-plan' && startPlanJwt.length === 0) {
      report('inactive', `未拿到套餐 JWT（${START_PLAN_CREDENTIAL_UNAVAILABLE}），运行 /glm-login`)
      throw new Error(`glm-zcode: plan JWT unavailable (${START_PLAN_CREDENTIAL_UNAVAILABLE}) — run /glm-login to sign in again`)
    }
    // metadata.user_id names ZCode's deviceMid; when the state file has
    // none, one is generated and written back (3.16.3 `ensureCliDeviceMid`,
    // device-mid.ts). It never fails: a failed write yields a temporary id.
    const device = await ensureCliDeviceMid({ env: this.env() })
    const identity = { ...DEFAULT_IDENTITY, ...this.options.identity }

    // System blocks: DSH delivers the system prompt as leading system
    // messages; coding-plan sends it as one block, start-plan wraps it in the
    // gateway-fingerprinted 3-block assembly.
    const { system, messages: history } = splitSystemPrompt(options)
    const systemBlocks = plan === 'start-plan'
      ? buildStartPlanSystem(system, resolveEnvPromptInfo(this.options.env), 'bigmodel', options.model)
      : system.length === 0 ? [] : [{ type: 'text' as const, text: system }]
    const messages = plan === 'start-plan' && !hasCurrentDatePrefix(history)
      ? [buildContextPrefixMessage(), ...history]
      : history
    const images = await prepareRequestImages(messages, this.options.resolveAttachments?.(), this.options.mapHostPath, options.signal)
    // One x-session-id per DSH session, the gateway's cache affinity key
    // (DESIGN.md §4.5b); metadata.user_id carries the same id as the
    // header, as ZCode's does. coding-plan follows the 3.16.3 attribution
    // (session trace, turn query id, query source, subagent type);
    // start-plan keeps its earlier shape.
    const attribution: Omit<TraceContext, 'requestId'> = plan === 'coding-plan'
      ? this.attribution.attribute({ sessionId: request.sessionId, purpose: request.purpose, reasoningEffort: options.reasoningEffort, tools, messages: options.messages })
      : { sessionId: upstreamSessionId(request.sessionId), sessionType: request.purpose === undefined ? 'main' : 'other', traceId: randomUUID() }
    const wire = plan === 'coding-plan' ? codingPlanWire(options, request.purpose, this.attribution.stepEffortOf(request.sessionId), this.contextWindow()) : undefined
    const body = JSON.stringify(encodeRequest({ ...options, tools, messages }, systemBlocks, images, metadataUserId(device.value, attribution.sessionId), wire))
    const upstreamBase = `${BIGMODEL_ANTHROPIC_BASE}/v1/messages`

    // One attempt: route, assemble, sign, send. 3.16.3 wraps the routing
    // fetch in the signing fetch: the signer sees the provider URL before
    // routing (its origin hosts the handshake), and the routing headers land
    // after the signature block. start-plan is not signed (3.16.3
    // `requiresClientRequestSigning`).
    const attempt = async (token: ResolvedProjectToken | undefined): Promise<Response> => {
      const routingCredential: RoutingCredential = { apiKeyId: token?.apiKeyId, zcodeJwt: credential.jwt }
      if (token !== undefined) this.routingCredential = routingCredential
      const routed = await this.routing.resolve(upstreamBase, routingCredential).catch((): { routed: boolean, url: string, headers?: Record<string, string> } => ({ routed: false, url: upstreamBase }))
      // x-request-id is fresh per attempt (3.16.3 `Gdt` @4067222: `requestId ?? crypto.randomUUID()` per attempt).
      const trace = { ...attribution, requestId: randomUUID() }
      const headers = token !== undefined
        ? buildModelRequestHeaders({ token: token.token, identity, trace, generateText: request.purpose === 'session-title', ...(this.options.env === undefined ? {} : { env: this.options.env }) })
        : { ...buildAuthHeaders(startPlanJwt, identity, trace, this.options.env), 'content-type': 'application/json' }
      return sendWithClientSigning(token === undefined ? null : this.signer, {
        url: upstreamBase,
        headers,
        credential: token?.token ?? '',
        appVersion: identity.appVersion,
        send: signed => fetchImpl(routed.url, {
          method: 'POST',
          ...(routed.routed ? routedInit({ headers: signed }, routed.headers) : { headers: signed }),
          body,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        }),
      })
    }
    let response = await attempt(projectToken)
    // 3.16.3 `AccountRequestRetry`: a 401 that is not a request-security
    // failure rejects the project token; refresh it once, forcing a new
    // mint, and retry once as a new attempt.
    if (projectToken !== undefined && await isProjectTokenRejection(response)) {
      // The rejected answer is done with (its clone was read for the check):
      // cancel its body before the retry so nothing stays buffered or
      // open, as 3.16.3 drains discarded bodies (`DQr` @3843990).
      await response.body?.cancel().catch(() => { /* already closed */ })
      projectToken = await this.projectToken(credential, where, await projectTokenFingerprint(projectToken.token)).catch((error: unknown) => failClosed(report, error))
      response = await attempt(projectToken)
      // A token that was just minted and is refused again: the login itself is no longer accepted.
      if (await isProjectTokenRejection(response)) await this.noteLoginRejected('model', credential.oauthAccessToken ?? '', { status: 401 }, where)
    }
    if (!response.ok) {
      report('inactive', `上游返回 ${response.status}`)
      const detail = await response.text()
      if (response.status === 429) await this.noteUpstreamLimit(detail, where)
      throw new Error(`glm-zcode ${response.status}: ${detail.slice(0, 400)}`)
    }
    if (wire?.stream === false) {
      // The session title goes out as 3.16.3 `generateText` sends it: one JSON answer.
      const message: unknown = await response.json()
      report('active', `上游已应答（套餐 ${plan}）${device.temporary ? DEVICE_MID_TEMPORARY_NOTE : ''}`)
      yield* decodeMessage(message, options.model) as LlmStreamChunk[]
      return
    }
    if (response.body === null) throw new Error('glm-zcode: response has no stream body')
    report('active', `上游已应答（套餐 ${plan}）${device.temporary ? DEVICE_MID_TEMPORARY_NOTE : ''}`)
    // decodeSse emits the internal structural chunk vocabulary; it is
    // field-compatible with the DSH StreamChunk protocol (only the branded id
    // types differ, and brands exist only at the type level).
    yield* decodeSse(response.body, options.model) as AsyncIterable<LlmStreamChunk>
  }
}

/**
 * The 3.16.3 body shape of a coding-plan request (docs/DESIGN.md §4.5):
 * the official model casing, and for a catalog model the option map of its
 * reasoning level: the DSH effort when the catalog lists it, else `high`
 * (the DSH default, §4.6); the session title uses the catalog's first level
 * (3.16.3 `auxiliaryModelOptions` `PP` @7759001); compaction uses the
 * effort of the session's latest main step (`sessionEffort`), as 3.16.3
 * compacts with the session's selection (`c3a` @13387356), and the
 * request's own effort before the session's first step.
 */
function codingPlanWire(options: GenerateOptionsLike, purpose: GenerateOptions['purpose'], sessionEffort: string | undefined, declaredWindow: number): WireShape {
  const rule = zcodeModelRule(options.model)
  const requested = purpose === 'compaction' ? sessionEffort ?? options.reasoningEffort : options.reasoningEffort
  const level = rule === undefined ? undefined : purpose === 'session-title' ? rule.reasoningLevels[0] : requested !== undefined && rule.reasoningLevels.includes(requested) ? requested : 'high'
  // max_tokens as 3.16.3 picks it (token-budget.ts); DSH's maxTokens is not
  // used for catalog models. Outside the catalog the DSH value stays. The
  // step's window is the smaller of the window declared to DSH and the
  // catalog's (a deviation from 3.16.3/3.17.1, which take the catalog's;
  // docs/DESIGN.md §4.6): the output budget and DSH's compaction then count
  // against the same window.
  const kind = purpose === 'session-title' ? 'auxiliary' : purpose === 'compaction' ? 'compaction' : 'step'
  return {
    model: zcodeWireModelId(options.model),
    maxTokens: rule === undefined ? options.maxTokens ?? GLM_DEFAULT_MAX_TOKENS : maxOutputTokensFor(kind, rule.maxOutputTokens, Math.min(declaredWindow, rule.contextWindow), options.messages),
    // 3.16.3 sends the session title through `generateText` (`v4a` @13066475), every other request through `streamText`.
    stream: purpose !== 'session-title',
    optionPatch: rule === undefined || level === undefined ? undefined : rule.optionPatch(level),
  }
}

/**
 * The init of a routed request (3.16.3 `createRoutingFetch` `Ngn` @3839971
 * with `f5s` @3840311): a `Headers` copy of the request headers without `host`, then
 * the routing headers `set` after everything already there, so
 * `X-ZCode-Authorization` follows the signature block on the wire.
 */
function routedInit(init: RequestInit | undefined, routingHeaders: Readonly<Record<string, string>> | undefined): RequestInit | undefined {
  if (init?.headers === undefined && routingHeaders === undefined) return init
  const headers = new Headers(init?.headers)
  headers.delete('host')
  for (const [name, value] of Object.entries(routingHeaders ?? {})) headers.set(name, value)
  return { ...init, headers }
}

/**
 * The 3.16.3 reason a stored login cannot mint a project access token
 * (desktop `AccountRequestCredentialUnavailableError`): no OAuth access
 * token names the family, no account id names the provider. Undefined when
 * both are there.
 */
function missingAccountCredential(credential: Credential): string | undefined {
  if ((credential.oauthAccessToken?.trim() ?? '').length === 0) return CREDENTIAL_UNAVAILABLE_FAMILY
  if ((credential.userId?.trim() ?? '').length === 0) return CREDENTIAL_UNAVAILABLE_PROVIDER
  return undefined
}

/**
 * Fail a coding-plan stream that has no project access token, as ZCode
 * account mode fails the model request (3.16.3 and 3.17.1 alike): nothing
 * is sent, the row health goes inactive, and the error names the ZCode code
 * or message (never a token) with the re-login instruction.
 */
function failClosed(report: (state: HealthState, reason: string) => void, error: unknown): never {
  const code = error instanceof Error ? error.message : String(error)
  report('inactive', `未拿到项目令牌（${code}），按 3.17.1 不发送；运行 /glm-login`)
  throw new Error(`glm-zcode: project access token unavailable (${code}) — run /glm-login to sign in again`)
}

/**
 * Whether a response rejects the project token (3.16.3 `isProjectTokenRejection`
 * `$Hs` @4144643): HTTP 401 whose error body is not a request-security
 * failure (`VERIFY_APIKEY_EXPIRED`, `VERIFY_SIGNATURE_INVALID`, `3007` in the
 * envelope's message, reason or provider error code). Reads a clone.
 */
async function isProjectTokenRejection(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  let body: unknown
  try { body = await response.clone().json() } catch { return true }
  const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const envelope = record(body)
  const data = record(envelope.data)
  const failure = record(envelope.error)
  const values = [envelope.msg, envelope.reason, envelope.code, data.reason, failure.reason, failure.message, failure.code]
  return !values.some(value => SECURITY_FAILURE_VALUES.has(typeof value === 'number' ? String(value) : value))
}

/** The /glm-status key preview: the located API key id's first six characters, `unresolved` before the first project token. */
function keyPreviewOf(credential: Credential): string {
  if (credential.location === undefined) return 'unresolved'
  try {
    const { apiKeyId } = JSON.parse(credential.location.value) as { apiKeyId?: unknown }
    return typeof apiKeyId === 'string' && apiKeyId.length > 0 ? `${apiKeyId.slice(0, 6)}…` : 'unresolved'
  }
  catch {
    return 'unresolved'
  }
}

/** Whether the first user turn already carries the currentDate context prefix (start-plan pins it once). */
function hasCurrentDatePrefix(messages: readonly GenerateOptionsLike['messages'][number][]): boolean {
  const first = messages.find(message => message.role === 'user')
  const text = first === undefined ? '' : messageText(first, '\n')
  return text.includes('# currentDate') && text.includes('<system-reminder>')
}

/** Remove the stored credential (logout command). */
export function logout(home: string, storeFs: StoreFs = storeFsDefault): Promise<void> {
  return clearCredential(storeFs, `${home.replace(/[\\/]+$/, '')}/credentials.json`)
}

/**
 * Compile-time contract check against the installed @deepseek-ai/dsh-llm
 * types. `implements LlmAdapter` is unavailable because LlmAdapter is an
 * abstract class with non-public members, so the structural check lives in a
 * type alias: any signature or return-shape drift between ZcodeAdapter and
 * the adapter contract makes `npm run build` fail here.
 */
type LlmAdapterPublicSurface = { [K in keyof LlmAdapter]: LlmAdapter[K] }
export type AdapterContractCheck = ZcodeAdapter extends LlmAdapterPublicSurface ? true : never
/** Referenced so the conditional type is evaluated by tsc. */
const adapterContractCheck: AdapterContractCheck = true
void adapterContractCheck
