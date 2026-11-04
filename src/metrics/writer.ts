/**
 * The metrics journal's one writer (metrics design §5.1): per project root
 * (its `.llm/metrics/` directory) one queue, one sequence, one hash chain.
 * `record` validates, numbers and queues one event and never awaits I/O for
 * the caller; a microtask drains each queue in order, one `appendFile` per
 * line. A failed write stops the destination and retries after 30 seconds
 * (the next event also retries); nothing blocks the caller's work, and the
 * chain is fixed at enqueue time, so the line order is the sequence order
 * no matter when writes succeed. The writer never deletes, rewrites or
 * renames; only a `gap` line ever speaks about a loss.
 *
 * A destination's first write prepares the project directory
 * (`ensureIgnored` from src/data/project-root.ts, then `mkdir -p` and a
 * `*`-only `.gitignore`); when the ignore line cannot be written, no
 * directory is created and the events queue. Every day file this process
 * opens is registered in the project's `.llm/metrics-manifest.jsonl` (§5.5)
 * and, when it ends mid-line (a crash left half a line), continued on a
 * fresh line.
 */
import { createHash, randomBytes } from 'node:crypto'
import { open, mkdir as fsMkdir, appendFile as fsAppendFile, stat as fsStat, readFile as fsReadFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureIgnored } from '../data/project-root.ts'
import { buildStamp } from '../shared/build-info.ts'
import type { QueuedEvent } from '../shared/metrics.ts'
import { METRICS_KINDS } from './kinds/index.ts'
import { AT_PATTERN, ID_PATTERN, MAX_LINE_BYTES, FORMAT_VERSION, checkEvent } from './schema.ts'

/** A destination is a project root; the journal lives in `<root>/.llm/metrics/` (§3.3). */
export type MetricsDest = string

/** The filesystem the writer needs; the Node-backed one is `nodeMetricsFs`, tests inject theirs. */
export interface MetricsFs {
  mkdir(path: string, options: { readonly recursive: true }): Promise<void>
  appendFile(path: string, data: string): Promise<void>
  stat(path: string): Promise<{ readonly size: number }>
  /** The last `bytes` bytes of a file (fewer when it is shorter); the writer checks the final newline with it. */
  readTail(path: string, bytes: number): Promise<Uint8Array>
  /** Create a file only when it does not exist yet (`wx`); the metrics directory's `.gitignore`. */
  writeFileExclusive(path: string, data: string): Promise<void>
  /** A whole file as text; the row reads a project's path-hash key with it. */
  readFile(path: string): Promise<string>
}

/** The Node filesystem behind `openWriter` when no test injects one. */
export const nodeMetricsFs: MetricsFs = {
  mkdir: async (path, options) => { await fsMkdir(path, options) },
  appendFile: (path, data) => fsAppendFile(path, data),
  stat: async (path) => ({ size: (await fsStat(path)).size }),
  readFile: async (path) => await fsReadFile(path, 'utf8'),
  readTail: async (path, bytes) => {
    const handle = await open(path, 'r')
    try {
      const size = (await handle.stat()).size
      const buffer = new Uint8Array(Math.min(bytes, size))
      await handle.read(buffer, 0, buffer.length, size - buffer.length)
      return buffer
    }
    finally {
      await handle.close()
    }
  },
  writeFileExclusive: async (path, data) => {
    const handle = await open(path, 'wx')
    try {
      await handle.writeFile(data)
    }
    finally {
      await handle.close()
    }
  },
}

/** One destination's counters and last error, as `status` reports them (§5.1). */
export interface WriterDestStatus {
  readonly written: number
  readonly queued: number
  readonly dropped: number
  readonly rejected: number
  readonly error?: string
  readonly bytesToday?: number
}

/** A line waiting in a queue: its sequence number, chain digest, instant and serialized text. */
interface QueuedLine {
  readonly n: number
  readonly h: string
  readonly at: string
  readonly line: string
}

/** A loss waiting to be spoken about in a `gap` line (§5.1 step 4). */
interface PendingGap {
  lost: number
  from: number
  to: number
  lastH: string
}

/** A day file this process has opened, with its size and whether it ended mid-line. */
interface OpenFile {
  bytes: number
  fixNewline: boolean
  manifestWritten: boolean
}

