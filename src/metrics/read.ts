/**
 * Reading the metrics journal back (metrics design §5.4, §7.1): line by
 * line, validated against the same closed tables the writer used, deduped
 * by writer and sequence, ordered by instant. `readLog` returns the events
 * a calculation window needs, together with the basis (which files, how
 * many lines) that makes two runs over the same journal reproduce each
 * other, and the lines that could not enter. `checkLog` is the side that
 * finds what went wrong — missing lines, a broken chain, a writer that
 * never stopped, a deleted day file — for the background self-check and the
 * command line; it only discovers accidents, it does not defend against
 * anyone who can rewrite the files (§5.4).
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { HOST_ONLY_KINDS } from '../shared/metrics.ts'
import { METRICS_KINDS } from './kinds/index.ts'
import { checkEvent, serializeEvent, FORMAT_VERSION, type MetricsEvent } from './schema.ts'

/** Why one line could not enter (the file and line are said where it is reported). */
export type ReadProblemReason = 'not-json' | 'nul' | 'unknown-kind' | 'newer-version' | 'invalid'

/** One line that could not enter, with its file and line number. */
export interface ReadProblem {
  readonly file: string
  readonly line: number
  readonly reason: ReadProblemReason
}

/** One parsed journal line, or the reason that kept it out. */
interface ScannedLine {
  readonly number: number
  readonly event?: MetricsEvent
  readonly problem?: ReadProblemReason
}

export interface ReadLogOptions {
  /** Window start, inclusive; a file is read when its UTC date is in the window (ISO instant or date). */
  readonly from?: string | undefined
  /** Window end, exclusive. */
  readonly to?: string | undefined
  /** When given, each named file is read only to its first L lines and files outside the map are not read (F8). */
  readonly basis?: ReadonlyMap<string, number> | undefined
}

const FILE_PATTERN = /^events-(\d{4}-\d{2}-\d{2})(?:-([0-9a-f]{8}|bf-[0-9a-f]{7}))?\.jsonl$/

const dateOf = (instant: string): string => instant.slice(0, 10)

/** The journal files of a project in the window, in file-name order; `limit` caps lines per file (§7.1 step 1 and 5). */
async function journalFiles(root: string, options: ReadLogOptions): Promise<Array<{ readonly name: string, readonly limit: number }>> {
  let names: string[]
  try {
    names = (await readdir(join(root, '.llm', 'metrics'))).sort()
  }
  catch {
    return []
  }
  const files: Array<{ readonly name: string, readonly limit: number }> = []
  for (const name of names) {
    const match = FILE_PATTERN.exec(name)
    if (match === null) continue
    const date = match[1]
    if (options.from !== undefined && date < dateOf(options.from)) continue
    if (options.to !== undefined && date >= dateOf(options.to)) continue
    if (options.basis !== undefined) {
      const limit = options.basis.get(name)
      if (limit === undefined) continue
      files.push({ name, limit })
    }
    else {
      files.push({ name, limit: Number.MAX_SAFE_INTEGER })
    }
  }
  return files
}

function scanLine(text: string): { readonly event: MetricsEvent, readonly problem?: undefined } | { readonly event?: undefined, readonly problem: ReadProblemReason } {
  if (text.includes('\0')) return { problem: 'nul' }
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return { problem: 'not-json' }
  }
  const version = typeof value === 'object' && value !== null ? (value as { readonly s?: unknown }).s : undefined
  if (version !== undefined && version !== FORMAT_VERSION) return { problem: 'newer-version' }
  const check = checkEvent(value, METRICS_KINDS)
  if (!check.ok) {
    const kind = typeof value === 'object' && value !== null ? (value as { readonly k?: unknown }).k : undefined
    return { problem: check.field === 'k' && typeof kind === 'string' && !METRICS_KINDS.has(kind) ? 'unknown-kind' : 'invalid' }
  }
  return { event: check.event }
}

/** The first `limit` lines of one journal file, each parsed against the tables or marked as a problem. */
async function scanFile(root: string, file: string, limit: number): Promise<readonly ScannedLine[]> {
  const stream = createReadStream(join(root, '.llm', 'metrics', file), 'utf8')
  const reader = createInterface({ input: stream, crlfDelay: Infinity })
  const lines: ScannedLine[] = []
  try {
    for await (const text of reader) {
      if (lines.length >= limit) break
      if (text === '') continue
      const scanned = scanLine(text)
      lines.push({ number: lines.length + 1, ...(scanned.event === undefined ? { problem: scanned.problem } : { event: scanned.event }) })
    }
  }
  finally {
    reader.close()
    stream.destroy()
  }
  return lines
}

