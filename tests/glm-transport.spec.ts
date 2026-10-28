import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLlmIdentityHeaders, buildContextIdentityHeaders, ensureDeviceMid, DEFAULT_IDENTITY, ZCODE_APP_VERSION } from '../src/glm-llm/identity.ts'
import { buildAuthHeaders, buildTraceHeaders, ANTHROPIC_SDK_UA } from '../src/glm-llm/headers.ts'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { encodeRequest, encodeMessage, decodeFrame, decodeSse, metadataUserId, replayBlocksOf, type AnthropicRequest } from '../src/glm-llm/anthropic.ts'
import { glmImageRequestTarget, prepareRequestImages, offloadedImageText, ZCODE_IMAGE_TARGET_BYTES } from '../src/glm-llm/images.ts'
import type { AttachmentsLike, ImageRefLike, ImageTarget, RequestMessageLike } from '../src/shared/lm-min.ts'
import type { Credential } from '../src/glm-llm/auth/types.ts'

const env = {
  ZCODE_IDENTITY_PLATFORM: 'win32',
  ZCODE_IDENTITY_ARCH: 'x64',
  ZCODE_IDENTITY_RELEASE: '10.0.26100',
  ZCODE_IDENTITY_CLIENT_LANGUAGE: 'zh-CN',
  ZCODE_IDENTITY_CLIENT_TIMEZONE: 'Asia/Shanghai',
} as NodeJS.ProcessEnv

test('LLM identity headers mirror the g6n shape (agent 8th, no device mid)', () => {
  const headers = buildLlmIdentityHeaders(DEFAULT_IDENTITY, env)
  const keys = Object.keys(headers)
  assert.deepEqual(keys, [
    'HTTP-Referer', 'User-Agent', 'X-ZCode-App-Version', 'X-Title', 'X-Release-Channel',
    'X-Client-Language', 'X-Client-Timezone', 'X-ZCode-Agent', 'X-Platform', 'X-Os-Category', 'X-Os-Version',
  ])
  assert.equal(headers['User-Agent'], `ZCode/${ZCODE_APP_VERSION}`)
  assert.equal(headers['X-Title'], 'Z Code@cli')
  assert.equal(headers['X-Platform'], 'win32-x64')
  assert.equal(headers['X-Os-Category'], 'windows')
  assert.equal(headers['X-ZCode-Agent'], 'glm')
  assert.ok(!('X-Device-Mid' in headers))
})

test('context identity headers carry the device mid and drop the agent', () => {
  const headers = buildContextIdentityHeaders({ ...DEFAULT_IDENTITY, deviceMid: 'mid-1' }, env)
  assert.equal(headers['X-Device-Mid'], 'mid-1')
  assert.ok(!('X-ZCode-Agent' in headers))
  assert.equal(Object.keys(headers)[0], 'User-Agent') // wire order: UA first
})

test('deviceMid persists once and is reused across reads', async () => {
  const files = new Map<string, string>()
  const fs = {
    readFile: async (path: string) => { const value = files.get(path); if (value === undefined) throw new Error('ENOENT'); return value },
    writeFile: async (path: string, data: string) => { files.set(`${path}.tmp`, data); files.set(path, data) },
    rename: async (from: string, to: string) => { files.set(to, files.get(from) ?? ''); files.delete(from) },
  }
  const first = await ensureDeviceMid('C:/ws/.llm', fs)
  const second = await ensureDeviceMid('C:/ws/.llm', fs)
  assert.match(first, /^[0-9a-f-]{36}$/)
  assert.equal(second, first)
  assert.equal(Object.keys(files).filter(path => path.endsWith('.tmp')).length, 0)
})

const cred: Credential = { apiKey: 'sk-full', provider: 'bigmodel' }

