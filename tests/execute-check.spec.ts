/**
 * The merge checks and the full trunk check (M7 design 0.6 §3.8.1–§3.8.3,
 * §3.11.1; step E7) on real repositories and a real graph: `check_commit`
 * refuses a caller that is not the main agent, a name that is no commit and
 * a graph without `norm-merge-gate`; a passing check writes `result.json`
 * and a verified `checks.jsonl` line, tells the main agent to fast-forward
 * and is `already-passed` the second time; a change inside `only` passes by
 * paths without the gate lock; a failing check comments the trailer task
 * and stops it at the third failure; a held lock, a failing setup and a
 * non-empty scratch area leave no record and count no failure; the gate
 * worktree is saved before it is cleaned and refused when it is not what
 * the harness left; a hanging command is ended with its process tree; a
 * tampered `result.json` does not count. The records layer the
 * trunk-advance check reads: `advances.jsonl`, the trunk branch, the
 * delivery to the holder. `trunkCheck` reuses the records of
 * the same content, runs only what is missing, tells about a failure, runs
 * once per commit and waits for the scratch area. The check backend runs a
 * job as an external activation, and without it the job runs in the call.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import type { AgentLike, InjectableServices, ToolDefinitionLike, UserNotice } from '../src/shared/dsh-min.ts'
import { appendAdvance, checkCommitTool, readAdvances, readChecks, toHolder, trunkBranchOf, trunkCheck, type CheckDeps, type CheckRecord, type CheckResult } from '../src/execute/check.ts'
import { createGraphCache } from '../src/execute/dispatch.ts'
import { sha256Hex } from '../src/execute/digest.ts'
import { acquireGateLock } from '../src/execute/gate-lock.ts'
import { createGateLauncher, type GateLauncher } from '../src/execute/gate-provider.ts'
import { createGit } from '../src/execute/git.ts'
import { setMetricSink, type MetricEvent } from '../src/execute/metrics.ts'
import { createUserNotice } from '../src/shared/dsh-min.ts'
import { apply as executeApply } from '../src/execute/index.ts'
import type { LoopEventRecord } from '../src/loops/service.ts'
import { REQUESTS_SERVICE } from '../src/guard/request-service.ts'
import { noticeHost } from './execute-helpers.ts'
import { GOAL, TASK, gateNode, providerSubagents, stageNodes, testRepo, type TestRepo } from './execute-repo.ts'
import { fakeInjector, fakeRuntime, schemaViolations } from './fake-rc3.ts'

// ---- fixtures ----

/** Exit 3 when the commit carries a file named FAIL, else 0. */
const FAIL_ON_FILE = '`$ node -e "process.exit(require(\'fs\').existsSync(\'FAIL\') ? 3 : 0)"`'
const PASS = '`$ node -e "process.exit(0)"`'
const WHEN_SRC = '`$ node -e "process.exit(0)" when src/`'
const ONLY = '`only notes/`'
const STANDARD = [FAIL_ON_FILE, PASS, WHEN_SRC, ONLY]
const TRAILER = 'Hourness-Task: task-1'
const SCRATCH_HINT = 'Delete them, or promote each one: move it into scripts/ (or the project\'s source tree), give it a graph node and say what it is for.'

/** The guard row's service as `requestsService` reads it: the three members, none of them used by the check. */
const REQUESTS = { peekGrant: () => undefined, openRequests: () => [], outsideDenial: () => undefined }

interface Rig {
  readonly repo: TestRepo
  readonly deps: CheckDeps
  readonly execDir: string
  readonly sent: UserNotice[]
  readonly reports: string[]
  readonly metrics: MetricEvent[]
  readonly tool: ToolDefinitionLike
  readonly agent: AgentLike
  call(commit: string, agent?: AgentLike): Promise<Record<string, unknown>>
  refusal(commit: string, agent?: AgentLike): Promise<{ readonly code: string, readonly message: string, readonly hint: string }>
  dispose(): void
}

function agentAt(id: string, cwd: string): AgentLike {
  return { id, ctx: {} as never, session: { id, header: { id, cwd }, deriveMessages: () => [] } }
}

