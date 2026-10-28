import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { readCliDeviceMid, readRoutingDeviceMid, telemetryStateFile } from '../src/glm-llm/device-mid.ts'
import { zcodeDataDir } from './glm-fixtures.ts'

// Fake ids only; no spec reads the real ~/.zcode.
const MID = '11111111-2222-4333-8444-555555555555'

test('the state file path follows 3.16.3 resolveCliTelemetryStateFile: ZCODE_DATA_BASE_DIR, else the home directory', () => {
  assert.equal(telemetryStateFile({ ZCODE_DATA_BASE_DIR: 'C:/zdata' }), join('C:/zdata', '.zcode', 'v2', 'telemetry-state.json'))
  assert.equal(telemetryStateFile({ ZCODE_DATA_BASE_DIR: '   ' }), join(homedir(), '.zcode', 'v2', 'telemetry-state.json'))
  assert.equal(telemetryStateFile({}), join(homedir(), '.zcode', 'v2', 'telemetry-state.json'))
  assert.equal(telemetryStateFile({ ZCODE_DATA_BASE_DIR: '~/alt' }), join(homedir(), 'alt', '.zcode', 'v2', 'telemetry-state.json'))
})

test('an existing deviceMid is used as-is and the state file is left untouched', async () => {
  const zcode = zcodeDataDir({ deviceMid: MID, lastDailyActiveDate: '2026-10-28' })
  const before = { bytes: readFileSync(zcode.stateFile), mtime: statSync(zcode.stateFile).mtimeMs }
  assert.equal(await readCliDeviceMid(zcode.env), MID)
  assert.equal(await readRoutingDeviceMid(zcode.env), MID)
  assert.deepEqual(readFileSync(zcode.stateFile), before.bytes)
  assert.equal(statSync(zcode.stateFile).mtimeMs, before.mtime)
  assert.deepEqual(readdirSync(dirname(zcode.stateFile)), ['telemetry-state.json']) // no lock, no temp file
})

test('without a deviceMid nothing is generated and nothing is created in the ZCode directory', async () => {
  const empty = zcodeDataDir()
  assert.equal(await readCliDeviceMid(empty.env), undefined)
  assert.equal(await readRoutingDeviceMid(empty.env), undefined)
  assert.deepEqual(readdirSync(empty.dir), [])
  for (const state of [{ lastDailyActiveDate: '2026-10-28' }, { deviceMid: '' }, { deviceMid: 7 }]) {
    const zcode = zcodeDataDir(state)
    const bytes = readFileSync(zcode.stateFile)
    assert.equal(await readCliDeviceMid(zcode.env), undefined)
    assert.deepEqual(readFileSync(zcode.stateFile), bytes)
  }
  const broken = zcodeDataDir()
  mkdirSync(dirname(broken.stateFile), { recursive: true })
  writeFileSync(broken.stateFile, 'not json')
  assert.equal(await readCliDeviceMid(broken.env), undefined) // readTelemetryState: unparsable reads as {}
})

test('the routing read (3.16.3 Kuc) trims, requires printable ASCII, and caches only a success', async () => {
  const zcode = zcodeDataDir({ deviceMid: `  ${MID}\t` })
  assert.equal(await readRoutingDeviceMid(zcode.env), MID)
  assert.equal(await readCliDeviceMid(zcode.env), `  ${MID}\t`) // the metadata read keeps the raw string (readDeviceMid)
  assert.equal(await readRoutingDeviceMid(zcodeDataDir({ deviceMid: 'mid-é' }).env), undefined)
  const later = zcodeDataDir()
  assert.equal(await readRoutingDeviceMid(later.env), undefined)
  mkdirSync(dirname(later.stateFile), { recursive: true })
  writeFileSync(later.stateFile, JSON.stringify({ deviceMid: MID }))
  assert.equal(await readRoutingDeviceMid(later.env), MID)
})
