/**
 * The habit questions (M5 design §3.8, memory_habit): the checks of an
 * `ask`, and the state-level decisions the tool makes under them — whether
 * the habit is already known, was asked or declined lately, and whether the
 * question fits the per-reply and weekly caps. The checks of a confirm or a
 * decline before the person's words are read (§3.8.3) are here too. Pure:
 * the callers bring the folded journals, the clock and the talk state.
 *
 * Nothing asks on the model's own wording: the question is checked against
 * the plain-words list (d-plain-questions), the person reads it in the
 * reply, and only their own next words — checked against what they really
 * said by src/memory/answers.ts — record anything (§3.8 rule 3).
 */
import { findSecret } from '../data/secret-shape.ts'
import { invalid, isObject, isRefusal, refuse, type Refusal } from '../data/refusal.ts'
import { jaccard, wordsOf } from '../data/words.ts'
import { PLAIN_WORDS, plainWordsIn } from '../graph/plain-question.ts'
import { CIRCLED } from '../graph/proposal.ts'
import {
  HABIT_ANSWER_DAYS,
  HABIT_DECLINE_DAYS,
  validateHabitFields,
  type HabitAsk,
  type HabitFields,
  type MemoryState,
} from './model.ts'

/** How many habit questions one project may see in one week (Monday 00:00 UTC, the week the recurrence cap uses). */
const HABIT_WEEK_CAP = 3

/** How many questions — proposals and habit questions together — one reply may put to the person (M3's rule, §3.8.5). */
const PER_REPLY_LIMIT = 3

const DAY_MS = 86_400_000
const WORDS_MAX = 500
const ASK_RECENT_DAYS = 28
/** For how many days after the person withdrew a confirmed habit (its `forget` record) the habit still answers known. */
const KNOWN_FORGOTTEN_DAYS = 28

/** The word-list hits of the question and the description, each with what to say instead (the forms of src/graph/plain-question.ts). */
function plainWords(fields: HabitFields): Refusal<'plain_words'> | undefined {
  const hits = [...plainWordsIn(fields.question), ...plainWordsIn(fields.description)]
  if (hits.length === 0) return undefined
  const instead = hits.map((hit) => {
    const word = PLAIN_WORDS.find(entry => entry.avoid.some(form => form.toLowerCase() === hit.toLowerCase()))
    return word === undefined ? hit : `use "${word.say}" instead of "${hit}"`
  })
  const field = plainWordsIn(fields.question).length > 0 ? 'question' : 'description'
  return refuse('plain_words', `the ${field} uses words the person does not use: ${hits.join(', ')}`, field, instead.join('; '))
}

/** The fields of an `ask` (§3.8.1), with the plain-words and secret checks of steps 3 and 4. */
export function checkHabitAsk(args: unknown): HabitFields | Refusal {
  const allowed = ['name', 'scope', 'description', 'body', 'question', 'learnedFrom']
  if (!isObject(args)) return invalid(undefined, 'arguments must be an object')
  const extra = Object.keys(args).find(key => !allowed.includes(key))
  if (extra !== undefined) return invalid(extra, `unknown field ${extra}`)
  const fields = validateHabitFields(args)
  if (isRefusal(fields)) return fields
  const plain = plainWords(fields)
  if (plain !== undefined) return plain
  for (const field of ['name', 'description', 'body', 'question'] as const) {
    const found = findSecret(fields[field])
    if (found !== undefined) return refuse('secret_like', found.message, field)
  }
  return fields
}

/** The words of a confirm or a decline (§3.8.1): stretches of the person's reply, at most 500 characters together including the line breaks that join them. */
export function checkWords(words: unknown): string[] | Refusal {
  const list = Array.isArray(words) && words.every(item => typeof item === 'string') ? words : undefined
  if (list === undefined || list.length === 0 || list.some(item => item.trim() === '')) {
    return invalid('words', 'words must be one or more stretches of the person\'s reply')
  }
  const total = list.reduce((sum, item, index) => sum + [...item].length + (index === 0 ? 0 : 1), 0)
  if (total > WORDS_MAX) return invalid('words', `words together must be at most ${WORDS_MAX} characters including the line breaks`)
  for (const item of list) {
    const found = findSecret(item)
    if (found !== undefined) return refuse('secret_like', found.message, 'words')
  }
  return list
}

