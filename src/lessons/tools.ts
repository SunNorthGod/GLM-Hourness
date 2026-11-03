/**
 * The lessons tools (lessons_query, lessons_merge; M5 design §4.2.2, §4.5):
 * `lessons_query` is every agent's lookup of what earlier work learned, a
 * worker's included; `lessons_merge` is the main agent's, to turn candidates
 * into lessons, keep them up and, on the person's word, delete or restore
 * one. A tool body checks its caller itself, because a tool outside an
 * agent's face still runs when it is called by name: a delegated child that
 * calls `lessons_merge` is refused with `role`, and the way out it is told is
 * the handback.
 *
 * A refusal is a tool error whose text is `{code, message, field?, hint?}`,
 * in English because the model reads it. What a request may do is decided by
 * the model's rules (src/lessons/merge.ts, src/lessons/model.ts); the tool
 * finds the project, takes the lock through the journal and answers.
 */
import type { AppendResult } from '../data/journal.ts'
import { invalid, isObject, isRefusal, refuse, type Refusal } from '../data/refusal.ts'
import type { AgentLike, SessionLike, ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import { queryLessons, type QueryRequest } from './match.ts'
import { checkMerge, planMerge, type MergePlan, type Writer } from './merge.ts'
import { whenOf } from './render.ts'
import { noteWrite, readLessons, writeLessons, type LessonsEnv } from './storage.ts'

/** The example in the description of lessons_merge; the spec runs it through a real call. */
export const LESSONS_MERGE_EXAMPLE = {
  action: 'new',
  reason: 'hit twice while resizing the product photos',
  situation: { files: ['tools/resize/**'], commands: ['resize-batch'], errors: ['EMFILE: too many open files'] },
  pitfall: 'resize-batch opens every source image at once and fails with EMFILE when the folder holds more than about 1000 files.',
  fix: 'Run it with --chunk 200, or split the folder first. The exit code is 0 even when files were skipped, so count the outputs.',
  evidence: ['commit:3fa9c21d7be0'],
} as const

const QUERY_DESCRIPTION = [
  'Search the lessons board: pitfalls other agents met in this project and what fixed them.',
  'Lessons are advice from earlier work, not rules; check that the fix still applies before you use it. When a command fails or a tool behaves unexpectedly, search here before you work around it.',
  'Give at least one of text (keywords), file (a repo-relative path), command (a command line), error (an error message). Results are the active lessons, best first, then up to two candidates nobody has reviewed yet (status "candidate").',
].join('\n')

const MERGE_DESCRIPTION = [
  'Keep the lessons board. Candidates are lessons that workers handed back; you merge each one. Actions: new (a lesson, from a candidate or written by you), into (merge a candidate into a lesson), revise, confirm (with fresh evidence), retire (put a lesson away), drop (a candidate), reopen (a retired lesson, or an expired or dropped candidate), delete and restore (only the user decides these: quote their own words in relay).',
  'A lesson says in which situation (files, tools, commands, error pieces) what goes wrong and what to do instead, with evidence: commit:<sha>, node:<id>, task:<id>, session:<id>, a document section or a path.',
  `Example: you hit a pitfall yourself and want to record it as a lesson.\nlessons_merge ${JSON.stringify(LESSONS_MERGE_EXAMPLE, null, 2)}\nTo delete a lesson the person asked you to delete, use action delete with their own words in relay.`,
].join('\n')

const QUERY_PARAMETERS = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Keywords, matched against pitfall, fix and situation.' },
    file: { type: 'string', description: 'A repo-relative path you are about to touch.' },
    command: { type: 'string', description: 'A command line you are about to run.' },
    error: { type: 'string', description: 'An error message you got, up to 6000 characters.' },
    limit: { type: 'number', description: 'Maximum lessons to return, 1 to 10 (default 5).' },
    includeCandidates: { type: 'boolean', description: 'Also list up to two candidates nobody reviewed yet (default true).' },
  },
} as const

