/**
 * Node file format (docs/ORCHESTRATION.md §2.6): shape checks that turn a
 * parsed JSON value into a typed node, the per-node rules, and the
 * canonical writer. A canonical file read and written again is
 * byte-identical; every issue names the file and the field path.
 */
import {
  ACTORS,
  COMMIT_PATTERN,
  EDGE_TYPES,
  EDITABLE_FIELDS,
  EVIDENCE_KINDS,
  HISTORY_FIELDS,
  ID_PATTERN,
  NODE_FIELDS,
  NODE_TYPES,
  OPS,
  OPTION_KEY_PATTERN,
  DISPATCH_FIELDS,
  SLOPES,
  STAGES,
  STATUSES,
  TASK_KINDS,
  TIERS,
  TIMESTAMP_PATTERN,
  VERIFICATIONS,
  isPassingEvidence,
  type DecisionOption,
  type Evidence,
  type FieldChange,
  type GraphEdge,
  type GraphNode,
  type HistoryEntry,
} from './schema.ts'

export interface GraphIssue {
  /** Errors block every write; notices are informational. */
  readonly severity: 'error' | 'notice'
  /** Path relative to the graph directory, for example nodes/task-1.json. */
  readonly file: string
  /** Field path inside the node, for example history[2].actor. */
  readonly field?: string
  readonly message: string
}

export function nodeFile(id: string): string {
  return `nodes/${id}.json`
}

/** Code-unit order, so sorting does not depend on the locale. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

type Report = (field: string | undefined, message: string) => void

function reporter(file: string, issues: GraphIssue[]): Report {
  return (field, message) => {
    issues.push(field === undefined ? { severity: 'error', file, message } : { severity: 'error', file, field, message })
  }
}

const INVALID = Symbol('invalid')
type Checker = (value: unknown, path: string, report: Report) => unknown
type FieldSpec = readonly (readonly [field: string, check: Checker, required: boolean])[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fieldPath(path: string | undefined, field: string): string {
  return path === undefined ? field : `${path}.${field}`
}

/**
 * Read the fields of one JSON object. Unknown keys are reported and left
 * out; a missing required field or a field of the wrong shape makes the
 * whole object INVALID.
 */
function record(value: unknown, path: string | undefined, spec: FieldSpec, report: Report): Record<string, unknown> | typeof INVALID {
  if (!isRecord(value)) {
    report(path, 'must be a JSON object')
    return INVALID
  }
  const known = new Set(spec.map(([field]) => field))
  for (const key of Object.keys(value)) {
    if (!known.has(key)) report(fieldPath(path, key), 'is not a known field')
  }
  const out: Record<string, unknown> = {}
  let ok = true
  for (const [field, check, required] of spec) {
    const raw = value[field]
    const at = fieldPath(path, field)
    if (raw === undefined) {
      if (required) {
        report(at, 'is required')
        ok = false
      }
      continue
    }
    const checked = check(raw, at, report)
    if (checked === INVALID) ok = false
    else out[field] = checked
  }
  return ok ? out : INVALID
}

function list(item: Checker): Checker {
  return (value, path, report) => {
    if (!Array.isArray(value)) {
      report(path, 'must be an array')
      return INVALID
    }
    const out: unknown[] = []
    let ok = true
    value.forEach((element, index) => {
      const checked = item(element, `${path}[${index}]`, report)
      if (checked === INVALID) ok = false
      else out.push(checked)
    })
    return ok ? out : INVALID
  }
}

const text: Checker = (value, path, report) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    report(path, 'must be a non-empty string')
    return INVALID
  }
  return value
}

const line: Checker = (value, path, report) => {
  const checked = text(value, path, report)
  if (checked === INVALID) return INVALID
  if (/[\r\n]/.test(value as string)) {
    report(path, 'must be a single line')
    return INVALID
  }
  return checked
}

function pattern(regex: RegExp, description: string): Checker {
  return (value, path, report) => {
    if (typeof value !== 'string' || !regex.test(value)) {
      report(path, `must be ${description}`)
      return INVALID
    }
    return value
  }
}

