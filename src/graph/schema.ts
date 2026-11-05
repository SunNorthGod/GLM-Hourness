/**
 * Project graph schema (docs/ORCHESTRATION.md §2.6): the enumerations, the
 * node shape stored in docs/graph/nodes/<id>.json and the order in which the
 * fields are written. Validation lives in format.ts and validate.ts; this
 * module only names things.
 */

import type { AskForm } from './proposal.ts'

export const NODE_TYPES = ['goal', 'feature', 'decision', 'task', 'risk', 'question', 'norm', 'tool', 'retro', 'role', 'flow', 'step'] as const
export type NodeType = typeof NODE_TYPES[number]

/**
 * The user-graph node types (design 0.4.1 §2.2, d-user-graph-one-graph): a
 * role of the project's real user, a flow the role carries out, and a step
 * of that flow. They live under a goal in the same graph as the work
 * (goal > role > flow > step) and never store doing or done: their state
 * is derived from the work that serves them (user-graph.ts).
 */
export const USER_TYPES = ['role', 'flow', 'step'] as const

export const STATUSES = ['proposed', 'approved', 'doing', 'done', 'dropped', 'superseded'] as const
export type Status = typeof STATUSES[number]

export const SLOPES = ['uphill', 'downhill'] as const
type Slope = typeof SLOPES[number]

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

/**
 * Edge types (design 0.4.1 §2.3). `serves` sits on the work that builds a
 * step (feature or task, pointing at it); `next` sits on a step or a flow
 * and orders the steps (a flow's own `next` is its entry). `when` carries
 * the condition of a branch, in the user's words.
 */
export const EDGE_TYPES = ['depends', 'source', 'supersedes', 'serves', 'next'] as const
export type EdgeType = typeof EDGE_TYPES[number]

export const EVIDENCE_KINDS = ['commit', 'test', 'check', 'decision', 'walk'] as const
export type EvidenceKind = typeof EVIDENCE_KINDS[number]

export const ACTORS = ['human', 'llm', 'harness'] as const
export type Actor = typeof ACTORS[number]

/** Who decides a question (§2.9 decision tiers); a question without one is the human's. */
export const DECIDERS = ['human', 'agent'] as const
export type Decider = typeof DECIDERS[number]

/**
 * How hard a question's choice is to undo (§2.6 table card): one-way when
 * it changes goals, acceptance criteria or non-goals, or is a direction
 * that is expensive to change later (§2.9.1 categories 1 and 5).
 */
export const WEIGHTS = ['one-way', 'two-way'] as const
type Weight = typeof WEIGHTS[number]

/** Longest texts of a question's table card, in code points (§2.6 table card). */
export const CARD_LIMITS = { label: 20, gain: 60, cost: 60, dimensionName: 12, cell: 20, crux: 60, verdict: 120 } as const

/**
 * Longest texts and counts of the user graph (design 0.4.1 §2.4, §2.7): the
 * serve limits are write-time gates on the new edges of one write (W1), the
 * rest bound the shapes a user graph may take. The numbers are the agent's
 * (design §12 D5) and live here alone.
 */
export const USER_LIMITS = {
  /** Live serves a step may take. */
  servesPerStep: 8,
  /** Live serves a task may hold. */
  servesPerTask: 3,
  /** Live serves a feature may hold by its own links. */
  servesPerFeature: 20,
  /** Longest `when` of a step's next edge, in code points. */
  when: 40,
  /** Suggested step count of a flow; beyond it the gap flow:too-long is marked, not refused. */
  flowSteps: 12,
  /** Outgoing next edges of a step before the gap step:too-many-branches is marked. */
  branches: 4,
  /** Entries of one graph_relink list. */
  relinkEdges: 8,
  /** Evidence entries of one walk operation. */
  walkEvidence: 5,
  /** Walk evidence entries kept on a step node; history keeps them all. */
  walkKept: 10,
  /** Longest `said` of a walk report step, in code points. */
  said: 120,
  /** Longest ref of a walk evidence entry, in code points. */
  ref: 200,
  /** Longest note of a walk evidence entry, in code points. */
  note: 300,
  /** Longest harness-appended user page of a release or confirm, in code points. */
  appended: 8000,
} as const

/**
 * The statuses a user node stores (design 0.4.1 §2.2): a user node is never
 * doing or done — its progress is derived from the work that serves it
 * (CHARTER.md §10.1 single source of truth). `doing` and `done` are read
 * errors (format.ts) and write refusals (engine.ts).
 */
export const USER_STATUSES = ['proposed', 'approved', 'dropped', 'superseded'] as const
export type UserStatus = typeof USER_STATUSES[number]

/** The ref of a walk evidence entry: the walk kind, then the command, the artifact path or the fixed person marker. */
export const WALK_REF_PATTERN = /^(command|screenshot|transcript|person):\S.*$/u

/**
 * The note of a walk evidence entry: `@<commit>` (7 to 40 lowercase hex
 * digits, the commit the walk ran at) then one line of result. The pattern
 * is a write rule (engine.ts); a hand-edited file whose note does not match
 * still loads, so the whole graph does not go unreadable.
 */
export const WALK_NOTE_PATTERN = /^@[0-9a-f]{7,40} .+$/u

/**
 * Longest texts of what the person reads, in code points (panel design
 * plain-ui 1.3 §5.2, docs/ORCHESTRATION.md §2.6): a title, a why (one
 * sentence: why the thing is done and what changes once it is), and a
 * background line minus its `**` marks (one line, at most 60 code points
 * after removing the bold marks). The values belong to the panel design;
 * the writing check (plain.ts), the engine and the tests read this constant.
 */
