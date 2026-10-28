/**
 * Anthropic Messages wire codec for the native ZCode client: encodes DSH LLM
 * seam requests into the upstream Anthropic shape (the ZCode client's own
 * protocol since both plans moved to Anthropic upstreams) and decodes the
 * SSE event stream back into seam stream chunks. On coding-plan the body
 * follows 3.16.3 (`WireShape`): the official model casing, its key order,
 * and the catalog's option map, which for the GLM-5.3 family appends
 * `thinking: {type: "enabled"}` and `output_config: {effort}`
 * (docs/DESIGN.md §4.5). Thinking blocks carry signatures; the decoder
 * stores them as replay metadata and the encoder sends the reasoning back
 * (docs/DESIGN.md §4.5c).
 */
import { messageText, type ContentBlockLike, type GenerateOptionsLike, type RequestMessageLike, type StreamChunk, type ToolSchemaLike, type TokenUsage, type FinishReason } from '../shared/lm-min.ts'
import type { RequestImages } from './images.ts'

/** Anthropic text block. */
type WireText = { type: 'text', text: string }
/** Anthropic base64 image block, the shape ZCode's AI SDK Anthropic provider emits. */
type WireImageBlock = { type: 'image', source: { type: 'base64', media_type: string, data: string } }

/** Anthropic thinking block as replayed in history; `signature` is '' for unsigned reasoning (ZCode's empty-signature form). */
type WireThinking = { type: 'thinking', thinking: string, signature: string }

/** One Anthropic content block the encoder emits; any block may carry the cache breakpoint. */
export type WireBlock = (
  | WireText
  | WireImageBlock
  | WireThinking
  | { type: 'tool_use', id: string, name: string, input: unknown }
  | { type: 'tool_result', tool_use_id: string, content: string | Array<WireText | WireImageBlock>, is_error?: true }
) & { cache_control?: { type: 'ephemeral' } }

/** The route one request targets: replayed signatures must come from the same one. */
export interface TargetRoute {
  readonly provider: string
  readonly model: string
}

/** Per-block replay metadata of one glm-zcode response, in emitted block order. */
export type ReplayBlock =
  | { type: 'text' }
  | { type: 'reasoning', signature?: string }
  | { type: 'tool-call' }

/** The kind and version tag of this channel's replay envelope. */
const REPLAY_KIND = 'glm-zcode'
const REPLAY_VERSION = 1

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The replay entries of one assistant message when they are this channel's
 * and still align with its content (the shape DSH's own deepseek-messages
 * adapter validates, rc.3 dsh-llm-deepseek `validateReplay`): kind and
 * version, the model of the source, one entry per content block with the
 * same type, signatures only on reasoning. Anything else is unusable and
 * the message is encoded without signatures.
 */
export function replayBlocksOf(message: RequestMessageLike): readonly ReplayBlock[] | undefined {
  const source = message.source
  if (source?.kind !== 'model' || !isRecord(source.replayState)) return undefined
  const { response, blocks } = source.replayState
  if (!isRecord(response) || response.kind !== REPLAY_KIND || response.version !== REPLAY_VERSION || response.model !== source.model) return undefined
  if (!Array.isArray(blocks) || blocks.length !== message.content.length) return undefined
  const entries: ReplayBlock[] = []
  for (const [index, entry] of (blocks as unknown[]).entries()) {
    const type = message.content[index]?.type
    if (!isRecord(entry) || entry.type !== type || (type !== 'text' && type !== 'reasoning' && type !== 'tool-call')) return undefined
    if (entry.signature !== undefined && (type !== 'reasoning' || typeof entry.signature !== 'string')) return undefined
    entries.push(type === 'reasoning' ? { type, ...(typeof entry.signature === 'string' ? { signature: entry.signature } : {}) } : { type })
  }
  return entries
}

/** One Anthropic message. */
export interface WireMessage {
  role: 'user' | 'assistant'
  content: WireBlock[]
}

/** Anthropic Messages request body. */
export interface AnthropicRequest {
  readonly model: string
  readonly max_tokens: number
  readonly stream?: true
  readonly system?: ReadonlyArray<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>
  readonly messages: readonly WireMessage[]
  readonly tools?: ReadonlyArray<{ name: string, description: string, input_schema: Record<string, unknown> }>
  readonly tool_choice?: { readonly type: 'auto' }
  readonly temperature?: number
  /** The device/session blob ZCode attaches to every Anthropic request (see `metadataUserId`). */
  readonly metadata?: { readonly user_id: string }
  readonly [option: string]: unknown
}

/**
 * The 3.16.3 body of a coding-plan request: the wire model id, `max_tokens`,
 * whether it streams (`streamText`; `generateText` sends no `stream`), and
 * the catalog option map merged onto the body last.
 */
