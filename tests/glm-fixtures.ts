/**
 * Shared doubles for the native-channel specs: an in-memory credential store
 * and an isolated ZCode data directory. Only the filesystem is replaced; the
 * DSH contract is never mocked (AGENTS.md).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StoreFs } from '../src/glm-llm/auth/store.ts'
import { QuotaJournal, type QuotaFs } from '../src/glm-llm/quota-journal.ts'

/** An in-memory credential store; `files` is its content. */
export function memoryStore(): { fs: StoreFs, files: Map<string, string> } {
  const files = new Map<string, string>()
  const fs: StoreFs = {
    readFile: path => {
      const value = files.get(path)
      return value === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(value)
    },
    writeFile: (path, data) => {
      files.set(path, data)
      return Promise.resolve()
    },
    rename: (from, to) => {
      const data = files.get(from)
      if (data === undefined) return Promise.reject(new Error(`ENOENT: ${from}`))
      files.set(to, data)
      files.delete(from)
      return Promise.resolve()
    },
    exists: path => Promise.resolve(files.has(path)),
    unlink: path => {
      files.delete(path)
      return Promise.resolve()
    },
  }
  return { fs, files }
}

/**
 * A quota journal on an in-memory filesystem, for the adapters of specs whose
 * `home` is only a name for the memory credential store: a record the adapter
 * writes (a refused login, a spent quota) must not create that directory on the disk.
 */
export function memoryJournal(home = 'C:/ws/.llm'): QuotaJournal {
  const files = new Map<string, string>()
  let version = 0
  const quotaFs: QuotaFs = {
    mkdir: () => Promise.resolve(),
    appendFile: (path, data) => {
      files.set(path, (files.get(path) ?? '') + data)
      version += 1
      return Promise.resolve()
    },
    stat: path => Promise.resolve(files.has(path) ? { size: Buffer.byteLength(files.get(path) ?? ''), mtimeMs: version } : undefined),
    readTail: (path, bytes) => Promise.resolve(Buffer.from(files.get(path) ?? '').subarray(-bytes).toString('utf8')),
  }
  return new QuotaJournal({ home, fs: quotaFs })
}

/**
 * A fake project access token with the 3.16.3 shape (HS256, typ JWT,
 * sign_type SIGN; `token_use: project_access`, `api_key`); `serial`
 * distinguishes successive mints. The signature segment is a placeholder.
 */
export function fakeProjectToken(apiKeyId: string, serial = 1): string {
  const segment = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${segment({ alg: 'HS256', typ: 'JWT', sign_type: 'SIGN' })}.${segment({ token_use: 'project_access', api_key: apiKeyId, serial })}.sig`
}

/** A handshake `privateCipher` for a fresh Ed25519 key, sealed as 3.16.3 opens it: AES-GCM under HKDF(secret, ed25519_priv), AAD apiKeyId. */
export async function sealedSigningKey(secret: string, apiKeyId: string): Promise<string> {
  const utf8 = new TextEncoder()
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  const hkdf = await crypto.subtle.importKey('raw', utf8.encode(secret), 'HKDF', false, ['deriveKey'])
  const sealing = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: utf8.encode('WD_CLIENT_SIGN_KDF_SALT'), info: utf8.encode('ed25519_priv') }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(apiKeyId) }, sealing, utf8.encode(pkcs8))
  return Buffer.concat([iv, new Uint8Array(sealed)]).toString('base64')
}

/** The API key id the PAT-plane double locates. */
export const PAT_KEY_ID = 'key-1'

/**
 * The bigmodel PAT plane as 3.16.3 meets it, for bigmodel.cn URLs:
 * customer info with a default organization and project, the
 * `zcode-api-key` key, and `access_tokens` minting `fakeProjectToken(PAT_KEY_ID, n)`
 * for the n-th mint (or the status `mintStatus` answers). Undefined for
 * other URLs. `mints` counts the mints.
 */
export function patPlane(options: { mintStatus?: number } = {}): { answer: (url: string, init?: RequestInit) => Response | undefined, mints: () => number } {
  let mints = 0
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return {
    mints: () => mints,
    answer: (url, init) => {
      if (!url.startsWith('https://bigmodel.cn/')) return undefined
      if (url.endsWith('/api/biz/customer/getCustomerInfo')) {
        return json(200, { code: 200, data: { organizations: [{ organizationId: 'org-1', organizationName: '默认机构', projects: [{ projectId: 'proj-1', projectName: '默认项目', projectType: 1 }] }] } })
      }
      if (url.endsWith('/api_keys') && init?.method === 'GET') return json(200, { code: 200, data: [{ name: 'zcode-api-key', apiKey: PAT_KEY_ID }] })
      if (url.endsWith('/access_tokens')) {
        if (options.mintStatus !== undefined) return json(options.mintStatus, {})
        mints += 1
        return json(200, { code: 200, data: { accessToken: fakeProjectToken(PAT_KEY_ID, mints), tokenType: 'Bearer', expiresIn: 3600, expiresAt: Math.floor(Date.now() / 1000) + 3600 } })
      }
      return json(404, {})
    },
  }
}

/**
 * A loopback HTTP server that records the header names of each request as
 * they arrive on the wire (`rawHeaders`, so order and case are the sender's),
 * and answers `answer()`. A network double: the request leaves through the
 * real fetch of this Node, as the adapter's would.
 */
export async function wireRecorder(answer: () => { status: number, contentType: string, body: string }): Promise<{ url: string, requests: Array<{ path: string, names: string[] }>, close: () => Promise<void> }> {
  const requests: Array<{ path: string, names: string[] }> = []
  const server = createServer((req, res) => {
    requests.push({ path: req.url ?? '', names: req.rawHeaders.filter((_, index) => index % 2 === 0) })
    req.resume()
    req.on('end', () => {
      const { status, contentType, body } = answer()
      res.writeHead(status, { 'content-type': contentType })
      res.end(body)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

/** Headers undici adds on its own around the caller's (not part of the 3.16.3 header chain). */
export const TRANSPORT_HEADERS: ReadonlySet<string> = new Set(['host', 'connection', 'accept-language', 'sec-fetch-mode', 'accept-encoding', 'content-length'])

const created: string[] = []
process.on('exit', () => { for (const dir of created) rmSync(dir, { recursive: true, force: true }) })

/**
 * A fresh ZCode data base directory (`ZCODE_DATA_BASE_DIR`), removed at exit,
 * optionally holding `.zcode/v2/telemetry-state.json` with `state`. Every
 * adapter that reaches the network in a spec gets one, so no spec reads the
 * real `~/.zcode`.
 */
export function zcodeDataDir(state?: Record<string, unknown>): { env: NodeJS.ProcessEnv, dir: string, stateFile: string } {
  const dir = mkdtempSync(join(tmpdir(), 'glmh-zcode-'))
  created.push(dir)
  const stateFile = join(dir, '.zcode', 'v2', 'telemetry-state.json')
  if (state !== undefined) {
    mkdirSync(join(dir, '.zcode', 'v2'), { recursive: true })
    writeFileSync(stateFile, JSON.stringify(state, null, 2))
  }
  return { env: { ZCODE_DATA_BASE_DIR: dir }, dir, stateFile }
}
