/**
 * Which source directory under src/ belongs to which package, and what each
 * package ships: the one place it is written (docs/DESIGN.md §2.1, split
 * design §2.7). eslint.config.js generates the import boundaries from it,
 * knip.js its entries, scripts/clean-dist.mjs the directories it clears,
 * scripts/sandbox.mjs the profiles the probe generates, and
 * scripts/preflight-bundle.mjs checks src/, the manifests, the patches and
 * the build output against it. The GLM channel package holds the channel,
 * the dialect and tool search; the orchestration package holds the data,
 * guard, memory, workflow, report and graph rows. src/shared/ is the shared
 * library, compiled into every package that imports it; it imports no
 * package directory.
 */

/** The shared library's directory under src/. */
export const SHARED_DIR = 'shared'

/**
 * The packages, in the order a profile lists them (GLM first, where the
 * single bundle used to be): the host rows compose in the same order as
 * before the split. `src`: source directories under src/; `rows`: the
 * loader rows the package's patch inserts, each built to
 * `<dir>/dist/<module>.js` and exported as `./<id without glm-hourness/>`.
 */
export const PACKAGES = [
  {
    key: 'glm',
    name: 'dsh-glm-zcode',
    dir: 'packages/glm',
    src: ['glm-llm', 'glm-prompt', 'toolsearch'],
    rows: [
      { id: 'glm-hourness/glm-llm', module: 'glm-llm/index' },
      { id: 'glm-hourness/glm-login', module: 'glm-llm/login-row' },
      { id: 'glm-hourness/glm-prompt', module: 'glm-prompt/index' },
      { id: 'glm-hourness/glm-compact', module: 'glm-prompt/compact-row' },
    ],
  },
  {
    key: 'hourness',
    name: 'dsh-hourness',
    dir: 'packages/hourness',
    src: ['data', 'guard', 'memory', 'workflow', 'report', 'graph'],
    rows: [
      { id: 'glm-hourness/data', module: 'data/index' },
      { id: 'glm-hourness/guard', module: 'guard/index' },
      { id: 'glm-hourness/memory', module: 'memory/index' },
      { id: 'glm-hourness/workflow', module: 'workflow/index' },
      { id: 'glm-hourness/hourness', module: 'report/index' },
      { id: 'glm-hourness/graph', module: 'graph/index' },
      { id: 'glm-hourness/graph-panel', module: 'graph/panel-row' },
    ],
  },
]

/**
 * Added in split step 5, removed in step 6: until step 6 the client row
 * still comes from the old single client package under ui/, which a
 * profile lists after the two host packages.
 */
export const LEGACY_CLIENT_BUNDLE = { name: 'dsh-glm-hourness-ui', dir: 'ui', row: 'glm-hourness/ui' }
