/**
 * The exit of the rules board's metrics events (docs/ORCHESTRATION.md §16.10;
 * design §10.5): the one place an event leaves the board. With no exit
 * installed it does nothing; an exit that fails never reaches the caller.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { emitMetric, type RulesMetricEvent } from '../src/rules/metrics.ts'

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
