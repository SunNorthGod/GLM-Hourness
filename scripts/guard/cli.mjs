/**
 * Command line of the guard (docs/DEVELOPMENT.md §15, m4-gate design §3.9).
 * It runs in its own process, outside DSH, and only reads one project's
 * violation journal:
 *
 *   npm run -s guard -- records [--since 14d] [--rule <id>] [--show] [--home <dir>]
 *   npm run -s guard -- stats   [--since 14d] [--home <dir>]
 *
 * The options and the exit codes are in src/guard/cli.ts.
 */
import { runCli } from '../../src/guard/cli.ts'

const result = await runCli(process.argv.slice(2), { cwd: process.cwd() })
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode = result.exitCode
