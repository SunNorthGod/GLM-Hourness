/**
 * Finding the lessons that fit (M5 design §4.3 to §4.6): which lessons a
 * dispatched task should carry (`relevant`), which ones a failed command
 * matches (`matchFailure`), what `lessons_query` returns (`queryLessons`),
 * and which lessons keep coming back (`dueRecurrences`).
 *
 * Pure functions over a `LessonsState`: no clock (the time is a parameter),
 * no files, no Node built-ins, so the lessons page shares them. Tool names
 * are DSH native names on both sides (the caller maps a GLM alias with
 * `toNativeTool` first), and file paths are repo-relative. Only active
 * lessons are ever returned; a retired or deleted one is out of reach.
 */
import { wordsOf } from '../data/words.ts'
import { activeLessons, ERROR_LENGTH, normalizeText, openCandidates, type Candidate, type Lesson, type LessonsState, type Situation } from './model.ts'

// --- Paths: globs and how two paths meet -------------------------------------

type Token =
  | { readonly kind: 'char', readonly char: string }
  | { readonly kind: 'one' }
  | { readonly kind: 'star' }
  | { readonly kind: 'globstar' }
  | { readonly kind: 'dirs' }

/** `?` is one character but `/`; `*` any run without `/`; `**` any run; `**` followed by `/` any number of directories, none included. Everything else stands for itself. */
function tokensOf(pattern: string): Token[] {
  const tokens: Token[] = []
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index)
    if (char === '?') tokens.push({ kind: 'one' })
    else if (char !== '*') tokens.push({ kind: 'char', char })
    else if (pattern.charAt(index + 1) !== '*') tokens.push({ kind: 'star' })
    else {
      while (pattern.charAt(index + 1) === '*') index += 1
      if (pattern.charAt(index + 1) === '/') {
        index += 1
        tokens.push({ kind: 'dirs' })
      }
      else tokens.push({ kind: 'globstar' })
    }
  }
  return tokens
}

/** A path longer than this meets nothing: the matcher's work grows with the square of it. */
const MAX_PATH = 1024

/**
 * Whether a glob matches a whole path. Written as a memoised walk over the
 * pattern's tokens, not as a regular expression: a pattern of many stars
 * cannot make it backtrack for long, and the patterns come from agents.
 */
export function globMatch(pattern: string, path: string, ignoreCase = false): boolean {
  if (path.length > MAX_PATH) return false
  const tokens = tokensOf(ignoreCase ? pattern.toLowerCase() : pattern)
  const text = ignoreCase ? path.toLowerCase() : path
  const memo = new Map<number, boolean>()
  const walk = (at: number, from: number): boolean => {
    const key = at * (text.length + 1) + from
    const known = memo.get(key)
    if (known !== undefined) return known
    const result = step(at, from)
    memo.set(key, result)
    return result
  }
  const step = (at: number, from: number): boolean => {
    const token = tokens[at]
    if (token === undefined) return from === text.length
    switch (token.kind) {
      case 'char': return text.charAt(from) === token.char && walk(at + 1, from + 1)
      case 'one': return from < text.length && text.charAt(from) !== '/' && walk(at + 1, from + 1)
      case 'star':
        for (let end = from; ; end += 1) {
          if (walk(at + 1, end)) return true
          if (end >= text.length || text.charAt(end) === '/') return false
        }
      case 'globstar':
        for (let end = from; end <= text.length; end += 1) if (walk(at + 1, end)) return true
        return false
      default:
        if (walk(at + 1, from)) return true
        for (let end = from; end < text.length; end += 1) if (text.charAt(end) === '/' && walk(at + 1, end + 1)) return true
        return false
    }
  }
  return walk(0, 0)
}

const hasWildcard = (path: string): boolean => /[*?]/.test(path)

/** The part of a path before its first wildcard; the whole path when it has none. */
export function literalPrefix(path: string): string {
  const first = path.search(/[*?]/)
  return first < 0 ? path : path.slice(0, first)
}

const normalizePath = (path: string): string => path.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')

/**
 * Whether a lesson's file pattern and a task's path can be the same file
 * (§4.3). A task path without a wildcard meets the pattern when the pattern
 * matches it. A task path with one (a write scope such as `docs/graph/**`)
 * meets it when the pattern matches the path's literal prefix, or when one
 * literal prefix starts the other (neither empty: a pattern that starts with
 * a wildcard would otherwise meet every task).
 */
