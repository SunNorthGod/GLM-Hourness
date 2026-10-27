/**
 * Client Request Signing V4 for the native ZCode client (ported from
 * reference/zcode-api src/proxy/client-signing.ts, mirroring ZCode 3.15.1
 * `ClientRequestSigningV4Signer`). Static rule: coding-plan credentials are
 * always signed; start-plan/off-peak paths never are. Everything fails open:
 * handshake failure → unsigned; two consecutive 401 VERIFY rejections →
 * permanent bypass for that (origin, credential) pair.
 *
 * Wire templates join fields with literal NEWLINES (bundle-verified):
 *   handshake HMAC   "get_sign_key\n{apiKeyId}\n{ts}\n{nonce}"
 *   business Ed25519 "{apiKeyId}\n{ts}\n{clientVersion}\n{sessionId}\n{nonce}"
 *   PoW challenge    sha256("{apiKeyId}\n{appId}\n{sessionId}\n{ts}") hex[:32]
 *   PoW answer       sha256("{challenge}\n{answer}")
 */
const HANDSHAKE_PATH = '/api/paas/c1f3a7e2/v2/client'
const APP_ID = 'zcode'
const POW_BITS = 8
const NONCE_BYTES = 16
const POW_NONCE_BYTES = 12
const KDF_SALT = 'WD_CLIENT_SIGN_KDF_SALT'
const KDF_INFO_HMAC = 'getSignKey_hmac'
const KDF_INFO_ED25519 = 'ed25519_priv'
const HANDSHAKE_METHOD = 'get_sign_key'
const HANDSHAKE_TIMEOUT_MS = 10_000
const MINT_FAILURE_COOLDOWN_MS = 60_000
const VERIFY_SIGNATURE_INVALID = 'VERIFY_SIGNATURE_INVALID'
const VERIFY_APIKEY_EXPIRED = 'VERIFY_APIKEY_EXPIRED'
const BIGMODEL_HOST = 'https://bigmodel.cn'

/** Paths the client never signs (decoded, trailing-slash-stripped). */
const UNSIGNED_PATHS = new Set([
  '/api/v1/zcode-plan/anthropic/v1/messages',
  '/api/v1/zcode-plan/chat/completions',
  '/api/v1/off-peak/anthropic/v1/messages',
])

const SIGNING_HEADER_NAMES = new Set(['x-client-ts', 'x-client-version', 'x-client-sig', 'x-client-nonce', 'x-app-id', 'x-client-pow', 'x-client-sign-verified'])

export interface SigningCredential {
  readonly credential: string
  readonly appVersion: string
  /** Raw provider OAuth access token (bigmodel OAuth logins) enabling the project-access JWT signing form. */
  readonly oauthAccessToken?: string
}

export interface SignOutcome {
  readonly pairs: ReadonlyArray<readonly [string, string]>
  readonly signed: boolean
}

/** Dual-form signing credential (3.15.1 `FSr`): JWT or `{apiKeyId}.{secret}`. */
export interface ParsedSigningCredential {
  readonly apiKeyId: string
  readonly secret: string
  readonly handshakeField: 'apiKey' | 'accessToken'
}

const encoder = new TextEncoder()

function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(value)
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function randomHex(byteCount: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteCount)))
}

function base64ToBytes(value: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('invalid base64')
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function hkdfBytes(secret: string, info: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encodeUtf8(secret), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: encodeUtf8(KDF_SALT), info: encodeUtf8(info) }, key, 256))
}

async function handshakeSignature(secret: string, message: string): Promise<string> {
  const bits = await hkdfBytes(secret, KDF_INFO_HMAC)
  const key = await crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encodeUtf8(message)))
  return bytesToBase64(mac)
}

async function decryptSigningPrivateKey(apiKeyId: string, secret: string, privateCipher: string): Promise<CryptoKey> {
  const cipher = base64ToBytes(privateCipher)
  if (cipher.byteLength <= 12 + 16) throw new Error('privateCipher is too short')
  const aesKey = await crypto.subtle.importKey('raw', await hkdfBytes(secret, KDF_INFO_ED25519), 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cipher.slice(0, 12), additionalData: encodeUtf8(apiKeyId), tagLength: 128 }, aesKey, cipher.slice(12)))
  const pkcs8 = base64ToBytes(new TextDecoder().decode(plain))
  return await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', false, ['sign'])
}