const nodeId = pattern(ID_PATTERN, 'a node id (a lowercase letter, then up to 47 lowercase letters, digits or hyphens)')
const optionKey = pattern(OPTION_KEY_PATTERN, 'an option key (a letter or digit, then up to 31 letters, digits or hyphens)')

function oneOf(values: readonly string[]): Checker {
  const allowed = new Set(values)
  return (value, path, report) => {
    if (typeof value !== 'string' || !allowed.has(value)) {
      report(path, `must be one of ${values.join(', ')}`)
      return INVALID
    }
    return value
  }
}

const flag: Checker = (value, path, report) => {
  if (typeof value !== 'boolean') {
    report(path, 'must be true or false')
    return INVALID
  }
  return value
}

/** Characters that make a path absolute, a glob or unusable on Windows; control characters U+0000–U+001F are checked apart. */
const NOT_IN_PATHS = /[\\:*?"<>|]/

function unusableInPath(text: string): boolean {
  return NOT_IN_PATHS.test(text) || [...text].some(char => char.charCodeAt(0) < 0x20)
}

/** A repository-relative path: / separators, no empty, . or .. segments; a directory may end with /. */
const scopePath: Checker = (value, path, report) => {
  const segments = typeof value === 'string' ? value.split('/') : []
  if (segments.length > 1 && segments.at(-1) === '') segments.pop()
  if (typeof value !== 'string' || unusableInPath(value) || segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    report(path, 'must be a repository-relative path with / separators and no empty, . or .. segments (a directory may end with /)')
    return INVALID
  }
  return value
}

const integer: Checker = (value, path, report) => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    report(path, 'must be an integer')
    return INVALID
  }
  return value
}

const timestamp: Checker = (value, path, report) => {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    report(path, 'must be an ISO 8601 UTC timestamp such as 2026-10-28T08:00:00.000Z')
    return INVALID
  }
  return value
}

function nullable(check: Checker): Checker {
  return (value, path, report) => value === null ? null : check(value, path, report)
}

const option: Checker = (value, path, report) => record(value, path, [
  ['key', optionKey, true],
  ['label', line, true],
  ['consequence', text, true],
], report)

const edge: Checker = (value, path, report) => record(value, path, [
  ['type', oneOf(EDGE_TYPES), true],
  ['to', nodeId, true],
], report)

const evidenceItem: Checker = (value, path, report) => {
  const out = record(value, path, [
    ['kind', oneOf(EVIDENCE_KINDS), true],
    ['ref', line, true],
    ['exit', integer, false],
    ['note', text, false],
  ], report)
  if (out === INVALID) return INVALID
  const kind = out.kind as Evidence['kind']
  if (kind === 'commit' && !COMMIT_PATTERN.test(out.ref as string)) report(`${path}.ref`, 'must be a commit hash of 7 to 40 lowercase hex digits')
  if ((kind === 'test' || kind === 'check') && out.exit === undefined) report(`${path}.exit`, 'is required for test and check evidence')
  if ((kind === 'commit' || kind === 'decision') && out.exit !== undefined) report(`${path}.exit`, 'only test and check evidence carry an exit code')
  return out
}

const FIELD_CHECKERS: Record<typeof NODE_FIELDS[number], Checker> = {
  id: nodeId,
  type: oneOf(NODE_TYPES),
  title: line,
  status: oneOf(STATUSES),
  parent: nodeId,
  slope: oneOf(SLOPES),
  stage: oneOf(STAGES),
  verification: oneOf(VERIFICATIONS),
  kind: oneOf(TASK_KINDS),
  tier: oneOf(TIERS),
  worktree: flag,
  outputSchema: line,
  body: text,
  acceptance: list(text),
  nonGoals: list(text),
  writeScope: list(scopePath),
  options: list(option),
  recommend: optionKey,
  decision: optionKey,
  edges: list(edge),
  evidence: list(evidenceItem),
  history: list(historyEntry),
}

const REQUIRED_FIELDS = new Set<string>(['id', 'type', 'title', 'status', 'history'])
const EDITABLE = new Set<string>(EDITABLE_FIELDS)

