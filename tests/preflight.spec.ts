import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { PACKAGES, SHARED_DIR } from '../scripts/packages.mjs'
import { bareImports, bundleProblems, insertRows, tableProblems } from '../scripts/preflight-bundle.mjs'

const REPO = join(import.meta.dirname, '..')
const GLM = {
  key: 'glm', name: 'pkg-glm', dir: 'packages/glm', src: ['glm-llm', 'glm-prompt'],
  rows: [{ id: 'glm-hourness/glm-llm', module: 'glm-llm/index' }],
  client: { row: 'glm-hourness/glm-ui', entry: 'ui/src/glm-client.js', sources: ['ui/src/channel.js', 'ui/src/glm-client.js'] },
}
const HOURNESS = {
  key: 'hourness', name: 'pkg-hourness', dir: 'packages/hourness', src: ['graph', 'guard'],
  rows: [{ id: 'glm-hourness/graph', module: 'graph/index' }, { id: 'glm-hourness/guard', module: 'guard/index' }],
  client: { row: 'glm-hourness/ui', entry: 'ui/src/hourness-client.tsx', sources: ['ui/src/hourness-client.tsx', 'ui/src/panel/'] },
}
const TABLE = { SHARED_DIR: 'shared', PACKAGES: [GLM, HOURNESS] }
const CLIENT_FILES = ['ui/src/channel.js', 'ui/src/glm-client.js', 'ui/src/hourness-client.tsx', 'ui/src/panel/view.tsx']

