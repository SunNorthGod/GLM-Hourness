/**
 * Where a session's memory is and how the memory row reads and writes it
 * (M5 design §5.1, §5.2, §5.4). Memory has two journals, one per scope: the
 * project's `memory.jsonl` in the project directory (facts and norms of the
 * project) and the user-level `memory/memory.jsonl` (what is about the
 * person, `d-memory-scope`). Both are the append-only journals of
 * src/data/journal.ts folded by the memory model.
 *
 * Migration: a project directory that has the old `memory.json` and no
 * `memory.jsonl` reads as that file converted to facts. The first write
 * puts the converted state in the journal as its first record (a `base`),
 * then the write's own records, and renames the old file to
 * `memory.json.migrated-<ms>`. An old file that cannot be read is never
 * overwritten or replaced by an empty store: reads and writes report it.
 *
 * `MemoryEnv` is everything the tools, the commands and the services need
 * from the row: where a session's directories are, whether a source exists,
 * the clock, and where to tell the row about a problem (its health).
 */
import { readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ParsedRef } from '../data/evidence.ts'
import { appendJournal, readJournal, type AppendOptions, type AppendResult, type JournalRecord, type NewRecord } from '../data/journal.ts'
import type { GraphNode } from '../graph/schema.ts'
import type { SessionLike } from '../shared/dsh-min.ts'
import { baseRecord, convertLegacy, memoryFold, type MemoryEntry, type MemoryState, type Scope } from './model.ts'

/** The directories of one session's memory; either may be unknown. */
export interface Places {
  /** The project's data directory (`<root>/.llm`): undefined when the session has no project. */
  readonly project?: string
  /** The user-level memory directory (`<DSH home>/glm-hourness/memory`): undefined without the data row. */
  readonly user?: string
}

export const journalFile = (dir: string): string => join(dir, 'memory.jsonl')
const legacyFile = (dir: string): string => join(dir, 'memory.json')

export const dirOfScope = (places: Places, scope: Scope): string | undefined => scope === 'project' ? places.project : places.user

/** What kind of problem a note to the row's health is about; a later success under the same key clears it (`depth` stays: the session read the reporting depth once). */
export type NoteKey = 'directory' | 'lock' | 'io' | 'legacy' | 'index' | 'depth' | 'learning' | 'learn-notice' | 'main-agent'

/** Whether a source named in a memory exists, as far as the graph and the project's files say. */
export interface SourceCheck {
  /** `unchecked`: a node-shaped id the row could not look up (no graph row). `dead`: the node is dropped or superseded. */
  inspect(ref: ParsedRef): 'ok' | 'missing' | 'dead' | 'unchecked'
}

/** The nodes of a session's project graph, or why there are none to read. */
export type GraphRead =
  | { readonly ok: true, readonly nodes: ReadonlyMap<string, GraphNode> }
  /** `failure` is why a graph that is there could not be read; absent when the session has no graph. */
  | { readonly ok: false, readonly failure?: string }

export interface MemoryEnv {
  places(session: SessionLike | undefined): Places
  sources(session: SessionLike | undefined): Promise<SourceCheck>
  /** The project graph of the session, for the learning digest. */
  graph(session: SessionLike | undefined): Promise<GraphRead>
  now(): Date
  /** Tell the row what is wrong with one session's memory (Chinese, for the row health), or `undefined` that it is fine again. */
  note(sessionId: string | undefined, key: NoteKey, text: string | undefined): void
  /** The lock environment and the flush a test replaces. */
  readonly append?: Pick<AppendOptions, 'lock' | 'sync'>
}

// --- Reading ---------------------------------------------------------------

interface ScopeRead {
  readonly state: MemoryState
  /** Journal lines that could not be read. */
  readonly bad: number
  /** Bytes of the journal. */
  readonly size: number
  /** The state is the old `memory.json` converted; the next write migrates it. */
  readonly fromLegacy: boolean
  /** The old `memory.json` is still next to a journal that has the state already. */
  readonly leftover: boolean
}

export type ReadOutcome =
  | { readonly ok: true, readonly read: ScopeRead }
  | { readonly ok: false, readonly kind: 'journal' | 'legacy', readonly reason: string }

const missing = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

type Legacy = { readonly entries: readonly MemoryEntry[] } | { readonly error: string }

async function readLegacy(dir: string): Promise<Legacy | undefined> {
  let raw: string
  try {
    raw = await readFile(legacyFile(dir), 'utf8')
  }
  catch (error) {
    return missing(error) ? undefined : { error: messageOf(error) }
  }
  return convertLegacy(raw)
}

