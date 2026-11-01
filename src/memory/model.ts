/**
 * The memory model (M5 design §3.1, §3.2, §3.4, §5.2, §5.4): an entry and
 * its two classes, how fast a fact fades, the checks every write goes
 * through, the fold of a memory journal into a state, and the records a
 * write appends.
 *
 * Preferences (`user`, `feedback`) are what the person said about
 * themselves or how they want work done: they do not fade and only the
 * person revokes them. Facts (`project`, `reference`) are leads to where the
 * project records something: they fade with a 14 day half-life unless they
 * are reviewed. A preference always has its credential, the person's own
 * words in `relay` or a human writer, so there is no such thing as a
 * preference an agent guessed; a journal line that says otherwise is a bad
 * line and the fold skips it.
 *
 * Pure functions: no clock (the time is a parameter, or the `at` of the
 * record being folded), no files, no Node built-ins, so the lessons page can
 * share the types. One journal holds one scope: the project's entries in
 * `<project>/.llm/memory.jsonl`, what is about the person in the user-level
 * `memory/memory.jsonl` (`d-memory-scope`).
 */
import { checkRefs, isGroupKey, parseRef, type ParsedRef } from '../data/evidence.ts'
import type { Actor, Fold, FoldStep, JournalRecord, JsonValue, NewRecord } from '../data/journal.ts'
import { findSecret } from '../data/secret-shape.ts'

const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const
export type MemoryType = typeof MEMORY_TYPES[number]
export type Scope = 'project' | 'all'
type Kind = 'preference' | 'fact'
const DEPTHS = ['concise', 'balanced', 'detailed'] as const
type Depth = typeof DEPTHS[number]

/** The one entry whose `value` the harness reads: how long the person wants reports to be (§3.7). */
const REPORTING_DEPTH = 'reporting-depth'

/** Who created an entry; an update does not change it, and the right to take a preference back depends on it. */
interface MemoryOrigin {
  readonly actor: Actor
  readonly session?: string
  readonly agent?: string
}

export interface MemoryEntry {
  /** kebab-case, unique within the scope. */
  readonly name: string
  /** `all` only for `user` and `feedback`: what is about the person. */
  readonly scope: Scope
  readonly type: MemoryType
  /** One line, at most 200 characters; what recall shows. */
  readonly description: string
  /** At most 4000 characters; `feedback` and `project` carry a Why line. */
  readonly body: string
  /** Where a fact lives, in the forms of §5.7; a `project` entry has at least one unless it was migrated. */
  readonly source: readonly string[]
  /** The person's own words. */
  readonly relay?: string
  /** Present, and false, when the words were not checked against the person's messages. */
  readonly relayChecked?: false
  /** Only `reporting-depth` has one. */
  readonly value?: Depth
  /** Computed from `type`, never given by a caller. */
  readonly kind: Kind
  /** A habit the agent asked about and the person agreed to: the question's id and what the person was asked. Set when the entry is created and never removed. */
  readonly confirmed?: { readonly ask: string, readonly question: string }
  /** Keys of the learning groups (§3.6) this entry settled; an update joins new keys to the old, at most five. */
  readonly learnedFrom?: readonly string[]
  /** Came from the old `memory.json`. */
  readonly legacy?: true
  readonly created: string
  readonly lastReviewed: string
  readonly reviews: number
  readonly origin: MemoryOrigin
  readonly status: 'active' | 'forgotten'
}

/** The entries of one scope by name, forgotten ones included (they can be restored). */
export interface MemoryState {
  readonly scope: Scope
  readonly entries: ReadonlyMap<string, MemoryEntry>
}

export const emptyMemory = (scope: Scope): MemoryState => ({ scope, entries: new Map() })

/** The id of a record about an entry: its name and its scope. */
export const memoryId = (scope: Scope, name: string): string => `${scope}:${name}`

/** What a refused write says: a code the caller maps to its tool error, the reason in English (it reaches the model that wrote it), the field at fault and the way out. */
export interface Refusal {
  readonly code: 'invalid' | 'ask_first' | 'secret_like' | 'bad_source' | 'similar' | 'preference_owner'
  readonly message: string
  readonly field?: string
  readonly hint?: string
}