const changes: Checker = (value, path, report) => {
  if (!isRecord(value)) {
    report(path, 'must be a JSON object')
    return INVALID
  }
  const out: Record<string, unknown> = {}
  let ok = true
  for (const key of Object.keys(value)) {
    const at = `${path}.${key}`
    if (!EDITABLE.has(key)) {
      report(at, 'is not an editable field')
      continue
    }
    const check = nullable(FIELD_CHECKERS[key as typeof EDITABLE_FIELDS[number]])
    const change = record(value[key], at, [['from', check, true], ['to', check, true]], report)
    if (change === INVALID) ok = false
    else out[key] = change
  }
  return ok ? out : INVALID
}

const TRANSITION_STATES = [...new Set<string>([...STATUSES, ...VERIFICATIONS])]

function historyEntry(value: unknown, path: string, report: Report): unknown {
  const out = record(value, path, [
    ['at', timestamp, true],
    ['actor', oneOf(ACTORS), true],
    ['op', oneOf(OPS), true],
    ['reason', text, false],
    ['from', oneOf(TRANSITION_STATES), false],
    ['to', oneOf(TRANSITION_STATES), false],
    ['option', optionKey, false],
    ['by', nodeId, false],
    ['edge', edge, false],
    ['changes', changes, false],
    ['evidence', list(evidenceItem), false],
    ['text', text, false],
  ], report)
  if (out === INVALID) return INVALID
  if (out.op !== 'comment' && out.reason === undefined) report(`${path}.reason`, 'is required for every operation except comment')
  if (out.op === 'comment' && out.text === undefined) report(`${path}.text`, 'is required for a comment')
  return out
}

/**
 * Shape-check one value of a node field, reporting under `path`; the engine
 * uses it for request values such as attached evidence. Returns undefined
 * when the value is malformed; rule violations are reported but keep the value.
 */
export function checkFieldValue(field: typeof NODE_FIELDS[number], value: unknown, file: string, path: string, issues: GraphIssue[]): unknown {
  const checked = FIELD_CHECKERS[field](value, path, reporter(file, issues))
  return checked === INVALID ? undefined : checked
}

/**
 * Check one parsed node file. Returns the typed node when every known
 * field has the right shape; rule violations are reported but keep the
 * node, so readers can still show it.
 */
export function checkNode(value: unknown, file: string, issues: GraphIssue[]): GraphNode | undefined {
  const report = reporter(file, issues)
  const spec: FieldSpec = NODE_FIELDS.map(field => [field, FIELD_CHECKERS[field], REQUIRED_FIELDS.has(field)] as const)
  const out = record(value, undefined, spec, report)
  if (out === INVALID) return undefined
  const node = out as unknown as GraphNode
  issues.push(...nodeRuleIssues(node, file))
  return node
}

