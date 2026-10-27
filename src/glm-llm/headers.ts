/**
 * Upstream header assembly for the native ZCode client (ported from
 * reference/zcode-api src/proxy/upstream.ts): identity headers (LLM plane,
 * `g6n`) + attribution/trace headers (`Bdt`-family) + the plan-dependent auth
 * scheme, with the `ai-sdk/anthropic/3.0.81` User-Agent suffix only on LLM
 * requests.
 */
import { randomUUID } from 'node:crypto'
import { buildLlmIdentityHeaders, type ZcodeIdentity } from './identity.ts'
import { credentialString, type Credential } from './auth/types.ts'

/** anthropic-version the ZCode client pins. */
export const ANTHROPIC_VERSION = '2023-06-01'
/** SDK UA suffix the real client appends on LLM requests (bundle `Cm`/`k0o`). */
export const ANTHROPIC_SDK_UA = 'ai-sdk/anthropic/3.0.81'

export type PlanId = 'coding-plan' | 'start-plan'

/** Attribution/trace context for one request. */
export interface TraceContext {
  /** Enforced conversation session id; coding-plan always carries one (signing requires it). */
  readonly sessionId?: string
  readonly requestId?: string
  readonly traceId?: string
  readonly queryId?: string
  readonly sessionType?: 'main' | 'subagent' | 'other'
}

/** Trace headers: exact context when provided, synthesized UUIDs otherwise (coding-plan gains x-query-id/x-session-id). */
export function buildTraceHeaders(plan: PlanId, trace?: TraceContext): Record<string, string> {
  if (trace !== undefined) {
    const sessionId = trace.sessionId ?? (plan === 'coding-plan' ? randomUUID() : undefined)
    return {
      ...(trace.requestId === undefined ? {} : { 'x-request-id': trace.requestId }),
      ...(trace.sessionType === undefined ? {} : { 'x-zcode-session-type': trace.sessionType }),
      ...(trace.traceId === undefined ? {} : { 'x-zcode-trace-id': trace.traceId }),
      ...(trace.queryId === undefined ? {} : { 'x-query-id': trace.queryId }),
      ...(sessionId === undefined ? {} : { 'x-session-id': sessionId }),
    }
  }
  const headers: Record<string, string> = {
    'x-request-id': randomUUID(),
    'x-zcode-session-type': 'main',
    'x-zcode-trace-id': randomUUID(),
  }
  if (plan !== 'start-plan') {
    headers['x-query-id'] = randomUUID()
    headers['x-session-id'] = randomUUID()
  }
  return headers
}

/**
 * Full upstream header set for one LLM request. Coding-plan anthropic sends
 * the credential in BOTH `x-api-key` and `Authorization` (bundle `ebo`);
 * start-plan sends the plan JWT bearer only.
 */
export function buildAuthHeaders(cred: Credential, identity: ZcodeIdentity, plan: PlanId = 'coding-plan', trace?: TraceContext, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    ...buildLlmIdentityHeaders(identity, env),
    ...buildTraceHeaders(plan, trace),
  }
  headers['User-Agent'] = `${headers['User-Agent']} ${ANTHROPIC_SDK_UA}`
  const credStr = plan === 'start-plan' && cred.jwt !== undefined ? cred.jwt : credentialString(cred)
  if (plan === 'start-plan' && cred.jwt !== undefined) {
    headers.authorization = `Bearer ${credStr}`
  }
  else {
    headers['x-api-key'] = credStr
    headers.authorization = `Bearer ${credStr}`
  }
  headers['anthropic-version'] = ANTHROPIC_VERSION
  return headers
}
