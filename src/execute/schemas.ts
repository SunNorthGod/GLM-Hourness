/**
 * The structured handback of a worker and of a reviewer (M7 design 0.6
 * §3.6.1): the two built-in output schemas a dispatched subagent submits with
 * `structured_output`, and the pure semantic checks the handback processing
 * runs on a parsed result (§3.6.2 step 2's shape half; whether a commit is on
 * the branch needs git and stays with the caller).
 *
 * Both schemas stay inside the subset rc.3's `assertObjectJsonSchema` accepts
 * for structured outputs (subagent:3046, dsh-tools:334 with the constraint
 * and annotation keyword sets at dsh-tools:34–51): `type`, `properties`,
 * `required`, boolean `additionalProperties`, `items`, `enum`, and the
 * `description` annotation. A task node may name a repository schema instead;
 * `mergeHandbackSchema` folds the built-in core fields into it, because the
 * handback processing needs those fields whatever the task wrote.
 */

/** The object schema as far as this module builds it. */
export type SchemaNode =
  | { readonly type: 'object', readonly properties: Readonly<Record<string, SchemaNode>>, readonly required?: readonly string[], readonly additionalProperties?: boolean, readonly description?: string }
  | { readonly type: 'array', readonly items: SchemaNode, readonly description?: string }
  | { readonly type: 'string', readonly enum?: readonly string[], readonly description?: string }
  | { readonly type: 'number' | 'integer' | 'boolean', readonly description?: string }

const LESSON_FIELDS: Readonly<Record<string, SchemaNode>> = {
  problem: { type: 'string', description: 'what went wrong' },
  fix: { type: 'string', description: 'what to do differently next time' },
  files: { type: 'array', items: { type: 'string' }, description: 'where it applies, repository-relative paths or directories ending in /' },
  commands: { type: 'array', items: { type: 'string' }, description: 'the commands it applies to, first words only' },
  tools: { type: 'array', items: { type: 'string' }, description: 'the tools it applies to' },
  errors: { type: 'array', items: { type: 'string' }, description: 'error fragments that identify the situation, at most 5 of 8-300 characters' },
  scope: { type: 'string', enum: ['project', 'all'], description: 'project keeps it to this project; all shares it with every project' },
}

const HEX = /^[0-9a-f]{7,40}$/i

/** `Hourness-Task`-style commits and the review's commit are hexadecimal and 7-40 digits long. */
function isCommitish(value: unknown): boolean {
  return typeof value === 'string' && HEX.test(value)
}

/**
 * A repository-relative path as the handback's `files` and the review's `where`
 * carry them: no absolute form, no drive letter, no backslash, no `..`, no
 * empty segments. Comparison stays textural; case is the file system's.
 */
function isRepoRelative(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  if (/^[A-Za-z]:/.test(value) || value.startsWith('/') || value.includes('\\')) return false
  const segments = value.split('/')
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

const STRING_LIST: SchemaNode = { type: 'array', items: { type: 'string' } }

const HANDBACK_LESSON: SchemaNode = { type: 'object', properties: LESSON_FIELDS, required: ['problem', 'fix', 'files', 'commands', 'tools'] }

/** `hourness-handback-v1` (§3.6.1): what every dispatched worker submits when its task ends. */
export const HANDBACK_SCHEMA: SchemaNode = {
  type: 'object',
  description: 'The handback of a dispatched task. Submit it once, when the work is over.',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked', 'partial', 'plan-pending'], description: 'done: the acceptance holds. blocked: only the person can move it. partial: some acceptance holds, say which in the summary. plan-pending: your plan was not approved within the wait.' },
    summary: { type: 'string', description: 'what happened, at most 2000 characters; the long report goes to the file named in report' },
    commits: { ...STRING_LIST, description: 'the commits you made on your branch for this attempt, full or short hexadecimal ids' },
    files: { ...STRING_LIST, description: 'the files you changed, repository-relative paths' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, exit: { type: 'number' } }, required: ['command', 'exit'] }, description: 'the checks you ran and their exit codes; the harness runs its own' },
    questions: { ...STRING_LIST, description: 'what you leave for the main agent to decide' },
    assumptions: { ...STRING_LIST, description: 'the assumptions you used, including those ask_main timed out on' },
    lessons: { type: 'array', items: HANDBACK_LESSON, description: 'pitfalls met and their fixes, for the lessons board' },
    report: { type: 'string', description: 'path of the long report you wrote under .hourness/ in your worktree' },
  },
  required: ['status', 'summary', 'commits', 'files', 'checks', 'questions', 'assumptions', 'lessons'],
  additionalProperties: false,
}

const REVIEW_FINDING: SchemaNode = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'a short id for the finding' },
    blocking: { type: 'boolean', description: 'true only when it hangs on one of the three blocking criteria' },
    criterion: { type: 'string', description: 'acceptance:<i>, irreversible-loss, failure-plan (and direction:<i> for a design review)' },
    where: { type: 'string', description: 'the file, command or item the finding is about' },
    what: { type: 'string', description: 'what is wrong' },
    fix: { type: 'string', description: 'what to change' },
  },
  required: ['id', 'blocking', 'criterion', 'where', 'what', 'fix'],
  additionalProperties: false,
}

