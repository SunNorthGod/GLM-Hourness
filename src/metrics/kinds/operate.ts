/**
 * The operations row's two kinds (M7 0.6 §3.16, §4.5).
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
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchOperateBodies: Expect<Equal<BodiesOf<Tables>, OperateBodies>> = true
void tablesMatchOperateBodies

export const OPERATE_KINDS: readonly KindTable[] = TABLES