/** A project with the goal, task-1 and (unless `undefined`) the gate; the launcher runs jobs in the call unless the test attaches it. */
async function rig(gate: readonly string[] | undefined, over: Partial<CheckDeps> = {}, extra: Record<string, unknown> = {}, launcher: GateLauncher = createGateLauncher()): Promise<Rig> {
  const repo = testRepo()
  await stageNodes(repo.graphDir, [GOAL, TASK, ...(gate === undefined ? [] : [gateNode(gate)])])
  const { lookup, sent } = noticeHost({ root: repo.root, graphDir: repo.graphDir }, extra)
  const reports: string[] = []
  const metrics: MetricEvent[] = []
  const previous = setMetricSink(event => { metrics.push(event) })
  const deps: CheckDeps = {
    lookup,
    cache: createGraphCache(() => {}),
    graphDirOf: () => repo.graphDir,
    execDir: root => join(root, '.llm', 'execute'),
    isMain: agent => agent.id === 'main-1',
    report: (_session, _state, reason) => { reports.push(reason) },
    git: createGit(),
    launcher,
    ...over,
  }
  const tool = checkCommitTool(deps)
  const agent = agentAt('main-1', repo.root)
  const call = async (commit: string, caller: AgentLike = agent): Promise<Record<string, unknown>> =>
    await tool.execute({ commit }, { callId: 'call-1', signal: new AbortController().signal, agent: caller, deferContext: () => {}, concludeTurn: () => {} }) as Record<string, unknown>
  return {
    repo,
    deps,
    execDir: join(repo.root, '.llm', 'execute'),
    sent,
    reports,
    metrics,
    tool,
    agent,
    call,
    async refusal(commit, caller = agent) {
      try {
        await call(commit, caller)
      }
      catch (error) {
        return JSON.parse(error instanceof Error ? error.message : String(error)) as { code: string, message: string, hint: string }
      }
      throw new Error('the call was expected to refuse')
    },
    dispose() {
      setMetricSink(previous)
      repo.dispose()
    },
  }
}

const textOf = (notice: UserNotice | undefined): string => notice?.content[0]?.text ?? ''

async function taskComments(repo: TestRepo): Promise<string[]> {
  const graph = await openEngine(repo.graphDir).load()
  return (graph.nodes.get('task-1')?.history ?? []).flatMap(entry => entry.op === 'comment' && entry.text !== undefined ? [entry.text] : [])
}

const checkEvents = (metrics: readonly MetricEvent[]): Extract<MetricEvent, { event: 'execute.check' }>[] =>
  metrics.flatMap(event => event.event === 'execute.check' ? [event] : [])

function trunkEvent(project: string, to: string, tasks = ''): LoopEventRecord {
  const at = new Date().toISOString()
  return { id: 'ev-0000000000000001', event: 'hourness.trunk-advanced', at, project, key: `trunk-advanced:${to}:${at}`, payload: { from: '', to, tasks, files: [], truncated: false }, merged: [] }
}

// ---- check_commit: the refusals of step 1 ----

test('check_commit refuses a caller that is not the main agent, a name that is no commit, and a graph without norm-merge-gate', async () => {
  const withGate = await rig(STANDARD)
  try {
    const head = withGate.repo.git('rev-parse', 'HEAD')
    assert.equal((await withGate.refusal(head, agentAt('worker-1', withGate.repo.root))).code, 'forbidden')
    const missing = await withGate.refusal('no-such-branch')
    assert.equal(missing.code, 'not_commit')
  }
  finally {
    withGate.dispose()
  }
  const without = await rig(undefined)
  try {
    const refused = await without.refusal(without.repo.git('rev-parse', 'HEAD'))
    assert.equal(refused.code, 'no_gate_norm')
    assert.equal(refused.hint, 'Propose norm-merge-gate under the goal: read the project\'s build and test setup and list each command as `$ <command>`.')
  }
  finally {
    without.dispose()
  }
})

// ---- a passing check, an earlier pass, a pass by paths ----

