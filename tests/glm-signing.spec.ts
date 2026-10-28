import assert from 'node:assert/strict'
import test from 'node:test'
import { ClientSigningManager, sendWithClientSigning, parseSigningCredentialForm, createProofOfWork, hasLeadingZeroBits, type SignOutcome, type SigningCredential } from '../src/glm-llm/signing.ts'

const encoder = new TextEncoder()

function b64url(payload: object, header: object = { alg: 'HS256', typ: 'JWT', sign_type: 'SIGN' }): string {
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`
}

test('credential parse accepts the project_access JWT and the apiKeyId.secret forms', () => {
  const jwt = b64url({ token_use: 'project_access', api_key: 'key-id' })
  assert.deepEqual(parseSigningCredentialForm(jwt), { apiKeyId: 'key-id', secret: jwt, handshakeField: 'accessToken' })
  // non-SIGN JWT or wrong token_use falls through
  assert.equal(parseSigningCredentialForm(b64url({ token_use: 'other' }, { alg: 'HS256' })), undefined)
  assert.deepEqual(parseSigningCredentialForm('id.secret'), { apiKeyId: 'id', secret: 'secret', handshakeField: 'apiKey' })
  assert.equal(parseSigningCredentialForm('no-separator'), undefined)
  assert.equal(parseSigningCredentialForm('.leading'), undefined)
  assert.equal(parseSigningCredentialForm('a.b.c'), undefined) // 3 segments but not a SIGN JWT
})

test('proof of work answers carry 8 leading zero bits over the real seed', async () => {
  const [apiKeyId, sessionId, ts] = ['id', 'session', '123']
  const answer = await createProofOfWork(apiKeyId, sessionId, ts)
  const seedDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${apiKeyId}\nzcode\n${sessionId}\n${ts}`)))
  const seed = Array.from(seedDigest, b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${seed}\n${answer}`)))
  assert.ok(hasLeadingZeroBits(digest, 8))
  assert.match(answer, /^[0-9a-f]{32}$/) // 12-byte nonce hex (24) + 8-hex counter
})

function jsonRespond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('signing skips http, already-signed pairs, and separator-less credentials', async () => {
  const manager = new ClientSigningManager({ fetchImpl: async () => { throw new Error('should not fetch') } })
  const pairs: Array<readonly [string, string]> = [['content-type', 'application/json'], ['x-session-id', 's1']]
  assert.equal((await manager.signWithStatus('http://x/api/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.14.0' })).signed, false)
  assert.equal((await manager.signWithStatus('https://x/api/anthropic/v1/messages', [['x-client-sig', 'present'], ['x-session-id', 's1']], { credential: 'id.secret', appVersion: '3.14.0' })).signed, false)
  assert.equal((await manager.signWithStatus('https://x/api/anthropic/v1/messages', pairs, { credential: 'noseparator', appVersion: '3.14.0' })).signed, false)
})

test('a full handshake signs the pairs with the V4 header block', async () => {
  // Generate a real Ed25519 keypair server-side; encrypt its pkcs8 with the KDF chain.
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey))
  const salt = encoder.encode('WD_CLIENT_SIGN_KDF_SALT')
  const aesBits = await crypto.subtle.importKey('raw', encoder.encode('secret'), 'HKDF', false, ['deriveBits'])
  const aesKeyRaw = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('ed25519_priv') }, aesBits, 256))
  const aesKey = await crypto.subtle.importKey('raw', aesKeyRaw, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('id'), tagLength: 128 }, aesKey, Buffer.from(Buffer.from(pkcs8).toString('base64'))))
  const privateCipher = Buffer.concat([iv, cipher]).toString('base64')

  const seen: Array<{ url: string, method: string | undefined, headers: Record<string, string>, body: Record<string, unknown> }> = []
  const manager = new ClientSigningManager({
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return jsonRespond(200, { code: 200, data: { privateCipher } })
    }) as typeof fetch,
  })
  const pairs: Array<readonly [string, string]> = [['content-type', 'application/json'], ['x-session-id', 'session-1']]
  const outcome = await manager.signWithStatus('https://open.bigmodel.cn/api/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.14.0' })
  assert.equal(outcome.signed, true)
  // 3.16.3: the provider baseURL's origin plus the constant path (the baseURL path is dropped).
  const { url: handshakeUrl, method, headers: handshakeHeaders } = seen[0]!
  assert.equal(handshakeUrl, 'https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client')
  assert.equal(method, 'POST')
  assert.deepEqual(handshakeHeaders, { Authorization: 'id.secret', 'Content-Type': 'application/json' })
  assert.equal(seen[0]!.body.apiKey, 'id.secret')
  assert.equal(seen[0]!.body.nonce !== undefined, true)
  assert.equal(seen[0]!.body.sig !== undefined, true)
  const headers = Object.fromEntries(outcome.pairs)
  assert.equal(headers['X-App-Id'], 'zcode')
  assert.equal(headers['X-Session-Id'], 'session-1') // canonical case replaces the trace copy
  assert.equal(headers['X-Client-Version'], '3.14.0')
  assert.match(headers['X-Client-Sig']!, /^[A-Za-z0-9+/=]+$/) // base64, never hex
  assert.match(headers['X-Client-Pow']!, /^[0-9a-f]{32}$/)
  assert.equal(outcome.pairs.some(([key]) => key.toLowerCase() === 'x-session-id' && key !== 'X-Session-Id'), false)
})

test('handshake failure fails open to unsigned', async () => {
  const manager = new ClientSigningManager({ fetchImpl: (async () => jsonRespond(500, {})) as typeof fetch })
  const pairs: Array<readonly [string, string]> = [['x-session-id', 's1']]
  const outcome = await manager.signWithStatus('https://x/api/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.14.0' })
  assert.equal(outcome.signed, false)
  assert.equal(outcome.pairs, pairs)
})

interface SeenRequest { url: string, init: RequestInit | undefined }

/** Fetch double: records every request and answers by URL. */
function recordingFetch(seen: SeenRequest[], answer: (url: string) => Response): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    seen.push({ url, init })
    return Promise.resolve(answer(url))
  }
}

function bodyOf(request: SeenRequest): Record<string, unknown> {
  const body = request.init?.body
  return typeof body === 'string' ? JSON.parse(body) as Record<string, unknown> : {}
}

const MODEL_URL = 'https://open.bigmodel.cn/api/anthropic/v1/messages'
const HANDSHAKE_URL = 'https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client'
const SESSION_PAIRS: Array<readonly [string, string]> = [['x-session-id', 's1']]
const API_KEY_CRED = { credential: 'id.secret', appVersion: '3.16.3' }
const notFound = (): Response => new Response('not found', { status: 404 })
const CUSTOMER_INFO = { data: { organizations: [{ organizationId: 'org', projects: [{ projectId: 'proj' }] }] } }

/** Sign one request to MODEL_URL (or `url`) carrying the session pairs. */
function sign(manager: ClientSigningManager, cred: SigningCredential = API_KEY_CRED, url = MODEL_URL): Promise<SignOutcome> {
  return manager.signWithStatus(url, SESSION_PAIRS, cred)
}

/** A manager whose first handshake has just failed (one 404), leaving API_KEY_CRED on MODEL_URL in the cooldown. */
async function managerInCooldown(seen: SeenRequest[]): Promise<ClientSigningManager> {
  const manager = new ClientSigningManager({ fetchImpl: recordingFetch(seen, notFound) })
  await sign(manager)
  await sign(manager)
  assert.equal(seen.length, 1)
  return manager
}

test('a failed handshake is not retried for 60 s; the cooldown keeps the pairs unsigned', async () => {
  // Deviation from 3.16.3 (which handshakes again before every request), DESIGN.md §4.3.
  const seen: SeenRequest[] = []
  let clock = 1_000_000
  const manager = new ClientSigningManager({ fetchImpl: recordingFetch(seen, notFound), now: () => clock })
  for (let i = 0; i < 3; i++) {
    const outcome = await sign(manager)
    assert.equal(outcome.signed, false)
    assert.equal(outcome.pairs, SESSION_PAIRS)
  }
  assert.deepEqual(seen.map(request => request.url), [HANDSHAKE_URL])
  clock += 59_999
  await sign(manager)
  assert.equal(seen.length, 1)
  clock += 2
  assert.equal((await sign(manager)).signed, false)
  assert.equal(seen.length, 2)
})

test('concurrent requests share one failed handshake, and the cooldown covers the next request', async () => {
  const seen: SeenRequest[] = []
  const manager = new ClientSigningManager({ fetchImpl: recordingFetch(seen, notFound) })
  const outcomes = await Promise.all([sign(manager), sign(manager)])
  assert.deepEqual(outcomes.map(outcome => outcome.signed), [false, false])
  assert.equal(seen.length, 1)
  await sign(manager)
  assert.equal(seen.length, 1)
})

test('a VERIFY invalidation ends the cooldown: the next request handshakes at once', async () => {
  const seen: SeenRequest[] = []
  const manager = await managerInCooldown(seen)
  manager.invalidate(MODEL_URL, API_KEY_CRED.credential)
  await sign(manager)
  assert.equal(seen.length, 2)
})

test('the cooldown is per (origin, credential): another credential or origin handshakes at once', async () => {
  const seen: SeenRequest[] = []
  const manager = await managerInCooldown(seen)
  await sign(manager, { ...API_KEY_CRED, credential: 'other.secret' })
  await sign(manager, API_KEY_CRED, 'https://api.z.ai/api/anthropic/v1/messages')
  assert.deepEqual(seen.map(request => request.url), [HANDSHAKE_URL, HANDSHAKE_URL, 'https://api.z.ai/api/paas/c1f3a7e2/v2/client'])
  assert.deepEqual(seen.map(request => bodyOf(request).apiKey), ['id.secret', 'other.secret', 'id.secret'])
})

test('a handshake overtaken by invalidation starts no cooldown when it fails', async () => {
  let handshakes = 0
  const first: { sent?: () => void, answer?: (response: Response) => void } = {}
  const sent = new Promise<void>(resolve => { first.sent = resolve })
  const manager = new ClientSigningManager({
    fetchImpl: () => {
      handshakes += 1
      if (handshakes > 1) return Promise.resolve(notFound())
      first.sent?.()
      return new Promise<Response>(resolve => { first.answer = resolve })
    },
  })
  const overtaken = sign(manager)
  await sent
  manager.invalidate(MODEL_URL, API_KEY_CRED.credential)
  first.answer?.(notFound())
  assert.equal((await overtaken).signed, false)
  await sign(manager)
  assert.equal(handshakes, 2)
})

/** The notices one failing handshake for `credential` produces. */
async function handshakeNotices(credential: string, fetchImpl: typeof fetch): Promise<string[]> {
  const events: string[] = []
  const manager = new ClientSigningManager({ fetchImpl, onEvent: message => { events.push(message) } })
  assert.equal((await sign(manager, { ...API_KEY_CRED, credential })).signed, false)
  return events
}

const handshakeFailed = (reason: string): string => `client-signing: signing handshake failed (${reason}) — sending unsigned; no new handshake for 60 s`

test('handshake notices carry failure kinds and error names, never the credential or server text', async () => {
  // An embedded LF makes fetch's header validation quote the header value,
  // here the credential (Node 22: `Headers.append: "<value>" is an invalid
  // header value.`). The Headers constructor runs the same validation offline.
  const credential = 'id.sec\nret'
  const validating: typeof fetch = (_input, init) => Promise.resolve(init?.headers).then(headers => new Headers(headers)).then(() => notFound())
  await assert.rejects(validating(HANDSHAKE_URL, { headers: { Authorization: credential } }), { name: 'TypeError', message: /id\.sec\nret/u })
  assert.deepEqual(await handshakeNotices(credential, validating), [handshakeFailed('TypeError')])
  // 3.16.3 keeps a rejection's msg only when it matches ^HANDSHAKE_[A-Z_]+$.
  const rejecting = (msg: string): typeof fetch => recordingFetch([], () => jsonRespond(200, { code: 1001, msg }))
  assert.deepEqual(await handshakeNotices('id.secret', rejecting('unknown apiKey id.secret')), [handshakeFailed('handshake_rejected')])
  assert.deepEqual(await handshakeNotices('id.secret', rejecting('HANDSHAKE_SIGNATURE_INVALID')), [handshakeFailed('handshake_rejected: HANDSHAKE_SIGNATURE_INVALID')])
  assert.deepEqual(await handshakeNotices('id.secret', recordingFetch([], notFound)), [handshakeFailed('handshake_http_404')])
})

