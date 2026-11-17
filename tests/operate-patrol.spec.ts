/**
 * The patrol's L2 (M7 design 0.6 §3.11.2, batch m7-7), on real repositories
 * (tests/execute-repo.ts's sandbox): the `hourness_report {kind: 'patrol'}`
 * schema, the `operate.patrol` loop-board entry, the journal line and its
 * `.gitignore`, the missed run and the skip streak read back from the
 * journal, the trunk rows against a real remote (the push-ahead count, the
 * trailer commits no ok local advance covers, the commits no advance or
 * fetch record walks over), the worktree and branch rows (the clean and the
 * dirty worktree of a closed task, the branch merged over fourteen days and
 * the one whose content never made it), the graph rows (the stuck task, the
 * stale dispatch), the evidence row through the execute service's optional
 * `reconcileTrunk`, the background jobs (the trunk check riding
 * `runAction`, the `patrol $` command through the injected runLine), the
 * lessons row's `hygiene` and its absence, and the `operate.patrol` metric.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { hournessReportTool, type OperateDeps } from '../src/operate/index.ts'
import { missedRunOf, patrolText, skipStreakOf } from '../src/operate/patrol.ts'
import { OPERATE_ENTRIES } from '../src/operate/entries.ts'
import { validateEntry } from '../src/loops/model.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { renderDispatchComment } from '../src/execute/attempts.ts'
import { createGit, type Git } from '../src/execute/git.ts'
import { openEngine } from '../src/graph/engine.ts'
import type { ServiceLookup, ToolExecutionContext } from '../src/shared/dsh-min.ts'
import { GOAL, TASK, floorNode, gateNode, stageNodes, testRepo, type TestRepo } from './execute-repo.ts'

const NOW = Date.parse('2026-11-15T02:30:00+08:00')
const DAY_MS = 86_400_000
const clock = (): Date => new Date(NOW)

interface PatrolHost {
  readonly deps: OperateDeps
  readonly exec: ToolExecutionContext
  readonly emitted: { readonly event: unknown, readonly where: unknown }[]
  readonly runs: { readonly action: string, readonly record: unknown }[]
  readonly commands: readonly string[]
  readonly repo: TestRepo
}

/** A host over a real repository: the metrics service records, the execute service is opt-in, the runLine is a fake. */
function patrolHost(repo: TestRepo, over: {
  readonly execute?: { runAction: (action: string, record: unknown) => Promise<{ outcome: string, reason?: string, tell?: string }>, reconcileTrunk?: () => Promise<number> }
  readonly lessons?: { hygiene: (session: unknown, now: string) => Promise<readonly { kind: string, id?: string, detail: string }[]> }
  readonly nowMs?: number
  readonly git?: Git
} = {}): PatrolHost {
  const emitted: { event: unknown, where: unknown }[] = []
  const runs: { action: string, record: unknown }[] = []
  const commands: string[] = []
  const nowMs = over.nowMs ?? NOW
  const store = new Map<string, unknown>([
    ['glmHournessMetrics', { emit: (event: unknown, where: unknown) => { emitted.push({ event, where }) } }],
    ...(over.execute === undefined ? [] : [['glmHournessExecute', {
      isWorker: (): boolean => false,
      inApprovedScope: (): boolean => false,
      trunkAdvanceFor: (): undefined => undefined,
      runAction: (action: string, record: unknown) => { runs.push({ action, record }); return over.execute!.runAction(action, record) },
      ...(over.execute.reconcileTrunk === undefined ? {} : { reconcileTrunk: over.execute.reconcileTrunk }),
    }]] as const),
    ...(over.lessons === undefined ? [] : [['glmHournessLessons', over.lessons]] as const),
  ])
  const lookup: ServiceLookup = { get: name => store.get(name) }
  const deps: OperateDeps = {
    lookup,
    isMain: () => true,
    graphDirOf: () => repo.graphDir,
    git: over.git ?? createGit(),
    runLine: (command) => { commands.push(command); return Promise.resolve({ exit: 3, ms: 1 }) },
    now: () => nowMs,
  }
  const exec = { agent: { id: 'main-1', session: { id: 's1', header: { cwd: repo.root } } } } as unknown as ToolExecutionContext
  return { deps, exec, emitted, runs, commands, repo }
}

