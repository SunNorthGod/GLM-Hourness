/**
 * The memory index a session starts with (M5 design §3.3): one
 * `<system-reminder>` in the conversation, in the shape of ZCode's MEMORY.md
 * index, that lists what the person's memory holds. Pure: the entries and
 * the time come in, the text comes out; the row decides when to inject it.
 *
 * Which entries: the active ones of the project's memory and of the user's
 * memory, the project's entry hiding the user's of the same name. In what
 * order: preferences first (`user`, then `feedback`, the newer first), then
 * facts by strength. A fact that has faded below 0.1 is not listed, only
 * counted, and `memory_query` still finds it. At most 200 lines and 25,000
 * characters, as in ZCode; what does not fit is dropped from the end and a
 * warning line says so.
 */
import { wrapSystemReminder } from '../shared/zcode-notice.ts'
import { strength, type MemoryEntry, type MemoryState } from './model.ts'

export const INDEX_MAX_LINES = 200
export const INDEX_MAX_CHARS = 25_000
const FADED_BELOW = 0.1

/** The active entries of both scopes, a project entry hiding the user's entry of the same name. */
export function visibleEntries(project: MemoryState | undefined, user: MemoryState | undefined): MemoryEntry[] {
  const own = [...(project?.entries.values() ?? [])].filter(entry => entry.status === 'active')
  const hidden = new Set(own.map(entry => entry.name))
  const shared = [...(user?.entries.values() ?? [])].filter(entry => entry.status === 'active' && !hidden.has(entry.name))
  return [...own, ...shared]
}

export interface MemoryIndex {
  /** The whole reminder, tags included. */
  readonly text: string
  /** Entry lines in `text`. */
  readonly listed: number
  /** Facts too faint to list. */
  readonly faded: number
  /** Whether a limit cut entries off the end. */
  readonly truncated: boolean
}

const byName = (a: MemoryEntry, b: MemoryEntry): number => a.name < b.name ? -1 : a.name > b.name ? 1 : 0
const newestFirst = (a: MemoryEntry, b: MemoryEntry): number => Date.parse(b.created) - Date.parse(a.created) || byName(a, b)

/** What follows the description: the first source of a project fact, or the note that a migrated one has none. */
function sourceNote(entry: MemoryEntry): string {
  if (entry.type !== 'project') return ''
  const first = entry.source[0]
  if (first !== undefined) return ` [source: ${first}]`
  return entry.legacy === true ? ' [source: none, migrated]' : ''
}

const lineOf = (entry: MemoryEntry): string => `- ${entry.name} (${entry.type}) — ${entry.description}${sourceNote(entry)}`

/** The index as the session's first request carries it, or undefined when no entry is active. */
export function renderIndex(entries: readonly MemoryEntry[], now: string): MemoryIndex | undefined {
  const active = entries.filter(entry => entry.status === 'active')
  if (active.length === 0) return undefined
  const strengths = new Map(active.map(entry => [entry, strength(entry, now)]))
  const strengthOf = (entry: MemoryEntry): number => strengths.get(entry) ?? 0
  const faded = active.filter(entry => entry.kind === 'fact' && strengthOf(entry) < FADED_BELOW).length
  const shown = active.filter(entry => entry.kind === 'preference' || strengthOf(entry) >= FADED_BELOW)
  const ordered = [
    ...shown.filter(entry => entry.type === 'user').sort(newestFirst),
    ...shown.filter(entry => entry.type === 'feedback').sort(newestFirst),
    ...shown.filter(entry => entry.kind === 'fact').sort((a, b) => strengthOf(b) - strengthOf(a) || newestFirst(a, b)),
  ].map(lineOf)
  let kept = 0
  let chars = 0
  while (kept < ordered.length && kept < INDEX_MAX_LINES) {
    const next = chars + (kept === 0 ? 0 : 1) + (ordered[kept]?.length ?? 0)
    if (next > INDEX_MAX_CHARS) break
    chars = next
    kept += 1
  }
  const total = ordered.join('\n').length
  const warnings = [
    ...(ordered.length > INDEX_MAX_LINES ? [`> WARNING: the memory index is ${ordered.length} lines (limit: ${INDEX_MAX_LINES}). Only part of it was loaded.`] : []),
    ...(total > INDEX_MAX_CHARS ? [`> WARNING: the memory index is ${total} characters (limit: ${INDEX_MAX_CHARS}). Only part of it was loaded.`] : []),
  ]
  const lines = [
    'Contents of the memory index (user\'s auto-memory, persists across conversations):',
    ...(kept > 0 || warnings.length > 0 ? ['', ...ordered.slice(0, kept), ...warnings] : []),
    '',
    ...(faded === 0 ? [] : [`${faded} faded ${faded === 1 ? 'memory is' : 'memories are'} not listed; memory_query finds ${faded === 1 ? 'it' : 'them'}.`]),
    'Read a memory in full with memory_query {"name": "<name>"}.',
  ]
  return { text: wrapSystemReminder(lines.join('\n')), listed: kept, faded, truncated: kept < ordered.length }
}
