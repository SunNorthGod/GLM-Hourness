/**
 * Command line of the rules board (docs/DEVELOPMENT.md §13). It runs in its
 * own process, outside DSH, and only reads the rules board of a project:
 *
 *   npm run -s rules -- show  [--project <dir>]
 *   npm run -s rules -- check --tool <name> --args <file> [--project <dir>] [--signal glm-peak=true] ...
 *
 * The options and the exit codes are in src/rules/cli.ts.
 */
import { runCli } from '../../src/rules/cli.ts'

const result = await runCli(process.argv.slice(2), { cwd: process.cwd() })
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode = result.exitCode
