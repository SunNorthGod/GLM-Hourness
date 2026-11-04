/**
 * The main agent holder record's shape (plain-ui 1.3 §4.9; M3 附录 §2.4/§6),
 * shared by the host that writes and reads it (src/graph/
 * main-agent-holder.ts) and the client that reads it through
 * remote.workspaceFiles (ui/src/graph/main-chat.ts) - one source so the two
 * parsers cannot drift. Client-safe: no Node built-ins, no React.
 */

/** What the record file holds. */
export interface HolderRecord {
  readonly version: 1
  /** The session that is the main agent. */
  readonly sessionId: string
  /** The graph directory the project is named by, as the session saw it. */
  readonly graphDir: string
  /** When the session became the main agent (ISO time). */
  readonly since: string
  /** The /wish command that made it so. */
  readonly commandId: string
}

/** The record shape, read tolerantly: undefined when the value is not a record. */
export function holderRecordOf(value: unknown): HolderRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const { version, sessionId, graphDir, since, commandId } = record
  if (version !== 1 || typeof sessionId !== 'string' || sessionId.length === 0 || typeof graphDir !== 'string' || typeof since !== 'string' || typeof commandId !== 'string') return undefined
  return { version, sessionId, graphDir, since, commandId }
}