async function signBusinessMessage(privateKey: CryptoKey, message: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, encodeUtf8(message))))
}

export function hasLeadingZeroBits(bytes: Uint8Array, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8)
  for (let i = 0; i < fullBytes; i++) {
    if (bytes[i] !== 0) return false
  }
  const remainder = bits % 8
  if (remainder === 0) return true
  const mask = (255 << (8 - remainder)) & 255
  return ((bytes[fullBytes] ?? 255) & mask) === 0
}

/** Solve the proof-of-work: seed = sha256("{id}\n{appId}\n{session}\n{ts}") hex[:32]; answer = "{nonce12}{counter8}" with 8 leading zero bits. */
export async function createProofOfWork(apiKeyId: string, sessionId: string, ts: string): Promise<string> {
  const seedDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', encodeUtf8(`${apiKeyId}\n${APP_ID}\n${sessionId}\n${ts}`)))
  const seed = bytesToHex(seedDigest).slice(0, 32)
  const nonce = randomHex(POW_NONCE_BYTES)
  for (let counter = 0; counter <= 4_294_967_295; counter++) {
    const candidate = `${nonce}${counter.toString(16).padStart(8, '0')}`
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encodeUtf8(`${seed}\n${candidate}`)))
    if (hasLeadingZeroBits(digest, POW_BITS)) return candidate
  }
  throw new Error('Unable to solve client request proof of work')
}

/** Dual-form credential parse: project_access JWT (HS256+SIGN, api_key claim) or `{apiKeyId}.{secret}`. */
export function parseSigningCredentialForm(credential: string): ParsedSigningCredential | undefined {
  const segments = credential.split('.')
  if (segments.length === 3 && segments[2] !== undefined && segments[2].length > 0) {
    try {
      const decode = (segment: string) => JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>
      const header = decode(segments[0]!) as { alg?: string, sign_type?: string }
      if (header.alg !== 'HS256' || header.sign_type !== 'SIGN') return undefined
      const payload = decode(segments[1]!) as { token_use?: string, api_key?: string }
      if (payload.token_use !== 'project_access' || typeof payload.api_key !== 'string' || payload.api_key.trim().length === 0) return undefined
      return { apiKeyId: payload.api_key, secret: credential, handshakeField: 'accessToken' }
    }
    catch {
      return undefined
    }
  }
  const dot = credential.indexOf('.')
  if (dot <= 0 || dot !== credential.lastIndexOf('.')) return undefined
  const apiKeyId = credential.slice(0, dot)
  const secret = credential.slice(dot + 1)
  if (apiKeyId.trim().length === 0 || secret.trim().length === 0) return undefined
  return { apiKeyId, secret, handshakeField: 'apiKey' }
}

function isUnsignedPath(pathname: string): boolean {
  let path = pathname
  try { path = decodeURIComponent(pathname) } catch { /* keep raw path */ }
  return UNSIGNED_PATHS.has(path.replace(/\/+$/u, ''))
}

function findHeader(pairs: ReadonlyArray<readonly [string, string]>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, value] of pairs) {
    if (key.toLowerCase() === lower) return value
  }
  return undefined
}

interface SignerState {
  privKey?: CryptoKey | undefined
  handshake?: Promise<CryptoKey> | undefined
  epoch: number
  bypass: boolean
}

/**
 * Per-process signing manager: caches handshake keys per (origin, credential),
 * mints project-access JWTs for bigmodel OAuth credentials, and never throws.
 */
export class ClientSigningManager {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly states = new Map<string, SignerState>()
  private readonly notedKeys = new Set<string>()
  private projectJwt: { credentialKey: string, jwt: string, expMs: number } | null = null
  private mintNegUntil = 0
  private mintInFlight: Promise<ParsedSigningCredential | undefined> | null = null
  /** Optional sink for fail-open notices (each surfaced once per cause). */
  onEvent: ((message: string) => void) | undefined

  constructor(opts: { fetchImpl?: typeof fetch, now?: () => number, onEvent?: (message: string) => void } = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.now = opts.now ?? Date.now
    this.onEvent = opts.onEvent
  }

