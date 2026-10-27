/**
 * Quote-aware reading of shell command text for the file-tools-only rule
 * (docs/ORCHESTRATION.md §6.4): which file writes a command line performs,
 * judged only from command positions and real redirections. Text inside
 * quotes, PowerShell here-strings, POSIX here-documents and comments is
 * data, not syntax, so `git commit -m "a -> b"`, `rg "=>"` and
 * `node -e "x >>> 1"` are not writes. Two dialects: PowerShell (the pwsh
 * tool and the ZCode Bash alias over it) and POSIX sh/bash.
 *
 * A write is a redirection into a file (`>`, `>>`, `N>`, `*>`, `&>`, `>|`,
 * `<>`; not a stream merge such as `2>&1` and not a null sink such as
 * `$null` or `/dev/null`), or a file-changing command in command position.
 * Arguments are never commands, so `git rm` and `echo rm` are not writes;
 * the command after `find -exec`, the script of `bash -c` / `pwsh -Command`
 * and every subexpression, command substitution and process substitution
 * are read as commands. What this reader cannot see (a .NET method call,
 * `cmd /c`, an interpreter one-liner) is left to the workspace-change
 * fallback, which records without blocking (src/guard/shadow.ts).
 */

export type ShellDialect = 'pwsh' | 'posix'

/** One file write found in a command line. */
export type ShellWrite =
  | { readonly kind: 'redirect', readonly operator: string, readonly target: string }
  | { readonly kind: 'command', readonly name: string }

interface Word {
  readonly kind: 'word'
  /** The word's value with quotes and escapes removed. */
  readonly text: string
  readonly quoted: boolean
}

interface Redirect {
  readonly kind: 'redirect'
  readonly operator: string
  readonly target: string
  /** False for stream merges, input redirections and null sinks. */
  readonly writes: boolean
}

/** A command separator: pipe, list operator, newline, grouping or block delimiter. */
interface Separator { readonly kind: 'op' }

type Token = Word | Redirect | Separator

const SEPARATOR: Separator = Object.freeze({ kind: 'op' })

/**
 * File-changing commands (the rule's command set, unchanged from the
 * pattern list it replaces): POSIX utilities and PowerShell cmdlets.
 */
const WRITE_COMMANDS: ReadonlySet<string> = new Set([
  'mv', 'cp', 'rm', 'rmdir', 'dd', 'touch', 'truncate', 'tee',
  'set-content', 'add-content', 'clear-content', 'out-file', 'tee-object', 'move-item', 'copy-item', 'remove-item', 'new-item',
])

/** Reserved words after which the next word is still in command position. */
const KEYWORDS: ReadonlySet<string> = new Set(['if', 'then', 'else', 'elif', 'elseif', 'do', 'while', 'until', 'time', '!'])

/** Commands that run their first non-option argument as a command. */
const WRAPPERS: ReadonlySet<string> = new Set(['sudo', 'doas', 'env', 'nohup', 'nice', 'command', 'builtin', 'exec', 'xargs'])

/** `find` actions whose following words are a command. */
const FIND_EXEC: ReadonlySet<string> = new Set(['-exec', '-execdir', '-ok', '-okdir'])

const POSIX_SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
const PWSH_SHELLS: ReadonlySet<string> = new Set(['pwsh', 'powershell'])

/** PowerShell assignment operators: the right-hand side is a pipeline (`$null = New-Item ...`). */
const PWSH_ASSIGN: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=', '??='])

/** Redirection targets that discard output. */
const NULL_SINKS: ReadonlySet<string> = new Set(['$null', '/dev/null', 'nul', 'nul:'])

/** Nesting bound for scripts handed to an inner shell. */
const MAX_DEPTH = 4

/**
 * Split one command line into command lists: the top level first, then one
 * list per subexpression or substitution, each read on its own.
 */
