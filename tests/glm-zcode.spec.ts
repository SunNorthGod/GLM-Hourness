import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ZcodeAdapter, ZcodeLogin, logout } from '../src/glm-llm/zcode.ts'
import { ZCODE_APP_VERSION } from '../src/glm-llm/identity.ts'
import { runtimeUserAgent, upstreamSessionId, type SessionHeaderLike } from '../src/glm-llm/headers.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { saveCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'
import type { GenerateOptionsLike, StreamChunk } from '../src/shared/lm-min.ts'
import { fakeProjectToken, memoryStore, patPlane, PAT_KEY_ID, sealedSigningKey, TRANSPORT_HEADERS, wireRecorder, zcodeDataDir } from './glm-fixtures.ts'

/** An adapter environment whose ZCode data directory is a fresh temp directory without a state file. */
const isolatedEnv = (): NodeJS.ProcessEnv => zcodeDataDir().env

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(`${frame}\n`))
      controller.close()
    },
  })
}

const UPSTREAM = 'https://open.bigmodel.cn/api/anthropic/v1/messages'

test('adapter model catalog satisfies the DSH contract at runtime', async () => {
  // The DSH GUI rejects a catalog entry without `provider` (invalid/duplicate
  // model), so the runtime shape is asserted here on top of the compile-time
  // AdapterContractCheck in src/glm-llm/zcode.ts.
  const { fs } = memoryStore()
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs })
  for (const model of await adapter.listModels('glm-zcode')) {
    assert.equal(model.provider, 'glm-zcode')
    assert.ok(model.id.length > 0)
    assert.ok(model.name.length > 0)
  }
  const resolved = await adapter.resolveModel('glm-zcode', 'glm-5.3')
  assert.equal(resolved.provider, 'glm-zcode')
  assert.equal(resolved.id, 'glm-5.3')
  assert.ok((resolved.context?.contextWindow ?? 0) > 0)
  assert.equal(resolved.reasoning?.efforts.length, 3)
  // Anthropic has no mid-conversation system role: the adapter must not
  // declare in-history updates (the encoder lifts the leading system prompt).
  assert.equal(resolved.systemPromptUpdate, undefined)
  // ZCode's model-image bounds; a small image keeps its size.
  const target = adapter.imageRequestTarget('glm-zcode', 'glm-5.3-flash', { attachmentId: 'a1', mediaType: 'image/png', bytes: 1024, width: 640, height: 480 } as never)
  assert.deepEqual(target, { width: 640, height: 480, maxBytes: 3_932_160 })
})

test('input modalities are truthful per model: GLM-5.3 text-only, GLM-5.3-Flash text and image', async () => {
  const { fs } = memoryStore()
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs })
  const listed = Object.fromEntries((await adapter.listModels('glm-zcode')).map(model => [model.id, model.inputModalities]))
  assert.deepEqual(listed, { 'glm-5.3': ['text'], 'glm-5.3-flash': ['text', 'image'] })
  assert.deepEqual((await adapter.resolveModel('glm-zcode', 'glm-5.3')).inputModalities, ['text'])
  assert.deepEqual((await adapter.resolveModel('glm-zcode', 'glm-5.3-flash')).inputModalities, ['text', 'image'])
  // An id outside the catalog is not claimed to accept images.
  assert.deepEqual((await adapter.resolveModel('glm-zcode', 'glm-next')).inputModalities, ['text'])
})

test('stream sends image blocks through the attachment service; without it an image request fails', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { body?: Record<string, unknown> } = {}
  const reads: string[] = []
  const attachments = {
    async readImageRequest(ref: { attachmentId: string, mediaType: string }) {
      reads.push(ref.attachmentId)
      return { data: new Uint8Array([137, 80, 78, 71]), mediaType: ref.mediaType }
    },
    imageHostPath: () => undefined,
  }
  const image = { attachmentId: 'sha256:cccc', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }
  const options = {
    provider: 'glm-zcode', model: 'glm-5.3-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'colour?' }, { type: 'image', attachment: image }] }],
  } as GenerateOptionsLike
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv(), resolveAttachments: () => attachments })
  for await (const _chunk of adapter.stream(options as never)) { void _chunk }
  assert.deepEqual(reads, ['sha256:cccc'])
  const messages = captured.body!.messages as Array<{ content: unknown[] }>
  assert.deepEqual(messages[0]!.content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw==' }, cache_control: { type: 'ephemeral' } })
  const bare = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs, env: isolatedEnv() })
  await assert.rejects(async () => { for await (const chunk of bare.stream(options as never)) void chunk }, /attachment service/)
})

const SSE_OK_FRAMES = [
    'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
    'data: {"type":"content_block_stop","index":0}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
]
const SSE_OK_BODY = SSE_OK_FRAMES.map(frame => `${frame}\n`).join('')

/** A non-streaming Anthropic answer, as the session title request gets it. */
const TITLE_MESSAGE = { type: 'message', role: 'assistant', content: [{ type: 'thinking', thinking: 'short', signature: 'c2ln' }, { type: 'text', text: 'Fix quotes' }], stop_reason: 'end_turn', usage: { input_tokens: 40, output_tokens: 6 } }

function sseOk(): Response {
  return new Response(sseBody(SSE_OK_FRAMES), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** The header names and values of one request as sent (a plain object or a Headers instance). */
function sentHeaders(init: RequestInit | undefined): Record<string, string> {
  return init?.headers instanceof Headers ? Object.fromEntries(init.headers) : { ...(init?.headers as Record<string, string> | undefined) }
}

/** The PAT plane answers bigmodel.cn; every other request streams SSE and the model request (`…/v1/messages`) is captured. */
function makeUpstream(captured: { url?: string, headers?: Record<string, string>, body?: Record<string, unknown> } = {}) {
  const pat = patPlane()
  return ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = urlOf(url)
    const planeAnswer = pat.answer(target, init)
    if (planeAnswer !== undefined) return Promise.resolve(planeAnswer)
    if (target.endsWith('/v1/messages')) {
      captured.url = target
      captured.headers = sentHeaders(init)
      captured.body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>
      // A request without `stream` (the session title, 3.16.3 generateText) gets one JSON message.
      if (captured.body.stream !== true) return Promise.resolve(Response.json(TITLE_MESSAGE))
    }
    return Promise.resolve(sseOk())
  }) as typeof fetch
}

/** The URL of a fetch input. */
function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** One header of a captured request, by case-insensitive name. */
const headerIn = (headers: Record<string, string> | undefined, name: string): string | undefined => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]

/** The first project token the PAT-plane double mints. */
const FIRST_PAT = fakeProjectToken(PAT_KEY_ID, 1)

function request(): GenerateOptionsLike {
  return {
    provider: 'glm-zcode', model: 'glm-5.3',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    system: 'be brief',
  }
}