  /** Add V4 signing headers; the input pairs return unchanged whenever signing does not apply. */
  async signWithStatus(url: string, pairs: ReadonlyArray<readonly [string, string]>, cred: SigningCredential): Promise<SignOutcome> {
    let parsed: URL
    try { parsed = new URL(url) } catch { return { pairs, signed: false } }
    if (parsed.protocol !== 'https:') return { pairs, signed: false }
    if (isUnsignedPath(parsed.pathname)) return { pairs, signed: false }
    if (pairs.some(([key]) => key.toLowerCase() === 'x-client-sig')) return { pairs, signed: false }
    const stateKey = `${parsed.origin}\n${cred.credential}`
    const state = this.stateFor(stateKey)
    if (state.bypass) return { pairs, signed: false }
    const parsedCred = await this.resolveParsedCredential(cred, stateKey)
    if (parsedCred === undefined) {
      this.noteOnce(stateKey, 'credential has no {apiKeyId}.{apiKeySecret} separator — signing skipped')
      return { pairs, signed: false }
    }
    const sessionId = findHeader(pairs, 'x-session-id')?.trim()
    if (sessionId === undefined || sessionId.length === 0) {
      this.noteOnce(stateKey, 'upstream request has no x-session-id — signing skipped')
      return { pairs, signed: false }
    }
    let privateKey: CryptoKey
    try {
      privateKey = await this.ensurePrivateKey(state, parsedCred, parsed.origin)
    }
    catch {
      this.noteOnce(stateKey, 'signing handshake failed — sending unsigned')
      this.invalidateState(stateKey)
      return { pairs, signed: false }
    }
    const signedPairs = await this.buildSignedPairs(stateKey, pairs, privateKey, parsedCred, sessionId, cred.appVersion)
    return signedPairs === null ? { pairs, signed: false } : { pairs: signedPairs, signed: true }
  }

  private async buildSignedPairs(stateKey: string, pairs: ReadonlyArray<readonly [string, string]>, privateKey: CryptoKey, parsedCred: ParsedSigningCredential, sessionId: string, appVersion: string): Promise<ReadonlyArray<readonly [string, string]> | null> {
    const ts = String(Date.now())
    const nonce = randomHex(NONCE_BYTES)
    let pow: string
    let sig: string
    try {
      pow = await createProofOfWork(parsedCred.apiKeyId, sessionId, ts)
      sig = await signBusinessMessage(privateKey, `${parsedCred.apiKeyId}\n${ts}\n${appVersion}\n${sessionId}\n${nonce}`)
    }
    catch (error) {
      this.noteOnce(stateKey, `signing failed (${error instanceof Error ? error.message : String(error)}) — sending unsigned`)
      return null
    }
    const cleaned = pairs.filter(([key]) => {
      const lower = key.toLowerCase()
      return !SIGNING_HEADER_NAMES.has(lower) && lower !== 'x-session-id'
    })
    return [
      ...cleaned,
      ['X-Client-Ts', ts],
      ['X-Client-Version', appVersion],
      ['X-Client-Sig', sig],
      ['X-Session-Id', sessionId],
      ['X-Client-Nonce', nonce],
      ['X-App-Id', APP_ID],
      ['X-Client-Pow', pow],
    ]
  }

  /** True when the response is a signing rejection the client retries on (401 + VERIFY_* in the envelope). */
  async isVerifyFailure(resp: Response): Promise<boolean> {
    if (resp.status !== 401) return false
    try {
      const body = await resp.clone().json() as Record<string, unknown>
      const data = body.data as Record<string, unknown> | undefined
      const error = body.error as Record<string, unknown> | undefined
      return [body.msg, body.reason, data?.reason, error?.reason, error?.message].some(value => value === VERIFY_SIGNATURE_INVALID || value === VERIFY_APIKEY_EXPIRED)
    }
    catch {
      return false
    }
  }

  /** Drop the cached signing key for a (origin, credential) pair after a VERIFY rejection. */
  invalidate(url: string, credential: string): void {
    try { this.invalidateState(`${new URL(url).origin}\n${credential}`) } catch { /* unreachable URL */ }
  }

  /** Permanently stop signing for a (origin, credential) pair (two VERIFY rejections). */
  setBypass(url: string, credential: string): void {
    try {
      const stateKey = `${new URL(url).origin}\n${credential}`
      this.stateFor(stateKey).bypass = true
      this.invalidateState(stateKey)
      this.onEvent?.('client-signing: VERIFY rejection persisted — bypassing signing for this credential')
    }
    catch { /* unreachable URL */ }
  }

