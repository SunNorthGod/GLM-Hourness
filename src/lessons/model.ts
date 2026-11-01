/**
 * The lessons model (M5 design §4.1, §4.2, §5.2, §7.5): a lesson is advice
 * from earlier work, "in this situation this goes wrong, do this instead".
 * Workers hand lessons back as candidates; the main agent merges a
 * candidate into a lesson, drops it, or writes a lesson itself. Only the
 * person deletes a lesson.
 *
 * Pure functions: no clock (a time is the `at` of the record being folded,
 * or a parameter), no random source of its own, no files, no Node built-ins,
 * so the lessons page can share the types. All lessons belong to the
 * project and live in `<project>/.llm/lessons.jsonl` (`d-memory-scope`).
 *
 * One rule table serves the fold and the writers: `judgeRecord` says what a
 * record does to a state or why it does not hold, with the code a tool
 * reports (`stale`, `not_found`, `duplicate`, `user_only`, `invalid`);
 * `applyRecord`, which the journal folds with, is `judgeRecord` with the
 * refusal turned into a bad line. A writer that plans a record asks the same
 * function, so a write the tool accepts is never a bad line afterwards.
 */
import { checkRefs, groupKeysOf, parseRef } from '../data/evidence.ts'
import type { Actor, Fold, FoldStep, JournalRecord, NewRecord } from '../data/journal.ts'
import { invalid, isObject, isRefusal, listOf, refuse, type Refusal as BaseRefusal } from '../data/refusal.ts'
import { findSecret } from '../data/secret-shape.ts'
import { jaccard, wordsOf } from '../data/words.ts'

export interface Situation {
  /** At most 20: repo-relative paths or globs (`*`, `**`, `?`), forward slashes. */
  readonly files: readonly string[]
  /** At most 10: tool names as DSH native names (`pwsh`, not the GLM alias `Bash`). */
  readonly tools: readonly string[]
  /** At most 10: a command name or the start of a command, `Get-Content`, `npm run probe`. */
  readonly commands: readonly string[]
  /** At most 5 pieces of an error message, 8 to 300 characters each. */
  readonly errors: readonly string[]
}

interface LessonOrigin {
  readonly actor: Actor
  readonly session?: string
  readonly agent?: string
  readonly relay?: string
}

export interface Lesson {
  /** `L-` and six lower-case hex digits. */
  readonly id: string
  /** `retired`: put away by an agent, kept; `deleted`: the person's decision, kept as a tombstone. */
  readonly status: 'active' | 'retired' | 'deleted'
  readonly situation: Situation
  /** What goes wrong: one line, 1 to 300 characters. */
  readonly pitfall: string
  /** What to do instead: 1 to 600 characters. */
  readonly fix: string
  /** 1 to 8 items in the forms of §5.7. */
  readonly evidence: readonly string[]
  readonly created: string
  readonly lastConfirmed: string
  readonly confirmations: number
  readonly origin: LessonOrigin
  /** The candidates merged into this lesson. */
  readonly mergedFrom: readonly string[]
  /** Keys of the learning groups (§3.6) this lesson settled, at most five. */
  readonly learnedFrom?: readonly string[]
  /** When the person deleted it; set while `status` is `deleted`. */
  readonly deletedAt?: string
}

export interface Candidate {
  /** `C-` and six lower-case hex digits. */
  readonly id: string
  readonly situation: Situation
  readonly pitfall: string
  readonly fix: string
  /** Composed by the harness from the handback's context (`candidateEvidence`). */
  readonly evidence: readonly string[]
  readonly at: string
  readonly status: 'open' | 'merged' | 'dropped' | 'expired'
  readonly signature: string
  /** Set when the candidate was dropped for matching a lesson the person deleted: only the person brings it back. */
  readonly deletedMatch?: string
}

/** A session in which a lesson matched a failure (`hit`) or took a candidate in (`into`). */
export interface Touch {
  readonly at: string
  readonly session: string
  readonly kind: 'hit' | 'into'
}

/** What became of a `[候选经验]` annotation of the graph: one `import` record per annotation, so each is tried once. */
type ImportOutcome =
  | { readonly candidate: string }
  | { readonly rejected: 'invalid' | 'secret_like' }
  | { readonly duplicateOf: string }

export interface LessonsState {
  /** Every lesson by id, deleted ones included. */
  readonly lessons: ReadonlyMap<string, Lesson>
  /** Every candidate by id, closed ones included. */
  readonly candidates: ReadonlyMap<string, Candidate>
  /** Annotation key (`<node>@<time>`) to what became of it. */
  readonly imports: ReadonlyMap<string, ImportOutcome>
  /** Per lesson, the sessions it touched, oldest first. */
  readonly touches: ReadonlyMap<string, readonly Touch[]>
  /** Per lesson, the times a recurrence reminder was recorded for it. */
  readonly recurrences: ReadonlyMap<string, readonly string[]>
}

