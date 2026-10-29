/**
 * Pre-install gate for the two bundles (split design §7.4). Exits non-zero
 * when the repository would break DSH boot or drift from the directory table
 * (scripts/packages.mjs), so a crash is caught before a profile loads the
 * packages rather than on the user's next refresh.
 *
 * Checks:
 *  1. The directory table (tableProblems): names, directories and row ids
 *     unique, every source directory in one package, every row module in
 *     its package's directories, every top-level directory under src/ the
 *     shared library or registered, and no directory name that would make
 *     the ESLint boundary patterns misread an import.
 *  2. The bundle manifests (bundleProblems): the table's packages, then the
 *     old client package under ui/ until split step 6. Each manifest is
 *     named as the table says; `dsh.bundle.patch` is a path or a list of
 *     paths, each `./`-relative, without `..`, inside the package and
 *     present (a patch path climbing out resolves wrong on the profile's
 *     junction). The root is the development workspace and no bundle: no
 *     `dsh`, `main` or `exports`, `private` true, no cordis.patch.yml.
 *  3. Insert rows: every item of a patch starts with `- id:`; its `name` is
 *     `./`-relative, without `..`, and exists from the patch's directory; a
 *     package's rows are the table's, in order (`./dist/<module>.js`); the
 *     old client package has exactly its one row.
 *  4. Composition: the patches in profile order insert every row id once,
 *     and the ids are the table's rows plus the client row.
 *  5. Build output and configuration: export targets exist and each row is
 *     exported as `./<id without glm-hourness/>`; a package's dist/ holds
 *     only its source directories and shared/; its tsconfig includes exactly
 *     its source directories; HEALTH_PACKAGES in dist/shared/health.js is
 *     the table; the packages and the root are `type: module`; each package
 *     carries the plugin page's display information (locale/en.json and
 *     zh.json with meta.title and meta.description, exported as
 *     ./locale/*.json, and an ./icon export to an SVG, PNG, JPEG or WebP
 *     file of at most 256 KiB).
 *  6. Runtime bare imports of a package's dist/**\/*.js (static imports,
 *     re-exports and import()) are in its peerDependencies; Node builtins
 *     are exempt and .d.ts files are not read (their imports are types).
 *  7. Client halves: the packages declare no dsh.client (the root has no
 *     `dsh` at all, check 2); the old client package declares it with
 *     platform and inject, exports
 *     ./client, and its client half is built, wrapped in
 *     window.__ModuleLoader__.load with the package name as id, passes
 *     node --check, and requires only the DSH client module table.
 *
 * Run: npm run preflight   (also part of npm test). The checks are exported
 * for tests/preflight.spec.ts; importing this file runs nothing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isBuiltin } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { LEGACY_CLIENT_BUNDLE, PACKAGES, SHARED_DIR } from './packages.mjs'
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
 * Files at any depth below `dir`, as absolute paths.
 * @param {string} dir
 * @returns {string[]}
 */
function nestedFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? nestedFiles(join(dir, entry.name)) : [join(dir, entry.name)])
}

