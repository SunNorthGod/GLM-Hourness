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
 * Nothing here commits, stages or switches anything in git.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireLock, type LockEnvironment, realLockEnvironment } from './lock.ts'
import { diffRepo, parseRepoRules, repoJson, repoPart, stateFromRepo, type Change, type JournalRecord, type ProjectState, type RepoDiffLine, type RepoRules } from './model.ts'
import { gitDirOf } from './project-key.ts'
import { appendRecord, applyRecord, loadState, persistLoad, readText, realStoreIo, stamp, stateDigest, textDigest, writeAtomic, writeSnapshot, type LoadResult, type RulesPaths, type StoreIo } from './store.ts'

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
    return parsed.repo.peakMode === undefined ? { kind: 'in-sync' } : { kind: 'fresh-start', repo: parsed.repo, digest: textDigest(text) }
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
    await appendRecord(paths, record)
    await writeSnapshot(paths, next, io)
    await recordWritten(paths, check.digest, io)
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
  await mkdir(paths.runtimeDir, { recursive: true })
  const lock = await acquireLock(paths.lock, environment)
  if (lock === 'busy') return 'busy'
  try {
    return await settleLocked(paths, io)
  }
  finally {
    await lock.release()
  }
}