// Obvious fakes only: no real token, key or secret appears in a spec.
const credential: Credential = { version: 2, provider: 'bigmodel', oauthAccessToken: 'oauth-tok', userId: 'user-1' }

test('coding-plan stream walks the full chain: store → headers → unsigned signing ladder → SSE', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { url?: string, headers?: Record<string, string>, body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream(request())) chunks.push(chunk)
  assert.equal(captured.url, UPSTREAM)
  // 3.16.3 account mode: the project access token in both auth headers.
  assert.equal(headerIn(captured.headers, 'authorization'), `Bearer ${FIRST_PAT}`)
  assert.equal(headerIn(captured.headers, 'x-api-key'), FIRST_PAT)
  // 3.16.3 AI SDK chain: the call's ZCode UA, then provider-utils and the runtime segment.
  assert.equal(headerIn(captured.headers, 'User-Agent'), `ZCode/${ZCODE_APP_VERSION} ai-sdk/provider-utils/4.0.27 ${runtimeUserAgent()}`)
  assert.ok(headerIn(captured.headers, 'x-session-id') !== undefined)
  // ZCode's attribution set: request, session type and trace ids on every request.
  assert.deepEqual(['x-request-id', 'x-zcode-session-type', 'x-zcode-trace-id', 'x-session-id'].map(name => headerIn(captured.headers, name) !== undefined), [true, true, true, true])
  assert.equal(headerIn(captured.headers, 'x-zcode-session-type'), 'main')
  assert.deepEqual((captured.body!.system as unknown[]), [{ type: 'text', text: 'be brief' }])
  // metadata.user_id names the deviceMid and the same session id as the header.
  const userId = JSON.parse((captured.body!.metadata as { user_id: string }).user_id) as Record<string, string>
  assert.deepEqual(Object.keys(userId), ['device_id', 'account_uuid', 'session_id'])
  assert.equal(userId.account_uuid, '')
  assert.equal(userId.session_id, headerIn(captured.headers, 'x-session-id'))
  const text = chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.type === 'block-end' && chunk.block.type === 'text' ? chunk.block.text : '').join('')
  assert.equal(text, 'ok')
  assert.ok(chunks.some(chunk => chunk.type === 'finish' && chunk.reason.kind === 'stop'))
})

const ULTRA = 'https://zcode.z.ai/api/v1/ultra/anthropic/v1/messages'
const PROVIDER_HANDSHAKE = 'https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client'

interface WireRequest { url: string, headers: Record<string, string>, body?: string }

/** Handshake path tail, routed or not. */
const HANDSHAKE_TAIL = '/c1f3a7e2/v2/client'
const isHandshake = (wire: WireRequest): boolean => wire.url.endsWith(HANDSHAKE_TAIL)
const isModelRequest = (wire: WireRequest): boolean => wire.url === ULTRA

/**
 * The upstream as the adapter meets it: agent/configs maps the provider
 * messages URL to the ultra gateway (or `mapping`), the handshake returns
 * `privateCipher` (404 without one), the bigmodel PAT plane mints project
 * tokens (`pat`), and model requests answer `model` (SSE by default).
 * Every request is recorded in order.
 */
function gatewayFetch(wire: WireRequest[], options: { privateCipher?: string, mapping?: ReadonlyArray<Record<string, string>>, pat?: ReturnType<typeof patPlane>, model?: (attempt: number) => Response }): typeof fetch {
  const mapping = options.mapping ?? [{ from: UPSTREAM, to: ULTRA }]
  const pat = options.pat ?? patPlane()
  let modelAttempts = 0
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    wire.push({ url, headers: sentHeaders(init), ...(typeof init?.body === 'string' ? { body: init.body } : {}) })
    if (url === 'https://zcode.z.ai/api/v1/agent/configs') return Promise.resolve(json(200, { code: 0, data: { proxyEndpoint: { mapping } } }))
    if (url.endsWith(HANDSHAKE_TAIL)) {
      return Promise.resolve(options.privateCipher === undefined ? new Response('not found', { status: 404 }) : json(200, { code: 200, data: { privateCipher: options.privateCipher } }))
    }
    const planeAnswer = pat.answer(url, init)
    if (planeAnswer !== undefined) return Promise.resolve(planeAnswer)
    if (url === ULTRA || url === UPSTREAM) {
      modelAttempts += 1
      if (options.model !== undefined) return Promise.resolve(options.model(modelAttempts))
    }
    return Promise.resolve(sseOk())
  }
}


/**
 * Run `requests` streams through one fresh adapter on the gateway double and
 * return the wire log. `stored` replaces the default credential.
 */
async function runOnGateway(gateway: Parameters<typeof gatewayFetch>[1], options: { stored?: Credential, plan?: 'start-plan', requests?: number, env?: NodeJS.ProcessEnv, report?: (sessionId: string | undefined, state: string, reason: string) => void } = {}): Promise<WireRequest[]> {
  const store = memoryStore()
  await saveCredential(store.fs, 'C:/ws/.llm/credentials.json', options.stored ?? credential)
  const wire: WireRequest[] = []
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: gatewayFetch(wire, gateway), storeFs: store.fs, env: options.env ?? isolatedEnv(), ...(options.plan === undefined ? {} : { plan: options.plan }), ...(options.report === undefined ? {} : { report: options.report }) })
  for (let i = 0; i < (options.requests ?? 1); i++) {
    for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1' } as never)) void chunk
  }
  return wire
}

const isConfigRequest = (wire: WireRequest): boolean => wire.url === 'https://zcode.z.ai/api/v1/agent/configs'
/** The device_id of a model request's metadata.user_id. */
const deviceIdOf = (wire: WireRequest): string | undefined => (JSON.parse((JSON.parse(wire.body ?? '{}') as { metadata: { user_id: string } }).metadata.user_id) as { device_id?: string }).device_id
/** The header of one recorded request, by case-insensitive name. */
const headerOf = (wire: WireRequest, name: string): string | undefined => Object.entries(wire.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]

