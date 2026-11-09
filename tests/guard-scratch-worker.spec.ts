/**
 * scratch-only's one exemption (M7 design 0.6 §3.2.1, after the E9
 * real-model run 2): a worker registered by dispatch_task whose plan is
 * approved creates the files of its task, not one-off scripts, so the guard
 * row passes its Write of a new script inside its task's write scope or its
 * approved plan's paths. Every other case is judged as before: a session the
 * register does not hold (the main agent among them), a path outside the
 * scope and the plan, a write before the plan is approved, a reviewer, and a
 * host without the execute row.
 *
 * The guard row runs on the fake rc.3 host over a real git worktree whose
 * `src/` holds no tracked script, the shape of run 2 (src/sum.mjs and
 * src/sum.test.mjs in a fresh task worktree). The execute row's service is a
 * stand-in whose `inApprovedScope` asks the real register and the real
 * predicate `writesPlannedFile`; the row's own member (liveness included) is
 * pinned in tests/execute-row.spec.ts.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply as guardApply } from '../src/guard/index.ts'
import { forgetAttempt, registerAttempt, registeredAttempt, writesPlannedFile, type Attempt } from '../src/execute/attempts.ts'
import { EXECUTE_SERVICE, type ExecuteService } from '../src/shared/execute-service.ts'
import type { AgentLike, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { execTool, fakeRuntime } from './fake-rc3.ts'
import { gitSeed } from './execute-helpers.ts'

const CHILD = 'hz-task-1-a1-abc123'
const SCOPE = ['src/']

/** A repository with README.md committed and the task worktree `.worktrees/hz-task-1` on `hz/task-1`. */
function repoWithWorktree(): { readonly root: string, readonly worktree: string } {
  const root = mkdtempSync(join(tmpdir(), 'guard-scratch-worker-'))
  gitSeed(root)
  const worktree = join(root, '.worktrees', 'hz-task-1')
  const added = spawnSync('git', ['worktree', 'add', '-q', '-b', 'hz/task-1', worktree], { cwd: root, encoding: 'utf8' })
  if (added.status !== 0) throw new Error(`git worktree add failed: ${added.stderr}`)
  return { root, worktree }
}

function attemptOf(worktree: string, over: Partial<Attempt> = {}): Attempt {
  return {
    childId: CHILD, role: 'worker', node: 'task-1', attempt: 1, graphDir: join(worktree, '..', '..', 'docs', 'graph'), worktree, branch: 'hz/task-1',
    provider: 'probe', model: 'probe-model', why: 'one directory', plan: 'approved', planPaths: ['src/sum.mjs', 'src/sum.test.mjs'], pins: 'pins: x',
    ...over,
  }
}

function agentOf(id: string, cwd: string, child: boolean): AgentLike {
  return {
    id,
    ctx: {} as never,
    session: { id, header: { id, cwd, ...(child ? { origin: 'subagent' as const, parentSession: 'main-1' } : {}) }, deriveMessages: () => [], requestHeader: () => ({ config: { provider: 'glm-zcode', model: 'glm-5.3-flash' } }) },
  }
}

const textOf = (result: ToolFinalResult): string => result.content.map(part => part.text ?? '').join('')

/** The guard row on the fake host; `execute` false leaves the execute row out. */
function guardOver(execute: boolean): ReturnType<typeof execTool> {
  const rt = fakeRuntime()
  if (execute) {
    rt.services.set(EXECUTE_SERVICE, {
      isWorker: agentId => registeredAttempt(agentId) !== undefined,
      inApprovedScope: (agentId, target) => {
        const attempt = registeredAttempt(agentId)
        return attempt !== undefined && writesPlannedFile(attempt, SCOPE, target)
      },
      trunkAdvanceFor: () => undefined,
      runAction: () => Promise.resolve({ outcome: 'skipped', reason: 'test' }),
    } satisfies ExecuteService)
  }
  guardApply(rt.ctx as never, {})
  return execTool(rt)
}

