import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectAccessTokenClient, projectTokenFingerprint, projectTokenRequest, type ProjectKeyLocationStore, type ProjectTokenRequest } from '../src/glm-llm/auth/project-token.ts'
import { fakeProjectToken } from './glm-fixtures.ts'

// Fake tokens only. The client is ported from ZCode 3.16.3 ProjectAccessTokenClient (sge @1083993).

interface Call { url: string, method: string, headers: Record<string, string>, body?: string }

const ORIGIN = 'https://bigmodel.cn'
const INFO = `${ORIGIN}/api/biz/customer/getCustomerInfo`
const keysOf = (org: string, project: string): string => `${ORIGIN}/api/biz/v1/organization/${org}/projects/${project}/api_keys`

/** A PAT-plane double: answers by URL; `mint` answers the n-th access_tokens call. */
function plane(options: { organizations?: unknown, keys?: unknown, created?: unknown, mint?: (n: number) => unknown } = {}): { request: ProjectTokenRequest, calls: Call[] } {
  const calls: Call[] = []
  let mints = 0
  const request: ProjectTokenRequest = (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }) })
    if (url === INFO) return Promise.resolve({ code: 200, data: { organizations: options.organizations ?? [{ organizationId: 'org-1', projects: [{ projectId: 'proj-1' }] }] } })
    if (url.endsWith('/api_keys') && init.method === 'GET') return Promise.resolve({ code: 200, data: options.keys ?? [{ name: 'zcode-api-key', apiKey: 'key-1' }] })
    if (url.endsWith('/api_keys') && init.method === 'POST') return Promise.resolve({ code: 200, data: options.created ?? { apiKey: 'key-new' } })
    if (url.endsWith('/access_tokens')) {
      mints += 1
      return options.mint === undefined ? Promise.resolve(minted(mints)) : Promise.resolve(options.mint(mints)).then(value => value instanceof Error ? Promise.reject(value) : value)
    }
    return Promise.reject(new Error(`unexpected ${url}`))
  }
  return { request, calls }
}

/** A successful mint answer valid for an hour from `nowMs`. */
function minted(serial: number, nowMs = Date.now(), extra: Record<string, unknown> = {}): unknown {
  return { code: 200, data: { accessToken: fakeProjectToken('key-1', serial), tokenType: 'Bearer', expiresIn: 3600, expiresAt: Math.floor(nowMs / 1000) + 3600, ...extra } }
}

const input = { origin: ORIGIN, loginToken: 'oauth-tok', accountId: 'user-1', clientVersion: '3.16.3' }

test('locate then mint: raw OAuth token for customer info and keys, Bearer for the mint, 3.16.3 body', async () => {
  const { request, calls } = plane()
  const resolved = await new ProjectAccessTokenClient({ request }).resolve(input)
  assert.deepEqual(resolved, { token: fakeProjectToken('key-1', 1), organizationId: 'org-1', projectId: 'proj-1', apiKeyId: 'key-1' })
  assert.deepEqual(calls.map(call => `${call.method} ${call.url}`), [`GET ${INFO}`, `GET ${keysOf('org-1', 'proj-1')}`, `POST ${keysOf('org-1', 'proj-1')}/key-1/access_tokens`])
  assert.deepEqual(calls[0]?.headers, { Authorization: 'oauth-tok', 'Content-Type': 'application/json' })
  assert.deepEqual(calls[2]?.headers, { Authorization: 'Bearer oauth-tok', 'Content-Type': 'application/json' })
  assert.deepEqual(JSON.parse(calls[2]?.body ?? ''), { clientType: 'zcode', clientVersion: '3.16.3' })
})

test('project selection: type "2" projects drop, then the default organization and project markers win, else the first', async () => {
  const organizations = [
    { organizationId: 'org-team', organizationName: '默认机构', projects: [{ projectId: 'p-team', projectType: '2' }] },
    { organizationId: 'org-a', organizationName: 'other', projects: [{ projectId: 'p-a1', projectName: 'x' }, { projectId: 'p-a2', projectName: '默认项目' }] },
  ]
  const { request, calls } = plane({ organizations })
  const resolved = await new ProjectAccessTokenClient({ request }).resolve(input)
  assert.deepEqual([resolved.organizationId, resolved.projectId], ['org-a', 'p-a2'])
  assert.equal(calls[1]?.url, keysOf('org-a', 'p-a2'))
  await assert.rejects(new ProjectAccessTokenClient({ request: plane({ organizations: [{ organizationId: 'o', projects: [{ projectId: 'p', projectType: 2 }] }] }).request }).resolve(input), /^Error: project_token_project_unavailable$/)
})

