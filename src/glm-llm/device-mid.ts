/**
 * The ZCode deviceMid, kept the way ZCode 3.16.3 keeps it (m1-parity item 9,
 * user decision 2026-10-28, project graph question-9 A).
 *
 * 3.16.3 keeps one deviceMid per machine in
 * `<base>/.zcode/v2/telemetry-state.json` (`deviceMid`); `<base>` is
 * `ZCODE_DATA_BASE_DIR` when set, else the home directory. Two readers:
 * - `metadata.user_id` of every Anthropic request: `ensureCliDeviceMid`
 *   (`Qro` @4062043) reads the state without a lock; when it has no
 *   deviceMid it re-reads the state under `telemetry-state.lock`, generates
 *   one and writes it back atomically (`ensurePersistedDeviceMid` `EWs`
 *   @4062442, `writeTelemetryState` `PWs` @4062889, `withTelemetryStateLock`
 *   `RWs` @4063231). Any failure on that path yields the id generated in
 *   this process, which is then kept for the state file.
 * - `X-Device-Mid` of the endpoint-routing config request:
 *   `readExistingDeviceMid` (`Kuc` @14468898) only reads.
 */
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/** `IWs` / `Vuc`: the environment variable that relocates the ZCode data directory. */
const DATA_BASE_DIR_ENV = 'ZCODE_DATA_BASE_DIR'
const STATE_PATH = ['.zcode', 'v2', 'telemetry-state.json'] as const
const LOCK_FILE = 'telemetry-state.lock'
/** `kWs`, `xWs`, `TWs` (@4064703): the pause between lock attempts, the number of attempts, the age at which a lock is stale. */
const LOCK_RETRY_MS = 10
const LOCK_ATTEMPTS = 200
const LOCK_STALE_MS = 300 * 1000
const ASCII_PRINTABLE = /^[\x20-\x7e]+$/u

/** `resolveCliTelemetryStateFile` (`CWs` @4062252): `ZCODE_DATA_BASE_DIR` trimmed, an empty value falls back to the home directory. */
export function telemetryStateFile(env: NodeJS.ProcessEnv): string {
  const configured = env[DATA_BASE_DIR_ENV]?.trim() ?? homedir()
  return join(expandHome(configured.length > 0 ? configured : homedir()), ...STATE_PATH)
}

/** `resolveUserPath` (`NWs` @4064238): `~` and `~/…` expand to the home directory, anything else resolves against the working directory. */
function expandHome(path: string): string {
  if (path === '~') return homedir()
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : resolve(path)
}

/** `isRecord` (`roo`): a non-null object that is not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `isNodeErrorCode` (`noo`). */
function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** `readTelemetryState` (`too` @4062778): an unreadable or unparsable file, or a non-record, reads as `{}`. */
async function readTelemetryState(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'))
    return isRecord(parsed) ? parsed : {}
  }
  catch {
    return {}
  }
}

/** `readDeviceMid` (`eoo`): the state's `deviceMid` when it is a non-empty string. */
function readDeviceMid(state: Record<string, unknown>): string | undefined {
  return typeof state.deviceMid === 'string' && state.deviceMid.length > 0 ? state.deviceMid : undefined
}

/**
 * `writeTelemetryState` (`PWs` @4062889): `mkdir -p` the directory, write
 * two-space JSON to a temp file beside the state file, rename it over the
 * state file; on failure remove the temp file and rethrow.
 */
