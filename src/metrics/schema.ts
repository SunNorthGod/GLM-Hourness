/**
 * The metrics journal's record format (metrics design §4): a fixed envelope
 * plus one closed field table per event kind. The tables live in
 * src/metrics/kinds/<namespace>.ts; this module holds the envelope rules,
 * the type grammar of the tables (§4.4), the line validator (the only gate,
 * §4.4) and the serializer. Field names and value lists are typed once in
 * src/shared/metrics.ts; every kinds table asserts, at compile time, that
 * the type its fields derive equals that vocabulary (the same
 * contract-check pattern the adapters use), so the two cannot drift.
 *
 * The field table is the privacy boundary (§4.4): ids, counts, booleans and
 * declared enums only; unknown keys, wrong types, arrays or maps beyond 32
 * entries and lines above 4096 bytes reject the whole event.
 */
import { METRICS_ID_PATTERN, type MetricsBy } from '../shared/metrics.ts'

/** The envelope's format version; raised only when a kind's fields change meaning (§4.1). */
export const FORMAT_VERSION = 1

export const METRICS_BY: readonly MetricsBy[] = ['host', 'graph', 'guard', 'rules', 'loops', 'execute', 'operate', 'glm', 'design', 'bootstrap', 'env']

/**
 * One field of a closed table. `type` is a scalar of the grammar below, a
 * tuple of enum values, or a one-level record whose members are declared
 * the same way (integer, boolean, id or enum only, §4.4).
 */
type FieldType =
  | 'int'
  | 'num'
  | 'bool'
  | 'id'
  | 'id[]'
  | 'int[]'
  | 'map'
  | readonly [string, ...string[]]
  | { readonly rec: readonly FieldSpec[] }

interface FieldSpec {
  readonly name: string
  readonly type: FieldType
  readonly optional?: true
}

/**
 * Compile-time equality of two types as mutual assignability, which under
 * `exactOptionalPropertyTypes` also separates `field?: type` from `field:
 * type | undefined`; the kinds tables use it as a contract check against
 * src/shared/metrics.ts (the same pattern as the adapter contract checks).
 */
export type Equal<A, B> = [A extends B ? true : false, B extends A ? true : false] extends readonly [true, true] ? true : false
/** Compile-time assertion that an `Equal<...>` holds. */
export type Expect<T extends true> = T

/** The TypeScript value of one field type, per the grammar in §4.4. */
type ValueOf<T extends FieldType> = T extends readonly [string, ...string[]]
  ? T[number]
  : T extends { readonly rec: readonly FieldSpec[] }
    ? BodyOf<T['rec']>
    : T extends 'int' | 'num'
      ? number
      : T extends 'bool'
        ? boolean
        : T extends 'id'
          ? string
          : T extends 'id[]'
            ? readonly string[]
            : T extends 'int[]'
              ? readonly number[]
              : T extends 'map'
                ? Readonly<Record<string, number | boolean | string>>
                : never

type OptionalKeys<F extends readonly FieldSpec[]> = {
  [K in F[number]['name']]: Extract<F[number], { readonly name: K }> extends { readonly optional: true } ? K : never
}[F[number]['name']]

type RequiredKeys<F extends readonly FieldSpec[]> = {
  [K in F[number]['name']]: Extract<F[number], { readonly name: K }> extends { readonly optional: true } ? never : K
}[F[number]['name']]

type PickedBody<F extends readonly FieldSpec[], K extends string> = {
  readonly [L in K]: ValueOf<Extract<F[number], { readonly name: L }>['type']>
}

/** The body type a field table derives: required fields required, the rest optional. */
type BodyOf<F extends readonly FieldSpec[]> = PickedBody<F, RequiredKeys<F>> & Partial<PickedBody<F, OptionalKeys<F>>>

/** A namespace's derived bodies, keyed by kind name; the kinds files check it against src/shared/metrics.ts. */
export type BodiesOf<K extends readonly KindTable[]> = { [T in K[number] as T['name']]: BodyOf<T['fields']> }

