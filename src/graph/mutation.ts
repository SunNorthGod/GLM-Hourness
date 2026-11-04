/**
 * Mutation requests (docs/ORCHESTRATION.md §2.9): the typed shapes, the
 * structured errors, and the parser that checks an untrusted request
 * (command-line JSON, HTTP body) field by field before the engine looks at
 * the graph. Node field values inside `node` and `set` are checked later
 * against the would-be node, so their rules live in one place (format.ts).
 */
import { checkFieldValue, type GraphIssue } from './format.ts'
import {
  EDITABLE_FIELDS,
  ID_PATTERN,
  NODE_TYPES,
  OPS,
  OPTION_KEY_PATTERN,
  STATUSES,
  USER_LIMITS,
  VERIFICATIONS,
  WALK_NOTE_PATTERN,
  type EditableField,
  type Evidence,
  type FieldValue,
  type GraphEdge,
  type GraphNode,
  type Op,
  type Status,
  type Verification,
} from './schema.ts'

export type ErrorCode = 'invalid' | 'not_found' | 'conflict' | 'stale_revision' | 'forbidden' | 'evidence_required' | 'bad_transition' | 'graph_invalid' | 'unavailable'

export interface EngineError {
  readonly code: ErrorCode
  readonly message: string
  /** Request field the error is about, for example set.acceptance. */
  readonly field?: string
  /** The right way forward (CHARTER.md §6). */
  readonly hint: string
}

export interface Failure {
  readonly ok: false
  readonly error: EngineError
}

export function failure(code: ErrorCode, message: string, hint: string, field?: string): Failure {
  return { ok: false, error: field === undefined ? { code, message, hint } : { code, message, field, hint } }
}

/** Fields a propose request may carry; status, verification, evidence and history are set by the engine. */
export const PROPOSE_FIELDS = ['id', 'type', ...EDITABLE_FIELDS, 'form', 'edges'] as const

export type ProposedNode =
  & Pick<GraphNode, 'type' | 'title'>
  & Partial<Pick<GraphNode, 'id' | EditableField | 'edges'>>

type LinkType = Exclude<GraphEdge['type'], 'supersedes'>

interface Relayed {
  /** The human's words from the chat that ask for this llm write, verbatim (§2.9 relay). */
  readonly relay?: string
}

interface Targeted extends Relayed {
  readonly id: string
  /** Revision of the target node the caller read. */
  readonly rev: string
  readonly reason: string
}

export type Mutation =
  | (Relayed & { readonly op: 'propose', readonly node: ProposedNode, readonly reason: string })
  | (Targeted & { readonly op: 'approve' | 'reject' })
  | (Targeted & { readonly op: 'status', readonly to: Status, readonly evidence?: readonly Evidence[] })
  | (Targeted & { readonly op: 'edit', readonly set: Readonly<Partial<Record<EditableField, FieldValue | null>>> })
  | (Targeted & { readonly op: 'link' | 'unlink', readonly type: LinkType, readonly to: string, readonly when?: string })
  | { readonly op: 'comment', readonly id: string, readonly text: string }
  | (Targeted & { readonly op: 'decide', readonly option?: string, readonly conclusion?: string })
  | (Targeted & { readonly op: 'verify', readonly to: Verification, readonly evidence?: readonly Evidence[] })
  | (Targeted & { readonly op: 'supersede', readonly by: string })
  /** One write replacing the outgoing next edges of a step, or the entry of a flow (design 0.4.1 §3.5). */
  | (Targeted & { readonly op: 'relink', readonly next: readonly { readonly to: string, readonly when?: string }[] })
  /** Walk evidence on a step; the engine keeps at most USER_LIMITS.walkKept on the node (design §2.7). */
  | (Targeted & { readonly op: 'walk', readonly evidence: readonly Evidence[] })

/** Error for a bad field, or undefined when the value is acceptable. */
type FieldCheck = (value: unknown, field: string) => Failure | undefined

const SHAPE_HINT = 'send {op, ...fields} as described in docs/ORCHESTRATION.md §2.9'
const EDIT_HINT = `edit changes ${EDITABLE_FIELDS.join(', ')}; status, edges, evidence, decision, conclusion and verification have their own ops (status, link and unlink, decide, verify)`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(field: string, message: string, hint: string = SHAPE_HINT): Failure {
  return failure('invalid', `${field} ${message}`, hint, field)
}

const nodeId: FieldCheck = (value, field) =>
  typeof value === 'string' && ID_PATTERN.test(value) ? undefined : invalid(field, 'must be a node id (a lowercase letter, then up to 47 lowercase letters, digits or hyphens)')

const text: FieldCheck = (value, field) =>
  typeof value === 'string' && value.trim().length > 0 ? undefined : invalid(field, 'must be a non-empty string')