/** Cross-field rules of one node (§2.6 validation list). */
function nodeRuleIssues(node: GraphNode, file: string): GraphIssue[] {
  const issues: GraphIssue[] = []
  const report = reporter(file, issues)
  if (node.type === 'goal') {
    if (node.parent !== undefined) report('parent', 'a goal node has no parent')
  }
  else if (node.parent === undefined) {
    report('parent', `is required for a ${node.type} node`)
  }
  if (node.stage !== undefined && node.type !== 'goal' && node.type !== 'feature') report('stage', 'only goal and feature nodes carry a stage')
  if (node.type === 'task') {
    if (node.kind === 'review' && (node.writeScope ?? []).length > 0) report('writeScope', 'a review task writes nothing: its write scope stays empty')
    node.writeScope?.forEach((entry, index) => {
      if (node.writeScope!.indexOf(entry) !== index) report(`writeScope[${index}]`, `duplicate path "${entry}"`)
    })
  }
  else {
    for (const field of DISPATCH_FIELDS) {
      if (node[field] !== undefined) report(field, 'only task nodes carry dispatch attributes (kind, tier, worktree, outputSchema, writeScope)')
    }
  }
  if (node.type === 'decision') {
    if (node.verification === undefined) report('verification', 'is required for a decision node')
  }
  else if (node.verification !== undefined) {
    report('verification', 'only decision nodes carry a verification state')
  }
  const keys = new Set((node.options ?? []).map(entry => entry.key))
  if (node.type === 'question') {
    if (node.options === undefined) report('options', 'is required for a question node')
    else if (node.options.length < 2 || node.options.length > 4) report('options', 'a question node has 2 to 4 options')
    node.options?.forEach((entry, index) => {
      if (node.options!.findIndex(other => other.key === entry.key) !== index) report(`options[${index}].key`, `duplicate option key "${entry.key}"`)
    })
    if (node.recommend === undefined) report('recommend', 'is required for a question node')
    else if (!keys.has(node.recommend)) report('recommend', `"${node.recommend}" is not an option key`)
    if (node.decision !== undefined && !keys.has(node.decision)) report('decision', `"${node.decision}" is not an option key`)
  }
  else {
    for (const field of ['options', 'recommend', 'decision'] as const) {
      if (node[field] !== undefined) report(field, 'only question nodes carry options, recommend and decision')
    }
  }
  node.edges?.forEach((entry, index) => {
    if (node.edges!.findIndex(other => other.type === entry.type && other.to === entry.to) !== index) report(`edges[${index}]`, `duplicate ${entry.type} edge to "${entry.to}"`)
  })
  node.evidence?.forEach((entry, index) => {
    if (entry.kind !== 'decision') return
    if (node.type !== 'question') report(`evidence[${index}].kind`, 'decision evidence belongs to question nodes')
    else if (!keys.has(entry.ref)) report(`evidence[${index}].ref`, `"${entry.ref}" is not an option key`)
  })
  if (node.status === 'done' && !(node.evidence ?? []).some(isPassingEvidence)) {
    report('evidence', 'a done node needs passing evidence: a commit, a test or check with exit 0, or a decision')
  }
  if (node.history.length === 0) report('history', 'needs at least one entry')
  return issues
}

function canonicalEdge(entry: GraphEdge): GraphEdge {
  return { type: entry.type, to: entry.to }
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return compareText(a.type, b.type) || compareText(a.to, b.to)
}

function canonicalEvidence(entry: Evidence): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: entry.kind, ref: entry.ref }
  if (entry.exit !== undefined) out.exit = entry.exit
  if (entry.note !== undefined) out.note = entry.note
  return out
}

function canonicalValue(field: string, value: unknown): unknown {
  switch (field) {
    case 'options':
      return (value as readonly DecisionOption[]).map(entry => ({ key: entry.key, label: entry.label, consequence: entry.consequence }))
    case 'edges':
      return [...(value as readonly GraphEdge[])].sort(compareEdges).map(canonicalEdge)
    case 'evidence':
      return (value as readonly Evidence[]).map(canonicalEvidence)
    case 'history':
      return (value as readonly HistoryEntry[]).map(canonicalHistory)
    default:
      return value
  }
}

function canonicalChanges(value: Readonly<Partial<Record<string, FieldChange>>>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    const change = value[field]
    if (change === undefined) continue
    out[field] = {
      from: change.from === null ? null : canonicalValue(field, change.from),
      to: change.to === null ? null : canonicalValue(field, change.to),
    }
  }
  return out
}

function canonicalHistory(entry: HistoryEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of HISTORY_FIELDS) {
    const value = entry[field]
    if (value === undefined) continue
    if (field === 'edge') out.edge = canonicalEdge(value as GraphEdge)
    else if (field === 'changes') out.changes = canonicalChanges(value as Readonly<Partial<Record<string, FieldChange>>>)
    else if (field === 'evidence') {
      if ((value as readonly Evidence[]).length > 0) out.evidence = canonicalValue(field, value)
    }
    else out[field] = value
  }
  return out
}

/**
 * Canonical node text: fields in schema order, empty optional arrays
 * omitted, edges sorted by (type, target), two-space indent, LF, trailing
 * newline, non-ASCII written as is.
 */
export function serializeNode(node: GraphNode): string {
  const out: Record<string, unknown> = {}
  for (const field of NODE_FIELDS) {
    const value = node[field]
    if (value === undefined) continue
    if (Array.isArray(value) && value.length === 0 && field !== 'history') continue
    out[field] = canonicalValue(field, value)
  }
  return `${JSON.stringify(out, null, 2)}\n`
}
