/**
 * The execution row's twenty-two kinds (M7 0.6 §3.16, §4.5; the
 * `execute.policy-drift` kind from the reval design §4.5): field names
 * from that section; the value lists of roles, operations, codes and stop
 * reasons stay in the M7 design, so those fields are ids.
 */
import type { ExecuteBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'execute.dispatch', fields: [
    { name: 'role', type: 'id' },
    { name: 'target', type: 'id' },
    { name: 'n', type: 'int' },
    { name: 'child', type: 'id' },
    { name: 'provider', type: 'id' },
    { name: 'model', type: 'id' },
    { name: 'think', type: 'id' },
    { name: 'sameAsMain', type: 'bool' },
    { name: 'sameAsWorker', type: 'bool', optional: true },
    { name: 'depth', type: 'id', optional: true },
    { name: 'whyRef', type: { rec: [
      { name: 'node', type: 'id' },
      { name: 'hi', type: 'int' },
    ] } },
  ] },
  { name: 'execute.dispatch-refused', fields: [
    { name: 'code', type: 'id' },
  ] },
  { name: 'execute.plan', fields: [
    { name: 'task', type: 'id' },
    { name: 'version', type: 'int' },
    { name: 'result', type: 'id' },
    { name: 'steps', type: 'int' },
    { name: 'waitedMs', type: 'int' },
  ] },
  { name: 'execute.ask', fields: [
    { name: 'task', type: 'id' },
    { name: 'waitedMs', type: 'int' },
    { name: 'result', type: 'id' },
  ] },
  { name: 'execute.handback', fields: [
    { name: 'task', type: 'id' },
    { name: 'n', type: 'int' },
    { name: 'status', type: 'id' },
    { name: 'stopReason', type: 'id' },
    { name: 'commits', type: 'int' },
    { name: 'files', type: 'int' },
    { name: 'ms', type: 'int' },
    { name: 'outside', type: 'int' },
  ] },
  { name: 'execute.review-depth', fields: [
    { name: 'task', type: 'id' },
    { name: 'declared', type: 'id' },
    { name: 'effective', type: 'id' },
    { name: 'floors', type: 'id[]' },
    { name: 'unparsed', type: 'bool' },
  ] },
  { name: 'execute.policy-drift', fields: [
    { name: 'task', type: 'id' },
    { name: 'attempt', type: 'int' },
    { name: 'classes', type: 'id[]' },
  ] },
  { name: 'execute.review', fields: [
    { name: 'task', type: 'id' },
    { name: 'round', type: 'int' },
    { name: 'depth', type: 'id' },
    { name: 'model', type: 'id' },
    { name: 'blocking', type: 'int' },
    { name: 'nonBlocking', type: 'int' },
    { name: 'downgraded', type: 'int' },
  ] },
  { name: 'execute.stop', fields: [
    { name: 'node', type: 'id' },
    { name: 'kind', type: 'id' },
    { name: 'rounds', type: 'int' },
  ] },
  { name: 'execute.check', fields: [
    { name: 'commit', type: 'id' },
    { name: 'task', type: 'id', optional: true },
    { name: 'ok', type: 'bool' },
    { name: 'kind', type: 'id' },
    { name: 'cmds', type: 'int[]' },
    { name: 'exits', type: 'int[]' },
    { name: 'ms', type: 'int[]' },
    { name: 'setup', type: 'bool' },
    { name: 'lockMs', type: 'int' },
  ] },
  { name: 'execute.advance', fields: [
    { name: 'ref', type: 'id' },
    { name: 'how', type: 'id' },
    { name: 'from', type: 'id' },
    { name: 'to', type: 'id' },
    { name: 'task', type: 'id', optional: true },
    { name: 'by', type: 'id' },
    { name: 'checkAfter', type: 'bool' },
    { name: 'reviewPending', type: 'id[]' },
    { name: 'incomingFloor', type: 'int' },
    { name: 'external', type: 'bool', optional: true },
  ] },
  { name: 'execute.advance-refused', fields: [
    { name: 'missing', type: 'id' },
  ] },
  { name: 'execute.unchecked-advance', fields: [
    { name: 'ref', type: 'id' },
    { name: 'from', type: 'id' },
    { name: 'to', type: 'id' },
    { name: 'missing', type: 'id' },
  ] },
  { name: 'execute.goal', fields: [
    { name: 'goal', type: 'id' },
    { name: 'module', type: 'id', optional: true },
    { name: 'op', type: 'id' },
    { name: 'code', type: 'id', optional: true },
    { name: 'resumeWhy', type: 'id', optional: true },
  ] },
  { name: 'execute.tier', fields: [
    { name: 'tier', type: 'int' },
    { name: 'node', type: 'id' },
    { name: 'running', type: 'int' },
    { name: 'stale', type: 'int' },
    { name: 'told', type: 'int' },
    { name: 'handed', type: 'int' },
  ] },
  { name: 'execute.completion-gate', fields: [
    { name: 'goal', type: 'id' },
    { name: 'ok', type: 'bool' },
    { name: 'gaps', type: 'int' },
  ] },
  { name: 'execute.acceptance-review', fields: [
    { name: 'goal', type: 'id' },
    { name: 'round', type: 'int' },
    { name: 'model', type: 'id' },
    { name: 'verdict', type: 'id' },
    { name: 'blocking', type: 'int' },
  ] },
  { name: 'execute.reconcile', fields: [
    { name: 'lost', type: 'int' },
    { name: 'redone', type: 'int' },
    { name: 'evidence', type: 'int' },
  ] },
  { name: 'execute.loop-entry', fields: [
    { name: 'entry', type: 'id' },
    { name: 'key', type: 'id' },
    { name: 'sent', type: 'bool' },
    { name: 'deferred', type: 'id', optional: true },
  ] },
  { name: 'execute.loop-fallback', fields: [
    { name: 'entry', type: 'id' },
    { name: 'key', type: 'id' },
    { name: 'why', type: 'id' },
    { name: 'waitedS', type: 'int' },
  ] },
  { name: 'execute.loop-contribute', fields: [
    { name: 'row', type: 'id' },
    { name: 'accepted', type: 'id[]' },
    { name: 'dropped', type: 'id[]' },
    { name: 'reasons', type: 'id[]' },
  ] },
  { name: 'execute.peak-cap', fields: [
    { name: 'model', type: 'id' },
    { name: 'cap', type: 'int' },
    { name: 'running', type: 'int' },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchExecuteBodies: Expect<Equal<BodiesOf<Tables>, ExecuteBodies>> = true
void tablesMatchExecuteBodies

export const EXECUTE_KINDS: readonly KindTable[] = TABLES