test('coding-plan anthropic auth carries the dual header pair plus SDK UA suffix', () => {
  const headers = buildAuthHeaders(cred, DEFAULT_IDENTITY, 'coding-plan', undefined, env)
  assert.equal(headers['x-api-key'], 'sk-full')
  assert.equal(headers.authorization, 'Bearer sk-full')
  assert.equal(headers['anthropic-version'], '2023-06-01')
  assert.equal(headers['User-Agent'], `ZCode/${ZCODE_APP_VERSION} ${ANTHROPIC_SDK_UA}`)
  assert.ok(headers['x-session-id'] !== undefined) // coding-plan always carries one
  assert.ok(headers['x-query-id'] !== undefined)
  assert.equal(headers['x-zcode-session-type'], 'main')
})

test('start-plan auth uses the JWT bearer only and omits session ids', () => {
  const headers = buildAuthHeaders({ ...cred, jwt: 'jwt-1' }, DEFAULT_IDENTITY, 'start-plan', undefined, env)
  assert.equal(headers.authorization, 'Bearer jwt-1')
  assert.ok(!('x-api-key' in headers))
  assert.ok(!('x-session-id' in headers))
  assert.ok(!('x-query-id' in headers))
})

test('trace headers use the exact context when provided', () => {
  const headers = buildTraceHeaders('coding-plan', { sessionId: 's1', requestId: 'r1', traceId: 't1', queryId: 'q1', sessionType: 'subagent' })
  assert.deepEqual(headers, { 'x-request-id': 'r1', 'x-zcode-session-type': 'subagent', 'x-zcode-trace-id': 't1', 'x-query-id': 'q1', 'x-session-id': 's1' })
  // coding-plan without a session id synthesizes one (signing requires it)
  const synthesized = buildTraceHeaders('coding-plan', { requestId: 'r1' })
  assert.match(synthesized['x-session-id']!, /^[0-9a-f-]{36}$/)
})

test('encodeMessage folds seam roles into anthropic blocks', () => {
  assert.equal(encodeMessage({ role: 'system', content: [] }), undefined)
  assert.deepEqual(
    encodeMessage({ role: 'developer', content: [{ type: 'text', text: 'note' }] }),
    { role: 'user', content: [{ type: 'text', text: '<system-reminder>\nnote\n</system-reminder>' }] },
  )
  assert.deepEqual(
    encodeMessage({ role: 'tool', toolCallId: 'tu1', content: [{ type: 'text', text: 'done' }] }),
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'done' }] },
  )
  // A failed result is error text with is_error set (ZCode's error-text output).
  assert.deepEqual(
    encodeMessage({ role: 'tool', toolCallId: 'tu2', isError: true, content: [{ type: 'text', text: 'Error: boom' }] }),
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu2', content: 'Error: boom', is_error: true }] },
  )
  // rc.3 carries tool calls as tool-call content blocks; reasoning without
  // replay metadata goes back unsigned (ZCode's empty signature).
  assert.deepEqual(
    encodeMessage({ role: 'assistant', content: [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'hi' },
      { type: 'tool-call', id: 'c1', name: 'Grep', arguments: '{"q":1}' },
      { type: 'tool-call', id: 'c2', name: 'Read', arguments: 'not json' },
    ] }),
    { role: 'assistant', content: [
      { type: 'thinking', thinking: 'think', signature: '' },
      { type: 'text', text: 'hi' },
      { type: 'tool_use', id: 'c1', name: 'Grep', input: { q: 1 } },
      { type: 'tool_use', id: 'c2', name: 'Read', input: {} },
    ] },
  )
  assert.equal(encodeMessage({ role: 'assistant', content: [{ type: 'reasoning', text: 'only thinking' }] }), undefined)
  // User text blocks stay separate; empty ones drop; an empty turn gets ZCode's fallback.
  assert.deepEqual(
    encodeMessage({ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: '' }, { type: 'text', text: 'b' }] }),
    { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
  )
  assert.deepEqual(encodeMessage({ role: 'user', content: [] }), { role: 'user', content: [{ type: 'text', text: '(no content)' }] })
})

