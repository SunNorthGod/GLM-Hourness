/**
 * The guard framework's metric events (metrics design §4.2, §6.2; m4 §3.11):
 * every record class the violation journal holds hands one event to the
 * metrics journal at the same write. The mapping is pure — the row calls it
 * from its journal choke point, where every writer's record passes once:
 * the gate's denials and follow-ups, the fallback's late denial,
 * `guard_lift` and the lift service, the request desk. Only ids, keys and
 * counts travel — never a command, a path or the human's words (the lift's
 * `units` is the words' code-point count, §4.3). The `rule`'s `ref` is the
 * record's own journal key (`keyOf` over the same JSON text the write
 * serializes), so a metrics line and its violation line point at each other.
 */
import type { EmittedEvent } from '../shared/metrics.ts'
import { keyOf, type GuardRecord } from './records.ts'

/**
 * The event a journal record hands to the metrics journal, or undefined for
 * the classes that carry no metric: a recorded call (`mode: 'record'`, the
 * rules row's `rules.judged` will carry it), a shadow record (not written
 * since `d-code-rules-enforce`) and a gap line (the metrics journal's own
 * `gap` is the writer's, §5.4 — the violation journal's lost records stay
 * on the row health).
 */
export function metricEventOf(record: GuardRecord): EmittedEvent | undefined {
  if (!('kind' in record)) {
    if (record.mode === 'late') return { k: 'rule', by: 'guard', body: { rule: record.rule, effect: 'late', ref: keyOf(record) } }
    // A guard denial carries no mode at all; the rules board's enforced denials say `enforce` and the recorded calls `record`.
    if (record.mode === undefined) return { k: 'rule', by: 'guard', body: { rule: record.rule, effect: 'deny', ref: keyOf(record) } }
    return undefined
  }
  switch (record.kind) {
    case 'followup':
      return { k: 'followup', by: 'guard', body: { rule: record.rule, denial: record.denial, outcome: record.outcome } }
    case 'request':
      return { k: 'request', by: 'guard', body: { rule: record.rule, ref: record.ref, step: record.outcome } }
    case 'grant':
      return { k: 'request', by: 'guard', body: { rule: record.rule, ref: record.ref, step: 'used' } }
    case 'grant-void':
      return { k: 'request', by: 'guard', body: { rule: record.rule, ref: record.ref, step: 'void' } }
    case 'lift':
      return { k: 'lift', by: 'guard', body: { rule: record.rule, action: record.action, via: record.via, units: [...record.words].length } }
    default:
      return undefined
  }
}
