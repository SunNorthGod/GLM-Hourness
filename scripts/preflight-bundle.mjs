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
 *  5. The UI bundle (ui/): one row, its client half built (npm run build),
 *     wrapped in window.__ModuleLoader__.load with the package name as id,
 *     passing node --check, and requiring only the DSH client module table.
 *
 * Run: npm run preflight   (also part of npm test)
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULE_TABLE } from './ui-modules.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// 5: the UI bundle's client half.
const uiRoot = join(root, 'ui')
const uiPkg = JSON.parse(readFileSync(join(uiRoot, 'package.json'), 'utf8'))
const uiRows = [...readFileSync(join(uiRoot, uiPkg.dsh?.bundle?.patch ?? 'cordis.patch.yml'), 'utf8').matchAll(/^\s*name:\s*(\.\/[^\s#]+)/gm)].map(match => match[1])
if (uiRows.length !== 1) failures.push(`ui bundle declares ${uiRows.length} rows; a package with dsh.client needs exactly one`)
for (const row of uiRows) if (!existsSync(join(uiRoot, row))) failures.push(`ui patch row ${row} does not exist`)
if (!Array.isArray(uiPkg.dsh?.client?.inject) || !uiPkg.dsh?.client?.platform) failures.push('ui dsh.client needs platform and inject[]')
const uiClient = typeof uiPkg.exports?.['./client'] === 'string' ? join(uiRoot, uiPkg.exports['./client']) : undefined
if (uiClient === undefined) failures.push('ui exports["./client"] is missing')
else if (!existsSync(uiClient)) failures.push(`ui client half ${uiPkg.exports['./client']} is missing: run npm run build`)
else {
  const text = readFileSync(uiClient, 'utf8')
  if (!text.startsWith(`window.__ModuleLoader__.load({ id: ${JSON.stringify(uiPkg.name)},`)) failures.push(`ui client half is not wrapped in window.__ModuleLoader__.load with id ${uiPkg.name}`)
  const outside = [...new Set([...text.matchAll(/\brequire\("([^"]+)"\)/g)].map(match => match[1]))].filter(id => !MODULE_TABLE.includes(id))
  if (outside.length > 0) failures.push(`ui client half requires modules outside the DSH client module table: ${outside.join(', ')}`)
  try {
    execFileSync(process.execPath, ['--check', uiClient], { stdio: 'pipe' })
  }
  catch (error) {
    failures.push(`ui client half fails node --check: ${String(error).slice(0, 200)}`)
  }
}

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
console.log(`preflight: OK (${Object.keys(pkg.exports ?? {}).length} exports, ${existsSync(patchPath) ? '1 patch' : '0 patch'}, client half ${pkg.dsh?.client ? 'declared' : 'absent'}; ui bundle client half built)`)