const refuse = (code: Refusal['code'], message: string, field?: string, hint?: string): Refusal => ({
  code,
  message,
  ...(field === undefined ? {} : { field }),
  ...(hint === undefined ? {} : { hint }),
})
const invalid = (field: string | undefined, message: string, hint?: string): Refusal => refuse('invalid', message, field, hint)
const isRefusal = (value: object): value is Refusal => 'code' in value

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const listOf = (value: unknown): unknown[] | undefined => Array.isArray(value) ? value as unknown[] : undefined
const isMoment = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const isType = (value: unknown): value is MemoryType => typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
const isDepth = (value: unknown): value is Depth => typeof value === 'string' && (DEPTHS as readonly string[]).includes(value)
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length >= 1 && value.length <= max

export const classify = (type: MemoryType): Kind => type === 'user' || type === 'feedback' ? 'preference' : 'fact'

/** A preference needs the person's own words or a human writer; a fact needs nothing. */
const hasCredential = (type: MemoryType, actor: Actor, relay: string | undefined): boolean =>
  classify(type) === 'fact' || actor === 'human' || (relay !== undefined && relay.trim() !== '')

const DAY_MS = 86_400_000
const HALF_LIFE_DAYS = 14

/** 1 for a preference. A fact is 1 when it was last reviewed, halves every 14 days, and each review (ten count) adds 5%; never above 1. */
export function strength(entry: Pick<MemoryEntry, 'kind' | 'lastReviewed' | 'reviews'>, now: string): number {
  if (entry.kind === 'preference') return 1
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(entry.lastReviewed)) / DAY_MS)
  return Math.min(1, 0.5 ** (ageDays / HALF_LIFE_DAYS) * (1 + Math.min(entry.reviews, 10) * 0.05))
}

/** The words of a text: English by word, Chinese by adjacent pair of characters (a lone character stands for itself). */
function wordsOf(text: string): Set<string> {
  const words = new Set<string>()
  for (const run of text.toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? []) {
    if (/^[a-z0-9]/.test(run) || run.length === 1) words.add(run)
    else for (let index = 0; index + 1 < run.length; index += 1) words.add(run.slice(index, index + 2))
  }
  return words
}

/** Overlap of the words of name and description, 0 to 1 (Jaccard). */
export function similarity(a: Pick<MemoryEntry, 'name' | 'description'>, b: Pick<MemoryEntry, 'name' | 'description'>): number {
  const left = wordsOf(`${a.name} ${a.description}`)
  const right = wordsOf(`${b.name} ${b.description}`)
  const shared = [...left].filter(word => right.has(word)).length
  const union = left.size + right.size - shared
  return union === 0 ? 0 : shared / union
}

// --- Checking a write -------------------------------------------------------

interface Fields {
  readonly name: string
  readonly type: MemoryType
  readonly scope: Scope
  readonly description: string
  readonly body: string
  readonly source: readonly ParsedRef[]
  readonly relay?: string
  readonly value?: Depth
  readonly learnedFrom?: readonly string[]
}

/** A write that passed the checks; `confirmNew` lets a name close to an existing one through. */
export interface StoreRequest extends Fields {
  readonly confirmNew: boolean
}

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const WHY_LINE = /^[ \t]*(?:\*\*)?why:/im
const MAX_SOURCES = 5
const MAX_LEARNED = 5
const SOURCE_HINT = 'Where the fact lives: a project graph node id, a file path (optionally with §section), a commit id, or a URL.'
const ASK_FIRST_HINT = 'Only the user\'s own words make a preference. Do not store a habit you only guessed from their edits, and do not ask about it yet. If it is a fact the repo already records, store it as a project memory with its source.'

function resolveScope(type: MemoryType, scope: unknown): Refusal | Scope {
  if (scope !== undefined) {
    if (scope !== 'project' && scope !== 'all') return invalid('scope', 'scope must be "project" or "all"')
    if (scope === 'all' && classify(type) === 'fact') return invalid('scope', 'scope "all" is only for what is about the user (type user or feedback); project and reference memories belong to this project')
    return scope
  }
  if (type === 'feedback') {
    return invalid('scope', 'scope is required for type feedback', '"all" if it is about how the user likes to work in every project, "project" if it is a norm of this project')
  }
  return type === 'user' ? 'all' : 'project'
}

