/**
 * Anthropic Messages wire codec for the native ZCode client: encodes DSH LLM
 * seam requests into the upstream Anthropic shape (the ZCode client's own
 * protocol since both plans moved to Anthropic upstreams) and decodes the
 * SSE event stream back into seam stream chunks. GLM models always think;
 * the real client sends no thinking field, so neither does this encoder.
 */
import { messageText, type ContentBlockLike, type GenerateOptionsLike, type RequestMessageLike, type StreamChunk, type ToolSchemaLike, type TokenUsage, type FinishReason } from '../shared/lm-min.ts'
import type { RequestImages } from './images.ts'

/** Anthropic text block. */
type WireText = { type: 'text', text: string }
/** Anthropic base64 image block, the shape ZCode's AI SDK Anthropic provider emits. */
type WireImageBlock = { type: 'image', source: { type: 'base64', media_type: string, data: string } }

/** One Anthropic content block the encoder emits; any block may carry the cache breakpoint. */
export type WireBlock = (
  | WireText
  | WireImageBlock
  | { type: 'tool_use', id: string, name: string, input: unknown }
  | { type: 'tool_result', tool_use_id: string, content: string | Array<WireText | WireImageBlock>, is_error?: true }
) & { cache_control?: { type: 'ephemeral' } }

/** One Anthropic message. */
export interface WireMessage {
  role: 'user' | 'assistant'
  content: WireBlock[]
}

/** Anthropic Messages request body. */
export interface AnthropicRequest {
  readonly model: string
  readonly max_tokens: number
  readonly stream: true
  readonly system?: ReadonlyArray<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>
  readonly messages: readonly WireMessage[]
  readonly tools?: ReadonlyArray<{ name: string, description: string, input_schema: Record<string, unknown> }>
  readonly temperature?: number
  /** The device/session blob ZCode attaches to every Anthropic request (see `metadataUserId`). */
  readonly metadata?: { readonly user_id: string }
}

/**
 * `metadata.user_id` as ZCode 3.16.3 builds it for every Anthropic-kind
 * request on both plans (adapters anthropic-request-metadata
 * `createAnthropicRequestMetadataUserId`): the deviceMid, an always-empty
 * account uuid, and the upstream session id. An unknown deviceMid leaves
 * the key out, as JSON.stringify does there.
 */
export function metadataUserId(deviceMid: string | undefined, sessionId: string): string {
  return JSON.stringify({ device_id: deviceMid, account_uuid: '', session_id: sessionId })
}

/** One Anthropic cache breakpoint. */
const EPHEMERAL = { type: 'ephemeral' } as const

/**
 * Mark the last content block of the last message as a cache breakpoint,
 * the message half of ZCode's placement (core
 * `finalizeLatestNonSystemMessageCacheControl`, serialized by the AI SDK
 * Anthropic provider onto the message's last part). The BigModel cache is
 * implicit and the marker did not change the hits measured on 2026-10-28
 * (docs/DESIGN.md §4.5b); it is sent for wire parity.
 */
function markLastMessage(messages: WireMessage[]): void {
  const last = messages.at(-1)?.content.at(-1)
  if (last !== undefined) last.cache_control = EPHEMERAL
}

/** ZCode's wire fallback for a user turn without content (3.16.3 bundle, `toAiSdkUserContent`). */
const EMPTY_USER_CONTENT_FALLBACK = '(no content)'

/**
 * Split the DSH request into the Anthropic system text and the remaining
 * history. DSH delivers the system prompt as leading `system` messages
 * (not `GenerateOptions.system`); the request-level text and every leading
 * system message join, in order, into the top-level `system` field — the
 * same rule as DSH's own pi-ai adapter.
 */
export function splitSystemPrompt(options: Pick<GenerateOptionsLike, 'system' | 'messages'>): { system: string, messages: readonly RequestMessageLike[] } {
  const parts = options.system === undefined ? [] : [options.system]
  let end = 0
  for (const message of options.messages) {
    if (message.role !== 'system') break
    parts.push(messageText(message, ''))
    end += 1
  }
  return { system: parts.filter(part => part.length > 0).join('\n\n'), messages: options.messages.slice(end) }
}

/** Wrap harness text in the `<system-reminder>` envelope GLM reads mid-conversation (ZCode format). */
function systemReminder(text: string): string {
  return ['<system-reminder>', text, '</system-reminder>'].join('\n')
}