async function withWorker(attempt: ((worktree: string) => Attempt) | undefined, run: (fixture: { readonly root: string, readonly worktree: string }) => Promise<void>): Promise<void> {
  const fixture = repoWithWorktree()
  if (attempt !== undefined) registerAttempt(attempt(fixture.worktree))
  try {
    await run(fixture)
  }
  finally {
    forgetAttempt(CHILD)
    // A denial's journal write (and the guard's git check-ignore before it) runs after the call settles.
    await new Promise(resolve => setTimeout(resolve, 300))
    rmSync(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

const isScratchDenial = (result: ToolFinalResult): boolean => result.isError === true && textOf(result).includes('outside the scratch area')

// ---- positive ----

test('scratch-only exemption: a registered worker with an approved plan creates the planned scripts in a directory with none of their kind (run 2: src/sum.mjs, src/sum.test.mjs)', async () => {
  await withWorker(worktree => attemptOf(worktree), async ({ worktree }) => {
    const exec = guardOver(true)
    const agent = agentOf(CHILD, worktree, true)
    for (const file of ['sum.mjs', 'sum.test.mjs']) {
      const result = await exec('write', { file_path: join(worktree, 'src', file), content: 'export {}\n' }, { agent })
      assert.equal(result.isError, false, `${file}: ${textOf(result)}`)
    }
  })
})

test('scratch-only exemption: a path inside the task write scope but not in the plan\'s paths passes too', async () => {
  await withWorker(worktree => attemptOf(worktree, { planPaths: ['src/sum.mjs'] }), async ({ worktree }) => {
    const result = await guardOver(true)('write', { file_path: join(worktree, 'src', 'extra.mjs'), content: 'export {}\n' }, { agent: agentOf(CHILD, worktree, true) })
    assert.equal(result.isError, false, textOf(result))
  })
})

// ---- negative: judged as before ----

test('scratch-only exemption: a session the register does not hold is denied the same write (an unregistered subagent, the main agent)', async () => {
  await withWorker(undefined, async ({ root, worktree }) => {
    const exec = guardOver(true)
    const subagent = await exec('write', { file_path: join(worktree, 'src', 'sum.mjs'), content: 'export {}\n' }, { agent: agentOf(CHILD, worktree, true) })
    assert.ok(isScratchDenial(subagent), textOf(subagent))
    const main = await exec('write', { file_path: join(root, 'src', 'sum.mjs'), content: 'export {}\n' }, { agent: agentOf('main-1', root, false) })
    assert.ok(isScratchDenial(main), textOf(main))
  })
})

/** One write of `file` (relative to the worktree) under the registered `attempt`, expected to be denied by scratch-only. */
async function deniedWrite(attempt: (worktree: string) => Attempt, options: { readonly execute: boolean, readonly file: readonly string[], readonly caller: string }): Promise<void> {
  await withWorker(attempt, async ({ worktree }) => {
    const agent = agentOf(options.caller, worktree, options.caller === CHILD)
    const result = await guardOver(options.execute)('write', { file_path: join(worktree, ...options.file), content: 'export {}\n' }, { agent })
    assert.ok(isScratchDenial(result), textOf(result))
  })
}

test('scratch-only exemption: the main agent is denied even while a worker of its own holds an approved plan for the path', async () => {
  await deniedWrite(worktree => attemptOf(worktree), { execute: true, file: ['src', 'sum.mjs'], caller: 'main-1' })
})

test('scratch-only exemption: an approved worker writing a script outside its scope and its plan is denied', async () => {
  await deniedWrite(worktree => attemptOf(worktree), { execute: true, file: ['tools', 'run.mjs'], caller: CHILD })
})

test('scratch-only exemption: a worker whose plan is not approved yet is denied the planned path', async () => {
  const required = (worktree: string): Attempt => {
    const { planPaths: _dropped, ...rest } = attemptOf(worktree)
    return { ...rest, plan: 'required' }
  }
  await deniedWrite(required, { execute: true, file: ['src', 'sum.mjs'], caller: CHILD })
})

test('scratch-only exemption: without the execute row the registered worker\'s write is denied as before', async () => {
  await deniedWrite(worktree => attemptOf(worktree), { execute: false, file: ['src', 'sum.mjs'], caller: CHILD })
})

// ---- the predicate ----

test('writesPlannedFile: only a worker with an approved plan, only inside its worktree, only in the plan\'s paths or the scope', () => {
  const worktree = join(tmpdir(), 'wt-pred', 'hz-task-1')
  const approved = attemptOf(worktree)
  assert.equal(writesPlannedFile(approved, SCOPE, join(worktree, 'src', 'sum.mjs')), true, 'in the plan')
  assert.equal(writesPlannedFile(approved, SCOPE, join(worktree, 'src', 'deep', 'x.mjs')), true, 'in the scope')
  assert.equal(writesPlannedFile(approved, [], join(worktree, 'src', 'sum.test.mjs')), true, 'in the plan, no scope read')
  assert.equal(writesPlannedFile(approved, SCOPE, join(worktree, 'tools', 'run.mjs')), false, 'outside both')
  assert.equal(writesPlannedFile(approved, ['./'], join(worktree, 'run.mjs')), false, 'a scope that is no path contains nothing')
  assert.equal(writesPlannedFile(approved, SCOPE, join(worktree, '..', 'other', 'src', 'sum.mjs')), false, 'outside the worktree')
  assert.equal(writesPlannedFile(approved, SCOPE, join(worktree, '.git', 'hooks', 'x.sh')), false, 'in .git')
  assert.equal(writesPlannedFile(approved, SCOPE, worktree), false, 'the worktree root itself')
  const { planPaths: _dropped, ...unplanned } = approved
  assert.equal(writesPlannedFile({ ...unplanned, plan: 'required' }, SCOPE, join(worktree, 'src', 'sum.mjs')), false, 'plan not approved')
  assert.equal(writesPlannedFile({ ...unplanned, plan: 'skipped' }, SCOPE, join(worktree, 'src', 'sum.mjs')), false, 'a quick task has no approved plan')
  assert.equal(writesPlannedFile({ ...approved, role: 'review' }, SCOPE, join(worktree, 'src', 'sum.mjs')), false, 'a reviewer')
  const { worktree: _none, ...noTree } = approved
  assert.equal(writesPlannedFile(noTree, SCOPE, join(worktree, 'src', 'sum.mjs')), false, 'no worktree')
})