const MERGE_PARAMETERS = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['new', 'into', 'revise', 'confirm', 'retire', 'drop', 'reopen', 'delete', 'restore'] },
    reason: { type: 'string', description: 'Why, in one sentence, at most 300 characters; kept in the journal.' },
    candidate: { type: 'string', description: 'A candidate id, C- and six hex digits (new from a candidate, into, drop, reopen).' },
    lesson: { type: 'string', description: 'A lesson id, L- and six hex digits.' },
    situation: { type: 'object', description: 'When it applies: files (repo-relative paths or globs, at most 20), tools (native tool names, at most 10), commands (at most 10), errors (pieces of an error message, 8 to 300 characters each, at most 5); at least one item.' },
    pitfall: { type: 'string', description: 'What goes wrong, one line, at most 300 characters.' },
    fix: { type: 'string', description: 'What to do instead, at most 600 characters.' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'One to eight items: commit:<sha>, node:<id>, task:<id>, session:<id>, a document section or a path.' },
    learnedFrom: { type: 'array', items: { type: 'string' }, description: 'Keys of the learning groups this lesson settles (at most 5).' },
    relay: { type: 'string', description: 'The user\'s own words, exactly as they said them. Required for delete and restore.' },
  },
  required: ['action', 'reason'],
} as const

type Failure = Refusal<string>

/** Throw a refusal as a tool error: the model reads the structured error after "Error: ". */
function fail(refusal: Failure): never {
  throw new Error(JSON.stringify(refusal))
}

const NO_PROJECT = refuse('no_project', 'this session has no project directory: it has no working directory, or it is in the home directory, or in a folder outside git without a .llm folder', undefined, 'create a .llm folder in the working directory to turn the lessons board on there')

/** The agent a tool body runs for. */
interface Call {
  readonly agent: AgentLike | undefined
  readonly session: SessionLike | undefined
  readonly callId: string | undefined
}

function callOf(exec: unknown): Call {
  const context = exec as Partial<ToolExecutionContext> | undefined
  return { agent: context?.agent, session: context?.agent?.session, callId: context?.callId }
}

/** The ids of the host that the journal keeps as the origin of a write. */
const originOf = (call: Call): NonNullable<Writer['by']> => ({
  ...(call.session === undefined ? {} : { session: call.session.id }),
  ...(call.agent === undefined ? {} : { agent: call.agent.id }),
  tool: 'lessons_merge',
  ...(call.callId === undefined ? {} : { callId: call.callId }),
})

const failureOf = (written: AppendResult<Failure>): Failure => {
  switch (written.status) {
    case 'refused': return written.refused
    case 'busy': return refuse('busy', written.lockLost ? 'the lessons file\'s lock was taken over before the write; nothing was written' : 'the lessons file is in use by another writer', undefined, 'retry in a moment')
    case 'io': return refuse('io', `the lessons could not be written (${written.stage}): ${written.message}`)
    default: return refuse('io', `internal error, nothing was written: ${written.status === 'invalid' ? written.message : 'no result'}`)
  }
}

// --- lessons_merge ---------------------------------------------------------

async function merge(env: LessonsEnv, args: unknown, exec: unknown): Promise<unknown> {
  const call = callOf(exec)
  if (call.session?.header.origin === 'subagent') fail(refuse('role', 'only the main agent merges lessons', undefined, 'Report what you learned in your handback (its lessons list); the main agent merges them.'))
  const request = checkMerge(args)
  if ('code' in request) fail(request)
  const dir = env.dirOf(call.session)
  if (dir === undefined) fail(NO_PROJECT)
  const made: { plan?: MergePlan } = {}
  const written = await writeLessons<Failure>(dir, (state) => {
    const planned = planMerge(state, request, { actor: 'llm', by: originOf(call) }, env.now().toISOString(), env.random)
    if (isRefusal(planned)) return { refused: planned }
    made.plan = planned
    return { records: planned.records }
  }, env.append)
  noteWrite(env, call.session?.id, written)
  if (written.status !== 'ok' || made.plan === undefined) fail(failureOf(written))
  return made.plan.result
}