export function pathsMeet(lessonPattern: string, taskPath: string, ignoreCase = false): boolean {
  const pattern = normalizePath(lessonPattern)
  const path = normalizePath(taskPath)
  if (!hasWildcard(path)) return globMatch(pattern, path, ignoreCase)
  const prefix = literalPrefix(path)
  if (globMatch(pattern, prefix, ignoreCase)) return true
  const own = literalPrefix(pattern)
  const [left, right] = ignoreCase ? [own.toLowerCase(), prefix.toLowerCase()] : [own, prefix]
  return left !== '' && right !== '' && (left.startsWith(right) || right.startsWith(left))
}

// --- Commands ------------------------------------------------------------------

const SEPARATORS = new Set(['|', ';', '&', '(', ')', '{', '}', '\n', '\r'])

/** The words of each command in a command line, lower case, quotes taken off: a command ends at a pipe, `;`, `&`, a bracket or a line end outside quotes. */
function commandWords(line: string): string[][] {
  const commands: string[][] = []
  let words: string[] = []
  let word = ''
  let quote: string | undefined
  const endWord = (): void => {
    if (word !== '') words.push(word.toLowerCase())
    word = ''
  }
  const endCommand = (): void => {
    endWord()
    if (words.length > 0) commands.push(words)
    words = []
  }
  for (const char of line) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      else word += char
    }
    else if (char === '"' || char === '\'') quote = char
    else if (SEPARATORS.has(char)) endCommand()
    else if (/\s/.test(char)) endWord()
    else word += char
  }
  endCommand()
  return commands
}

/**
 * Whether a lesson's command (a name or the start of a command, case does
 * not matter) is the start of one of the commands in a command line: whole
 * words, at the command position (`Get-Content` matches
 * `dir | Get-Content x`, not `echo Get-Content`, not `Get-ContentX`).
 */
export function commandMatches(lessonCommand: string, commandLine: string): boolean {
  const wanted = normalizeText(lessonCommand).split(' ')
  return commandWords(commandLine).some(words => wanted.every((word, index) => words[index] === word))
}

// --- Failures --------------------------------------------------------------------

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'g')

/** The text of a failure as lessons are matched against it: colour and cursor codes gone, lower case, white space folded. */
export const normalizeFailure = (text: string): string => normalizeText(text.replace(ANSI, ''))

/**
 * The longest error fragment of a situation that occurs in a failure text
 * (already normalised), or undefined. A fragment is counted after the colour
 * codes are read away: one that is mostly codes passes the write check at
 * eight characters and would be a word or two here, which occurs in
 * everything.
 */
function longestFragment(situation: Situation, failure: string): string | undefined {
  return situation.errors
    .filter((fragment) => {
      const wanted = normalizeFailure(fragment)
      return wanted.length >= ERROR_LENGTH.min && failure.includes(wanted)
    })
    .sort((a, b) => b.length - a.length)[0]
}

export const FAILURE_LIMIT = 2

export interface FailureMatch {
  readonly lesson: Lesson
  /** The error fragment of the lesson that the failure contains, as the lesson has it. */
  readonly fragment: string
}

/**
 * The lessons whose error fragment occurs in a failure (§4.4): longest
 * fragment first, then the most recently confirmed. Lessons in `skip`
 * (already shown to this session) are left out before the cut at `limit`.
 * A fragment has at least eight characters (the write checks it), so a
 * word like "error" cannot match everything.
 */
export function matchFailure(state: LessonsState, failure: string, options: { readonly skip?: ReadonlySet<string>, readonly limit?: number } = {}): FailureMatch[] {
  const text = normalizeFailure(failure)
  return activeLessons(state)
    .filter(lesson => options.skip?.has(lesson.id) !== true)
    .flatMap((lesson) => {
      const fragment = longestFragment(lesson.situation, text)
      return fragment === undefined ? [] : [{ lesson, fragment }]
    })
    .sort((a, b) => b.fragment.length - a.fragment.length || Date.parse(b.lesson.lastConfirmed) - Date.parse(a.lesson.lastConfirmed) || (a.lesson.id < b.lesson.id ? -1 : 1))
    .slice(0, options.limit ?? FAILURE_LIMIT)
}

// --- Sessions a lesson touched ---------------------------------------------------

const DAY_MS = 86_400_000
export const SESSION_WINDOW_DAYS = 28