/** An id: no whitespace, no backslash, no non-ASCII (§4.4); the pattern is the shared contract's, so the sender rows shape their ids by the same one. */
export const ID_PATTERN = METRICS_ID_PATTERN
/** A writer id: the writer's own 8 hex digits, or a graph backfill's `bf-` plus the commit's first 7 (§4.1). */
export const WRITER_ID_PATTERN = /^(?:[0-9a-f]{8}|bf-[0-9a-f]{7})$/
/** A chain digest: the first 12 hex digits of a SHA-256 (§4.1). */
export const CHAIN_PATTERN = /^[0-9a-f]{12}$/
/** An instant: ISO 8601 UTC with milliseconds, exactly what `Date.toISOString()` gives (§4.1). */
export const AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** Arrays and maps hold at most 32 entries (§4.4). */
export const MAX_ENTRIES = 32

/** A line at most 4096 bytes after serialization; longer events are rejected (§4.4). */
export const MAX_LINE_BYTES = 4096

/** One kind's closed field table. */
export interface KindTable {
  readonly name: string
  readonly fields: readonly FieldSpec[]
}

/** An event as it is stored and read back: the envelope's fields, the body's fields of its kind in `body` (§4). */
export interface MetricsEvent {
  readonly s: number
  readonly k: string
  readonly at: string
  readonly w: string
  readonly n: number
  readonly h: string
  readonly v: string
  readonly by: MetricsBy
  readonly sid?: string
  readonly body: Readonly<Record<string, unknown>>
}

export type EventCheck = { readonly ok: true, readonly event: MetricsEvent } | { readonly ok: false, readonly field: string, readonly reason: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value)

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isEnum = (value: unknown, values: readonly string[]): value is string => typeof value === 'string' && values.includes(value)

const ENVELOPE_FIELDS: readonly FieldSpec[] = [
  { name: 's', type: 'int' },
  { name: 'k', type: 'id' },
  { name: 'at', type: 'id' },
  { name: 'w', type: 'id' },
  { name: 'n', type: 'int' },
  { name: 'h', type: 'id' },
  { name: 'v', type: 'id' },
  { name: 'by', type: 'id' },
  { name: 'sid', type: 'id', optional: true },
]

const checkScalar = (value: unknown, spec: FieldSpec): boolean => {
  const type = spec.type
  if (Array.isArray(type)) return isEnum(value, type)
  if (typeof type === 'object') return false // a record is checked by checkObject, never here
  switch (type) {
    case 'int':
    case 'num':
      return type === 'int' ? isInt(value) : typeof value === 'number' && Number.isFinite(value) && value >= 0
    case 'bool':
      return typeof value === 'boolean'
    case 'id':
      return isId(value)
    default:
      return false
  }
}

const checkList = (value: unknown, of: 'int' | 'id'): boolean => {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return false
  return value.every(item => (of === 'int' ? isInt(item) : isId(item)))
}

const checkMap = (value: unknown): boolean => {
  if (!isObject(value)) return false
  const keys = Object.keys(value)
  if (keys.length > MAX_ENTRIES) return false
  return keys.every((key) => {
    if (!ID_PATTERN.test(key)) return false
    const item = value[key]
    return typeof item === 'boolean' || isInt(item) || isId(item)
  })
}

const checkObject = (value: unknown, specs: readonly FieldSpec[]): boolean => {
  if (!isObject(value)) return false
  const names = new Set(specs.map(spec => spec.name))
  if (Object.keys(value).some(key => !names.has(key))) return false
  return specs.every((spec) => {
    const item = value[spec.name]
    if (item === undefined) return spec.optional === true
    const type = spec.type
    if (Array.isArray(type)) return isEnum(item, type)
    if (typeof type === 'object' && 'rec' in type) {
      const members = type.rec
      const memberTypes = new Set(['int', 'bool', 'id'])
      if (!members.every(member => typeof member.type === 'string' && memberTypes.has(member.type))) return false
      return checkObject(item, members)
    }
    return checkScalar(item, spec)
  })
}

