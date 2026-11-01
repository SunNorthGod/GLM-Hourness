/**
 * The host heartbeats, read side (docs/ORCHESTRATION.md §16.10; design §5.4,
 * §7.2): each host process that has a live session in a project keeps one
 * file `<runtime dir>/hosts/<pid>-<start>.json` fresh, and whoever has no
 * pricing service of its own (the command line, a repository script) reads
 * the host's reading of the GLM peak from there. Only the host writes these
 * files; this module reads them and picks the live ones, and never writes.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RowState } from './model.ts'
import type { RulesPaths } from './store.ts'

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
