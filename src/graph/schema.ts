/**
 * Project graph schema (docs/ORCHESTRATION.md §2.6): the enumerations, the
 * node shape stored in docs/graph/nodes/<id>.json and the order in which the
 * fields are written. Validation lives in format.ts and validate.ts; this
 * module only names things.
 */

export const NODE_TYPES = ['goal', 'feature', 'decision', 'task', 'risk', 'question', 'norm', 'tool', 'retro'] as const
export type NodeType = typeof NODE_TYPES[number]

export const STATUSES = ['proposed', 'approved', 'doing', 'done', 'dropped', 'superseded'] as const
export type Status = typeof STATUSES[number]

export const SLOPES = ['uphill', 'downhill'] as const
export type Slope = typeof SLOPES[number]

/** Design-loop stages (§4.1); only goal and feature nodes carry one. */
export const STAGES = ['wish', 'interview', 'design', 'release', 'decompose', 'execute', 'merge', 'operate'] as const
export type Stage = typeof STAGES[number]

/** Verification states of a decision node. */
export const VERIFICATIONS = ['unverified', 'sandbox', 'device', 'overturned', 'superseded'] as const
export type Verification = typeof VERIFICATIONS[number]

/** Kinds of work a task is dispatched as; a review writes nothing. */
export const TASK_KINDS = ['implement', 'test', 'review', 'docs'] as const
export type TaskKind = typeof TASK_KINDS[number]

/** Model tiers by difficulty (§3.5); the harness maps a tier to agentOptions when dispatching. */
export const TIERS = ['hard', 'standard', 'simple'] as const
export type Tier = typeof TIERS[number]

export const EDGE_TYPES = ['depends', 'source', 'supersedes'] as const
export type EdgeType = typeof EDGE_TYPES[number]

export const EVIDENCE_KINDS = ['commit', 'test', 'check', 'decision'] as const
export type EvidenceKind = typeof EVIDENCE_KINDS[number]

export const ACTORS = ['human', 'llm', 'harness'] as const
export type Actor = typeof ACTORS[number]

/** Who decides a question (§2.9 decision tiers); a question without one is the human's. */
export const DECIDERS = ['human', 'agent'] as const
export type Decider = typeof DECIDERS[number]

/** Mutation operations (§2.9); every history entry names one. */
export const OPS = ['propose', 'approve', 'reject', 'status', 'edit', 'link', 'unlink', 'comment', 'decide', 'verify', 'supersede'] as const
export type Op = typeof OPS[number]

export interface DecisionOption {
  readonly key: string
  readonly label: string
  readonly consequence: string
}

export interface GraphEdge {
  readonly type: EdgeType
  readonly to: string
}

export interface Evidence {
  readonly kind: EvidenceKind
  /** Commit hash, command or checker name, or the chosen option key. */
  readonly ref: string
  /** Exit code; required for test and check, absent otherwise. */
  readonly exit?: number
  readonly note?: string
}

/** Fields an `edit` mutation may change, in write order; status, links, evidence and decisions have their own operations. */
export const EDITABLE_FIELDS = [
  'title', 'parent', 'slope', 'stage', 'kind', 'tier', 'worktree', 'outputSchema', 'body',
  'acceptance', 'nonGoals', 'writeScope', 'options', 'recommend', 'decider',
] as const
export type EditableField = typeof EDITABLE_FIELDS[number]

export type FieldValue = string | boolean | readonly string[] | readonly DecisionOption[]

/** Old and new value of one edited field; null means the field was absent. */
export interface FieldChange {
  readonly from: FieldValue | null
  readonly to: FieldValue | null
}

export interface HistoryEntry {
  /** ISO 8601 UTC timestamp. */
  readonly at: string
  readonly actor: Actor
  readonly op: Op
  /** Required for every operation except comment. */
  readonly reason?: string
  /**
   * The human's words from the chat that asked for this llm write, quoted
   * verbatim. A relayed write has the human's permissions (§2.9).
   */
  readonly relay?: string
  /** Status (or, for verify, verification state) before and after. */
  readonly from?: string
  readonly to?: string
  /** Chosen option of a decide. */
  readonly option?: string
  /** Id of the node that superseded this one. */
  readonly by?: string
  /** Edge added or removed by link, unlink or supersede. */
  readonly edge?: GraphEdge
  readonly changes?: Readonly<Partial<Record<EditableField, FieldChange>>>
  /** Evidence attached by this operation. */
  readonly evidence?: readonly Evidence[]
  /** Comment text. */
  readonly text?: string
}

export interface GraphNode {
  readonly id: string
  readonly type: NodeType
  readonly title: string
  readonly status: Status
  readonly parent?: string
  readonly slope?: Slope
  readonly stage?: Stage
  readonly verification?: Verification
  /** Dispatch attributes of a task node: what the harness reads when it hands the task to a subagent. */
  readonly kind?: TaskKind
  readonly tier?: Tier
  /** Give the subagent its own git worktree (cwd), for write tasks that run in parallel. */
  readonly worktree?: boolean
  /** Name or repository path of the hand-back schema the subagent's result must match. */
  readonly outputSchema?: string
  readonly body?: string
  readonly acceptance?: readonly string[]
  readonly nonGoals?: readonly string[]
  /** Repository-relative files and directories the subagent may write; none for a review. */
  readonly writeScope?: readonly string[]
  readonly options?: readonly DecisionOption[]
  readonly recommend?: string
  /** Question only: who decides it; absent means the human. */
  readonly decider?: Decider
  readonly decision?: string
  readonly edges?: readonly GraphEdge[]
  readonly evidence?: readonly Evidence[]
  readonly history: readonly HistoryEntry[]
}

/** Write order of node fields (§2.6 table order). */
export const NODE_FIELDS = [
  'id', 'type', 'title', 'status', 'parent', 'slope', 'stage', 'verification',
  'kind', 'tier', 'worktree', 'outputSchema', 'body', 'acceptance', 'nonGoals', 'writeScope',
  'options', 'recommend', 'decider', 'decision', 'edges', 'evidence', 'history',
] as const satisfies readonly (keyof GraphNode)[]

/** Fields only task nodes carry. */
export const DISPATCH_FIELDS = ['kind', 'tier', 'worktree', 'outputSchema', 'writeScope'] as const satisfies readonly EditableField[]

/** Write order of history entry fields. */
export const HISTORY_FIELDS = [
  'at', 'actor', 'op', 'reason', 'relay', 'from', 'to', 'option', 'by', 'edge', 'changes', 'evidence', 'text',
] as const satisfies readonly (keyof HistoryEntry)[]

export const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/
export const OPTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/
export const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

/** Passing evidence closes a node: a commit, a test or check that exited 0, or a recorded decision. */
export function isPassingEvidence(evidence: Evidence): boolean {
  if (evidence.kind === 'commit' || evidence.kind === 'decision') return true
  return evidence.exit === 0
}
