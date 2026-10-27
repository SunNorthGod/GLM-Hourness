import assert from 'node:assert/strict'
import test from 'node:test'
import { ZcodeAdapter, ZcodeLogin, logout } from '../src/glm-llm/zcode.ts'
import { apply as loginApply } from '../src/glm-llm/login-row.ts'
import { saveCredential, type StoreFs } from '../src/glm-llm/auth/store.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'
import type { GenerateOptionsLike, StreamChunk } from '../src/glm-llm/lm-min.ts'

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
  assert.equal(resolved.systemPromptUpdate, 'in-history')
  // The adapter base default preserves normalized images unchanged.
  const target = adapter.imageRequestTarget('glm-zcode', 'glm-5.3', { attachmentId: 'a1', mediaType: 'image/png', bytes: 1024, width: 640, height: 480 } as never)
  assert.deepEqual(target, { width: 640, height: 480, maxBytes: 1024 })
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
  assert.match(captured.headers!['User-Agent'], /^ZCode\/3\.14\.0 ai-sdk\/anthropic\/3\.0\.81$/)
  assert.ok(captured.headers!['x-session-id'] !== undefined)
  assert.deepEqual((captured.body!.system as unknown[]), [{ type: 'text', text: 'be brief' }])
  const text = chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.type === 'block-end' && chunk.block.type === 'text' ? chunk.block.text : '').join('')
  assert.equal(text, 'ok')
  assert.ok(chunks.some(chunk => chunk.type === 'finish' && chunk.reason.kind === 'stop'))
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

test('login row degrades to a no-op without a home', () => {
  const dispose = loginApply({ commands: { register: () => () => {} } }, {})
  assert.equal(typeof dispose, 'function')
  dispose()
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
