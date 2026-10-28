/**
 * Native ZCode client adapter for the DSH LLM seam: assembles the full
 * upstream chain — encrypted credential store → persistent deviceMid →
 * endpoint routing → identity/auth headers → V4 signing ladder → Anthropic
 * Messages transport. The channel speaks to the ZCode backend exactly the
 * way the desktop client does.
 *
 * coding-plan sends the caller's system as one text block; start-plan
 * replaces it with the gateway-fingerprinted 3-block assembly and pins the
 * currentDate context-prefix message ahead of the first user turn.
 */
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import type { Credential } from './auth/types.ts'
import { loadStoredCredential, saveCredential, clearCredential, type StoreFs } from './auth/store.ts'
import { PollOAuthClient, LOGIN_TIMEOUT_MS, buildPasteAuthorizeUrl } from './auth/oauth.ts'
import { inspectJwt } from './auth/jwt.ts'
import { DEFAULT_IDENTITY, ensureDeviceMid, resolveEnvPromptInfo, type ZcodeIdentity } from './identity.ts'
import { readCliDeviceMid, readRoutingDeviceMid } from './device-mid.ts'
import { buildAuthHeaders, buildModelRequestHeaders, RequestAttributionTracker, upstreamSessionId, type PlanId, type SessionHeaderLike, type TraceContext } from './headers.ts'
import { EndpointRoutingService, type RoutingCredential } from './endpoint-routing.ts'
import { ClientSigningManager, sendWithClientSigning } from './signing.ts'
import { ProjectAccessTokenClient, projectTokenFingerprint, projectTokenRequest, type ProjectKeyLocationStore, type ResolvedProjectToken } from './auth/project-token.ts'
import { encodeRequest, decodeMessage, decodeSse, metadataUserId, splitSystemPrompt, type WireShape } from './anthropic.ts'
import { glmImageRequestTarget, prepareRequestImages } from './images.ts'
import { buildStartPlanSystem, buildContextPrefixMessage } from './start-plan.ts'
import { GLM_DEFAULT_MAX_TOKENS, GLM_MODELS, GLM_REASONING_EFFORTS, glmInputModalities, zcodeModelRule, zcodeWireModelId } from './models.ts'
import { maxOutputTokensFor } from './token-budget.ts'
import { messageText, type AttachmentsLike, type GenerateOptionsLike } from '../shared/lm-min.ts'
import type { HealthState } from '../shared/health.ts'
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

/** The bigmodel API origin the project access token is minted at (3.16.3 `resolveBigModelApiOrigin` in production). */
const BIGMODEL_API_ORIGIN = 'https://bigmodel.cn'

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

/** Row-health suffix when ZCode's state file has no deviceMid and the bundle's own one is sent (device-mid.ts). */
const DEVICE_MID_FALLBACK_NOTE = '；ZCode 状态文件里没有 deviceMid，设备 ID 用本包自己的'

export interface ZcodeAdapterOptions {
  /** Agent home directory: `<home>/credentials.json` and `<home>/device-mid.txt`. */
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
}

