/**
 * The host heartbeats (docs/ORCHESTRATION.md §16.10, §16.12; design §5.4, §7.2):
 * each host process that has a live session in a project keeps one file
 * `<runtime dir>/hosts/<pid>-<start>.json` fresh, and whoever has no pricing
 * service of its own (the command line, a repository script) reads the host's
 * reading of the GLM peak from there; the board reads the file of a ticket's
 * host to see whether the host is still there. Only the host writes its own
 * file (`createHeartbeat`, every 15 seconds); `readHeartbeats` and
 * `liveHeartbeats` read them all and write nothing. Detectors are not run, so
 * no host is the runner.
 */
import { readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import type { RowState } from './model.ts'
import type { PeakReading } from './peak.ts'
import type { HostRef } from './request.ts'
import { ensureRuntimeDir, rulesPaths, writeAtomic, type RulesPaths, type StoreIo } from './store.ts'

/** A heartbeat older than this is a host that is not there (design §5.4). */
export const HEARTBEAT_FRESH_MS = 45_000

/** The reason given when no live host has a reading: the command line has no pricing service of its own. */
const NO_HOST = '没有活的宿主，命令行读不到计价服务'

/** A host's heartbeat file (design §7.2). Later steps add the writer; the shape is the design's. */
export interface HostHeartbeat {
  readonly host: { readonly pid: number, readonly startedAt: number }
  /** When the host wrote it; 45 seconds without an update and the host is taken as gone. */
  readonly at: string
  /** The host's live sessions in this project. */
  readonly sessions: readonly string[]
  /** Whether this host runs the detectors at the moment. */
  readonly runner: boolean
  readonly detectors?: Readonly<Record<string, { readonly lastRunAt?: string, readonly lastOkAt?: string, readonly error?: string }>>
  /** What the host computed on the spot, for readers that have no pricing service. */
  readonly computed: { readonly glmPeak: { readonly value: boolean, readonly nextChangeAt?: string } | { readonly unknown: string } }
  /** The state of the row each catalog entry belongs to, as the host sees it. */
  readonly catalog: ReadonlyArray<{ readonly id: string, readonly state: RowState, readonly toldState?: RowState }>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

function parseGlmPeak(value: unknown): HostHeartbeat['computed']['glmPeak'] | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.unknown === 'string') return { unknown: value.unknown }
  if (typeof value.value !== 'boolean') return undefined
  // A next change that is not a time is no next change: the value stands.
  return isTime(value.nextChangeAt) ? { value: value.value, nextChangeAt: value.nextChangeAt } : { value: value.value }
}

/** The heartbeat a file holds, or undefined when it is not one. Fields beyond the design's are left out. */
function parseHeartbeat(value: unknown): HostHeartbeat | undefined {
  if (!isRecord(value) || !isRecord(value.host) || !isRecord(value.computed)) return undefined
  const { pid, startedAt } = value.host
  const glmPeak = parseGlmPeak(value.computed.glmPeak)
  if (typeof pid !== 'number' || !Number.isInteger(pid) || typeof startedAt !== 'number' || glmPeak === undefined) return undefined
  if (!isTime(value.at) || typeof value.runner !== 'boolean') return undefined
  if (!Array.isArray(value.sessions) || !value.sessions.every(session => typeof session === 'string')) return undefined
  if (!Array.isArray(value.catalog) || !value.catalog.every(entry => isRecord(entry) && typeof entry.id === 'string' && typeof entry.state === 'string')) return undefined
  return {
    host: { pid, startedAt },
    at: value.at,
    sessions: value.sessions,
    runner: value.runner,
    ...(isRecord(value.detectors) ? { detectors: value.detectors as NonNullable<HostHeartbeat['detectors']> } : {}),
    computed: { glmPeak },
    catalog: value.catalog as HostHeartbeat['catalog'],
  }
}

/**
 * The heartbeats of a project's host directory, and the files in it that are
 * not readable as one (the names, for the caller to say so). A directory that
 * is not there holds none; a failure to read the directory itself throws.
 * Temporary files of the writer (`*.tmp`) are not heartbeats.
 */
