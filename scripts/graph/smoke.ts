/**
 * Smoke check of the graph entry scripts as processes of their own
 * (docs/ORCHESTRATION.md §2.10, §2.12); part of npm test. The specs call
 * the command line in process; this runs the scripts the way npm does.
 *
 *   npm run graph:smoke
 *
 * Seeds a temporary graph, writes one llm comment through
 * scripts/graph/cli.ts, reads it back with `open` and `show`, draws the
 * graph with scripts/graph/render.ts, and checks the comment, the
 * revisions and the picture, then removes the temporary graph.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openEngine } from '../../src/graph/engine.ts'
import { loadGraph } from '../../src/graph/store.ts'

const WAIT_MS = 20_000
const here = dirname(fileURLToPath(import.meta.url))
const flags = ['--experimental-strip-types', '--no-warnings']

function fail(message: string): never {
  throw new Error(message)
}

/** Run one entry script and return its stdout. */
function run(script: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [...flags, join(here, script), ...args], { encoding: 'utf8', timeout: WAIT_MS }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(`${script} ${args.join(' ')} failed: ${error.message} ${stdout} ${stderr}`))
      else resolve(stdout)
    })
  })
}

/** The fields of the command line's answers this smoke reads. */
interface Answer {
  readonly ok: boolean
  readonly revision?: string
  readonly items?: { readonly revision: string, readonly ready: readonly { readonly id: string }[] }
  readonly projection?: { readonly recentHistory: readonly { readonly actor: string, readonly op: string, readonly text?: string }[] }
}

async function cli(args: readonly string[]): Promise<Answer> {
  const answer = JSON.parse(await run('cli.ts', args)) as Answer
  if (answer.ok !== true) fail(`graph ${args.join(' ')} refused: ${JSON.stringify(answer)}`)
  return answer
}

async function smoke(dir: string): Promise<string> {
  const engine = openEngine(dir)
  for (const node of [
    { type: 'goal', title: '冒烟目标', acceptance: ['命令行与出图都能单独运行'] },
    { type: 'feature', title: '命令行', parent: 'goal-1' },
    { type: 'task', title: '写批注', parent: 'feature-1' },
  ]) {
    const result = await engine.apply('human', { op: 'propose', reason: '冒烟', node })
    if (!result.ok) fail(`seeding failed: ${JSON.stringify(result.error)}`)
  }
  const request = join(dir, 'comment.json')
  await writeFile(request, JSON.stringify({ id: 'task-1', text: 'LLM 经命令行写的批注' }))
  const written = await cli(['--dir', dir, 'comment', '--file', request])
  const graph = await loadGraph(dir)
  if (written.revision !== graph.revision) fail(`the command line reported ${written.revision}, the graph is at ${graph.revision}`)
  const open = await cli(['--dir', dir, 'open'])
  if (open.items?.revision !== graph.revision || open.items.ready.map(entry => entry.id).join() !== 'task-1') fail(`open returned ${JSON.stringify(open.items)}`)
  const shown = await cli(['--dir', dir, 'show', 'task-1'])
  const last = shown.projection?.recentHistory.at(-1)
  if (last?.actor !== 'llm' || last.op !== 'comment' || last.text !== 'LLM 经命令行写的批注') fail(`show returned the history ${JSON.stringify(shown.projection?.recentHistory)}`)
  const picture = join(dir, 'graph.svg')
  await run('render.ts', ['--dir', dir, '--out', picture])
  const svg = await readFile(picture, 'utf8')
  if (!svg.startsWith('<svg') || !svg.includes(`data-revision="${graph.revision}"`) || !svg.includes('data-id="task-1"')) fail('the rendered picture lacks the graph revision or a node')
  return `revision ${graph.revision}, comment, open, show and render`
}

const dir = await mkdtemp(join(tmpdir(), 'graph-smoke-'))
try {
  console.log(`graph:smoke: ok (${await smoke(dir)})`)
}
catch (error) {
  console.error(`graph:smoke: FAILED: ${(error as Error).message}`)
  process.exitCode = 1
}
finally {
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
