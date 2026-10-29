/** Minimal JSON value types shared by the pure dialect layer and the guard rows. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }
