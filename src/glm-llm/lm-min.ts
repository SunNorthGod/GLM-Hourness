/**
 * Minimal structural types for the DSH LLM seam (verified against the rc.3
 * runtime: reference/dsh-desktop-0.2.1-rc.3/dsh-llm and the official
 * @deepseek-ai/dsh-llm 0.2.1-rc.3 types). GLM models: thinking efforts
 * low/high/max per the ZCode training distribution (GLM-5.3 folds "off" into
 * low), default max_tokens 32000.
 */

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
  | { type: 'finish'; reason: FinishReason }

export interface ToolSchemaLike {
  name: string
  description: string
  parameters: Record<string, unknown>
  deferLoading?: true
}

/**
 * The rc.3 content blocks an adapter receives (dsh-llm `ContentBlockMap`).
 * Assistant tool calls are `tool-call` blocks in the content, not a separate
 * field. File blocks never reach an adapter (the runtime projects them to
 * text); other block types fall through unread.
 */
export type ContentBlockLike =
  | { type: 'text', text: string }
  | { type: 'reasoning', text: string }
  | { type: 'tool-call', id: string, name: string, arguments: string }

export interface RequestMessageLike {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer'
  content: readonly ContentBlockLike[]
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

/** GLM thinking efforts in the ZCode distribution: low / high / max. */
export const GLM_REASONING_EFFORTS = [
  { id: 'low', name: 'Low', description: 'Routine or latency-sensitive tasks; also the floor when thinking cannot be disabled.' },
  { id: 'high', name: 'High', description: 'The default balance for most tasks.' },
  { id: 'max', name: 'Max', description: 'Reserve for the hardest quality-first tasks.' },
] as const

/** ZCode default output cap. */
export const GLM_DEFAULT_MAX_TOKENS = 32000
