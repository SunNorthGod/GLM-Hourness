/**
 * Minimal structural types for the DSH plugin surface this package touches.
 *
 * Verified against the desktop runtime packages (reference/dsh-desktop-0.2.1-rc.3,
 * exported from app.asar; docs/DESIGN.md §2.4a), which differ from the
 * reference/deepseek-harness main branch that carries the same version string:
 * - ctx.tools.register(definition) — no activation options; a registration
 *   through agent.ctx is scoped to that agent and shadows a global of the
 *   same name
 * - ctx.tools.get(name, scope) — the definition a scope sees (no executable())
 * - ctx.tools.restrict({ allow, deny }) — scoped only; filters inherited
 *   tools, never the scope's own registrations
 * - agent.ctx.on('system-prompt/assemble') — runs every step before
 *   agent/pre-step; the request carries exactly the returned `tools`, and the
 *   route lives only in `variables.provider` / `variables.model`
 * - ctx.on('tools/post-execute') — (exec, result, next) waterfall whose
 *   decision may attach `additionalContexts`; nested sub-dispatches carry
 *   `exec.parent`
 */
import { randomUUID } from 'node:crypto'

export interface AgentLike {
  readonly id: string
  readonly ctx: PluginContext
  /** Model route holder; rc.3 desktop answers `{}` for the main agent (route lives in the assembly). */
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
  context?(spec: { name: string, order: number, text: () => string }): () => void
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
  register(definition: ToolDefinitionLike): () => void
  restrict(filter: { allow?: string[], deny?: string[] }): () => void
  /** Visible schemas for a scope (the agent); omitted = the global view. */
  schemas(scope?: unknown): Array<{ name: string }>
  /** The definition a scope resolves (scoped shadows global; a restricted-away global reads as absent). */
  get(name: string, scope?: unknown): ToolDefinitionLike | undefined
}

export interface ToolExecutionPayload {
  readonly name: string
  readonly arguments?: unknown
  readonly agent?: AgentLike
  /** Opaque token set on transport sub-dispatches (e.g. a run_code binding call). */
  readonly parent?: unknown
}

/**
 * Model-facing synthetic user notice, shaped like the runtime's
 * `createUserMessage` output (repeat-tool-reminder pattern): the agent inbox
 * keys pending messages by `id` and rejects duplicates, and the session
 * projects them by `role`.
 */
export interface UserNotice {
  readonly id: string
  readonly role: 'user'
  readonly content: ReadonlyArray<{ readonly type: 'text', readonly text: string }>
  readonly source: { readonly kind: string, readonly form: 'notice', readonly summary: string, readonly [fact: string]: unknown }
}

/** Duck-typed post-execute decision: unknown DSH variants pass through via spread. */
export interface PostExecuteDecision {
  readonly kind: string
  readonly additionalContexts?: unknown[]
  readonly [key: string]: unknown
}

/** One model-facing tool schema as the assembly carries it. */
export interface AssembledTool {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly deferLoading?: true
}

/** The assembly object passed through the `system-prompt/assemble` waterfall. */
export interface AssemblePayload {
  readonly sections: readonly { readonly name: string, readonly text: string, readonly interpolate?: boolean }[]
  readonly contexts: readonly unknown[]
  readonly tools: readonly AssembledTool[]
  readonly variables: Record<string, unknown>
  readonly [key: string]: unknown
}

export interface PluginContext {
  readonly systemPrompt: SystemPromptLike
  readonly tools: ToolsLike
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike, source?: unknown }) => Promise<void> | void): () => void
  on(event: 'tools/post-execute', listener: (exec: ToolExecutionPayload, result: unknown, next: () => Promise<PostExecuteDecision>) => Promise<PostExecuteDecision>): () => void
  /** Per-request prompt assembly; `options.prepend` registers outermost so post-`next()` sees injected variables. */
  on(event: 'system-prompt/assemble', listener: (assembly: AssemblePayload, context: unknown, next: () => Promise<AssemblePayload>) => Promise<AssemblePayload>, options?: { prepend?: boolean }): () => void
}

/** Recursively freeze a freshly built JSON value (createMessage freezes its output). */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const member of Object.values(value)) deepFreeze(member)
    Object.freeze(value)
  }
  return value
}

/**
 * Build a labeled synthetic user notice (the harness→model reminder channel)
 * with a fresh stable identity, as `createUserMessage` does.
 * @param facts - extra source fields persisted with the notice (lossless JSON).
 */
export function createUserNotice(kind: string, summary: string, text: string, facts: Readonly<Record<string, unknown>> = {}): UserNotice {
  return deepFreeze({
    id: randomUUID(),
    role: 'user' as const,
    content: [{ type: 'text' as const, text }],
    source: { ...facts, kind, form: 'notice' as const, summary },
  })
}
