/**
 * The takeover journal (takeover design 0.6 §2.3, §9.1): `.llm/bootstrap/
 * journal.jsonl` of the project root, M5's append-only journal
 * (src/data/journal.ts: lock, `seq`, bad lines). Each record is
 * `{actor: 'harness', op: <type>, id: <takeover id>, data}`; the open
 * takeover, its path and the notes it already left are the fold of the
 * records. Opening runs under the journal's lock, so a project has at most
 * one open takeover: a second opener gets the open one back (§9.2, §9.4).
 * The journal only keeps the trail and points a resume at where it was; it
 * never stands for the human's consent.
 */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { appendJournal, readJournal, type Fold, type JournalRecord, type JsonValue, type NewRecord } from '../data/journal.ts'

export type TakeoverPath = 'new' | 'existing' | 'gaps'

const PATHS: readonly string[] = ['new', 'existing', 'gaps']

/** How the takeover was opened: `/hourness-init`, or `/wish`. */
type Trigger = 'init' | 'wish'

export interface OpenTakeover {
  readonly id: string
  readonly path: TakeoverPath
  /** The time of the `takeover-open` record: nodes first proposed at or after it belong to the takeover. */
  readonly openedAt: string
  readonly trigger: Trigger
  readonly graphDir: string
  /** The person's words of the latest `/wish` that gave any: the one the takeover opened with, or a later `takeover-wish`. */
  readonly wish?: string
  /** The `note` codes this takeover already recorded. */
  readonly noted: readonly string[]
  /** The two things the human agreed to, by question (`asked` records, §7.4). */
  readonly asked: readonly { readonly which: 'cost' | 'touch', readonly questionId: string }[]
}

