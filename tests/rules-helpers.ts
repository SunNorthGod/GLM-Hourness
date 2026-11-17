/**
 * Shared pieces of the rules board specs: a project in a temporary
 * directory (a git repository by its `.git` directory, as src/data/project-root.ts
 * reads it), the board's files by name, a store whose file operations
 * the test can bend, a clock the test moves, and the pieces of a project
 * state the engine does not make by itself (a host's heartbeat, a record
 * an earlier writer left).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'
import { realLockEnvironment, type LockEnvironment } from '../src/data/lock.ts'
import { openRulesBoard, type RulesBoard } from '../src/rules/engine.ts'
import type { Change, JournalRecord, ProjectState, RulesActor } from '../src/rules/model.ts'
import { prepareProposal } from '../src/rules/proposal.ts'
import { appendRecord, applyRecord, ensureRuntimeDir, loadState, realStoreIo, stateDigest, writeSnapshot, type RulesPaths, type StoreIo } from '../src/rules/store.ts'
import { draftOf } from './rules-fixtures.ts'

export interface Project {
  readonly root: string
  readonly board: RulesBoard
}

/** A lock environment that never waits: sleeping advances a fake clock, so `busy` comes at once. */
export function impatientLock(): LockEnvironment {
  let at = realLockEnvironment.now()
  return { ...realLockEnvironment, now: () => at, sleep: (ms) => { at += ms; return Promise.resolve() } }
}

/** File operations with no waiting between retries. */
export function quickIo(overrides: Partial<StoreIo> = {}): StoreIo {
  return { ...realStoreIo, sleep: () => Promise.resolve(), ...overrides }
}

