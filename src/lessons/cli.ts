/**
 * Command line of the lessons board (M5 design §4.8, §7.4): the way to put
 * lessons into a project's journal from outside a DSH session, as the first
 * lessons are. The writer is always `llm` and every item is one
 * `lessons_merge` request, so the command line enforces the rules of the tool
 * and no others.
 *
 *   npm run -s lessons -- [--cwd <folder>] show
 *   npm run -s lessons -- [--cwd <folder>] apply [--file <path>]
 *
 * The project is the one the folder belongs to (`--cwd`, else the folder npm
 * was started in): its `.llm/lessons.jsonl`. `apply` takes a JSON list of
 * requests from `--file` or standard input. A request whose lesson is there
 * already (the same signature) is skipped, so a file can be applied again;
 * a request that does not hold is listed with the reason; what was written
 * stays written. Prints one JSON document; exit code 0 when nothing failed, 1
 * when a request failed, 2 for a bad command line or input.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { projectDirOf } from '../data/project-root.ts'
import type { AppendOptions, NewRecord } from '../data/journal.ts'
import { checkMerge, planMerge, type MergeRefusal } from './merge.ts'
import { activeLessons, openCandidates, type LessonsState, type RandomSource } from './model.ts'
import { foldNew, readLessons, writeLessons } from './storage.ts'
import { whenOf } from './render.ts'

const CLI_USAGE = 'npm run -s lessons -- [--cwd <folder>] show | apply [--file <path>]; apply reads a JSON list of lessons_merge requests from --file or stdin'

export interface CliIo {
  /** The folder the project is looked for from, when `--cwd` is absent. */
  readonly cwd: string
  /** Standard input; read only when `apply` has no `--file`. */
  readonly stdin: () => Promise<string>
  readonly now?: () => Date
  readonly random?: RandomSource
  /** The lock environment a test replaces. */
  readonly append?: Pick<AppendOptions, 'lock' | 'sync'>
}

export interface CliResult {
  /** 0 success, 1 a request failed, 2 bad command line, input or project. */
  readonly exitCode: 0 | 1 | 2
  /** The JSON document for stdout, newline-terminated. */
  readonly text: string
}

const done = (exitCode: CliResult['exitCode'], document: object): CliResult => ({ exitCode, text: `${JSON.stringify(document, null, 2)}\n` })
const usage = (message: string): CliResult => done(2, { ok: false, error: { code: 'invalid', message, hint: CLI_USAGE } })

interface Outcome {
  readonly index: number
  readonly detail: object
}

/** The items of an apply file: a JSON list of requests (a byte order mark, which some Windows editors write, is not JSON). */
function itemsOf(text: string): unknown[] | string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
  }
  catch (error) {
    return `the input is not valid JSON: ${(error as Error).message}`
  }
  return Array.isArray(parsed) ? parsed as unknown[] : 'the input must be a JSON list of lessons_merge requests'
}

async function apply(dir: string, text: string, io: CliIo): Promise<CliResult> {
  const items = itemsOf(text)
  if (typeof items === 'string') return usage(items)
  const now = io.now ?? ((): Date => new Date())
  const random = io.random ?? ((): number => Math.floor(Math.random() * 0x1000000))
  const applied: Outcome[] = []
  const skipped: Outcome[] = []
  const failed: Outcome[] = []
  const written = await writeLessons<never>(dir, (state) => {
    const at = now().toISOString()
    const records: NewRecord[] = []
    let current: LessonsState = state
    for (const [index, item] of items.entries()) {
      const request = checkMerge(item)
      const planned = 'code' in request ? request : planMerge(current, request, { actor: 'llm', by: { tool: 'lessons-cli' } }, at, random)
      if ('code' in planned) {
        const refusal: MergeRefusal = planned
        ;(refusal.code === 'duplicate' ? skipped : failed).push({ index, detail: { code: refusal.code, message: refusal.message, ...(refusal.field === undefined ? {} : { field: refusal.field }), ...(refusal.hint === undefined ? {} : { hint: refusal.hint }) } })
        continue
      }
      const next = foldNew(current, planned.records, at)
      if ('code' in next) {
        failed.push({ index, detail: { code: next.code, message: next.message } })
        continue
      }
      current = next
      records.push(...planned.records)
      applied.push({ index, detail: planned.result })
    }
    return { records }
  }, io.append)
  if (written.status !== 'ok') return done(1, { ok: false, error: { code: written.status, message: written.status === 'io' ? `${written.stage}: ${written.message}` : written.status === 'invalid' ? written.message : 'the lessons file is in use by another writer; nothing was written' } })
  return done(failed.length === 0 ? 0 : 1, { ok: failed.length === 0, applied, skipped, failed })
}

async function show(dir: string): Promise<CliResult> {
  const read = await readLessons(dir)
  if (!read.ok) return done(1, { ok: false, error: { code: 'io', message: read.reason } })
  const { state, bad } = read.reading
  return done(0, {
    ok: true,
    dir,
    lessons: activeLessons(state).map(lesson => ({ id: lesson.id, when: whenOf(lesson.situation), pitfall: lesson.pitfall, fix: lesson.fix, evidence: lesson.evidence, lastConfirmed: lesson.lastConfirmed })),
    candidates: openCandidates(state).map(candidate => ({ id: candidate.id, pitfall: candidate.pitfall })),
    unreadableLines: bad.length,
  })
}

export async function runCli(args: readonly string[], io: CliIo): Promise<CliResult> {
  const line = readLine(args)
  if (typeof line === 'string') return usage(line)
  const { values, positionals: [command, ...rest] } = line
  if (command !== 'show' && command !== 'apply') return usage(command === undefined ? 'missing command' : `unknown command "${command}"`)
  if (rest.length > 0) return usage(`${command} takes no arguments`)
  if (command === 'show' && values.file !== undefined) return usage('show takes no --file')
  const cwd = resolve(values.cwd ?? io.cwd)
  const dir = projectDirOf(cwd)
  if (dir === undefined) return usage(`no project at ${cwd}: it is not in a git repository and has no .llm folder (or it is a home directory or a drive root)`)
  if (command === 'show') return show(dir)
  let text: string
  try {
    text = values.file === undefined ? await io.stdin() : await readFile(resolve(values.file), 'utf8')
  }
  catch (error) {
    return usage(`cannot read --file ${String(values.file)}: ${(error as Error).message}`)
  }
  if (text.trim().length === 0) return usage('no request: pass a JSON list with --file or on stdin')
  return apply(dir, text, io)
}

/** The options and words of the command line, or why it is not one. */
function readLine(args: readonly string[]) {
  try {
    return parseArgs({ args: [...args], options: { cwd: { type: 'string' }, file: { type: 'string' } }, allowPositionals: true, strict: true })
  }
  catch (error) {
    return (error as Error).message
  }
}
