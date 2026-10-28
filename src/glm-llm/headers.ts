/**
 * Upstream header assembly for the native ZCode client: identity headers
 * (LLM plane, `g6n`) + 3.16.3 attribution headers + the request credential.
 * coding-plan model requests are built the way the AI SDK inside 3.16.3
 * builds them (`buildModelRequestHeaders`); start-plan keeps the earlier
 * zcode-api shape (`buildAuthHeaders`).
 */
import { randomUUID } from 'node:crypto'
import { buildLlmIdentityHeaders, type ZcodeIdentity } from './identity.ts'
import { AI_UA_PREFIX, AI_VERSION, ANTHROPIC_SDK_UA_PREFIX, ANTHROPIC_SDK_VERSION, PROVIDER_UTILS_UA_PREFIX, PROVIDER_UTILS_VERSION, QUERY_SOURCE_HEADER, QUERY_SOURCES, RUNTIME_NODE_UA_PREFIX, SESSION_TYPE_HEADER, TRACE_ID_HEADER } from './zcode-wire.ts'
import type { RequestMessageLike } from '../shared/lm-min.ts'

/** anthropic-version the ZCode client pins. */
export const ANTHROPIC_VERSION = '2023-06-01'
/** The Anthropic provider's User-Agent segment (`gjs`). */
export const ANTHROPIC_SDK_UA = `${ANTHROPIC_SDK_UA_PREFIX}${ANTHROPIC_SDK_VERSION}`

export type PlanId = 'coding-plan' | 'start-plan'

/** Attribution/trace context for one request (3.16.3 `createModelRequestAttributionHeaders` input). */
export interface TraceContext {
  /** The upstream x-session-id; coding-plan always carries one (signing requires it). */
  readonly sessionId: string
  /** Fresh per attempt. */
  readonly requestId: string
  readonly traceId: string
  readonly queryId?: string | undefined
  readonly querySource?: QuerySource | undefined
  readonly sessionType: 'main' | 'subagent' | 'other'
}

/** The query sources of the requests this channel sends (3.16.3 `mDn` @13259914, compaction @13389086, `v2n` @13069774). */
type QuerySource = typeof QUERY_SOURCES[keyof typeof QUERY_SOURCES]

/** Characters an upstream session id may carry (header-safe; DSH session ids are `session-<uuid>`). */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

/**
 * The upstream `x-session-id` for one request of a DSH session: the session
 * id with DSH's `session-` prefix stripped, so every request of a
 * conversation carries the same value, as ZCode does (3.16.3
 * runner-attribution `createModelRequestAttributionHeaders`, which strips its
 * own internal `sess_` prefix). The BigModel gateway routes by this header
 * for prompt-cache affinity (docs/DESIGN.md §4.5b, measured 2026-10-28).
 * Without a usable session id the request gets a fresh one.
 */
export function upstreamSessionId(sessionId: string | undefined): string {
  if (sessionId === undefined) return randomUUID()
  const bare = sessionId.startsWith('session-') && sessionId.length > 'session-'.length ? sessionId.slice('session-'.length) : sessionId
  return SESSION_ID_PATTERN.test(bare) ? bare : randomUUID()
}

/** The session-header fields that mark a delegated child (rc.3 dsh-session header, dsh-subagent `childSessionMeta`). */
export interface SessionHeaderLike {
  readonly parentSession?: string
  readonly origin?: 'subagent'
}

/** Sessions whose trace state the tracker keeps; the least recently used leaves first. */
const ATTRIBUTION_SESSION_LIMIT = 256
/** Parent links followed to the root of a delegation chain. */
const MAX_DELEGATION_DEPTH = 16

interface SessionTrace {
  readonly traceId: string
  turnKey?: string | undefined
  queryId?: string | undefined
  /** The query id was opened by a session-title request and no turn has claimed it yet. */
  titleOpened?: boolean | undefined
  /** The reasoning effort of the session's latest main step. */
  stepEffort?: string | undefined
}

/** The turn of a request: the id of its latest message typed by the user (`source.kind: 'user'`). */
function turnKeyOf(messages: readonly RequestMessageLike[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role === 'user' && message.source?.kind === 'user' && typeof message.id === 'string') return message.id
  }
  return undefined
}

/**
 * The 3.16.3 attribution of coding-plan requests (docs/DESIGN.md §4.5b):
 * - trace id per session: 3.16.3 builds one root trace context per session
 *   runtime (`vT` @1421911) and derives every turn from it (`nS`, `Lw`); a
 *   delegated child inherits its parent's trace;
 * - query id per turn: 3.16.3 takes the desktop input id (`O9`
 *   @14502646, `zzo` @13357726); the channel opens a turn at each new
 *   user-typed message of a main step and gives it a fresh UUID;
 * - auxiliary requests (session title, compaction) run inside the current
 *   turn (3.16.3 `c3a` @13387356 derives the compaction context with `nS`,
 *   which keeps the turn's `queryId`): they take no turn key and reuse the
 *   session's current query id; without one they open it, and only a
 *   title-opened id is adopted by the next step (DSH sends the title request
 *   alongside the first step). A DSH compaction request holds only the
 *   compacted span, whose last typed message is usually an earlier turn's;
 * - session type and query source: title `other` + `session_title`,
 *   compaction `other` + `compact`, a delegated child `subagent` +
 *   `subagent`, otherwise `main` + `main_turn` (`Y0n` @4065835, `mDn`).
 *
 * It also keeps the reasoning effort of each session's latest main step:
 * 3.16.3 compacts with the session's model selection (`c3a` @13387356,
 * `jT` @12830530), and a DSH compaction request carries no effort of its own.
 */
