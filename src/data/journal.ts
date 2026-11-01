/**
 * Append-only journals of memory and lessons (M5 design §5.2, §5.3): one
 * JSON Lines file per collection, one record per line, the file the only
 * source of truth. A reader folds the records into a state with a `Fold`
 * (the memory and lessons models bring theirs); a writer takes the file's
 * lock, folds the file again, lets a plan decide what to append, and appends
 * it with the next `seq`.
 *
 * Reading: a line that does not parse, does not have the record shape, or
 * that the fold refuses is skipped and counted as bad with its line number;
 * a last line without a newline is somebody's write in progress (or a crash)
 * and a reader ignores it; the result is cached per path on the file's size
 * and modification time and shared by the async and the sync reader.
 *
 * Writing: one writer at a time per path inside the process (a queue), and
 * across processes the lock of `src/data/lock.ts` with M5's options
 * (docs/ORCHESTRATION.md §17.6). A writer that finds a last line without a
 * newline knows it is a crash's leftover (it holds the lock) and seals it
 * with a newline before its own record, so the leftover stays a bad line
 * and the new record starts on its own line. `seq` only exposes concurrent
 * writers whose lock failed: a repeated or smaller number is counted, never
 * dropped, because a write that was acknowledged must not vanish when the
 * file is folded.
 */
import { readFileSync, statSync } from 'node:fs'
import { mkdir, open, readFile, type FileHandle } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { acquireLock, realLockEnvironment, type LockEnvironment, type LockOptions } from './lock.ts'
import { ensureProjectDir } from './project-root.ts'

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type Actor = 'human' | 'llm' | 'harness'

/** Who and what caused a record: ids the host gave, never evidence. */
interface RecordOrigin {
  readonly session?: string
  readonly agent?: string
  readonly tool?: string
  readonly callId?: string
  readonly commandId?: string
}

export interface JournalRecord<Op extends string = string> {
  readonly v: 1
  /** From 1, one more than the largest in the file when written. */
  readonly seq: number
  /** ISO time. */
  readonly at: string
  readonly actor: Actor
  /** The person's own words, when an agent acted for them; at most 500 characters. */
  readonly relay?: string
  readonly by?: RecordOrigin
  readonly op: Op
  /** The entry the record is about; `*` for a record about the file (a base). */
  readonly id: string
  /** At most 300 characters. */
  readonly reason?: string
  readonly evidence?: readonly string[]
  /** The operation's content; for a deletion the snapshot of what was deleted. */
  readonly data?: JsonValue
}

/** A record as a plan hands it over: the journal adds `v`, `seq` and `at`. */
export type NewRecord<Op extends string = string> = Omit<JournalRecord<Op>, 'v' | 'seq' | 'at'>

/** What a fold does with one record: the next state, or the reason the record does not hold in the current one. */
export type FoldStep<State> = { readonly state: State } | { readonly bad: string }

export interface Fold<State> {
  /** The state of a journal without records. */
  empty(): State
  /** Pure: no clock, no files. */
  apply(state: State, record: JournalRecord): FoldStep<State>
}

interface BadLine {
  /** From 1. */
  readonly line: number
  readonly reason: string
}

export interface Reading<State> {
  readonly state: State
  readonly bad: readonly BadLine[]
  /** Records that repeat or go back from the previous one: a lock that failed once. They are applied all the same. */
  readonly seqAnomalies: number
  /** The largest `seq` of any record that has the record shape; 0 without one. */
  readonly lastSeq: number
  /** Whether the file exists. */
  readonly exists: boolean
  /** Bytes of the file. */
  readonly size: number
}

