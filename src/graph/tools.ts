/**
 * DSH graph tools (docs/ORCHESTRATION.md §2.10): the command-line contract
 * as model-facing tools. Every call is one engine call with actor llm, so
 * the tools enforce the engine's rules and no others; a refusal comes back
 * as a tool error whose text is the engine's {code, message, field?, hint}.
 * The operations only a human performs (approve, reject, decide, supersede)
 * are not tools. graph_focus writes nothing to the graph: it sets the
 * session's focus node for the step projection (reminder.ts, §2.5). The
 * graph directory is resolved per call: an absolute dir from the row
 * config as is, a relative one (default docs/graph) under the calling
 * agent's session working directory. A missing directory is reported,
 * never created.
 */
import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import { openEngine } from './engine.ts'
import { failure, type Failure } from './mutation.ts'
import { listOpenItems, projectNode } from './projection.ts'
import { NODE_TYPES, SLOPES, STAGES, TASK_KINDS, TIERS } from './schema.ts'
import type { LoadedGraph } from './store.ts'

/** Loader row id, named in hints so the model can point the human at the config. */
export const GRAPH_ROW_ID = 'glm-hourness/graph'

/** Graph directory under the session working directory when the row config names none. */
export const DEFAULT_GRAPH_DIR = 'docs/graph'

/** Engine operations an llm can perform, one tool each. */
type LlmOp = 'propose' | 'status' | 'edit' | 'link' | 'unlink' | 'comment' | 'verify'

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
 * The graph directory of the configured dir (absolute, or relative to the
 * session working directory `cwd`), or not_found when there is none to work on.
 */
export async function locateGraph(configured: string, cwd: string | undefined): Promise<string | Failure> {
  let dir: string
  if (isAbsolute(configured)) {
    dir = resolve(configured)
  }
  else {
    if (typeof cwd !== 'string' || cwd.length === 0) return failure('not_found', `this session has no working directory to find ${configured} in`, ROW_HINT)
    dir = resolve(cwd, configured)
  }
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

/** The tool that sets the focus node; the step projection finds its calls in the history. */
export const FOCUS_TOOL = 'graph_focus'

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
    title: { type: 'string', description: 'One line.' },
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
      description: 'Question only: 2-4 options.',
      items: {
        type: 'object',
        properties: { key: { type: 'string', description: 'For example A.' }, label: { type: 'string' }, consequence: { type: 'string' } },
        required: ['key', 'label', 'consequence'],
        additionalProperties: false,
      },
    },
    recommend: { type: 'string', description: 'Question only: key of the recommended option.' },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['depends', 'source', 'supersedes'] }, to: ID },
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
  },
  required: ['ok', 'id', 'rev', 'revision', 'node', 'changed'],
}

const WRITES: ReadonlyArray<{ readonly op: LlmOp, readonly description: string, readonly parameters: JsonSchema }> = [
  {
    op: 'propose',
    description: 'Add a node to the project graph. Planned work starts approved: a task under an approved or in-progress feature or task; a risk, question or retro under an open node. Anything else (a new branch, decision, norm, tool or goal, or a supersedes edge) waits as a proposal for a human.',
    parameters: object({ node: NODE, reason: REASON }, ['node', 'reason']),
  },
  {
    op: 'status',
    description: 'Move a node: approved to doing, done or dropped; doing to done or dropped; done back to doing (reopen); dropped back to approved. Done needs passing evidence: a commit, or a test or check run with exit 0. A question closes only when a human decides it.',
    parameters: object({ id: ID, rev: REV, to: { type: 'string', enum: ['approved', 'doing', 'done', 'dropped'] }, reason: REASON, evidence: EVIDENCE }, ['id', 'rev', 'to', 'reason']),
  },
  {
    op: 'edit',
    description: 'Change fields of a node: title, body, slope, and on a task its dispatch attributes (kind, tier, worktree, outputSchema, writeScope); any field of your own proposal while it waits. The goal, acceptance criteria and non-goals are the human\'s: propose a question instead.',
    parameters: object({
      id: ID,
      rev: REV,
      set: { type: 'object', description: 'Field name to new value; null removes the field.' },
      reason: REASON,
    }, ['id', 'rev', 'set', 'reason']),
  },
  {
    op: 'link',
    description: 'Add an edge from a node: depends (it needs `to` done first) or source (it exists because of `to`).',
    parameters: object({ id: ID, rev: REV, type: { type: 'string', enum: ['depends', 'source'] }, to: ID, reason: REASON }, ['id', 'rev', 'type', 'to', 'reason']),
  },
  {
    op: 'unlink',
    description: 'Remove a depends or source edge from a node.',
    parameters: object({ id: ID, rev: REV, type: { type: 'string', enum: ['depends', 'source'] }, to: ID, reason: REASON }, ['id', 'rev', 'type', 'to', 'reason']),
  },
  {
    op: 'comment',
    description: 'Comment on a node for the human or for later steps, for example why a question no longer matters. Needs no rev.',
    parameters: object({ id: ID, text: { type: 'string' } }, ['id', 'text']),
  },
  {
    op: 'verify',
    description: 'Record how far a decision node is verified: unverified, sandbox, device or overturned. Sandbox and device need a test or check run with exit 0.',
    parameters: object({ id: ID, rev: REV, to: { type: 'string', enum: ['unverified', 'sandbox', 'device', 'overturned'] }, reason: REASON, evidence: EVIDENCE }, ['id', 'rev', 'to', 'reason']),
  },
]

function writeTool(dir: string, op: LlmOp, description: string, parameters: JsonSchema): ToolDefinitionLike {
  return {
    name: `graph_${op}`,
    description,
    parameters,
    output: { schema: WRITE_OUTPUT, render },
    async execute(args, exec) {
      if (isRecord(args) && args.op !== undefined && args.op !== op) {
        refuse(failure('invalid', `graph_${op} performs ${op}, not ${String(args.op)}`, 'call the tool named after the operation; approve, reject, decide and supersede are the human\'s', 'op'))
      }
      const engine = openEngine(await graphDir(dir, exec))
      // The actor is this entry point's, never the request's: an actor field is refused as an extra field.
      const result = await engine.apply('llm', isRecord(args) ? { ...args, op } : args)
      if (!result.ok) refuse(result)
      const { history, ...node } = result.node
      return { ok: true, id: result.id, rev: result.rev, revision: result.revision, node, changed: result.changed }
    },
  }
}

/**
 * The graph tools over one configured directory (absolute, or relative to
 * the session working directory), reads and the focus first; graph_focus
 * records the focus in `focuses`. src/toolsearch/exposure.ts keeps every
 * one of them resident on GLM requests.
 */
export function graphTools(dir: string, focuses: FocusMemory): ToolDefinitionLike[] {
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
      description: 'List the open work in the project graph: proposals waiting for a human, the decision queue (questions only a human decides, oldest first), nodes in progress, tasks ready to start, and adopted decisions not yet verified. Approving, rejecting, deciding and superseding are the human\'s, in the graph viewer.',
      parameters: object({}, []),
      output: { schema: OPEN_OUTPUT, render },
      async execute(args, exec) {
        readRequest('graph_open', args, [])
        const graph = await openEngine(await graphDir(dir, exec)).load()
        return { ok: true, items: listOpenItems(graph), ...invalidOf(graph) }
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
    ...WRITES.map(write => writeTool(dir, write.op, write.description, write.parameters)),
  ]
}
