/** Minimal JSON value types shared by the pure dialect layer and the guard rows. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }

/** The value as a JSON object, or an empty one: the shared shape guard for event data read by field name. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