const ACTORS: readonly string[] = ['human', 'llm', 'harness']
const MAX_RELAY = 500
const MAX_REASON = 300
const ORIGIN_KEYS = ['session', 'agent', 'tool', 'callId', 'commandId'] as const
const HOST_ID = /^[A-Za-z0-9_.:-]{1,128}$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The record a line holds, or why the line is not one. */
export function parseRecord(line: string): JournalRecord | string {
  let value: unknown
  try {
    value = JSON.parse(line)
  }
  catch {
    return 'not JSON'
  }
  if (!isObject(value)) return 'not a record'
  const { v, seq, at, actor, relay, by, op, id, reason, evidence } = value
  if (v !== 1) return 'v is not 1'
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) return 'seq is not a positive integer'
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return 'at is not a time'
  if (typeof actor !== 'string' || !ACTORS.includes(actor)) return 'actor is not human, llm or harness'
  if (typeof op !== 'string' || op.length === 0) return 'op is empty'
  if (typeof id !== 'string' || id.length === 0) return 'id is empty'
  if (relay !== undefined && (typeof relay !== 'string' || relay.length > MAX_RELAY)) return `relay is not text of at most ${MAX_RELAY} characters`
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > MAX_REASON)) return `reason is not text of at most ${MAX_REASON} characters`
  if (evidence !== undefined && !(Array.isArray(evidence) && evidence.every(item => typeof item === 'string'))) return 'evidence is not a list of text'
  if (by !== undefined && !(isObject(by) && Object.entries(by).every(([key, item]) => (ORIGIN_KEYS as readonly string[]).includes(key) && typeof item === 'string'))) return 'by is not an origin'
  return value as unknown as JournalRecord
}

/** Fold the complete lines of `text` (a last line without a newline is dropped). */
function foldText<State>(text: string, fold: Fold<State>, exists: boolean, size: number): Reading<State> {
  const lines = text.split('\n')
  lines.pop()
  let state = fold.empty()
  const bad: BadLine[] = []
  let seqAnomalies = 0
  let lastSeq = 0
  let previous = 0
  for (const [index, raw] of lines.entries()) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.trim() === '') continue
    const record = parseRecord(line)
    if (typeof record === 'string') {
      bad.push({ line: index + 1, reason: record })
      continue
    }
    if (record.seq <= previous) seqAnomalies += 1
    previous = record.seq
    lastSeq = Math.max(lastSeq, record.seq)
    const step = fold.apply(state, record)
    if ('bad' in step) bad.push({ line: index + 1, reason: step.bad })
    else state = step.state
  }
  return { state, bad, seqAnomalies, lastSeq, exists, size }
}

const emptyReading = <State>(fold: Fold<State>): Reading<State> => foldText('', fold, false, 0)

const keyOf = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)

const cache = new Map<string, { readonly size: number, readonly mtimeMs: number, readonly fold: unknown, readonly reading: unknown }>()

function cached<State>(path: string, fold: Fold<State>, size: number, mtimeMs: number): Reading<State> | undefined {
  const entry = cache.get(keyOf(path))
  return entry?.fold === fold && entry.size === size && entry.mtimeMs === mtimeMs ? entry.reading as Reading<State> : undefined
}

function remember<State>(path: string, fold: Fold<State>, size: number, mtimeMs: number, reading: Reading<State>): Reading<State> {
  cache.set(keyOf(path), { size, mtimeMs, fold, reading })
  return reading
}

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

/** The folded journal, from the cache when the file's size and modification time are unchanged. Rejects on a read error other than a missing file. */
export async function readJournal<State>(path: string, fold: Fold<State>): Promise<Reading<State>> {
  let handle: FileHandle
  try {
    handle = await open(path, 'r')
  }
  catch (error) {
    if (missing(error)) return emptyReading(fold)
    throw error
  }
  try {
    const { size, mtimeMs } = await handle.stat()
    const known = cached(path, fold, size, mtimeMs)
    if (known !== undefined) return known
    return remember(path, fold, size, mtimeMs, foldText(await handle.readFile('utf8'), fold, true, size))
  }
  finally {
    await handle.close()
  }
}

/** `readJournal` for a caller that cannot wait (the reporting depth is read while the system prompt is assembled). Throws on a read error other than a missing file. */
export function readJournalSync<State>(path: string, fold: Fold<State>): Reading<State> {
  let size: number
  let mtimeMs: number
  try {
    ;({ size, mtimeMs } = statSync(path))
  }
  catch (error) {
    if (missing(error)) return emptyReading(fold)
    throw error
  }
  return cached(path, fold, size, mtimeMs) ?? remember(path, fold, size, mtimeMs, foldText(readFileSync(path, 'utf8'), fold, true, size))
}

