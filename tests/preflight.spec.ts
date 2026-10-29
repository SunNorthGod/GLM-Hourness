import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { LEGACY_CLIENT_BUNDLE, PACKAGES, SHARED_DIR } from '../scripts/packages.mjs'
import { bareImports, bundleProblems, insertRows, tableProblems } from '../scripts/preflight-bundle.mjs'

const REPO = join(import.meta.dirname, '..')
const GLM = { key: 'glm', name: 'pkg-glm', dir: 'packages/glm', src: ['glm-llm', 'glm-prompt'], rows: [{ id: 'glm-hourness/glm-llm', module: 'glm-llm/index' }] }
const HOURNESS = { key: 'hourness', name: 'pkg-hourness', dir: 'packages/hourness', src: ['graph', 'guard'], rows: [{ id: 'glm-hourness/graph', module: 'graph/index' }, { id: 'glm-hourness/guard', module: 'guard/index' }] }
const TABLE = { SHARED_DIR: 'shared', PACKAGES: [GLM, HOURNESS] }
const LEGACY = { name: 'pkg-ui', dir: 'ui', row: 'glm-hourness/ui' }

/** A temporary repository whose src/ holds `dirs` (nested paths allowed); removed after `check`. */
function withSrc(dirs: readonly string[], check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'))
  try {
    for (const dir of dirs) mkdirSync(join(root, 'src', dir), { recursive: true })
    check(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const LAYOUT = ['shared', 'glm-llm/auth', 'glm-prompt', 'graph', 'guard']

test('the repository table holds on the repository', () => {
  assert.deepEqual(tableProblems(REPO, { SHARED_DIR, PACKAGES }), [])
})

test('a table matching its src/ passes; nested directories with their own names are fine', () => {
  withSrc(LAYOUT, root => assert.deepEqual(tableProblems(root, TABLE), []))
})

test('a source directory in two packages, a repeated key, name, directory or row id, or shared listed by a package fails', () => {
  withSrc(LAYOUT, (root) => {
    const twice = { ...TABLE, PACKAGES: [GLM, { ...HOURNESS, src: ['graph', 'guard', 'glm-prompt'] }] }
    assert.deepEqual(tableProblems(root, twice), ['source directory src/glm-prompt belongs to both glm and hourness'])
    const repeated = { ...TABLE, PACKAGES: [GLM, { ...HOURNESS, key: 'glm', name: 'pkg-glm', dir: 'packages/glm', rows: [...HOURNESS.rows, { id: 'glm-hourness/glm-llm', module: 'graph/x' }] }] }
    assert.deepEqual(tableProblems(root, repeated), ['package key glm is registered twice', 'package name pkg-glm is registered twice', 'package directory packages/glm is registered twice', 'row id glm-hourness/glm-llm is registered twice'])
    const shared = { ...TABLE, PACKAGES: [GLM, { ...HOURNESS, src: ['graph', 'guard', 'shared'] }] }
    assert.deepEqual(tableProblems(root, shared), ['package hourness lists the shared library shared as its own source directory'])
  })
})

test('a row whose module lies outside its package\'s source directories fails', () => {
  withSrc(LAYOUT, (root) => {
    const outside = { ...TABLE, PACKAGES: [GLM, { ...HOURNESS, rows: [{ id: 'glm-hourness/graph', module: 'glm-prompt/index' }] }] }
    assert.deepEqual(tableProblems(root, outside), ['row glm-hourness/graph of hourness has its module glm-prompt/index outside the package\'s source directories'])
  })
})

test('a top-level directory under src/ that no package lists fails; so does a registered directory that is missing', () => {
  withSrc([...LAYOUT, 'bootstrap'], root => assert.deepEqual(tableProblems(root, TABLE), ['src/bootstrap belongs to no package: register it in scripts/packages.mjs']))
  withSrc(LAYOUT.filter(dir => dir !== 'guard'), root => assert.deepEqual(tableProblems(root, TABLE), ['src/guard is registered but does not exist']))
})

test('a nested directory named after another package\'s directory, or named src, fails; under src/shared/ any package name fails', () => {
  withSrc([...LAYOUT, 'glm-llm/graph'], root => assert.deepEqual(tableProblems(root, TABLE), [
    'src/glm-llm/graph has the name of another package\'s directory src/graph; the boundary patterns would read imports of it as crossing',
  ]))
  withSrc([...LAYOUT, 'guard/deep/glm-prompt'], root => assert.equal(tableProblems(root, TABLE).length, 1))
  withSrc([...LAYOUT, 'graph/src'], root => assert.deepEqual(tableProblems(root, TABLE), ['src/graph/src is named src, which the boundary patterns read as the top of src/']))
  withSrc([...LAYOUT, 'shared/guard', 'shared/glm-llm'], root => assert.equal(tableProblems(root, TABLE).length, 2))
  withSrc([...LAYOUT, 'graph/graph', 'glm-llm/glm-prompt'], root => assert.deepEqual(tableProblems(root, TABLE), []))
})

test('insert rows: each item opens with id and takes its first name; an item without id is reported', () => {
  const parsed = insertRows([
    '# comment',
    '- insert:',
    '    - id: a/one',
    '      # a comment with - dash',
    '      name: ./dist/one.js',
    '      config: { name: inner }',
    '    - id: a/two',
    '      name: \'./two.js\'',
    '    - name: ./three.js',
  ].join('\n'))
  assert.deepEqual(parsed.rows.map(row => [row.id, row.name]), [['a/one', './dist/one.js'], ['a/two', './two.js']])
  assert.deepEqual(parsed.problems, ['line 9: an insert item does not start with `id:`'])
})

test('bare imports: static, re-export and dynamic package imports count; relative, builtin and type-only lines do not', () => {
  const text = [
    'import { a } from \'@scope/pkg/sub\'',
    'export * from "plain"',
    'const later = await import(\'late/x\')',
    'import { b } from \'./local.js\'',
    'import { readFile } from \'node:fs\'',
    'import path from \'path\'',
    'const s = `import x from "inside-a-string"`',
  ].join('\n')
  assert.deepEqual(bareImports(text), ['@scope/pkg', 'plain', 'late'])
})

// The bundle checks on a generated layout (split design §7.2, addendum §3.3).

const write = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
const rowSuffix = (id: string): string => id.replace(/^glm-hourness\//, '')

/** A valid repository: the root workspace, the two packages built, and the old client package under ui/. */
function writeLayout(root: string): void {
  write(join(root, 'package.json'), json({ name: 'root', private: true, type: 'module' }))
  for (const dir of ['shared', ...TABLE.PACKAGES.flatMap(pkg => pkg.src)]) mkdirSync(join(root, 'src', dir), { recursive: true })
  const health = TABLE.PACKAGES.map(pkg => ({ name: pkg.name, rows: pkg.rows.map(row => rowSuffix(row.id)) }))
  for (const pkg of TABLE.PACKAGES) {
    const dir = join(root, pkg.dir)
    write(join(dir, 'package.json'), json({
      name: pkg.name,
      type: 'module',
      exports: { ...Object.fromEntries(pkg.rows.map(row => [`./${rowSuffix(row.id)}`, `./dist/${row.module}.js`])), './locale/*.json': './locale/*.json', './icon': './icon.svg' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      peerDependencies: { '@scope/peer': '*' },
    }))
    write(join(dir, 'cordis.patch.yml'), ['- insert:', ...pkg.rows.flatMap(row => [`    - id: ${row.id}`, `      name: ./dist/${row.module}.js`, '      config: {}']), ''].join('\n'))
    write(join(dir, 'tsconfig.json'), json({ include: pkg.src.map(src => `../../src/${src}`) }))
    for (const language of ['en', 'zh']) write(join(dir, 'locale', `${language}.json`), json({ meta: { title: 'title', description: 'description' } }))
    write(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
    for (const row of pkg.rows) write(join(dir, 'dist', `${row.module}.js`), 'import { peer } from \'@scope/peer\'\nexport const value = peer\n')
    write(join(dir, 'dist', 'shared', 'health.js'), `export const HEALTH_PACKAGES = ${JSON.stringify(health)}\n`)
    write(join(dir, 'dist', 'shared', 'types.d.ts'), 'import type { X } from \'@scope/types-only\'\nexport type Y = X\n')
  }
  const ui = join(root, LEGACY.dir)
  write(join(ui, 'package.json'), json({ name: LEGACY.name, type: 'module', exports: { '.': './index.js', './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', immediately: true, inject: [] } } }))
  write(join(ui, 'cordis.patch.yml'), `- insert:\n    - id: ${LEGACY.row}\n      name: ./index.js\n      config: {}\n`)
  write(join(ui, 'index.js'), 'export function apply() {}\n')
  write(join(ui, 'client.js'), `window.__ModuleLoader__.load({ id: ${JSON.stringify(LEGACY.name)}, factory: (require) => { var module = { exports: {} }; require("react"); return module.exports; } });\n`)
}

/** The bundle problems of a valid layout after `change`; the layout is removed afterwards. */
async function problemsAfter(change: (root: string) => void): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'preflight-bundle-'))
  try {
    writeLayout(root)
    change(root)
    return (await bundleProblems(root, TABLE, LEGACY)).problems
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const edit = (root: string, file: string, update: (value: Record<string, unknown>) => void): void => {
  const path = join(root, file)
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  update(value)
  writeFileSync(path, json(value))
}

test('the repository passes the bundle checks', async () => {
  assert.deepEqual((await bundleProblems(REPO, { SHARED_DIR, PACKAGES }, LEGACY_CLIENT_BUNDLE)).problems, [])
})

test('two packages and the old client package pass; .d.ts type imports are not runtime imports', async () => {
  assert.deepEqual(await problemsAfter(() => {}), [])
})

test('the root is no bundle: dsh, exports, main, a missing private flag or a root patch fail', async () => {
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.dsh = { bundle: { patch: './cordis.patch.yml' } } })), ['root package.json has dsh: the root is the development workspace, not a bundle'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.exports = { '.': './x.js' } })), ['root package.json has exports: the root is the development workspace, not a bundle'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.main = './x.js'; delete value.private })), ['root package.json has main: the root is the development workspace, not a bundle', 'root package.json is not private'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'cordis.patch.yml'), '[]\n')), ['cordis.patch.yml exists at the root: the rows live in the packages\' patches'])
})