async function writeTelemetryState(file: string, state: Record<string, unknown>): Promise<void> {
  const directory = dirname(file)
  await mkdir(directory, { recursive: true })
  const temp = join(directory, `.${basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  try {
    await writeFile(temp, JSON.stringify(state, null, 2), 'utf-8')
    await rename(temp, file)
  }
  catch (error) {
    await unlink(temp).catch(() => { /* already gone */ })
    throw error
  }
}

/** `isProcessAlive` (`MWs` @4064119): `process.kill(pid, 0)` succeeds, or fails with `EPERM`. */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return isNodeErrorCode(error, 'EPERM')
  }
}

/** `readTelemetryLockOwner` (`OWs` @4063923): the owner's pid when the lock holds a record with numeric `createdAt` and `pid`, else undefined. */
async function readLockOwner(lockFile: string): Promise<{ pid: number } | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(lockFile, 'utf-8'))
    return !isRecord(parsed) || typeof parsed.pid !== 'number' || typeof parsed.createdAt !== 'number' ? undefined : { pid: parsed.pid }
  }
  catch {
    return undefined
  }
}

/**
 * `removeStaleTelemetryLockIfNeeded` (`DWs` @4063741): a lock younger than
 * 300 s is kept while its owner record is unreadable or its owner is alive;
 * otherwise it is removed and the caller retries at once. A lock that can no
 * longer be read is not stale (the caller waits and retries).
 */
async function removeStaleLockIfNeeded(lockFile: string, now: number): Promise<boolean> {
  try {
    const info = await stat(lockFile)
    if (now - info.mtimeMs < LOCK_STALE_MS) {
      const owner = await readLockOwner(lockFile)
      if (owner === undefined || isProcessAlive(owner.pid)) return false
    }
    await unlink(lockFile).catch(() => { /* already gone */ })
    return true
  }
  catch {
    return false
  }
}

/**
 * `withTelemetryStateLock` (`RWs` @4063231): create `telemetry-state.lock`
 * with `open(…, "wx")`, record `{createdAt, pid}`, run `task` on a fresh
 * read of the state, then close and remove the lock. An existing lock is
 * removed when stale, else waited for 10 ms; after 200 attempts the call
 * fails with `CLI telemetry state lock timeout`.
 */
async function withTelemetryStateLock(file: string, task: (state: Record<string, unknown>) => Promise<string>): Promise<string> {
  const lockFile = join(dirname(file), LOCK_FILE)
  await mkdir(dirname(lockFile), { recursive: true })
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      const handle = await open(lockFile, 'wx')
      try {
        await handle.writeFile(JSON.stringify({ createdAt: Date.now(), pid: process.pid }), 'utf-8')
        return await task(await readTelemetryState(file))
      }
      finally {
        await handle.close()
        await unlink(lockFile).catch(() => { /* already gone */ })
      }
    }
    catch (error) {
      if (!isNodeErrorCode(error, 'EEXIST')) throw error
      if (await removeStaleLockIfNeeded(lockFile, Date.now())) continue
      await sleep(LOCK_RETRY_MS)
    }
  }
  throw new Error('CLI telemetry state lock timeout')
}

/**
 * `ensurePersistedDeviceMid` (`EWs` @4062442): the deviceMid read without a
 * lock (`readExistingDeviceMid` `AWs`), else re-read under the lock and,
 * still missing, the generated one written into the state with its other
 * keys kept.
 */
async function ensurePersistedDeviceMid(file: string, generated: () => string): Promise<string> {
  return readDeviceMid(await readTelemetryState(file)) ?? withTelemetryStateLock(file, async state => {
    const existing = readDeviceMid(state)
    if (existing !== undefined) return existing
    const deviceMid = generated()
    state.deviceMid = deviceMid
    await writeTelemetryState(file, state)
    return deviceMid
  })
}

/** `createUuid` (`tG` @1013439): `crypto.randomUUID()`. Its `getRandomValues` and `Math.random` fallbacks cannot run on Node 22, which always has `randomUUID`. */
function createUuid(): string {
  return globalThis.crypto.randomUUID()
}

/** One promise per state file per process (`Xro`). */
const ensured = new Map<string, Promise<{ readonly value: string, readonly temporary: boolean }>>()

/**
 * `ensureCliDeviceMid` (`Qro` @4062043): the `metadata.user_id` deviceMid.
 * `temporary` marks the 3.16.3 fallback: taking the lock or writing the
 * state failed, so `value` is the id generated in this process and the
 * state file does not hold it. `createId` defaults to `createUuid`.
 */
export function ensureCliDeviceMid(options: { readonly env?: NodeJS.ProcessEnv, readonly createId?: () => string } = {}): Promise<{ readonly value: string, readonly temporary: boolean }> {
  const file = telemetryStateFile(options.env ?? process.env)
  const cached = ensured.get(file)
  if (cached !== undefined) return cached
  const createId = options.createId ?? createUuid
  let generated: string | undefined
  const getGeneratedDeviceMid = (): string => (generated ??= createId())
  const pending = ensurePersistedDeviceMid(file, getGeneratedDeviceMid).then(
    value => ({ value, temporary: false }),
    () => ({ value: getGeneratedDeviceMid(), temporary: true }),
  )
  ensured.set(file, pending)
  return pending
}

/** Successful routing reads per state file (`Iui`); a failed read is retried on the next refresh. */
const routingReads = new Map<string, string>()

/**
 * The routing config request's `X-Device-Mid` (`Kuc` @14468898): the
 * trimmed `deviceMid` when it is printable ASCII, else undefined. Never
 * generates. The path rule is `resolveTelemetryStateFile` (`Juc`
 * @14468783): `ZCODE_DATA_BASE_DIR` trimmed or the home directory, no `~`
 * expansion.
 */
export async function readRoutingDeviceMid(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const file = join(env[DATA_BASE_DIR_ENV]?.trim() || homedir(), ...STATE_PATH)
  const cached = routingReads.get(file)
  if (cached !== undefined) return cached
  try {
    const state = JSON.parse(await readFile(file, 'utf8')) as { deviceMid?: unknown }
    if (typeof state.deviceMid !== 'string') return undefined
    const value = state.deviceMid.trim()
    if (value.length === 0 || !ASCII_PRINTABLE.test(value)) return undefined
    routingReads.set(file, value)
    return value
  }
  catch {
    return undefined
  }
}
