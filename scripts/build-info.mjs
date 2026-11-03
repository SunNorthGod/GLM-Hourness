/**
 * Write each built package's build stamp (metrics design §4.1, the
 * envelope's `v`; src/shared/build-info.ts reads it back): the package
 * version, the commit's first 7 hex digits (nogit without a git
 * repository) and whether the workspace had uncommitted changes at build
 * time. Last step of `npm run build`, after every dist/ is fresh.
 *
 * Run: node scripts/build-info.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES } from './packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

let commit = 'nogit'
let dirty = false
try {
  commit = git(['rev-parse', '--short=7', 'HEAD'])
  dirty = git(['status', '--porcelain']).length > 0
}
catch {
  // No git repository (or no commit yet): the stamp says nogit.
}

for (const pkg of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(root, pkg.dir, 'package.json'), 'utf8'))
  mkdirSync(join(root, pkg.dir, 'dist'), { recursive: true })
  writeFileSync(join(root, pkg.dir, 'dist', 'build-info.json'), `${JSON.stringify({ version: manifest.version, commit, dirty }, null, 2)}\n`)
}
console.log(`build-info: ${PACKAGES.map(pkg => pkg.name).join(', ')} ${commit}${dirty ? ' dirty' : ''}`)
