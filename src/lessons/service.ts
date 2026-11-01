/**
 * The service the lessons row provides (`glmHournessLessons`, M5 design §4.2,
 * §4.3, §4.9, §8.1): what the dispatch of work (M7) reads and writes.
 * `relevant` gives the lessons a brief should carry, `propose` takes a
 * candidate a worker handed back, `stats` and `hygiene` feed the weekly report
 * and the inspection. Neither `relevant` nor `propose` ever rejects: a lesson
 * that cannot be had is an empty list, and a candidate that cannot be kept
 * comes back as a result the caller can act on.
 *
 * A candidate has three fates (§4.2 step 1): kept (`candidate`, `merged` into
 * a lesson with the same signature, `dropped` for matching one the person
 * deleted), refused (`rejected`: fields that do not hold, or that look like a
 * secret; nothing is written and nothing of it is kept), or failed (`error`:
 * the service itself could not write, and the caller falls back to a note on
 * the graph).
 */
import { readJournal, type Fold, type JournalRecord } from '../data/journal.ts'
import { invalid, isObject, isRefusal, listOf, refuse, type Refusal as AnyRefusal } from '../data/refusal.ts'
import type { SessionLike } from '../shared/dsh-min.ts'
import { relevant, type RelevantQuery as WantedByBrief } from './match.ts'
import { briefEntry, type BriefEntry } from './render.ts'
import { candidateEvidence, checkCandidateFields, lessonsFold, newId, openCandidates, proposeRecords, similar, type CandidateFields, type LessonsState, type Proposal } from './model.ts'
import { foldNew, journalFile, noteWrite, readLessons, writeLessons, type LessonsEnv } from './storage.ts'

/** The cordis service name the lessons row provides. */
export const LESSONS_SERVICE = 'glmHournessLessons'

/** What a brief asks for: the project of the dispatching session, and what the task has. */
interface RelevantRequest {
  readonly session: SessionLike
  readonly paths: readonly string[]
  /** Aliases or native names; both are turned into native names. */
  readonly tools: readonly string[]
  readonly commands: readonly string[]
  /** 1 to 10, 5 when absent. */
  readonly limit?: number
}

/** A candidate as a worker's handback gives it. */
interface LessonCandidateInput {
  readonly problem: string
  readonly fix: string
  readonly files: readonly string[]
  readonly commands: readonly string[]
  readonly tools: readonly string[]
  /** Pieces of an error message. */
  readonly errors?: readonly string[]
  /** Older handbacks still carry it; lessons belong to the project, so both values are kept in this project. */
  readonly scope?: 'project' | 'all'
}

interface LessonProposeContext {
  readonly session: SessionLike
  readonly task?: string
  readonly childId?: string
  readonly commit?: string
}

type ProposeResult =
  | { readonly status: 'candidate' | 'merged' | 'dropped', readonly id: string, readonly notes?: readonly string[] }
  | { readonly status: 'rejected', readonly code: 'invalid' | 'secret_like', readonly field?: string }
  | { readonly error: 'busy' | 'io' | 'no_project' | 'internal', readonly message: string }

interface LessonStats {
  /** In the period: lessons written, candidates merged into a lesson, candidates dropped, candidates expired, lessons deleted by the person, lessons restored by the person. */
  readonly added: number
  readonly merged: number
  readonly dropped: number
  readonly expired: number
  readonly deleted: number
  readonly restored: number
  /** Candidates dropped in the period because they matched a lesson the person had deleted. */
  readonly recurredAfterDeletion: number
  /** Now: the open candidates and the age in days of the oldest. */
  readonly openCandidates: number
  readonly oldestCandidateDays: number | null
  /** Per lesson, in how many different sessions it matched a failure or took a candidate in during the period. */
  readonly sessions: ReadonlyArray<{ readonly lesson: string, readonly sessions: number }>
  /** Candidates refused since the host started, by code. */
  readonly rejected: Readonly<Record<string, number>>
}