test('a patch path or a row name with .., a missing row module, or a row the table does not have fails', async () => {
  const climbing = await problemsAfter(root => edit(root, 'packages/glm/package.json', (value) => { value.dsh = { bundle: { patch: ['./cordis.patch.yml', '../hourness/cordis.patch.yml'] } } }))
  assert.deepEqual(climbing, ['pkg-glm: patch ../hourness/cordis.patch.yml is not ./-relative inside the package (no ..)'])
  const rowClimbing = await problemsAfter(root => write(join(root, 'packages/glm/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/glm-llm\n      name: ./../glm/dist/glm-llm/index.js\n'))
  assert.equal(rowClimbing[0], 'pkg-glm: row glm-hourness/glm-llm name ./../glm/dist/glm-llm/index.js is not ./-relative inside the package (no ..)')
  const missing = await problemsAfter(root => rmSync(join(root, 'packages/hourness/dist/guard/index.js')))
  assert.ok(missing.includes('pkg-hourness: row glm-hourness/guard module ./dist/guard/index.js does not exist: run npm run build'), missing.join('\n'))
  const extra = await problemsAfter(root => write(join(root, 'packages/hourness/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/graph\n      name: ./dist/graph/index.js\n    - id: glm-hourness/guard\n      name: ./dist/guard/index.js\n    - id: glm-hourness/other\n      name: ./dist/graph/index.js\n'))
  assert.deepEqual(extra, [
    'pkg-hourness: patch rows are [glm-hourness/graph ./dist/graph/index.js, glm-hourness/guard ./dist/guard/index.js, glm-hourness/other ./dist/graph/index.js], the table says [glm-hourness/graph ./dist/graph/index.js, glm-hourness/guard ./dist/guard/index.js]',
    'composition: rows are [glm-hourness/glm-llm, glm-hourness/graph, glm-hourness/guard, glm-hourness/other, glm-hourness/ui], the table says [glm-hourness/glm-llm, glm-hourness/graph, glm-hourness/guard, glm-hourness/ui]',
  ])
})

test('the old client package with two rows fails; a row inserted by two packages fails the composition', async () => {
  const twoRows = await problemsAfter(root => write(join(root, 'ui/cordis.patch.yml'), `- insert:\n    - id: ${LEGACY.row}\n      name: ./index.js\n    - id: glm-hourness/ui-2\n      name: ./index.js\n`))
  assert.ok(twoRows[0]?.startsWith('pkg-ui: patch rows are [glm-hourness/ui ./index.js, glm-hourness/ui-2 ./index.js]; a package with dsh.client needs exactly its one row'), twoRows.join('\n'))
  const twice = await problemsAfter(root => write(join(root, 'ui/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/graph\n      name: ./index.js\n'))
  assert.ok(twice.includes('composition: row glm-hourness/graph is inserted more than once'), twice.join('\n'))
})

test('a runtime bare import outside peerDependencies, or a missing type: module, fails', async () => {
  const unlisted = await problemsAfter(root => write(join(root, 'packages/glm/dist/glm-llm/extra.js'), 'export { x } from \'@scope/other\'\n'))
  assert.deepEqual(unlisted, ['pkg-glm: dist/glm-llm/extra.js imports @scope/other at run time, which is not in peerDependencies'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'packages/hourness/package.json', (value) => { delete value.type })), ['pkg-hourness: package.json is not type: module (its row modules are ESM)'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { delete value.type })), ['root package.json is not type: module (its .js configuration files are ESM)'])
})

test('a dist/ directory outside the table, a tsconfig include that differs, or HEALTH_PACKAGES that differs fails', async () => {
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/glm/dist/graph/index.js'), 'export {}\n')), ['pkg-glm: dist/graph is not a source directory of the package (an import crossed the boundary, or the output is stale)'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/glm/tsconfig.json'), json({ include: ['../../src/glm-llm'] }))), ['pkg-glm: tsconfig.json include is ["../../src/glm-llm"], the table says ["../../src/glm-llm","../../src/glm-prompt"]'])
  const health = await problemsAfter(root => write(join(root, 'packages/hourness/dist/shared/health.js'), `export const HEALTH_PACKAGES = ${JSON.stringify([{ name: 'pkg-glm', rows: ['glm-llm'] }, { name: 'pkg-hourness', rows: ['graph'] }])}\n`))
  assert.equal(health.length, 1)
  assert.ok(health[0]?.startsWith('packages/hourness/dist/shared/health.js: HEALTH_PACKAGES is '), health[0])
})

