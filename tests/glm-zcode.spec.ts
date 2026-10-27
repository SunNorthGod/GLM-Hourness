import assert from 'node:assert/strict'
import test from 'node:test'
import { ZcodeAdapter, ZcodeLogin, logout } from '../src/glm-llm/zcode.ts'
import { ZCODE_APP_VERSION } from '../src/glm-llm/identity.ts'
import { ANTHROPIC_SDK_UA } from '../src/glm-llm/headers.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { saveCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'
import type { GenerateOptionsLike, StreamChunk } from '../src/shared/lm-min.ts'

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
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: {} as NodeJS.ProcessEnv, resolveAttachments: () => attachments })
  for await (const _chunk of adapter.stream(options as never)) { void _chunk }
  assert.deepEqual(reads, ['sha256:cccc'])
  const messages = captured.body!.messages as Array<{ content: unknown[] }>
  assert.deepEqual(messages[0]!.content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw==' } })
  const bare = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs, env: {} as NodeJS.ProcessEnv })
  await assert.rejects(async () => { for await (const chunk of bare.stream(options as never)) void chunk }, /attachment service/)
})

function makeUpstream(captured: { url?: string, headers?: Record<string, string>, body?: Record<string, unknown> } = {}) {
  return (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    captured.url = String(url)
    captured.headers = init?.headers as Record<string, string>
    captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(sseBody([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } })
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
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: {} as NodeJS.ProcessEnv })
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream(request())) chunks.push(chunk)
  assert.equal(captured.url, UPSTREAM)
  assert.equal(captured.headers!.authorization, 'Bearer id.secret')
  assert.equal(captured.headers!['x-api-key'], 'id.secret')
  assert.equal(captured.headers!['User-Agent'], `ZCode/${ZCODE_APP_VERSION} ${ANTHROPIC_SDK_UA}`)
  assert.ok(captured.headers!['x-session-id'] !== undefined)
  assert.deepEqual((captured.body!.system as unknown[]), [{ type: 'text', text: 'be brief' }])
  const text = chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.type === 'block-end' && chunk.block.type === 'text' ? chunk.block.text : '').join('')
  assert.equal(text, 'ok')
  assert.ok(chunks.some(chunk => chunk.type === 'finish' && chunk.reason.kind === 'stop'))
})

test('the DSH system prompt arrives as leading system messages and lands in the system field', async () => {
  // DSH runtimes deliver the assembled prompt in history, not GenerateOptions.system
  // (L3 probe 2026-10-27); dropping those messages would send GLM no system prompt.
  const { fs } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const captured: { body?: Record<string, unknown> } = {}
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(captured), storeFs: fs, env: {} as NodeJS.ProcessEnv })
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
  const adapter = new ZcodeAdapter({ home: 'C:/ws/.llm', plan: 'start-plan', fetchImpl: makeUpstream(captured), storeFs: fs, env: {} as NodeJS.ProcessEnv })
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

test('login row without a home keeps only /glm-status instead of failing activation', () => {
  const registered: string[] = []
  const warn = console.warn
  console.warn = () => {}
  let dispose: () => void
  try {
    dispose = loginApply({ commands: { register: definition => { registered.push(definition.name); return () => {} } } }, {})
  }
  finally {
    console.warn = warn
  }
  assert.deepEqual(registered, ['glm-status'])
  dispose()
})

test('each request reports its session to the row health: answered, refused upstream, unreadable store', async () => {
  const { fs, files } = memoryStore()
  await saveCredential(fs, 'C:/ws/.llm/credentials.json', credential)
  const reports: Array<[string | undefined, string, string]> = []
  const report = (sessionId: string | undefined, state: string, reason: string) => { reports.push([sessionId, state, reason]) }
  const ok = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: makeUpstream(), storeFs: fs, env: {} as NodeJS.ProcessEnv, report })
  for await (const _chunk of ok.stream({ ...request(), sessionId: 's1' } as never)) { void _chunk }
  const refusing = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
  const refused = new ZcodeAdapter({ home: 'C:/ws/.llm', fetchImpl: refusing, storeFs: fs, env: {} as NodeJS.ProcessEnv, report })
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