interface JournalLine {
  readonly kind: string
  readonly at: string
  readonly outcome?: string
  readonly trunk?: string
}

const journalOf = (repo: TestRepo): readonly JournalLine[] =>
  readFileSync(join(repo.root, '.llm', 'operate', 'patrol.jsonl'), 'utf8').split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as JournalLine)

const runPatrol = async (host: PatrolHost, kind = 'patrol'): Promise<string> =>
  ((await hournessReportTool(host.deps).execute({ kind }, host.exec)) as { text: string }).text

/** The graph with the goal, the task and any extra nodes staged, and task-1 moved to `to` at the fixed clock; the engine for further mutations. */
async function stagedTask(repo: TestRepo, to: 'doing' | 'done' | 'dropped', extra: readonly Readonly<Record<string, unknown>>[] = []): Promise<ReturnType<typeof openEngine>> {
  await stageNodes(repo.graphDir, [GOAL, TASK, ...extra])
  const engine = openEngine(repo.graphDir, { now: clock })
  const current = await engine.load()
  await engine.apply('human', {
    op: 'status',
    id: 'task-1',
    rev: current.revisions.get('task-1')!,
    to,
    reason: 'test',
    ...(to === 'done' ? { evidence: [{ kind: 'test', ref: 'npm test', exit: 0 }] } : {}),
  })
  return engine
}

test('hourness_report: the kind schema has morning, weekly and patrol (m7-7)', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const host = patrolHost(repo)
    const report = hournessReportTool(host.deps)
    const parameters = report.parameters as { properties: { kind: { enum: readonly string[] } } }
    assert.deepEqual(parameters.properties.kind.enum, ['morning', 'weekly', 'patrol'])
    const text = await runPatrol(host)
    assert.ok(text.startsWith('# 巡检 2026-11-15'), text.slice(0, 120))
    assert.deepEqual(plainWordsIn(text), [])
  }
  finally {
    repo.dispose()
  }
})

test('the patrol entry is the loop board\'s 02:30 default, valid against the board\'s own check (m7-7)', () => {
  const patrol = OPERATE_ENTRIES.find(entry => entry.id === 'operate.patrol')
  assert.ok(patrol !== undefined)
  assert.equal(patrol.when.kind, 'daily')
  assert.equal(patrol.when.kind === 'daily' ? patrol.when.time : '', '02:30')
  assert.equal(patrol.action.kind, 'tell-main')
  assert.ok(patrol.action.kind === 'tell-main' && patrol.action.wake === true)
  assert.ok(patrol.action.kind === 'tell-main' && patrol.action.text.startsWith('Scheduled patrol (hourness). Call hourness_report with kind "patrol".'))
  assert.deepEqual(plainWordsIn(patrol.why ?? ''), [])
  for (const entry of OPERATE_ENTRIES) assert.deepEqual(validateEntry(entry, 'plugin', { table: new Map(), now: new Date(NOW) }), [])
})

