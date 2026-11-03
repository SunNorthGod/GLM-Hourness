/**
 * The two timeout kinds the 2026-10-31 decision named (`d-timeout-measured`,
 * §4.2 second table). The `by` is the board that hands them in — rules,
 * loops, env or execute — so the table fixes names only; the value lists of
 * `entry`, `kind` and `outcome` stay with the senders (§4.4).
 */
import type { TimeoutBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'timeout.set', fields: [
    { name: 'entry', type: 'id' },
    { name: 'kind', type: 'id' },
    { name: 'limitMs', type: 'int' },
    { name: 'prevMs', type: 'int', optional: true },
    { name: 'source', type: ['estimate', 'measured', 'default', 'ceiling', 'fixed'] },
    { name: 'estMs', type: 'int', optional: true },
    { name: 'estSession', type: 'id', optional: true },
    { name: 'floored', type: 'bool', optional: true },
    { name: 'runs', type: 'int', optional: true },
    { name: 'runIds', type: 'id[]', optional: true },
    { name: 'slowestMs', type: 'int', optional: true },
    { name: 'wantedMs', type: 'int', optional: true },
    { name: 'told', type: 'bool', optional: true },
  ] },
  { name: 'timeout.hit', fields: [
    { name: 'entry', type: 'id' },
    { name: 'kind', type: 'id' },
    { name: 'limitMs', type: 'int' },
    { name: 'elapsedMs', type: 'int' },
    { name: 'outcome', type: 'id' },
    { name: 'source', type: ['estimate', 'measured', 'default', 'ceiling', 'fixed'] },
    { name: 'told', type: 'bool' },
    { name: 'run', type: 'id', optional: true },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchTimeoutBodies: Expect<Equal<BodiesOf<Tables>, TimeoutBodies>> = true
void tablesMatchTimeoutBodies

export const TIMEOUT_KINDS: readonly KindTable[] = TABLES
