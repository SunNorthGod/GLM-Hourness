/**
 * The lifted rules of one project (m4-gate G1, design §3.5): the record of
 * the human's decisions is `docs/guard/lifts.jsonl` in the project root,
 * append-only, one JSON line per lift or restore. A rule's state is its
 * last line's action. G1 lands the read side only — the gate removes lifted
 * rules before judging and the declaration stops listing them — and a file
 * that is absent or unreadable lifts nothing, so the rules keep blocking.
 * The write entry points (guard_lift, the rules board's hand-over) arrive
 * with G3. Reading costs one stat per judgment: the parsed set is cached
 * per project root and re-read only when the file's size or mtime changed.
 */
import { readFileSync, statSync, type Stats } from 'node:fs'
import { join } from 'node:path'

/** The path relative to the project root; the exact file the writer (G3) appends to. */
const LIFTS_FILE = join('docs', 'guard', 'lifts.jsonl')

interface LiftLine {
  readonly at: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  readonly via: 'chat' | 'board'
  readonly words: string
}

const isLiftLine = (value: unknown): value is LiftLine => {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return typeof line.at === 'string' && typeof line.rule === 'string' && line.rule.length > 0
    && (line.action === 'lift' || line.action === 'restore')
    && (line.via === 'chat' || line.via === 'board')
    && typeof line.words === 'string'
}

interface Cached {
  readonly size: number
  readonly mtime: number
  readonly lifted: ReadonlySet<string>
}

const cache = new Map<string, Cached>()

const EMPTY: ReadonlySet<string> = new Set()

/** The ids of the rules currently lifted in the project at `root`; empty when the file is absent or unreadable. */
export function liftedRules(root: string): ReadonlySet<string> {
  const file = join(root, LIFTS_FILE)
  let stats: Stats
  try {
    stats = statSync(file)
  }
  catch {
    return EMPTY
  }
  const known = cache.get(root)
  if (known !== undefined && known.size === stats.size && known.mtime === stats.mtimeMs) return known.lifted
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  }
  catch {
    return EMPTY
  }
  const lifted = new Set<string>()
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isLiftLine(parsed)) {
        if (parsed.action === 'lift') lifted.add(parsed.rule)
        else lifted.delete(parsed.rule)
      }
    }
    catch {
      // A line a hand cannot have written (the writer is G3's) is skipped: no rule rides on it.
    }
  }
  const fresh: Cached = { size: stats.size, mtime: stats.mtimeMs, lifted: new Set(lifted) }
  cache.set(root, fresh)
  return fresh.lifted
}