export const emptyLessons = (): LessonsState => ({ lessons: new Map(), candidates: new Map(), imports: new Map(), touches: new Map(), recurrences: new Map() })

export const activeLessons = (state: LessonsState): Lesson[] => [...state.lessons.values()].filter(lesson => lesson.status === 'active')
export const openCandidates = (state: LessonsState): Candidate[] => [...state.candidates.values()].filter(candidate => candidate.status === 'open')

/** What a refused write says (src/data/refusal.ts), with the codes of a lessons write. */
export type Refusal = BaseRefusal<'invalid' | 'secret_like' | 'duplicate' | 'stale' | 'not_found' | 'user_only'>

// --- Text normalisation, signature, similarity -----------------------------

/** Lower case, white space folded to single spaces, no space at either end. */
export const normalizeText = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim()

const EDGE_PUNCTUATION = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu
const signatureText = (text: string): string => normalizeText(text).replace(EDGE_PUNCTUATION, '')

/**
 * What makes two lessons the same one: the error fragments when there are
 * any (normalised, sorted), else the start of the pitfall and the commands.
 * Judges "exactly the same", not "alike" (`similar`).
 */
export function signature(situation: Situation, pitfall: string): string {
  if (situation.errors.length > 0) return situation.errors.map(signatureText).sort().join('\n')
  return `${signatureText(pitfall).slice(0, 80)}|${situation.commands.map(normalizeText).sort().join('\n')}`
}

const SIMILAR_AT = 0.5

/** Whether two lessons or candidates are about the same thing: the words of pitfall and fix overlap by half, or an error fragment is shared, or a file and a command both are. */
export function similar(a: Pick<Lesson, 'situation' | 'pitfall' | 'fix'>, b: Pick<Lesson, 'situation' | 'pitfall' | 'fix'>): boolean {
  if (jaccard(wordsOf(`${a.pitfall} ${a.fix}`), wordsOf(`${b.pitfall} ${b.fix}`)) >= SIMILAR_AT) return true
  const fragments = new Set(a.situation.errors.map(signatureText))
  if (b.situation.errors.some(fragment => fragments.has(signatureText(fragment)))) return true
  const files = new Set(a.situation.files.map(file => file.toLowerCase()))
  const commands = new Set(a.situation.commands.map(normalizeText))
  return b.situation.files.some(file => files.has(file.toLowerCase())) && b.situation.commands.some(command => commands.has(normalizeText(command)))
}

// --- Checking a write -------------------------------------------------------

const SITUATION_LIMITS = { files: 20, tools: 10, commands: 10, errors: 5 } as const
const MAX_PITFALL = 300
const MAX_FIX = 600
const MAX_EVIDENCE = 8
const MAX_LEARNED = 5
/** The length of an error fragment as it is written; matching counts it again after the colour codes are read away (src/lessons/match.ts). */
export const ERROR_LENGTH = { min: 8, max: 300 } as const
const MAX_PATTERN = 200
const MAX_COMMAND = 100
const TOOL_NAME = /^[A-Za-z0-9_.:-]{1,64}$/

type Category = keyof Situation

/** A file pattern as it is stored: forward slashes, no leading `./`; or why it is not a repo-relative pattern. */
function filePattern(item: string): string | undefined {
  const pattern = item.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  const usable = pattern !== '' && pattern.length <= MAX_PATTERN && !/[\r\n]/.test(pattern) && !/^(?:\/|[A-Za-z]:)/.test(pattern) && !pattern.split('/').includes('..')
  return usable ? pattern : undefined
}

const CATEGORY_RULES: Readonly<Record<Category, { readonly rule: string, readonly normalise: (item: string) => string | undefined }>> = {
  files: { rule: `a repo-relative path or glob, at most ${MAX_PATTERN} characters`, normalise: filePattern },
  tools: { rule: 'a tool name of letters, digits and _ . : -', normalise: item => TOOL_NAME.test(item.trim()) ? item.trim() : undefined },
  commands: {
    rule: `one line of at most ${MAX_COMMAND} characters`,
    normalise: (item) => {
      const command = item.trim().replace(/[ \t]+/g, ' ')
      return command === '' || command.length > MAX_COMMAND || /[\r\n]/.test(command) ? undefined : command
    },
  },
  errors: {
    rule: `one line of ${ERROR_LENGTH.min} to ${ERROR_LENGTH.max} characters`,
    normalise: (item) => {
      const fragment = item.trim()
      return fragment.length < ERROR_LENGTH.min || fragment.length > ERROR_LENGTH.max || /[\r\n]/.test(fragment) ? undefined : fragment
    },
  },
}

