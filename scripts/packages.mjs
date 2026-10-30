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
 * `<dir>/dist/<module>.js`, exported as `./<row>` (the id without
 * glm-hourness/) and named in the patch by the subpath specifier
 * `<name>/<row>`, with its settings-page title in `<dir>/locale/<row>/`;
 * `client`: the package's client face (its host half `<dir>/ui/index.js`
 * and bundle `<dir>/ui/client.js`, declared by the package's own dsh.client):
 * the row the patch inserts for it under the exact package name, the entry
 * scripts/build-ui.mjs bundles into its client.js, and the files and
 * directories under ui/src/ that belong to it.
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
    client: {
      row: 'glm-hourness/glm-ui',
      entry: 'ui/src/glm-client.js',
      sources: ['ui/src/channel.js', 'ui/src/channel-model.ts', 'ui/src/glm-client.js'],
    },
  },
  {
    key: 'hourness',
    name: 'dsh-hourness',
    dir: 'packages/hourness',
    src: ['data', 'guard', 'memory', 'workflow', 'report', 'graph', 'rules', 'execute', 'design'],
    rows: [
      { id: 'glm-hourness/data', module: 'data/index' },
      { id: 'glm-hourness/guard', module: 'guard/index' },
      { id: 'glm-hourness/memory', module: 'memory/index' },
      { id: 'glm-hourness/workflow', module: 'workflow/index' },
      { id: 'glm-hourness/hourness', module: 'report/index' },
      { id: 'glm-hourness/graph', module: 'graph/index' },
      { id: 'glm-hourness/graph-panel', module: 'graph/panel-row' },
      { id: 'glm-hourness/rules', module: 'rules/index' },
      { id: 'glm-hourness/design', module: 'design/index' },
    ],
    client: {
      row: 'glm-hourness/ui',
      entry: 'ui/src/hourness-client.tsx',
      sources: ['ui/src/hourness-client.tsx', 'ui/src/dsh.ts', 'ui/src/primitives.d.ts', 'ui/src/graph/', 'ui/src/flow/', 'ui/src/wish/'],
    },
  },
]
