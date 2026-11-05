/**
 * DSH graph tools (docs/ORCHESTRATION.md §2.10): the command-line contract
 * as model-facing tools. Every call is one engine call with actor llm, so
 * the tools enforce the engine's rules and no others; a refusal comes back
 * as a tool error whose text is the engine's {code, message, field?, hint}.
 * The operations that need the human's authority (approve, reject, decide)
 * succeed with the human's words as relay, or for decide on a question the
 * agent decides; supersede is not a tool (a proposal with a supersedes edge
 * does it). graph_focus writes nothing to the graph: it sets the
 * session's focus node for the step projection (reminder.ts, §2.5). The
 * graph directory is resolved per call: an absolute dir from the row
 * config as is, a relative one (default docs/graph) under the calling
 * agent's session working directory. A missing directory is reported,
 * never created. A third reopen of a node files the third-rework question
 * for the human and returns a notice with the write (reopen.ts, design
 * §4.6), reported to the loop board through `report`. A propose or edit of a
 * tool node under env returns the timeout of each readable check line for
 * the plan the human reads, and hands every estimate it wrote to `estimates`
 * (src/env/timeout.ts, m4 design §6.3.1 item 3).
 */
import { spawnSync } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import { openEngine, type ApplyResult } from './engine.ts'
import { FOCUS_TOOL } from './live.ts'
import { ASK_FORMS } from './proposal.ts'
import { failure, type Failure } from './mutation.ts'
import { PLAIN_WRITING_GUIDE } from './plain.ts'
import { listOpenItems, projectNode } from './projection.ts'
import { REOPEN_LIMIT, reopenNotice, reopenNoticeFailed, reopenNoticeForSubagent, reopenQuestion, reopensAfter, thirdReworkState } from './reopen.ts'
import { NODE_TYPES, SLOPES, STAGES, TASK_KINDS, TIERS, WEIGHTS, type Evidence, type GraphNode } from './schema.ts'
import { isUserNode } from './user-graph.ts'
import { liveOf } from './user-live.ts'
import type { LoadedGraph } from './parse.ts'
import { loadGraph } from './store.ts'
import type { ListedRun, LoopsService } from '../loops/service.ts'
import { envToolTimeouts, estimateLines, type CheckTimeoutText, type EstimateLine } from '../env/timeout.ts'

/** Loader row id, named in hints so the model can point the human at the config. */
const GRAPH_ROW_ID = 'glm-hourness/graph'

/** Graph directory under the session working directory when the row config names none. */
export const DEFAULT_GRAPH_DIR = 'docs/graph'

/** Engine operations an llm can perform, one tool each; supersede goes through propose with a supersedes edge, graph_walk is its own tool below. */
type LlmOp = 'propose' | 'status' | 'edit' | 'link' | 'unlink' | 'relink' | 'comment' | 'verify' | 'decide' | 'approve' | 'reject'

type JsonSchema = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Throw a refusal as a tool error: the model reads the structured error after "Error: ". */
function refuse(result: Failure): never {
  throw new Error(JSON.stringify(result.error))
}

const ROW_HINT = `set an absolute dir in the ${GRAPH_ROW_ID} row config`

/**
 * The path of the configured dir: absolute as is, relative under the
 * session working directory `cwd`; undefined when a relative dir has no
 * working directory to resolve against. Whether it exists is not checked.
 */
export function resolveGraphDir(configured: string, cwd: string | undefined): string | undefined {
  if (isAbsolute(configured)) return resolve(configured)
  return typeof cwd === 'string' && cwd.length > 0 ? resolve(cwd, configured) : undefined
}

/**
 * The graph directory of the configured dir (absolute, or relative to the
 * session working directory `cwd`), or not_found when there is none to work on.
 */
export async function locateGraph(configured: string, cwd: string | undefined): Promise<string | Failure> {
  const dir = resolveGraphDir(configured, cwd)
  if (dir === undefined) return failure('not_found', `this session has no working directory to find ${configured} in`, ROW_HINT)
  try {
    if ((await stat(dir)).isDirectory()) return dir
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
  }
  return failure('not_found', `no project graph at ${dir}`, `an empty directory is an empty graph: create ${dir} to start one, or ${ROW_HINT}`)
}

/** The graph directory for one call, or a refusal when there is none to work on. */
async function graphDir(configured: string, exec: unknown): Promise<string> {
  const located = await locateGraph(configured, (exec as ToolExecutionContext | undefined)?.agent?.session?.header.cwd)
  return typeof located === 'string' ? located : refuse(located)
}

/**
 * Focus node per session id, set by graph_focus. The step projection
 * (reminder.ts) reads the focus from the session history and falls back to
 * this map when a compaction has removed it from there.
 */
export type FocusMemory = Map<string, string>


