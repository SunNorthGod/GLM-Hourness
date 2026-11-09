/**
 * The memory row's two kinds (project graph node m5-index-truncation-alarm,
 * ORCHESTRATION §8.3): the session index cut at its line or character cap,
 * and a memory_query that found nothing. Counts and value lists only; no
 * field can carry a memory's text or the words of a query.
 */
import type { MemoryBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'memory.index-truncated', fields: [
    { name: 'eligible', type: 'int' },
    { name: 'shown', type: 'int' },
    { name: 'dropped', type: 'int' },
    { name: 'chars', type: 'int' },
    { name: 'cap', type: ['lines', 'chars'] },
    { name: 'again', type: 'bool' },
  ] },
  { name: 'memory.query-empty', fields: [
    { name: 'mode', type: ['focus', 'name'] },
    { name: 'type', type: ['user', 'feedback', 'project', 'reference'], optional: true },
    { name: 'searched', type: 'int' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchMemoryBodies: Expect<Equal<BodiesOf<Tables>, MemoryBodies>> = true
void tablesMatchMemoryBodies

export const MEMORY_KINDS: readonly KindTable[] = TABLES
