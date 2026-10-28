import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync } from 'node:fs'
import { ZcodeAdapter, ZcodeLogin, logout } from '../src/glm-llm/zcode.ts'
import { ZCODE_APP_VERSION } from '../src/glm-llm/identity.ts'
import { ANTHROPIC_SDK_UA, requestAttribution, upstreamSessionId } from '../src/glm-llm/headers.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { saveCredential } from '../src/glm-llm/auth/store.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'
import type { GenerateOptionsLike, StreamChunk } from '../src/shared/lm-min.ts'
import { memoryStore, zcodeDataDir } from './glm-fixtures.ts'

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

function sseOk(): Response {
  return new Response(sseBody([
    'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
    'data: {"type":"content_block_stop","index":0}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
  ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function makeUpstream(captured: { url?: string, headers?: Record<string, string>, body?: Record<string, unknown> } = {}) {
  return (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    captured.url = String(url)
    captured.headers = init?.headers as Record<string, string>
    captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>
    return sseOk()
  }) as typeof fetch
}

function request(): GenerateOptionsLike {
  return {
    provider: 'glm-zcode', model: 'glm-5.3',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    system: 'be brief',
  }
}

const credential: Credential = { apiKey: 'id.secret', provider: 'bigmodel', oauthAccessToken: 'oauth-tok' }

test('coding-plan stream walks the full chain: store → headers → unsigned signing ladder → SSE', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { url?: string, headers?: Record<string, string>, body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream(request())) chunks.push(chunk)
  assert.equal(captured.url, UPSTREAM)
  assert.equal(captured.headers!.authorization, 'Bearer id.secret')
  assert.equal(captured.headers!['x-api-key'], 'id.secret')
  assert.equal(captured.headers!['User-Agent'], `ZCode/${ZCODE_APP_VERSION} ${ANTHROPIC_SDK_UA}`)
  assert.ok(captured.headers!['x-session-id'] !== undefined)
  // ZCode's attribution set: request, session type and trace ids on every request.
  assert.deepEqual(['x-request-id', 'x-zcode-session-type', 'x-zcode-trace-id', 'x-session-id'].map(name => name in captured.headers!), [true, true, true, true])
  assert.equal(captured.headers!['x-zcode-session-type'], 'main')
  assert.deepEqual((captured.body!.system as unknown[]), [{ type: 'text', text: 'be brief' }])
  // metadata.user_id names the deviceMid and the same session id as the header.
  const userId = JSON.parse((captured.body!.metadata as { user_id: string }).user_id) as Record<string, string>
  assert.deepEqual(Object.keys(userId), ['device_id', 'account_uuid', 'session_id'])
  assert.equal(userId.account_uuid, '')
  assert.equal(userId.session_id, captured.headers!['x-session-id'])
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
 * `privateCipher` (404 without one), the bigmodel project-token mint fails,
 * and everything else streams SSE. Every request is recorded in order.
 */
function gatewayFetch(wire: WireRequest[], options: { privateCipher?: string, mapping?: ReadonlyArray<Record<string, string>> }): typeof fetch {
  const mapping = options.mapping ?? [{ from: UPSTREAM, to: ULTRA }]
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    wire.push({ url, headers: { ...(init?.headers as Record<string, string> | undefined) }, ...(typeof init?.body === 'string' ? { body: init.body } : {}) })
    if (url === 'https://zcode.z.ai/api/v1/agent/configs') return Promise.resolve(json(200, { code: 0, data: { proxyEndpoint: { mapping } } }))
    if (url.endsWith(HANDSHAKE_TAIL)) {
      return Promise.resolve(options.privateCipher === undefined ? new Response('not found', { status: 404 }) : json(200, { code: 200, data: { privateCipher: options.privateCipher } }))
    }
    if (url.startsWith('https://bigmodel.cn/')) return Promise.resolve(json(500, {}))
    return Promise.resolve(sseOk())
  }
}

/** A handshake `privateCipher` for a fresh Ed25519 key, sealed as 3.16.3 opens it: AES-GCM under HKDF(secret, ed25519_priv), AAD apiKeyId. */
async function sealedSigningKey(secret: string, apiKeyId: string): Promise<string> {
  const utf8 = new TextEncoder()
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  const hkdf = await crypto.subtle.importKey('raw', utf8.encode(secret), 'HKDF', false, ['deriveKey'])
  const sealing = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: utf8.encode('WD_CLIENT_SIGN_KDF_SALT'), info: utf8.encode('ed25519_priv') }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(apiKeyId) }, sealing, utf8.encode(pkcs8))
  return Buffer.concat([iv, new Uint8Array(sealed)]).toString('base64')
}

