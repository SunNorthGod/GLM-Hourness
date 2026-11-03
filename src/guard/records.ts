/**
 * The violation journal's record types and the one classifier every reader
 * shares (M4 design §3.2, task m4-gate): guard denials, the rules board's
 * recorded calls and late blocks, the workspace-change fallback's shadow
 * records, and the follow-up, request, grant, grant-void, lift and gap
 * records their steps write from here on. The journal only ever appends,
 * so a record's key is stable: `recordKey` hashes the line's JSON text.
 */
import { createHash } from 'node:crypto'
import type { Route } from '../shared/route.ts'
import { shellCommandOf, type ToolCall } from './rules.ts'
import type { RouteScope } from './origin.ts'
import type { ShadowRecord } from './fallback.ts'

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
  /** A denial of a graph write that tried to move a goal on without the human (src/guard/main-agent-graph.ts): which session tried, and at what. */
  readonly session?: { readonly id: string, readonly kind: 'subagent' | 'ordinary', readonly parent?: string | undefined } | undefined
  readonly goal?: string | undefined
  readonly node?: string | undefined
  /** main-agent-graph-stage: the stage the node was in and the one the call would have put it in. */
  readonly stageFrom?: string | undefined
  readonly stageTo?: string | undefined
}

/** A call the rules board let through and noted (`mode: 'record'`): it ran, so there is no correction. Not a violation. */
export interface RecordedCall extends Omit<ViolationRecord, 'correction' | 'mode' | 'call' | 'ref'> {
  readonly mode: 'record'
}

/** What every record of a judged or settled event carries besides its kind. */
interface RecordOrigin {
  readonly at: string
  readonly rule: string
  /** The name the model called. */
  readonly tool: string
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  readonly scope: RouteScope
  readonly route?: Route | undefined
}

/** The follow-up to one denial: what the model did next (design §3.3). The follow-up recorder (G2) writes it. */
export interface FollowupRecord extends RecordOrigin {
  readonly kind: 'followup'
  /** The recordKey of the denial's journal line. */
  readonly denial: string
  readonly outcome: 'right-path' | 'repeat' | 'other' | 'none'
}

/** One step of a request (design §5.3, §5.5). `tool` is the denied call's tool. */
interface RequestRecord extends RecordOrigin {
  readonly kind: 'request'
  readonly ref: string
  readonly outcome: 'asked' | 'approved' | 'declined' | 'unclear' | 'not-shown' | 'not-client' | 'closed' | 'expired'
  readonly target?: string
  /** approved and declined: the answer came from the human's own message through the DSH client. */
  readonly by?: 'human'
  readonly via?: 'chat'
  /** The human's message, verbatim, at most 500 characters (approved, declined, unclear, not-client, not-shown). */
  readonly words?: string
  /** The DSH message id of the human's message. */
  readonly messageId?: string
}

/** An approval was used (design §5.6). */
interface GrantRecord extends RecordOrigin {
  readonly kind: 'grant'
  readonly ref: string
  readonly signature: string
  readonly call: CallSubject
  /** `<project home>/requests/<ref>.before`. */
  readonly backup?: string
}

/** An approval was voided at use time (design §5.6). */
interface GrantVoidRecord extends RecordOrigin {
  readonly kind: 'grant-void'
  readonly ref: string
  /** What changed, or the stat error code. */
  readonly reason: string
}

/** The workspace-change fallback's late denial (design §3.4): after a turn, file-tools-only found files that a shell call changed and no file tool targeted. Nothing was blocked: the call had run. The fields are the fallback's shadow record's (G3 renames the writer's record to this one). */
export interface LateRecord extends Omit<ShadowRecord, 'mode'> {
  readonly mode: 'late'
  readonly via: 'turn-end'
}

/**
 * Records the harness could not write (F13, design §3.2). Written by the first
 * append that succeeds afterwards, directly before the record that append
 * carries, or alone by flush() when the session ends. It is not a violation
 * and not a denial.
 */
export interface GapRecord {
  readonly kind: 'gap'
  /** When this line was written. */
  readonly at: string
  /** The row whose journal lost the records: 'guard', 'graph', ... */
  readonly row: string
  /** Records lost since this journal instance's previous gap line, or since it started. */
  readonly lost: number
  /** Lost records per class (classifyRecord), e.g. { denial: 2, followup: 1 }. */
  readonly classes: Readonly<Record<string, number>>
  /** The `at` of the first and of the last lost record. */
  readonly since: string
  readonly until: string
  /** The error code of the last failed append (EACCES, ENOSPC, ...), at most 40 characters; absent when the error had none. */
  readonly code?: string
}

/** The human lifted or restored a code rule (design §3.5). */
export interface LiftRecord {
  readonly kind: 'lift'
  readonly at: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  /** chat: the main agent called guard_lift with the human's words; board: the rules board handed over /rules lift or /rules restore. */
  readonly via: 'chat' | 'board'
  readonly sessionId?: string | undefined
  /** chat: the human's words as the tool received them; board: the command text the board passed. At most 500 characters. */
  readonly words: string
}
/**
 * A line of the violation journal: every record kind the journal holds. The
 * gate writes denials, the follow-up, request, grant and void records are
 * written by their steps (G2, G4), the lift records by the lift entry points
 * (G3), the gap records by the journal itself, and G3 renames the fallback's
 * `ShadowRecord` to the late denial it already classifies as.
 */
export type GuardRecord = ViolationRecord | RecordedCall | ShadowRecord | LateRecord | FollowupRecord | RequestRecord | GrantRecord | GrantVoidRecord | LiftRecord | GapRecord

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
