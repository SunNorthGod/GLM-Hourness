/**
 * Pre-install gate for the bundle. Exits non-zero when the package shape would
 * break DSH boot, so a crash is caught before `plugin_manager install_bundle`
 * rather than on the user's next refresh.
 *
 * Checks:
 *  0. The directory table (scripts/packages.mjs, tableProblems): every source
 *     directory belongs to one package, every top-level directory under src/
 *     is the shared library or registered, and no directory name would make
 *     the ESLint boundary patterns misread an import.
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
 * Run: npm run preflight   (also part of npm test). The checks are exported
 * for tests/preflight.spec.ts; importing this file runs nothing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES, SHARED_DIR } from './packages.mjs'
import { MODULE_TABLE } from './ui-modules.mjs'

/** @param {string} dir */
const subdirectories = dir => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : []

/**
 * Directories at any depth below `dir`, as paths relative to it.
 * @param {string} dir
 * @returns {string[]}
 */
function nestedDirectories(dir) {
  return subdirectories(dir).flatMap(name => [name, ...nestedDirectories(join(dir, name)).map(inner => `${name}/${inner}`)])
}

/**
 * The directory table's self-check (docs/DEVELOPMENT.md §10): keys and
 * source directories unique, `shared` in no package; every top-level
 * directory under src/ is the shared library or belongs to exactly one
 * package, and every registered directory exists; below a package's
 * directories and src/shared/, no directory is named `src` or after another
 * package's top-level directory (src/shared/: after any package's), because
 * the boundary patterns read `../<name>/` without knowing the depth.
 * @param {string} root - repository root
 * @param {{ SHARED_DIR: string, PACKAGES: readonly { key: string, src: readonly string[] }[] }} table
 * @returns {string[]} problems, empty when the table holds
 */
export function tableProblems(root, table) {
  const problems = []
  const owner = new Map()
  const keys = new Set()
  for (const pkg of table.PACKAGES) {
    if (keys.has(pkg.key)) problems.push(`package key ${pkg.key} is registered twice`)
    keys.add(pkg.key)
    for (const dir of pkg.src) {
      if (dir === table.SHARED_DIR) problems.push(`package ${pkg.key} lists the shared library ${dir} as its own source directory`)
      else if (owner.has(dir)) problems.push(`source directory src/${dir} belongs to both ${owner.get(dir)} and ${pkg.key}`)
      else owner.set(dir, pkg.key)
    }
  }
  const src = join(root, 'src')
  for (const dir of subdirectories(src)) {
    if (dir !== table.SHARED_DIR && !owner.has(dir)) problems.push(`src/${dir} belongs to no package: register it in scripts/packages.mjs`)
  }
  for (const dir of [table.SHARED_DIR, ...owner.keys()]) {
    if (!existsSync(join(src, dir))) problems.push(`src/${dir} is registered but does not exist`)
  }
  const lookalikes = [
    ...table.PACKAGES.map(pkg => ({ dirs: pkg.src, others: table.PACKAGES.filter(other => other !== pkg).flatMap(other => other.src) })),
    { dirs: [table.SHARED_DIR], others: table.PACKAGES.flatMap(pkg => pkg.src) },
  ]
  for (const { dirs, others } of lookalikes) {
    for (const dir of dirs) {
      for (const nested of nestedDirectories(join(src, dir))) {
        const name = nested.slice(nested.lastIndexOf('/') + 1)
        if (name === 'src') problems.push(`src/${dir}/${nested} is named src, which the boundary patterns read as the top of src/`)
        else if (others.includes(name)) problems.push(`src/${dir}/${nested} has the name of another package's directory src/${name}; the boundary patterns would read imports of it as crossing`)
      }
    }
  }
  return problems
}

/** The bundle checks 1-5 on the repository at `root`, with the summary line they pass with. */
function bundleProblems(root) {
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
  const summary = `${Object.keys(pkg.exports ?? {}).length} exports, ${existsSync(patchPath) ? '1 patch' : '0 patch'}, client half ${pkg.dsh?.client ? 'declared' : 'absent'}; ui bundle client half built`
  return { failures, summary }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const table = tableProblems(root, { SHARED_DIR, PACKAGES })
  const { failures, summary } = bundleProblems(root)
  const problems = [...table.map(problem => `directory table: ${problem}`), ...failures]
  if (problems.length > 0) {
    console.error(`preflight: ${problems.length} problem(s), install aborted`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(`preflight: OK (directory table: ${PACKAGES.length} packages, ${PACKAGES.reduce((sum, pkg) => sum + pkg.src.length, 0)} source directories; ${summary})`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
