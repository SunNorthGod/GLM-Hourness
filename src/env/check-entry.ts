/**
 * The check lines of an environment tool node (M4 design §6.1.1): one
 * acceptance condition per check, written
 *
 *   `check <name> <format> [<estimate>] $ <command>` when <condition>[, <condition>…]
 *
 * The backticks are optional (the example line M4 shows the main agent,
 * CHECK_LINE_EXAMPLE, has none). A line with `when` is M4's own checker: it
 * runs after the edits its conditions match. A line without it only defines a
 * command a person's `check` entry on the loop board can point at. All of it
 * is pure: the command is split into an argument vector here and never goes
 * through a shell; `fillCheckArgv` puts the changed files in for one run.
 */
import { basename, extname } from 'node:path'
import { pathsRefusal } from '../loops/trigger.ts'

/** The output formats a check line may name (design §6.4). */
export type CheckFormat = 'eslint-json' | 'tsc' | 'lines'
const CHECK_FORMATS: readonly string[] = ['eslint-json', 'tsc', 'lines']

/** Whether a value names one of the formats. */
export function isCheckFormat(value: unknown): value is CheckFormat {
  return typeof value === 'string' && CHECK_FORMATS.includes(value)
}

/** One readable check line. */
export interface CheckEntry {
  readonly name: string
  readonly format: CheckFormat
  /** The command, split; `{files}` still in. */
  readonly argv: readonly string[]
  /** The `<estimate>` of the line in whole seconds: the expected run time, not a timeout. */
  readonly estimateSeconds?: number
  /** The `when` conditions in the loop board's `paths` writing; absent on a line without `when`. */
  readonly paths?: readonly string[]
}

/** The placeholder one argument item may be: the changed files, one item each. */
const FILES = '{files}'

/** Programs that rebuild a command line from their arguments and interpret it again: they take no `{files}` (design §6.1.1). */
export const SHELL_PROGRAMS: readonly string[] = ['pwsh', 'powershell', 'cmd', 'sh', 'bash', 'zsh', 'fish', 'dash']

/** The whole command line of one run stays under this many characters; files that do not fit are dropped (design §6.1.2). */
export const COMMAND_LINE_LIMIT = 28_000

/** The example line the main agent reads when an edited language has no check (design §6.6); the L2 runs it through the reader. */
export const CHECK_LINE_EXAMPLE = 'check ruff lines 3s $ ruff check --output-format concise {files} when *.py'

const NAME = /^[a-z][a-z0-9-]{0,23}$/
const ESTIMATE = /^[1-9][0-9]{0,2}s$/
const MAX_ITEMS = 64
const MAX_ITEM = 2000

type Read<T> = { readonly ok: true, readonly value: T } | { readonly ok: false, readonly reason: string }

const refuse = (reason: string): { readonly ok: false, readonly reason: string } => ({ ok: false, reason })