interface DestState {
  queued: QueuedLine[]
  nextN: number
  lastH: string
  pendingGap: PendingGap | undefined
  prepared: boolean
  preparing: Promise<void> | undefined
  pumping: boolean
  files: Map<string, OpenFile>
  timer: NodeJS.Timeout | undefined
  error: string | undefined
  written: number
  dropped: number
  rejected: number
  everQueued: boolean
  drainWaiters: Array<() => void>
}

const QUEUE_LIMIT = 2000
const RETRY_MS = 30_000
const CLOSE_BUDGET_MS = 2000
const DAY_BYTES_WARN = 64 * 1024 * 1024

const errorOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && typeof (error as { readonly code?: unknown }).code === 'string' ? (error as { readonly code: string }).code : 'error'

const utcDateOf = (at: string): string => at.slice(0, 10)

export interface MetricsWriter {
  /** Validate, number and queue one event for a destination. Never throws; never awaits I/O for the caller. */
  record(dest: MetricsDest, event: QueuedEvent): void
  /** Write what can be written now, in sequence order per destination. */
  flush(): Promise<void>
  /** Queue `stop` for every destination written to, then flush with a 2 s budget. */
  close(): Promise<void>
  /** Per destination: written, queued, dropped, rejected, the last error code, today's file size. */
  status(): ReadonlyMap<string, WriterDestStatus>
}

