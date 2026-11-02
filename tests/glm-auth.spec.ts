import assert from 'node:assert/strict'
import test from 'node:test'
import { ZCODE_APP_VERSION } from '../src/glm-llm/identity.ts'
import { PollOAuthClient, buildDesktopOAuthRedirectParam, parsePastedCallbackUrl, exchangeCode, buildPasteAuthorizeUrl, freshPasteState } from '../src/glm-llm/auth/oauth.ts'
import { loadCredential, loadStoredCredential, saveCredential, clearCredential, updateStoredCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import { memoryStore } from './glm-fixtures.ts'
import { inspectJwt } from '../src/glm-llm/auth/jwt.ts'

/** Minimal Response stand-in the oauth client accepts. */
function jsonRespond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('poll flow init appends the desktop interstitial redirect param', async () => {
  const seen: Array<{ url: string, authorization?: string }> = []
  const client = new PollOAuthClient(async (url, init) => {
    seen.push({ url: String(url), authorization: (init?.headers as Record<string, string>)?.authorization })
    return jsonRespond(200, { code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth?client=x', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
  })
  const started = await client.start()
  assert.ok(seen[0].url.endsWith('/oauth/cli/init'))
  assert.match(seen[0].authorization!, /^Bearer [0-9a-f]{64}$/) // 32 random bytes hex as the poll token
  const url = new URL(started.authorizeUrl)
  assert.equal(url.searchParams.get('client'), 'x')
  assert.equal(url.searchParams.get('redirect'), buildDesktopOAuthRedirectParam(ZCODE_APP_VERSION))
})

test('poll flow completes on ready with provider token, jwt, and user id', async () => {
  let phase = 0
  const client = new PollOAuthClient(async url => {
    if (String(url).endsWith('/oauth/cli/init')) {
      return jsonRespond(200, { code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
    }
    phase += 1
    if (phase === 1) return jsonRespond(200, { code: 0, data: { status: 'pending' } })
    return jsonRespond(200, { code: 0, data: { status: 'ready', token: ' jwt-value ', user: { user_id: 'u1' }, bigmodel: { access_token: ' bm-token ' } } })
  }, async () => {})
  await client.start()
  const tokens = await client.complete()
  assert.equal(tokens.accessToken, 'bm-token')
  assert.equal(tokens.jwt, 'jwt-value')
  assert.equal(tokens.userId, 'u1')
})

test('poll flow retries 5xx, 408, 429, and network errors as pending, but 404 and code!==0 are fatal', async () => {
  let step = 0
  const failOnce = (status: number) => {
    const client = new PollOAuthClient(async url => {
      if (String(url).endsWith('/oauth/cli/init')) {
        return jsonRespond(200, { code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
      }
      step += 1
      if (step === 1) return jsonRespond(status, { code: 0, data: { status: 'pending' } })
      return jsonRespond(200, { code: 0, data: { status: 'ready', bigmodel: { access_token: 'bm-token' } } })
    }, async () => {})
    return client
  }
  for (const status of [500, 408, 429]) {
    step = 0
    const client = failOnce(status)
    await client.start()
    assert.equal((await client.complete()).accessToken, 'bm-token', `status ${status} retried`)
  }
  step = 0
  const fatal = new PollOAuthClient(async url => {
    if (String(url).endsWith('/oauth/cli/init')) {
      return jsonRespond(200, { code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
    }
    return jsonRespond(404, {})
  }, async () => {})
  await fatal.start()
  await assert.rejects(fatal.complete(), /status=404/)
  const coded = new PollOAuthClient(async url => {
    if (String(url).endsWith('/oauth/cli/init')) {
      return jsonRespond(200, { code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
    }
    return jsonRespond(200, { code: 7, msg: 'nope' })
  }, async () => {})
  await coded.start()
  await assert.rejects(coded.complete(), /code=7/)
})

test('paste login parses wrapped URLs, rejects state mismatch, and tolerates &amp;', () => {
  const state = freshPasteState()
  const pasted = `"http://127.0.0.1:1/oauth/callback/bigmodel?authCode=abc&amp;state=${state}"`
  assert.equal(parsePastedCallbackUrl(pasted, state), 'abc')
  assert.throws(() => parsePastedCallbackUrl('http://x/cb?authCode=abc&state=other', state), /state mismatch/)
  assert.throws(() => parsePastedCallbackUrl(`http://x/cb?state=${state}`, state), /No authorization code/)
})

test('paste login authorize URL carries appId, redirect, and state', () => {
  const url = new URL(buildPasteAuthorizeUrl('http://127.0.0.1:1/cb', 's1'))
  assert.equal(url.origin + url.pathname, 'https://bigmodel.cn/login')
  assert.equal(url.searchParams.get('appId'), 'zcode')
  assert.equal(url.searchParams.get('redirect'), 'http://127.0.0.1:1/cb')
  assert.equal(url.searchParams.get('state'), 's1')
})

test('token exchange unwraps the envelope and guards the provider token shape', async () => {
  const ok = await exchangeCode(async () => jsonRespond(200, { code: 0, data: { token: 'jwt', user: { user_id: 'u1' }, bigmodel: { access_token: 'bm' } } }), 'c', 'r', 's')
  assert.equal(ok.accessToken, 'bm')
  assert.equal(ok.jwt, 'jwt')
  await assert.rejects(exchangeCode(async () => jsonRespond(200, { code: 0, data: { user: {} } }), 'c', 'r', 's'), /missing data.bigmodel.access_token/)
  await assert.rejects(exchangeCode(async () => jsonRespond(500, { code: 5, msg: 'bad' }), 'c', 'r', 's'), /msg=bad/)
})

test('credential store round-trips and stays sealed at rest', async () => {
  const { fs, files } = memoryStore()
  const value = { apiKey: 'sk.secret', provider: 'bigmodel' }
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', value)
  const atRest = files.get('C:/ws/.llm/credentials.json')!
  assert.ok(!atRest.includes('sk.secret')) // ciphertext only
  assert.deepEqual(await loadCredential(fs, 'C:/ws/.llm/credentials.json'), value)
})

test('credential store: missing is undefined, corruption and clears fail loud or reset', async () => {
  const { fs, files } = memoryStore()
  assert.equal(await loadCredential(fs, 'C:/ws/.llm/credentials.json'), undefined)
  files.set('C:/ws/.llm/credentials.json', 'not json')
  await assert.rejects(loadCredential(fs, 'C:/ws/.llm/credentials.json'), /corrupted/)
  files.set('C:/ws/.llm/credentials.json', '')
  assert.equal(await loadCredential(fs, 'C:/ws/.llm/credentials.json'), undefined)
  files.set('C:/ws/.llm/credentials.json', '{"v":1,"iv":"AAAA","authTag":"AAAA","data":"AAAA"}')
  await assert.rejects(loadCredential(fs, 'C:/ws/.llm/credentials.json'), /cannot be decrypted/)
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', { a: 1 })
  await clearCredential(fs, 'C:/ws/.llm/credentials.json')
  assert.equal(await loadCredential(fs, 'C:/ws/.llm/credentials.json'), undefined)
})

function b64url(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

const STORE = 'C:/ws/.llm/credentials.json'
// Obvious fakes; the v1 record is the shape stored before m1-parity.
const V1 = { apiKey: 'fakeid.fakesecretvalue', provider: 'bigmodel', userId: 'user-1', jwt: 'fake.plan.jwt', oauthAccessToken: 'fake-oauth' }

test('a version-1 record migrates once to version 2: the API key and its secret leave the store, the login stays', async () => {
  const { fs, files } = memoryStore()
  await saveCredential(fs, STORE, V1)
  const loaded = await loadStoredCredential(fs, STORE)
  assert.deepEqual(loaded, { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth', userId: 'user-1', jwt: 'fake.plan.jwt' })
  const rewritten = await loadCredential(fs, STORE) as Record<string, unknown>
  assert.deepEqual(rewritten, { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth', userId: 'user-1', jwt: 'fake.plan.jwt' })
  assert.ok(!JSON.stringify(rewritten).includes('fakesecretvalue'))
  assert.ok(!('apiKey' in rewritten))
  // A second load reads version 2 as it is.
  const atRest = files.get(STORE)
  assert.deepEqual(await loadStoredCredential(fs, STORE), loaded)
  assert.equal(files.get(STORE), atRest)
})

test('a failed rewrite keeps the old file byte for byte and still serves the login', async () => {
  const { fs, files } = memoryStore()
  await saveCredential(fs, STORE, V1)
  const before = files.get(STORE)
  const failing = { ...fs, rename: () => Promise.reject(new Error('EPERM')) }
  assert.deepEqual(await loadStoredCredential(failing, STORE), { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth', userId: 'user-1', jwt: 'fake.plan.jwt' })
  assert.equal(files.get(STORE), before)
  assert.deepEqual([...files.keys()], [STORE]) // the failed write removed its temp file
})

test('concurrent first reads migrate a version-1 record once, through a temp file of its own (3.16.3 PWs naming)', async () => {
  // DSH sends the session title and the first step about together: both read v1.
  const { fs, files } = memoryStore()
  await saveCredential(fs, STORE, V1)
  const writes: string[] = []
  const counting: StoreFs = { ...fs, writeFile: (path, data) => { writes.push(path); return fs.writeFile(path, data) } }
  const [first, second] = await Promise.all([loadStoredCredential(counting, STORE), loadStoredCredential(counting, STORE)])
  assert.deepEqual(first, second)
  assert.equal(writes.length, 1)
  assert.match(writes[0], /[\\/]\.credentials\.json\.\d+\.\d+\.[0-9a-f]+\.tmp$/)
  assert.deepEqual([...files.keys()], [STORE])
  assert.deepEqual(await loadCredential(fs, STORE), first)
})

test('writes of one store run one after another: a login landing during a read-modify-write is kept', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, STORE, { version: 2, provider: 'bigmodel', oauthAccessToken: 'old-oauth' })
  let landed: Promise<void> | undefined
  await updateStoredCredential(fs, STORE, current => {
    landed = saveCredential(fs, STORE, { version: 2, provider: 'bigmodel', oauthAccessToken: 'new-oauth' })
    return { ...current, userId: 'user-1' }
  })
  await landed
  assert.deepEqual(await loadCredential(fs, STORE), { version: 2, provider: 'bigmodel', oauthAccessToken: 'new-oauth' })
  // An update that returns undefined leaves the file as it is; no stored login: nothing is written.
  const before = await loadCredential(fs, STORE)
  await updateStoredCredential(fs, STORE, () => undefined)
  assert.deepEqual(await loadCredential(fs, STORE), before)
  const empty = memoryStore()
  await updateStoredCredential(empty.fs, STORE, current => current)
  assert.equal(empty.files.size, 0)
})

test('a version-1 record without any login token is left untouched and reads as a record without tokens', async () => {
  const { fs, files } = memoryStore()
  await saveCredential(fs, STORE, { apiKey: 'fakeid.fakesecretvalue', provider: 'bigmodel' })
  const before = files.get(STORE)
  assert.deepEqual(await loadStoredCredential(fs, STORE), { version: 2, provider: 'bigmodel' })
  assert.equal(files.get(STORE), before)
})

test('version 2 reads back with its location; other shapes, corruption and a missing store behave as before', async () => {
  const { fs, files } = memoryStore()
  const location = { key: 'project-key-location:v1:x', value: '{"organizationId":"o","projectId":"p","apiKeyId":"k"}' }
  await saveCredential(fs, STORE, { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth', location })
  assert.deepEqual(await loadStoredCredential(fs, STORE), { version: 2, provider: 'bigmodel', oauthAccessToken: 'fake-oauth', location })
  await saveCredential(fs, STORE, { provider: 'other', apiKey: 'x' })
  assert.equal(await loadStoredCredential(fs, STORE), undefined)
  files.set(STORE, 'not json')
  await assert.rejects(loadStoredCredential(fs, STORE), /corrupted/)
  files.delete(STORE)
  assert.equal(await loadStoredCredential(fs, STORE), undefined)
})

test('jwt inspection reports age and rejects non-jwt shapes', () => {
  const info = inspectJwt(`h.${b64url({ iat: Math.floor(Date.now() / 1000) - 3600, user_id: 'u1' })}.s`)
  assert.ok(info !== null)
  assert.ok(Math.abs(info.ageHours - 1) < 0.01)
  assert.equal(info.userId, 'u1')
  assert.equal(inspectJwt('not-a-jwt'), null)
  assert.equal(inspectJwt(`h.${b64url({})}.s`), null)
})