/** The row id without the project prefix: the export key and the health row name. */
const rowName = id => id.replace(/^glm-hourness\//, '')

/**
 * The directory table's self-check (docs/DEVELOPMENT.md §10): keys, names,
 * package directories, source directories and row ids unique, `shared` in
 * no package, every row module inside its package's source directories;
 * every top-level directory under src/ is the shared library or belongs to
 * exactly one package, and every registered directory exists; below a
 * package's directories and src/shared/, no directory is named `src` or
 * after another package's top-level directory (src/shared/: after any
 * package's), because the boundary patterns read `../<name>/` without
 * knowing the depth.
 * @param {string} root - repository root
 * @param {{ SHARED_DIR: string, PACKAGES: readonly { key: string, name: string, dir: string, src: readonly string[], rows: readonly { id: string, module: string }[] }[] }} table
 * @returns {string[]} problems, empty when the table holds
 */
export function tableProblems(root, table) {
  const problems = []
  const owner = new Map()
  const seen = { key: new Set(), name: new Set(), dir: new Set(), row: new Set() }
  const once = (kind, value, label) => {
    if (seen[kind].has(value)) problems.push(`${label} ${value} is registered twice`)
    seen[kind].add(value)
  }
  for (const pkg of table.PACKAGES) {
    once('key', pkg.key, 'package key')
    once('name', pkg.name, 'package name')
    once('dir', pkg.dir, 'package directory')
    for (const dir of pkg.src) {
      if (dir === table.SHARED_DIR) problems.push(`package ${pkg.key} lists the shared library ${dir} as its own source directory`)
      else if (owner.has(dir)) problems.push(`source directory src/${dir} belongs to both ${owner.get(dir)} and ${pkg.key}`)
      else owner.set(dir, pkg.key)
    }
    for (const row of pkg.rows) {
      once('row', row.id, 'row id')
      if (!pkg.src.includes(row.module.split('/')[0])) problems.push(`row ${row.id} of ${pkg.key} has its module ${row.module} outside the package's source directories`)
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

/**
 * Parse a JSON file; `{ error }` when it is missing or not JSON.
 * @param {string} file
 */
function readJson(file) {
  if (!existsSync(file)) return { error: 'is missing' }
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) }
  }
  catch {
    return { error: 'is not valid JSON' }
  }
}

/** Whether `path` (`./`-relative) stays inside its base: no `..` segment, not absolute. */
const contained = path => typeof path === 'string' && path.startsWith('./') && !path.split(/[\\/]/).includes('..')

/**
 * The insert rows of a patch, in order: every item of an insert list (a
 * line `- ` deeper than the top level) must open with `id`, and the row's
 * `name` is its first `name:` key. The patches write each item that way
 * (split addendum G22); anything else is reported, not guessed.
 * @param {string} text
 * @returns {{ rows: { id: string, name: string | undefined, line: number }[], problems: string[] }}
 */
export function insertRows(text) {
  const rows = []
  const problems = []
  text.split(/\r?\n/).forEach((line, index) => {
    const item = /^(\s+)-\s+(.*)$/.exec(line)
    if (item !== null) {
      const id = /^id:\s*([^\s#]+)/.exec(item[2])
      if (id === null) problems.push(`line ${index + 1}: an insert item does not start with \`id:\``)
      else rows.push({ id: id[1], name: undefined, line: index + 1 })
      return
    }
    const name = /^\s+name:\s*([^\s#]+)/.exec(line)
    const last = rows.at(-1)
    if (name !== null && last !== undefined && last.name === undefined) last.name = name[1].replace(/^(['"])(.*)\1$/, '$2')
  })
  return { rows, problems }
}

/**
 * The package names of a module's runtime bare imports (static imports,
 * re-exports, import()); relative, absolute, URL and builtin specifiers are
 * skipped.
 * @param {string} text - JavaScript source
 * @returns {string[]}
 */
export function bareImports(text) {
  const names = ts.preProcessFile(text, true, true).importedFiles.map(entry => entry.fileName)
    .filter(spec => !spec.startsWith('.') && !isAbsolute(spec) && !/^[a-z][a-z0-9+.-]*:/i.test(spec) && !isBuiltin(spec))
    .map(spec => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'))
  return [...new Set(names)]
}

const ICON_TYPES = ['.svg', '.png', '.jpg', '.jpeg', '.webp']
const ICON_MAX_BYTES = 256 * 1024
/** How many times the build output's health module was imported; a fresh URL per import defeats the module cache. */
let healthImports = 0

/**
 * The checks 2-7 on the repository at `root`: the table's packages, then
 * the old client package `legacy` (until split step 6; undefined after).
 * @param {string} root
 * @param {Parameters<typeof tableProblems>[1]} table
 * @param {{ name: string, dir: string, row: string } | undefined} legacy
 * @returns {Promise<{ problems: string[], summary: string }>}
 */
export async function bundleProblems(root, table, legacy) {
  const problems = []
  const bundles = [...table.PACKAGES.map(pkg => ({ name: pkg.name, dir: pkg.dir, pkg })), ...(legacy === undefined ? [] : [{ name: legacy.name, dir: legacy.dir, legacy }])]

  // 2 (root): the development workspace, no bundle.
  const rootManifest = readJson(join(root, 'package.json'))
  if (rootManifest.error !== undefined) problems.push(`root package.json ${rootManifest.error}`)
  else {
    for (const key of ['dsh', 'main', 'exports']) if (key in rootManifest.value) problems.push(`root package.json has ${key}: the root is the development workspace, not a bundle`)
    if (rootManifest.value.private !== true) problems.push('root package.json is not private')
    if (rootManifest.value.type !== 'module') problems.push('root package.json is not type: module (its .js configuration files are ESM)')
  }
  if (existsSync(join(root, 'cordis.patch.yml'))) problems.push('cordis.patch.yml exists at the root: the rows live in the packages\' patches')

  const composed = []
  const counts = []
  for (const bundle of bundles) {
    const dir = join(root, bundle.dir)
    const label = bundle.name
    const read = readJson(join(dir, 'package.json'))
    if (read.error !== undefined) {
      problems.push(`${label}: ${bundle.dir}/package.json ${read.error}`)
      continue
    }
    const manifest = read.value
    if (manifest.name !== bundle.name) problems.push(`${bundle.dir}/package.json is named ${manifest.name}, the table says ${bundle.name}`)
    if (manifest.type !== 'module') problems.push(`${label}: package.json is not type: module (its row modules are ESM)`)

    // 2: the patch list.
    const declared = manifest.dsh?.bundle?.patch
    const patches = typeof declared === 'string' ? [declared] : Array.isArray(declared) && declared.every(item => typeof item === 'string') ? declared : undefined
    if (patches === undefined || patches.length === 0) {
      problems.push(`${label}: dsh.bundle.patch is not a path or a list of paths`)
      continue
    }
    const rows = []
    for (const patch of patches) {
      if (!contained(patch)) {
        problems.push(`${label}: patch ${patch} is not ./-relative inside the package (no ..)`)
        continue
      }
      const file = join(dir, patch)
      if (!existsSync(file)) {
        problems.push(`${label}: patch ${patch} is missing`)
        continue
      }
      // 3: the insert rows of this patch.
      const parsed = insertRows(readFileSync(file, 'utf8'))
      for (const problem of parsed.problems) problems.push(`${label}: ${patch} ${problem}`)
      for (const row of parsed.rows) {
        if (row.name === undefined) problems.push(`${label}: row ${row.id} has no name`)
        else if (!contained(row.name)) problems.push(`${label}: row ${row.id} name ${row.name} is not ./-relative inside the package (no ..)`)
        else if (!existsSync(join(dirname(file), row.name))) problems.push(`${label}: row ${row.id} module ${row.name} does not exist: run npm run build`)
        rows.push(row)
      }
    }
    counts.push(`${label} ${rows.length} row${rows.length === 1 ? '' : 's'}`)
    composed.push(...rows)
    const found = rows.map(row => `${row.id} ${row.name}`).join(', ')

    if (bundle.pkg !== undefined) {
      const pkg = bundle.pkg
      const expected = pkg.rows.map(row => `${row.id} ./dist/${row.module}.js`).join(', ')
      if (found !== expected) problems.push(`${label}: patch rows are [${found}], the table says [${expected}]`)

      // 5: exports, dist/, tsconfig, display information.
      const exports = manifest.exports ?? {}
      for (const row of pkg.rows) {
        const key = `./${rowName(row.id)}`
        if (exports[key] !== `./dist/${row.module}.js`) problems.push(`${label}: exports["${key}"] is ${JSON.stringify(exports[key])}, the table says ./dist/${row.module}.js`)
      }
      for (const [key, target] of Object.entries(exports)) {
        if (typeof target !== 'string' || target.includes('*')) continue
        if (!existsSync(join(dir, target))) problems.push(`${label}: exports["${key}"] -> ${target} is missing`)
      }
      for (const top of subdirectories(join(dir, 'dist'))) {
        if (top !== table.SHARED_DIR && !pkg.src.includes(top)) problems.push(`${label}: dist/${top} is not a source directory of the package (an import crossed the boundary, or the output is stale)`)
      }
      const tsconfig = readJson(join(dir, 'tsconfig.json'))
      const include = pkg.src.map(src => relative(dir, join(root, 'src', src)).split(sep).join('/'))
      if (tsconfig.error !== undefined) problems.push(`${label}: tsconfig.json ${tsconfig.error}`)
      else if (JSON.stringify(tsconfig.value.include) !== JSON.stringify(include)) problems.push(`${label}: tsconfig.json include is ${JSON.stringify(tsconfig.value.include)}, the table says ${JSON.stringify(include)}`)
      if (exports['./locale/*.json'] !== './locale/*.json') problems.push(`${label}: exports["./locale/*.json"] is not ./locale/*.json (the plugin page reads the title from it)`)
      for (const language of ['en', 'zh']) {
        const locale = readJson(join(dir, 'locale', `${language}.json`))
        const meta = locale.value?.meta
        if (locale.error !== undefined) problems.push(`${label}: locale/${language}.json ${locale.error}`)
        else if (typeof meta?.title !== 'string' || meta.title.length === 0 || typeof meta.description !== 'string' || meta.description.length === 0) problems.push(`${label}: locale/${language}.json needs meta.title and meta.description`)
      }
      const icon = exports['./icon']
      if (typeof icon !== 'string') problems.push(`${label}: exports["./icon"] is missing`)
      else if (!ICON_TYPES.includes(extname(icon).toLowerCase())) problems.push(`${label}: icon ${icon} is not ${ICON_TYPES.join(', ')}`)
      else if (existsSync(join(dir, icon)) && statSync(join(dir, icon)).size > ICON_MAX_BYTES) problems.push(`${label}: icon ${icon} is larger than 256 KiB`)

      // 6: runtime bare imports against peerDependencies.
      const peers = Object.keys(manifest.peerDependencies ?? {})
      for (const file of nestedFiles(join(dir, 'dist')).filter(path => path.endsWith('.js'))) {
        for (const name of bareImports(readFileSync(file, 'utf8')).filter(spec => !peers.includes(spec))) {
          problems.push(`${label}: ${relative(dir, file).split(sep).join('/')} imports ${name} at run time, which is not in peerDependencies`)
        }
      }

      // 7: host packages declare no client half.
      if (manifest.dsh?.client !== undefined) problems.push(`${label}: declares dsh.client; a host package has no client half`)
    }
    else if (bundle.legacy !== undefined) {
      // 3 + 7: the old client package, one row and a built client half.
      if (rows.length !== 1 || rows[0].id !== bundle.legacy.row) problems.push(`${label}: patch rows are [${found}]; a package with dsh.client needs exactly its one row ${bundle.legacy.row}`)
      if (!Array.isArray(manifest.dsh?.client?.inject) || !manifest.dsh?.client?.platform) problems.push(`${label}: dsh.client needs platform and inject[]`)
      const clientExport = manifest.exports?.['./client']
      const client = typeof clientExport === 'string' ? join(dir, clientExport) : undefined
      if (client === undefined) problems.push(`${label}: exports["./client"] is missing`)
      else if (!existsSync(client)) problems.push(`${label}: client half ${clientExport} is missing: run npm run build`)
      else {
        const text = readFileSync(client, 'utf8')
        if (!text.startsWith(`window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)},`)) problems.push(`${label}: client half is not wrapped in window.__ModuleLoader__.load with id ${manifest.name}`)
        const outside = [...new Set([...text.matchAll(/\brequire\("([^"]+)"\)/g)].map(match => match[1]))].filter(id => !MODULE_TABLE.includes(id))
        if (outside.length > 0) problems.push(`${label}: client half requires modules outside the DSH client module table: ${outside.join(', ')}`)
        try {
          execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' })
        }
        catch (error) {
          problems.push(`${label}: client half fails node --check: ${String(error).slice(0, 200)}`)
        }
      }
    }
  }
  // 4: the composition, in profile order.
  const ids = composed.map(row => row.id)
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) problems.push(`composition: row ${id} is inserted more than once`)
  const expectedIds = [...table.PACKAGES.flatMap(pkg => pkg.rows.map(row => row.id)), ...(legacy === undefined ? [] : [legacy.row])]
  if (JSON.stringify([...new Set(ids)].sort()) !== JSON.stringify([...expectedIds].sort())) problems.push(`composition: rows are [${[...new Set(ids)].join(', ')}], the table says [${expectedIds.join(', ')}]`)

  // 5: HEALTH_PACKAGES in the build output against the table.
  const healthTable = JSON.stringify(table.PACKAGES.map(pkg => ({ name: pkg.name, rows: pkg.rows.map(row => rowName(row.id)) })))
  const healthFiles = table.PACKAGES.map(pkg => join(root, pkg.dir, 'dist', table.SHARED_DIR, 'health.js')).filter(file => existsSync(file))
  if (healthFiles.length === 0) problems.push(`no package has dist/${table.SHARED_DIR}/health.js: run npm run build`)
  for (const file of healthFiles) {
    healthImports += 1
    const { HEALTH_PACKAGES } = await import(`${pathToFileURL(file).href}?preflight=${healthImports}`)
    const built = JSON.stringify((HEALTH_PACKAGES ?? []).map(entry => ({ name: entry.name, rows: [...entry.rows] })))
    if (built !== healthTable) problems.push(`${relative(root, file).split(sep).join('/')}: HEALTH_PACKAGES is ${built}, the table says ${healthTable}`)
  }

  return { problems, summary: `${counts.join(', ')}; ${expectedIds.length} rows composed` }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const table = { SHARED_DIR, PACKAGES }
  const tableIssues = tableProblems(root, table)
  const { problems, summary } = await bundleProblems(root, table, LEGACY_CLIENT_BUNDLE)
  const all = [...tableIssues.map(problem => `directory table: ${problem}`), ...problems]
  if (all.length > 0) {
    console.error(`preflight: ${all.length} problem(s), install aborted`)
    for (const problem of all) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(`preflight: OK (directory table: ${PACKAGES.length} packages, ${PACKAGES.reduce((sum, pkg) => sum + pkg.src.length, 0)} source directories; ${summary})`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