function lex(src: string, dialect: ShellDialect): Token[][] {
  const pwsh = dialect === 'pwsh'
  const escape = pwsh ? '`' : '\\'
  // PowerShell accepts the typographic quotes as quote characters too.
  const singles = pwsh ? '\'\u2018\u2019\u201A\u201B' : '\''
  const doubles = pwsh ? '"\u201C\u201D\u201E' : '"'
  const lists: Token[][] = []
  const heredocs: Array<{ delimiter: string, stripTabs: boolean }> = []
  let out: Token[] = []
  let closer: string | undefined
  let i = 0

  const isBreak = (c: string): boolean => ' \t\r\n|&;()<>'.includes(c) || (pwsh && (c === '{' || c === '}')) || c === closer

  const skipBlanks = (): void => {
    while (src[i] === ' ' || src[i] === '\t') i += 1
  }

  /** Lex a nested command list into a list of its own; `i` is just past its opener. */
  const nested = (close: string): void => {
    const outer = out
    const outerCloser = closer
    out = []
    lists.push(out)
    closer = close
    commands()
    out = outer
    closer = outerCloser
  }

  /** Skip an arithmetic expression `((...))`; `i` is at its first `(`. */
  const skipArithmetic = (): void => {
    let depth = 0
    while (i < src.length) {
      const c = src[i]
      i += 1
      if (c === '(') depth += 1
      else if (c === ')' && --depth === 0) return
    }
  }

  /** Consume the bodies of the here-documents opened on the line that just ended. */
  const readHeredocBodies = (): void => {
    for (const { delimiter, stripTabs } of heredocs.splice(0)) {
      while (i < src.length) {
        const end = src.indexOf('\n', i)
        const line = src.slice(i, end < 0 ? src.length : end).replace(/\r$/, '')
        i = end < 0 ? src.length : end + 1
        if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) break
      }
    }
  }

  const singleQuoted = (): string => {
    i += 1
    let text = ''
    while (i < src.length) {
      const c = src[i]!
      if (singles.includes(c)) {
        // PowerShell doubles a quote to embed it; POSIX single quotes have no escape.
        if (pwsh && src[i + 1] !== undefined && singles.includes(src[i + 1]!)) {
          text += c
          i += 2
          continue
        }
        i += 1
        return text
      }
      text += c
      i += 1
    }
    return text
  }

  const doubleQuoted = (): string => {
    i += 1
    let text = ''
    while (i < src.length) {
      const c = src[i]!
      if (doubles.includes(c)) {
        if (pwsh && src[i + 1] !== undefined && doubles.includes(src[i + 1]!)) {
          text += c
          i += 2
          continue
        }
        i += 1
        return text
      }
      if (c === escape) {
        text += src[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === '$' && src[i + 1] === '(') {
        if (!pwsh && src[i + 2] === '(') {
          i += 1
          skipArithmetic()
        }
        else {
          i += 2
          nested(')')
        }
        text += '$()'
        continue
      }
      if (!pwsh && c === '`') {
        i += 1
        nested('`')
        text += '``'
        continue
      }
      text += c
      i += 1
    }
    return text
  }

  /** PowerShell here-string body; `i` is at `@`, the opener is the rest of its line. */
  const hereString = (): string => {
    const quote = src[i + 1]!
    const closing = singles.includes(quote) ? singles : doubles
    const start = src.indexOf('\n', i) + 1
    let at = start
    while (at > 0 && at < src.length) {
      if (closing.includes(src[at]!) && src[at + 1] === '@') {
        i = at + 2
        return src.slice(start, at).replace(/\r?\n$/, '')
      }
      const next = src.indexOf('\n', at)
      at = next < 0 ? -1 : next + 1
    }
    i = src.length
    return src.slice(start)
  }

  const hereStringOpens = (): boolean => {
    const quote = src[i + 1]
    if (src[i] !== '@' || quote === undefined || !(singles.includes(quote) || doubles.includes(quote))) return false
    return /^[ \t]*\r?\n/.test(src.slice(i + 2, i + 64))
  }

  /** ANSI-C quoting `$'...'`; `i` is at the quote. */
  const ansiQuoted = (): string => {
    i += 1
    let text = ''
    while (i < src.length) {
      const c = src[i]!
      if (c === '\\') {
        text += src[i + 1] ?? ''
        i += 2
        continue
      }
      i += 1
      if (c === '\'') return text
      text += c
    }
    return text
  }

  const readWord = (): Word | undefined => {
    // `@(...)` and `@{...}`: the array subexpression and the hashtable open like `(` and `{`.
    if (pwsh && src[i] === '@' && (src[i + 1] === '(' || src[i + 1] === '{')) {
      i += 1
      return undefined
    }
    let text = ''
    let quoted = false
    let any = false
    while (i < src.length) {
      const c = src[i]!
      if (isBreak(c)) break
      any = true
      if (c === escape) {
        const next = src[i + 1]
        if (next !== undefined && next !== '\n') text += next
        i += next === undefined ? 1 : 2
        continue
      }
      if (pwsh && c === '@' && hereStringOpens()) {
        quoted = true
        text += hereString()
        continue
      }
      if (singles.includes(c)) {
        quoted = true
        text += singleQuoted()
        continue
      }
      if (doubles.includes(c)) {
        quoted = true
        text += doubleQuoted()
        continue
      }
      if (c === '$' && src[i + 1] === '(') {
        if (!pwsh && src[i + 2] === '(') {
          i += 1
          skipArithmetic()
          text += '$(())'
          continue
        }
        i += 2
        nested(')')
        text += '$()'
        continue
      }
      if (c === '$' && src[i + 1] === '{') {
        const end = src.indexOf('}', i + 2)
        const stop = end < 0 ? src.length : end + 1
        text += src.slice(i, stop)
        i = stop
        continue
      }
      if (!pwsh && c === '$' && src[i + 1] === '\'') {
        i += 1
        quoted = true
        text += ansiQuoted()
        continue
      }
      if (!pwsh && c === '`') {
        i += 1
        nested('`')
        text += '``'
        continue
      }
      text += c
      i += 1
    }
    return any ? { kind: 'word', text, quoted } : undefined
  }

  /** One redirection; `i` is at `>` or `<`, after any stream prefix (`2`, `*`, `&`). */
  const redirect = (prefix: string): void => {
    if (src[i] === '<') {
      if (!pwsh) {
        if (src.startsWith('<<<', i)) {
          i += 3
          skipBlanks()
          readWord() // a here-string is input data
          return
        }
        if (src.startsWith('<<', i)) {
          i += 2
          const stripTabs = src[i] === '-'
          if (stripTabs) i += 1
          skipBlanks()
          const delimiter = readWord()
          if (delimiter !== undefined) heredocs.push({ delimiter: delimiter.text, stripTabs })
          return
        }
        if (src[i + 1] === '(') {
          i += 2
          nested(')') // process substitution <(...)
          return
        }
      }
      i += 1
      if (src[i] === '>') {
        i += 1
        skipBlanks()
        const target = readWord()
        out.push({ kind: 'redirect', operator: `${prefix}<>`, target: target?.text ?? '', writes: (target?.text.length ?? 0) > 0 })
        return
      }
      if (src[i] === '&') i += 1
      skipBlanks()
      readWord() // input redirection: not a write
      return
    }
    if (!pwsh && src[i + 1] === '(') {
      i += 2
      nested(')') // process substitution >(...)
      return
    }
    let operator = `${prefix}>`
    i += 1
    if (src[i] === '>') {
      operator += '>'
      i += 1
    }
    if (!pwsh && src[i] === '|') {
      operator += '|'
      i += 1
    }
    if (src[i] === '&') {
      // `>&1` and `>&-` duplicate or close a stream; bash `>&file` writes the file.
      operator += '&'
      i += 1
      skipBlanks()
      const target = readWord()?.text ?? ''
      out.push({ kind: 'redirect', operator, target, writes: target.length > 0 && !/^(?:\d+|-)$/.test(target) })
      return
    }
    skipBlanks()
    const target = readWord()?.text ?? ''
    out.push({ kind: 'redirect', operator, target, writes: target.length > 0 && !NULL_SINKS.has(target.toLowerCase()) })
  }

  const commands = (): void => {
    while (i < src.length) {
      const c = src[i]!
      if (c === closer) {
        i += 1
        return
      }
      if (c === ' ' || c === '\t' || c === '\r') {
        i += 1
        continue
      }
      if (c === escape && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
        i += src[i + 1] === '\r' ? 3 : 2 // line continuation
        continue
      }
      if (c === '\n') {
        i += 1
        out.push(SEPARATOR)
        readHeredocBodies()
        continue
      }
      if (c === '#') {
        const end = src.indexOf('\n', i)
        i = end < 0 ? src.length : end
        continue
      }
      if (pwsh && c === '<' && src[i + 1] === '#') {
        const end = src.indexOf('#>', i + 2)
        i = end < 0 ? src.length : end + 2
        continue
      }
      if (c === ';' || c === '|') {
        i += 1
        if (src[i] === c || (!pwsh && c === '|' && src[i] === '&')) i += 1
        out.push(SEPARATOR)
        continue
      }
      if (c === '&') {
        if (!pwsh && src[i + 1] === '>') {
          i += 1
          redirect('&')
          continue
        }
        i += src[i + 1] === '&' ? 2 : 1
        out.push(SEPARATOR) // POSIX background or list, PowerShell call operator: a command follows
        continue
      }
      if (c === '(') {
        if (!pwsh && src[i + 1] === '(') {
          skipArithmetic()
          continue
        }
        i += 1
        out.push(SEPARATOR)
        continue
      }
      if (c === ')' || (pwsh && (c === '{' || c === '}'))) {
        i += 1
        out.push(SEPARATOR)
        continue
      }
      if (c === '>' || c === '<') {
        redirect('')
        continue
      }
      const stream = /^(?:\d+|\*)(?=>)/.exec(src.slice(i, i + 12))
      if (stream !== null && (pwsh || stream[0] !== '*')) {
        i += stream[0].length
        redirect(stream[0])
        continue
      }
      const before = i
      const word = readWord()
      if (word !== undefined) out.push(word)
      else if (i === before) i += 1 // never stall on an unread character
    }
  }

  lists.push(out)
  commands()
  return lists
}