/** In how many different sessions in the last 28 days the lesson matched a failure or took a candidate in. */
export function recentSessions(state: LessonsState, lessonId: string, now: string): number {
  const from = Date.parse(now) - SESSION_WINDOW_DAYS * DAY_MS
  return new Set((state.touches.get(lessonId) ?? []).filter(touch => Date.parse(touch.at) >= from).map(touch => touch.session)).size
}

// --- Dispatch: lessons for a brief -----------------------------------------------

/** What a task has: the paths it may write, the tools and the commands it will use. */
interface Wanted {
  readonly paths: readonly string[]
  readonly tools: readonly string[]
  readonly commands: readonly string[]
  readonly ignoreCase?: boolean
}

export interface RelevantQuery extends Wanted {
  /** 1 to 10, 5 when absent. */
  readonly limit?: number
}

export interface Scored {
  readonly lesson: Lesson
  readonly score: number
  /** Sessions in the last 28 days (`recentSessions`). */
  readonly sessions: number
}

const POINTS = { file: 3, command: 2, tool: 1 } as const
/** A lesson a brief carries scores at least this: a tool alone (1 point) is true of almost every task and is only noise there. */
export const BRIEF_MIN_SCORE = 2
const MAX_QUERY_ITEMS = 50
const MAX_LIMIT = 10

const limitOf = (limit: number | undefined): number => Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limit) ? Math.trunc(limit ?? 0) : 5))

/** Points for what the situation has in common with the wanted paths, tools and commands: each kind counts once. */
function situationScore(situation: Situation, wanted: Wanted): number {
  const tools = new Set(wanted.tools.slice(0, MAX_QUERY_ITEMS).map(tool => tool.toLowerCase()))
  let score = 0
  if (situation.files.some(pattern => wanted.paths.slice(0, MAX_QUERY_ITEMS).some(path => pathsMeet(pattern, path, wanted.ignoreCase)))) score += POINTS.file
  if (situation.commands.some(command => wanted.commands.slice(0, MAX_QUERY_ITEMS).some(line => commandMatches(command, line)))) score += POINTS.command
  if (situation.tools.some(tool => tools.has(tool.toLowerCase()))) score += POINTS.tool
  return score
}

const byRank = (a: Scored, b: Scored): number =>
  b.score - a.score || b.sessions - a.sessions || Date.parse(b.lesson.lastConfirmed) - Date.parse(a.lesson.lastConfirmed) || (a.lesson.id < b.lesson.id ? -1 : 1)

/** The lessons a dispatched task should carry (§4.3): active, scoring at least 2, best first; equal scores go to the one that matched in more sessions lately, then to the one confirmed last. */
export function relevant(state: LessonsState, query: RelevantQuery, now: string): Scored[] {
  return activeLessons(state)
    .map(lesson => ({ lesson, score: situationScore(lesson.situation, query), sessions: recentSessions(state, lesson.id, now) }))
    .filter(item => item.score >= BRIEF_MIN_SCORE)
    .sort(byRank)
    .slice(0, limitOf(query.limit))
}

// --- lessons_query -----------------------------------------------------------------

export interface QueryRequest {
  readonly text?: string
  readonly file?: string
  readonly command?: string
  readonly error?: string
  /** 1 to 10, 5 when absent. */
  readonly limit?: number
  /** Open candidates come after the lessons, at most two; true when absent. */
  readonly includeCandidates?: boolean
  readonly ignoreCase?: boolean
}

interface ScoredCandidate {
  readonly candidate: Candidate
  readonly score: number
}

export interface QueryResult {
  readonly lessons: readonly Scored[]
  readonly candidates: readonly ScoredCandidate[]
  /** Matches left out by the limits. */
  readonly more: number
}

const FRAGMENT_POINTS = 4
const OVERLAP_MIN_WORDS = 2
const OVERLAP_MAX_POINTS = 3
const CANDIDATE_LIMIT = 2

/** Words that tell texts apart: an English word of two letters ("is", "on") does not. */
const significant = (words: ReadonlySet<string>): string[] => [...words].filter(word => word.length >= 3 || !/^[a-z0-9]+$/.test(word))

interface Prepared {
  readonly request: QueryRequest
  readonly failure: string
  readonly errorWords: ReadonlySet<string>
  readonly keywords: readonly string[]
}

