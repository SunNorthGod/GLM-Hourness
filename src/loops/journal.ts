/**
 * The loop board's change record (docs/ORCHESTRATION.md §18; loop board design
 * §9.2, §9.3): `.llm/loops/journal.jsonl`, one JSON object per line, appended
 * and never rewritten. Every line that concerns an entry carries the whole
 * entry as it stands after the write (and, for a script, the script's text), so
 * the state of an entry is read from the last such line of its id, and a line
 * that cannot be read costs only that one version.
 *
 * This file is the reading side and has no file system in it: the text of the
 * journal in, the lines, the unfinished last line and the history of each
 * entry out. The store (store.ts) reads the files and appends.
 */
import type { PersonEntry } from './model.ts'

export type LoopActor = 'human' | 'harness' | 'llm'

/** An entry in the state a record leaves it in, with what a restore needs. */
export interface EntryImage {
  readonly entry: PersonEntry
  /** One more for every write of the entry. */
  readonly rev: number
  readonly status: 'active' | 'deleted'
  /** SHA-256 of the bytes of the entry file the board wrote (entryFileText). */
  readonly fileSha256: string
  /** The script's text, for an entry that runs one. */
  readonly scriptText?: string
}

export interface JournalRecord {
  readonly seq: number
  readonly at: string
  readonly actor: LoopActor
  /** `add`, `edit`, `delete`, `restore`, `repin`, `adopt` (the person's entry, agreed), `external` (changed outside the board), `ack`; the proposal operations name a proposal in `id`. */
  readonly op: string
  readonly id?: string
  readonly before?: EntryImage
  readonly after?: EntryImage
  /** `external`: the digest of the entry file somebody else wrote. */
  readonly observed?: { readonly fileSha256: string }
  /** `ack`: the unreadable lines up to this line number are acknowledged. */
  readonly through?: number
  readonly via?: 'chat' | 'board' | 'repo'
  readonly note?: string
}

/** The operations after which the entry is as the person agreed to it (or deleted it). */
const AGREED = new Set(['add', 'edit', 'delete', 'restore', 'repin', 'adopt'])

const SHA256 = /^[0-9a-f]{64}$/
const PERSON_ID = /^u-[0-9a-f]{8}$/
const ACTORS: readonly unknown[] = ['human', 'harness', 'llm']

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function imageOf(value: unknown): EntryImage | undefined {
  if (!isRecord(value) || !isRecord(value.entry) || typeof value.entry.id !== 'string') return undefined
  if (!Number.isInteger(value.rev) || (value.rev as number) < 1) return undefined
  if (value.status !== 'active' && value.status !== 'deleted') return undefined
  if (typeof value.fileSha256 !== 'string' || !SHA256.test(value.fileSha256)) return undefined
  if (value.scriptText !== undefined && typeof value.scriptText !== 'string') return undefined
  return value as unknown as EntryImage
}

/** The record a line holds, or undefined when the line is not one this board could have written. */
function recordOf(text: string): JournalRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return undefined
  }
  if (!isRecord(value) || !Number.isInteger(value.seq) || (value.seq as number) < 1) return undefined
  if (typeof value.at !== 'string' || typeof value.op !== 'string' || !ACTORS.includes(value.actor)) return undefined
  if (value.id !== undefined && typeof value.id !== 'string') return undefined
  if (value.through !== undefined && !Number.isInteger(value.through)) return undefined
  if (value.op === 'external' && !(isRecord(value.observed) && typeof value.observed.fileSha256 === 'string' && SHA256.test(value.observed.fileSha256))) return undefined
  // A record that says what the person agreed to names the entry by its id and carries it whole; one without that cannot be replayed.
  if (AGREED.has(value.op) && !(typeof value.id === 'string' && PERSON_ID.test(value.id) && imageOf(value.after)?.entry.id === value.id)) return undefined
  return value as unknown as JournalRecord
}

export interface JournalLine {
  /** Counted from 1 over every complete line of the file, blank ones included. */
  readonly number: number
  readonly text: string
  /** Undefined: the line could not be read. */
  readonly record: JournalRecord | undefined
}

export interface JournalRead {
  /** The complete lines that are not blank. */
  readonly lines: readonly JournalLine[]
  /** The unfinished last line (it has no line break), or ''. */
  readonly tail: string
  /** Byte length of the complete lines: where the file is cut when the tail is dropped. */
  readonly completeBytes: number
  /** One past the highest sequence number of any readable line. */
  readonly nextSeq: number
}

export function parseJournal(raw: string): JournalRead {
  const end = raw.lastIndexOf('\n') + 1
  const complete = raw.slice(0, end)
  const lines = complete.split('\n').slice(0, -1).flatMap((text, index): JournalLine[] => text.trim() === '' ? [] : [{ number: index + 1, text, record: recordOf(text) }])
  const highest = Math.max(0, ...lines.flatMap(line => line.record === undefined ? [] : [line.record.seq]))
  return { lines, tail: raw.slice(end), completeBytes: Buffer.byteLength(complete), nextSeq: highest + 1 }
}

/** What the journal knows of one entry. */
export interface EntryHistory {
  readonly id: string
  /** The last record that says what the person agreed to (or that the entry was deleted). */
  readonly approved: JournalRecord & { readonly after: EntryImage }
  /** The entry as the agreed record before `approved` left it. */
  readonly previous: EntryImage | undefined
  /** The digests of entry files that records noted as written outside the board, so that one is noted once. */
  readonly observed: ReadonlySet<string>
}

/** The history of every entry the journal names. */
export function historyOf(lines: readonly JournalLine[]): ReadonlyMap<string, EntryHistory> {
  const found = new Map<string, { approved: EntryHistory['approved'], previous: EntryImage | undefined, observed: Set<string> }>()
  for (const { record } of lines) {
    if (record?.id === undefined) continue
    const held = found.get(record.id)
    if (record.op === 'external' && record.observed !== undefined) held?.observed.add(record.observed.fileSha256)
    if (!AGREED.has(record.op) || record.after === undefined) continue
    found.set(record.id, { approved: record as EntryHistory['approved'], previous: held?.approved.after, observed: held?.observed ?? new Set() })
  }
  return new Map([...found].map(([id, held]) => [id, { id, ...held }]))
}

/** The highest line number the person acknowledged with `/loops ack`; 0 when none. */
export function acknowledgedThrough(lines: readonly JournalLine[]): number {
  return Math.max(0, ...lines.flatMap(line => line.record?.op === 'ack' && line.record.through !== undefined ? [line.record.through] : []))
}
