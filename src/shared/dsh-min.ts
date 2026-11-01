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
  /**
   * Immutable creation metadata; `cwd` is the session working directory when
   * the store recorded one. A delegated child carries `parentSession` and
   * `origin: 'subagent'` (dsh-subagent `childSessionMeta`, subagent:346–355;
   * validated in dsh-session, session:1051–1053); a user fork carries
   * `parentSession` only.
   */
  readonly header: { readonly id: string, readonly cwd?: string, readonly parentSession?: string, readonly origin?: 'subagent' }
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
 * cordis `ctx.inject(names, callback)` (cordis:1600): runs the callback in a
 * child fiber whose context carries the named services once they are all
 * present, and disposes that fiber when one leaves; a function the callback
 * returns runs at that disposal (cordis:1071, 1142–1143). rc.3 dsh-subagent
 * and dsh-user-questions register their projection units this way.
 */
export interface InjectHost {
  inject<K extends keyof InjectableServices>(names: readonly K[], callback: (ctx: Pick<InjectableServices, K>) => (() => void) | void): unknown
}

/** The services rows take optionally through `ctx.inject`. */
export interface InjectableServices {
  readonly sessionProjections: SessionProjectionsService
  readonly agents: AgentsService
  readonly subagents: SubagentsService
  readonly commands: CommandsHost<AgentCommandInvocationLike>['commands']
}

/**
 * The `sessionProjections` service members the graph-panel row calls
 * (rc.3 dsh-session-projection): `register` adds a unit as an effect of the
 * calling fiber, which leaves with it (session-projection:68); `snapshot`
 * reads one consistent cut of the selected client-visible units of one
 * session, each value through its unit's view schema; a key that is not
 * registered is absent from `values` (session-projection:141).
 */
export interface SessionProjectionsService {
  register(definition: {
    readonly key: string
    readonly stateVersion: number
    readonly stateSchema: { parse(value: unknown): unknown }
    init(header: unknown, inheritedEventCount: number): unknown
    apply(state: never, event: never): unknown
    readonly wire?: { readonly viewSchema: { parse(value: unknown): unknown }, view(state: never): unknown }
  }): () => void
  snapshot(session: SessionLike, keys: readonly string[]): { readonly values: Readonly<Record<string, unknown>> }
  /**
   * One unit's current host state after every registered unit is folded up
   * to the session cursor (session-projection:126–131); synchronous, live
   * (do not mutate), undefined when the key is not registered.
   */
  stateOf(session: SessionLike, key: string): unknown
}

/**
 * A live agent as a command invocation and the `agents` registry carry it
 * (rc.3 dsh-agent-loop `ReactLoopAgent`): its id equals its session's id
 * (agent-loop:771–775). `status` is idle between turns, running while a
 * turn or maintenance runs (agent-loop:790–791). `followup` puts a message
 * at the end of the next-turn queue and wakes an idle agent; `inject` puts
 * it before the next step without waking (agent-loop:806, 812, both through
 * `send`, agent-loop:800–805, which sends a waking message that arrives
 * after a cancel to the next turn and latches the wake). `cancel` aborts
 * the running turn; `keepInbox` keeps the pending messages, as the stop
 * button does (agent-loop:815–821; api-session-controller:1065).
 */
export interface LiveAgentLike {
  readonly id: string
  readonly session: SessionLike
  readonly status: 'idle' | 'running'
  followup(message: UserNotice): void
  inject(message: UserNotice): void
  cancel(cause: { readonly kind: 'user' }, options: { readonly keepInbox: true }): void
}

/** The `agents` registry member the run controls read (rc.3 dsh-agent `get`, agent:596): the live agent of a session id, undefined when none is live. */
export interface AgentsService {
  get(id: string): LiveAgentLike | undefined
}

/**
 * A live agent as the design row drives it: the scoped context its hooks
 * install on (agent-loop:748–781), `steer` (a waking message that reaches
 * the running turn's next step, agent-loop:806–814) and `whenIdle` (resolves
 * when the agent's current activity ends, agent-loop:870–875).
 */
