// knip: unused files, exports and dependencies (docs/ROADMAP.md M1.9).
// The root package.json is the development workspace and exports nothing,
// so the entries are listed here, generated from the directory table
// (scripts/packages.mjs): every host row's source module, which DSH loads
// through a package's patch. scripts/check-lint.mjs passes
// --tsConfig tsconfig.knip.json, whose references map packages/*/dist back
// to src/ for the scripts that import build output.
import { PACKAGES } from './scripts/packages.mjs'

export default {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  entry: [
    ...PACKAGES.flatMap(pkg => pkg.rows.map(row => `src/${row.module}.ts`)),
    // Client packages: DSH loads each host half packages/<pkg>/ui/index.js
    // through its package's patch; the client entry under ui/src/ is
    // bundled into packages/<pkg>/ui/client.js by scripts/build-ui.mjs.
    ...PACKAGES.flatMap(pkg => [`${pkg.dir}/ui/index.js`, pkg.client.entry]),
    // Probe provider, probe clock, probe net log and dispatch spike: run-probe.mjs passes their paths to the DSH Loader.
    'scripts/probe/probe-llm.mjs',
    'scripts/probe/probe-clock.mjs',
    'scripts/probe/probe-net.mjs',
    'scripts/probe/probe-dispatch.mjs',
    // Calibration bounds row and simulated human: scripts/sandbox.mjs passes their paths to the DSH Loader.
    'scripts/calibrate/limits.mjs',
    'scripts/calibrate/simulated-human.mjs',
    // Calibration checkers: run-calibrate.mjs starts each task's check.mjs by path.
    'tests/calibration/*/check.mjs',
  ],
  project: ['src/**/*.ts', 'tests/**/*.{ts,mjs}', 'scripts/**/*.{mjs,cjs,ts}', 'packages/*/ui/index.js', 'ui/src/**/*.{js,ts,tsx}'],
  // Built client halves (scripts/build-ui.mjs).
  ignore: ['packages/*/ui/client.js'],
  // The client half gets React, react-dom (the pill dialog's portal) and
  // ui-primitives from the DSH client module table (the factory's require,
  // scripts/ui-modules.mjs), not from node_modules.
  ignoreDependencies: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
}