// --- lessons_query ---------------------------------------------------------

const QUERY_KEYS: readonly string[] = ['text', 'file', 'command', 'error', 'limit', 'includeCandidates']
const LIMITS = { text: 500, file: 200, command: 300, error: 6000 } as const

function checkQuery(args: unknown, ignoreCase: boolean): QueryRequest | Refusal<'invalid'> {
  if (!isObject(args)) return invalid(undefined, 'arguments must be an object')
  const extra = Object.keys(args).find(key => !QUERY_KEYS.includes(key))
  if (extra !== undefined) return invalid(extra, `unknown field ${extra}`)
  for (const field of ['text', 'file', 'command', 'error'] as const) {
    const value = args[field]
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '' || value.length > LIMITS[field])) return invalid(field, `${field} must be 1 to ${LIMITS[field]} characters`)
  }
  const { text, file, command, error, limit, includeCandidates } = args
  if (text === undefined && file === undefined && command === undefined && error === undefined) return invalid(undefined, 'give at least one of text, file, command, error')
  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 10)) return invalid('limit', 'limit must be a whole number from 1 to 10')
  if (includeCandidates !== undefined && typeof includeCandidates !== 'boolean') return invalid('includeCandidates', 'includeCandidates must be true or false')
  return {
    ...(typeof text === 'string' ? { text } : {}),
    ...(typeof file === 'string' ? { file } : {}),
    ...(typeof command === 'string' ? { command } : {}),
    ...(typeof error === 'string' ? { error } : {}),
    ...(typeof limit === 'number' ? { limit } : {}),
    ...(typeof includeCandidates === 'boolean' ? { includeCandidates } : {}),
    ignoreCase,
  }
}

async function query(env: LessonsEnv, args: unknown, exec: unknown): Promise<unknown> {
  const call = callOf(exec)
  const request = checkQuery(args, env.ignoreCase)
  if ('code' in request) fail(request)
  const dir = env.dirOf(call.session)
  if (dir === undefined) return { lessons: [], more: 0, notes: ['this session has no project, so there are no lessons to search'] }
  const read = await readLessons(dir)
  if (!read.ok) fail(refuse('io', `the lessons could not be read: ${read.reason}`))
  const found = queryLessons(read.reading.state, request, env.now().toISOString())
  return {
    lessons: [
      ...found.lessons.map(({ lesson, score }) => ({ id: lesson.id, status: lesson.status, when: whenOf(lesson.situation), pitfall: lesson.pitfall, fix: lesson.fix, evidence: lesson.evidence, lastConfirmed: lesson.lastConfirmed, score })),
      ...found.candidates.map(({ candidate, score }) => ({ id: candidate.id, status: 'candidate', unreviewed: true, when: whenOf(candidate.situation), pitfall: candidate.pitfall, fix: candidate.fix, evidence: candidate.evidence, proposed: candidate.at, score })),
    ],
    more: found.more,
  }
}

const render: ToolDefinitionLike['output']['render'] = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

/** The two lessons tools over the row's environment. */
export function lessonsTools(env: LessonsEnv): ToolDefinitionLike[] {
  return [
    {
      name: 'lessons_query',
      description: QUERY_DESCRIPTION,
      parameters: QUERY_PARAMETERS,
      output: { schema: { type: 'object', properties: { lessons: { type: 'array', items: { type: 'object' } }, more: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } }, render },
      execute: (args, exec) => query(env, args, exec),
    },
    {
      name: 'lessons_merge',
      description: MERGE_DESCRIPTION,
      parameters: MERGE_PARAMETERS,
      output: { schema: { type: 'object', properties: { action: { type: 'string' }, lesson: { type: 'string' }, candidate: { type: 'string' }, status: { type: 'string' }, confirmations: { type: 'number' }, similar: { type: 'array', items: { type: 'string' } } } }, render },
      execute: (args, exec) => merge(env, args, exec),
    },
  ]
}