test('patrolText: the findings render in the design\'s row order, same input same text; unclaimed keys still get said', () => {
  const finding = (key: string, text: string): { key: string, text: string } => ({ key, text })
  const findings = [
    finding('trunk-ahead', '主干领先上游 1 个提交，还没推：abc123'),
    finding('evidence-lacking', '1 个已完成的任务没有进主干的证据批注'),
    finding('worktree-clean', '1 个已完成任务的工作树是干净的，可以删：task-1'),
    finding('graph-stuck', '1 个任务进行中超过 24 小时，派发已不在'),
    finding('hygiene', 'old-candidate: 一条候选 7 天没认领'),
    finding('missed-run', '距上次巡检超过 26 小时，漏跑了'),
    finding('stray', '没人认领的一条'),
  ]
  const text = patrolText({ period: '2026-11-15', findings, jobs: ['主干检查已在后台开始（job j1），结果送到你的下一步'] })
  const order = ['## 主干', '## 活与证据', '## 工作树与分支', '## 项目图', '## 经验与记忆', '## 巡检自身', '## 其他', '## 已在后台'].map(title => text.indexOf(title))
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.ok(text.includes('## 其他\n- 没人认领的一条'))
  assert.ok(text.endsWith('- 主干检查已在后台开始（job j1），结果送到你的下一步'))
  assert.equal(patrolText({ period: '2026-11-15', findings: [], jobs: [] }).includes('## 发现\n- 没有要处理的事'), true)
  assert.equal(patrolText({ period: 'p', findings, jobs: [] }), patrolText({ period: 'p', findings, jobs: [] }))
})

test('missedRunOf and skipStreakOf read the journal the design gives the patrol (row 9)', () => {
  const at = (ms: number): string => new Date(NOW - ms).toISOString()
  assert.equal(missedRunOf([], NOW), false)
  assert.equal(missedRunOf([{ kind: 'run', at: at(30 * 3_600_000) }], NOW), true)
  assert.equal(missedRunOf([{ kind: 'run', at: at(2 * 3_600_000) }], NOW), false)
  assert.equal(missedRunOf([{ kind: 'run', at: at(30 * 3_600_000) }, { kind: 'trunk-check', at: at(1_000) }], NOW), true)
  assert.equal(skipStreakOf([]), false)
  assert.equal(skipStreakOf([{ kind: 'trunk-check', at: at(9_000), outcome: 'skipped' }, { kind: 'trunk-check', at: at(8_000), outcome: 'skipped' }]), true)
  assert.equal(skipStreakOf([{ kind: 'trunk-check', at: at(9_000), outcome: 'skipped' }, { kind: 'trunk-check', at: at(8_000), outcome: 'passed' }]), false)
  assert.equal(skipStreakOf([{ kind: 'trunk-check', at: at(9_000), outcome: 'skipped' }]), false)
})

test('a fresh project: the run journals itself, leaves the gitignore, reports the execute row off and emits the metrics (row 9)', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const host = patrolHost(repo)
    const text = await runPatrol(host)
    assert.ok(text.includes('执行行不在，这次的主干检查没有跑'))
    assert.ok(text.includes('## 已在后台\n- 无'))
    const lines = journalOf(repo)
    assert.equal(lines.length, 1)
    assert.equal(lines[0]?.kind, 'run')
    assert.equal(lines[0]?.trunk, 'skipped')
    assert.ok(existsSync(join(repo.root, '.llm', 'operate', '.gitignore')))
    const patrolEvent = host.emitted.find(item => (item.event as { k?: string }).k === 'operate.patrol')
    assert.ok(patrolEvent !== undefined)
    const body = (patrolEvent.event as { body: { found: Record<string, number>, did: readonly string[], trunk: string } }).body
    assert.equal(body.trunk, 'skipped')
    assert.ok(body.found['trunk-check-absent'] === 1)
    const reportEvent = host.emitted.find(item => (item.event as { k?: string }).k === 'operate.report')
    assert.equal((reportEvent?.event as { body?: { kind?: string } }).body?.kind, 'patrol')
  }
  finally {
    repo.dispose()
  }
})

