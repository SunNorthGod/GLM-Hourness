/**
 * The GLM channel's four kinds (M6 0.6 §14.2, §4.5).
 */
import type { GlmBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'glm.quota-read', fields: [
    { name: 'ok', type: 'bool' },
    { name: 'why', type: 'id', optional: true },
    { name: 'ms', type: 'int' },
    { name: 'by', type: 'id' },
    { name: 'windows', type: 'map' },
    { name: 'dropped', type: 'int' },
  ] },
  { name: 'glm.upstream-limit', fields: [
    { name: 'code', type: 'id' },
    { name: 'hasReset', type: 'bool' },
  ] },
  { name: 'glm.login-rejected', fields: [
    { name: 'path', type: 'id' },
    { name: 'status', type: 'int', optional: true },
    { name: 'code', type: 'id', optional: true },
  ] },
  { name: 'glm.peak-reminder', fields: [
    { name: 'window', type: 'id' },
    { name: 'mode', type: 'id' },
    { name: 'note', type: 'id', optional: true },
    { name: 'cap', type: 'int', optional: true },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchGlmBodies: Expect<Equal<BodiesOf<Tables>, GlmBodies>> = true
void tablesMatchGlmBodies

export const GLM_KINDS: readonly KindTable[] = TABLES