const write = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** A temporary repository whose src/ holds `dirs` (nested paths allowed) and the client `files`; removed after `check`. */
function withSrc(dirs: readonly string[], check: (root: string) => void, files: readonly string[] = CLIENT_FILES): void {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'))
  try {
    for (const dir of dirs) mkdirSync(join(root, 'src', dir), { recursive: true })
    for (const file of files) write(join(root, file), '\n')
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
    const repeated = { ...TABLE, PACKAGES: [GLM, { ...HOURNESS, key: 'glm', name: 'pkg-glm', dir: 'packages/glm', rows: [...HOURNESS.rows, { id: 'glm-hourness/glm-llm', module: 'graph/x' }], client: { ...HOURNESS.client, row: 'glm-hourness/glm-ui' } }] }
    assert.deepEqual(tableProblems(root, repeated), ['package key glm is registered twice', 'package name pkg-glm is registered twice', 'package directory packages/glm is registered twice', 'row id glm-hourness/glm-llm is registered twice', 'row id glm-hourness/glm-ui is registered twice'])
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

test('client sources: a file under ui/src/ in no client package or in both fails; a listed source that is missing fails; the entry must be a source', () => {
  withSrc(LAYOUT, root => assert.deepEqual(tableProblems(root, TABLE), ['ui/src/extra.ts belongs to no client package: register it in scripts/packages.mjs']), [...CLIENT_FILES, 'ui/src/extra.ts'])
  withSrc(LAYOUT, root => assert.deepEqual(tableProblems(root, TABLE), ['client source ui/src/channel.js of glm does not exist under ui/src/']), CLIENT_FILES.filter(file => file !== 'ui/src/channel.js'))
  withSrc(LAYOUT, (root) => {
    const both = { ...TABLE, PACKAGES: [{ ...GLM, client: { ...GLM.client, sources: [...GLM.client.sources, 'ui/src/panel/'] } }, HOURNESS] }
    assert.deepEqual(tableProblems(root, both), [
      'ui/src/panel/view.tsx belongs to the client packages glm and hourness',
      'client source ui/src/panel/ of glm has the name of a source of another package; the boundary patterns would read imports of it as crossing',
      'client source ui/src/panel/ of hourness has the name of a source of another package; the boundary patterns would read imports of it as crossing',
    ])
    const entry = { ...TABLE, PACKAGES: [{ ...GLM, client: { ...GLM.client, entry: 'ui/src/other.js' } }, HOURNESS] }
    assert.deepEqual(tableProblems(root, entry), ['client entry ui/src/other.js of glm is not one of its sources'])
  })
})

test('client sources: a name shared with the other package\'s host directory or client source fails, extensions aside', () => {
  const files = [...CLIENT_FILES, 'ui/src/graph.js', 'ui/src/channel.d.ts']
  withSrc(LAYOUT, (root) => {
    const named = { ...TABLE, PACKAGES: [{ ...GLM, client: { ...GLM.client, sources: [...GLM.client.sources, 'ui/src/graph.js'] } }, { ...HOURNESS, client: { ...HOURNESS.client, sources: [...HOURNESS.client.sources, 'ui/src/channel.d.ts'] } }] }
    assert.deepEqual(tableProblems(root, named), [
      'client source ui/src/channel.js of glm has the name of a source of another package; the boundary patterns would read imports of it as crossing',
      'client source ui/src/graph.js of glm has the name of a source of another package; the boundary patterns would read imports of it as crossing',
      'client source ui/src/channel.d.ts of hourness has the name of a source of another package; the boundary patterns would read imports of it as crossing',
    ])
  }, files)
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

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
const rowSuffix = (id: string): string => id.replace(/^glm-hourness\//, '')
const wrapped = (name: string, body = ''): string => `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => { var module = { exports: {} }; require("react");${body} return module.exports; } });\n`

/** A valid repository: the root workspace, ui/src client sources, and the two packages built with their client faces. */
function writeLayout(root: string): void {
  write(join(root, 'package.json'), json({ name: 'root', private: true, type: 'module' }))
  for (const dir of ['shared', ...TABLE.PACKAGES.flatMap(pkg => pkg.src)]) mkdirSync(join(root, 'src', dir), { recursive: true })
  for (const file of CLIENT_FILES) write(join(root, file), '\n')
  const health = TABLE.PACKAGES.map(pkg => ({ name: pkg.name, rows: pkg.rows.map(row => rowSuffix(row.id)) }))
  for (const pkg of TABLE.PACKAGES) {
    const dir = join(root, pkg.dir)
    write(join(dir, 'package.json'), json({
      name: pkg.name,
      type: 'module',
      exports: {
        '.': './ui/index.js',
        './client': './ui/client.js',
        ...Object.fromEntries(pkg.rows.flatMap(row => [[`./${rowSuffix(row.id)}`, `./dist/${row.module}.js`], [`./${rowSuffix(row.id)}/locale/*.json`, `./locale/${rowSuffix(row.id)}/*.json`]])),
        './locale/*.json': './locale/*.json',
        './icon': './icon.svg',
      },
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', immediately: true, inject: [] } },
      peerDependencies: { '@scope/peer': '*' },
    }))
    write(join(dir, 'cordis.patch.yml'), ['- insert:', ...pkg.rows.flatMap(row => [`    - id: ${row.id}`, `      name: ${pkg.name}/${rowSuffix(row.id)}`, '      config: {}']), `    - id: ${pkg.client.row}`, `      name: ${pkg.name}`, ''].join('\n'))
    write(join(dir, 'tsconfig.json'), json({ include: pkg.src.map(src => `../../src/${src}`) }))
    for (const locale of ['locale', ...pkg.rows.map(row => `locale/${rowSuffix(row.id)}`)]) {
      for (const language of ['en', 'zh']) write(join(dir, locale, `${language}.json`), json({ meta: { title: 'title', description: 'description' } }))
    }
    write(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
    for (const row of pkg.rows) write(join(dir, 'dist', `${row.module}.js`), 'import { peer } from \'@scope/peer\'\nexport const value = peer\n')
    write(join(dir, 'dist', 'shared', 'health.js'), `export const HEALTH_PACKAGES = ${JSON.stringify(health)}\n`)
    write(join(dir, 'dist', 'shared', 'types.d.ts'), 'import type { X } from \'@scope/types-only\'\nexport type Y = X\n')
    write(join(dir, 'ui', 'index.js'), 'export function apply() {}\n')
    write(join(dir, 'ui', 'client.js'), wrapped(pkg.name))
  }
}

/** The bundle problems of a valid layout after `change`; the layout is removed afterwards. */
async function problemsAfter(change: (root: string) => void): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'preflight-bundle-'))
  try {
    writeLayout(root)
    change(root)
    return (await bundleProblems(root, TABLE)).problems
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
  assert.deepEqual((await bundleProblems(REPO, { SHARED_DIR, PACKAGES })).problems, [])
})

test('two packages with their client faces pass; .d.ts type imports are not runtime imports', async () => {
  assert.deepEqual(await problemsAfter(() => {}), [])
})

test('the root is no bundle: dsh (a client half included), exports, main, a missing private flag or a root patch fail', async () => {
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.dsh = { bundle: { patch: './cordis.patch.yml' } } })), ['root package.json has dsh: the root is the development workspace, not a bundle'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.dsh = { client: { platform: 'web', inject: [] } } })), ['root package.json has dsh: the root is the development workspace, not a bundle'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.exports = { '.': './x.js' } })), ['root package.json has exports: the root is the development workspace, not a bundle'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'package.json', (value) => { value.main = './x.js'; delete value.private })), ['root package.json has main: the root is the development workspace, not a bundle', 'root package.json is not private'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'cordis.patch.yml'), '[]\n')), ['cordis.patch.yml exists at the root: the rows live in the packages\' patches'])
})

