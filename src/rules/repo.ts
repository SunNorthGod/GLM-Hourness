/**
 * The rules file in the repository (docs/ORCHESTRATION.md §16; design §7.1,
 * §7.5): what the person decided, exported to `<rules dir>/rules.json` so it
 * travels with git, is reviewed and survives a new machine. Judgments follow
 * the journal in `.llm/rules/`, not this file: git switches and merges can
 * replace it, and a script can edit it, so a file the board did not write is
 * never trusted. The board compares the file with the digest it recorded
 * when it last wrote it:
 *
 * - no state of its own yet (a new clone, a deleted `.llm/`): the state
 *   starts from the file, in a `base` record;
 * - the file is what the board wrote: in sync;
 * - the board wrote it and someone else changed it: the change does not take
 *   effect; the file is copied aside and the difference is recorded in the
 *   state (`repo.outside`) until the file is the board's again;
 * - the board owes a write (git was merging or rebasing when it wrote): the
 *   write is made when git is done.
 *
 * A person settles an outside change one of two ways, each a record of the
 * person in the journal: `adoptRepoLocked` (`repo-adopt`) makes the file's
 * decisions the state's, and `restoreRepoLocked` (`repo-restore`) writes the
 * board's own file back. The engine's operations of the same names call them
 * under its write lock, after `settleLocked`.
 *
 * Nothing here commits, stages or switches anything in git.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireLock, type LockEnvironment, realLockEnvironment } from '../data/lock.ts'
import { gitDirOf } from '../data/project-root.ts'
import { adoptRepo, diffRepo, parseRepoRules, repoJson, repoPart, stateFromRepo, stateProblem, unapprovedScripts, type Change, type JournalRecord, type ProjectState, type RepoDiffLine, type RepoRules } from './model.ts'
import { appendRecord, applyRecord, changesBetween, ensureRuntimeDir, loadState, persistLoad, readText, realStoreIo, stamp, stateDigest, textDigest, writeAtomic, writeSnapshot, type LoadResult, type RulesPaths, type StoreIo } from './store.ts'

/** Files and directories in a git directory that say git is in the middle of something. */
const GIT_MARKERS = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG', 'index.lock']

/** The marker that says git is merging, rebasing, cherry-picking, bisecting or holding the index; undefined when git is quiet or the project is not a repository. */
export function gitOperationIn(root: string): string | undefined {
  const gitDir = gitDirOf(root)
  return gitDir === undefined ? undefined : GIT_MARKERS.find(marker => existsSync(join(gitDir, marker)))
}

type RepoCheck =
  | { readonly kind: 'in-sync' }
  /** The project has no state of its own and the file holds a decision: start from it. */
  | { readonly kind: 'fresh-start', readonly repo: RepoRules, readonly digest: string }
  /** The project has no state of its own and the file cannot be read: start empty, leave the file alone. */
  | { readonly kind: 'unreadable', readonly reason: string }
  /** The board owes a write of the file. */
  | { readonly kind: 'owed' }
  /** Someone else changed the file after the board wrote it, and the state does not know yet. */
  | { readonly kind: 'outside', readonly digest: string, readonly copyFrom: string | undefined, readonly diff: readonly RepoDiffLine[] }
  /** The state already records this change. */
  | { readonly kind: 'outside-known' }
  /** The state records a change that is gone: the file is the board's again. */
  | { readonly kind: 'cleared' }

/** The digest the board recorded when it last wrote the rules file. */
function readRepoWritten(paths: RulesPaths): string | undefined {
  try {
    const value: unknown = JSON.parse(readText(paths.repoWritten) ?? 'null')
    const digest = typeof value === 'object' && value !== null ? (value as { digest?: unknown }).digest : undefined
    return typeof digest === 'string' ? digest : undefined
  }
  catch {
    return undefined
  }
}

