/**
 * The quota journal (docs/DESIGN.md §2.4, §4.5): `<home>/audit/quota.jsonl`
 * in the user-level directory, one JSON object per line, append-only. The
 * quota belongs to the account, not to a project, so it stays out of the
 * project's `.llm/`. Four kinds of record, none of which holds a token, a
 * key or a request header: a `reading` (the parsed rows of one answer), a
 * `failure` (the reason code of a read that gave none), an `upstream-limit`
 * (a 429 of the model route that says the quota is spent) and a
 * `login-rejected` (the server refused the login, with the fingerprint of
 * the login token that was refused).
 *
 * A write never throws and a failed one is reported once per failure kind on
 * the console, as the row journals of src/memory/audit.ts do. Every record
 * this instance wrote is also kept in memory, so a view still sees it when
 * the file could not take it. Reading takes the last 256 KiB of the file,
 * skips lines that are not valid records and counts them, and reads the file
 * again only when its size or modification time changed.
 */
import { createHash } from 'node:crypto'
import { appendFile, mkdir, open, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseLimitRow, ROWS_MAX, type QuotaLimitRow } from './quota-parse.ts'
import { PROJECT_TOKEN_CODES } from './zcode-wire.ts'

export type QuotaRecord =
  | { readonly at: string, readonly kind: 'reading', readonly level?: string, readonly limits: readonly QuotaLimitRow[], readonly dropped: number, readonly keys?: readonly string[] }
  | { readonly at: string, readonly kind: 'failure', readonly reason: string, readonly keys?: readonly string[] }
  | { readonly at: string, readonly kind: 'upstream-limit', readonly code: string, readonly until?: string }
  | { readonly at: string, readonly kind: 'login-rejected', readonly path: 'model' | 'mint', readonly status?: 401 | 403, readonly code?: string, readonly login?: string }

/** A record with its time in epoch milliseconds. */
export interface StoredRecord {
  readonly atMs: number
  readonly record: QuotaRecord
}

export interface JournalRead {
  /** The records in the tail of the file, then the ones only this instance holds. */
  readonly records: readonly StoredRecord[]
  /** Lines of the tail that are not valid records. */
  readonly skipped: number
  /** The file's size in bytes; 0 when it does not exist. */
  readonly size: number
}

interface QuotaFileInfo {
  readonly size: number
  readonly mtimeMs: number
}

/** The filesystem the journal goes through; tests give their own. */
export interface QuotaFs {
  mkdir(path: string): Promise<void>
  appendFile(path: string, data: string): Promise<void>
  /** The file's size and modification time; undefined when it does not exist. */
  stat(path: string): Promise<QuotaFileInfo | undefined>
  /** The last `bytes` bytes of the file as text. */
  readTail(path: string, bytes: number): Promise<string>
}

const isMissing = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

export const nodeQuotaFs: QuotaFs = {
  mkdir: async path => { await mkdir(path, { recursive: true }) },
  appendFile: (path, data) => appendFile(path, data),
  stat: async path => {
    try {
      const info = await stat(path)
      return { size: info.size, mtimeMs: info.mtimeMs }
    }
    catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  },
  readTail: async (path, bytes) => {
    const file = await open(path, 'r')
    try {
      const { size } = await file.stat()
      const length = Math.min(size, bytes)
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await file.read(buffer, 0, length, size - length)
      return buffer.toString('utf8', 0, bytesRead)
    }
    finally {
      await file.close()
    }
  },
}

/** How much of the end of the file a view reads. */
const JOURNAL_TAIL_BYTES = 256 * 1024
/** Records this instance keeps in memory beside the file. */
const LOCAL_MAX = 64
const LEVEL_MAX = 32
const REASON_MAX = 120
const KEYS_MAX = 16
const HEX16 = /^[0-9a-f]{16}$/
const LIMIT_CODE = /^\d{4}$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const keysOf = (value: unknown): readonly string[] | undefined => (Array.isArray(value) && value.length <= KEYS_MAX && value.every(key => typeof key === 'string') ? value : undefined)

/** `<home>/audit/quota.jsonl`, with the separators of the home. */
export function quotaJournalPath(home: string): string {
  return join(home, 'audit', 'quota.jsonl')
}

/**
 * The fingerprint of a login token: the first 16 hex digits of its SHA-256,
 * after the `Bearer ` prefix and the blanks around it are removed (the
 * project token client normalises the token the same way). It names which
 * login was refused and cannot be turned back into the token.
 */
export function loginFingerprintOf(loginToken: string): string {
  return createHash('sha256').update(loginToken.trim().replace(/^Bearer\s+/iu, ''), 'utf8').digest('hex').slice(0, 16)
}

