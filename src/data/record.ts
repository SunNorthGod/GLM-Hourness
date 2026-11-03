/**
 * The record of the append-only journals (M5 design §5.2): the shape every
 * line of a journal holds and the checks it must pass. Split from
 * src/data/journal.ts so that the reader of the browser (the lessons page,
 * ui/src/lessons/) can parse a line too: this file imports nothing.
 */

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type Actor = 'human' | 'llm' | 'harness'

/** Who and what caused a record: ids the host gave, never evidence. */
export interface RecordOrigin {
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

const ACTORS: readonly string[] = ['human', 'llm', 'harness']
const MAX_RELAY = 500
const MAX_REASON = 300

/** The origin fields a record may carry, in the order a writer keeps them. */
export const ORIGIN_KEYS = ['session', 'agent', 'tool', 'callId', 'commandId'] as const

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