test('a row not exported under its name fails; a package without locale/en.json or with a missing icon fails', async () => {
  assert.deepEqual(await problemsAfter(root => edit(root, 'packages/glm/package.json', (value) => { value.exports = { ...(value.exports as object), './glm-llm': './dist/glm-llm/other.js' } })), [
    'pkg-glm: exports["./glm-llm"] is "./dist/glm-llm/other.js", the table says ./dist/glm-llm/index.js',
    'pkg-glm: exports["./glm-llm"] -> ./dist/glm-llm/other.js is missing',
  ])
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'packages/hourness/locale/en.json'))), ['pkg-hourness: locale/en.json is missing'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/hourness/locale/zh.json'), json({ meta: { title: '' } }))), ['pkg-hourness: locale/zh.json needs meta.title and meta.description'])
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'packages/glm/icon.svg'))), ['pkg-glm: exports["./icon"] -> ./icon.svg is missing'])
})

test('a host package declaring dsh.client fails; the old client half unbuilt or requiring outside the module table fails', async () => {
  assert.deepEqual(await problemsAfter(root => edit(root, 'packages/hourness/package.json', (value) => { value.dsh = { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [] } } })), ['pkg-hourness: declares dsh.client; a host package has no client half'])
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'ui/client.js'))), ['pkg-ui: client half ./client.js is missing: run npm run build'])
  const outside = await problemsAfter(root => write(join(root, 'ui/client.js'), `window.__ModuleLoader__.load({ id: ${JSON.stringify(LEGACY.name)}, factory: (require) => { require("left-pad"); return {}; } });\n`))
  assert.deepEqual(outside, ['pkg-ui: client half requires modules outside the DSH client module table: left-pad'])
})
