/** Minimal JSON value types shared by the pure dialect layer and the guard rows. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }

/** The value as a JSON object, or an empty one: the shared shape guard for event data read by field name. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Strings in code point order, the order every serialization and every list uses. */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a, char => char.codePointAt(0) ?? 0)
  const y = Array.from(b, char => char.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(x.length, y.length); index++) {
    if (x[index] !== y[index]) return x[index] - y[index]
  }
  return x.length - y.length
}

/** The value with every object's keys in code point order and every undefined field gone, recursively: the shape a canonical serialization walks. */
export function canonicalSorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSorted)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(record).filter(key => record[key] !== undefined).sort(compareCodePoints).map(key => [key, canonicalSorted(record[key])]))
}

/** One serialization for one content: keys in code point order, no whitespace; the input of every digest. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalSorted(value))
}