export function readHeartbeats(paths: RulesPaths): { readonly heartbeats: readonly HostHeartbeat[], readonly unreadable: readonly string[] } {
  const dir = join(paths.runtimeDir, 'hosts')
  let names: string[]
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { heartbeats: [], unreadable: [] }
    throw error
  }
  const heartbeats: HostHeartbeat[] = []
  const unreadable: string[] = []
  for (const name of names) {
    let parsed: HostHeartbeat | undefined
    try {
      parsed = parseHeartbeat(JSON.parse(readFileSync(join(dir, name), 'utf8')))
    }
    catch {
      parsed = undefined
    }
    if (parsed === undefined) unreadable.push(name)
    else heartbeats.push(parsed)
  }
  return { heartbeats, unreadable }
}

/** The heartbeats written within the last 45 seconds, newest first (design §7.2). */
export function liveHeartbeats(heartbeats: readonly HostHeartbeat[], nowMs: number): readonly HostHeartbeat[] {
  return heartbeats
    .filter(heartbeat => nowMs - Date.parse(heartbeat.at) <= HEARTBEAT_FRESH_MS)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.host.pid - b.host.pid)
}

/** The hosts' reading of the GLM peak: a value (with the host it came from and, while the peak lasts, when it changes), or why there is none. */
export type HostPeak =
  | { readonly value: boolean, readonly host: number, readonly until?: string }
  | { readonly unknown: string, readonly host?: number }

/**
 * The first reading that has a value among the live heartbeats, newest first.
 * Its next change happened after the host wrote it when that time has passed,
 * so the value is the other one (the peaks of the plan are hours apart, far
 * more than the 45 seconds a heartbeat lives). With no value anywhere the
 * reason is the newest heartbeat's; with no live heartbeat there is no host.
 */
export function hostPeak(live: readonly HostHeartbeat[], nowMs: number): HostPeak {
  for (const heartbeat of live) {
    const peak = heartbeat.computed.glmPeak
    if (!('value' in peak)) continue
    const host = heartbeat.host.pid
    const next = peak.nextChangeAt
    if (next === undefined || Number.isNaN(Date.parse(next))) return { value: peak.value, host }
    if (Date.parse(next) <= nowMs) return { value: !peak.value, host }
    return { value: peak.value, host, until: next }
  }
  const newest = live[0]
  if (newest === undefined) return { unknown: NO_HOST }
  const peak = newest.computed.glmPeak
  return { unknown: 'unknown' in peak ? peak.unknown : NO_HOST, host: newest.host.pid }
}

/** How long a host with no live session in a project keeps its heartbeat file (design §5.4). */
const NO_SESSION_MS = 60_000

/** A heartbeat of any host not written for this long is not state; whoever writes its own removes it (design §5.4). */
const KEEP_MS = 3_600_000

export interface HeartbeatEnv {
  readonly host: HostRef
  /** The rules directory of the row's configuration, relative to the project root unless absolute. */
  readonly rulesDir: string | undefined
  readonly now: () => number
  readonly io: StoreIo
  readonly peak: () => PeakReading
  /** The state of the row each catalog entry belongs to, as the host sees it now. */
  readonly catalog: () => HostHeartbeat['catalog']
  /** Told what could not be done; the caller says it once. */
  readonly warn: (message: string) => void
}

/** A project this host has live sessions in, or had a moment ago. */
interface Live {
  readonly root: string
  /** A working directory of a session in it, to read the project by. */
  readonly cwd: string
  readonly sessions: Set<string>
  /** When the last session left; absent while there is one. */
  emptySince: number | undefined
  /** The file was written since the project joined, so a new ticket need not write it first. */
  written: boolean
  /** The failure to write is already warned about. */
  warned: boolean
}

export interface HeartbeatWriter {
  /** A session of this host is live in the project of `cwd`: it is recorded, and the heartbeat is written at once the first time, so a ticket opened now has a host that is up. Never throws. */
  join(sessionId: string, cwd: string): Promise<void>
  /** The session has ended. */
  leave(sessionId: string): void
  /** The 15-second period: write the heartbeat of every project with a live session, delete that of a project that has had none for 60 seconds. Never throws. */
  beat(): Promise<void>
  /** The projects with a live session of this host, with a working directory of one of them. */
  live(): ReadonlyArray<{ readonly root: string, readonly cwd: string }>
  /** The host leaves: its heartbeat files go. */
  stop(): void
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 80)

