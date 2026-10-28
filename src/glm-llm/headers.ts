/**
 * Upstream header assembly for the native ZCode client (ported from
 * reference/zcode-api src/proxy/upstream.ts): identity headers (LLM plane,
 * `g6n`) + attribution/trace headers (`Bdt`-family) + the plan-dependent auth
 * scheme, with the `ai-sdk/anthropic/3.0.81` User-Agent suffix only on LLM
 * requests.
 */
import { randomUUID } from 'node:crypto'
import { buildLlmIdentityHeaders, type ZcodeIdentity } from './identity.ts'
import { QUERY_SOURCE_HEADER, QUERY_SOURCES, SESSION_TYPE_HEADER, TRACE_ID_HEADER } from './zcode-wire.ts'
import type { RequestMessageLike } from '../shared/lm-min.ts'

/** anthropic-version the ZCode client pins. */
export const ANTHROPIC_VERSION = '2023-06-01'
/** SDK UA suffix the real client appends on LLM requests (bundle `Cm`/`k0o`). */
export const ANTHROPIC_SDK_UA = 'ai-sdk/anthropic/3.0.81'

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
 *   user-typed message and gives it a fresh UUID; a session-title request
 *   reuses the session's current query id, or opens one the next step adopts
 *   (DSH sends the title request alongside the first step);
 * - session type and query source: title `other` + `session_title`,
 *   compaction `other` + `compact`, a delegated child `subagent` +
 *   `subagent`, otherwise `main` + `main_turn` (`Y0n` @4065835, `mDn`).
 */
export class RequestAttributionTracker {
  private readonly sessions = new Map<string, SessionTrace>()
  private readonly headerOf: (sessionId: string) => SessionHeaderLike | undefined

  constructor(headerOf: (sessionId: string) => SessionHeaderLike | undefined = () => undefined) {
    this.headerOf = headerOf
  }

  attribute(request: { readonly sessionId?: string | undefined, readonly purpose?: 'compaction' | 'session-title' | undefined, readonly messages: readonly RequestMessageLike[] }): Omit<TraceContext, 'requestId'> {
    const sessionId = upstreamSessionId(request.sessionId)
    const subagent = request.sessionId !== undefined && this.headerOf(request.sessionId)?.origin === 'subagent'
    const kind = request.purpose === 'session-title'
      ? { sessionType: 'other' as const, querySource: QUERY_SOURCES.sessionTitle }
      : request.purpose === 'compaction'
        ? { sessionType: 'other' as const, querySource: QUERY_SOURCES.compact }
        : subagent ? { sessionType: 'subagent' as const, querySource: QUERY_SOURCES.subagent } : { sessionType: 'main' as const, querySource: QUERY_SOURCES.mainTurn }
    if (request.sessionId === undefined) return { sessionId, traceId: randomUUID(), queryId: randomUUID(), ...kind }
    const state = this.stateOf(request.sessionId, 0)
    const turnKey = request.purpose === 'session-title' ? undefined : turnKeyOf(request.messages)
    if (turnKey === undefined || state.turnKey === turnKey) state.queryId ??= randomUUID()
    else if (state.turnKey === undefined && state.queryId !== undefined) state.turnKey = turnKey
    else {
      state.turnKey = turnKey
      state.queryId = randomUUID()
    }
    return { sessionId, traceId: state.traceId, queryId: state.queryId, ...kind }
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
 * Full upstream header set for one LLM request. `auth.apiKey` goes into
 * `x-api-key` and `auth.bearer` into `Authorization: Bearer`. Coding-plan
 * passes the project access token for both, as 3.16.3 account mode does
 * (`applyProviderRequestAuth` `x5s` @3843063 sets the provider `apiKey`,
 * `T5s` @3843231 adds the bearer); start-plan sends the plan JWT bearer only.
 */
export function buildAuthHeaders(auth: { readonly bearer: string, readonly apiKey?: string }, identity: ZcodeIdentity, trace: TraceContext, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    ...buildLlmIdentityHeaders(identity, env),
    ...buildTraceHeaders(trace),
  }
  headers['User-Agent'] = `${headers['User-Agent']} ${ANTHROPIC_SDK_UA}`
  if (auth.apiKey !== undefined) headers['x-api-key'] = auth.apiKey
  headers.authorization = `Bearer ${auth.bearer}`
  headers['anthropic-version'] = ANTHROPIC_VERSION
  return headers
}
