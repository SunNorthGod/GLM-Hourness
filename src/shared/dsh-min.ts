/**
 * Minimal structural types for the DSH plugin surface this package touches:
 * the thin adapter layer, together with src/shared/lm-min.ts (LLM message
 * and stream vocabulary). Rows import host types from here instead of
 * declaring their own, so a host upgrade changes these two files.
 *
 * Every member is verified against the desktop runtime packages
 * (reference/dsh-desktop-0.2.1-rc.3, exported from app.asar), which differ
 * from the reference/deepseek-harness main branch that carries the same
 * version string; the surface table with package and line evidence is
 * docs/DESIGN.md §2.4a. Where the official .d.ts is installed
 * (@deepseek-ai/dsh-llm, @deepseek-ai/dsh-attachment) a type-level contract
 * check pins the structural type to it.
 */
import { randomUUID } from 'node:crypto'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from './lm-min.ts'

/**
 * The canonical request header (dsh-session `canonicalHeader`): `config` is
 * the call config the LLM service prepared for the step, carrying the route.
 */
interface RequestHeaderLike {
  readonly config?: { readonly provider?: string, readonly model?: string }
}

/** The session members rows read (dsh-session `Session`: `id` getter, `header`, `deriveMessages`, `requestHeader`). */
export interface SessionLike {
  /** The session identity (the header's `id`). */
  readonly id: string
  /** Immutable creation metadata; `cwd` is the session working directory when the store recorded one. */
  readonly header: { readonly id: string, readonly cwd?: string }
  /** The request-visible history, after compaction projections. */
  deriveMessages(): readonly unknown[]
  /**
   * The fold of the log's `request/header` events (rc.3 dsh-session
   * lib/index.js:1612); undefined before the first request. Optional only so
   * test sessions may leave it out; rc.3 sessions always have it.
   */
  requestHeader?(): RequestHeaderLike | undefined
}

/** A live agent (dsh-agent-loop `ReactLoopAgent`): its id (shared with its session), scoped context and session. */
export interface AgentLike {
  readonly id: string
  readonly ctx: PluginContext
  /** The agent's session; absent only outside the agent runtime. */
  readonly session?: SessionLike
}

/**
 * A message from `session.deriveMessages()` (dsh-session `deriveEventMessage`),
 * as far as the rows read it. Assistant messages carry `source.kind: 'model'`
 * with `provider` / `model` and their tool calls as `tool-call` blocks whose
 * `arguments` is the provider's JSON text; tool results carry `toolCallId`
 * and `isError`; notices keep the `source` they were created with.
 */
export interface DerivedMessage {
  readonly role: string
  readonly content?: ReadonlyArray<{ readonly type: string, readonly text?: string, readonly id?: string, readonly name?: string, readonly arguments?: unknown }>
  readonly source?: Readonly<Record<string, unknown>>
  readonly toolCallId?: string
  readonly isError?: boolean
}

/** The execution object a tool body receives as its second argument (dsh-tools `createExecution`). */
export interface ToolExecutionContext {
  readonly callId: string
  readonly rootCallId?: string
  /** The calling agent, when the call came from one (tools:3227–3260; the body gets the same object, tools:3406). */
  readonly agent?: AgentLike
  readonly signal: AbortSignal
  /** Attach a context message to this call's result. */
  deferContext(context: unknown): void
  /** Mark this call as concluding the turn. */
  concludeTurn(): void
}

/** Input of `ctx.tools.execute`. */
export interface ToolExecuteInput {
  readonly callId: string
  readonly rootCallId?: string
  readonly name: string
  readonly arguments: unknown
  readonly agent?: AgentLike
  /** Transport sub-dispatch token; listeners treat a call carrying it as nested. */
  readonly parent?: unknown
  readonly signal: AbortSignal
}

/** The materialized final result `ctx.tools.execute` resolves to. */
export interface ToolFinalResult {
  readonly isError: boolean
  readonly content: ReadonlyArray<{ readonly type: string, readonly text?: string }>
  readonly value?: unknown
  readonly error?: { readonly message: string }
  readonly additionalContexts?: readonly unknown[]
  readonly concludesTurn?: true
}

/**
 * The `tools/pre-execute` payload as far as the rows read it: the execution
 * dsh-tools `createExecution` builds. It carries the calling agent, not an
 * agent or session id; both are `agent.id` and `agent.session.id`.
 */
export interface ToolExecutionPayload {
  readonly name: string
  readonly arguments: unknown
  readonly agent?: AgentLike
  /** Opaque token set on transport sub-dispatches (e.g. a run_code binding call). */
  readonly parent?: unknown
}