test('encodeRequest groups consecutive same-role turns the way the ZCode client sends them', () => {
  const request = encodeRequest({
    provider: 'glm-zcode', model: 'glm-5.3',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'go' }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'Read', arguments: '{}' }, { type: 'tool-call', id: 'c2', name: 'Glob', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'one' }] },
      { role: 'tool', toolCallId: 'c2', content: [{ type: 'text', text: 'two' }] },
      { role: 'user', content: [{ type: 'text', text: '<system-reminder>\nnotice\n</system-reminder>' }] },
    ],
  })
  assert.deepEqual(request.messages, [
    { role: 'user', content: [{ type: 'text', text: 'go' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'Read', input: {} }, { type: 'tool_use', id: 'c2', name: 'Glob', input: {} }] },
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'c1', content: 'one' },
      { type: 'tool_result', tool_use_id: 'c2', content: 'two' },
      { type: 'text', text: '<system-reminder>\nnotice\n</system-reminder>', cache_control: { type: 'ephemeral' } },
    ] },
  ])
})

test('the last block of the last message is the one cache breakpoint; metadata.user_id is the ZCode device/session blob', () => {
  const history: RequestMessageLike[] = [{ role: 'user', content: [{ type: 'text', text: 'list the sources' }] }]
  history.push({ role: 'assistant', content: [{ type: 'text', text: 'Listing.' }, { type: 'tool-call', id: 'k1', name: 'Glob', arguments: '{"pattern":"src/**"}' }] })
  history.push({ role: 'tool', toolCallId: 'k1', content: [{ type: 'text', text: 'src/a.ts' }] })
  const request = encodeRequest({ provider: 'glm-zcode', model: 'glm-5.3-flash', messages: history }, undefined, undefined, metadataUserId('mid-1', 'sess-1'))
  const marked = request.messages.flatMap(message => message.content.filter(block => block.cache_control !== undefined))
  assert.deepEqual(marked, [{ type: 'tool_result', tool_use_id: 'k1', content: 'src/a.ts', cache_control: { type: 'ephemeral' } }])
  assert.deepEqual(request.metadata, { user_id: '{"device_id":"mid-1","account_uuid":"","session_id":"sess-1"}' })
  assert.equal(metadataUserId(undefined, 's'), '{"account_uuid":"","session_id":"s"}') // an unknown deviceMid drops the key
  assert.equal(encodeRequest({ provider: 'glm-zcode', model: 'glm-5.3', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] }).metadata, undefined)
})

test('encodeRequest builds the streaming body with system blocks and tools', () => {
  const request = encodeRequest({
    provider: 'glm', model: 'glm-5.3',
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'sys' }] },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'system', content: [{ type: 'text', text: 'later' }] },
    ],
    tools: [{ name: 'TodoWrite', description: 'd', parameters: { type: 'object' } }],
    maxTokens: 4096,
  }, [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }])
  assert.equal(request.stream, true)
  assert.equal(request.max_tokens, 4096)
  assert.deepEqual(request.system, [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }])
  // The leading system message is the caller's system block; a later one rides
  // the user turn as a system reminder (consecutive user turns merge).
  assert.deepEqual(request.messages, [
    { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: '<system-reminder>\nlater\n</system-reminder>', cache_control: { type: 'ephemeral' } }] },
  ])
  assert.deepEqual(request.tools, [{ name: 'TodoWrite', description: 'd', input_schema: { type: 'object' } }])
})

const png: ImageRefLike = { attachmentId: 'sha256:aaaa', mediaType: 'image/png', bytes: 1200, width: 640, height: 480, name: 'shot.png' }
const jpeg: ImageRefLike = { attachmentId: 'sha256:bbbb', mediaType: 'image/jpeg', bytes: 900_000, width: 4000, height: 1000 }

/** Attachment-store double: a deterministic request version per reference, every call recorded. */
function attachmentStore(hostPaths: Record<string, string> = {}): AttachmentsLike & { calls: Array<{ id: string, target: ImageTarget }> } {
  const calls: Array<{ id: string, target: ImageTarget }> = []
  return {
    calls,
    async readImageRequest(ref, target) {
      calls.push({ id: ref.attachmentId, target })
      return { data: new TextEncoder().encode(`bytes:${ref.attachmentId}`), mediaType: ref.mediaType }
    },
    imageHostPath: ref => hostPaths[ref.attachmentId],
  }
}