/** Whether an acceptance line is meant as a check line (readable or not). */
export function isCheckLine(line: string): boolean {
  return /^`?check\s/.test(line)
}

/**
 * Split a command into its argument vector: items are separated by spaces;
 * an item may be enclosed in double quotes to hold spaces (the quotes are
 * removed, and a quoted item holds no further quote). Nothing else is
 * interpreted: `$`, `%`, backticks, `;`, `|` and `>` are plain characters.
 */
export function splitArgs(command: string): Read<readonly string[]> {
  const items: string[] = []
  let at = 0
  while (at < command.length) {
    if (command[at] === ' ') {
      at++
      continue
    }
    if (command[at] === '"') {
      const end = command.indexOf('"', at + 1)
      if (end < 0) return refuse('双引号没有配对')
      if (end + 1 < command.length && command[end + 1] !== ' ') return refuse('双引号括起的一项后面要接空格')
      items.push(command.slice(at + 1, end))
      at = end + 1
      continue
    }
    let end = command.indexOf(' ', at)
    if (end < 0) end = command.length
    const item = command.slice(at, end)
    if (item.includes('"')) return refuse('一项里不能有双引号，除非整项用双引号括起来')
    items.push(item)
    at = end
  }
  return { ok: true, value: items }
}

/** Why an argument vector cannot run as a check, or undefined. */
function argvRefusal(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return '命令是空的'
  if (argv.length > MAX_ITEMS) return `命令至多 ${MAX_ITEMS} 项`
  if (argv.some(item => item.length === 0 || item.length > MAX_ITEM)) return `每一项 1 到 ${MAX_ITEM} 个字符`
  if (argv.some(item => /[\0\r\n]/.test(item))) return '命令里不能有换行或 NUL'
  const program = argv[0] ?? ''
  if (program === FILES) return '第一项是程序，不能是 {files}'
  if (/\.(cmd|bat)$/i.test(program)) return '第一项是 .cmd 或 .bat，要经 shell 才能起；请写成能直接起的程序，例 node 加脚本路径'
  if (argv.some(item => item !== FILES && item.includes(FILES))) return '{files} 只能单独作为一项'
  const files = argv.filter(item => item === FILES).length
  if (files > 1) return '{files} 至多一处'
  const name = basename(program, extname(program)).toLowerCase()
  if (files === 1 && SHELL_PROGRAMS.includes(name)) return `${name} 会把参数拼回命令再解释，不能带 {files}；要按改动文件跑 shell 逻辑就写成脚本条目`
  return undefined
}

/** The `when` conditions: comma-separated, each one the loop board's `paths` writing. */
function readConditions(text: string): Read<readonly string[]> {
  const paths = text.split(',').map(condition => condition.trim())
  if (paths.some(path => path === '')) return refuse('when 后面的条件不能为空')
  const problem = pathsRefusal(paths)
  return problem === undefined ? { ok: true, value: paths } : refuse(`when：${problem}`)
}

/** The part between `check` and the command: name, format, optional estimate. */
function readHead(head: string): Read<Pick<CheckEntry, 'name' | 'format' | 'estimateSeconds'>> {
  const words = head.split(/\s+/).filter(word => word !== '')
  if (words.length < 2 || words.length > 3) return refuse('写成 check <名字> <格式> [<预计>] $ <命令>')
  const [name = '', format = '', estimate] = words
  if (!NAME.test(name)) return refuse('名字用小写字母开头，只含小写字母、数字和 -，至多 24 个字符')
  if (!isCheckFormat(format)) return refuse(`格式写 ${CHECK_FORMATS.join('、')} 之一`)
  if (estimate === undefined) return { ok: true, value: { name, format } }
  if (!ESTIMATE.test(estimate)) return refuse('预计写成整秒，1 到 999，例 4s')
  return { ok: true, value: { name, format, estimateSeconds: Number(estimate.slice(0, -1)) } }
}

/** Read one check line: the entry, or why it cannot be read. */
function readCheckLine(line: string): Read<CheckEntry> {
  // Backticks around the check part: `when` follows the closing one. Without
  // them the last ` when ` starts the conditions.
  const found = line.startsWith('`')
    ? /^`check\s(.*)`(?:\s+when\b(.*))?$/.exec(line)
    : /^check\s(.*)\s+when\b(.*)$/.exec(line) ?? /^check\s(.*)$/.exec(line)
  if (found === null) return refuse(line.startsWith('`') ? '反引号没有配对，或 when 写在了反引号里' : '写成 check <名字> <格式> [<预计>] $ <命令>')
  const check = found[1] ?? ''
  const when = found[2]
  const split = check.indexOf(' $ ')
  if (split < 0) return refuse('名字与格式之后要有 " $ "，再接命令')
  const head = readHead(check.slice(0, split))
  if (!head.ok) return head
  const argv = splitArgs(check.slice(split + 3))
  if (!argv.ok) return argv
  const problem = argvRefusal(argv.value)
  if (problem !== undefined) return refuse(problem)
  if (when === undefined) return { ok: true, value: { ...head.value, argv: argv.value } }
  const paths = readConditions(when)
  if (!paths.ok) return paths
  return { ok: true, value: { ...head.value, argv: argv.value, paths: paths.value } }
}

/** Why a check line cannot be read, or undefined when it can (design §6.1.1, every rule but the per-node one of unique names). */
export function checkLineRefusal(line: string): string | undefined {
  const read = readCheckLine(line)
  return read.ok ? undefined : read.reason
}

/** The entry of a readable check line, or undefined. */
export function parseCheckLine(line: string): CheckEntry | undefined {
  const read = readCheckLine(line)
  return read.ok ? read.value : undefined
}

/** The length one item adds to a command line: itself, a separator, and quotes when it holds a space. */
const itemLength = (item: string): number => item.length + 1 + (/[ \t"]/.test(item) ? 2 : 0)

/**
 * Fill `{files}` of an argv from the changed files of one run (relative to
 * the checkout root the run's cwd is). `{files}` becomes one item per file;
 * a name that starts with '-' gets './' in front, so a program does not read
 * it as an option; a path with a newline or NUL is skipped; the whole command
 * line stays under COMMAND_LINE_LIMIT: from the first file that does not fit
 * on, files are dropped and counted in `dropped`. An argv without `{files}`
 * comes back unchanged. Pure.
 */
export function fillCheckArgv(argv: readonly string[], files: readonly string[]): { readonly argv: readonly string[], readonly used: number, readonly dropped: number } {
  const at = argv.indexOf(FILES)
  if (at < 0) return { argv, used: 0, dropped: 0 }
  const before = argv.slice(0, at)
  const after = argv.slice(at + 1)
  let length = [...before, ...after].reduce((sum, item) => sum + itemLength(item), 0)
  const filled: string[] = []
  let dropped = 0
  for (const file of files) {
    if (/[\0\r\n]/.test(file)) continue
    const item = file.startsWith('-') ? `./${file}` : file
    if (dropped > 0 || length + itemLength(item) > COMMAND_LINE_LIMIT) {
      dropped++
      continue
    }
    length += itemLength(item)
    filled.push(item)
  }
  return { argv: [...before, ...filled, ...after], used: filled.length, dropped }
}
