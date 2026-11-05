/**
 * The violation journals the rules page counts (docs/ORCHESTRATION.md §16.14
 * 「谁的数」): the project's journal (`projectHomeFor`), which the rules row's
 * own gate and the guard framework's rows write and the guard row's status
 * view reads. Given more than one file, a line that is in several is counted
 * once; lines of one file are kept as they are.
 *
 * The page is computed every 15 seconds, and a journal only grows, so the
 * records of a project's journals are kept and read again only when a file's
 * size or modification time changed (or it appeared or went).
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { journalRecords, type GuardRecord } from '../guard/records.ts'
import { readText } from './store.ts'

/** The size and modification time of a file, or 'none' when it is not there; other failures throw. */
function stamp(file: string): string {
  try {
    const stats = statSync(file)
    return `${stats.size}:${stats.mtimeMs}`
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'none'
    throw error
  }
}

/** A reader of the records of a set of journal files, in file order, that rereads only what changed. */
export function journalsReader(): (files: ReadonlyArray<string | undefined>) => GuardRecord[] {
  const cache = new Map<string, { readonly key: string, readonly records: GuardRecord[] }>()
  return (files) => {
    const distinct = [...new Set(files.flatMap(file => file === undefined ? [] : [resolve(file)]))]
    const slot = distinct.join('\n')
    const key = distinct.map(file => `${file}|${stamp(file)}`).join('\n')
    const kept = cache.get(slot)
    if (kept?.key === key) return kept.records
    const earlier = new Set<string>()
    const lines: string[] = []
    for (const file of distinct) {
      const own = (readText(file) ?? '').split('\n').map(line => line.trim()).filter(line => line.length > 0)
      lines.push(...own.filter(line => !earlier.has(line)))
      for (const line of own) earlier.add(line)
    }
    const records = journalRecords(lines.join('\n'))
    cache.set(slot, { key, records })
    return records
  }
}