function categoryOf(raw: unknown, category: Category): Refusal | string[] {
  const field = `situation.${category}`
  if (raw === undefined) return []
  const list = listOf(raw)
  if (list === undefined || list.length > SITUATION_LIMITS[category]) return invalid(field, `${field} must be a list of at most ${SITUATION_LIMITS[category]} items`)
  const { rule, normalise } = CATEGORY_RULES[category]
  const items: string[] = []
  for (const [index, item] of list.entries()) {
    const stored = typeof item === 'string' ? normalise(item) : undefined
    if (stored === undefined) return invalid(field, `${field}[${index}] must be ${rule}`)
    if (!items.includes(stored)) items.push(stored)
  }
  return items
}

/** The situation of a write: each list optional, items normalised and without repeats, at least one item somewhere. */
export function checkSituation(raw: unknown): Refusal | Situation {
  if (!isObject(raw)) return invalid('situation', 'situation must be an object with files, tools, commands and errors')
  const extra = Object.keys(raw).find(key => !Object.hasOwn(SITUATION_LIMITS, key))
  if (extra !== undefined) return invalid(`situation.${extra}`, `unknown field situation.${extra}`)
  const files = categoryOf(raw.files, 'files')
  if (!Array.isArray(files)) return files
  const tools = categoryOf(raw.tools, 'tools')
  if (!Array.isArray(tools)) return tools
  const commands = categoryOf(raw.commands, 'commands')
  if (!Array.isArray(commands)) return commands
  const errors = categoryOf(raw.errors, 'errors')
  if (!Array.isArray(errors)) return errors
  if (files.length + tools.length + commands.length + errors.length === 0) {
    return invalid('situation', 'situation needs at least one of files, tools, commands, errors')
  }
  return { files, tools, commands, errors }
}

/** What both a lesson and a candidate carry. */
export interface CandidateFields {
  readonly situation: Situation
  readonly pitfall: string
  readonly fix: string
}

export interface LessonFields extends CandidateFields {
  readonly evidence: readonly string[]
  readonly learnedFrom?: readonly string[]
}

function textField(name: 'pitfall' | 'fix', raw: unknown): Refusal | string {
  const max = name === 'pitfall' ? MAX_PITFALL : MAX_FIX
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '' || text.length > max || (name === 'pitfall' && /[\r\n]/.test(text))) {
    return invalid(name, `${name} must be ${name === 'pitfall' ? 'one line of ' : ''}1 to ${max} characters`)
  }
  return text
}

function candidateFieldsOf(raw: Readonly<Record<string, unknown>>): Refusal | CandidateFields {
  const pitfall = textField('pitfall', raw.pitfall)
  if (typeof pitfall === 'object') return pitfall
  const fix = textField('fix', raw.fix)
  if (typeof fix === 'object') return fix
  const situation = checkSituation(raw.situation)
  return isRefusal(situation) ? situation : { situation, pitfall, fix }
}

/** The evidence of a lesson or candidate: 1 to 8 items in the forms of §5.7, each one's form checked, repeats dropped. */
function evidenceOf(raw: unknown): Refusal | string[] {
  const list = raw === undefined ? [] : listOf(raw)
  if (list === undefined || list.length < 1 || list.length > MAX_EVIDENCE) return invalid('evidence', `evidence must be a list of 1 to ${MAX_EVIDENCE} items`)
  const items: string[] = []
  for (const [index, item] of list.entries()) {
    const parsed = typeof item === 'string' ? parseRef(item) : { invalid: 'each item must be text' }
    if ('invalid' in parsed) return invalid('evidence', `evidence[${index}]: ${parsed.invalid}`)
    if (!items.includes(parsed.text)) items.push(parsed.text)
  }
  return items
}

/** The structural rules of a lesson, the same for a tool call and for a record read from a journal. */
function lessonFieldsOf(raw: Readonly<Record<string, unknown>>, evidence: unknown): Refusal | LessonFields {
  const core = candidateFieldsOf(raw)
  if (isRefusal(core)) return core
  const items = evidenceOf(evidence)
  if (!Array.isArray(items)) return items
  const keys = groupKeysOf(raw.learnedFrom, MAX_LEARNED)
  if (keys !== undefined && !Array.isArray(keys)) return keys
  return { ...core, evidence: items, ...(keys === undefined ? {} : { learnedFrom: keys }) }
}

function secretInCore(fields: CandidateFields): Refusal | undefined {
  const texts: ReadonlyArray<readonly [string, string]> = [
    ['pitfall', fields.pitfall],
    ['fix', fields.fix],
    ...(Object.keys(SITUATION_LIMITS) as Category[]).flatMap(category => fields.situation[category].map(item => [`situation.${category}`, item] as const)),
  ]
  for (const [field, text] of texts) {
    const found = findSecret(text)
    if (found !== undefined) return refuse('secret_like', found.message, field)
  }
  return undefined
}