const base64 = (text: string): string => Buffer.from(text).toString('base64')

test('glmImageRequestTarget applies ZCode bounds: long edge 2000 px, raw bytes within 3/4 of 5 MiB', () => {
  assert.equal(ZCODE_IMAGE_TARGET_BYTES, 3_932_160)
  assert.deepEqual(glmImageRequestTarget(png), { width: 640, height: 480, maxBytes: 3_932_160 })
  assert.deepEqual(glmImageRequestTarget(jpeg), { width: 2000, height: 500, maxBytes: 3_932_160 })
  assert.deepEqual(glmImageRequestTarget({ width: 1000, height: 3001 }), { width: 666, height: 2000, maxBytes: 3_932_160 })
})

test('prepareRequestImages reads one request version per attachment from user and tool messages', async () => {
  const store = attachmentStore()
  const messages: RequestMessageLike[] = [
    { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', attachment: png }] },
    { role: 'tool', toolCallId: 't1', content: [{ type: 'image', attachment: jpeg }, { type: 'image', attachment: png }] },
  ]
  const images = await prepareRequestImages(messages, store, undefined, undefined)
  assert.deepEqual(store.calls, [
    { id: 'sha256:aaaa', target: { width: 640, height: 480, maxBytes: 3_932_160 } },
    { id: 'sha256:bbbb', target: { width: 2000, height: 500, maxBytes: 3_932_160 } },
  ])
  assert.deepEqual(images?.versions.get('sha256:bbbb'), { mediaType: 'image/jpeg', data: base64('bytes:sha256:bbbb') })
  // No image, nothing to prepare; an image without the service fails loudly.
  assert.equal(await prepareRequestImages([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], undefined, undefined, undefined), undefined)
  await assert.rejects(prepareRequestImages(messages, undefined, undefined, undefined), /attachment service/)
})

test('offloaded images send the DSH placeholder text, with the read-only path when one resolves', async () => {
  const store = attachmentStore({ 'sha256:aaaa': 'C:/dsh/attachments/v1/aa.png' })
  const messages: RequestMessageLike[] = [
    { role: 'user', content: [{ type: 'image', attachment: png, offloaded: true }, { type: 'image', attachment: jpeg, offloaded: true }] },
  ]
  const images = await prepareRequestImages(messages, store, hostPath => hostPath.replace('C:/dsh', 'D:/world'), undefined)
  assert.deepEqual(store.calls, []) // offloaded occurrences read no bytes
  const encoded = encodeMessage(messages[0]!, images)
  assert.deepEqual(encoded, { role: 'user', content: [
    { type: 'text', text: offloadedImageText(png, 'D:/world/attachments/v1/aa.png') },
    { type: 'text', text: offloadedImageText(jpeg, undefined) },
  ] })
  assert.equal(offloadedImageText(jpeg, undefined), '[image omitted to fit request image limits; sha256:bbbb. No local normalized image path is available; ask the user to attach it again if needed.]')
  assert.equal(
    offloadedImageText(png, 'D:/a.png'),
    '[image omitted to fit request image limits; "shot.png" (sha256:aaaa). Normalized copy (read-only; may be resized or re-encoded): "D:/a.png" (640x480px, image/png). Source dimensions, format, and byte size may differ. Copy to a writable path ending in .png before editing.]',
  )
})

test('image blocks reach the request body as Anthropic base64 image blocks, inside tool_result for tool results', async () => {
  const messages: RequestMessageLike[] = [
    { role: 'user', content: [{ type: 'text', text: 'what is this?' }, { type: 'image', attachment: png }] },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'Read', arguments: '{"file_path":"C:/x.jpg"}' }] },
    { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: '<path>C:/x.jpg</path>' }, { type: 'image', attachment: jpeg }] },
  ]
  const images = await prepareRequestImages(messages, attachmentStore(), undefined, undefined)
  const request = encodeRequest({ provider: 'glm-zcode', model: 'glm-5.3-flash', messages }, [], images)
  assert.deepEqual(request.messages, [
    { role: 'user', content: [
      { type: 'text', text: 'what is this?' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64('bytes:sha256:aaaa') } },
    ] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'Read', input: { file_path: 'C:/x.jpg' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', cache_control: { type: 'ephemeral' }, content: [
      { type: 'text', text: '<path>C:/x.jpg</path>' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64('bytes:sha256:bbbb') } },
    ] }] },
  ])
  // Encoding an image without prepared versions is a programming error, not a silent drop.
  assert.throws(() => encodeMessage(messages[0]!), /not prepared/)
})

