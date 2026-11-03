/**
 * Command line of the lessons board (docs/DEVELOPMENT.md §13).
 *
 *   npm run -s lessons -- [--cwd <folder>] show | apply [--file <path>]
 *
 * Prints one JSON document on stdout; exit code 0 success, 1 a request failed,
 * 2 bad command line or input. The project is the one the folder belongs to;
 * without `--cwd` it is the folder npm was started in (`INIT_CWD`).
 */
import { runCli } from '../../src/lessons/cli.ts'
import { readStdin } from '../read-stdin.ts'

const result = await runCli(process.argv.slice(2), { cwd: process.env.INIT_CWD ?? process.cwd(), stdin: readStdin })
process.stdout.write(result.text)
process.exitCode = result.exitCode
