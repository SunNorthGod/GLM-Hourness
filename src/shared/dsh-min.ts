/**
 * Minimal structural types for the DSH plugin surface this package touches.
 *
 * These duck-type the verified APIs (deepseek-harness source, 2026-10-27):
 * - ctx.on('agent/pre-step', (payload, next) => ...) — agent-loop waterfall
 * - ctx.systemPrompt.section({ name, order, text }) — scoped registration
 *   shadows a same-name global section
 * - ctx.tools.register(def, { when: async ({ modelSelection }) => boolean })
 *   — step-time activation; ctx.tools.restrict({ deny }) hides global tools
 *   for the calling agent scope
 * The package deliberately depends on no @deepseek-ai packages at build time;
 * structural compatibility is guarded by integration probes against a live DSH.
 */

export interface ModelSelection {
  readonly provider?: string
  readonly model?: string
}

export interface PreStepPayload {
  readonly agent?: AgentLike
  readonly modelSelection?: ModelSelection
}

export interface AgentLike {
  readonly id: string
  readonly ctx: PluginContext
  /** Model route holder; `current()` answers {provider, model} once configured. */
  readonly model?: { current(): { provider?: string, model?: string } | undefined }
}

export interface SectionSpec {
  readonly name: string
  readonly order: number
  readonly text: string
  readonly interpolate?: boolean
}

export interface SystemPromptLike {
  section(spec: SectionSpec): () => void
  /** Dynamic context (team:identity pattern): text resolves at assembly time. */
  context(spec: { name: string, order: number, text: () => string }): () => void
}

export interface ToolRegistrationOptions {
  when?: (context: { modelSelection?: ModelSelection }) => Promise<boolean> | boolean
}

export interface ToolDefinitionLike {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): Array<{ type: string, text?: string }>
  }
  deferLoading?: true
  execute(args: unknown, exec: unknown): Promise<unknown>
}

export interface ToolsLike {
  register(definition: ToolDefinitionLike, options?: ToolRegistrationOptions): () => void
  restrict(filter: { allow?: string[], deny?: string[] }): () => void
  /** Registry listing before dialect restrictions apply; the first parameter is the upstream scope key (an agent scope), not the agent object. */
  schemas(scope?: unknown, toolSet?: unknown): Array<{ name: string }>
  /** Registry lookup before dialect restrictions apply (used to capture natives for alias delegation). */
  executable(name: string): ToolDefinitionLike | undefined
}

export interface ToolExecutionPayload {
  readonly name: string
  readonly arguments?: unknown
  readonly agent?: AgentLike
  readonly nested?: boolean
}

/** Model-facing synthetic user notice (createUserMessage shape, repeat-tool-reminder pattern). */
export interface UserNotice {
  readonly content: Array<{ readonly type: 'text', readonly text: string }>
  readonly source: { readonly kind: string, readonly form: 'notice', readonly summary: string }
}

/** Duck-typed post-execute decision: unknown DSH variants pass through via spread. */
export interface PostExecuteDecision {
  readonly kind: string
  readonly additionalContexts?: unknown[]
  readonly [key: string]: unknown
}

export interface PluginContext {
  readonly systemPrompt: SystemPromptLike
  readonly tools: ToolsLike
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike, source?: unknown }) => Promise<void> | void): () => void
  on(event: 'agent/pre-step', listener: (payload: PreStepPayload, next: () => Promise<void>) => Promise<void>): () => void
  on(event: 'tools/post-execute', listener: (exec: ToolExecutionPayload, result: unknown, next: () => Promise<PostExecuteDecision>) => Promise<PostExecuteDecision>): () => void
  /** Per-request prompt assembly; `options.prepend` registers outermost so post-`next()` sees injected variables. */
  on(event: 'system-prompt/assemble', listener: (assembly: AssemblePayload, context: unknown, next: () => Promise<AssemblePayload>) => Promise<AssemblePayload>, options?: { prepend?: boolean }): () => void
}

/** The assembly object passed through the `system-prompt/assemble` waterfall. */
export interface AssemblePayload {
  readonly sections: readonly { readonly name: string, readonly text: string, readonly interpolate?: boolean }[]
  readonly contexts: readonly unknown[]
  readonly tools: readonly unknown[]
  readonly variables: Record<string, unknown>
  readonly [key: string]: unknown
}

/** Build a labeled synthetic user notice (the harness→model reminder channel). */
export function createUserNotice(kind: string, summary: string, text: string): UserNotice {
  return {
    content: [{ type: 'text', text }],
    source: { kind, form: 'notice', summary },
  }
}
