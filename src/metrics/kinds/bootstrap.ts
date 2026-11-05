/**
 * The takeover's trial kind (takeover 0.6, §4.5): fields one to one with
 * its trial-run record. The command id is already an id, not command text,
 * so the "first word of a shell command" rule of §4.3 does not apply, and
 * the run's log path and exit code stay in the takeover's own trial.json.
 */
import type { BootstrapBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'bootstrap.trial', fields: [
    { name: 'commandId', type: 'id' },
    { name: 'round', type: 'int' },
    { name: 'outcome', type: 'id' },
    { name: 'limitMs', type: 'int' },
    { name: 'limitSource', type: 'id' },
    { name: 'ms', type: 'int', optional: true },
    { name: 'envKey', type: 'id' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchBootstrapBodies: Expect<Equal<BodiesOf<Tables>, BootstrapBodies>> = true
void tablesMatchBootstrapBodies

export const BOOTSTRAP_KINDS: readonly KindTable[] = TABLES