  private invalidateState(stateKey: string): void {
    const state = this.states.get(stateKey)
    if (state === undefined) return
    state.epoch += 1
    state.privKey = undefined
    state.handshake = undefined
  }

  private stateFor(stateKey: string): SignerState {
    let state = this.states.get(stateKey)
    if (state === undefined) {
      state = { epoch: 0, bypass: false }
      this.states.set(stateKey, state)
    }
    return state
  }

  /** Resolve the signing form: bigmodel OAuth mints a project-access JWT (cached until 5 min before exp). */
  private async resolveParsedCredential(cred: SigningCredential, stateKey: string): Promise<ParsedSigningCredential | undefined> {
    const direct = parseSigningCredentialForm(cred.credential)
    if (direct?.handshakeField === 'accessToken') return direct
    if (cred.oauthAccessToken === undefined) return direct
    const now = this.now()
    if (this.projectJwt !== null && this.projectJwt.credentialKey === cred.credential && this.projectJwt.expMs - 5 * 60_000 > now) {
      const cached = parseSigningCredentialForm(this.projectJwt.jwt)
      if (cached !== undefined) return cached
      this.projectJwt = null
    }
    if (now < this.mintNegUntil) return direct
    if (this.mintInFlight !== null) return this.mintInFlight
    const promise = this.mintProjectJwt(cred.oauthAccessToken, direct?.apiKeyId, cred.appVersion).then(minted => {
      if (minted === null) {
        this.mintNegUntil = this.now() + MINT_FAILURE_COOLDOWN_MS
        return direct
      }
      const parsed = parseSigningCredentialForm(minted.jwt)
      if (parsed === undefined) {
        this.mintNegUntil = this.now() + MINT_FAILURE_COOLDOWN_MS
        this.noteOnce('pt-parse', 'minted project token failed strict parse — falling back to apiKey form')
        return direct
      }
      this.projectJwt = { credentialKey: cred.credential, jwt: minted.jwt, expMs: minted.expMs }
      this.invalidateState(stateKey)
      return parsed
    }).finally(() => { if (this.mintInFlight === promise) this.mintInFlight = null })
    this.mintInFlight = promise
    return promise
  }