export function openWriter(options: {
  readonly host: 'desktop' | 'headless' | 'cli'
  readonly fs: MetricsFs
  readonly now?: () => number
  readonly randomId?: () => string
  /** Only injectable so tests can fail it like a real `.git/info/exclude` would; the default is the repository's one function. */
  readonly ensureIgnored?: (root: string, directory: string) => Promise<void>
}): MetricsWriter {
  const now = options.now ?? Date.now
  const randomId = options.randomId ?? (() => randomBytes(4).toString('hex'))
  const ignore = options.ensureIgnored ?? ensureIgnored
  const fs = options.fs
  const w = randomId()
  const totals = { written: 0, dropped: 0, rejected: 0 }
  const warned = new Set<string>()
  let ownStamp: string | undefined
  let closed = false

  const stampOf = (): string => {
    if (ownStamp === undefined) ownStamp = buildStamp()
    return ownStamp
  }

  const destinations = new Map<MetricsDest, DestState>()

  const stateOf = (dest: MetricsDest): DestState => {
    let state = destinations.get(dest)
    if (state === undefined) {
      state = {
        queued: [], nextN: 0, lastH: '', pendingGap: undefined, prepared: false, preparing: undefined, pumping: false,
        files: new Map(), timer: undefined, error: undefined, written: 0, dropped: 0, rejected: 0,
        everQueued: false, drainWaiters: [],
      }
      destinations.set(dest, state)
    }
    return state
  }

  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return
    warned.add(key)
    console.error(`metrics: ${message}`)
  }

  /**
   * Build the next line of a destination from one event in stored shape
   * (envelope plus `body`): the sequence and chain are fixed here, so the
   * line order is the sequence order whatever the writes do (§5.1 step 3).
   * The event must already be validated; `stored` carries a placeholder
   * digest that this replaces.
   */
  const lineFor = (state: DestState, stored: Record<string, unknown>): QueuedLine => {
    const n = state.nextN + 1
    stored.n = n
    const core = JSON.stringify(stored)
    const h = createHash('sha256').update(`${state.lastH}${core}`, 'utf8').digest('hex').slice(0, 12)
    const line: QueuedLine = { n, h, at: stored.at as string, line: `${core.slice(0, -1)},"h":"${h}"}` }
    state.nextN = n
    state.lastH = h
    return line
  }

  /** Enqueue a built line; drop the earliest line after the head when the queue is full (§5.1 step 4, F17). */
  const enqueue = (state: DestState, line: QueuedLine): void => {
    state.everQueued = true
    state.queued.push(line)
    while (state.queued.length > QUEUE_LIMIT) {
      const dropped = state.queued[1]
      state.queued.splice(1, 1)
      state.dropped += 1
      totals.dropped += 1
      const gap = state.pendingGap
      if (gap !== undefined && gap.to + 1 === dropped.n) {
        gap.to = dropped.n
        gap.lost += 1
        gap.lastH = dropped.h
      }
      else {
        if (gap !== undefined) enqueueGapLine(state, gap)
        state.pendingGap = { lost: 1, from: dropped.n, to: dropped.n, lastH: dropped.h }
      }
    }
  }

  /** The writer's own lines (§4.2 first table): `start`, `stop`, `gap`, `reject`, always valid by construction. */
  const hostLine = (state: DestState, kind: 'start' | 'stop' | 'gap' | 'reject', body: Record<string, unknown>): QueuedLine =>
    buildLine(state, { k: kind, by: 'host', body } as QueuedEvent)

  const enqueueGapLine = (state: DestState, gap: PendingGap): void => {
    enqueue(state, hostLine(state, 'gap', { lost: gap.lost, from: gap.from, to: gap.to, lastH: gap.lastH }))
  }

  const buildRejectLine = (state: DestState, of: unknown, field: string): QueuedLine => {
    state.rejected += 1
    totals.rejected += 1
    const kind = typeof of === 'string' && ID_PATTERN.test(of) ? of : 'unknown'
    const named = ID_PATTERN.test(field) ? field : 'other'
    warnOnce(`reject:${kind}:${named}`, `rejected a ${kind} event at ${named}`)
    return hostLine(state, 'reject', { of: kind, field: named })
  }

  /** Validate one event against its kind table; a bad one becomes a `reject` of the same destination (§5.1 step 1). */
  const buildLine = (state: DestState, event: QueuedEvent): QueuedLine => {
    if (event.at !== undefined && !AT_PATTERN.test(event.at)) return buildRejectLine(state, event.k, 'at')
    const at = event.at === undefined ? new Date(now()).toISOString() : event.at
    // The sequence and digest placeholders pass the envelope check; lineFor writes the real ones.
    // The field order is the canonical one (schema.ts `serializeEvent`): the
    // checker recomputes the chain over that exact text, sid before body, and
    // the body's fields in the kind table's order — a caller's key order must
    // not change the line the chain hashes.
    const table = METRICS_KINDS.get(typeof event.k === 'string' ? event.k : '')
    if (table === undefined) return buildRejectLine(state, event.k, 'k')
    const given = typeof event.body === 'object' && event.body !== null ? event.body as Record<string, unknown> : {}
    const orderedBody: Record<string, unknown> = {}
    for (const spec of table.fields) {
      const value = given[spec.name]
      if (value !== undefined) orderedBody[spec.name] = value
    }
    const stored: Record<string, unknown> = {
      s: FORMAT_VERSION,
      k: event.k,
      at,
      w,
      n: 1,
      h: '0'.repeat(12),
      v: event.v ?? stampOf(),
      by: event.by,
      ...(event.sid === undefined ? {} : { sid: event.sid }),
      body: orderedBody,
    }
    const check = checkEvent(stored, METRICS_KINDS)
    if (!check.ok) return buildRejectLine(state, event.k, check.field)
    delete stored.h // the chain text is the stored line without its final member
    const full = lineFor(state, stored)
    if (Buffer.byteLength(full.line, 'utf8') > MAX_LINE_BYTES) return buildRejectLine(state, event.k, 'other')
    return full
  }

  const resolveDrains = (state: DestState): void => {
    if (state.queued.length === 0 || state.error !== undefined) {
      for (const resolve of state.drainWaiters.splice(0)) resolve()
    }
  }

  const prepare = (dest: MetricsDest, state: DestState): Promise<void> => {
    if (state.prepared) return Promise.resolve()
    state.preparing ??= (async () => {
      await ignore(dest, '.llm')
      const dir = join(dest, '.llm', 'metrics')
      await fs.mkdir(dir, { recursive: true })
      // Two writers may race on the guard file (two sessions in one project,
      // the library entry beside the row); losing the wx race is prepare done.
      await fs.writeFileExclusive(join(dir, '.gitignore'), '*\n').catch((error: unknown) => {
        if (errorOf(error) !== 'EEXIST') throw error
      })
      state.prepared = true
    })()
    return state.preparing
  }

  const pump = async (dest: MetricsDest): Promise<void> => {
    const state = stateOf(dest)
    if (state.pumping) return
    state.pumping = true
    try {
      while (state.queued.length > 0) {
        await prepare(dest, state)
        const head = state.queued[0]
        const date = utcDateOf(head.at)
        const dir = join(dest, '.llm', 'metrics')
        const file = join(dir, `events-${date}.jsonl`)
        let open = state.files.get(date)
        if (open === undefined) {
          let size = 0
          let fixNewline = false
          try {
            size = (await fs.stat(file)).size
            const tail = await fs.readTail(file, 1)
            fixNewline = tail.length === 1 && tail[0] !== 0x0A
          }
          catch (error) {
            if (errorOf(error) !== 'ENOENT') throw error
          }
          open = { bytes: size, fixNewline, manifestWritten: false }
          state.files.set(date, open)
        }
        if (!open.manifestWritten) {
          await fs.appendFile(join(dest, '.llm', 'metrics-manifest.jsonl'), `${JSON.stringify({ file: `events-${date}.jsonl`, w, firstN: head.n, at: head.at })}\n`)
          open.manifestWritten = true
        }
        const text = `${open.fixNewline ? '\n' : ''}${head.line}\n`
        await fs.appendFile(file, text)
        open.bytes += Buffer.byteLength(text, 'utf8')
        open.fixNewline = false
        if (open.bytes > DAY_BYTES_WARN) warnOnce(`size:${dest}:${date}`, `events-${date}.jsonl of ${dest} is over 64 MiB`)
        state.queued.shift()
        state.written += 1
        totals.written += 1
        state.error = undefined
        if (state.pendingGap !== undefined) {
          enqueueGapLine(state, state.pendingGap)
          state.pendingGap = undefined
        }
      }
    }
    catch (error) {
      state.error = errorOf(error)
      state.preparing = undefined // a failed prepare (the ignore line, the mkdir) is attempted again on the next retry
      warnOnce(`error:${dest}:${state.error}`, `writing the journal of ${dest} failed with ${state.error}; retrying in 30 seconds`)
      clearTimeout(state.timer)
      state.timer = setTimeout(() => {
        state.timer = undefined
        void pump(dest)
      }, RETRY_MS)
      state.timer.unref()
    }
    finally {
      state.pumping = false
      resolveDrains(state)
    }
  }

  return {
    record(dest, event) {
      if (closed) return // close() has queued the stop lines; later events would land after one
      const state = stateOf(dest)
      if (!state.everQueued) {
        const electron = process.versions.electron
        enqueue(state, hostLine(state, 'start', { host: options.host, pid: process.pid, node: process.version, ...(electron === undefined ? {} : { electron }) }))
      }
      enqueue(state, buildLine(state, event))
      if (state.timer !== undefined) {
        clearTimeout(state.timer)
        state.timer = undefined
      }
      void pump(dest)
    },

    flush() {
      const waits: Array<Promise<void>> = []
      for (const [dest, state] of destinations) {
        if (state.queued.length === 0 && !state.pumping) continue
        waits.push(new Promise<void>((resolve) => { state.drainWaiters.push(resolve) }))
        void pump(dest)
      }
      return Promise.all(waits).then(() => undefined)
    },

    async close() {
      if (closed) return
      for (const state of destinations.values()) {
        if (!state.everQueued) continue
        enqueue(state, hostLine(state, 'stop', { written: totals.written, dropped: totals.dropped, rejected: totals.rejected }))
      }
      closed = true
      await Promise.race([this.flush(), new Promise<void>(resolve => setTimeout(resolve, CLOSE_BUDGET_MS).unref())])
    },

    status() {
      const today = utcDateOf(new Date(now()).toISOString())
      const result = new Map<string, WriterDestStatus>()
      for (const [dest, state] of destinations) {
        const file = state.files.get(today)
        result.set(dest, {
          written: state.written,
          queued: state.queued.length,
          dropped: state.dropped,
          rejected: state.rejected,
          ...(state.error === undefined ? {} : { error: state.error }),
          ...(file === undefined ? {} : { bytesToday: file.bytes }),
        })
      }
      return result
    },
  }
}