function sourceRefs(source: unknown, type: MemoryType): Refusal | ParsedRef[] {
  const list = source === undefined ? [] : listOf(source)
  if (list === undefined || list.length > MAX_SOURCES) return invalid('source', `source must be a list of at most ${MAX_SOURCES} items`)
  const refs: ParsedRef[] = []
  for (const [index, item] of list.entries()) {
    const parsed = typeof item === 'string' ? parseRef(item) : { invalid: 'each item must be text' }
    if ('invalid' in parsed) return invalid('source', `source[${index}]: ${parsed.invalid}`)
    refs.push(parsed)
  }
  return type === 'project' && refs.length === 0 ? refuse('bad_source', 'a project memory needs a source', 'source', SOURCE_HINT) : refs
}

function learnedKeys(keys: unknown): Refusal | string[] | undefined {
  if (keys === undefined) return undefined
  const list = listOf(keys)
  if (list === undefined || list.length > MAX_LEARNED || !list.every(key => typeof key === 'string' && isGroupKey(key))) {
    return invalid('learnedFrom', `learnedFrom must be a list of at most ${MAX_LEARNED} group keys, each one line of 1 to 80 characters`)
  }
  const unique = [...new Set(list as string[])]
  return unique.length === 0 ? undefined : unique
}

/** The rules of the field table of §3.2, the same for a tool call and for a record read from a journal. */
function validateFields(raw: Readonly<Record<string, unknown>>): Refusal | Fields {
  const { name, type, description, body, scope, value, relay, source, learnedFrom } = raw
  if (typeof name !== 'string' || name.length < 2 || name.length > 64 || !NAME_PATTERN.test(name)) {
    return invalid('name', 'name must be kebab-case: lower-case letters and digits joined by single hyphens, 2 to 64 characters')
  }
  if (!isType(type)) return invalid('type', `type must be one of ${MEMORY_TYPES.join(', ')}`)
  if (!isText(description, 200) || /[\r\n]/.test(description)) return invalid('description', 'description must be one line of 1 to 200 characters')
  if (!isText(body, 4000)) return invalid('body', 'body must be 1 to 4000 characters')
  if ((type === 'feedback' || type === 'project') && !WHY_LINE.test(body)) {
    return invalid('body', 'a feedback or project memory needs a line that starts with Why:', 'follow the fact with **Why:** and **How to apply:** lines')
  }
  const resolved = resolveScope(type, scope)
  if (typeof resolved === 'object') return resolved
  if (relay !== undefined && (typeof relay !== 'string' || relay.trim() === '' || relay.length > 500)) {
    return invalid('relay', 'relay must be the user\'s own words, 1 to 500 characters')
  }
  if (value !== undefined) {
    if (name !== REPORTING_DEPTH) return invalid('value', `value is only for the entry named ${REPORTING_DEPTH}`)
    if (!isDepth(value)) return invalid('value', `value must be one of ${DEPTHS.join(', ')}`)
    if (type !== 'user' || resolved !== 'all') return invalid('value', `${REPORTING_DEPTH} is a user entry for every project: type user, scope all`)
    if (relay === undefined) return invalid('value', `${REPORTING_DEPTH} needs the user's own words in relay`)
  }
  const refs = sourceRefs(source, type)
  if (!Array.isArray(refs)) return refs
  const keys = learnedKeys(learnedFrom)
  if (keys !== undefined && !Array.isArray(keys)) return keys
  return {
    name,
    type,
    scope: resolved,
    description,
    body,
    source: refs,
    ...(relay === undefined ? {} : { relay }),
    ...(isDepth(value) ? { value } : {}),
    ...(keys === undefined ? {} : { learnedFrom: keys }),
  }
}

/** The first text field that looks like a secret, or the first source that is not well formed or looks like one. */
function secretIn(fields: Fields): Refusal | undefined {
  for (const field of ['name', 'body', 'description', 'relay'] as const) {
    const text = fields[field]
    const found = text === undefined ? undefined : findSecret(text)
    if (found !== undefined) return refuse('secret_like', found.message, field)
  }
  const checked = checkRefs(fields.source.map(ref => ref.text), 'source')
  return checked.ok ? undefined : refuse(checked.code, `source[${checked.index}]: ${checked.message}`, 'source')
}

const STORE_KEYS: readonly string[] = ['name', 'type', 'description', 'body', 'scope', 'value', 'relay', 'source', 'learnedFrom', 'confirmNew']

