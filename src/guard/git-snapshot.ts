/**
 * Git for the main agent (docs/ORCHESTRATION.md §6.1, decision
 * d-main-agent-shell): the main agent may run any git command; a command that
 * can lose uncommitted work or rewrite history runs after the harness has
 * saved a copy it can restore, and a command that would send those copies off
 * the machine is refused. Git is not a file write for the guard, so
 * main-agent-no-write does not stop it.
 *
 * Three parts. Recognition reads the command text without starting a process:
 * `gitInvocations` finds the git calls of a shell line (the directory each
 * runs in, its subcommand and arguments), `gitRisk` says whether one can
 * discard work, rewrite history or both, `cleanRefusal` finds the clean
 * flags that delete what no snapshot keeps. The snapshot, `takeSnapshot`,
 * runs git itself, by `execFile` and never through a shell: the changed
 * tracked files (`git stash create`, or a temporary index when a merge is
 * unresolved), the untracked files a command would delete or overwrite, the
 * old values of the refs it moves, all hung on one commit under
 * `refs/hourness/snapshots/<id>`; history that would become unreachable also
 * gets a tag `hourness-snapshot/<id>` on a commit with an empty tree. Files
 * git ignores (`.env`, `node_modules/`) are never saved. The journal line goes
 * to `<project root>/.llm/snapshots.jsonl`, found with `projectOf`; the
 * temporary index lives in the system temporary directory and is deleted
 * after the call, so nothing is written into the git directory but the
 * refs. `guardGit` puts the parts together for one shell call.
 *
 * A snapshot that cannot be made refuses the command: letting it run would
 * lose what the snapshot was meant to keep. Git missing is the one failure
 * that lets the command through (the harness has nothing to run), and the
 * caller reports it. `gitInvocations`, `takeSnapshot` and `gitRisk` are
 * shaped to be called for a worker's git as well (M7 adds `export` where it
 * needs more, the behaviour stays).
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ensureIgnored, projectOf } from '../data/project-root.ts'
import type { GitResult } from '../execute/git.ts'
import type { Correction } from './rules.ts'
import { commandName, simpleCommands, type ShellDialect } from './shell.ts'

// ---------------------------------------------------------------------------
// Recognition

export type GitRisk = 'discard' | 'history' | 'both'

/** One git call found in a shell line. */
export interface GitInvocation {
  /** The directory git runs in, after `cd` and `-C`; undefined when a path that is not a literal hides it. */
  readonly dir: string | undefined
  /** `--git-dir=…`, `--work-tree=…` and `--namespace=…` as written, passed on to the snapshot's own git calls. */
  readonly repoOptions: readonly string[]
  /** `-c key=value` pairs. */
  readonly configs: readonly string[]
  readonly sub: string
  readonly args: readonly string[]
  /** An option before the subcommand that this reader does not know: it cannot tell the subcommand. */
  readonly unknownGlobal: boolean
}

/** Directory changes whose literal target moves the directory the following git calls run in. */
const MOVES: ReadonlySet<string> = new Set(['cd', 'set-location', 'sl', 'chdir', 'pushd'])
/** `popd` and the like: the directory afterwards is not in the text. */
const LOSES_DIRECTORY: ReadonlySet<string> = new Set(['popd'])

/** Global options of git without a value. */
const GLOBAL_FLAGS: ReadonlySet<string> = new Set([
  '--no-pager', '-p', '-P', '--paginate', '--bare', '--no-replace-objects', '--literal-pathspecs', '--no-optional-locks',
  '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--no-lazy-fetch', '--no-advice',
])

