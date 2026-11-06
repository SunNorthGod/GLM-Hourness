/**
 * The rules board's one way in (docs/ORCHESTRATION.md §16; design §7.4):
 * `apply(actor, request)`. The row's commands, tests and (later) tools write
 * through it and nothing else. A write is checked, planned, recorded and
 * exported in this order, under the write lock:
 *
 * 1. the request is well formed (request.ts) and the actor may do the
 *    operation (permissions.ts); the actor is the entry's, never the request's;
 * 2. the lock is taken, and what a read finds is persisted first (recovery,
 *    the rules file's start or change), so the write starts from a state the
 *    journal vouches for;
 * 3. the revision the caller saw is still the current one;
 * 4. the plan (plan.ts): every change the write makes, as values, the
 *    clean-up and expiry the clock calls for, and the digest of the state
 *    after (the plan reads the clock, the heartbeats and the journal;
 *    `applyRecord` never does);
 * 5. the lock is still this writer's, a journal that is full is set aside
 *    (store.ts `rotateJournal`), the record is appended and synced, the
 *    snapshot is replaced, the rules file is exported when the part a person
 *    decided changed.
 *
 * A refused request writes no file. Step 5's file export may be deferred
 * (git is merging) or fail; the write has happened either way, and the state
 * says the file is owed. `repo-adopt` and `repo-restore` settle an outside
 * change to the rules file with the record repo.ts makes for them (steps 4
 * and 5 are theirs); they do no clean-up and no rotation, the next write does.
 */
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireLock, type LockEnvironment, realLockEnvironment, type WriteLock } from '../data/lock.ts'
import type { JournalRecord, ProjectState, RulesActor } from './model.ts'
import { refusalFor } from './permissions.ts'
import { planWrite } from './plan.ts'
import { parseRequest, type Request } from './request.ts'
import { adoptRepoLocked, exportRepo, putScriptFiles, restoreRepoLocked, settleLocked, settleProject, type ProjectRead } from './repo.ts'
import { appendRecord, ensureRuntimeDir, journalIsFull, realStoreIo, ROTATE_BYTES, rotateJournal, rulesPaths, stamp, writeSnapshot, type RulesPaths, type StoreIo } from './store.ts'

export interface ApplyError {
  /** `conflict`: the request is sound and the state does not allow it (the rule is not in force, there is no such ticket). */
  readonly code: 'forbidden' | 'conflict' | 'invalid' | 'busy' | 'io' | 'stale_revision'
  readonly message: string
  readonly hint?: string
}

type ApplyResult =
  | {
    readonly ok: true
    /** False when the request asked for what is so already: nothing was written. */
    readonly changed: boolean
    readonly state: ProjectState
    /** What happened to the rules file in the repository: written, removed (nothing is decided any more), put off for git, not written, or not touched. */
    readonly file: 'written' | 'removed' | 'deferred' | 'failed' | 'unchanged'
    /** The ticket, notice or rule the write was about, when it made one: the id a caller needs (`ticket-open`, `notice-add`). */
    readonly target?: string
    /** `repo-adopt`: the entries whose script a person has not read on this machine and which do not run until one has. */
    readonly repinNeeded?: readonly string[]
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
  /** The size at which the journal is set aside (design §7.6). Default 8 MiB; a spec makes it small. */
  readonly rotateAtBytes?: number
}

function fail(code: ApplyError['code'], message: string, hint?: string): ApplyResult {
  return { ok: false, error: { code, message, ...(hint === undefined ? {} : { hint }) } }
}

/** Open the board of one project. Nothing is read or created until a method is called. */
export function openRulesBoard(options: BoardOptions): RulesBoard {
  const paths = rulesPaths(options.projectRoot, options.rulesDir)
  const io = options.io ?? realStoreIo
  const environment = options.lock ?? realLockEnvironment
  const rotateAt = options.rotateAtBytes ?? ROTATE_BYTES

  async function write(actor: RulesActor, request: Request): Promise<ApplyResult> {
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
      const read = await settleLocked(paths, io)
      const { state, load, repo } = read
      if (request.rev !== undefined && request.rev !== state.seq) return fail('stale_revision', `规则板已经是第 ${state.seq} 版，不是你看到的第 ${request.rev} 版`)
      if (request.op === 'repo-adopt') {
        const adopted = await adoptRepoLocked(paths, read, io)
        if (!adopted.ok) return fail('conflict', adopted.reason)
        return { ok: true, changed: adopted.changed, state: adopted.state, file: 'unchanged', ...(adopted.needsRepin.length === 0 ? {} : { repinNeeded: adopted.needsRepin }) }
      }
      if (request.op === 'repo-restore') {
        const restored = await restoreRepoLocked(paths, read, io)
        return { ok: true, changed: restored.changed, state: restored.state, file: restored.file }
      }
      // A journal that is full is set aside before the record, which then follows the base the new journal begins with.
      const rotate = journalIsFull(paths, rotateAt)
      const now = new Date(io.now())
      const plan = planWrite({ now, seq: load.nextSeq + (rotate ? 1 : 0), paths, actor }, state, request)
      if (!plan.ok) return fail(plan.code, plan.message)
      if (!plan.changed) return { ok: true, changed: false, state, file: 'unchanged' }
      // The script of an accepted proposal is in the repository before the record that pins its hash.
      if (plan.scriptFiles !== undefined) {
        const refused = await putScriptFiles(paths, plan.scriptFiles, io)
        if (refused !== undefined) return fail('io', refused)
      }
      const record: JournalRecord = {
        seq: load.nextSeq + (rotate ? 1 : 0),
        at: now.toISOString(),
        actor,
        op: request.op,
        ...(plan.target === undefined ? {} : { target: plan.target }),
        ...(plan.from === undefined ? {} : { from: plan.from }),
        ...(plan.to === undefined ? {} : { to: plan.to }),
        reason: plan.reason,
        ...(plan.evidence === undefined ? {} : { evidence: plan.evidence }),
        changes: plan.changes,
        snapshot: plan.snapshot,
      }
      if (!await lock.held()) return fail('busy', '规则板的写锁被别的写入者接手了，这次没有写，过一会儿再打一次')
      // A rules file the board could not read is about to be written over: keep what it held.
      if (plan.rewrite !== undefined && repo.kind === 'unreadable') await copyFile(paths.rulesFile, join(paths.runtimeDir, `.rules.json.outside-${stamp(io.now())}`))
      if (rotate) await rotateJournal(paths, state, load.nextSeq, io)
      await appendRecord(paths, record)
      await writeSnapshot(paths, plan.next, io)
      const file = plan.rewrite === undefined ? 'unchanged' : await exportRepo(paths, plan.rewrite.part, io)
      return { ok: true, changed: true, state: plan.next, file, ...(plan.target === undefined ? {} : { target: plan.target }) }
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
