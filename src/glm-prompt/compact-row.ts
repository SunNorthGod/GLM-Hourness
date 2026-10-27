/**
 * Compaction mirror row: in GLM-routed compaction requests the summarization
 * instruction and the landed summary follow ZCode (compact.ts).
 *
 * Seam (rc.3 runtime, docs/DESIGN.md §5.6): compaction-basic, the one
 * `ctx.compaction` implementation of the context, summarizes through
 * `ctx.llm.stream()` with `purpose: 'compaction'`, replaying the
 * conversation and appending its instruction as the final user message.
 * Every such call runs the `llm/stream` waterfall, whose `next()` cannot
 * carry new options. So for a GLM compaction request this row re-dispatches
 * a copy whose final message is the ZCode compact prompt, and formats the
 * copy's text output with ZCode's formatCompactSummary. Registered outermost,
 * no other listener sees the original request; the copy runs the full chain
 * once. Trigger policy, retention and the checkpoint framing stay with
 * compaction-basic. Any other request passes through untouched.
 */
import { buildCompactPrompt, formatCompactSummary } from './compact.ts'
import { isGlmModel } from '../shared/route.ts'
import type { LlmStreamHost, LlmStreamOptions, LlmStreamService } from '../shared/dsh-min.ts'
import type { StreamChunk } from '../shared/lm-min.ts'

/** The row's context: the `llm/stream` waterfall and the injected `llm` service. */
export type CompactRowContext = LlmStreamHost & { readonly llm: LlmStreamService }

/** Opening of compaction-basic's COMPACTION_INSTRUCTION; the row replaces only that instruction. */
const DSH_INSTRUCTION_OPENING = 'You are now acting as a compaction engine for this AI coding assistant.'

function isDshCompactionInstruction(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false
  const { role, content } = message as { role?: unknown, content?: unknown }
  if (role !== 'user' || !Array.isArray(content) || content.length !== 1) return false
  const [block] = content as Array<{ type?: unknown, text?: unknown }>
  return block?.type === 'text' && typeof block.text === 'string' && block.text.startsWith(DSH_INSTRUCTION_OPENING)
}

/** The ZCode copy of a GLM compaction request, or undefined when the request is not one. */
export function withZcodeInstruction(options: LlmStreamOptions): LlmStreamOptions | undefined {
  if (options.purpose !== 'compaction' || !isGlmModel(options.model)) return undefined
  if (!isDshCompactionInstruction(options.messages.at(-1))) return undefined
  return {
    ...options,
    messages: [...options.messages.slice(0, -1), { role: 'user', content: [{ type: 'text', text: buildCompactPrompt(undefined) }] }],
  }
}

type TextChunk = Extract<StreamChunk, { type: 'block-start' | 'text-delta' | 'block-end' }>

const isTextChunk = (chunk: StreamChunk): chunk is TextChunk =>
  (chunk.type === 'block-start' && chunk.blockType === 'text')
  || chunk.type === 'text-delta'
  || (chunk.type === 'block-end' && chunk.block.type === 'text')

/**
 * Apply ZCode's summary formatting to a finished stream: the text blocks are
 * joined, `<analysis>` is stripped and `<summary>` becomes "Summary:" (also
 * when a tag spans blocks), and the result is re-emitted as one text block
 * where the first text block stood. An empty result emits no text, so
 * compaction-basic fails loud ("no text summary content").
 */
export async function* formatSummaryStream(stream: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  const texts = new Map<number, { deltas: string, block?: string }>()
  let firstText = -1
  chunks.forEach((chunk, position) => {
    if (!isTextChunk(chunk)) return
    if (firstText < 0) firstText = position
    const text = texts.get(chunk.index) ?? { deltas: '' }
    texts.set(chunk.index, text)
    if (chunk.type === 'text-delta') text.deltas += chunk.text
    if (chunk.type === 'block-end' && chunk.block.type === 'text') text.block = chunk.block.text
  })
  const formatted = formatCompactSummary([...texts.values()].map(text => text.block ?? text.deltas).join('\n'))
  const index = texts.keys().next().value ?? 0
  for (const [position, chunk] of chunks.entries()) {
    if (position === firstText && formatted.length > 0) {
      yield { type: 'block-start', index, blockType: 'text' }
      yield { type: 'text-delta', index, text: formatted }
      yield { type: 'block-end', index, block: { type: 'text', text: formatted } }
    }
    if (!isTextChunk(chunk)) yield chunk
  }
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-compact'

/** The row re-dispatches through the LLM service. */
export const inject = ['llm']

/** cordis plugin entry. */
export function apply(ctx: CompactRowContext): () => void {
  const copies = new WeakSet<object>()
  return ctx.on('llm/stream', (options, next) => {
    if (copies.has(options)) return formatSummaryStream(next())
    const copy = withZcodeInstruction(options)
    if (copy === undefined) return next()
    copies.add(copy)
    return ctx.llm.stream(copy)
  }, { global: true, prepend: true })
}