/**
 * Run `requests` streams through one fresh adapter on the gateway double and
 * return the wire log. `stored` replaces the default credential.
 */
async function runOnGateway(gateway: { privateCipher?: string, mapping?: ReadonlyArray<Record<string, string>> }, options: { stored?: Credential, plan?: 'start-plan', requests?: number, env?: NodeJS.ProcessEnv, report?: (sessionId: string | undefined, state: string, reason: string) => void, files?: Map<string, string> } = {}): Promise<WireRequest[]> {
  const store = memoryStore()
  for (const [path, data] of options.files ?? []) store.files.set(path, data)
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
  assert.equal(deviceIdOf(model!), 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb')
  assert.equal(headerOf(wire.find(isConfigRequest)!, 'X-Device-Mid'), 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb')
  assert.deepEqual(reports, ['上游已应答（套餐 coding-plan）'])
})

test('without a ZCode deviceMid the bundle\'s own one is sent on both planes, the row health says so, and ~/.zcode stays untouched', async () => {
  const zcode = zcodeDataDir()
  const reports: string[] = []
  const files = new Map([['C:/ws/.llm/device-mid.txt', 'cccccccc-1111-4222-8333-dddddddddddd']])
  const wire = await runOnGateway({}, { env: zcode.env, report: (_s, _state, reason) => { reports.push(reason) }, files })
  assert.equal(deviceIdOf(wire.find(isModelRequest)!), 'cccccccc-1111-4222-8333-dddddddddddd')
  assert.equal(headerOf(wire.find(isConfigRequest)!, 'X-Device-Mid'), 'cccccccc-1111-4222-8333-dddddddddddd')
  assert.deepEqual(reports, ['上游已应答（套餐 coding-plan）；ZCode 状态文件里没有 deviceMid，设备 ID 用本包自己的'])
  assert.deepEqual(readdirSync(zcode.dir), [])
})

test('coding-plan handshakes on the provider origin, sends to the routed URL, and reuses the key', async () => {
  // The signer sees the provider URL before routing (3.16.3); handing it the
  // routed zcode.z.ai URL sent the handshake to zcode.z.ai, which answers 404.
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey('secret', 'id') }, { requests: 2 })
  assert.deepEqual(wire.filter(isHandshake).map(entry => entry.url), [PROVIDER_HANDSHAKE])
  const model = wire.filter(isModelRequest)
  assert.equal(model.length, 2)
  assert.ok(model.every(entry => entry.headers['X-Client-Sig'] !== undefined))
})

test('a failing handshake is tried once across consecutive requests, which go out unsigned', async () => {
  const wire = await runOnGateway({}, { requests: 2 })
  assert.equal(wire.filter(isHandshake).length, 1)
  const model = wire.filter(isModelRequest)
  assert.equal(model.length, 2)
  assert.ok(model.every(entry => entry.headers['X-Client-Sig'] === undefined))
})

test('start-plan is not signed: no handshake', async () => {
  // 3.16.3 `requiresClientRequestSigning` is false for the start-plan access mode.
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey('secret', 'id') }, { stored: { ...credential, jwt: 'a.b.c' }, plan: 'start-plan' })
  assert.equal(wire.filter(isHandshake).length, 0)
  assert.equal(wire.filter(isModelRequest).length, 1)
})

