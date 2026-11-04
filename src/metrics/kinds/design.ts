/**
 * The design row's eight kinds and the git snapshot's two (M3 addendum 0.6
 * §3.12, §4.5): the names that section wrote verbatim, the rest named by the
 * metrics design; the value lists (question forms, actions, storage places,
 * reason codes) stay in the M3 design, so those fields are ids. All fields
 * the 0.6 addendum added are optional, so an event written by the released
 * 0.5 still passes.
 */
import type { DesignBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'design.proposal-shown', fields: [
    { name: 'kind', type: 'id' },
    { name: 'form', type: 'id', optional: true },
    { name: 'number', type: 'int' },
    { name: 'goal', type: 'id' },
    { name: 'module', type: 'id', optional: true },
    { name: 'pending', type: 'id' },
    { name: 'attach', type: 'id', optional: true },
    { name: 'units', type: 'int' },
    { name: 'points', type: 'int', optional: true },
    { name: 'sample', type: 'bool', optional: true },
    { name: 'again', type: 'bool' },
  ] },
  { name: 'design.answer-recorded', fields: [
    { name: 'kind', type: 'id' },
    { name: 'form', type: 'id', optional: true },
    { name: 'answer', type: 'id' },
    { name: 'outcome', type: 'id' },
    { name: 'goal', type: 'id' },
    { name: 'module', type: 'id', optional: true },
    { name: 'pending', type: 'id' },
    { name: 'ms', type: 'int' },
    { name: 'units', type: 'int' },
    { name: 'noted', type: 'bool' },
    { name: 'delegated', type: 'bool', optional: true },
    { name: 'pickedRecommended', type: 'bool', optional: true },
  ] },
  { name: 'design.delegation', fields: [
    { name: 'action', type: 'id' },
    { name: 'count', type: 'int' },
    { name: 'scopeUnits', type: 'int' },
    { name: 'where', type: 'id' },
  ] },
  { name: 'design.proposal-refused', fields: [
    { name: 'kind', type: 'id' },
    { name: 'form', type: 'id', optional: true },
    { name: 'code', type: 'id' },
    { name: 'field', type: 'id', optional: true },
    { name: 'within', type: 'id', optional: true },
    { name: 'attach', type: 'id', optional: true },
  ] },
  { name: 'design.answer-refused', fields: [
    { name: 'kind', type: 'id' },
    { name: 'code', type: 'id' },
  ] },
  { name: 'design.holder-moved', fields: [
    { name: 'how', type: 'id' },
    { name: 'from', type: 'id', optional: true },
    { name: 'to', type: 'id', optional: true },
  ] },
  { name: 'design.rule-denied', fields: [
    { name: 'rule', type: 'id' },
    { name: 'tool', type: 'id' },
    { name: 'sessionKind', type: 'id' },
  ] },
  { name: 'design.bypass-refused', fields: [
    { name: 'rule', type: 'id' },
    { name: 'sessionKind', type: 'id' },
    { name: 'goal', type: 'id' },
    { name: 'from', type: 'id' },
    { name: 'to', type: 'id' },
  ] },
  { name: 'git.snapshot', fields: [
    { name: 'class', type: 'id' },
    { name: 'saved', type: 'map' },
    { name: 'tagged', type: 'bool' },
    { name: 'ignored', type: 'int' },
    { name: 'ignoredBytes', type: 'int' },
    { name: 'ms', type: 'int' },
  ] },
  { name: 'git.snapshot-refused', fields: [
    { name: 'code', type: 'id' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchDesignBodies: Expect<Equal<BodiesOf<Tables>, DesignBodies>> = true
void tablesMatchDesignBodies

export const DESIGN_KINDS: readonly KindTable[] = TABLES