/** Text and image blocks of user-side content in order; empty text drops (ZCode transform). */
function userSideBlocks(content: readonly ContentBlockLike[], images: RequestImages | undefined): Array<WireText | WireImageBlock> {
  const blocks: Array<WireText | WireImageBlock> = []
  for (const block of content) {
    if (block.type === 'text' && block.text.length > 0) blocks.push({ type: 'text', text: block.text })
    else if (block.type === 'image') blocks.push(imageBlock(block, images))
  }
  return blocks
}

/** One image occurrence on the wire: the prepared request version, or DSH's placeholder when offloaded. */
function imageBlock(block: Extract<ContentBlockLike, { type: 'image' }>, images: RequestImages | undefined): WireText | WireImageBlock {
  if (images === undefined) throw new Error('glm-zcode: request images were not prepared')
  if (block.offloaded === true) return { type: 'text', text: images.offloadedText(block.attachment) }
  const version = images.versions.get(block.attachment.attachmentId)
  if (version === undefined) throw new Error(`glm-zcode: no request version for image ${block.attachment.attachmentId}`)
  return { type: 'image', source: { type: 'base64', media_type: version.mediaType, data: version.data } }
}

/**
 * Encode one seam message into an Anthropic message. Content blocks keep
 * their order; empty text blocks are dropped, as ZCode's transform does.
 * Images in user and tool messages need `images` (prepareRequestImages);
 * a tool result with an image carries block content inside `tool_result`,
 * the placement ZCode uses for Anthropic routes.
 */
export function encodeMessage(message: RequestMessageLike, images?: RequestImages): WireMessage | undefined {
  if (message.role === 'system' || message.role === 'developer') {
    // A system or developer message after the leading prompt is harness
    // context; Anthropic has no mid-conversation system role, so it rides a
    // user turn as a system reminder.
    const text = messageText(message, '\n').trim()
    return text.length === 0 ? undefined : { role: 'user', content: [{ type: 'text', text: systemReminder(text) }] }
  }
  if (message.role === 'tool') {
    const text = messageText(message, '\n')
    const withImages = message.isError !== true && message.content.some(block => block.type === 'image')
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        // Text-only results go as one string; ZCode sends failed results as
        // error text with is_error set.
        content: withImages ? userSideBlocks(message.content, images) : text.length > 0 ? text : '(no output)',
        ...(message.isError === true ? { is_error: true } : {}),
      }],
    }
  }
  if (message.role === 'assistant') {
    // rc.3 carries tool calls as `tool-call` content blocks; reasoning has no
    // replayable signature on this channel and is not sent back.
    const blocks: WireBlock[] = []
    for (const block of message.content) {
      if (block.type === 'text' && block.text.length > 0) blocks.push({ type: 'text', text: block.text })
      else if (block.type === 'tool-call') blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: safeParse(block.arguments) })
    }
    return blocks.length === 0 ? undefined : { role: 'assistant', content: blocks }
  }
  const blocks = userSideBlocks(message.content, images)
  return { role: 'user', content: blocks.length > 0 ? blocks : [{ type: 'text', text: EMPTY_USER_CONTENT_FALLBACK }] }
}

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return {} }
}

/**
 * Merge consecutive same-role messages into one turn, as the AI SDK
 * Anthropic provider under ZCode does (tool results and the user content
 * that follows them share one user message; parallel tool results land in
 * the single user turn after the assistant's tool_use blocks).
 */
function groupTurns(messages: readonly WireMessage[]): WireMessage[] {
  const grouped: WireMessage[] = []
  for (const message of messages) {
    const last = grouped.at(-1)
    if (last !== undefined && last.role === message.role) last.content.push(...message.content)
    else grouped.push({ role: message.role, content: [...message.content] })
  }
  return grouped
}

/**
 * Encode the full seam request into the upstream Anthropic body; `images`
 * comes from prepareRequestImages, `metadataUserId` from `metadataUserId()`.
 * The last message's last block carries the cache breakpoint.
 */
export function encodeRequest(options: GenerateOptionsLike, systemBlocks?: ReadonlyArray<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>, images?: RequestImages, userId?: string): AnthropicRequest {
  // Leading system messages belong to `systemBlocks` (see splitSystemPrompt).
  const messages = groupTurns(splitSystemPrompt(options).messages
    .map(message => encodeMessage(message, images))
    .filter((message): message is WireMessage => message !== undefined))
  markLastMessage(messages)
  const request: AnthropicRequest = {
    model: options.model,
    max_tokens: options.maxTokens ?? 32000,
    stream: true,
    messages,
    ...(systemBlocks === undefined || systemBlocks.length === 0 ? {} : { system: systemBlocks }),
    ...(options.tools === undefined || options.tools.length === 0 ? {} : { tools: options.tools.map(encodeTool) }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(userId === undefined ? {} : { metadata: { user_id: userId } }),
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