/** Refuse fields a read tool does not take; reads have no engine parser to do it. */
function readRequest(tool: string, args: unknown, fields: readonly string[]): Record<string, unknown> {
  const usage = fields.length === 0 ? `${tool} takes no arguments` : `${tool} takes ${fields.join(', ')}`
  if (args === undefined) return {}
  if (!isRecord(args)) refuse(failure('invalid', 'the arguments must be a JSON object', usage))
  const extra = Object.keys(args).find(key => !fields.includes(key))
  if (extra !== undefined) refuse(failure('invalid', `${extra} is not a field of ${tool}`, usage, extra))
  return args
}

/** Validation errors of the graph, reported with every read; writes are refused while there are any. */
function invalidOf(graph: LoadedGraph): { invalid?: { errors: number, first: Array<{ file: string, field?: string, message: string }>, hint: string } } {
  const errors = graph.issues.filter(issue => issue.severity === 'error')
  if (errors.length === 0) return {}
  return {
    invalid: {
      errors: errors.length,
      first: errors.slice(0, 5).map(issue => ({ file: issue.file, ...(issue.field === undefined ? {} : { field: issue.field }), message: issue.message })),
      hint: 'every write is refused until the node files are fixed or restored with git; tell the human',
    },
  }
}

const render: ToolDefinitionLike['output']['render'] = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

// Parameter and output schemas stay inside the rc.3 enforced subset (dsh-tools
// assertSupportedJsonSchema): type, properties, required, additionalProperties,
// items, enum, const and annotations.

const ID: JsonSchema = { type: 'string', description: 'Node id, for example task-3.' }
const REV: JsonSchema = { type: 'string', description: 'The node rev from your latest graph_show or graph_open; a stale rev is refused.' }
const REASON: JsonSchema = { type: 'string', description: 'Why, in one sentence; kept in the node history.' }
const RELAY: JsonSchema = {
  type: 'string',
  description: 'Only when the human asked for this change in the chat: their words, quoted verbatim (at most 2000 characters). The write then has the human\'s permissions; the words are kept in the node history and shown to the human. Never paraphrase or invent them.',
}
const STRINGS: JsonSchema = { type: 'array', items: { type: 'string' } }
const EVIDENCE: JsonSchema = {
  type: 'array',
  description: 'Proof attached to the change.',
  items: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['commit', 'test', 'check'] },
      ref: { type: 'string', description: 'Commit hash (7-40 hex digits), or the command or checker that ran.' },
      exit: { type: 'integer', description: 'Exit code; required for test and check.' },
      note: { type: 'string' },
    },
    required: ['kind', 'ref'],
    additionalProperties: false,
  },
}

const NODE: JsonSchema = {
  type: 'object',
  description: 'The new node; the engine sets status, verification, evidence and history.',
  properties: {
    id: { type: 'string', description: 'Leave out to get <type>-<n>.' },
    type: { type: 'string', enum: [...NODE_TYPES] },
    title: { type: 'string', description: `One line, at most 40 characters. ${PLAIN_WRITING_GUIDE}` },
    why: { type: 'string', description: 'One sentence, at most 80 characters: why it is done and what changes once it is. Not on a question. The rules of title apply.' },
    parent: { type: 'string', description: 'Parent node id; every type but goal has one.' },
    body: { type: 'string' },
    acceptance: { ...STRINGS, description: 'How to tell it is done.' },
    nonGoals: STRINGS,
    slope: { type: 'string', enum: [...SLOPES] },
    stage: { type: 'string', enum: [...STAGES], description: 'Goal and feature only.' },
    kind: { type: 'string', enum: [...TASK_KINDS], description: 'Task only: how the task is dispatched.' },
    tier: { type: 'string', enum: [...TIERS], description: 'Task only: model tier of the subagent.' },
    worktree: { type: 'boolean', description: 'Task only: give the subagent its own git worktree.' },
    outputSchema: { type: 'string', description: 'Task only: name or repository path of the hand-back schema.' },
    writeScope: { ...STRINGS, description: 'Task only: repository paths the subagent may write; empty for review.' },
    options: {
      type: 'array',
      description: 'Question only: 2-4 rows of the table card, the recommended one last. Each row gets something no other row gets; no filler rows.',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'For example A.' },
          label: { type: 'string', description: '怎么做: what the option does, the bold at-a-glance phrase; at most 20 characters.' },
          gain: { type: 'string', description: '得到: one line, at most 60 characters; numbers and concrete examples, no evaluative words.' },
          cost: { type: 'string', description: '代价: one line, at most 60 characters; numbers and concrete examples.' },
        },
        required: ['key', 'label', 'gain', 'cost'],
        additionalProperties: false,
      },
    },
    dimension: {
      type: 'object',
      description: 'Question only, optional: the one extra column where the options really differ. A column with the same value in every row is refused.',
      properties: {
        name: { type: 'string', description: 'Column name, at most 12 characters.' },
        values: { type: 'object', description: 'One cell per option key, at most 20 characters each, for example {"A": "1 天", "B": "3 天"}.' },
      },
      required: ['name', 'values'],
      additionalProperties: false,
    },
    recommend: { type: 'string', description: 'Question only: key of the recommended option, which must be the last option so the human reads the others first; anything else is refused.' },
    ask: { type: 'string', description: 'Question only, a proposal: the question as the human reads it, one sentence ending with its one question mark.' },
    form: { type: 'string', enum: [...ASK_FORMS], description: 'Question only, a proposal: the way of asking, set once: recommend, choose, want or look.' },
    proposal: { type: 'string', description: 'Question only, a proposal: what you recommend, guess or show, one short line.' },
    reason: { type: 'string', description: 'Question only, a proposal (recommend, choose): why, one short line.' },
    cost: { type: 'string', description: 'Question only, a proposal (recommend): the real cost, one short line; leave it out when there is none.' },
    ways: { ...STRINGS, description: 'Question only, a proposal (choose): two or three ways, each one short line, your pick last.' },
    notTaken: { type: 'string', description: 'Question only, a proposal (recommend, choose): the way not taken, one short line.' },
    crux: { type: 'string', description: 'Question only, required when the human decides. 取决于: one line, at most 60 characters, the question only the human can answer that decides between the options.' },
    verdict: { type: 'string', description: 'Question only, required when the human decides: one line, at most 120 characters, 是 → <key>；否 → <key>; every key after → must exist and the recommended key must appear.' },
    weight: {
      type: 'string',
      enum: [...WEIGHTS],
      description: 'Question only, required when the human decides: one-way when the choice changes goals, acceptance criteria or non-goals, or is expensive to change later; two-way otherwise.',
    },
    decider: { type: 'string', enum: ['human', 'agent'], description: 'Question only: who decides it; leave out for the human. Agent questions are yours to decide with graph_decide.' },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['depends', 'source', 'supersedes', 'serves', 'next'] },
          to: ID,
          when: { type: 'string', description: 'A branch condition, only on a step\'s next edge: one line, at most 40 characters, the user\'s words.' },
        },
        required: ['type', 'to'],
        additionalProperties: false,
      },
    },
  },
  required: ['type', 'title'],
  additionalProperties: false,
}

