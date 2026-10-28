/**
 * Client Request Signing V4 for the native ZCode client (ported from
 * reference/zcode-api src/proxy/client-signing.ts, checked against ZCode
 * 3.16.3 `ClientRequestSigningV4Signer`, docs/DESIGN.md §4.3). The caller
 * passes the provider URL before endpoint routing (3.16.3 wraps the routing
 * transport in the signing transport), so the handshake goes to
 * HANDSHAKE_PATH on the provider origin, e.g.
 * https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client. The adapter attaches
 * no signer for start-plan (3.16.3 `requiresClientRequestSigning`). The
 * signing credential is the request's project access token (account mode).
 * Notices name failures by code-owned kinds and error names only, never by
 * error messages: a fetch header-validation message quotes the header value,
 * which for the handshake is the credential. Everything fails open:
 *   - handshake failure → unsigned, and no new handshake for that
 *     (origin, credential) pair for HANDSHAKE_FAILURE_COOLDOWN_MS.
 *     Deviation: 3.16.3 caches no failure and handshakes again before every
 *     signable request.
 *   - two consecutive 401 VERIFY rejections → permanent bypass for that
 *     (origin, credential) pair. Deviation: the 3.16.3 bypass lasts one
 *     signer generation, which its runtime rebuilds for every request.
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
/** No new handshake for a failed (origin, credential) pair within this window (deviation from 3.16.3, see the header). */
const HANDSHAKE_FAILURE_COOLDOWN_MS = 60_000
const VERIFY_SIGNATURE_INVALID = 'VERIFY_SIGNATURE_INVALID'
const VERIFY_APIKEY_EXPIRED = 'VERIFY_APIKEY_EXPIRED'
/** A business rejection's `msg` is kept as its reason only when it matches (3.16.3 `performHandshake`). */
const HANDSHAKE_REJECTION_REASON = /^HANDSHAKE_[A-Z_]+$/u

const SIGNING_HEADER_NAMES = new Set(['x-client-ts', 'x-client-version', 'x-client-sig', 'x-client-nonce', 'x-app-id', 'x-client-pow', 'x-client-sign-verified'])

export interface SigningCredential {
  /** The project access token the model request carries (3.16.3 `protectTransport` signs with the request credential). */
  readonly credential: string
  readonly appVersion: string
}

export interface SignOutcome {
  readonly pairs: ReadonlyArray<readonly [string, string]>
  readonly signed: boolean
}

/** A parsed project access token: its `api_key` claim and the token as the HKDF secret. */
interface ParsedSigningCredential {
  readonly apiKeyId: string
  readonly secret: string
}

/** A signer-raised failure whose message is a fixed, code-owned kind (no credential, no server text). */
class SigningFailure extends Error {}

/** Notice-safe reason: a SigningFailure's kind, otherwise only the error's name. */
function failureReason(error: unknown): string {
  if (error instanceof SigningFailure) return error.message
  return error instanceof Error ? error.name : typeof error
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

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new SigningFailure('invalid base64')
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function hkdfBytes(secret: string, info: string): Promise<Uint8Array<ArrayBuffer>> {
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
  if (cipher.byteLength <= 12 + 16) throw new SigningFailure('privateCipher is too short')
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
  throw new SigningFailure('Unable to solve client request proof of work')
}

/**
 * The project-access-token form of 3.16.3 `parseSigningCredential` (`D1r`
 * @1087575): header `{alg: HS256, typ: JWT, sign_type: SIGN}`, payload
 * `token_use: project_access` with a non-empty `api_key`; the whole token is
 * the HKDF secret. The `{apiKeyId}.{secret}` branch of `D1r` is not ported:
 * the channel signs with the PAT only (account mode, docs/DESIGN.md §4.3).
 */
export function parseSigningCredentialForm(credential: string): ParsedSigningCredential | undefined {
  const segments = credential.split('.')
  if (segments.length !== 3 || segments[2] === undefined || segments[2].length === 0) return undefined
  try {
    const decode = (segment: string) => JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>
    const header = decode(segments[0]!) as { alg?: string, typ?: string, sign_type?: string }
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || header.sign_type !== 'SIGN') return undefined
    const payload = decode(segments[1]!) as { token_use?: string, api_key?: string }
    if (payload.token_use !== 'project_access' || typeof payload.api_key !== 'string' || payload.api_key.trim().length === 0) return undefined
    return { apiKeyId: payload.api_key, secret: credential }
  }
  catch {
    return undefined
  }
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
  /** Handshake failure cooldown end (epoch ms); cleared by invalidation and by a successful handshake. */
  failedUntil?: number | undefined
  epoch: number
  bypass: boolean
}

/**
 * Per-process signing manager: caches handshake keys and handshake failures
 * per (origin, credential), and never throws. The credential is the project
 * access token the adapter resolved for the request.
 */
export class ClientSigningManager {
  /** Transport for the handshake (the adapter routes it like the model request). */
  private readonly handshakeFetch: typeof fetch
  private readonly now: () => number
  private readonly states = new Map<string, SignerState>()
  private readonly notedKeys = new Set<string>()
  /** Optional sink for fail-open notices (each surfaced once per cause). */
  onEvent: ((message: string) => void) | undefined