test('the trunk rows: the push-ahead count, the trailer commit no advance covers, the commits no record walks over (row 6)', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK, gateNode(['`push`'])])
    repo.withRemote()
    const commit = repo.commit({ 'src/feed.xml': '<rss/>\n' }, 'add the feed\n\nHourness-Task: task-1')
    const host = patrolHost(repo)
    const text = await runPatrol(host)
    assert.ok(text.includes('主干领先上游 1 个提交，还没推：'), text.slice(0, 600))
    assert.ok(text.includes(`${commit.slice(0, 12)}`))
    assert.ok(text.includes('个带任务尾注的主干提交没有成立的前进覆盖'))
    assert.ok(text.includes('近 7 天主干上 2 个提交不在任何前进与拉取记录里'))
    assert.ok(text.includes('没有要处理的事') === false)
  }
  finally {
    repo.dispose()
  }
})

test('the worktree and branch rows: the clean and the dirty worktree, the branch merged over fourteen days, the one that never made it (rows 4–5)', async () => {
  const repo = testRepo()
  try {
    const TASK2 = { type: 'task', id: 'task-2', parent: 'goal-1', title: 'Second task', kind: 'implement', writeScope: ['src/'], acceptance: ['it works'], worktree: true } as const
    const engine = await stagedTask(repo, 'done', [TASK2])
    const second = await engine.load()
    await engine.apply('human', { op: 'status', id: 'task-2', rev: second.revisions.get('task-2')!, to: 'dropped', reason: 'test' })
    repo.git('worktree', 'add', '--quiet', '-b', 'hz/task-1', join(repo.root, '.worktrees', 'hz-task-1'), 'main')
    const host = patrolHost(repo)
    const text = await runPatrol(host)
    assert.ok(text.includes('1 个已完成任务的工作树是干净的，可以删：task-1'), text.slice(0, 700))
    // The branch sits on the trunk with no trailer commit older than fourteen days: neither row fires for it yet.
    assert.ok(text.includes('个分支的内容进主干超过 14 天') === false)
    assert.ok(text.includes('内容没进主干的分支') === false)
    // The dated trailer commit lands on the trunk; the branch's tip stays an ancestor: the branch row names it.
    process.env.GIT_COMMITTER_DATE = '2026-10-01T00:00:00+08:00'
    repo.commit({ 'src/feed.xml': '<rss/>\n' }, 'add the feed\n\nHourness-Task: task-1')
    delete process.env.GIT_COMMITTER_DATE
    const merged = await runPatrol(host)
    assert.ok(merged.includes('个分支的内容进主干超过 14 天，可以删：hz/task-1'), merged.slice(0, 700))
    // A branch with unmerged content: a second worktree on its own branch, one commit ahead.
    repo.git('worktree', 'add', '--quiet', '-b', 'hz/task-2', join(repo.root, '.worktrees', 'hz-task-2'), 'main')
    repo.git('-C', join(repo.root, '.worktrees', 'hz-task-2'), 'commit', '--quiet', '--allow-empty', '-m', 'wip on task-2')
    const mixed = await runPatrol(host)
    assert.ok(mixed.includes('个任务已关、内容没进主干的分支：hz/task-2（task-2）'), mixed.slice(0, 700))
  }
  finally {
    repo.dispose()
  }
})

test('the graph rows: the stuck task with no live dispatch and the stale dispatch (row 7)', async () => {
  const repo = testRepo()
  try {
    const engine = await stagedTask(repo, 'doing')
    await engine.apply('harness', { op: 'comment', id: 'task-1', text: renderDispatchComment({ attempt: 1, childId: 'child-1', provider: 'glm', model: 'glm-5.3', why: 'work', brief: 'brief-1', pins: 'pins: task-1@stale' }) })
    const host = patrolHost(repo, { nowMs: NOW + 2 * DAY_MS })
    const text = await runPatrol(host)
    assert.ok(text.includes('1 个任务进行中超过 24 小时，派发已不在：task-1'), text.slice(0, 700))
    assert.ok(text.includes('1 个派发过期了（任务在派发后改过）：task-1'))
  }
  finally {
    repo.dispose()
  }
})