/** How the rules file stands against the state a load produced. Reads only. */
function checkRepo(paths: RulesPaths, load: LoadResult): RepoCheck {
  const text = readText(paths.rulesFile)
  const here = text === undefined ? null : textDigest(text)
  if (load.fresh) {
    if (text === undefined) return { kind: 'in-sync' }
    const parsed = parseRepoRules(text)
    if (!parsed.ok) return { kind: 'unreadable', reason: parsed.reason }
    const digest = textDigest(text)
    // A file that decides nothing (no peak level, only empty collections) is no start.
    return repoPart(stateFromRepo(parsed.repo, digest)) === undefined ? { kind: 'in-sync' } : { kind: 'fresh-start', repo: parsed.repo, digest }
  }
  const { state } = load
  if (here === state.repo.digest) return state.repo.outside === undefined ? { kind: 'in-sync' } : { kind: 'cleared' }
  const digest = here ?? 'missing'
  if (state.repo.outside?.digest === digest) return { kind: 'outside-known' }
  if (state.repo.digest !== null && readRepoWritten(paths) !== state.repo.digest) return { kind: 'owed' }
  const parsed = text === undefined ? undefined : parseRepoRules(text)
  const diff: readonly RepoDiffLine[] = text === undefined
    ? [{ path: ['rules.json'], change: 'removed' }]
    : parsed?.ok === true ? diffRepo(state, parsed.repo) : [{ path: ['rules.json'], change: 'changed', fields: ['unreadable'] }]
  return { kind: 'outside', digest, copyFrom: text === undefined ? undefined : paths.rulesFile, diff }
}

export interface ProjectRead {
  /** The state to judge by: the journal's, or for a project that starts from the file, the file's. */
  readonly state: ProjectState
  readonly load: LoadResult
  readonly repo: RepoCheck
}

/** The state of a project, read without the lock and without writing anything. */
export function readProject(paths: RulesPaths): ProjectRead {
  const load = loadState(paths)
  const repo = checkRepo(paths, load)
  return { state: repo.kind === 'fresh-start' ? stateFromRepo(repo.repo, repo.digest) : load.state, load, repo }
}

/** Whether a read found something a writer should persist. */
function needsSettling(read: ProjectRead): boolean {
  return read.load.plan !== undefined || read.repo.kind === 'fresh-start' || read.repo.kind === 'owed' || read.repo.kind === 'outside' || read.repo.kind === 'cleared'
}

/**
 * Write the rules file for a state, unless git is in the middle of an
 * operation; then the write waits (`deferred`) and the state says so by
 * differing from what `repo-written.json` recorded.
 */
export async function exportRepo(paths: RulesPaths, part: RepoRules, io: StoreIo = realStoreIo): Promise<'written' | 'deferred' | 'failed'> {
  if (gitOperationIn(paths.projectRoot) !== undefined) return 'deferred'
  try {
    await mkdir(paths.rulesDir, { recursive: true })
    const text = repoJson(part)
    const written = await writeAtomic(paths.rulesFile, text, io)
    if (!written.ok) {
      await unlink(written.temporary).catch(() => {})
      return 'failed'
    }
    await recordWritten(paths, textDigest(text), io)
    return 'written'
  }
  catch {
    return 'failed'
  }
}

/** Note which rules file the board wrote: the next read tells a change from someone else apart by it. */
async function recordWritten(paths: RulesPaths, digest: string, io: StoreIo): Promise<void> {
  const note = await writeAtomic(paths.repoWritten, `${JSON.stringify({ digest, at: new Date(io.now()).toISOString() })}\n`, io)
  if (!note.ok) await unlink(note.temporary).catch(() => {})
}

/** A record of the board's own that changes the state, appended and snapshotted. */
async function commit(paths: RulesPaths, load: LoadResult, op: string, reason: string, changes: readonly Change[], io: StoreIo): Promise<void> {
  const seq = load.nextSeq
  const next = applyRecord(load.state, { seq, changes })
  const record: JournalRecord = { seq, at: new Date(io.now()).toISOString(), actor: 'harness', op, reason, changes, snapshot: stateDigest(next) }
  await appendRecord(paths, record)
  await writeSnapshot(paths, next, io)
}

