import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration } from '../src/duration.js'

test('formats every unit from the largest down', () => {
  assert.equal(formatDuration(3_723_004), '1h 2m 3s 4ms')
})

test('skips zero segments', () => {
  assert.equal(formatDuration(3_600_005), '1h 5ms')
  assert.equal(formatDuration(90_000), '1m 30s')
})

test('formats zero as 0ms', () => {
  assert.equal(formatDuration(0), '0ms')
})

test('rejects negative, fractional and non-number input', () => {
  assert.throws(() => formatDuration(-1), TypeError)
  assert.throws(() => formatDuration(1.5), TypeError)
  assert.throws(() => formatDuration('5'), TypeError)
})