/**
 * Read a window of one project's journal (§7.1): dedupe by `(w, n)` keeping
 * the first line, order by `(at, w, n)`, and return the basis (each file
 * read and how many lines it contributed) that makes runs reproducible.
 */
export async function readLog(root: string, options: ReadLogOptions = {}): Promise<{
  readonly events: readonly MetricsEvent[]
  readonly basis: ReadonlyMap<string, number>
  readonly problems: readonly ReadProblem[]
}> {
  const basis = new Map<string, number>()
  const problems: ReadProblem[] = []
  const first = new Map<string, MetricsEvent>()
  for (const { name, limit } of await journalFiles(root, options)) {
    const lines = await scanFile(root, name, limit)
    basis.set(name, lines.length)
    for (const line of lines) {
      if (line.problem !== undefined) problems.push({ file: name, line: line.number, reason: line.problem })
      else {
        const event = line.event!
        const key = `${event.w}\u0000${event.n}`
        if (!first.has(key)) first.set(key, event)
      }
    }
  }
  const events = [...first.values()].sort((a, b) => a.at.localeCompare(b.at) || a.w.localeCompare(b.w) || a.n - b.n)
  return { events, basis, problems }
}

/** One writer's sequence range its journal misses and no `gap` covers (§5.4). */
export interface MissingRange {
  readonly w: string
  readonly from: number
  readonly to: number
}

/** A writer's line whose digest the chain does not recompute. */
export interface ChainBreak {
  readonly w: string
  readonly n: number
}

/** A writer that started, never wrote `stop`, and has been quiet for over ten minutes. */
export interface WriterNoStop {
  readonly w: string
  readonly lastAt: string
}

/** A writer whose sequence grew while its instants went back. */
export interface ClockRollback {
  readonly w: string
  readonly n: number
  readonly at: string
}

/** A writer that started on the command line and wrote a kind only a host process sees. */
export interface Forgery {
  readonly w: string
  readonly kind: string
}

export interface LogFindings {
  readonly events: number
  /** Lines no calculation could take (§5.4: not JSON, NUL, not in the tables), with file and line. */
  readonly unreadable: readonly ReadProblem[]
  readonly missing: readonly MissingRange[]
  readonly chainBreaks: readonly ChainBreak[]
  readonly noStop: readonly WriterNoStop[]
  readonly clockRollbacks: readonly ClockRollback[]
  /** Same writer and sequence seen twice; the first is kept (§5.4). */
  readonly duplicates: number
  /** Day files the manifest lists, the disk lacks, and no `prune` covers (§5.5, F7). */
  readonly lostFiles: readonly string[]
  readonly forgeries: readonly Forgery[]
  /** Bytes of the journal files on disk (§5.3). */
  readonly bytes: number
}

export interface CheckLogOptions {
  readonly from?: string | undefined
  readonly to?: string | undefined
  /** The clock to judge "quiet for ten minutes" against; tests inject theirs. */
  readonly now?: (() => number) | undefined
}

const QUIET_MS = 10 * 60_000
const CLOCK_BACK_MS = 5 * 60_000

interface Tally {
  host: string | undefined
  stopped: boolean
  lastAt: string | undefined
  events: MetricsEvent[]
}

/** A `gap` body as the reader reads it. */
interface GapBody {
  readonly from?: unknown
  readonly to?: unknown
  readonly lastH?: unknown
}

/** The `gap` line covering a missing range of the same writer, if the journal holds one (§5.4). */
function gapCovering(writer: readonly MetricsEvent[], from: number, to: number): string | undefined {
  const gap = writer.find(event => event.k === 'gap')
  const body = gap === undefined ? undefined : gap.body as GapBody
  return gap === undefined || typeof body?.from !== 'number' || typeof body?.to !== 'number' || typeof body?.lastH !== 'string' || body.from > from || body.to < to ? undefined : body.lastH
}

/**
 * Check one window of a project's journal (§5.4): the sequence of every
 * writer against its `gap` lines, the chain recomputed from the canonical
 * serialization (resuming from a gap's `lastH`), the writers that never
 * stopped, the instants that went backwards, the duplicates, the files the
 * manifest remembers that the disk forgot, and a command-line writer that
 * reported host-only kinds.
 */