test('routing headers follow the signature block, and a mapped handshake URL is routed like the model request', async () => {
  const routedHandshake = 'https://zcode.z.ai/api/v1/ultra/paas/c1f3a7e2/v2/client'
  const mapping = [
    { from: UPSTREAM, to: ULTRA, zcodeAuthorizationHeader: 'X-ZCode-Authorization' },
    { from: PROVIDER_HANDSHAKE, to: routedHandshake, zcodeAuthorizationHeader: 'X-ZCode-Authorization' },
  ]
  const wire = await runOnGateway({ privateCipher: await sealedSigningKey('secret', 'id'), mapping }, { stored: { ...credential, jwt: 'zcode-jwt' } })
  const [handshake] = wire.filter(isHandshake)
  assert.equal(handshake.url, routedHandshake)
  assert.equal(handshake.headers['X-ZCode-Authorization'], 'Bearer zcode-jwt')
  // `send` builds the headers with Object.fromEntries, so key order is wire order.
  const [model] = wire.filter(isModelRequest)
  const names = Object.keys(model.headers)
  assert.equal(names.at(-1), 'X-ZCode-Authorization')
  assert.ok(names.includes('X-Client-Sig') && names.indexOf('X-Client-Sig') < names.indexOf('X-ZCode-Authorization'))
  assert.equal(model.headers['X-ZCode-Authorization'], 'Bearer zcode-jwt')
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

test('auxiliary calls (compaction, session title) keep the conversation session and are typed other', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { headers?: Record<string, string>, body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
  const attributionOf = async (purpose: 'compaction' | 'session-title' | undefined): Promise<[string, string, string]> => {
    for await (const chunk of adapter.stream({ ...request(), sessionId: 'session-conv-1', ...(purpose === undefined ? {} : { purpose }) })) void chunk
    const userId = JSON.parse((captured.body?.metadata as { user_id: string }).user_id) as { session_id: string }
    return [captured.headers?.['x-session-id'] ?? '', captured.headers?.['x-zcode-session-type'] ?? '', userId.session_id]
  }
  assert.deepEqual(await attributionOf(undefined), ['conv-1', 'main', 'conv-1'])
  assert.deepEqual(await attributionOf('compaction'), ['conv-1', 'other', 'conv-1'])
  assert.deepEqual(await attributionOf('session-title'), ['conv-1', 'other', 'conv-1'])
  assert.deepEqual(requestAttribution(undefined, undefined).sessionType, 'main')
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
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: isolatedEnv() })
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

test('status reports the key preview and logout clears the store', async () => {
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs })
  const status = await adapter.status()
  assert.equal(status.logged, true)
  assert.equal(status.keyPreview, 'id.sec…'.slice(0, 7).replace('…', '…'))
  assert.ok(status.keyPreview!.startsWith('id.sec'))
  await logout('C:/ws/.llm', fs)
  assert.equal((await adapter.status()).logged, false)
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
  const refusing = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
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
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url)
    const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.endsWith('/oauth/cli/init')) {
      return respond({ code: 0, data: { flow_id: 'f1', poll_token: 'pt', authorize_url: 'https://bigmodel.cn/oauth?client=x', expires_at: Math.floor(Date.now() / 1000) + 600, poll_interval_sec: 1 } })
    }
    if (u.includes('/oauth/cli/poll/')) {
      return respond({ code: 0, data: { status: 'ready', token: 'jwt-x', user: { user_id: 'u1' }, bigmodel: { access_token: 'bm-tok' } } })
    }
    if (u.endsWith('getCustomerInfo')) {
      return respond({ code: 0, data: { organizations: [{ organizationId: 'org1', projects: [{ projectId: 'proj1' }] }] } })
    }
    if (u.endsWith('/api_keys') && init?.method === 'GET') {
      return respond({ code: 0, data: [{ name: 'zcode-api-key', apiKey: 'kk' }] })
    }
    if (u.includes('/copy/')) {
      return respond({ code: 0, data: { secretKey: 'ss' } })
    }
    throw new Error(`unexpected ${u}`)
  }) as typeof fetch
  const login = new ZcodeLogin({ home: 'C:/ws/.llm', fetchImpl, storeFs: fs })
  const url = await login.start()
  assert.ok(url.includes('redirect='))
  await new Promise(resolve => setTimeout(resolve, 30))
  const stored = files.get('C:/ws/.llm/credentials.json')
  assert.ok((stored ?? '').length > 0)
  assert.equal(login.state.error, undefined)
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl, storeFs: fs })
  const status = await adapter.status()
  assert.equal(status.logged, true)
  assert.ok(status.keyPreview!.startsWith('kk.ss'))
})