export interface WireShape {
  readonly model: string
  readonly maxTokens: number
  readonly stream: boolean
  readonly optionPatch?: Readonly<Record<string, unknown>> | undefined
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `mergeObject` (`Zpr` @547735), the merge of 3.16.3 model option maps
 * (`applyOrderedJsonMergePatches` `Jpr` @547136): key by key onto a copy,
 * objects merge recursively, `null` deletes, new keys go last.
 */
function mergeOptionPatch(body: Record<string, unknown>, patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...body }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else if (isPlainObject(value)) merged[key] = mergeOptionPatch(isPlainObject(merged[key]) ? merged[key] : {}, value)
    else merged[key] = value
  }
  return merged
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
export function encodeMessage(message: RequestMessageLike, images?: RequestImages, route?: TargetRoute): WireMessage | undefined {
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
  if (message.role === 'assistant') return encodeAssistant(message, route)
  const blocks = userSideBlocks(message.content, images)
  return { role: 'user', content: blocks.length > 0 ? blocks : [{ type: 'text', text: EMPTY_USER_CONTENT_FALLBACK }] }
}

/**
 * One assistant message: rc.3 carries tool calls as `tool-call` content
 * blocks; reasoning goes back as thinking blocks in stream order (preserved
 * thinking, docs/DESIGN.md §4.5c), following ZCode's history normalization
 * (3.16.3 adapters reasoning-history-normalization, anthropic-reasoning-metadata):
 * - a signature replays only to the route that issued it (same provider and
 *   model; signatures are model-bound), and signed reasoning from another
 *   route is removed;
 * - unsigned reasoning goes back with the empty signature;
 * - an empty reasoning block without a signature is a stream shell and drops;
 * - a message left with reasoning only (no text, no tool call) drops.
 */
function encodeAssistant(message: RequestMessageLike, route: TargetRoute | undefined): WireMessage | undefined {
  const replay = replayBlocksOf(message)
  const sameRoute = route !== undefined && message.source?.provider === route.provider && message.source.model === route.model
  const blocks: WireBlock[] = []
  for (const [index, block] of message.content.entries()) {
    if (block.type === 'text' && block.text.length > 0) blocks.push({ type: 'text', text: block.text })
    else if (block.type === 'tool-call') blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: safeParse(block.arguments) })
    else if (block.type === 'reasoning') {
      const entry = replay?.[index]
      const signature = entry?.type === 'reasoning' ? entry.signature ?? '' : ''
      if (signature.length > 0 && !sameRoute) continue
      if (block.text.length === 0 && signature.length === 0) continue
      blocks.push({ type: 'thinking', thinking: block.text, signature })
    }
  }
  return blocks.some(block => block.type !== 'thinking') ? { role: 'assistant', content: blocks } : undefined
}

