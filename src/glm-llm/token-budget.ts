/**
 * `max_tokens` of a coding-plan request as ZCode 3.16.3 picks it
 * (docs/DESIGN.md §4.6). Offsets are characters in the pristine 3.16.3
 * bundle.
 *
 * - An agent step: `resolveModelStepMaxOutputTokens` (`aUo` @13215830) over
 *   the baseline `resolveNormalRequestMaxOutputTokens` (`VZ` @13215775, the
 *   catalog maximum, else 32000) and the context window minus the estimated
 *   current usage minus 1000.
 * - Compaction: `min(VZ(max), 20000, max)` (`p3a` @13395552, `I0t`).
 * - Auxiliary requests (the session title): `min(5000, max)`
 *   (`auxiliaryModelOptions` `PP` @7759001).
 *
 * The usage estimate is `estimateCurrentContextUsage` (`uzo` @13313841): the
 * latest assistant message with provider usage is the baseline (`CDn`
 * @13313415, `d5o` @13260048, `Xgt` @4979924) and the messages after it are
 * estimated at three characters per token (`TP` @5067698, `ere`). ZCode
 * reads that usage from its session entries; the channel reads it from the
 * replay envelope its decoder writes on each response (anthropic.ts), the
 * closest input DSH offers (docs/DESIGN.md §4.8).
 */
import type { ContentBlockLike, RequestMessageLike } from '../shared/lm-min.ts'

/** `Yja`: the step baseline without a catalog maximum. */
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000
/** `I0t`: the compaction cap. */
const COMPACT_MAX_OUTPUT_TOKENS = 20_000
/** `PP`: the auxiliary cap. */
const AUXILIARY_MAX_OUTPUT_TOKENS = 5_000
/** `aUo`: headroom kept free of the context window. */
const CONTEXT_HEADROOM_TOKENS = 1_000
/** `ere`: characters per estimated token. */
const CHARS_PER_TOKEN = 3

/** `Qja`: a positive finite count, floored; anything else is undefined. */
function positiveCount(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? undefined : Math.floor(value)
}

/** `VZ`: the catalog maximum, else 32000. */
function normalMaxOutputTokens(modelMax: number | undefined): number {
  return positiveCount(modelMax) ?? DEFAULT_MAX_OUTPUT_TOKENS
}

/** `aUo`: the baseline, clipped to the context window minus the usage minus 1000 when that leaves room. */
export function stepMaxOutputTokens(input: { readonly baseline: number, readonly contextWindow: number | undefined, readonly estimatedCurrentUsage: number }): number {
  const { baseline, contextWindow, estimatedCurrentUsage } = input
  if (contextWindow === undefined || !Number.isFinite(contextWindow) || contextWindow <= 0 || !Number.isFinite(estimatedCurrentUsage) || estimatedCurrentUsage < 0) return baseline
  const room = Math.floor(contextWindow - estimatedCurrentUsage - CONTEXT_HEADROOM_TOKENS)
  return room <= 0 ? baseline : Math.min(baseline, room)
}

/** The three request kinds with their 3.16.3 caps, for a catalog maximum `modelMax`. */
export function maxOutputTokensFor(kind: 'step' | 'compaction' | 'auxiliary', modelMax: number, contextWindow: number, messages: readonly RequestMessageLike[]): number {
  if (kind === 'auxiliary') return Math.min(AUXILIARY_MAX_OUTPUT_TOKENS, modelMax)
  if (kind === 'compaction') return Math.min(Math.min(normalMaxOutputTokens(modelMax), COMPACT_MAX_OUTPUT_TOKENS), modelMax)
  return stepMaxOutputTokens({ baseline: normalMaxOutputTokens(modelMax), contextWindow, estimatedCurrentUsage: estimateCurrentUsage(messages) })
}