/** A word with no variable, environment reference or command substitution in it. */
const isLiteral = (text: string): boolean => !/[$%`]/.test(text)

function pathFrom(dir: string | undefined, target: string | undefined): string | undefined {
  if (target === undefined || target === '-' || target === '' || target.startsWith('~') || !isLiteral(target)) return undefined
  if (dir === undefined && !isAbsolute(target)) return undefined
  return dir === undefined ? resolve(target) : resolve(dir, target)
}

function parseGit(words: readonly string[], start: string | undefined): GitInvocation {
  let dir = start
  const repoOptions: string[] = []
  const configs: string[] = []
  let unknownGlobal = false
  let at = 0
  for (; at < words.length; at++) {
    const word = words[at] ?? ''
    if (word === '-C') dir = pathFrom(dir, words[++at])
    else if (word === '-c') configs.push(words[++at] ?? '')
    else if (/^--(?:git-dir|work-tree|namespace)=/.test(word)) repoOptions.push(word)
    else if (word === '--git-dir' || word === '--work-tree' || word === '--namespace') repoOptions.push(`${word}=${words[++at] ?? ''}`)
    else if (GLOBAL_FLAGS.has(word)) continue
    else if (word.startsWith('-')) unknownGlobal = true
    else break
  }
  return { dir, repoOptions, configs, sub: words[at] ?? '', args: words.slice(at + 1), unknownGlobal }
}

/**
 * Every git call in a shell line, in source order. `base` is the session's
 * working directory; a `cd`, `Set-Location`, `sl`, `chdir` or `pushd` with a
 * literal target before a git call moves the directory that call runs in,
 * and `-C <path>` moves it further. A target that is not a literal leaves the
 * directory unknown (`dir` undefined), because no process can be started
 * in a place the text does not name.
 */
export function gitInvocations(command: string, dialect: ShellDialect, base: string | undefined): GitInvocation[] {
  let dir = base
  const found: GitInvocation[] = []
  for (const words of simpleCommands(command, dialect)) {
    const name = commandName(words[0] ?? '')
    if (MOVES.has(name)) dir = pathFrom(dir, words.slice(1).find(word => word === '-' || !word.startsWith('-')))
    else if (LOSES_DIRECTORY.has(name)) dir = undefined
    else if (name === 'git') found.push(parseGit(words.slice(1), dir))
  }
  return found
}

/** The options of a git command line, split the way the risk table reads them. */
interface Flags {
  /** Long options, without a `=value`. */
  readonly long: ReadonlySet<string>
  /** Short option letters, counted. */
  readonly short: ReadonlyMap<string, number>
  readonly positional: readonly string[]
  /** The words after `--`; undefined when there is no `--`. */
  readonly paths: readonly string[] | undefined
  /** The values of the options named in `valued`. */
  readonly values: ReadonlyMap<string, readonly string[]>
}

/** Read the options of `args`; `valued` names the options (`-s`, `--source`) that take a value, which is not a positional. */
function flagsOf(args: readonly string[], valued: readonly string[] = []): Flags {
  const long = new Set<string>()
  const short = new Map<string, number>()
  const positional: string[] = []
  const values = new Map<string, string[]>()
  let paths: string[] | undefined
  const take = (option: string, value: string | undefined): void => {
    if (value !== undefined) values.set(option, [...values.get(option) ?? [], value])
  }
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? ''
    if (paths !== undefined) paths.push(arg)
    else if (arg === '--') paths = []
    else if (arg.startsWith('--')) {
      const equals = arg.indexOf('=')
      const name = equals < 0 ? arg : arg.slice(0, equals)
      long.add(name)
      if (valued.includes(name)) take(name, equals < 0 ? args[++at] : arg.slice(equals + 1))
    }
    else if (arg.length > 1 && arg.startsWith('-')) {
      for (const letter of arg.slice(1)) short.set(letter, (short.get(letter) ?? 0) + 1)
      const last = `-${arg.at(-1)}`
      if (valued.includes(last)) take(last, args[++at])
    }
    else positional.push(arg)
  }
  return { long, short, positional, paths, values }
}

const hasLong = (flags: Flags, ...names: string[]): boolean => names.some(name => flags.long.has(name))
const hasShort = (flags: Flags, letters: string): boolean => [...letters].some(letter => flags.short.has(letter))

const PUSH_VALUED = ['-o', '--push-option', '--repo', '--receive-pack', '--exec']
const CLEAN_VALUED = ['-e', '--exclude']

/** Subcommands that never lose work (or only by a flag this table reads) and need no alias lookup. */
const SAFE: ReadonlySet<string> = new Set([
  'status', 'log', 'diff', 'show', 'blame', 'grep', 'fetch', 'add', 'commit', 'init', 'clone', 'ls-files', 'ls-tree', 'ls-remote',
  'rev-parse', 'rev-list', 'describe', 'shortlog', 'config', 'remote', 'notes', 'bisect', 'branch', 'tag', 'merge', 'pull',
  'cherry-pick', 'revert', 'am', 'stash', 'worktree', 'show-ref', 'for-each-ref', 'symbolic-ref', 'merge-base', 'cat-file',
  'diff-tree', 'diff-index', 'diff-files', 'name-rev', 'whatchanged', 'reflog', 'help', 'version', 'var', 'check-ignore',
  'format-patch', 'mv', 'submodule', 'sparse-checkout', 'maintenance', 'count-objects', 'fsck', 'archive', 'bundle', 'stage',
  'hash-object', 'write-tree', 'commit-tree', 'mktree', 'rerere', 'range-diff', 'cherry', 'verify-commit', 'verify-tag',
])

/** What each subcommand with a risky form can cost under any arguments: used when the arguments are not literal. */
const POSSIBLE: ReadonlyMap<string, GitRisk> = new Map<string, GitRisk>([
  ['checkout', 'discard'], ['switch', 'discard'], ['restore', 'discard'], ['clean', 'discard'], ['rm', 'discard'], ['read-tree', 'discard'],
  ['merge', 'discard'], ['cherry-pick', 'discard'], ['revert', 'discard'], ['am', 'discard'], ['worktree', 'discard'],
  ['reset', 'both'], ['stash', 'both'], ['rebase', 'both'],
  ['commit', 'history'], ['branch', 'history'], ['tag', 'history'], ['update-ref', 'history'], ['push', 'history'], ['filter-branch', 'history'],
  ['filter-repo', 'history'], ['replace', 'history'], ['reflog', 'history'], ['gc', 'history'], ['prune', 'history'], ['remote', 'history'],
])

function merge(a: GitRisk | undefined, b: GitRisk | undefined): GitRisk | undefined {
  if (a === undefined || b === undefined) return a ?? b
  return a === b ? a : 'both'
}

/** The risk of the arguments as written, assuming they are literals. */
function exactRisk(sub: string, args: readonly string[]): GitRisk | undefined {
  const flags = flagsOf(args, sub === 'push' ? PUSH_VALUED : sub === 'clean' ? CLEAN_VALUED : [])
  switch (sub) {
    case 'checkout': case 'switch': case 'restore':
      return 'discard'
    case 'reset':
      return hasLong(flags, '--hard', '--merge', '--keep') ? 'both' : 'history'
    case 'clean':
      return hasLong(flags, '--dry-run') || hasShort(flags, 'n') ? undefined : 'discard'
    case 'stash':
      return ['drop', 'clear'].includes(flags.positional[0] ?? '') ? 'both' : undefined
    case 'rm':
      return hasLong(flags, '--force') || hasShort(flags, 'f') ? 'discard' : undefined
    case 'rebase':
      return hasLong(flags, '--abort') ? 'discard' : 'history'
    case 'merge': case 'cherry-pick': case 'revert': case 'am':
      return hasLong(flags, '--abort') ? 'discard' : undefined
    case 'read-tree':
      return hasShort(flags, 'u') ? 'discard' : undefined
    case 'worktree':
      return flags.positional[0] === 'remove' ? 'discard' : undefined
    case 'commit':
      return hasLong(flags, '--amend') ? 'history' : undefined
    case 'branch':
      return hasLong(flags, '--delete', '--move', '--force') || hasShort(flags, 'DdMmCf') ? 'history' : undefined
    case 'tag':
      return hasLong(flags, '--delete', '--force') || hasShort(flags, 'df') ? 'history' : undefined
    case 'push':
      return hasLong(flags, '--force', '--force-with-lease', '--force-if-includes', '--delete', '--prune') || hasShort(flags, 'fd') || flags.positional.slice(1).some(spec => spec.startsWith('+') || spec.startsWith(':')) ? 'history' : undefined
    case 'update-ref': case 'filter-branch': case 'filter-repo': case 'replace': case 'prune':
      return 'history'
    case 'reflog':
      return ['expire', 'delete'].includes(flags.positional[0] ?? '') ? 'history' : undefined
    case 'gc':
      return hasLong(flags, '--prune') ? 'history' : undefined
    case 'remote':
      return ['remove', 'rm'].includes(flags.positional[0] ?? '') ? 'history' : undefined
    default:
      return undefined
  }
}

/**
 * What a git subcommand with these arguments can lose: `discard` (uncommitted
 * work in the working tree or the index), `history` (commits only a moved or
 * deleted ref reaches) or both; undefined when it loses nothing or the
 * subcommand is not in the table (see `isKnownSubcommand`). A word with a
 * variable or command substitution in it may hide an option, so the call is
 * judged by everything its subcommand can do.
 */
export function gitRisk(sub: string, args: readonly string[]): GitRisk | undefined {
  if (!isLiteral(sub)) return 'both'
  const exact = exactRisk(sub, args)
  return args.every(isLiteral) ? exact : merge(exact, POSSIBLE.get(sub))
}

/** Whether the table knows the subcommand: a name it does not know may be an alias. */
function isKnownSubcommand(sub: string): boolean {
  return SAFE.has(sub) || POSSIBLE.has(sub)
}

// ---------------------------------------------------------------------------
// Refusals

/** Why a git call is refused. The first group: no snapshot could be made. The second: the command would do what no snapshot makes good. */
type RefusalCode =
  | 'git-failed' | 'timeout' | 'too-big' | 'remote-unreachable' | 'cd-unknown' | 'ignored-in-way' | 'list-mismatch'
  | 'snapshots-off-machine' | 'ignored-files' | 'nested-repos' | 'unreadable'

export interface Refusal {
  readonly code: RefusalCode
  readonly reason: string
  /** Files the refusal is about (the ignored files in the way). */
  readonly paths?: readonly string[]
}

const refuse = (code: RefusalCode, reason: string, paths?: readonly string[]): Refusal => ({ code, reason, ...paths === undefined ? {} : { paths } })

const OUTBOUND_FACTS: Partial<Record<RefusalCode, string>> = {
  'snapshots-off-machine': 'push the harness\'s snapshots off this machine',
  'ignored-files': 'delete ignored files the snapshot does not keep',
  'nested-repos': 'delete nested repositories',
}

const RIGHT_PATH: Record<RefusalCode, (refusal: Refusal, limits: Limits) => string> = {
  'git-failed': () => 'Retry; if it fails again, tell the human the reason',
  'timeout': () => 'Retry; if it fails again, tell the human the reason',
  'list-mismatch': () => 'Retry; if it fails again, tell the human the reason',
  'too-big': (_, limits) => `Narrow the command (fewer paths) so it removes less than ${limits.maxBytes / (1024 * 1024)} MB and ${limits.maxFiles.toLocaleString('en-US')} files`,
  'remote-unreachable': () => 'Retry when the remote is reachable',
  'cd-unknown': () => 'Run git with -C <literal path>',
  'ignored-in-way': refusal => `Tell the human which ignored files are in the way: ${(refusal.paths ?? []).slice(0, 5).join(', ')}; they can move them`,
  'snapshots-off-machine': () => 'Push branches and tags by name; snapshot refs stay on this machine.',
  'ignored-files': () => 'Run git clean without -x or -X; ignored files stay.',
  'nested-repos': () => 'Run git clean with a single -f; nested repositories stay.',
  'unreadable': () => 'Write the remote, branch and tag names out in the command, without variables.',
}

/** The four-part correction of a refused git call (rule `git-snapshot`). */
export function snapshotCorrection(command: string, refusal: Refusal, limits: Limits = DEFAULT_LIMITS): Correction {
  const outbound = OUTBOUND_FACTS[refusal.code]
  return {
    fact: refusal.code === 'unreadable'
      ? `The harness could not check what "${command}" sends away: ${refusal.reason}.`
      : outbound === undefined ? `The harness could not save a snapshot before "${command}": ${refusal.reason}.` : `"${command}" would ${outbound}.`,
    violation: 'Git commands that can lose uncommitted work or rewrite history run after the harness has saved a copy it can restore; the copies stay on this machine.',
    rightPath: RIGHT_PATH[refusal.code](refusal, limits),
    exception: 'The human can run the command in their own terminal.',
  }
}

/** The clean flags that delete what no snapshot keeps: ignored files (`-x`, `-X`) and nested repositories (`-f` twice). */
function cleanRefusal(invocation: GitInvocation): Refusal | undefined {
  if (invocation.sub !== 'clean') return undefined
  const flags = flagsOf(invocation.args, CLEAN_VALUED)
  if (hasLong(flags, '--dry-run') || hasShort(flags, 'n')) return undefined
  if (hasShort(flags, 'xX')) return refuse('ignored-files', 'git clean -x or -X deletes ignored files')
  const forced = (flags.short.get('f') ?? 0) + (invocation.args.filter(arg => arg === '--force').length)
  return forced >= 2 ? refuse('nested-repos', 'git clean with -f twice deletes nested repositories') : undefined
}

/** Whether a git call is a `git clean` that deletes ignored files (`-x` or `-X`) and is not a dry run: the metrics row's rule counts it as a delete (metrics design §5.3). */
export function cleansIgnored(invocation: GitInvocation): boolean {
  return cleanRefusal(invocation)?.code === 'ignored-files'
}

// ---------------------------------------------------------------------------
// Process, environment, limits

export interface Limits {
  readonly maxBytes: number
  readonly maxFiles: number
}

const DEFAULT_LIMITS: Limits = { maxBytes: 200 * 1024 * 1024, maxFiles: 20_000 }

interface SnapshotRun {
  readonly env?: Readonly<Record<string, string>>
  readonly timeoutMs: number
  /** Written to the standard input of git, which is then closed. */
  readonly input?: string
}

/** Runs git in a directory and reports how it ended; never throws. */
export type SnapshotRunner = (cwd: string, args: readonly string[], run: SnapshotRun) => Promise<GitResult>

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024

/**
 * git by `execFile`: the arguments are an array, no shell reads them.
 * Output does not change with the language of the machine, git never stops
 * to ask for a password, and the snapshot's commits carry a fixed author so
 * a machine without a git identity can still make them. (The runner of
 * src/execute/git.ts has no environment parameter, and the temporary index
 * needs GIT_INDEX_FILE.)
 */
const execGit: SnapshotRunner = (cwd, args, run) => new Promise((done) => {
  const child = execFile('git', ['--no-optional-locks', ...args], {
    cwd,
    timeout: run.timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      LC_ALL: 'C',
      LANGUAGE: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'glm-hourness',
      GIT_AUTHOR_EMAIL: 'glm-hourness@localhost',
      GIT_COMMITTER_NAME: 'glm-hourness',
      GIT_COMMITTER_EMAIL: 'glm-hourness@localhost',
      ...run.env,
    },
  }, (error, stdout, stderr) => {
    if (error === null) return done({ code: 0, stdout, stderr })
    if (typeof error.code === 'number') return done({ code: error.code, stdout, stderr })
    const problem = error.code === 'ENOENT' ? 'missing' : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'overflow' : error.killed ? 'timeout' : 'failed'
    done({ code: undefined, stdout, stderr: stderr === '' ? error.message : stderr, problem })
  })
  // A git that exits before it reads its input closes the pipe; that is not an error of ours.
  child.stdin?.on('error', () => undefined)
  child.stdin?.end(run.input)
})

/** What the snapshot needs from the machine; tests replace the parts they need to control. */
export interface SnapshotEnvironment extends Limits {
  readonly run: SnapshotRunner
  readonly now: () => Date
  readonly randomHex: () => string
  readonly tempRoot: () => string
  /** The whole snapshot of one call must be done in this many milliseconds. */
  readonly deadlineMs: number
}

export const realSnapshotEnvironment: SnapshotEnvironment = {
  ...DEFAULT_LIMITS,
  run: execGit,
  now: () => new Date(),
  randomHex: () => randomBytes(2).toString('hex'),
  tempRoot: () => tmpdir(),
  deadlineMs: 30_000,
}

/** Git is not installed (or not on the path): there is nothing to run, the call goes through and the caller reports it. */
class GitMissing extends Error {}

class SnapshotFailure extends Error {
  readonly refusal: Refusal
  constructor(refusal: Refusal) {
    super(refusal.reason)
    this.refusal = refusal
  }
}

const describe = (args: readonly string[], result: GitResult): string => {
  const sub = args.find(arg => !arg.startsWith('-')) ?? 'git'
  switch (result.problem) {
    case 'timeout': return `git ${sub} timed out`
    case 'overflow': return `git ${sub} printed too much`
    case 'failed': return `git ${sub} could not run: ${result.stderr.trim()}`
    default: return `git ${sub} exited ${result.code}: ${result.stderr.trim().split(/\r?\n/).slice(-2).join(' | ')}`
  }
}

/** One git call of a snapshot: runs in `cwd`, ends the snapshot with a refusal when it fails. */
interface GitCall {
  /** The result of git; a failure other than the codes in `allow` ends the snapshot. */
  (cwd: string, args: readonly string[], options?: { readonly env?: Readonly<Record<string, string>>, readonly allow?: readonly number[], readonly input?: string }): Promise<GitResult>
}

function gitCaller(env: SnapshotEnvironment): GitCall {
  const deadline = env.now().getTime() + env.deadlineMs
  return async (cwd, args, options = {}) => {
    const remaining = deadline - env.now().getTime()
    if (remaining <= 0) throw new SnapshotFailure(refuse('timeout', `the snapshot took longer than ${env.deadlineMs / 1000} seconds`))
    const result = await env.run(cwd, args, { timeoutMs: remaining, ...options.env === undefined ? {} : { env: options.env }, ...options.input === undefined ? {} : { input: options.input } })
    if (result.problem === 'missing') throw new GitMissing('git is not installed')
    if (result.problem === 'timeout') throw new SnapshotFailure(refuse('timeout', describe(args, result)))
    if (result.code === 0 || (result.code !== undefined && options.allow?.includes(result.code) === true)) return result
    throw new SnapshotFailure(refuse('git-failed', describe(args, result)))
  }
}

const lines = (text: string): string[] => text.split(/\r?\n/).filter(line => line !== '')
const nulls = (text: string): string[] => text.split('\0').filter(entry => entry !== '')
const first = (text: string): string | undefined => lines(text)[0]?.trim()

/**
 * A temporary index in a directory of the system temporary directory (never
 * in the git directory): `GIT_INDEX_FILE` points into it, and the directory
 * is deleted when the body ends, whether it returned or threw. A process
 * that is killed leaves the directory with only an index file in it.
 */
async function tempIndex<T>(env: SnapshotEnvironment, body: (indexEnv: Readonly<Record<string, string>>, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(env.tempRoot(), 'glm-hourness-snap-index-'))
  try {
    return await body({ GIT_INDEX_FILE: join(dir, 'index') }, dir)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// The journal line

export interface SnapshotEntry {
  readonly id: string
  readonly at: string
  readonly sessionId?: string
  readonly agentId?: string
  readonly command: string
  readonly subcommand: string
  readonly risk: GitRisk
  /** The git common directory of the repository the snapshot is of. */
  readonly repo: string
  /** Whether the project root came from the session's directory or, for lack of one, from the repository. */
  readonly rootFrom: 'session' | 'repo'
  /** `refs/hourness/snapshots/<id>`; absent on a line that only records what a deleted work tree held (`skipped`). */
  readonly ref?: string
  readonly tag?: string
  /** The commit K_h the tag points at. */
  readonly history?: string
  readonly head: { readonly sha?: string, readonly branch?: string }
  readonly stash?: string
  readonly worktree?: string
  readonly files?: { readonly tree: string, readonly count: number, readonly inTheWay?: number, readonly cleaned?: number, readonly worktree?: number }
  readonly ignored?: { readonly paths: readonly string[], readonly count: number, readonly bytes?: number, readonly bytesAtLeast?: number }
  readonly refs: readonly { readonly name: string, readonly sha: string }[]
  readonly moved: readonly string[]
  readonly remote?: readonly { readonly remote: string, readonly branch: string, readonly ref: string }[]
  readonly restore: readonly string[]
  readonly skipped?: 'nothing-to-keep'
}

const SNAPSHOT_JOURNAL = join('.llm', 'snapshots.jsonl')

/** The project root the journal goes to: the session's, else the snapshotted repository's; undefined when neither has a `.git`. */
function journalRoot(sessionDir: string | undefined, toplevel: string): { readonly root: string, readonly from: 'session' | 'repo' } | undefined {
  const session = sessionDir === undefined ? undefined : projectOf(sessionDir)
  if (session?.git === true) return { root: session.root, from: 'session' }
  const repo = projectOf(toplevel)
  return repo?.git === true ? { root: repo.root, from: 'repo' } : undefined
}

/** Append one line to the journal, making `.llm/` and the `.llm/.gitignore` that keeps it out of `git clean` and `git status` first. */
async function writeJournal(root: string, entry: SnapshotEntry): Promise<void> {
  const dir = join(root, '.llm')
  await mkdir(dir, { recursive: true })
  try {
    await writeFile(join(dir, '.gitignore'), '*\n', { flag: 'wx' })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  await appendFile(join(root, SNAPSHOT_JOURNAL), `${JSON.stringify(entry)}\n`)
}

/** The object ids the journal ever recorded as the snapshot's own (stash, working tree, files tree, history commit). */
async function journalShas(root: string | undefined): Promise<string[]> {
  if (root === undefined) return []
  let text: string
  try {
    text = await readFile(join(root, SNAPSHOT_JOURNAL), 'utf8')
  }
  catch {
    return []
  }
  const shas: string[] = []
  for (const line of lines(text)) {
    try {
      const entry = JSON.parse(line) as Partial<SnapshotEntry>
      for (const sha of [entry.stash, entry.worktree, entry.files?.tree, entry.history]) if (typeof sha === 'string') shas.push(sha)
    }
    catch {
      // A line that is not JSON names nothing.
    }
  }
  return shas
}

// ---------------------------------------------------------------------------
// Outbound check

/** The refs a refspec source with `*` names among `refs`: git's `*` matches any run of characters. */
function wildcardMatches(pattern: string, refs: readonly string[]): string[] {
  const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`)
  return refs.filter(ref => regex.test(ref))
}

