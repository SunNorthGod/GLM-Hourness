/**
 * The takeover's read of a workspace (takeover design 0.6 §3.3). Read-only:
 * it runs nothing of the repository — no `require` of a configuration file,
 * no `npm`, `python` or `make`, no symbolic link followed out of the root.
 * The only process it starts is `git`, through `execFile` (no shell), each
 * call with `-c core.fsmonitor=false -c core.hooksPath=` and
 * `GIT_TERMINAL_PROMPT=0`, at most 5 seconds. Issues are not read: the
 * `gh` row of §3.3 would be a second program, and bootstrap-scan #3 allows
 * git only; `issues` says so (U5's fallback).
 *
 * Commands come from HEAD only: in a repository with commits the manifests,
 * CI files, task files and hook-tool configurations are read with
 * `git show HEAD:<path>`, so a candidate is the same text the trial's clone
 * of HEAD will run. Without commits they are read from the working tree.
 * Every file is at most 1 MiB, all of them at most 20 MiB, the whole scan
 * 15 seconds (`SCAN_DEADLINE_MS`); what was not read in time is listed in
 * `truncated`, and the path decision uses what was.
 *
 * Text that looks like a secret (`redactSecrets`, src/data/secret-shape.ts)
 * is replaced before it is kept: remote addresses lose their user and
 * password, and candidate commands, history subjects, tags and file paths go
 * through the shared redaction. This keeps tokens out of the takeover's
 * files; it does not limit what an agent may read (`d-credentials-readable`).
 */
import { execFile } from 'node:child_process'
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { redactSecrets } from '../data/secret-shape.ts'
import {
  cargoMembers, denoCandidates, huskyCandidates, justfileCandidates, makefileCandidates, noxCandidates, packageJsonCandidates,
  packageManagerOf, packageWorkspaces, pnpmWorkspaces, preCommitCandidates, pyprojectCandidates, taskfileCandidates, tomlTables,
  toxCandidates, yamlCandidates, type CommandCandidate, type Extracted, type PackageManager, type Unreadable,
} from './extract.ts'
import { graphNodeFiles, isIgnorableEntry, isProjectGraph } from './path.ts'

/** The whole scan's time (§3.3). */
const SCAN_DEADLINE_MS = 15_000
/** One git call's time (§3.3, §12). */
const GIT_CALL_MS = 5_000
const FILE_LIMIT = 1024 * 1024
const TOTAL_LIMIT = 20 * 1024 * 1024
const SCAN_JSON_LIMIT = 1024 * 1024
const MAX_TRACKED = 50_000
const MAX_HISTORY = 2_000
const SUBJECT_LIMIT = 200
const MAX_TAGS = 200
const MAX_DOCS = 500
/** Flags in front of every git call (§3.3). */
export const SCAN_GIT_FLAGS = ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath='] as const

/** File extensions that count as code for path rule 4 and the counts (§3.4). */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte',
  '.py', '.pyi', '.go', '.rs', '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx', '.m', '.mm',
  '.java', '.kt', '.kts', '.scala', '.groovy', '.cs', '.fs', '.vb', '.swift', '.dart',
  '.rb', '.php', '.pl', '.lua', '.r', '.jl', '.ex', '.exs', '.erl', '.hs', '.ml', '.clj', '.zig', '.nim',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd',
])

/** The ecosystems a scan recognises from its manifests (the default table in B5 is keyed by them). */
type Stack =
  | 'node-npm' | 'node-pnpm' | 'node-yarn' | 'node-bun' | 'deno'
  | 'python-uv' | 'python-poetry' | 'python' | 'go' | 'rust' | 'shell'
  | 'cmake' | 'meson' | 'java-maven' | 'java-gradle' | 'ruby' | 'php' | 'dotnet'

interface Remote {
  readonly name: string
  /** Host and path only: the user and password of the address are taken out. */
  readonly url: string
}

/**
 * What git said. `none`: not a repository (`--show-toplevel` failed);
 * `missing`: git could not be started; `unread`: the scan ran out of time
 * before it knew. In a repository `head` is absent when there is no commit.
 */
type GitFacts =
  | {
    readonly state: 'repo'
    readonly toplevel: string
    readonly head?: string
    readonly branch?: string
    readonly commits: number
    readonly firstCommitAt?: string
    readonly lastCommitAt?: string
    readonly remotes: readonly Remote[]
    readonly tags: readonly string[]
    readonly submodules: readonly string[]
    readonly lfs: readonly string[]
  }
  | { readonly state: 'none' | 'missing' | 'unread' }

