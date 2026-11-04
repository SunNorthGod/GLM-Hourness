/**
 * The registry of every kind table (metrics design §4.2): one entry per
 * event kind, built from the namespace files. The writer validates and
 * serializes against it, the reader validates lines with it; acceptance 5
 * of the design pins each namespace's list to the section it came from.
 */
import type { KindTable } from '../schema.ts'
import { BOOTSTRAP_KINDS } from './bootstrap.ts'
import { DESIGN_KINDS } from './design.ts'
import { EXECUTE_KINDS } from './execute.ts'
import { GLM_KINDS } from './glm.ts'
import { HOST_KINDS } from './host.ts'
import { LOOP_KINDS } from './loops.ts'
import { OPERATE_KINDS } from './operate.ts'
import { PROGRESS_KINDS } from './progress.ts'
import { RULES_KINDS } from './rules.ts'
import { TIMEOUT_KINDS } from './timeout.ts'

export const METRICS_KINDS: ReadonlyMap<string, KindTable> = new Map(
  [...HOST_KINDS, ...TIMEOUT_KINDS, ...PROGRESS_KINDS, ...RULES_KINDS, ...LOOP_KINDS, ...EXECUTE_KINDS, ...OPERATE_KINDS, ...GLM_KINDS, ...DESIGN_KINDS, ...BOOTSTRAP_KINDS]
    .map((table) => [table.name, table]),
)
