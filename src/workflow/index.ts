/**
 * dsh-workflow row entry: grades autonomous dispatch through the team seams
 * and journals every decision. DSH's Agent Team owns the actual spawning;
 * this row only observes (L1 logged silently, L2 journaled, L3 journaled —
 * the ask-now path is the guard's 申报 protocol, not ours). A row without a
 * usable home degrades to a no-op instead of failing activation.
 */
import type { AuditJournal } from '../memory/audit.ts'
import { journalFor, requireHome } from '../memory/index.ts'
import { gradeDecision } from './decisions.ts'
import type { PreExecuteHost } from '../shared/dsh-min.ts'

/**
 * Dispatch tool names of the rc.3 composition: the Agent Team tools
 * (dsh-experimental-tool-agent-team), `send_message` (also
 * dsh-tool-subagent-control), and the two dsh-tool-subagent rows of the
 * base profile, `subagent` (spawn) and `subagent_fork` (fork; dsh-base
 * cordis.patch.yml `toolName`).
 */
export const DISPATCH_TOOLS = ['spawn_teammate', 'team_task_create', 'team_task_update', 'send_message', 'subagent', 'subagent_fork'] as const

export function applyOverJournal(ctx: PreExecuteHost, journal: Pick<AuditJournal, 'decision'>): () => void {
  return ctx.on('tools/pre-execute', (payload, next) => {
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

/** Row config (installer form): build the journal from the memory home. Required: the row cannot infer the workspace at activation. */
export interface WorkflowConfig {
  /** The agent home directory; the decision journal lives under `<home>/audit`. */
  readonly home?: string
}

/** cordis plugin identity. */
export const name = 'dsh-glm-hourness/workflow'

/** cordis plugin entry: accepts an injected journal (tests) or a home config (installer). */
export function apply(ctx: PreExecuteHost, journalOrConfig: (Pick<AuditJournal, 'decision'>) | WorkflowConfig = {}): () => void {
  if (typeof (journalOrConfig as Pick<AuditJournal, 'decision'>).decision === 'function') {
    return applyOverJournal(ctx, journalOrConfig as Pick<AuditJournal, 'decision'>)
  }
  const config = journalOrConfig as WorkflowConfig
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/workflow: home is not configured; the decision journal stays off (set config.home)')
    return () => {}
  }
  return applyOverJournal(ctx, journalFor({ home: requireHome(config.home) }))
}