/**
 * The first three steps of `memory_store` after the caller is known to be a
 * root agent (§3.2): the field table, then the user's words for a
 * preference, then the secret check. Whether the named sources exist, the
 * entry already there and the entries it resembles are for `checkSourceKnown`
 * and `judgeStore`.
 */
export function checkStore(args: unknown): StoreRequest | Refusal {
  if (!isObject(args)) return invalid(undefined, 'arguments must be an object')
  const extra = Object.keys(args).find(key => !STORE_KEYS.includes(key))
  if (extra !== undefined) return invalid(extra, `unknown field ${extra}`)
  if (args.confirmNew !== undefined && typeof args.confirmNew !== 'boolean') return invalid('confirmNew', 'confirmNew must be true or false')
  const fields = validateFields(args)
  if (isRefusal(fields)) return fields
  if (classify(fields.type) === 'preference' && fields.relay === undefined) {
    return refuse('ask_first', 'a preference needs the user\'s own words in relay', 'relay', ASK_FIRST_HINT)
  }
  return secretIn(fields) ?? { ...fields, confirmNew: args.confirmNew === true }
}

const recognised = (ref: ParsedRef, known: (ref: ParsedRef) => boolean): boolean =>
  ref.kind === 'commit' || ref.kind === 'url' || ((ref.kind === 'node' || ref.kind === 'other') && known(ref))

/**
 * A `project` memory needs one source that can be recognised: a commit id or
 * a URL by their form, a node id of the graph or a file under the project
 * through `known`, which only the caller can answer.
 */
export function checkSourceKnown(refs: readonly ParsedRef[], known: (ref: ParsedRef) => boolean): Refusal | undefined {
  if (refs.some(ref => recognised(ref, known))) return undefined
  return refuse('bad_source', `none of the sources is a known node id, an existing file, a commit id or a URL: ${refs.map(ref => ref.text).join('; ')}`, 'source', SOURCE_HINT)
}

const SIMILAR_AT = 0.6

/** At most three active entries of the same type that read like the request: the words of name and description overlap by 0.6, or a source is shared. */
function neighbours(state: MemoryState, request: StoreRequest): MemoryEntry[] {
  const sources = new Set(request.source.map(ref => ref.text))
  return [...state.entries.values()]
    .filter(entry => entry.status === 'active' && entry.type === request.type && entry.name !== request.name)
    .map(entry => ({ entry, score: similarity(entry, request), shared: entry.source.some(item => sources.has(item)) }))
    .filter(({ score, shared }) => score >= SIMILAR_AT || shared)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ entry }) => entry)
}

/**
 * Step 5 of `memory_store` on the entries as they are under the lock: the
 * name of an active entry is an update, which must keep the type (a
 * preference does not become a fact that fades); a new name close to an
 * existing entry is refused as `similar` unless `confirmNew`.
 */
export function judgeStore(state: MemoryState, request: StoreRequest): Refusal | { readonly updated: boolean } {
  const existing = state.entries.get(request.name)
  if (existing?.status === 'active') {
    return existing.type === request.type
      ? { updated: true }
      : invalid('type', `${request.name} already exists as type ${existing.type}; a memory keeps its type`)
  }
  const close = request.confirmNew ? [] : neighbours(state, request)
  if (close.length === 0) return { updated: false }
  return refuse('similar', `similar to: ${close.map(entry => `${entry.name} (${entry.type}): ${entry.description}`).join('; ')}`, 'name', 'update one of them by storing with its name, or pass confirmNew: true')
}

// --- Who may take a preference back ----------------------------------------

/** The writer of a record, as far as the right to revoke depends on it. */
interface Who {
  readonly actor: Actor
  readonly relay?: string
  readonly session?: string
  readonly agent?: string
}

/**
 * Only the person revokes a preference: a human writer, or an agent that
 * quotes the person's words. One exception, for an agent correcting its own
 * mistake: the same agent in the same session as the entry's `origin` may
 * forget it without words, unless the person confirmed the habit. The test
 * reads `origin`, which an update leaves alone, so an update cannot hand the
 * entry over. Facts go without words.
 */