const SNAPSHOT_REF = /^refs\/(?:hourness\/|tags\/hourness-snapshot\/)/
const REMOTE_COPY = /^refs\/hourness\/snapshots\/[^/]+\/remote\//

/** The sources of the refspecs a push names; `tag <name>` is the refspec `refs/tags/<name>`. */
function pushSources(refspecs: readonly string[]): string[] {
  const sources: string[] = []
  for (let at = 0; at < refspecs.length; at++) {
    const spec = refspecs[at] ?? ''
    if (spec === 'tag' && refspecs[at + 1] !== undefined) {
      sources.push(`refs/tags/${refspecs[++at]}`)
      continue
    }
    const source = spec.replace(/^\+/, '').split(':')[0] ?? ''
    if (source !== '') sources.push(source)
  }
  return sources
}

/** The snapshot refs the repository holds (the copies of what a remote had are not among them) and the object ids that are the snapshots' own. */
async function snapshotRefs(call: GitCall, dir: string, repoOptions: readonly string[], root: string | undefined): Promise<{ readonly names: string[], readonly shas: Set<string> }> {
  const listed = await call(dir, [...repoOptions, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/hourness/snapshots/', 'refs/tags/hourness-snapshot/'])
  const own = lines(listed.stdout).filter(line => !REMOTE_COPY.test(line)).map(line => line.split(' '))
  const shas = new Set(own.map(([, sha]) => sha ?? ''))
  for (const sha of await journalShas(root)) shas.add(sha)
  return { names: own.map(([name]) => name ?? ''), shas }
}

async function remoteOf(call: GitCall, dir: string, repoOptions: readonly string[], named: string | undefined): Promise<string> {
  if (named !== undefined) return named
  const branch = first((await call(dir, [...repoOptions, 'symbolic-ref', '-q', '--short', 'HEAD'], { allow: [1] })).stdout)
  const keys = [...branch === undefined ? [] : [`branch.${branch}.pushRemote`], 'remote.pushDefault', ...branch === undefined ? [] : [`branch.${branch}.remote`]]
  for (const key of keys) {
    const value = first((await call(dir, [...repoOptions, 'config', '--get', key], { allow: [1] })).stdout)
    if (value !== undefined) return value
  }
  return 'origin'
}

/** The refusals no snapshot answers: what a push would send, and the clean flags; undefined when the call sends nothing of ours away. */
async function outboundRefusal(invocation: GitInvocation, env: SnapshotEnvironment, root: string | undefined): Promise<Refusal | undefined> {
  const clean = cleanRefusal(invocation)
  if (clean !== undefined || invocation.sub !== 'push') return clean
  const flags = flagsOf(invocation.args, PUSH_VALUED)
  if (hasLong(flags, '--mirror')) return refuse('snapshots-off-machine', 'git push --mirror sends every ref')
  if (invocation.dir === undefined) return refuse('cd-unknown', 'the directory the push runs in is not in the command')
  if (!invocation.args.every(isLiteral)) return refuse('unreadable', 'the remote or a refspec is hidden behind a variable')
  const dir = invocation.dir
  // The reads see what the command's git would see: the `-c` pairs of the command line are config to it, as the snapshot's own calls read them (prefixOf).
  const options = [...invocation.repoOptions, ...invocation.configs.flatMap(pair => ['-c', pair])]
  const call = gitCaller(env)
  const [named, ...specs] = flags.positional
  let sources = pushSources(specs)
  if (hasLong(flags, '--tags')) {
    const tags = await call(dir, [...options, 'for-each-ref', '--count=1', 'refs/tags/hourness-snapshot/'])
    if (tags.stdout.trim() !== '') return refuse('snapshots-off-machine', 'git push --tags sends the snapshot tags')
  }
  if (specs.length === 0 && !hasLong(flags, '--all', '--tags')) {
    const remote = await remoteOf(call, dir, options, named)
    const mirror = first((await call(dir, [...options, 'config', '--bool', '--get', `remote.${remote}.mirror`], { allow: [1] })).stdout)
    if (mirror === 'true') return refuse('snapshots-off-machine', `remote.${remote}.mirror makes this push send every ref`)
    sources = pushSources(lines((await call(dir, [...options, 'config', '--get-all', `remote.${remote}.push`], { allow: [1] })).stdout))
  }
  if (sources.length === 0) return undefined
  const { names: snapshots, shas } = await snapshotRefs(call, dir, options, root)
  for (const source of sources) {
    if (source.includes('*')) {
      const reached = wildcardMatches(source, snapshots)[0]
      if (reached !== undefined) return refuse('snapshots-off-machine', `the refspec ${source} matches the snapshot ref ${reached}`)
      continue
    }
    const names = lines((await call(dir, [...options, 'rev-parse', '--symbolic-full-name', source], { allow: [128] })).stdout).map(name => name.trim())
    const named = [source, ...names]
    if (!named.some(name => REMOTE_COPY.test(name)) && named.some(name => SNAPSHOT_REF.test(name) || name.startsWith('hourness-snapshot/'))) return refuse('snapshots-off-machine', `${source} is a snapshot ref`)
    const sha = first((await call(dir, [...options, 'rev-parse', '--verify', '-q', source], { allow: [1, 128] })).stdout)
    if (sha !== undefined && shas.has(sha)) return refuse('snapshots-off-machine', `${source} is a snapshot commit`)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// The snapshot

/** Who asks for a snapshot, for the journal line. */
export interface SnapshotWho {
  readonly command: string
  /** The working directory of the session: the project root is looked for there first. */
  readonly sessionDir?: string
  readonly sessionId?: string
  readonly agentId?: string
}

/** Where a repository is, as `git rev-parse` says. */
interface RepoInfo {
  /** The git common directory, absolute. */
  readonly commonDir: string
  /** The top of the working tree; undefined in a bare repository. */
  readonly top: string | undefined
}

export type SnapshotOutcome =
  | { readonly kind: 'saved', readonly entry: SnapshotEntry, readonly notice: string | undefined, readonly journalError?: string }
  /** Nothing the command could lose is outside git's own history: no snapshot, no notice. */
  | { readonly kind: 'nothing' }
  | { readonly kind: 'not-a-repository' }
  | { readonly kind: 'git-missing' }
  | { readonly kind: 'refused', readonly refusal: Refusal }

/** The `source.kind` of the notice that tells the main agent a snapshot was saved. */
export const SNAPSHOT_NOTICE_KIND = 'glm-git-snapshot'

/** A snapshot commit holds at most this many parents directly; more go through intermediate commits (Windows limits a command line to about 32,000 characters). */
const MAX_PARENTS = 200
/** The journal line of a work tree's ignored files lists this many paths. */
const IGNORED_PATHS_LISTED = 200
/** Summing the sizes of the ignored files of a work tree stops after this long. */
const IGNORED_SIZE_MS = 5000
/** The meta data in a snapshot commit's message is left out above this size. */
const MAX_MESSAGE_JSON = 64 * 1024

type Git = (cwd: string, args: readonly string[], options?: Parameters<GitCall>[2]) => Promise<GitResult>

/** The options that pick the repository and the `-c` pairs of the user's command, put in front of every git call the snapshot makes. */
function prefixOf(repo: string, invocation: GitInvocation): string[] {
  const options = invocation.repoOptions.map((option) => {
    const at = option.indexOf('=')
    const name = option.slice(0, at)
    return name === '--namespace' ? option : `${name}=${resolve(repo, option.slice(at + 1))}`
  })
  return [...options, ...invocation.configs.flatMap(pair => ['-c', pair])]
}

/** The git calls of one command: they share a deadline and carry the repository options and `-c` pairs of the user's command. */
function gitFor(env: SnapshotEnvironment, repo: string, invocation: GitInvocation): Git {
  const call = gitCaller(env)
  const prefix = prefixOf(repo, invocation)
  return (cwd, args, options) => call(cwd, [...prefix, ...args], options)
}

/** Where a repository is; undefined when the directory is not in one. */
async function repoInfoOf(g: Git, dir: string): Promise<RepoInfo | undefined> {
  const common = await g(dir, ['rev-parse', '--git-common-dir'], { allow: [128] })
  const named = first(common.stdout)
  if (common.code !== 0 || named === undefined) return undefined
  const top = first((await g(dir, ['rev-parse', '--show-toplevel'], { allow: [128] })).stdout)
  return { commonDir: resolve(dir, named), top: top === undefined ? undefined : resolve(top) }
}

/** `yyyymmddThhmmssZ` and four random hexadecimal digits. */
function newId(env: SnapshotEnvironment): string {
  return `${env.now().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}${env.randomHex()}`
}

const slash = (path: string): string => path.split(sep).join('/')

/** Whether a tracked path `tree` has the untracked path `other` in its way: the same path, a directory the other is in, or a directory the other is. */
function makeInTheWay(treePaths: readonly string[]): (other: string) => boolean {
  const files = new Set(treePaths)
  const directories = new Set<string>()
  for (const path of treePaths) {
    for (let at = path.indexOf('/'); at >= 0; at = path.indexOf('/', at + 1)) directories.add(path.slice(0, at))
  }
  return (other) => {
    if (files.has(other) || directories.has(other)) return true
    for (let at = other.indexOf('/'); at >= 0; at = other.indexOf('/', at + 1)) {
      if (files.has(other.slice(0, at))) return true
    }
    return false
  }
}

/** What a write-out command (one that writes the working tree from another tree) overwrites: the trees it writes and the paths it is limited to; trees undefined when the command text does not say which. */
interface WayInput {
  readonly trees: readonly string[] | undefined
  readonly paths: readonly string[]
}

const CHECKOUT_VALUED = ['-b', '-B', '--orphan', '--conflict', '--pathspec-from-file']
const SWITCH_VALUED = ['-c', '-C', '--create', '--force-create', '--orphan', '--conflict']

async function treeOf(g: Git, repo: string, word: string): Promise<string | undefined> {
  if (!isLiteral(word)) return undefined
  return first((await g(repo, ['rev-parse', '--verify', '-q', `${word}^{tree}`], { allow: [1, 128] })).stdout)
}

/** Whether the command is a write-out one, and what it writes from. */
async function wayInput(g: Git, repo: string, invocation: GitInvocation): Promise<WayInput | undefined> {
  const { sub, args } = invocation
  const resolveAll = async (words: readonly string[], fallbackToHead: boolean): Promise<readonly string[] | undefined> => {
    const trees: string[] = []
    for (const word of words) {
      const tree = await treeOf(g, repo, word)
      if (tree === undefined) return undefined
      trees.push(tree)
    }
    if (trees.length > 0 || !fallbackToHead) return trees
    const head = await treeOf(g, repo, 'HEAD')
    return head === undefined ? undefined : [head]
  }
  switch (sub) {
    case 'reset': {
      const flags = flagsOf(args)
      if (!hasLong(flags, '--hard', '--merge', '--keep')) return undefined
      // The first word that names a tree is the commit; there is none when the reset is to HEAD.
      for (const word of flags.positional) {
        const tree = await treeOf(g, repo, word)
        if (tree !== undefined) return { trees: [tree], paths: [] }
      }
      return { trees: flags.positional.every(isLiteral) ? await resolveAll([], true) : undefined, paths: [] }
    }
    case 'checkout': {
      const flags = flagsOf(args, CHECKOUT_VALUED)
      const forced = hasLong(flags, '--force') || hasShort(flags, 'f')
      // `checkout <tree> -- <paths>` writes the paths from the tree; without -f a plain switch is refused by git itself.
      const fromTree = flags.paths !== undefined && flags.positional.length > 0
      if (!forced && !fromTree) return undefined
      return { trees: await resolveAll(flags.positional.slice(0, 1), forced), paths: flags.paths ?? [] }
    }
    case 'switch': {
      const flags = flagsOf(args, SWITCH_VALUED)
      if (!hasLong(flags, '--force', '--discard-changes') && !hasShort(flags, 'f')) return undefined
      return { trees: await resolveAll(flags.positional.slice(0, 1), true), paths: [] }
    }
    case 'restore': {
      const flags = flagsOf(args, ['--source', '-s'])
      const source = [...flags.values.get('--source') ?? [], ...flags.values.get('-s') ?? []][0]
      if (source === undefined) return undefined
      const tree = await treeOf(g, repo, source)
      return { trees: tree === undefined ? undefined : [tree], paths: flags.paths ?? flags.positional }
    }
    case 'read-tree': {
      const flags = flagsOf(args)
      if (!hasShort(flags, 'u')) return undefined
      return { trees: await resolveAll(flags.positional, false), paths: [] }
    }
    default:
      return undefined
  }
}

/** A path as git quotes it in the output of `clean -n` (C-style, octal escapes for bytes), restored. */
function unquoteGitPath(text: string): string {
  if (!text.startsWith('"') || !text.endsWith('"') || text.length < 2) return text
  const bytes: number[] = []
  const body = text.slice(1, -1)
  const simple: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34 }
  for (let at = 0; at < body.length; at++) {
    const char = body[at] ?? ''
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'))
      continue
    }
    const next = body[++at] ?? ''
    const octal = /^[0-7]{3}/.exec(body.slice(at, at + 3))?.[0]
    if (octal !== undefined) {
      bytes.push(Number.parseInt(octal, 8))
      at += 2
    }
    else bytes.push(simple[next] ?? next.charCodeAt(0))
  }
  return Buffer.from(bytes).toString('utf8')
}

/** The arguments of `git clean` as a dry run: no -f, no -i, and -n. */
function dryRunArgs(args: readonly string[]): string[] {
  const kept: string[] = []
  let paths = false
  for (const arg of args) {
    if (paths) kept.push(arg)
    else if (arg === '--') {
      paths = true
      kept.push(arg)
    }
    else if (arg === '--force' || arg === '--interactive') continue
    else if (/^-[^-]/.test(arg)) {
      const rest = arg.slice(1).replace(/[fi]/g, '')
      if (rest !== '') kept.push(`-${rest}`)
    }
    else kept.push(arg)
  }
  return ['-n', ...kept]
}

async function hasFiles(dir: string): Promise<boolean> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch {
    return false
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || await hasFiles(join(dir, entry.name))) return true
  }
  return false
}

