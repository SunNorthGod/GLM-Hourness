import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/execute/index.ts'
import type { Attempt } from '../src/execute/attempts.ts'
import { createGateLauncher } from '../src/execute/gate-provider.ts'
import {
  LIVE_BOARD_PROJECTION,
  LIVE_BOARD_VERSION,
  createLiveBoardStore,
  executeBoardPathOf,
  executeBoardProjection,
  type ExecuteLiveBoard,
} from '../src/execute/live-board.ts'
import { fakeInjector } from './fake-rc3.ts'

function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    childId: 'hz-task-1-a1-abc123',
    role: 'worker',
    node: 'task-1',
    attempt: 1,
    graphDir: '/tmp/p/docs/graph',
    provider: 'glm-zcode',
    model: 'glm-5.3',
    why: 'implement feature',
    plan: 'none',
    pins: 'pins: task-1@1',
    ...overrides,
  }
}

test('executeBoardProjection resolves path and projectRoot even before file exists, and nulls outside a project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'exec-board-proj-'))
  try {
    await mkdir(join(root, '.git'), { recursive: true })
    const execDir = (p: string): string => join(p, '.llm', 'execute')
    const projection = executeBoardProjection(execDir)
    assert.equal(projection.key, LIVE_BOARD_PROJECTION)
    const inProject = projection.init({ cwd: root }, 0)
    assert.deepEqual(inProject, {
      path: executeBoardPathOf(execDir, root),
      projectRoot: root,
    })
    assert.deepEqual(projection.wire.viewSchema.parse(inProject), inProject)
    assert.deepEqual(projection.init({}, 0), { path: null, projectRoot: null })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('liveBoardStore coalesces updates via debounce, writes atomically with .gitignore, and caps settled dispatches at 20', async () => {
  const root = await mkdtemp(join(tmpdir(), 'exec-board-store-'))
  let nowMs = 1_000
  const execDir = (p: string): string => join(p, '.llm', 'execute')
  const store = createLiveBoardStore({
    execDir,
    slots: 3,
    debounceMs: 40,
    now: () => nowMs,
  })
  try {
    await mkdir(join(root, '.git'), { recursive: true })

    // 25 settled dispatches + 2 active dispatches (1 GLM worker, 1 non-GLM review)
    for (let i = 1; i <= 25; i++) {
      nowMs = 1_000 + i * 10
      const attempt = makeAttempt({ childId: `hz-task-${i}-a1-00000${i}`, node: `task-${i}` })
      store.startDispatch(root, attempt)
      nowMs += 5
      store.settleDispatch(root, attempt, { stopReason: 'completed' }, true)
    }
    nowMs = 2_000
    store.startDispatch(root, makeAttempt({ childId: 'hz-active-1-a1-111111', node: 'active-1', role: 'worker', model: 'glm-5.3' }))
    store.startDispatch(root, makeAttempt({ childId: 'hz-active-2-a1-222222', node: 'active-2', role: 'review', model: 'deepseek-chat' }))
    store.updateDrive(
      root,
      { goalId: 'goal-1', phase: 'active', blockedCode: 'hourness-peak-wait', stateLine: 'waiting', counters: { idle: 1, peak: 2 } },
      { peak: true, level: 'reduce', until: '2026-11-21T18:00:00.000Z', glmWorkerCap: 1 },
    )
    store.startJob(root, { id: 'gate-1', kind: 'gate', label: 'merge check', tasks: ['task-1'], mode: 'activation' })

    // Wait past debounce to verify automatic coalesced write
    await new Promise(resolve => setTimeout(resolve, 120))

    const boardFile = executeBoardPathOf(execDir, root)
    assert.equal(existsSync(boardFile), true)
    assert.equal(existsSync(join(execDir(root), '.gitignore')), true)

    const parsed = JSON.parse(await readFile(boardFile, 'utf8')) as ExecuteLiveBoard
    assert.equal(parsed.version, LIVE_BOARD_VERSION)
    assert.equal(parsed.slots.max, 3)
    assert.equal(parsed.slots.activeWorkers, 1)
    assert.equal(parsed.slots.glmWorkers, 1)
    assert.equal(parsed.slots.peakCap, 1)
    assert.equal(parsed.drive.goalId, 'goal-1')
    assert.equal(parsed.drive.blockedCode, 'hourness-peak-wait')
    assert.deepEqual(parsed.drive.counters, { idle: 1, peak: 2 })
    assert.equal(parsed.peak?.level, 'reduce')

    const active = parsed.dispatches.filter(d => d.status === 'running')
    const settled = parsed.dispatches.filter(d => d.status !== 'running')
    assert.equal(active.length, 2)
    assert.equal(settled.length, 20, 'keeps at most 20 most recent settled dispatches')
    assert.equal(settled[0]?.task, 'task-25', 'most recent settled is kept first')
    assert.equal(settled.at(-1)?.task, 'task-6', 'oldest 5 settled (task-1..task-5) are pruned')
    assert.equal(parsed.jobs.length, 1)
    assert.equal(parsed.jobs[0]?.status, 'running')

    // End job and flush explicitly
    nowMs = 3_000
    store.endJob(root, { id: 'gate-1', status: 'completed', summary: 'all tests passed' })
    await store.flush(root)
    const afterEnd = JSON.parse(await readFile(boardFile, 'utf8')) as ExecuteLiveBoard
    assert.equal(afterEnd.jobs[0]?.status, 'completed')
    assert.equal(afterEnd.jobs[0]?.summary, 'all tests passed')
  }
  finally {
    store.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('liveBoardStore.dispose() cancels pending debounce timer cleanly without writing after dispose', async () => {
  const root = await mkdtemp(join(tmpdir(), 'exec-board-dispose-'))
  const execDir = (p: string): string => join(p, '.llm', 'execute')
  const store = createLiveBoardStore({ execDir, debounceMs: 80 })
  try {
    await mkdir(join(root, '.git'), { recursive: true })
    store.startDispatch(root, makeAttempt())
    store.dispose()
    await new Promise(resolve => setTimeout(resolve, 140))
    assert.equal(existsSync(executeBoardPathOf(execDir, root)), false)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('gateLauncher hooks emit start and end on sync fallback and activation', async () => {
  const events: Array<{ readonly kind: string, readonly id: string, readonly status?: string, readonly mode?: string }> = []
  const launcher = createGateLauncher({
    onJobStart: job => { events.push({ kind: 'start', id: job.id, mode: job.mode }) },
    onJobEnd: job => { events.push({ kind: 'end', id: job.id, status: job.status }) },
  })
  const fakeAgent = { id: 'main-1', session: { id: 'main-1', header: { id: 'main-1' }, deriveMessages: () => [] }, status: 'idle', followup: () => {}, inject: () => {}, cancel: () => {} }
  const mode = await launcher.start({
    id: 'gate-sync-1',
    label: 'sync check',
    cwd: '/tmp/p',
    tasks: ['task-1'],
    run: () => Promise.resolve({ text: 'ok', stopReason: 'completed' }),
  }, fakeAgent as never, new AbortController().signal)
  assert.equal(mode, 'sync')
  assert.deepEqual(events, [
    { kind: 'start', id: 'gate-sync-1', mode: 'sync' },
    { kind: 'end', id: 'gate-sync-1', status: 'completed' },
  ])
})

test('execute/index apply registers hournessExecuteBoard when sessionProjections arrives and degrades safely without it', () => {
  const registered: string[] = []
  const host = fakeInjector({
    sessionProjections: {
      register: (def) => { registered.push(def.key); return () => {} },
      snapshot: () => ({ values: {} }),
      stateOf: () => undefined,
    },
  })
  const dispose = apply({
    on: () => () => {},
    get: () => undefined,
    provide: () => () => {},
    inject: host.inject,
  })
  assert.ok(registered.includes(LIVE_BOARD_PROJECTION))
  dispose()

  const disposeWithout = apply({
    on: () => () => {},
    get: () => undefined,
  })
  disposeWithout()
})

test('liveBoardStore persists dispatchMode and avoids redundant writes when unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'exec-board-mode-'))
  const execDir = (p: string): string => join(p, '.llm', 'execute')
  const store = createLiveBoardStore({ execDir, dispatchMode: 'adaptive', debounceMs: 20 })
  try {
    await mkdir(join(root, '.git'), { recursive: true })
    store.updateDispatchMode(root, 'adaptive')
    assert.equal(store.snapshot(root)?.dispatchMode, 'adaptive')
    store.updateDispatchMode(root, 'burn')
    await store.flush(root)
    const parsed = JSON.parse(await readFile(executeBoardPathOf(execDir, root), 'utf8')) as ExecuteLiveBoard
    assert.equal(parsed.dispatchMode, 'burn')
  }
  finally {
    store.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('liveBoardStore hydrates settled entries across restarts, marks leftover running entries lost/aborted, and tolerates corrupt disk files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'exec-board-hydrate-'))
  const execDir = (p: string): string => join(p, '.llm', 'execute')
  let nowMs = 1_000
  const storeA = createLiveBoardStore({ execDir, debounceMs: 20, now: () => nowMs })
  try {
    await mkdir(join(root, '.git'), { recursive: true })
    const settledAttempt = makeAttempt({ childId: 'hz-task-1-a1-111111', node: 'task-1' })
    const staleAttempt = makeAttempt({ childId: 'hz-task-2-a1-222222', node: 'task-2' })
    storeA.startDispatch(root, settledAttempt)
    nowMs = 1_500
    storeA.settleDispatch(root, settledAttempt, { stopReason: 'completed' }, true)
    nowMs = 2_000
    storeA.startDispatch(root, staleAttempt)
    storeA.startJob(root, { id: 'gate-done', kind: 'gate', label: 'done gate', tasks: ['task-1'], mode: 'sync' })
    nowMs = 2_500
    storeA.endJob(root, { id: 'gate-done', status: 'completed', summary: 'ok' })
    storeA.startJob(root, { id: 'gate-stale', kind: 'gate', label: 'stale gate', tasks: ['task-2'], mode: 'activation' })
    await storeA.flush(root)
    storeA.dispose()

    nowMs = 5_000
    const storeB = createLiveBoardStore({ execDir, debounceMs: 20, now: () => nowMs })
    try {
      const freshAttempt = makeAttempt({ childId: 'hz-task-3-a1-333333', node: 'task-3' })
      storeB.startDispatch(root, freshAttempt)
      await storeB.flush(root)

      const hydrated = JSON.parse(await readFile(executeBoardPathOf(execDir, root), 'utf8')) as ExecuteLiveBoard
      const keptDone = hydrated.dispatches.find(d => d.childId === 'hz-task-1-a1-111111')
      const lostOld = hydrated.dispatches.find(d => d.childId === 'hz-task-2-a1-222222')
      const activeNew = hydrated.dispatches.find(d => d.childId === 'hz-task-3-a1-333333')
      assert.equal(keptDone?.status, 'completed')
      assert.equal(keptDone?.handbackDone, true)
      assert.equal(lostOld?.status, 'lost')
      assert.equal(lostOld?.settledAt, 5_000)
      assert.equal(activeNew?.status, 'running')

      const doneJob = hydrated.jobs.find(j => j.id === 'gate-done')
      const abortedJob = hydrated.jobs.find(j => j.id === 'gate-stale')
      assert.equal(doneJob?.status, 'completed')
      assert.equal(abortedJob?.status, 'aborted')
      assert.equal(abortedJob?.endedAt, 5_000)
    }
    finally {
      storeB.dispose()
    }

    await writeFile(executeBoardPathOf(execDir, root), '{broken json', 'utf8')
    const storeCorrupt = createLiveBoardStore({ execDir, debounceMs: 20, now: () => 9_000 })
    try {
      storeCorrupt.startDispatch(root, makeAttempt({ childId: 'hz-task-4-a1-444444', node: 'task-4' }))
      await storeCorrupt.flush(root)
      const recovered = JSON.parse(await readFile(executeBoardPathOf(execDir, root), 'utf8')) as ExecuteLiveBoard
      assert.equal(recovered.dispatches.length, 1)
      assert.equal(recovered.dispatches[0]?.childId, 'hz-task-4-a1-444444')
    }
    finally {
      storeCorrupt.dispose()
    }
  }
  finally {
    storeA.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