interface TakeoverState {
  readonly open?: OpenTakeover
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The journal of a project root. */
export const journalPath = (root: string): string => join(root, '.llm', 'bootstrap', 'journal.jsonl')

/** The directory of one takeover's files (`scan.json` and the drafts). */
export const takeoverDir = (root: string, id: string): string => join(root, '.llm', 'bootstrap', id)

function opened(record: JournalRecord): OpenTakeover | string {
  const data = isRecord(record.data) ? record.data : {}
  const { path, trigger, graphDir, wish } = data
  if (typeof path !== 'string' || !PATHS.includes(path)) return 'takeover-open without a path'
  if (trigger !== 'init' && trigger !== 'wish') return 'takeover-open without a trigger'
  if (typeof graphDir !== 'string') return 'takeover-open without a graph directory'
  return { id: record.id, path: path as TakeoverPath, openedAt: record.at, trigger, graphDir, ...typeof wish === 'string' ? { wish } : {}, noted: [], asked: [] }
}

const TAKEOVER_FOLD: Fold<TakeoverState> = {
  empty: () => ({}),
  apply(state, record) {
    const open = state.open
    if (record.op === 'takeover-open') {
      if (open !== undefined) return { bad: `takeover ${open.id} is still open` }
      const next = opened(record)
      return typeof next === 'string' ? { bad: next } : { state: { open: next } }
    }
    // Every other record is about the takeover it names; one about another takeover changes nothing.
    if (open === undefined || record.id !== open.id) return { state }
    const data = isRecord(record.data) ? record.data : {}
    if (record.op === 'takeover-closed') return { state: {} }
    if (record.op === 'takeover-wish') return typeof data.text === 'string' ? { state: { open: { ...open, wish: data.text } } } : { bad: 'takeover-wish without a text' }
    if (record.op === 'takeover-path') return typeof data.to === 'string' && PATHS.includes(data.to) ? { state: { open: { ...open, path: data.to as TakeoverPath } } } : { bad: 'takeover-path without a path' }
    if (record.op === 'note' && typeof data.code === 'string') return { state: { open: { ...open, noted: [...open.noted, data.code] } } }
    if (record.op === 'asked') {
      const { which, questionId } = data
      return (which === 'cost' || which === 'touch') && typeof questionId === 'string' ? { state: { open: { ...open, asked: [...open.asked, { which, questionId }] } } } : { bad: 'asked without which and questionId' }
    }
    return { state }
  },
}

/** The open takeover of a project root; undefined when there is none. Rejects when the journal cannot be read. */
export async function openTakeoverOf(root: string): Promise<OpenTakeover | undefined> {
  return (await readJournal(journalPath(root), TAKEOVER_FOLD)).state.open
}

/** A new takeover id: `tk-` and 8 base-36 characters. */
const newId = (): string => `tk-${[...randomBytes(8)].map(byte => (byte % 36).toString(36)).join('')}`

export interface OpenRequest {
  readonly path: TakeoverPath
  /** The path decision's sentence (§3.4). */
  readonly because: string
  readonly trigger: Trigger
  readonly projectRoot: string
  readonly graphDir: string
  readonly head?: string
  readonly wish?: string
  readonly by?: NewRecord['by']
}

export type OpenOutcome =
  | { readonly kind: 'opened' | 'resumed', readonly takeover: OpenTakeover }
  | { readonly kind: 'io', readonly message: string }

/** Open a takeover, or hand back the one that is open (§9.2: the second opener resumes it). */
export async function openTakeover(root: string, request: OpenRequest): Promise<OpenOutcome> {
  const id = newId()
  const data: Record<string, JsonValue> = {
    path: request.path, because: request.because, trigger: request.trigger, projectRoot: request.projectRoot, graphDir: request.graphDir,
    ...request.head === undefined ? {} : { head: request.head },
    ...request.wish === undefined ? {} : { wish: request.wish },
  }
  const written = await appendJournal<TakeoverState, OpenTakeover>(journalPath(root), TAKEOVER_FOLD, (reading) => {
    const open = reading.state.open
    return open === undefined ? { records: [{ actor: 'harness', op: 'takeover-open', id, data, ...request.by === undefined ? {} : { by: request.by } }] } : { refused: open }
  }, { directory: 'project', row: 'bootstrap' })
  if (written.status === 'refused') return { kind: 'resumed', takeover: written.refused }
  if (written.status !== 'ok') return { kind: 'io', message: written.status === 'io' ? `${written.stage}: ${written.message}` : written.status === 'busy' ? '流水被别的写入占着' : written.message }
  const record = written.records[0]
  const takeover = record === undefined ? undefined : opened(record)
  return takeover === undefined || typeof takeover === 'string' ? { kind: 'io', message: '写下的接管记录读不回来' } : { kind: 'opened', takeover }
}

/** One record about a takeover, as the row hands it over. */
export interface TakeoverRecord {
  readonly op: 'setup' | 'scan' | 'takeover-path' | 'takeover-wish' | 'takeover-closed' | 'note' | 'asked' | 'trial'
  readonly data: Readonly<Record<string, JsonValue>>
}

/**
 * Append records about the open takeover `id`. Nothing is appended when it
 * is no longer the open one (closed meanwhile): `false`. An I/O failure
 * rejects; the caller reports it and goes on (§13: only opening must be written).
 */
export async function appendTakeover(root: string, id: string, records: readonly TakeoverRecord[], by?: NewRecord['by']): Promise<boolean> {
  if (records.length === 0) return true
  const written = await appendJournal<TakeoverState, 'closed'>(journalPath(root), TAKEOVER_FOLD, reading => reading.state.open?.id === id
    ? { records: records.map(record => ({ actor: 'harness', op: record.op, id, data: record.data, ...by === undefined ? {} : { by } })) }
    : { refused: 'closed' }, { directory: 'project', row: 'bootstrap' })
  if (written.status === 'ok') return true
  if (written.status === 'refused') return false
  throw new Error(written.status === 'io' ? `${written.stage}: ${written.message}` : written.status === 'busy' ? 'the takeover journal is locked by another writer' : written.message)
}

/** How recording one of the two things went: written, written before, the takeover is no longer open, or the journal could not take it. */
export type AskedOutcome =
  | { readonly kind: 'written' | 'already' | 'closed' }
  | { readonly kind: 'busy' | 'io', readonly message: string }

/**
 * Append `asked {which, questionId}` for the open takeover `id` (§7.4),
 * under the journal's lock: once per question, so a second hand-back of the
 * same agreement writes nothing more.
 */
export async function recordAsked(root: string, id: string, which: 'cost' | 'touch', questionId: string, by?: NewRecord['by']): Promise<AskedOutcome> {
  const written = await appendJournal<TakeoverState, 'already' | 'closed'>(journalPath(root), TAKEOVER_FOLD, (reading) => {
    const open = reading.state.open
    if (open?.id !== id) return { refused: 'closed' }
    if (open.asked.some(entry => entry.questionId === questionId)) return { refused: 'already' }
    return { records: [{ actor: 'harness', op: 'asked', id, data: { which, questionId }, ...by === undefined ? {} : { by } }] }
  }, { directory: 'project', row: 'bootstrap' })
  if (written.status === 'ok') return { kind: 'written' }
  if (written.status === 'refused') return { kind: written.refused }
  if (written.status === 'busy') return { kind: 'busy', message: 'the takeover journal is locked by another writer' }
  return { kind: 'io', message: written.status === 'io' ? `${written.stage}: ${written.message}` : written.message }
}
