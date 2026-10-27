/**
 * GLM compaction mirror engine. `BasicCompactionEngine.summarize()` is the
 * upstream's sole subclass hook: this engine overrides it so a glm-routed
 * summarization replays the conversation with the ZCode compact instruction
 * (analysis-first, 9 sections, verbatim security-preservation clause) and
 * strips the `<analysis>` block from the landed summary; every other route
 * delegates to the base engine unchanged. The base class is injected so the
 * package build stays DSH-dependency-free; the row entry resolves it at
 * runtime from the live DSH install and fails loud when absent.
 */
import { buildCompactPrompt, formatCompactSummary } from './compact.ts'

/** The summarize hook shape (SummarizationInput/SummaryResult stay opaque). */
export interface SummarizeInput {
  readonly tools?: readonly unknown[]
  readonly messages: readonly unknown[]
}

export interface EngineBaseContext {
  readonly llm: {
    stream(options: unknown): AsyncIterable<unknown>
  }
}

export interface BaseEngine {
  new (ctx: unknown, config?: unknown): BaseEngineInstance
}

export interface BaseEngineInstance {
  summarize(input: SummarizeInput, owner: unknown, signal?: AbortSignal): Promise<unknown>
}

/** The glm branch of the summarize hook, isolated for testing. */
export async function summarizeGlm(
  ctx: EngineBaseContext,
  route: { provider: string, model: string },
  config: { maxTokens?: number },
  input: SummarizeInput,
  owner: { session: { id?: string, toolHistory?: () => unknown, requestHeader?: () => { config?: { provider?: string, model?: string } } | undefined }, options: { provider?: string, model?: string } },
  signal?: AbortSignal,
): Promise<{ summary: Array<{ type: 'text', text: string }>, rawOutput: Array<{ type: 'text', text: string }>, llmStreamCall: true, provider: string, model: string, maxTokens?: number, usage?: unknown }> {
  const messages = [
    ...input.messages,
    {
      role: 'user',
      content: [{ type: 'text', text: buildCompactPrompt(undefined) }],
    },
  ]
  const options: Record<string, unknown> = {
    provider: route.provider,
    model: route.model,
    messages,
    purpose: 'compaction',
    ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
    ...(owner.session.id === undefined ? {} : { sessionId: owner.session.id }),
    ...(owner.session.toolHistory === undefined ? {} : { toolHistory: owner.session.toolHistory() }),
    ...(signal === undefined ? {} : { signal }),
  }

  const rawBlocks: string[] = []
  let usage: unknown
  for await (const chunk of ctx.llm.stream(options) as AsyncIterable<{ type: string, block?: { type: string, text?: string }, text?: string, usage?: unknown }>) {
    if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') {
      rawBlocks.push(chunk.block.text)
    }
    if (chunk.type === 'usage') usage = chunk.usage
  }
  // Official ZCode post-processing over the joined text, so <analysis> blocks
  // split across stream blocks are still stripped (formatCompactSummary).
  const formatted = formatCompactSummary(rawBlocks.join('\n'))
  if (formatted.length === 0) {
    throw new Error('glm summarization produced no text summary content')
  }
  const blocks: Array<{ type: 'text', text: string }> = [{ type: 'text', text: formatted }]
  return {
    summary: blocks,
    rawOutput: blocks,
    llmStreamCall: true,
    provider: route.provider,
    model: route.model,
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
    ...(usage === undefined ? {} : { usage }),
  }
}

/** Build the engine class over an injected base; instantiate via `new (ctx, config)` or `ctx.plugin(Class, config)`. */
export function makeGlmCompactionEngineClass(Base: BaseEngine): new (ctx: EngineBaseContext, config?: Record<string, unknown>) => BaseEngineInstance {
  const BaseCtor = Base as unknown as new (ctx: unknown, config?: unknown) => {
    ctx: unknown
    summarize(input: SummarizeInput, owner: unknown, signal?: AbortSignal): Promise<unknown>
  }
  class GlmCompactionEngine extends BaseCtor {
    override async summarize(input: SummarizeInput, owner: unknown, signal?: AbortSignal): Promise<unknown> {
      const config = (this as unknown as { config?: Record<string, unknown> }).config ?? {}
      const agent = owner as { options?: { provider?: string, model?: string }, session?: { requestHeader?: () => { config?: { provider?: string, model?: string } } | undefined } }
      const configured = typeof config.summarizationProvider === 'string' && config.summarizationProvider.length > 0
        && typeof config.summarizationModel === 'string'
        ? { provider: config.summarizationProvider, model: config.summarizationModel as string }
        : undefined
      const latest = agent.session?.requestHeader?.()?.config
      const route = configured
        ?? (latest !== undefined && typeof latest.provider === 'string' && typeof latest.model === 'string'
          ? { provider: latest.provider, model: latest.model }
          : undefined)
      if (route === undefined || route.provider !== 'glm') {
        return super.summarize(input, owner, signal)
      }
      return summarizeGlm(this.ctx as EngineBaseContext, route, config, input, owner as never, signal)
    }
  }
  return GlmCompactionEngine as unknown as new (ctx: EngineBaseContext, config?: Record<string, unknown>) => BaseEngineInstance
}

/** Build an engine instance over an injected base (unit-testing convenience). */
export function makeGlmCompactionEngine(Base: BaseEngine, ctx: EngineBaseContext, config: { maxTokens?: number } & Record<string, unknown>): BaseEngineInstance & { summarize(input: SummarizeInput, owner: never, signal?: AbortSignal): Promise<unknown> } {
  const Engine = makeGlmCompactionEngineClass(Base)
  return new Engine(ctx, config) as never
}
