/**
 * Interactive viewer of the project graph for the human (docs/ORCHESTRATION.md §2.10).
 *
 *   npm run graph:serve -- [--dir <graph dir>] [--port <n>]
 *
 * Starts the local server on 127.0.0.1 and prints the viewer address with
 * the per-start token; open it in a browser. Ctrl+C stops the server.
 * Defaults: --dir docs/graph of this repository, --port 0 (a free port).
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { startServer } from '../../src/graph/server.ts'

const USAGE = 'usage: npm run graph:serve -- [--dir <graph dir>] [--port <n>]'
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function options() {
  try {
    return parseArgs({ options: { dir: { type: 'string' }, port: { type: 'string' } }, strict: true }).values
  }
  catch (error) {
    console.error(`graph:serve: ${(error as Error).message}\n${USAGE}`)
    process.exit(2)
  }
}

const values = options()
const port = values.port === undefined ? 0 : Number(values.port)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`graph:serve: --port must be an integer from 0 to 65535\n${USAGE}`)
  process.exit(2)
}
const dir = values.dir === undefined ? join(repository, 'docs', 'graph') : resolve(values.dir)

let server: Awaited<ReturnType<typeof startServer>>
try {
  server = await startServer({ dir, port })
}
catch (error) {
  console.error(`graph:serve: ${(error as Error).message}`)
  process.exit(1)
}
console.log(`graph:serve: ${server.url}`)
console.log(`graph:serve: serving ${dir}; open the address above in a browser, Ctrl+C stops the server`)

const stop = (): void => {
  void server.close().then(() => process.exit(0))
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