export interface ScanResult {
  readonly version: 1
  readonly root: string
  readonly at: string
  readonly ms: number
  readonly git: GitFacts
  readonly files: {
    /** Tracked files, all of them (the list keeps at most 50,000). */
    readonly tracked: number
    readonly code: number
    readonly byExtension: Readonly<Record<string, number>>
    readonly topDirs: readonly string[]
  }
  /** Outside git only: the top-level entries that are something else than path rule 2 ignores (§3.4). */
  readonly workspace: { readonly loose: readonly string[] }
  readonly stacks: readonly Stack[]
  /** The files the candidates were read from, and whether from HEAD or the working tree. */
  readonly sources: {
    readonly from: 'head' | 'worktree' | 'none'
    readonly manifests: readonly string[]
    readonly ci: readonly string[]
    readonly taskFiles: readonly string[]
    readonly hookTools: readonly string[]
  }
  readonly candidates: readonly CommandCandidate[]
  readonly unreadable: readonly Unreadable[]
  readonly checkers: { readonly configs: readonly string[], readonly pyprojectTools: readonly string[] }
  readonly docs: { readonly root: readonly string[], readonly files: readonly { readonly path: string, readonly bytes: number }[], readonly adr: readonly string[] }
  readonly issues: { readonly read: false, readonly reason: string }
  /** The graph directory as configured, its path under the root when it is there, and its node files. */
  readonly graph: { readonly dir: string, readonly rel?: string, readonly present: boolean, readonly nodes: number }
  /** What was not read: `git`, `git:<step>`, `file:<path>` (too large, over the total, or out of time), `scan.json`. */
  readonly truncated: readonly string[]
}

/** A scan and the two lists that go next to `scan.json` (§3.3): `files.txt` and `history.tsv`. */
export interface ScanOutput {
  readonly scan: ScanResult
  readonly files: readonly string[]
  readonly history: readonly string[]
}

interface ScanOptions {
  /** The configured graph directory (absolute; the graph row's `dirFor(cwd)`, `docs/graph` without it). */
  readonly graphDir: string
  /** When the scan must stop, in `now()` milliseconds; `SCAN_DEADLINE_MS` after the start by default. */
  readonly deadline?: number
  readonly now?: () => number
}

interface GitRun {
  readonly code: number
  readonly out: string
  /** git could not be started. */
  readonly missing: boolean
  /** The call was killed: out of time, or more output than allowed. */
  readonly cut: boolean
}

function runGit(root: string, args: readonly string[], timeoutMs: number, maxBuffer = 64 * 1024 * 1024): Promise<GitRun> {
  return new Promise((done) => {
    execFile('git', [...SCAN_GIT_FLAGS, ...args], {
      cwd: root, timeout: timeoutMs, maxBuffer, windowsHide: true, encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANGUAGE: 'C' },
    }, (error, stdout) => {
      if (error === null) {
        done({ code: 0, out: stdout, missing: false, cut: false })
        return
      }
      const code = typeof error.code === 'number' ? error.code : -1
      const missing = error.code === 'ENOENT'
      const cut = error.killed === true || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      done({ code, out: stdout, missing, cut })
    })
  })
}

/** A remote address without its user and password (`https://user:token@host/x` → `https://host/x`, `user@host:x` kept as `host:x`). */
export function withoutUserInfo(url: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*:\/\/)([^/@]*@)?(.*)$/i.exec(url)
  if (scheme !== null) return `${scheme[1] ?? ''}${scheme[3] ?? ''}`
  return url.replace(/^[^@/:]+@/, '')
}

const clean = (text: string): string => redactSecrets(text)

const MANIFEST_NAMES = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'deno.json', 'pyproject.toml', 'uv.lock', 'poetry.lock', 'Pipfile.lock', 'setup.cfg', 'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.work',
  'CMakeLists.txt', 'meson.build', 'pom.xml', 'Gemfile', 'composer.json',
])
const isManifestName = (name: string): boolean => MANIFEST_NAMES.has(name) || /^requirements.*\.txt$/.test(name) || /^build\.gradle/.test(name) || /\.(?:csproj|sln)$/.test(name)

