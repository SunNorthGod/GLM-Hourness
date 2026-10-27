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
import { loadCredential, saveCredential, clearCredential, type StoreFs } from './auth/store.ts'
import { resolveCodingPlanCredential } from './auth/resolver.ts'
import { PollOAuthClient, LOGIN_TIMEOUT_MS, buildPasteAuthorizeUrl } from './auth/oauth.ts'
import { inspectJwt } from './auth/jwt.ts'
import { DEFAULT_IDENTITY, ensureDeviceMid, resolveEnvPromptInfo, type ZcodeIdentity } from './identity.ts'
import { buildAuthHeaders, type PlanId } from './headers.ts'
import { EndpointRoutingService } from './endpoint-routing.ts'
import { ClientSigningManager, sendWithClientSigning } from './signing.ts'
import { encodeRequest, decodeSse, splitSystemPrompt } from './anthropic.ts'
import { glmImageRequestTarget, prepareRequestImages } from './images.ts'
import { buildStartPlanSystem, buildContextPrefixMessage } from './start-plan.ts'
import { GLM_DEFAULT_MAX_TOKENS, GLM_MODELS, GLM_REASONING_EFFORTS, glmInputModalities } from './models.ts'
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

/** Bigmodel coding-plan Anthropic endpoint (before server-side remapping). */
const BIGMODEL_ANTHROPIC_BASE = 'https://open.bigmodel.cn/api/anthropic'

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

  /** Complete the started flow: resolve the coding-plan credential and persist it. */
  private async settle(client: PollOAuthClient): Promise<void> {
    try {
      const tokens = await client.complete(LOGIN_TIMEOUT_MS)
      const credential = await resolveCodingPlanCredential(this.fetchImpl, tokens.accessToken, tokens.userId)
      const stored: Credential = tokens.jwt === undefined ? credential : { ...credential, jwt: tokens.jwt }
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
  private deviceMidPromise: Promise<string> | undefined

  constructor(options: ZcodeAdapterOptions) {
    this.options = options
    this.routing = new EndpointRoutingService({
      identity: { ...DEFAULT_IDENTITY, ...options.identity },
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.env === undefined ? {} : { env: options.env }),
    })
    this.signer = new ClientSigningManager({
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    })
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

  private async loadCredential(): Promise<Credential | undefined> {
    const raw = await loadCredential(this.options.storeFs ?? storeFsDefault, this.credentialPath())
    if (raw === undefined || typeof raw !== 'object' || raw === null) return undefined
    const record = raw as Record<string, unknown>
    if (typeof record.apiKey !== 'string' || record.provider !== 'bigmodel') return undefined
    return {
      apiKey: record.apiKey,
      provider: 'bigmodel',
      ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
      ...(typeof record.jwt === 'string' ? { jwt: record.jwt } : {}),
      ...(typeof record.oauthAccessToken === 'string' ? { oauthAccessToken: record.oauthAccessToken } : {}),
    }
  }

  private deviceMid(): Promise<string> {
    this.deviceMidPromise ??= ensureDeviceMid(this.options.home, this.options.storeFs === undefined ? undefined : {
      readFile: this.options.storeFs.readFile,
      writeFile: this.options.storeFs.writeFile,
      rename: this.options.storeFs.rename,
    }).catch(error => {
      this.deviceMidPromise = undefined
      throw error
    })
    return this.deviceMidPromise
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
      keyPreview: `${credential.apiKey.slice(0, 6)}…`,
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
    const deviceMid = await this.deviceMid().catch(() => undefined)
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
    const body = JSON.stringify(encodeRequest({ ...options, messages }, systemBlocks, images))

    const upstreamBase = `${BIGMODEL_ANTHROPIC_BASE}/v1/messages`
    const routed = await this.routing.resolve(upstreamBase, credential.apiKey, credential.jwt).catch((): { routed: boolean, url: string, headers?: Record<string, string> } => ({ routed: false, url: upstreamBase }))
    const headers = buildAuthHeaders(credential, identity, plan, { sessionId: randomUUID(), sessionType: 'main' }, this.options.env)

    const response = await sendWithClientSigning(this.signer, {
      url: routed.url,
      headerPairs: Object.entries({ ...headers, ...(routed.headers ?? {}), 'content-type': 'application/json' }) as Array<[string, string]>,
      credential: credential.apiKey,
      appVersion: identity.appVersion,
      ...(credential.oauthAccessToken === undefined ? {} : { oauthAccessToken: credential.oauthAccessToken }),
      send: pairs => fetchImpl(routed.url, {
        method: 'POST',
        headers: Object.fromEntries(pairs) as Record<string, string>,
        body,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      }),
    })
    if (!response.ok) {
      report('inactive', `上游返回 ${response.status}`)
      const detail = await response.text()
      throw new Error(`glm-zcode ${response.status}: ${detail.slice(0, 400)}`)
    }
    if (response.body === null) throw new Error('glm-zcode: response has no stream body')
    report('active', `上游已应答（套餐 ${plan}）`)
    // decodeSse emits the internal structural chunk vocabulary; it is
    // field-compatible with the DSH StreamChunk protocol (only the branded id
    // types differ, and brands exist only at the type level).
    yield* decodeSse(response.body) as AsyncIterable<LlmStreamChunk>
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
