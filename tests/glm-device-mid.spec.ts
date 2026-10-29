import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ensureCliDeviceMid, readRoutingDeviceMid, telemetryStateFile } from '../src/glm-llm/device-mid.ts'
import { zcodeDataDir } from './glm-fixtures.ts'

// Fake ids only; every state file lives in a mkdtemp directory reached
// through ZCODE_DATA_BASE_DIR, never the real ~/.zcode.
const MID = '11111111-2222-4333-8444-555555555555'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

/** A `createId` double returning `id` and counting its calls. */
function counted(id: string): { createId: () => string, calls: () => number } {
  let calls = 0
  return { createId: () => { calls += 1; return id }, calls: () => calls }
}

const lockOf = (stateFile: string): string => join(dirname(stateFile), 'telemetry-state.lock')

test('the state file path follows 3.16.3 resolveCliTelemetryStateFile: ZCODE_DATA_BASE_DIR, else the home directory', () => {
  assert.equal(telemetryStateFile({ ZCODE_DATA_BASE_DIR: 'C:/zdata' }), join('C:/zdata', '.zcode', 'v2', 'telemetry-state.json'))
  assert.equal(telemetryStateFile({ ZCODE_DATA_BASE_DIR: '   ' }), join(homedir(), '.zcode', 'v2', 'telemetry-state.json'))
  assert.equal(telemetryStateFile({}), join(homedir(), '.zcode', 'v2', 'telemetry-state.json'))
  assert.equal(telemetryStateFile({ ZCODE_DATA_BASE_DIR: '~/alt' }), join(homedir(), 'alt', '.zcode', 'v2', 'telemetry-state.json'))
})

test('an existing deviceMid is used as-is: nothing generated, no lock taken, the state file untouched (3.16.3 EWs lock-free read)', async () => {
  const zcode = zcodeDataDir({ deviceMid: MID, lastDailyActiveDate: '2026-10-28' })
  const before = { bytes: readFileSync(zcode.stateFile), mtime: statSync(zcode.stateFile).mtimeMs }
  const id = counted('generated')
  assert.deepEqual(await ensureCliDeviceMid({ env: zcode.env, createId: id.createId }), { value: MID, temporary: false })
  assert.equal(id.calls(), 0)
  assert.deepEqual(readFileSync(zcode.stateFile), before.bytes)
  assert.equal(statSync(zcode.stateFile).mtimeMs, before.mtime)
  assert.deepEqual(readdirSync(dirname(zcode.stateFile)), ['telemetry-state.json'])
})

test('without a deviceMid one is generated and written back: other keys kept, two-space JSON, no temp file or lock left (3.16.3 EWs, PWs, RWs)', async () => {
  const zcode = zcodeDataDir({ lastDailyActiveDate: '2026-10-28' })
  const result = await ensureCliDeviceMid({ env: zcode.env })
  assert.match(result.value, UUID_V4) // createUuid: crypto.randomUUID
  assert.equal(result.temporary, false)
  assert.equal(readFileSync(zcode.stateFile, 'utf-8'), JSON.stringify({ lastDailyActiveDate: '2026-10-28', deviceMid: result.value }, null, 2))
  assert.deepEqual(readdirSync(dirname(zcode.stateFile)), ['telemetry-state.json'])
  // No state file and no directory: mkdir -p, then the same write.
  const empty = zcodeDataDir()
  assert.deepEqual(await ensureCliDeviceMid({ env: empty.env, createId: () => MID }), { value: MID, temporary: false })
  assert.equal(readFileSync(empty.stateFile, 'utf-8'), JSON.stringify({ deviceMid: MID }, null, 2))
  assert.deepEqual(readdirSync(dirname(empty.stateFile)), ['telemetry-state.json'])
  // readTelemetryState: not JSON or not a record (an array) reads as {}; an empty or non-string deviceMid is replaced.
  const unusable: Array<[string, Record<string, unknown>]> = [
    ['not json', {}],
    ['[1]', {}],
    [JSON.stringify({ deviceMid: '' }), {}],
    [JSON.stringify({ deviceMid: 7, keep: true }), { keep: true }],
  ]
  for (const [content, kept] of unusable) {
    const state = zcodeDataDir()
    mkdirSync(dirname(state.stateFile), { recursive: true })
    writeFileSync(state.stateFile, content)
    assert.deepEqual(await ensureCliDeviceMid({ env: state.env, createId: () => MID }), { value: MID, temporary: false })
    assert.deepEqual(JSON.parse(readFileSync(state.stateFile, 'utf-8')), { ...kept, deviceMid: MID })
  }
})

test('concurrent calls on one state file generate and write one id (3.16.3 caches the promise per state file, Xro)', async () => {
  const zcode = zcodeDataDir()
  const id = counted(MID)
  const [first, second] = await Promise.all([
    ensureCliDeviceMid({ env: zcode.env, createId: id.createId }),
    ensureCliDeviceMid({ env: zcode.env, createId: () => 'other' }),
  ])
  assert.deepEqual(first, { value: MID, temporary: false })
  assert.deepEqual(second, first)
  assert.equal(id.calls(), 1)
  assert.deepEqual(JSON.parse(readFileSync(zcode.stateFile, 'utf-8')), { deviceMid: MID })
})

