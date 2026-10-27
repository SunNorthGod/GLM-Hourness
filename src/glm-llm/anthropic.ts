/**
 * Anthropic Messages wire codec for the native ZCode client: encodes DSH LLM
 * seam requests into the upstream Anthropic shape (the ZCode client's own
 * protocol since both plans moved to Anthropic upstreams) and decodes the
 * SSE event stream back into seam stream chunks. GLM models always think;
 * the real client sends no thinking field, so neither does this encoder.
 */
import type { GenerateOptionsLike, RequestMessageLike, StreamChunk, ToolSchemaLike, TokenUsage, FinishReason } from './lm-min.ts'

/** Anthropic Messages request body. */
export interface AnthropicRequest {
  readonly model: string
  readonly max_tokens: number
  readonly stream: true
  readonly system?: ReadonlyArray<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>
  readonly messages: ReadonlyArray<{ role: 'user' | 'assistant', content: unknown }>
  readonly tools?: ReadonlyArray<{ name: string, description: string, input_schema: Record<string, unknown> }>
  readonly temperature?: number
}

/** Encode one seam message into the Anthropic messages array. */
export function encodeMessage(message: RequestMessageLike): { role: 'user' | 'assistant', content: unknown } | undefined {
  if (message.role === 'system' || message.role === 'developer') return undefined // system rides the `system` field
  if (message.role === 'tool') {
    const text = message.content.map(part => part.text ?? '').join('\n')
    return { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.toolCallId ?? '', content: text.length > 0 ? text : '(no output)' }] }
  }
  if (message.role === 'assistant') {
    const blocks: Array<{ type: 'text', text: string } | { type: 'tool_use', id: string, name: string, input: unknown }> = []
    for (const part of message.content) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) blocks.push({ type: 'text', text: part.text })
    }
    for (const call of message.toolCalls ?? []) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: safeParse(call.arguments) })
    }
    if (blocks.length === 0) return undefined
    return { role: 'assistant', content: blocks }
  }
  // user: text parts joined; tool outputs already folded into tool messages
  const text = message.content.map(part => part.text ?? '').join('\n')
  return { role: 'user', content: text.length > 0 ? [{ type: 'text', text }] : [{ type: 'text', text: '' }] }
}

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return {} }
}