test('a passing check writes result.json and a verified checks.jsonl line, tells the main agent to fast-forward, and the second call is already-passed', async () => {
  const passedHooks: [string, string, CheckRecord][] = []
  const r = await rig(STANDARD, { onPassed: (project, commit, record) => { passedHooks.push([project, commit, record]); return Promise.resolve() } })
  try {
    const commit = r.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, `task-1: add the feed\n\n${TRAILER}`)
    const out = await r.call('hz/task-1')
    assert.equal(out.commit, commit)
    assert.equal(out.status, 'started')
    assert.equal(typeof out.job, 'string')
    assert.deepEqual(out.tasks, ['task-1'])

    const records = await readChecks(r.execDir)
    assert.equal(records.length, 1)
    const [record] = records
    assert.ok(record !== undefined)
    assert.deepEqual([record.kind, record.commit, record.passed, record.ran], ['commands', commit, true, [0, 1, 2]], 'the two $ lines and the when line the change touches')
    assert.equal(record.tree, r.repo.git('rev-parse', `${commit}^{tree}`))
    assert.match(record.result, new RegExp(`^checks/${commit}/[^/:.]+/result\\.json$`), 'the time in the directory name has no : or .')
    const resultFile = join(r.execDir, ...record.result.split('/'))
    const text = readFileSync(resultFile, 'utf8')
    assert.equal(sha256Hex(text), record.resultDigest)
    const onDisk = JSON.parse(text) as CheckResult
    assert.deepEqual(Object.keys(onDisk).sort(), ['at', 'base', 'commands', 'commit', 'kind', 'mergeBase', 'normDigest', 'passed', 'ran', 'tasks', 'tree'])
    assert.deepEqual([onDisk.base, onDisk.normDigest, onDisk.tasks], ['main', record.normDigest, ['task-1']])
    assert.deepEqual(passedHooks.map(([project, passed, hooked]) => [project, passed, hooked.resultDigest]), [[r.repo.root, commit, record.resultDigest]], 'the evidence hook heard of the pass')
    assert.deepEqual(record.detail.commands.map(command => [command.index, command.exit]), [[0, 0], [1, 0], [2, 0]])
    assert.ok(record.detail.commands.every(command => existsSync(join(r.repo.root, ...command.log.split('/')))), 'every command has its log file')
    assert.equal(record.detail.mergeBase, r.repo.git('rev-parse', 'main'))

    const notice = r.sent.at(-1)
    assert.equal(notice?.source.kind, 'glm-hourness-execute')
    assert.match(textOf(notice), new RegExp(`^${commit.slice(0, 12)} passed the merge checks \\(3 commands\\)\\. Fast-forward main with \`git merge --ff-only ${commit}\` in the main checkout\\.$`))
    const events = checkEvents(r.metrics)
    assert.deepEqual(events.map(event => [event.kind, event.passed, event.commit, event.tasks]), [['commands', true, commit, ['task-1']]])
    assert.ok(r.reports.some(reason => reason.startsWith('检查以同步方式运行')), 'without the backend the check ran inside the call, and the row health says so')

    const again = await r.call(commit)
    assert.deepEqual(again, { commit, status: 'already-passed', tasks: ['task-1'] })
    assert.equal((await readChecks(r.execDir)).length, 1, 'nothing ran again')
    assert.equal(passedHooks.length, 2, 'an earlier pass reaches the evidence hook too')
  }
  finally {
    r.dispose()
  }
})

test('a change inside the only paths passes by paths with no command and without the gate lock', async () => {
  const r = await rig(STANDARD, { lockSetup: { options: { waitMs: 200, retryMs: 50 } } })
  try {
    const commit = r.repo.commitOn('hz/notes', { 'notes/plan.md': 'plan\n' }, 'notes only')
    mkdirSync(r.execDir, { recursive: true })
    const held = await acquireGateLock(r.execDir, 'test holder')
    assert.notEqual(held, 'busy')
    try {
      const out = await r.call(commit)
      assert.deepEqual(out, { commit, status: 'passed-by-paths', tasks: [] })
    }
    finally {
      if (held !== 'busy') await held.release()
    }
    const records = await readChecks(r.execDir)
    assert.deepEqual(records.map(record => [record.kind, record.passed, record.ran, record.detail.commands.length]), [['only', true, [], 0]])
    assert.equal(existsSync(join(r.repo.root, '.worktrees', 'hz-gate')), false, 'the gate worktree was never touched')
  }
  finally {
    r.dispose()
  }
})

