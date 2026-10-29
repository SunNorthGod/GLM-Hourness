/**
 * Which source directory under src/ belongs to which package: the one place
 * it is written (docs/DESIGN.md §2.1, split design §2.7). eslint.config.js
 * generates the import boundaries from it, and scripts/preflight-bundle.mjs
 * checks it against src/ (the table self-check). The GLM channel package
 * holds the channel, the dialect and tool search; the orchestration package
 * holds the data, guard, memory, workflow, report and graph rows. src/shared/
 * is the shared library, compiled into every package that imports it; it
 * imports no package directory.
 */

/** The shared library's directory under src/. */
export const SHARED_DIR = 'shared'

/** The packages and their source directories under src/. */
export const PACKAGES = [
  { key: 'glm', src: ['glm-llm', 'glm-prompt', 'toolsearch'] },
  { key: 'hourness', src: ['data', 'guard', 'memory', 'workflow', 'ui', 'graph'] },
]