/** The untracked files `git clean` with these arguments deletes, as paths relative to the directory it runs in; checked once against `git clean -n`. */
async function cleanList(g: Git, repo: string, invocation: GitInvocation): Promise<string[]> {
  const flags = flagsOf(invocation.args, CLEAN_VALUED)
  const excludes = [...flags.values.get('-e') ?? [], ...flags.values.get('--exclude') ?? []].map(pattern => `--exclude=${pattern}`)
  const paths = [...flags.positional, ...flags.paths ?? []]
  const limit = paths.length === 0 ? [] : ['--', ...paths]
  const listed = nulls((await g(repo, ['ls-files', '-z', '--others', '--exclude-standard', '--directory', ...excludes, ...limit])).stdout)
  const files: string[] = []
  const directories = hasShort(flags, 'd')
  for (const item of listed) {
    if (!item.endsWith('/')) files.push(item)
    // A directory is only deleted with -d, and a nested repository (a `.git` in it) only with -ff, which was refused.
    else if (directories && !existsSync(join(repo, item, '.git'))) files.push(...nulls((await g(repo, ['ls-files', '-z', '--others', '--exclude-standard', ...excludes, '--', item])).stdout))
  }
  const dry = await g(repo, ['-c', 'core.quotePath=false', 'clean', ...dryRunArgs(invocation.args)])
  const known = new Set(files)
  for (const line of lines(dry.stdout)) {
    const removed = /^Would remove (.*)$/.exec(line)?.[1]
    const skipped = /^Would skip repository (.*)$/.test(line)
    if (skipped) continue
    if (removed === undefined) throw new SnapshotFailure(refuse('list-mismatch', `git clean -n printed "${line}"`))
    const path = unquoteGitPath(removed)
    const matches = path.endsWith('/') ? files.some(file => file.startsWith(path)) || !await hasFiles(join(repo, path)) : known.has(path)
    if (!matches) throw new SnapshotFailure(refuse('list-mismatch', `git clean would remove ${path}, which the harness's list does not have`))
  }
  return files
}

