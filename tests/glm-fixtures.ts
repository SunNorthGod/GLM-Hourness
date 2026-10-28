/**
 * Shared doubles for the native-channel specs: an in-memory credential store
 * and an isolated ZCode data directory. Only the filesystem is replaced; the
 * DSH contract is never mocked (AGENTS.md).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StoreFs } from '../src/glm-llm/auth/store.ts'

/** An in-memory credential store; `files` is its content. */
export function memoryStore(): { fs: StoreFs, files: Map<string, string> } {
  const files = new Map<string, string>()
  const fs: StoreFs = {
    readFile: path => {
      const value = files.get(path)
      return value === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(value)
    },
    writeFile: (path, data) => {
      files.set(`${path}.tmp`, data)
      files.set(path, data)
      return Promise.resolve()
    },
    rename: (from, to) => {
      files.set(to, files.get(from) ?? '')
      files.delete(from)
      return Promise.resolve()
    },
    exists: path => Promise.resolve(files.has(path)),
  }
  return { fs, files }
}

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
