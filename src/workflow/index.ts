/**
 * dsh-workflow row entry: grades autonomous dispatch through the team seams
 * and journals every decision. DSH's Agent Team owns the actual spawning;
 * this row only observes (L1 logged silently, L2 journaled, L3 journaled —
 * the ask-now path is the guard's 申报 protocol, not ours). Decisions go to
 * the project directory (the row's own home, else the data service's,
 * docs/DESIGN.md §2.4); without either, the write is reported once and
 * dispatch goes on.
 */
import { rowJournal, type AuditFs, type AuditJournal } from '../memory/audit.ts'
import { gradeDecision } from './decisions.ts'
import { dataHomes } from '../shared/data-home.ts'
import { provideRowHealth, sessionIdOf, type HealthState } from '../shared/health.ts'
import type { PreExecuteHost, ProvideHost, ServiceLookup, ToolExecutionPayload } from '../shared/dsh-min.ts'

/**
 * Dispatch tool names of the rc.3 composition: the Agent Team tools
 * (dsh-experimental-tool-agent-team), `send_message` (also
 * dsh-tool-subagent-control), and the two dsh-tool-subagent rows of the
 * base profile, `subagent` (spawn) and `subagent_fork` (fork; dsh-base
 * cordis.patch.yml `toolName`).
 */
export const DISPATCH_TOOLS = ['spawn_teammate', 'team_task_create', 'team_task_update', 'send_message', 'subagent', 'subagent_fork'] as const

/** Observe root tool calls; dispatches are journaled, every root call reaches `observe` (row health). */
export function applyOverJournal(ctx: PreExecuteHost, journal: Pick<AuditJournal, 'decision'>, observe?: (payload: ToolExecutionPayload) => void): () => void {
  return ctx.on('tools/pre-execute', (payload, next) => {
    if (payload.parent === undefined) observe?.(payload)
    if (payload.parent === undefined && (DISPATCH_TOOLS as readonly string[]).includes(payload.name)) {
      const level = gradeDecision('dispatch')
      void journal.decision({
        at: new Date().toISOString(),
        level,
        kind: `dispatch:${payload.name}`,
        subject: subjectOf(payload.arguments),
      }).catch(() => {}) // journal failures never block dispatch
    }
    return next()
  })
}

/** One-line subject for the log: id/name fields when present, else the tool name. */
function subjectOf(args: unknown): string {
  if (typeof args !== 'object' || args === null) return 'dispatch'
  const record = args as Record<string, unknown>
  for (const key of ['name', 'subject', 'description', 'target', 'task_id']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value.slice(0, 120)
  }
  return 'dispatch'
}

/** Row config (installer form). */
export interface WorkflowConfig {
  /** The project directory (workspace `.llm`); the decision journal lives under `<home>/audit`. Defaults to the data service's. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/workflow'

/** The row's status for one call's session (row health): where dispatch decisions go. */
export function workflowHealth(projectHome: string | undefined): [HealthState, string] {
  return projectHome === undefined
    ? ['inactive', '无项目目录（行 home 或数据目录行 projectHome），派遣决策不落盘']
    : ['active', `派遣决策记入 ${projectHome}`]
}

/** cordis plugin entry: accepts an injected journal (tests) or a config (installer, which also reports row health). */
export function apply(ctx: PreExecuteHost & ServiceLookup & Partial<ProvideHost>, journalOrConfig: (Pick<AuditJournal, 'decision'>) | WorkflowConfig = {}): () => void {
  if (typeof (journalOrConfig as Pick<AuditJournal, 'decision'>).decision === 'function') {
    return applyOverJournal(ctx, journalOrConfig as Pick<AuditJournal, 'decision'>)
  }
  const config = journalOrConfig as WorkflowConfig
  const health = provideRowHealth(ctx, 'workflow', 'active', '已加载，记录派遣类调用')
  const dispose = applyOverJournal(ctx, rowJournal(name, () => dataHomes(ctx, config.home), config.fs), payload => {
    health.report(sessionIdOf(payload.agent), ...workflowHealth(dataHomes(ctx, config.home).projectHome))
  })
  return () => {
    dispose()
    health.dispose()
  }
}
