/**
 * Delete every package's dist/ (scripts/packages.mjs) before tsc writes it
 * again: tsc never removes the output of a deleted or moved module, and a
 * stale module left in dist/ stays loadable by a profile. Only the
 * directories the table names are touched; they hold build output and no
 * links.
 *
 * Run: node scripts/clean-dist.mjs   (first step of npm run build)
 */
import { rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES } from './packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const pkg of PACKAGES) rmSync(join(root, pkg.dir, 'dist'), { recursive: true, force: true })
