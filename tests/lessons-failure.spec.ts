/**
 * Lessons after a failed call on the fake rc.3 host (M5 design §4.4, §4.6;
 * acceptance lessons-2): the reminder a failed call carries in its result,
 * what counts as a failure, the lessons a session has been told, the hits
 * that are recorded and the recurrence they lead to, and the promise that
 * the call itself is never touched. The journal is a real file; the shell
 * tool answers in the shape of the DSH `pwsh` result.
 */
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import test from 'node:test'
import { FAILURE_SOURCE, failureText } from '../src/lessons/failure.ts'
import { RECUR_SOURCE } from '../src/lessons/notices.ts'
import { journalFile } from '../src/lessons/storage.ts'
import type { AgentLike, PostExecuteDecision, PostExecuteHost, PreExecuteListener, ToolExecuteInput, ToolFinalResult, UserNotice } from '../src/shared/dsh-min.ts'
import { captureWarnings } from './graph-helpers.ts'
import { fakeTool as tool, kinds, rowHealth, withRow, WORK, type Row, type RowOptions } from './lessons-row-host.ts'
import { agentOf } from './memory-helpers.ts'

const FRAGMENT = 'dsh : The term \'dsh\' is not recognized'
const lessonAbout = (fragment: string, word: string) => ({
  action: 'new',
  reason: 'seed for the spec',
  situation: { errors: [fragment] },
  pitfall: `The ${word} pitfall, told in a sentence of its own.`,
  fix: `The ${word} fix.`,
  evidence: ['docs/DEVELOPMENT.md §3'],
})
const DSH = lessonAbout(FRAGMENT, 'dsh')

interface ShellRun {
  readonly exitCode?: number | null
  readonly stderr?: string
  readonly stdout?: string
  readonly timedOut?: boolean
}

/** The value of a foreground shell call (dsh-tool-pwsh `canonicalPwshResult`). */
const shellValue = (run: ShellRun) => ({
  kind: 'foreground',
  cwd: WORK,
  exitCode: run.exitCode === undefined ? 0 : run.exitCode,
  signal: null,
  timedOut: run.timedOut ?? false,
  aborted: false,
  timeoutMs: 120_000,
  stdout: { text: run.stdout ?? '', truncated: false },
  stderr: { text: run.stderr ?? '', truncated: false },
})

/** A shell tool that answers with the runs in order (the last one repeats). */
function shell(row: Row, name: string, runs: readonly ShellRun[]): void {
  let next = 0
  tool(row, name, () => shellValue(runs[Math.min(next++, runs.length - 1)] ?? {}))
}

let counter = 0
/** Per row, how many hits the reminders it gave will leave in the journal. */
const owed = new WeakMap<Row, number>()
async function call(row: Row, agent: AgentLike | undefined, name: string, extra: Partial<ToolExecuteInput> = {}): Promise<ToolFinalResult> {
  const result = await row.runtime.ctx.tools.execute({ callId: `call-${++counter}`, name, arguments: {}, signal: new AbortController().signal, ...(agent === undefined ? {} : { agent }), ...extra })
  const told = (result.additionalContexts ?? []).flatMap(context => (context as UserNotice).source?.kind === FAILURE_SOURCE ? [((context as UserNotice).source.lessons as string[]).length] : [])
  owed.set(row, told.reduce((sum, count) => sum + count, owed.get(row) ?? 0))
  return result
}

const noticeOf = (result: ToolFinalResult): UserNotice => {
  assert.equal(result.additionalContexts?.length, 1, 'one reminder')
  return result.additionalContexts[0] as UserNotice
}
const textOf = (notice: UserNotice): string => notice.content[0].text
const hitsOf = (row: Row) => row.journal().filter(record => record.op === 'hit')

/** The hits of the journal once `count` are there: the row writes them after the result is out. */
async function hitsAfter(row: Row, count: number): Promise<Array<Record<string, unknown>>> {
  for (let attempt = 0; attempt < 150 && hitsOf(row).length < count; attempt += 1) await new Promise(resolve => setTimeout(resolve, 20))
  return hitsOf(row)
}

