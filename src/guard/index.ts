/**
 * dsh-glm-guard — execution-boundary guard row (S1 subset).
 *
 * Seam (verified): the `tools/pre-execute` waterfall receives the pending
 * call and returns a PreToolDecision; returning a deny decision with reason
 * text blocks the call before execution. The four-part corrective message is
 * the reason — deny stays hard, teaching rides along.
 *
 * Containment roots come from config, else the calling Agent's immutable
 * session directory (session.header.cwd), else the containment rule is
 * skipped for that call — never the plugin process cwd, which is the harness
 * install directory, not the workspace, and never a throw at activation.
 */
import { evaluate, fileToolsOnly, renderCorrection, workspaceContainment, type GuardRule, type ToolCall } from './rules.ts'
import type { JsonValue } from '../glm-prompt/json.ts'

/** Opaque Agent surface the guard reads: only the immutable session directory. */
export interface AgentRef {
  readonly session?: { readonly header?: { readonly cwd?: string } }
}

export interface PreExecutePayload {
  readonly name: string
  readonly arguments?: unknown
  /** Opaque parent token marks transport sub-dispatches (DSH has no `nested` flag). */
  readonly parent?: unknown
  /** The calling agent (DSH `ToolExecution.agent`), when the call is agent-scoped. */
  readonly agent?: AgentRef
  readonly agentId?: string
  readonly sessionId?: string
}

/** One audit record (JSONL line) for a denied call. */
export interface ViolationRecord {
  readonly at: string
  readonly rule: string
  readonly tool: string
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  readonly correction: string
}

export type PreExecuteDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny', readonly reason: string }

export interface GuardContext {
  on(event: 'tools/pre-execute', listener: (payload: PreExecutePayload, next: () => Promise<PreExecuteDecision>) => Promise<PreExecuteDecision>): () => void
}

export interface GuardConfig {
  /** Workspace roots writes are confined to; defaults to the calling agent's session directory. */
  readonly workspaceRoots?: readonly string[] | undefined
  /** Extra rules beyond the two shipped ones. */
  readonly rules?: readonly GuardRule[]
  /** Violation audit sink; omitted disables logging (detection still runs). */
  readonly onViolation?: (record: ViolationRecord) => void
}

/** All active rules (shipped two first so user rules cannot weaken them). */
export function activeRules(config: GuardConfig & { workspaceRoots: readonly string[] | undefined }): readonly GuardRule[] {
  return [...(config.workspaceRoots === undefined ? [] : [workspaceContainment(config.workspaceRoots)]), fileToolsOnly, ...(config.rules ?? [])]
}

/** Containment roots for one call: config wins, else the agent's session directory. */
export function rootsFor(payload: PreExecutePayload, config: GuardConfig): readonly string[] | undefined {
  if (config.workspaceRoots !== undefined) return config.workspaceRoots
  const cwd = payload.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? [cwd] : undefined
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/guard'

/** cordis plugin entry. */
export function apply(ctx: GuardContext, config: GuardConfig = {}): () => void {
  return ctx.on('tools/pre-execute', async (payload, next) => {
    if (payload.parent !== undefined) return next()
    const call: ToolCall = { name: payload.name, arguments: (payload.arguments ?? {}) as JsonValue }
    const rules = activeRules({ ...config, workspaceRoots: rootsFor(payload, config) })
    const verdict = evaluate(rules, call)
    if (verdict.kind === 'deny') {
      config.onViolation?.({
        at: new Date().toISOString(),
        rule: verdict.rule,
        tool: payload.name,
        agentId: payload.agentId,
        sessionId: payload.sessionId,
        correction: renderCorrection(verdict.correction),
      })
      return { kind: 'deny', reason: renderCorrection(verdict.correction) }
    }
    return next()
  })
}
