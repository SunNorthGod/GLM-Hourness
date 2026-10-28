/**
 * The ZCode deviceMid, read the way ZCode 3.16.3 reads it and never written.
 *
 * 3.16.3 keeps one deviceMid per machine in
 * `<base>/.zcode/v2/telemetry-state.json` (`deviceMid`) and reads it in two
 * places:
 * - `metadata.user_id` of every Anthropic request (`ensureCliDeviceMid`,
 *   `Qro` @4062043, with `resolveCliTelemetryStateFile` `CWs` @4062252 and
 *   `readExistingDeviceMid` / `readDeviceMid` / `readTelemetryState`, `AWs`,
 *   `eoo`, `too` @4062442–4062778);
 * - `X-Device-Mid` of the endpoint-routing config request
 *   (`readExistingDeviceMid` `Kuc` @14468898 with `resolveTelemetryStateFile`
 *   `Juc` @14468783).
 * `<base>` is `ZCODE_DATA_BASE_DIR` when set, else the home directory.
 *
 * Deviation, by decision (m1-parity item 9): 3.16.3 generates a deviceMid
 * and writes it back under a lock file when the state has none
 * (`ensurePersistedDeviceMid` `EWs`, `withTelemetryStateLock` `RWs`). This
 * module only reads; the caller keeps the bundle's own deviceMid when the
 * state has none and reports that in the row health.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** `IWs` / `Vuc`: the environment variable that relocates the ZCode data directory. */
const DATA_BASE_DIR_ENV = 'ZCODE_DATA_BASE_DIR'
const STATE_PATH = ['.zcode', 'v2', 'telemetry-state.json'] as const
const ASCII_PRINTABLE = /^[\x20-\x7e]+$/u

/** `resolveCliTelemetryStateFile` (`CWs`): `ZCODE_DATA_BASE_DIR` trimmed, an empty value falls back to the home directory. */
export function telemetryStateFile(env: NodeJS.ProcessEnv): string {
  const configured = env[DATA_BASE_DIR_ENV]?.trim() ?? homedir()
  return join(expandHome(configured.length > 0 ? configured : homedir()), ...STATE_PATH)
}

/** `NWs` @4064238: `~` and `~/…` expand to the home directory, anything else resolves against the working directory. */
function expandHome(path: string): string {
  if (path === '~') return homedir()
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : resolve(path)
}

/** `readTelemetryState` (`too`): an unreadable or unparsable file, or a non-object, reads as `{}`. */
async function readTelemetryState(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

/** One read per state file per process, as 3.16.3 caches its `ensureCliDeviceMid` promise per state file (`Xro`). */
const cliReads = new Map<string, Promise<string | undefined>>()

/** The `metadata.user_id` deviceMid: the state's `deviceMid` when it is a non-empty string (`readDeviceMid` `eoo`), else undefined. */
export function readCliDeviceMid(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const file = telemetryStateFile(env)
  let pending = cliReads.get(file)
  if (pending === undefined) {
    pending = readTelemetryState(file).then(state => typeof state.deviceMid === 'string' && state.deviceMid.length > 0 ? state.deviceMid : undefined)
    cliReads.set(file, pending)
  }
  return pending
}

/** Successful routing reads per state file (`Iui`); a failed read is retried on the next refresh. */
const routingReads = new Map<string, string>()

/**
 * The routing config request's `X-Device-Mid` (`Kuc`): the trimmed
 * `deviceMid` when it is printable ASCII, else undefined. The path rule is
 * `Juc`: `ZCODE_DATA_BASE_DIR` trimmed or the home directory, no `~` expansion.
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
