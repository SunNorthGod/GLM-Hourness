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
 * check pins the structural type to it. The two cordis shapes the
 * client-checked shared modules need, ServiceLookup and ProvideHost, are
 * declared in ./cordis-min.ts (no Node import) and re-exported here.
 */
import { randomUUID } from 'node:crypto'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ProvideHost, ServiceLookup } from './cordis-min.ts'
import type { StreamChunk } from './lm-min.ts'

export type { ProvideHost, ServiceLookup } from './cordis-min.ts'

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
  /**
   * The whole log, copied (rc.3 marks it `@deprecated`, "new production calls
   * are prohibited", session:1444–1452). Only the way back for the main
   * agent's talk state when the session projection hournessTalk could not
   * be registered (src/design/talk.ts `talkFold`).
   */
  snapshotEvents?(): readonly SessionEventLike[]
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
  /** The call id createExecution builds (tools:3229–3260, one object for pre-execute, the body and post-execute); the follow-up recorder settles by it. */
  readonly callId?: string
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

/**
 * The `tools/post-execute` payload as far as the rows read it: the same
 * execution `tools/pre-execute` gets, with the call id (dsh-tools
 * `createExecution`: `callId`, `rootCallId`, `name`, `arguments`, `agent`,
 * `parent`; tools:3229–3260).
 */
export interface PostExecutePayload extends ToolExecutionPayload {
  readonly callId: string
}

/**
 * `tools/post-execute` decision (rc.3 dsh-tools `postExecute`,
 * tools:3598–3631; official `PostToolDecision`). `accept` keeps the result
 * and may replace its `content` (or its `value`, never both), `block` turns
 * it into an error result whose content is `feedback`. Either may attach
 * `additionalContexts`, which the result carries to the next request; the
 * contexts the tool body deferred stay with an accepted result and are
 * dropped by a block.
 */
export type PostExecuteDecision =
  | { readonly kind: 'accept', readonly content?: ToolFinalResult['content'], readonly value?: unknown, readonly additionalContexts?: readonly unknown[] }
  | { readonly kind: 'block', readonly feedback: ToolFinalResult['content'], readonly additionalContexts?: readonly unknown[] }

/** A `tools/post-execute` listener: `next()` is the decision of the listeners below it, `accept` when none decides. */
export type PostExecuteListener = (exec: PostExecutePayload, result: ToolFinalResult, next: () => Promise<PostExecuteDecision>) => Promise<PostExecuteDecision>

/** A context that sees every tool result before the call settles (the repeat-tool-reminder pattern); a host-level listener sees the calls of every agent, children included (tools:3600). */
export interface PostExecuteHost {
  on(event: 'tools/post-execute', listener: PostExecuteListener, options?: { prepend?: boolean }): () => void
}

/** A frozen session log event (dsh-session `append`: `{type, seq, time, data}`, `time` in whole milliseconds, session:1126–1128). */
export interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly time: number
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