/** `tools/pre-execute` decision (dsh-tools `prepareExecution`); `ask` and `cancel` pass through listeners that do not decide. */
export type PreExecuteDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny', readonly reason: string, readonly info?: unknown }
  | { readonly kind: 'ask' | 'cancel', readonly [key: string]: unknown }

export type PreExecuteListener = (exec: ToolExecutionPayload, next: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>

/** A context that observes or gates tool calls; `options.prepend` registers outermost, deciding before earlier listeners (cordis:372–381). */
export interface PreExecuteHost {
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
}

/** A frozen session log event (dsh-session `append`: `{type, seq, time, data}`). */
export interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly data?: unknown
}

/**
 * A context that observes session logs (dsh-session `commit`,
 * `emitDisposed`): observe-only listeners, called synchronously while the
 * appending code is still running.
 */
export interface SessionEventHost {
  on(event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void
  on(event: 'session/disposed', listener: (session: SessionLike) => void): () => void
}

/** One changed file of a workspace-changes summary: `path` relative to the session directory inside it, absolute elsewhere. */
export interface WorkspaceChangedFile {
  readonly path: string
  readonly display: string
}

/** The summary one `workspace/changes` session event announced (dsh-workspace-changes `TurnRecorder.record`). */
export interface WorkspaceChangesSummary {
  readonly turn: number
  readonly cwd: string
  /** At most the plugin's `maxFiles` entries; `total` counts every changed file. */
  readonly files: readonly WorkspaceChangedFile[]
  readonly total: number
}

/**
 * The `workingDirectory` service member the guard reads (rc.3
 * dsh-working-directory `WorkingDirectoryService.get`, lib/index.js:76): the
 * session's effective directory without I/O, which the file tools resolve
 * relative paths against (dsh-tool-fs `sessionResolveOptions`).
 */
export interface WorkingDirectoryService {
  get(session: SessionLike): string
}

/** The `workspaceChanges` service member the guard reads (dsh-workspace-changes `apply`). */
export interface WorkspaceChangesService {
  summary(sessionId: string, seq: number): WorkspaceChangesSummary | undefined
}

/** `agent/pre-step` payload. */
export interface PreStepPayload {
  readonly agent: AgentLike
  /** Messages claimed from the inbox for this step. */
  readonly messages: readonly unknown[]
  readonly signal: AbortSignal
  readonly turn: number
  readonly step: number
}

/** `agent/pre-step` decision; unknown fields pass through. */
export type PreStepDecision =
  | { readonly kind: 'reject', readonly [key: string]: unknown }
  | { readonly kind: 'enter', readonly messages: readonly unknown[], readonly [key: string]: unknown }

export interface ToolDefinitionLike {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): Array<{ type: string, text?: string }>
    /** Optional UI metadata projection (dsh-tools `register` rejects a present non-function). */
    presentationMeta?(args: unknown, value: unknown): unknown
  }
  execute(args: unknown, exec: unknown): Promise<unknown>
}

