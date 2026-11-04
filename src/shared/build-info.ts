/**
 * The package's own build stamp (metrics design §4.1, the envelope's `v`):
 * `<package version>+<first 7 of the commit>`, `.dirty` when the workspace
 * had uncommitted changes at build time, `nogit` without a git repository,
 * and `unknown` when no build stamp can be read (the module runs from a
 * source tree, not a built package's dist/). `scripts/build-info.mjs`
 * writes each built package's `dist` build-info.json as the last step of
 * the build; this module reads the one nearest to itself, which is its own
 * package's.
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface BuildInfo {
  readonly version: string
  /** The commit's first 7 hex digits, or `nogit` when the workspace had no git repository at build time. */
  readonly commit: string
  readonly dirty: boolean
}

/** The build stamp nearest to `from` (a directory); undefined when none of its ancestors holds a build-info.json. */
export function readBuildInfo(from: string = dirname(fileURLToPath(import.meta.url))): BuildInfo | undefined {
  let dir = from
  for (;;) {
    try {
      if (statSync(join(dir, 'build-info.json')).isFile()) {
        const value: unknown = JSON.parse(readFileSync(join(dir, 'build-info.json'), 'utf8'))
        if (
          typeof value === 'object' && value !== null
          && typeof (value as Record<string, unknown>).version === 'string'
          && typeof (value as Record<string, unknown>).commit === 'string'
          && typeof (value as Record<string, unknown>).dirty === 'boolean'
        ) {
          const info = value as BuildInfo
          return { version: info.version, commit: info.commit, dirty: info.dirty }
        }
        return undefined
      }
    }
    catch {
      // No build-info.json at this level; climb.
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** The stamp of the package this module is compiled into (`<version>+<commit>[.dirty]`, `<version>+nogit`, `unknown`); read once. */
export function buildStamp(from?: string): string {
  const info = readBuildInfo(from)
  if (info === undefined) return 'unknown'
  return `${info.version}+${info.commit}${info.dirty ? '.dirty' : ''}`
}
