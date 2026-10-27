/**
 * Pre-install gate for the bundle. Exits non-zero when the package shape would
 * break DSH boot, so a crash is caught before `plugin_manager install_bundle`
 * rather than on the user's next refresh.
 *
 * Checks:
 *  1. Every bundle-row entry file exists (dist built, not stale).
 *  2. Every exports path resolves to a real file.
 *  3. Client-half constraint: client-modules composes per PACKAGE, so a package
 *     that declares `dsh.client` must be resolved from exactly ONE active loader
 *     row. Multiple rows + dsh.client = "resolves from multiple active Loader
 *     sources" boot failure (crash-2026-10-27T11-42-08).
 *  4. A declared client artifact passes node --check.
 *
 * Run: npm run preflight   (also part of npm test)
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// 1 + 2: files behind exports and rows exist.
for (const [name, target] of Object.entries(pkg.exports ?? {})) {
  if (typeof target !== 'string' || target.includes('*')) continue
  if (!existsSync(join(root, target))) failures.push(`exports ${name} -> ${target} is missing`)
}

const patchPath = join(root, pkg.dsh?.bundle?.patch ?? 'cordis.patch.yml')
if (!existsSync(patchPath)) {
  failures.push(`bundle patch ${patchPath} is missing`)
}
else {
  const patchText = readFileSync(patchPath, 'utf8')
  const rowNames = [...patchText.matchAll(/^\s*name:\s*(\.\/[^\s#]+)/gm)].map(match => match[1])
  if (rowNames.length === 0) failures.push('bundle patch declares no rows')
  for (const rowName of rowNames) {
    if (!existsSync(join(root, rowName))) failures.push(`patch row ${rowName} does not exist`)
  }

  // 3: the client-half constraint.
  const client = pkg.dsh?.client
  if (client !== undefined) {
    const resolvingRows = rowNames.filter(rowName => rowName.startsWith('./dist/') && rowName.endsWith('.js'))
    if (resolvingRows.length > 1) {
      failures.push(`package declares dsh.client but ${resolvingRows.length} loader rows resolve it (${resolvingRows.join(', ')}); client-modules requires exactly one active source per package — put the client half in its own single-entry bundle`)
    }
    const clientExport = pkg.exports?.['./client']
    if (typeof clientExport !== 'string') failures.push('dsh.client is declared but exports["./client"] is missing')
    else if (!existsSync(join(root, clientExport))) failures.push(`client artifact ${clientExport} is missing`)
    // 4: syntax of the client artifact.
    if (typeof clientExport === 'string' && existsSync(join(root, clientExport))) {
      try {
        execFileSync(process.execPath, ['--check', join(root, clientExport)], { stdio: 'pipe' })
      }
      catch (error) {
        failures.push(`client artifact ${clientExport} fails node --check: ${String(error).slice(0, 200)}`)
      }
    }
    if (!Array.isArray(client.inject) || !client.platform) failures.push('dsh.client needs platform and inject[]')
  }
}

if (failures.length > 0) {
  console.error(`preflight: ${failures.length} problem(s), install aborted`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`preflight: OK (${Object.keys(pkg.exports ?? {}).length} exports, ${existsSync(patchPath) ? '1 patch' : '0 patch'}, client half ${pkg.dsh?.client ? 'declared' : 'absent'})`)
