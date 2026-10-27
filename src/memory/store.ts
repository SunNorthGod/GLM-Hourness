/**
 * Memory store (`.llm/memory/`): entries carry strength/recency metadata and
 * answer retrieval ranked by the Law of Knowledge Decay — memory that is
 * never re-confirmed fades; every review re-strengthens it. The store is
 * JSON over an injected filesystem (load/save whole-store; the volume stays
 * small by policy: only what git cannot answer is stored here).
 */

export interface MemoryEntry {
  readonly id: string
  readonly text: string
  /** Topic tags for retrieval focus. */
  readonly tags: readonly string[]
  readonly created: string
  /** ISO timestamp of the last review/confirmation. */
  lastReviewed: string
  /** Review counter; each retrieval that confirmed the entry increments it. */
  reviews: number
}

export interface MemoryStoreData {
  readonly version: 1
  entries: MemoryEntry[]
}

/** Half-life in days: after this many days without review, strength halves. */
const HALF_LIFE_DAYS = 14

export function emptyStore(): MemoryStoreData {
  return { version: 1, entries: [] }
}

export function parseStore(raw: string): MemoryStoreData {
  const parsed = JSON.parse(raw) as MemoryStoreData
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error('memory store: unsupported format')
  }
  return parsed
}

/**
 * Decay strength of one entry at a reference time: 1.0 at last review,
 * halving every HALF_LIFE_DAYS without review, plus a small per-review
 * bonus (capped) so repeatedly confirmed knowledge persists longer.
 */
export function strength(entry: MemoryEntry, now: string): number {
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(entry.lastReviewed)) / 86_400_000)
  const decayed = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
  const reviewBonus = 1 + Math.min(entry.reviews, 10) * 0.05
  return Math.min(1, decayed * reviewBonus)
}

/** Retrieve entries matching a focus, strongest first; `limit` caps the result. */
export function retrieve(store: MemoryStoreData, focus: string, now: string, limit = 5): MemoryEntry[] {
  const terms = focus.toLowerCase().split(/\s+/).filter(term => term.length > 0)
  const scored = store.entries.map(entry => {
    const haystack = `${entry.text} ${entry.tags.join(' ')}`.toLowerCase()
    const hits = terms.filter(term => haystack.includes(term)).length
    return { entry, score: terms.length === 0 ? strength(entry, now) : hits * strength(entry, now) }
  })
  return scored
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(candidate => candidate.entry)
}

/** Upsert one entry (same id replaces); returns the next store state. */
export function remember(store: MemoryStoreData, entry: Omit<MemoryEntry, 'created' | 'lastReviewed' | 'reviews'> & Partial<Pick<MemoryEntry, 'created' | 'lastReviewed' | 'reviews'>>, now: string): MemoryStoreData {
  const existing = store.entries.find(candidate => candidate.id === entry.id)
  const next: MemoryEntry = {
    id: entry.id,
    text: entry.text,
    tags: entry.tags,
    created: entry.created ?? now,
    lastReviewed: entry.lastReviewed ?? now,
    reviews: entry.reviews ?? (existing?.reviews ?? 0) + 1,
  }
  const entries = existing === undefined
    ? [...store.entries, next]
    : store.entries.map(candidate => candidate.id === entry.id ? next : candidate)
  return { version: 1, entries }
}

/** Forget one entry; returns whether it existed. */
export function forget(store: MemoryStoreData, id: string): { store: MemoryStoreData, existed: boolean } {
  const existed = store.entries.some(entry => entry.id === id)
  return { store: { version: 1, entries: store.entries.filter(entry => entry.id !== id) }, existed }
}

/**
 * Storage policy: memory stores only what git cannot answer. The predicate
 * receives the would-be entry text plus a hook answering "is this knowable
 * from the repo?" (filename hit, doc hit, or a git grep result).
 */
export function shouldStore(entryText: string, knowableFromGit: (text: string) => boolean): boolean {
  return !knowableFromGit(entryText)
}

/** Filesystem the store persists through (subset of node:fs/promises). */
export interface StoreFs {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
}

/** Load `<home>/memory.json`; a missing file yields an empty store, corruption fails loud. */
export async function loadStore(fs: StoreFs, home: string): Promise<MemoryStoreData> {
  let raw: string
  try {
    raw = await fs.readFile(`${home}/memory.json`)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
    throw error
  }
  // A corrupted store must surface, never silently reset: swallowing it here
  // would let the next save overwrite every remembered entry.
  return parseStore(raw)
}

/** Persist the store atomically: temp file + rename, so a crash mid-write cannot corrupt it. */
export async function saveStore(fs: StoreFs, home: string, store: MemoryStoreData): Promise<void> {
  const target = `${home}/memory.json`
  const temp = `${target}.tmp`
  await fs.writeFile(temp, JSON.stringify(store, null, 2))
  await fs.rename(temp, target)
}

/**
 * Strengthen recalled entries: each confirmed retrieval re-stamps
 * lastReviewed and counts a review, so memory that keeps proving useful
 * persists longer. Returns the next store state (or the same object when
 * nothing changed).
 */
export function strengthen(store: MemoryStoreData, ids: readonly string[], now: string): MemoryStoreData {
  if (ids.length === 0) return store
  const wanted = new Set(ids)
  let changed = false
  const entries = store.entries.map(entry => {
    if (!wanted.has(entry.id)) return entry
    changed = true
    return { ...entry, lastReviewed: now, reviews: entry.reviews + 1 }
  })
  return changed ? { version: 1, entries } : store
}