function isCiPath(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) || /^\.gitee\/.+\.ya?ml$/.test(path) || /^\.workflow\/[^/]+\.ya?ml$/.test(path)
    || ['.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', '.travis.yml', 'Jenkinsfile'].includes(path)
}
const TASK_FILES = new Set(['Makefile', 'makefile', 'GNUmakefile', 'justfile', 'Justfile', '.justfile', 'Taskfile.yml', 'Taskfile.yaml', 'tox.ini', 'noxfile.py'])
const isHookToolPath = (path: string): boolean => ['.pre-commit-config.yaml', 'lefthook.yml', 'lefthook.yaml', '.lefthook.yml'].includes(path) || /^\.husky\/[^/_][^/]*$/.test(path)

/** Checker configuration files (the M4 checker-config names, with the ones §3.3 adds). */
const CHECKER_CONFIGS: readonly RegExp[] = [
  /^eslint\.config\.[cm]?[jt]s$/, /^\.eslintrc(?:\..+)?$/, /^eslint-suppressions\.json$/, /^knip\.(?:js|ts|json)$/, /^\.jscpd\.json$/,
  /^tsconfig(?:\..+)?\.json$/, /^\.gitleaks\.toml$/, /^\.?ruff\.toml$/, /^mypy\.ini$/, /^\.clang-tidy$/, /^\.shellcheckrc$/,
  /^biome\.jsonc?$/, /^\.prettierrc(?:\..+)?$/, /^\.flake8$/, /^\.pylintrc$/, /^\.golangci\..+$/, /^clippy\.toml$/, /^\.?rustfmt\.toml$/,
  /^\.clang-format$/, /^\.editorconfig$/, /^sonar-project\.properties$/,
]
const DOC_ROOT = /^(?:README|ROADMAP|TODO|CHANGELOG|CONTRIBUTING)(?:\..+)?$/i
const ADR_DIRS = ['docs/adr/', 'docs/decisions/']

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const dirName = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
/** The lower-case extension of a path's last segment, with its dot; empty for none and for dot files. */
export const extensionOf = (path: string): string => {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

/** Directory patterns of workspaces as regular expressions over one level (`packages/*`, `apps/web`); `!` patterns are left out. */
function workspaceDirs(patterns: readonly string[], paths: readonly string[]): string[] {
  const dirs = new Set<string>()
  for (const pattern of patterns) {
    const trimmed = pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '')
    if (trimmed.length === 0 || trimmed.startsWith('!') || trimmed.includes('..')) continue
    const regex = new RegExp(`^${trimmed.split('/').map(part => (part === '*' || part === '**' ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`)
    for (const path of paths) {
      const dir = dirName(path)
      if (dir.length > 0 && regex.test(dir)) dirs.add(dir)
    }
  }
  return [...dirs]
}

function stacksOf(manifests: readonly string[], manager: string | undefined, tracked: readonly string[]): Stack[] {
  const names = new Set(manifests.map(baseName))
  const stacks: Stack[] = []
  if (names.has('package.json')) stacks.push(manager === 'pnpm' ? 'node-pnpm' : manager === 'yarn' ? 'node-yarn' : manager === 'bun' ? 'node-bun' : 'node-npm')
  if (names.has('deno.json')) stacks.push('deno')
  if (names.has('uv.lock')) stacks.push('python-uv')
  else if (names.has('poetry.lock')) stacks.push('python-poetry')
  else if (names.has('pyproject.toml') || names.has('setup.cfg') || names.has('Pipfile.lock') || [...names].some(name => /^requirements.*\.txt$/.test(name))) stacks.push('python')
  if (names.has('go.mod') || names.has('go.work')) stacks.push('go')
  if (names.has('Cargo.toml')) stacks.push('rust')
  if (names.has('CMakeLists.txt')) stacks.push('cmake')
  if (names.has('meson.build')) stacks.push('meson')
  if (names.has('pom.xml')) stacks.push('java-maven')
  if ([...names].some(name => name.startsWith('build.gradle'))) stacks.push('java-gradle')
  if (names.has('Gemfile')) stacks.push('ruby')
  if (names.has('composer.json')) stacks.push('php')
  if ([...names].some(name => /\.(?:csproj|sln)$/.test(name))) stacks.push('dotnet')
  if (tracked.some(path => extensionOf(path) === '.sh')) stacks.push('shell')
  return stacks
}

