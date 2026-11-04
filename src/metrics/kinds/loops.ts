/**
 * The loop board's eleven kinds (loop board 0.6 §6.10, §4.5): names verbatim
 * from that section, minus `at` and `project`, which the envelope and the
 * file location carry.
 */
import type { LoopBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'loop-fired', fields: [
    { name: 'entry', type: 'id' },
    { name: 'run', type: 'id' },
    { name: 'source', type: 'id' },
    { name: 'plugin', type: 'id', optional: true },
    { name: 'row', type: 'id', optional: true },
    { name: 'trigger', type: { rec: [
      { name: 'kind', type: 'id' },
      { name: 'event', type: 'id', optional: true },
      { name: 'occurrenceAt', type: 'id', optional: true },
    ] } },
    { name: 'events', type: 'int' },
    { name: 'cause', type: 'id', optional: true },
    { name: 'late', type: 'bool', optional: true },
  ] },
  { name: 'loop-done', fields: [
    { name: 'entry', type: 'id' },
    { name: 'run', type: 'id' },
    { name: 'outcome', type: 'id' },
    { name: 'reason', type: 'id', optional: true },
    { name: 'exits', type: 'int[]', optional: true },
    { name: 'durationMs', type: 'int', optional: true },
    { name: 'outputBytes', type: 'int', optional: true },
    { name: 'delivery', type: 'id', optional: true },
    { name: 'messageId', type: 'id', optional: true },
  ] },
  { name: 'loop-entry', fields: [
    { name: 'entry', type: 'id' },
    { name: 'op', type: 'id' },
    { name: 'actor', type: 'id' },
    { name: 'via', type: 'id' },
    { name: 'question', type: 'id', optional: true },
    { name: 'sha256', type: 'id', optional: true },
  ] },
  { name: 'loop-drift', fields: [
    { name: 'entry', type: 'id' },
    { name: 'what', type: 'id' },
  ] },
  { name: 'loop-note', fields: [
    { name: 'entry', type: 'id' },
    { name: 'run', type: 'id', optional: true },
    { name: 'chars', type: 'int' },
  ] },
  { name: 'loop-read', fields: [
    { name: 'entry', type: 'id' },
    { name: 'ok', type: 'bool' },
    { name: 'ms', type: 'int' },
    { name: 'hit', type: 'bool' },
  ] },
  { name: 'loop-contribution', fields: [
    { name: 'plugin', type: 'id' },
    { name: 'row', type: 'id' },
    { name: 'op', type: 'id' },
    { name: 'accepted', type: 'int' },
    { name: 'dropped', type: 'int' },
  ] },
  { name: 'loop-duplicate', fields: [
    { name: 'event', type: 'id' },
    { name: 'key', type: 'id' },
    { name: 'from', type: 'id' },
    { name: 'firstSeen', type: 'id' },
  ] },
  { name: 'loop-holder', fields: [
    { name: 'session', type: 'id', optional: true },
    { name: 'state', type: 'id' },
    { name: 'reason', type: 'id', optional: true },
  ] },
  { name: 'loop-handover', fields: [
    { name: 'op', type: 'id' },
    { name: 'pid', type: 'int' },
    { name: 'session', type: 'id', optional: true },
  ] },
  { name: 'loop-task-delete', fields: [
    { name: 'entry', type: 'id', optional: true },
    { name: 'scheduleId', type: 'id' },
    { name: 'why', type: 'id' },
    { name: 'deleted', type: 'bool' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchLoopBodies: Expect<Equal<BodiesOf<Tables>, LoopBodies>> = true
void tablesMatchLoopBodies

export const LOOP_KINDS: readonly KindTable[] = TABLES