test('ui/ is no package: a ui/package.json or a ui/cordis.patch.yml fails', async () => {
  assert.deepEqual(await problemsAfter(root => write(join(root, 'ui/package.json'), json({ name: 'old-ui' }))), ['ui/package.json exists: ui/ holds client sources only; the client faces belong to the packages under packages/'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'ui/cordis.patch.yml'), '[]\n')), ['ui/cordis.patch.yml exists: ui/ holds client sources only; the client faces belong to the packages under packages/'])
})

test('a patch path with .., a row named by a path or by another package, a missing row module, or a row the table does not have fails', async () => {
  const climbing = await problemsAfter(root => edit(root, 'packages/glm/package.json', (value) => { value.dsh = { ...(value.dsh as object), bundle: { patch: ['./cordis.patch.yml', '../hourness/cordis.patch.yml'] } } }))
  assert.deepEqual(climbing, ['pkg-glm: patch ../hourness/cordis.patch.yml is not ./-relative inside the package (no ..)'])
  const path = await problemsAfter(root => write(join(root, 'packages/glm/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/glm-llm\n      name: ./dist/glm-llm/index.js\n    - id: glm-hourness/glm-ui\n      name: pkg-glm\n'))
  assert.equal(path[0], 'pkg-glm: row glm-hourness/glm-llm name ./dist/glm-llm/index.js is a path: the settings page titles it with its file URL and client-modules counts it as a source of the package\'s client face; name it through the package (pkg-glm/<row>)')
  const url = await problemsAfter(root => write(join(root, 'packages/glm/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/glm-llm\n      name: pkg-glm/glm-llm\n    - id: glm-hourness/glm-ui\n      name: file:///C:/x/ui/index.js\n'))
  assert.ok(url[0]?.startsWith('pkg-glm: row glm-hourness/glm-ui name file:///C:/x/ui/index.js is a path'), url.join('\n'))
  const other = await problemsAfter(root => write(join(root, 'packages/glm/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/glm-llm\n      name: pkg-hourness/graph\n    - id: glm-hourness/glm-ui\n      name: pkg-glm\n'))
  assert.equal(other[0], 'pkg-glm: row glm-hourness/glm-llm name pkg-hourness/graph is not a specifier of pkg-glm; a profile that lists this package alone cannot resolve it')
  const unexported = await problemsAfter(root => write(join(root, 'packages/glm/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/glm-llm\n      name: pkg-glm/glm-llm/index\n    - id: glm-hourness/glm-ui\n      name: pkg-glm\n'))
  assert.equal(unexported[0], 'pkg-glm: row glm-hourness/glm-llm name pkg-glm/glm-llm/index resolves through exports["./glm-llm/index"], which is missing')
  const missing = await problemsAfter(root => rmSync(join(root, 'packages/hourness/dist/guard/index.js')))
  assert.ok(missing.includes('pkg-hourness: row glm-hourness/guard module ./dist/guard/index.js does not exist: run npm run build'), missing.join('\n'))
  const extra = await problemsAfter(root => write(join(root, 'packages/hourness/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/graph\n      name: pkg-hourness/graph\n    - id: glm-hourness/guard\n      name: pkg-hourness/guard\n    - id: glm-hourness/other\n      name: pkg-hourness/graph\n    - id: glm-hourness/ui\n      name: pkg-hourness\n'))
  assert.deepEqual(extra, [
    'pkg-hourness: patch rows are [glm-hourness/graph pkg-hourness/graph, glm-hourness/guard pkg-hourness/guard, glm-hourness/other pkg-hourness/graph, glm-hourness/ui pkg-hourness], the table says [glm-hourness/graph pkg-hourness/graph, glm-hourness/guard pkg-hourness/guard, glm-hourness/ui pkg-hourness]',
    'composition: rows are [glm-hourness/glm-llm, glm-hourness/glm-ui, glm-hourness/graph, glm-hourness/guard, glm-hourness/other, glm-hourness/ui], the table says [glm-hourness/glm-llm, glm-hourness/glm-ui, glm-hourness/graph, glm-hourness/guard, glm-hourness/ui]',
  ])
})

test('a client face named by two rows fails; a row inserted by two packages fails the composition', async () => {
  const twoRows = await problemsAfter(root => write(join(root, 'packages/hourness/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/graph\n      name: pkg-hourness/graph\n    - id: glm-hourness/guard\n      name: pkg-hourness/guard\n    - id: glm-hourness/ui\n      name: pkg-hourness\n    - id: glm-hourness/ui-2\n      name: pkg-hourness\n'))
  assert.ok(twoRows.includes('pkg-hourness: rows named pkg-hourness are [glm-hourness/ui, glm-hourness/ui-2]; client-modules needs exactly its one row glm-hourness/ui'), twoRows.join('\n'))
  const twice = await problemsAfter(root => write(join(root, 'packages/glm/cordis.patch.yml'), '- insert:\n    - id: glm-hourness/glm-llm\n      name: pkg-glm/glm-llm\n    - id: glm-hourness/glm-ui\n      name: pkg-glm\n    - id: glm-hourness/graph\n      name: pkg-glm/glm-llm\n'))
  assert.ok(twice.includes('composition: row glm-hourness/graph is inserted more than once'), twice.join('\n'))
})

test('a runtime bare import outside peerDependencies, or a missing type: module on a package or the root, fails', async () => {
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
    'pkg-glm: row glm-hourness/glm-llm module ./dist/glm-llm/other.js does not exist: run npm run build',
    'pkg-glm: exports["./glm-llm"] is "./dist/glm-llm/other.js", the table says ./dist/glm-llm/index.js',
    'pkg-glm: exports["./glm-llm"] -> ./dist/glm-llm/other.js is missing',
  ])
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'packages/hourness/locale/en.json'))), ['pkg-hourness: locale/en.json is missing'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/hourness/locale/zh.json'), json({ meta: { title: '' } }))), ['pkg-hourness: locale/zh.json needs meta.title and meta.description'])
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'packages/glm/icon.svg'))), ['pkg-glm: exports["./icon"] -> ./icon.svg is missing'])
})