const sameText = (a: { readonly name: string, readonly description: string }, b: { readonly name: string, readonly description: string }): boolean =>
  a.name === b.name || jaccard(wordsOf(`${a.name} ${a.description}`), wordsOf(`${b.name} ${b.description}`)) >= 0.6

const fresh = (at: string, nowMs: number, days: number): boolean => nowMs - Date.parse(at) < days * DAY_MS

/** The outcome of an earlier ask that names the same habit, by group key first and by wording otherwise (§3.8.1 step 7). */
function earlierOutcome(
  states: readonly MemoryState[],
  request: { readonly name: string, readonly description: string, readonly learnedFrom?: readonly string[] },
  nowMs: number,
): Refusal<'known' | 'asked_recently' | 'declined_recently'> | undefined {
  const keys = new Set(request.learnedFrom ?? [])
  const byKey = (ask: { readonly learnedFrom?: readonly string[] }): boolean => (ask.learnedFrom ?? []).some(key => keys.has(key))
  const matches = (of: { readonly name: string, readonly description: string, readonly learnedFrom?: readonly string[] }): boolean => byKey(of) || sameText(of, request)
  for (const state of states) {
    const confirmed = [...state.entries.values()].find(entry =>
      entry.confirmed !== undefined && (entry.status === 'active' || fresh(entry.forgottenAt ?? entry.lastReviewed, nowMs, KNOWN_FORGOTTEN_DAYS)) && matches(entry))
    if (confirmed !== undefined) {
      return refuse('known', `the person confirmed this habit before; it is on record as ${confirmed.name}`, 'name',
        'memory_query shows the entry; store an update under its name instead of asking again')
    }
  }
  for (const state of states) {
    for (const open of state.asks.values()) {
      if (fresh(open.at, nowMs, ASK_RECENT_DAYS) && matches(open)) {
        return refuse('asked_recently', `the same habit was put to the person on ${open.at.slice(0, 10)} and they have not answered it yet`, undefined,
          'wait for their answer; learning_signals shows the group as asked')
      }
    }
    for (const no of state.declined.values()) {
      if (Date.parse(no.until) > nowMs && matches(no)) {
        return refuse('declined_recently', `the person said no to this habit on ${no.at.slice(0, 10)}; the same habit is not asked again until ${no.until.slice(0, 10)}`, undefined,
          'do not ask again before then')
      }
    }
  }
  return undefined
}

/** The Monday 00:00 UTC that opens the week a moment falls in (the week the recurrence cap of the lessons uses). */
function weekStart(nowMs: number): number {
  const day = new Date(nowMs)
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  const weekday = (day.getUTCDay() + 6) % 7
  return midnight - weekday * DAY_MS
}

export interface AskContext {
  /** The session that asks; an ask record keeps it, and a confirm of another session is refused. */
  readonly session: string | undefined
  /** The clock. */
  readonly now: string
  /** The person's last message in this session, as the talk state holds it; `undefined` when their messages cannot be read. */
  readonly lastPersonAt: number | undefined
  /** The matters already put to the person in this reply (propose_to_human since their last message); `undefined` with the talk state. */
  readonly shown: number | undefined
}

/**
 * Step 7 of an `ask`: whether the habit is known, was asked or declined
 * lately, and whether the reply and the week have room for one more
 * question. Returns the number the question carries in the reply (① for the
 * first item, ② behind one proposal, and so on).
 */