/** `hourness-review-v1` (§3.6.1): what a reviewer submits; `checked` lists every acceptance item with its evidence. */
export const REVIEW_SCHEMA: SchemaNode = {
  type: 'object',
  description: 'The verdict of a review. checked must cover every item the task asks you to check, each with the evidence you looked at.',
  properties: {
    verdict: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED'], description: 'CHANGES_REQUESTED only when a blocking finding stands' },
    commit: { type: 'string', description: 'the commit you reviewed' },
    findings: { type: 'array', items: REVIEW_FINDING, description: 'blocking: it hangs on one of the three criteria. everything else is not blocking' },
    checked: { ...STRING_LIST, description: 'one entry per item you checked, with the evidence' },
    lessons: { type: 'array', items: HANDBACK_LESSON, description: 'pitfalls met while reviewing, for the lessons board' },
  },
  required: ['verdict', 'commit', 'findings', 'checked', 'lessons'],
  additionalProperties: false,
}

/** The core fields a merged schema must keep, in the built-in's order. */
const CORE_PROPERTIES = HANDBACK_SCHEMA.properties
const CORE_REQUIRED = HANDBACK_SCHEMA.required ?? []

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The task's own output schema merged with the handback core (§3.6.1): the
 * property schemas are the union (`required` likewise), and a name both
 * declare keeps the built-in's schema, because the handback processing reads
 * the built-in shape. `undefined` when the file's schema is not an object
 * schema in the rc.3 subset — the dispatch reports `bad_schema` and the task
 * keeps the built-in schema alone. The merged schema is fresh JSON, never the
 * caller's object.
 */
export function mergeHandbackSchema(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema) || schema.type !== 'object' || !isRecord(schema.properties)) return undefined
  const extra = schema.additionalProperties
  if (extra !== undefined && typeof extra !== 'boolean') return undefined
  const declared = schema.properties
  for (const value of Object.values(declared)) if (value !== null && (typeof value !== 'object' || Array.isArray(value))) return undefined
  const required = schema.required
  if (required !== undefined && (!Array.isArray(required) || required.some(entry => typeof entry !== 'string' || !(entry in declared)))) return undefined
  const properties: Record<string, SchemaNode> = { ...CORE_PROPERTIES }
  for (const [name, node] of Object.entries(declared)) if (!(name in properties)) properties[name] = node as SchemaNode
  const names = new Set([...CORE_REQUIRED, ...(required as readonly string[])])
  return {
    type: 'object',
    ...(typeof schema.description === 'string' ? { description: schema.description } : {}),
    properties,
    required: [...names],
    ...(extra === undefined ? {} : { additionalProperties: extra }),
  }
}

// ---- semantic checks ----

function lessonProblems(lessons: unknown, problems: readonly string[]): readonly string[] {
  if (!Array.isArray(lessons)) return problems
  const next = [...problems]
  lessons.forEach((entry, index) => {
    if (!isRecord(entry)) {
      next.push(`lesson ${index}: not an object`)
      return
    }
    const errors = entry.errors
    if (errors !== undefined && (!Array.isArray(errors) || errors.length > 5 || errors.some(error => typeof error !== 'string' || error.length < 8 || error.length > 300))) {
      next.push(`lesson ${index}: errors must be at most 5 fragments of 8-300 characters`)
    }
    const scope = entry.scope
    if (scope !== undefined && scope !== 'project' && scope !== 'all') next.push(`lesson ${index}: scope must be project or all`)
  })
  return next
}

/**
 * The shape half of the handback's semantic check (§3.6.2 step 2), on a value
 * that already passed the schema: every commit id is hexadecimal of 7-40
 * digits, every file and the report path are repository-relative, the report
 * sits under `.hourness/`, and the lessons' optional `errors` and `scope` are
 * in range (M5 §8.1). One line per problem; empty when the handback is sound.
 */
export function handbackProblems(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['the handback is not an object']
  const problems: string[] = []
  const commits = value.commits
  if (!Array.isArray(commits)) problems.push('commits is not a list')
  else commits.forEach((commit, index) => { if (!isCommitish(commit)) problems.push(`commits[${index}] is not a hexadecimal commit id`) })
  const files = value.files
  if (!Array.isArray(files)) problems.push('files is not a list')
  else files.forEach((file, index) => { if (!isRepoRelative(file)) problems.push(`files[${index}] is not a repository-relative path`) })
  const report = value.report
  if (report !== undefined && (typeof report !== 'string' || !isRepoRelative(report) || !report.startsWith('.hourness/'))) {
    problems.push('report must be a .hourness/ path inside the worktree')
  }
  return lessonProblems(value.lessons, problems)
}

/**
 * The shape half of the review's semantic check: the reviewed commit is
 * hexadecimal of 7-40 digits and `checked` is a list of strings. The
 * criterion rules are `normalizeVerdict`'s (src/execute/review.ts), which
 * knows the reviewed node's acceptance.
 */
export function reviewProblems(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['the review is not an object']
  const problems: string[] = []
  if (!isCommitish(value.commit)) problems.push('commit is not a hexadecimal commit id')
  if (!Array.isArray(value.checked) || value.checked.some(entry => typeof entry !== 'string')) problems.push('checked is not a list of strings')
  return problems
}
