/**
 * The audit references under /reference/ are not committed
 * (docs/DEVELOPMENT.md §9), so a git worktree starts without them; only the
 * main checkout has them. referenceDir() names the directory a gate or test
 * reads them from: this checkout's reference/ when it exists, else the main
 * checkout's, the parent of the repository's common git directory. A
 * worktree so checks against the same sources as the main checkout, with
 * no copy, link or environment variable. When neither exists it returns
 * this checkout's path and the caller behaves as on a machine without the
 * references. Paths resolve against the working directory, the repository
 * root under npm scripts.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** @returns {string} absolute path of the reference directory to read */
export function referenceDir() {
  const own = resolve('reference')
  if (existsSync(own)) return own
  // Without --path-format=absolute the main checkout prints a relative `.git` (docs/FACTS.md §3).
  const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' })
  const common = git.status === 0 ? git.stdout.trim() : ''
  if (common === '') return own
  const main = join(dirname(common), 'reference')
  return existsSync(main) ? main : own
}
