// ESLint flat config (docs/ROADMAP.md M1.9, docs/ORCHESTRATION.md 7.5-7.7).
// Every rule is an error so that ESLint's bulk suppressions
// (eslint-suppressions.json) hold the existing violations as the baseline:
// new violations fail, fixed ones must be pruned, so the baseline only shrinks.
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import { PACKAGES, SHARED_DIR } from './scripts/packages.mjs'

// Scripts run under the Node that runs ESLint; its global names are theirs.
const nodeGlobals = Object.fromEntries(
  Object.getOwnPropertyNames(globalThis).map((name) => [name, 'readonly']),
)

// Package boundaries (docs/DEVELOPMENT.md §10), generated from the
// directory table: a package's source files import nothing from the other
// package's directories, and src/shared/ imports no package directory;
// type imports included (tsc would compile a crossing file into the other
// package's output without a word). The pattern climbs out of the file's
// directory by any number of `../`, with or without `src/`, so it does not
// depend on the file's depth; the table self-check in
// scripts/preflight-bundle.mjs rules out same-named directories it would
// misread.
// Client sources (ui/src/, split step 6) follow the same rule: a package's
// client half imports neither the other package's host directories nor the
// other half's files and directories, which a second pattern reads as
// `./<name>` or `../<name>` with or without an extension.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alt = (names) => names.map(escapeRegex).join('|')
const into = (dirs) => `^(?:\\.\\./)+(?:src/)?(?:${alt(dirs)})(?:/|$)`
const intoClient = (names) => `^(?:\\./|(?:\\.\\./)+)(?:${alt(names)})(?:/|\\.[a-z.]+$|$)`
const MESSAGE = 'Packages do not import each other and src/shared/ imports no package (scripts/packages.mjs); share through src/shared/.'
const boundary = (files, regexes) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns: regexes.map((regex) => ({ regex, message: MESSAGE })) }] },
})
const othersOf = (pkg) => PACKAGES.filter((other) => other !== pkg)
const clientNames = (pkg) => pkg.client.sources.map((source) => source.slice('ui/src/'.length).replace(/\/$/, '').replace(/\..*$/, ''))
const boundaries = [
  ...PACKAGES.map((pkg) => boundary(pkg.src.map((dir) => `src/${dir}/**`), [into(othersOf(pkg).flatMap((other) => other.src))])),
  boundary([`src/${SHARED_DIR}/**`], [into(PACKAGES.flatMap((pkg) => pkg.src))]),
  ...PACKAGES.map((pkg) => boundary(
    pkg.client.sources.map((source) => (source.endsWith('/') ? `${source}**` : source)),
    [into(othersOf(pkg).flatMap((other) => other.src)), intoClient(othersOf(pkg).flatMap(clientNames))],
  )),
]

export default defineConfig([
  globalIgnores([
    // tsc output of the two packages (npm run build).
    'packages/*/dist/',
    // Client halves, built from ui/src by scripts/build-ui.mjs.
    'packages/*/ui/client.js',
    'reference/',
    '.llm/',
    '.agents/',
    '.worktrees/',
    '.pnpm-store/',
    // Promo video: its own Node project with its own ESLint config and
    // dependencies (video/README.md), not part of either package.
    'video/',
    // Vendored upstream code (DSH vendor/schemastery, see its header); it
    // changes by re-vendoring, not by lint fixes.
    'src/shared/schemastery.ts',
  ]),
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    // ESLint core recommended rules, all at error.
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // src/ uses tsconfig.json, tests/ uses tests/tsconfig.json, ui/src
        // uses ui/tsconfig.json; TypeScript scripts have no project of their own.
        projectService: { allowDefaultProject: ['scripts/*.ts', 'scripts/*/*.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // node:test's test()/describe() return promises the runner awaits.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] }],
      }],
      // Same exemption as tsc's noUnusedParameters: a leading underscore
      // marks a parameter that is unused on purpose. A property destructured
      // next to a rest element is how a key is omitted.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Calibration checkers and fixtures (tests/calibration/) run under Node too.
    files: ['scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs,cjs}', 'packages/*/ui/index.js', '*.js'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // Client half: runs in the DSH web renderer.
    files: ['ui/src/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Node: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  ...boundaries,
])