/** One content block as `TP` counts it (`jda` with `tsn` @1317782): text and reasoning as written, an image as `[Attached <type>]`. */
function blockText(block: ContentBlockLike): string {
  switch (block.type) {
    case 'text':
    case 'reasoning':
      return block.text
    case 'image':
      return `[Attached ${block.attachment.mediaType}]`
    default:
      return ''
  }
}

/** `stringifyToolInput` (`Fda` @5067856): the JSON of the parsed input, `{}` when it does not parse. */
function toolInputText(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw) ?? {}) ?? '{}' } catch { return '{}' }
}

/**
 * `estimateMessageTokens` (`TP`): per message, the joined block text plus
 * each tool call's name and input JSON, three characters per token, rounded
 * up. DSH tool calls are `tool-call` blocks; ZCode keeps them in `toolCalls`.
 */
export function estimateMessageTokens(messages: readonly RequestMessageLike[]): number {
  return messages.reduce((total, message) => {
    let characters = message.content.map(blockText).filter(text => text.length > 0).join('\n').length
    for (const block of message.content) if (block.type === 'tool-call') characters += (block.name + toolInputText(block.arguments)).length
    return total + Math.ceil(characters / CHARS_PER_TOKEN)
  }, 0)
}

/** Provider usage in ZCode's token shape (`tokens`): `input` is the whole prompt, cache reads and writes included. */
interface ZcodeTokenUsage {
  readonly input?: number
  readonly output?: number
  readonly total?: number
  readonly cache?: { readonly read?: number, readonly write?: number }
}

/** `positiveTokenCount` (`Ygt`) and `nonNegativeTokenCount` (`Tje`). */
const positive = (value: number | undefined): number | undefined => value === undefined || !Number.isFinite(value) || Math.floor(value) <= 0 ? undefined : Math.floor(value)
const nonNegative = (value: number | undefined): number | undefined => value === undefined || !Number.isFinite(value) || Math.floor(value) < 0 ? undefined : Math.floor(value)

/** `contextBaselineFromTokens` (`Xgt`, input via `Bla` @4980209): the context size the usage stands for. */
function usageBaseline(tokens: ZcodeTokenUsage): { inputTokens: number, contextUsageTokens: number | undefined } | undefined {
  const total = positive(tokens.total)
  const cached = (nonNegative(tokens.cache?.read) ?? 0) + (nonNegative(tokens.cache?.write) ?? 0)
  const input = positive(tokens.input)
    ?? (total === undefined ? undefined : Math.max(0, total - (nonNegative(tokens.output) ?? 0)))
    ?? (cached > 0 ? cached : undefined)
  if (input === undefined || input <= 0) return undefined
  const output = positive(tokens.output) ?? 0
  return { inputTokens: input, contextUsageTokens: output > 0 ? input + output : total !== undefined && total >= input ? total : undefined }
}

/** The usage this channel recorded on an assistant message (anthropic.ts replay envelope `response.usage`). */
function recordedUsage(message: RequestMessageLike): ZcodeTokenUsage | undefined {
  const state = message.source?.replayState
  if (typeof state !== 'object' || state === null) return undefined
  const response = (state as { response?: unknown }).response
  if (typeof response !== 'object' || response === null) return undefined
  const { kind, version, usage } = response as { kind?: unknown, version?: unknown, usage?: unknown }
  return kind === 'glm-zcode' && version === 1 && typeof usage === 'object' && usage !== null ? usage : undefined
}

/** `estimateCurrentContextUsage` (`uzo`) with `estimateProviderUsageAnchoredContext` (`CDn`) and `findLatestProviderUsageBaseline` (`d5o`). */
export function estimateCurrentUsage(messages: readonly RequestMessageLike[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const usage = recordedUsage(message)
    const baseline = usage === undefined ? undefined : usageBaseline(usage)
    if (baseline === undefined) continue
    const from = baseline.contextUsageTokens === undefined ? index : index + 1
    return (baseline.contextUsageTokens ?? baseline.inputTokens) + estimateMessageTokens(messages.slice(from))
  }
  return estimateMessageTokens(messages)
}