/** A git project in a fresh temporary directory; `body` gets it and the directory is removed afterwards. */
export function projectTest(name: string, body: (project: Project) => Promise<void>, options: { readonly io?: StoreIo, readonly lock?: LockEnvironment } = {}): void {
  test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rules-'))
    try {
      await mkdir(join(root, '.git'))
      await body({ root, board: openRulesBoard({ projectRoot: root, ...(options.io === undefined ? {} : { io: options.io }), ...(options.lock === undefined ? {} : { lock: options.lock }) }) })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

/** A clock the test moves: the moment every record, ticket and expiry of the board is judged by. */
export interface FakeClock {
  readonly now: () => number
  /** Move forward and return the new moment. */
  readonly advance: (ms: number) => number
  readonly iso: () => string
}

export function fakeClock(start: string): FakeClock {
  let at = Date.parse(start)
  return { now: () => at, advance: (ms) => (at += ms), iso: () => new Date(at).toISOString() }
}

export const MINUTE = 60_000
export const HOUR = 3_600_000

export interface ClockedProject {
  readonly root: string
  readonly clock: FakeClock
  readonly board: RulesBoard
  readonly paths: RulesPaths
}

/** A git project with a board on a clock the test moves; `options` are the board's (a small journal size to rotate, for one). */
export function clockedTest(name: string, body: (project: ClockedProject) => Promise<void>, options: { readonly start?: string, readonly rotateAtBytes?: number } = {}): void {
  test(name, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rules-'))
    try {
      await mkdir(join(root, '.git'))
      const clock = fakeClock(options.start ?? '2026-11-03T08:00:00.000Z')
      const board = openRulesBoard({ projectRoot: root, io: quickIo({ now: clock.now }), ...(options.rotateAtBytes === undefined ? {} : { rotateAtBytes: options.rotateAtBytes }) })
      await body({ root, clock, board, paths: board.paths })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

/** A host's heartbeat file, as the host writes it: `<runtime dir>/hosts/<pid>-<start>.json`, stamped with the given moment; `fields` replace or add to the file's other fields (`computed`, `catalog`). */
export async function writeHeartbeat(paths: RulesPaths, host: { readonly pid: number, readonly startedAt: number }, at: string, fields: Readonly<Record<string, unknown>> = {}): Promise<string> {
  const dir = join(paths.runtimeDir, 'hosts')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${host.pid}-${host.startedAt}.json`)
  await writeFile(file, JSON.stringify({ host, at, sessions: [], runner: false, ...fields }))
  return file
}

/** Every file under the project root (git's own directory aside) with its bytes: a refused request must leave this as it was. */
export async function treeOf(root: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {}
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git') await walk(path)
      }
      else tree[relative(root, path).replaceAll('\\', '/')] = await readFile(path, 'utf8')
    }
  }
  await walk(root)
  return tree
}

/** The records of the current journal file. */
export async function journalOf(paths: RulesPaths): Promise<JournalRecord[]> {
  const text = await readFile(paths.journal, 'utf8').catch(() => '')
  return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalRecord)
}

/**
 * A record an earlier writer left, for a state the engine has no operation for yet (a session's rule): the changes are
 * applied to the state as it stands, journaled with the digest they leave, and the snapshot follows.
 */
export async function injectRecord(paths: RulesPaths, changes: readonly Change[], at: string, actor: RulesActor = 'harness', op = 'test-inject'): Promise<ProjectState> {
  const load = loadState(paths)
  const seq = load.nextSeq
  const next = applyRecord(load.state, { seq, changes })
  await ensureRuntimeDir(paths)
  await appendRecord(paths, { seq, at, actor, op, changes, snapshot: stateDigest(next) })
  await writeSnapshot(paths, next, quickIo())
  return next
}

// ------------------------------------------------------- approved script rules

// ------------------------------------------------------- real git repositories

/**
 * Real git for the specs that need a repository: git runs with this machine's
 * and the user's configuration out of the way, and the spec is skipped, with
 * the reason stated, when git is not installed.
 */
const SKIP = spawnSync('git', ['--version']).status === 0 ? false : 'git is not installed on this machine'

/** Run git in a directory with no configuration of the machine or the user in the way. */
export function git(cwd: string, ...args: string[]): string {
  const run = spawnSync('git', ['-c', 'user.name=Rules Test', '-c', 'user.email=rules@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  })
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
  return run.stdout
}

export interface Repository {
  readonly root: string
  readonly board: RulesBoard
  readonly paths: RulesPaths
  /** Commit the rules directory. */
  readonly commit: (message: string) => void
}

/** A git repository in a fresh temporary directory, with a board on it; removed afterwards. */
export function gitTest(name: string, body: (repository: Repository) => Promise<void>): void {
  test(name, { skip: SKIP }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rules-git-'))
    try {
      git(root, 'init', '-q')
      const board = openRulesBoard({ projectRoot: root, io: quickIo() })
      await body({ root, board, paths: board.paths, commit: (message) => { git(root, 'add', 'docs'); git(root, 'commit', '-q', '-m', message) } })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

let scriptProposals = 0

/** A script of node whose text is the body, ending with a line break. */
export const nodeScript = (body: string): string => `${body}\n`

/**
 * A script rule approved the way the human approves (docs/ORCHESTRATION.md
 * §16.15): proposed by an agent, agreed to with the person's word in the
 * graph, and the board writes the script file and pins it with this machine's
 * approval time — so the rule's script is one the gate, `checkCall` and the
 * desk's re-feed really run. `over` replaces fields of the rule draft (the
 * draft's own default condition is dropped: these cases are about the
 * endings, not the clock).
 */
export async function approveScript(root: string, id: string, word: string, text: string, over: Record<string, unknown> = {}, board: RulesBoard = openRulesBoard({ projectRoot: root })): Promise<void> {
  const proposalId = `p-${(++scriptProposals).toString(16).padStart(8, '0')}`
  const draft = draftOf({
    id,
    title: `Script of ${id}`,
    filter: { command: { matches: word } },
    action: { kind: 'script', lang: 'node', text, timeoutSeconds: 10 },
    condition: undefined,
    ...over,
  })
  const made = prepareProposal({ kind: 'rule', body: draft, reason: 'the human asked' }, { state: loadState(board.paths).state, rulesDirFromRoot: 'docs/rules', now: new Date(), via: 'graph', proposedBy: { sessionId: 's-main', agentId: 'agent-main' }, id: proposalId, readScript: () => undefined })
  assert.ok(made.ok, JSON.stringify(made))
  assert.ok((await board.apply('llm', { op: 'propose', proposal: made.proposal })).ok)
  assert.ok((await board.apply('human', { op: 'proposal-accept', id: proposalId, by: 'llm', relay: '可以', question: 'question-1' })).ok)
}