test('without a zcode-api-key the key is created with usageScene 1', async () => {
  const { request, calls } = plane({ keys: [{ name: 'other', apiKey: 'k' }] })
  const resolved = await new ProjectAccessTokenClient({ request }).resolve(input)
  assert.equal(resolved.apiKeyId, 'key-new')
  const create = calls.find(call => call.method === 'POST' && call.url.endsWith('/api_keys'))!
  assert.deepEqual(JSON.parse(create.body!), { name: 'zcode-api-key', usageScene: 1 })
})

test('the envelope codes 200, 0, "200", "0" succeed; any other code is project_token_invalid_response', async () => {
  for (const code of [200, 0, '200', '0']) {
    const { request } = plane({ mint: n => ({ ...(minted(n) as Record<string, unknown>), code }) })
    assert.equal((await new ProjectAccessTokenClient({ request }).resolve(input)).token, fakeProjectToken('key-1', 1))
  }
  const { request } = plane({ mint: n => ({ ...(minted(n) as Record<string, unknown>), code: 500 }) })
  await assert.rejects(new ProjectAccessTokenClient({ request }).resolve(input), /^Error: project_token_invalid_response$/)
  const wrongType = plane({ mint: n => minted(n, Date.now(), { tokenType: 'MAC' }) })
  await assert.rejects(new ProjectAccessTokenClient({ request: wrongType.request }).resolve(input), /^Error: project_token_invalid_response$/)
})

test('a missing enable means enabled; enable false is project_token_disabled', async () => {
  const { request } = plane({ mint: n => minted(n) })
  assert.ok((await new ProjectAccessTokenClient({ request }).resolve(input)).token.length > 0)
  const disabled = plane({ mint: () => ({ code: 200, data: { enable: false } }) })
  await assert.rejects(new ProjectAccessTokenClient({ request: disabled.request }).resolve(input), /^Error: project_token_disabled$/)
})

test('the token lives min(expiresAt, start + expiresIn) and refreshes 120 s plus up to 60 s of jitter before', async () => {
  let clock = 1_800_000_000_000
  const expiresAt = Math.floor(clock / 1000) + 3000 // earlier than start + expiresIn (3600 s)
  for (const [random, refreshLeadMs] of [[0, 120_000], [1, 180_000]] as const) {
    clock = 1_800_000_000_000
    const { request, calls } = plane({ mint: n => ({ code: 200, data: { accessToken: fakeProjectToken('key-1', n), tokenType: 'Bearer', expiresIn: 3600, expiresAt } }) })
    const client = new ProjectAccessTokenClient({ request, now: () => clock, random: () => random })
    await client.resolve(input)
    clock = expiresAt * 1000 - refreshLeadMs - 1
    assert.equal((await client.resolve(input)).token, fakeProjectToken('key-1', 1))
    clock += 1
    assert.equal((await client.resolve(input)).token, fakeProjectToken('key-1', 2))
    assert.equal(calls.filter(call => call.url.endsWith('/access_tokens')).length, 2)
  }
})

test('a transient failure keeps the still-valid token and retries 5 s later', async () => {
  let clock = 1_800_000_000_000
  let busy = false
  let mintCalls = 0
  const fetchImpl: typeof fetch = url => {
    const target = url instanceof Request ? url.url : url instanceof URL ? url.href : url
    if (target.endsWith('/getCustomerInfo')) return Promise.resolve(Response.json({ code: 200, data: { organizations: [{ organizationId: 'org-1', projects: [{ projectId: 'proj-1' }] }] } }))
    if (target.endsWith('/api_keys')) return Promise.resolve(Response.json({ code: 200, data: [{ name: 'zcode-api-key', apiKey: 'key-1' }] }))
    mintCalls += 1
    return Promise.resolve(busy ? new Response('busy', { status: 503 }) : Response.json(minted(mintCalls, clock)))
  }
  const client = new ProjectAccessTokenClient({ request: projectTokenRequest(fetchImpl), now: () => clock, random: () => 0 })
  const first = await client.resolve(input)
  clock += 3600_000 - 120_000 // the refresh point, before expiry
  busy = true
  assert.equal((await client.resolve(input)).token, first.token)
  assert.equal(mintCalls, 2)
  clock += 4_999 // deferred: no new mint attempt within 5 s
  assert.equal((await client.resolve(input)).token, first.token)
  assert.equal(mintCalls, 2)
  clock += 1
  assert.equal((await client.resolve(input)).token, first.token)
  assert.equal(mintCalls, 3)
  clock += 200_000 // past expiry a transient failure has nothing to fall back on
  await assert.rejects(client.resolve(input), /^Error: project_token_request_failed$/)
})

