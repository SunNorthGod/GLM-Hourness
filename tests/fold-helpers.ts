/**
 * Folding a list of journal records in a test: the state at the end, and the
 * reason for each record the fold skipped. Shared by the memory and the
 * lessons model specs.
 */
import type { FoldStep, JournalRecord } from '../src/data/journal.ts'

export interface Folded<State> {
  readonly state: State
  readonly bad: readonly string[]
}

export function foldRecords<State>(apply: (state: State, record: JournalRecord) => FoldStep<State>, records: readonly JournalRecord[], from: State): Folded<State> {
  let state = from
  const bad: string[] = []
  for (const record of records) {
    const step = apply(state, record)
    if ('bad' in step) bad.push(step.bad)
    else state = step.state
  }
  return { state, bad }
}