/**
 * Persist everything a read found, under the write lock the caller holds:
 * the journal's recovery, then the rules file's start, outside change or
 * owed write. Returns the project as it stands after.
 */
export async function settleLocked(paths: RulesPaths, io: StoreIo = realStoreIo): Promise<ProjectRead> {
  const load = await persistLoad(paths, loadState(paths), io)
  const check = checkRepo(paths, load)
  if (check.kind === 'fresh-start') {
    const next: ProjectState = { ...stateFromRepo(check.repo, check.digest), seq: load.nextSeq }
    const record: JournalRecord = { seq: next.seq, at: new Date(io.now()).toISOString(), actor: 'harness', op: 'base', evidence: `从仓库里的规则文件读入（${paths.rulesFile}）`, changes: [], snapshot: stateDigest(next), state: next }
    // The file's digest is noted before the record that names it: a crash between the two leaves a project that starts
    // from the file again, never one whose later outside change would look like a write the board still owes.
    await recordWritten(paths, check.digest, io)
    await appendRecord(paths, record)
    await writeSnapshot(paths, next, io)
  }
  else if (check.kind === 'outside') {
    const copy = check.copyFrom === undefined ? '' : join(paths.runtimeDir, `.rules.json.outside-${stamp(io.now())}`)
    if (check.copyFrom !== undefined) await copyFile(check.copyFrom, copy)
    const repo = { digest: load.state.repo.digest, outside: { digest: check.digest, at: new Date(io.now()).toISOString(), copy, diff: check.diff } }
    await commit(paths, load, 'repo-outside', '仓库里的规则文件被规则板以外改过，没有生效', [{ path: ['repo'], value: repo }], io)
  }
  else if (check.kind === 'cleared') {
    await commit(paths, load, 'repo-outside-cleared', '仓库里的规则文件又和规则板写的一样了', [{ path: ['repo'], value: { digest: load.state.repo.digest } }], io)
  }
  else if (check.kind === 'owed') {
    const part = repoPart(load.state)
    if (part !== undefined) await exportRepo(paths, part, io)
  }
  return readProject(paths)
}

/** Settle a project under the write lock; `busy` when another writer holds it for the whole wait. Takes no lock when the read found nothing to persist. */
export async function settleProject(paths: RulesPaths, io: StoreIo = realStoreIo, environment: LockEnvironment = realLockEnvironment): Promise<ProjectRead | 'busy'> {
  const read = readProject(paths)
  if (!needsSettling(read)) return read
  await ensureRuntimeDir(paths)
  const lock = await acquireLock(paths.lock, environment)
  if (lock === 'busy') return 'busy'
  try {
    return await settleLocked(paths, io)
  }
  finally {
    await lock.release()
  }
}

/** The record of a person's settling of an outside change, and the state it leaves. */
function personRecord(read: ProjectRead, op: string, reason: string, evidence: string | undefined, changes: readonly Change[], io: StoreIo): { readonly record: JournalRecord, readonly next: ProjectState } {
  const seq = read.load.nextSeq
  const next = applyRecord(read.state, { seq, changes })
  const record: JournalRecord = { seq, at: new Date(io.now()).toISOString(), actor: 'human', op, target: 'rules.json', reason, ...(evidence === undefined ? {} : { evidence }), changes, snapshot: stateDigest(next) }
  return { record, next }
}

export type RepoAdoption =
  | {
    readonly ok: true
    /** False when there was no outside change to adopt: nothing was written. */
    readonly changed: boolean
    readonly state: ProjectState
    /** Entries whose script does not run until a person has read it: new or changed in the file. */
    readonly needsRepin: readonly string[]
  }
  | { readonly ok: false, readonly reason: string }