export function revokeRefusal(entry: MemoryEntry, who: Who, op: 'forget' | 'restore'): Refusal | undefined {
  if (entry.kind === 'fact' || who.actor === 'human' || (who.relay !== undefined && who.relay.trim() !== '')) return undefined
  const own = op === 'forget' && entry.confirmed === undefined && entry.origin.actor === 'llm' && who.actor === 'llm'
    && entry.origin.session !== undefined && entry.origin.session === who.session && entry.origin.agent === who.agent
  if (own) return undefined
  const verb = op === 'forget' ? 'revokes' : 'restores'
  return refuse('preference_owner', `only the user ${verb} a preference`, undefined, `only the user ${verb} a preference: quote their words in relay`)
}

// --- Records ---------------------------------------------------------------

/** Who a record is written for: the actor and the ids the host gave. */
export interface Writer {
  readonly actor: Actor
  readonly by?: NonNullable<NewRecord['by']>
}

/** The JSON form of an entry, the same in a snapshot and in a base. */
const snapshot = (entry: MemoryEntry): JsonValue => JSON.parse(JSON.stringify(entry)) as JsonValue

/** A `store` record. `relayChecked` is false when the words were not checked against the person's messages, true when they were, absent when nothing was to be checked. */
export function storeRecord(request: StoreRequest, writer: Writer & { readonly relayChecked?: boolean }): NewRecord<'store'> {
  return {
    actor: writer.actor,
    ...(request.relay === undefined ? {} : { relay: request.relay }),
    ...(writer.by === undefined ? {} : { by: writer.by }),
    op: 'store',
    id: memoryId(request.scope, request.name),
    data: {
      name: request.name,
      scope: request.scope,
      type: request.type,
      description: request.description,
      body: request.body,
      source: request.source.map(ref => ref.text),
      ...(request.value === undefined ? {} : { value: request.value }),
      ...(request.learnedFrom === undefined ? {} : { learnedFrom: request.learnedFrom }),
      ...(writer.relayChecked === undefined ? {} : { relayChecked: writer.relayChecked }),
    },
  }
}

/** A `forget` or `restore` record; its data is the entry as it was, so a deletion can be undone. */
export function revokeRecord<Op extends 'forget' | 'restore'>(op: Op, entry: MemoryEntry, reason: string, writer: Writer & { readonly relay?: string }): NewRecord<Op> {
  return {
    actor: writer.actor,
    ...(writer.relay === undefined ? {} : { relay: writer.relay }),
    ...(writer.by === undefined ? {} : { by: writer.by }),
    op,
    id: memoryId(entry.scope, entry.name),
    reason,
    data: snapshot(entry),
  }
}

/** The harness's record of facts that a query returned: each one counts as reviewed. */
export const reviewRecord = (names: readonly string[]): NewRecord<'review'> => ({ actor: 'harness', op: 'review', id: '*', data: { names } })

/** The first record of a journal that replaces an old `memory.json`: the whole converted state. */
export const baseRecord = (entries: readonly MemoryEntry[]): NewRecord<'base'> => ({ actor: 'harness', op: 'base', id: '*', data: { entries: entries.map(snapshot) } })

// --- Folding ---------------------------------------------------------------

/** The operations a memory journal knows and who may write each; the same list as the harness's rights in design §7.5. */
const WRITERS: ReadonlyMap<string, readonly Actor[]> = new Map([
  ['base', ['harness']],
  ['store', ['human', 'llm']],
  ['review', ['harness']],
  ['forget', ['human', 'llm']],
  ['restore', ['human', 'llm']],
])

const originOf = (record: JournalRecord): MemoryOrigin => ({
  actor: record.actor,
  ...(record.by?.session === undefined ? {} : { session: record.by.session }),
  ...(record.by?.agent === undefined ? {} : { agent: record.by.agent }),
})

const whoOf = (record: JournalRecord): Who => ({
  ...originOf(record),
  ...(record.relay === undefined ? {} : { relay: record.relay }),
})

function withEntries(state: MemoryState, changed: readonly MemoryEntry[]): FoldStep<MemoryState> {
  const entries = new Map(state.entries)
  for (const entry of changed) entries.set(entry.name, entry)
  return { state: { scope: state.scope, entries } }
}

