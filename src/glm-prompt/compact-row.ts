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
 * compaction-basic. Any other request passes through untouched. Every
 * compaction request reports the row health of its session, mirrored or not.
 *
 * Reading the original after compaction (DESIGN.md §2.4, §5.6): while the
 * orchestration package's transcript row provides `glmHournessTranscript`
 * (src/shared/transcript.ts, read lazily through `ctx.get`), a non-empty
 * GLM summary is followed by ZCode 3.17.1's transcript sentence
 * (zcode-compact-text.ts, `Bxt` at zcode.cjs:14382–14384) naming the
 * plaintext export of the session that the service wrote once the summary
 * was done; the model reads it with Read. Without the service, or when the
 * export is skipped, the summary is what it was without the row.
 */
import { buildCompactPrompt, formatCompactSummary } from './compact.ts'
import { transcriptNote } from './zcode-compact-text.ts'
import { isGlmModel } from '../shared/route.ts'
import { provideRowHealth, type HealthState } from '../shared/health.ts'
import type { LlmStreamHost, LlmStreamOptions, LlmStreamService, ProvideHost, ServiceLookup } from '../shared/dsh-min.ts'
import type { StreamChunk } from '../shared/lm-min.ts'
import { transcriptService } from '../shared/transcript.ts'

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
 * compaction-basic fails loud ("no text summary content"). For a non-empty
 * result, `transcript` (when given) is awaited once the stream is done; a
 * path it returns is appended in ZCode's transcript sentence.
 */
export async function* formatSummaryStream(stream: AsyncIterable<StreamChunk>, transcript?: () => Promise<string | undefined>): AsyncIterable<StreamChunk> {
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
  const path = formatted.length > 0 && transcript !== undefined ? await transcript() : undefined
  const summary = path === undefined ? formatted : `${formatted}${transcriptNote(path)}`
  const index = texts.keys().next().value ?? 0
  for (const [position, chunk] of chunks.entries()) {
    if (position === firstText && summary.length > 0) {
      yield { type: 'block-start', index, blockType: 'text' }
      yield { type: 'text-delta', index, text: summary }
      yield { type: 'block-end', index, block: { type: 'text', text: summary } }
    }
    if (!isTextChunk(chunk)) yield chunk
  }
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/glm-compact'

/** The row re-dispatches through the LLM service. */
export const inject = ['llm']

/** The mirror's status for one compaction request (row health). */
export function compactionHealth(options: LlmStreamOptions, mirrored: boolean): [HealthState, string] {
  const route = `${options.provider}/${options.model}`
  if (mirrored) return ['active', `GLM 压缩请求改用 ZCode 指令与摘要格式（${route}）`]
  if (!isGlmModel(options.model)) return ['inactive', `非 GLM 路由 ${route}，压缩请求原样放行`]
  return ['inactive', `未识别 compaction-basic 的压缩指令，原样放行（${route}）`]
}

/** cordis plugin entry. */
export function apply(ctx: CompactRowContext & Partial<ProvideHost> & ServiceLookup): () => void {
  const health = provideRowHealth(ctx, 'glm-compact', 'active', '已加载，只作用于压缩请求')
  const copies = new WeakSet<object>()
  /** The export of one session for its summary: undefined without the transcript service or a session id; the path only when a file was written. */
  const transcriptFor = (sessionId: string | undefined): (() => Promise<string | undefined>) | undefined => {
    const service = transcriptService(ctx)
    if (service === undefined || sessionId === undefined || sessionId.length === 0) return undefined
    return async () => {
      try {
        const result = await service.exportBeforeCompaction(sessionId)
        return result.kind === 'written' ? result.path : undefined
      }
      catch (error) {
        // The service never rejects by contract; a rejection is a contract break, reported and left out of the summary.
        health.report(sessionId, 'degraded', `会话原文服务出错，摘要不带原文路径：${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
    }
  }
  const dispose = ctx.on('llm/stream', (options, next) => {
    if (copies.has(options)) return formatSummaryStream(next(), transcriptFor(options.sessionId))
    const copy = withZcodeInstruction(options)
    if (options.purpose === 'compaction') health.report(options.sessionId, ...compactionHealth(options, copy !== undefined))
    if (copy === undefined) return next()
    copies.add(copy)
    return ctx.llm.stream(copy)
  }, { global: true, prepend: true })
  return () => {
    dispose()
    health.dispose()
  }
}