export const PLAIN_LIMITS = { title: 40, why: 80, background: 60 } as const

/**
 * Mutation operations (§2.9; user graph: design 0.4.1 §3.5); every history
 * entry names one. `walk` writes walk evidence on a step and appears in
 * history; `relink` is a request-level operation only — its history reads
 * as link and unlink entries of the real edges it replaced.
 */
export const OPS = ['propose', 'approve', 'reject', 'status', 'edit', 'link', 'unlink', 'comment', 'decide', 'verify', 'supersede', 'walk', 'relink'] as const
export type Op = typeof OPS[number]

/** One row of a question's table card. */
export interface DecisionOption {
  readonly key: string
  /** What the option does (怎么做), the bold at-a-glance phrase. */
  readonly label: string
  /** What the option gets (得到), one line. */
  readonly gain?: string
  /** What the option costs (代价), one line. */
  readonly cost?: string
  /** Gain and cost in one text, on questions written before the table card. */
  readonly consequence?: string
}

/** The one extra column of a table card: a dimension the options really differ in, one cell per option key. */
export interface CardDimension {
  readonly name: string
  readonly values: Readonly<Record<string, string>>
}

export interface GraphEdge {
  readonly type: EdgeType
  readonly to: string
  /** The condition of a branch (design 0.4.1 §2.3): only a step's next edge carries one, one line, in the user's words. */
  readonly when?: string
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
  'title', 'why', 'parent', 'slope', 'stage', 'kind', 'tier', 'worktree', 'outputSchema', 'body',
  'acceptance', 'nonGoals', 'writeScope', 'options', 'dimension', 'recommend', 'crux', 'verdict', 'weight', 'decider',
  'ask', 'proposal', 'reason', 'cost', 'ways', 'notTaken',
] as const
export type EditableField = typeof EDITABLE_FIELDS[number]

export type FieldValue = string | boolean | readonly string[] | readonly DecisionOption[] | CardDimension

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
  /** Chosen option of a decide on a question with options. */
  readonly option?: string
  /** What a decide on a proposal-shaped question concluded. */
  readonly conclusion?: string
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
  /** One sentence for the human (plain-ui 1.3 §5.2): why it is done and what changes once it is; at most PLAIN_LIMITS.why code points. A question carries none. */
  readonly why?: string
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
  /** Question only: the one column where the options really differ. */
  readonly dimension?: CardDimension
  readonly recommend?: string
  /** Question only: the crux question only the human can answer (取决于), one line. */
  readonly crux?: string
  /** Question only: the 是 → X；否 → Y line naming option keys, one line. */
  readonly verdict?: string
  /** Question only: how hard the choice is to undo. */
  readonly weight?: Weight
  /** Question only: who decides it; absent means the human. */
  readonly decider?: Decider
  /**
   * Question only, the proposal shape (src/graph/proposal.ts): the question
   * as the human reads it, the way of asking it (set once), what is
   * recommended, guessed or shown, and by way of asking the reason, the cost,
   * the ways to choose between and the way not taken.
   */
  readonly ask?: string
  readonly form?: AskForm
  readonly proposal?: string
  readonly reason?: string
  readonly cost?: string
  readonly ways?: readonly string[]
  readonly notTaken?: string
  readonly decision?: string
  /** Question only, the proposal shape, after the decision: what was decided, one line. */
  readonly conclusion?: string
  readonly edges?: readonly GraphEdge[]
  readonly evidence?: readonly Evidence[]
  readonly history: readonly HistoryEntry[]
}

/** Write order of node fields (§2.6 table order). */
export const NODE_FIELDS = [
  'id', 'type', 'title', 'why', 'ask', 'form', 'status', 'parent', 'slope', 'stage', 'verification',
  'kind', 'tier', 'worktree', 'outputSchema', 'body', 'acceptance', 'nonGoals', 'writeScope',
  'options', 'dimension', 'recommend', 'proposal', 'reason', 'cost', 'ways', 'notTaken', 'crux', 'verdict', 'weight', 'decider', 'decision', 'conclusion',
  'edges', 'evidence', 'history',
] as const satisfies readonly (keyof GraphNode)[]

/** Question fields that make up the table card a question shows (§2.6); a write that sets any of them meets the card rules. */
export const CARD_FIELDS = ['options', 'dimension', 'recommend', 'crux', 'verdict', 'weight'] as const satisfies readonly EditableField[]

/** Fields only task nodes carry. */
export const DISPATCH_FIELDS = ['kind', 'tier', 'worktree', 'outputSchema', 'writeScope'] as const satisfies readonly EditableField[]

/** Write order of history entry fields. */
export const HISTORY_FIELDS = [
  'at', 'actor', 'op', 'reason', 'relay', 'from', 'to', 'option', 'conclusion', 'by', 'edge', 'changes', 'evidence', 'text',
] as const satisfies readonly (keyof HistoryEntry)[]

export const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/
export const OPTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/
export const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

/**
 * Passing evidence closes a node: a commit, a test or check that exited 0,
 * or a recorded decision. Walk evidence never closes a node: whether a walk
 * passed is another kind of fact, read from the step's walk records by
 * user-graph.ts from each entry's exit, and a user node cannot be done at
 * all (design 0.4.1 §3.2).
 */
export function isPassingEvidence(evidence: Evidence): boolean {
  if (evidence.kind === 'commit' || evidence.kind === 'decision') return true
  if (evidence.kind === 'walk') return false
  return evidence.exit === 0
}
