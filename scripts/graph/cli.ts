/**
 * LLM command line over the graph engine (docs/ORCHESTRATION.md §2.10).
 *
 *   npm run -s graph -- [--dir <graph dir>] show <id> | open | <op> [<json> | --file <path>]
 *
 * Prints one JSON document on stdout; exit code 0 success, 1 refused by the
 * engine, 2 bad command line or input. Default --dir: docs/graph of this
 * repository.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from '../../src/graph/cli.ts'
import { readStdin } from '../read-stdin.ts'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const result = await runCli(process.argv.slice(2), { dir: join(repository, 'docs', 'graph'), stdin: readStdin })
process.stdout.write(result.text)
process.exitCode = result.exitCode