const checkField = (value: unknown, spec: FieldSpec): boolean => {
  if (value === undefined) return spec.optional === true
  const type = spec.type
  if (Array.isArray(type)) return isEnum(value, type)
  if (typeof type === 'object' && 'rec' in type) return checkObject(value, type.rec)
  switch (type) {
    case 'int[]':
    case 'id[]':
      return checkList(value, type === 'id[]' ? 'id' : 'int')
    case 'map':
      return checkMap(value)
    default:
      return checkScalar(value, spec)
  }
}

const isFormatVersion = (value: unknown): value is number => value === FORMAT_VERSION

/**
 * Validate one stored line against a kind table: the envelope's fields sit
 * at the top level, the body's fields inside `body` (§4: "信封加正文" —
 * two layers; two sibling kinds declare a body field named `by`, so the
 * body needs its own layer). The envelope is checked in §4.1's field
 * order, then the body in its table's order; an unknown key rejects with
 * the field `other` (§4.2, the `reject` kind's `field`). Returns the first
 * problem only: the writer turns it into a `reject` event and the reader
 * drops the line.
 */
export function checkEvent(value: unknown, kinds: ReadonlyMap<string, KindTable>): EventCheck {
  if (!isObject(value)) return { ok: false, field: 'other', reason: 'not an object' }
  if (!isFormatVersion(value.s)) return { ok: false, field: 's', reason: 's is not the format version' }
  const kind = typeof value.k === 'string' ? kinds.get(value.k) : undefined
  if (kind === undefined) return { ok: false, field: 'k', reason: 'k is not a known kind' }
  if (!(typeof value.at === 'string' && AT_PATTERN.test(value.at) && Number.isFinite(Date.parse(value.at)))) return { ok: false, field: 'at', reason: 'at is not an ISO UTC instant with milliseconds' }
  if (!(typeof value.w === 'string' && WRITER_ID_PATTERN.test(value.w))) return { ok: false, field: 'w', reason: 'w is not a writer id' }
  if (!isInt(value.n) || value.n === 0) return { ok: false, field: 'n', reason: 'n is not a positive sequence number' }
  if (!(typeof value.h === 'string' && CHAIN_PATTERN.test(value.h))) return { ok: false, field: 'h', reason: 'h is not a chain digest' }
  if (!isId(value.v)) return { ok: false, field: 'v', reason: 'v is not a build stamp' }
  if (!(typeof value.by === 'string' && (METRICS_BY as readonly string[]).includes(value.by))) return { ok: false, field: 'by', reason: 'by is not a known submitter' }
  if (value.sid !== undefined && !isId(value.sid)) return { ok: false, field: 'sid', reason: 'sid is not an id' }
  const body = value.body
  if (!isObject(body)) return { ok: false, field: 'other', reason: 'the body layer is missing' }
  for (const spec of kind.fields) {
    if (!checkField(body[spec.name], spec)) return { ok: false, field: spec.name, reason: `${spec.name} does not hold its declared type` }
  }
  const known = new Set([...ENVELOPE_FIELDS.map(spec => spec.name), 'body'])
  for (const key of Object.keys(value)) {
    if (!known.has(key)) return { ok: false, field: 'other', reason: `${key} is not in the field table` }
  }
  const knownBody = new Set(kind.fields.map(spec => spec.name))
  for (const key of Object.keys(body)) {
    if (!knownBody.has(key)) return { ok: false, field: 'other', reason: `${key} is not in the field table` }
  }
  return { ok: true, event: value as unknown as MetricsEvent }
}

/**
 * Serialize one validated event: the same field order `storedEvent` lays
 * out, as the line's JSON text.
 */
export function serializeEvent(event: MetricsEvent, table: KindTable, options: { readonly chain?: true } = {}): string {
  const ordered: Record<string, unknown> = {
    s: event.s,
    k: event.k,
    at: event.at,
    w: event.w,
    n: event.n,
    v: event.v,
    by: event.by,
  }
  if (event.sid !== undefined) ordered.sid = event.sid
  const body: Record<string, unknown> = {}
  for (const spec of table.fields) {
    const value = event.body[spec.name]
    if (value !== undefined) body[spec.name] = value
  }
  ordered.body = body
  if (options.chain !== true) ordered.h = event.h
  return JSON.stringify(ordered)
}
