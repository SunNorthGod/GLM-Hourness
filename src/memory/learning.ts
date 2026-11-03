/**
 * The learning digest (M5 design §3.6 step 2): the groups of corrections
 * that `learning_signals` and the digest reminder show the main agent, with
 * where each group has been settled (a landing) and whether it came back
 * since. Pure: the readers of src/memory/digest.ts bring the graph and the
 * journals, this file turns them into the digest and decides when the
 * reminder is due.
 *
 * A group is settled where something names its key: a memory entry or a
 * lesson in `learnedFrom`, or a comment `学自：<key>` on a node of the graph
 * (a rule proposal, or a candidate exercise, are settled that way). The time
 * of a landing is the time of the first record that named the key on that
 * entry, not the time the entry was made, because a later write may add a key
 * to an old entry. Entries the person deleted, and lessons that are retired
 * or deleted, settle nothing.
 */
import type { Fold, JournalRecord } from '../data/journal.ts'
import { isObject, listOf } from '../data/refusal.ts'
import type { GraphNode } from '../graph/schema.ts'
import { activeLessons, lessonsFold, type LessonsState } from '../lessons/model.ts'
import { memoryFold, NOTICE_KEYS_MAX, type LearnNotice, type MemoryState, type Scope } from './model.ts'
import { recurrences, weeklyCounts, type DepthWrite, type Landing, type SignalEvent } from './signals.ts'

const DAY_MS = 86_400_000

/** The period a digest looks back over unless the caller names one. */
const WINDOW_DAYS = 28

/** A group needs this many events to be listed unless the caller asks for another number. */
const DEFAULT_MIN_COUNT = 2

/** The digest reminder comes at most this often. */
const NOTICE_EVERY_DAYS = 7

/** The reporting depth entry of the user-level journal, whose writes are signals. */
const DEPTH_ID = 'all:reporting-depth'

export interface DigestOptions {
  /** ISO moment; default 28 days before `until`. */
  readonly since?: string
  /** ISO moment; default now. */
  readonly until?: string
  /** 1 to 50; default 2. */
  readonly minCount?: number
}

interface DigestGroup {
  readonly key: string
  /** One sentence for the model: what kind of correction the key stands for. */
  readonly meaning: string
  readonly count: number
  /** At most three of the group's events, the newest first. */
  readonly examples: ReadonlyArray<{ readonly ref: string, readonly at: string }>
  /** How many entries, lessons and notes name the key. */
  readonly learned: number
  /** Events of the group after its earliest landing. */
  readonly recurrences: number
  /** The events of each of the last four weeks, the oldest week first. */
  readonly weekly: readonly number[]
}

export interface LearningDigest {
  readonly since: string
  readonly until: string
  readonly groups: readonly DigestGroup[]
  /** `unavailable` when the project graph could not be read: the digest then holds the signals that do not need it. */
  readonly graph: 'ok' | 'unavailable'
  /** The journals that could not be read, so that what they settle is missing from `learned`; absent when all were read. */
  readonly notes?: readonly string[]
}

// --- What the journals give ---------------------------------------------------

/** A folded journal and the records of it the learning pipeline reads again. */
export interface Collected<State> {
  readonly state: State
  /** The records the fold accepted and `pick` chose, in file order. */
  readonly picked: readonly JournalRecord[]
}

/** The fold of `inner` that also keeps the accepted records `pick` chooses; made once per use, because the journal's read cache tells folds apart by identity. */
function collecting<State>(inner: Fold<State>, pick: (record: JournalRecord) => boolean): Fold<Collected<State>> {
  return {
    empty: () => ({ state: inner.empty(), picked: [] }),
    apply(collected, record) {
      const step = inner.apply(collected.state, record)
      if ('bad' in step) return step
      return { state: { state: step.state, picked: pick(record) ? [...collected.picked, record] : collected.picked } }
    },
  }
}

const keysOf = (record: JournalRecord): string[] => {
  const keys = isObject(record.data) ? listOf(record.data.learnedFrom) : undefined
  return keys?.filter((key): key is string => typeof key === 'string') ?? []
}

const pickMemory = (record: JournalRecord): boolean => record.op === 'store' && (record.id === DEPTH_ID || keysOf(record).length > 0)
const pickLesson = (record: JournalRecord): boolean => (record.op === 'new' || record.op === 'revise') && keysOf(record).length > 0

export const MEMORY_COLLECTED: Readonly<Record<Scope, Fold<Collected<MemoryState>>>> = {
  project: collecting(memoryFold('project'), pickMemory),
  all: collecting(memoryFold('all'), pickMemory),
}
export const LESSONS_COLLECTED: Fold<Collected<LessonsState>> = collecting(lessonsFold, pickLesson)

/** When each (entry, key) pair was first named by a record. */
function firstMentions(picked: readonly JournalRecord[]): Map<string, string> {
  const first = new Map<string, string>()
  for (const record of picked) {
    for (const key of keysOf(record)) {
      const pair = `${record.id}\n${key}`
      if (!first.has(pair)) first.set(pair, record.at)
    }
  }
  return first
}

/** The writes of the reporting depth, in file order. */
export function depthWritesOf(read: Collected<MemoryState>): DepthWrite[] {
  return read.picked.flatMap((record) => {
    const value = isObject(record.data) ? record.data.value : undefined
    return record.id === DEPTH_ID && (value === 'concise' || value === 'balanced' || value === 'detailed') ? [{ at: record.at, seq: record.seq, value }] : []
  })
}