function secretInEvidence(evidence: readonly string[]): Refusal | undefined {
  const checked = checkRefs(evidence, 'evidence')
  return checked.ok ? undefined : refuse(checked.code, `evidence[${checked.index}]: ${checked.message}`, 'evidence')
}

/** A candidate's fields as a handback gives them (`pitfall`, `fix`, `situation`): the structural rules, then the secret check. */
export function checkCandidateFields(raw: Readonly<Record<string, unknown>>): Refusal | CandidateFields {
  const fields = candidateFieldsOf(raw)
  return isRefusal(fields) ? fields : secretInCore(fields) ?? fields
}

/** The fields of a lesson a caller writes (`pitfall`, `fix`, `situation`, `evidence`, `learnedFrom`): the structural rules, then the secret check of every text and of the evidence. */
export function checkLessonFields(raw: Readonly<Record<string, unknown>>): Refusal | LessonFields {
  const fields = lessonFieldsOf(raw, raw.evidence)
  return isRefusal(fields) ? fields : secretInCore(fields) ?? secretInEvidence(fields.evidence) ?? fields
}

// --- Who may do what ---------------------------------------------------------

/** The writer of a record, as far as the right to delete or restore depends on it. */
interface Who {
  readonly actor: Actor
  readonly relay?: string
}

const USER_ONLY: Readonly<Record<'delete' | 'restore' | 'reopen', { readonly message: string, readonly hint: string }>> = {
  delete: { message: 'only the user deletes a lesson', hint: 'only the user deletes a lesson: quote their words in relay' },
  restore: { message: 'only the user restores a lesson', hint: 'only the user restores a lesson: quote their words in relay' },
  reopen: { message: 'this lesson or candidate was deleted by the user', hint: 'the user restores it: quote their words in relay and use action restore' },
}

/** Only the person deletes or restores a lesson: a human writer, or an agent that quotes the person's words. */
export function userOnly(op: 'delete' | 'restore' | 'reopen', who: Who): Refusal | undefined {
  if (who.actor === 'human' || (who.relay !== undefined && who.relay.trim() !== '')) return undefined
  const { message, hint } = USER_ONLY[op]
  return refuse('user_only', message, undefined, hint)
}

/** The operations a lessons journal knows and who may write each (design §7.5). */
const WRITERS: ReadonlyMap<string, readonly Actor[]> = new Map([
  ['propose', ['harness']],
  ['import', ['harness']],
  ['new', ['human', 'llm']],
  ['into', ['harness', 'human', 'llm']],
  ['revise', ['human', 'llm']],
  ['confirm', ['human', 'llm']],
  ['retire', ['human', 'llm']],
  ['drop', ['harness', 'human', 'llm']],
  ['expire', ['harness']],
  ['reopen', ['human', 'llm']],
  ['delete', ['human', 'llm']],
  ['restore', ['human', 'llm']],
  ['hit', ['harness']],
  ['recur-notified', ['harness']],
])

// --- Folding -----------------------------------------------------------------

type Step = { readonly state: LessonsState } | Refusal

export const CANDIDATE_ID = /^C-[0-9a-f]{6}$/
export const LESSON_ID = /^L-[0-9a-f]{6}$/
const ANNOTATION_KEY = /^[^\s@]{1,100}@\S{1,100}$/

const withLesson = (state: LessonsState, lesson: Lesson): LessonsState => ({ ...state, lessons: new Map(state.lessons).set(lesson.id, lesson) })
const withCandidate = (state: LessonsState, candidate: Candidate): LessonsState => ({ ...state, candidates: new Map(state.candidates).set(candidate.id, candidate) })

const originOf = (record: JournalRecord): LessonOrigin => ({
  actor: record.actor,
  ...(record.by?.session === undefined ? {} : { session: record.by.session }),
  ...(record.by?.agent === undefined ? {} : { agent: record.by.agent }),
  ...(record.relay === undefined ? {} : { relay: record.relay }),
})

/** The session a record happened in, counted when the lesson matched or took a candidate in. */
function touched(state: LessonsState, lessonId: string, record: JournalRecord, kind: Touch['kind']): LessonsState {
  const session = record.by?.session
  if (session === undefined) return state
  return { ...state, touches: new Map(state.touches).set(lessonId, [...(state.touches.get(lessonId) ?? []), { at: record.at, session, kind }]) }
}

/** The `data` of a record as an object with only the fields in `allowed`; a record without `data` gives an empty object when `optional`. */
function dataOf(record: JournalRecord, allowed: readonly string[], optional = false): Refusal | Record<string, unknown> {
  if (record.data === undefined && optional) return {}
  if (!isObject(record.data)) return invalid('data', 'data is not an object')
  const extra = Object.keys(record.data).find(key => !allowed.includes(key))
  return extra === undefined ? record.data : invalid(`data.${extra}`, `unknown field data.${extra}`)
}