/** An entry as a snapshot stores it (a base, a forget): every field, checked against the scope of the journal; the class is computed, not trusted. */
function parseEntry(raw: unknown, scope: Scope): MemoryEntry | string {
  if (!isObject(raw)) return 'not an object'
  const { name, type, description, body, source, relay, relayChecked, value, confirmed, learnedFrom, legacy, created, lastReviewed, reviews, origin, status } = raw
  if (typeof name !== 'string' || name.length < 2 || name.length > 64 || !NAME_PATTERN.test(name)) return 'name is not kebab-case'
  if (!isType(type)) return 'type is unknown'
  if (raw.scope !== scope) return `scope is not ${scope}`
  if (!isText(description, 200) || /[\r\n]/.test(description)) return 'description is not one line of 1 to 200 characters'
  if (!isText(body, 4000)) return 'body is not 1 to 4000 characters'
  const sources = listOf(source)
  if (sources === undefined || sources.length > MAX_SOURCES || !sources.every(item => typeof item === 'string')) return 'source is not a list of text'
  if (relay !== undefined && !isText(relay, 500)) return 'relay is not text of at most 500 characters'
  if (relayChecked !== undefined && relayChecked !== false) return 'relayChecked is not false'
  if (value !== undefined && !isDepth(value)) return 'value is not a reporting depth'
  if (confirmed !== undefined && !(isObject(confirmed) && typeof confirmed.ask === 'string' && typeof confirmed.question === 'string')) return 'confirmed is not a question'
  const keys = learnedFrom === undefined ? [] : listOf(learnedFrom)
  if (keys === undefined || keys.length > MAX_LEARNED || !keys.every(key => typeof key === 'string' && isGroupKey(key))) return 'learnedFrom is not a list of group keys'
  if (legacy !== undefined && legacy !== true) return 'legacy is not true'
  if (!isMoment(created) || !isMoment(lastReviewed)) return 'created or lastReviewed is not a time'
  if (typeof reviews !== 'number' || !Number.isInteger(reviews) || reviews < 0) return 'reviews is not a count'
  if (!isObject(origin) || (origin.actor !== 'human' && origin.actor !== 'llm' && origin.actor !== 'harness')
    || (origin.session !== undefined && typeof origin.session !== 'string') || (origin.agent !== undefined && typeof origin.agent !== 'string')) {
    return 'origin is not a writer'
  }
  if (status !== 'active' && status !== 'forgotten') return 'status is not active or forgotten'
  if (!hasCredential(type, origin.actor, relay)) return 'a preference without the user\'s own words'
  return {
    name,
    scope,
    type,
    description,
    body,
    source: sources,
    ...(relay === undefined ? {} : { relay }),
    ...(relayChecked === undefined ? {} : { relayChecked }),
    ...(value === undefined ? {} : { value }),
    kind: classify(type),
    ...(confirmed === undefined ? {} : { confirmed: confirmed as { ask: string, question: string } }),
    ...(keys.length === 0 ? {} : { learnedFrom: keys as string[] }),
    ...(legacy === undefined ? {} : { legacy }),
    created,
    lastReviewed,
    reviews,
    origin: {
      actor: origin.actor,
      ...(typeof origin.session === 'string' ? { session: origin.session } : {}),
      ...(typeof origin.agent === 'string' ? { agent: origin.agent } : {}),
    },
    status,
  }
}

function applyBase(state: MemoryState, record: JournalRecord): FoldStep<MemoryState> {
  if (record.id !== '*') return { bad: 'a base is about the file: its id is *' }
  if (state.entries.size > 0) return { bad: 'a base starts a journal; this one has entries already' }
  const list = isObject(record.data) ? listOf(record.data.entries) : undefined
  if (list === undefined) return { bad: 'data.entries is not a list' }
  const entries = new Map<string, MemoryEntry>()
  for (const [index, item] of list.entries()) {
    const entry = parseEntry(item, state.scope)
    if (typeof entry === 'string') return { bad: `entries[${index}]: ${entry}` }
    if (entries.has(entry.name)) return { bad: `entries[${index}]: ${entry.name} appears twice` }
    entries.set(entry.name, entry)
  }
  return { state: { scope: state.scope, entries } }
}

/** The six fields a write controls, the ones an update replaces. */
function writtenFields(fields: Fields, unchecked: boolean): Pick<MemoryEntry, 'description' | 'body' | 'source' | 'relay' | 'relayChecked' | 'value'> {
  return {
    description: fields.description,
    body: fields.body,
    source: fields.source.map(ref => ref.text),
    ...(fields.relay === undefined ? {} : { relay: fields.relay }),
    ...(unchecked ? { relayChecked: false as const } : {}),
    ...(fields.value === undefined ? {} : { value: fields.value }),
  }
}

