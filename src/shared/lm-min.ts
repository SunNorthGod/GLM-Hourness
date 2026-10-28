/**
 * Minimal structural types for the DSH LLM message and stream vocabulary,
 * part of the thin adapter layer with src/shared/dsh-min.ts (verified against
 * the rc.3 runtime: reference/dsh-desktop-0.2.1-rc.3/dsh-llm and the official
 * @deepseek-ai/dsh-llm 0.2.1-rc.3 types; docs/DESIGN.md §2.4a). The channel
 * adapter, the usage journal and the compaction mirror read these.
 */
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'

/** DSH usage record: counts are disjoint (inputTokens excludes cache reads and writes). */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export type FinishReason =
  | { kind: 'stop' }
  | { kind: 'tool-calls' }
  | { kind: 'max-tokens' }
  | { kind: 'aborted', failure: { message: string } }
  | { kind: 'error', failure: { message: string } }

export type StreamChunk =
  | { type: 'block-start'; index: number; blockType: 'text' | 'reasoning' | 'tool-call' }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: { type: 'text', text: string } | { type: 'reasoning', text: string } | { type: 'tool-call', id: string, name: string, arguments: string } }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: ReplayEnvelopeLike }

/**
 * Adapter-private replay metadata on a terminal `finish` chunk (dsh-llm
 * `ReplayEnvelope`): `blocks` holds one entry per emitted block in
 * first-seen order; the assembler stores the envelope on the assistant
 * message's source and drops it when the entries do not align.
 */
interface ReplayEnvelopeLike {
  response: unknown
  blocks?: readonly unknown[]
}

export interface ToolSchemaLike {
  name: string
  description: string
  parameters: Record<string, unknown>
  deferLoading?: true
}

/** Durable normalized image reference (dsh-attachment `ImageAttachmentRef`): the fields the channel reads. */
export interface ImageRefLike {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

/** Route-chosen request version bounds (dsh-attachment `ImageRequestTarget`). */
export interface ImageTarget {
  width: number
  height: number
  maxBytes: number
}

/** The attachment service members the channel uses (dsh-attachment `AttachmentStore`). */
export interface AttachmentsLike {
  readImageRequest(ref: ImageRefLike, target: ImageTarget, signal?: AbortSignal): Promise<{ data: Uint8Array, mediaType: string }>
  imageHostPath(ref: ImageRefLike): string | undefined
}

/**
 * Compile-time contract check against the installed @deepseek-ai/dsh-attachment
 * types: the attachment service offers the members above with compatible
 * signatures.
 */
export type AttachmentsContractCheck = AttachmentStore extends AttachmentsLike ? true : never
/** Referenced so the conditional type is evaluated by tsc. */
const attachmentsContractCheck: AttachmentsContractCheck = true
void attachmentsContractCheck

/**
 * The rc.3 content blocks an adapter receives (dsh-llm `ContentBlockMap`).
 * Assistant tool calls are `tool-call` blocks in the content, not a separate
 * field. Images are durable references (`offloaded` marks an occurrence every
 * route sends as placeholder text). File blocks never reach an adapter (the
 * runtime projects them to text); other block types fall through unread.
 */
export type ContentBlockLike =
  | { type: 'text', text: string }
  | { type: 'reasoning', text: string }
  | { type: 'image', attachment: ImageRefLike, offloaded?: true }
  | { type: 'tool-call', id: string, name: string, arguments: string }

export interface RequestMessageLike {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer'
  content: readonly ContentBlockLike[]
  /**
   * Assistant messages: the route that produced them and its replay
   * metadata (dsh-llm `ModelMessageSource`). The runtime strips `replayState`
   * when another adapter owns the historical provider (rc.3 dsh-llm
   * `LlmRuntime.forAdapter`).
   */
  source?: { kind: string, provider?: string, model?: string, replayState?: unknown }
  /** Tool-role messages: the provider-issued id of the call this result answers. */
  toolCallId?: string
  /** Tool-role messages: whether the invocation failed. */
  isError?: boolean
}

/** The concatenated text blocks of one message, in order. */
export function messageText(message: Pick<RequestMessageLike, 'content'>, separator: string): string {
  return message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(separator)
}

export interface GenerateOptionsLike {
  provider: string
  model: string
  reasoningEffort?: string
  messages: readonly RequestMessageLike[]
  system?: string
  tools?: readonly ToolSchemaLike[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}