export class RequestAttributionTracker {
  private readonly sessions = new Map<string, SessionTrace>()
  private readonly headerOf: (sessionId: string) => SessionHeaderLike | undefined

  constructor(headerOf: (sessionId: string) => SessionHeaderLike | undefined = () => undefined) {
    this.headerOf = headerOf
  }

  attribute(request: { readonly sessionId?: string | undefined, readonly purpose?: 'compaction' | 'session-title' | undefined, readonly reasoningEffort?: string | undefined, readonly messages: readonly RequestMessageLike[] }): Omit<TraceContext, 'requestId'> {
    const sessionId = upstreamSessionId(request.sessionId)
    const subagent = request.sessionId !== undefined && this.headerOf(request.sessionId)?.origin === 'subagent'
    const kind = request.purpose === 'session-title'
      ? { sessionType: 'other' as const, querySource: QUERY_SOURCES.sessionTitle }
      : request.purpose === 'compaction'
        ? { sessionType: 'other' as const, querySource: QUERY_SOURCES.compact }
        : subagent ? { sessionType: 'subagent' as const, querySource: QUERY_SOURCES.subagent } : { sessionType: 'main' as const, querySource: QUERY_SOURCES.mainTurn }
    if (request.sessionId === undefined) return { sessionId, traceId: randomUUID(), queryId: randomUUID(), ...kind }
    const state = this.stateOf(request.sessionId, 0)
    if (request.purpose !== undefined) {
      if (state.queryId === undefined) {
        state.queryId = randomUUID()
        state.titleOpened = request.purpose === 'session-title'
      }
      return { sessionId, traceId: state.traceId, queryId: state.queryId, ...kind }
    }
    if (request.reasoningEffort !== undefined) state.stepEffort = request.reasoningEffort
    const turnKey = turnKeyOf(request.messages)
    if (turnKey === undefined || state.turnKey === turnKey) state.queryId ??= randomUUID()
    else {
      if (state.turnKey !== undefined || state.titleOpened !== true) state.queryId = randomUUID()
      state.turnKey = turnKey
      state.titleOpened = false
    }
    return { sessionId, traceId: state.traceId, queryId: state.queryId, ...kind }
  }

  /** The reasoning effort of the session's latest main step; undefined before its first one. */
  stepEffortOf(sessionId: string | undefined): string | undefined {
    return sessionId === undefined ? undefined : this.sessions.get(sessionId)?.stepEffort
  }

  private stateOf(sessionId: string, depth: number): SessionTrace {
    const known = this.sessions.get(sessionId)
    if (known !== undefined) {
      this.sessions.delete(sessionId)
      this.sessions.set(sessionId, known)
      return known
    }
    const header = this.headerOf(sessionId)
    const parent = header?.origin === 'subagent' && header.parentSession !== undefined && depth < MAX_DELEGATION_DEPTH ? header.parentSession : undefined
    const state: SessionTrace = { traceId: parent === undefined ? randomUUID() : this.stateOf(parent, depth + 1).traceId }
    this.sessions.set(sessionId, state)
    if (this.sessions.size > ATTRIBUTION_SESSION_LIMIT) this.sessions.delete(this.sessions.keys().next().value as string)
    return state
  }
}

/**
 * Trace headers as 3.16.3 `createModelRequestAttributionHeaders` (`Vdt`
 * @4065502) emits them: x-request-id, x-zcode-session-type,
 * x-zcode-trace-id, then x-query-id, x-zcode-query-source and x-session-id
 * when known.
 */
export function buildTraceHeaders(trace: TraceContext): Record<string, string> {
  return {
    'x-request-id': trace.requestId,
    [SESSION_TYPE_HEADER]: trace.sessionType,
    [TRACE_ID_HEADER]: trace.traceId,
    ...(trace.queryId === undefined ? {} : { 'x-query-id': trace.queryId }),
    ...(trace.querySource === undefined ? {} : { [QUERY_SOURCE_HEADER]: trace.querySource }),
    'x-session-id': trace.sessionId,
  }
}

/**
 * The start-plan header set (the earlier zcode-api shape, unchanged by
 * m1-parity): identity and trace headers, the `ai-sdk/anthropic/3.0.81`
 * User-Agent suffix and the plan JWT in `Authorization: Bearer`.
 */