/** The record when `value` is one of the four kinds with valid members; otherwise undefined. */
function recordOf(value: unknown): QuotaRecord | undefined {
  if (!isRecord(value) || !isTime(value.at)) return undefined
  const at = value.at
  const keys = keysOf(value.keys)
  switch (value.kind) {
    case 'reading': {
      const { limits, dropped, level } = value
      if (!Array.isArray(limits) || limits.length < 1 || limits.length > ROWS_MAX) return undefined
      if (typeof dropped !== 'number' || !Number.isInteger(dropped) || dropped < 0) return undefined
      if (level !== undefined && (typeof level !== 'string' || level.length < 1 || level.length > LEVEL_MAX)) return undefined
      const rows = limits.map((row: unknown) => parseLimitRow(row, Date.parse(at)))
      if (rows.some(row => row === undefined)) return undefined
      return { at, kind: 'reading', ...(level === undefined ? {} : { level }), limits: rows as QuotaLimitRow[], dropped, ...(keys === undefined ? {} : { keys }) }
    }
    case 'failure':
      if (typeof value.reason !== 'string' || value.reason.length < 1 || value.reason.length > REASON_MAX) return undefined
      return { at, kind: 'failure', reason: value.reason, ...(keys === undefined ? {} : { keys }) }
    case 'upstream-limit':
      if (typeof value.code !== 'string' || !LIMIT_CODE.test(value.code)) return undefined
      if (value.until !== undefined && !isTime(value.until)) return undefined
      return { at, kind: 'upstream-limit', code: value.code, ...(value.until === undefined ? {} : { until: value.until }) }
    case 'login-rejected': {
      const { path, status, code, login } = value
      if (path !== 'model' && path !== 'mint') return undefined
      if (login !== undefined && (typeof login !== 'string' || !HEX16.test(login))) return undefined
      const who = login === undefined ? {} : { login }
      if ((status === 401 || status === 403) && code === undefined) return { at, kind: 'login-rejected', path, status, ...who }
      if (status === undefined && code === PROJECT_TOKEN_CODES.loginRequired) return { at, kind: 'login-rejected', path, code, ...who }
      return undefined
    }
    default:
      return undefined
  }
}

interface TailRead {
  readonly records: readonly StoredRecord[]
  readonly lines: ReadonlySet<string>
  readonly skipped: number
  readonly size: number
}

const NO_FILE: TailRead = { records: [], lines: new Set(), skipped: 0, size: 0 }

/** The records of the tail of a file; a tail cut out of a longer file starts inside a line, which is dropped. */
function parseTail(text: string, cut: boolean, size: number): TailRead {
  const lines = new Set<string>()
  const records: StoredRecord[] = []
  let skipped = 0
  const all = text.split('\n')
  for (const raw of cut ? all.slice(1) : all) {
    const line = raw.trim()
    if (line.length === 0) continue
    lines.add(line)
    let parsed: QuotaRecord | undefined
    try {
      parsed = recordOf(JSON.parse(line))
    }
    catch {
      parsed = undefined
    }
    if (parsed === undefined) skipped += 1
    else records.push({ atMs: Date.parse(parsed.at), record: parsed })
  }
  return { records, lines, skipped, size }
}

export class QuotaJournal {
  readonly path: string
  private readonly fs: QuotaFs
  private readonly reported = new Set<string>()
  private readonly local: Array<{ readonly line: string, readonly stored: StoredRecord }> = []
  private tail: { readonly size: number, readonly mtimeMs: number, readonly value: TailRead } | undefined
  private directoryReady = false

  constructor(options: { readonly home: string, readonly fs?: QuotaFs }) {
    this.path = quotaJournalPath(options.home)
    this.fs = options.fs ?? nodeQuotaFs
  }

  private warn(kind: string, error: unknown): void {
    if (this.reported.has(kind)) return
    this.reported.add(kind)
    console.warn(`dsh-glm-hourness: quota journal ${kind} failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  /** Append one record. Never throws: the record stays in memory when the file cannot take it. */
  async append(record: QuotaRecord): Promise<void> {
    const line = JSON.stringify(record)
    this.local.push({ line, stored: { atMs: Date.parse(record.at), record } })
    if (this.local.length > LOCAL_MAX) this.local.shift()
    try {
      if (!this.directoryReady) {
        await this.fs.mkdir(dirname(this.path))
        this.directoryReady = true
      }
      await this.fs.appendFile(this.path, `${line}\n`)
    }
    catch (error) {
      this.warn('append', error)
    }
  }

  private async fileTail(): Promise<TailRead> {
    try {
      const info = await this.fs.stat(this.path)
      if (info === undefined) {
        this.tail = undefined
        return NO_FILE
      }
      if (this.tail !== undefined && this.tail.size === info.size && this.tail.mtimeMs === info.mtimeMs) return this.tail.value
      const value = parseTail(await this.fs.readTail(this.path, JOURNAL_TAIL_BYTES), info.size > JOURNAL_TAIL_BYTES, info.size)
      this.tail = { size: info.size, mtimeMs: info.mtimeMs, value }
      return value
    }
    catch (error) {
      this.warn('read', error)
      return this.tail?.value ?? NO_FILE
    }
  }

  /** The tail of the file and the records only this instance holds. Never throws. */
  async read(): Promise<JournalRead> {
    const file = await this.fileTail()
    const extra = this.local.filter(entry => !file.lines.has(entry.line)).map(entry => entry.stored)
    return { records: [...file.records, ...extra], skipped: file.skipped, size: file.size }
  }
}
