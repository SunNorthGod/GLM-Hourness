/**
 * Minimal structural types for the DSH LLM seam (verified against
 * packages/llm/llm/src/types.ts, commit 22ddee37). GLM models: thinking
 * efforts low/high/max per the ZCode training distribution (GLM-5.3 folds
 * "off" into low), default max_tokens 32000.
 */

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
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

export interface RequestMessageLike {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer'
  content: ReadonlyArray<{
    type: string
    text?: string
    id?: string
    name?: string
    arguments?: string
    toolName?: string
  }>
  toolCalls?: ReadonlyArray<{ id: string, name: string, arguments: string }>
  toolCallId?: string
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

export interface ResolvedModelInfoLike {
  provider: string
  id: string
  name: string
  defaultMaxTokens: number
  reasoning: { efforts: ReadonlyArray<{ id: string, name: string, description: string }>, defaultEffort: string }
  systemPromptUpdate: 'in-history'
}

/** GLM thinking efforts in the ZCode distribution: low / high / max. */
export const GLM_REASONING_EFFORTS = [
  { id: 'low', name: 'Low', description: 'Routine or latency-sensitive tasks; also the floor when thinking cannot be disabled.' },
  { id: 'high', name: 'High', description: 'The default balance for most tasks.' },
  { id: 'max', name: 'Max', description: 'Reserve for the hardest quality-first tasks.' },
] as const

/** ZCode default output cap. */
export const GLM_DEFAULT_MAX_TOKENS = 32000
