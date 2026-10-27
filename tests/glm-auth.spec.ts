import assert from 'node:assert/strict'
import test from 'node:test'
import { PollOAuthClient, buildDesktopOAuthRedirectParam, parsePastedCallbackUrl, exchangeCode, buildPasteAuthorizeUrl, freshPasteState } from '../src/glm-llm/auth/oauth.ts'
import { loadCredential, saveCredential, clearCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import { resolveCodingPlanCredential } from '../src/glm-llm/auth/resolver.ts'
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
  assert.ok(seen[0]!.url.endsWith('/oauth/cli/init'))
  assert.match(seen[0]!.authorization!, /^Bearer [0-9a-f]{64}$/) // 32 random bytes hex as the poll token
  const url = new URL(started.authorizeUrl)
  assert.equal(url.searchParams.get('client'), 'x')
  assert.equal(url.searchParams.get('redirect'), buildDesktopOAuthRedirectParam('3.14.0'))
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

function memoryStore(): { fs: StoreFs, files: Map<string, string> } {
  const files = new Map<string, string>()
  const fs: StoreFs = {
    readFile: async path => { const value = files.get(path); if (value === undefined) throw new Error('ENOENT'); return value },
    writeFile: async (path, data) => { files.set(`${path}.tmp`, data); files.set(path, data) },
    rename: async (from, to) => { files.set(to, files.get(from) ?? ''); files.delete(from) },
    exists: async path => files.has(path),
  }
  return { fs, files }
}

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

test('resolver resolves default org/project, reuses or creates zcode-api-key, appends secret', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${(init?.method ?? 'GET')} ${u}`)
    if (u.endsWith('getCustomerInfo')) {
      return jsonRespond(200, { code: 0, data: { organizations: [{ organizationName: '默认机构', organizationId: 'org1', projects: [{ projectName: '默认项目', projectId: 'proj1' }] }] } })
    }
    if (u.endsWith('/api_keys') && init?.method === 'GET') {
      return jsonRespond(200, { code: 0, data: [{ name: 'zcode-api-key', apiKey: 'existing-key' }] })
    }
    if (u.includes('/copy/')) {
      return jsonRespond(200, { code: 0, data: { secretKey: 'sec' } })
    }
    throw new Error(`unexpected ${u}`)
  }) as typeof fetch
  const cred = await resolveCodingPlanCredential(fetchImpl, 'oauth-token', 'u1')
  assert.equal(cred.apiKey, 'existing-key.sec')
  assert.equal(cred.oauthAccessToken, 'oauth-token')
  assert.equal(cred.userId, 'u1')
  assert.ok(calls.some(entry => entry.includes('GET') && entry.includes('/copy/existing-key')))
})

test('resolver creates the key when the list has no zcode-api-key and shape-guards the response', async () => {
  let created = false
  const create = (apiKey: unknown) => (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('getCustomerInfo')) return jsonRespond(200, { code: 0, data: { organizations: [{ organizationId: 'org1', projects: [{ projectId: 'proj1' }] }] } })
    if (u.endsWith('/api_keys') && init?.method === 'GET') return jsonRespond(200, { code: 0, data: [] })
    if (u.endsWith('/api_keys') && init?.method === 'POST') { created = true; return jsonRespond(200, { code: 0, data: { apiKey } }) }
    if (u.includes('/copy/')) return jsonRespond(500, {})
    throw new Error(`unexpected ${u}`)
  }) as typeof fetch
  const cred = await resolveCodingPlanCredential(create('fresh-key'), 'oauth-token')
  assert.ok(created)
  assert.equal(cred.apiKey, 'fresh-key') // secret endpoint failed: apiKey-only form
  await assert.rejects(resolveCodingPlanCredential(create(undefined), 'oauth-token'), /apiKey missing or empty/)
  await assert.rejects(resolveCodingPlanCredential(create(''), ''), /access token/)
})

test('jwt inspection reports age and rejects non-jwt shapes', () => {
  const info = inspectJwt(`h.${b64url({ iat: Math.floor(Date.now() / 1000) - 3600, user_id: 'u1' })}.s`)
  assert.ok(info !== null)
  assert.ok(Math.abs(info.ageHours - 1) < 0.01)
  assert.equal(info.userId, 'u1')
  assert.equal(inspectJwt('not-a-jwt'), null)
  assert.equal(inspectJwt(`h.${b64url({})}.s`), null)
})