// ---- failures ----

test('a failing check leaves no passed record, comments the trailer task 检查第 n 次没过, and the third failure stops it with the check-stuck draft', async () => {
  const r = await rig(STANDARD)
  try {
    const commit = r.repo.commitOn('hz/task-1', { 'FAIL': 'x\n', 'src/feed.js': 'feed\n' }, `task-1: break it\n\n${TRAILER}`)
    await r.call(commit)
    assert.deepEqual((await readChecks(r.execDir)).map(record => [record.commit, record.passed, record.ran]), [[commit, false, [0]]], 'the first failure stops the run')
    const first = r.sent.at(-1)
    assert.equal(first?.source.kind, 'glm-hourness-execute')
    assert.match(textOf(first), /failed the merge checks: `node -e .*` exit 3, log \.llm\/execute\/checks\/[0-9a-f]{40}\/[^/]+\/0\.log\.\nLast lines of the log:\n/)
    const comments = await taskComments(r.repo)
    assert.match(comments.at(-1) ?? '', /^检查第 1 次没过：node -e .* exit 3 · \.llm\/execute\/checks\/[0-9a-f]{40}\/[^/]+\/0\.log$/)

    await r.call(commit)
    await r.call(commit)
    const all = (await taskComments(r.repo)).filter(text => text.startsWith('检查第'))
    assert.deepEqual(all.map(text => text.slice(0, 7)), ['检查第 1 次', '检查第 2 次', '检查第 3 次'])
    assert.ok(all[2].endsWith(' · 停下'), all[2])
    assert.ok(!all[1].endsWith(' · 停下'))
    const stop = r.sent.find(notice => notice.source.kind === 'glm-hourness-loop')
    assert.ok(stop !== undefined, 'the check-stuck draft went to the holder')
    const loop = stop.source.hournessLoop as { entry: string, key: string }
    assert.equal(loop.entry, 'execute.stopped')
    assert.match(loop.key, /^stopped:task-1:check-\d{4}-/)
    assert.match(textOf(stop), /task-1 stopped: the merge check failed 3 times/)
    assert.ok(r.metrics.some(event => event.event === 'execute.stop' && event.kind === 'check' && event.node === 'task-1' && event.rounds === 3))
    assert.equal((await readChecks(r.execDir)).filter(record => record.passed).length, 0)
  }
  finally {
    r.dispose()
  }
})

test('a gate lock held for the whole wait is gate_busy: no record, no failure counted', async () => {
  const r = await rig(STANDARD, { lockSetup: { options: { waitMs: 300, retryMs: 50 } } })
  try {
    const commit = r.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, `task-1\n\n${TRAILER}`)
    mkdirSync(r.execDir, { recursive: true })
    const held = await acquireGateLock(r.execDir, 'another check')
    assert.notEqual(held, 'busy')
    try {
      assert.equal((await r.call(commit)).status, 'started')
    }
    finally {
      if (held !== 'busy') await held.release()
    }
    assert.match(textOf(r.sent.at(-1)), /did not run: gate_busy: /)
    assert.deepEqual(await readChecks(r.execDir), [])
    assert.deepEqual((await taskComments(r.repo)).filter(text => text.startsWith('检查第')), [])
  }
  finally {
    r.dispose()
  }
})

// ---- the gate worktree ----