test('the evidence row: the backfill rides the execute service, the lacking tasks are listed (row 3)', async () => {
  const repo = testRepo()
  try {
    await stagedTask(repo, 'done')
    const host = patrolHost(repo, { execute: { runAction: () => Promise.resolve({ outcome: 'done' }), reconcileTrunk: () => Promise.resolve(2) } })
    const text = await runPatrol(host)
    assert.ok(text.includes('1 个已完成的任务没有进主干的证据批注：task-1（Add the feed）'))
    const patrolEvent = host.emitted.find(item => (item.event as { k?: string }).k === 'operate.patrol')
    assert.deepEqual((patrolEvent?.event as { body?: { did?: readonly string[] } }).body?.did, ['evidence-backfill'])
    // The trunk check ran through the same service, as the design's shared job.
    assert.equal(host.runs[0]?.action, 'execute.trunk-check')
  }
  finally {
    repo.dispose()
  }
})

test('the background jobs: the trunk check record rides runAction with a valid event, the patrol command goes through runLine (rows 1–2)', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK, gateNode(['`patrol $ node -e "process.exit(3)"`'])])
    const host = patrolHost(repo, { execute: { runAction: () => Promise.resolve({ outcome: 'done' }) } })
    const text = await runPatrol(host)
    assert.ok(text.includes('主干检查已在后台开始（job trunk-advanced:'), text.slice(0, 700))
    assert.ok(text.includes('巡检命令已在后台开始（node -e "process.exit(3)"）'))
    assert.equal(host.commands.length, 1)
    await new Promise(resolve => setTimeout(resolve, 50))
    const kinds = journalOf(repo).map(line => line.kind)
    assert.deepEqual([...kinds].sort(), ['patrol-command', 'run', 'trunk-check'])
    const record = host.runs[0]?.record as { event: string, key: string, payload: { to: string, tasks: string }, project: string }
    assert.equal(record.event, 'hourness.trunk-advanced')
    assert.match(record.key, /^trunk-advanced:[0-9a-f]+:patrol-\d+$/)
    assert.equal(record.payload.tasks, '')
    assert.equal(record.payload.to, repo.git('rev-parse', 'main'))
    assert.equal(record.project, repo.root)
    const lines = journalOf(repo)
    assert.equal(lines.find(line => line.kind === 'trunk-check')?.outcome, 'passed')
    assert.equal(lines.find(line => line.kind === 'patrol-command')?.outcome, 'failed')
  }
  finally {
    repo.dispose()
  }
})

test('the lessons row: the hygiene findings ride the section, and without the service the section does not appear (M5 §4.9, M7 §3.5.5)', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const withLessons = patrolHost(repo, { lessons: { hygiene: () => Promise.resolve([{ kind: 'old-candidate', id: 'l1', detail: '一条候选超过 7 天了' }]) } })
    const text = await runPatrol(withLessons)
    assert.ok(text.includes('## 经验与记忆\n- old-candidate: 一条候选超过 7 天了'))
    const without = await runPatrol(patrolHost(repo))
    assert.ok(without.includes('## 经验与记忆') === false)
  }
  finally {
    repo.dispose()
  }
})

test('the journal the runs leave feeds the next run: the missed run and the skip streak become findings (rows 2 and 9)', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const staleAt = new Date(NOW - 30 * 3_600_000).toISOString()
    const dir = join(repo.root, '.llm', 'operate')
    const { mkdirSync, appendFileSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'patrol.jsonl'), `${JSON.stringify({ kind: 'run', at: staleAt, found: {}, did: [], trunk: 'skipped' })}\n${JSON.stringify({ kind: 'trunk-check', at: staleAt, outcome: 'skipped' })}\n${JSON.stringify({ kind: 'trunk-check', at: staleAt, outcome: 'skipped' })}\n`)
    const host = patrolHost(repo)
    const text = await runPatrol(host)
    assert.ok(text.includes('距上次巡检超过 26 小时，漏跑了'))
    assert.ok(text.includes('主干检查连续两次没有跑成（锁被占），这次先跳过'))
    assert.equal(journalOf(repo).at(-1)?.kind, 'run')
  }
  finally {
    repo.dispose()
  }
})

