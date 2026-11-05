/**
 * M4's own checker (src/env/runner.ts, check-notice.ts, changed-lines.ts;
 * M4 design §6.2-§6.6, §14.2 the host-side env sentence, N17, N37, decision
 * three): real processes through the shared executor on the fake runtime
 * (file names reach the program as they are, a leading '-' gets './', a
 * sleeper is stopped at its limit), and a fake executor for what real
 * processes make slow or racy (the slots, the queue drop, background
 * results, the failure limit, the limits the journal gives). Each fixture is
 * a temporary git repository whose graph has one approved tool node under
 * env.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { changedLines, diffLines, insertedLines } from '../src/env/changed-lines.ts'
import { CHECKS_NOTICE_SOURCE, checkNoticeBody, missingCheckLine, NO_BOARD_CHECKS_LINE, timeoutSentence } from '../src/env/check-notice.ts'
import { envNotice } from '../src/env/notice.ts'
import { CHECK_LINE_EXAMPLE, checkLineRefusal } from '../src/env/check-entry.ts'
import type { EditedStep } from '../src/env/edited.ts'
import { apply as envApply } from '../src/env/index.ts'
import { CHECK_FAILURE_LIMIT, CHECK_SLOTS, checkLogFile, createChecker, createCheckSlots, sweepCheckLogs, type Checker, type CheckerOptions } from '../src/env/runner.ts'
import { parseTiming, type TimingLine } from '../src/env/timeout.ts'
import { openEngine } from '../src/graph/engine.ts'
import { GRAPH_SERVICE } from '../src/graph/service.ts'
import type { CommandRequest, ScriptResult } from '../src/loops/script.ts'
import { LOOPS_DECLARATION, LOOPS_SERVICE, type ListedRun, type LoopsService } from '../src/loops/service.ts'
import type { DerivedMessage, ServiceLookup, SessionLike, UserNotice } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

const git = (root: string, args: readonly string[]): void => {
  const run = spawnSync('git', ['-C', root, '-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', ...args], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
}

interface Board {
  readonly service: LoopsService
  readonly runs: ListedRun[]
}

function fakeBoard(): Board {
  const runs: ListedRun[] = []
  return {
    runs,
    service: {
      declaration: LOOPS_DECLARATION,
      contribute: () => ({ ok: true, dispose: () => {}, accepted: [], dropped: [] }),
      emit: () => Promise.resolve({ ok: true as const, id: 'ev-x', duplicate: false }),
      listens: () => false,
      recordRun: (run) => { runs.push(run) },
    },
  }
}

interface Fixture {
  readonly root: string
  readonly graph: string
  readonly services: Map<string, unknown>
  readonly ctx: ServiceLookup
  readonly board: Board
}

const LINT = 'check lint lines $ node lint.mjs {files} when *.txt'

const LINT_PROGRAM = [
  'import { appendFileSync, readFileSync } from \'node:fs\'',
  'const files = process.argv.slice(2)',
  'appendFileSync(\'args.jsonl\', JSON.stringify(files) + \'\\n\')',
  'for (const file of files) readFileSync(file, \'utf8\').split(\'\\n\').forEach((line, index) => { if (line.includes(\'TODO\')) console.log(`${file}:${index + 1}:1: todo found`) })',
].join('\n')

/** A git repository with lint.mjs and slow.mjs, and a graph whose env has one tool node the human approved with these acceptance lines. */
async function withProject(acceptance: readonly string[], body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'env-checks-'))
  try {
    git(root, ['init', '-q'])
    await writeFile(join(root, 'lint.mjs'), LINT_PROGRAM)
    await writeFile(join(root, 'slow.mjs'), 'setTimeout(() => {}, 120000)\n')
    const graph = join(root, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    const engine = openEngine(graph)
    for (const node of [
      { type: 'goal', title: '目标' },
      { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
      { id: 'tool-1', type: 'tool', title: 'Lint', parent: 'env', acceptance },
    ]) {
      const seeded = await engine.apply('human', { op: 'propose', reason: '建图', node })
      assert.ok(seeded.ok, JSON.stringify(seeded))
      if (seeded.node?.status === 'proposed') assert.ok((await engine.apply('human', { op: 'status', id: seeded.id, rev: seeded.rev, to: 'approved', reason: '批准' })).ok)
    }
    const board = fakeBoard()
    const services = new Map<string, unknown>([[GRAPH_SERVICE, { dirFor: () => graph, isGraphTool: () => false }], [LOOPS_SERVICE, board.service]])
    await body({ root, graph, services, ctx: { get: name => services.get(name) }, board })
  }
  finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}

const call = (id: string, name: string, args: Record<string, unknown>): DerivedMessage =>
  ({ role: 'assistant', source: { kind: 'model' }, content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] })