interface HygieneFinding {
  readonly kind: 'bad-lines' | 'unconfirmed' | 'old-candidate' | 'similar' | 'rejected-annotation'
  /** The lesson, candidate or graph node the finding is about. */
  readonly id?: string
  readonly detail: string
}

export interface LessonsService {
  relevant(query: RelevantRequest): Promise<readonly BriefEntry[]>
  propose(candidate: LessonCandidateInput, context: LessonProposeContext): Promise<ProposeResult>
  stats(session: SessionLike | undefined, since: string, until: string): Promise<LessonStats>
  hygiene(session: SessionLike | undefined, now: string): Promise<readonly HygieneFinding[]>
}

const DAY_MS = 86_400_000
const MIN_ERROR = 8
const UNCONFIRMED_DAYS = 180
const OLD_CANDIDATE_DAYS = 7

type Accepted = { readonly fields: CandidateFields, readonly notes: readonly string[] } | { readonly rejected: AnyRefusal<'invalid' | 'secret_like'> }

const textList = (raw: unknown, field: string): string[] | AnyRefusal<'invalid'> => {
  if (raw === undefined) return []
  const list = listOf(raw)
  return list !== undefined && list.every(item => typeof item === 'string') ? list : invalid(field, `${field} must be a list of text`)
}

/**
 * A candidate input as the fields the model checks: the tool names turned
 * into native names, error pieces shorter than eight characters left out
 * (said in the notes), `scope` read and ignored. Anything that does not hold
 * is `rejected`; nothing is written for it.
 */
export function acceptCandidate(input: unknown, native: (tool: string) => string): Accepted {
  const rejected = (refusal: AnyRefusal): Accepted => ({ rejected: refuse(refusal.code === 'secret_like' ? 'secret_like' : 'invalid', refusal.message, refusal.field === 'pitfall' ? 'problem' : refusal.field) })
  if (!isObject(input)) return rejected(invalid(undefined, 'the candidate must be an object'))
  const lists: Record<'files' | 'commands' | 'tools' | 'errors', string[]> = { files: [], commands: [], tools: [], errors: [] }
  for (const field of ['files', 'commands', 'tools', 'errors'] as const) {
    const list = textList(input[field], field)
    if (!Array.isArray(list)) return rejected(list)
    lists[field] = list
  }
  const notes: string[] = []
  const errors = lists.errors.filter(item => item.trim().length >= MIN_ERROR)
  if (errors.length < lists.errors.length) notes.push(`left out ${lists.errors.length - errors.length} error piece(s) shorter than ${MIN_ERROR} characters`)
  const { scope } = input
  if (scope !== undefined && scope !== 'project' && scope !== 'all') return rejected(invalid('scope', 'scope must be "project" or "all"'))
  if (scope === 'all') notes.push('scope "all" is not used: lessons belong to the project, so this one is stored in this project')
  const checked = checkCandidateFields({ pitfall: input.problem, fix: input.fix, situation: { files: lists.files, tools: lists.tools.map(native), commands: lists.commands, errors } })
  return isRefusal(checked) ? rejected(checked) : { fields: checked, notes }
}

const countUp = (counts: Map<string, number>, key: string): void => { counts.set(key, (counts.get(key) ?? 0) + 1) }

type CountKey = 'added' | 'merged' | 'dropped' | 'expired' | 'deleted' | 'restored' | 'recurredAfterDeletion'

/** The counts of the period, kept beside the folded state. */
interface Period {
  readonly lessons: LessonsState
  readonly counts: Readonly<Record<CountKey, number>>
}

const NO_COUNTS: Period['counts'] = { added: 0, merged: 0, dropped: 0, expired: 0, deleted: 0, restored: 0, recurredAfterDeletion: 0 }
const COUNTED: ReadonlyMap<string, CountKey> = new Map([['new', 'added'], ['into', 'merged'], ['drop', 'dropped'], ['expire', 'expired'], ['delete', 'deleted'], ['restore', 'restored']])

