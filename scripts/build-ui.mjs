/**
 * Build the UI bundle's client half (docs/DESIGN.md §2.3): bundle
 * ui/src/client.tsx with esbuild into ui/client.js, the file
 * ui/package.json exports as ./client. DSH loads a static client half as
 * `window.__ModuleLoader__.load({ id, factory(require) })` and hands the
 * factory its client module table (docs/DEVELOPMENT.md §5.6), so the
 * bundle is CommonJS wrapped in that call, the way the rc.3 client
 * bundles are: the module table's packages stay `require` calls, every
 * other import is bundled in. scripts/preflight-bundle.mjs checks the
 * result.
 *
 * Run: node scripts/build-ui.mjs   (part of npm run build)
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULE_TABLE } from './ui-modules.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ui = join(root, 'ui')
const pkg = JSON.parse(readFileSync(join(ui, 'package.json'), 'utf8'))

await build({
  entryPoints: [join(ui, 'src', 'client.tsx')],
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
console.log(`build-ui: wrote ui/${pkg.exports['./client'].replace(/^\.\//, '')}`)