/** What a plan decides: records to append, or a refusal the caller defines (similar, stale, no right to). */
type PlanOutcome<Refusal> = { readonly records: readonly NewRecord[] } | { readonly refused: Refusal }

/** Decides from the journal as it is while the lock is held. */
export type Plan<State, Refusal> = (reading: Reading<State>) => PlanOutcome<Refusal> | Promise<PlanOutcome<Refusal>>

/** Where a write that could not be done stopped, so the row can say what to fix. */
type IoStage = 'directory' | 'lock' | 'read' | 'write'

export type AppendResult<Refusal> =
  | { readonly status: 'ok', readonly records: readonly JournalRecord[] }
  | { readonly status: 'refused', readonly refused: Refusal }
  /** The lock was not free in time, or (`lockLost`) it was taken over from this writer before the append: nothing was written and the caller may try again. */
  | { readonly status: 'busy', readonly lockLost: boolean }
  | { readonly status: 'io', readonly stage: IoStage, readonly message: string }
  /** A record the plan built is not a valid record: a programming error, nothing was written. */
  | { readonly status: 'invalid', readonly message: string }

export interface AppendOptions {
  /** `project`: the directory is a project's `.llm` and is made through `ensureProjectDir`; `user`: a plain directory. */
  readonly directory: 'project' | 'user'
  /** The row writing, named in the lock file: `m5:<row>`. */
  readonly row: string
  /** The clock, the process and the machine's boot time; tests inject theirs. */
  readonly lock?: LockEnvironment
  /** Flush the file to disk before it is closed; tests inject a failing one. */
  readonly sync?: (handle: FileHandle) => Promise<void>
}

/** M5's lock values (docs/ORCHESTRATION.md §17.6). */
const LOCK_RETRY_MS = 50
const LOCK_WAIT_MS = 2_000
const LOCK_OPTIONS: LockOptions = { retryMs: LOCK_RETRY_MS, waitMs: LOCK_WAIT_MS, staleMs: 30_000, bootToleranceMs: 120_000, keepStale: true }

const queues = new Map<string, Promise<unknown>>()
const prepared = new Set<string>()
let lockLostWarned = false

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Drop the origin fields that are not host ids; the rest are written as they are. */
function cleanOrigin(by: RecordOrigin | undefined): RecordOrigin | undefined {
  if (by === undefined) return undefined
  const kept = Object.fromEntries(ORIGIN_KEYS.flatMap((key) => {
    const value = by[key]
    return value !== undefined && HOST_ID.test(value) ? [[key, value]] : []
  }))
  return Object.keys(kept).length === 0 ? undefined : kept
}

function build(seq: number, at: string, input: NewRecord): JournalRecord {
  const by = cleanOrigin(input.by)
  return {
    v: 1,
    seq,
    at,
    actor: input.actor,
    ...(input.relay === undefined ? {} : { relay: input.relay }),
    ...(by === undefined ? {} : { by }),
    op: input.op,
    id: input.id,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.data === undefined ? {} : { data: input.data }),
  }
}

/**
 * `acquireLock`, trying again while creating the lock file fails with EPERM.
 * On Windows a process that has just deleted or replaced the name makes
 * `open(file, 'wx')` fail that way for a moment (about one attempt in thirty
 * when several processes take the lock in a loop), and the lock module only
 * reads EEXIST as "someone holds it". A permission problem that stays is
 * reported after the wait a held lock gets.
 */
async function takeLock(file: string, environment: LockEnvironment, options: LockOptions): Promise<Awaited<ReturnType<typeof acquireLock>>> {
  const deadline = environment.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      return await acquireLock(file, environment, options)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM' || environment.now() >= deadline) throw error
      await environment.sleep(LOCK_RETRY_MS)
    }
  }
}

async function prepare(directory: string, kind: AppendOptions['directory']): Promise<void> {
  const key = keyOf(directory)
  if (prepared.has(key)) return
  await (kind === 'project' ? ensureProjectDir(directory) : mkdir(directory, { recursive: true }))
  prepared.add(key)
}