export async function checkLog(root: string, options: CheckLogOptions = {}): Promise<LogFindings> {
  const unreadable: ReadProblem[] = []
  const missing: MissingRange[] = []
  const chainBreaks: ChainBreak[] = []
  const noStop: WriterNoStop[] = []
  const rollbacks: ClockRollback[] = []
  const forgeries: Forgery[] = []
  let duplicates = 0
  let events = 0

  const tallies = new Map<string, Tally>()
  const seen = new Set<string>()

  for (const { name } of await journalFiles(root, { from: options.from, to: options.to })) {
    for (const line of await scanFile(root, name, Number.MAX_SAFE_INTEGER)) {
      if (line.problem !== undefined) {
        unreadable.push({ file: name, line: line.number, reason: line.problem })
        continue
      }
      const event = line.event!
      const key = `${event.w}\u0000${event.n}`
      if (seen.has(key)) {
        duplicates += 1
        continue // written twice after a false error report; the first is kept (§5.4)
      }
      seen.add(key)
      events += 1
      let tally = tallies.get(event.w)
      if (tally === undefined) {
        tally = { host: undefined, stopped: false, lastAt: undefined, events: [] }
        tallies.set(event.w, tally)
      }
      if (event.k === 'start') tally.host = typeof event.body.host === 'string' ? event.body.host : undefined
      if (event.k === 'stop') tally.stopped = true
      tally.lastAt = event.at
      tally.events.push(event)
    }
  }

  for (const [w, tally] of tallies) {
    const writer = [...tally.events].sort((a, b) => a.n - b.n)
    let expectedN = 1
    let expectedH = ''
    let prevAt: string | undefined
    for (const event of writer) {
      if (prevAt !== undefined && event.at < prevAt && Date.parse(prevAt) - Date.parse(event.at) > CLOCK_BACK_MS) {
        rollbacks.push({ w, n: event.n, at: event.at })
      }
      prevAt = event.at
      if (event.n > expectedN) {
        const resumed = gapCovering(writer, expectedN, event.n - 1)
        if (resumed === undefined) missing.push({ w, from: expectedN, to: event.n - 1 })
        else expectedH = resumed
      }
      const table = METRICS_KINDS.get(event.k)
      if (table !== undefined) {
        const computed = createHash('sha256').update(`${expectedH}${serializeEvent(event, table, { chain: true })}`, 'utf8').digest('hex').slice(0, 12)
        if (computed !== event.h) chainBreaks.push({ w, n: event.n })
      }
      expectedH = event.h
      expectedN = event.n + 1
      if (HOST_ONLY_KINDS.includes(event.k) && tally.host === 'cli') forgeries.push({ w, kind: event.k })
    }
    if (!tally.stopped && tally.lastAt !== undefined && (options.now ?? Date.now)() - Date.parse(tally.lastAt) > QUIET_MS) {
      noStop.push({ w, lastAt: tally.lastAt })
    }
  }

  const kept = [...tallies.values()].flatMap(tally => tally.events)
  return {
    events,
    unreadable,
    missing,
    chainBreaks,
    noStop,
    clockRollbacks: rollbacks,
    duplicates,
    lostFiles: await lostJournalFiles(root, kept),
    forgeries,
    bytes: await journalBytes(root),
  }
}

/** The day files the manifest lists that are neither on disk nor covered by a `prune` of the checked window (§5.5). */
async function lostJournalFiles(root: string, events: readonly MetricsEvent[]): Promise<string[]> {
  let manifest: string
  try {
    manifest = await readFile(join(root, '.llm', 'metrics-manifest.jsonl'), 'utf8')
  }
  catch {
    return []
  }
  const prunes = events
    .filter(event => event.k === 'prune' && typeof event.body.before === 'string')
    .map(event => dateOf(event.body.before as string))
  const lost: string[] = []
  for (const line of manifest.split('\n')) {
    if (line === '') continue
    let entry: unknown
    try {
      entry = JSON.parse(line)
    }
    catch {
      continue
    }
    const value = typeof entry === 'object' && entry !== null ? (entry as { readonly file?: unknown }).file : undefined
    if (typeof value !== 'string') continue
    const date = FILE_PATTERN.exec(value)?.[1]
    if (date === undefined) continue
    const file = value
    let onDisk = false
    try {
      onDisk = (await stat(join(root, '.llm', 'metrics', file))).isFile()
    }
    catch {
      // Not on disk: the finding, unless a prune covers the day.
    }
    if (!onDisk && !prunes.some(before => before > date)) lost.push(file)
  }
  return lost
}

/** The bytes of the journal files on disk (§5.3). */
async function journalBytes(root: string): Promise<number> {
  let names: string[]
  try {
    names = await readdir(join(root, '.llm', 'metrics'))
  }
  catch {
    return 0
  }
  let bytes = 0
  for (const name of names.filter(name => FILE_PATTERN.test(name))) {
    try {
      bytes += (await stat(join(root, '.llm', 'metrics', name))).size
    }
    catch {
      // A file vanished between the listing and the stat; its bytes are not counted.
    }
  }
  return bytes
}