test('the patrol kind answers only the main agent, like the other kinds', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const host = patrolHost(repo)
    const notMain: OperateDeps = { ...host.deps, isMain: () => false }
    const exec = { agent: { id: 'worker-1', session: { id: 's2', header: { cwd: repo.root } } } } as unknown as ToolExecutionContext
    await assert.rejects(() => Promise.resolve(hournessReportTool(notMain).execute({ kind: 'patrol' }, exec)), /forbidden/)
  }
  finally {
    repo.dispose()
  }
})

function spyGit(): { readonly git: Git, readonly betweenCalls: Array<readonly [string, string]> } {
  const realGit = createGit()
  const betweenCalls: Array<readonly [string, string]> = []
  const git: Git = {
    ...realGit,
    commitsBetween: (cwd, from, to) => {
      betweenCalls.push([from, to])
      return realGit.commitsBetween(cwd, from, to)
    },
  }
  return { git, betweenCalls }
}

test('patrol excludes rollback advances and clears earlier ok: false advances covered by a later verified forward advance', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const base = repo.git('rev-parse', 'main')
    const c1 = repo.commit({ 'src/a.ts': 'a\n' }, 'first')
    const c2 = repo.commit({ 'src/b.ts': 'b\n' }, 'second')
    const execDir = join(repo.root, '.llm', 'execute')
    mkdirSync(execDir, { recursive: true })
    const atIso = new Date(NOW - 3_600_000).toISOString()
    const writeAdvances = (records: readonly Record<string, unknown>[]): void => {
      writeFileSync(join(execDir, 'advances.jsonl'), `${records.map(record => JSON.stringify(record)).join('\n')}\n`)
    }
    // 1) rollback: true is excluded from trunk-unchecked-advance
    // 2) c0 -> c1 (ok: false) followed by c1 -> c2 (ok: true, check: c2) is covered via isAncestor
    writeAdvances([
      { ref: 'local', from: base, to: c1, ok: false, missing: 'check', at: atIso },
      { ref: 'local', from: c1, to: base, ok: true, check: null, tasks: [], at: atIso, rollback: true },
      { ref: 'local', from: c1, to: c2, ok: true, check: c2, tasks: [], at: atIso },
    ])
    const { git, betweenCalls } = spyGit()
    const text = await runPatrol(patrolHost(repo, { git }))
    assert.ok(!text.includes('没检查的主干前进还没补检查'), text)
    assert.ok(!betweenCalls.some(([from, to]) => from === c1 && to === base), 'rollback does not call commitsBetween')

    // Rollback-then-reapply: base -> c1 (ok: false), c1 -> base (rollback), base -> c3 (verified forward)
    repo.git('reset', '--hard', base)
    const c3 = repo.commit({ 'src/c.ts': 'c\n' }, 'reapply')
    writeAdvances([
      { ref: 'local', from: base, to: c1, ok: false, missing: 'check', at: atIso },
      { ref: 'local', from: c1, to: base, ok: true, check: null, tasks: [], at: atIso, rollback: true },
      { ref: 'local', from: base, to: c3, ok: true, check: c3, tasks: [], at: atIso },
    ])
    const reapplied = await runPatrol(patrolHost(repo))
    assert.ok(!reapplied.includes('没检查的主干前进还没补检查'), reapplied)

    // Still-uncovered ok: false advance is flagged
    writeAdvances([{ ref: 'local', from: base, to: c3, ok: false, missing: 'check', at: atIso }])
    const uncovered = await runPatrol(patrolHost(repo))
    assert.ok(uncovered.includes('1 次没检查的主干前进还没补检查'), uncovered)
  }
  finally {
    repo.dispose()
  }
})