  /** Mint the project-access JWT (getCustomerInfo → api_keys/{id}/access_tokens); null on any failure. */
  private async mintProjectJwt(oauthAccessToken: string, apiKeyId: string | undefined, clientVersion: string): Promise<{ jwt: string, expMs: number } | null> {
    if (apiKeyId === undefined) {
      this.noteOnce('pt-key', 'project token mint skipped: credential has no apiKeyId segment')
      return null
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const bare = oauthAccessToken.startsWith('Bearer ') ? oauthAccessToken.slice(7).trim() : oauthAccessToken
      const infoResp = await this.fetchImpl(`${BIGMODEL_HOST}/api/biz/customer/getCustomerInfo`, { headers: { Authorization: bare, 'Content-Type': 'application/json' }, redirect: 'manual', signal: controller.signal })
      const info = await infoResp.json() as { data?: { organizations?: Array<{ organizationId?: string, organizationName?: string, projects?: Array<{ projectId?: string, projectName?: string, projectType?: string | number }> }> } }
      const orgs = (info.data?.organizations ?? [])
        .map(org => ({ ...org, projects: (org.projects ?? []).filter(project => String(project.projectType ?? '').trim() !== '2') }))
        .filter(org => org.organizationId !== undefined && org.projects.length > 0)
      const org = orgs.find(entry => entry.organizationName?.includes('默认机构')) ?? orgs[0]
      const project = org?.projects.find(entry => entry.projectName?.includes('默认项目')) ?? org?.projects[0]
      if (org?.organizationId === undefined || project?.projectId === undefined) {
        this.noteOnce('pt-project', 'project token mint failed: no usable org/project in getCustomerInfo (re-login may help)')
        return null
      }
      const ptResp = await this.fetchImpl(`${BIGMODEL_HOST}/api/biz/v1/organization/${encodeURIComponent(org.organizationId)}/projects/${encodeURIComponent(project.projectId)}/api_keys/${encodeURIComponent(apiKeyId)}/access_tokens`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bare}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientType: 'zcode', clientVersion }),
        redirect: 'manual',
        signal: controller.signal,
      })
      const pt = await ptResp.json() as { code?: number, data?: { accessToken?: string } }
      const jwt = pt.data?.accessToken
      if (pt.code !== 200 || jwt === undefined) {
        this.noteOnce('pt-mint', `project token mint rejected (code=${pt.code ?? ptResp.status})`)
        return null
      }
      let expMs = this.now() + 60 * 60_000
      try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { exp?: number }
        if (typeof payload.exp === 'number') expMs = payload.exp * 1000
      }
      catch { /* keep fallback expiry */ }
      return { jwt, expMs }
    }
    catch {
      this.noteOnce('pt-network', 'project token mint failed (network/timeout)')
      return null
    }
    finally {
      clearTimeout(timer)
    }
  }

  private async ensurePrivateKey(state: SignerState, parsedCred: ParsedSigningCredential, origin: string): Promise<CryptoKey> {
    if (state.privKey !== undefined) return state.privKey
    if (state.handshake !== undefined) return state.handshake
    const epoch = state.epoch
    const handshake = this.performHandshake(parsedCred, origin).then(key => {
      if (state.epoch !== epoch) throw new Error('signing key changed during handshake')
      state.privKey = key
      return key
    })
    const clear = () => { if (state.handshake === handshake) state.handshake = undefined }
    handshake.then(clear, clear)
    state.handshake = handshake
    return handshake
  }

  private async performHandshake(parsedCred: ParsedSigningCredential, origin: string): Promise<CryptoKey> {
    const ts = String(Date.now())
    const nonce = randomHex(NONCE_BYTES)
    const sig = await handshakeSignature(parsedCred.secret, `${HANDSHAKE_METHOD}\n${parsedCred.apiKeyId}\n${ts}\n${nonce}`)
    const isJwt = parsedCred.handshakeField === 'accessToken'
    const authValue = isJwt ? parsedCred.secret : `${parsedCred.apiKeyId}.${parsedCred.secret}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HANDSHAKE_TIMEOUT_MS)
    try {
      const resp = await this.fetchImpl(`${origin}${HANDSHAKE_PATH}`, {
        method: 'POST',
        headers: { Authorization: isJwt ? `Bearer ${authValue}` : authValue, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [isJwt ? 'accessToken' : 'apiKey']: authValue, nonce, sig, ts }),
        redirect: 'manual',
        signal: controller.signal,
      })
      if (resp.status !== 200) throw new Error(`handshake_http_${resp.status}`)
      const envelope = await resp.json() as { code?: unknown, msg?: unknown, data?: { privateCipher?: unknown } }
      if (envelope.code === 500) throw new Error('handshake_server_500')
      if (envelope.code !== 200) throw new Error(`handshake_rejected: ${String(envelope.msg)}`)
      const cipher = envelope.data?.privateCipher
      if (typeof cipher !== 'string' || cipher.length === 0) throw new Error('handshake_omitted_privateCipher')
      return await decryptSigningPrivateKey(parsedCred.apiKeyId, parsedCred.secret, cipher)
    }
    finally {
      clearTimeout(timer)
    }
  }

  private noteOnce(stateKey: string, message: string): void {
    if (this.notedKeys.has(stateKey)) return
    this.notedKeys.add(stateKey)
    this.onEvent?.(`client-signing: ${message}`)
  }
}

/** Send with the client's full signing retry ladder: signed → re-handshake once → permanent bypass + unsigned. */
export async function sendWithClientSigning(signer: ClientSigningManager | null, params: {
  url: string
  headerPairs: ReadonlyArray<readonly [string, string]>
  credential: string
  appVersion: string
  oauthAccessToken?: string
  send: (headerPairs: ReadonlyArray<readonly [string, string]>) => Promise<Response>
}): Promise<Response> {
  const { url, headerPairs, credential, appVersion, oauthAccessToken, send } = params
  if (signer === null) return send(headerPairs)
  const signingCred: SigningCredential = { credential, appVersion, ...(oauthAccessToken === undefined ? {} : { oauthAccessToken }) }
  const first = await signer.signWithStatus(url, headerPairs, signingCred)
  let resp = await send(first.pairs)
  if (!first.signed || !await signer.isVerifyFailure(resp)) return resp
  signer.invalidate(url, credential)
  const second = await signer.signWithStatus(url, headerPairs, signingCred)
  resp = await send(second.pairs)
  if (!second.signed || !await signer.isVerifyFailure(resp)) return resp
  signer.setBypass(url, credential)
  return send(headerPairs)
}