test('metadata.user_id and the routing config request carry the deviceMid of ZCode\'s telemetry state (3.16.3 ensureCliDeviceMid, Kuc)', async () => {
  const zcode = zcodeDataDir({ deviceMid: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb' })
  const reports: string[] = []
  const wire = await runOnGateway({}, { env: zcode.env, report: (_s, _state, reason) => { reports.push(reason) } })
  const [model] = wire.filter(isModelRequest)
  assert.equal(deviceIdOf(model), 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb')
  assert.equal(headerOf(wire.find(isConfigRequest)!, 'X-Device-Mid'), 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb')
  assert.deepEqual(reports, ['上游已应答（套餐 coding-plan）'])
})

test('without a ZCode deviceMid one is generated and written to the state file, and both planes carry it (3.16.3 ensureCliDeviceMid, Kuc)', async () => {
  const zcode = zcodeDataDir({ lastDailyActiveDate: '2026-10-28' })
  const reports: string[] = []
  const wire = await runOnGateway({}, { env: zcode.env, report: (_s, _state, reason) => { reports.push(reason) } })
  const state = JSON.parse(readFileSync(zcode.stateFile, 'utf-8')) as { deviceMid?: string, lastDailyActiveDate?: string }
  assert.match(state.deviceMid ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  assert.equal(state.lastDailyActiveDate, '2026-10-28')
  assert.equal(deviceIdOf(wire.find(isModelRequest)!), state.deviceMid)
  assert.equal(headerOf(wire.find(isConfigRequest)!, 'X-Device-Mid'), state.deviceMid)
  assert.deepEqual(reports, ['上游已应答（套餐 coding-plan）'])
})

test('when the state file cannot be written the generated id is still sent and kept, the config request has no X-Device-Mid, and the row health says the id is temporary', async () => {
  // .zcode/v2 is a file: 3.16.3 ensureCliDeviceMid falls back to the id it generated; Kuc reads nothing.
  const zcode = zcodeDataDir()
  mkdirSync(join(zcode.dir, '.zcode'), { recursive: true })
  writeFileSync(join(zcode.dir, '.zcode', 'v2'), 'not a directory')
  const reports: string[] = []
  const wire = await runOnGateway({}, { env: zcode.env, report: (_s, _state, reason) => { reports.push(reason) }, requests: 2 })
  const [first, second] = wire.filter(isModelRequest)
  assert.match(deviceIdOf(first) ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  assert.equal(deviceIdOf(second), deviceIdOf(first))
  assert.equal(headerOf(wire.find(isConfigRequest)!, 'X-Device-Mid'), undefined)
  const answered = '上游已应答（套餐 coding-plan）；设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID'
  assert.deepEqual(reports, [answered, answered])
  assert.equal(readFileSync(join(zcode.dir, '.zcode', 'v2'), 'utf-8'), 'not a directory')
})

const isPatPlane = (wire: WireRequest): boolean => wire.url.startsWith('https://bigmodel.cn/')

/** The model request's header names as they arrive on a loopback server: the adapter's own fetch chain, undici included. */
async function wireNames(gateway: Parameters<typeof gatewayFetch>[1], options: { stored?: Credential, purpose?: 'session-title' } = {}): Promise<string[]> {
  const server = await wireRecorder(() => ({ status: 200, contentType: 'text/event-stream', body: SSE_OK_BODY }))
  try {
    const store = memoryStore()
    await saveCredential(store.fs, 'C:/ws/.llm/credentials.json', options.stored ?? credential)
    const doubles = gatewayFetch([], gateway)
    const fetchImpl: typeof fetch = (input, init) => urlOf(input) === ULTRA ? fetch(`${server.url}/v1/messages`, init) : doubles(input, init)
    const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl, storeFs: store.fs, env: isolatedEnv() })
    for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1', ...(options.purpose === undefined ? {} : { purpose: options.purpose }) } as never)) void chunk
    return (server.requests[0]?.names ?? []).filter(name => !TRANSPORT_HEADERS.has(name))
  }
  finally {
    await server.close()
  }
}

/** The AI SDK part of the 3.16.3 chain: lower-case names in Headers order (`withUserAgentSuffix` returns `Object.fromEntries(headers.entries())`). */
const SDK_HEADERS = ['anthropic-version', 'authorization', 'content-type', 'http-referer', 'user-agent', 'x-api-key', 'x-client-language', 'x-client-timezone', 'x-os-category', 'x-os-version', 'x-platform', 'x-query-id', 'x-release-channel', 'x-request-id']
const SDK_HEADERS_AFTER_SESSION = ['x-title', 'x-zcode-agent', 'x-zcode-app-version', 'x-zcode-query-source', 'x-zcode-session-type', 'x-zcode-trace-id']
const SIGNATURE_BLOCK = ['X-Client-Ts', 'X-Client-Version', 'X-Client-Sig', 'X-Client-Nonce', 'X-App-Id', 'X-Client-Pow']
const FLAGGED_MAPPING = [{ from: UPSTREAM, to: ULTRA, zcodeAuthorizationHeader: 'X-ZCode-Authorization' }]

test('the model request leaves with 3.16.3\'s header order: SDK headers sorted, the signature block, X-ZCode-Authorization last', async () => {
  // 3.16.3: Y2 output → new Headers + zrt + seven set() (x-session-id renamed in place) → routing new Headers + set().
  const signed = await wireNames({ privateCipher: await sealedSigningKey(FIRST_PAT, PAT_KEY_ID), mapping: FLAGGED_MAPPING }, { stored: { ...credential, jwt: 'zcode-jwt' } })
  assert.deepEqual(signed, [...SDK_HEADERS, 'X-Session-Id', ...SDK_HEADERS_AFTER_SESSION, ...SIGNATURE_BLOCK, 'X-ZCode-Authorization', 'accept'])
  // A failed handshake sends zrt(headers) unsigned: the session id keeps its lower-case name and place.
  const unsigned = await wireNames({ mapping: FLAGGED_MAPPING }, { stored: { ...credential, jwt: 'zcode-jwt' } })
  assert.deepEqual(unsigned, [...SDK_HEADERS, 'x-session-id', ...SDK_HEADERS_AFTER_SESSION, 'X-ZCode-Authorization', 'accept'])
})

test('User-Agent: a step sends the provider-utils chain, the session title (generateText) adds ai/6.0.193', async () => {
  const uaOf = async (purpose?: 'session-title'): Promise<string | undefined> => {
    const captured: { headers?: Record<string, string> } = {}
    const { fs } = memoryStore()
    await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
    const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
    for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1', ...(purpose === undefined ? {} : { purpose }) } as never)) void chunk
    return headerIn(captured.headers, 'user-agent')
  }
  const runtime = runtimeUserAgent()
  assert.match(runtime, /^runtime\/node\.js\/\d+/)
  assert.equal(await uaOf(), `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 ${runtime}`)
  assert.equal(await uaOf('session-title'), `ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 ${runtime}`)
})



test('the project access token is minted from the OAuth login the way 3.16.3 mints it', async () => {
  const wire = await runOnGateway({})
  assert.deepEqual(wire.filter(isPatPlane).map(entry => new URL(entry.url).pathname), [
    '/api/biz/customer/getCustomerInfo',
    '/api/biz/v1/organization/org-1/projects/proj-1/api_keys',
    `/api/biz/v1/organization/org-1/projects/proj-1/api_keys/${PAT_KEY_ID}/access_tokens`,
  ])
  const [info, , mint] = wire.filter(isPatPlane)
  assert.equal(headerOf(info, 'Authorization'), 'oauth-tok') // getCustomerInfo: the raw OAuth token
  assert.equal(headerOf(mint, 'Authorization'), 'Bearer oauth-tok')
  assert.deepEqual(JSON.parse(mint.body ?? ''), { clientType: 'zcode', clientVersion: ZCODE_APP_VERSION })
  // Every request after the mint carries the token, never the stored API key or its secret.
  const after = wire.slice(wire.indexOf(mint) + 1)
  assert.ok(after.every(entry => Object.values(entry.headers).every(value => !value.includes('id.secret') && !value.includes('secret'))))
})

test('a signed coding-plan request: both auth headers carry the project access token, the handshake signs with it', async () => {
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey(FIRST_PAT, PAT_KEY_ID) })
  const [handshake] = wire.filter(isHandshake)
  assert.equal(headerOf(handshake, 'Authorization'), FIRST_PAT)
  assert.equal((JSON.parse(handshake.body ?? '') as { accessToken: string }).accessToken, FIRST_PAT)
  const [model] = wire.filter(isModelRequest)
  assert.equal(headerOf(model, 'authorization'), `Bearer ${FIRST_PAT}`)
  assert.equal(headerOf(model, 'x-api-key'), FIRST_PAT)
  assert.ok(headerOf(model, 'X-Client-Sig') !== undefined)
})

test('the routing config request names the project token\'s API key in x-api-key-id and sends no API key (3.16.3 FGs)', async () => {
  const wire = await runOnGateway({})
  const config = wire.find(isConfigRequest)!
  assert.equal(headerOf(config, 'x-api-key-id'), PAT_KEY_ID)
  assert.equal(headerOf(config, 'x-api-key'), undefined)
  assert.ok(Object.values(config.headers).every(value => !value.includes('secret') && !value.includes(FIRST_PAT)))
})

test('a 401 that is not a request-security failure refreshes the project token once and retries as a new attempt', async () => {
  const pat = patPlane()
  const rejected = (): Response => new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'token expired' } }), { status: 401 })
  const first = rejected()
  const wire = await runOnGateway({ pat, model: attempt => attempt === 1 ? first : sseOk() })
  // The rejected answer's body is cancelled before the retry (only its clone was read for the check).
  assert.equal(first.bodyUsed, true)
  const models = wire.filter(isModelRequest)
  assert.equal(models.length, 2)
  assert.equal(pat.mints(), 2)
  assert.equal(headerOf(models[0], 'authorization'), `Bearer ${FIRST_PAT}`)
  assert.equal(headerOf(models[1], 'authorization'), `Bearer ${fakeProjectToken(PAT_KEY_ID, 2)}`)
  assert.equal(headerOf(models[1], 'x-api-key'), fakeProjectToken(PAT_KEY_ID, 2))
  assert.notEqual(headerOf(models[0], 'x-request-id'), headerOf(models[1], 'x-request-id'))
  // Only once: a second rejection fails the stream.
  await assert.rejects(runOnGateway({ model: rejected }), /glm-zcode 401/)
  // A request-security 401 (VERIFY_*) is not a token rejection: no refresh.
  const verify = patPlane()
  await assert.rejects(runOnGateway({ pat: verify, model: () => new Response(JSON.stringify({ error: { reason: 'VERIFY_SIGNATURE_INVALID' } }), { status: 401 }) }), /glm-zcode 401/)
  assert.equal(verify.mints(), 1)
})

