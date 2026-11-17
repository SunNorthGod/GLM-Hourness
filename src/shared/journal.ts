/**
 * The two pieces every append-only JSON-lines journal of this row set shares
 * (M4's timing journal, src/env/timeout.ts; the rules board's script timing
 * journal, src/rules/timing.ts): the parse of a journal's text into the lines
 * nothing could read, and the tidied rewrite through a temporary file and a
 * rename.
 */
import { rename, writeFile } from 'node:fs/promises'

/** A journal as it was read: its readable lines in order, and how many lines could not be read. */
export interface JournalBook<T> {
  readonly lines: readonly T[]
  readonly bad: number
}

/** The lines of a journal text: a line that is not JSON or does not pass `accepts` is counted and skipped. Pure. */
export function parseJournal<T>(text: string, accepts: (value: unknown) => value is T): JournalBook<T> {
  const lines: T[] = []
  let bad = 0
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    try {
      const line: unknown = JSON.parse(raw)
      if (accepts(line)) lines.push(line)
      else bad++
    }
    catch {
      bad++
    }
  }
  return { lines, bad }
}

/**
 * Rewrite a journal file with the given lines, through a temporary file and a
 * rename (a failure leaves the journal as it was); `what` names the journal
 * in the problem. Never throws.
 */
export async function rewriteJournal(file: string, lines: readonly unknown[], what: string): Promise<string | undefined> {
  const temporary = `${file}.${process.pid}.tmp`
  try {
    await writeFile(temporary, lines.map(line => `${JSON.stringify(line)}\n`).join(''), 'utf8')
    await rename(temporary, file)
    return undefined
  }
  catch (error) {
    return `${what}没整理成（${(error as NodeJS.ErrnoException).code ?? String(error)}）`
  }
}
