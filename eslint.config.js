// ESLint flat config (docs/ROADMAP.md M1.9, docs/ORCHESTRATION.md 7.5-7.7).
// Every rule is an error so that ESLint's bulk suppressions
// (eslint-suppressions.json) hold the existing violations as the baseline:
// new violations fail, fixed ones must be pruned, so the baseline only shrinks.
import { defineConfig, globalIgnores } from 'eslint/config'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import tseslint from 'typescript-eslint'

// ESLint 10 no longer depends on @eslint/js, and the approved checker set
// does not include it. Its recommended list is generated from the core rules
// whose metadata marks them recommended; read the same metadata here.
const coreRecommended = Object.fromEntries(
  [...builtinRules]
    .filter(([, rule]) => rule.meta?.docs?.recommended === true)
    .map(([name]) => [name, 'error']),
)

// Scripts run under the Node that runs ESLint; its global names are theirs.
const nodeGlobals = Object.fromEntries(
  Object.getOwnPropertyNames(globalThis).map((name) => [name, 'readonly']),
)

export default defineConfig([
  globalIgnores([
    'dist/',
    'reference/',
    '.llm/',
    '.agents/',
    '.worktrees/',
    '.pnpm-store/',
    // Vendored upstream code (DSH vendor/schemastery, see its header); it
    // changes by re-vendoring, not by lint fixes.
    'src/shared/schemastery.ts',
  ]),
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    rules: coreRecommended,
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // src/ uses tsconfig.json, tests/ uses tests/tsconfig.json; TypeScript
        // scripts have no project of their own.
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
    files: ['scripts/**/*.{js,mjs,cjs}', 'ui/index.js', '*.js'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // Client half: runs in the DSH web renderer.
    files: ['ui/client.js'],
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
])
