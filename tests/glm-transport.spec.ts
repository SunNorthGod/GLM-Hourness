import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLlmIdentityHeaders, buildContextIdentityHeaders, ensureDeviceMid, DEFAULT_IDENTITY, ZCODE_APP_VERSION } from '../src/glm-llm/identity.ts'
import { buildAuthHeaders, buildTraceHeaders, ANTHROPIC_SDK_UA } from '../src/glm-llm/headers.ts'
import { encodeRequest, encodeMessage, decodeFrame, decodeSse } from '../src/glm-llm/anthropic.ts'
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
  // rc.3 carries tool calls as tool-call content blocks; reasoning is not sent back.
  assert.deepEqual(
    encodeMessage({ role: 'assistant', content: [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'hi' },
      { type: 'tool-call', id: 'c1', name: 'Grep', arguments: '{"q":1}' },
      { type: 'tool-call', id: 'c2', name: 'Read', arguments: 'not json' },
    ] }),
    { role: 'assistant', content: [
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
      { type: 'text', text: '<system-reminder>\nnotice\n</system-reminder>' },
    ] },
  ])
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
    { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: '<system-reminder>\nlater\n</system-reminder>' }] },
  ])
  assert.deepEqual(request.tools, [{ name: 'TodoWrite', description: 'd', input_schema: { type: 'object' } }])
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