export interface DesignAgentLike extends LiveAgentLike {
  readonly ctx: PluginContext
  steer(message: UserNotice): void
  whenIdle(): Promise<void>
}

/** The `agents` registry as the design row reads it: `get`, and `roots()`, the live top-level agents in registration order (rc.3 dsh-agent, agent:622–624). */
export interface DesignAgentsService {
  get(id: string): DesignAgentLike | undefined
  roots(): readonly DesignAgentLike[]
}

/**
 * The `sessionPersistence` service member the design row reads (rc.3
 * dsh-session-persistence-jsonl, :2398, `list` :2603): the header of every
 * stored session, open or not.
 */
export interface SessionPersistenceLike {
  list(options?: unknown): Promise<ReadonlyArray<{ readonly header: { readonly id: string } }>>
}

/**
 * The `subagents` service member the run controls call (rc.3 dsh-subagent
 * `interrupt`, subagent:3105; the manager, subagent:1258–1277): under a
 * `user` authority it cancels the current turn of a live direct child of
 * that parent session and keeps its inbox; an absent child is an accepted
 * no-op; a child of another parent throws `UNAUTHORIZED`.
 */
export interface SubagentsService {
  interrupt(targetSessionId: string, authority: { readonly kind: 'user', readonly parentSessionId: string }): void
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

/**
 * The invocation as the host passes every handler, for a handler that
 * drives the receiving agent: the lifecycle pairing id `commandId` (also
 * on `command/run` and `command/done`, commands:333–346) and the live agent
 * itself (commands:379–385).
 */
export interface AgentCommandInvocationLike extends CommandInvocationLike {
  readonly commandId: string
  readonly agent: LiveAgentLike
}

/** A command result; an error needs non-empty text (dsh-commands `normalizeResult`). */
export interface CommandResultLike {
  readonly kind: 'success' | 'error'
  readonly text: string
}

/** A command definition (dsh-commands `normalizeDefinition`): `name` matches /^[a-z][a-z0-9_-]*$/, `description` is non-empty. */
export interface CommandDefinitionLike<Invocation extends CommandInvocationLike = CommandInvocationLike> {
  readonly definitionId: string
  readonly name: string
  readonly description: string
  /**
   * Whether `command/run` records the raw input as `args` (default true);
   * false when another record already carries the payload.
   */
  readonly recordInput?: boolean
  /** Free-form input the command takes: `hint` is the placeholder clients show (dsh-commands `normalizeDefinition`, commands:157-161: a non-empty string). */
  readonly input?: { readonly hint: string }
  handler(invocation: Invocation): Promise<CommandResultLike>
}

/** The invocation of a command that drives the receiving agent and installs hooks on it (the design row's /wish). */
export interface DesignInvocationLike extends AgentCommandInvocationLike {
  readonly agent: DesignAgentLike
}

/**
 * What `commands.execute` settles to (rc.3 dsh-commands `execute`,
 * commands:318–333): the lifecycle pairing id and the normalized result;
 * undefined instead when the line's syntax or command name does not resolve.
 */
export interface CommandExecutionLike {
  readonly commandId: string
  readonly result: CommandResultLike
}

/**
 * The `commands` service member that runs a command line as if the person
 * typed it (rc.3 dsh-commands `execute`, commands:327): `command/run` and
 * `command/done` are appended to the session log around the handler, the
 * source is always the person. `signal` is read unconditionally.
 */
export interface CommandsExecutor {
  execute(agent: DesignAgentLike, line: string, attachments: readonly unknown[], signal: AbortSignal): Promise<CommandExecutionLike | undefined>
}

/**
 * A context with the commands service injected. The host passes every
 * handler the full invocation (AgentCommandInvocationLike); `Invocation` is
 * what the row's handlers read.
 */
export interface CommandsHost<Invocation extends CommandInvocationLike = CommandInvocationLike> {
  readonly commands: { register(definition: CommandDefinitionLike<Invocation>): () => void }
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