test('handshakeFetch carries only the handshake; the project-token mint stays on fetchImpl', async () => {
  const direct: SeenRequest[] = []
  const handshakes: SeenRequest[] = []
  const manager = new ClientSigningManager({
    fetchImpl: recordingFetch(direct, url => url.endsWith('/getCustomerInfo') ? jsonRespond(200, CUSTOMER_INFO) : jsonRespond(200, { code: 500 })),
    handshakeFetch: recordingFetch(handshakes, notFound),
  })
  await sign(manager, { ...API_KEY_CRED, oauthAccessToken: 'oauth-tok' })
  assert.deepEqual(direct.map(request => new URL(request.url).pathname), [
    '/api/biz/customer/getCustomerInfo',
    '/api/biz/v1/organization/org/projects/proj/api_keys/id/access_tokens',
  ])
  assert.deepEqual(handshakes.map(request => request.url), [HANDSHAKE_URL])
})

test('the JWT-form handshake sends the project token as-is in Authorization and under accessToken', async () => {
  // 3.16.3 `performHandshake`: `Authorization: credential` for both forms, no `Bearer ` prefix.
  const projectToken = b64url({ token_use: 'project_access', api_key: 'id', exp: Math.floor(Date.now() / 1000) + 3600 })
  const handshakes: SeenRequest[] = []
  const manager = new ClientSigningManager({
    fetchImpl: recordingFetch([], url => url.endsWith('/getCustomerInfo') ? jsonRespond(200, CUSTOMER_INFO) : jsonRespond(200, { code: 200, data: { accessToken: projectToken } })),
    handshakeFetch: recordingFetch(handshakes, notFound),
  })
  await sign(manager, { ...API_KEY_CRED, oauthAccessToken: 'oauth-tok' })
  assert.equal(handshakes.length, 1)
  const [handshake] = handshakes
  assert.deepEqual(handshake.init?.headers, { Authorization: projectToken, 'Content-Type': 'application/json' })
  const body = bodyOf(handshake)
  assert.deepEqual(Object.keys(body), ['accessToken', 'nonce', 'sig', 'ts'])
  assert.equal(body.accessToken, projectToken)
})

