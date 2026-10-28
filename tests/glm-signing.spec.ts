import assert from 'node:assert/strict'
import test from 'node:test'
import { ClientSigningManager, sendWithClientSigning, parseSigningCredentialForm, createProofOfWork, hasLeadingZeroBits, type SignOutcome, type SigningCredential } from '../src/glm-llm/signing.ts'
import { fakeProjectToken, sealedSigningKey } from './glm-fixtures.ts'

const encoder = new TextEncoder()

/** A three-segment token with the given header and payload (fake signature). */
function jwtWith(payload: object, header: object): string {
  return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`
}

test('the signing credential is the project access token: HS256 + typ JWT + sign_type SIGN with an api_key claim (3.16.3 D1r)', () => {
  const pat = fakeProjectToken('key-id')
  assert.deepEqual(parseSigningCredentialForm(pat), { apiKeyId: 'key-id', secret: pat })
  assert.equal(parseSigningCredentialForm(jwtWith({ token_use: 'project_access', api_key: 'key-id' }, { alg: 'HS256', sign_type: 'SIGN' })), undefined) // no typ
  assert.equal(parseSigningCredentialForm(jwtWith({ token_use: 'other', api_key: 'key-id' }, { alg: 'HS256', typ: 'JWT', sign_type: 'SIGN' })), undefined)
  assert.equal(parseSigningCredentialForm(jwtWith({ token_use: 'project_access', api_key: ' ' }, { alg: 'HS256', typ: 'JWT', sign_type: 'SIGN' })), undefined)
  // The {apiKeyId}.{secret} form is no credential of this channel any more.
  assert.equal(parseSigningCredentialForm('id.secret'), undefined)
  assert.equal(parseSigningCredentialForm('a.b.c'), undefined)
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

const PAT = fakeProjectToken('id')
const PAT_CRED: SigningCredential = { credential: PAT, appVersion: '3.16.3' }

test('signing skips http, already-signed pairs, and credentials that are not project access tokens', async () => {
  const manager = new ClientSigningManager({ handshakeFetch: async () => { throw new Error('should not fetch') } })
  const pairs: Array<readonly [string, string]> = [['content-type', 'application/json'], ['x-session-id', 's1']]
  assert.equal((await manager.signWithStatus('http://x/api/anthropic/v1/messages', pairs, PAT_CRED)).signed, false)
  assert.equal((await manager.signWithStatus('https://x/api/anthropic/v1/messages', [['x-client-sig', 'present'], ['x-session-id', 's1']], PAT_CRED)).signed, false)
  assert.equal((await manager.signWithStatus('https://x/api/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.16.3' })).signed, false)
})

test('a full handshake with the project access token signs the pairs with the V4 header block', async () => {
  const privateCipher = await sealedSigningKey(PAT, 'id')
  const seen: Array<{ url: string, method: string | undefined, headers: Record<string, string>, body: Record<string, unknown> }> = []
  const manager = new ClientSigningManager({
    handshakeFetch: (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return jsonRespond(200, { code: 200, data: { privateCipher } })
    }) as typeof fetch,
  })
  const pairs: Array<readonly [string, string]> = [['content-type', 'application/json'], ['x-session-id', 'session-1']]
  const outcome = await manager.signWithStatus('https://open.bigmodel.cn/api/anthropic/v1/messages', pairs, { credential: PAT, appVersion: '3.14.0' })
  assert.equal(outcome.signed, true)
  // 3.16.3: the provider baseURL's origin plus the constant path; the token as-is, named accessToken.
  const { url: handshakeUrl, method, headers: handshakeHeaders } = seen[0]!
  assert.equal(handshakeUrl, 'https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client')
  assert.equal(method, 'POST')
  assert.deepEqual(handshakeHeaders, { Authorization: PAT, 'Content-Type': 'application/json' })
  assert.deepEqual(Object.keys(seen[0]!.body), ['accessToken', 'nonce', 'sig', 'ts'])
  assert.equal(seen[0]!.body.accessToken, PAT)
  const headers = Object.fromEntries(outcome.pairs)
  assert.equal(headers['X-App-Id'], 'zcode')
  assert.equal(headers['X-Session-Id'], 'session-1') // canonical case replaces the trace copy
  assert.equal(headers['X-Client-Version'], '3.14.0')
  assert.match(headers['X-Client-Sig']!, /^[A-Za-z0-9+/=]+$/) // base64, never hex
  assert.match(headers['X-Client-Pow']!, /^[0-9a-f]{32}$/)
  assert.equal(outcome.pairs.some(([key]) => key.toLowerCase() === 'x-session-id' && key !== 'X-Session-Id'), false)
})

test('handshake failure fails open to unsigned', async () => {
  const manager = new ClientSigningManager({ handshakeFetch: (async () => jsonRespond(500, {})) as typeof fetch })
  const pairs: Array<readonly [string, string]> = [['x-session-id', 's1']]
  const outcome = await manager.signWithStatus('https://x/api/anthropic/v1/messages', pairs, PAT_CRED)
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
const notFound = (): Response => new Response('not found', { status: 404 })

/** Sign one request to MODEL_URL (or `url`) carrying the session pairs. */
function sign(manager: ClientSigningManager, cred: SigningCredential = PAT_CRED, url = MODEL_URL): Promise<SignOutcome> {
  return manager.signWithStatus(url, SESSION_PAIRS, cred)
}

/** A manager whose first handshake has just failed (one 404), leaving PAT_CRED on MODEL_URL in the cooldown. */
async function managerInCooldown(seen: SeenRequest[]): Promise<ClientSigningManager> {
  const manager = new ClientSigningManager({ handshakeFetch: recordingFetch(seen, notFound) })
  await sign(manager)
  await sign(manager)
  assert.equal(seen.length, 1)
  return manager
}

test('a failed handshake is not retried for 60 s; the cooldown keeps the pairs unsigned', async () => {
  // Deviation from 3.16.3 (which handshakes again before every request), DESIGN.md §4.3.
  const seen: SeenRequest[] = []
  let clock = 1_000_000
  const manager = new ClientSigningManager({ handshakeFetch: recordingFetch(seen, notFound), now: () => clock })
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
  const manager = new ClientSigningManager({ handshakeFetch: recordingFetch(seen, notFound) })
  const outcomes = await Promise.all([sign(manager), sign(manager)])
  assert.deepEqual(outcomes.map(outcome => outcome.signed), [false, false])
  assert.equal(seen.length, 1)
  await sign(manager)
  assert.equal(seen.length, 1)
})

test('a VERIFY invalidation ends the cooldown: the next request handshakes at once', async () => {
  const seen: SeenRequest[] = []
  const manager = await managerInCooldown(seen)
  manager.invalidate(MODEL_URL, PAT_CRED.credential)
  await sign(manager)
  assert.equal(seen.length, 2)
})

test('the cooldown is per (origin, credential): another project token or origin handshakes at once', async () => {
  const seen: SeenRequest[] = []
  const manager = await managerInCooldown(seen)
  const other = fakeProjectToken('id', 2)
  await sign(manager, { ...PAT_CRED, credential: other })
  await sign(manager, PAT_CRED, 'https://api.z.ai/api/anthropic/v1/messages')
  assert.deepEqual(seen.map(request => request.url), [HANDSHAKE_URL, HANDSHAKE_URL, 'https://api.z.ai/api/paas/c1f3a7e2/v2/client'])
  assert.deepEqual(seen.map(request => bodyOf(request).accessToken), [PAT, other, PAT])
})

test('a handshake overtaken by invalidation starts no cooldown when it fails', async () => {
  let handshakes = 0
  const first: { sent?: () => void, answer?: (response: Response) => void } = {}
  const sent = new Promise<void>(resolve => { first.sent = resolve })
  const manager = new ClientSigningManager({
    handshakeFetch: () => {
      handshakes += 1
      if (handshakes > 1) return Promise.resolve(notFound())
      first.sent?.()
      return new Promise<Response>(resolve => { first.answer = resolve })
    },
  })
  const overtaken = sign(manager)
  await sent
  manager.invalidate(MODEL_URL, PAT_CRED.credential)
  first.answer?.(notFound())
  assert.equal((await overtaken).signed, false)
  await sign(manager)
  assert.equal(handshakes, 2)
})

/** The notices one failing handshake for `credential` produces. */
async function handshakeNotices(credential: string, handshakeFetch: typeof fetch): Promise<string[]> {
  const events: string[] = []
  const manager = new ClientSigningManager({ handshakeFetch, onEvent: message => { events.push(message) } })
  assert.equal((await sign(manager, { ...PAT_CRED, credential })).signed, false)
  return events
}

const handshakeFailed = (reason: string): string => `client-signing: signing handshake failed (${reason}) — sending unsigned; no new handshake for 60 s`

test('handshake notices carry failure kinds and error names, never the credential or server text', async () => {
  // An embedded LF makes fetch's header validation quote the header value,
  // here the credential (Node 22: `Headers.append: "<value>" is an invalid
  // header value.`). The Headers constructor runs the same validation offline.
  const credential = `${PAT}\nX`
  const validating: typeof fetch = (_input, init) => Promise.resolve(init?.headers).then(headers => new Headers(headers)).then(() => notFound())
  await assert.rejects(validating(HANDSHAKE_URL, { headers: { Authorization: credential } }), { name: 'TypeError', message: /sig\nX/u })
  assert.deepEqual(await handshakeNotices(credential, validating), [handshakeFailed('TypeError')])
  // 3.16.3 keeps a rejection's msg only when it matches ^HANDSHAKE_[A-Z_]+$.
  const rejecting = (msg: string): typeof fetch => recordingFetch([], () => jsonRespond(200, { code: 1001, msg }))
  assert.deepEqual(await handshakeNotices(PAT, rejecting(`unknown token ${PAT}`)), [handshakeFailed('handshake_rejected')])
  assert.deepEqual(await handshakeNotices(PAT, rejecting('HANDSHAKE_SIGNATURE_INVALID')), [handshakeFailed('handshake_rejected: HANDSHAKE_SIGNATURE_INVALID')])
  assert.deepEqual(await handshakeNotices(PAT, recordingFetch([], notFound)), [handshakeFailed('handshake_http_404')])
})

test('401 VERIFY ladder: retry once, then permanent bypass', async () => {
  const manager = new ClientSigningManager({ handshakeFetch: (async () => jsonRespond(500, {})) as typeof fetch })
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
  const manager = new ClientSigningManager({ handshakeFetch: (async () => { throw new Error('no fetch expected') }) as typeof fetch })
  const url = 'https://x/api/anthropic/v1/messages'
  manager.setBypass(url, PAT)
  const outcome = await manager.signWithStatus(url, [['x-session-id', 's1']], PAT_CRED)
  assert.equal(outcome.signed, false)
})
