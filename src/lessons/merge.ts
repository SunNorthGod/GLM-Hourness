/**
 * `lessons_merge` as a pure request and plan (M5 design §4.2.2): the nine
 * actions the main agent takes on candidates and lessons, the same for the
 * tool, the person's command `/lessons` and the command line. A request is
 * checked for its shape (`checkMerge`); a plan (`planMerge`) turns it into
 * the records to append for the state the writer holds the lock on, and the
 * refusals come from the model's own rules (`judgeRecord` through
 * `foldNew`), so what the tool accepts is never a bad line afterwards.
 *
 * Deleting and restoring a lesson is the person's decision: it takes a human
 * writer, or an agent that quotes the person's words (`relay`); the model
 * says `user_only` otherwise. The agent's own actions need no words.
 */
import type { JsonValue, NewRecord } from '../data/journal.ts'
import { invalid, isObject, isRefusal, refuse, type Refusal as AnyRefusal } from '../data/refusal.ts'
import { secretRefusal } from '../data/secret-shape.ts'
import { activeLessons, CANDIDATE_ID, checkLessonFields, LESSON_ID, newId, similar, type LessonsState, type RandomSource, type Situation } from './model.ts'
import { foldNew } from './storage.ts'

const MERGE_ACTIONS = ['new', 'into', 'revise', 'confirm', 'retire', 'drop', 'reopen', 'delete', 'restore'] as const
export type MergeAction = typeof MERGE_ACTIONS[number]

const CONTENT_FIELDS = ['situation', 'pitfall', 'fix', 'evidence', 'learnedFrom'] as const
/** The fields each action takes besides `action`, `reason` and `relay`. */
const FIELDS: Readonly<Record<MergeAction, readonly string[]>> = {
  new: ['candidate', ...CONTENT_FIELDS],
  into: ['candidate', 'lesson'],
  revise: ['lesson', ...CONTENT_FIELDS],
  confirm: ['lesson', 'evidence'],
  retire: ['lesson'],
  drop: ['candidate'],
  reopen: ['candidate', 'lesson'],
  delete: ['lesson'],
  restore: ['lesson'],
}
const EVERY_FIELD = new Set(['action', 'reason', 'relay', 'candidate', 'lesson', ...CONTENT_FIELDS])
const MAX_REASON = 300
const MAX_RELAY = 500

const isAction = (value: unknown): value is MergeAction => (MERGE_ACTIONS as readonly unknown[]).includes(value)

export interface MergeRequest {
  readonly action: MergeAction
  readonly reason: string
  readonly relay?: string
  readonly candidate?: string
  readonly lesson?: string
  /** The content fields that were given, as given; they are checked against the lesson or candidate they belong to. */
  readonly content: Readonly<Record<string, unknown>>
}

/** What a request or a plan refuses with: the model's codes, plus `io` (no id could be drawn). */
export type MergeRefusal = AnyRefusal

function idField(args: Record<string, unknown>, field: 'candidate' | 'lesson'): AnyRefusal | string | undefined {
  const value = args[field]
  if (value === undefined) return undefined
  const pattern = field === 'candidate' ? CANDIDATE_ID : LESSON_ID
  return typeof value === 'string' && pattern.test(value) ? value : invalid(field, `${field} must be the id of a ${field}: ${field === 'candidate' ? 'C-' : 'L-'} and six lower-case hex digits`)
}

/** The shape of a `lessons_merge` request: known fields only, the ones the action needs, no secrets in the free texts. */
export function checkMerge(args: unknown): MergeRequest | AnyRefusal {
  if (!isObject(args)) return invalid(undefined, 'arguments must be an object')
  const { action, reason, relay } = args
  if (!isAction(action)) return invalid('action', `action must be one of ${MERGE_ACTIONS.join(', ')}`)
  const taken = FIELDS[action]
  for (const key of Object.keys(args)) {
    if (key === 'action' || key === 'reason' || key === 'relay' || taken.includes(key)) continue
    return invalid(key, EVERY_FIELD.has(key) ? `${key} is not used by action ${action}` : `unknown field ${key}`)
  }
  if (typeof reason !== 'string' || reason.trim() === '' || reason.length > MAX_REASON) return invalid('reason', `reason must be 1 to ${MAX_REASON} characters`)
  if (relay !== undefined && (typeof relay !== 'string' || relay.trim() === '' || relay.length > MAX_RELAY)) return invalid('relay', `relay must be the user's own words, 1 to ${MAX_RELAY} characters`)
  const secret = secretRefusal([['reason', reason], ['relay', relay]])
  if (secret !== undefined) return secret
  const candidate = idField(args, 'candidate')
  if (typeof candidate === 'object') return candidate
  const lesson = idField(args, 'lesson')
  if (typeof lesson === 'object') return lesson
  const content = Object.fromEntries(CONTENT_FIELDS.flatMap(field => args[field] === undefined ? [] : [[field, args[field]]]))
  const missing = ((): string | undefined => {
    if (['into', 'drop'].includes(action) && candidate === undefined) return 'candidate'
    if (['into', 'revise', 'confirm', 'retire', 'delete', 'restore'].includes(action) && lesson === undefined) return 'lesson'
    if (action === 'revise' && Object.keys(content).length === 0) return 'situation, pitfall, fix, evidence or learnedFrom'
    if (action === 'confirm' && content.evidence === undefined) return 'evidence'
    return undefined
  })()
  if (missing !== undefined) return invalid(missing.includes(' ') ? undefined : missing, `action ${action} needs ${missing}`)
  if (action === 'reopen' && (candidate === undefined) === (lesson === undefined)) return invalid(undefined, 'action reopen needs a candidate or a lesson, one of them')
  return { action, reason, ...(typeof relay === 'string' ? { relay } : {}), ...(candidate === undefined ? {} : { candidate }), ...(lesson === undefined ? {} : { lesson }), content }
}

