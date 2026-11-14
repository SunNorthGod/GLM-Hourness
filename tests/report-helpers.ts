/**
 * Shared fixtures of the report specs (four-answers, weekly, status): the
 * reports' fixture clock, a status entry the hub holds, and the reader of
 * one report section.
 */
import assert from 'node:assert/strict'
import type { HistoryEntry } from '../src/graph/schema.ts'
import type { StatusItem } from '../src/shared/status.ts'
import { at } from './execute-helpers.ts'

/** The reports' fixture moment: the 100th second of the execute helpers' base hour. */
const NOW = Date.parse(at(100))
/** The reports' fixture period start: the 50th second; the specs read it to window their graphs. */
export const SINCE = at(50)

/** A status entry the hub holds, with the parts a test changes. */
export function hubEntry(id: string, text: string, extra?: { detail?: string[], owner?: string }): StatusItem {
  return {
    id,
    owner: extra?.owner ?? id.slice(0, id.indexOf('/')),
    audience: 'agent',
    asOf: at(90),
    source: 'test/fixture',
    text,
    ...(extra?.detail === undefined ? {} : { detail: extra.detail }),
  }
}

/** The lines of one `## ` section: from under its title to the next heading or a blank line, blanks dropped. */
export function section(text: string, title: string): string[] {
  const lines = text.split('\n')
  const start = lines.indexOf(title)
  assert.ok(start >= 0, title)
  let end = lines.length
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index].startsWith('## ')) {
      end = index
      break
    }
  }
  const kept: string[] = []
  for (let index = start + 1; index < end; index++) {
    if (lines[index] === '') break
    kept.push(lines[index])
  }
  return kept
}

/** The base of a report input: the fixture's fixed period label, clock and period start, with the graph in. */
export function reportInput<G>(graph: G): { period: string, nowMs: number, since: string, status: readonly StatusItem[], graph: G } {
  return { period: '2026-10-30', nowMs: NOW, since: SINCE, status: [], graph }
}

/** A decide entry the graph fixtures attach, with the parts a test changes. */
export const decide = (n: number, reason: string, extra: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({ at: at(n), actor: 'llm', op: 'decide', reason, ...extra })