/** The candidates one source file names, by its kind. */
function extractFrom(path: string, text: string, manager: PackageManager): Extracted {
  const name = baseName(path)
  if (name === 'package.json') return packageJsonCandidates(text, path, manager)
  if (name === 'deno.json') return denoCandidates(text, path)
  if (name === 'pyproject.toml') return pyprojectCandidates(text, path)
  if (isCiPath(path)) return path === 'Jenkinsfile' ? { candidates: [] } : yamlCandidates(text, path, 'ci')
  if (name === '.pre-commit-config.yaml') return preCommitCandidates(text, path)
  if (path.startsWith('.husky/')) return huskyCandidates(text, path)
  if (/^\.?lefthook\.ya?ml$/.test(name)) return yamlCandidates(text, path, 'hook-tool')
  if (/^(?:GNU)?[Mm]akefile$/.test(name)) return makefileCandidates(text, path)
  if (/^\.?[Jj]ustfile$/.test(name)) return justfileCandidates(text, path)
  if (/^Taskfile\.ya?ml$/.test(name)) return taskfileCandidates(text, path)
  if (name === 'tox.ini') return toxCandidates(text, path)
  if (name === 'noxfile.py') return noxCandidates(text, path)
  return { candidates: [] }
}

/** The repository-relative paths under the root that a scan without HEAD reads from the working tree: root files and the CI, hook and workspace directories. */
async function worktreePaths(root: string): Promise<string[]> {
  const out: string[] = []
  const list = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(join(root, dir), { withFileTypes: true })
    }
    catch {
      return
    }
    for (const entry of entries) {
      const rel = dir.length === 0 ? entry.name : `${dir}/${entry.name}`
      if (entry.isFile()) out.push(rel)
      else if (entry.isDirectory() && depth > 0 && entry.name !== '.git' && entry.name !== 'node_modules') await list(rel, depth - 1)
    }
  }
  await list('', 0)
  for (const dir of ['.github/workflows', '.circleci', '.husky', '.workflow']) await list(dir, 0)
  await list('.gitee', 3)
  return out
}

/** A working-tree file under the root, not a symbolic link, at most `limit` bytes; undefined otherwise. */
async function readWorktree(root: string, rel: string, limit: number): Promise<{ text?: string, tooLarge?: boolean }> {
  const base = resolve(root)
  const full = resolve(base, rel)
  if (!full.startsWith(base.endsWith(sep) ? base : base + sep)) return {}
  try {
    const info = await lstat(full)
    if (!info.isFile()) return {}
    if (info.size > limit) return { tooLarge: true }
    return { text: await readFile(full, 'utf8') }
  }
  catch {
    return {}
  }
}

/** The top-level entries of a non-git directory that path rule 2 does not ignore; the graph directory and the parents that only hold it are ignored when it has no `.json` file (§3.4, F47). */
async function looseEntries(root: string, graphRel: string | undefined): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  }
  catch {
    return []
  }
  const chain = graphRel === undefined ? [] : graphRel.split('/')
  const loose: string[] = []
  for (const entry of entries) {
    if (isIgnorableEntry(entry.name, entry.isDirectory())) continue
    if (entry.isDirectory() && chain[0] === entry.name && await onlyHoldsGraph(join(root, entry.name), chain.slice(1))) continue
    loose.push(entry.isDirectory() ? `${entry.name}/` : entry.name)
  }
  return loose.sort()
}

/** Whether `dir` holds nothing but the rest of the graph chain, and the graph directory at the end has no `.json` file anywhere in it. */
async function onlyHoldsGraph(dir: string, rest: readonly string[]): Promise<boolean> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch {
    return false
  }
  if (rest.length === 0) return !await holdsJson(dir, 4)
  const [only] = entries
  if (entries.length !== 1 || only === undefined || !only.isDirectory() || only.name !== rest[0]) return false
  return await onlyHoldsGraph(join(dir, only.name), rest.slice(1))
}

async function holdsJson(dir: string, depth: number): Promise<boolean> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch {
    return false
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) return true
    if (entry.isDirectory() && depth > 0 && await holdsJson(join(dir, entry.name), depth - 1)) return true
  }
  return false
}

/** The graph directory relative to the root (posix), when it lies under it. */
function graphRelOf(root: string, graphDir: string): string | undefined {
  const rel = relative(root, resolve(root, graphDir))
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return undefined
  return rel.split(sep).join(posix.sep)
}