function object(properties: Record<string, JsonSchema>, required: readonly string[]): JsonSchema {
  return { type: 'object', properties, required: [...required], additionalProperties: false }
}

const OK: JsonSchema = { type: 'boolean', const: true }
const INVALID: JsonSchema = {
  type: 'object',
  description: 'Present when the graph has validation errors.',
  properties: {
    errors: { type: 'integer' },
    first: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, field: { type: 'string' }, message: { type: 'string' } }, required: ['file', 'message'] } },
    hint: { type: 'string' },
  },
  required: ['errors', 'first', 'hint'],
}
const SHOW_OUTPUT: JsonSchema = { type: 'object', properties: { ok: OK, projection: { type: 'object' }, invalid: INVALID }, required: ['ok', 'projection'] }
const OPEN_OUTPUT: JsonSchema = { type: 'object', properties: { ok: OK, items: { type: 'object' }, invalid: INVALID }, required: ['ok', 'items'] }
const FOCUS_OUTPUT: JsonSchema = {
  type: 'object',
  properties: {
    ok: OK,
    focus: {
      type: 'object',
      properties: { id: { type: 'string' }, type: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' } },
      required: ['id', 'type', 'title', 'status'],
      additionalProperties: false,
    },
    invalid: INVALID,
  },
  required: ['ok', 'focus'],
}
const WRITE_OUTPUT: JsonSchema = {
  type: 'object',
  properties: {
    ok: OK,
    id: { type: 'string' },
    rev: { type: 'string' },
    revision: { type: 'string' },
    node: { type: 'object', description: 'The node after the write, without its history.' },
    changed: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Present when what the human reads breaks a writing rule, or when the body or acceptance changed and title and why did not: the write went through; rewrite what is named (graph_edit).' },
    notice: { type: 'string', description: 'Present on a reopen of a node that is heading for its third fix: what the caller does with the question filed for the human.' },
    timeouts: {
      type: 'array',
      description: 'Present when the node is a tool under env: the time limit of each readable check line, the sentence the human reads next to that line.',
      items: {
        type: 'object',
        properties: { check: { type: 'string', description: 'The check line\'s name.' }, text: { type: 'string' } },
        required: ['check', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['ok', 'id', 'rev', 'revision', 'node', 'changed'],
}

/** What graph_propose and graph_edit tell the caller to do with the timeouts (m4 design §6.3.1 item 3). */
const TIMEOUTS_NOTE = ' A tool node under env comes back with timeouts: put each text verbatim next to its check line in the plan you show the human.'

const WRITES: ReadonlyArray<{ readonly op: LlmOp, readonly description: string, readonly parameters: JsonSchema }> = [
  {
    op: 'propose',
    description: `Add a node. Planned work starts approved: a task under an approved or in-progress feature or task; a risk, question or retro under an open node. Else (new branch, decision, norm, tool, goal, supersedes edge) it waits for the human unless relayed. A question for the human is a proposal: ask (the question), form (recommend, choose, want or look), proposal and, by form, reason, cost, ways; the main agent puts one with propose_to_human. A question you decide yourself (decider agent) is a table of options, the recommended option last.${TIMEOUTS_NOTE}`,
    parameters: object({ node: NODE, reason: REASON, relay: RELAY }, ['node', 'reason']),
  },
  {
    op: 'status',
    description: 'Move a node: approved to doing, done or dropped; doing to done or dropped; done back to doing (reopen); dropped back to approved. Done needs passing evidence: a commit, or a test or check run with exit 0. A question closes only through graph_decide. Dropping or restoring a goal or feature, and dropping a question, need the human\'s words as relay.',
    parameters: object({ id: ID, rev: REV, to: { type: 'string', enum: ['approved', 'doing', 'done', 'dropped'] }, reason: REASON, evidence: EVIDENCE, relay: RELAY }, ['id', 'rev', 'to', 'reason']),
  },
  {
    op: 'edit',
    description: 'Change a node\'s title, why, body, slope, a question\'s decider, a task\'s dispatch attributes (kind, tier, worktree, outputSchema, writeScope); any field of your own open proposal, goals included. Decider human is always allowed; decider agent, an adopted goal, acceptance criteria and non-goals need the human\'s words as relay. Questions keep the table card rules (recommended option last).' + TIMEOUTS_NOTE,
    parameters: object({
      id: ID,
      rev: REV,
      set: { type: 'object', description: `Field name to new value; null removes the field. ${PLAIN_WRITING_GUIDE}` },
      reason: REASON,
      relay: RELAY,
    }, ['id', 'rev', 'set', 'reason']),
  },
  {
    op: 'link',
    description: 'Add an edge from a node: depends (it needs `to` done first), source (it exists because of `to`), serves (this feature or task builds the step `to`; the work side\'s own bookkeeping, no relay needed) or next (the order of a user graph: from a step to the step that may follow it, from a flow to its first step). A step\'s next edge takes when, the condition of the branch.',
    parameters: object({ id: ID, rev: REV, type: { type: 'string', enum: ['depends', 'source', 'serves', 'next'] }, to: ID, when: { type: 'string', description: 'Only for a step\'s next edge: the branch condition, one line, at most 40 characters.' }, reason: REASON, relay: RELAY }, ['id', 'rev', 'type', 'to', 'reason']),
  },
  {
    op: 'unlink',
    description: 'Remove a depends, source, serves or next edge from a node.',
    parameters: object({ id: ID, rev: REV, type: { type: 'string', enum: ['depends', 'source', 'serves', 'next'] }, to: ID, reason: REASON, relay: RELAY }, ['id', 'rev', 'type', 'to', 'reason']),
  },
  {
    op: 'relink',
    description: `Replace the outgoing next edges of one step, or the entry of one flow, in a single write: the human's sentence covers the whole change, and one node is written once per sentence. The order of a user graph changes like this. Example, the person having said "借书前要先交押金": restate it ("那我记成：…"), they confirm, then two calls with that sentence as relay. 1. graph_propose {node: {type: "step", parent: "flow-3", title: "交押金", acceptance: ["页面提示押金已收"], edges: [{type: "next", to: "step-9"}]}, reason: "借书前要先交押金", relay: "借书前要先交押金"} — the result carries the new step's id; the new step has nobody building it yet, connect a task of the module that owns the flow with a serves edge. 2. graph_relink {id: "step-8", rev: <the rev you just read>, reason: "没交押金的先去交押金", next: [{to: "step-9", when: "已交押金"}, {to: "the id the first call returned", when: "没交押金"}], relay: "借书前要先交押金"}.`,
    parameters: object({
      id: ID,
      rev: REV,
      next: {
        type: 'array',
        description: 'The outgoing next edges after the write, each {to, when?}; at most 8 entries, a flow takes at most one (its entry).',
        items: {
          type: 'object',
          properties: { to: ID, when: { type: 'string', description: 'The branch condition, one line, at most 40 characters.' } },
          required: ['to'],
          additionalProperties: false,
        },
      },
      reason: REASON,
      relay: RELAY,
    }, ['id', 'rev', 'next', 'reason']),
  },
  {
    op: 'comment',
    description: 'Comment on a node for the human or for later steps, for example why a question no longer matters. Needs no rev. Keep it a short fact: what changed, why, where the full record lives. Long analysis goes to the design doc, pointed to here; preferences to memory; lasting pitfalls into the body or a retro. Link, don\'t paste.',
    parameters: object({ id: ID, text: { type: 'string' } }, ['id', 'text']),
  },
  {
    op: 'verify',
    description: 'Record how far a decision node is verified: unverified, sandbox, device or overturned. Sandbox and device need a test or check run with exit 0.',
    parameters: object({ id: ID, rev: REV, to: { type: 'string', enum: ['unverified', 'sandbox', 'device', 'overturned'] }, reason: REASON, evidence: EVIDENCE, relay: RELAY }, ['id', 'rev', 'to', 'reason']),
  },
  {
    op: 'decide',
    description: 'Decide a question: pick one of its options; the question becomes done with the choice recorded. A proposal (a question without options, put with propose_to_human) takes conclusion: one line, what was decided. Questions with decider agent are yours, until the human has decided one. The human\'s questions need their words as relay: decide only what they chose in the chat. A done question can be decided again (overturned) by whoever may decide it.',
    parameters: object({
      id: ID,
      rev: REV,
      option: { type: 'string', description: 'Key of the chosen option of a question with options.' },
      conclusion: { type: 'string', description: 'What was decided, one line of at most 120 characters, for a proposal.' },
      reason: REASON,
      relay: RELAY,
    }, ['id', 'rev', 'reason']),
  },
  {
    op: 'approve',
    description: 'Approve a proposal for the human. Needs their words from the chat as relay; without them the proposal waits in their queue.',
    parameters: object({ id: ID, rev: REV, reason: REASON, relay: RELAY }, ['id', 'rev', 'reason', 'relay']),
  },
  {
    op: 'reject',
    description: 'Reject a proposal for the human: it becomes dropped. Needs their words from the chat as relay.',
    parameters: object({ id: ID, rev: REV, reason: REASON, relay: RELAY }, ['id', 'rev', 'reason', 'relay']),
  },
]

/**
 * What the loops reader and the row health offer the third-rework question:
 * the board is told of every filed question and the row's health keeps a
 * problem when the board refuses; asking goes on either way (design §6.8).
 */
export interface ThirdReworkReport {
  /** The loop board's service, undefined while the loops row is off. */
  readonly loops: (() => LoopsService | undefined) | undefined
  /** A lasting problem for the row health, with the message and the session it happened in. */
  readonly problem?: (message: string, sessionId: string | undefined) => void
}

/** The session working directory of the caller, for the run the board records. */
function cwdOf(exec: ToolExecutionContext | undefined): string | undefined {
  const cwd = exec?.agent?.session?.header.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/** One run of the board entry, reported per filed question; a throw is a row-health problem, never a tool failure. */
function recordRun(loops: LoopsService | undefined, run: ListedRun, sessionId: string | undefined, problem: ThirdReworkReport['problem']): void {
  if (loops === undefined) return
  try {
    loops.recordRun(run)
  }
  catch (error) {
    problem?.(`交给循环板的 ${run.entry} 没被收下：${error instanceof Error ? error.message : String(error)}`, sessionId)
  }
}

/**
 * After a successful done→doing reopen by the tool (m4 design §4.6): count
 * the reopens since the last closed question of this kind; at the third,
 * file the proposal-style question under the node as the harness and return
 * the notice for the caller. `dir` is the graph directory the call already
 * resolved against the caller's session. A relayed reopen is the human's
 * own decision and asks nobody; a question already waiting stops another
 * one; a failed filing leaves the reopen standing and is tried again on the
 * next reopen. Never throws: the notice says what went wrong instead.
 */
async function thirdReworkAfter(dir: string, args: unknown, exec: unknown, result: Extract<ApplyResult, { ok: true }>, report: ThirdReworkReport): Promise<string | undefined> {
  if (!isRecord(args) || args.to !== 'doing' || args.relay !== undefined) return undefined
  try {
    const graph = await loadGraph(dir)
    const node: GraphNode | undefined = graph.nodes.get(result.id)
    const last = node?.history.at(-1)
    if (node === undefined || last?.op !== 'status' || last.from !== 'done' || last.to !== 'doing') return undefined
    const state = thirdReworkState(graph, node.id)
    if (state.open !== undefined) return undefined
    const reopens = reopensAfter(node, state.closedAt)
    if (reopens.length < REOPEN_LIMIT) return undefined
    const question = reopenQuestion(node, reopens)
    const engine = openEngine(dir)
    let filed = await engine.apply('harness', { op: 'propose', reason: question.reason, node: question.node })
    if (!filed.ok && filed.error.code === 'stale_revision') filed = await engine.apply('harness', { op: 'propose', reason: question.reason, node: question.node })
    const context = exec as ToolExecutionContext | undefined
    const sessionId = context?.agent?.session?.id
    if (!filed.ok) {
      recordRun(report.loops?.(), { cwd: cwdOf(context) ?? '', entry: 'graph.third-rework', outcome: 'failed', reason: cut(`${filed.error.code}: ${filed.error.message}`) }, sessionId, report.problem)
      return reopenNoticeFailed(filed.error)
    }
    recordRun(report.loops?.(), { cwd: cwdOf(context) ?? '', entry: 'graph.third-rework', outcome: 'reported' }, sessionId, report.problem)
    return context?.agent?.session?.header.origin === 'subagent'
      ? reopenNoticeForSubagent(filed.id)
      : reopenNotice(question, filed.id)
  }
  catch (error) {
    return reopenNoticeFailed({ code: 'io', message: error instanceof Error ? error.message : String(error) })
  }
}

/** One line of at most 120 code points, the limit the board puts on a run's reason. */
function cut(text: string): string {
  return [...text].slice(0, 120).join('')
}

/** Where the graph tools hand an estimate a propose or edit wrote, with the caller's session working directory; never throws into the tool. */
export type EstimateSink = (line: EstimateLine, cwd: string | undefined) => void

/**
 * The timeouts of a written tool node under env (m4 design §6.3.1 item 3),
 * and its estimates handed to `estimates`, which reports its own failures.
 * Any other node, and any other operation, comes back without them.
 */
function envTimeoutsAfter(op: LlmOp, node: GraphNode, exec: unknown, estimates: EstimateSink | undefined): { timeouts?: readonly CheckTimeoutText[] } {
  if (op !== 'propose' && op !== 'edit') return {}
  const timeouts = envToolTimeouts(node)
  if (timeouts === undefined) return {}
  const context = exec as ToolExecutionContext | undefined
  if (estimates !== undefined) {
    for (const line of estimateLines(node, context?.agent?.session?.id, new Date())) estimates(line, cwdOf(context))
  }
  return { timeouts }
}

/** The project root's HEAD, short; undefined when git cannot read it (the caller refuses before writing anything). */
function headOf(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined
  const run = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
  const hash = run.status === 0 ? run.stdout.trim() : ''
  return /^[0-9a-f]{40}$/.test(hash) ? hash.slice(0, 7) : undefined
}

/**
 * graph_walk (design 0.4.1 §2.7): the person walked a flow themselves and
 * the main agent records it. Their words are the relay and the only input
 * of truth; the evidence and the commit are the tool's, never the model's:
 * ref person:conversation, exit from ok, note `@<HEAD of the project root>`
 * plus the first line of the relay, cut at 200 code points. One engine
 * write per step, so a refusal part-way leaves the earlier steps recorded
 * and the refusal names what is missing. The commit recorded is the
 * project root's HEAD at this moment — the question to the person names
 * the commit to walk (dispatch_task carries it), and they redeploy first
 * when what they walked is not it.
 */
function walkTool(dir: string): ToolDefinitionLike {
  const STEPS_OUTPUT: JsonSchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: { id: { type: 'string' }, code: { type: 'string' } },
      required: ['id', 'code'],
      additionalProperties: false,
    },
  }
  const OUTPUT: JsonSchema = {
    type: 'object',
    properties: {
      ok: OK,
      id: { type: 'string' },
      rev: { type: 'string' },
      revision: { type: 'string' },
      node: { type: 'object', description: 'The flow node, without its history.' },
      changed: { type: 'array', items: { type: 'string' } },
      commit: { type: 'string', description: 'The project root HEAD the walk was recorded at, short.' },
      unwritten: STEPS_OUTPUT,
      invalid: INVALID,
    },
    required: ['ok', 'id', 'rev', 'revision', 'node', 'changed', 'commit'],
    additionalProperties: false,
  }
  return {
    name: 'graph_walk',
    description: 'Record that the person walked a flow themselves. Only their own words count: pass them as relay, verbatim. steps lists every live approved step of the flow, one {id, ok} each; graph_show of the flow lists them. Command, screenshot and transcript walks are recorded by the harness, not by you. The commit recorded is the project root\'s HEAD now; when you ask the person to walk a flow, tell them which commit to walk (dispatch_task carries it) and have them redeploy first when what they walked is not it.',
    parameters: object({
      id: ID,
      rev: REV,
      steps: {
        type: 'array',
        description: 'Every live approved step of the flow, one item each.',
        items: {
          type: 'object',
          properties: { id: ID, ok: { type: 'boolean', description: 'Whether the person saw this step succeed.' } },
          required: ['id', 'ok'],
          additionalProperties: false,
        },
      },
      reason: REASON,
      relay: RELAY,
    }, ['id', 'rev', 'steps', 'reason', 'relay']),
    output: { schema: OUTPUT, render },
    async execute(raw, exec) {
      const args = readRequest('graph_walk', raw, ['id', 'rev', 'steps', 'reason', 'relay'])
      if (typeof args.id !== 'string') refuse(failure('invalid', 'id must be a node id', 'pass the flow id', 'id'))
      if (typeof args.rev !== 'string') refuse(failure('invalid', 'rev is required', 'pass the flow rev from your latest graph_show', 'rev'))
      if (typeof args.reason !== 'string') refuse(failure('invalid', 'reason is required', 'one sentence for the history', 'reason'))
      if (typeof args.relay !== 'string') refuse(failure('invalid', 'relay is required: the person\'s own words', 'quote what they said about the walk, verbatim', 'relay'))
      const given = args.steps
      if (!Array.isArray(given) || given.some(entry => !isRecord(entry) || typeof entry.id !== 'string' || typeof entry.ok !== 'boolean')) {
        refuse(failure('invalid', 'steps must be an array of {id, ok}', 'one item per live approved step of the flow', 'steps'))
      }
      const resolved = await graphDir(dir, exec)
      const graph = await loadGraph(resolved)
      const flow = graph.nodes.get(args.id)
      if (flow === undefined) refuse(failure('not_found', `no readable node "${args.id}"`, 'graph_open lists the open nodes', 'id'))
      if (flow.type !== 'flow') refuse(failure('invalid', `"${flow.id}" is a ${flow.type}`, 'graph_walk records a walk of a flow', 'id'))
      const children = [...graph.nodes.values()].filter(node => node.parent === flow.id && node.type === 'step')
      const proposed = children.filter(step => step.status === 'proposed' && liveOf(graph, step))
      if (proposed.length > 0) {
        refuse(failure('bad_transition', `"${flow.id}" still has ${proposed.length} proposed step(s): ${proposed.map(step => step.id).join(', ')}`, 'a human approves or rejects them first; they are in graph_open and the panel\'s 需要你', 'id'))
      }
      const live = children.filter(step => step.status === 'approved' && liveOf(graph, step))
      const rev = graph.revisions.get(flow.id)!
      if (args.rev !== rev) {
        refuse(failure('stale_revision', `"${flow.id}" is at revision ${rev}, not ${String(args.rev)}`, 'read the projection again and retry with the new rev', 'rev'))
      }
      const okOf = new Map<string, boolean>()
      for (const entry of given as readonly { id: string, ok: boolean }[]) {
        if (okOf.has(entry.id)) refuse(failure('invalid', `"${entry.id}" is listed twice`, 'one item per step', 'steps'))
        okOf.set(entry.id, entry.ok)
      }
      const missing = live.map(step => step.id).filter(id => !okOf.has(id))
      const extra = [...okOf.keys()].filter(id => !live.some(step => step.id === id))
      if (missing.length > 0 || extra.length > 0) {
        const parts = [...missing.length > 0 ? [`missing: ${missing.join(', ')}`] : [], ...extra.length > 0 ? [`not steps of this flow: ${extra.join(', ')}`] : []]
        refuse(failure('invalid', `steps must list every live approved step of "${flow.id}" exactly once (${live.length} step(s)); ${parts.join('; ')}`, 'read the flow with graph_show and list its steps', 'steps'))
      }
      const head = headOf(cwdOf(exec as ToolExecutionContext | undefined))
      if (head === undefined) {
        refuse(failure('unavailable', 'the project root has no HEAD to record', 'deploy the build the person walked, then record the walk again; nothing was written', 'id'))
      }
      const firstLine = args.relay.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0) ?? ''
      const cutLine = [...firstLine].slice(0, USER_LIMITS_NOTE).join('') + ([...firstLine].length > USER_LIMITS_NOTE ? '…' : '')
      const note = `@${head} ${cutLine}`
      const engine = openEngine(resolved)
      const written: string[] = []
      for (const step of live) {
        const ok = okOf.get(step.id)!
        const evidence: Evidence[] = [{ kind: 'walk', ref: 'person:conversation', exit: ok ? 0 : 1, note }]
        const result = await engine.apply('llm', { op: 'walk', id: step.id, rev: graph.revisions.get(step.id)!, reason: args.reason, evidence, relay: args.relay })
        if (!result.ok) {
          const left = live.map(entry => entry.id).filter(id => !written.includes(id))
          refuse(failure(result.error.code, `${step.id} was not recorded (${result.error.message})`, `recorded so far: ${written.length === 0 ? 'nothing' : written.join(', ')}; read the steps again and retry the ones not written: ${left.join(', ') || 'none'}`, 'steps'))
        }
        written.push(step.id)
      }
      const after = await loadGraph(resolved)
      return { ok: true, id: flow.id, rev: after.revisions.get(flow.id)!, revision: after.revision, node: withoutHistory(after.nodes.get(flow.id)!), changed: written, commit: head }
    },
  }
}

/** Longest content of a walk note after the commit, in code points: the first line of the relay, cut with an ellipsis (design §2.7). */
const USER_LIMITS_NOTE = 200

/** The node as the write results carry it: everything but the history. */
function withoutHistory(node: GraphNode): Omit<GraphNode, 'history'> {
  const { history, ...rest } = node
  void history
  return rest
}

function writeTool(dir: string, op: LlmOp, description: string, parameters: JsonSchema, report: ThirdReworkReport, estimates: EstimateSink | undefined): ToolDefinitionLike {
  return {
    name: `graph_${op}`,
    description,
    parameters,
    output: { schema: WRITE_OUTPUT, render },
    async execute(args, exec) {
      if (isRecord(args) && args.op !== undefined && args.op !== op) {
        refuse(failure('invalid', `graph_${op} performs ${op}, not ${typeof args.op === 'string' ? args.op : JSON.stringify(args.op)}`, 'call the tool named after the operation; a supersession is a proposal with a supersedes edge', 'op'))
      }
      const resolved = await graphDir(dir, exec)
      const engine = openEngine(resolved)
      // The actor is this entry point's, never the request's: an actor field is refused as an extra field.
      const result = await engine.apply('llm', isRecord(args) ? { ...args, op } : args)
      if (!result.ok) refuse(result)
      const { history, ...node } = result.node
      const notice = op === 'status' ? await thirdReworkAfter(resolved, args, exec, result, report) : undefined
      return { ok: true, id: result.id, rev: result.rev, revision: result.revision, node, changed: result.changed, ...(result.warnings === undefined ? {} : { warnings: result.warnings }), ...(notice === undefined ? {} : { notice }), ...envTimeoutsAfter(op, result.node, exec, estimates) }
    },
  }
}

/**
 * The graph tools over one configured directory (absolute, or relative to
 * the session working directory), reads and the focus first; graph_focus
 * records the focus in `focuses`. src/toolsearch/exposure.ts keeps every
 * one of them resident on GLM requests. `report` reaches the loop board's
 * service and the row health for the third-rework question (m4 design §6.8);
 * without it the question is still filed, only not reported. `estimates`
 * receives the estimates a propose or edit of a tool node under env wrote
 * (m4 design §6.3.1); without it the timeouts still come back.
 */
export function graphTools(dir: string, focuses: FocusMemory, report: ThirdReworkReport = { loops: undefined }, estimates?: EstimateSink): ToolDefinitionLike[] {
  return [
    {
      name: 'graph_show',
      description: 'Read one node of the project graph with what a step needs: its fields, the ancestor chain up to the goal (with the goal\'s acceptance criteria and non-goals), children, dependencies both ways, sources, supersessions, stage and open gates. Every node reference carries the rev a change to that node must send.',
      parameters: object({ id: ID }, ['id']),
      output: { schema: SHOW_OUTPUT, render },
      async execute(args, exec) {
        const { id } = readRequest('graph_show', args, ['id'])
        if (typeof id !== 'string') refuse(failure('invalid', 'id must be a node id', 'pass {"id": "<node id>"}; graph_open lists the open nodes', 'id'))
        const graph = await openEngine(await graphDir(dir, exec)).load()
        const result = projectNode(graph, id)
        if (!result.ok) refuse(result)
        return { ok: true, projection: result.projection, ...invalidOf(graph) }
      },
    },
    {
      name: 'graph_open',
      description: 'List the open work in the project graph: proposals waiting for the human, the human\'s decision queue (questions), your own (agentQueue: questions with decider agent), the latest decisions (recentDecisions: who decided, relayed words), nodes in progress, tasks ready to start, and adopted decisions not yet verified. The human approves and decides in their panel or in the chat.',
      parameters: object({}, []),
      output: { schema: OPEN_OUTPUT, render },
      async execute(args, exec) {
        readRequest('graph_open', args, [])
        const graph = await openEngine(await graphDir(dir, exec)).load()
        const items = listOpenItems(graph)
        // reject does not cascade: a proposed user node under a rejected or dropped flow or role is no longer waiting for the person (user graph design 0.4.1 §3.7).
        const proposals = items.proposals.filter((ref) => {
          const node = graph.nodes.get(ref.id)
          return node === undefined || !isUserNode(node) || liveOf(graph, node)
        })
        return { ok: true, items: { ...items, proposals }, ...invalidOf(graph) }
      },
    },
    {
      name: FOCUS_TOOL,
      description: 'Set the node you are working on, usually the task in progress. From the next step on, its projection (path to the goal, children, dependencies, stage, open gates) arrives as a system reminder whenever it changes, after a compaction and with every goal round. One focus per session; call again to move it.',
      parameters: object({ id: ID }, ['id']),
      output: { schema: FOCUS_OUTPUT, render },
      async execute(args, exec) {
        const { id } = readRequest(FOCUS_TOOL, args, ['id'])
        if (typeof id !== 'string') refuse(failure('invalid', 'id must be a node id', 'pass {"id": "<node id>"}; graph_open lists the open nodes', 'id'))
        const session = (exec as ToolExecutionContext | undefined)?.agent?.session
        if (session === undefined) refuse(failure('invalid', `${FOCUS_TOOL} needs the session of the calling agent`, 'call it from an agent step; graph_show reads a node without a focus'))
        const graph = await openEngine(await graphDir(dir, exec)).load()
        const node = graph.nodes.get(id)
        if (node === undefined) refuse(failure('not_found', `no readable node "${id}"`, 'graph_open lists the open nodes', 'id'))
        focuses.set(session.id, id)
        return { ok: true, focus: { id, type: node.type, title: node.title, status: node.status }, ...invalidOf(graph) }
      },
    },
    ...WRITES.flatMap(write => {
      const tool = writeTool(dir, write.op, write.description, write.parameters, report, estimates)
      return write.op === 'relink' ? [tool, walkTool(dir)] : [tool]
    }),
  ]
}