test('401 VERIFY ladder: retry once, then permanent bypass', async () => {
  const manager = new ClientSigningManager({
    fetchImpl: (async () => {
      return jsonRespond(500, {})
    }) as typeof fetch,
  })
  const url = 'https://x/api/anthropic/v1/messages'
  const verifyFailure = () => jsonRespond(401, { error: { reason: 'VERIFY_SIGNATURE_INVALID' } })
  const sends: number[] = []
  const resp = await sendWithClientSigning(manager, {
    url,
    headerPairs: [['x-session-id', 's1']],
    credential: 'no-sep', // never signable: the ladder sends as-is both times
    appVersion: '3.14.0',
    send: async () => { sends.push(1); return verifyFailure() },
  })
  assert.equal(resp.status, 401)
  assert.equal(sends.length, 1) // unsigned first pass returns the 401 directly
  // non-VERIFY 401s and other statuses are not signing failures
  assert.equal(await manager.isVerifyFailure(jsonRespond(401, { error: { reason: 'other' } })), false)
  assert.equal(await manager.isVerifyFailure(jsonRespond(500, {})), false)
  assert.equal(await manager.isVerifyFailure(verifyFailure()), true)
})

test('setBypass permanently stops signing for the pair', async () => {
  const manager = new ClientSigningManager({ fetchImpl: (async () => { throw new Error('no fetch expected') }) as typeof fetch })
  const url = 'https://x/api/anthropic/v1/messages'
  manager.setBypass(url, 'id.secret')
  const outcome = await manager.signWithStatus(url, [['x-session-id', 's1']], { credential: 'id.secret', appVersion: '3.14.0' })
  assert.equal(outcome.signed, false)
})

test('project-token mint sends the same clientVersion the signer signs with', async () => {
  // 3.16.3 feeds one version constant to both the access_tokens body and the
  // signer; the channel passes its app baseline through the signing credential.
  const bodies: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/biz/customer/getCustomerInfo')) {
      return jsonRespond(200, { data: { organizations: [{ organizationId: 'org', organizationName: '默认机构', projects: [{ projectId: 'proj', projectName: '默认项目', projectType: '1' }] }] } })
    }
    if (url.endsWith('/access_tokens')) {
      bodies.push(String(init?.body))
      return jsonRespond(200, { code: 500 })
    }
    return jsonRespond(500, {}) // handshake: fail open
  }) as typeof fetch
  const manager = new ClientSigningManager({ fetchImpl })
  await manager.signWithStatus('https://x/api/anthropic/v1/messages', [['x-session-id', 's1']], { credential: 'id.secret', appVersion: '9.9.9', oauthAccessToken: 'oauth-tok' })
  assert.equal(bodies.length, 1)
  assert.deepEqual(JSON.parse(bodies[0]!), { clientType: 'zcode', clientVersion: '9.9.9' })
})