/** The lessons fold that also counts what the records inside `[since, until)` did. */
const countingFold = (since: number, until: number): Fold<Period> => ({
  empty: () => ({ lessons: lessonsFold.empty(), counts: NO_COUNTS }),
  apply(state: Period, record: JournalRecord) {
    const step = lessonsFold.apply(state.lessons, record)
    if ('bad' in step) return step
    const at = Date.parse(record.at)
    if (at < since || at >= until) return { state: { lessons: step.state, counts: state.counts } }
    const key = COUNTED.get(record.op)
    const recurred = record.op === 'drop' && isObject(record.data) && typeof record.data.matches === 'string'
    const counts = { ...state.counts }
    if (key !== undefined) counts[key] += 1
    if (recurred) counts.recurredAfterDeletion += 1
    return { state: { lessons: step.state, counts } }
  },
})

/** The service over the row's environment. */
export function lessonsRowService(env: LessonsEnv): LessonsService {
  const failed = (dir: string | undefined, error: 'busy' | 'io' | 'no_project' | 'internal', message: string): ProposeResult => {
    if (dir !== undefined) env.counters.failed.add(dir)
    return { error, message }
  }
  return {
    async relevant(query) {
      const session: SessionLike | undefined = query?.session
      try {
        const dir = env.dirOf(session)
        if (dir === undefined) return []
        const read = await readLessons(dir)
        if (!read.ok) {
          env.note(session?.id, 'read', `经验读不出：${read.reason}`)
          return []
        }
        const strings = (list: readonly unknown[] | undefined): string[] => (listOf(list) ?? []).filter((item): item is string => typeof item === 'string')
        const wanted: WantedByBrief = {
          paths: strings(query.paths),
          tools: strings(query.tools).map(tool => env.native(tool)),
          commands: strings(query.commands),
          ignoreCase: env.ignoreCase,
          ...(typeof query.limit === 'number' ? { limit: query.limit } : {}),
        }
        return relevant(read.reading.state, wanted, env.now().toISOString()).map(({ lesson }) => briefEntry(lesson))
      }
      catch (error) {
        env.note(session?.id, 'read', `经验匹配出错：${error instanceof Error ? error.message : String(error)}`)
        return []
      }
    },

    async propose(candidate, context) {
      const session = context?.session
      let dir: string | undefined
      try {
        const accepted = acceptCandidate(candidate, tool => env.native(tool))
        if ('rejected' in accepted) {
          countUp(env.counters.rejected, accepted.rejected.code)
          return { status: 'rejected', code: accepted.rejected.code, ...(accepted.rejected.field === undefined ? {} : { field: accepted.rejected.field }) }
        }
        dir = env.dirOf(session)
        if (session === undefined || dir === undefined) return failed(dir, 'no_project', 'this session has no project directory, so there is nowhere to keep the candidate')
        const { evidence, notes: evidenceNotes } = candidateEvidence({ session: session.id, ...(context.task === undefined ? {} : { task: context.task }), ...(context.childId === undefined ? {} : { childId: context.childId }), ...(context.commit === undefined ? {} : { commit: context.commit }) })
        const kept: { proposal?: Proposal } = {}
        const written = await writeLessons<string>(dir, (state) => {
          const id = newId('C', state, env.random)
          if (id === undefined) return { refused: 'could not allocate a candidate id' }
          const made = proposeRecords(state, accepted.fields, evidence, { session: session.id, tool: 'propose' }, id)
          const held = foldNew(state, made.records, env.now().toISOString())
          if ('code' in held) return { refused: `the candidate does not hold: ${held.message}` }
          kept.proposal = made
          return { records: made.records }
        }, env.append)
        noteWrite(env, session.id, written)
        if (written.status === 'ok' && kept.proposal !== undefined) {
          const notes = [...accepted.notes, ...evidenceNotes]
          return { status: kept.proposal.status, id: kept.proposal.id, ...(notes.length === 0 ? {} : { notes }) }
        }
        if (written.status === 'busy') return failed(dir, 'busy', written.lockLost ? 'the lessons file\'s lock was taken over before the write' : 'the lessons file is in use by another writer')
        if (written.status === 'io') return failed(dir, 'io', `the candidate could not be written (${written.stage}): ${written.message}`)
        return failed(dir, 'internal', written.status === 'refused' ? written.refused : written.status === 'invalid' ? written.message : 'the candidate was not written')
      }
      catch (error) {
        return failed(dir, 'internal', error instanceof Error ? error.message : String(error))
      }
    },

    async stats(session, since, until) {
      const dir = env.dirOf(session)
      const rejected = Object.fromEntries(env.counters.rejected)
      const empty: LessonStats = { ...NO_COUNTS, openCandidates: 0, oldestCandidateDays: null, sessions: [], rejected }
      if (dir === undefined) return empty
      try {
        const from = Date.parse(since)
        const to = Date.parse(until)
        const { state } = await readJournal(journalFile(dir), countingFold(from, to))
        const open = openCandidates(state.lessons)
        const oldest = open.reduce<number | undefined>((least, item) => Math.min(least ?? Infinity, Date.parse(item.at)), undefined)
        const sessions = [...state.lessons.touches].flatMap(([lesson, touches]) => {
          const inside = new Set(touches.filter(touch => Date.parse(touch.at) >= from && Date.parse(touch.at) < to).map(touch => touch.session))
          return inside.size === 0 ? [] : [{ lesson, sessions: inside.size }]
        })
        return { ...state.counts, openCandidates: open.length, oldestCandidateDays: oldest === undefined ? null : Math.floor((env.now().getTime() - oldest) / DAY_MS), sessions, rejected }
      }
      catch (error) {
        env.note(session?.id, 'read', `经验读不出，统计给了零：${error instanceof Error ? error.message : String(error)}`)
        return empty
      }
    },

    async hygiene(session, now) {
      const dir = env.dirOf(session)
      if (dir === undefined) return []
      const read = await readLessons(dir)
      if (!read.ok) return [{ kind: 'bad-lines', detail: `the lessons journal cannot be read: ${read.reason}` }]
      const { state, bad } = read.reading
      const time = Date.parse(now)
      const findings: HygieneFinding[] = []
      if (bad.length > 0) findings.push({ kind: 'bad-lines', detail: `${bad.length} line(s) of the lessons journal cannot be read` })
      const active = [...state.lessons.values()].filter(lesson => lesson.status === 'active')
      for (const lesson of active) {
        if (time - Date.parse(lesson.lastConfirmed) > UNCONFIRMED_DAYS * DAY_MS) findings.push({ kind: 'unconfirmed', id: lesson.id, detail: `not confirmed for more than ${UNCONFIRMED_DAYS} days` })
      }
      for (const candidate of openCandidates(state)) {
        if (time - Date.parse(candidate.at) > OLD_CANDIDATE_DAYS * DAY_MS) findings.push({ kind: 'old-candidate', id: candidate.id, detail: `waiting for a merge for more than ${OLD_CANDIDATE_DAYS} days` })
      }
      for (const [index, lesson] of active.entries()) {
        for (const other of active.slice(index + 1)) {
          if (similar(lesson, other)) findings.push({ kind: 'similar', id: lesson.id, detail: `reads like ${other.id}` })
        }
      }
      for (const [key, outcome] of state.imports) {
        if ('rejected' in outcome) findings.push({ kind: 'rejected-annotation', id: key.slice(0, key.lastIndexOf('@')), detail: `the candidate in the annotation ${key} was refused (${outcome.rejected}); the annotation stays on the graph` })
      }
      return findings
    },
  }
}