/** `withRow`, then wait for the hits the reminders left to be written: the project directory must not go while a write is on its way. */
const inRow = (body: (row: Row) => Promise<void>, options?: RowOptions): Promise<void> => withRow(async (row) => {
  await body(row)
  await hitsAfter(row, owed.get(row) ?? 0)
}, options)
test('a failed shell call whose stderr holds a lesson fragment carries the reminder and leaves a hit; a call that ran through, or a failure no lesson knows, carries nothing', async () => {
  await inRow(async (row) => {
    assert.equal((await row.tool('lessons_merge', DSH)).lesson, 'L-100000')
    shell(row, 'pwsh', [{ exitCode: 0, stderr: FRAGMENT }, { exitCode: 3, stderr: 'something else broke' }, { exitCode: 3, stderr: `${FRAGMENT}\n` }])
    const { agent } = row.runtime
    assert.equal((await call(row, agent, 'pwsh')).additionalContexts, undefined, 'the command exited with 0')
    assert.equal((await call(row, agent, 'pwsh')).additionalContexts, undefined, 'a failure no lesson knows')
    const failed = await call(row, agent, 'pwsh')
    const notice = noticeOf(failed)
    assert.equal(notice.source.kind, FAILURE_SOURCE)
    assert.equal(notice.source.form, 'notice')
    assert.equal(notice.source.summary, 'lesson match')
    assert.deepEqual(notice.source.lessons, ['L-100000'])
    assert.equal(textOf(notice), [
      '<system-reminder>',
      'This failure matches a lesson from earlier work (advice, not a rule; check that the fix still applies):',
      `- L-100000: ${FRAGMENT} → The dsh pitfall, told in a sentence of its own. → The dsh fix.`,
      'More with lessons_query.',
      '</system-reminder>',
    ].join('\n'))
    assert.equal(failed.isError, false, 'the call itself is as it was')
    assert.deepEqual(failed.content, [{ type: 'text', text: 'output' }])
    assert.equal((failed.value as { exitCode: number }).exitCode, 3)
    const [hit, ...more] = await hitsAfter(row, 1)
    assert.equal(more.length, 0)
    assert.deepEqual([hit?.actor, hit?.op, hit?.id], ['harness', 'hit', 'L-100000'])
    assert.deepEqual(hit?.by, { session: 'agent-1', agent: 'agent-1', tool: 'pwsh', callId: row.runtime.executed.at(-1)?.callId })
  })
})

test('the GLM face\'s Bash is read as pwsh and the hit names the native; a bash tool is a shell as well', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'Bash', [{ exitCode: 1, stderr: FRAGMENT }])
    shell(row, 'bash', [{ exitCode: 1, stderr: FRAGMENT }])
    assert.deepEqual(noticeOf(await call(row, row.runtime.agent, 'Bash')).source.lessons, ['L-100000'])
    assert.deepEqual(noticeOf(await call(row, agentOf('session-2', { cwd: WORK }), 'bash')).source.lessons, ['L-100000'])
    const hits = await hitsAfter(row, 2)
    assert.deepEqual(hits.map(hit => (hit.by as { tool: string }).tool).sort(), ['bash', 'pwsh'])
  })
})

test('a timed out shell call is a failure, with or without an exit code', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: null, timedOut: true, stdout: `partial output, then ${FRAGMENT}` }])
    assert.equal(noticeOf(await call(row, row.runtime.agent, 'pwsh')).source.kind, FAILURE_SOURCE)
  })
})

test('a result that is an error counts for any tool, a call that tools/pre-execute refused included; a tool that succeeded with the words in its text does not', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    await row.tool('lessons_merge', lessonAbout('EMFILE: too many open files', 'emfile'))
    const { agent } = row.runtime
    tool(row, 'reader', () => new Error(`${FRAGMENT} while loading`))
    assert.deepEqual(noticeOf(await call(row, agent, 'reader')).source.lessons, ['L-100000'])
    const refuse: PreExecuteListener = () => Promise.resolve({ kind: 'deny', reason: 'blocked: EMFILE: too many open files' })
    const off = row.runtime.ctx.on('tools/pre-execute', refuse)
    const denied = await call(row, agent, 'pwsh')
    off()
    assert.equal(denied.isError, true)
    assert.deepEqual(noticeOf(denied).source.lessons, ['L-100001'])
    tool(row, 'writer', () => ({ text: FRAGMENT }))
    const clean = await call(row, agentOf('session-2', { cwd: WORK }), 'writer')
    assert.equal(clean.isError, false)
    assert.equal(clean.additionalContexts, undefined)
  })
})

test('the lessons a session was told are not told again: not in a second call, not when its history says so, while another session gets its own', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    const { agent } = row.runtime
    assert.equal(noticeOf(await call(row, agent, 'pwsh')).source.kind, FAILURE_SOURCE)
    assert.equal((await call(row, agent, 'pwsh')).additionalContexts, undefined, 'this process pushed it to the session already')
    assert.equal(noticeOf(await call(row, agentOf('session-2', { cwd: WORK }), 'pwsh')).source.kind, FAILURE_SOURCE)
    assert.equal((await hitsAfter(row, 2)).length, 2, 'one hit per session and lesson')
  })
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    row.runtime.history.push({ role: 'user', content: [{ type: 'text', text: 'earlier' }], source: { kind: FAILURE_SOURCE, form: 'notice', lessons: ['L-100000'] } })
    assert.equal((await call(row, row.runtime.agent, 'pwsh')).additionalContexts, undefined, 'the visible history lists it')
    assert.deepEqual(row.journal().filter(record => record.op === 'hit'), [])
  })
})