test('a dirty gate worktree is saved as a snapshot before the reset; one put on a branch is gate_worktree_invalid and nothing in it is reset', async () => {
  const r = await rig(STANDARD)
  try {
    const gatePath = join(r.repo.root, '.worktrees', 'hz-gate')
    const first = r.repo.commitOn('hz/a', { 'src/a.js': 'a\n' }, 'a')
    await r.call(first)
    writeFileSync(join(gatePath, 'README.md'), 'dirty\n')
    const second = r.repo.commitOn('hz/b', { 'src/b.js': 'b\n' }, 'b')
    await r.call(second)
    assert.notEqual(r.repo.git('for-each-ref', '--format=%(refname)', 'refs/hourness/snapshots/'), '', 'the change was saved first')
    assert.equal(readFileSync(join(gatePath, 'README.md'), 'utf8'), 'probe workspace\n', 'then discarded')
    assert.equal((await readChecks(r.execDir)).filter(record => record.passed).length, 2)

    r.repo.git('-C', gatePath, 'checkout', '--quiet', '-b', 'someones-branch')
    writeFileSync(join(gatePath, 'README.md'), 'dirty again\n')
    const third = r.repo.commitOn('hz/c', { 'src/c.js': 'c\n' }, 'c')
    await r.call(third)
    assert.match(textOf(r.sent.at(-1)), /did not run: gate_worktree_invalid: .*detached head/)
    assert.equal(readFileSync(join(gatePath, 'README.md'), 'utf8'), 'dirty again\n', 'nothing was reset')
    assert.equal((await readChecks(r.execDir)).some(record => record.commit === third), false)
  }
  finally {
    r.dispose()
  }
})

test('setup runs in a new gate worktree and again when a watched file changes; a failing setup is setup_failed and counts no failure', async () => {
  const r = await rig(['`setup $ node -e "process.exit(require(\'fs\').existsSync(\'BADSETUP\') ? 4 : 0)"`', PASS])
  try {
    await r.call(r.repo.commitOn('hz/s', { 'src/a.js': '1\n' }, 'one'))
    await r.call(r.repo.commitOn('hz/s', { 'src/a.js': '2\n' }, 'two'))
    await r.call(r.repo.commitOn('hz/s', { 'package.json': '{}\n' }, 'three'))
    assert.deepEqual(checkEvents(r.metrics).map(event => [event.passed, event.setup]), [[true, true], [true, false], [true, true]])

    const bad = r.repo.commitOn('hz/s', { 'package.json': '{"name":"x"}\n', 'BADSETUP': 'x\n' }, `four\n\n${TRAILER}`)
    await r.call(bad)
    assert.match(textOf(r.sent.at(-1)), /did not run: setup_failed: the setup command `node -e .*` exited 4/)
    assert.equal((await readChecks(r.execDir)).some(record => record.commit === bad), false)
    assert.deepEqual((await taskComments(r.repo)).filter(text => text.startsWith('检查第')), [])
    assert.equal(checkEvents(r.metrics).length, 3, 'no check metric for a check that did not run')
  }
  finally {
    r.dispose()
  }
})

// The limit leaves node time to start and write its pid before it is ended; the command itself never ends.
test('a command over its time limit is ended with its process tree and fails the check', async () => {
  const r = await rig(['`$ node -e "require(\'fs\').writeFileSync(\'pid.txt\', String(process.pid)); setInterval(function () {}, 1000)"`'], { commandTimeoutMs: 3000 })
  try {
    const commit = r.repo.commitOn('hz/slow', { 'src/a.js': 'a\n' }, 'slow')
    const started = Date.now()
    await r.call(commit)
    assert.ok(Date.now() - started < 30_000, 'the command did not run to its own end')
    const [record] = await readChecks(r.execDir)
    assert.deepEqual([record?.passed, record?.detail.commands[0]?.exit], [false, -1])
    assert.match(textOf(r.sent.at(-1)), /exit -1 \(timed out after 3000 ms; the process tree was ended\)/)
    const pid = Number(readFileSync(join(r.repo.root, '.worktrees', 'hz-gate', 'pid.txt'), 'utf8'))
    const alive = (): boolean => {
      try {
        process.kill(pid, 0)
        return true
      }
      catch {
        return false
      }
    }
    for (let deadline = Date.now() + 5000; alive() && Date.now() < deadline;) await new Promise(done => setTimeout(done, 100))
    assert.equal(alive(), false, 'the node process the shell started is gone too')
  }
  finally {
    r.dispose()
  }
})

// ---- the scratch area, a tampered record ----