/** Keeps the heartbeat file of this host in each project it has live sessions in (design §5.4). */
export function createHeartbeat(env: HeartbeatEnv): HeartbeatWriter {
  const projects = new Map<string, Live>()
  const fileOf = (root: string): { readonly paths: RulesPaths, readonly file: string } => {
    const paths = rulesPaths(root, env.rulesDir)
    return { paths, file: join(paths.runtimeDir, 'hosts', `${env.host.pid}-${env.host.startedAt}.json`) }
  }

  function content(live: Live): HostHeartbeat {
    const reading = env.peak()
    const glmPeak: HostHeartbeat['computed']['glmPeak'] = reading.peak === undefined
      ? { unknown: reading.why ?? 'unknown' }
      : { value: reading.peak, ...(reading.until === undefined ? {} : { nextChangeAt: reading.until }) }
    return { host: env.host, at: new Date(env.now()).toISOString(), sessions: [...live.sessions], runner: false, computed: { glmPeak }, catalog: env.catalog() }
  }

  /** Remove the heartbeats of other hosts that have not been written for an hour. */
  function sweep(paths: RulesPaths, own: string): void {
    const { heartbeats } = readHeartbeats(paths)
    for (const heartbeat of heartbeats) {
      const name = `${heartbeat.host.pid}-${heartbeat.host.startedAt}.json`
      if (name === own || env.now() - Date.parse(heartbeat.at) <= KEEP_MS) continue
      try {
        unlinkSync(join(paths.runtimeDir, 'hosts', name))
      }
      catch {
        // Another host removed it first, or it is open somewhere: the next write tries again.
      }
    }
  }

  async function write(live: Live): Promise<void> {
    const { paths, file } = fileOf(live.root)
    const fail = (why: string): void => {
      if (live.warned) return
      live.warned = true
      env.warn(`the heartbeat of this host in ${live.root} could not be written, the next period tries again: ${why}`)
    }
    try {
      await ensureRuntimeDir(paths)
      await mkdir(join(paths.runtimeDir, 'hosts'), { recursive: true })
      const written = await writeAtomic(file, `${JSON.stringify(content(live))}\n`, env.io)
      if (!written.ok) {
        await unlink(written.temporary).catch(() => {})
        fail('the file could not be renamed over (a reader has it open)')
        return
      }
      live.warned = false
      live.written = true
      sweep(paths, `${env.host.pid}-${env.host.startedAt}.json`)
    }
    catch (error) {
      fail(message(error))
    }
  }

  return {
    async join(sessionId, cwd) {
      const root = projectOf(cwd)?.root
      if (root === undefined) return
      let live = projects.get(root)
      if (live === undefined) {
        live = { root, cwd, sessions: new Set(), emptySince: undefined, written: false, warned: false }
        projects.set(root, live)
      }
      live.sessions.add(sessionId)
      live.emptySince = undefined
      if (!live.written) await write(live)
    },
    leave(sessionId) {
      for (const live of projects.values()) {
        if (live.sessions.delete(sessionId) && live.sessions.size === 0) live.emptySince = env.now()
      }
    },
    async beat() {
      for (const live of [...projects.values()]) {
        if (live.sessions.size > 0) {
          await write(live)
          continue
        }
        if (live.emptySince !== undefined && env.now() - live.emptySince < NO_SESSION_MS) continue
        projects.delete(live.root)
        await unlink(fileOf(live.root).file).catch(() => {})
      }
    },
    live: () => [...projects.values()].filter(live => live.sessions.size > 0).map(({ root, cwd }) => ({ root, cwd })),
    stop() {
      for (const live of projects.values()) {
        try {
          unlinkSync(fileOf(live.root).file)
        }
        catch {
          // Never written, or already gone.
        }
      }
      projects.clear()
    },
  }
}