test('a rejected fingerprint equal to the cached token forces a new mint; another fingerprint does not', async () => {
  const { request, calls } = plane()
  const client = new ProjectAccessTokenClient({ request })
  const first = await client.resolve(input)
  assert.equal((await client.resolve({ ...input, rejectedFingerprint: 'f'.repeat(64) })).token, first.token)
  const second = await client.resolve({ ...input, rejectedFingerprint: await projectTokenFingerprint(first.token) })
  assert.equal(second.token, fakeProjectToken('key-1', 2))
  assert.equal(calls.filter(call => call.url.endsWith('/access_tokens')).length, 2)
})

/** A location store over one map. */
function memoryLocations(): ProjectKeyLocationStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    load: key => Promise.resolve(values.get(key)),
    save: (key, value) => { values.set(key, value); return Promise.resolve() },
    delete: key => { values.delete(key); return Promise.resolve() },
  }
}

const LOCATION_KEY = `project-key-location:v1:${encodeURIComponent(JSON.stringify([ORIGIN, 'bigmodel', 'user-1', null, 1, 'non-team']))}`

test('the location persists under the 3.16.3 key; a stored location skips the locate requests', async () => {
  const locations = memoryLocations()
  await new ProjectAccessTokenClient({ request: plane().request, locationStore: locations }).resolve(input)
  assert.deepEqual([...locations.values.keys()], [LOCATION_KEY])
  assert.deepEqual(JSON.parse(locations.values.get(LOCATION_KEY)!), { organizationId: 'org-1', projectId: 'proj-1', apiKeyId: 'key-1' })
  const { request, calls } = plane()
  await new ProjectAccessTokenClient({ request, locationStore: locations }).resolve(input)
  assert.deepEqual(calls.map(call => call.url.split('/').at(-1)), ['access_tokens'])
})

test('a 404 mint drops the location; the next resolve locates again', async () => {
  const locations = memoryLocations()
  const { request, calls } = plane({ mint: n => n === 1 ? { code: 404 } : minted(n) })
  const client = new ProjectAccessTokenClient({ request, locationStore: locations })
  await assert.rejects(client.resolve(input), /^Error: project_token_invalid_response$/)
  assert.equal(locations.values.size, 0)
  assert.equal((await client.resolve(input)).token, fakeProjectToken('key-1', 2))
  assert.equal(calls.filter(call => call.url === INFO).length, 2)
})

test('errors map to the 3.16.3 codes: login required, invalid response, request failed', async () => {
  const client = new ProjectAccessTokenClient({ request: plane().request })
  await assert.rejects(client.resolve({ ...input, loginToken: '   ' }), /^Error: project_token_login_required$/)
  await assert.rejects(client.resolve({ ...input, accountId: ' ' }), /^Error: project_token_login_required$/)
  await assert.rejects(new ProjectAccessTokenClient({ request: plane({ keys: 'nope' }).request }).resolve(input), /^Error: project_token_invalid_response$/)
  const failing = new ProjectAccessTokenClient({ request: () => Promise.reject(new Error('socket hang up with oauth-tok')) })
  await assert.rejects(failing.resolve(input), /^Error: project_token_request_failed$/) // the cause's text never surfaces
})

test('the request wrapper: 404 is {code: 404}, 429 / 5xx / network are transient, other statuses fail', async () => {
  const answer = (status: number): typeof fetch => () => Promise.resolve(new Response('{}', { status }))
  assert.deepEqual(await projectTokenRequest(answer(404))(INFO, { method: 'GET', headers: {} }), { code: 404 })
  for (const status of [429, 500, 503]) await assert.rejects(projectTokenRequest(answer(status))(INFO, { method: 'GET', headers: {} }), { name: 'ProjectAccessTokenTransientError' })
  await assert.rejects(projectTokenRequest(() => Promise.reject(new TypeError('fetch failed')))(INFO, { method: 'GET', headers: {} }), { name: 'ProjectAccessTokenTransientError' })
  await assert.rejects(projectTokenRequest(answer(403))(INFO, { method: 'GET', headers: {} }), /^Error: http_403$/)
})