test('scratch_left: with the guard row loaded, files in .llm/scratch/ refuse the check; without the guard row they do not', async () => {
  const guarded = await rig(STANDARD, {}, { [REQUESTS_SERVICE]: REQUESTS })
  try {
    mkdirSync(join(guarded.repo.root, '.llm', 'scratch'), { recursive: true })
    writeFileSync(join(guarded.repo.root, '.llm', 'scratch', 'probe.mjs'), 'console.log(1)\n')
    const commit = guarded.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, `task-1\n\n${TRAILER}`)
    const refused = await guarded.refusal(commit)
    assert.equal(refused.code, 'scratch_left')
    assert.match(refused.message, /holds 1 file\(s\): probe\.mjs/)
    assert.equal(refused.hint, SCRATCH_HINT)
    assert.deepEqual(await readChecks(guarded.execDir), [])
    assert.deepEqual((await taskComments(guarded.repo)).filter(text => text.startsWith('检查第')), [])
  }
  finally {
    guarded.dispose()
  }
  const plain = await rig(STANDARD)
  try {
    mkdirSync(join(plain.repo.root, '.llm', 'scratch'), { recursive: true })
    writeFileSync(join(plain.repo.root, '.llm', 'scratch', 'probe.mjs'), 'console.log(1)\n')
    const commit = plain.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, 'task-1')
    assert.equal((await plain.call(commit)).status, 'started')
    assert.equal((await readChecks(plain.execDir)).length, 1)
  }
  finally {
    plain.dispose()
  }
})

test('a result.json that no longer matches its digest makes the record count for nothing', async () => {
  const r = await rig(STANDARD)
  try {
    const commit = r.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, 'task-1')
    await r.call(commit)
    const [record] = await readChecks(r.execDir)
    assert.ok(record !== undefined)
    const file = join(r.execDir, ...record.result.split('/'))
    writeFileSync(file, readFileSync(file, 'utf8').replace('"passed": true', '"passed": true '))
    assert.deepEqual(await readChecks(r.execDir), [])
    assert.equal((await r.call(commit)).status, 'started', 'not already-passed: the check runs again')
    assert.equal((await readChecks(r.execDir)).length, 1)
  }
  finally {
    r.dispose()
  }
})

// ---- the records layer the trunk-advance check reads ----

test('advances.jsonl keeps its lines in order; the trunk is the drive comment\'s branch, else origin/HEAD, else the checkout\'s; a notice reaches the holder or says why not', async () => {
  const r = await rig(STANDARD)
  try {
    await appendAdvance(r.execDir, { ref: 'local', from: 'a'.repeat(40), to: 'b'.repeat(40), ok: true, check: 'b'.repeat(40), tasks: ['task-1'], at: '2026-11-04T08:00:00.000Z' })
    writeFileSync(join(r.execDir, 'advances.jsonl'), 'not json\n', { flag: 'a' })
    await appendAdvance(r.execDir, { ref: 'remote', by: 'fetch', from: 'b'.repeat(40), to: 'c'.repeat(40), at: '2026-11-04T08:01:00.000Z' })
    assert.deepEqual((await readAdvances(r.execDir)).map(line => [line.ref, line.by, line.to.slice(0, 1)]), [['local', undefined, 'b'], ['remote', 'fetch', 'c']])
    assert.equal(readFileSync(join(r.execDir, '.gitignore'), 'utf8'), '*\n', 'the runtime directory ignores itself')

    const git = createGit()
    const graph = (): ReturnType<typeof r.deps.cache.load> => r.deps.cache.load(r.repo.graphDir)
    assert.equal(await trunkBranchOf(git, r.repo.root, await graph()), 'main', 'no comment, no origin/HEAD: the branch of the main checkout')
    r.repo.withRemote()
    r.repo.git('branch', 'trunk')
    r.repo.git('push', '--quiet', 'origin', 'trunk')
    r.repo.git('remote', 'set-head', 'origin', 'trunk')
    assert.equal(await trunkBranchOf(git, r.repo.root, await graph()), 'trunk', 'the remote\'s default branch')
    const commented = await openEngine(r.repo.graphDir).apply('harness', { op: 'comment', id: 'goal-1', text: '自动推进已开始 · 主干 release' })
    assert.ok(commented.ok)
    assert.equal(await trunkBranchOf(git, r.repo.root, await graph()), 'release', 'the branch the drive started on')

    const notice = createUserNotice('glm-hourness-execute', 'probe', 'probe text')
    assert.equal(toHolder(r.deps.lookup, r.repo.graphDir, notice), undefined)
    assert.equal(r.sent.at(-1), notice)
    assert.equal(toHolder(r.deps.lookup, join(r.repo.root, 'elsewhere'), notice), '项目没有主 Agent 记录')
  }
  finally {
    r.dispose()
  }
})