test('a reminder lists two lessons at most, the longest fragment first, and the ones already told are left out before the cut', async () => {
  await inRow(async (row) => {
    const fragments = ['xshared failure text', 'xxshared failure text', 'xxxshared failure text']
    for (const [index, fragment] of fragments.entries()) await row.tool('lessons_merge', lessonAbout(fragment, `number ${String(index)}`))
    shell(row, 'pwsh', [{ exitCode: 2, stderr: 'xxxshared failure text' }])
    const { agent } = row.runtime
    assert.deepEqual(noticeOf(await call(row, agent, 'pwsh')).source.lessons, ['L-100002', 'L-100001'])
    assert.deepEqual(noticeOf(await call(row, agent, 'pwsh')).source.lessons, ['L-100000'])
    assert.equal((await call(row, agent, 'pwsh')).additionalContexts, undefined)
    assert.deepEqual((await hitsAfter(row, 3)).map(hit => hit.id).sort(), ['L-100000', 'L-100001', 'L-100002'])
  })
})

test('a delegated child\'s failure is matched too, under its own session', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    const child = agentOf('worker-1', { cwd: WORK, subagent: true })
    assert.equal(noticeOf(await call(row, child, 'pwsh')).source.kind, FAILURE_SOURCE)
    assert.deepEqual((await hitsAfter(row, 1)).map(hit => hit.by), [{ session: 'worker-1', agent: 'worker-1', tool: 'pwsh', callId: row.runtime.executed.at(-1)?.callId }])
  })
})

test('a transport sub-call, a call without an agent and a session without a project are not looked at', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    assert.equal((await call(row, row.runtime.agent, 'pwsh', { parent: Symbol('run_code') })).additionalContexts, undefined)
    assert.equal((await call(row, undefined, 'pwsh')).additionalContexts, undefined)
    assert.deepEqual(row.journal().filter(record => record.op === 'hit'), [])
    assert.equal(noticeOf(await call(row, row.runtime.agent, 'pwsh')).source.kind, FAILURE_SOURCE, 'the same failure from a call that counts')
  })
  await inRow(async (row) => {
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    assert.equal((await call(row, row.runtime.agent, 'pwsh')).additionalContexts, undefined)
    assert.deepEqual(row.journal(), [])
  }, { noProject: true })
})

test('what the listeners below decided is kept: their contexts follow the reminder, their block stays a block', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    const marker = { id: 'marker', role: 'user', content: [] }
    let decide = (): PostExecuteDecision => ({ kind: 'accept', additionalContexts: [marker] })
    const host = row.runtime.ctx as unknown as PostExecuteHost
    host.on('tools/post-execute', () => Promise.resolve(decide()))
    const accepted = await call(row, row.runtime.agent, 'pwsh')
    assert.equal(accepted.isError, false)
    assert.deepEqual(accepted.additionalContexts?.map(context => (context as UserNotice).source?.kind ?? 'marker'), [FAILURE_SOURCE, 'marker'])
    decide = () => ({ kind: 'block', feedback: [{ type: 'text', text: 'blocked below' }] })
    const blocked = await call(row, agentOf('session-2', { cwd: WORK }), 'pwsh')
    assert.equal(blocked.isError, true)
    assert.deepEqual(blocked.content, [{ type: 'text', text: 'blocked below' }])
    assert.equal(noticeOf(blocked).source.kind, FAILURE_SOURCE)
  })
})