/** The sum of the sizes of files, stopping once it is past `limit`. */
async function sizeOf(files: readonly string[], limit: number): Promise<number> {
  let total = 0
  for (let at = 0; at < files.length && total <= limit; at += 64) {
    const sizes = await Promise.all(files.slice(at, at + 64).map(file => lstat(file).then(info => info.size, () => 0)))
    total += sizes.reduce((sum, size) => sum + size, 0)
  }
  return total
}

/** What the ignored files of a work tree are, for the journal: the first paths, how many items git lists, and their size (or the size so far when summing ran out of time). */
async function ignoredIn(g: Git, env: SnapshotEnvironment, tree: string): Promise<SnapshotEntry['ignored']> {
  const listed = nulls((await g(tree, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'])).stdout)
  if (listed.length === 0) return undefined
  const until = env.now().getTime() + IGNORED_SIZE_MS
  let bytes = 0
  let complete = true
  const walk = async (path: string): Promise<void> => {
    if (env.now().getTime() > until) {
      complete = false
      return
    }
    let info
    try {
      info = await lstat(path)
    }
    catch {
      return
    }
    if (!info.isDirectory()) {
      bytes += info.size
      return
    }
    for (const entry of await readdir(path).catch(() => [])) {
      await walk(join(path, entry))
      if (!complete) return
    }
  }
  for (const item of listed) {
    await walk(join(tree, item))
    if (!complete) break
  }
  return { paths: listed.slice(0, IGNORED_PATHS_LISTED), count: listed.length, ...complete ? { bytes } : { bytesAtLeast: bytes } }
}

interface RefValue {
  readonly name: string
  /** The object the ref names (an annotated tag's own object). */
  readonly sha: string
  /** The commit it leads to. */
  readonly commit: string
}

/** The branches, tags, remote-tracking branches and stash entries of the repository. */
async function readRefs(g: Git, repo: string): Promise<{ readonly refs: Map<string, RefValue>, readonly stash: RefValue[] }> {
  const listed = await g(repo, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(*objectname)', 'refs/heads', 'refs/tags', 'refs/remotes', 'refs/stash'])
  const refs = new Map<string, RefValue>()
  for (const line of lines(listed.stdout)) {
    const [name = '', sha = '', peeled = ''] = line.split('\0')
    if (name !== '' && sha !== '') refs.set(name, { name, sha, commit: peeled === '' ? sha : peeled })
  }
  const stash = refs.has('refs/stash')
    ? lines((await g(repo, ['log', '-g', '--format=%H', 'refs/stash'], { allow: [128] })).stdout).map((sha, at) => ({ name: `stash@{${at}}`, sha, commit: sha }))
    : []
  return { refs, stash }
}

const shortBranch = (ref: string): string => ref.replace(/^refs\/heads\//, '')

/** The remote branches a push changes: `[remote, branch-or-ref]` pairs; undefined when the text does not say. */
async function pushTargets(g: Git, repo: string, invocation: GitInvocation, head: string | undefined, branches: readonly string[]): Promise<Array<{ remote: string, branch: string }> | undefined> {
  const flags = flagsOf(invocation.args, PUSH_VALUED)
  const [named, ...specs] = flags.positional
  const remote = await remoteOf(gitCallerOf(g), repo, [], named)
  const targets: Array<{ remote: string, branch: string }> = []
  if (hasLong(flags, '--all')) return branches.map(branch => ({ remote, branch }))
  if (specs.length === 0) {
    const pushed = first((await g(repo, ['rev-parse', '--abbrev-ref', '@{push}'], { allow: [128] })).stdout)
    const branch = pushed === undefined ? head : pushed.replace(/^[^/]+\//, '')
    return branch === undefined ? undefined : [{ remote, branch }]
  }
  for (const spec of specs) {
    const unforced = spec.replace(/^\+/, '')
    if (unforced.includes('*')) return undefined
    const colon = unforced.indexOf(':')
    const destination = colon < 0 ? unforced : unforced.slice(colon + 1)
    if (destination === '') continue
    targets.push({ remote, branch: destination === 'HEAD' && head !== undefined ? head : shortBranch(destination) })
  }
  return targets
}

/** `remoteOf` takes the guard's caller; here it runs through the snapshot's own prefix. */
function gitCallerOf(g: Git): GitCall {
  return (cwd, args, options) => g(cwd, args, options)
}

/** The refs a history-rewriting command moves or deletes, with their values; `all` when the text does not say which. */
function movedBy(invocation: GitInvocation, refs: ReadonlyMap<string, RefValue>, stash: readonly RefValue[], head: { readonly sha?: string, readonly branch?: string }): RefValue[] | 'all' {
  const { sub, args } = invocation
  if (!isLiteral(sub) || !args.every(isLiteral) || invocation.unknownGlobal) return 'all'
  const flags = flagsOf(args)
  const named = (ref: string): RefValue[] => {
    const found = refs.get(ref)
    return found === undefined ? [] : [found]
  }
  const current = (): RefValue[] => {
    if (head.branch !== undefined) return named(`refs/heads/${head.branch}`)
    return head.sha === undefined ? [] : [{ name: 'HEAD', sha: head.sha, commit: head.sha }]
  }
  switch (sub) {
    case 'reset': case 'rebase': case 'commit':
      return [...current(), ...sub === 'rebase' ? flags.positional.slice(1, 2).flatMap(branch => named(`refs/heads/${branch}`)) : []]
    case 'branch': {
      const prefix = hasShort(flags, 'r') ? 'refs/remotes/' : 'refs/heads/'
      if (hasLong(flags, '--delete') || hasShort(flags, 'dD')) return flags.positional.flatMap(branch => named(`${prefix}${branch}`))
      if (hasLong(flags, '--move') || hasShort(flags, 'mM')) return flags.positional.length >= 2 ? named(`${prefix}${flags.positional[0]}`) : current()
      return flags.positional.slice(hasShort(flags, 'C') ? -1 : 0).slice(0, 1).flatMap(branch => named(`${prefix}${branch}`))
    }
    case 'tag':
      return (hasLong(flags, '--delete') || hasShort(flags, 'd') ? flags.positional : flags.positional.slice(0, 1)).flatMap(tag => named(`refs/tags/${tag}`))
    case 'update-ref':
      if (hasLong(flags, '--stdin')) return 'all'
      return flags.positional.slice(0, 1).flatMap(ref => named(ref))
    case 'stash': {
      if (flags.positional[0] === 'clear') return [...stash]
      const wanted = flags.positional[1] ?? 'stash@{0}'
      return stash.filter(entry => entry.name === wanted)
    }
    default:
      return 'all'
  }
}

/** The text of the commit a snapshot is: a line in words, then the data as JSON when it is not too big. */
function messageOf(summary: string, data: object): string {
  const json = JSON.stringify(data)
  return json.length > MAX_MESSAGE_JSON ? `${summary}\n` : `${summary}\n\n${json}\n`
}

async function commitOf(g: Git, repo: string, tree: string, parents: readonly string[], message: string): Promise<string> {
  let heads = [...new Set(parents)]
  while (heads.length > MAX_PARENTS) {
    const merged: string[] = []
    for (let at = 0; at < heads.length; at += MAX_PARENTS) {
      const chunk = heads.slice(at, at + MAX_PARENTS)
      merged.push(first((await g(repo, ['commit-tree', tree, ...chunk.flatMap(parent => ['-p', parent])], { input: 'hourness snapshot: parents\n' })).stdout) ?? '')
    }
    heads = merged
  }
  const made = first((await g(repo, ['commit-tree', tree, ...heads.flatMap(parent => ['-p', parent])], { input: message })).stdout)
  if (made === undefined) throw new SnapshotFailure(refuse('git-failed', 'git commit-tree printed no commit'))
  return made
}

const REMOTE_COPY_NAME = /^refs\/hourness\/snapshots\/[^/]+\/remote\//

/**
 * Whether the old value of a ref a command moves would become reachable only
 * through a reflog afterwards (no other ref holds it, a reset to a
 * descendant or to the same commit aside), or was published (a
 * remote-tracking branch holds it) and the command rewrites it. The copy of
 * what a remote had counts for the second only: nothing else here holds it.
 */
async function losesCommits(g: Git, repo: string, invocation: GitInvocation, value: RefValue, movedNames: ReadonlySet<string>, target: string | undefined): Promise<boolean> {
  if (target !== undefined && (await g(repo, ['merge-base', '--is-ancestor', value.commit, target], { allow: [1] })).code === 0) return false
  const holders = lines((await g(repo, ['for-each-ref', `--contains=${value.commit}`, '--format=%(refname)', 'refs/heads', 'refs/tags', 'refs/remotes', 'refs/stash'])).stdout)
  const published = holders.some(holder => holder.startsWith('refs/remotes/'))
  if (REMOTE_COPY_NAME.test(value.name)) return published
  if (holders.every(holder => movedNames.has(holder))) return true
  return published && ['reset', 'rebase', 'commit'].includes(invocation.sub)
}

/** The restore commands of a snapshot, in the words of the notice. */
function restoreLines(entry: Pick<SnapshotEntry, 'stash' | 'worktree' | 'files' | 'refs'>, ref: string, remotes: ReadonlyArray<{ readonly remote: string, readonly branch: string, readonly ref: string }>, stashEntries: readonly RefValue[]): string[] {
  const out: string[] = []
  if (entry.worktree !== undefined) out.push(`Uncommitted changes (a merge was unresolved): git restore --source=${entry.worktree} --worktree -- <path>`)
  else if (entry.stash !== undefined) out.push(`Uncommitted changes: git stash apply ${entry.stash}`)
  if (entry.files !== undefined) out.push(`Deleted or overwritten untracked files: git restore --source=${ref} --worktree -- <path> (or . for all)`)
  for (const moved of entry.refs) {
    if (moved.name.startsWith('stash@') || REMOTE_COPY_NAME.test(moved.name)) continue
    if (moved.name === 'HEAD') out.push(`HEAD was ${moved.sha}: git reset --hard ${moved.sha} or git switch --detach ${moved.sha}`)
    else if (moved.name.startsWith('refs/heads/')) out.push(`Branch ${shortBranch(moved.name)}: git branch ${shortBranch(moved.name)} ${moved.sha} (git update-ref ${moved.name} ${moved.sha} if it exists)`)
    else out.push(`Ref ${moved.name}: git update-ref ${moved.name} ${moved.sha}`)
  }
  for (const stashed of stashEntries) out.push(`Stash entry ${stashed.name}: git stash store -m "restored ${stashed.name}" ${stashed.sha}`)
  for (const remote of remotes) out.push(`Remote ${remote.remote}/${remote.branch}: git push --force-with-lease ${remote.remote} ${remote.ref}:${remote.branch}`)
  return out
}

/** The notice the main agent gets after a snapshot (docs/ORCHESTRATION.md §6.1). */
function snapshotNotice(entry: SnapshotEntry): string {
  const where = entry.ref === undefined ? '' : `（${entry.ref}${entry.tag === undefined ? '' : `，标签 ${entry.tag}`}）`
  const header = entry.ref === undefined
    ? `[git 快照] 执行「${entry.command}」之前没有要存的改动，工作树里被忽略的文件不在快照里。`
    : `[git 快照] 执行「${entry.command}」之前存了快照 ${entry.id}${where}。要撤回：`
  const ignored = entry.ignored === undefined
    ? []
    : [`被忽略的文件不在快照里，删掉之后不恢复：${entry.ignored.count} 项、${entry.ignored.bytes !== undefined ? `${entry.ignored.bytes} 字节` : `至少 ${entry.ignored.bytesAtLeast ?? 0} 字节`}，例如 ${entry.ignored.paths.slice(0, 3).join('、')}；装依赖一类的可以重新生成`]
  return [header, ...entry.ref === undefined ? [] : entry.restore, ...ignored].join('\n')
}

/**
 * Save the work a git command could lose, before it runs (docs/
 * ORCHESTRATION.md §6.1). `repo` is the directory git runs in; `risk` says
 * what the command can lose. The steps are the design's: the repository
 * (1); changed tracked files and the untracked ones the command would
 * delete or overwrite (2, `discard`); the old values of the refs it moves
 * (3, `history`); one commit holding all of it (4); the ref
 * `refs/hourness/snapshots/<id>` and, where history would become
 * unreachable, the tag `hourness-snapshot/<id>` (5); the journal line (6).
 * The notice (7) is returned for the caller to inject. Throws nothing: a
 * snapshot that cannot be made is `refused`, and git missing is
 * `git-missing`.
 */
export async function takeSnapshot(
  repo: string,
  invocation: GitInvocation,
  risk: GitRisk,
  who: SnapshotWho,
  env: SnapshotEnvironment = realSnapshotEnvironment,
  known?: RepoInfo,
): Promise<SnapshotOutcome> {
  const created: string[] = []
  const g = gitFor(env, repo, invocation)
  try {
    const info = known ?? await repoInfoOf(g, repo)
    if (info === undefined) return { kind: 'not-a-repository' }
    return await snapshotIn(g, env, info, repo, invocation, risk, who, created)
  }
  catch (error) {
    for (const ref of created) await g(repo, ['update-ref', '-d', ref], { allow: [1, 128] }).catch(() => undefined)
    if (error instanceof GitMissing) return { kind: 'git-missing' }
    if (error instanceof SnapshotFailure) return { kind: 'refused', refusal: error.refusal }
    return { kind: 'refused', refusal: refuse('git-failed', error instanceof Error ? error.message : String(error)) }
  }
}

async function snapshotIn(g: Git, env: SnapshotEnvironment, info: RepoInfo, repo: string, invocation: GitInvocation, risk: GitRisk, who: SnapshotWho, created: string[]): Promise<SnapshotOutcome> {
  const { sub } = invocation
  const id = newId(env)
  const top = info.top
  const toTop = (path: string): string => top === undefined ? path : slash(relative(top, resolve(repo, path)))
  const headSha = first((await g(repo, ['rev-parse', '--verify', '-q', 'HEAD'], { allow: [1, 128] })).stdout)
  const headBranch = first((await g(repo, ['symbolic-ref', '-q', '--short', 'HEAD'], { allow: [1, 128] })).stdout)
  const head = { ...headSha === undefined ? {} : { sha: headSha }, ...headBranch === undefined ? {} : { branch: headBranch } }

  // Step 2: what a discard loses.
  let stash: string | undefined
  let worktreeCommit: string | undefined
  let treeOfFiles: string | undefined
  let inTheWay = 0
  let cleaned = 0
  let inWorktree = 0
  let ignoredInfo: SnapshotEntry['ignored']
  const keep: string[] = []
  const discards = risk !== 'history'
  // A work tree that is removed is read in its own directory; the command's other forms read the repository it runs in.
  const removing = sub === 'worktree' ? flagsOf(invocation.args).positional : []
  const target = removing[0] === 'remove' ? removing[removing.length - 1] : undefined
  const workTree = target === undefined || target === 'remove' ? undefined : resolve(repo, target)
  const changeDir = workTree ?? repo
  const changesWorktree = !(sub === 'stash' && ['drop', 'clear'].includes(flagsOf(invocation.args).positional[0] ?? ''))
  if (discards && top !== undefined && changesWorktree && (workTree === undefined || existsSync(workTree))) {
    const changes = await trackedChanges(g, env, changeDir)
    stash = changes.stash
    worktreeCommit = changes.worktree
    const way = workTree === undefined ? await wayFiles(g, repo, invocation, toTop) : { files: [], ignored: [] }
    if (way.ignored.length > 0) throw new SnapshotFailure(refuse('ignored-in-way', 'ignored files in the way', way.ignored))
    inTheWay = way.files.length
    const listed = sub === 'clean' ? (await cleanList(g, repo, invocation)).map(toTop) : []
    cleaned = listed.length
    const removed = workTree === undefined ? [] : nulls((await g(workTree, ['ls-files', '-z', '--others', '--exclude-standard'])).stdout)
    inWorktree = removed.length
    ignoredInfo = workTree === undefined ? undefined : await ignoredIn(g, env, workTree)
    const base = workTree ?? top
    const all = [...new Set([...way.files, ...listed, ...removed])]
    if (all.length > env.maxFiles) throw new SnapshotFailure(refuse('too-big', `${all.length} files to save`))
    if (await sizeOf(all.map(file => join(base, file)), env.maxBytes) > env.maxBytes) throw new SnapshotFailure(refuse('too-big', 'more than the allowed size to save'))
    keep.push(...all)
    if (keep.length > 0) treeOfFiles = await treeOfFilesIn(g, env, base, keep)
  }
  const nothingToKeep = stash === undefined && worktreeCommit === undefined && keep.length === 0

  // Step 3: what a history change loses.
  const remote: Array<{ remote: string, branch: string, ref: string }> = []
  const originals: RefValue[] = []
  let history: string | undefined
  let movedNames: string[] = []
  let stashEntries: RefValue[] = []
  const listing = risk === 'discard' ? undefined : await readRefs(g, repo)
  if (listing !== undefined) {
    let moved: RefValue[] | 'all' = sub === 'push' ? [] : movedBy(invocation, listing.refs, listing.stash, head)
    if (sub === 'push') {
      const pushing = invocation.args.every(isLiteral) ? await pushTargets(g, repo, invocation, headBranch, [...listing.refs.keys()].filter(name => name.startsWith('refs/heads/')).map(shortBranch)) : undefined
      if (pushing === undefined) moved = 'all'
      else {
        for (const { remote: name, branch } of pushing) {
          const copy = `refs/hourness/snapshots/${id}/remote/${branch}`
          const full = branch.startsWith('refs/') ? branch : `refs/heads/${branch}`
          const fetched = await g(repo, ['fetch', '--no-tags', name, `+${full}:${copy}`], { allow: [1, 128] })
          if (fetched.code !== 0) {
            // The remote has no such branch: nothing there to lose.
            if (/couldn't find remote ref/i.test(fetched.stderr)) continue
            throw new SnapshotFailure(refuse('remote-unreachable', `git fetch ${name} failed: ${fetched.stderr.trim().split(/\r?\n/).slice(-1)[0] ?? ''}`))
          }
          created.push(copy)
          const sha = first((await g(repo, ['rev-parse', copy])).stdout) ?? ''
          remote.push({ remote: name, branch, ref: copy })
          originals.push({ name: copy, sha, commit: sha })
        }
      }
    }
    if (moved === 'all') {
      originals.push(...listing.refs.values(), ...listing.stash)
      if (headSha !== undefined && headBranch === undefined) originals.push({ name: 'HEAD', sha: headSha, commit: headSha })
    }
    else originals.push(...moved)
    stashEntries = originals.filter(value => value.name.startsWith('stash@'))
    movedNames = originals.map(value => value.name)
    const names = new Set(movedNames)
    const reachable = await resetTarget(g, repo, invocation)
    for (const value of originals) {
      if (value.name.startsWith('stash@')) continue
      if (await losesCommits(g, repo, invocation, value, names, reachable)) {
        history = 'pending'
        break
      }
    }
  }

  // Nothing to keep at all: no commit, no ref, no notice (the removal of a work tree is still written down).
  if (nothingToKeep && originals.length === 0) {
    if (workTree === undefined || ignoredInfo === undefined) return { kind: 'nothing' }
    const skipped: SnapshotEntry = {
      id, at: env.now().toISOString(), ...who.sessionId === undefined ? {} : { sessionId: who.sessionId }, ...who.agentId === undefined ? {} : { agentId: who.agentId },
      command: who.command, subcommand: sub, risk, repo: info.commonDir, rootFrom: 'session', head, refs: [], moved: [], restore: [], ignored: ignoredInfo, skipped: 'nothing-to-keep',
    }
    return await recorded(skipped, who, top ?? repo, true)
  }

  // Step 4: the commit.
  const emptyTree = first((await g(repo, ['mktree'], { input: '' })).stdout) ?? ''
  const refValues = originals.map(value => ({ name: value.name, sha: value.sha }))
  const base: Omit<SnapshotEntry, 'restore' | 'rootFrom'> = {
    id, at: env.now().toISOString(), ...who.sessionId === undefined ? {} : { sessionId: who.sessionId }, ...who.agentId === undefined ? {} : { agentId: who.agentId },
    command: who.command, subcommand: sub, risk, repo: info.commonDir, head,
    ...stash === undefined ? {} : { stash }, ...worktreeCommit === undefined ? {} : { worktree: worktreeCommit },
    ...treeOfFiles === undefined ? {} : { files: { tree: treeOfFiles, count: keep.length, ...inTheWay > 0 ? { inTheWay } : {}, ...cleaned > 0 ? { cleaned } : {}, ...inWorktree > 0 ? { worktree: inWorktree } : {} } },
    ...ignoredInfo === undefined ? {} : { ignored: ignoredInfo },
    refs: refValues, moved: movedNames, ...remote.length === 0 ? {} : { remote },
  }
  // Git cannot hold a ref and a directory of refs under one name: with the remote's copies under `refs/hourness/snapshots/<id>/remote/`, the snapshot commit goes to `<id>/commit`.
  const ref = remote.length === 0 ? `refs/hourness/snapshots/${id}` : `refs/hourness/snapshots/${id}/commit`
  const restore = restoreLines(base, ref, remote, stashEntries)
  const parents = [...headSha === undefined ? [] : [headSha], ...stash === undefined ? [] : [stash], ...worktreeCommit === undefined ? [] : [worktreeCommit], ...originals.map(value => value.commit)]
  const summary = `hourness snapshot ${id}: before ${sub} (${risk})`
  const snapshot = await commitOf(g, repo, treeOfFiles ?? emptyTree, parents, messageOf(summary, { ...base, restore }))

  // Step 5: the ref, and the tag where history would become unreachable.
  await g(repo, ['update-ref', ref, snapshot])
  created.push(ref)
  let tag: string | undefined
  if (history === 'pending') {
    const lost = originals.filter(value => !value.name.startsWith('stash@')).map(value => value.commit)
    history = await commitOf(g, repo, emptyTree, lost, messageOf(`hourness snapshot ${id}: the commits ${sub} moves away from`, { id, command: who.command, refs: refValues }))
    tag = `hourness-snapshot/${id}`
    await g(repo, ['update-ref', `refs/tags/${tag}`, history])
    created.push(`refs/tags/${tag}`)
  }
  else history = undefined

  // Step 6: the journal line.
  const entry: SnapshotEntry = { ...base, rootFrom: 'session', ref, ...tag === undefined ? {} : { tag }, ...history === undefined ? {} : { history }, restore }
  return await recorded(entry, who, top ?? repo, false)
}

/** The tracked files' changes: a stash commit, or, when a merge is unresolved, a commit of the working tree through a temporary index. */
async function trackedChanges(g: Git, env: SnapshotEnvironment, dir: string): Promise<{ readonly stash?: string, readonly worktree?: string }> {
  // A repository with no commit has nothing tracked to compare with.
  if (first((await g(dir, ['rev-parse', '--verify', '-q', 'HEAD'], { allow: [1, 128] })).stdout) === undefined) return {}
  const unmerged = (await g(dir, ['ls-files', '-z', '--unmerged'])).stdout !== ''
  if (!unmerged) {
    const made = await g(dir, ['stash', 'create'], { allow: [1, 128, 129] })
    if (made.code === 0) {
      const sha = first(made.stdout)
      return sha === undefined ? {} : { stash: sha }
    }
  }
  return tempIndex(env, async (indexEnv) => {
    await g(dir, ['read-tree', 'HEAD'], { env: indexEnv })
    await g(dir, ['add', '-u'], { env: indexEnv })
    const tree = first((await g(dir, ['write-tree'], { env: indexEnv })).stdout)
    const headTree = first((await g(dir, ['rev-parse', 'HEAD^{tree}'])).stdout)
    if (tree === undefined || tree === headTree) return {}
    const commit = first((await g(dir, ['commit-tree', tree, '-p', 'HEAD'], { input: 'hourness snapshot: the working tree\n' })).stdout)
    return commit === undefined ? {} : { worktree: commit }
  })
}

/** The untracked files in the way of a write-out command, and, apart, the ignored ones; both as paths from the top of the working tree. */
async function wayFiles(g: Git, repo: string, invocation: GitInvocation, toTop: (path: string) => string): Promise<{ readonly files: string[], readonly ignored: string[] }> {
  const input = await wayInput(g, repo, invocation)
  if (input === undefined) return { files: [], ignored: [] }
  const limit = input.paths.length === 0 ? [] : ['--', ...input.paths]
  const others = nulls((await g(repo, ['ls-files', '-z', '--others', '--exclude-standard', ...limit])).stdout).map(toTop)
  // The text did not say which tree is written: every untracked file may be in the way, and the ignored ones cannot be told.
  if (input.trees === undefined) return { files: others, ignored: [] }
  const treePaths: string[] = []
  for (const tree of input.trees) {
    const listed = await g(repo, ['ls-tree', '-r', '-z', '--name-only', input.paths.length === 0 ? '--full-tree' : '--full-name', tree, ...limit])
    treePaths.push(...nulls(listed.stdout))
  }
  const inWay = makeInTheWay(treePaths)
  const ignored = nulls((await g(repo, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', ...limit])).stdout).map(toTop)
  return { files: others.filter(inWay), ignored: ignored.filter(inWay) }
}

/** The tree of the files to keep: a temporary index holding exactly them. */
async function treeOfFilesIn(g: Git, env: SnapshotEnvironment, base: string, files: readonly string[]): Promise<string> {
  return tempIndex(env, async (indexEnv) => {
    await g(base, ['read-tree', '--empty'], { env: indexEnv })
    const added = await g(base, ['--literal-pathspecs', 'add', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], { env: indexEnv, input: `${files.join('\0')}\0`, allow: [129] })
    // A git older than 2.25 has no --pathspec-from-file: the paths go after `--`, a hundred at a time.
    if (added.code !== 0) {
      for (let at = 0; at < files.length; at += 100) await g(base, ['--literal-pathspecs', 'add', '-f', '--', ...files.slice(at, at + 100)], { env: indexEnv })
    }
    const tree = first((await g(base, ['write-tree'], { env: indexEnv })).stdout)
    if (tree === undefined) throw new SnapshotFailure(refuse('git-failed', 'git write-tree printed no tree'))
    return tree
  })
}

/** For `reset`, the commit it moves to (the first word that names one, else HEAD); undefined for the other commands. */
async function resetTarget(g: Git, repo: string, invocation: GitInvocation): Promise<string | undefined> {
  if (invocation.sub !== 'reset' || !invocation.args.every(isLiteral)) return undefined
  for (const word of [...flagsOf(invocation.args).positional, 'HEAD']) {
    const commit = first((await g(repo, ['rev-parse', '--verify', '-q', `${word}^{commit}`], { allow: [1, 128] })).stdout)
    if (commit !== undefined) return commit
  }
  return undefined
}

/** Write the journal line and build the notice; a journal that cannot be written leaves the snapshot in place and says so. */
async function recorded(entry: SnapshotEntry, who: SnapshotWho, repoTop: string, skipped: boolean): Promise<SnapshotOutcome> {
  const where = journalRoot(who.sessionDir, repoTop)
  const withRoot: SnapshotEntry = where === undefined ? entry : { ...entry, rootFrom: where.from }
  let journalError: string | undefined
  if (where === undefined) journalError = 'no project root with a .git was found'
  else {
    try {
      await ensureIgnored(where.root, '.llm')
      await writeJournal(where.root, withRoot)
    }
    catch (error) {
      journalError = error instanceof Error ? error.message : String(error)
    }
  }
  const notice = skipped && withRoot.ignored === undefined ? undefined : snapshotNotice(withRoot)
  return { kind: 'saved', entry: withRoot, notice, ...journalError === undefined ? {} : { journalError } }
}

// ---------------------------------------------------------------------------
// One shell call

export interface GuardGitInput {
  readonly command: string
  /** The dialects the call's shell text may be read in (`shellCommandOf`). */
  readonly dialects: readonly ShellDialect[]
  /** The session's working directory. */
  readonly base: string | undefined
  readonly sessionId?: string
  readonly agentId?: string
}

export type GuardGitResult =
  /** Nothing to save, or saved: the call goes through. `notices` are for the main agent, `degraded` is for the row health. */
  | { readonly kind: 'allow', readonly notices: readonly string[], readonly degraded: readonly string[], readonly saved: readonly SavedSnapshot[] }
  | { readonly kind: 'refuse', readonly refusal: Refusal }

/** A snapshot saved before a call: its journal line and how long it took, for the metrics (`git.snapshot`). */
export interface SavedSnapshot {
  readonly entry: SnapshotEntry
  readonly ms: number
}

export const GIT_MISSING = '找不到 git，快照跳过'

/** The risk of a git call by what the text says, before any alias is looked up. */
function riskOf(invocation: GitInvocation): GitRisk | undefined {
  if (invocation.unknownGlobal) return 'both'
  return invocation.sub === '' ? undefined : gitRisk(invocation.sub, invocation.args)
}

/** The expansion of `sub` when it is an alias (undefined when it is none); one that starts with `!` runs a shell command and may do anything. The expansion's risk is undefined when it loses nothing. */
async function aliasOf(g: Git, repo: string, invocation: GitInvocation): Promise<{ readonly risk: GitRisk | undefined, readonly invocation: GitInvocation } | undefined> {
  const alias = first((await g(repo, ['config', '--get', `alias.${invocation.sub}`], { allow: [1] })).stdout)
  if (alias === undefined) return undefined
  if (alias.startsWith('!')) return { risk: 'both', invocation }
  const [sub = '', ...rest] = alias.split(/\s+/)
  const expanded: GitInvocation = { ...invocation, sub, args: [...rest, ...invocation.args] }
  return { risk: gitRisk(sub, expanded.args), invocation: expanded }
}

/**
 * Everything the harness does for the git calls of one shell call: refuse
 * what would send snapshots off the machine or delete what they do not keep,
 * save a snapshot before each call that can lose work, and report what was
 * saved. A call that is not about git, or is about git in a place that is
 * not a repository, goes through untouched.
 */
export async function guardGit(input: GuardGitInput, env: SnapshotEnvironment = realSnapshotEnvironment): Promise<GuardGitResult> {
  const seen = new Set<string>()
  const invocations: GitInvocation[] = []
  for (const dialect of input.dialects) {
    for (const invocation of gitInvocations(input.command, dialect, input.base)) {
      const key = JSON.stringify([invocation.dir, invocation.repoOptions, invocation.configs, invocation.sub, invocation.args, invocation.unknownGlobal])
      if (!seen.has(key)) {
        seen.add(key)
        invocations.push(invocation)
      }
    }
  }
  const notices: string[] = []
  const degraded: string[] = []
  const saved: SavedSnapshot[] = []
  const who: SnapshotWho = { command: input.command, ...input.base === undefined ? {} : { sessionDir: input.base }, ...input.sessionId === undefined ? {} : { sessionId: input.sessionId }, ...input.agentId === undefined ? {} : { agentId: input.agentId } }
  for (const invocation of invocations) {
    try {
      const refusal = await guardOne(invocation, who, env, notices, degraded, saved)
      if (refusal !== undefined) return { kind: 'refuse', refusal }
    }
    catch (error) {
      if (error instanceof GitMissing) degraded.push(GIT_MISSING)
      else if (error instanceof SnapshotFailure) return { kind: 'refuse', refusal: error.refusal }
      else return { kind: 'refuse', refusal: refuse('git-failed', error instanceof Error ? error.message : String(error)) }
    }
  }
  return { kind: 'allow', notices, degraded, saved }
}

async function guardOne(invocation: GitInvocation, who: SnapshotWho, env: SnapshotEnvironment, notices: string[], degraded: string[], saved: SavedSnapshot[]): Promise<Refusal | undefined> {
  const clean = cleanRefusal(invocation)
  if (clean !== undefined) return clean
  const written = riskOf(invocation)
  const matters = invocation.sub === 'push' || written !== undefined || (invocation.sub !== '' && !isKnownSubcommand(invocation.sub))
  if (!matters) return undefined
  const repo = invocation.dir
  if (repo === undefined) {
    return written !== undefined || invocation.sub === 'push' ? refuse('cd-unknown', 'the directory the command runs in is not in the command text') : undefined
  }
  const g = gitFor(env, repo, invocation)
  const info = await repoInfoOf(g, repo)
  if (info === undefined) return undefined
  const where = journalRoot(who.sessionDir, info.top ?? repo)
  const outbound = await outboundRefusal(invocation, env, where?.root)
  if (outbound !== undefined) return outbound
  let risk = written
  let effective = invocation
  if (risk === undefined) {
    const aliased = await aliasOf(g, repo, invocation)
    if (aliased === undefined) return undefined
    risk = aliased.risk
    effective = aliased.invocation
    // What the command sends away and what clean deletes are about what it RUNS: both checks hold for the expansion too (S4-3).
    const clean = cleanRefusal(effective)
    if (clean !== undefined) return clean
    const outbound = await outboundRefusal(effective, env, where?.root)
    if (outbound !== undefined) return outbound
    if (risk === undefined) return undefined
  }
  const started = env.now().getTime()
  const outcome = await takeSnapshot(repo, effective, risk, who, env, info)
  switch (outcome.kind) {
    case 'refused':
      return outcome.refusal
    case 'git-missing':
      degraded.push(GIT_MISSING)
      return undefined
    case 'saved':
      saved.push({ entry: outcome.entry, ms: Math.max(0, env.now().getTime() - started) })
      if (outcome.notice !== undefined) notices.push(outcome.notice)
      if (outcome.journalError !== undefined) degraded.push(`快照 ${outcome.entry.id} 已存，记录没写上：${outcome.journalError}`)
      return undefined
    default:
      return undefined
  }
}

