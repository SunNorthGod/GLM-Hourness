/**
 * Command-line client of the graph engine for the LLM (docs/ORCHESTRATION.md
 * §2.10): JSON in, one JSON document out. The actor is always llm and every
 * command is one engine call, so the CLI enforces the engine's rules and no
 * others. The later DSH graph tools expose the same commands.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { projectOf } from '../data/project-root.ts'
import { nodeMetricsFs, openWriter } from '../metrics/writer.ts'
import { engineEventsOf } from './metrics-events.ts'
import { openEngine, setEngineObserver } from './engine.ts'
import { failure, type Failure } from './mutation.ts'
import { OPS, type Op } from './schema.ts'

const CLI_USAGE = `npm run -s graph -- [--dir <graph dir>] show <id> | open | <op> [<json> | --file <path>]; without json or --file the request is read from stdin; op is one of ${OPS.join(', ')}`

export interface CliIo {
  /** Graph directory used when --dir is absent. */
  readonly dir: string
  /** Standard input; read only when a mutation has neither a JSON argument nor --file. */
  readonly stdin: () => Promise<string>
  /** Clock for history timestamps; tests pin it. */
  readonly now?: () => Date
}

export interface CliResult {
  /** 0 success, 1 refused by the engine, 2 bad command line or unreadable input. */
  readonly exitCode: 0 | 1 | 2
  /** The JSON document for stdout, newline-terminated. */
  readonly text: string
}

function done<Output extends { readonly ok: boolean }>(output: Output, exitCode?: 2): CliResult {
  return { exitCode: exitCode ?? (output.ok ? 0 : 1), text: `${JSON.stringify(output, null, 2)}\n` }
}

function usage(message: string, field?: string): CliResult {
  return done(failure('invalid', message, CLI_USAGE, field), 2)
}

function isOp(command: string): command is Op {
  return (OPS as readonly string[]).includes(command)
}

/** Request text from the JSON argument, --file or stdin, or a usage failure. */
async function requestText(json: string | undefined, file: string | undefined, io: CliIo): Promise<string | Failure> {
  if (json !== undefined && json !== '-') return json
  if (file !== undefined) {
    try {
      return await readFile(resolve(file), 'utf8')
    }
    catch (error) {
      return failure('invalid', `cannot read --file ${file}: ${(error as Error).message}`, CLI_USAGE, 'file')
    }
  }
  return io.stdin()
}

export async function runCli(args: readonly string[], io: CliIo): Promise<CliResult> {
  let parsed: ReturnType<typeof parseCommandLine>
  try {
    parsed = parseCommandLine(args)
  }
  catch (error) {
    return usage((error as Error).message)
  }
  const { values, positionals } = parsed
  const [command, ...rest] = positionals
  if (command === undefined) return usage('missing command')
  // The one-shot process keeps its own metrics writer and hears its own
  // writes through the engine's observers (metrics design §6.3): every note
  // lands in the project the graph directory belongs to, and the writer
  // closes inside the exit path.
  const writer = openWriter({ host: 'cli', fs: nodeMetricsFs })
  const observe = setEngineObserver(note => {
    const root = projectOf(note.dir)?.root
    if (root === undefined) return
    for (const event of engineEventsOf(note)) writer.record(root, event)
  })
  try {
    const engine = openEngine(values.dir === undefined ? io.dir : resolve(values.dir), io.now === undefined ? {} : { now: io.now })
    if (command === 'show' || command === 'open') {
      if (values.file !== undefined) return usage(`${command} takes no --file`, 'file')
      if (command === 'open') {
        if (rest.length > 0) return usage('open takes no arguments')
        return done({ ok: true, items: await engine.openItems() })
      }
      if (rest.length !== 1) return usage('show takes one node id')
      return done(await engine.projection(rest[0]))
    }
    if (!isOp(command)) return usage(`unknown command "${command}"`)
    if (rest.length > 1) return usage(`${command} takes one JSON request`)
    if (rest[0] !== undefined && rest[0] !== '-' && values.file !== undefined) return usage('give the request as an argument or with --file, not both', 'file')
    const text = await requestText(rest[0], values.file, io)
    if (typeof text !== 'string') return done(text, 2)
    if (text.trim().length === 0) return usage(`no request: pass the ${command} fields as a JSON argument, with --file or on stdin`)
    let request: unknown
    try {
      // A byte order mark (some Windows editors and shells write one) is not JSON.
      request = JSON.parse(text.replace(/^\uFEFF/, ''))
    }
    catch (error) {
      return usage(`the request is not valid JSON: ${(error as Error).message}`)
    }
    if (typeof request !== 'object' || request === null || Array.isArray(request)) return usage('the request must be a JSON object of the operation fields')
    const fields = request as Record<string, unknown>
    if (fields.op !== undefined && fields.op !== command) return usage(`the request names op ${JSON.stringify(fields.op)} but the command is ${command}`, 'op')
    return done(await engine.apply('llm', { ...fields, op: command }))
  }
  finally {
    observe()
    await writer.close()
  }
}

function parseCommandLine(args: readonly string[]) {
  return parseArgs({
    args: [...args],
    options: { dir: { type: 'string' }, file: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  })
}
