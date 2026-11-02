/**
 * The violation journal's record types and the one classifier every reader
 * shares (M4 design §3.2, task m4-gate): guard denials, the rules board's
 * recorded calls, and the workspace-change fallback's shadow records — the
 * kinds the harness writes today. The follow-up, request, grant, void,
 * lift and gap records arrive with their writers (design §3.2); the
 * classifier already reads every class the journal will hold. The journal
 * only ever appends, so a record's key is stable: `recordKey` hashes the
 * line's JSON text.
 */
import { createHash } from 'node:crypto'
import type { Route } from '../shared/route.ts'
import { shellCommandOf, type ToolCall } from './rules.ts'
import type { RouteScope } from './origin.ts'
import type { ShadowRecord } from './shadow.ts'

/** What one call touched, as the journal keeps it: shell text up to 8 KiB, or the target argument. */
export interface CallSubject {
  /** The DSH native the call ran. */
  readonly tool: string
  readonly command?: string
  readonly target?: string
}

/** One audit record for a denied call. */
export interface ViolationRecord {
  readonly at: string
  readonly rule: string
  readonly tool: string
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  /** Where the call ran (src/guard/origin.ts); absent on records written before split step 7. */
  readonly scope?: RouteScope | undefined
  readonly route?: Route | undefined
  /** Only the rules board's denials say it, `enforce`; a guard denial carries no mode and is enforced all the same. */
  readonly mode?: 'enforce' | undefined
  readonly correction: string
  /** What the call touched (G1's gate writes it); older records have neither field. */
  readonly call?: CallSubject | undefined
  /** The request ref this denial carried (m4-request-card); absent outside the requestable rules. */
  readonly ref?: string | undefined
}

/** A call the rules board let through and noted (`mode: 'record'`): it ran, so there is no correction. Not a violation. */
export interface RecordedCall extends Omit<ViolationRecord, 'correction' | 'mode' | 'call' | 'ref'> {
  readonly mode: 'record'
}





/**
 * A line of the violation journal: the record kinds the harness writes
 * today. G1's gate adds the follow-up, request, grant, grant-void, lift and
 * gap records as their writers land, and G3 renames the fallback's
 * `ShadowRecord` to the late denial it already classifies as.
 */
export type GuardRecord = ViolationRecord | RecordedCall | ShadowRecord

/** The class of one journal line; every reader of the journal goes through this. */
export type RecordClass =
  | 'denial'
  | 'late-denial'
  | 'deferral'
  | 'rule-record'
  | 'followup'
  | 'request'
  | 'grant'
  | 'grant-void'
  | 'lift'
  | 'gap'
  | 'unknown'

const KINDS: ReadonlySet<string> = new Set(['followup', 'request', 'grant', 'grant-void', 'lift', 'gap'])

/**
 * One journal line's class. `kind` present: that kind, any other kind is
 * 'unknown'. No kind, `mode: 'late'`: a late denial when the rule is
 * `file-tools-only` (the workspace-change fallback) or starts with `rules:`
 * (only the rules board writes those). `mode: 'shadow'` with `paths` is the
 * fallback's record under the pre-0.6 name: also a late denial; `mode:
 * 'shadow'` otherwise is unreadable. With a `rule` that starts with
 * `rules:`: `mode: 'record'` is a record-only action the human chose
 * ('rule-record'), `mode: 'enforce'` with `effect: 'queue'` is a deferral
 * (the rules board queued the call). Otherwise no `mode` or
 * `mode: 'enforce'` is a denial. Anything else is 'unknown': counted and
 * reported as an unreadable line, never as a denial.
 */
export function classifyRecord(line: Readonly<Record<string, unknown>>): RecordClass {
  const kind = line.kind
  if (kind !== undefined) return typeof kind === 'string' && KINDS.has(kind) ? kind as RecordClass : 'unknown'
  const mode = line.mode
  const rule = typeof line.rule === 'string' ? line.rule : undefined
  if (mode === 'late') return rule === 'file-tools-only' || rule?.startsWith('rules:') === true ? 'late-denial' : 'unknown'
  if (mode === 'shadow') return line.paths !== undefined ? 'late-denial' : 'unknown'
  if (rule?.startsWith('rules:') === true) {
    if (mode === 'record') return 'rule-record'
    if (mode === 'enforce' && line.effect === 'queue') return 'deferral'
  }
  return mode === undefined || mode === 'enforce' ? 'denial' : 'unknown'
}

/** The key of one journal line: the first 12 hex digits of the SHA-256 of its JSON text. */
export function recordKey(line: string): string {
  return createHash('sha256').update(line).digest('hex').slice(0, 12)
}

/** The key of a record as it is written: `recordKey` over its JSON text. */
export function keyOf(record: object): string {
  return recordKey(JSON.stringify(record))
}

/** How much of a shell command one record keeps. */
const COMMAND_LIMIT = 8 * 1024

/** What the journal keeps of one judged call: the shell text or the file target, the tool always. */
export function subjectOf(call: ToolCall): CallSubject {
  const shell = shellCommandOf(call)
  if (shell !== undefined) return { tool: call.name, command: shell.command.slice(0, COMMAND_LIMIT) }
  const args = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? call.arguments as Record<string, unknown> : undefined
  const target = typeof args?.file_path === 'string' ? args.file_path : typeof args?.path === 'string' ? args.path : undefined
  return target === undefined ? { tool: call.name } : { tool: call.name, target }
}