test('a host row without its locale export or files, or a locale file not named by a language id, fails', async () => {
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'packages/glm/locale/glm-llm/zh.json'))), ['pkg-glm: locale/glm-llm/zh.json is missing'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/hourness/locale/guard/en.json'), json({ meta: { title: 'guard', description: ' ' } }))), ['pkg-hourness: locale/guard/en.json needs meta.title and meta.description'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'packages/hourness/package.json', (value) => { value.exports = { ...(value.exports as object), './graph/locale/*.json': './locale/*.json' } })), ['pkg-hourness: exports["./graph/locale/*.json"] is "./locale/*.json", the table says ./locale/graph/*.json (the settings page reads the row\'s title from it)'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/hourness/locale/guard/en.old.json'), json({}))), ['pkg-hourness: locale/guard/en.old.json is not named by a language id; the settings page would show an error instead of the titles'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/glm/locale/zh_CN.json'), json({}))), ['pkg-glm: locale/zh_CN.json is not named by a language id; the settings page would show an error instead of the titles'])
  // rc.3 takes any 2-8 letter name as a language id, so a stray notes.json is a (useless) language, not an error.
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/hourness/locale/guard/notes.json'), json({}))), [])
})

test('a package without its client face declaration, exporting another host half, or with a nested ui/package.json fails', async () => {
  assert.deepEqual(await problemsAfter(root => edit(root, 'packages/hourness/package.json', (value) => { value.dsh = { bundle: { patch: './cordis.patch.yml' } } })), ['pkg-hourness: dsh.client needs platform web and inject[] (the package\'s client face)'])
  assert.deepEqual(await problemsAfter(root => edit(root, 'packages/glm/package.json', (value) => { value.exports = { ...(value.exports as object), '.': './dist/glm-llm/index.js' } })), ['pkg-glm: exports["."] is "./dist/glm-llm/index.js", the table\'s host half of the client face is ./ui/index.js'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/glm/ui/package.json'), json({ name: 'pkg-glm-ui' }))), ['pkg-glm: packages/glm/ui/package.json exists: the package declares its client face itself, a nested manifest is left over from the client-package layout'])
})

test('a client half unbuilt, wrapped under another id, or requiring outside the module table fails', async () => {
  assert.deepEqual(await problemsAfter(root => rmSync(join(root, 'packages/hourness/ui/client.js'))), ['pkg-hourness: exports["./client"] -> ./ui/client.js is missing', 'pkg-hourness: client half ./ui/client.js is missing: run npm run build'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/glm/ui/client.js'), wrapped('pkg-hourness'))), ['pkg-glm: client half is not wrapped in window.__ModuleLoader__.load with id pkg-glm'])
  assert.deepEqual(await problemsAfter(root => write(join(root, 'packages/glm/ui/client.js'), wrapped('pkg-glm', ' require("left-pad");'))), ['pkg-glm: client half requires modules outside the DSH client module table: left-pad'])
})