test('a login stored before m1-parity keeps working: migrated on first read, the secret leaves the store, the location persists', async () => {
  const store = memoryStore()
  await saveCredential(store.fs, 'C:/ws/.llm/credentials.json', { apiKey: 'fakeid.fakesecretvalue', provider: 'bigmodel', oauthAccessToken: 'oauth-tok', userId: 'user-1' })
  const wire: WireRequest[] = []
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: gatewayFetch(wire, {}), storeFs: store.fs, env: isolatedEnv() })
  for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1' } as never)) void chunk
  assert.equal(headerOf(wire.filter(isModelRequest)[0]!, 'authorization'), `Bearer ${FIRST_PAT}`)
  assert.ok(wire.every(entry => Object.values(entry.headers).every(value => !value.includes('fakesecretvalue'))))
  const { loadCredential } = await import('../src/glm-llm/auth/store.ts')
  const stored = await loadCredential(store.fs, 'C:/ws/.llm/credentials.json') as Record<string, unknown>
  assert.ok(!JSON.stringify(stored).includes('fakesecretvalue') && !('apiKey' in stored))
  assert.deepEqual(JSON.parse((stored.location as { value: string }).value), { organizationId: 'org-1', projectId: 'proj-1', apiKeyId: PAT_KEY_ID })
  // The next process reads the stored location: no customer info or key list, only the mint.
  const next: WireRequest[] = []
  const restarted = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: gatewayFetch(next, {}), storeFs: store.fs, env: isolatedEnv() })
  for await (const chunk of restarted.stream({ ...request(), sessionId: 'session-s1' } as never)) void chunk
  assert.deepEqual(next.filter(isPatPlane).map(entry => entry.url.split('/').at(-1)), ['access_tokens'])
})

const STORE_PATH = 'C:/ws/.llm/credentials.json'

test('a /glm-login that lands while the project key is located keeps its record: the older login\'s location is not attached to it', async () => {
  const store = memoryStore()
  await saveCredential(store.fs, STORE_PATH, credential)
  const relogin: Credential = { version: 2, provider: 'bigmodel', oauthAccessToken: 'oauth-new', userId: 'user-2' }
  const wire: WireRequest[] = []
  const gateway = gatewayFetch(wire, {})
  const fetchImpl: typeof fetch = async (input, init) => {
    const answer = await gateway(input, init)
    if (urlOf(input).endsWith('/api/biz/customer/getCustomerInfo')) await saveCredential(store.fs, STORE_PATH, relogin)
    return answer
  }
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl, storeFs: store.fs, env: isolatedEnv() })
  await assert.rejects(async () => { for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1' } as never)) void chunk }, /project_token_scope_invalidated/)
  const { loadCredential } = await import('../src/glm-llm/auth/store.ts')
  assert.deepEqual(await loadCredential(store.fs, STORE_PATH), relogin)
  assert.equal(wire.filter(isModelRequest).length, 0)
})

