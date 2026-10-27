/**
 * dsh-glm-guard — execution-boundary guard row (S1 subset).
 *
 * Seam (verified): the `tools/pre-execute` waterfall receives the pending
 * call and returns a PreToolDecision; returning a deny decision with reason
 * text blocks the call before execution. The four-part corrective message is
 * the reason — deny stays hard, teaching rides along. Every denial is
 * journaled in the project directory (`<home>/audit/violations.jsonl`; the
 * row's own home, else the data service's, docs/DESIGN.md §2.4).
 *
 * Containment roots come from config, else the calling Agent's immutable
 * session directory (session.header.cwd), else the containment rule is
 * skipped for that call — never the plugin process cwd, which is the harness
 * install directory, not the workspace, and never a throw at activation.
 */
import { evaluate, fileToolsOnly, renderCorrection, workspaceContainment, type GuardRule, type ToolCall } from './rules.ts'
import { rowJournal, type AuditFs } from '../memory/audit.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { JsonValue } from '../glm-prompt/json.ts'
import type { PreExecuteHost, ServiceLookup, ToolExecutionPayload } from '../shared/dsh-min.ts'

/** One audit record (JSONL line) for a denied call. */
export interface ViolationRecord {
  readonly at: string
  readonly rule: string
  readonly tool: string
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  readonly correction: string
}

export interface GuardConfig {
  /** Workspace roots writes are confined to; defaults to the calling agent's session directory. */
  readonly workspaceRoots?: readonly string[] | undefined
  /** Extra rules beyond the two shipped ones. */
  readonly rules?: readonly GuardRule[]
  /** The project directory (workspace `.llm`) for the violation journal; defaults to the data service's. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs
}

/** All active rules (shipped two first so user rules cannot weaken them). */
export function activeRules(config: GuardConfig & { workspaceRoots: readonly string[] | undefined }): readonly GuardRule[] {
  return [...(config.workspaceRoots === undefined ? [] : [workspaceContainment(config.workspaceRoots)]), fileToolsOnly, ...(config.rules ?? [])]
}

/** Containment roots for one call: config wins, else the agent's session directory. */
export function rootsFor(payload: ToolExecutionPayload, config: GuardConfig): readonly string[] | undefined {
  if (config.workspaceRoots !== undefined) return config.workspaceRoots
  const cwd = payload.agent?.session?.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? [cwd] : undefined
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/guard'

/** cordis plugin entry. */
export function apply(ctx: PreExecuteHost & ServiceLookup, config: GuardConfig = {}): () => void {
  const journal = rowJournal(name, () => dataHomes(ctx, config.home), config.fs)
  return ctx.on('tools/pre-execute', async (payload, next) => {
    if (payload.parent !== undefined) return next()
    const call: ToolCall = { name: payload.name, arguments: (payload.arguments ?? {}) as JsonValue }
    const rules = activeRules({ ...config, workspaceRoots: rootsFor(payload, config) })
    const verdict = evaluate(rules, call)
    if (verdict.kind === 'deny') {
      // rc.3 executions carry the calling agent, not its ids (dsh-tools createExecution).
      void journal.violation({
        at: new Date().toISOString(),
        rule: verdict.rule,
        tool: payload.name,
        agentId: payload.agent?.id,
        sessionId: payload.agent?.session?.id,
        correction: renderCorrection(verdict.correction),
      })
      return { kind: 'deny', reason: renderCorrection(verdict.correction) }
    }
    return next()
  })
}