/** The keys the active entries of a memory journal name. */
export function memoryLandings(read: Collected<MemoryState>): Landing[] {
  const first = firstMentions(read.picked)
  return [...read.state.entries.values()]
    .filter(entry => entry.status === 'active')
    .flatMap(entry => (entry.learnedFrom ?? []).map(key => ({ key, at: first.get(`${read.state.scope}:${entry.name}\n${key}`) ?? entry.created })))
}

/** The keys the active lessons name. */
export function lessonLandings(read: Collected<LessonsState>): Landing[] {
  const first = firstMentions(read.picked)
  return activeLessons(read.state).flatMap(lesson => (lesson.learnedFrom ?? []).map(key => ({ key, at: first.get(`${lesson.id}\n${key}`) ?? lesson.created })))
}

/** A comment on a node that names the group it settles; the key ends at a space or at punctuation. */
const NOTE_KEY = /学自：([^\s，。；、]+)/gu

/** The comments of the graph that begin a landing with `学自：<key>`. */
export function noteLandings(nodes: Iterable<GraphNode>): Landing[] {
  return [...nodes].flatMap(node => node.history.flatMap(entry => entry.op === 'comment'
    ? [...(entry.text ?? '').matchAll(NOTE_KEY)].map(match => ({ key: match[1], at: entry.at }))
    : []))
}

// --- The digest ----------------------------------------------------------------

/** The meaning of a group key in a sentence for the model. */
export function meaningOf(key: string): string {
  const colon = key.indexOf(':')
  const kind = colon < 0 ? key : key.slice(0, colon)
  const rest = colon < 0 ? '' : key.slice(colon + 1)
  const dot = rest.indexOf('.')
  if (kind === 'edit' && dot > 0) return `the person changed the ${rest.slice(dot + 1)} the agent had set on a ${rest.slice(0, dot)}`
  if (kind === 'reject' && rest !== '') return `the person rejected a ${rest} the agent proposed`
  if (kind === 'reopen' && rest !== '') return `the person reopened a ${rest} the agent had marked done`
  if (key === 'chat:reject') return 'the person said no to a proposal in the conversation'
  if (key === 'chat:add') return 'the person added something to a proposal in the conversation'
  if (key === 'depth:up') return 'the person asked for longer reports'
  if (key === 'depth:down') return 'the person asked for shorter reports'
  return `a correction of kind ${key}`
}

interface DigestInput {
  /** The events from at least four weeks before `until` (and from `since`, when that is earlier). */
  readonly events: readonly SignalEvent[]
  readonly landings: readonly Landing[]
  readonly since: string
  readonly until: string
  readonly minCount: number
  readonly graph: 'ok' | 'unavailable'
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

/** The groups with `minCount` events or more in the window, each with where it is settled and whether it came back. */
export function buildDigest(input: DigestInput): LearningDigest {
  const inWindow = input.events.filter(event => Date.parse(event.at) >= Date.parse(input.since) && Date.parse(event.at) < Date.parse(input.until))
  const keys = [...new Set(inWindow.map(event => event.key))]
  const came = recurrences(inWindow, input.landings)
  const groups = keys
    .map((key): DigestGroup => {
      const own = inWindow.filter(event => event.key === key)
      return {
        key,
        meaning: meaningOf(key),
        count: own.length,
        examples: own.slice(-3).reverse().map(({ ref, at }) => ({ ref, at })),
        learned: input.landings.filter(landing => landing.key === key).length,
        recurrences: came.get(key) ?? 0,
        weekly: weeklyCounts(input.events, key, input.until),
      }
    })
    .filter(group => group.count >= input.minCount)
    .sort((a, b) => b.count - a.count || compare(a.key, b.key))
  return { since: input.since, until: input.until, groups, graph: input.graph }
}

/** The moments a digest covers: `until` is now unless named, `since` is 28 days before it. */
export function windowOf(options: DigestOptions, now: Date): { readonly since: string, readonly until: string, readonly minCount: number } {
  const until = options.until ?? now.toISOString()
  return {
    since: options.since ?? new Date(Date.parse(until) - WINDOW_DAYS * DAY_MS).toISOString(),
    until,
    minCount: options.minCount ?? DEFAULT_MIN_COUNT,
  }
}

/** The start of the events a digest needs: its own window, and the four weeks `weekly` counts. */
export const eventsFrom = (since: string, until: string): string => new Date(Math.min(Date.parse(since), Date.parse(until) - WINDOW_DAYS * DAY_MS)).toISOString()

// --- The reminder ----------------------------------------------------------------

/** The keys of the groups the reminder names: the ones with no landing yet, and the ones that came back after one; at most 50, in key order. */
export function noticeKeys(digest: LearningDigest): string[] {
  return digest.groups
    .filter(group => group.learned === 0 || group.recurrences > 0)
    .map(group => group.key)
    .sort(compare)
    .slice(0, NOTICE_KEYS_MAX)
}

/** Whether the reminder may come again: seven days after the last one, or there was none. */
export const noticeDue = (last: LearnNotice | undefined, now: string): boolean => last === undefined || Date.parse(now) - Date.parse(last.at) >= NOTICE_EVERY_DAYS * DAY_MS

/** Whether the reminder would name the groups the last one named. */
export const sameKeys = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((key, index) => key === b[index])

/** The text of the reminder (English, the model reads it). */
export const LEARNING_NOTICE = [
  'Learning digest (hourness): in the last 28 days the person corrected the same kind of thing more than once.',
  'Call learning_signals to see the groups.',
  'For each group that has no landing yet, choose one: a preference the person has stated, a lesson, a rule proposal or a candidate exercise, and record the group key with it (learnedFrom, or a "学自：<key>" comment on the node).',
  'A rule proposal goes to the person with propose_to_human.',
  'This is advice, not a rule.',
].join(' ')
