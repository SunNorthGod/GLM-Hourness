/**
 * The two handover kinds the 2026-10-31 decision named (plugin usage flow
 * G18, §4.2 second table); M7 sends them. What counts as a part is M7's to
 * define; the table fixes names only.
 */
import type { ProgressBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'progress.due', fields: [
    { name: 'goal', type: 'id' },
    { name: 'part', type: 'id', optional: true },
    { name: 'scope', type: ['part', 'goal'] },
    { name: 'away', type: 'bool' },
  ] },
  { name: 'progress.handover', fields: [
    { name: 'n', type: 'int' },
    { name: 'waitedMs', type: 'int' },
    { name: 'goalDone', type: 'bool' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchProgressBodies: Expect<Equal<BodiesOf<Tables>, ProgressBodies>> = true
void tablesMatchProgressBodies

export const PROGRESS_KINDS: readonly KindTable[] = TABLES