/** Points of a lesson or candidate for a query; the conditions given add up. */
function queryScore(item: Pick<Lesson, 'situation' | 'pitfall' | 'fix'>, prepared: Prepared): number {
  const { request } = prepared
  let score = situationScore(item.situation, {
    paths: request.file === undefined ? [] : [request.file],
    tools: [],
    commands: request.command === undefined ? [] : [request.command],
    ...(request.ignoreCase === undefined ? {} : { ignoreCase: request.ignoreCase }),
  })
  if (request.error !== undefined) {
    if (longestFragment(item.situation, prepared.failure) !== undefined) score += FRAGMENT_POINTS
    const shared = significant(wordsOf(item.pitfall)).filter(word => prepared.errorWords.has(word)).length
    if (shared >= OVERLAP_MIN_WORDS) score += Math.min(shared, OVERLAP_MAX_POINTS)
  }
  if (prepared.keywords.length > 0) {
    const words = wordsOf(`${item.pitfall} ${item.fix} ${Object.values(item.situation).flat().join(' ')}`)
    score += prepared.keywords.filter(word => words.has(word)).length
  }
  return score
}

/**
 * What `lessons_query` answers (§4.5): the active lessons that score above 0
 * for the conditions given (`file` and `command` as in a brief; `error` by
 * fragment and by words shared with the pitfall; `text` by keywords in
 * pitfall, fix and situation), then up to two open candidates the same way.
 */
export function queryLessons(state: LessonsState, request: QueryRequest, now: string): QueryResult {
  const prepared: Prepared = {
    request,
    failure: request.error === undefined ? '' : normalizeFailure(request.error),
    errorWords: new Set(request.error === undefined ? [] : significant(wordsOf(request.error))),
    keywords: request.text === undefined ? [] : [...wordsOf(request.text)],
  }
  const lessons = activeLessons(state)
    .map(lesson => ({ lesson, score: queryScore(lesson, prepared), sessions: recentSessions(state, lesson.id, now) }))
    .filter(item => item.score > 0)
    .sort(byRank)
  const candidates = request.includeCandidates === false
    ? []
    : openCandidates(state)
        .map(candidate => ({ candidate, score: queryScore(candidate, prepared) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || Date.parse(b.candidate.at) - Date.parse(a.candidate.at) || (a.candidate.id < b.candidate.id ? -1 : 1))
  const shown = lessons.slice(0, limitOf(request.limit))
  const listed = candidates.slice(0, CANDIDATE_LIMIT)
  return { lessons: shown, candidates: listed, more: lessons.length - shown.length + candidates.length - listed.length }
}

// --- Lessons that keep coming back -------------------------------------------------

/** Different sessions in the window that make a lesson one that keeps coming back. */
const RECUR_SESSIONS = 3
/** Reminders per project per calendar week. */
export const RECUR_WEEKLY_CAP = 2

export interface Recurrence {
  readonly lesson: Lesson
  readonly sessions: number
}

/** Midnight on the Monday of the week of a moment, UTC. */
function weekStart(ms: number): number {
  const day = new Date(ms)
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - (day.getUTCDay() + 6) % 7)
}

/**
 * The lessons that matched a failure or took a candidate in, in three
 * different sessions in the last 28 days, and that got no reminder in those
 * 28 days (§4.6); the lesson with most sessions first. At most two reminders
 * per calendar week (Monday to Sunday, UTC) are recorded, so what is already
 * recorded this week is taken off the two.
 */
export function dueRecurrences(state: LessonsState, now: string): Recurrence[] {
  const time = Date.parse(now)
  const windowStart = time - SESSION_WINDOW_DAYS * DAY_MS
  const weekFrom = weekStart(time)
  const times = [...state.recurrences.values()].flat().map(at => Date.parse(at))
  const allowance = RECUR_WEEKLY_CAP - times.filter(at => at >= weekFrom).length
  if (allowance <= 0) return []
  return activeLessons(state)
    .flatMap((lesson) => {
      const sessions = recentSessions(state, lesson.id, now)
      const reminded = (state.recurrences.get(lesson.id) ?? []).some(at => Date.parse(at) >= windowStart)
      return sessions >= RECUR_SESSIONS && !reminded ? [{ lesson, sessions }] : []
    })
    .sort((a, b) => b.sessions - a.sessions || (a.lesson.id < b.lesson.id ? -1 : 1))
    .slice(0, allowance)
}