async function present(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

const stateOf = (entries: readonly MemoryEntry[]): MemoryState => ({ scope: 'project', entries: new Map(entries.map(entry => [entry.name, entry])) })

/** The folded journal of one scope; for the project, the old `memory.json` stands in until the journal exists. */
export async function readScope(scope: Scope, dir: string): Promise<ReadOutcome> {
  let reading
  try {
    reading = await readJournal(journalFile(dir), memoryFold(scope))
  }
  catch (error) {
    return { ok: false, kind: 'journal', reason: `${journalFile(dir)}: ${messageOf(error)}` }
  }
  const counted = { bad: reading.bad.length, size: reading.size }
  if (scope !== 'project') return { ok: true, read: { ...counted, state: reading.state, fromLegacy: false, leftover: false } }
  if (reading.exists) return { ok: true, read: { ...counted, state: reading.state, fromLegacy: false, leftover: await present(legacyFile(dir)) } }
  const legacy = await readLegacy(dir)
  if (legacy === undefined) return { ok: true, read: { ...counted, state: reading.state, fromLegacy: false, leftover: false } }
  if ('error' in legacy) return { ok: false, kind: 'legacy', reason: legacy.error }
  return { ok: true, read: { ...counted, state: stateOf(legacy.entries), fromLegacy: true, leftover: false } }
}

/** Both scopes of one session's places that exist. */
export interface Both {
  readonly project?: ReadOutcome
  readonly user?: ReadOutcome
}

export async function readBoth(places: Places): Promise<Both> {
  return {
    ...(places.project === undefined ? {} : { project: await readScope('project', places.project) }),
    ...(places.user === undefined ? {} : { user: await readScope('all', places.user) }),
  }
}

// --- Writing ---------------------------------------------------------------

/** What a plan decides under the lock: records to append, or a refusal of the caller's kind. */
export type PlanOutcome<Refusal> = { readonly records: readonly NewRecord[] } | { readonly refused: Refusal }

export type WriteResult<Refusal> =
  | { readonly status: 'ok', readonly records: readonly JournalRecord[], /** Why the old `memory.json` could not be renamed yet. */ readonly leftover?: string }
  | Exclude<AppendResult<Refusal>, { readonly status: 'ok' }>
  | { readonly status: 'legacy', readonly reason: string }

const LEGACY_UNREADABLE = Symbol('legacy unreadable')

/** Rename the old file away once its state is in the journal; the reason when that failed. */
async function retireLegacy(dir: string): Promise<string | undefined> {
  const from = legacyFile(dir)
  try {
    await rename(from, `${from}.migrated-${Date.now()}`)
    return undefined
  }
  catch (error) {
    return missing(error) ? undefined : messageOf(error)
  }
}

/**
 * Append what `plan` decides to the journal of one scope. The plan sees the
 * state as it is under the lock; for a project that still has only the old
 * `memory.json` that is the converted file, and the converted state goes
 * into the journal in front of the plan's records.
 */
export async function writeScope<Refusal>(
  scope: Scope,
  dir: string,
  plan: (state: MemoryState) => PlanOutcome<Refusal> | Promise<PlanOutcome<Refusal>>,
  options: Pick<AppendOptions, 'lock' | 'sync'> = {},
): Promise<WriteResult<Refusal>> {
  let unreadable = ''
  const result = await appendJournal<MemoryState, Refusal | typeof LEGACY_UNREADABLE>(journalFile(dir), memoryFold(scope), async (reading) => {
    let state = reading.state
    let base: NewRecord[] = []
    if (scope === 'project' && !reading.exists) {
      const legacy = await readLegacy(dir)
      if (legacy !== undefined) {
        if ('error' in legacy) {
          unreadable = legacy.error
          return { refused: LEGACY_UNREADABLE }
        }
        state = stateOf(legacy.entries)
        base = [baseRecord(legacy.entries)]
      }
    }
    const outcome = await plan(state)
    return 'refused' in outcome ? outcome : { records: [...base, ...outcome.records] }
  }, { directory: scope === 'project' ? 'project' : 'user', row: 'memory', ...options })
  if (result.status === 'refused') {
    return result.refused === LEGACY_UNREADABLE ? { status: 'legacy', reason: unreadable } : { status: 'refused', refused: result.refused }
  }
  if (result.status !== 'ok') return result
  const leftover = scope === 'project' ? await retireLegacy(dir) : undefined
  return leftover === undefined ? result : { ...result, leftover }
}

/** Pass a write's outcome to the row's health notes for the session. */
export function noteWrite(env: MemoryEnv, sessionId: string | undefined, result: WriteResult<unknown>): void {
  if (result.status === 'ok') {
    for (const key of ['directory', 'lock', 'io'] as const) env.note(sessionId, key, undefined)
    env.note(sessionId, 'legacy', result.leftover === undefined ? undefined : `旧文件还在，已迁移（改名没成功：${result.leftover}）`)
  }
  else if (result.status === 'busy' && result.lockLost) env.note(sessionId, 'lock', '锁被判陈旧过：有一次写入被放弃，由调用方重试')
  else if (result.status === 'io' && result.stage === 'directory') env.note(sessionId, 'directory', `不能准备项目的 .llm 目录（把 .llm/ 加进 .git/info/exclude，或建目录）：${result.message}；本项目范围的记忆暂时不能写`)
  else if (result.status === 'io') env.note(sessionId, 'io', `记忆流水写失败（${result.stage}）：${result.message}`)
  else if (result.status === 'legacy') env.note(sessionId, 'legacy', `旧记忆文件读不出：${result.reason}`)
}
