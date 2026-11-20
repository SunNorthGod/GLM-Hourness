/**
 * The configuration stamp of a calibration run and the refusal of a
 * cross-configuration comparison (scripts/calibrate/stamp.mjs, the runner's
 * `compare` positional; docs/ORCHESTRATION.md §10.5.1; reading-digest
 * 2026-11-20 ②): the overlay patch's rows as the stamp, the batch's
 * configuration as the comparison reads it, and every difference the
 * refusal names — the commit, what was run, and the row composition, an
 * older batch without the stamp refusing on all of it.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { configDiff, configOf, profileStampOf } from '../scripts/calibrate/stamp.mjs'

const PATCH = [
  '- id: agent-default-model',
  '  config: { provider: glm-zcode, model: "glm-5.3" }',
  '- id: glm-hourness/glm-llm',
  '  disabled: false',
  '- id: glm-hourness/glm-login',
  '  config: { home: "/run/home" }',
  '- id: glm-hourness/execute',
  '  disabled: true',
  '- insert:',
  '    - id: glm-hourness-calibrate/limits',
  '      config: { maxSteps: 40 }',
  '',
].join('\n')

const batchOf = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  commit: '8188dca9',
  dirty: false,
  options: { arm: 'A0', tasks: ['bugfix-csv-quotes', 'feature-parse-duration'], models: ['glm-5.3', 'glm-5.3-flash'], repeat: 3, bounds: { 'bugfix-csv-quotes': { maxSteps: 40, minutes: 15 } }, permission: 'danger-full-access' },
  profile: { rows: profileStampOf(PATCH), arm: 'A0', permission: 'danger-full-access' },
  summary: { byModel: [{ key: 'glm-5.3', completed: 3 }] },
  ...over,
})

test('profileStampOf: the rows of the overlay patch, with the disabled flags and the inserted rows', () => {
  assert.deepEqual(profileStampOf(PATCH), [
    { id: 'agent-default-model', enabled: true },
    { id: 'glm-hourness/glm-llm', enabled: true },
    { id: 'glm-hourness/glm-login', enabled: true },
    { id: 'glm-hourness/execute', enabled: false },
    { id: 'glm-hourness-calibrate/limits', enabled: true },
  ])
  assert.deepEqual(profileStampOf(''), [], 'an empty patch stamps nothing')
})

test('configOf: the configuration the comparison reads; fields an older batch never wrote are null', () => {
  const config = configOf(batchOf())
  assert.equal(config.commit, '8188dca9')
  assert.equal(config.dirty, false)
  assert.equal(config.arm, 'A0')
  assert.equal(config.permission, 'danger-full-access')
  assert.deepEqual(config.tasks, ['bugfix-csv-quotes', 'feature-parse-duration'])
  assert.deepEqual(config.rows, profileStampOf(PATCH))
  assert.deepEqual(configOf({}) , { commit: null, dirty: null, arm: null, permission: null, tasks: [], models: [], repeat: null, bounds: null, rows: null })
})

test('configDiff: identical configurations compare, any difference is named with both sides', () => {
  assert.deepEqual(configDiff(configOf(batchOf()), configOf(batchOf())), [])
  const other = configOf(batchOf({ commit: '9999999', options: { arm: 'A2', tasks: ['bugfix-csv-quotes'], models: ['glm-5.3'], repeat: 3, permission: 'workspace-write' } }))
  const differences = configDiff(configOf(batchOf()), other)
  assert.ok(differences.some(difference => difference.includes('commit: "8188dca9" != "9999999"')), differences.join('; '))
  assert.ok(differences.some(difference => difference.includes('arm: "A0" != "A2"')), differences.join('; '))
  assert.ok(differences.some(difference => difference.startsWith('tasks:')), differences.join('; '))
  assert.equal(differences.length, 6, `six keys differ: ${differences.join('; ')}`)
})

test('configDiff: the row composition compares by id regardless of order; a batch without the stamp refuses', () => {
  const reordered = profileStampOf(PATCH).slice().reverse()
  const same = configOf(batchOf({ profile: { rows: reordered, arm: 'A0', permission: 'danger-full-access' } }))
  assert.deepEqual(configDiff(configOf(batchOf()), same), [], 'the same rows in another order compare')
  const old = configOf({ options: { arm: 'A0', tasks: ['bugfix-csv-quotes'], models: ['glm-5.3'], repeat: 1 } })
  const differences = configDiff(configOf(batchOf()), old)
  assert.ok(differences.some(difference => difference.startsWith('rows')), differences.join('; '))
  assert.ok(differences.some(difference => difference.startsWith('tasks')), differences.join('; '))
  assert.ok(differences.some(difference => difference.startsWith('commit')), differences.join('; '))
})