/**
 * `repo-adopt`, the person's: make what the rules file says the state's decisions (design §7.5). One record whose
 * changes are the differences, written under the write lock the caller holds, after `settleLocked`. The file is read
 * and checked whole first and refused when it cannot be read, or is gone. The file is not rewritten; its digest becomes
 * the state's and is noted as the board's, so the file is in sync as the person left it. Rules keep their own origin
 * (the record says who adopted them); a script that is new or changed in the file has no approval.
 */
export async function adoptRepoLocked(paths: RulesPaths, read: ProjectRead, io: StoreIo = realStoreIo): Promise<RepoAdoption> {
  if (read.state.repo.outside === undefined) return { ok: true, changed: false, state: read.state, needsRepin: [] }
  const text = readText(paths.rulesFile)
  if (text === undefined) return { ok: false, reason: '仓库里没有规则文件，没有可照改的内容；要按规则板的存档写回，选「忽略」' }
  const parsed = parseRepoRules(text)
  if (!parsed.ok) return { ok: false, reason: `仓库里的规则文件读不出（${parsed.reason}），不能照改` }
  const digest = textDigest(text)
  const { record, next } = personRecord(read, 'repo-adopt', '人照仓库里的规则文件改了', `仓库里的规则文件摘要 ${digest}`, changesBetween(read.state, adoptRepo(read.state, parsed.repo, digest)), io)
  // What is written is what is checked: the state the record leaves, not the one the file was turned into.
  const problem = stateProblem(next)
  if (problem !== undefined) return { ok: false, reason: `照文件改出来的状态不合法（${problem}），不能照改` }
  // The file's digest is noted before the record that names it: a crash between the two leaves the outside change as it was.
  await recordWritten(paths, digest, io)
  await appendRecord(paths, record)
  await writeSnapshot(paths, next, io)
  return { ok: true, changed: true, state: next, needsRepin: unapprovedScripts(next).map(entry => entry.id) }
}

export type RepoRestoration =
  | {
    readonly ok: true
    /** False when there was no outside change: nothing was written. */
    readonly changed: boolean
    readonly state: ProjectState
    /** What happened to the file: written, removed (nothing is decided), left for later because git is busy, failed, or not touched. */
    readonly file: 'written' | 'removed' | 'deferred' | 'failed' | 'unchanged'
  }

/**
 * `repo-restore`, the person's: write the board's own file back over the one somebody else changed or deleted
 * (design §7.5). The record clears the outside mark first; the file follows. The board's note of what it last wrote is
 * dropped before the record, so a crash or a git operation in between leaves a write the board owes, which the next
 * settle makes, and not an outside change to record again. When nothing is decided the board's file is none and the
 * file is removed (the copy of it made when it was found is kept); during a git operation that removal waits, and the
 * file is found as an outside change again until the person asks once more.
 */
export async function restoreRepoLocked(paths: RulesPaths, read: ProjectRead, io: StoreIo = realStoreIo): Promise<RepoRestoration> {
  if (read.state.repo.outside === undefined) return { ok: true, changed: false, state: read.state, file: 'unchanged' }
  const part = repoPart(read.state)
  const { record, next } = personRecord(read, 'repo-restore', '人让规则板按自己的存档写回了仓库里的规则文件', undefined, [{ path: ['repo'], value: { digest: part === undefined ? null : textDigest(repoJson(part)) } }], io)
  await unlink(paths.repoWritten).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  await appendRecord(paths, record)
  await writeSnapshot(paths, next, io)
  if (part !== undefined) return { ok: true, changed: true, state: next, file: await exportRepo(paths, part, io) }
  if (gitOperationIn(paths.projectRoot) !== undefined) return { ok: true, changed: true, state: next, file: 'deferred' }
  await unlink(paths.rulesFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  return { ok: true, changed: true, state: next, file: 'removed' }
}