function candidateNamed(state: LessonsState, id: unknown, need: Candidate['status'][] | undefined): Refusal | Candidate {
  const candidate = typeof id === 'string' ? state.candidates.get(id) : undefined
  if (candidate === undefined) return refuse('not_found', `no candidate ${String(id)}`, 'candidate')
  return need === undefined || need.includes(candidate.status) ? candidate : refuse('stale', `candidate ${candidate.id} is ${candidate.status}, not open`, 'candidate')
}

function lessonNamed(state: LessonsState, id: string, need: Lesson['status'][]): Refusal | Lesson {
  const lesson = state.lessons.get(id)
  if (lesson === undefined || (lesson.status === 'deleted' && !need.includes('deleted'))) return refuse('not_found', `no lesson ${id}`, 'lesson')
  return need.includes(lesson.status) ? lesson : refuse('stale', `lesson ${id} is ${lesson.status}`, 'lesson')
}

function applyPropose(state: LessonsState, record: JournalRecord): Step {
  if (!CANDIDATE_ID.test(record.id)) return invalid('id', 'the id of a candidate is C- and six lower-case hex digits')
  if (state.candidates.has(record.id)) return refuse('duplicate', `candidate ${record.id} exists`, 'id')
  const data = dataOf(record, ['situation', 'pitfall', 'fix'])
  if (isRefusal(data)) return data
  const fields = candidateFieldsOf(data)
  if (isRefusal(fields)) return fields
  const evidence = evidenceOf(record.evidence)
  if (!Array.isArray(evidence)) return evidence
  return { state: withCandidate(state, { id: record.id, ...fields, evidence, at: record.at, status: 'open', signature: signature(fields.situation, fields.pitfall) }) }
}

function applyImport(state: LessonsState, record: JournalRecord): Step {
  if (!ANNOTATION_KEY.test(record.id)) return invalid('id', 'the id of an import is <node id>@<time of the annotation>')
  if (state.imports.has(record.id)) return refuse('duplicate', `annotation ${record.id} was imported already`, 'id')
  const data = dataOf(record, ['candidate', 'rejected', 'duplicateOf'])
  if (isRefusal(data)) return data
  const keys = Object.keys(data)
  const [key] = keys
  if (keys.length !== 1 || key === undefined) return invalid('data', 'data holds one of candidate, rejected, duplicateOf')
  const value = data[key]
  if (key === 'rejected') {
    if (value !== 'invalid' && value !== 'secret_like') return invalid('data.rejected', 'rejected is invalid or secret_like')
    return { state: { ...state, imports: new Map(state.imports).set(record.id, { rejected: value }) } }
  }
  const candidate = candidateNamed(state, value, undefined)
  if (isRefusal(candidate)) return candidate
  const outcome: ImportOutcome = key === 'candidate' ? { candidate: candidate.id } : { duplicateOf: candidate.id }
  return { state: { ...state, imports: new Map(state.imports).set(record.id, outcome) } }
}

/** The first lesson in this status that has this signature, if any. */
const withSignature = (state: LessonsState, wanted: string, status: Lesson['status']): Lesson | undefined =>
  [...state.lessons.values()].find(lesson => lesson.status === status && signature(lesson.situation, lesson.pitfall) === wanted)

function applyNew(state: LessonsState, record: JournalRecord): Step {
  if (!LESSON_ID.test(record.id)) return invalid('id', 'the id of a lesson is L- and six lower-case hex digits')
  if (state.lessons.has(record.id)) return refuse('duplicate', `lesson ${record.id} exists`, 'id')
  const data = dataOf(record, ['situation', 'pitfall', 'fix', 'learnedFrom', 'candidate'])
  if (isRefusal(data)) return data
  const fields = lessonFieldsOf(data, record.evidence)
  if (isRefusal(fields)) return fields
  const candidate = data.candidate === undefined ? undefined : candidateNamed(state, data.candidate, ['open'])
  if (candidate !== undefined && isRefusal(candidate)) return candidate
  const same = withSignature(state, signature(fields.situation, fields.pitfall), 'active')
  if (same !== undefined) return refuse('duplicate', `lesson ${same.id} has the same signature`, undefined, `use action into with lesson ${same.id}`)
  const lesson: Lesson = {
    id: record.id,
    status: 'active',
    ...fields,
    created: record.at,
    lastConfirmed: record.at,
    confirmations: 1,
    origin: originOf(record),
    mergedFrom: candidate === undefined ? [] : [candidate.id],
  }
  const next = withLesson(state, lesson)
  return { state: candidate === undefined ? next : withCandidate(next, { ...candidate, status: 'merged' }) }
}