/** A new entry: created, last reviewed and written by whoever wrote the record, with no reviews yet (writing is not reviewing). */
function newEntry(fields: Fields, record: JournalRecord, unchecked: boolean): MemoryEntry {
  return {
    name: fields.name,
    scope: fields.scope,
    type: fields.type,
    ...writtenFields(fields, unchecked),
    kind: classify(fields.type),
    ...(fields.learnedFrom === undefined ? {} : { learnedFrom: fields.learnedFrom }),
    created: record.at,
    lastReviewed: record.at,
    reviews: 0,
    origin: originOf(record),
    status: 'active',
  }
}

/**
 * The same name written again (§3.1). `created`, `origin`, `confirmed`,
 * `legacy` and the identity fields stay: they say who made the entry and
 * whether the person agreed to it, and a rewrite must not be able to change
 * either. The six fields the writer controls are replaced by the new
 * record's, new group keys join the old ones (five at most), and the write
 * counts as one review.
 */
function revised(existing: MemoryEntry, fields: Fields, record: JournalRecord, unchecked: boolean): MemoryEntry {
  const { description: _description, body: _body, source: _source, relay: _relay, relayChecked: _relayChecked, value: _value, learnedFrom: _learnedFrom, ...kept } = existing
  const keys = [...new Set([...(existing.learnedFrom ?? []), ...(fields.learnedFrom ?? [])])].slice(0, MAX_LEARNED)
  return {
    ...kept,
    ...writtenFields(fields, unchecked),
    ...(keys.length === 0 ? {} : { learnedFrom: keys }),
    lastReviewed: record.at,
    reviews: existing.reviews + 1,
  }
}

function applyStore(state: MemoryState, record: JournalRecord): FoldStep<MemoryState> {
  const data = record.data
  if (!isObject(data)) return { bad: 'data is not an object' }
  if (data.ask !== undefined) return { bad: 'the record names a question that does not exist' }
  if (data.relayChecked !== undefined && typeof data.relayChecked !== 'boolean') return { bad: 'relayChecked is not a boolean' }
  const fields = validateFields({ ...data, relay: record.relay })
  if (isRefusal(fields)) return { bad: `${fields.field ?? 'record'}: ${fields.message}` }
  if (fields.scope !== state.scope) return { bad: `the entry belongs to scope ${fields.scope}; this journal holds scope ${state.scope}` }
  if (record.id !== memoryId(state.scope, fields.name)) return { bad: `id is not ${memoryId(state.scope, fields.name)}` }
  if (!hasCredential(fields.type, record.actor, fields.relay)) return { bad: 'a preference without the user\'s own words' }
  const unchecked = data.relayChecked === false
  const existing = state.entries.get(fields.name)
  if (existing?.status !== 'active') return withEntries(state, [newEntry(fields, record, unchecked)])
  if (existing.type !== fields.type) return { bad: `type ${fields.type} differs from the type ${existing.type} of the active entry` }
  return withEntries(state, [revised(existing, fields, record, unchecked)])
}

function applyReview(state: MemoryState, record: JournalRecord): FoldStep<MemoryState> {
  if (record.id !== '*') return { bad: 'a review is about the file: its id is *' }
  const names = isObject(record.data) ? listOf(record.data.names) : undefined
  if (names === undefined || names.length === 0 || !names.every(name => typeof name === 'string')) return { bad: 'data.names is not a list of names' }
  const due = [...new Set(names)]
    .flatMap((name) => {
      const entry = state.entries.get(name)
      return entry?.status === 'active' && entry.kind === 'fact' ? [{ ...entry, lastReviewed: record.at, reviews: entry.reviews + 1 }] : []
    })
  return withEntries(state, due)
}

function applyRevoke(state: MemoryState, record: JournalRecord, op: 'forget' | 'restore'): FoldStep<MemoryState> {
  const prefix = `${state.scope}:`
  if (!record.id.startsWith(prefix)) return { bad: `id is not an entry of scope ${state.scope}` }
  const name = record.id.slice(prefix.length)
  const entry = state.entries.get(name)
  if (op === 'forget' ? entry?.status !== 'active' : entry?.status !== 'forgotten') {
    return { bad: op === 'forget' ? `no active entry named ${name}` : `entry ${name} is not forgotten` }
  }
  const refusal = entry === undefined ? undefined : revokeRefusal(entry, whoOf(record), op)
  if (refusal !== undefined) return { bad: refusal.hint ?? refusal.message }
  return withEntries(state, entry === undefined ? [] : [{ ...entry, status: op === 'forget' ? 'forgotten' : 'active' }])
}

