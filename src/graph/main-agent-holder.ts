/**
 * Which session is the main agent of a project (docs/ORCHESTRATION.md §3.1;
 * decision d-one-main-agent): a project has exactly one main agent session,
 * recorded in one small file under the DSH user directory. The project is
 * the graph directory; two work trees of one repository have two graph
 * directories and so two projects. The design row decides with the record
 * who is the main agent; the graph panel row reads it to jump to the
 * conversation; the morning report, the weekly report and the loop board's
 * delivery find the session through `mainAgentOf`.
 *
 * Host only (node:fs, node:crypto): the record is the machine's, next to
 * the session ids it names, not the project's. Writes go through a temporary
 * file in the same directory: a claim by `link` (it fails if the record
 * exists, so two sessions claiming at once leave exactly one winner), a
 * replacement by `rename`. Reads are synchronous and cached on the file's
 * modification time and size.
 */
import { createHash, randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { dataService, userDataHome } from '../shared/data-home.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'
import { holderRecordOf, type HolderRecord } from '../shared/holder-record.ts'

export type { HolderRecord }

export type HolderReading =
  | { readonly kind: 'none' }
  | { readonly kind: 'held', readonly record: HolderRecord }
  | { readonly kind: 'unreadable', readonly reason: string }

/**
 * The key of a project: its graph directory with symbolic links and
 * junctions resolved (else as given, made absolute), `/` separators, no
 * trailing `/`, lower case on Windows.
 */
export function projectKey(dir: string): string {
  let real: string
  try {
    real = realpathSync.native(dir)
  }
  catch {
    real = resolve(dir)
  }
  const slashed = real.replaceAll('\\', '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed
}

/** The record file of a project key under the user directory. */
export function holderFile(userHome: string, key: string): string {
  return join(userHome, 'main-agent', `${createHash('sha256').update(key).digest('hex').slice(0, 16)}.json`)
}

/** The record file of the project whose graph directory is `dir`. */
export function holderFileOf(userHome: string, dir: string): string {
  return holderFile(userHome, projectKey(dir))
}

/** The user directory the records live in: the data service's, else the default under the DSH home. */
export function holderHome(ctx: ServiceLookup): string {
  return dataService(ctx)?.userHome ?? userDataHome()
}

const cache = new Map<string, { readonly stamp: string, readonly reading: HolderReading }>()

/** Read a record file; a missing file is `none`, a file that is not a record is `unreadable` with the reason. */
export function readHolder(file: string): HolderReading {
  let stamp: string
  try {
    const { mtimeMs, size } = statSync(file)
    stamp = `${mtimeMs}/${size}`
  }
  catch (error) {
    cache.delete(file)
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'none' } : { kind: 'unreadable', reason: (error as Error).message }
  }
  const cached = cache.get(file)
  if (cached?.stamp === stamp) return cached.reading
  let reading: HolderReading
  try {
    const record = holderRecordOf(JSON.parse(readFileSync(file, 'utf8')))
    reading = record === undefined ? { kind: 'unreadable', reason: '记录的内容不是主 Agent 记录' } : { kind: 'held', record }
  }
  catch (error) {
    reading = { kind: 'unreadable', reason: (error as Error).message }
  }
  cache.set(file, { stamp, reading })
  return reading
}

/** A temporary file next to the record, with the record's text; the caller removes or renames it. */
function stage(file: string, record: HolderRecord): string {
  cache.delete(file)
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record)}\n`, { flag: 'wx' })
  return temporary
}

/**
 * Write the record only if there is none: true when it is now this
 * record, false when another one was there first. Throws on any other
 * failure (the caller reports it to the person).
 */
export function claimHolder(file: string, record: HolderRecord): boolean {
  const temporary = stage(file, record)
  try {
    linkSync(temporary, file)
    cache.delete(file)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
  finally {
    // Cleanup must not fail the claim: the record is written, and a temporary file left behind is the lesser harm (S3-3).
    try {
      unlinkSync(temporary)
    }
    catch {
      // the holder record is in place
    }
  }
}

/** Replace whatever is at the path with this record. Throws on failure. */
export function replaceHolder(file: string, record: HolderRecord): void {
  const temporary = stage(file, record)
  try {
    renameSync(temporary, file)
    cache.delete(file)
  }
  catch (error) {
    // The rename error is the one to report; the cleanup failure must not mask it (S3-3).
    try {
      unlinkSync(temporary)
    }
    catch {
      // a temporary file left behind
    }
    throw error
  }
}

/** Delete the record if it still names this session; true when it was deleted. Throws on a failure other than the file being gone. */
export function releaseHolder(file: string, sessionId: string): boolean {
  const reading = readHolder(file)
  if (reading.kind !== 'held' || reading.record.sessionId !== sessionId) return false
  try {
    cache.delete(file)
    unlinkSync(file)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * The session that is the main agent of the project whose graph directory
 * is `dir`, or undefined when there is none or the record cannot be read.
 */
export function mainAgentOf(userHome: string, dir: string): HolderRecord | undefined {
  const reading = readHolder(holderFileOf(userHome, dir))
  return reading.kind === 'held' ? reading.record : undefined
}