const result = (id: string): DerivedMessage => ({ role: 'tool', toolCallId: id, isError: false, content: [{ type: 'text', text: 'ok' }] })

const checksNotices = (messages: readonly unknown[]): UserNotice[] =>
  messages.filter((message): message is UserNotice => (message as UserNotice).source?.kind === CHECKS_NOTICE_SOURCE)

const bodyOf = (notice: UserNotice | undefined): string => (notice?.content[0]?.text ?? '').replace(/^<system-reminder>\n/, '').replace(/\n<\/system-reminder>$/, '')

const journalOf = async (root: string): Promise<readonly TimingLine[]> =>
  existsSync(join(root, '.llm', 'env-checks', 'timing.jsonl')) ? parseTiming(await readFile(join(root, '.llm', 'env-checks', 'timing.jsonl'), 'utf8')).lines : []

/** The env row's repository work runs in the background (the daily suppression count): let it land before the fixture goes. */
async function settleRepositoryWork(root: string): Promise<void> {
  for (let tries = 0; tries < 50 && !existsSync(join(root, '.llm', 'audit', 'suppressions.jsonl')); tries++) await new Promise(resolve => setTimeout(resolve, 100))
}

test('on the fake runtime: a finding on a changed line, the fix, a quiet step, and file names that reach the program as they are', async () => {
  await withProject([LINT], async ({ root, services, board }) => {
    const runtime = fakeRuntime({ natives: [], cwd: root })
    for (const [name, value] of services) runtime.ctx.provide(name, value)
    const dispose = envApply(runtime.ctx)
    await runtime.create()
    const step = async (turn: number, calls: readonly DerivedMessage[]): Promise<UserNotice | undefined> => {
      runtime.history.push(...calls)
      // Step 2 onwards: an empty first step never becomes a step (the shared step-notice guard).
      const decision = await runtime.preStep({ turn, step: 2 })
      const messages = (decision as { messages: readonly unknown[] }).messages
      runtime.history.push(...messages)
      return checksNotices(messages)[0]
    }
    await writeFile(join(root, 'a.txt'), 'one\nTODO two\n')
    const first = await step(1, [call('c1', 'write', { file_path: join(root, 'a.txt'), content: '' }), result('c1')])
    const lines = bodyOf(first).split('\n')
    assert.equal(lines[0], 'Checks after your edits: lint 1 finding.')
    assert.equal(lines[1], 'a.txt:2:1 lint todo found [changed]')
    assert.match(lines[2] ?? '', /^Full output: \.llm\/env-checks\/agent-1\/\d{8}T\d{6}-tool-1-lint\.log$/)
    assert.equal(lines[3], 'Fix the findings on changed lines before you finish; new warnings fail the merge gate.')
    const log = readFileSync(join(root, (lines[2] ?? '').slice('Full output: '.length)), 'utf8')
    assert.match(log.split('\n')[0] ?? '', /^\$ node lint\.mjs a\.txt · program .*node/i, 'the log starts with the argument vector and the program')
    assert.deepEqual(first?.source.checks, { lastCall: 'c1', counts: { 'tool-1/lint': 1 } })
    await writeFile(join(root, 'a.txt'), 'one\ntwo\n')
    const fixed = await step(2, [call('c2', 'edit', { file_path: join(root, 'a.txt'), old_string: 'TODO two', new_string: 'two' }), result('c2')])
    assert.equal(bodyOf(fixed), 'Checks after your edits: lint 0.')
    assert.equal(await step(3, []), undefined, 'a step without edits has no checks notice')
    const names = ['b$(echo x).txt', 'c`id`.txt', '%PATH%.txt', '-x.txt']
    for (const name of names) await writeFile(join(root, name), 'clean\n')
    const quiet = await step(4, names.map((name, index) => [call(`n${index}`, 'write', { file_path: join(root, name), content: '' }), result(`n${index}`)]).flat())
    assert.equal(quiet, undefined, 'all zero after all zero injects nothing')
    const received = readFileSync(join(root, 'args.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[])
    assert.deepEqual(received.at(-1), ['b$(echo x).txt', 'c`id`.txt', '%PATH%.txt', './-x.txt'])
    assert.equal(existsSync(join(root, 'x')), false, 'nothing ran the $(…) in a name')
    assert.deepEqual(board.runs.map(run => [run.entry, run.outcome, run.exits]), [['env.checks-after-edit', 'reported', [0]], ['env.checks-after-edit', 'ran', [0]], ['env.checks-after-edit', 'ran', [0]]])
    const journal = await journalOf(root)
    assert.deepEqual(journal.map(line => line.kind), ['value', 'run', 'value', 'run', 'run'], 'the ceiling first (no estimate), then the floor after the first run, unchanged after that')
    await settleRepositoryWork(root)
    dispose()
  })
})

test('a real sleeper is stopped at its limit: the notice names the limit, its basis, the time and the next limit, and the journal keeps it', async () => {
  await withProject(['check slow lines 1s $ node slow.mjs {files} when *.txt'], async ({ root, ctx, board }) => {
    const checker = createChecker({ ctx, note: () => {}, recordRun: (run) => { board.runs.push({ ...run, entry: 'env.checks-after-edit' }) } })
    await writeFile(join(root, 'a.txt'), 'a\n')
    const notice = await checker.step(stepOf(root, ['a.txt']))
    assert.match(bodyOf(notice), /^slow did not finish: stopped after 5\.\d s \(limit 5 s, the floor: three times its estimate of 1 s is less; log \.llm\/env-checks\/s1\/\d{8}T\d{6}-tool-1-slow\.log\)\. It runs again after your next edit, with a limit of 15 s\.$/)
    const journal = await journalOf(root)
    assert.deepEqual(journal.map(line => line.kind), ['value', 'timeout', 'run'])
    assert.deepEqual(journal[2], { kind: 'run', at: journal[2]?.at, check: 'tool-1/slow', argv: journal[0]?.argv, ms: 5000, censored: true })
    assert.match(board.runs[0]?.reason ?? '', /^slow: timeout 5s\/5\.\ds$/)
    assert.equal(board.runs[0]?.outcome, 'failed')
  })
})

/** One step of session `s1` (or another) in which `files` of the fixture's root changed. */
function stepOf(root: string, files: readonly string[], options: { readonly session?: string, readonly subagent?: boolean, readonly history?: readonly DerivedMessage[] } = {}): EditedStep {
  const id = options.session ?? 's1'
  const session = { id, header: { id, cwd: root, ...(options.subagent === true ? { origin: 'subagent' as const } : {}) }, deriveMessages: () => [] } as unknown as SessionLike
  return { session, cwd: root, groups: files.length === 0 ? [] : [{ root, files, truncated: false }], marks: new Map(), history: options.history ?? [], mark: undefined }
}

type Run = (request: CommandRequest) => Promise<ScriptResult>

const exited = (stdout: string, durationMs = 100, exitCode = 0): ScriptResult => ({ kind: 'exited', exitCode, stdout, stderr: '', durationMs, truncated: false })

/** A checker over the fixture with a fake executor; the history threads through the steps as a session's would. */
function fakeChecker(fixture: Fixture, run: Run, over: Partial<CheckerOptions> = {}): { readonly checker: Checker, readonly notes: Map<string, string>, readonly remarks: Set<string>, readonly step: (files: readonly string[], options?: { readonly session?: string, readonly subagent?: boolean }) => Promise<string | undefined> } {
  const notes = new Map<string, string>()
  /** The keys of the notes written as remarks (degrades false): they leave the row's state. */
  const remarks = new Set<string>()
  const checker = createChecker({
    ctx: fixture.ctx,
    note: (_session, key, text, degrades) => {
      remarks.delete(key)
      if (text === undefined) notes.delete(key)
      else {
        notes.set(key, text)
        if (degrades === false) remarks.add(key)
      }
    },
    recordRun: (listed) => { fixture.board.runs.push({ ...listed, entry: 'env.checks-after-edit' }) },
    run,
    ...over,
  })
  const histories = new Map<string, DerivedMessage[]>()
  let edits = 0
  return {
    checker,
    notes,
    remarks,
    async step(files, options = {}) {
      // Every edit changes the file's size, so the unchanged-file cache does not hold it back.
      for (const file of files) await writeFile(join(fixture.root, file), `${'x'.repeat(++edits)}\n`)
      const history = histories.get(options.session ?? 's1') ?? []
      histories.set(options.session ?? 's1', history)
      const notice = await checker.step(stepOf(fixture.root, files, { ...options, history }))
      if (notice !== undefined) history.push(notice)
      return notice === undefined ? undefined : bodyOf(notice)
    },
  }
}

test('the journal decides the limits: the estimate first, a timeout counts as the limit, the next limit is three times it (decision three)', async () => {
  await withProject(['check slow lines 1s $ node slow.mjs {files} when *.txt'], async (fixture) => {
    const outcomes: ScriptResult[] = [{ kind: 'timeout', stdout: '', stderr: '', durationMs: 5_004 }, exited('done', 7_000)]
    const limits: number[] = []
    const { step } = fakeChecker(fixture, (request) => {
      limits.push(request.timeoutMs ?? 0)
      return Promise.resolve(outcomes.shift() ?? exited(''))
    })
    const first = await step(['a.txt'])
    assert.match(first ?? '', /^slow did not finish: stopped after 5\.0 s \(limit 5 s, the floor: three times its estimate of 1 s is less; log .+\)\. It runs again after your next edit, with a limit of 15 s\.$/)
    assert.equal(await step(['a.txt']), undefined, 'a finished run without findings after a notice without counts injects nothing')
    assert.deepEqual(limits, [5_000, 15_000])
    const journal = await journalOf(fixture.root)
    assert.deepEqual(journal.map(line => line.kind), ['value', 'timeout', 'run', 'value', 'run'])
    const [estimate, timeout, censored, harness, finished] = journal
    assert.ok(estimate?.kind === 'value' && harness?.kind === 'value' && timeout?.kind === 'timeout' && censored?.kind === 'run' && finished?.kind === 'run')
    assert.deepEqual(estimate.source, { by: 'estimate', node: 'tool-1', rev: estimate.source.by === 'estimate' ? estimate.source.rev : '', actor: 'human', at: estimate.source.by === 'estimate' ? estimate.source.at : '', estimateS: 1 })
    assert.equal(estimate.limitMs, 5_000)
    assert.deepEqual([timeout.limitMs, timeout.elapsedMs, timeout.session, timeout.outcome], [5_000, 5_004, 's1', 'not-finished'])
    assert.deepEqual([censored.ms, censored.censored], [5_000, true])
    assert.deepEqual([harness.limitMs, harness.previousMs, harness.source], [15_000, 5_000, { by: 'harness', runs: [5_000], factor: 3, floorMs: 5_000 }])
    assert.deepEqual([finished.ms, finished.censored], [7_000, undefined])
    assert.deepEqual(fixture.board.runs.map(run => [run.outcome, run.reason]), [['failed', 'slow: timeout 5s/5.0s'], ['ran', undefined]])
  })
})

test('a limit held at the ceiling says so, and the value records what was wanted', async () => {
  await withProject(['check full lines 25s $ node slow.mjs {files} when *.txt'], async (fixture) => {
    const { step } = fakeChecker(fixture, () => Promise.resolve<ScriptResult>({ kind: 'timeout', stdout: '', stderr: '', durationMs: 60_010 }))
    const text = await step(['a.txt'])
    assert.match(text ?? '', /^full did not finish: stopped after 60\.0 s \(limit 60 s, its ceiling: three times its estimate of 25 s would be 75 s; log .+\)\. It is at its ceiling of 60 s; the main agent has been told\.$/)
    const [value] = await journalOf(fixture.root)
    assert.ok(value?.kind === 'value')
    assert.deepEqual([value.limitMs, value.capped], [60_000, { wantedMs: 75_000 }])
    // The environment notice: the held line for the root agent alone, and it goes once the main agent raised the ceiling (design §6.3.1 item 6, §7.2, ⑤).
    const sessionOf = (subagent: boolean): SessionLike => ({ id: subagent ? 's2' : 's1', header: { id: 's1', cwd: fixture.root, ...(subagent ? { origin: 'subagent' } : {}) } }) as unknown as SessionLike
    // The run stopped at 60 s counts as 60 s: the line speaks of the runs now, no longer of the estimate.
    const HELD = 'Check full is held at its ceiling of 60 s: three times its slowest recent run (60 s) would be 180 s. Raising this check\'s ceiling is your decision and needs no approval from the human: call check_limit with check "tool-1/full", seconds (61 to 600) and a reason. Making the check cheaper or narrower means changing its check line, which is a tool-node change and needs the human\'s approval as usual.'
    const root = await envNotice(fixture.ctx, [], sessionOf(false))
    assert.ok(bodyOf(root).split('\n').includes(HELD), bodyOf(root))
    const child = await envNotice(fixture.ctx, [], sessionOf(true))
    assert.ok(bodyOf(child).includes('Checks run after each edit') && !bodyOf(child).includes('held at its ceiling'), 'a subagent cannot raise a ceiling and does not hear about it')
    assert.equal(await envNotice(fixture.ctx, root === undefined ? [] : [root], sessionOf(false)), undefined, 'the same state injects nothing again')
    await writeFile(join(fixture.root, '.llm', 'env-checks', 'limits.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), check: 'tool-1/full', action: 'raise', capS: 120, previousCapS: 60, reason: '整个项目要跑一分多钟' })}\n`)
    const raised = await envNotice(fixture.ctx, root === undefined ? [] : [root], sessionOf(false))
    assert.ok(raised !== undefined && !bodyOf(raised).includes('held at its ceiling'), 'the state changed: the notice comes again without the line')
  })
})

test('a raised ceiling: the next limit is three times the run under it, its value line says by setting, the check takes the raised slot, and the page says so from limits.jsonl (P13-01)', async () => {
  await withProject(['check full lines 25s $ node slow.mjs {files} when *.txt'], async (fixture) => {
    const limits = join(fixture.root, '.llm', 'env-checks', 'limits.jsonl')
    const reason = '整个项目要跑一分多钟'
    await mkdir(join(fixture.root, '.llm', 'env-checks'), { recursive: true })
    await writeFile(limits, `${JSON.stringify({ at: '2026-11-05T01:00:00.000Z', check: 'tool-1/full', action: 'raise', capS: 120, previousCapS: 60, reason })}\n`)
    const real = createCheckSlots()
    const raisedFlags: boolean[] = []
    const slots = { running: () => real.running(), enter: (run: () => Promise<ScriptResult>, waitMs: number, raised?: boolean) => { raisedFlags.push(raised === true); return real.enter(run, waitMs, raised) } }
    const limitsSeen: number[] = []
    const { checker, step } = fakeChecker(fixture, (request) => {
      limitsSeen.push(request.timeoutMs ?? 0)
      return Promise.resolve(exited('', 100))
    }, { slots })
    await step(['a.txt'])
    assert.deepEqual([limitsSeen, raisedFlags], [[75_000], [true]], 'three times the estimate fits under the raised ceiling; a ceiling over the default takes the raised slot')
    const [value] = await journalOf(fixture.root)
    assert.ok(value?.kind === 'value')
    assert.deepEqual([value.limitMs, value.capped, value.cap], [75_000, undefined, { by: 'setting', capS: 120, at: '2026-11-05T01:00:00.000Z', reason }])
    assert.deepEqual(checker.details(fixture.root)[1], `超时 75 秒 · 你估 25 秒 · 上限已调高到 120 秒：${reason}`)
    await writeFile(limits, `${JSON.stringify({ at: '2026-11-05T02:00:00.000Z', check: 'tool-1/full', action: 'reset', capS: 60, previousCapS: 120, reason: '' })}\n`, { flag: 'a' })
    assert.deepEqual(checker.details(fixture.root)[1], '超时 75 秒 · 你估 25 秒', 'a reset shows before the check runs again, though the latest value line was computed under the setting')
  })
})

test('a command changed by the human starts over from its estimate: runs of the old command do not count', async () => {
  await withProject(['check lint lines 2s $ node lint.mjs {files} when *.txt'], async (fixture) => {
    const limits: number[] = []
    const { step } = fakeChecker(fixture, (request) => {
      limits.push(request.timeoutMs ?? 0)
      return Promise.resolve(exited('', 9_000))
    })
    await step(['a.txt'])
    await step(['a.txt'])
    const engine = openEngine(fixture.graph)
    const node = (await engine.load()).nodes.get('tool-1')
    const rev = (await engine.load()).revisions.get('tool-1') ?? ''
    assert.ok(node !== undefined)
    const edited = await engine.apply('human', { op: 'edit', id: 'tool-1', rev, reason: '改命令', set: { acceptance: ['check lint lines 2s $ node lint.mjs --strict {files} when *.txt'] } })
    assert.ok(edited.ok, JSON.stringify(edited))
    await step(['a.txt'])
    assert.deepEqual(limits, [6_000, 27_000, 6_000])
    const values = (await journalOf(fixture.root)).filter(line => line.kind === 'value')
    assert.equal(values.length, 3)
    assert.ok(values[2]?.kind === 'value' && values[2].source.by === 'estimate' && values[2].source.actor === 'human')
  })
})

test('every failure is on the row health and degrades it; three in a row stop the check for the session (told once, recorded skipped); timeouts do not count and do not degrade (N37, design §6.3.1)', async () => {
  await withProject([LINT], async (fixture) => {
    let calls = 0
    const { step, notes, remarks } = fakeChecker(fixture, () => {
      calls++
      return Promise.resolve<ScriptResult>(calls === 2 ? exited('not a finding', 50, 2) : { kind: 'crashed', reason: 'spawn', message: '找不到 node\nmore', durationMs: 1 })
    })
    assert.match(await step(['a.txt']) ?? '', /^lint did not run: 找不到 node \(log .+\)$/)
    assert.equal(notes.get('checks-failed'), 'tool-1/lint 没跑成：找不到 node', 'the first failure is on the row health, with the first line of its reason')
    assert.equal(remarks.has('checks-failed'), false, 'a failure degrades the row')
    assert.match(await step(['a.txt']) ?? '', /^lint did not run: the output could not be read as lines \(exit code 2\) \(log .+\)$/)
    assert.equal(notes.get('checks-failed'), 'tool-1/lint 没跑成：the output could not be read as lines (exit code 2)')
    assert.match(await step(['a.txt']) ?? '', /^lint did not run: 找不到 node/)
    assert.equal(notes.get('checks-failed'), `tool-1/lint 本会话不再跑：连续 ${CHECK_FAILURE_LIMIT} 次跑不起来或输出读不懂`)
    assert.match(await step(['a.txt']) ?? '', new RegExp(`^lint skipped for this session after ${CHECK_FAILURE_LIMIT} failures \\(log .+\\)$`))
    assert.equal(await step(['a.txt']), undefined)
    assert.equal(calls, 3, 'no run after the third failure')
    assert.deepEqual(fixture.board.runs.map(run => run.outcome), ['failed', 'failed', 'failed', 'skipped'])
  })
  await withProject([LINT], async (fixture) => {
    let calls = 0
    const { step, notes } = fakeChecker(fixture, () => {
      calls++
      return Promise.resolve<ScriptResult>(calls === 1 ? { kind: 'refused', reason: 'outside-project', message: '工作目录不在这个项目的检出里' } : exited(''))
    })
    assert.match(await step(['a.txt']) ?? '', /^lint did not run: 工作目录不在这个项目的检出里/)
    assert.equal(notes.get('checks-failed'), 'tool-1/lint 没跑成：工作目录不在这个项目的检出里', 'the executor refusing the checkout is on the row health (design §6.3)')
    await step(['a.txt'])
    assert.equal(notes.has('checks-failed'), false, 'withdrawn by the check\'s next run that reads')
  })
  await withProject([LINT], async (fixture) => {
    let calls = 0
    const { step, notes, remarks } = fakeChecker(fixture, () => {
      calls++
      return Promise.resolve<ScriptResult>(calls <= CHECK_FAILURE_LIMIT + 1 ? { kind: 'timeout', stdout: '', stderr: '', durationMs: 60_000 } : exited(''))
    })
    for (let index = 0; index < CHECK_FAILURE_LIMIT + 1; index++) assert.match(await step(['a.txt']) ?? '', /^lint did not finish/)
    assert.equal(calls, CHECK_FAILURE_LIMIT + 1, 'a timeout is not a failure: the next edit runs it again')
    assert.equal(notes.get('checks-timeout'), 'tool-1/lint 没跑完：上限 60 秒，跑了 60.0 秒', 'a timeout is on the row health')
    assert.equal(remarks.has('checks-timeout'), true, 'as a remark: a timeout does not degrade the row')
    assert.equal(notes.has('checks-failed'), false)
    await step(['a.txt'])
    assert.equal(notes.has('checks-timeout'), false, 'withdrawn when the check next finishes')
  })
})

test('a slow check goes on in the background: no second start while it runs, its result arrives with a later step', async () => {
  await withProject([LINT], async (fixture) => {
    let release: (result: ScriptResult) => void = () => {}
    let calls = 0
    const { step } = fakeChecker(fixture, () => {
      calls++
      return new Promise<ScriptResult>(resolve => { release = resolve })
    }, { stepDeadlineMs: 50 })
    assert.equal(await step(['a.txt']), undefined, 'still running when the step goes on: nothing to say yet')
    assert.equal(await step(['a.txt']), undefined)
    assert.equal(calls, 1, 'the same check is not started a second time while it runs')
    release(exited('a.txt:1:1: todo found'))
    let later: string | undefined
    for (let tries = 0; tries < 50 && later === undefined; tries++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      later = await step([])
    }
    assert.match(later ?? '', /^Checks after your edits: lint 1 finding\.\na\.txt:1:1 lint todo found \[changed\]/)
  })
})

test('the process slots: a third check waits and says so, one that waited too long is dropped and journalled, the next edit queues it again (N17)', async () => {
  await withProject([LINT], async (fixture) => {
    const slots = createCheckSlots(CHECK_SLOTS)
    const held: Array<() => void> = []
    for (let index = 0; index < CHECK_SLOTS; index++) void slots.enter(() => new Promise<ScriptResult>(resolve => { held.push(() => { resolve(exited('')) }) }), 60_000).done
    assert.equal(slots.running(), 2)
    let calls = 0
    const { step } = fakeChecker(fixture, () => {
      calls++
      return Promise.resolve(exited(''))
    }, { slots, stepDeadlineMs: 50, queueWaitMs: 1_000 })
    assert.equal(await step(['a.txt']), 'lint has not started: it is queued behind 2 running checks. Its result arrives in a later step.')
    assert.deepEqual((await journalOf(fixture.root)).map(line => line.kind), ['value'], 'waiting is not a timeout')
    await new Promise(resolve => setTimeout(resolve, 1_200))
    assert.equal(await step([]), 'lint did not run: it waited 1 s behind 2 running checks and was dropped. It runs again after your next edit.')
    const queue = (await journalOf(fixture.root)).at(-1)
    assert.ok(queue?.kind === 'queue')
    assert.deepEqual([queue.running, queue.session, queue.outcome], [2, 's1', 'not-run'])
    assert.deepEqual(fixture.board.runs.map(run => [run.outcome, run.reason]), [['failed', 'lint: queue 1s']])
    assert.equal(calls, 0)
    for (const free of held) free()
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(await step(['a.txt']), undefined, 'the next edit runs it again: a drop is not a failure')
    assert.equal(calls, 1)
  })
})

test('an unchanged file under the same node revision is not checked again', async () => {
  await withProject([LINT], async (fixture) => {
    let calls = 0
    const checker = createChecker({ ctx: fixture.ctx, note: () => {}, recordRun: () => {}, run: () => { calls++; return Promise.resolve(exited('')) } })
    await writeFile(join(fixture.root, 'a.txt'), 'a\n')
    await checker.step(stepOf(fixture.root, ['a.txt']))
    await checker.step(stepOf(fixture.root, ['a.txt']))
    assert.equal(calls, 1)
  })
})

test('changed lines: the new side of git diff, the whole of an untracked file, the edits\' new text outside git', async () => {
  assert.deepEqual([...diffLines('@@ -1 +1 @@\n-a\n+b\n@@ -5,0 +6,2 @@\n+c\n+d\n@@ -9,2 +11,0 @@\n')], [1, 6, 7])
  assert.deepEqual([...(insertedLines('a\nb\nc\nb\n', { whole: false, inserts: [{ text: 'b', all: true }] }) as Set<number>)], [2, 4])
  assert.equal(insertedLines('a', { whole: true, inserts: [] }), 'all')
  await withProject([LINT], async (fixture) => {
    await writeFile(join(fixture.root, 'a.txt'), 'one\ntwo\nthree\n')
    git(fixture.root, ['add', 'a.txt'])
    git(fixture.root, ['commit', '-q', '-m', 'a'])
    await writeFile(join(fixture.root, 'a.txt'), 'one\ntwo\nTHREE\n')
    assert.deepEqual([...(await changedLines(fixture.root, 'a.txt', undefined) as Set<number>)], [3])
    await writeFile(join(fixture.root, 'new.txt'), 'x\n')
    assert.equal(await changedLines(fixture.root, 'new.txt', undefined), 'all')
    const checker = createChecker({ ctx: fixture.ctx, note: () => {}, recordRun: () => {}, run: () => Promise.resolve(exited('a.txt:1:1: old\na.txt:3:2: new')) })
    const notice = await checker.step(stepOf(fixture.root, ['a.txt']))
    assert.deepEqual(bodyOf(notice).split('\n').slice(0, 3), ['Checks after your edits: lint 2 findings.', 'a.txt:3:2 lint new [changed]', 'a.txt:1:1 lint old [elsewhere in file]'])
  })
})

test('languages no check covers: the main agent hears how to propose one, a subagent to pass it on, once per session and extension', async () => {
  await withProject([LINT], async (fixture) => {
    const { step } = fakeChecker(fixture, () => Promise.resolve(exited('')))
    const main = await step(['a.py'])
    assert.equal(main, missingCheckLine(['.py'], false))
    assert.ok(main?.startsWith('No check covers .py files in this project. Propose a tool node under the env branch with graph_propose'), main)
    assert.ok(main?.includes(`for example: ${CHECK_LINE_EXAMPLE}. The 3s is your estimate of one run; the time limit is three times it`), main)
    assert.ok(main?.includes('The community default for Python is ruff.'), main)
    assert.equal(await step(['b.py']), undefined, 'once per extension and session')
    assert.equal(await step(['c.md']), undefined, 'a file of no language asks for no check')
    assert.equal(await step(['a.py'], { session: 's2', subagent: true }), 'No check covers .py files in this project; mention it in your final result so the main agent can propose one.')
    assert.equal(checkLineRefusal(CHECK_LINE_EXAMPLE), undefined, 'the example line in the notice reads')
  })
})

test('without the loop board no check runs: the session hears it once and the row health says so', async () => {
  await withProject([LINT], async (fixture) => {
    fixture.services.delete(LOOPS_SERVICE)
    let calls = 0
    const { step, notes } = fakeChecker(fixture, () => { calls++; return Promise.resolve(exited('')) })
    assert.equal(await step(['a.ts']), NO_BOARD_CHECKS_LINE)
    assert.equal(await step(['b.ts']), undefined)
    assert.equal(calls, 0)
    assert.equal(notes.get('checks-board'), '循环板不在：改完文件不跑检查')
  })
})

test('the loop board\'s details: two lines per check, the value and where it came from', async () => {
  await withProject(['check slow lines 1s $ node slow.mjs {files} when *.txt'], async (fixture) => {
    const outcomes: ScriptResult[] = [{ kind: 'timeout', stdout: '', stderr: '', durationMs: 5_004 }, exited('', 40)]
    const { checker, step } = fakeChecker(fixture, () => Promise.resolve(outcomes.shift() ?? exited('')))
    assert.deepEqual(checker.details(fixture.root), [], 'nothing before a step in the project')
    await step(['a.txt'])
    assert.deepEqual(checker.details(fixture.root), ['Lint：改了 *.txt 之后跑 · node slow.mjs {files}', '超时 5 秒 · 你估 1 秒'])
    await step(['a.txt'])
    assert.deepEqual(checker.details(fixture.root), ['Lint：改了 *.txt 之后跑 · node slow.mjs {files}', '超时 15 秒 · 系统按最近 1 次，最慢 5 秒 · 原 5 秒'])
  })
})

test('the notice keeps five findings, changed lines first, within its length', () => {
  const findings = Array.from({ length: 8 }, (_, index) => ({ file: `f${index}.ts`, line: index + 1, message: 'm'.repeat(300), changed: index % 2 === 1 }))
  const body = checkNoticeBody([{ kind: 'findings', name: 'eslint', key: 'tool-3/eslint', findings, log: 'x.log' }], [], [], [])
  const lines = body.split('\n')
  assert.equal(lines[0], 'Checks after your edits: eslint 8 findings.')
  const shown = lines.filter(line => line.endsWith('[changed]') || line.endsWith('[elsewhere in file]'))
  assert.ok(shown.length <= 5 && shown.length > 0)
  assert.ok(shown.every(line => line.length <= 200))
  assert.ok(shown[0]?.endsWith('[changed]'))
  assert.ok(body.length <= 1200, String(body.length))
  assert.equal(timeoutSentence({ kind: 'timeout', name: 'eslint', key: 'tool-3/eslint', elapsedMs: 12_100, limitMs: 12_000, basis: 'three times its slowest recent run of 4 s', nextLimitMs: 36_000, capMs: 60_000, log: '.llm/x.log' }),
    'eslint did not finish: stopped after 12.1 s (limit 12 s, three times its slowest recent run of 4 s; log .llm/x.log). It runs again after your next edit, with a limit of 36 s.')
  assert.equal(timeoutSentence({ kind: 'timeout', name: 'eslint', key: 'tool-3/eslint', elapsedMs: 120_000, limitMs: 120_000, basis: 'its ceiling: three times its slowest recent run of 50 s would be 150 s', nextLimitMs: 120_000, capMs: 120_000, log: '.llm/x.log' }),
    'eslint did not finish: stopped after 120.0 s (limit 120 s, its ceiling: three times its slowest recent run of 50 s would be 150 s; log .llm/x.log). It is at its ceiling of 120 s; the main agent has been told.',
    'a raised ceiling is the ceiling the sentence names')
})

test('logs: one directory per session, swept after seven days when the name is eight hex digits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'env-logs-'))
  try {
    assert.match(checkLogFile(home, '541bab35-aaaa', new Date('2026-10-29T12:55:01.123Z'), 'tool-3', 'eslint').replace(/\\/g, '/'), /\/env-checks\/541bab35\/20261029T125501-tool-3-eslint\.log$/)
    assert.match(checkLogFile(home, 'session-b6215148-e452-4e0a-84b1-3b18007c36d2', new Date('2026-10-29T12:55:01Z'), 'tool-3', 'eslint').replace(/\\/g, '/'), /\/env-checks\/b6215148\//, 'an rc.3 session id loses its prefix')
    for (const name of ['0123abcd', 'keep-me']) await mkdir(join(home, 'env-checks', name), { recursive: true })
    sweepCheckLogs(home, Date.now() + 8 * 24 * 3600 * 1000)
    assert.deepEqual(await readdir(join(home, 'env-checks')), ['keep-me'])
  }
  finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('src/env starts no process itself: the shared executor does', async () => {
  for (const file of await readdir(join(import.meta.dirname, '..', 'src', 'env'))) {
    const text = await readFile(join(import.meta.dirname, '..', 'src', 'env', file), 'utf8')
    assert.ok(!text.includes('node:child_process'), file)
  }
})
