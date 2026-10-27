import assert from 'node:assert/strict'
import test from 'node:test'
import { ClientSigningManager, sendWithClientSigning, parseSigningCredentialForm, createProofOfWork, hasLeadingZeroBits } from '../src/glm-llm/signing.ts'

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

test('signing skips http, unsigned paths, already-signed pairs, and separator-less credentials', async () => {
  const manager = new ClientSigningManager({ fetchImpl: async () => { throw new Error('should not fetch') } })
  const pairs: Array<readonly [string, string]> = [['content-type', 'application/json'], ['x-session-id', 's1']]
  assert.equal((await manager.signWithStatus('http://x/api/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.14.0' })).signed, false)
  assert.equal((await manager.signWithStatus('https://x/api/v1/zcode-plan/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.14.0' })).signed, false)
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

  const seen: Array<{ url: string, body: Record<string, unknown> }> = []
  const manager = new ClientSigningManager({
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return jsonRespond(200, { code: 200, data: { privateCipher } })
    }) as typeof fetch,
  })
  const pairs: Array<readonly [string, string]> = [['content-type', 'application/json'], ['x-session-id', 'session-1']]
  const outcome = await manager.signWithStatus('https://open.bigmodel.cn/api/anthropic/v1/messages', pairs, { credential: 'id.secret', appVersion: '3.14.0' })
  assert.equal(outcome.signed, true)
  assert.ok(seen[0]!.url.endsWith('/api/paas/c1f3a7e2/v2/client'))
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
