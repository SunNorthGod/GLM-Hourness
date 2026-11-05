/**
 * The exit of the rules board's metrics events (docs/ORCHESTRATION.md §16.10;
 * design §10.5; metrics design §6.2): the one place an event leaves the board.
 * With no exit installed it does nothing; an exit that fails never reaches the
 * caller; the mapping to the journal's closed vocabulary keeps the kind, the
 * submitter `rules` and the body under `body`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { emitMetric, toEmitted, type RulesMetricEvent } from '../src/rules/metrics.ts'

const EVENT: RulesMetricEvent = {
  event: 'rules.check',
  effect: 'queue',
  exitCode: 5,
  rules: ['r-peak-queue'],
  peakMode: { level: 'reduce', origin: 'default' },
  glmPeakSource: 'caller',
  unknownSignals: [],
  caller: 'library',
}

test('with no exit installed an event goes nowhere and the call resolves', async () => {
  assert.equal(await emitMetric(EVENT, 'C:/work/app'), undefined)
})

test('the exit gets the event and the project root it was judged for', async () => {
  const seen: Array<{ readonly event: RulesMetricEvent, readonly project: string }> = []
  await emitMetric(EVENT, 'C:/work/app', (event, project) => { seen.push({ event, project }) })
  assert.deepEqual(seen, [{ event: EVENT, project: 'C:/work/app' }])
})

test('an exit that throws does not reach the caller', async () => {
  await emitMetric(EVENT, 'C:/work/app', () => { throw new Error('the stream is gone') })
})

test('an exit that rejects does not reach the caller', async () => {
  await emitMetric(EVENT, 'C:/work/app', () => Promise.reject(new Error('the stream is gone')))
})

test('an exit that is still writing finishes before the call resolves', async () => {
  const steps: string[] = []
  await emitMetric(EVENT, 'C:/work/app', async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
    steps.push('written')
  })
  steps.push('resolved')
  assert.deepEqual(steps, ['written', 'resolved'])
})

test('the mapping to the journal keeps the kind, the submitter and the body', () => {
  assert.deepEqual(toEmitted(EVENT), {
    k: 'rules.check',
    by: 'rules',
    body: { effect: EVENT.effect, exitCode: EVENT.exitCode, rules: EVENT.rules, peakMode: EVENT.peakMode, glmPeakSource: EVENT.glmPeakSource, unknownSignals: EVENT.unknownSignals, caller: EVENT.caller },
  })
  const judged = toEmitted({ event: 'rules.judged', rule: 'r-no-probe', how: 'block', tool: 'pwsh', sub: true, signals: { 'glm-peak': true }, unread: ['role'], ms: 3 })
  assert.deepEqual(judged, { k: 'rules.judged', by: 'rules', body: { rule: 'r-no-probe', how: 'block', tool: 'pwsh', sub: true, signals: { 'glm-peak': true }, unread: ['role'], ms: 3 } })
})