test('a /glm-login that lands while the location is written is not overwritten by the older login', async () => {
  const store = memoryStore()
  await saveCredential(store.fs, STORE_PATH, credential)
  const relogin: Credential = { version: 2, provider: 'bigmodel', oauthAccessToken: 'oauth-new', userId: 'user-1' }
  // The login lands on the first store read after the key list answered: the read of the location write.
  let located = false
  let landed: Promise<void> | undefined
  const fs: StoreFs = {
    ...store.fs,
    readFile: path => {
      if (located && landed === undefined && path === STORE_PATH) landed = saveCredential(store.fs, STORE_PATH, relogin)
      return store.fs.readFile(path)
    },
  }
  const gateway = gatewayFetch([], {})
  const fetchImpl: typeof fetch = async (input, init) => {
    const answer = await gateway(input, init)
    if (urlOf(input).endsWith('/api_keys') && init?.method === 'GET') located = true
    return answer
  }
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl, storeFs: fs, env: isolatedEnv() })
  await (async () => { for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1' } as never)) void chunk })().catch(() => undefined)
  assert.ok(landed !== undefined)
  await landed
  const { loadCredential } = await import('../src/glm-llm/auth/store.ts')
  assert.equal((await loadCredential(store.fs, STORE_PATH) as Credential).oauthAccessToken, 'oauth-new')
})

/** Stream one request on a fresh adapter; the rejection, the wire log and the health reports. */
async function failingRun(stored: Credential, pat = patPlane()): Promise<{ error: Error, wire: WireRequest[], reports: Array<[string, string]> }> {
  const store = memoryStore()
  await saveCredential(store.fs, 'C:/ws/.llm/credentials.json', stored)
  const wire: WireRequest[] = []
  const reports: Array<[string, string]> = []
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: gatewayFetch(wire, { pat }), storeFs: store.fs, env: isolatedEnv(), report: (_s, state, reason) => { reports.push([state, reason]) } })
  try {
    for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1' } as never)) void chunk
  }
  catch (error) {
    return { error: error as Error, wire, reports }
  }
  throw new Error('the stream did not fail')
}

test('without a project access token the request fails closed as in 3.16.3: nothing is sent, the row health says why', async () => {
  const minting = await failingRun(credential, patPlane({ mintStatus: 500 }))
  assert.equal(minting.error.message, 'glm-zcode: project access token unavailable (project_token_request_failed) — run /glm-login to sign in again')
  assert.deepEqual(minting.wire.filter(entry => !isPatPlane(entry)), []) // no routing config, no handshake, no model request
  assert.deepEqual(minting.reports, [['inactive', '未拿到项目令牌（project_token_request_failed），按 3.16.3 不发送；运行 /glm-login']])
  const { oauthAccessToken: _oauth, ...withoutOAuth } = credential
  const noOAuth = await failingRun(withoutOAuth)
  assert.equal(noOAuth.error.message, 'glm-zcode: project access token unavailable (Account request credential is unavailable: bigmodel) — run /glm-login to sign in again')
  assert.deepEqual(noOAuth.wire, [])
  const { userId: _user, ...withoutAccount } = credential
  const noAccount = await failingRun(withoutAccount)
  assert.equal(noAccount.error.message, 'glm-zcode: project access token unavailable (Account request credential is unavailable: account:bigmodel-individual-coding-plan) — run /glm-login to sign in again')
  assert.deepEqual(noAccount.wire, [])
})

test('coding-plan handshakes on the provider origin, sends to the routed URL, and reuses the key', async () => {
  // The signer sees the provider URL before routing (3.16.3); handing it the
  // routed zcode.z.ai URL sent the handshake to zcode.z.ai, which answers 404.
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey(FIRST_PAT, PAT_KEY_ID) }, { requests: 2 })
  assert.deepEqual(wire.filter(isHandshake).map(entry => entry.url), [PROVIDER_HANDSHAKE])
  const model = wire.filter(isModelRequest)
  assert.equal(model.length, 2)
  assert.ok(model.every(entry => headerOf(entry, 'X-Client-Sig') !== undefined))
})

test('a failing handshake is tried once across consecutive requests, which go out unsigned', async () => {
  const wire = await runOnGateway({}, { requests: 2 })
  assert.equal(wire.filter(isHandshake).length, 1)
  const model = wire.filter(isModelRequest)
  assert.equal(model.length, 2)
  assert.ok(model.every(entry => headerOf(entry, 'X-Client-Sig') === undefined))
})

test('start-plan is not signed: no handshake', async () => {
  // 3.16.3 `requiresClientRequestSigning` is false for the start-plan access mode.
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey(FIRST_PAT, PAT_KEY_ID) }, { stored: { ...credential, jwt: 'a.b.c' }, plan: 'start-plan' })
  assert.equal(wire.filter(isHandshake).length, 0)
  assert.equal(wire.filter(isModelRequest).length, 1)
})

test('routing headers follow the signature block, and a mapped handshake URL is routed like the model request', async () => {
  const routedHandshake = 'https://zcode.z.ai/api/v1/ultra/paas/c1f3a7e2/v2/client'
  const mapping = [
    { from: UPSTREAM, to: ULTRA, zcodeAuthorizationHeader: 'X-ZCode-Authorization' },
    { from: PROVIDER_HANDSHAKE, to: routedHandshake, zcodeAuthorizationHeader: 'X-ZCode-Authorization' },
  ]
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey(FIRST_PAT, PAT_KEY_ID), mapping }, { stored: { ...credential, jwt: 'zcode-jwt' } })
  const [handshake] = wire.filter(isHandshake)
  assert.equal(handshake.url, routedHandshake)
  assert.equal(headerOf(handshake, 'X-ZCode-Authorization'), 'Bearer zcode-jwt')
  const [model] = wire.filter(isModelRequest)
  assert.equal(headerOf(model, 'X-ZCode-Authorization'), 'Bearer zcode-jwt')
  assert.ok(headerOf(model, 'X-Client-Sig') !== undefined) // the order on the wire: 'the model request leaves with 3.16.3's header order'
})

test('x-session-id is one value per DSH session (the gateway cache affinity key); without a session each request gets a fresh one', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { headers?: Record<string, string> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
  const sessionOf = async (sessionId: string | undefined): Promise<string> => {
    for await (const chunk of adapter.stream({ ...request(), ...(sessionId === undefined ? {} : { sessionId }) })) void chunk
    return captured.headers?.['x-session-id'] ?? ''
  }
  const uuid = '2770bbd7-1a5c-4734-b10f-c6c6284d63e8'
  assert.equal(await sessionOf(`session-${uuid}`), uuid)
  assert.equal(await sessionOf(`session-${uuid}`), uuid) // the next step of the same session
  assert.equal(await sessionOf('session-0f0f0f0f-1111-4222-8333-444444444444'), '0f0f0f0f-1111-4222-8333-444444444444')
  const fresh = [await sessionOf(undefined), await sessionOf(undefined)]
  assert.ok(fresh.every(id => /^[0-9a-f-]{36}$/.test(id)) && fresh[0] !== fresh[1])
})