test('decodeFrame maps the wire events to seam chunks', () => {
  // Usage is stream-level state (decodeSse merges it); a single frame never emits it.
  assert.deepEqual(decodeFrame({ type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 0 } } }), [])
  assert.deepEqual(decodeFrame({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }), [{ type: 'block-start', index: 0, blockType: 'reasoning' }])
  assert.deepEqual(decodeFrame({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'a' } }), [{ type: 'text-delta', index: 1, text: 'a' }])
  assert.deepEqual(decodeFrame({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 't' } }), [{ type: 'reasoning-delta', index: 0, text: 't' }])
  assert.deepEqual(decodeFrame({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } }), [{ type: 'finish', reason: { kind: 'tool-calls' } }])
  assert.deepEqual(decodeFrame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })[0], { type: 'finish', reason: { kind: 'stop' } })
  assert.deepEqual(decodeFrame({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } })[0], { type: 'finish', reason: { kind: 'max-tokens' } })
})

test('decodeSse aggregates a full thinking/text/tool_use stream into seam chunks', async () => {
  const frames = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"why "}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"so"}}',
    'data: {"type":"content_block_stop","index":0}',
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"text"}}',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hi"}}',
    'data: {"type":"content_block_stop","index":1}',
    'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"tu9","name":"TodoWrite"}}',
    'data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\\"todos\\":"}}',
    'data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"[]}"}}',
    'data: {"type":"content_block_stop","index":2}',
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":40}}',
    'data: {"type":"message_stop"}',
  ]
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const frame of frames) controller.enqueue(encoder.encode(`${frame}\n`))
      controller.close()
    },
  })
  const chunks: unknown[] = []
  for await (const chunk of decodeSse(stream)) chunks.push(chunk)
  assert.deepEqual(chunks.filter(chunk => (chunk as { type: string }).type === 'block-end'), [
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'why so' } },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'hi' } },
    { type: 'block-end', index: 2, block: { type: 'tool-call', id: 'tu9', name: 'TodoWrite', arguments: '{"todos":[]}' } },
  ])
  assert.ok(chunks.some(chunk => JSON.stringify(chunk).includes('"finish"') && JSON.stringify(chunk).includes('tool-calls')))
  // One merged usage chunk: input from message_start, output from message_delta.
  const usages = chunks.filter(chunk => (chunk as { type: string }).type === 'usage')
  assert.deepEqual(usages, [{ type: 'usage', usage: { inputTokens: 9, outputTokens: 40, totalTokens: 49 } }])
})

test('decodeSse merges cache counters and emits usage once, right before finish', async () => {
  const frames = [
    'data: {"type":"message_start","message":{"usage":{"input_tokens":120,"cache_read_input_tokens":3000,"cache_creation_input_tokens":40,"output_tokens":1}}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"pong"}}',
    'data: {"type":"content_block_stop","index":0}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}',
    'data: {"type":"message_stop"}',
  ]
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(`${frame}\n\n`))
      controller.close()
    },
  })
  const chunks: Array<{ type: string }> = []
  for await (const chunk of decodeSse(stream)) chunks.push(chunk as { type: string })
  const kinds = chunks.map(chunk => chunk.type)
  assert.deepEqual(kinds.slice(-2), ['usage', 'finish'])
  assert.equal(kinds.filter(kind => kind === 'usage').length, 1)
  assert.deepEqual((chunks.at(-2) as unknown as { usage: unknown }).usage, { inputTokens: 120, outputTokens: 3, cacheReadTokens: 3000, cacheWriteTokens: 40, totalTokens: 3163 })
})