/** One record applied to a state, or why it does not hold. Pure: the time is the record's `at`. */
export function applyRecord(state: MemoryState, record: JournalRecord): FoldStep<MemoryState> {
  const writers = WRITERS.get(record.op)
  if (writers === undefined) return { bad: `unknown operation ${record.op}` }
  if (!writers.includes(record.actor)) return { bad: `${record.op} records are not written by ${record.actor}` }
  switch (record.op) {
    case 'base': return applyBase(state, record)
    case 'store': return applyStore(state, record)
    case 'review': return applyReview(state, record)
    case 'forget': return applyRevoke(state, record, 'forget')
    // The table above admits only these five operations.
    default: return applyRevoke(state, record, 'restore')
  }
}

const FOLDS: Readonly<Record<Scope, Fold<MemoryState>>> = {
  project: { empty: () => emptyMemory('project'), apply: applyRecord },
  all: { empty: () => emptyMemory('all'), apply: applyRecord },
}

/** The fold of a memory journal of one scope. The same object every time: the journal's read cache tells folds apart by identity. */
export const memoryFold = (scope: Scope): Fold<MemoryState> => FOLDS[scope]

// --- The old memory.json ---------------------------------------------------

/** The name an old entry gets: its id as kebab-case, `legacy-` in front when too little is left, a number after it when the name is taken. */
function legacyName(id: string, taken: Set<string>): string {
  let base = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (base.length < 2) base = `legacy-${base === '' ? 'entry' : base}`
  base = base.slice(0, 60).replace(/-+$/, '')
  let name = base
  for (let number = 2; taken.has(name); number += 1) name = `${base}-${number}`
  taken.add(name)
  return name
}

/**
 * The old store (`memory.json`, version 1) as facts without a source: type
 * `project`, `legacy`, dates and counts as they were, the first line of the
 * text as the description, the tags as a last line of the body. A file that
 * cannot be read is an error, never an empty store: the next save would
 * overwrite everything that was remembered.
 */
export function convertLegacy(raw: string): { readonly entries: readonly MemoryEntry[] } | { readonly error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    return { error: `not JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!isObject(parsed) || parsed.version !== 1) return { error: 'unsupported format: expected version 1' }
  const list = listOf(parsed.entries)
  if (list === undefined) return { error: 'unsupported format: entries is not a list' }
  const taken = new Set<string>()
  const entries: MemoryEntry[] = []
  for (const [index, item] of list.entries()) {
    const where = `entries[${index}]`
    if (!isObject(item)) return { error: `${where} is not an object` }
    const { id, text, tags, created: made, lastReviewed, reviews } = item
    if (typeof id !== 'string' || id.trim() === '') return { error: `${where}.id is not text` }
    if (typeof text !== 'string') return { error: `${where}.text is not text` }
    const labels = tags === undefined ? [] : listOf(tags)
    if (labels === undefined || !labels.every(tag => typeof tag === 'string')) return { error: `${where}.tags is not a list of text` }
    if (!isMoment(made) || !isMoment(lastReviewed)) return { error: `${where} has a date that is not a time` }
    if (typeof reviews !== 'number' || !Number.isInteger(reviews) || reviews < 0) return { error: `${where}.reviews is not a count` }
    const first = text.split('\n').map(line => line.trim()).find(line => line !== '') ?? id.trim()
    const tagLine = labels.length === 0 ? '' : `\nTags: ${labels.join(', ')}`
    entries.push({
      name: legacyName(id, taken),
      scope: 'project',
      type: 'project',
      description: first.length > 200 ? `${first.slice(0, 199)}…` : first,
      body: `${text.trim() === '' ? id.trim() : text.trimEnd()}${tagLine}`.slice(0, 4000),
      source: [],
      kind: 'fact',
      legacy: true,
      created: made,
      lastReviewed,
      reviews,
      origin: { actor: 'harness' },
      status: 'active',
    })
  }
  return { entries }
}