/** A durable user-typed message, as the DSH session controller records user input. */
const typed = (id: string, text: string) => ({ id, role: 'user' as const, content: [{ type: 'text' as const, text }], source: { kind: 'user' } })

/** One adapter that records the attribution headers of every model request it sends. */
async function attributionRecorder(sessionHeader?: (sessionId: string) => SessionHeaderLike | undefined): Promise<{ send: (options: Partial<GenerateOptionsLike> & { sessionId: string, purpose?: 'compaction' | 'session-title' }) => Promise<Record<string, string | undefined>> }> {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { headers?: Record<string, string>, body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv(), ...(sessionHeader === undefined ? {} : { sessionHeader }) })
  return {
    send: async options => {
      for await (const chunk of adapter.stream({ ...request(), ...options } as never)) void chunk
      const userId = JSON.parse((captured.body?.metadata as { user_id: string }).user_id) as { session_id: string }
      const pick = (name: string): string | undefined => headerIn(captured.headers, name)
      return { session: pick('x-session-id'), type: pick('x-zcode-session-type'), source: pick('x-zcode-query-source'), query: pick('x-query-id'), trace: pick('x-zcode-trace-id'), request: pick('x-request-id'), metadataSession: userId.session_id }
    },
  }
}

test('one trace id per session and one query id per user turn on the wire; x-request-id per request', async () => {
  const { send } = await attributionRecorder()
  const turn1 = [typed('m1', 'fix the quotes')]
  const step1 = await send({ sessionId: 'session-conv-1', messages: turn1 })
  const step2 = await send({ sessionId: 'session-conv-1', messages: [...turn1, { role: 'assistant', content: [{ type: 'text', text: 'Reading.' }] }] })
  const turn2 = await send({ sessionId: 'session-conv-1', messages: [...turn1, typed('m2', 'now the tests')] })
  const elsewhere = await send({ sessionId: 'session-conv-2', messages: [typed('m3', 'hi')] })
  assert.deepEqual([step1.session, step1.type, step1.source, step1.metadataSession], ['conv-1', 'main', 'main_turn', 'conv-1'])
  assert.equal(step2.trace, step1.trace)
  assert.equal(step2.query, step1.query)
  assert.notEqual(step2.request, step1.request)
  assert.equal(turn2.trace, step1.trace)
  assert.notEqual(turn2.query, step1.query)
  assert.notEqual(elsewhere.trace, step1.trace)
})

test('auxiliary calls keep the conversation session: the title is session_title, compaction is compact, both typed other', async () => {
  const { send } = await attributionRecorder()
  const title = await send({ sessionId: 'session-conv-1', purpose: 'session-title', messages: [{ role: 'user', content: [{ type: 'text', text: 'Name this conversation' }] }] })
  const main = await send({ sessionId: 'session-conv-1', messages: [typed('m1', 'fix it')] })
  const compact = await send({ sessionId: 'session-conv-1', purpose: 'compaction', messages: [typed('m1', 'fix it'), { role: 'user', content: [{ type: 'text', text: 'summarize' }] }] })
  assert.deepEqual([title.session, title.type, title.source, title.metadataSession], ['conv-1', 'other', 'session_title', 'conv-1'])
  assert.deepEqual([compact.session, compact.type, compact.source], ['conv-1', 'other', 'compact'])
  assert.equal(title.query, main.query)
  assert.equal(compact.query, main.query)
  assert.equal(title.trace, main.trace)
})

test('a DSH pressure compaction (system head, earlier span, instruction) and the rest of the turn share the turn\'s x-query-id', async () => {
  const { send } = await attributionRecorder()
  await send({ sessionId: 'session-conv-1', messages: [typed('p', 'earlier turn')] })
  const history = [typed('p', 'earlier turn'), { role: 'assistant', content: [{ type: 'text', text: 'done' }] }, typed('c', 'current turn')]
  const step = await send({ sessionId: 'session-conv-1', messages: history as never })
  const compact = await send({ sessionId: 'session-conv-1', purpose: 'compaction', messages: [{ role: 'system', content: [{ type: 'text', text: 'system head' }] }, typed('p', 'earlier turn'), { role: 'user', content: [{ type: 'text', text: 'summarize the conversation' }] }] as never })
  const next = await send({ sessionId: 'session-conv-1', messages: [{ role: 'user', content: [{ type: 'text', text: 'checkpoint' }] }, typed('c', 'current turn')] as never })
  assert.equal(compact.source, 'compact')
  assert.deepEqual([compact.query, next.query], [step.query, step.query])
})

test('a delegated child session (agents: origin subagent) is typed subagent with the subagent source and its parent\'s trace', async () => {
  const headers: Record<string, SessionHeaderLike> = { 'session-child': { parentSession: 'session-parent', origin: 'subagent' } }
  const { send } = await attributionRecorder(sessionId => headers[sessionId])
  const parent = await send({ sessionId: 'session-parent', messages: [typed('p1', 'delegate this')] })
  const child = await send({ sessionId: 'session-child', messages: [typed('c1', 'the task')] })
  assert.deepEqual([child.type, child.source, child.session], ['subagent', 'subagent', 'child'])
  assert.equal(child.trace, parent.trace)
  assert.notEqual(child.query, parent.query)
})

/** The body of one coding-plan request on a fresh adapter. */
async function bodyOf(options: Partial<GenerateOptionsLike> & { purpose?: 'session-title' | 'compaction' }, plan?: 'start-plan'): Promise<Record<string, unknown>> {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', { ...credential, jwt: 'fake.plan.jwt' })
  const captured: { body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv(), ...(plan === undefined ? {} : { plan }) })
  for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1', ...options } as never)) void chunk
  return captured.body ?? {}
}

test('coding-plan body: the official model casing, the 3.16.3 key order, thinking enabled and the DSH effort in output_config', async () => {
  const tools = [{ name: 'Read', description: 'Read a file', parameters: { type: 'object' } }]
  const step = await bodyOf({ tools, reasoningEffort: 'max' })
  assert.deepEqual(Object.keys(step), ['model', 'max_tokens', 'metadata', 'system', 'messages', 'tools', 'tool_choice', 'stream', 'thinking', 'output_config'])
  assert.equal(step.model, 'GLM-5.3')
  assert.deepEqual(step.thinking, { type: 'enabled' })
  assert.deepEqual(step.output_config, { effort: 'max' })
  assert.deepEqual(step.tool_choice, { type: 'auto' })
  assert.equal((await bodyOf({ model: 'glm-5.3-flash' })).model, 'GLM-5.3-Flash')
  assert.deepEqual((await bodyOf({ reasoningEffort: 'low' })).output_config, { effort: 'low' })
  assert.deepEqual((await bodyOf({})).output_config, { effort: 'high' }) // DSH default
  assert.deepEqual((await bodyOf({ reasoningEffort: 'medium' })).output_config, { effort: 'high' }) // outside the catalog levels
  // The session title uses the catalog's first level (3.16.3 auxiliaryModelOptions).
  assert.deepEqual((await bodyOf({ purpose: 'session-title', reasoningEffort: 'max' })).output_config, { effort: 'low' })
  // A model outside the catalog keeps the DSH values and gets no option map.
  const other = await bodyOf({ model: 'glm-next' })
  assert.equal(other.model, 'glm-next')
  assert.equal('thinking' in other, false)
})