export interface ToolsLike {
  /** Register globally, or in the agent scope when called through `agent.ctx`; a scoped tool shadows a global of the same name. */
  register(definition: ToolDefinitionLike): () => void
  /** The definition a scope resolves (scoped shadows global; a restricted-away global reads as absent). */
  get(name: string, scope?: unknown): ToolDefinitionLike | undefined
  /** Run one call through the full tool pipeline. */
  execute(input: ToolExecuteInput): Promise<ToolFinalResult>
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

/** One model-facing tool schema as the assembly carries it. */
export interface AssembledTool {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly deferLoading?: true
}

/** One assembled prompt section as the assemble waterfall carries it. */
export interface AssembledSection {
  readonly name: string
  readonly text: string
  readonly interpolate?: boolean
}

/** The assembly object passed through the `system-prompt/assemble` waterfall. */
export interface AssemblePayload {
  readonly sections: readonly AssembledSection[]
  readonly contexts: readonly unknown[]
  readonly tools: readonly AssembledTool[]
  readonly variables: Record<string, unknown>
  readonly [key: string]: unknown
}

/** The context the dialect and graph rows run on: the tools service, the agent lifecycle, per-step and tool-call waterfalls. */
export interface PluginContext {
  readonly tools: ToolsLike
  /** Awaited serially before agent creation resolves; the first step sees the effects. */
  on(event: 'agent/created', listener: (payload: { agent: AgentLike, source?: unknown }) => Promise<void> | void): () => void
  /** Tool-call gate before every `tools.execute` body (tools:3320–3321): a deny decision becomes the call's error result (tools:3337–3353). */
  on(event: 'tools/pre-execute', listener: PreExecuteListener, options?: { prepend?: boolean }): () => void
  /** Per-request prompt assembly; `options.prepend` registers outermost so post-`next()` sees injected variables. */
  on(event: 'system-prompt/assemble', listener: (assembly: AssemblePayload, context: unknown, next: () => Promise<AssemblePayload>) => Promise<AssemblePayload>, options?: { prepend?: boolean }): () => void
  /** Step admission (agent-scoped): runs after the step's assembly, before the request. */
  on(event: 'agent/pre-step', listener: (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>, options?: { prepend?: boolean }): () => void
}

/**
 * The `llm/stream` request fields the rows read (dsh-llm `GenerateOptions`).
 * Loop-built requests arrive deep-frozen; listeners read them and pass a new
 * object when they need different options.
 */
export interface LlmStreamOptions {
  readonly provider: string
  readonly model: string
  readonly messages: readonly unknown[]
  readonly sessionId?: string
  readonly purpose?: 'compaction' | 'session-title'
}

export type LlmStreamListener = (options: LlmStreamOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>

/** A context that wraps model calls; `global` admits calls from isolated `llm` services too. */
export interface LlmStreamHost {
  on(event: 'llm/stream', listener: LlmStreamListener, options?: { global?: boolean, prepend?: boolean }): () => void
}

/** The `llm` service member a row calls to stream through the full waterfall. */
export interface LlmStreamService {
  stream(options: LlmStreamOptions): AsyncIterable<StreamChunk>
}

/** The `llm` service member that registers an adapter for provider routes; the disposer also carries `replace`. */
export interface AdapterRegistry<Adapter> {
  registerAdapter(providers: readonly string[], adapter: Adapter): () => void
}

/** cordis `ctx.get(name)`: an optional service without the inject requirement; undefined until its fiber is active. */
export interface ServiceLookup {
  get?(name: string): unknown
}

/**
 * cordis `ctx.inject(names, callback)`: runs the callback in a child fiber
 * whose context carries the named services once they are present, and
 * disposes that fiber when they leave (rc.3 dsh-subagent and
 * dsh-user-questions register their projection units this way).
 */
export interface InjectHost {
  inject(names: readonly string[], callback: (ctx: { readonly sessionProjections: SessionProjectionsService }) => void): unknown
}

/**
 * The `sessionProjections` service member a unit registrar calls
 * (dsh-session-projection `register`): the registration is an effect of the
 * calling fiber and leaves with it.
 */
interface SessionProjectionsService {
  register(definition: {
    readonly key: string
    readonly stateVersion: number
    readonly stateSchema: { parse(value: unknown): unknown }
    init(header: unknown, inheritedEventCount: number): unknown
    apply(state: never, event: never): unknown
    readonly wire?: { readonly viewSchema: { parse(value: unknown): unknown }, view(state: never): unknown }
  }): () => void
}

/** cordis `ctx.provide(name, value)`: register a service owned by the calling fiber; the disposer unregisters it (also on unload). */
export interface ProvideHost {
  provide(name: string, value: unknown): () => void
}

/** The `fs` service member that maps a host path into the tool execution world (undefined when that world cannot read it). */
export interface FsPathService {
  processPathFromHostPath(hostPath: string): string | undefined
}

/**
 * A human command invocation (dsh-commands `execute`, lib/index.js
 * `Object.freeze({ commandId, agent, rawInput, attachments, signal })`): the
 * exact receiving agent with its session, and the text after `/name`.
 */
export interface CommandInvocationLike {
  readonly agent: { readonly id: string, readonly session?: Pick<SessionLike, 'id'> & Partial<Pick<SessionLike, 'header'>> }
  readonly rawInput: string
}

/** A command result; an error needs non-empty text (dsh-commands `normalizeResult`). */
export interface CommandResultLike {
  readonly kind: 'success' | 'error'
  readonly text: string
}

/** A command definition (dsh-commands `normalizeDefinition`): `name` matches /^[a-z][a-z0-9_-]*$/, `description` is non-empty. */
export interface CommandDefinitionLike {
  readonly definitionId: string
  readonly name: string
  readonly description: string
  /**
   * Whether `command/run` records the raw input as `args` (default true);
   * false when another record already carries the payload.
   */
  readonly recordInput?: boolean
  handler(invocation: CommandInvocationLike): Promise<CommandResultLike>
}

/** A context with the commands service injected. */
export interface CommandsHost {
  readonly commands: { register(definition: CommandDefinitionLike): () => void }
}

/**
 * Compile-time contract check against the installed @deepseek-ai/dsh-llm
 * types: every request the runtime streams offers the fields `llm/stream`
 * listeners read, with compatible types.
 */
export type LlmStreamOptionsContractCheck = GenerateOptions extends LlmStreamOptions ? true : never
/** Referenced so the conditional type is evaluated by tsc. */
const llmStreamOptionsContractCheck: LlmStreamOptionsContractCheck = true
void llmStreamOptionsContractCheck

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