test('the text a failure is matched against: the end of stderr then the end of stdout for a shell that failed, the start of the text of an error result for any tool', () => {
  const shellResult = (run: ShellRun): ToolFinalResult => ({ isError: false, value: shellValue(run), content: [] })
  assert.equal(failureText('pwsh', shellResult({ exitCode: 0, stderr: 'warning only' })), undefined)
  assert.equal(failureText('pwsh', shellResult({ exitCode: 3, stderr: 'e', stdout: 'o' })), 'e\no')
  assert.equal(failureText('bash', shellResult({ exitCode: 1, stderr: 'e' })), 'e\n')
  assert.equal(failureText('pwsh', shellResult({ exitCode: null, timedOut: true, stdout: 'partial' })), '\npartial')
  assert.equal(failureText('read', shellResult({ exitCode: 3, stderr: 'e' })), undefined, 'a tool that is no shell does not fail by a field of its value')
  assert.equal(failureText('pwsh', { isError: false, value: 'text', content: [] }), undefined)
  const long = failureText('pwsh', shellResult({ exitCode: 1, stderr: `${'x'.repeat(5000)}TAIL`, stdout: `HEAD${'y'.repeat(5000)}` }))
  assert.equal(long?.length, 4000 + 1 + 2000)
  assert.ok(long?.includes('TAIL') && !long.includes('HEAD'))
  const failed: ToolFinalResult = { isError: true, content: [{ type: 'text', text: 'Error: no such file' }, { type: 'image' }], error: { message: 'no such file' } }
  assert.equal(failureText('read', failed), 'Error: no such file\n\nno such file')
  assert.equal(failureText('pwsh', failed), 'Error: no such file\n\nno such file', 'a refused shell call has no value to read')
  assert.equal(failureText('read', { isError: true, content: [{ type: 'text', text: 'z'.repeat(7000) }] })?.length, 6000)
  assert.equal(failureText('read', { isError: false, value: {}, content: [{ type: 'text', text: 'Error: only text' }] }), undefined)
})

test('a journal that cannot be read leaves the result as it was and shows in the health; so does a history that cannot be derived, with one warning', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    rmSync(journalFile(row.project))
    mkdirSync(journalFile(row.project)) // a directory where the journal should be
    const result = await call(row, row.runtime.agent, 'pwsh')
    assert.equal(result.additionalContexts, undefined)
    assert.ok(rowHealth(row).reason.includes('失败匹配读不出经验'), rowHealth(row).reason)
  })
  const { warnings } = await captureWarnings(() => inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    row.runtime.agent.session!.deriveMessages = () => { throw new Error('history is gone') }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await call(row, row.runtime.agent, 'pwsh')
      assert.equal(result.isError, false)
      assert.equal(result.additionalContexts, undefined, 'the result is as the tool made it')
      assert.deepEqual(result.content, [{ type: 'text', text: 'output' }])
    }
    assert.equal(rowHealth(row).status, 'degraded')
    assert.ok(rowHealth(row).reason.includes('失败匹配出错：history is gone'), rowHealth(row).reason)
    assert.deepEqual(row.journal().filter(record => record.op === 'hit'), [])
  }))
  assert.equal(warnings.filter(text => text.includes('failure-matching') || text.includes('matching a failed call')).length, 1, warnings.join(' | '))
})

test('a hit whose write fails is told once and shows in the health, and the reminder is given all the same', async () => {
  let failing = false
  const { warnings } = await captureWarnings(live => inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    failing = true
    const failed = await call(row, row.runtime.agent, 'pwsh')
    assert.equal(noticeOf(failed).source.kind, FAILURE_SOURCE)
    for (let attempt = 0; attempt < 150 && !live.some(text => text.includes('not recorded')); attempt += 1) await new Promise(resolve => setTimeout(resolve, 20))
    await row.step()
    assert.ok(rowHealth(row).reason.includes('经验流水写失败'), rowHealth(row).reason)
  }, { config: { append: { sync: async (handle) => { if (failing) throw new Error('disk full'); await handle.sync() } } } }))
  assert.equal(warnings.filter(text => text.includes('a lesson match was not recorded')).length, 1, warnings.join(' | '))
})

test('a lesson that matched in three different sessions in 28 days is brought up to the main agent once; two sessions are not enough', async () => {
  await inRow(async (row) => {
    await row.tool('lessons_merge', DSH)
    shell(row, 'pwsh', [{ exitCode: 1, stderr: FRAGMENT }])
    await call(row, row.runtime.agent, 'pwsh')
    await call(row, agentOf('worker-2', { cwd: WORK, subagent: true }), 'pwsh')
    await hitsAfter(row, 2)
    assert.deepEqual(kinds(await row.step()), [], 'two sessions')
    await call(row, agentOf('worker-3', { cwd: WORK, subagent: true }), 'pwsh')
    await hitsAfter(row, 3)
    const [reminder, ...more] = await row.step()
    assert.equal(more.length, 0)
    assert.equal(reminder?.source.kind, RECUR_SOURCE)
    assert.ok(reminder?.content[0].text.includes('Lesson L-100000 matched failures in 3 sessions in the last 28 days'), reminder?.content[0].text)
    await call(row, agentOf('worker-4', { cwd: WORK, subagent: true }), 'pwsh')
    await hitsAfter(row, 4)
    assert.deepEqual(kinds(await row.step()), [], 'recorded: not again within 28 days')
  })
})
