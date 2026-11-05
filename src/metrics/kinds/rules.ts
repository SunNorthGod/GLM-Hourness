/**
 * The rules board's fifteen kinds (rules board 0.10 §10.5, §4.5): names
 * verbatim from that section where it named them, ids where the value lists
 * stay in the rules design.
 */
import type { RulesBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'rules.judged', fields: [
    { name: 'rule', type: 'id' },
    { name: 'how', type: 'id' },
    { name: 'tool', type: 'id' },
    { name: 'ticket', type: 'id', optional: true },
    { name: 'sub', type: 'bool' },
    { name: 'signals', type: 'map' },
    { name: 'unread', type: 'id[]', optional: true },
    { name: 'ms', type: 'int' },
  ] },
  { name: 'rules.session-summary', fields: [
    { name: 'judged', type: 'int' },
    { name: 'allowed', type: 'int' },
    { name: 'medianMs', type: 'int' },
    { name: 'maxMs', type: 'int' },
  ] },
  { name: 'rules.ticket', fields: [
    { name: 'ticket', type: 'id' },
    { name: 'rule', type: 'id' },
    { name: 'state', type: 'id' },
    { name: 'why', type: 'id', optional: true },
    { name: 'ms', type: 'int' },
    { name: 'goalOk', type: 'bool', optional: true },
  ] },
  { name: 'rules.wake', fields: [
    { name: 'ticket', type: 'id' },
    { name: 'via', type: 'id' },
    { name: 'sent', type: 'bool' },
    { name: 'ms', type: 'int', optional: true },
  ] },
  { name: 'rules.write', fields: [
    { name: 'seq', type: 'int' },
    { name: 'op', type: 'id' },
    { name: 'actor', type: 'id' },
    { name: 'target', type: 'id' },
  ] },
  { name: 'rules.proposal', fields: [
    { name: 'proposal', type: 'id' },
    { name: 'pending', type: 'id', optional: true },
    { name: 'kind', type: 'id' },
    { name: 'result', type: 'id', optional: true },
    { name: 'actor', type: 'id', optional: true },
    { name: 'ms', type: 'int', optional: true },
  ] },
  { name: 'rules.peak-mode', fields: [
    { name: 'level', type: 'id' },
    { name: 'by', type: 'id' },
    { name: 'held', type: 'int', optional: true },
  ] },
  { name: 'rules.recovery', fields: [
    { name: 'why', type: 'id' },
    { name: 'dropped', type: 'int' },
    { name: 'kept', type: 'bool' },
  ] },
  { name: 'rules.detector-run', fields: [
    { name: 'detector', type: 'id' },
    { name: 'ok', type: 'bool' },
    { name: 'ms', type: 'int' },
  ] },
  { name: 'rules.check', fields: [
    { name: 'effect', type: 'id' },
    { name: 'exitCode', type: 'int' },
    { name: 'rules', type: 'id[]' },
    { name: 'peakMode', type: { rec: [
      { name: 'level', type: 'id' },
      { name: 'origin', type: 'id' },
    ] } },
    { name: 'glmSpend', type: 'id', optional: true },
    { name: 'glmPeakSource', type: 'id' },
    { name: 'unknownSignals', type: 'id[]' },
    { name: 'waitedMs', type: 'int', optional: true },
    { name: 'caller', type: 'id' },
  ] },
  { name: 'rules.health', fields: [
    { name: 'code', type: 'id' },
  ] },
  { name: 'rules.script', fields: [
    { name: 'rule', type: 'id' },
    { name: 'event', type: 'id' },
    { name: 'result', type: 'id' },
    { name: 'ms', type: 'int' },
    { name: 'inCheck', type: 'bool' },
  ] },
  { name: 'rules.late-verdict', fields: [
    { name: 'rule', type: 'id' },
    { name: 'sig', type: 'id' },
    { name: 'result', type: 'id' },
    { name: 'afterMs', type: 'int' },
    { name: 'told', type: 'bool' },
  ] },
  { name: 'rules.repo', fields: [
    { name: 'kind', type: 'id' },
    { name: 'digest', type: 'id' },
    { name: 'diffs', type: 'int' },
  ] },
  { name: 'rules.stale', fields: [
    { name: 'listed', type: 'int' },
    { name: 'proposed', type: 'int' },
    { name: 'detectors', type: 'int' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchRulesBodies: Expect<Equal<BodiesOf<Tables>, RulesBodies>> = true
void tablesMatchRulesBodies

export const RULES_KINDS: readonly KindTable[] = TABLES
