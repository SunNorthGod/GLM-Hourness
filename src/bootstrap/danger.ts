/**
 * Which command texts look like publishing or deploying, and which run
 * until stopped (takeover design 0.6 §6.1, conditions 2 and 3). Pure
 * functions over text: the scan marks every candidate with them, and the
 * trial (B6) runs no command that either one marks.
 *
 * This is the cheap first filter, not a proof: it catches what is visible
 * at a command position (the first word, or the first word after `&&`,
 * `||`, `;`, `|` or a line break) and in script, target and path names. A
 * push hidden inside `node scripts/test.js` is not visible here; the trial's
 * isolation is what covers that (§6.2). Matching ignores case.
 */

/** Programs that act on something outside the machine, whatever their arguments. */
const ALWAYS = new Set([
  'kubectl', 'helm', 'terraform', 'pulumi', 'ansible-playbook', 'aws', 'gcloud', 'az', 'vercel', 'netlify',
  'fly', 'flyctl', 'heroku', 'wrangler', 'serverless', 'sls', 'ssh', 'scp', 'rsync', 'sudo',
])

/** Programs that do so with one of these subcommands. */
const WITH_SUBCOMMAND: Readonly<Record<string, readonly string[]>> = {
  git: ['push', 'tag'],
  npm: ['publish'],
  pnpm: ['publish'],
  yarn: ['publish'],
  bun: ['publish'],
  cargo: ['publish'],
  twine: ['upload'],
  poetry: ['publish'],
  uv: ['publish'],
  gem: ['push'],
  docker: ['push', 'login'],
  gh: ['release', 'pr'],
  firebase: ['deploy'],
}

/** What a download piped into one of these runs. */
const PIPE_SHELLS = new Set(['sh', 'bash', 'pwsh', 'iex'])

/** Words that mark a script name, a make or just target, or a program written as a path. */
const NAME_WORDS = ['deploy', 'release', 'publish', 'upload', 'push', 'ship', 'prod', 'promote', 'rollout'] as const

/** Script names that start something that keeps running. */
const LONG_NAMES = new Set(['dev', 'start', 'serve', 'watch', 'preview', 'storybook'])

/** git options that take the next word as their value. */
const GIT_VALUE_OPTIONS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace'])

interface Segment {
  readonly words: readonly string[]
  /** The operator before this segment: `|` marks a pipe from the segment before. */
  readonly after: '' | '|' | 'other'
}

/** The command positions of a text: one word list per segment, leading `NAME=value` words dropped. */
function segmentsOf(text: string): Segment[] {
  const segments: Segment[] = []
  let after: Segment['after'] = ''
  for (const piece of text.split(/(\|\||&&|;|\||\r?\n)/)) {
    if (piece === '|') {
      after = '|'
      continue
    }
    if (piece === '||' || piece === '&&' || piece === ';' || /^\r?\n$/.test(piece)) {
      after = 'other'
      continue
    }
    const words = wordsOf(piece)
    while (words.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0] ?? '')) words.shift()
    if (words.length > 0) segments.push({ words, after })
    after = 'other'
  }
  return segments
}

/** Whitespace-separated words with simple single and double quotes taken off. */
function wordsOf(text: string): string[] {
  const words: string[] = []
  for (const match of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) words.push(match[1] ?? match[2] ?? match[3] ?? '')
  return words.filter(word => word.length > 0)
}

/** A program's name as compared: the last path segment, lower-case, without its extension. */
function programName(word: string): string {
  const last = word.split(/[/\\]/).pop() ?? word
  return last.toLowerCase().replace(/\.[a-z0-9]+$/, '')
}

const writtenAsPath = (word: string): boolean => /[/\\]/.test(word)

/** The first argument that is not an option (git's value options skip their value too). */
function subcommandOf(program: string, args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (program === 'git' && GIT_VALUE_OPTIONS.has(arg)) {
      index += 1
      continue
    }
    if (!arg.startsWith('-')) return arg.toLowerCase()
  }
  return undefined
}

/** The script or target a package manager, make or just is asked to run at this position, if any. */
function invokedName(program: string, args: readonly string[]): string | undefined {
  const plain = args.filter(arg => !arg.startsWith('-'))
  if (program === 'npm' || program === 'bun') return plain[0] === 'run' || plain[0] === 'run-script' ? plain[1] : undefined
  if (program === 'pnpm' || program === 'yarn') return plain[0] === 'run' || plain[0] === 'run-script' ? plain[1] : plain[0]
  if (program === 'make' || program === 'just') return plain[0]
  return undefined
}

/** The first of the name words that `name` contains, if any. */
function nameWordIn(name: string): string | undefined {
  const lower = name.toLowerCase()
  return NAME_WORDS.find(word => lower.includes(word))
}

/** What marks one text as publishing or deploying: the program, the program and subcommand, `curl | sh`, or the name word. */
function dangerInText(text: string): string | undefined {
  const segments = segmentsOf(text)
  for (const [index, segment] of segments.entries()) {
    const [first = '', ...args] = segment.words
    const program = programName(first)
    if (ALWAYS.has(program)) return program
    const sub = subcommandOf(program, args)
    if (sub !== undefined && WITH_SUBCOMMAND[program]?.includes(sub)) return `${program} ${sub}`
    if (writtenAsPath(first)) {
      const word = nameWordIn(program)
      if (word !== undefined) return word
    }
    const invoked = invokedName(program, args)
    if (invoked !== undefined) {
      const word = nameWordIn(invoked)
      if (word !== undefined) return word
    }
    const next = segments[index + 1]
    if ((program === 'curl' || program === 'wget') && next?.after === '|' && PIPE_SHELLS.has(programName(next.words[0] ?? ''))) {
      return `${program} | ${programName(next.words[0] ?? '')}`
    }
  }
  return undefined
}

/** A candidate's own name (script, target, hook) and the texts its command expands to (§3.3). */
interface CommandContext {
  readonly name?: string
  readonly expanded?: readonly string[]
}

/** What makes the command look like it publishes or deploys (§6.1 condition 2), or undefined. */
export function dangerOf(text: string, context: CommandContext = {}): string | undefined {
  if (context.name !== undefined) {
    const word = nameWordIn(context.name)
    if (word !== undefined) return word
  }
  for (const piece of [text, ...(context.expanded ?? [])]) {
    const found = dangerInText(piece)
    if (found !== undefined) return found
  }
  return undefined
}

const longName = (name: string): boolean => name.toLowerCase().split(/[^a-z0-9]+/).some(token => LONG_NAMES.has(token))

function longInText(text: string): boolean {
  return segmentsOf(text).some(({ words: [first = '', ...args] }) => {
    const program = programName(first)
    if (args.includes('--watch') || args.includes('-w')) return true
    if (program === 'nodemon') return true
    if (program === 'vite' && subcommandOf(program, args) === undefined) return true
    if (program === 'next' && subcommandOf(program, args) === 'dev') return true
    const invoked = invokedName(program, args)
    return invoked !== undefined && longName(invoked)
  })
}

/** Whether the command keeps running until stopped (§6.1 condition 3). */
export function longRunningOf(text: string, context: CommandContext = {}): boolean {
  if (context.name !== undefined && longName(context.name)) return true
  return [text, ...(context.expanded ?? [])].some(longInText)
}