const union = (a: readonly string[], b: readonly string[], cap: number): string[] => [...new Set([...a, ...b])].slice(0, cap)

/** The evidence of a lesson after more came in: at most eight; past that the earliest three and the newest five stay. */
function capEvidence(items: readonly string[]): string[] {
  return items.length <= MAX_EVIDENCE ? [...items] : [...items.slice(0, 3), ...items.slice(-5)]
}

function applyInto(state: LessonsState, record: JournalRecord): Step {
  const data = dataOf(record, ['candidate'])
  if (isRefusal(data)) return data
  const candidate = candidateNamed(state, data.candidate, ['open'])
  if (isRefusal(candidate)) return candidate
  const lesson = lessonNamed(state, record.id, ['active'])
  if (isRefusal(lesson)) return lesson
  const merged: Lesson = {
    ...lesson,
    situation: {
      files: union(lesson.situation.files, candidate.situation.files, SITUATION_LIMITS.files),
      tools: union(lesson.situation.tools, candidate.situation.tools, SITUATION_LIMITS.tools),
      commands: union(lesson.situation.commands, candidate.situation.commands, SITUATION_LIMITS.commands),
      errors: union(lesson.situation.errors, candidate.situation.errors, SITUATION_LIMITS.errors),
    },
    evidence: capEvidence([...lesson.evidence, ...candidate.evidence.filter(item => !lesson.evidence.includes(item))]),
    confirmations: lesson.confirmations + 1,
    lastConfirmed: record.at,
    mergedFrom: [...lesson.mergedFrom, candidate.id],
  }
  return { state: touched(withCandidate(withLesson(state, merged), { ...candidate, status: 'merged' }), lesson.id, record, 'into') }
}

/** A revise changes the fields it names; `evidence`, when the record has it, replaces the old list; new group keys join the old ones (five at most). */
function applyRevise(state: LessonsState, record: JournalRecord): Step {
  const data = dataOf(record, ['pitfall', 'fix', 'situation', 'learnedFrom'], true)
  if (isRefusal(data)) return data
  if (Object.keys(data).length === 0 && record.evidence === undefined) return invalid('data', 'a revise changes at least one of pitfall, fix, situation, learnedFrom, evidence')
  const lesson = lessonNamed(state, record.id, ['active', 'retired'])
  if (isRefusal(lesson)) return lesson
  const pitfall = data.pitfall === undefined ? lesson.pitfall : textField('pitfall', data.pitfall)
  if (typeof pitfall === 'object') return pitfall
  const fix = data.fix === undefined ? lesson.fix : textField('fix', data.fix)
  if (typeof fix === 'object') return fix
  const situation = data.situation === undefined ? lesson.situation : checkSituation(data.situation)
  if (isRefusal(situation)) return situation
  const replaced = record.evidence === undefined ? undefined : evidenceOf(record.evidence)
  if (replaced !== undefined && !Array.isArray(replaced)) return replaced
  const keys = groupKeysOf(data.learnedFrom, MAX_LEARNED)
  if (keys !== undefined && !Array.isArray(keys)) return keys
  const learnedFrom = union(lesson.learnedFrom ?? [], keys ?? [], MAX_LEARNED)
  return { state: withLesson(state, { ...lesson, pitfall, fix, situation, evidence: replaced ?? lesson.evidence, ...(learnedFrom.length === 0 ? {} : { learnedFrom }) }) }
}

function applyConfirm(state: LessonsState, record: JournalRecord): Step {
  const lesson = lessonNamed(state, record.id, ['active', 'retired'])
  if (isRefusal(lesson)) return lesson
  const evidence = evidenceOf(record.evidence)
  if (!Array.isArray(evidence)) return evidence
  return {
    state: withLesson(state, {
      ...lesson,
      evidence: capEvidence([...lesson.evidence, ...evidence.filter(item => !lesson.evidence.includes(item))]),
      confirmations: lesson.confirmations + 1,
      lastConfirmed: record.at,
    }),
  }
}

function applyRetire(state: LessonsState, record: JournalRecord): Step {
  const lesson = lessonNamed(state, record.id, ['active'])
  return isRefusal(lesson) ? lesson : { state: withLesson(state, { ...lesson, status: 'retired' }) }
}

function applyClose(state: LessonsState, record: JournalRecord, to: 'dropped' | 'expired'): Step {
  const candidate = candidateNamed(state, record.id, ['open'])
  if (isRefusal(candidate)) return candidate
  const data = dataOf(record, to === 'dropped' ? ['matches'] : [], true)
  if (isRefusal(data)) return data
  if (data.matches === undefined) return { state: withCandidate(state, { ...candidate, status: to }) }
  if (record.actor !== 'harness') return invalid('data.matches', 'only the harness drops a candidate for matching a deleted lesson')
  const lesson = typeof data.matches === 'string' ? state.lessons.get(data.matches) : undefined
  if (lesson?.status !== 'deleted') return invalid('data.matches', 'matches names a lesson the user deleted')
  return { state: withCandidate(state, { ...candidate, status: 'dropped', deletedMatch: lesson.id }) }
}