/** Who writes: the person at the input box, or an agent; `by` is the host's ids of the call. */
export interface Writer {
  readonly actor: 'human' | 'llm'
  readonly by?: NewRecord['by']
}

export interface MergePlan {
  readonly records: readonly NewRecord[]
  /** What the writer answers with. */
  readonly result: Readonly<Record<string, JsonValue>>
}

const situationData = (situation: Situation): JsonValue => ({ files: [...situation.files], tools: [...situation.tools], commands: [...situation.commands], errors: [...situation.errors] })

/** The records of `request` for the lessons `state` holds, or the refusal; nothing is written here. `at` is the moment the records will carry. */
export function planMerge(state: LessonsState, request: MergeRequest, writer: Writer, at: string, random: RandomSource): MergePlan | AnyRefusal {
  const head = {
    actor: writer.actor,
    ...(writer.by === undefined ? {} : { by: writer.by }),
    ...(request.relay === undefined ? {} : { relay: request.relay }),
    reason: request.reason,
  } as const
  const { action, content } = request
  const lessonId = request.lesson ?? ''
  const candidateId = request.candidate ?? ''
  const lesson = state.lessons.get(lessonId)
  const candidate = state.candidates.get(candidateId)
  if (['revise', 'confirm'].includes(action) && (lesson === undefined || lesson.status === 'deleted')) return refuse('not_found', `no lesson ${lessonId}`, 'lesson')
  if (action === 'new' && request.candidate !== undefined && candidate === undefined) return refuse('not_found', `no candidate ${candidateId}`, 'candidate')
  let newLessonId: string | undefined
  const records = ((): NewRecord[] | AnyRefusal => {
    switch (action) {
      case 'new': {
        const fields = checkLessonFields({ situation: content.situation ?? candidate?.situation, pitfall: content.pitfall ?? candidate?.pitfall, fix: content.fix ?? candidate?.fix, evidence: content.evidence ?? candidate?.evidence, learnedFrom: content.learnedFrom })
        if (isRefusal(fields)) return fields
        newLessonId = newId('L', state, random)
        if (newLessonId === undefined) return refuse('io', 'could not allocate a lesson id')
        const data: JsonValue = { situation: situationData(fields.situation), pitfall: fields.pitfall, fix: fields.fix, ...(fields.learnedFrom === undefined ? {} : { learnedFrom: [...fields.learnedFrom] }), ...(candidate === undefined ? {} : { candidate: candidate.id }) }
        return [{ ...head, op: 'new', id: newLessonId, evidence: fields.evidence, data }]
      }
      case 'into': return [{ ...head, op: 'into', id: lessonId, data: { candidate: candidateId } }]
      case 'revise': {
        const fields = checkLessonFields({ situation: content.situation ?? lesson?.situation, pitfall: content.pitfall ?? lesson?.pitfall, fix: content.fix ?? lesson?.fix, evidence: content.evidence ?? lesson?.evidence, learnedFrom: content.learnedFrom })
        if (isRefusal(fields)) return fields
        const data: JsonValue = {
          ...(content.pitfall === undefined ? {} : { pitfall: fields.pitfall }),
          ...(content.fix === undefined ? {} : { fix: fields.fix }),
          ...(content.situation === undefined ? {} : { situation: situationData(fields.situation) }),
          ...(fields.learnedFrom === undefined ? {} : { learnedFrom: [...fields.learnedFrom] }),
        }
        return [{ ...head, op: 'revise', id: lessonId, ...(content.evidence === undefined ? {} : { evidence: fields.evidence }), data }]
      }
      case 'confirm': {
        const fields = lesson === undefined ? undefined : checkLessonFields({ situation: lesson.situation, pitfall: lesson.pitfall, fix: lesson.fix, evidence: content.evidence })
        if (fields === undefined || isRefusal(fields)) return fields ?? refuse('not_found', `no lesson ${lessonId}`, 'lesson')
        return [{ ...head, op: 'confirm', id: lessonId, evidence: fields.evidence }]
      }
      case 'retire': return [{ ...head, op: 'retire', id: lessonId }]
      case 'drop': return [{ ...head, op: 'drop', id: candidateId }]
      case 'reopen': return [{ ...head, op: 'reopen', id: request.candidate ?? lessonId }]
      case 'delete': return [{ ...head, op: 'delete', id: lessonId, ...(lesson === undefined ? {} : { data: JSON.parse(JSON.stringify(lesson)) as JsonValue }) }]
      default: return [{ ...head, op: 'restore', id: lessonId }]
    }
  })()
  if (!Array.isArray(records)) return records
  const next = foldNew(state, records, at)
  if ('code' in next) return next
  const target = newLessonId ?? request.lesson
  const created = newLessonId === undefined ? undefined : next.lessons.get(newLessonId)
  const twins = created === undefined ? [] : activeLessons(next).filter(other => other.id !== created.id && similar(other, created)).map(other => other.id)
  const status = ((): string | undefined => {
    if (target !== undefined) return next.lessons.get(target)?.status
    return next.candidates.get(candidateId)?.status
  })()
  return {
    records,
    result: {
      action,
      ...(target === undefined ? {} : { lesson: target }),
      ...(request.candidate === undefined ? {} : { candidate: request.candidate }),
      ...(status === undefined ? {} : { status }),
      ...(action === 'into' ? { confirmations: next.lessons.get(lessonId)?.confirmations ?? 0 } : {}),
      ...(twins.length === 0 ? {} : { similar: twins }),
    },
  }
}