/** A coding-plan adapter on the capturing upstream double, with the default login stored. */
async function capturingAdapter(): Promise<{ adapter: ZcodeAdapter, captured: { body?: Record<string, unknown> } }> {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { body?: Record<string, unknown> } = {}
  return { adapter: new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() }), captured }
}

test('compaction carries the effort of the session\'s latest main step (3.16.3 compacts with the session selection), not DSH\'s route default', async () => {
  const { adapter, captured } = await capturingAdapter()
  const send = async (options: { sessionId: string, purpose?: 'compaction', reasoningEffort?: string }): Promise<unknown> => {
    for await (const chunk of adapter.stream({ ...request(), ...options } as never)) void chunk
    return captured.body?.output_config
  }
  // Before the session's first step the compaction keeps its own effort (or the DSH default).
  assert.deepEqual(await send({ sessionId: 'session-fresh', purpose: 'compaction' }), { effort: 'high' })
  await send({ sessionId: 'session-max', reasoningEffort: 'max' })
  await send({ sessionId: 'session-low', reasoningEffort: 'low' })
  assert.deepEqual(await send({ sessionId: 'session-max', purpose: 'compaction', reasoningEffort: 'high' }), { effort: 'max' })
  assert.deepEqual(await send({ sessionId: 'session-low', purpose: 'compaction' }), { effort: 'low' })
  // A later step at another level moves the session's level.
  await send({ sessionId: 'session-max', reasoningEffort: 'low' })
  assert.deepEqual(await send({ sessionId: 'session-max', purpose: 'compaction', reasoningEffort: 'high' }), { effort: 'low' })
})

test('the session title goes out as 3.16.3 generateText sends it: no stream key, one JSON answer decoded into the usual chunks', async () => {
  const { adapter, captured } = await capturingAdapter()
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-s1', purpose: 'session-title' } as never)) chunks.push(chunk)
  assert.deepEqual(Object.keys(captured.body ?? {}), ['model', 'max_tokens', 'metadata', 'system', 'messages', 'thinking', 'output_config'])
  assert.deepEqual(chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.type === 'block-end' ? chunk.block : undefined), [{ type: 'reasoning', text: 'short' }, { type: 'text', text: 'Fix quotes' }])
  assert.deepEqual(chunks.find(chunk => chunk.type === 'usage'), { type: 'usage', usage: { inputTokens: 40, outputTokens: 6, totalTokens: 46 } })
  const finish = chunks.at(-1)
  assert.deepEqual(finish?.type === 'finish' ? finish.replayState?.blocks : undefined, [{ type: 'reasoning', signature: 'c2ln' }, { type: 'text' }])
})

test('start-plan keeps its earlier body: the DSH model id, no thinking, no output_config, the DSH max_tokens', async () => {
  const body = await bodyOf({ reasoningEffort: 'max', maxTokens: 4096 }, 'start-plan')
  assert.equal(body.model, 'glm-5.3')
  assert.equal('thinking' in body || 'output_config' in body, false)
  assert.equal(body.max_tokens, 4096)
})

test('coding-plan max_tokens follows 3.16.3, not the DSH value: steps 128000 or the window room, compaction 20000, the title 5000', async () => {
  assert.equal((await bodyOf({ maxTokens: 32_000 })).max_tokens, 128_000)
  assert.equal((await bodyOf({ maxTokens: 32_000, purpose: 'compaction' })).max_tokens, 20_000)
  assert.equal((await bodyOf({ maxTokens: 32_000, purpose: 'session-title' })).max_tokens, 5_000)
  // A history whose recorded usage nears the 1,000,000 window: 1,000,000 − estimate − 1000.
  const heavy = { role: 'assistant', content: [{ type: 'text', text: 'ok' }], source: { kind: 'model', provider: 'glm-zcode', model: 'glm-5.3', replayState: { response: { kind: 'glm-zcode', version: 1, model: 'glm-5.3', usage: { input: 985_000, output: 5_000, total: 990_000, cache: { read: 0, write: 0 } } }, blocks: [{ type: 'text' }] } } }
  const next = typed('m2', 'abc') // one estimated token after the baseline
  assert.equal((await bodyOf({ messages: [typed('m1', 'go'), heavy, next] as never })).max_tokens, 1_000_000 - 990_001 - 1_000)
})

test('upstreamSessionId strips the DSH prefix, keeps other header-safe ids, and replaces unusable ones', () => {
  assert.equal(upstreamSessionId('session-abc'), 'abc')
  assert.equal(upstreamSessionId('custom_id:1'), 'custom_id:1')
  assert.equal(upstreamSessionId('session-'), 'session-')
  assert.match(upstreamSessionId('has space'), /^[0-9a-f-]{36}$/)
  assert.match(upstreamSessionId(undefined), /^[0-9a-f-]{36}$/)
})

test('the DSH system prompt arrives as leading system messages and lands in the system field', async () => {
  // DSH runtimes deliver the assembled prompt in history, not GenerateOptions.system
  // (L3 probe 2026-10-27); dropping those messages would send GLM no system prompt.
  const { adapter, captured } = await capturingAdapter()
  const { system: _requestLevel, ...base } = request()
  const options = {
    ...base,
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'You are ZCode, an interactive coding agent' }] },
      ...base.messages,
      { role: 'developer', content: [{ type: 'text', text: 'harness notice' }] },
    ],
  } as unknown as typeof base
  for await (const _chunk of adapter.stream(options)) { void _chunk }
  assert.deepEqual(captured.body!.system, [{ type: 'text', text: 'You are ZCode, an interactive coding agent' }])
  const messages = captured.body!.messages as Array<{ role: string, content: Array<{ type: string, text?: string }> }>
  assert.equal(messages[0]!.role, 'user') // the leading system message left the history
  // The later developer notice rides the same user turn as a system reminder.
  assert.equal(messages.length, 1)
  assert.equal(messages[0]!.content.at(-1)!.text, '<system-reminder>\nharness notice\n</system-reminder>')
})