  constructor(opts: { handshakeFetch?: typeof fetch, now?: () => number, onEvent?: (message: string) => void } = {}) {
    this.handshakeFetch = opts.handshakeFetch ?? fetch
    this.now = opts.now ?? Date.now
    this.onEvent = opts.onEvent
  }

  /** Add V4 signing headers; the input pairs return unchanged whenever signing does not apply. */
  async signWithStatus(url: string, pairs: ReadonlyArray<readonly [string, string]>, cred: SigningCredential): Promise<SignOutcome> {
    let parsed: URL
    try { parsed = new URL(url) } catch { return { pairs, signed: false } }
    if (parsed.protocol !== 'https:') return { pairs, signed: false }
    if (pairs.some(([key]) => key.toLowerCase() === 'x-client-sig')) return { pairs, signed: false }
    const stateKey = `${parsed.origin}\n${cred.credential}`
    const state = this.stateFor(stateKey)
    if (state.bypass) return { pairs, signed: false }
    const parsedCred = parseSigningCredentialForm(cred.credential)
    if (parsedCred === undefined) {
      this.noteOnce(`${stateKey}\ncredential`, 'credential is not a project access token — signing skipped')
      return { pairs, signed: false }
    }
    const sessionId = findHeader(pairs, 'x-session-id')?.trim()
    if (sessionId === undefined || sessionId.length === 0) {
      this.noteOnce(`${stateKey}\nsession`, 'upstream request has no x-session-id — signing skipped')
      return { pairs, signed: false }
    }
    if (state.failedUntil !== undefined && this.now() < state.failedUntil) return { pairs, signed: false }
    let privateKey: CryptoKey
    try {
      privateKey = await this.ensurePrivateKey(state, parsedCred, parsed.origin)
    }
    catch (error) {
      this.noteOnce(`${stateKey}\nhandshake`, `signing handshake failed (${failureReason(error)}) — sending unsigned; no new handshake for ${HANDSHAKE_FAILURE_COOLDOWN_MS / 1000} s`)
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
      this.noteOnce(`${stateKey}\nsign`, `signing failed (${failureReason(error)}) — sending unsigned`)
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

  /** Drop the cached signing key and any handshake cooldown for a (origin, credential) pair after a VERIFY rejection. */
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
    state.failedUntil = undefined
  }

  private stateFor(stateKey: string): SignerState {
    let state = this.states.get(stateKey)
    if (state === undefined) {
      state = { epoch: 0, bypass: false }
      this.states.set(stateKey, state)
    }
    return state
  }

  private async ensurePrivateKey(state: SignerState, parsedCred: ParsedSigningCredential, origin: string): Promise<CryptoKey> {
    if (state.privKey !== undefined) return state.privKey
    if (state.handshake !== undefined) return state.handshake
    const epoch = state.epoch
    const handshake = this.performHandshake(parsedCred, origin).then(key => {
      if (state.epoch !== epoch) throw new SigningFailure('signing key changed during handshake')
      state.privKey = key
      state.failedUntil = undefined
      return key
    }, (error: unknown) => {
      // A failure the state has already moved past (VERIFY invalidation)
      // starts no cooldown.
      if (state.epoch === epoch) state.failedUntil = this.now() + HANDSHAKE_FAILURE_COOLDOWN_MS
      throw error
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HANDSHAKE_TIMEOUT_MS)
    try {
      // 3.16.3 `performHandshake`: Authorization carries the project token
      // as-is (no `Bearer `), and the body names it `accessToken`.
      const resp = await this.handshakeFetch(`${origin}${HANDSHAKE_PATH}`, {
        method: 'POST',
        headers: { Authorization: parsedCred.secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: parsedCred.secret, nonce, sig, ts }),
        redirect: 'manual',
        signal: controller.signal,
      })
      if (resp.status !== 200) throw new SigningFailure(`handshake_http_${resp.status}`)
      const envelope = await resp.json() as { code?: unknown, msg?: unknown, data?: { privateCipher?: unknown } }
      if (envelope.code === 500) throw new SigningFailure('handshake_server_500')
      if (envelope.code !== 200) {
        const reason = typeof envelope.msg === 'string' && HANDSHAKE_REJECTION_REASON.test(envelope.msg) ? `: ${envelope.msg}` : ''
        throw new SigningFailure(`handshake_rejected${reason}`)
      }
      const cipher = envelope.data?.privateCipher
      if (typeof cipher !== 'string' || cipher.length === 0) throw new SigningFailure('handshake_omitted_privateCipher')
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

/**
 * Send with the client's full signing retry ladder: signed → re-handshake
 * once → permanent bypass + unsigned. `url` is the provider URL before
 * endpoint routing; it decides the handshake origin and keys the state.
 * `send` delivers to the routed URL and appends the routing headers after
 * the signature block (3.16.3 order). The bypass is permanent for the pair,
 * stricter than 3.16.3 (one signer generation, in practice one request).
 */
export async function sendWithClientSigning(signer: ClientSigningManager | null, params: {
  url: string
  headerPairs: ReadonlyArray<readonly [string, string]>
  credential: string
  appVersion: string
  send: (headerPairs: ReadonlyArray<readonly [string, string]>) => Promise<Response>
}): Promise<Response> {
  const { url, headerPairs, credential, appVersion, send } = params
  if (signer === null) return send(headerPairs)
  const signingCred: SigningCredential = { credential, appVersion }
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