// Preserved thinking (docs/DESIGN.md §4.5c): the decoder keeps each thinking
// block's signature as replay metadata; the encoder sends the reasoning back.

/** An SSE body from data lines. */
function sse(frames: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(`data: ${frame}\n\n`))
      controller.close()
    },
  })
}

/** A GLM response as the coding-plan endpoint streams it (2026-10-28): signed thinking, text, a tool call. */
const SIGNED_RESPONSE = [
  '{"type":"message_start","message":{"usage":{"input_tokens":50}}}',
  '{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}',
  '{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"quotes "}}',
  '{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"are ignored"}}',
  '{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"c2lnLTEy"}}',
  '{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"MzQ="}}',
  '{"type":"content_block_stop","index":0}',
  '{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
  '{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Reading."}}',
  '{"type":"content_block_stop","index":1}',
  '{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"tu1","name":"Read","input":{}}}',
  '{"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":\\"C:/a.ts\\"}"}}',
  '{"type":"content_block_stop","index":2}',
  '{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":20}}',
]

const finishOf = async (stream: AsyncIterable<unknown>): Promise<Record<string, unknown> | undefined> => {
  let finish: Record<string, unknown> | undefined
  for await (const chunk of stream) if ((chunk as { type: string }).type === 'finish') finish = chunk as Record<string, unknown>
  return finish
}

test('decodeSse carries the thinking signature in the finish replay envelope, one entry per emitted block', async () => {
  assert.deepEqual(await finishOf(decodeSse(sse(SIGNED_RESPONSE), 'glm-5.3')), {
    type: 'finish',
    reason: { kind: 'tool-calls' },
    replayState: { response: { kind: 'glm-zcode', version: 1, model: 'glm-5.3' }, blocks: [{ type: 'reasoning', signature: 'c2lnLTEyMzQ=' }, { type: 'text' }, { type: 'tool-call' }] },
  })
  // No model, no envelope; a response without reasoning has nothing to replay.
  assert.deepEqual(await finishOf(decodeSse(sse(SIGNED_RESPONSE))), { type: 'finish', reason: { kind: 'tool-calls' } })
  const plain = SIGNED_RESPONSE.filter(frame => !frame.includes('"index":0'))
  assert.deepEqual(await finishOf(decodeSse(sse(plain), 'glm-5.3')), { type: 'finish', reason: { kind: 'tool-calls' } })
  // A signature on the start event (some Anthropic-compatible servers) counts; a later delta replaces it.
  const onStart = ['{"type":"content_block_start","index":0,"content_block":{"type":"thinking","signature":"start-sig"}}', '{"type":"content_block_stop","index":0}', '{"type":"message_delta","delta":{"stop_reason":"end_turn"}}']
  assert.deepEqual((await finishOf(decodeSse(sse(onStart), 'glm-5.3')))?.replayState, { response: { kind: 'glm-zcode', version: 1, model: 'glm-5.3' }, blocks: [{ type: 'reasoning', signature: 'start-sig' }] })
  const replaced = [onStart[0], '{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"delta-sig"}}', ...onStart.slice(1)]
  assert.deepEqual((await finishOf(decodeSse(sse(replaced), 'glm-5.3')))?.replayState, { response: { kind: 'glm-zcode', version: 1, model: 'glm-5.3' }, blocks: [{ type: 'reasoning', signature: 'delta-sig' }] })
  // An unsigned thinking block keeps its entry without a signature.
  const unsigned = SIGNED_RESPONSE.filter(frame => !frame.includes('signature_delta'))
  assert.deepEqual(((await finishOf(decodeSse(sse(unsigned), 'glm-5.3')))?.replayState as { blocks: unknown[] }).blocks[0], { type: 'reasoning' })
})