const storeFsDefault: StoreFs = {
  readFile: path => readFile(path, 'utf8'),
  writeFile: (path, data) => writeFile(path, data),
  rename,
}

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
  private deviceMidPromise: Promise<{ value: string, source: 'zcode' | 'bundle' } | undefined> | undefined

  constructor(options: ZcodeAdapterOptions) {
    this.options = options
    this.routing = new EndpointRoutingService({
      identity: { ...DEFAULT_IDENTITY, ...options.identity },
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.env === undefined ? {} : { env: options.env }),
      deviceMid: () => this.routingDeviceMid(),
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
   * drop by read-modify-write of the stored login.
   */
  private locationStore(): ProjectKeyLocationStore {
    const write = async (update: (credential: Credential) => Credential): Promise<void> => {
      const current = await this.loadCredential()
      if (current !== undefined) await saveCredential(this.options.storeFs ?? storeFsDefault, this.credentialPath(), update(current))
    }
    return {
      load: async key => {
        const location = (await this.loadCredential())?.location
        return location?.key === key ? location.value : undefined
      },
      save: (key, value) => write(credential => ({ ...credential, location: { key, value } })),
      delete: key => write(({ location, ...rest }) => location?.key === key ? rest : { ...rest, ...(location === undefined ? {} : { location }) }),
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
  private projectToken(credential: Credential, rejectedFingerprint?: string): Promise<ResolvedProjectToken> {
    const oauth = credential.oauthAccessToken?.trim() ?? ''
    if (oauth.length === 0) return Promise.reject(new Error(CREDENTIAL_UNAVAILABLE_FAMILY))
    if (credential.userId === undefined || credential.userId.trim().length === 0) return Promise.reject(new Error(CREDENTIAL_UNAVAILABLE_PROVIDER))
    const accountId = credential.userId
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

  /** Provider route display metadata (LlmAdapter base contract). */
  providerInfo(provider: string): { id: string, name: string } {
    return { id: provider, name: 'GLM (ZCode native)' }
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
      context: { contextWindow: 512_000 },
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

  /** The stored login, migrated to the version-2 record on first read (auth/store.ts `loadStoredCredential`). */
  private loadCredential(): Promise<Credential | undefined> {
    return loadStoredCredential(this.options.storeFs ?? storeFsDefault, this.credentialPath())
  }

  /**
   * The deviceMid of `metadata.user_id`: ZCode's own (`telemetry-state.json`,
   * read as 3.16.3 reads it, src/glm-llm/device-mid.ts), else the bundle's
   * `<home>/device-mid.txt` with `source: 'bundle'`, which the row health
   * reports.
   */
  private deviceMid(): Promise<{ value: string, source: 'zcode' | 'bundle' } | undefined> {
    this.deviceMidPromise ??= readCliDeviceMid(this.env()).then(async zcode => {
      if (zcode !== undefined) return { value: zcode, source: 'zcode' as const }
      const bundle = await ensureDeviceMid(this.options.home, this.options.storeFs === undefined ? undefined : {
        readFile: this.options.storeFs.readFile,
        writeFile: this.options.storeFs.writeFile,
        rename: this.options.storeFs.rename,
      })
      return { value: bundle, source: 'bundle' as const }
    }).catch(() => {
      this.deviceMidPromise = undefined
      return undefined
    })
    return this.deviceMidPromise
  }

  /**
   * The routing config request's `X-Device-Mid`: ZCode's own as 3.16.3
   * `Kuc` reads it; the bundle's when ZCode's state has none, so both planes
   * name one device.
   */
  private async routingDeviceMid(): Promise<string | undefined> {
    const resolved = await this.deviceMid()
    return resolved?.source === 'bundle' ? resolved.value : readRoutingDeviceMid(this.env())
  }

  private env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env
  }

  /** Signed-in status for the /glm-status command. */
  async status(): Promise<{ logged: boolean, plan: PlanId, keyPreview?: string, userId?: string, jwtAgeHours?: number }> {
    const credential = await this.loadCredential().catch(() => undefined)
    const plan = this.options.plan ?? 'coding-plan'
    if (credential === undefined) return { logged: false, plan }
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
    const plan = this.options.plan ?? 'coding-plan'
    const report = (state: HealthState, reason: string): void => this.options.report?.(request.sessionId, state, reason)
    const credential = await this.loadCredential().catch((error: unknown) => {
      report('inactive', `凭证不可读：${(error as Error).message}`)
      throw error
    })
    if (credential === undefined) {
      report('inactive', '未登录：凭证为空，运行 /glm-login')
      throw new Error('glm-zcode: not logged in — run /glm-login (the credential store is empty)')
    }
    const fetchImpl = this.options.fetchImpl ?? fetch
    // coding-plan: the project access token is the request credential; 3.16.3
    // account mode sends nothing without it (ModelRequestAuthMissing), so the
    // stream fails before any request leaves.
    let projectToken = plan === 'coding-plan' ? await this.projectToken(credential).catch((error: unknown) => failClosed(report, error)) : undefined
    // start-plan: the plan JWT is the request credential (3.16.3 `resolveCurrent`, `requireApiKey(zcodeJwtToken)`).
    const startPlanJwt = credential.jwt ?? ''
    if (plan === 'start-plan' && startPlanJwt.length === 0) {
      report('inactive', `未拿到套餐 JWT（${START_PLAN_CREDENTIAL_UNAVAILABLE}），运行 /glm-login`)
      throw new Error(`glm-zcode: plan JWT unavailable (${START_PLAN_CREDENTIAL_UNAVAILABLE}) — run /glm-login to sign in again`)
    }
    const device = await this.deviceMid()
    const deviceMid = device?.value
    const identity = { ...DEFAULT_IDENTITY, ...this.options.identity, ...(deviceMid === undefined ? {} : { deviceMid }) }

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
      ? this.attribution.attribute({ sessionId: request.sessionId, purpose: request.purpose, messages: options.messages })
      : { sessionId: upstreamSessionId(request.sessionId), sessionType: request.purpose === undefined ? 'main' : 'other', traceId: randomUUID() }
    const wire = plan === 'coding-plan' ? codingPlanWire(options, request.purpose) : undefined
    const body = JSON.stringify(encodeRequest({ ...options, messages }, systemBlocks, images, metadataUserId(deviceMid, attribution.sessionId), wire))
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
        : { ...buildAuthHeaders({ bearer: startPlanJwt }, identity, trace, this.options.env), 'content-type': 'application/json' }
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
      projectToken = await this.projectToken(credential, await projectTokenFingerprint(projectToken.token)).catch((error: unknown) => failClosed(report, error))
      response = await attempt(projectToken)
    }
    if (!response.ok) {
      report('inactive', `上游返回 ${response.status}`)
      const detail = await response.text()
      throw new Error(`glm-zcode ${response.status}: ${detail.slice(0, 400)}`)
    }
    if (wire?.stream === false) {
      // The session title goes out as 3.16.3 `generateText` sends it: one JSON answer.
      const message: unknown = await response.json()
      report('active', `上游已应答（套餐 ${plan}）${device?.source === 'bundle' ? DEVICE_MID_FALLBACK_NOTE : ''}`)
      yield* decodeMessage(message, options.model) as LlmStreamChunk[]
      return
    }
    if (response.body === null) throw new Error('glm-zcode: response has no stream body')
    report('active', `上游已应答（套餐 ${plan}）${device?.source === 'bundle' ? DEVICE_MID_FALLBACK_NOTE : ''}`)
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
 * (3.16.3 `auxiliaryModelOptions` `PP` @7759001).
 */
function codingPlanWire(options: GenerateOptionsLike, purpose: GenerateOptions['purpose']): WireShape {
  const rule = zcodeModelRule(options.model)
  const requested = options.reasoningEffort
  const level = rule === undefined ? undefined : purpose === 'session-title' ? rule.reasoningLevels[0] : requested !== undefined && rule.reasoningLevels.includes(requested) ? requested : 'high'
  // max_tokens as 3.16.3 picks it (token-budget.ts); DSH's maxTokens is not
  // used for catalog models. Outside the catalog the DSH value stays.
  const kind = purpose === 'session-title' ? 'auxiliary' : purpose === 'compaction' ? 'compaction' : 'step'
  return {
    model: zcodeWireModelId(options.model),
    maxTokens: rule === undefined ? options.maxTokens ?? GLM_DEFAULT_MAX_TOKENS : maxOutputTokensFor(kind, rule.maxOutputTokens, rule.contextWindow, options.messages),
    // 3.16.3 sends the session title through `generateText` (`v4a` @13066475), every other request through `streamText`.
    stream: purpose !== 'session-title',
    optionPatch: rule === undefined || level === undefined ? undefined : rule.optionPatch(level),
  }
}

/**
 * The init of a routed request (3.16.3 `createRoutingFetch` `Ngn` @3839971
 * with `f5s`): a `Headers` copy of the request headers without `host`, then
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
 * Fail a coding-plan stream that has no project access token, as 3.16.3
 * account mode fails the model request: nothing is sent, the row health
 * goes inactive, and the error names the 3.16.3 code or message (never a
 * token) with the re-login instruction.
 */
function failClosed(report: (state: HealthState, reason: string) => void, error: unknown): never {
  const code = error instanceof Error ? error.message : String(error)
  report('inactive', `未拿到项目令牌（${code}），按 3.16.3 不发送；运行 /glm-login`)
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
