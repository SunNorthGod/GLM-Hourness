/**
 * The reason of a run's end (loop board design 0.6 §6.10 `reason`; metrics
 * design §4.4 and §1.6, counts and references, not text): every code of the
 * closed table in src/loops/records.ts is id-shaped, so a `loop-done` that
 * carries any of them, or the id of a blocking rule, is taken by the journal;
 * a reason in words is refused whole, which is why the board writes none.
 *
 * Every place that writes a `loop-done` (bind.ts, inbox.ts, run.ts) is typed
 * to `RunReason`, so it can only write a code or a rule id; the specs that
 * drive those places (loops-bind, loops-inbox, loops-run, loops-peak) keep in
 * their fake journals only what the journal takes, so a path whose record
 * the journal refused would lose its run there as it does on the page.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { metricEventOf } from '../src/loops/metrics.ts'
import { reasonCode, ruleReason, RUN_REASONS, type DoneRecord, type RunOutcome, type RunReason } from '../src/loops/records.ts'
import { ID_PATTERN } from '../src/metrics/schema.ts'
import type { EmittedEvent } from '../src/shared/metrics.ts'
import { journalTakes } from './loops-helpers.ts'

const OUTCOMES: readonly RunOutcome[] = ['delivered', 'ran', 'reported', 'delegated', 'skipped', 'suppressed', 'deferred', 'blocked', 'refused', 'unfinished', 'held', 'failed', 'expired']

/** The journal event of one `loop-done` with this outcome and reason. */
function doneEvent(outcome: RunOutcome, reason: string): EmittedEvent {
  const record = { kind: 'loop-done', at: '2026-11-04T09:00:00.000Z', project: 'C:/work/app', entry: 'u-00000001', run: 'run-0123456789ab', outcome, reason } as DoneRecord
  const event = metricEventOf(record)
  assert.ok(event !== undefined)
  return event
}

test('every reason code is id-shaped and listed once, and a loop-done with any of them, under any outcome, is taken by the journal', () => {
  assert.equal(new Set(RUN_REASONS).size, RUN_REASONS.length)
  for (const code of RUN_REASONS) {
    assert.match(code, ID_PATTERN, code)
    for (const outcome of OUTCOMES) assert.ok(journalTakes(doneEvent(outcome, code)), `${outcome} ${code}`)
  }
  const rules: readonly RunReason[] = [ruleReason('r-freeze-scripts-1'), ruleReason('builtin:peak-stop')]
  for (const reason of rules) assert.ok(journalTakes(doneEvent('blocked', reason)), reason)
})

test('a reason in words is refused whole by the journal, so the board turns words into a code before it records them', () => {
  assert.equal(journalTakes(doneEvent('expired', '高峰结束的再判等了一天还没判成')), false)
  assert.equal(journalTakes(doneEvent('skipped', '没有能叫醒的主 Agent')), false)
  assert.equal(journalTakes(doneEvent('unfinished', 'timeout 30.0s')), false, 'a space is not id-shaped either')
  // Another plugin's action or reported run says why in its words: a code stays a code, the rest is plugin-reason.
  assert.equal(reasonCode('timeout', 'plugin-reason'), 'timeout')
  assert.equal(reasonCode('graph/invalid：节点不在', 'plugin-reason'), 'plugin-reason')
  assert.equal(reasonCode(undefined, 'plugin-reason'), 'plugin-reason')
  // A blocking rule is recorded by its id; anything that is not one of the rules board's ids is rules.
  assert.equal(ruleReason('r-hold-scripts-2'), 'r-hold-scripts-2')
  assert.equal(ruleReason('builtin:peak-stop'), 'builtin:peak-stop')
  assert.equal(ruleReason(undefined), 'rules')
  assert.equal(ruleReason('规则 1'), 'rules')
})
