/**
 * The operations row's kinds (M7 0.6 §3.16, §4.5; `operate.dora` the four
 * delivery numbers of §3.13, m7-9).
 */
import type { OperateBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'operate.report', fields: [
    { name: 'kind', type: 'id' },
    { name: 'lines', type: 'int' },
    { name: 'units', type: 'int' },
  ] },
  { name: 'operate.patrol', fields: [
    { name: 'found', type: 'map' },
    { name: 'did', type: 'id[]' },
    { name: 'trunk', type: 'id' },
  ] },
  { name: 'operate.dora', fields: [
    { name: 'deploys', type: 'int' },
    { name: 'leadTasks', type: 'int' },
    { name: 'leadMs', type: 'int', optional: true },
    { name: 'failed', type: 'int', optional: true },
    { name: 'restoreN', type: 'int' },
    { name: 'restoreMs', type: 'int', optional: true },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchOperateBodies: Expect<Equal<BodiesOf<Tables>, OperateBodies>> = true
void tablesMatchOperateBodies

export const OPERATE_KINDS: readonly KindTable[] = TABLES