test('patrol avoids commitsBetween on diverged/rebased advance pairs', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const base = repo.git('rev-parse', 'main')
    const diverged = repo.commitOn('side', { 'src/side.ts': 'side\n' }, 'side commit')
    const rebased = repo.commit({ 'src/main.ts': 'main\n' }, 'rebased commit')
    const execDir = join(repo.root, '.llm', 'execute')
    mkdirSync(execDir, { recursive: true })
    writeFileSync(join(execDir, 'advances.jsonl'), `${JSON.stringify({ ref: 'local', from: diverged, to: rebased, ok: true, check: rebased, at: new Date(NOW - 3_600_000).toISOString() })}\n`)
    const { git, betweenCalls } = spyGit()
    const text = await runPatrol(patrolHost(repo, { git }))
    assert.ok(!betweenCalls.some(([from, to]) => from === diverged && to === rebased), 'diverged pair never calls commitsBetween')
    assert.ok(text.includes(`近 7 天主干上 1 个提交不在任何前进与拉取记录里（系统外的改动）：${base.slice(0, 12)}`), text)
  }
  finally {
    repo.dispose()
  }
})

test('patrol checks root commits without a parent against norm-review-floor', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK, floorNode(['受保护文件 `files README.md`'])])
    const seed = repo.git('rev-parse', 'main')
    const text = await runPatrol(patrolHost(repo))
    assert.ok(text.includes(`碰到必须全审改动的主干提交没有全审看过：${seed.slice(0, 12)}`), text)
  }
  finally {
    repo.dispose()
  }
})

test('patrol keeps all 7-day commits when more than 200 commits land in 7 days', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK])
    const blob = repo.git('rev-parse', 'HEAD:README.md')
    const commitSec = Math.floor((NOW - 3_600_000) / 1000)
    const lines: string[] = []
    for (let index = 1; index <= 205; index++) {
      const msg = `bulk commit ${index}`
      lines.push(
        `commit refs/heads/main`,
        `committer Test <test@example.invalid> ${commitSec + index} +0800`,
        `data ${Buffer.byteLength(msg)}\n${msg}`,
        index === 1 ? `from refs/heads/main^0` : '',
        `M 100644 ${blob} README.md`,
      )
    }
    execFileSync('git', ['fast-import', '--quiet'], { cwd: repo.root, input: lines.filter(Boolean).join('\n') + '\n', encoding: 'utf8' })
    repo.git('reset', '--hard', 'refs/heads/main', '--quiet')
    const text = await runPatrol(patrolHost(repo))
    assert.ok(text.includes('近 7 天主干上 206 个提交不在任何前进与拉取记录里'), text)
  }
  finally {
    repo.dispose()
  }
})

test('patrol falls back to main on detached HEAD and uses deps.now for background patrol records', async () => {
  const repo = testRepo()
  try {
    await stageNodes(repo.graphDir, [GOAL, TASK, gateNode(['`push`', '`patrol $ node -e "process.exit(3)"`'])])
    repo.withRemote()
    repo.commit({ 'src/feed.xml': '<rss/>\n' }, 'ahead on main')
    repo.git('checkout', '--detach', 'HEAD', '--quiet')
    const host = patrolHost(repo, { execute: { runAction: () => Promise.resolve({ outcome: 'done' }) } })
    const text = await runPatrol(host)
    assert.ok(text.includes('主干领先上游 1 个提交，还没推'), text)
    await new Promise(resolve => setTimeout(resolve, 50))
    const expectedAt = new Date(NOW).toISOString()
    const lines = journalOf(repo)
    assert.equal(lines.find(line => line.kind === 'trunk-check')?.at, expectedAt)
    assert.equal(lines.find(line => line.kind === 'patrol-command')?.at, expectedAt)
  }
  finally {
    repo.dispose()
  }
})