/** Encode the full seam request into the upstream Anthropic body. */
export function encodeRequest(options: GenerateOptionsLike, systemBlocks?: ReadonlyArray<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>): AnthropicRequest {
  const messages = options.messages
    .map(encodeMessage)
    .filter((message): message is { role: 'user' | 'assistant', content: unknown } => message !== undefined)
  const request: AnthropicRequest = {
    model: options.model,
    max_tokens: options.maxTokens ?? 32000,
    stream: true,
    messages,
    ...(systemBlocks === undefined || systemBlocks.length === 0 ? {} : { system: systemBlocks }),
    ...(options.tools === undefined || options.tools.length === 0 ? {} : { tools: options.tools.map(encodeTool) }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
  }
  return request
}

function encodeTool(tool: ToolSchemaLike): { name: string, description: string, input_schema: Record<string, unknown> } {
  return { name: tool.name, description: tool.description, input_schema: tool.parameters }
}

interface AnthropicEvent {
  type: string
  index?: number
  content_block?: { type?: string, id?: string, name?: string, text?: string, thinking?: string }
  delta?: { type?: string, text?: string, thinking?: string, partial_json?: string, stop_reason?: string }
  message?: { usage?: WireUsage }
  usage?: WireUsage
}

/** Anthropic usage counters; input excludes the cache counters (disjoint, like DSH TokenUsage). */
interface WireUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

function finishReason(stop: string | undefined): FinishReason {
  switch (stop) {
    case 'tool_use': return { kind: 'tool-calls' }
    case 'max_tokens': return { kind: 'max-tokens' }
    default: return { kind: 'stop' }
  }
}

/**
 * Decode one SSE frame (a `data:` JSON payload) into seam chunks. The decoder
 * aggregates deltas per block index so `block-end` carries the complete
 * block. Usage is not a per-frame chunk: `message_start` and
 * `message_delta` each carry part of it, so `decodeSse` accumulates both
 * and emits one merged `usage` chunk right before `finish`.
 */
export function decodeFrame(frame: unknown): ReadonlyArray<StreamChunk> {
  const event = frame as AnthropicEvent
  switch (event.type) {
    case 'content_block_start': {
      const index = event.index ?? 0
      const block = event.content_block
      if (block?.type === 'text') return [{ type: 'block-start', index, blockType: 'text' }]
      if (block?.type === 'thinking') return [{ type: 'block-start', index, blockType: 'reasoning' }]
      if (block?.type === 'tool_use') {
        return [
          { type: 'block-start', index, blockType: 'tool-call' },
          ...(block.id === undefined ? [] : [{ type: 'tool-call-delta' as const, index, id: block.id, ...(block.name === undefined ? {} : { name: block.name }), argumentsDelta: '' }]),
        ]
      }
      return []
    }
    case 'content_block_delta': {
      const index = event.index ?? 0
      const delta = event.delta
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') return [{ type: 'text-delta', index, text: delta.text }]
      if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') return [{ type: 'reasoning-delta', index, text: delta.thinking }]
      return []
    }
    case 'message_delta': {
      const stop = event.delta?.stop_reason
      return typeof stop === 'string' ? [{ type: 'finish', reason: finishReason(stop) }] : []
    }
    default:
      return []
  }
}

/** Per-block aggregation state while an SSE stream is open. */
interface OpenBlock {
  type: 'text' | 'reasoning' | 'tool-call'
  text: string
  id?: string | undefined
  name?: string | undefined
  arguments: string
}

/** Parse an SSE stream body into seam chunks (aggregating per-block state for `block-end`). */
export async function* decodeSse(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder()
  const openBlocks = new Map<number, OpenBlock>()
  let usage: WireUsage = {}
  let buffer = ''
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true })
    let boundary: number
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary).replace(/\r$/, '')
      buffer = buffer.slice(boundary + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload.length === 0 || payload === '[DONE]') continue
      let frame: unknown
      try { frame = JSON.parse(payload) } catch { continue }
      const event = frame as AnthropicEvent
      if (event.type === 'message_start') usage = accumulateUsage(usage, event.message?.usage)
      if (event.type === 'message_delta') {
        usage = accumulateUsage(usage, event.usage)
        const merged = toTokenUsage(usage)
        if (merged !== undefined) yield { type: 'usage', usage: merged }
      }
      if (event.type === 'content_block_start') {
        const index = event.index ?? 0
        const type = event.content_block?.type
        if (type === 'text') openBlocks.set(index, { type: 'text', text: '', arguments: '' })
        else if (type === 'thinking') openBlocks.set(index, { type: 'reasoning', text: '', arguments: '' })
        else if (type === 'tool_use') {
          openBlocks.set(index, { type: 'tool-call', text: '', id: event.content_block?.id, name: event.content_block?.name, arguments: '' })
        }
      }
      if (event.type === 'content_block_delta') {
        const index = event.index ?? 0
        const block = openBlocks.get(index)
        if (block !== undefined) {
          if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') block.text += event.delta.text
          if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') block.text += event.delta.thinking
          if (event.delta?.type === 'input_json_delta' && typeof event.delta.partial_json === 'string') block.arguments += event.delta.partial_json
        }
      }
      if (event.type === 'content_block_stop') {
        const index = event.index ?? 0
        const block = openBlocks.get(index)
        if (block !== undefined) {
          openBlocks.delete(index)
          yield { type: 'block-end', index, block: block.type === 'tool-call' ? { type: 'tool-call', id: block.id ?? '', name: block.name ?? '', arguments: block.arguments } as const : block.type === 'reasoning' ? { type: 'reasoning', text: block.text } as const : { type: 'text', text: block.text } as const }
        }
        continue
      }
      for (const chunk of decodeFrame(frame)) yield chunk
    }
  }
}

/** Fold one event's usage counters into the running totals (later non-empty values win). */
function accumulateUsage(total: WireUsage, next: WireUsage | undefined): WireUsage {
  if (next === undefined) return total
  return {
    ...total,
    ...(next.input_tokens === undefined ? {} : { input_tokens: next.input_tokens }),
    ...(next.output_tokens === undefined ? {} : { output_tokens: next.output_tokens }),
    ...(next.cache_read_input_tokens === undefined ? {} : { cache_read_input_tokens: next.cache_read_input_tokens }),
    ...(next.cache_creation_input_tokens === undefined ? {} : { cache_creation_input_tokens: next.cache_creation_input_tokens }),
  }
}

/** The merged DSH usage record, or undefined when the stream reported no counters. */
export function toTokenUsage(usage: WireUsage): TokenUsage | undefined {
  if (usage.input_tokens === undefined && usage.output_tokens === undefined) return undefined
  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  const cacheReadTokens = usage.cache_read_input_tokens
  const cacheWriteTokens = usage.cache_creation_input_tokens
  return {
    inputTokens,
    outputTokens,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    totalTokens: inputTokens + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) + outputTokens,
  }
}