/**
 * ZCode client identity for upstream LLM requests (ported from
 * reference/zcode-api src/proxy/identity.ts, bundle `g6n` shape): the
 * fingerprint headers that make the channel indistinguishable from the
 * official desktop client. The LLM plane never carries X-Device-Mid; the
 * context plane (endpoint routing) does. The deviceMid is ZCode's own
 * (device-mid.ts).
 */
import os from 'node:os'
import { basename } from 'node:path'

/** Printable-ASCII gate copied from the ZCode bundle's `fio` helper. */
const ASCII_PRINTABLE = /^[\x20-\x7e]+$/

export interface ZcodeIdentity {
  readonly appVersion: string
  readonly sourceTitle: string
  readonly refererOrigin: string
  readonly deviceMid?: string
}

/**
 * ZCode release this channel presents as (docs/DESIGN.md §1). One value
 * feeds every version-bearing field: `User-Agent` / `X-ZCode-App-Version`,
 * the OAuth redirect `app_version`, the signing `X-Client-Version`, and the
 * project-token `clientVersion` (3.17.1 uses one constant for the last two,
 * as 3.16.3 did).
 */
export const ZCODE_APP_VERSION = '3.17.1'

/**
 * The desktop identity: 3.16.3 sends `X-Title: Z Code@electron` because the
 * desktop starts its agent with `app-server` (`detectDefaultProviderSourceTitle`,
 * `kuc` @14423244) and the routing config request passes
 * `sourceTitle: "electron"` (@15096557); user decision 2026-10-28 (question-8).
 */
export const DEFAULT_IDENTITY: ZcodeIdentity = {
  appVersion: ZCODE_APP_VERSION,
  sourceTitle: 'electron',
  refererOrigin: 'https://zcode.z.ai',
}

/** Normalize a header value: trimmed + printable ASCII, else undefined. */
export function normalizePrintableHeaderValue(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value.length > 0 && ASCII_PRINTABLE.test(value) ? value : undefined
}

/** Resolve the appVersion the way `fio` does. */
function resolveAppVersion(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value.length > 0 && ASCII_PRINTABLE.test(value) ? value : undefined
}

function normalizeOsCategory(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin': return 'macos'
    case 'win32': return 'windows'
    default: return 'linux'
  }
}

function resolveClientLanguage(): string | undefined {
  const override = normalizePrintableHeaderValue(process.env.ZCODE_IDENTITY_CLIENT_LANGUAGE)
  if (override !== undefined) return override
  try { return Intl.DateTimeFormat().resolvedOptions().locale || undefined } catch { return undefined }
}

function resolveClientTimezone(): string | undefined {
  const override = normalizePrintableHeaderValue(process.env.ZCODE_IDENTITY_CLIENT_TIMEZONE)
  if (override !== undefined) return override
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined } catch { return undefined }
}

/**
 * Identity headers for LLM completion requests (bundle `g6n`): X-ZCode-Agent
 * sits 8th, X-Os-Category is unconditional, X-Device-Mid is never sent.
 * `env.overrides` replaces the runtime-detected platform/arch/release chain
 * (tests inject deterministic values; the real chain reads process/os).
 */
export function buildLlmIdentityHeaders(id: ZcodeIdentity, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const appVersion = resolveAppVersion(id.appVersion)
  const platform = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_PLATFORM ?? process.platform)
  const arch = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_ARCH ?? os.arch())
  const release = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_RELEASE ?? os.release())
  const releaseChannel = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_RELEASE_CHANNEL)
    ?? (env.ZCODE_ENV?.trim().toLowerCase() === 'test' ? 'test' : 'production')
  return {
    'HTTP-Referer': id.refererOrigin,
    'User-Agent': `ZCode/${appVersion ?? 'unknown'}`,
    ...(appVersion === undefined ? {} : { 'X-ZCode-App-Version': appVersion }),
    'X-Title': `Z Code@${id.sourceTitle}`,
    'X-Release-Channel': releaseChannel,
    'X-Client-Language': resolveClientLanguage() ?? 'unknown',
    'X-Client-Timezone': resolveClientTimezone() ?? 'unknown',
    'X-ZCode-Agent': 'glm',
    ...(platform !== undefined && arch !== undefined ? { 'X-Platform': `${platform}-${arch}` } : {}),
    'X-Os-Category': normalizeOsCategory((env.ZCODE_IDENTITY_PLATFORM ?? process.platform) as NodeJS.Platform),
    ...(release === undefined ? {} : { 'X-Os-Version': release }),
  }
}

/** Context-plane identity headers (bundle `TV`): X-Device-Mid present, X-ZCode-Agent gone. */
export function buildContextIdentityHeaders(id: ZcodeIdentity, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const appVersion = resolveAppVersion(id.appVersion)
  const platform = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_PLATFORM ?? process.platform)
  const arch = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_ARCH ?? os.arch())
  const release = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_RELEASE ?? os.release())
  const releaseChannel = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_RELEASE_CHANNEL)
    ?? (env.ZCODE_ENV?.trim().toLowerCase() === 'test' ? 'test' : 'production')
  const deviceMid = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_DEVICE_MID) ?? normalizePrintableHeaderValue(id.deviceMid)
  return {
    'User-Agent': `ZCode/${appVersion ?? 'unknown'}`,
    'HTTP-Referer': id.refererOrigin,
    'X-Title': `Z Code@${id.sourceTitle}`,
    ...(appVersion === undefined ? {} : { 'X-ZCode-App-Version': appVersion }),
    ...(platform !== undefined && arch !== undefined ? { 'X-Platform': `${platform}-${arch}` } : {}),
    ...(releaseChannel === undefined ? {} : { 'X-Release-Channel': releaseChannel }),
    'X-Client-Language': resolveClientLanguage() ?? 'unknown',
    'X-Client-Timezone': resolveClientTimezone() ?? 'unknown',
    ...(platform === undefined ? {} : { 'X-Os-Category': normalizeOsCategory((env.ZCODE_IDENTITY_PLATFORM ?? process.platform) as NodeJS.Platform) }),
    ...(release === undefined ? {} : { 'X-Os-Version': release }),
    ...(deviceMid === undefined ? {} : { 'X-Device-Mid': deviceMid }),
  }
}

/** Environment-info values for the start-plan Environment section (mirror of `resolveEnvPromptInfo`). */
export function resolveEnvPromptInfo(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): { cwd: string, platform: string, shell: string, osVersion: string } {
  const platform = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_PLATFORM ?? process.platform) ?? 'unknown'
  const release = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_RELEASE ?? os.release()) ?? ''
  const arch = normalizePrintableHeaderValue(env.ZCODE_IDENTITY_ARCH ?? os.arch()) ?? ''
  const osVersion = [platform, release, arch].filter(part => part.length > 0).join(' ')
  const shellRaw = env.SHELL ?? env.ComSpec ?? env.COMSPEC ?? ''
  const shell = shellRaw.length > 0 ? basename(shellRaw) : 'unknown'
  const workingDir = env.ZCODE_IDENTITY_ENV_CWD?.trim() || cwd
  return { cwd: workingDir, platform, shell, osVersion }
}
