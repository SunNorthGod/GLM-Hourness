/**
 * The conclusions the main agent records on a run of an entry (docs/ORCHESTRATION.md
 * §18; loop board design 0.6 §6.10, §7.3 `loop_note`): `.llm/loops/notes.jsonl`,
 * one line per note, at most 20 per entry — the page lists them when the entry
 * is opened, and the metrics journal carries only the word count (kind
 * `loop-note`, §6.10). Reads tolerate what a crash or a hand edit leaves: a
 * line that cannot be read is skipped, the rest stands.
 */
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { appendLine, readText, writeAtomic, type StoreIo } from '../rules/store.ts'

/** One conclusion the main agent recorded, hung on the run it was about. */
export interface EntryNote {
  readonly entry: string
  readonly run: string
  readonly at: string
  readonly text: string
}

/** The notes of one entry the file keeps, at most (design §6.10). */
const NOTES_PER_ENTRY = 20

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The notes the file holds, oldest first; a line that cannot be read is skipped. */
export function notesOf(paths: { readonly notes: string }): readonly EntryNote[] {
  const raw = readText(paths.notes) ?? ''
  const found: EntryNote[] = []
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    }
    catch {
      continue
    }
    if (!isRecord(value) || typeof value.entry !== 'string' || typeof value.run !== 'string' || typeof value.at !== 'string' || typeof value.text !== 'string') continue
    found.push({ entry: value.entry, run: value.run, at: value.at, text: value.text })
  }
  return found
}

/**
 * Append one note; when the entry's notes reach the cap, the file is rewritten
 * with the newest `NOTES_PER_ENTRY` of that entry and every other entry as it
 * stands. The caller holds the store's write lock, so read and write are one
 * step; a write that fails leaves the file as it was (the tool's answer says
 * the note was recorded on the run, which the metrics journal holds anyway).
 */
export async function addNote(paths: { readonly notes: string }, io: StoreIo, note: EntryNote): Promise<boolean> {
  const held = notesOf(paths)
  const mine = held.filter(line => line.entry === note.entry)
  if (mine.length + 1 <= NOTES_PER_ENTRY) {
    await mkdir(dirname(paths.notes), { recursive: true })
    await appendLine(paths.notes, note)
    return true
  }
  const keep = new Set(mine.slice(-(NOTES_PER_ENTRY - 1)))
  const trimmed = [...held.filter(line => line.entry !== note.entry), ...keep, note]
  const written = await writeAtomic(paths.notes, `${trimmed.map(line => JSON.stringify(line)).join('\n')}\n`, io)
  if (!written.ok) {
    const { unlink } = await import('node:fs/promises')
    await unlink(written.temporary).catch(() => {})
    return false
  }
  return true
}