/** Remove the thinking blocks that end a trailing assistant message (ZCode `removeTrailingReasoning`). */
function dropTrailingThinking(messages: WireMessage[]): void {
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return
  while (last.content.at(-1)?.type === 'thinking') last.content.pop()
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
 * The last message's last block carries the cache breakpoint. With `wire`
 * (coding-plan) the body is the one the AI SDK inside 3.16.3 sends
 * (`getArgs` @3603239): `model, max_tokens, [temperature], metadata,
 * system, messages, tools, tool_choice, stream`, undefined fields left out,
 * `tool_choice: {type: "auto"}` with any tools (`prepareToolsAndToolChoice`
 * `nro` @3929119, `prepareTools` `Jjs` @3543299), then the option map
 * (`createModelOptionMapFetch` `TQr` @3836714). Without it the earlier shape
 * stays (start-plan, the probe provider).
 */
export function encodeRequest(options: GenerateOptionsLike, systemBlocks?: ReadonlyArray<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>, images?: RequestImages, userId?: string, wire?: WireShape): AnthropicRequest {
  // Leading system messages belong to `systemBlocks` (see splitSystemPrompt).
  const route: TargetRoute = { provider: options.provider, model: options.model }
  const messages = groupTurns(splitSystemPrompt(options).messages
    .map(message => encodeMessage(message, images, route))
    .filter((message): message is WireMessage => message !== undefined))
  dropTrailingThinking(messages)
  markLastMessage(messages)
  const system = systemBlocks === undefined || systemBlocks.length === 0 ? undefined : systemBlocks
  const tools = options.tools === undefined || options.tools.length === 0 ? undefined : options.tools.map(encodeTool)
  if (wire !== undefined) {
    const body: Record<string, unknown> = {
      model: wire.model,
      max_tokens: wire.maxTokens,
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(userId === undefined ? {} : { metadata: { user_id: userId } }),
      ...(system === undefined ? {} : { system }),
      messages,
      ...(tools === undefined ? {} : { tools, tool_choice: { type: 'auto' } }),
      ...(wire.stream ? { stream: true } : {}),
    }
    return (wire.optionPatch === undefined ? body : mergeOptionPatch(body, wire.optionPatch)) as AnthropicRequest
  }
  const request: AnthropicRequest = {
    model: options.model,
    max_tokens: options.maxTokens ?? 32000,
    stream: true,
    messages,
    ...(system === undefined ? {} : { system }),
    ...(tools === undefined ? {} : { tools }),
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
  content_block?: { type?: string, id?: string, name?: string, text?: string, thinking?: string, signature?: string }
  delta?: { type?: string, text?: string, thinking?: string, signature?: string, partial_json?: string, stop_reason?: string }
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

/** Per-block aggregation state while an SSE stream is open; `replay` is the block's entry in the replay envelope. */
interface OpenBlock {
  type: 'text' | 'reasoning' | 'tool-call'
  text: string
  id?: string | undefined
  name?: string | undefined
  arguments: string
  replay: ReplayBlock
  /** The signature so far came from the start event; a signature_delta replaces it instead of extending it. */
  startSignature?: boolean
}

/**
 * The response usage in ZCode's token shape, the baseline of the next
 * request's `max_tokens` estimate (token-budget.ts): `input` is the whole
 * prompt with cache reads and writes, as the AI SDK Anthropic provider
 * counts it (`EZr` @3549947: input plus cache creation plus cache read).
 */
function zcodeTokens(usage: WireUsage): { input: number, output: number, total: number, cache: { read: number, write: number } } | undefined {
  if (usage.input_tokens === undefined && usage.output_tokens === undefined) return undefined
  const read = usage.cache_read_input_tokens ?? 0
  const write = usage.cache_creation_input_tokens ?? 0
  const input = (usage.input_tokens ?? 0) + read + write
  const output = usage.output_tokens ?? 0
  return { input, output, total: input + output, cache: { read, write } }
}

/**
 * The finish chunk of one response: with `model` known it carries the
 * replay envelope (one entry per emitted block, in first-seen order; a
 * reasoning entry holds its non-empty signature) and, when the response
 * reported counters, its usage in ZCode's token shape.
 */
function finishChunk(stop: string, model: string | undefined, replay: readonly ReplayBlock[], usage: WireUsage): StreamChunk {
  const reason = finishReason(stop)
  if (model === undefined) return { type: 'finish', reason }
  const blocks = replay.map(entry => entry.type === 'reasoning' && entry.signature !== undefined && entry.signature.length === 0 ? { type: 'reasoning' as const } : { ...entry })
  const tokens = zcodeTokens(usage)
  return { type: 'finish', reason, replayState: { response: { kind: REPLAY_KIND, version: REPLAY_VERSION, model, ...(tokens === undefined ? {} : { usage: tokens }) }, blocks } }
}

/**
 * Parse an SSE stream body into seam chunks (aggregating per-block state for
 * `block-end`). `model` is the requested model the replay envelope names;
 * without it no envelope is emitted.
 */
export async function* decodeSse(body: ReadableStream<Uint8Array>, model?: string): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder()
  const openBlocks = new Map<number, OpenBlock>()
  const replay: ReplayBlock[] = []
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
        const stop = event.delta?.stop_reason
        if (typeof stop === 'string') yield finishChunk(stop, model, replay, usage)
        continue
      }
      if (event.type === 'content_block_start') {
        const index = event.index ?? 0
        const start = event.content_block
        const open = (block: Omit<OpenBlock, 'text' | 'arguments'>): void => {
          openBlocks.set(index, { text: '', arguments: '', ...block })
          replay.push(block.replay)
        }
        if (start?.type === 'text') open({ type: 'text', replay: { type: 'text' } })
        // Some Anthropic-compatible servers put the final signature on the
        // start event instead of a signature_delta (ZCode anthropic-stream-compat).
        else if (start?.type === 'thinking') {
          const signature = typeof start.signature === 'string' ? start.signature : ''
          open({ type: 'reasoning', replay: { type: 'reasoning', signature }, startSignature: signature.length > 0 })
        }
        else if (start?.type === 'tool_use') open({ type: 'tool-call', id: start.id, name: start.name, replay: { type: 'tool-call' } })
      }
      if (event.type === 'content_block_delta') {
        const index = event.index ?? 0
        const block = openBlocks.get(index)
        if (block !== undefined) {
          if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') block.text += event.delta.text
          if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') block.text += event.delta.thinking
          if (event.delta?.type === 'input_json_delta' && typeof event.delta.partial_json === 'string') block.arguments += event.delta.partial_json
          if (event.delta?.type === 'signature_delta' && typeof event.delta.signature === 'string' && block.replay.type === 'reasoning') {
            block.replay.signature = (block.startSignature === true ? '' : block.replay.signature ?? '') + event.delta.signature
            block.startSignature = false
          }
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