function applyReopen(state: LessonsState, record: JournalRecord): Step {
  if (CANDIDATE_ID.test(record.id)) {
    const candidate = state.candidates.get(record.id)
    if (candidate === undefined) return refuse('not_found', `no candidate ${record.id}`, 'candidate')
    if (candidate.status !== 'expired' && candidate.status !== 'dropped') return refuse('stale', `candidate ${record.id} is ${candidate.status}`, 'candidate')
    if (candidate.deletedMatch !== undefined) {
      const refusal = userOnly('reopen', record)
      if (refusal !== undefined) return refusal
    }
    const { deletedMatch: _deletedMatch, ...open } = candidate
    // Reopened, a candidate waits for a merge another 30 days: its age counts from now, or it would expire again at once.
    return { state: withCandidate(state, { ...open, status: 'open', at: record.at }) }
  }
  const lesson = state.lessons.get(record.id)
  if (lesson === undefined) return refuse('not_found', `no lesson ${record.id}`, 'lesson')
  if (lesson.status === 'deleted') return refuse('user_only', USER_ONLY.reopen.message, undefined, USER_ONLY.reopen.hint)
  return lesson.status === 'retired' ? { state: withLesson(state, { ...lesson, status: 'active' }) } : refuse('stale', `lesson ${record.id} is active`, 'lesson')
}

function applyDelete(state: LessonsState, record: JournalRecord): Step {
  const refusal = userOnly('delete', record)
  if (refusal !== undefined) return refusal
  const lesson = lessonNamed(state, record.id, ['active', 'retired'])
  return isRefusal(lesson) ? lesson : { state: withLesson(state, { ...lesson, status: 'deleted', deletedAt: record.at }) }
}

function applyRestore(state: LessonsState, record: JournalRecord): Step {
  const refusal = userOnly('restore', record)
  if (refusal !== undefined) return refusal
  const lesson = lessonNamed(state, record.id, ['deleted'])
  if (isRefusal(lesson)) return lesson
  const { deletedAt: _deletedAt, ...kept } = lesson
  return { state: withLesson(state, { ...kept, status: 'active' }) }
}

function applyHit(state: LessonsState, record: JournalRecord): Step {
  if (record.by?.session === undefined) return invalid('by.session', 'a hit names the session it happened in')
  const lesson = state.lessons.get(record.id)
  return lesson === undefined ? refuse('not_found', `no lesson ${record.id}`, 'lesson') : { state: touched(state, lesson.id, record, 'hit') }
}

function applyRecurNotified(state: LessonsState, record: JournalRecord): Step {
  if (!state.lessons.has(record.id)) return refuse('not_found', `no lesson ${record.id}`, 'lesson')
  return { state: { ...state, recurrences: new Map(state.recurrences).set(record.id, [...(state.recurrences.get(record.id) ?? []), record.at]) } }
}

/** What one record does to a state, or the refusal that says why it does not hold. Pure: the time is the record's `at`. */
export function judgeRecord(state: LessonsState, record: JournalRecord): LessonsState | Refusal {
  const writers = WRITERS.get(record.op)
  if (writers === undefined) return invalid('op', `unknown operation ${record.op}`)
  if (!writers.includes(record.actor)) return invalid('actor', `${record.op} records are not written by ${record.actor}`)
  const step = ((): Step => {
    switch (record.op) {
      case 'propose': return applyPropose(state, record)
      case 'import': return applyImport(state, record)
      case 'new': return applyNew(state, record)
      case 'into': return applyInto(state, record)
      case 'revise': return applyRevise(state, record)
      case 'confirm': return applyConfirm(state, record)
      case 'retire': return applyRetire(state, record)
      case 'drop': return applyClose(state, record, 'dropped')
      case 'expire': return applyClose(state, record, 'expired')
      case 'reopen': return applyReopen(state, record)
      case 'delete': return applyDelete(state, record)
      case 'restore': return applyRestore(state, record)
      case 'hit': return applyHit(state, record)
      // The table above admits only these fourteen operations.
      default: return applyRecurNotified(state, record)
    }
  })()
  return 'state' in step ? step.state : step
}

/** One record applied to a state, or why it does not hold. */
export function applyRecord(state: LessonsState, record: JournalRecord): FoldStep<LessonsState> {
  const result = judgeRecord(state, record)
  return 'code' in result ? { bad: `${result.code}: ${result.message}` } : { state: result }
}