// ---- trunkCheck ----

test('trunkCheck: covered by records of the same content, runs only what is missing, tells about a failure, runs once per commit, waits for the scratch area', async () => {
  const r = await rig(STANDARD, {}, { [REQUESTS_SERVICE]: REQUESTS })
  try {
    // A checked task commit, fast-forwarded, then a notes-only commit on top: the record of the task commit covers it.
    const checked = r.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, `task-1\n\n${TRAILER}`)
    await r.call(checked)
    r.repo.git('merge', '--quiet', '--ff-only', checked)
    const notes = r.repo.commit({ 'notes/n.md': 'n\n' }, 'notes')
    assert.deepEqual(await trunkCheck(r.deps, trunkEvent(r.repo.root, notes, 'task-1')), { outcome: 'done' })
    const covered = (await readChecks(r.execDir)).find(record => record.kind === 'trunk' && record.commit === notes)
    assert.deepEqual([covered?.skipped, covered?.passed, covered?.ran, covered?.detail.commands.length], [true, true, [0, 1, 2], 0])
    assert.deepEqual(await trunkCheck(r.deps, trunkEvent(r.repo.root, notes)), { outcome: 'skipped', reason: 'already done' })

    // A checked commit that did not touch src/: the when line is all the trunk check runs.
    const lib = r.repo.commitOn('hz/lib', { 'lib/x.js': 'x\n' }, 'lib')
    await r.call(lib)
    assert.deepEqual((await readChecks(r.execDir)).find(record => record.commit === lib)?.ran, [0, 1])
    r.repo.git('merge', '--quiet', '--ff-only', lib)
    assert.deepEqual(await trunkCheck(r.deps, trunkEvent(r.repo.root, lib)), { outcome: 'done' })
    const partial = (await readChecks(r.execDir)).find(record => record.kind === 'trunk' && record.commit === lib)
    assert.deepEqual([partial?.passed, partial?.ran, partial?.detail.commands.map(command => command.index), partial?.skipped], [true, [0, 1, 2], [2], undefined])

    // An unchecked commit on the trunk that breaks the check: done, with the tell.
    const broken = r.repo.commit({ 'FAIL': 'x\n' }, 'broken on main')
    const told = await trunkCheck(r.deps, trunkEvent(r.repo.root, broken))
    assert.equal(told.outcome, 'done')
    assert.match(told.outcome === 'done' ? told.tell ?? '' : '', new RegExp(`^The full check on main ${broken.slice(0, 12)} failed: node -e .* exit 3 \\(\\.llm/execute/checks/${broken}/[^/]+/0\\.log\\)\\. Fix it or revert\\.$`))
    assert.deepEqual(await trunkCheck(r.deps, trunkEvent(r.repo.root, broken)), { outcome: 'skipped', reason: 'already done' })

    // The scratch area first: a tell and no record, so the next advance runs again.
    mkdirSync(join(r.repo.root, '.llm', 'scratch'), { recursive: true })
    writeFileSync(join(r.repo.root, '.llm', 'scratch', 'left.ps1'), 'x\n')
    const later = r.repo.commit({ 'FAIL': null }, 'fixed')
    const waiting = await trunkCheck(r.deps, trunkEvent(r.repo.root, later))
    assert.equal(waiting.outcome, 'done')
    assert.match(waiting.outcome === 'done' ? waiting.tell ?? '' : '', /waits: the scratch area \.llm\/scratch\/ holds 1 file\(s\): left\.ps1/)
    assert.equal((await readChecks(r.execDir)).some(record => record.commit === later), false)

    assert.equal((await trunkCheck(r.deps, trunkEvent(join(r.repo.root, 'no-such-dir'), later))).outcome, 'failed', 'no git root, no check')
  }
  finally {
    r.dispose()
  }
})