async function write<Refusal, State>(path: string, fold: Fold<State>, plan: Plan<State, Refusal>, options: AppendOptions): Promise<AppendResult<Refusal>> {
  const directory = dirname(path)
  const environment = options.lock ?? realLockEnvironment
  try {
    await prepare(directory, options.directory)
  }
  catch (error) {
    return { status: 'io', stage: 'directory', message: messageOf(error) }
  }
  const lockOptions: LockOptions = { ...LOCK_OPTIONS, holder: `m5:${options.row}` }
  let lock: Awaited<ReturnType<typeof acquireLock>>
  try {
    lock = await takeLock(`${path}.lock`, environment, lockOptions)
  }
  catch (error) {
    if (!missing(error)) return { status: 'io', stage: 'lock', message: messageOf(error) }
    // The directory was removed after it was prepared: prepare it again once.
    prepared.delete(keyOf(directory))
    try {
      await prepare(directory, options.directory)
    }
    catch (again) {
      return { status: 'io', stage: 'directory', message: messageOf(again) }
    }
    try {
      lock = await takeLock(`${path}.lock`, environment, lockOptions)
    }
    catch (last) {
      return { status: 'io', stage: 'lock', message: messageOf(last) }
    }
  }
  if (lock === 'busy') return { status: 'busy', lockLost: false }
  try {
    let text = ''
    let exists = true
    try {
      text = await readFile(path, 'utf8')
    }
    catch (error) {
      if (!missing(error)) return { status: 'io', stage: 'read', message: messageOf(error) }
      exists = false
    }
    const sealing = text !== '' && !text.endsWith('\n')
    const reading = foldText(sealing ? `${text}\n` : text, fold, exists, Buffer.byteLength(text))
    const outcome = await plan(reading)
    if ('refused' in outcome) return { status: 'refused', refused: outcome.refused }
    if (outcome.records.length === 0) return { status: 'ok', records: [] }
    const at = new Date(environment.now()).toISOString()
    const records = outcome.records.map((input, index) => build(reading.lastSeq + 1 + index, at, input))
    for (const record of records) {
      const problem = parseRecord(JSON.stringify(record))
      if (typeof problem === 'string') return { status: 'invalid', message: `record ${record.op} ${record.id}: ${problem}` }
    }
    if (!await lock.held()) {
      if (!lockLostWarned) {
        lockLostWarned = true
        console.warn(`dsh-glm-hourness: the lock of ${path} was taken over from this writer before its append; the write was given up`)
      }
      return { status: 'busy', lockLost: true }
    }
    let handle: FileHandle
    try {
      handle = await open(path, 'a')
    }
    catch (error) {
      return { status: 'io', stage: 'write', message: messageOf(error) }
    }
    try {
      await handle.writeFile(`${sealing ? '\n' : ''}${records.map(record => JSON.stringify(record)).join('\n')}\n`)
      await (options.sync ?? (file => file.sync()))(handle)
    }
    catch (error) {
      return { status: 'io', stage: 'write', message: messageOf(error) }
    }
    finally {
      await handle.close()
    }
    return { status: 'ok', records }
  }
  finally {
    await lock.release()
  }
}

/**
 * Append what `plan` decides to the journal at `path`, in the order the
 * design fixes (§5.3): queue behind this process's other writers of the
 * path, prepare the directory, take the lock, fold the file as it is, plan,
 * check the lock is still ours, seal a leftover half line, append, flush,
 * release. Never rejects for an I/O failure; a plan that throws rejects, and
 * the lock is released.
 */
export function appendJournal<State, Refusal = never>(path: string, fold: Fold<State>, plan: Plan<State, Refusal>, options: AppendOptions): Promise<AppendResult<Refusal>> {
  const key = keyOf(path)
  const run = (queues.get(key) ?? Promise.resolve()).then(() => write(path, fold, plan, options))
  const tail = run.then(() => undefined, () => undefined)
  queues.set(key, tail)
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return run
}
