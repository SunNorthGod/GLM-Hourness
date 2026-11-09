import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redirectTargets, writesFiles } from '../src/redirect.js'

test('finds a write and an append', () => {
  assert.deepEqual(redirectTargets('echo hi > out.txt'), ['out.txt'])
  assert.deepEqual(redirectTargets('echo hi >> log.txt'), ['log.txt'])
})

test('reads stream numbers', () => {
  assert.deepEqual(redirectTargets('npm test 2> err.txt'), ['err.txt'])
  assert.deepEqual(redirectTargets('npm test *> all.txt'), ['all.txt'])
})

test('a stream merge writes no file', () => {
  assert.deepEqual(redirectTargets('npm test 2>&1'), [])
  assert.deepEqual(redirectTargets('npm test > out.txt 2>&1'), ['out.txt'])
})

test('discards are not targets', () => {
  assert.deepEqual(redirectTargets('npm test > nul'), [])
  assert.deepEqual(redirectTargets('npm test > $null'), [])
})

test('a quoted target is one word', () => {
  assert.deepEqual(redirectTargets('echo hi > "out file.txt"'), ['out file.txt'])
})

test('writesFiles', () => {
  assert.equal(writesFiles('git status'), false)
  assert.equal(writesFiles('git status > s.txt'), true)
})