export function planAsk(
  states: readonly MemoryState[],
  request: HabitFields,
  context: AskContext,
): { readonly number: number } | Refusal {
  const nowMs = Date.parse(context.now)
  const inScope = states.filter(state => state.scope === request.scope)
  const active = inScope.find(state => state.entries.get(request.name)?.status === 'active')
  if (active !== undefined) {
    return refuse('known', `there is already an active memory named ${request.name}`, 'name', 'memory_query shows it; store an update under its name instead of asking again')
  }
  const earlier = earlierOutcome(states, request, nowMs)
  if (earlier !== undefined) return earlier
  if (context.lastPersonAt === undefined || context.shown === undefined) {
    return refuse('unavailable', 'the messages of the person cannot be read in this session, so nothing is asked', undefined,
      'ask again in a session where the person\'s messages can be read')
  }
  const lastPersonAt = context.lastPersonAt
  const ownAsks = states.reduce((sum, state) => sum
    + [...state.asks.values()].filter(ask => ask.session !== undefined && ask.session === context.session && Date.parse(ask.at) > lastPersonAt).length, 0)
  const number = context.shown + ownAsks + 1
  if (number > PER_REPLY_LIMIT) {
    return refuse('too_many', `this reply already puts ${context.shown + ownAsks} question(s) to the person; at most ${PER_REPLY_LIMIT} go in one reply`, undefined,
      `call memory_habit ask after the propose_to_human calls of the same reply, never before them, and keep the reply to ${PER_REPLY_LIMIT} questions`)
  }
  const inWeek = states.reduce((sum, state) => sum + state.askTimes.filter(at => Date.parse(at) >= weekStart(nowMs)).length, 0)
  if (inWeek >= HABIT_WEEK_CAP) {
    return refuse('week_cap', `${inWeek} habit questions have been asked in this project this week; at most ${HABIT_WEEK_CAP} go out in one week`, undefined,
      'let the person bring the habit up themselves, or wait for the next week')
  }
  return { number }
}

/** What a confirm or a decline needs before the person's words are read (§3.8.3): the fields, and the question in this session, still open and inside the answer window. */
export function planAnswer(
  state: MemoryState,
  name: string,
  session: string | undefined,
  now: string,
): { readonly ask: HabitAsk } | Refusal {
  const ask = state.asks.get(name)
  if (ask === undefined) {
    return refuse('no_ask', `no open question named ${name}`, 'name', 'learning_signals and the memory index show what was asked; ask first with action "ask"')
  }
  if (ask.session === undefined || session === undefined || ask.session !== session) {
    return refuse('other_session', 'the question was asked in another session; only that session can record the answer', 'name')
  }
  if (Date.parse(now) - Date.parse(ask.at) > HABIT_ANSWER_DAYS * DAY_MS) {
    return refuse('lapsed', `the question was asked on ${ask.at.slice(0, 10)} and an answer is only taken for ${HABIT_ANSWER_DAYS} days`, undefined,
      'ask again with action "ask"; the same habit is not asked again for ' + `${HABIT_DECLINE_DAYS} days`)
  }
  return { ask }
}

/** The question as the person reads it (§3.8.1 step 6): the circled number, the question, and the content on a second line. */
export const askText = (number: number, fields: Pick<HabitFields, 'question' | 'description'>): string =>
  `${CIRCLED[number - 1]} ${fields.question}\n要记的：${fields.description}`

/** The habits of one scope that settle a learning group: an open ask lands while it is fresh, a no lands until its block ends (§3.8.4, m5-4 #8). */
export const habitLandings = (state: MemoryState): ReadonlyArray<{ readonly key: string, readonly at: string, readonly until?: string }> => [
  ...[...state.asks.values()].flatMap(ask => (ask.learnedFrom ?? []).map(key => ({
    key,
    at: ask.at,
    until: new Date(Date.parse(ask.at) + HABIT_DECLINE_DAYS * DAY_MS).toISOString(),
  }))),
  ...[...state.declined.values()].flatMap(no => (no.learnedFrom ?? []).map(key => ({ key, at: no.at, until: no.until }))),
]

/** How each group was put to the person, for the `asked` of learning_signals: the latest outcome naming the key. */
export interface HabitMarker {
  readonly key: string
  readonly state: 'asked' | 'declined' | 'confirmed'
  readonly at: string
  readonly until?: string
}

export const habitMarkers = (state: MemoryState): readonly HabitMarker[] => [
  ...[...state.asks.values()].flatMap(ask => (ask.learnedFrom ?? []).map(key => ({
    key,
    state: 'asked' as const,
    at: ask.at,
    until: new Date(Date.parse(ask.at) + HABIT_DECLINE_DAYS * DAY_MS).toISOString(),
  }))),
  ...[...state.declined.values()].flatMap(no => (no.learnedFrom ?? []).map(key => ({ key, state: 'declined' as const, at: no.at, until: no.until }))),
  ...[...state.entries.values()].flatMap((entry) => {
    if (entry.status !== 'active' || entry.confirmed === undefined) return []
    const confirmed = entry.confirmed
    return (entry.learnedFrom ?? []).map(key => ({ key, state: 'confirmed' as const, at: confirmed.at }))
  }),
]