/** The two session-lifecycle listeners of SessionEventHost, for rows whose `on` is optional and carries more events beside them. */
export type SessionEventOn = {
  (event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void
  (event: 'session/disposed', listener: (session: SessionLike) => void): () => void
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

/**
 * The `agent/request` waterfall payload (rc.3 dsh-agent-loop
 * agent-loop:1191–1194, before every model call): the step's turn and step.
 * A listener proposes the request config; an observer returns `next()`'s
 * unchanged.
 */
export interface AgentRequestPayload {
  readonly turn: number
  readonly step: number
  readonly signal: AbortSignal
}

/**
 * The `agent/request-error` waterfall payload (rc.3 agent-loop:1136–1146,
 * when the stream ended aborted or in error): the failed step, the route and
 * the failure, with the retry policy a caller may answer with
 * `{kind: 'retry'}`.
 */
export interface AgentRequestErrorPayload extends AgentRequestPayload {
  readonly provider: string
  readonly failure: { readonly message: string }
  readonly retryPolicy?: unknown
}

/**
 * The `user-questions/request` waterfall (rc.3 dsh-user-questions
 * user-questions:668–691): one DSH native question request, with its
 * questions and the live owner agent. The default `next()` is the
 * no-answerer rejection (`UserQuestionError` code `NO_PROVIDER`); a listener
 * answers or passes it on. The answer is a batch of per-question answers
 * (`{answers: [{id, label, …}]}`), a pending result
 * (`{pending: true, callId}`) when the foreground wait timed out.
 */
export interface UserQuestionsRequest {
  readonly questions: readonly unknown[]
  readonly agent?: AgentLike
  readonly signal?: AbortSignal
}

export type UserQuestionsAnswer = { readonly answers: readonly { readonly id?: unknown, readonly label?: unknown }[] } | { readonly pending: true, readonly callId?: unknown }

export type UserQuestionsListener = (request: UserQuestionsRequest, next: () => Promise<UserQuestionsAnswer>) => Promise<UserQuestionsAnswer>

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
  /** The model call of a step (agent-scoped dispatch; rc.3 agent-loop:1191): observes or proposes the request config. */
  on(event: 'agent/request', listener: (payload: AgentRequestPayload, next: () => Promise<unknown>) => Promise<unknown>): () => void
  /** A step's stream ended aborted or in error (rc.3 agent-loop:1136); the decision may be `{kind: 'retry'}`. */
  on(event: 'agent/request-error', listener: (payload: AgentRequestErrorPayload, next: () => Promise<unknown>) => Promise<unknown>): () => void
  /** Session log events, also on an agent's scope: the agent loop listens there itself (agent-loop agent.ts:357; rc.3 dsh-agent-loop lib/index.js:976). */
  on(event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void
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

/**
 * cordis `ctx.inject(names, callback)` (cordis:1600): runs the callback in a
 * child fiber whose context carries the named services once they are all
 * present, and disposes that fiber when one leaves; a function the callback
 * returns runs at that disposal (cordis:1071, 1142–1143). rc.3 dsh-subagent
 * and dsh-user-questions register their projection units this way.
 */
export interface InjectHost {
  inject<K extends keyof InjectableServices>(names: readonly K[], callback: (ctx: Pick<InjectableServices, K> & ProvideHost & ServiceLookup) => (() => void) | void): unknown
}

/** The services rows take optionally through `ctx.inject`. */
export interface InjectableServices {
  readonly sessionProjections: SessionProjectionsService
  readonly agents: AgentsService
  readonly subagents: SubagentsService
  readonly tools: ToolsLike
  /**
   * `sessionController` (api-session-controller:2951–2952): only a process
   * that has it can reach a session, so only there does the loop board
   * provide its service and run entries (loop board design §3.1, §6.1).
   * `resolveAgent` revives a cold session, or says why not with the codes
   * `session/not-found`, `session/writer-held`, `gateway/internal`
   * (api-session-controller:3037–3039, 221–246); the delivery that calls it
   * comes with the main agent's side of the board.
   */
  readonly sessionController: {
    resolveAgent(sessionId: string): Promise<{ readonly agent?: AgentLike, readonly error?: { readonly code: string, readonly message?: string } }>
  }
  readonly commands: CommandsHost<AgentCommandInvocationLike>['commands']
  /**
   * The model catalog the execute row checks a dispatch's model choice
   * against (M7 §3.1.3 — a check, not a gate) and the stored-session reader
   * the reconcile folds a lost worker's last `structured_output` call from
   * (§3.9.6).
   */
  readonly llm: LlmCatalog
  readonly sessionQuery: SessionQueryService
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
 * button does (agent-loop:815–821; api-session-controller:1065). `ctx` is
 * the agent's scoped context (runtime-types.ts:202–203), on which the step
 * mailbox (step-mailbox.ts) listens; optional only so that test agents may
 * leave it out.
 */
export interface LiveAgentLike {
  readonly id: string
  readonly session: SessionLike
  readonly status: 'idle' | 'running'
  readonly ctx?: PluginContext
  followup(message: UserNotice): void
  inject(message: UserNotice): void
  cancel(cause: { readonly kind: 'user' }, options: { readonly keepInbox: true }): void
}

/** The `agents` registry member the run controls read (rc.3 dsh-agent `get`, agent:596): the live agent of a session id, undefined when none is live. */
export interface AgentsService {
  get(id: string): LiveAgentLike | undefined
}

/**
 * A live agent a message can be put in front of in each of the three ways
 * (rc.3 dsh-agent-loop `ReactLoopAgent`, agent-loop:790–821): `steer` reaches
 * the running turn's next step (and wakes an idle agent), `inject` the next
 * step without waking, `followup` opens the next turn.
 */
export interface MessageableAgentLike extends LiveAgentLike {
  steer(message: UserNotice): void
}

/**
 * The `agents` registry as the rules board reads it: `get(id)` is the live
 * agent of a session id, undefined once it is released (agent:596); `list()`
 * is every live agent in registration order (agent:614–616).
 */
export interface MessageableAgentsService {
  get(id: string): MessageableAgentLike | undefined
  list(): readonly MessageableAgentLike[]
}

/** What a goal operation names: the goal and the revision the caller read; any other revision is refused as stale (rc.3 dsh-goal `expectCurrent`, goal:760–765). */
export interface GoalRef {
  readonly id: string
  readonly revision: number
}

/** A goal as the service returns it, as far as the rules board reads it: its identity, its revision (every change raises it by one, goal:174) and its phase. */
export interface GoalView extends GoalRef {
  readonly phase: string
  /**
   * Why a `blocked` goal is blocked (dsh-goal `GoalBlockReason` of
   * `GoalSnapshot`, which `GoalView` extends: `{code, message}`). The loop
   * board reads the code to word what it says about a drive that is blocked
   * when a peak ends (loops design §6.9 item 4 row 9); it never judges whether
   * to resume by it, which stays with the execute row.
   */
  readonly blockedReason?: { readonly code: string, readonly message: string }
  /** The goal's objective (dsh-goal `GoalSnapshot.objective`); the execute row recognises its own drive's goal by the `Project graph goal <id>:` prefix. */
  readonly objective?: string
  /**
   * Whether the goal may continue on its own in this process (dsh-goal view,
   * goal:880–888): `create` and `resume` arm, `pause`, `block`, `complete`
   * and every `agent/created` disarm (goal:594–596). An `active` goal that is
   * `disarmed` waits for a resume.
   */
  readonly activation?: 'armed' | 'disarmed'
}

/**
 * What `goal/changed` carries (dsh-goal `commit`, goal:872–877): the change
 * (its operation, the reference it names and the view after it, absent once
 * cleared). It is emitted through `agentEvents(ctx, agent)`, which fuses the
 * live agent into the payload, so a host-level `ctx.on('goal/changed')`
 * receives `{agent, change}` (goal-round-driver:243).
 */
export interface GoalChangedPayload {
  readonly agent: LiveAgentLike
  readonly change: {
    readonly operation: string
    readonly ref: GoalRef
    readonly goal?: GoalView
  }
}

/**
 * The `goals` service members the rules board and the execute row use (rc.3
 * dsh-goal, no installed `.d.ts`): `get` is the goal of an exact live agent,
 * undefined when it has none (goal:611–614); `pause` takes an `active` goal
 * to `paused` and `resume` an `active`, `paused` or `blocked` one to `active`
 * while its round budget lasts, each returning the new view (goal:676–699).
 * The execute row drives the rest of the life cycle (M7 design §3.9.1):
 * `create` builds the goal of a released design (`{objective, maxGoalRounds?}`,
 * `GOAL_ALREADY_EXISTS` when an unfinished one stands, goal:635–650), `edit`
 * changes `objective` or `maxGoalRounds` (goal:657–669), `complete` finishes
 * it (goal:706–712), `block` stops it with a lowercase-hyphen reason code and
 * message (goal:720–729) and `clear` removes it (goal:736–753). Every member
 * throws `GoalError` for an agent that is not the registry's live instance
 * (goal:767–769), and the changes for a reference that is not the current
 * goal and revision (`GOAL_STALE_REVISION`, goal:760–765) or a phase they do
 * not take (`GOAL_INVALID_TRANSITION`). The service layer checks no human
 * authority; that comes from the chat before the row calls (tool-goal:49–52).
 * The round driver cancels the running step of a paused agent only when the
 * initiator is not that agent (goal-round-driver:246).
 */
export interface GoalsService {
  get(agent: LiveAgentLike): GoalView | undefined
  create(agent: LiveAgentLike, request: { readonly objective: string, readonly maxGoalRounds?: number }): GoalView
  edit(agent: LiveAgentLike, ref: GoalRef, change: { readonly objective?: string, readonly maxGoalRounds?: number }): GoalView
  pause(agent: LiveAgentLike, ref: GoalRef): GoalView
  resume(agent: LiveAgentLike, ref: GoalRef): GoalView
  complete(agent: LiveAgentLike, ref: GoalRef): GoalView
  block(agent: LiveAgentLike, ref: GoalRef, reason: { readonly code: string, readonly message: string }): GoalView
  clear(agent: LiveAgentLike, ref: GoalRef): void
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

/** Why an activation ended (rc.3 `SubagentStopReasonMap`, subagent types). */
type SubagentStopReason = 'completed' | 'aborted' | 'error' | 'max-tokens' | 'refusal'

/** What a settled activation hands back (rc.3 `SubagentResult`). */
interface SubagentResult {
  readonly output: readonly unknown[]
  readonly structured?: unknown
  readonly diagnostic?: string
  readonly stopReason: SubagentStopReason
}

/** A started activation (rc.3 `SubagentActivation`): the child's session id, the accepted message and the result promise. */
interface SubagentActivation {
  readonly childId: string
  readonly messageId?: string
  readonly result: Promise<SubagentResult>
  dispose(): Promise<void>
}

/** The dispatch the execute row starts (rc.3 `SubagentActivationSpec`, `SubagentStartRequest`; the execute row passes no `agentPreset`). */
interface SubagentStartSpec {
  readonly provider: string
  readonly label: string
  readonly childId?: string
  readonly request: {
    readonly cwd?: string
    readonly prompt: readonly unknown[]
    readonly parent: LiveAgentLike
    readonly agentOptions?: { readonly provider?: string, readonly model?: string, readonly reasoningEffort?: string }
    readonly outputSchema?: unknown
    readonly maxDepth?: number
  }
  readonly signal: AbortSignal
  readonly delivery: 'caller' | 'parent'
}

/** A run an external provider started (rc.3 `SubagentRun`). */
interface SubagentRun {
  readonly id: string
  readonly result: Promise<SubagentResult>
  dispose(): Promise<void>
}

/** An entry of a parent's durable direct-child catalog (rc.3 `SubagentCatalogEntry`). */
interface SubagentCatalogEntry {
  readonly id: string
  readonly createdAt: number
  readonly label?: string
  readonly mode: 'one-shot' | 'external' | 'continuable' | 'unknown'
}

/**
 * One semantic event document of a session log (official
 * `@deepseek-ai/dsh-session-query@0.2.1-rc.3` `SessionEventSearchDocument`
 * extends `SessionEventRecord`, lib/types/types.d.ts:45–55, 210–212; rc.3
 * session-query:614–631): one per event whose extracted text is not empty,
 * `time` in epoch milliseconds. `SessionId`, `SessionSeq` and
 * `SessionEventType` are branded or keyed types there; read here as their
 * base types.
 */
export interface SessionEventDocumentLike {
  readonly seq: number
  readonly type: string
  readonly time: number
  readonly surface: 'current' | 'shadowed' | 'log-only'
  readonly text: string
}

/**
 * The `sessionQuery` member the transcript row calls (official
 * lib/types/index.d.ts:118; rc.3 session-query:1152–1163): every document
 * of one live-preferred session log in ascending seq order; an empty filter
 * list keeps every document (session-query:669).
 */
export interface SessionQueryLike {
  filterEvents(sessionId: string, filters: readonly []): Promise<readonly SessionEventDocumentLike[]>
}

/**
 * An external activation backend the execute row registers for its checks
 * (rc.3 `SubagentProvider`, subagent:3256–3267; `ResolvedSubagentStartRequest`
 * carries the resolved `cwd`). Its capabilities are all false (the frozen
 * `NO_START_CAPABILITIES`, subagent:2789–2794): an external activation takes
 * no `agentOptions`, preset, schema or depth — the harness checks and waits
 * for its result. `inheritsParentContext` is false: the backend runs its own
 * permissions.
 */
interface SubagentProvider {
  readonly name: string
  readonly capabilities: { readonly agentOptions: false, readonly agentPreset: false, readonly outputSchema: false, readonly depthLimit: false }
  readonly inheritsParentContext: false
  readonly agentRouteDefaults?: Readonly<{ readonly provider: string, readonly model: string }>
  start(request: {
    readonly cwd: string
    readonly agentPreset?: string
    readonly label?: string
    readonly prompt: readonly unknown[]
    readonly parent: LiveAgentLike
    readonly signal: AbortSignal
    readonly agentOptions?: { readonly provider?: string, readonly model?: string, readonly reasoningEffort?: string }
    readonly outputSchema?: unknown
    readonly maxDepth?: number
  }): Promise<SubagentRun>
}

/**
 * The `subagents` service members the run controls and the execute row call
 * (rc.3 dsh-subagent). `interrupt` (subagent:3105) cancels, under a `user`
 * authority, the current turn of a live direct child of that parent session
 * and keeps its inbox; an absent child is an accepted no-op; a child of
 * another parent throws `UNAUTHORIZED`.
 *
 * What the execute row adds (M7 design §3.1.2, §3.8.2, §4):
 * - `startActivation` (subagent:3036–3048, `startLocal` 1391–1477) starts a
 *   child from a `spawn` provider or a registered external one and resolves
 *   with the activation as soon as the child is accepted; a `childId` already
 *   taken throws `DUPLICATE_CHILD` (1430–1437), an exhausted activation
 *   budget `ACTIVATION_LIMIT_REACHED` (1046–1048). `request.cwd` an absolute
 *   path is used as-is (1523–1527), `agentOptions` merge over the parent's
 *   route (315–329), `outputSchema` gives the child `structured_output`
 *   (889–960) and `delivery: 'caller'` keeps the harness as the only reader
 *   of the result (1460, 2048–2063).
 * - `resolveMaxDepth` (3023–3030) is the depth budget a dispatch passes on so
 *   a worker cannot dispatch again.
 * - `registerProvider` (3256–3267) installs an external backend; the disposer
 *   unregisters it (new starts refuse, running ones live on).
 * - `waitForChildren(parent)` (1296–1330) joins every progressing descendant;
 *   true means work was joined and the host rechecks the parent's idle state.
 * - `sendMessage(sender, targetId, content, options)` (1538–1550, 2119–2135)
 *   steers one message to the sender's direct parent or direct continuable
 *   child; an idle child starts a turn, an absent one cold-resumes from
 *   persistence (2141–2189) without its `outputSchema` — which is why M7
 *   refuses ended worker ids at the tool (§3.2.5).
 * - `listChildren(parentSessionId, signal?)` (2339–2352) reads the durable
 *   direct-child catalog without loading anyone: the reconcile's map of what
 *   survived a restart.
 */
export interface SubagentsService {
  interrupt(targetSessionId: string, authority: { readonly kind: 'user', readonly parentSessionId: string }): void
  startActivation(spec: SubagentStartSpec): Promise<SubagentActivation>
  resolveMaxDepth(configured?: number | 'provider-managed'): number | undefined
  registerProvider(provider: SubagentProvider): () => void
  waitForChildren(parent: LiveAgentLike): Promise<boolean>
  sendMessage(sender: LiveAgentLike, targetId: string, content: readonly unknown[], options: { readonly signal: AbortSignal }): Promise<string>
  listChildren(parentSessionId: string, signal?: AbortSignal): Promise<readonly SubagentCatalogEntry[]>
}

/**
 * The `llm` service members the execute row reads for the model choice (rc.3
 * dsh-llm, service name `llm`, 1816): `listModels` (typert.host.js:236,
 * `async listModels(provider: string): Promise<LlmModelInfo[]>`) is the
 * deduplicated catalog of a provider — the runtime does not bind the catalog
 * to routing, so it is a check, not a gate (§3.1.3) — and it throws for a
 * provider that is not registered; `resolveModelInfo` (typert.host.js:243,
 * async) adds the model's `reasoning.efforts` when it has any.
 */
export interface LlmCatalog {
  listModels(provider: string): Promise<readonly { readonly id: string, readonly name?: string }[]>
  resolveModelInfo(provider: string, model: string): Promise<{ readonly reasoning?: { readonly efforts?: readonly string[] } } | undefined>
}

/**
 * One observation of a session (rc.3 dsh-session-query
 * `SessionObservationReader`, session-query:450–507): the registered
 * projections' client views at the observation's cut (`values` holds a key
 * only for a unit with a wire view), and a `Symbol.dispose` member that
 * releases the lease (dsh-subagent's `listChildren` disposes it after the
 * read, subagent:2339–2352).
 */
export interface SessionObservationLike {
  readonly projections?: { readonly values?: Readonly<Record<string, unknown>> }
}

/**
 * The `sessionQuery` service member the reconcile reads (rc.3 dsh-session-query
 * `observeSession`, session-query:1064): an async read of one live or stored
 * session that rejects with `SESSION_QUERY_SESSION_NOT_FOUND` when there is
 * none; the handback projection folds a lost worker's last
 * `structured_output` call from it (§3.9.6).
 */
export interface SessionQueryService {
  observeSession(sessionId: string, options?: { readonly signal?: AbortSignal }): Promise<SessionObservationLike>
}

/**
 * One stored reminder of the host-wide schedule service, as it comes back
 * from `create`, `list` and `catalog` (rc.3 dsh-schedule: the decoders
 * require exactly the keys of their kind, schedule:256–312 `at` and `after`,
 * 356–365 `every`, 411–421 `daily`, 463–472 `weekly`, and the cron decoder
 * after it; `scheduledAt` is a canonical UTC instant, schedule:150–156). The
 * keys of the other kinds are optional here because one type covers all of
 * them; the loop board reads only the ones of the record's own `kind`.
 */
export interface ScheduleRecordLike {
  readonly id: string
  readonly kind: 'at' | 'after' | 'every' | 'daily' | 'weekly' | 'cron'
  readonly title: string
  readonly prompt: string
  readonly scheduledAt: string
  readonly everySeconds?: number
  /** `HH:mm:ss.SSS`, normalized by the host (schedule:1056–1057). */
  readonly time?: string
  /** The `Intl` canonical zone name the host normalized to (schedule:212–222). */
  readonly timeZone?: string
  readonly weekdays?: readonly number[]
  readonly expression?: string
}

/** One row of `schedule.catalog()`: the record, the session it is bound to, whether it still fires, and the last delivery (schedule:2129–2136; the delivery is written at schedule:1598). */
export interface ScheduleCatalogEntry extends ScheduleRecordLike {
  readonly sessionId: string
  readonly status: 'active' | 'inactive'
  readonly lastDelivery?: { readonly scheduledAt: string, readonly deliveredAt: string, readonly messageId: string }
}

/**
 * The timing of a reminder as `create` and the `change` of `update` take it:
 * exactly one selector, in the host's snake-case wire form (schedule:2083–2093
 * dispatches on these keys; `every_seconds` is at least 60, schedule:21; the
 * `change` of an update carries `kind` and its own selector and nothing else,
 * schedule:1710–1716).
 */
export type ScheduleSelector =
  | { readonly at: string }
  | { readonly every_seconds: number }
  | { readonly daily: { readonly time: string, readonly time_zone: string } }
  | { readonly weekly: { readonly time: string, readonly time_zone: string, readonly weekdays: readonly number[] } }
  | { readonly cron: { readonly expression: string, readonly time_zone: string } }

/** The timing change of an `update`: the kind and the one selector that belongs to it (schedule:1710–1716). */
export type ScheduleChange = { readonly kind: 'at' | 'every' | 'daily' | 'weekly' | 'cron' } & ScheduleSelector

/**
 * What `update` answers (schedule:2197–2224, resolveScheduleUpdate at
 * schedule:1806–1837): the committed record, `updated: false` for a change the
 * host normalized to the stored rule, or a result that changed nothing with
 * the code `schedule_conflict`, `schedule_not_found`, `schedule_ended`,
 * `invalid_rule`, `invalid_prompt` or `subagent_session`. An input that does
 * not decode has no `id`.
 */
export type ScheduleUpdateResult =
  | { readonly id: string, readonly updated: true, readonly record: ScheduleRecordLike }
  | { readonly id: string, readonly updated: false, readonly record?: ScheduleRecordLike, readonly code?: string, readonly message?: string }
  | { readonly id?: undefined, readonly updated?: undefined, readonly code: string, readonly message?: string }

/**
 * The `schedule` service members the loop board calls (rc.3 dsh-schedule,
 * `super(ctx, "schedule")` at schedule:1992; the model-facing tools read the
 * same service as `ctx.schedule`, tool-schedule:540). Read through
 * `ctx.get('schedule')` and not through `inject`: a headless composition
 * mounts no schedule row, and the board degrades without one (loop board
 * design §10.1, §11.1).
 *
 * `create` throws `ScheduleInputError` for a title that is empty or over 120
 * characters (schedule:93–97), for more or fewer than one selector
 * (schedule:2083) and for a session a delegated child owns
 * (schedule:2254–2261, the only session it refuses: an archived session is
 * accepted). `delete` is a hard removal, the saved deliveries with it
 * (schedule:2164–2182). `list` returns the active records of one session
 * (schedule:2120–2122), which is what an `update` has to pass as `expected`.
 */
export interface ScheduleService {
  create(sessionId: string, request: { readonly title: string, readonly prompt: string } & ScheduleSelector, signal?: AbortSignal): Promise<ScheduleRecordLike>
  list(request: { readonly sessionId: string }): Promise<readonly ScheduleRecordLike[]>
  catalog(): Promise<readonly ScheduleCatalogEntry[]>
  delete(request: { readonly sessionId: string, readonly id: string }, signal?: AbortSignal): Promise<{ readonly id: string, readonly deleted: boolean, readonly code?: string }>
  update(request: {
    readonly sessionId: string
    readonly id: string
    /** The complete record the caller observed, as `list` gave it; anything else is `invalid_rule` or `schedule_conflict` (schedule:1806–1815). */
    readonly expected: ScheduleRecordLike
    readonly title?: string
    readonly prompt?: string
    readonly change?: ScheduleChange
  }, signal?: AbortSignal): Promise<ScheduleUpdateResult>
}

/**
 * The `workspaceRegistry` service members the loop board reads (rc.3
 * dsh-workspace, `super(ctx, "workspaceRegistry")` at dsh-workspace:376):
 * `archivedSessionIds` is a getter over the stored state
 * (dsh-workspace:506–508) and `list()` the registered workspaces in display
 * order (dsh-workspace:454–460); both call `requireState`, which throws while
 * the service has not started (dsh-workspace:934–937). Archiving with
 * `stopActivity` writes the archive set first and then asks the
 * `workspace/session-stop` providers to stop the session's activity, which is
 * how the schedule service drops that session's active tasks
 * (dsh-workspace:526–541, 621–629; schedule:2056–2058).
 */
export interface WorkspaceRegistryService {
  readonly archivedSessionIds: readonly string[]
  list(): ReadonlyArray<{ readonly path: string }>
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
