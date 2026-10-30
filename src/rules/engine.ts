/**
 * The rules board's one way in (docs/ORCHESTRATION.md §16; design §7.4):
 * `apply(actor, mutation)`. The row's command, tests and (later) tools write
 * through it and nothing else. A write is checked, planned, recorded and
 * exported in this order, under the write lock:
 *
 * 1. the actor may do the operation (permissions.ts) and the request is well formed;
 * 2. the lock is taken, and what a read finds is persisted first (recovery,
 *    the rules file's start or change), so the write starts from a state the
 *    journal vouches for;
 * 3. the revision the caller saw is still the current one;
 * 4. the plan: every change the write makes, as values, with the digest of
 *    the state after it (the plan reads the clock; `applyRecord` never does);
 * 5. the lock is still this writer's, the record is appended and synced,
 *    the snapshot is replaced, the rules file is exported.
 *
 * A refused request writes no file. Step 5's file export may be deferred
 * (git is merging) or fail; the write has happened either way, and the state
 * says the file is owed.
 */
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireLock, type LockEnvironment, realLockEnvironment, type WriteLock } from '../data/lock.ts'
import { effectivePeakMode, parsePeakLevel, repoJson, repoPart, stateProblem, type Change, type JournalRecord, type PeakLevel, type PeakModeSetting, type ProjectState, type RulesActor } from './model.ts'
import { refusalFor } from './permissions.ts'
import { exportRepo, settleLocked, settleProject, type ProjectRead } from './repo.ts'
import { appendRecord, applyRecord, ensureRuntimeDir, realStoreIo, rulesPaths, stamp, stateDigest, textDigest, writeSnapshot, type RulesPaths, type StoreIo } from './store.ts'
import { PEAK_LEVEL_WORDS } from '../shared/peak-mode.ts'

/** The request for the one write there is. `rev` is the sequence number the caller read; a newer state refuses the write. */
interface PeakModeSet {
  readonly op: 'peak-mode-set'
  readonly level: PeakLevel
  readonly rev?: number
  /** Why, in the entry's words, for the journal. */
  readonly reason?: string
}

export interface ApplyError {
  readonly code: 'forbidden' | 'invalid' | 'busy' | 'io' | 'stale_revision' | 'internal'
  readonly message: string
  readonly hint?: string
}

type ApplyResult =
  | {
    readonly ok: true
    /** False when the level was already the person's choice: nothing was written. */
    readonly changed: boolean
    readonly state: ProjectState
    /** What happened to the rules file in the repository. */
    readonly file: 'written' | 'deferred' | 'failed' | 'unchanged'
  }
  | { readonly ok: false, readonly error: ApplyError }

export interface RulesBoard {
  readonly paths: RulesPaths
  apply(actor: RulesActor, request: unknown): Promise<ApplyResult>
  /** Persist what a read of the project found; see settleProject. */
  settle(): Promise<ProjectRead | 'busy'>
}

export interface BoardOptions {
  readonly projectRoot: string
  /** The rules directory in the repository, relative to the root unless absolute. Default docs/rules. */
  readonly rulesDir?: string
  readonly io?: StoreIo
  readonly lock?: LockEnvironment
}

function fail(code: ApplyError['code'], message: string, hint?: string): ApplyResult {
  return { ok: false, error: { code, message, ...(hint === undefined ? {} : { hint }) } }
}

function parseRequest(request: unknown): PeakModeSet | string {
  if (typeof request !== 'object' || request === null) return '请求不是对象'
  const { op, level, rev, reason } = request as Record<string, unknown>
  if (op !== 'peak-mode-set') return `op ${JSON.stringify(op)} 不认识`
  if (typeof level !== 'string' || parsePeakLevel(level) !== level) return `level 要是 ${Object.keys(PEAK_LEVEL_WORDS).join('、')} 之一`
  if (rev !== undefined && (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 0)) return 'rev 要是非负整数'
  if (reason !== undefined && typeof reason !== 'string') return 'reason 要是字符串'
  return { op, level, ...(rev === undefined ? {} : { rev }), ...(reason === undefined ? {} : { reason }) }
}

/** Open the board of one project. Nothing is read or created until a method is called. */
export function openRulesBoard(options: BoardOptions): RulesBoard {
  const paths = rulesPaths(options.projectRoot, options.rulesDir)
  const io = options.io ?? realStoreIo
  const environment = options.lock ?? realLockEnvironment

  async function write(actor: RulesActor, request: PeakModeSet): Promise<ApplyResult> {
    let lock: WriteLock | 'busy'
    try {
      await ensureRuntimeDir(paths)
      lock = await acquireLock(paths.lock, environment)
    }
    catch (error) {
      return fail('io', `没写成：${error instanceof Error ? error.message : String(error)}`)
    }
    if (lock === 'busy') return fail('busy', '规则板正忙，过一会儿再打一次')
    try {
      const { state, load, repo } = await settleLocked(paths, io)
      // A rules file the board could not read is about to be written over: keep what it held.
      if (repo.kind === 'unreadable') await copyFile(paths.rulesFile, join(paths.runtimeDir, `.rules.json.outside-${stamp(io.now())}`))
      if (request.rev !== undefined && request.rev !== state.seq) return fail('stale_revision', `规则板已经是第 ${state.seq} 版，不是你看到的第 ${request.rev} 版`)
      const current = effectivePeakMode(state)
      if (current.origin === 'human' && current.level === request.level && state.repo.outside === undefined && state.repo.digest !== null) {
        return { ok: true, changed: false, state, file: 'unchanged' }
      }
      const at = new Date(io.now()).toISOString()
      const setting: PeakModeSetting = { level: request.level, at, origin: { actor: 'human' } }
      const seq = load.nextSeq
      const decided = { ...state, peakMode: setting }
      const part = repoPart(decided)
      if (part === undefined) return fail('internal', '没有可导出的内容')
      const changes: Change[] = [
        { path: ['peakMode'], value: setting },
        { path: ['repo'], value: { digest: textDigest(repoJson(part)) } },
      ]
      const next = applyRecord(state, { seq, changes })
      const problem = stateProblem(next)
      if (problem !== undefined) return fail('internal', `写后的状态不合法：${problem}`)
      const record: JournalRecord = {
        seq,
        at,
        actor,
        op: request.op,
        target: 'peakMode',
        from: current.level,
        to: request.level,
        reason: request.reason ?? `人把高峰模式改成了「${PEAK_LEVEL_WORDS[request.level].name}」`,
        changes,
        snapshot: stateDigest(next),
      }
      if (!await lock.held()) return fail('busy', '规则板的写锁被别的写入者接手了，这次没有写，过一会儿再打一次')
      await appendRecord(paths, record)
      await writeSnapshot(paths, next, io)
      return { ok: true, changed: true, state: next, file: await exportRepo(paths, part, io) }
    }
    catch (error) {
      return fail('io', `没写成：${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
      await lock.release()
    }
  }

  return {
    paths,
    async apply(actor, request) {
      const parsed = parseRequest(request)
      if (typeof parsed === 'string') return fail('invalid', parsed)
      const refusal = refusalFor(actor, parsed.op)
      if (refusal !== undefined) return fail('forbidden', refusal.message, refusal.hint)
      return write(actor, parsed)
    },
    settle: () => settleProject(paths, io, environment),
  }
}