// ---- the check backend ----

test('with the backend registered, check_commit starts an external activation on hourness-gate whose result settles completed', async () => {
  const subagents = providerSubagents()
  const launcher = createGateLauncher()
  const undo = launcher.attach(subagents.service)
  const r = await rig(STANDARD, {}, {}, launcher)
  try {
    const commit = r.repo.commitOn('hz/task-1', { 'src/feed.js': 'feed\n' }, `task-1\n\n${TRAILER}`)
    const out = await r.call(commit)
    assert.equal(out.status, 'started')
    const spec = subagents.starts[0]
    assert.ok(spec !== undefined, 'the activation was started')
    assert.deepEqual([spec.provider, spec.label, spec.delivery, spec.request.cwd], ['hourness-gate', `hourness check ${commit.slice(0, 12)}`, 'caller', r.repo.root])
    assert.deepEqual(spec.request.prompt, [{ type: 'text', text: `hourness-gate job ${String(out.job)}` }])
    assert.equal(spec.request.parent, r.agent)
    const [settled] = subagents.results
    assert.ok(settled !== undefined)
    const result = await settled
    assert.equal(result.stopReason, 'completed')
    assert.match(JSON.stringify(result.output), /passed the merge checks \(3 commands\)/)
    assert.equal((await readChecks(r.execDir)).length, 1)
    assert.equal(r.reports.some(reason => reason.startsWith('检查以同步方式运行')), false)
  }
  finally {
    undo()
    r.dispose()
  }
})

test('a registerProvider that throws leaves the checks running inside their calls, and the row health says 检查以同步方式运行', async () => {
  const launcher = createGateLauncher()
  assert.throws(() => launcher.attach({ ...providerSubagents().service, registerProvider: () => { throw new Error('DUPLICATE_PROVIDER') } }), /DUPLICATE_PROVIDER/)
  let ran = false
  assert.equal(await launcher.start({ id: 'j1', label: 'hourness check x', cwd: '.', run: () => { ran = true; return Promise.resolve({ text: 'ok', stopReason: 'completed' }) } }, agentAt('main-1', '.'), new AbortController().signal), 'sync')
  assert.equal(ran, true)

  // The row: the registration fails, check_commit is still registered.
  const runtime = fakeRuntime({ natives: [] })
  const registered: ToolDefinitionLike[] = []
  const tools = { get: (name: string) => registered.find(tool => tool.name === name), register: (definition: ToolDefinitionLike) => { registered.push(definition); return () => {} } }
  runtime.ctx.provide('tools', tools)
  const subagents = { registerProvider: () => { throw new Error('DUPLICATE_PROVIDER') } } as unknown as InjectableServices['subagents']
  ;(runtime.ctx as { inject?: unknown }).inject = fakeInjector({ tools: runtime.ctx.get('tools') as InjectableServices['tools'], subagents }, runtime.ctx).inject
  const dispose = executeApply(runtime.ctx, {})
  try {
    assert.ok(registered.some(tool => tool.name === 'check_commit'))
    const view = runtime.ctx.get('glmHournessHealth/execute') as { activation(): { state: string, reason: string } }
    assert.equal(view.activation().state, 'degraded')
    assert.match(view.activation().reason, /检查以同步方式运行：检查后端 hourness-gate 没注册上（DUPLICATE_PROVIDER）/)
  }
  finally {
    dispose()
  }
})

test('check_commit\'s parameters and output are inside the schema subset rc.3 enforces', () => {
  const tool = checkCommitTool({
    lookup: {}, cache: createGraphCache(() => {}), graphDirOf: () => undefined, execDir: root => root, isMain: () => false, report: () => {}, git: createGit(), launcher: createGateLauncher(),
  })
  assert.equal(tool.name, 'check_commit')
  assert.deepEqual(schemaViolations(tool.parameters), [])
  assert.deepEqual(schemaViolations(tool.output.schema), [])
})
