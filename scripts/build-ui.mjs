/**
 * Build the client halves (docs/DESIGN.md §2.3): for each package of the
 * directory table (scripts/packages.mjs), bundle its client entry under
 * ui/src/ with esbuild into the file its client package at <dir>/ui/
 * exports as ./client. DSH loads a static client half as
 * `window.__ModuleLoader__.load({ id, factory(require) })` and hands the
 * factory its client module table (docs/DEVELOPMENT.md §5.6), so each
 * bundle is CommonJS wrapped in that call with the client package name as
 * id, the way the rc.3 client bundles are: the module table's packages stay
 * `require` calls, every other import is bundled in.
 * scripts/preflight-bundle.mjs checks the results.
 *
 * Run: node scripts/build-ui.mjs   (part of npm run build)
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES } from './packages.mjs'
import { MODULE_TABLE } from './ui-modules.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

for (const { dir, client } of PACKAGES) {
  const ui = join(root, dir, 'ui')
  const pkg = JSON.parse(readFileSync(join(ui, 'package.json'), 'utf8'))
  await build({
    entryPoints: [join(root, client.entry)],
    outfile: join(ui, pkg.exports['./client']),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome120'],
    jsx: 'automatic',
    external: [...MODULE_TABLE],
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
    banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
    footer: { js: 'return module.exports; } });' },
  })
  console.log(`build-ui: wrote ${dir}/ui/${pkg.exports['./client'].replace(/^\.\//, '')}`)
}
