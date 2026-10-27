/**
 * Encrypted file-based credential store (ported from reference/zcode-api
 * src/auth/store.ts): AES-256-GCM with a SHA-256-derived key, atomic writes
 * (temp file + rename). The store file lives under the agent home
 * (`<home>/credentials.json`); the seed is machine-derived unless
 * `GLM_HOURNESS_CREDENTIAL_SECRET` overrides it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENV_SECRET = 'GLM_HOURNESS_CREDENTIAL_SECRET'

export interface StoreFs {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  exists?(path: string): Promise<boolean>
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
export async function loadCredential(fs: StoreFs, storePath: string): Promise<unknown | undefined> {
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

/** Atomically persist one credential value (temp file + rename over the target). */
export async function saveCredential(fs: StoreFs, storePath: string, value: unknown): Promise<void> {
  const sealed = seal(JSON.stringify(value))
  const tempPath = `${storePath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(sealed))
  await fs.rename(tempPath, storePath)
}

/** Remove the stored credential; a missing store is a no-op. */
export async function clearCredential(fs: StoreFs, storePath: string): Promise<void> {
  const exists = fs.exists === undefined ? true : await fs.exists(storePath)
  if (!exists) return
  await fs.writeFile(storePath, '')
}
