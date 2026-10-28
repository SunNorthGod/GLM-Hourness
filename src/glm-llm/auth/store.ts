/**
 * Encrypted file-based credential store (ported from reference/zcode-api
 * src/auth/store.ts): AES-256-GCM with a SHA-256-derived key, atomic writes
 * (temp file + rename). The store file lives under the agent home
 * (`<home>/credentials.json`); the seed is machine-derived unless
 * `GLM_HOURNESS_CREDENTIAL_SECRET` overrides it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import type { Credential } from './types.ts'

const ENV_SECRET = 'GLM_HOURNESS_CREDENTIAL_SECRET'

export interface StoreFs {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  exists?(path: string): Promise<boolean>
  /** Removes a temp file left by a failed write. */
  unlink?(path: string): Promise<void>
}

/** Derive the AES-256-GCM key as SHA-256(seed): real 32-byte diffusion for env-secret deployments. */
function encryptionKey(): Uint8Array {
  const seed = process.env[ENV_SECRET] ?? `${process.env.HOME ?? process.env.USERPROFILE}-${process.platform}-${process.arch}`
  return new Uint8Array(createHash('sha256').update(seed, 'utf8').digest())
}

interface SealedCredential {
  readonly v: 1
  readonly iv: string
  readonly authTag: string
  readonly data: string
}

function seal(plaintext: string): SealedCredential {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { v: 1, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

function unseal(sealed: SealedCredential): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(sealed.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
}

function isSealed(value: unknown): value is SealedCredential {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.v === 1 && typeof record.iv === 'string' && typeof record.authTag === 'string' && typeof record.data === 'string'
}

/** Load the stored credential; a missing store returns undefined, corruption or a wrong secret throws. */
export async function loadCredential(fs: StoreFs, storePath: string): Promise<unknown> {
  let raw: string
  try {
    raw = await fs.readFile(storePath)
  }
  catch {
    return undefined // ENOENT: no credential yet
  }
  if (raw.trim().length === 0) return undefined // cleared store
  let sealed: unknown
  try {
    sealed = JSON.parse(raw)
  }
  catch {
    throw new Error(`credential store is corrupted (not JSON): ${storePath}`)
  }
  if (!isSealed(sealed)) throw new Error(`credential store has an unrecognized format: ${storePath}`)
  let plaintext: string
  try {
    plaintext = unseal(sealed)
  }
  catch {
    throw new Error(`credential store cannot be decrypted (wrong secret?): ${storePath}`)
  }
  return JSON.parse(plaintext)
}

/**
 * A stored record read as version 2; `migrate` marks a version-1 record
 * that holds a login token and is rewritten once.
 */
function readRecord(raw: unknown): { credential: Credential, migrate: boolean } | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  if (record.provider !== 'bigmodel') return undefined
  const { oauthAccessToken, userId, jwt, location } = record
  const stored = typeof location === 'object' && location !== null ? location as Record<string, unknown> : {}
  const credential: Credential = {
    version: 2,
    provider: 'bigmodel',
    ...(typeof oauthAccessToken === 'string' ? { oauthAccessToken } : {}),
    ...(typeof userId === 'string' ? { userId } : {}),
    ...(typeof jwt === 'string' ? { jwt } : {}),
    ...(record.version === 2 && typeof stored.key === 'string' && typeof stored.value === 'string' ? { location: { key: stored.key, value: stored.value } } : {}),
  }
  if (record.version === 2) return { credential, migrate: false }
  if (typeof record.apiKey !== 'string') return undefined
  return { credential, migrate: credential.oauthAccessToken !== undefined || credential.jwt !== undefined }
}

/**
 * Load the stored login as a version-2 record (docs/DESIGN.md §4.1).
 * A version-1 record (`{apiKey, provider, userId?, jwt?, oauthAccessToken?}`)
 * that holds a login token is rewritten once as version 2 without the API
 * key and its secret; the login tokens carry over unchanged. The rewrite
 * runs in the store's write queue and re-reads the file there, so
 * concurrent first reads migrate once and never overwrite a newer write. A
 * failed rewrite keeps the file and serves the version-2 record from
 * memory, so the next load tries again. A version-1 record without any
 * login token is left as it is and reads as a record without tokens (the
 * request then asks for /glm-login). Missing store: undefined; corruption
 * throws.
 */
export async function loadStoredCredential(fs: StoreFs, storePath: string): Promise<Credential | undefined> {
  const read = readRecord(await loadCredential(fs, storePath))
  if (read?.migrate === true) {
    await serialized(storePath, async () => {
      const current = readRecord(await loadCredential(fs, storePath))
      if (current?.migrate === true) await writeSealed(fs, storePath, current.credential)
    }).catch(() => { /* retried on the next load; the login stays in the old file */ })
  }
  return read?.credential
}

/**
 * The write queue of each store file, process-wide: every write of one
 * store (login, logout, migration, location update) runs after the earlier
 * ones, so no read-modify-write loses a concurrent write.
 */
const writeQueues = new Map<string, Promise<void>>()

function serialized<T>(storePath: string, task: () => Promise<T>): Promise<T> {
  const key = resolve(storePath)
  const run = (writeQueues.get(key) ?? Promise.resolve()).then(task)
  const tail = run.then(() => undefined, () => undefined)
  writeQueues.set(key, tail)
  void tail.then(() => { if (writeQueues.get(key) === tail) writeQueues.delete(key) })
  return run
}

/**
 * Seal and write through a temp file of its own, then rename it over the
 * target; a failed write removes its temp file. The temp name follows
 * 3.16.3 `PWs` @4062889 (`.<name>.<pid>.<ms>.<random hex>.tmp` beside the
 * target), so concurrent writers never share one.
 */
async function writeSealed(fs: StoreFs, storePath: string, value: unknown): Promise<void> {
  const sealed = seal(JSON.stringify(value))
  const tempPath = join(dirname(storePath), `.${basename(storePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  try {
    await fs.writeFile(tempPath, JSON.stringify(sealed))
    await fs.rename(tempPath, storePath)
  }
  catch (error) {
    await fs.unlink?.(tempPath).catch(() => { /* already gone */ })
    throw error
  }
}

/** Atomically persist one credential value, in the store's write queue. */
export function saveCredential(fs: StoreFs, storePath: string, value: unknown): Promise<void> {
  return serialized(storePath, () => writeSealed(fs, storePath, value))
}

/**
 * Read-modify-write of the stored login in the store's write queue: `update`
 * sees the record as it is at write time and returns the record to store,
 * or undefined to leave the file as it is. No stored login: nothing is
 * written.
 */
export function updateStoredCredential(fs: StoreFs, storePath: string, update: (credential: Credential) => Credential | undefined): Promise<void> {
  return serialized(storePath, async () => {
    const current = readRecord(await loadCredential(fs, storePath))?.credential
    const next = current === undefined ? undefined : update(current)
    if (next !== undefined) await writeSealed(fs, storePath, next)
  })
}

/** Remove the stored credential, in the store's write queue; a missing store is a no-op. */
export function clearCredential(fs: StoreFs, storePath: string): Promise<void> {
  return serialized(storePath, async () => {
    const exists = fs.exists === undefined ? true : await fs.exists(storePath)
    if (!exists) return
    await fs.writeFile(storePath, '')
  })
}