function oneOf(values: readonly string[]): FieldCheck {
  return (value, field) => typeof value === 'string' && values.includes(value) ? undefined : invalid(field, `must be one of ${values.join(', ')}`)
}

const optionKey: FieldCheck = (value, field) =>
  typeof value === 'string' && OPTION_KEY_PATTERN.test(value) ? undefined : invalid(field, 'must be an option key')

/** The evidence entries of a request field, shape-checked; a Failure when malformed. */
function evidenceShape(value: unknown, field: string): { readonly entries: readonly Evidence[] } | Failure {
  const issues: GraphIssue[] = []
  checkFieldValue('evidence', value, '', field, issues)
  const first = issues[0]
  if (first !== undefined) return invalid(first.field ?? field, first.message)
  return { entries: value as readonly Evidence[] }
}

const evidence: FieldCheck = (value, field) => {
  const shape = evidenceShape(value, field)
  if (!('entries' in shape)) return shape
  const { entries } = shape
  const engineWritten = entries.findIndex(entry => entry.kind === 'decision')
  if (engineWritten >= 0) return invalid(`${field}[${engineWritten}].kind`, 'decision evidence is written by decide', 'attach commit, test or check evidence; decide records the decision itself')
  const walked = entries.findIndex(entry => entry.kind === 'walk')
  if (walked >= 0) return invalid(`${field}[${walked}].kind`, 'a walk is recorded with the walk operation', 'graph_walk records the person\'s own walk, the harness records the runs it makes; status and verify take commit, test or check evidence')
  return undefined
}

/** The evidence of a walk operation: 1 to USER_LIMITS.walkEvidence entries, all of the walk kind (design 0.4.1 §2.7 W4). */
const walkEvidence: FieldCheck = (value, field) => {
  const shape = evidenceShape(value, field)
  if (!('entries' in shape)) return shape
  const { entries } = shape
  if (entries.length < 1 || entries.length > USER_LIMITS.walkEvidence) {
    return invalid(field, `must hold 1 to ${USER_LIMITS.walkEvidence} entries`, 'one walk records the result of the steps it covered, one entry each')
  }
  const other = entries.findIndex(entry => entry.kind !== 'walk')
  if (other >= 0) return invalid(`${field}[${other}].kind`, 'a walk records walk evidence only', 'every entry of the walk operation is kind walk')
  const badNote = entries.findIndex(entry => !WALK_NOTE_PATTERN.test(entry.note ?? ''))
  if (badNote >= 0) {
    return invalid(`${field}[${badNote}].note`, 'starts with @ and the commit the walk ran at, then one line of result', 'note is "@<7-40 lowercase hex digits> what happened"; the commit is the one the walk ran on')
  }
  return undefined
}

/** One entry of a relink list: a step id of the same flow, with an optional branch condition. */
const relinkEntry: FieldCheck = (value, field) => {
  if (!isRecord(value)) return invalid(field, 'must be an object {to, when?}', 'each entry names the next step by id, with a when for a branch')
  const to = value.to
  if (typeof to !== 'string' || !ID_PATTERN.test(to)) return invalid(`${field}.to`, 'must be a node id (a lowercase letter, then up to 47 lowercase letters, digits or hyphens)')
  const when = value.when
  if (when !== undefined) {
    if (typeof when !== 'string' || when.trim().length === 0 || /[\r\n]/.test(when)) return invalid(`${field}.when`, 'must be a single non-empty line', 'the condition in the user\'s words')
    if ([...when].length > USER_LIMITS.when) return invalid(`${field}.when`, `must be at most ${USER_LIMITS.when} code points`, 'shorten the condition')
  }
  const extra = Object.keys(value).find(key => key !== 'to' && key !== 'when')
  if (extra !== undefined) return invalid(`${field}.${extra}`, 'is not a field of a relink entry', 'an entry takes to and an optional when')
  return undefined
}

const relinkNext: FieldCheck = (value, field) => {
  if (!Array.isArray(value)) return invalid(field, 'must be an array of {to, when?}', 'the outgoing next edges after the write, one entry per branch or step')
  for (const [index, entry] of value.entries()) {
    const bad = relinkEntry(entry, `${field}[${index}]`)
    if (bad !== undefined) return bad
  }
  return undefined
}

const proposedNode: FieldCheck = (value, field) => {
  if (!isRecord(value)) return invalid(field, 'must be a JSON object')
  const allowed = new Set<string>(PROPOSE_FIELDS)
  const extra = Object.keys(value).find(key => !allowed.has(key))
  if (extra !== undefined) return invalid(`${field}.${extra}`, 'cannot be set by propose', `propose takes ${PROPOSE_FIELDS.join(', ')}; the engine sets status, verification and history`)
  if (value.type === undefined) return invalid(`${field}.type`, 'is required')
  if (value.id !== undefined) {
    const bad = nodeId(value.id, `${field}.id`)
    if (bad !== undefined) return bad
  }
  return oneOf(NODE_TYPES)(value.type, `${field}.type`)
}

