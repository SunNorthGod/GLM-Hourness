/**
 * The drive's small journal `<exec>/drive.jsonl` (M7 design 0.6 §3.9.1
 * "重启前的暂停", §3.9.5): append-only lines, each synced, that let a later
 * process tell a pause the app's shutdown caused from the person's own.
 *
 * - `start` when the row first serves a holder of the project in this
 *   process, `exit` from the row's dispose (synchronously, so the line lands
 *   before the host goes away);
 * - `pause` when the holder's goal is paused (`goal/changed`);
 * - `peak-wait` and `design-wait` when the drive blocks the goal, `resume`
 *   when the drive resumes it (with its reason).
 *
 * `goal` is the DSH goal id. Above 1 MiB the file is renamed aside to
 * `drive-<stamp>.jsonl` and a new one starts. The reconcile's journal
 * `<exec>/reconcile.jsonl` (§3.9.6) is written the same way: one line per
 * run, `{key, at, lost, replayed, evidence}`. `restartPause` is the pure
 * judgement of §3.9.1: the latest pause was written by another process, that
 * process wrote its `exit` at most 30 seconds later, and no human input came
 * in between.
 */
import { closeSync, fsyncSync, openSync, renameSync, statSync, writeSync } from 'node:fs'
import { open, readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureExecDir } from './gate-lock.ts'

/** One line of drive.jsonl. */
export interface DriveLine {
  readonly op: 'start' | 'pause' | 'exit' | 'peak-wait' | 'design-wait' | 'resume'
  /** The process that wrote it: `Math.round(performance.timeOrigin)`. */
  readonly proc: number
  readonly at: string
  /** The DSH goal id the line is about. */
  readonly goal?: string
  /** `peak-wait`: the end of the peak (ISO 8601). */
  readonly until?: string
  /** `peak-wait`: the peak mode's level. */
  readonly level?: string
  /** `resume`: why the drive resumed. */
  readonly reason?: string
}

const FILE = 'drive.jsonl'
const ROTATE_BYTES = 1024 * 1024
/** How close the host's exit must follow the pause to count as the shutdown's pause (§3.9.1). */
const HUG_MS = 30_000

const stamp = (at: string): string => at.replace(/[:.]/g, '-')

/** Append one JSON line to `<exec>/<name>.jsonl`, synced; the file is renamed aside to `<name>-<stamp>.jsonl` above 1 MiB. */
async function appendSynced(execDir: string, name: string, at: string, value: unknown): Promise<void> {
  await ensureExecDir(execDir)
  const file = join(execDir, `${name}.jsonl`)
  const size = await stat(file).then(info => info.size, () => 0)
  if (size > ROTATE_BYTES) await rename(file, join(execDir, `${name}-${stamp(at)}.jsonl`))
  const handle = await open(file, 'a')
  try {
    await handle.write(`${JSON.stringify(value)}\n`)
    await handle.sync()
  }
  finally {
    await handle.close()
  }
}

/** Append one line, synced; the file is renamed aside above 1 MiB. */
export async function appendDrive(execDir: string, line: DriveLine): Promise<void> {
  await appendSynced(execDir, 'drive', line.at, line)
}

/** One line of `<exec>/reconcile.jsonl` (§3.9.6): the event key the reconcile ran for and what it found. */
export interface ReconcileLine {
  readonly key: string
  readonly at: string
  /** Dispatches commented as lost. */
  readonly lost: number
  /** Handbacks processed from the session projection, and harness actions run again. */
  readonly replayed: number
  /** Trunk evidence and goal completions written. */
  readonly evidence: number
}

export async function appendReconcile(execDir: string, line: ReconcileLine): Promise<void> {
  await appendSynced(execDir, 'reconcile', line.at, line)
}

/** The event keys reconcile.jsonl holds: the reconcile is idempotent per key (§3.9.6). */
export async function reconciledKeys(execDir: string): Promise<ReadonlySet<string>> {
  const text = await readFile(join(execDir, 'reconcile.jsonl'), 'utf8').catch(() => '')
  const keys = new Set<string>()
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    try {
      const value = JSON.parse(raw) as { readonly key?: unknown }
      if (typeof value.key === 'string') keys.add(value.key)
    }
    catch {
      // A line that does not parse names no key.
    }
  }
  return keys
}

/**
 * The same, synchronously, for the exit line the row's dispose writes while
 * the host shuts down. The directory exists already: the row writes `exit`
 * only for a project it wrote `start` for. Throws what the file system throws.
 */
export function appendDriveSync(execDir: string, line: DriveLine): void {
  const file = join(execDir, FILE)
  let size: number
  try {
    size = statSync(file).size
  }
  catch {
    size = 0
  }
  if (size > ROTATE_BYTES) renameSync(file, join(execDir, `drive-${stamp(line.at)}.jsonl`))
  const fd = openSync(file, 'a')
  try {
    writeSync(fd, `${JSON.stringify(line)}\n`)
    fsyncSync(fd)
  }
  finally {
    closeSync(fd)
  }
}

/** The lines of the current file, oldest first; a line that does not parse is skipped, a missing file is empty. */
export async function readDrive(execDir: string): Promise<DriveLine[]> {
  const text = await readFile(join(execDir, FILE), 'utf8').catch(() => '')
  return text.split('\n').flatMap((raw) => {
    if (raw.trim() === '') return []
    try {
      const value = JSON.parse(raw) as Partial<DriveLine>
      const ops: readonly unknown[] = ['start', 'pause', 'exit', 'peak-wait', 'design-wait', 'resume']
      return ops.includes(value.op) && typeof value.proc === 'number' && typeof value.at === 'string' ? [value as DriveLine] : []
    }
    catch {
      return []
    }
  })
}

/**
 * Whether the latest pause hugged a host exit (§3.9.1, review N3): it was
 * written by another process than `proc`, that process wrote `exit` at most
 * 30 seconds after it, and `humanInputBetween(pause, exit)` is false. The
 * seconds between the two, or undefined. The caller passes only the lines of
 * the goal it judges (a `pause` line carries the goal; `exit` lines do not).
 */
export function restartPause(lines: readonly DriveLine[], proc: number, humanInputBetween: (from: string, to: string) => boolean): { readonly seconds: number } | undefined {
  const pause = lines.filter(line => line.op === 'pause').at(-1)
  if (pause === undefined || pause.proc === proc) return undefined
  const paused = Date.parse(pause.at)
  const exit = lines.find(line => line.op === 'exit' && line.proc === pause.proc && Date.parse(line.at) >= paused)
  if (exit === undefined) return undefined
  const gap = Date.parse(exit.at) - paused
  if (gap > HUG_MS || humanInputBetween(pause.at, exit.at)) return undefined
  return { seconds: Math.round(gap / 1000) }
}