/** The command a word names: its last path segment, lower case, without `.exe`. */
function commandName(text: string): string {
  const base = text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1).toLowerCase()
  return base.endsWith('.exe') ? base.slice(0, -4) : base
}

/** sed's in-place flag: `-i`, `-i.bak`, a short-option cluster with `i`, or `--in-place`. */
function inPlace(text: string): boolean {
  return text === '--in-place' || text.startsWith('--in-place=') || /^-[^-]*i/.test(text)
}

/** The script an inner shell runs: `bash -c <script>`, `pwsh -Command <rest>`. */
function scriptOf(name: string, args: readonly Word[]): { text: string, dialect: ShellDialect } | undefined {
  if (POSIX_SHELLS.has(name)) {
    const at = args.findIndex(arg => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg.text))
    const script = at < 0 ? undefined : args[at + 1]
    return script === undefined ? undefined : { text: script.text, dialect: 'posix' }
  }
  if (PWSH_SHELLS.has(name)) {
    const at = args.findIndex(arg => /^-(?:c|command)$/i.test(arg.text))
    const rest = at < 0 ? [] : args.slice(at + 1)
    return rest.length === 0 ? undefined : { text: rest.map(arg => arg.text).join(' '), dialect: 'pwsh' }
  }
  return undefined
}