export function buildAuthHeaders(bearer: string, identity: ZcodeIdentity, trace: TraceContext, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    ...buildLlmIdentityHeaders(identity, env),
    ...buildTraceHeaders(trace),
  }
  headers['User-Agent'] = `${headers['User-Agent']} ${ANTHROPIC_SDK_UA}`
  headers.authorization = `Bearer ${bearer}`
  headers['anthropic-version'] = ANTHROPIC_VERSION
  return headers
}

/** A header bag as the AI SDK passes it around: a record (undefined values drop) or a Headers instance. */
type HeaderBag = Readonly<Record<string, string | undefined>> | Headers

/** `normalizeHeaders` (`y4s` @3510098): lower-case keys, later entries win, undefined values drop. */
function normalizeHeaders(headers: HeaderBag | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (headers === undefined) return out
  if (headers instanceof Headers) {
    headers.forEach((value, name) => { out[name.toLowerCase()] = value })
    return out
  }
  for (const [name, value] of Object.entries(headers)) if (value !== undefined) out[name.toLowerCase()] = value
  return out
}

/**
 * `withUserAgentSuffix` (`Y2` @3510311): the normalized headers through a
 * `Headers` object, `user-agent` extended by the suffixes, returned as a
 * plain object, which iterates in Headers order (lower-case, sorted).
 */
export function withUserAgentSuffix(headers: HeaderBag | undefined, ...suffix: ReadonlyArray<string | undefined>): Record<string, string> {
  const normalized = new Headers(normalizeHeaders(headers))
  const current = normalized.get('user-agent') ?? ''
  normalized.set('user-agent', [current, ...suffix].filter(part => part !== undefined && part.length > 0).join(' '))
  return Object.fromEntries(normalized.entries())
}

/** The globals `getRuntimeEnvironmentUserAgent` reads. */
export interface RuntimeScope {
  readonly window?: unknown
  readonly navigator?: { readonly userAgent?: string }
  readonly process?: { readonly version: string, readonly versions?: { readonly node?: string } }
  readonly EdgeRuntime?: unknown
}

/**
 * `getRuntimeEnvironmentUserAgent` (`$ut` @3509781): `navigator.userAgent`
 * when there is one (Node 22: `Node.js/22`, so `runtime/node.js/22`), else
 * the Node version.
 */
export function runtimeUserAgent(scope: RuntimeScope = globalThis): string {
  if (scope.window !== undefined && scope.window !== null) return 'runtime/browser'
  const agent = scope.navigator?.userAgent
  if (agent !== undefined && agent.length > 0) return `runtime/${agent.toLowerCase()}`
  if (scope.process?.versions?.node !== undefined) return `${RUNTIME_NODE_UA_PREFIX}${scope.process.version}`
  return scope.EdgeRuntime !== undefined ? 'runtime/vercel-edge' : 'runtime/unknown'
}

/** `combineHeaders` (`Rh` @3505152): shallow merge, later bags win key by key (case-sensitive). */
function combineHeaders(...bags: ReadonlyArray<Readonly<Record<string, string>>>): Record<string, string> {
  return bags.reduce<Record<string, string>>((merged, bag) => ({ ...merged, ...bag }), {})
}

/**
 * The coding-plan model request headers, built the way the AI SDK inside
 * 3.16.3 builds them (docs/DESIGN.md §4.2):
 * - provider headers: `Y2({"anthropic-version", "x-api-key": PAT,
 *   Authorization: "Bearer " + PAT}, "ai-sdk/anthropic/3.0.81")`
 *   (`getHeaders` @3570073 with the account request auth of `x5s` @3843063
 *   and `T5s` @3843231);
 * - call headers: identity (`Suc` @14422777, including
 *   `User-Agent: ZCode/<version>`) and attribution (`Vdt`); `generateText`
 *   (the session title) first appends `ai/6.0.193` (@3949945);
 * - `postToApi` (`SZr`): `Y2({"Content-Type": "application/json",
 *   ...Rh(provider, call)}, "ai-sdk/provider-utils/4.0.27", runtime)`.
 * The call's `User-Agent` replaces the provider's, so a step sends
 * `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/node.js/22`. The result
 * is a plain object in Headers order: lower-case names, sorted.
 */
export function buildModelRequestHeaders(input: { readonly token: string, readonly identity: ZcodeIdentity, readonly trace: TraceContext, readonly generateText: boolean, readonly env?: NodeJS.ProcessEnv, readonly runtime?: string }): Record<string, string> {
  const provider = withUserAgentSuffix({ 'anthropic-version': ANTHROPIC_VERSION, 'x-api-key': input.token, Authorization: `Bearer ${input.token}` }, ANTHROPIC_SDK_UA)
  const callHeaders = { ...buildLlmIdentityHeaders(input.identity, input.env ?? process.env), ...buildTraceHeaders(input.trace) }
  const call = input.generateText ? withUserAgentSuffix(callHeaders, `${AI_UA_PREFIX}${AI_VERSION}`) : callHeaders
  return withUserAgentSuffix({ 'Content-Type': 'application/json', ...combineHeaders(provider, call) }, `${PROVIDER_UTILS_UA_PREFIX}${PROVIDER_UTILS_VERSION}`, input.runtime ?? runtimeUserAgent())
}
