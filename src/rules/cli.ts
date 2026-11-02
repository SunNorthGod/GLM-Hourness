/**
 * The rules command line (docs/DEVELOPMENT.md §13; design §9.4):
 *
 *   npm run -s rules -- show  [--project <dir>] [--rules-dir <dir>]
 *   npm run -s rules -- check --tool <name> --args <file> [--project <dir>] [--rules-dir <dir>]
 *       [--session <id>] [--model <provider/model>] [--role main-agent|root|subagent] [--stage <stage>]
 *       [--signal glm-peak=true|false] [--glm-spend optional|necessary] [--peak-until <ISO time>] [--waited-ms <n>]
 *
 * One JSON document on the standard output. The exit code of `show` is 0; that
 * of `check` is 0 for a call that is let through (or only recorded or
 * informed about), 4 for a block and 5 for a deferral. 1 is a project whose
 * state cannot be read, 2 a command line that does not fit (one line on the
 * standard error says which part and why, and nothing is printed on the
 * standard output). The command line never writes to the rules board: it
 * cannot add, change or lift a rule, and a `check` only judges.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { checkCall, RulesCheckError, showProject, type CheckOptions } from './check.ts'
import type { MetricExit } from './metrics.ts'

export interface CliIo {
  /** The directory the command line was started in: the project, unless `--project` says otherwise. */
  readonly cwd: string
  /** Where the `rules.check` event goes; default nowhere. */
  readonly metrics?: MetricExit
  /** The moment in milliseconds; only a test sets it. */
  readonly now?: () => number
}

export interface CliResult {
  readonly exitCode: 0 | 1 | 2 | 4 | 5
  /** The JSON document, newline-terminated; empty when the command line did not fit or the project could not be read. */
  readonly stdout: string
  /** One line saying what was wrong; empty on success. */
  readonly stderr: string
}

/** The longest arguments file `check` reads. */
const ARGS_LIMIT = 256 * 1024

const done = (exitCode: CliResult['exitCode'], document: unknown): CliResult => ({ exitCode, stdout: `${JSON.stringify(document, null, 2)}\n`, stderr: '' })
const refused = (exitCode: 1 | 2, message: string): CliResult => ({ exitCode, stdout: '', stderr: `${message.replace(/\s+/g, ' ').trim()}\n` })

const OPTIONS = {
  project: { type: 'string' },
  'rules-dir': { type: 'string' },
  tool: { type: 'string' },
  args: { type: 'string' },
  session: { type: 'string' },
  model: { type: 'string' },
  role: { type: 'string' },
  stage: { type: 'string' },
  signal: { type: 'string', multiple: true },
  'glm-spend': { type: 'string' },
  'peak-until': { type: 'string' },
  'waited-ms': { type: 'string' },
} as const

/** The options only `check` takes. */
const CHECK_ONLY = ['tool', 'args', 'session', 'model', 'role', 'stage', 'signal', 'glm-spend', 'peak-until', 'waited-ms'] as const

/** `--signal name=value` entries as the object `checkCall` takes. The values stay as typed when they are not `true` or `false`, so that `checkCall` says what is wrong with them after it has checked the name. */
function signalsOf(entries: readonly string[]): CheckOptions['signals'] | RulesCheckError {
  const given: Record<string, unknown> = {}
  for (const entry of entries) {
    const at = entry.indexOf('=')
    if (at < 1) return new RulesCheckError('usage', `--signal ${entry} 要写成 名字=true 或 名字=false`)
    const name = entry.slice(0, at)
    if (Object.hasOwn(given, name)) return new RulesCheckError('usage', `${name} 在 --signal 里只能给一次`)
    const value = entry.slice(at + 1)
    given[name] = value === 'true' ? true : value === 'false' ? false : value
  }
  return given
}

/** The arguments of the call from `--args <file>`: a JSON object, at most 256 KiB. */
async function argsOf(file: string, cwd: string): Promise<{ readonly args: unknown } | RulesCheckError> {
  let text: string
  try {
    text = await readFile(resolve(cwd, file), 'utf8')
  }
  catch (error) {
    return new RulesCheckError('usage', `--args 读不出 ${file}：${error instanceof Error ? error.message : String(error)}`)
  }
  if (Buffer.byteLength(text) > ARGS_LIMIT) return new RulesCheckError('usage', '--args 的文件超过 256 KiB')
  let args: unknown
  try {
    // A byte order mark (some Windows editors write one) is not JSON.
    args = JSON.parse(text.replace(/^\uFEFF/, ''))
  }
  catch (error) {
    return new RulesCheckError('usage', `--args 的文件不是合法的 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return new RulesCheckError('usage', '--args 的文件内容要是一个 JSON 对象')
  return { args }
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<CliResult> {
  let parsed: ReturnType<typeof parseCommandLine>
  try {
    parsed = parseCommandLine(argv)
  }
  catch (error) {
    return refused(2, (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '命令行读不懂')
  }
  const { values, positionals } = parsed
  const [command, ...rest] = positionals
  if (command === undefined) return refused(2, '缺少命令：show 或 check')
  if (command !== 'show' && command !== 'check') return refused(2, `没有 ${command} 这个命令；命令是 show 和 check`)
  if (rest.length > 0) return refused(2, `${command} 不带位置参数：${rest.join(' ')}`)
  const project = values.project === undefined ? io.cwd : resolve(io.cwd, values.project)
  const rulesDir = values['rules-dir']
  const common = { project, ...(rulesDir === undefined ? {} : { rulesDir }), ...(io.now === undefined ? {} : { now: io.now() }) }
  try {
    if (command === 'show') {
      const extra = CHECK_ONLY.find(name => values[name] !== undefined)
      if (extra !== undefined) return refused(2, `show 不认 --${extra}，那是 check 的选项`)
      const shown = await showProject(common)
      return done(0, { ok: true, ...shown })
    }
    if (values.tool === undefined) return refused(2, '--tool 必填：写工具的原生名')
    if (values.args === undefined) return refused(2, '--args 必填：写一个文件，内容是调用参数的 JSON 对象')
    const signals = signalsOf(values.signal ?? [])
    if (signals instanceof RulesCheckError) return refused(2, signals.message)
    const call = await argsOf(values.args, io.cwd)
    if (call instanceof RulesCheckError) return refused(2, call.message)
    const result = await checkCall({ tool: values.tool, args: call.args }, {
      ...common,
      caller: 'cli',
      ...(io.metrics === undefined ? {} : { metrics: io.metrics }),
      ...(values.session === undefined ? {} : { session: values.session }),
      ...(values.model === undefined ? {} : { model: values.model }),
      ...(values.role === undefined ? {} : { role: values.role as NonNullable<CheckOptions['role']> }),
      ...(values.stage === undefined ? {} : { stage: values.stage }),
      ...(signals === undefined || Object.keys(signals).length === 0 ? {} : { signals }),
      ...(values['glm-spend'] === undefined ? {} : { glmSpend: values['glm-spend'] as NonNullable<CheckOptions['glmSpend']> }),
      ...(values['peak-until'] === undefined ? {} : { peakUntil: values['peak-until'] }),
      ...(values['waited-ms'] === undefined ? {} : { waitedMs: values['waited-ms'] === '' ? Number.NaN : Number(values['waited-ms']) }),
    })
    return done(result.exitCode, result)
  }
  catch (error) {
    if (error instanceof RulesCheckError) return refused(error.code === 'usage' ? 2 : 1, error.message)
    return refused(1, error instanceof Error ? error.message : String(error))
  }
}

function parseCommandLine(argv: readonly string[]) {
  return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true })
}
