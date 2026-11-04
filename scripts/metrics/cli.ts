/**
 * Launcher of the metrics command line (design §7.5), the way
 * scripts/graph/cli.ts launches the graph one:
 *
 *   npm run -s metrics -- summary [--project <dir>] [--from <ISO>] [--to <ISO>] [--tz <±HH:MM>] [--json]
 *   npm run -s metrics -- verify [...]
 *   npm run -s metrics -- compare --by <v|model|host|role> [...]
 *   npm run -s metrics -- prune --before <YYYY-MM-DD> [--project <dir>]
 *   npm run -s metrics -- backfill-graph [--project <dir>]
 *
 * The grammar, the rendering and the exit codes are in src/metrics/cli.ts.
 */
import { runCli } from '../../src/metrics/cli.ts'

const result = await runCli(process.argv.slice(2), { cwd: process.cwd(), env: process.env, now: Date.now })
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode = result.exitCode