/**
 * Scan `root` (the project root `prepare` found, §4.1). Never throws: a
 * step that fails is a fact of the result (`git.state`, `unreadable`,
 * `truncated`).
 */
export async function scanWorkspace(root: string, options: ScanOptions): Promise<ScanOutput> {
  const now = options.now ?? Date.now
  const started = now()
  const deadline = options.deadline ?? started + SCAN_DEADLINE_MS
  const truncated: string[] = []
  const left = (): number => deadline - now()
  const git = async (step: string, args: readonly string[], maxBuffer?: number): Promise<GitRun | undefined> => {
    if (left() <= 0) {
      truncated.push(step)
      return undefined
    }
    const run = await runGit(root, args, Math.max(1, Math.min(GIT_CALL_MS, left())), maxBuffer)
    if (run.cut) truncated.push(step)
    return run
  }

  const graphRel = graphRelOf(root, options.graphDir)
  const nodeFiles = graphNodeFiles(options.graphDir)
  const graph = { dir: options.graphDir, ...(graphRel === undefined ? {} : { rel: graphRel }), present: isProjectGraph(nodeFiles), nodes: nodeFiles.length }
  const issues = { read: false as const, reason: 'the scan starts no program but git (bootstrap-scan #3); read the issues yourself if they matter' }

  const top = await git('git', ['rev-parse', '--show-toplevel'])
  let gitFacts: GitFacts
  let tracked: string[] = []
  let trackedCount = 0
  let history: string[] = []
  if (top === undefined || top.cut) gitFacts = { state: 'unread' }
  else if (top.missing) gitFacts = { state: 'missing' }
  else if (top.code !== 0) gitFacts = { state: 'none' }
  else {
    const headRun = await git('git:head', ['rev-parse', '--verify', '-q', 'HEAD'])
    const head = headRun?.code === 0 ? headRun.out.trim() : undefined
    let branch: string | undefined
    let commits = 0
    let firstCommitAt: string | undefined
    let lastCommitAt: string | undefined
    let tags: string[] = []
    if (head !== undefined) {
      const branchRun = await git('git:branch', ['symbolic-ref', '-q', '--short', 'HEAD'])
      if (branchRun?.code === 0 && branchRun.out.trim().length > 0) branch = branchRun.out.trim()
      const countRun = await git('git:count', ['rev-list', '--count', 'HEAD'])
      commits = countRun?.code === 0 ? Number.parseInt(countRun.out.trim(), 10) || 0 : 0
      const lastRun = await git('git:last', ['log', '-1', '--format=%cI'])
      if (lastRun?.code === 0 && lastRun.out.trim().length > 0) lastCommitAt = lastRun.out.trim()
      // `git log --reverse --max-count=1` would give the newest commit (the count is applied before the order); the root commits are the first ones.
      const firstRun = await git('git:first', ['log', '--max-parents=0', '--format=%cI', 'HEAD'])
      const roots = firstRun?.code === 0 ? firstRun.out.split('\n').map(line => line.trim()).filter(line => line.length > 0).sort() : []
      if (roots[0] !== undefined) firstCommitAt = roots[0]
      const logRun = await git('git:history', ['log', `--max-count=${MAX_HISTORY}`, '--format=%H%x09%cs%x09%s'])
      // The commit id and the date stay as they are (a full id is hex the redaction would hide); the subject is the free text.
      history = logRun?.code === 0
        ? logRun.out.split('\n').filter(line => line.length > 0).map((line) => {
          const [hash = '', date = '', ...subject] = line.split('\t')
          return `${hash}\t${date}\t${clean(subject.join(' ').slice(0, SUBJECT_LIMIT))}`
        })
        : []
      const tagRun = await git('git:tags', ['tag', '--sort=-creatordate'])
      tags = tagRun?.code === 0 ? tagRun.out.split('\n').map(line => line.trim()).filter(line => line.length > 0).slice(0, MAX_TAGS).map(clean) : []
    }
    const remoteRun = await git('git:remotes', ['config', '--get-regexp', '^remote\\..*\\.url$'])
    const remotes = remoteRun?.code === 0
      ? remoteRun.out.split('\n').map(line => /^remote\.(.+)\.url\s+(.+)$/.exec(line.trim())).filter(match => match !== null).map(match => ({ name: match[1] ?? '', url: clean(withoutUserInfo(match[2] ?? '')) }))
      : []
    const filesRun = await git('git:files', ['ls-files', '-z'])
    const all = filesRun?.code === 0 ? filesRun.out.split('\0').filter(path => path.length > 0) : []
    trackedCount = all.length
    tracked = all.slice(0, MAX_TRACKED)
    gitFacts = {
      state: 'repo',
      toplevel: top.out.trim(),
      ...(head === undefined ? {} : { head }),
      ...(branch === undefined ? {} : { branch }),
      commits,
      ...(firstCommitAt === undefined ? {} : { firstCommitAt }),
      ...(lastCommitAt === undefined ? {} : { lastCommitAt }),
      remotes,
      tags,
      submodules: [],
      lfs: [],
    }
  }

  // The source files: from HEAD's tree when there is a commit, from the working tree in a repository without one, none outside git.
  const head = gitFacts.state === 'repo' ? gitFacts.head : undefined
  const from: ScanResult['sources']['from'] = gitFacts.state !== 'repo' ? 'none' : head === undefined ? 'worktree' : 'head'
  const pool = from === 'head' ? tracked : from === 'worktree' ? await worktreePaths(root) : []
  let budget = TOTAL_LIMIT
  const texts = new Map<string, string>()
  const read = async (path: string): Promise<string | undefined> => {
    if (texts.has(path)) return texts.get(path)
    if (left() <= 0 || budget <= 0) {
      truncated.push(`file:${path}`)
      return undefined
    }
    let text: string | undefined
    if (from === 'head') {
      // Out of time, or more than the file limit: `git` lists the step as truncated.
      const run = await git(`file:${path}`, ['show', `HEAD:${path}`], Math.min(FILE_LIMIT, budget))
      if (run?.code === 0) text = run.out
    }
    else {
      const got = await readWorktree(root, path, Math.min(FILE_LIMIT, budget))
      if (got.tooLarge === true) truncated.push(`file:${path}`)
      text = got.text
    }
    if (text !== undefined) {
      budget -= Buffer.byteLength(text)
      texts.set(path, text)
    }
    return text
  }

  const rootManifests = pool.filter(path => !path.includes('/') && isManifestName(path))
  const workspacePatterns: string[] = []
  if (rootManifests.includes('package.json')) workspacePatterns.push(...packageWorkspaces(await read('package.json') ?? ''))
  if (rootManifests.includes('pnpm-workspace.yaml')) workspacePatterns.push(...pnpmWorkspaces(await read('pnpm-workspace.yaml') ?? ''))
  if (rootManifests.includes('Cargo.toml')) workspacePatterns.push(...cargoMembers(await read('Cargo.toml') ?? ''))
  let memberPool = pool
  if (from === 'worktree' && workspacePatterns.length > 0) {
    const extra: string[] = []
    for (const pattern of workspacePatterns) {
      const parent = pattern.replace(/^\.\//, '').replace(/\/\*\*?$/, '').replace(/\/+$/, '')
      if (parent.includes('..') || parent.includes('*')) continue
      const dirs = pattern.endsWith('*') ? (await readdir(join(root, parent), { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory()).map(entry => `${parent}/${entry.name}`) : [parent]
      for (const dir of dirs) {
        const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])
        extra.push(...entries.filter(entry => entry.isFile()).map(entry => `${dir}/${entry.name}`))
      }
    }
    memberPool = [...pool, ...extra]
  }
  const members = new Set(workspaceDirs(workspacePatterns, memberPool))
  const manifests = [...rootManifests, ...memberPool.filter(path => members.has(dirName(path)) && isManifestName(baseName(path)))]
  const ci = pool.filter(isCiPath)
  const taskFiles = pool.filter(path => TASK_FILES.has(path))
  const hookTools = pool.filter(isHookToolPath)
  const manager = packageManagerOf(rootManifests.includes('package.json') ? await read('package.json') : undefined, rootManifests)

  const candidates: CommandCandidate[] = []
  const unreadable: Unreadable[] = []
  // Commands come from the root manifests, the CI, the task files and the hook tools; a member's manifest names the member's ecosystem only.
  for (const path of [...rootManifests.filter(name => ['package.json', 'deno.json', 'pyproject.toml'].includes(name)), ...ci, ...taskFiles, ...hookTools]) {
    const text = await read(path)
    if (text === undefined) continue
    const extracted = extractFrom(path, text, manager)
    candidates.push(...extracted.candidates.map(candidate => ({
      ...candidate,
      text: clean(candidate.text),
      ...(candidate.expanded === undefined ? {} : { expanded: candidate.expanded.map(clean) }),
    })))
    if (extracted.unreadable !== undefined) unreadable.push(extracted.unreadable)
  }

  let submodules: string[] = []
  let lfs: string[] = []
  if (pool.includes('.gitmodules')) submodules = [...(await read('.gitmodules') ?? '').matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)].map(match => match[1] ?? '')
  if (pool.includes('.gitattributes')) lfs = (await read('.gitattributes') ?? '').split(/\r?\n/).filter(line => /\bfilter=lfs\b/.test(line)).map(line => line.trim().split(/\s+/)[0] ?? '').filter(pattern => pattern.length > 0)
  if (gitFacts.state === 'repo') gitFacts = { ...gitFacts, submodules, lfs }

  const pyprojectTools = rootManifests.includes('pyproject.toml')
    ? tomlTables(await read('pyproject.toml') ?? '').filter(table => table.startsWith('tool.')).map(table => table.split('.')[1] ?? '').filter((name, index, list) => name.length > 0 && list.indexOf(name) === index)
    : []
  const configs = pool.filter(path => CHECKER_CONFIGS.some(pattern => pattern.test(baseName(path))))

  const byExtension: Record<string, number> = {}
  let code = 0
  const topDirs = new Set<string>()
  for (const path of tracked) {
    const extension = extensionOf(path)
    if (extension.length > 0) byExtension[extension] = (byExtension[extension] ?? 0) + 1
    if (CODE_EXTENSIONS.has(extension)) code += 1
    if (path.includes('/')) topDirs.add(`${path.slice(0, path.indexOf('/'))}/`)
  }

  const docSource = from === 'head' ? tracked : pool
  const docFiles: { path: string, bytes: number }[] = []
  for (const path of docSource.filter(path => /^docs?\/.+\.md$/i.test(path)).slice(0, MAX_DOCS)) {
    const info = await lstat(join(root, path)).catch(() => undefined)
    docFiles.push({ path: clean(path), bytes: info?.isFile() === true ? info.size : 0 })
  }
  const docs = {
    root: docSource.filter(path => !path.includes('/') && DOC_ROOT.test(path)).map(clean),
    files: docFiles,
    adr: ADR_DIRS.filter(dir => docSource.some(path => path.startsWith(dir))),
  }
  const loose = gitFacts.state === 'none' ? await looseEntries(root, graphRel) : []

  const scan: ScanResult = {
    version: 1,
    root,
    at: new Date(started).toISOString(),
    ms: Math.max(0, now() - started),
    git: gitFacts,
    files: { tracked: trackedCount, code, byExtension, topDirs: [...topDirs].sort().map(clean) },
    workspace: { loose: loose.map(clean) },
    stacks: stacksOf(manifests, rootManifests.includes('package.json') ? manager : undefined, tracked),
    sources: { from, manifests, ci, taskFiles, hookTools },
    candidates,
    unreadable,
    checkers: { configs, pyprojectTools },
    docs,
    issues,
    graph,
    truncated,
  }
  return { scan: fitScan(scan), files: tracked.map(clean), history }
}

/** The scan as written: at most 1 MiB of JSON, dropping doc entries and then candidates from the end, and saying so (§3.3). */
function fitScan(scan: ScanResult): ScanResult {
  let fitted = scan
  const size = (value: ScanResult): number => Buffer.byteLength(JSON.stringify(value))
  if (size(fitted) <= SCAN_JSON_LIMIT) return fitted
  fitted = { ...fitted, docs: { ...fitted.docs, files: [] }, truncated: [...fitted.truncated, 'scan.json'] }
  let candidates = [...fitted.candidates]
  while (size(fitted) > SCAN_JSON_LIMIT && candidates.length > 0) {
    candidates = candidates.slice(0, Math.floor(candidates.length / 2))
    fitted = { ...fitted, candidates }
  }
  return fitted
}

/** Write `scan.json`, `files.txt` and `history.tsv` into `dir` (the takeover's `.llm/bootstrap/<id>/`). */
export async function writeScan(dir: string, output: ScanOutput): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'scan.json'), `${JSON.stringify(output.scan, null, 2)}\n`)
  await writeFile(join(dir, 'files.txt'), output.files.map(path => `${path}\n`).join(''))
  await writeFile(join(dir, 'history.tsv'), output.history.map(line => `${line}\n`).join(''))
}