/** Assemble one decoded response with the real rc.3 assembler, as the agent loop stores it. */
async function assembled(frames: readonly string[], route: { provider: string, model: string }): Promise<RequestMessageLike> {
  const assembler = new BlockAssembler()
  for await (const chunk of decodeSse(sse(frames), route.model)) assembler.push(chunk as never)
  const replayState = assembler.replayState
  return assembler.message({ ...route, ...(replayState === undefined ? {} : { replayState }) }) as unknown as RequestMessageLike
}

const nextRequest = (assistant: RequestMessageLike, model: string): AnthropicRequest => encodeRequest({
  provider: 'glm-zcode', model,
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'fix the quotes' }] },
    assistant,
    { role: 'tool', toolCallId: 'tu1', content: [{ type: 'text', text: 'export {}' }] },
  ],
})

test('a stored glm-zcode response replays its reasoning with the signature to the same route only', async () => {
  const assistant = await assembled(SIGNED_RESPONSE, { provider: 'glm-zcode', model: 'glm-5.3' })
  assert.deepEqual(nextRequest(assistant, 'glm-5.3').messages[1], { role: 'assistant', content: [
    { type: 'thinking', thinking: 'quotes are ignored', signature: 'c2lnLTEyMzQ=' },
    { type: 'text', text: 'Reading.' },
    { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'C:/a.ts' } },
  ] })
  // Another model: the signature is model-bound, so the signed reasoning is removed (ZCode removeCrossModelReasoning).
  assert.deepEqual(nextRequest(assistant, 'glm-5.3-flash').messages[1]?.content.map(block => block.type), ['text', 'tool_use'])
})

test('reasoning without usable replay metadata goes back unsigned; empty shells and reasoning-only turns drop', () => {
  const content: RequestMessageLike['content'] = [{ type: 'reasoning', text: 'plan' }, { type: 'text', text: 'ok' }, { type: 'tool-call', id: 'tu1', name: 'Read', arguments: '{}' }]
  const thinkingOf = (assistant: RequestMessageLike): unknown => nextRequest(assistant, 'glm-5.3').messages[1]?.content[0]
  // Another adapter's history (the runtime already stripped its replay state) and a misaligned envelope.
  assert.deepEqual(thinkingOf({ role: 'assistant', content, source: { kind: 'model', provider: 'deepseek-account', model: 'deepseek-flash' } }), { type: 'thinking', thinking: 'plan', signature: '' })
  const misaligned = { response: { kind: 'glm-zcode', version: 1, model: 'glm-5.3' }, blocks: [{ type: 'reasoning', signature: 'sig' }] }
  assert.deepEqual(thinkingOf({ role: 'assistant', content, source: { kind: 'model', provider: 'glm-zcode', model: 'glm-5.3', replayState: misaligned } }), { type: 'thinking', thinking: 'plan', signature: '' })
  const foreignKind = { response: { kind: 'pi-ai', version: 1, model: 'glm-5.3' }, blocks: [{ type: 'reasoning', signature: 'sig' }, { type: 'text' }, { type: 'tool-call' }] }
  assert.equal(replayBlocksOf({ role: 'assistant', content, source: { kind: 'model', provider: 'glm-zcode', model: 'glm-5.3', replayState: foreignKind } }), undefined)
  // An empty unsigned reasoning block is a stream shell; a turn left with reasoning only drops.
  assert.deepEqual(encodeMessage({ role: 'assistant', content: [{ type: 'reasoning', text: '' }, { type: 'text', text: 'x' }] })?.content, [{ type: 'text', text: 'x' }])
  assert.equal(encodeMessage({ role: 'assistant', content: [{ type: 'reasoning', text: 'only' }] }), undefined)
})

test('a request ending in an assistant turn does not end in thinking (ZCode removeTrailingReasoning)', () => {
  const request = encodeRequest({ provider: 'glm-zcode', model: 'glm-5.3', messages: [
    { role: 'user', content: [{ type: 'text', text: 'continue' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'partial' }, { type: 'reasoning', text: 'more' }] },
  ] })
  assert.deepEqual(request.messages.at(-1), { role: 'assistant', content: [{ type: 'text', text: 'partial', cache_control: { type: 'ephemeral' } }] })
})