test('a lock held by a live process, or a fresh lock without a readable owner, is waited for and the state re-read under it (3.16.3 RWs, DWs)', async () => {
  for (const owner of [JSON.stringify({ createdAt: Date.now(), pid: process.pid }), 'not an owner record']) {
    const zcode = zcodeDataDir({ lastDailyActiveDate: '2026-10-28' })
    const lock = lockOf(zcode.stateFile)
    writeFileSync(lock, owner)
    const id = counted('generated')
    const pending = ensureCliDeviceMid({ env: zcode.env, createId: id.createId })
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.equal(readFileSync(lock, 'utf-8'), owner) // still the holder's
    // The holder writes a deviceMid and releases the lock; the waiting call takes the lock, re-reads, and uses it.
    writeFileSync(zcode.stateFile, JSON.stringify({ lastDailyActiveDate: '2026-10-28', deviceMid: MID }, null, 2))
    rmSync(lock)
    assert.deepEqual(await pending, { value: MID, temporary: false })
    assert.equal(id.calls(), 0)
    assert.deepEqual(readdirSync(dirname(zcode.stateFile)), ['telemetry-state.json'])
  }
})

test('a lock older than 300 s, or a fresh lock whose owner is not running, is removed and the id written (3.16.3 DWs, MWs)', async () => {
  const old = zcodeDataDir()
  mkdirSync(dirname(old.stateFile), { recursive: true })
  writeFileSync(lockOf(old.stateFile), JSON.stringify({ createdAt: Date.now() - 301_000, pid: process.pid }))
  const seconds = (Date.now() - 301_000) / 1000
  utimesSync(lockOf(old.stateFile), seconds, seconds)
  assert.deepEqual(await ensureCliDeviceMid({ env: old.env, createId: () => MID }), { value: MID, temporary: false })
  assert.deepEqual(readdirSync(dirname(old.stateFile)), ['telemetry-state.json'])
  // 2147483647 is never a running process id (Windows ids are multiples of 4): process.kill(pid, 0) fails with ESRCH.
  const orphan = zcodeDataDir()
  mkdirSync(dirname(orphan.stateFile), { recursive: true })
  writeFileSync(lockOf(orphan.stateFile), JSON.stringify({ createdAt: Date.now(), pid: 2_147_483_647 }))
  assert.deepEqual(await ensureCliDeviceMid({ env: orphan.env, createId: () => MID }), { value: MID, temporary: false })
  assert.deepEqual(JSON.parse(readFileSync(orphan.stateFile, 'utf-8')), { deviceMid: MID })
  assert.equal(existsSync(lockOf(orphan.stateFile)), false)
})

test('a failed write still returns the generated id, marked temporary, and leaves no temp file or lock (3.16.3 Qro falls back to it)', async () => {
  // .zcode/v2 is a file: the lock directory cannot be made, nothing is generated before the failure.
  const blocked = zcodeDataDir()
  mkdirSync(join(blocked.dir, '.zcode'), { recursive: true })
  writeFileSync(join(blocked.dir, '.zcode', 'v2'), 'not a directory')
  const first = counted(MID)
  assert.deepEqual(await ensureCliDeviceMid({ env: blocked.env, createId: first.createId }), { value: MID, temporary: true })
  assert.equal(first.calls(), 1)
  assert.equal(readFileSync(join(blocked.dir, '.zcode', 'v2'), 'utf-8'), 'not a directory')
  // telemetry-state.json is a directory: the rename fails after the id was generated, and the same id comes back.
  const unwritable = zcodeDataDir()
  mkdirSync(unwritable.stateFile, { recursive: true })
  writeFileSync(join(unwritable.stateFile, 'occupied'), '')
  const second = counted(MID)
  assert.deepEqual(await ensureCliDeviceMid({ env: unwritable.env, createId: second.createId }), { value: MID, temporary: true })
  assert.equal(second.calls(), 1)
  assert.deepEqual(readdirSync(dirname(unwritable.stateFile)), ['telemetry-state.json'])
  // The process keeps that id for the state file (the cached promise).
  assert.deepEqual(await ensureCliDeviceMid({ env: unwritable.env, createId: () => 'other' }), { value: MID, temporary: true })
})

test('the routing read (3.16.3 Kuc) never generates, trims, requires printable ASCII, and caches only a success', async () => {
  const zcode = zcodeDataDir({ deviceMid: `  ${MID}\t` })
  assert.equal(await readRoutingDeviceMid(zcode.env), MID)
  assert.equal((await ensureCliDeviceMid({ env: zcode.env })).value, `  ${MID}\t`) // the metadata read keeps the raw string (readDeviceMid)
  assert.equal(await readRoutingDeviceMid(zcodeDataDir({ deviceMid: 'mid-é' }).env), undefined)
  // Without a deviceMid the routing read creates nothing; once ensureCliDeviceMid has written one, the next read finds it.
  const later = zcodeDataDir()
  assert.equal(await readRoutingDeviceMid(later.env), undefined)
  assert.deepEqual(readdirSync(later.dir), [])
  await ensureCliDeviceMid({ env: later.env, createId: () => MID })
  assert.equal(await readRoutingDeviceMid(later.env), MID)
})