test('start-plan wraps the system in the 3-block assembly and pins the currentDate prefix once', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', { ...credential, jwt: 'a.b.c' })
  const captured: { body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', plan: 'start-plan', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
  const options = request()
  for await (const _chunk of adapter.stream(options)) { void _chunk }
  const system = captured.body!.system as Array<{ type: string, text: string, cache_control?: unknown }>
  assert.equal(system.length, 3)
  assert.equal(system[0]!.text, 'You are ZCode, an interactive coding agent')
  assert.ok(system[1]!.text.includes('be brief'))
  assert.ok(system[2]!.text.includes('# Environment'))
  const messages = captured.body!.messages as Array<{ role: string, content: Array<{ type: string, text?: string }> }>
  assert.equal(messages[0]!.role, 'user')
  assert.ok(messages[0]!.content[0]!.text!.includes('# currentDate'))
  // A conversation already carrying the prefix is not pinned twice.
  const again: Array<{ role: 'user', content: Array<{ type: string, text?: string }> }> = [
    { role: 'user', content: [{ type: 'text', text: '<system-reminder>\n# currentDate\nToday\u0027s date is 2026-10-27.\n</system-reminder>' }] },
  ]
  const second = { ...request(), messages: again } as GenerateOptionsLike
  for await (const _chunk of adapter.stream(second)) { void _chunk }
  const secondMessages = (captured.body!.messages as Array<{ role: string, content: Array<{ type: string, text?: string }> }>)
  assert.equal(secondMessages.length, 1)
})

test('a missing credential fails the stream with the re-login instruction', async () => {
  const { fs } = memoryStore()
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs })
  await assert.rejects(async () => { for await (const chunk of adapter.stream(request())) void chunk }, /\/glm-login/)
  const status = await adapter.status()
  assert.equal(status.logged, false)
})

test('status previews the located project key (unresolved before the first request) and logout clears the store', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs, env: isolatedEnv() })
  const status = await adapter.status()
  assert.equal(status.logged, true)
  assert.equal(status.keyPreview, 'unresolved')
  for await (const chunk of adapter.stream(request() as never)) void chunk
  assert.equal((await adapter.status()).keyPreview, `${PAT_KEY_ID.slice(0, 6)}…`)
  await logout('C:/ws/.llm', fs)
  assert.equal((await adapter.status()).logged, false)
})

test('status calls a stored login the plan cannot use not logged in, naming the 3.16.3 reason its requests fail closed with', async () => {
  const statusOf = async (stored: Credential, plan?: 'start-plan') => {
    const { fs } = memoryStore()
    await saveCredential(fs, STORE_PATH, stored)
    return new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs, ...(plan === undefined ? {} : { plan }) }).status()
  }
  const { oauthAccessToken: _oauth, ...withoutOAuth } = credential
  assert.deepEqual(await statusOf(withoutOAuth), { logged: false, plan: 'coding-plan', incomplete: 'Account request credential is unavailable: bigmodel' })
  const { userId: _user, ...withoutAccount } = credential
  assert.deepEqual(await statusOf(withoutAccount), { logged: false, plan: 'coding-plan', incomplete: 'Account request credential is unavailable: account:bigmodel-individual-coding-plan' })
  assert.deepEqual(await statusOf(credential, 'start-plan'), { logged: false, plan: 'start-plan', incomplete: 'Account request credential is unavailable: account:bigmodel-start-plan' })
  assert.equal((await statusOf({ ...credential, jwt: 'a.b.c' }, 'start-plan')).logged, true)
})

test('login row registers the three commands and /glm-login returns the authorize URL', async () => {
  const registered: Array<{ definitionId: string, name: string, handler: (invocation: { rawInput: string }) => Promise<{ kind: string, text: string }> }> = []
  const dispose = loginApply({ commands: { register: definition => { registered.push(definition); return () => {} } } }, { home: 'C:/ws/.llm' })
  assert.deepEqual(registered.map(row => row.name), ['glm-login', 'glm-status', 'glm-logout'])
  dispose()
})

test('each request reports its session to the row health: answered, refused upstream, unreadable store', async () => {
  const { fs, files } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const reports: Array<[string | undefined, string, string]> = []
  const report = (sessionId: string | undefined, state: string, reason: string) => { reports.push([sessionId, state, reason]) }
  const ok = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs, env: zcodeDataDir({ deviceMid: 'fake-device-mid' }).env, report })
  for await (const _chunk of ok.stream({ ...request(), sessionId: 's1' } as never)) { void _chunk }
  const plane = patPlane()
  const refusing: typeof fetch = (url, init) => Promise.resolve(plane.answer(urlOf(url), init) ?? new Response('quota', { status: 429 }))
  const refused = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: refusing, storeFs: fs, env: isolatedEnv(), report })
  await assert.rejects(async () => { for await (const chunk of refused.stream({ ...request(), sessionId: 's2' } as never)) void chunk }, /glm-zcode 429/)
  files.set('C:/ws/.llm/credentials.json', 'not json')
  await assert.rejects(async () => { for await (const chunk of ok.stream({ ...request(), sessionId: 's3' } as never)) void chunk }, /corrupted/)
  assert.deepEqual(reports, [
    ['s1', 'active', '上游已应答（套餐 coding-plan）'],
    ['s2', 'inactive', '上游返回 429'],
    ['s3', 'inactive', '凭证不可读：credential store is corrupted (not JSON): C:/ws/.llm/credentials.json'],
  ])
})

test('ZcodeLogin.start surfaces the authorize URL and completes into the store', async () => {
  const { fs, files } = memoryStore()
  const fetchImpl = (async (url: string | URL | Request): Promise<Response> => {
    const u = String(url)
    const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.endsWith('/oauth/cli/init')) {
      return respond({ code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth?client=x', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
    }
    if (u.includes('/oauth/cli/poll/')) {
      return respond({ code: 0, data: { status: 'ready', token: 'jwt-x', user: { user_id: 'u1' }, bigmodel: { access_token: 'bm-tok' } } })
    }
    // 3.16.3 stores the login tokens only: no customer info, key list or key secret at login.
    throw new Error(`unexpected ${u}`)
  }) as typeof fetch
  const login = new ZcodeLogin({ home: 'C:/ws/.llm', fetchImpl, storeFs: fs })
  const url = await login.start()
  assert.ok(url.includes('redirect='))
  await new Promise(resolve => setTimeout(resolve, 30))
  const stored = files.get('C:/ws/.llm/credentials.json')
  assert.ok((stored ?? '').length > 0)
  assert.equal(login.state.error, undefined)
  const { loadCredential } = await import('../src/glm-llm/auth/store.ts')
  assert.deepEqual(await loadCredential(fs, 'C:/ws/.llm/credentials.json'), { version: 2, provider: 'bigmodel', oauthAccessToken: 'bm-tok', userId: 'u1', jwt: 'jwt-x' })
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl, storeFs: fs })
  const status = await adapter.status()
  assert.equal(status.logged, true)
  assert.equal(status.keyPreview, 'unresolved')
})