/** Judge one simple command: its words between separators. */
function inspect(words: readonly Word[], dialect: ShellDialect, depth: number, found: ShellWrite[]): void {
  let k = 0
  while (k < words.length) {
    const word = words[k]!
    if (!word.quoted && dialect === 'posix' && /^[A-Za-z_]\w*=/.test(word.text)) {
      k += 1 // variable assignment prefix
      continue
    }
    if (!word.quoted && KEYWORDS.has(word.text.toLowerCase())) {
      k += 1
      continue
    }
    if (WRAPPERS.has(commandName(word.text))) {
      k += 1
      while (k < words.length && words[k]!.text.startsWith('-')) k += 1
      continue
    }
    break
  }
  const command = words[k]
  if (command === undefined) return
  const name = commandName(command.text)
  const args = words.slice(k + 1)
  if (WRITE_COMMANDS.has(name)) found.push({ kind: 'command', name: command.text })
  else if (name === 'sed') {
    const flag = args.find(arg => inPlace(arg.text))
    if (flag !== undefined) found.push({ kind: 'command', name: `${command.text} ${flag.text}` })
  }
  if (depth >= MAX_DEPTH) return
  if (name === 'find') {
    const at = args.findIndex(arg => FIND_EXEC.has(arg.text))
    if (at >= 0) inspect(args.slice(at + 1), dialect, depth + 1, found)
  }
  const script = scriptOf(name, args)
  if (script !== undefined) collect(script.text, script.dialect, depth + 1, found)
}

/** Group one command list into simple commands and judge each; redirections are judged where they stand. */
function analyze(tokens: readonly Token[], dialect: ShellDialect, depth: number, found: ShellWrite[]): void {
  let words: Word[] = []
  const flush = (): void => {
    inspect(words, dialect, depth, found)
    words = []
  }
  for (const token of tokens) {
    if (token.kind === 'op') {
      flush()
      continue
    }
    if (token.kind === 'redirect') {
      if (token.writes) found.push({ kind: 'redirect', operator: token.operator, target: token.target })
      continue
    }
    if (!token.quoted && (dialect === 'posix' ? token.text === '{' || token.text === '}' : PWSH_ASSIGN.has(token.text))) {
      flush() // POSIX group braces; a PowerShell assignment's right-hand side starts a pipeline
      continue
    }
    if (dialect === 'pwsh' && !token.quoted && words.length === 0 && token.text.startsWith('$') && token.text.indexOf('=') > 0) {
      const rest = token.text.slice(token.text.indexOf('=') + 1) // `$x=Remove-Item a`
      if (rest.length > 0) words.push({ kind: 'word', text: rest, quoted: false })
      continue
    }
    words.push(token)
  }
  flush()
}

function collect(command: string, dialect: ShellDialect, depth: number, found: ShellWrite[]): void {
  for (const list of lex(command, dialect)) analyze(list, dialect, depth, found)
}

/**
 * The file writes one command line performs in one dialect, in source order
 * of the command lists (top level first, then nested lists).
 */
export function shellWrites(command: string, dialect: ShellDialect): readonly ShellWrite[] {
  const found: ShellWrite[] = []
  collect(command, dialect, 0, found)
  return found
}

/** A short description of one write for the corrective message and the journal. */
export function describeWrite(write: ShellWrite): string {
  return write.kind === 'redirect' ? `redirection ${write.operator} ${write.target}` : `${write.name} command`
}
