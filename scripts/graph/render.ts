/**
 * Render the project graph to a standalone SVG (docs/ORCHESTRATION.md §2.12).
 *
 *   npm run graph:render -- [--dir <graph dir>] [--out <file>] [--root <id> | --focus <id>] [--collapse <id>]...
 *
 * Defaults: --dir docs/graph of this repository, --out <dir>/graph.svg.
 * Validation errors are listed on stderr and the picture is still written,
 * so the human can see the graph that has them.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { renderGraph } from '../../src/graph/render.ts'
import { loadGraph } from '../../src/graph/store.ts'

const USAGE = 'usage: npm run graph:render -- [--dir <graph dir>] [--out <file>] [--root <id> | --focus <id>] [--collapse <id>]...'
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function options() {
  try {
    return parseArgs({
      options: {
        dir: { type: 'string' },
        out: { type: 'string' },
        root: { type: 'string' },
        focus: { type: 'string' },
        collapse: { type: 'string', multiple: true },
      },
      strict: true,
    }).values
  }
  catch (error) {
    console.error(`graph:render: ${(error as Error).message}\n${USAGE}`)
    process.exit(2)
  }
}

const values = options()
const dir = values.dir === undefined ? join(repository, 'docs', 'graph') : resolve(values.dir)
const out = values.out === undefined ? join(dir, 'graph.svg') : resolve(values.out)
const graph = await loadGraph(dir)
const result = renderGraph(graph, {
  ...(values.root === undefined ? {} : { root: values.root }),
  ...(values.focus === undefined ? {} : { focus: values.focus }),
  ...(values.collapse === undefined ? {} : { collapsed: values.collapse }),
})
if (!result.ok) {
  console.error(`graph:render: ${JSON.stringify(result.error)}`)
  process.exit(1)
}
for (const issue of graph.issues) {
  if (issue.severity !== 'error') continue
  console.error(`graph:render: ${issue.file}${issue.field === undefined ? '' : ` ${issue.field}`}: ${issue.message}`)
}
await mkdir(dirname(out), { recursive: true })
await writeFile(out, result.svg)
const shown = relative(process.cwd(), out)
console.log(`graph:render: wrote ${shown.startsWith('..') ? out : shown} (${result.layout.nodes.length} nodes drawn, revision ${graph.revision})`)