/** The fold of a lessons journal. The same object every time: the journal's read cache tells folds apart by identity. */
export const lessonsFold: Fold<LessonsState> = { empty: emptyLessons, apply: applyRecord }

// --- Writing a candidate -------------------------------------------------------

/** What the harness knows about a handback when it proposes a candidate. */
export interface ProposeContext {
  /** The dispatching session, given by the host. */
  readonly session: string
  readonly task?: string
  readonly childId?: string
  readonly commit?: string
}

/**
 * The evidence of a candidate, all of it composed here (§4.1): the task, the
 * worker's session (the dispatching session when the worker's id is not one),
 * the commit as the handback wrote it, a full 40-digit id included. A value
 * that is not in the form of §5.7 is left out and named in `notes`; the
 * candidate is taken all the same.
 */
export function candidateEvidence(context: ProposeContext): { readonly evidence: string[], readonly notes: string[] } {
  const evidence: string[] = []
  const notes: string[] = []
  const add = (kind: 'task' | 'session' | 'commit', value: string | undefined, name: string): void => {
    if (value === undefined) return
    const parsed = parseRef(`${kind}:${value}`)
    if ('invalid' in parsed) notes.push(`ignored ${name}: it is not ${kind === 'commit' ? '7 to 40 hex digits' : `a ${kind} id`}`)
    else evidence.push(parsed.text)
  }
  add('task', context.task, 'context.task')
  const worker = context.childId === undefined ? undefined : parseRef(`session:${context.childId}`)
  if (worker !== undefined && !('invalid' in worker)) evidence.push(worker.text)
  else {
    if (context.childId !== undefined) notes.push('ignored context.childId: it is not a session id; the dispatching session stands for the worker')
    add('session', context.session, 'context.session')
  }
  add('commit', context.commit, 'context.commit')
  return { evidence, notes }
}

export interface Proposal {
  /** The records to append in this order: the `propose`, then the `into` or `drop` that follows from it. */
  readonly records: readonly NewRecord[]
  readonly status: 'candidate' | 'merged' | 'dropped'
  /** The candidate's id: it has a `propose` record in all three cases. */
  readonly id: string
  /** The lesson the candidate was merged into, or the deleted lesson it matches. */
  readonly lesson?: string
}

/**
 * What a proposed candidate becomes (§4.2 step 1): the same signature as an
 * active lesson merges into it, the same signature as a lesson the person
 * deleted is dropped (and counts as a recurrence after the deletion),
 * anything else waits as a candidate. The fields passed `checkCandidateFields`
 * and the evidence is `candidateEvidence`'s.
 */
export function proposeRecords(state: LessonsState, fields: CandidateFields, evidence: readonly string[], by: NewRecord['by'], id: string): Proposal {
  const wanted = signature(fields.situation, fields.pitfall)
  const propose: NewRecord = {
    actor: 'harness',
    ...(by === undefined ? {} : { by }),
    op: 'propose',
    id,
    evidence,
    data: { situation: { files: [...fields.situation.files], tools: [...fields.situation.tools], commands: [...fields.situation.commands], errors: [...fields.situation.errors] }, pitfall: fields.pitfall, fix: fields.fix },
  }
  const active = withSignature(state, wanted, 'active')
  if (active !== undefined) {
    const into: NewRecord = { actor: 'harness', ...(by === undefined ? {} : { by }), op: 'into', id: active.id, reason: `same signature as ${active.id}`, data: { candidate: id } }
    return { records: [propose, into], status: 'merged', id, lesson: active.id }
  }
  const deleted = withSignature(state, wanted, 'deleted')
  if (deleted !== undefined) {
    const date = (deleted.deletedAt ?? '').slice(0, 10)
    const drop: NewRecord = { actor: 'harness', ...(by === undefined ? {} : { by }), op: 'drop', id, reason: `matches ${deleted.id} the user deleted on ${date}`, data: { matches: deleted.id } }
    return { records: [propose, drop], status: 'dropped', id, lesson: deleted.id }
  }
  return { records: [propose], status: 'candidate', id }
}

/** Six random hex digits: an integer from 0 to 0xFFFFFF. */
export type RandomSource = () => number

const ID_TRIES = 5

/** A new `L-` or `C-` id that no lesson or candidate of the journal has; undefined after five tries (the caller answers `io`). */
export function newId(prefix: 'L' | 'C', state: LessonsState, random: RandomSource): string | undefined {
  for (let attempt = 0; attempt < ID_TRIES; attempt += 1) {
    const id = `${prefix}-${(Math.abs(Math.trunc(random())) % 0x1000000).toString(16).padStart(6, '0')}`
    if (!state.lessons.has(id) && !state.candidates.has(id)) return id
  }
  return undefined
}