const fieldSet: FieldCheck = (value, field) => {
  if (!isRecord(value)) return invalid(field, 'must be a JSON object of field -> new value (null removes the field)')
  const keys = Object.keys(value)
  if (keys.length === 0) return invalid(field, 'must name at least one field', EDIT_HINT)
  const editable = new Set<string>(EDITABLE_FIELDS)
  const extra = keys.find(key => !editable.has(key))
  if (extra === 'form') return invalid(`${field}.${extra}`, 'is set when the question is made and cannot change', 'propose a new question; to replace this one, first drop it with graph_status (status dropped) and the human\'s exact words in relay')
  return extra === undefined ? undefined : invalid(`${field}.${extra}`, 'is not an editable field', EDIT_HINT)
}

/** Longest relay kept in a history entry; a relay quotes what the human said, not a document. */
const RELAY_LIMIT = 2000

const relay: FieldCheck = (value, field) => {
  const bad = text(value, field)
  if (bad !== undefined) return bad
  return (value as string).length <= RELAY_LIMIT ? undefined : invalid(field, `must be at most ${RELAY_LIMIT} characters`, 'quote the sentences of the human that ask for this change, not the whole conversation')
}

const targeted = { id: nodeId, rev: text, reason: text, relay } as const

/** The branch condition of a link, when it carries one (design 0.4.1 §3.3 V5): one line, at most USER_LIMITS.when code points. */
const linkWhen: FieldCheck = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0 || /[\r\n]/.test(value)) return invalid(field, 'must be a single non-empty line', 'the branch condition, in the user\'s words')
  if ([...value].length > USER_LIMITS.when) return invalid(field, `must be at most ${USER_LIMITS.when} code points`, 'shorten the condition')
  return undefined
}

/** Fields of each operation and their checks. Optional fields are the per-operation set below: evidence rides with status and verify, is required for walk; a link's when is optional; so is a relay. */
const OP_FIELDS: Readonly<Record<Op, Readonly<Record<string, FieldCheck>>>> = {
  propose: { node: proposedNode, reason: text, relay },
  approve: targeted,
  reject: targeted,
  status: { ...targeted, to: oneOf(STATUSES), evidence },
  edit: { ...targeted, set: fieldSet },
  link: { ...targeted, type: oneOf(['depends', 'source', 'serves', 'next']), to: nodeId, when: linkWhen },
  unlink: { ...targeted, type: oneOf(['depends', 'source', 'serves', 'next']), to: nodeId },
  comment: { id: nodeId, text },
  decide: { ...targeted, option: optionKey, conclusion: text },
  verify: { ...targeted, to: oneOf(VERIFICATIONS), evidence },
  supersede: { ...targeted, by: nodeId },
  walk: { ...targeted, evidence: walkEvidence },
  relink: { ...targeted, next: relinkNext },
}

/** Fields that may be left out of any operation that names them. `evidence` is optional everywhere except walk, which requires it. */
const OPTIONAL_FIELDS = new Set(['evidence', 'relay', 'option', 'conclusion', 'when'])
const EVIDENCE_REQUIRED_OP = 'walk'

/** Check the request shape; the engine applies the graph rules afterwards. */
export function parseMutation(input: unknown): { readonly ok: true, readonly mutation: Mutation } | Failure {
  if (!isRecord(input)) return failure('invalid', 'a mutation must be a JSON object', SHAPE_HINT)
  const op = input.op
  if (typeof op !== 'string' || !(OPS as readonly string[]).includes(op)) return invalid('op', `must be one of ${OPS.join(', ')}`)
  const fields = OP_FIELDS[op as Op]
  const extra = Object.keys(input).find(key => key !== 'op' && !Object.hasOwn(fields, key))
  if (extra !== undefined) return invalid(extra, `is not a field of ${op}`, `${op} takes ${Object.keys(fields).join(', ')}`)
  for (const [field, check] of Object.entries(fields)) {
    const value = input[field]
    if (value === undefined) {
      if (OPTIONAL_FIELDS.has(field) && !(field === 'evidence' && op === EVIDENCE_REQUIRED_OP)) continue
      return invalid(field, 'is required', `${op} takes ${Object.keys(fields).join(', ')}`)
    }
    const bad = check(value, field)
    if (bad !== undefined) return bad
  }
  // A question with options is decided with an option, a proposal with a conclusion: exactly one of the two.
  if (op === 'decide' && (input.option === undefined) === (input.conclusion === undefined)) {
    return invalid('option', input.option === undefined ? 'or conclusion is required' : 'and conclusion are exclusive', 'decide takes option (a question with options) or conclusion (a proposal), not both')
  }
  return { ok: true, mutation: input as unknown as Mutation }
}
