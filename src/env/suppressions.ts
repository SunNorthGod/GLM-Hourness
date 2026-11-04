/**
 * Daily count of the repository's suppression comments (M4 design §6.7;
 * task m4-suppressions): once per repository and UTC+8 day, over the tracked
 * files (`git ls-files`, files over 1 MiB and binary files skipped), the
 * env row appends one record `{at, repo, total, byMarker}` to the project's
 * `.llm/audit/suppressions.jsonl`, and the morning report shows the total
 * and the movement of the period. The count runs in the background and never
 * blocks a step; a failure reaches the row health and nothing else.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from '../data/git-process.ts'
import { SUPPRESSION_MARKERS } from '../shared/suppression-markers.ts'

/** Filesystem the counter reads through (subset of node:fs/promises). */
export interface SuppressionFs {
  readFile(path: string): Promise<Buffer>
}

/** One JSONL line of suppressions.jsonl. */
export interface SuppressionRecord {
  readonly at: string
  /** The repository root the count ran over. */
  readonly repo: string
  readonly total: number
  /** Occurrences per marker; markers with none are left out. */
  readonly byMarker: Readonly<Record<string, number>>
}

/** Files over this size are skipped (they are not where suppressions live). */
const MAX_BYTES = 1024 * 1024

/** The day key the once-per-day rule uses: the calendar day at UTC+8. */
export function suppressionDay(at: Date): string {
  return new Date(at.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Occurrences of every marker in one file's text. Longest markers count
 * first and their matches leave the text, so `eslint-disable-next-line`
 * does not also count as `eslint-disable`.
 */
export function countMarkers(text: string): Readonly<Record<string, number>> {
  const byMarker: Record<string, number> = {}
  let rest = text
  for (const marker of [...SUPPRESSION_MARKERS].sort((a, b) => b.length - a.length)) {
    const count = rest.split(marker).length - 1
    if (count > 0) {
      byMarker[marker] = count
      rest = rest.split(marker).join('')
    }
  }
  return byMarker
}

function isBinary(buffer: Buffer): boolean {
  // git's heuristic: a NUL byte in the first 8000 bytes makes it binary.
  return buffer.subarray(0, 8000).includes(0)
}

/**
 * Count over the tracked files of the repository at `root`, read through
 * `fs` (subset of node:fs/promises for tests). Never throws: a repo that
 * cannot be read counts as zero with the problem told.
 */
export async function countRepository(root: string, fs: SuppressionFs, problem?: (message: string) => void): Promise<SuppressionRecord> {
  const listed = await runGit(root, ['ls-files', '-z'], 30_000)
  if (listed.code !== 0) {
    problem?.(`git ls-files failed: ${listed.err.trim() !== '' ? listed.err.trim() : `exit ${listed.code}`}`)
    return { at: new Date().toISOString(), repo: root, total: 0, byMarker: {} }
  }
  const byMarker: Record<string, number> = {}
  let total = 0
  for (const name of listed.out.split('\0')) {
    if (name === '') continue
    const path = join(root, ...name.split('/'))
    try {
      const info = await stat(path)
      if (info.size > MAX_BYTES) continue
      const buffer = await fs.readFile(path)
      if (isBinary(buffer)) continue
      const counts = countMarkers(buffer.toString('utf8'))
      for (const [marker, count] of Object.entries(counts)) {
        byMarker[marker] = (byMarker[marker] ?? 0) + count
        total += count
      }
    }
    catch {
      continue // a file that vanished between ls-files and the read is simply not counted
    }
  }
  return { at: new Date().toISOString(), repo: root, total, byMarker }
}

/**
 * The once-per-repository-and-day gate over `countRepository`: the process
 * counts a repository at most once per day, and the journal's last record
 * for the same day skips the append too (a restart does not write a second
 * line). `now` and the reader make it testable; both default to the clock
 * and the real file.
 */
export function dailySuppressions(root: string, append: (record: SuppressionRecord) => Promise<void>, options: {
  readonly now?: () => Date
  readonly lastRecord?: () => Promise<SuppressionRecord | undefined> | SuppressionRecord | undefined
  readonly fs?: SuppressionFs
  readonly problem?: (message: string) => void
} = {}): Promise<SuppressionRecord | undefined> {
  const now = options.now ?? ((): Date => new Date())
  const day = suppressionDay(now())
  const counted = daily.find(entry => entry.repo === root)
  if (counted !== undefined) {
    if (counted.day === day) return Promise.resolve(undefined)
    counted.day = day
  }
  else {
    daily.push({ repo: root, day })
  }
  return (async () => {
    const last = await (options.lastRecord?.() ?? Promise.resolve(undefined))
    if (last !== undefined && suppressionDay(new Date(last.at)) === day) return undefined
    const record: SuppressionRecord = { ...(await countRepository(root, options.fs ?? nodeFs, options.problem)), at: now().toISOString() }
    await append(record)
    return record
  })()
}

const daily: Array<{ repo: string, day: string }> = []

const nodeFs: SuppressionFs = { readFile: path => readFile(path) }
